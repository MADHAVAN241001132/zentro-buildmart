import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/owner/page-header';
import { ConfirmSubmit } from '@/components/owner/confirm-submit';
import { StatusBadge } from '@/components/ui/status-badge';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatINR } from '@/lib/money';
import { requireOwnerPermission } from '@/lib/services/owner';
import { setPurchaseOrderStatusAction } from '../actions';
import { ReceiveForm } from '../po-forms';

export const dynamic = 'force-dynamic';

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const owner = await requireOwnerPermission('purchasing');
  const supabase = await createSupabaseServerClient();

  const { data: po } = await supabase.from('purchase_orders').select('id, po_number, status, total_paise, expected_on, supplier_id, suppliers(name)').eq('id', id).eq('store_id', owner.storeId).maybeSingle();
  if (!po) notFound();
  const [{ data: items }, { data: receipts }] = await Promise.all([
    supabase.from('purchase_order_items').select('id, quantity_ordered, quantity_received, unit_cost_paise, product_variants(sku, label, products(name))').eq('purchase_order_id', id),
    supabase.from('goods_receipts').select('id, grn_number, created_at, notes').eq('purchase_order_id', id).order('created_at', { ascending: false }),
  ]);

  const sup = Array.isArray(po.suppliers) ? po.suppliers[0] : po.suppliers;
  const receivable = (items ?? [])
    .map((it) => {
      const v = Array.isArray(it.product_variants) ? it.product_variants[0] : it.product_variants;
      const p = v ? (Array.isArray(v.products) ? v.products[0] : v.products) : null;
      return {
        id: it.id as string,
        label: `${(p as { name?: string } | null)?.name ?? 'Product'} · ${(v as { label?: string } | null)?.label ?? ''} (${(v as { sku?: string } | null)?.sku ?? ''})`,
        remaining: Number(it.quantity_ordered) - Number(it.quantity_received),
      };
    })
    .filter((r) => r.remaining > 0);
  const status = po.status as string;
  const canReceive = (status === 'sent' || status === 'partially_received') && receivable.length > 0;

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Purchase order"
        title={po.po_number as string}
        description={`${(sup as { name?: string } | null)?.name ?? 'Supplier'} · Expected ${(po.expected_on as string | null) ?? 'not set'} · Total ${formatINR(po.total_paise as number)}`}
        actions={<StatusBadge status={status.toUpperCase()} />}
      />

      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-burgundy">Lines</h2>
        <ul className="divide-y divide-line rounded-card border border-line bg-card">
          {(items ?? []).map((it) => {
            const v = Array.isArray(it.product_variants) ? it.product_variants[0] : it.product_variants;
            const p = v ? (Array.isArray(v.products) ? v.products[0] : v.products) : null;
            return (
              <li key={it.id as string} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
                <span className="text-ink">{(p as { name?: string } | null)?.name ?? 'Product'} · {(v as { label?: string } | null)?.label ?? ''}</span>
                <span className="text-ink-muted">{it.quantity_received as number} of {it.quantity_ordered as number} received · {formatINR(it.unit_cost_paise as number)} each</span>
              </li>
            );
          })}
        </ul>
      </section>

      {(status === 'draft' || status === 'sent') ? (
        <section className="flex flex-wrap gap-2">
          {status === 'draft' ? (
            <form action={setPurchaseOrderStatusAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="to" value="sent" />
              <ConfirmSubmit variant="primary" message="Mark this order as sent to the supplier? Its quantities will count as incoming stock.">Mark as sent</ConfirmSubmit>
            </form>
          ) : null}
          <form action={setPurchaseOrderStatusAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="to" value="cancelled" />
            <ConfirmSubmit variant="danger" message="Cancel this purchase order?">Cancel order</ConfirmSubmit>
          </form>
        </section>
      ) : null}

      {canReceive ? (
        <section className="grid gap-3">
          <h2 className="font-display text-2xl text-burgundy">Record goods receipt</h2>
          <ReceiveForm poId={id} items={receivable} />
        </section>
      ) : null}

      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-burgundy">Receipts</h2>
        {!receipts || receipts.length === 0 ? <p className="text-sm text-ink-muted">No goods have been received against this order.</p> : (
          <ul className="divide-y divide-line rounded-card border border-line bg-card">
            {receipts.map((r) => (
              <li key={r.id as string} className="px-4 py-3 text-sm">{r.grn_number as string} · {new Date(r.created_at as string).toLocaleString('en-IN')}{r.notes ? ` · ${r.notes as string}` : ''}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
