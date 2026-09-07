import { DEMO_SNAPSHOT_DATE } from "../demo/seed";
import type { BusinessRepository } from "../data/business-repository";
import type { WorkRepository } from "../data/work-repository";
import type {
  BusinessCustomer, BusinessEvidence, BusinessInboxItem, BusinessTask,
  TaskEvent, TaskEventType, TaskOutcome,
} from "../data/models";

export type BusinessWorldIntent =
  | "customer.lookup" | "receivables.review" | "payments.reconcile"
  | "followup.prepare" | "exceptions.review" | "portfolio.overdue" | "daily.brief";

export interface BusinessWorldTaskInput {
  taskId?: string;
  title: string;
  intent: BusinessWorldIntent;
  customerQuery?: string;
  resolvedCustomerId?: string;
}
export interface VerificationCheck { id: string; passed: boolean; message?: string; }
export interface BusinessWorldResult {
  task: BusinessTask;
  verification: { status: "PASS" | "NEEDS_REVIEW" | "FAIL"; checks: VerificationCheck[] };
  customer?: BusinessCustomer;
  summary: Record<string, unknown>;
  evidence: BusinessEvidence[];
}

const DAY_MS = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
const normalizeIssuePart = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
export const ambiguousCustomerIssueKey = (query: string) => `ambiguous-customer:${normalizeIssuePart(query)}`;
const verification = (checks: VerificationCheck[]) => ({
  status: (checks.every((check) => check.passed) ? "PASS" : "NEEDS_REVIEW") as "PASS" | "NEEDS_REVIEW",
  checks,
});

export async function reviewCustomer(repository: BusinessRepository, customer: BusinessCustomer) {
  const [invoices, payments, credits, policies] = await Promise.all([
    repository.listInvoicesByCustomer(customer.id),
    repository.listPaymentsByCustomer(customer.id),
    repository.listCreditNotesByCustomer(customer.id),
    repository.listPolicies(),
  ]);
  const rows = invoices.filter((invoice) => invoice.issuedOn <= DEMO_SNAPSHOT_DATE).map((invoice) => {
    const paid = payments.filter((payment) => payment.status === "matched" && payment.invoiceId === invoice.id && payment.paidOn <= DEMO_SNAPSHOT_DATE).reduce((sum, payment) => sum + payment.amount, 0);
    const credit = credits.filter((note) => note.invoiceId === invoice.id && note.issuedOn <= DEMO_SNAPSHOT_DATE).reduce((sum, note) => sum + note.amount, 0);
    const outstanding = Math.max(0, invoice.amount - paid - credit);
    const overdueDays = outstanding > 0 && invoice.dueOn < DEMO_SNAPSHOT_DATE ? days(invoice.dueOn, DEMO_SNAPSHOT_DATE) : 0;
    return { invoice, paymentsApplied: paid, creditsApplied: credit, outstanding, overdueDays };
  });
  const open = rows.filter((row) => row.outstanding > 0);
  const outstandingTotal = open.reduce((sum, row) => sum + row.outstanding, 0);
  const followUps = open.map((row) => {
    const policy = policies.filter((candidate) => candidate.condition === "overdue"
      ? row.overdueDays >= (candidate.minimumDays ?? Number.POSITIVE_INFINITY)
      : candidate.condition === "due-soon"
        ? row.overdueDays === 0 && days(DEMO_SNAPSHOT_DATE, row.invoice.dueOn) <= (candidate.withinDays ?? -1)
        : candidate.condition === "high-value"
          ? row.outstanding >= (candidate.minimumAmount ?? Number.POSITIVE_INFINITY)
          : candidate.condition === "disputed" ? row.invoice.status === "disputed" : false)
      .sort((a, b) => (b.minimumDays ?? 0) - (a.minimumDays ?? 0))[0];
    return policy ? { invoiceId: row.invoice.id, policyId: policy.id, action: policy.action, outstandingAmount: row.outstanding } : undefined;
  }).filter(Boolean) as { invoiceId: string; policyId: string; action: string; outstandingAmount: number }[];
  return { rows, open, outstandingTotal, followUps, payments, credits };
}

