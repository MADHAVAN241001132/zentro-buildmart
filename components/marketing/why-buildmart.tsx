import { CheckCircle2, Sparkles } from 'lucide-react';

const DIFFERENTIATORS = [
  'Purpose-built for construction and home improvement retail',
  'QR-powered physical-to-digital shopping',
  'Centralized business management',
  'Independent store-specific storefronts',
  'Configurable feature availability',
  'Role-based access control',
  'Responsive mobile-first customer experience',
  'Professional premium design',
  'Scalable multi-store architecture',
  'Connected product, order and inventory workflows',
];

export function MarketingWhyBuildMart() {
  return (
    <section id="why-buildmart" className="bg-[#45081C] py-24 text-[#FFF4E6] border-t border-[#C9A45C]/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A45C]/40 bg-[#6A0D2A] px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#C9A45C]">
            <Sparkles className="h-3 w-3" />
            <span>THE STRATEGIC ADVANTAGE</span>
          </div>

          <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FFF4E6]">
            Built for Businesses. Designed for People.
          </h2>

          <p className="mt-4 text-sm sm:text-base text-[#FFF4E6]/80 leading-relaxed">
            ZENTRO BuildMart brings together modern technology, practical business functionality and a premium customer experience. Unlike a generic online catalogue, BuildMart is designed to connect the physical retail environment with digital product discovery and business management.
          </p>
        </div>

        {/* 10 Differentiators Grid */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {DIFFERENTIATORS.map((diff, idx) => (
            <div
              key={diff}
              className="flex flex-col justify-between rounded-xl border border-[#C9A45C]/25 bg-[#6A0D2A]/30 p-5 shadow-sm transition-all hover:border-[#C9A45C]/60 hover:bg-[#6A0D2A]/50"
            >
              <div>
                <span className="font-display text-xs font-bold text-[#C9A45C]">
                  0{idx + 1}
                </span>
                <p className="mt-2 text-xs font-semibold text-[#FFF4E6] leading-snug">
                  {diff}
                </p>
              </div>
              <div className="mt-4 flex items-center gap-1.5 text-[10px] font-bold uppercase text-[#C9A45C]">
                <CheckCircle2 className="h-3 w-3" />
                <span>Enterprise Edge</span>
              </div>
            </div>
          ))}
        </div>

        {/* Highlighted Banner */}
        <div className="mt-14 rounded-2xl bg-gradient-to-r from-[#6A0D2A] via-[#45081C] to-[#6A0D2A] p-8 text-center border border-[#C9A45C]/30 shadow-xl">
          <p className="font-display text-xl sm:text-2xl font-bold text-[#C9A45C]">
            &ldquo;We are not simply digitizing products. We are transforming the way showrooms operate.&rdquo;
          </p>
        </div>

      </div>
    </section>
  );
}
