import Link from 'next/link';
import { Check, Sparkles, ArrowRight } from 'lucide-react';
import { formatINR } from '@/lib/money';

export interface PublicSubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  billing_interval: string;
  price_paise: number;
  max_products: number | null;
  products_unlimited: boolean;
  max_users: number | null;
  users_unlimited: boolean;
  features: Record<string, unknown> | null;
}

const FEATURE_LABELS: Record<string, string> = {
  qr: 'Smart QR In-Store Shopping',
  pos: 'POS Billing & Receipt Printing',
  pos_billing: 'POS Billing & Held Bills',
  quotations: 'Formal Customer Quotations & PDF',
  reports: 'Sales Reports & Financial Analytics',
  online_payments: 'Online Payments (Razorpay UPI/Cards)',
  coupons: 'Promotional Coupon Codes',
  delivery: 'Delivery Management',
  credit_ledger: 'Customer Credit Ledger',
  tile_batches: 'Tile Batch & Shade Management',
  purchase_orders: 'Supplier & Purchase Orders',
  bulk_imports: 'Bulk CSV / XLSX Product Import',
  room_visualiser: 'AI Room Visualizer',
  house_project_planner: 'House Project Planner',
  qr_scan_analytics: 'QR Scan Analytics',
  multi_store: 'Multi-Store Network Architecture',
};

function buildPlanCapabilities(plan: PublicSubscriptionPlan): string[] {
  const list: string[] = [
    plan.products_unlimited
      ? 'Unlimited Products Catalogue'
      : `Up to ${plan.max_products ?? 0} Products Catalogue`,
    plan.users_unlimited
      ? 'Unlimited Staff & Owner Accounts'
      : `Up to ${plan.max_users ?? 0} Staff Users`,
  ];

  const feats = plan.features ?? {};
  for (const [key, enabled] of Object.entries(feats)) {
    if (enabled === true) {
      list.push(FEATURE_LABELS[key] ?? key.replace(/_/g, ' '));
    }
  }
  return list;
}

export function MarketingPricingSolutions({ plans }: { plans: PublicSubscriptionPlan[] }) {
  const gridCols =
    plans.length <= 1
      ? 'max-w-md mx-auto grid-cols-1'
      : plans.length === 2
        ? 'max-w-4xl mx-auto grid-cols-1 md:grid-cols-2'
        : plans.length >= 4
          ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4'
          : 'grid-cols-1 md:grid-cols-3';

  return (
    <section id="solutions" className="bg-[#FFF4E6] py-24 text-[#3B2529]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A45C]/40 bg-[#FFF4E6] px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#6A0D2A]">
            <Sparkles className="h-3 w-3 text-[#C9A45C]" />
            <span>TRANSPARENT COMMERCIAL PACKAGES</span>
          </div>

          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-[#6A0D2A] sm:text-4xl lg:text-5xl">
            A Solution That Grows With Your Business.
          </h2>

          <p className="mt-4 text-sm leading-relaxed text-[#806C65] sm:text-base">
            Live commercial plans synchronized directly with ZENTRO BuildMart platform subscriptions.
          </p>
        </div>

        {plans.length === 0 ? (
          <div className="mx-auto mt-12 max-w-xl rounded-2xl border border-[#E6D5C3] bg-[#FFFAF4] p-8 text-center">
            <p className="font-display text-xl text-[#6A0D2A]">Custom Enterprise Packages Available</p>
            <p className="mt-2 text-sm text-[#806C65]">Contact ZENTRO Networks below for tailored showroom pricing.</p>
          </div>
        ) : (
          <div className={`mt-16 grid gap-8 ${gridCols}`}>
            {plans.map((plan) => {
              const capabilities = buildPlanCapabilities(plan);
              const intervalLabel = plan.billing_interval === 'annual' ? '/ year' : '/ month';
              return (
                <div
                  key={plan.id}
                  className="relative flex flex-col justify-between rounded-2xl border border-[#E6D5C3] bg-[#FFFAF4] p-8 shadow-sm transition-all hover:border-[#C9A45C] hover:shadow-md"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-display text-xl font-bold text-[#6A0D2A]">{plan.name}</h3>
                      <span className="rounded-md border border-[#E6D5C3] bg-[#FFF4E6] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#806C65]">
                        {plan.code}
                      </span>
                    </div>

                    <p className="mt-2 min-h-[36px] text-xs leading-relaxed text-[#806C65]">
                      {plan.description || 'Configured digital showroom package with full tenant isolation.'}
                    </p>

                    <div className="mt-6 flex items-baseline gap-1 border-y border-[#E6D5C3]/60 py-4">
                      <span className="font-display text-4xl font-bold text-[#6A0D2A] tabular-nums">
                        {formatINR(plan.price_paise)}
                      </span>
                      <span className="text-xs font-medium text-[#806C65]">{intervalLabel}</span>
                    </div>

                    <ul className="mt-6 space-y-2.5 text-xs text-[#3B2529]">
                      {capabilities.map((cap) => (
                        <li key={cap} className="flex items-start gap-2.5">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#C9A45C]" />
                          <span>{cap}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-8 pt-4">
                    <Link
                      href={`/?plan=${encodeURIComponent(plan.id)}#contact`}
                      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#6A0D2A] px-4 py-3 text-xs font-bold text-[#FFF4E6] shadow-sm transition-colors hover:bg-[#45081C]"
                    >
                      <span>Select {plan.name}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
