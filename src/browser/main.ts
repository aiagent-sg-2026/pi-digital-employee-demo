import { MOCK_AS_OF_DATE, runOperationsEmployeeTask } from "../core";
import { createDemoGatewayClient, DemoGatewayError, DemoGatewayRateLimitError } from "../shared/demo-gateway-client";
import { hydrateSvgIcons, svgIcon } from "./icons";
import { routeDashboardTask, type RoutedTask, type TaskIntent } from "./task-router";
import { clearDemoLedger, migrateLegacyLocalStorageLedger, readDemoLedger, writeDemoLedger } from "./demo-ledger";

type WorkflowResult = Awaited<ReturnType<typeof runOperationsEmployeeTask>>;
type WorkStatus = "Running" | "Completed" | "Needs Review" | "Needs Approval" | "Failed" | "Blocked";
type ApprovalState = "pending" | "approved" | "rejected";

interface WorkItem {
  id: string;
  task: string;
  customerQuery: string;
  context: string;
  intent: TaskIntent;
  status: WorkStatus;
  progress: string;
  createdAt: string;
  result?: WorkflowResult;
  aiHtml?: string;
  gatewayText?: string;
  approvalId?: string;
}
interface InboxItem { id: string; taskId: string; title: string; detail: string; }
interface ApprovalItem {
  id: string;
  taskId: string;
  state: ApprovalState;
  title: string;
  what: string;
  why: string;
  affected: string;
  impact: string;
}
interface Ledger { version: 1; work: WorkItem[]; inbox: InboxItem[]; approvals: ApprovalItem[]; }



const form = document.querySelector<HTMLFormElement>("#task-form")!;
const taskInput = document.querySelector<HTMLInputElement>("#task-input")!;
const assignButton = document.querySelector<HTMLButtonElement>("#assign-task")!;
const quickTaskButtons = [...document.querySelectorAll<HTMLButtonElement>(".quick-task")];
const workBody = document.querySelector<HTMLTableSectionElement>("#work-body")!;
const workCards = document.querySelector<HTMLElement>("#work-cards")!;
const workCount = document.querySelector<HTMLElement>("#work-count")!;
const clearHistoryButton = document.querySelector<HTMLButtonElement>("#clear-history")!;
const detailState = document.querySelector<HTMLElement>("#detail-state")!;
const businessResult = document.querySelector<HTMLElement>("#business-result")!;
const businessMeta = document.querySelector<HTMLElement>("#business-meta")!;
const verificationList = document.querySelector<HTMLElement>("#verification-list")!;
const verificationCount = document.querySelector<HTMLElement>("#verification-count")!;
const rawEvidence = document.querySelector<HTMLPreElement>("#raw-evidence")!;
const copyEvidence = document.querySelector<HTMLButtonElement>("#copy-evidence")!;
const viewEvidence = document.querySelector<HTMLButtonElement>("#view-evidence")!;
const evidenceDetails = document.querySelector<HTMLDetailsElement>("#evidence-details")!;
const aiSummary = document.querySelector<HTMLElement>("#ai-summary")!;
const gatewayStatus = document.querySelector<HTMLElement>("#gateway-status")!;
const gatewayConnection = document.querySelector<HTMLElement>("#gateway-connection")!;
const currentActivity = document.querySelector<HTMLElement>("#current-activity")!;
const employeeMode = document.querySelector<HTMLElement>("#employee-mode")!;
const lastUpdated = document.querySelector<HTMLElement>("#last-updated")!;
const inboxList = document.querySelector<HTMLElement>("#inbox-list")!;
const inboxBadge = document.querySelector<HTMLElement>("#inbox-badge")!;
const approvalBadge = document.querySelector<HTMLElement>("#approval-badge")!;
const approvalList = document.querySelector<HTMLElement>("#approval-list")!;
const kpiCompleted = document.querySelector<HTMLElement>("#kpi-completed")!;
const kpiCustomers = document.querySelector<HTMLElement>("#kpi-customers")!;
const kpiOutstanding = document.querySelector<HTMLElement>("#kpi-outstanding")!;
const kpiAttention = document.querySelector<HTMLElement>("#kpi-attention")!;
const briefTitle = document.querySelector<HTMLElement>("#brief-title")!;
const briefCopy = document.querySelector<HTMLElement>("#brief-copy")!;
const briefList = document.querySelector<HTMLElement>("#brief-list")!;
const briefNote = document.querySelector<HTMLElement>("#brief-note")!;
const composerFeedback = document.querySelector<HTMLElement>("#composer-feedback")!;
const datasetSnapshot = document.querySelector<HTMLElement>("#dataset-snapshot")!;
const businessDataDetail = document.querySelector<HTMLElement>("#business-data-detail")!;
const trustDrawer = document.querySelector<HTMLElement>("#trust-drawer")!;
const drawerOverlay = document.querySelector<HTMLElement>("#drawer-overlay")!;
const openTrustDrawerButton = document.querySelector<HTMLButtonElement>("#open-trust-drawer")!;
const closeTrustDrawerButton = document.querySelector<HTMLButtonElement>("#close-trust-drawer")!;

