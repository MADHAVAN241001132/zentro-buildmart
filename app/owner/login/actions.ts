'use server';

import { redirect } from 'next/navigation';
import { ownerLoginSchema, firstIssue } from '@/lib/validation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getOwnerContext } from '@/lib/services/owner';

export interface LoginState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

export async function signInAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = ownerLoginSchema.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: firstIssue(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, message: 'Email or password is incorrect' };

  const context = await getOwnerContext();
  if (!context) {
    await supabase.auth.signOut();
    return { ok: false, message: 'This account is not linked to an active store' };
  }
  redirect('/owner');
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/owner/login');
}
