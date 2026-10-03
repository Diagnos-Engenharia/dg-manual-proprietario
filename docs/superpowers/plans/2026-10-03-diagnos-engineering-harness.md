# Diagnos Engineering Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the DEH pilot workflow and enforce isolated-branch release evidence for the DG Manual.

**Architecture:** Keep repository-wide rules concise in the existing root `AGENTS.md`, with details in a handbook and JSON Schema. Extend the existing release policy and built-in Node tests so tracked release evidence cannot be rewritten from `main` or detached HEAD and active `hooks/` code invalidates the fingerprint.

**Tech Stack:** Markdown, JSON Schema, Node.js built-ins, existing `node:test` release-policy suite.

**Spec:** `docs/superpowers/specs/2026-10-03-diagnos-engineering-harness-design.md`

## Global Constraints

- Do not write to `main`, invoke or add GitHub Actions, deploy production, merge, install global tools, or add dependencies.
- Preserve the generated Next.js instructions in `AGENTS.md`.
- Keep the release attestation tied to the existing fingerprint policy; do not fabricate or hand-edit a passing attestation.
- Treat reviewers as read-only and use one base/head SHA for every review round.
- RTK is optional and must not filter away required diagnostics or evidence.

## Review Focus

- Detached checkout — release runner must fail before creating or rewriting `.qa/release-attestation.json`.
- Main branch — same fail-closed behavior before any tracked write.
- Nested `hooks/` implementation — changing a hook must change the material fingerprint.
- Optional/unavailable RTK — workflow remains executable with ordinary command output.
- Missing hosted Preview — report it as unavailable/unverified; do not substitute production or a public tunnel.

---

### Task 1: Enforce the branch and fingerprint policy

**Files:**
- Modify: `scripts/release-policy.cjs`
- Modify: `scripts/run-release-gate.cjs`
- Test: `tests/release-policy.test.cjs`

**Interfaces:**
- Produces: `assertImplementationBranch(branchName)` exported by `scripts/release-policy.cjs`; accepts a named branch other than `main`, throws for empty, detached, `unknown`, or `main`.
- The release runner obtains `git branch --show-current` through its existing helper and validates it before setting `started`, creating output directories, running migrations, or writing the attestation.

- [x] **Step 1: Add failing policy tests** for accepted feature branch and rejected `main`, empty, and `unknown` branch values; extend the fingerprint fixture with a `hooks/` file and assert its change changes the fingerprint.
- [x] **Step 2: Run the focused test** with `node --test tests/release-policy.test.cjs`; both new policy assertions failed before implementation.
- [x] **Step 3: Implement the branch guard and add `hooks/` to the fingerprint walk** with no new dependencies.
- [x] **Step 4: Rerun the focused test**; all release-policy tests passed.
- [x] **Step 5: Check runner ordering**; branch validation occurs before directory creation, release work, migrations, and tracked report writes.
- [x] **Step 6: Add failing regression tests** proving release subprocesses omit operator secrets and symlinked artifact paths resolving into the checkout are rejected.
- [x] **Step 7: Implement the minimal child environment and real-path containment check**; validate both output paths before and after creation.
- [x] **Step 8: Rerun the focused suite**; environment and symlink regressions pass with no new dependency.

### Task 2: Add the DEH instructions and output contract

**Files:**
- Modify: `AGENTS.md`
- Create: `docs/engineering-harness/README.md`
- Create: `docs/engineering-harness/review-output.schema.json`
- Test: `tests/release-policy.test.cjs`

**Interfaces:**
- Root `AGENTS.md` points to the handbook without duplicating its role details.
- Report schema requires repo/PR/base/head identity, review coverage, findings, executed checks, visual evidence, Preview state, and limitations.
- Schema and example fixtures use only JSON Schema and Node built-ins; no validator dependency is introduced.

- [x] **Step 1: Add failing contract assertions** that parse the schema, require its declared top-level fields and roles, and pin success evidence and viewport rules.
- [x] **Step 2: Run `node --test tests/release-policy.test.cjs`**; schema assertions failed before the schema was added.
- [x] **Step 3: Add concise root rules and the handbook** for required Superpowers, optional manual RTK, six independent read-only reviews, ASTRA consolidation, LUNA implementation, no-main/no-Actions, post-implementation validation, and preview/evidence boundaries.
- [x] **Step 4: Add the JSON Schema** with compact, unambiguous finding/check/evidence fields and a single shared snapshot reference.
- [x] **Step 5: Rerun focused tests and parse the JSON Schema**; all five tests passed without a new package.

### Task 3: Validate the final snapshot and prepare the PR

**Files:**
- Final user-facing validation report: compact JSON output conforming to `docs/engineering-harness/review-output.schema.json`.
- Reviewed: all DEH files above plus the complete branch diff.

The run-specific report is delivered outside the code branch so its snapshot SHA is not made stale by committing the report itself.

- [x] **Step 1: Run focused Node tests and static checks** (`node --test tests/release-policy.test.cjs`, `node scripts/verify-release.cjs` when its fingerprint is current, `git diff --check`). The focused suite passes 8/8 and syntax/diff checks pass. `verify-release` was attempted and correctly refused a stale attestation after material changes.
- [x] **Step 2: Attempt the project's requested release/build/browser checks only with the isolated test database, private-file directory, and dependencies configured; record any blocked stage without claiming success.** The full `test:gate` stops before suites because pnpm rejects the existing `xlsx@0.20.3` lock entry without tarball integrity. The release gate, build, and browser run were not attempted without their isolated database, Docker, and installed dependencies.
- [x] **Step 3: Re-run DSI and QA independently against the exact final SHA/base; include Security and Code Review findings for changed surfaces.** Reviewer results and any residual blockers are captured in the run-specific report.
- [x] **Step 4: Inspect an accessible PR Preview for health, login, affected visual/functional flows; otherwise state why no live preview was validated. Do not invoke Actions, use an unauthenticated tunnel, or deploy production.** Vercel reported deployment failure for the reviewed head, so login and visual/functional Preview checks remain blocked.
- [x] **Step 5: Record the compact structured report and inspect `git diff --check`, changed-file list, and PR base/head.** The report is saved outside the branch so its head SHA remains stable.

**Pilot execution outcome:** The branch guard, fingerprint, output contract, and handbook checks pass locally. The existing release attestation is stale by design after source changes and was not edited or regenerated. No full release, browser, or live Preview validation is claimed. See the run-specific JSON report for the exact snapshot, reviewer evidence, and command outcomes.
