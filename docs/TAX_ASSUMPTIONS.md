# Tax assumptions

These assumptions were confirmed by the product owner and are recorded here so the GST implementation starts from them. Nothing in this list activates tax-inclusive calculations.

1. **Provisional GST registration.** Existing stores that have a GSTIN are classed as `regular` GST registrants on migration (`0033_store_legal_profile.sql`). This is provisional and subject to verification by the store.
2. **Platform Admin correction.** The Platform Admin can change a store's GST classification (`gst_registration`: regular, composition or unregistered) through the store editor. Changes are audited, and only the platform admin or the service role may change legal and tax fields (`app.guard_store_legal_profile`).
3. **State codes.** Stores carry a GST state code (`stores.state_code`, backfilled from a valid GSTIN). The reference table `gst_state_codes` holds the 37 codes. The Owner settings screen that sets the code for stores without a GSTIN is not yet built.
4. **Price includes GST.** The `prices_include_gst` setting is stored and preserved. It has no effect on calculations yet.
5. **Tax-inclusive calculations stay inactive.** Totals, invoices and quotations continue to use the exclusive calculation. Tax-inclusive calculation is switched on only with the complete GST implementation.
6. **Historical snapshots are preserved.** Invoices and quotations keep the seller details captured when they were issued (`seller_*` columns). Later changes to the store do not alter them.
7. **Migration-time snapshots are labelled.** Documents created before migration 0033 received seller details backfilled from the store at migration time. These rows carry `seller_snapshot_basis = 'migration_0033'`. They record the store's details at migration time, not guaranteed details at issue time, and should be presented as such.

## GST module, first slice (migration 0058)

Implemented and tested: the store tax policy, GSTIN format checks, place of supply for Guest checkout, and CGST, SGST, UTGST and IGST snapshots on orders and order lines. The database is the authority; the cart preview uses the same rules in `lib/gst/policy.ts`.

- **Who collects GST.** Only a `regular` store with a GSTIN that passes the format and check-digit tests, and whose state code matches the GSTIN's first two digits, collects GST (`tax_mode = taxed`). A `composition` or `unregistered` store collects no GST from customers: every line tax must be zero (`tax_mode = not_collected`). A `regular` store with an invalid profile cannot take orders until it is corrected.
- **Place of supply.** The customer enters the state where the order will be delivered. It is required for taxed and composition stores. Same state as the store is an intrastate supply, otherwise interstate. A composition store cannot supply outside its state.
- **Split.** Intrastate: CGST equals the tax at half the rate; the other half is SGST, or UTGST when the store's state is a union territory with `regime = 'ut'`. The halves always add up to the line tax exactly. Interstate: IGST equals the line tax.
- **Calculation.** Every line tax is still `app.line_tax`, which rounds once per line on the discounted taxable value in integer paise. Components are derived from that figure, never the reverse.
- **Historical records.** Orders record the supply state, store state, tax mode, interstate flag, registration at sale and component amounts when they are placed. Later changes to the store do not alter them. Orders and lines written before 0058 carry no components and are accepted unchanged.
- **Seed data.** The development seed GSTINs were corrected to values with valid check digits.

Assumptions for review by a qualified Indian tax professional:

- The state codes and their union territory status follow the GST state list. Delhi, Puducherry and Jammu and Kashmir are treated as having their own state-level tax (SGST). Reviewer to confirm for each.
- Rounding of the half-rate CGST uses integer division of the rate in basis points. Confirm that this matches the invoice practice the business adopts for odd-paise remainders.
- A composition store is treated as not collecting GST from customers. Whether its supply shows a "composition taxable person" statement on invoices is not yet implemented and must be confirmed.
- Whether a store with `gst_registration = 'regular'` may take orders when its GSTIN is valid in format but not yet verified with the GST portal is a business decision. The current behaviour is to allow it.

Not yet implemented: tax-inclusive pricing, coupon interaction tests for the component split beyond the existing line-level checks, POS and quotation tax, purchase input tax credit records, refund and credit-note tax allocation, invoice GST fields and numbering review, GST reports and exports, e-invoice and e-way bill integration (none is claimed).

## Limitations

- Migration-time snapshots cannot prove the seller details that were on a document when it was first issued.
- The GSTIN format and check digit are checked, but the number is not verified against the GST portal.
- No GST return filing exists. Invoice numbering is unchanged by this slice.

## POS place of supply (thirty-second pass)

- An in-store POS sale, and a POS pickup, is treated as supplied from the store's own state. The recorded state is not used for those sales.
- A POS delivery is supplied at the delivery state the staff member records on the bill. The billing state is not used to decide the GST treatment.
- Composition stores are refused for POS deliveries to another state (interstate outward supply). This needs review by a qualified Indian tax professional.
- A buyer GSTIN entered on a POS bill is checked for format and check digit only. It is not verified against the GST portal.
- Pending professional review: whether a delivery sale at another state's address, made by an in-store walk-in customer, should be treated as an interstate supply.
