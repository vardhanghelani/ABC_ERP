import type { CategoryField } from '@/types'
import { Input } from '@/components/ui/input'
import { IntegerInput, MoneyInput } from '@/components/ui/number-input'
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
    const num = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10)
    return (
      <IntegerInput
        min={0}
        className={inputClass}
        value={Number.isFinite(num) ? num : 0}
        onChange={(v) => onChange(v === 0 && value === '' ? '' : v)}
        placeholder={placeholder || 'Whole number'}
      />
    )
  }

  if (field.fieldType === 'decimal') {
    const num = typeof value === 'number' ? value : parseFloat(String(value ?? ''))
    return (
      <MoneyInput
        className={inputClass}
        value={Number.isFinite(num) ? num : 0}
        onChange={(v) => onChange(v === 0 && value === '' ? '' : v)}
        placeholder={placeholder || 'Decimal number'}
      />
    )
  }

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
