import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatINR } from '@/lib/money';
import { requireOwnerPermission } from '@/lib/services/owner';
import { withRunningBalance, type LedgerRow } from '@/lib/services/credit';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function StatementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const from = sp.from && DATE.test(sp.from) ? sp.from : '';
  const to = sp.to && DATE.test(sp.to) ? sp.to : '';
  const owner = await requireOwnerPermission('customer_management');
  const supabase = await createSupabaseServerClient();

  const { data: c } = await supabase.from('customers').select('full_name, mobile, gstin, credit_limit_paise').eq('id', id).eq('store_id', owner.storeId).maybeSingle();
  if (!c) notFound();
  const { data: entries } = await supabase.from('credit_ledger').select('id, entry_type, amount_paise, due_on, note, created_at').eq('customer_id', id).order('created_at', { ascending: true }).limit(5000);

  const rows: LedgerRow[] = (entries ?? []).map((e) => ({
    id: e.id as string,
    entryType: e.entry_type as LedgerRow['entryType'],
    amountPaise: Number(e.amount_paise),
    dueOn: (e.due_on as string | null) ?? null,
    createdAt: e.created_at as string,
    note: (e.note as string | null) ?? null,
  }));
  const running = withRunningBalance(rows);
  const inRange = running.filter((r) => {
    const day = r.createdAt.slice(0, 10);
    return (!from || day >= from) && (!to || day <= to);
  });
  const openingBefore = from ? running.filter((r) => r.createdAt.slice(0, 10) < from).reduce((n, r) => n + r.amountPaise, 0) : 0;
  const closing = running.filter((r) => !to || r.createdAt.slice(0, 10) <= to).reduce((n, r) => n + r.amountPaise, 0);

  return (
    <div className="grid gap-6 print:gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Customer statement</p>
          <h1 className="font-display text-3xl text-burgundy">{c.full_name as string}</h1>
          <p className="text-sm text-ink-muted">{[c.mobile, c.gstin ? `GSTIN ${c.gstin as string}` : null].filter(Boolean).join(' · ')}</p>
          <p className="text-sm text-ink-muted">Period: {from || 'beginning'} to {to || 'today'}</p>
        </div>
        <PrintButton />
      </div>

      <form className="flex flex-wrap items-end gap-2 print:hidden" action={`/owner/customers/${id}/statement`}>
        <label className="grid gap-1 text-sm"><span>From</span><input type="date" name="from" defaultValue={from} className="rounded-control border border-line bg-white px-3 py-2" /></label>
        <label className="grid gap-1 text-sm"><span>To</span><input type="date" name="to" defaultValue={to} className="rounded-control border border-line bg-white px-3 py-2" /></label>
        <button type="submit" className="rounded-control border border-line px-4 py-2 text-sm hover:bg-cream">Apply</button>
      </form>

      <table className="min-w-full text-sm">
        <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
          <tr><th className="py-2">Date</th><th className="py-2">Type</th><th className="py-2">Due</th><th className="py-2 text-right">Amount</th><th className="py-2 text-right">Balance</th><th className="py-2">Note</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          <tr><td className="py-2 text-ink-muted" colSpan={4}>Opening balance</td><td className="py-2 text-right font-medium">{formatINR(openingBefore)}</td><td /></tr>
          {inRange.map((r) => (
            <tr key={r.id}>
              <td className="py-2">{new Date(r.createdAt).toLocaleDateString('en-IN')}</td>
              <td className="py-2 capitalize">{r.entryType}</td>
              <td className="py-2 text-ink-muted">{r.dueOn ?? '—'}</td>
              <td className="py-2 text-right">{formatINR(r.amountPaise)}</td>
              <td className="py-2 text-right">{formatINR(r.runningPaise)}</td>
              <td className="py-2 text-ink-muted">{r.note ?? ''}</td>
            </tr>
          ))}
          <tr className="font-semibold"><td className="py-2" colSpan={4}>Closing balance{to ? ` on ${to}` : ''}</td><td className="py-2 text-right">{formatINR(closing)}</td><td /></tr>
        </tbody>
      </table>
    </div>
  );
}
