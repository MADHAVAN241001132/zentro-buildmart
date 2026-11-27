import Link from 'next/link';

export function MarketingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-[#C9A45C]/20 bg-[#45081C] text-[#FFF4E6] pt-16 pb-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Main 4-column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-[#C9A45C]/15">
          
          {/* Brand Bio */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <Link href="#home" className="flex items-center gap-3 group">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#C9A45C] to-[#8F7035] text-[#45081C] font-display font-bold text-xl shadow-md">
                Z
              </div>
              <div className="flex flex-col">
                <span className="font-display text-lg font-bold tracking-tight text-[#FFF4E6]">
                  ZENTRO BuildMart
                </span>
                <span className="text-[10px] font-semibold tracking-wider uppercase text-[#C9A45C]">
                  A Product by ZENTRO Networks
                </span>
              </div>
            </Link>

            <p className="mt-2 text-xs text-[#FFF4E6]/75 leading-relaxed max-w-sm">
              Connecting physical showrooms with intelligent digital retail experiences. Purpose-built for tiles, sanitaryware, steel doors, plumbing and construction materials.
            </p>

            <div className="mt-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#C9A45C]">
                Brand Tagline
              </span>
              <p className="font-display text-sm font-bold text-[#FFF4E6] mt-0.5">
                Connect. Create. Conquer.
              </p>
            </div>
          </div>

          {/* Col 1: Product */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#C9A45C]">
              Product
            </h4>
            <ul className="mt-4 space-y-2.5 text-xs text-[#FFF4E6]/80">
              <li>
                <a href="#about" className="hover:text-[#C9A45C] transition-colors">
                  About BuildMart
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-[#C9A45C] transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-[#C9A45C] transition-colors">
                  How It Works
                </a>
              </li>
              <li>
                <Link href="/store/zentro-buildmart-showroom" className="hover:text-[#C9A45C] transition-colors">
                  Live Showroom Demo
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 2: Business Solutions */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#C9A45C]">
              Business Solutions
            </h4>
            <ul className="mt-4 space-y-2.5 text-xs text-[#FFF4E6]/80">
              <li>
                <a href="#solutions" className="hover:text-[#C9A45C] transition-colors">
                  Tile Showrooms
                </a>
              </li>
              <li>
                <a href="#solutions" className="hover:text-[#C9A45C] transition-colors">
                  Sanitaryware Stores
                </a>
              </li>
              <li>
                <a href="#solutions" className="hover:text-[#C9A45C] transition-colors">
                  Steel Door Dealers
                </a>
              </li>
              <li>
                <a href="#solutions" className="hover:text-[#C9A45C] transition-colors">
                  Construction Retailers
                </a>
              </li>
              <li>
                <a href="#solutions" className="hover:text-[#C9A45C] transition-colors">
                  Home Improvement Businesses
                </a>
              </li>
            </ul>
          </div>

          {/* Col 3: Access & Company */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#C9A45C]">
              Portals & Access
            </h4>
            <ul className="mt-4 space-y-2.5 text-xs text-[#FFF4E6]/80">
              <li>
                <Link href="/owner/login" className="hover:text-[#C9A45C] transition-colors">
                  Store Owner Login
                </Link>
              </li>
              <li>
                <Link href="/admin/login" className="hover:text-[#C9A45C] transition-colors">
                  Admin Login
                </Link>
              </li>
              <li>
                <Link href="/store/zentro-buildmart-showroom" className="hover:text-[#C9A45C] transition-colors">
                  Guest Demo Store
                </Link>
              </li>
              <li>
                <a href="#contact" className="hover:text-[#C9A45C] transition-colors">
                  Request a Demo
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-[#C9A45C] transition-colors">
                  FAQ
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-[#FFF4E6]/60">
          <p>
            © {currentYear} ZENTRO Networks. All rights reserved. ZENTRO BuildMart is a product by ZENTRO Networks.
          </p>
          <div className="flex items-center gap-6">
            <span className="font-semibold text-[#C9A45C]">Connect. Create. Conquer.</span>
          </div>
        </div>

      </div>
    </footer>
  );
}
