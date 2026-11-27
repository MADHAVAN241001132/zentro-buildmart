import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { EntitlementError, isFeatureEnabled } from '@/lib/services/entitlements';
import { readGuestSession } from '@/lib/services/guest';
import { getStoreBySlug } from '@/lib/services/storefront';
import { deleteAiVisualization, runAiVisualization } from '@/lib/services/ai-visualizer';
import { AiServiceError } from '@/lib/visualizer/ai-service';

export const maxDuration = 120;

const requestSchema = z.object({
  sourcePhotoId: z.string().uuid('Invalid room photograph ID'),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        variantId: z.string().uuid(),
        installationLocation: z.string().max(160).nullable().optional(),
      }),
    )
    .min(1, 'Select at least one product')
    .max(10, 'Maximum 10 products per visualization'),
  usePreviewModel: z.boolean().optional(),
  forceRegenerate: z.boolean().optional(),
  consentAccepted: z.boolean(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ storeSlug: string }> },
) {
  const { storeSlug } = await context.params;
  const store = await getStoreBySlug(storeSlug);
  if (!store) {
    return NextResponse.json({ ok: false, error: 'Store not found.' }, { status: 404 });
  }

  // Strict Feature Flag enforcement on backend before any processing
  if (!(await isFeatureEnabled(store.id, 'room_visualiser'))) {
    return NextResponse.json(
      { ok: false, code: 'feature_disabled', error: 'The Room Visualizer is not enabled for this store.' },
      { status: 403 },
    );
  }

  const session = await readGuestSession(store.id, storeSlug);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: 'Upload a room photograph first to start a visualization session.' },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid visualization request.' },
      { status: 400 },
    );
  }

  try {
    const result = await runAiVisualization({
      storeId: store.id,
      guestSessionId: session.id,
      sourcePhotoId: parsed.data.sourcePhotoId,
      items: parsed.data.items,
      usePreviewModel: parsed.data.usePreviewModel,
      forceRegenerate: parsed.data.forceRegenerate,
      consentAccepted: parsed.data.consentAccepted,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof EntitlementError) {
      return NextResponse.json({ ok: false, code: err.code, error: err.message }, { status: 403 });
    }
    if (err instanceof AiServiceError) {
      return NextResponse.json({ ok: false, code: err.code, error: err.message }, { status: err.status });
    }
    return NextResponse.json({ ok: false, error: 'Unexpected error generating visualization.' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ storeSlug: string }> },
) {
  const { storeSlug } = await context.params;
  const store = await getStoreBySlug(storeSlug);
  if (!store) return NextResponse.json({ ok: false, error: 'Store not found.' }, { status: 404 });
  if (!(await isFeatureEnabled(store.id, 'room_visualiser'))) {
    return NextResponse.json({ ok: false, error: 'Room Visualizer is disabled.' }, { status: 403 });
  }
  const session = await readGuestSession(store.id, storeSlug);
  if (!session) return NextResponse.json({ ok: false, error: 'Session not found.' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: 'Invalid visualization ID.' }, { status: 400 });
  }

  const deleted = await deleteAiVisualization(store.id, session.id, id);
  return NextResponse.json({ ok: deleted });
}
