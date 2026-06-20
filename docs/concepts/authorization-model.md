# The Authorization Model

**BLUF:** The program implements *permissioned pulls*. A user signs **once** to grant a scoped permission; after that, the counterparty (merchant, employer, agent operator) submits each transfer, and the program checks that transfer against the granted limits **on-chain, at execution time**. The user never signs individual payments — and the counterparty can never exceed what was granted.

<div class="cdo-figure">
<svg class="dgm" viewBox="0 0 900 430" role="img" xmlns="http://www.w3.org/2000/svg" aria-label="One signature creates the authority and rule accounts; then every billing period a puller submits a transfer that the program validates on-chain before any tokens move.">
  <defs>
    <marker id="cdoArr" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#211e1a"/></marker>
    <marker id="cdoArrC" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#c05f3f"/></marker>
    <marker id="cdoArrR" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#ef4444"/></marker>
    <style>
      .dgm .b{fill:#fafaf7;stroke:#211e1a;stroke-width:2.5}
      .dgm .prog{fill:#fff;stroke:#c05f3f;stroke-width:3}
      .dgm .ok{fill:#fff;stroke:#d97757;stroke-width:2.5}
      .dgm .bad{fill:#fff;stroke:#ef4444;stroke-width:2.5}
      .dgm .t{font-family:Inter,system-ui,sans-serif;font-size:16px;font-weight:600;fill:#211e1a}
      .dgm .s{font-family:Inter,system-ui,sans-serif;font-size:12.5px;fill:#58524a}
      .dgm .m{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:14px;fill:#211e1a}
      .dgm .lbl{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;fill:#c05f3f;letter-spacing:.04em}
      .dgm .ln{stroke:#211e1a;stroke-width:2;fill:none}
      .dgm .phase{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;fill:#8b8478;letter-spacing:.12em}
    </style>
  </defs>

  <!-- PHASE 1: one signature -->
  <text x="30" y="40" class="phase">1 · ONCE</text>
  <rect class="b" x="30" y="56" width="140" height="60" rx="10"/>
  <text x="100" y="92" text-anchor="middle" class="t">Subscriber</text>
  <line class="ln" x1="170" y1="86" x2="246" y2="86" marker-end="url(#cdoArr)"/>
  <text x="208" y="76" text-anchor="middle" class="lbl">signs once</text>
  <rect class="b" x="250" y="56" width="180" height="60" rx="10"/>
  <text x="340" y="82" text-anchor="middle" class="m">subscribe()</text>
  <text x="340" y="102" text-anchor="middle" class="s">once per (user, mint)</text>
  <line class="ln" x1="430" y1="86" x2="506" y2="86" marker-end="url(#cdoArr)"/>
  <text x="468" y="76" text-anchor="middle" class="lbl">creates</text>
  <rect class="b" x="510" y="48" width="360" height="78" rx="10"/>
  <text x="528" y="74" class="s">Two program accounts:</text>
  <text x="528" y="96" class="s">• <tspan font-family="'JetBrains Mono',monospace" fill="#211e1a">SubscriptionAuthority</tspan> PDA — the delegate</text>
  <text x="528" y="114" class="s">• <tspan font-family="'JetBrains Mono',monospace" fill="#211e1a">Subscription</tspan> PDA — caps · destination · expiry</text>

  <!-- divider -->
  <line x1="30" y1="168" x2="870" y2="168" stroke="#211e1a" stroke-opacity="0.16" stroke-width="1.5" stroke-dasharray="2 8"/>
  <rect x="350" y="156" width="200" height="24" rx="12" fill="#fff" stroke="#211e1a" stroke-opacity="0.16"/>
  <text x="450" y="172" text-anchor="middle" class="phase">EVERY BILLING PERIOD ↻</text>

  <!-- PHASE 2: every pull -->
  <text x="30" y="214" class="phase">2 · EACH PULL</text>
  <rect class="b" x="30" y="226" width="180" height="60" rx="10"/>
  <text x="120" y="254" text-anchor="middle" class="t">Merchant / puller</text>
  <text x="120" y="272" text-anchor="middle" class="s">pays the tx fee</text>
  <line class="ln" x1="210" y1="256" x2="266" y2="256" marker-end="url(#cdoArr)"/>
  <text x="238" y="246" text-anchor="middle" class="lbl">submits</text>
  <rect class="b" x="270" y="226" width="226" height="60" rx="10"/>
  <text x="383" y="261" text-anchor="middle" class="m">transferSubscription()</text>
  <line class="ln" x1="496" y1="256" x2="552" y2="256" marker-end="url(#cdoArrC)"/>
  <rect class="prog" x="556" y="218" width="314" height="76" rx="10"/>
  <text x="713" y="248" text-anchor="middle" class="t">Program validates — at transfer time</text>
  <text x="713" y="272" text-anchor="middle" class="s">cap · destination · expiry · not-cancelled</text>

  <!-- branch: pass / fail -->
  <line class="ln" x1="660" y1="294" x2="660" y2="344" marker-end="url(#cdoArrC)" stroke="#c05f3f"/>
  <text x="676" y="322" class="lbl">pass</text>
  <rect class="ok" x="430" y="346" width="440" height="66" rx="10"/>
  <text x="650" y="374" text-anchor="middle" class="s"><tspan font-family="'JetBrains Mono',monospace" fill="#211e1a">SubscriptionAuthority</tspan> PDA signs the token CPI →</text>
  <text x="650" y="394" text-anchor="middle" class="s">tokens move · <tspan font-family="'JetBrains Mono',monospace" fill="#211e1a">SubscriptionTransferEvent</tspan> emitted</text>

  <line class="ln" x1="600" y1="300" x2="360" y2="344" marker-end="url(#cdoArrR)" stroke="#ef4444"/>
  <text x="430" y="296" text-anchor="middle" class="lbl" fill="#ef4444">any check fails</text>
  <rect class="bad" x="30" y="346" width="372" height="66" rx="10"/>
  <text x="216" y="374" text-anchor="middle" class="s" fill="#b91c1c">The whole transaction reverts.</text>
  <text x="216" y="394" text-anchor="middle" class="s" fill="#b91c1c">No partial pulls — nothing moves, whoever the caller is.</text>
</svg>
<p class="cdo-figcaption">One signature grants a scoped permission; the program re-checks it on every pull, on-chain, before a single token moves.</p>
</div>

## The mental model: a card pre-authorization, on-chain

The closest familiar analogy is a **card pre-auth**. When a hotel puts a hold on your credit card, you sign once at check-in; the hotel can then capture charges later — but only up to the authorized amount, only to the hotel's merchant account, and only within the authorization window. You don't co-sign each minibar charge, and the hotel can't drain your account.

This program is that, with the card network replaced by an on-chain program:

| Card world | This program |
|---|---|
| You sign the pre-auth slip once | Subscriber signs `subscribe` (or creates a delegation) once |
| Hotel captures charges later | Merchant or whitelisted puller submits `transfer_subscription` |
| Network enforces the auth limit | Program enforces per-period / cumulative caps at transfer time |
| Capture goes only to the hotel's account | Destination allowlist — funds can only land where the plan says |
| Auth expires | `end_ts` / `expires_at_ts` checked on every pull |
| You can cancel | `cancel_subscription` / `revokeDelegation`, signed by you |

## Who signs what

This is the single most important table in the guide:

| Action | Who signs | Who pays the fee |
|---|---|---|
| Create / update / delete a plan | Merchant (plan owner) | Merchant |
| Subscribe, cancel, resume | **Subscriber** | Subscriber |
| Create / revoke a fixed or recurring delegation | **Delegator** (the payer) | Delegator |
| Each pull (`transfer_subscription`, `transferFixed`, `transferRecurring`) | Merchant **or** one of ≤4 whitelisted pullers | **The puller** (~5,000 lamports per pull) |

Two consequences worth internalizing:

1. **The payer is passive after setup.** A subscriber's wallet does nothing on billing day. If the charge doesn't happen, it's because the *merchant's* infrastructure didn't fire — see [Running a Puller](../guides/running-a-puller.md).
2. **Pull costs sit with the pull side.** The merchant (or its puller) pays the transaction fee for every collection. Factor it into your unit economics.

## How the program gates each pull

Underneath, one **SubscriptionAuthority PDA** per (user, mint) (seeds `["SubscriptionAuthority", user, tokenMint]` — note the literal CamelCase seed string) becomes the delegate on the user's token account for that mint, and every transfer it signs must first pass the program's full check chain — walk through it below.

<div class="cdo-visual">
<div class="cdo-visual-title">interactive — lifecycle of a $5 pull</div>
<div id="cdo-pull-viz">
<p id="cdo-pull-fallback">
<strong>Static view (enable JavaScript for the interactive stepper):</strong>
a pull transaction passes, in order — ① accounts are program-owned →
② mint matches the plan → ③ plan not expired → ④ caller is owner or whitelisted
puller → ⑤ destination is on the plan's allowlist → ⑥ subscription's snapshotted
terms fingerprint matches the live plan (<code>PlanTermsMismatch</code> otherwise) →
⑦ subscription not cancelled → ⑧ period rollover applied, then per-period cap
checked → ⑨ state updated and CPI transfer signed by the SubscriptionAuthority
PDA → ⑩ <code>SubscriptionTransferEvent</code> emitted via self-CPI. Any failed
gate aborts the whole transaction; no partial pulls.
</p>
</div>
<script>
(function () {
  // ── Lifecycle of a $5 pull — gate stepper ──────────────────────────────
  // Gates mirror the program's transfer-flow check chain (see research digest).
  var GATES = [
    { n: "program-owned",  pass: "Plan + subscription accounts are owned by the subscriptions program.", fail: "An account was substituted or not owned by the program — transaction rejected before any logic runs." },
    { n: "mint match",     pass: "The token mint matches the one fixed in the plan.", fail: "Wrong mint supplied — a plan denominated in one token can never pull another." },
    { n: "plan expiry",    pass: "Plan end_ts is 0 (open-ended) or still in the future.", fail: "Plan has expired — pulls are dead until the merchant publishes a new plan." },
    { n: "caller authz",   pass: "Signer is the plan owner or one of the ≤4 whitelisted pullers.", fail: "Unauthorized caller — random third parties cannot trigger pulls, even valid ones." },
    { n: "destination",    pass: "Receiving token account is on the plan's immutable destination allowlist.", fail: "Destination mismatch — funds can only ever land where the subscriber agreed at subscribe time." },
    { n: "terms snapshot", pass: "check_plan_terms(): the subscription's snapshotted created_at + terms fingerprint matches the live plan.", fail: "PlanTermsMismatch — the 'ghost account' defense. A deleted-and-recreated plan with new terms cannot bill old subscribers." },
    { n: "not cancelled",  pass: "Subscription is active (not cancelled by the subscriber).", fail: "Subscription was cancelled — the program refuses the pull; the subscriber's one signature at cancel is final." },
    { n: "period + cap",   pass: "Period rolled over if elapsed, then $5 fits inside this period's remaining cap.", fail: "Per-period cap exceeded — already pulled the full amount this period. Wait for rollover." },
    { n: "CPI transfer",   pass: "State updated, then the SubscriptionAuthority PDA signs the token CPI — $5 moves.", fail: "Token-program-level failure (e.g. insufficient balance in the subscriber's account) aborts everything atomically." },
    { n: "event",          pass: "SubscriptionTransferEvent emitted via self-CPI — your billing backend reconciles.", fail: "" }
  ];
  var box = document.getElementById("cdo-pull-viz");
  var fb = document.getElementById("cdo-pull-fallback");
  if (!box) return;
  fb.style.display = "none";

  // styles (scoped, brand colors)
  var st = document.createElement("style");
  st.textContent =
    "#cdo-pull-viz .g{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px 0}" +
    "#cdo-pull-viz .gate{font-family:'JetBrains Mono',monospace;font-size:.62rem;letter-spacing:.04em;" +
    "padding:6px 9px;border-radius:6px;border:1px solid #2a3648;background:#111827;color:#8b96a8;" +
    "cursor:pointer;transition:all .25s;user-select:none}" +
    "#cdo-pull-viz .gate.on{border-color:#d97757;color:#0b0f17;background:#d97757;box-shadow:0 0 10px rgba(217,119,87,.5)}" +
    "#cdo-pull-viz .gate.bad{border-color:#ef4444;color:#fff;background:#7f1d1d}" +
    "#cdo-pull-viz .btns button{font-family:'JetBrains Mono',monospace;font-size:.68rem;margin-right:8px;" +
    "padding:5px 14px;border-radius:6px;border:1px solid #d97757;background:transparent;color:#e8916f;cursor:pointer}" +
    "#cdo-pull-viz .btns button:hover{background:rgba(217,119,87,.12)}" +
    "#cdo-pull-viz .msg{margin-top:12px;min-height:3em;font-size:.78rem;color:#e5e9f0;border-left:3px solid #d97757;" +
    "padding:4px 0 4px 12px}#cdo-pull-viz .msg.bad{border-left-color:#ef4444;color:#fca5a5}";
  box.appendChild(st);

  var row = document.createElement("div"); row.className = "g";
  var chips = GATES.map(function (g, i) {
    var c = document.createElement("span");
    c.className = "gate"; c.textContent = (i + 1) + " " + g.n;
    c.title = "click to see the failure branch";
    c.onclick = function () { showFail(i); };
    row.appendChild(c); return c;
  });
  var btns = document.createElement("div"); btns.className = "btns";
  var bPlay = document.createElement("button"); bPlay.textContent = "▶ play";
  var bStep = document.createElement("button"); bStep.textContent = "step";
  var bReset = document.createElement("button"); bReset.textContent = "reset";
  btns.appendChild(bPlay); btns.appendChild(bStep); btns.appendChild(bReset);
  var msg = document.createElement("div"); msg.className = "msg";
  msg.textContent = "A puller submits a $5 transfer_subscription. Press play — or click any gate to see what happens when it fails.";
  box.appendChild(row); box.appendChild(btns); box.appendChild(msg);

  var i = -1, timer = null;
  function reset() {
    if (timer) { clearInterval(timer); timer = null; bPlay.textContent = "▶ play"; }
    i = -1;
    chips.forEach(function (c) { c.className = "gate"; });
    msg.className = "msg";
    msg.textContent = "Reset. The $5 pull is waiting at the program's front door.";
  }
  function step() {
    if (i >= GATES.length - 1) { return; }
    i++;
    chips[i].className = "gate on";
    msg.className = "msg";
    msg.textContent = "✓ gate " + (i + 1) + " (" + GATES[i].n + "): " + GATES[i].pass;
    if (i === GATES.length - 1 && timer) { clearInterval(timer); timer = null; bPlay.textContent = "▶ play"; }
  }
  function showFail(k) {
    if (!GATES[k].fail) return;
    if (timer) { clearInterval(timer); timer = null; bPlay.textContent = "▶ play"; }
    chips.forEach(function (c, j) { c.className = j < k ? "gate on" : "gate"; });
    chips[k].className = "gate bad"; i = k - 1;
    msg.className = "msg bad";
    msg.textContent = "✗ gate " + (k + 1) + " (" + GATES[k].n + ") fails: " + GATES[k].fail + " The whole transaction aborts — nothing moves.";
  }
  bStep.onclick = step;
  bReset.onclick = reset;
  bPlay.onclick = function () {
    if (timer) { clearInterval(timer); timer = null; bPlay.textContent = "▶ play"; return; }
    if (i >= GATES.length - 1) reset();
    bPlay.textContent = "❚❚ pause";
    timer = setInterval(step, 1100);
  };
})();
</script>
</div>

Every gate aborts the entire transaction on failure — there are no partial pulls. The full chain, in program order: program-owned check → mint match → plan-expiry check → caller authorization (owner | puller) → destination allowlist → `check_plan_terms()` fingerprint → cancellation check → period rollover + cap → state update → CPI transfer signed by the SubscriptionAuthority PDA → `SubscriptionTransferEvent` via self-CPI.

## The `u64::MAX` approval paradox, explained honestly

Here's the part that makes wallet users nervous, so let's not dance around it.

When a user sets up their first delegation for a given token, the **SubscriptionAuthority PDA** is approved as the delegate on their token account with an amount of **`u64::MAX`** — the maximum possible value. A wallet UI that naively renders token approvals will display this as "unlimited spending approval," which looks terrifying.

The honest breakdown:

- **At the token-program layer**, the approval really is `u64::MAX`. That's not spin; it's what's on the account.
- **But the SubscriptionAuthority PDA has no private key.** Nobody can sign as it directly. The *only* code path that can produce its signature is the subscriptions program itself, via CPI — and that code path runs the full gate chain above before signing anything.
- So the effective spending power is **the sum of the caps in your active Delegation PDAs**, not `u64::MAX`. No delegation, no spend. Cancelled delegation, no spend. Cap exhausted this period, no spend.

Why design it this way? One blanket approval means the user signs the token-level `approve` **once per (user, mint)** instead of re-approving for every new subscription, and lets the program manage many concurrent delegations through a single delegate slot (SPL token accounts only have one).

!!! note "The caveat that remains true"
    You are trusting the *program* — its checks, and the [audit that covered them](../security/audit.md) — rather than the token-level approval amount. That's the actual trust statement, and it's why this guide has a [Security Model](../security/model.md) page instead of a shrug. Wallet UIs that display raw approval amounts without program context will overstate the risk; integrators should explain this to users rather than hide it.

**Recap:** one signature grants a scoped permission; the program re-validates every pull against caps, destinations, expiry, and cancellation; the scary-looking `u64::MAX` is a key the program holds, gated by locks the user controls.

---

*Sources for every claim on this page: [About → Sources](../about.md#sources).*
