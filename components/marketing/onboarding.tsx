import { MessageSquare, Sliders, QrCode, Rocket, ArrowRight, Sparkles } from 'lucide-react';

const ONBOARDING_STEPS = [
  {
    step: 'Step 01',
    title: 'Connect With Us',
    description: 'Discuss your business requirements, showroom operations and digital transformation goals with ZENTRO Networks.',
    icon: MessageSquare,
  },
  {
    step: 'Step 02',
    title: 'Configure Your Showroom',
    description: 'Set up your store identity, product categories, catalogue, available modules and relevant business configurations.',
    icon: Sliders,
  },
  {
    step: 'Step 03',
    title: 'Activate Your QR Shopping Experience',
    description: 'Generate your unique store QR code and display it at suitable locations inside your showroom.',
    icon: QrCode,
  },
  {
    step: 'Step 04',
    title: 'Start Your Digital Operations',
    description: 'Allow customers to explore your catalogue while managing business activities through your dedicated Store Owner dashboard.',
    icon: Rocket,
  },
];

export function MarketingOnboarding() {
  return (
    <section className="bg-[#45081C] py-24 text-[#FFF4E6] border-t border-[#C9A45C]/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A45C]/40 bg-[#6A0D2A] px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#C9A45C]">
            <Sparkles className="h-3 w-3" />
            <span>BUSINESS ADOPTION</span>
          </div>

          <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FFF4E6]">
            Your Digital Showroom Journey Starts Here.
          </h2>

          <p className="mt-4 text-sm sm:text-base text-[#FFF4E6]/80 leading-relaxed">
            A guided four-step deployment path to transform your physical showroom into an intelligent digital powerhouse.
          </p>
        </div>

        {/* 4 Steps Grid */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {ONBOARDING_STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.step}
                className="flex flex-col justify-between rounded-xl border border-[#C9A45C]/25 bg-[#6A0D2A]/30 p-6 shadow-md transition-all hover:border-[#C9A45C]/60 hover:bg-[#6A0D2A]/50"
              >
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-[#C9A45C]/20">
                    <span className="font-display text-xs font-bold text-[#C9A45C]">
                      {step.step}
                    </span>
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#45081C] text-[#C9A45C]">
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                  <h3 className="mt-4 font-display text-base font-bold text-[#FFF4E6]">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-xs text-[#FFF4E6]/80 leading-relaxed">
                    {step.description}
                  </p>
                </div>

                <div className="mt-6 pt-3 border-t border-[#C9A45C]/15 flex items-center gap-1 text-[11px] font-semibold text-[#C9A45C]">
                  <span>Ready for Onboarding</span>
                  <ArrowRight className="h-3 w-3" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Closing Statement & CTA */}
        <div className="mt-14 flex flex-col sm:flex-row items-center justify-between gap-6 rounded-2xl bg-[#6A0D2A]/50 border border-[#C9A45C]/30 p-8 shadow-xl">
          <div>
            <p className="font-display text-base sm:text-lg font-bold text-[#FFF4E6]">
              &ldquo;From the first conversation to your first digital order, BuildMart connects your business with smarter possibilities.&rdquo;
            </p>
            <p className="text-xs text-[#FFF4E6]/70 mt-1">
              Connect with our retail solutions architects today.
            </p>
          </div>
          <a
            href="#contact"
            className="shrink-0 flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#C9A45C] to-[#B38D46] px-6 py-3.5 text-xs font-bold text-[#45081C] shadow-lg hover:brightness-110 active:scale-95 transition-all"
          >
            <span>Get BuildMart for My Business</span>
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>

      </div>
    </section>
  );
}
