import 'server-only';
import { safeRatio, type ReportRange } from '@/lib/reports/report-math';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireReportStore } from '@/lib/services/report-access';

/**
 * Owner reports. All aggregation happens in migration 0020's database functions over the full period, so
 * Supabase row limits cannot cut totals short. Every call is scoped to one store by the owner's session.
 */

export interface Summary {
  orderCount: number;
  orderValuePaise: number;
  taxablePaise: number;
  gstPaise: number;
  discountPaise: number;
  collectedPaise: number;
  creditSalesPaise: number;
  onlineCount: number;
  onlineValuePaise: number;
  posCount: number;
  posValuePaise: number;
  payments: Record<'online' | 'cash' | 'credit', { count: number; valuePaise: number }>;
  cogsPaise: number;
  grossProfitPaise: number;
  refundsPaise: number;
  refundCount: number;
  refundPendingCount: number;
  refundPendingPaise: number;
  /** Gross profit after deducting refunds. Refund value is treated as lost revenue; the cost of returned stock is not recovered, so this is conservative. */
  refundAdjustedGrossProfitPaise: number;
  expensesPaise: number;
  netProfitEstimatePaise: number;
  averageOrderValuePaise: number;
  outstandingCreditPaise: number;
  inventoryValuationPaise: number;
  damagedUnits: number;
}

export interface TrendPoint {
  bucketStart: string;
  orders: number;
  orderValuePaise: number;
  taxablePaise: number;
  collectedPaise: number;
  creditPaise: number;
  onlineValuePaise: number;
  posValuePaise: number;
  refundsPaise: number;
}

export interface GroupRow {
  id: string | null;
  name: string;
  units: number;
  taxablePaise: number;
  cogsPaise: number;
  grossProfitPaise: number;
  lines: number;
}

export interface ProductRow {
  sku: string;
  name: string;
  units: number;
  taxablePaise: number;
  cogsPaise: number;
  grossProfitPaise: number;
  lastSoldAt: string | null;
}

export interface SlowMoverRow {
  sku: string;
  name: string;
  label: string;
  onHand: number;
  valueAtCostPaise: number;
  lastSoldAt: string | null;
}

export interface StockRow {
  sku: string;
  name: string;
  label: string;
  onHand: number;
  reserved: number;
  available: number;
  damaged: number;
  reorderLevel: number;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

export interface CouponRow {
  code: string;
  redemptions: number;
  discountPaise: number;
  orders: number;
}

export interface QuotationFigures {
  requests: number;
  sent: number;
  accepted: number;
  rejected: number;
  expired: number;
  converted: number;
  conversionRate: number;
  quotedValuePaise: number;
  convertedRevenuePaise: number;
}

export interface ReportFilters {
  categoryId: string | null;
  brandId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filters from the URL. Anything that is not a UUID is ignored rather than passed to the database. */
export function cleanFilters(categoryId: string | null | undefined, brandId: string | null | undefined): ReportFilters {
  return {
    categoryId: categoryId && UUID.test(categoryId) ? categoryId : null,
    brandId: brandId && UUID.test(brandId) ? brandId : null,
  };
}

function n(value: unknown): number {
  return Number(value ?? 0);
}

function fail(what: string): never {
  throw new Error(`Could not load ${what} for the report.`);
}

export async function reportSummary(storeId: string, range: ReportRange): Promise<Summary> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_summary', {
    p_store: storeId,
    p_start: range.startIso,
    p_end: range.endIso,
    p_from_date: range.fromDate,
    p_to_date: range.toDate,
  });
  if (error || !data) fail('the summary');
  const d = data as Record<string, number>;
  const grossProfit = n(d.taxablePaise) - n(d.cogsPaise);
  const expenses = n(d.expensesPaise);
  return {
    orderCount: n(d.orderCount),
    orderValuePaise: n(d.orderValuePaise),
    taxablePaise: n(d.taxablePaise),
    gstPaise: n(d.gstPaise),
    discountPaise: n(d.discountPaise),
    collectedPaise: n(d.collectedPaise),
    creditSalesPaise: n(d.creditSalesPaise),
    onlineCount: n(d.onlineCount),
    onlineValuePaise: n(d.onlineValuePaise),
    posCount: n(d.posCount),
    posValuePaise: n(d.posValuePaise),
    payments: {
      online: { count: n(d.paymentOnlineCount), valuePaise: n(d.paymentOnlineValuePaise) },
      cash: { count: n(d.paymentCashCount), valuePaise: n(d.paymentCashValuePaise) },
      credit: { count: n(d.paymentCreditCount), valuePaise: n(d.paymentCreditValuePaise) },
    },
    cogsPaise: n(d.cogsPaise),
    grossProfitPaise: grossProfit,
    refundsPaise: n(d.refundsPaise),
    refundCount: n(d.refundCount),
    refundPendingCount: n(d.refundPendingCount),
    refundPendingPaise: n(d.refundPendingPaise),
    refundAdjustedGrossProfitPaise: grossProfit - n(d.refundsPaise),
    expensesPaise: expenses,
    netProfitEstimatePaise: grossProfit - expenses,
    averageOrderValuePaise: Math.round(safeRatio(n(d.orderValuePaise), n(d.orderCount))),
    outstandingCreditPaise: n(d.outstandingCreditPaise),
    inventoryValuationPaise: n(d.inventoryValuationPaise),
    damagedUnits: n(d.damagedUnits),
  };
}

