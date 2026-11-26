import 'server-only';
import { assertFeature } from '@/lib/services/entitlements';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { guestRequestQuotationOnce, QuotationError } from '@/lib/services/quotations';
import { addCartLinesOnce } from '@/lib/services/once-cart';
import { getProductDetailsByIds, type ProductDetail, type VariantInfo } from '@/lib/services/storefront';
import { calculateTiles, TileInputError, type LengthUnit } from '@/lib/calculator/tiles';
import { estimateBudget, validPlannerQuantity, type PlannerBudgetSummary } from '@/lib/planner/budget';
import {
  claimRequestKey, completeRequestKey, failRequestKey, RequestKeyError, saveRequestProgress,
  type Claim, type ClaimResult, type RequestKind,
} from '@/lib/services/request-keys';

/** A message that is safe to show to the guest. */
export class PlannerError extends Error {}

export const ROOM_TYPES = [
  'living_room', 'bedroom', 'kitchen', 'bathroom', 'dining_room',
  'balcony', 'parking_area', 'outdoor_area', 'custom',
] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const ROOM_LABELS: Record<RoomType, string> = {
  living_room: 'Living room',
  bedroom: 'Bedroom',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  dining_room: 'Dining room',
  balcony: 'Balcony',
  parking_area: 'Parking area',
  outdoor_area: 'Outdoor area',
  custom: 'Custom area',
};

