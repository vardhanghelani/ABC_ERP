import { Plus, Trash2 } from 'lucide-react'
import type { InlineFieldDraft, PrimaryFieldType } from '@/lib/fieldBuilder'
import { PRIMARY_FIELD_TYPES, nameToFieldKey, newFieldDraft } from '@/lib/fieldBuilder'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

interface InlineFieldBuilderProps {
  fields: InlineFieldDraft[]
  onChange: (fields: InlineFieldDraft[]) => void
  title?: string
  description?: string
}

export function InlineFieldBuilder({
  fields,
  onChange,
  title = 'Product Specification Fields',
  description = 'Name each field and choose String, Whole Number, or Decimal. Key is generated automatically.',
}: InlineFieldBuilderProps) {
  const update = (id: string, patch: Partial<InlineFieldDraft>) => {
    onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  const remove = (id: string) => onChange(fields.filter((f) => f.id !== id))

  const add = () => onChange([...fields, newFieldDraft()])

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>

      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No custom fields yet. Click Add Field to define specs for this category.</p>
      ) : (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid gap-3 sm:grid-cols-[1fr_180px_100px_40px] items-end rounded-lg border bg-card p-3"
            >
              <div>
                <Label className="text-xs">Field Name {index + 1}</Label>
                <Input
                  className="h-10 mt-1"
                  value={field.name}
                  onChange={(e) => update(field.id, { name: e.target.value })}
                  placeholder="e.g. Size, Weight, Color, Naka"
                />
                {field.name && (
                  <p className="text-xs text-muted-foreground mt-1 font-mono">key: {nameToFieldKey(field.name) || '—'}</p>
                )}
              </div>
              <div>
                <Label className="text-xs">Data Type</Label>
                <Select
                  className="h-10 mt-1"
                  value={field.fieldType}
                  onChange={(e) => update(field.id, { fieldType: e.target.value as PrimaryFieldType })}
                >
                  {PRIMARY_FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id={`req-${field.id}`}
                  checked={field.required}
                  onChange={(e) => update(field.id, { required: e.target.checked })}
                />
                <Label htmlFor={`req-${field.id}`} className="text-xs cursor-pointer">Required</Label>
              </div>
              <Button
                type="button"
                variant="ghost"
                iconOnly
                className="text-[var(--color-danger)]"
                onClick={() => remove(field.id)}
                title="Remove field"
              >
                <Trash2 className="h-[18px] w-[18px]" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button type="button" variant="secondary" size="sm" onClick={add}>
        <Plus className="h-[18px] w-[18px]" /> Add Field
      </Button>

      {fields.some((f) => f.fieldType) && (
        <div className="text-xs text-muted-foreground border-t pt-2 space-y-1">
          {PRIMARY_FIELD_TYPES.map((t) => (
            <p key={t.value}><strong>{t.label}:</strong> {t.hint}</p>
          ))}
        </div>
      )}
    </div>
  )
}
