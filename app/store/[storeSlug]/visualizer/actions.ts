'use server';

import { revalidatePath } from 'next/cache';
import { checkFeature } from '@/lib/services/entitlements';
import { redirect } from 'next/navigation';
import { ensureGuestSession, readGuestSession } from '@/lib/services/guest';
import { removeRoomPhoto } from '@/lib/services/guest-photos';
import { getStoreBySlug } from '@/lib/services/storefront';
import { parseVisualizerLines } from '@/lib/visualizer/lines';
import { addVisualizedToProject, PlannerError } from '@/lib/services/house-projects';
import { parseProjectTarget, projectPathAfterAdd } from '@/lib/planner/targets';
import { claimRequestKey, completeRequestKey, failRequestKey, RequestKeyError, type ClaimResult } from '@/lib/services/request-keys';
import { addCartLinesOnce } from '@/lib/services/once-cart';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The store slug posted by the form, or an empty string when it is missing or malformed. */
function slugFrom(formData: FormData): string {
  const value = formData.get('storeSlug');
  return typeof value === 'string' && /^[a-z0-9-]{3,40}$/.test(value) ? value : '';
}

function back(storeSlug: string, notice?: string, error?: string): never {
  const params = new URLSearchParams();
  if (notice) params.set('notice', notice.slice(0, 300));
  if (error) params.set('error', error.slice(0, 300));
  const query = params.toString();
  redirect(`/store/${storeSlug}/visualizer${query ? `?${query}` : ''}`);
  throw new Error('redirect did not run');
}

export async function removeRoomPhotoAction(formData: FormData): Promise<void> {
  const storeSlug = slugFrom(formData);
  if (!storeSlug) redirect('/');
  const photoId = formData.get('photoId');
  if (typeof photoId !== 'string' || !UUID.test(photoId)) back(storeSlug, undefined, 'That photograph could not be found.');
  const store = await getStoreBySlug(storeSlug);
  if (!store) redirect('/');
  const session = await readGuestSession(store.id, storeSlug);
  if (!session) back(storeSlug, undefined, 'That photograph could not be found.');
  const result = await removeRoomPhoto(store.id, session.id, photoId);
  revalidatePath(`/store/${storeSlug}/visualizer`);
  if (!result.ok) back(storeSlug, undefined, result.error);
  back(storeSlug, 'Photograph removed.');
}

/**
 * Adds the visualized products to the cart. Each line goes through the cart's own price, stock and product checks.
 * The submission id is a database-backed key, so a retried or duplicated submit adds nothing a second time,
 * whichever tab, device or cookie sends it.
 */
export async function addVisualizedToCartAction(formData: FormData): Promise<void> {
  const storeSlug = slugFrom(formData);
  if (!storeSlug) redirect('/');
  const submissionId = formData.get('submissionId');
  if (typeof submissionId !== 'string' || !UUID.test(submissionId)) back(storeSlug, undefined, 'Please reload the page and try again.');
  const lines = parseVisualizerLines(String(formData.get('lines') ?? ''));
  if (!lines) back(storeSlug, undefined, 'Choose products and quantities before adding to the cart.');

  const store = await getStoreBySlug(storeSlug);
  if (!store) redirect('/');
  const featureBlocked = await checkFeature(store.id, 'room_visualiser');
  if (featureBlocked) back(storeSlug, undefined, featureBlocked);
  const session = await ensureGuestSession(store.id, storeSlug);

  let claim: ClaimResult;
  try {
    claim = await claimRequestKey(store.id, session.id, 'visualizer_cart', submissionId);
  } catch (error) {
    back(storeSlug, undefined, error instanceof RequestKeyError ? (error as RequestKeyError).message : 'Something went wrong. Please try again.');
  }
  if (claim.state === 'done') back(storeSlug, 'These products are already in your cart.');
  if (claim.state === 'in_flight') back(storeSlug, undefined, 'These products are already being added. Please wait a moment.');

  let outcome;
  try {
    outcome = await addCartLinesOnce(
      store.id,
      session.id,
      claim.claim,
      lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity, label: 'A product in your photograph' })),
    );
  } catch (error) {
    await failRequestKey(claim.claim);
    throw error;
  }
  const problems = [...outcome.problems, ...outcome.uncertain.map((label) => `${label} could not be confirmed. Check your cart before adding it again.`)];
  await completeRequestKey(claim.claim, { added: outcome.added, alreadyApplied: outcome.alreadyApplied, problems: problems.length });

  revalidatePath(`/store/${storeSlug}`, 'layout');
  if (problems.length === 0) back(storeSlug, `Added ${outcome.added} ${outcome.added === 1 ? 'product' : 'products'} to your cart.`);
  back(storeSlug, `Added ${outcome.added}. Not added: ${problems.join(' ')}`, outcome.added === 0 ? problems.join(' ') : undefined);
}

/** Adds the visualized products to a construction project room, keeping each variant and quantity. */
export async function addVisualizedToProjectAction(formData: FormData): Promise<void> {
  const storeSlug = slugFrom(formData);
  if (!storeSlug) redirect('/');
  const submissionId = formData.get('submissionId');
  if (typeof submissionId !== 'string' || !UUID.test(submissionId)) back(storeSlug, undefined, 'Please reload the page and try again.');
  const lines = parseVisualizerLines(String(formData.get('lines') ?? ''));
  if (!lines) back(storeSlug, undefined, 'Choose products and quantities before adding to a project.');

  const pick = (key: string): string | null => {
    const value = formData.get(key);
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };
  const target = parseProjectTarget(pick('target') ?? '');
  if (target.kind === 'invalid') back(storeSlug, undefined, 'Choose a project or room, or name a new project.');
  const projectId = target.kind === 'existing' ? target.projectId : null;
  const roomId = target.kind === 'existing' ? target.roomId : null;
  const store = await getStoreBySlug(storeSlug);
  if (!store) redirect('/');
  const featureBlocked = await checkFeature(store.id, 'room_visualiser');
  if (featureBlocked) back(storeSlug, undefined, featureBlocked);
  const session = await ensureGuestSession(store.id, storeSlug);

  let targetPath = `/store/${storeSlug}/projects`;
  try {
    const result = await addVisualizedToProject(
      store.id,
      session.id,
      {
        projectId: projectId && UUID.test(projectId) ? projectId : null,
        newProjectName: target.kind === 'new' ? pick('newProjectName') : null,
        roomId: roomId && UUID.test(roomId) ? roomId : null,
        newRoomName: pick('newRoomName'),
      },
      lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      submissionId,
    );
    targetPath = projectPathAfterAdd(storeSlug, result.projectId);
    revalidatePath(`/store/${storeSlug}/projects`, 'page');
    revalidatePath(targetPath);
  } catch (error) {
    const message = error instanceof PlannerError ? (error as PlannerError).message : 'The products could not be added to the project.';
    back(storeSlug, undefined, message);
  }
  redirect(`${targetPath}?notice=${encodeURIComponent('Products added to the project.')}`);
}
