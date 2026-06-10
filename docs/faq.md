# FAQ & Glossary

**BLUF:** The twelve questions integrators actually ask, answered in two sentences or fewer where the truth allows it — plus a glossary of the ten terms this guide leans on.

## FAQ

**Is this live on mainnet?**
Yes — since roughly **June 3, 2026**, at program ID `De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44`. A devnet demo also runs at `solana-subscriptions-program.vercel.app`.

**Is this a Token-2022 extension or a protocol (SIMD) change?**
Neither. It's a standalone userspace program — built by Moonsong Labs with the Solana Foundation, written in Anza's Pinocchio (zero-dependency, no-std Rust) — that works *with* SPL Token and Token-2022 via CPI. No consensus change was involved.

**Does it support SOL?**
Not natively — it operates on token accounts only. Wrap into wSOL if you must; most billing flows want a stablecoin anyway. ([Token Compatibility](reference/token-compatibility.md))

**Can a merchant change my subscription price?**
No. A plan's `amount`, `period`, `mint`, and `destinations` are immutable after creation — and your subscription stores a **snapshot of the terms you accepted**, fingerprint-checked on every pull. Even deleting and recreating the plan at the same address fails with `PlanTermsMismatch`. ([The ghost-account defense](reference/failure-modes.md#the-ghost-account-defense-as-a-story))

**What happens if I cancel?**
Pulls are refused from the next gate-chain evaluation onward — the program enforces your cancellation; the merchant can't override it. The subscription account survives, so you can later `resume_subscription` without re-doing setup. Whether you keep service until period end is the merchant's off-chain policy.

**My wallet says I approved "unlimited" spending. Was I scammed?**
No — but your wallet is telling a half-truth. The program's keyless PDA holds a `u64::MAX` token approval, and every actual transfer is gated by your delegation's caps, destination allowlist, expiry, and cancellation state. Effective exposure = the caps on your active delegations, not the approval number. ([The honest explanation](concepts/authorization-model.md#the-u64max-approval-paradox-explained-honestly))

**Who triggers the payments? Is there a billing scheduler?**
There is **no scheduler, crank, or keeper** in the program — it validates pulls; it never initiates them. The merchant (or up to 4 whitelisted pullers) submits each pull and pays its ~5,000-lamport fee. If you're the merchant, [you run that infrastructure](guides/running-a-puller.md).

**Does this replace Clockwork?**
No — it solves *authorization*, not *execution*. Clockwork (the old keeper network) is dead and nothing has filled the execution gap; pull-triggering remains your off-chain job.

**Was it audited?**
Yes — by **Cantina** (the merged Spearbit/Cantina entity; older coverage says "Spearbit"), under the program's former name "multi-delegator." Coverage runs through commit `b4b0345f`; later commits are unaudited per the repo's `AUDIT_STATUS.md` (2026-04-08). ([Full audit status](security/audit.md))

**Can I bill in a compliance/permissioned token?**
Probably not — check its extensions first: the SDK ships rejection errors (codes 118–124) for seven Token-2022 extensions, including the standard compliance mechanisms: transfer hooks, transfer fees, permanent delegates — and also confidential transfer, non-transferable, mint close authority, and pausable. ([Token Compatibility](reference/token-compatibility.md), including the docs-vs-SDK discrepancy on confidential transfer)

**Can I do per-minute or streaming payments?**
Not with plans — plan period granularity is whole hours (`1..8760`). But direct **recurring delegations** take their period in seconds (`periodLengthS`), so sub-hourly metering is possible at the delegation layer. ([Recurring Delegations](guides/recurring-delegations.md))

**What's the difference between a plan and a recurring delegation?**
Authorship and fan-out: a **plan** is merchant-published, accepted by many subscribers (each with a terms snapshot and the puller-whitelist machinery); a **recurring delegation** is a bilateral envelope whose terms the *payer* writes. Same period mechanics underneath. ([The Three Primitives](concepts/primitives.md))

## Glossary

| Term | Meaning |
|---|---|
| **SubscriptionAuthority (SA) PDA** | Program-derived account (`["SubscriptionAuthority", user, tokenMint]` — literal CamelCase seed, one per (user, mint)) that holds the token-account delegation and signs transfers via CPI — the program's keyless signing arm. |
| **Delegation PDA** | The state account gating a grant — fixed, recurring, or subscription — holding caps, counters, and expiry. The SA PDA may only move funds within a delegation's limits. |
| **Plan** | A merchant-published subscription offer (`["plan", owner, plan_id_le]`, 491 bytes): immutable core terms + updatable status/end/pullers/metadata. |
| **Terms snapshot** | The copy of plan terms (plus plan `created_at`) frozen into a subscription at `subscribe` — the basis of the ghost-account defense. |
| **Puller** | A key whitelisted on a plan (max 4, updatable) authorized to trigger pulls; pays the fee for each pull it submits. |
| **Pull** | A program-validated transfer (`transfer_subscription` / `transferFixed` / `transferRecurring`) initiated by the counterparty, not the payer. |
| **Period rollover** | The lazy reset of `amount_pulled_in_period` when a pull executes after a period boundary — nothing updates at the boundary itself. |
| **Cap** | The spending limit: cumulative for fixed delegations, per-period (no carry-over) for recurring and plans. |
| **`PlanTermsMismatch`** | The error raised when a subscription's snapshot fingerprint doesn't match the live plan — the defense against deleted-and-recreated "ghost" plans. |
| **`event_authority`** | The PDA (`["event_authority"]`) that signs the program's self-CPI event emissions — your proof an event is genuine program output. |

---

*Sources for every claim on this page: [About → Sources](about.md#sources).*
