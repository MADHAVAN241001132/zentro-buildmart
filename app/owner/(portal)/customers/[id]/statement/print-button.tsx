'use client';

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-control border border-line bg-card px-4 py-2 text-sm hover:bg-cream print:hidden">
      Print or save as PDF
    </button>
  );
}
