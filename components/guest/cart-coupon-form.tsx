'use client';

import { useActionState } from 'react';
import { applyCartCouponAction, type ActionState } from '@/app/store/[storeSlug]/actions';
import { useTranslator } from '@/components/i18n/use-translator';

const INITIAL: ActionState = { ok: false };

/**
 * Coupon entry for the guest cart. The server validates the code against the cart's database quote before saving it.
 * An applied code that later stops working is shown as an error and blocks checkout until it is removed.
 */
export function CartCouponForm({ storeSlug, appliedCode }: { storeSlug: string; appliedCode: string | null }) {
  const action = applyCartCouponAction.bind(null, storeSlug);
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const t = useTranslator();

  return (
    <div className="grid gap-2 border-t border-line pt-4 text-sm">
      <form action={formAction} className="flex gap-2" noValidate>
        <label className="sr-only" htmlFor="coupon-code">{t('coupon.label')}</label>
        <input
          id="coupon-code"
          name="code"
          defaultValue={appliedCode ?? ''}
          maxLength={40}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder={t('coupon.placeholder')}
          className="min-w-0 flex-1 rounded-control border border-line bg-cream px-3 py-2 uppercase"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-control border border-burgundy px-4 py-2 font-semibold text-burgundy disabled:opacity-60"
        >
          {pending ? t('coupon.checking') : t('common.apply')}
        </button>
      </form>
      {appliedCode ? (
        <form action={formAction}>
          <input type="hidden" name="code" value="" />
          <button type="submit" disabled={pending} className="text-xs font-semibold text-burgundy underline disabled:opacity-60">
            {t('coupon.remove', { code: appliedCode })}
          </button>
        </form>
      ) : null}
      {state.message ? (
        <p role={state.ok ? 'status' : 'alert'} className={state.ok ? 'text-success' : 'text-danger'}>
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
