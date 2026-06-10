# Cookbook

**BLUF:** Eight self-contained, copy-paste recipes covering the full integrator surface: client bootstrap, plan lifecycle, subscribing, pulling with retry discipline, allowances, payroll delegations, and PDA derivation. Every snippet is a real file from this guide's [`examples/`](https://github.com/claude-do/solana-subscriptions-field-guide/tree/main/examples) project and compiles against the real SDK.

!!! success "Validation stamp"
    Every snippet on this page typechecks against **`@solana/subscriptions@0.3.0`** (validated 2026-06-09, `tsc --noEmit` in strict mode with `@solana/kit@6.9.0`, `@solana/kit-plugin-rpc@0.11.1`, `@solana/kit-plugin-signer@0.10.0`, `@solana-program/token@0.13.0`, TypeScript 6.0.3). Snippets are **compile-checked, not mainnet-executed** — they prove the API shapes are real, not that your RPC, balances, or addresses are.

Conventions used throughout: USDC mainnet mint as the example token, `11111111111111111111111111111111` as an obvious replace-me placeholder address, and amounts always in **base units**.

## 1. Bootstrap a client (RPC + signer plugins)

Everything else on this page starts from this client. The SDK is a [`@solana/kit`](https://github.com/anza-xyz/kit) plugin: compose a signer, an RPC connection, and `subscriptionsProgram()` — in that order, because the RPC plugin wants a fee payer and the subscriptions plugin wants both.

```ts
/**
 * Recipe 1 — Bootstrap a client (RPC + signer plugins).
 *
 * The SDK ships as a `@solana/kit` plugin. You compose a client from three
 * plugins: a signer (identity + fee payer), an RPC connection (with
 * transaction planning/sending), and the subscriptions program itself.
 * Plugin order matters: the RPC plugin requires a payer, so the signer
 * plugin must come first.
 */
import { createClient } from '@solana/kit';
import { solanaMainnetRpc } from '@solana/kit-plugin-rpc';
import { signerFromFile } from '@solana/kit-plugin-signer';
import { subscriptionsProgram } from '@solana/subscriptions';

const client = await createClient()
    // Loads a keypair JSON (solana-keygen format) and registers it as both
    // `client.identity` and `client.payer`.
    .use(signerFromFile('/path/to/keypair.json'))
    // RPC + websocket subscriptions + transaction planner/executor.
    // Use solanaDevnetRpc() / solanaLocalRpc() for other clusters.
    .use(solanaMainnetRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
    // Adds `client.subscriptions.{instructions,queries,accounts,pdas}`.
    .use(subscriptionsProgram());

// The client is now fully wired. Every instruction builder under
// `client.subscriptions.instructions.*` returns a thenable that also exposes
// `.sendTransaction()`, which plans, signs, and sends in one call.
console.log('wallet:', client.identity.address);

export { client };
```

## 2. Create a subscription plan (merchant)

One transaction publishes your billing terms as a Plan PDA. Remember: `amount`/`periodHours`/`mint`/`destinations` are **immutable** after this; `status`/`endTs`/`pullers`/`metadataUri` are not. And `amount` is **base units** — the classic day-one mistake (see the [Merchant Quickstart](guides/merchant-quickstart.md) for the full gotcha).

```ts
/**
 * Recipe 2 — Create a subscription plan (merchant).
 *
 * One transaction publishes a Plan PDA holding your billing terms.
 * Core terms (`amount`, `periodHours`, `mint`, `destinations`) are IMMUTABLE
 * after creation — only `status`, `endTs`, `pullers`, and `metadataUri` can
 * change later via update_plan. Choose destinations carefully.
 */
import { address, createClient } from '@solana/kit';
import { solanaMainnetRpc } from '@solana/kit-plugin-rpc';
import { signerFromFile } from '@solana/kit-plugin-signer';
import { subscriptionsProgram } from '@solana/subscriptions';

const client = await createClient()
    .use(signerFromFile('/path/to/merchant-keypair.json'))
    .use(solanaMainnetRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
    .use(subscriptionsProgram());

const USDC_MINT = address('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// Destinations are TOKEN ACCOUNTS (e.g. your treasury ATA), max 4, immutable.
const treasuryAta = address('11111111111111111111111111111111'); // <- your treasury USDC ATA
// Pullers are WALLETS allowed to trigger pulls besides you, max 4, updatable.
const billingService = address('11111111111111111111111111111111'); // <- your billing service key

const planId = 1n; // u64, unique per merchant — part of the plan PDA seeds.

const result = await client.subscriptions.instructions
    .createPlan({
        planId,
        mint: USDC_MINT,
        amount: 9_990_000n, // 9.99 USDC — base units (USDC has 6 decimals).
        periodHours: 720n, // 30 days. Plans bill in HOURS (1..8760).
        endTs: 0n, // 0 = open-ended; otherwise unix seconds.
        destinations: [treasuryAta],
        pullers: [billingService],
        metadataUri: 'https://example.com/plans/pro.json', // max 128 bytes
    })
    .sendTransaction();

// Derive the plan PDA — share this (or merchant + planId) with subscribers.
const [planPda] = await client.subscriptions.pdas.plan({
    owner: client.identity.address,
    planId,
});

console.log('plan created:', planPda, 'sig:', result.context.signature);
```

## 3. Subscribe a user to a plan

Two subscriber-signed steps: ensure the per-`(user, mint)` SubscriptionAuthority exists, then `subscribe`. The plugin fetches the live plan terms over RPC and snapshots them into the instruction — the foundation of the [ghost-plan defense](reference/failure-modes.md).

```ts
/**
 * Recipe 3 — Subscribe a user to a plan.
 *
 * Two steps, both signed by the subscriber:
 *   1. Ensure the SubscriptionAuthority PDA exists for (user, mint) — the
 *      once-per-mint delegate that all delegations route through.
 *   2. Subscribe. The plugin fetches the LIVE plan terms over RPC and bakes
 *      them into the instruction, so the user consents to exactly what's
 *      on-chain (the program rejects the pull later if the plan's terms
 *      fingerprint ever stops matching — the "ghost plan" defense).
 */
import { address, createClient } from '@solana/kit';
import { solanaMainnetRpc } from '@solana/kit-plugin-rpc';
import { signerFromFile } from '@solana/kit-plugin-signer';
import { subscriptionsProgram } from '@solana/subscriptions';
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';

const client = await createClient()
    .use(signerFromFile('/path/to/subscriber-keypair.json'))
    .use(solanaMainnetRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
    .use(subscriptionsProgram());

const USDC_MINT = address('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const MERCHANT = address('11111111111111111111111111111111'); // <- plan owner
const PLAN_ID = 1n;

// Step 1 — init the SubscriptionAuthority if this wallet has never used
// the program with this mint before. Idempotent guard via the query helper.
const { initialized } = await client.subscriptions.queries.isSubscriptionAuthorityInitialized(
    client.identity.address,
    USDC_MINT,
);

if (!initialized) {
    const [userAta] = await findAssociatedTokenPda({
        owner: client.identity.address,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });

    await client.subscriptions.instructions
        .initSubscriptionAuthority({
            tokenMint: USDC_MINT,
            userAta,
            tokenProgram: TOKEN_PROGRAM_ADDRESS,
        })
        .sendTransaction();
}

// Step 2 — subscribe. Wallet UIs will show a u64::MAX approval on the ATA;
// actual spending is capped per-period by the program.
const result = await client.subscriptions.instructions
    .subscribe({
        merchant: MERCHANT,
        planId: PLAN_ID,
        tokenMint: USDC_MINT,
    })
    .sendTransaction();

console.log('subscribed, sig:', result.context.signature);
```

## 4. Collect a payment with retry + error classification (pull)

The operational heart of merchant-side billing. The key discipline: a **custom program error code means the program said no** — retrying is wasted fees — while RPC noise (no program code) is safe to retry with backoff. `PERIOD_NOT_ELAPSED` (401) and `AMOUNT_EXCEEDS_PERIOD_LIMIT` (400) are the benign "already settled" pair: reschedule, don't alarm.

```ts
/**
 * Recipe 4 — Collect a payment with retry + error classification (pull).
 *
 * Signed by the plan owner or a whitelisted puller. The caller pays the
 * ~5000-lamport fee. The crucial operational skill is telling RETRYABLE
 * failures (network, blockhash, congestion) apart from TERMINAL program
 * rejections (cancelled subscription, period cap already pulled) — retrying
 * a terminal error just burns fees.
 */
import {
    address,
    createClient,
    isSolanaError,
    SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
} from '@solana/kit';
import { solanaMainnetRpc } from '@solana/kit-plugin-rpc';
import { signerFromFile } from '@solana/kit-plugin-signer';
import {
    getSubscriptionsErrorMessage,
    subscriptionsProgram,
    SUBSCRIPTIONS_ERROR__PERIOD_NOT_ELAPSED,
    SUBSCRIPTIONS_ERROR__AMOUNT_EXCEEDS_PERIOD_LIMIT,
    type SubscriptionsError,
} from '@solana/subscriptions';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';

const client = await createClient()
    .use(signerFromFile('/path/to/puller-keypair.json'))
    .use(solanaMainnetRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
    .use(subscriptionsProgram());

const USDC_MINT = address('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const SUBSCRIBER = address('11111111111111111111111111111111'); // <- the user being billed
const PLAN_PDA = address('11111111111111111111111111111111'); // <- from recipe 2
const SUBSCRIPTION_PDA = address('11111111111111111111111111111111'); // <- ["subscription", plan, subscriber]
const TREASURY_ATA = address('11111111111111111111111111111111'); // <- MUST be in the plan's destinations

/** Walk the error's cause chain looking for a custom program error code. */
function programErrorCode(error: unknown): number | undefined {
    let current: unknown = error;
    while (current instanceof Error) {
        if (isSolanaError(current, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM)) {
            return Number(current.context.code);
        }
        current = current.cause;
    }
    return undefined;
}

type Classification =
    | { kind: 'retryable'; reason: string }
    | { kind: 'wait-next-period'; code: number }
    | { kind: 'terminal'; code: number; message: string };

function classifyPullError(error: unknown): Classification {
    const code = programErrorCode(error);
    if (code === undefined) {
        // No program error code -> the program never rejected us. RPC errors,
        // expired blockhashes, and timeouts are all safe to retry.
        return { kind: 'retryable', reason: String(error) };
    }
    if (
        code === SUBSCRIPTIONS_ERROR__PERIOD_NOT_ELAPSED ||
        code === SUBSCRIPTIONS_ERROR__AMOUNT_EXCEEDS_PERIOD_LIMIT
    ) {
        // Not a failure — this period is already settled. Reschedule.
        return { kind: 'wait-next-period', code };
    }
    // Everything else (cancelled, terms mismatch, unauthorized caller,
    // plan sunset/expired...) will fail identically on retry.
    return {
        kind: 'terminal',
        code,
        message: getSubscriptionsErrorMessage(code as SubscriptionsError),
    };
}

async function pullWithRetry(maxAttempts = 4): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await client.subscriptions.instructions
                .transferSubscription({
                    amount: 9_990_000n, // <= plan amount per period, base units
                    delegator: SUBSCRIBER,
                    planPda: PLAN_PDA,
                    subscriptionPda: SUBSCRIPTION_PDA,
                    receiverAta: TREASURY_ATA,
                    tokenMint: USDC_MINT,
                    tokenProgram: TOKEN_PROGRAM_ADDRESS,
                })
                .sendTransaction();
            console.log('pulled, sig:', result.context.signature);
            return;
        } catch (error) {
            const verdict = classifyPullError(error);
            if (verdict.kind === 'retryable' && attempt < maxAttempts) {
                const backoffMs = 1_000 * 2 ** (attempt - 1);
                console.warn(`attempt ${attempt} failed (${verdict.reason}); retrying in ${backoffMs}ms`);
                await new Promise((resolve) => setTimeout(resolve, backoffMs));
                continue;
            }
            if (verdict.kind === 'wait-next-period') {
                console.log('period already settled — reschedule for next period');
                return;
            }
            throw new Error(
                verdict.kind === 'terminal'
                    ? `terminal program error ${verdict.code}: ${verdict.message}`
                    : `gave up after ${maxAttempts} attempts: ${verdict.reason}`,
            );
        }
    }
}

await pullWithRetry();
```

## 5. Cancel + resume a subscription

Both subscriber-signed, both cheap. Cancel flags the subscription (grace until the period ends); resume flips it back with no re-approval. Revoking the PDA entirely — to reclaim rent — is a separate, permanent step.

```ts
/**
 * Recipe 5 — Cancel + resume a subscription (subscriber side).
 *
 * Cancelling does NOT close the account — it flags the subscription so pulls
 * stop, with a grace window until the end of the current billing period.
 * Before that point the subscriber can resume with one instruction and no
 * re-approval. Both calls are signed by the subscriber and cost only fees.
 */
import { address, createClient } from '@solana/kit';
import { solanaMainnetRpc } from '@solana/kit-plugin-rpc';
import { signerFromFile } from '@solana/kit-plugin-signer';
import { subscriptionsProgram } from '@solana/subscriptions';

const client = await createClient()
    .use(signerFromFile('/path/to/subscriber-keypair.json'))
    .use(solanaMainnetRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
    .use(subscriptionsProgram());

const PLAN_PDA = address('11111111111111111111111111111111'); // <- the plan you subscribed to

// Cancel — the plugin derives the subscription PDA from (plan, identity).
const cancelResult = await client.subscriptions.instructions
    .cancelSubscription({ planPda: PLAN_PDA })
    .sendTransaction();
console.log('cancelled, sig:', cancelResult.context.signature);

// ...user changes their mind within the grace period...

// Resume — flips the subscription back to active. Fails with
// SUBSCRIPTION_NOT_CANCELLED (510) if it was never cancelled.
const resumeResult = await client.subscriptions.instructions
    .resumeSubscription({ planPda: PLAN_PDA })
    .sendTransaction();
console.log('resumed, sig:', resumeResult.context.signature);

// To leave permanently and reclaim the rent instead, revoke the
// subscription PDA after cancelling:
//   await client.subscriptions.instructions
//       .revokeSubscription({ planPda: PLAN_PDA, subscriptionPda })
//       .sendTransaction();
```

## 6. Create a fixed allowance (AI-agent budget) + spend from it

The agentic-payments primitive: a cumulative spending cap with an expiry, granted to a key that is **not** yours. The agent spends with `transferFixed` until the program answers `AMOUNT_EXCEEDS_LIMIT` (300).

```ts
/**
 * Recipe 6 — Create a fixed allowance (AI-agent budget) + spend from it.
 *
 * A fixed delegation is a one-shot, capped allowance: "this agent may spend
 * up to 50 USDC from my wallet until Friday." The cap is CUMULATIVE across
 * any number of pulls; when it's spent (or expired) the delegation is inert.
 * Perfect for giving an AI agent a budget without giving it your keys.
 */
import { address, createClient } from '@solana/kit';
import { solanaMainnetRpc } from '@solana/kit-plugin-rpc';
import { signerFromFile } from '@solana/kit-plugin-signer';
import { subscriptionsProgram } from '@solana/subscriptions';
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';

const USDC_MINT = address('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const AGENT_WALLET = address('11111111111111111111111111111111'); // <- the agent's pubkey

// ---------------------------------------------------------------- user side
const userClient = await createClient()
    .use(signerFromFile('/path/to/user-keypair.json'))
    .use(solanaMainnetRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
    .use(subscriptionsProgram());

// Prerequisite: the SubscriptionAuthority for (user, USDC) must exist —
// see Recipe 3 for the init-if-missing pattern.

const nonce = 0n; // u64 — lets one (user, agent) pair hold several delegations
await userClient.subscriptions.instructions
    .createFixedDelegation({
        tokenMint: USDC_MINT,
        delegatee: AGENT_WALLET,
        nonce,
        amount: 50_000_000n, // 50 USDC total budget, base units
        expiryTs: BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 3600), // 1 week
    })
    .sendTransaction();

const USER_WALLET = userClient.identity.address;

// --------------------------------------------------------------- agent side
const agentClient = await createClient()
    .use(signerFromFile('/path/to/agent-keypair.json'))
    .use(solanaMainnetRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
    .use(subscriptionsProgram());

// The delegation PDA is derived from (subscriptionAuthority, user, agent, nonce).
const [subscriptionAuthority] = await agentClient.subscriptions.pdas.subscriptionAuthority({
    user: USER_WALLET,
    tokenMint: USDC_MINT,
});
const [delegationPda] = await agentClient.subscriptions.pdas.fixedDelegation({
    subscriptionAuthority,
    delegator: USER_WALLET,
    delegatee: AGENT_WALLET,
    nonce,
});

const [userAta] = await findAssociatedTokenPda({
    owner: USER_WALLET,
    mint: USDC_MINT,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
});
const [merchantAta] = await findAssociatedTokenPda({
    owner: address('11111111111111111111111111111111'), // <- whoever the agent is paying
    mint: USDC_MINT,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
});

// Spend 3 USDC of the budget. Repeat until the 50 USDC cap is exhausted —
// then the program answers AMOUNT_EXCEEDS_LIMIT (300).
const result = await agentClient.subscriptions.instructions
    .transferFixed({
        amount: 3_000_000n,
        delegationPda,
        delegator: USER_WALLET,
        delegatorAta: userAta,
        receiverAta: merchantAta,
        tokenMint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
    .sendTransaction();

console.log('agent spent 3 USDC, sig:', result.context.signature);
```

## 7. Create a recurring delegation (payroll) + execute a period pull

Per-period allowance with lazy resets — payroll without a plan. One SDK fact most coverage misses: direct recurring delegations take their period in **seconds** (`periodLengthS`), not hours. Hour granularity is a *plan* constraint, not a program-wide one.

```ts
/**
 * Recipe 7 — Create a recurring delegation (payroll) + execute a period pull.
 *
 * A recurring delegation grants "up to N tokens per period, forever-ish":
 * the per-period counter resets lazily as periods roll over. Unlike plans
 * (hour-granularity), direct recurring delegations take their period in
 * SECONDS (`periodLengthS`) — fine-grained streaming-ish payroll is possible.
 */
import { address, createClient } from '@solana/kit';
import { solanaMainnetRpc } from '@solana/kit-plugin-rpc';
import { signerFromFile } from '@solana/kit-plugin-signer';
import { subscriptionsProgram } from '@solana/subscriptions';
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';

const USDC_MINT = address('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const EMPLOYEE = address('11111111111111111111111111111111'); // <- gets pull rights

// ------------------------------------------------------------ employer side
const employerClient = await createClient()
    .use(signerFromFile('/path/to/employer-keypair.json'))
    .use(solanaMainnetRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
    .use(subscriptionsProgram());

const now = BigInt(Math.floor(Date.now() / 1000));
const nonce = 0n;

await employerClient.subscriptions.instructions
    .createRecurringDelegation({
        tokenMint: USDC_MINT,
        delegatee: EMPLOYEE,
        nonce,
        amountPerPeriod: 2_000_000_000n, // 2,000 USDC per period
        periodLengthS: 14n * 24n * 3600n, // biweekly — note: SECONDS here
        startTs: now, // must not be in the past
        expiryTs: now + 365n * 24n * 3600n, // 1-year contract
    })
    .sendTransaction();

const EMPLOYER = employerClient.identity.address;

// ------------------------------------------------------------ employee side
// Each period, the employee (the delegatee) pulls their own pay.
const employeeClient = await createClient()
    .use(signerFromFile('/path/to/employee-keypair.json'))
    .use(solanaMainnetRpc({ rpcUrl: 'https://api.mainnet-beta.solana.com' }))
    .use(subscriptionsProgram());

const [subscriptionAuthority] = await employeeClient.subscriptions.pdas.subscriptionAuthority({
    user: EMPLOYER,
    tokenMint: USDC_MINT,
});
const [delegationPda] = await employeeClient.subscriptions.pdas.recurringDelegation({
    subscriptionAuthority,
    delegator: EMPLOYER,
    delegatee: EMPLOYEE,
    nonce,
});

const [employerAta] = await findAssociatedTokenPda({
    owner: EMPLOYER,
    mint: USDC_MINT,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
});
const [employeeAta] = await findAssociatedTokenPda({
    owner: EMPLOYEE,
    mint: USDC_MINT,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
});

// Pull this period's pay. Pulling again in the same period beyond the cap
// fails with AMOUNT_EXCEEDS_PERIOD_LIMIT (400); once the next period starts
// the counter resets lazily on the next pull — no crank needed.
const result = await employeeClient.subscriptions.instructions
    .transferRecurring({
        amount: 2_000_000_000n,
        delegationPda,
        delegator: EMPLOYER,
        delegatorAta: employerAta,
        receiverAta: employeeAta,
        tokenMint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
    .sendTransaction();

console.log('payroll pulled, sig:', result.context.signature);
```

## 8. Derive the three PDAs

The SDK exports `find*Pda` helpers for every account — never hand-roll seeds. Note the SubscriptionAuthority seed is the literal CamelCase string `"SubscriptionAuthority"` and includes the **mint**: one authority per `(user, mint)` pair.

```ts
/**
 * Recipe 8 — Derive the three core PDAs.
 *
 * The SDK exports `find*Pda` helpers for every account — use them instead of
 * hand-rolling seeds. Shown standalone here (no client needed); on a plugin
 * client the same helpers live under `client.subscriptions.pdas.*`.
 *
 * Canonical seed strings (exported as constants by the SDK):
 *   SubscriptionAuthority : ["SubscriptionAuthority", user, tokenMint]
 *   Plan                  : ["plan", owner, planId as u64 LE]
 *   SubscriptionDelegation: ["subscription", planPda, subscriber]
 * Note the SubscriptionAuthority seed is the literal CamelCase string
 * "SubscriptionAuthority" — and it includes the MINT, one authority per
 * (user, mint) pair, not per user.
 */
import { address } from '@solana/kit';
import {
    findPlanPda,
    findSubscriptionAuthorityPda,
    findSubscriptionDelegationPda,
    PLAN_SEED,
    SUBSCRIPTION_AUTHORITY_SEED,
    SUBSCRIPTION_SEED,
} from '@solana/subscriptions';

const USDC_MINT = address('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const MERCHANT = address('11111111111111111111111111111111');
const SUBSCRIBER = address('11111111111111111111111111111111');

// 1. SubscriptionAuthority — the per-(user, mint) delegate every pull
//    routes through.
const [subscriptionAuthority, saBump] = await findSubscriptionAuthorityPda({
    user: SUBSCRIBER,
    tokenMint: USDC_MINT,
});

// 2. Plan — the merchant's published offer.
const [planPda, planBump] = await findPlanPda({
    owner: MERCHANT,
    planId: 1n,
});

// 3. SubscriptionDelegation — one per (plan, subscriber) pair.
const [subscriptionPda, subBump] = await findSubscriptionDelegationPda({
    planPda,
    subscriber: SUBSCRIBER,
});

console.log(`["${SUBSCRIPTION_AUTHORITY_SEED}"] ->`, subscriptionAuthority, saBump);
console.log(`["${PLAN_SEED}"]                  ->`, planPda, planBump);
console.log(`["${SUBSCRIPTION_SEED}"]          ->`, subscriptionPda, subBump);
```

**Recap:** one client bootstrap pattern, then every flow is `client.subscriptions.instructions.*(...).sendTransaction()` with the right signer in the right seat: merchant creates and pulls, subscriber approves and cancels, delegatee spends. Compile-checked against the SDK; the chain remains the final referee.

---

*Code on this page lives in [`examples/recipes/`](https://github.com/claude-do/solana-subscriptions-field-guide/tree/main/examples/recipes) — typecheck it yourself with `pnpm install && pnpm exec tsc --noEmit`. Sources for program-behavior claims: [About → Sources](about.md#sources).*
