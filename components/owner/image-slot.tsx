'use client';

import { useActionState, useEffect, useState } from 'react';
import { clearMediaAction, uploadMediaAction, type MediaActionState } from '@/app/owner/(portal)/media-actions';

const initial: MediaActionState = { ok: true, message: '' };

/** Shows the current image, previews a new file, and replaces or removes the image. The server checks every upload. */
export function ImageSlot({ target, targetId, label, currentUrl, hint }: { target: 'category' | 'brand' | 'logo' | 'banner'; targetId: string; label: string; currentUrl: string | null; hint?: string }) {
  const [state, formAction, pending] = useActionState(uploadMediaAction, initial);
  const [preview, setPreview] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  return (
    <div className="grid gap-3 rounded-card border border-line bg-cream p-4 text-sm">
      <p className="font-semibold text-ink">{label}</p>
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid h-28 w-40 place-items-center overflow-hidden rounded-control border border-line bg-white text-xs text-ink-muted">
          {preview ? (
            <img src={preview} alt={`New ${label.toLowerCase()} preview`} className="h-full w-full object-cover" />
          ) : currentUrl ? (
            <img src={currentUrl} alt={label} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span>No image yet</span>
          )}
        </div>
        <form action={formAction} className="grid gap-2">
          <input type="hidden" name="target" value={target} />
          <input type="hidden" name="targetId" value={targetId} />
          <input
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && file.size > 5 * 1024 * 1024) {
                setSizeError('The file is larger than 5 MB.');
                setPreview(null);
              } else {
                setSizeError(null);
                setPreview(file ? URL.createObjectURL(file) : null);
              }
            }}
            className="text-xs"
          />
          <p className="text-[11px] text-ink-muted">{hint ?? 'JPEG, PNG or WebP, up to 5 MB.'}</p>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending || Boolean(sizeError)} className="rounded-control bg-burgundy px-3 py-1.5 text-xs text-cream disabled:opacity-50">
              {pending ? 'Saving...' : currentUrl ? 'Replace image' : 'Upload image'}
            </button>
            {sizeError ? (
              <span className="text-xs text-red-700">{sizeError}</span>
            ) : state.message ? (
              <span className={`text-xs ${state.ok ? 'text-emerald-800' : 'text-red-700'}`}>{state.message}</span>
            ) : null}
          </div>
        </form>
      </div>
      {currentUrl ? (
        <form action={clearMediaAction}>
          <input type="hidden" name="target" value={target} />
          <input type="hidden" name="targetId" value={targetId} />
          <button className="text-xs text-red-700 underline">Remove image</button>
        </form>
      ) : null}
    </div>
  );
}
