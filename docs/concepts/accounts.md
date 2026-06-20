# Accounts & PDAs

**BLUF:** Three program-derived accounts carry all state: the **SubscriptionAuthority** (the program's signing arm over a user's tokens), the **Plan** (a merchant's published offer), and the **SubscriptionDelegation** (one user's binding to one plan, with a snapshot of the terms they agreed to). Get the seeds right and everything else is derivable client-side.

## The three PDAs at a glance

| PDA | Seeds | Size | Created by | Closed by |
|---|---|---|---|---|
| **SubscriptionAuthority** | `["SubscriptionAuthority", user, tokenMint]` | — (signer PDA; see program source) | Delegator, once per (user, mint) (`initSubscriptionAuthority`) | Delegator (`closeSubscriptionAuthority`) |
| **Plan** | `["plan", owner, plan_id_le]` | 491 bytes (`PLAN_SIZE`) | Merchant (`create_plan`) | Merchant (`delete_plan`) |
| **SubscriptionDelegation** | `["subscription", plan_pda, subscriber]` | 155 bytes | Subscriber (`subscribe`) | Subscriber (`cancel_subscription`; see lifecycle notes) |

Note `plan_id_le` — the plan ID is encoded **little-endian** in the seed. Derivation bugs here are a classic first-hour integration failure. And note the SubscriptionAuthority seed string: it is the literal **CamelCase** `"SubscriptionAuthority"` (the SDK exports it as `SUBSCRIPTION_AUTHORITY_SEED`) — the one seed in the program that isn't lowercase. Don't normalize it to `subscription_authority` from habit; the derivation will silently miss.

## How they relate

