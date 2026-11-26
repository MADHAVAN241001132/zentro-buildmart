import { RemoteImage } from './remote-image';
import { placeholderArtPath } from '@/lib/guest/placeholder-art';

/**
 * Small square product photograph for the cart, checkout and other compact lists. The name is shown
 * beside it, so the image itself is decorative. Without a photograph a labelled category
 * illustration is shown, chosen from the category, or from the product name when no category is passed.
 */
export function ProductThumb({
  src,
  name,
  category,
  className = 'h-16 w-16',
}: {
  src: string | null;
  name?: string;
  category?: string | null;
  className?: string;
}) {
  const mark = (
    <span aria-hidden="true" className="relative block h-full w-full overflow-hidden bg-burgundy-deep">
      {/* eslint-disable-next-line @next/next/no-img-element -- static local placeholder */}
      <img src={placeholderArtPath(category ?? name)} alt="" className="h-full w-full object-cover" />
    </span>
  );
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-control border border-line ${className}`}>
      {src ? <RemoteImage src={src} alt="" wrapperClassName="h-full w-full" fallback={mark} /> : mark}
    </span>
  );
}
