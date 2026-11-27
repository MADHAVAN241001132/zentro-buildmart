import { CheckCircle2, Sparkles, Smartphone, Eye } from 'lucide-react';

const CUSTOMER_BENEFITS = [
  'Instant access through a QR code',
  'No separate mobile application installation required',
  'Convenient product browsing at customer’s own pace',
  'Clear specifications, dimensions and application details',
  'High-quality product images across all categories',
  'Easy category navigation and instant search',
  'Side-by-side product comparison tool',
  'Flexible product selection and personal wishlist',
  'Convenient cart review and streamlined checkout',
  'Available cash or online payment options',
];

export function MarketingCustomerBenefits() {
  return (
    <section className="bg-[#FFF4E6] py-24 text-[#3B2529]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A45C]/40 bg-[#FFF4E6] px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#6A0D2A]">
            <Sparkles className="h-3 w-3 text-[#C9A45C]" />
            <span>CUSTOMER EXPERIENCE</span>
          </div>

          <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#6A0D2A]">
            Shopping Designed Around the Customer.
          </h2>

          <p className="mt-4 text-sm sm:text-base text-[#806C65] leading-relaxed">
            BuildMart gives customers more control over how they discover, evaluate and purchase products.
          </p>
        </div>

        {/* Benefits Grid & Visual */}
        <div className="mt-16 grid gap-10 lg:grid-cols-12 lg:items-center">
          
          {/* Left: 10 Benefits list in 2 columns */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {CUSTOMER_BENEFITS.map((benefit) => (
              <div
                key={benefit}
                className="flex items-start gap-3 rounded-xl border border-[#E6D5C3] bg-[#FFFAF4] p-4 shadow-xs"
              >
                <CheckCircle2 className="h-4 w-4 text-[#C9A45C] shrink-0 mt-0.5" />
                <span className="text-xs sm:text-sm font-medium text-[#3B2529]">
                  {benefit}
                </span>
              </div>
            ))}
          </div>

          {/* Right: Highlight Banner & Visual Quote */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="rounded-2xl border border-[#C9A45C]/40 bg-gradient-to-br from-[#6A0D2A] to-[#45081C] p-8 text-center text-[#FFF4E6] shadow-xl">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#C9A45C]/20 border border-[#C9A45C]/40 text-[#C9A45C] mb-4">
                <Smartphone className="h-7 w-7" />
              </div>
              <h3 className="font-display text-xl sm:text-2xl font-bold text-[#FFF4E6]">
                &ldquo;Less Waiting. More Exploring. Smarter Shopping.&rdquo;
              </h3>
              <p className="mt-3 text-xs sm:text-sm text-[#FFF4E6]/80 leading-relaxed">
                When showroom visitors scan a BuildMart QR code, they immediately browse the complete inventory with high-resolution imagery, exact dimensions, stock availability, and transparent pricing.
              </p>
              <div className="mt-6 pt-4 border-t border-[#C9A45C]/20 flex items-center justify-center gap-4 text-xs font-semibold text-[#C9A45C]">
                <span>✓ Zero Wait Times</span>
                <span>•</span>
                <span>✓ Pure Convenience</span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
