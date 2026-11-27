import Link from 'next/link';
import Image from 'next/image';
import {
  QrCode,
  Smartphone,
  Sparkles,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  Layers,
  Search,
} from 'lucide-react';

export function MarketingQrDemo() {
  return (
    <section className="bg-[#45081C] py-24 text-[#FFF4E6] border-t border-[#C9A45C]/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A45C]/40 bg-[#6A0D2A] px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#C9A45C]">
            <Sparkles className="h-3 w-3" />
            <span>INTERACTIVE DEMONSTRATION</span>
          </div>

          <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FFF4E6]">
            Experience the Future of Shopping.
          </h2>

          <p className="mt-4 text-sm sm:text-base text-[#FFF4E6]/80 leading-relaxed">
            See how your customers can explore an entire showroom through their smartphone.
          </p>
        </div>

        {/* Live Interactive Showcase Grid */}
        <div className="mt-16 grid gap-10 lg:grid-cols-12 lg:items-center">
          
          {/* Left: Working QR Code & Steps */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            
            <div className="rounded-2xl border border-[#C9A45C]/30 bg-[#6A0D2A]/40 p-8 shadow-xl backdrop-blur-md">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#C9A45C]">
                <QrCode className="h-4 w-4" />
                <span>Live Interactive Target</span>
              </div>

              <h3 className="mt-2 font-display text-2xl font-bold text-[#FFF4E6]">
                Scan with Your Phone Camera
              </h3>

              <p className="mt-2 text-xs text-[#FFF4E6]/75">
                Scan this working QR code with your mobile camera to test the live ZENTRO BuildMart showroom on your phone right now.
              </p>

              {/* QR Container */}
              <div className="mt-6 flex flex-col items-center justify-center rounded-xl bg-white p-5 shadow-2xl border-4 border-[#C9A45C]">
                <Image
                  src="/images/demo-qr.png"
                  alt="Live Demo QR Code for ZENTRO BuildMart"
                  width={220}
                  height={220}
                  className="rounded-lg object-contain"
                />
                <span className="mt-3 text-[11px] font-bold text-[#45081C] uppercase tracking-wider text-center">
                  Target: /store/zentro-buildmart-showroom
                </span>
              </div>

              {/* Direct Link button */}
              <div className="mt-6">
                <Link
                  href="/store/zentro-buildmart-showroom"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#C9A45C] to-[#B38D46] py-3.5 text-xs font-bold text-[#45081C] shadow-lg hover:brightness-110 active:scale-95 transition-all"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Open Live Showroom in Browser</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            {/* Highlighted Quote */}
            <div className="rounded-xl border border-[#C9A45C]/30 bg-[#45081C]/90 p-4 text-center">
              <p className="font-display text-base font-bold italic text-[#C9A45C]">
                &ldquo;Your next customer could be one scan away.&rdquo;
              </p>
            </div>

          </div>

          {/* Right: Smartphone Mockup & Catalogue Preview */}
          <div className="lg:col-span-7 flex flex-col items-center">
            
            {/* Phone Frame Mockup */}
            <div className="relative w-full max-w-md rounded-[2.5rem] border-[6px] border-[#3B2529] bg-[#FFFAF4] p-4 shadow-2xl text-[#3B2529]">
              
              {/* Speaker / Notch bar */}
              <div className="mx-auto h-4 w-32 rounded-full bg-[#3B2529]/90 mb-3" />

              {/* Mobile Screen Header */}
              <div className="flex items-center justify-between border-b border-[#E6D5C3] pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-md bg-[#6A0D2A] text-[#C9A45C] flex items-center justify-center font-bold text-xs">
                    Z
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#6A0D2A]">ZENTRO Showroom</div>
                    <div className="text-[9px] text-[#806C65]">Digital Guest Storefront</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-[#FFF4E6] px-2 py-0.5 text-[10px] font-bold text-[#6A0D2A]">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span>Online</span>
                </div>
              </div>

              {/* Categories Pills */}
              <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 text-[10px] font-semibold">
                <span className="rounded-full bg-[#6A0D2A] text-[#FFF4E6] px-2.5 py-1 shrink-0">
                  All (80)
                </span>
                <span className="rounded-full bg-[#FFF4E6] text-[#6A0D2A] border border-[#E6D5C3] px-2.5 py-1 shrink-0">
                  Vitrified Tiles
                </span>
                <span className="rounded-full bg-[#FFF4E6] text-[#6A0D2A] border border-[#E6D5C3] px-2.5 py-1 shrink-0">
                  Steel Doors
                </span>
                <span className="rounded-full bg-[#FFF4E6] text-[#6A0D2A] border border-[#E6D5C3] px-2.5 py-1 shrink-0">
                  Sanitaryware
                </span>
              </div>

              {/* Mockup Product Grid Cards */}
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                
                {/* Product 1 */}
                <div className="rounded-lg border border-[#E6D5C3] bg-white p-2 shadow-xs">
                  <div className="relative aspect-square w-full rounded-md bg-[#FFF4E6] overflow-hidden">
                    <Image
                      src="https://wzfdybjpxrvyufidzdra.supabase.co/storage/v1/object/public/catalogue-images/c36aed15-7b50-446b-abcf-7641b662b91f/products/90b22d11-cc68-40d6-b350-5475a4003f44.webp"
                      alt="Statuario White Marble Vitrified"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="mt-1.5 text-[11px] font-bold text-[#6A0D2A] truncate">
                    Statuario Marble
                  </div>
                  <div className="text-[9px] text-[#806C65]">Vitrified 600x1200</div>
                  <div className="mt-1 flex items-center justify-between text-[11px] font-bold text-[#3B2529]">
                    <span>₹95.00/sq.ft</span>
                    <span className="text-[9px] text-[#C9A45C]">Compare</span>
                  </div>
                </div>

                {/* Product 2 */}
                <div className="rounded-lg border border-[#E6D5C3] bg-white p-2 shadow-xs">
                  <div className="relative aspect-square w-full rounded-md bg-[#FFF4E6] overflow-hidden">
                    <Image
                      src="https://wzfdybjpxrvyufidzdra.supabase.co/storage/v1/object/public/catalogue-images/c36aed15-7b50-446b-abcf-7641b662b91f/products/89499085-6fa4-49a4-9cd3-f049fab3ac13.webp"
                      alt="Wood Grain Entry Door"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="mt-1.5 text-[11px] font-bold text-[#6A0D2A] truncate">
                    Wood Grain Door
                  </div>
                  <div className="text-[9px] text-[#806C65]">Luxury Steel Finish</div>
                  <div className="mt-1 flex items-center justify-between text-[11px] font-bold text-[#3B2529]">
                    <span>₹24,500</span>
                    <span className="text-[9px] text-[#C9A45C]">Compare</span>
                  </div>
                </div>

                {/* Product 3 */}
                <div className="rounded-lg border border-[#E6D5C3] bg-white p-2 shadow-xs">
                  <div className="relative aspect-square w-full rounded-md bg-[#FFF4E6] overflow-hidden">
                    <Image
                      src="https://wzfdybjpxrvyufidzdra.supabase.co/storage/v1/object/public/catalogue-images/c36aed15-7b50-446b-abcf-7641b662b91f/products/242a6d01-c7d8-4dc2-92f2-309360546675.webp"
                      alt="One-piece Toilet Premium"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="mt-1.5 text-[11px] font-bold text-[#6A0D2A] truncate">
                    One-piece Toilet
                  </div>
                  <div className="text-[9px] text-[#806C65]">Dual Flush Ceramic</div>
                  <div className="mt-1 flex items-center justify-between text-[11px] font-bold text-[#3B2529]">
                    <span>₹12,400</span>
                    <span className="text-[9px] text-[#C9A45C]">Compare</span>
                  </div>
                </div>

                {/* Product 4 */}
                <div className="rounded-lg border border-[#E6D5C3] bg-white p-2 shadow-xs">
                  <div className="relative aspect-square w-full rounded-md bg-[#FFF4E6] overflow-hidden">
                    <Image
                      src="https://wzfdybjpxrvyufidzdra.supabase.co/storage/v1/object/public/catalogue-images/c36aed15-7b50-446b-abcf-7641b662b91f/products/6a676012-d5fe-4fba-96c8-2f1b5210a395.webp"
                      alt="ZENTRO Gold-Flex Tile Adhesive 20kg"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="mt-1.5 text-[11px] font-bold text-[#6A0D2A] truncate">
                    Tile Adhesive 20kg
                  </div>
                  <div className="text-[9px] text-[#806C65]">High Bond Strength</div>
                  <div className="mt-1 flex items-center justify-between text-[11px] font-bold text-[#3B2529]">
                    <span>₹850.00</span>
                    <span className="text-[9px] text-[#C9A45C]">Add</span>
                  </div>
                </div>

              </div>

              {/* Bottom Mobile Floating Bar */}
              <div className="mt-3 flex items-center justify-between rounded-lg bg-[#6A0D2A] p-2 text-white">
                <span className="text-[10px] font-medium">Cart: 2 items</span>
                <span className="text-[10px] font-bold text-[#C9A45C]">Review & Pay →</span>
              </div>

            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
