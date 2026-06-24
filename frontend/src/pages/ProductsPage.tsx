import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, fetchApi, postApi, putApi, deleteApi, downloadAuthenticated } from '@/lib/api'
import type { Product, Category, CategoryField } from '@/types'
import { invalidateProductQueries } from '@/lib/productQueries'
import { fieldTypeLabel, validateAttributesClient } from '@/lib/fieldBuilder'
import { DynamicFieldInput, fieldTypeHint } from '@/components/products/DynamicFieldInput'
import {
  CategoryFieldForm,
  CategoryFieldRow,
  emptyFieldForm,
  fieldToForm,
  type FieldFormValues,
} from '@/components/products/CategoryFieldCRUD'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { IntegerInput, MoneyInput } from '@/components/ui/number-input'
import { roundInteger, roundMoney } from '@/lib/numbers'
import { Badge, stockStatusVariant, stockStatusLabel } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { SearchInput } from '@/components/ui/search-input'
import {
  ImportantField,
  ImportantSection,
  importantInputClass,
  importantLabelClass,
  importantSelectClass,
  importantTableCellClass,
  importantTableHeadClass,
} from '@/components/ui/important-field'
import { Card } from '@/components/ui/card'
import { StockBar } from '@/components/ui/stock-bar'
import { Drawer } from '@/components/ui/modal'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DataTableWrapper,
} from '@/components/ui/table'
import { Plus, Download, Settings2, Pencil, Trash2, Archive } from 'lucide-react'
import { ProductSpecBadges } from '@/components/pos/ProductSpecBadges'
import { ProductBarcodeLabel } from '@/components/products/ProductBarcodeLabel'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

const emptyForm = () => ({
  name: '',
  category: '',
  openingStock: 0,
  minStock: 0,
  minimumBunch: 1,
  sellingPrice: 0,
  attributes: {} as Record<string, unknown>,
})

const getCategoryId = (product: Product): string => {
  if (!product.category) return ''
  return typeof product.category === 'string' ? product.category : product.category._id
}

