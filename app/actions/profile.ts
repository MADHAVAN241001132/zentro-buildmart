'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export interface ProfileActionState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(120),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+() -]{8,18}$/, 'Enter a valid mobile number')
    .or(z.literal('')),
});

const emailSchema = z.object({
  newEmail: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .regex(/[A-Z]/, 'Include at least one uppercase letter')
      .regex(/[a-z]/, 'Include at least one lowercase letter')
      .regex(/[0-9]/, 'Include at least one number'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'New passwords do not match',
    path: ['confirmPassword'],
  });

function detectImageType(buf: Buffer): { ext: 'jpg' | 'png' | 'webp'; mime: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: 'png', mime: 'image/png' };
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

function revalidatePortalPaths() {
  revalidatePath('/admin/profile');
  revalidatePath('/owner/profile');
  revalidatePath('/admin', 'layout');
  revalidatePath('/owner', 'layout');
}

export async function updateProfileDetailsAction(_prev: ProfileActionState, fd: FormData): Promise<ProfileActionState> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, message: 'Sign in required' };

  const parsed = profileSchema.safeParse({
    fullName: String(fd.get('fullName') ?? ''),
    phone: String(fd.get('phone') ?? ''),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: 'Check the highlighted fields', fieldErrors };
  }

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.fullName, phone: parsed.data.phone || null })
    .eq('id', auth.user.id);

  if (error) return { ok: false, message: 'Could not update profile details' };

  await supabase.auth.updateUser({ data: { full_name: parsed.data.fullName } });
  revalidatePortalPaths();
  return { ok: true, message: 'Profile details updated' };
}

export async function uploadProfileAvatarAction(_prev: ProfileActionState, fd: FormData): Promise<ProfileActionState> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, message: 'Sign in required' };

  const file = fd.get('avatar');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Choose a JPG, PNG, or WebP image (max 5 MB)' };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, message: 'Profile photo must be 5 MB or smaller' };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const detected = detectImageType(buf);
  if (!detected) {
    return { ok: false, message: 'Only JPG, PNG, and WebP images are supported' };
  }

  const admin = createSupabaseAdminClient();
  const objectPath = `${auth.user.id}/avatar-${Date.now()}.${detected.ext}`;
  const { error: uploadErr } = await admin.storage.from('profile-avatars').upload(objectPath, buf, {
    contentType: detected.mime,
    upsert: true,
  });
  if (uploadErr) {
    return { ok: false, message: 'Could not upload profile photo' };
  }

  const { data: pub } = admin.storage.from('profile-avatars').getPublicUrl(objectPath);
  const avatarUrl = pub.publicUrl;

  await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } });
  revalidatePortalPaths();
  return { ok: true, message: 'Profile photo updated' };
}

export async function removeProfileAvatarAction(): Promise<ProfileActionState> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, message: 'Sign in required' };

  const admin = createSupabaseAdminClient();
  const { data: files } = await admin.storage.from('profile-avatars').list(auth.user.id);
  if (files && files.length > 0) {
    await admin.storage.from('profile-avatars').remove(files.map((f) => `${auth.user!.id}/${f.name}`));
  }

  await supabase.auth.updateUser({ data: { avatar_url: null } });
  revalidatePortalPaths();
  return { ok: true, message: 'Profile photo removed' };
}

export async function requestEmailChangeAction(_prev: ProfileActionState, fd: FormData): Promise<ProfileActionState> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, message: 'Sign in required' };

  const parsed = emailSchema.safeParse({ newEmail: String(fd.get('newEmail') ?? '') });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid email' };
  }
  if (parsed.data.newEmail === (auth.user.email ?? '').toLowerCase()) {
    return { ok: false, message: 'That is already your current email address' };
  }

  const { error } = await supabase.auth.updateUser({ email: parsed.data.newEmail });
  if (error) {
    return { ok: false, message: error.message || 'Could not initiate email change' };
  }
  revalidatePortalPaths();
  return { ok: true, message: `Verification link sent to ${parsed.data.newEmail}. Confirm it to complete the change.` };
}

export async function changePasswordAction(_prev: ProfileActionState, fd: FormData): Promise<ProfileActionState> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || !auth.user.email) return { ok: false, message: 'Sign in required' };

  const parsed = passwordSchema.safeParse({
    currentPassword: String(fd.get('currentPassword') ?? ''),
    newPassword: String(fd.get('newPassword') ?? ''),
    confirmPassword: String(fd.get('confirmPassword') ?? ''),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: 'Check the highlighted password fields', fieldErrors };
  }

  // Re-authenticate with current password before updating
  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: auth.user.email,
    password: parsed.data.currentPassword,
  });
  if (verifyErr) {
    return { ok: false, message: 'Current password is incorrect', fieldErrors: { currentPassword: 'Incorrect password' } };
  }

  const { error: updateErr } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (updateErr) {
    return { ok: false, message: updateErr.message || 'Could not update password' };
  }

  return { ok: true, message: 'Password updated successfully' };
}
