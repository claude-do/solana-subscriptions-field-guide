# Fixed Allowances (AI Budgets)

**BLUF:** A fixed delegation is a hard, *cumulative* spending budget: "this counterparty may pull up to X total, ever, optionally until time T." It never refills. That makes it the natural primitive for giving an AI agent a wallet it cannot drain — the failure mode is bounded by construction, not by prompt discipline.

## The pattern: agent gets a budget, not a key

The worst way to fund an autonomous agent is to hand it a private key to a funded wallet — every bug, prompt injection, or hallucinated "payment" has the full balance as its blast radius. The fixed-delegation pattern inverts this:

1. The **operator** (human or treasury) keeps custody of the funds.
2. The operator creates a **fixed delegation** toward the agent's spending counterparty: cumulative cap, optional expiry.
3. The agent's payments are executed as pulls against the delegation. The program — not the agent's judgment — enforces the ceiling.
4. When the budget is spent or the expiry passes, spending stops. Period. No prompt can negotiate with an on-chain cap.

This is the same shape as a card-style pre-authorization: a bounded envelope, opened once, drawn down until empty.

!!! note "Standards context: MPP"
    Agentic-payment flows are being standardized in the MPP spec ([github.com/tempoxyz/mpp-specs — PR #270](https://github.com/tempoxyz/mpp-specs/pull/270)), which covers this kind of agent-budget delegation. If you're building agent payments, track that spec alongside this program — the fixed delegation is a natural settlement primitive underneath it.

## Semantics, precisely

| Property | Behavior |
|---|---|
| **Cap** | Cumulative — the total ever pullable. Each pull subtracts; nothing refills. |
| **Expiry** | Optional. After it passes, remaining budget is unspendable. |
| **No periods** | Unlike [recurring delegations](recurring-delegations.md), there's no rollover and no per-period counter — just a depleting total. |
| **Revocation** | `revokeDelegation`, signed by the delegator, effective immediately — remaining budget dies with it. |
| **Top-up** | There is no in-place increase; issue a new delegation when the budget runs dry. Treat that as a feature — refilling is a deliberate human act, an approval checkpoint. |

Setup mirrors the recurring flow (ADR-001 direct-delegation set): `initSubscriptionAuthority` once per delegator, then `createFixedDelegation`; pulls go through `transferFixed`; the kill switch is `revokeDelegation`.

## Worked example: research agent with a $50 budget

An operator wants an agent to buy API credits and datasets, up to $50 total, this month only:

- **Cap:** `50_000_000` base units (for a 6-decimal stable mint — [base units, always](merchant-quickstart.md)).
- **Expiry:** end of month.
- Agent purchases $12, $3, $20 → ✓ ✓ ✓ (35 spent). Attempts $20 more → **✗ rejected** — would exceed the cumulative $50. The agent can still spend $15, nothing more.
- Month ends → any remainder is dead. Operator reviews the spend log (every pull emitted an [event](../reference/events.md)) and decides, consciously, whether next month's delegation should exist and at what size.

## Why this beats the alternatives

- **vs. funding the agent's own wallet:** a compromised or confused agent can lose at most the remaining cap — and the operator can `revokeDelegation` the moment something looks wrong, instantly stranding the budget.
- **vs. a recurring delegation:** recurring refills every period whether or not you reviewed anything. Fixed makes every refill a human decision. For autonomous spenders, defaulting to fixed is the conservative choice; graduate to recurring only when the spend pattern is boring and audited.
- **vs. token-level `approve(amount)`:** a plain SPL approval is a single delegate slot with no expiry semantics, no event trail designed for billing reconciliation, and it collides with any other delegation use of that account. The program multiplexes many delegations through one authority and enforces expiry and revocation uniformly.

!!! warning "What the cap does not protect"
    The cap bounds *how much* leaves the wallet — not *whether each purchase was wise*. An agent can still spend its whole budget on garbage. Pair the on-chain ceiling with off-chain review of the event stream, and keep budgets small enough that "all of it, wasted" is an acceptable worst case.

**Recap:** fixed delegation = depleting cumulative cap + optional expiry + instant revocation. Give agents budgets, not keys; make refills deliberate; let the program — not the model — hold the line.

---

*Sources for every claim on this page: [About → Sources](../about.md#sources).*
