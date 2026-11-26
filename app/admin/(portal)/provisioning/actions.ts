'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/services/admin';
import { recordAdminAudit } from '@/lib/services/audit';
import { provisioningDeps } from '@/lib/services/provisioning';
import { resumeProvisioning } from '@/lib/provisioning/orchestrator';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export interface ProvisioningActionState {
  ok: boolean | null;
  message?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Administrative reconciliation. Every action re-checks the administrator and goes through a database function that
 * checks the same thing again. Nothing here deletes an Auth account, and no password is stored or logged.
 */
export async function resumeRequestAction(_prev: ProvisioningActionState, formData: FormData): Promise<ProvisioningActionState> {
  const admin = await requireAdmin();
  const requestId = text(formData, 'request_id');
  if (!UUID.test(requestId)) return { ok: false, message: 'The request was not recognised.' };
  // The password is used once for the Auth call and is not kept in the form state.
  const password = text(formData, 'password') || undefined;
  const result = await resumeProvisioning(provisioningDeps(), requestId, password);
  await recordAdminAudit({
    actorId: admin.userId,
    storeId: null,
    action: 'provisioning.retry',
    entityType: 'account_provisioning_request',
    entityId: requestId,
    after: { outcome: result.ok ? 'completed' : result.code },
    actorType: 'super_admin',
  }).catch(() => undefined);
  revalidatePath('/admin/provisioning');
  if (result.ok) return { ok: true, message: result.replay ? 'This request was already complete.' : 'Account created and linked.' };
  return { ok: false, message: result.message };
}

async function reconcile(formData: FormData, fn: string, extra: (note: string) => Record<string, unknown>, label: string): Promise<ProvisioningActionState> {
  const admin = await requireAdmin();
  const requestId = text(formData, 'request_id');
  const note = text(formData, 'note');
  if (!UUID.test(requestId)) return { ok: false, message: 'The request was not recognised.' };
  if (note.length < 10) return { ok: false, message: 'Add a note of at least 10 characters explaining the decision.' };
  const { error } = await createSupabaseAdminClient().rpc(fn, { p_id: requestId, p_actor: admin.userId, p_note: note, ...extra(note) });
  if (error) {
    const message = HINT_MESSAGE[error.hint ?? ''] ?? 'The decision was not applied. Reload and check the request.';
    return { ok: false, message };
  }
  await recordAdminAudit({
    actorId: admin.userId,
    storeId: null,
    action: label,
    entityType: 'account_provisioning_request',
    entityId: requestId,
    after: { note_length: note.length },
    actorType: 'super_admin',
  }).catch(() => undefined);
  revalidatePath('/admin/provisioning');
  return { ok: true, message: 'Decision recorded.' };
}

/** Messages for the refusals that the database returns with a hint. */
const HINT_MESSAGE: Record<string, string> = {
  confirm_mismatch: 'The retyped email does not match the request. Nothing was linked.',
  unverified_account: 'That account does not have a verified email matching the request, so it cannot be linked.',
  existing_membership: 'That account already belongs to an active store. Review it manually; it cannot be linked here.',
  forbidden: 'Only a platform administrator can do this.',
};

/**
 * Links an existing Auth account to a request. The database requires a platform administrator, a verified email that
 * matches the request, the request email retyped by the administrator, no active store membership, and a note.
 */
export async function linkExistingAction(_prev: ProvisioningActionState, formData: FormData): Promise<ProvisioningActionState> {
  const profile = text(formData, 'profile_id');
  const confirmEmail = text(formData, 'confirm_email');
  if (!UUID.test(profile)) return { ok: false, message: 'Enter the account id of the existing user.' };
  return reconcile(
    formData,
    'zb_prov_reconcile_link_existing',
    () => ({ p_profile: profile, p_confirm_email: confirmEmail }),
    'provisioning.link_existing',
  );
}

/** Records that an uncertain Auth attempt created nothing, so the request can be retried with a password. */
export async function resetUncertainAction(_prev: ProvisioningActionState, formData: FormData): Promise<ProvisioningActionState> {
  return reconcile(formData, 'zb_prov_reconcile_reset', () => ({}), 'provisioning.reset');
}

/** Cancels a request. The Auth account, if one exists, is left in place and is never deleted here. */
export async function cancelRequestAction(_prev: ProvisioningActionState, formData: FormData): Promise<ProvisioningActionState> {
  return reconcile(formData, 'zb_prov_reconcile_cancel', () => ({}), 'provisioning.cancel');
}
