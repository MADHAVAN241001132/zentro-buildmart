import { Check, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';

const PLANS = [
  {
    code: 'STARTER',
    name: 'Starter Plan',
    price: '₹999',
    interval: '/ month',
    badge: 'Single Showroom',
    highlighted: false,
    description: 'Essential digital showroom presence and in-store QR discovery for emerging retailers.',
    features: [
      'Up to 200 Products Catalogue',
      'Up to 5 Staff Users',
      'Smart QR In-Store Shopping',
      'POS Billing & Receipt Printing',
      'Basic Inventory Tracking',
      'Standard Email & In-App Support',
    ],
  },
  {
    code: 'GROWTH',
    name: 'Growth Plan',
    price: '₹2,499',
    interval: '/ month',
    badge: 'Most Popular',
    highlighted: true,
    description: 'Full-featured digital retail workspace for established showrooms expanding operations.',
    features: [
      'Up to 1,000 Products Catalogue',
      'Up to 15 Staff Users',
      'Smart QR In-Store Shopping',
      'POS Billing & Held Bills',
      'Advanced Inventory & Batches',
      'Sales Reports & Financial Analytics',
      'Formal Customer Quotations',
      'Cash & Online Payment Modes',
      'Priority Support',
    ],
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise Plan',
    price: '₹24,999',
    interval: '/ year',
    badge: 'Multi-Store Network',
    highlighted: false,
    description: 'High-scale multi-branch architecture with unlimited capacity and bespoke module activation.',
    features: [
      'Unlimited Products Catalogue',
      'Unlimited Staff & Owner Accounts',
      'Multi-Store Network Architecture',
      'Multi-Location Central Inventory',
      'Full Analytics & Audit Logging',
      'Quotations, POS & Held Bills',
      'Tile Calculator & Visualizer Modules',
      'Dedicated Account Manager',
    ],
  },
];

export function MarketingPricingSolutions() {
  return (
    <section className="bg-[#FFF4E6] py-24 text-[#3B2529]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A45C]/40 bg-[#FFF4E6] px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#6A0D2A]">
            <Sparkles className="h-3 w-3 text-[#C9A45C]" />
            <span>TRANSPARENT COMMERCIAL PACKAGES</span>
          </div>

          <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#6A0D2A]">
            A Solution That Grows With Your Business.
          </h2>

          <p className="mt-4 text-sm sm:text-base text-[#806C65] leading-relaxed">
            Every showroom operates differently. BuildMart supports configurable features and business solutions based on individual store requirements.
          </p>
        </div>

        {/* 3 Real Subscription Plans */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          {PLANS.map((plan) => (
            <div
              key={plan.code}
              className={`relative flex flex-col justify-between rounded-2xl p-8 transition-all ${
                plan.highlighted
                  ? 'border-2 border-[#C9A45C] bg-[#FFFAF4] shadow-2xl scale-[1.02]'
                  : 'border border-[#E6D5C3] bg-[#FFFAF4] shadow-sm hover:border-[#C9A45C]'
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[#6A0D2A] border border-[#C9A45C] px-3.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#C9A45C]">
                  {plan.badge}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xl font-bold text-[#6A0D2A]">
                    {plan.name}
                  </h3>
                  {!plan.highlighted && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#806C65] bg-[#FFF4E6] px-2 py-0.5 rounded-md border border-[#E6D5C3]">
                      {plan.badge}
                    </span>
                  )}
                </div>

                <p className="mt-2 text-xs text-[#806C65] leading-relaxed min-h-[36px]">
                  {plan.description}
                </p>

                {/* Price */}
                <div className="mt-6 flex items-baseline gap-1 border-y border-[#E6D5C3]/60 py-4">
                  <span className="font-display text-4xl font-bold text-[#6A0D2A]">
                    {plan.price}
                  </span>
                  <span className="text-xs font-semibold text-[#806C65]">
                    {plan.interval}
                  </span>
                </div>

                {/* Features List */}
                <div className="mt-6">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#6A0D2A]">
                    Included Capabilities:
                  </div>
                  <ul className="mt-3 space-y-2.5">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5 text-xs text-[#3B2529]">
                        <Check className="h-4 w-4 text-[#C9A45C] shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Card CTA */}
              <div className="mt-8 pt-5 border-t border-[#E6D5C3]/60">
                <a
                  href="#contact"
                  className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold transition-all ${
                    plan.highlighted
                      ? 'bg-gradient-to-r from-[#C9A45C] to-[#B38D46] text-[#45081C] shadow-md hover:brightness-110'
                      : 'border border-[#6A0D2A] text-[#6A0D2A] hover:bg-[#6A0D2A] hover:text-[#FFF4E6]'
                  }`}
                >
                  <span>Select {plan.name}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* Custom Business Solutions Box */}
        <div className="mt-14 rounded-2xl border border-[#C9A45C]/40 bg-[#FFF4E6] p-8 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="max-w-2xl">
            <h4 className="font-display text-lg font-bold text-[#6A0D2A]">
              Need a Tailored Commercial Deployment?
            </h4>
            <p className="mt-1 text-xs sm:text-sm text-[#806C65]">
              We offer customized solutions based on your business requirements, including custom ERP sync, multi-branch warehousing, white-label storefronts, and specialized hardware integration.
            </p>
          </div>
          <a
            href="#contact"
            className="shrink-0 flex items-center gap-2 rounded-xl bg-[#6A0D2A] px-6 py-3.5 text-xs font-bold text-[#FFF4E6] hover:bg-[#45081C] transition-colors"
          >
            <span>Discuss Your Business Requirements</span>
            <ArrowRight className="h-4 w-4 text-[#C9A45C]" />
          </a>
        </div>

      </div>
    </section>
  );
}
