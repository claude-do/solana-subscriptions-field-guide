# Token Compatibility

**BLUF:** SPL Token ✓. Token-2022 — **only with a restricted extension set**: the SDK ships a dedicated rejection error for each disallowed mint extension — confidential transfer, non-transferable, permanent delegate, transfer hook, transfer fee, mint close authority, and pausable (`SUBSCRIPTIONS_ERROR__MINT_HAS_*`, codes 118–124). Native SOL ✗ — token accounts only; wrap to wSOL. The sleeper implication: compliance-oriented tokens are typically built *on* these extensions (hooks, fees, permanent delegates), so "regulated asset subscriptions" may be exactly the use case this matrix rules out.

## The matrix

| Token type | Supported? | Notes |
|---|---|---|
| **SPL Token (classic)** | ✓ | The baseline path; transfers execute via CPI signed by the SubscriptionAuthority PDA. |
| **Token-2022 (no disallowed extensions)** | ✓ | Supported via CPI like classic SPL — provided the mint carries none of the extensions below. |
| **Token-2022 + confidential transfer** | ✗ | Rejected — `MINT_HAS_CONFIDENTIAL_TRANSFER` (error 118). See the discrepancy note below: some coverage claims this works; the SDK error table says otherwise. |
| **Token-2022 + non-transferable** | ✗ | Rejected — `MINT_HAS_NON_TRANSFERABLE` (error 119). (Unsurprising: a non-transferable token can't be pulled.) |
| **Token-2022 + permanent delegate** | ✗ | Rejected — `MINT_HAS_PERMANENT_DELEGATE` (error 120). |
| **Token-2022 + transfer hook (configured)** | ✗ | Rejected — `MINT_HAS_TRANSFER_HOOK` (error 121). Program-level docs describe the rejection as applying to *configured* hooks (a present-but-inert hook passing); the SDK constant itself doesn't encode that nuance, so treat any hooked mint as suspect until you've tested it. |
| **Token-2022 + transfer fee** | ✗ | Rejected — `MINT_HAS_TRANSFER_FEE` (error 122). |
| **Token-2022 + mint close authority** | ✗ | Rejected — `MINT_HAS_MINT_CLOSE_AUTHORITY` (error 123). |
| **Token-2022 + pausable** | ✗ | Rejected — `MINT_HAS_PAUSABLE` (error 124). |
| **Native SOL** | ✗ | The program operates on token accounts only. Wrap into **wSOL** and delegate the wSOL token account instead. |

!!! note "Where this table comes from — and a discrepancy worth knowing"
    The rejection list above is read directly from the SDK's error constants (`@solana/subscriptions@0.3.0`, `SUBSCRIPTIONS_ERROR__MINT_HAS_*` = 118–124, with message strings like "Mint has ConfidentialTransfer extension"). That matters because some official-docs and press phrasing says Token-2022 is supported "including confidential transfers" — which conflicts with error 118 existing at all. The constants are Codama-generated from the program's IDL, so this guide sides with the SDK: if the program couldn't reject a confidential-transfer mint, it wouldn't ship an error for it. If you have evidence the deployed program behaves differently, test on devnet and trust the chain.

## Why extension-bearing mints are out

Each rejected extension injects behavior into the transfer path that the program can't bound: a configured TransferHook CPIs into arbitrary third-party code that can veto or act on the transfer; transfer fees make the received amount diverge from the pulled amount, breaking cap accounting; a permanent delegate is a second spending authority the subscriber never granted; pausable and mint-close-authority let the issuer brick the billing rail out from under existing delegations; confidential transfer hides the amounts the program's caps are supposed to validate. Rather than special-case each one, the program rejects the mint up front — there is no override flag.

!!! warning "The compliance-token implication, spelled out"
    Transfer hooks, transfer fees, and permanent delegates are the canonical Token-2022 mechanisms for **compliance logic** — allowlist enforcement, KYC gating, jurisdiction checks on permissioned/regulated assets. Which means: **tokens that express compliance through Token-2022 extensions cannot be billed through this program.** If your roadmap says "subscription billing in a permissioned institutional stablecoin" or "regulated security-token revenue shares," check that mint's extension set *first* — before designing plans, before pitching the integration. Any extension on the 118–124 list is a hard ✗. Your options are: use a plain settlement token and handle compliance off-chain, or wait for/lobby a future program version with vetted-extension support.

## Practical pre-flight checks

Recommendations for integrators:

1. **Inspect the mint before `create_plan`.** Read the mint's extension data: classic SPL → fine; Token-2022 → enumerate extensions and check against the rejection list (confidential transfer, non-transferable, permanent delegate, transfer hook, transfer fee, mint close authority, pausable). Bake this check into your plan-creation tooling so a bad mint fails in CI, not in production — and map the on-chain failures to the SDK's error codes 118–124 in your error handling.
2. **For SOL-priced products,** decide who bears the wrapping UX: either you quote in wSOL and the subscriber wraps once, or you quote in a stablecoin and sidestep it. Most billing use cases want a stablecoin anyway — price stability across a 720-hour period matters more than SOL purity.
3. **Mint is immutable in the plan.** Like destinations, the plan's `mint` is frozen at creation. A token migration (e.g., your stablecoin of choice deprecates) means plan sunset + re-subscribe, so prefer boring, long-lived mints.

**Recap:** classic SPL works; Token-2022 works only when the mint carries none of the seven rejected extensions (SDK errors 118–124 — confidential transfer included, whatever older coverage says); native SOL needs wrapping. Check the mint's extensions before you build — and if your token does compliance via extensions, this program can't bill it today.

---

*Sources for every claim on this page: [About → Sources](../about.md#sources). Rejection list verified against the `@solana/subscriptions@0.3.0` SDK error constants.*
