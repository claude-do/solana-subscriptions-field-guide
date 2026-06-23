/**
 * puller-kit/pull-worker.ts
 * =========================================================================
 * Reference implementation — compile-checked, not production-hardened;
 * the program validates, YOU schedule.
 * =========================================================================
 *
 * The subscriptions program has NO on-chain scheduler, crank, or keeper.
 * It will happily validate a pull whenever one arrives — but nothing ever
 * arrives unless a merchant-side process submits it. This file is that
 * missing layer, in its smallest honest form:
 *
 *   1. POLL    — enumerate this plan's subscription delegations on-chain.
 *   2. DECIDE  — compute which are due, respecting the program's LAZY
 *                period rollover (the on-chain per-period counter resets
 *                only when the next pull lands in a new period; the worker
 *                must do the same arithmetic off-chain to know what's due).
 *   3. PULL    — submit transfer_subscription with bounded retries, and
 *                classify failures: retryable RPC noise vs terminal
 *                program rejections (cancelled, terms mismatch, caps).
 *   4. REPORT  — emit a receipt event per attempt to registered hooks,
 *                plus structured JSON logs throughout.
 *
 * Run with: RPC_URL, KEYPAIR_PATH, MERCHANT, PLAN_ID set in the env.
 * Shut down with SIGINT/SIGTERM — in-flight pulls finish first.
 */
import {
    address,
    createClient,
    isSolanaError,
    SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
    type Address,
    type Signature,
} from '@solana/kit';
import { solanaMainnetRpc } from '@solana/kit-plugin-rpc';
import { signerFromFile } from '@solana/kit-plugin-signer';
import {
    fetchDelegationsByDelegatee,
    fetchPlanFromSeeds,
    findSubscriptionDelegationPda,
    getSubscriptionsErrorMessage,
    subscriptionsProgram,
    SUBSCRIPTIONS_ERROR__AMOUNT_EXCEEDS_PERIOD_LIMIT,
    SUBSCRIPTIONS_ERROR__PERIOD_NOT_ELAPSED,
    ZERO_ADDRESS,
    type SubscriptionDelegation,
    type SubscriptionsError,
} from '@solana/subscriptions';
import { TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';

// ----------------------------------------------------------------- config

const RPC_URL = process.env.RPC_URL ?? 'https://api.mainnet-beta.solana.com';
const KEYPAIR_PATH = process.env.KEYPAIR_PATH ?? '/path/to/puller-keypair.json';
const MERCHANT = address(process.env.MERCHANT ?? '11111111111111111111111111111111');
const PLAN_ID = BigInt(process.env.PLAN_ID ?? '1');
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 60_000);
const MAX_ATTEMPTS = 4;

// ------------------------------------------------------- structured logging

function log(level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}): void {
    // One JSON object per line — trivially shippable to any log pipeline.
    // BigInt/Address values are stringified so JSON.stringify never throws.
    const entry = { ts: new Date().toISOString(), level, event, ...fields };
    console.log(JSON.stringify(entry, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)));
}

// ------------------------------------------------------ receipt event hooks

/** Emitted once per pull attempt — wire billing/webhooks/metrics here. */
export type PullReceipt = {
    plan: Address;
    subscriber: Address;
    amount: bigint;
    outcome: 'success' | 'retryable-exhausted' | 'terminal' | 'not-due';
    signature?: Signature;
    errorCode?: number;
    errorMessage?: string;
};

type ReceiptHook = (receipt: PullReceipt) => void | Promise<void>;
const receiptHooks: ReceiptHook[] = [];

export function onReceipt(hook: ReceiptHook): void {
    receiptHooks.push(hook);
}

async function emitReceipt(receipt: PullReceipt): Promise<void> {
    for (const hook of receiptHooks) {
        try {
            await hook(receipt);
        } catch (error) {
            // A broken hook must never take the billing loop down.
            log('error', 'receipt-hook-failed', { error: String(error) });
        }
    }
}

// Default hook: just log. Replace/add your own via onReceipt().
onReceipt((r) => log('info', 'receipt', { ...r }));

