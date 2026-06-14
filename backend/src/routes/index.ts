import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { PERMISSIONS } from '../utils/permissions';
import * as auth from '../controllers/authController';
import * as category from '../controllers/categoryController';
import * as product from '../controllers/productController';
import * as inventory from '../controllers/inventoryController';
import * as customer from '../controllers/customerController';
import * as supplier from '../controllers/supplierController';
import * as purchase from '../controllers/purchaseController';
import * as sale from '../controllers/saleController';
import * as order from '../controllers/orderController';
import * as payment from '../controllers/paymentController';
import * as expense from '../controllers/expenseController';
import * as report from '../controllers/reportController';
import * as audit from '../controllers/auditController';
import * as settings from '../controllers/settingsController';
import * as importExport from '../controllers/importExportController';
import * as credit from '../controllers/creditController';
import * as reconciliation from '../controllers/reconciliationController';
import { upload } from '../middleware/upload';
import { loginRateLimit } from '../middleware/loginRateLimit';
import { refreshRateLimit } from '../middleware/refreshRateLimit';
import { saleCreateRateLimit } from '../middleware/saleRateLimit';

const router = Router();

// Auth
router.post('/auth/login', loginRateLimit, validate(auth.loginSchema), auth.login);
router.post('/auth/refresh', refreshRateLimit, auth.refreshAccessToken);
router.post('/auth/logout', authenticate, auth.logout);
router.get('/auth/me', authenticate, auth.getMe);
router.post('/auth/register', authenticate, authorize(PERMISSIONS.USERS_CREATE), validate(auth.registerSchema), auth.register);
router.get('/auth/users', authenticate, authorize(PERMISSIONS.USERS_VIEW), auth.getUsers);
router.put('/auth/users/:id', authenticate, authorize(PERMISSIONS.USERS_UPDATE), validate(auth.updateUserSchema), auth.updateUser);
router.delete('/auth/users/:id', authenticate, authorize(PERMISSIONS.USERS_DELETE), auth.deleteUser);

// Categories
router.get('/categories', authenticate, authorize(PERMISSIONS.CATEGORIES_VIEW), category.getCategories);
router.get('/categories/:id', authenticate, authorize(PERMISSIONS.CATEGORIES_VIEW), category.getCategory);
router.post('/categories', authenticate, authorize(PERMISSIONS.CATEGORIES_CREATE), validate(category.categorySchema), category.createCategory);
router.put('/categories/:id', authenticate, authorize(PERMISSIONS.CATEGORIES_UPDATE), category.updateCategory);
router.delete('/categories/:id', authenticate, authorize(PERMISSIONS.CATEGORIES_DELETE), category.deleteCategory);
router.get('/categories/:id/fields', authenticate, authorize(PERMISSIONS.CATEGORIES_VIEW), category.getCategoryFields);
router.get('/categories/:id/fields/:fieldId', authenticate, authorize(PERMISSIONS.CATEGORIES_VIEW), category.getCategoryField);
router.post('/categories/:id/fields', authenticate, authorize(PERMISSIONS.CATEGORIES_CREATE), validate(category.fieldSchema), category.createCategoryField);
router.put('/categories/:id/fields/:fieldId', authenticate, authorize(PERMISSIONS.CATEGORIES_UPDATE), validate(category.updateFieldSchema), category.updateCategoryField);
router.delete('/categories/:id/fields/:fieldId', authenticate, authorize(PERMISSIONS.CATEGORIES_DELETE), category.deleteCategoryField);

// Products
router.get('/products', authenticate, authorize(PERMISSIONS.PRODUCTS_VIEW), product.getProducts);
router.get('/products/search', authenticate, authorize(PERMISSIONS.PRODUCTS_VIEW), product.advancedSearch);
router.get('/products/barcode/:barcode', authenticate, authorize(PERMISSIONS.PRODUCTS_VIEW), product.getProductByBarcode);
router.get('/products/:id', authenticate, authorize(PERMISSIONS.PRODUCTS_VIEW), product.getProduct);
router.post('/products', authenticate, authorize(PERMISSIONS.PRODUCTS_CREATE), validate(product.productSchema), product.createProduct);
router.put('/products/:id', authenticate, authorize(PERMISSIONS.PRODUCTS_UPDATE), validate(product.updateProductSchema), product.updateProduct);
router.delete('/products/:id', authenticate, authorize(PERMISSIONS.PRODUCTS_DELETE), product.deleteProduct);
router.post('/products/:id/image', authenticate, authorize(PERMISSIONS.PRODUCTS_UPDATE), upload.single('image'), product.uploadProductImage);

