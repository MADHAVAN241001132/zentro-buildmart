'use client';

import { useActionState } from 'react';
import { signInAction, type LoginState } from './actions';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';

const INITIAL: LoginState = { ok: false };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, INITIAL);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="grid gap-4 rounded-card border border-line bg-card p-6" noValidate>
      <label className="grid gap-1.5 text-sm font-medium">
        Email
        <input name="email" type="email" autoComplete="username" required className="rounded-control border border-line bg-white px-3 py-2.5 font-normal" suppressHydrationWarning />
        {errors.email ? <span className="text-sm text-danger">{errors.email}</span> : null}
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Password
        <input name="password" type="password" autoComplete="current-password" required className="rounded-control border border-line bg-white px-3 py-2.5 font-normal" suppressHydrationWarning />
        {errors.password ? <span className="text-sm text-danger">{errors.password}</span> : null}
      </label>
      <FormMessage ok={state.ok} message={state.message} />
      <Button type="submit" disabled={pending} className="w-full py-3">
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
