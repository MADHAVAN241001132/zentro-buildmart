'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Undo2,
  Redo2,
  Download,
  Trash2,
  RefreshCw,
  Sparkles,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { formatINR } from '@/lib/money';
import {
  classifyProduct,
  defaultLocationsForCategory,
  detectProductConflicts,
  isSupportedForVisualization,
  type RoomAnalysis,
} from '@/lib/visualizer/product-intelligence';
import { addVisualizedToCartAction, addVisualizedToProjectAction } from '@/app/store/[storeSlug]/visualizer/actions';

export interface VisualizerProject {
  id: string;
  name: string;
  rooms: { id: string; name: string; roomLabel: string }[];
}

export interface VisualizerVariant {
  id: string;
  label: string;
  sizeLabel: string | null;
  priceUnit: string;
  salePricePaise: number;
  availableUnits: number;
}

export interface VisualizerProduct {
  id: string;
  name: string;
  brand: string | null;
  categoryName: string;
  application?: string | null;
  material?: string | null;
  colour?: string | null;
  finish?: string | null;
  imageUrl: string | null;
  gstRateBps: number;
  variants: VisualizerVariant[];
}

export interface VisualizerPhoto {
  id: string;
  url: string;
  label: string;
}

interface SelectedItem {
  productId: string;
  variantId: string;
  quantity: number;
  installationLocation: string;
}

interface GeneratedVersion {
  visualizationId: string;
  generatedUrl: string;
  originalUrl: string;
  roomAnalysis: RoomAnalysis | null;
  modelUsed: string;
  latencyMs: number;
  cached: boolean;
  warnings: string[];
  itemsSnapshot: SelectedItem[];
}

const PROCESSING_STAGES = [
  'Analyzing your room…',
  'Identifying suitable installation areas…',
  'Understanding your selected products…',
  'Generating realistic visualization…',
  'Preparing your final room preview…',
];

const MAX_QTY = 999;

function clampQty(value: number, available: number): number {
  const cap = Math.max(1, Math.min(MAX_QTY, available));
  return Math.min(cap, Math.max(1, Math.round(value) || 1));
}

function lineMoney(variant: VisualizerVariant, quantity: number, gstRateBps: number) {
  const subtotal = variant.salePricePaise * quantity;
  const gst = Math.round((subtotal * gstRateBps) / 10_000);
  return { subtotal, gst, total: subtotal + gst };
}

