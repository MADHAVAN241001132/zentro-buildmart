/**
 * Guest session tokens. The raw token lives only in an HTTP-only cookie.
 * The database stores SHA-256(token) in guest_sessions.token_hash.
 */
import { createHash, randomBytes } from 'node:crypto';

export function guestCookieName(storeSlug: string): string {
  if (!/^[a-z0-9-]{3,40}$/.test(storeSlug)) throw new Error('Invalid store slug');
  return `zb_guest_${storeSlug}`;
}

export function generateGuestToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashGuestToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isWellFormedGuestToken(token: string | undefined): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}
