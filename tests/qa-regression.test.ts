import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { formatIST, formatISTDate } from '../lib/format-ist';

const ROOT = process.cwd();

test('formatIST formats timestamps in Asia/Kolkata regardless of local TZ', () => {
  const iso = '2026-11-27T18:30:00.000Z'; // 2026-11-28 00:00:00 IST
  const formatted = formatIST(iso);
  const dateOnly = formatISTDate(iso);
  assert.match(formatted, /28\/11\/2026/);
  assert.match(dateOnly, /28\/11\/2026/);
});

test('owner login redirects to /owner dashboard, not /owner/cash', () => {
  const loginActions = fs.readFileSync(path.join(ROOT, 'app/owner/login/actions.ts'), 'utf8');
  const loginPage = fs.readFileSync(path.join(ROOT, 'app/owner/login/page.tsx'), 'utf8');
  assert.ok(loginActions.includes("redirect('/owner')"), 'login action must redirect to /owner');
  assert.ok(!loginActions.includes("redirect('/owner/cash')"), 'login action must not redirect to /owner/cash');
  assert.ok(loginPage.includes("redirect('/owner')"), 'login page must redirect authenticated owner to /owner');
});

test('sign-in pages include Back to Home navigation and clickable branding', () => {
  const adminLogin = fs.readFileSync(path.join(ROOT, 'app/admin/login/page.tsx'), 'utf8');
  const ownerLogin = fs.readFileSync(path.join(ROOT, 'app/owner/login/page.tsx'), 'utf8');
  const pages: readonly [string, string][] = [
    ['admin login', adminLogin],
    ['owner login', ownerLogin],
  ];
  for (const [name, src] of pages) {
    assert.ok(src.includes('Back to Home'), `${name} must include Back to Home`);
    assert.ok(src.includes('href="/"'), `${name} must link to /`);
  }
});

test('guest site header renders complete store name without truncation classes', () => {
  const header = fs.readFileSync(path.join(ROOT, 'components/guest/site-header.tsx'), 'utf8');
  assert.ok(!header.includes('line-clamp-1 font-display'), 'store name must not use line-clamp-1');
  assert.ok(header.includes('break-words font-display'), 'store name must wrap cleanly');
  assert.ok(header.includes('Powered by ZENTRO BuildMart'), 'branding must include Powered by ZENTRO BuildMart');
});

test('mobile viewport and globals.css enforce fixed scale and prevent unwanted zoom', () => {
  const css = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');
  assert.ok(css.includes('font-size: 16px !important'), 'mobile inputs must enforce >= 16px font size');
  assert.ok(css.includes('touch-action: manipulation'), 'interactive controls must use touch-action: manipulation');
  assert.ok(css.includes('touch-action: pan-y'), 'root document must use touch-action: pan-y');
  const layout = fs.readFileSync(path.join(ROOT, 'app/layout.tsx'), 'utf8');
  assert.ok(layout.includes('minimumScale: 1'), 'viewport must set minimumScale: 1');
  assert.ok(layout.includes('maximumScale: 1'), 'viewport must set maximumScale: 1');
  assert.ok(layout.includes('userScalable: false'), 'viewport must set userScalable: false');
  assert.ok(layout.includes("viewportFit: 'cover'"), "viewport must set viewportFit: 'cover'");
});
