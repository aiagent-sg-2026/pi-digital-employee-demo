import { DEMO_COMPANY_NAME, DEMO_SNAPSHOT_DATE } from "../demo/seed";
import { IndexedDbBusinessRepository } from "../data/business-repository";
import { IndexedDbWorkRepository } from "../data/work-repository";
import { clearTaskHistory, initializeBusinessWorld, resetEntireDemo, restoreSampleBusinessData } from "../data/indexeddb";
import type { BusinessApproval, BusinessInboxItem, BusinessTask } from "../data/models";
import { approveLocalDemo, createLocalDemoApproval, rejectLocalDemo } from "../core/demo-approval";
import { resolveAmbiguousCustomerReview, reviewCustomer, runBusinessWorldTask, type BusinessWorldResult } from "../core/business-world-workflow";
import { acknowledgeInvoiceDispute, dismissUnmatchedPaymentLocally, escalateInboxIssue, mapUnmatchedPaymentLocally, requestManagerApprovalForIssue, suppressDuplicatePaymentLocally } from "../core/inbox-resolution";
import { countActionableIssues, projectTaskActivity, taskOutcomeClass, taskOutcomeKey } from "./dashboard-projection";
import { createDemoGatewayClient, DemoGatewayError, DemoGatewayRateLimitError } from "../shared/demo-gateway-client";
import { routeDashboardTask } from "./task-router";
import { svgIcon } from "./icons";
import { applyDomTranslations, formatDate, formatDateTime, formatMoney, formatTime, getLocale, localeLanguageName, onLocaleChange, setLocale, t, type SupportedLocale } from "../i18n";
import { createHashRouter, navigate, navParent, parseHash, routeHref, type AppRoute } from "./router";

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
const workStatusFilter=$<HTMLSelectElement>("#work-status-filter"), workCustomerFilter=$<HTMLSelectElement>("#work-customer-filter"), inboxStatusFilter=$<HTMLSelectElement>("#inbox-status-filter"), inboxSeverityFilter=$<HTMLSelectElement>("#inbox-severity-filter"), inboxTypeFilter=$<HTMLSelectElement>("#inbox-type-filter");
const taskTabs=$<HTMLElement>("#task-tabs"), taskTimelinePanel=$<HTMLElement>("#task-timeline-panel"), taskVerificationPanel=$<HTMLElement>("#task-verification-panel"), taskEvidencePanel=$<HTMLElement>("#task-evidence-panel"), taskIssuesPanel=$<HTMLElement>("#task-issues-panel"), taskApprovalPanel=$<HTMLElement>("#task-approval-panel");
const approvalDetail=$<HTMLElement>("#approval-detail"), capabilitiesGrid=$<HTMLElement>("#capabilities-grid"), connectionsPageBody=$<HTMLElement>("#connections-page-body");
const settingsAppVersion=$<HTMLElement>("#settings-app-version"), languageSelect=$<HTMLSelectElement>("#language-select"), taskTrustSummary=$<HTMLElement>("#task-trust-summary");

const business=new IndexedDbBusinessRepository(); const work=new IndexedDbWorkRepository(); const gateway=createDemoGatewayClient({origin:window.location.origin});
let running=false; let latestEvidence=""; let tasks:BusinessTask[]=[]; let inbox:BusinessInboxItem[]=[]; let approvals:BusinessApproval[]=[]; let currentRoute:AppRoute=parseHash("#/home"); let pendingSuggestion:{canonical:string;display:string}|null=null;
const esc=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]!));
const TASK_SUGGESTION_KEYS:Record<string,string>={
  "Review ACME overdue invoices and prepare follow-up actions.":"scenario.quickOverdue",
  "Prepare ACME customer follow-up based on verified receivables.":"scenario.quickFollowup",
  "Review today's exceptions.":"scenario.exceptions",
  "Demo approval flow for ACME follow-up preparation.":"scenario.approvalAcme",
  "Review ACME receivables.":"scenario.reviewAcme",
  "Check Beacon receivables.":"scenario.reviewBeacon",
  "Show overdue customers.":"scenario.portfolio",
  "Investigate unmatched payments.":"scenario.unmatched",
  "Resolve ambiguous customer.":"scenario.ambiguous",
  "Demo approval flow for ACME follow-up.":"scenario.approvalAcme",
  "Bright Star high-value follow-up requires approval.":"scenario.approvalBright",
  "Riverside dispute follow-up requires approval.":"scenario.approvalRiverside",
};
function localizedTaskSuggestion(canonical:string){
  const key=TASK_SUGGESTION_KEYS[canonical];if(key)return t(key);
  let match=canonical.match(/^Review (.+) receivables\.$/);if(match)return t("scenario.reviewCustomer",{customer:match[1]!});
  match=canonical.match(/^Prepare (.+) follow-up\.$/);if(match)return t("scenario.followCustomer",{customer:match[1]!});
  return canonical;
}
function setSuggestedTask(canonical:string,feedbackKey:string){const display=localizedTaskSuggestion(canonical);taskInput.value=display;pendingSuggestion={canonical,display};composerFeedback.textContent=t(feedbackKey);taskInput.focus();}
const money=(n:number)=>formatMoney(n,"SGD");
const dateLabel=()=>formatDate(DEMO_SNAPSHOT_DATE);
const outcomeLabel=(task:BusinessTask)=>t(taskOutcomeKey(task));
const workCountLabel=(count:number)=>t(count===1?"work.taskCountOne":"work.taskCountMany",{count});
const historyCountLabel=(count:number)=>t(count===1?"history.taskCountOne":"history.taskCountMany",{count});
const riskLabel=(risk:string)=>t(`common.risk.${risk}`);
const invoiceStatusLabel=(status:string)=>t(`common.invoice.${status}`);
const paymentStatusLabel=(status:string)=>t(`common.payment.${status}`);
const inboxStatusLabel=(status:string)=>t(`common.status.${status}`);
const severityLabel=(severity:string)=>t(`common.severity.${severity}`);
const inboxTypeLabel=(type:string)=>t(`inbox.type.${type}`);
const verificationLabel=(id:string)=>{const key=`verification.check.${id}`;const value=t(key);return value===key?id:value;};
const activityLabel=(type:string,message:string)=>{const key=`task.event.${type}`;const value=t(key);return value===key?message:value;};
function setEmployeeMode(mode:string){const key=mode==="Working"?"common.working":mode==="Waiting on manager"?"common.waitingManager":"common.available";employeeMode.textContent=t(key);lastUpdated.textContent=formatTime(new Date());}
function setDetail(task?:BusinessTask){if(!task){detailState.textContent=t("outcome.ready");detailState.className="status-chip running";return;}detailState.textContent=outcomeLabel(task);detailState.className=`status-chip ${taskOutcomeClass(task)}`;}
function resetWorkspace(clearComposer=true,focus=clearComposer){if(clearComposer){taskInput.value="";pendingSuggestion=null;}composerFeedback.textContent="";setDetail();businessMeta.textContent=t("task.noVerified");businessResult.innerHTML=`<p class="approval-empty">${esc(t("task.assignForResult"))}</p>`;verificationCount.textContent="0 / 0";verificationList.innerHTML=`<li><span class="check-icon">${svgIcon("circle")}</span><div>${esc(t("verification.waiting"))}</div></li>`;rawEvidence.textContent="";latestEvidence="";evidenceDetails.open=false;taskTrustSummary.hidden=true;taskTrustSummary.innerHTML="";aiSummary.textContent=t("task.summaryAfterVerify");gatewayStatus.textContent=t("task.gatewayNotCalled");currentActivity.innerHTML=`<li><span class="activity-icon idle">${svgIcon("circle")}</span><div class="activity-copy"><strong>${esc(t("rail.waitingWork"))}</strong><small>${esc(t("rail.assignTask"))}</small></div></li>`;setEmployeeMode("Available");if(focus)taskInput.focus();}
async function refreshData(){[tasks,inbox,approvals]=await Promise.all([work.listTaskHistory(),work.listInbox(),work.listApprovals()]);}

function workRouteTasks(){
  let values=[...tasks];
  if(currentRoute.name==="work"){
    const status=currentRoute.query.get("status")??workStatusFilter.value;
    const customerId=currentRoute.query.get("customerId")??workCustomerFilter.value;
    if(status)values=values.filter(task=>task.status===status);
    if(customerId)values=values.filter(task=>task.customerId===customerId);
  }
  const terminal=new Set<BusinessTask["status"]>(["completed","failed","blocked"]);
  values=values.map((task,index)=>({task,index})).sort((a,b)=>Number(terminal.has(a.task.status))-Number(terminal.has(b.task.status))||a.index-b.index).map(value=>value.task);
  return currentRoute.name==="home"?values.slice(0,4):values;
}

