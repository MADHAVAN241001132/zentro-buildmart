import { notFound } from 'next/navigation';
import { RoomPhotoUploader } from '@/components/guest/room-photo-uploader';
import { RoomVisualizer, type VisualizerPhoto, type VisualizerProduct } from '@/components/guest/room-visualizer';
import { readGuestSession } from '@/lib/services/guest';
import { listProjectOptions } from '@/lib/services/house-projects';
import { guestRoomPhotos } from '@/lib/services/guest-photos';
import { getProductDetailsByIds, getStoreBySlug, listProducts } from '@/lib/services/storefront';
import { randomUUID } from 'node:crypto';
import { removeRoomPhotoAction } from './actions';

export const dynamic = 'force-dynamic';

/** Catalogue shown in the visualizer: public, in-store products with a price. */
async function loadProducts(storeId: string): Promise<VisualizerProduct[]> {
  const page = await listProducts(storeId, { pageSize: 60, sort: 'name' });
  const details = await getProductDetailsByIds(storeId, page.items.map((p) => p.id));
  return details.map((d) => ({
    id: d.id,
    name: d.name,
    brand: d.brand,
    categoryName: d.categoryName,
    imageUrl: d.imageUrl,
    gstRateBps: d.gstRateBps,
    variants: d.variants.map((v) => ({
      id: v.id,
      label: v.label,
      sizeLabel: v.sizeLabel,
      priceUnit: v.priceUnit,
      salePricePaise: v.salePricePaise,
      availableUnits: v.availableUnits,
    })),
  }));
}

export default async function RoomVisualizerPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { storeSlug } = await params;
  const { notice, error } = await searchParams;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();

  let photos: VisualizerPhoto[] = [];
  let products: VisualizerProduct[] = [];
  let projects: { id: string; name: string; rooms: { id: string; name: string; roomLabel: string }[] }[] = [];
  let loadFailed = false;
  try {
    const session = await readGuestSession(store.id, storeSlug);
    if (session) {
      photos = await guestRoomPhotos(store.id, session.id);
      projects = await listProjectOptions(store.id, session.id);
    }
    products = await loadProducts(store.id);
  } catch {
    loadFailed = true;
  }
  const submissionId = randomUUID();

  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Visualizer</p>
        <h1 className="font-display text-3xl text-burgundy">See tiles and fittings on your room</h1>
        <p className="max-w-2xl text-sm text-ink-muted">
          Upload a photograph of a room, then place products from this showroom on it. This is an approximate product preview, not a measured or photorealistic rendering.
          Photographs are private to this browser session and are shown only to you.
        </p>
      </header>

      {notice ? <p role="status" className="rounded-card border border-line bg-card p-3 text-sm text-ink">{notice}</p> : null}
      {error ? <p role="alert" className="rounded-card border border-danger bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}

      {loadFailed ? (
        <p role="alert" className="rounded-card border border-danger bg-danger/10 p-4 text-sm text-danger">
          The visualizer could not load right now. Refresh the page to try again.
        </p>
      ) : (
        <>
          <RoomPhotoUploader storeSlug={storeSlug} photos={photos.map((p) => ({ id: p.id, label: p.label }))} />

          {photos.length > 0 ? (
            <ul className="flex flex-wrap gap-3" aria-label="Your room photographs">
              {photos.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2 rounded-control border border-line bg-card px-3 py-2 text-sm">
                  <span className="text-ink">{p.label || `Photograph ${i + 1}`}</span>
                  <form action={removeRoomPhotoAction}>
                    <input type="hidden" name="storeSlug" value={storeSlug} />
                    <input type="hidden" name="photoId" value={p.id} />
                    <button type="submit" className="font-semibold text-danger underline">Delete</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}

          <RoomVisualizer storeSlug={storeSlug} photos={photos} products={products} projects={projects} submissionId={submissionId} />
        </>
      )}
    </div>
  );
}
