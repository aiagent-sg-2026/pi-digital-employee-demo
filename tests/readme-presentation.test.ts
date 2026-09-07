import {describe,expect,it} from "vitest";
import {existsSync,readFileSync} from "node:fs";
const readme=readFileSync("README.md","utf8");
describe("GitHub product presentation",()=>{
 it("opens with the Digital Employee product story and live demo",()=>{expect(readme.startsWith("# Digital Employee\n")).toBe(true);expect(readme).toContain("A browser-first Digital Employee");expect(readme).toContain("Open the Live Demo");expect(readme.indexOf("What is a Digital Employee?")).toBeLessThan(readme.indexOf("IndexedDB Business World"));});
 it("documents the four guided scenarios",()=>{for(const task of ["Review ACME receivables.","Resolve ambiguous customer.","Demo approval flow for ACME follow-up.","Show overdue customers."])expect(readme).toContain(task);});
 it("makes workflow, architecture and Gateway truth boundaries explicit",()=>{expect(readme).toContain("Task → work lifecycle");expect(readme).toContain("flowchart LR");expect(readme).toContain("flowchart TD");expect(readme).toContain("Demo Gateway is presentation only");});
 it("ships real product screenshots",()=>{for(const file of ["home-dashboard.png","ambiguous-customer-review.png","approval-detail.png","task-verification.png","task-evidence.png","customer-detail.png","mobile-home.png"])expect(existsSync(`docs/images/${file}`)).toBe(true);});
 it("states honest demo boundaries and engineering highlights",()=>{expect(readme).toContain("## Demo Boundaries");expect(readme).toContain("Globe3 ERP is not connected");expect(readme).toContain("Gmail is not connected");expect(readme).toContain("## Engineering Highlights");expect(readme).toContain("No analytics, session replay, tracking pixels or telemetry SDKs");});
});