export const PROJECT_TYPES = ['construction', 'renovation'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const MEASURE_UNITS = ['ft', 'm', 'cm', 'mm'] as const;

const MAX_PROJECTS_MESSAGE = 'You can keep up to 20 projects. Delete one to start another.';
const MAX_ROOMS_MESSAGE = 'A project can hold up to 30 rooms.';
const UNIQUE_VIOLATION = '23505';
const SCOPE_VIOLATION = '42501';
const LIMIT_VIOLATION = 'P0001';

function dbFailure(): never {
  throw new PlannerError('Something went wrong. Please try again.');
}

function mapWriteError(error: { code?: string; message?: string }): never {
  if (error.code === SCOPE_VIOLATION) throw new PlannerError('That product is not available in this showroom.');
  if (error.code === LIMIT_VIOLATION) throw new PlannerError(error.message?.includes('room') ? MAX_ROOMS_MESSAGE : MAX_PROJECTS_MESSAGE);
  if (error.code === UNIQUE_VIOLATION) throw new PlannerError('That product is already in this room. Change its quantity instead.');
  dbFailure();
}

export interface ProjectInput {
  name: string;
  description: string | null;
  projectType: ProjectType;
  /** Budget in paise, or null when none is set. */
  budgetPaise: number | null;
}

export interface RoomInput {
  roomType: RoomType;
  name: string;
  length: number | null;
  width: number | null;
  height: number | null;
  measureUnit: LengthUnit;
}

export interface ProjectSummary {
  id: string;
  name: string;
  projectType: ProjectType;
  budgetPaise: number | null;
  updatedAt: string;
}

export interface PlannerLine {
  itemId: string;
  roomId: string | null;
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  imageUrl: string | null;
  variantLabel: string;
  sizeLabel: string | null;
  unitPricePaise: number;
  priceUnit: string;
  gstRateBps: number;
  quantity: number;
  availableUnits: number;
  /** Stock is short for this quantity; the line still counts in the estimate. */
  shortOfStock: boolean;
  /** The product is no longer sold; the line is left out of totals and cart actions. */
  unavailable: boolean;
  /** Box-quantity suggestion from the room's area, when the product records coverage. */
  suggestedBoxes: number | null;
  /** Other sizes or finishes of the same product that the guest can switch to. */
  alternatives: { id: string; label: string; sizeLabel: string | null; salePricePaise: number }[];
}

export interface ProjectOption {
  id: string;
  name: string;
  rooms: { id: string; name: string; roomLabel: string }[];
}

export interface RoomView {
  id: string;
  roomType: RoomType;
  roomLabel: string;
  name: string;
  length: number | null;
  width: number | null;
  height: number | null;
  measureUnit: LengthUnit;
  areaSqft: number | null;
  lines: PlannerLine[];
}

export interface ProjectView {
  id: string;
  name: string;
  description: string | null;
  projectType: ProjectType;
  budgetPaise: number | null;
  updatedAt: string;
  rooms: RoomView[];
  projectLines: PlannerLine[];
  budget: PlannerBudgetSummary;
  /** Estimate is built from current catalogue prices. It is not a confirmed order price. */
  priceNote: string;
}

export type CartScope = { type: 'project' } | { type: 'room'; roomId: string } | { type: 'line'; itemId: string };

export type CartResult = {
  added: number;
  alreadyApplied: number;
  problems: string[];
  uncertain: string[];
  takenOver: boolean;
};

interface RawItem {
  id: string;
  room_id: string | null;
  variant_id: string;
  quantity: number;
}

async function ownedProject(storeId: string, sessionId: string, projectId: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from('house_projects')
    .select('id, name, description, project_type, budget_paise, updated_at')
    .eq('id', projectId)
    .eq('store_id', storeId)
    .eq('guest_session_id', sessionId)
    .maybeSingle();
  if (error) dbFailure();
  if (!data) throw new PlannerError('That project could not be found.');
  return data;
}

async function ownedRoom(storeId: string, sessionId: string, roomId: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from('house_project_rooms')
    .select('id, project_id, room_type, name, length_value, width_value, height_value, measure_unit')
    .eq('id', roomId)
    .eq('store_id', storeId)
    .maybeSingle();
  if (error) dbFailure();
  if (!data) throw new PlannerError('That room could not be found.');
  await ownedProject(storeId, sessionId, data.project_id as string);
  return data;
}

async function ownedItem(storeId: string, sessionId: string, itemId: string): Promise<RawItem & { project_id: string }> {
  const { data, error } = await createSupabaseAdminClient()
    .from('house_project_items')
    .select('id, project_id, room_id, variant_id, quantity')
    .eq('id', itemId)
    .eq('store_id', storeId)
    .maybeSingle();
  if (error) dbFailure();
  if (!data) throw new PlannerError('That line could not be found.');
  await ownedProject(storeId, sessionId, data.project_id as string);
  return { id: data.id as string, project_id: data.project_id as string, room_id: data.room_id as string | null, variant_id: data.variant_id as string, quantity: Number(data.quantity) };
}

function cleanText(value: string | null | undefined, max: number): string | null {
  const text = (value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

function validProjectInput(input: ProjectInput): ProjectInput {
  const name = cleanText(input.name, 120);
  if (!name) throw new PlannerError('Give the project a name.');
  if (!(PROJECT_TYPES as readonly string[]).includes(input.projectType)) throw new PlannerError('Choose construction or renovation.');
  if (input.budgetPaise !== null && (!Number.isSafeInteger(input.budgetPaise) || input.budgetPaise < 0)) {
    throw new PlannerError('The budget must be zero or more.');
  }
  return { name, description: cleanText(input.description, 1000), projectType: input.projectType, budgetPaise: input.budgetPaise };
}

function validDimension(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value <= 0 || value > 99_999) throw new PlannerError('Dimensions must be positive numbers.');
  return Math.round(value * 100) / 100;
}

function validRoomInput(input: RoomInput): RoomInput {
  if (!(ROOM_TYPES as readonly string[]).includes(input.roomType)) throw new PlannerError('Choose a room type.');
  const name = cleanText(input.name, 80) ?? ROOM_LABELS[input.roomType];
  if (!(MEASURE_UNITS as readonly string[]).includes(input.measureUnit)) throw new PlannerError('Choose a measurement unit.');
  return {
    roomType: input.roomType,
    name,
    length: validDimension(input.length),
    width: validDimension(input.width),
    height: validDimension(input.height),
    measureUnit: input.measureUnit,
  };
}

/** Floor area in square feet from room dimensions, or null when length and width are not both known. */
export function roomAreaSqft(length: number | null, width: number | null, unit: LengthUnit): number | null {
  if (length === null || width === null) return null;
  try {
    const result = calculateTiles({ length, width, unit, coverageSqftPerBox: 1 });
    return result.areaSqft;
  } catch (error) {
    if (error instanceof TileInputError) return null;
    throw error;
  }
}

/**
 * Suggested box count for a room, using the product's recorded coverage. Null when the room has no
 * floor dimensions or the product does not record coverage. The guest can always override it.
 */
export function suggestBoxes(room: { length: number | null; width: number | null; unit: LengthUnit }, variant: VariantInfo): number | null {
  if (variant.coverageSqftPerBox === null || variant.coverageSqftPerBox <= 0) return null;
  if (room.length === null || room.width === null) return null;
  try {
    const result = calculateTiles({
      length: room.length,
      width: room.width,
      unit: room.unit,
      coverageSqftPerBox: variant.coverageSqftPerBox,
      wastagePercent: 10,
    });
    return result.boxes;
  } catch (error) {
    if (error instanceof TileInputError) return null;
    throw error;
  }
}

export async function listProjects(storeId: string, sessionId: string): Promise<ProjectSummary[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from('house_projects')
    .select('id, name, project_type, budget_paise, updated_at')
    .eq('store_id', storeId)
    .eq('guest_session_id', sessionId)
    .order('updated_at', { ascending: false });
  if (error) dbFailure();
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    projectType: row.project_type as ProjectType,
    budgetPaise: row.budget_paise === null ? null : Number(row.budget_paise),
    updatedAt: row.updated_at as string,
  }));
}

