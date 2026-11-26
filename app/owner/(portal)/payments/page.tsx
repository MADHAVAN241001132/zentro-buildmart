import { PageHeader } from '@/components/owner/page-header';
import { ConfirmSubmit } from '@/components/owner/confirm-submit';
import { Pagination } from '@/components/owner/pagination';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatINR } from '@/lib/money';
import { requireOwnerPermission } from '@/lib/services/owner';
import {
  ownerInitialisations, ownerLatePayments, ownerLateRefunds, ownerPayments, ownerSummary, type LateRow,
} from '@/lib/services/payment-reconciliation';
import {
  INIT_ISSUE_STATUSES, LATE_STATUSES, PAYMENT_STATUSES, PAGE_SIZE, REFUND_STATUSES, pageCount, parseListQuery,
} from '@/lib/payments/reconciliation-filters';
import { decideLatePaymentAction, initiateLateRefundAction } from './actions';

export const dynamic = 'force-dynamic';

const TABS = ['online', 'cash', 'init', 'late', 'refunds'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  online: 'Online transactions', cash: 'Pending cash', init: 'Failed or uncertain', late: 'Late payments', refunds: 'Late-payment refunds',
};

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—';
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-line bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 font-display text-2xl text-burgundy">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-card border border-dashed border-line bg-card p-6 text-center text-sm text-ink-muted">{children}</p>;
}

function LateActions({ row }: { row: LateRow }) {
  if (row.status === 'open') {
    return (
      <div className="grid gap-2">
        <form action={decideLatePaymentAction} className="grid gap-2">
          <input type="hidden" name="lateId" value={row.id} />
          <label className="grid gap-1 text-xs">
            <span className="font-semibold text-ink-muted">Decision note (3–500 characters)</span>
            <input name="note" required minLength={3} maxLength={500} className="rounded-control border border-line px-2 py-1.5 text-sm" />
          </label>
          <div className="flex flex-wrap gap-2">
            <ConfirmSubmit name="decision" value="refund" message="Record a refund decision for this payment? Nothing is refunded until you start the refund.">Decide refund</ConfirmSubmit>
            {row.reason === 'after_reservation_expiry' || row.reason === 'provider_order_not_attached' ? (
              <ConfirmSubmit name="decision" value="fulfil" message="Fulfil this order from the money received? Stock and the order are updated.">Fulfil order</ConfirmSubmit>
            ) : null}
            <ConfirmSubmit name="decision" value="dismiss" message="Dismiss this late payment without refund? Record only if you are certain it needs no action.">Dismiss</ConfirmSubmit>
          </div>
        </form>
      </div>
    );
  }
  if (row.status === 'refund_requested' && !row.refundId) {
    return (
      <form action={initiateLateRefundAction}>
        <input type="hidden" name="lateId" value={row.id} />
        <ConfirmSubmit variant="primary" message="Start the refund through the payment provider now? This cannot be undone from this screen.">Start refund</ConfirmSubmit>
      </form>
    );
  }
  return <span className="text-xs text-ink-muted">{row.refundId ? 'Refund created — see Late-payment refunds' : 'No action needed'}</span>;
}

