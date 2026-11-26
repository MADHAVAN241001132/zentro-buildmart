import { ConfigForm } from '@/components/owner/config-form';
import { PageHeader } from '@/components/owner/page-header';
import { ImageSlot } from '@/components/owner/image-slot';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createBrandAction, createCategoryAction, createSubcategoryAction, updateBrandAction, updateCategoryAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const owner = await requireOwnerPermission('category_brand_management');
  const supabase = await createSupabaseServerClient();
  const [{ data: categories }, { data: subcategories }, { data: brands }, { data: products }] = await Promise.all([
    supabase.from('categories').select('id, name, slug, sort_order, is_active, image_url').eq('store_id', owner.storeId).order('sort_order'),
    supabase.from('subcategories').select('id, name, category_id').eq('store_id', owner.storeId).order('sort_order'),
    supabase.from('brands').select('id, name, slug, is_premium, logo_url').eq('store_id', owner.storeId).order('name'),
    supabase.from('products').select('category_id, brand_id').eq('store_id', owner.storeId).eq('status', 'active'),
  ]);

  const categoryCounts = new Map<string, number>();
  const brandCounts = new Map<string, number>();
  for (const p of (products ?? []) as { category_id: string; brand_id: string | null }[]) {
    categoryCounts.set(p.category_id, (categoryCounts.get(p.category_id) ?? 0) + 1);
    if (p.brand_id) brandCounts.set(p.brand_id, (brandCounts.get(p.brand_id) ?? 0) + 1);
  }
  const categoryOptions = (categories ?? []).map((c) => ({ value: c.id as string, label: c.name as string }));

  return (
    <div className="grid gap-8">
      <PageHeader eyebrow="Catalogue" title="Categories and brands" description="Visibility follows each category's active flag. Product counts include active products only." />

      <section className="grid gap-4" aria-labelledby="cat-heading">
        <h2 id="cat-heading" className="font-display text-2xl text-burgundy">Categories</h2>
        <div className="overflow-x-auto rounded-card border border-line bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Slug</th><th className="px-4 py-3">Products</th><th className="px-4 py-3">Active</th><th className="px-4 py-3">Edit</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(categories ?? []).map((c) => (
                <tr key={c.id as string} className="align-top">
                  <td className="px-4 py-3 font-medium">{c.name as string}</td>
                  <td className="px-4 py-3 text-ink-muted">{c.slug as string}</td>
                  <td className="px-4 py-3">{categoryCounts.get(c.id as string) ?? 0}</td>
                  <td className="px-4 py-3">{c.is_active ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3">
                    <details>
                      <summary className="cursor-pointer font-semibold text-burgundy">Edit</summary>
                      <div className="mt-3 min-w-[280px]">
                        <ImageSlot target="category" targetId={c.id as string} label="Category image" currentUrl={(c.image_url as string | null) ?? null} />
                        <ConfigForm
                          action={updateCategoryAction.bind(null, c.id as string)}
                          submitLabel="Save category"
                          fields={[
                            { name: 'name', label: 'Name', required: true, defaultValue: c.name as string },
                            { name: 'slug', label: 'Slug', defaultValue: c.slug as string },
                            { name: 'sortOrder', label: 'Sort order', type: 'number', defaultValue: c.sort_order as number },
                                            { name: 'isActive', label: 'Visible in the showroom', type: 'checkbox', defaultChecked: c.is_active as boolean },
                          ]}
                        />
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-card border border-line bg-card p-5">
          <h3 className="mb-3 font-semibold text-ink">Add category</h3>
          <ConfigForm
            action={createCategoryAction}
            compact
            submitLabel="Add category"
            fields={[
              { name: 'name', label: 'Name', required: true },
              { name: 'slug', label: 'Slug (optional)' },
              { name: 'sortOrder', label: 'Sort order', type: 'number', defaultValue: 0 },
              { name: 'isActive', label: 'Visible', type: 'checkbox', defaultChecked: true },
            ]}
          />
        </div>
      </section>

      <section className="grid gap-4" aria-labelledby="sub-heading">
        <h2 id="sub-heading" className="font-display text-2xl text-burgundy">Subcategories</h2>
        <ul className="grid gap-1 rounded-card border border-line bg-card p-5 text-sm">
          {(subcategories ?? []).length === 0 ? <li className="text-ink-muted">No subcategories yet.</li> : null}
          {(subcategories ?? []).map((s) => {
            const parent = (categories ?? []).find((c) => c.id === s.category_id);
            return <li key={s.id as string}>{parent ? `${parent.name as string} › ` : ''}{s.name as string}</li>;
          })}
        </ul>
        <div className="rounded-card border border-line bg-card p-5">
          <h3 className="mb-3 font-semibold text-ink">Add subcategory</h3>
          <ConfigForm
            action={createSubcategoryAction}
            compact
            submitLabel="Add subcategory"
            fields={[
              { name: 'categoryId', label: 'Category', type: 'select', options: categoryOptions, defaultValue: categoryOptions[0]?.value ?? '' },
              { name: 'name', label: 'Name', required: true },
              { name: 'slug', label: 'Slug (optional)' },
            ]}
          />
        </div>
      </section>

      <section className="grid gap-4" aria-labelledby="brand-heading">
        <h2 id="brand-heading" className="font-display text-2xl text-burgundy">Brands</h2>
        <div className="overflow-x-auto rounded-card border border-line bg-card">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              <tr><th className="px-4 py-3">Brand</th><th className="px-4 py-3">Premium</th><th className="px-4 py-3">Products</th><th className="px-4 py-3">Edit</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(brands ?? []).map((b) => (
                <tr key={b.id as string} className="align-top">
                  <td className="px-4 py-3 font-medium">{b.name as string}</td>
                  <td className="px-4 py-3">{b.is_premium ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3">{brandCounts.get(b.id as string) ?? 0}</td>
                  <td className="px-4 py-3">
                    <details>
                      <summary className="cursor-pointer font-semibold text-burgundy">Edit</summary>
                      <div className="mt-3 min-w-[260px]">
                        <ImageSlot target="brand" targetId={b.id as string} label="Brand logo" currentUrl={(b.logo_url as string | null) ?? null} />
                        <ConfigForm
                          action={updateBrandAction.bind(null, b.id as string)}
                          submitLabel="Save brand"
                          fields={[
                            { name: 'name', label: 'Name', required: true, defaultValue: b.name as string },
                            { name: 'slug', label: 'Slug', defaultValue: b.slug as string },
                            { name: 'isPremium', label: 'Premium brand', type: 'checkbox', defaultChecked: b.is_premium as boolean },
                          ]}
                        />
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-card border border-line bg-card p-5">
          <h3 className="mb-3 font-semibold text-ink">Add brand</h3>
          <ConfigForm
            action={createBrandAction}
            compact
            submitLabel="Add brand"
            fields={[
              { name: 'name', label: 'Name', required: true },
              { name: 'slug', label: 'Slug (optional)' },
              { name: 'isPremium', label: 'Premium', type: 'checkbox' },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