/** Projects and their rooms, for the visualizer's "Add to Construction Project" choice. */
export async function listProjectOptions(storeId: string, sessionId: string): Promise<ProjectOption[]> {
  const admin = createSupabaseAdminClient();
  const { data: projects, error } = await admin
    .from('house_projects')
    .select('id, name')
    .eq('store_id', storeId)
    .eq('guest_session_id', sessionId)
    .order('updated_at', { ascending: false });
  if (error) dbFailure();
  const ids = (projects ?? []).map((p) => p.id as string);
  const { data: rooms, error: roomError } = ids.length
    ? await admin.from('house_project_rooms').select('id, project_id, name, room_type').eq('store_id', storeId).in('project_id', ids).order('created_at', { ascending: true })
    : { data: [], error: null };
  if (roomError) dbFailure();
  return (projects ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    rooms: (rooms ?? [])
      .filter((r) => r.project_id === p.id)
      .map((r) => ({ id: r.id as string, name: r.name as string, roomLabel: ROOM_LABELS[r.room_type as RoomType] })),
  }));
}

export async function createProject(storeId: string, sessionId: string, input: ProjectInput): Promise<string> {
  await assertFeature(storeId, 'house_project_planner');
  const clean = validProjectInput(input);
  const { data, error } = await createSupabaseAdminClient()
    .from('house_projects')
    .insert({
      store_id: storeId,
      guest_session_id: sessionId,
      name: clean.name,
      description: clean.description,
      project_type: clean.projectType,
      budget_paise: clean.budgetPaise,
    })
    .select('id')
    .single();
  if (error || !data) mapWriteError(error ?? {});
  return data.id as string;
}

export async function updateProject(storeId: string, sessionId: string, projectId: string, input: ProjectInput): Promise<void> {
  await ownedProject(storeId, sessionId, projectId);
  const clean = validProjectInput(input);
  const { error } = await createSupabaseAdminClient()
    .from('house_projects')
    .update({ name: clean.name, description: clean.description, project_type: clean.projectType, budget_paise: clean.budgetPaise })
    .eq('id', projectId)
    .eq('store_id', storeId)
    .eq('guest_session_id', sessionId);
  if (error) mapWriteError(error);
}