export async function reportTrend(storeId: string, range: ReportRange, bucket: 'day' | 'week' | 'month' | 'year'): Promise<TrendPoint[]> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_trend', {
    p_store: storeId, p_start: range.startIso, p_end: range.endIso, p_bucket: bucket, p_tz: 'Asia/Kolkata',
  });
  if (error) fail('the trend');
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    bucketStart: String(row.bucket_start),
    orders: n(row.orders),
    orderValuePaise: n(row.order_value_paise),
    taxablePaise: n(row.taxable_paise),
    collectedPaise: n(row.collected_paise),
    creditPaise: n(row.credit_paise),
    onlineValuePaise: n(row.online_value_paise),
    posValuePaise: n(row.pos_value_paise),
    refundsPaise: n(row.refunds_paise),
  }));
}

export async function groupSales(storeId: string, range: ReportRange, group: 'category' | 'brand', filters: ReportFilters): Promise<GroupRow[]> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_group_sales', {
    p_store: storeId, p_start: range.startIso, p_end: range.endIso, p_group: group,
    p_category: filters.categoryId, p_brand: filters.brandId,
  });
  if (error) fail(`${group} sales`);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const taxable = n(row.taxable_paise);
    const cogs = n(row.cogs_paise);
    return {
      id: (row.group_id as string | null) ?? null,
      name: String(row.group_name),
      units: n(row.units),
      taxablePaise: taxable,
      cogsPaise: cogs,
      grossProfitPaise: taxable - cogs,
      lines: n(row.line_count),
    };
  });
}

export async function productSales(storeId: string, range: ReportRange, filters: ReportFilters): Promise<ProductRow[]> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_product_sales', {
    p_store: storeId, p_start: range.startIso, p_end: range.endIso,
    p_category: filters.categoryId, p_brand: filters.brandId,
  });
  if (error) fail('product sales');
  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const taxable = n(row.taxable_paise);
    const cogs = n(row.cogs_paise);
    return {
      sku: String(row.sku),
      name: String(row.product_name),
      units: n(row.units),
      taxablePaise: taxable,
      cogsPaise: cogs,
      grossProfitPaise: taxable - cogs,
      lastSoldAt: (row.last_sold_at as string | null) ?? null,
    };
  });
}

export async function slowMovers(storeId: string, range: ReportRange, filters: ReportFilters): Promise<SlowMoverRow[]> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_slow_movers', {
    p_store: storeId, p_start: range.startIso, p_end: range.endIso,
    p_category: filters.categoryId, p_brand: filters.brandId,
  });
  if (error) fail('slow-moving stock');
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    sku: String(row.sku),
    name: String(row.product_name),
    label: String(row.label ?? ''),
    onHand: n(row.on_hand),
    valueAtCostPaise: n(row.value_at_cost_paise),
    lastSoldAt: (row.last_sold_at as string | null) ?? null,
  }));
}

