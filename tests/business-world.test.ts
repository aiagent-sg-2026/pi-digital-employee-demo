import { beforeEach, describe, expect, it } from "vitest";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";
import { BUSINESS_DB_NAME, BUSINESS_DB_VERSION, STORES, initializeBusinessWorld, openBusinessDatabase, resetEntireDemo } from "../src/data/indexeddb";
import { IndexedDbBusinessRepository } from "../src/data/business-repository";
import { IndexedDbWorkRepository } from "../src/data/work-repository";
import { reviewCustomer, runBusinessWorldTask } from "../src/core/business-world-workflow";
import { demoSeed } from "../src/demo/seed";

Object.assign(globalThis,{indexedDB,IDBKeyRange});
class MemoryStorage { data=new Map<string,string>(); getItem(k:string){return this.data.get(k)??null} setItem(k:string,v:string){this.data.set(k,String(v))} removeItem(k:string){this.data.delete(k)} clear(){this.data.clear()} key(i:number){return [...this.data.keys()][i]??null} get length(){return this.data.size} }
const storage=new MemoryStorage(); Object.defineProperty(globalThis,"localStorage",{value:storage,configurable:true});
const deleteDb=()=>new Promise<void>((resolve,reject)=>{const r=indexedDB.deleteDatabase(BUSINESS_DB_NAME);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);r.onblocked=()=>resolve();});

beforeEach(async()=>{storage.clear();await deleteDb();});

describe("Browser-first Business World V1",()=>{
  it("initializes versioned multi-store IndexedDB and deterministic seed",async()=>{await initializeBusinessWorld();const db=await openBusinessDatabase();expect(db.version).toBe(BUSINESS_DB_VERSION);for(const name of Object.values(STORES))expect(db.objectStoreNames.contains(name)).toBe(true);db.close();expect(demoSeed.customers.length).toBeGreaterThanOrEqual(12);expect(demoSeed.invoices.length).toBeGreaterThanOrEqual(40);expect(demoSeed.payments.length).toBeGreaterThanOrEqual(20);expect(demoSeed.creditNotes.length).toBeGreaterThanOrEqual(5);expect(demoSeed.followUpPolicies.length).toBeGreaterThanOrEqual(5);});
  it("supports multiple customers, Beacon success and explicit ambiguity",async()=>{await initializeBusinessWorld();const repo=new IndexedDbBusinessRepository();expect((await repo.findCustomer("Beacon")).canonical.map(c=>c.name)).toEqual(["Beacon Retail Pte Ltd"]);expect((await repo.findCustomer("Twin")).canonical).toHaveLength(2);expect((await repo.findCustomer("ACME")).canonical[0]?.name).toBe("ACME Trading Pte Ltd");});
  it("handles paid and overdue customer business invariants",async()=>{await initializeBusinessWorld();const repo=new IndexedDbBusinessRepository();const paid=(await repo.findCustomer("Evergreen")).canonical[0]!;expect((await reviewCustomer(repo,paid)).outstandingTotal).toBe(0);const acme=(await repo.findCustomer("ACME")).canonical[0]!;const review=await reviewCustomer(repo,acme);expect(review.outstandingTotal).toBe(14520);expect(review.rows.every(r=>r.outstanding>=0)).toBe(true);});
  it("notifies execution observers only after task events are persisted",async()=>{await initializeBusinessWorld();const business=new IndexedDbBusinessRepository(),work=new IndexedDbWorkRepository();const observed:string[]=[];const result=await runBusinessWorldTask(business,work,{title:"Observed ACME review",intent:"receivables.review",customerQuery:"ACME",onEvent:async event=>{const persisted=(await work.listTaskEvents(event.taskId)).find(item=>item.id===event.id);expect(persisted?.type).toBe(event.type);observed.push(event.type);}});expect(result.task.status).toBe("completed");expect(observed.slice(0,3)).toEqual(["CREATED","ROUTED","STARTED"]);expect(observed).toContain("VERIFYING");expect(observed.at(-1)).toBe("COMPLETED");});
  it("runs portfolio overdue work with ordered task events and separate evidence",async()=>{await initializeBusinessWorld();const business=new IndexedDbBusinessRepository(), work=new IndexedDbWorkRepository();const result=await runBusinessWorldTask(business,work,{title:"Show overdue customers",intent:"portfolio.overdue"});expect(result.task.status).toBe("completed");expect(Number(result.summary.totalOverdueCustomers)).toBeGreaterThan(1);expect(Number(result.summary.totalOverdueAmount)).toBeGreaterThan(14520);expect((result.summary.upcomingDueAccounts as any[]).length).toBeGreaterThan(0);const events=await work.listTaskEvents(result.task.id);expect(events.map(e=>e.type).slice(0,3)).toEqual(["CREATED","ROUTED","STARTED"]);expect(events.at(-1)?.type).toBe("COMPLETED");const stored=await work.getTask(result.task.id);expect(JSON.stringify(stored)).not.toContain("invoice-");expect((await work.listEvidence(result.task.id)).length).toBeGreaterThan(0);});
  it("surfaces unmatched payment exceptions deterministically",async()=>{await initializeBusinessWorld();const business=new IndexedDbBusinessRepository(),work=new IndexedDbWorkRepository();const result=await runBusinessWorldTask(business,work,{title:"Investigate unmatched payments",intent:"payments.reconcile"});expect(result.task.status).toBe("completed");const exceptions=result.summary.paymentExceptions as any[];expect(exceptions.some(e=>e.type==="unmatched-payment")).toBe(true);});
  it("resets the entire demo back to the same seed and clears work",async()=>{await initializeBusinessWorld();const business=new IndexedDbBusinessRepository(),work=new IndexedDbWorkRepository();await runBusinessWorldTask(business,work,{title:"Review ACME receivables",intent:"receivables.review",customerQuery:"ACME"});expect((await work.listTaskHistory()).length).toBe(1);await resetEntireDemo();expect((await work.listTaskHistory()).length).toBe(0);expect((await business.listCustomers()).length).toBeGreaterThanOrEqual(12);expect((await business.getBusinessSnapshot()).snapshotDate).toBe("2025-03-01");});
});

