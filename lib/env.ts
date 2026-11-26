/**
 * Server-side environment access. Import only from server code.
 * Reads are lazy so that missing optional values fail where they are used, not at import time.
 */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * The public base URL used for QR codes, payment callbacks and share links.
 * Production never falls back to localhost: NEXT_PUBLIC_APP_URL is required there.
 * Preview deployments may use Vercel's own URL; local development uses localhost:3000.
 */
export function appUrl(): string {
  const configured = optionalEnv('NEXT_PUBLIC_APP_URL');
  if (configured) return configured.replace(/\/+$/, '');
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  if (isProduction) {
    throw new Error('Missing required environment variable: NEXT_PUBLIC_APP_URL (production links must not use localhost)');
  }
  const vercelHost = optionalEnv('VERCEL_URL');
  if (vercelHost && process.env.VERCEL_ENV === 'preview') return `https://${vercelHost}`;
  return 'http://localhost:3000';
}

/**
 * True only when the simulator may run. It is refused in production on Vercel and whenever
 * NODE_ENV is production, regardless of ZENTRO_PAYMENT_MODE.
 */
export function simulatorAllowed(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.VERCEL_ENV === 'production') return false;
  return process.env.ZENTRO_PAYMENT_MODE === 'simulator';
}

export function paymentMode(): 'razorpay' | 'simulator' {
  return simulatorAllowed() ? 'simulator' : 'razorpay';
}
