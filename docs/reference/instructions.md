# Instructions & Discriminators

**BLUF:** Two instruction families share the program: the **plan/subscription set** (discriminators 7–13) for merchant-published subscriptions, and the **ADR-001 direct-delegation set** for bilateral fixed/recurring allowances. The signer column below is the one to memorize: setup and cancellation are always the money's owner; pulls are always the counterparty.

## Plan & subscription set

| Discriminator | Instruction | Signer | Notes |
|---|---|---|---|
| `7` | `create_plan` | Merchant (plan owner) | Writes the immutable core terms: `amount`, `period`, `mint`, `destinations`. Choose carefully — there is no edit. |
| `8` | `update_plan` | Merchant (plan owner) | Can change **only** `status`, `end_ts`, `pullers` (≤4), `metadata_uri`. Cannot touch core billing terms. |
| `9` | `delete_plan` | Merchant (plan owner) | Removes the plan. Existing subscribers are protected from a recreate-with-new-terms by the [terms-snapshot fingerprint](failure-modes.md). |
| `10` | `transfer_subscription` | Plan owner **or** whitelisted puller (≤4) | The pull. Runs the full [gate chain](../concepts/authorization-model.md); caller pays the ~5,000-lamport fee. |
| `11` | `subscribe` | **Subscriber** | Creates the SubscriptionDelegation PDA with a snapshot of the plan's live terms. The subscriber's single recurring-consent signature. |
| `12` | `cancel_subscription` | **Subscriber** | Pulls are refused from this point. Account survives (resumable). |
| `13` | `resume_subscription` | **Subscriber** | Reactivates a cancelled subscription. |

## ADR-001 direct-delegation set

These predate/underpin the plan layer and serve bilateral fixed and recurring allowances. The digest of program sources lists the set without their discriminator values, so they're omitted here rather than guessed — read them from the IDL in the [program repo](https://github.com/solana-program/subscriptions).

| Instruction | Signer | Notes |
|---|---|---|
| `initSubscriptionAuthority` | Delegator | Once per (user, mint): establishes the SA PDA (`["SubscriptionAuthority", user, tokenMint]` — literal CamelCase seed) as token-account delegate with the `u64::MAX` approval. |
| `closeSubscriptionAuthority` | Delegator | Tears the SA PDA down; reclaims rent. |
| `createFixedDelegation` | Delegator | Cumulative cap + optional expiry. [Guide →](../guides/fixed-allowances.md) |
| `createRecurringDelegation` | Delegator | Per-period cap (resets, no carry-over), period in **seconds** (`periodLengthS` — sub-hourly is legal; the hours `1..8760` constraint is plans-only), overall expiry. [Guide →](../guides/recurring-delegations.md) |
| `transferFixed` | Authorized counterparty | Pull against a fixed delegation; program validates caller + cumulative cap + expiry. |
| `transferRecurring` | Authorized counterparty | Pull against a recurring delegation; program applies lazy period rollover, then validates cap. |
| `revokeDelegation` | Delegator | Immediate kill switch for either delegation type. |

"Authorized counterparty" for the two transfer instructions means the key(s) the delegation authorizes to pull. [VERIFY: the exact caller-authorization rule for `transferFixed`/`transferRecurring` against the program source/IDL — see the same flag in the Recurring Delegations guide.]

## What's mutable vs. immutable

The asymmetry is the security model, so it's worth a table of its own:

| State | Mutability | By whom |
|---|---|---|
| Plan `amount`, `period`, `mint` | **Immutable forever** | — |
| Plan `destinations` allowlist | **Immutable forever** — treasury rotation requires plan sunset + re-subscribe | — |
| Plan `status`, `end_ts`, `metadata_uri` | Updatable (`update_plan`) | Merchant |
| Plan `pullers` (≤4) | Updatable (`update_plan`) | Merchant |
| Subscription terms snapshot | **Immutable** — written once at `subscribe` | — |
| Subscription period counters (`amount_pulled_in_period`, `current_period_start_ts`) | Program-updated, only during transfers (lazy rollover) | Program |
| Subscription active/cancelled state | `cancel_subscription` / `resume_subscription` | Subscriber |
| Fixed/recurring delegation terms | No in-place edit — revoke & recreate | Delegator |

!!! note "Reading the table defensively"
    If an integration plan ever requires editing something in the left column's "immutable" rows, the plan is wrong — redesign around plan sunset/re-subscribe or revoke/recreate before writing code.

**Recap:** discriminators 7–13 cover the plan lifecycle; the ADR-001 set covers bilateral delegations (discriminators in the IDL). Owners of money sign setup/cancel/revoke; counterparties sign pulls; merchants can never reach the core billing terms after creation.

---

*Sources for every claim on this page: [About → Sources](../about.md#sources).*