export async function stockStatus(storeId: string, filters: ReportFilters): Promise<StockRow[]> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_stock_status', {
    p_store: storeId, p_category: filters.categoryId, p_brand: filters.brandId,
  });
  if (error) fail('stock status');
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    sku: String(row.sku),
    name: String(row.product_name),
    label: String(row.label ?? ''),
    onHand: n(row.on_hand),
    reserved: n(row.reserved),
    available: n(row.available),
    damaged: n(row.damaged),
    reorderLevel: n(row.reorder_level),
    status: row.status as StockRow['status'],
  }));
}

export async function couponUsage(storeId: string, range: ReportRange): Promise<CouponRow[]> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_coupon_usage', {
    p_store: storeId, p_start: range.startIso, p_end: range.endIso,
  });
  if (error) fail('coupon usage');
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    code: String(row.code),
    redemptions: n(row.redemptions),
    discountPaise: n(row.discount_paise),
    orders: n(row.orders),
  }));
}

export async function quotationFigures(storeId: string, range: ReportRange): Promise<QuotationFigures> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_quotation_funnel', {
    p_store: storeId, p_start: range.startIso, p_end: range.endIso,
  });
  if (error || !data) fail('quotations');
  const d = data as Record<string, number>;
  return {
    requests: n(d.requests),
    sent: n(d.sent),
    accepted: n(d.accepted),
    rejected: n(d.rejected),
    expired: n(d.expired),
    converted: n(d.converted),
    conversionRate: safeRatio(n(d.converted), n(d.sent)),
    quotedValuePaise: n(d.quotedValuePaise),
    convertedRevenuePaise: n(d.convertedRevenuePaise),
  };
}

/** Order list for export, in date order. Read from the orders table directly, with the period filter applied in the database. */
export interface OrderExportRow {
  orderNumber: string;
  createdAt: string;
  channel: string;
  customerName: string;
  paymentMethod: string;
  paymentStatus: string;
  taxablePaise: number;
  gstPaise: number;
  discountPaise: number;
  totalPaise: number;
}

export async function ordersForExport(storeId: string, range: ReportRange): Promise<OrderExportRow[]> {
  await requireReportStore(storeId);
  const out: OrderExportRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await createSupabaseAdminClient()
      .from('orders')
      .select('order_number, created_at, channel, customer_name, payment_method, payment_status, taxable_paise, tax_paise, discount_paise, total_paise')
      .eq('store_id', storeId)
      .neq('order_status', 'CANCELLED')
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) fail('orders');
    const rows = (data ?? []) as Record<string, unknown>[];
    for (const row of rows) {
      out.push({
        orderNumber: row.order_number as string,
        createdAt: row.created_at as string,
        channel: row.channel as string,
        customerName: row.customer_name as string,
        paymentMethod: row.payment_method as string,
        paymentStatus: row.payment_status as string,
        taxablePaise: n(row.taxable_paise),
        gstPaise: n(row.tax_paise),
        discountPaise: n(row.discount_paise),
        totalPaise: n(row.total_paise),
      });
    }
    if (rows.length < pageSize) break;
  }
  return out;
}

export interface FilterOptions {
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
}

/** Categories and brands for the report filters, limited to this store. */
export async function filterOptions(storeId: string): Promise<FilterOptions> {
  await requireReportStore(storeId);
  const admin = createSupabaseAdminClient();
  const [cats, brands] = await Promise.all([
    admin.from('categories').select('id, name').eq('store_id', storeId).order('name').limit(500),
    admin.from('brands').select('id, name').eq('store_id', storeId).order('name').limit(500),
  ]);
  if (cats.error || brands.error) fail('filter options');
  return {
    categories: ((cats.data ?? []) as { id: string; name: string }[]),
    brands: ((brands.data ?? []) as { id: string; name: string }[]),
  };
}

/* ---- Remaining reports (migration 0021). Date-based sources take IST calendar dates. ---- */

export interface DateRange { fromDate: string; toDate: string; startIso: string; endIso: string }

export interface SupplierRow {
  supplierId: string; name: string; poCount: number; poValuePaise: number; receiptCount: number;
  receivedValuePaise: number; invoicedPaise: number; paidPaise: number; outstandingPaise: number;
}

