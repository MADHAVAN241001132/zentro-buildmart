import { PageHeader } from '@/components/owner/page-header';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getAiConfig } from '@/lib/visualizer/ai-service';
import { saveStoreAiSettingsAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminAiVisualizerPage() {
  const admin = createSupabaseAdminClient();
  const aiCfg = getAiConfig();
  const hasApiKey = Boolean(aiCfg.apiKey);

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const [{ data: stores }, { data: settingsRows }, { data: sessions }] = await Promise.all([
    admin.from('stores').select('id, name, slug, status').order('name'),
    admin.from('ai_visualizer_store_settings').select('*'),
    admin
      .from('ai_visualizer_sessions')
      .select('store_id, status, estimated_cost_usd, created_at')
      .gte('created_at', startOfMonth.toISOString()),
  ]);

  const settingsByStore = new Map(
    ((settingsRows ?? []) as Record<string, unknown>[]).map((r) => [r.store_id as string, r]),
  );

  const usageByStore = new Map<string, { completed: number; failed: number; costUsd: number }>();
  let totalCompleted = 0;
  let totalFailed = 0;
  let totalCostUsd = 0;

  for (const s of (sessions ?? []) as { store_id: string; status: string; estimated_cost_usd: number | null }[]) {
    const entry = usageByStore.get(s.store_id) ?? { completed: 0, failed: 0, costUsd: 0 };
    if (s.status === 'completed') {
      entry.completed++;
      entry.costUsd += Number(s.estimated_cost_usd ?? 0);
      totalCompleted++;
      totalCostUsd += Number(s.estimated_cost_usd ?? 0);
    } else if (s.status === 'failed') {
      entry.failed++;
      totalFailed++;
    }
    usageByStore.set(s.store_id, entry);
  }

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Platform AI"
        title="AI Room Visualizer & Cost Control"
        description="Configure Local ComfyUI / Hugging Face / OpenAI models, image quality, and per-store monthly/daily generation quotas."
      />

      {!hasApiKey ? (
        <div role="alert" className="rounded-card border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">
            {aiCfg.provider === 'disabled'
              ? 'AI Room Visualizer is disabled in this environment.'
              : aiCfg.provider === 'huggingface'
                ? 'Hugging Face Token is not configured (`HF_TOKEN` is empty).'
                : 'OpenAI API Key is not configured (`OPENAI_API_KEY` is empty).'}
          </p>
          <p className="mt-1 text-xs">
            {aiCfg.provider === 'disabled'
              ? 'Set `AI_IMAGE_PROVIDER` to `huggingface` or `openai` with a valid API key in Vercel Environment Variables to enable live AI image generation.'
              : aiCfg.provider === 'huggingface'
                ? 'Add `HF_TOKEN` in `.env.local` (and Vercel Environment Variables) with Inference Providers access to enable live AI image generation.'
                : 'Add `OPENAI_API_KEY` in `.env.local` (and Vercel Environment Variables for production) with an active OpenAI billing tier to enable live AI image generation.'}
          </p>
        </div>
      ) : (
        <div className="rounded-card border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">
          <p className="font-semibold">
            {aiCfg.provider === 'comfyui'
              ? 'Local ComfyUI Backend Active ($0.00 External API Cost)'
              : aiCfg.provider === 'huggingface'
                ? 'Hugging Face Inference Providers Active'
                : 'OpenAI Integration Active'}
          </p>
          <p className="mt-1 text-xs">
            {aiCfg.provider === 'comfyui' ? (
              <>
                Provider: <code>comfyui</code> · Endpoint: <code>{aiCfg.comfyuiBaseUrl}</code> · Checkpoint: <code>{aiCfg.comfyuiCheckpoint}</code>
              </>
            ) : (
              <>
                Provider: <code>{aiCfg.provider}</code> · Image model: <code>{aiCfg.imageModel}</code> · Vision model: <code>{aiCfg.visionModel}</code>
              </>
            )}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-card border border-line bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-ink-muted">Monthly Generations</p>
          <p className="mt-1 font-display text-3xl text-burgundy">{totalCompleted}</p>
        </div>
        <div className="rounded-card border border-line bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-ink-muted">Failed Attempts</p>
          <p className="mt-1 font-display text-3xl text-danger">{totalFailed}</p>
        </div>
        <div className="rounded-card border border-line bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-ink-muted">Est. Monthly API Spend</p>
          <p className="mt-1 font-display text-3xl text-burgundy">${totalCostUsd.toFixed(2)}</p>
        </div>
      </div>

      <section className="grid gap-4">
        <h2 className="font-display text-2xl text-burgundy">Store Quotas &amp; Model Settings</h2>
        <div className="grid gap-4">
          {((stores ?? []) as { id: string; name: string; slug: string; status: string }[]).map((store) => {
            const st = settingsByStore.get(store.id);
            const usage = usageByStore.get(store.id) ?? { completed: 0, failed: 0, costUsd: 0 };
            const monthlyLimit = typeof st?.monthly_limit === 'number' ? st.monthly_limit : 100;
            const dailyLimit = typeof st?.daily_limit === 'number' ? st.daily_limit : 20;
            const guestLimit = typeof st?.guest_session_daily_limit === 'number' ? st.guest_session_daily_limit : 10;
            const defaultModel = typeof st?.default_model === 'string' ? st.default_model : aiCfg.imageModel;
            const previewModel = typeof st?.preview_model === 'string' ? st.preview_model : aiCfg.previewModel;
            const imageQuality = typeof st?.image_quality === 'string' ? st.image_quality : 'high';
            const remaining = Math.max(0, monthlyLimit - usage.completed);

            return (
              <form
                key={store.id}
                action={saveStoreAiSettingsAction}
                className="grid gap-4 rounded-card border border-line bg-card p-5"
              >
                <input type="hidden" name="storeId" value={store.id} />
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                  <div>
                    <h3 className="font-display text-lg text-burgundy">{store.name}</h3>
                    <p className="text-xs text-ink-muted">/store/{store.slug} · {store.status}</p>
                  </div>
                  <div className="text-right text-xs text-ink-muted">
                    <p>Used this month: <strong className="text-ink">{usage.completed}</strong> / {monthlyLimit} (Remaining: {remaining})</p>
                    <p>Failed: {usage.failed} · Est. spend: ${usage.costUsd.toFixed(2)}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <label className="grid gap-1 text-xs font-medium text-ink">
                    Monthly Limit
                    <input type="number" name="monthlyLimit" defaultValue={monthlyLimit} min={0} suppressHydrationWarning className="rounded-control border border-line bg-white px-2.5 py-1.5 text-sm" />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-ink">
                    Daily Limit
                    <input type="number" name="dailyLimit" defaultValue={dailyLimit} min={0} suppressHydrationWarning className="rounded-control border border-line bg-white px-2.5 py-1.5 text-sm" />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-ink">
                    Guest Daily Limit
                    <input type="number" name="guestSessionDailyLimit" defaultValue={guestLimit} min={1} suppressHydrationWarning className="rounded-control border border-line bg-white px-2.5 py-1.5 text-sm" />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-ink">
                    Default Model
                    <input type="text" name="defaultModel" defaultValue={defaultModel} suppressHydrationWarning className="rounded-control border border-line bg-white px-2.5 py-1.5 text-sm" />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-ink">
                    Preview Model
                    <input type="text" name="previewModel" defaultValue={previewModel} suppressHydrationWarning className="rounded-control border border-line bg-white px-2.5 py-1.5 text-sm" />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-ink">
                    Quality
                    <select name="imageQuality" defaultValue={imageQuality} suppressHydrationWarning className="rounded-control border border-line bg-white px-2.5 py-1.5 text-sm">
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                      <option value="auto">Auto</option>
                    </select>
                  </label>
                </div>

                <div className="flex justify-end">
                  <button type="submit" suppressHydrationWarning className="rounded-control bg-burgundy px-4 py-1.5 text-xs font-semibold text-cream hover:bg-burgundy-deep">
                    Save store AI quota
                  </button>
                </div>
              </form>
            );
          })}
        </div>
      </section>
    </div>
  );
}
