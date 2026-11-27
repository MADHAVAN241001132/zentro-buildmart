import { ConfigForm } from '@/components/owner/config-form';
import { PageHeader } from '@/components/owner/page-header';
import { ImageSlot } from '@/components/owner/image-slot';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  createBrandAction,
  createCategoryAction,
  createSubcategoryAction,
  updateBrandAction,
  updateCategoryAction,
} from './actions';
import {
  CategoriesTable,
  BrandsTable,
  type CategoryItem,
  type BrandItem,
} from '@/components/owner/categories-view';

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

  const categoryItems: CategoryItem[] = (categories ?? []).map((c) => {
    const id = c.id as string;
    const name = c.name as string;
    const slug = c.slug as string;
    const sortOrder = (c.sort_order as number) ?? 0;
    const isActive = Boolean(c.is_active);
    const imageUrl = (c.image_url as string | null) ?? null;

    return {
      id,
      name,
      slug,
      sort_order: sortOrder,
      is_active: isActive,
      image_url: imageUrl,
      productCount: categoryCounts.get(id) ?? 0,
      editSlot: (
        <details>
          <summary className="cursor-pointer font-semibold text-burgundy hover:underline">
            Edit
          </summary>
          <div className="mt-3 w-full min-w-0 text-left">
            <ImageSlot
              target="category"
              targetId={id}
              label="Category image"
              currentUrl={imageUrl}
            />
            <ConfigForm
              action={updateCategoryAction.bind(null, id)}
              submitLabel="Save category"
              fields={[
                { name: 'name', label: 'Name', required: true, defaultValue: name },
                { name: 'slug', label: 'Slug', defaultValue: slug },
                { name: 'sortOrder', label: 'Sort order', type: 'number', defaultValue: sortOrder },
                { name: 'isActive', label: 'Visible in the showroom', type: 'checkbox', defaultChecked: isActive },
              ]}
            />
          </div>
        </details>
      ),
    };
  });

  const brandItems: BrandItem[] = (brands ?? []).map((b) => {
    const id = b.id as string;
    const name = b.name as string;
    const slug = b.slug as string;
    const isPremium = Boolean(b.is_premium);
    const logoUrl = (b.logo_url as string | null) ?? null;

    return {
      id,
      name,
      slug,
      is_premium: isPremium,
      logo_url: logoUrl,
      productCount: brandCounts.get(id) ?? 0,
      editSlot: (
        <details>
          <summary className="cursor-pointer font-semibold text-burgundy hover:underline">
            Edit
          </summary>
          <div className="mt-3 min-w-[260px] text-left">
            <ImageSlot
              target="brand"
              targetId={id}
              label="Brand logo"
              currentUrl={logoUrl}
            />
            <ConfigForm
              action={updateBrandAction.bind(null, id)}
              submitLabel="Save brand"
              fields={[
                { name: 'name', label: 'Name', required: true, defaultValue: name },
                { name: 'slug', label: 'Slug', defaultValue: slug },
                { name: 'isPremium', label: 'Premium brand', type: 'checkbox', defaultChecked: isPremium },
              ]}
            />
          </div>
        </details>
      ),
    };
  });

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Catalogue"
        title="Categories and brands"
        description="Visual category and brand management. Click on any category, brand or product count to filter the Products catalogue."
      />

      {/* SECTION 1: Categories */}
      <section className="grid gap-4" aria-labelledby="cat-heading">
        <div className="flex items-center justify-between">
          <h2 id="cat-heading" className="font-display text-2xl text-burgundy">
            Categories ({categoryItems.length})
          </h2>
          <span className="text-xs text-ink-muted">All categories feature synchronized high-resolution images</span>
        </div>

        <CategoriesTable categories={categoryItems} />

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

      {/* SECTION 2: Subcategories */}
      <section className="grid gap-4" aria-labelledby="sub-heading">
        <h2 id="sub-heading" className="font-display text-2xl text-burgundy">
          Subcategories
        </h2>
        <ul className="grid gap-1 rounded-card border border-line bg-card p-5 text-sm">
          {(subcategories ?? []).length === 0 ? <li className="text-ink-muted">No subcategories yet.</li> : null}
          {(subcategories ?? []).map((s) => {
            const parent = (categories ?? []).find((c) => c.id === s.category_id);
            return (
              <li key={s.id as string} className="text-ink">
                {parent ? <span className="font-semibold text-burgundy">{parent.name as string} › </span> : ''}
                {s.name as string}
              </li>
            );
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

      {/* SECTION 3: Brands */}
      <section className="grid gap-4" aria-labelledby="brand-heading">
        <div className="flex items-center justify-between">
          <h2 id="brand-heading" className="font-display text-2xl text-burgundy">
            Brands ({brandItems.length})
          </h2>
          <span className="text-xs text-ink-muted">Click brand name or product count to filter catalogue</span>
        </div>

        <BrandsTable brands={brandItems} />

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
