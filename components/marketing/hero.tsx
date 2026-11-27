import Link from 'next/link';
import Image from 'next/image';
import {
  Sparkles,
  ArrowRight,
  QrCode,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  Store,
  Layers,
} from 'lucide-react';

export function MarketingHero() {
  return (
    <section id="home" className="relative overflow-hidden bg-gradient-to-b from-[#45081C] via-[#6A0D2A] to-[#45081C] pt-32 pb-24 text-[#FFF4E6]">
      {/* Decorative background glows */}
      <div className="absolute top-0 left-1/4 h-96 w-96 -translate-x-1/2 rounded-full bg-[#C9A45C]/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-10 h-96 w-96 rounded-full bg-[#C9A45C]/10 blur-3xl pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
          
          {/* Left Column: Messaging & CTAs */}
          <div className="lg:col-span-7 flex flex-col items-start gap-6">
            
            {/* Small premium label */}
            <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A45C]/40 bg-[#45081C]/80 px-4 py-1.5 backdrop-blur-md shadow-sm">
              <span className="h-2 w-2 rounded-full bg-[#C9A45C] animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#C9A45C]">
                A PRODUCT BY ZENTRO NETWORKS
              </span>
            </div>

            {/* Main Heading */}
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.12] tracking-tight text-[#FFF4E6]">
              Transform Your Showroom.{' '}
              <span className="bg-gradient-to-r from-[#C9A45C] via-[#FFF4E6] to-[#C9A45C] bg-clip-text text-transparent">
                Redefine the Shopping Experience.
              </span>
            </h1>

            {/* Supporting Headline */}
            <p className="font-display text-xl sm:text-2xl font-semibold text-[#C9A45C] tracking-wide">
              One Scan. Endless Possibilities.
            </p>

            {/* Descriptions */}
            <div className="grid gap-3 text-sm sm:text-base leading-relaxed text-[#FFF4E6]/85 max-w-2xl">
              <p>
                ZENTRO BuildMart is an intelligent digital retail platform designed exclusively for construction material retailers, tile showrooms, sanitaryware stores, steel door dealers, plumbing suppliers and home improvement businesses.
              </p>
              <p>
                From scanning a QR code to exploring products, comparing specifications, building a cart and completing a purchase, BuildMart brings your entire showroom into your customer&apos;s hands.
              </p>
              <p className="font-medium text-[#FFF4E6]">
                Empower your customers with smarter shopping experiences and your business with centralized digital operations — all within one connected platform.
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link
                href="/store/zentro-buildmart-showroom"
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#C9A45C] to-[#B38D46] px-6 py-3.5 text-sm font-bold text-[#45081C] shadow-xl hover:brightness-110 active:scale-95 transition-all"
              >
                <Sparkles className="h-4 w-4" />
                <span>Explore Live Demo</span>
              </Link>

              <a
                href="#contact"
                className="flex items-center gap-2 rounded-xl border border-[#C9A45C]/50 bg-[#45081C]/60 px-6 py-3.5 text-sm font-semibold text-[#FFF4E6] backdrop-blur-md hover:bg-[#6A0D2A] hover:border-[#C9A45C] active:scale-95 transition-all"
              >
                <span>Request a Business Demo</span>
                <ArrowRight className="h-4 w-4 text-[#C9A45C]" />
              </a>
            </div>

            {/* Supporting statement */}
            <div className="flex items-center gap-2 pt-2 text-xs font-semibold uppercase tracking-wider text-[#C9A45C]/90">
              <CheckCircle2 className="h-4 w-4 text-[#C9A45C]" />
              <span>No complicated shopping. No unnecessary waiting. Just seamless retail.</span>
            </div>

            {/* Key trust strip */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#C9A45C]/20 w-full max-w-lg">
              <div>
                <div className="font-display text-2xl font-bold text-[#C9A45C]">80+</div>
                <div className="text-[11px] text-[#FFF4E6]/70 uppercase tracking-wider">Demo Products Live</div>
              </div>
              <div>
                <div className="font-display text-2xl font-bold text-[#C9A45C]">0s</div>
                <div className="text-[11px] text-[#FFF4E6]/70 uppercase tracking-wider">App Install Required</div>
              </div>
              <div>
                <div className="font-display text-2xl font-bold text-[#C9A45C]">3-in-1</div>
                <div className="text-[11px] text-[#FFF4E6]/70 uppercase tracking-wider">Store, POS & Admin</div>
              </div>
            </div>

          </div>

          {/* Right Column: Premium Visual Composition */}
          <div className="lg:col-span-5 relative">
            
            {/* Showroom visual card */}
            <div className="relative rounded-2xl border border-[#C9A45C]/30 bg-[#45081C]/90 p-3 shadow-2xl backdrop-blur-xl">
              
              {/* Showroom hero image */}
              <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-[#C9A45C]/20">
                <Image
                  src="/images/showroom-hero.webp"
                  alt="ZENTRO BuildMart Luxury Showroom Digital Experience"
                  fill
                  priority
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#45081C] via-transparent to-transparent opacity-80" />
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-[#FFF4E6]">
                  <span className="font-medium bg-[#45081C]/80 px-2.5 py-1 rounded-md backdrop-blur-sm border border-[#C9A45C]/30">
                    Live Showroom Interface
                  </span>
                  <span className="text-[#C9A45C] text-[11px] font-bold">ZENTRO BuildMart</span>
                </div>
              </div>

              {/* Floating QR scan card */}
              <div className="mt-3 grid grid-cols-12 gap-3 items-center rounded-xl border border-[#C9A45C]/25 bg-[#6A0D2A]/80 p-3">
                <div className="col-span-4 relative aspect-square rounded-lg bg-white p-1.5 shadow-md flex items-center justify-center">
                  <Image
                    src="/images/demo-qr.png"
                    alt="Scan to open ZENTRO BuildMart Showroom"
                    width={100}
                    height={100}
                    className="object-contain"
                  />
                </div>
                <div className="col-span-8 flex flex-col justify-center">
                  <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#C9A45C]">
                    <QrCode className="h-3 w-3" />
                    <span>Instant Customer Access</span>
                  </div>
                  <h4 className="text-xs font-bold text-[#FFF4E6] mt-0.5">
                    Scan with Smartphone Camera
                  </h4>
                  <p className="text-[11px] text-[#FFF4E6]/75 mt-0.5 leading-snug">
                    Opens digital showroom catalogue instantly. No app installation needed.
                  </p>
                  <Link
                    href="/store/zentro-buildmart-showroom"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#C9A45C] hover:underline"
                  >
                    <span>Try Storefront Live</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>

              {/* Floating Owner Dashboard Preview Pill */}
              <div className="mt-3 flex items-center justify-between rounded-lg border border-[#C9A45C]/20 bg-[#45081C]/90 px-3.5 py-2.5 text-xs text-[#FFF4E6]">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="font-semibold text-[11px] text-[#C9A45C]">Store Owner Workspace:</span>
                  <span className="text-[11px] text-[#FFF4E6]/80">Orders, POS, Stock & Analytics</span>
                </div>
                <Link href="/owner/login" className="text-[11px] font-bold text-[#C9A45C] hover:underline">
                  Sign In
                </Link>
              </div>

            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
