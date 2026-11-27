import Link from 'next/link';
import {
  ShieldCheck,
  Store,
  Smartphone,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

const EXPERIENCES = [
  {
    role: 'Experience 01 — Super Admin',
    heading: 'Complete Platform Control',
    description:
      'A centralized administration platform for managing stores, owners, subscription plans, feature availability and platform operations.',
    quote: 'One platform. Multiple businesses. Complete control.',
    icon: ShieldCheck,
    ctaText: 'Admin Login',
    ctaHref: '/admin/login',
    capabilities: [
      'Store onboarding and management',
      'Owner account management',
      'Subscription plan management',
      'Store-specific feature controls',
      'Global feature management',
      'Platform analytics',
      'Administrative monitoring',
      'Audit logs and access control',
    ],
  },
  {
    role: 'Experience 02 — Store Owner',
    heading: 'Your Business. In Your Control.',
    description:
      'A powerful digital workspace that helps showroom owners manage their products, customers, inventory, orders and daily retail operations.',
    quote: 'Manage smarter. Sell better. Grow stronger.',
    icon: Store,
    ctaText: 'Store Owner Login',
    ctaHref: '/owner/login',
    capabilities: [
      'Personalized digital storefront',
      'Product and category management',
      'Inventory and stock management',
      'Order management & cash payment confirmation',
      'POS in-store billing & hold bills',
      'Invoice management & tax receipts',
      'Customer management & credit accounts',
      'Quotations, discounts & promotions',
      'QR code generator & analytics',
      'Business reports & daily sales logs',
    ],
  },
  {
    role: 'Experience 03 — Guest Customer',
    heading: 'Discover. Decide. Purchase.',
    description:
      'A convenient, modern shopping experience designed to help customers explore products independently and make informed purchase decisions.',
    quote: 'Everything your customers need, right at their fingertips.',
    icon: Smartphone,
    ctaText: 'Explore Live Showroom',
    ctaHref: '/store/zentro-buildmart-showroom',
    capabilities: [
      'Instant QR-based store access',
      'High-quality digital product catalogue (80+ items)',
      'Smart product search & specification filters',
      'Side-by-side product comparison',
      'Personal wishlist & shopping cart',
      'Tile calculator & house project planner',
      'Room visualizer tool',
      'Flexible payment options (Cash & Online)',
      'Digital quotation requests',
    ],
  },
];

export function MarketingThreeExperiences() {
  return (
    <section className="bg-[#45081C] py-24 text-[#FFF4E6] border-t border-[#C9A45C]/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A45C]/40 bg-[#6A0D2A] px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#C9A45C]">
            <Sparkles className="h-3 w-3" />
            <span>CONNECTING THE ENTIRE ECOSYSTEM</span>
          </div>

          <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FFF4E6]">
            One Platform. Three Powerful Experiences.
          </h2>

          <p className="mt-4 text-sm sm:text-base text-[#FFF4E6]/80 leading-relaxed">
            ZENTRO BuildMart connects platform administrators, business owners and customers through purpose-built experiences.
          </p>
        </div>

        {/* 3 Experience Cards Grid */}
        <div className="mt-16 grid grid-cols-1 lg:grid-cols-3 gap-8">
          {EXPERIENCES.map((exp) => {
            const Icon = exp.icon;
            return (
              <div
                key={exp.role}
                className="flex flex-col justify-between rounded-2xl border border-[#C9A45C]/25 bg-[#6A0D2A]/30 p-8 shadow-xl backdrop-blur-sm transition-all hover:border-[#C9A45C]/60 hover:bg-[#6A0D2A]/50"
              >
                <div>
                  {/* Top Badge & Icon */}
                  <div className="flex items-center justify-between border-b border-[#C9A45C]/20 pb-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#C9A45C]">
                      {exp.role}
                    </span>
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#45081C] border border-[#C9A45C]/30 text-[#C9A45C] shadow-md">
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>

                  {/* Heading & Description */}
                  <h3 className="mt-5 font-display text-2xl font-bold text-[#FFF4E6]">
                    {exp.heading}
                  </h3>
                  <p className="mt-3 text-xs sm:text-sm text-[#FFF4E6]/80 leading-relaxed">
                    {exp.description}
                  </p>

                  {/* Quote */}
                  <div className="mt-4 rounded-lg bg-[#45081C]/70 p-3 border-l-2 border-[#C9A45C]">
                    <p className="text-xs font-semibold italic text-[#C9A45C]">
                      &ldquo;{exp.quote}&rdquo;
                    </p>
                  </div>

                  {/* Capabilities List */}
                  <div className="mt-6 border-t border-[#C9A45C]/15 pt-5">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#FFF4E6]/60">
                      Implemented Capabilities:
                    </h4>
                    <ul className="mt-3 space-y-2">
                      {exp.capabilities.map((cap) => (
                        <li key={cap} className="flex items-start gap-2 text-xs text-[#FFF4E6]/90">
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#C9A45C] shrink-0 mt-0.5" />
                          <span>{cap}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Bottom CTA */}
                <div className="mt-8 pt-5 border-t border-[#C9A45C]/20">
                  <Link
                    href={exp.ctaHref}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#45081C] border border-[#C9A45C]/50 py-3 text-xs font-bold text-[#FFF4E6] shadow-md hover:bg-[#C9A45C] hover:text-[#45081C] hover:border-[#C9A45C] active:scale-95 transition-all"
                  >
                    <span>{exp.ctaText}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Feature availability note */}
        <p className="mt-10 text-center text-xs text-[#FFF4E6]/60">
          * Feature availability may vary depending on each individual store&apos;s subscription plan and active platform module configuration.
        </p>

      </div>
    </section>
  );
}
