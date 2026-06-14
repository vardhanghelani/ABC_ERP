import type { CategoryField } from '@/types'
import { Input } from '@/components/ui/input'
import { isNumericField } from '@/lib/fieldBuilder'

interface DynamicFieldInputProps {
  field: CategoryField
  value: unknown
  onChange: (value: unknown) => void
  className?: string
}

/** Renders category fields as plain inputs — text, whole number, or decimal only. */
export function DynamicFieldInput({ field, value, onChange, className }: DynamicFieldInputProps) {
  const inputClass = className || 'h-11'
  const placeholder = field.placeholder || field.name

  if (field.fieldType === 'integer' || field.fieldType === 'number') {
    return (
      <Input
        type="number"
        step={1}
        className={inputClass}
        value={value === undefined || value === null ? '' : String(value)}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === '' ? '' : parseInt(v, 10))
        }}
        placeholder={placeholder || 'Whole number'}
      />
    )
  }

  if (field.fieldType === 'decimal') {
    return (
      <Input
        type="number"
        step="any"
        className={inputClass}
        value={value === undefined || value === null ? '' : String(value)}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === '' ? '' : parseFloat(v))
        }}
        placeholder={placeholder || 'Decimal number'}
      />
    )
  }

  // text and any legacy types (color, dropdown, date, etc.) — always free text
  return (
    <Input
      className={inputClass}
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  )
}

export function fieldTypeHint(field: CategoryField): string | null {
  if (field.fieldType === 'integer' || field.fieldType === 'number') return 'Whole number only'
  if (field.fieldType === 'decimal') return 'Allows decimals'
  if (isNumericField(field.fieldType)) return null
  return 'Enter value as text'
}
