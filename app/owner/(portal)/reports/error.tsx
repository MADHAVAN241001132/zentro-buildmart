'use client';

export default function ReportsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid gap-3 rounded-card border border-gold bg-cream p-6">
      <h2 className="font-display text-xl text-burgundy">The report could not be loaded</h2>
      <p className="text-sm">Please try again. If this continues, choose a shorter period.</p>
      <button type="button" onClick={() => reset()} className="w-fit rounded-control bg-burgundy px-4 py-2 text-sm text-cream">Try again</button>
    </div>
  );
}
