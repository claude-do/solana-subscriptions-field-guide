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