export async function deleteProject(storeId: string, sessionId: string, projectId: string): Promise<void> {
  await ownedProject(storeId, sessionId, projectId);
  const { error } = await createSupabaseAdminClient()
    .from('house_projects')
    .delete()
    .eq('id', projectId)
    .eq('store_id', storeId)
    .eq('guest_session_id', sessionId);
  if (error) dbFailure();
}

export async function createRoom(storeId: string, sessionId: string, projectId: string, input: RoomInput): Promise<string> {
  await ownedProject(storeId, sessionId, projectId);
  const clean = validRoomInput(input);
  const { data, error } = await createSupabaseAdminClient()
    .from('house_project_rooms')
    .insert({
      store_id: storeId,
      project_id: projectId,
      room_type: clean.roomType,
      name: clean.name,
      length_value: clean.length,
      width_value: clean.width,
      height_value: clean.height,
      measure_unit: clean.measureUnit,
    })
    .select('id')
    .single();
  if (error || !data) mapWriteError(error ?? {});
  return data.id as string;
}

export async function updateRoom(storeId: string, sessionId: string, roomId: string, input: RoomInput): Promise<void> {
  await ownedRoom(storeId, sessionId, roomId);
  const clean = validRoomInput(input);
  const { error } = await createSupabaseAdminClient()
    .from('house_project_rooms')
    .update({
      room_type: clean.roomType,
      name: clean.name,
      length_value: clean.length,
      width_value: clean.width,
      height_value: clean.height,
      measure_unit: clean.measureUnit,
    })
    .eq('id', roomId)
    .eq('store_id', storeId);
  if (error) mapWriteError(error);
}

export async function deleteRoom(storeId: string, sessionId: string, roomId: string): Promise<void> {
  await ownedRoom(storeId, sessionId, roomId);
  const { error } = await createSupabaseAdminClient()
    .from('house_project_rooms')
    .delete()
    .eq('id', roomId)
    .eq('store_id', storeId);
  if (error) dbFailure();
}

/**
 * A variant can be planned only when it, its product and the store are all live: the variant is active,
 * the product is active and public, and both belong to this store.
 */
export async function assertPurchasableVariant(storeId: string, variantId: string): Promise<void> {
  const { data, error } = await createSupabaseAdminClient()
    .from('product_variants')
    .select('id, is_active, store_id, products(status, visibility)')
    .eq('id', variantId)
    .eq('store_id', storeId)
    .maybeSingle();
  if (error) dbFailure();
  const raw = data?.products as unknown;
  const product = (Array.isArray(raw) ? raw[0] : raw) as { status?: string; visibility?: string } | undefined;
  if (!data || !data.is_active || !product || product.status !== 'active' || product.visibility !== 'public') {
    throw new PlannerError('That product is not available in this showroom.');
  }
}

/**
 * Sets the quantity of a variant in a room (or at project level when roomId is null).
 * Adds a line when none exists; otherwise replaces the quantity.
 */
export async function setLine(
  storeId: string,
  sessionId: string,
  projectId: string,
  roomId: string | null,
  variantId: string,
  quantity: number,
): Promise<void> {
  await ownedProject(storeId, sessionId, projectId);
  const qty = validPlannerQuantity(quantity);
  if (qty === null) throw new PlannerError('Quantity must be a whole number from 1 to 999.');
  await assertPurchasableVariant(storeId, variantId);
  if (roomId !== null) {
    const room = await ownedRoom(storeId, sessionId, roomId);
    if (room.project_id !== projectId) throw new PlannerError('That room is not part of this project.');
  }
  const admin = createSupabaseAdminClient();
  let query = admin
    .from('house_project_items')
    .select('id')
    .eq('store_id', storeId)
    .eq('project_id', projectId)
    .eq('variant_id', variantId);
  query = roomId === null ? query.is('room_id', null) : query.eq('room_id', roomId);
  const { data: existing, error: readError } = await query.maybeSingle();
  if (readError) dbFailure();

  if (existing) {
    const { error } = await admin.from('house_project_items').update({ quantity: qty }).eq('id', existing.id as string);
    if (error) mapWriteError(error);
    return;
  }
  const { error } = await admin.from('house_project_items').insert({
    store_id: storeId,
    project_id: projectId,
    room_id: roomId,
    variant_id: variantId,
    quantity: qty,
  });
  if (error) mapWriteError(error);
}