function taskStatus(resultStatus: "PASS" | "NEEDS_REVIEW" | "FAIL"): BusinessTask["status"] {
  return resultStatus === "PASS" ? "completed" : resultStatus === "NEEDS_REVIEW" ? "needs-review" : "failed";
}
function completedOutcome(intent: BusinessWorldIntent, summary: Record<string, unknown>): TaskOutcome {
  if (intent === "payments.reconcile" || intent === "exceptions.review") return Number(summary.count ?? 0) > 0 ? "completed-attention-required" : "completed-no-action";
  if (intent === "portfolio.overdue") return Number(summary.exceptionsRequiringReview ?? 0) > 0 ? "completed-attention-required" : "completed-no-action";
  if (intent === "daily.brief") return Number(summary.exceptions ?? 0) + Number(summary.pendingApprovals ?? 0) > 0 ? "completed-attention-required" : "completed-no-action";
  if (intent === "receivables.review" || intent === "followup.prepare") return Number(summary.outstandingTotal ?? 0) > 0 ? "completed-attention-required" : "completed-no-action";
  return "completed-no-action";
}

async function appendMonotonicEvent(work: WorkRepository, taskId: string, type: TaskEventType, message: string, data?: Record<string, unknown>): Promise<void> {
  const existing = await work.listTaskEvents(taskId);
  const max = existing.reduce((value, event) => Math.max(value, Date.parse(event.occurredAt)), Date.now() - 1);
  const occurredAt = new Date(max + 1).toISOString();
  await work.appendTaskEvent({ id: `event-${taskId}-${max + 1}-${type.toLowerCase()}`, taskId, type, occurredAt, message, data });
}

export async function resolveAmbiguousCustomerReview(business: BusinessRepository, work: WorkRepository, taskId: string, selectedCustomerId: string): Promise<BusinessWorldResult> {
  const task = await work.getTask(taskId);
  if (!task || task.status !== "needs-review" || task.review?.type !== "ambiguous-customer") throw new Error("Task is not waiting for an ambiguous-customer decision.");
  if (!task.review.candidateCustomerIds.includes(selectedCustomerId)) throw new Error("Selected customer is not a candidate for this review.");
  const customer = await business.getCustomer(selectedCustomerId);
  if (!customer) throw new Error("Selected customer no longer exists in the demo business data.");
  const resolvedAt = new Date().toISOString();
  task.review = { ...task.review, selectedCustomerId, resolvedAt };
  task.customerId = selectedCustomerId;
  task.status = "running";
  task.updatedAt = resolvedAt;
  await work.updateTask(task);
  await appendMonotonicEvent(work, task.id, "REVIEW_RESOLVED", `Manager selected ${customer.name}`, { customerId: customer.id });
  await work.saveEvidence({ id: `evidence-${task.id}-review-resolved`, taskId: task.id, type: "review.resolved", source: "human-decision", createdAt: resolvedAt, data: { reviewType: "ambiguous-customer", query: task.review.query, selectedCustomerId } });
  const issue = (await work.listInbox()).find((item) => item.issueKey === ambiguousCustomerIssueKey(task.review!.query) && item.status !== "resolved");
  if (issue) await work.updateInboxStatus(issue.id, "resolved", `Selected ${customer.name}; original task resumed.`);
  return runBusinessWorldTask(business, work, {
    taskId: task.id,
    title: task.title,
    intent: task.intent === "customer.lookup" ? "receivables.review" : task.intent as BusinessWorldIntent,
    customerQuery: task.customerQuery,
    resolvedCustomerId: selectedCustomerId,
  });
}

