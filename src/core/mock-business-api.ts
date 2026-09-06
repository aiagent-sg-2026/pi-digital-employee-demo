import type {
  BusinessApi,
  BusinessDataset,
  CustomerLookupInput,
  CustomerLookupResult,
  CustomerRecord,
  FollowUpResult,
  InvoiceRecord,
  InvoiceReviewInput,
  InvoiceReviewResult,
  PaymentRecord,
  ReviewedInvoice,
} from "./business-api";
import { MOCK_AS_OF_DATE, mockBusinessDataset } from "./mock-business-data";

const DAY_MS = 24 * 60 * 60 * 1000;

function canonicalId<T extends { id: string; duplicateOf?: string }>(records: readonly T[], id: string): string {
  const record = records.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`Unknown record: ${id}`);
  return record.duplicateOf ?? record.id;
}

function dateValue(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid ISO date: ${value}`);
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) throw new Error(`Invalid ISO date: ${value}`);
  return parsed;
}

function daysBetween(from: string, to: string): number {
  return Math.round((dateValue(to) - dateValue(from)) / DAY_MS);
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchesCustomer(customer: CustomerRecord, query: string): boolean {
  const needle = normalized(query);
  return [customer.name, customer.externalReference, ...customer.aliases].some((value) => normalized(value).includes(needle));
}

export function validateBusinessDataset(dataset: BusinessDataset): readonly string[] {
  const issues: string[] = [];

  function checkIds<T extends { id: string; duplicateOf?: string }>(label: string, records: readonly T[]): void {
    const ids = new Set<string>();
    for (const record of records) {
      if (!record.id.trim()) issues.push(`${label} has an empty id`);
      if (ids.has(record.id)) issues.push(`${label} has duplicate id ${record.id}`);
      ids.add(record.id);
    }
    for (const record of records) {
      if (record.duplicateOf && !ids.has(record.duplicateOf)) issues.push(`${label} ${record.id} points to missing duplicate target ${record.duplicateOf}`);
      if (record.duplicateOf === record.id) issues.push(`${label} ${record.id} duplicates itself`);
      const target = records.find((candidate) => candidate.id === record.duplicateOf);
      if (target?.duplicateOf) issues.push(`${label} ${record.id} points to another duplicate instead of a canonical record`);
    }
  }

  checkIds("customer", dataset.customers);
  checkIds("invoice", dataset.invoices);
  checkIds("payment", dataset.payments);
  checkIds("follow-up policy", dataset.followUpPolicies);

  const customerIds = new Set(dataset.customers.map(({ id }) => id));
  const invoiceById = new Map(dataset.invoices.map((invoice) => [invoice.id, invoice]));
  for (const invoice of dataset.invoices) {
    if (!customerIds.has(invoice.customerId)) issues.push(`invoice ${invoice.id} points to missing customer ${invoice.customerId}`);
    if (!Number.isFinite(invoice.amount) || invoice.amount <= 0) issues.push(`invoice ${invoice.id} has an invalid amount`);
    for (const value of [invoice.issuedOn, invoice.dueOn]) {
      try { dateValue(value); } catch { issues.push(`invoice ${invoice.id} has invalid date ${value}`); }
    }
    if (invoice.kind === "credit-note") {
      const appliedInvoice = invoice.appliesToInvoiceId ? invoiceById.get(invoice.appliesToInvoiceId) : undefined;
      if (!appliedInvoice || appliedInvoice.kind !== "invoice") issues.push(`credit note ${invoice.id} does not point to an invoice`);
      else {
        if (appliedInvoice.customerId !== invoice.customerId) issues.push(`credit note ${invoice.id} belongs to a different customer than its invoice`);
        if (appliedInvoice.currency !== invoice.currency) issues.push(`credit note ${invoice.id} uses a different currency than its invoice`);
      }
    } else if (invoice.appliesToInvoiceId) {
      issues.push(`invoice ${invoice.id} unexpectedly applies to another invoice`);
    }
  }

  for (const payment of dataset.payments) {
    const invoice = invoiceById.get(payment.invoiceId);
    if (!customerIds.has(payment.customerId)) issues.push(`payment ${payment.id} points to missing customer ${payment.customerId}`);
    if (!invoice || invoice.kind !== "invoice") issues.push(`payment ${payment.id} does not point to an invoice`);
    else {
      if (invoice.customerId !== payment.customerId) issues.push(`payment ${payment.id} belongs to a different customer than its invoice`);
      if (invoice.currency !== payment.currency) issues.push(`payment ${payment.id} uses a different currency than its invoice`);
    }
    if (!Number.isFinite(payment.amount) || payment.amount <= 0) issues.push(`payment ${payment.id} has an invalid amount`);
    try { dateValue(payment.paidOn); } catch { issues.push(`payment ${payment.id} has invalid date ${payment.paidOn}`); }
  }

  for (const policy of dataset.followUpPolicies) {
    if (policy.condition === "overdue" && (!Number.isInteger(policy.minimumDays) || (policy.minimumDays ?? 0) < 1)) {
      issues.push(`overdue policy ${policy.id} has an invalid minimumDays`);
    }
    if (policy.condition === "due-soon" && (!Number.isInteger(policy.withinDays) || (policy.withinDays ?? -1) < 0)) {
      issues.push(`due-soon policy ${policy.id} has an invalid withinDays`);
    }
  }

  return issues;
}

export function createMockBusinessApi(dataset: BusinessDataset = mockBusinessDataset): BusinessApi {
  const integrityIssues = validateBusinessDataset(dataset);
  if (integrityIssues.length) throw new Error(`Invalid mock business dataset:\n${integrityIssues.join("\n")}`);

  function canonicalCustomer(customerId: string): CustomerRecord {
    const id = canonicalId(dataset.customers, customerId);
    return dataset.customers.find((customer) => customer.id === id)!;
  }

  function lookupCustomers(input: CustomerLookupInput): CustomerLookupResult {
    if (!normalized(input.query)) throw new Error("Customer lookup query must contain a letter or number.");
    const matching = dataset.customers.filter((customer) => matchesCustomer(customer, input.query));
    const records = input.includeDuplicates === false ? matching.filter((record) => !record.duplicateOf) : matching;
    return {
      query: input.query,
      records,
      canonicalCustomerIds: [...new Set(matching.map((record) => record.duplicateOf ?? record.id))],
      duplicateRecordIds: matching.filter((record) => record.duplicateOf).map((record) => record.id),
    };
  }

  function listInvoices(customerId: string, includeDuplicates = false): readonly InvoiceRecord[] {
    const customer = canonicalCustomer(customerId);
    return dataset.invoices.filter((invoice) => invoice.customerId === customer.id && (includeDuplicates || !invoice.duplicateOf));
  }

  function listPayments(customerId: string, includeDuplicates = false): readonly PaymentRecord[] {
    const customer = canonicalCustomer(customerId);
    return dataset.payments.filter((payment) => payment.customerId === customer.id && (includeDuplicates || !payment.duplicateOf));
  }

  function reviewInvoices(input: InvoiceReviewInput): InvoiceReviewResult {
    const customer = canonicalCustomer(input.customerId);
    const asOf = input.asOf ?? MOCK_AS_OF_DATE;
    dateValue(asOf);
    const records = listInvoices(customer.id);
    const payments = listPayments(customer.id);
    const credits = records.filter((record) => record.kind === "credit-note");
    const invoices: ReviewedInvoice[] = records.filter((record) => record.kind === "invoice" && record.issuedOn <= asOf).map((invoice) => {
      const paymentsApplied = payments.filter((payment) => payment.invoiceId === invoice.id && payment.paidOn <= asOf).reduce((sum, payment) => sum + payment.amount, 0);
      const creditsApplied = credits.filter((credit) => credit.appliesToInvoiceId === invoice.id && credit.issuedOn <= asOf).reduce((sum, credit) => sum + credit.amount, 0);
      const outstandingAmount = Math.max(0, invoice.amount - paymentsApplied - creditsApplied);
      const facts: ReviewedInvoice["facts"][number][] = [];
      if (outstandingAmount === 0) facts.push("paid");
      else {
        facts.push("outstanding", invoice.dueOn < asOf ? "overdue" : "future-due");
        if (paymentsApplied > 0) facts.push("partial-payment");
        if (creditsApplied > 0) facts.push("credit-note-applied");
      }
      return { invoice, paymentsApplied, creditsApplied, outstandingAmount, facts };
    });
    const outstanding = invoices.filter(({ outstandingAmount }) => outstandingAmount > 0);
    const duplicateInvoices = listInvoices(customer.id, true).filter(({ duplicateOf }) => duplicateOf).map(({ id }) => id);
    const duplicatePayments = listPayments(customer.id, true).filter(({ duplicateOf }) => duplicateOf).map(({ id }) => id);
    return {
      customer,
      asOf,
      currency: customer.currency,
      invoices,
      outstandingInvoices: outstanding.length,
      outstandingTotal: outstanding.reduce((sum, invoice) => sum + invoice.outstandingAmount, 0),
      ignoredDuplicateRecordIds: [...duplicateInvoices, ...duplicatePayments],
    };
  }

  function evaluateFollowUps(input: InvoiceReviewInput): readonly FollowUpResult[] {
    const review = reviewInvoices(input);
    return review.invoices.flatMap((invoice): FollowUpResult[] => {
      if (invoice.outstandingAmount === 0) return [];
      const daysFromDueDate = daysBetween(invoice.invoice.dueOn, review.asOf);
      const policies = dataset.followUpPolicies
        .filter((policy) => policy.condition === "overdue"
          ? daysFromDueDate >= (policy.minimumDays ?? Number.POSITIVE_INFINITY)
          : daysFromDueDate <= 0 && -daysFromDueDate <= (policy.withinDays ?? -1))
        .sort((a, b) => a.condition === "overdue"
          ? (b.minimumDays ?? 0) - (a.minimumDays ?? 0)
          : (a.withinDays ?? 0) - (b.withinDays ?? 0));
      const policy = policies[0];
      return policy ? [{ invoiceId: invoice.invoice.id, policyId: policy.id, action: policy.action, daysFromDueDate, outstandingAmount: invoice.outstandingAmount }] : [];
    });
  }

  return { lookupCustomers, listInvoices, listPayments, reviewInvoices, evaluateFollowUps };
}
