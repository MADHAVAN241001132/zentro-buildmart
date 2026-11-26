'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatINR } from '@/lib/money';
import {
  DEFAULT_PLACEMENT, OVERLAY_LIMITS, aspectOfSizeLabel, clampSplit, clampPlacement, movePlacement, resizePlacement,
  tileBackgroundSize, type Placement,
} from '@/lib/visualizer/geometry';
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
  imageUrl: string | null;
  gstRateBps: number;
  variants: VisualizerVariant[];
}

export interface VisualizerPhoto {
  id: string;
  url: string;
  label: string;
}

interface Overlay {
  productId: string;
  variantId: string;
  quantity: number;
  placement: Placement;
}

const MAX_QTY = 999;

function clampQty(value: number, available: number): number {
  const cap = Math.max(1, Math.min(MAX_QTY, available));
  return Math.min(cap, Math.max(1, Math.round(value) || 1));
}

/** Estimate only: subtotal and GST in whole paise, the way the cart computes them. */
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
}: {
  storeSlug: string;
  photos: VisualizerPhoto[];
  products: VisualizerProduct[];
  projects: VisualizerProject[];
  submissionId: string;
}) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [split, setSplit] = useState(0);
  const [category, setCategory] = useState('All');
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; start: Placement; width: number; height: number } | null>(null);

  const photo = photos[Math.min(photoIndex, photos.length - 1)];
  const categories = useMemo(() => ['All', ...Array.from(new Set(products.map((p) => p.categoryName))).sort()], [products]);
  const visible = products.filter((p) => category === 'All' || p.categoryName === category);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const active = overlays.find((o) => o.productId === activeId) ?? null;
  const activeProduct = active ? productById.get(active.productId) ?? null : null;
  const activeVariant = active && activeProduct ? activeProduct.variants.find((v) => v.id === active.variantId) ?? null : null;

  function addProduct(product: VisualizerProduct) {
    setActiveId(product.id);
    if (overlays.some((o) => o.productId === product.id)) return;
    const first = product.variants.find((v) => v.availableUnits > 0) ?? product.variants[0];
    if (!first) return;
    setOverlays((list) => [...list, { productId: product.id, variantId: first.id, quantity: 1, placement: { ...DEFAULT_PLACEMENT } }]);
  }

  function updateActive(change: (o: Overlay) => Overlay) {
    if (!activeId) return;
    setOverlays((list) => list.map((o) => (o.productId === activeId ? change(o) : o)));
  }

  function setPlacement(change: (p: Placement) => Placement) {
    updateActive((o) => ({ ...o, placement: clampPlacement(change(o.placement)) }));
  }

  function startDrag(event: PointerEvent<HTMLElement>, mode: 'move' | 'resize') {
    if (!active || !frameRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = frameRef.current.getBoundingClientRect();
    drag.current = { mode, startX: event.clientX, startY: event.clientY, start: active.placement, width: rect.width, height: rect.height };
  }

  function onDragMove(event: PointerEvent<HTMLElement>) {
    const state = drag.current;
    if (!state) return;
    const dx = ((event.clientX - state.startX) / state.width) * 100;
    const dy = ((event.clientY - state.startY) / state.height) * 100;
    setPlacement(() => (state.mode === 'move' ? movePlacement(state.start, dx, dy) : resizePlacement(state.start, dx, dy)));
  }

  function endDrag() {
    drag.current = null;
  }

  function nudge(keyDelta: { dx?: number; dy?: number; dw?: number; dh?: number }) {
    setPlacement((p) => {
      const moved = movePlacement(p, keyDelta.dx ?? 0, keyDelta.dy ?? 0);
      return resizePlacement(moved, keyDelta.dw ?? 0, keyDelta.dh ?? 0);
    });
  }

  function onOverlayKey(event: KeyboardEvent<HTMLElement>) {
    const step = event.shiftKey ? 5 : 1;
    const map: Record<string, () => void> = {
      ArrowLeft: () => nudge({ dx: -step }),
      ArrowRight: () => nudge({ dx: step }),
      ArrowUp: () => nudge({ dy: -step }),
      ArrowDown: () => nudge({ dy: step }),
    };
    const handler = map[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  const lines = overlays
    .map((o) => {
      const product = productById.get(o.productId);
      const variant = product?.variants.find((v) => v.id === o.variantId);
      if (!variant || variant.availableUnits <= 0) return null;
      return { variantId: variant.id, quantity: clampQty(o.quantity, variant.availableUnits) };
    })
    .filter((line): line is { variantId: string; quantity: number } => line !== null);

  const estimate = overlays.reduce(
    (sum, o) => {
      const product = productById.get(o.productId);
      const variant = product?.variants.find((v) => v.id === o.variantId);
      if (!product || !variant || variant.availableUnits <= 0) return sum;
      const money = lineMoney(variant, clampQty(o.quantity, variant.availableUnits), product.gstRateBps);
      return { subtotal: sum.subtotal + money.subtotal, gst: sum.gst + money.gst, total: sum.total + money.total };
    },
    { subtotal: 0, gst: 0, total: 0 },
  );

  return (
    <div className="grid gap-6">
      <p className="rounded-card border border-line bg-card p-4 text-sm text-ink">
        <strong className="font-semibold text-burgundy">Approximate product preview.</strong> Place a product on your photograph to see how it might look.
        The size is set by you, not measured from the room, and this is not a photorealistic or AI rendering.
      </p>

      {photos.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto" role="list" aria-label="Room photographs">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="listitem"
              onClick={() => setPhotoIndex(i)}
              aria-pressed={i === photoIndex}
              className={`shrink-0 rounded-control border px-3 py-2 text-sm font-semibold ${i === photoIndex ? 'border-burgundy bg-burgundy text-cream' : 'border-line bg-card text-ink'}`}
            >
              {p.label || `Photograph ${i + 1}`}
            </button>
          ))}
        </div>
      ) : null}

      {photo ? (
        <section aria-label="Preview" className="grid gap-3">
          <div ref={frameRef} className="relative overflow-hidden rounded-card border border-line bg-card" onPointerMove={onDragMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={photo.label ? `Room photograph: ${photo.label}` : 'Room photograph'} draggable={false} className="block h-auto w-full select-none" />
            <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${clampSplit(split)}%)` }}>
              {overlays.map((o) => {
                const product = productById.get(o.productId);
                if (!product) return null;
                const isActive = o.productId === activeId;
                const p = o.placement;
                const background = product.imageUrl ? `url("${product.imageUrl}")` : 'linear-gradient(135deg, #6A0D2A, #C9A45C)';
                return (
                  <div
                    key={o.productId}
                    role="group"
                    aria-label={`${product.name} overlay${isActive ? ', selected' : ''}`}
                    tabIndex={isActive ? 0 : -1}
                    onPointerDown={isActive ? (e) => startDrag(e, 'move') : undefined}
                    onKeyDown={isActive ? onOverlayKey : undefined}
                    onClick={() => setActiveId(o.productId)}
                    className={`absolute touch-none ${isActive ? 'cursor-move outline outline-2 outline-gold' : 'cursor-pointer'}`}
                    style={{
                      left: `${p.x}%`,
                      top: `${p.y}%`,
                      width: `${p.width}%`,
                      height: `${p.height}%`,
                      transform: `rotate(${p.rotation}deg)`,
                      opacity: p.opacity,
                      backgroundImage: background,
                      backgroundSize: p.repeat ? tileBackgroundSize(p.tilesAcross) : 'cover',
                      backgroundRepeat: p.repeat ? 'repeat' : 'no-repeat',
                      backgroundPosition: 'top left',
                      mixBlendMode: 'multiply',
                    }}
                  >
                    {isActive ? (
                      <span
                        role="slider"
                        tabIndex={0}
                        aria-label={`Resize ${product.name}`}
                        aria-valuenow={Math.round(p.width)}
                        aria-valuemin={OVERLAY_LIMITS.minSize}
                        aria-valuemax={OVERLAY_LIMITS.maxSize}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          startDrag(e, 'resize');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); nudge({ dw: 1 }); }
                          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); nudge({ dw: -1 }); }
                        }}
                        className="absolute -bottom-2 -right-2 h-5 w-5 touch-none rounded-sm border-2 border-cream bg-burgundy"
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
            {overlays.length > 0 && split > 0 ? (
              <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-gold" style={{ left: `${split}%` }} aria-hidden />
            ) : null}
          </div>

          <div className="grid gap-2 text-sm">
            <label className="flex items-center gap-3 font-semibold text-ink">
              Compare with original
              <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} className="w-full accent-burgundy" aria-label="Compare with original: left side shows the original photograph" />
            </label>
            <p className="text-xs text-ink-muted">Move the slider right to show the original photograph. Drag a product to move it; drag its corner to resize it.</p>
          </div>
        </section>
      ) : (
        <div className="rounded-card border border-dashed border-line bg-card p-8 text-center text-sm text-ink-muted">Upload a room photograph to start.</div>
      )}

      <section aria-labelledby="catalogue-heading" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="catalogue-heading" className="font-display text-xl text-burgundy">Choose products</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
            {categories.map((c) => (
              <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c} className={`rounded-full border px-3 py-1 text-xs font-semibold ${category === c ? 'border-burgundy bg-burgundy text-cream' : 'border-line bg-card text-ink'}`}>{c}</button>
            ))}
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => addProduct(p)} className={`flex w-full flex-col overflow-hidden rounded-card border text-left ${p.id === activeId ? 'border-burgundy' : 'border-line'} bg-card`}>
                <span className="block aspect-square w-full bg-gradient-to-br from-burgundy-deep to-burgundy" style={p.imageUrl ? { backgroundImage: `url("${p.imageUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined} aria-hidden />
                <span className="p-2">
                  <span className="block text-sm font-semibold text-ink">{p.name}</span>
                  <span className="block text-xs text-ink-muted">{overlays.some((o) => o.productId === p.id) ? 'On your photograph' : 'Tap to place'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {visible.length === 0 ? <p className="text-sm text-ink-muted">No products in this category yet.</p> : null}
      </section>

      {active && activeProduct && activeVariant ? (
        <section aria-labelledby="selected-heading" className="grid gap-4 rounded-card border border-line bg-card p-4">
          <div>
            <h2 id="selected-heading" className="font-display text-xl text-burgundy">{activeProduct.name}</h2>
            {activeProduct.brand ? <p className="text-xs uppercase tracking-[0.15em] text-gold">{activeProduct.brand}</p> : null}
          </div>

          {overlays.length > 1 ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Switch product">
              {overlays.map((o) => {
                const name = productById.get(o.productId)?.name ?? 'Product';
                return (
                  <button key={o.productId} type="button" onClick={() => setActiveId(o.productId)} aria-pressed={o.productId === activeId} className={`rounded-control border px-3 py-1.5 text-xs font-semibold ${o.productId === activeId ? 'border-burgundy bg-burgundy text-cream' : 'border-line text-ink'}`}>{name}</button>
                );
              })}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold text-ink">
              Variant
              <select
                value={active.variantId}
                onChange={(e) => updateActive((o) => ({ ...o, variantId: e.target.value, quantity: 1 }))}
                className="rounded-control border border-line bg-cream px-3 py-2 text-sm font-normal"
              >
                {activeProduct.variants.map((v) => (
                  <option key={v.id} value={v.id} disabled={v.availableUnits <= 0}>
                    {v.label}{v.sizeLabel ? ` · ${v.sizeLabel}` : ''}{v.availableUnits <= 0 ? ' (out of stock)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-ink">
              Quantity ({activeVariant.priceUnit})
              <input
                type="number"
                min={1}
                max={Math.max(1, Math.min(MAX_QTY, activeVariant.availableUnits))}
                value={active.quantity}
                onChange={(e) => updateActive((o) => ({ ...o, quantity: clampQty(Number(e.target.value), activeVariant.availableUnits) }))}
                className="rounded-control border border-line bg-cream px-3 py-2 text-sm font-normal"
              />
            </label>
          </div>

          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div><dt className="text-ink-muted">Unit price</dt><dd className="font-semibold text-ink">{formatINR(activeVariant.salePricePaise)} / {activeVariant.priceUnit}</dd></div>
            <div><dt className="text-ink-muted">Availability</dt><dd className={`font-semibold ${activeVariant.availableUnits > 0 ? 'text-success' : 'text-danger'}`}>{activeVariant.availableUnits > 0 ? `${activeVariant.availableUnits} available` : 'Out of stock'}</dd></div>
            <div><dt className="text-ink-muted">Estimate with GST</dt><dd className="font-semibold text-ink">{formatINR(lineMoney(activeVariant, clampQty(active.quantity, activeVariant.availableUnits), activeProduct.gstRateBps).total)}</dd></div>
          </dl>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm text-ink">Opacity
              <input type="range" min={Math.round(OVERLAY_LIMITS.minOpacity * 100)} max={100} value={Math.round(active.placement.opacity * 100)} onChange={(e) => setPlacement((p) => ({ ...p, opacity: Number(e.target.value) / 100 }))} className="accent-burgundy" />
            </label>
            <label className="grid gap-1 text-sm text-ink">Rotation ({Math.round(active.placement.rotation)}°)
              <input type="range" min={-180} max={180} value={Math.round(active.placement.rotation)} onChange={(e) => setPlacement((p) => ({ ...p, rotation: Number(e.target.value) }))} className="accent-burgundy" />
            </label>
            <label className="grid gap-1 text-sm text-ink">Width ({Math.round(active.placement.width)}%)
              <input type="range" min={OVERLAY_LIMITS.minSize} max={OVERLAY_LIMITS.maxSize} value={Math.round(active.placement.width)} onChange={(e) => setPlacement((p) => ({ ...p, width: Number(e.target.value) }))} className="accent-burgundy" />
            </label>
            <label className="grid gap-1 text-sm text-ink">Height ({Math.round(active.placement.height)}%)
              <input type="range" min={OVERLAY_LIMITS.minSize} max={OVERLAY_LIMITS.maxSize} value={Math.round(active.placement.height)} onChange={(e) => setPlacement((p) => ({ ...p, height: Number(e.target.value) }))} className="accent-burgundy" />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2 font-semibold text-ink">
              <input type="checkbox" checked={active.placement.repeat} onChange={(e) => setPlacement((p) => ({ ...p, repeat: e.target.checked }))} />
              Repeat tiles across the area
            </label>
            {active.placement.repeat ? (
              <label className="flex items-center gap-2 text-ink">
                Tiles across
                <input type="number" min={OVERLAY_LIMITS.minTilesAcross} max={OVERLAY_LIMITS.maxTilesAcross} value={active.placement.tilesAcross} onChange={(e) => setPlacement((p) => ({ ...p, tilesAcross: Number(e.target.value) }))} className="w-20 rounded-control border border-line bg-cream px-2 py-1" />
              </label>
            ) : null}
            <button type="button" onClick={() => { const aspect = aspectOfSizeLabel(activeVariant.sizeLabel); setPlacement((p) => resizePlacement(p, 0, 0, aspect)); }} className="rounded-control border border-line px-3 py-1.5 font-semibold text-burgundy">Match tile proportions</button>
            <button type="button" onClick={() => setPlacement(() => ({ ...DEFAULT_PLACEMENT }))} className="rounded-control border border-line px-3 py-1.5 font-semibold text-burgundy">Reset placement</button>
            <button type="button" onClick={() => { setOverlays((list) => list.filter((o) => o.productId !== activeId)); setActiveId(null); }} className="rounded-control border border-danger px-3 py-1.5 font-semibold text-danger">Remove from photograph</button>
          </div>

          <p className="text-xs text-ink-muted">
            Want to know how many boxes you need? <Link href={`/store/${storeSlug}/tools/tile-calculator?price=${(activeVariant.salePricePaise / 100).toFixed(2)}`} className="font-semibold text-burgundy underline">Open the tile calculator</Link>.
          </p>
        </section>
      ) : null}

      {products.length === 0 ? <p className="text-sm text-ink-muted">No products are available to place yet.</p> : null}

      <section aria-labelledby="cart-heading" className="grid gap-3 rounded-card border border-line bg-card p-4">
        <h2 id="cart-heading" className="font-display text-xl text-burgundy">Add to cart</h2>
        <p className="text-sm text-ink-muted">
          {overlays.length === 0 ? 'Place a product on your photograph first.' : `Estimate for ${overlays.length} ${overlays.length === 1 ? 'product' : 'products'}: ${formatINR(estimate.subtotal)} plus GST ${formatINR(estimate.gst)} = ${formatINR(estimate.total)}. Cart prices and stock are checked again when you add.`}
        </p>
        <form action={addVisualizedToCartAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="storeSlug" value={storeSlug} />
          <input type="hidden" name="submissionId" value={submissionId} />
          <input type="hidden" name="lines" value={JSON.stringify(lines)} />
          <button type="submit" disabled={lines.length === 0} className="rounded-control bg-burgundy px-4 py-2.5 text-sm font-semibold text-cream disabled:opacity-50">
            Add visualized products to cart
          </button>
        </form>

        <h3 className="mt-2 font-display text-lg text-burgundy">Add to Construction Project</h3>
        <p className="text-sm text-ink-muted">
          Keeps each size and quantity you placed. Products are added to the room you choose and can be priced later in the planner.
        </p>
        <form action={addVisualizedToProjectAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="storeSlug" value={storeSlug} />
          <input type="hidden" name="submissionId" value={submissionId} />
          <input type="hidden" name="lines" value={JSON.stringify(lines)} />
          <label className="grid gap-1 text-sm font-semibold text-ink">
            Project or room
            <select name="target" defaultValue={projects.length === 0 ? 'new' : ''} className="rounded-control border border-line bg-cream px-3 py-2 font-normal">
              {projects.length === 0 ? null : <option value="" disabled>Choose a project</option>}
              {projects.map((project) => (
                <optgroup key={project.id} label={project.name}>
                  <option value={project.id}>{project.name} (whole project)</option>
                  {project.rooms.map((room) => (
                    <option key={room.id} value={`${project.id}|${room.id}`}>{room.name} ({room.roomLabel})</option>
                  ))}
                </optgroup>
              ))}
              <option value="new">New project</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink">
            New project name
            <input name="newProjectName" maxLength={120} className="rounded-control border border-line bg-cream px-3 py-2 font-normal" placeholder="Only for a new project" />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink">
            New room name
            <input name="newRoomName" maxLength={80} className="rounded-control border border-line bg-cream px-3 py-2 font-normal" placeholder="Creates a custom room when no room is chosen" />
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={lines.length === 0} className="rounded-control border border-burgundy px-4 py-2.5 text-sm font-semibold text-burgundy disabled:opacity-50">
              Add to Construction Project
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
