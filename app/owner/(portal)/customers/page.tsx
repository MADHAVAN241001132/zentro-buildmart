import Link from 'next/link';
import { PageHeader } from '@/components/owner/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireOwnerPermission } from '@/lib/services/owner';
import { formatINR } from '@/lib/money';
import { summarise, type LedgerRow } from '@/lib/services/credit';
import { CustomerForm } from './customer-forms';
import { createCustomerAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; overdue?: string }> }) {
  await requireOwnerPermission('customer_management');
  const sp = await searchParams;
  const q = (sp.q ?? '').replace(/[%_,()]/g, '').trim().slice(0, 60);
  const onlyOverdue = sp.overdue === '1';
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('customers').select('id, full_name, mobile, is_credit_approved, credit_limit_paise').order('full_name').limit(500);
  if (q) query = query.or(`full_name.ilike.%${q}%,mobile.ilike.%${q}%`);
  const [{ data: customers }, { data: ledger }] = await Promise.all([
    query,
    supabase.from('credit_ledger').select('id, customer_id, entry_type, amount_paise, due_on, note, created_at').limit(20000),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const byCustomer = new Map<string, LedgerRow[]>();
  for (const r of ledger ?? []) {
    const list = byCustomer.get(r.customer_id as string) ?? [];
    list.push({ id: r.id as string, entryType: r.entry_type as LedgerRow['entryType'], amountPaise: Number(r.amount_paise), dueOn: (r.due_on as string | null) ?? null, createdAt: r.created_at as string, note: (r.note as string | null) ?? null });
    byCustomer.set(r.customer_id as string, list);
  }

  const rows = (customers ?? []).map((c) => {
    const s = summarise(byCustomer.get(c.id as string) ?? [], today);
    return { ...c, balance: s.balancePaise, overdue: s.overduePaise };
  }).filter((c) => (onlyOverdue ? c.overdue > 0 : true));

  return (
    <div className="grid gap-8">
      <PageHeader eyebrow="Customers" title="Customers and credit" description="Customer profiles, credit limits and outstanding balances. Overdue means open credit sales past their due date." />
      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-burgundy">Add a customer</h2>
        <CustomerForm action={createCustomerAction} submitLabel="Add customer" />
      </section>
      <section className="grid gap-3">
        <form className="flex flex-wrap items-end gap-2" action="/owner/customers">
          <label className="grid gap-1 text-sm"><span className="text-ink">Search name or mobile</span><input name="q" defaultValue={q} className="rounded-control border border-line bg-white px-3 py-2" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="overdue" value="1" defaultChecked={onlyOverdue} /> Overdue only</label>
          <button type="submit" className="rounded-control border border-line px-4 py-2 text-sm hover:bg-cream">Apply</button>
        </form>
        {rows.length === 0 ? <EmptyState title="No customers match" body="Add a customer above, or change the search." /> : (
          <div className="overflow-x-auto rounded-card border border-line bg-card">
            <table className="min-w-full text-sm">
              <thead className="bg-cream text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Mobile</th><th className="px-4 py-3">Credit</th><th className="px-4 py-3">Limit</th><th className="px-4 py-3">Outstanding</th><th className="px-4 py-3">Overdue</th><th className="px-4 py-3"><span className="sr-only">Open</span></th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((c) => (
                  <tr key={c.id as string}>
                    <td className="px-4 py-3 font-medium text-ink">{c.full_name as string}</td>
                    <td className="px-4 py-3 text-ink-muted">{(c.mobile as string | null) ?? '—'}</td>
                    <td className="px-4 py-3 text-ink-muted">{c.is_credit_approved ? 'Approved' : 'Not approved'}</td>
                    <td className="px-4 py-3 text-ink-muted">{formatINR(c.credit_limit_paise as number)}</td>
                    <td className="px-4 py-3 font-medium text-ink">{formatINR(c.balance)}</td>
                    <td className={`px-4 py-3 font-medium ${c.overdue > 0 ? 'text-danger' : 'text-ink-muted'}`}>{formatINR(c.overdue)}</td>
                    <td className="px-4 py-3 text-right"><Link href={`/owner/customers/${c.id as string}`} className="text-burgundy underline">Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
