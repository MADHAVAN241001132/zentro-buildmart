import type { ReactNode } from 'react';
import { requireAdmin } from '@/lib/services/admin';
import { loadCurrentUserProfile } from '@/lib/services/profile';
import { adminSignOutAction } from '@/app/admin/login/actions';
import { PortalShell } from '@/components/portal/portal-shell';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/stores', label: 'Stores' },
  { href: '/admin/onboarding', label: 'Onboarding' },
  { href: '/admin/owners', label: 'Owners' },
  { href: '/admin/subscriptions', label: 'Subscriptions' },
  { href: '/admin/payments', label: 'Payments' },
  { href: '/admin/feature-flags', label: 'Feature flags' },
  { href: '/admin/ai-visualizer', label: 'AI Visualizer' },
  { href: '/admin/qr', label: 'Platform QR' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/support', label: 'Support' },
  { href: '/admin/audit', label: 'Audit logs' },
  { href: '/admin/roles', label: 'Roles' },
  { href: '/admin/settings', label: 'Settings' },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const [admin, profile] = await Promise.all([requireAdmin(), loadCurrentUserProfile()]);
  return (
    <PortalShell
      portalTitle="ZENTRO Admin"
      portalSubtitle="Platform Administration"
      navGroups={[{ items: NAV }]}
      userName={profile?.fullName || 'Super Admin'}
      userEmail={admin.email ?? profile?.email ?? ''}
      avatarUrl={profile?.avatarUrl ?? null}
      profileHref="/admin/profile"
      settingsHref="/admin/settings"
      signOutAction={adminSignOutAction}
      sidebarWidthClass="lg:grid-cols-[15rem_1fr]"
    >
      {children}
    </PortalShell>
  );
}
