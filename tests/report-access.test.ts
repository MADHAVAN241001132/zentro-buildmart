import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p: string) => readFileSync(p, 'utf8');

test('every exported report function checks the caller before using the service-role client', () => {
  const source = read('lib/services/reports.ts');
  const exported = [...source.matchAll(/export async function (\w+)\(storeId: string[^\n]*\{\n([^\n]*)\n/g)];
  assert.ok(exported.length >= 20, 'expected the report functions to be present');
  for (const match of exported) {
    assert.match(match[2] ?? '', /await requireReportStore\(storeId\);/, `${match[1]} must call requireReportStore first`);
  }
});

test('the dataset builder checks the caller before any report query runs', () => {
  const source = read('lib/services/report-datasets.ts');
  const body = source.slice(source.indexOf('export async function buildDataset'));
  assert.match(body.split('\n').slice(0, 3).join('\n'), /requireReportStore\(ctx\.storeId\)/);
});

test('the guard reads the caller session and requires reports_exports', () => {
  const source = read('lib/services/report-access.ts');
  assert.match(source, /createSupabaseServerClient\(\)/, 'the check uses the caller session, not the service role');
  assert.match(source, /zb_my_store_permissions/);
  assert.match(source, /includes\('reports_exports'\)/);
  assert.doesNotMatch(source, /createSupabaseAdminClient/);
});
