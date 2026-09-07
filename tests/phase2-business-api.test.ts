import { describe, expect, it } from "vitest";
import {
  ACME_CUSTOMER_ID,
  DEMO_ORACLE,
  MOCK_AS_OF_DATE,
  createMockBusinessApi,
  createOperationsRuntime,
  mockBusinessDataset,
  validateBusinessDataset,
  type InvoiceReviewResult,
} from "../src/core";

describe("Phase 2 mock business data", () => {
  it("has valid references and every required deterministic record case", () => {
    expect(validateBusinessDataset(mockBusinessDataset)).toEqual([]);
    expect(mockBusinessDataset.customers.some((record) => "duplicateOf" in record)).toBe(true);
    expect(mockBusinessDataset.invoices.some(({ kind }) => kind === "credit-note")).toBe(true);
    expect(mockBusinessDataset.invoices.some((record) => "duplicateOf" in record)).toBe(true);
    expect(mockBusinessDataset.payments.some((record) => "duplicateOf" in record)).toBe(true);
    expect(mockBusinessDataset.followUpPolicies.map(({ condition }) => condition)).toEqual(expect.arrayContaining(["overdue", "due-soon"]));
  });

  it("returns duplicate ACME lookup records while identifying one canonical customer", () => {
    const result = createMockBusinessApi().lookupCustomers({ query: "ACME" });
    expect(result.records).toHaveLength(2);
    expect(result.canonicalCustomerIds).toEqual([ACME_CUSTOMER_ID]);
    expect(result.duplicateRecordIds).toEqual(["customer-acme-import-copy"]);
  });

  it("derives the intended ACME invoice facts after canonical payments and credits", () => {
    const review = createMockBusinessApi().reviewInvoices({ customerId: ACME_CUSTOMER_ID });
    expect(review).toMatchObject({
      asOf: MOCK_AS_OF_DATE,
      currency: "SGD",
      outstandingInvoices: DEMO_ORACLE.acme.outstandingInvoices,
      outstandingTotal: DEMO_ORACLE.acme.outstandingTotal,
      ignoredDuplicateRecordIds: DEMO_ORACLE.acme.ignoredDuplicateRecordIds,
    });

    const byId = Object.fromEntries(review.invoices.map((invoice) => [invoice.invoice.id, invoice]));
    expect(byId["invoice-acme-paid"]).toMatchObject({ outstandingAmount: 0, paymentsApplied: 4500, facts: ["paid"] });
    expect(byId["invoice-acme-partial"]).toMatchObject({ outstandingAmount: 5000, paymentsApplied: 2000, facts: ["outstanding", "overdue", "partial-payment"] });
    expect(byId["invoice-acme-credit"]).toMatchObject({ outstandingAmount: 6520, creditsApplied: 1480, facts: ["outstanding", "overdue", "credit-note-applied"] });
    expect(byId["invoice-acme-future"]).toMatchObject({ outstandingAmount: 3000, facts: ["outstanding", "future-due"] });
  });

  it("applies one deterministic follow-up policy to each outstanding ACME invoice", () => {
    expect(createMockBusinessApi().evaluateFollowUps({ customerId: ACME_CUSTOMER_ID })).toEqual([
      { invoiceId: "invoice-acme-partial", policyId: "overdue-priority", action: "priority-follow-up", daysFromDueDate: 45, outstandingAmount: 5000 },
      { invoiceId: "invoice-acme-credit", policyId: "overdue-standard", action: "standard-follow-up", daysFromDueDate: 14, outstandingAmount: 6520 },
      { invoiceId: "invoice-acme-future", policyId: "due-soon", action: "prepare-reminder", daysFromDueDate: -9, outstandingAmount: 3000 },
    ]);
  });
});

describe("Phase 2 capability-first runtime", () => {
  it.each(["node", "browser"] as const)("exposes the same business review in the %s runtime", async (kind) => {
    const runtime = createOperationsRuntime(kind);
    expect(runtime.capabilities.has("customer.lookup")).toBe(true);
    expect(runtime.capabilities.has("invoice.review")).toBe(true);
    expect(runtime.capabilities.has("payment.list")).toBe(true);
    expect(runtime.capabilities.has("follow-up.evaluate")).toBe(true);

    const review = await runtime.capabilities.execute<unknown, InvoiceReviewResult>(
      "invoice.review",
      { customerId: ACME_CUSTOMER_ID },
      runtime,
    );
    expect(review).toMatchObject({ outstandingInvoices: DEMO_ORACLE.acme.outstandingInvoices, outstandingTotal: DEMO_ORACLE.acme.outstandingTotal, currency: "SGD" });
  });
});
