import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi, postApi, putApi, deleteApi } from '@/lib/api'
import type { Category, CategoryField } from '@/types'
import type { InlineFieldDraft } from '@/lib/fieldBuilder'
import { newFieldDraft } from '@/lib/fieldBuilder'
import { InlineFieldBuilder } from '@/components/products/InlineFieldBuilder'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Drawer } from '@/components/ui/modal'
import { Alert } from '@/components/ui/alert'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, DataTableWrapper,
} from '@/components/ui/table'
import { Plus, Tags, Settings2 } from 'lucide-react'
import { toast } from 'sonner'

export default function CategoriesPage() {
  const queryClient = useQueryClient()
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [fieldMode, setFieldMode] = useState<'list' | 'create' | 'edit'>('list')
  const [editingField, setEditingField] = useState<CategoryField | null>(null)
  const [form, setForm] = useState({ name: '', code: '', description: '' })
  const [inlineFields, setInlineFields] = useState<InlineFieldDraft[]>([newFieldDraft()])
  const [fieldForm, setFieldForm] = useState<FieldFormValues>(emptyFieldForm())

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => fetchApi<Category[]>('/categories'),
  })

  const { data: categoryDetail } = useQuery({
    queryKey: ['category', selectedCategory],
    queryFn: () => fetchApi<Category>(`/categories/${selectedCategory}`),
    enabled: !!selectedCategory,
  })

  const invalidateFields = () => {
    queryClient.invalidateQueries({ queryKey: ['category', selectedCategory] })
    queryClient.invalidateQueries({ queryKey: ['categories'] })
  }

  const resetFieldPanel = () => {
    setFieldMode('list')
    setEditingField(null)
    setFieldForm(emptyFieldForm())
  }

  const createCategory = useMutation({
    mutationFn: () => {
      const fields = inlineFields
        .filter((f) => f.name.trim())
        .map(({ name, fieldType, required }) => ({ name: name.trim(), fieldType, required }))
      return postApi('/categories', { ...form, fields })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setShowForm(false)
      setForm({ name: '', code: '', description: '' })
      setInlineFields([newFieldDraft()])
      toast.success('Category and fields created')
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Failed to create category'),
  })

  const createField = useMutation({
    mutationFn: () =>
      postApi(`/categories/${selectedCategory}/fields`, {
        name: fieldForm.name.trim(),
        fieldType: fieldForm.fieldType,
        required: fieldForm.required,
        placeholder: fieldForm.placeholder || undefined,
      }),
    onSuccess: () => {
      invalidateFields()
      resetFieldPanel()
      toast.success('Field created')
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Failed to create field'),
  })

  const updateField = useMutation({
    mutationFn: () =>
      putApi(`/categories/${selectedCategory}/fields/${editingField!._id}`, {
        name: fieldForm.name.trim(),
        fieldType: fieldForm.fieldType,
        required: fieldForm.required,
        placeholder: fieldForm.placeholder || undefined,
      }),
    onSuccess: () => {
      invalidateFields()
      resetFieldPanel()
      toast.success('Field updated')
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Failed to update field'),
  })

  const deleteField = useMutation({
    mutationFn: (fieldId: string) => deleteApi(`/categories/${selectedCategory}/fields/${fieldId}`),
    onSuccess: () => {
      invalidateFields()
      toast.success('Field deleted')
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Failed to delete field'),
  })

  const handleDeleteField = (field: CategoryField) => {
    if (!window.confirm(`Delete field "${field.name}"? This cannot be undone if products use it.`)) return
    deleteField.mutate(field._id)
  }

  const startEdit = (field: CategoryField) => {
    setEditingField(field)
    setFieldForm(fieldToForm(field))
    setFieldMode('edit')
  }

  const validInlineFields = inlineFields.filter((f) => f.name.trim())

  return (
    <div className="space-y-6">
      <PageHeader
        title="Category Builder"
        description="Create categories and manage specification fields — full Create, Read, Update, Delete"
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-[18px] w-[18px]" /> New Category
          </Button>
        }
      />

      <Drawer
        open={showForm}
        onClose={() => { setShowForm(false); setInlineFields([newFieldDraft()]) }}
        title="Create Category + Specification Fields"
        wide
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setShowForm(false); setInlineFields([newFieldDraft()]) }}>Cancel</Button>
            <Button onClick={() => createCategory.mutate()} disabled={!form.name || !form.code} loading={createCategory.isPending}>
              Create Category{validInlineFields.length > 0 ? ` + ${validInlineFields.length} Field(s)` : ''}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3 mb-6">
          <div><Label>Category Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. AD Stones" /></div>
          <div><Label>Code *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. ADS" maxLength={10} /></div>
          <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
        {form.code && form.code !== 'CHN' && (
          <Alert variant="info" title="Specification fields" description="Add only the fields you need — each appears as plain text or number when adding products." className="mb-4" />
        )}
        <InlineFieldBuilder fields={inlineFields} onChange={setInlineFields} />
      </Drawer>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Tags className="h-[18px] w-[18px]" /> Categories</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DataTableWrapper loading={isLoading} empty={!isLoading && categories.length === 0}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead align="center">Fields</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((cat) => (
                    <TableRow key={cat._id} selected={selectedCategory === cat._id} onClick={() => { setSelectedCategory(cat._id); resetFieldPanel() }}>
                      <TableCell className="font-medium">{cat.name}</TableCell>
                      <TableCell><Badge variant="muted">{cat.code}</Badge></TableCell>
                      <TableCell><Badge variant={cat.isActive ? 'success' : 'danger'}>{cat.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                      <TableCell align="center">
                        <Button size="sm" variant="ghost" iconOnly onClick={(e) => { e.stopPropagation(); setSelectedCategory(cat._id); resetFieldPanel() }}>
                          <Settings2 className="h-[18px] w-[18px]" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DataTableWrapper>
          </CardContent>
        </Card>

        {selectedCategory && categoryDetail && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Fields — {categoryDetail.name}</CardTitle>
              {fieldMode === 'list' && (
                <Button size="sm" onClick={() => { setFieldForm(emptyFieldForm()); setFieldMode('create') }}>
                  <Plus className="h-[18px] w-[18px]" /> Add Field
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {fieldMode === 'create' && (
                <div className="mb-4">
                  <CategoryFieldForm
                    values={fieldForm}
                    onChange={setFieldForm}
                    onSubmit={() => createField.mutate()}
                    onCancel={resetFieldPanel}
                    submitLabel="Create Field"
                    isPending={createField.isPending}
                  />
                </div>
              )}
              {fieldMode === 'edit' && editingField && (
                <div className="mb-4">
                  <CategoryFieldForm
                    values={fieldForm}
                    onChange={setFieldForm}
                    onSubmit={() => updateField.mutate()}
                    onCancel={resetFieldPanel}
                    submitLabel="Save Changes"
                    isPending={updateField.isPending}
                    existingKey={editingField.key}
                  />
                </div>
              )}
              {fieldMode === 'list' && (
                <DataTableWrapper empty={!categoryDetail.fields?.length} emptyTitle="No fields — click Add Field">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field Name</TableHead>
                        <TableHead>Key</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Required</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryDetail.fields?.map((field: CategoryField) => (
                        <CategoryFieldRow
                          key={field._id}
                          field={field}
                          onEdit={() => startEdit(field)}
                          onDelete={() => handleDeleteField(field)}
                          deletePending={deleteField.isPending}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </DataTableWrapper>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