// ------------------------------------------------------ error classification
// Mirrors the guide's failure-modes page: a custom program error code means
// the PROGRAM rejected us — retrying changes nothing. No program code means
// the transaction never executed (RPC failure, expired blockhash, timeout)
// — safe to retry. PERIOD_NOT_ELAPSED / AMOUNT_EXCEEDS_PERIOD_LIMIT are the
// benign "already settled, come back next period" pair.

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
    | { kind: 'not-due'; code: number }
    | { kind: 'terminal'; code: number; message: string };

function classify(error: unknown): Classification {
    const code = programErrorCode(error);
    if (code === undefined) return { kind: 'retryable', reason: String(error) };
    if (code === SUBSCRIPTIONS_ERROR__PERIOD_NOT_ELAPSED || code === SUBSCRIPTIONS_ERROR__AMOUNT_EXCEEDS_PERIOD_LIMIT) {
        return { kind: 'not-due', code };
    }
    return { kind: 'terminal', code, message: getSubscriptionsErrorMessage(code as SubscriptionsError) };
}

// ----------------------------------------------------------- due-ness logic
// SubscriptionDelegation tracks { currentPeriodStartTs, amountPulledInPeriod,
// terms: { amount, periodHours }, expiresAtTs }. Rollover is LAZY: the chain
// only advances currentPeriodStartTs when a pull lands in a later period.
// So "due" means: a newer period has begun (full amount claimable), or the
// current period still has unclaimed allowance.

function amountDue(sub: SubscriptionDelegation, nowTs: bigint): bigint {
    // expiresAtTs != 0 means the subscription was cancelled; after the grace
    // timestamp passes, pulls are rejected — don't bother submitting.
    if (sub.expiresAtTs !== 0n && nowTs >= sub.expiresAtTs) return 0n;

    const periodSeconds = sub.terms.periodHours * 3600n;
    if (periodSeconds === 0n) return 0n; // defensive; the program forbids this
    const periodsElapsed = (nowTs - sub.currentPeriodStartTs) / periodSeconds;

    if (periodsElapsed >= 1n) {
        // A new period has started. The on-chain counter will reset when our
        // pull lands, so the full period amount is claimable.
        return sub.terms.amount;
    }
    // Same period: claim whatever the cap still allows (0 if already pulled).
    // Clamp to non-negative — decoded state should never exceed the cap, but
    // billing code must never emit a negative "due" amount if it somehow does.
    return sub.amountPulledInPeriod >= sub.terms.amount
        ? 0n
        : sub.terms.amount - sub.amountPulledInPeriod;
}

// ------------------------------------------------------------------- client

const client = await createClient()
    .use(signerFromFile(KEYPAIR_PATH))
    .use(solanaMainnetRpc({ rpcUrl: RPC_URL }))
    .use(subscriptionsProgram());

// Resolve the plan once at startup: PDA, terms, and payout destination.
const plan = await fetchPlanFromSeeds(client.rpc, { owner: MERCHANT, planId: PLAN_ID });
const PLAN_PDA = plan.address;
const MINT = plan.data.data.mint;
// Destinations are token accounts, zero-address padded to 4 — take the first
// real one. A production worker might rotate or split across them.
const receiverCandidate = plan.data.data.destinations.find((d) => d !== ZERO_ADDRESS);
if (!receiverCandidate) throw new Error('plan has no destinations — nothing to pull into');
const RECEIVER_ATA: Address = receiverCandidate;

log('info', 'worker-start', { plan: PLAN_PDA, mint: MINT, receiver: RECEIVER_ATA, pollMs: POLL_INTERVAL_MS });

// ------------------------------------------------------------- enumeration
// The SDK has no "subscriptions for plan" query, only by-wallet lookups.
// For subscription delegations the on-chain `delegatee` is the plan owner,
// so fetchDelegationsByDelegatee(merchant) finds every subscription across
// ALL the merchant's plans; we then keep the ones whose PDA matches OUR
// plan — the PDA check (["subscription", plan, subscriber]) is authoritative.

async function subscriptionsForPlan(): Promise<Array<{ address: Address; data: SubscriptionDelegation }>> {
    const delegations = await fetchDelegationsByDelegatee(client.rpc, MERCHANT);
    const matches: Array<{ address: Address; data: SubscriptionDelegation }> = [];
    for (const d of delegations) {
        if (d.kind !== 'subscription') continue;
        const [expectedPda] = await findSubscriptionDelegationPda({
            planPda: PLAN_PDA,
            subscriber: d.data.header.delegator,
        });
        if (expectedPda === d.address) matches.push({ address: d.address, data: d.data });
    }
    return matches;
}

