# Evidence Ledger

Provenance for externally verifiable claims that appear in Loopnote's user-visible copy.
Every row records where the fact came from, not where it is displayed.

| Claim | Source | Origin |
|---|---|---|
| `Support Loopnote` — $49.99 | user | Locked product decision PAY-01 / D-02, recorded in `.planning/PROJECT.md` and `.planning/milestones/v1.4-REQUIREMENTS.md`; realized as one immutable one-time USD $49.99 Stripe Price and shipped in published `@shipwithai/cumpa@1.5.0`. The claim column quotes the shipped button string verbatim; the product name is written **Loopnote** in prose. |
| USD $49.99 | user | Same decision; the hosted authority independently re-verifies `currency=usd` and `amount_total=4999` on every `checkout.session.completed` before granting support. See `docs/support-service-operations.md`. |

Payment is voluntary and feature-neutral: PAY-02 requires that paying, dismissing, or
declining changes nothing except support-dialog visibility. No review or export capability
is gated.