// Inventory
router.post('/inventory/stock-in', authenticate, authorize(PERMISSIONS.INVENTORY_MANAGE), validate(inventory.stockMovementBodySchema), inventory.stockIn);
router.post('/inventory/stock-out', authenticate, authorize(PERMISSIONS.INVENTORY_MANAGE), validate(inventory.stockMovementBodySchema), inventory.stockOut);
router.post('/inventory/adjust', authenticate, authorize(PERMISSIONS.INVENTORY_MANAGE), validate(inventory.stockAdjustBodySchema), inventory.adjustStock);
router.post('/inventory/damaged', authenticate, authorize(PERMISSIONS.INVENTORY_MANAGE), validate(inventory.stockMovementBodySchema), inventory.damagedStock);
router.post('/inventory/transfer', authenticate, authorize(PERMISSIONS.INVENTORY_MANAGE), validate(inventory.stockMovementBodySchema), inventory.transferStock);
router.post('/inventory/audit', authenticate, authorize(PERMISSIONS.INVENTORY_MANAGE), inventory.inventoryAudit);
router.get('/inventory/transactions', authenticate, authorize(PERMISSIONS.INVENTORY_VIEW), inventory.getAllTransactions);
router.get('/inventory/history/:productId', authenticate, authorize(PERMISSIONS.INVENTORY_VIEW), inventory.getHistory);
router.get('/inventory/valuation', authenticate, authorize(PERMISSIONS.INVENTORY_VIEW), inventory.getValuation);

// Customers
router.get('/customers/picker', authenticate, authorize(PERMISSIONS.CUSTOMERS_VIEW, PERMISSIONS.PAYMENTS_MANAGE, PERMISSIONS.POS_ACCESS), customer.getCustomersPicker);
router.get('/customers', authenticate, authorize(PERMISSIONS.CUSTOMERS_VIEW), customer.getCustomers);
router.get('/customers/:id', authenticate, authorize(PERMISSIONS.CUSTOMERS_VIEW), customer.getCustomer);
router.post('/customers', authenticate, authorize(PERMISSIONS.CUSTOMERS_MANAGE), validate(customer.customerSchema), customer.createCustomer);
router.put('/customers/:id', authenticate, authorize(PERMISSIONS.CUSTOMERS_MANAGE), validate(customer.updateCustomerSchema), customer.updateCustomer);
router.delete('/customers/:id', authenticate, authorize(PERMISSIONS.CUSTOMERS_MANAGE), customer.deleteCustomer);
router.post('/customers/:id/notes', authenticate, authorize(PERMISSIONS.CUSTOMERS_MANAGE), customer.addCustomerNote);
router.get('/customers/:id/ledger', authenticate, authorize(PERMISSIONS.ACCOUNTING_VIEW), customer.getCustomerLedger);
router.get('/customers/:id/payment-context', authenticate, authorize(PERMISSIONS.PAYMENTS_MANAGE, PERMISSIONS.CUSTOMERS_VIEW), credit.getCustomerPaymentContext);
router.get('/customers/:id/summary', authenticate, authorize(PERMISSIONS.CUSTOMERS_VIEW), credit.getCustomerAccountSummary);
router.get('/customers/:id/credit-check', authenticate, authorize(PERMISSIONS.SALES_CREATE), credit.checkCustomerCredit);
router.get('/customers/:id/ledger/validate', authenticate, authorize(PERMISSIONS.ACCOUNTING_VIEW), credit.validateCustomerLedger);
router.post('/customers/:id/receive-payment', authenticate, authorize(PERMISSIONS.PAYMENTS_MANAGE), validate(credit.receivePaymentSchema), credit.receiveCustomerPayment);
router.get('/customers/:id/statement/pdf', authenticate, authorize(PERMISSIONS.ACCOUNTING_VIEW), credit.downloadCustomerStatement);
router.get('/customers/:id/statement/whatsapp', authenticate, authorize(PERMISSIONS.CUSTOMERS_VIEW), credit.getWhatsAppStatementLink);
router.post('/customers/:id/opening-balance', authenticate, authorize(PERMISSIONS.ACCOUNTING_MANAGE), credit.setCustomerOpeningBalance);
router.post('/customers/:id/adjustment', authenticate, authorize(PERMISSIONS.ACCOUNTING_MANAGE), credit.manualLedgerAdjustment);
router.post('/customers/:id/bad-debt', authenticate, authorize(PERMISSIONS.ACCOUNTING_MANAGE), credit.markCustomerBadDebt);
router.get('/customers/:id/risk', authenticate, authorize(PERMISSIONS.CUSTOMERS_VIEW), credit.getCustomerRiskAnalysis);

