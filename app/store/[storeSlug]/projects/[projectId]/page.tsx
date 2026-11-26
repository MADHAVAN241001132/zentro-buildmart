import Link from 'next/link';
import { notFound } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { formatRupees, translate } from '@/lib/i18n/translate';
import { currentLocale } from '@/lib/i18n/server';
import { readGuestSession } from '@/lib/services/guest';
import type { BudgetStatus } from '@/lib/planner/budget';
import type { Locale } from '@/lib/i18n/locales';
import { PlannerError, ROOM_LABELS, ROOM_TYPES, MEASURE_UNITS, PROJECT_TYPES, getProjectView, type PlannerLine, type ProjectView } from '@/lib/services/house-projects';
import { getStoreBySlug } from '@/lib/services/storefront';
import {
  addScopeToCartAction, changeLineVariantAction, createRoomAction, deleteProjectAction, deleteRoomAction,
  removeLineAction, requestQuotationAction, setLineQuantityAction, updateProjectAction, updateRoomAction,
} from '../actions';

export const dynamic = 'force-dynamic';

function LineRow({ line, storeSlug, projectId, locale }: { line: PlannerLine; storeSlug: string; projectId: string; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const hiddenBase = (
    <>
      <input type="hidden" name="storeSlug" value={storeSlug} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="itemId" value={line.itemId} />
    </>
  );
  return (
    <li className="grid gap-2 rounded-control border border-line bg-cream p-3 sm:grid-cols-[1fr_auto]">
      <div className="grid gap-1">
        <span className="font-semibold text-ink">{line.productName}</span>
        <span className="text-sm text-ink-muted">
          {line.unavailable
            ? t('projects.notSold')
            : `${line.variantLabel}${line.sizeLabel ? ` · ${line.sizeLabel}` : ''} · ${formatRupees(line.unitPricePaise, locale)} per ${line.priceUnit}${line.gstRateBps ? ` + ${t('common.gst')} ${line.gstRateBps / 100}%` : ''}`}
        </span>
        {line.shortOfStock ? <span className="text-sm font-semibold text-danger">{locale === 'ta' ? `${line.availableUnits} மட்டுமே இருப்பில் உள்ளது. கூடையில் கிடைப்பதை உறுதி செய்யும்.` : `Only ${line.availableUnits} in stock. The cart will confirm availability.`}</span> : null}
        {line.suggestedBoxes !== null ? (
          <span className="text-sm text-ink-muted">
            {t('projects.suggested', { count: `${line.suggestedBoxes} ${line.priceUnit === 'box' ? 'boxes' : line.priceUnit + 's'}` })}
          </span>
        ) : null}
      </div>

      {line.unavailable ? (
        <form action={removeLineAction} className="flex items-center">
          {hiddenBase}
          <button type="submit" className="text-sm font-semibold text-danger underline">{t('common.remove')}</button>
        </form>
      ) : (
        <div className="grid gap-2">
          <form action={setLineQuantityAction} className="flex flex-wrap items-center gap-2">
            {hiddenBase}
            <label className="text-sm text-ink-muted">
              {t('common.quantity')}
              <input name="quantity" type="number" min={1} max={999} step={1} defaultValue={line.quantity} required className="ml-2 w-24 rounded-control border border-line bg-card px-2 py-1" />
            </label>
            <button type="submit" className="rounded-control border border-burgundy px-3 py-1 text-sm font-semibold text-burgundy">{t('common.save')}</button>
          </form>
          {line.suggestedBoxes !== null && line.suggestedBoxes !== line.quantity ? (
            <form action={setLineQuantityAction}>
              {hiddenBase}
              <input type="hidden" name="quantity" value={line.suggestedBoxes} />
              <button type="submit" className="text-sm font-semibold text-burgundy underline">Use suggested {line.suggestedBoxes}</button>
            </form>
          ) : null}
          {line.alternatives.length > 1 ? (
            <form action={changeLineVariantAction} className="flex flex-wrap items-center gap-2">
              {hiddenBase}
              <select name="variantId" defaultValue={line.variantId} className="rounded-control border border-line bg-card px-2 py-1 text-sm">
                {line.alternatives.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}{a.sizeLabel ? ` · ${a.sizeLabel}` : ''} · {formatRupees(a.salePricePaise, locale)}</option>
                ))}
              </select>
              <button type="submit" className="text-sm font-semibold text-burgundy underline">Change</button>
            </form>
          ) : null}
          <div className="flex flex-wrap gap-3 text-sm">
            <form action={addScopeToCartAction}>
              <input type="hidden" name="storeSlug" value={storeSlug} />
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="scope" value={`line:${line.itemId}`} />
              <input type="hidden" name="requestKey" value={randomUUID()} />
              <button type="submit" className="font-semibold text-burgundy underline">{t('projects.addToCart')}</button>
            </form>
            <form action={removeLineAction}>
              {hiddenBase}
              <button type="submit" className="font-semibold text-danger underline">{t('common.remove')}</button>
            </form>
          </div>
        </div>
      )}
    </li>
  );
}

