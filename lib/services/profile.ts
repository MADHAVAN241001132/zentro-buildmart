import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface UserProfileView {
  userId: string;
  email: string;
  pendingEmail: string | null;
  fullName: string;
  phone: string;
  avatarUrl: string | null;
  lastSignInAt: string | null;
}

export async function loadCurrentUserProfile(): Promise<UserProfileView | null> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return null;

  const { data: row } = await supabase
    .from('profiles')
    .select('full_name, phone')
    .eq('id', user.id)
    .maybeSingle();

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const avatarUrl = typeof meta.avatar_url === 'string' && meta.avatar_url.trim() !== '' ? meta.avatar_url : null;

  return {
    userId: user.id,
    email: user.email ?? '',
    pendingEmail: user.new_email ?? null,
    fullName: (row?.full_name as string | undefined) ?? (typeof meta.full_name === 'string' ? meta.full_name : '') ?? '',
    phone: (row?.phone as string | undefined) ?? '',
    avatarUrl,
    lastSignInAt: user.last_sign_in_at ?? null,
  };
}
