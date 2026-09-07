# Pi Digital Employee Demo — Business World V1

A browser-first Digital Employee demo built around one product idea:

> A small fictional company exists inside the browser, and Alex is actually working in it.

The public GitHub Pages application is **work-first, not chat-first**. A user assigns work; Alex resolves a capability, reads business data, records task events, handles review/approval states, verifies the result deterministically, stores evidence, and only then may ask the Demo Gateway for a manager-friendly summary.

## Current product

Employee:

- **Alex**
- **Operations Employee**
- Customer & finance operations
- Browser-first static GitHub Pages runtime

Demo company:

- **Northstar Distribution Pte Ltd**
- Seed: `demo-business-v1`
- Snapshot: `2025-03-01`
- Business + work SSOT: local IndexedDB
- External ERP/Gmail writes: not connected

Fresh storage always starts with:

- `0 tasks` completed by Alex
- `Ready for work`
- no automatic ACME execution
- no Demo Gateway request
- a seeded business snapshot and pre-existing fictional business exceptions

## Architecture

```text
Dashboard / Scenario Library / Customers / History
                    │
                    ▼
              Task Router
                    │
                    ▼
       Business World Employee Workflow
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
 BusinessRepository      WorkRepository
          │                   │
          └─────────┬─────────┘
                    ▼
             Local IndexedDB
                    │
                    ▼
       Deterministic Verification
                    │
             PASS only ──────► Demo Gateway summary
```

The browser entry `src/browser/main.ts` is intentionally thin. Browser orchestration/projection lives in `src/browser/dashboard-controller.ts`; business data and work history are accessed through repository abstractions rather than direct IndexedDB calls from the employee workflow.

Key modules:

```text
src/demo/seed.ts
src/data/models.ts
src/data/indexeddb.ts
src/data/business-repository.ts
src/data/work-repository.ts
src/core/business-world-workflow.ts
src/core/demo-approval.ts
src/browser/task-router.ts
src/browser/dashboard-controller.ts
src/browser/main.ts
```

The earlier Phase 0–3 ACME mock workflow remains in the repository as Node/browser regression coverage and portability proof. It is no longer the browser Business World SSOT.

## IndexedDB schema

Database:

```text
digital-employee-dashboard-v1
DB version: 2
```

Business stores:

- `meta`
- `customers`
- `invoices`
- `payments`
- `creditNotes`
- `followUpPolicies`

Work/audit stores:

- `tasks`
- `taskEvents`
- `approvals`
- `inbox`
- `evidence`
- `draftActions`

Business entities are not duplicated into each task. Tasks contain task-level summary/status; detailed execution evidence is stored separately.

## Demo seed pack

`demo-business-v1` currently seeds approximately:

- 17 canonical customers plus a legacy duplicate row
- 44 invoices
- 23 payments
- 7 credit notes
- 6 follow-up policies
- 5 seeded inbox/exception items
- 3 launchable approval scenarios

Included business cases:

- fully paid accounts
- partial payments
- 45+ day overdue invoices
- future/upcoming due invoices
- credit notes
- duplicate invoice/payment imports
- unmatched payment
- ambiguous customer identity (`Twin`)
- credit-limit exposure
- invoice dispute
- customers with zero action required

ACME is preserved for regression compatibility. It still reconciles to three open invoices and SGD 14,520 in the fixed seed, but those fixture values are not runtime completion rules.

## Supported capabilities

The browser task router supports:

- `customer.lookup`
- `receivables.review`
- `payments.reconcile`
- `followup.prepare`
- `exceptions.review`
- `portfolio.overdue`
- `daily.brief`

Examples:

```text
Review ACME receivables.
Check Beacon receivables.
Show overdue customers.
Which customers owe us the most?
Investigate unmatched payments.
Resolve ambiguous customer.
Review today's exceptions.
Prepare today's brief.
```

A uniquely resolved customer executes. An ambiguous or missing customer becomes `Needs Review`. Unsupported work is `Blocked` before business execution; it is not silently reinterpreted as a failed customer lookup.

## Portfolio work

`portfolio.overdue` works across the company rather than a single customer. It produces:

- total overdue customers
- total overdue amount
- highest-priority accounts
- upcoming-due accounts
- exceptions requiring review

This is derived from the seeded business stores at runtime.

## Task event ledger

Task history uses event-based lifecycle records such as:

