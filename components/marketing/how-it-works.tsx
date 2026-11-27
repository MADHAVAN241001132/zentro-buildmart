import {
  MapPin,
  QrCode,
  Smartphone,
  Scale,
  CreditCard,
  CheckCircle,
  Sparkles,
} from 'lucide-react';

const STEPS = [
  {
    number: '01',
    stepTitle: 'Walk Into the Showroom',
    heading: 'Discover Your Smart Showroom',
    description:
      'Customers visit a physical showroom powered by ZENTRO BuildMart. QR codes are displayed at convenient locations such as store entrances, display areas, product sections and billing counters. The showroom remains physical, but the shopping experience becomes digital.',
    icon: MapPin,
  },
  {
    number: '02',
    stepTitle: 'Scan the QR Code',
    heading: 'One Scan. Instant Access.',
    description:
      'Using their smartphone camera, customers scan the shop’s unique QR code and instantly access its personalized digital storefront. No separate mobile application installation is required. Customers can begin exploring the shop’s catalogue through their mobile browser.',
    icon: QrCode,
  },
  {
    number: '03',
    stepTitle: 'Explore the Digital Catalogue',
    heading: 'Your Entire Showroom, in Their Hands.',
    description:
      'Customers browse high-quality product images, detailed descriptions, available variants, prices, specifications and relevant product availability information. They can explore tiles, sanitaryware, steel doors, faucets, wash basins, kitchen fittings, bathroom accessories and other construction materials. Smart search, category navigation and product filters make discovery faster and easier.',
    icon: Smartphone,
  },
  {
    number: '04',
    stepTitle: 'Compare and Select',
    heading: 'Make Confident Buying Decisions.',
    description:
      'Customers can compare eligible products, review their specifications and select products based on their preferences, requirements and budget. Available project planning tools can help customers organize the materials they need for their homes and construction projects. Selected products can be added to the shopping cart.',
    icon: Scale,
  },
  {
    number: '05',
    stepTitle: 'Complete the Purchase',
    heading: 'Flexible Checkout. Simple Payments.',
    description:
      'Customers review their selected products, quantities and order total before proceeding to checkout. Depending on the store’s enabled payment options, customers can choose online payment or cash payment. For cash payments, the store owner can confirm the payment after receiving the amount directly from the customer.',
    icon: CreditCard,
  },
  {
    number: '06',
    stepTitle: 'Manage and Fulfil',
    heading: 'Every Order. One Connected System.',
    description:
      'The store owner receives the order in the management dashboard, reviews purchase details, confirms applicable payments and manages order fulfilment. The system connects order processing, stock management and invoice generation according to the existing implemented workflows.',
    icon: CheckCircle,
  },
];

export function MarketingHowItWorks() {
  return (
    <section id="how-it-works" className="bg-[#FFF4E6] py-24 text-[#3B2529]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A45C]/40 bg-[#FFF4E6] px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#6A0D2A]">
            <Sparkles className="h-3 w-3 text-[#C9A45C]" />
            <span>FROM SHOWROOM TO SMART SHOPPING</span>
          </div>

          <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#6A0D2A]">
            From a Single Scan to a Seamless Purchase.
          </h2>

          <p className="mt-4 text-sm sm:text-base text-[#806C65] leading-relaxed">
            BuildMart enhances the physical retail experience through a simple, connected shopping journey.
          </p>
        </div>

        {/* 6-Step Visual Timeline */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="group relative flex flex-col justify-between rounded-2xl border border-[#E6D5C3] bg-[#FFFAF4] p-6 shadow-sm transition-all hover:border-[#C9A45C] hover:shadow-hover"
              >
                <div>
                  {/* Step Header */}
                  <div className="flex items-center justify-between border-b border-[#E6D5C3]/70 pb-4">
                    <span className="font-display text-2xl font-bold text-[#C9A45C]">
                      Step {step.number}
                    </span>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#6A0D2A] text-[#FFF4E6] shadow-sm group-hover:scale-105 transition-transform">
                      <Icon className="h-5 w-5 text-[#C9A45C]" />
                    </div>
                  </div>

                  {/* Step Titles */}
                  <div className="mt-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#806C65]">
                      {step.stepTitle}
                    </span>
                    <h3 className="mt-1 font-display text-lg font-bold text-[#6A0D2A]">
                      {step.heading}
                    </h3>
                  </div>

                  {/* Description */}
                  <p className="mt-3 text-xs sm:text-sm text-[#3B2529]/80 leading-relaxed">
                    {step.description}
                  </p>
                </div>

                {/* Micro indicator */}
                <div className="mt-6 flex items-center gap-1.5 pt-3 border-t border-[#E6D5C3]/50 text-[11px] font-semibold text-[#6A0D2A]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#C9A45C]" />
                  <span>Phase {step.number} Verified Flow</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Closing summary bar */}
        <div className="mt-16 rounded-2xl bg-gradient-to-r from-[#6A0D2A] via-[#45081C] to-[#6A0D2A] p-6 text-center text-[#FFF4E6] shadow-xl border border-[#C9A45C]/30">
          <p className="font-display text-lg sm:text-2xl font-bold tracking-wide text-[#C9A45C]">
            Scan. Explore. Compare. Select. Pay. Done.
          </p>
          <p className="mt-1 text-xs sm:text-sm text-[#FFF4E6]/80">
            A frictionless in-store digital workflow that requires zero customer app downloads.
          </p>
        </div>

      </div>
    </section>
  );
}
