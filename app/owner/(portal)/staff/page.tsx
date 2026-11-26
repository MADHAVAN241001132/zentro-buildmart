import { PageHeader } from '@/components/owner/page-header';
import { ConfirmSubmit } from '@/components/owner/confirm-submit';
import { EmptyState } from '@/components/ui/empty-state';
import { buttonClass } from '@/components/ui/button';
import { PERMISSIONS, STORE_ROLES, canManageStaff, defaultPermissions, permissionLabel, type StoreRole } from '@/lib/authz/permissions';
import { requireOwnerPermission } from '@/lib/services/owner';
import { listStoreMembers, loadMyStorePermissions } from '@/lib/services/staff';
import { createStaffAction, setStaffAccessAction, setStaffActiveAction } from './actions';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<StoreRole, string> = { owner: 'Owner', manager: 'Manager', staff: 'Staff' };

/**
 * One checkbox per permission. A permission the viewer does not hold is shown but cannot be changed. If it is
 * already granted, a hidden field keeps it, so saving does not remove it outside the viewer's authority.
 */
function PermissionBoxes({ held, granted, defaults }: { held: string[]; granted: string[]; defaults?: StoreRole }) {
  const defaultSet = new Set(defaults ? defaultPermissions(defaults) : []);
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2">
      <legend className="mb-1 text-sm font-medium">Permissions</legend>
      {PERMISSIONS.map((p) => {
        const isHeld = held.includes(p.key);
        const checked = defaults ? defaultSet.has(p.key) : granted.includes(p.key);
        const keep = !isHeld && granted.includes(p.key);
        return (
          <div key={p.key}>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="permission" value={p.key} defaultChecked={checked} disabled={!isHeld} />
              <span className={isHeld ? '' : 'text-ink-muted'}>{p.label}</span>
            </label>
            {keep && <input type="hidden" name="permission" value={p.key} />}
          </div>
        );
      })}
    </fieldset>
  );
}

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string; key?: string }> }) {
  const owner = await requireOwnerPermission('staff_management');
  const sp = await searchParams;
  // Reuse the key from a failed attempt so a retry replays the same request; otherwise start a new one.
  const requestKey = sp.key && /^[0-9a-f-]{36}$/i.test(sp.key) ? sp.key : crypto.randomUUID();
  const held = await loadMyStorePermissions(owner.storeId);
  if (!canManageStaff(held)) {
    return <EmptyState title="Staff management is restricted" body="Ask an owner to give you the staff management permission." />;
  }
  const members = await listStoreMembers(owner.storeId);
  const isOwner = owner.role === 'owner';
  const assignableRoles = STORE_ROLES.filter((r) => isOwner || r !== 'owner');

  return (
    <div className="grid gap-8">
      <PageHeader eyebrow="Team" title="Staff and access" description="Owners and managers can change access for people below them. Changes apply immediately and are recorded in the audit log." />

      {sp.notice && <p role="status" className="rounded-control border border-line bg-cream px-4 py-3 text-sm">{sp.notice}</p>}
      {sp.error && <p role="alert" className="rounded-control border border-burgundy/40 bg-cream px-4 py-3 text-sm text-burgundy">{sp.error}</p>}

      {members.length === 0 ? (
        <EmptyState title="No team members" body="Add a manager or staff account below." />
      ) : (
        <ul className="grid gap-4">
          {members.map((m) => {
            const isSelf = m.profileId === owner.userId;
            const canEdit = !isSelf && (isOwner || m.role !== 'owner');
            return (
              <li key={m.profileId} className="grid gap-4 rounded-card border border-line bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{m.fullName ?? 'Team member'}{isSelf ? ' (you)' : ''}</p>
                    <p className="text-xs text-ink-muted">{ROLE_LABEL[m.role]} · {m.isActive ? 'Active' : 'Inactive'}</p>
                  </div>
                  {canEdit && (
                    <form action={setStaffActiveAction}>
                      <input type="hidden" name="profileId" value={m.profileId} />
                      <input type="hidden" name="active" value={m.isActive ? 'false' : 'true'} />
                      <ConfirmSubmit message={m.isActive ? 'Deactivate this account? The person loses access immediately.' : 'Activate this account?'}>
                        {m.isActive ? 'Deactivate' : 'Activate'}
                      </ConfirmSubmit>
                    </form>
                  )}
                </div>

                {canEdit ? (
                  <form action={setStaffAccessAction} className="grid gap-4">
                    <input type="hidden" name="profileId" value={m.profileId} />
                    <label className="grid max-w-xs gap-1 text-sm">
                      Role
                      <select name="role" defaultValue={m.role} className="rounded-control border border-line bg-cream px-3 py-2">
                        {assignableRoles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    </label>
                    <PermissionBoxes held={held} granted={m.permissions} />
                    <div>
                      <ConfirmSubmit message="Change this person's access? It takes effect immediately.">Save access</ConfirmSubmit>
                    </div>
                  </form>
                ) : (
                  <p className="text-sm text-ink-muted">
                    {m.role === 'owner' ? 'Owners hold every permission.' : m.permissions.map(permissionLabel).join(', ') || 'No permissions.'}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form action={createStaffAction} className="grid gap-5 rounded-card border border-line bg-card p-6">
        <h2 className="font-display text-2xl text-burgundy">Add an account</h2>
        <input type="hidden" name="request_key" value={requestKey} />
        <div className="grid gap-3 md:grid-cols-2">
          <input name="fullName" required maxLength={120} placeholder="Full name" className="rounded-control border border-line bg-cream px-3 py-2 text-sm" />
          <input name="email" type="email" required placeholder="Email" className="rounded-control border border-line bg-cream px-3 py-2 text-sm" />
          <input name="phone" placeholder="Phone (optional)" className="rounded-control border border-line bg-cream px-3 py-2 text-sm" />
          <input name="password" type="password" required minLength={10} maxLength={72} autoComplete="new-password" placeholder="Temporary password (10+ characters)" className="rounded-control border border-line bg-cream px-3 py-2 text-sm" />
          <label className="grid gap-1 text-sm">
            Role
            <select name="role" defaultValue="staff" className="rounded-control border border-line bg-cream px-3 py-2">
              {assignableRoles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </label>
        </div>
        <p className="text-xs text-ink-muted">The boxes start with the staff defaults. You can give only permissions you hold. Share the password through a secure channel.</p>
        <PermissionBoxes held={held} granted={[]} defaults="staff" />
        <div>
          <button type="submit" className={buttonClass('primary')}>Create account</button>
        </div>
      </form>
    </div>
  );
}
