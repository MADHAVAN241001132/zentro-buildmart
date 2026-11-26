/**
 * Razorpay signature verification. Pure functions using node:crypto.
 *
 * Webhook:  HMAC-SHA256(raw request body, RAZORPAY_WEBHOOK_SECRET), hex, header X-Razorpay-Signature.
 * Checkout: HMAC-SHA256("<order_id>|<payment_id>", RAZORPAY_KEY_SECRET), hex, sent by the browser callback.
 *
 * Comparisons use timingSafeEqual. The raw body must be used exactly as received;
 * re-serialised JSON will not match.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

function hmacHex(message: string, secret: string): string {
  return createHmac('sha256', secret).update(message, 'utf8').digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false;
  const left = Buffer.from(a.toLowerCase(), 'hex');
  const right = Buffer.from(b.toLowerCase(), 'hex');
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyWebhookSignature(rawBody: string, signature: string | null, webhookSecret: string): boolean {
  if (!signature || !webhookSecret) return false;
  return safeEqualHex(hmacHex(rawBody, webhookSecret), signature);
}

export function verifyCheckoutSignature(
  input: { orderId: string; paymentId: string; signature: string },
  keySecret: string,
): boolean {
  if (!input.orderId || !input.paymentId || !input.signature || !keySecret) return false;
  return safeEqualHex(hmacHex(`${input.orderId}|${input.paymentId}`, keySecret), input.signature);
}

/** Test helper and simulator support: produces the signature Razorpay would send. */
export function signWebhookBody(rawBody: string, webhookSecret: string): string {
  return hmacHex(rawBody, webhookSecret);
}

export function signCheckout(orderId: string, paymentId: string, keySecret: string): string {
  return hmacHex(`${orderId}|${paymentId}`, keySecret);
}
