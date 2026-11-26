'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { ConfirmSubmit } from '@/components/owner/confirm-submit';
import { VariantFields } from '../product-form';
import { deleteVariantAction, saveVariantAction, type ProductActionState } from '../actions';

const INITIAL: ProductActionState = { ok: false };

export interface VariantValues {
  id?: string;
  sku: string;
  label: string;
  sizeLabel?: string | null;
  salePrice: string;
  costPrice: string;
  mrp?: string;
  priceUnit: string;
  piecesPerBox: number;
  coverageSqft?: number | null;
  isDefault: boolean;
  isActive: boolean;
}

/** One variant as an editable form. A blank id creates a new variant. */
export function VariantEditor({ productId, variant }: { productId: string; variant?: VariantValues }) {
  const save = saveVariantAction.bind(null, productId);
  const [state, formAction, pending] = useActionState(save, INITIAL);
  const errors = state.fieldErrors ?? {};
  const remove = deleteVariantAction.bind(null, productId, variant?.id ?? '');
  const [deleteState, deleteAction] = useActionState(remove, INITIAL);

  return (
    <div className="grid gap-4 rounded-card border border-line bg-card p-5">
      <form action={formAction} className="grid gap-4" noValidate>
        {variant?.id ? <input type="hidden" name="variantId" value={variant.id} /> : null}
        <h3 className="font-display text-lg text-ink">{variant ? variant.label : 'Add a variant'}</h3>
        <VariantFields
          errors={errors}
          defaults={
            variant
              ? {
                  sku: variant.sku,
                  label: variant.label,
                  sizeLabel: variant.sizeLabel ?? '',
                  salePrice: variant.salePrice,
                  costPrice: variant.costPrice,
                  mrp: variant.mrp ?? '',
                  priceUnit: variant.priceUnit,
                  piecesPerBox: variant.piecesPerBox,
                  coverageSqft: variant.coverageSqft ?? null,
                }
              : undefined
          }
        />
        <FormMessage ok={state.ok} message={state.message} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>{pending ? 'Saving…' : variant ? 'Save variant' : 'Add variant'}</Button>
        </div>
      </form>
      {variant ? (
        <form action={deleteAction} className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <ConfirmSubmit message={`Delete variant ${variant.label}? This cannot be undone.`} variant="danger">Delete variant</ConfirmSubmit>
          <FormMessage ok={deleteState.ok} message={deleteState.message} />
        </form>
      ) : null}
    </div>
  );
}