function Money({ label, paise, locale }: { label: string; paise: number; locale: Locale }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-semibold text-ink">{formatRupees(paise, locale)}</dd>
    </div>
  );
}

function BudgetPanel({ view, locale }: { view: ProjectView; locale: Locale }) {
  const b = view.budget;
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const STATUS_TEXT: Record<BudgetStatus, string> = {
    no_budget: t('projects.noBudget'),
    within: t('projects.budgetWithin'),
    near: t('projects.budgetNear', { percent: b.utilisationPercent ?? 0 }),
    exceeded: t('projects.budgetExceeded'),
  };
  const statusText = STATUS_TEXT[b.status];
  const tone = b.status === 'exceeded' ? 'border-danger bg-danger/10 text-danger' : b.status === 'near' ? 'border-gold bg-card text-ink' : 'border-line bg-card text-ink';
  return (
    <section aria-labelledby="budget-heading" className="grid gap-3 rounded-card border border-line bg-card p-5">
      <h2 id="budget-heading" className="font-display text-xl text-burgundy">{translate(locale, 'projects.estimate')}</h2>
      <dl className="grid gap-2">
        <Money label={translate(locale, 'projects.taxable')} paise={b.taxablePaise} locale={locale} />
        <Money label={translate(locale, 'common.gst')} paise={b.gstPaise} locale={locale} />
        <div className="border-t border-line pt-2"><Money label={translate(locale, 'projects.estimatedTotal')} paise={b.totalPaise} locale={locale} /></div>
        {b.budgetPaise !== null ? <Money label={translate(locale, 'projects.budgetLabel')} paise={b.budgetPaise} locale={locale} /> : null}
        {b.remainingPaise !== null ? <Money label={translate(locale, b.remainingPaise < 0 ? 'projects.overBy' : 'projects.remaining')} paise={Math.abs(b.remainingPaise)} locale={locale} /> : null}
      </dl>
      <p role={b.status === 'exceeded' ? 'alert' : 'status'} className={`rounded-control border p-3 text-sm ${tone}`}>{statusText}</p>
      <p className="text-xs text-ink-muted">{view.priceNote}</p>
    </section>
  );
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string; projectId: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { storeSlug, projectId } = await params;
  const { notice, error } = await searchParams;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();
  const session = await readGuestSession(store.id, storeSlug);
  if (!session) notFound();

  let view: ProjectView;
  try {
    view = await getProjectView(store.id, session.id, projectId);
  } catch (err) {
    if (err instanceof PlannerError) notFound();
    throw err;
  }
  const allRooms = view.rooms;
  const locale = await currentLocale();
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);

  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <Link href={`/store/${storeSlug}/projects`} className="text-sm font-semibold text-burgundy underline">All projects</Link>
        <h1 className="font-display text-3xl text-burgundy">{view.name}</h1>
        <p className="text-sm text-ink-muted">
          {view.projectType === 'construction' ? 'Construction' : 'Renovation'} project · {view.rooms.length} {view.rooms.length === 1 ? 'room' : 'rooms'}
        </p>
      </header>

      {notice ? <p role="status" className="rounded-card border border-line bg-card p-3 text-sm text-ink">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-card border border-danger bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}

      <BudgetPanel view={view} locale={locale} />

      <section aria-labelledby="budget-form-heading" className="grid gap-4 rounded-card border border-line bg-card p-5">
        <h2 id="budget-form-heading" className="font-display text-xl text-burgundy">{t('projects.name')}</h2>
        <form action={updateProjectAction} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="storeSlug" value={storeSlug} />
          <input type="hidden" name="projectId" value={projectId} />
          <label className="grid gap-1 text-sm font-semibold text-ink">
            Name
            <input name="name" required maxLength={120} defaultValue={view.name} className="rounded-control border border-line bg-cream px-3 py-2 font-normal" />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink">
            Type
            <select name="projectType" defaultValue={view.projectType} className="rounded-control border border-line bg-cream px-3 py-2 font-normal">
              {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t === 'construction' ? 'Construction' : 'Renovation'}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink">
            Budget in rupees (blank for none)
            <input name="budget" inputMode="decimal" defaultValue={view.budgetPaise === null ? '' : String(view.budgetPaise / 100)} className="rounded-control border border-line bg-cream px-3 py-2 font-normal" />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink">
            Notes
            <input name="description" maxLength={1000} defaultValue={view.description ?? ''} className="rounded-control border border-line bg-cream px-3 py-2 font-normal" />
          </label>
          <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
            <button type="submit" className="rounded-control bg-burgundy px-4 py-2.5 text-sm font-semibold text-cream">{t('common.save')}</button>
          </div>
        </form>
        <form action={deleteProjectAction}>
          <input type="hidden" name="storeSlug" value={storeSlug} />
          <input type="hidden" name="projectId" value={projectId} />
          <button type="submit" className="text-sm font-semibold text-danger underline">Delete this project</button>
        </form>
      </section>

      <section aria-labelledby="rooms-heading" className="grid gap-5">
        <h2 id="rooms-heading" className="font-display text-xl text-burgundy">Rooms</h2>

        {view.rooms.length === 0 ? <p className="text-sm text-ink-muted">No rooms yet. Add one below.</p> : null}

        {view.rooms.map((room) => {
          const roomTotal = view.budget.roomTotalsPaise[room.id] ?? 0;
          return (
            <article key={room.id} aria-labelledby={`room-${room.id}`} className="grid gap-4 rounded-card border border-line bg-card p-5">
              <header className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <h3 id={`room-${room.id}`} className="font-display text-lg text-burgundy">{room.name}</h3>
                  <p className="text-sm text-ink-muted">
                    {room.roomLabel}
                    {room.length !== null && room.width !== null ? ` · ${room.length} × ${room.width} ${room.measureUnit}` : ''}
                    {room.areaSqft !== null ? ` · ${room.areaSqft.toFixed(1)} ${t('projects.sqft')}` : ''}
                  </p>
                </div>
                <p className="text-sm font-semibold text-ink">{t('projects.roomEstimate')} {formatRupees(roomTotal, locale)}</p>
              </header>

              {room.lines.length === 0 ? <p className="text-sm text-ink-muted">No products in this room yet.</p> : (
                <ul className="grid gap-3">
                  {room.lines.map((line) => <LineRow key={line.itemId} line={line} storeSlug={storeSlug} projectId={projectId} locale={locale} />)}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/store/${storeSlug}/projects/${projectId}/products?roomId=${room.id}`} className="rounded-control border border-burgundy px-4 py-2 text-sm font-semibold text-burgundy">
                  Add products to this room
                </Link>
              </div>

              <div className="flex flex-wrap gap-4 text-sm">
                <form action={addScopeToCartAction}>
                  <input type="hidden" name="storeSlug" value={storeSlug} />
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="scope" value={`room:${room.id}`} />
                  <input type="hidden" name="requestKey" value={randomUUID()} />
                  <button type="submit" disabled={room.lines.length === 0} className="font-semibold text-burgundy underline disabled:opacity-50">Add this room to cart</button>
                </form>
                <form action={deleteRoomAction}>
                  <input type="hidden" name="storeSlug" value={storeSlug} />
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="roomId" value={room.id} />
                  <button type="submit" className="font-semibold text-danger underline">Delete room</button>
                </form>
              </div>

              <details className="text-sm">
                <summary className="cursor-pointer font-semibold text-burgundy">Edit room</summary>
                <form action={updateRoomAction} className="mt-3 grid gap-3 sm:grid-cols-3">
                  <input type="hidden" name="storeSlug" value={storeSlug} />
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="roomId" value={room.id} />
                  <label className="grid gap-1 font-semibold text-ink">
                    Room type
                    <select name="roomType" defaultValue={room.roomType} className="rounded-control border border-line bg-cream px-2 py-2 font-normal">
                      {ROOM_TYPES.map((t) => <option key={t} value={t}>{ROOM_LABELS[t]}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 font-semibold text-ink">
                    Name
                    <input name="name" required maxLength={80} defaultValue={room.name} className="rounded-control border border-line bg-cream px-2 py-2 font-normal" />
                  </label>
                  <label className="grid gap-1 font-semibold text-ink">
                    Unit
                    <select name="measureUnit" defaultValue={room.measureUnit} className="rounded-control border border-line bg-cream px-2 py-2 font-normal">
                      {MEASURE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1 font-semibold text-ink">
                    Length
                    <input name="length" inputMode="decimal" defaultValue={room.length ?? ''} className="rounded-control border border-line bg-cream px-2 py-2 font-normal" />
                  </label>
                  <label className="grid gap-1 font-semibold text-ink">
                    Width
                    <input name="width" inputMode="decimal" defaultValue={room.width ?? ''} className="rounded-control border border-line bg-cream px-2 py-2 font-normal" />
                  </label>
                  <label className="grid gap-1 font-semibold text-ink">
                    Height (optional)
                    <input name="height" inputMode="decimal" defaultValue={room.height ?? ''} className="rounded-control border border-line bg-cream px-2 py-2 font-normal" />
                  </label>
                  <div className="sm:col-span-3">
                    <button type="submit" className="rounded-control border border-burgundy px-4 py-2 text-sm font-semibold text-burgundy">Save room</button>
                  </div>
                </form>
              </details>
            </article>
          );
        })}

        <section aria-labelledby="add-room-heading" className="grid gap-4 rounded-card border border-dashed border-line p-5">
          <h3 id="add-room-heading" className="font-display text-lg text-burgundy">Add a room</h3>
          <form action={createRoomAction} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="storeSlug" value={storeSlug} />
            <input type="hidden" name="projectId" value={projectId} />
            <label className="grid gap-1 text-sm font-semibold text-ink">
              Room type
              <select name="roomType" defaultValue="living_room" className="rounded-control border border-line bg-cream px-2 py-2 font-normal">
                {ROOM_TYPES.map((t) => <option key={t} value={t}>{ROOM_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-ink">
              Name
              <input name="name" maxLength={80} className="rounded-control border border-line bg-cream px-2 py-2 font-normal" placeholder="Leave blank to use the type" />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-ink">
              Unit
              <select name="measureUnit" defaultValue="ft" className="rounded-control border border-line bg-cream px-2 py-2 font-normal">
                {MEASURE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-ink">
              Length
              <input name="length" inputMode="decimal" className="rounded-control border border-line bg-cream px-2 py-2 font-normal" />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-ink">
              Width
              <input name="width" inputMode="decimal" className="rounded-control border border-line bg-cream px-2 py-2 font-normal" />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-ink">
              Height (optional)
              <input name="height" inputMode="decimal" className="rounded-control border border-line bg-cream px-2 py-2 font-normal" />
            </label>
            <div className="sm:col-span-3">
              <button type="submit" className="rounded-control bg-burgundy px-4 py-2.5 text-sm font-semibold text-cream">Add room</button>
            </div>
          </form>
        </section>
      </section>

      <section aria-labelledby="project-lines-heading" className="grid gap-4 rounded-card border border-line bg-card p-5">
        <h2 id="project-lines-heading" className="font-display text-xl text-burgundy">Project-level products</h2>
        <p className="text-sm text-ink-muted">Products not tied to one room, such as shared fittings.</p>
        {view.projectLines.length === 0 ? null : (
          <ul className="grid gap-3">
            {view.projectLines.map((line) => <LineRow key={line.itemId} line={line} storeSlug={storeSlug} projectId={projectId} locale={locale} />)}
          </ul>
        )}
        <div>
          <Link href={`/store/${storeSlug}/projects/${projectId}/products`} className="rounded-control border border-burgundy px-4 py-2 text-sm font-semibold text-burgundy">
            Add products to the project
          </Link>
        </div>
      </section>

      <section aria-labelledby="cart-heading" className="grid gap-4 rounded-card border border-line bg-card p-5">
        <h2 id="cart-heading" className="font-display text-xl text-burgundy">Buy or ask for a price</h2>
        <p className="text-sm text-ink-muted">
          Adding to the cart checks prices and stock again. A quotation sends the quantities to the store, which prices them and replies.
        </p>
        <form action={addScopeToCartAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="storeSlug" value={storeSlug} />
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="scope" value="project" />
          <input type="hidden" name="requestKey" value={randomUUID()} />
          <button type="submit" disabled={allRooms.length === 0 && view.projectLines.length === 0} className="rounded-control bg-burgundy px-4 py-2.5 text-sm font-semibold text-cream disabled:opacity-50">
            {t('projects.addWholeToCart')}
          </button>
        </form>

        <form action={requestQuotationAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="storeSlug" value={storeSlug} />
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="requestKey" value={randomUUID()} />
          <label className="grid gap-1 text-sm font-semibold text-ink">
            {t('quote.quoteFor')}
            <select name="scope" defaultValue="project" className="rounded-control border border-line bg-cream px-3 py-2 font-normal">
              <option value="project">{t('quote.wholeProject')}</option>
              {allRooms.map((r) => <option key={r.id} value={`room:${r.id}`}>{r.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink">
            {t('quote.yourName')}
            <input name="customerName" required maxLength={120} className="rounded-control border border-line bg-cream px-3 py-2 font-normal" />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink">
            {t('quote.mobile')}
            <input name="customerMobile" required inputMode="tel" maxLength={20} className="rounded-control border border-line bg-cream px-3 py-2 font-normal" />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink">
            {t('quote.email')}
            <input name="customerEmail" type="email" maxLength={160} className="rounded-control border border-line bg-cream px-3 py-2 font-normal" />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink sm:col-span-2">
            {t('quote.requirements')}
            <input name="requirements" maxLength={1000} className="rounded-control border border-line bg-cream px-3 py-2 font-normal" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="rounded-control border border-burgundy px-4 py-2.5 text-sm font-semibold text-burgundy">{t('quote.submit')}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
