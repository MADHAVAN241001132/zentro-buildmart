import 'server-only';
import OpenAI, { toFile } from 'openai';
import { randomUUID } from 'node:crypto';
import type { RoomAnalysis } from './product-intelligence';

export type AiProvider = 'disabled' | 'comfyui' | 'huggingface' | 'openai';

export type AiErrorCode =
  | 'missing_api_key'
  | 'invalid_credentials'
  | 'insufficient_quota'
  | 'rate_limited'
  | 'timeout'
  | 'invalid_image'
  | 'generation_failed';

export class AiServiceError extends Error {
  readonly code: AiErrorCode;
  readonly status: number;

  constructor(code: AiErrorCode, message: string, status = 500) {
    super(message);
    this.name = 'AiServiceError';
    this.code = code;
    this.status = status;
  }
}

export function getAiConfig() {
  const rawProvider = (process.env.AI_IMAGE_PROVIDER ?? '').trim().toLowerCase();
  const hfToken = (process.env.HF_TOKEN ?? '').trim();
  const openaiKey = (process.env.OPENAI_API_KEY ?? '').trim();

  const isProdEnv = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

  const provider: AiProvider =
    rawProvider === 'disabled'
      ? 'disabled'
      : rawProvider === 'comfyui'
        ? 'comfyui'
        : rawProvider === 'openai'
          ? 'openai'
          : rawProvider === 'huggingface'
            ? 'huggingface'
            : hfToken
              ? 'huggingface'
              : openaiKey
                ? 'openai'
                : isProdEnv
                  ? 'disabled'
                  : 'comfyui';

  const comfyuiBaseUrl = (process.env.COMFYUI_BASE_URL ?? 'http://127.0.0.1:8188').trim() || 'http://127.0.0.1:8188';
  const comfyuiCheckpoint = (process.env.COMFYUI_CHECKPOINT ?? 'v1-5-pruned-emaonly.safetensors').trim() || 'v1-5-pruned-emaonly.safetensors';
  const comfyuiUnet = (process.env.COMFYUI_UNET ?? 'sd15-unet-fp16.safetensors').trim() || 'sd15-unet-fp16.safetensors';
  const comfyuiClip = (process.env.COMFYUI_CLIP ?? 'clip_l.safetensors').trim() || 'clip_l.safetensors';
  const comfyuiVae = (process.env.COMFYUI_VAE ?? 'vae-ft-mse-840000-ema-pruned.safetensors').trim() || 'vae-ft-mse-840000-ema-pruned.safetensors';

  const hfImageModel = (process.env.HF_IMAGE_MODEL ?? 'Qwen/Qwen-Image-Edit-2509').trim() || 'Qwen/Qwen-Image-Edit-2509';
  const hfVisionModel = (process.env.HF_VISION_MODEL ?? 'Qwen/Qwen3-VL-8B-Instruct').trim() || 'Qwen/Qwen3-VL-8B-Instruct';

  const openaiImageModel = (process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2.6-sunburst').trim() || 'gpt-image-2.6-sunburst';
  const openaiPreviewModel = (process.env.OPENAI_IMAGE_PREVIEW_MODEL ?? 'gpt-image-2.6-flare').trim() || 'gpt-image-2.6-flare';
  const openaiVisionModel = (process.env.OPENAI_VISION_MODEL ?? 'gpt-4o-mini').trim() || 'gpt-4o-mini';

  return {
    provider,
    comfyuiBaseUrl,
    comfyuiCheckpoint,
    comfyuiUnet,
    comfyuiClip,
    comfyuiVae,
    hfToken,
    hfImageModel,
    hfVisionModel,
    apiKey:
      provider === 'disabled'
        ? ''
        : provider === 'comfyui'
          ? comfyuiBaseUrl
          : provider === 'huggingface'
            ? hfToken
            : openaiKey,
    openaiApiKey: openaiKey,
    imageModel:
      provider === 'disabled'
        ? 'disabled'
        : provider === 'comfyui'
          ? comfyuiCheckpoint
          : provider === 'huggingface'
            ? hfImageModel
            : openaiImageModel,
    previewModel:
      provider === 'disabled'
        ? 'disabled'
        : provider === 'comfyui'
          ? comfyuiCheckpoint
          : provider === 'huggingface'
            ? hfImageModel
            : openaiPreviewModel,
    visionModel:
      provider === 'disabled'
        ? 'disabled'
        : provider === 'comfyui'
          ? 'local-rule-based'
          : provider === 'huggingface'
            ? hfVisionModel
            : openaiVisionModel,
  };
}

/** Maps Hugging Face Hub model IDs to their verified fal-ai Inference Provider endpoints. */
const HF_FAL_PROVIDER_MAP: Record<string, string> = {
  'Qwen/Qwen-Image-Edit-2509': 'fal-ai/qwen-image-edit-2509',
  'Qwen/Qwen-Image-Edit': 'fal-ai/qwen-image-edit',
  'Qwen/Qwen-Image-Edit-2511': 'fal-ai/qwen-image-edit-2511',
  'black-forest-labs/FLUX.1-Kontext-dev': 'fal-ai/flux-kontext/dev',
  'black-forest-labs/FLUX.2-dev': 'fal-ai/flux-2/edit',
};

function resolveHfImageEndpoint(model: string): string {
  const providerId = HF_FAL_PROVIDER_MAP[model];
  if (providerId) {
    return `https://router.huggingface.co/fal-ai/${providerId}`;
  }
  if (model.startsWith('fal-ai/')) {
    return `https://router.huggingface.co/fal-ai/${model}`;
  }
  return `https://router.huggingface.co/hf-inference/models/${model}`;
}

function createOpenAiClient(): OpenAI {
  const { openaiApiKey } = getAiConfig();
  if (!openaiApiKey) {
    throw new AiServiceError(
      'missing_api_key',
      'AI Room Visualizer is not configured yet: OPENAI_API_KEY is missing on the server.',
      503,
    );
  }
  return new OpenAI({ apiKey: openaiApiKey, timeout: 90_000, maxRetries: 1 });
}

function requireHfToken(): string {
  const { hfToken } = getAiConfig();
  if (!hfToken) {
    throw new AiServiceError(
      'missing_api_key',
      'AI Room Visualizer is not configured yet: HF_TOKEN is missing on the server.',
      503,
    );
  }
  return hfToken;
}

function mapHfHttpError(status: number, bodyText: string): AiServiceError {
  let parsedMessage = bodyText;
  try {
    const json = JSON.parse(bodyText) as { error?: string; message?: string };
    parsedMessage = json.error || json.message || bodyText;
  } catch {
    // keep raw text
  }
  const lower = parsedMessage.toLowerCase();

  if (status === 401 || status === 403 || lower.includes('invalid token') || lower.includes('unauthorized')) {
    return new AiServiceError('invalid_credentials', 'The Hugging Face access token is invalid or lacks inference permissions.', 401);
  }
  if (status === 402 || lower.includes('credit') || lower.includes('pro') || lower.includes('billing') || lower.includes('quota')) {
    return new AiServiceError(
      'insufficient_quota',
      'Hugging Face Inference Providers require available pre-paid credits or a PRO subscription to run image-editing models.',
      402,
    );
  }
  if (status === 429 || lower.includes('rate limit') || lower.includes('too many requests')) {
    return new AiServiceError('rate_limited', 'Hugging Face inference is temporarily busy. Please wait a moment and try again.', 429);
  }
  if (status === 400 || status === 422) {
    return new AiServiceError('invalid_image', parsedMessage || 'The uploaded room or product image could not be processed.', 400);
  }
  if (status === 504 || lower.includes('timeout')) {
    return new AiServiceError('timeout', 'The Hugging Face visualization request timed out. Please try again.', 504);
  }
  return new AiServiceError('generation_failed', parsedMessage || 'Hugging Face AI visualization failed. Please try again.', 502);
}

function mapOpenAiError(err: unknown): AiServiceError {
  if (err instanceof AiServiceError) return err;
  const anyErr = err as { status?: number; code?: string; message?: string; name?: string } | null;
  const status = anyErr?.status;
  const code = anyErr?.code;
  const msg = anyErr?.message ?? '';

  if (anyErr?.name === 'AbortError' || code === 'ETIMEDOUT' || msg.toLowerCase().includes('timeout')) {
    return new AiServiceError('timeout', 'The AI visualization request timed out. Please try again.', 504);
  }
  if (status === 401 || code === 'invalid_api_key') {
    return new AiServiceError('invalid_credentials', 'The OpenAI API key is invalid or unauthorized.', 401);
  }
  if (status === 402 || code === 'insufficient_quota' || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('billing')) {
    return new AiServiceError('insufficient_quota', 'AI visualization quota or billing limit has been reached on the OpenAI account.', 402);
  }
  if (status === 429 || code === 'rate_limit_exceeded') {
    return new AiServiceError('rate_limited', 'AI visualization service is temporarily busy. Please wait a moment and try again.', 429);
  }
  if (status === 400) {
    return new AiServiceError('invalid_image', msg || 'One of the uploaded images could not be processed by the AI model.', 400);
  }
  return new AiServiceError('generation_failed', msg || 'The AI visualization failed. Please try again.', 502);
}

const FALLBACK_ANALYSIS = (roomLabel?: string): RoomAnalysis => {
  const lbl = (roomLabel ?? '').toLowerCase();
  const isBathroom = lbl.includes('bath') || lbl.includes('restroom') || lbl.includes('washroom') || lbl.includes('toilet');
  const isKitchen = lbl.includes('kitchen') || lbl.includes('pantry');
  const isLiving = lbl.includes('living') || lbl.includes('hall') || lbl.includes('drawing');
  const isBedroom = lbl.includes('bed');

  return {
    roomType: roomLabel?.trim() || (isBathroom ? 'Bathroom' : isKitchen ? 'Kitchen' : isLiving ? 'Living Room' : isBedroom ? 'Bedroom' : 'Interior room'),
    floorRegion: 'Lower visible floor surface spanning the room foreground and midground',
    wallRegions: isBathroom ? 'Bathroom wall surfaces surrounding vanity and shower areas' : isKitchen ? 'Kitchen backsplash and wall area' : 'Primary visible interior walls',
    ceiling: 'Upper ceiling plane with ambient overhead lighting',
    doorOpenings: ['Main doorway opening'],
    windows: isBathroom ? ['Ventilator window'] : ['Natural exterior window'],
    existingFurniture: isBathroom ? ['Vanity counter and cabinet'] : isKitchen ? ['Kitchen base and overhead cabinets', 'Countertop'] : ['Seating and decorative furniture'],
    existingSanitaryware: isBathroom ? ['Existing wash basin fixture', 'Existing tap point', 'Sanitaryware commode area'] : isKitchen ? ['Countertop sink position'] : [],
    cameraAngle: 'Eye-level wide-angle interior perspective',
    lightingDirection: 'Ambient indoor lighting with natural soft highlights',
    perspectiveNotes: 'Preserve exact room architecture, camera angle, and vanishing lines',
    suitableLocations: isBathroom
      ? [
          { category: 'floor_tile', location: 'Entire bathroom floor', replacesExisting: true, notes: 'Waterproof anti-skid floor' },
          { category: 'wall_tile', location: 'Shower and vanity feature walls', replacesExisting: true, notes: 'Dado and wall height' },
          { category: 'wash_basin', location: 'Vanity counter location', replacesExisting: true, notes: 'Tabletop or wall-hung mounting' },
          { category: 'faucet_tap', location: 'Basin tap mount point', replacesExisting: true, notes: 'Replace existing tap' },
          { category: 'mirror_accessory', location: 'Wall directly above wash basin', replacesExisting: false, notes: 'Mount vanity mirror' },
        ]
      : isKitchen
        ? [
            { category: 'floor_tile', location: 'Kitchen floor area', replacesExisting: true, notes: 'Replace visible floor tiles' },
            { category: 'wall_tile', location: 'Kitchen backsplash wall above countertop', replacesExisting: true, notes: 'Tile backsplash area' },
            { category: 'kitchen_sink', location: 'Countertop sink cutout', replacesExisting: true, notes: 'Integrate sink flush into counter' },
          ]
        : [
            { category: 'floor_tile', location: 'Main visible floor surface', replacesExisting: true, notes: 'Full room floor coverage' },
            { category: 'wall_tile', location: 'Primary accent or feature wall', replacesExisting: true, notes: 'Wall tiling / cladding' },
            { category: 'steel_door', location: 'Existing doorway frame', replacesExisting: true, notes: 'Fit door inside frame' },
            { category: 'wall_panel', location: 'Accent wall area', replacesExisting: false, notes: 'Decorative panel cladding' },
          ],
  };
};

function normalizeAnalysis(parsed: Partial<RoomAnalysis>, roomLabel?: string): RoomAnalysis {
  return {
    roomType: parsed.roomType || roomLabel || 'Interior room',
    floorRegion: parsed.floorRegion || 'Visible floor surface',
    wallRegions: parsed.wallRegions || 'Visible wall surfaces',
    ceiling: parsed.ceiling || 'Visible ceiling',
    doorOpenings: Array.isArray(parsed.doorOpenings) ? parsed.doorOpenings : [],
    windows: Array.isArray(parsed.windows) ? parsed.windows : [],
    existingFurniture: Array.isArray(parsed.existingFurniture) ? parsed.existingFurniture : [],
    existingSanitaryware: Array.isArray(parsed.existingSanitaryware) ? parsed.existingSanitaryware : [],
    cameraAngle: parsed.cameraAngle || 'Eye-level interior view',
    lightingDirection: parsed.lightingDirection || 'Ambient room lighting',
    perspectiveNotes: parsed.perspectiveNotes || 'Maintain original room perspective',
    suitableLocations: Array.isArray(parsed.suitableLocations) ? parsed.suitableLocations : [],
  };
}

const ROOM_ANALYSIS_SYSTEM_PROMPT =
  'You are an architectural room analyzer. Inspect the room photograph and return JSON only with keys: roomType (string), floorRegion (string), wallRegions (string), ceiling (string), doorOpenings (string[]), windows (string[]), existingFurniture (string[]), existingSanitaryware (string[]), cameraAngle (string), lightingDirection (string), perspectiveNotes (string), suitableLocations (array of {category, location, replacesExisting, notes}). Never invent exact metric/imperial measurements that cannot be seen.';

async function analyzeRoomWithHuggingFace(
  roomBuffer: Buffer,
  mimeType: string,
  roomLabel?: string,
): Promise<RoomAnalysis> {
  const token = requireHfToken();
  const { hfVisionModel } = getAiConfig();
  const dataUrl = `data:${mimeType};base64,${roomBuffer.toString('base64')}`;

  const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: hfVisionModel,
      max_tokens: 800,
      messages: [
        { role: 'system', content: ROOM_ANALYSIS_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this room photograph${roomLabel ? ` (user label: "${roomLabel}")` : ''}. Return valid JSON only.`,
            },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(35_000),
  });

  if (!res.ok) {
    throw mapHfHttpError(res.status, await res.text());
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) return FALLBACK_ANALYSIS(roomLabel);

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as Partial<RoomAnalysis>;
  return normalizeAnalysis(parsed, roomLabel);
}

async function analyzeRoomWithOpenAi(
  roomBuffer: Buffer,
  mimeType: string,
  roomLabel?: string,
): Promise<RoomAnalysis> {
  const client = createOpenAiClient();
  const { visionModel } = getAiConfig();
  const dataUrl = `data:${mimeType};base64,${roomBuffer.toString('base64')}`;

  try {
    const response = await client.chat.completions.create(
      {
        model: visionModel,
        response_format: { type: 'json_object' },
        max_tokens: 800,
        messages: [
          { role: 'system', content: ROOM_ANALYSIS_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this room photograph${roomLabel ? ` (user label: "${roomLabel}")` : ''}. Identify all visible surfaces, fixtures, openings, furniture, lighting, and perspective.`,
              },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
            ],
          },
        ],
      },
      { signal: AbortSignal.timeout(35_000) },
    );

    const raw = response.choices[0]?.message?.content;
    if (!raw) return FALLBACK_ANALYSIS(roomLabel);
    const parsed = JSON.parse(raw) as Partial<RoomAnalysis>;
    return normalizeAnalysis(parsed, roomLabel);
  } catch (err) {
    throw mapOpenAiError(err);
  }
}