describe("Local approval simulation",()=>{
  it("approves, resumes, and creates a local draft without external write",async()=>{await initializeBusinessWorld();const work=new IndexedDbWorkRepository();const {createLocalDemoApproval,approveLocalDemo}=await import("../src/core/demo-approval");const created=await createLocalDemoApproval(work,{title:"Approval test",customerQuery:"ACME",snapshotLabel:"Snapshot 1 Mar 2025"});expect(created.task.status).toBe("needs-approval");const approved=await approveLocalDemo(work,created.approval.id);expect(approved?.approval.state).toBe("approved");expect((await work.listDraftActions(created.task.id))).toHaveLength(1);expect((await work.listTaskEvents(created.task.id)).map(e=>e.type)).toEqual(expect.arrayContaining(["NEEDS_APPROVAL","APPROVED","RESUMED"]));});
  it("rejects without executing business work",async()=>{await initializeBusinessWorld();const work=new IndexedDbWorkRepository();const {createLocalDemoApproval,rejectLocalDemo}=await import("../src/core/demo-approval");const created=await createLocalDemoApproval(work,{title:"Reject test",customerQuery:"Riverside",snapshotLabel:"Snapshot 1 Mar 2025"});const rejected=await rejectLocalDemo(work,created.approval.id);expect(rejected?.task.status).toBe("blocked");expect((await work.listDraftActions(created.task.id))).toHaveLength(0);expect((await work.listTaskEvents(created.task.id)).at(-1)?.type).toBe("REJECTED");});
});

