'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { CreationImagePicker } from '@/components/owner/creation-image-picker';
import { FormMessage } from '@/components/ui/form-message';
import { CheckField, SelectField, TextAreaField, TextField } from '@/components/owner/field';
import { APPLICATIONS, GST_RATES_BPS, UNITS } from '@/lib/validation/owner';
import type { ProductActionState } from './actions';

export interface ProductFormDefaults {
  sku?: string;
  name?: string;
  slug?: string;
  categoryId?: string;
  subcategoryId?: string;
  brandId?: string;
  description?: string;
  hsnCode?: string;
  gstRateBps?: number;
  unitOfSale?: string;
  finish?: string;
  colour?: string;
  application?: string;
  warrantyMonths?: number | null;
  visibility?: 'public' | 'hidden';
  isFeatured?: boolean;
  isNewArrival?: boolean;
  isBestSeller?: boolean;
  isSpecialOffer?: boolean;
}

export interface Option {
  id: string;
  name: string;
  categoryId?: string;
}

interface Props {
  action: (prev: ProductActionState, formData: FormData) => Promise<ProductActionState>;
  defaults: ProductFormDefaults;
  categories: Option[];
  subcategories: Option[];
  brands: Option[];
  /** Variant fields are only shown when creating a product; existing variants are managed below the form. */
  includeFirstVariant: boolean;
  defaultVariant?: { sku?: string; label?: string; sizeLabel?: string; salePrice?: string; costPrice?: string; mrp?: string; priceUnit?: string; piecesPerBox?: number; coverageSqft?: number | null };
  submitLabel: string;
}

const INITIAL: ProductActionState = { ok: false };

export function ProductForm({ action, defaults, categories, subcategories, brands, includeFirstVariant, defaultVariant, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="grid gap-8" noValidate>
      <section className="grid gap-4 rounded-card border border-line bg-card p-6">
        <h2 className="font-display text-xl text-burgundy">Product details</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField name="name" label="Product name" defaultValue={defaults.name} error={errors.name} required />
          <TextField name="sku" label="Product SKU" defaultValue={defaults.sku} error={errors.sku} required hint="Unique within the store" />
          <TextField name="slug" label="URL slug" defaultValue={defaults.slug} error={errors.slug} hint="Leave blank to generate from the name" />
          <SelectField name="categoryId" label="Category" defaultValue={defaults.categoryId ?? ''} error={errors.categoryId} required>
            <option value="" disabled>Choose a category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectField>
          <SelectField name="subcategoryId" label="Subcategory" defaultValue={defaults.subcategoryId ?? ''} error={errors.subcategoryId}>
            <option value="">None</option>
            {subcategories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </SelectField>
          <SelectField name="brandId" label="Brand" defaultValue={defaults.brandId ?? ''} error={errors.brandId}>
            <option value="">No brand</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </SelectField>
          <TextField name="hsnCode" label="HSN code" defaultValue={defaults.hsnCode} error={errors.hsnCode} />
          <SelectField name="gstRateBps" label="GST rate" defaultValue={String(defaults.gstRateBps ?? 1800)} error={errors.gstRateBps}>
            {GST_RATES_BPS.map((r) => <option key={r} value={r}>{(r / 100).toFixed(0)}%</option>)}
          </SelectField>
          <SelectField name="unitOfSale" label="Unit of sale" defaultValue={defaults.unitOfSale ?? 'piece'} error={errors.unitOfSale}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </SelectField>
          <SelectField name="application" label="Application" defaultValue={defaults.application ?? ''} error={errors.application}>
            <option value="">Not specified</option>
            {APPLICATIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </SelectField>
          <TextField name="finish" label="Finish" defaultValue={defaults.finish} error={errors.finish} />
          <TextField name="colour" label="Colour" defaultValue={defaults.colour} error={errors.colour} />
          <TextField name="warrantyMonths" label="Warranty (months)" inputMode="numeric" defaultValue={defaults.warrantyMonths ?? ''} error={errors.warrantyMonths} />
          <SelectField name="visibility" label="Storefront visibility" defaultValue={defaults.visibility ?? 'public'} error={errors.visibility}>
            <option value="public">Public (shown in the showroom)</option>
            <option value="hidden">Hidden (not shown to customers)</option>
          </SelectField>
        </div>
        <TextAreaField name="description" label="Description" defaultValue={defaults.description} error={errors.description} />
        <div className="flex flex-wrap gap-5">
          <CheckField name="isFeatured" label="Featured" defaultChecked={defaults.isFeatured} />
          <CheckField name="isNewArrival" label="New arrival" defaultChecked={defaults.isNewArrival} />
          <CheckField name="isBestSeller" label="Best seller" defaultChecked={defaults.isBestSeller} />
          <CheckField name="isSpecialOffer" label="Special offer" defaultChecked={defaults.isSpecialOffer} />
        </div>
      </section>

      {includeFirstVariant ? (
        <section className="grid gap-4 rounded-card border border-line bg-card p-6">
          <h2 className="font-display text-xl text-burgundy">First variant</h2>
          <p className="text-sm text-ink-muted">A product needs at least one variant to be sold. Prices are entered in rupees.</p>
          <VariantFields errors={errors} defaults={defaultVariant} />
        </section>
      ) : null}

      {includeFirstVariant ? (
        <section className="grid gap-4 rounded-card border border-line bg-card p-6">
          <CreationImagePicker resetToken={state} />
          {errors.images ? <p className="text-sm text-danger">{errors.images}</p> : null}
        </section>
      ) : null}

      <div className="grid gap-3">
        <FormMessage ok={state.ok} message={state.message} />
        <div>
          <Button type="submit" disabled={pending}>{pending ? 'Saving…' : submitLabel}</Button>
        </div>
      </div>
    </form>
  );
}

/** Variant input fields. Shared by the create form and the variant editor. */
export function VariantFields({ errors, defaults }: { errors: Record<string, string>; defaults?: Props['defaultVariant'] }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <TextField name="variantSku" label="Variant SKU" defaultValue={defaults?.sku} error={errors.sku} required />
      <TextField name="label" label="Variant label" defaultValue={defaults?.label} error={errors.label} required hint="For example 600×1200 mm, Glossy" />
      <TextField name="sizeLabel" label="Size" defaultValue={defaults?.sizeLabel} error={errors.sizeLabel} />
      <TextField name="salePrice" label="Selling price (₹)" inputMode="decimal" defaultValue={defaults?.salePrice} error={errors.salePrice} required />
      <TextField name="costPrice" label="Cost price (₹)" inputMode="decimal" defaultValue={defaults?.costPrice} error={errors.costPrice} hint="Used for gross profit" />
      <TextField name="mrp" label="MRP (₹)" inputMode="decimal" defaultValue={defaults?.mrp} error={errors.mrp} />
      <SelectField name="priceUnit" label="Price unit" defaultValue={defaults?.priceUnit ?? 'piece'} error={errors.priceUnit}>
        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </SelectField>
      <TextField name="piecesPerBox" label="Pieces per box" inputMode="numeric" defaultValue={defaults?.piecesPerBox ?? 1} error={errors.piecesPerBox} />
      <TextField name="coverageSqft" label="Coverage per box (sq ft)" inputMode="decimal" defaultValue={defaults?.coverageSqft ?? ''} error={errors.coverageSqft} />
      <div className="flex gap-5 md:col-span-3">
        <CheckField name="isDefault" label="Default variant" defaultChecked />
        <CheckField name="isActive" label="Active" defaultChecked />
      </div>
    </div>
  );
}
