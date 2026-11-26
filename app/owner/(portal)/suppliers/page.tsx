import Link from 'next/link';
import { PageHeader } from '@/components/owner/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireOwnerPermission } from '@/lib/services/owner';
import { formatINR } from '@/lib/money';
import { createSupplierAction } from './actions';
import { SupplierForm } from './supplier-form';

export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  await requireOwnerPermission('supplier_management');
  const supabase = await createSupabaseServerClient();
  const [{ data: suppliers }, { data: invoices }, { data: payments }] = await Promise.all([
    supabase.from('suppliers').select('id, name, phone, gstin, payment_terms_days, is_active').order('name'),
    supabase.from('supplier_invoices').select('supplier_id, amount_paise'),
    supabase.from('supplier_payments').select('supplier_id, amount_paise'),
  ]);
  const owed = new Map<string, number>();
  for (const i of invoices ?? []) owed.set(i.supplier_id as string, (owed.get(i.supplier_id as string) ?? 0) + Number(i.amount_paise));
  for (const p of payments ?? []) owed.set(p.supplier_id as string, (owed.get(p.supplier_id as string) ?? 0) - Number(p.amount_paise));

  return (
    <div className="grid gap-8">
      <PageHeader eyebrow="Purchasing" title="Suppliers" description="Supplier details, GST numbers, purchase history and what is still owed to each supplier." />
      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-burgundy">Add a supplier</h2>
        <SupplierForm action={createSupplierAction} defaults={{}} submitLabel="Add supplier" />
      </section>
      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-burgundy">Suppliers</h2>
        {!suppliers || suppliers.length === 0 ? <EmptyState title="No suppliers yet" body="Add a supplier above to start raising purchase orders." /> : (
          <div className="overflow-x-auto rounded-card border border-line bg-card">
            <table className="min-w-full text-sm">
              <thead className="bg-cream text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">GSTIN</th><th className="px-4 py-3">Terms</th><th className="px-4 py-3">Outstanding</th><th className="px-4 py-3"><span className="sr-only">Open</span></th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {suppliers.map((s) => (
                  <tr key={s.id as string}>
                    <td className="px-4 py-3 font-medium text-ink">{s.name as string}{s.is_active ? '' : <span className="ml-2 text-xs text-ink-muted">(inactive)</span>}</td>
                    <td className="px-4 py-3 text-ink-muted">{(s.gstin as string | null) ?? '—'}</td>
                    <td className="px-4 py-3 text-ink-muted">{s.payment_terms_days as number} days</td>
                    <td className="px-4 py-3 font-medium text-ink">{formatINR(owed.get(s.id as string) ?? 0)}</td>
                    <td className="px-4 py-3 text-right"><Link href={`/owner/suppliers/${s.id as string}`} className="text-burgundy underline">Open</Link></td>
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
