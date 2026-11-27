import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getOwnerContext } from '@/lib/services/owner';
import { ZentroLogo } from '@/components/ui/zentro-logo';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function OwnerLoginPage() {
  if (await getOwnerContext()) redirect('/owner');
  return (
    <main className="grid min-h-screen place-items-center bg-cream px-4 py-12">
      <div className="grid w-full min-w-0 max-w-md gap-5">
        <div>
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-control border border-line bg-card px-3.5 py-2 text-sm font-semibold text-burgundy shadow-xs transition hover:border-burgundy hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            <span>Back to Home</span>
          </Link>
        </div>
        <div className="grid gap-6 rounded-card border border-line bg-card p-5 shadow-rest sm:p-8">
          <div className="grid gap-2 text-center">
            <Link href="/" className="mx-auto grid justify-items-center gap-2 transition hover:opacity-90">
              <ZentroLogo size={48} className="rounded-lg shadow-rest" />
              <p className="pt-2 text-xs font-semibold uppercase tracking-[0.25em] text-gold">ZENTRO BuildMart</p>
            </Link>
            <h1 className="font-display text-3xl text-burgundy">Owner sign in</h1>
            <p className="text-sm text-ink-muted">Manage orders, cash and stock for your showroom.</p>
          </div>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