```text
CREATED
ROUTED
STARTED
CUSTOMER_RESOLVED
CAPABILITY_STARTED
CAPABILITY_COMPLETED
VERIFYING
NEEDS_REVIEW
NEEDS_APPROVAL
APPROVED
REJECTED
RESUMED
COMPLETED
FAILED
```

Current Activity and History are projections of these events where applicable. Evidence is kept separately from the task record.

## Verification

Business completion is verification-gated. The LLM cannot declare a task complete.

Runtime checks include business invariants such as:

- unique customer identity
- reviewed records match the resolved customer
- invoice count consistency
- outstanding-total reconciliation
- non-negative balances
- currency consistency
- duplicate suppression
- canonical payments
- follow-up coverage
- follow-up amount equals the corresponding outstanding balance
- portfolio totals/count consistency

Fixed fixture expectations such as ACME's `3` invoices / `SGD 14,520` remain Golden Oracle/test data only.

## Approval simulation

Approval scenarios are explicitly labelled:

- `Local Demo Simulation`
- `No external system changed`

A pending approval pauses the task. Approve & Resume:

1. records `APPROVED`
2. records `RESUMED`
3. creates a local `draftActions` record
4. resumes the repository-backed workflow
5. runs deterministic verification
6. records evidence/result

Reject marks the task blocked, records `REJECTED`, stores rejection evidence, and performs no business execution.

Current scenario library includes ACME, Bright Star high-value, and Riverside dispute approval examples.

## Inbox

Inbox items are real local work-queue records with:

- type
- severity
- related entity
- status
- title/detail
- resolution

Supported lifecycle:

```text
Open → Investigate → Resolve
                   ↘ Escalate
```

Seeded examples include unmatched payment, duplicate payment, invoice dispute, credit-limit exposure, and ambiguous identity. Runtime review/approval tasks can add additional inbox items.

### Recoverable human review and issue identity

`Needs Review` is recoverable work, not a terminal demo state. Ambiguous customer reviews persist candidate customer IDs on the original task. The manager sees human-readable candidate cards with customer name, code, risk and outstanding balance. Selecting a candidate records `REVIEW_RESOLVED`, stores the chosen canonical customer, resumes the **same task ID**, reruns receivables work, and reaches deterministic verification. The complete pre-review and post-review event timeline remains inspectable.

Inbox records use stable `issueKey` identities plus `relatedTaskIds`. Repeating the same unresolved ambiguity updates the existing actionable item rather than inserting unbounded duplicates. Approval records and their approval-required Inbox item share the same issue identity, so `Need attention` counts a manager action once rather than counting both UI representations.

Inbox resolution is domain-specific and always local-only:

- ambiguous customer → select canonical customer and resume the related task;
- duplicate payment → suppress the duplicate import record locally;
- unmatched payment → map to an existing invoice/customer, dismiss, or escalate;
- invoice dispute → acknowledge, escalate, or request manager review;
- credit-limit exception → convert the issue into a local approval workflow.

Every local resolution can append task event/evidence records. No action writes to Globe3 ERP, Gmail, a bank, or any external business system.

### Task outcome versus issue resolution

Task execution and business issue resolution are projected separately. A successful payment/exception investigation may be `Investigation completed · Action required` while the discovered Inbox issues remain open. When all related issues are resolved locally, the task can project `Completed · Resolved`. This prevents a green task-completion state from implying that every underlying business issue has been resolved.

## Dashboard semantics

Home separates two different concepts.

### Employee Activity

- Tasks completed
- Customers handled
- Pending approvals
- Need attention

These remain zero for completed work on a fresh visitor until the user actually assigns something.

### Business Snapshot

- Open receivables
- Overdue invoices
- Customers at risk
- Exceptions

These may be non-zero immediately because the fictional company is already seeded.

## Scenario library

Scenario buttons only populate the composer. They never execute automatically.

Categories:

- Normal Work
- Exception
- Approval

The user must still press Assign.

## Customers and History

Customers is backed by IndexedDB and supports:

- search/list
- account summary
- invoices
- payments
- risk/credit limit
- related tasks

History is persistent and supports task status plus event-timeline inspection. Result, verification, and evidence remain available through the task detail/trust UI after refresh.

## Reset and migration

Three actions are intentionally separate:

- **Clear task history** — clears tasks/events/approvals/evidence/drafts and runtime-created inbox items; seeded business data remains.
- **Restore sample business data** — restores deterministic business entities and seeded exception records while preserving task history.
- **Reset entire demo** — clears all local demo stores and recreates the deterministic seed with zero task history.

