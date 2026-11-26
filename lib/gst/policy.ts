/**
 * GST policy: pure functions that mirror migration 0058 (app.gstin_problem, app.store_gst_mode,
 * app.gst_components). The database is the authority at checkout; these functions let the cart preview and the
 * checkout form show the same figures and the same refusals. Integer paise only (BigInt).
 *
 * GSTIN checks are FORMAT and check-digit checks only. They do not verify registration with the GST portal.
 */
import { gstOn } from '@/lib/money';

export interface GstStateCode {
  code: string;
  name: string;
  /** 'state': SGST applies on intrastate supply. 'ut': UTGST applies. Delhi, Puducherry and Jammu and Kashmir are
   * listed as 'state' pending review (docs/TAX_ASSUMPTIONS.md). */
  regime: 'state' | 'ut';
}

export const GST_STATE_CODES: readonly GstStateCode[] = [
  { code: '01', name: 'Jammu and Kashmir', regime: 'state' },
  { code: '02', name: 'Himachal Pradesh', regime: 'state' },
  { code: '03', name: 'Punjab', regime: 'state' },
  { code: '04', name: 'Chandigarh', regime: 'ut' },
  { code: '05', name: 'Uttarakhand', regime: 'state' },
  { code: '06', name: 'Haryana', regime: 'state' },
  { code: '07', name: 'Delhi', regime: 'state' },
  { code: '08', name: 'Rajasthan', regime: 'state' },
  { code: '09', name: 'Uttar Pradesh', regime: 'state' },
  { code: '10', name: 'Bihar', regime: 'state' },
  { code: '11', name: 'Sikkim', regime: 'state' },
  { code: '12', name: 'Arunachal Pradesh', regime: 'state' },
  { code: '13', name: 'Nagaland', regime: 'state' },
  { code: '14', name: 'Manipur', regime: 'state' },
  { code: '15', name: 'Mizoram', regime: 'state' },
  { code: '16', name: 'Tripura', regime: 'state' },
  { code: '17', name: 'Meghalaya', regime: 'state' },
  { code: '18', name: 'Assam', regime: 'state' },
  { code: '19', name: 'West Bengal', regime: 'state' },
  { code: '20', name: 'Jharkhand', regime: 'state' },
  { code: '21', name: 'Odisha', regime: 'state' },
  { code: '22', name: 'Chhattisgarh', regime: 'state' },
  { code: '23', name: 'Madhya Pradesh', regime: 'state' },
  { code: '24', name: 'Gujarat', regime: 'state' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu', regime: 'ut' },
  { code: '27', name: 'Maharashtra', regime: 'state' },
  { code: '29', name: 'Karnataka', regime: 'state' },
  { code: '30', name: 'Goa', regime: 'state' },
  { code: '31', name: 'Lakshadweep', regime: 'ut' },
  { code: '32', name: 'Kerala', regime: 'state' },
  { code: '33', name: 'Tamil Nadu', regime: 'state' },
  { code: '34', name: 'Puducherry', regime: 'state' },
  { code: '35', name: 'Andaman and Nicobar Islands', regime: 'ut' },
  { code: '36', name: 'Telangana', regime: 'state' },
  { code: '37', name: 'Andhra Pradesh', regime: 'state' },
  { code: '38', name: 'Ladakh', regime: 'ut' },
  { code: '97', name: 'Other Territory', regime: 'ut' },
];

const STATE_BY_CODE = new Map(GST_STATE_CODES.map((s) => [s.code, s]));

export function gstStateByCode(code: string | null | undefined): GstStateCode | null {
  return (code && STATE_BY_CODE.get(code)) || null;
}

const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export type GstinProblem = 'missing' | 'format' | 'state_code' | 'check_digit';

/** Null when the GSTIN is well formed. Mirrors app.gstin_problem. */
export function gstinProblem(gstin: string | null | undefined): GstinProblem | null {
  if (gstin === null || gstin === undefined || gstin === '') return 'missing';
  if (!GSTIN_SHAPE.test(gstin)) return 'format';
  if (!STATE_BY_CODE.has(gstin.slice(0, 2))) return 'state_code';
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const cp = CHARSET.indexOf(gstin.charAt(i));
    // Weight 2 for positions whose distance from the right end (13 - i) is even, weight 1 otherwise.
    const addend = cp * ((13 - i) % 2 === 0 ? 2 : 1);
    sum += Math.floor(addend / 36) + (addend % 36);
  }
  const expected = CHARSET.charAt((36 - (sum % 36)) % 36);
  return expected === gstin.charAt(14) ? null : 'check_digit';
}

