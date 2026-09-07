export type DemoCurrency = "SGD";

export interface DemoMeta {
  id: "business-meta";
  schemaVersion: number;
  seedVersion: string;
  snapshotDate: string;
  companyName: string;
  seededAt: string;
}

export interface BusinessCustomer {
  id: string;
  code: string;
  name: string;
  aliases: string[];
  currency: DemoCurrency;
  creditLimit: number;
  risk: "low" | "medium" | "high";
  status: "active" | "hold";
  duplicateOf?: string;
}

export interface BusinessInvoice {
  id: string;
  customerId: string;
  number: string;
  issuedOn: string;
  dueOn: string;
  amount: number;
  currency: DemoCurrency;
  status: "open" | "paid" | "disputed";
  duplicateOf?: string;
}

export interface BusinessPayment {
  id: string;
  customerId?: string;
  invoiceId?: string;
  reference: string;
  paidOn: string;
  amount: number;
  currency: DemoCurrency;
  status: "matched" | "unmatched";
  duplicateOf?: string;
  suppressed?: boolean;
}

export interface BusinessCreditNote {
  id: string;
  customerId: string;
  invoiceId: string;
  number: string;
  issuedOn: string;
  amount: number;
  currency: DemoCurrency;
}

export interface BusinessFollowUpPolicy {
  id: string;
  name: string;
  condition: "overdue" | "due-soon" | "high-value" | "disputed";
  minimumDays?: number;
  withinDays?: number;
  minimumAmount?: number;
  action: "priority-follow-up" | "standard-follow-up" | "prepare-reminder" | "manager-review";
}

export type InboxType = "unmatched-payment" | "duplicate-payment" | "invoice-dispute" | "credit-limit" | "ambiguous-customer" | "approval-required";
export type InboxStatus = "open" | "investigating" | "resolved" | "escalated";

export interface BusinessInboxItem {
  id: string;
  issueKey?: string;
  type: InboxType;
  severity: "info" | "warning" | "critical";
  relatedEntityType: "customer" | "invoice" | "payment" | "approval";
  relatedEntityId: string;
  relatedTaskIds?: string[];
  createdAt: string;
  status: InboxStatus;
  title: string;
  detail: string;
  resolution?: string;
  seeded?: boolean;
}

export type TaskStatus = "created" | "running" | "needs-review" | "needs-approval" | "completed" | "failed" | "blocked";
export type TaskOutcome = "completed-no-action" | "completed-attention-required" | "completed-resolved";
export interface TaskReview {
  type: "ambiguous-customer";
  query: string;
  candidateCustomerIds: string[];
  selectedCustomerId?: string;
  resolvedAt?: string;
}
export interface BusinessTask {
  id: string;
  title: string;
  intent: string;
  customerId?: string;
  customerQuery?: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  summary?: Record<string, unknown>;
  verification?: { status: "PASS" | "NEEDS_REVIEW" | "FAIL"; passed: number; total: number };
  outcome?: TaskOutcome;
  review?: TaskReview;
  approvalId?: string;
}

export type TaskEventType = "CREATED" | "ROUTED" | "STARTED" | "CUSTOMER_RESOLVED" | "CAPABILITY_STARTED" | "CAPABILITY_COMPLETED" | "VERIFYING" | "NEEDS_REVIEW" | "REVIEW_RESOLVED" | "NEEDS_APPROVAL" | "APPROVED" | "REJECTED" | "RESUMED" | "ISSUE_RESOLVED" | "COMPLETED" | "FAILED";
export interface TaskEvent {
  id: string;
  taskId: string;
  type: TaskEventType;
  occurredAt: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface BusinessApproval {
  id: string;
  issueKey?: string;
  taskId: string;
  state: "pending" | "approved" | "rejected";
  title: string;
  what: string;
  why: string;
  affected: string;
  impact: string;
  createdAt: string;
  decidedAt?: string;
  simulation: true;
}

export interface BusinessEvidence {
  id: string;
  taskId: string;
  type: string;
  source: string;
  createdAt: string;
  data: unknown;
}

export interface DraftAction {
  id: string;
  taskId: string;
  type: "customer-follow-up";
  createdAt: string;
  status: "draft";
  content: Record<string, unknown>;
}

export interface BusinessException {
  id: string;
  type: InboxType;
  severity: BusinessInboxItem["severity"];
  title: string;
  detail: string;
  relatedEntityType: BusinessInboxItem["relatedEntityType"];
  relatedEntityId: string;
}

export interface BusinessSnapshot {
  snapshotDate: string;
  openReceivables: number;
  overdueInvoices: number;
  customersAtRisk: number;
  exceptions: number;
  customers: number;
}