async function renderWorkCustomerFilter(){
  const customers=await business.listCustomers();
  const selected=currentRoute.name==="work"?(currentRoute.query.get("customerId")??workCustomerFilter.value):"";
  workCustomerFilter.innerHTML=`<option value="">${esc(t("work.allCustomers"))}</option>`+customers.map(customer=>`<option value="${esc(customer.id)}">${esc(customer.name)}</option>`).join("");
  workCustomerFilter.value=selected;
}

async function issueCustomerId(item:BusinessInboxItem):Promise<string|undefined>{
  if(item.relatedEntityType==="customer")return item.relatedEntityId;
  if(item.relatedEntityType==="invoice")return (await business.getInvoice(item.relatedEntityId))?.customerId;
  if(item.relatedEntityType==="payment")return (await business.getPayment(item.relatedEntityId))?.customerId;
  if(item.relatedEntityType==="approval"){
    const approval=approvals.find(value=>value.id===item.relatedEntityId);
    if(approval)return (await work.getTask(approval.taskId))?.customerId;
  }
  return undefined;
}
function renderLocaleMeta(){datasetSnapshot.textContent=`${t("home.businessSnapshot")} · ${DEMO_COMPANY_NAME} · ${t("home.snapshotDate",{date:dateLabel()})} · ${t("capabilities.localDb")}`;businessDataDetail.textContent=`${DEMO_COMPANY_NAME} · demo-business-v1 · ${t("home.snapshotDate",{date:dateLabel()})}`;}
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
  snapshotRisk.textContent=String(snap.customersAtRisk);snapshotExceptions.textContent=String(snap.exceptions);snapshotDate.textContent=t("home.snapshotDate",{date:dateLabel()});
}
function renderWork(){
  const values=workRouteTasks();
  workCount.textContent=workCountLabel(values.length);
  historyCount.textContent=historyCountLabel(tasks.filter(task=>["completed","failed","blocked"].includes(task.status)).length);
  if(!values.length){workBody.innerHTML=`<tr><td class="empty-row" colspan="5">${esc(t("work.noMatch"))}</td></tr>`;workCards.innerHTML=`<div class="approval-empty">${esc(t("work.noMatch"))}</div>`;return;}
  workBody.innerHTML=values.slice(0,20).map(task=>`<tr><td><div class="task-name">${esc(task.title)}</div><div class="task-context">${esc(task.intent)}</div></td><td>${esc(task.customerQuery??DEMO_COMPANY_NAME)}</td><td><span class="status-chip ${taskOutcomeClass(task)}">${esc(outcomeLabel(task))}</span></td><td>${esc(task.verification?`${task.verification.passed}/${task.verification.total} ${t("work.verified")}`:task.status)}</td><td><a class="link-btn inspect-task-link" href="${routeHref(`/tasks/${encodeURIComponent(task.id)}`)}">${esc(t("work.viewTask"))}</a></td></tr>`).join("");
  workCards.innerHTML=values.slice(0,20).map(task=>`<article class="work-card"><div class="work-card-head"><h3>${esc(task.title)}</h3><span class="status-chip ${taskOutcomeClass(task)}">${esc(outcomeLabel(task))}</span></div><dl><dt>${esc(t("common.intent"))}</dt><dd>${esc(task.intent)}</dd><dt>${esc(t("common.context"))}</dt><dd>${esc(task.customerQuery??DEMO_COMPANY_NAME)}</dd><dt>${esc(t("common.updated"))}</dt><dd>${formatDateTime(task.updatedAt)}</dd></dl><a class="link-btn inspect-task-link" href="${routeHref(`/tasks/${encodeURIComponent(task.id)}`)}">${esc(t("work.viewTask"))}</a></article>`).join("");
}

function inboxActions(item:BusinessInboxItem,relatedTask?:BusinessTask,invoiceOptions=""){
  const openTask=relatedTask?`<a class="secondary-btn inbox-action" href="${routeHref(`/tasks/${encodeURIComponent(relatedTask.id)}`)}">${esc(t("inbox.openTask"))}</a>`:"";
  if(item.type==="ambiguous-customer") return relatedTask?`${openTask}<a class="primary-btn inbox-action" href="${routeHref(`/tasks/${encodeURIComponent(relatedTask.id)}`)}">${esc(t("inbox.resolveResume"))}</a>`:`<button class="secondary-btn inbox-action" data-action="start-ambiguous" data-id="${item.id}">${esc(t("inbox.startReview"))}</button>`;
  if(item.type==="duplicate-payment") return `${openTask}<button class="primary-btn inbox-action" data-action="suppress-duplicate" data-id="${item.id}">${esc(t("inbox.suppressDuplicate"))}</button><button class="secondary-btn inbox-action" data-action="escalate" data-id="${item.id}">${esc(t("inbox.escalate"))}</button>`;
  if(item.type==="unmatched-payment") return `${openTask}<select class="inbox-map-select" data-role="map-invoice" data-id="${item.id}" aria-label="${esc(t("a11y.mapPayment"))}"><option value="">${esc(t("inbox.chooseInvoice"))}</option>${invoiceOptions}</select><button class="primary-btn inbox-action" data-action="map-payment" data-id="${item.id}">${esc(t("inbox.mapLocally"))}</button><button class="secondary-btn inbox-action" data-action="dismiss-payment" data-id="${item.id}">${esc(t("inbox.dismiss"))}</button><button class="secondary-btn inbox-action" data-action="escalate" data-id="${item.id}">${esc(t("inbox.escalate"))}</button>`;
  if(item.type==="invoice-dispute") return `${openTask}<button class="secondary-btn inbox-action" data-action="acknowledge-dispute" data-id="${item.id}">${esc(t("inbox.acknowledge"))}</button><button class="primary-btn inbox-action" data-action="manager-review" data-id="${item.id}">${esc(t("inbox.managerReview"))}</button><button class="secondary-btn inbox-action" data-action="escalate" data-id="${item.id}">${esc(t("inbox.escalate"))}</button>`;
  if(item.type==="credit-limit") return `${openTask}<button class="primary-btn inbox-action" data-action="request-approval" data-id="${item.id}">${esc(t("inbox.requestApproval"))}</button><button class="secondary-btn inbox-action" data-action="escalate" data-id="${item.id}">${esc(t("inbox.escalate"))}</button>`;
  if(item.type==="approval-required") return openTask||`<span class="status-chip approval">${esc(t("inbox.approvalPending"))}</span>`;
  return `${openTask}<button class="secondary-btn inbox-action" data-action="investigate" data-id="${item.id}">${esc(t("inbox.investigate"))}</button><button class="secondary-btn inbox-action" data-action="escalate" data-id="${item.id}">${esc(t("inbox.escalate"))}</button>`;
}

async function renderInbox(){
  const isHome=currentRoute.name==="home";
  let visible=inbox.filter(item=>item.status!=="resolved");
  if(currentRoute.name==="inbox"){
    const status=currentRoute.query.get("status")??inboxStatusFilter.value;
    const severity=currentRoute.query.get("severity")??inboxSeverityFilter.value;
    const type=currentRoute.query.get("type")??inboxTypeFilter.value;
    const customerId=currentRoute.query.get("customerId");
    if(status)visible=visible.filter(item=>item.status===status);
    if(severity)visible=visible.filter(item=>item.severity===severity);
    if(type)visible=visible.filter(item=>item.type===type);
    if(customerId){const pairs=await Promise.all(visible.map(async item=>({item,customerId:await issueCustomerId(item)})));visible=pairs.filter(pair=>pair.customerId===customerId).map(pair=>pair.item);}
  }
  if(isHome)visible=visible.slice(0,3);
  const openCount=inbox.filter(item=>item.status!=="resolved").length;
  inboxBadge.textContent=String(openCount);inboxBadge.classList.toggle("attention",openCount>0);
  if(!visible.length){inboxList.innerHTML=`<li class="approval-empty">${esc(t("inbox.noMatch"))}</li>`;return;}
  if(isHome){
    inboxList.innerHTML=visible.map(item=>`<li class="inbox-preview-row"><div class="inbox-copy"><strong>${esc(item.title)}</strong><small>${esc(inboxTypeLabel(item.type))} · ${esc(severityLabel(item.severity))} · ${esc(inboxStatusLabel(item.status))}</small></div></li>`).join("")+`<li class="inbox-preview-more"><a class="link-btn" href="${routeHref("/inbox")}">${esc(t("common.viewAll"))}</a></li>`;return;
  }
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
  const rows=await Promise.all(visible.slice(0,50).map(async item=>{
    const relatedTask=tasks.find(task=>(item.relatedTaskIds??[]).includes(task.id));
    const related=relatedTask?`${relatedTask.title} · ${outcomeLabel(relatedTask)}`:t("inbox.noRelatedTask");
    const managerDecision=item.type==="approval-required"||item.type==="credit-limit";
    const kindLabel=managerDecision?t("inbox.managerDecision"):t("inbox.operationalIssue");
    return `<li class="inbox-item-card severity-${esc(item.severity)} ${managerDecision?"issue-manager":"issue-operational"}"><div class="inbox-copy"><div class="inbox-badges"><span class="issue-chip kind">${esc(kindLabel)}</span><span class="issue-chip severity ${esc(item.severity)}">${esc(severityLabel(item.severity))}</span><span class="issue-chip type">${esc(inboxTypeLabel(item.type))}</span></div><strong>${esc(item.title)}</strong><small>${esc(item.detail)}</small><div class="inbox-meta"><span>${esc(t("common.statusLabel"))}: ${esc(inboxStatusLabel(item.status))}</span><span>${esc(t("inbox.related"))}: ${esc(await entityLabel(item))}</span><span>${esc(t("inbox.relatedTask"))}: ${esc(related)}</span><span>${esc(t("common.created"))}: ${formatDateTime(item.createdAt)}</span><span>${esc(t("inbox.localNote"))}</span></div></div><div class="inbox-actions">${inboxActions(item,relatedTask,invoiceOptions)}</div></li>`;
  }));
  inboxList.innerHTML=rows.join("");
}

