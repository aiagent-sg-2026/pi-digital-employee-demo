import { runOperationsEmployeeTask } from "../core";
import { createDemoGatewayClient, DemoGatewayError, DemoGatewayRateLimitError } from "../shared/demo-gateway-client";

type WorkflowResult = Awaited<ReturnType<typeof runOperationsEmployeeTask>>;
type WorkStatus = "Running" | "Completed" | "Needs Review" | "Failed";
interface WorkItem { id:string; task:string; customerQuery:string; context:string; status:WorkStatus; progress:string; result?:WorkflowResult; aiHtml?:string; gatewayText?:string }
interface InboxItem { id:string; title:string; detail:string }

const form=document.querySelector<HTMLFormElement>("#task-form")!;
const taskInput=document.querySelector<HTMLInputElement>("#task-input")!;
const assignButton=document.querySelector<HTMLButtonElement>("#assign-task")!;
const quickTaskButtons=[...document.querySelectorAll<HTMLButtonElement>(".quick-task")];
const workBody=document.querySelector<HTMLTableSectionElement>("#work-body")!;
const workCount=document.querySelector<HTMLElement>("#work-count")!;
const detailState=document.querySelector<HTMLElement>("#detail-state")!;
const businessResult=document.querySelector<HTMLElement>("#business-result")!;
const businessMeta=document.querySelector<HTMLElement>("#business-meta")!;
const verificationList=document.querySelector<HTMLElement>("#verification-list")!;
const verificationCount=document.querySelector<HTMLElement>("#verification-count")!;
const rawEvidence=document.querySelector<HTMLPreElement>("#raw-evidence")!;
const copyEvidence=document.querySelector<HTMLButtonElement>("#copy-evidence")!;
const viewEvidence=document.querySelector<HTMLButtonElement>("#view-evidence")!;
const aiSummary=document.querySelector<HTMLElement>("#ai-summary")!;
const gatewayStatus=document.querySelector<HTMLElement>("#gateway-status")!;
const gatewayConnection=document.querySelector<HTMLElement>("#gateway-connection")!;
const currentActivity=document.querySelector<HTMLElement>("#current-activity")!;
const employeeMode=document.querySelector<HTMLElement>("#employee-mode")!;
const lastUpdated=document.querySelector<HTMLElement>("#last-updated")!;
const inboxList=document.querySelector<HTMLElement>("#inbox-list")!;
const inboxBadge=document.querySelector<HTMLElement>("#inbox-badge")!;
const approvalBadge=document.querySelector<HTMLElement>("#approval-badge")!;
const kpiCompleted=document.querySelector<HTMLElement>("#kpi-completed")!;
const kpiCustomers=document.querySelector<HTMLElement>("#kpi-customers")!;
const kpiOutstanding=document.querySelector<HTMLElement>("#kpi-outstanding")!;
const kpiAttention=document.querySelector<HTMLElement>("#kpi-attention")!;
const briefTitle=document.querySelector<HTMLElement>("#brief-title")!;
const briefCopy=document.querySelector<HTMLElement>("#brief-copy")!;
const briefList=document.querySelector<HTMLElement>("#brief-list")!;
const briefNote=document.querySelector<HTMLElement>("#brief-note")!;

const gateway=createDemoGatewayClient({origin:window.location.origin});
const work:WorkItem[]=[];
const inbox:InboxItem[]=[];
const handledCustomers=new Set<string>();
let completedTasks=0;
let outstandingReviewed=0;
let running=false;
let latestEvidence="";

const capabilityLabels:Record<string,{title:string;detail:string}>={
  "customer.lookup":{title:"Customer identified",detail:"Matched the business customer record."},
  "invoice.review":{title:"Outstanding invoices reviewed",detail:"Applied payments, credits, and duplicate suppression."},
  "payment.list":{title:"Payments reconciled",detail:"Checked canonical payment records."},
  "follow-up.evaluate":{title:"Follow-up policy evaluated",detail:"Prepared the appropriate follow-up actions."},
};

