import { useQuery } from '@tanstack/react-query'
import { fetchApiWithEtag } from '@/lib/api'
import {
  POS_TOP_SELLERS_KEY,
  type PosTopSellersPayload,
} from '@/lib/posProductSearch'

export function usePosTopSellers() {
  return useQuery({
    queryKey: ['pos-top-sellers'],
    queryFn: async ({ signal }) => {
      const result = await fetchApiWithEtag<PosTopSellersPayload>(POS_TOP_SELLERS_KEY, {
        signal,
        cacheKey: POS_TOP_SELLERS_KEY,
      })
      return result.data
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  })
}