function approvalPresentation(approval:BusinessApproval){
  const task=tasks.find(value=>value.id===approval.taskId);const customer=task?.customerQuery??DEMO_COMPANY_NAME;const snapshot=t("home.snapshotDate",{date:dateLabel()});
  return{title:t("approvals.titleTemplate",{customer}),what:t("approvals.whatTemplate",{customer}),why:t("approvals.whyTemplate"),affected:t("approvals.affectedTemplate",{customer,snapshot}),impact:t("approvals.impactTemplate")};
}

function renderApprovals(){
  const pending=approvals.filter(approval=>approval.state==="pending");approvalBadge.textContent=String(pending.length);approvalBadge.classList.toggle("attention",pending.length>0);
  const values=currentRoute.name==="home"?approvals.slice(0,2):approvals;
  approvalList.innerHTML=values.length?values.map(approval=>{const present=approvalPresentation(approval);return`<article class="approval-scenario"><div><span class="status-chip ${approval.state==="pending"?"approval":approval.state==="approved"?"completed":"blocked"}">${esc(t("common.localSimulation"))} · ${esc(t(`approvals.state.${approval.state}`))}</span></div><h3>${esc(present.title)}</h3><ul class="approval-facts"><li><b>${esc(t("approvals.what"))}:</b> ${esc(present.what)}</li><li><b>${esc(t("approvals.why"))}:</b> ${esc(present.why)}</li><li><b>${esc(t("approvals.affected"))}:</b> ${esc(present.affected)}</li><li><b>${esc(t("approvals.impact"))}:</b> ${esc(present.impact)}</li></ul><div class="approval-simulation-note">${esc(t("common.noExternalChange"))}</div><div class="approval-actions"><a class="secondary-btn" href="${routeHref(`/approvals/${encodeURIComponent(approval.id)}`)}">${esc(t("approvals.view"))}</a>${approval.state==="pending"?`<button class="primary-btn approval-action" data-action="approve" data-id="${approval.id}">${esc(t("approvals.approve"))}</button><button class="secondary-btn approval-action" data-action="reject" data-id="${approval.id}">${esc(t("approvals.reject"))}</button>`:""}</div></article>`}).join(""):`<p><strong>${esc(t("approvals.none"))}</strong></p><p>${esc(t("approvals.noneHelp"))}</p>`;
}

function renderBrief(){
  const completed=tasks.filter(task=>task.status==="completed").length;
  const attention=countActionableIssues(inbox,approvals);
  if(!tasks.length){briefTitle.textContent=t("home.readyForWork");briefCopy.textContent=`${DEMO_COMPANY_NAME} · ${t("home.businessSnapshot")}`;briefList.innerHTML="";briefNote.textContent=t("common.available");return;}
  briefTitle.textContent=attention?t("home.attentionCount",{count:attention}):t("home.operationsTrack");
  briefCopy.textContent=t("home.briefLocal");
  briefList.innerHTML=`<li>${svgIcon("check")}<b>${completed}</b> ${esc(t("home.completedCount",{count:completed}).replace(String(completed),"").trim())}</li><li>${svgIcon(attention?"alert":"check")}<b>${attention}</b> ${esc(t("home.uniqueIssues",{count:attention}).replace(String(attention),"").trim())}</li>`;
  briefNote.textContent=attention?t("home.managerReviewNeeded"):t("home.operationsTrack");
}

async function renderHistory(){
  const terminal=tasks.filter(task=>["completed","failed","blocked"].includes(task.status));
  historyCount.textContent=historyCountLabel(terminal.length);
  if(!terminal.length){historyList.innerHTML=`<p class="approval-empty">${esc(t("history.noTerminal"))}</p>`;return;}
  historyList.innerHTML=terminal.map(task=>`<article class="history-item" data-task-id="${task.id}"><div><h3>${esc(task.title)}</h3><p>${esc(task.intent)} · ${esc(t("common.updated"))} ${formatDateTime(task.updatedAt)}</p></div><span class="status-chip ${taskOutcomeClass(task)}">${esc(outcomeLabel(task))}</span><a class="link-btn" href="${routeHref(`/tasks/${encodeURIComponent(task.id)}`,{tab:"timeline"})}">${esc(t("history.inspectTimeline"))}</a></article>`).join("");
}

async function renderCustomers(filter=""){
  const customers=(await business.listCustomers()).filter(customer=>!filter||`${customer.name} ${customer.code} ${customer.aliases.join(" ")}`.toLowerCase().includes(filter.toLowerCase()));
  customerList.innerHTML=customers.map(customer=>`<a class="entity-row customer-row" data-id="${customer.id}" href="${routeHref(`/customers/${encodeURIComponent(customer.id)}`)}"><strong>${esc(customer.name)}</strong><small>${esc(customer.code)} · ${esc(t("common.risk"))} ${esc(riskLabel(customer.risk))}</small></a>`).join("");
  if(!customers.length)customerDetail.innerHTML=`<p class="approval-empty">${esc(t("customers.noSearch"))}</p>`;
}

async function showCustomer(id:string){
  const customer=await business.getCustomer(id);if(!customer)return;
  const [review,related]=await Promise.all([reviewCustomer(business,customer),work.listTaskHistory()]);
  const issuePairs=await Promise.all(inbox.filter(item=>item.status!=="resolved").map(async item=>({item,customerId:await issueCustomerId(item)})));
  const relatedIssues=issuePairs.filter(pair=>pair.customerId===customer.id).map(pair=>pair.item);
  const reviewTask=`Review ${customer.name} receivables.`;const followTask=`Prepare ${customer.name} follow-up.`;
  customerDetail.innerHTML=`<h3>${esc(customer.name)}</h3><p>${esc(customer.code)} · ${esc(t(`common.status.${customer.status}`))} · ${esc(t("common.risk"))} ${esc(riskLabel(customer.risk))}</p>
    <div class="customer-actions"><button class="secondary-btn customer-compose-action" data-task="${esc(reviewTask)}" type="button">${esc(t("customers.reviewReceivables"))}</button><button class="secondary-btn customer-compose-action" data-task="${esc(followTask)}" type="button">${esc(t("customers.prepareFollowup"))}</button><a class="secondary-btn" href="${routeHref("/inbox",{customerId:customer.id})}">${esc(t("customers.viewExceptions"))}</a><a class="secondary-btn" href="${routeHref("/work",{customerId:customer.id})}">${esc(t("customers.viewRelatedTasks"))}</a></div>
    <div class="entity-summary"><div><span>${esc(t("common.outstanding"))}</span><strong>${money(review.outstandingTotal)}</strong></div><div><span>${esc(t("task.openInvoices"))}</span><strong>${review.open.length}</strong></div><div><span>${esc(t("customers.creditLimit"))}</span><strong>${money(customer.creditLimit)}</strong></div></div>
    <h4>${esc(t("common.invoices"))}</h4><table class="mini-table"><thead><tr><th>${esc(t("common.invoice"))}</th><th>${esc(t("customers.due"))}</th><th>${esc(t("common.outstanding"))}</th><th>${esc(t("connections.status"))}</th></tr></thead><tbody>${review.rows.map(row=>`<tr><td>${esc(row.invoice.number)}</td><td>${formatDate(row.invoice.dueOn)}</td><td>${money(row.outstanding)}</td><td>${esc(invoiceStatusLabel(row.invoice.status))}</td></tr>`).join("")}</tbody></table>
    <h4>${esc(t("common.payments"))}</h4><table class="mini-table"><tbody>${review.payments.map(payment=>`<tr><td>${esc(payment.reference)}</td><td>${money(payment.amount)}</td><td>${esc(paymentStatusLabel(payment.status))}</td></tr>`).join("")||`<tr><td>${esc(t("common.none"))}</td></tr>`}</tbody></table>
    <div class="customer-subsection"><div class="subsection-head"><h4>${esc(t("customers.exceptions"))}</h4><a class="link-btn" href="${routeHref("/inbox",{customerId:customer.id})}">${esc(t("customers.viewExceptions"))}</a></div>${relatedIssues.length?`<div class="customer-exception-list">${relatedIssues.map(item=>`<article><span class="issue-chip severity ${esc(item.severity)}">${esc(severityLabel(item.severity))}</span><div><strong>${esc(item.title)}</strong><small>${esc(inboxTypeLabel(item.type))} · ${esc(inboxStatusLabel(item.status))}</small></div></article>`).join("")}</div>`:`<p class="approval-empty">${esc(t("customers.noExceptions"))}</p>`}</div>
    <div class="customer-subsection"><div class="subsection-head"><h4>${esc(t("customers.relatedTasks"))}</h4><a class="link-btn" href="${routeHref("/work",{customerId:customer.id})}">${esc(t("customers.viewRelatedTasks"))}</a></div><div class="related-task-list">${related.filter(task=>task.customerId===customer.id).map(task=>`<a class="link-btn" href="${routeHref(`/tasks/${encodeURIComponent(task.id)}`)}">${esc(task.title)} · ${esc(outcomeLabel(task))}</a>`).join("")||esc(t("customers.noRelatedTasks"))}</div></div>`;
  document.querySelectorAll(".customer-row").forEach(element=>element.classList.toggle("active",(element as HTMLElement).dataset.id===id));
}