export default function ProductsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [categoryFields, setCategoryFields] = useState<CategoryField[]>([])
  const [fieldPanel, setFieldPanel] = useState<'hidden' | 'create' | 'edit' | 'manage'>('hidden')
  const [editingField, setEditingField] = useState<CategoryField | null>(null)
  const [fieldForm, setFieldForm] = useState<FieldFormValues>(emptyFieldForm())
  const [form, setForm] = useState(emptyForm())
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', 'active', search],
    queryFn: async () => {
      const { data } = await api.get('/products', { params: { search, status: 'active', limit: 50 } })
      return data
    },
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchApi<Category[]>('/categories'),
  })

  const loadCategoryFields = async (categoryId: string) => {
    const cat = await fetchApi<Category>(`/categories/${categoryId}`)
    const fields = (cat.fields || []).filter((f) => f.isActive !== false)
    setCategoryFields(fields)
    const allowedKeys = new Set(fields.map((f) => f.key))
    setForm((prev) => {
      const attributes: Record<string, unknown> = {}
      for (const key of allowedKeys) {
        if (prev.attributes[key] !== undefined) attributes[key] = prev.attributes[key]
      }
      return {
        ...emptyForm(),
        category: categoryId,
        name: prev.name,
        openingStock: prev.openingStock,
        minStock: prev.minStock,
        minimumBunch: prev.minimumBunch,
        sellingPrice: prev.sellingPrice,
        attributes,
      }
    })
    setFieldPanel('hidden')
    setEditingField(null)
    setFieldForm(emptyFieldForm())
  }

  const resetFieldPanel = () => {
    setFieldPanel('hidden')
    setEditingField(null)
    setFieldForm(emptyFieldForm())
  }

  const createField = useMutation({
    mutationFn: () =>
      postApi<CategoryField>(`/categories/${form.category}/fields`, {
        name: fieldForm.name.trim(),
        fieldType: fieldForm.fieldType,
        required: fieldForm.required,
        placeholder: fieldForm.placeholder || undefined,
      }),
    onSuccess: async () => {
      await loadCategoryFields(form.category)
      resetFieldPanel()
      toast.success('Field created')
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Failed to create field'),
  })

  const updateField = useMutation({
    mutationFn: () =>
      putApi(`/categories/${form.category}/fields/${editingField!._id}`, {
        name: fieldForm.name.trim(),
        fieldType: fieldForm.fieldType,
        required: fieldForm.required,
        placeholder: fieldForm.placeholder || undefined,
      }),
    onSuccess: async () => {
      await loadCategoryFields(form.category)
      resetFieldPanel()
      toast.success('Field updated')
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Failed to update field'),
  })

  const deleteField = useMutation({
    mutationFn: (fieldId: string) => deleteApi(`/categories/${form.category}/fields/${fieldId}`),
    onSuccess: async () => {
      await loadCategoryFields(form.category)
      toast.success('Field deleted')
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Failed to delete field'),
  })

  const handleDeleteField = (field: CategoryField) => {
    if (!window.confirm(`Delete field "${field.name}"? Blocked if products already use it.`)) return
    deleteField.mutate(field._id)
  }

  const createProduct = useMutation({
    mutationFn: (data: typeof form) => postApi('/products', data),
    onSuccess: () => {
      invalidateProductQueries(queryClient)
      closeDrawer()
      toast.success('Product created')
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Failed'),
  })

  const updateProduct = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Omit<typeof form, 'openingStock'> }) =>
      putApi(`/products/${id}`, data),
    onSuccess: () => {
      invalidateProductQueries(queryClient)
      closeDrawer()
      toast.success('Product updated')
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Failed to update product'),
  })

  const deactivateProduct = useMutation({
    mutationFn: (id: string) => deleteApi(`/products/${id}`),
    onSuccess: () => {
      invalidateProductQueries(queryClient)
      toast.success('Product deactivated')
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Failed to deactivate product'),
  })

  const handleSubmit = () => {
    const validationError = validateAttributesClient(categoryFields, form.attributes)
    if (validationError) {
      toast.error(validationError)
      return
    }
    const allowedKeys = new Set(categoryFields.map((f) => f.key))
    const attributes = Object.fromEntries(
      Object.entries(form.attributes).filter(([key]) => allowedKeys.has(key))
    )
    const payload = {
      name: form.name,
      category: form.category,
      minStock: roundInteger(form.minStock),
      minimumBunch: Math.max(1, roundInteger(form.minimumBunch)),
      sellingPrice: roundMoney(form.sellingPrice),
      attributes,
    }
    if (editingProduct) {
      updateProduct.mutate({ id: editingProduct._id, data: payload })
    } else {
      createProduct.mutate({ ...form, attributes })
    }
  }

  const openCreate = () => {
    setEditingProduct(null)
    setForm(emptyForm())
    setCategoryFields([])
    resetFieldPanel()
    setShowForm(true)
  }

  const openEdit = async (product: Product) => {
    const categoryId = getCategoryId(product)
    if (!categoryId) {
      toast.error('This product has no category — assign one in the database or recreate the product')
      return
    }
    setEditingProduct(product)
    setShowForm(true)
    resetFieldPanel()
    const cat = await fetchApi<Category>(`/categories/${categoryId}`)
    const fields = (cat.fields || []).filter((f) => f.isActive !== false)
    setCategoryFields(fields)
    const attrs = product.attributes || {}
    setForm({
      name: product.name,
      category: categoryId,
      openingStock: 0,
      minStock: roundInteger(product.minStock ?? 0),
      minimumBunch: Math.max(1, roundInteger(product.minimumBunch ?? 1)),
      sellingPrice: roundMoney(product.sellingPrice ?? 0),
      attributes: { ...attrs },
    })
  }

  const handleDeactivate = (product: Product) => {
    if (!window.confirm(`Deactivate "${product.name}"?\n\nIt will be hidden from POS and active lists. Stock history is kept.`)) return
    deactivateProduct.mutate(product._id)
  }

  const exportProducts = () => {
    downloadAuthenticated('/export/products', 'products.xlsx').catch(() =>
      toast.error('Export failed — check you are logged in')
    )
  }

  const closeDrawer = () => {
    setShowForm(false)
    setEditingProduct(null)
    setForm(emptyForm())
    setCategoryFields([])
    resetFieldPanel()
  }

  const products: Product[] = productsData?.data || []
  const selectedCategoryName = categories.find((c) => c._id === form.category)?.name

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Add products with category-specific specs — fields are String, Whole Number, or Decimal"
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/products/inactive')}>
              <Archive className="h-[18px] w-[18px]" /> Inactive Products
            </Button>
            <Button variant="secondary" onClick={exportProducts}>
              <Download className="h-[18px] w-[18px]" /> Export
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-[18px] w-[18px]" /> Add Product
            </Button>
          </>
        }
      />

      <ImportantField label="Search Products" variant="primary" compact className="max-w-md">
        <SearchInput
          placeholder="Search by name, SKU, barcode..."
          value={search}
          onChange={setSearch}
          className={`${importantInputClass} h-11`}
        />
      </ImportantField>

      <Drawer
        open={showForm}
        onClose={closeDrawer}
        title={editingProduct ? 'Edit Product' : 'Add New Product'}
        wide
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeDrawer}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.name || !form.category}
              loading={createProduct.isPending || updateProduct.isPending}
            >
              {editingProduct ? 'Save Changes' : 'Create Product'}
            </Button>
          </div>
        }
      >
        {editingProduct && (
          <>
            <div className="mb-4 flex flex-wrap gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-soft)] bg-[var(--color-bg-sunken)] px-4 py-3 text-[var(--text-sm)]">
              <span><strong>SKU:</strong> {editingProduct.sku}</span>
              <span><strong>Current stock:</strong> {editingProduct.currentStock?.toLocaleString('en-IN') ?? 0} pcs</span>
              <span className="text-[var(--color-text-muted)]">Change stock via Stock Movements or Purchase Receive</span>
            </div>
            <div className="mb-5">
              <ProductBarcodeLabel productId={editingProduct._id} />
            </div>
          </>
        )}
        <p className="mb-5 text-[var(--text-sm)] text-[var(--color-text-muted)]">
          Select category first — its specification fields appear automatically. You can add new fields without leaving this form.
        </p>

        <ImportantSection
          title="Key Product Details"
          description="Name, category, stock, bunch size, and selling price — used directly in POS."
          className="mb-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={importantLabelClass}>Product Name *</label>
              <Input
                className={importantInputClass}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className={importantLabelClass}>Category *</label>
              <Select
                className={importantSelectClass}
                value={form.category}
                onChange={(e) => loadCategoryFields(e.target.value)}
                disabled={!!editingProduct}
              >
                <option value="">Select Category</option>
                {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </Select>
              {editingProduct && (
                <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-muted)]">Category cannot be changed after creation.</p>
              )}
            </div>
            {!editingProduct && (
            <div>
              <label className={importantLabelClass}>Opening Stock</label>
              <IntegerInput
                min={0}
                className={importantInputClass}
                value={form.openingStock}
                onChange={(v) => setForm({ ...form, openingStock: v })}
                placeholder="How many units you have now"
              />
              <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-secondary)]">
                Actual quantity on hand. Leave 0 if you will add stock later via Purchase or Stock Movements.
              </p>
            </div>
            )}
            <div>
              <label className={importantLabelClass}>Minimum Bunch</label>
              <IntegerInput
                min={1}
                className={importantInputClass}
                value={form.minimumBunch}
                onChange={(v) => setForm({ ...form, minimumBunch: Math.max(1, v) })}
                placeholder="e.g. 1000 for 1K packet"
              />
              <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-secondary)]">
                Smallest sale step in pieces. AD stones: use 1000 (1K), 2000 (2K), 10000 (10K). Use 1 for normal items.
              </p>
            </div>
            <div className={!editingProduct ? '' : 'sm:col-span-2'}>
              <label className={importantLabelClass}>Selling Price (per piece)</label>
              <MoneyInput
                className={importantInputClass}
                value={form.sellingPrice}
                onChange={(v) => setForm({ ...form, sellingPrice: v })}
                placeholder="Price per piece at counter"
              />
              <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-secondary)]">
                Used in POS. Line total = quantity × selling price per piece.
              </p>
            </div>
          </div>
        </ImportantSection>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Min Stock (alert level)</Label>
            <IntegerInput
              min={0}
              value={form.minStock}
              onChange={(v) => setForm({ ...form, minStock: v })}
              placeholder="Low stock warning threshold"
            />
            <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-muted)]">
              Not your current stock — only used for low-stock alerts.
            </p>
          </div>
        </div>

        {form.category && (
          <div className="mt-6 rounded-[var(--radius-md)] border border-[var(--color-border-soft)] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold flex items-center gap-2 text-[var(--color-text-primary)]">
                  <Settings2 className="h-[18px] w-[18px]" />
                  Specifications — {selectedCategoryName}
                </h3>
                <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">{categoryFields.length} field(s)</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => { setFieldForm(emptyFieldForm()); setFieldPanel('create') }}>
                  <Plus className="h-[18px] w-[18px]" /> Add Field
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setFieldPanel(fieldPanel === 'manage' ? 'hidden' : 'manage')}>
                  <Pencil className="h-[18px] w-[18px]" /> Manage
                </Button>
              </div>
            </div>

            {(fieldPanel === 'create' || fieldPanel === 'edit') && (
              <CategoryFieldForm
                values={fieldForm}
                onChange={setFieldForm}
                onSubmit={() => (fieldPanel === 'edit' ? updateField.mutate() : createField.mutate())}
                onCancel={resetFieldPanel}
                submitLabel={fieldPanel === 'edit' ? 'Save Changes' : 'Create Field'}
                isPending={createField.isPending || updateField.isPending}
                existingKey={editingField?.key}
              />
            )}

            {fieldPanel === 'manage' && categoryFields.length > 0 && (
              <Card className="overflow-hidden shadow-none">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Required</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoryFields.map((field) => (
                      <CategoryFieldRow
                        key={field._id}
                        field={field}
                        onEdit={() => {
                          setEditingField(field)
                          setFieldForm(fieldToForm(field))
                          setFieldPanel('edit')
                        }}
                        onDelete={() => handleDeleteField(field)}
                        deletePending={deleteField.isPending}
                      />
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}

            {categoryFields.length === 0 ? (
              <p className="text-[var(--text-sm)] text-[var(--color-text-muted)] py-4 text-center">
                No specification fields yet. Add fields in Category Builder or use &quot;Add Field&quot; above.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {categoryFields.map((field) => (
                  <div key={field._id}>
                    <Label className="flex items-center gap-2 flex-wrap">
                      {field.name}
                      {field.required && <span className="text-[var(--color-danger)]">*</span>}
                      <Badge variant="muted" className="normal-case tracking-normal">{fieldTypeLabel(field.fieldType)}</Badge>
                    </Label>
                    <DynamicFieldInput
                      field={field}
                      value={form.attributes[field.key]}
                      onChange={(val) => setForm({ ...form, attributes: { ...form.attributes, [field.key]: val } })}
                    />
                    {fieldTypeHint(field) && (
                      <p className="text-[var(--text-xs)] text-[var(--color-text-muted)] mt-1">{fieldTypeHint(field)}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Drawer>

      <Card className="overflow-hidden">
        <DataTableWrapper loading={isLoading} empty={!isLoading && products.length === 0} emptyTitle="No products found" emptyAction="Add Product" onEmptyAction={openCreate}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead className={importantTableHeadClass}>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Specs</TableHead>
                <TableHead className={importantTableHeadClass}>Stock</TableHead>
                <TableHead align="right" className={importantTableHeadClass}>Selling / pc</TableHead>
                <TableHead align="center" className={importantTableHeadClass}>Min Bunch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead align="right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell><Badge variant="muted">{p.sku}</Badge></TableCell>
                    <TableCell className={`font-medium ${importantTableCellClass}`}>{p.name}</TableCell>
                    <TableCell>
                      {p.category && typeof p.category === 'object' ? p.category.name : '-'}
                    </TableCell>
                    <TableCell>
                      <ProductSpecBadges product={p} size="sm" showLabels />
                    </TableCell>
                    <TableCell className={importantTableCellClass}>
                      <StockBar current={p.currentStock} max={p.reorderLevel * 3} />
                    </TableCell>
                    <TableCell align="right" mono className={importantTableCellClass}>{formatCurrency(p.sellingPrice || p.wholesalePrice)}</TableCell>
                    <TableCell align="center" mono className={importantTableCellClass}>{p.minimumBunch ?? 1}</TableCell>
                    <TableCell>
                      <Badge variant={stockStatusVariant(p.currentStock, p.reorderLevel)}>
                        {stockStatusLabel(p.currentStock, p.reorderLevel)}
                      </Badge>
                    </TableCell>
                    <TableCell align="right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="secondary" iconOnly title="Edit product" onClick={() => openEdit(p)}>
                          <Pencil className="h-[18px] w-[18px]" />
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          iconOnly
                          title="Deactivate product"
                          onClick={() => handleDeactivate(p)}
                          disabled={deactivateProduct.isPending}
                        >
                          <Trash2 className="h-[18px] w-[18px]" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </DataTableWrapper>
      </Card>
    </div>
  )
}
