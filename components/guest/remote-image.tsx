'use client';

import { useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';

export interface RemoteImageProps {
  src: string;
  alt: string;
  /** Classes for the wrapper that reserves the space, including its aspect ratio. */
  wrapperClassName?: string;
  imgClassName?: string;
  imgStyle?: CSSProperties;
  eager?: boolean;
  sizes?: string;
  /** Shown if the photograph fails to load, so the page keeps its layout. */
  fallback: ReactNode;
  onClick?: (event: MouseEvent<HTMLImageElement>) => void;
}

type Status = 'loading' | 'loaded' | 'failed';

/**
 * A storefront photograph with a loading placeholder and a fallback for broken or missing files.
 * Images that finish loading before hydration are detected through the element's `complete` flag.
 */
export function RemoteImage({
  src,
  alt,
  wrapperClassName = '',
  imgClassName = 'h-full w-full object-cover',
  imgStyle,
  eager = false,
  sizes,
  fallback,
  onClick,
}: RemoteImageProps) {
  const [status, setStatus] = useState<Status>('loading');
  if (status === 'failed') return <>{fallback}</>;

  return (
    <span className={`relative block overflow-hidden ${wrapperClassName}`}>
      {status === 'loading' ? <span aria-hidden="true" className="absolute inset-0 animate-pulse bg-cream" /> : null}
      <img
        ref={(element) => {
          if (element && element.complete && element.naturalWidth > 0) setStatus('loaded');
        }}
        src={src}
        alt={alt}
        sizes={sizes}
        decoding="async"
        loading={eager ? 'eager' : 'lazy'}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('failed')}
        onClick={onClick}
        style={imgStyle}
        className={`${imgClassName} transition-opacity duration-300 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
      />
    </span>
  );
}