async function renderAll(){await refreshData();await renderWorkCustomerFilter();renderWork();renderApprovals();renderBrief();await Promise.all([renderKpis(),renderHistory(),renderCustomers(customerSearch.value),renderInbox()]);applyDomTranslations();}
function safeMarkdown(value:string){const escaped=esc(value);return escaped.replace(/^###?\s+(.+)$/gm,"<h3>$1</h3>").replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/^[-*]\s+(.+)$/gm,"<div>• $1</div>").replace(/\n/g,"<br>");}
function renderSummary(summary:Record<string,unknown>){
  const customer=summary.customer as any;
  if(customer&&typeof customer==="object"){const out=Number(summary.outstandingTotal??0);return`<div class="result-grid"><div class="result-cell"><span>${esc(t("common.customer"))}</span><strong>${esc(customer.name??customer.id)}</strong></div><div class="result-cell"><span>${esc(t("common.outstanding"))}</span><strong>${money(out)}</strong></div><div class="result-cell"><span>${esc(t("task.openInvoices"))}</span><strong>${esc(summary.outstandingInvoices??0)}</strong></div><div class="result-cell"><span>${esc(t("task.followups"))}</span><strong>${Array.isArray(summary.followUps)?summary.followUps.length:0}</strong></div></div>`;}
  if(summary.resultType==="investigation-completed"){const count=Number(summary.count??0);const items=((summary.paymentExceptions??summary.exceptions) as any[]??[]);return`<div class="result-notice attention"><strong>${esc(t("task.investigationCompleted"))}</strong><p>${esc(count?t("task.exceptionsFound",{count}):t("task.noFollowup"))}</p></div>${items.map(item=>`<div class="attention-box"><strong>${esc(item.title)}</strong><br>${esc(item.detail)}</div>`).join("")}`;}
  if("totalOverdueCustomers" in summary)return`<div class="result-grid"><div class="result-cell"><span>${esc(t("task.overdueCustomers"))}</span><strong>${esc(summary.totalOverdueCustomers)}</strong></div><div class="result-cell"><span>${esc(t("task.totalOverdue"))}</span><strong>${money(Number(summary.totalOverdueAmount??0))}</strong></div><div class="result-cell"><span>${esc(t("home.exceptions"))}</span><strong>${esc(summary.exceptionsRequiringReview)}</strong></div></div><h4>${esc(t("task.highestPriority"))}</h4><div>${(summary.highestPriority as any[]??[]).map(account=>`<p><strong>${esc(account.customer)}</strong> · ${money(account.overdueAmount)} · ${esc(t("task.daysOverdue",{days:account.maxDaysOverdue}))}</p>`).join("")}</div><h4>${esc(t("task.upcomingDue"))}</h4><div>${(summary.upcomingDueAccounts as any[]??[]).map(account=>`<p><strong>${esc(account.customer)}</strong> · ${money(account.amount)} · ${account.invoices} ${esc(t(account.invoices===1?"common.invoice":"common.invoicePlural"))}</p>`).join("")||`<p>${esc(t("task.noneNext14"))}</p>`}</div>`;
  if("snapshot" in summary){const snap=summary.snapshot as any;return`<div class="result-grid"><div class="result-cell"><span>${esc(t("home.openReceivables"))}</span><strong>${money(snap.openReceivables)}</strong></div><div class="result-cell"><span>${esc(t("home.overdueInvoices"))}</span><strong>${snap.overdueInvoices}</strong></div><div class="result-cell"><span>${esc(t("home.exceptions"))}</span><strong>${esc(summary.exceptions)}</strong></div><div class="result-cell"><span>${esc(t("home.pendingApprovals"))}</span><strong>${esc(summary.pendingApprovals)}</strong></div></div>`;}
  return`<div class="result-notice"><strong>${esc(t("task.resultRecorded"))}</strong><p>${esc(t("task.resultRecordedHelp"))}</p></div>`;
}

async function renderTaskPanels(task:BusinessTask,events:any[],evidence:any[],relatedIssues:BusinessInboxItem[]){
  const tabs=[["result","task.tab.result"],["timeline","task.tab.timeline"],["verification","task.tab.verification"],["evidence","task.tab.evidence"],["issues","task.tab.issues"],["approval","task.tab.approval"]] as const;
  const active=currentRoute.name==="task"?(currentRoute.query.get("tab")??"result"):"result";
  taskTabs.innerHTML=tabs.map(([key,labelKey])=>`<a class="${active===key?"active":""}" ${active===key?'aria-current="page"':''} href="${routeHref(`/tasks/${encodeURIComponent(task.id)}`,{tab:key})}">${esc(t(labelKey))}</a>`).join("");
  const resultPanel=$<HTMLElement>("#task-result-panel");const panels:{[key:string]:HTMLElement}={result:resultPanel,timeline:taskTimelinePanel,verification:taskVerificationPanel,evidence:taskEvidencePanel,issues:taskIssuesPanel,approval:taskApprovalPanel};Object.entries(panels).forEach(([key,panel])=>panel.hidden=key!==active);
  taskTimelinePanel.innerHTML=`<h3>${esc(t("task.timeline"))}</h3><div class="timeline">${events.map(event=>`<div class="timeline-row"><b>${esc(activityLabel(event.type,event.message))}</b><span><code>${esc(event.type)}</code></span><span>${formatDateTime(event.occurredAt)}</span></div>`).join("")}</div>`;
  const verificationEvidence=evidence.find(item=>item.type==="verification")?.data as any;const verificationText=task.verification?t("verification.checksPassed",{passed:task.verification.passed,total:task.verification.total}):t("verification.noCompleted");
  taskVerificationPanel.innerHTML=`<h3>${esc(t("verification.title"))}</h3><p><strong>${esc(verificationText)}</strong></p><ul class="check-list">${verificationEvidence?.checks?.map((check:any)=>`<li data-pass="${!!check.passed}"><span class="check-icon">${svgIcon(check.passed?"check":"x")}</span><div><strong>${esc(verificationLabel(check.id))}</strong><small class="technical-id">${esc(check.id)}</small>${check.message?`<div>${esc(check.message)}</div>`:""}</div></li>`).join("")??""}</ul>`;
  taskEvidencePanel.innerHTML=`<div class="evidence-panel-head"><div><h3>${esc(t("task.evidence"))}</h3><p>${esc(t("task.evidenceHelp"))}</p></div><span class="meta">${esc(t("task.evidenceRecords",{count:evidence.length}))}</span></div>${evidence.length?`<div class="task-evidence-list">${evidence.map((record:any)=>`<details class="task-evidence-record"><summary><span><strong>${esc(record.type)}</strong><small>${esc(record.source)} · ${formatDateTime(record.createdAt)}</small></span><span>${esc(t("task.rawRecord"))}</span></summary><pre>${esc(JSON.stringify(record,null,2))}</pre></details>`).join("")}</div>`:`<p class="approval-empty">${esc(t("task.noIssues"))}</p>`}`;
  taskIssuesPanel.innerHTML=`<h3>${esc(t("task.tab.issues"))}</h3>${relatedIssues.length?relatedIssues.map(item=>`<article class="related-issue"><strong>${esc(item.title)}</strong><span>${esc(inboxTypeLabel(item.type))} · ${esc(severityLabel(item.severity))} · ${esc(inboxStatusLabel(item.status))}</span></article>`).join(""):`<p class="approval-empty">${esc(t("task.noIssues"))}</p>`}`;
  const approval=approvals.find(value=>value.taskId===task.id);
  taskApprovalPanel.innerHTML=approval?`<h3>${esc(t("task.relatedApproval"))}</h3><p><a class="link-btn" href="${routeHref(`/approvals/${encodeURIComponent(approval.id)}`)}">${esc(approval.title)}</a></p><p>${esc(t("connections.status"))}: <strong>${esc(t(`approvals.state.${approval.state}`))}</strong></p>`:`<h3>${esc(t("task.relatedApproval"))}</h3><p class="approval-empty">${esc(t("task.noApproval"))}</p>`;
}

async function renderTaskDetail(taskId:string){
  const task=await work.getTask(taskId);if(!task)return;
  const [events,evidence,allInbox]=await Promise.all([work.listTaskEvents(taskId),work.listEvidence(taskId),work.listInbox()]);
  setDetail(task);businessMeta.textContent=`${task.intent} · ${task.customerQuery??DEMO_COMPANY_NAME}`;let resultHtml="";
  if(task.status==="needs-review"&&task.review?.candidateCustomerIds.length){
    const candidates=await Promise.all(task.review.candidateCustomerIds.map(async customerId=>{const customer=await business.getCustomer(customerId);if(!customer)return null;const review=await reviewCustomer(business,customer);return{customer,review};}));
    resultHtml=`<div class="result-notice attention"><strong>${esc(t("task.clarification"))}</strong><p>${esc(t("task.multipleMatch",{query:task.review.query}))}</p></div><div class="candidate-grid">${candidates.filter(Boolean).map(candidate=>{const value=candidate!;return`<article class="candidate-card"><h3>${esc(value.customer.name)}</h3><div class="candidate-meta"><span>${esc(t("common.code"))} <b>${esc(value.customer.code)}</b></span><span>${esc(t("common.risk"))} <b>${esc(riskLabel(value.customer.risk))}</b></span><span>${esc(t("common.outstanding"))} <b>${money(value.review.outstandingTotal)}</b></span></div><button class="primary-btn review-candidate" data-task-id="${task.id}" data-customer-id="${value.customer.id}" type="button">${esc(t("task.selectResume"))}</button></article>`;}).join("")}</div>`;
  }else if(task.status==="needs-review"){resultHtml=`<div class="result-notice attention"><strong>${esc(t("task.clarification"))}</strong><p>${esc(t("task.noMatch",{query:task.customerQuery??""}))}</p></div>`;}
  else if(task.status==="needs-approval"){resultHtml=`<div class="result-notice attention"><strong>${esc(t("task.managerApproval"))}</strong><p>${esc(t("task.managerApprovalHelp"))}</p></div>`;}
  else if(task.status==="blocked"&&task.intent==="unsupported"){resultHtml=`<div class="result-notice blocked"><strong>${esc(t("task.unsupported"))}</strong><p>${esc(t("task.unsupportedHelp"))}</p><p>${esc(t("feedback.supportedCapabilities"))}</p><p>${esc(t("task.noExecution"))}</p></div>`;}
  else if(task.status==="blocked"){resultHtml=`<div class="result-notice blocked"><strong>${esc(t("task.managerRejected"))}</strong><p>${esc(t("task.noExecution"))}</p><p>${esc(t("common.localSimulation"))} · ${esc(t("common.noExternalChange"))}</p></div>`;}
  else if(task.status==="failed"){resultHtml=`<div class="result-notice failed"><strong>${esc(t("task.executionFailed"))}</strong><p>${esc(t("task.executionFailedHelp"))}</p></div>`;}
  else if(task.verification?.status==="NEEDS_REVIEW"){resultHtml=`<div class="result-notice attention"><strong>${esc(t("task.verificationFailed"))}</strong><p>${esc(t("task.verificationFailedHelp"))}</p></div>`;}
  else resultHtml=renderSummary(task.summary??{});
  const relatedIssues=allInbox.filter(item=>(item.relatedTaskIds??[]).includes(task.id));
  if(relatedIssues.length)resultHtml+=`<div class="related-issues"><h4>${esc(t("task.relatedInbox"))}</h4>${relatedIssues.map(item=>`<div class="related-issue"><strong>${esc(item.title)}</strong><span>${esc(severityLabel(item.severity))} · ${esc(inboxStatusLabel(item.status))}</span></div>`).join("")}</div>`;
  businessResult.innerHTML=resultHtml;await renderTaskPanels(task,events,evidence,relatedIssues);
  verificationCount.textContent=task.verification?t("verification.checksPassed",{passed:task.verification.passed,total:task.verification.total}):"0 / 0";
  if(task.verification){taskTrustSummary.hidden=false;taskTrustSummary.innerHTML=`<div class="trust-summary-copy"><span>${esc(t("task.verifiedResult"))}</span><strong>${esc(t("task.verificationSummary",{passed:task.verification.passed,total:task.verification.total}))}</strong></div><a class="secondary-btn" href="${routeHref(`/tasks/${encodeURIComponent(task.id)}`,{tab:"verification"})}">${esc(t("task.reviewVerification"))}</a>`;}else{taskTrustSummary.hidden=true;taskTrustSummary.innerHTML="";}
  const verificationEvidence=evidence.find(item=>item.type==="verification")?.data as any;
  verificationList.innerHTML=verificationEvidence?.checks?.length?verificationEvidence.checks.map((check:any)=>`<li data-pass="${!!check.passed}"><span class="check-icon">${svgIcon(check.passed?"check":"x")}</span><div><strong>${esc(verificationLabel(check.id))}</strong><small class="technical-id">${esc(check.id)}</small>${check.message?`<div>${esc(check.message)}</div>`:""}</div></li>`).join(""):`<li><span class="check-icon">${svgIcon("circle")}</span><div>${esc(t("verification.waiting"))}</div></li>`;
  latestEvidence=JSON.stringify(evidence,null,2);rawEvidence.textContent=latestEvidence;
  const localeType=`manager.summary.${getLocale()}`;const manager=evidence.find(item=>item.type===localeType)?.data as any ?? (getLocale()==="en"?evidence.find(item=>item.type==="manager.summary")?.data as any:undefined);
  aiSummary.innerHTML=manager?.html??(task.status==="completed"?`<p>${esc(t("task.verifiedCompleteNoSummary"))}</p>`:`<p>${esc(t("task.summaryOnlyAfter"))}</p>`);gatewayStatus.textContent=manager?t("feedback.gatewayConnected"):t("task.gatewayNotCalledForTask");
  currentActivity.innerHTML=projectTaskActivity(events).map(event=>`<li><span class="activity-icon ${event.type==="COMPLETED"?"done":event.type==="FAILED"?"idle":"active"}">${svgIcon(event.type==="COMPLETED"?"check":event.type==="FAILED"?"x":"circle-dot")}</span><div class="activity-copy"><strong>${esc(activityLabel(event.type,event.message))}</strong><small>${esc(event.type)} · ${formatTime(event.occurredAt)}</small></div></li>`).join("")||`<li><span class="activity-icon idle">${svgIcon("circle")}</span><div>${esc(t("task.noTaskEvents"))}</div></li>`;
  setEmployeeMode(task.status==="needs-approval"||task.status==="needs-review"?"Waiting on manager":task.status==="running"?"Working":"Available");applyDomTranslations();
}

async function inspectHistory(taskId:string){const box=$<HTMLElement>(`#timeline-${CSS.escape(taskId)}`);const [events,evidence]=await Promise.all([work.listTaskEvents(taskId),work.listEvidence(taskId)]);box.hidden=!box.hidden;if(box.hidden)return;box.innerHTML=events.map(event=>`<div class="timeline-row"><b>${esc(activityLabel(event.type,event.message))}</b><span><code>${esc(event.type)}</code></span><span>${formatTime(event.occurredAt)}</span></div>`).join("")+`<div class="timeline-row"><b>${esc(t("task.evidence"))}</b><span>${evidence.length}</span><span></span></div>`;}

async function renderApprovalDetailPage(approvalId:string){
  const approval=await work.getApproval(approvalId);
  if(!approval){approvalDetail.innerHTML=`<div class="result-notice failed"><strong>${esc(t("approvals.notFound"))}</strong><p>${esc(t("approvals.notFoundHelp"))}</p></div>`;return t("approvals.notFound");}
  const task=await work.getTask(approval.taskId);const events=task?await work.listTaskEvents(task.id):[];const present=approvalPresentation(approval);
  approvalDetail.innerHTML=`<article class="approval-scenario"><div><span class="status-chip ${approval.state==="pending"?"approval":approval.state==="approved"?"completed":"blocked"}">${esc(t("common.localSimulation"))} · ${esc(t(`approvals.state.${approval.state}`))}</span></div><h3>${esc(present.title)}</h3><ul class="approval-facts"><li><b>${esc(t("approvals.what"))}:</b> ${esc(present.what)}</li><li><b>${esc(t("approvals.why"))}:</b> ${esc(present.why)}</li><li><b>${esc(t("approvals.affected"))}:</b> ${esc(present.affected)}</li><li><b>${esc(t("approvals.impact"))}:</b> ${esc(present.impact)}</li></ul>${task?`<p>${esc(t("approvals.relatedTask"))}: <a class="link-btn" href="${routeHref(`/tasks/${encodeURIComponent(task.id)}`)}">${esc(task.title)}</a></p>`:""}${approval.state==="pending"?`<div class="approval-actions"><button class="primary-btn approval-action" data-action="approve" data-id="${approval.id}">${esc(t("approvals.approve"))}</button><button class="secondary-btn approval-action" data-action="reject" data-id="${approval.id}">${esc(t("approvals.reject"))}</button></div>`:""}<h4>${esc(t("approvals.timeline"))}</h4><div class="timeline">${events.map(event=>`<div class="timeline-row"><b>${esc(activityLabel(event.type,event.message))}</b><span><code>${esc(event.type)}</code></span><span>${formatDateTime(event.occurredAt)}</span></div>`).join("")}</div></article>`;
  applyDomTranslations();return present.title;
}

function renderCapabilitiesPage(){
  const capabilities=[
    ["capabilities.customerLookup","capabilities.customerLookupDesc","capabilities.customerData","capabilities.none","capabilities.uniqueIdentity","capabilities.noApproval","capabilities.noExternalWrite"],
    ["capabilities.receivables","capabilities.receivablesDesc","capabilities.receivablesData","capabilities.none","capabilities.reconciliation","capabilities.noApproval","capabilities.noExternalWrite"],
    ["capabilities.payment","capabilities.paymentDesc","capabilities.paymentData","capabilities.localIssueState","capabilities.exceptionEnumeration","capabilities.noApproval","capabilities.localSimulation"],
    ["capabilities.followup","capabilities.followupDesc","capabilities.followupData","capabilities.localDraftAction","capabilities.coverage","capabilities.managerControlled","capabilities.noExternalWrite"],
    ["capabilities.exception","capabilities.exceptionDesc","capabilities.exceptionData","capabilities.localIssueState","capabilities.exceptionEnumeration","capabilities.managerControlled","capabilities.localSimulation"],
    ["capabilities.portfolio","capabilities.portfolioDesc","capabilities.portfolioData","capabilities.none","capabilities.portfolioConsistency","capabilities.noApproval","capabilities.noExternalWrite"],
    ["capabilities.brief","capabilities.briefDesc","capabilities.briefData","capabilities.none","capabilities.snapshotConsistency","capabilities.noApproval","capabilities.noExternalWrite"],
  ];
  capabilitiesGrid.innerHTML=capabilities.map(([name,purpose,reads,changes,verificationMode,approval,limitation])=>`<article class="capability-card"><div class="capability-card-head"><div><h3>${esc(t(name))}</h3><p>${esc(t(purpose))}</p></div><span class="capability-boundary">${esc(t(limitation))}</span></div><dl><dt>${esc(t("capabilities.reads"))}</dt><dd>${esc(t(reads))}</dd><dt>${esc(t("capabilities.mayChange"))}</dt><dd>${esc(t(changes))}</dd><dt>${esc(t("capabilities.verification"))}</dt><dd>${esc(t(verificationMode))}</dd><dt>${esc(t("capabilities.approvalRequirement"))}</dt><dd>${esc(t(approval))}</dd><dt>${esc(t("capabilities.demoLimitation"))}</dt><dd>${esc(t(limitation))}</dd></dl></article>`).join("");
}

function renderConnectionsPage(){
  const pwaStatus=document.querySelector<HTMLElement>("#pwa-status")?.textContent??t("pwa.webApp");
  const appVersion=document.querySelector<HTMLElement>("#app-version")?.textContent??t("common.versionLoading");
  const rows=[
    {name:t("connections.browser"),status:t("connections.ready"),purpose:t("connections.browserPurpose"),permission:t("connections.localBrowser"),boundary:t("connections.localRw"),mode:t("connections.realRuntime")},
    {name:t("connections.gateway"),status:gatewayConnection.textContent||t("connections.ready"),purpose:t("connections.gatewayPurpose"),permission:t("connections.memoryToken"),boundary:t("connections.verifiedFacts"),mode:t("connections.demoService")},
    {name:t("connections.businessData"),status:t("common.demo"),purpose:t("connections.businessPurpose"),permission:t("capabilities.localDb"),boundary:t("connections.localDemoData"),mode:t("common.demo")},
    {name:t("connections.app"),status:pwaStatus,purpose:t("connections.appPurpose"),permission:t("connections.appPermission"),boundary:t("connections.appBoundary"),mode:`${t("connections.pwaMode")} · ${appVersion}`},
    {name:t("connections.erp"),status:t("common.notConnected"),purpose:t("connections.erpPurpose"),permission:t("connections.none"),boundary:t("connections.noAccess"),mode:t("common.notConnected")},
    {name:t("connections.gmail"),status:t("common.notConnected"),purpose:t("connections.gmailPurpose"),permission:t("connections.none"),boundary:t("connections.noSendRead"),mode:t("common.notConnected")},
  ];
  connectionsPageBody.innerHTML=`<div class="connection-card-grid">${rows.map(row=>{const disconnected=row.status===t("common.notConnected");const demo=row.status===t("common.demo");return`<article class="connection-card ${disconnected?"disconnected":demo?"demo":""}"><div class="connection-card-head"><h3>${esc(row.name)}</h3><span class="connection-state ${disconnected?"off":demo?"demo":""}">${esc(row.status)}</span></div><p>${esc(row.purpose)}</p><dl><dt>${esc(t("connections.permission"))}</dt><dd>${esc(row.permission)}</dd><dt>${esc(t("connections.boundary"))}</dt><dd>${esc(row.boundary)}</dd><dt>${esc(t("connections.mode"))}</dt><dd>${esc(row.mode)}</dd></dl></article>`}).join("")}</div><p class="approval-empty connection-boundary-note">${esc(t("connections.noFake"))}</p>`;
}

function replaceRoute(path:string,query:Record<string,string|undefined>={}){history.replaceState(null,"",`${location.pathname}${location.search}${routeHref(path,query)}`);void applyRoute(parseHash());}
let lastFocusedPath="";let routeEpoch=0;let routeFocusInitialized=false;
async function applyRoute(route:AppRoute){
  const epoch=++routeEpoch,isCurrent=()=>epoch===routeEpoch;
  currentRoute=route;document.body.className=document.body.className.replace(/\broute-[a-z-]+\b/g,"").trim();document.body.classList.add(`route-${route.name}`);
  document.querySelectorAll<HTMLElement>("[data-pages]").forEach(element=>{const pages=(element.dataset.pages??"").split(/\s+/);element.hidden=!pages.includes(route.name);});
  const parent=navParent(route);document.querySelectorAll<HTMLElement>("[data-nav-route]").forEach(element=>{const active=element.dataset.navRoute===parent;element.classList.toggle("active",active);if(active)element.setAttribute("aria-current","page");else element.removeAttribute("aria-current");});closeDrawer(false);
  const titleFor=(key:string)=>`${t(key)} · Alex`;
  let detailHeading:{selector:string;text:string}|undefined;
  if(route.name==="home"){document.title=titleFor("nav.home");if(tasks[0])await renderTaskDetail(tasks[0].id);else resetWorkspace(false,false);if(!isCurrent())return;}
  if(route.name==="work"){document.title=titleFor("nav.work");workStatusFilter.value=route.query.get("status")??"";await renderWorkCustomerFilter();if(!isCurrent())return;renderWork();}
  if(route.name==="inbox"){document.title=titleFor("nav.inbox");inboxStatusFilter.value=route.query.get("status")??"";inboxSeverityFilter.value=route.query.get("severity")??"";inboxTypeFilter.value=route.query.get("type")??"";await renderInbox();if(!isCurrent())return;}
  if(route.name==="customers"){document.title=titleFor("nav.customers");const q=route.query.get("q")??"";customerSearch.value=q;await renderCustomers(q);if(!isCurrent())return;customerDetail.innerHTML=`<p class="approval-empty">${esc(t("customers.selectHelp"))}</p>`;document.querySelector("#customers-view h2")!.textContent=t("customers.title");}
  if(route.name==="customer"){const customer=await business.getCustomer(route.params.customerId!);if(!isCurrent())return;if(customer){await showCustomer(customer.id);if(!isCurrent())return;document.querySelector("#customers-view h2")!.textContent=customer.name;detailHeading={selector:"#customers-view h2",text:customer.name};document.title=`${customer.name} · ${t("nav.customers")}`;}else{customerDetail.innerHTML=`<div class="result-notice failed"><strong>${esc(t("customers.notFound"))}</strong></div>`;document.title=`${t("customers.notFound")} · ${t("nav.customers")}`;}}
  if(route.name==="history"){document.title=titleFor("nav.history");await renderHistory();if(!isCurrent())return;}
  if(route.name==="approvals"){document.title=titleFor("nav.approvals");renderApprovals();}
  if(route.name==="approval"){document.title=`${t("approvals.detail")} · Alex`;const approvalTitle=await renderApprovalDetailPage(route.params.approvalId!);if(!isCurrent())return;detailHeading={selector:"#approval-detail-page h2",text:approvalTitle};document.title=`${approvalTitle} · ${t("nav.approvals")}`;}
  if(route.name==="task"){document.title=`${t("task.latest")} · Alex`;const task=await work.getTask(route.params.taskId!);if(!isCurrent())return;if(task){await renderTaskDetail(task.id);if(!isCurrent())return;const heading=document.querySelector<HTMLElement>("#task-detail h2");if(heading)heading.textContent=task.title;detailHeading={selector:"#task-detail h2",text:task.title};document.title=`${task.title} · Alex`;}else{businessResult.innerHTML=`<div class="result-notice failed"><strong>${esc(t("task.notFound"))}</strong><p>${esc(t("task.notFoundHelp"))}</p></div>`;document.title=`${t("task.notFound")} · Alex`;}}
  if(route.name==="capabilities"){renderCapabilitiesPage();document.title=titleFor("nav.capabilities");}
  if(route.name==="connections"){renderConnectionsPage();document.title=titleFor("nav.connections");}
  if(route.name==="settings"){languageSelect.value=getLocale();settingsAppVersion.textContent=document.querySelector("#app-version")?.textContent??t("common.versionLoading");document.title=titleFor("nav.settings");}
  if(!isCurrent())return;
  applyDomTranslations();
  if(detailHeading){const heading=document.querySelector<HTMLElement>(detailHeading.selector);if(heading)heading.textContent=detailHeading.text;}
  if(lastFocusedPath!==route.path){lastFocusedPath=route.path;if(routeFocusInitialized){requestAnimationFrame(()=>{const heading=document.querySelector<HTMLElement>("#main-content [data-pages]:not([hidden]) h1, #main-content [data-pages]:not([hidden]) h2");if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});window.scrollTo({top:0,behavior:"instant" as ScrollBehavior});}});}else routeFocusInitialized=true;}
}