export async function runBusinessWorldTask(business: BusinessRepository, work: WorkRepository, input: BusinessWorldTaskInput): Promise<BusinessWorldResult> {
  const taskId = input.taskId ?? `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let sequence = 0;
  const existing = await work.getTask(taskId);
  const priorEvents = existing ? await work.listTaskEvents(taskId) : [];
  const priorMax = priorEvents.reduce((max, item) => Math.max(max, Date.parse(item.occurredAt)), 0);
  const base = Math.max(Date.now(), priorMax + 1);
  const now = () => new Date(base + sequence).toISOString();
  const task: BusinessTask = existing
    ? { ...existing, title: input.title, intent: input.intent, customerQuery: input.customerQuery ?? existing.customerQuery, status: "running", updatedAt: now() }
    : { id: taskId, title: input.title, intent: input.intent, customerQuery: input.customerQuery, status: "created", createdAt: now(), updatedAt: now() };
  if (existing) await work.updateTask(task); else await work.createTask(task);

  const event = async (type: TaskEventType, message: string, data?: Record<string, unknown>) => {
    const occurredAt = new Date(base + sequence++).toISOString();
    const value: TaskEvent = { id: `event-${taskId}-${base}-${String(sequence).padStart(3, "0")}`, taskId, type, occurredAt, message, data };
    await work.appendTaskEvent(value);
  };
  const evidence: BusinessEvidence[] = [];
  const saveEvidence = async (type: string, data: unknown) => {
    const value: BusinessEvidence = { id: `evidence-${taskId}-${String(evidence.length).padStart(3, "0")}-${base}`, taskId, type, source: "business-world-v1", createdAt: now(), data };
    evidence.push(value);
    await work.saveEvidence(value);
  };

  if (!existing) await event("CREATED", "Task received");
  await event("ROUTED", `Routed to ${input.intent}`, { intent: input.intent });
  task.status = "running";
  task.updatedAt = now();
  await work.updateTask(task);
  await event("STARTED", existing ? "Task resumed" : "Alex started work");

  try {
    let customer: BusinessCustomer | undefined;
    let summary: Record<string, unknown> = {};
    let checks: VerificationCheck[] = [];

    if (["customer.lookup", "receivables.review", "followup.prepare"].includes(input.intent)) {
      await event("CAPABILITY_STARTED", "Customer lookup", { capability: "customer.lookup" });
      const found = input.resolvedCustomerId
        ? { records: [], canonical: [await business.getCustomer(input.resolvedCustomerId)].filter(Boolean) as BusinessCustomer[] }
        : await business.findCustomer(input.customerQuery ?? "");
      await saveEvidence("customer.lookup", found);
      await event("CAPABILITY_COMPLETED", "Customer lookup completed", { matches: found.canonical.length });

      if (found.canonical.length !== 1) {
        const message = found.canonical.length === 0 ? "No customer matched the query." : "Multiple customer matches found. Waiting for manager selection.";
        checks = [{ id: "customer.identity.unique", passed: false, message }];
        const result = verification(checks);
        task.status = "needs-review";
        task.verification = { status: result.status, passed: 0, total: 1 };
        task.review = { type: "ambiguous-customer", query: input.customerQuery ?? "", candidateCustomerIds: found.canonical.map((candidate) => candidate.id) };
        task.summary = { resultType: found.canonical.length ? "clarification-required" : "customer-not-found", query: input.customerQuery, candidateCount: found.canonical.length };
        task.updatedAt = now();
        await work.updateTask(task);
        await event("NEEDS_REVIEW", message, { candidateCustomerIds: task.review.candidateCustomerIds });
        await saveEvidence("verification", result);
        const issueKey = ambiguousCustomerIssueKey(input.customerQuery ?? "");
        const issue: BusinessInboxItem = {
          id: `inbox-${issueKey}`,
          issueKey,
          type: "ambiguous-customer",
          severity: "warning",
          relatedEntityType: "customer",
          relatedEntityId: found.canonical[0]?.id ?? "unresolved-customer",
          relatedTaskIds: [task.id],
          createdAt: now(),
          status: "open",
          title: found.canonical.length ? `Choose the correct customer for ${input.customerQuery}` : `Customer not found: ${input.customerQuery}`,
          detail: found.canonical.length ? `${found.canonical.length} canonical customer records match. Select one to resume the same task.` : "No canonical customer matched. Manager review is required.",
        };
        await work.upsertInboxIssue(issue);
        return { task, verification: result, summary: task.summary, evidence };
      }

      customer = found.canonical[0];
      task.customerId = customer.id;
      if (task.review?.type === "ambiguous-customer" && input.resolvedCustomerId) task.review = { ...task.review, selectedCustomerId: customer.id, resolvedAt: task.review.resolvedAt ?? now() };
      await work.updateTask(task);
      await event("CUSTOMER_RESOLVED", `Customer selected: ${customer.name}`, { customerId: customer.id });

      if (input.intent === "customer.lookup") {
        checks = [{ id: "customer.identity.unique", passed: true }];
        summary = { customer: { id: customer.id, code: customer.code, name: customer.name, risk: customer.risk, creditLimit: customer.creditLimit } };
      } else {
        await event("CAPABILITY_STARTED", "Reviewing receivables", { capability: "receivables.review" });
        const review = await reviewCustomer(business, customer);
        await saveEvidence("receivables.review", review);
        await event("CAPABILITY_COMPLETED", "Receivables reviewed", { openInvoices: review.open.length });
        checks = [
          { id: "customer.identity.unique", passed: true },
          { id: "customer.identity.matches-review", passed: review.rows.every((row) => row.invoice.customerId === customer!.id) && review.payments.every((payment) => !payment.customerId || payment.customerId === customer!.id) },
          { id: "invoice.count.consistent", passed: review.open.length === review.rows.filter((row) => row.outstanding > 0).length },
          { id: "invoice.outstanding.reconciled", passed: review.outstandingTotal === review.open.reduce((sum, row) => sum + row.outstanding, 0) },
          { id: "invoice.balance.nonnegative", passed: review.rows.every((row) => row.outstanding >= 0) },
          { id: "currency.consistent", passed: review.rows.every((row) => row.invoice.currency === customer!.currency) && review.payments.every((payment) => payment.currency === customer!.currency) },
          { id: "duplicates.suppressed", passed: review.rows.every((row) => !row.invoice.duplicateOf) && review.payments.every((payment) => !payment.duplicateOf) },
          { id: "payments.canonical", passed: review.payments.every((payment) => !payment.duplicateOf) },
          { id: "followup.coverage", passed: review.followUps.length === review.open.length },
          { id: "followup.amount.matches-outstanding", passed: review.followUps.every((followUp) => review.open.find((row) => row.invoice.id === followUp.invoiceId)?.outstanding === followUp.outstandingAmount) },
        ];
        summary = { customer: { id: customer.id, name: customer.name, code: customer.code, risk: customer.risk }, outstandingInvoices: review.open.length, outstandingTotal: review.outstandingTotal, currency: customer.currency, followUps: review.followUps };
      }
    } else if (input.intent === "payments.reconcile") {
      await event("CAPABILITY_STARTED", "Reconciling payment exceptions", { capability: "payments.reconcile" });
      const exceptions = (await business.listExceptions()).filter((item) => item.type === "unmatched-payment" || item.type === "duplicate-payment");
      for (const issue of exceptions) await work.linkInboxToTask(issue.id, task.id);
      await saveEvidence("payments.reconcile", exceptions);
      await event("CAPABILITY_COMPLETED", "Payment investigation completed", { exceptions: exceptions.length });
      checks = [{ id: "payment.exceptions.enumerated", passed: true }];
      summary = { resultType: "investigation-completed", paymentExceptions: exceptions, count: exceptions.length, actionRequired: exceptions.length > 0 };
    } else if (input.intent === "exceptions.review") {
      await event("CAPABILITY_STARTED", "Reviewing business exceptions", { capability: "exceptions.review" });
      const exceptions = await business.listExceptions();
      for (const issue of exceptions) await work.linkInboxToTask(issue.id, task.id);
      await saveEvidence("exceptions.review", exceptions);
      await event("CAPABILITY_COMPLETED", "Exception investigation completed", { exceptions: exceptions.length });
      checks = [{ id: "exceptions.enumerated", passed: true }];
      summary = { resultType: "investigation-completed", exceptions, count: exceptions.length, critical: exceptions.filter((item) => item.severity === "critical").length, actionRequired: exceptions.length > 0 };
    } else if (input.intent === "portfolio.overdue") {
      await event("CAPABILITY_STARTED", "Reviewing overdue portfolio", { capability: "portfolio.overdue" });
      const customers = await business.listCustomers();
      const accounts: Array<Record<string, unknown>> = [];
      const upcoming: Array<Record<string, unknown>> = [];
      for (const candidate of customers) {
        const review = await reviewCustomer(business, candidate);
        const overdue = review.open.filter((row) => row.overdueDays > 0);
        if (overdue.length) accounts.push({
          customerId: candidate.id,
          customer: candidate.name,
          risk: candidate.risk,
          overdueInvoices: overdue.length,
          overdueAmount: overdue.reduce((sum, row) => sum + row.outstanding, 0),
          maxDaysOverdue: Math.max(...overdue.map((row) => row.overdueDays)),
        });
        const dueSoon = review.open.filter((row) => row.overdueDays === 0 && days(DEMO_SNAPSHOT_DATE, row.invoice.dueOn) >= 0 && days(DEMO_SNAPSHOT_DATE, row.invoice.dueOn) <= 14);
        if (dueSoon.length) upcoming.push({ customerId: candidate.id, customer: candidate.name, amount: dueSoon.reduce((sum, row) => sum + row.outstanding, 0), invoices: dueSoon.length });
      }
      accounts.sort((a, b) => Number(b.overdueAmount) - Number(a.overdueAmount));
      const exceptions = await business.listExceptions();
      summary = {
        totalOverdueCustomers: accounts.length,
        totalOverdueAmount: accounts.reduce((sum, account) => sum + Number(account.overdueAmount), 0),
        highestPriority: accounts.slice(0, 5),
        upcomingDueAccounts: upcoming.slice(0, 5),
        exceptionsRequiringReview: exceptions.length,
      };
      await saveEvidence("portfolio.overdue", summary);
      await event("CAPABILITY_COMPLETED", "Portfolio review completed", { overdueCustomers: accounts.length, upcomingAccounts: upcoming.length });
      checks = [
        { id: "portfolio.total.reconciled", passed: Number(summary.totalOverdueAmount) === accounts.reduce((sum, account) => sum + Number(account.overdueAmount), 0) },
        { id: "portfolio.customer.count.consistent", passed: Number(summary.totalOverdueCustomers) === accounts.length },
      ];
    } else if (input.intent === "daily.brief") {
      await event("CAPABILITY_STARTED", "Preparing daily brief", { capability: "daily.brief" });
      const snapshot = await business.getBusinessSnapshot();
      const exceptions = await business.listExceptions();
      const approvals = (await work.listApprovals()).filter((approval) => approval.state === "pending");
      summary = { snapshot, exceptions: exceptions.length, pendingApprovals: approvals.length };
      await saveEvidence("daily.brief", summary);
      await event("CAPABILITY_COMPLETED", "Daily brief prepared", { exceptions: exceptions.length, pendingApprovals: approvals.length });
      checks = [
        { id: "brief.snapshot.available", passed: !!snapshot.snapshotDate },
        { id: "brief.attention.consistent", passed: exceptions.length === snapshot.exceptions },
      ];
    }

    await event("VERIFYING", "Running deterministic verification");
    const result = verification(checks);
    await saveEvidence("verification", result);
    task.status = taskStatus(result.status);
    task.verification = { status: result.status, passed: checks.filter((check) => check.passed).length, total: checks.length };
    task.summary = summary;
    task.outcome = result.status === "PASS" ? completedOutcome(input.intent, summary) : undefined;
    task.updatedAt = now();
    await work.updateTask(task);
    await event(result.status === "PASS" ? "COMPLETED" : "NEEDS_REVIEW", result.status === "PASS" ? "Task completed with deterministic verification" : "Task requires review");
    return { task, verification: result, customer, summary, evidence };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    task.status = "failed";
    task.updatedAt = now();
    task.verification = { status: "FAIL", passed: 0, total: 1 };
    task.summary = { resultType: "execution-failed", message };
    await work.updateTask(task);
    await saveEvidence("execution.error", { message });
    await event("FAILED", message);
    return { task, verification: { status: "FAIL", checks: [{ id: "execution.completed", passed: false, message }] }, summary: task.summary, evidence };
  }
}
