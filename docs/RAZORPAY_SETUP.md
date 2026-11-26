# Razorpay Setup

This document describes the Razorpay integration as implemented in this repository. It does not claim that any payment method is available for your account; check your Razorpay Dashboard for activation status.

## 1. What the application does with Razorpay

| Route | Purpose | Who calls it |
|---|---|---|
| `/api/payments/razorpay/verify` | Checks the payment response after the Razorpay checkout callback | The guest or owner browser, after payment |
| `/api/webhooks/razorpay` | Receives Razorpay webhook events and applies them to the database | Razorpay servers |

Webhook events the application processes:

| Event | Effect |
|---|---|
| `payment.captured` | Marks the matching payment as captured (idempotent) |
| `payment.failed` | Records the failure (idempotent) |
| `refund.processed` | Marks the refund as processed |
| `refund.failed` | Marks the refund as failed |

Other refund events are recorded and ignored. Each event is stored and processed once; a repeated delivery is acknowledged without a second effect.

**Payment verification is server-side.** A success message in the browser never marks an order paid on its own; the database records payment only after the server-side checks. Do not treat a browser redirect as proof of payment.

---

## 2. Create a Razorpay account

1. Go to https://dashboard.razorpay.com/signup and register with your business email.
2. Complete the business profile. Razorpay will ask for KYC documents before **Live Mode** can be used. Test Mode does not require KYC.

---

## 3. Access Test Mode

1. Sign in at https://dashboard.razorpay.com.
2. Switch the **Test Mode** toggle (usually shown near the top of the dashboard). While it is on, no real money moves.

---

## 4. Generate test API keys

1. Go to **Account & Settings → API Keys** (in Test Mode).
2. Click **Generate Key**. Razorpay shows the **Key ID** (starts with `rzp_test_`) and the **Key Secret**. The secret is shown only once; copy it immediately into a password manager.
3. Set these environment variables (local `.env.local`, and Vercel **Preview** for test keys):

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_RAZORPAY_KEY_ID` | The Key ID (`rzp_test_…`) |
   | `RAZORPAY_KEY_ID` | The same Key ID |
   | `RAZORPAY_KEY_SECRET` | The Key Secret |

Never place the Key Secret in a `NEXT_PUBLIC_` variable.

---

## 5. Create the webhook

1. In Test Mode go to **Account & Settings → Webhooks → Add New Webhook**.
2. **Webhook URL.** Use your application's public URL plus the endpoint path:

   `https://<your-domain>/api/webhooks/razorpay`

   For local testing Razorpay must reach the application over the internet. Use a tunnel service, set `NEXT_PUBLIC_APP_URL` to the tunnel's HTTPS address, and register the tunnel URL here. Remember to restore the production URL later. Do not register `localhost`.

3. **Secret.** Enter a long random string. Copy it into `RAZORPAY_WEBHOOK_SECRET`. The application verifies every webhook signature with this secret; a mismatch is rejected.
4. **Active events.** Select exactly these events for the implementation:
   - `payment.captured`
   - `payment.failed`
   - `refund.processed`
   - `refund.failed`

   You may also select other refund events if you wish; the application records and ignores them.
5. Save. Razorpay shows delivery attempts for each webhook; use them to debug.

---

## 6. Test online checkout

1. Start the application (`npm run dev`) and open a guest storefront.
2. Add products to the cart and check out, choosing online payment.
3. Complete the test payment in the Razorpay checkout window using a Razorpay **test** payment method. Razorpay publishes its current test card and UPI test values in its documentation; use those values only.
4. Confirm that the order becomes paid in the owner portal (`/owner/orders`, `/owner/payments`).

## 7. Test failed payments

Use a Razorpay test method that Razorpay documents as failing. Confirm that the order does not become paid, that stock is released after the reservation expires, and that the owner sees the failed attempt in `/owner/payments`.

## 8. Test duplicate callbacks

1. In the Razorpay dashboard, open a delivered webhook and choose **Resend** (or send the same payment event again).
2. Confirm that the payment is not captured twice, that no second invoice is created, and that stock is not returned twice.

## 9. Test refunds

1. As the Store Owner, open the paid order and use **Refund** (`/owner/orders/[orderId]/refund`).
2. Confirm the refund in the Razorpay dashboard.
3. Confirm that `refund.processed` arrives and that the refund shows as processed in the owner portal.

## 10. Test payment reconciliation

Use `/owner/payments` (owner) and `/admin/payments` (Platform Admin) to compare the gateway records with the application's records. Records that cannot be matched appear for review; the application never marks a record matched merely because a browser reported success.

---

## 11. Switch from Test Mode to Live Mode

1. Complete Razorpay KYC for your business.
2. In **Live Mode**, generate new Key ID and Key Secret. Test keys do not work in Live Mode.
3. Create a **separate** webhook in Live Mode with the production URL and a **new** webhook secret.
4. Set production values in Vercel **Production** only: `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
5. Set `ZENTRO_PAYMENT_MODE=razorpay`. The development simulator is refused in production regardless of this value.
6. Redeploy (the `NEXT_PUBLIC_` values are compiled into the build; see the Vercel guide).
7. Make one small real payment and one refund under your own control before opening sales.

---

## 12. Product activation (UPI QR and other methods)

Whether UPI QR, cards, netbanking or wallets are enabled depends on your Razorpay account and its activation. The application's checkout displays the methods Razorpay enables for the account. The application does not verify method availability by itself. Confirm in the Razorpay Dashboard that each method you advertise is active before you tell customers it is available.
