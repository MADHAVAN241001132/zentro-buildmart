import { z } from 'zod';

export const POS_METHODS = ['cash', 'credit', 'online'] as const;
export type PosMethod = (typeof POS_METHODS)[number];
export const posMethodSchema = z.enum(POS_METHODS);

export const uuidSchema = z.string().uuid();
/** A bill id, or the literal 'new' when the first item starts a bill. */
export const billIdSchema = z.union([z.literal('new'), uuidSchema]);

/** Strips characters that would change a PostgREST filter, then trims and caps the length. */
export function cleanSearch(term: string): string {
  return term.replace(/[%_,()*\\]/g, '').trim().slice(0, 60);
}

/** Quantities are numeric(12,3): greater than 0, at most 999, up to three decimals. */
export function quantityFromText(text: string): number | null {
  const value = Number(text.trim());
  if (!Number.isFinite(value) || value <= 0 || value > 999) return null;
  if (Math.abs(value * 1000 - Math.round(value * 1000)) > 1e-6) return null;
  return value;
}
