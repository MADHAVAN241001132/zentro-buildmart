'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import {
  Menu,
  X,
  ChevronDown,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Store,
  ExternalLink,
} from 'lucide-react';

const NAV_LINKS = [
  { label: 'Home', href: '#home' },
  { label: 'About Product', href: '#about' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Features', href: '#features' },
  { label: 'Business Solutions', href: '#solutions' },
  { label: 'Why BuildMart', href: '#why-buildmart' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Contact', href: '#contact' },
];

export function MarketingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loginDropdownOpen, setLoginDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setLoginDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#45081C]/95 backdrop-blur-md border-b border-[#C9A45C]/20 shadow-lg py-3'
          : 'bg-[#45081C] border-b border-[#C9A45C]/15 py-4'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand identity */}
        <Link href="#home" className="flex items-center gap-3 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#C9A45C] to-[#8F7035] text-[#45081C] font-display font-bold text-xl shadow-md transition-transform group-hover:scale-105">
            Z
          </div>
          <div className="flex flex-col">
            <span className="font-display text-lg font-bold tracking-tight text-[#FFF4E6] group-hover:text-[#C9A45C] transition-colors">
              ZENTRO BuildMart
            </span>
            <span className="text-[10px] font-semibold tracking-wider uppercase text-[#C9A45C]">
              A Product by ZENTRO Networks
            </span>
          </div>
        </Link>

        {/* Desktop Navigation links */}
        <nav className="hidden xl:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-xs font-medium tracking-wide text-[#FFF4E6]/80 hover:text-[#C9A45C] transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Action Buttons & Login Dropdown */}
        <div className="hidden lg:flex items-center gap-3">
          {/* Login Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setLoginDropdownOpen(!loginDropdownOpen)}
              className="flex items-center gap-1.5 rounded-lg border border-[#C9A45C]/40 bg-[#45081C]/80 px-3 py-2 text-xs font-semibold text-[#FFF4E6] hover:bg-[#6A0D2A] hover:border-[#C9A45C] transition-all"
              aria-expanded={loginDropdownOpen}
            >
              <ShieldCheck className="h-3.5 w-3.5 text-[#C9A45C]" />
              <span>Portal Login</span>
              <ChevronDown className={`h-3 w-3 text-[#C9A45C] transition-transform ${loginDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {loginDropdownOpen && (
              <div className="absolute right-0 mt-2 w-52 rounded-xl border border-[#C9A45C]/30 bg-[#45081C] p-2 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95">
                <Link
                  href="/owner/login"
                  onClick={() => setLoginDropdownOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg p-2.5 text-xs text-[#FFF4E6] hover:bg-[#6A0D2A] hover:text-[#C9A45C] transition-colors"
                >
                  <Store className="h-4 w-4 text-[#C9A45C]" />
                  <div>
                    <div className="font-semibold">Store Owner Login</div>
                    <div className="text-[10px] text-[#FFF4E6]/60">Manage your showroom</div>
                  </div>
                </Link>
                <div className="my-1 border-t border-[#C9A45C]/15" />
                <Link
                  href="/admin/login"
                  onClick={() => setLoginDropdownOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg p-2.5 text-xs text-[#FFF4E6] hover:bg-[#6A0D2A] hover:text-[#C9A45C] transition-colors"
                >
                  <ShieldCheck className="h-4 w-4 text-[#C9A45C]" />
                  <div>
                    <div className="font-semibold">Admin Login</div>
                    <div className="text-[10px] text-[#FFF4E6]/60">Platform administration</div>
                  </div>
                </Link>
              </div>
            )}
          </div>

          {/* Secondary CTA */}
          <a
            href="#contact"
            className="rounded-lg border border-[#C9A45C]/40 px-3.5 py-2 text-xs font-semibold text-[#FFF4E6] hover:bg-[#C9A45C]/15 hover:border-[#C9A45C] transition-all"
          >
            Request a Demo
          </a>

          {/* Primary CTA */}
          <Link
            href="/store/zentro-buildmart-showroom"
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#C9A45C] to-[#B38D46] px-4 py-2 text-xs font-bold text-[#45081C] shadow-md hover:brightness-110 active:scale-95 transition-all"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Explore Live Demo</span>
          </Link>
        </div>

        {/* Mobile menu trigger */}
        <div className="flex xl:hidden items-center gap-2">
          <Link
            href="/store/zentro-buildmart-showroom"
            className="flex items-center gap-1 rounded-md bg-[#C9A45C] px-2.5 py-1.5 text-[11px] font-bold text-[#45081C]"
          >
            <span>Live Demo</span>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-lg p-2 text-[#FFF4E6] hover:bg-[#6A0D2A] transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X className="h-6 w-6 text-[#C9A45C]" /> : <Menu className="h-6 w-6 text-[#C9A45C]" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="xl:hidden border-t border-[#C9A45C]/20 bg-[#45081C] px-6 py-6 shadow-2xl">
          <nav className="flex flex-col gap-3">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-[#FFF4E6] hover:bg-[#6A0D2A] hover:text-[#C9A45C] transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="mt-6 border-t border-[#C9A45C]/20 pt-4 flex flex-col gap-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#C9A45C]">
              Portal Access
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/owner/login"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-[#C9A45C]/30 bg-[#6A0D2A]/50 py-2.5 text-xs font-medium text-[#FFF4E6]"
              >
                <Store className="h-3.5 w-3.5 text-[#C9A45C]" />
                <span>Store Owner</span>
              </Link>
              <Link
                href="/admin/login"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-[#C9A45C]/30 bg-[#6A0D2A]/50 py-2.5 text-xs font-medium text-[#FFF4E6]"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-[#C9A45C]" />
                <span>Admin Login</span>
              </Link>
            </div>

            <div className="mt-2 flex flex-col gap-2">
              <Link
                href="/store/zentro-buildmart-showroom"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#C9A45C] to-[#B38D46] py-3 text-sm font-bold text-[#45081C]"
              >
                <Sparkles className="h-4 w-4" />
                <span>Explore Live Demo Store</span>
              </Link>
              <a
                href="#contact"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center gap-2 rounded-lg border border-[#C9A45C]/50 py-2.5 text-xs font-semibold text-[#FFF4E6] hover:bg-[#6A0D2A]"
              >
                <span>Request a Business Demo</span>
                <ArrowRight className="h-3.5 w-3.5 text-[#C9A45C]" />
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
