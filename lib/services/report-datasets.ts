import 'server-only';
import { istDateOf, trendBucket, type ReportRange } from '@/lib/reports/report-math';
import type { Dataset } from '@/lib/exports/tabular';
import {
  batchPerformance, cashDays, cashMovementTotals, couponUsage, creditBalances, creditCollections, customerSales, goodsReceipts,
  groupSales, gstByRate, invoiceRecords, openSupplierInvoices, ordersForExport, productSales, purchaseOrders, refundTax, reportTrend,
  slowMovers, stockMovements, stockStatus, supplierPayments, supplierSummary, type ReportFilters,
} from '@/lib/services/reports';
import { requireReportStore } from '@/lib/services/report-access';

/**
 * Every report export is built here, once, from the same service functions that feed the screens. CSV, Excel and
 * PDF all read these datasets, so the formats cannot disagree.
 */

export const REPORT_TYPES = [
  'orders', 'products', 'trend', 'annual', 'categories', 'brands', 'slow', 'stock', 'coupons',
  'suppliers', 'purchase-orders', 'goods-receipts', 'supplier-payments', 'open-invoices',
  'customers', 'credit', 'collections', 'cash-days', 'cash-movements', 'stock-movements', 'batches',
  'gst-rates', 'invoices', 'refund-tax',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export function isReportType(value: string): value is ReportType {
  return (REPORT_TYPES as readonly string[]).includes(value);
}

const ts = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '');
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

export interface BuildContext {
  storeId: string;
  range: ReportRange;
  filters: ReportFilters;
  /** Stock movement type filter and page, used by the stock-movements export. */
  movementType: string | null;
}

