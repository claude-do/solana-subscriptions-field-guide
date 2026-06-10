# The Three Primitives

**BLUF:** The program ships three delegation shapes. **Fixed** = a cumulative budget that only goes down (AI agents, pre-auth). **Recurring** = a cap that resets every period (payroll, contractors). **Plan** = a merchant-published recurring offer that many users subscribe to, with their terms snapshotted at subscribe time (consumer subscriptions). Pick by asking: *one payer or many? does the allowance refill?*

## Comparison table

| | Fixed delegation | Recurring delegation | Subscription plan |
|---|---|---|---|
| **Shape** | One payer → one counterparty | One payer → one counterparty | One merchant offer → many subscribers |
| **Spending limit** | **Cumulative cap** — total ever spendable | **Per-period cap** — resets each period | Plan `amount` per period, snapshotted per subscriber |
| **Refills?** | Never | Every period (use it or lose it — unspent capacity does not accumulate) | Every period |
| **Period unit** | n/a | **Seconds** (`periodLengthS`) | Hours (`periodHours`), `1..8760` |
| **Expiry** | Optional | Overall expiry | Plan `end_ts`; delegation `expires_at_ts` |
| **Who defines terms** | The payer (delegator) | The payer (delegator) | The **merchant** — subscriber accepts by subscribing |
| **Terms changeable?** | Revoke & recreate | Revoke & recreate | Core terms (`amount`/`period`/`mint`/`destinations`) **immutable**; only `status`/`end_ts`/`pullers`/`metadata_uri` updatable |
| **Set up by** | `createFixedDelegation` | `createRecurringDelegation` | `create_plan` (merchant) + `subscribe` (user) |
| **Pulled via** | `transferFixed` | `transferRecurring` | `transfer_subscription` (owner or ≤4 whitelisted pullers) |
| **Killed by** | `revokeDelegation` | `revokeDelegation` | `cancel_subscription` (user) / `delete_plan` (merchant) |
| **Canonical use** | AI-agent budget, card-style pre-auth | Payroll, contractor retainer | SaaS / consumer subscriptions |

## When to use which

```mermaid
flowchart TD
    A{Many payers buying<br/>the same offer?} -- yes --> P["Subscription plan<br/>(merchant publishes once,<br/>users subscribe)"]
    A -- "no — it's one<br/>bilateral grant" --> B{Should the allowance<br/>refill over time?}
    B -- "yes, every period" --> R["Recurring delegation<br/>(per-period cap, resets;<br/>payroll, retainers)"]
    B -- "no — hard total budget" --> F["Fixed delegation<br/>(cumulative cap + optional expiry;<br/>AI budgets, pre-auth)"]
    P --> G["Guide: Merchant Quickstart"]
    R --> H["Guide: Recurring Delegations"]
    F --> I["Guide: Fixed Allowances"]
```

A subtlety worth stating plainly: a **plan is not just "a recurring delegation with marketing."** The plan adds three things — many-to-one fan-out, the **terms snapshot** (each subscriber is protected against the merchant editing the deal after the fact), and the **puller whitelist** (delegating collection to infrastructure that isn't the merchant's hot key).

## Feel the period mechanics

Recurring semantics trip up more integrators than anything else: the cap resets per period, and the rollover happens **lazily at transfer time** — there's no crank. (The simulator below uses hours as its display unit; remember the actual on-chain unit is **seconds** for direct recurring delegations and **whole hours** for plans.) Play with it:

