'use client';

import { useRouter } from 'next/navigation';

interface Store {
  id: string;
  name: string;
  slug?: string;
}

interface Props {
  stores: Store[];
  selectedStoreId: string | null;
}

export function StoreSelector({ stores, selectedStoreId }: Props) {
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const nextId = e.target.value;
    const url = new URL(window.location.href);
    url.searchParams.set('store', nextId);
    router.push(url.pathname + '?' + url.searchParams.toString());
  }

  return (
    <label className="flex items-center gap-2 text-sm font-semibold text-ink">
      <span>Store:</span>
      <select
        value={selectedStoreId ?? stores[0]?.id ?? ''}
        onChange={handleChange}
        className="rounded-control border border-line bg-cream px-3 py-2 text-sm font-medium text-ink focus:border-burgundy focus:outline-none focus:ring-2 focus:ring-gold/40"
      >
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} {s.slug ? `(${s.slug})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
