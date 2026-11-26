import type { InputHTMLAttributes } from 'react';
import { notFound } from 'next/navigation';
import { calculateTiles, TileInputError, type LengthUnit } from '@/lib/calculator/tiles';
import { formatINR, parseRupeesToPaise } from '@/lib/money';
import { getStoreBySlug } from '@/lib/services/storefront';

export const dynamic = 'force-dynamic';

const UNITS: LengthUnit[] = ['ft', 'm', 'cm', 'mm'];

function num(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default async function TileCalculatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { storeSlug } = await params;
  const sp = await searchParams;
  const store = await getStoreBySlug(storeSlug);
  if (!store) notFound();

  const unit = (UNITS as string[]).includes(sp.unit ?? '') ? (sp.unit as LengthUnit) : 'ft';
  const length = num(sp.length);
  const width = num(sp.width);
  const coverage = num(sp.coverage);
  const wastage = num(sp.wastage) ?? 10;
  const pricePerBox = sp.price ? parseRupeesToPaise(sp.price) : null;

  let result: ReturnType<typeof calculateTiles> | null = null;
  let error: string | null = null;
  if (length !== undefined || width !== undefined || coverage !== undefined) {
    try {
      if (length === undefined || width === undefined || coverage === undefined) {
        throw new TileInputError('Enter length, width and box coverage');
      }
      result = calculateTiles({
        length,
        width,
        unit,
        coverageSqftPerBox: coverage,
        wastagePercent: wastage,
        pricePerBoxPaise: pricePerBox ?? undefined,
      });
    } catch (cause) {
      error = cause instanceof TileInputError ? cause.message : 'Check the values you entered';
    }
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-8">
      <header className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Smart tools</p>
        <h1 className="font-display text-3xl text-burgundy">Tile calculator</h1>
        <p className="text-ink-muted">
          Enter the room size and the coverage printed on the box. The calculator rounds up to whole boxes and adds wastage.
        </p>
      </header>

      <form method="get" className="grid gap-4 rounded-card border border-line bg-card p-6 sm:grid-cols-2">
        <Input name="length" label="Length" defaultValue={sp.length} step="any" min="0" />
        <Input name="width" label="Width" defaultValue={sp.width} step="any" min="0" />
        <label className="grid gap-1.5 text-sm font-medium">
          Unit
          <select name="unit" defaultValue={unit} className="rounded-control border border-line bg-white px-3 py-2.5 font-normal">
            {UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </label>
        <Input name="coverage" label="Coverage per box (sq ft)" defaultValue={sp.coverage} step="any" min="0" />
        <Input name="wastage" label="Wastage (%)" defaultValue={String(wastage)} step="1" min="0" max="100" />
        <Input name="price" label="Price per box (₹, optional)" defaultValue={sp.price} inputMode="decimal" />
        <div className="sm:col-span-2">
          <button type="submit" className="rounded-control bg-burgundy px-6 py-3 font-semibold text-cream hover:bg-burgundy-deep">
            Calculate
          </button>
        </div>
      </form>

      {error ? <p role="alert" className="rounded-control bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p> : null}

      {result ? (
        <section aria-live="polite" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Room area" value={`${result.areaSqft.toFixed(2)} sq ft`} />
          <Metric label="With wastage" value={`${result.areaWithWastageSqft.toFixed(2)} sq ft`} />
          <Metric label="Boxes needed" value={String(result.boxes)} emphasis />
          <Metric label="Leftover" value={`${result.leftoverSqft.toFixed(2)} sq ft`} />
          {result.estimatedCostPaise !== null ? (
            <Metric label="Estimated cost" value={formatINR(result.estimatedCostPaise)} emphasis />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Input({ name, label, ...props }: { name: string; label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <input name={name} className="rounded-control border border-line bg-white px-3 py-2.5 font-normal" {...props} />
    </label>
  );
}

function Metric({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-card border p-5 ${emphasis ? 'border-burgundy bg-burgundy text-cream' : 'border-line bg-card'}`}>
      <p className={`text-xs uppercase tracking-wide ${emphasis ? 'text-gold' : 'text-ink-muted'}`}>{label}</p>
      <p className="mt-2 font-display text-2xl">{value}</p>
    </div>
  );
}
