import { AdminLoginForm } from './login-form';

export default function AdminLoginPage() {
  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center gap-6 px-6 py-12">
      <div className="grid gap-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">ZENTRO Networks</p>
        <h1 className="font-display text-4xl text-burgundy">Platform administration</h1>
        <p className="text-sm text-ink-muted">Restricted to ZENTRO platform administrators.</p>
      </div>
      <AdminLoginForm />
    </main>
  );
}
