'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { productSchema, variantSchema, slugFor, issuesToFields } from '@/lib/validation/owner';
import { attachNewProductImages, type ChosenPhoto } from '@/lib/services/storage';
import { MAX_PRODUCT_IMAGES } from '@/lib/storage/image-policy';
import { entitlementErrorFrom } from '@/lib/services/entitlements';

export interface ProductActionState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

const FAIL = (message: string, fieldErrors?: Record<string, string>): ProductActionState => ({ ok: false, message, fieldErrors });

function text(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
}

function productFields(fd: FormData) {
  return {
    sku: text(fd, 'sku'),
    name: text(fd, 'name'),
    slug: text(fd, 'slug'),
    categoryId: text(fd, 'categoryId'),
    subcategoryId: text(fd, 'subcategoryId'),
    brandId: text(fd, 'brandId'),
    description: text(fd, 'description'),
    hsnCode: text(fd, 'hsnCode'),
    gstRateBps: text(fd, 'gstRateBps'),
    unitOfSale: text(fd, 'unitOfSale'),
    finish: text(fd, 'finish'),
    colour: text(fd, 'colour'),
    application: text(fd, 'application'),
    warrantyMonths: text(fd, 'warrantyMonths'),
    visibility: text(fd, 'visibility') || 'public',
    isFeatured: fd.get('isFeatured'),
    isNewArrival: fd.get('isNewArrival'),
    isBestSeller: fd.get('isBestSeller'),
    isSpecialOffer: fd.get('isSpecialOffer'),
  };
}

function variantFields(fd: FormData) {
  return {
    variantId: text(fd, 'variantId'),
    sku: text(fd, 'variantSku'),
    label: text(fd, 'label'),
    sizeLabel: text(fd, 'sizeLabel'),
    salePrice: text(fd, 'salePrice'),
    costPrice: text(fd, 'costPrice'),
    mrp: text(fd, 'mrp'),
    priceUnit: text(fd, 'priceUnit') || 'piece',
    piecesPerBox: text(fd, 'piecesPerBox') || '1',
    coverageSqft: text(fd, 'coverageSqft'),
    isDefault: fd.get('isDefault'),
    isActive: fd.get('isActive'),
  };
}

/**
 * Photographs chosen on the create form. The index of each file counts every entry in the field, including
 * empty ones, because the form's primary choice refers to that position.
 */
function choosePhotos(fd: FormData): ChosenPhoto[] {
  const primaryRaw = text(fd, 'primaryIndex');
  const primaryIndex = primaryRaw === '' ? -1 : Number(primaryRaw);
  const photos: ChosenPhoto[] = [];
  fd.getAll('images').forEach((entry, index) => {
    if (entry instanceof File && entry.size > 0) photos.push({ file: entry, primary: index === primaryIndex });
  });
  return photos;
}

function productRow(data: ReturnType<typeof productSchema.parse>, slug: string) {
  return {
    sku: data.sku,
    name: data.name,
    slug,
    category_id: data.categoryId,
    subcategory_id: data.subcategoryId ?? null,
    brand_id: data.brandId ?? null,
    description: data.description,
    hsn_code: data.hsnCode,
    gst_rate_bps: data.gstRateBps,
    unit_of_sale: data.unitOfSale,
    finish: data.finish,
    colour: data.colour,
    application: data.application,
    warranty_months: data.warrantyMonths,
    visibility: data.visibility,
    is_featured: data.isFeatured,
    is_new_arrival: data.isNewArrival,
    is_best_seller: data.isBestSeller,
    is_special_offer: data.isSpecialOffer,
  };
}

/**
 * Creates a product with its first (default) variant. RLS limits writes to owners and managers.
 * The two inserts are separate requests: if the variant insert fails, the product row is deleted
 * again. That compensation is not a database transaction, so a failure during the delete would
 * leave a product without a variant. The product stays hidden until a variant is added.
 */
export async function createProductAction(_prev: ProductActionState, formData: FormData): Promise<ProductActionState> {
  const owner = await requireOwnerPermission('product_management');

  const product = productSchema.safeParse(productFields(formData));
  const variant = variantSchema.safeParse(variantFields(formData));
  if (!product.success || !variant.success) {
    return FAIL('Please correct the highlighted fields', {
      ...(product.success ? {} : issuesToFields(product.error)),
      ...(variant.success ? {} : issuesToFields(variant.error)),
    });
  }

  // Checked before anything is saved, so a rejected photo count never leaves a product behind.
  const photos = choosePhotos(formData);
  if (photos.length > MAX_PRODUCT_IMAGES) {
    return FAIL(`Choose up to ${MAX_PRODUCT_IMAGES} photographs for a product.`, { images: `Choose up to ${MAX_PRODUCT_IMAGES} photographs.` });
  }

  const supabase = await createSupabaseServerClient();
  const { data: created, error: productError } = await supabase
    .from('products')
    .insert({ ...productRow(product.data, slugFor(product.data.name, product.data.slug)), store_id: owner.storeId, visibility: product.data.visibility })
    .select('id')
    .single();
  if (productError || !created) {
    const limit = entitlementErrorFrom(productError);
    if (limit) return FAIL(limit.message);
    return FAIL(productError?.message.includes('duplicate') ? 'A product with this SKU or slug already exists' : 'Could not save the product');
  }
  const productId = created.id as string;

  const v = variant.data;
  const { error: variantError } = await supabase.from('product_variants').insert({
    store_id: owner.storeId,
    product_id: productId,
    sku: v.sku,
    label: v.label,
    size_label: v.sizeLabel,
    sale_price_paise: v.salePrice ?? 0,
    cost_price_paise: v.costPrice ?? 0,
    mrp_paise: v.mrp,
    price_unit: v.priceUnit,
    pieces_per_box: v.piecesPerBox,
    coverage_sqft_per_box: v.coverageSqft,
    is_default: true,
    is_active: true,
  });
  if (variantError) {
    await supabase.from('products').delete().eq('id', productId).eq('store_id', owner.storeId);
    return FAIL(variantError.message.includes('duplicate') ? 'The variant SKU already exists' : 'Could not save the variant. The product was not created.');
  }

  // The product and its first variant are saved at this point. Photographs are attached afterwards, so a
  // failed upload leaves the product in place and is reported on the product page for a retry.
  const photoResult = photos.length > 0 ? await attachNewProductImages(owner.storeId, productId, photos, owner.userId) : null;

  revalidatePath('/owner/products');
  if (photoResult && photoResult.failed.length > 0) {
    redirect(`/owner/products/${productId}?created=1&photosFailed=${photoResult.failed.length}&photosSaved=${photoResult.attached}`);
  }
  redirect(`/owner/products/${productId}?created=1${photoResult ? `&photosSaved=${photoResult.attached}` : ''}`);
}

