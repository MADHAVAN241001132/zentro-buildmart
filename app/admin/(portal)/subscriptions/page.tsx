import { PageHeader } from '@/components/owner/page-header';
import { ConfirmSubmit } from '@/components/owner/confirm-submit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatINR } from '@/lib/money';
import { PlanForm, PlanEditForm, AssignForm, RenewForm, AllowanceForm, type EditablePlan } from './forms';
import { revokeAllowanceAction, setPlanActiveAction, setSubscriptionStatusAction } from './actions';
import { ACTIVE_STORE_CONTEXT, daysUntilExpiry, isExpiringSoon, istDate, subscriptionState, usageSummary, type SubscriptionRow, type UsageSummary } from '@/lib/entitlements/rules';

type UsageRow = { store_id: string; products_count: number; users_count: number };

/** Plain-language usage line. Wording matches the database limit rules: at or above the limit is refused. */
function describeUsage(label: string, u: UsageSummary): string {
  if (u.level === 'unlimited') return `${label}: ${u.used} in use, unlimited`;
  if (u.level === 'not_configured') return `${label}: ${u.used} in use, no limit configured`;
  const base = `${label}: ${u.used} of ${u.limit} in use (${u.remaining} left)`;
  if (u.level === 'reached') return `${base}. Limit reached`;
  if (u.level === 'near') return `${base}. Near limit`;
  return base;
}

export const dynamic = 'force-dynamic';

