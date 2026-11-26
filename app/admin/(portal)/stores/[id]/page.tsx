import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/owner/page-header';
import { ConfirmSubmit } from '@/components/owner/confirm-submit';
import { StatusBadge } from '@/components/ui/status-badge';
import { buttonClass } from '@/components/ui/button';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { updateStoreAction, setStoreStatusAction, ensureShowroomQrAction } from '../actions';
import { StoreForm } from '../store-form';

export const dynamic = 'force-dynamic';

export default async function StoreDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const { notice } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: store } = await supabase.from('stores').select('*').eq('id', id).maybeSingle();
  if (!store) notFound();

  const [{ data: owners }, { data: subs }, { data: qr }] = await Promise.all([
    supabase.from('store_owners').select('profile_id, role, is_active, profiles(full_name, phone)').eq('store_id', id),
    supabase.from('subscriptions').select('id, status, period_end, subscription_plans(name)').eq('store_id', id).order('created_at', { ascending: false }).limit(3),
    supabase.from('qr_codes').select('id, public_url, is_active').eq('store_id', id).eq('target_type', 'showroom'),
  ]);

  const status = store.status as string;
  const hasQr = (qr ?? []).some((q) => q.is_active);

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Store"
        title={store.name as string}
        description={`/store/${store.slug as string}`}
        actions={<StatusBadge status={status.toUpperCase()} />}
      />

      {notice === 'qr-missing' ? (
        <p className="rounded-control bg-warning/10 px-3 py-2 text-sm text-warning">The store was created but its showroom QR could not be generated. Use the button below to retry.</p>
      ) : null}

      <section className="grid gap-3 rounded-card border border-line bg-card p-5">
        <h2 className="font-display text-xl text-burgundy">Lifecycle</h2>
        <p className="text-sm text-ink-muted">
          Activation requires an active showroom QR code. {hasQr ? 'The showroom QR is in place.' : 'No active showroom QR exists yet.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {!hasQr ? (
            <form action={ensureShowroomQrAction}>
              <input type="hidden" name="id" value={id} />
              <button type="submit" className={buttonClass('secondary')}>Generate showroom QR</button>
            </form>
          ) : null}
          {status !== 'active' ? (
            <form action={setStoreStatusAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value="active" />
              <button type="submit" className={buttonClass('primary')} disabled={!hasQr}>Activate store</button>
            </form>
          ) : null}
          {status === 'active' ? (
            <form action={setStoreStatusAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value="suspended" />
              <ConfirmSubmit message="Suspend this store? Customers will no longer see its catalogue.">Suspend store</ConfirmSubmit>
            </form>
          ) : null}
          {status !== 'archived' ? (
            <form action={setStoreStatusAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value="archived" />
              <ConfirmSubmit variant="danger" message="Archive this store? This hides it from the platform.">Archive</ConfirmSubmit>
            </form>
          ) : null}
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-burgundy">Details</h2>
        <StoreForm
          action={updateStoreAction.bind(null, id)}
          showLegal
          defaults={{
            legalName: (store.legal_name as string | null) ?? '',
            businessCategory: (store.business_category as string | null) ?? '',
            businessDescription: (store.business_description as string | null) ?? '',
            billingAddress: (store.billing_address as string | null) ?? '',
            gstRegistration: (store.gst_registration as string) ?? 'unregistered',
            pricesIncludeGst: store.prices_include_gst === true,
            name: store.name as string,
            slug: store.slug as string,
            status,
            gstin: (store.gstin as string | null) ?? '',
            addressLine: (store.address_line as string | null) ?? '',
            city: (store.city as string | null) ?? '',
            state: (store.state as string | null) ?? '',
            pincode: (store.pincode as string | null) ?? '',
            phone: (store.phone as string | null) ?? '',
            email: (store.email as string | null) ?? '',
            brandColour: store.brand_colour as string,
          }}
          submitLabel="Save store"
        />
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl text-burgundy">Owners</h2>
          <Link href="/admin/owners" className="text-sm text-burgundy underline">Manage owner accounts</Link>
        </div>
        {!owners || owners.length === 0 ? (
          <p className="text-sm text-ink-muted">No owner account is linked to this store yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line bg-card">
            {owners.map((o) => {
              const profile = Array.isArray(o.profiles) ? o.profiles[0] : o.profiles;
              return (
                <li key={o.profile_id as string} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
                  <span className="font-medium text-ink">{(profile as { full_name?: string } | null)?.full_name ?? 'Unnamed'}</span>
                  <span className="text-ink-muted capitalize">{o.role as string} · {o.is_active ? 'active' : 'inactive'}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-burgundy">Subscription</h2>
        {!subs || subs.length === 0 ? (
          <p className="text-sm text-ink-muted">No subscription assigned. <Link href="/admin/subscriptions" className="text-burgundy underline">Assign a plan</Link>.</p>
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line bg-card">
            {subs.map((s) => {
              const plan = Array.isArray(s.subscription_plans) ? s.subscription_plans[0] : s.subscription_plans;
              return (
                <li key={s.id as string} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
                  <span className="font-medium text-ink">{(plan as { name?: string } | null)?.name ?? 'Plan'}</span>
                  <span className="text-ink-muted capitalize">{s.status as string} · ends {s.period_end as string}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