hydrateSvgIcons();
const gateway = createDemoGatewayClient({ origin: window.location.origin });
const work: WorkItem[] = [];
const inbox: InboxItem[] = [];
const approvals: ApprovalItem[] = [];
let running = false;
let latestEvidence = "";

const capabilityLabels: Record<string, { title: string; detail: string }> = {
  "customer.lookup": { title: "Customer identified", detail: "Matched the business customer record." },
  "invoice.review": { title: "Outstanding invoices reviewed", detail: "Applied payments, credits, and duplicate suppression." },
  "payment.list": { title: "Payments reconciled", detail: "Checked canonical payment records." },
  "follow-up.evaluate": { title: "Follow-up policy evaluated", detail: "Prepared the appropriate follow-up actions." },
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]!));
}
function inlineMarkdown(value: string): string {
  return escapeHtml(value).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}
function renderSafeMarkdown(value: string): string {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let list: "ul" | "ol" | null = null;
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    if (/^#{1,3}\s+/.test(line)) { closeList(); html += `<h3>${inlineMarkdown(line.replace(/^#{1,3}\s+/, ""))}</h3>`; continue; }
    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) { if (list !== "ul") { closeList(); html += "<ul>"; list = "ul"; } html += `<li>${inlineMarkdown(unordered[1]!)}</li>`; continue; }
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) { if (list !== "ol") { closeList(); html += "<ol>"; list = "ol"; } html += `<li>${inlineMarkdown(ordered[1]!)}</li>`; continue; }
    closeList(); html += `<p>${inlineMarkdown(line)}</p>`;
  }
  closeList();
  return html || "<p>No summary returned.</p>";
}
function extractAssistantText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return "";
  const first = choices[0] as { message?: { content?: unknown } } | undefined;
  return typeof first?.message?.content === "string" ? first.message.content : "";
}

