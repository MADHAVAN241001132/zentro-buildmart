'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { createCouponAction, type CouponState } from './actions';

const INITIAL: CouponState = { ok: false };
const FIELD = 'rounded-control border border-line bg-card px-3 py-2 text-sm';

export function CouponForm() {
  const [state, action, pending] = useActionState(createCouponAction, INITIAL);
  return (
    <form action={action} className="grid gap-4 rounded-card border border-line bg-card p-6 md:grid-cols-3" noValidate>
      <label className="grid gap-1 text-sm">Code<input name="code" maxLength={32} className={`${FIELD} uppercase`} required /></label>
      <label className="grid gap-1 text-sm">
        Discount type
        <select name="discountType" defaultValue="percent" className={FIELD}>
          <option value="percent">Percentage</option>
          <option value="flat">Flat amount</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">Percentage (if percent)<input name="percent" inputMode="decimal" className={FIELD} /></label>
      <label className="grid gap-1 text-sm">Flat amount ₹ (if flat)<input name="flatRupees" inputMode="decimal" className={FIELD} /></label>
      <label className="grid gap-1 text-sm">Minimum order ₹<input name="minOrderRupees" inputMode="decimal" defaultValue="0" className={FIELD} /></label>
      <label className="grid gap-1 text-sm">Max uses (blank = unlimited)<input name="maxUses" inputMode="numeric" className={FIELD} /></label>
      <label className="grid gap-1 text-sm">Ends on (optional)<input type="date" name="endsOn" className={FIELD} /></label>
      <div className="md:col-span-3"><FormMessage ok={state.ok ? true : state.message ? false : null} message={state.message} /></div>
      <div className="md:col-span-3">
        <Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create coupon'}</Button>
      </div>
    </form>
  );
}
