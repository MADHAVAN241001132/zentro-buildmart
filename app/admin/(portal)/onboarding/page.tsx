import Link from 'next/link';
import { startOnboardingAction } from './actions';
import { STEP_TITLES } from '@/lib/onboarding/rules';
import { listOnboardings } from '@/lib/services/onboarding';

export const dynamic = 'force-dynamic';

export default async function OnboardingListPage() {
  const rows = await listOnboardings();
  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Stores</p>
          <h1 className="font-display text-3xl text-burgundy">Store onboarding</h1>
          <p className="mt-1 text-sm text-ink-muted">Drafts are saved after every step. Resume any draft from its last completed step.</p>
        </div>
        <form action={startOnboardingAction}>
          <button type="submit" className="rounded-control bg-burgundy px-5 py-2.5 text-sm font-semibold text-cream">
            Start a new store
          </button>
        </form>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-card px-6 py-10 text-center text-ink-muted">No onboarding drafts yet.</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-card p-4">
              <div>
                <p className="font-semibold text-ink">{row.storeName ?? 'Untitled store'}</p>
                <p className="text-sm text-ink-muted">
                  {row.status === 'completed' ? 'Activated' : `Step ${row.currentStep} of 8: ${STEP_TITLES[Math.min(row.currentStep, 8) - 1]}`}
                </p>
              </div>
              <Link href={`/admin/onboarding/${row.id}?step=${row.status === 'completed' ? 8 : row.currentStep}`} className="font-semibold text-burgundy">
                {row.status === 'completed' ? 'View' : 'Resume'}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
