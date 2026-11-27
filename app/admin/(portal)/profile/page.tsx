import { PageHeader } from '@/components/owner/page-header';
import { ProfileManager } from '@/components/portal/profile-manager';
import { requireAdmin } from '@/lib/services/admin';
import { loadCurrentUserProfile } from '@/lib/services/profile';

export const dynamic = 'force-dynamic';

export default async function AdminProfilePage() {
  await requireAdmin();
  const profile = await loadCurrentUserProfile();
  if (!profile) return null;

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader
        eyebrow="Account"
        title="My Profile"
        description="Manage your administrator profile photo, contact details, email verification, and password."
      />
      <ProfileManager profile={profile} roleLabel="Platform Super Admin" />
    </div>
  );
}
