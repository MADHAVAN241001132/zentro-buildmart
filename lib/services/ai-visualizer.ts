import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { Json } from '@/types/database';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { assertFeature } from '@/lib/services/entitlements';
import { getProductDetailsByIds } from '@/lib/services/storefront';
import { BUCKETS, SIGNED_URL_SECONDS, isStorePath, sniffImage } from '@/lib/storage/image-policy';
import {
  analyzeRoomPhoto,
  generateRoomVisualization,
  getAiConfig,
  AiServiceError,
  type ProductReferenceImage,
} from '@/lib/visualizer/ai-service';
import {
  buildVisualizationPrompt,
  classifyProduct,
  detectProductConflicts,
  isSupportedForVisualization,
  type ProductPromptInput,
  type RoomAnalysis,
} from '@/lib/visualizer/product-intelligence';

export interface StoreAiSettings {
  storeId: string;
  monthlyLimit: number;
  dailyLimit: number;
  guestSessionDailyLimit: number;
  defaultModel: string;
  previewModel: string;
  imageQuality: 'low' | 'medium' | 'high' | 'auto';
}

export interface SelectedVisualizationItem {
  productId: string;
  variantId: string;
  installationLocation?: string | null;
}

export interface VisualizationRunResult {
  visualizationId: string;
  generatedUrl: string;
  originalUrl: string;
  roomAnalysis: RoomAnalysis;
  modelUsed: string;
  imageQuality: string;
  latencyMs: number;
  estimatedCostUsd: number;
  cached: boolean;
  warnings: string[];
}

function defaultSettings(storeId: string): StoreAiSettings {
  const cfg = getAiConfig();
  return {
    storeId,
    monthlyLimit: 100,
    dailyLimit: 20,
    guestSessionDailyLimit: 10,
    defaultModel: cfg.imageModel,
    previewModel: cfg.previewModel,
    imageQuality: 'high',
  };
}

export async function getStoreAiSettings(storeId: string): Promise<StoreAiSettings> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('ai_visualizer_store_settings')
    .select('*')
    .eq('store_id', storeId)
    .maybeSingle();

  if (error || !data) return defaultSettings(storeId);
  return {
    storeId,
    monthlyLimit: typeof data.monthly_limit === 'number' ? data.monthly_limit : 100,
    dailyLimit: typeof data.daily_limit === 'number' ? data.daily_limit : 20,
    guestSessionDailyLimit: typeof data.guest_session_daily_limit === 'number' ? data.guest_session_daily_limit : 10,
    defaultModel: typeof data.default_model === 'string' && data.default_model ? data.default_model : getAiConfig().imageModel,
    previewModel: typeof data.preview_model === 'string' && data.preview_model ? data.preview_model : getAiConfig().previewModel,
    imageQuality: (['low', 'medium', 'high', 'auto'].includes(String(data.image_quality))
      ? data.image_quality
      : 'high') as StoreAiSettings['imageQuality'],
  };
}

/** Downloads an image only if it is hosted on our configured Supabase project URL. */
async function fetchTrustedProductImage(url: string, filenameBase: string): Promise<ProductReferenceImage | null> {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  if (!supabaseUrl || !url.startsWith(supabaseUrl)) return null;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    const buffer = Buffer.from(arr);
    if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) return null;
    const sniffed = sniffImage(new Uint8Array(buffer.subarray(0, 16)));
    if (!sniffed) return null;
    return {
      buffer,
      mimeType: sniffed.mime,
      filename: `${filenameBase}.${sniffed.ext}`,
    };
  } catch {
    return null;
  }
}

function buildConfigHash(input: {
  sourcePhotoId: string;
  items: SelectedVisualizationItem[];
  model: string;
  quality: string;
}): string {
  const normalized = [...input.items]
    .sort((a, b) => a.productId.localeCompare(b.productId))
    .map((i) => `${i.productId}:${i.variantId}:${i.installationLocation ?? ''}`);
  return createHash('sha256')
    .update(JSON.stringify({ photo: input.sourcePhotoId, items: normalized, model: input.model, quality: input.quality }))
    .digest('hex');
}

