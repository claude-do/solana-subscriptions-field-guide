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
