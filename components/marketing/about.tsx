import { Store, ArrowRight, Smartphone, Sparkles, CheckCircle2 } from 'lucide-react';

export function MarketingAbout() {
  return (
    <section id="about" className="bg-[#FFF4E6] py-24 text-[#3B2529]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A45C]/40 bg-[#FFF4E6] px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#6A0D2A]">
            <Sparkles className="h-3 w-3 text-[#C9A45C]" />
            <span>INTRODUCING THE FUTURE OF RETAIL</span>
          </div>

          <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#6A0D2A]">
            Traditional Retail. Intelligent Technology.
          </h2>
        </div>

        {/* Content & Transformation Grid */}
        <div className="mt-14 grid gap-12 lg:grid-cols-12 lg:items-center">
          
          {/* Left: Narrative */}
          <div className="lg:col-span-7 flex flex-col gap-5 text-sm sm:text-base leading-relaxed text-[#3B2529]/85">
            <p>
              The way customers shop is evolving. They expect convenience, transparency, instant access to product information and a smooth purchasing experience.
            </p>
            <p>
              Traditional construction material showrooms often rely on manual product explanations, physical catalogues, repeated price enquiries and time-consuming purchase processes.
            </p>
            <p className="font-semibold text-[#6A0D2A]">
              ZENTRO BuildMart bridges the gap between physical showrooms and modern digital commerce.
            </p>
            <p>
              By combining QR-based product discovery, digital catalogues, smart product comparison, centralized inventory management, streamlined payments and business administration, BuildMart helps retailers deliver a more connected and efficient shopping experience.
            </p>
            <p>
              It is not just another e-commerce website. It is a digital retail ecosystem designed around the real-world needs of construction and home improvement businesses.
            </p>

            {/* Highlighted Quote Box */}
            <div className="mt-2 rounded-xl border-l-4 border-[#C9A45C] bg-[#FFFAF4] p-5 shadow-sm border border-[#E6D5C3]">
              <p className="font-display text-lg font-bold italic text-[#6A0D2A]">
                &ldquo;Your physical showroom. Your digital catalogue. Your complete business — connected.&rdquo;
              </p>
            </div>
          </div>

          {/* Right: Transformation Visual Diagram */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            
            <div className="rounded-2xl border border-[#E6D5C3] bg-[#FFFAF4] p-6 shadow-md">
              <h3 className="font-display text-lg font-bold text-[#6A0D2A] pb-3 border-b border-[#E6D5C3] flex items-center justify-between">
                <span>The Retail Transformation</span>
                <span className="text-xs font-semibold text-[#C9A45C] uppercase tracking-wider">Before & After</span>
              </h3>

              <div className="mt-4 space-y-4">
                {/* Traditional Side */}
                <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-red-800 uppercase tracking-wide">
                    <Store className="h-4 w-4" />
                    <span>Traditional Showroom Bottlenecks</span>
                  </div>
                  <ul className="mt-2.5 space-y-1.5 text-xs text-red-900/80">
                    <li className="flex items-start gap-1.5">
                      <span className="text-red-600 font-bold">•</span>
                      <span>Heavy reliance on sales staff for repetitive price enquiries</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-red-600 font-bold">•</span>
                      <span>Outdated physical binders, printed pamphlets & brochures</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-red-600 font-bold">•</span>
                      <span>Slow manual side-by-side tile and sanitaryware comparison</span>
                    </li>
                  </ul>
                </div>

                <div className="flex justify-center text-[#C9A45C]">
                  <ArrowRight className="h-6 w-6 rotate-90 lg:rotate-0" />
                </div>

                {/* BuildMart Connected Side */}
                <div className="rounded-xl border border-[#C9A45C] bg-[#FFF4E6] p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#6A0D2A] uppercase tracking-wide">
                    <Smartphone className="h-4 w-4 text-[#C9A45C]" />
                    <span>Connected BuildMart Ecosystem</span>
                  </div>
                  <ul className="mt-2.5 space-y-1.5 text-xs text-[#3B2529]">
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#C9A45C] shrink-0 mt-0.5" />
                      <span>Instant self-service QR discovery in customer&apos;s mobile browser</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#C9A45C] shrink-0 mt-0.5" />
                      <span>Always up-to-date digital specs, prices & high-res images</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#C9A45C] shrink-0 mt-0.5" />
                      <span>Connected orders, stock updates, POS billing & admin visibility</span>
                    </li>
                  </ul>
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