function escapeHtml(value:string):string{return value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]!))}
function inlineMarkdown(value:string):string{return escapeHtml(value).replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>")}
function renderSafeMarkdown(value:string):string{
  const lines=value.replace(/\r\n/g,"\n").split("\n");let html="";let list:"ul"|"ol"|null=null;
  const close=()=>{if(list){html+=`</${list}>`;list=null}};
  for(const raw of lines){const line=raw.trim();if(!line){close();continue}
    if(line.startsWith("### ")||line.startsWith("## ")||line.startsWith("# ")){close();const text=line.replace(/^#{1,3}\s+/,"");html+=`<h3>${inlineMarkdown(text)}</h3>`;continue}
    const u=line.match(/^[-*]\s+(.+)$/);if(u){if(list!=="ul"){close();html+="<ul>";list="ul"}html+=`<li>${inlineMarkdown(u[1]!)}</li>`;continue}
    const o=line.match(/^\d+[.)]\s+(.+)$/);if(o){if(list!=="ol"){close();html+="<ol>";list="ol"}html+=`<li>${inlineMarkdown(o[1]!)}</li>`;continue}
    close();html+=`<p>${inlineMarkdown(line)}</p>`;
  }close();return html||"<p>No summary returned.</p>";
}
function extractAssistantText(body:unknown):string{if(!body||typeof body!=="object")return"";const choices=(body as{choices?:unknown}).choices;if(!Array.isArray(choices))return"";const first=choices[0] as{message?:{content?:unknown}}|undefined;return typeof first?.message?.content==="string"?first.message.content:""}
function deriveCustomerQuery(task:string):string{if(/\bacme\b/i.test(task))return"ACME";if(/unknown|no[- ]?such|exception/i.test(task))return"NO-SUCH-CUSTOMER";return task.trim()}
function taskTitle(task:string):string{const n=task.replace(/\s+/g," ").trim();return n.length>62?`${n.slice(0,59)}…`:n}
function statusClass(status:WorkStatus):string{return status==="Completed"?"completed":status==="Needs Review"?"review":status==="Failed"?"failed":"running"}
function renderWorkQueue():void{
  workCount.textContent=`${work.length} ${work.length===1?"task":"tasks"}`;
  if(!work.length){workBody.innerHTML='<tr><td class="empty-row" colspan="5">Assign a task to start Alex\'s work queue.</td></tr>';return}
  workBody.innerHTML=work.map(item=>`<tr><td><div class="task-name">${escapeHtml(taskTitle(item.task))}</div><div class="task-context">${escapeHtml(item.customerQuery)}</div></td><td>${escapeHtml(item.context)}</td><td><span class="status-chip ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td><td class="progress-copy">${escapeHtml(item.progress)}</td><td><button class="link-btn view-task" type="button" data-task-id="${escapeHtml(item.id)}">View</button></td></tr>`).join("");
}
function renderActivity(evidence:readonly{type:string}[],state:string):void{
  if(!evidence.length){currentActivity.innerHTML=`<li><span class="activity-icon ${state==="RUNNING"?"active":"idle"}">${state==="RUNNING"?"●":"○"}</span><div class="activity-copy"><strong>${state==="RUNNING"?"Working on assigned task":"Waiting for work"}</strong><small>${state==="RUNNING"?"Alex is executing business capabilities.":"Assign a task to Alex."}</small></div></li>`;return}
  const steps=evidence.filter(i=>i.type!=="verification"&&i.type!=="execution.error");
  currentActivity.innerHTML=steps.map(item=>{const label=capabilityLabels[item.type]??{title:item.type,detail:"Business capability completed."};return `<li><span class="activity-icon done">✓</span><div class="activity-copy"><strong>${escapeHtml(label.title)}</strong><small>${escapeHtml(label.detail)}</small></div></li>`}).join("");
}
function renderVerification(result:WorkflowResult):void{
  const checks=result.verification.checks;const passed=checks.filter(c=>c.passed).length;
  verificationCount.textContent=`${passed} / ${checks.length} checks passed`;
  verificationList.innerHTML=checks.map(c=>`<li data-pass="${c.passed}"><span class="check-icon">${c.passed?"✓":"!"}</span><div><strong>${escapeHtml(c.id)}</strong>${c.message?`<div style="color:#6b7280;margin-top:2px">${escapeHtml(c.message)}</div>`:""}</div></li>`).join("");
}
function renderBusinessResult(result:WorkflowResult):void{
  if(!result.summary){businessMeta.textContent=result.task.state==="NEEDS_REVIEW"?"Decision required":"Task failed";businessResult.innerHTML=`<div class="attention-box">${result.task.state==="NEEDS_REVIEW"?"Alex could not verify a unique customer identity. Review the inbox item before business work continues.":"Alex could not complete this task. Review the evidence for the failure reason."}</div>`;return}
  businessMeta.textContent=`${result.summary.outstandingInvoices} outstanding invoices · ${result.followUps.length} follow-up actions`;
  businessResult.innerHTML=`<div class="result-grid"><div class="result-cell"><span>Customer</span><strong>${escapeHtml(result.summary.customer)}</strong></div><div class="result-cell"><span>Outstanding invoices</span><strong>${result.summary.outstandingInvoices}</strong></div><div class="result-cell"><span>Outstanding total</span><strong>${result.summary.currency} ${result.summary.outstandingTotal.toLocaleString("en-SG")}</strong></div><div class="result-cell"><span>Follow-up actions</span><strong>${result.followUps.length}</strong></div></div>`;
}
function setDetailState(state:string):void{const label=state==="NEEDS_REVIEW"?"Needs Review":state.charAt(0)+state.slice(1).toLowerCase();detailState.textContent=label;detailState.className=`status-chip ${state==="COMPLETED"?"completed":state==="NEEDS_REVIEW"?"review":state==="FAILED"?"failed":"running"}`}
function renderInbox():void{
  inboxBadge.textContent=String(inbox.length);inboxBadge.classList.toggle("attention",inbox.length>0);kpiAttention.textContent=String(inbox.length);
  inboxList.innerHTML=inbox.length?inbox.map(i=>`<li><div class="inbox-copy"><strong>${escapeHtml(i.title)}</strong><small>${escapeHtml(i.detail)}</small></div><span class="status-chip review">Review</span></li>`).join(""):'<li class="approval-empty">No items need attention.</li>';
}
function updateKpis():void{kpiCompleted.textContent=String(completedTasks);kpiCustomers.textContent=String(handledCustomers.size);kpiOutstanding.textContent=`SGD ${outstandingReviewed.toLocaleString("en-SG")}`;kpiAttention.textContent=String(inbox.length)}
function updateBrief():void{
  if(!work.length){briefTitle.textContent="Ready for work";briefCopy.textContent="No tasks have been assigned in this session yet.";briefList.innerHTML="";briefNote.textContent="Available";return}
  briefTitle.textContent=inbox.length?"One item needs your attention":"Operations are on track";
  briefCopy.textContent=inbox.length?"Alex completed what could be verified and brought the unresolved item back to you.":"Alex has completed the assigned work in this session with deterministic verification.";
  briefList.innerHTML=`<li>✓ <b>${completedTasks}</b> completed</li><li>✓ <b>${handledCustomers.size}</b> customers handled</li><li>✓ <b>SGD ${outstandingReviewed.toLocaleString("en-SG")}</b> reviewed</li><li>${inbox.length?"⚠":"✓"} <b>${inbox.length}</b> need attention</li>`;
  briefNote.textContent=inbox.length?"Manager review needed":"On track";briefNote.style.background=inbox.length?"#fff8e6":"#ecfdf5";briefNote.style.color=inbox.length?"#9a6700":"#137a50";
}
function updateEmployeeState(mode:string):void{employeeMode.textContent=mode;lastUpdated.textContent=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
function rememberAi(item?:WorkItem):void{if(item){item.aiHtml=aiSummary.innerHTML;item.gatewayText=gatewayStatus.textContent??""}}
async function createAiSummary(result:WorkflowResult,item?:WorkItem):Promise<void>{
  if(result.task.state!=="COMPLETED"||!result.summary){aiSummary.textContent="Skipped because deterministic verification did not reach COMPLETED.";gatewayStatus.textContent="AI summary skipped. Business completion remains verification-gated.";rememberAi(item);return}
  gatewayStatus.textContent="Preparing a manager-readable summary from verified facts…";
  try{const response=await gateway.chat({messages:[{role:"system",content:"You are Alex, an operations employee. Briefly report only the verified business facts provided. Use concise manager-friendly Markdown. Do not invent amounts, invoices, actions, policies, or completion claims."},{role:"user",content:JSON.stringify({taskState:result.task.state,summary:result.summary,followUps:result.followUps,verification:result.verification})}]});const text=extractAssistantText(response);aiSummary.innerHTML=renderSafeMarkdown(text||"Verified work completed; no additional summary was returned.");gatewayStatus.textContent="Demo Gateway connected · demo-auto · verified facts only";gatewayConnection.textContent="Connected";rememberAi(item)}
  catch(error){gatewayConnection.textContent="Unavailable";if(error instanceof DemoGatewayRateLimitError)gatewayStatus.textContent=error.message;else if(error instanceof DemoGatewayError&&error.status===403)gatewayStatus.textContent=`Gateway Origin is not enabled for ${window.location.origin}. Verified business work still completed locally.`;else gatewayStatus.textContent=`AI summary unavailable: ${error instanceof Error?error.message:String(error)}`;aiSummary.textContent="Verified business result is available above; AI manager summary is temporarily unavailable.";rememberAi(item)}
}
function viewTask(id:string):void{const item=work.find(c=>c.id===id);if(!item?.result)return;setDetailState(item.result.task.state);renderBusinessResult(item.result);renderVerification(item.result);renderActivity(item.result.evidence,item.result.task.state);latestEvidence=JSON.stringify(item.result.evidence,null,2);rawEvidence.textContent=latestEvidence;aiSummary.innerHTML=item.aiHtml??"<p>Summary not cached for this task.</p>";gatewayStatus.textContent=item.gatewayText??"Task summary status unavailable.";document.querySelector("#task-detail")?.scrollIntoView({behavior:"smooth",block:"start"})}
async function assignTask(task:string):Promise<void>{
  if(running)return;const cleanTask=task.trim();if(!cleanTask)return;running=true;assignButton.disabled=true;quickTaskButtons.forEach(b=>{b.disabled=true});
  const customerQuery=deriveCustomerQuery(cleanTask);const item:WorkItem={id:`work-${Date.now()}`,task:cleanTask,customerQuery,context:customerQuery==="ACME"?"ACME Trading Pte Ltd":"Customer review",status:"Running",progress:"Working…"};work.unshift(item);renderWorkQueue();
  setDetailState("RUNNING");businessMeta.textContent="Alex is working";businessResult.innerHTML='<p class="approval-empty">Alex is resolving the customer and reviewing receivables.</p>';verificationCount.textContent="Waiting for verification";verificationList.innerHTML='<li><span class="check-icon">·</span><div>Verification starts after business capabilities finish.</div></li>';rawEvidence.textContent="";aiSummary.textContent="Waiting for deterministic verification.";gatewayStatus.textContent="Gateway not called until verification passes.";renderActivity([],"RUNNING");updateEmployeeState("Working");
  try{
    const result=await runOperationsEmployeeTask("browser",{customerQuery});item.result=result;item.status=result.task.state==="COMPLETED"?"Completed":result.task.state==="NEEDS_REVIEW"?"Needs Review":"Failed";item.progress=result.task.state==="COMPLETED"?"Verified · 4 steps":result.task.state==="NEEDS_REVIEW"?"Manager review required":"Execution stopped";
    setDetailState(result.task.state);renderBusinessResult(result);renderVerification(result);renderActivity(result.evidence,result.task.state);latestEvidence=JSON.stringify(result.evidence,null,2);rawEvidence.textContent=latestEvidence;
    if(result.task.state==="COMPLETED"&&result.summary){completedTasks+=1;handledCustomers.add(result.summary.customerId);outstandingReviewed+=result.summary.outstandingTotal}
    else if(result.task.state==="NEEDS_REVIEW"){inbox.unshift({id:`inbox-${Date.now()}`,title:"Customer identity needs review",detail:`Alex could not verify a unique customer for: ${cleanTask}`})}
    renderWorkQueue();renderInbox();updateKpis();updateBrief();updateEmployeeState(result.task.state==="COMPLETED"?"Available":result.task.state==="NEEDS_REVIEW"?"Waiting on manager":"Blocked");await createAiSummary(result,item);
  }catch(error){item.status="Failed";item.progress="Execution stopped";renderWorkQueue();setDetailState("FAILED");businessMeta.textContent="Execution failed";businessResult.innerHTML=`<div class="attention-box">${escapeHtml(error instanceof Error?error.message:String(error))}</div>`;updateEmployeeState("Blocked")}
  finally{running=false;assignButton.disabled=false;quickTaskButtons.forEach(b=>{b.disabled=false})}
}

form.addEventListener("submit",event=>{event.preventDefault();void assignTask(taskInput.value)});
quickTaskButtons.forEach(button=>button.addEventListener("click",()=>{taskInput.value=button.dataset.task??"";void assignTask(taskInput.value)}));
workBody.addEventListener("click",event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>(".view-task");if(button?.dataset.taskId)viewTask(button.dataset.taskId)});
copyEvidence.addEventListener("click",async()=>{if(!latestEvidence)return;await navigator.clipboard.writeText(latestEvidence);copyEvidence.textContent="Copied";setTimeout(()=>{copyEvidence.textContent="Copy JSON"},1200)});
viewEvidence.addEventListener("click",()=>{const details=document.querySelector<HTMLDetailsElement>("#evidence-details");if(details){details.open=true;details.scrollIntoView({behavior:"smooth",block:"nearest"})}});
document.querySelector("#new-task")?.addEventListener("click",()=>{taskInput.focus();taskInput.select()});
document.querySelector("#search-task")?.addEventListener("click",()=>{taskInput.focus();taskInput.select()});
document.querySelector("#open-inbox")?.addEventListener("click",()=>document.querySelector("#inbox")?.scrollIntoView({behavior:"smooth"}));
document.querySelector("#open-settings")?.addEventListener("click",()=>document.querySelector("#employee-status")?.scrollIntoView({behavior:"smooth"}));

approvalBadge.textContent="0";renderWorkQueue();renderInbox();updateKpis();updateBrief();void assignTask(taskInput.value);
