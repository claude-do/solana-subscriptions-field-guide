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