// Suppliers
router.get('/suppliers', authenticate, authorize(PERMISSIONS.SUPPLIERS_VIEW), supplier.getSuppliers);
router.get('/suppliers/:id', authenticate, authorize(PERMISSIONS.SUPPLIERS_VIEW), supplier.getSupplier);
router.post('/suppliers', authenticate, authorize(PERMISSIONS.SUPPLIERS_MANAGE), validate(supplier.supplierSchema), supplier.createSupplier);
router.put('/suppliers/:id', authenticate, authorize(PERMISSIONS.SUPPLIERS_MANAGE), supplier.updateSupplier);
router.delete('/suppliers/:id', authenticate, authorize(PERMISSIONS.SUPPLIERS_MANAGE), supplier.deleteSupplier);
router.get('/suppliers/:id/ledger', authenticate, authorize(PERMISSIONS.ACCOUNTING_VIEW), credit.getSupplierLedgerView);
router.get('/suppliers/:id/summary', authenticate, authorize(PERMISSIONS.SUPPLIERS_VIEW), credit.getSupplierAccountSummary);
router.get('/suppliers/:id/ledger/validate', authenticate, authorize(PERMISSIONS.ACCOUNTING_VIEW), credit.validateSupplierLedger);
router.post('/suppliers/:id/make-payment', authenticate, authorize(PERMISSIONS.PAYMENTS_MANAGE), validate(credit.makeSupplierPaymentSchema), credit.makeSupplierPayment);
router.post('/suppliers/:id/opening-balance', authenticate, authorize(PERMISSIONS.ACCOUNTING_MANAGE), credit.setSupplierOpeningBalance);

// Purchases
router.get('/purchases', authenticate, authorize(PERMISSIONS.PURCHASES_VIEW), purchase.getPurchases);
router.get('/purchases/:id', authenticate, authorize(PERMISSIONS.PURCHASES_VIEW), purchase.getPurchase);
router.post('/purchases', authenticate, authorize(PERMISSIONS.PURCHASES_MANAGE), validate(purchase.purchaseSchema), purchase.createPurchase);
router.post('/purchases/:id/receive', authenticate, authorize(PERMISSIONS.PURCHASES_MANAGE), validate(purchase.receivePurchaseSchema), purchase.receivePurchase);
router.post('/purchases/:id/cancel', authenticate, authorize(PERMISSIONS.PURCHASES_MANAGE), purchase.cancelPurchase);

// Sales & POS
router.get('/sales', authenticate, authorize(PERMISSIONS.SALES_VIEW), sale.getSales);
router.get('/sales/:id', authenticate, authorize(PERMISSIONS.SALES_VIEW), sale.getSale);
router.post('/sales', authenticate, authorize(PERMISSIONS.SALES_CREATE, PERMISSIONS.POS_ACCESS), saleCreateRateLimit, validate(sale.saleSchema), sale.createSale);
router.post('/sales/:id/cancel', authenticate, authorize(PERMISSIONS.SALES_CREATE), sale.cancelSale);
router.get('/sales/:id/pdf', authenticate, authorize(PERMISSIONS.SALES_VIEW), sale.downloadInvoicePDF);

// Orders
router.get('/orders', authenticate, authorize(PERMISSIONS.ORDERS_VIEW), order.getOrders);
router.get('/orders/:id', authenticate, authorize(PERMISSIONS.ORDERS_VIEW), order.getOrder);
router.post('/orders', authenticate, authorize(PERMISSIONS.ORDERS_MANAGE), validate(order.orderSchema), order.createOrder);
router.post('/orders/:id/deliver', authenticate, authorize(PERMISSIONS.ORDERS_MANAGE), order.deliverOrder);
router.post('/orders/:id/cancel', authenticate, authorize(PERMISSIONS.ORDERS_MANAGE), order.cancelOrder);

