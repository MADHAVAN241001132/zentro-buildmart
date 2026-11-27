import { PageHeader } from '@/components/owner/page-header';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatINR } from '@/lib/money';
import { SettingsForm } from './settings-form';
import { StoreBrandingManager } from '@/components/admin/store-branding-manager';
import { updateOwnerBrandingAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const owner = await requireOwnerPermission('store_settings');
  const supabase = await createSupabaseServerClient();
  const { data: s } = await supabase.from('store_settings').select('*').eq('store_id', owner.storeId).maybeSingle();
  const { data: store } = await supabase
    .from('stores')
    .select('name, city, state, phone, gstin, address_line, pincode, logo_url, banner_url, legal_name, business_category, business_description, billing_address, gst_registration, prices_include_gst')
    .eq('id', owner.storeId)
    .maybeSingle();
  if (!s || !store) return <p className="text-ink">Settings are not available for this store.</p>;

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Store" title="Settings" description="Payment methods, catalogue visibility, delivery charges and document numbering for this showroom." />
      <section className="grid gap-1 rounded-card border border-line bg-card p-5 text-sm">
        <p className="font-semibold text-ink">{store.name as string}</p>
        <p className="text-ink-muted">{[store.address_line, store.city, store.state, store.pincode].filter(Boolean).join(', ')}</p>
        <p className="text-ink-muted">{store.phone ? `Phone ${store.phone as string}` : ''}{store.gstin ? ` · GSTIN ${store.gstin as string}` : ''}</p>
        <p className="mt-2 text-xs text-ink-muted">Business name, address and GSTIN are managed by ZENTRO administration.</p>
      </section>
      <section className="grid gap-2 rounded-card border border-line bg-card p-5 text-sm">
        <h2 className="font-display text-lg text-burgundy">Legal and tax profile</h2>
        <p><span className="text-ink-muted">Registered business name:</span> {(store.legal_name as string | null) ?? store.name as string}</p>
        <p><span className="text-ink-muted">Business category:</span> {(store.business_category as string | null) ?? 'Not set'}</p>
        <p><span className="text-ink-muted">Billing address:</span> {(store.billing_address as string | null) ?? 'Not set'}</p>
        <p><span className="text-ink-muted">GST registration:</span> {({ regular: 'Regular taxpayer', composition: 'Composition scheme', unregistered: 'Not registered for GST' } as Record<string, string>)[store.gst_registration as string] ?? 'Not set'}</p>
        <p><span className="text-ink-muted">Listed prices include GST:</span> {store.prices_include_gst === true ? 'Yes' : 'No'}</p>
        <p className="mt-1 text-xs text-ink-muted">These details are maintained by ZENTRO administration. Invoices and quotations keep the details in force when they are issued.</p>
      </section>
      <section className="grid gap-4">
        <h2 className="font-display text-lg text-burgundy">Store branding</h2>
        <StoreBrandingManager
          storeId={owner.storeId}
          storeSlug={owner.storeSlug}
          currentName={store.name as string}
          currentLogoUrl={(store.logo_url as string | null) ?? null}
          currentBannerUrl={(store.banner_url as string | null) ?? null}
          currentTagline={typeof (s.opening_hours as Record<string, unknown> | null)?.tagline === 'string' ? ((s.opening_hours as Record<string, unknown>).tagline as string) : ''}
          currentDescription={(store.business_description as string | null) ?? ''}
          action={updateOwnerBrandingAction}
          isOwner
        />
      </section>
      <SettingsForm
        defaults={{
          orderPrefix: s.order_prefix as string,
          invoicePrefix: s.invoice_prefix as string,
          reservationMinutes: s.reservation_minutes as number,
          paymentExpiryMinutes: s.payment_expiry_minutes as number,
          defaultLanguage: s.default_language as string,
          notificationEmail: (s.notification_email as string | null) ?? '',
          onlineEnabled: s.online_payment_enabled as boolean,
          cashEnabled: s.cash_payment_enabled as boolean,
          catalogueVisible: s.catalogue_visible as boolean,
          deliveryChargeRupees: ((s.delivery_charge_paise as number) / 100).toFixed(2),
          freeDeliveryAboveRupees: s.free_delivery_above_paise === null ? '' : ((s.free_delivery_above_paise as number) / 100).toFixed(2),
        }}
      />
      <p className="text-xs text-ink-muted">Current delivery charge: {formatINR(s.delivery_charge_paise as number)}. Pickup orders carry no delivery charge.</p>
    </div>
  );
}
