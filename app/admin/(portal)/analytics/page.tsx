import { PageHeader } from '@/components/owner/page-header';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatINR } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const supabase = await createSupabaseServerClient();
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 5, 1);
  since.setUTCHours(0, 0, 0, 0);

  const [{ data: paid }, { data: stores }] = await Promise.all([
    supabase.from('payments').select('store_id, amount_paise, paid_at').eq('status', 'PAID').gte('paid_at', since.toISOString()).limit(20000),
    supabase.from('stores').select('id, name'),
  ]);

  const monthKey = (iso: string) => iso.slice(0, 7);
  const byMonth = new Map<string, number>();
  const byStore = new Map<string, number>();
  for (const p of paid ?? []) {
    const amount = Number(p.amount_paise);
    const m = monthKey(p.paid_at as string);
    byMonth.set(m, (byMonth.get(m) ?? 0) + amount);
    byStore.set(p.store_id as string, (byStore.get(p.store_id as string) ?? 0) + amount);
  }
  const months: string[] = [];
  const cursor = new Date(since);
  for (let i = 0; i < 6; i++) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const storeName = new Map((stores ?? []).map((s) => [s.id as string, s.name as string]));
  const topStores = [...byStore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxMonth = Math.max(1, ...months.map((m) => byMonth.get(m) ?? 0));

  return (
    <div className="grid gap-8">
      <PageHeader eyebrow="Platform" title="Analytics" description="Captured online payments across all stores for the last six months. Cash sales are recorded per store and are not included here." />
      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-burgundy">Monthly captured payments</h2>
        <div className="grid gap-2 rounded-card border border-line bg-card p-5">
          {months.map((m) => {
            const total = byMonth.get(m) ?? 0;
            return (
              <div key={m} className="grid grid-cols-[6rem_1fr_9rem] items-center gap-3 text-sm">
                <span className="text-ink-muted">{m}</span>
                <div className="h-3 rounded-full bg-cream"><div className="h-3 rounded-full bg-burgundy" style={{ width: `${(total / maxMonth) * 100}%` }} /></div>
                <span className="text-right font-medium text-ink">{formatINR(total)}</span>
              </div>
            );
          })}
        </div>
      </section>
      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-burgundy">Top stores by captured payments</h2>
        {topStores.length === 0 ? <p className="text-sm text-ink-muted">No captured payments in this period.</p> : (
          <ol className="divide-y divide-line rounded-card border border-line bg-card">
            {topStores.map(([id, total]) => (
              <li key={id} className="flex justify-between px-4 py-3 text-sm"><span className="text-ink">{storeName.get(id) ?? 'Unknown store'}</span><span className="font-medium text-ink">{formatINR(total)}</span></li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
