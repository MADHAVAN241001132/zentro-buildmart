'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { removeCartLineAction, updateCartLineAction, type ActionState } from '@/app/store/[storeSlug]/actions';
import { formatINR } from '@/lib/money';
import { FormMessage } from '@/components/ui/form-message';
import { useTranslator } from '@/components/i18n/use-translator';
import { ProductThumb } from './product-thumb';

export interface CartLineProps {
  storeSlug: string;
  itemId: string;
  productName: string;
  imageUrl?: string | null;
  variantLabel: string;
  priceUnit: string;
  unitPricePaise: number;
  quantity: number;
  lineTotalPaise: number;
  availableUnits: number;
}

export function CartLine(props: CartLineProps) {
  const [quantity, setQuantity] = useState(props.quantity);
  const [message, setMessage] = useState<ActionState | null>(null);
  const [pending, startTransition] = useTransition();
  const t = useTranslator();

  function save(next: number) {
    if (next < 1 || next === quantity) return;
    setQuantity(next);
    startTransition(async () => {
      const form = new FormData();
      form.set('itemId', props.itemId);
      form.set('quantity', String(next));
      const result = await updateCartLineAction(props.storeSlug, { ok: false }, form);
      setMessage(result);
      if (!result.ok) setQuantity(props.quantity);
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeCartLineAction(props.storeSlug, props.itemId);
      setMessage(result);
    });
  }

  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-card border border-line bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-4">
        <ProductThumb src={props.imageUrl ?? null} name={props.productName} className="h-20 w-20 sm:h-16 sm:w-16" />
        <div className="min-w-0">
          <p className="font-display text-lg text-ink">{props.productName}</p>
          <p className="text-sm text-ink-muted [overflow-wrap:anywhere]">
            {t('line.price', { variant: props.variantLabel, price: formatINR(props.unitPricePaise), unit: props.priceUnit })}
          </p>
          <FormMessage ok={message?.ok ?? null} message={message?.message} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 sm:flex-nowrap sm:justify-end sm:gap-4">
        <div className="flex items-center rounded-control border border-line" role="group" aria-label={t('line.quantity')}>
          <button
            type="button"
            className="min-h-[44px] min-w-[44px] px-3 py-2 text-lg disabled:opacity-40"
            onClick={() => save(quantity - 1)}
            disabled={pending || quantity <= 1}
            aria-label={t('line.decrease')}
          >
            −
          </button>
          <span className="min-w-9 text-center font-semibold" aria-live="polite">{quantity}</span>
          <button
            type="button"
            className="min-h-[44px] min-w-[44px] px-3 py-2 text-lg disabled:opacity-40"
            onClick={() => save(quantity + 1)}
            disabled={pending || quantity >= props.availableUnits}
            aria-label={t('line.increase')}
          >
            +
          </button>
        </div>
        <p className="text-right font-semibold tabular-nums text-ink sm:w-28">{formatINR(props.lineTotalPaise)}</p>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label={t('line.remove', { name: props.productName })}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control p-2 text-danger hover:bg-danger/10 disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}
