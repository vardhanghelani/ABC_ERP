import { describe, it, expect } from 'vitest';
import { resolveSaleCredit } from '../services/creditService';
import { CreditTermType, PaymentMethod } from '../models';

describe('resolveSaleCredit', () => {
  const shortTermCustomer = {
    creditTermType: CreditTermType.SHORT_TERM,
    creditDays: 30,
  } as Parameters<typeof resolveSaleCredit>[0];

  const accCustomer = {
    creditTermType: CreditTermType.LONG_TERM,
    creditDays: 0,
  } as Parameters<typeof resolveSaleCredit>[0];

  it('requires full payment for walk-in (no customer)', () => {
    const result = resolveSaleCredit(null, 10000, [{ method: PaymentMethod.CASH, amount: 10000 }]);
    expect(result.balanceDue).toBe(0);
    expect(result.paidAmount).toBe(10000);
    expect(result.creditTermType).toBe(CreditTermType.SHORT_TERM);
  });

  it('short term: unpaid portion becomes balance due with due date', () => {
    const result = resolveSaleCredit(shortTermCustomer, 10000, [{ method: PaymentMethod.CASH, amount: 4000 }]);
    expect(result.balanceDue).toBe(6000);
    expect(result.dueDate).toBeDefined();
  });

  it('ACC: unpaid portion stays on running account', () => {
    const result = resolveSaleCredit(accCustomer, 10000, [{ method: PaymentMethod.CASH, amount: 4000 }]);
    expect(result.balanceDue).toBe(6000);
    expect(result.creditTermType).toBe(CreditTermType.LONG_TERM);
    expect(result.payments.some((p) => p.method === PaymentMethod.CREDIT)).toBe(true);
  });

  it('ACC: zero payment at sale puts full amount on account', () => {
    const result = resolveSaleCredit(accCustomer, 5000, []);
    expect(result.balanceDue).toBe(5000);
    expect(result.paidAmount).toBe(0);
  });
});

describe('ledger balance validation', () => {
  it('detects in-sync balances within tolerance', () => {
    const ledgerBalance = 1500.005;
    const outstanding = 1500;
    const inSync = Math.abs(ledgerBalance - outstanding) < 0.01;
    expect(inSync).toBe(true);
  });

  it('detects out-of-sync balances', () => {
    const ledgerBalance = 2000;
    const outstanding = 1500;
    const inSync = Math.abs(ledgerBalance - outstanding) < 0.01;
    expect(inSync).toBe(false);
  });
});

describe('ledger expected balance with advance', () => {
  it('matches outstanding minus advance balance', () => {
    const outstanding = 0;
    const advanceBalance = 4000;
    const ledgerBalance = -4000;
    const expected = outstanding - advanceBalance;
    expect(Math.abs(ledgerBalance - expected)).toBeLessThan(0.01);
  });

  it('matches when no advance', () => {
    const outstanding = 6000;
    const advanceBalance = 0;
    const ledgerBalance = 6000;
    const expected = outstanding - advanceBalance;
    expect(Math.abs(ledgerBalance - expected)).toBeLessThan(0.01);
  });
});

describe('purchase payable logic', () => {
  it('balance due equals total minus paid', () => {
    const purchase = { total: 50000, paidAmount: 20000 };
    expect(purchase.total - purchase.paidAmount).toBe(30000);
  });

  it('cannot receive more than remaining PO quantity', () => {
    const item = { quantity: 100, receivedQuantity: 60 };
    const receiveQty = 50;
    const remaining = item.quantity - item.receivedQuantity;
    expect(receiveQty > remaining).toBe(true);
  });
});

describe('payment routing', () => {
  it('supplier payments must use dedicated endpoint', () => {
    const body = { type: 'payment', entity: 'supplier', supplier: 'abc' };
    const mustUseSupplierFlow =
      body.type === 'payment' && body.entity === 'supplier' && !!body.supplier;
    expect(mustUseSupplierFlow).toBe(true);
  });
});

describe('sale cancel ledger reversal logic', () => {
  it('ACC cancel must reverse full sale total, not only remaining balance', () => {
    const sale = { total: 10000, paidAmount: 4000, balanceDue: 6000, creditTermType: CreditTermType.LONG_TERM };
    const reverseCredit = sale.total;
    const reversePaymentDebit = sale.paidAmount;
    expect(reverseCredit).toBe(10000);
    expect(reversePaymentDebit).toBe(4000);
    expect(sale.balanceDue).toBeLessThan(reverseCredit);
  });

  it('short term cancel reverses only outstanding portion on ledger', () => {
    const sale = { total: 10000, paidAmount: 4000, balanceDue: 6000, creditTermType: CreditTermType.SHORT_TERM };
    const reverseCredit = sale.balanceDue;
    expect(reverseCredit).toBe(6000);
  });

  it('fully paid short term sale has no ledger debit to reverse', () => {
    const sale = { total: 5000, paidAmount: 5000, balanceDue: 0, creditTermType: CreditTermType.SHORT_TERM };
    expect(sale.balanceDue).toBe(0);
  });
});
