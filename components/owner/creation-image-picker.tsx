'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { MAX_PRODUCT_IMAGES } from '@/lib/storage/image-policy';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

interface Entry {
  id: number;
  file: File;
  url: string;
}

/**
 * Photograph chooser for the create-product form. Several files can be chosen or dropped at once; each
 * gets a preview, one can be made primary, and any can be removed before saving. The chosen files are
 * written into the form's file input so they travel with the normal form submission. The server checks
 * type, size and count again, so this component only helps the owner choose.
 */
export function CreationImagePicker({ resetToken }: { resetToken?: unknown }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [primaryId, setPrimaryId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const counter = useRef(0);
  const latest = useRef<Entry[]>([]);
  latest.current = entries;

  // Release preview URLs when the form leaves the page.
  useEffect(() => {
    const current = latest.current;
    return () => current.forEach((entry) => URL.revokeObjectURL(entry.url));
  }, []);

  // After the server responds, React resets uncontrolled inputs, which can empty the file input while the
  // previews are still shown. Writing the chosen files back keeps the two in step.
  useEffect(() => {
    syncInput(latest.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the form's action state changes
  }, [resetToken]);

  function syncInput(next: Entry[]) {
    if (!inputRef.current) return;
    const transfer = new DataTransfer();
    next.forEach((entry) => transfer.items.add(entry.file));
    inputRef.current.files = transfer.files;
  }

  function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files);
    const images = incoming.filter((file) => ACCEPTED.includes(file.type));
    const room = MAX_PRODUCT_IMAGES - latest.current.length;
    const accepted = images.slice(0, Math.max(0, room));
    const messages: string[] = [];
    if (images.length < incoming.length) messages.push('Only JPEG, PNG and WebP photographs can be added.');
    if (images.length > accepted.length) messages.push(`A product can have up to ${MAX_PRODUCT_IMAGES} photographs.`);
    setNotice(messages.length > 0 ? messages.join(' ') : null);
    if (accepted.length === 0) return;

    const added: Entry[] = accepted.map((file) => {
      counter.current += 1;
      return { id: counter.current, file, url: URL.createObjectURL(file) };
    });
    const next = [...latest.current, ...added];
    latest.current = next;
    setEntries(next);
    if (primaryId === null && next[0]) setPrimaryId(next[0].id);
    syncInput(next);
  }

  function remove(id: number) {
    const removed = latest.current.find((entry) => entry.id === id);
    if (removed) URL.revokeObjectURL(removed.url);
    const next = latest.current.filter((entry) => entry.id !== id);
    latest.current = next;
    setEntries(next);
    if (primaryId === id) setPrimaryId(next[0]?.id ?? null);
    setNotice(null);
    syncInput(next);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
  }

  const primaryIndex = entries.findIndex((entry) => entry.id === primaryId);

  return (
    <section className="grid gap-4" aria-labelledby="photos-heading">
      <div>
        <h2 id="photos-heading" className="font-display text-xl text-burgundy">Product photographs</h2>
        <p className="text-sm text-ink-muted">
          Optional. JPEG, PNG or WebP, up to 5 MB each, up to {MAX_PRODUCT_IMAGES} per product. The primary photograph appears on catalogue cards.
          Photographs are saved after the product, so a failed upload does not remove it.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        name="images"
        accept={ACCEPTED.join(',')}
        multiple
        className="sr-only"
        id="product-photos"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          if (event.target.files && event.target.files.length > 0) addFiles(event.target.files);
        }}
      />
      <input type="hidden" name="primaryIndex" value={primaryIndex >= 0 ? String(primaryIndex) : ''} />

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`grid gap-3 rounded-card border-2 border-dashed p-5 text-center text-sm ${dragging ? 'border-gold bg-gold/10' : 'border-line bg-cream/40'}`}
      >
        <p className="text-ink-muted">Drag photographs here, or</p>
        <div>
          <label
            htmlFor="product-photos"
            className="inline-flex cursor-pointer rounded-control bg-burgundy px-4 py-2 font-semibold text-cream hover:bg-burgundy-deep"
          >
            Choose photographs
          </label>
        </div>
      </div>

      {notice ? <p role="alert" className="text-sm text-danger">{notice}</p> : null}

      {entries.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Chosen photographs">
          {entries.map((entry, index) => (
            <li key={entry.id} className="grid gap-2 rounded-control border border-line bg-white p-2">
              <img src={entry.url} alt={`Preview ${index + 1}: ${entry.file.name}`} className="aspect-square w-full rounded-control object-cover" />
              <p className="truncate text-xs text-ink-muted" title={entry.file.name}>{entry.file.name}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="flex items-center gap-1.5 font-semibold text-ink">
                  <input
                    type="radio"
                    name="primaryChoice"
                    checked={entry.id === primaryId}
                    onChange={() => setPrimaryId(entry.id)}
                    className="accent-burgundy"
                  />
                  Primary
                </label>
                <button type="button" onClick={() => remove(entry.id)} className="ml-auto text-danger underline">
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
