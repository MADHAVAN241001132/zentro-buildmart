import {
  Grid,
  Bath,
  DoorClosed,
  Droplet,
  Sparkles,
  CookingPot,
  Wrench,
  Home,
} from 'lucide-react';

const INDUSTRIES = [
  {
    icon: Grid,
    title: 'Tiles and Flooring Showrooms',
    description: 'Showcase ceramic, vitrified, porcelain, marble-look and decorative tiles through organized digital catalogues.',
    sample: 'Vitrified, Ceramic & Mosaic',
  },
  {
    icon: Bath,
    title: 'Sanitaryware Showrooms',
    description: 'Present toilets, wash basins, cisterns, urinals and bathroom fittings with clear product specifications.',
    sample: 'EWC, Basins, Urinals & Cisterns',
  },
  {
    icon: DoorClosed,
    title: 'Steel Door Dealers',
    description: 'Display steel doors, security doors, decorative finishes and available product variants.',
    sample: 'Security, Luxury & Fire-Rated',
  },
  {
    icon: Droplet,
    title: 'Plumbing and Faucet Retailers',
    description: 'Showcase taps, mixers, shower systems and plumbing accessories.',
    sample: 'Pillar Taps, Mixers & Showers',
  },
  {
    icon: Sparkles,
    title: 'Bathroom Accessories Stores',
    description: 'Organize towel rails, holders, shelves, dispensers and other bathroom essentials.',
    sample: 'Hooks, Rails, Dispensers & Mirrors',
  },
  {
    icon: CookingPot,
    title: 'Kitchen Accessories Retailers',
    description: 'Display sinks, faucets, storage solutions and kitchen fittings.',
    sample: 'Sinks, Racks, Carousels & Mixers',
  },
  {
    icon: Wrench,
    title: 'Construction Material Suppliers',
    description: 'Manage adhesives, waterproofing products, installation accessories and construction essentials.',
    sample: 'Adhesives, Sealants & Tools',
  },
  {
    icon: Home,
    title: 'Home Improvement Showrooms',
    description: 'Bring multiple home improvement product categories into one connected shopping experience.',
    sample: 'Integrated Multi-Product Showrooms',
  },
];

export function MarketingIndustries() {
  return (
    <section id="solutions" className="bg-[#FFF4E6] py-24 text-[#3B2529]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A45C]/40 bg-[#FFF4E6] px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#6A0D2A]">
            <Sparkles className="h-3 w-3 text-[#C9A45C]" />
            <span>DESIGNED FOR YOUR BUSINESS</span>
          </div>

          <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#6A0D2A]">
            Built for the Businesses That Build Our World.
          </h2>

          <p className="mt-4 text-sm sm:text-base text-[#806C65] leading-relaxed">
            ZENTRO BuildMart is purpose-built for retailers, dealers and showrooms serving the construction, interior design and home improvement industries.
          </p>
        </div>

        {/* 8 Industry Cards */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {INDUSTRIES.map((ind) => {
            const Icon = ind.icon;
            return (
              <div
                key={ind.title}
                className="group flex flex-col justify-between rounded-xl border border-[#E6D5C3] bg-[#FFFAF4] p-6 shadow-sm transition-all hover:border-[#C9A45C] hover:shadow-hover"
              >
                <div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#6A0D2A] text-[#C9A45C] shadow-sm group-hover:scale-105 transition-transform">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 font-display text-base font-bold text-[#6A0D2A]">
                    {ind.title}
                  </h3>
                  <p className="mt-2 text-xs text-[#3B2529]/80 leading-relaxed">
                    {ind.description}
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-[#E6D5C3]/50">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#C9A45C]">
                    Category Coverage:
                  </span>
                  <p className="text-[11px] font-medium text-[#806C65] mt-0.5">
                    {ind.sample}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Closing Quote */}
        <div className="mt-14 text-center">
          <p className="font-display text-base sm:text-lg font-bold italic text-[#6A0D2A]">
            &ldquo;Different businesses. Different needs. One adaptable retail platform.&rdquo;
          </p>
        </div>

      </div>
    </section>
  );
}
