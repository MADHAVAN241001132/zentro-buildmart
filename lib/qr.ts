import 'server-only';
import QRCode from 'qrcode';
import { appUrl } from '@/lib/env';

export type QrTarget = { type: 'showroom' } | { type: 'category'; slug: string } | { type: 'product'; slug: string };

/** Storefront URL for a QR target, built from the configured production domain. */
export function targetUrl(storeSlug: string, target: QrTarget): string {
  const base = `${appUrl().replace(/\/$/, '')}/store/${storeSlug}`;
  if (target.type === 'showroom') return base;
  if (target.type === 'category') return `${base}/category/${target.slug}`;
  return `${base}/product/${target.slug}`;
}

export async function qrPng(url: string, size: number): Promise<Buffer> {
  const width = Math.min(1200, Math.max(200, Math.round(size)));
  return QRCode.toBuffer(url, { type: 'png', width, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#3B2529', light: '#FFFFFF' } });
}