export async function setLineQuantity(storeId: string, sessionId: string, itemId: string, quantity: number): Promise<void> {
  const item = await ownedItem(storeId, sessionId, itemId);
  const qty = validPlannerQuantity(quantity);
  if (qty === null) throw new PlannerError('Quantity must be a whole number from 1 to 999.');
  const { error } = await createSupabaseAdminClient()
    .from('house_project_items')
    .update({ quantity: qty })
    .eq('id', item.id)
    .eq('store_id', storeId);
  if (error) mapWriteError(error);
}

export async function removeLine(storeId: string, sessionId: string, itemId: string): Promise<void> {
  const item = await ownedItem(storeId, sessionId, itemId);
  const { error } = await createSupabaseAdminClient()
    .from('house_project_items')
    .delete()
    .eq('id', item.id)
    .eq('store_id', storeId);
  if (error) dbFailure();
}

/** Moves a line to another variant of the same product. Merges with an existing line for that variant. */
export async function changeLineVariant(storeId: string, sessionId: string, itemId: string, newVariantId: string): Promise<void> {
  const item = await ownedItem(storeId, sessionId, itemId);
  if (item.variant_id === newVariantId) return;
  await assertPurchasableVariant(storeId, newVariantId);
  const admin = createSupabaseAdminClient();
  const { data: variants, error } = await admin
    .from('product_variants')
    .select('id, product_id, is_active')
    .in('id', [item.variant_id, newVariantId])
    .eq('store_id', storeId);
  if (error) dbFailure();
  const oldRow = (variants ?? []).find((v) => v.id === item.variant_id);
  const newRow = (variants ?? []).find((v) => v.id === newVariantId);
  if (!oldRow || !newRow || oldRow.product_id !== newRow.product_id || !newRow.is_active) {
    throw new PlannerError('Choose another size or finish of the same product.');
  }

  const sameSpot = admin
    .from('house_project_items')
    .select('id, quantity')
    .eq('store_id', storeId)
    .eq('project_id', item.project_id)
    .eq('variant_id', newVariantId);
  const { data: clash, error: clashError } = await (item.room_id === null ? sameSpot.is('room_id', null) : sameSpot.eq('room_id', item.room_id)).maybeSingle();
  if (clashError) dbFailure();

  if (clash) {
    const merged = Math.min(999, Number(clash.quantity) + item.quantity);
    const { error: mergeError } = await admin.from('house_project_items').update({ quantity: merged }).eq('id', clash.id as string);
    if (mergeError) mapWriteError(mergeError);
    const { error: dropError } = await admin.from('house_project_items').delete().eq('id', item.id).eq('store_id', storeId);
    if (dropError) dbFailure();
    return;
  }
  const { error: moveError } = await admin
    .from('house_project_items')
    .update({ variant_id: newVariantId })
    .eq('id', item.id)
    .eq('store_id', storeId);
  if (moveError) mapWriteError(moveError);
}

