import {describe,expect,it} from "vitest";
import {routeDashboardTask} from "../src/browser/task-router";
describe("Business World task router",()=>{
  it("routes multiple customer receivables",()=>{expect(routeDashboardTask("Review ACME outstanding invoices.")).toMatchObject({intent:"receivables.review",customerQuery:"ACME"});expect(routeDashboardTask("Check Beacon receivables.")).toMatchObject({intent:"receivables.review",customerQuery:"Beacon"});expect(routeDashboardTask("Review ACME overdue invoices and prepare follow-up actions.")).toMatchObject({intent:"followup.prepare",customerQuery:"ACME"});});
  it("routes portfolio and exception work",()=>{expect(routeDashboardTask("Which customers owe us the most?").intent).toBe("portfolio.overdue");expect(routeDashboardTask("Show overdue customers.").intent).toBe("portfolio.overdue");expect(routeDashboardTask("Investigate unmatched payments.").intent).toBe("payments.reconcile");expect(routeDashboardTask("Review today's exceptions.").intent).toBe("exceptions.review");});
  it("routes customer lookup and brief",()=>{expect(routeDashboardTask("Resolve ambiguous customer.")).toMatchObject({intent:"customer.lookup",customerQuery:"Twin"});expect(routeDashboardTask("Prepare today's brief.").intent).toBe("daily.brief");});
  it("keeps approval explicit and blocks unsupported",()=>{expect(routeDashboardTask("Demo approval flow for ACME follow-up.").intent).toBe("approval-demo");expect(routeDashboardTask("Send an email to everyone tomorrow.").intent).toBe("unsupported");});
});
