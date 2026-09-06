import { operationsAssistant, Registry, type EmployeeRuntime, type Evidence } from "../core";
import { runPiCapabilityLoop } from "../adapters/pi/phase0-agent";

export interface DemoEvidence {
  runtime: "node" | "browser";
  customer: string;
  outstandingInvoices: number;
  outstandingTotal: number;
  currency: "SGD";
  toolExecutions: number;
  verification: "PASS";
}

export function createPhase0Runtime(kind: "node" | "browser"): EmployeeRuntime {
  const registry = new Registry();
  registry.register<{ customer: string; runtime: "node" | "browser" }, Evidence>({
    capability: "invoice.review",
    description: "Review customer invoices.",
    async execute(input) {
      const evidence: DemoEvidence = { runtime: input.runtime, customer: input.customer, outstandingInvoices: 3, outstandingTotal: 14520, currency: "SGD", toolExecutions: 1, verification: "PASS" };
      return { type: "invoice-review", source: "phase0-deterministic", data: evidence };
    },
  });
  return { kind, capabilities: registry };
}

export async function runPhase0(runtime: "node" | "browser") {
  const result = await runPiCapabilityLoop(operationsAssistant, createPhase0Runtime(runtime), "invoice.review", { customer: "ACME Trading Pte Ltd" });
  const evidence = result.evidence.data as DemoEvidence;
  return { evidence, events: result.events.map((event) => event.type) };
}
