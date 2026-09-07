import { runOperationsEmployeeTask } from "../core";
import {
  createDemoGatewayClient,
  DemoGatewayError,
  DemoGatewayRateLimitError,
} from "../shared/demo-gateway-client";

const form = document.querySelector<HTMLFormElement>("#task-form")!;
const input = document.querySelector<HTMLInputElement>("#customer-query")!;
const runButton = document.querySelector<HTMLButtonElement>("#run-task")!;
const stateEl = document.querySelector<HTMLElement>("#task-state")!;
const summaryEl = document.querySelector<HTMLElement>("#summary")!;
const stepsEl = document.querySelector<HTMLElement>("#steps")!;
const stepCountEl = document.querySelector<HTMLElement>("#step-count")!;
const verificationEl = document.querySelector<HTMLElement>("#verification")!;
const verificationCountEl = document.querySelector<HTMLElement>("#verification-count")!;
const evidenceEl = document.querySelector<HTMLPreElement>("#evidence")!;
const copyEvidenceButton = document.querySelector<HTMLButtonElement>("#copy-evidence")!;
const aiEl = document.querySelector<HTMLElement>("#ai-summary")!;
const gatewayEl = document.querySelector<HTMLElement>("#gateway-status")!;
const quickCaseButtons = [...document.querySelectorAll<HTMLButtonElement>(".quick-case")];
const phaseItems = [...document.querySelectorAll<HTMLElement>(".phase-item")];

const gateway = createDemoGatewayClient({ origin: window.location.origin });
let running = false;

const capabilityLabels: Record<string, string> = {
  "customer.lookup": "Customer lookup",
  "invoice.review": "Invoice review",
  "payment.list": "Payment reconciliation",
  "follow-up.evaluate": "Follow-up evaluation",
  "execution.error": "Execution error",
};

type PhaseName = "business" | "verify" | "ai";
type PhaseState = "idle" | "active" | "done";

function setState(state: string, tone: "idle" | "running" | "pass" | "warn" | "fail" = "idle") {
  stateEl.textContent = state;
  stateEl.dataset.tone = tone;
}

function setPhase(name: PhaseName, state: PhaseState) {
  const item = phaseItems.find((candidate) => candidate.dataset.phase === name);
  if (item) item.dataset.state = state;
}

