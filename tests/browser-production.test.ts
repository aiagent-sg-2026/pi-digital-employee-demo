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
});
