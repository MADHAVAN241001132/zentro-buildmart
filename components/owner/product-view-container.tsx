'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  LayoutGrid,
  List,
  Eye,
  Edit,
  Package,
  Layers,
  CheckCircle2,
  AlertTriangle,
  X,
  ExternalLink,
} from 'lucide-react';
import { formatINR } from '@/lib/money';
import { ImagePreviewModal, type ImagePreviewData } from './image-preview-modal';

export interface ProductItem {
  id: string;
  sku: string;
  name: string;
  status: string;
  visibility: string;
  gst_rate_bps: number;
  category: { id?: string; name: string } | null;
  brand: { id?: string; name: string } | null;
  product_variants: {
    id: string;
    sale_price_paise: number;
    is_default: boolean;
    is_active: boolean;
    inventory?: { on_hand: number; reserved?: number; reorder_level?: number } | null;
  }[];
  product_images?: {
    id: string;
    public_url: string;
    is_primary: boolean;
    alt_text?: string;
  }[];
}

export function ProductViewContainer({
  products,
  activeCategoryName,
  activeBrandName,
  basePath = '/owner/products',
  currentParams = {},
}: {
  products: ProductItem[];
  activeCategoryName?: string;
  activeBrandName?: string;
  basePath?: string;
  currentParams?: Record<string, string | undefined>;
}) {
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [previewData, setPreviewData] = useState<ImagePreviewData | null>(null);

  // Restore preferred view mode from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('zentro_owner_products_view');
      if (saved === 'grid' || saved === 'table') {
        setViewMode(saved);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const switchView = (mode: 'table' | 'grid') => {
    setViewMode(mode);
    try {
      localStorage.setItem('zentro_owner_products_view', mode);
    } catch {
      // Ignore
    }
  };

  const getPrimaryImage = (item: ProductItem) => {
    if (!item.product_images || item.product_images.length === 0) return null;
    return item.product_images.find((img) => img.is_primary) ?? item.product_images[0];
  };

  const getDefaultVariant = (item: ProductItem) => {
    return item.product_variants.find((v) => v.is_default) ?? item.product_variants[0];
  };

  const getTotalStock = (item: ProductItem) => {
    let total = 0;
    for (const v of item.product_variants) {
      if (v.inventory?.on_hand !== undefined) {
        total += v.inventory.on_hand;
      }
    }
    return total;
  };

  const openPreview = (item: ProductItem) => {
    const primary = getPrimaryImage(item);
    const def = getDefaultVariant(item);
    const stockOnHand = getTotalStock(item);

    setPreviewData({
      imageUrl: primary?.public_url ?? '',
      title: item.name,
      sku: item.sku,
      category: item.category?.name,
      brand: item.brand?.name,
      price: def ? formatINR(def.sale_price_paise) : undefined,
      stock: { onHand: stockOnHand },
      status: item.status,
      editHref: `/owner/products/${item.id}`,
    });
  };

  // Build clear filter URL
  const buildClearUrl = (removeKey: 'category' | 'brand') => {
    const next = new URLSearchParams();
    Object.entries(currentParams).forEach(([k, v]) => {
      if (k !== removeKey && v) next.set(k, v);
    });
    const qs = next.toString();
    return `${basePath}${qs ? `?${qs}` : ''}`;
  };

  return (
    <div className="space-y-4">
      {/* Top Bar: Active Filter Pills & View Mode Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Active Filter Indicators */}
        <div className="flex flex-wrap items-center gap-2">
          {activeCategoryName && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/15 px-3 py-1 text-xs font-semibold text-burgundy">
              <span>Category: {activeCategoryName}</span>
              <Link
                href={buildClearUrl('category')}
                className="hover:text-danger ml-0.5 rounded-full p-0.5 hover:bg-gold/20"
                title="Remove category filter"
              >
                <X className="h-3 w-3" />
              </Link>
            </div>
          )}

          {activeBrandName && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/15 px-3 py-1 text-xs font-semibold text-burgundy">
              <span>Brand: {activeBrandName}</span>
              <Link
                href={buildClearUrl('brand')}
                className="hover:text-danger ml-0.5 rounded-full p-0.5 hover:bg-gold/20"
                title="Remove brand filter"
              >
                <X className="h-3 w-3" />
              </Link>
            </div>
          )}

          {(activeCategoryName || activeBrandName) && (
            <Link
              href={basePath}
              className="text-xs font-semibold text-burgundy hover:underline"
            >
              Clear all filters
            </Link>
          )}
        </div>

        {/* View Switcher Buttons */}
        <div className="ml-auto inline-flex items-center rounded-control border border-line bg-card p-1 shadow-xs">
          <button
            type="button"
            onClick={() => switchView('table')}
            className={`flex items-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-semibold transition-all ${
              viewMode === 'table'
                ? 'bg-burgundy text-cream shadow-xs'
                : 'text-ink-muted hover:text-ink hover:bg-cream'
            }`}
            title="Switch to Table View"
          >
            <List className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Table View</span>
          </button>
          <button
            type="button"
            onClick={() => switchView('grid')}
            className={`flex items-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-semibold transition-all ${
              viewMode === 'grid'
                ? 'bg-burgundy text-cream shadow-xs'
                : 'text-ink-muted hover:text-ink hover:bg-cream'
            }`}
            title="Switch to Grid View"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Grid View</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: TABLE VIEW */}
      {viewMode === 'table' && (
        <div className="overflow-x-auto rounded-card border border-line bg-card shadow-xs">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted bg-cream/50">
              <tr>
                <th className="px-4 py-3 font-semibold w-24">Image</th>
                <th className="px-4 py-3 font-semibold">Product Name</th>
                <th className="px-4 py-3 font-semibold">SKU</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Brand</th>
                <th className="px-4 py-3 font-semibold">Price</th>
                <th className="px-4 py-3 font-semibold">Stock</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {products.map((row) => {
                const primary = getPrimaryImage(row);
                const def = getDefaultVariant(row);
                const stock = getTotalStock(row);

                return (
                  <tr key={row.id} className="hover:bg-cream/40 transition-colors">
                    {/* Dedicated 72x72 Thumbnail Column */}
                    <td className="px-4 py-2.5">
                      <div
                        onClick={() => openPreview(row)}
                        className="group relative h-[72px] w-[72px] shrink-0 cursor-pointer overflow-hidden rounded-control border border-line bg-cream shadow-xs transition-transform hover:scale-105 hover:border-gold"
                        title="Click to preview image"
                      >
                        {primary ? (
                          <img
                            src={primary.public_url}
                            alt={row.name}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-ink-muted bg-cream">
                            <Package className="h-6 w-6 opacity-40" />
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Eye className="h-4 w-4 text-white" />
                        </div>
                      </div>
                    </td>

                    {/* Product Name */}
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink hover:text-burgundy">
                        <Link href={`/owner/products/${row.id}`}>{row.name}</Link>
                      </p>
                      <p className="text-[11px] text-ink-muted">
                        {row.product_variants.length} variant{row.product_variants.length === 1 ? '' : 's'} · GST {(row.gst_rate_bps / 100).toFixed(0)}%
                      </p>
                    </td>

                    {/* SKU */}
                    <td className="px-4 py-3 font-mono text-xs text-ink-muted">
                      {row.sku}
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3 text-xs">
                      {row.category ? (
                        <Link
                          href={`/owner/products?category=${row.category.id || ''}`}
                          className="font-medium text-burgundy hover:underline"
                        >
                          {row.category.name}
                        </Link>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>

                    {/* Brand */}
                    <td className="px-4 py-3 text-xs">
                      {row.brand ? (
                        <Link
                          href={`/owner/products?brand=${row.brand.id || ''}`}
                          className="text-ink hover:text-burgundy hover:underline"
                        >
                          {row.brand.name}
                        </Link>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>

                    {/* Price */}
                    <td className="px-4 py-3 font-semibold text-ink">
                      {def ? formatINR(def.sale_price_paise) : '—'}
                    </td>

                    {/* Stock */}
                    <td className="px-4 py-3 text-xs">
                      {stock > 0 ? (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-800">
                          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                          <span>{stock} on hand</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium text-danger">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span>Out of stock</span>
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
                          row.status === 'archived'
                            ? 'bg-ink-muted/10 text-ink-muted'
                            : 'bg-success/15 text-success'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openPreview(row)}
                          className="rounded-control p-1 text-ink-muted hover:text-burgundy hover:bg-cream"
                          title="Quick preview"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <Link
                          href={`/owner/products/${row.id}`}
                          className="rounded-control border border-line bg-white px-2.5 py-1 text-xs font-semibold text-burgundy hover:bg-cream transition-colors"
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* VIEW 2: GRID VIEW */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {products.map((row) => {
            const primary = getPrimaryImage(row);
            const def = getDefaultVariant(row);
            const stock = getTotalStock(row);

            return (
              <div
                key={row.id}
                className="group flex flex-col justify-between overflow-hidden rounded-card border border-line bg-card shadow-xs transition-all hover:border-gold/60 hover:shadow-hover"
              >
                <div>
                  {/* Card Thumbnail */}
                  <div
                    onClick={() => openPreview(row)}
                    className="relative aspect-square w-full cursor-pointer overflow-hidden bg-cream"
                  >
                    {primary ? (
                      <img
                        src={primary.public_url}
                        alt={row.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-ink-muted bg-cream">
                        <Package className="h-12 w-12 opacity-30" />
                      </div>
                    )}

                    {/* Overlay preview pill */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-burgundy shadow-md">
                        <Eye className="h-3.5 w-3.5" />
                        <span>Quick View</span>
                      </span>
                    </div>

                    {/* Status badge in corner */}
                    <div className="absolute top-2.5 right-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase shadow-xs ${
                          row.status === 'archived'
                            ? 'bg-stone-800/80 text-white backdrop-blur-xs'
                            : 'bg-emerald-700/80 text-white backdrop-blur-xs'
                        }`}
                      >
                        {row.status}
                      </span>
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="p-4 space-y-2">
                    {/* Category & Brand Tags */}
                    <div className="flex items-center justify-between text-[11px] text-ink-muted">
                      <span className="font-semibold text-gold truncate max-w-[130px]">
                        {row.category?.name ?? 'General'}
                      </span>
                      {row.brand && (
                        <span className="text-ink-muted truncate max-w-[100px]">
                          {row.brand.name}
                        </span>
                      )}
                    </div>

                    {/* Product Name */}
                    <h3 className="font-display text-base font-bold text-ink group-hover:text-burgundy line-clamp-2 leading-snug">
                      <Link href={`/owner/products/${row.id}`}>{row.name}</Link>
                    </h3>

                    {/* SKU */}
                    <p className="text-[11px] font-mono text-ink-muted">
                      SKU {row.sku}
                    </p>

                    {/* Price & Stock Strip */}
                    <div className="pt-2 border-t border-line/60 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-ink-muted uppercase">Price</span>
                        <div className="font-display text-base font-bold text-burgundy">
                          {def ? formatINR(def.sale_price_paise) : '—'}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-ink-muted uppercase">Available</span>
                        <div className="text-xs font-semibold">
                          {stock > 0 ? (
                            <span className="text-emerald-800">{stock} units</span>
                          ) : (
                            <span className="text-danger">Out of stock</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="p-4 pt-0 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => openPreview(row)}
                    className="flex items-center justify-center gap-1 rounded-control border border-line bg-white py-2 text-xs font-semibold text-ink hover:bg-cream transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Preview</span>
                  </button>
                  <Link
                    href={`/owner/products/${row.id}`}
                    className="flex items-center justify-center gap-1 rounded-control bg-burgundy py-2 text-xs font-semibold text-cream hover:bg-burgundy-deep transition-colors"
                  >
                    <Edit className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Image Preview Modal Component */}
      <ImagePreviewModal
        data={previewData}
        onClose={() => setPreviewData(null)}
      />
    </div>
  );
}
