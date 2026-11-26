'use client';

import { useRef, useState, type KeyboardEvent, type MouseEvent, type TouchEvent } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { BrandedTile } from './product-image';
import { RemoteImage } from './remote-image';

export interface GalleryPhoto {
  url: string;
  alt: string;
}

/** Horizontal distance a touch must travel before it counts as a swipe. */
const SWIPE_THRESHOLD_PX = 40;
const ZOOM_SCALE = 2;

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Product photograph gallery: main image, thumbnails, arrow buttons, keyboard arrows and touch swipes,
 * and a zoom that follows the pointer (or the tap position on touch screens). With no photographs it
 * shows the branded tile.
 */
export function ProductGallery({ photos, name, category }: { photos: GalleryPhoto[]; name: string; category: string }) {
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const count = photos.length;

  if (count === 0) {
    return <BrandedTile alt={name} category={category} />;
  }

  const position = Math.min(index, count - 1);
  const current = photos[position] ?? photos[0]!;

  function show(next: number) {
    setZoomed(false);
    setIndex((next + count) % count);
  }

  function recordOrigin(event: MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = clampPercent(((event.clientX - rect.left) / rect.width) * 100);
    const y = clampPercent(((event.clientY - rect.top) / rect.height) * 100);
    setOrigin(`${x}% ${y}%`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'ArrowLeft') show(position - 1);
    else if (event.key === 'ArrowRight') show(position + 1);
    else if (event.key === 'Escape') setZoomed(false);
    else return;
    event.preventDefault();
  }

  function onTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function onTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch || zoomed || count < 2) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // Ignore short moves and mostly vertical moves, so page scrolling is not mistaken for a swipe.
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;
    show(dx < 0 ? position + 1 : position - 1);
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label={`${name} photographs`}
      onKeyDown={onKeyDown}
      className="grid gap-3"
    >
      <div
        className="relative overflow-hidden rounded-card border border-line bg-card"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onMouseMove={(event) => {
          if (zoomed) recordOrigin(event);
        }}
      >
        <RemoteImage
          key={current.url}
          src={current.url}
          alt={current.alt}
          eager={position === 0}
          sizes="(min-width: 1024px) 50vw, 100vw"
          wrapperClassName="aspect-[4/3] w-full"
          imgClassName={`h-full w-full object-cover ${zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
          imgStyle={{
            transform: zoomed ? `scale(${ZOOM_SCALE})` : 'none',
            transformOrigin: origin,
            transition: 'transform 200ms ease',
          }}
          onClick={(event) => {
            recordOrigin(event);
            setZoomed((value) => !value);
          }}
          fallback={<BrandedTile alt={name} category={category} />}
        />

        <button
          type="button"
          aria-pressed={zoomed}
          aria-label={zoomed ? 'Reset zoom' : 'Zoom in'}
          onClick={(event) => {
            event.stopPropagation();
            setZoomed((value) => !value);
          }}
          className="absolute right-3 top-3 rounded-full bg-cream/90 p-2 text-burgundy shadow-rest hover:bg-cream"
        >
          {zoomed ? <ZoomOut className="h-4 w-4" aria-hidden="true" /> : <ZoomIn className="h-4 w-4" aria-hidden="true" />}
        </button>

        {count > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous photograph"
              onClick={(event) => {
                event.stopPropagation();
                show(position - 1);
              }}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-cream/90 p-2 text-burgundy shadow-rest hover:bg-cream"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next photograph"
              onClick={(event) => {
                event.stopPropagation();
                show(position + 1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-cream/90 p-2 text-burgundy shadow-rest hover:bg-cream"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="absolute bottom-3 right-3 rounded-full bg-burgundy-deep/80 px-2.5 py-0.5 text-xs text-cream">
              {position + 1} / {count}
            </span>
          </>
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite">
        Photograph {position + 1} of {count}
      </p>

      {count > 1 ? (
        <ul aria-label="Photograph thumbnails" className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((photo, i) => (
            <li key={`${photo.url}-${i}`} className="shrink-0">
              <button
                type="button"
                onClick={() => show(i)}
                aria-label={`Show photograph ${i + 1}`}
                aria-current={i === position ? 'true' : undefined}
                className={`relative block h-16 w-16 overflow-hidden rounded-control border-2 sm:h-20 sm:w-20 ${
                  i === position ? 'border-burgundy' : 'border-line hover:border-gold'
                }`}
              >
                <RemoteImage
                  src={photo.url}
                  alt=""
                  wrapperClassName="h-full w-full"
                  fallback={<span aria-hidden="true" className="block h-full w-full bg-burgundy" />}
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
