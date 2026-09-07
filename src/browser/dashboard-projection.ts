import type { BusinessApproval, BusinessInboxItem, BusinessTask, TaskEvent } from "../data/models";

export function inboxActionIdentity(item: BusinessInboxItem): string {
  return item.issueKey ?? `${item.type}:${item.relatedEntityType}:${item.relatedEntityId}`;
}
export function approvalActionIdentity(approval: BusinessApproval): string {
  return approval.issueKey ?? `approval:${approval.id}`;
}
export function countActionableIssues(inbox: readonly BusinessInboxItem[], approvals: readonly BusinessApproval[]): number {
  const identities = new Set<string>();
  for (const item of inbox) if (item.status !== "resolved") identities.add(inboxActionIdentity(item));
  for (const approval of approvals) if (approval.state === "pending") identities.add(approvalActionIdentity(approval));
  return identities.size;
}
export function taskOutcomeKey(task: BusinessTask): string {
  if (task.status !== "completed") return ({created:"outcome.ready",running:"outcome.running","needs-review":"outcome.needsReview","needs-approval":"outcome.needsApproval",failed:"outcome.failed",blocked:"outcome.blocked"} as Record<string,string>)[task.status] ?? "outcome.ready";
  if (task.outcome === "completed-attention-required") return task.intent === "payments.reconcile" || task.intent === "exceptions.review" ? "outcome.investigationAction" : "outcome.completedAction";
  if (task.outcome === "completed-resolved") return "outcome.completedResolved";
  if (task.outcome === "completed-no-action") return "outcome.completedNoAction";
  return "outcome.completed";
}

export function taskOutcomeLabel(task: BusinessTask): string {
  if (task.status !== "completed") return ({
    created: "Ready", running: "Running", "needs-review": "Needs Review", "needs-approval": "Needs Approval",
    failed: "Failed", blocked: "Blocked",
  } as Record<string,string>)[task.status] ?? task.status;
  if (task.outcome === "completed-attention-required") return task.intent === "payments.reconcile" || task.intent === "exceptions.review" ? "Investigation completed · Action required" : "Completed · Action required";
  if (task.outcome === "completed-resolved") return "Completed · Resolved";
  if (task.outcome === "completed-no-action") return "Completed · No action";
  return "Completed";
}
export function taskOutcomeClass(task: BusinessTask): string {
  if (task.status === "completed" && task.outcome === "completed-attention-required") return "review";
  if (task.status === "completed") return "completed";
  if (task.status === "needs-review") return "review";
  if (task.status === "needs-approval") return "approval";
  if (task.status === "failed") return "failed";
  if (task.status === "blocked") return "blocked";
  return "running";
}

export interface ActivityItem { type: TaskEvent["type"]; message: string; occurredAt: string; }
export function projectTaskActivity(events: readonly TaskEvent[]): ActivityItem[] {
  const reviewIndex=events.findIndex(event=>event.type==="REVIEW_RESOLVED");
  if(reviewIndex<0)return events.slice(-9).map(event=>({type:event.type,message:event.message,occurredAt:event.occurredAt}));
  const chosen: TaskEvent[]=[];
  const add=(event:TaskEvent|undefined)=>{if(event&&!chosen.includes(event))chosen.push(event)};
  add(events.find(event=>event.type==="CREATED"));
  add(events.find(event=>event.type==="CAPABILITY_STARTED"&&event.message==="Customer lookup"));
  add(events.find(event=>event.type==="NEEDS_REVIEW"));
  add(events[reviewIndex]);
  add(events.slice(reviewIndex+1).find(event=>event.type==="STARTED"));
  add(events.slice(reviewIndex+1).find(event=>event.type==="CUSTOMER_RESOLVED"));
  add(events.slice(reviewIndex+1).find(event=>event.type==="CAPABILITY_COMPLETED"&&event.message==="Receivables reviewed"));
  add([...events].reverse().find(event=>event.type==="VERIFYING"));
  add([...events].reverse().find(event=>event.type==="COMPLETED"||event.type==="FAILED"));
  return chosen.map(event=>({type:event.type,message:event.type==="VERIFYING"&&events.some(candidate=>candidate.type==="COMPLETED")?"Verification passed":event.message,occurredAt:event.occurredAt}));
}
