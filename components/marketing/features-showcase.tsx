import {
  QrCode,
  BookOpen,
  Search,
  Scale,
  ShoppingCart,
  Boxes,
  ClipboardList,
  Receipt,
  FileSpreadsheet,
  Home,
  Eye,
  BarChart3,
  Sliders,
  ToggleLeft,
  Building2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

const FEATURES = [
  {
    icon: QrCode,
    title: 'Smart QR Shopping',
    description: 'Turn a physical store visit into an interactive digital shopping experience through a unique store QR code.',
  },
  {
    icon: BookOpen,
    title: 'Digital Product Catalogue',
    description: 'Showcase products using high-quality images, descriptions, prices, categories, specifications and variants.',
  },
  {
    icon: Search,
    title: 'Intelligent Product Discovery',
    description: 'Help customers find relevant products through search, filtering and organized category navigation.',
  },
  {
    icon: Scale,
    title: 'Product Comparison',
    description: 'Allow customers to evaluate product specifications and prices before making purchase decisions.',
  },
  {
    icon: ShoppingCart,
    title: 'Shopping Cart and Checkout',
    description: 'Enable customers to organize selected products, review quantities and complete purchases through a streamlined checkout process.',
  },
  {
    icon: Boxes,
    title: 'Centralized Inventory Management',
    description: 'Manage product stock, monitor availability and maintain visibility into inventory records.',
  },
  {
    icon: ClipboardList,
    title: 'Order Management',
    description: 'Track and manage customer orders through a unified Store Owner dashboard.',
  },
  {
    icon: Receipt,
    title: 'POS and Billing',
    description: 'Support eligible in-store billing and order processing through the existing POS system.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Quotation Management',
    description: 'Create and manage quotations for customers requiring detailed material estimates.',
  },
  {
    icon: Home,
    title: 'House Project Planner',
    description: 'Help customers organize product requirements for construction, renovation and home improvement projects.',
  },
  {
    icon: Eye,
    title: 'Room Visualizer',
    description: 'Provide available visualization tools that assist customers in exploring product combinations and interior possibilities.',
  },
  {
    icon: BarChart3,
    title: 'Business Analytics',
    description: 'Understand business activity through centralized reports and dashboard insights.',
  },
  {
    icon: Sliders,
    title: 'Store-Specific Customization',
    description: 'Configure the digital shopping experience based on each store’s identity and enabled features.',
  },
  {
    icon: ToggleLeft,
    title: 'Dynamic Feature Management',
    description: 'Allow the platform administrator to control which optional features are available to individual stores.',
  },
  {
    icon: Building2,
    title: 'Multi-Store Architecture',
    description: 'Support independent storefronts and store-specific business operations within one connected platform.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure Role-Based Access',
    description: 'Provide separate authorized experiences for administrators, business owners and customers.',
  },
];

export function MarketingFeaturesShowcase() {
  return (
    <section id="features" className="bg-[#FFF4E6] py-24 text-[#3B2529]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#C9A45C]/40 bg-[#FFF4E6] px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#6A0D2A]">
            <Sparkles className="h-3 w-3 text-[#C9A45C]" />
            <span>POWERFUL BY DESIGN</span>
          </div>

          <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#6A0D2A]">
            Everything Your Showroom Needs. All in One Place.
          </h2>

          <p className="mt-4 text-sm sm:text-base text-[#806C65] leading-relaxed">
            BuildMart combines essential digital retail capabilities into a connected platform designed for modern construction and home improvement businesses.
          </p>
        </div>

        {/* 16 Features Grid */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.title}
                className="group flex flex-col justify-between rounded-xl border border-[#E6D5C3] bg-[#FFFAF4] p-5 shadow-sm transition-all hover:border-[#C9A45C] hover:shadow-hover"
              >
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#6A0D2A] text-[#C9A45C] shadow-sm group-hover:scale-105 transition-transform">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-display text-base font-bold text-[#6A0D2A] tracking-tight">
                    {feat.title}
                  </h3>
                  <p className="mt-2 text-xs text-[#3B2529]/80 leading-relaxed">
                    {feat.description}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-[#E6D5C3]/40 flex items-center justify-between text-[11px] font-semibold text-[#806C65]">
                  <span>Operational Module</span>
                  <span className="text-[#C9A45C] font-bold">Active</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