export function RoomVisualizer({
  storeSlug,
  photos,
  products,
  projects,
  submissionId,
  canUseProjects = true,
  canUseQuotations = true,
}: {
  storeSlug: string;
  photos: VisualizerPhoto[];
  products: VisualizerProduct[];
  projects: VisualizerProject[];
  submissionId: string;
  canUseProjects?: boolean;
  canUseQuotations?: boolean;
}) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [selected, setSelected] = useState<SelectedItem[]>([]);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  // Filters
  const [category, setCategory] = useState('All');
  const [brandFilter, setBrandFilter] = useState('All');
  const [search, setSearch] = useState('');

  // Generation state & history
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [usePreviewModel, setUsePreviewModel] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [versions, setVersions] = useState<GeneratedVersion[]>([]);
  const [versionIndex, setVersionIndex] = useState(-1);

  // Viewer controls
  const [split, setSplit] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);

  const photo = photos[Math.min(photoIndex, Math.max(0, photos.length - 1))];
  const currentVersion = versionIndex >= 0 ? versions[versionIndex] ?? null : null;

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(products.map((p) => p.categoryName))).sort()],
    [products],
  );
  const brands = useMemo(
    () => ['All', ...Array.from(new Set(products.map((p) => p.brand).filter((b): b is string => Boolean(b)))).sort()],
    [products],
  );

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== 'All' && p.categoryName !== category) return false;
      if (brandFilter !== 'All' && p.brand !== brandFilter) return false;
      if (!q) return true;
      return `${p.name} ${p.brand ?? ''} ${p.categoryName}`.toLowerCase().includes(q);
    });
  }, [products, category, brandFilter, search]);

  useEffect(() => {
    if (!isGenerating) {
      setStageIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setStageIndex((prev) => (prev < PROCESSING_STAGES.length - 1 ? prev + 1 : prev));
    }, 3500);
    return () => clearInterval(timer);
  }, [isGenerating]);

  const conflicts = useMemo(() => {
    return detectProductConflicts(
      selected
        .map((s) => {
          const prod = products.find((p) => p.id === s.productId);
          if (!prod) return null;
          return {
            productId: prod.id,
            name: prod.name,
            category: classifyProduct({ name: prod.name, categoryName: prod.categoryName, application: prod.application }),
            location: s.installationLocation,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    );
  }, [selected, products]);

  function addOrReplaceProduct(product: VisualizerProduct) {
    const firstVariant = product.variants[0];
    if (!firstVariant) return;
    const cat = classifyProduct({ name: product.name, categoryName: product.categoryName, application: product.application });
    if (!isSupportedForVisualization(cat)) return;
    const defaultLoc = defaultLocationsForCategory(cat)[0] ?? 'Appropriate room location';

    setErrorMsg(null);
    if (replaceTargetId) {
      setSelected((prev) =>
        prev.map((item) =>
          item.productId === replaceTargetId
            ? { productId: product.id, variantId: firstVariant.id, quantity: 1, installationLocation: defaultLoc }
            : item,
        ),
      );
      setReplaceTargetId(null);
      return;
    }

    setSelected((prev) => {
      if (prev.some((s) => s.productId === product.id)) return prev;
      return [...prev, { productId: product.id, variantId: firstVariant.id, quantity: 1, installationLocation: defaultLoc }];
    });
  }

  function removeProduct(productId: string) {
    setSelected((prev) => prev.filter((s) => s.productId !== productId));
    if (replaceTargetId === productId) setReplaceTargetId(null);
  }

  function updateItem(productId: string, patch: Partial<SelectedItem>) {
    setSelected((prev) => prev.map((s) => (s.productId === productId ? { ...s, ...patch } : s)));
  }

  async function generateVisualization(forceRegenerate = false, itemsOverride?: SelectedItem[]) {
    if (!photo) return;
    const itemsToUse = itemsOverride ?? selected;
    if (itemsToUse.length === 0) {
      setErrorMsg('Select at least one product before generating an AI visualization.');
      return;
    }
    if (!consentAccepted) {
      setErrorMsg('Please confirm AI image processing consent before generating.');
      return;
    }

    setErrorMsg(null);
    setIsGenerating(true);
    setStageIndex(0);

    try {
      const res = await fetch(`/api/store/${storeSlug}/visualizer/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePhotoId: photo.id,
          items: itemsToUse.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            installationLocation: i.installationLocation,
          })),
          usePreviewModel,
          forceRegenerate,
          consentAccepted,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorMsg(json.error || 'Could not generate AI visualization.');
        return;
      }

      const nextVersion: GeneratedVersion = {
        visualizationId: json.visualizationId,
        generatedUrl: json.generatedUrl,
        originalUrl: json.originalUrl || photo.url,
        roomAnalysis: json.roomAnalysis ?? null,
        modelUsed: json.modelUsed,
        latencyMs: json.latencyMs ?? 0,
        cached: Boolean(json.cached),
        warnings: Array.isArray(json.warnings) ? json.warnings : [],
        itemsSnapshot: itemsToUse,
      };

      setVersions((prev) => {
        const sliced = prev.slice(0, versionIndex + 1);
        const updated = [...sliced, nextVersion];
        setVersionIndex(updated.length - 1);
        return updated;
      });
      setSplit(50);
    } catch {
      setErrorMsg('Network error while contacting the AI visualization service. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  async function deleteCurrentVisualization() {
    if (!currentVersion) return;
    await fetch(`/api/store/${storeSlug}/visualizer/generate?id=${currentVersion.visualizationId}`, {
      method: 'DELETE',
    }).catch(() => null);
    setVersions((prev) => {
      const next = prev.filter((_, i) => i !== versionIndex);
      setVersionIndex(next.length - 1);
      return next;
    });
  }

  async function downloadVisualization() {
    if (!currentVersion?.generatedUrl) return;
    try {
      const res = await fetch(currentVersion.generatedUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zentro-ai-room-${currentVersion.visualizationId.slice(0, 8)}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(currentVersion.generatedUrl, '_blank', 'noopener,noreferrer');
    }
  }

  const grandTotal = selected.reduce((sum, s) => {
    const prod = products.find((p) => p.id === s.productId);
    const variant = prod?.variants.find((v) => v.id === s.variantId);
    if (!prod || !variant) return sum;
    return sum + lineMoney(variant, s.quantity, prod.gstRateBps).total;
  }, 0);

  const linesJson = JSON.stringify(selected.map((s) => ({ variantId: s.variantId, quantity: s.quantity })));

  return (
    <div className="grid gap-8">
      {/* Room Selector & Viewer */}
      {photos.length === 0 ? (
        <div className="rounded-card border border-line bg-card p-6 text-center text-sm text-ink-muted">
          Upload a room photograph in Step 1 above to start visualizing products in your space.
        </div>
      ) : (
        <section className="grid gap-4 rounded-card border border-line bg-card p-5 shadow-rest">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">
                {currentVersion ? 'Step 5 · AI Room Preview' : 'Room Canvas'}
              </p>
              <h2 className="font-display text-2xl text-burgundy">
                {photo?.label || `Room ${photoIndex + 1}`}
              </h2>
            </div>

            {photos.length > 1 ? (
              <div className="flex flex-wrap items-center gap-2">
                {photos.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPhotoIndex(idx)}
                    className={`rounded-control px-3 py-1.5 text-xs font-semibold transition ${
                      idx === photoIndex ? 'bg-burgundy text-cream' : 'border border-line bg-white text-ink hover:bg-cream'
                    }`}
                  >
                    {p.label || `Photo ${idx + 1}`}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Comparison / Preview Stage */}
          <div
            className={`relative overflow-hidden rounded-card border border-line bg-black/90 ${
              fullscreen ? 'fixed inset-4 z-50 flex flex-col justify-center bg-black p-4' : 'w-full'
            }`}
          >
            <div className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-control bg-black/50">
              {currentVersion ? (
                <div
                  className="relative aspect-[16/10] w-full select-none overflow-hidden"
                  style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                >
                  {/* After (AI Generated) */}
                  <img
                    src={currentVersion.generatedUrl}
                    alt="AI-generated room visualization"
                    className="h-full w-full object-contain"
                  />
                  {/* Before (Original) clipped by slider */}
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                  >
                    <img
                      src={currentVersion.originalUrl}
                      alt="Original room photograph"
                      className="h-full w-full object-contain"
                    />
                  </div>
                  {/* Slider Divider */}
                  <div
                    className="pointer-events-none absolute inset-y-0 w-0.5 bg-gold shadow-lg"
                    style={{ left: `${split}%` }}
                  >
                    <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold px-2 py-1 text-[10px] font-bold text-burgundy-deep shadow">
                      ↔
                    </div>
                  </div>
                  <span className="absolute left-3 top-3 rounded bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white">
                    Original
                  </span>
                  <span className="absolute right-3 top-3 rounded bg-burgundy/90 px-2 py-0.5 text-[11px] font-semibold text-cream">
                    AI Preview
                  </span>
                </div>
              ) : (
                <div className="relative aspect-[16/10] w-full overflow-hidden">
                  <img src={photo?.url} alt={photo?.label || 'Original room'} className="h-full w-full object-contain" />
                  <span className="absolute left-3 top-3 rounded bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white">
                    Original Room
                  </span>
                </div>
              )}

              {/* Processing Overlay (Stage 4) */}
              {isGenerating ? (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-burgundy-deep/85 p-6 text-center text-cream backdrop-blur-sm">
                  <Sparkles className="h-9 w-9 animate-pulse text-gold" aria-hidden="true" />
                  <p className="font-display text-xl text-gold">{PROCESSING_STAGES[stageIndex]}</p>
                  <p className="max-w-md text-xs text-cream/80">
                    Preserving your room structure, lighting, and perspective while integrating your selected catalogue products.
                  </p>
                </div>
              ) : null}
            </div>

            {/* Viewer Toolbar */}
            {currentVersion ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-control bg-card p-3 text-xs">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 font-semibold text-ink">
                    Before / After
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={split}
                      onChange={(e) => setSplit(Number(e.target.value))}
                      className="w-28 accent-burgundy"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))))}
                    className="rounded border border-line p-1.5 text-ink hover:bg-cream"
                    aria-label="Zoom out"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>
                  <span className="font-medium text-ink">{Math.round(zoom * 100)}%</span>
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(2, Number((z + 0.25).toFixed(2))))}
                    className="rounded border border-line p-1.5 text-ink hover:bg-cream"
                    aria-label="Zoom in"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={versionIndex <= 0}
                    onClick={() => setVersionIndex((i) => Math.max(0, i - 1))}
                    className="inline-flex items-center gap-1 rounded border border-line px-2.5 py-1.5 font-medium text-ink hover:bg-cream disabled:opacity-40"
                  >
                    <Undo2 className="h-3.5 w-3.5" /> Undo
                  </button>
                  <button
                    type="button"
                    disabled={versionIndex >= versions.length - 1}
                    onClick={() => setVersionIndex((i) => Math.min(versions.length - 1, i + 1))}
                    className="inline-flex items-center gap-1 rounded border border-line px-2.5 py-1.5 font-medium text-ink hover:bg-cream disabled:opacity-40"
                  >
                    <Redo2 className="h-3.5 w-3.5" /> Redo
                  </button>
                  <button
                    type="button"
                    onClick={() => generateVisualization(true)}
                    disabled={isGenerating}
                    className="inline-flex items-center gap-1 rounded border border-line px-2.5 py-1.5 font-medium text-ink hover:bg-cream disabled:opacity-40"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                  </button>
                  <button
                    type="button"
                    onClick={downloadVisualization}
                    className="inline-flex items-center gap-1 rounded border border-line px-2.5 py-1.5 font-medium text-ink hover:bg-cream"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </button>
                  <button
                    type="button"
                    onClick={deleteCurrentVisualization}
                    className="inline-flex items-center gap-1 rounded border border-danger/30 px-2.5 py-1.5 font-medium text-danger hover:bg-danger/5"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setFullscreen((f) => !f)}
                    className="inline-flex items-center gap-1 rounded border border-line px-2.5 py-1.5 font-medium text-ink hover:bg-cream"
                  >
                    {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                    {fullscreen ? 'Exit' : 'Fullscreen'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Room Analysis & Disclosure */}
          {currentVersion ? (
            <div className="grid gap-2 rounded-control border border-line bg-cream/70 p-3 text-xs text-ink-muted">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" />
                  {currentVersion.roomAnalysis?.roomType || 'Room'} · {currentVersion.modelUsed}
                  {currentVersion.cached ? ' (Cached)' : ` · ${(currentVersion.latencyMs / 1000).toFixed(1)}s`}
                </span>
                <span>{currentVersion.roomAnalysis?.lightingDirection}</span>
              </div>
              {currentVersion.warnings.length > 0 ? (
                <p className="text-amber-800">{currentVersion.warnings.join(' ')}</p>
              ) : null}
              <p className="italic">
                AI-generated visualization for design reference. Actual product appearance, dimensions and installation results may vary.
              </p>
            </div>
          ) : null}
        </section>
      )}

      {/* Step 2 & 3: Product Selection + Selected Products Panel */}
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* Store Catalogue */}
        <section className="grid content-start gap-4 rounded-card border border-line bg-card p-5 shadow-rest">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Step 2</p>
            <h2 className="font-display text-xl text-burgundy">
              {replaceTargetId ? 'Select a Replacement Product' : 'Choose Your Products'}
            </h2>
            {replaceTargetId ? (
              <div className="mt-1 flex items-center gap-2 text-xs text-burgundy">
                <span>Click any compatible product below to replace the selected item.</span>
                <button type="button" onClick={() => setReplaceTargetId(null)} className="underline">
                  Cancel replace
                </button>
              </div>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="rounded-control border border-line bg-white px-3 py-2 text-sm"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-control border border-line bg-white px-3 py-2 text-sm"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="rounded-control border border-line bg-white px-3 py-2 text-sm"
            >
              {brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <ul className="grid max-h-[540px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {visibleProducts.map((product) => {
              const cat = classifyProduct({
                name: product.name,
                categoryName: product.categoryName,
                application: product.application,
              });
              const supported = isSupportedForVisualization(cat);
              const isSelected = selected.some((s) => s.productId === product.id);
              const firstVariant = product.variants[0];

              return (
                <li
                  key={product.id}
                  className={`flex flex-col justify-between gap-2 rounded-card border p-3 text-sm ${
                    isSelected ? 'border-burgundy bg-burgundy/5' : 'border-line bg-cream/40'
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-control border border-line bg-white">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain" />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-[10px] text-ink-muted">No photo</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{product.name}</p>
                      <p className="truncate text-xs text-ink-muted">
                        {[product.brand, product.categoryName].filter(Boolean).join(' · ')}
                      </p>
                      {firstVariant ? (
                        <p className="mt-1 text-xs font-semibold text-burgundy">
                          {formatINR(firstVariant.salePricePaise)} / {firstVariant.priceUnit}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {!supported ? (
                    <span className="rounded bg-line/60 px-2 py-1 text-[11px] text-ink-muted">
                      Direct room preview unavailable for consumables/tools
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={isSelected && !replaceTargetId}
                      onClick={() => addOrReplaceProduct(product)}
                      className="w-full rounded-control bg-burgundy px-3 py-1.5 text-xs font-semibold text-cream transition hover:bg-burgundy-deep disabled:opacity-50"
                    >
                      {replaceTargetId ? 'Use as replacement' : isSelected ? 'Selected' : 'Select for room'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {/* Selected Products & Generate AI Controls */}
        <section className="grid content-start gap-4 rounded-card border border-line bg-card p-5 shadow-rest">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Step 3</p>
            <h2 className="font-display text-xl text-burgundy">Selected Products ({selected.length})</h2>
          </div>

          {selected.length === 0 ? (
            <p className="rounded-control border border-dashed border-line p-4 text-center text-xs text-ink-muted">
              Select one or more compatible products from the store catalogue to install in your room.
            </p>
          ) : (
            <ul className="grid gap-3">
              {selected.map((item) => {
                const product = products.find((p) => p.id === item.productId);
                if (!product) return null;
                const variant = product.variants.find((v) => v.id === item.variantId) ?? product.variants[0];
                const cat = classifyProduct({
                  name: product.name,
                  categoryName: product.categoryName,
                  application: product.application,
                });
                const locations = defaultLocationsForCategory(cat);

                return (
                  <li key={item.productId} className="grid gap-2 rounded-control border border-line bg-cream/60 p-3 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} className="h-12 w-12 rounded border border-line bg-white object-contain" />
                        ) : null}
                        <div>
                          <p className="font-semibold text-ink">{product.name}</p>
                          {variant ? (
                            <p className="text-ink-muted">
                              {formatINR(lineMoney(variant, item.quantity, product.gstRateBps).total)} (incl. GST)
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setReplaceTargetId(item.productId)}
                          className="font-semibold text-burgundy underline"
                        >
                          Replace
                        </button>
                        <button
                          type="button"
                          onClick={() => removeProduct(item.productId)}
                          className="font-semibold text-danger underline"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="grid gap-1">
                        <span className="text-[11px] font-medium text-ink-muted">Variant</span>
                        <select
                          value={item.variantId}
                          onChange={(e) => updateItem(item.productId, { variantId: e.target.value })}
                          className="rounded border border-line bg-white px-2 py-1 text-xs"
                        >
                          {product.variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.label}{v.sizeLabel ? ` (${v.sizeLabel})` : ''}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-1">
                        <span className="text-[11px] font-medium text-ink-muted">Installation location</span>
                        <select
                          value={locations.includes(item.installationLocation) ? item.installationLocation : locations[0]}
                          onChange={(e) => updateItem(item.productId, { installationLocation: e.target.value })}
                          className="rounded border border-line bg-white px-2 py-1 text-xs"
                        >
                          {locations.map((loc) => (
                            <option key={loc} value={loc}>{loc}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {variant ? (
                      <label className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] text-ink-muted">Order quantity ({variant.priceUnit})</span>
                        <input
                          type="number"
                          min={1}
                          max={Math.max(1, variant.availableUnits)}
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(item.productId, {
                              quantity: clampQty(Number(e.target.value), variant.availableUnits),
                            })
                          }
                          className="w-20 rounded border border-line bg-white px-2 py-1 text-right text-xs"
                        />
                      </label>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {conflicts.length > 0 ? (
            <div className="flex items-start gap-2 rounded-control border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="grid gap-1">
                {conflicts.map((c) => (
                  <p key={c.category}>{c.message}</p>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 border-t border-line pt-3">
            <label className="flex items-center gap-2 text-xs text-ink">
              <input
                type="checkbox"
                checked={usePreviewModel}
                onChange={(e) => setUsePreviewModel(e.target.checked)}
                className="accent-burgundy"
              />
              Use fast preview model (lower latency; uncheck for highest architectural fidelity)
            </label>

            <label className="flex items-start gap-2 rounded-control border border-line bg-cream/60 p-2.5 text-xs text-ink">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(e) => setConsentAccepted(e.target.checked)}
                className="mt-0.5 accent-burgundy"
              />
              <span>
                I consent to processing my room photograph with AI (OpenAI) solely to generate this room preview.
              </span>
            </label>

            {errorMsg ? (
              <p role="alert" className="rounded-control border border-danger bg-danger/10 p-3 text-xs font-medium text-danger">
                {errorMsg}
              </p>
            ) : null}

            <button
              type="button"
              disabled={!photo || selected.length === 0 || isGenerating}
              onClick={() => generateVisualization(false)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-control bg-burgundy px-5 py-3 text-sm font-semibold text-cream shadow-rest transition hover:bg-burgundy-deep disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4 text-gold" aria-hidden="true" />
              {isGenerating ? PROCESSING_STAGES[stageIndex] : 'Visualize My Room with AI'}
            </button>
          </div>

          {/* Commerce actions (Cart & Quotations / Projects) */}
          {selected.length > 0 ? (
            <div className="grid gap-2 border-t border-line pt-3 text-xs">
              <div className="flex items-center justify-between font-semibold text-ink">
                <span>Estimated product total</span>
                <span className="text-base text-burgundy">{formatINR(grandTotal)}</span>
              </div>

              <form action={addVisualizedToCartAction}>
                <input type="hidden" name="storeSlug" value={storeSlug} />
                <input type="hidden" name="submissionId" value={submissionId} />
                <input type="hidden" name="lines" value={linesJson} />
                <button
                  type="submit"
                  className="w-full rounded-control border border-burgundy bg-white px-4 py-2 font-semibold text-burgundy hover:bg-burgundy/5"
                >
                  Add selected products to cart
                </button>
              </form>

              {canUseProjects && projects.length > 0 ? (
                <form action={addVisualizedToProjectAction} className="grid gap-2 pt-1">
                  <input type="hidden" name="storeSlug" value={storeSlug} />
                  <input type="hidden" name="submissionId" value={submissionId} />
                  <input type="hidden" name="lines" value={linesJson} />
                  <select name="target" className="rounded border border-line bg-white px-2 py-1.5 text-xs">
                    {projects.flatMap((proj) =>
                      proj.rooms.map((r) => (
                        <option key={r.id} value={`existing:${proj.id}:${r.id}`}>
                          {proj.name} → {r.name}
                        </option>
                      )),
                    )}
                  </select>
                  <button
                    type="submit"
                    className="w-full rounded-control border border-line bg-cream px-4 py-2 font-semibold text-ink hover:bg-cream/80"
                  >
                    Save to house project
                  </button>
                </form>
              ) : null}

              {canUseQuotations ? (
                <Link
                  href={`/store/${storeSlug}/cart`}
                  className="text-center font-semibold text-burgundy underline"
                >
                  Proceed to cart or request quotation →
                </Link>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