export default async function OwnerPaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const owner = await requireOwnerPermission('refund_management');
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as Tab) : 'online';
  const allowed = tab === 'init' ? INIT_ISSUE_STATUSES : tab === 'late' ? LATE_STATUSES : tab === 'refunds' ? REFUND_STATUSES : PAYMENT_STATUSES;
  const q = parseListQuery(sp, allowed);
  const storeId = owner.storeId;

  let summary: Awaited<ReturnType<typeof ownerSummary>> | null = null;
  let summaryError: string | null = null;
  try {
    summary = await ownerSummary(storeId, q.from, q.to);
  } catch (error) {
    summaryError = error instanceof Error ? error.message : 'Summary unavailable.';
  }

  let body: React.ReactNode;
  let total = 0;
  try {
    if (tab === 'online' || tab === 'cash') {
      const page = await ownerPayments(storeId, q, tab === 'online' ? 'online' : 'cash');
      total = page.total;
      body = page.rows.length === 0 ? <Empty>No payments match these filters.</Empty> : (
        <div className="overflow-x-auto rounded-card border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr><th className="px-4 py-3">Created</th><th className="px-4 py-3">Order</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Provider reference</th><th className="px-4 py-3">Paid</th></tr>
            </thead>
            <tbody>
              {page.rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-4 py-3">{when(r.createdAt)}</td>
                  <td className="px-4 py-3 font-medium">{r.orderNumber || '—'}</td>
                  <td className="px-4 py-3">{formatINR(r.amountPaise)}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 font-mono text-xs">{r.providerPaymentId ?? '—'}</td>
                  <td className="px-4 py-3">{when(r.paidAt)}{r.failureReason ? <span className="block text-xs text-ink-muted">{r.failureReason}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    } else if (tab === 'init') {
      const page = await ownerInitialisations(storeId, q);
      total = page.total;
      body = page.rows.length === 0 ? <Empty>No failed or uncertain payment starts match these filters.</Empty> : (
        <div className="overflow-x-auto rounded-card border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr><th className="px-4 py-3">Started</th><th className="px-4 py-3">Order</th><th className="px-4 py-3">Expected</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Attempts</th><th className="px-4 py-3">Reconciliation</th></tr>
            </thead>
            <tbody>
              {page.rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-4 py-3">{when(r.createdAt)}</td>
                  <td className="px-4 py-3 font-medium">{r.orderNumber || '—'}</td>
                  <td className="px-4 py-3">{formatINR(r.expectedPaise)}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3">{r.attempts}</td>
                  <td className="px-4 py-3 text-xs">
                    {r.reconciliationStatus === 'resolved' ? `Resolved ${when(r.reconciledAt)}` : 'Waiting for the platform team. Do not pay again; the order is still reserved.'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    } else if (tab === 'late') {
      const page = await ownerLatePayments(storeId, q);
      total = page.total;
      body = page.rows.length === 0 ? <Empty>No late payments match these filters.</Empty> : (
        <div className="grid gap-3">
          {page.rows.map((r) => (
            <article key={r.id} className="grid gap-3 rounded-card border border-line bg-card p-4 md:grid-cols-[1fr_1fr]">
              <div className="grid gap-1 text-sm">
                <p className="font-semibold text-burgundy">{r.orderNumber ?? 'No order attached'} · {formatINR(r.amountPaise)}</p>
                <p className="text-xs text-ink-muted">Received {when(r.createdAt)} · Reason: {r.reason.replaceAll('_', ' ')}</p>
                <p className="font-mono text-xs">{r.providerPaymentId}</p>
                <div className="flex items-center gap-2"><StatusBadge status={r.status} />{r.resolutionNote ? <span className="text-xs text-ink-muted">{r.resolutionNote}</span> : null}</div>
              </div>
              <LateActions row={r} />
            </article>
          ))}
        </div>
      );
    } else {
      const page = await ownerLateRefunds(storeId, q);
      total = page.total;
      body = page.rows.length === 0 ? <Empty>No late-payment refunds match these filters.</Empty> : (
        <div className="overflow-x-auto rounded-card border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr><th className="px-4 py-3">Created</th><th className="px-4 py-3">Order</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Gateway</th><th className="px-4 py-3">Processed</th></tr>
            </thead>
            <tbody>
              {page.rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-4 py-3">{when(r.createdAt)}</td>
                  <td className="px-4 py-3 font-medium">{r.orderNumber}</td>
                  <td className="px-4 py-3">{formatINR(r.amountPaise)}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-xs">{r.gatewayState}{r.failureReason ? <span className="block text-ink-muted">{r.failureReason}</span> : null}</td>
                  <td className="px-4 py-3">{when(r.processedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  } catch (error) {
    body = <p role="alert" className="rounded-card border border-burgundy/30 bg-card p-4 text-sm text-burgundy">{error instanceof Error ? error.message : 'Records could not be loaded. Try again.'}</p>;
  }

  const baseParams = { tab, q: q.q || undefined, status: q.status ?? undefined, from: q.from, to: q.to };
  const late = summary?.late;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Finance"
        title="Payments and reconciliation"
        description="Online and cash payments, failed or uncertain payment starts, late payments and their refunds. Ordinary sales figures exclude late-payment refunds; they are shown separately here."
      />
      {sp.notice ? <p role="status" className="rounded-card border border-gold bg-card p-3 text-sm text-ink">{sp.notice}</p> : null}

      {summaryError ? (
        <p role="alert" className="rounded-card border border-burgundy/30 bg-card p-4 text-sm text-burgundy">Summary unavailable: {summaryError}</p>
      ) : summary && late ? (
        <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card label="Online paid" value={formatINR(summary.onlinePaidPaise)} hint={`${summary.onlinePaidCount} payments in range`} />
          <Card label="Cash awaiting confirmation" value={formatINR(summary.cashPendingPaise)} hint={`${summary.cashPendingCount} payments`} />
          <Card label="Failed or uncertain starts" value={String(summary.initIssueCount)} hint="Open for review" />
          <Card label="Late receipts" value={formatINR(late.lateReceivedPaise)} hint={`${late.lateReceivedCount} in range · ${formatINR(late.lateOpenPaise)} open`} />
          <Card label="Late refunds succeeded" value={formatINR(late.lateRefundSucceededPaise)} hint={`${late.lateRefundSucceededCount} refunds`} />
          <Card label="Late refunds pending" value={formatINR(late.lateRefundPendingPaise)} hint={`${late.lateRefundPendingCount} refunds`} />
          <Card label="Late decisions awaiting refund" value={String(late.lateRefundRequestedCount)} hint="Decided to refund, not yet started" />
          <Card label="Late fulfilment approved" value={String(late.lateFulfilmentApprovedCount)} hint="Order fulfilled from late money" />
        </section>
      ) : null}

      <nav aria-label="Payment views" className="flex flex-wrap gap-2 text-sm">
        {TABS.map((t) => (
          <a key={t} href={`/owner/payments?tab=${t}&from=${q.from}&to=${q.to}`}
            className={`rounded-control border px-3 py-1.5 ${tab === t ? 'border-burgundy bg-burgundy text-cream' : 'border-line bg-card text-ink'}`}>
            {TAB_LABEL[t]}
          </a>
        ))}
      </nav>

      <form method="get" className="grid gap-3 rounded-card border border-line bg-card p-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <input type="hidden" name="tab" value={tab} />
        <label className="grid gap-1 text-xs"><span className="font-semibold text-ink-muted">Order number</span>
          <input name="q" defaultValue={q.q} maxLength={40} placeholder="e.g. ZB-1001" className="rounded-control border border-line px-2 py-1.5 text-sm" /></label>
        <label className="grid gap-1 text-xs"><span className="font-semibold text-ink-muted">Status</span>
          <select name="status" defaultValue={q.status ?? ''} className="rounded-control border border-line px-2 py-1.5 text-sm">
            <option value="">All</option>
            {allowed.map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
          </select></label>
        <label className="grid gap-1 text-xs"><span className="font-semibold text-ink-muted">From</span>
          <input type="date" name="from" defaultValue={q.from} className="rounded-control border border-line px-2 py-1.5 text-sm" /></label>
        <label className="grid gap-1 text-xs"><span className="font-semibold text-ink-muted">To</span>
          <input type="date" name="to" defaultValue={q.to} className="rounded-control border border-line px-2 py-1.5 text-sm" /></label>
        <button className="self-end rounded-control bg-burgundy px-4 py-2 text-sm font-semibold text-cream">Apply</button>
      </form>

      {body}
      <Pagination basePath="/owner/payments" params={baseParams} page={q.page} pageCount={pageCount(total)} />
      <p className="text-center text-xs text-ink-muted">{total} records · {PAGE_SIZE} per page · Showing store {owner.storeName ?? 'your store'} only</p>
    </div>
  );
}
