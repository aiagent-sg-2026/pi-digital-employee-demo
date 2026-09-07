import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Digital Employee Dashboard V1 contract", () => {
  it("ships a work-first employee workspace instead of a chatbot-style demo", () => {
    const html = readFileSync("index.html", "utf8");
    const main = readFileSync("src/browser/main.ts", "utf8");
    expect(html).toContain("Digital Employee");
    expect(html).toContain("Alex");
    expect(html).toContain("Operations Employee");
    expect(html).toContain("Assign task");
    expect(html).toContain("My Work");
    expect(html).toContain("Today's Brief");
    expect(html).toContain("Current Activity");
    expect(main).toContain('runOperationsEmployeeTask("browser"');
    expect(main).not.toContain('runPhase0("browser")');
  });

  it("keeps inbox, approvals, connections, and employee status first-class", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).toContain('id="inbox"');
    expect(html).toContain('id="approvals"');
    expect(html).toContain('id="connections"');
    expect(html).toContain('id="employee-status"');
    expect(html).toContain("No approvals pending");
    expect(html).toContain("Globe3 ERP");
    expect(html).toContain("Not connected");
    expect(html).toContain("Business Data");
    expect(html).toContain("Demo");
  });

  it("keeps deterministic completion ahead of AI summarization", () => {
    const main = readFileSync("src/browser/main.ts", "utf8");
    const completionGate = main.indexOf('result.task.state!=="COMPLETED"');
    const gatewayCall = main.indexOf("gateway.chat");
    expect(completionGate).toBeGreaterThanOrEqual(0);
    expect(gatewayCall).toBeGreaterThan(completionGate);
    expect(main).toContain("Business completion remains verification-gated");
  });

  it("uses human-readable activity while retaining technical evidence", () => {
    const html = readFileSync("index.html", "utf8");
    const main = readFileSync("src/browser/main.ts", "utf8");
    expect(main).toContain("Customer identified");
    expect(main).toContain("Outstanding invoices reviewed");
    expect(main).toContain("Payments reconciled");
    expect(html).toContain("View Evidence");
    expect(html).toContain("Technical trace for audit and debugging.");
    expect(html).toContain('id="copy-evidence"');
  });

  it("prevents overlapping work and supports responsive dashboard layout", () => {
    const html = readFileSync("index.html", "utf8");
    const main = readFileSync("src/browser/main.ts", "utf8");
    expect(main).toContain("let running=false");
    expect(main).toContain("if(running)return");
    expect(main).toContain("b.disabled=true");
    expect(html).toContain("@media(max-width:760px)");
    expect(html).toContain("grid-template-columns:220px minmax(0,1fr) 310px");
  });
  it("uses a standard readable typography scale and responsive three-column layout", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).toContain("font-family:system-ui,sans-serif");
    expect(html).toContain("--font-xs:.75rem");
    expect(html).toContain("--font-sm:.875rem");
    expect(html).toContain("--font-md:1rem");
    expect(html).toContain("--font-lg:1.125rem");
    expect(html).toContain("--font-xl:1.25rem");
    expect(html).toContain("--font-2xl:1.5rem");
    expect(html).toContain("--font-3xl:2rem");
    expect(html).toContain("grid-template-columns:240px minmax(680px,1fr) 360px");
    expect(html).toContain("@media(max-width:1280px)");
    expect(html).toContain("@media(max-width:1120px)");
    expect(html).toContain("@media(max-width:760px)");
  });

  it("uses SVG for every UI icon and forbids text/emoji icon glyphs", () => {
    const html = readFileSync("index.html", "utf8");
    const main = readFileSync("src/browser/main.ts", "utf8");
    const icons = readFileSync("src/browser/icons.ts", "utf8");
    const bannedIconGlyphs = ["⌂", "◫", "✉", "✓", "◎", "□", "↺", "◇", "⇄", "⚙", "⌄", "⌕", "♧", "＋", "✦", "➤", "▤", "♙", "▥", "◯", "△", "○", "●", "⚠", "→"];
    for (const glyph of bannedIconGlyphs) {
      expect(html).not.toContain(glyph);
      expect(main).not.toContain(glyph);
    }
    expect(html).toContain('data-icon="home"');
    expect(html).toContain('data-icon="bell"');
    expect(html).toContain('data-icon="status-dot"');
    expect(main).toContain("hydrateSvgIcons()");
    expect(main).toContain('svgIcon("check")');
    expect(icons).toContain("<svg");
    expect(icons).toContain("viewBox=\"0 0 24 24\"");
  });

});
