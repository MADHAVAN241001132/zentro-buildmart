import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConfirmSubmit } from '@/components/owner/confirm-submit';
import { PageHeader } from '@/components/owner/page-header';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatINR } from '@/lib/money';
import { ProductForm } from '../product-form';
import { archiveProductAction, restoreProductAction, updateProductAction } from '../actions';
import { VariantEditor } from './variant-editor';
import { ProductImages } from './product-images';

export const dynamic = 'force-dynamic';

const paiseToRupees = (p: number | null | undefined) => (p === null || p === undefined ? '' : (p / 100).toFixed(2));

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; photosSaved?: string; photosFailed?: string }>;
}) {
  const owner = await requireOwnerPermission('product_management');
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: product } = await supabase
    .from('products')
    .select('*, product_variants(*)')
    .eq('id', id)
    .eq('store_id', owner.storeId)
    .maybeSingle();
  if (!product) notFound();
  const { data: images } = await supabase
    .from('product_images')
    .select('id, public_url, alt_text, is_primary, sort_order')
    .eq('product_id', id)
    .order('sort_order');

  const [{ data: categories }, { data: subcategories }, { data: brands }] = await Promise.all([
    supabase.from('categories').select('id, name').eq('store_id', owner.storeId).order('sort_order'),
    supabase.from('subcategories').select('id, name, category_id').eq('store_id', owner.storeId).order('sort_order'),
    supabase.from('brands').select('id, name').eq('store_id', owner.storeId).order('name'),
  ]);

  const variants = ((product.product_variants ?? []) as {
    id: string; sku: string; label: string; size_label: string | null; sale_price_paise: number; cost_price_paise: number;
    mrp_paise: number | null; price_unit: string; pieces_per_box: number; coverage_sqft_per_box: number | null; is_default: boolean; is_active: boolean;
  }[]).sort((a, b) => Number(b.is_default) - Number(a.is_default));
  const archived = product.status === 'archived';
  const update = updateProductAction.bind(null, id);

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow={archived ? 'Archived product' : 'Catalogue'}
        title={product.name as string}
        description={`SKU ${product.sku as string} · ${variants.length} variant${variants.length === 1 ? '' : 's'}`}
        actions={
          <>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${archived ? 'bg-ink-muted/10 text-ink-muted' : 'bg-success/10 text-success'}`}>{archived ? 'Archived' : 'Live'}</span>
            <Link href="/owner/products" className="rounded-control border border-line px-4 py-2 text-sm font-semibold text-ink">Back to products</Link>
          </>
        }
      />

      {sp.created ? <p className="rounded-control bg-success/10 px-4 py-2 text-sm text-success">Product created. Add more variants below if needed.</p> : null}
      {sp.photosFailed ? (
        <p role="alert" className="rounded-control bg-danger/10 px-4 py-2 text-sm text-danger">
          {sp.photosSaved ?? '0'} photograph{sp.photosSaved === '1' ? '' : 's'} saved. {sp.photosFailed} could not be saved. Choose them again in the photographs section below.
        </p>
      ) : null}

      <ProductImages productId={id} images={(images ?? []) as Parameters<typeof ProductImages>[0]['images']} />
      <ProductForm
        action={update}
        submitLabel="Save product"
        defaults={{
          sku: product.sku as string,
          name: product.name as string,
          slug: product.slug as string,
          categoryId: product.category_id as string,
          subcategoryId: (product.subcategory_id as string | null) ?? '',
          brandId: (product.brand_id as string | null) ?? '',
          description: (product.description as string | null) ?? '',
          hsnCode: (product.hsn_code as string | null) ?? '',
          gstRateBps: product.gst_rate_bps as number,
          unitOfSale: product.unit_of_sale as string,
          finish: (product.finish as string | null) ?? '',
          colour: (product.colour as string | null) ?? '',
          application: (product.application as string | null) ?? '',
          warrantyMonths: product.warranty_months as number | null,
          visibility: product.visibility as 'public' | 'hidden',
          isFeatured: product.is_featured as boolean,
          isNewArrival: product.is_new_arrival as boolean,
          isBestSeller: product.is_best_seller as boolean,
          isSpecialOffer: product.is_special_offer as boolean,
        }}
        categories={(categories ?? []).map((c) => ({ id: c.id as string, name: c.name as string }))}
        subcategories={(subcategories ?? []).map((s) => ({ id: s.id as string, name: s.name as string, categoryId: s.category_id as string }))}
        brands={(brands ?? []).map((b) => ({ id: b.id as string, name: b.name as string }))}
        includeFirstVariant={false}
      />

      <section className="grid gap-4" aria-labelledby="variants-heading">
        <h2 id="variants-heading" className="font-display text-2xl text-burgundy">Variants</h2>
        <ul className="grid gap-4">
          {variants.map((v) => (
            <li key={v.id}>
              <VariantEditor
                productId={id}
                variant={{
                  id: v.id,
                  sku: v.sku,
                  label: v.label,
                  sizeLabel: v.size_label,
                  salePrice: paiseToRupees(v.sale_price_paise),
                  costPrice: paiseToRupees(v.cost_price_paise),
                  mrp: paiseToRupees(v.mrp_paise),
                  priceUnit: v.price_unit,
                  piecesPerBox: v.pieces_per_box,
                  coverageSqft: v.coverage_sqft_per_box,
                  isDefault: v.is_default,
                  isActive: v.is_active,
                }}
              />
              <p className="mt-1 text-xs text-ink-muted">
                Selling price {formatINR(v.sale_price_paise)} · {v.is_default ? 'default' : 'not default'} · {v.is_active ? 'active' : 'inactive'}
              </p>
            </li>
          ))}
        </ul>
        <VariantEditor productId={id} />
      </section>

      <section className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-card p-5">
        {archived ? (
          <form action={restoreProductAction.bind(null, id)}>
            <ConfirmSubmit message="Restore this product to the storefront?">Restore product</ConfirmSubmit>
          </form>
        ) : (
          <form action={archiveProductAction.bind(null, id)}>
            <ConfirmSubmit message="Archive this product? It will be removed from the storefront. Existing orders are kept." variant="danger">Archive product</ConfirmSubmit>
          </form>
        )}
        <p className="text-sm text-ink-muted">Archiving hides the product from customers. It does not delete sales or stock history.</p>
      </section>
    </div>
  );
}