export async function buildDataset(type: ReportType, ctx: BuildContext): Promise<Dataset> {
  await requireReportStore(ctx.storeId);
  const { storeId, range, filters } = ctx;
  const period = `${range.fromDate} to ${range.toDate} (IST)`;
  switch (type) {
    case 'orders': {
      const rows = await ordersForExport(storeId, range);
      return {
        title: 'Orders', subtitle: period,
        columns: [
          { header: 'Order', kind: 'text' }, { header: 'Date', kind: 'text' }, { header: 'Channel', kind: 'text' },
          { header: 'Customer', kind: 'text' }, { header: 'Payment method', kind: 'text' }, { header: 'Payment status', kind: 'text' },
          { header: 'Taxable (Rs.)', kind: 'money' }, { header: 'GST (Rs.)', kind: 'money' }, { header: 'Discount (Rs.)', kind: 'money' }, { header: 'Total (Rs.)', kind: 'money' },
        ],
        rows: rows.map((r) => [r.orderNumber, ts(r.createdAt), r.channel, r.customerName, r.paymentMethod, r.paymentStatus, r.taxablePaise, r.gstPaise, r.discountPaise, r.totalPaise]),
      };
    }
    case 'products': {
      const rows = await productSales(storeId, range, filters);
      return {
        title: 'Product sales', subtitle: period,
        columns: [{ header: 'SKU', kind: 'text' }, { header: 'Product', kind: 'text' }, { header: 'Units', kind: 'int' }, { header: 'Taxable (Rs.)', kind: 'money' }, { header: 'Historical cost (Rs.)', kind: 'money' }, { header: 'Gross profit (Rs.)', kind: 'money' }, { header: 'Last sold', kind: 'text' }],
        rows: rows.map((p) => [p.sku, p.name, p.units, p.taxablePaise, p.cogsPaise, p.grossProfitPaise, ts(p.lastSoldAt)]),
      };
    }
    case 'trend': {
      const rows = await reportTrend(storeId, range, trendBucket(range));
      return trendDataset('Sales trend', period, rows);
    }
    case 'annual': {
      const rows = await reportTrend(storeId, { ...range, startIso: '2000-01-01T00:00:00Z', endIso: '2100-01-01T00:00:00Z' }, 'year');
      return trendDataset('Annual sales', 'All years on record', rows);
    }
    case 'categories':
    case 'brands': {
      const rows = await groupSales(storeId, range, type === 'brands' ? 'brand' : 'category', filters);
      return {
        title: type === 'brands' ? 'Brand sales' : 'Category sales', subtitle: period,
        columns: [{ header: type === 'brands' ? 'Brand' : 'Category', kind: 'text' }, { header: 'Units', kind: 'int' }, { header: 'Taxable (Rs.)', kind: 'money' }, { header: 'Historical cost (Rs.)', kind: 'money' }, { header: 'Gross profit (Rs.)', kind: 'money' }, { header: 'Order lines', kind: 'int' }],
        rows: rows.map((r) => [r.name, r.units, r.taxablePaise, r.cogsPaise, r.grossProfitPaise, r.lines]),
      };
    }
    case 'slow': {
      const rows = await slowMovers(storeId, range, filters);
      return {
        title: 'Slow-moving stock', subtitle: `In stock with no sale ${period}`,
        columns: [{ header: 'SKU', kind: 'text' }, { header: 'Product', kind: 'text' }, { header: 'Variant', kind: 'text' }, { header: 'On hand', kind: 'int' }, { header: 'Value at cost (Rs.)', kind: 'money' }, { header: 'Last sold', kind: 'text' }],
        rows: rows.map((r) => [r.sku, r.name, r.label, r.onHand, r.valueAtCostPaise, r.lastSoldAt ? day(r.lastSoldAt) : 'Never']),
      };
    }
    case 'stock': {
      const rows = await stockStatus(storeId, filters);
      return {
        title: 'Stock status', subtitle: 'Current stock',
        columns: [{ header: 'SKU', kind: 'text' }, { header: 'Product', kind: 'text' }, { header: 'Variant', kind: 'text' }, { header: 'On hand', kind: 'int' }, { header: 'Reserved', kind: 'int' }, { header: 'Available', kind: 'int' }, { header: 'Damaged', kind: 'int' }, { header: 'Reorder at', kind: 'int' }, { header: 'Status', kind: 'text' }],
        rows: rows.map((r) => [r.sku, r.name, r.label, r.onHand, r.reserved, r.available, r.damaged, r.reorderLevel, r.status]),
      };
    }
    case 'coupons': {
      const rows = await couponUsage(storeId, range);
      return {
        title: 'Coupon usage', subtitle: period,
        columns: [{ header: 'Coupon code', kind: 'text' }, { header: 'Redemptions', kind: 'int' }, { header: 'Orders', kind: 'int' }, { header: 'Discount given (Rs.)', kind: 'money' }],
        rows: rows.map((r) => [r.code, r.redemptions, r.orders, r.discountPaise]),
      };
    }
    case 'suppliers': {
      const rows = await supplierSummary(storeId, range);
      return {
        title: 'Supplier purchases', subtitle: period,
        columns: [{ header: 'Supplier', kind: 'text' }, { header: 'Purchase orders', kind: 'int' }, { header: 'PO value (Rs.)', kind: 'money' }, { header: 'Receipts', kind: 'int' }, { header: 'Received value (Rs.)', kind: 'money' }, { header: 'Invoiced (Rs.)', kind: 'money' }, { header: 'Paid (Rs.)', kind: 'money' }, { header: 'Outstanding, all time (Rs.)', kind: 'money' }],
        rows: rows.map((r) => [r.name, r.poCount, r.poValuePaise, r.receiptCount, r.receivedValuePaise, r.invoicedPaise, r.paidPaise, r.outstandingPaise]),
      };
    }
    case 'purchase-orders': {
      const rows = await purchaseOrders(storeId, range, false);
      return {
        title: 'Purchase orders', subtitle: period,
        columns: [{ header: 'PO number', kind: 'text' }, { header: 'Supplier', kind: 'text' }, { header: 'Status', kind: 'text' }, { header: 'Created', kind: 'text' }, { header: 'Expected', kind: 'text' }, { header: 'Ordered units', kind: 'int' }, { header: 'Received units', kind: 'int' }, { header: 'Total (Rs.)', kind: 'money' }],
        rows: rows.map((r) => [r.poNumber, r.supplierName, r.status, r.createdOn, r.expectedOn ?? '', r.orderedUnits, r.receivedUnits, r.totalPaise]),
      };
    }
    case 'goods-receipts': {
      const rows = await goodsReceipts(storeId, range);
      return {
        title: 'Goods receipts', subtitle: period,
        columns: [{ header: 'GRN', kind: 'text' }, { header: 'Received on', kind: 'text' }, { header: 'Supplier', kind: 'text' }, { header: 'PO', kind: 'text' }, { header: 'Lines', kind: 'int' }, { header: 'Units received', kind: 'int' }, { header: 'Units damaged', kind: 'int' }, { header: 'Value (Rs.)', kind: 'money' }],
        rows: rows.map((r) => [r.grnNumber, r.receivedOn, r.supplierName, r.poNumber ?? '', r.lines, r.unitsReceived, r.unitsDamaged, r.valuePaise]),
      };
    }
    case 'supplier-payments': {
      const rows = await supplierPayments(storeId, range);
      return {
        title: 'Supplier payments', subtitle: period,
        columns: [{ header: 'Paid on', kind: 'text' }, { header: 'Supplier', kind: 'text' }, { header: 'Invoice', kind: 'text' }, { header: 'Amount (Rs.)', kind: 'money' }, { header: 'Method', kind: 'text' }, { header: 'Reference', kind: 'text' }],
        rows: rows.map((r) => [r.paidOn, r.supplierName, r.invoiceNumber ?? '', r.amountPaise, r.method, r.reference ?? '']),
      };
    }
    case 'open-invoices': {
      const rows = await openSupplierInvoices(storeId, istDateOf(new Date()));
      return {
        title: 'Supplier balances', subtitle: `Open invoices as at ${istDateOf(new Date())}`,
        columns: [{ header: 'Invoice', kind: 'text' }, { header: 'Supplier', kind: 'text' }, { header: 'Invoice date', kind: 'text' }, { header: 'Due date', kind: 'text' }, { header: 'Amount (Rs.)', kind: 'money' }, { header: 'Paid (Rs.)', kind: 'money' }, { header: 'Outstanding (Rs.)', kind: 'money' }, { header: 'Days overdue', kind: 'int' }],
        rows: rows.map((r) => [r.invoiceNumber, r.supplierName, r.invoiceDate, r.dueDate, r.amountPaise, r.paidPaise, r.outstandingPaise, r.daysOverdue]),
      };
    }
    case 'customers': {
      const rows = await customerSales(storeId, range);
      return {
        title: 'Customer sales', subtitle: period,
        columns: [{ header: 'Customer', kind: 'text' }, { header: 'Mobile', kind: 'text' }, { header: 'Orders in period', kind: 'int' }, { header: 'Value (Rs.)', kind: 'money' }, { header: 'Collected (Rs.)', kind: 'money' }, { header: 'Last order', kind: 'text' }, { header: 'Earlier orders', kind: 'int' }, { header: 'Repeat', kind: 'text' }],
        rows: rows.map((r) => [r.name, r.mobile ?? '', r.ordersInPeriod, r.valuePaise, r.collectedPaise, ts(r.lastOrderAt), r.ordersBefore, r.isRepeat ? 'Yes' : 'No']),
      };
    }
    case 'credit': {
      const rows = await creditBalances(storeId, istDateOf(new Date()));
      return {
        title: 'Customer credit', subtitle: `Balances as at ${istDateOf(new Date())}`,
        columns: [{ header: 'Customer', kind: 'text' }, { header: 'Mobile', kind: 'text' }, { header: 'Balance (Rs.)', kind: 'money' }, { header: 'Outstanding (Rs.)', kind: 'money' }, { header: 'Overdue (Rs.)', kind: 'money' }, { header: 'Oldest unpaid due', kind: 'text' }],
        rows: rows.map((r) => [r.name, r.mobile ?? '', r.balancePaise, r.outstandingPaise, r.overduePaise, r.oldestUnpaidDue ?? '']),
      };
    }
    case 'collections': {
      const rows = await creditCollections(storeId, range);
      return {
        title: 'Credit collections', subtitle: period,
        columns: [{ header: 'Collected on', kind: 'text' }, { header: 'Customer', kind: 'text' }, { header: 'Amount (Rs.)', kind: 'money' }, { header: 'Note', kind: 'text' }],
        rows: rows.map((r) => [r.collectedOn, r.customerName, r.amountPaise, r.note ?? '']),
      };
    }
    case 'cash-days': {
      const rows = await cashDays(storeId, range);
      return {
        title: 'Cash reconciliation', subtitle: `${period}; closed days only`,
        columns: [{ header: 'Date', kind: 'text' }, { header: 'Opening (Rs.)', kind: 'money' }, { header: 'Cash sales (Rs.)', kind: 'money' }, { header: 'Refunds (Rs.)', kind: 'money' }, { header: 'Expenses (Rs.)', kind: 'money' }, { header: 'Deposits (Rs.)', kind: 'money' }, { header: 'Withdrawals (Rs.)', kind: 'money' }, { header: 'Manual in (Rs.)', kind: 'money' }, { header: 'Manual out (Rs.)', kind: 'money' }, { header: 'Expected (Rs.)', kind: 'money' }, { header: 'Actual (Rs.)', kind: 'money' }, { header: 'Difference (Rs.)', kind: 'money' }, { header: 'Shortage (Rs.)', kind: 'money' }, { header: 'Excess (Rs.)', kind: 'money' }],
        rows: rows.map((r) => [r.businessDate, r.openingPaise, r.cashSalesPaise, r.cashRefundsPaise, r.cashExpensesPaise, r.depositsPaise, r.withdrawalsPaise, r.manualInPaise, r.manualOutPaise, r.expectedPaise, r.actualPaise, r.differencePaise, r.shortagePaise, r.excessPaise]),
      };
    }
    case 'cash-movements': {
      const rows = await cashMovementTotals(storeId, range);
      return {
        title: 'Cash movements', subtitle: period,
        columns: [{ header: 'Movement type', kind: 'text' }, { header: 'Count', kind: 'int' }, { header: 'Amount (Rs.)', kind: 'money' }],
        rows: rows.map((r) => [r.type, r.count, r.amountPaise]),
      };
    }
    case 'stock-movements': {
      const all: Awaited<ReturnType<typeof stockMovements>>['rows'] = [];
      for (let page = 1; ; page += 1) {
        const chunk = await stockMovements(storeId, range, ctx.movementType, page, 500);
        all.push(...chunk.rows);
        if (chunk.rows.length < 500) break;
      }
      return {
        title: 'Stock movements', subtitle: `${period}${ctx.movementType ? `; type ${ctx.movementType}` : ''}; all rows, newest first`,
        columns: [{ header: 'When', kind: 'text' }, { header: 'SKU', kind: 'text' }, { header: 'Product', kind: 'text' }, { header: 'Type', kind: 'text' }, { header: 'Quantity', kind: 'int' }, { header: 'Reference', kind: 'text' }, { header: 'Note', kind: 'text' }],
        rows: all.map((r) => [ts(r.createdAt), r.sku, r.name, r.type, r.quantity, r.reference ?? '', r.note ?? '']),
      };
    }
    case 'batches': {
      const rows = await batchPerformance(storeId, range);
      return {
        title: 'Tile batch performance', subtitle: period,
        columns: [{ header: 'Batch', kind: 'text' }, { header: 'SKU', kind: 'text' }, { header: 'Product', kind: 'text' }, { header: 'On hand', kind: 'int' }, { header: 'Reserved', kind: 'int' }, { header: 'Damaged', kind: 'int' }, { header: 'Sold in period', kind: 'int' }, { header: 'Value at cost (Rs.)', kind: 'money' }],
        rows: rows.map((r) => [r.batchNumber, r.sku, r.name, r.onHand, r.reserved, r.damaged, r.soldUnits, r.valueAtCostPaise]),
      };
    }
    case 'gst-rates': {
      const rows = await gstByRate(storeId, range);
      return {
        title: 'GST by rate', subtitle: `${period}; intrastate-only tax, no place of supply yet`,
        columns: [{ header: 'GST rate', kind: 'text' }, { header: 'Order lines', kind: 'int' }, { header: 'Taxable (Rs.)', kind: 'money' }, { header: 'GST (Rs.)', kind: 'money' }, { header: 'Line totals (Rs.)', kind: 'money' }],
        rows: rows.map((r) => [`${(r.rateBps / 100).toFixed(2)}%`, r.lines, r.taxablePaise, r.gstPaise, r.lineTotalPaise]),
      };
    }
    case 'invoices': {
      const rows = await invoiceRecords(storeId, range);
      return {
        title: 'Invoice GST records', subtitle: `${period}; one tax figure per invoice, no CGST/SGST/IGST split yet`,
        columns: [{ header: 'Invoice', kind: 'text' }, { header: 'Date', kind: 'text' }, { header: 'Order', kind: 'text' }, { header: 'Taxable (Rs.)', kind: 'money' }, { header: 'Tax (Rs.)', kind: 'money' }, { header: 'Total (Rs.)', kind: 'money' }],
        rows: rows.map((r) => [r.invoiceNumber, r.invoiceDate, r.orderNumber, r.taxablePaise, r.taxPaise, r.totalPaise]),
      };
    }
    case 'refund-tax': {
      const r = await refundTax(storeId, range);
      return {
        title: 'Refund tax adjustment', subtitle: `${period}; estimate, pro rata to each order's tax share`,
        columns: [{ header: 'Refunds succeeded (Rs.)', kind: 'money' }, { header: 'Estimated GST on refunds (Rs.)', kind: 'money' }],
        rows: [[r.refundsPaise, r.estimatedTaxPaise]],
      };
    }
  }
}

function trendDataset(title: string, subtitle: string, rows: Awaited<ReturnType<typeof reportTrend>>): Dataset {
  return {
    title, subtitle,
    columns: [{ header: 'Period start', kind: 'text' }, { header: 'Orders', kind: 'int' }, { header: 'Order value (Rs.)', kind: 'money' }, { header: 'Taxable (Rs.)', kind: 'money' }, { header: 'Collected (Rs.)', kind: 'money' }, { header: 'Credit (Rs.)', kind: 'money' }, { header: 'Online value (Rs.)', kind: 'money' }, { header: 'POS value (Rs.)', kind: 'money' }, { header: 'Refunds (Rs.)', kind: 'money' }],
    rows: rows.map((r) => [r.bucketStart, r.orders, r.orderValuePaise, r.taxablePaise, r.collectedPaise, r.creditPaise, r.onlineValuePaise, r.posValuePaise, r.refundsPaise]),
  };
}
