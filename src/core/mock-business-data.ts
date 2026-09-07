import type { BusinessDataset } from "./business-api";

export const MOCK_AS_OF_DATE = "2025-03-01";
export const ACME_CUSTOMER_ID = "customer-acme";

export const DEMO_ORACLE = {
  snapshotDate: MOCK_AS_OF_DATE,
  acme: {
    customerId: ACME_CUSTOMER_ID,
    outstandingInvoices: 3,
    outstandingTotal: 14520,
    ignoredDuplicateRecordIds: ["invoice-acme-future-import-copy", "payment-acme-partial-import-copy"],
  },
} as const;

/**
 * Phase 2's deliberately small, deterministic business fixture. Duplicate rows
 * retain their own IDs and point at their canonical record, mirroring the shape
 * of data commonly returned by an ERP aggregation without pretending to be one.
 */
export const mockBusinessDataset = {
  customers: [
    { id: ACME_CUSTOMER_ID, externalReference: "C-1000", name: "ACME Trading Pte Ltd", aliases: ["ACME", "ACME Trading"], currency: "SGD" },
    { id: "customer-acme-import-copy", externalReference: "LEGACY-C-42", name: "Acme Trading Pte. Ltd.", aliases: ["ACME"], currency: "SGD", duplicateOf: ACME_CUSTOMER_ID },
    { id: "customer-beacon", externalReference: "C-2000", name: "Beacon Services Pte Ltd", aliases: ["Beacon"], currency: "SGD" },
  ],
  invoices: [
    { id: "invoice-acme-paid", externalReference: "ACME-100", customerId: ACME_CUSTOMER_ID, kind: "invoice", issuedOn: "2024-12-01", dueOn: "2024-12-31", amount: 4500, currency: "SGD" },
    { id: "invoice-acme-partial", externalReference: "ACME-101", customerId: ACME_CUSTOMER_ID, kind: "invoice", issuedOn: "2024-12-16", dueOn: "2025-01-15", amount: 7000, currency: "SGD" },
    { id: "invoice-acme-credit", externalReference: "ACME-102", customerId: ACME_CUSTOMER_ID, kind: "invoice", issuedOn: "2025-01-16", dueOn: "2025-02-15", amount: 8000, currency: "SGD" },
    { id: "credit-acme-102", externalReference: "ACME-CN-102", customerId: ACME_CUSTOMER_ID, kind: "credit-note", issuedOn: "2025-02-20", dueOn: "2025-02-20", amount: 1480, currency: "SGD", appliesToInvoiceId: "invoice-acme-credit" },
    { id: "invoice-acme-future", externalReference: "ACME-103", customerId: ACME_CUSTOMER_ID, kind: "invoice", issuedOn: "2025-02-08", dueOn: "2025-03-10", amount: 3000, currency: "SGD" },
    { id: "invoice-acme-future-import-copy", externalReference: "ACME-103", customerId: ACME_CUSTOMER_ID, kind: "invoice", issuedOn: "2025-02-08", dueOn: "2025-03-10", amount: 3000, currency: "SGD", duplicateOf: "invoice-acme-future" },
    { id: "invoice-beacon-paid", externalReference: "BEACON-200", customerId: "customer-beacon", kind: "invoice", issuedOn: "2025-01-02", dueOn: "2025-02-01", amount: 900, currency: "SGD" },
  ],
  payments: [
    { id: "payment-acme-paid", externalReference: "PAY-100", customerId: ACME_CUSTOMER_ID, invoiceId: "invoice-acme-paid", paidOn: "2024-12-20", amount: 4500, currency: "SGD" },
    { id: "payment-acme-partial", externalReference: "PAY-101", customerId: ACME_CUSTOMER_ID, invoiceId: "invoice-acme-partial", paidOn: "2025-01-10", amount: 2000, currency: "SGD" },
    { id: "payment-acme-partial-import-copy", externalReference: "PAY-101", customerId: ACME_CUSTOMER_ID, invoiceId: "invoice-acme-partial", paidOn: "2025-01-10", amount: 2000, currency: "SGD", duplicateOf: "payment-acme-partial" },
    { id: "payment-beacon-paid", externalReference: "PAY-200", customerId: "customer-beacon", invoiceId: "invoice-beacon-paid", paidOn: "2025-01-25", amount: 900, currency: "SGD" },
  ],
  followUpPolicies: [
    { id: "overdue-priority", name: "Priority overdue follow-up", condition: "overdue", minimumDays: 30, action: "priority-follow-up" },
    { id: "overdue-standard", name: "Standard overdue follow-up", condition: "overdue", minimumDays: 1, action: "standard-follow-up" },
    { id: "due-soon", name: "Upcoming due-date reminder", condition: "due-soon", withinDays: 14, action: "prepare-reminder" },
  ],
} as const satisfies BusinessDataset;
