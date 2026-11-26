import 'server-only';
import { cookies } from 'next/headers';
import { guestCookieName, generateGuestToken, hashGuestToken, isWellFormedGuestToken } from '@/lib/guest/token';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const GUEST_TTL_DAYS = 30;

export interface GuestSession {
  id: string;
}

/** Returns the guest session for this store if the cookie is valid and unexpired. Read-only. */
export async function readGuestSession(storeId: string, storeSlug: string): Promise<GuestSession | null> {
  const jar = await cookies();
  const token = jar.get(guestCookieName(storeSlug))?.value;
  if (!isWellFormedGuestToken(token)) return null;
  const { data, error } = await createSupabaseAdminClient()
    .from('guest_sessions')
    .select('id')
    .eq('store_id', storeId)
    .eq('token_hash', hashGuestToken(token))
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error('Could not read guest session');
  return data ? { id: data.id as string } : null;
}

/** Creates a guest session and sets its cookie. Only call from a Server Action or Route Handler. */
export async function ensureGuestSession(storeId: string, storeSlug: string): Promise<GuestSession> {
  const existing = await readGuestSession(storeId, storeSlug);
  if (existing) return existing;

  const token = generateGuestToken();
  const expiresAt = new Date(Date.now() + GUEST_TTL_DAYS * 86_400_000).toISOString();
  const { data, error } = await createSupabaseAdminClient()
    .from('guest_sessions')
    .insert({ store_id: storeId, token_hash: hashGuestToken(token), expires_at: expiresAt })
    .select('id')
    .single();
  if (error || !data) throw new Error('Could not start a guest session');

  const jar = await cookies();
  jar.set(guestCookieName(storeSlug), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: GUEST_TTL_DAYS * 86_400,
  });
  return { id: data.id as string };
}
