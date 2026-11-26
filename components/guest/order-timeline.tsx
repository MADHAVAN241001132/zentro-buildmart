import { AlertTriangle, Check, Circle } from 'lucide-react';

export type TimelineState = 'done' | 'current' | 'pending' | 'attention';

export interface TimelineStep {
  label: string;
  detail?: string;
  state: TimelineState;
}

/**
 * Order progress shown on the guest order page. Each step is derived by the caller from fields the
 * page already loads (payment state and order status); this component only presents them.
 */
export function OrderTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <section aria-labelledby="timeline-heading" className="grid gap-4 rounded-card border border-line bg-card p-5 shadow-rest sm:p-6">
      <h2 id="timeline-heading" className="font-display text-xl text-burgundy">Progress</h2>
      <ol className="grid gap-0">
        {steps.map((step, index) => {
          const last = index === steps.length - 1;
          return (
            <li key={step.label} aria-current={step.state === 'current' ? 'step' : undefined} className="relative flex gap-4 pb-6 last:pb-0">
              {!last ? (
                <span aria-hidden="true" className={`absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px ${step.state === 'done' ? 'bg-burgundy' : 'bg-line'}`} />
              ) : null}
              <span className="relative z-10 shrink-0">
                <StepMarker state={step.state} />
              </span>
              <span className="grid gap-0.5 pt-1">
                <span className={`font-semibold ${step.state === 'pending' ? 'text-ink-muted' : 'text-ink'}`}>{step.label}</span>
                {step.detail ? <span className="text-sm text-ink-muted">{step.detail}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function StepMarker({ state }: { state: TimelineState }) {
  if (state === 'done') {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-burgundy text-cream">
        <Check className="h-4 w-4" aria-hidden />
      </span>
    );
  }
  if (state === 'attention') {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-danger bg-danger/10 text-danger">
        <AlertTriangle className="h-4 w-4" aria-hidden />
      </span>
    );
  }
  if (state === 'current') {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-gold bg-gold/15">
        <span className="h-2.5 w-2.5 rounded-full bg-burgundy" />
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-cream text-ink-muted">
      <Circle className="h-3 w-3" aria-hidden />
    </span>
  );
}
