/**
 * Tracked QR entry links. A printed or downloaded QR code encodes /q/{token}; the entry route records the
 * event and redirects to the storefront. Plain storefront URLs printed earlier keep working and are not counted.
 */
export const ENTRY_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

export function isEntryToken(value: string): boolean {
  return ENTRY_TOKEN_PATTERN.test(value);
}

export function trackedEntryUrl(baseUrl: string, token: string): string {
  if (!isEntryToken(token)) throw new Error('invalid entry token');
  return `${baseUrl.replace(/\/$/, '')}/q/${token}`;
}
