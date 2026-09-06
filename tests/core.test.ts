import { describe, expect, it } from "vitest";
import { MissingCapabilityError, Registry, canTransition, operationsAssistant, transitionTask, type EmployeeRuntime, type EmployeeTask } from "../src/core";

describe("Employee Core contracts", () => {
  it("loads a data-driven operations assistant with capability names", () => {
    expect(operationsAssistant.id).toBe("operations-assistant");
    expect(operationsAssistant.skills[0]?.capabilities).toEqual(["customer.lookup", "invoice.review"]);
  });

  it("resolves and executes a capability through the runtime registry", async () => {
    const registry = new Registry();
    registry.register({ capability: "customer.lookup", description: "Lookup a customer", execute: (input: string, runtime: EmployeeRuntime) => `${runtime.kind}:${input}` });
    const runtime = { kind: "browser" as const, capabilities: registry };
    expect(registry.has("customer.lookup")).toBe(true);
    await expect(registry.execute("customer.lookup", "ACME", runtime)).resolves.toBe("browser:ACME");
  });

  it("rejects invalid and missing capabilities", () => {
    const registry = new Registry();
    expect(() => registry.register({ capability: "", description: "invalid", execute: () => null })).toThrow();
    expect(() => registry.resolve("invoice.review")).toThrowError(MissingCapabilityError);
  });

  it("guards the minimal task state machine", () => {
    const task: EmployeeTask = { id: "task-1", employeeId: operationsAssistant.id, capability: "invoice.review", input: {}, state: "CREATED", evidence: [] };
    expect(canTransition("CREATED", "RUNNING")).toBe(true);
    expect(canTransition("CREATED", "COMPLETED")).toBe(false);
    expect(transitionTask(task, "RUNNING").state).toBe("RUNNING");
    expect(() => transitionTask(task, "COMPLETED")).toThrow("Invalid task transition");
  });
});
