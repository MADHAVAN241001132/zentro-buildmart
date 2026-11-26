/**
 * Razorpay REST client (server only). Uses fetch with HTTP Basic auth against
 * https://api.razorpay.com/v1. Credentials come from the environment and are never sent to the browser.
 */
import 'server-only';
import { requireEnv } from '@/lib/env';

const BASE_URL = 'https://api.razorpay.com/v1';

export class RazorpayApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** True when the provider's error body carried its own description (an explicit provider answer). */
    readonly hasProviderBody: boolean = false,
  ) {
    super(message);
  }
}

function authHeader(): string {
  const keyId = requireEnv('RAZORPAY_KEY_ID');
  const keySecret = requireEnv('RAZORPAY_KEY_SECRET');
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const json = (await response.json().catch(() => ({}))) as { error?: { description?: string } } & T;
  if (!response.ok) {
    throw new RazorpayApiError(json.error?.description ?? `Razorpay request failed (${response.status})`, response.status, Boolean(json.error?.description));
  }
  return json;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

/** Creates a Razorpay order. Amount is in paise. The receipt is our order number. */
export function createRazorpayOrder(input: { amountPaise: number; receipt: string; notes?: Record<string, string> }) {
  return call<RazorpayOrder>('/orders', {
    amount: input.amountPaise,
    currency: 'INR',
    receipt: input.receipt,
    notes: input.notes ?? {},
  });
}

export function createRazorpayRefund(input: { paymentId: string; amountPaise: number; receipt?: string }) {
  return call<{ id: string; status: string; amount: number }>(`/payments/${input.paymentId}/refund`, {
    amount: input.amountPaise,
    speed: 'normal',
    receipt: input.receipt,
  });
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: { Authorization: authHeader() },
    cache: 'no-store',
  });
  const json = (await response.json().catch(() => ({}))) as { error?: { description?: string } } & T;
  if (!response.ok) {
    throw new RazorpayApiError(json.error?.description ?? `Razorpay request failed (${response.status})`, response.status);
  }
  return json;
}

export interface RazorpayRefund {
  id: string;
  amount: number;
  status: string;
  receipt?: string | null;
  payment_id?: string | null;
}

/**
 * Lists every refund Razorpay holds for a payment, for reconciliation. Pages of 100 up to 1000 refunds.
 * Razorpay documents this list as the source of truth for refunds made on a payment.
 */
export async function listRazorpayPaymentRefunds(paymentId: string): Promise<RazorpayRefund[]> {
  const all: RazorpayRefund[] = [];
  for (let skip = 0; skip < 1000; skip += 100) {
    const page = await getJson<{ items: RazorpayRefund[] }>(
      `/payments/${encodeURIComponent(paymentId)}/refunds?count=100&skip=${skip}`,
    );
    all.push(...(page.items ?? []));
    if ((page.items ?? []).length < 100) break;
  }
  return all;
}

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: string;
}

/** Reads a payment from Razorpay so a browser callback is checked against the provider, not trusted alone. */
export function fetchRazorpayPayment(paymentId: string) {
  return getJson<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

export interface RazorpayOrderDetail {
  id: string;
  entity?: string;
  amount: number;
  amount_paid?: number;
  currency: string;
  receipt: string | null;
  status: string;
}

/**
 * Reads one order by its exact id (GET /orders/{id}). Used before an administrator attaches a provider order to a
 * guest's payment attempt. Lookup by id is deterministic; an empty search result is never treated as absence.
 */
export function fetchRazorpayOrder(orderId: string) {
  return getJson<RazorpayOrderDetail>(`/orders/${encodeURIComponent(orderId)}`);
}
