import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { orderProductPhotos, type ProductPhoto, type RawPhoto } from '@/lib/storage/photo-order';

/**
 * Storefront reads. Runs on the service client because stock figures are not visible to anonymous
 * visitors under RLS. Every query is scoped to one store id resolved from an active store slug,
 * and only public, active products are returned.
 */

export interface StoreInfo {
  legalName: string | null;
  businessDescription: string | null;
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  gstin: string | null;
  brandColour: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  tagline: string | null;
  paymentSettings: {
    onlineEnabled: boolean;
    cashEnabled: boolean;
    paymentExpiryMinutes: number;
    orderPrefix: string;
  };
}

export interface VariantInfo {
  id: string;
  sku: string;
  label: string;
  sizeLabel: string | null;
  salePricePaise: number;
  mrpPaise: number | null;
  priceUnit: string;
  piecesPerBox: number;
  /** Square feet one box covers; null when the product does not record it. */
  coverageSqftPerBox: number | null;
  isDefault: boolean;
  availableUnits: number;
}

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  sku: string;
  brand: string | null;
  brandSlug: string | null;
  categorySlug: string;
  categoryName: string;
  unitOfSale: string;
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  isSpecialOffer: boolean;
  defaultVariant: VariantInfo | null;
  variantCount: number;
  imageUrl: string | null;
  inStock: boolean;
}

export interface ProductDetail extends ProductSummary {
  description: string | null;
  material: string | null;
  gstRateBps: number;
  hsnCode: string | null;
  finish: string | null;
  colour: string | null;
  application: string | null;
  warrantyMonths: number | null;
  variants: VariantInfo[];
  specs: Record<string, unknown>;
  /** Every public photograph for the product, primary first. Empty when none has been uploaded. */
  photos: ProductPhoto[];
}

export interface BrandInfo {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
}

export interface CategoryInfo {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  productCount: number;
}

interface RawVariant {
  id: string;
  sku: string;
  label: string;
  size_label: string | null;
  sale_price_paise: number;
  mrp_paise: number | null;
  price_unit: string;
  pieces_per_box: number;
  coverage_sqft_per_box: number | null;
  is_default: boolean;
  is_active: boolean;
  inventory: { on_hand: number; reserved: number }[] | { on_hand: number; reserved: number } | null;
}

interface RawProduct {
  id: string;
  material: string | null;
  slug: string;
  name: string;
  sku: string;
  description: string | null;
  gst_rate_bps: number;
  hsn_code: string | null;
  finish: string | null;
  colour: string | null;
  application: string | null;
  warranty_months: number | null;
  unit_of_sale: string;
  is_featured: boolean;
  is_new_arrival: boolean;
  is_best_seller: boolean;
  is_special_offer: boolean;
  specs: Record<string, unknown> | null;
  category: { slug: string; name: string } | null;
  brand: { name: string; slug: string } | null;
  variants: RawVariant[] | null;
  images: RawImage[] | null;
}

type RawImage = RawPhoto;

const PRODUCT_SELECT = `
  id, slug, name, sku, description, gst_rate_bps, hsn_code, finish, colour, application, material,
  warranty_months, unit_of_sale, is_featured, is_new_arrival, is_best_seller, is_special_offer, specs,
  category:categories!inner(slug, name),
  brand:brands(name, slug),
  images:product_images(public_url, alt_text, is_primary, sort_order),
  variants:product_variants(
    id, sku, label, size_label, sale_price_paise, mrp_paise, price_unit, pieces_per_box, coverage_sqft_per_box, is_default, is_active,
    inventory(on_hand, reserved)
  )
`;

function availableUnits(inventory: RawVariant['inventory']): number {
  if (!inventory) return 0;
  const rows = Array.isArray(inventory) ? inventory : [inventory];
  return rows.reduce((sum, row) => sum + Math.max(0, row.on_hand - row.reserved), 0);
}

function mapVariant(raw: RawVariant): VariantInfo {
  return {
    id: raw.id,
    sku: raw.sku,
    label: raw.label,
    sizeLabel: raw.size_label,
    salePricePaise: raw.sale_price_paise,
    mrpPaise: raw.mrp_paise,
    priceUnit: raw.price_unit,
    piecesPerBox: raw.pieces_per_box,
    coverageSqftPerBox: raw.coverage_sqft_per_box === null ? null : Number(raw.coverage_sqft_per_box),
    isDefault: raw.is_default,
    availableUnits: availableUnits(raw.inventory),
  };
}

