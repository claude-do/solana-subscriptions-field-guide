# Events

**BLUF:** The program emits four lifecycle events — **Created, Cancelled, Resumed, Transfer** — via self-CPI signed by the `["event_authority"]` PDA. They are the only push-shaped signal you get; a billing backend that doesn't index all four is flying blind between RPC polls.

## Emission mechanism: self-CPI via `["event_authority"]`

Rather than relying on log lines (which RPC providers can truncate), the program emits events by **CPI-ing into itself**, with the call signed by a PDA derived from seeds `["event_authority"]`. The event payload travels as the instruction data of that inner self-invoke.

What this means for your indexer:

- **Look at inner instructions, not just logs.** Subscribe to/parse transactions involving the program and decode the self-CPI instruction data; this survives log truncation.
- **The `event_authority` signer is your authenticity check.** Only the program itself can produce that PDA's signature, so a decoded event from that path is genuine program output — not spoofable by an arbitrary caller crafting look-alike logs.
- The transfer event's name as shipped is `SubscriptionTransferEvent`; the digest of program sources names the family as Created / Cancelled / Resumed / Transfer — confirm exact struct names and payload fields against the IDL in the [program repo](https://github.com/solana-program/subscriptions) when writing your decoder.

## The four events, and what your backend should do

| Event | Emitted when | Your billing backend should |
|---|---|---|
| **Created** | A user successfully `subscribe`s | Provision access/entitlements. Insert the subscriber into your puller's schedule index with their period anchor. Decide first-charge timing per your product semantics (bill-at-subscribe vs. end-of-period). |
| **Cancelled** | Subscriber signs `cancel_subscription` | Remove from the pull schedule **immediately** — every subsequent pull attempt is a guaranteed-failed, fee-paying transaction. Apply your end-of-access policy (immediate vs. end of paid period — your call, off-chain). Trigger win-back flows if you have them. |
| **Resumed** | Subscriber signs `resume_subscription` | Re-add to the schedule; re-read the subscription account for the current period anchor rather than trusting your stale copy. Restore entitlements. |
| **Transfer** (`SubscriptionTransferEvent`) | A pull passes the full gate chain and the token CPI executes | This is **revenue ground truth**. Reconcile against the expected pull, mark the invoice paid, extend the entitlement, write the receipt. The *absence* of an expected Transfer event is your primary alert condition. |

## Recommended indexer invariants

These are engineering recommendations, not program facts:

1. **Events are the write-ahead log; account state is the checkpoint.** After downtime, resync from account state (`SubscriptionDelegation` PDAs), then tail events forward — don't replay stale event backlogs into actions.
2. **Reconciliation loop:** per period, `expected pulls − observed Transfer events = 0`, anything else pages a human. Cheapest high-signal alarm in this whole system.
3. **Idempotent handlers.** Index by `(signature, instruction index)` so re-processing a transaction (RPC retries, reorg-adjacent weirdness) can't double-provision or double-receipt.
4. **Don't infer cancellation from failed pulls.** A pull can fail for [many reasons](failure-modes.md); the Cancelled event is the authoritative signal. Failed-pull-handling and lifecycle-state-handling should be separate code paths.

**Recap:** four events, emitted as self-CPI under `["event_authority"]` — decode inner instructions, treat the PDA signer as the authenticity proof, provision on Created, deschedule on Cancelled, reschedule on Resumed, and reconcile revenue against Transfer.

---

*Sources for every claim on this page: [About → Sources](../about.md#sources).*
