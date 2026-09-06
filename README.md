# Pi Digital Employee Demo

Phase 1 keeps the Phase 0 portability proof while introducing a small runtime-neutral Employee Core. The operations assistant is data-driven and refers to capabilities such as `invoice.review`; a Pi adapter handles the Pi Agent Core boundary.

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

## Phase 1 boundary

Included: Employee Core contracts, capability registry, minimal task state transitions, operations-assistant definition, and Node/browser regression coverage.

Not included: ERP integration, BYOK, IndexedDB persistence, approvals, scheduling, multi-agent, email sending, memory, or production credentials.
