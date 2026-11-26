'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { brandSchema, categorySchema, issuesToFields, slugFor, subcategorySchema } from '@/lib/validation/owner';

export interface CatalogueResult {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

const text = (fd: FormData, k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : '');
const DUP = 'That name or slug is already in use';

async function guard() {
  const owner = await requireOwnerPermission('category_brand_management');
  return owner;
}

function fail(error: unknown): CatalogueResult {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('duplicate')) return { ok: false, message: DUP };
  return { ok: false, message: message || 'Could not save' };
}

export async function createCategoryAction(_prev: CatalogueResult, fd: FormData): Promise<CatalogueResult> {
  try {
    const owner = await guard();
    const parsed = categorySchema.safeParse({
      name: text(fd, 'name'), slug: text(fd, 'slug'), sortOrder: text(fd, 'sortOrder') || '0', imageUrl: text(fd, 'imageUrl'), isActive: fd.get('isActive'),
    });
    if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('categories').insert({
      store_id: owner.storeId, name: parsed.data.name, slug: slugFor(parsed.data.name, parsed.data.slug),
      sort_order: parsed.data.sortOrder, is_active: parsed.data.isActive,
    });
    if (error) return fail(error);
    revalidatePath('/owner/categories');
    return { ok: true, message: 'Category created' };
  } catch (error) {
    return fail(error);
  }
}

export async function updateCategoryAction(categoryId: string, _prev: CatalogueResult, fd: FormData): Promise<CatalogueResult> {
  try {
    const owner = await guard();
    const parsed = categorySchema.safeParse({
      name: text(fd, 'name'), slug: text(fd, 'slug'), sortOrder: text(fd, 'sortOrder') || '0', imageUrl: text(fd, 'imageUrl'), isActive: fd.get('isActive'),
    });
    if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('categories').update({
      name: parsed.data.name, slug: slugFor(parsed.data.name, parsed.data.slug), sort_order: parsed.data.sortOrder,
      is_active: parsed.data.isActive, updated_at: new Date().toISOString(),
    }).eq('id', categoryId).eq('store_id', owner.storeId);
    if (error) return fail(error);
    revalidatePath('/owner/categories');
    return { ok: true, message: 'Category saved' };
  } catch (error) {
    return fail(error);
  }
}

export async function createSubcategoryAction(_prev: CatalogueResult, fd: FormData): Promise<CatalogueResult> {
  try {
    const owner = await guard();
    const parsed = subcategorySchema.safeParse({ categoryId: text(fd, 'categoryId'), name: text(fd, 'name'), slug: text(fd, 'slug'), sortOrder: text(fd, 'sortOrder') || '0' });
    if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
    const supabase = await createSupabaseServerClient();
    const { data: category } = await supabase.from('categories').select('id').eq('id', parsed.data.categoryId).eq('store_id', owner.storeId).maybeSingle();
    if (!category) return { ok: false, message: 'Choose a category from this store' };
    const { error } = await supabase.from('subcategories').insert({
      store_id: owner.storeId, category_id: parsed.data.categoryId, name: parsed.data.name,
      slug: slugFor(parsed.data.name, parsed.data.slug), sort_order: parsed.data.sortOrder,
    });
    if (error) return fail(error);
    revalidatePath('/owner/categories');
    return { ok: true, message: 'Subcategory created' };
  } catch (error) {
    return fail(error);
  }
}

export async function createBrandAction(_prev: CatalogueResult, fd: FormData): Promise<CatalogueResult> {
  try {
    const owner = await guard();
    const parsed = brandSchema.safeParse({ name: text(fd, 'name'), slug: text(fd, 'slug'), isPremium: fd.get('isPremium') });
    if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('brands').insert({
      store_id: owner.storeId, name: parsed.data.name, slug: slugFor(parsed.data.name, parsed.data.slug), is_premium: parsed.data.isPremium,
    });
    if (error) return fail(error);
    revalidatePath('/owner/categories');
    return { ok: true, message: 'Brand created' };
  } catch (error) {
    return fail(error);
  }
}

export async function updateBrandAction(brandId: string, _prev: CatalogueResult, fd: FormData): Promise<CatalogueResult> {
  try {
    const owner = await guard();
    const parsed = brandSchema.safeParse({ name: text(fd, 'name'), slug: text(fd, 'slug'), isPremium: fd.get('isPremium') });
    if (!parsed.success) return { ok: false, message: 'Check the highlighted fields', fieldErrors: issuesToFields(parsed.error) };
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from('brands').update({
      name: parsed.data.name, slug: slugFor(parsed.data.name, parsed.data.slug), is_premium: parsed.data.isPremium,
    }).eq('id', brandId).eq('store_id', owner.storeId);
    if (error) return fail(error);
    revalidatePath('/owner/categories');
    return { ok: true, message: 'Brand saved' };
  } catch (error) {
    return fail(error);
  }
}
