import { PageHeader } from '@/components/owner/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireOwnerPermission } from '@/lib/services/owner';
import { AdjustBatchForm, EditBatchForm, NewBatchForm } from './batch-forms';

export const dynamic = 'force-dynamic';

export default async function BatchesPage() {
  const owner = await requireOwnerPermission('tile_batch_management');
  const supabase = await createSupabaseServerClient();
  const [{ data: batches }, { data: variants }, { data: suppliers }] = await Promise.all([
    supabase.from('inventory_batches').select('id, batch_number, shade_code, calibre, manufacturing_date, on_hand, reserved, damaged, supplier_id, product_variants(sku, label, products(name))').order('updated_at', { ascending: false }).limit(300),
    supabase.from('product_variants').select('id, sku, label, products(name)').eq('is_active', true).order('sku').limit(500),
    supabase.from('suppliers').select('id, name').order('name'),
  ]);

  const variantOptions = (variants ?? []).map((v) => {
    const p = Array.isArray(v.products) ? v.products[0] : v.products;
    return { id: v.id as string, label: `${(p as { name?: string } | null)?.name ?? 'Product'} · ${v.label as string} (${v.sku as string})` };
  });
  const supplierOptions = (suppliers ?? []).map((s) => ({ id: s.id as string, name: s.name as string }));
  const canManage = true; // the page gate requires tile batch management

  return (
    <div className="grid gap-8">
      <PageHeader eyebrow="Inventory" title="Tile batches" description="Batch numbers, shade codes, calibre and batch stock. Batch stock is a breakdown of variant stock, so the two always agree." />
      {canManage ? (
        <section className="grid gap-3">
          <h2 className="font-display text-2xl text-burgundy">New batch</h2>
          <NewBatchForm variants={variantOptions} suppliers={supplierOptions} />
        </section>
      ) : null}
      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-burgundy">Batches</h2>
        {!batches || batches.length === 0 ? (
          <EmptyState title="No batches yet" body="Create a batch above, or record a goods receipt with batch numbers." />
        ) : (
          <ul className="grid gap-3">
            {batches.map((b) => {
              const v = Array.isArray(b.product_variants) ? b.product_variants[0] : b.product_variants;
              const p = v ? (Array.isArray(v.products) ? v.products[0] : v.products) : null;
              const onHand = Number(b.on_hand);
              const reserved = Number(b.reserved);
              const damaged = Number(b.damaged);
              return (
                <li key={b.id as string} className="grid gap-3 rounded-card border border-line bg-card p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-ink">{b.batch_number as string} <span className="text-sm font-normal text-ink-muted">· {(p as { name?: string } | null)?.name ?? 'Product'} · {(v as { label?: string } | null)?.label ?? ''}</span></p>
                    <p className="text-sm text-ink-muted">Available {onHand - reserved} · Reserved {reserved} · Damaged {damaged}</p>
                  </div>
                  {canManage ? (
                    <>
                      <EditBatchForm batch={{ id: b.id as string, shade: (b.shade_code as string | null) ?? '', calibre: (b.calibre as string | null) ?? '', date: (b.manufacturing_date as string | null) ?? '', supplierId: (b.supplier_id as string | null) ?? '' }} suppliers={supplierOptions} />
                      <AdjustBatchForm batchId={b.id as string} />
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