/** The whole project for the planner page: rooms, lines, estimate and warnings. */
export async function getProjectView(storeId: string, sessionId: string, projectId: string): Promise<ProjectView> {
  const project = await ownedProject(storeId, sessionId, projectId);
  const admin = createSupabaseAdminClient();

  const [roomsResult, itemsResult] = await Promise.all([
    admin
      .from('house_project_rooms')
      .select('id, room_type, name, length_value, width_value, height_value, measure_unit, created_at')
      .eq('store_id', storeId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true }),
    admin
      .from('house_project_items')
      .select('id, room_id, variant_id, quantity, created_at')
      .eq('store_id', storeId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true }),
  ]);
  if (roomsResult.error || itemsResult.error) dbFailure();
  const rooms = roomsResult.data ?? [];
  const items = (itemsResult.data ?? []) as unknown as RawItem[];

  const variantIds = [...new Set(items.map((i) => i.variant_id))];
  const variantRows: { id: string; product_id: string }[] = [];
  if (variantIds.length > 0) {
    const { data, error: variantError } = await admin.from('product_variants').select('id, product_id').in('id', variantIds);
    if (variantError) dbFailure();
    variantRows.push(...((data ?? []) as { id: string; product_id: string }[]));
  }
  const productOf = new Map<string, string>(variantRows.map((v) => [v.id, v.product_id]));
  const productIds = [...new Set([...productOf.values()])];
  const details: ProductDetail[] = await getProductDetailsByIds(storeId, productIds);
  const detailById = new Map(details.map((d) => [d.id, d]));

  const roomLines = new Map<string, PlannerLine[]>();
  const projectLines: PlannerLine[] = [];
  const estimateLines: { key: string; roomId: string | null; unitPricePaise: number; quantity: number; gstRateBps: number }[] = [];

  for (const item of items) {
    const productId = productOf.get(item.variant_id);
    const detail = productId ? detailById.get(productId) : undefined;
    const variant = detail?.variants.find((v) => v.id === item.variant_id);
    const room = rooms.find((r) => r.id === item.room_id) ?? null;
    const roomDims = room
      ? { length: room.length_value === null ? null : Number(room.length_value), width: room.width_value === null ? null : Number(room.width_value), unit: room.measure_unit as LengthUnit }
      : null;

    const line: PlannerLine = {
      itemId: item.id,
      roomId: item.room_id,
      variantId: item.variant_id,
      productId: productId ?? '',
      productName: detail?.name ?? 'Product no longer sold',
      productSlug: detail?.slug ?? '',
      imageUrl: detail?.photos[0]?.url ?? null,
      variantLabel: variant?.label ?? '',
      sizeLabel: variant?.sizeLabel ?? null,
      unitPricePaise: variant?.salePricePaise ?? 0,
      priceUnit: variant?.priceUnit ?? 'piece',
      gstRateBps: detail?.gstRateBps ?? 0,
      quantity: Number(item.quantity),
      availableUnits: variant?.availableUnits ?? 0,
      shortOfStock: variant ? Number(item.quantity) > variant.availableUnits : false,
      unavailable: !variant,
      suggestedBoxes: variant && roomDims ? suggestBoxes({ length: roomDims.length, width: roomDims.width, unit: roomDims.unit }, variant) : null,
      alternatives: detail
        ? detail.variants.map((v) => ({ id: v.id, label: v.label, sizeLabel: v.sizeLabel, salePricePaise: v.salePricePaise }))
        : [],
    };

    if (item.room_id && room) {
      roomLines.set(item.room_id, [...(roomLines.get(item.room_id) ?? []), line]);
    } else {
      projectLines.push(line);
    }
    if (!line.unavailable) {
      estimateLines.push({ key: item.id, roomId: room ? item.room_id : null, unitPricePaise: line.unitPricePaise, quantity: line.quantity, gstRateBps: line.gstRateBps });
    }
  }

  const budgetPaise = project.budget_paise === null ? null : Number(project.budget_paise);
  const budget = estimateBudget(estimateLines, budgetPaise);

  return {
    id: project.id as string,
    name: project.name as string,
    description: (project.description as string | null) ?? null,
    projectType: project.project_type as ProjectType,
    budgetPaise,
    updatedAt: project.updated_at as string,
    rooms: rooms.map((r) => {
      const length = r.length_value === null ? null : Number(r.length_value);
      const width = r.width_value === null ? null : Number(r.width_value);
      const unit = r.measure_unit as LengthUnit;
      return {
        id: r.id as string,
        roomType: r.room_type as RoomType,
        roomLabel: ROOM_LABELS[r.room_type as RoomType],
        name: r.name as string,
        length,
        width,
        height: r.height_value === null ? null : Number(r.height_value),
        measureUnit: unit,
        areaSqft: roomAreaSqft(length, width, unit),
        lines: roomLines.get(r.id as string) ?? [],
      };
    }),
    projectLines,
    budget,
    priceNote: 'Estimates use current catalogue prices with GST added. The order price is confirmed at checkout or in the quotation.',
  };
}

