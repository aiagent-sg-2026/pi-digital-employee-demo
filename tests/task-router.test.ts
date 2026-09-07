import { describe, expect, it } from "vitest";
import { routeDashboardTask } from "../src/browser/task-router";

describe("Digital Employee task capability router", () => {
  it("routes ACME receivables work", () => {
    expect(routeDashboardTask("Review ACME outstanding invoices and prepare follow-up actions.")).toMatchObject({
      intent: "receivables-review",
      customerQuery: "ACME",
    });
  });

  it("routes the explicit unknown-customer demo", () => {
    expect(routeDashboardTask("Test unknown-customer exception")).toMatchObject({
      intent: "unknown-customer-demo",
      customerQuery: "NO-SUCH-CUSTOMER",
    });
  });

  it("routes only explicitly labelled approval demo work", () => {
    expect(routeDashboardTask("Demo approval flow for ACME follow-up preparation.")).toMatchObject({
      intent: "approval-demo",
      customerQuery: "ACME",
    });
  });

  it("blocks unsupported capabilities instead of treating arbitrary text as a customer query", () => {
    const result = routeDashboardTask("Send an email to every customer tomorrow.");
    expect(result.intent).toBe("unsupported");
    expect(result.customerQuery).toBe("");
    expect(result.reason).toContain("supports ACME receivables review");
  });
});
