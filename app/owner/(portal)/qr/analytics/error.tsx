'use client';

export default function QrAnalyticsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid gap-3 rounded-card border border-line bg-card p-6">
      <p className="text-sm text-danger">The QR figures could not be loaded.</p>
      <button type="button" onClick={reset} className="w-fit rounded-control border border-line px-3 py-1 text-sm">Try again</button>
    </div>
  );
}
