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
const verificationEl = document.querySelector<HTMLElement>("#verification")!;
const evidenceEl = document.querySelector<HTMLPreElement>("#evidence")!;
const aiEl = document.querySelector<HTMLElement>("#ai-summary")!;
const gatewayEl = document.querySelector<HTMLElement>("#gateway-status")!;

const gateway = createDemoGatewayClient({ origin: window.location.origin });

function setState(state: string, tone: "idle" | "running" | "pass" | "warn" | "fail" = "idle") {
  stateEl.textContent = state;
  stateEl.dataset.tone = tone;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]!));
}

function renderSteps(evidence: readonly { type: string }[]) {
  stepsEl.innerHTML = evidence
    .filter((item) => item.type !== "verification")
    .map((item, index) => `<li><span class="step-index">${index + 1}</span><span>${escapeHtml(item.type)}</span><strong>done</strong></li>`)
    .join("");
}

function renderVerification(checks: readonly { id: string; passed: boolean; message?: string }[]) {
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
  runButton.disabled = true;
  setState("RUNNING", "running");
  summaryEl.innerHTML = "<p>Resolving customer and reviewing receivables…</p>";
  stepsEl.innerHTML = "";
  verificationEl.innerHTML = "";
  evidenceEl.textContent = "";
  aiEl.textContent = "";
  gatewayEl.textContent = "Waiting for verified business result.";

  const result = await runOperationsEmployeeTask("browser", { customerQuery });
  const tone = result.task.state === "COMPLETED" ? "pass" : result.task.state === "NEEDS_REVIEW" ? "warn" : "fail";
  setState(result.task.state, tone);
  renderSteps(result.evidence);
  renderVerification(result.verification.checks);
  evidenceEl.textContent = JSON.stringify(result.evidence, null, 2);

  if (result.summary) {
    summaryEl.innerHTML = `
      <div class="summary-grid">
        <div><span>Customer</span><strong>${escapeHtml(result.summary.customer)}</strong></div>
        <div><span>Outstanding invoices</span><strong>${result.summary.outstandingInvoices}</strong></div>
        <div><span>Outstanding total</span><strong>${result.summary.currency} ${result.summary.outstandingTotal.toLocaleString("en-SG")}</strong></div>
        <div><span>Follow-up actions</span><strong>${result.followUps.length}</strong></div>
      </div>`;
  } else {
    summaryEl.innerHTML = `<p>${result.task.state === "NEEDS_REVIEW" ? "Customer identity needs review before business actions continue." : "The task could not be completed."}</p>`;
  }

  if (result.task.state === "COMPLETED" && result.summary) {
    gatewayEl.textContent = "Generating an AI-readable follow-up summary via demo-auto…";
    try {
      const response = await gateway.chat({
        messages: [
          {
            role: "system",
            content: "You are an operations assistant. Summarize only the verified facts provided. Do not invent amounts, invoices, actions, or policies.",
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
      aiEl.textContent = text || "Gateway responded, but no assistant text was returned.";
      gatewayEl.textContent = "Demo Gateway connected · demo-auto";
    } catch (error) {
      if (error instanceof DemoGatewayRateLimitError) {
        gatewayEl.textContent = error.message;
      } else if (error instanceof DemoGatewayError && error.status === 403) {
        gatewayEl.textContent = `Gateway Origin is not enabled yet for ${window.location.origin}. The verified employee workflow still completed locally.`;
      } else {
        gatewayEl.textContent = `AI summary unavailable: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  } else {
    gatewayEl.textContent = "AI summary skipped because deterministic verification did not reach COMPLETED.";
  }

  runButton.disabled = false;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) return;
  void runTask(query).catch((error) => {
    setState("FAILED", "fail");
    summaryEl.innerHTML = `<p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
    runButton.disabled = false;
  });
});

void runTask(input.value.trim() || "ACME");
