import { RemoteImage } from './remote-image';
import { placeholderArtPath } from '@/lib/guest/placeholder-art';

/**
 * Product image with a branded fallback. The Stitch export contains no separate product photo
 * files, so products without an uploaded image render a burgundy and gold tile with their category.
 * A photograph that fails to load falls back to the same tile.
 */
export function ProductImage({ src, alt, category }: { src?: string | null; alt: string; category: string }) {
  const tile = <BrandedTile alt={alt} category={category} />;
  if (!src) return tile;
  return <RemoteImage src={src} alt={alt} wrapperClassName="aspect-[4/3] w-full" fallback={tile} />;
}

/**
 * Shown when a product has no photograph. Uses the labelled demonstration placeholder under
 * public/placeholders, so it is never mistaken for a real product photo.
 */
export function BrandedTile({ alt, category }: { alt: string; category: string }) {
  return (
    <div role="img" aria-label={`${alt} (placeholder image)`} className="relative aspect-[4/3] w-full overflow-hidden bg-burgundy-deep">
      {/* eslint-disable-next-line @next/next/no-img-element -- static local placeholder */}
      <img src={placeholderArtPath(category)} alt="" aria-hidden="true" className="h-full w-full object-cover" />
      <span className="absolute inset-x-0 bottom-3 px-4 text-center text-[11px] uppercase tracking-[0.2em] text-cream/90">{category}</span>
    </div>
  );
}
