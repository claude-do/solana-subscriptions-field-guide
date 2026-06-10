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