/** Cart lines for a scope, skipping products that are no longer sold. */
function scopeLines(view: ProjectView, scope: CartScope): PlannerLine[] {
  if (scope.type === 'project') return [...view.projectLines, ...view.rooms.flatMap((r) => r.lines)];
  if (scope.type === 'room') {
    const room = view.rooms.find((r) => r.id === scope.roomId);
    if (!room) throw new PlannerError('That room could not be found.');
    return room.lines;
  }
  const line = [...view.projectLines, ...view.rooms.flatMap((r) => r.lines)].find((l) => l.itemId === scope.itemId);
  if (!line) throw new PlannerError('That line could not be found.');
  return [line];
}

/**
 * Adds the scope's lines to the cart through the cart's own price, stock and product checks.
 * Runs once per request key, so a retried submit does not add again.
 */
export async function addScopeToCart(
  storeId: string,
  sessionId: string,
  projectId: string,
  scope: CartScope,
  requestKey: string,
): Promise<CartResult> {
  return runKeyed(storeId, sessionId, 'planner_cart', requestKey, async (claim) => {
    const view = await getProjectView(storeId, sessionId, projectId);
    const lines = scopeLines(view, scope);
    if (lines.length === 0) throw new PlannerError('There is nothing here to add to the cart.');
    const problems: string[] = [];
    const cartLines: { variantId: string; quantity: number; label: string }[] = [];
    for (const line of lines) {
      if (line.unavailable) {
        problems.push(`${line.productName} is no longer sold.`);
        continue;
      }
      cartLines.push({ variantId: line.variantId, quantity: line.quantity, label: `${line.productName} (${line.variantLabel})` });
    }
    const outcome = await addCartLinesOnce(storeId, sessionId, claim, cartLines);
    return {
      added: outcome.added,
      alreadyApplied: outcome.alreadyApplied,
      problems: [...problems, ...outcome.problems],
      uncertain: outcome.uncertain,
      takenOver: outcome.takenOver,
    };
  });
}

export interface QuotationRequestInput {
  customerName: string;
  customerMobile: string;
  customerEmail: string | null;
  requirements: string | null;
  deliveryAddress: string | null;
  deliveryExpectation: string | null;
}

/** Sends the scope's lines to the store as a quotation request. Returns the quotation id. */
export async function requestScopeQuotation(
  storeId: string,
  sessionId: string,
  projectId: string,
  scope: CartScope,
  customer: QuotationRequestInput,
  requestKey: string,
): Promise<string> {
  const name = cleanText(customer.customerName, 120);
  const mobile = cleanText(customer.customerMobile, 20);
  if (!name || !mobile) throw new PlannerError('Enter your name and mobile number.');
  const result = await runKeyed(storeId, sessionId, 'planner_quotation', requestKey, async (claim) => {
    const project = await ownedProject(storeId, sessionId, projectId);
    const view = await getProjectView(storeId, sessionId, projectId);
    const lines = scopeLines(view, scope).filter((l) => !l.unavailable);
    if (lines.length === 0) throw new PlannerError('There are no available products to quote.');
    try {
      const quotationId = await guestRequestQuotationOnce(storeId, sessionId, {
        customerName: name,
        customerMobile: mobile,
        customerEmail: cleanText(customer.customerEmail, 160),
        projectName: project.name as string,
        requirements: cleanText(customer.requirements, 1000),
        deliveryAddress: cleanText(customer.deliveryAddress, 500),
        deliveryExpectation: cleanText(customer.deliveryExpectation, 200),
        lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      }, requestKey);
      return { quotationId };
    } catch (error) {
      if (error instanceof QuotationError) throw new PlannerError((error as QuotationError).message);
      throw error;
    }
  });
  return result.quotationId as string;
}

