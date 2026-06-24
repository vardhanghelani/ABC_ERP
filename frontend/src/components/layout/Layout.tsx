import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Package, Tags, Warehouse, ShoppingCart, Users, Truck,
  FileText, CreditCard, BarChart3, Settings, LogOut, Bell, HelpCircle,
  ClipboardList, Receipt, UserCog, Wallet, IndianRupee, ChevronLeft, Menu,
  Building2, User, ShieldCheck, HandCoins, Barcode,
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Breadcrumb } from '@/components/layout/PageHeader'

const navSections = [
  {
    label: 'Operations',
    items: [
      { to: '/pos', icon: ShoppingCart, label: 'Point of Sale', permission: 'pos:access' },
      { to: '/', icon: LayoutDashboard, label: 'Dashboard', permission: null },
      { to: '/sales', icon: Receipt, label: 'Sales Orders', permission: 'sales:view' },
      { to: '/orders', icon: ClipboardList, label: 'Orders', permission: 'orders:view' },
      { to: '/collect-payment', icon: IndianRupee, label: 'Collect Payment', permission: 'payments:manage' },
      { to: '/products', icon: Package, label: 'Products', permission: 'products:view' },
      { to: '/barcode-center', icon: Barcode, label: 'Barcode Center', permission: 'barcode:view' },
      { to: '/categories', icon: Tags, label: 'Categories', permission: 'categories:view' },
      { to: '/inventory', icon: Warehouse, label: 'Stock Movements', permission: 'inventory:view' },
    ],
  },
  {
    label: 'Accounts',
    items: [
      { to: '/customers', icon: Users, label: 'Customers', permission: 'customers:view' },
      { to: '/expenses', icon: HandCoins, label: 'Expenses', permission: 'accounting:view' },
      { to: '/suppliers', icon: Truck, label: 'Suppliers', permission: 'suppliers:view' },
      { to: '/credit', icon: Wallet, label: 'Credit & Ledger', permission: 'accounting:view' },
      { to: '/accounting', icon: CreditCard, label: 'Accounting', permission: 'accounting:view' },
      { to: '/accounting/health-check', icon: ShieldCheck, label: 'Accounting Health Check', permission: 'accounting:manage' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/reports', icon: BarChart3, label: 'Reports', permission: 'reports:view' },
      { to: '/warehouses', icon: Building2, label: 'Warehouses', permission: 'inventory:view' },
      { to: '/users', icon: UserCog, label: 'Users', permission: 'users:view' },
      { to: '/settings', icon: Settings, label: 'Settings', permission: 'settings:manage' },
      { to: '/profile', icon: User, label: 'My Account', permission: null },
    ],
  },
  {
    label: 'Purchasing',
    items: [
      { to: '/purchases', icon: FileText, label: 'Purchase Orders', permission: 'purchases:view' },
    ],
  },
]

const routeTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/pos': 'Point of Sale',
  '/collect-payment': 'Collect Payment',
  '/products': 'Products',
  '/barcode-center': 'Barcode Center',
  '/products/inactive': 'Inactive Products',
  '/categories': 'Categories',
  '/inventory': 'Stock Movements',
  '/purchases': 'Purchase Orders',
  '/sales': 'Sales Orders',
  '/orders': 'Orders',
  '/customers': 'Customers',
  '/suppliers': 'Suppliers',
  '/credit': 'Credit & Ledger',
  '/expenses': 'Business Expenses',
  '/accounting': 'Accounting',
  '/accounting/health-check': 'Accounting Health Check',
  '/reports': 'Reports',
  '/warehouses': 'Warehouses',
  '/users': 'User Management',
  '/settings': 'Settings',
  '/profile': 'My Account',
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, hasPermission } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const pageTitle = routeTitles[location.pathname] ||
    (location.pathname.startsWith('/customers/') ? 'Customer Detail' :
      location.pathname.startsWith('/sales/') ? 'Invoice Detail' : 'Inventory ERP')

  const breadcrumbs = [
    { label: 'Home', href: '/' },
    ...(location.pathname !== '/' ? [{ label: pageTitle }] : []),
  ]

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-[var(--color-bg-base)]">
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[var(--color-border-soft)] bg-[var(--color-sidebar-bg)] transition-all duration-[250ms] ease-out lg:static',
          collapsed ? 'w-[var(--sidebar-collapsed)]' : 'w-[var(--sidebar-width)]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className={cn('flex h-[var(--topbar-height)] items-center border-b border-[var(--color-border-soft)] px-4', collapsed && 'justify-center')}>
          {!collapsed && (
            <div>
              <p className="text-[var(--text-md)] font-bold text-[var(--color-text-primary)]">Inventory ERP</p>
              <p className="text-[var(--text-xs)] text-[var(--color-text-muted)]">Management System</p>
            </div>
          )}
          {collapsed && (
            <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white text-xs font-bold">IE</div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navSections.map((section) => {
            const items = section.items.filter((item) => !item.permission || hasPermission(item.permission))
            if (items.length === 0) return null
            return (
              <div key={section.label} className="mb-4">
                {!collapsed && (
                  <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    {section.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {items.map(({ to, icon: Icon, label }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={to === '/'}
                      title={collapsed ? label : undefined}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex h-10 items-center gap-2.5 rounded-[var(--radius-md)] px-3 text-[var(--text-sm)] font-medium transition-colors duration-150',
                          collapsed && 'justify-center px-0',
                          isActive
                            ? 'bg-[var(--color-sidebar-active)] text-[var(--color-sidebar-active-text)]'
                            : 'text-[var(--color-sidebar-text)] hover:bg-[var(--color-bg-elevated)]'
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-[var(--color-accent)]" />
                          )}
                          <Icon className="h-[18px] w-[18px] shrink-0" />
                          {!collapsed && label}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        <div className="border-t border-[var(--color-border-soft)] p-2">
          {!collapsed && user && (
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="mb-2 flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-bg-elevated)]"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-full)] bg-[var(--color-accent)] text-[11px] font-semibold text-white">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[var(--text-xs)] font-medium leading-tight text-[var(--color-text-primary)]">
                  {user.name}
                </p>
                {user.role && user.name.toLowerCase() !== user.role.replace('_', ' ').toLowerCase() && (
                  <p className="truncate text-[10px] capitalize leading-tight text-[var(--color-text-muted)]">
                    {user.role.replace('_', ' ')}
                  </p>
                )}
              </div>
            </button>
          )}
          <div className={cn('flex gap-0.5', collapsed ? 'flex-col items-center' : '')}>
            <Button variant="ghost" size="sm" iconOnly={collapsed} onClick={() => setCollapsed(!collapsed)} className="hidden h-8 lg:inline-flex">
              <ChevronLeft className={cn('h-3.5 w-3.5 transition-transform', collapsed && 'rotate-180')} />
              {!collapsed && <span className="text-[var(--text-xs)]">Collapse</span>}
            </Button>
            <Button variant="ghost" size="sm" iconOnly={collapsed} onClick={handleLogout} className="h-8">
              <LogOut className="h-3.5 w-3.5" />
              {!collapsed && <span className="text-[var(--text-xs)]">Sign out</span>}
            </Button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-[var(--topbar-height)] items-center gap-4 border-b border-[var(--color-border-soft)] bg-[var(--color-bg-surface)] px-4 lg:px-6 no-print">
          <Button variant="ghost" size="sm" iconOnly className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[var(--text-lg)] font-semibold lg:hidden">{pageTitle}</h1>
            <div className="hidden lg:block"><Breadcrumb items={breadcrumbs} /></div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" iconOnly aria-label="Notifications">
              <span className="relative">
                <Bell className="h-[18px] w-[18px]" />
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--color-danger)]" />
              </span>
            </Button>
            <Button variant="ghost" size="sm" iconOnly aria-label="Help">
              <HelpCircle className="h-[18px] w-[18px]" />
            </Button>
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="ml-1 flex h-8 w-8 items-center justify-center rounded-[var(--radius-full)] bg-[var(--color-accent-light)] text-[var(--text-sm)] font-semibold text-[var(--color-accent)]"
            >
              {user?.name.charAt(0).toUpperCase()}
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
