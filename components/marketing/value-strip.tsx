import { Layers, QrCode, Cpu, TrendingUp } from 'lucide-react';

const VALUES = [
  {
    icon: Layers,
    title: 'One Connected Platform',
    description: 'Manage your digital showroom and retail operations from a centralized platform.',
  },
  {
    icon: QrCode,
    title: 'QR-Powered Shopping',
    description: 'Allow customers to explore your entire product catalogue with a single scan.',
  },
  {
    icon: Cpu,
    title: 'Intelligent Retail Operations',
    description: 'Simplify product, inventory, order and customer management.',
  },
  {
    icon: TrendingUp,
    title: 'Built for Business Growth',
    description: 'Create a modern shopping experience that grows alongside your business.',
  },
];

export function MarketingValueStrip() {
  return (
    <section className="border-y border-[#C9A45C]/20 bg-[#45081C] py-8 text-[#FFF4E6]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="group flex flex-col gap-2.5 rounded-xl border border-[#C9A45C]/15 bg-[#6A0D2A]/30 p-5 transition-all hover:border-[#C9A45C]/40 hover:bg-[#6A0D2A]/60"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#C9A45C]/15 text-[#C9A45C] group-hover:scale-105 transition-transform">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-base font-bold text-[#FFF4E6] tracking-tight">
                  {item.title}
                </h3>
                <p className="text-xs text-[#FFF4E6]/75 leading-relaxed">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
