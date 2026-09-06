import { describe, expect, it } from "vitest";
import { runPhase0 } from "../src/shared/demo-agent";

describe("Browser Phase 0 contract", () => {
  it("uses the same Pi agent/tool implementation with browser runtime evidence", async () => {
    const result = await runPhase0("browser");
    expect(result.evidence).toMatchObject({
      runtime: "browser",
      outstandingInvoices: 3,
      outstandingTotal: 14520,
      verification: "PASS",
    });
  });
});
