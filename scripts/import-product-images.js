const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const MAPPING = [
  { sku: 'ZBM-P015', name: 'Aqua Glass Mosaic', filename: 'Aqua Glass Mosaic.webp' },
  { sku: 'ZBM-P064', name: 'Bathroom Mirror Cabinet', filename: 'Bathroom Mirror Cabinet.webp' },
  { sku: 'ZBM-P040', name: 'Bib Cock Chrome', filename: 'Bib Cock Chrome.webp' },
  { sku: 'ZBM-P056', name: 'Bidet Spray Set', filename: 'Bidet Spray Set.webp' },
  { sku: 'ZBM-P011', name: 'Blush Pink Subway', filename: 'Blush Pink Subway.webp' },
  { sku: 'ZBM-P036', name: 'Brushed Brass Kitchen Mixer', filename: 'Brushed Brass Kitchen Mixer.webp' },
  { sku: 'ZBM-P027', name: 'Burgundy Premium Steel Door', filename: 'Burgundy Premium Steel Door.webp' },
  { sku: 'ZBM-P002', name: 'Calacatta Gold Vitrified', filename: 'Calacatta Gold Vitrified.webp' },
  { sku: 'ZBM-P076', name: 'Cement Waterproofing 5L', filename: 'Cement Waterproofing 5L.webp' },
  { sku: 'ZBM-P014', name: 'Charcoal Brick Wall', filename: 'Charcoal Brick Wall.webp' },
  { sku: 'ZBM-P067', name: 'Chimney Filter Set', filename: 'Chimney Filter Set.webp' },
];

const BUCKET = 'catalogue-images';
const MAX_BYTES = 5 * 1024 * 1024;
const STORE_SLUG = 'zentro-buildmart-showroom';

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) throw new Error('.env.local not found');
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

function isWebp(buf) {
  return buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dir' && argv[i + 1]) { opts.dir = argv[++i]; }
    else if (argv[i] === '--map' && argv[i + 1]) { opts.map = argv[++i]; }
    else if (!argv[i].startsWith('--') && !opts.dir) { opts.dir = argv[i]; }
  }
  return opts;
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');

  const opts = parseArgs(process.argv);
  const imagesDir = opts.dir
    ? path.resolve(opts.dir)
    : path.join(__dirname, '..', 'scratch', 'product-images-webp');
  const mapping = opts.map
    ? JSON.parse(fs.readFileSync(path.resolve(opts.map), 'utf8'))
    : MAPPING;

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: store, error: storeErr } = await sb
    .from('stores')
    .select('id, name, slug')
    .eq('slug', STORE_SLUG)
    .single();
  if (storeErr || !store) throw new Error(`Store ${STORE_SLUG} not found`);

  console.log(`Target store: ${store.name} (${store.id})`);
  console.log(`Images directory: ${imagesDir}\n`);

  const report = [];
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of mapping) {
    const filePath = path.join(imagesDir, item.filename);
    if (!fs.existsSync(filePath)) {
      report.push({ sku: item.sku, name: item.name, filename: item.filename, status: 'FAILED', detail: 'File missing' });
      failed++;
      continue;
    }

    const bytes = fs.readFileSync(filePath);
    if (bytes.length === 0 || bytes.length > MAX_BYTES || !isWebp(bytes)) {
      report.push({ sku: item.sku, name: item.name, filename: item.filename, status: 'FAILED', detail: 'Invalid WebP or size > 5MB' });
      failed++;
      continue;
    }

    const { data: product, error: prodErr } = await sb
      .from('products')
      .select('id, name, sku, slug')
      .eq('store_id', store.id)
      .eq('sku', item.sku)
      .maybeSingle();

    if (prodErr || !product) {
      report.push({ sku: item.sku, name: item.name, filename: item.filename, status: 'FAILED', detail: 'SKU not found in store' });
      failed++;
      continue;
    }

    if (product.name.trim().toLowerCase() !== item.name.trim().toLowerCase()) {
      report.push({ sku: item.sku, name: item.name, filename: item.filename, status: 'FAILED', detail: `Name mismatch: DB="${product.name}"` });
      failed++;
      continue;
    }

    // Idempotency check: skip if this product already has an active primary image in catalogue-images
    const { data: existingPrimary } = await sb
      .from('product_images')
      .select('id, public_url, storage_bucket')
      .eq('store_id', store.id)
      .eq('product_id', product.id)
      .eq('is_primary', true)
      .maybeSingle();

    if (existingPrimary && existingPrimary.storage_bucket === BUCKET && existingPrimary.public_url) {
      report.push({
        sku: item.sku,
        name: product.name,
        slug: product.slug,
        filename: item.filename,
        status: 'SKIPPED',
        detail: 'Primary image already attached',
        publicUrl: existingPrimary.public_url,
      });
      skipped++;
      continue;
    }

    const objectPath = `${store.id}/products/${crypto.randomUUID()}.webp`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(objectPath, bytes, {
      contentType: 'image/webp',
      upsert: false,
    });
    if (upErr) {
      report.push({ sku: item.sku, name: product.name, filename: item.filename, status: 'FAILED', detail: `Storage upload: ${upErr.message}` });
      failed++;
      continue;
    }

    const { data: reg, error: regErr } = await sb
      .from('storage_uploads')
      .insert({
        store_id: store.id,
        bucket_id: BUCKET,
        object_path: objectPath,
        kind: 'product',
        mime_type: 'image/webp',
        size_bytes: bytes.length,
        uploaded_by: null,
      })
      .select('id')
      .single();

    if (regErr || !reg) {
      await sb.storage.from(BUCKET).remove([objectPath]);
      report.push({ sku: item.sku, name: product.name, filename: item.filename, status: 'FAILED', detail: `Registry insert: ${regErr?.message}` });
      failed++;
      continue;
    }

    const { data: pubData } = sb.storage.from(BUCKET).getPublicUrl(objectPath);
    const publicUrl = pubData.publicUrl;

    const { data: imgId, error: attachErr } = await sb.rpc('product_image_attach', {
      p_store: store.id,
      p_product: product.id,
      p_upload: reg.id,
      p_alt: product.name,
      p_public_url: publicUrl,
    });

    if (attachErr || !imgId) {
      report.push({ sku: item.sku, name: product.name, filename: item.filename, status: 'FAILED', detail: `Attach RPC: ${attachErr?.message}` });
      failed++;
      continue;
    }

    const { error: primErr } = await sb.rpc('product_image_set_primary', {
      p_store: store.id,
      p_product: product.id,
      p_image: imgId,
    });

    if (primErr) {
      report.push({ sku: item.sku, name: product.name, filename: item.filename, status: 'FAILED', detail: `Set primary RPC: ${primErr.message}` });
      failed++;
      continue;
    }

    // Verify public URL responds HTTP 200
    let httpStatus = 0;
    try {
      const resp = await fetch(publicUrl, { method: 'HEAD' });
      httpStatus = resp.status;
    } catch {
      httpStatus = 0;
    }

    report.push({
      sku: item.sku,
      name: product.name,
      slug: product.slug,
      filename: item.filename,
      status: httpStatus === 200 ? 'UPLOADED' : 'UPLOADED_UNVERIFIED',
      httpStatus,
      publicUrl,
      imageId: imgId,
    });
    uploaded++;
  }

  console.log(JSON.stringify({ summary: { total: mapping.length, uploaded, skipped, failed }, report }, null, 2));
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