export async function runAiVisualization(input: {
  storeId: string;
  guestSessionId: string;
  sourcePhotoId: string;
  items: SelectedVisualizationItem[];
  usePreviewModel?: boolean;
  forceRegenerate?: boolean;
  consentAccepted: boolean;
}): Promise<VisualizationRunResult> {
  // 1. Strict Feature Flag check before any storage/AI spend
  await assertFeature(input.storeId, 'room_visualiser');

  if (!input.consentAccepted) {
    throw new AiServiceError('invalid_image', 'Please confirm AI processing consent before generating a visualization.', 400);
  }
  if (input.items.length === 0) {
    throw new AiServiceError('invalid_image', 'Select at least one compatible product to visualize.', 400);
  }

  const admin = createSupabaseAdminClient();

  // 2. Verify guest owns the source room photo within this store
  const { data: photoRow, error: photoErr } = await admin
    .from('guest_room_photos')
    .select('id, upload_id, label')
    .eq('id', input.sourcePhotoId)
    .eq('store_id', input.storeId)
    .eq('guest_session_id', input.guestSessionId)
    .maybeSingle();

  if (photoErr || !photoRow) {
    throw new AiServiceError('invalid_image', 'The selected room photograph was not found for this session.', 404);
  }

  const { data: uploadRow } = await admin
    .from('storage_uploads')
    .select('bucket_id, object_path')
    .eq('id', photoRow.upload_id)
    .eq('store_id', input.storeId)
    .maybeSingle();

  if (
    !uploadRow ||
    uploadRow.bucket_id !== BUCKETS.privatePhotos ||
    !isStorePath(uploadRow.object_path as string, input.storeId)
  ) {
    throw new AiServiceError('invalid_image', 'The room photograph storage reference is invalid.', 404);
  }

  const { data: originalSigned } = await admin.storage
    .from(BUCKETS.privatePhotos)
    .createSignedUrl(uploadRow.object_path as string, SIGNED_URL_SECONDS);

  // 3. Load actual store catalogue products (strict store isolation)
  const productIds = Array.from(new Set(input.items.map((i) => i.productId)));
  const details = await getProductDetailsByIds(input.storeId, productIds);
  const byId = new Map(details.map((d) => [d.id, d]));

  const unsupportedNames: string[] = [];
  const supportedItems: { item: SelectedVisualizationItem; detail: (typeof details)[number] }[] = [];

  for (const item of input.items) {
    const detail = byId.get(item.productId);
    if (!detail) continue;
    const cat = classifyProduct({ name: detail.name, categoryName: detail.categoryName, application: detail.application });
    if (!isSupportedForVisualization(cat)) {
      unsupportedNames.push(detail.name);
      continue;
    }
    supportedItems.push({ item, detail });
  }

  if (supportedItems.length === 0) {
    throw new AiServiceError(
      'invalid_image',
      unsupportedNames.length > 0
        ? `Direct room visualization is unavailable for installation consumables/tools (${unsupportedNames.join(', ')}). Select tiles, doors, sanitaryware, or fixtures instead.`
        : 'None of the selected products were found in this store.',
      400,
    );
  }

  const conflicts = detectProductConflicts(
    supportedItems.map(({ item, detail }) => ({
      productId: detail.id,
      name: detail.name,
      category: classifyProduct({ name: detail.name, categoryName: detail.categoryName, application: detail.application }),
      location: item.installationLocation,
    })),
  );
  const warnings = [
    ...unsupportedNames.map((n) => `Skipped "${n}" (installation consumable/tool not suitable for room preview).`),
    ...conflicts.map((c) => c.message),
  ];

  // 4. Settings, model selection & cache lookup
  const cfg = getAiConfig();
  const settings = await getStoreAiSettings(input.storeId);
  const rawModel = input.usePreviewModel ? settings.previewModel : settings.defaultModel;
  const isLegacyOpenAiModel = rawModel.startsWith('gpt-image-');
  const modelToUse =
    cfg.provider === 'comfyui'
      ? (rawModel.endsWith('.safetensors') ? rawModel : cfg.comfyuiCheckpoint)
      : cfg.provider === 'huggingface' && (!rawModel || isLegacyOpenAiModel)
        ? cfg.hfImageModel
        : rawModel || cfg.imageModel;
  const quality = settings.imageQuality;
  const configHash = buildConfigHash({
    sourcePhotoId: input.sourcePhotoId,
    items: supportedItems.map((s) => s.item),
    model: modelToUse,
    quality,
  });

  if (!input.forceRegenerate) {
    const { data: cached } = await admin
      .from('ai_visualizer_sessions')
      .select('id, generated_path, room_analysis, model_used, image_quality, latency_ms, estimated_cost_usd')
      .eq('store_id', input.storeId)
      .eq('source_photo_id', input.sourcePhotoId)
      .eq('config_hash', configHash)
      .eq('status', 'completed')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached?.generated_path) {
      const { data: cachedSigned } = await admin.storage
        .from(BUCKETS.privatePhotos)
        .createSignedUrl(cached.generated_path as string, SIGNED_URL_SECONDS);
      if (cachedSigned?.signedUrl && originalSigned?.signedUrl) {
        return {
          visualizationId: cached.id as string,
          generatedUrl: cachedSigned.signedUrl,
          originalUrl: originalSigned.signedUrl,
          roomAnalysis: cached.room_analysis as unknown as RoomAnalysis,
          modelUsed: (cached.model_used as string) || modelToUse,
          imageQuality: (cached.image_quality as string) || quality,
          latencyMs: (cached.latency_ms as number) || 0,
          estimatedCostUsd: Number(cached.estimated_cost_usd ?? 0),
          cached: true,
          warnings,
        };
      }
    }
  }

  // 5. Enforce store & guest session rate/quota limits
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const [dailyRes, monthlyRes, guestDailyRes] = await Promise.all([
    admin
      .from('ai_visualizer_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', input.storeId)
      .eq('status', 'completed')
      .gte('created_at', startOfDay.toISOString()),
    admin
      .from('ai_visualizer_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', input.storeId)
      .eq('status', 'completed')
      .gte('created_at', startOfMonth.toISOString()),
    admin
      .from('ai_visualizer_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', input.storeId)
      .eq('guest_session_id', input.guestSessionId)
      .eq('status', 'completed')
      .gte('created_at', startOfDay.toISOString()),
  ]);

  if (!dailyRes.error && (dailyRes.count ?? 0) >= settings.dailyLimit) {
    throw new AiServiceError('rate_limited', 'This showroom has reached its daily AI visualization limit. Please try again tomorrow.', 429);
  }
  if (!monthlyRes.error && (monthlyRes.count ?? 0) >= settings.monthlyLimit) {
    throw new AiServiceError('insufficient_quota', 'This showroom has reached its monthly AI visualization allowance.', 429);
  }
  if (!guestDailyRes.error && (guestDailyRes.count ?? 0) >= settings.guestSessionDailyLimit) {
    throw new AiServiceError('rate_limited', 'You have reached the daily AI visualization limit for this session.', 429);
  }

  // 6. Download original room photograph buffer from private Supabase storage
  const { data: roomBlob, error: dlErr } = await admin.storage
    .from(BUCKETS.privatePhotos)
    .download(uploadRow.object_path as string);
  if (dlErr || !roomBlob) {
    throw new AiServiceError('invalid_image', 'Could not read the uploaded room photograph.', 500);
  }
  const roomBuffer = Buffer.from(await roomBlob.arrayBuffer());
  const sniffedRoom = sniffImage(new Uint8Array(roomBuffer.subarray(0, 16)));
  if (!sniffedRoom) {
    throw new AiServiceError('invalid_image', 'The uploaded room photograph format is not supported.', 400);
  }

  // 7. Download product reference photos (primary + additional up to 15 total)
  const productImages: ProductReferenceImage[] = [];
  const promptInputs: ProductPromptInput[] = [];

  for (const { item, detail } of supportedItems) {
    const variant = detail.variants.find((v) => v.id === item.variantId) ?? detail.variants[0];
    const photoUrls = detail.photos.map((p) => p.url).filter(Boolean);
    if (photoUrls.length === 0 && detail.imageUrl) photoUrls.push(detail.imageUrl);

    // Allow up to 2 reference angles per product while staying within 15 total
    const maxForThisProduct = Math.min(2, Math.max(0, 15 - productImages.length));
    let attachedCount = 0;
    for (let idx = 0; idx < photoUrls.length && attachedCount < maxForThisProduct; idx++) {
      const img = await fetchTrustedProductImage(photoUrls[idx]!, `prod-${detail.sku}-${idx + 1}`);
      if (img) {
        productImages.push(img);
        attachedCount++;
      }
    }

    promptInputs.push({
      productId: detail.id,
      variantId: variant?.id ?? item.variantId,
      name: detail.name,
      categoryName: detail.categoryName,
      brand: detail.brand,
      sku: variant?.sku ?? detail.sku,
      variantLabel: variant?.label ?? 'Standard',
      sizeLabel: variant?.sizeLabel ?? null,
      material: detail.material,
      colour: detail.colour,
      finish: detail.finish,
      application: detail.application,
      specs: detail.specs,
      installationLocation: item.installationLocation,
      referenceImageCount: attachedCount,
    });
  }

  const visualizationId = randomUUID();
  let roomAnalysis: RoomAnalysis | null = null;
  let prompt = '';

  try {
    // Stage 2: AI Room Analysis
    const analysis = await analyzeRoomPhoto(roomBuffer, sniffedRoom.mime, (photoRow.label as string) ?? undefined);
    roomAnalysis = analysis;

    // Stage 4: Dynamic Architectural Prompt Generation
    prompt = buildVisualizationPrompt({ roomAnalysis: analysis, products: promptInputs });

    // Build per-pass prompts when Hugging Face multi-pass editing is needed (>2 product images)
    let passPrompts: string[] | undefined;
    if (cfg.provider === 'huggingface' && productImages.length > 2) {
      const passChunks: ProductPromptInput[][] = [];
      let currentChunk: ProductPromptInput[] = [];
      let currentRefCount = 0;
      for (const pi of promptInputs) {
        const imgsForItem = Math.max(1, pi.referenceImageCount);
        if (currentChunk.length > 0 && currentRefCount + imgsForItem > 2) {
          passChunks.push(currentChunk);
          currentChunk = [];
          currentRefCount = 0;
        }
        currentChunk.push(pi);
        currentRefCount += imgsForItem;
      }
      if (currentChunk.length > 0) passChunks.push(currentChunk);

      const installedSoFar: string[] = [];
      passPrompts = passChunks.map((chunk, idx) => {
        const p = buildVisualizationPrompt({
          roomAnalysis: analysis,
          products: chunk,
          passContext: {
            passNumber: idx + 1,
            totalPasses: passChunks.length,
            previouslyInstalledNames: [...installedSoFar],
          },
        });
        installedSoFar.push(...chunk.map((c) => c.name));
        return p;
      });
    }

    // Stage 5: AI Photorealistic Image Editing (Hugging Face / OpenAI)
    const generated = await generateRoomVisualization({
      roomBuffer,
      roomMime: sniffedRoom.mime,
      productImages,
      prompt,
      passPrompts,
      model: modelToUse,
      quality,
    });

    // Save generated image in private storage (never public catalogue bucket)
    const generatedPath = `${input.storeId}/ai-visualizations/${visualizationId}.png`;
    const { error: upErr } = await admin.storage
      .from(BUCKETS.privatePhotos)
      .upload(generatedPath, generated.imageBuffer, { contentType: 'image/png', upsert: false });

    if (upErr) {
      throw new AiServiceError('generation_failed', 'Generated visualization could not be saved securely.', 500);
    }

    const { data: genSigned } = await admin.storage
      .from(BUCKETS.privatePhotos)
      .createSignedUrl(generatedPath, SIGNED_URL_SECONDS);

    // Persist session record (best-effort if migration 0063 not applied yet)
    await admin.from('ai_visualizer_sessions').insert({
      id: visualizationId,
      store_id: input.storeId,
      guest_session_id: input.guestSessionId,
      source_photo_id: input.sourcePhotoId,
      config_hash: configHash,
      room_analysis: roomAnalysis as unknown as Json,
      selected_products: promptInputs as unknown as Json,
      placement_plan: roomAnalysis.suitableLocations as unknown as Json,
      prompt_used: prompt,
      model_used: generated.modelUsed,
      image_quality: quality,
      status: 'completed',
      generated_bucket: BUCKETS.privatePhotos,
      generated_path: generatedPath,
      estimated_cost_usd: generated.estimatedCostUsd,
      latency_ms: generated.latencyMs,
    });

    return {
      visualizationId,
      generatedUrl: genSigned?.signedUrl ?? '',
      originalUrl: originalSigned?.signedUrl ?? '',
      roomAnalysis,
      modelUsed: generated.modelUsed,
      imageQuality: quality,
      latencyMs: generated.latencyMs,
      estimatedCostUsd: generated.estimatedCostUsd,
      cached: false,
      warnings,
    };
  } catch (err) {
    const aiErr = err instanceof AiServiceError ? err : new AiServiceError('generation_failed', 'AI visualization failed.');
    await admin.from('ai_visualizer_sessions').insert({
      id: visualizationId,
      store_id: input.storeId,
      guest_session_id: input.guestSessionId,
      source_photo_id: input.sourcePhotoId,
      config_hash: configHash,
      room_analysis: roomAnalysis as unknown as Json,
      selected_products: promptInputs as unknown as Json,
      prompt_used: prompt || null,
      model_used: modelToUse,
      image_quality: quality,
      status: 'failed',
      error_message: aiErr.message,
    });
    throw aiErr;
  }
}

export async function deleteAiVisualization(
  storeId: string,
  guestSessionId: string,
  visualizationId: string,
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data: row } = await admin
    .from('ai_visualizer_sessions')
    .select('id, generated_path')
    .eq('id', visualizationId)
    .eq('store_id', storeId)
    .eq('guest_session_id', guestSessionId)
    .maybeSingle();

  if (!row) return false;
  if (row.generated_path) {
    await admin.storage.from(BUCKETS.privatePhotos).remove([row.generated_path as string]);
  }
  await admin
    .from('ai_visualizer_sessions')
    .delete()
    .eq('id', visualizationId)
    .eq('store_id', storeId)
    .eq('guest_session_id', guestSessionId);
  return true;
}
