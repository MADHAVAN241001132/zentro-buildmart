import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';

export function MarketingFinalCta() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-r from-[#45081C] via-[#6A0D2A] to-[#45081C] py-24 text-[#FFF4E6] border-t border-[#C9A45C]/30">
      
      {/* Decorative glows */}
      <div className="absolute top-1/2 left-10 -translate-y-1/2 h-80 w-80 rounded-full bg-[#C9A45C]/15 blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 right-10 -translate-y-1/2 h-80 w-80 rounded-full bg-[#C9A45C]/15 blur-3xl pointer-events-none" />

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
        
        {/* Brand statement header */}
        <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A45C]/40 bg-[#45081C]/80 px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#C9A45C] shadow-sm">
          <Sparkles className="h-3 w-3" />
          <span>ENTERPRISE RETAIL PLATFORM</span>
        </div>

        {/* Main Heading */}
        <h2 className="mt-6 font-display text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#FFF4E6] leading-[1.15]">
          The Future of Your Showroom Starts Here.
        </h2>

        {/* Description */}
        <p className="mt-6 max-w-2xl mx-auto text-sm sm:text-base text-[#FFF4E6]/85 leading-relaxed">
          Give your customers a smarter way to shop. Give your team better tools to operate. Give your business the digital foundation it needs to grow. Transform your traditional showroom into a connected digital retail experience with ZENTRO BuildMart.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <a
            href="#contact"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#C9A45C] to-[#B38D46] px-8 py-4 text-sm font-bold text-[#45081C] shadow-2xl hover:brightness-110 active:scale-95 transition-all"
          >
            <span>Request Your Business Demo</span>
            <ArrowRight className="h-4 w-4" />
          </a>

          <Link
            href="/store/zentro-buildmart-showroom"
            className="flex items-center gap-2 rounded-xl border border-[#C9A45C]/50 bg-[#45081C]/70 px-8 py-4 text-sm font-semibold text-[#FFF4E6] backdrop-blur-sm hover:bg-[#6A0D2A] hover:border-[#C9A45C] transition-all"
          >
            <Sparkles className="h-4 w-4 text-[#C9A45C]" />
            <span>Explore BuildMart Live</span>
          </Link>
        </div>

        {/* Closing Brand Statement */}
        <div className="mt-14 pt-8 border-t border-[#C9A45C]/20">
          <p className="font-display text-lg font-bold tracking-wide text-[#C9A45C]">
            One Scan. One Platform. A Smarter Retail Experience.
          </p>
          <p className="mt-1 text-xs text-[#FFF4E6]/70 uppercase tracking-widest">
            ZENTRO BuildMart — A Product by ZENTRO Networks.
          </p>
        </div>

      </div>
    </section>
  );
}
