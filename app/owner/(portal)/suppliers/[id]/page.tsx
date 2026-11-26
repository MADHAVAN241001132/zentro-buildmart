import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/owner/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatINR } from '@/lib/money';
import { requireOwnerPermission } from '@/lib/services/owner';
import { updateSupplierAction } from '../actions';
import { SupplierForm } from '../supplier-form';
import { InvoiceForm, PaymentForm } from '../ledger-forms';

export const dynamic = 'force-dynamic';

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const owner = await requireOwnerPermission('supplier_management');
  const supabase = await createSupabaseServerClient();

  const { data: s } = await supabase.from('suppliers').select('*').eq('id', id).eq('store_id', owner.storeId).maybeSingle();
  if (!s) notFound();
  const [{ data: orders }, { data: invoices }, { data: payments }] = await Promise.all([
    supabase.from('purchase_orders').select('id, po_number, status, total_paise, created_at').eq('supplier_id', id).order('created_at', { ascending: false }).limit(50),
    supabase.from('supplier_invoices').select('id, invoice_number, invoice_date, amount_paise').eq('supplier_id', id).order('invoice_date', { ascending: false }).limit(50),
    supabase.from('supplier_payments').select('id, amount_paise, method, reference, paid_on').eq('supplier_id', id).order('paid_on', { ascending: false }).limit(50),
  ]);

  const invoiced = (invoices ?? []).reduce((n, i) => n + Number(i.amount_paise), 0);
  const paid = (payments ?? []).reduce((n, p) => n + Number(p.amount_paise), 0);
  const balance = invoiced - paid;
  const canManage = true;

  return (
    <div className="grid gap-8">
      <PageHeader eyebrow="Supplier" title={s.name as string} description={`Payment terms ${s.payment_terms_days as number} days`} />

      <section className="grid gap-2 rounded-card border border-line bg-card p-5 md:grid-cols-3">
        <div><p className="text-xs uppercase text-ink-muted">Invoiced</p><p className="font-display text-2xl text-burgundy">{formatINR(invoiced)}</p></div>
        <div><p className="text-xs uppercase text-ink-muted">Paid</p><p className="font-display text-2xl text-burgundy">{formatINR(paid)}</p></div>
        <div><p className="text-xs uppercase text-ink-muted">Outstanding</p><p className="font-display text-2xl text-burgundy">{formatINR(balance)}</p></div>
      </section>

      {canManage ? (
        <>
          <section className="grid gap-3">
            <h2 className="font-display text-2xl text-burgundy">Edit supplier</h2>
            <SupplierForm
              action={updateSupplierAction.bind(null, id)}
              defaults={{
                name: s.name as string,
                contactPerson: (s.contact_person as string | null) ?? '',
                phone: (s.phone as string | null) ?? '',
                email: (s.email as string | null) ?? '',
                gstin: (s.gstin as string | null) ?? '',
                address: (s.address as string | null) ?? '',
                paymentTermsDays: s.payment_terms_days as number,
                isActive: s.is_active as boolean,
              }}
              submitLabel="Save supplier"
              showActive
            />
          </section>
          <section className="grid gap-3">
            <h2 className="font-display text-2xl text-burgundy">Record a supplier invoice</h2>
            <InvoiceForm supplierId={id} orders={(orders ?? []).map((o) => ({ id: o.id as string, po_number: o.po_number as string }))} />
          </section>
          <section className="grid gap-3">
            <h2 className="font-display text-2xl text-burgundy">Record a payment</h2>
            <PaymentForm supplierId={id} />
            <p className="text-xs text-ink-muted">Payments above the outstanding balance are refused by the database.</p>
          </section>
        </>
      ) : null}

      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-burgundy">Purchase history</h2>
        {!orders || orders.length === 0 ? <p className="text-sm text-ink-muted">No purchase orders for this supplier.</p> : (
          <ul className="divide-y divide-line rounded-card border border-line bg-card">
            {orders.map((o) => (
              <li key={o.id as string} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <Link href={`/owner/purchasing/${o.id as string}`} className="font-medium text-burgundy underline">{o.po_number as string}</Link>
                <StatusBadge status={(o.status as string).toUpperCase()} />
                <span className="text-ink-muted">{formatINR(o.total_paise as number)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-2">
          <h2 className="font-display text-2xl text-burgundy">Invoices</h2>
          {(invoices ?? []).map((i) => (
            <p key={i.id as string} className="rounded-control border border-line bg-card px-3 py-2 text-sm">{i.invoice_number as string} · {i.invoice_date as string} · {formatINR(i.amount_paise as number)}</p>
          ))}
        </div>
        <div className="grid gap-2">
          <h2 className="font-display text-2xl text-burgundy">Payments</h2>
          {(payments ?? []).map((p) => (
            <p key={p.id as string} className="rounded-control border border-line bg-card px-3 py-2 text-sm">{p.paid_on as string} · {p.method as string} · {formatINR(p.amount_paise as number)}{p.reference ? ` · ${p.reference as string}` : ''}</p>
          ))}
        </div>
      </section>
    </div>
  );
}
