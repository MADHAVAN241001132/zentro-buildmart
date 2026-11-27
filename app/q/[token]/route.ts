import { NextResponse } from 'next/server';
import { resolvePublicOrigin, targetUrl } from '@/lib/qr';
import { isEntryToken } from '@/lib/qr/entry';
import { ensureGuestSession } from '@/lib/services/guest';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOT_ACTIVE = () => new Response('This QR code is not active.', { status: 404, headers: { 'Cache-Control': 'no-store' } });

/**
 * Tracked QR entry. Records one entry for the guest session (refreshes inside the dedupe window are not counted),
 * then sends the visitor to the storefront page for the code's target. Ordinary storefront visits never pass here.
 * A recording failure does not block the visitor.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isEntryToken(token)) return NOT_ACTIVE();

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('zb_qr_entry_target', { p_token: token });
  const target = (Array.isArray(data) ? data[0] : data) as
    | { store_id: string; store_slug: string; target_type: 'showroom' | 'category' | 'product'; target_slug: string | null }
    | undefined;
  if (error || !target) return NOT_ACTIVE();

  const session = await ensureGuestSession(target.store_id, target.store_slug);
  const { error: recordError } = await admin.rpc('zb_record_qr_entry', { p_token: token, p_session: session.id });
  if (recordError) console.error('qr entry not recorded', recordError.code);

  const origin = resolvePublicOrigin(_request);
  const location =
    target.target_type === 'showroom'
      ? targetUrl(target.store_slug, { type: 'showroom' }, origin)
      : target.target_slug
        ? targetUrl(target.store_slug, { type: target.target_type, slug: target.target_slug }, origin)
        : null;
  if (!location) return NOT_ACTIVE();

  return NextResponse.redirect(location, { status: 302, headers: { 'Cache-Control': 'no-store' } });
}
