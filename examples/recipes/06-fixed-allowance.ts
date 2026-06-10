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