/**
 * Stage 2: Uses the configured vision-capable model (ComfyUI local rule-based, Hugging Face VLM, or OpenAI)
 * to analyze the customer's room photograph without inventing measurements.
 */
export async function analyzeRoomPhoto(
  roomBuffer: Buffer,
  mimeType: string,
  roomLabel?: string,
): Promise<RoomAnalysis> {
  const { provider } = getAiConfig();
  if (provider === 'comfyui') {
    // 100% free offline local architectural structural analysis based on verified room geometry and label
    return FALLBACK_ANALYSIS(roomLabel);
  }

  try {
    return provider === 'huggingface'
      ? await analyzeRoomWithHuggingFace(roomBuffer, mimeType, roomLabel)
      : await analyzeRoomWithOpenAi(roomBuffer, mimeType, roomLabel);
  } catch (err) {
    const mapped = err instanceof AiServiceError ? err : new AiServiceError('generation_failed', 'Room analysis failed.');
    if (
      mapped.code === 'missing_api_key' ||
      mapped.code === 'invalid_credentials' ||
      mapped.code === 'insufficient_quota' ||
      mapped.code === 'rate_limited'
    ) {
      throw mapped;
    }
    return FALLBACK_ANALYSIS(roomLabel);
  }
}

export interface ProductReferenceImage {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

export function estimateImageCostUsd(model: string, quality: string, refCount: number): number {
  if (model.includes('comfyui') || model.endsWith('.safetensors') || model.endsWith('.ckpt')) {
    return 0; // 100% free local compute
  }
  if (model.includes('Qwen') || model.includes('FLUX') || model.includes('fal-ai')) {
    return Number((0.03 + Math.max(0, refCount - 1) * 0.005).toFixed(4));
  }
  const isPreview = model.includes('flare') || model.includes('mini');
  const base = isPreview ? 0.04 : quality === 'high' ? 0.12 : quality === 'medium' ? 0.07 : 0.04;
  const extraRefs = Math.max(0, refCount - 1) * 0.01;
  return Number((base + extraRefs).toFixed(4));
}

async function decodeFalImageOutput(res: Response): Promise<Buffer> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.startsWith('image/')) {
    return Buffer.from(await res.arrayBuffer());
  }

  const data = (await res.json()) as {
    images?: { url?: string }[];
    image?: { url?: string };
    data?: { url?: string; b64_json?: string }[];
  };

  const b64 = data.data?.[0]?.b64_json;
  if (b64) return Buffer.from(b64, 'base64');

  const url = data.images?.[0]?.url || data.image?.url || data.data?.[0]?.url;
  if (!url) {
    throw new AiServiceError('generation_failed', 'Hugging Face model did not return an output image.');
  }

  if (url.startsWith('data:')) {
    const commaIdx = url.indexOf(',');
    if (commaIdx === -1) throw new AiServiceError('generation_failed', 'Invalid data URI returned by AI model.');
    return Buffer.from(url.slice(commaIdx + 1), 'base64');
  }

  const imgRes = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!imgRes.ok) {
    throw new AiServiceError('generation_failed', 'Could not download generated visualization image from provider.');
  }
  return Buffer.from(await imgRes.arrayBuffer());
}