// Payments & Accounting
router.get('/payments', authenticate, authorize(PERMISSIONS.ACCOUNTING_VIEW), payment.getPayments);
router.post('/payments', authenticate, authorize(PERMISSIONS.PAYMENTS_MANAGE), validate(payment.paymentSchema), payment.createPayment);
router.get('/accounting/cash-book', authenticate, authorize(PERMISSIONS.ACCOUNTING_VIEW), payment.getCashBook);
router.get('/accounting/bank-book', authenticate, authorize(PERMISSIONS.ACCOUNTING_VIEW), payment.getBankBook);
router.get('/accounting/reconciliation', authenticate, authorize(PERMISSIONS.ACCOUNTING_MANAGE), reconciliation.getReconciliationReport);
router.get('/accounting/reconciliation/export', authenticate, authorize(PERMISSIONS.ACCOUNTING_MANAGE), reconciliation.exportReconciliationReport);

// Expenses
router.get('/expenses', authenticate, authorize(PERMISSIONS.ACCOUNTING_VIEW), expense.getExpenses);
router.post('/expenses', authenticate, authorize(PERMISSIONS.ACCOUNTING_MANAGE), validate(expense.expenseSchema), expense.createExpense);
router.put('/expenses/:id', authenticate, authorize(PERMISSIONS.ACCOUNTING_MANAGE), validate(expense.updateExpenseSchema), expense.updateExpense);
router.delete('/expenses/:id', authenticate, authorize(PERMISSIONS.ACCOUNTING_MANAGE), expense.deleteExpense);

// Reports & Dashboard
router.get('/dashboard', authenticate, authorize(PERMISSIONS.REPORTS_VIEW), report.getDashboard);
router.get('/reports/sales', authenticate, authorize(PERMISSIONS.REPORTS_VIEW), report.salesReport);
router.get('/reports/stock', authenticate, authorize(PERMISSIONS.REPORTS_VIEW), report.stockReport);
router.get('/reports/profit', authenticate, authorize(PERMISSIONS.REPORTS_VIEW), report.profitReport);
router.get('/reports/customers', authenticate, authorize(PERMISSIONS.REPORTS_VIEW), report.customerReport);
router.get('/reports/aging', authenticate, authorize(PERMISSIONS.REPORTS_VIEW), credit.getAgingReportHandler);
router.get('/reports/outstanding', authenticate, authorize(PERMISSIONS.REPORTS_VIEW), credit.getOutstandingReportHandler);
router.get('/credit/dashboard', authenticate, authorize(PERMISSIONS.ACCOUNTING_VIEW), credit.getCreditDashboardHandler);

// Notifications
router.get('/notifications', authenticate, report.getNotifications);
router.put('/notifications/:id/read', authenticate, report.markNotificationRead);
router.put('/notifications/read-all', authenticate, report.markAllNotificationsRead);

// Audit
router.get('/audit-logs', authenticate, authorize(PERMISSIONS.AUDIT_VIEW), audit.getAuditLogs);
router.get('/audit-logs/login-history', authenticate, authorize(PERMISSIONS.AUDIT_VIEW), audit.getLoginHistory);

// Settings
router.get('/settings', authenticate, authorize(PERMISSIONS.SETTINGS_MANAGE), settings.getSettings);
router.put('/settings', authenticate, authorize(PERMISSIONS.SETTINGS_MANAGE), settings.updateSettings);

// Import/Export
router.get('/export/products', authenticate, authorize(PERMISSIONS.IMPORT_EXPORT), importExport.exportProducts);
router.get('/export/customers', authenticate, authorize(PERMISSIONS.IMPORT_EXPORT), importExport.exportCustomers);
router.post('/import/products', authenticate, authorize(PERMISSIONS.IMPORT_EXPORT), importExport.bulkImportProducts);
router.post('/import/stock', authenticate, authorize(PERMISSIONS.IMPORT_EXPORT), importExport.bulkStockUpdate);

export default router;
