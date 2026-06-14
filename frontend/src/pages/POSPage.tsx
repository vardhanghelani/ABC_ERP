import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { fetchApi, postApi, downloadAuthenticated } from '@/lib/api'
import type { Product, Customer } from '@/types'
import { formatBunchLabel, getMinimumBunch, getSellingPrice, snapToBunch } from '@/lib/productSales'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PosCustomerPicker } from '@/components/pos/PosCustomerPicker'
import { ProductSpecHighlight } from '@/components/pos/ProductSpecBadges'
import { ImportantField, importantInputClass, importantQtyClass } from '@/components/ui/important-field'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { Alert } from '@/components/ui/alert'
import { StockBarInline } from '@/components/ui/stock-bar'
import { formatCurrency } from '@/lib/utils'
import { Trash2, Plus, Minus, CreditCard, Banknote, Smartphone, Printer, IndianRupee, Wallet } from 'lucide-react'
import { toast } from 'sonner'

interface CartItem {
  product: Product
  quantity: number
  unitPrice: number
  discount: number
}

type PaymentMode = 'full' | 'partial' | 'credit'

export default function POSPage() {
  const searchRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 200)
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const customerId = selectedCustomer?._id ?? ''
  const [discount, setDiscount] = useState(0)
  const [taxRate, setTaxRate] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('full')
  const [paidAmount, setPaidAmount] = useState(0)
  const [lastSaleId, setLastSaleId] = useState<string | null>(null)

  useEffect(() => { searchRef.current?.focus() }, [])

  const { data: searchResults = [] } = useQuery({
    queryKey: ['pos-search', debouncedSearch],
    queryFn: () => fetchApi<Product[]>('/products/search', { q: debouncedSearch }),
    enabled: debouncedSearch.length >= 2,
    staleTime: 10_000,
  })

  const isLongTermAcc = selectedCustomer?.creditTermType === 'long_term'
  const availableCredit = selectedCustomer
    ? Math.max(0, (selectedCustomer.creditLimit || 0) - (selectedCustomer.outstandingAmount || 0))
    : 0

  useEffect(() => {
    if (!customerId && paymentMode !== 'full') setPaymentMode('full')
  }, [customerId, paymentMode])

  const handleCustomerChange = (customer: Customer | null) => {
    setSelectedCustomer(customer)
    setPaidAmount(0)
    if (!customer) setPaymentMode('full')
  }

  const addToCart = (product: Product) => {
    const step = getMinimumBunch(product)
    const unitPrice = getSellingPrice(product)

    setCart((prev) => {
      const existing = prev.find((i) => i.product._id === product._id)
      if (existing) {
        const nextQty = existing.quantity + step
        if (nextQty > product.currentStock) {
          toast.error(`Only ${product.currentStock.toLocaleString('en-IN')} pcs in stock`)
          return prev
        }
        return prev.map((i) =>
          i.product._id === product._id ? { ...i, quantity: nextQty, unitPrice } : i
        )
      }
      if (step > product.currentStock) {
        toast.error(`Need at least ${step.toLocaleString('en-IN')} pcs — only ${product.currentStock.toLocaleString('en-IN')} in stock`)
        return prev
      }
      return [...prev, { product, quantity: step, unitPrice, discount: 0 }]
    })
    setSearch('')
  }

  const stepQty = (id: string, direction: 1 | -1) => {
    setCart((prev) => prev.map((i) => {
      if (i.product._id !== id) return i
      const step = getMinimumBunch(i.product)
      const next = i.quantity + direction * step
      if (next < step) return i
      if (next > i.product.currentStock) {
        toast.error(`Only ${i.product.currentStock.toLocaleString('en-IN')} pcs in stock`)
        return i
      }
      return { ...i, quantity: next }
    }))
  }

  const setItemQuantity = (id: string, raw: string) => {
    setCart((prev) => prev.map((i) => {
      if (i.product._id !== id) return i
      if (raw === '') return { ...i, quantity: 0 }
      const parsed = Number(raw)
      if (Number.isNaN(parsed)) return i
      return { ...i, quantity: parsed }
    }))
  }

  const commitItemQuantity = (id: string) => {
    setCart((prev) => prev.map((i) => {
      if (i.product._id !== id) return i
      const step = getMinimumBunch(i.product)
      let qty = snapToBunch(i.quantity || step, step)
      if (qty > i.product.currentStock) {
        qty = snapToBunch(i.product.currentStock, step)
        toast.error(`Adjusted to available stock (${qty.toLocaleString('en-IN')} pcs)`)
      }
      return { ...i, quantity: qty }
    }))
  }

  const removeFromCart = (id: string) => setCart((prev) => prev.filter((i) => i.product._id !== id))

  const subtotal = cart.reduce((sum, i) => sum + (i.quantity * i.unitPrice - i.discount), 0)
  const discountAmount = discount
  const tax = ((subtotal - discountAmount) * taxRate) / 100
  const total = Math.round(subtotal - discountAmount + tax)
  const paidNow = paymentMode === 'credit'
    ? 0
    : paymentMode === 'full'
      ? total
      : paidAmount
  const onAccount = Math.max(0, total - paidNow)
  const change = Math.max(0, paidNow - total)
  const isCreditSale = onAccount > 0

  const buildPayments = () => {
    if (paidNow > 0) return [{ method: paymentMethod, amount: paidNow }]
    return [{ method: 'credit', amount: 0 }]
  }

  const cartValid = cart.length > 0 && cart.every((i) => i.quantity >= getMinimumBunch(i.product))
  const paymentValid = paymentMode === 'full'
    ? true
    : !!customerId && (
        paymentMode === 'credit'
          ? total > 0
          : paidAmount >= 0 && paidAmount < total
      )
  const creditOk = !isCreditSale || !selectedCustomer?.blockOnCreditLimit || onAccount <= availableCredit
  const canComplete = cartValid && paymentValid && creditOk

  const completeSale = useMutation({
    mutationFn: () => {
      for (const item of cart) {
        const step = getMinimumBunch(item.product)
        const qty = snapToBunch(item.quantity, step)
        if (qty % step !== 0) {
          throw new Error(`${item.product.name}: quantity must be in multiples of ${step}`)
        }
        if (qty > item.product.currentStock) {
          throw new Error(`${item.product.name}: insufficient stock`)
        }
      }

      const payments = buildPayments()
      return postApi<{ invoiceNumber: string; _id: string }>('/sales', {
        customer: customerId || undefined,
        items: cart.map((i) => ({
          product: i.product._id,
          quantity: snapToBunch(i.quantity, getMinimumBunch(i.product)),
          unitPrice: i.unitPrice,
          discount: i.discount,
        })),
        discount: discountAmount,
        discountType: 'fixed',
        taxRate,
        roundOff: total - (subtotal - discountAmount + tax),
        payments,
        isPos: true,
      })
    },
    onSuccess: (data) => {
      setLastSaleId(data._id)
      setCart([])
      setDiscount(0)
      setPaidAmount(0)
      setPaymentMode('full')
      setSelectedCustomer(null)
      toast.success(
        isCreditSale
          ? `Sale done! ${paidNow > 0 ? `${formatCurrency(paidNow)} paid, ` : ''}${formatCurrency(onAccount)} on ${isLongTermAcc ? 'account' : 'credit'}.`
          : `Sale completed! ${data.invoiceNumber}`
      )
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(err.response?.data?.message || err.message || 'Sale failed'),
  })

  const handleBarcodeSearch = async (barcode: string) => {
    try {
      const product = await fetchApi<Product>(`/products/barcode/${barcode}`)
      addToCart(product)
    } catch {
      toast.error('Product not found')
    }
  }

  const completeButtonLabel = () => {
    if (paymentMode === 'credit') return `Complete on Credit — ${formatCurrency(total)}`
    if (isCreditSale) return `Complete — Pay ${formatCurrency(paidNow)}, Credit ${formatCurrency(onAccount)}`
    return `Complete Sale — ${formatCurrency(total)}`
  }

  return (
    <div className="space-y-4 no-print">
      <PageHeader
        title="Point of Sale"
        description="Sell by minimum bunch — quantity steps in packet sizes (1K, 2K, etc.)"
        actions={
          <>
            <Link to={customerId ? `/collect-payment?customer=${customerId}` : '/collect-payment'}>
              <Button variant="secondary">
                <IndianRupee className="h-[18px] w-[18px]" /> Payment Only
              </Button>
            </Link>
            {lastSaleId && (
              <Button
                variant="secondary"
                onClick={() =>
                  downloadAuthenticated(`/sales/${lastSaleId}/pdf`, `invoice-${lastSaleId}.pdf`).catch(() =>
                    toast.error('Failed to download invoice')
                  )
                }
              >
                <Printer className="h-[18px] w-[18px]" /> Print Last Invoice
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-2 border-[var(--color-accent)]/20 shadow-[var(--shadow-md)] ring-1 ring-[var(--color-accent)]/10">
            <CardContent className="p-4">
              <ImportantField
                label="Search Product / Scan Barcode"
                hint="Type name or SKU — press Enter after scanning barcode"
                variant="primary"
                className="border-0 bg-transparent p-0 shadow-none ring-0"
              >
                <Input
                  ref={searchRef}
                  className={`${importantInputClass} h-14 text-[var(--text-xl)]`}
                  placeholder="Search product or scan barcode..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && search.length >= 8) handleBarcodeSearch(search)
                  }}
                />
              </ImportantField>
              {search.length >= 2 && searchResults.length > 0 && (
                <div className="mt-3 max-h-[28rem] overflow-y-auto rounded-[var(--radius-lg)] border-2 border-[var(--color-accent)]/20 shadow-[var(--shadow-sm)]">
                  {searchResults.map((p) => {
                    const step = getMinimumBunch(p)
                    const price = getSellingPrice(p)
                    return (
                      <button
                        key={p._id}
                        type="button"
                        className="flex w-full flex-col gap-2 border-b border-[var(--color-border-soft)] px-3 py-3 text-left last:border-0 hover:bg-[var(--color-accent-light)]/60 sm:flex-row sm:items-start sm:justify-between"
                        onClick={() => addToCart(p)}
                      >
                        <div className="min-w-0 flex-1 space-y-2">
                          <p className="text-[var(--text-sm)] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                            {p.name}
                          </p>
                          <ProductSpecHighlight product={p} size="hero" />
                          <p className="text-[var(--text-xs)] text-[var(--color-text-muted)]">
                            {p.sku} · min bunch {formatBunchLabel(step)}
                          </p>
                          <StockBarInline current={p.currentStock} max={p.reorderLevel * 3} />
                        </div>
                        <div className="shrink-0 sm:pt-1 sm:text-right">
                          <span className="font-data text-[var(--text-2xl)] font-bold text-[var(--color-accent)]">
                            {formatCurrency(price)}
                          </span>
                          <p className="text-[var(--text-xs)] text-[var(--color-text-muted)]">per piece</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Cart ({cart.length} items)</CardTitle></CardHeader>
            <CardContent>
              {cart.length === 0 ? (
                <p className="py-8 text-center text-[var(--color-text-muted)]">Scan or search products to add</p>
              ) : (
                <div className="space-y-3">
                  {cart.map((item) => {
                    const step = getMinimumBunch(item.product)
                    return (
                      <div key={item.product._id} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border-2 border-[var(--color-border-soft)] p-3">
                        <div className="min-w-[200px] flex-1 space-y-2">
                          <p className="text-[var(--text-sm)] font-semibold text-[var(--color-text-secondary)]">{item.product.name}</p>
                          <ProductSpecHighlight product={item.product} size="lg" />
                          <p className="text-[var(--text-xs)] text-[var(--color-text-muted)]">
                            {formatCurrency(item.unitPrice)}/pc · step {formatBunchLabel(step)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 rounded-[var(--radius-lg)] border-2 border-[var(--color-accent)]/30 bg-[var(--color-accent-light)]/60 p-1.5 shadow-[var(--shadow-xs)]">
                          <Button size="sm" variant="secondary" iconOnly onClick={() => stepQty(item.product._id, -1)}>
                            <Minus className="h-[18px] w-[18px]" />
                          </Button>
                          <Input
                            type="number"
                            min={step}
                            step={step}
                            className={importantQtyClass}
                            value={item.quantity === 0 ? '' : item.quantity}
                            onChange={(e) => setItemQuantity(item.product._id, e.target.value)}
                            onBlur={() => commitItemQuantity(item.product._id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitItemQuantity(item.product._id)
                            }}
                          />
                          <Button size="sm" variant="secondary" iconOnly onClick={() => stepQty(item.product._id, 1)}>
                            <Plus className="h-[18px] w-[18px]" />
                          </Button>
                        </div>
                        <p className="w-28 text-right font-data text-lg font-bold text-[var(--color-accent)]">{formatCurrency(item.quantity * item.unitPrice)}</p>
                        <Button size="sm" variant="danger" iconOnly onClick={() => removeFromCart(item.product._id)}>
                          <Trash2 className="h-[18px] w-[18px]" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Payment</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <ImportantField
                label="Customer"
                hint={paymentMode !== 'full' ? 'Required for credit or partial payment' : 'Optional — link sale to a customer'}
                required={paymentMode !== 'full'}
                variant={paymentMode !== 'full' ? 'warning' : 'info'}
              >
                <PosCustomerPicker
                  value={selectedCustomer}
                  onChange={handleCustomerChange}
                  required={paymentMode !== 'full'}
                  allowWalkIn={paymentMode === 'full'}
                />
              </ImportantField>

              {selectedCustomer && (
                <Alert
                  variant="info"
                  title={isLongTermAcc ? 'Long Term Credit (ACC)' : 'Short Term Credit'}
                  description={`Outstanding ${formatCurrency(selectedCustomer.outstandingAmount)}, limit ${formatCurrency(selectedCustomer.creditLimit)}, available ${formatCurrency(availableCredit)}.${!isLongTermAcc ? ` Invoice due in ${selectedCustomer.creditDays || 30} days.` : ' Running account — pay anytime via Collect Payment.'}`}
                />
              )}

              <ImportantField label="How to Pay" variant="primary">
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { mode: 'full' as PaymentMode, icon: Banknote, label: 'Full Pay' },
                    { mode: 'partial' as PaymentMode, icon: IndianRupee, label: 'Partial' },
                    { mode: 'credit' as PaymentMode, icon: Wallet, label: 'On Credit' },
                  ]).map(({ mode, icon: Icon, label }) => (
                    <Button
                      key={mode}
                      variant={paymentMode === mode ? 'primary' : 'secondary'}
                      onClick={() => {
                        setPaymentMode(mode)
                        if (mode === 'full') setPaidAmount(0)
                      }}
                      disabled={mode !== 'full' && !customerId}
                      className={`h-11 ${paymentMode === mode ? 'shadow-[var(--shadow-md)] ring-2 ring-[var(--color-accent)]/30' : ''}`}
                      title={mode !== 'full' && !customerId ? 'Select a customer first' : undefined}
                    >
                      <Icon className="h-[18px] w-[18px]" /> {label}
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-[var(--text-xs)] text-[var(--color-text-secondary)]">
                  {paymentMode === 'full' && 'Walk-in or registered — full amount collected now.'}
                  {paymentMode === 'partial' && 'Customer pays part now; balance goes on credit.'}
                  {paymentMode === 'credit' && 'Entire bill on credit — no payment collected now.'}
                </p>
              </ImportantField>

              <div><Label>Discount (Rs.)</Label><Input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></div>
              <div><Label>Tax Rate (%)</Label><Input type="number" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} /></div>

              <ImportantField label="Bill Total" variant="success" className="!p-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-[var(--text-sm)]"><span>Subtotal</span><span className="font-data">{formatCurrency(subtotal)}</span></div>
                  <div className="flex justify-between text-[var(--text-sm)]"><span>Discount</span><span className="font-data">-{formatCurrency(discountAmount)}</span></div>
                  <div className="flex justify-between text-[var(--text-sm)]"><span>Tax</span><span className="font-data">{formatCurrency(tax)}</span></div>
                  <div className="flex justify-between border-t-2 border-[var(--color-success)]/25 pt-3 text-[var(--text-2xl)] font-bold">
                    <span>Total</span>
                    <span className="font-data text-[var(--color-success)]">{formatCurrency(total)}</span>
                  </div>
                  {isCreditSale && (
                    <>
                      <div className="flex justify-between border-t border-[var(--color-border-soft)] pt-2 text-[var(--color-success)]"><span>Paid Now</span><span className="font-data font-semibold">{formatCurrency(paidNow)}</span></div>
                      <div className="flex justify-between text-[var(--color-warning)]"><span>{isLongTermAcc ? 'On Account' : 'On Credit'}</span><span className="font-data font-bold">{formatCurrency(onAccount)}</span></div>
                    </>
                  )}
                </div>
              </ImportantField>

              {paymentMode !== 'credit' && (
              <div>
                <Label>Payment Method {paymentMode === 'partial' ? '(for amount paid now)' : ''}</Label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[
                    { value: 'cash', icon: Banknote, label: 'Cash' },
                    { value: 'upi', icon: Smartphone, label: 'UPI' },
                    { value: 'bank', icon: CreditCard, label: 'Bank' },
                  ].map(({ value, icon: Icon, label }) => (
                    <Button key={value} variant={paymentMethod === value ? 'primary' : 'secondary'} onClick={() => setPaymentMethod(value)} className="h-10">
                      <Icon className="h-[18px] w-[18px]" /> {label}
                    </Button>
                  ))}
                </div>
              </div>
              )}

              {paymentMode === 'partial' && (
              <ImportantField label="Amount Paid Now" variant="warning" hint="Enter amount customer pays today — balance goes on credit">
                <Input
                  type="number"
                  className={`${importantInputClass} h-12 text-[var(--text-lg)] border-[var(--color-warning)]/35 focus:border-[var(--color-warning)] focus:[box-shadow:0_0_0_4px_rgba(217,119,6,0.18)]`}
                  placeholder={`Less than ${total.toLocaleString('en-IN')}`}
                  value={paidAmount || ''}
                  onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}
                />
                {paidAmount >= total && (
                  <p className="mt-1 text-[var(--text-xs)] text-[var(--color-danger)]">Use Full Pay if customer pays the entire amount.</p>
                )}
              </ImportantField>
              )}

              {paymentMode === 'full' && paidNow > total && (
                <p className="font-medium text-[var(--color-success)]">Change: {formatCurrency(change)}</p>
              )}

              {isCreditSale && onAccount > availableCredit && selectedCustomer?.blockOnCreditLimit && (
                <Alert variant="warning" title="Credit limit exceeded" description={`This sale needs ${formatCurrency(onAccount)} credit but only ${formatCurrency(availableCredit)} is available.`} />
              )}

              <Button
                className="w-full shadow-[var(--shadow-lg)] ring-2 ring-[var(--color-accent)]/25"
                size="lg"
                disabled={!canComplete}
                loading={completeSale.isPending}
                onClick={() => completeSale.mutate()}
              >
                {completeButtonLabel()}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
