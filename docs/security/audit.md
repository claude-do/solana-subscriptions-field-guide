# Audit Status

**BLUF:** The program was audited by **Cantina** — and per the repo's own `AUDIT_STATUS.md` (dated 2026-04-08), the audit covers the codebase from baseline commit `18a50bc2` with fixes through **`b4b0345f`**; **commits to `main` after `b4b0345f` are unaudited**. "Audited" is a statement about specific commits, not a permanent halo — verify what's actually deployed before you bet revenue on it.

## Who audited it: Cantina (and the Spearbit confusion)

You will find coverage crediting this audit to **Spearbit**. That's outdated, not fabricated: Spearbit and Cantina merged, and **Cantina is the merged entity's name** — the correct present-tense attribution for this audit. Some artifacts (the audit PDF, old links/redirects) still carry legacy branding, which keeps the confusion alive. If you're citing the audit in your own due-diligence docs, write *Cantina*; if a reviewer pushes back with a Spearbit-branded PDF, you now know why both exist.

One more naming archaeology note: the audit-era artifacts refer to the program by its **former internal name, "multi-delegator."** Same program — it was renamed on the way to release. Don't let the old name convince you you've found a different, unaudited codebase.

## Exactly what was audited

| Item | Value |
|---|---|
| Auditor | Cantina (merged Spearbit/Cantina entity) |
| Baseline commit | `18a50bc2` [VERIFY: audit baseline commit hash against the published audit report before publish] |
| Fixes reviewed through | `b4b0345f` |
| Status of later commits | **Unaudited** — per `AUDIT_STATUS.md` in the program repo, dated 2026-04-08 |
| Program under audit | Then named "multi-delegator"; now the subscriptions program, ID `De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44` |

The honest reading of that table: the audit firm reviewed a baseline, the team fixed findings, and the firm's coverage extends through the fix commit `b4b0345f`. Everything merged to `main` after that point — whatever it is — has not been through the same review. The repo says so itself in `AUDIT_STATUS.md`; this guide is just refusing to round that up to "audited, full stop."

## What this means for your integration

Recommendations, clearly framed as such:

1. **Pin your understanding to commits, not vibes.** When evaluating the program, diff the deployed program's source against `b4b0345f` and read what changed since. Small delta → small unaudited surface; large delta → price that in.
2. **Re-check `AUDIT_STATUS.md` before launch.** It's the project's own canonical statement (last seen updated 2026-04-08) — a follow-up audit covering later commits would land there first.
3. **The audit covers the program, not your integration.** Your puller infrastructure, key handling, event indexer, and dunning logic are outside any audit of the on-chain code. The [gate chain](model.md) protects subscribers from over-pulling; nothing in the audit protects *you* from your own scheduler double-firing.
4. **Cite precisely in your own security docs.** "Audited by Cantina from baseline `18a50bc2` through fixes at `b4b0345f`; later commits unaudited per upstream `AUDIT_STATUS.md`" is one sentence and entirely accurate. It will also make your security reviewers trust everything else you wrote more.

**Recap:** Cantina (not Spearbit — merger, not mistake) audited the then-"multi-delegator" program through commit `b4b0345f`; the repo itself flags post-`b4b0345f` commits as unaudited as of 2026-04-08. Treat audit status as a moving, commit-anchored fact and re-verify it the week you ship.

---

*Sources for every claim on this page: [About → Sources](../about.md#sources).*
