import { PageHeader } from '@/components/owner/page-header';
import { ConfirmSubmit } from '@/components/owner/confirm-submit';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatINR } from '@/lib/money';
import { requireAdmin } from '@/lib/services/admin';
import { adminReconciliationQueue, type AdminInitRow, type AdminLateRow } from '@/lib/services/payment-reconciliation';
import { attributeUnmatchedPaymentAction, reconcileInitialisationAction } from './actions';

export const dynamic = 'force-dynamic';

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—';
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="font-display text-xl text-burgundy">{title}</h2>
        <p className="text-sm text-ink-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

function LateCard({ row, note }: { row: AdminLateRow; note: string }) {
  return (
    <article className="grid gap-2 rounded-card border border-line bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-burgundy">{formatINR(row.amountPaise)} received · {row.reason.replaceAll('_', ' ')}</p>
        <StatusBadge status={row.status} />
      </div>
      <dl className="grid gap-1 text-xs sm:grid-cols-2">
        <div><dt className="font-semibold text-ink-muted">Store attribution</dt><dd>{row.storeName ?? 'Not attributed'}</dd></div>
        <div><dt className="font-semibold text-ink-muted">Order</dt><dd>{row.orderNumber ?? 'No order attached'}{row.expectedPaise !== null ? ` · expected ${formatINR(row.expectedPaise)}` : ''}</dd></div>
        <div><dt className="font-semibold text-ink-muted">Provider payment</dt><dd className="font-mono">{row.providerPaymentId}</dd></div>
        <div><dt className="font-semibold text-ink-muted">Provider order</dt><dd className="font-mono">{row.providerOrderId ?? '—'}</dd></div>
        <div><dt className="font-semibold text-ink-muted">Received</dt><dd>{when(row.createdAt)}</dd></div>
        <div><dt className="font-semibold text-ink-muted">Decision history</dt><dd>{row.resolutionNote ?? '—'}</dd></div>
      </dl>
      <p className="text-xs text-ink-muted">{note}</p>
    </article>
  );
}

function AttributionForm({ lateId }: { lateId: string }) {
  return (
    <form action={attributeUnmatchedPaymentAction} className="grid gap-3 rounded-control border border-line p-3">
      <input type="hidden" name="lateId" value={lateId} />
      <p className="text-xs text-ink-muted">
        Enter the order number the guest was shown. The payment is checked against Razorpay (captured, INR, exact amount, linked provider order,
        receipt equal to the order number) before anything changes. The store comes from that order, not from this form.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-xs">
          <span className="font-semibold text-ink-muted">Order number</span>
          <input name="orderNumber" required maxLength={40} className="rounded-control border border-line px-2 py-1.5 font-mono text-sm" />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-semibold text-ink-muted">Evidence note (10–500 characters)</span>
          <input name="evidenceNote" required minLength={10} maxLength={500} className="rounded-control border border-line px-2 py-1.5 text-sm" />
        </label>
      </div>
      <div>
        <ConfirmSubmit variant="primary" message="Verify with Razorpay and attribute this payment to the order? Nothing changes if the provider check fails.">Verify and attribute</ConfirmSubmit>
      </div>
    </form>
  );
}