/**
 * Adds visualizer-selected products to a project room (or project level), creating the project and
 * room when asked. Quantities and variants are kept as chosen.
 */
export async function addVisualizedToProject(
  storeId: string,
  sessionId: string,
  target: {
    projectId: string | null;
    newProjectName: string | null;
    roomId: string | null;
    newRoomName: string | null;
  },
  lines: { variantId: string; quantity: number }[],
  requestKey: string,
): Promise<{ projectId: string; roomId: string | null; applied: number }> {
  return runKeyed(storeId, sessionId, 'visualizer_project', requestKey, async (claim) => {
    // Anything an earlier attempt already created is reused, so a retry never makes a second project or room.
    const saved = claim.progress ?? {};
    const savedProject = typeof saved.projectId === 'string' ? saved.projectId : null;
    const savedRoom = typeof saved.roomId === 'string' ? saved.roomId : null;

    let projectId = target.projectId ?? savedProject;
    if (!projectId) {
      const name = cleanText(target.newProjectName, 120);
      if (!name) throw new PlannerError('Choose a project or name a new one.');
      projectId = await createProject(storeId, sessionId, { name, description: null, projectType: 'renovation', budgetPaise: null });
      if (!(await saveRequestProgress(claim, { projectId }))) throw new PlannerError('This request was taken over by another attempt.');
    } else {
      await ownedProject(storeId, sessionId, projectId);
    }

    let roomId = target.roomId ?? savedRoom;
    if (!roomId && target.newRoomName) {
      roomId = await createRoom(storeId, sessionId, projectId, {
        roomType: 'custom',
        name: cleanText(target.newRoomName, 80) ?? 'Custom area',
        length: null, width: null, height: null, measureUnit: 'ft',
      });
      if (!(await saveRequestProgress(claim, { roomId }))) throw new PlannerError('This request was taken over by another attempt.');
    } else if (roomId) {
      await ownedRoom(storeId, sessionId, roomId);
    }

    // Each line sets a quantity rather than adding to it, so a replayed line leaves the same value.
    let applied = 0;
    for (const line of lines) {
      await setLine(storeId, sessionId, projectId, roomId, line.variantId, line.quantity);
      applied += 1;
    }
    return { projectId, roomId, applied };
  });
}

/**
 * Runs an action once per request key. A completed key returns its stored result; a key whose
 * request is still in flight is refused; a failed one may be retried.
 */
async function runKeyed<T extends Record<string, unknown>>(
  storeId: string,
  sessionId: string,
  kind: RequestKind,
  requestKey: string,
  action: (claim: Claim) => Promise<T>,
): Promise<T> {
  let claim: ClaimResult;
  try {
    claim = await claimRequestKey(storeId, sessionId, kind, requestKey);
  } catch (error) {
    if (error instanceof RequestKeyError) throw new PlannerError((error as RequestKeyError).message);
    throw error;
  }
  if (claim.state === 'done') return (claim.result ?? {}) as T;
  if (claim.state === 'in_flight') throw new PlannerError('This request is already being processed. Please wait a moment.');
  try {
    const result = await action(claim.claim);
    await completeRequestKey(claim.claim, result as Record<string, unknown>);
    return result;
  } catch (error) {
    await failRequestKey(claim.claim);
    throw error;
  }
}
