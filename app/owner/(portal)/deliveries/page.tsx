import { PageHeader } from '@/components/owner/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatINR } from '@/lib/money';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { scheduleDeliveryAction, setDeliveryStatusAction } from './actions';

export const dynamic = 'force-dynamic';

interface DeliveryOrder {
  id: string;
  order_number: string;
  customer_name: string;
  customer_mobile: string | null;
  order_status: string;
  payment_status: string;
  total_paise: number;
  deliveries: DeliveryInfo | DeliveryInfo[] | null;
}

interface DeliveryInfo {
  status: string;
  scheduled_on: string | null;
  assigned_to: string | null;
  vehicle_number: string | null;
  delivery_charge_paise: number;
}

/** The next steps a delivery may take. The database enforces the same rules. */
const NEXT_STEPS: Record<string, Array<{ to: string; label: string }>> = {
  scheduled: [{ to: 'assigned', label: 'Mark assigned' }],
  assigned: [{ to: 'out_for_delivery', label: 'Dispatch' }],
  out_for_delivery: [
    { to: 'delivered', label: 'Mark delivered' },
    { to: 'failed', label: 'Mark failed' },
  ],
  failed: [{ to: 'assigned', label: 'Reassign' }],
};

const FIELD = 'rounded-control border border-line bg-card px-2 py-1.5 text-sm';

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const owner = await requireOwnerPermission('order_management');
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, customer_name, customer_mobile, order_status, payment_status, total_paise, deliveries(status, scheduled_on, assigned_to, vehicle_number, delivery_charge_paise)')
    .eq('fulfilment', 'delivery')
    .not('order_status', 'in', '(CANCELLED)')
    .order('created_at', { ascending: false })
    .limit(100);
  const orders = (data ?? []) as DeliveryOrder[];
  const canSchedule = true;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Operations"
        title="Deliveries"
        description="Schedule deliveries and move them through dispatch. A delivery leaves only after its payment is recorded as received."
      />
      {sp.error ? <p role="alert" className="text-sm text-danger">{sp.error}</p> : null}
      {error ? <p role="alert" className="text-sm text-danger">Could not load deliveries.</p> : null}

      {orders.length === 0 ? (
        <EmptyState title="No delivery orders" body="Orders chosen for home delivery appear here." />
      ) : (
        <div className="grid gap-4">
          {orders.map((order) => {
            const delivery = Array.isArray(order.deliveries) ? order.deliveries[0] : order.deliveries;
            const steps = delivery ? NEXT_STEPS[delivery.status] ?? [] : [];
            return (
              <article key={order.id} className="grid gap-4 rounded-card border border-line bg-card p-5">
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-burgundy">{order.order_number}</p>
                    <p className="text-sm">{order.customer_name}{order.customer_mobile ? ` · ${order.customer_mobile}` : ''}</p>
                    <p className="text-xs text-ink-muted">Total {formatINR(order.total_paise)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={order.payment_status} />
                    <StatusBadge status={order.order_status} />
                    {delivery ? <StatusBadge status={delivery.status} /> : null}
                  </div>
                </header>

                {delivery ? (
                  <p className="text-sm text-ink-muted">
                    {delivery.scheduled_on ? `Scheduled ${delivery.scheduled_on}` : 'No date set'}
                    {delivery.assigned_to ? ` · ${delivery.assigned_to}` : ''}
                    {delivery.vehicle_number ? ` · ${delivery.vehicle_number}` : ''}
                    {` · Charge ${formatINR(delivery.delivery_charge_paise)}`}
                  </p>
                ) : (
                  <p className="text-sm text-ink-muted">Not scheduled yet.</p>
                )}

                {steps.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {steps.map((step) => (
                      <form key={step.to} action={setDeliveryStatusAction}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="to" value={step.to} />
                        <Button type="submit" variant={step.to === 'failed' ? 'danger' : 'secondary'}>{step.label}</Button>
                      </form>
                    ))}
                  </div>
                ) : null}

                {canSchedule && (!delivery || delivery.status !== 'delivered') ? (
                  <form action={scheduleDeliveryAction} className="grid gap-3 border-t border-line pt-4 md:grid-cols-5">
                    <input type="hidden" name="orderId" value={order.id} />
                    <label className="grid gap-1 text-xs">Date<input type="date" name="scheduledOn" required className={FIELD} /></label>
                    <label className="grid gap-1 text-xs">Driver<input name="assignedTo" maxLength={80} className={FIELD} /></label>
                    <label className="grid gap-1 text-xs">Vehicle<input name="vehicle" maxLength={30} className={FIELD} /></label>
                    <label className="grid gap-1 text-xs">Charge (₹)<input name="chargeRupees" inputMode="decimal" defaultValue={delivery ? (delivery.delivery_charge_paise / 100).toFixed(2) : '0'} className={FIELD} /></label>
                    <div className="flex items-end"><Button type="submit" variant="secondary">{delivery ? 'Update schedule' : 'Schedule'}</Button></div>
                  </form>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