export async function supplierSummary(storeId: string, range: DateRange): Promise<SupplierRow[]> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_supplier_summary', { p_store: storeId, p_from: range.fromDate, p_to: range.toDate });
  if (error) fail('supplier purchases');
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    supplierId: String(r.supplier_id), name: String(r.supplier_name), poCount: n(r.po_count), poValuePaise: n(r.po_value_paise),
    receiptCount: n(r.receipt_count), receivedValuePaise: n(r.received_value_paise), invoicedPaise: n(r.invoiced_paise),
    paidPaise: n(r.paid_paise), outstandingPaise: n(r.outstanding_paise),
  }));
}

export interface PurchaseOrderRow {
  id: string; poNumber: string; supplierName: string; status: string; expectedOn: string | null; createdOn: string;
  totalPaise: number; orderedUnits: number; receivedUnits: number;
}

export async function purchaseOrders(storeId: string, range: DateRange, openOnly: boolean): Promise<PurchaseOrderRow[]> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_purchase_orders', { p_store: storeId, p_from: range.fromDate, p_to: range.toDate, p_open_only: openOnly });
  if (error) fail('purchase orders');
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.po_id), poNumber: String(r.po_number), supplierName: String(r.supplier_name), status: String(r.status),
    expectedOn: (r.expected_on as string | null) ?? null, createdOn: String(r.created_on), totalPaise: n(r.total_paise),
    orderedUnits: n(r.ordered_units), receivedUnits: n(r.received_units),
  }));
}

export interface GoodsReceiptRow {
  grnNumber: string; receivedOn: string; supplierName: string; poNumber: string | null; lines: number;
  unitsReceived: number; unitsDamaged: number; valuePaise: number;
}

export async function goodsReceipts(storeId: string, range: DateRange): Promise<GoodsReceiptRow[]> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_goods_receipts', { p_store: storeId, p_from: range.fromDate, p_to: range.toDate });
  if (error) fail('goods receipts');
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    grnNumber: String(r.grn_number), receivedOn: String(r.received_on), supplierName: String(r.supplier_name),
    poNumber: (r.po_number as string | null) ?? null, lines: n(r.lines), unitsReceived: n(r.units_received),
    unitsDamaged: n(r.units_damaged), valuePaise: n(r.value_paise),
  }));
}

export interface SupplierPaymentRow { paidOn: string; supplierName: string; invoiceNumber: string | null; amountPaise: number; method: string; reference: string | null }

export async function supplierPayments(storeId: string, range: DateRange): Promise<SupplierPaymentRow[]> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_supplier_payments', { p_store: storeId, p_from: range.fromDate, p_to: range.toDate });
  if (error) fail('supplier payments');
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    paidOn: String(r.paid_on), supplierName: String(r.supplier_name), invoiceNumber: (r.invoice_number as string | null) ?? null,
    amountPaise: n(r.amount_paise), method: String(r.method), reference: (r.reference as string | null) ?? null,
  }));
}

export interface OpenInvoiceRow {
  invoiceNumber: string; supplierName: string; invoiceDate: string; dueDate: string; amountPaise: number;
  paidPaise: number; outstandingPaise: number; daysOverdue: number;
}

export async function openSupplierInvoices(storeId: string, asOf: string): Promise<OpenInvoiceRow[]> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_supplier_open_invoices', { p_store: storeId, p_asof: asOf });
  if (error) fail('supplier balances');
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    invoiceNumber: String(r.invoice_number), supplierName: String(r.supplier_name), invoiceDate: String(r.invoice_date),
    dueDate: String(r.due_date), amountPaise: n(r.amount_paise), paidPaise: n(r.paid_paise),
    outstandingPaise: n(r.outstanding_paise), daysOverdue: n(r.days_overdue),
  }));
}

export interface CustomerSalesRow {
  customerId: string | null; name: string; mobile: string | null; ordersInPeriod: number; valuePaise: number;
  collectedPaise: number; lastOrderAt: string | null; ordersBefore: number; isRepeat: boolean;
}