describe("Business World migration and work queue",()=>{
  it("migrates the previous IndexedDB v1 giant ledger into separated stores",async()=>{
    const open=indexedDB.open(BUSINESS_DB_NAME,1);open.onupgradeneeded=()=>open.result.createObjectStore("dashboard-state",{keyPath:"id"});const oldDb=await new Promise<IDBDatabase>((resolve,reject)=>{open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error)});const tx=oldDb.transaction("dashboard-state","readwrite");tx.objectStore("dashboard-state").put({id:"ledger",value:{version:1,work:[{id:"legacy-task",task:"Legacy ACME review",customerQuery:"ACME",intent:"receivables-review",status:"Completed",createdAt:"2026-09-01T00:00:00Z",result:{summary:{customerId:"customer-acme",customer:"ACME Trading Pte Ltd",outstandingTotal:14520},verification:{status:"PASS",checks:[{id:"legacy",passed:true}]},evidence:[{type:"legacy",source:"v1",data:{ok:true}}]}}],inbox:[],approvals:[]}});await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});oldDb.close();await initializeBusinessWorld();const work=new IndexedDbWorkRepository();expect((await work.getTask("legacy-task"))?.status).toBe("completed");expect((await work.listEvidence("legacy-task"))).toHaveLength(1);const upgraded=await openBusinessDatabase();expect(upgraded.objectStoreNames.contains("customers")).toBe(true);upgraded.close();
  });
  it("migrates the older localStorage ledger once and removes the legacy key",async()=>{storage.setItem("digital-employee-dashboard-v1-ledger",JSON.stringify({version:1,work:[{id:"legacy-local",task:"Old task",status:"Blocked",createdAt:"2026-08-01T00:00:00Z"}],inbox:[],approvals:[]}));await initializeBusinessWorld();const work=new IndexedDbWorkRepository();expect((await work.getTask("legacy-local"))?.status).toBe("blocked");expect(storage.getItem("digital-employee-dashboard-v1-ledger")).toBeNull();});
  it("backfills seeded issue presentation metadata without resetting user issue status",async()=>{await initializeBusinessWorld();const work=new IndexedDbWorkRepository();const item=(await work.listInbox()).find(i=>i.id==="inbox-unmatched-payment")!;await work.saveInboxItem({...item,status:"escalated",messageKey:undefined,messageParams:undefined});await initializeBusinessWorld();const restored=(await work.listInbox()).find(i=>i.id===item.id)!;expect(restored.status).toBe("escalated");expect(restored.messageKey).toBe("issue.unmatchedPayment");expect(restored.messageParams).toMatchObject({amount:2750,currency:"SGD"});});
  it("supports Inbox investigate resolve and escalate status transitions",async()=>{await initializeBusinessWorld();const work=new IndexedDbWorkRepository();const item=(await work.listInbox()).find(i=>i.type==="unmatched-payment")!;await work.updateInboxStatus(item.id,"investigating","Opened investigation");expect((await work.listInbox()).find(i=>i.id===item.id)?.status).toBe("investigating");await work.updateInboxStatus(item.id,"escalated","Manager review");expect((await work.listInbox()).find(i=>i.id===item.id)?.resolution).toBe("Manager review");});
  it("prepares a verified daily brief without creating employee work on seed",async()=>{await initializeBusinessWorld();const business=new IndexedDbBusinessRepository(),work=new IndexedDbWorkRepository();expect((await work.listTaskHistory())).toHaveLength(0);const result=await runBusinessWorldTask(business,work,{title:"Daily brief",intent:"daily.brief"});expect(result.task.status).toBe("completed");expect((result.summary.snapshot as any).openReceivables).toBeGreaterThan(0);expect(result.verification.status).toBe("PASS");});
});

it("keeps approval resume event order monotonic through completed workflow",async()=>{await initializeBusinessWorld();const business=new IndexedDbBusinessRepository(),work=new IndexedDbWorkRepository();const {createLocalDemoApproval,approveLocalDemo}=await import("../src/core/demo-approval");const created=await createLocalDemoApproval(work,{title:"Approval resume order",customerQuery:"ACME",snapshotLabel:"Snapshot 1 Mar 2025"});await approveLocalDemo(work,created.approval.id);await runBusinessWorldTask(business,work,{taskId:created.task.id,title:created.task.title,intent:"followup.prepare",customerQuery:"ACME"});const types=(await work.listTaskEvents(created.task.id)).map(e=>e.type);const approved=types.indexOf("APPROVED"),resumed=types.indexOf("RESUMED"),routed=types.lastIndexOf("ROUTED"),started=types.lastIndexOf("STARTED"),completed=types.lastIndexOf("COMPLETED");expect(approved).toBeLessThan(resumed);expect(resumed).toBeLessThan(routed);expect(routed).toBeLessThan(started);expect(started).toBeLessThan(completed);});