Migration supports both prior persisted formats:

- legacy `localStorage` ledger
- previous IndexedDB v1 `dashboard-state / ledger`

Valid legacy task/history data is migrated into separated v2 stores before the old ledger record/key is removed. Migrated browsers may retain the now-empty legacy object-store shell until a future DB version upgrade; fresh v2 databases contain only current Business World stores.

## Demo Gateway security boundary

The Demo Gateway bearer token remains memory-only.

It is never written to:

- IndexedDB
- localStorage
- sessionStorage
- source code
- Git history

The Gateway is used only after deterministic verification passes and only to summarize already-verified facts.

## Mobile and accessibility

- SVG-only UI icons
- `system-ui` font stack; no external font CDN/files
- 12px visible metadata floor, 14–16px normal UI/body scale
- bottom navigation on mobile
- employee trust rail becomes a bottom-sheet drawer
- My Work becomes task cards on mobile
- Scenario Library becomes a horizontal scroller
- Customers/History are compact on mobile and expand on demand
- visible interactive targets target at least 44px
- skip link + `:focus-visible`
- Escape closes the trust drawer
- no horizontal overflow at 390×844

## Commands

```bash
npm install
npm test
npm run build
npm run dev
```

The older Pi portability proof can still be run with:

```bash
npm run demo:node
```

## Production-demo boundary

This is a static public demo, not a production ERP employee.

Not connected / not claimed:

- server-side database
- real Globe3 ERP write access
- Gmail sending
- cross-device task synchronization
- production identity/RBAC
- external approval execution
- production credentials

Local IndexedDB is the Business World V1 SSOT. A future real-business pilot can replace the repository adapters while preserving the employee/task/verification contracts.

## PWA standard and update lifecycle

The GitHub Pages browser app is a scoped installable PWA. `package.json` is the semantic version SSOT; the production build also embeds the current Git commit/build id, shown in the UI as `v<version> · <build>`. The manifest uses only local SVG app icons, including a maskable SVG, preserving the project's SVG-only icon rule.

Build output includes:

- `manifest.webmanifest` — standalone app identity, scope, theme and SVG icons.
- `sw.js` — versioned service worker with app-shell precache and offline navigation fallback.
- `version.json` — network-fresh version/build metadata for diagnostics.

The service worker never caches cross-origin requests, non-GET requests, Demo Gateway traffic, bearer tokens, or IndexedDB business/task data. Business/task state remains in IndexedDB and the Demo Gateway token remains memory-only.

Updates are intentionally user-controlled. A new deploy installs as a waiting service worker. The dashboard surfaces `Update available` with the target `v<version> · <build>` and an **Update Now** action. Only Update Now sends `SKIP_WAITING`; after `controllerchange` the page reloads onto the new shell. The app checks for updates on focus, when returning to a visible tab, and every 30 minutes.

A supported browser may also expose the custom `Install App` action through `beforeinstallprompt`. Chromium installability is validated against the generated manifest; offline reload is covered by browser E2E.

## Product information architecture and hash routing

The static GitHub Pages app uses a small Vanilla TypeScript hash router rather than pretending one long document is a set of pages. GitHub Pages therefore remains direct-link safe without a server rewrite rule.

Primary routes:

- `#/home` — dashboard overview, composer, KPI, business snapshot and previews.
- `#/work` — operational task queue with status/customer filtering.
- `#/inbox` — full actionable Inbox with URL filters.
- `#/customers` and `#/customers/:customerId` — customer workspace and deep-linked account detail.
- `#/history` — terminal/audit work only.
- `#/approvals` and `#/approvals/:approvalId` — manager decision queue and detail.
- `#/tasks/:taskId?tab=...` — Result / Timeline / Verification / Evidence / Related Issues / Related Approval.
- `#/capabilities` — supported Digital Employee capabilities and verification boundaries.
- `#/connections` — real/demo/not-connected runtime boundaries.
- `#/settings` — language, PWA/app information and destructive demo-data controls.

Sidebar/mobile navigation uses route-aware active state and `aria-current="page"`. Browser Back/Forward follows the same source of truth. Detail routes hydrate IndexedDB before rendering and never rerun a business task or call the Demo Gateway merely because a URL was refreshed.

Customer actions preserve navigation semantics: **View exceptions** routes to the filtered Inbox and **View related tasks** routes to filtered My Work. Review/prepare actions remain explicit composer suggestions and never auto-run.
