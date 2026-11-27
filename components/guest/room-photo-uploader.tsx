'use client';

import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, ImagePlus, UploadCloud } from 'lucide-react';
import { MAX_BYTES, BUCKETS } from '@/lib/storage/image-policy';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const BROWSER_TARGET_BYTES = 4 * 1024 * 1024;
const LONG_EDGE_PX = 2400;

const ROOM_TYPES = [
  'Living room',
  'Bedroom',
  'Bathroom',
  'Kitchen',
  'Dining room',
  'Entrance',
  'Hallway',
  'Balcony',
  'Commercial interior',
];

export interface UploadablePhoto {
  id: string;
  label: string;
}

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

export function RoomPhotoUploader({ storeSlug, photos }: { storeSlug: string; photos: UploadablePhoto[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [label, setLabel] = useState('Living room');
  const [replaces, setReplaces] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function fail(text: string) {
    setProgress(null);
    setMessage({ ok: false, text });
  }

  function pickFile(file: File | null) {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      return fail('Use a JPEG, PNG or WebP photograph.');
    }
    if (file.size > MAX_BYTES[BUCKETS.privatePhotos]!) {
      return fail('That photograph is larger than 8 MB. Choose a smaller one.');
    }
    setMessage(null);
    setSelectedFile(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    pickFile(file);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = selectedFile ?? inputRef.current?.files?.[0] ?? cameraRef.current?.files?.[0];
    if (!file) return fail('Choose or drop a room photograph to upload.');

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
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
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
          setSelectedFile(null);
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
          setReplaces('');
          if (inputRef.current) inputRef.current.value = '';
          if (cameraRef.current) cameraRef.current.value = '';
          setMessage({ ok: true, text: json.warning ?? 'Room photograph uploaded securely.' });
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
    <form onSubmit={submit} className="grid gap-4 rounded-card border border-line bg-card p-5 shadow-rest">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Step 1</p>
          <h2 className="font-display text-xl text-burgundy">Upload Your Room</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-control border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-cream"
          >
            <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
            Choose file
          </button>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-control border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-cream md:hidden"
          >
            <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            Take photo
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        className="hidden"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        className="hidden"
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        className={`grid cursor-pointer place-items-center rounded-card border-2 border-dashed p-5 text-center transition ${
          isDragging ? 'border-burgundy bg-burgundy/5' : 'border-line bg-cream/60 hover:border-gold'
        }`}
      >
        {previewUrl ? (
          <div className="grid gap-2">
            <img src={previewUrl} alt="Selected room preview" className="mx-auto max-h-56 rounded-control object-contain shadow-rest" />
            <p className="text-xs font-medium text-burgundy">
              {selectedFile?.name} — click or drop another file to change
            </p>
          </div>
        ) : (
          <div className="grid place-items-center gap-2 py-4">
            <UploadCloud className="h-8 w-8 text-burgundy" aria-hidden="true" />
            <p className="text-sm font-medium text-ink">Drag & drop a room photograph here, or click to browse</p>
            <p className="text-xs text-ink-muted">JPEG, PNG or WebP up to 8 MB · Private to your browser session</p>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold text-ink">
          Room type / label
          <select
            value={ROOM_TYPES.includes(label) ? label : 'Custom'}
            onChange={(e) => setLabel(e.target.value === 'Custom' ? '' : e.target.value)}
            className="rounded-control border border-line bg-white px-3 py-2 text-sm font-normal"
          >
            {ROOM_TYPES.map((rt) => (
              <option key={rt} value={rt}>{rt}</option>
            ))}
            <option value="Custom">Custom label…</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-ink">
          Room name (optional)
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            placeholder="e.g. Master bathroom, Living room"
            className="rounded-control border border-line bg-white px-3 py-2 text-sm font-normal"
          />
        </label>
        {photos.length > 0 ? (
          <label className="grid gap-1 text-xs font-semibold text-ink sm:col-span-2">
            Replace an existing photograph (optional)
            <select value={replaces} onChange={(e) => setReplaces(e.target.value)} className="rounded-control border border-line bg-white px-3 py-2 text-sm font-normal">
              <option value="">Add as a new room photograph</option>
              {photos.map((p, i) => (
                <option key={p.id} value={p.id}>{p.label || `Photograph ${i + 1}`}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {progress !== null ? (
        <div className="grid gap-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-cream">
            <div className="h-full bg-burgundy transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-ink-muted">Uploading photograph… {progress}%</p>
        </div>
      ) : null}

      {message ? (
        <p role="status" className={`text-xs font-medium ${message.ok ? 'text-emerald-800' : 'text-danger'}`}>
          {message.text}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!selectedFile || progress !== null}
          className="rounded-control bg-burgundy px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-burgundy-deep disabled:opacity-50"
        >
          {progress !== null ? 'Uploading…' : 'Upload room photograph'}
        </button>
      </div>
    </form>
  );
}
