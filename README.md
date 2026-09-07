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
