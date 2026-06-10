# Merchant Quickstart (Plans)

**BLUF:** Four steps take you from zero to collecting a subscription payment: install the TS SDK, `createPlan`, have the user `subscribe`, then pull with `transferSubscription`. The two mistakes everyone makes on day one: passing human-readable amounts instead of **base units**, and forgetting that the **program never pulls for you** — step 4 is your infrastructure's job, forever.

## 0. Install

```bash
pnpm add @solana/subscriptions @solana/kit @solana/kit-plugin-rpc @solana/kit-plugin-signer @solana-program/token
```

The TS SDK is built on `@solana/kit`. A Rust SDK also exists (`subscriptions = "^0.1"`, Codama-generated) — note its `SubscribeBuilder` requires you to pre-fetch the plan terms yourself, which the TS SDK does automatically (more on that below). There is **no dedicated CLI**; for local development the repo ([github.com/solana-program/subscriptions](https://github.com/solana-program/subscriptions)) ships a `justfile` and uses Surfpool, and a devnet demo lives at `solana-subscriptions-program.vercel.app`.

## 1. Create the plan (merchant signs)

```ts
merchantClient.subscriptions.instructions.createPlan({
  planId,
  mint,
  amount,
  periodHours,
  endTs: 0n,
  destinations,
  pullers,
  metadataUri,
}).sendTransaction();
```

Field notes:

- `amount` — per-period billing amount, in **base units** (see the gotcha below).
- `periodHours` — whole hours, `1..8760`. A monthly-ish plan is `720`; weekly is `168`. There's no finer granularity.
- `endTs: 0n` — open-ended plan. A nonzero value hard-stops all pulls after that timestamp.
- `destinations` — the allowlist of token accounts that pulls may land in. **Immutable after creation.** Choose treasury accounts you can live with; rotating them later means sunsetting this plan and migrating subscribers to a new one.
- `pullers` — up to **4** keys allowed to trigger pulls besides you. Unlike destinations, this list *is* updatable later via `update_plan`.
- `metadataUri` — updatable; point it at your plan's display metadata.

!!! danger "The base-units gotcha"
    `amount` is denominated in the mint's **base units**, not display units. For a 6-decimal mint, "$5.00" is `5_000_000n`. Pass `5` and you've created a plan that bills five *millionths* of a token — it will work perfectly, validate perfectly, and earn you nothing. Multiply by `10^decimals` and write a test that asserts the on-chain plan amount against your pricing table.

**What exists on-chain after this step:** one **Plan PDA** at `["plan", owner, plan_id_le]` (491 bytes — `PLAN_SIZE` in the SDK), holding your immutable terms (`amount`, `period`, `mint`, `destinations`) plus the updatable fields (`status`, `end_ts`, `pullers`, `metadata_uri`). Nothing has touched any user's wallet yet.

## 2. The user subscribes (subscriber signs)

```ts
subscribe({ merchant, planId, tokenMint });
```

This is the **only signature the subscriber provides for the entire life of the subscription** (until they cancel or resume). One UX consequence: put everything they're agreeing to — amount, period, destinations — in front of them at this moment, because there is no per-charge confirmation later.

!!! note "TS SDK auto-fetches live plan terms"
    On `subscribe`, the TS SDK fetches the plan's current on-chain terms and bakes them into the subscription as the snapshot. You don't pass `amount`/`period` here — the SDK reads them from the live plan. (The Rust `SubscribeBuilder` makes you pre-fetch terms explicitly; same result, manual step.) This snapshot is what later powers the `PlanTermsMismatch` [ghost-account defense](../reference/failure-modes.md).

**What exists on-chain after this step:**

- A **SubscriptionDelegation PDA** at `["subscription", plan_pda, subscriber]` (155 bytes) — containing the terms snapshot, `amount_pulled_in_period = 0`, the period-start timestamp, and `expires_at_ts` (`0` = active).
- The subscriber's **SubscriptionAuthority PDA** (`["SubscriptionAuthority", user, tokenMint]` — literal CamelCase seed, derived per (user, mint)) set as the delegate on their token account for that mint with a `u64::MAX` approval — the setup the subscriber's signature authorizes. If that number alarms you, read [the honest explanation](../concepts/authorization-model.md#the-u64max-approval-paradox-explained-honestly) before your users ask.

A `Created` event is emitted — your backend should provision access now (see [Events](../reference/events.md)).

## 3. Pull the payment (merchant or puller signs)

```ts
transferSubscription({
  caller,
  delegator,
  tokenMint,
  subscriptionPda,
  planPda,
  amount,
  receiverAta,
  tokenProgram,
});
```

- `caller` — must be the plan owner or one of the ≤4 whitelisted pullers; anyone else is rejected.
- `receiverAta` — must be on the plan's destination allowlist.
- `amount` — base units again; the program checks it against the period cap from the *subscriber's snapshot*.
- The caller signs and pays the ~5,000-lamport transaction fee. That's your cost of collection, per pull, forever.

On success the program updates the subscription's period counters, executes the token CPI signed by the SubscriptionAuthority PDA, and emits a `SubscriptionTransferEvent` via self-CPI. **What changed on-chain:** subscriber's token balance down, your destination ATA up, `amount_pulled_in_period` up (or reset-then-up if a period boundary passed — rollover is lazy, evaluated inside this very instruction).

## 4. Keep pulling — that part is on you

There is no scheduler, no crank, no protocol-level billing day. Step 3 must be re-executed every period by infrastructure **you** run. This is the single most underestimated part of integrating this program, and it gets its own page: [Running a Puller](running-a-puller.md).

Also wire up the lifecycle edges before launch:

- **Cancellations** — subscriber signs `cancel_subscription`; your pulls start failing immediately. Handle it gracefully ([Events](../reference/events.md), [Failure Modes](../reference/failure-modes.md)).
- **Transfers/resumes** — `resume_subscription` reactivates a cancelled subscription (subscriber signs).
- **Plan retirement** — `update_plan` to set status/`end_ts`, or `delete_plan` to remove it entirely.

**Recap:** install → `createPlan` (immutable terms — measure twice) → user's single `subscribe` signature (SDK snapshots live terms) → `transferSubscription` per period, triggered by you, paid by you, validated by the program. Base units everywhere.

---

*Sources for every claim on this page: [About → Sources](../about.md#sources).*