async function createManagerSummary(result:BusinessWorldResult){
  if(result.task.status!=="completed"||result.verification.status!=="PASS")return;
  const summaryLocale=getLocale();const language=localeLanguageName(summaryLocale);aiSummary.textContent=t("feedback.preparingSummary");gatewayStatus.textContent=t("feedback.preparingVerified");
  try{const response=await gateway.chat({messages:[{role:"system",content:`You are Alex, an operations employee. Respond in ${language}. Summarize only the supplied verified facts for a manager. Do not invent business facts or completion claims. Language controls presentation only and must not alter verification or business truth.`},{role:"user",content:JSON.stringify({intent:result.task.intent,summary:result.summary,verification:result.verification})}]});const choices=(response as any)?.choices;const text=Array.isArray(choices)&&typeof choices[0]?.message?.content==="string"?choices[0].message.content:t("outcome.completed");const html=safeMarkdown(text);aiSummary.innerHTML=html;gatewayStatus.textContent=t("feedback.gatewayConnected");gatewayConnection.textContent=t("common.connected");await work.saveEvidence({id:`evidence-${result.task.id}-manager-${summaryLocale}`,taskId:result.task.id,type:`manager.summary.${summaryLocale}`,source:"demo-gateway",createdAt:new Date().toISOString(),data:{html,locale:summaryLocale}});}
  catch(error){gatewayConnection.textContent=t("common.unavailable");gatewayStatus.textContent=error instanceof DemoGatewayRateLimitError?error.message:error instanceof DemoGatewayError&&error.status===403?t("feedback.gatewayOrigin"):t("feedback.gatewayUnavailable");aiSummary.textContent=t("feedback.summaryUnavailable");}
}

