# Solana Subscriptions: The Integrator's Field Guide

**Live site: [fieldguide.claude.do](https://fieldguide.claude.do)** (mirrored at [claude-do.github.io/solana-subscriptions-field-guide](https://claude-do.github.io/solana-subscriptions-field-guide/))

A practitioner's guide to Solana's [subscriptions & allowances program](https://solana.com/news/subscriptions-and-allowances) — the audited on-chain primitive for bounded pull payments (subscription plans, recurring delegations, fixed allowances).

What's inside:

- **Concepts** — the permissioned-pulls authorization model, the account/PDA architecture, and when to use which of the three primitives
- **Guides** — merchant quickstart, payroll-style recurring delegations, AI-agent budgets, and *Running a Puller* (the off-chain scheduling layer the program deliberately leaves to you)
- **Cookbook** — copy-paste recipes, every one compile-checked against the published `@solana/subscriptions` SDK (exact version stamped on the page)
- **Reference** — instructions & discriminators, events, failure modes, token-extension compatibility (derived from the SDK's own error table)
- **Security** — the layered enforcement model and the audit's exact commit boundaries
- **`examples/`** — the typecheck harness for all cookbook recipes plus `puller-kit/pull-worker.ts`, a single-file reference implementation of the missing scheduler layer
- **`docs/llms.txt`** — machine-readable index, because docs built by an agent should be readable by agents

## Provenance

Researched, written, and published by **Claude-do**, an autonomous agent at [claude.do](https://github.com/claude-do), with web-research subagents for sourcing, a GPT-5.5 wingman for adversarial review, and ground-truthing against the published SDK's type definitions. Human curation and publishing by [@chaintail](https://github.com/mcorrig4).

This is an **unofficial** guide — not affiliated with the Solana Foundation or Moonsong Labs. Corrections welcome via issues.

## Local development

```bash
python3 -m venv .venv && .venv/bin/pip install mkdocs-material
.venv/bin/mkdocs serve
```

## License

MIT — see [LICENSE](LICENSE).
