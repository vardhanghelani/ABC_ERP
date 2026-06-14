import type { FieldType } from '@/types'

/** Primary types for jewellery specs — string, whole number, decimal */
export type PrimaryFieldType = 'text' | 'integer' | 'decimal'

export const PRIMARY_FIELD_TYPES: { value: PrimaryFieldType; label: string; hint: string }[] = [
  { value: 'text', label: 'String (Text)', hint: 'Names, colors, grades, sizes as text' },
  { value: 'integer', label: 'Whole Number (Integer)', hint: 'Count, naka, pieces — no decimals' },
  { value: 'decimal', label: 'Decimal Number (Float)', hint: 'Weight, length, mm — allows decimals' },
]

export const nameToFieldKey = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50)

export interface InlineFieldDraft {
  id: string
  name: string
  fieldType: PrimaryFieldType
  required: boolean
}

export const newFieldDraft = (): InlineFieldDraft => ({
  id: crypto.randomUUID(),
  name: '',
  fieldType: 'text',
  required: false,
})

export const fieldTypeLabel = (type: FieldType | string): string => {
  switch (type) {
    case 'text':
    case 'color':
    case 'dropdown':
    case 'multiselect':
    case 'date':
    case 'boolean':
      return 'String'
    case 'integer':
    case 'number':
      return 'Integer'
    case 'decimal':
      return 'Decimal'
    default:
      return 'String'
  }
}

export const isNumericField = (type: FieldType | string): boolean =>
  type === 'integer' || type === 'decimal' || type === 'number'

export const validateAttributesClient = (
  fields: { key: string; name: string; fieldType: FieldType; required: boolean }[],
  attributes: Record<string, unknown>
): string | null => {
  for (const field of fields) {
    const raw = attributes[field.key]
    const blank = raw === undefined || raw === null || raw === ''

    if (field.required && blank) {
      return `${field.name} is required`
    }
    if (blank) continue

    if (field.fieldType === 'integer' || field.fieldType === 'number') {
      const n = Number(raw)
      if (Number.isNaN(n) || !Number.isInteger(n)) {
        return `${field.name} must be a whole number`
      }
    }
    if (field.fieldType === 'decimal') {
      const n = Number(raw)
      if (Number.isNaN(n)) {
        return `${field.name} must be a valid number`
      }
    }
  }
  return null
}
