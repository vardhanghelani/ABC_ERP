export interface PosScanPerformanceMetrics {
  scanDetectionMs: number
  cacheLookupMs: number
  addToCartMs: number
  totalMs: number
  source: 'cache' | 'api' | 'miss'
  barcode?: string
}

const TARGET_MS = 100

export function logPosScanPerformance(metrics: PosScanPerformanceMetrics): void {
  const withinTarget = metrics.totalMs < TARGET_MS
  const label = withinTarget ? '[POS scan ✓]' : '[POS scan ⚠]'

  if (import.meta.env.DEV) {
    console.info(label, {
      ...metrics,
      targetMs: TARGET_MS,
      withinTarget,
    })
  }
}
