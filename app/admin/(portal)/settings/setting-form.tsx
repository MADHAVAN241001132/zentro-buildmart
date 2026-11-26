'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { TextAreaField, TextField } from '@/components/owner/field';
import { savePlatformSettingAction, type PlatformSettingState } from './actions';

export function SettingForm() {
  const [state, action, pending] = useActionState(savePlatformSettingAction, { ok: false } as PlatformSettingState);
  return (
    <form action={action} className="grid gap-4 rounded-card border border-line bg-card p-5">
      <TextField name="key" label="Setting key" hint="For example billing.gst_reminder_days" />
      <TextAreaField name="value" label="Value (JSON object)" defaultValue='{"enabled": true}' />
      <FormMessage ok={state.ok} message={state.message} />
      <div><Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save setting'}</Button></div>
    </form>
  );
}
