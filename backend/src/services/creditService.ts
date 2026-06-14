import { CreditTermType, PaymentMethod } from '../models';
import { ISalePayment } from '../models/Sale';
import { ICustomer } from '../models/Customer';

export interface ResolvedSaleCredit {
  paidAmount: number;
  balanceDue: number;
  payments: ISalePayment[];
  dueDate?: Date;
  creditTermType: CreditTermType;
  /** Unpaid portion that will be added to running outstanding */
  onAccountAmount: number;
}

/**
 * SHORT TERM: Each invoice has its own due date. Unpaid portion is invoice credit.
 * LONG TERM (ACC): Running account — customer pays some now, rest ALWAYS goes on
 * account automatically. Next sale adds more. Payments reduce overall balance later.
 *
 * Example ACC:
 *   Sale 1: ₹10,000 total, paid ₹4,000 → ₹6,000 on account
 *   Sale 2: ₹5,000 total, paid ₹0    → ₹5,000 on account (outstanding ₹11,000)
 *   Payment: ₹8,000 received         → outstanding ₹3,000
 */
export const resolveSaleCredit = (
  customer: ICustomer | null,
  total: number,
  incomingPayments: ISalePayment[]
): ResolvedSaleCredit => {
  const creditTermType = customer?.creditTermType || CreditTermType.SHORT_TERM;

  // Sum actual cash/UPI/bank/card payments (exclude zero-amount credit placeholders)
  let paidAmount = incomingPayments
    .filter((p) => p.amount > 0)
    .reduce((sum, p) => sum + p.amount, 0);

  // Normalize payments array — keep real payments only
  let payments = incomingPayments.filter((p) => p.amount > 0);

  const balanceDue = Math.max(0, total - paidAmount);
  const onAccountAmount = balanceDue;

  if (creditTermType === CreditTermType.LONG_TERM && customer) {
    // ACC: unpaid portion always goes on running account (no per-invoice due date)
    if (balanceDue > 0 && !payments.some((p) => p.method === PaymentMethod.CREDIT)) {
      payments = [
        ...payments,
        { method: PaymentMethod.CREDIT, amount: balanceDue, reference: 'ACC - On Account' },
      ];
    }

    return {
      paidAmount,
      balanceDue,
      payments: payments.length > 0 ? payments : [{ method: PaymentMethod.CREDIT, amount: balanceDue, reference: 'ACC - On Account' }],
      dueDate: undefined,
      creditTermType: CreditTermType.LONG_TERM,
      onAccountAmount,
    };
  }

  // Short term: set due date on unpaid invoice portion
  let dueDate: Date | undefined;
  if (customer && balanceDue > 0) {
    dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (customer.creditDays || 30));
  }

  return {
    paidAmount,
    balanceDue,
    payments: payments.length > 0 ? payments : incomingPayments,
    dueDate,
    creditTermType: CreditTermType.SHORT_TERM,
    onAccountAmount: balanceDue,
  };
};

export const getCreditTermLabel = (type: CreditTermType): string => {
  return type === CreditTermType.LONG_TERM ? 'Long Term (ACC)' : 'Short Term';
};

export const getCreditTermDescription = (type: CreditTermType): string => {
  if (type === CreditTermType.LONG_TERM) {
    return 'Running account: pay some now, rest goes on account. Each sale adds to balance. Settle anytime.';
  }
  return 'Invoice credit: unpaid amount due within credit days. Each invoice tracked separately.';
};
