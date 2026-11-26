'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { TextField } from '@/components/owner/field';
import { adminSignInAction, type AdminLoginState } from './actions';

const INITIAL: AdminLoginState = { ok: false };

export function AdminLoginForm() {
  const [state, action, pending] = useActionState(adminSignInAction, INITIAL);
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4 rounded-card border border-line bg-card p-6" noValidate>
      <TextField name="email" label="Email" type="email" autoComplete="username" error={e.email} />
      <TextField name="password" label="Password" type="password" autoComplete="current-password" error={e.password} />
      <FormMessage ok={state.ok} message={state.message} />
      <Button type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</Button>
    </form>
  );
}
