const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

async function seed() {
  console.log('Seeding demonstration store...');

  // 1. Ensure Subscription Plans exist
  const plans = [
    {
      code: 'STARTER',
      name: 'Starter',
      billing_interval: 'monthly',
      price_paise: 99900,
      max_products: 200,
      products_unlimited: false,
      max_users: 5,
      users_unlimited: false,
      features: { qr: true, pos: true },
    },
    {
      code: 'GROWTH',
      name: 'Growth',
      billing_interval: 'monthly',
      price_paise: 249900,
      max_products: 1000,
      products_unlimited: false,
      max_users: 15,
      users_unlimited: false,
      features: { qr: true, pos: true, reports: true, quotations: true },
    },
    {
      code: 'ENTERPRISE',
      name: 'Enterprise',
      billing_interval: 'annual',
      price_paise: 2499900,
      max_products: null,
      products_unlimited: true,
      max_users: null,
      users_unlimited: true,
      features: { qr: true, pos: true, reports: true, quotations: true, multi_store: true },
    },
  ];

  for (const p of plans) {
    const { error } = await sb.from('subscription_plans').upsert(p, { onConflict: 'code' });
    if (error) console.error('Error upserting plan', p.code, error);
  }
  const { data: growthPlan } = await sb.from('subscription_plans').select('id').eq('code', 'GROWTH').single();

  // 2. Create or find Demonstration Store
  const storeSlug = 'zentro-buildmart-showroom';
  let { data: store } = await sb.from('stores').select('*').eq('slug', storeSlug).maybeSingle();

  if (!store) {
    const { data: newStore, error: storeErr } = await sb.from('stores').insert({
      name: 'ZENTRO BuildMart Showroom',
      slug: storeSlug,
      status: 'active',
      gstin: '33AAAAA1234A1ZV',
      legal_name: 'ZENTRO BuildMart Showroom Pvt Ltd',
      business_category: 'Construction Materials and Home Improvement',
      business_description: 'Premier showroom for tiles, steel doors, sanitaryware, taps, and fittings.',
      billing_address: '100 Feet Road, Gandhipuram, Coimbatore, Tamil Nadu - 641012',
      address_line: '100 Feet Road, Gandhipuram',
      city: 'Coimbatore',
      state: 'Tamil Nadu',
      pincode: '641012',
      phone: '9876543210',
      email: 'owner@zentro.example',
      brand_colour: '#6A0D2A',
      prices_include_gst: true,
    }).select().single();

    if (storeErr) {
      console.error('Error creating store:', storeErr);
      process.exit(1);
    }
    store = newStore;
    console.log('Created demonstration store:', store.id, store.name);
  } else {
    console.log('Store already exists:', store.id, store.name);
  }

  // 3. Ensure Store Settings
  await sb.from('store_settings').upsert({
    store_id: store.id,
    delivery_charge_paise: 19900,
    free_delivery_above_paise: 1500000,
    notification_email: 'owner@zentro.example',
  }, { onConflict: 'store_id' });

  // 4. Create Store Owner Auth Account & Profile
  const ownerEmail = process.env.DEMO_OWNER_EMAIL || 'owner@gmail.com';
  const ownerPass = process.env.DEMO_OWNER_PASSWORD || process.env.OWNER_PASSWORD || 'Owner@123';
  const ownerName = 'Karthik Raja';

  const { data: userList } = await sb.auth.admin.listUsers();
  let ownerUser = userList.users.find(u => u.email === ownerEmail);
  if (!ownerUser) {
    const { data: newOwner, error: ownerCreateErr } = await sb.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPass,
      email_confirm: true,
      user_metadata: { full_name: ownerName },
    });
    if (ownerCreateErr) {
      console.error('Error creating owner auth user:', ownerCreateErr);
      process.exit(1);
    }
    ownerUser = newOwner.user;
    console.log('Created owner auth user:', ownerUser.id);
  } else {
    console.log('Owner auth user exists:', ownerUser.id);
  }

  // Ensure owner profile in public.profiles
  await sb.from('profiles').upsert({
    id: ownerUser.id,
    full_name: ownerName,
  });

  // Link to store_owners
  const { data: existingOwnerLink } = await sb.from('store_owners')
    .select('*')
    .eq('store_id', store.id)
    .eq('profile_id', ownerUser.id)
    .maybeSingle();

  if (!existingOwnerLink) {
    const { error: linkErr } = await sb.from('store_owners').insert({
      store_id: store.id,
      profile_id: ownerUser.id,
      role: 'owner',
      is_active: true,
    });
    if (linkErr) console.error('Error linking owner:', linkErr);
    else console.log('Linked Store Owner to store_owners table');
  }

  // 5. Assign Active Subscription
  const { data: existingSub } = await sb.from('subscriptions')
    .select('id')
    .eq('store_id', store.id)
    .maybeSingle();

  if (!existingSub && growthPlan) {
    const { error: subErr } = await sb.from('subscriptions').insert({
      store_id: store.id,
      plan_id: growthPlan.id,
      status: 'active',
      period_start: new Date().toISOString().split('T')[0],
      period_end: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().split('T')[0],
    });
    if (subErr) console.error('Error creating subscription:', subErr);
    else console.log('Assigned Growth subscription to store');
  }

  // 6. Generate Showroom QR Code
  const { data: existingQr } = await sb.from('qr_codes')
    .select('id, entry_token, public_url')
    .eq('store_id', store.id)
    .eq('target_type', 'showroom')
    .maybeSingle();

  let qrToken = existingQr?.entry_token;
  if (!existingQr) {
    const crypto = require('crypto');
    const token = crypto.randomBytes(16).toString('hex');
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const { data: newQr, error: qrErr } = await sb.from('qr_codes').insert({
      store_id: store.id,
      target_type: 'showroom',
      target_id: null,
      entry_token: token,
      public_url: `${appUrl}/q/${token}`,
      is_active: true,
    }).select().single();

    if (qrErr) console.error('Error generating showroom QR:', qrErr);
    else {
      qrToken = newQr.entry_token;
      console.log('Created showroom QR code:', newQr.public_url);
    }
  } else {
    console.log('Showroom QR code already exists:', existingQr.public_url);
  }

  // 7. Check if catalogue products already exist
  const { count: prodCount } = await sb.from('products').select('*', { count: 'exact', head: true }).eq('store_id', store.id);
  console.log('Current product count for store:', prodCount);

  return { storeId: store.id, needCatalogue: prodCount === 0, qrToken };
}

seed().then(res => {
  console.log('Seed result:', JSON.stringify(res));
  process.exit(0);
}).catch(err => {
  console.error('Seed script error:', err);
  process.exit(1);
});
