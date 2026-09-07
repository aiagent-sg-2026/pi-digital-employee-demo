import {describe,expect,it} from "vitest";
import {countActionableIssues,projectTaskActivity,taskOutcomeLabel} from "../src/browser/dashboard-projection";
import type {BusinessApproval,BusinessInboxItem,BusinessTask} from "../src/data/models";

describe("dashboard projection",()=>{
  it("counts one approval action only once across Approval and Inbox",()=>{
    const seeded=Array.from({length:5},(_,index)=>({id:`seed-${index}`,issueKey:`seed:${index}`,type:"invoice-dispute",severity:"warning",relatedEntityType:"invoice",relatedEntityId:`invoice-${index}`,createdAt:"2025-03-01T00:00:00Z",status:"open",title:"Issue",detail:"Issue"})) as BusinessInboxItem[];
    const approvalInbox={id:"inbox-approval",issueKey:"approval:one",type:"approval-required",severity:"warning",relatedEntityType:"approval",relatedEntityId:"approval-one",createdAt:"2025-03-01T00:00:00Z",status:"open",title:"Approval",detail:"Approval"} as BusinessInboxItem;
    const approval={id:"approval-one",issueKey:"approval:one",taskId:"task-one",state:"pending",title:"Approval",what:"Local",why:"Demo",affected:"Demo",impact:"No external system changed",createdAt:"2025-03-01T00:00:00Z",simulation:true} as BusinessApproval;
    expect(countActionableIssues(seeded,[])).toBe(5);
    expect(countActionableIssues([...seeded,approvalInbox],[approval])).toBe(6);
  });
  it("distinguishes a completed investigation from resolved business issues",()=>{
    const task={id:"t",title:"Investigate",intent:"payments.reconcile",status:"completed",createdAt:"x",updatedAt:"x",outcome:"completed-attention-required"} as BusinessTask;
    expect(taskOutcomeLabel(task)).toContain("Action required");
  });
});

it("projects the recoverable review path in human-readable order",()=>{
  const base="2026-09-07T00:00:00.00";
  const event=(type:any,message:string,index:number)=>({id:String(index),taskId:"t",type,message,occurredAt:`${base}${index}Z`});
  const projected=projectTaskActivity([
    event("CREATED","Task received",0),event("ROUTED","Routed",1),event("STARTED","Alex started work",2),event("CAPABILITY_STARTED","Customer lookup",3),
    event("CAPABILITY_COMPLETED","Customer lookup completed",4),event("NEEDS_REVIEW","Multiple customer matches found. Waiting for manager selection.",5),
    event("REVIEW_RESOLVED","Manager selected Twin North Trading Pte Ltd",6),event("ROUTED","Routed",7),event("STARTED","Task resumed",8),
    event("CUSTOMER_RESOLVED","Customer selected: Twin North Trading Pte Ltd",9),event("CAPABILITY_STARTED","Reviewing receivables",10),
    event("CAPABILITY_COMPLETED","Receivables reviewed",11),event("VERIFYING","Running deterministic verification",12),event("COMPLETED","Task completed with deterministic verification",13),
  ] as any);
  expect(projected.map(item=>item.message)).toEqual(expect.arrayContaining(["Task received","Multiple customer matches found. Waiting for manager selection.","Manager selected Twin North Trading Pte Ltd","Task resumed","Receivables reviewed","Verification passed","Task completed with deterministic verification"]));
});
