# Security Model

**BLUF:** Over-pulling isn't prevented by one check but by a **layered gate chain** evaluated on every transfer: ownership, mint, expiry, caller, destination, terms-fingerprint, cancellation, and cap — and only then does the program's PDA sign the token move. The trust statement is precise: users trust the *program's code* (and [its audit](audit.md)) to gate a `u64::MAX` token approval; merchants get exactly the powers a subscriber granted at subscribe time, and not one more.

## What actually stops over-pulling

The naive fear: "the program's PDA holds an unlimited approval on my token account — what stops a merchant from draining it?" The answer is the full check chain, every gate of which must pass **in the same transaction** before the PDA's signature is produced:

| Layer | Gate | What it prevents |
|---|---|---|
| 1 | Program-owned check | Substituted/forged state accounts |
| 2 | Mint match | Pulling a different token than the plan denominates |
| 3 | Plan expiry (`end_ts`) | Billing past the offer's lifetime |
| 4 | Caller authorization (owner \| ≤4 pullers) | Arbitrary third parties triggering pulls |
| 5 | Destination allowlist (immutable) | Redirecting funds anywhere the subscriber didn't agree to |
| 6 | `check_plan_terms()` fingerprint | The [ghost-account swap](../reference/failure-modes.md#the-ghost-account-defense-as-a-story) — recreating a plan with new terms at the same address |
| 7 | Cancellation check | Billing after the subscriber said stop |
| 8 | Period rollover + cap | Pulling more than the agreed amount per period |
| 9 | State update **then** CPI | Counters are committed in the same atomic transaction as the transfer; no partial state |
| 10 | Event emission (self-CPI, `["event_authority"]`) | Silent billing — every transfer leaves an authenticated trail |

Defense-in-depth reading: a merchant who controls their own plan still can't beat layers 5, 6, 7, or 8 — those gates serve the *subscriber* against the *merchant*. An outside attacker dies at layers 1–4 before subscriber-protection even comes up.

## Trust assumptions, stated precisely

### What the user grants

- A **token-level approval of `u64::MAX`** to the SubscriptionAuthority PDA (`["SubscriptionAuthority", user, tokenMint]` — the PDA itself is derived per (user, mint)) on their token account — once per (user, mint).
- The PDA has no private key; its signature exists only as CPI output of the subscriptions program. So the *effective* grant is: "the program may move my tokens **when and only when a live delegation's gates all pass**." No active delegations = no spendable authority, regardless of the approval number.
- Residual trust: the program's code is the gatekeeper. A bug in the gate chain is the real risk surface — which is why the [audit page](audit.md) tells you exactly which commits were reviewed and which weren't, instead of waving the word "audited" at you.

### What merchants CANNOT do

- **Change the deal.** `amount`, `period`, `mint`, `destinations` are immutable post-creation; the subscriber's snapshot enforces this even across plan delete/recreate (`PlanTermsMismatch`).
- **Pull more than the per-period cap**, or pull again once it's consumed — the counter resets only at genuine period rollover.
- **Pull after cancellation** — the subscriber's `cancel_subscription` takes effect at the very next gate-chain evaluation.
- **Pull past expiry** — plan `end_ts` and delegation `expires_at_ts` are checked on every transfer.
- **Redirect funds** — only allowlisted destinations, frozen at plan creation.
- **Touch other tokens** — the SA PDA's authority is exercised per delegation, and each delegation is bound to its mint.

### What merchants CAN do (so you're not surprised)

- Update `status`, `end_ts`, the puller list (≤4), and `metadata_uri` on a plan.
- Stop offering the plan (`delete_plan`) — which ends *future* billing but can't retroactively re-terms existing subscribers.
- Choose *when* within a period to pull, and via *which* whitelisted puller. Timing is merchant-side discretion within the cap; the program enforces amounts, not invoicing etiquette.

## The wallet-UI caveat

Be straight with your users about this one: wallets that render raw token approvals will show the SA PDA's delegation as effectively **"unlimited."** That display is *technically true at the token layer* and *materially misleading about spend authority*, because it doesn't know about the program's gate chain. Until wallet UIs grow program-aware approval displays, integrators should:

- Explain the layered model at subscribe time ([the honest explanation](../concepts/authorization-model.md#the-u64max-approval-paradox-explained-honestly) is linkable for exactly this purpose);
- Never paper over it — a user who discovers the `u64::MAX` from their wallet *after* you didn't mention it has every right to assume the worst;
- Show users their *actual* exposure: the sum of caps across their active delegations, with cancel buttons next to each.

**Recap:** ten layered gates run on every pull, atomically; the user's `u64::MAX` approval is a key held by keyless program code behind those gates; merchants keep operational knobs (status, pullers, metadata, end date) and never the billing terms. Trust the chain of checks, verify via the [audit status](audit.md) — and tell your users the truth about what their wallet will show them.

---

*Sources for every claim on this page: [About → Sources](../about.md#sources).*
