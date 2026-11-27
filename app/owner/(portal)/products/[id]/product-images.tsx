'use client';

import { useActionState, useEffect, useRef, useState, type DragEvent } from 'react';
import {
  deleteImageAction,
  moveImageAction,
  setPrimaryImageAction,
  uploadProductImagesAction,
  type ImageActionState,
} from './image-actions';
import { Eye, Trash2, Star, ArrowLeft, ArrowRight, Upload, Sparkles, CheckCircle2 } from 'lucide-react';
import { ImagePreviewModal, type ImagePreviewData } from '@/components/owner/image-preview-modal';

export interface ProductImageView {
  id: string;
  public_url: string;
  alt_text: string;
  is_primary: boolean;
  sort_order: number;
}

const initial: ImageActionState = { ok: true, message: '' };

export function ProductImages({
  productId,
  images,
}: {
  productId: string;
  images: ProductImageView[];
}) {
  const [state, formAction, pending] = useActionState(uploadProductImagesAction, initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<{ name: string; url: string }[]>([]);
  const [previewModalData, setPreviewModalData] = useState<ImagePreviewData | null>(null);

  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  function take(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (inputRef.current) {
      const transfer = new DataTransfer();
      list.forEach((f) => transfer.items.add(f));
      inputRef.current.files = transfer.files;
    }
    setPreviews(list.map((f) => ({ name: f.name, url: URL.createObjectURL(f) })));
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (event.dataTransfer.files.length > 0) take(event.dataTransfer.files);
  }

  const primaryImage = images.find((img) => img.is_primary) ?? images[0];

  return (
    <section className="grid gap-6 rounded-card border border-line bg-card p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-line">
        <div>
          <h2 className="font-display text-xl font-bold text-burgundy flex items-center gap-2">
            <span>Product Photographs & Gallery</span>
            <span className="text-xs font-semibold text-gold bg-gold/15 px-2.5 py-0.5 rounded-full border border-gold/30">
              {images.length} / 8 photos
            </span>
          </h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Synchronized across Store Owner dashboard and Guest storefront. The primary photograph appears on showroom catalogue cards.
          </p>
        </div>
      </div>

      {images.length === 0 ? (
        <div className="rounded-control border-2 border-dashed border-line p-8 text-center text-sm text-ink-muted bg-cream/50">
          <p className="font-semibold text-ink">No product photographs uploaded yet.</p>
          <p className="text-xs text-ink-muted mt-1">Drag and drop photos below to upload.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-4">
            {images.map((img, index) => (
              <li
                key={img.id}
                className={`group relative flex flex-col justify-between overflow-hidden rounded-control border p-2.5 bg-white shadow-xs transition-all ${
                  img.is_primary ? 'border-gold ring-2 ring-gold/40' : 'border-line hover:border-gold/60'
                }`}
              >
                {/* Thumbnail with Click to Preview */}
                <div
                  onClick={() =>
                    setPreviewModalData({
                      imageUrl: img.public_url,
                      title: img.alt_text || 'Product photograph',
                      subtitle: img.is_primary ? 'Primary Photograph' : `Gallery Image #${index + 1}`,
                      status: img.is_primary ? 'Primary' : 'Gallery',
                    })
                  }
                  className="relative aspect-square w-full cursor-pointer overflow-hidden rounded-control bg-cream"
                  title="Click to view full preview"
                >
                  <img
                    src={img.public_url}
                    alt={img.alt_text || 'Product photograph'}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                  
                  {/* Quick View overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-burgundy shadow-xs">
                      <Eye className="h-3 w-3" />
                      <span>Preview</span>
                    </span>
                  </div>

                  {/* Primary Badge */}
                  {img.is_primary && (
                    <div className="absolute top-2 left-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-burgundy shadow-xs">
                        <Star className="h-3 w-3 fill-burgundy" />
                        <span>Primary</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Image Management Actions Bar */}
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1 border-t border-line/60 pt-2 text-xs">
                  {!img.is_primary ? (
                    <form action={setPrimaryImageAction}>
                      <input type="hidden" name="productId" value={productId} />
                      <input type="hidden" name="imageId" value={img.id} />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-burgundy hover:underline"
                        title="Set as primary product image"
                      >
                        <Star className="h-3 w-3" />
                        <span>Make Primary</span>
                      </button>
                    </form>
                  ) : (
                    <span className="text-[11px] font-semibold text-gold">Primary Image</span>
                  )}

                  <div className="flex items-center gap-1 ml-auto">
                    {index > 0 && (
                      <form action={moveImageAction}>
                        <input type="hidden" name="productId" value={productId} />
                        <input type="hidden" name="imageId" value={img.id} />
                        <input type="hidden" name="step" value="-1" />
                        <button
                          type="submit"
                          className="rounded-control p-1 text-ink-muted hover:text-burgundy hover:bg-cream"
                          title="Move earlier in gallery"
                        >
                          <ArrowLeft className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    )}

                    {index < images.length - 1 && (
                      <form action={moveImageAction}>
                        <input type="hidden" name="productId" value={productId} />
                        <input type="hidden" name="imageId" value={img.id} />
                        <input type="hidden" name="step" value="1" />
                        <button
                          type="submit"
                          className="rounded-control p-1 text-ink-muted hover:text-burgundy hover:bg-cream"
                          title="Move later in gallery"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    )}

                    <form action={deleteImageAction}>
                      <input type="hidden" name="productId" value={productId} />
                      <input type="hidden" name="imageId" value={img.id} />
                      <button
                        type="submit"
                        className="rounded-control p-1 text-red-600 hover:text-red-800 hover:bg-red-50"
                        title="Delete photograph"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Upload Form */}
      <form action={formAction} className="grid gap-3 pt-3 border-t border-line">
        <input type="hidden" name="productId" value={productId} />
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="grid place-items-center gap-2 rounded-card border-2 border-dashed border-gold/70 bg-cream p-6 text-center text-sm"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/20 text-burgundy">
            <Upload className="h-5 w-5" />
          </div>
          <div>
            <span className="font-semibold text-ink">Drag and drop new photographs here, or</span>{' '}
            <label className="cursor-pointer font-bold text-burgundy hover:underline">
              browse files
              <input
                ref={inputRef}
                type="file"
                name="images"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) => take(e.target.files ?? [])}
                className="sr-only"
              />
            </label>
          </div>
          <p className="text-xs text-ink-muted">WebP, PNG or JPEG, up to 5 MB per photograph.</p>
        </div>

        {previews.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-ink">Selected for upload:</span>
            <ul className="flex flex-wrap gap-2.5">
              {previews.map((p) => (
                <li key={p.url} className="flex items-center gap-2 rounded-control border border-line bg-white p-1.5 pr-3 text-xs">
                  <img src={p.url} alt={p.name} className="h-8 w-8 rounded-control object-cover" />
                  <span className="truncate max-w-[150px] font-medium text-ink">{p.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={pending || previews.length === 0}
            className="flex items-center gap-2 rounded-control bg-burgundy px-5 py-2.5 text-xs font-semibold text-cream shadow-xs hover:bg-burgundy-deep disabled:opacity-50 transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>{pending ? 'Uploading photographs...' : 'Upload Photographs to Gallery'}</span>
          </button>
          {state.message && (
            <span className={`text-xs font-medium ${state.ok ? 'text-emerald-800' : 'text-red-700'}`}>
              {state.message}
            </span>
          )}
        </div>
      </form>

      {/* Preview Modal */}
      <ImagePreviewModal
        data={previewModalData}
        onClose={() => setPreviewModalData(null)}
      />
    </section>
  );
}
