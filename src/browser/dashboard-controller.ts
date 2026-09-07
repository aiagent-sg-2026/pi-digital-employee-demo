import { DEMO_COMPANY_NAME, DEMO_SNAPSHOT_DATE } from "../demo/seed";
import { IndexedDbBusinessRepository } from "../data/business-repository";
import { IndexedDbWorkRepository } from "../data/work-repository";
import { clearTaskHistory, initializeBusinessWorld, resetEntireDemo, restoreSampleBusinessData } from "../data/indexeddb";
import type { BusinessApproval, BusinessInboxItem, BusinessTask } from "../data/models";
import { approveLocalDemo, createLocalDemoApproval, rejectLocalDemo } from "../core/demo-approval";
import { resolveAmbiguousCustomerReview, reviewCustomer, runBusinessWorldTask, type BusinessWorldResult } from "../core/business-world-workflow";
import { acknowledgeInvoiceDispute, dismissUnmatchedPaymentLocally, escalateInboxIssue, mapUnmatchedPaymentLocally, requestManagerApprovalForIssue, suppressDuplicatePaymentLocally } from "../core/inbox-resolution";
import { countActionableIssues, projectTaskActivity, taskOutcomeClass, taskOutcomeLabel } from "./dashboard-projection";
import { createDemoGatewayClient, DemoGatewayError, DemoGatewayRateLimitError } from "../shared/demo-gateway-client";
import { routeDashboardTask } from "./task-router";
import { svgIcon } from "./icons";

const $=<T extends Element>(selector:string)=>document.querySelector<T>(selector)!;
const form=$<HTMLFormElement>("#task-form"), taskInput=$<HTMLInputElement>("#task-input"), assignButton=$<HTMLButtonElement>("#assign-task");
const suggestionButtons=[...document.querySelectorAll<HTMLButtonElement>(".quick-task,.scenario-task")];
const workBody=$<HTMLTableSectionElement>("#work-body"), workCards=$<HTMLElement>("#work-cards"), workCount=$<HTMLElement>("#work-count"), historyCount=$<HTMLElement>("#history-count");
const detailState=$<HTMLElement>("#detail-state"), businessResult=$<HTMLElement>("#business-result"), businessMeta=$<HTMLElement>("#business-meta");
const verificationList=$<HTMLElement>("#verification-list"), verificationCount=$<HTMLElement>("#verification-count"), rawEvidence=$<HTMLPreElement>("#raw-evidence"), evidenceDetails=$<HTMLDetailsElement>("#evidence-details");
const aiSummary=$<HTMLElement>("#ai-summary"), gatewayStatus=$<HTMLElement>("#gateway-status"), gatewayConnection=$<HTMLElement>("#gateway-connection"), currentActivity=$<HTMLElement>("#current-activity");
const employeeMode=$<HTMLElement>("#employee-mode"), lastUpdated=$<HTMLElement>("#last-updated"), composerFeedback=$<HTMLElement>("#composer-feedback");
const inboxList=$<HTMLElement>("#inbox-list"), inboxBadge=$<HTMLElement>("#inbox-badge"), approvalList=$<HTMLElement>("#approval-list"), approvalBadge=$<HTMLElement>("#approval-badge");
const kpiCompleted=$<HTMLElement>("#kpi-completed"), kpiCustomers=$<HTMLElement>("#kpi-customers"), kpiApprovals=$<HTMLElement>("#kpi-approvals"), kpiAttention=$<HTMLElement>("#kpi-attention");
const snapshotOpen=$<HTMLElement>("#snapshot-open"), snapshotOverdue=$<HTMLElement>("#snapshot-overdue"), snapshotRisk=$<HTMLElement>("#snapshot-risk"), snapshotExceptions=$<HTMLElement>("#snapshot-exceptions"), snapshotDate=$<HTMLElement>("#snapshot-date");
const briefTitle=$<HTMLElement>("#brief-title"), briefCopy=$<HTMLElement>("#brief-copy"), briefList=$<HTMLElement>("#brief-list"), briefNote=$<HTMLElement>("#brief-note");
const customerSearch=$<HTMLInputElement>("#customer-search"), customerList=$<HTMLElement>("#customer-list"), customerDetail=$<HTMLElement>("#customer-detail"), historyList=$<HTMLElement>("#history-list");
const trustDrawer=$<HTMLElement>("#trust-drawer"), drawerOverlay=$<HTMLElement>("#drawer-overlay"), openTrustDrawerButton=$<HTMLButtonElement>("#open-trust-drawer"), closeTrustDrawerButton=$<HTMLButtonElement>("#close-trust-drawer");
const datasetSnapshot=$<HTMLElement>("#dataset-snapshot"), businessDataDetail=$<HTMLElement>("#business-data-detail");

