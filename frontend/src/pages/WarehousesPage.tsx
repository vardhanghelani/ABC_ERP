import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Building2, MapPin, Package } from 'lucide-react'

const placeholderWarehouses = [
  { id: '1', name: 'Main Warehouse', location: 'Mumbai, Maharashtra', capacity: '12,000 units', status: 'active' as const },
  { id: '2', name: 'Secondary Store', location: 'Pune, Maharashtra', capacity: '4,500 units', status: 'active' as const },
  { id: '3', name: 'Transit Hub', location: 'Nashik, Maharashtra', capacity: '2,000 units', status: 'planned' as const },
]

export default function WarehousesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Warehouses"
        description="Manage warehouse locations and storage capacity"
        badge={<Badge variant="muted">Coming soon</Badge>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {placeholderWarehouses.map((wh) => (
          <Card key={wh.id} className="overflow-hidden">
            <div className="flex h-24 items-center justify-center bg-[var(--color-accent-light)]">
              <Building2 className="h-10 w-10 text-[var(--color-accent)]" strokeWidth={1.5} />
            </div>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-[var(--color-text-primary)]">{wh.name}</h3>
                <Badge variant={wh.status === 'active' ? 'success' : 'info'} className="normal-case">{wh.status}</Badge>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[var(--text-sm)] text-[var(--color-text-muted)]">
                <MapPin className="h-[18px] w-[18px] shrink-0" />
                {wh.location}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-[var(--text-sm)] text-[var(--color-text-secondary)]">
                <Package className="h-[18px] w-[18px] shrink-0" />
                Capacity: {wh.capacity}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
