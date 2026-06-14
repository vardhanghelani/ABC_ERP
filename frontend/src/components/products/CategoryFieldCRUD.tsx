import type { CategoryField } from '@/types'
import type { PrimaryFieldType } from '@/lib/fieldBuilder'
import { fieldTypeLabel, nameToFieldKey, PRIMARY_FIELD_TYPES } from '@/lib/fieldBuilder'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { TableCell, TableRow } from '@/components/ui/table'
import { Pencil, Trash2 } from 'lucide-react'

export interface FieldFormValues {
  name: string
  fieldType: PrimaryFieldType
  required: boolean
  placeholder: string
}

export const emptyFieldForm = (): FieldFormValues => ({
  name: '',
  fieldType: 'text',
  required: false,
  placeholder: '',
})

export const fieldToForm = (field: CategoryField): FieldFormValues => {
  let fieldType: PrimaryFieldType = 'text'
  if (field.fieldType === 'integer' || field.fieldType === 'number') fieldType = 'integer'
  else if (field.fieldType === 'decimal') fieldType = 'decimal'
  else fieldType = 'text'

  return {
    name: field.name,
    fieldType,
    required: field.required,
    placeholder: field.placeholder || '',
  }
}

interface CategoryFieldFormProps {
  values: FieldFormValues
  onChange: (values: FieldFormValues) => void
  onSubmit: () => void
  onCancel: () => void
  submitLabel: string
  isPending?: boolean
  existingKey?: string
}

export function CategoryFieldForm({
  values,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  isPending,
  existingKey,
}: CategoryFieldFormProps) {
  return (
    <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Field Name *</Label>
          <Input
            className="h-10 mt-1"
            value={values.name}
            onChange={(e) => onChange({ ...values, name: e.target.value })}
            placeholder="e.g. Size, Weight, Color"
          />
          {existingKey ? (
            <p className="text-xs text-muted-foreground mt-1 font-mono">key: {existingKey} (fixed — used in products)</p>
          ) : values.name ? (
            <p className="text-xs text-muted-foreground mt-1 font-mono">key: {nameToFieldKey(values.name)}</p>
          ) : null}
        </div>
        <div>
          <Label>Data Type *</Label>
          <Select
            className="h-10 mt-1"
            value={values.fieldType}
            onChange={(e) => onChange({ ...values, fieldType: e.target.value as PrimaryFieldType })}
          >
            {PRIMARY_FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label>Placeholder (optional)</Label>
          <Input
            className="h-10 mt-1"
            value={values.placeholder}
            onChange={(e) => onChange({ ...values, placeholder: e.target.value })}
            placeholder="Hint shown when adding product"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.required}
          onChange={(e) => onChange({ ...values, required: e.target.checked })}
        />
        Required when adding products
      </label>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSubmit} disabled={!values.name.trim() || isPending}>
          {isPending ? 'Saving...' : submitLabel}
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

interface CategoryFieldRowProps {
  field: CategoryField
  onEdit: () => void
  onDelete: () => void
  deletePending?: boolean
}

export function CategoryFieldRow({ field, onEdit, onDelete, deletePending }: CategoryFieldRowProps) {
  return (
    <TableRow>
      <TableCell className="font-medium">{field.name}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">{field.key}</TableCell>
      <TableCell><Badge variant="muted" className="normal-case tracking-normal">{fieldTypeLabel(field.fieldType)}</Badge></TableCell>
      <TableCell>{field.required ? 'Yes' : 'No'}</TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" iconOnly onClick={onEdit} title="Edit field">
            <Pencil className="h-[18px] w-[18px]" />
          </Button>
          <Button size="sm" variant="danger" iconOnly onClick={onDelete} disabled={deletePending} title="Delete field">
            <Trash2 className="h-[18px] w-[18px]" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
