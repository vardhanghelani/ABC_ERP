import { useCallback, useRef } from 'react'
import { looksLikeCategoryBarcode } from '@/lib/posBarcode'

const DEFAULT_MAX_INTER_CHAR_MS = 50
const DEFAULT_MIN_SCAN_LENGTH = 4

export interface PosScanDetection {
  scanDetectionMs: number
  isScannerBurst: boolean
}

export function usePosBarcodeScanner(options: {
  onScan: (code: string, detection: PosScanDetection) => void | Promise<void>
  getValue: () => string
  enabled?: boolean
  maxInterCharMs?: number
  minScanLength?: number
}) {
  const bufferRef = useRef('')
  const firstKeyTimeRef = useRef(0)
  const lastKeyTimeRef = useRef(0)
  const burstRef = useRef(false)

  const resetScanBuffer = useCallback(() => {
    bufferRef.current = ''
    firstKeyTimeRef.current = 0
    lastKeyTimeRef.current = 0
    burstRef.current = false
  }, [])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (options.enabled === false) return

      const maxGap = options.maxInterCharMs ?? DEFAULT_MAX_INTER_CHAR_MS
      const minLength = options.minScanLength ?? DEFAULT_MIN_SCAN_LENGTH
      const now = performance.now()

      if (event.key === 'Enter') {
        const code = (bufferRef.current || options.getValue()).trim()
        const scanDetectionMs =
          firstKeyTimeRef.current > 0 ? now - firstKeyTimeRef.current : 0
        const avgGap =
          bufferRef.current.length > 1 ? scanDetectionMs / bufferRef.current.length : scanDetectionMs
        const isScannerBurst =
          burstRef.current ||
          (code.length >= minLength && scanDetectionMs > 0 && avgGap <= maxGap) ||
          looksLikeCategoryBarcode(code)

        if (code && isScannerBurst) {
          event.preventDefault()
          event.stopPropagation()
          void options.onScan(code, { scanDetectionMs, isScannerBurst })
        }

        resetScanBuffer()
        return
      }

      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (!bufferRef.current) {
          firstKeyTimeRef.current = now
          burstRef.current = false
        } else if (now - lastKeyTimeRef.current > maxGap) {
          bufferRef.current = event.key
          firstKeyTimeRef.current = now
          burstRef.current = false
          lastKeyTimeRef.current = now
          return
        } else {
          burstRef.current = true
        }

        bufferRef.current += event.key
        lastKeyTimeRef.current = now
      }
    },
    [options, resetScanBuffer]
  )

  return { handleKeyDown, resetScanBuffer }
}
