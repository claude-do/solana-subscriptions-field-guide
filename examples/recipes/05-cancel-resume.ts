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