<div class="cdo-visual">
<div class="cdo-visual-title">interactive — period &amp; cap simulator (recurring semantics)</div>
<div id="cdo-sim">
<p id="cdo-sim-fallback">
<strong>Static view (enable JavaScript for the simulator):</strong> with a 24-hour
period and a 100-unit cap, pulls of 40 units every 10 hours land at t=0h ✓ (40/100),
t=10h ✓ (80/100), t=20h ✗ (would be 120/100 — <em>cap exceeded, pull rejected</em>),
t=30h ✓ (new period — counter reset to 0, now 40/100), and so on. Unspent capacity
from one period never carries into the next.
</p>
</div>
<script>
(function () {
  // ── Period & cap simulator — recurring-delegation semantics ────────────
  // Model: per-period cap resets at rollover (lazy, evaluated at pull time);
  // a pull succeeds iff pulled_this_period + amount <= cap. No carry-over.
  var box = document.getElementById("cdo-sim");
  var fb = document.getElementById("cdo-sim-fallback");
  if (!box) return;
  fb.style.display = "none";

  var st = document.createElement("style");
  st.textContent =
    "#cdo-sim .row{display:flex;flex-wrap:wrap;gap:18px;margin-bottom:10px;font-size:.72rem;color:#8b96a8}" +
    "#cdo-sim label{font-family:'JetBrains Mono',monospace;display:flex;flex-direction:column;gap:4px}" +
    "#cdo-sim input[type=range]{accent-color:#14b8a6;width:150px}" +
    "#cdo-sim .val{color:#2dd4bf}" +
    "#cdo-sim svg{width:100%;height:auto;display:block;background:#0b0f17;border:1px solid #1f2a3a;border-radius:8px}" +
    "#cdo-sim .btns{margin:10px 0}" +
    "#cdo-sim .btns button{font-family:'JetBrains Mono',monospace;font-size:.68rem;margin-right:8px;" +
    "padding:5px 14px;border-radius:6px;border:1px solid #14b8a6;background:transparent;color:#2dd4bf;cursor:pointer}" +
    "#cdo-sim .msg{font-size:.74rem;color:#e5e9f0;min-height:2.4em;margin-top:8px}";
  box.appendChild(st);

  // controls: period hours, per-period cap, pull amount, pull interval
  function slider(label, min, max, val, stepv) {
    var l = document.createElement("label");
    var span = document.createElement("span");
    var inp = document.createElement("input");
    inp.type = "range"; inp.min = min; inp.max = max; inp.value = val; inp.step = stepv || 1;
    l.appendChild(span); l.appendChild(inp);
    inp._label = span; inp._name = label;
    return inp;
  }
  var sPeriod = slider("period", 6, 72, 24);
  var sCap    = slider("cap", 20, 300, 100, 10);
  var sAmt    = slider("pull amount", 10, 200, 40, 5);
  var sEvery  = slider("pull every", 2, 48, 10);
  var row = document.createElement("div"); row.className = "row";
  [sPeriod, sCap, sAmt, sEvery].forEach(function (s) { row.appendChild(s.parentNode); });
  box.appendChild(row);

  var HOURS = 96, W = 760, H = 170, PAD = 36;
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  box.appendChild(svg);
  var btns = document.createElement("div"); btns.className = "btns";
  var bAnim = document.createElement("button"); bAnim.textContent = "▶ animate";
  btns.appendChild(bAnim); box.appendChild(btns);
  var msg = document.createElement("div"); msg.className = "msg"; box.appendChild(msg);

  var timer = null, reveal = Infinity; // how many pull attempts are visible
  function x(t) { return PAD + (t / HOURS) * (W - 2 * PAD); }

  function simulate() {
    // lazy rollover: at each pull time, advance the period window, then test cap
    var period = +sPeriod.value, cap = +sCap.value, amt = +sAmt.value, every = +sEvery.value;
    var pulls = [], pulled = 0, periodStart = 0;
    for (var t = 0; t <= HOURS; t += every) {
      while (t >= periodStart + period) { periodStart += period; pulled = 0; } // rollover (no carry)
      var ok = pulled + amt <= cap;
      if (ok) pulled += amt;
      pulls.push({ t: t, ok: ok, after: pulled });
    }
    return { period: period, cap: cap, amt: amt, pulls: pulls };
  }

  function draw() {
    var s = simulate();
    svg.innerHTML = "";
    function el(n, attrs, txt) {
      var e = document.createElementNS("http://www.w3.org/2000/svg", n);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      if (txt) e.textContent = txt;
      svg.appendChild(e); return e;
    }
    // alternating period bands
    for (var p = 0, i = 0; p < HOURS; p += s.period, i++) {
      el("rect", { x: x(p), y: 18, width: x(Math.min(p + s.period, HOURS)) - x(p), height: H - 52,
        fill: i % 2 ? "rgba(20,184,166,0.05)" : "rgba(20,184,166,0.11)" });
      el("text", { x: x(p) + 4, y: 30, "font-size": 9, fill: "#8b96a8",
        "font-family": "JetBrains Mono,monospace" }, "period " + (i + 1));
    }
    // axis
    el("line", { x1: PAD, y1: H - 34, x2: W - PAD, y2: H - 34, stroke: "#2a3648" });
    for (var h = 0; h <= HOURS; h += 24)
      el("text", { x: x(h) - 8, y: H - 20, "font-size": 9, fill: "#8b96a8",
        "font-family": "JetBrains Mono,monospace" }, h + "h");
    // pull attempts: bar height = counter after pull; red ✗ on rejection
    var shown = 0, lastTxt = "";
    s.pulls.forEach(function (pl, k) {
      if (k >= reveal) return;
      shown++;
      var px = x(pl.t), barMax = H - 86;
      var hgt = Math.max(3, (pl.after / s.cap) * barMax);
      el("rect", { x: px - 4, y: H - 34 - hgt, width: 8, height: hgt, rx: 2,
        fill: pl.ok ? "#14b8a6" : "#7f1d1d", stroke: pl.ok ? "none" : "#ef4444" });
      el("text", { x: px - 4, y: H - 40 - hgt, "font-size": 10,
        fill: pl.ok ? "#2dd4bf" : "#ef4444", "font-family": "JetBrains Mono,monospace" },
        pl.ok ? "✓" : "✗");
      lastTxt = pl.ok
        ? "t=" + pl.t + "h ✓ pulled " + s.amt + " — " + pl.after + "/" + s.cap + " used this period"
        : "t=" + pl.t + "h ✗ rejected — " + pl.after + " + " + s.amt + " would exceed the " + s.cap + " cap; wait for rollover";
    });
    // cap line
    el("line", { x1: PAD, y1: H - 34 - (H - 86), x2: W - PAD, y2: H - 34 - (H - 86),
      stroke: "#ef4444", "stroke-dasharray": "4 4", opacity: 0.6 });
    el("text", { x: W - PAD - 60, y: H - 34 - (H - 86) - 4, "font-size": 9, fill: "#ef4444",
      "font-family": "JetBrains Mono,monospace" }, "cap " + s.cap);
    var fails = s.pulls.slice(0, shown).filter(function (p) { return !p.ok; }).length;
    msg.textContent = (lastTxt ? lastTxt + "  ·  " : "") + shown + " attempts, " + fails +
      " rejected. Cap resets at each period boundary — unspent capacity never carries over.";
  }

  [sPeriod, sCap, sAmt, sEvery].forEach(function (s) {
    function upd() { s._label.innerHTML = s._name + ": <span class='val'>" + s.value +
      (s === sCap || s === sAmt ? " units" : "h") + "</span>"; reveal = Infinity; draw(); }
    s.oninput = upd; upd();
  });
  bAnim.onclick = function () {
    if (timer) { clearInterval(timer); timer = null; bAnim.textContent = "▶ animate"; return; }
    reveal = 0; bAnim.textContent = "❚❚ stop";
    timer = setInterval(function () {
      reveal++; draw();
      if (reveal >= simulate().pulls.length) { clearInterval(timer); timer = null; bAnim.textContent = "▶ animate"; }
    }, 450);
  };
  draw();
})();
</script>
</div>

Three behaviors to internalize from the simulator:

1. **The cap is per-period, not lifetime** — set period to 24h and watch the counter reset at every band boundary.
2. **No carry-over.** If a period goes underused, that capacity is gone. Recurring is "use it or lose it" by design.
3. **Rollover is lazy.** On chain, the reset happens *inside the next pull*, not at the boundary itself. Nothing updates the account at midnight — which is exactly why [your puller's schedule](../guides/running-a-puller.md) is what makes billing actually feel periodic.

!!! note "Granularity floor — plans only"
    **Plan** periods are whole **hours** (`periodHours`, `1` to `8760` — one hour to one year). But that floor is a plan-layer constraint, not a program-wide one: **direct recurring delegations take their period in seconds** (`periodLengthS` in the SDK), so per-minute — even per-second — metering is possible if you use a bilateral recurring delegation instead of a merchant-published plan. If you need streaming-style payments, drop down a layer; don't reach for a plan.

**Recap:** fixed = budget that only depletes; recurring = budget that refills each period with no carry-over; plan = recurring, productized for many subscribers with snapshot protection. Decision rule: many payers → plan; refilling → recurring; hard total → fixed.

---

*Sources for every claim on this page: [About → Sources](../about.md#sources).*
