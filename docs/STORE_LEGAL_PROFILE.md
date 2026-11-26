# Store legal and tax profile, onboarding persistence and document snapshots

## Fields and where they live
- `stores.legal_name`, `business_category`, `business_description`, `billing_address`: registered business name, category, description and billing address.
- `stores.gstin`, `stores.state` (the business state used for GST), `stores.gst_registration` (`regular`, `composition` or `unregistered`), `stores.prices_include_gst`.
- Onboarding step 1 writes category and description; step 3 writes the legal and tax profile. Drafts keep the entered values in `store_onboardings.step_data`, so an interrupted onboarding resumes with its values.

## Who changes what
- Platform administrators edit the profile on the Admin store screen and during onboarding.
- Owners and managers see it read-only on the Settings page. A database trigger (`stores_guard_legal_profile`) refuses changes to these fields from anyone other than a platform administrator, including direct API calls.
- The storefront shows the legal name (when different from the trading name) and the business description.

## Validation
- Legal name, billing address and business state are required in onboarding and on the Admin screen.
- A regular or composition registration requires a GSTIN. An unregistered business may leave it blank. The rule lives in `lib/onboarding/legal-rules.ts` and is unit-tested without dependencies.

## Document snapshots
- Each invoice and quotation records the seller details in force when it is created: legal name, billing address, GSTIN, state, GST registration and the price-includes-GST setting.
- A trigger (`app.seller_snapshot_guard`) fills these at insert and refuses later changes to them.
- Invoices and quotations created before migration 0033 were snapshotted once, from the store details on record at that time. They do not change when the store is edited later.
- The invoice and quotation PDFs read the snapshot. The store's current details are used only if no snapshot exists.

## Onboarding: atomic store creation and recovery
- `public.onboarding_create_store` creates the store and links it to its onboarding in one transaction. It locks the onboarding row, refuses a closed onboarding or one that already has a store, and writes nothing if the slug is taken. This removes the earlier compensating delete, which could remove a store that had in fact been linked.
- Owner account creation runs outside the database transaction because it creates an authentication user. If the link fails, the account is removed only when the onboarding does not already point at it. A link that was written before an error is therefore kept.
- Passwords are never stored in drafts, logs or audit records (database check on `step_data`, and the password is passed to account creation only).
- Activation still requires every step (store, owner, tax, subscription, features, QR). Repeating activation changes nothing.

## Tax assumptions requiring professional verification
- A store that already had a GSTIN before migration 0033 was treated as a regular registrant. A tax adviser must confirm each store's registration type.
- The business state is stored as free text. It must be mapped to GST state codes before the GST release.
- Price-includes-GST is stored but does not yet change any calculation. Tax calculations are unchanged until the GST release.

## Limitations
- Owner account creation cannot be made atomic with the database, so a crash between creating the authentication user and linking it can leave an unlinked account. The Admin screen shows the onboarding as incomplete, and nothing removes it automatically yet. An administrator must check for unlinked accounts and deactivate or remove them.
- No browser or hosted Supabase verification has been performed for these screens.
