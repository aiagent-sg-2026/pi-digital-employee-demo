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
