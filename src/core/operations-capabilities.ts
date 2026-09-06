import type { BusinessApi, CustomerLookupInput, InvoiceReviewInput } from "./business-api";
import type { CapabilityRegistry, EmployeeRuntime, RuntimeKind } from "./contracts";
import { Registry } from "./capability-registry";
import { createMockBusinessApi } from "./mock-business-api";

export interface PaymentListInput {
  customerId: string;
  includeDuplicates?: boolean;
}

/** Registers domain capabilities without exposing a runtime-specific adapter. */
export function registerOperationsCapabilities(registry: CapabilityRegistry, api: BusinessApi = createMockBusinessApi()): void {
  registry.register({
    capability: "customer.lookup",
    description: "Find customer records and disclose duplicate lookup results.",
    execute: (input: CustomerLookupInput) => api.lookupCustomers(input),
  });
  registry.register({
    capability: "invoice.review",
    description: "Review canonical invoices after payments, credits, and duplicate suppression.",
    execute: (input: InvoiceReviewInput) => api.reviewInvoices(input),
  });
  registry.register({
    capability: "payment.list",
    description: "List canonical or raw payment records for a customer.",
    execute: (input: PaymentListInput) => api.listPayments(input.customerId, input.includeDuplicates),
  });
  registry.register({
    capability: "follow-up.evaluate",
    description: "Evaluate deterministic follow-up policies against an invoice review.",
    execute: (input: InvoiceReviewInput) => api.evaluateFollowUps(input),
  });
}

export function createOperationsRuntime(kind: RuntimeKind, api: BusinessApi = createMockBusinessApi()): EmployeeRuntime {
  const capabilities = new Registry();
  registerOperationsCapabilities(capabilities, api);
  return { kind, capabilities };
}

export const createPhase2Runtime = createOperationsRuntime;
