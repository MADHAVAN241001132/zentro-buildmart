import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readGuestSession } from '@/lib/services/guest';
import { isFeatureEnabled } from '@/lib/services/entitlements';
import { listProjects, PROJECT_TYPES } from '@/lib/services/house-projects';
import { getStoreBySlug } from '@/lib/services/storefront';
import { formatRupees, translate } from '@/lib/i18n/translate';
import { currentLocale } from '@/lib/i18n/server';
import { createProjectAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { storeSlug } = await params;
  const { notice, error } = await searchParams;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();
  const [session, locale, visualizerEnabled] = await Promise.all([
    readGuestSession(store.id, storeSlug),
    currentLocale(),
    isFeatureEnabled(store.id, 'room_visualiser'),
  ]);
  const projects = session ? await listProjects(store.id, session.id) : [];
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">{t('projects.title')}</p>
        <h1 className="font-display text-3xl text-burgundy">{t('projects.title')}</h1>
        <p className="max-w-2xl text-sm text-ink-muted">{t('projects.intro')}</p>
      </header>

      {notice ? <p role="status" className="rounded-card border border-line bg-card p-3 text-sm text-ink">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-card border border-danger bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}

      <section aria-labelledby="new-project" className="grid gap-4 rounded-card border border-line bg-card p-5">
        <h2 id="new-project" className="font-display text-xl text-burgundy">{t('projects.newProject')}</h2>
        <form action={createProjectAction} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="storeSlug" value={storeSlug} />
          <label className="grid gap-1 text-sm font-semibold text-ink">
            {t('projects.name')}
            <input name="name" required maxLength={120} className="rounded-control border border-line bg-cream px-3 py-2 font-normal" placeholder="Ground floor renovation" />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink">
            {t('projects.type')}
            <select name="projectType" defaultValue="renovation" className="rounded-control border border-line bg-cream px-3 py-2 font-normal">
              {PROJECT_TYPES.map((pt) => <option key={pt} value={pt}>{t(pt === 'construction' ? 'projects.construction' : 'projects.renovation')}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink">
            {t('projects.budget')}
            <input name="budget" inputMode="decimal" className="rounded-control border border-line bg-cream px-3 py-2 font-normal" placeholder="250000" />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink">
            Notes (optional)
            <input name="description" maxLength={1000} className="rounded-control border border-line bg-cream px-3 py-2 font-normal" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="rounded-control bg-burgundy px-4 py-2.5 text-sm font-semibold text-cream">{t('projects.create')}</button>
          </div>
        </form>
      </section>

      <section aria-labelledby="projects-heading" className="grid gap-3">
        <h2 id="projects-heading" className="font-display text-xl text-burgundy">{t('projects.yourProjects')}</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('empty.projects')}</p>
        ) : (
          <ul className="grid gap-3">
            {projects.map((project) => (
              <li key={project.id}>
                <Link href={`/store/${storeSlug}/projects/${project.id}`} className="grid gap-1 rounded-card border border-line bg-card p-4 hover:border-burgundy">
                  <span className="font-semibold text-ink">{project.name}</span>
                  <span className="text-sm text-ink-muted">
                    {t(project.projectType === 'construction' ? 'projects.construction' : 'projects.renovation')}
                    {project.budgetPaise === null ? ` · ${t('projects.noBudget')}` : ` · ${formatRupees(project.budgetPaise, locale)}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {visualizerEnabled ? (
        <p className="text-sm text-ink-muted">
          Want to see how a room looks first? <Link href={`/store/${storeSlug}/visualizer`} className="font-semibold text-burgundy underline">Open the visualizer</Link>.
        </p>
      ) : null}
    </div>
  );
}
