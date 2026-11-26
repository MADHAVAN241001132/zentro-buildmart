'use client';

import { buttonClass } from '@/components/ui/button';

/** Prints the current report. Print styles hide navigation and export buttons. */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={`${buttonClass('secondary')} print:hidden`}>
      Print
    </button>
  );
}