const business=new IndexedDbBusinessRepository(); const work=new IndexedDbWorkRepository(); const gateway=createDemoGatewayClient({origin:window.location.origin});
let running=false; let latestEvidence=""; let tasks:BusinessTask[]=[]; let inbox:BusinessInboxItem[]=[]; let approvals:BusinessApproval[]=[];
const esc=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]!));
const money=(n:number)=>`SGD ${n.toLocaleString("en-SG")}`;
const dateLabel=()=>new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(`${DEMO_SNAPSHOT_DATE}T00:00:00Z`));
const statusLabel=(s:BusinessTask["status"])=>({created:"Ready",running:"Running","needs-review":"Needs Review","needs-approval":"Needs Approval",completed:"Completed",failed:"Failed",blocked:"Blocked"}[s]);
const statusClass=(s:BusinessTask["status"])=>s==="completed"?"completed":s==="needs-review"?"review":s==="needs-approval"?"approval":s==="failed"?"failed":s==="blocked"?"blocked":"running";
function setEmployeeMode(mode:string){employeeMode.textContent=mode;lastUpdated.textContent=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});}
function setDetail(task?:BusinessTask){if(!task){detailState.textContent="Ready";detailState.className="status-chip running";return;}detailState.textContent=taskOutcomeLabel(task);detailState.className=`status-chip ${taskOutcomeClass(task)}`;}
function resetWorkspace(clearComposer=true,focus=clearComposer){if(clearComposer)taskInput.value="";composerFeedback.textContent="";setDetail();businessMeta.textContent="No verified result yet";businessResult.innerHTML='<p class="approval-empty">Assign a task to see Alex\'s verified business result.</p>';verificationCount.textContent="0 / 0";verificationList.innerHTML=`<li><span class="check-icon">${svgIcon("circle")}</span><div>Waiting for verified evidence.</div></li>`;rawEvidence.textContent="";latestEvidence="";evidenceDetails.open=false;aiSummary.textContent="Generated only after deterministic verification passes.";gatewayStatus.textContent="Demo Gateway not called yet.";currentActivity.innerHTML=`<li><span class="activity-icon idle">${svgIcon("circle")}</span><div class="activity-copy"><strong>Waiting for work</strong><small>Assign a task to Alex.</small></div></li>`;setEmployeeMode("Available");if(focus)taskInput.focus();}
async function refreshData(){[tasks,inbox,approvals]=await Promise.all([work.listTaskHistory(),work.listInbox(),work.listApprovals()]);}
async function renderKpis(){
  const completed=tasks.filter(task=>task.status==="completed");
  const customers=new Set(completed.map(task=>task.customerId).filter(Boolean));
  const pending=approvals.filter(approval=>approval.state==="pending").length;
  const attention=countActionableIssues(inbox,approvals);
  kpiCompleted.textContent=String(completed.length);
  kpiCustomers.textContent=String(customers.size);
  kpiApprovals.textContent=String(pending);
  kpiAttention.textContent=String(attention);
  const snap=await business.getBusinessSnapshot();
  snapshotOpen.textContent=money(snap.openReceivables);snapshotOverdue.textContent=String(snap.overdueInvoices);
  snapshotRisk.textContent=String(snap.customersAtRisk);snapshotExceptions.textContent=String(snap.exceptions);snapshotDate.textContent=`Snapshot ${dateLabel()}`;
}
function renderWork(){
  workCount.textContent=`${tasks.length} ${tasks.length===1?"task":"tasks"}`;historyCount.textContent=workCount.textContent;
  if(!tasks.length){workBody.innerHTML='<tr><td class="empty-row" colspan="5">Assign a task to start Alex\'s work queue.</td></tr>';workCards.innerHTML='<div class="approval-empty">No tasks yet.</div>';return;}
  workBody.innerHTML=tasks.slice(0,8).map(task=>`<tr><td><div class="task-name">${esc(task.title)}</div><div class="task-context">${esc(task.intent)}</div></td><td>${esc(task.customerQuery??DEMO_COMPANY_NAME)}</td><td><span class="status-chip ${taskOutcomeClass(task)}">${esc(taskOutcomeLabel(task))}</span></td><td>${esc(task.verification?`${task.verification.passed}/${task.verification.total} verified`:task.status)}</td><td><button class="link-btn inspect-task" data-task-id="${task.id}" type="button">View</button></td></tr>`).join("");
  workCards.innerHTML=tasks.slice(0,8).map(task=>`<article class="work-card"><div class="work-card-head"><h3>${esc(task.title)}</h3><span class="status-chip ${taskOutcomeClass(task)}">${esc(taskOutcomeLabel(task))}</span></div><dl><dt>Intent</dt><dd>${esc(task.intent)}</dd><dt>Context</dt><dd>${esc(task.customerQuery??DEMO_COMPANY_NAME)}</dd><dt>Updated</dt><dd>${new Date(task.updatedAt).toLocaleString()}</dd></dl><button class="link-btn inspect-task" data-task-id="${task.id}" type="button">View task</button></article>`).join("");
}
function inboxActions(item:BusinessInboxItem,relatedTask?:BusinessTask,invoiceOptions=""){
  const openTask=relatedTask?`<button class="secondary-btn inbox-action" data-action="open-task" data-id="${item.id}">Open Task</button>`:"";
  if(item.type==="ambiguous-customer") return relatedTask?`${openTask}<button class="primary-btn inbox-action" data-action="open-review" data-id="${item.id}">Resolve & Resume</button>`:`<button class="secondary-btn inbox-action" data-action="start-ambiguous" data-id="${item.id}">Start review</button>`;
  if(item.type==="duplicate-payment") return `${openTask}<button class="primary-btn inbox-action" data-action="suppress-duplicate" data-id="${item.id}">Suppress duplicate</button><button class="secondary-btn inbox-action" data-action="escalate" data-id="${item.id}">Escalate</button>`;
  if(item.type==="unmatched-payment") return `${openTask}<select class="inbox-map-select" data-role="map-invoice" data-id="${item.id}" aria-label="Map payment to invoice"><option value="">Choose invoice…</option>${invoiceOptions}</select><button class="primary-btn inbox-action" data-action="map-payment" data-id="${item.id}">Map locally</button><button class="secondary-btn inbox-action" data-action="dismiss-payment" data-id="${item.id}">Dismiss</button><button class="secondary-btn inbox-action" data-action="escalate" data-id="${item.id}">Escalate</button>`;
  if(item.type==="invoice-dispute") return `${openTask}<button class="secondary-btn inbox-action" data-action="acknowledge-dispute" data-id="${item.id}">Acknowledge</button><button class="primary-btn inbox-action" data-action="manager-review" data-id="${item.id}">Manager review</button><button class="secondary-btn inbox-action" data-action="escalate" data-id="${item.id}">Escalate</button>`;
  if(item.type==="credit-limit") return `${openTask}<button class="primary-btn inbox-action" data-action="request-approval" data-id="${item.id}">Request approval</button><button class="secondary-btn inbox-action" data-action="escalate" data-id="${item.id}">Escalate</button>`;
  if(item.type==="approval-required") return openTask||'<span class="status-chip approval">Approval pending</span>';
  return `${openTask}<button class="secondary-btn inbox-action" data-action="investigate" data-id="${item.id}">Investigate</button><button class="secondary-btn inbox-action" data-action="escalate" data-id="${item.id}">Escalate</button>`;
}
async function renderInbox(){
  const visible=inbox.filter(item=>item.status!=="resolved");
  inboxBadge.textContent=String(visible.length);inboxBadge.classList.toggle("attention",visible.length>0);
  if(!visible.length){inboxList.innerHTML='<li class="approval-empty">No items need attention.</li>';return;}
  const customers=await business.listCustomers();
  const invoiceRows=[] as {id:string;label:string}[];
  for(const customer of customers){for(const invoice of (await business.listInvoicesByCustomer(customer.id)).filter(invoice=>invoice.status!=="paid"))invoiceRows.push({id:invoice.id,label:`${customer.name} · ${invoice.number}`});}
  const invoiceOptions=invoiceRows.map(row=>`<option value="${esc(row.id)}">${esc(row.label)}</option>`).join("");
  const entityLabel=async(item:BusinessInboxItem)=>{
    if(item.relatedEntityType==="customer")return (await business.getCustomer(item.relatedEntityId))?.name??item.relatedEntityId;
    if(item.relatedEntityType==="invoice")return (await business.getInvoice(item.relatedEntityId))?.number??item.relatedEntityId;
    if(item.relatedEntityType==="payment")return (await business.getPayment(item.relatedEntityId))?.reference??item.relatedEntityId;
    if(item.relatedEntityType==="approval")return approvals.find(value=>value.id===item.relatedEntityId)?.title??item.relatedEntityId;
    return item.relatedEntityId;
  };
  const rows=await Promise.all(visible.slice(0,8).map(async item=>{
    const relatedTask=tasks.find(task=>(item.relatedTaskIds??[]).includes(task.id));
    const related=relatedTask?`${relatedTask.title} · ${taskOutcomeLabel(relatedTask)}`:"No related task yet";
    return `<li class="inbox-item-card"><div class="inbox-copy"><strong>${esc(item.title)}</strong><small>${esc(item.detail)}</small><div class="inbox-meta"><span>Severity: ${esc(item.severity)}</span><span>Related: ${esc(await entityLabel(item))}</span><span>Task: ${esc(related)}</span><span>Created: ${new Date(item.createdAt).toLocaleString()}</span><span>Local Demo Simulation · No external system changed</span></div></div><div class="inbox-actions">${inboxActions(item,relatedTask,invoiceOptions)}</div></li>`;
  }));
  inboxList.innerHTML=rows.join("");
}
function renderApprovals(){const pending=approvals.filter(a=>a.state==="pending");approvalBadge.textContent=String(pending.length);approvalBadge.classList.toggle("attention",pending.length>0);approvalList.innerHTML=approvals.length?approvals.slice(0,5).map(a=>`<article class="approval-scenario"><div><span class="status-chip ${a.state==="pending"?"approval":a.state==="approved"?"completed":"blocked"}">Local Demo Simulation · ${a.state}</span></div><h3>${esc(a.title)}</h3><ul class="approval-facts"><li><b>What:</b> ${esc(a.what)}</li><li><b>Why:</b> ${esc(a.why)}</li><li><b>Affected:</b> ${esc(a.affected)}</li><li><b>Impact:</b> ${esc(a.impact)}</li></ul><div class="approval-simulation-note">No external system changed.</div>${a.state==="pending"?`<div class="approval-actions"><button class="primary-btn approval-action" data-action="approve" data-id="${a.id}">Approve & Resume</button><button class="secondary-btn approval-action" data-action="reject" data-id="${a.id}">Reject</button></div>`:""}</article>`).join(""):'<p><strong>No approvals pending.</strong></p><p>Use the Approval scenario to test pause → decision → resume locally.</p>';}
function renderBrief(){
  const completed=tasks.filter(task=>task.status==="completed").length;
  const attention=countActionableIssues(inbox,approvals);
  if(!tasks.length){briefTitle.textContent="Ready for work";briefCopy.textContent=`${DEMO_COMPANY_NAME} is seeded locally. Business exceptions exist, but Alex has completed 0 employee tasks.`;briefList.innerHTML="";briefNote.textContent="Available";return;}
  briefTitle.textContent=attention?`${attention} item${attention===1?"":"s"} need attention`:"Operations are on track";
  briefCopy.textContent="Task history and business data are projected from Local IndexedDB.";
  briefList.innerHTML=`<li>${svgIcon("check")}<b>${completed}</b> completed tasks</li><li>${svgIcon(attention?"alert":"check")}<b>${attention}</b> unique actionable issues</li>`;
  briefNote.textContent=attention?"Manager review needed":"On track";
}
async function renderHistory(){
  if(!tasks.length){historyList.innerHTML='<p class="approval-empty">No task history yet.</p>';return;}
  historyList.innerHTML=tasks.map(task=>`<article class="history-item" data-task-id="${task.id}"><div><h3>${esc(task.title)}</h3><p>${esc(task.intent)} · updated ${new Date(task.updatedAt).toLocaleString()}</p></div><span class="status-chip ${taskOutcomeClass(task)}">${esc(taskOutcomeLabel(task))}</span><button class="link-btn history-inspect" data-task-id="${task.id}" type="button">Inspect timeline</button><div class="timeline" id="timeline-${task.id}" hidden></div></article>`).join("");
}
async function renderCustomers(filter=""){const customers=(await business.listCustomers()).filter(c=>!filter||`${c.name} ${c.code} ${c.aliases.join(" ")}`.toLowerCase().includes(filter.toLowerCase()));customerList.innerHTML=customers.map(c=>`<button class="entity-row customer-row" data-id="${c.id}" type="button"><strong>${esc(c.name)}</strong><small>${esc(c.code)} · Risk ${c.risk}</small></button>`).join("");if(!customers.length)customerDetail.innerHTML='<p class="approval-empty">No customers match the search.</p>';}
async function showCustomer(id:string){
  const customer=await business.getCustomer(id);if(!customer)return;
  const [review,related]=await Promise.all([reviewCustomer(business,customer),work.listTaskHistory()]);
  const reviewTask=`Review ${customer.name} receivables.`;
  const followTask=`Prepare ${customer.name} follow-up.`;
  customerDetail.innerHTML=`<h3>${esc(customer.name)}</h3><p>${esc(customer.code)} · ${esc(customer.status)} · Risk ${esc(customer.risk)}</p>
    <div class="customer-actions"><button class="secondary-btn customer-compose-action" data-task="${esc(reviewTask)}" type="button">Review receivables</button><button class="secondary-btn customer-compose-action" data-task="${esc(followTask)}" type="button">Prepare follow-up</button><button class="secondary-btn customer-compose-action" data-task="Review today's exceptions." type="button">View exceptions</button><button class="secondary-btn customer-related-action" data-customer-id="${customer.id}" type="button">View related tasks</button></div>
    <div class="entity-summary"><div><span>Outstanding</span><strong>${money(review.outstandingTotal)}</strong></div><div><span>Open invoices</span><strong>${review.open.length}</strong></div><div><span>Credit limit</span><strong>${money(customer.creditLimit)}</strong></div></div>
    <h4>Invoices</h4><table class="mini-table"><thead><tr><th>Invoice</th><th>Due</th><th>Outstanding</th><th>Status</th></tr></thead><tbody>${review.rows.map(row=>`<tr><td>${esc(row.invoice.number)}</td><td>${esc(row.invoice.dueOn)}</td><td>${money(row.outstanding)}</td><td>${esc(row.invoice.status)}</td></tr>`).join("")}</tbody></table>
    <h4>Payments</h4><table class="mini-table"><tbody>${review.payments.map(payment=>`<tr><td>${esc(payment.reference)}</td><td>${money(payment.amount)}</td><td>${esc(payment.status)}</td></tr>`).join("")||'<tr><td>No payments</td></tr>'}</tbody></table>
    <h4>Related tasks</h4><div class="related-task-list">${related.filter(task=>task.customerId===customer.id).map(task=>`<button class="link-btn inspect-task" data-task-id="${task.id}" type="button">${esc(task.title)} · ${esc(taskOutcomeLabel(task))}</button>`).join("")||"No related tasks yet."}</div>`;
  document.querySelectorAll(".customer-row").forEach(element=>element.classList.toggle("active",(element as HTMLElement).dataset.id===id));
}
async function renderAll(){await refreshData();renderWork();renderApprovals();renderBrief();await Promise.all([renderKpis(),renderHistory(),renderCustomers(customerSearch.value),renderInbox()]);}
function safeMarkdown(value:string){const escaped=esc(value);return escaped.replace(/^###?\s+(.+)$/gm,"<h3>$1</h3>").replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/^[-*]\s+(.+)$/gm,"<div>• $1</div>").replace(/\n/g,"<br>");}
function renderSummary(summary:Record<string,unknown>){
  const customer=summary.customer as any;
  if(customer&&typeof customer==="object"){
    const out=Number(summary.outstandingTotal??0);
    return`<div class="result-grid"><div class="result-cell"><span>Customer</span><strong>${esc(customer.name??customer.id)}</strong></div><div class="result-cell"><span>Outstanding</span><strong>${money(out)}</strong></div><div class="result-cell"><span>Open invoices</span><strong>${esc(summary.outstandingInvoices??0)}</strong></div><div class="result-cell"><span>Follow-ups</span><strong>${Array.isArray(summary.followUps)?summary.followUps.length:0}</strong></div></div>`;
  }
  if(summary.resultType==="investigation-completed"){
    const count=Number(summary.count??0);
    const items=((summary.paymentExceptions??summary.exceptions) as any[]??[]);
    return`<div class="result-notice attention"><strong>Investigation completed</strong><p>${count} exception${count===1?"":"s"} found. ${count?"Action required before the underlying business issues are resolved.":"No follow-up action is required."}</p></div>${items.map(item=>`<div class="attention-box"><strong>${esc(item.title)}</strong><br>${esc(item.detail)}</div>`).join("")}`;
  }
  if("totalOverdueCustomers" in summary)return`<div class="result-grid"><div class="result-cell"><span>Overdue customers</span><strong>${esc(summary.totalOverdueCustomers)}</strong></div><div class="result-cell"><span>Total overdue</span><strong>${money(Number(summary.totalOverdueAmount??0))}</strong></div><div class="result-cell"><span>Exceptions</span><strong>${esc(summary.exceptionsRequiringReview)}</strong></div></div><h4>Highest priority accounts</h4><div>${(summary.highestPriority as any[]??[]).map(account=>`<p><strong>${esc(account.customer)}</strong> · ${money(account.overdueAmount)} · ${account.maxDaysOverdue} days</p>`).join("")}</div><h4>Upcoming due accounts</h4><div>${(summary.upcomingDueAccounts as any[]??[]).map(account=>`<p><strong>${esc(account.customer)}</strong> · ${money(account.amount)} · ${account.invoices} invoice${account.invoices===1?"":"s"}</p>`).join("")||"<p>None in the next 14 days.</p>"}</div>`;
  if("snapshot" in summary){const snap=summary.snapshot as any;return`<div class="result-grid"><div class="result-cell"><span>Open receivables</span><strong>${money(snap.openReceivables)}</strong></div><div class="result-cell"><span>Overdue invoices</span><strong>${snap.overdueInvoices}</strong></div><div class="result-cell"><span>Exceptions</span><strong>${esc(summary.exceptions)}</strong></div><div class="result-cell"><span>Pending approvals</span><strong>${esc(summary.pendingApprovals)}</strong></div></div>`;}
  return`<div class="result-notice"><strong>Result recorded</strong><p>Business details are available in the structured result and Execution Evidence.</p></div>`;
}
async function renderTaskDetail(taskId:string){
  const task=await work.getTask(taskId);if(!task)return;
  const [events,evidence,allInbox]=await Promise.all([work.listTaskEvents(taskId),work.listEvidence(taskId),work.listInbox()]);
  setDetail(task);businessMeta.textContent=`${task.intent} · ${task.customerQuery??DEMO_COMPANY_NAME}`;
  let resultHtml="";
  if(task.status==="needs-review"&&task.review?.candidateCustomerIds.length){
    const candidates=await Promise.all(task.review.candidateCustomerIds.map(async customerId=>{const customer=await business.getCustomer(customerId);if(!customer)return null;const review=await reviewCustomer(business,customer);return{customer,review};}));
    resultHtml=`<div class="result-notice attention"><strong>Clarification Required</strong><p>Multiple customer records match <b>${esc(task.review.query)}</b>. Select the canonical customer to resume this same task.</p></div><div class="candidate-grid">${candidates.filter(Boolean).map(candidate=>{const value=candidate!;return`<article class="candidate-card"><h3>${esc(value.customer.name)}</h3><div class="candidate-meta"><span>Code <b>${esc(value.customer.code)}</b></span><span>Risk <b>${esc(value.customer.risk)}</b></span><span>Outstanding <b>${money(value.review.outstandingTotal)}</b></span></div><button class="primary-btn review-candidate" data-task-id="${task.id}" data-customer-id="${value.customer.id}" type="button">Select & Resume</button></article>`;}).join("")}</div>`;
  }else if(task.status==="needs-review"){
    resultHtml=`<div class="result-notice attention"><strong>Clarification Required</strong><p>No canonical customer matched <b>${esc(task.customerQuery??"the request")}</b>. Update the task with a valid customer name or code.</p></div>`;
  }else if(task.status==="needs-approval"){
    resultHtml=`<div class="result-notice attention"><strong>Manager Approval Required</strong><p>Alex paused before continuing. Review the Approval card. Local Demo Simulation · No external system changed.</p></div>`;
  }else if(task.status==="blocked"&&task.intent==="unsupported"){
    resultHtml=`<div class="result-notice blocked"><strong>Unsupported Capability</strong><p>${esc(String(task.summary?.reason??"This work is outside the supported local demo capabilities."))}</p><p>No business execution or external action occurred.</p></div>`;
  }else if(task.status==="blocked"){
    resultHtml=`<div class="result-notice blocked"><strong>Manager Rejected</strong><p>${esc(String(task.summary?.reason??"Work stopped before execution."))}</p><p>Local Demo Simulation · No external system changed.</p></div>`;
  }else if(task.status==="failed"){
    resultHtml=`<div class="result-notice failed"><strong>Execution Failed</strong><p>${esc(String(task.summary?.message??"The workflow stopped before verified completion."))}</p></div>`;
  }else if(task.verification?.status==="NEEDS_REVIEW"){
    resultHtml=`<div class="result-notice attention"><strong>Verification Failed</strong><p>The business result did not pass every deterministic completion check.</p></div>`;
  }else resultHtml=renderSummary(task.summary??{});
  const relatedIssues=allInbox.filter(item=>(item.relatedTaskIds??[]).includes(task.id));
  if(relatedIssues.length)resultHtml+=`<div class="related-issues"><h4>Related Inbox issues</h4>${relatedIssues.map(item=>`<div class="related-issue"><strong>${esc(item.title)}</strong><span>${esc(item.severity)} · ${esc(item.status)}</span></div>`).join("")}</div>`;
  businessResult.innerHTML=resultHtml;
  verificationCount.textContent=task.verification?`${task.verification.passed} / ${task.verification.total} checks passed`:"0 / 0";
  const verificationEvidence=evidence.find(item=>item.type==="verification")?.data as any;
  verificationList.innerHTML=verificationEvidence?.checks?.length?verificationEvidence.checks.map((check:any)=>`<li data-pass="${!!check.passed}"><span class="check-icon">${svgIcon(check.passed?"check":"x")}</span><div><strong>${esc(check.id)}</strong>${check.message?`<div>${esc(check.message)}</div>`:""}</div></li>`).join(""):`<li><span class="check-icon">${svgIcon("circle")}</span><div>No completed verification evidence.</div></li>`;
  latestEvidence=JSON.stringify(evidence,null,2);rawEvidence.textContent=latestEvidence;
  const manager=evidence.find(item=>item.type==="manager.summary")?.data as any;
  aiSummary.innerHTML=manager?.html??(task.status==="completed"?"<p>Verified task complete. Manager summary not available.</p>":"<p>Summary is generated only after verified completion.</p>");
  gatewayStatus.textContent=manager?.gatewayStatus??"Gateway not called for this task.";
  currentActivity.innerHTML=projectTaskActivity(events).map(event=>`<li><span class="activity-icon ${event.type==="COMPLETED"?"done":event.type==="FAILED"?"idle":"active"}">${svgIcon(event.type==="COMPLETED"?"check":event.type==="FAILED"?"x":"circle-dot")}</span><div class="activity-copy"><strong>${esc(event.message)}</strong><small>${esc(event.type)} · ${new Date(event.occurredAt).toLocaleTimeString()}</small></div></li>`).join("")||`<li><span class="activity-icon idle">${svgIcon("circle")}</span><div>No task events.</div></li>`;
  setEmployeeMode(task.status==="needs-approval"||task.status==="needs-review"?"Waiting on manager":task.status==="running"?"Working":"Available");
}
async function inspectHistory(taskId:string){const box=$<HTMLElement>(`#timeline-${CSS.escape(taskId)}`);const [events,evidence]=await Promise.all([work.listTaskEvents(taskId),work.listEvidence(taskId)]);box.hidden=!box.hidden;if(box.hidden)return;box.innerHTML=events.map(e=>`<div class="timeline-row"><b>${esc(e.type)}</b><span>${esc(e.message)}</span><span>${new Date(e.occurredAt).toLocaleTimeString()}</span></div>`).join("")+`<div class="timeline-row"><b>Evidence</b><span>${evidence.length} records stored separately</span><span></span></div>`;}
async function createManagerSummary(result:BusinessWorldResult){if(result.task.status!=="completed"||result.verification.status!=="PASS")return;aiSummary.textContent="Verification passed · Preparing manager summary…";gatewayStatus.textContent="Preparing manager summary from verified facts only…";try{const response=await gateway.chat({messages:[{role:"system",content:"You are Alex, an operations employee. Summarize only the supplied verified facts for a manager. Do not invent business facts or completion claims."},{role:"user",content:JSON.stringify({intent:result.task.intent,summary:result.summary,verification:result.verification})}]});const choices=(response as any)?.choices;const text=Array.isArray(choices)&&typeof choices[0]?.message?.content==="string"?choices[0].message.content:"Verified work completed.";const html=safeMarkdown(text);aiSummary.innerHTML=html;gatewayStatus.textContent="Demo Gateway connected · demo-auto · verified facts only";gatewayConnection.textContent="Connected";await work.saveEvidence({id:`evidence-${result.task.id}-manager`,taskId:result.task.id,type:"manager.summary",source:"demo-gateway",createdAt:new Date().toISOString(),data:{html,gatewayStatus:gatewayStatus.textContent}});}catch(error){gatewayConnection.textContent="Unavailable";gatewayStatus.textContent=error instanceof DemoGatewayRateLimitError?error.message:error instanceof DemoGatewayError&&error.status===403?`Gateway Origin is not enabled for ${window.location.origin}. Verified business work still completed locally.`:`AI summary unavailable: ${error instanceof Error?error.message:String(error)}`;aiSummary.textContent="Verified business result is available; manager summary is temporarily unavailable.";}}
async function resolveCustomerChoice(taskId:string,customerId:string){
  if(running)return;
  running=true;assignButton.disabled=true;suggestionButtons.forEach(button=>button.disabled=true);setEmployeeMode("Working");
  try{
    const result=await resolveAmbiguousCustomerReview(business,work,taskId,customerId);
    await renderAll();await renderTaskDetail(result.task.id);await createManagerSummary(result);await renderTaskDetail(result.task.id);
  }finally{running=false;assignButton.disabled=false;suggestionButtons.forEach(button=>button.disabled=false);}
}
async function executeRouted(title:string,intent:any,customerQuery?:string,taskId?:string){
  running=true;assignButton.disabled=true;suggestionButtons.forEach(button=>button.disabled=true);setEmployeeMode("Working");
  currentActivity.innerHTML=`<li><span class="activity-icon active">${svgIcon("circle-dot")}</span><div class="activity-copy"><strong>Working on assigned task</strong><small>${esc(intent)}</small></div></li>`;
  try{
    const result=await runBusinessWorldTask(business,work,{taskId,title,intent,customerQuery});
    await renderAll();await renderTaskDetail(result.task.id);await createManagerSummary(result);await renderTaskDetail(result.task.id);
  }finally{running=false;assignButton.disabled=false;suggestionButtons.forEach(button=>button.disabled=false);}
}
async function createBlocked(title:string,reason:string){
  const now=new Date().toISOString();
  const task:BusinessTask={id:`task-${Date.now()}`,title,intent:"unsupported",status:"blocked",createdAt:now,updatedAt:now,summary:{resultType:"unsupported-capability",reason}};
  await work.createTask(task);await work.appendTaskEvent({id:`event-${task.id}-created`,taskId:task.id,type:"CREATED",occurredAt:now,message:"Task received"});
  await work.appendTaskEvent({id:`event-${task.id}-routed`,taskId:task.id,type:"ROUTED",occurredAt:new Date(Date.now()+1).toISOString(),message:"Unsupported capability"});
  await work.saveEvidence({id:`evidence-${task.id}-blocked`,taskId:task.id,type:"routing.blocked",source:"task-router",createdAt:now,data:{reason}});
  composerFeedback.textContent=reason;await renderAll();await renderTaskDetail(task.id);
}
async function createApprovalScenario(title:string,customerQuery:string){const created=await createLocalDemoApproval(work,{title,customerQuery,snapshotLabel:`Snapshot ${dateLabel()}`});await renderAll();await renderTaskDetail(created.task.id);}
async function decideApproval(id:string,decision:"approve"|"reject"){if(decision==="reject"){const rejected=await rejectLocalDemo(work,id);if(rejected){await renderAll();await renderTaskDetail(rejected.task.id);}return;}const approved=await approveLocalDemo(work,id);if(!approved)return;await renderAll();await executeRouted(approved.task.title,"followup.prepare",approved.task.customerQuery,approved.task.id);}
async function actOnInbox(id:string,action:string){
  const item=inbox.find(value=>value.id===id);if(!item)return;
  const relatedTask=tasks.find(task=>(item.relatedTaskIds??[]).includes(task.id));
  if(action==="open-task"||action==="open-review"){
    if(relatedTask){await renderTaskDetail(relatedTask.id);document.querySelector("#task-detail")?.scrollIntoView({behavior:"smooth",block:"start"});}
    return;
  }
  if(action==="start-ambiguous"){
    taskInput.value="Resolve ambiguous customer.";composerFeedback.textContent="Scenario added. Review it, then press Assign.";taskInput.focus();return;
  }
  if(action==="suppress-duplicate")await suppressDuplicatePaymentLocally(business,work,id);
  else if(action==="map-payment"){
    const select=document.querySelector<HTMLSelectElement>(`[data-role="map-invoice"][data-id="${CSS.escape(id)}"]`);
    if(!select?.value){composerFeedback.textContent="Choose an invoice before mapping the unmatched payment.";return;}
    await mapUnmatchedPaymentLocally(business,work,id,select.value);
  }
  else if(action==="dismiss-payment")await dismissUnmatchedPaymentLocally(work,id);
  else if(action==="acknowledge-dispute")await acknowledgeInvoiceDispute(work,id);
  else if(action==="manager-review"||action==="request-approval"){
    const created=await requestManagerApprovalForIssue(business,work,id,`Snapshot ${dateLabel()}`);
    await renderAll();await renderTaskDetail(created.taskId);return;
  }
  else if(action==="escalate")await escalateInboxIssue(work,id);
  else if(action==="investigate")await work.updateInboxStatus(id,"investigating","Investigation opened in Local Demo Simulation.");
  await renderAll();
  if(relatedTask)await renderTaskDetail(relatedTask.id);
}
async function assign(){if(running)return;const title=taskInput.value.trim();if(!title){composerFeedback.textContent="Enter a task or choose a scenario first.";return;}composerFeedback.textContent="";const routed=routeDashboardTask(title);if(routed.intent==="unsupported"){await createBlocked(title,routed.reason??"Unsupported capability");return;}if(routed.intent==="approval-demo"){await createApprovalScenario(title,routed.customerQuery??"ACME");return;}await executeRouted(title,routed.intent,routed.customerQuery);}
function openDrawer(){trustDrawer.classList.add("open");drawerOverlay.classList.add("open");closeTrustDrawerButton.focus();}
function closeDrawer(){trustDrawer.classList.remove("open");drawerOverlay.classList.remove("open");openTrustDrawerButton.focus();}
async function refreshAfterReset(message:string){await renderAll();resetWorkspace(true,false);composerFeedback.textContent=message;}

function bindEvents(){
  form.addEventListener("submit",event=>{event.preventDefault();void assign();});
  document.querySelectorAll<HTMLButtonElement>(".mobile-section-toggle").forEach(button=>button.addEventListener("click",()=>{const section=document.getElementById(button.dataset.target??"");if(!section)return;const open=section.classList.toggle("mobile-open");button.textContent=open?"Close":"Open";}));
  suggestionButtons.forEach(button=>button.addEventListener("click",()=>{taskInput.value=button.dataset.task??"";composerFeedback.textContent="Scenario added. Review it, then press Assign.";taskInput.focus();}));
  document.addEventListener("click",event=>{
    const element=event.target as HTMLElement;
    const inspect=element.closest<HTMLButtonElement>(".inspect-task");if(inspect?.dataset.taskId)void renderTaskDetail(inspect.dataset.taskId);
    const history=element.closest<HTMLButtonElement>(".history-inspect");if(history?.dataset.taskId)void inspectHistory(history.dataset.taskId);
    const customer=element.closest<HTMLButtonElement>(".customer-row");if(customer?.dataset.id)void showCustomer(customer.dataset.id);
    const compose=element.closest<HTMLButtonElement>(".customer-compose-action");if(compose?.dataset.task){taskInput.value=compose.dataset.task;composerFeedback.textContent="Customer action added. Review it, then press Assign.";taskInput.focus();}
    const related=element.closest<HTMLButtonElement>(".customer-related-action");if(related?.dataset.customerId){document.querySelector("#history-view")?.scrollIntoView({behavior:"smooth"});}
    const candidate=element.closest<HTMLButtonElement>(".review-candidate");if(candidate?.dataset.taskId&&candidate.dataset.customerId)void resolveCustomerChoice(candidate.dataset.taskId,candidate.dataset.customerId);
    const inboxButton=element.closest<HTMLButtonElement>(".inbox-action");if(inboxButton?.dataset.id&&inboxButton.dataset.action)void actOnInbox(inboxButton.dataset.id,inboxButton.dataset.action);
    const approvalButton=element.closest<HTMLButtonElement>(".approval-action");if(approvalButton?.dataset.id&&approvalButton.dataset.action)void decideApproval(approvalButton.dataset.id,approvalButton.dataset.action as any);
  });
  customerSearch.addEventListener("input",()=>void renderCustomers(customerSearch.value));
  $("#new-task").addEventListener("click",()=>resetWorkspace(true));
  $("#open-inbox").addEventListener("click",()=>$("#inbox").scrollIntoView({behavior:"smooth"}));
  $("#clear-history").addEventListener("click",()=>void clearTaskHistory().then(()=>refreshAfterReset("Task history cleared. Sample business data preserved.")));
  $("#restore-business-data").addEventListener("click",()=>void restoreSampleBusinessData().then(()=>refreshAfterReset("Sample business data restored. Task history preserved.")));
  $("#reset-entire-demo").addEventListener("click",()=>{if(confirm("Reset all local demo business data, task history, inbox decisions and approvals?"))void resetEntireDemo().then(()=>refreshAfterReset("Entire demo reset to deterministic seed."));});
  $("#copy-evidence").addEventListener("click",()=>void navigator.clipboard.writeText(latestEvidence));
  $("#view-evidence").addEventListener("click",()=>{evidenceDetails.open=true;if(matchMedia("(max-width:760px)").matches)openDrawer();});
  openTrustDrawerButton.addEventListener("click",openDrawer);closeTrustDrawerButton.addEventListener("click",closeDrawer);drawerOverlay.addEventListener("click",closeDrawer);
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&trustDrawer.classList.contains("open"))closeDrawer();});
}

export async function bootstrapDashboard(){
  datasetSnapshot.textContent=`Demo Business Data · ${DEMO_COMPANY_NAME} · Snapshot ${dateLabel()} · Local IndexedDB`;
  businessDataDetail.textContent=`${DEMO_COMPANY_NAME} · demo-business-v1 · Snapshot ${dateLabel()}`;
  await initializeBusinessWorld();bindEvents();await renderAll();
  if(tasks[0])await renderTaskDetail(tasks[0].id);else resetWorkspace(false,false);
}
