# Pi Digital Employee Demo

Phase 2 keeps the Phase 0/1 portability proof and adds a deterministic, runtime-neutral mock business API. The Operations Assistant reaches customer, invoice, payment, and follow-up behavior through registered capabilities; a Pi adapter continues to own the Pi Agent Core boundary.

## Phase 0

- `@earendil-works/pi-agent-core` 0.85.0
- shared `runPhase0()` agent/tool implementation
- Node runtime proof
- browser-first Vite bundle proof
- deterministic fake stream, so no provider API key is required
- one real Pi `Agent` tool execution lifecycle

The deterministic stream replaces only the LLM provider. Tool execution, agent state transitions, event emission, and the second turn after the tool result are executed by Pi Agent Core itself.

## Commands

```bash
npm install
npm run demo:node
npm test
npm run build
npm run dev
```

Expected business result in both runtimes:

- Customer: ACME Trading Pte Ltd
- Outstanding invoices: 3
- Outstanding total: SGD 14,520
- Verification: PASS

## Phase 2

`createMockBusinessApi()` exposes a fixed, validated dataset with paid, outstanding, overdue, future-due, partial-payment, credit-note, and duplicate-record scenarios. `createOperationsRuntime()` registers `customer.lookup`, `invoice.review`, `payment.list`, and `follow-up.evaluate` identically for Node and browsers. The fixed review date keeps results repeatable: ACME has three outstanding invoices totaling SGD 14,520 after canonical payments and credits are applied.

## Phase 2 boundary

Included: the Phase 0/1 behavior, Employee Core contracts, capability registry, mock business data/API, deterministic follow-up policies, operations-assistant definition, and Node/browser regression coverage.

Not included: ERP integration, BYOK, server-side durable persistence, production approvals, scheduling, multi-agent, email sending, long-term employee memory, or production credentials.


## Phase 3

`runOperationsEmployeeTask()` is the shared runtime-neutral Digital Employee workflow used by both Node and browser runtimes. It creates the task, executes `customer.lookup`, `invoice.review`, `payment.list`, and `follow-up.evaluate`, records evidence, enters `VERIFYING`, and allows `COMPLETED` only when deterministic verification passes. Missing or ambiguous customer identity becomes `NEEDS_REVIEW`; execution failures become `FAILED`.

The public browser LLM integration is isolated in `src/shared/demo-gateway-client.ts`. Before any model request it creates a short-lived session from `https://gpt.yapweijun1996.com/demo/session` for project `github-pages`, keeps the bearer token in memory only, then calls only the public `/demo/v1/chat/completions` path. It never requires or accepts a provider API key. A 401 causes one session refresh and one retry; 403 and 429 are surfaced without aggressive retry. The LLM gateway does not decide Phase 3 verification or task completion.

## Dashboard V1

The public browser demo now presents the runtime as a work-first Digital Employee workspace rather than a chatbot. The employee identity is **Alex · Operations Employee**. The Home dashboard exposes task assignment, session KPIs, My Work, Inbox, Approvals, Today's Brief, Current Activity, Employee Status, Connections, verified business results, and collapsible technical evidence. Real integrations are not faked: Browser and Demo Gateway are available, Business Data is explicitly marked Demo, while Globe3 ERP and Gmail remain Not connected.

The product UX keeps three trust layers separate: **Business Result → Verification → Technical Evidence**. The LLM can summarize a verified result but still cannot declare business completion.

## Typography and layout SSOT

The dashboard uses the browser/OS built-in `system-ui` stack and ships no font files, font CDN, or icon font. This avoids adding a font asset/license dependency to the project. If a bundled font is introduced later, it must be open-source; prefer MIT when available and otherwise require an explicitly approved open font license.

Readable type scale:

- 12px: metadata, badges, developer/audit secondary text — absolute visual floor.
- 14px: standard UI text, navigation, tables, activity, checks, buttons.
- 16px: body default, task input, primary readable content.
- 18px: section/card headings.
- 20px: reserved medium heading token.
- 24px: KPI values.
- 32px: desktop page heading; 28px on mobile.

Layout scale:

- Wide desktop: 240px sidebar / flexible main / 360px employee rail.
- Compact desktop (<=1280px): 220px sidebar / flexible main / 330px rail.
- <=1120px: employee rail moves below the main workspace.
- <=760px: single-column mobile layout with no horizontal overflow.

Do not introduce visible UI text below 12px. Keep spacing, row heights, card padding, and column widths aligned with the typography scale rather than shrinking text to make content fit.

## Dashboard V1 behavior contract

The public dashboard is deliberately work-first and user-triggered:

- Fresh browser storage starts at `0 tasks`, `Ready`, and does not run ACME or call the Demo Gateway on page load.
- Quick actions are composer suggestions only. The user must explicitly press Assign.
- New Task clears the composer and selected task detail while preserving the demo ledger/history.
- The V1 capability router accepts only ACME receivables work, the explicitly labelled unknown-customer exception test, and the explicitly labelled approval demo. Unsupported tasks are blocked before business execution or any model request.
- Search, Settings, and unimplemented sidebar destinations are not shown as fake controls.
- The fixed business fixture is labelled `Demo dataset · Snapshot 1 Mar 2025 · Read-only fixture`.

### Verification versus demo oracle

`DEMO_ORACLE` records fixture acceptance expectations such as ACME's 3 outstanding invoices and SGD 14,520 total. Those values are test/oracle data, not workflow completion rules. Runtime completion uses business invariants: customer identity consistency, outstanding count/total reconciliation, non-negative balances, currency consistency, canonical duplicate suppression, follow-up coverage and amount consistency, and canonical payments.

### Demo approval flow

`Demo approval flow` is explicitly marked as a Demo Scenario. It pauses a task as `Needs Approval`, shows what/why/affected data/business impact, and supports Approve & Resume or Reject. Approval never writes to ERP, Gmail, credit limits, or any external business source.

### Demo ledger and KPI semantics

Task history is persisted in browser IndexedDB under a versioned demo ledger so reloads preserve work history without treating localStorage as the durable store. Existing V1 localStorage ledger data is migrated once into IndexedDB and the legacy key is then removed. The Demo Gateway bearer token remains memory-only and is never written to IndexedDB or localStorage. The dashboard provides a Clear demo history action.

KPI semantics are intentional:

- completed task throughput counts repeated completed tasks;
- customers handled is unique by customer;
- outstanding reviewed is unique by customer + dataset snapshot, so repeating the same ACME review does not double-count SGD 14,520;
- need attention counts unresolved inbox items plus pending approvals.

### Mobile hierarchy and accessibility

At mobile widths the desktop sidebar becomes a bottom navigation with Home, Work, Inbox, Approvals, and More. Employee status, connections, verification, and evidence live in a bottom-sheet trust drawer rather than extending the page. My Work renders task cards with context and progress instead of hiding table columns. Visible mobile controls target at least 44px. A skip link, `:focus-visible`, Escape-to-close drawer behavior, and keyboard focus transfer are part of the contract.
