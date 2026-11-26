import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { reconcileInvoiceFigures, type InvoiceLineFigures, type InvoiceTotalFigures } from '@/lib/invoices/invoice-math';

export class InvoiceError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409,
  ) {
    super(message);
  }
}

export interface InvoiceLine extends InvoiceLineFigures {
  name: string;
  variantLabel: string;
  sku: string;
  hsnCode: string | null;
}

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  orderNumber: string;
  orderDate: string;
  channel: 'online' | 'pos';
  paymentMethod: 'online' | 'cash' | 'credit';
  paymentStatus: string;
  paymentProvider: string | null;
  couponCode: string | null;
  customer: { name: string; mobile: string | null; email: string | null };
  deliveryAddress: string | null;
  fulfilment: 'pickup' | 'delivery';
  store: {
    name: string;
    gstin: string | null;
    addressLines: string[];
    phone: string | null;
    email: string | null;
    logoUrl: string | null;
  };
  lines: InvoiceLine[];
  totals: InvoiceTotalFigures;
  refundedPaise: number;
}

/** Resolves a guest's order id from their session. Returns null for any other guest or any unknown order. */
export async function findGuestOrderId(storeId: string, sessionId: string, orderNumber: string): Promise<string | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from('orders')
    .select('id')
    .eq('store_id', storeId)
    .eq('guest_session_id', sessionId)
    .eq('order_number', orderNumber)
    .maybeSingle();
  if (error) throw new Error('Could not load order');
  return data ? (data.id as string) : null;
}

function joinAddress(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const parts = Object.values(value as Record<string, unknown>).filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Loads everything a printed invoice shows, from the stored invoice and order rows.
 * Callers must authorise the order first (owner RLS or the guest session). This function uses the service role.
 * Throws InvoiceError when the invoice does not exist yet or when its stored figures do not reconcile.
 */
export async function loadInvoiceForOrder(storeId: string, orderId: string): Promise<InvoiceData> {
  const admin = createSupabaseAdminClient();

  const { data: invoice, error: invoiceError } = await admin
    .from('invoices')
    .select('invoice_number, invoice_date, taxable_paise, tax_paise, total_paise, seller_legal_name, seller_billing_address, seller_gstin, seller_state')
    .eq('store_id', storeId)
    .eq('order_id', orderId)
    .maybeSingle();
  if (invoiceError) throw new Error('Could not load invoice');
  if (!invoice) throw new InvoiceError('No invoice has been issued for this order yet.', 404);

  const { data: order, error: orderError } = await admin
    .from('orders')
    .select(
      `order_number, created_at, channel, payment_method, payment_status, customer_name, customer_mobile, customer_email,
       fulfilment, delivery_address, coupon_code, subtotal_paise, discount_paise, taxable_paise, tax_paise, delivery_paise, total_paise,
       order_items(product_name_snapshot, variant_label_snapshot, sku_snapshot, hsn_code_snapshot, quantity, unit_price_paise,
                   discount_paise, gst_rate_bps, taxable_paise, tax_paise, line_total_paise)`,
    )
    .eq('id', orderId)
    .eq('store_id', storeId)
    .maybeSingle();
  if (orderError) throw new Error('Could not load order');
  if (!order) throw new InvoiceError('Order not found.', 404);

  const { data: store, error: storeError } = await admin
    .from('stores')
    .select('name, gstin, address_line, city, state, pincode, phone, email, logo_url')
    .eq('id', storeId)
    .maybeSingle();
  if (storeError || !store) throw new Error('Could not load store');

  const { data: payment } = await admin
    .from('payments')
    .select('provider, status')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: refunds, error: refundError } = await admin
    .from('refunds')
    .select('amount_paise')
    .eq('order_id', orderId)
    .eq('status', 'succeeded');
  if (refundError) throw new Error('Could not load refunds');

  const items = (order.order_items ?? []) as {
    product_name_snapshot: string;
    variant_label_snapshot: string;
    sku_snapshot: string;
    hsn_code_snapshot: string | null;
    quantity: number;
    unit_price_paise: number;
    discount_paise: number;
    gst_rate_bps: number;
    taxable_paise: number;
    tax_paise: number;
    line_total_paise: number;
  }[];

  const lines: InvoiceLine[] = items.map((item) => ({
    name: item.product_name_snapshot,
    variantLabel: item.variant_label_snapshot,
    sku: item.sku_snapshot,
    hsnCode: item.hsn_code_snapshot,
    quantity: Number(item.quantity),
    unitPricePaise: item.unit_price_paise,
    discountPaise: item.discount_paise,
    gstRateBps: item.gst_rate_bps,
    taxablePaise: item.taxable_paise,
    taxPaise: item.tax_paise,
    lineTotalPaise: item.line_total_paise,
  }));

  const totals: InvoiceTotalFigures = {
    subtotalPaise: order.subtotal_paise as number,
    discountPaise: order.discount_paise as number,
    taxablePaise: order.taxable_paise as number,
    taxPaise: order.tax_paise as number,
    deliveryPaise: order.delivery_paise as number,
    totalPaise: order.total_paise as number,
  };

  // The printed figures must match the stored invoice record and the lines. A mismatch means the data is
  // inconsistent, so the invoice is refused rather than printed with figures that do not add up.
  const problems = reconcileInvoiceFigures(lines, totals);
  if (
    (invoice.taxable_paise as number) !== totals.taxablePaise ||
    (invoice.tax_paise as number) !== totals.taxPaise ||
    (invoice.total_paise as number) !== totals.totalPaise
  ) {
    problems.push('The stored invoice does not match the order totals.');
  }
  if (problems.length > 0) {
    throw new InvoiceError('This invoice cannot be printed because its figures do not reconcile. Please contact the store.', 409);
  }

  // Seller details come from the snapshot taken when the invoice was issued, so later changes to the store
  // do not alter it. Only an invoice without a snapshot falls back to the store's current details.
  const hasSnapshot = typeof invoice.seller_legal_name === 'string';
  const addressLines = hasSnapshot
    ? [invoice.seller_billing_address, invoice.seller_state].filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    : [store.address_line, store.city, store.state, store.pincode].filter((v): v is string => typeof v === 'string' && v.trim() !== '');

  const refundedPaise = (refunds ?? []).reduce((sum, row) => sum + Number(row.amount_paise), 0);

  return {
    invoiceNumber: invoice.invoice_number as string,
    invoiceDate: invoice.invoice_date as string,
    orderNumber: order.order_number as string,
    orderDate: order.created_at as string,
    channel: order.channel as 'online' | 'pos',
    paymentMethod: order.payment_method as 'online' | 'cash' | 'credit',
    paymentStatus: order.payment_status as string,
    paymentProvider: (payment?.provider as string | undefined) ?? null,
    couponCode: (order.coupon_code as string | null) ?? null,
    customer: {
      name: order.customer_name as string,
      mobile: (order.customer_mobile as string | null) ?? null,
      email: (order.customer_email as string | null) ?? null,
    },
    deliveryAddress: joinAddress(order.delivery_address),
    fulfilment: order.fulfilment as 'pickup' | 'delivery',
    store: {
      name: hasSnapshot ? (invoice.seller_legal_name as string) : (store.name as string),
      gstin: hasSnapshot ? ((invoice.seller_gstin as string | null) ?? null) : ((store.gstin as string | null) ?? null),
      addressLines,
      phone: (store.phone as string | null) ?? null,
      email: (store.email as string | null) ?? null,
      logoUrl: (store.logo_url as string | null) ?? null,
    },
    lines,
    totals,
    refundedPaise,
  };
}
