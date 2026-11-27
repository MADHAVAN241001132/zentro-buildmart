'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Eye, Layers, Tag, ArrowRight, Package } from 'lucide-react';
import { ImagePreviewModal, type ImagePreviewData } from './image-preview-modal';

export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  image_url: string | null;
  productCount: number;
  editSlot?: React.ReactNode;
}

export interface BrandItem {
  id: string;
  name: string;
  slug: string;
  is_premium: boolean;
  logo_url: string | null;
  productCount: number;
  editSlot?: React.ReactNode;
}

function getBrandInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    const first = parts[0].charAt(0);
    const second = parts[1].charAt(0);
    return (first + second).toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase();
}

export function CategoriesTable({
  categories,
}: {
  categories: CategoryItem[];
}) {
  const [previewData, setPreviewData] = useState<ImagePreviewData | null>(null);

  const openPreview = (cat: CategoryItem) => {
    if (!cat.image_url) return;
    setPreviewData({
      imageUrl: cat.image_url,
      title: cat.name,
      subtitle: `Category (${cat.slug})`,
      category: 'Store Category',
      status: cat.is_active ? 'Active' : 'Hidden',
      editHref: `/owner/products?category=${cat.id}`,
    });
  };

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-card shadow-xs">
      <table className="w-full min-w-[700px] text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted bg-cream/50">
          <tr>
            <th className="px-4 py-3 font-semibold w-24">Image</th>
            <th className="px-4 py-3 font-semibold">Category Name</th>
            <th className="px-4 py-3 font-semibold">Slug</th>
            <th className="px-4 py-3 font-semibold">Products</th>
            <th className="px-4 py-3 font-semibold">Showroom Visibility</th>
            <th className="px-4 py-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {categories.map((c) => (
            <tr key={c.id} className="hover:bg-cream/40 transition-colors align-middle">
              {/* Category Image Thumbnail Column */}
              <td className="px-4 py-2.5">
                <div
                  onClick={() => c.image_url && openPreview(c)}
                  className={`group relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-control border border-line bg-cream shadow-xs transition-transform ${
                    c.image_url ? 'cursor-pointer hover:scale-105 hover:border-gold' : ''
                  }`}
                  title={c.image_url ? 'Click to preview category image' : 'No image'}
                >
                  {c.image_url ? (
                    <img
                      src={c.image_url}
                      alt={c.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-ink-muted">
                      <Layers className="h-6 w-6 opacity-40 text-gold" />
                    </div>
                  )}
                  {c.image_url && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Eye className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
              </td>

              {/* Category Name & Filter Navigation */}
              <td className="px-4 py-3 font-medium text-ink">
                <Link
                  href={`/owner/products?category=${c.id}`}
                  className="font-bold text-burgundy hover:underline flex items-center gap-1.5"
                  title="View products in this category"
                >
                  <span>{c.name}</span>
                  <ArrowRight className="h-3 w-3 text-gold" />
                </Link>
                <span className="text-[11px] text-ink-muted">Sort order: {c.sort_order}</span>
              </td>

              {/* Slug */}
              <td className="px-4 py-3 text-xs font-mono text-ink-muted">
                {c.slug}
              </td>

              {/* Products count with link */}
              <td className="px-4 py-3">
                <Link
                  href={`/owner/products?category=${c.id}`}
                  className="inline-flex items-center gap-1 rounded-full bg-cream px-2.5 py-1 text-xs font-semibold text-burgundy border border-line hover:border-gold hover:bg-gold/10 transition-colors"
                  title="Filter products by this category"
                >
                  <span>{c.productCount} product{c.productCount === 1 ? '' : 's'}</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </td>

              {/* Active */}
              <td className="px-4 py-3 text-xs">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase ${
                  c.is_active ? 'bg-success/15 text-success' : 'bg-ink-muted/15 text-ink-muted'
                }`}>
                  {c.is_active ? 'Visible' : 'Hidden'}
                </span>
              </td>

              {/* Edit Dropdown Form */}
              <td className="px-4 py-3 text-right">
                {c.editSlot}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ImagePreviewModal
        data={previewData}
        onClose={() => setPreviewData(null)}
      />
    </div>
  );
}

export function BrandsTable({
  brands,
}: {
  brands: BrandItem[];
}) {
  const [previewData, setPreviewData] = useState<ImagePreviewData | null>(null);

  const openPreview = (brand: BrandItem) => {
    if (!brand.logo_url) return;
    setPreviewData({
      imageUrl: brand.logo_url,
      title: brand.name,
      subtitle: `Brand (${brand.slug})`,
      category: brand.is_premium ? 'Premium Brand' : 'Standard Brand',
      status: 'Active',
      editHref: `/owner/products?brand=${brand.id}`,
    });
  };

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-card shadow-xs">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted bg-cream/50">
          <tr>
            <th className="px-4 py-3 font-semibold w-24">Logo</th>
            <th className="px-4 py-3 font-semibold">Brand Name</th>
            <th className="px-4 py-3 font-semibold">Tier</th>
            <th className="px-4 py-3 font-semibold">Products</th>
            <th className="px-4 py-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {brands.map((b) => (
            <tr key={b.id} className="hover:bg-cream/40 transition-colors align-middle">
              {/* Brand Logo or Initials Placeholder */}
              <td className="px-4 py-2.5">
                <div
                  onClick={() => b.logo_url && openPreview(b)}
                  className={`group relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-control border border-line bg-cream shadow-xs transition-transform ${
                    b.logo_url ? 'cursor-pointer hover:scale-105 hover:border-gold' : ''
                  }`}
                  title={b.logo_url ? 'Click to preview logo' : b.name}
                >
                  {b.logo_url ? (
                    <img
                      src={b.logo_url}
                      alt={b.name}
                      loading="lazy"
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#45081C] to-[#6A0D2A] text-gold font-display font-bold shadow-inner">
                      <span className="text-xl tracking-wider">{getBrandInitials(b.name)}</span>
                      <span className="text-[8px] uppercase tracking-widest text-cream/70 font-sans mt-0.5">Brand</span>
                    </div>
                  )}
                  {b.logo_url && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Eye className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
              </td>

              {/* Brand Name & Filter Navigation */}
              <td className="px-4 py-3 font-medium text-ink">
                <Link
                  href={`/owner/products?brand=${b.id}`}
                  className="font-bold text-burgundy hover:underline flex items-center gap-1.5"
                  title="View products from this brand"
                >
                  <span>{b.name}</span>
                  <ArrowRight className="h-3 w-3 text-gold" />
                </Link>
                <span className="text-[11px] font-mono text-ink-muted">{b.slug}</span>
              </td>

              {/* Premium Tier */}
              <td className="px-4 py-3 text-xs">
                {b.is_premium ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gold/20 px-2.5 py-0.5 text-[11px] font-bold text-burgundy border border-gold/40">
                    ★ Premium
                  </span>
                ) : (
                  <span className="text-ink-muted">Standard</span>
                )}
              </td>

              {/* Associated Products Count */}
              <td className="px-4 py-3">
                <Link
                  href={`/owner/products?brand=${b.id}`}
                  className="inline-flex items-center gap-1 rounded-full bg-cream px-2.5 py-1 text-xs font-semibold text-burgundy border border-line hover:border-gold hover:bg-gold/10 transition-colors"
                  title="Filter products by this brand"
                >
                  <span>{b.productCount} product{b.productCount === 1 ? '' : 's'}</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </td>

              {/* Edit Dropdown Form */}
              <td className="px-4 py-3 text-right">
                {b.editSlot}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ImagePreviewModal
        data={previewData}
        onClose={() => setPreviewData(null)}
      />
    </div>
  );
}
