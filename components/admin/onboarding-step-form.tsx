'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Copy,
  Download,
  Printer,
  QrCode,
  Store,
  UserCheck,
  Sparkles,
  Layers,
  ArrowRight,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { activateOnboardingAction, saveOnboardingStepAction, type OnboardingState } from '@/app/admin/(portal)/onboarding/actions';
import { STEP_TITLES } from '@/lib/onboarding/rules';
import { FEATURE_KEYS } from '@/lib/validation/admin';

type Draft = Record<string, Record<string, unknown> | undefined>;

export interface PlanOption {
  id: string;
  name: string;
  billing_interval: string;
  price_paise: number;
  max_products: number | null;
}

interface Props {
  onboardingId: string;
  step: number;
  draft: Draft;
  plans: PlanOption[];
  storeSlug: string | null;
  issues: string[];
  completed: boolean;
  ownerLinked: boolean;
}

const INITIAL: OnboardingState = { ok: false };

const FEATURE_LABELS: Record<(typeof FEATURE_KEYS)[number], { label: string; desc: string; category: string }> = {
  online_payments: { label: 'Online Payments', desc: 'Accept UPI, cards & NetBanking at guest checkout', category: 'Commerce & Orders' },
  pos_billing: { label: 'POS Billing', desc: 'Point-of-sale in-store cashier terminal & thermal bills', category: 'Commerce & Orders' },
  quotations: { label: 'Quotations', desc: 'Create, share & PDF-export customer estimates', category: 'Commerce & Orders' },
  delivery: { label: 'Delivery Management', desc: 'Dispatch tracking & delivery order statuses', category: 'Commerce & Orders' },
  coupons: { label: 'Coupons & Promos', desc: 'Promo codes & cart percentage discounts', category: 'Commerce & Orders' },

  room_visualiser: { label: 'Room Visualizer', desc: 'Interactive room tile preview & live wall styling', category: 'Customer Experience' },
  house_project_planner: { label: 'House Project Planner', desc: 'Room-by-room requirement checklists & quotes', category: 'Customer Experience' },
  credit_ledger: { label: 'Customer Credit Ledger', desc: 'Track customer balances, credit terms & repayments', category: 'Customer Experience' },

  tile_batches: { label: 'Tile Batches', desc: 'Track tile shade variations & warehouse batches', category: 'Operations & Stock' },
  purchase_orders: { label: 'Purchase Orders', desc: 'Supplier procurement, GRNs & supplier ledgers', category: 'Operations & Stock' },
  bulk_imports: { label: 'Bulk Imports', desc: 'Excel/CSV catalogue import & bulk price updates', category: 'Operations & Stock' },
  reports: { label: 'Reports & Exports', desc: 'Financial dashboards, GST exports & sales trends', category: 'Operations & Stock' },
  qr_scan_analytics: { label: 'QR Scan Analytics', desc: 'Track in-store customer QR scans & store entries', category: 'Operations & Stock' },
};

const BUSINESS_CATEGORIES = [
  'Tiles and sanitaryware',
  'Building materials',
  'Paints and finishes',
  'Hardware and fittings',
  'Electrical and lighting',
  'Plumbing and sanitation',
  'Wood and interior supplies',
  'Other construction retail',
];

const input = 'w-full rounded-control border border-line bg-white px-3 py-2.5 text-sm text-ink focus:border-burgundy focus:outline-none focus:ring-2 focus:ring-gold/40';

