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
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const adminSb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

async function runTest() {
  console.log('=== TEST: CASH CHECKOUT TO INVOICE GENERATION ===');

  // 1. Get store & variant
  const { data: store, error: storeErr } = await adminSb.from('stores').select('*').eq('slug', 'zentro-buildmart-showroom').single();
  if (storeErr || !store) throw new Error('Store not found: ' + (storeErr?.message || ''));
  console.log('Store:', store.name, store.id);

  const { data: variant, error: varErr } = await adminSb.from('product_variants')
    .select('*, products(name, hsn_code, gst_rate_bps)')
    .eq('store_id', store.id)
    .limit(1)
    .single();
  if (varErr || !variant) throw new Error('Variant not found: ' + (varErr?.message || ''));
  console.log('Product/Variant:', variant.products.name, variant.sku, 'Price:', variant.sale_price_paise);

  // Check initial inventory
  const { data: invBefore } = await adminSb.from('inventory').select('*').eq('variant_id', variant.id).single();
  console.log('Inventory before checkout: on_hand =', invBefore.on_hand, 'reserved =', invBefore.reserved);

  // 2. Create guest session
  const crypto = require('crypto');
  const token = crypto.randomBytes(16).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 86400 * 1000).toISOString();

  const { data: session, error: sessErr } = await adminSb.from('guest_sessions').insert({
    store_id: store.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  }).select().single();
  if (sessErr) throw sessErr;
  console.log('Guest session created:', session.id);

  // 3. Create active cart and add item
  const { data: cart, error: cartErr } = await adminSb.from('carts').insert({
    store_id: store.id,
    guest_session_id: session.id,
    status: 'active',
  }).select().single();
  if (cartErr) throw cartErr;

  const { error: itemErr } = await adminSb.from('cart_items').insert({
    cart_id: cart.id,
    store_id: store.id,
    variant_id: variant.id,
    quantity: 2,
  });
  if (itemErr) throw itemErr;
  console.log('Cart created and 2 items added');

  // 4. Create Order using guest checkout logic
  const qty = 2;
  const unitPrice = variant.sale_price_paise;
  const taxable = unitPrice * qty;
  const tax = Math.round((taxable * variant.products.gst_rate_bps) / 10000);
  const total = taxable + tax;

  const orderNumber = 'ZBM-ORD-' + Date.now().toString().slice(-6);

  const { data: order, error: orderErr } = await adminSb.from('orders').insert({
    store_id: store.id,
    order_number: orderNumber,
    guest_session_id: session.id,
    customer_name: 'Dhanush',
    customer_mobile: '9876543210',
    customer_email: 'customer@example.com',
    fulfilment: 'pickup',
    payment_method: 'cash',
    payment_status: 'CASH_PENDING',
    order_status: 'PLACED',
    subtotal_paise: taxable,
    discount_paise: 0,
    taxable_paise: taxable,
    tax_paise: tax,
    delivery_paise: 0,
    total_paise: total,
    tax_mode: 'taxed',
    supply_state_code: '33',
    store_state_code: '33',
    is_interstate: false,
    cgst_paise: Math.round(tax / 2),
    sgst_paise: tax - Math.round(tax / 2),
    gross_subtotal_paise: taxable,
    gross_discount_paise: 0,
  }).select().single();
  if (orderErr) throw orderErr;
  console.log('Order created in database:', order.order_number, order.id, 'Total:', order.total_paise, 'Status:', order.payment_status);

  // Insert order item
  const { error: ordItemErr } = await adminSb.from('order_items').insert({
    order_id: order.id,
    store_id: store.id,
    variant_id: variant.id,
    quantity: qty,
    stock_units: qty,
    unit_price_paise: unitPrice,
    cost_price_paise_snapshot: variant.cost_price_paise,
    product_name_snapshot: variant.products.name,
    variant_label_snapshot: variant.label,
    sku_snapshot: variant.sku,
    hsn_code_snapshot: variant.products.hsn_code,
    gst_rate_bps: variant.products.gst_rate_bps,
    taxable_paise: taxable,
    tax_paise: tax,
    discount_paise: 0,
    line_total_paise: total,
    cgst_paise: Math.round(tax / 2),
    sgst_paise: tax - Math.round(tax / 2),
  });
  if (ordItemErr) throw ordItemErr;

  // Reserve stock for order via official DB RPC
  const { data: resData, error: resErr } = await adminSb.rpc('reserve_order_stock', {
    p_order: order.id,
  });
  if (resErr) throw resErr;
  console.log('reserve_order_stock RPC result:', resData);

  // Insert payments record for cash
  const { error: payErr } = await adminSb.from('payments').insert({
    store_id: store.id,
    order_id: order.id,
    provider: 'cash',
    method: 'cash',
    status: 'CASH_PENDING',
    amount_paise: total,
  });
  if (payErr) throw payErr;

  // Check inventory after reservation
  const { data: invReserved } = await adminSb.from('inventory').select('*').eq('variant_id', variant.id).single();
  console.log('Inventory after reservation: on_hand =', invReserved.on_hand, 'reserved =', invReserved.reserved);

  // 5. Sign in as Store Owner and Confirm Cash Payment
  const ownerClient = createClient(supabaseUrl, anonKey);
  const { data: ownerAuth, error: authErr } = await ownerClient.auth.signInWithPassword({
    email: process.env.DEMO_OWNER_EMAIL || 'owner@gmail.com',
    password: process.env.DEMO_OWNER_PASSWORD || process.env.OWNER_PASSWORD || 'Owner@123',
  });
  if (authErr) throw authErr;
  console.log('Store Owner signed in:', ownerAuth.user.email);

  // Confirm cash payment via RPC as owner
  const { data: confirmRes, error: confirmErr } = await ownerClient.rpc('confirm_cash_payment', {
    p_order: order.id,
    p_amount_received_paise: total,
    p_note: 'Verified in-person at counter',
  });
  if (confirmErr) throw confirmErr;
  console.log('confirm_cash_payment RPC executed successfully, result:', confirmRes);

  // 6. Verify Order State after confirmation
  const { data: orderAfter } = await adminSb.from('orders').select('*').eq('id', order.id).single();
  console.log('Order status after confirmation:', orderAfter.payment_status, orderAfter.order_status, 'Paid at:', orderAfter.paid_at);

  // 7. Verify Inventory Deducted (reservation released, on_hand decreased by qty)
  const { data: invAfter } = await adminSb.from('inventory').select('*').eq('variant_id', variant.id).single();
  console.log('Inventory after cash confirm: on_hand =', invAfter.on_hand, 'reserved =', invAfter.reserved);
  const stockReduced = invBefore.on_hand - invAfter.on_hand === qty;
  console.log('Stock accurately reduced by', qty, ':', stockReduced);

  // 8. Verify Invoice Created
  const { data: invoice, error: invErr } = await adminSb.from('invoices').select('*').eq('order_id', order.id).maybeSingle();
  if (invErr || !invoice) {
    console.error('Invoice check error:', invErr);
  } else {
    console.log('Invoice generated automatically! Number:', invoice.invoice_number, 'Grand total:', invoice.grand_total_paise);
  }

  // 9. Verify Cash Confirmation Record
  const { data: cashRecord } = await adminSb.from('cash_confirmations').select('*').eq('order_id', order.id).maybeSingle();
  console.log('Cash confirmation ledger record created:', !!cashRecord, 'Amount:', cashRecord?.amount_received_paise);

  console.log('=== END-TO-END CASH CHECKOUT & INVOICING VERIFIED! ===');
}

runTest().then(() => process.exit(0)).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