it("runs Beacon workflow, handles customer-not-found, and verifies duplicate suppression",async()=>{await initializeBusinessWorld();const business=new IndexedDbBusinessRepository(),work=new IndexedDbWorkRepository();const beacon=await runBusinessWorldTask(business,work,{title:"Check Beacon receivables",intent:"receivables.review",customerQuery:"Beacon"});expect(beacon.task.status).toBe("completed");expect((beacon.summary.customer as any).name).toBe("Beacon Retail Pte Ltd");const missing=await runBusinessWorldTask(business,work,{title:"Review Ghost receivables",intent:"receivables.review",customerQuery:"Ghost"});expect(missing.task.status).toBe("needs-review");expect(missing.verification.checks[0]?.id).toBe("customer.identity.unique");const acme=await runBusinessWorldTask(business,work,{title:"Review ACME",intent:"receivables.review",customerQuery:"ACME"});expect(acme.verification.checks.find(c=>c.id==="duplicates.suppressed")?.passed).toBe(true);});

describe("Recoverable human review",()=>{
  it("resolves ambiguous customer on the same task and resumes receivables verification",async()=>{
    await initializeBusinessWorld();
    const business=new IndexedDbBusinessRepository(),work=new IndexedDbWorkRepository();
    const initial=await runBusinessWorldTask(business,work,{title:"Resolve ambiguous customer",intent:"receivables.review",customerQuery:"Twin"});
    expect(initial.task.status).toBe("needs-review");
    expect(initial.task.review?.candidateCustomerIds).toEqual(expect.arrayContaining(["customer-twin-north","customer-twin-south"]));
    const {resolveAmbiguousCustomerReview}=await import("../src/core/business-world-workflow");
    const resumed=await resolveAmbiguousCustomerReview(business,work,initial.task.id,"customer-twin-north");
    expect(resumed.task.id).toBe(initial.task.id);
    expect(resumed.task.status).toBe("completed");
    expect(resumed.task.customerId).toBe("customer-twin-north");
    expect(resumed.verification.status).toBe("PASS");
    expect((resumed.summary.customer as any).name).toBe("Twin North Trading Pte Ltd");
    const events=(await work.listTaskEvents(initial.task.id)).map(event=>event.type);
    expect(events).toContain("NEEDS_REVIEW");
    expect(events).toContain("REVIEW_RESOLVED");
    expect(events.indexOf("NEEDS_REVIEW")).toBeLessThan(events.indexOf("REVIEW_RESOLVED"));
    expect(events.indexOf("REVIEW_RESOLVED")).toBeLessThan(events.lastIndexOf("COMPLETED"));
  });

  it("deduplicates repeated unresolved ambiguity by stable issue identity",async()=>{
    await initializeBusinessWorld();
    const business=new IndexedDbBusinessRepository(),work=new IndexedDbWorkRepository();
    await runBusinessWorldTask(business,work,{title:"Resolve ambiguous customer one",intent:"receivables.review",customerQuery:"Twin"});
    const afterOne=(await work.listInbox()).filter(item=>item.issueKey==="ambiguous-customer:twin"&&item.status!=="resolved");
    await runBusinessWorldTask(business,work,{title:"Resolve ambiguous customer two",intent:"receivables.review",customerQuery:"Twin"});
    const afterTwo=(await work.listInbox()).filter(item=>item.issueKey==="ambiguous-customer:twin"&&item.status!=="resolved");
    expect(afterOne).toHaveLength(1);
    expect(afterTwo).toHaveLength(1);
    expect(afterTwo[0]?.relatedTaskIds).toHaveLength(2);
  });
});