<div class="cdo-figure">
<svg class="dgm" viewBox="0 0 900 430" role="img" xmlns="http://www.w3.org/2000/svg" aria-label="The three program accounts and how they relate: the SubscriptionAuthority PDA signs token transfers gated by a SubscriptionDelegation PDA, which snapshots the merchant's immutable Plan PDA, whose destinations are fixed.">
<defs>
  <marker id="cdoArr" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#211e1a"/></marker>
  <marker id="cdoArrC" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#c05f3f"/></marker>
  <style>
    .dgm .b{fill:#fafaf7;stroke:#211e1a;stroke-width:2.5}
    .dgm .hub{fill:#fff;stroke:#c05f3f;stroke-width:3}
    .dgm .t{font-family:Inter,system-ui,sans-serif;font-size:15px;font-weight:600;fill:#211e1a}
    .dgm .s{font-family:Inter,system-ui,sans-serif;font-size:12px;fill:#58524a}
    .dgm .sm{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:9.5px;fill:#58524a}
    .dgm .lbl{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10.5px;fill:#c05f3f;letter-spacing:.03em}
    .dgm .ln{stroke:#211e1a;stroke-width:2;fill:none}
    .dgm .lnc{stroke:#c05f3f;stroke-width:2;fill:none}
    .dgm .phase{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;fill:#8b8478;letter-spacing:.12em}
  </style>
</defs>
  <text x="30" y="34" class="phase">USER SIDE</text>
  <text x="660" y="34" class="phase">MERCHANT SIDE</text>
  <rect class="b" x="30" y="58" width="220" height="48" rx="10"/>
  <text x="140" y="87" text-anchor="middle" class="t">User token account</text>
  <rect class="b" x="30" y="166" width="252" height="92" rx="10"/>
  <text x="156" y="190" text-anchor="middle" class="t">SubscriptionAuthority PDA</text>
  <text x="156" y="210" text-anchor="middle" class="sm">["SubscriptionAuthority", user, tokenMint]</text>
  <text x="156" y="230" text-anchor="middle" class="s">one delegate per (user, mint)</text>
  <text x="156" y="248" text-anchor="middle" class="s">pure signer — holds no policy</text>
  <line class="ln" x1="140" y1="106" x2="140" y2="164" marker-end="url(#cdoArr)"/>
  <text x="148" y="140" class="lbl">delegate · approved u64::MAX</text>
  <rect class="b" x="345" y="56" width="200" height="48" rx="10"/>
  <text x="445" y="77" text-anchor="middle" class="t">Pullers (≤4)</text>
  <text x="445" y="95" text-anchor="middle" class="s">whitelisted callers</text>
  <rect class="hub" x="335" y="166" width="240" height="124" rx="10"/>
  <text x="455" y="190" text-anchor="middle" class="t">SubscriptionDelegation PDA</text>
  <text x="455" y="210" text-anchor="middle" class="sm">["subscription", plan_pda, subscriber]</text>
  <text x="455" y="230" text-anchor="middle" class="s">155 bytes</text>
  <text x="455" y="249" text-anchor="middle" class="s">frozen terms snapshot</text>
  <text x="455" y="267" text-anchor="middle" class="s">+ per-period counters</text>
  <line class="ln" x1="445" y1="104" x2="445" y2="164" marker-end="url(#cdoArr)"/>
  <text x="453" y="138" class="lbl">may trigger pulls</text>
  <rect class="b" x="665" y="56" width="205" height="48" rx="10"/>
  <text x="767" y="85" text-anchor="middle" class="t">Merchant owner key</text>
  <rect class="b" x="655" y="166" width="215" height="124" rx="10"/>
  <text x="762" y="190" text-anchor="middle" class="t">Plan PDA</text>
  <text x="762" y="210" text-anchor="middle" class="sm">["plan", owner, plan_id_le]</text>
  <text x="762" y="230" text-anchor="middle" class="s">491 bytes (PLAN_SIZE)</text>
  <text x="762" y="249" text-anchor="middle" class="s">amount · period · mint ·</text>
  <text x="762" y="267" text-anchor="middle" class="s">destinations — immutable</text>
  <line class="ln" x1="767" y1="104" x2="767" y2="164" marker-end="url(#cdoArr)"/>
  <text x="775" y="138" class="lbl">create_plan</text>
  <line class="lnc" x1="284" y1="224" x2="333" y2="224" marker-end="url(#cdoArrC)"/>
  <text x="308" y="214" text-anchor="middle" class="lbl">gated by</text>
  <line class="ln" x1="577" y1="224" x2="653" y2="224" marker-end="url(#cdoArr)"/>
  <text x="615" y="214" text-anchor="middle" class="lbl">snapshots</text>
  <rect class="b" x="655" y="340" width="215" height="48" rx="10"/>
  <text x="762" y="369" text-anchor="middle" class="s">Merchant destination accounts</text>
  <line class="ln" x1="762" y1="290" x2="762" y2="338" marker-end="url(#cdoArr)"/>
  <text x="770" y="318" class="lbl">destinations</text>
</svg>
<p class="cdo-figcaption">SA PDA = who signs · Plan = what was offered · SubscriptionDelegation = what one user agreed to (frozen) plus the live per-period counters.</p>
</div>

## SubscriptionAuthority — the program's signing arm

- Seeds: `["SubscriptionAuthority", user, tokenMint]` — literal CamelCase seed string, derived per **(user, mint)** pair, not per user.
- Becomes the **single token-account delegate** on the user's token account for that mint, approved for `u64::MAX`. (Why that's safe — and why your wallet might disagree — is covered in [The Authorization Model](authorization-model.md).)
- It holds no policy itself. It's a pure signer: every transfer it signs is gated by a Delegation PDA's checks first.
- One delegate slot per SPL token account is the constraint that forces this design — the SA PDA multiplexes many delegations on that mint through that one slot.

## Plan — the merchant's published offer

- Seeds: `["plan", owner, plan_id_le]`; size exactly **491 bytes** (the SDK exports `PLAN_SIZE = 491`: discriminator 1 + owner 32 + bump 1 + status 1 + plan data 456).
- **Immutable after creation:** `amount`, `period`, `mint`, `destinations`. These are the billing terms a subscriber agrees to, and they cannot be edited — ever.
- **Updatable** (via `update_plan`): `status`, `end_ts`, `pullers` (max 4), `metadata_uri`.
- The destination allowlist being immutable has real operational teeth: rotating your treasury means sunsetting the plan and asking subscribers to re-subscribe to a new one. Plan for that before you pick destination accounts.

## SubscriptionDelegation — one user, one plan, terms frozen

The 155-byte layout, as shipped:

| Region | Size | What it holds |
|---|---|---|
| Header | 107 bytes | Account header / identity fields |
| Terms snapshot | 24 bytes | The plan's billing terms as they were **at subscribe time** |
| `amount_pulled_in_period` | `u64` (8) | Running total pulled in the current period |
| `current_period_start_ts` | `i64` (8) | When the current period began (rolled forward lazily, at transfer time) |
| `expires_at_ts` | `i64` (8) | Expiry timestamp; `0` = active |

The **terms snapshot** is the load-bearing field. At every pull, `check_plan_terms()` compares the snapshot (including the plan's `created_at`) against the live plan account. If a merchant deletes a plan and recreates a different one at the same address, the fingerprint won't match and the pull fails with `PlanTermsMismatch` — the [ghost-account defense](../reference/failure-modes.md).

## Lifecycle & rent notes

- All three accounts follow standard Solana rent-exemption semantics: creation requires the rent-exempt deposit; closing an account (`closeSubscriptionAuthority`, `delete_plan`) reclaims it.
- The two counters (`amount_pulled_in_period`, `current_period_start_ts`) are **only updated when a transfer executes** — there is no crank ticking periods forward. A subscription that's never pulled just sits there with stale period state, and rolls forward the next time someone pulls. This matters for [puller scheduling](../guides/running-a-puller.md).
- `expires_at_ts = 0` means active/no expiry; a nonzero value is checked at transfer time like every other gate.
- Cancellation does **not** destroy the SubscriptionDelegation — the existence of `resume_subscription` tells you the account survives a cancel; pulls are simply refused while cancelled.

**Recap:** SA PDA = who signs, Plan = what was offered, SubscriptionDelegation = what one user actually agreed to (frozen) plus the live per-period counters. All state needed to validate a pull lives in those three accounts.

---

*Sources for every claim on this page: [About → Sources](../about.md#sources).*
