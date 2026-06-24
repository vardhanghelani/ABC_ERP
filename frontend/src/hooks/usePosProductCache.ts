import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api'
import type { PosProductCachePayload } from '@/lib/posProductSearch'

export function usePosProductCache() {
  return useQuery({
    queryKey: ['pos-product-cache'],
    queryFn: ({ signal }) =>
      fetchApi<PosProductCachePayload>('/products/pos-cache', undefined, { signal }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 2,
  })
}
