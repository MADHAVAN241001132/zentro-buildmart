'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { MAX_BYTES, BUCKETS } from '@/lib/storage/image-policy';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
/** Hosting refuses request bodies above about 4.5 MB, so larger photos are scaled down in the browser first. */
const BROWSER_TARGET_BYTES = 4 * 1024 * 1024;
const LONG_EDGE_PX = 2400;

export interface UploadablePhoto {
  id: string;
  label: string;
}

/** Scales a photograph down to a long edge of LONG_EDGE_PX and re-encodes as JPEG. Returns the file unchanged when it is already small. */
async function fitForUpload(file: File): Promise<File> {
  if (file.size <= BROWSER_TARGET_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LONG_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot prepare the photograph. Try a smaller file.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob) throw new Error('This photograph could not be prepared. Try a smaller file.');
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

/**
 * Uploads a room photograph with a progress bar. Can replace an existing photograph; the server stores the new
 * one before removing the old one. Errors are shown in words, next to the form.
 */
export function RoomPhotoUploader({ storeSlug, photos }: { storeSlug: string; photos: UploadablePhoto[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState('');
  const [replaces, setReplaces] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function fail(text: string) {
    setProgress(null);
    setMessage({ ok: false, text });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return fail('Choose a photograph to upload.');
    if (!ACCEPTED.includes(file.type)) return fail('Use a JPEG, PNG or WebP photograph.');
    if (file.size > MAX_BYTES[BUCKETS.privatePhotos]!) return fail('That photograph is larger than 8 MB. Choose a smaller one.');

    setMessage(null);
    setProgress(0);
    let upload: File;
    try {
      upload = await fitForUpload(file);
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'The photograph could not be prepared.');
    }

    const body = new FormData();
    body.append('file', upload);
    body.append('label', label.trim().slice(0, 80));
    if (replaces) body.append('replaces', replaces);

    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/store/${storeSlug}/visualizer/upload`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onerror = () => {
        fail('The upload failed because of a network problem. Check your connection and try again.');
        resolve();
      };
      xhr.onload = () => {
        let json: { ok?: boolean; error?: string; warning?: string } = {};
        try {
          json = JSON.parse(xhr.responseText);
        } catch {
          json = {};
        }
        if (xhr.status >= 200 && xhr.status < 300 && json.ok) {
          setProgress(null);
          setLabel('');
          setReplaces('');
          if (inputRef.current) inputRef.current.value = '';
          setMessage({ ok: true, text: json.warning ?? 'Photograph saved.' });
          router.refresh();
        } else {
          fail(json.error ?? 'The photograph could not be uploaded. Try again.');
        }
        resolve();
      };
      xhr.send(body);
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-card border border-line bg-card p-4" aria-describedby="upload-help">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold text-ink">
          Room photograph
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="text-sm font-normal" />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-ink">
          Name for this room (optional)
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="Living room, east wall" className="rounded-control border border-line bg-cream px-3 py-2 text-sm font-normal" />
        </label>
        {photos.length > 0 ? (
          <label className="grid gap-1 text-sm font-semibold text-ink sm:col-span-2">
            Replace an existing photograph (optional)
            <select value={replaces} onChange={(e) => setReplaces(e.target.value)} className="rounded-control border border-line bg-cream px-3 py-2 text-sm font-normal">
              <option value="">Keep existing photographs</option>
              {photos.map((p) => (
                <option key={p.id} value={p.id}>{p.label || 'Untitled photograph'}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <p id="upload-help" className="text-xs text-ink-muted">
        JPEG, PNG or WebP. Large photographs are reduced in your browser before upload. You can keep up to six photographs.
      </p>
      {progress !== null ? (
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Upload progress" className="h-2 w-full overflow-hidden rounded-full bg-line">
          <div className="h-full bg-burgundy transition-all" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={progress !== null} className="rounded-control bg-burgundy px-4 py-2.5 text-sm font-semibold text-cream disabled:opacity-60">
          {progress !== null ? `Uploading ${progress}%` : replaces ? 'Upload and replace' : 'Upload photograph'}
        </button>
        <p role="status" aria-live="polite" className={`text-sm ${message?.ok === false ? 'text-danger' : 'text-success'}`}>{message?.text ?? ''}</p>
      </div>
    </form>
  );
}
