export type Currency = "SGD";

export interface CustomerRecord {
  id: string;
  externalReference: string;
  name: string;
  aliases: readonly string[];
  currency: Currency;
  duplicateOf?: string;
}

export interface InvoiceRecord {
  id: string;
  externalReference: string;
  customerId: string;
  kind: "invoice" | "credit-note";
  issuedOn: string;
  dueOn: string;
  amount: number;
  currency: Currency;
  appliesToInvoiceId?: string;
  duplicateOf?: string;
}

export interface PaymentRecord {
  id: string;
  externalReference: string;
  customerId: string;
  invoiceId: string;
  paidOn: string;
  amount: number;
  currency: Currency;
  duplicateOf?: string;
}

export interface FollowUpPolicy {
  id: string;
  name: string;
  condition: "overdue" | "due-soon";
  minimumDays?: number;
  withinDays?: number;
  action: "priority-follow-up" | "standard-follow-up" | "prepare-reminder";
}

export interface BusinessDataset {
  customers: readonly CustomerRecord[];
  invoices: readonly InvoiceRecord[];
  payments: readonly PaymentRecord[];
  followUpPolicies: readonly FollowUpPolicy[];
}

export interface CustomerLookupInput {
  query: string;
  includeDuplicates?: boolean;
}

export interface CustomerLookupResult {
  query: string;
  records: readonly CustomerRecord[];
  canonicalCustomerIds: readonly string[];
  duplicateRecordIds: readonly string[];
}

export type InvoiceFact =
  | "paid"
  | "outstanding"
  | "overdue"
  | "future-due"
  | "partial-payment"
  | "credit-note-applied";

export interface ReviewedInvoice {
  invoice: InvoiceRecord;
  paymentsApplied: number;
  creditsApplied: number;
  outstandingAmount: number;
  facts: readonly InvoiceFact[];
}

export interface InvoiceReviewInput {
  customerId: string;
  asOf?: string;
}

export interface InvoiceReviewResult {
  customer: CustomerRecord;
  asOf: string;
  currency: Currency;
  invoices: readonly ReviewedInvoice[];
  outstandingInvoices: number;
  outstandingTotal: number;
  ignoredDuplicateRecordIds: readonly string[];
}

export interface FollowUpResult {
  invoiceId: string;
  policyId: string;
  action: FollowUpPolicy["action"];
  daysFromDueDate: number;
  outstandingAmount: number;
}

export interface BusinessApi {
  lookupCustomers(input: CustomerLookupInput): CustomerLookupResult;
  listInvoices(customerId: string, includeDuplicates?: boolean): readonly InvoiceRecord[];
  listPayments(customerId: string, includeDuplicates?: boolean): readonly PaymentRecord[];
  reviewInvoices(input: InvoiceReviewInput): InvoiceReviewResult;
  evaluateFollowUps(input: InvoiceReviewInput): readonly FollowUpResult[];
}