export type TaxMode = 'taxed' | 'not_collected' | 'invalid_profile';

export interface StoreTaxProfile {
  gst_registration: string;
  gstin: string | null;
  state_code: string | null;
}

/** Mirrors app.store_gst_mode. */
export function storeTaxMode(profile: StoreTaxProfile): TaxMode {
  if (profile.gst_registration === 'composition' || profile.gst_registration === 'unregistered') {
    return 'not_collected';
  }
  if (
    profile.gst_registration === 'regular' &&
    gstinProblem(profile.gstin) === null &&
    profile.state_code !== null &&
    profile.state_code === (profile.gstin ?? '').slice(0, 2)
  ) {
    return 'taxed';
  }
  return 'invalid_profile';
}

export interface GstComponents {
  cgstPaise: bigint;
  sgstPaise: bigint;
  utgstPaise: bigint;
  igstPaise: bigint;
  totalPaise: bigint;
}

/**
 * Splits one line's tax. The total is the same figure as the line tax (gstOn on the taxable value). Intrastate:
 * CGST is the tax at half the rate, and the other half is the remainder, so the parts always add up exactly.
 */
export function gstComponents(
  taxablePaise: bigint,
  rateBps: number,
  options: { collect: boolean; interstate: boolean; ut: boolean },
): GstComponents {
  if (!options.collect) {
    return { cgstPaise: 0n, sgstPaise: 0n, utgstPaise: 0n, igstPaise: 0n, totalPaise: 0n };
  }
  const total = gstOn(taxablePaise, rateBps);
  if (options.interstate) {
    return { cgstPaise: 0n, sgstPaise: 0n, utgstPaise: 0n, igstPaise: total, totalPaise: total };
  }
  const cgst = gstOn(taxablePaise, Math.trunc(rateBps / 2));
  const other = total - cgst;
  return options.ut
    ? { cgstPaise: cgst, sgstPaise: 0n, utgstPaise: other, igstPaise: 0n, totalPaise: total }
    : { cgstPaise: cgst, sgstPaise: other, utgstPaise: 0n, igstPaise: 0n, totalPaise: total };
}

export interface LineAmounts {
  taxablePaise: bigint;
  taxPaise: bigint;
  totalPaise: bigint;
}

/**
 * Mirrors app.line_amounts (migration 0059). `gross` is the discounted amount of the line as priced.
 * Exclusive: GST is added on top. Inclusive: the taxable value is extracted from the price; nothing is added.
 * Not collecting (composition, unregistered): the price is the amount payable, with no GST extracted or added.
 */
export function lineAmounts(
  gross: bigint,
  rateBps: number,
  options: { inclusive: boolean; collect: boolean },
): LineAmounts {
  if (gross < 0n || rateBps < 0) throw new RangeError('line amounts cannot be negative');
  if (!options.collect) return { taxablePaise: gross, taxPaise: 0n, totalPaise: gross };
  if (options.inclusive) {
    const taxable = (gross * 10000n + BigInt(10000 + rateBps) / 2n) / BigInt(10000 + rateBps);
    return { taxablePaise: taxable, taxPaise: gross - taxable, totalPaise: gross };
  }
  const tax = gstOn(gross, rateBps);
  return { taxablePaise: gross, taxPaise: tax, totalPaise: gross + tax };
}
