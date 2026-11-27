import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ZentroLogo } from '@/components/ui/zentro-logo';
import { AdminLoginForm } from './login-form';

export default function AdminLoginPage() {
  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center gap-6 px-6 py-12">
      <div>
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-control border border-line bg-card px-3.5 py-2 text-sm font-semibold text-burgundy shadow-xs transition hover:border-burgundy hover:bg-cream"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          <span>Back to Home</span>
        </Link>
      </div>
      <div className="grid gap-2 text-center">
        <Link href="/" className="mx-auto grid justify-items-center gap-2 transition hover:opacity-90">
          <ZentroLogo size={48} className="rounded-lg shadow-rest" />
          <p className="pt-1 text-xs font-semibold uppercase tracking-[0.2em] text-gold">ZENTRO Networks</p>
        </Link>
        <h1 className="font-display text-4xl text-burgundy">Platform administration</h1>
        <p className="text-sm text-ink-muted">Restricted to ZENTRO platform administrators.</p>
      </div>
      <AdminLoginForm />
    </main>
  );
}
