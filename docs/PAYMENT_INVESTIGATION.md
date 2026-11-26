# Payments: manual investigation and legacy cart steps

This note covers the cases the software will not settle on its own. Each one stays visible until a person records a decision with evidence.

## 1. Unmatched provider payments (`late_payments`, reason `unmatched_provider_order`)

A verified payment whose provider order is not linked to any local attempt is stored with no store and no order. It stays on the Platform Admin queue until attributed.

Attribution (`attributeUnmatchedPayment`, migration 0057 `unmatched_payment_attribute`):

1. The provider payment is read by its exact id. It must be `captured`, in INR, for the recorded amount, and linked to the recorded provider order. If Razorpay refuses or cannot be reached, nothing changes.
2. The provider order is read by its exact id. Its receipt must equal the local order number, its amount must equal the payment, and its status must be `created`, `attempted` or `paid`.
3. The local order is found by its exact number. The store is read from that order. An ambiguous number (more than one match) is refused.
4. The database re-checks everything under row locks: no other paid payment on the order, no refunds on the order, no other order holding this payment or provider order, and no attempt in progress.
5. If the order can still take the payment, the provider order is linked and the existing `settle_online_payment` records it. Otherwise it goes to the owner's late-payment queue (`after_cancellation` or `after_reservation_expiry`) for a decision.
6. Every decision is audited with the actor, the evidence note and the outcome.

Manual investigation is required when:

- Razorpay reports the payment captured but the lookup fails (retry later; nothing changed).
- The order number matches no order or more than one.
- The order total differs from the payment amount.
- The order already has a paid payment (possible double payment: refund decision by the owner, after investigation).
- The order has refunds, or the provider order is attached to a different attempt.
- The payment is not captured (failed, refunded or authorised only).
- The provider's order status is not one of `created`, `attempted` or `paid`.

Nothing here refunds money automatically. Refunds go through the existing refund and late-payment architecture.

## 2. Uncertain payment starts (`payment_initialisations`, status `uncertain` or `amount_mismatch`)

- The only resolution is **adopt**: a provider order id that Razorpay returns for exactly this order, with the same receipt, amount and currency. The check is server-side; the dashboard checkbox and the note are recorded, never used as evidence.
- **Confirm no order** has been removed. Refusing an attempt reopens checkout, which could let the guest pay again while a first provider payment exists. Without a verified provider order, the attempt stays under investigation.
- Empty provider searches are never treated as proof that an order does not exist.

## 3. Legacy cart steps (`guest_request_steps` rows with status `started`)

Rows written before migration 0056 may show `started`: the code recorded intent but did not confirm the cart change. The current code never repeats them and reports them as uncertain.

Reconciliation strategy:

1. Do not replay. Compare the request's step (variant, quantity) with the guest's cart line for that variant.
2. If the cart line already includes the step's quantity, the change happened: mark the step `done` by hand, with a note.
3. If it does not, the change did not happen: mark the step `failed`. The guest can then add the line again through the normal flow.
4. If neither can be determined, leave the step and tell the guest to check the cart.

No automatic reconciliation job is provided. The count of legacy rows is expected to be small and is checked with the query below.

```sql
select g.id as request_id, g.kind, s.step_index, s.variant_id, s.quantity, g.created_at
from guest_request_steps s join guest_request_keys g on g.id = s.request_id
where s.status = 'started' order by g.created_at;
```

## 4. Razorpay assumptions to confirm in test mode

These follow Razorpay's documented API. They have not been exercised against a live account in this environment.

- `GET /v1/orders/{id}` returns `id`, `amount`, `currency`, `receipt` and `status`, with status values `created`, `attempted` or `paid`.
- `GET /v1/payments/{id}` returns `status` (`captured` for a successful payment), `amount`, `currency` and `order_id`.
- A failed lookup returns a non-2xx response; the code treats any failure as "nothing changed".

## 5. Owner and administrator permissions

- Owner payments and late-payment decisions require `refund_management` on the owner Payments screen.
- Cash confirmation remains with `cash_confirmation` on the existing owner cash page.
- Platform administrator reconciliation requires the platform administrator flag, checked in the database as well as in the application.
- No permission was broadened to simplify navigation.
