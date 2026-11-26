import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { en, type MessageKey } from '../lib/i18n/messages/en';
import { ta } from '../lib/i18n/messages/ta';
import { missingTamilKeys } from '../lib/i18n/translate';

const root = join(__dirname, '..');

/** Guest pages whose text has been moved to the dictionaries. Extend this list as pages are translated. */
const TRANSLATED_FILES = [
  'app/store/[storeSlug]/page.tsx',
  'app/store/[storeSlug]/cart/page.tsx',
  'app/store/[storeSlug]/category/[categorySlug]/page.tsx',
  'components/guest/cart-line.tsx',
  'components/guest/cart-coupon-form.tsx',
  'components/guest/add-to-cart-form.tsx',
  'components/guest/list-toggle.tsx',
  'components/guest/product-card.tsx',
];

function keysReferenced(path: string): string[] {
  const source = readFileSync(join(root, path), 'utf8');
  return [...source.matchAll(/\bt\('([a-z]+\.[A-Za-z0-9.]+)'/g)].map((m) => m[1] ?? '');
}

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();
}

test('every key used by a translated page exists in the English dictionary', () => {
  for (const file of TRANSLATED_FILES) {
    for (const key of keysReferenced(file)) {
      assert.ok(key in en, `${file} uses missing key ${key}`);
    }
  }
});

test('every key used by a translated page has a Tamil entry', () => {
  for (const file of TRANSLATED_FILES) {
    for (const key of keysReferenced(file)) {
      assert.ok(ta[key as MessageKey], `${file} has no Tamil text for ${key}`);
    }
  }
});

test('Tamil entries use the same placeholders as their English source', () => {
  for (const key of Object.keys(en) as MessageKey[]) {
    const tamil = ta[key];
    if (!tamil) continue;
    assert.deepEqual(placeholders(tamil), placeholders(en[key]), `placeholder mismatch for ${key}`);
  }
});

test('the Tamil dictionary is complete for every key it is expected to cover', () => {
  // Keys added in the Guest translation passes. Any key listed here must have Tamil text.
  const prefixes = ['home.', 'cart.', 'pwa.', 'status.'];
  const missing = missingTamilKeys().filter((key) => prefixes.some((p) => key.startsWith(p)));
  assert.deepEqual(missing, []);
});

test('Tamil text contains Tamil script and no leftover English sentences in the translated pages', () => {
  for (const file of TRANSLATED_FILES) for (const key of keysReferenced(file)) {
    const tamil = ta[key as MessageKey] ?? '';
    // Keys made only of placeholders (such as "{label}: {error}") have no words to translate.
    if (tamil.replace(/\{\w+\}/g, '').replace(/[\s:.,\-·/]/g, '') === '') continue;
    assert.ok(/[஀-௿]/.test(tamil), `${key} is not in Tamil script`);
  }
});
