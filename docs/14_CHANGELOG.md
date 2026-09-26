# 14 — Changelog

Running log of decisions, contract amendments, and open-decision resolutions. Maintained by
Person 4; any person can add an entry when they make or resolve a decision.

Format: `[Phase] YYYY-MM-DD — Author — Summary`

---

## Initial Documentation Set
`[Planning] — Architect — Generated the full documentation set (00–13, MASTER_EXECUTION_PLAN)
from the hackathon PDF ("StockSense") and 13 Excalidraw mockup images. All usernames/avatar
labels in mockups were excluded as non-requirements per instructions.`

**Open decisions recorded at generation time** (see source docs for full detail):
- `nav-1` (`01_REQUIREMENTS.md`): Dashboard mockup (IMG:12) shows "Stock" in the nav bar where
  every other screen shows "Products". Decision: keep **Products** as the top-level nav item;
  Stock is a tab within Products.
- `transfer-1` (`01_REQUIREMENTS.md`): No mockup exists for Internal Transfers. Decision: model
  its UI/status flow on the Receipt screen (Draft → Ready → Done), no Waiting state.
- `adjust-1` (`01_REQUIREMENTS.md`): No mockup exists for Stock Adjustments. Decision: single-
  step form, status goes directly Draft → Done, applied immediately on submit.
- OTP delivery channel (`02_UI_FUNCTIONALITY.md` / `03_ARCHITECTURE.md`): PDF says "OTP-based"
  but specifies no delivery mechanism. Decision: mock/log OTP server-side for the hackathon demo
  instead of integrating a real SMS/email provider.
- Signup post-submit redirect (`02_UI_FUNCTIONALITY.md`): mockup doesn't specify whether signup
  auto-logs-in or returns to Login. Decision: redirect to Login with a success message.
- Transfer insufficient-stock behavior (`07_STATUS_WORKFLOWS.md`): Decision to block with a
  CONFLICT error rather than add a Waiting-equivalent state, for MVP simplicity.
- Move History "Kanban" grouping (`07_STATUS_WORKFLOWS.md`): mockup shows a kanban-view icon but
  Move History only ever contains Done records. Decision: group by IN/OUT direction instead of
  status — flagged for Person 2/Person 4 alignment at Phase 4 kickoff, may change.
- Role enforcement (`00_PROJECT_OVERVIEW.md`): `role` field exists on `users` but is not enforced
  anywhere in Phase 1–4; Inventory Manager and Warehouse Staff have identical access for MVP.

---

## Template for future entries
```
## [Phase N] YYYY-MM-DD — <Person> — <Title>
- What changed:
- Why:
- Files affected:
- Consumer notified? (Y/N, who)
```
