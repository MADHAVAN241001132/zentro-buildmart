export interface ProductFilters {
  q?: string;
  category?: string;
  brand?: string;
  status?: 'active' | 'archived';
}

export function parseProductFilters(sp: Record<string, string | string[] | undefined>): ProductFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  const status = one(sp.status);
  return {
    q: one(sp.q),
    category: one(sp.category),
    brand: one(sp.brand),
    status: status === 'archived' ? 'archived' : status === 'active' ? 'active' : undefined,
  };
}
