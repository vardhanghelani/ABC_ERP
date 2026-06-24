export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  SALESMAN = 'salesman',
  WAREHOUSE = 'warehouse',
  ACCOUNTANT = 'accountant',
}

export const PERMISSIONS = {
  // Users
  USERS_VIEW: 'users:view',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',
  // Categories
  CATEGORIES_VIEW: 'categories:view',
  CATEGORIES_CREATE: 'categories:create',
  CATEGORIES_UPDATE: 'categories:update',
  CATEGORIES_DELETE: 'categories:delete',
  // Products
  PRODUCTS_VIEW: 'products:view',
  PRODUCTS_CREATE: 'products:create',
  PRODUCTS_UPDATE: 'products:update',
  PRODUCTS_DELETE: 'products:delete',
  // Inventory
  INVENTORY_VIEW: 'inventory:view',
  INVENTORY_MANAGE: 'inventory:manage',
  // Sales & POS
  SALES_VIEW: 'sales:view',
  SALES_CREATE: 'sales:create',
  POS_ACCESS: 'pos:access',
  // Orders
  ORDERS_VIEW: 'orders:view',
  ORDERS_MANAGE: 'orders:manage',
  // Purchases
  PURCHASES_VIEW: 'purchases:view',
  PURCHASES_MANAGE: 'purchases:manage',
  // Customers
  CUSTOMERS_VIEW: 'customers:view',
  CUSTOMERS_MANAGE: 'customers:manage',
  // Suppliers
  SUPPLIERS_VIEW: 'suppliers:view',
  SUPPLIERS_MANAGE: 'suppliers:manage',
  // Accounting
  ACCOUNTING_VIEW: 'accounting:view',
  ACCOUNTING_MANAGE: 'accounting:manage',
  PAYMENTS_MANAGE: 'payments:manage',
  // Reports
  REPORTS_VIEW: 'reports:view',
  // Settings
  SETTINGS_MANAGE: 'settings:manage',
  // Audit
  AUDIT_VIEW: 'audit:view',
  // Import/Export
  IMPORT_EXPORT: 'import_export:manage',
  // Barcode Center
  BARCODE_VIEW: 'barcode:view',
  BARCODE_PRINT: 'barcode:print',
  BARCODE_MANAGE: 'barcode:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.SUPER_ADMIN]: Object.values(PERMISSIONS),
  [UserRole.ADMIN]: Object.values(PERMISSIONS).filter(
    (p) => !p.startsWith('users:delete') && p !== PERMISSIONS.AUDIT_VIEW
  ),
  [UserRole.SALESMAN]: [
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.CUSTOMERS_MANAGE,
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.SALES_CREATE,
    PERMISSIONS.POS_ACCESS,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_MANAGE,
    PERMISSIONS.BARCODE_VIEW,
  ],
  [UserRole.WAREHOUSE]: [
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_MANAGE,
    PERMISSIONS.PURCHASES_VIEW,
    PERMISSIONS.SUPPLIERS_VIEW,
    PERMISSIONS.BARCODE_VIEW,
    PERMISSIONS.BARCODE_PRINT,
  ],
  [UserRole.ACCOUNTANT]: [
    PERMISSIONS.SALES_VIEW,
    PERMISSIONS.PURCHASES_VIEW,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.SUPPLIERS_VIEW,
    PERMISSIONS.ACCOUNTING_VIEW,
    PERMISSIONS.ACCOUNTING_MANAGE,
    PERMISSIONS.PAYMENTS_MANAGE,
    PERMISSIONS.REPORTS_VIEW,
  ],
};

export const hasPermission = (role: UserRole, permission: Permission): boolean => {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
};
