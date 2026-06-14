import { Sale, SaleStatus } from '../models/Sale';
import { Product } from '../models/Product';
import { Customer } from '../models/Customer';
import { Supplier } from '../models/Supplier';
import { Purchase } from '../models/Purchase';
import { Payment } from '../models/Payment';
import { getInventoryValuation } from './stockService';
import { getCreditDashboard } from './ledgerService';

const getDateRange = (period: string) => {
  const now = new Date();
  const start = new Date();

  switch (period) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'week':
      start.setDate(now.getDate() - 7);
      break;
    case 'month':
      start.setMonth(now.getMonth() - 1);
      break;
    case 'year':
      start.setFullYear(now.getFullYear() - 1);
      break;
    default:
      start.setHours(0, 0, 0, 0);
  }

  return { start, end: now };
};

export const getDashboardStats = async () => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [todaySales, lowStockProducts, topProducts, receivables, payables, inventory] =
    await Promise.all([
      Sale.aggregate([
        { $match: { createdAt: { $gte: todayStart }, status: 'completed' } },
        {
          $group: {
            _id: null,
            totalSales: { $sum: '$total' },
            totalOrders: { $sum: 1 },
            totalProfit: {
              $sum: {
                $subtract: [
                  '$total',
                  {
                    $reduce: {
                      input: '$items',
                      initialValue: 0,
                      in: { $add: ['$$value', { $multiply: ['$$this.quantity', 0] }] },
                    },
                  },
                ],
              },
            },
          },
        },
      ]),
      Product.find({
        status: 'active',
        $expr: { $lte: ['$currentStock', '$reorderLevel'] },
      })
        .populate('category', 'name')
        .limit(10),
      Sale.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            name: { $first: '$items.productName' },
            totalQty: { $sum: '$items.quantity' },
            totalRevenue: { $sum: '$items.total' },
          },
        },
        { $sort: { totalQty: -1 } },
        { $limit: 5 },
      ]),
      Customer.aggregate([{ $group: { _id: null, total: { $sum: '$outstandingAmount' } } }]),
      Supplier.aggregate([{ $group: { _id: null, total: { $sum: '$outstandingAmount' } } }]),
      getInventoryValuation(),
    ]);

  const salesData = todaySales[0] || { totalSales: 0, totalOrders: 0, totalProfit: 0 };
  const creditStats = await getCreditDashboard();

  return {
    todaySales: salesData.totalSales,
    todayProfit: salesData.totalProfit,
    todayOrders: salesData.totalOrders,
    lowStockProducts,
    topProducts,
    outstandingReceivables: receivables[0]?.total || 0,
    outstandingPayables: payables[0]?.total || 0,
    inventoryValue: inventory.wholesaleValue,
    credit: creditStats,
  };
};

export const getSalesReport = async (period = 'month') => {
  const { start, end } = getDateRange(period);

  const [salesSummary, dailySales, categorySales] = await Promise.all([
    Sale.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, status: 'completed' } },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$total' },
          totalOrders: { $sum: 1 },
          avgOrderValue: { $avg: '$total' },
        },
      },
    ]),
    Sale.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, status: 'completed' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          total: { $sum: '$total' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Sale.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, status: 'completed' } },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      {
        $lookup: {
          from: 'categories',
          localField: 'product.category',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: '$category' },
      {
        $group: {
          _id: '$category.name',
          total: { $sum: '$items.total' },
          quantity: { $sum: '$items.quantity' },
        },
      },
      { $sort: { total: -1 } },
    ]),
  ]);

  return { summary: salesSummary[0] || {}, dailySales, categorySales };
};

export const getStockReport = async () => {
  const [deadStock, slowMoving, fastMoving] = await Promise.all([
    Product.find({ status: 'active', currentStock: { $gt: 0 } })
      .sort({ updatedAt: 1 })
      .limit(20)
      .populate('category', 'name'),
    Product.find({ status: 'active' }).sort({ currentStock: -1 }).limit(10).populate('category', 'name'),
    Sale.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.productName' },
          totalSold: { $sum: '$items.quantity' },
        },
      },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
    ]),
  ]);

  return { deadStock, slowMoving, fastMoving };
};

export const getProfitReport = async (period = 'month') => {
  const { start, end } = getDateRange(period);

  const sales = await Sale.find({
    createdAt: { $gte: start, $lte: end },
    status: SaleStatus.COMPLETED,
  }).populate('items.product');

  let revenue = 0;
  let cost = 0;

  for (const sale of sales) {
    revenue += sale.total;
    for (const item of sale.items) {
      const product = await Product.findById(item.product);
      if (product) cost += item.quantity * product.purchasePrice;
    }
  }

  const purchases = await Purchase.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end }, status: { $in: ['received', 'partial'] } } },
    { $group: { _id: null, total: { $sum: '$total' } } },
  ]);

  return {
    revenue,
    cost,
    grossProfit: revenue - cost,
    profitMargin: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
    purchases: purchases[0]?.total || 0,
  };
};

export const getCustomerReport = async () => {
  return Customer.find({ isActive: true })
    .sort({ outstandingAmount: -1 })
    .limit(10)
    .select('name phone outstandingAmount creditLimit');
};

export const getSalesGraph = async (days = 30) => {
  const start = new Date();
  start.setDate(start.getDate() - days);

  return Sale.aggregate([
    { $match: { createdAt: { $gte: start }, status: 'completed' } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        sales: { $sum: '$total' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
};

export const getLedger = async (entity: 'customer' | 'supplier', entityId: string) => {
  if (entity === 'customer') {
    const [sales, payments] = await Promise.all([
      Sale.find({ customer: entityId }).sort({ createdAt: -1 }),
      Payment.find({ customer: entityId }).sort({ date: -1 }),
    ]);
    return { sales, payments };
  }

  const [purchases, payments] = await Promise.all([
    Purchase.find({ supplier: entityId }).sort({ createdAt: -1 }),
    Payment.find({ supplier: entityId }).sort({ date: -1 }),
  ]);
  return { purchases, payments };
};
