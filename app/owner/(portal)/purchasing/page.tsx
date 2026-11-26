import Link from 'next/link';
import { PageHeader } from '@/components/owner/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireOwnerPermission } from '@/lib/services/owner';
import { formatINR } from '@/lib/money';
import { NewPoForm } from './po-forms';

export const dynamic = 'force-dynamic';

export default async function PurchasingPage() {
  await requireOwnerPermission('purchasing');
  const supabase = await createSupabaseServerClient();
  const [{ data: orders }, { data: suppliers }, { data: variants }] = await Promise.all([
    supabase.from('purchase_orders').select('id, po_number, status, total_paise, expected_on, suppliers(name)').order('created_at', { ascending: false }).limit(100),
    supabase.from('suppliers').select('id, name').eq('is_active', true).order('name'),
    supabase.from('product_variants').select('id, sku, label, products(name)').eq('is_active', true).order('sku').limit(500),
  ]);

  const variantOptions = (variants ?? []).map((v) => {
    const product = Array.isArray(v.products) ? v.products[0] : v.products;
    return { id: v.id as string, label: `${(product as { name?: string } | null)?.name ?? 'Product'} · ${v.label as string} (${v.sku as string})` };
  });

  return (
    <div className="grid gap-8">
      <PageHeader eyebrow="Purchasing" title="Purchase orders" description="Raise orders to suppliers, then record goods as they arrive. Stock updates when a receipt is recorded." />
      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-burgundy">New purchase order</h2>
        {!suppliers || suppliers.length === 0 ? (
          <EmptyState title="Add a supplier first" body="Purchase orders need an active supplier." action={<Link href="/owner/suppliers" className="text-burgundy underline">Go to suppliers</Link>} />
        ) : (
          <NewPoForm suppliers={suppliers.map((s) => ({ id: s.id as string, name: s.name as string }))} variants={variantOptions} />
        )}
      </section>
      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-burgundy">Orders</h2>
        {!orders || orders.length === 0 ? <p className="text-sm text-ink-muted">No purchase orders yet.</p> : (
          <div className="overflow-x-auto rounded-card border border-line bg-card">
            <table className="min-w-full text-sm">
              <thead className="bg-cream text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr><th className="px-4 py-3">PO</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Expected</th><th className="px-4 py-3"><span className="sr-only">Open</span></th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.map((o) => {
                  const sup = Array.isArray(o.suppliers) ? o.suppliers[0] : o.suppliers;
                  return (
                    <tr key={o.id as string}>
                      <td className="px-4 py-3 font-medium text-ink">{o.po_number as string}</td>
                      <td className="px-4 py-3 text-ink-muted">{(sup as { name?: string } | null)?.name ?? '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={(o.status as string).toUpperCase()} /></td>
                      <td className="px-4 py-3 text-ink-muted">{formatINR(o.total_paise as number)}</td>
                      <td className="px-4 py-3 text-ink-muted">{(o.expected_on as string | null) ?? '—'}</td>
                      <td className="px-4 py-3 text-right"><Link href={`/owner/purchasing/${o.id as string}`} className="text-burgundy underline">Open</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
