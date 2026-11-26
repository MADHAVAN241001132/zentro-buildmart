'use client';

import { useActionState } from 'react';
import { buttonClass } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { requestQuotation } from '../actions';

const field = 'w-full rounded-control border border-line bg-cream/60 px-3 py-2 text-sm';

export function RequestForm({ storeSlug, variantId, quantity, cartCount }: { storeSlug: string; variantId: string | null; quantity: number; cartCount: number }) {
  const [state, action, pending] = useActionState(requestQuotation, { ok: true });
  return (
    <form action={action} className="grid gap-4 rounded-card border border-line bg-white p-5 md:grid-cols-2">
      <input type="hidden" name="storeSlug" value={storeSlug} />
      <input type="hidden" name="source" value={variantId ? 'variant' : 'cart'} />
      {variantId ? (
        <>
          <input type="hidden" name="variantId" value={variantId} />
          <label className="grid gap-1 text-sm">Quantity<input name="quantity" type="number" min={1} defaultValue={quantity} className={field} /></label>
        </>
      ) : (
        <p className="text-sm md:col-span-2">Products: {cartCount} from your cart</p>
      )}
      <label className="grid gap-1 text-sm">Your name<input name="customerName" required className={field} /></label>
      <label className="grid gap-1 text-sm">Mobile<input name="customerMobile" inputMode="tel" required className={field} /></label>
      <label className="grid gap-1 text-sm">Email (optional)<input name="customerEmail" type="email" className={field} /></label>
      <label className="grid gap-1 text-sm">Project name (optional)<input name="projectName" className={field} /></label>
      <label className="grid gap-1 text-sm md:col-span-2">Requirements or notes<textarea name="requirements" rows={3} className={field} /></label>
      <label className="grid gap-1 text-sm md:col-span-2">Delivery address (optional)<textarea name="deliveryAddress" rows={2} className={field} /></label>
      <label className="grid gap-1 text-sm">When do you need it?<input name="deliveryExpectation" className={field} /></label>
      <div className="md:col-span-2">
        <FormMessage ok={state.ok} message={state.message} />
        <button type="submit" disabled={pending || (!variantId && cartCount === 0)} className={buttonClass('primary')}>{pending ? 'Sending...' : 'Send request'}</button>
      </div>
    </form>
  );
}
