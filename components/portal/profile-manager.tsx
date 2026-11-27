'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Eye, EyeOff, KeyRound, Mail, Shield, Trash2, Upload, User } from 'lucide-react';
import {
  changePasswordAction,
  removeProfileAvatarAction,
  requestEmailChangeAction,
  updateProfileDetailsAction,
  uploadProfileAvatarAction,
  type ProfileActionState,
} from '@/app/actions/profile';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import type { UserProfileView } from '@/lib/services/profile';

const INIT: ProfileActionState = { ok: false };
const INPUT =
  'w-full min-w-0 rounded-control border border-line bg-white px-3 py-2.5 text-sm text-ink focus:border-burgundy focus:outline-none focus:ring-2 focus:ring-gold/40';

export interface OwnerReadOnlySummary {
  storeName: string;
  storeSlug: string;
  planName: string | null;
  subscriptionStatus: string | null;
  enabledFeatures: string[];
  canEditBranding: boolean;
}

export function ProfileManager({
  profile,
  roleLabel,
  ownerSummary,
}: {
  profile: UserProfileView;
  roleLabel: string;
  ownerSummary?: OwnerReadOnlySummary | null;
}) {
  const [detailsState, detailsAction, detailsPending] = useActionState(updateProfileDetailsAction, INIT);
  const [avatarState, avatarAction, avatarPending] = useActionState(uploadProfileAvatarAction, INIT);
  const [emailState, emailAction, emailPending] = useActionState(requestEmailChangeAction, INIT);
  const [pwdState, pwdAction, pwdPending] = useActionState(changePasswordAction, INIT);
  const [removeMsg, setRemoveMsg] = useState<ProfileActionState | null>(null);
  const [removing, setRemoving] = useState(false);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [newPwdValue, setNewPwdValue] = useState('');

  const initials = (profile.fullName || profile.email || 'U')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

  const activePhoto = previewUrl || profile.avatarUrl;
  const pwdStrength =
    newPwdValue.length === 0
      ? null
      : newPwdValue.length >= 8 && /[A-Z]/.test(newPwdValue) && /[a-z]/.test(newPwdValue) && /[0-9]/.test(newPwdValue)
        ? { label: 'Strong password', cls: 'text-success' }
        : { label: 'Use 8+ chars with uppercase, lowercase, and a number', cls: 'text-amber-700' };

  async function handleRemovePhoto() {
    setRemoving(true);
    const res = await removeProfileAvatarAction();
    setRemoveMsg(res);
    setPreviewUrl(null);
    setRemoving(false);
  }

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
      <div className="grid min-w-0 gap-6">
        {/* Photo & Basic Details */}
        <section className="grid gap-5 rounded-card border border-line bg-card p-5 shadow-rest sm:p-6">
          <div className="flex flex-wrap items-center gap-4 border-b border-line pb-5">
            {activePhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activePhoto}
                alt={profile.fullName || 'Profile photo'}
                className="h-20 w-20 shrink-0 rounded-full border-2 border-gold object-cover shadow-xs"
              />
            ) : (
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-gold bg-burgundy font-display text-2xl text-gold">
                {initials}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl text-burgundy">Profile Photo</h2>
              <p className="text-xs text-ink-muted">JPG, PNG, or WebP · Max 5 MB. Stored privately in your user folder.</p>
              <form action={avatarAction} className="mt-3 flex flex-wrap items-center gap-2">
                <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-control border border-line bg-cream px-3 py-2 text-xs font-semibold text-burgundy hover:border-burgundy">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Choose photo</span>
                  <input
                    type="file"
                    name="avatar"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setPreviewUrl(URL.createObjectURL(f));
                    }}
                  />
                </label>
                <Button type="submit" disabled={avatarPending} className="min-h-[40px] px-3.5 py-2 text-xs">
                  {avatarPending ? 'Uploading…' : profile.avatarUrl ? 'Replace photo' : 'Upload photo'}
                </Button>
                {profile.avatarUrl ? (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    disabled={removing}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-control border border-danger/40 px-3 py-2 text-xs font-semibold text-danger hover:bg-danger/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{removing ? 'Removing…' : 'Remove'}</span>
                  </button>
                ) : null}
              </form>
              <div className="mt-2">
                <FormMessage ok={avatarState.ok} message={avatarState.message} />
                {removeMsg ? <FormMessage ok={removeMsg.ok} message={removeMsg.message} /> : null}
              </div>
            </div>
          </div>

          <form action={detailsAction} className="grid gap-4" noValidate>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-burgundy" />
              <h2 className="font-display text-xl text-burgundy">Personal Details</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid min-w-0 gap-1.5 text-sm font-medium">
                Full name
                <input name="fullName" defaultValue={profile.fullName} required className={INPUT} />
                {detailsState.fieldErrors?.fullName ? (
                  <span className="text-xs text-danger">{detailsState.fieldErrors.fullName}</span>
                ) : null}
              </label>
              <label className="grid min-w-0 gap-1.5 text-sm font-medium">
                Mobile number
                <input name="phone" defaultValue={profile.phone} inputMode="tel" placeholder="+91 98765 43210" className={INPUT} />
                {detailsState.fieldErrors?.phone ? (
                  <span className="text-xs text-danger">{detailsState.fieldErrors.phone}</span>
                ) : null}
              </label>
            </div>
            <FormMessage ok={detailsState.ok} message={detailsState.message} />
            <Button type="submit" disabled={detailsPending} className="w-full sm:w-fit">
              {detailsPending ? 'Saving…' : 'Save profile'}
            </Button>
          </form>
        </section>

        {/* Email Change */}
        <section className="grid gap-4 rounded-card border border-line bg-card p-5 shadow-rest sm:p-6">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-burgundy" />
            <h2 className="font-display text-xl text-burgundy">Email Address</h2>
          </div>
          <p className="text-sm text-ink-muted">
            Current email: <span className="font-medium text-ink">{profile.email}</span>
          </p>
          {profile.pendingEmail ? (
            <p className="rounded-control border border-gold/50 bg-cream px-3 py-2 text-xs text-burgundy">
              Pending verification for <strong>{profile.pendingEmail}</strong>. Check that inbox to confirm.
            </p>
          ) : null}
          <form action={emailAction} className="flex flex-wrap items-end gap-3" noValidate>
            <label className="grid min-w-0 flex-1 basis-56 gap-1.5 text-sm font-medium">
              New email address
              <input name="newEmail" type="email" required placeholder="new@example.com" className={INPUT} />
            </label>
            <Button type="submit" disabled={emailPending} className="w-full sm:w-auto">
              {emailPending ? 'Sending…' : 'Request email change'}
            </Button>
          </form>
          <FormMessage ok={emailState.ok} message={emailState.message} />
        </section>

        {/* Password Change */}
        <section id="password" className="grid gap-4 rounded-card border border-line bg-card p-5 shadow-rest sm:p-6">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-burgundy" />
            <h2 className="font-display text-xl text-burgundy">Change Password</h2>
          </div>
          <form action={pwdAction} className="grid gap-4" noValidate>
            <label className="grid min-w-0 gap-1.5 text-sm font-medium">
              Current password
              <div className="relative">
                <input
                  name="currentPassword"
                  type={showCurrent ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className={`${INPUT} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-ink-muted hover:text-burgundy"
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {pwdState.fieldErrors?.currentPassword ? (
                <span className="text-xs text-danger">{pwdState.fieldErrors.currentPassword}</span>
              ) : null}
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid min-w-0 gap-1.5 text-sm font-medium">
                New password
                <div className="relative">
                  <input
                    name="newPassword"
                    type={showNew ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={newPwdValue}
                    onChange={(e) => setNewPwdValue(e.target.value)}
                    className={`${INPUT} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    aria-label={showNew ? 'Hide new password' : 'Show new password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-ink-muted hover:text-burgundy"
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {pwdStrength ? <span className={`text-xs ${pwdStrength.cls}`}>{pwdStrength.label}</span> : null}
                {pwdState.fieldErrors?.newPassword ? (
                  <span className="text-xs text-danger">{pwdState.fieldErrors.newPassword}</span>
                ) : null}
              </label>

              <label className="grid min-w-0 gap-1.5 text-sm font-medium">
                Confirm new password
                <div className="relative">
                  <input
                    name="confirmPassword"
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    className={`${INPUT} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-ink-muted hover:text-burgundy"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {pwdState.fieldErrors?.confirmPassword ? (
                  <span className="text-xs text-danger">{pwdState.fieldErrors.confirmPassword}</span>
                ) : null}
              </label>
            </div>
            <FormMessage ok={pwdState.ok} message={pwdState.message} />
            <Button type="submit" disabled={pwdPending} className="w-full sm:w-fit">
              {pwdPending ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        </section>
      </div>

      {/* Read-Only Account & Entitlement Summary */}
      <aside className="grid gap-4 rounded-card border border-line bg-card p-5 shadow-rest sm:p-6">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-burgundy" />
          <h2 className="font-display text-xl text-burgundy">Account Access</h2>
        </div>
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wider text-ink-muted">Role</dt>
            <dd className="mt-0.5 font-semibold text-burgundy">{roleLabel}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-ink-muted">Last sign-in</dt>
            <dd className="mt-0.5 text-ink">
              {profile.lastSignInAt ? new Date(profile.lastSignInAt).toLocaleString('en-IN') : 'Unavailable'}
            </dd>
          </div>
          {ownerSummary ? (
            <>
              <div className="border-t border-line pt-3">
                <dt className="text-xs uppercase tracking-wider text-ink-muted">Store</dt>
                <dd className="mt-0.5 font-semibold text-ink">{ownerSummary.storeName}</dd>
                <dd className="text-xs text-ink-muted">/{ownerSummary.storeSlug}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-ink-muted">Subscription</dt>
                <dd className="mt-0.5 text-ink">
                  {ownerSummary.planName ?? 'Migration / Setup'}
                  {ownerSummary.subscriptionStatus ? ` (${ownerSummary.subscriptionStatus})` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-ink-muted">Assigned Features</dt>
                <dd className="mt-1.5 flex flex-wrap gap-1.5">
                  {ownerSummary.enabledFeatures.length === 0 ? (
                    <span className="text-xs text-ink-muted">Core storefront &amp; orders</span>
                  ) : (
                    ownerSummary.enabledFeatures.map((f) => (
                      <span key={f} className="rounded-full border border-line bg-cream px-2.5 py-0.5 text-[11px] font-medium text-burgundy">
                        {f.replace(/_/g, ' ')}
                      </span>
                    ))
                  )}
                </dd>
              </div>
              {ownerSummary.canEditBranding ? (
                <div className="border-t border-line pt-3">
                  <Link href="/owner/settings" className="text-xs font-semibold text-burgundy underline">
                    Manage Store Branding &amp; Settings &rarr;
                  </Link>
                </div>
              ) : null}
            </>
          ) : null}
        </dl>
      </aside>
    </div>
  );
}