function InitCard({ row }: { row: AdminInitRow }) {
  return (
    <article className="grid gap-3 rounded-card border border-line bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-burgundy">{row.storeName} · {row.orderNumber} · expected {formatINR(row.expectedPaise)}</p>
        <StatusBadge status={row.status} />
      </div>
      <dl className="grid gap-1 text-xs sm:grid-cols-3">
        <div><dt className="font-semibold text-ink-muted">Started</dt><dd>{when(row.createdAt)}</dd></div>
        <div><dt className="font-semibold text-ink-muted">Attempts</dt><dd>{row.attempts}</dd></div>
        <div><dt className="font-semibold text-ink-muted">Provider order</dt><dd className="font-mono">{row.providerOrderId ?? '—'}</dd></div>
      </dl>
      {row.safeError ? <p className="text-xs text-ink-muted">Last provider message: {row.safeError}</p> : null}
      {row.attemptHistory.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-burgundy">Attempt history ({row.attemptHistory.length})</summary>
          <ul className="mt-2 grid gap-1">
            {row.attemptHistory.map((a) => (
              <li key={`${a.attemptNo}-${a.at}-${a.outcome}`}>#{a.attemptNo} · {a.outcome} · {when(a.at)}{a.safeDetail ? ` · ${a.safeDetail}` : ''}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <form action={reconcileInitialisationAction} className="grid gap-3 rounded-control border border-line p-3">
        <input type="hidden" name="initId" value={row.id} />
        <p className="text-xs text-ink-muted">
          Manual verification: search the provider dashboard for this order and payment reference. Automated lookup is not available in this application.
          Attach a payment only when the dashboard shows the provider order for this exact order and amount.
        </p>
        <label className="flex items-start gap-2 text-xs">
          <input type="checkbox" name="dashboardChecked" className="mt-0.5" />
          <span>I checked the provider dashboard for this order and recorded what I found below.</span>
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs">
            <span className="font-semibold text-ink-muted">Verified provider order id (for attaching only)</span>
            <input name="providerOrderId" maxLength={80} placeholder="order_XXXXXXXX" className="rounded-control border border-line px-2 py-1.5 font-mono text-sm" />
          </label>
          <label className="grid gap-1 text-xs">
            <span className="font-semibold text-ink-muted">Evidence note (10–500 characters)</span>
            <input name="evidenceNote" required minLength={10} maxLength={500} className="rounded-control border border-line px-2 py-1.5 text-sm" />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <ConfirmSubmit name="action" value="adopt" variant="primary" message="Attach this provider order to the payment? Only do this when the dashboard shows the matching order and amount.">Attach verified provider order</ConfirmSubmit>
        </div>
      </form>
    </article>
  );
}

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const queue = await adminReconciliationQueue();

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Platform"
        title="Payment reconciliation"
        description="Verified provider payments that could not be matched, uncertain payment starts, unattached provider orders and late-payment cases. Money moves only through the owner refund path or a verified reconciliation."
      />
      {sp.notice ? <p role="status" className="rounded-card border border-gold bg-card p-3 text-sm text-ink">{sp.notice}</p> : null}

      <section aria-label="Counts" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-card border border-line bg-card p-4"><p className="text-xs uppercase text-ink-muted">Unmatched verified payments</p><p className="font-display text-2xl text-burgundy">{queue.unmatched.length}</p></div>
        <div className="rounded-card border border-line bg-card p-4"><p className="text-xs uppercase text-ink-muted">Uncertain starts</p><p className="font-display text-2xl text-burgundy">{queue.uncertainInits.length}</p></div>
        <div className="rounded-card border border-line bg-card p-4"><p className="text-xs uppercase text-ink-muted">Unattached provider orders</p><p className="font-display text-2xl text-burgundy">{queue.unattached.length}</p></div>
        <div className="rounded-card border border-line bg-card p-4"><p className="text-xs uppercase text-ink-muted">Late cases for review</p><p className="font-display text-2xl text-burgundy">{queue.lateReview.length}</p></div>
      </section>

      <Section title="Uncertain provider initialisation" description="Payment starts whose provider outcome is unknown. Do not pay again while these are open.">
        {queue.uncertainInits.length === 0 ? <p className="text-sm text-ink-muted">None open.</p> : queue.uncertainInits.map((r) => <InitCard key={r.id} row={r} />)}
      </Section>

      <Section title="Unmatched verified payments" description="Money received for a provider order that no store has claimed. No refund or dismissal is available here: a store must be attributed with evidence first.">
        {queue.unmatched.length === 0 ? <p className="text-sm text-ink-muted">None open.</p> : queue.unmatched.map((r) => (
          <div key={r.id} className="grid gap-2">
            <LateCard row={r} note="Stays visible until verified attribution is recorded. Nothing here is refunded automatically." />
            <AttributionForm lateId={r.id} />
          </div>
        ))}
      </Section>

      <Section title="Unattached provider orders" description="Verified payments for an order that exists but was not attached to the payment record.">
        {queue.unattached.length === 0 ? <p className="text-sm text-ink-muted">None open.</p> : queue.unattached.map((r) => <LateCard key={r.id} row={r} note="The owner's late-payment decision controls any refund or fulfilment." />)}
      </Section>

      <Section title="Late-payment cases" description="Money received after cancellation, reservation expiry or an amount mismatch. Owners record the decision and start any refund from their Payments screen.">
        {queue.lateReview.length === 0 ? <p className="text-sm text-ink-muted">None open.</p> : queue.lateReview.map((r) => <LateCard key={r.id} row={r} note="Awaiting the owner's decision." />)}
      </Section>
    </div>
  );
}
