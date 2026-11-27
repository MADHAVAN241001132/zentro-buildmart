'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { X, ExternalLink, Package, Tag, Layers, CheckCircle2, AlertTriangle } from 'lucide-react';

export interface ImagePreviewData {
  imageUrl: string;
  title: string;
  subtitle?: string;
  sku?: string;
  category?: string;
  brand?: string;
  price?: string;
  stock?: {
    onHand: number;
    reserved?: number;
    reorderLevel?: number;
  };
  editHref?: string;
  status?: string;
}

export function ImagePreviewModal({
  data,
  onClose,
}: {
  data: ImagePreviewData | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (data) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [data, onClose]);

  if (!data) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-card border border-line bg-card shadow-2xl md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-ink shadow-sm hover:bg-white hover:text-burgundy transition-colors"
          aria-label="Close image preview"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Image Display */}
        <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-cream md:w-1/2">
          {data.imageUrl ? (
            <img
              src={data.imageUrl}
              alt={data.title}
              className="h-full w-full object-contain p-4"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-ink-muted">
              <Package className="h-16 w-16 opacity-40" />
              <span className="mt-2 text-xs">No image available</span>
            </div>
          )}
        </div>

        {/* Metadata Details */}
        <div className="flex flex-1 flex-col justify-between p-6">
          <div className="space-y-4">
            <div>
              {data.category && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-gold">
                  <Layers className="h-3 w-3" />
                  {data.category}
                </span>
              )}
              <h3 className="font-display text-xl font-bold text-burgundy mt-1">
                {data.title}
              </h3>
              {data.sku && (
                <p className="mt-0.5 text-xs font-mono text-ink-muted">
                  SKU: {data.sku}
                </p>
              )}
            </div>

            {/* Price & Status */}
            <div className="grid grid-cols-2 gap-3 border-y border-line py-3">
              {data.price && (
                <div>
                  <span className="text-[10px] font-semibold uppercase text-ink-muted">Selling Price</span>
                  <div className="font-display text-lg font-bold text-ink">{data.price}</div>
                </div>
              )}
              {data.status && (
                <div>
                  <span className="text-[10px] font-semibold uppercase text-ink-muted">Status</span>
                  <div>
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
                      data.status === 'active' ? 'bg-success/15 text-success' : 'bg-ink-muted/15 text-ink-muted'
                    }`}>
                      {data.status}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Inventory / Brand Information */}
            <div className="space-y-2 text-xs text-ink">
              {data.brand && (
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">Brand:</span>
                  <span className="font-medium">{data.brand}</span>
                </div>
              )}
              {data.stock !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-ink-muted">Available Stock:</span>
                  <span className="font-semibold flex items-center gap-1.5">
                    {data.stock.onHand > 0 ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        <span>{data.stock.onHand} units on hand</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-3.5 w-3.5 text-danger" />
                        <span className="text-danger">Out of stock</span>
                      </>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Action Link */}
          {data.editHref && (
            <div className="mt-6 pt-4 border-t border-line flex items-center justify-between">
              <Link
                href={data.editHref}
                onClick={onClose}
                className="flex items-center gap-1.5 rounded-control bg-burgundy px-4 py-2 text-xs font-semibold text-cream hover:bg-burgundy-deep transition-colors"
              >
                <span>Edit Product Details</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-semibold text-ink-muted hover:text-ink"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
