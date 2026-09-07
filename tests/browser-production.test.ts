import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const main = readFileSync("src/browser/main.ts", "utf8");
const workflow = readFileSync("src/core/employee-workflow.ts", "utf8");
const data = readFileSync("src/core/mock-business-data.ts", "utf8");
const icons = readFileSync("src/browser/icons.ts", "utf8");
const router = readFileSync("src/browser/task-router.ts", "utf8");

describe("Digital Employee Dashboard V1 production contract", () => {
  it("does not auto-run work on page load and starts with a fresh composer", () => {
    expect(html).toContain('id="task-input" value=""');
    expect(html).toContain('id="work-count" class="meta">0 tasks');
    expect(html).toContain('id="brief-title">Ready for work');
    expect(main).toContain("loadLedger();");
    expect(main).toContain("resetTaskWorkspace(false, false);");
    expect(main).not.toMatch(/void\s+assignTask\(taskInput\.value\)\s*;\s*$/m);
  });

  it("uses quick actions as suggestions only and New Task creates a fresh workspace", () => {
    expect(main).toContain('composerFeedback.textContent = "Suggestion added. Review it, then press Assign."');
    expect(main).not.toContain('button.dataset.task ?? ""; void assignTask');
    expect(main).toContain('querySelector("#new-task")?.addEventListener("click", () => resetTaskWorkspace(true))');
    expect(main).toContain("taskInput.value = \"\";");
  });

  it("removes fake Search/Settings/navigation and exposes only implemented destinations", () => {
    expect(html).not.toContain('id="search-task"');
    expect(html).not.toContain('id="open-settings"');
    expect(html).not.toContain('>Tasks</a>');
    expect(html).not.toContain('>History</a>');
    expect(html).not.toContain('>Skills</a>');
    expect(html).not.toContain('>Settings</a>');
    expect(html).toContain('href="#home"');
    expect(html).toContain('href="#my-work"');
    expect(html).toContain('href="#inbox"');
    expect(html).toContain('href="#approvals"');
    expect(html).toContain('href="#connections"');
  });

  it("routes supported intents and blocks unsupported work before business execution", () => {
    expect(router).toContain('type TaskIntent = "receivables-review" | "unknown-customer-demo" | "approval-demo" | "unsupported"');
    expect(main).toContain('if (routed.intent === "unsupported") { createBlockedTask(cleanTask, routed); return; }');
    expect(router).toContain("This V1 demo supports ACME receivables review");
    expect(html).toContain("Test unknown-customer exception");
  });

  it("keeps deterministic completion ahead of AI summarization with a non-contradictory message", () => {
    const completionGate = main.indexOf('result.task.state !== "COMPLETED"');
    const gatewayCall = main.indexOf("gateway.chat");
    expect(completionGate).toBeGreaterThanOrEqual(0);
    expect(gatewayCall).toBeGreaterThan(completionGate);
    expect(main).toContain("Verification passed · Preparing manager summary…");
    expect(main).toContain("Business completion remains verification-gated.");
  });

  it("separates demo oracle values from business-invariant verification", () => {
    expect(data).toContain("export const DEMO_ORACLE");
    expect(data).toContain("outstandingInvoices: 3");
    expect(data).toContain("outstandingTotal: 14520");
    expect(workflow).not.toContain("review.outstandingInvoices === 3");
    expect(workflow).not.toContain("review.outstandingTotal === 14520");
    expect(workflow).not.toContain('duplicateIds.has("invoice-acme-future-import-copy")');
    expect(workflow).toContain('id: "invoice.count.consistent"');
    expect(workflow).toContain('id: "invoice.outstanding.reconciled"');
    expect(workflow).toContain('id: "duplicates.suppressed"');
  });

  it("provides a clearly marked demo Approval and Resume flow", () => {
    expect(html).toContain("Demo Scenario only");
    expect(html).toContain("Demo approval flow");
    expect(main).toContain("createApprovalScenario");
    expect(main).toContain("resumeApproval");
    expect(main).toContain("rejectApproval");
    expect(main).toContain("Approve & Resume");
    expect(main).toContain("No ERP, email, credit limit, or external business data will be changed.");
  });

  it("persists demo task history but deduplicates outstanding KPI by customer snapshot", () => {
    expect(main).toContain('const STORAGE_KEY = "digital-employee-dashboard-v1-ledger"');
    expect(main).toContain("localStorage.setItem(STORAGE_KEY");
    expect(main).toContain("localStorage.getItem(STORAGE_KEY)");
    expect(main).toContain('reviewed.set(`${summary.customerId}:${MOCK_AS_OF_DATE}`, summary.outstandingTotal)');
    expect(html).toContain("Demo ledger");
    expect(html).toContain("Unique snapshot");
  });

  it("labels the fixed demo snapshot explicitly", () => {
    expect(main).toContain("Demo dataset · Snapshot");
    expect(main).toContain("Read-only fixture");
    expect(data).toContain('MOCK_AS_OF_DATE = "2025-03-01"');
  });

  it("uses mobile bottom navigation, a trust drawer, task cards, and 44px touch targets", () => {
    expect(html).toContain('class="mobile-bottom-nav"');
    expect(html).toContain('id="open-trust-drawer"');
    expect(html).toContain('id="work-cards" class="work-cards"');
    expect(html).toContain("min-height:44px");
    expect(html).toContain(".work-table-wrap{display:none}");
    expect(html).toContain(".right-rail.open{transform:translateY(0)}");
  });

  it("has skip-link, focus-visible, keyboard drawer escape, and readable typography", () => {
    expect(html).toContain('class="skip-link"');
    expect(html).toContain(":focus-visible");
    expect(main).toContain('event.key === "Escape"');
    expect(html).toContain("font-family:system-ui,sans-serif");
    expect(html).not.toMatch(/font-size:\s*(8|9|10|11)px/);
    expect(html).toContain("--font-xs:.75rem");
    expect(html).toContain("--font-sm:.875rem");
    expect(html).toContain("--font-md:1rem");
  });

  it("keeps all UI icons SVG-only", () => {
    const bannedIconGlyphs = ["⌂", "◫", "✉", "✓", "◎", "□", "↺", "◇", "⇄", "⚙", "⌄", "⌕", "♧", "＋", "✦", "➤", "▤", "♙", "▥", "◯", "△", "○", "●", "⚠"];
    for (const glyph of bannedIconGlyphs) {
      expect(html).not.toContain(glyph);
      expect(main).not.toContain(glyph);
    }
    expect(html).toContain('data-icon="home"');
    expect(html).toContain('data-icon="more"');
    expect(main).toContain("hydrateSvgIcons()");
    expect(icons).toContain("<svg");
  });
});
