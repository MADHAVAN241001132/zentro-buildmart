import { NextResponse } from 'next/server';
import { getStoreBySlug } from '@/lib/services/storefront';
import { ensureGuestSession } from '@/lib/services/guest';
import { addRoomPhoto, removeRoomPhoto } from '@/lib/services/guest-photos';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Uploads one room photograph for the guest session. Optionally replaces an earlier photograph: the new one is
 * stored first, then the old one is removed, so a failed upload never removes the old photograph.
 * Ownership is enforced by the database functions, which check the guest session and store on every call.
 */
export async function POST(request: Request, { params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  if (!/^[a-z0-9-]{3,40}$/.test(storeSlug)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  // Cross-site form posts are refused. The session cookie is also SameSite=Lax, which is a second line of defence.
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    } catch {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }
  }

  const store = await getStoreBySlug(storeSlug);
  if (!store) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'The upload could not be read. Try a smaller photograph.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Choose a photograph to upload.' }, { status: 400 });
  const label = typeof form.get('label') === 'string' ? String(form.get('label')) : '';
  const replacesValue = form.get('replaces');
  const replaces = typeof replacesValue === 'string' && UUID.test(replacesValue) ? replacesValue : null;

  const session = await ensureGuestSession(store.id, storeSlug);
  const added = await addRoomPhoto(store.id, session.id, file, label);
  if (!added.ok) return NextResponse.json({ error: added.error }, { status: 422 });

  if (replaces) {
    const removed = await removeRoomPhoto(store.id, session.id, replaces);
    if (!removed.ok) {
      return NextResponse.json({ ok: true, photoId: added.value.photoId, warning: 'The new photograph was saved, but the old one could not be removed.' });
    }
  }
  return NextResponse.json({ ok: true, photoId: added.value.photoId });
}