export default async function SubscriptionsPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: plans }, { data: subs }, { data: stores }, { data: allowances }, { data: usageData }] = await Promise.all([
    supabase.from('subscription_plans').select('id, code, name, description, billing_interval, price_paise, max_products, products_unlimited, max_users, users_unlimited, features, is_active').order('name'),
    supabase.from('subscriptions').select('id, store_id, status, period_start, period_end, stores(name), subscription_plans(name, max_products, products_unlimited, max_users, users_unlimited)').order('created_at', { ascending: false }).limit(200),
    supabase.from('stores').select('id, name').order('name'),
    supabase.from('subscription_migration_allowances').select('store_id, expires_on, reason, stores(name)').order('expires_on'),
    supabase.rpc('zb_subscription_usage'),
  ]);
  const today = istDate();
  const usageByStore = new Map<string, UsageRow>();
  for (const row of (usageData ?? []) as UsageRow[]) usageByStore.set(row.store_id, row);

  return (
    <div className="grid gap-8">
      <PageHeader eyebrow="Billing" title="Subscriptions" description="Plans, store assignments, renewals and limits. Product and user limits and premium features are enforced by the database and by the owner actions." />

      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-burgundy">Plans</h2>
        <PlanForm />
        <ul className="divide-y divide-line rounded-card border border-line bg-card">
          {(plans ?? []).map((p) => (
            <li key={p.id as string}>
              <div className="grid gap-2 px-4 py-3 text-sm sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
                <span className="font-medium text-ink">{p.name as string} <span className="text-ink-muted">({p.code as string})</span>{p.is_active ? null : <span className="ml-2 text-xs text-ink-muted">Inactive</span>}</span>
                <span className="text-xs text-ink-muted sm:text-sm">{formatINR(p.price_paise as number)} / {p.billing_interval as string}{p.products_unlimited ? ' · unlimited products' : ` · up to ${p.max_products as number} products`}{p.users_unlimited ? ' · unlimited users' : ` · up to ${p.max_users as number} users`}</span>
                <div className="flex flex-wrap items-center gap-3">
                  <details className="w-full text-sm sm:w-auto">
                    <summary className="cursor-pointer text-burgundy">Edit</summary>
                    <div className="mt-3 rounded-card border border-line bg-cream/40">
                      <PlanEditForm plan={{ id: p.id as string, code: p.code as string, name: p.name as string, description: (p.description as string | null) ?? null, billing_interval: p.billing_interval as string, price_paise: p.price_paise as number, max_products: (p.max_products as number | null) ?? null, products_unlimited: Boolean(p.products_unlimited), max_users: (p.max_users as number | null) ?? null, users_unlimited: Boolean(p.users_unlimited), is_active: Boolean(p.is_active), features: (p.features as Record<string, unknown> | null) ?? null } as EditablePlan} />
                    </div>
                  </details>
                  <form action={setPlanActiveAction}>
                    <input type="hidden" name="id" value={p.id as string} />
                    <input type="hidden" name="active" value={p.is_active ? 'false' : 'true'} />
                    <ConfirmSubmit message={p.is_active ? 'Deactivate this plan for new assignments?' : 'Activate this plan?'}>{p.is_active ? 'Deactivate' : 'Activate'}</ConfirmSubmit>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-burgundy">Assign a plan</h2>
        <AssignForm stores={(stores ?? []).map((s) => ({ id: s.id as string, name: s.name as string }))} plans={(plans ?? []).filter((p) => p.is_active).map((p) => ({ id: p.id as string, name: p.name as string }))} />
      </section>

      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-burgundy">Migration allowances</h2>
        <p className="text-sm text-ink-muted">A time-limited allowance lets a store without a subscription keep trading while a subscription is arranged. It can last at most 90 days and is revocable.</p>
        <AllowanceForm stores={(stores ?? []).map((s) => ({ id: s.id as string, name: s.name as string }))} />
        {!allowances || allowances.length === 0 ? <p className="text-sm text-ink-muted">No allowances in force.</p> : (
          <ul className="divide-y divide-line rounded-card border border-line bg-card">
            {allowances.map((a) => {
              const store = Array.isArray(a.stores) ? a.stores[0] : a.stores;
              return (
                <li key={a.store_id as string} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="text-ink">{(store as { name?: string } | null)?.name ?? '—'}</span>
                  <span className="text-ink-muted">Ends {a.expires_on as string} · {a.reason as string}</span>
                  <form action={revokeAllowanceAction}>
                    <input type="hidden" name="storeId" value={a.store_id as string} />
                    <ConfirmSubmit message="Revoke this allowance? The store will be restricted for new operations.">Revoke</ConfirmSubmit>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="font-display text-2xl text-burgundy">Assignments</h2>
        {!subs || subs.length === 0 ? <p className="text-sm text-ink-muted">No subscriptions assigned yet.</p> : (
          <div className="overflow-x-auto rounded-card border border-line bg-card">
            <table className="min-w-full text-sm">
              <thead className="bg-cream text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr><th className="px-4 py-3">Store</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Usage</th><th className="px-4 py-3">Period</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {subs.map((s) => {
                  const store = Array.isArray(s.stores) ? s.stores[0] : s.stores;
                  const plan = Array.isArray(s.subscription_plans) ? s.subscription_plans[0] : s.subscription_plans;
                  return (
                    <tr key={s.id as string} className="align-top">
                      <td className="px-4 py-3 text-ink">{(store as { name?: string } | null)?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-ink-muted">{(plan as { name?: string } | null)?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-ink-muted">
                        {(() => {
                          const pl = (Array.isArray(s.subscription_plans) ? s.subscription_plans[0] : s.subscription_plans) as { max_products: number | null; products_unlimited: boolean; max_users: number | null; users_unlimited: boolean } | null;
                          const use = usageByStore.get(s.store_id as string);
                          const products = usageSummary(use?.products_count ?? 0, pl?.max_products ?? null, Boolean(pl?.products_unlimited));
                          const users = usageSummary(use?.users_count ?? 0, pl?.max_users ?? null, Boolean(pl?.users_unlimited));
                          return (
                            <div className="grid gap-1">
                              <div>{describeUsage('Products', products)}</div>
                              <div>{describeUsage('Users', users)}</div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{s.period_start as string} → {s.period_end as string}</td>
                      <td className="px-4 py-3 capitalize">
                        <div>{s.status as string}</div>
                        {(() => {
                          const row: SubscriptionRow = { status: s.status as SubscriptionRow['status'], periodStart: s.period_start as string, periodEnd: s.period_end as string, graceEndsOn: null };
                          const state = subscriptionState([row], today, ACTIVE_STORE_CONTEXT);
                          const days = daysUntilExpiry([row], today);
                          const warn = isExpiringSoon([row], today);
                          return (
                            <div className="mt-1 text-xs normal-case text-ink-muted">
                              {state === 'active' ? `Active · ${days ?? 0} days left` : state === 'upcoming' ? 'Upcoming' : 'Expired'}
                              {warn ? <span className="ml-1 font-medium text-burgundy">· Expires soon</span> : null}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="grid gap-2">
                          <RenewForm id={s.id as string} />
                          <form action={setSubscriptionStatusAction} className="flex flex-wrap gap-1">
                            <input type="hidden" name="id" value={s.id as string} />
                            {['active', 'grace', 'expired', 'cancelled'].filter((x) => x !== s.status).map((x) => (
                              <button key={x} name="status" value={x} className="rounded-control border border-line px-2 py-1 text-xs capitalize hover:bg-cream">{x}</button>
                            ))}
                          </form>
                        </div>
                      </td>
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
