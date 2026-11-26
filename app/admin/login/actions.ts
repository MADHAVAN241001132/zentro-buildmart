'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAdminContext } from '@/lib/services/admin';
import { firstIssue } from '@/lib/validation';

export interface AdminLoginState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

const schema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

/**
 * Signs in through Supabase Auth, then requires a platform_admins row. Any other account is signed out
 * immediately and sees the same generic message, so the portal does not reveal which accounts exist.
 */
export async function adminSignInAction(_prev: AdminLoginState, formData: FormData): Promise<AdminLoginState> {
  const parsed = schema.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: firstIssue(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, message: 'Email or password is incorrect' };

  const admin = await getAdminContext();
  if (!admin) {
    await supabase.auth.signOut();
    return { ok: false, message: 'Email or password is incorrect' };
  }
  redirect('/admin');
}

export async function adminSignOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/admin/login');
}
