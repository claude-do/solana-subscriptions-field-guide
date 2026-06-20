# Security Model

**BLUF:** Over-pulling isn't prevented by one check but by a **layered gate chain** evaluated on every transfer: ownership, mint, expiry, caller, destination, terms-fingerprint, cancellation, and cap — and only then does the program's PDA sign the token move. The trust statement is precise: users trust the *program's code* (and [its audit](audit.md)) to gate a `u64::MAX` token approval; merchants get exactly the powers a subscriber granted at subscribe time, and not one more.

<div class="cdo-figure">
<svg class="dgm" viewBox="0 0 900 320" role="img" xmlns="http://www.w3.org/2000/svg" aria-label="Cap enforcement: with $30 already pulled against a $50 per-period cap, a $35 pull exceeds the $20 remaining, so the program returns AmountExceedsLimit (300) and the whole transaction reverts.">
<defs>
  <marker id="cdoArrC" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#c05f3f"/></marker>
  <style>
    .dgm .b{fill:#fafaf7;stroke:#211e1a;stroke-width:2.5}
    .dgm .bad{fill:#fff;stroke:#ef4444;stroke-width:2.5}
    .dgm .s{font-family:Inter,system-ui,sans-serif;font-size:12.5px;fill:#58524a}
    .dgm .t{font-family:Inter,system-ui,sans-serif;font-size:15px;font-weight:600;fill:#b91c1c}
    .dgm .lbl{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;fill:#c05f3f;letter-spacing:.03em}
    .dgm .lnc{stroke:#c05f3f;stroke-width:2;fill:none}
  </style>
</defs>
  <text x="560" y="30" text-anchor="middle" class="lbl">puller submits $35</text>
  <line class="lnc" x1="560" y1="38" x2="560" y2="62" marker-end="url(#cdoArrC)"/>
  <rect x="430" y="66" width="240" height="20" rx="4" fill="none" stroke="#d97757" stroke-width="2" stroke-dasharray="4 3"/>
  <rect x="670" y="66" width="180" height="20" rx="4" fill="rgba(239,68,68,0.10)" stroke="#ef4444" stroke-width="2" stroke-dasharray="4 3"/>
  <text x="760" y="80" text-anchor="middle" class="s" fill="#b91c1c" font-size="11">over the cap</text>
  <rect class="b" x="70" y="94" width="600" height="54" rx="8"/>
  <rect x="72" y="96" width="358" height="50" rx="6" fill="#d97757"/>
  <line x1="670" y1="60" x2="670" y2="172" stroke="#ef4444" stroke-width="3"/>
  <text x="684" y="126" class="s" fill="#b91c1c">← cap = $50 / period</text>
  <text x="251" y="126" text-anchor="middle" class="s" fill="#fafaf7" font-weight="600">$30 pulled</text>
  <text x="550" y="126" text-anchor="middle" class="s">$20 remaining</text>
  <rect class="bad" x="210" y="210" width="480" height="74" rx="10"/>
  <text x="450" y="240" text-anchor="middle" class="t">AmountExceedsLimit (300) — the transaction reverts</text>
  <text x="450" y="263" text-anchor="middle" class="s" fill="#b91c1c">no partial pulls · even a whitelisted puller cannot exceed it</text>
</svg>
<p class="cdo-figcaption">The cap is enforced on-chain at transfer time. A pull that would exceed the period's remaining amount reverts entirely — it is not clamped to the remainder.</p>
</div>

## What actually stops over-pulling

The naive fear: "the program's PDA holds an unlimited approval on my token account — what stops a merchant from draining it?" The answer is the full check chain, every gate of which must pass **in the same transaction** before the PDA's signature is produced:

| Layer | Gate | What it prevents |
|---|---|---|
| 1 | Program-owned check | Substituted/forged state accounts |
| 2 | Mint match | Pulling a different token than the plan denominates |
| 3 | Plan expiry (`end_ts`) | Billing past the offer's lifetime |
| 4 | Caller authorization (owner \| ≤4 pullers) | Arbitrary third parties triggering pulls |
| 5 | Destination allowlist (immutable) | Redirecting funds anywhere the subscriber didn't agree to |
| 6 | `check_plan_terms()` fingerprint | The [ghost-account swap](../reference/failure-modes.md#the-ghost-account-defense-as-a-story) — recreating a plan with new terms at the same address |
| 7 | Cancellation check | Billing after the subscriber said stop |
| 8 | Period rollover + cap | Pulling more than the agreed amount per period |
| 9 | State update **then** CPI | Counters are committed in the same atomic transaction as the transfer; no partial state |
| 10 | Event emission (self-CPI, `["event_authority"]`) | Silent billing — every transfer leaves an authenticated trail |

Defense-in-depth reading: a merchant who controls their own plan still can't beat layers 5, 6, 7, or 8 — those gates serve the *subscriber* against the *merchant*. An outside attacker dies at layers 1–4 before subscriber-protection even comes up.

## Trust assumptions, stated precisely

### What the user grants

- A **token-level approval of `u64::MAX`** to the SubscriptionAuthority PDA (`["SubscriptionAuthority", user, tokenMint]` — the PDA itself is derived per (user, mint)) on their token account — once per (user, mint).
- The PDA has no private key; its signature exists only as CPI output of the subscriptions program. So the *effective* grant is: "the program may move my tokens **when and only when a live delegation's gates all pass**." No active delegations = no spendable authority, regardless of the approval number.
- Residual trust: the program's code is the gatekeeper. A bug in the gate chain is the real risk surface — which is why the [audit page](audit.md) tells you exactly which commits were reviewed and which weren't, instead of waving the word "audited" at you.

### What merchants CANNOT do

- **Change the deal.** `amount`, `period`, `mint`, `destinations` are immutable post-creation; the subscriber's snapshot enforces this even across plan delete/recreate (`PlanTermsMismatch`).
- **Pull more than the per-period cap**, or pull again once it's consumed — the counter resets only at genuine period rollover.
- **Pull after cancellation** — the subscriber's `cancel_subscription` takes effect at the very next gate-chain evaluation.
- **Pull past expiry** — plan `end_ts` and delegation `expires_at_ts` are checked on every transfer.
- **Redirect funds** — only allowlisted destinations, frozen at plan creation.
- **Touch other tokens** — the SA PDA's authority is exercised per delegation, and each delegation is bound to its mint.

### What merchants CAN do (so you're not surprised)

- Update `status`, `end_ts`, the puller list (≤4), and `metadata_uri` on a plan.
- Stop offering the plan (`delete_plan`) — which ends *future* billing but can't retroactively re-terms existing subscribers.
- Choose *when* within a period to pull, and via *which* whitelisted puller. Timing is merchant-side discretion within the cap; the program enforces amounts, not invoicing etiquette.

## The wallet-UI caveat

Be straight with your users about this one: wallets that render raw token approvals will show the SA PDA's delegation as effectively **"unlimited."** That display is *technically true at the token layer* and *materially misleading about spend authority*, because it doesn't know about the program's gate chain. Until wallet UIs grow program-aware approval displays, integrators should:

- Explain the layered model at subscribe time ([the honest explanation](../concepts/authorization-model.md#the-u64max-approval-paradox-explained-honestly) is linkable for exactly this purpose);
- Never paper over it — a user who discovers the `u64::MAX` from their wallet *after* you didn't mention it has every right to assume the worst;
- Show users their *actual* exposure: the sum of caps across their active delegations, with cancel buttons next to each.

**Recap:** ten layered gates run on every pull, atomically; the user's `u64::MAX` approval is a key held by keyless program code behind those gates; merchants keep operational knobs (status, pullers, metadata, end date) and never the billing terms. Trust the chain of checks, verify via the [audit status](audit.md) — and tell your users the truth about what their wallet will show them.

---

*Sources for every claim on this page: [About → Sources](../about.md#sources).*
