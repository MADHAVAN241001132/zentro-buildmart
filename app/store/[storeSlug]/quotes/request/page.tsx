import { notFound } from 'next/navigation';
import { getCartView } from '@/lib/services/cart';
import { getStoreBySlug } from '@/lib/services/storefront';
import { readGuestSession } from '@/lib/services/guest';
import { RequestForm } from './request-form';

export const dynamic = 'force-dynamic';

export default async function RequestQuotationPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<{ variant?: string; quantity?: string }>;
}) {
  const { storeSlug } = await params;
  const { variant, quantity } = await searchParams;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();
  const session = await readGuestSession(store.id, storeSlug);
  const cart = session ? await getCartView(store.id, session.id) : null;
  const cartCount = cart?.lines.length ?? 0;
  const singleVariant = variant && /^[0-9a-f-]{36}$/i.test(variant) ? { id: variant, quantity: Math.max(1, Math.min(99999, Number(quantity) || 1)) } : null;
  return (
    <div className="mx-auto grid max-w-3xl gap-6 px-4 py-8">
      <h1 className="font-display text-3xl text-burgundy">Request a quotation</h1>
      <p className="text-sm text-ink-muted">
        {singleVariant
          ? 'The store will price the product you chose. You will be able to accept or reject the quotation when it is sent.'
          : `The store will price the ${cartCount} product${cartCount === 1 ? '' : 's'} in your cart. Stock is not reserved until you place an order.`}
      </p>
      <RequestForm storeSlug={storeSlug} variantId={singleVariant?.id ?? null} quantity={singleVariant?.quantity ?? 1} cartCount={cartCount} />
    </div>
  );
}
