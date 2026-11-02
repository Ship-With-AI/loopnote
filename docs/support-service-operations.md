# Loopnote hosted support operations

## Production boundary

Loopnote has one hosted Supabase production project. Ordinary local development has no hosted-support dependency and never receives deployment or provider credentials. A protected `main` push automatically runs `.github/workflows/deploy-supabase-production.yml`; there is no manual deployment path.

The credential-free `repository-gates` job runs before the serialized `deploy-production` job enters GitHub's protected `production` environment. Only the protected job receives the project ref, deployment credentials, and provider inputs.

The configured package is still built and scanned, but this deployment workflow persists only redacted deployment evidence as a GitHub artifact. Runtime tarballs are not uploaded by this workflow; their distribution requires the separate artifact/notice acceptance gate.

## Default project origin

The sole browser-facing origin is `https://<project-ref>.supabase.co`. The protected executor validates `SUPABASE_PROJECT_REF` immediately before hosted mutation and derives routes only in memory. Do not store a separate public-origin, site URL, redirect URL, GitHub callback URL, or webhook URL input.

Packages and redacted evidence retain the canonical-origin-only boundary: no bare project ref, another Supabase host, credentials, OAuth secrets, personal data, unapproved provider identifiers or provider secrets.

The operator accepted six exact non-secret configuration identifier fingerprints for the reviewed Loopnote CI exposure on 2026-09-08, recorded in `.planning/phases/03-distribution-contract-legal-boundary/03-PUBLICATION-REVIEW.md` under PUB-01. That CI-only disposition covers the reviewed Supabase project ref, GitHub OAuth client ID and historical Stripe price/webhook endpoint IDs. It does not permit secret keys, personal data, new identifier values or additional package contents; keep the raw values out of review records.

## Support Checkout discount and coupon policy

The support Checkout Session is created against one configured Stripe Price (`STRIPE_PRICE_ID`, USD $49.99 / 4999 minor units) and now sets `allow_promotion_codes: true`, so the hosted Checkout page shows a promotion-code entry field. The app never accepts a promotion code from the browser or the local Loopnote client itself; only Dashboard-scoped codes entered on Stripe's own hosted page can apply.

