import type { BusinessRepository } from "../data/business-repository";
import type { WorkRepository } from "../data/work-repository";
import type { BusinessEvidence, BusinessInboxItem, TaskEvent } from "../data/models";
import { createLocalDemoApproval } from "./demo-approval";

async function appendIssueTrace(work: WorkRepository, item: BusinessInboxItem, message: string, data: Record<string, unknown>): Promise<void> {
  for (const taskId of item.relatedTaskIds ?? []) {
    const existing = await work.listTaskEvents(taskId);
    const max = existing.reduce((value, event) => Math.max(value, Date.parse(event.occurredAt)), Date.now() - 1);
    const occurredAt = new Date(max + 1).toISOString();
    const event: TaskEvent = { id: `event-${taskId}-${max + 1}-issue`, taskId, type: "ISSUE_RESOLVED", occurredAt, message, data };
    const evidence: BusinessEvidence = { id: `evidence-${taskId}-issue-${item.id}-${max + 1}`, taskId, type: "inbox.resolution", source: "local-demo", createdAt: occurredAt, data };
    await work.appendTaskEvent(event);
    await work.saveEvidence(evidence);
    const task=await work.getTask(taskId);
    if(task?.status==="completed"){
      const unresolved=(await work.listInbox()).filter(candidate=>(candidate.relatedTaskIds??[]).includes(taskId)&&candidate.status!=="resolved");
      if(unresolved.length===0&&task.outcome==="completed-attention-required"){
        task.outcome="completed-resolved";task.updatedAt=occurredAt;await work.updateTask(task);
      }
    }
  }
}

async function requireIssue(work: WorkRepository, issueId: string): Promise<BusinessInboxItem> {
  const issue = (await work.listInbox()).find((item) => item.id === issueId);
  if (!issue) throw new Error(`Unknown Inbox issue: ${issueId}`);
  return issue;
}

export async function suppressDuplicatePaymentLocally(business: BusinessRepository, work: WorkRepository, issueId: string): Promise<void> {
  const issue = await requireIssue(work, issueId);
  if (issue.type !== "duplicate-payment") throw new Error("Inbox issue is not a duplicate-payment issue.");
  const payment = await business.getPayment(issue.relatedEntityId);
  if (!payment) throw new Error("Duplicate payment record no longer exists.");
  await business.savePayment({ ...payment, suppressed: true });
  const resolution = "Duplicate payment suppressed in Local Demo Simulation. No external system changed.";
  await work.updateInboxStatus(issue.id, "resolved", resolution);
  await appendIssueTrace(work, issue, "Duplicate payment issue resolved locally", { action: "duplicate-payment.suppress", paymentId: payment.id, simulation: true });
}

export async function mapUnmatchedPaymentLocally(business: BusinessRepository, work: WorkRepository, issueId: string, invoiceId: string): Promise<void> {
  const issue = await requireIssue(work, issueId);
  if (issue.type !== "unmatched-payment") throw new Error("Inbox issue is not an unmatched-payment issue.");
  const [payment, invoice] = await Promise.all([business.getPayment(issue.relatedEntityId), business.getInvoice(invoiceId)]);
  if (!payment || !invoice) throw new Error("Payment or target invoice no longer exists.");
  await business.savePayment({ ...payment, customerId: invoice.customerId, invoiceId: invoice.id, status: "matched" });
  const resolution = `Mapped locally to ${invoice.number}. No external system changed.`;
  await work.updateInboxStatus(issue.id, "resolved", resolution);
  await appendIssueTrace(work, issue, "Unmatched payment mapped locally", { action: "unmatched-payment.map", paymentId: payment.id, invoiceId: invoice.id, customerId: invoice.customerId, simulation: true });
}

export async function dismissUnmatchedPaymentLocally(work: WorkRepository, issueId: string): Promise<void> {
  const issue = await requireIssue(work, issueId);
  if (issue.type !== "unmatched-payment") throw new Error("Inbox issue is not an unmatched-payment issue.");
  const resolution = "Dismissed from the local demo work queue. Bank/payment source data was not changed.";
  await work.updateInboxStatus(issue.id, "resolved", resolution);
  await appendIssueTrace(work, issue, "Unmatched payment dismissed locally", { action: "unmatched-payment.dismiss", simulation: true });
}

export async function acknowledgeInvoiceDispute(work: WorkRepository, issueId: string): Promise<void> {
  const issue = await requireIssue(work, issueId);
  if (issue.type !== "invoice-dispute") throw new Error("Inbox issue is not an invoice-dispute issue.");
  await work.updateInboxStatus(issue.id, "investigating", "Dispute acknowledged locally; manager review may still be required.");
}

export async function escalateInboxIssue(work: WorkRepository, issueId: string): Promise<void> {
  const issue = await requireIssue(work, issueId);
  await work.updateInboxStatus(issue.id, "escalated", "Escalated for manager review in Local Demo Simulation. No external system changed.");
}

export async function requestManagerApprovalForIssue(
  business: BusinessRepository,
  work: WorkRepository,
  issueId: string,
  snapshotLabel: string,
): Promise<{ taskId: string; approvalId: string }> {
  const issue = await requireIssue(work, issueId);
  let customerQuery = "Customer";
  if (issue.relatedEntityType === "customer") customerQuery = (await business.getCustomer(issue.relatedEntityId))?.name ?? customerQuery;
  if (issue.relatedEntityType === "invoice") {
    const invoice = await business.getInvoice(issue.relatedEntityId);
    if (invoice) customerQuery = (await business.getCustomer(invoice.customerId))?.name ?? customerQuery;
  }
  const created = await createLocalDemoApproval(work, {
    title: `${issue.title} · manager review`,
    customerQuery,
    snapshotLabel,
    issueKey: issue.issueKey ?? `${issue.type}:${issue.relatedEntityId}`,
  });
  await work.updateInboxStatus(issue.id, "resolved", `Converted to manager approval ${created.approval.id}. The approval now owns this actionable issue.`);
  return { taskId: created.task.id, approvalId: created.approval.id };
}
