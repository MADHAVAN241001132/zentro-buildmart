import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export class ReportAccessError extends Error {
  readonly status = 403;
  constructor() {
    super('You do not have permission to view reports for this store.');
  }
}

/**
 * Every report read calls this before it uses the service-role client. The caller's own session decides, through
 * zb_my_store_permissions, so a caller that forgets its page or route gate cannot read another store's figures.
 * The same key gates the report pages and the export route (reports_exports).
 */
export async function requireReportStore(storeId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(storeId)) throw new ReportAccessError();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('zb_my_store_permissions', { p_store: storeId });
  if (error || !Array.isArray(data) || !data.includes('reports_exports')) throw new ReportAccessError();
}
