'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { SelectField, TextField } from '@/components/owner/field';
import { recordInvoiceAction, recordPaymentAction, type SupplierState } from './actions';

const INITIAL = { ok: false } as SupplierState;

export function InvoiceForm({ supplierId, orders }: { supplierId: string; orders: { id: string; po_number: string }[] }) {
  const [state, action, pending] = useActionState(recordInvoiceAction, INITIAL);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-3 rounded-card border border-line bg-card p-5 md:grid-cols-2" noValidate>
      <input type="hidden" name="supplierId" value={supplierId} />
      <TextField name="invoiceNumber" label="Supplier invoice number" error={e.invoiceNumber} />
      <TextField name="invoiceDate" label="Invoice date" type="date" error={e.invoiceDate} />
      <TextField name="amountRupees" label="Amount (₹)" inputMode="decimal" error={e.amountRupees} />
      <SelectField name="purchaseOrderId" label="Against purchase order (optional)" defaultValue="">
        <option value="">None</option>
        {orders.map((o) => <option key={o.id} value={o.id}>{o.po_number}</option>)}
      </SelectField>
      <FormMessage ok={state.ok} message={state.message} />
      <div className="md:col-span-2"><Button type="submit" disabled={pending} variant="secondary">{pending ? 'Recording…' : 'Record invoice'}</Button></div>
    </form>
  );
}

export function PaymentForm({ supplierId }: { supplierId: string }) {
  const [state, action, pending] = useActionState(recordPaymentAction, INITIAL);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-3 rounded-card border border-line bg-card p-5 md:grid-cols-2" noValidate>
      <input type="hidden" name="supplierId" value={supplierId} />
      <TextField name="amountRupees" label="Amount paid (₹)" inputMode="decimal" error={e.amountRupees} />
      <SelectField name="method" label="Method" defaultValue="bank">
        <option value="bank">Bank transfer</option>
        <option value="cash">Cash</option>
        <option value="upi">UPI</option>
        <option value="cheque">Cheque</option>
      </SelectField>
      <TextField name="reference" label="Reference (optional)" />
      <FormMessage ok={state.ok} message={state.message} />
      <div className="md:col-span-2"><Button type="submit" disabled={pending} variant="secondary">{pending ? 'Recording…' : 'Record payment'}</Button></div>
    </form>
  );
}
