import {describe,expect,it} from "vitest";
import {existsSync,readFileSync} from "node:fs";
const html=readFileSync("index.html","utf8");
const manifest=JSON.parse(readFileSync("public/manifest.webmanifest","utf8")) as Record<string,unknown>;
describe("product metadata",()=>{
 it("positions the product accurately without claiming real integrations",()=>{expect(html).toContain('<title>Digital Employee · Browser-first Verified Business Work</title>');expect(html).toContain('Browser-first Digital Employee demo for verified business work');expect(html).toContain('human review and approval');expect(html).not.toContain('Globe3 ERP connected');expect(html).not.toContain('Gmail connected');});
 it("ships canonical and Open Graph metadata",()=>{expect(html).toContain('rel="canonical" href="https://aiagent-sg-2026.github.io/pi-digital-employee-demo/"');expect(html).toContain('property="og:title" content="Digital Employee · Browser-first Verified Business Work"');expect(html).toContain('property="og:image" content="https://aiagent-sg-2026.github.io/pi-digital-employee-demo/social-preview.png"');expect(html).toContain('property="og:image:width" content="1200"');expect(html).toContain('property="og:image:height" content="630"');});
 it("ships large-image social metadata backed by a real asset",()=>{expect(html).toContain('name="twitter:card" content="summary_large_image"');expect(html).toContain('name="twitter:image" content="https://aiagent-sg-2026.github.io/pi-digital-employee-demo/social-preview.png"');expect(existsSync("public/social-preview.png")).toBe(true);});
 it("keeps manifest positioning aligned and English for V1",()=>{expect(manifest.lang).toBe("en");expect(String(manifest.description)).toContain("deterministic verification");expect(String(manifest.description)).toContain("IndexedDB Demo Business World");});
 it("does not add analytics or session-replay dependencies to metadata",()=>{expect(html).not.toMatch(/google-analytics|googletagmanager|segment\.com|mixpanel|hotjar|clarity\.ms/i);});
});
