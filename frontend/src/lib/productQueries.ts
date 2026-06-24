import type { QueryClient } from '@tanstack/react-query'

/** Keep product lists, POS search, and inventory in sync after catalog or stock changes. */
export function invalidateProductQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['products'] })
  queryClient.invalidateQueries({ queryKey: ['products-inventory'] })
  queryClient.invalidateQueries({ queryKey: ['products-inactive'] })
  queryClient.invalidateQueries({ queryKey: ['pos-product-cache'] })
  queryClient.invalidateQueries({ queryKey: ['pos-top-sellers'] })
  queryClient.invalidateQueries({ queryKey: ['pos-search'] })
  queryClient.invalidateQueries({ queryKey: ['product-picker'] })
  queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] })
  queryClient.invalidateQueries({ queryKey: ['inventory-valuation'] })
}
