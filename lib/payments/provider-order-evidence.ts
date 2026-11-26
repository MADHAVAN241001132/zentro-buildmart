/*
 * Pure checks that a Razorpay order read by id matches the guest's payment attempt before an administrator
 * attaches it. No network access and no server-only imports, so the rules can be unit tested directly.
 */

export interface ExpectedProviderOrder {
  providerOrderId: string;
  expectedAmountPaise: number;
  currency: string;
  orderNumber: string;
}

export interface ReadProviderOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: string;
}

/** Order statuses that Razorpay documents for an order: created, attempted or paid. Anything else is refused. */
const ATTACHABLE_STATUSES = new Set(['created', 'attempted', 'paid']);

/**
 * Returns null when the provider order matches every expected fact, otherwise a short reason for the administrator.
 * Every field is compared exactly: id, amount in paise, currency, receipt (the guest's order number) and status.
 */
export function providerOrderMismatch(expected: ExpectedProviderOrder, actual: ReadProviderOrder): string | null {
  if (actual.id !== expected.providerOrderId) return 'provider returned a different order id';
  if (actual.amount !== expected.expectedAmountPaise) return 'provider order amount does not match the expected amount';
  if (actual.currency !== expected.currency) return 'provider order currency does not match';
  if (actual.receipt !== expected.orderNumber) return 'provider order receipt does not match this order number';
  if (!ATTACHABLE_STATUSES.has(actual.status)) return `provider order status "${actual.status}" cannot be attached`;
  return null;
}
