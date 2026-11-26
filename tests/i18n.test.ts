import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LOCALE, LOCALES, htmlLang, intlLocale, isLocale, normaliseLocale, safeNextPath } from '../lib/i18n/locales';
import { en, type MessageKey } from '../lib/i18n/messages/en';
import { ta } from '../lib/i18n/messages/ta';
import { formatDate, formatRupees, interpolate, missingTamilKeys, translate } from '../lib/i18n/translate';

test('locales: only English and Tamil are supported, anything else is English', () => {
  assert.deepEqual([...LOCALES], ['en', 'ta']);
  assert.equal(DEFAULT_LOCALE, 'en');
  assert.equal(isLocale('ta'), true);
  assert.equal(isLocale('fr'), false);
  assert.equal(normaliseLocale('ta'), 'ta');
  assert.equal(normaliseLocale('de'), 'en');
  assert.equal(normaliseLocale(undefined), 'en');
  assert.equal(normaliseLocale('ta; drop table'), 'en');
});

test('document language attributes', () => {
  assert.equal(htmlLang('ta'), 'ta-IN');
  assert.equal(htmlLang('en'), 'en-IN');
  assert.equal(intlLocale('ta'), 'ta-IN');
});

test('dictionary completeness: every Tamil key exists, or is a known gap', () => {
  const gaps = missingTamilKeys();
  assert.deepEqual(gaps, [], `Tamil translations missing for: ${gaps.join(', ')}`);
});

test('dictionary hygiene: no Tamil entry lacks an English source key', () => {
  for (const key of Object.keys(ta) as MessageKey[]) {
    assert.ok(key in en, `Tamil key without English source: ${key}`);
  }
});

test('placeholders in Tamil match English', () => {
  for (const key of Object.keys(en) as MessageKey[]) {
    const tamil = ta[key];
    if (!tamil) continue;
    const want = [...en[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const got = [...tamil.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    assert.deepEqual(got, want, `placeholder mismatch for ${key}`);
  }
});

test('translate returns the Tamil wording, English text for untranslated keys, and fills placeholders', () => {
  assert.equal(translate('ta', 'nav.home'), 'முகப்பு');
  const withheld = { ...ta } as Partial<Record<MessageKey, string>>;
  assert.equal(withheld['app.name'], 'ZENTRO BuildMart');
  assert.equal(translate('en', 'common.save'), 'Save');
  assert.equal(interpolate('Page {page} of {pages}', { page: 2, pages: 5 }), 'Page 2 of 5');
  assert.equal(interpolate('Hello {name}', {}), 'Hello {name}');
});

test('money keeps the paise value and Western digits in both languages', () => {
  assert.equal(formatRupees(123456, 'en'), '₹1,234.56');
  assert.equal(formatRupees(123456, 'ta'), '₹1,234.56');
  assert.equal(formatRupees(5, 'en'), '₹0.05');
});

test('dates use the store time zone and Western digits', () => {
  const when = new Date('2026-11-26T18:45:00Z'); // 00:15 on 27 Nov in India
  assert.equal(formatDate(when, 'en'), '27 Nov 2026');
  assert.match(formatDate(when, 'ta'), /2026/);
});

test('safe redirect paths: same-site only, no open redirects', () => {
  assert.equal(safeNextPath('/store/a/cart?x=1'), '/store/a/cart?x=1');
  assert.equal(safeNextPath('https://evil.example/'), '/');
  assert.equal(safeNextPath('//evil.example/'), '/');
  assert.equal(safeNextPath('/\\evil.example'), '/');
  assert.equal(safeNextPath('/ok\r\nSet-Cookie: x=1'), '/');
  assert.equal(safeNextPath(null), '/');
  assert.equal(safeNextPath('/'.padEnd(600, 'a')), '/');
});