async function resolveCustomerChoice(taskId:string,customerId:string){
  if(running)return;
  running=true;assignButton.disabled=true;suggestionButtons.forEach(button=>button.disabled=true);setEmployeeMode("Working");
  try{
    const result=await resolveAmbiguousCustomerReview(business,work,taskId,customerId);
    await renderAll();await renderTaskDetail(result.task.id);await createManagerSummary(result);await renderTaskDetail(result.task.id);
    if(currentRoute.name!=="task"||currentRoute.params.taskId!==result.task.id)navigate(`/tasks/${result.task.id}`);
  }finally{running=false;assignButton.disabled=false;suggestionButtons.forEach(button=>button.disabled=false);}
}
async function executeRouted(title:string,intent:any,customerQuery?:string,taskId?:string){
  running=true;assignButton.disabled=true;suggestionButtons.forEach(button=>button.disabled=true);setEmployeeMode("Working");
  currentActivity.innerHTML=`<li><span class="activity-icon active">${svgIcon("circle-dot")}</span><div class="activity-copy"><strong>${esc(t("feedback.workingAssigned"))}</strong><small>${esc(intent)}</small></div></li>`;
  try{
    const result=await runBusinessWorldTask(business,work,{taskId,title,intent,customerQuery});
    await renderAll();await renderTaskDetail(result.task.id);await createManagerSummary(result);await renderTaskDetail(result.task.id);
    navigate(`/tasks/${result.task.id}`);
  }finally{running=false;assignButton.disabled=false;suggestionButtons.forEach(button=>button.disabled=false);}
}
async function createBlocked(title:string,reason:string){
  const now=new Date().toISOString();
  const task:BusinessTask={id:`task-${Date.now()}`,title,intent:"unsupported",status:"blocked",createdAt:now,updatedAt:now,summary:{resultType:"unsupported-capability",reason}};
  await work.createTask(task);await work.appendTaskEvent({id:`event-${task.id}-created`,taskId:task.id,type:"CREATED",occurredAt:now,message:"Task received"});
  await work.appendTaskEvent({id:`event-${task.id}-routed`,taskId:task.id,type:"ROUTED",occurredAt:new Date(Date.now()+1).toISOString(),message:"Unsupported capability"});
  await work.saveEvidence({id:`evidence-${task.id}-blocked`,taskId:task.id,type:"routing.blocked",source:"task-router",createdAt:now,data:{reason}});
  composerFeedback.textContent=t("feedback.supportedCapabilities");await renderAll();await renderTaskDetail(task.id);navigate(`/tasks/${task.id}`);
}
async function createApprovalScenario(title:string,customerQuery:string){const created=await createLocalDemoApproval(work,{title,customerQuery,snapshotLabel:t("home.snapshotDate",{date:dateLabel()})});await renderAll();navigate(`/approvals/${created.approval.id}`);}
async function decideApproval(id:string,decision:"approve"|"reject"){if(decision==="reject"){const rejected=await rejectLocalDemo(work,id);if(rejected){await renderAll();await renderTaskDetail(rejected.task.id);if(currentRoute.name==="approval")await renderApprovalDetailPage(id);}return;}const approved=await approveLocalDemo(work,id);if(!approved)return;await renderAll();await executeRouted(approved.task.title,"followup.prepare",approved.task.customerQuery,approved.task.id);}
async function actOnInbox(id:string,action:string){
  const item=inbox.find(value=>value.id===id);if(!item)return;
  const relatedTask=tasks.find(task=>(item.relatedTaskIds??[]).includes(task.id));
  if(action==="open-task"||action==="open-review"){
    if(relatedTask){await renderTaskDetail(relatedTask.id);document.querySelector("#task-detail")?.scrollIntoView({behavior:"smooth",block:"start"});}
    return;
  }
  if(action==="start-ambiguous"){
    taskInput.value="Resolve ambiguous customer.";composerFeedback.textContent=t("feedback.scenarioAdded");navigate("/home");setTimeout(()=>taskInput.focus(),0);return;
  }
  if(action==="suppress-duplicate")await suppressDuplicatePaymentLocally(business,work,id);
  else if(action==="map-payment"){
    const select=document.querySelector<HTMLSelectElement>(`[data-role="map-invoice"][data-id="${CSS.escape(id)}"]`);
    if(!select?.value){composerFeedback.textContent=t("feedback.chooseInvoice");return;}
    await mapUnmatchedPaymentLocally(business,work,id,select.value);
  }
  else if(action==="dismiss-payment")await dismissUnmatchedPaymentLocally(work,id);
  else if(action==="acknowledge-dispute")await acknowledgeInvoiceDispute(work,id);
  else if(action==="manager-review"||action==="request-approval"){
    const created=await requestManagerApprovalForIssue(business,work,id,t("home.snapshotDate",{date:dateLabel()}));
    await renderAll();navigate(`/approvals/${created.approvalId}`);return;
  }
  else if(action==="escalate")await escalateInboxIssue(work,id);
  else if(action==="investigate")await work.updateInboxStatus(id,"investigating","Investigation opened in Local Demo Simulation.");
  await renderAll();
  if(relatedTask)await renderTaskDetail(relatedTask.id);
}
async function assign(){if(running)return;const title=taskInput.value.trim();if(!title){composerFeedback.textContent=t("feedback.enterTask");return;}composerFeedback.textContent="";const canonical=pendingSuggestion&&title===pendingSuggestion.display?pendingSuggestion.canonical:title;const routed=routeDashboardTask(canonical);pendingSuggestion=null;if(routed.intent==="unsupported"){await createBlocked(title,routed.reason??"Unsupported capability");return;}if(routed.intent==="approval-demo"){await createApprovalScenario(title,routed.customerQuery??"ACME");return;}await executeRouted(title,routed.intent,routed.customerQuery);}
function openDrawer(){trustDrawer.classList.add("open");drawerOverlay.classList.add("open");closeTrustDrawerButton.focus();}
function closeDrawer(restoreFocus=true){trustDrawer.classList.remove("open");drawerOverlay.classList.remove("open");if(restoreFocus)openTrustDrawerButton.focus();}
async function refreshAfterReset(message:string){await renderAll();resetWorkspace(true,false);composerFeedback.textContent=message;}

