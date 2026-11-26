'use client';

import { useActionState } from 'react';
import { buttonClass } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { saveQuotation, type QuotationFormState } from './actions';

export interface QuotationFormDefaults {
  quotationId?: string;
  customerName?: string;
  customerMobile?: string;
  customerEmail?: string;
  projectName?: string;
  requirements?: string;
  deliveryAddress?: string;
  deliveryExpectation?: string;
  deliveryRupees?: string;
  validUntil?: string;
  terms?: string;
  lines?: string;
}

const field = 'w-full rounded-control border border-line bg-cream/60 px-3 py-2 text-sm';

export function QuotationForm({ defaults, canPrice }: { defaults: QuotationFormDefaults; canPrice: boolean }) {
  const [state, action, pending] = useActionState<QuotationFormState, FormData>(saveQuotation, { ok: true });
  return (
    <form action={action} className="grid gap-5">
      {defaults.quotationId ? <input type="hidden" name="quotationId" value={defaults.quotationId} /> : null}
      <section className="grid gap-3 rounded-card border border-line bg-white p-5 md:grid-cols-2">
        <h2 className="md:col-span-2 font-display text-xl text-burgundy">Customer and project</h2>
        <label className="grid gap-1 text-sm">Customer name<input name="customerName" required defaultValue={defaults.customerName} className={field} /></label>
        <label className="grid gap-1 text-sm">Mobile<input name="customerMobile" inputMode="tel" defaultValue={defaults.customerMobile} className={field} /></label>
        <label className="grid gap-1 text-sm">Email<input name="customerEmail" type="email" defaultValue={defaults.customerEmail} className={field} /></label>
        <label className="grid gap-1 text-sm">Project<input name="projectName" defaultValue={defaults.projectName} className={field} /></label>
        <label className="grid gap-1 text-sm md:col-span-2">Requirements<textarea name="requirements" rows={2} defaultValue={defaults.requirements} className={field} /></label>
      </section>
      <section className="grid gap-3 rounded-card border border-line bg-white p-5 md:grid-cols-2">
        <h2 className="md:col-span-2 font-display text-xl text-burgundy">Products</h2>
        <label className="grid gap-1 text-sm md:col-span-2">
          One line per product: SKU quantity{canPrice ? ' [unit price] [discount]' : ''}
          <textarea name="lines" rows={8} required defaultValue={defaults.lines} placeholder={canPrice ? 'AMB-V001 4 950 120' : 'AMB-V001 4'} className={`${field} font-mono`} />
        </label>
        {canPrice ? null : <p className="md:col-span-2 text-xs text-ink-muted">Prices and discounts are set by the owner or a manager.</p>}
      </section>
      <section className="grid gap-3 rounded-card border border-line bg-white p-5 md:grid-cols-2">
        <h2 className="md:col-span-2 font-display text-xl text-burgundy">Delivery, validity and terms</h2>
        <label className="grid gap-1 text-sm">Delivery charge (Rs.)<input name="deliveryRupees" inputMode="decimal" disabled={!canPrice} defaultValue={defaults.deliveryRupees} className={field} /></label>
        <label className="grid gap-1 text-sm">Valid until<input name="validUntil" type="date" defaultValue={defaults.validUntil} className={field} /></label>
        <label className="grid gap-1 text-sm">Delivery address<textarea name="deliveryAddress" rows={2} defaultValue={defaults.deliveryAddress} className={field} /></label>
        <label className="grid gap-1 text-sm">Delivery expectation<input name="deliveryExpectation" defaultValue={defaults.deliveryExpectation} className={field} /></label>
        <label className="grid gap-1 text-sm md:col-span-2">Terms (leave blank for the standard terms)<textarea name="terms" rows={3} defaultValue={defaults.terms} className={field} /></label>
      </section>
      <FormMessage ok={state.ok} message={state.message} />
      <div>
        <button type="submit" disabled={pending} className={buttonClass('primary')}>{pending ? 'Saving...' : 'Save draft'}</button>
      </div>
    </form>
  );
}
