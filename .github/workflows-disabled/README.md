# Disabled workflows

Workflows parked here are **not run by GitHub** — Actions only picks up
`.yml` files directly inside `.github/workflows/`. They're kept as
recoverable backups, not deleted.

## `p2p-collaboration.yml.bak`

End-to-end P2P collaboration test from the **Radicle era** (pre-rc.21).
Exercised `rad init` / `rad clone` / `rad push` on a single runner, plus a
manual multi-runner mode that connected two VMs over a Tailscale VPN.

Disabled in the rc.22 cleanup because:

- rc.21's "Great Simplification" replaced Radicle with GitHub as the
  collaboration transport — every `rad` command in this workflow is now
  dead infrastructure.
- Its `push` path filter watched `src/features/social-resonance-filter/**`,
  `src/features/coherence-beacon/**`, and `src/features/dreamnode-updater/**`
  — exactly the files the pivot churned — so it failed on every commit.

**To revive it**: rewrite the Alice/Bob test bodies against the GitHub
transport — `gh repo create` for outbox setup, `git clone`/`git fetch` over
HTTPS instead of `rad clone`, the sovereignty-handover dance (rename cloned
`origin` → peer remote, create own outbox), and coherence-beacon propagation
through `git commit -F` beacon commits. The job *structure* (single-runner
localhost mode, two-peer fixtures) is still a fine skeleton; only the
transport calls need swapping. Then move it back into `.github/workflows/`.
