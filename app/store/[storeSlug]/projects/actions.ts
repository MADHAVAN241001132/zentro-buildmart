'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ensureGuestSession } from '@/lib/services/guest';
import { getStoreBySlug } from '@/lib/services/storefront';
import { parseRupeesToPaise } from '@/lib/money';
import { MEASURE_UNITS, PROJECT_TYPES, ROOM_TYPES, PlannerError, addScopeToCart, changeLineVariant, createProject, createRoom, deleteProject, deleteRoom, removeLine, requestScopeQuotation, setLine, setLineQuantity, updateProject, updateRoom, type CartScope, type ProjectInput, type RoomInput, type QuotationRequestInput } from '@/lib/services/house-projects';
import type { LengthUnit } from '@/lib/calculator/tiles';
import { validRequestKey } from '@/lib/services/request-keys';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{3,40}$/;

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function uuidField(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return UUID.test(value) ? value : null;
}

function numberField(formData: FormData, key: string): number | null {
  const value = text(formData, key).trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * A return path from the product picker. Accepted only when it is this store's picker page for this
 * project, so a forged value cannot send the guest elsewhere.
 */
function returnPathFor(formData: FormData, storeSlug: string, projectId: string): string | null {
  const value = text(formData, 'returnTo');
  const pattern = new RegExp(`^/store/${storeSlug}/projects/${projectId}/products(\\?[A-Za-z0-9=&%_.+-]{0,400})?$`, 'i');
  return pattern.test(value) ? value : null;
}

function projectPath(storeSlug: string, projectId?: string | null): string {
  return projectId ? `/store/${storeSlug}/projects/${projectId}` : `/store/${storeSlug}/projects`;
}

function go(path: string, notice?: string, error?: string): never {
  const params = new URLSearchParams();
  if (notice) params.set('notice', notice.slice(0, 300));
  if (error) params.set('error', error.slice(0, 300));
  const query = params.toString();
  redirect(query ? `${path}?${query}` : path);
  throw new Error('redirect did not run');
}

/** Store and guest session for the signed-in-to-this-browser guest. Refuses an unknown store. */
async function context(formData: FormData) {
  const slug = text(formData, 'storeSlug');
  if (!SLUG.test(slug)) redirect('/');
  const store = await getStoreBySlug(slug);
  if (!store) redirect('/');
  const session = await ensureGuestSession(store.id, slug);
  return { slug, storeId: store.id as string, sessionId: session.id as string };
}

function projectInput(formData: FormData): ProjectInput | string {
  const budgetText = text(formData, 'budget').trim();
  let budgetPaise: number | null = null;
  if (budgetText) {
    budgetPaise = parseRupeesToPaise(budgetText);
    if (budgetPaise === null) return 'Enter the budget as an amount in rupees.';
  }
  const type = text(formData, 'projectType');
  return {
    name: text(formData, 'name'),
    description: text(formData, 'description'),
    projectType: (PROJECT_TYPES as readonly string[]).includes(type) ? (type as ProjectInput['projectType']) : 'renovation',
    budgetPaise,
  };
}

function roomInput(formData: FormData): RoomInput | string {
  const dims = [numberField(formData, 'length'), numberField(formData, 'width'), numberField(formData, 'height')];
  if (dims.some((d) => Number.isNaN(d))) return 'Dimensions must be numbers.';
  const unit = text(formData, 'measureUnit');
  const roomType = text(formData, 'roomType');
  return {
    roomType: (ROOM_TYPES as readonly string[]).includes(roomType) ? (roomType as RoomInput['roomType']) : 'custom',
    name: text(formData, 'name'),
    length: dims[0] as number | null,
    width: dims[1] as number | null,
    height: dims[2] as number | null,
    measureUnit: (MEASURE_UNITS as readonly string[]).includes(unit) ? (unit as LengthUnit) : 'ft',
  };
}

/** Scope from the form: "project", "room:<uuid>" or "line:<uuid>". */
function scopeFrom(formData: FormData): CartScope | null {
  const value = text(formData, 'scope');
  if (value === 'project') return { type: 'project' };
  const [kind, id] = value.split(':');
  if (!id || !UUID.test(id)) return null;
  if (kind === 'room') return { type: 'room', roomId: id };
  if (kind === 'line') return { type: 'line', itemId: id };
  return null;
}

/** Runs a planner write and returns to its page with a notice or an error. */
async function act(formData: FormData, run: (ctx: Awaited<ReturnType<typeof context>>) => Promise<{ path: string; notice: string }>): Promise<never> {
  const ctx = await context(formData);
  let outcome: { path: string; notice: string } | { path: string; error: string };
  try {
    const result = await run(ctx);
    outcome = { path: result.path, notice: result.notice };
    revalidatePath(`/store/${ctx.slug}/projects`, 'page');
    revalidatePath(`/store/${ctx.slug}`, 'layout');
  } catch (error) {
    outcome = {
      path: projectPath(ctx.slug, uuidField(formData, 'projectId')),
      error: error instanceof PlannerError ? (error as PlannerError).message : 'Something went wrong. Please try again.',
    };
  }
  if ('error' in outcome) go(outcome.path, undefined, outcome.error);
  go(outcome.path, outcome.notice);
}

export async function createProjectAction(formData: FormData): Promise<never> {
  const input = projectInput(formData);
  if (typeof input === 'string') {
    const ctx = await context(formData);
    go(projectPath(ctx.slug), undefined, input);
  }
  return act(formData, async (ctx) => {
    const id = await createProject(ctx.storeId, ctx.sessionId, input);
    return { path: projectPath(ctx.slug, id), notice: 'Project created.' };
  });
}

export async function updateProjectAction(formData: FormData): Promise<never> {
  const projectId = uuidField(formData, 'projectId');
  const input = projectInput(formData);
  if (!projectId || typeof input === 'string') {
    const ctx = await context(formData);
    go(projectPath(ctx.slug, projectId), undefined, typeof input === 'string' ? input : 'That project could not be found.');
  }
  return act(formData, async (ctx) => {
    await updateProject(ctx.storeId, ctx.sessionId, projectId, input);
    return { path: projectPath(ctx.slug, projectId), notice: 'Project saved.' };
  });
}

export async function deleteProjectAction(formData: FormData): Promise<never> {
  const projectId = uuidField(formData, 'projectId');
  return act(formData, async (ctx) => {
    if (!projectId) throw new PlannerError('That project could not be found.');
    await deleteProject(ctx.storeId, ctx.sessionId, projectId);
    return { path: projectPath(ctx.slug), notice: 'Project deleted.' };
  });
}

export async function createRoomAction(formData: FormData): Promise<never> {
  const projectId = uuidField(formData, 'projectId');
  const input = roomInput(formData);
  return act(formData, async (ctx) => {
    if (!projectId) throw new PlannerError('That project could not be found.');
    if (typeof input === 'string') throw new PlannerError(input);
    await createRoom(ctx.storeId, ctx.sessionId, projectId, input);
    return { path: projectPath(ctx.slug, projectId), notice: 'Room added.' };
  });
}

export async function updateRoomAction(formData: FormData): Promise<never> {
  const projectId = uuidField(formData, 'projectId');
  const roomId = uuidField(formData, 'roomId');
  const input = roomInput(formData);
  return act(formData, async (ctx) => {
    if (!roomId) throw new PlannerError('That room could not be found.');
    if (typeof input === 'string') throw new PlannerError(input);
    await updateRoom(ctx.storeId, ctx.sessionId, roomId, input);
    return { path: projectPath(ctx.slug, projectId), notice: 'Room saved.' };
  });
}

export async function deleteRoomAction(formData: FormData): Promise<never> {
  const projectId = uuidField(formData, 'projectId');
  const roomId = uuidField(formData, 'roomId');
  return act(formData, async (ctx) => {
    if (!roomId) throw new PlannerError('That room could not be found.');
    await deleteRoom(ctx.storeId, ctx.sessionId, roomId);
    return { path: projectPath(ctx.slug, projectId), notice: 'Room removed.' };
  });
}

export async function setLineAction(formData: FormData): Promise<never> {
  const projectId = uuidField(formData, 'projectId');
  const roomId = uuidField(formData, 'roomId');
  const variantId = uuidField(formData, 'variantId');
  const quantity = numberField(formData, 'quantity');
  return act(formData, async (ctx) => {
    if (!projectId || !variantId) throw new PlannerError('Choose a product to add.');
    if (quantity === null || Number.isNaN(quantity)) throw new PlannerError('Quantity must be a whole number from 1 to 999.');
    await setLine(ctx.storeId, ctx.sessionId, projectId, roomId, variantId, quantity);
    return { path: returnPathFor(formData, ctx.slug, projectId) ?? projectPath(ctx.slug, projectId), notice: 'Product added to the plan.' };
  });
}

export async function setLineQuantityAction(formData: FormData): Promise<never> {
  const projectId = uuidField(formData, 'projectId');
  const itemId = uuidField(formData, 'itemId');
  const quantity = numberField(formData, 'quantity');
  return act(formData, async (ctx) => {
    if (!itemId) throw new PlannerError('That line could not be found.');
    if (quantity === null || Number.isNaN(quantity)) throw new PlannerError('Quantity must be a whole number from 1 to 999.');
    await setLineQuantity(ctx.storeId, ctx.sessionId, itemId, quantity);
    return { path: projectPath(ctx.slug, projectId), notice: 'Quantity updated.' };
  });
}

export async function removeLineAction(formData: FormData): Promise<never> {
  const projectId = uuidField(formData, 'projectId');
  const itemId = uuidField(formData, 'itemId');
  return act(formData, async (ctx) => {
    if (!itemId) throw new PlannerError('That line could not be found.');
    await removeLine(ctx.storeId, ctx.sessionId, itemId);
    return { path: projectPath(ctx.slug, projectId), notice: 'Line removed.' };
  });
}

export async function changeLineVariantAction(formData: FormData): Promise<never> {
  const projectId = uuidField(formData, 'projectId');
  const itemId = uuidField(formData, 'itemId');
  const variantId = uuidField(formData, 'variantId');
  return act(formData, async (ctx) => {
    if (!itemId || !variantId) throw new PlannerError('Choose another size or finish.');
    await changeLineVariant(ctx.storeId, ctx.sessionId, itemId, variantId);
    return { path: projectPath(ctx.slug, projectId), notice: 'Size or finish changed.' };
  });
}

export async function addScopeToCartAction(formData: FormData): Promise<never> {
  const projectId = uuidField(formData, 'projectId');
  const scope = scopeFrom(formData);
  const requestKey = validRequestKey(text(formData, 'requestKey'));
  return act(formData, async (ctx) => {
    if (!projectId || !scope || !requestKey) throw new PlannerError('That request could not be understood. Please reload the page.');
    const result = await addScopeToCart(ctx.storeId, ctx.sessionId, projectId, scope, requestKey);
    const parts = [`Added ${result.added} ${result.added === 1 ? 'product' : 'products'} to your cart.`];
    if (result.alreadyApplied > 0) parts.push(`${result.alreadyApplied} already in your cart from an earlier attempt.`);
    if (result.problems.length > 0) parts.push(`Not added: ${result.problems.join(' ')}`);
    if (result.uncertain.length > 0) parts.push(`Could not confirm: ${result.uncertain.join(', ')}. Check your cart before adding them again.`);
    if (result.takenOver) parts.push('A newer attempt took over this request; check your cart.');
    const notice = parts.join(' ');
    return { path: projectPath(ctx.slug, projectId), notice };
  });
}

export async function requestQuotationAction(formData: FormData): Promise<never> {
  const projectId = uuidField(formData, 'projectId');
  const scope = scopeFrom(formData);
  const requestKey = validRequestKey(text(formData, 'requestKey'));
  const customer: QuotationRequestInput = {
    customerName: text(formData, 'customerName'),
    customerMobile: text(formData, 'customerMobile'),
    customerEmail: text(formData, 'customerEmail') || null,
    requirements: text(formData, 'requirements') || null,
    deliveryAddress: text(formData, 'deliveryAddress') || null,
    deliveryExpectation: text(formData, 'deliveryExpectation') || null,
  };
  return act(formData, async (ctx) => {
    if (!projectId || !scope || !requestKey) throw new PlannerError('That request could not be understood. Please reload the page.');
    const quotationId = await requestScopeQuotation(ctx.storeId, ctx.sessionId, projectId, scope, customer, requestKey);
    return { path: `/store/${ctx.slug}/quotes/${quotationId}`, notice: 'Quotation request sent. The store will respond with prices.' };
  });
}
