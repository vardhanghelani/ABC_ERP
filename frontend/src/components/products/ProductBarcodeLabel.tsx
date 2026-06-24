import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'

interface BarcodePreview {
  barcode: string
  image: string
  name: string
  sku: string
}

interface ProductBarcodeLabelProps {
  productId: string
}

export function ProductBarcodeLabel({ productId }: ProductBarcodeLabelProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['product-barcode-preview', productId],
    queryFn: () => fetchApi<BarcodePreview>(`/products/${productId}/barcode/preview`),
    enabled: Boolean(productId),
  })

  const handlePrint = () => {
    if (!data) return

    const printWindow = window.open('', '_blank', 'width=420,height=320')
    if (!printWindow) return

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Label — ${data.barcode}</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 16px; }
            img { max-width: 100%; height: auto; }
            .name { font-size: 14px; font-weight: 600; margin: 8px 0 4px; }
            .meta { font-size: 12px; color: #555; }
          </style>
        </head>
        <body>
          <img src="${data.image}" alt="${data.barcode}" />
          <div class="name">${data.name}</div>
          <div class="meta">${data.sku} · ${data.barcode}</div>
          <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); };</script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  if (isLoading) {
    return <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">Loading barcode…</p>
  }

  if (isError || !data) {
    return <p className="text-[var(--text-sm)] text-[var(--color-danger)]">Barcode preview unavailable</p>
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-soft)] bg-[var(--color-bg-sunken)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[var(--text-xs)] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            Barcode
          </p>
          <p className="font-data text-lg font-semibold tracking-wide">{data.barcode}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={handlePrint}>
          <Printer className="h-4 w-4" /> Print Label
        </Button>
      </div>
      <div className="mt-3 flex justify-center rounded-[var(--radius-sm)] bg-white p-3">
        <img src={data.image} alt={`Barcode ${data.barcode}`} className="max-h-24 w-auto" />
      </div>
    </div>
  )
}