function activeVariants(raw: RawProduct): VariantInfo[] {
  return (raw.variants ?? [])
    .filter((v) => v.is_active)
    .map(mapVariant)
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.salePricePaise - b.salePricePaise);
}

function mapSummary(raw: RawProduct): ProductSummary {
  const variants = activeVariants(raw);
  const defaultVariant = variants.find((v) => v.isDefault) ?? variants[0] ?? null;
  return {
    id: raw.id,
    slug: raw.slug,
    name: raw.name,
    sku: raw.sku,
    brand: raw.brand?.name ?? null,
    brandSlug: raw.brand?.slug ?? null,
    categorySlug: raw.category?.slug ?? '',
    categoryName: raw.category?.name ?? '',
    unitOfSale: raw.unit_of_sale,
    isFeatured: raw.is_featured,
    isNewArrival: raw.is_new_arrival,
    isBestSeller: raw.is_best_seller,
    isSpecialOffer: raw.is_special_offer,
    defaultVariant,
    imageUrl: orderProductPhotos(raw.images, raw.name)[0]?.url ?? null,
    variantCount: variants.length,
    inStock: variants.some((v) => v.availableUnits > 0),
  };
}

export async function getStoreBySlug(slug: string): Promise<StoreInfo | null> {
  const admin = createSupabaseAdminClient();
  const { data: store, error } = await admin
    .from('stores')
    .select('id, slug, name, city, state, phone, gstin, brand_colour, legal_name, business_description, logo_url, banner_url, store_settings(online_payment_enabled, cash_payment_enabled, payment_expiry_minutes, order_prefix, opening_hours)')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new Error('Could not load store');
  if (!store) return null;
  const settings = (Array.isArray(store.store_settings) ? store.store_settings[0] : store.store_settings) as
    | { online_payment_enabled: boolean; cash_payment_enabled: boolean; payment_expiry_minutes: number; order_prefix: string; opening_hours?: Record<string, unknown> }
    | null
    | undefined;
  return {
    id: store.id as string,
    slug: store.slug as string,
    name: store.name as string,
    city: store.city as string | null,
    state: store.state as string | null,
    phone: store.phone as string | null,
    gstin: store.gstin as string | null,
    legalName: (store.legal_name as string | null) ?? null,
    businessDescription: (store.business_description as string | null) ?? null,
    brandColour: store.brand_colour as string,
    logoUrl: (store.logo_url as string | null) ?? null,
    bannerUrl: (store.banner_url as string | null) ?? null,
    tagline: (settings?.opening_hours?.tagline as string | undefined) ?? null,
    paymentSettings: {
      onlineEnabled: settings?.online_payment_enabled ?? false,
      cashEnabled: settings?.cash_payment_enabled ?? false,
      paymentExpiryMinutes: settings?.payment_expiry_minutes ?? 15,
      orderPrefix: settings?.order_prefix ?? 'ZBM',
    },
  };
}

export async function listCategories(storeId: string): Promise<CategoryInfo[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('categories')
    .select('id, slug, name, image_url, sort_order')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw new Error('Could not load categories');
  const rows = (data ?? []) as { id: string; slug: string; name: string; image_url: string | null }[];

  const { data: counts, error: countError } = await admin
    .from('products')
    .select('category_id')
    .eq('store_id', storeId)
    .eq('status', 'active')
    .eq('visibility', 'public');
  if (countError) throw new Error('Could not count products');
  const tally = new Map<string, number>();
  for (const row of (counts ?? []) as { category_id: string }[]) {
    tally.set(row.category_id, (tally.get(row.category_id) ?? 0) + 1);
  }
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    imageUrl: row.image_url,
    productCount: tally.get(row.id) ?? 0,
  }));
}

export interface ProductQuery {
  categorySlug?: string;
  search?: string;
  sort?: 'featured' | 'price-asc' | 'price-desc' | 'name';
  inStockOnly?: boolean;
  /** Brand slug. Matched after the query, the same as the stock filter. */
  brandSlug?: string;
  page?: number;
  pageSize?: number;
}

export interface ProductPage {
  items: ProductSummary[];
  total: number;
  page: number;
  pageCount: number;
}

/**
 * Lists public, active products. Filtering by price and stock runs in memory after the query
 * because prices and stock live in related tables; the result set is capped per store.
 */
