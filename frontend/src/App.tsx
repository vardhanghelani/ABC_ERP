import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { DefaultRedirect } from '@/components/layout/DefaultRedirect'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import CategoriesPage from '@/pages/CategoriesPage'
import ProductsPage from '@/pages/ProductsPage'
import InactiveProductsPage from '@/pages/InactiveProductsPage'
import InventoryPage from '@/pages/InventoryPage'
import POSPage from '@/pages/POSPage'
import CustomersPage from '@/pages/CustomersPage'
import SuppliersPage from '@/pages/SuppliersPage'
import PurchasesPage from '@/pages/PurchasesPage'
import OrdersPage from '@/pages/OrdersPage'
import SalesPage from '@/pages/SalesPage'
import SaleDetailPage from '@/pages/SaleDetailPage'
import AccountingPage from '@/pages/AccountingPage'
import AccountingHealthCheckPage from '@/pages/AccountingHealthCheckPage'
import ReportsPage from '@/pages/ReportsPage'
import SettingsPage from '@/pages/SettingsPage'
import UsersPage from '@/pages/UsersPage'
import CustomerDetailPage from '@/pages/CustomerDetailPage'
import CreditPage from '@/pages/CreditPage'
import CollectPaymentPage from '@/pages/CollectPaymentPage'
import ExpensesPage from '@/pages/ExpensesPage'
import ProfilePage from '@/pages/ProfilePage'
import WarehousesPage from '@/pages/WarehousesPage'
import BarcodeCenterPage from '@/pages/BarcodeCenterPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 60_000, refetchOnWindowFocus: false } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<ProtectedRoute permission="reports:view"><DashboardPage /></ProtectedRoute>} />
            <Route path="/pos" element={<ProtectedRoute permission="pos:access"><POSPage /></ProtectedRoute>} />
            <Route path="/collect-payment" element={<ProtectedRoute permission="payments:manage"><CollectPaymentPage /></ProtectedRoute>} />
            <Route path="/products" element={<ProtectedRoute permission="products:view"><ProductsPage /></ProtectedRoute>} />
            <Route path="/products/inactive" element={<ProtectedRoute permission="products:view"><InactiveProductsPage /></ProtectedRoute>} />
            <Route path="/categories" element={<ProtectedRoute permission="categories:view"><CategoriesPage /></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute permission="inventory:view"><InventoryPage /></ProtectedRoute>} />
            <Route path="/sales" element={<ProtectedRoute permission="sales:view"><SalesPage /></ProtectedRoute>} />
            <Route path="/sales/:id" element={<ProtectedRoute permission="sales:view"><SaleDetailPage /></ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute permission="orders:view"><OrdersPage /></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedRoute permission="customers:view"><CustomersPage /></ProtectedRoute>} />
            <Route path="/customers/:id" element={<ProtectedRoute permission="customers:view"><CustomerDetailPage /></ProtectedRoute>} />
            <Route path="/credit" element={<ProtectedRoute permission="accounting:view"><CreditPage /></ProtectedRoute>} />
            <Route path="/suppliers" element={<ProtectedRoute permission="suppliers:view"><SuppliersPage /></ProtectedRoute>} />
            <Route path="/purchases" element={<ProtectedRoute permission="purchases:view"><PurchasesPage /></ProtectedRoute>} />
            <Route path="/accounting" element={<ProtectedRoute permission="accounting:view"><AccountingPage /></ProtectedRoute>} />
            <Route path="/expenses" element={<ProtectedRoute permission="accounting:view"><ExpensesPage /></ProtectedRoute>} />
            <Route path="/accounting/health-check" element={<ProtectedRoute permission="accounting:manage"><AccountingHealthCheckPage /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute permission="reports:view"><ReportsPage /></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute permission="users:view"><UsersPage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute permission="settings:manage"><SettingsPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/warehouses" element={<ProtectedRoute permission="inventory:view"><WarehousesPage /></ProtectedRoute>} />
            <Route path="/barcode-center" element={<ProtectedRoute permission="barcode:view"><BarcodeCenterPage /></ProtectedRoute>} />
            <Route path="*" element={<DefaultRedirect />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </QueryClientProvider>
  )
}
