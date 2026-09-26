# 13 — Definition of Done

A task/feature/endpoint/screen is **Done** only when every applicable item below is true.
Phase-specific additions are listed at the end of each phase in `08_PHASE_PLAN.md` §14.

## Universal Checklist
- [ ] **Feature works** — the behavior described in the relevant `01_REQUIREMENTS.md` R-ID(s)
      is implemented and demonstrable.
- [ ] **Validation works** — all applicable rules from `06_BUSINESS_RULES.md` (BR-IDs) are
      enforced, client-side (where relevant) and server-side.
- [ ] **Error handling works** — invalid input returns the standard error shape
      (`05_API_CONTRACTS.md` §0) with an appropriate `code`/`message`/`fields`; the UI surfaces
      the error to the user (not just a console log).
- [ ] **Tests pass** — unit tests for the module's BR-IDs and any integration/component tests
      per `11_TESTING_STRATEGY.md` are written and green.
- [ ] **No broken existing functionality** — full test suite (not just new tests) passes; a
      manual smoke pass of the previous phase's integration checkpoint still works.
- [ ] **API documentation updated** — `05_API_CONTRACTS.md` reflects the actual shipped
      request/response shape (if it drifted from the frozen contract, the drift is logged in
      `14_CHANGELOG.md` and the consumer acknowledged it).
- [ ] **Database changes documented** — `04_DATABASE_SCHEMA.md` reflects any new/changed tables,
      columns, or indexes; a migration file exists in version control.
- [ ] **UI matches mockup intent** — screen matches the relevant IMG:n mockup and
      `02_UI_FUNCTIONALITY.md` spec, or a documented OPEN DECISION explains the deviation.
- [ ] **Integration verified** — the feature works against the real backend/DB in the
      docker-compose stack, not only against mocks (for frontend) or in isolation (for backend).

## Endpoint-Specific Additions
- [ ] Matches its section in `05_API_CONTRACTS.md` exactly (or the contract was amended and the
      consumer notified per `12_GIT_COLLABORATION.md`).
- [ ] Requires and validates JWT auth (unless it's an `/auth/*` route).

## Screen-Specific Additions
- [ ] Loading and empty states are handled (no requirement explicitly demands this, but a blank
      screen with no data is not acceptable for a demo — minimum: a "No records yet" message).
- [ ] Works with both the mock and the live API without code changes beyond the MSW toggle.

## Operation (Receipt/Delivery/Transfer/Adjustment) — Specific Additions
- [ ] Status transitions match `07_STATUS_WORKFLOWS.md` exactly for that document type.
- [ ] Validating writes the correct `stock_ledger` row(s) per BR16.
- [ ] Reference number format matches BR7.

## Phase-Level Done (applies at each phase's integration checkpoint)
- [ ] Every task in that phase's `08_PHASE_PLAN.md` entry is individually Done per the checklist
      above.
- [ ] The phase's Integration Checkpoint scenario (§12 of that phase) is reproducible by someone
      other than the person who built it.
- [ ] `14_CHANGELOG.md` has an entry summarizing the phase's shipped scope and any OPEN DECISIONs
      resolved or newly raised.