// ------------------------------------------------------------- pull + retry

async function pullOne(subscriptionPda: Address, subscriber: Address, amount: bigint): Promise<void> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const result = await client.subscriptions.instructions
                .transferSubscription({
                    amount,
                    delegator: subscriber,
                    planPda: PLAN_PDA,
                    subscriptionPda,
                    receiverAta: RECEIVER_ATA,
                    tokenMint: MINT,
                    // This reference assumes a plain SPL-Token mint (USDC and most
                    // stablecoins). If your plan's mint is a Token-2022 mint, swap in
                    // TOKEN_2022_PROGRAM_ADDRESS — and note the program rejects mints
                    // using several Token-2022 extensions (see the token-compat table).
                    tokenProgram: TOKEN_PROGRAM_ADDRESS,
                })
                .sendTransaction();
            const signature = result.context.signature;
            log('info', 'pull-success', { subscriber, amount, signature, attempt });
            await emitReceipt({ plan: PLAN_PDA, subscriber, amount, outcome: 'success', signature });
            return;
        } catch (error) {
            const verdict = classify(error);
            if (verdict.kind === 'retryable') {
                // A "retryable" failure means we never saw a program rejection — but a
                // send can time out *after* the transaction actually landed. Your money
                // is safe (the on-chain per-period cap rejects the duplicate as
                // not-due), but for clean reconciliation a production puller should
                // confirm the signature's status before recording a final outcome.
                log('warn', 'pull-retryable', { subscriber, attempt, reason: verdict.reason });
                if (attempt < MAX_ATTEMPTS) {
                    await sleep(1_000 * 2 ** (attempt - 1)); // exponential backoff
                    continue;
                }
                await emitReceipt({ plan: PLAN_PDA, subscriber, amount, outcome: 'retryable-exhausted', errorMessage: verdict.reason });
                return; // next poll cycle will try again from scratch
            }
            if (verdict.kind === 'not-due') {
                // Our off-chain arithmetic raced another puller, or clock skew.
                // The chain is the referee; accept its answer and move on.
                log('info', 'pull-not-due', { subscriber, code: verdict.code });
                await emitReceipt({ plan: PLAN_PDA, subscriber, amount, outcome: 'not-due', errorCode: verdict.code });
                return;
            }
            // Terminal: cancelled, terms mismatch, unauthorized, sunset...
            // Mark it and DON'T retry — this is where dunning/notification
            // logic belongs in a real billing system.
            log('error', 'pull-terminal', { subscriber, code: verdict.code, message: verdict.message });
            await emitReceipt({ plan: PLAN_PDA, subscriber, amount, outcome: 'terminal', errorCode: verdict.code, errorMessage: verdict.message });
            return;
        }
    }
}

// ---------------------------------------------------------------- main loop

let shuttingDown = false;
function requestShutdown(signal: string): void {
    log('info', 'shutdown-requested', { signal });
    shuttingDown = true; // loop exits after the in-flight cycle completes
}
process.on('SIGINT', () => requestShutdown('SIGINT'));
process.on('SIGTERM', () => requestShutdown('SIGTERM'));

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

while (!shuttingDown) {
    try {
        const subs = await subscriptionsForPlan();
        const nowTs = BigInt(Math.floor(Date.now() / 1000));
        const due = subs
            .map((s) => ({ ...s, amount: amountDue(s.data, nowTs) }))
            .filter((s) => s.amount > 0n);
        log('info', 'poll-cycle', { total: subs.length, due: due.length });

        // Sequential on purpose: one signer, simple nonce-less flow, and the
        // puller pays each fee — parallelize only once you need the volume.
        for (const sub of due) {
            if (shuttingDown) break;
            await pullOne(sub.address, sub.data.header.delegator, sub.amount);
        }
    } catch (error) {
        // Enumeration/RPC failures: log and let the next cycle retry.
        log('error', 'poll-cycle-failed', { error: String(error) });
    }
    if (!shuttingDown) await sleep(POLL_INTERVAL_MS);
}

log('info', 'worker-stopped', {});
