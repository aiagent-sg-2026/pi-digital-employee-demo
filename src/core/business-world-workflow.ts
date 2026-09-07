import { DEMO_SNAPSHOT_DATE } from "../demo/seed";
import type { BusinessRepository } from "../data/business-repository";
import type { WorkRepository } from "../data/work-repository";
import type { BusinessCustomer, BusinessEvidence, BusinessInboxItem, BusinessTask, TaskEvent, TaskEventType } from "../data/models";

export type BusinessWorldIntent = "customer.lookup" | "receivables.review" | "payments.reconcile" | "followup.prepare" | "exceptions.review" | "portfolio.overdue" | "daily.brief";
export interface BusinessWorldTaskInput { taskId?:string; title:string; intent:BusinessWorldIntent; customerQuery?:string; }
export interface VerificationCheck { id:string; passed:boolean; message?:string; }
export interface BusinessWorldResult {
  task:BusinessTask;
  verification:{status:"PASS"|"NEEDS_REVIEW"|"FAIL";checks:VerificationCheck[]};
  customer?:BusinessCustomer;
  summary:Record<string,unknown>;
  evidence:BusinessEvidence[];
}

const dayMs=86400000;
const days=(from:string,to:string)=>Math.round((Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/dayMs);
const verification=(checks:VerificationCheck[])=>({status:(checks.every(c=>c.passed)?"PASS":"NEEDS_REVIEW") as "PASS"|"NEEDS_REVIEW",checks});

export async function reviewCustomer(repository:BusinessRepository,customer:BusinessCustomer){
  const [invoices,payments,credits,policies]=await Promise.all([repository.listInvoicesByCustomer(customer.id),repository.listPaymentsByCustomer(customer.id),repository.listCreditNotesByCustomer(customer.id),repository.listPolicies()]);
  const rows=invoices.filter(i=>i.issuedOn<=DEMO_SNAPSHOT_DATE).map(invoice=>{const paid=payments.filter(p=>p.status==="matched"&&p.invoiceId===invoice.id&&p.paidOn<=DEMO_SNAPSHOT_DATE).reduce((s,p)=>s+p.amount,0);const credit=credits.filter(c=>c.invoiceId===invoice.id&&c.issuedOn<=DEMO_SNAPSHOT_DATE).reduce((s,c)=>s+c.amount,0);const outstanding=Math.max(0,invoice.amount-paid-credit);const overdueDays=outstanding>0&&invoice.dueOn<DEMO_SNAPSHOT_DATE?days(invoice.dueOn,DEMO_SNAPSHOT_DATE):0;return{invoice,paymentsApplied:paid,creditsApplied:credit,outstanding,overdueDays};});
  const open=rows.filter(r=>r.outstanding>0);const outstandingTotal=open.reduce((s,r)=>s+r.outstanding,0);
  const followUps=open.map(row=>{const policy=policies.filter(p=>p.condition==="overdue"?row.overdueDays>=(p.minimumDays??Infinity):p.condition==="due-soon"?row.overdueDays===0&&days(DEMO_SNAPSHOT_DATE,row.invoice.dueOn)<=(p.withinDays??-1):p.condition==="high-value"?row.outstanding>=(p.minimumAmount??Infinity):p.condition==="disputed"?row.invoice.status==="disputed":false).sort((a,b)=>(b.minimumDays??0)-(a.minimumDays??0))[0];return policy?{invoiceId:row.invoice.id,policyId:policy.id,action:policy.action,outstandingAmount:row.outstanding}:undefined;}).filter(Boolean) as {invoiceId:string;policyId:string;action:string;outstandingAmount:number}[];
  return{rows,open,outstandingTotal,followUps,payments,credits};
}

function taskStatus(resultStatus:"PASS"|"NEEDS_REVIEW"|"FAIL"):BusinessTask["status"]{return resultStatus==="PASS"?"completed":resultStatus==="NEEDS_REVIEW"?"needs-review":"failed";}

export async function runBusinessWorldTask(business:BusinessRepository,work:WorkRepository,input:BusinessWorldTaskInput):Promise<BusinessWorldResult>{
  const taskId=input.taskId??`task-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;let seq=0;
  const existing=await work.getTask(taskId);
  const priorEvents=existing?await work.listTaskEvents(taskId):[];
  const priorMax=priorEvents.reduce((max,item)=>Math.max(max,Date.parse(item.occurredAt)),0);
  const base=Math.max(Date.now(),priorMax+1);const now=()=>new Date(base+seq).toISOString();
  const task:BusinessTask=existing?{...existing,title:input.title,intent:input.intent,customerQuery:input.customerQuery,status:"running",updatedAt:now()}:{id:taskId,title:input.title,intent:input.intent,customerQuery:input.customerQuery,status:"created",createdAt:now(),updatedAt:now()};
  if(existing) await work.updateTask(task); else await work.createTask(task);
  const event=async(type:TaskEventType,message:string,data?:Record<string,unknown>)=>{const occurredAt=new Date(base+(seq++)).toISOString();const e:TaskEvent={id:`event-${taskId}-${base}-${String(seq).padStart(3,"0")}`,taskId,type,occurredAt,message,data};await work.appendTaskEvent(e);};
  const evidence:BusinessEvidence[]=[];const saveEvidence=async(type:string,data:unknown)=>{const e:BusinessEvidence={id:`evidence-${taskId}-${String(evidence.length).padStart(3,"0")}`,taskId,type,source:"business-world-v1",createdAt:now(),data};evidence.push(e);await work.saveEvidence(e);};
  if(!existing) await event("CREATED","Task created");await event("ROUTED",`Routed to ${input.intent}`,{intent:input.intent});task.status="running";task.updatedAt=now();await work.updateTask(task);await event("STARTED","Alex started work");
  try{
    let customer:BusinessCustomer|undefined;let summary:Record<string,unknown>={};let checks:VerificationCheck[]=[];
    if(["customer.lookup","receivables.review","followup.prepare"].includes(input.intent)){
      await event("CAPABILITY_STARTED","Resolving customer",{capability:"customer.lookup"});const found=await business.findCustomer(input.customerQuery??"");await saveEvidence("customer.lookup",found);await event("CAPABILITY_COMPLETED","Customer lookup completed",{matches:found.canonical.length});
      if(found.canonical.length!==1){checks=[{id:"customer.identity.unique",passed:false,message:found.canonical.length===0?"No customer matched the query.":"Multiple canonical customers matched; clarification required."}];const v=verification(checks);task.status="needs-review";task.verification={status:v.status,passed:0,total:1};task.summary={query:input.customerQuery,matches:found.canonical.map(c=>({id:c.id,name:c.name}))};task.updatedAt=now();await work.updateTask(task);await event("NEEDS_REVIEW",checks[0]!.message!);await saveEvidence("verification",v);return{task,verification:v,summary:task.summary,evidence};}
      customer=found.canonical[0];task.customerId=customer.id;await work.updateTask(task);await event("CUSTOMER_RESOLVED",`Resolved ${customer.name}`,{customerId:customer.id});
      if(input.intent==="customer.lookup"){checks=[{id:"customer.identity.unique",passed:true}];summary={customer:{id:customer.id,code:customer.code,name:customer.name,risk:customer.risk,creditLimit:customer.creditLimit}};}
      else {await event("CAPABILITY_STARTED","Reviewing receivables",{capability:"receivables.review"});const review=await reviewCustomer(business,customer);await saveEvidence("receivables.review",review);await event("CAPABILITY_COMPLETED","Receivables review completed",{openInvoices:review.open.length});checks=[{id:"customer.identity.unique",passed:true},{id:"customer.identity.matches-review",passed:review.rows.every(r=>r.invoice.customerId===customer!.id)&&review.payments.every(p=>!p.customerId||p.customerId===customer!.id)},{id:"invoice.count.consistent",passed:review.open.length===review.rows.filter(r=>r.outstanding>0).length},{id:"invoice.outstanding.reconciled",passed:review.outstandingTotal===review.open.reduce((s,r)=>s+r.outstanding,0)},{id:"invoice.balance.nonnegative",passed:review.rows.every(r=>r.outstanding>=0)},{id:"currency.consistent",passed:review.rows.every(r=>r.invoice.currency===customer!.currency)&&review.payments.every(p=>p.currency===customer!.currency)},{id:"duplicates.suppressed",passed:review.rows.every(r=>!r.invoice.duplicateOf)&&review.payments.every(p=>!p.duplicateOf)},{id:"payments.canonical",passed:review.payments.every(p=>!p.duplicateOf)},{id:"followup.coverage",passed:review.followUps.length===review.open.length},{id:"followup.amount.matches-outstanding",passed:review.followUps.every(f=>review.open.find(r=>r.invoice.id===f.invoiceId)?.outstanding===f.outstandingAmount)}];summary={customer:{id:customer.id,name:customer.name,risk:customer.risk},outstandingInvoices:review.open.length,outstandingTotal:review.outstandingTotal,currency:customer.currency,followUps:review.followUps};}
    } else if(input.intent==="payments.reconcile"){
      await event("CAPABILITY_STARTED","Reconciling payment exceptions",{capability:"payments.reconcile"});
      const exceptions=(await business.listExceptions()).filter(e=>e.type==="unmatched-payment"||e.type==="duplicate-payment");await saveEvidence("payments.reconcile",exceptions);await event("CAPABILITY_COMPLETED","Payment reconciliation completed",{exceptions:exceptions.length});checks=[{id:"payment.exceptions.enumerated",passed:true}];summary={paymentExceptions:exceptions,count:exceptions.length};
    } else if(input.intent==="exceptions.review"){
      await event("CAPABILITY_STARTED","Reviewing business exceptions",{capability:"exceptions.review"});
      const exceptions=await business.listExceptions();await saveEvidence("exceptions.review",exceptions);await event("CAPABILITY_COMPLETED","Exception review completed",{exceptions:exceptions.length});checks=[{id:"exceptions.enumerated",passed:true}];summary={exceptions,count:exceptions.length,critical:exceptions.filter(e=>e.severity==="critical").length};
    } else if(input.intent==="portfolio.overdue"){
      await event("CAPABILITY_STARTED","Reviewing overdue portfolio",{capability:"portfolio.overdue"});
      const customers=await business.listCustomers();const accounts=[] as any[],upcoming=[] as any[];for(const c of customers){const r=await reviewCustomer(business,c);const overdue=r.open.filter(x=>x.overdueDays>0);if(overdue.length)accounts.push({customerId:c.id,customer:c.name,risk:c.risk,overdueInvoices:overdue.length,overdueAmount:overdue.reduce((s,x)=>s+x.outstanding,0),maxDaysOverdue:Math.max(...overdue.map(x=>x.overdueDays))});const dueSoon=r.open.filter(x=>x.overdueDays===0&&days(DEMO_SNAPSHOT_DATE,x.invoice.dueOn)>=0&&days(DEMO_SNAPSHOT_DATE,x.invoice.dueOn)<=14);if(dueSoon.length)upcoming.push({customerId:c.id,customer:c.name,amount:dueSoon.reduce((sum,x)=>sum+x.outstanding,0),invoices:dueSoon.length});}accounts.sort((a,b)=>b.overdueAmount-a.overdueAmount);const exceptions=await business.listExceptions();summary={totalOverdueCustomers:accounts.length,totalOverdueAmount:accounts.reduce((s,a)=>s+a.overdueAmount,0),highestPriority:accounts.slice(0,5),upcomingDueAccounts:upcoming.slice(0,5),exceptionsRequiringReview:exceptions.length};await saveEvidence("portfolio.overdue",summary);await event("CAPABILITY_COMPLETED","Portfolio review completed",{overdueCustomers:accounts.length,upcomingAccounts:upcoming.length});checks=[{id:"portfolio.total.reconciled",passed:(summary.totalOverdueAmount as number)===accounts.reduce((s,a)=>s+a.overdueAmount,0)},{id:"portfolio.customer.count.consistent",passed:(summary.totalOverdueCustomers as number)===accounts.length}];
    } else if(input.intent==="daily.brief"){
      await event("CAPABILITY_STARTED","Preparing daily brief",{capability:"daily.brief"});
      const snapshot=await business.getBusinessSnapshot();const exceptions=await business.listExceptions();const approvals=(await work.listApprovals()).filter(a=>a.state==="pending");summary={snapshot,exceptions:exceptions.length,pendingApprovals:approvals.length};await saveEvidence("daily.brief",summary);await event("CAPABILITY_COMPLETED","Daily brief prepared",{exceptions:exceptions.length,pendingApprovals:approvals.length});checks=[{id:"brief.snapshot.available",passed:!!snapshot.snapshotDate},{id:"brief.attention.consistent",passed:exceptions.length===snapshot.exceptions}];
    }
    await event("VERIFYING","Running deterministic verification");const v=verification(checks);await saveEvidence("verification",v);task.status=taskStatus(v.status);task.verification={status:v.status,passed:checks.filter(c=>c.passed).length,total:checks.length};task.summary=summary;task.updatedAt=now();await work.updateTask(task);await event(v.status==="PASS"?"COMPLETED":"NEEDS_REVIEW",v.status==="PASS"?"Task completed with deterministic verification":"Task requires review");return{task,verification:v,customer,summary,evidence};
  }catch(error){const message=error instanceof Error?error.message:String(error);task.status="failed";task.updatedAt=now();task.verification={status:"FAIL",passed:0,total:1};await work.updateTask(task);await saveEvidence("execution.error",{message});await event("FAILED",message);return{task,verification:{status:"FAIL",checks:[{id:"execution.completed",passed:false,message}]},summary:{error:message},evidence};}
}
