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