function resetPhases() {
  for (const item of phaseItems) item.dataset.state = "idle";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]!));
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function renderSafeMarkdown(value: string): string {
  const lines = value.replace(/\r/g, "").split("\n");
  const html: string[] = [];
  let list: "ul" | "ol" | null = null;

  const closeList = () => {
    if (list) html.push(`</${list}>`);
    list = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }

    if (/^#{1,3}\s+/.test(line)) {
      closeList();
      html.push(`<h3>${inlineMarkdown(line.replace(/^#{1,3}\s+/, ""))}</h3>`);
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      if (list !== "ul") {
        closeList();
        list = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${inlineMarkdown(unordered[1]!)}</li>`);
      continue;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      if (list !== "ol") {
        closeList();
        list = "ol";
        html.push("<ol>");
      }
      html.push(`<li>${inlineMarkdown(ordered[1]!)}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  closeList();
  return html.join("");
}

function renderSteps(evidence: readonly { type: string }[]) {
  const steps = evidence.filter((item) => item.type !== "verification");
  stepCountEl.textContent = `${steps.length} ${steps.length === 1 ? "step" : "steps"}`;
  stepsEl.innerHTML = steps
    .map((item, index) => {
      const label = capabilityLabels[item.type] ?? item.type;
      return `<li><span class="step-index">${index + 1}</span><div class="step-copy"><span>${escapeHtml(label)}</span><code>${escapeHtml(item.type)}</code></div><span class="step-status">done</span></li>`;
    })
    .join("");
}

function renderVerification(checks: readonly { id: string; passed: boolean; message?: string }[]) {
  const passed = checks.filter((check) => check.passed).length;
  verificationCountEl.textContent = `${passed}/${checks.length} passed`;
  verificationCountEl.dataset.tone = passed === checks.length && checks.length > 0 ? "pass" : "idle";
  verificationEl.innerHTML = checks
    .map((check) => `<li data-pass="${check.passed}"><span>${check.passed ? "✓" : "!"}</span><div><strong>${escapeHtml(check.id)}</strong>${check.message ? `<small>${escapeHtml(check.message)}</small>` : ""}</div></li>`)
    .join("");
}

function extractAssistantText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return "";
  const first = choices[0] as { message?: { content?: unknown } } | undefined;
  return typeof first?.message?.content === "string" ? first.message.content : "";
}

async function runTask(customerQuery: string) {
  if (running) return;
  running = true;
  runButton.disabled = true;
  for (const button of quickCaseButtons) button.disabled = true;
  runButton.textContent = "Running…";
  resetPhases();
  setPhase("business", "active");
  setState("RUNNING", "running");
  summaryEl.innerHTML = "<p class=\"empty-copy\">Resolving customer and reviewing receivables…</p>";
  stepsEl.innerHTML = "";
  stepCountEl.textContent = "0 steps";
  verificationEl.innerHTML = "";
  verificationCountEl.textContent = "0 checks";
  verificationCountEl.dataset.tone = "idle";
  evidenceEl.textContent = "";
  aiEl.innerHTML = "<p class=\"empty-copy\">Waiting for deterministic verification.</p>";
  gatewayEl.textContent = "Waiting for verified business result.";

  const result = await runOperationsEmployeeTask("browser", { customerQuery });
  setPhase("business", "done");
  setPhase("verify", "active");

  const tone = result.task.state === "COMPLETED" ? "pass" : result.task.state === "NEEDS_REVIEW" ? "warn" : "fail";
  setState(result.task.state, tone);
  renderSteps(result.evidence);
  renderVerification(result.verification.checks);
  evidenceEl.textContent = JSON.stringify(result.evidence, null, 2);
  setPhase("verify", "done");

  if (result.summary) {
    summaryEl.innerHTML = `
      <div class="summary-grid">
        <div><span>Customer</span><strong>${escapeHtml(result.summary.customer)}</strong></div>
        <div><span>Outstanding invoices</span><strong>${result.summary.outstandingInvoices}</strong></div>
        <div><span>Outstanding total</span><strong>${result.summary.currency} ${result.summary.outstandingTotal.toLocaleString("en-SG")}</strong></div>
        <div><span>Follow-up actions</span><strong>${result.followUps.length}</strong></div>
      </div>`;
  } else {
    summaryEl.innerHTML = `<p class="empty-copy">${result.task.state === "NEEDS_REVIEW" ? "Customer identity needs review before business actions continue." : "The task could not be completed."}</p>`;
  }

  if (result.task.state === "COMPLETED" && result.summary) {
    setPhase("ai", "active");
    gatewayEl.textContent = "Generating a grounded follow-up summary via demo-auto…";
    aiEl.innerHTML = "<p class=\"empty-copy\">Summarizing verified facts…</p>";
    try {
      const response = await gateway.chat({
        messages: [
          {
            role: "system",
            content: "You are an operations assistant. Summarize only the verified facts provided. Use concise Markdown with short headings and bullets. Do not invent amounts, invoices, actions, or policies.",
          },
          {
            role: "user",
            content: JSON.stringify({
              taskState: result.task.state,
              summary: result.summary,
              followUps: result.followUps,
              verification: result.verification,
            }),
          },
        ],
      });
      const text = extractAssistantText(response);
      aiEl.innerHTML = text ? renderSafeMarkdown(text) : "<p class=\"empty-copy\">Gateway responded, but no assistant text was returned.</p>";
      gatewayEl.textContent = "Demo Gateway connected · demo-auto · verified facts only";
      setPhase("ai", "done");
    } catch (error) {
      if (error instanceof DemoGatewayRateLimitError) {
        gatewayEl.textContent = error.message;
      } else if (error instanceof DemoGatewayError && error.status === 403) {
        gatewayEl.textContent = `Gateway Origin is not enabled yet for ${window.location.origin}. The verified employee workflow still completed locally.`;
      } else if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
        gatewayEl.textContent = `Demo Gateway is not reachable from ${window.location.origin}. The verified employee workflow still completed locally.`;
      } else {
        gatewayEl.textContent = `AI summary unavailable: ${error instanceof Error ? error.message : String(error)}`;
      }
      aiEl.innerHTML = "<p class=\"empty-copy\">The verified business result remains valid without the optional AI summary.</p>";
      setPhase("ai", "done");
    }
  } else {
    aiEl.innerHTML = "<p class=\"empty-copy\">Skipped because deterministic verification did not reach COMPLETED.</p>";
    gatewayEl.textContent = "AI summary skipped because deterministic verification did not reach COMPLETED.";
  }

  runButton.disabled = false;
  for (const button of quickCaseButtons) button.disabled = false;
  runButton.textContent = "Run employee task";
  running = false;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) return;
  void runTask(query).catch((error) => {
    setState("FAILED", "fail");
    summaryEl.innerHTML = `<p class="empty-copy">${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
    gatewayEl.textContent = "Task failed before the optional AI summary.";
    runButton.disabled = false;
    for (const button of quickCaseButtons) button.disabled = false;
    runButton.textContent = "Run employee task";
    running = false;
  });
});

for (const button of quickCaseButtons) {
  button.addEventListener("click", () => {
    input.value = button.dataset.query ?? "";
    void runTask(input.value);
  });
}

copyEvidenceButton.addEventListener("click", async () => {
  if (!evidenceEl.textContent) return;
  try {
    await navigator.clipboard.writeText(evidenceEl.textContent);
    copyEvidenceButton.textContent = "Copied";
    window.setTimeout(() => { copyEvidenceButton.textContent = "Copy JSON"; }, 1400);
  } catch {
    copyEvidenceButton.textContent = "Copy unavailable";
    window.setTimeout(() => { copyEvidenceButton.textContent = "Copy JSON"; }, 1400);
  }
});

void runTask(input.value.trim() || "ACME");