export async function customerSales(storeId: string, range: ReportRange): Promise<CustomerSalesRow[]> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_customer_summary', { p_store: storeId, p_start: range.startIso, p_end: range.endIso });
  if (error) fail('customer sales');
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    customerId: (r.customer_id as string | null) ?? null, name: String(r.customer_name), mobile: (r.mobile as string | null) ?? null,
    ordersInPeriod: n(r.orders_in_period), valuePaise: n(r.value_paise), collectedPaise: n(r.collected_paise),
    lastOrderAt: (r.last_order_at as string | null) ?? null, ordersBefore: n(r.orders_before_period), isRepeat: Boolean(r.is_repeat),
  }));
}

export interface CreditRow {
  customerId: string; name: string; mobile: string | null; balancePaise: number; outstandingPaise: number;
  overduePaise: number; oldestUnpaidDue: string | null;
}

export async function creditBalances(storeId: string, asOf: string): Promise<CreditRow[]> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_credit_overdue', { p_store: storeId, p_asof: asOf });
  if (error) fail('customer credit');
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    customerId: String(r.customer_id), name: String(r.customer_name), mobile: (r.mobile as string | null) ?? null,
    balancePaise: n(r.balance_paise), outstandingPaise: n(r.outstanding_paise), overduePaise: n(r.overdue_paise),
    oldestUnpaidDue: (r.oldest_unpaid_due as string | null) ?? null,
  }));
}

export interface CollectionRow { collectedOn: string; customerName: string; amountPaise: number; note: string | null }

export async function creditCollections(storeId: string, range: ReportRange): Promise<CollectionRow[]> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_credit_collections', { p_store: storeId, p_from: range.startIso, p_to: range.endIso });
  if (error) fail('credit collections');
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    collectedOn: String(r.collected_on), customerName: String(r.customer_name ?? 'Customer'), amountPaise: n(r.amount_paise), note: (r.note as string | null) ?? null,
  }));
}

export interface CashDayRow {
  businessDate: string; openingPaise: number; cashSalesPaise: number; cashRefundsPaise: number; cashExpensesPaise: number;
  depositsPaise: number; withdrawalsPaise: number; manualInPaise: number; manualOutPaise: number; expectedPaise: number;
  actualPaise: number; differencePaise: number; shortagePaise: number; excessPaise: number;
}

export async function cashDays(storeId: string, range: DateRange): Promise<CashDayRow[]> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_cash_days', { p_store: storeId, p_from: range.fromDate, p_to: range.toDate });
  if (error) fail('cash reconciliation');
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    businessDate: String(r.business_date), openingPaise: n(r.opening_paise), cashSalesPaise: n(r.cash_sales_paise),
    cashRefundsPaise: n(r.cash_refunds_paise), cashExpensesPaise: n(r.cash_expenses_paise), depositsPaise: n(r.cash_deposits_paise),
    withdrawalsPaise: n(r.cash_withdrawals_paise), manualInPaise: n(r.manual_in_paise), manualOutPaise: n(r.manual_out_paise),
    expectedPaise: n(r.expected_closing_paise), actualPaise: n(r.actual_closing_paise), differencePaise: n(r.difference_paise),
    shortagePaise: n(r.shortage_paise), excessPaise: n(r.excess_paise),
  }));
}

export async function cashMovementTotals(storeId: string, range: DateRange): Promise<{ type: string; count: number; amountPaise: number }[]> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_cash_movements', { p_store: storeId, p_from: range.fromDate, p_to: range.toDate });
  if (error) fail('cash movements');
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ type: String(r.movement_type), count: n(r.movements), amountPaise: n(r.amount_paise) }));
}

export interface StockMovementRow { createdAt: string; sku: string; name: string; type: string; quantity: number; reference: string | null; note: string | null }

