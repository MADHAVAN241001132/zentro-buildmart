import 'server-only';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface AdminContext {
  userId: string;
  email: string | null;
}

/**
 * Returns the signed-in platform administrator, or null.
 * The check reads platform_admins through the user's session. RLS (platform_admins_read) returns no row
 * to anyone who is not an administrator, so the check fails closed.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from('platform_admins')
    .select('profile_id')
    .eq('profile_id', user.id)
    .maybeSingle();
  if (error || !data) return null;
  return { userId: user.id, email: user.email ?? null };
}

export async function requireAdmin(): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  return ctx;
}
