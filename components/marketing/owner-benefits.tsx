import {
  Clock,
  Smile,
  Sliders,
  Boxes,
  HelpCircle,
  Award,
  TrendingUp,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

const BENEFITS = [
  {
    icon: Clock,
    title: 'Reduce Repetitive Manual Work',
    description: 'Give customers independent access to product information and reduce repeated basic enquiries.',
  },
  {
    icon: Smile,
    title: 'Improve Customer Experience',
    description: 'Offer a convenient and organized shopping journey through mobile-friendly product discovery.',
  },
  {
    icon: Sliders,
    title: 'Simplify Business Operations',
    description: 'Bring product information, inventory, orders and billing workflows into one connected workspace.',
  },
  {
    icon: Boxes,
    title: 'Improve Inventory Visibility',
    description: 'Help business owners understand stock availability and maintain organized product records.',
  },
  {
    icon: HelpCircle,
    title: 'Support Better Purchase Decisions',
    description: 'Provide customers with clear information, product comparisons and available pricing.',
  },
  {
    icon: Award,
    title: 'Strengthen Brand Identity',
    description: 'Offer a professionally designed digital storefront that reflects the shop’s identity.',
  },
  {
    icon: TrendingUp,
    title: 'Enable Business Scalability',
    description: 'Support additional stores and growing product catalogues through a multi-store platform architecture.',
  },
  {
    icon: ShieldCheck,
    title: 'Gain Greater Operational Control',
    description: 'Provide owners with centralized tools for monitoring and managing daily retail activities.',
  },
];

export function MarketingOwnerBenefits() {
  return (
    <section className="bg-[#45081C] py-24 text-[#FFF4E6] border-t border-[#C9A45C]/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A45C]/40 bg-[#6A0D2A] px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#C9A45C]">
            <Sparkles className="h-3 w-3" />
            <span>BUSINESS IMPACT</span>
          </div>

          <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FFF4E6]">
            More Than Software. A Smarter Way to Run Your Business.
          </h2>

          <p className="mt-4 text-sm sm:text-base text-[#FFF4E6]/80 leading-relaxed">
            ZENTRO BuildMart empowers showroom leadership with modern tools designed specifically for retail excellence.
          </p>
        </div>

        {/* 8 Benefit Cards */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {BENEFITS.map((ben) => {
            const Icon = ben.icon;
            return (
              <div
                key={ben.title}
                className="flex flex-col rounded-xl border border-[#C9A45C]/25 bg-[#6A0D2A]/30 p-6 shadow-md transition-all hover:border-[#C9A45C]/60 hover:bg-[#6A0D2A]/50"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#45081C] border border-[#C9A45C]/30 text-[#C9A45C]">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-display text-base font-bold text-[#FFF4E6]">
                  {ben.title}
                </h3>
                <p className="mt-2 text-xs text-[#FFF4E6]/80 leading-relaxed">
                  {ben.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Closing statement */}
        <div className="mt-14 text-center">
          <p className="font-display text-base sm:text-lg font-bold italic text-[#C9A45C]">
            &ldquo;Technology should simplify your business, not complicate it.&rdquo;
          </p>
        </div>

      </div>
    </section>
  );
}
