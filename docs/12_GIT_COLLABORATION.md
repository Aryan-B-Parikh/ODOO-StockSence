# 12 — Git Collaboration Rules

## Branch Naming
`<phase>/<person>/<short-description>`
Examples: `p1/person1/auth-endpoints`, `p2/person2/receipt-list-ui`,
`p3/person3/delivery-waiting-logic`, `p4/person4/docker-compose`.

`main` is always deployable/demo-able at the end of each phase's integration checkpoint.
`phase-N-integration` (optional) can be used as a short-lived phase staging branch if the team
wants an extra buffer before merging straight to `main` — decided at Phase 1 kickoff by Person 4.

## Ownership & File Collision Avoidance
- Follow `09_TEAM_OWNERSHIP.md` strictly: don't edit another person's owned directory without a
  heads-up in the team channel.
- Shared files (`05_API_CONTRACTS.md`, `04_DATABASE_SCHEMA.md`, `frontend/src/shared/*`) require
  a comment/ping to the other affected owner(s) before merging a change.
- `frontend/src/mocks/*` fixtures for a given API section are authored by that section's backend
  owner (e.g., Person 3 authors §6–§9 mocks) and consumed by Person 2 — avoids both people
  editing the same fixture file for different reasons.

## Commit Conventions
Conventional Commits style: `<type>(<scope>): <description>`
Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.
Scope = module name from `09_TEAM_OWNERSHIP.md` (e.g. `feat(receipts): add validate endpoint`).

## Pull / Merge Rules
- Every change lands via PR into `main` (or `phase-N-integration` if used) — no direct pushes to
  shared branches.
- PR must reference the requirement/BR IDs it implements (e.g. "Implements R5.3, BR12").
- At least one other person reviews before merge — prefer the designated backup owner from
  `09_TEAM_OWNERSHIP.md` when available, otherwise any teammate.
- PRs should be small and endpoint-scoped (e.g., one PR per endpoint) to support the incremental
  mock→live swap pattern described in `08_PHASE_PLAN.md`/`10_DEPENDENCY_MATRIX.md` — avoid
  "land the whole module at once" PRs.

## Conflict Resolution
- If two people must touch the same file, the owner (per `09_TEAM_OWNERSHIP.md`) resolves; the
  non-owner proposes changes via PR comment or a small patch rather than pushing directly.
- Merge conflicts in shared docs (this document set) are resolved by combining both changes and
  logging the resolution in `14_CHANGELOG.md` if it affects a decision.

## No Force-Pushing Shared Branches
- Never `git push --force` to `main` or `phase-N-integration`.
- Force-push is only permitted on a person's own feature branch before it's opened as a PR.

## Phase Gates
- A phase is not "done" for merge purposes until its Integration Checkpoint (per
  `08_PHASE_PLAN.md` §12 of that phase) passes with all 4 people present or async-confirmed.
- Contract files (`05_API_CONTRACTS.md`, `04_DATABASE_SCHEMA.md`) are frozen at each phase
  kickoff; changes after freeze require a `14_CHANGELOG.md` entry and explicit ack from the
  consumer before merge (see `09_TEAM_OWNERSHIP.md` "Decision Authority").