describe("Domain-specific Inbox resolution",()=>{
  it("suppresses a duplicate payment locally and records task evidence",async()=>{
    await initializeBusinessWorld();
    const business=new IndexedDbBusinessRepository(),work=new IndexedDbWorkRepository();
    const investigation=await runBusinessWorldTask(business,work,{title:"Investigate unmatched payments",intent:"payments.reconcile"});
    const issue=(await work.listInbox()).find(item=>item.type==="duplicate-payment")!;
    expect(issue.relatedTaskIds).toContain(investigation.task.id);
    const {suppressDuplicatePaymentLocally}=await import("../src/core/inbox-resolution");
    await suppressDuplicatePaymentLocally(business,work,issue.id);
    expect((await business.getPayment(issue.relatedEntityId))?.suppressed).toBe(true);
    expect((await work.listInbox()).find(item=>item.id===issue.id)?.status).toBe("resolved");
    expect((await work.listTaskEvents(investigation.task.id)).some(event=>event.type==="ISSUE_RESOLVED")).toBe(true);
    expect((await work.listEvidence(investigation.task.id)).some(evidence=>evidence.type==="inbox.resolution")).toBe(true);
  });

  it("maps an unmatched payment to an existing invoice locally",async()=>{
    await initializeBusinessWorld();
    const business=new IndexedDbBusinessRepository(),work=new IndexedDbWorkRepository();
    const investigation=await runBusinessWorldTask(business,work,{title:"Investigate unmatched payments",intent:"payments.reconcile"});
    const issue=(await work.listInbox()).find(item=>item.type==="unmatched-payment")!;
    const acme=(await business.findCustomer("ACME")).canonical[0]!;
    const target=(await business.listInvoicesByCustomer(acme.id)).find(invoice=>invoice.status==="open")!;
    const {mapUnmatchedPaymentLocally}=await import("../src/core/inbox-resolution");
    await mapUnmatchedPaymentLocally(business,work,issue.id,target.id);
    const payment=await business.getPayment(issue.relatedEntityId);
    expect(payment).toMatchObject({status:"matched",customerId:acme.id,invoiceId:target.id});
    expect((await work.listInbox()).find(item=>item.id===issue.id)?.status).toBe("resolved");
    expect((await work.listTaskEvents(investigation.task.id)).some(event=>event.type==="ISSUE_RESOLVED")).toBe(true);
    const duplicate=(await work.listInbox()).find(item=>item.type==="duplicate-payment")!;
    const {suppressDuplicatePaymentLocally}=await import("../src/core/inbox-resolution");
    await suppressDuplicatePaymentLocally(business,work,duplicate.id);
    expect((await work.getTask(investigation.task.id))?.outcome).toBe("completed-resolved");
  });

  it("converts a credit-limit issue into one manager approval action identity",async()=>{
    await initializeBusinessWorld();
    const business=new IndexedDbBusinessRepository(),work=new IndexedDbWorkRepository();
    const {countActionableIssues}=await import("../src/browser/dashboard-projection");
    const before=countActionableIssues(await work.listInbox(),await work.listApprovals());
    const issue=(await work.listInbox()).find(item=>item.type==="credit-limit")!;
    const {requestManagerApprovalForIssue}=await import("../src/core/inbox-resolution");
    const created=await requestManagerApprovalForIssue(business,work,issue.id,"Snapshot 1 Mar 2025");
    const afterInbox=await work.listInbox(),afterApprovals=await work.listApprovals();
    expect((afterInbox.find(item=>item.id===issue.id))?.status).toBe("resolved");
    const approval=afterApprovals.find(item=>item.id===created.approvalId)!;
    const approvalInbox=afterInbox.find(item=>item.relatedEntityId===created.approvalId)!;
    expect(approval.issueKey).toBe(issue.issueKey);
    expect(approvalInbox.issueKey).toBe(issue.issueKey);
    expect(countActionableIssues(afterInbox,afterApprovals)).toBe(before);
  });

  it("counts a new explicit approval only once across Approval and Inbox",async()=>{
    await initializeBusinessWorld();
    const work=new IndexedDbWorkRepository();
    const {countActionableIssues}=await import("../src/browser/dashboard-projection");
    expect(countActionableIssues(await work.listInbox(),await work.listApprovals())).toBe(5);
    const {createLocalDemoApproval}=await import("../src/core/demo-approval");
    await createLocalDemoApproval(work,{title:"New approval",customerQuery:"ACME",snapshotLabel:"Snapshot 1 Mar 2025"});
    expect(countActionableIssues(await work.listInbox(),await work.listApprovals())).toBe(6);
  });
});

it("clear task history removes task-generated Inbox links but preserves seeded issues",async()=>{
  await initializeBusinessWorld();
  const business=new IndexedDbBusinessRepository(),work=new IndexedDbWorkRepository();
  await runBusinessWorldTask(business,work,{title:"Investigate unmatched payments",intent:"payments.reconcile"});
  expect((await work.listInbox()).some(item=>item.seeded&&(item.relatedTaskIds?.length??0)>0)).toBe(true);
  const {clearTaskHistory}=await import("../src/data/indexeddb");
  await clearTaskHistory();
  const seeded=(await work.listInbox()).filter(item=>item.seeded);
  expect(seeded).toHaveLength(5);
  expect(seeded.every(item=>(item.relatedTaskIds?.length??0)===0)).toBe(true);
  expect(await work.listTaskHistory()).toHaveLength(0);
});