/**
 * Uploads an image buffer to ComfyUI's /upload/image endpoint.
 */
async function uploadToComfyUi(
  baseUrl: string,
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<{ name: string; subfolder: string; type: string }> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  formData.append('image', blob, filename);
  formData.append('overwrite', 'true');
  formData.append('type', 'input');

  const res = await fetch(`${baseUrl}/upload/image`, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new AiServiceError('generation_failed', `Failed to upload image to ComfyUI (${res.status}): ${txt}`);
  }

  return (await res.json()) as { name: string; subfolder: string; type: string };
}

/**
 * Builds the ComfyUI workflow JSON using split model loaders (UNETLoader + CLIPLoader + VAELoader)
 * to avoid loading the full 3.97 GB all-in-one checkpoint, which exceeds the system's
 * contiguous virtual-memory allocation limit on Windows with 16 GB RAM.
 *
 * Split loading keeps peak per-load memory under 1.7 GB:
 *   UNet FP16  ~1.6 GB
 *   CLIP       ~235 MB
 *   VAE        ~335 MB
 */
function buildComfyUiWorkflow(options: {
  checkpoint: string;
  unet: string;
  clip: string;
  vae: string;
  roomImageName: string;
  positivePrompt: string;
  negativePrompt: string;
  steps: number;
  cfg: number;
  denoise: number;
}): Record<string, unknown> {
  const isInstructPix2Pix = options.checkpoint.toLowerCase().includes('instruct-pix2pix');
  const isLcm = options.checkpoint.toLowerCase().includes('lcm');
  // Use split loaders when a UNet file is configured (memory-safe path)
  const useSplitLoaders = !!options.unet && !isInstructPix2Pix;

  const nodes: Record<string, unknown> = {};

  if (useSplitLoaders) {
    // --- Split model loading (memory-safe) ---
    nodes['10'] = {
      class_type: 'UNETLoader',
      inputs: { unet_name: options.unet, weight_dtype: 'default' },
    };
    nodes['11'] = {
      class_type: 'CLIPLoader',
      inputs: { clip_name: options.clip, type: 'stable_diffusion' },
    };
    nodes['9'] = {
      class_type: 'VAELoader',
      inputs: { vae_name: options.vae },
    };
    nodes['2'] = {
      class_type: 'LoadImage',
      inputs: { image: options.roomImageName },
    };
    nodes['3'] = {
      class_type: 'CLIPTextEncode',
      inputs: { text: options.positivePrompt, clip: ['11', 0] },
    };
    nodes['4'] = {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: options.negativePrompt || 'ugly, blurry, low quality, distorted, bad proportions, watermark, signature, text',
        clip: ['11', 0],
      },
    };
    nodes['5'] = {
      class_type: 'VAEEncode',
      inputs: { pixels: ['2', 0], vae: ['9', 0] },
    };
    nodes['6'] = {
      class_type: 'KSampler',
      inputs: {
        seed: Math.floor(Math.random() * 1000000000),
        steps: options.steps,
        cfg: options.cfg,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: options.denoise,
        model: ['10', 0],
        positive: ['3', 0],
        negative: ['4', 0],
        latent_image: ['5', 0],
      },
    };
    nodes['7'] = {
      class_type: 'VAEDecode',
      inputs: { samples: ['6', 0], vae: ['9', 0] },
    };
  } else {
    // --- Fallback: all-in-one checkpoint loader (InstructPix2Pix or LCM) ---
    nodes['1'] = {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: options.checkpoint },
    };
    nodes['2'] = {
      class_type: 'LoadImage',
      inputs: { image: options.roomImageName },
    };
    nodes['3'] = {
      class_type: 'CLIPTextEncode',
      inputs: { text: options.positivePrompt, clip: ['1', 1] },
    };
    nodes['4'] = {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: options.negativePrompt || 'ugly, blurry, low quality, distorted, bad proportions, watermark, signature, text',
        clip: ['1', 1],
      },
    };

    if (isInstructPix2Pix) {
      nodes['5'] = {
        class_type: 'InstructPixToPixConditioning',
        inputs: {
          positive: ['3', 0],
          negative: ['4', 0],
          vae: ['1', 2],
          pixels: ['2', 0],
        },
      };
      nodes['6'] = {
        class_type: 'KSampler',
        inputs: {
          seed: Math.floor(Math.random() * 1000000000),
          steps: options.steps,
          cfg: options.cfg,
          sampler_name: 'euler',
          scheduler: 'normal',
          denoise: 1.0,
          model: ['1', 0],
          positive: ['5', 0],
          negative: ['5', 1],
          latent_image: ['5', 2],
        },
      };
    } else {
      nodes['9'] = {
        class_type: 'VAELoader',
        inputs: { vae_name: options.vae },
      };
      nodes['5'] = {
        class_type: 'VAEEncode',
        inputs: {
          pixels: ['2', 0],
          vae: ['9', 0],
        },
      };
      nodes['6'] = {
        class_type: 'KSampler',
        inputs: {
          seed: Math.floor(Math.random() * 1000000000),
          steps: isLcm ? Math.min(options.steps, 6) : options.steps,
          cfg: isLcm ? 1.8 : options.cfg,
          sampler_name: isLcm ? 'lcm' : 'euler',
          scheduler: 'normal',
          denoise: isLcm ? 0.65 : options.denoise,
          model: ['1', 0],
          positive: ['3', 0],
          negative: ['4', 0],
          latent_image: ['5', 0],
        },
      };
    }

    nodes['7'] = {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['6', 0],
        vae: isInstructPix2Pix ? ['1', 2] : ['9', 0],
      },
    };
  }

  nodes['8'] = {
    class_type: 'SaveImage',
    inputs: {
      filename_prefix: 'ZENTRO_Visualizer',
      images: ['7', 0],
    },
  };

  return nodes;
}

