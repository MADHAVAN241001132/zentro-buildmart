/**
 * Ordering for product photographs. Pure and free of server-only imports, so the storefront,
 * the cart and the unit tests all use the same rule.
 */
export interface RawPhoto {
  public_url: string;
  alt_text?: string | null;
  is_primary: boolean;
  sort_order: number;
}

export interface ProductPhoto {
  url: string;
  alt: string;
  isPrimary: boolean;
}

/**
 * Primary photograph first, then display order, then the order the rows arrived in. Rows without a URL
 * are dropped. A blank alt text falls back to the product name.
 */
export function orderProductPhotos(images: RawPhoto[] | null | undefined, fallbackAlt: string): ProductPhoto[] {
  if (!images) return [];
  return images
    .map((image, position) => ({ image, position }))
    .filter(({ image }) => typeof image.public_url === 'string' && image.public_url.length > 0)
    .sort(
      (a, b) =>
        Number(b.image.is_primary) - Number(a.image.is_primary) ||
        a.image.sort_order - b.image.sort_order ||
        a.position - b.position,
    )
    .map(({ image }) => ({
      url: image.public_url,
      alt: image.alt_text?.trim() || fallbackAlt,
      isPrimary: image.is_primary,
    }));
}
