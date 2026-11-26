import { createHash } from 'node:crypto';

/**
 * Derives a stable UUID from a caller's request key. The same form submission always maps to the same
 * provisioning request, and the database keeps keys unique per actor.
 */
export function keyToUuid(key: string): string {
  const hex = createHash('sha256').update(`zentro-provisioning:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
