import { describe, expect, it } from "vitest";
import { runPhase0 } from "../src/shared/demo-agent";

describe("Node Phase 0", () => {
  it("executes one Pi tool loop and verifies the business result", async () => {
    const result = await runPhase0("node");
    expect(result.evidence).toMatchObject({
      runtime: "node",
      customer: "ACME Trading Pte Ltd",
      outstandingInvoices: 3,
      outstandingTotal: 14520,
      currency: "SGD",
      verification: "PASS",
    });
    expect(result.events).toContain("tool_execution_start");
    expect(result.events).toContain("tool_execution_end");
    expect(result.events.at(-1)).toBe("agent_end");
  });
});