export async function stockMovements(storeId: string, range: ReportRange, type: string | null, page: number, pageSize: number): Promise<{ rows: StockMovementRow[]; total: number }> {
  await requireReportStore(storeId);
  const admin = createSupabaseAdminClient();
  const [rowsRes, countRes] = await Promise.all([
    admin.rpc('report_stock_movements', { p_store: storeId, p_start: range.startIso, p_end: range.endIso, p_type: type, p_limit: pageSize, p_offset: (page - 1) * pageSize }),
    admin.rpc('report_stock_movement_count', { p_store: storeId, p_start: range.startIso, p_end: range.endIso, p_type: type }),
  ]);
  if (rowsRes.error || countRes.error) fail('stock movements');
  return {
    total: n(countRes.data),
    rows: ((rowsRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
      createdAt: String(r.created_at), sku: String(r.sku), name: String(r.product_name), type: String(r.movement_type),
      quantity: n(r.quantity), reference: (r.reference_type as string | null) ?? null, note: (r.note as string | null) ?? null,
    })),
  };
}

export interface BatchRow { batchNumber: string; sku: string; name: string; onHand: number; reserved: number; damaged: number; soldUnits: number; valueAtCostPaise: number }

export async function batchPerformance(storeId: string, range: ReportRange): Promise<BatchRow[]> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_batch_performance', { p_store: storeId, p_start: range.startIso, p_end: range.endIso });
  if (error) fail('tile batches');
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    batchNumber: String(r.batch_number), sku: String(r.sku), name: String(r.product_name), onHand: n(r.on_hand),
    reserved: n(r.reserved), damaged: n(r.damaged), soldUnits: n(r.sold_units), valueAtCostPaise: n(r.value_at_cost_paise),
  }));
}

export interface GstRateRow { rateBps: number; lines: number; taxablePaise: number; gstPaise: number; lineTotalPaise: number }

export async function gstByRate(storeId: string, range: ReportRange): Promise<GstRateRow[]> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_gst_rates', { p_store: storeId, p_start: range.startIso, p_end: range.endIso });
  if (error) fail('GST by rate');
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    rateBps: n(r.gst_rate_bps), lines: n(r.lines), taxablePaise: n(r.taxable_paise), gstPaise: n(r.gst_paise), lineTotalPaise: n(r.line_total_paise),
  }));
}

export async function refundTax(storeId: string, range: ReportRange): Promise<{ refundsPaise: number; estimatedTaxPaise: number }> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_refund_tax', { p_store: storeId, p_start: range.startIso, p_end: range.endIso });
  if (error) fail('refund tax');
  const row = ((data ?? []) as Record<string, unknown>[])[0] ?? {};
  return { refundsPaise: n(row.refunds_paise), estimatedTaxPaise: n(row.estimated_tax_paise) };
}

export interface InvoiceRow { invoiceNumber: string; invoiceDate: string; orderNumber: string; taxablePaise: number; taxPaise: number; totalPaise: number }

export async function invoiceRecords(storeId: string, range: DateRange): Promise<InvoiceRow[]> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_invoices', { p_store: storeId, p_from: range.fromDate, p_to: range.toDate });
  if (error) fail('invoice records');
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    invoiceNumber: String(r.invoice_number), invoiceDate: String(r.invoice_date), orderNumber: String(r.order_number),
    taxablePaise: n(r.taxable_paise), taxPaise: n(r.tax_paise), totalPaise: n(r.total_paise),
  }));
}

export interface CustomerOrderRow {
  orderNumber: string; createdAt: string; channel: string; paymentMethod: string; paymentStatus: string;
  orderStatus: string; totalPaise: number;
}
/** One customer's orders, newest first. Fetches one extra row to tell whether a next page exists. */
export async function customerOrders(storeId: string, customerId: string, page: number, pageSize: number): Promise<{ rows: CustomerOrderRow[]; hasNext: boolean }> {
  await requireReportStore(storeId);
  const { data, error } = await createSupabaseAdminClient().rpc('report_customer_orders', {
    p_store: storeId, p_customer: customerId, p_limit: pageSize + 1, p_offset: (page - 1) * pageSize,
  });
  if (error) fail('customer orders');
  const all = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    orderNumber: String(r.order_number), createdAt: String(r.created_at), channel: String(r.channel),
    paymentMethod: String(r.payment_method), paymentStatus: String(r.payment_status),
    orderStatus: String(r.order_status), totalPaise: n(r.total_paise),
  }));
  return { rows: all.slice(0, pageSize), hasNext: all.length > pageSize };
}