export async function listProducts(storeId: string, query: ProductQuery = {}): Promise<ProductPage> {
  const admin = createSupabaseAdminClient();
  let request = admin
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('store_id', storeId)
    .eq('status', 'active')
    .eq('visibility', 'public')
    .limit(500);
  if (query.categorySlug) request = request.eq('category.slug', query.categorySlug);
  const term = query.search?.trim();
  if (term) request = request.textSearch('search_tsv', term, { config: 'simple', type: 'websearch' });

  const { data, error } = await request;
  if (error) throw new Error('Could not load products');
  let items = ((data ?? []) as unknown as RawProduct[]).map(mapSummary).filter((p) => p.defaultVariant !== null);

  if (query.inStockOnly) items = items.filter((p) => p.inStock);
  if (query.brandSlug) items = items.filter((p) => p.brandSlug === query.brandSlug);
  items.sort((a, b) => {
    const priceA = a.defaultVariant?.salePricePaise ?? 0;
    const priceB = b.defaultVariant?.salePricePaise ?? 0;
    switch (query.sort) {
      case 'price-asc':
        return priceA - priceB;
      case 'price-desc':
        return priceB - priceA;
      case 'name':
        return a.name.localeCompare(b.name);
      default:
        return Number(b.isFeatured) - Number(a.isFeatured) || a.name.localeCompare(b.name);
    }
  });

  const pageSize = query.pageSize ?? 12;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, query.page ?? 1), pageCount);
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
    page,
    pageCount,
  };
}

export async function getProductDetail(storeId: string, productSlug: string): Promise<ProductDetail | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('store_id', storeId)
    .eq('slug', productSlug)
    .eq('status', 'active')
    .eq('visibility', 'public')
    .maybeSingle();
  if (error) throw new Error('Could not load product');
  if (!data) return null;
  return toDetail(data as unknown as RawProduct);
}

/** Full product detail from one raw row. Null when the product has no active variant. */
function toDetail(raw: RawProduct): ProductDetail | null {
  const summary = mapSummary(raw);
  if (!summary.defaultVariant) return null;
  return {
    ...summary,
    description: raw.description,
    material: raw.material,
    gstRateBps: raw.gst_rate_bps,
    hsnCode: raw.hsn_code,
    finish: raw.finish,
    colour: raw.colour,
    application: raw.application,
    warrantyMonths: raw.warranty_months,
    variants: activeVariants(raw),
    specs: raw.specs ?? {},
    photos: orderProductPhotos(raw.images, raw.name),
  };
}

/** Public, active products by id, returned in the order requested. Used by the wishlist and comparison. */
export async function getProductDetailsByIds(storeId: string, productIds: string[]): Promise<ProductDetail[]> {
  if (productIds.length === 0) return [];
  const { data, error } = await createSupabaseAdminClient()
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('store_id', storeId)
    .in('id', productIds)
    .eq('status', 'active')
    .eq('visibility', 'public');
  if (error) throw new Error('Could not load products');
  const byId = new Map<string, ProductDetail>();
  for (const row of (data ?? []) as unknown as RawProduct[]) {
    const detail = toDetail(row);
    if (detail) byId.set(row.id, detail);
  }
  return productIds.flatMap((id) => {
    const detail = byId.get(id);
    return detail ? [detail] : [];
  });
}

/**
 * Brands for the store. The homepage strip asks for brands with a logo; the catalogue filter asks for all of them.
 */
export async function listStoreBrands(storeId: string, options: { withLogoOnly?: boolean; limit?: number } = {}): Promise<BrandInfo[]> {
  let request = createSupabaseAdminClient()
    .from('brands')
    .select('id, slug, name, logo_url')
    .eq('store_id', storeId)
    .order('name', { ascending: true })
    .limit(options.limit ?? 100);
  if (options.withLogoOnly) request = request.not('logo_url', 'is', null);
  const { data, error } = await request;
  if (error) throw new Error('Could not load brands');
  return ((data ?? []) as { id: string; slug: string; name: string; logo_url: string | null }[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    logoUrl: row.logo_url,
  }));
}

/** Products in the same category, excluding one product. Used for "you may also like". */
export async function listRelatedProducts(storeId: string, categorySlug: string, excludeId: string): Promise<ProductSummary[]> {
  const page = await listProducts(storeId, { categorySlug, pageSize: 4, sort: 'featured' });
  return page.items.filter((p) => p.id !== excludeId).slice(0, 3);
}
