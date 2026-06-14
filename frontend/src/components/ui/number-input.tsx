import { useEffect, useState } from 'react'
import { Input, type InputProps } from './input'
import {
  formatIntegerDraft,
  formatMoneyDraft,
  parseIntegerInput,
  parseMoneyInput,
  roundInteger,
  roundMoney,
  sanitizeIntegerDraft,
  sanitizeMoneyDraft,
} from '@/lib/numbers'

type BaseProps = Omit<InputProps, 'type' | 'value' | 'onChange' | 'inputMode'> & {
  value: number
  onChange: (value: number) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

/** Whole numbers — no browser spinner / scroll drift. */
export function IntegerInput({ value, onChange, min = 0, onBlur, ...props }: BaseProps & { min?: number }) {
  const [draft, setDraft] = useState(() => formatIntegerDraft(value))

  useEffect(() => {
    setDraft(formatIntegerDraft(value))
  }, [value])

  return (
    <Input
      {...props}
      inputMode="numeric"
      autoComplete="off"
      value={draft}
      onChange={(e) => {
        const next = sanitizeIntegerDraft(e.target.value)
        setDraft(next)
        const parsed = parseIntegerInput(next)
        onChange(Math.max(min, parsed))
      }}
      onBlur={(e) => {
        const parsed = Math.max(min, roundInteger(parseIntegerInput(draft)))
        onChange(parsed)
        setDraft(formatIntegerDraft(parsed))
        onBlur?.(e)
      }}
    />
  )
}

/** Money / decimal amounts — stable 2dp, no float surprises. */
export function MoneyInput({ value, onChange, onBlur, ...props }: BaseProps) {
  const [draft, setDraft] = useState(() => formatMoneyDraft(value))

  useEffect(() => {
    setDraft(formatMoneyDraft(value))
  }, [value])

  return (
    <Input
      {...props}
      inputMode="decimal"
      autoComplete="off"
      value={draft}
      onChange={(e) => {
        const next = sanitizeMoneyDraft(e.target.value)
        setDraft(next)
        onChange(parseMoneyInput(next))
      }}
      onBlur={(e) => {
        const parsed = roundMoney(parseMoneyInput(draft))
        onChange(parsed)
        setDraft(formatMoneyDraft(parsed))
        onBlur?.(e)
      }}
    />
  )
}
