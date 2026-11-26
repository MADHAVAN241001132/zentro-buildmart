import { PageHeader } from '@/components/owner/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { formatINR } from '@/lib/money';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CloseDayForm } from './close-form';
import { CashMovementForm } from './movement-form';

export const dynamic = 'force-dynamic';

interface Summary {
  business_date: string;
  previous_closing_paise: number;
  has_previous_closing: boolean;
  cash_sales_paise: number;
  cash_refunds_paise: number;
  cash_expenses_paise: number;
  cash_manual_in_paise: number;
  cash_deposits_paise: number;
  cash_withdrawals_paise: number;
  cash_manual_out_paise: number;
  already_closed: boolean;
}

interface MovementRow {
  id: string;
  movement_type: 'deposit' | 'withdrawal' | 'manual_in' | 'manual_out';
  amount_paise: number;
  reason: string;
  created_at: string;
}

const MOVEMENT_LABEL: Record<MovementRow['movement_type'], string> = {
  deposit: 'Deposited to bank',
  withdrawal: 'Withdrawn from bank',
  manual_in: 'Other cash in',
  manual_out: 'Other cash out',
};

function todayInIndia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export default async function CashDayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const owner = await requireOwnerPermission('cash_confirmation');
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? (sp.date as string) : todayInIndia();


  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('cash_day_summary', { p_store: owner.storeId, p_date: date });
  const summary = data as Summary | null;

  const { data: movementRows } = await supabase
    .from('cash_movements')
    .select('id, movement_type, amount_paise, reason, created_at')
    .eq('store_id', owner.storeId)
    .eq('business_date', date)
    .order('created_at', { ascending: true });
  const movements = (movementRows ?? []) as MovementRow[];
  const isToday = date === todayInIndia();

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Cash"
        title="Day close"
        description="Compare counted cash with what the day's records say should be in the drawer. Business day runs on Asia/Kolkata time."
      />
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">
          Business date
          <input type="date" name="date" defaultValue={date} className="rounded-control border border-line bg-card px-3 py-2 text-sm" />
        </label>
        <button type="submit" className="rounded-control border border-line bg-card px-4 py-2 text-sm">Show</button>
      </form>

      {error || !summary ? (
        <p role="alert" className="text-sm text-danger">Could not load this day. {error?.message ?? ''}</p>
      ) : (
        <>
          <section className="grid gap-2 rounded-card border border-line bg-card p-6 text-sm md:grid-cols-2">
            <Line label="Opening (previous closing)" value={summary.has_previous_closing ? formatINR(summary.previous_closing_paise) : 'Not closed before'} />
            <Line label="Cash sales (paid)" value={formatINR(summary.cash_sales_paise)} />
            <Line label="Cash refunds" value={`− ${formatINR(summary.cash_refunds_paise)}`} />
            <Line label="Cash expenses" value={`− ${formatINR(summary.cash_expenses_paise)}`} />
            <Line label="Other cash in" value={`+ ${formatINR(summary.cash_manual_in_paise)}`} />
            <Line label="Deposited to bank" value={`− ${formatINR(summary.cash_deposits_paise)}`} />
            <Line label="Withdrawn from bank" value={`− ${formatINR(summary.cash_withdrawals_paise)}`} />
            <Line label="Other cash out" value={`− ${formatINR(summary.cash_manual_out_paise)}`} />
            <Line label="Status" value={summary.already_closed ? 'Closed' : 'Open'} />
          </section>

          <section className="grid gap-3">
            <h2 className="font-display text-xl text-burgundy">Cash movements</h2>
            {movements.length === 0 ? (
              <p className="text-sm text-ink-muted">No bank deposits, withdrawals or other cash movements on this day.</p>
            ) : (
              <ul className="grid gap-2 rounded-card border border-line bg-card p-4 text-sm">
                {movements.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 last:border-0">
                    <span>
                      <span className="font-medium">{MOVEMENT_LABEL[m.movement_type]}</span>
                      <span className="text-ink-muted"> · {m.reason}</span>
                    </span>
                    <span className="font-medium">
                      {new Date(m.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} · {formatINR(Number(m.amount_paise))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {isToday && !summary.already_closed ? (
              <CashMovementForm />
            ) : (
              <p className="text-xs text-ink-muted">Movements can only be recorded for today while the day is open.</p>
            )}
          </section>

          <CloseDayForm date={date} showOpening={!summary.has_previous_closing} closed={summary.already_closed} />
        </>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-2 md:border-0">
      <span className="text-ink-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
