import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi, postApi } from '@/lib/api'
import type { Customer } from '@/types'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { UserPlus, X, User } from 'lucide-react'
import { toast } from 'sonner'

interface PosCustomerPickerProps {
  value: Customer | null
  onChange: (customer: Customer | null) => void
  required?: boolean
  allowWalkIn?: boolean
}

const normalizePhone = (phone: string) => phone.replace(/\D/g, '')

const namesMatch = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function PosCustomerPicker({
  value,
  onChange,
  required = false,
  allowWalkIn = true,
}: PosCustomerPickerProps) {
  const queryClient = useQueryClient()
  const [nameQuery, setNameQuery] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const searchTerm = nameQuery.trim()
  const { data: matches = [], isFetching } = useQuery({
    queryKey: ['customers-picker', searchTerm],
    queryFn: () =>
      fetchApi<Customer[]>('/customers/picker', { search: searchTerm || undefined, limit: 30 }),
    enabled: searchTerm.length >= 2 && !value,
    staleTime: 60_000,
  })

  const exactMatch = matches.find((c) => namesMatch(c.name, searchTerm))

  const createCustomer = useMutation({
    mutationFn: () =>
      postApi<Customer>('/customers', {
        name: searchTerm,
        phone: normalizePhone(newPhone),
        customerType: 'wholesale',
        creditTermType: 'short_term',
        creditLimit: 0,
        creditDays: 30,
        blockOnCreditLimit: false,
      }),
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['customers-pos'] })
      queryClient.invalidateQueries({ queryKey: ['pos-customer-search'] })
      onChange(customer)
      setNameQuery('')
      setNewPhone('')
      setShowCreate(false)
      toast.success(`${customer.name} added to customers`)
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message || 'Failed to create customer'),
  })

  const selectCustomer = (customer: Customer) => {
    onChange(customer)
    setNameQuery('')
    setNewPhone('')
    setShowCreate(false)
  }

  const clearCustomer = () => {
    onChange(null)
    setNameQuery('')
    setNewPhone('')
    setShowCreate(false)
  }

  const phoneDigits = normalizePhone(newPhone)
  const canCreate = searchTerm.length >= 2 && phoneDigits.length >= 10 && !createCustomer.isPending

  if (value) {
    return (
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border-soft)] bg-[var(--color-bg-sunken)] p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <User className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
              <span className="font-medium text-[var(--color-text-primary)]">{value.name}</span>
              <Badge variant={value.creditTermType === 'long_term' ? 'default' : 'muted'} className="normal-case tracking-normal">
                {value.creditTermType === 'long_term' ? 'ACC' : 'Credit'}
              </Badge>
            </div>
            <p className="mt-1 text-[var(--text-sm)] text-[var(--color-text-muted)]">{value.phone}</p>
          </div>
          <Button type="button" size="sm" variant="ghost" iconOnly title="Change customer" onClick={clearCustomer}>
            <X className="h-[18px] w-[18px]" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <Label>Customer name {required && '*'}</Label>
        <Input
          className="h-11"
          placeholder={required ? 'Type name to find or add customer...' : 'Optional — type name to link sale...'}
          value={nameQuery}
          onChange={(e) => {
            setNameQuery(e.target.value)
            setShowCreate(false)
          }}
        />
        {allowWalkIn && !required && searchTerm.length === 0 && (
          <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-muted)]">Leave empty for walk-in customer.</p>
        )}
        {required && !value && searchTerm.length === 0 && (
          <p className="mt-1 text-[var(--text-xs)] text-[var(--color-danger)]">Enter customer name for credit sale.</p>
        )}
      </div>

      {searchTerm.length >= 2 && (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border-soft)] overflow-hidden">
          {isFetching && (
            <p className="p-3 text-[var(--text-sm)] text-[var(--color-text-muted)]">Searching...</p>
          )}

          {!isFetching && matches.length > 0 && (
            <div className="max-h-40 overflow-y-auto">
              {exactMatch && (
                <p className="border-b border-[var(--color-border-soft)] bg-[var(--color-success-light)] px-3 py-1.5 text-[var(--text-xs)] text-[var(--color-success)]">
                  Exact match found — select to use existing customer
                </p>
              )}
              {matches.map((c) => (
                <button
                  key={c._id}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 border-b border-[var(--color-border-soft)] px-3 py-2.5 text-left last:border-0 hover:bg-[var(--color-bg-elevated)]"
                  onClick={() => selectCustomer(c)}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--color-text-primary)]">{c.name}</p>
                    <p className="text-[var(--text-xs)] text-[var(--color-text-muted)]">{c.phone}</p>
                  </div>
                  {namesMatch(c.name, searchTerm) && (
                    <Badge variant="success" className="normal-case tracking-normal shrink-0">Match</Badge>
                  )}
                </button>
              ))}
            </div>
          )}

          {!isFetching && matches.length === 0 && !showCreate && (
            <div className="p-3 space-y-2">
              <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">No customer named &quot;{searchTerm}&quot;.</p>
              <Button type="button" size="sm" variant="secondary" onClick={() => setShowCreate(true)}>
                <UserPlus className="h-[18px] w-[18px]" /> Add new credit customer
              </Button>
            </div>
          )}

          {!isFetching && matches.length > 0 && !exactMatch && !showCreate && (
            <div className="border-t border-[var(--color-border-soft)] p-2">
              <Button type="button" size="sm" variant="ghost" className="w-full justify-start" onClick={() => setShowCreate(true)}>
                <UserPlus className="h-[18px] w-[18px]" /> Add &quot;{searchTerm}&quot; as new customer
              </Button>
            </div>
          )}

          {showCreate && (
            <div className="border-t border-[var(--color-border-soft)] bg-[var(--color-bg-sunken)] p-3 space-y-3">
              <p className="text-[var(--text-sm)] font-medium text-[var(--color-text-primary)]">New credit customer</p>
              <div>
                <Label>Name</Label>
                <Input value={searchTerm} readOnly className="bg-[var(--color-bg-surface)]" />
              </div>
              <div>
                <Label>Phone *</Label>
                <Input
                  type="tel"
                  placeholder="10-digit mobile number"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  autoFocus
                />
              </div>
              <p className="text-[var(--text-xs)] text-[var(--color-text-muted)]">
                Saved to Customers list with short-term credit. Set credit limit later in Customers page.
              </p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!canCreate}
                  loading={createCustomer.isPending}
                  onClick={() => createCustomer.mutate()}
                >
                  Create &amp; Select
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
