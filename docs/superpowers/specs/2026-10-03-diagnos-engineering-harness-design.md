# Diagnos Engineering Harness (DEH) — design

## Goal

Give the DG Manual a versioned, reviewable engineering workflow that coordinates independent reviewers on one immutable snapshot, one consolidator, and one implementation owner while preserving `main` and requiring evidence before completion.

## Scope

The pilot adds repository instructions, a concise handbook, a machine-readable review-output contract, and a fail-closed branch guard for the local release runner. It does not install or vendor Superpowers or RTK, create or invoke GitHub Actions, change product behavior, publish a production deployment, or merge the PR.

## Workflow

1. Identify the repository, PR, base SHA, head SHA, worktree, and working-tree state. Continue in an isolated implementation branch/worktree; never edit `main` or a detached checkout.
2. Use the Codex Superpowers plugin as the required method: establish the design, write a plan, delegate independent read-only reviews, implement the plan, and verify the final snapshot. If the plugin is unavailable, record that and enable it through the official marketplace before implementation; do not silently skip the method or vendor/install it as a project dependency. Project instructions remain subordinate to system and user instructions.
3. Before implementation, run DSI, Diagnos QA, DRAEL, LURIEL, Security, and Code Review independently against the same head and base. Reviewers do not edit or publish comments. If concurrency limits require batches, freeze the same SHA for every reviewer and disclose the batches.
4. ASTRA consolidates findings, removes duplicates, preserves disagreements and gaps, and writes the implementation plan. LUNA is the sole implementation owner; reviewers remain read-only.
5. Run targeted checks and the applicable local functional/release gate. Revalidate the final SHA with DSI and Diagnos QA, and repeat other review lenses when their scope is affected. Test the applicable UI flows in Chromium at mobile, tablet, and desktop sizes; record what the browser evidence proves and does not prove.
6. Inspect the PR Preview and its health/login/affected flows when an accessible Preview exists. A deployment status or build-ready signal alone is not functional approval. Do not use Actions, open a temporary public tunnel, or deploy to production for this harness.
7. Publish one compact structured report with snapshot identities, reviewers, findings, checks, visual evidence, Preview state, and limitations. Leave merge for explicit human approval.

## Roles

- **DSI:** Diagnos Standard Implement fit and evidence-backed criteria.
- **Diagnos QA:** behavior, bugs, regressions, and exercised/not-exercised scenarios.
- **DRAEL:** reliability, release operations, provenance, and deployment boundaries.
- **LURIEL:** operator workflow, clarity, accessibility, and visual validation.
- **Security:** authorization, secrets, untrusted inputs, supply chain, network, and execution boundaries.
- **Code Review:** diff correctness, maintainability, scope, and integration contracts.
- **ASTRA:** one synthesis and implementation plan; no competing writes.
- **LUNA:** one implementation owner on the isolated branch; no parallel edits to the same files.

## Output and evidence

The JSON Schema in `docs/engineering-harness/review-output.schema.json` defines the compact report contract. Findings must identify priority, condition, impact, evidence, and disposition. Commands and browser scenarios are marked passed only when actually executed; static evidence, self-declared attestations, deployment state, and human approval remain distinct.

## Safety and compatibility

- Preserve the generated Next.js section in root `AGENTS.md`.
- The release runner must reject `main`, detached HEAD, and unavailable branch identity before it creates or rewrites the tracked attestation.
- Release fingerprints must cover active application code under `hooks/` as well as existing source directories.
- RTK is optional and manual. Verify that it is Rust Token Killer before use, prefix only supported commands, and rerun a failing or evidence-critical command without filtering (or through `rtk proxy`). Do not let compact output replace artifacts or detailed diagnostics.
- Do not install tools globally or add dependencies for this documentation-first harness. Follow the project's existing lockfile and local release gate when their prerequisites are available.
- A pre-existing GitHub Actions workflow is outside this change and must not be invoked or represented as DEH validation.

## Acceptance criteria

1. Root `AGENTS.md` links to the workflow and keeps its existing Next.js instructions intact.
2. The handbook describes the ordered review, synthesis, implementation, revalidation, and evidence flow, including no-Actions, no-main, RTK, Superpowers, and Preview boundaries.
3. The JSON Schema parses and covers snapshot identity, six review lenses, finding evidence, checks, visual evidence, Preview, and limitations.
4. Automated release-policy tests reject `main`/detached branch names and prove `hooks/` changes affect the fingerprint.
5. No product/application runtime code, external data, Action workflow, or dependency is changed. Harness policy scripts and their tests may change to enforce branch and fingerprint rules.
