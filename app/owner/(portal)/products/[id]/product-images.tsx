'use client';

import { useActionState, useEffect, useRef, useState, type DragEvent } from 'react';
import { deleteImageAction, moveImageAction, setPrimaryImageAction, uploadProductImagesAction, type ImageActionState } from './image-actions';

export interface ProductImageView {
  id: string;
  public_url: string;
  alt_text: string;
  is_primary: boolean;
  sort_order: number;
}

const initial: ImageActionState = { ok: true, message: '' };

export function ProductImages({ productId, images }: { productId: string; images: ProductImageView[] }) {
  const [state, formAction, pending] = useActionState(uploadProductImagesAction, initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<{ name: string; url: string }[]>([]);

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

  return (
    <section className="grid gap-4 rounded-card border border-line bg-white p-5">
      <div>
        <h2 className="font-display text-lg text-burgundy">Product photographs</h2>
        <p className="text-xs text-ink-muted">JPEG, PNG or WebP, up to 5 MB each. The primary photograph appears on catalogue cards. Up to 8 per product.</p>
      </div>

      {images.length === 0 ? (
        <p className="rounded-control border border-dashed border-line p-4 text-sm text-ink-muted">No photographs yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((img, index) => (
            <li key={img.id} className="grid gap-2 rounded-control border border-line p-2">
              <img src={img.public_url} alt={img.alt_text || 'Product photograph'} loading="lazy" width={320} height={320} className="aspect-square w-full rounded-control object-cover" />
              <div className="flex flex-wrap items-center gap-1 text-xs">
                {img.is_primary ? <span className="rounded-control bg-gold/30 px-2 py-0.5 text-burgundy">Primary</span> : null}
                {!img.is_primary ? (
                  <form action={setPrimaryImageAction}>
                    <input type="hidden" name="productId" value={productId} />
                    <input type="hidden" name="imageId" value={img.id} />
                    <button className="underline">Make primary</button>
                  </form>
                ) : null}
                {index > 0 ? (
                  <form action={moveImageAction}>
                    <input type="hidden" name="productId" value={productId} />
                    <input type="hidden" name="imageId" value={img.id} />
                    <input type="hidden" name="step" value="-1" />
                    <button className="underline">Earlier</button>
                  </form>
                ) : null}
                {index < images.length - 1 ? (
                  <form action={moveImageAction}>
                    <input type="hidden" name="productId" value={productId} />
                    <input type="hidden" name="imageId" value={img.id} />
                    <input type="hidden" name="step" value="1" />
                    <button className="underline">Later</button>
                  </form>
                ) : null}
                <form action={deleteImageAction}>
                  <input type="hidden" name="productId" value={productId} />
                  <input type="hidden" name="imageId" value={img.id} />
                  <button className="text-red-700 underline">Delete</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="grid gap-3">
        <input type="hidden" name="productId" value={productId} />
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="grid place-items-center gap-1 rounded-card border-2 border-dashed border-gold bg-cream p-6 text-center text-sm"
        >
          <span>Drag photographs here, or</span>
          <input ref={inputRef} type="file" name="images" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => take(e.target.files ?? [])} className="text-sm" />
        </div>
        {previews.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {previews.map((p) => (
              <li key={p.url} className="grid w-20 gap-1 text-[10px]">
                <img src={p.url} alt={p.name} className="aspect-square w-20 rounded-control object-cover" />
                <span className="truncate">{p.name}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending || previews.length === 0} className="rounded-control bg-burgundy px-4 py-2 text-sm text-cream disabled:opacity-50">
            {pending ? 'Uploading...' : 'Upload photographs'}
          </button>
          {state.message ? <span className={`text-sm ${state.ok ? 'text-emerald-800' : 'text-red-700'}`}>{state.message}</span> : null}
        </div>
      </form>
    </section>
  );
}
