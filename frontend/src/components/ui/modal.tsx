import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from './button'

type ModalSize = 'sm' | 'md' | 'lg'

const sizes: Record<ModalSize, string> = {
  sm: 'max-w-[560px]',
  md: 'max-w-[720px]',
  lg: 'max-w-[960px]',
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'sm',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: ModalSize
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="modal-title"
        className={cn(
          'relative z-10 flex max-h-[90vh] w-full flex-col rounded-[var(--radius-xl)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-xl)] animate-modal-in',
          sizes[size]
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] px-6 py-4">
          <h2 id="modal-title" className="text-[var(--text-lg)] font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" iconOnly onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-[var(--color-border-soft)] px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  )
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cn(
          'absolute right-0 top-0 flex h-full flex-col bg-[var(--color-bg-surface)] shadow-[var(--shadow-xl)] animate-drawer-in',
          wide ? 'w-[640px] max-w-full' : 'w-[480px] max-w-full'
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] px-6 py-4">
          <h2 className="text-[var(--text-lg)] font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" iconOnly onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-[var(--color-border-soft)] px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}