function value(draft: Draft, section: string, key: string): string {
  const v = draft[section]?.[key];
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function Field({ label, error, children, hint }: { label: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-ink">
      <span>{label}</span>
      {children}
      {hint ? <span className="text-xs font-normal text-ink-muted">{hint}</span> : null}
      {error ? <span role="alert" className="text-xs font-normal text-danger">{error}</span> : null}
    </label>
  );
}

export function OnboardingStepForm({ onboardingId, step, draft, plans, storeSlug, issues, completed, ownerLinked }: Props) {
  const router = useRouter();
  const save = saveOnboardingStepAction.bind(null, onboardingId, step);
  const [state, formAction, pending] = useActionState(save, INITIAL);
  const [activateState, activateAction, activating] = useActionState(activateOnboardingAction.bind(null, onboardingId), INITIAL);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Auto-slug state
  const initialName = value(draft, 'info', 'name');
  const initialSlug = value(draft, 'info', 'slug');
  const [nameVal, setNameVal] = useState(initialName);
  const [slugVal, setSlugVal] = useState(initialSlug);
  const [slugTouched, setSlugTouched] = useState(Boolean(initialSlug));

  // Default dates for step 5
  const todayStr = new Date().toISOString().split('T')[0];
  const nextYearDate = new Date();
  nextYearDate.setFullYear(nextYearDate.getFullYear() + 1);
  const nextYearStr = nextYearDate.toISOString().split('T')[0];

  const errors = state.fieldErrors ?? {};

  // Auto-advance step on successful save
  useEffect(() => {
    if (state.ok && step < 8) {
      const timer = setTimeout(() => {
        router.push(`/admin/onboarding/${onboardingId}?step=${step + 1}`);
        router.refresh();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [state.ok, step, onboardingId, router]);

  const effectiveSlug = storeSlug || value(draft, 'info', 'slug') || 'store';
  const qrImageUrl = `/api/store/${effectiveSlug}/qr?target=showroom&size=600`;
  const guestStoreUrl = `/store/${effectiveSlug}`;

  function handleCopyStoreLink() {
    const fullUrl = `${window.location.origin}${guestStoreUrl}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  }

  const message = (s: OnboardingState) =>
    s.message ? (
      <div role={s.ok ? 'status' : 'alert'} className={`rounded-control p-3 text-sm font-medium ${s.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
        {s.message}
      </div>
    ) : null;

  // ==========================================
  // STEP 8: REVIEW AND ACTIVATION / SUCCESS SCREEN
  // ==========================================
  if (step === 8) {
    const info = draft.info ?? {};
    const owner = draft.owner ?? {};
    const tax = draft.tax ?? {};
    const subscription = draft.subscription ?? {};
    const features = draft.features ?? {};
    const activeFeaturesCount = Object.values(features).filter(Boolean).length;
    const planName = plans.find((p) => p.id === subscription.planId)?.name ?? 'Selected Plan';

    return (
      <div className="grid gap-6">
        {completed ? (
          /* PART 15: PROFESSIONAL ONBOARDING SUCCESS SCREEN */
          <div className="grid gap-6 rounded-card border-2 border-success/40 bg-card p-6 shadow-hover md:p-8">
            <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-success/20 text-success">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-success">Provisioning Successful</p>
                <h2 className="font-display text-2xl text-burgundy sm:text-3xl">Your Store Has Been Successfully Activated!</h2>
                <p className="text-sm text-ink-muted">
                  The store, independent owner account, guest storefront, catalog empty state, and unique QR code are fully provisioned.
                </p>
              </div>
            </div>

            <div className="grid gap-4 rounded-control border border-line bg-cream/60 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-ink-muted">Store Name</p>
                <p className="font-display text-base font-semibold text-burgundy">{String(info.name ?? '–')}</p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Status</p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  Active
                </span>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Owner Account</p>
                <p className="text-sm font-medium text-ink">{String(owner.email ?? 'Linked Account')}</p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Assigned Subscription</p>
                <p className="text-sm font-medium text-ink">{planName}</p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Approved Features</p>
                <p className="text-sm font-semibold text-burgundy">{activeFeaturesCount} of 13 features enabled</p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Guest Storefront URL</p>
                <Link href={guestStoreUrl} target="_blank" className="inline-flex items-center gap-1 text-sm font-medium text-burgundy hover:underline">
                  {guestStoreUrl} <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Activated Date</p>
                <p className="text-sm text-ink">{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Unique QR Destination</p>
                <p className="text-sm font-mono text-ink-muted">/store/{effectiveSlug}</p>
              </div>
            </div>

            {/* QR Code and Actions */}
            <div className="grid gap-6 border-t border-line pt-6 md:grid-cols-[200px_1fr] md:items-center">
              <div className="flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrImageUrl} alt="Store QR Code" width={200} height={200} className="h-44 w-44 rounded-control border border-line bg-white p-2 shadow-sm" />
                <span className="text-[11px] font-mono text-ink-muted">Showroom QR Code</span>
              </div>
              <div className="grid gap-3">
                <p className="text-sm font-semibold text-ink">Storefront & Management Quick Actions:</p>
                <div className="flex flex-wrap gap-2.5">
                  <Link
                    href="/owner/login"
                    target="_blank"
                    className="inline-flex items-center gap-2 rounded-control bg-burgundy px-4 py-2 text-sm font-semibold text-cream transition hover:bg-burgundy-deep"
                  >
                    <UserCheck className="h-4 w-4" /> Open Owner Login
                  </Link>
                  <Link
                    href={guestStoreUrl}
                    target="_blank"
                    className="inline-flex items-center gap-2 rounded-control border border-burgundy bg-white px-4 py-2 text-sm font-semibold text-burgundy transition hover:bg-cream"
                  >
                    <Store className="h-4 w-4" /> Open Guest Storefront
                  </Link>
                  <button
                    type="button"
                    onClick={handleCopyStoreLink}
                    className="inline-flex items-center gap-2 rounded-control border border-line bg-card px-4 py-2 text-sm font-medium text-ink transition hover:bg-cream"
                  >
                    {copiedLink ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    {copiedLink ? 'Link Copied!' : 'Copy Storefront Link'}
                  </button>
                  <a
                    href={`/api/store/${effectiveSlug}/qr?target=showroom&size=1200&download=1`}
                    className="inline-flex items-center gap-2 rounded-control border border-line bg-card px-4 py-2 text-sm font-medium text-ink transition hover:bg-cream"
                  >
                    <Download className="h-4 w-4" /> Download Store QR
                  </a>
                  <Link
                    href="/admin/onboarding"
                    className="inline-flex items-center gap-2 rounded-control border border-line bg-card px-4 py-2 text-sm font-medium text-ink transition hover:bg-cream"
                  >
                    <Sparkles className="h-4 w-4" /> Onboard Another Store
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* PRE-ACTIVATION REVIEW SUMMARY */
          <>
            <section className="grid gap-4 rounded-card border border-line bg-card p-6 text-sm">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div>
                  <h2 className="font-display text-xl text-burgundy">Onboarding Review Summary</h2>
                  <p className="text-xs text-ink-muted">Confirm details before completing final provisioning and activation.</p>
                </div>
                <span className="rounded-full bg-gold/20 px-3 py-1 text-xs font-semibold text-burgundy">Ready for Activation</span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-control border border-line bg-cream/40 p-3">
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Store Identity</p>
                  <p className="font-semibold text-ink mt-1">{String(info.name ?? '–')}</p>
                  <p className="text-xs text-ink-muted">Slug: <span className="font-mono">/store/{String(info.slug ?? '–')}</span></p>
                  <p className="text-xs text-ink-muted">Category: {String(info.category ?? '–')}</p>
                </div>

                <div className="rounded-control border border-line bg-cream/40 p-3">
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Owner Account</p>
                  <p className="font-semibold text-ink mt-1">{String(owner.fullName ?? (ownerLinked ? 'Linked Owner' : '–'))}</p>
                  <p className="text-xs text-ink-muted">{String(owner.email ?? '–')}</p>
                  <p className="text-xs text-success font-medium">{ownerLinked ? '✓ Account linked' : 'Will be created'}</p>
                </div>

                <div className="rounded-control border border-line bg-cream/40 p-3">
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Tax & Business</p>
                  <p className="font-medium text-ink mt-1">{String(tax.legalName ?? info.name ?? '–')}</p>
                  <p className="text-xs text-ink-muted">GST: {String(tax.gstin || 'Not registered')}</p>
                  <p className="text-xs text-ink-muted">State: {String(tax.businessState ?? info.state ?? '–')}</p>
                </div>

                <div className="rounded-control border border-line bg-cream/40 p-3">
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Subscription</p>
                  <p className="font-semibold text-ink mt-1">{planName}</p>
                  <p className="text-xs text-ink-muted">Period: {String(subscription.periodStart ?? todayStr)} to {String(subscription.periodEnd ?? nextYearStr)}</p>
                </div>

                <div className="rounded-control border border-line bg-cream/40 p-3">
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Approved Features</p>
                  <p className="font-semibold text-burgundy mt-1">{activeFeaturesCount} of 13 approved</p>
                  <p className="text-xs text-ink-muted">Unapproved features will be completely hidden.</p>
                </div>

                <div className="rounded-control border border-line bg-cream/40 p-3">
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">Store QR Code</p>
                  <p className="font-medium text-success mt-1">✓ Ready for generation</p>
                  <p className="text-xs font-mono text-ink-muted">/store/{effectiveSlug}</p>
                </div>
              </div>
            </section>

            <form action={activateAction} className="grid gap-4 rounded-card border border-line bg-card p-6">
              {issues.length > 0 ? (
                <div className="rounded-control bg-danger/10 p-4">
                  <p className="font-semibold text-sm text-danger mb-2">Requirements missing before store can be activated:</p>
                  <ul className="list-disc pl-5 text-sm text-danger space-y-1">
                    {issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-sm text-ink-muted">
                  <ShieldCheck className="h-5 w-5 text-success shrink-0" />
                  <p>All 8 onboarding requirements are satisfied. Clicking below will finalize store records, activate the storefront, and provision the owner dashboard.</p>
                </div>
              )}
              {message(activateState)}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <Link href={`/admin/onboarding/${onboardingId}?step=7`} className="text-sm font-semibold text-burgundy">
                  &larr; Previous: Store QR
                </Link>
                <button
                  type="submit"
                  disabled={activating || issues.length > 0}
                  className="rounded-control bg-burgundy px-6 py-2.5 text-sm font-semibold text-cream transition hover:bg-burgundy-deep disabled:opacity-50"
                >
                  {activating ? 'Activating Store…' : 'Activate Store'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    );
  }

  // ==========================================
  // STEP 7: UNIQUE STORE QR CODE & PRINTABLE POSTER
  // ==========================================
  if (step === 7) {
    return (
      <form action={formAction} className="grid gap-6 rounded-card border border-line bg-card p-6">
        <div>
          <h2 className="font-display text-xl text-burgundy">Unique Store QR Code</h2>
          <p className="text-sm text-ink-muted mt-1">
            Every store receives its own dedicated showroom QR code pointing directly to its Guest storefront (<span className="font-mono text-ink">/store/{effectiveSlug}</span>).
          </p>
        </div>

        {/* QR Code Preview & Action Toolbar */}
        <div className="grid gap-6 rounded-control border border-line bg-cream/40 p-5 md:grid-cols-[200px_1fr] md:items-center">
          <div className="flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrImageUrl} alt="Showroom QR Code Preview" width={200} height={200} className="h-44 w-44 rounded-control border border-line bg-white p-2 shadow-sm" />
            <span className="text-[11px] font-mono text-ink-muted">Showroom QR Code</span>
          </div>

          <div className="grid gap-3">
            <div>
              <p className="font-semibold text-ink text-base">{String(draft.info?.name ?? 'Store Showroom')}</p>
              <p className="text-sm text-ink-muted break-all">Direct storefront destination: <span className="font-mono text-burgundy">{guestStoreUrl}</span></p>
            </div>

            <div className="flex flex-wrap gap-2.5 pt-1">
              <Link
                href={guestStoreUrl}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-control bg-burgundy px-3.5 py-1.5 text-xs font-semibold text-cream transition hover:bg-burgundy-deep"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Preview Storefront
              </Link>
              <button
                type="button"
                onClick={handleCopyStoreLink}
                className="inline-flex items-center gap-1.5 rounded-control border border-line bg-white px-3.5 py-1.5 text-xs font-medium text-ink transition hover:bg-cream"
              >
                {copiedLink ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedLink ? 'Copied' : 'Copy Link'}
              </button>
              <a
                href={`/api/store/${effectiveSlug}/qr?target=showroom&size=1200&download=1`}
                className="inline-flex items-center gap-1.5 rounded-control border border-line bg-white px-3.5 py-1.5 text-xs font-medium text-ink transition hover:bg-cream"
              >
                <Download className="h-3.5 w-3.5" /> Download PNG
              </a>
            </div>
          </div>
        </div>

        {/* Branded Printable Poster Section */}
        <div className="rounded-control border border-line bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
            <div>
              <h3 className="font-display text-lg text-burgundy">Branded Printable Showroom Poster</h3>
              <p className="text-xs text-ink-muted">Ready to print for entrance displays, cashier counters, and product shelves.</p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-control border border-line bg-cream px-3 py-1.5 text-xs font-semibold text-burgundy hover:bg-cream/70"
            >
              <Printer className="h-3.5 w-3.5" /> Print Poster
            </button>
          </div>

          <div className="mx-auto max-w-sm rounded-card border-2 border-burgundy/30 bg-gradient-to-b from-cream to-white p-6 text-center shadow-md">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gold">Digital Showroom</p>
            <h4 className="font-display text-xl text-burgundy mt-1">{String(draft.info?.name ?? 'Store Name')}</h4>
            <p className="text-xs text-ink-muted mt-1 italic">&ldquo;Your Entire Showroom, in Your Hands.&rdquo;</p>

            <div className="my-4 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrImageUrl} alt="QR Poster Code" width={180} height={180} className="h-40 w-40 rounded-control border border-line bg-white p-2 shadow-inner" />
            </div>

            <p className="text-xs font-semibold text-ink">Scan the QR Code to Explore Our Digital Showroom</p>
            <p className="text-[11px] text-ink-muted mt-0.5">Scan. Explore. Select. Purchase.</p>

            <div className="mt-4 pt-3 border-t border-line text-[10px] text-ink-muted">
              <p className="font-medium text-gold uppercase tracking-wider">Powered by ZENTRO BuildMart</p>
              <p className="tracking-widest font-semibold text-burgundy mt-0.5">Connect. Create. Conquer.</p>
            </div>
          </div>
        </div>

        {message(state)}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <Link href={`/admin/onboarding/${onboardingId}?step=6`} className="text-sm font-semibold text-burgundy">
            &larr; Previous: Feature Configuration
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="rounded-control bg-burgundy px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-burgundy-deep disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save QR and Continue'}
          </button>
        </div>
      </form>
    );
  }

  // ==========================================
  // STEPS 1 TO 6: FORM SECTIONS
  // ==========================================
  return (
    <form action={formAction} className="grid gap-5 rounded-card border border-line bg-card p-6">
      {/* STEP 1: STORE INFORMATION */}
      {step === 1 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Store Name" error={errors.name} hint="The business name displayed throughout the storefront and dashboard.">
            <input
              name="name"
              value={nameVal}
              onChange={(e) => {
                const next = e.target.value;
                setNameVal(next);
                if (!slugTouched) {
                  setSlugVal(slugify(next));
                }
              }}
              className={input}
              required
              placeholder="e.g. Sri Balaji Tiles & Sanitaryware"
            />
          </Field>

          <Field label="Store URL Slug" error={errors.slug} hint="Unique web address: /store/[slug]">
            <input
              name="slug"
              value={slugVal}
              onChange={(e) => {
                setSlugTouched(true);
                setSlugVal(e.target.value.toLowerCase());
              }}
              className={input}
              required
              placeholder="e.g. sri-balaji-tiles"
            />
          </Field>

          <Field label="Business Category" error={errors.category}>
            <select name="category" defaultValue={value(draft, 'info', 'category')} className={input} required>
              <option value="">Choose a business category</option>
              {BUSINESS_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>

          <Field label="Contact Phone" error={errors.phone}>
            <input name="phone" defaultValue={value(draft, 'info', 'phone')} className={input} placeholder="e.g. +91 98765 43210" />
          </Field>

          <Field label="Contact Email" error={errors.email}>
            <input name="email" type="email" defaultValue={value(draft, 'info', 'email')} className={input} placeholder="e.g. store@example.com" />
          </Field>

          <Field label="Brand Accent Colour" error={errors.brandColour}>
            <div className="flex items-center gap-2">
              <input name="brandColour" defaultValue={value(draft, 'info', 'brandColour') || '#6A0D2A'} className={input} />
              <input
                type="color"
                defaultValue={value(draft, 'info', 'brandColour') || '#6A0D2A'}
                onChange={(e) => {
                  const el = document.querySelector('input[name="brandColour"]') as HTMLInputElement;
                  if (el) el.value = e.target.value;
                }}
                className="h-10 w-10 shrink-0 cursor-pointer rounded-control border border-line bg-white p-1"
              />
            </div>
          </Field>

          <Field label="Store Address" error={errors.addressLine}>
            <input name="addressLine" defaultValue={value(draft, 'info', 'addressLine')} className={input} placeholder="Street address or landmark" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="City" error={errors.city}>
              <input name="city" defaultValue={value(draft, 'info', 'city')} className={input} placeholder="City / Town" />
            </Field>
            <Field label="District" error={errors.district}>
              <input name="district" defaultValue={value(draft, 'info', 'district')} className={input} placeholder="District" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="State" error={errors.state}>
              <input name="state" defaultValue={value(draft, 'info', 'state') || 'Tamil Nadu'} className={input} placeholder="State" />
            </Field>
            <Field label="PIN Code" error={errors.pincode}>
              <input name="pincode" defaultValue={value(draft, 'info', 'pincode')} className={input} placeholder="6-digit PIN code" />
            </Field>
          </div>

          <Field label="Business Operating Hours" error={errors.operatingHours} hint="e.g. Mon–Sat: 9:00 AM – 8:30 PM">
            <input name="operatingHours" defaultValue={value(draft, 'info', 'operatingHours') || 'Mon–Sat: 9:00 AM – 8:30 PM'} className={input} />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Store Description" error={errors.description} hint="Displayed on the storefront welcome section and digital catalog.">
              <textarea name="description" rows={3} defaultValue={value(draft, 'info', 'description')} className={input} placeholder="Describe the store's products, specializations, and showroom offerings..." />
            </Field>
          </div>
        </div>
      ) : null}

      {/* STEP 2: OWNER ACCOUNT */}
      {step === 2 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {ownerLinked ? (
            <div className="sm:col-span-2 rounded-control bg-success/10 border border-success/30 p-4 text-sm text-success">
              ✓ An owner account is already linked to this store. You can safely proceed to the next step.
            </div>
          ) : (
            <p className="sm:col-span-2 text-xs text-ink-muted">
              Creates a dedicated, independent store owner login for this showroom. If the email already belongs to an existing user, it will be safely associated without duplicating records.
            </p>
          )}

          <Field label="Owner Full Name" error={errors.fullName}>
            <input name="fullName" defaultValue={value(draft, 'owner', 'fullName')} className={input} disabled={ownerLinked} placeholder="e.g. Ramesh Kumar" required={!ownerLinked} />
          </Field>

          <Field label="Owner Email" error={errors.email}>
            <input name="email" type="email" defaultValue={value(draft, 'owner', 'email')} className={input} disabled={ownerLinked} placeholder="e.g. ramesh@store.com" required={!ownerLinked} />
          </Field>

          <Field label="Mobile Number" error={errors.phone}>
            <input name="phone" defaultValue={value(draft, 'owner', 'phone')} className={input} disabled={ownerLinked} placeholder="e.g. +91 98765 43210" />
          </Field>

          <Field label="Assigned Role" error={errors.role}>
            <select name="role" defaultValue={value(draft, 'owner', 'role') || 'owner'} className={input} disabled={ownerLinked}>
              <option value="owner">Owner (Full Store Authority)</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
            </select>
          </Field>

          {!ownerLinked ? (
            <div className="sm:col-span-2">
              <Field label="Temporary Password" error={errors.password} hint="At least 10 characters. Plaintext is never stored in the database.">
                <input name="password" type="password" autoComplete="new-password" className={input} placeholder="Enter a secure temporary password" required />
              </Field>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* STEP 3: BUSINESS AND TAX */}
      {step === 3 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Registered Legal Business Name" error={errors.legalName}>
            <input name="legalName" defaultValue={value(draft, 'tax', 'legalName') || value(draft, 'info', 'name')} className={input} placeholder="e.g. Sri Balaji Enterprises Pvt Ltd" required />
          </Field>

          <Field label="GSTIN" error={errors.gstin} hint="15-character GST identification number">
            <input name="gstin" defaultValue={value(draft, 'tax', 'gstin')} className={input} placeholder="e.g. 33AAAAA0000A1Z5" />
          </Field>

          <Field label="GST Registration Type" error={errors.gstRegistration}>
            <select name="gstRegistration" defaultValue={value(draft, 'tax', 'gstRegistration') || 'regular'} className={input}>
              <option value="regular">Regular Taxpayer</option>
              <option value="composition">Composition Scheme</option>
              <option value="unregistered">Not Registered for GST</option>
            </select>
          </Field>

          <Field label="Business Registration State" error={errors.businessState}>
            <input name="businessState" defaultValue={value(draft, 'tax', 'businessState') || value(draft, 'info', 'state') || 'Tamil Nadu'} className={input} required />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Official Billing Address" error={errors.billingAddress}>
              <textarea name="billingAddress" rows={2} defaultValue={value(draft, 'tax', 'billingAddress') || value(draft, 'info', 'addressLine')} className={input} placeholder="Registered address for tax invoices and quotations" />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-ink sm:col-span-2">
            <input type="checkbox" name="pricesIncludeGst" defaultChecked={draft.tax?.pricesIncludeGst !== false} className="h-4 w-4 rounded accent-burgundy" />
            Catalogue and listed product prices already include GST
          </label>
        </div>
      ) : null}

      {/* STEP 4: STORE BRANDING */}
      {step === 4 ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Store Logo (Optional)" error={errors.logo} hint="Square or landscape PNG/JPG, up to 5 MB">
            <input name="logo" type="file" accept="image/*" className={input} onChange={(e) => setLogoUrl(e.target.files?.[0] ? URL.createObjectURL(e.target.files[0]) : null)} />
          </Field>

          <Field label="Storefront Banner (Optional)" error={errors.banner} hint="Wide hero banner (1600x500px recommended)">
            <input name="banner" type="file" accept="image/*" className={input} onChange={(e) => setBannerUrl(e.target.files?.[0] ? URL.createObjectURL(e.target.files[0]) : null)} />
          </Field>

          {logoUrl ? (
            <div className="rounded-control border border-line bg-cream/40 p-3">
              <p className="text-xs text-ink-muted mb-2 font-medium">Logo Preview</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Logo preview" className="h-20 w-auto rounded-control object-contain" />
            </div>
          ) : null}

          {bannerUrl ? (
            <div className="rounded-control border border-line bg-cream/40 p-3 sm:col-span-2">
              <p className="text-xs text-ink-muted mb-2 font-medium">Banner Preview</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bannerUrl} alt="Banner preview" className="h-28 w-full rounded-control object-cover" />
            </div>
          ) : null}

          <p className="sm:col-span-2 text-xs text-ink-muted">
            Uploaded branding files will be securely persisted in the store media storage bucket. You can also upload or update logos and banners anytime from the Owner Settings page.
          </p>
        </div>
      ) : null}

      {/* STEP 5: SUBSCRIPTION */}
      {step === 5 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <Field label="Select Subscription Plan" error={errors.planId}>
              <select name="planId" defaultValue={value(draft, 'subscription', 'planId') || plans[0]?.id || ''} className={input} required>
                <option value="">Choose a subscription plan</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.billing_interval} · ₹{(p.price_paise / 100).toLocaleString('en-IN')}
                    {p.max_products ? ` (Up to ${p.max_products} products)` : ' (Unlimited products)'}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Subscription Start Date" error={errors.periodStart}>
            <input name="periodStart" type="date" defaultValue={value(draft, 'subscription', 'periodStart') || todayStr} className={input} required />
          </Field>

          <Field label="Subscription Expiry Date" error={errors.periodEnd}>
            <input name="periodEnd" type="date" defaultValue={value(draft, 'subscription', 'periodEnd') || nextYearStr} className={input} required />
          </Field>

          <p className="sm:col-span-3 text-xs text-ink-muted">
            The subscription plan sets product catalog limits. Specific feature availability is approved in Step 6 (Feature Configuration).
          </p>
        </div>
      ) : null}

      {/* STEP 6: FEATURE CONFIGURATION */}
      {step === 6 ? (
        <div className="grid gap-6">
          <div>
            <h3 className="font-display text-lg text-burgundy">Feature Approval & Store Assignment</h3>
            <p className="text-xs text-ink-muted mt-1">
              Select exactly which features this store and its owner are approved to access. Unselected features are completely hidden across Owner Dashboard and Guest Storefront.
            </p>
          </div>

          {['Commerce & Orders', 'Customer Experience', 'Operations & Stock'].map((cat) => {
            const keysInCat = FEATURE_KEYS.filter((k) => FEATURE_LABELS[k]?.category === cat);
            return (
              <div key={cat} className="rounded-control border border-line bg-cream/40 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-gold mb-3">{cat}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {keysInCat.map((key) => {
                    const info = FEATURE_LABELS[key];
                    const isChecked = draft.features?.[key] !== undefined ? draft.features?.[key] === true : true;
                    return (
                      <label key={key} className="flex items-start gap-3 rounded-control border border-line bg-white p-3 cursor-pointer transition hover:border-burgundy/60">
                        <input
                          type="checkbox"
                          name={key}
                          defaultChecked={isChecked}
                          className="mt-1 h-4 w-4 shrink-0 rounded accent-burgundy"
                        />
                        <div>
                          <p className="text-sm font-semibold text-ink">{info.label}</p>
                          <p className="text-xs text-ink-muted">{info.desc}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {message(state)}
      <StepNav step={step} onboardingId={onboardingId} pending={pending} />
    </form>
  );
}

function StepNav({ step, onboardingId, pending, showSubmit = true }: { step: number; onboardingId: string; pending: boolean; showSubmit?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      {step > 1 ? (
        <Link href={`/admin/onboarding/${onboardingId}?step=${step - 1}`} className="text-sm font-semibold text-burgundy hover:underline">
          &larr; Previous: {STEP_TITLES[step - 2]}
        </Link>
      ) : <span />}
      {showSubmit ? (
        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-burgundy px-6 py-2.5 text-sm font-semibold text-cream transition hover:bg-burgundy-deep disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save draft and continue \u2192'}
        </button>
      ) : null}
    </div>
  );
}
