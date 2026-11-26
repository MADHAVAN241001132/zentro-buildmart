/** Pure image rules shared by the server upload path and the tests. No I/O here. */

export const BUCKETS = {
  catalogue: 'catalogue-images',
  branding: 'store-branding',
  privatePhotos: 'private-photos',
} as const;

export const PUBLIC_BUCKETS: readonly string[] = [BUCKETS.catalogue, BUCKETS.branding];

export type UploadKind = 'product' | 'category' | 'brand' | 'logo' | 'banner' | 'refund_photo' | 'room_photo';

/** Each kind lives in exactly one bucket. The database enforces the same pairs. */
export const KIND_BUCKET: Record<UploadKind, string> = {
  product: BUCKETS.catalogue,
  category: BUCKETS.catalogue,
  brand: BUCKETS.catalogue,
  logo: BUCKETS.branding,
  banner: BUCKETS.branding,
  refund_photo: BUCKETS.privatePhotos,
  room_photo: BUCKETS.privatePhotos,
};

const KIND_FOLDER: Record<UploadKind, string> = {
  product: 'products',
  category: 'categories',
  brand: 'brands',
  logo: 'branding',
  banner: 'branding',
  refund_photo: 'refund-photos',
  room_photo: 'room-photos',
};

export const MAX_BYTES: Record<string, number> = {
  [BUCKETS.catalogue]: 5 * 1024 * 1024,
  [BUCKETS.branding]: 5 * 1024 * 1024,
  [BUCKETS.privatePhotos]: 8 * 1024 * 1024,
};

export const MAX_PRODUCT_IMAGES = 8;
export const MAX_FILES_PER_UPLOAD = 8;
export const SIGNED_URL_SECONDS = 300;

export interface SniffedImage {
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  ext: 'jpg' | 'png' | 'webp';
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...Array.from(bytes.slice(from, to)));
}

/**
 * Identifies the image format from its leading bytes. The declared file type is never trusted.
 * Only JPEG, PNG and WebP are accepted; SVG and HTML are refused because they can carry scripts.
 */
export function sniffImage(head: Uint8Array): SniffedImage | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (head.length >= 8 && png.every((b, i) => head[i] === b)) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (head.length >= 12 && ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

export type UploadCheck = { ok: true; image: SniffedImage } | { ok: false; error: string };

export function validateImageUpload(input: { bucket: string; size: number; head: Uint8Array }): UploadCheck {
  if (input.size <= 0) return { ok: false, error: 'The file is empty.' };
  const limit = MAX_BYTES[input.bucket];
  if (limit === undefined) return { ok: false, error: 'This upload destination is not available.' };
  if (input.size > limit) return { ok: false, error: `The file is larger than ${limit / (1024 * 1024)} MB.` };
  const image = sniffImage(input.head);
  if (!image) return { ok: false, error: 'Only JPEG, PNG and WebP images are accepted.' };
  return { ok: true, image };
}

/** Object path: "<store_id>/<folder>/<random id>.<ext>". The original file name is never used. */
export function buildObjectPath(storeId: string, kind: UploadKind, image: SniffedImage, id: string): string {
  return `${storeId}/${KIND_FOLDER[kind]}/${id}.${image.ext}`;
}

const STORE_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-z-]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

/** True only for a path that a store upload could have produced, under the given store. */
export function isStorePath(path: string, storeId: string): boolean {
  return STORE_PATH.test(path) && path.startsWith(`${storeId}/`);
}
