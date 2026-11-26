'use client';

import { useActionState } from 'react';
import type { PhotoState } from '@/app/store/[storeSlug]/orders/[orderNumber]/refund/photo-actions';

export interface RefundPhotoView { id: string; url: string }

const initial: PhotoState = { ok: true, message: '' };

/** Supporting photographs for an open refund request. Ownership is checked on the server for every link and change. */
export function RefundPhotoPanel({
  photos,
  canEdit,
  addAction,
  removeAction,
}: {
  photos: RefundPhotoView[];
  canEdit: boolean;
  addAction: (previous: PhotoState, formData: FormData) => Promise<PhotoState>;
  removeAction: (formData: FormData) => Promise<void>;
}) {
  const [state, formAction, pending] = useActionState(addAction, initial);
  return (
    <section className="grid gap-3 rounded-card border border-line bg-card p-5 text-sm">
      <div>
        <h2 className="font-display text-lg text-burgundy">Photographs</h2>
        <p className="text-xs text-ink-muted">Add up to four photographs that show the item and its condition. Only the store can see them.</p>
      </div>
      {photos.length === 0 ? (
        <p className="text-ink-muted">No photographs yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.map((p) => (
            <li key={p.id} className="grid gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="Refund supporting photograph" loading="lazy" className="aspect-square w-full rounded-control object-cover" />
              {canEdit ? (
                <form action={removeAction}>
                  <input type="hidden" name="photoId" value={p.id} />
                  <button className="text-xs text-red-700 underline">Remove</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit && photos.length < 4 ? (
        <form action={formAction} className="grid gap-2">
          <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" className="text-xs" />
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className="rounded-control bg-burgundy px-3 py-1.5 text-xs text-cream disabled:opacity-50">
              {pending ? 'Uploading...' : 'Add photograph'}
            </button>
            {state.message ? <span className={`text-xs ${state.ok ? 'text-emerald-800' : 'text-red-700'}`}>{state.message}</span> : null}
          </div>
        </form>
      ) : null}
    </section>
  );
}