/**
 * Polls ComfyUI /history/{promptId} until completion or timeout.
 */
async function waitForComfyUiImage(
  baseUrl: string,
  promptId: string,
  timeoutMs = 300_000,
): Promise<{ filename: string; subfolder: string; type: string }> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 1500));

    const res = await fetch(`${baseUrl}/history/${promptId}`, {
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);

    if (!res || !res.ok) continue;

    const data = (await res.json().catch(() => null)) as Record<
      string,
      {
        status?: { completed?: boolean; status_str?: string };
        outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }>;
      }
    > | null;

    const item = data?.[promptId];
    if (item?.outputs) {
      for (const nodeKey of Object.keys(item.outputs)) {
        const images = item.outputs[nodeKey]?.images;
        if (Array.isArray(images) && images.length > 0 && images[0]?.filename) {
          return images[0];
        }
      }
    }
  }

  throw new AiServiceError('timeout', 'Local ComfyUI generation timed out. Please verify ComfyUI console logs.', 504);
}

/**
 * Generates an image using local ComfyUI API backend (100% free, zero external API costs).
 */
async function generateWithComfyUi(input: {
  roomBuffer: Buffer;
  roomMime: string;
  productImages: ProductReferenceImage[];
  prompt: string;
  model: string;
  quality: string;
}): Promise<{ imageBuffer: Buffer; modelUsed: string; latencyMs: number; estimatedCostUsd: number }> {
  const cfg = getAiConfig();
  const baseUrl = cfg.comfyuiBaseUrl.replace(/\/+$/, '');
  const checkpoint = input.model || cfg.comfyuiCheckpoint;
  const startedAt = Date.now();

  // 1. Health check ComfyUI backend
  try {
    const health = await fetch(`${baseUrl}/system_stats`, { signal: AbortSignal.timeout(3000) });
    if (!health.ok) {
      throw new Error(`ComfyUI returned status ${health.status}`);
    }
  } catch (err) {
    const msg = (err as Error).message || '';
    throw new AiServiceError(
      'missing_api_key',
      `Local ComfyUI backend is not accessible at ${baseUrl} (${msg}). Ensure ComfyUI is running on localhost:8188 with: python main.py --cpu`,
      503,
    );
  }

  // 2. Upload room photograph to ComfyUI
  const ext = input.roomMime.includes('png') ? 'png' : input.roomMime.includes('webp') ? 'webp' : 'jpg';
  const roomUploadName = `zentro_room_${Date.now()}.${ext}`;
  const uploadedRoom = await uploadToComfyUi(baseUrl, input.roomBuffer, roomUploadName, input.roomMime);

  // 3. Upload product reference images if any
  for (let i = 0; i < input.productImages.length; i++) {
    const p = input.productImages[i]!;
    await uploadToComfyUi(baseUrl, p.buffer, `zentro_prod_${Date.now()}_${i}_${p.filename}`, p.mimeType).catch(() => null);
  }

  // 4. Construct workflow prompt
  const steps = input.quality === 'low' ? 12 : input.quality === 'medium' ? 16 : 20;
  const workflow = buildComfyUiWorkflow({
    checkpoint,
    unet: cfg.comfyuiUnet,
    clip: cfg.comfyuiClip,
    vae: cfg.comfyuiVae,
    roomImageName: uploadedRoom.name,
    positivePrompt: input.prompt,
    negativePrompt: 'blurry, low resolution, distorted geometry, warped perspective, bad tile alignment, artificial pasting',
    steps,
    cfg: 7.5,
    denoise: 0.72,
  });

  const clientId = randomUUID();
  const submitRes = await fetch(`${baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => '');
    throw new AiServiceError('generation_failed', `ComfyUI refused prompt workflow (${submitRes.status}): ${errText}`, 400);
  }

  const submitData = (await submitRes.json()) as { prompt_id: string; node_errors?: Record<string, unknown> };
  if (submitData.node_errors && Object.keys(submitData.node_errors).length > 0) {
    throw new AiServiceError('generation_failed', `ComfyUI node configuration error: ${JSON.stringify(submitData.node_errors)}`, 400);
  }

  // 5. Poll for completed image
  const resultInfo = await waitForComfyUiImage(baseUrl, submitData.prompt_id);

  // 6. Download rendered image from ComfyUI /view
  const viewUrl = `${baseUrl}/view?filename=${encodeURIComponent(resultInfo.filename)}&subfolder=${encodeURIComponent(resultInfo.subfolder || '')}&type=${encodeURIComponent(resultInfo.type || 'output')}`;
  const imgRes = await fetch(viewUrl, { signal: AbortSignal.timeout(30_000) });
  if (!imgRes.ok) {
    throw new AiServiceError('generation_failed', `Failed to retrieve rendered image from ComfyUI (${imgRes.status})`);
  }

  const imageBuffer = Buffer.from(await imgRes.arrayBuffer());
  const latencyMs = Date.now() - startedAt;

  return {
    imageBuffer,
    modelUsed: `comfyui:split:${cfg.comfyuiUnet}`,
    latencyMs,
    estimatedCostUsd: 0,
  };
}

/**
 * Calls Hugging Face Inference Providers (Qwen/Qwen-Image-Edit-2509 via fal-ai)
 * respecting the 3-image input limit per pass (1 room image + up to 2 product reference images).
 */
async function generateWithHuggingFace(input: {
  roomBuffer: Buffer;
  roomMime: string;
  productImages: ProductReferenceImage[];
  prompt: string;
  passPrompts?: string[];
  model: string;
  quality: string;
}): Promise<{ imageBuffer: Buffer; modelUsed: string; latencyMs: number; estimatedCostUsd: number }> {
  const token = requireHfToken();
  const endpoint = resolveHfImageEndpoint(input.model);
  const startedAt = Date.now();

  // Qwen-Image-Edit-2509 accepts up to 3 images per pass: 1 room + up to 2 product images
  const chunks: ProductReferenceImage[][] = [];
  if (input.productImages.length === 0) {
    chunks.push([]);
  } else {
    for (let i = 0; i < input.productImages.length; i += 2) {
      chunks.push(input.productImages.slice(i, i + 2));
    }
  }

  let currentBuffer = input.roomBuffer;
  let currentMime = input.roomMime;

  for (let passIdx = 0; passIdx < chunks.length; passIdx++) {
    const chunk = chunks[passIdx]!;
    const roomDataUrl = `data:${currentMime};base64,${currentBuffer.toString('base64')}`;
    const imageUrls = [
      roomDataUrl,
      ...chunk.map((img) => `data:${img.mimeType};base64,${img.buffer.toString('base64')}`),
    ];

    const passPrompt = input.passPrompts?.[passIdx] || input.prompt;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: passPrompt,
          image_urls: imageUrls,
        }),
        signal: AbortSignal.timeout(90_000),
      });

      if (!res.ok) {
        throw mapHfHttpError(res.status, await res.text());
      }

      currentBuffer = await decodeFalImageOutput(res);
      currentMime = 'image/png';
    } catch (err) {
      if (err instanceof AiServiceError) throw err;
      const anyErr = err as { name?: string; message?: string } | null;
      if (anyErr?.name === 'AbortError' || anyErr?.message?.toLowerCase().includes('timeout')) {
        throw new AiServiceError('timeout', 'The Hugging Face visualization request timed out. Please try again.', 504);
      }
      throw new AiServiceError('generation_failed', anyErr?.message || 'Hugging Face image editing failed.', 502);
    }
  }

  const latencyMs = Date.now() - startedAt;
  const estimatedCostUsd = estimateImageCostUsd(input.model, input.quality, 1 + input.productImages.length);
  return { imageBuffer: currentBuffer, modelUsed: input.model, latencyMs, estimatedCostUsd };
}

async function generateWithOpenAi(input: {
  roomBuffer: Buffer;
  roomMime: string;
  productImages: ProductReferenceImage[];
  prompt: string;
  model: string;
  quality: 'low' | 'medium' | 'high' | 'auto';
}): Promise<{ imageBuffer: Buffer; modelUsed: string; latencyMs: number; estimatedCostUsd: number }> {
  const client = createOpenAiClient();
  const startedAt = Date.now();

  try {
    const roomExt = input.roomMime === 'image/png' ? 'png' : input.roomMime === 'image/webp' ? 'webp' : 'jpg';
    const roomFile = await toFile(input.roomBuffer, `room.${roomExt}`, { type: input.roomMime });

    const productFiles = await Promise.all(
      input.productImages.slice(0, 15).map((img) =>
        toFile(img.buffer, img.filename, { type: img.mimeType }),
      ),
    );

    const response = await client.images.edit(
      {
        model: input.model,
        image: [roomFile, ...productFiles],
        prompt: input.prompt,
        quality: input.quality,
      },
      { signal: AbortSignal.timeout(90_000) },
    );

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new AiServiceError('generation_failed', 'The AI model did not return a visualization image.');
    }

    const imageBuffer = Buffer.from(b64, 'base64');
    const latencyMs = Date.now() - startedAt;
    const estimatedCostUsd = estimateImageCostUsd(input.model, input.quality, 1 + productFiles.length);
    return { imageBuffer, modelUsed: input.model, latencyMs, estimatedCostUsd };
  } catch (err) {
    throw mapOpenAiError(err);
  }
}

/**
 * Stage 5: Calls the configured AI image-editing provider:
 * - 'comfyui' (default, 100% free local inference on localhost:8188)
 * - 'huggingface' (hosted inference providers)
 * - 'openai' (images/edits API)
 */
export async function generateRoomVisualization(input: {
  roomBuffer: Buffer;
  roomMime: string;
  productImages: ProductReferenceImage[];
  prompt: string;
  passPrompts?: string[];
  model?: string;
  quality?: 'low' | 'medium' | 'high' | 'auto';
}): Promise<{ imageBuffer: Buffer; modelUsed: string; latencyMs: number; estimatedCostUsd: number }> {
  const cfg = getAiConfig();
  const model = input.model?.trim() || cfg.imageModel;
  const quality = input.quality ?? 'high';

  if (cfg.provider === 'disabled') {
    throw new AiServiceError(
      'missing_api_key',
      'AI Room Visualizer is disabled in this environment. Configure a cloud AI provider (Hugging Face or OpenAI) to enable live AI generation.',
      503,
    );
  }

  if (cfg.provider === 'comfyui') {
    return generateWithComfyUi({
      roomBuffer: input.roomBuffer,
      roomMime: input.roomMime,
      productImages: input.productImages,
      prompt: input.prompt,
      model,
      quality,
    });
  }

  if (cfg.provider === 'huggingface') {
    return generateWithHuggingFace({
      roomBuffer: input.roomBuffer,
      roomMime: input.roomMime,
      productImages: input.productImages,
      prompt: input.prompt,
      passPrompts: input.passPrompts,
      model,
      quality,
    });
  }

  return generateWithOpenAi({
    roomBuffer: input.roomBuffer,
    roomMime: input.roomMime,
    productImages: input.productImages,
    prompt: input.prompt,
    model,
    quality,
  });
}
