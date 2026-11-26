'use client';

import { useActionState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { addToCartAction, type ActionState } from '@/app/store/[storeSlug]/actions';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { useTranslator } from '@/components/i18n/use-translator';

const INITIAL: ActionState = { ok: false };

export function AddToCartForm({ storeSlug, variantId, quantity = 1 }: { storeSlug: string; variantId: string; quantity?: number }) {
  const action = addToCartAction.bind(null, storeSlug);
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const t = useTranslator();
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="quantity" value={quantity} />
      <Button type="submit" disabled={pending} className="w-full">
        <ShoppingBag className="h-4 w-4" aria-hidden />
        {pending ? t('common.adding') : t('common.addToCart')}
      </Button>
      <FormMessage ok={state.ok} message={state.message} />
    </form>
  );
}
