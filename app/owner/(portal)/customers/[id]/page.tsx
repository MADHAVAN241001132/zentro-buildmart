import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/owner/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatINR } from '@/lib/money';
import { requireOwnerPermission } from '@/lib/services/owner';
import { summarise, withRunningBalance, type LedgerRow } from '@/lib/services/credit';
import { updateCustomerAction } from '../actions';
import { CreditEntryForm, CustomerForm } from '../customer-forms';

export const dynamic = 'force-dynamic';

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const owner = await requireOwnerPermission('customer_management');
  const supabase = await createSupabaseServerClient();

  const { data: c } = await supabase.from('customers').select('*').eq('id', id).eq('store_id', owner.storeId).maybeSingle();
  if (!c) notFound();
  const [{ data: entries }, { data: orders }, { data: quotes }] = await Promise.all([
    supabase.from('credit_ledger').select('id, entry_type, amount_paise, due_on, note, created_at').eq('customer_id', id).order('created_at', { ascending: true }).limit(1000),
    supabase.from('orders').select('id, order_number, total_paise, payment_status, order_status, created_at').eq('customer_id', id).order('created_at', { ascending: false }).limit(50),
    supabase.from('quotations').select('id, quotation_number, status, total_paise, valid_until, created_at').eq('customer_id', id).order('created_at', { ascending: false }).limit(50),
  ]);

  const rows: LedgerRow[] = (entries ?? []).map((e) => ({
    id: e.id as string,
    entryType: e.entry_type as LedgerRow['entryType'],
    amountPaise: Number(e.amount_paise),
    dueOn: (e.due_on as string | null) ?? null,
    createdAt: e.created_at as string,
    note: (e.note as string | null) ?? null,
  }));
  const today = new Date().toISOString().slice(0, 10);
  const summary = summarise(rows, today);
  const running = withRunningBalance(rows).reverse();
  const available = Math.max(0, Number(c.credit_limit_paise) - summary.balancePaise);
  const canManage = true; // the page gate requires customer management

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Customer"
        title={c.full_name as string}
        description={[c.mobile as string | null, c.email as string | null, c.gstin ? `GSTIN ${c.gstin as string}` : null].filter(Boolean).join(' · ') || 'No contact details yet'}
        actions={<Link href={`/owner/customers/${id}/statement`} className="rounded-control border border-line px-4 py-2 text-sm hover:bg-cream">Statement</Link>}
      />

      <section className="grid gap-2 rounded-card border border-line bg-card p-5 md:grid-cols-4">
        <div><p className="text-xs uppercase text-ink-muted">Outstanding</p><p className="font-display text-2xl text-burgundy">{formatINR(summary.balancePaise)}</p></div>
        <div><p className="text-xs uppercase text-ink-muted">Overdue</p><p className={`font-display text-2xl ${summary.overduePaise > 0 ? 'text-danger' : 'text-burgundy'}`}>{formatINR(summary.overduePaise)}</p></div>
        <div><p className="text-xs uppercase text-ink-muted">Credit limit</p><p className="font-display text-2xl text-burgundy">{formatINR(c.credit_limit_paise as number)}</p></div>
        <div><p className="text-xs uppercase text-ink-muted">Available credit</p><p className="font-display text-2xl text-burgundy">{c.is_credit_approved ? formatINR(available) : 'Not approved'}</p></div>
      </section>

      {canManage ? (
        <>
          <section className="grid gap-3">
            <h2 className="font-display text-2xl text-burgundy">Credit entry</h2>
            <CreditEntryForm customerId={id} creditApproved={c.is_credit_approved as boolean} />
            <p className="text-xs text-ink-muted">Payments above the outstanding balance are refused. Credit sales are refused above the limit or when the customer is not approved.</p>
          </section>
          <section className="grid gap-3">
            <h2 className="font-display text-2xl text-burgundy">Profile</h2>
            <CustomerForm
              action={updateCustomerAction.bind(null, id)}
              submitLabel="Save customer"
              defaults={{
                fullName: c.full_name as string,
                mobile: (c.mobile as string | null) ?? '',
                email: (c.email as string | null) ?? '',
                gstin: (c.gstin as string | null) ?? '',
                creditLimitRupees: ((c.credit_limit_paise as number) / 100).toFixed(2),
                isCreditApproved: c.is_credit_approved as boolean,
              }}
            />
          </section>
        </>
      ) : null}

      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-burgundy">Transactions</h2>
        {running.length === 0 ? <p className="text-sm text-ink-muted">No credit transactions yet.</p> : (
          <div className="overflow-x-auto rounded-card border border-line bg-card">
            <table className="min-w-full text-sm">
              <thead className="bg-cream text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Balance</th><th className="px-4 py-3">Note</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {running.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 text-ink-muted">{new Date(r.createdAt).toLocaleDateString('en-IN')}</td>
                    <td className="px-4 py-3 capitalize">{r.entryType}</td>
                    <td className="px-4 py-3 text-ink-muted">{r.dueOn ?? '—'}</td>
                    <td className={`px-4 py-3 ${r.amountPaise < 0 ? 'text-success' : 'text-ink'}`}>{formatINR(r.amountPaise)}</td>
                    <td className="px-4 py-3 font-medium text-ink">{formatINR(r.runningPaise)}</td>
                    <td className="px-4 py-3 text-ink-muted">{r.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-2">
          <h2 className="font-display text-2xl text-burgundy">Orders</h2>
          {!orders || orders.length === 0 ? <p className="text-sm text-ink-muted">No orders linked to this customer.</p> : orders.map((o) => (
            <div key={o.id as string} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-card px-3 py-2 text-sm">
              <span className="font-medium text-ink">{o.order_number as string}</span>
              <StatusBadge status={(o.payment_status as string)} />
              <span className="text-ink-muted">{formatINR(o.total_paise as number)}</span>
            </div>
          ))}
        </div>
        <div className="grid gap-2">
          <h2 className="font-display text-2xl text-burgundy">Quotations</h2>
          {!quotes || quotes.length === 0 ? <p className="text-sm text-ink-muted">No quotations for this customer.</p> : quotes.map((q) => (
            <div key={q.id as string} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-card px-3 py-2 text-sm">
              <span className="font-medium text-ink">{q.quotation_number as string}</span>
              <span className="capitalize text-ink-muted">{(q.status as string).toLowerCase().replace('_', ' ')}</span>
              <span className="text-ink-muted">{formatINR(q.total_paise as number)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
