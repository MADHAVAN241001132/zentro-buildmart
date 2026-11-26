# Account provisioning and recovery

Owner, manager and staff accounts are created through a durable request. The request is recorded before any
external call, so an interrupted attempt is resumed or sent for review. It is never silently repeated.

## Scope

- Admin owner creation (`app/admin/(portal)/owners`)
- Onboarding owner creation (`lib/services/onboarding.ts` step 2)
- Manager and staff creation (`app/owner/(portal)/staff`, through `lib/services/staff.ts`)

All three call `createOwnerAccount` in `lib/services/owner-accounts.ts`, which delegates to
`provisionAccount` in `lib/services/provisioning.ts`.

## Records

`account_provisioning_requests` holds one row per request: id, actor and actor type, request key (a UUID derived
from the caller's key, unique per actor), store, email, name, phone, role, permissions, onboarding id, Auth account
id (`profile_id`), membership state, status, attempt count, lease (`claim_token`, `claimed_until`), safe failure
code and message, reconciliation reason and note, and timestamps. There is **no password column**, and the claim
token is never returned to the UI.

`account_provisioning_events` records each transition: from status, to status, attempt, a short code and a message.
Messages are written by the database functions and never contain credentials.

## States

`REQUESTED → AUTH_PENDING → AUTH_CREATED → MEMBERSHIP_PENDING → MEMBERSHIP_LINKED → ONBOARDING_LINKED → COMPLETED`

Side states: `FAILED` (refused, with a safe code) and `RECONCILIATION_REQUIRED` (needs an administrator).
The next step is derived from recorded facts (profile present? membership linked? onboarding linked?), not from a
separate cursor. Transitions are defined in `lib/provisioning/states.ts`.

## Rules

1. **Passwords** are passed to the Auth adapter for one call. They are not stored, logged, audited or returned.
   Records and audit entries are filtered with `withoutCredentials`.
2. **Idempotency.** The same actor and request key return the same request. A completed request replays its result
   without calling Auth again. A second open request for the same email is refused (`open_request`).
3. **Concurrency.** A request is claimed under a lease of 120 seconds. A second claim while the lease is active
   returns `busy`. A stale claim cannot change the request.
4. **Auth step.** Before creating an Auth user, the workflow asks for a password if none is stored and none was given.
   Outcomes:
   - created: recorded, then membership is linked;
   - already registered: `RECONCILIATION_REQUIRED` (`existing_account`). The account is **not** linked silently;
   - uncertain (no response, server error): `RECONCILIATION_REQUIRED` (`auth_outcome_uncertain`). It is **not** repeated;
   - rejected (invalid password or email): `FAILED` (`auth_rejected`).
5. **Membership step.** Linked in the database with the subscription user limit checked. A quota refusal is recorded
   as `FAILED`; the Auth account stays for retry, which resumes without a second Auth call.
6. **Onboarding step.** Links the owner to the onboarding record in the database. A refusal is recorded as `FAILED`.
7. **No deletion.** No function deletes an Auth account. A failed request keeps whatever exists and is reviewed.
8. **Authority.** Managers may create staff only, need `staff_management`, and may grant only permissions they hold.
   Owners are unrestricted within their store. Platform administrators may do any of this. The database checks the
   actor each time; client-supplied actor ids are not trusted.
9. **Role access.** The `authenticated` role has no table or function access to provisioning. The `zb_prov_*`
   wrappers are granted to `service_role` only (migration 0046).

## Reconciliation (`/admin/provisioning`)

Platform administrators can search by email, filter by status, open the details and history, and:

- **Resume** a request. A password is needed only when no Auth account exists yet, and it is not stored.
- **Confirm no account was created** for an uncertain Auth outcome. A note of at least 10 characters is required.
- **Link an existing account** for `existing_account`. The database requires a platform administrator, an email
  that matches the request, and a note of at least 10 characters.
- **Cancel** a request. The Auth account, if any, is left in place.

Every decision writes an audit entry (`provisioning.*`).

## Hardening (migration 0047)

- **Reused request keys.** A key used again with the same details returns the same request. With different details it is
  refused (`key_reused`), and the form starts a new request. The staff form carries its key through retries after a
  failure, so a retry replays the same request. A new key is created for each new submission.
- **Resume authority.** Every claim that can lead to a privileged step checks the stored actor again. If the actor has
  lost the authority that created the request (for example, `staff_management`), the claim is refused (`forbidden`)
  and Auth is not called.
- **Linking an existing account.** An email match is not enough. The link requires all of these:
  1. a platform administrator;
  2. the request email retyped by the administrator (`confirm_mismatch` otherwise);
  3. a verified email on the Auth account (`unverified_account` otherwise);
  4. no active store membership on that account (`existing_membership` otherwise);
  5. a note of at least 10 characters recording how the account holder was verified.
  The database checks items 1 to 4. Item 5 is the administrator's record of the verification method. It is not checked.
- **Reports.** Every report service function checks the caller's session (`zb_my_store_permissions`, `reports_exports`)
  before it reads with the service-role client. See `lib/services/report-access.ts`.

## Tests

- `tests/provisioning.test.ts` (13 tests): in-memory store and Auth doubles. These are **simulated** tests. They cover
  duplicate requests, idempotent replay, concurrent claims, interrupted Auth not repeated, membership retry, onboarding
  failure, quota refusal, existing-account and uncertain-Auth review, rejected Auth, password requirements, and state rules.
- `supabase/tests/provisioning_tests.sql` (PV1–PV16, run by `scripts/db.sh test`): the real database rules,
  including manager limits, the authenticated role's lack of access, and platform-admin-only linking.
- `supabase/tests/provisioning_hardening_tests.sql` (H1–H5): reused keys, revoked actors, unverified accounts, retyped
  email and active memberships.
- `tests/provisioning.test.ts` also covers key reuse, a forbidden claim and stable key derivation.
- **Not verified here:** hosted Supabase Auth (`auth.admin.createUser` against a real project), the real
  `supabaseAuthAdapter` error classification against hosted responses, and browser-based use of the reconciliation page.
