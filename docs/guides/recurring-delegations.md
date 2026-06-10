# Recurring Delegations (Payroll)

**BLUF:** A recurring delegation is a bilateral, refilling allowance: the payer grants "up to X tokens per period, until expiry," and the counterparty pulls within that envelope. Per-period caps **reset and never carry over**, periods are specified in **seconds** (`periodLengthS` — unlike plans, which are hour-granularity), and the rollover is applied **lazily at transfer time**. It's the right primitive for payroll, contractor retainers, fine-grained usage metering, and any one-to-one recurring obligation where the *payer* defines the terms.

## When this primitive (and not a plan)

A [subscription plan](merchant-quickstart.md) is a merchant-published offer that many users accept. A recurring delegation flips the authorship: **the payer writes the terms.** Use it when:

- You (a company) are paying a contractor a retainer — you set the cap, not them.
- You're streaming an allowance to a team wallet or a child account.
- The relationship is one-to-one and the "merchant/subscriber" framing doesn't fit.

## Setup

The payer creates the delegation via the direct-delegation instruction set (ADR-001):

- `initSubscriptionAuthority` — once per delegator, establishes the program's signing PDA over their token account (with the [`u64::MAX` approval](../concepts/authorization-model.md#the-u64max-approval-paradox-explained-honestly)).
- `createRecurringDelegation` — defines the envelope: per-period cap, period length in seconds (`periodLengthS`), and an overall expiry.
- `transferRecurring` — each pull, validated against the envelope.
- `revokeDelegation` — the payer's kill switch, effective immediately.

The payer signs setup and revocation. Pulls are submitted by the receiving side's infrastructure and validated by the program against the delegation. [VERIFY: the exact caller-authorization rule for `transferRecurring` on direct delegations — i.e., precisely which keys the program accepts as the pull signer — against the program source/IDL before publishing integration code.]

## Period semantics — the part to get right

Three rules govern every recurring delegation:

1. **Period length is in seconds (`periodLengthS`).** Weekly = `604_800`, monthly-ish (30 days) = `2_592_000`, daily = `86_400` — and sub-hourly windows are legal, which is what makes fine-grained metering possible here when it isn't on plans (plans are constrained to whole hours, `1..8760`). There is no "first of the month" — periods are fixed-length windows counted from the period start, not calendar-aligned. If you need calendar billing, your puller schedules around that (see below).
2. **The cap resets each period and unused capacity does not roll over.** If the contractor pulls nothing in week 3, week 4's envelope is still just the cap — not double.
3. **Rollover happens at transfer time, not at the boundary.** The delegation account stores `amount_pulled_in_period` and `current_period_start_ts`; nothing updates them until the next `transferRecurring` executes, at which point the program first rolls the window forward (resetting the counter) and then checks the cap. An untouched delegation just sits with stale counters — that's normal and harmless.

The interactive [period & cap simulator](../concepts/primitives.md#feel-the-period-mechanics) lets you play these rules against each other.

## Worked example: weekly contractor retainer

Goal: pay a contractor up to **2,000 USD-stable units per week** for the next year, where the contractor's ops wallet pulls their invoice amount when work ships.

**Terms** (payer-defined):

| Field | Value | Why |
|---|---|---|
| Per-period cap | `2_000_000_000` base units (2,000 × 10⁶ for a 6-decimal mint) | The weekly ceiling. [Base units!](merchant-quickstart.md) |
| Period | `604_800` seconds (`periodLengthS`) | One week |
| Expiry | now + 1 year | Engagement end — pulls hard-stop after this |

**Week-by-week behavior:**

| Time | Action | Result |
|---|---|---|
| Week 1, day 2 | Pull 1,500 | ✓ — 1,500/2,000 used |
| Week 1, day 5 | Pull 600 | ✗ — would be 2,100 > 2,000 cap. Pull 500 instead ✓ (2,000/2,000) |
| Week 2, day 1 | Pull 2,000 | ✓ — period rolled over inside this pull; counter reset, then 2,000/2,000 |
| Week 3 | (no pulls) | Counter goes stale — fine. The 2,000 unused does **not** carry to week 4 |
| Week 4, day 1 | Pull 2,000 | ✓ — rollover applied lazily; still just 2,000 available, not 4,000 |
| Month 13 | Pull anything | ✗ — expiry passed; delegation is dead |

**Payer's exit:** `revokeDelegation` at any time — no notice period exists at the program level; if your contract requires one, that's an off-chain term.

## Operational notes

- **The pull side needs infrastructure.** Same story as plans: no scheduler exists. A missed week isn't recoverable later (no carry-over), so the receiving side should run a real [puller](running-a-puller.md) with retries, not a cron job and hope.
- **Calendar alignment is your job.** Periods are fixed 604,800-second windows from the period start. If invoices must align to "Mondays," create the delegation at the moment you want boundaries anchored to, and schedule pulls just after each boundary.
- **Changing the terms = revoke and recreate.** There is no in-place edit of cap or period; the payer revokes and issues a fresh delegation. Coordinate so the counterparty doesn't fire a pull into the gap.
- **Receipts:** every successful pull emits a transfer event via self-CPI — index these for payroll records ([Events](../reference/events.md)).

**Recap:** payer authors the envelope (cap / `periodLengthS` / expiry), counterparty pulls within it, program enforces reset-per-period with no carry-over and lazy rollover, payer can revoke instantly. Seconds-granularity windows (a delegation-layer superpower plans don't have) — calendar alignment and pull timing are off-chain concerns you own.

---

*Sources for every claim on this page: [About → Sources](../about.md#sources).*
