# Failure Modes & Errors

**BLUF:** Every failed pull is the program doing its job — the question is what *your* system does next. The table below maps each failure scenario to its cause and the correct integrator response. The golden rule: classify before retrying. Most failures here are **permanent** for the current state of the world, and blind retries just pay fees to be told no again.

## The failure table

| Scenario | On-chain cause | Integrator handling |
|---|---|---|
| **Plan closed** (`PlanClosed`) | The plan's status has been closed / the plan is no longer accepting activity | Permanent. Stop pulls against it; if you're the merchant, this is your own lifecycle action — make sure your scheduler heard about it. Subscribers can't be billed on a closed plan. |
| **Terms mismatch** (`PlanTermsMismatch`) | `check_plan_terms()` — the subscription's snapshot (terms + plan `created_at`) doesn't match the live plan account | Permanent. **This is the ghost-account defense firing** — see the narrative below. Never retry; investigate. If you're the merchant and you recreated a plan, you must migrate subscribers via fresh `subscribe`, not pull against old delegations. |
| **Period cap exceeded** | `amount_pulled_in_period + amount` would exceed the per-period cap (after lazy rollover is applied) | Permanent *for this period*. Usually means a duplicate pull — the cap is your idempotency backstop. Fix the scheduler dedupe; pull again next period. |
| **Pull against cancelled subscription** | Subscriber signed `cancel_subscription`; cancellation gate rejects | Permanent until the subscriber `resume_subscription`s. Deschedule immediately on the Cancelled [event](events.md); treat this failure as a race outcome, not an error. |
| **Plan expired** | Plan `end_ts` (or delegation `expires_at_ts`) is in the past | Permanent. The offer is over. Merchant-side: publish a successor plan and run a re-subscribe campaign; there's no extending a dead window for existing delegations. |
| **Destination mismatch** | `receiverAta` not on the plan's immutable destination allowlist | Permanent — and a config bug or an attack, never a transient. Funds can *only* land on the allowlist snapshotted into the plan. If your treasury rotated, this is the program telling you that plan must be sunset. |
| **Unauthorized caller** | Pull signer is neither the plan owner nor one of the ≤4 whitelisted pullers | Permanent until `update_plan` changes the puller list. Check you're signing with a currently-whitelisted key — puller rotation that didn't reach your billing service looks exactly like this. |
| **Duplicate subscribe** | A SubscriptionDelegation PDA already exists at `["subscription", plan_pda, subscriber]` — account-already-exists on create | One subscription per (plan, subscriber) by construction. Surface "you're already subscribed" in UX; if the user wants to re-up after cancelling, the path is `resume_subscription`, not a second `subscribe`. |
| **Insufficient subscriber balance** | The token CPI itself fails — the delegation math passed but the wallet can't cover the amount | The one *self-healing* failure: route to dunning (retry at widening intervals, notify the user, suspend service on your policy timeline). Don't tight-loop retries. |

(Exact error enum names beyond `PlanClosed` and `PlanTermsMismatch` vary; map them from the IDL/program source rather than string-matching log text.)

## The ghost-account defense, as a story

This one deserves more than a table row, because it's the program's most elegant check and the easiest to misread as a bug.

The attack it kills: a merchant publishes a plan — $5/month — and signs up a thousand subscribers, each of whom signed exactly once against those terms. Months later the merchant `delete_plan`s it and creates a **new** plan with the same `plan_id`. Because plan PDAs derive from `["plan", owner, plan_id_le]`, the new plan lands at **the same address** — but this one says $500/month. Every old SubscriptionDelegation still points at that address. Without a defense, the merchant just repriced a thousand subscriptions nobody agreed to.

The defense: at `subscribe` time, the delegation snapshots the plan's terms **and its `created_at` timestamp** — a fingerprint of the specific plan instance the user consented to. On every pull, `check_plan_terms()` compares that fingerprint to the live account at the plan address. A deleted-and-recreated plan is a different instance: different `created_at`, mismatched fingerprint, **`PlanTermsMismatch`**, pull dead. The subscriber's one signature keeps meaning exactly — only — what it meant on the day they gave it.

So when you see `PlanTermsMismatch` in production: the program just refused to bill someone against terms they never accepted. The fix is never "retry"; it's "issue a fresh plan and ask users to subscribe to it."

## Triage flow for a failed pull

A recommended order of checks when a pull fails and the cause isn't obvious:

1. **Did a lifecycle event race you?** Check your event index for Cancelled (or a plan status change) landing just before your transaction.
2. **Is it the cap?** Compare `amount_pulled_in_period` + period anchor on the live account against your schedule's assumption — a drifted schedule double-pulling is the most common self-inflicted failure.
3. **Fingerprint check** — if `PlanTermsMismatch`, stop everything and audit plan history; someone recreated a plan.
4. **Key & destination config** — confirm the signing key is on the current puller list and the destination is on the plan's allowlist.
5. **Only then consider it transient** (RPC, blockhash, congestion) and let backoff retry handle it.

**Recap:** eight-ish ways a pull dies, and only RPC-flavored ones deserve automatic retries. Cap failures mean dedupe bugs, cancellation failures mean deschedule races, `PlanTermsMismatch` means the ghost-account defense just protected a subscriber, and balance failures get a dunning ladder — everything else is configuration you control.

---

*Sources for every claim on this page: [About → Sources](../about.md#sources).*
