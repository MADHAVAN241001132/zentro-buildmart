import 'server-only';
import { requireEnv } from '@/lib/env';
import type { InvoiceLogo } from '@/lib/invoices/invoice-pdf';

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 4_000;
const PUBLIC_PATH_PREFIX = '/storage/v1/object/public/';

/**
 * Fetches a store logo for the invoice. Only images from this project's public Supabase Storage are fetched,
 * so a stored URL cannot make the server request arbitrary hosts. Any failure returns null and the invoice
 * still prints with the store name in place of the logo.
 */
export async function fetchStoreLogo(logoUrl: string | null): Promise<InvoiceLogo | null> {
  if (!logoUrl) return null;
  let url: URL;
  try {
    url = new URL(logoUrl);
  } catch {
    return null;
  }
  const allowed = new URL(requireEnv('NEXT_PUBLIC_SUPABASE_URL'));
  if (url.protocol !== 'https:' || url.origin !== allowed.origin || !url.pathname.startsWith(PUBLIC_PATH_PREFIX)) {
    return null;
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error', cache: 'no-store' });
    if (!response.ok) return null;
    const length = Number(response.headers.get('content-length') ?? '0');
    if (length > MAX_BYTES) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null;

    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (isPng) return { bytes, kind: 'png' };
    if (isJpg) return { bytes, kind: 'jpg' };
    return null;
  } catch {
    return null;
  }
}
