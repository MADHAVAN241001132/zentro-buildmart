import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OnboardingStepForm, type PlanOption } from '@/components/admin/onboarding-step-form';
import { STEP_TITLES, activationIssues } from '@/lib/onboarding/rules';
import { activationStateOf, loadOnboarding } from '@/lib/services/onboarding';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function OnboardingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const onb = await loadOnboarding(id);
  if (!onb) notFound();

  // Completed steps can be revisited; later steps cannot be reached before they are unlocked.
  const reachable = onb.status === 'completed' ? 8 : onb.currentStep;
  const requested = Number(sp.step) || reachable;
  const step = Math.min(Math.max(requested, 1), reachable);

  const supabase = await createSupabaseServerClient();
  const { data: planRows } = step === 5 || step === 8
    ? await supabase.from('subscription_plans').select('id, name, billing_interval, price_paise, max_products').eq('is_active', true).order('price_paise')
    : { data: [] as PlanOption[] };

  let issues: string[] = [];
  if (step === 8 && onb.status !== 'completed') {
    issues = activationIssues(await activationStateOf(onb));
  }

  const slug = (onb.stepData.info as { slug?: string } | undefined)?.slug ?? null;
  const ownerLinked = !!onb.ownerProfileId;

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Store onboarding</p>
        <h1 className="font-display text-3xl text-burgundy">
          {(onb.stepData.info as { name?: string } | undefined)?.name ?? 'New store'}
        </h1>
        {onb.status === 'completed' ? <p className="text-sm text-success">Activated</p> : null}
      </header>

      <nav aria-label="Onboarding progress" className="grid gap-2 sm:grid-cols-4">
        {STEP_TITLES.map((title, index) => {
          const number = index + 1;
          const locked = number > reachable;
          const current = number === step;
          const done = number < onb.currentStep || onb.status === 'completed';
          const className = `rounded-control border px-3 py-2 text-sm ${
            current ? 'border-burgundy bg-burgundy text-cream' : done ? 'border-line bg-card text-ink' : 'border-line bg-cream text-ink-muted'
          }`;
          const label = (
            <>
              <span className="block text-xs opacity-80">Step {number}{done && !current ? ' · done' : ''}</span>
              <span className="font-semibold">{title}</span>
            </>
          );
          return locked ? (
            <span key={title} aria-disabled="true" className={className}>{label}</span>
          ) : (
            <Link key={title} href={`/admin/onboarding/${onb.id}?step=${number}`} aria-current={current ? 'step' : undefined} className={className}>
              {label}
            </Link>
          );
        })}
      </nav>

      <OnboardingStepForm
        onboardingId={onb.id}
        step={step}
        draft={onb.stepData as Record<string, Record<string, unknown> | undefined>}
        plans={(planRows ?? []) as PlanOption[]}
        storeSlug={slug}
        issues={issues}
        completed={onb.status === 'completed'}
        ownerLinked={ownerLinked}
      />
    </div>
  );
}
