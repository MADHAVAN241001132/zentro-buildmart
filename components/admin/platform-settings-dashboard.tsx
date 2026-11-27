'use client';

import { useActionState, useState } from 'react';
import { savePlatformSettingAction, type PlatformSettingState } from '@/app/admin/(portal)/settings/actions';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { ZentroLogo } from '@/components/ui/zentro-logo';

const INIT: PlatformSettingState = { ok: false };
const INPUT =
  'w-full min-w-0 rounded-control border border-line bg-white px-3 py-2 text-sm text-ink focus:border-burgundy focus:outline-none focus:ring-2 focus:ring-gold/40';

type SettingsMap = Record<string, Record<string, unknown>>;

function strVal(obj: Record<string, unknown> | undefined, key: string, fallback: string): string {
  const v = obj?.[key];
  return typeof v === 'string' ? v : fallback;
}

function numVal(obj: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const v = obj?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function boolVal(obj: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const v = obj?.[key];
  return typeof v === 'boolean' ? v : fallback;
}

function JsonSectionForm({
  settingKey,
  title,
  description,
  payload,
  children,
}: {
  settingKey: string;
  title: string;
  description: string;
  payload: Record<string, unknown>;
  children: React.ReactNode;
}) {
  const [state, action, pending] = useActionState(savePlatformSettingAction, INIT);
  return (
    <form action={action} className="grid gap-4 rounded-card border border-line bg-card p-5 shadow-rest">
      <div>
        <h2 className="font-display text-xl text-burgundy">{title}</h2>
        <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
      </div>
      <input type="hidden" name="key" value={settingKey} />
      <input type="hidden" name="value" value={JSON.stringify(payload)} />
      {children}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <FormMessage ok={state.ok} message={state.message} />
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? 'Saving…' : `Save ${title}`}
        </Button>
      </div>
    </form>
  );
}

