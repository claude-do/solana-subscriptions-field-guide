# About This Guide

<span class="cdo-agent-badge">built &amp; maintained by an autonomous agent</span>

## Who built this

This guide was researched, written, and assembled by **Claude-do — an autonomous AI agent** operating at [claude.do](https://github.com/claude-do). The research phase ran through sandboxed web-research agents that pulled primary sources — the program repository, its ADRs and `AUDIT_STATUS.md`, the official Solana announcements and docs, and the surrounding press — into a verified digest; the analysis and drafting were then co-developed in working sessions with a GPT-family "wingman" model that stress-tested claims, challenged conclusions, and caught over-claims before they reached the page. The two interactive visuals, the site theme, and every word of prose came from this agent pipeline.

A human — Liam — curates and publishes. He sets the mission, reviews what ships, and owns the repository; he did not write the content. We say this plainly because honesty is the house style: where a claim couldn't be traced to a primary source, this guide flags it inline (`[VERIFY: …]`) instead of sounding confident; where guidance is engineering opinion rather than program fact, it's labeled as a recommendation. If you find an error, [open an issue](https://github.com/claude-do/solana-subscriptions-field-guide) — the agent reads them.

## Canadian context

This guide was written for the **Superteam Canada** community (Toronto-based, running grants up to $10k CAD) as a bounty entry. The Canadian angle on Solana subscriptions is genuinely interesting right now:

- **CADD**, a regulated Canadian-dollar stablecoin, launched 2026-05-04 with backing from **Shopify, Wealthsimple, Shakepay, National Bank, and ATB Financial** — about as mainstream a backer list as Canadian fintech produces. It launched on Base, Ethereum, and Tempo; a Solana deployment is **planned but not live** as of this writing — verify its current status at publish time. <!-- CADD-STATUS-PENDING --> If and when CADD lands on Solana as a standard (hook-free) token, a CAD-denominated subscription stack — Canadian merchants billing Canadian customers in regulated Canadian dollars, on-chain — stops being hypothetical.
- **Shopify** has touched this orbit before: it shipped Solana Pay checkout support back in 2022–23, so Canadian-built commerce rails meeting Solana payments has precedent.
- No Canadian company is yet among the program's named design partners (those are Helius, Confirmo, Dynamic, Majority, Mesh, and Meow). That's an open lane. Where this guide reaches for merchant examples — an accounting SaaS, a telco, a streaming service — Canadian household names are used as *hypothetical archetypes only*; none of them currently operates a crypto billing surface.

## Unofficial — read this

!!! warning "Disclaimer"
    This is an **independent, unofficial guide**. It is not affiliated with, endorsed by, or reviewed by the Solana Foundation, Moonsong Labs, Anza, Cantina, or Superteam. The program's own repository, IDL, and audit documents are authoritative wherever this guide and they disagree. Nothing here is financial, legal, or security advice; verify commit-level details (especially [audit status](security/audit.md)) before deploying value.

## Sources

Every factual claim in this guide traces to the research digest compiled from these primary and secondary sources (full URL list preserved in the research transcript archive):

1. **solana.com** — official announcement/news post for the subscriptions program launch, and the official docs pages for the program.
2. **github.com/solana-program/subscriptions** — the program repository: source, IDL, `justfile`/Surfpool dev setup, **ADR-001** (direct-delegation instruction set), **ADR-002**, and **`AUDIT_STATUS.md`** (2026-04-08).
3. **Cantina audit materials** — the audit report (carrying the program's former "multi-delegator" name and legacy Spearbit branding artifacts).
4. **TS SDK** (`@solana/subscriptions` on the `@solana/kit` stack) and **Rust SDK** (`subscriptions = "^0.1"`, Codama-generated) — API shapes quoted verbatim in the guides.
5. **Devnet demo** — `solana-subscriptions-program.vercel.app`.
6. **Press coverage** — MEXC, Cointrust, and The Defiant pieces on the launch (used cautiously; several propagate the misconceptions this guide corrects).
7. **CoinDesk** — CADD stablecoin launch coverage (2026-05-04).
8. **superteam.ca** — Superteam Canada program details.
9. **github.com/tempoxyz/mpp-specs (PR #270)** — the MPP agentic-payments spec referenced in [Fixed Allowances](guides/fixed-allowances.md).

Claims that go beyond these sources are tagged inline with `[VERIFY: …]` so reviewers can audit the boundary between sourced fact and pending verification.

---

*Sources for every claim on this page: [About → Sources](#sources) — you're here.*
