import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatINR } from '@/lib/money';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CashConfirmForm } from './cash-confirm-form';

export const dynamic = 'force-dynamic';

export default async function CashPaymentsPage() {
  const owner = await requireOwnerPermission('cash_confirmation');
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('payments')
    .select('id, amount_paise, created_at, orders(id, order_number, customer_name, customer_mobile, total_paise, order_status, order_items(product_name_snapshot, variant_label_snapshot, quantity))')
    .eq('store_id', owner.storeId)
    .eq('method', 'cash')
    .eq('status', 'CASH_PENDING')
    .order('created_at', { ascending: true });

  const rows = (data ?? []) as unknown as {
    id: string;
    amount_paise: number;
    created_at: string;
    orders: {
      id: string;
      order_number: string;
      customer_name: string;
      customer_mobile: string | null;
      order_status: string;
      order_items: { product_name_snapshot: string; variant_label_snapshot: string; quantity: number }[];
    } | null;
  }[];

  return (
    <div className="grid gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Counter</p>
        <h1 className="font-display text-3xl text-burgundy">Cash payments</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Confirm cash only after you have received the exact amount. Confirming deducts stock once and marks the order paid.
        </p>
      </header>

      {error ? (
        <EmptyState title="Could not load cash payments" body="Refresh the page to try again." />
      ) : rows.length === 0 ? (
        <EmptyState title="No cash waiting" body="When a customer chooses to pay at the showroom, the order appears here." />
      ) : (
        <ul className="grid gap-4">
          {rows.map((row) =>
            row.orders ? (
              <li key={row.id} className="grid gap-4 rounded-card border border-line bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{row.orders.order_number} · {row.orders.customer_name}</p>
                    <p className="text-sm text-ink-muted">
                      {row.orders.customer_mobile ?? 'No mobile'} · {new Date(row.created_at).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <StatusBadge status="CASH_PENDING" />
                </div>
                <ul className="grid gap-1 text-sm text-ink">
                  {row.orders.order_items.map((item, index) => (
                    <li key={index}>{item.product_name_snapshot} · {item.variant_label_snapshot} × {item.quantity}</li>
                  ))}
                </ul>
                <p className="font-display text-2xl text-burgundy">Collect {formatINR(row.amount_paise)}</p>
                <CashConfirmForm orderId={row.orders.id} amountDuePaise={row.amount_paise} />
              </li>
            ) : null,
          )}
        </ul>
      )}
    </div>
  );
}