export async function updateProductAction(productId: string, _prev: ProductActionState, formData: FormData): Promise<ProductActionState> {
  const owner = await requireOwnerPermission('product_management');
  const parsed = productSchema.safeParse(productFields(formData));
  if (!parsed.success) return FAIL('Please correct the highlighted fields', issuesToFields(parsed.error));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('products')
    .update({ ...productRow(parsed.data, slugFor(parsed.data.name, parsed.data.slug)), visibility: parsed.data.visibility, updated_at: new Date().toISOString() })
    .eq('id', productId)
    .eq('store_id', owner.storeId);
  if (error) return FAIL(error.message.includes('duplicate') ? 'Another product already uses this SKU or slug' : 'Could not update the product');
  revalidatePath(`/owner/products/${productId}`);
  revalidatePath('/owner/products');
  return { ok: true, message: 'Product saved' };
}

async function setProductStatus(productId: string, archive: boolean): Promise<ProductActionState> {
  const owner = await requireOwnerPermission('product_management');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('products')
    .update({ status: archive ? 'archived' : 'active', archived_at: archive ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq('id', productId)
    .eq('store_id', owner.storeId);
  if (error) return FAIL('Could not change the product status');
  revalidatePath('/owner/products');
  revalidatePath(`/owner/products/${productId}`);
  return { ok: true, message: archive ? 'Product archived. It no longer appears in the storefront.' : 'Product restored' };
}

export async function archiveProductAction(productId: string): Promise<void> {
  await setProductStatus(productId, true);
}

export async function restoreProductAction(productId: string): Promise<void> {
  await setProductStatus(productId, false);
}

/** Adds or edits a variant. A default variant clears the flag on the others first, to respect the one-default index. */
export async function saveVariantAction(productId: string, _prev: ProductActionState, formData: FormData): Promise<ProductActionState> {
  const owner = await requireOwnerPermission('product_management');
  const parsed = variantSchema.safeParse(variantFields(formData));
  if (!parsed.success) return FAIL('Please correct the highlighted fields', issuesToFields(parsed.error));
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: product } = await supabase.from('products').select('id').eq('id', productId).eq('store_id', owner.storeId).maybeSingle();
  if (!product) return FAIL('Product not found');

  if (v.isDefault) {
    let clear = supabase.from('product_variants').update({ is_default: false }).eq('product_id', productId).eq('store_id', owner.storeId);
    if (v.variantId) clear = clear.neq('id', v.variantId);
    const { error: clearError } = await clear;
    if (clearError) return FAIL('Could not update the default variant');
  }

  const row = {
    sku: v.sku,
    label: v.label,
    size_label: v.sizeLabel,
    sale_price_paise: v.salePrice ?? 0,
    cost_price_paise: v.costPrice ?? 0,
    mrp_paise: v.mrp,
    price_unit: v.priceUnit,
    pieces_per_box: v.piecesPerBox,
    coverage_sqft_per_box: v.coverageSqft,
    is_default: v.isDefault,
    is_active: v.isActive,
    updated_at: new Date().toISOString(),
  };
  const query = v.variantId
    ? supabase.from('product_variants').update(row).eq('id', v.variantId).eq('product_id', productId).eq('store_id', owner.storeId)
    : supabase.from('product_variants').insert({ ...row, store_id: owner.storeId, product_id: productId });
  const { error } = await query;
  if (error) {
    if (error.message.includes('duplicate') || error.message.includes('unique')) return FAIL('This variant SKU is already used in the store');
    if (error.message.includes('mrp')) return FAIL('MRP cannot be less than the selling price');
    return FAIL('Could not save the variant');
  }
  revalidatePath(`/owner/products/${productId}`);
  return { ok: true, message: v.variantId ? 'Variant saved' : 'Variant added' };
}

export async function deleteVariantAction(productId: string, variantId: string, _prev: ProductActionState): Promise<ProductActionState> {
  const owner = await requireOwnerPermission('product_management');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('product_variants').delete().eq('id', variantId).eq('product_id', productId).eq('store_id', owner.storeId);
  if (error) {
    return FAIL('This variant has sales or stock history, so it cannot be deleted. Deactivate it instead.');
  }
  revalidatePath(`/owner/products/${productId}`);
  return { ok: true, message: 'Variant deleted' };
}
