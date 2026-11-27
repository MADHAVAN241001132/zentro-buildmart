import 'server-only';
import { NextResponse } from 'next/server';
import { notFound, redirect } from 'next/navigation';
import type { PermissionKey } from '@/lib/authz/permissions';
import { isFeatureEnabled, type FeatureKey } from '@/lib/services/entitlements';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface OwnerContext {
  userId: string;
  email: string | null;
  storeId: string;
  storeName: string;
  storeSlug: string;
  role: 'owner' | 'manager' | 'staff';
}

/**
 * The signed-in owner's active store, resolved through store_owners (RLS limits the rows to the user).
 * A user with several stores gets the first one; a store switcher is not built yet.
 */
export async function getOwnerContext(): Promise<OwnerContext | null> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from('store_owners')
    .select('role, is_active, stores(id, name, slug, status)')
    .eq('profile_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;

  const store = data.stores as unknown as { id: string; name: string; slug: string; status: string } | null;
  if (!store || store.status !== 'active') return null;
  return {
    userId: user.id,
    email: user.email ?? null,
    storeId: store.id,
    storeName: store.name,
    storeSlug: store.slug,
    role: data.role as OwnerContext['role'],
  };
}

/** For Server Components and actions under /owner that need a signed-in owner. */
export async function requireOwner(): Promise<OwnerContext> {
  const context = await getOwnerContext();
  if (!context) redirect('/owner/login');
  return context;
}

/**
 * Permissions the signed-in user holds in their active store, read by the database for the session user.
 * Owners receive every key. A failed read returns no permissions, so the gate below fails closed.
 */
export async function loadMyStorePermissions(storeId: string): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('zb_my_store_permissions', { p_store: storeId });
  if (error) return [];
  return (data as string[] | null) ?? [];
}

/**
 * Gate for owner pages and server actions. Requires an active membership and the named permission.
 * The store comes from the session membership, never from the request. Denied callers are sent to
 * the access-denied page. The database enforces the same permission inside sensitive RPCs.
 */
export async function requireOwnerPermission(permission: PermissionKey): Promise<OwnerContext> {
  const owner = await requireOwner();
  const held = await loadMyStorePermissions(owner.storeId);
  if (!held.includes(permission)) {
    redirect(`/owner/access-denied?permission=${encodeURIComponent(permission)}`);
  }
  return owner;
}

export class OwnerPermissionDenied extends Error {
  constructor(readonly status: 401 | 403) {
    super(status === 401 ? 'unauthorised' : 'forbidden');
  }
}

/** Route handler form of the gate: throws OwnerPermissionDenied instead of redirecting, so downloads get a JSON status. */
export async function ownerPermissionForRoute(permission: PermissionKey): Promise<OwnerContext> {
  const owner = await getOwnerContext();
  if (!owner) throw new OwnerPermissionDenied(401);
  const held = await loadMyStorePermissions(owner.storeId);
  if (!held.includes(permission)) throw new OwnerPermissionDenied(403);
  return owner;
}

export function routeDeniedResponse(error: unknown): NextResponse {
  const status = error instanceof OwnerPermissionDenied ? error.status : 401;
  return NextResponse.json({ error: status === 403 ? 'forbidden' : 'unauthorised' }, { status });
}

/** Boolean form for code that must refuse one step rather than redirect (for example, one button or one result). */
export async function hasOwnerPermission(storeId: string, permission: PermissionKey): Promise<boolean> {
  return (await loadMyStorePermissions(storeId)).includes(permission);
}

/**
 * Gate for owner pages that are also controlled by a feature flag/assignment.
 * Checks role permission (if specified) AND store feature availability. Calls notFound()
 * when the feature is disabled/unassigned so the feature appears completely absent.
 */
export async function requireOwnerFeature(feature: FeatureKey, permission?: PermissionKey): Promise<OwnerContext> {
  const owner = permission ? await requireOwnerPermission(permission) : await requireOwner();
  const allowed = await isFeatureEnabled(owner.storeId, feature);
  if (!allowed) notFound();
  return owner;
}