To create a usable code, in the Stripe Dashboard: create a Coupon (Product catalog → Coupons → New) scoped to whatever percentage- or amount-off is desired, then create a Promotion code bound to that coupon (from the coupon's detail page, or Payments → Promotion codes → New). Only a promotion code created this way is redeemable; there is no other issuance path.

Price-stability invariant: the configured Price's unit amount must remain exactly USD 49.99. `record_checkout_session` records `p_amount_total: 4999` as the pre-discount list total before any code is entered, the `support_private.checkout_sessions` table CHECK enforces `amount_total = 4999` on that intent-time row, and the webhook's fulfillment schema separately requires the retrieved Checkout Session's `amount_subtotal` to equal 4999. Changing the Price's amount therefore breaks fulfillment for every purchase, discounted or not, and must never be done without a coordinated code change.

100%-off comps are fulfillable: a promotion code reaching 100%-off produces a Checkout Session with `amount_subtotal: 4999`, `amount_total: 0`, `total_details.amount_discount: 4999`, and **no** Stripe PaymentIntent, because Stripe charges nothing. Note that Stripe still reports `payment_status: "paid"` for such a session (verified against live event `evt_1UGHg1BbrqRlfgZV9Jotp4rp`), so the status string cannot distinguish a comp from a charge — the explaining full discount is what does. The webhook's fulfillment schema accepts that shape as a *comped* session alongside the charged shape, requiring `amount_discount` to cancel the list subtotal exactly, and `support_private.supporters.stripe_payment_intent_id` is nullable so the comped supporter is recordable. Every other anti-forgery fact still applies unchanged: payment mode, USD, `amount_subtotal = 4999`, the exact configured Price, quantity 1, server-owned metadata, and a real Stripe Customer (`customer_creation: "always"` does attach one to a zero-total session). A zero total with no explaining discount, a partial discount, or an unpaid status is still rejected. A comped supporter is verified exactly like a paying one, and may later pay without raising a payment conflict; two distinct charged PaymentIntents for one supporter remain an auditable conflict. Before migration `20260916000000_comped_support_fulfillment.sql` such a session was permanently unfulfillable — the purchaser appeared as a Stripe Customer while the launch prompt kept reappearing.

Rejected webhook deliveries are diagnosable from the Edge Function logs. Every non-2xx branch of `stripe-webhook` now names itself with bounded, value-free text: `stripe_webhook_signature_rejected` (the delivered signature did not verify against `STRIPE_WEBHOOK_SECRET` — the usual cause is a secret belonging to a different, rotated, or test-mode endpoint, which the `whsec_` format gate in `verify-supabase-support.mjs` cannot detect), `stripe_webhook_event_shape_rejected`, `stripe_webhook_invariant_rejected:<fields>` (the failing field names of the closest matching shape, e.g. `customer` or `amount_subtotal`, plus the synthetic `price_id`, `metadata`, and `shape` reasons), `stripe_webhook_provider_unavailable`, and `stripe_webhook_authority_unavailable:<pg_code>`. Both 400 branches previously returned the same body and logged nothing, so a permanently unfulfillable purchase was indistinguishable from a signing-secret mismatch.

## Retirement and release scanning

Plan 02-15 proves **configured absence**, not a configured release. Run:

```sh
node scripts/verify-supabase-support.mjs --retirement-review \
  --output .planning/phases/02-move-the-implementation-to-supabase/02-15-RETIREMENT-EVIDENCE.md
```

It scans tracked ship-relevant content and rebuilt `dist`, then inspects one explicit `development-check` archive created by the runtime producer. Immutable planning/history descriptions and scanner-contract fixtures may describe retired names; credentials remain prohibited. Documented empty Stripe key prefixes are not credential payloads. Evidence records package digests, configured absence, and violations. Disposable archives are cleaned after the check.

The production scanner never builds or packs, and has no default input:

```sh
node scripts/verify-production-artifacts.mjs \
  --archive "$LOOPNOTE_RUNTIME_CUSTODY_DIR/$LOOPNOTE_RUNTIME_ARCHIVE_BASENAME" \
  --expected-sha256 "$LOOPNOTE_RUNTIME_ARCHIVE_SHA256" \
  --evidence "$LOOPNOTE_RUNTIME_EVIDENCE"
```

Use absolute archive/evidence paths. For configured artifacts, provide the canonical origin only through `LOOPNOTE_RELEASE_SUPPORT_SERVICE_URL`; for unconfigured artifacts, leave it unset. The scanner verifies independent archive hashes, legal/runtime inventories, recursive browser assets, native-target facts, and exactly one generated launcher assignment. It emits bounded JSON without origin cleartext or private paths. These checks apply to hash-bound trusted local producer output, not arbitrary hostile tar input.

The production workflow creates one disposable `deployment-check` archive and passes that same environment origin to the verifier. Only redacted Supabase deployment evidence is uploaded; runtime bytes and runtime evidence remain temporary.

## Final evidence contract

Plan 02-17's credential-free collector writes only `02-17-LOCAL-PACKAGE-SECURITY-EVIDENCE.md`. Final review alone writes `02-17-FINAL-EVIDENCE.md` and requires six distinct immutable records:

```sh
node scripts/verify-supabase-support.mjs --final-review \
  --test-deployment PATH --acceptance PATH --promotion PATH \
  --retirement PATH --release PATH --local-package-security PATH \
  --output .planning/phases/02-move-the-implementation-to-supabase/02-17-FINAL-EVIDENCE.md
```

`--check-final` takes the final evidence path plus the same six named inputs and only recomputes bindings. The release input must have a separate immutable `loopnote.release-approval` record bound to its unchanged bytes, GitHub run ID, and package digest.

Detached evidence validation uses explicit deployment inputs, not a receipt discovered in a particular planning directory. Supply `--deployment PATH` with `--check-promotion-evidence`, and with `--check-run-evidence` whenever `--acceptance PATH` is supplied. `--final-review` and `--check-final` use their existing `--test-deployment PATH` for the complete acceptance/promotion chain. Missing inputs and mismatched lineage still fail closed.
