'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, KeyRound, LogOut, Menu, Settings, User, X } from 'lucide-react';
import { ZentroLogo } from '@/components/ui/zentro-logo';

export interface PortalNavGroup {
  heading?: string;
  items: { href: string; label: string }[];
}

export function PortalShell({
  portalTitle,
  portalSubtitle,
  navGroups,
  userName,
  userEmail,
  avatarUrl,
  profileHref,
  settingsHref,
  signOutAction,
  sidebarWidthClass = 'lg:grid-cols-[248px_1fr]',
  children,
}: {
  portalTitle: string;
  portalSubtitle?: string;
  navGroups: PortalNavGroup[];
  userName: string;
  userEmail: string;
  avatarUrl: string | null;
  profileHref: string;
  settingsHref?: string | null;
  signOutAction: () => Promise<void>;
  sidebarWidthClass?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  /** Derive the portal base path so clicking the brand navigates to the dashboard */
  const portalBase = pathname.startsWith('/admin') ? '/admin' : '/owner';

  useEffect(() => {
    setDrawerOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const initials = (userName || userEmail || 'U')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

  const isActive = (href: string) => {
    if (href === '/admin' || href === '/owner') return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const renderAvatar = (sizeCls = 'h-9 w-9') =>
    avatarUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatarUrl} alt={userName || 'Profile'} className={`${sizeCls} shrink-0 rounded-full border border-gold/50 object-cover`} />
    ) : (
      <span className={`${sizeCls} flex shrink-0 items-center justify-center rounded-full border border-gold/50 bg-gold/20 text-xs font-bold text-gold`}>
        {initials}
      </span>
    );

  const renderAccountMenu = (align: 'right' | 'left' = 'right') => (
    <div
      role="menu"
      className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full z-50 mt-2 w-56 rounded-card border border-line bg-card py-1.5 text-sm text-ink shadow-hover`}
    >
      <div className="border-b border-line px-3.5 py-2">
        <p className="truncate font-semibold text-burgundy">{userName || 'Account'}</p>
        <p className="truncate text-xs text-ink-muted">{userEmail}</p>
      </div>
      <Link href={profileHref} role="menuitem" className="flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-cream">
        <User className="h-4 w-4 text-burgundy" />
        <span>My Profile</span>
      </Link>
      {settingsHref ? (
        <Link href={settingsHref} role="menuitem" className="flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-cream">
          <Settings className="h-4 w-4 text-burgundy" />
          <span>Settings</span>
        </Link>
      ) : null}
      <Link href={`${profileHref}#password`} role="menuitem" className="flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-cream">
        <KeyRound className="h-4 w-4 text-burgundy" />
        <span>Change Password</span>
      </Link>
      <form action={signOutAction} className="mt-1 border-t border-line pt-1">
        <button
          type="submit"
          role="menuitem"
          suppressHydrationWarning
          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-danger hover:bg-danger/10"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </form>
    </div>
  );

  const renderNavLinks = (onSelect?: () => void) => (
    <div className="flex flex-col gap-5">
      {navGroups.map((group, idx) => (
        <div key={group.heading ?? idx} className="flex flex-col gap-1">
          {group.heading ? (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold/80">{group.heading}</p>
          ) : null}
          {group.items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onSelect}
                aria-current={active ? 'page' : undefined}
                className={`rounded-control px-3 py-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${
                  active
                    ? 'bg-cream/15 font-semibold text-gold'
                    : 'text-cream/85 hover:bg-white/10 hover:text-cream'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <div className={`min-h-screen overflow-x-clip bg-cream lg:grid ${sidebarWidthClass}`}>
      {/* Desktop Sidebar */}
      <aside className="hidden border-r border-line bg-gradient-to-b from-burgundy-deep to-burgundy text-cream lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-y-auto">
        <Link href={portalBase} onClick={() => router.refresh()} className="flex items-center gap-3 border-b border-cream/15 px-5 py-5 transition-colors hover:bg-white/5">
          <ZentroLogo size={36} className="rounded-lg" />
          <div className="min-w-0">
            <p className="truncate font-display text-lg text-gold">{portalTitle}</p>
            {portalSubtitle ? <p className="truncate text-xs text-cream/75">{portalSubtitle}</p> : null}
          </div>
        </Link>
        <nav aria-label={portalTitle} className="flex-1 overflow-y-auto px-3 py-4">
          {renderNavLinks()}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Compact Top Bar (Mobile hamburger + logo + account menu; Desktop top-right account menu) */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-burgundy-deep px-3 py-2.5 text-cream shadow-xs lg:bg-card lg:px-8 lg:py-3 lg:text-ink">
          <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation menu"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control text-cream hover:bg-white/10"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link href={portalBase} onClick={() => router.refresh()} className="flex min-w-0 items-center gap-2.5">
              <ZentroLogo size={32} className="rounded-md" />
              <div className="min-w-0">
                <p className="break-words font-display text-sm leading-tight text-gold sm:text-base">{portalTitle}</p>
                {portalSubtitle ? <p className="break-words text-[11px] leading-tight text-cream/75">{portalSubtitle}</p> : null}
              </div>
            </Link>
          </div>

          <div className="hidden items-center gap-2 text-xs font-medium text-ink-muted lg:flex">
            <span className="truncate">{portalSubtitle || portalTitle}</span>
          </div>

          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-control px-2 py-1.5 text-left transition hover:bg-white/10 lg:hover:bg-cream"
            >
              {renderAvatar('h-8 w-8')}
              <span className="hidden max-w-[140px] truncate text-sm font-medium sm:inline">{userName || userEmail}</span>
              <ChevronDown className="h-4 w-4 opacity-70" />
            </button>
            {menuOpen ? renderAccountMenu('right') : null}
          </div>
        </header>

        {/* Mobile Collapsible Navigation Drawer */}
        {drawerOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={`${portalTitle} navigation`}>
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
            />
            <div className="relative flex h-full w-72 max-w-[85vw] flex-col bg-gradient-to-b from-burgundy-deep to-burgundy text-cream shadow-2xl">
              <div className="flex items-center justify-between gap-2 border-b border-cream/15 px-4 py-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <ZentroLogo size={32} className="rounded-md" />
                  <div className="min-w-0">
                    <p className="truncate font-display text-base text-gold">{portalTitle}</p>
                    {portalSubtitle ? <p className="truncate text-xs text-cream/75">{portalSubtitle}</p> : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close navigation menu"
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control text-cream hover:bg-white/10"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav aria-label={portalTitle} className="flex-1 overflow-y-auto px-3 py-4">
                {renderNavLinks(() => setDrawerOpen(false))}
              </nav>
            </div>
          </div>
        ) : null}

        <div className="min-w-0 flex-1 px-4 py-5 sm:px-6 md:px-8 lg:py-8 xl:px-10">{children}</div>
      </div>
    </div>
  );
}
