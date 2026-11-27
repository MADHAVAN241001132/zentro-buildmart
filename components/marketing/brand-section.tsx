import { Sparkles, Network, ArrowRight } from 'lucide-react';

export function MarketingBrandSection() {
  return (
    <section className="bg-[#FFF4E6] py-24 text-[#3B2529]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A45C]/40 bg-[#FFF4E6] px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#6A0D2A]">
            <Sparkles className="h-3 w-3 text-[#C9A45C]" />
            <span>THE TECHNOLOGY BEHIND THE EXPERIENCE</span>
          </div>

          <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#6A0D2A]">
            Innovated by ZENTRO Networks.
          </h2>
        </div>

        {/* Narrative & Visual */}
        <div className="mt-14 mx-auto max-w-4xl rounded-2xl border border-[#E6D5C3] bg-[#FFFAF4] p-8 sm:p-12 shadow-md">
          
          <div className="flex flex-col sm:flex-row items-center gap-6 pb-8 border-b border-[#E6D5C3]">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#6A0D2A] text-[#C9A45C] font-display text-3xl font-bold shadow-md">
              Z
            </div>
            <div>
              <h3 className="font-display text-2xl font-bold text-[#6A0D2A]">
                ZENTRO Networks
              </h3>
              <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A45C]">
                Enterprise Software Solutions & Digital Transformation
              </p>
            </div>
          </div>

          <div className="mt-8 space-y-4 text-sm sm:text-base leading-relaxed text-[#3B2529]/85">
            <p>
              ZENTRO Networks is a technology solutions company focused on transforming real-world business challenges into intelligent digital experiences.
            </p>
            <p>
              Our vision is to connect businesses with practical technology, create meaningful digital solutions and help organizations progress confidently in an increasingly digital world.
            </p>
            <p>
              ZENTRO BuildMart represents our approach to developing industry-focused software that combines innovation, usability and business functionality.
            </p>
            <p>
              We believe technology should create opportunities, simplify operations and deliver meaningful value to the people and businesses using it.
            </p>
          </div>

          {/* Tagline & Supporting Quote Cards */}
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[#C9A45C]/40 bg-[#FFF4E6] p-5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#806C65]">
                Brand Tagline
              </span>
              <p className="mt-1 font-display text-xl font-bold text-[#6A0D2A]">
                Connect. Create. Conquer.
              </p>
            </div>

            <div className="rounded-xl border border-[#C9A45C]/40 bg-[#FFF4E6] p-5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#806C65]">
                Core Purpose
              </span>
              <p className="mt-1 font-display text-sm font-bold text-[#6A0D2A]">
                Connecting Ideas. Creating Solutions. Empowering Businesses.
              </p>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