function bindEvents(){
  document.querySelector<HTMLAnchorElement>(".skip-link")?.addEventListener("click",event=>{event.preventDefault();const main=$<HTMLElement>("#main-content");main.focus({preventScroll:true});main.scrollIntoView({block:"start"});});
  form.addEventListener("submit",event=>{event.preventDefault();void assign();});
  const toggleKeys:Record<string,[string,string]>={"scenario-library":["mobile.openScenario","mobile.closeScenario"],"customers-view":["mobile.openCustomers","mobile.closeCustomers"],"history-view":["mobile.openHistory","mobile.closeHistory"],"today-brief":["mobile.openBrief","mobile.closeBrief"]};
  document.querySelectorAll<HTMLButtonElement>(".mobile-section-toggle").forEach(button=>button.addEventListener("click",()=>{
    const target=button.dataset.target??"",section=document.getElementById(target);if(!section)return;const open=section.classList.toggle("mobile-open");const keys=toggleKeys[target];if(keys)button.textContent=t(open?keys[1]:keys[0]);button.setAttribute("aria-expanded",String(open));
  }));
  suggestionButtons.forEach(button=>button.addEventListener("click",()=>setSuggestedTask(button.dataset.task??"","feedback.scenarioAdded")));
  document.addEventListener("click",event=>{
    const element=event.target as HTMLElement;
    const compose=element.closest<HTMLButtonElement>(".customer-compose-action");if(compose?.dataset.task){const canonical=compose.dataset.task;navigate("/home");setTimeout(()=>setSuggestedTask(canonical,"feedback.customerAdded"),0);}
    const candidate=element.closest<HTMLButtonElement>(".review-candidate");if(candidate?.dataset.taskId&&candidate.dataset.customerId)void resolveCustomerChoice(candidate.dataset.taskId,candidate.dataset.customerId);
    const inboxButton=element.closest<HTMLButtonElement>(".inbox-action");if(inboxButton?.dataset.id&&inboxButton.dataset.action)void actOnInbox(inboxButton.dataset.id,inboxButton.dataset.action);
    const approvalButton=element.closest<HTMLButtonElement>(".approval-action");if(approvalButton?.dataset.id&&approvalButton.dataset.action)void decideApproval(approvalButton.dataset.id,approvalButton.dataset.action as any);
  });
  taskInput.addEventListener("input",()=>{if(pendingSuggestion&&taskInput.value!==pendingSuggestion.display)pendingSuggestion=null;});
  customerSearch.addEventListener("input",()=>{if(currentRoute.name==="customers")replaceRoute("/customers",{q:customerSearch.value||undefined});else void renderCustomers(customerSearch.value);});
  workStatusFilter.addEventListener("change",()=>navigate("/work",{status:workStatusFilter.value||undefined,customerId:workCustomerFilter.value||(currentRoute.query.get("customerId")??undefined)}));
  workCustomerFilter.addEventListener("change",()=>navigate("/work",{status:workStatusFilter.value||undefined,customerId:workCustomerFilter.value||undefined}));
  const inboxFilterRoute=()=>navigate("/inbox",{status:inboxStatusFilter.value||undefined,severity:inboxSeverityFilter.value||undefined,type:inboxTypeFilter.value||undefined,customerId:currentRoute.query.get("customerId")??undefined});
  inboxStatusFilter.addEventListener("change",inboxFilterRoute);inboxSeverityFilter.addEventListener("change",inboxFilterRoute);inboxTypeFilter.addEventListener("change",inboxFilterRoute);
  $("#new-task").addEventListener("click",()=>{navigate("/home");setTimeout(()=>resetWorkspace(true,true),0);});
  $("#open-inbox").addEventListener("click",()=>navigate("/inbox"));
  $("#clear-history").addEventListener("click",()=>{if(confirm(t("settings.clearConfirm")))void clearTaskHistory().then(()=>refreshAfterReset(t("settings.clearDone")));});
  $("#restore-business-data").addEventListener("click",()=>{if(confirm(t("settings.restoreConfirm")))void restoreSampleBusinessData().then(()=>refreshAfterReset(t("settings.restoreDone")));});
  $("#reset-entire-demo").addEventListener("click",()=>{if(confirm(t("settings.resetConfirm")))void resetEntireDemo().then(()=>refreshAfterReset(t("settings.resetDone")));});
  $("#copy-evidence").addEventListener("click",()=>void navigator.clipboard.writeText(latestEvidence));
  $("#view-evidence").addEventListener("click",()=>{const taskId=currentRoute.name==="task"?currentRoute.params.taskId:tasks[0]?.id;if(taskId)navigate(`/tasks/${taskId}`,{tab:"evidence"});else{evidenceDetails.open=true;if(matchMedia("(max-width:760px)").matches)openDrawer();}});
  openTrustDrawerButton.addEventListener("click",openDrawer);closeTrustDrawerButton.addEventListener("click",()=>closeDrawer());drawerOverlay.addEventListener("click",()=>closeDrawer());
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&trustDrawer.classList.contains("open"))closeDrawer();});
  languageSelect.value=getLocale();
  languageSelect.addEventListener("change",()=>void setLocale(languageSelect.value as SupportedLocale));
  onLocaleChange(()=>{languageSelect.value=getLocale();renderLocaleMeta();if(pendingSuggestion&&taskInput.value===pendingSuggestion.display){pendingSuggestion.display=localizedTaskSuggestion(pendingSuggestion.canonical);taskInput.value=pendingSuggestion.display;}void (async()=>{await renderAll();await applyRoute(currentRoute);})();});
  const versionNode=document.querySelector<HTMLElement>("#app-version");if(versionNode)new MutationObserver(()=>{settingsAppVersion.textContent=versionNode.textContent??t("common.versionLoading");}).observe(versionNode,{childList:true,subtree:true});
}


export async function bootstrapDashboard(){
  renderLocaleMeta();
  await initializeBusinessWorld();bindEvents();
  const router=createHashRouter({onRoute:applyRoute});router.start();
  await renderAll();await applyRoute(parseHash());
}