function formatSnapshot(): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${MOCK_AS_OF_DATE}T00:00:00Z`));
}
function taskTitle(task: string): string {
  const normalized = task.replace(/\s+/g, " ").trim();
  return normalized.length > 72 ? `${normalized.slice(0, 69)}…` : normalized;
}
function statusClass(status: WorkStatus): string {
  if (status === "Completed") return "completed";
  if (status === "Needs Review") return "review";
  if (status === "Needs Approval") return "approval";
  if (status === "Failed") return "failed";
  if (status === "Blocked") return "blocked";
  return "running";
}

let ledgerWriteQueue = Promise.resolve();
function snapshotLedger(): Ledger {
  return structuredClone({ version: 1, work, inbox, approvals } satisfies Ledger);
}
function saveLedger(): void {
  const ledger = snapshotLedger();
  ledgerWriteQueue = ledgerWriteQueue
    .then(() => writeDemoLedger(ledger))
    .catch((error) => {
      console.error("Demo IndexedDB ledger save failed", error);
    });
}
async function loadLedger(): Promise<void> {
  try {
    await migrateLegacyLocalStorageLedger<Ledger>();
    const ledger = await readDemoLedger<Partial<Ledger>>();
    if (!ledger || ledger.version !== 1) return;
    if (Array.isArray(ledger.work)) work.push(...ledger.work);
    if (Array.isArray(ledger.inbox)) inbox.push(...ledger.inbox);
    if (Array.isArray(ledger.approvals)) approvals.push(...ledger.approvals);
  } catch (error) {
    console.error("Demo IndexedDB ledger load failed; continuing in memory only", error);
  }
}

function metrics() {
  const completed = work.filter((item) => item.status === "Completed" && item.result?.summary);
  const customers = new Set(completed.map((item) => item.result!.summary!.customerId));
  const reviewed = new Map<string, number>();
  for (const item of completed) {
    const summary = item.result!.summary!;
    reviewed.set(`${summary.customerId}:${MOCK_AS_OF_DATE}`, summary.outstandingTotal);
  }
  const pendingApprovals = approvals.filter((approval) => approval.state === "pending").length;
  return {
    completed: completed.length,
    customers: customers.size,
    outstanding: [...reviewed.values()].reduce((sum, value) => sum + value, 0),
    attention: inbox.length + pendingApprovals,
    pendingApprovals,
  };
}
function renderKpis(): void {
  const value = metrics();
  kpiCompleted.textContent = String(value.completed);
  kpiCustomers.textContent = String(value.customers);
  kpiOutstanding.textContent = `SGD ${value.outstanding.toLocaleString("en-SG")}`;
  kpiAttention.textContent = String(value.attention);
}
function renderWorkQueue(): void {
  workCount.textContent = `${work.length} ${work.length === 1 ? "task" : "tasks"}`;
  if (!work.length) {
    workBody.innerHTML = '<tr><td class="empty-row" colspan="5">Assign a task to start Alex\'s work queue.</td></tr>';
    workCards.innerHTML = '<div class="approval-empty">No tasks yet.</div>';
    return;
  }
  workBody.innerHTML = work.map((item) => `<tr>
    <td><div class="task-name">${escapeHtml(taskTitle(item.task))}</div><div class="task-context">${escapeHtml(item.customerQuery || item.intent)}</div></td>
    <td>${escapeHtml(item.context)}</td>
    <td><span class="status-chip ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td>
    <td class="progress-copy">${escapeHtml(item.progress)}</td>
    <td><button class="link-btn view-task" type="button" data-task-id="${escapeHtml(item.id)}">View</button></td>
  </tr>`).join("");
  workCards.innerHTML = work.map((item) => `<article class="work-card">
    <div class="work-card-head"><h3>${escapeHtml(taskTitle(item.task))}</h3><span class="status-chip ${statusClass(item.status)}">${escapeHtml(item.status)}</span></div>
    <dl><dt>Context</dt><dd>${escapeHtml(item.context)}</dd><dt>Progress</dt><dd>${escapeHtml(item.progress)}</dd><dt>Created</dt><dd>${new Date(item.createdAt).toLocaleString()}</dd></dl>
    <button class="link-btn view-task" type="button" data-task-id="${escapeHtml(item.id)}">View task</button>
  </article>`).join("");
}
function renderInbox(): void {
  inboxBadge.textContent = String(inbox.length);
  inboxBadge.classList.toggle("attention", inbox.length > 0);
  inboxList.innerHTML = inbox.length
    ? inbox.map((item) => `<li><div class="inbox-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div><span class="status-chip review">Review</span></li>`).join("")
    : '<li class="approval-empty">No items need attention.</li>';
}
function renderApprovals(): void {
  const pending = approvals.filter((approval) => approval.state === "pending");
  approvalBadge.textContent = String(pending.length);
  approvalBadge.classList.toggle("attention", pending.length > 0);
  if (!approvals.length) {
    approvalList.innerHTML = '<p><strong>No approvals pending.</strong></p><p>Assign the “Demo approval flow” task to test Approval and Resume without any external write action.</p>';
    return;
  }
  approvalList.innerHTML = approvals.map((approval) => `<article class="approval-scenario" data-approval-id="${approval.id}">
    <div><span class="status-chip ${approval.state === "pending" ? "approval" : approval.state === "approved" ? "completed" : "blocked"}">Demo Scenario · ${approval.state}</span></div>
    <h3>${escapeHtml(approval.title)}</h3>
    <ul class="approval-facts"><li><b>What will happen:</b> ${escapeHtml(approval.what)}</li><li><b>Why:</b> ${escapeHtml(approval.why)}</li><li><b>Affected:</b> ${escapeHtml(approval.affected)}</li><li><b>Business impact:</b> ${escapeHtml(approval.impact)}</li></ul>
    ${approval.state === "pending" ? `<div class="approval-actions"><button class="primary-btn approval-action" data-action="approve" data-approval-id="${approval.id}" type="button">Approve & Resume</button><button class="secondary-btn approval-action" data-action="reject" data-approval-id="${approval.id}" type="button">Reject</button></div>` : `<div class="approval-state">Decision recorded: ${approval.state}.</div>`}
  </article>`).join("");
}
function renderBrief(): void {
  const value = metrics();
  if (!work.length) {
    briefTitle.textContent = "Ready for work";
    briefCopy.textContent = "No tasks have been assigned in this demo ledger yet.";
    briefList.innerHTML = "";
    briefNote.textContent = "Available";
    return;
  }
  briefTitle.textContent = value.attention ? `${value.attention} item${value.attention === 1 ? "" : "s"} need your attention` : "Operations are on track";
  briefCopy.textContent = value.attention ? "Alex completed what could be verified and handed unresolved decisions back to you." : "Alex has completed the assigned work with deterministic verification.";
  briefList.innerHTML = `<li>${svgIcon("check")}<b>${value.completed}</b> completed</li><li>${svgIcon("check")}<b>${value.customers}</b> customers handled</li><li>${svgIcon("check")}<b>SGD ${value.outstanding.toLocaleString("en-SG")}</b> unique snapshot reviewed</li><li>${svgIcon(value.attention ? "alert" : "check")}<b>${value.attention}</b> need attention</li>`;
  briefNote.textContent = value.attention ? "Manager review needed" : "On track";
}
function renderDashboard(): void {
  renderWorkQueue();
  renderInbox();
  renderApprovals();
  renderKpis();
  renderBrief();
}

