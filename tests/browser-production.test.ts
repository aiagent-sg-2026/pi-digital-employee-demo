import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Browser production demo contract", () => {
  it("ships the Phase 3 Operations Assistant rather than the Phase 0 page", () => {
    const html = readFileSync("index.html", "utf8");
    const main = readFileSync("src/browser/main.ts", "utf8");
    expect(html).toContain("Portable AI Employee · Phase 3");
    expect(html).toContain("Operations Assistant");
    expect(main).toContain('runOperationsEmployeeTask("browser"');
    expect(main).not.toContain('runPhase0("browser")');
  });

  it("keeps deterministic completion separate from the demo LLM summary", () => {
    const main = readFileSync("src/browser/main.ts", "utf8");
    expect(main).toContain('result.task.state === "COMPLETED"');
    expect(main).toContain("gateway.chat");
    expect(main.indexOf('result.task.state === "COMPLETED"')).toBeLessThan(main.indexOf("gateway.chat"));
  });

  it("ships production UX affordances for reviewers and technical audit", () => {
    const html = readFileSync("index.html", "utf8");
    const main = readFileSync("src/browser/main.ts", "utf8");
    expect(html).toContain("Quick cases");
    expect(html).toContain('id="verification-count"');
    expect(html).toContain('id="copy-evidence"');
    expect(html).toContain("Deterministic completion gate");
    expect(main).toContain("capabilityLabels");
    expect(main).toContain("renderSafeMarkdown");
    expect(main).toContain("navigator.clipboard.writeText");
  });

  it("prevents overlapping employee runs", () => {
    const main = readFileSync("src/browser/main.ts", "utf8");
    expect(main).toContain("let running = false");
    expect(main).toContain("if (running) return");
    expect(main).toContain("button.disabled = true");
  });
});
