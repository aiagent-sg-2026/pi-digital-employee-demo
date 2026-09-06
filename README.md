# Pi Digital Employee Demo

Phase 0 proves one thesis only: the same Pi Agent Core tool loop can run in Node.js and in a browser bundle without duplicating agent logic.

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

## Phase 0 boundary

Not included yet: Employee Core, skills, capability registry, ERP integration, BYOK, IndexedDB persistence, approvals, scheduling, multi-agent, or production credentials.
