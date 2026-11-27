import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
import { appUrl } from '@/lib/env';

export type QrTarget = { type: 'showroom' } | { type: 'category'; slug: string } | { type: 'product'; slug: string };

/**
 * Resolve the public origin for QR links. Prefers configured non-localhost appUrl(),
 * otherwise falls back to the incoming request's forwarded host or origin so production
 * QR codes never accidentally encode localhost:3000.
 */
export function resolvePublicOrigin(request?: Request): string {
  try {
    const configured = appUrl();
    if (!configured.includes('localhost') && !configured.includes('127.0.0.1')) {
      return configured;
    }
    if (request) {
      const fwdHost = request.headers.get('x-forwarded-host');
      const fwdProto = request.headers.get('x-forwarded-proto') || 'https';
      if (fwdHost && !fwdHost.includes('localhost') && !fwdHost.includes('127.0.0.1')) {
        return `${fwdProto}://${fwdHost}`;
      }
      const origin = new URL(request.url).origin;
      if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
        return origin;
      }
    }
    return configured;
  } catch {
    if (request) {
      const fwdHost = request.headers.get('x-forwarded-host');
      const fwdProto = request.headers.get('x-forwarded-proto') || 'https';
      if (fwdHost) return `${fwdProto}://${fwdHost}`;
      return new URL(request.url).origin;
    }
    return appUrl();
  }
}

/** Storefront URL for a QR target, built from the configured production domain. */
export function targetUrl(storeSlug: string, target: QrTarget, baseOrigin?: string): string {
  const base = `${(baseOrigin ?? appUrl()).replace(/\/$/, '')}/store/${storeSlug}`;
  if (target.type === 'showroom') return base;
  if (target.type === 'category') return `${base}/category/${target.slug}`;
  return `${base}/product/${target.slug}`;
}

async function loadLogoPng(logoUrl?: string | null): Promise<PNG | null> {
  if (logoUrl && /^https?:\/\//i.test(logoUrl)) {
    try {
      const res = await fetch(logoUrl, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        // PNG magic bytes: 89 50 4E 47
        if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
          return PNG.sync.read(buf);
        }
      }
    } catch {
      // Fall back to ZENTRO logo below
    }
  }
  try {
    const fallbackPath = path.join(process.cwd(), 'public', 'images', 'zentro-logo.png');
    if (fs.existsSync(fallbackPath)) {
      return PNG.sync.read(fs.readFileSync(fallbackPath));
    }
  } catch {
    // Ignore if unavailable
  }
  return null;
}

function compositeCenterLogo(qr: PNG, logo: PNG): void {
  const badgeSize = Math.max(24, Math.floor(qr.width * 0.22));
  const border = Math.max(2, Math.floor(badgeSize * 0.05));
  const pad = Math.max(4, Math.floor(badgeSize * 0.1));
  const innerSize = badgeSize - (border + pad) * 2;
  if (innerSize <= 8) return;

  const startX = Math.floor((qr.width - badgeSize) / 2);
  const startY = Math.floor((qr.height - badgeSize) / 2);

  // Draw white background badge with champagne gold border (#C9A45C)
  for (let y = 0; y < badgeSize; y++) {
    for (let x = 0; x < badgeSize; x++) {
      const px = startX + x;
      const py = startY + y;
      if (px < 0 || py < 0 || px >= qr.width || py >= qr.height) continue;
      const idx = (qr.width * py + px) << 2;
      const isBorder = x < border || y < border || x >= badgeSize - border || y >= badgeSize - border;
      if (isBorder) {
        qr.data[idx] = 0xc9;
        qr.data[idx + 1] = 0xa4;
        qr.data[idx + 2] = 0x5c;
        qr.data[idx + 3] = 255;
      } else {
        qr.data[idx] = 255;
        qr.data[idx + 1] = 255;
        qr.data[idx + 2] = 255;
        qr.data[idx + 3] = 255;
      }
    }
  }

  // Alpha-blend resized logo into center
  const logoStartX = startX + border + pad;
  const logoStartY = startY + border + pad;
  for (let y = 0; y < innerSize; y++) {
    const sy = Math.min(logo.height - 1, Math.floor((y * logo.height) / innerSize));
    for (let x = 0; x < innerSize; x++) {
      const sx = Math.min(logo.width - 1, Math.floor((x * logo.width) / innerSize));
      const sIdx = (logo.width * sy + sx) << 2;
      const alpha = (logo.data[sIdx + 3] ?? 0) / 255;
      if (alpha <= 0.02) continue;

      const dx = logoStartX + x;
      const dy = logoStartY + y;
      const dIdx = (qr.width * dy + dx) << 2;
      qr.data[dIdx] = Math.round((logo.data[sIdx] ?? 0) * alpha + (qr.data[dIdx] ?? 255) * (1 - alpha));
      qr.data[dIdx + 1] = Math.round((logo.data[sIdx + 1] ?? 0) * alpha + (qr.data[dIdx + 1] ?? 255) * (1 - alpha));
      qr.data[dIdx + 2] = Math.round((logo.data[sIdx + 2] ?? 0) * alpha + (qr.data[dIdx + 2] ?? 255) * (1 - alpha));
      qr.data[dIdx + 3] = 255;
    }
  }
}

export async function qrPng(url: string, size: number, logoUrl?: string | null): Promise<Buffer> {
  const width = Math.min(1200, Math.max(200, Math.round(size)));
  const qrBuf = await QRCode.toBuffer(url, {
    type: 'png',
    width,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#45081C', light: '#FFFFFF' },
  });

  const logo = await loadLogoPng(logoUrl);
  if (!logo) return qrBuf;

  const qr = PNG.sync.read(qrBuf);
  compositeCenterLogo(qr, logo);
  return PNG.sync.write(qr);
}
