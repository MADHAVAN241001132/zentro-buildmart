'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, buttonClass } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';

export interface BrandingFormState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

const INITIAL_STATE: BrandingFormState = { ok: false };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

interface StoreBrandingManagerProps {
  storeId: string;
  storeSlug: string;
  currentName: string;
  currentLogoUrl: string | null;
  currentBannerUrl: string | null;
  currentTagline: string;
  currentDescription: string;
  action: (prev: BrandingFormState, formData: FormData) => Promise<BrandingFormState>;
  isOwner?: boolean;
}

export function StoreBrandingManager({
  storeId,
  storeSlug,
  currentName,
  currentLogoUrl,
  currentBannerUrl,
  currentTagline,
  currentDescription,
  action,
  isOwner = false,
}: StoreBrandingManagerProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  const [name, setName] = useState(currentName);
  const [tagline, setTagline] = useState(currentTagline);
  const [description, setDescription] = useState(currentDescription);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Sync local state when server props refresh after save
  useEffect(() => {
    setName(currentName);
    setTagline(currentTagline);
    setDescription(currentDescription);
    setLogoFile(null);
    setLogoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setRemoveLogo(false);
    setBannerFile(null);
    setBannerPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setRemoveBanner(false);
    if (logoInputRef.current) logoInputRef.current.value = '';
    if (bannerInputRef.current) bannerInputRef.current.value = '';
  }, [currentName, currentTagline, currentDescription, currentLogoUrl, currentBannerUrl]);

  useEffect(() => {
    if (state.ok) {
      router.refresh();
    }
  }, [state.ok, router]);

  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  useEffect(() => {
    return () => {
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    };
  }, [bannerPreview]);

  const hasUnsavedChanges =
    name !== currentName ||
    tagline !== currentTagline ||
    description !== currentDescription ||
    logoFile !== null ||
    removeLogo ||
    bannerFile !== null ||
    removeBanner;

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return 'Only PNG, JPG, JPEG, and WebP images are supported.';
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return 'Image must be 5 MB or smaller.';
    }
    return null;
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    const err = validateFile(file);
    if (err) {
      setLogoError(err);
      e.target.value = '';
      return;
    }
    setLogoError(null);
    setRemoveLogo(false);
    setLogoFile(file);
    setLogoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    const err = validateFile(file);
    if (err) {
      setBannerError(err);
      e.target.value = '';
      return;
    }
    setBannerError(null);
    setRemoveBanner(false);
    setBannerFile(file);
    setBannerPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const handleCancelUnsaved = () => {
    setName(currentName);
    setTagline(currentTagline);
    setDescription(currentDescription);
    setLogoFile(null);
    setLogoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setRemoveLogo(false);
    setLogoError(null);
    setBannerFile(null);
    setBannerPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setRemoveBanner(false);
    setBannerError(null);
    if (logoInputRef.current) logoInputRef.current.value = '';
    if (bannerInputRef.current) bannerInputRef.current.value = '';
  };

  const displayedLogo = removeLogo ? null : logoPreview ?? currentLogoUrl;
  const displayedBanner = removeBanner ? null : bannerPreview ?? currentBannerUrl;
  const e = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="grid gap-6 rounded-card border border-line bg-card p-6">
      <input type="hidden" name="storeId" value={storeId} />
      <input type="hidden" name="removeLogo" value={removeLogo ? 'true' : 'false'} />
      <input type="hidden" name="removeBanner" value={removeBanner ? 'true' : 'false'} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div>
          <h3 className="font-display text-xl text-burgundy">
            {isOwner ? 'Storefront Branding' : 'Store Branding & Identity'}
          </h3>
          <p className="text-xs text-ink-muted">
            Manage store name, logo, storefront banner, tagline, and description displayed on the guest storefront.
          </p>
        </div>
        <a
          href={`/store/${storeSlug}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass('secondary')}
        >
          Preview Guest Storefront ↗
        </a>
      </div>

      {/* Text Identity Fields */}
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium text-ink">
          Store Name *
          <input
            type="text"
            name="name"
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            required
            className="rounded-control border border-line bg-white px-3 py-2 text-sm font-normal text-ink focus:border-burgundy focus:outline-none"
          />
          {e.name ? <span className="text-xs text-danger">{e.name}</span> : null}
        </label>

        <label className="grid gap-1.5 text-sm font-medium text-ink">
          Store Tagline
          <input
            type="text"
            name="tagline"
            value={tagline}
            onChange={(ev) => setTagline(ev.target.value)}
            placeholder="e.g. Premium Tiles & Sanitaryware Showroom"
            maxLength={160}
            className="rounded-control border border-line bg-white px-3 py-2 text-sm font-normal text-ink focus:border-burgundy focus:outline-none"
          />
          {e.tagline ? <span className="text-xs text-danger">{e.tagline}</span> : null}
        </label>
      </div>

      <label className="grid gap-1.5 text-sm font-medium text-ink">
        Store Description
        <textarea
          name="description"
          value={description}
          onChange={(ev) => setDescription(ev.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Describe your store, product specialties, and showroom highlights."
          className="rounded-control border border-line bg-white px-3 py-2 text-sm font-normal text-ink focus:border-burgundy focus:outline-none"
        />
        {e.description ? <span className="text-xs text-danger">{e.description}</span> : null}
      </label>

      {/* Store Logo Management */}
      <div className="grid gap-3 rounded-card border border-line bg-cream p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-ink">Store Logo</p>
            <p className="text-xs text-ink-muted">
              PNG, JPG, JPEG, or WebP up to 5 MB. Transparent PNG supported; aspect ratio is preserved.
            </p>
          </div>
          {logoPreview ? (
            <span className="rounded-full bg-gold/20 px-2.5 py-0.5 text-xs font-medium text-burgundy">
              New logo preview (unsaved)
            </span>
          ) : removeLogo ? (
            <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-medium text-danger">
              Marked for removal (unsaved)
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-24 w-32 shrink-0 place-items-center overflow-hidden rounded-control border border-line bg-white p-2">
            {displayedLogo ? (
              <img
                src={displayedLogo}
                alt={`${name || currentName} Logo Preview`}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="text-xs text-ink-muted">No logo</span>
            )}
          </div>

          <div className="grid gap-2">
            <input
              ref={logoInputRef}
              type="file"
              name="logoFile"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              onChange={handleLogoChange}
              className="text-xs text-ink file:mr-3 file:rounded-control file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink hover:file:bg-cream"
            />
            <div className="flex flex-wrap items-center gap-2">
              {logoPreview ? (
                <button
                  type="button"
                  onClick={() => {
                    setLogoFile(null);
                    setLogoPreview((prev) => {
                      if (prev) URL.revokeObjectURL(prev);
                      return null;
                    });
                    if (logoInputRef.current) logoInputRef.current.value = '';
                  }}
                  className="rounded-control border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink hover:bg-cream"
                >
                  Cancel logo preview
                </button>
              ) : null}
              {(currentLogoUrl || logoPreview) && !removeLogo ? (
                <button
                  type="button"
                  onClick={() => {
                    setLogoFile(null);
                    setLogoPreview((prev) => {
                      if (prev) URL.revokeObjectURL(prev);
                      return null;
                    });
                    setRemoveLogo(true);
                    if (logoInputRef.current) logoInputRef.current.value = '';
                  }}
                  className="rounded-control border border-danger/30 bg-white px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/5"
                >
                  Remove logo
                </button>
              ) : null}
              {removeLogo && currentLogoUrl ? (
                <button
                  type="button"
                  onClick={() => setRemoveLogo(false)}
                  className="rounded-control border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink hover:bg-cream"
                >
                  Restore current logo
                </button>
              ) : null}
            </div>
            {logoError ? <p className="text-xs text-danger">{logoError}</p> : null}
          </div>
        </div>
      </div>

      {/* Storefront Banner Management */}
      <div className="grid gap-3 rounded-card border border-line bg-cream p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-ink">Storefront Banner Image</p>
            <p className="text-xs text-ink-muted">
              Recommended 1600 × 500 px. PNG, JPG, JPEG, or WebP up to 5 MB. Preserves aspect ratio across desktop, tablet, and mobile.
            </p>
          </div>
          {bannerPreview ? (
            <span className="rounded-full bg-gold/20 px-2.5 py-0.5 text-xs font-medium text-burgundy">
              New banner preview (unsaved)
            </span>
          ) : removeBanner ? (
            <span className="rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-medium text-danger">
              Marked for removal (unsaved)
            </span>
          ) : null}
        </div>

        <div className="grid gap-3">
          <div className="grid aspect-[16/5] w-full max-w-2xl place-items-center overflow-hidden rounded-control border border-line bg-white">
            {displayedBanner ? (
              <img
                src={displayedBanner}
                alt={`${name || currentName} Banner Preview`}
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-xs text-ink-muted">No storefront banner uploaded</span>
            )}
          </div>

          <div className="grid gap-2">
            <input
              ref={bannerInputRef}
              type="file"
              name="bannerFile"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              onChange={handleBannerChange}
              className="text-xs text-ink file:mr-3 file:rounded-control file:border file:border-line file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink hover:file:bg-cream"
            />
            <div className="flex flex-wrap items-center gap-2">
              {bannerPreview ? (
                <button
                  type="button"
                  onClick={() => {
                    setBannerFile(null);
                    setBannerPreview((prev) => {
                      if (prev) URL.revokeObjectURL(prev);
                      return null;
                    });
                    if (bannerInputRef.current) bannerInputRef.current.value = '';
                  }}
                  className="rounded-control border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink hover:bg-cream"
                >
                  Cancel banner preview
                </button>
              ) : null}
              {(currentBannerUrl || bannerPreview) && !removeBanner ? (
                <button
                  type="button"
                  onClick={() => {
                    setBannerFile(null);
                    setBannerPreview((prev) => {
                      if (prev) URL.revokeObjectURL(prev);
                      return null;
                    });
                    setRemoveBanner(true);
                    if (bannerInputRef.current) bannerInputRef.current.value = '';
                  }}
                  className="rounded-control border border-danger/30 bg-white px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/5"
                >
                  Remove banner
                </button>
              ) : null}
              {removeBanner && currentBannerUrl ? (
                <button
                  type="button"
                  onClick={() => setRemoveBanner(false)}
                  className="rounded-control border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink hover:bg-cream"
                >
                  Restore current banner
                </button>
              ) : null}
            </div>
            {bannerError ? <p className="text-xs text-danger">{bannerError}</p> : null}
          </div>
        </div>
      </div>

      <FormMessage ok={state.ok} message={state.message} />

      <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
        {hasUnsavedChanges ? (
          <button
            type="button"
            onClick={handleCancelUnsaved}
            disabled={pending}
            className={buttonClass('secondary')}
          >
            Cancel unsaved changes
          </button>
        ) : null}
        <Button type="submit" disabled={pending || Boolean(logoError) || Boolean(bannerError)}>
          {pending ? 'Saving branding…' : 'Save branding changes'}
        </Button>
      </div>
    </form>
  );
}