export function PlatformSettingsDashboard({
  initial,
  rawRows,
  advancedSlot,
}: {
  initial: SettingsMap;
  rawRows: { key: string; value: unknown; updated_at: string }[];
  advancedSlot: React.ReactNode;
}) {
  // 1. General
  const g = initial.general;
  const [platformName, setPlatformName] = useState(strVal(g, 'platformDisplayName', 'ZENTRO BuildMart'));
  const [companyName, setCompanyName] = useState(strVal(g, 'companyName', 'ZENTRO Networks'));
  const [tagline, setTagline] = useState(strVal(g, 'tagline', 'Connect. Create. Conquer.'));
  const [defaultLanguage, setDefaultLanguage] = useState(strVal(g, 'defaultLanguage', 'en'));
  const [timezone, setTimezone] = useState(strVal(g, 'timezone', 'Asia/Kolkata'));
  const [maintenanceMode, setMaintenanceMode] = useState(boolVal(g, 'maintenanceMode', false));

  // 3. Landing Page
  const lp = initial.landing_page;
  const [contactEmail, setContactEmail] = useState(strVal(lp, 'contactEmail', 'support@zentronetworks.example'));
  const [contactPhone, setContactPhone] = useState(strVal(lp, 'contactPhone', '+91 98765 43210'));
  const [businessAddress, setBusinessAddress] = useState(strVal(lp, 'businessAddress', 'Chennai, Tamil Nadu, India'));
  const [demoRequestsEnabled, setDemoRequestsEnabled] = useState(boolVal(lp, 'demoRequestsEnabled', true));

  // 4. Store Management
  const sm = initial.store_defaults;
  const [onboardingEnabled, setOnboardingEnabled] = useState(boolVal(sm, 'onboardingEnabled', true));
  const [defaultTrialDays, setDefaultTrialDays] = useState(numVal(sm, 'defaultTrialDays', 14));

  // 5. Billing
  const bl = initial.billing;
  const [expiryReminderDays, setExpiryReminderDays] = useState(numVal(bl, 'expiryReminderDays', 7));
  const [gracePeriodDays, setGracePeriodDays] = useState(numVal(bl, 'gracePeriodDays', 7));

  // 6. Notifications
  const nt = initial.notifications;
  const [notifyDemo, setNotifyDemo] = useState(boolVal(nt, 'notifyDemoRequests', true));
  const [notifyOnboarding, setNotifyOnboarding] = useState(boolVal(nt, 'notifyOnboarding', true));
  const [notifyExpiry, setNotifyExpiry] = useState(boolVal(nt, 'notifyExpiry', true));
  const [notifyPayments, setNotifyPayments] = useState(boolVal(nt, 'notifyPayments', true));
  const [notifySupport, setNotifySupport] = useState(boolVal(nt, 'notifySupport', true));

  // 7. Support
  const sp = initial.support;
  const [supportEmail, setSupportEmail] = useState(strVal(sp, 'supportEmail', 'support@zentronetworks.example'));
  const [supportPhone, setSupportPhone] = useState(strVal(sp, 'supportPhone', '+91 98765 43210'));
  const [businessHours, setBusinessHours] = useState(strVal(sp, 'businessHours', 'Mon–Sat, 9:30 AM – 6:30 PM IST'));

  // 8. Security
  const sc = initial.security;
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(numVal(sc, 'sessionTimeoutMinutes', 480));
  const [requireStrongPasswords, setRequireStrongPasswords] = useState(boolVal(sc, 'requireStrongPasswords', true));

  return (
    <div className="grid min-w-0 gap-6">
      {/* 1. General */}
      <JsonSectionForm
        settingKey="general"
        title="1. General Settings"
        description="Core platform identity, default locale, timezone, and maintenance status."
        payload={{ platformDisplayName: platformName, companyName, tagline, defaultLanguage, timezone, maintenanceMode }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">
            Platform Display Name
            <input value={platformName} onChange={(e) => setPlatformName(e.target.value)} className={INPUT} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Company Name
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={INPUT} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Platform Tagline
            <input value={tagline} onChange={(e) => setTagline(e.target.value)} className={INPUT} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Default Language
            <select value={defaultLanguage} onChange={(e) => setDefaultLanguage(e.target.value)} className={INPUT}>
              <option value="en">English (en-IN)</option>
              <option value="ta">Tamil (ta-IN)</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Timezone
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={INPUT}>
              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
            </select>
          </label>
          <label className="flex items-center gap-2.5 self-end rounded-control border border-line bg-cream/60 px-3 py-2 text-sm">
            <input type="checkbox" checked={maintenanceMode} onChange={(e) => setMaintenanceMode(e.target.checked)} className="h-4 w-4 accent-burgundy" />
            <span>Maintenance mode (Admin portal stays accessible)</span>
          </label>
        </div>
      </JsonSectionForm>

      {/* 2. Branding */}
      <section className="grid gap-4 rounded-card border border-line bg-card p-5 shadow-rest">
        <div>
          <h2 className="font-display text-xl text-burgundy">2. Platform Branding</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Official ZENTRO BuildMart logo, PWA icons, and favicon. Individual stores keep their own custom logos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <ZentroLogo size={64} className="rounded-xl border border-gold/50 shadow-rest" />
          <div className="grid gap-1 text-xs text-ink-muted">
            <p className="font-semibold text-ink">Active Assets</p>
            <p>Logo: <code>/images/zentro-logo.png</code> · PWA Icons: <code>/icons/icon-192.png</code>, <code>/icons/icon-512.png</code> · Favicon: <code>/favicon.ico</code></p>
          </div>
        </div>
      </section>

      {/* 3. Landing Page */}
      <JsonSectionForm
        settingKey="landing_page"
        title="3. Landing Page Settings"
        description="Public contact details and demo request availability."
        payload={{ contactEmail, contactPhone, businessAddress, demoRequestsEnabled }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">
            Public Contact Email
            <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={INPUT} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Public Contact Number
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={INPUT} />
          </label>
          <label className="grid gap-1 text-sm font-medium sm:col-span-2">
            Business Address
            <input value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} className={INPUT} />
          </label>
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={demoRequestsEnabled} onChange={(e) => setDemoRequestsEnabled(e.target.checked)} className="h-4 w-4 accent-burgundy" />
            <span>Accept new demo requests on landing page</span>
          </label>
        </div>
      </JsonSectionForm>

      {/* 4. Store Management & 5. Billing */}
      <div className="grid gap-6 lg:grid-cols-2">
        <JsonSectionForm
          settingKey="store_defaults"
          title="4. Store Management"
          description="Platform-wide defaults for newly onboarded stores (existing stores unaffected)."
          payload={{ onboardingEnabled, defaultTrialDays }}
        >
          <div className="grid gap-4">
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" checked={onboardingEnabled} onChange={(e) => setOnboardingEnabled(e.target.checked)} className="h-4 w-4 accent-burgundy" />
              <span>Enable new store onboarding</span>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Default Migration / Trial Window (days)
              <input type="number" min={0} max={90} value={defaultTrialDays} onChange={(e) => setDefaultTrialDays(Number(e.target.value) || 0)} className={INPUT} />
            </label>
          </div>
        </JsonSectionForm>

        <JsonSectionForm
          settingKey="billing"
          title="5. Billing Policies"
          description="Subscription reminder and grace periods. Currency is fixed to INR (₹)."
          payload={{ expiryReminderDays, gracePeriodDays, currency: 'INR' }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">
              Expiry Reminder (days before)
              <input type="number" min={1} max={30} value={expiryReminderDays} onChange={(e) => setExpiryReminderDays(Number(e.target.value) || 7)} className={INPUT} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Grace Period (days)
              <input type="number" min={0} max={30} value={gracePeriodDays} onChange={(e) => setGracePeriodDays(Number(e.target.value) || 0)} className={INPUT} />
            </label>
          </div>
        </JsonSectionForm>
      </div>

      {/* 6. Notifications & 7. Support */}
      <div className="grid gap-6 lg:grid-cols-2">
        <JsonSectionForm
          settingKey="notifications"
          title="6. Notification Events"
          description="In-app audit/ticket logging events. External email/SMS delivery requires an SMTP/SMS provider configured in environment variables."
          payload={{
            notifyDemoRequests: notifyDemo,
            notifyOnboarding,
            notifyExpiry,
            notifyPayments,
            notifySupport,
          }}
        >
          <div className="grid gap-2.5 text-sm">
            {[
              ['New demo requests', notifyDemo, setNotifyDemo],
              ['New store onboarding', notifyOnboarding, setNotifyOnboarding],
              ['Subscription expiry alerts', notifyExpiry, setNotifyExpiry],
              ['Payment events', notifyPayments, setNotifyPayments],
              ['Support ticket updates', notifySupport, setNotifySupport],
            ].map(([label, checked, setter]) => (
              <label key={label as string} className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={checked as boolean}
                  onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)}
                  className="h-4 w-4 accent-burgundy"
                />
                <span>{label as string}</span>
              </label>
            ))}
          </div>
        </JsonSectionForm>

        <JsonSectionForm
          settingKey="support"
          title="7. Support Settings"
          description="Contact channels and support hours shown to store owners."
          payload={{ supportEmail, supportPhone, businessHours }}
        >
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-medium">
              Support Email
              <input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} className={INPUT} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Support Phone
              <input value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} className={INPUT} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Business Hours
              <input value={businessHours} onChange={(e) => setBusinessHours(e.target.value)} className={INPUT} />
            </label>
          </div>
        </JsonSectionForm>
      </div>

      {/* 8. Security */}
      <JsonSectionForm
        settingKey="security"
        title="8. Security Settings"
        description="Account password policy and session guidance."
        payload={{ sessionTimeoutMinutes, requireStrongPasswords }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">
            Idle Session Policy (minutes)
            <input type="number" min={15} max={1440} value={sessionTimeoutMinutes} onChange={(e) => setSessionTimeoutMinutes(Number(e.target.value) || 480)} className={INPUT} />
          </label>
          <label className="flex items-center gap-2.5 self-end rounded-control border border-line bg-cream/60 px-3 py-2 text-sm">
            <input type="checkbox" checked={requireStrongPasswords} onChange={(e) => setRequireStrongPasswords(e.target.checked)} className="h-4 w-4 accent-burgundy" />
            <span>Enforce strong passwords (8+ chars, mixed case &amp; digits)</span>
          </label>
        </div>
      </JsonSectionForm>

      {/* 9. Advanced Developer Settings */}
      <details className="rounded-card border border-line bg-card p-5 shadow-rest">
        <summary className="cursor-pointer font-display text-lg text-burgundy">
          9. Advanced Developer Settings (Raw JSON Key-Value Store)
        </summary>
        <p className="mt-1 text-xs text-ink-muted">
          Restricted to Super Admins. Secrets such as API keys must remain in server-side environment variables, never here.
        </p>
        <div className="mt-4 grid gap-4">
          {advancedSlot}
          {rawRows.length > 0 ? (
            <ul className="divide-y divide-line rounded-card border border-line bg-cream/40">
              {rawRows.map((r) => (
                <li key={r.key} className="grid gap-1 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-medium text-ink">{r.key}</span>
                    <span className="text-xs text-ink-muted">Updated {new Date(r.updated_at).toLocaleString('en-IN')}</span>
                  </div>
                  <pre className="overflow-x-auto text-xs text-ink-muted">{JSON.stringify(r.value, null, 2)}</pre>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>
    </div>
  );
}
