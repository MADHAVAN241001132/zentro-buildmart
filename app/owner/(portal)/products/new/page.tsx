import { PageHeader } from '@/components/owner/page-header';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ProductForm } from '../product-form';
import { createProductAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  const owner = await requireOwnerPermission('product_management');
  const supabase = await createSupabaseServerClient();
  const [{ data: categories }, { data: subcategories }, { data: brands }] = await Promise.all([
    supabase.from('categories').select('id, name').eq('store_id', owner.storeId).order('sort_order'),
    supabase.from('subcategories').select('id, name, category_id').eq('store_id', owner.storeId).order('sort_order'),
    supabase.from('brands').select('id, name').eq('store_id', owner.storeId).order('name'),
  ]);
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Catalogue" title="Add product" description="The product is saved with its first variant. You can add more variants after saving." />
      <ProductForm
        action={createProductAction}
        defaults={{}}
        categories={(categories ?? []).map((c) => ({ id: c.id as string, name: c.name as string }))}
        subcategories={(subcategories ?? []).map((s) => ({ id: s.id as string, name: s.name as string, categoryId: s.category_id as string }))}
        brands={(brands ?? []).map((b) => ({ id: b.id as string, name: b.name as string }))}
        includeFirstVariant
        submitLabel="Save product"
      />
    </div>
  );
}
