import { NextResponse } from 'next/server';
import { z } from 'zod';
import { appUrl } from '@/lib/env';
import { qrPng, targetUrl, type QrTarget } from '@/lib/qr';
import { trackedEntryUrl } from '@/lib/qr/entry';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getStoreBySlug } from '@/lib/services/storefront';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  target: z.enum(['showroom', 'category', 'product']).default('showroom'),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60).optional(),
  size: z.coerce.number().int().min(200).max(1200).default(600),
  download: z.enum(['0', '1']).optional(),
});

/**
 * Public QR PNG for the showroom, a category or a product. The code encodes a tracked entry link (/q/{token}),
 * so scans of newly downloaded codes are recorded. Only active stores and public targets produce an image.
 * Earlier printed codes that point at the storefront directly keep working and are not counted.
 */
export async function GET(request: Request, { params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: 'invalid parameters' }, { status: 400 });
  const { target, slug, size, download } = parsed.data;

  const store = await getStoreBySlug(storeSlug);
  if (!store) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const admin = createSupabaseAdminClient();
  let qrTarget: QrTarget;
  let targetId: string | null = null;
  if (target === 'showroom') {
    qrTarget = { type: 'showroom' };
  } else {
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
    if (target === 'category') {
      const { data } = await admin.from('categories').select('id').eq('store_id', store.id).eq('slug', slug).eq('is_active', true).maybeSingle();
      if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
      targetId = data.id as string;
      qrTarget = { type: 'category', slug };
    } else {
      const { data } = await admin.from('products').select('id').eq('store_id', store.id).eq('slug', slug).eq('status', 'active').eq('visibility', 'public').maybeSingle();
      if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
      targetId = data.id as string;
      qrTarget = { type: 'product', slug };
    }
  }

  const publicUrl = targetUrl(storeSlug, qrTarget);
  const { data: token, error } = await admin.rpc('zb_ensure_qr_code', {
    p_store: store.id,
    p_type: qrTarget.type,
    p_target: targetId,
    p_public_url: publicUrl,
  });
  if (error || typeof token !== 'string') return NextResponse.json({ error: 'The code could not be prepared.' }, { status: 500 });

  const png = await qrPng(trackedEntryUrl(appUrl(), token), size);
  const name = `${storeSlug}-${target}${slug ? `-${slug}` : ''}.png`;
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
      ...(download === '1' ? { 'Content-Disposition': `attachment; filename="${name}"` } : {}),
    },
  });
}
