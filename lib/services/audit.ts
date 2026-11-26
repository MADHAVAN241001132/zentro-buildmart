import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export interface AuditInput {
  actorId: string;
  storeId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** Defaults to super_admin. Store owners acting on their own staff are recorded as shop_owner. */
  actorType?: 'super_admin' | 'shop_owner';
}

/**
 * Writes an audit row for a platform administrator action. The audit_logs table has no insert policy
 * for users, so this uses the service role after the caller has verified admin access.
 * Throws if the write fails, so the caller can report that the record was not audited.
 */
export async function recordAdminAudit(input: AuditInput): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('audit_logs').insert({
    store_id: input.storeId ?? null,
    actor_id: input.actorId,
    actor_type: input.actorType ?? 'super_admin',
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    before_state: input.before ?? null,
    after_state: input.after ?? null,
  });
  if (error) throw new Error('Audit log write failed');
}
