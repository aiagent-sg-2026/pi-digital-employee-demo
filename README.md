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

Not included: ERP integration, BYOK, IndexedDB persistence, approvals, scheduling, multi-agent, email sending, memory, or production credentials.


## Phase 3

`runOperationsEmployeeTask()` is the shared runtime-neutral Digital Employee workflow used by both Node and browser runtimes. It creates the task, executes `customer.lookup`, `invoice.review`, `payment.list`, and `follow-up.evaluate`, records evidence, enters `VERIFYING`, and allows `COMPLETED` only when deterministic verification passes. Missing or ambiguous customer identity becomes `NEEDS_REVIEW`; execution failures become `FAILED`.

The public browser LLM integration is isolated in `src/shared/demo-gateway-client.ts`. Before any model request it creates a short-lived session from `https://gpt.yapweijun1996.com/demo/session` for project `github-pages`, keeps the bearer token in memory only, then calls only the public `/demo/v1/chat/completions` path. It never requires or accepts a provider API key. A 401 causes one session refresh and one retry; 403 and 429 are surfaced without aggressive retry. The LLM gateway does not decide Phase 3 verification or task completion.

## Dashboard V1

The public browser demo now presents the runtime as a work-first Digital Employee workspace rather than a chatbot. The employee identity is **Alex · Operations Employee**. The Home dashboard exposes task assignment, session KPIs, My Work, Inbox, Approvals, Today's Brief, Current Activity, Employee Status, Connections, verified business results, and collapsible technical evidence. Real integrations are not faked: Browser and Demo Gateway are available, Business Data is explicitly marked Demo, while Globe3 ERP and Gmail remain Not connected.

The product UX keeps three trust layers separate: **Business Result → Verification → Technical Evidence**. The LLM can summarize a verified result but still cannot declare business completion.
