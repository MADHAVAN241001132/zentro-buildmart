import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireAdmin } from '@/lib/services/admin';
import { adminSignOutAction } from '@/app/admin/login/actions';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/stores', label: 'Stores' },
  { href: '/admin/onboarding', label: 'Onboarding' },
  { href: '/admin/owners', label: 'Owners' },
  { href: '/admin/subscriptions', label: 'Subscriptions' },
  { href: '/admin/payments', label: 'Payments' },
  { href: '/admin/feature-flags', label: 'Feature flags' },
  { href: '/admin/qr', label: 'Platform QR' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/support', label: 'Support' },
  { href: '/admin/audit', label: 'Audit logs' },
  { href: '/admin/roles', label: 'Roles' },
  { href: '/admin/settings', label: 'Settings' },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="min-h-screen bg-cream lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="border-b border-line bg-gradient-to-b from-burgundy to-burgundy-deep px-4 py-4 text-cream lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:px-5 lg:py-6">
        <p className="font-display text-xl">ZENTRO Admin</p>
        <p className="mt-1 truncate text-xs text-cream/70">{admin.email}</p>
        <nav className="mt-4 flex flex-wrap gap-1 lg:mt-8 lg:grid lg:gap-1" aria-label="Admin navigation">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-control px-3 py-2 text-sm transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form action={adminSignOutAction} className="mt-6">
          <button type="submit" className="rounded-control px-3 py-2 text-sm text-cream/80 transition hover:bg-white/10">Sign out</button>
        </form>
      </aside>
      <div className="min-w-0 px-4 py-6 md:px-8 lg:py-8 xl:px-10">{children}</div>
    </div>
  );
}