function renderActivity(evidence: readonly { type: string }[], state: string): void {
  if (!evidence.length) {
    currentActivity.innerHTML = `<li><span class="activity-icon ${state === "RUNNING" ? "active" : "idle"}">${svgIcon(state === "RUNNING" ? "circle-dot" : "circle")}</span><div class="activity-copy"><strong>${state === "RUNNING" ? "Working on assigned task" : "Waiting for work"}</strong><small>${state === "RUNNING" ? "Alex is executing business capabilities." : "Assign a task to Alex."}</small></div></li>`;
    return;
  }
  const steps = evidence.filter((item) => item.type !== "verification" && item.type !== "execution.error");
  currentActivity.innerHTML = steps.map((item) => {
    const label = capabilityLabels[item.type] ?? { title: item.type, detail: "Business capability completed." };
    return `<li><span class="activity-icon done">${svgIcon("check")}</span><div class="activity-copy"><strong>${escapeHtml(label.title)}</strong><small>${escapeHtml(label.detail)}</small></div></li>`;
  }).join("");
}
function renderVerification(result: WorkflowResult): void {
  const checks = result.verification.checks;
  const passed = checks.filter((check) => check.passed).length;
  verificationCount.textContent = `${passed} / ${checks.length} checks passed`;
  verificationList.innerHTML = checks.map((check) => `<li data-pass="${check.passed}"><span class="check-icon">${svgIcon(check.passed ? "check" : "x")}</span><div><strong>${escapeHtml(check.id)}</strong>${check.message ? `<div style="color:#6b7280;margin-top:2px">${escapeHtml(check.message)}</div>` : ""}</div></li>`).join("");
}
function renderBusinessResult(result: WorkflowResult): void {
  if (!result.summary) {
    businessMeta.textContent = result.task.state === "NEEDS_REVIEW" ? "Decision required" : "Task failed";
    businessResult.innerHTML = `<div class="attention-box">${result.task.state === "NEEDS_REVIEW" ? "Alex could not verify a unique customer identity. Review the Inbox before business work continues." : "Alex could not complete this task. Review the evidence for the failure reason."}</div>`;
    return;
  }
  businessMeta.textContent = `${result.summary.outstandingInvoices} outstanding invoices · ${result.followUps.length} follow-up actions`;
  businessResult.innerHTML = `<div class="result-grid"><div class="result-cell"><span>Customer</span><strong>${escapeHtml(result.summary.customer)}</strong></div><div class="result-cell"><span>Outstanding invoices</span><strong>${result.summary.outstandingInvoices}</strong></div><div class="result-cell"><span>Outstanding total</span><strong>${result.summary.currency} ${result.summary.outstandingTotal.toLocaleString("en-SG")}</strong></div><div class="result-cell"><span>Follow-up actions</span><strong>${result.followUps.length}</strong></div></div>`;
}
function setDetailState(state: string): void {
  const labels: Record<string, string> = { CREATED: "Ready", RUNNING: "Running", COMPLETED: "Completed", NEEDS_REVIEW: "Needs Review", FAILED: "Failed", BLOCKED: "Blocked", NEEDS_APPROVAL: "Needs Approval" };
  detailState.textContent = labels[state] ?? state;
  detailState.className = `status-chip ${state === "COMPLETED" ? "completed" : state === "NEEDS_REVIEW" ? "review" : state === "NEEDS_APPROVAL" ? "approval" : state === "FAILED" ? "failed" : state === "BLOCKED" ? "blocked" : "running"}`;
}
function updateEmployeeState(mode: string): void {
  employeeMode.textContent = mode;
  lastUpdated.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function resetTaskWorkspace(clearComposer = true, focusComposer = clearComposer): void {
  if (clearComposer) taskInput.value = "";
  composerFeedback.textContent = "";
  setDetailState("CREATED");
  businessMeta.textContent = "No verified result yet";
  businessResult.innerHTML = '<p class="approval-empty">Assign a task to see Alex\'s verified business result.</p>';
  verificationCount.textContent = "0 / 0";
  verificationList.innerHTML = `<li><span class="check-icon">${svgIcon("circle")}</span><div>Waiting for verified evidence.</div></li>`;
  latestEvidence = "";
  rawEvidence.textContent = "";
  evidenceDetails.open = false;
  aiSummary.textContent = "Generated only after deterministic verification passes.";
  gatewayStatus.textContent = "Demo Gateway not called yet.";
  renderActivity([], "IDLE");
  updateEmployeeState("Available");
  if (focusComposer) taskInput.focus();
}
function rememberAi(item?: WorkItem): void {
  if (!item) return;
  item.aiHtml = aiSummary.innerHTML;
  item.gatewayText = gatewayStatus.textContent ?? "";
  saveLedger();
}
async function createAiSummary(result: WorkflowResult, item?: WorkItem): Promise<void> {
  if (result.task.state !== "COMPLETED" || !result.summary) {
    aiSummary.textContent = "AI summary skipped because deterministic verification did not reach COMPLETED.";
    gatewayStatus.textContent = "Business completion remains verification-gated.";
    rememberAi(item);
    return;
  }
  aiSummary.textContent = "Verification passed · Preparing manager summary…";
  gatewayStatus.textContent = "Preparing manager summary from verified facts only…";
  try {
    const response = await gateway.chat({ messages: [
      { role: "system", content: "You are Alex, an operations employee. Briefly report only the verified business facts provided. Use concise manager-friendly Markdown. Do not invent amounts, invoices, actions, policies, or completion claims." },
      { role: "user", content: JSON.stringify({ taskState: result.task.state, summary: result.summary, followUps: result.followUps, verification: result.verification }) },
    ] });
    const text = extractAssistantText(response);
    aiSummary.innerHTML = renderSafeMarkdown(text || "Verified work completed; no additional summary was returned.");
    gatewayStatus.textContent = "Demo Gateway connected · demo-auto · verified facts only";
    gatewayConnection.textContent = "Connected";
  } catch (error) {
    gatewayConnection.textContent = "Unavailable";
    if (error instanceof DemoGatewayRateLimitError) gatewayStatus.textContent = error.message;
    else if (error instanceof DemoGatewayError && error.status === 403) gatewayStatus.textContent = `Gateway Origin is not enabled for ${window.location.origin}. Verified business work still completed locally.`;
    else gatewayStatus.textContent = `AI summary unavailable: ${error instanceof Error ? error.message : String(error)}`;
    aiSummary.textContent = "Verified business result is available above; AI manager summary is temporarily unavailable.";
  }
  rememberAi(item);
}
function viewTask(id: string): void {
  const item = work.find((candidate) => candidate.id === id);
  if (!item) return;
  if (!item.result) {
    setDetailState(item.status === "Needs Approval" ? "NEEDS_APPROVAL" : item.status === "Blocked" ? "BLOCKED" : "RUNNING");
    businessMeta.textContent = item.status;
    businessResult.innerHTML = `<div class="attention-box">${escapeHtml(item.progress)}</div>`;
    verificationCount.textContent = "0 / 0";
    verificationList.innerHTML = `<li><span class="check-icon">${svgIcon("circle")}</span><div>No completed verification evidence for this task.</div></li>`;
    aiSummary.textContent = item.aiHtml ? "" : "Summary unavailable until the task completes verification.";
    if (item.aiHtml) aiSummary.innerHTML = item.aiHtml;
    gatewayStatus.textContent = item.gatewayText ?? "Gateway not called for this task.";
    renderActivity([], item.status === "Running" ? "RUNNING" : "IDLE");
  } else {
    setDetailState(item.result.task.state);
    renderBusinessResult(item.result);
    renderVerification(item.result);
    renderActivity(item.result.evidence, item.result.task.state);
    latestEvidence = JSON.stringify(item.result.evidence, null, 2);
    rawEvidence.textContent = latestEvidence;
    aiSummary.innerHTML = item.aiHtml ?? "<p>Summary not cached for this task.</p>";
    gatewayStatus.textContent = item.gatewayText ?? "Task summary status unavailable.";
  }
  document.querySelector("#task-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
}
function addReviewInbox(item: WorkItem): void {
  if (inbox.some((entry) => entry.taskId === item.id)) return;
  inbox.unshift({ id: `inbox-${Date.now()}`, taskId: item.id, title: "Customer identity needs review", detail: `Alex could not verify a unique customer for: ${item.task}` });
}
async function executeWorkflow(item: WorkItem): Promise<void> {
  item.status = "Running";
  item.progress = "Executing business capabilities…";
  renderDashboard();
  setDetailState("RUNNING");
  businessMeta.textContent = "Alex is working";
  businessResult.innerHTML = '<p class="approval-empty">Alex is resolving the customer and reviewing receivables.</p>';
  verificationCount.textContent = "Waiting for verification";
  verificationList.innerHTML = `<li><span class="check-icon">${svgIcon("circle")}</span><div>Verification starts after business capabilities finish.</div></li>`;
  aiSummary.textContent = "Executing business work before verification.";
  gatewayStatus.textContent = "Gateway not called until verification passes.";
  renderActivity([], "RUNNING");
  updateEmployeeState("Working");
  saveLedger();

  try {
    const result = await runOperationsEmployeeTask("browser", { customerQuery: item.customerQuery });
    item.result = result;
    item.status = result.task.state === "COMPLETED" ? "Completed" : result.task.state === "NEEDS_REVIEW" ? "Needs Review" : "Failed";
    item.progress = result.task.state === "COMPLETED" ? "Verified · 4 steps" : result.task.state === "NEEDS_REVIEW" ? "Manager review required" : "Execution stopped";
    setDetailState(result.task.state);
    renderBusinessResult(result);
    renderVerification(result);
    renderActivity(result.evidence, result.task.state);
    latestEvidence = JSON.stringify(result.evidence, null, 2);
    rawEvidence.textContent = latestEvidence;
    if (result.task.state === "NEEDS_REVIEW") addReviewInbox(item);
    renderDashboard();
    updateEmployeeState(result.task.state === "COMPLETED" ? "Available" : result.task.state === "NEEDS_REVIEW" ? "Waiting on manager" : "Blocked");
    saveLedger();
    await createAiSummary(result, item);
  } catch (error) {
    item.status = "Failed";
    item.progress = "Execution stopped";
    setDetailState("FAILED");
    businessMeta.textContent = "Execution failed";
    businessResult.innerHTML = `<div class="attention-box">${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`;
    aiSummary.textContent = "Summary skipped because execution failed.";
    gatewayStatus.textContent = "Gateway not called.";
    updateEmployeeState("Blocked");
    renderDashboard();
    saveLedger();
  }
}

function createBlockedTask(task: string, routed: RoutedTask): void {
  const item: WorkItem = {
    id: `work-${Date.now()}`,
    task,
    customerQuery: "",
    context: routed.context,
    intent: "unsupported",
    status: "Blocked",
    progress: routed.reason ?? "Unsupported capability",
    createdAt: new Date().toISOString(),
  };
  work.unshift(item);
  composerFeedback.textContent = routed.reason ?? "This task is not supported by the V1 demo.";
  setDetailState("BLOCKED");
  businessMeta.textContent = "Capability boundary";
  businessResult.innerHTML = `<div class="attention-box"><strong>Task not executed.</strong><br>${escapeHtml(item.progress)}</div>`;
  verificationCount.textContent = "0 / 0";
  verificationList.innerHTML = `<li><span class="check-icon">${svgIcon("circle")}</span><div>No business execution occurred.</div></li>`;
  aiSummary.textContent = "No AI summary generated for unsupported work.";
  gatewayStatus.textContent = "Gateway not called.";
  renderActivity([], "IDLE");
  renderDashboard();
  saveLedger();
}
function createApprovalScenario(task: string, routed: RoutedTask): void {
  const taskId = `work-${Date.now()}`;
  const approvalId = `approval-${Date.now()}`;
  const item: WorkItem = {
    id: taskId,
    task,
    customerQuery: routed.customerQuery,
    context: routed.context,
    intent: "approval-demo",
    status: "Needs Approval",
    progress: "Waiting for manager approval",
    createdAt: new Date().toISOString(),
    approvalId,
  };
  const approval: ApprovalItem = {
    id: approvalId,
    taskId,
    state: "pending",
    title: "Resume ACME follow-up preparation",
    what: "Allow Alex to continue the read-only ACME receivables review and prepare a follow-up plan.",
    why: "This explicit Demo Scenario proves that work can pause for a manager decision and resume afterward.",
    affected: `ACME mock receivables · Snapshot ${formatSnapshot()}`,
    impact: "Demo only. No ERP, email, credit limit, or external business data will be changed.",
  };
  work.unshift(item);
  approvals.unshift(approval);
  setDetailState("NEEDS_APPROVAL");
  businessMeta.textContent = "Manager decision required";
  businessResult.innerHTML = '<div class="attention-box"><strong>Demo Scenario · Approval required.</strong><br>Open Approvals and choose Approve & Resume or Reject.</div>';
  verificationCount.textContent = "0 / 0";
  verificationList.innerHTML = `<li><span class="check-icon">${svgIcon("circle")}</span><div>Verification will start after approval and execution.</div></li>`;
  aiSummary.textContent = "Waiting for manager approval.";
  gatewayStatus.textContent = "Gateway not called while approval is pending.";
  currentActivity.innerHTML = `<li><span class="activity-icon active">${svgIcon("shield")}</span><div class="activity-copy"><strong>Waiting for manager approval</strong><small>Alex paused before continuing the demo task.</small></div></li>`;
  updateEmployeeState("Waiting on manager");
  renderDashboard();
  saveLedger();
}

async function resumeApproval(approvalId: string): Promise<void> {
  if (running) return;
  const approval = approvals.find((candidate) => candidate.id === approvalId);
  const item = approval ? work.find((candidate) => candidate.id === approval.taskId) : undefined;
  if (!approval || !item || approval.state !== "pending") return;
  approval.state = "approved";
  item.status = "Running";
  item.progress = "Approved · resuming work";
  renderDashboard();
  saveLedger();
  running = true;
  assignButton.disabled = true;
  quickTaskButtons.forEach((button) => { button.disabled = true; });
  try { await executeWorkflow(item); }
  finally {
    running = false;
    assignButton.disabled = false;
    quickTaskButtons.forEach((button) => { button.disabled = false; });
  }
}
function rejectApproval(approvalId: string): void {
  const approval = approvals.find((candidate) => candidate.id === approvalId);
  const item = approval ? work.find((candidate) => candidate.id === approval.taskId) : undefined;
  if (!approval || !item || approval.state !== "pending") return;
  approval.state = "rejected";
  item.status = "Blocked";
  item.progress = "Rejected by manager · no execution performed";
  item.gatewayText = "Gateway not called because the manager rejected the demo approval.";
  item.aiHtml = "<p>Work stopped after manager rejection.</p>";
  setDetailState("BLOCKED");
  businessMeta.textContent = "Manager rejected the request";
  businessResult.innerHTML = '<div class="attention-box">Approval rejected. Alex did not resume the task and no external write action occurred.</div>';
  verificationCount.textContent = "0 / 0";
  verificationList.innerHTML = `<li><span class="check-icon">${svgIcon("circle")}</span><div>Task stopped before execution.</div></li>`;
  aiSummary.innerHTML = item.aiHtml;
  gatewayStatus.textContent = item.gatewayText;
  renderActivity([], "IDLE");
  updateEmployeeState("Available");
  renderDashboard();
  saveLedger();
}
async function assignTask(task: string): Promise<void> {
  if (running) return;
  const cleanTask = task.trim();
  if (!cleanTask) {
    composerFeedback.textContent = "Enter a task or choose a suggestion first.";
    taskInput.focus();
    return;
  }
  composerFeedback.textContent = "";
  const routed = routeDashboardTask(cleanTask);
  if (routed.intent === "unsupported") { createBlockedTask(cleanTask, routed); return; }
  if (routed.intent === "approval-demo") { createApprovalScenario(cleanTask, routed); return; }

  const item: WorkItem = {
    id: `work-${Date.now()}`,
    task: cleanTask,
    customerQuery: routed.customerQuery,
    context: routed.context,
    intent: routed.intent,
    status: "Running",
    progress: "Starting…",
    createdAt: new Date().toISOString(),
  };
  work.unshift(item);
  renderDashboard();
  saveLedger();
  running = true;
  assignButton.disabled = true;
  quickTaskButtons.forEach((button) => { button.disabled = true; });
  try { await executeWorkflow(item); }
  finally {
    running = false;
    assignButton.disabled = false;
    quickTaskButtons.forEach((button) => { button.disabled = false; });
  }
}

function openTrustDrawer(): void {
  trustDrawer.classList.add("open");
  drawerOverlay.classList.add("open");
  closeTrustDrawerButton.focus();
}
function closeTrustDrawer(): void {
  trustDrawer.classList.remove("open");
  drawerOverlay.classList.remove("open");
  openTrustDrawerButton.focus();
}
async function clearDemoHistory(): Promise<void> {
  work.splice(0);
  inbox.splice(0);
  approvals.splice(0);
  await clearDemoLedger();
  renderDashboard();
  resetTaskWorkspace(true);
}

form.addEventListener("submit", (event) => { event.preventDefault(); void assignTask(taskInput.value); });
quickTaskButtons.forEach((button) => button.addEventListener("click", () => {
  taskInput.value = button.dataset.task ?? "";
  composerFeedback.textContent = "Suggestion added. Review it, then press Assign.";
  taskInput.focus();
}));
workBody.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".view-task");
  if (button?.dataset.taskId) viewTask(button.dataset.taskId);
});
workCards.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".view-task");
  if (button?.dataset.taskId) viewTask(button.dataset.taskId);
});
approvalList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".approval-action");
  const approvalId = button?.dataset.approvalId;
  if (!button || !approvalId) return;
  if (button.dataset.action === "approve") void resumeApproval(approvalId);
  if (button.dataset.action === "reject") rejectApproval(approvalId);
});
copyEvidence.addEventListener("click", async () => {
  if (!latestEvidence) return;
  await navigator.clipboard.writeText(latestEvidence);
  copyEvidence.textContent = "Copied";
  setTimeout(() => { copyEvidence.textContent = "Copy JSON"; }, 1200);
});
viewEvidence.addEventListener("click", () => {
  evidenceDetails.open = true;
  if (window.matchMedia("(max-width: 760px)").matches) openTrustDrawer();
  evidenceDetails.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
document.querySelector("#new-task")?.addEventListener("click", () => resetTaskWorkspace(true));
document.querySelector("#open-inbox")?.addEventListener("click", () => document.querySelector("#inbox")?.scrollIntoView({ behavior: "smooth" }));
clearHistoryButton.addEventListener("click", () => { void clearDemoHistory(); });
openTrustDrawerButton.addEventListener("click", openTrustDrawer);
closeTrustDrawerButton.addEventListener("click", closeTrustDrawer);
drawerOverlay.addEventListener("click", closeTrustDrawer);
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && trustDrawer.classList.contains("open")) closeTrustDrawer(); });
document.querySelectorAll<HTMLAnchorElement>(".mobile-bottom-nav a").forEach((link) => link.addEventListener("click", () => {
  trustDrawer.classList.remove("open");
  drawerOverlay.classList.remove("open");
}));

const snapshotLabel = `Demo dataset · Snapshot ${formatSnapshot()} · Read-only fixture`;
datasetSnapshot.textContent = snapshotLabel;
businessDataDetail.textContent = `Deterministic fixture · Snapshot ${formatSnapshot()}`;
async function initializeDashboard(): Promise<void> {
  await loadLedger();
  renderDashboard();
  resetTaskWorkspace(false, false);
}
void initializeDashboard();
