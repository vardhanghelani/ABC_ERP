export type UserRole = 'super_admin' | 'admin' | 'salesman' | 'warehouse' | 'accountant'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  phone?: string
  permissions: string[]
}

export interface Category {
  _id: string
  name: string
  code: string
  description?: string
  isActive: boolean
  sortOrder: number
  fields?: CategoryField[]
}

export type FieldType = 'text' | 'integer' | 'decimal' | 'number' | 'dropdown' | 'multiselect' | 'color' | 'date' | 'boolean'

export interface CategoryField {
  _id: string
  category: string
  name: string
  key: string
  fieldType: FieldType
  options: string[]
  required: boolean
  sortOrder: number
  placeholder?: string
  isActive: boolean
}

export interface Product {
  _id: string
  sku: string
  name: string
  category: Category | string
  brand?: string
  images: { url: string; publicId: string; isPrimary: boolean }[]
  description?: string
  attributes: Record<string, unknown>
  currentStock: number
  minStock: number
  reorderLevel: number
  purchasePrice: number
  wholesalePrice: number
  retailPrice: number
  minimumBunch: number
  sellingPrice: number
  barcode: string
  status: 'active' | 'inactive'
  supplier?: { _id: string; name: string }
  unitType?: string
}

export interface Customer {
  _id: string
  name: string
  code?: string
  gstNumber?: string
  address?: string
  city?: string
  state?: string
  phone: string
  whatsapp?: string
  email?: string
  customerType?: string
  creditTermType?: 'short_term' | 'long_term'
  creditLimit: number
  creditDays: number
  outstandingAmount: number
  advanceBalance: number
  totalPurchases: number
  totalPayments: number
  lastPurchaseDate?: string
  lastPaymentDate?: string
  riskCategory?: string
  riskScore?: number
  badDebtStatus?: string
  blockOnCreditLimit?: boolean
  isActive: boolean
  notes?: { text: string; createdAt: string }[]
}

export interface LedgerEntry {
  _id: string
  date: string
  createdAt?: string
  referenceNumber: string
  transactionType: string
  debit: number
  credit: number
  runningBalance: number
  remarks?: string
  createdByName: string
}

export interface CustomerSummary {
  customer: Customer
  currentOutstanding: number
  netOutstanding: number
  totalPurchases: number
  totalPayments: number
  pendingInvoices: number
  pendingInvoiceAmount: number
  overdueAmount: number
  overdueInvoices: number
  availableCredit: number
  creditLimit: number
  creditUsagePercent: number
  advanceBalance: number
  lastTransactionDate?: string
  riskCategory?: string
  riskScore?: number
  creditTermType?: string
  creditTermLabel?: string
  pendingInvoiceList: {
    _id: string
    invoiceNumber: string
    total: number
    balanceDue: number
    dueDate?: string
    daysOverdue: number
  }[]
}

export interface CreditDashboard {
  totalReceivables: number
  totalPayables: number
  overdueCustomers: number
  nearLimitCustomers: Customer[]
  todayCollections: number
  monthCollections: number
  largestOutstanding: Customer[]
}

export interface Supplier {
  _id: string
  name: string
  code?: string
  gstNumber?: string
  phone: string
  email?: string
  contactPerson?: string
  outstandingAmount: number
  isActive: boolean
}

export interface SaleItem {
  product: string
  productName: string
  sku: string
  quantity: number
  unitPrice: number
  discount: number
  total: number
}

export interface Sale {
  _id: string
  invoiceNumber: string
  customer?: Customer | string
  customerName?: string
  items: SaleItem[]
  payments: { method: string; amount: number; reference?: string }[]
  subtotal: number
  discount: number
  discountType?: 'fixed' | 'percentage'
  tax: number
  taxRate?: number
  roundOff: number
  total: number
  paidAmount: number
  changeAmount?: number
  balanceDue?: number
  dueDate?: string
  creditTermType?: string
  status: string
  notes?: string
  isPos?: boolean
  createdBy?: { _id: string; name: string } | string
  createdAt: string
}

export interface Expense {
  _id: string
  entryNumber?: string
  reason: string
  amount: number
  createdAt: string
  createdBy?: { _id: string; name: string } | string
}

export interface DashboardStats {
  todaySales: number
  todayProfit: number
  todayOrders: number
  lowStockProducts: Product[]
  topProducts: { _id: string; name: string; totalQty: number; totalRevenue: number }[]
  outstandingReceivables: number
  outstandingPayables: number
  inventoryValue: number
  salesGraph: { _id: string; sales: number; orders: number }[]
  credit?: CreditDashboard
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}
