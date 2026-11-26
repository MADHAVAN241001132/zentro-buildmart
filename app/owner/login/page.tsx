import { redirect } from 'next/navigation';
import { getOwnerContext } from '@/lib/services/owner';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function OwnerLoginPage() {
  if (await getOwnerContext()) redirect('/owner/cash');
  return (
    <main className="grid min-h-screen place-items-center bg-cream px-4 py-12">
      <div className="grid w-full max-w-md gap-6 rounded-card border border-line bg-card p-6 shadow-rest sm:p-8">
        <div className="grid gap-2 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-control bg-burgundy font-display text-xl text-gold">Z</span>
          <p className="pt-2 text-xs font-semibold uppercase tracking-[0.25em] text-gold">ZENTRO BuildMart</p>
          <h1 className="font-display text-3xl text-burgundy">Owner sign in</h1>
          <p className="text-sm text-ink-muted">Manage orders, cash and stock for your showroom.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
