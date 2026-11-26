/**
 * Service-role Supabase client. Bypasses RLS.
 * Use only in server code that has already verified its caller: webhooks, cron, guest writes.
 * Never import this module from a Client Component. The 'server-only' guard enforces that.
 */
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/lib/env';
import type { Database } from '@/types/database';

let cached: ReturnType<typeof createClient<Database>> | undefined;

export function createSupabaseAdminClient() {
  if (!cached) {
    cached = createClient<Database>(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
