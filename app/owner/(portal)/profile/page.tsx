import { PageHeader } from '@/components/owner/page-header';
import { ProfileManager } from '@/components/portal/profile-manager';
import { getStoreEnabledFeatures } from '@/lib/services/entitlements';
import { loadMyStorePermissions, requireOwner } from '@/lib/services/owner';
import { loadCurrentUserProfile } from '@/lib/services/profile';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function OwnerProfilePage() {
  const owner = await requireOwner();
  const supabase = await createSupabaseServerClient();
  const [profile, enabledFeatures, permissions, { data: sub }] = await Promise.all([
    loadCurrentUserProfile(),
    getStoreEnabledFeatures(owner.storeId),
    loadMyStorePermissions(owner.storeId),
    supabase
      .from('subscriptions')
      .select('status, subscription_plans(name)')
      .eq('store_id', owner.storeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!profile) return null;

  const plan = Array.isArray(sub?.subscription_plans) ? sub?.subscription_plans[0] : sub?.subscription_plans;

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader
        eyebrow="Account"
        title="My Profile"
        description="Update your personal details, profile photo, email, and password. Store role and subscription entitlements are managed by ZENTRO."
      />
      <ProfileManager
        profile={profile}
        roleLabel={`Store ${owner.role.charAt(0).toUpperCase() + owner.role.slice(1)}`}
        ownerSummary={{
          storeName: owner.storeName,
          storeSlug: owner.storeSlug,
          planName: (plan as { name?: string } | null)?.name ?? null,
          subscriptionStatus: (sub?.status as string | undefined) ?? null,
          enabledFeatures: Array.from(enabledFeatures).sort(),
          canEditBranding: permissions.includes('store_settings'),
        }}
      />
    </div>
  );
}
