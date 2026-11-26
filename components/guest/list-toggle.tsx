'use client';

import { useActionState } from 'react';
import { toggleListAction, type ListState } from '@/app/store/[storeSlug]/lists/actions';
import { useTranslator } from '@/components/i18n/use-translator';

const INITIAL: ListState = { ok: false };

/**
 * Save-to-wishlist or compare button for a product. Each button adds the product; use the list pages to remove.
 * Feedback is shown inline and announced to assistive technology.
 */
export function ListToggle({ storeSlug, productId, kind }: { storeSlug: string; productId: string; kind: 'wishlist' | 'compare' }) {
  const [state, action, pending] = useActionState(toggleListAction, INITIAL);
  const t = useTranslator();
  const label = kind === 'wishlist' ? t('list.wishlistSave') : t('list.compareAdd');
  const intent = `${kind}-add` as const;
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="storeSlug" value={storeSlug} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="intent" value={intent} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-control border border-line px-3 py-2 text-sm font-semibold text-burgundy transition hover:bg-cream disabled:opacity-60"
      >
        {pending ? t('status.saving') : label}
      </button>
      <p role="status" aria-live="polite" className={`min-h-[1rem] text-xs ${state.ok ? 'text-success' : 'text-danger'}`}>
        {state.message ?? ''}
      </p>
    </form>
  );
}
