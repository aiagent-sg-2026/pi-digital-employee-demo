import { describe, expect, it } from "vitest";
import {
  Registry,
  createOperationsRuntime,
  runOperationsEmployeeTask,
  type CustomerLookupResult,
  type EmployeeRuntime,
} from "../src/core";

describe("Phase 3 complete employee workflow", () => {
  it.each(["node", "browser"] as const)("completes the verified ACME task in %s", async (kind) => {
    const result = await runOperationsEmployeeTask(kind, { customerQuery: "ACME" });
    expect(result.task.state).toBe("COMPLETED");
    expect(result.verification.status).toBe("PASS");
    expect(result.verification.checks.every((check) => check.passed)).toBe(true);
    expect(result.summary).toEqual({
      customerId: "customer-acme",
      customer: "ACME Trading Pte Ltd",
      outstandingInvoices: 3,
      outstandingTotal: 14520,
      currency: "SGD",
    });
    expect(result.followUps).toHaveLength(3);
    expect(result.evidence.map(({ type }) => type)).toEqual([
      "customer.lookup",
      "invoice.review",
      "payment.list",
      "follow-up.evaluate",
      "verification",
    ]);
  });

  it("produces equivalent Node and Browser business results", async () => {
    const [node, browser] = await Promise.all([
      runOperationsEmployeeTask("node", { customerQuery: "ACME" }),
      runOperationsEmployeeTask("browser", { customerQuery: "ACME" }),
    ]);
    expect(browser.summary).toEqual(node.summary);
    expect(browser.verification).toEqual(node.verification);
    expect(browser.followUps).toEqual(node.followUps);
    expect(browser.task.state).toBe(node.task.state);
  });

  it("gates missing customer as NEEDS_REVIEW before invoice execution", async () => {
    const result = await runOperationsEmployeeTask("node", { customerQuery: "Does Not Exist" });
    expect(result.task.state).toBe("NEEDS_REVIEW");
    expect(result.verification.status).toBe("NEEDS_REVIEW");
    expect(result.evidence.map(({ type }) => type)).toEqual(["customer.lookup"]);
    expect(result.summary).toBeUndefined();
  });

  it("gates ambiguous canonical customer lookup as NEEDS_REVIEW", async () => {
    const base = createOperationsRuntime("browser");
    const registry = new Registry();
    registry.register({
      capability: "customer.lookup",
      description: "Ambiguous lookup fixture",
      execute: (): CustomerLookupResult => ({
        query: "ambiguous",
        records: [],
        canonicalCustomerIds: ["customer-a", "customer-b"],
        duplicateRecordIds: [],
      }),
    });
    const runtime: EmployeeRuntime = { kind: "browser", capabilities: registry };
    const result = await runOperationsEmployeeTask("browser", { customerQuery: "ambiguous" }, { runtime });
    expect(result.task.state).toBe("NEEDS_REVIEW");
    expect(result.verification.status).toBe("NEEDS_REVIEW");
    expect(base.kind).toBe("browser");
  });

  it("marks capability execution errors as FAILED", async () => {
    const registry = new Registry();
    registry.register({
      capability: "customer.lookup",
      description: "Failing lookup fixture",
      execute: () => { throw new Error("lookup unavailable"); },
    });
    const runtime: EmployeeRuntime = { kind: "node", capabilities: registry };
    const result = await runOperationsEmployeeTask("node", { customerQuery: "ACME" }, { runtime });
    expect(result.task.state).toBe("FAILED");
    expect(result.verification.status).toBe("FAIL");
    expect(result.evidence.at(-1)).toMatchObject({ type: "execution.error" });
  });

  it("cannot complete when deterministic verification evidence is inconsistent", async () => {
    const base = createOperationsRuntime("node");
    const original = base.capabilities.resolve("invoice.review");
    const registry = new Registry();
    registry.register(base.capabilities.resolve("customer.lookup"));
    registry.register({
      capability: "invoice.review",
      description: "Tampered invoice review fixture",
      async execute(input, runtime) {
        const value = await original.execute(input, runtime) as Record<string, unknown>;
        return { ...value, outstandingTotal: 999 };
      },
    });
    registry.register(base.capabilities.resolve("payment.list"));
    registry.register(base.capabilities.resolve("follow-up.evaluate"));
    const runtime: EmployeeRuntime = { kind: "node", capabilities: registry };
    const result = await runOperationsEmployeeTask("node", { customerQuery: "ACME" }, { runtime });
    expect(result.task.state).toBe("NEEDS_REVIEW");
    expect(result.verification.status).toBe("NEEDS_REVIEW");
    expect(result.verification.checks.find(({ id }) => id === "invoice.outstanding.total")?.passed).toBe(false);
  });
});
