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
