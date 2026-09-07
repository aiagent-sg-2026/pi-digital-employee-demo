import { describe, expect, it } from "vitest";
import { routeDashboardTask } from "../src/browser/task-router";
import { demoSeed } from "../src/demo/seed";
import { resolveCustomerReferences } from "../src/data/business-repository";

const business={resolveCustomerReference:async(text:string)=>resolveCustomerReferences(demoSeed.customers,text)};

describe("deterministic task router",()=>{
  it("resolves customer entities from the Business World instead of stop-word stripping",async()=>{
    await expect(routeDashboardTask("Prepare ACME customer follow-up based on verified receivables.",business)).resolves.toMatchObject({intent:"followup.prepare",customerQuery:"ACME",resolvedCustomerId:"customer-acme"});
    await expect(routeDashboardTask("Review Beacon Retail Pte Ltd receivables.",business)).resolves.toMatchObject({intent:"receivables.review",customerQuery:"Beacon Retail Pte Ltd",resolvedCustomerId:"customer-beacon"});
    await expect(routeDashboardTask("Review C-1000 receivables.",business)).resolves.toMatchObject({intent:"receivables.review",customerQuery:"C-1000",resolvedCustomerId:"customer-acme"});
  });
  it("routes English portfolio and exception work",async()=>{
    expect((await routeDashboardTask("Which customers owe us the most?",business)).intent).toBe("portfolio.overdue");
    expect((await routeDashboardTask("Show overdue customers.",business)).intent).toBe("portfolio.overdue");
    expect((await routeDashboardTask("Investigate unmatched payments.",business)).intent).toBe("payments.reconcile");
    expect((await routeDashboardTask("Review today's exceptions.",business)).intent).toBe("exceptions.review");
  });
  it("routes Simplified Chinese free-form work without an LLM",async()=>{
    await expect(routeDashboardTask("检查 ACME 应收款",business)).resolves.toMatchObject({intent:"receivables.review",customerQuery:"ACME",resolvedCustomerId:"customer-acme"});
    expect((await routeDashboardTask("查看逾期客户",business)).intent).toBe("portfolio.overdue");
    expect((await routeDashboardTask("调查未匹配付款",business)).intent).toBe("payments.reconcile");
    expect((await routeDashboardTask("检查今日异常",business)).intent).toBe("exceptions.review");
    await expect(routeDashboardTask("准备 ACME 客户跟进",business)).resolves.toMatchObject({intent:"followup.prepare",customerQuery:"ACME",resolvedCustomerId:"customer-acme"});
  });
  it("routes Traditional Chinese free-form work without an LLM",async()=>{
    await expect(routeDashboardTask("檢查 ACME 應收款",business)).resolves.toMatchObject({intent:"receivables.review",customerQuery:"ACME",resolvedCustomerId:"customer-acme"});
    expect((await routeDashboardTask("查看逾期客戶",business)).intent).toBe("portfolio.overdue");
    expect((await routeDashboardTask("調查未匹配付款",business)).intent).toBe("payments.reconcile");
    expect((await routeDashboardTask("檢查今日異常",business)).intent).toBe("exceptions.review");
    await expect(routeDashboardTask("準備 ACME 客戶跟進",business)).resolves.toMatchObject({intent:"followup.prepare",customerQuery:"ACME",resolvedCustomerId:"customer-acme"});
  });
  it("preserves explicit Twin ambiguity and unsupported honesty",async()=>{
    await expect(routeDashboardTask("Resolve ambiguous customer.",business)).resolves.toMatchObject({intent:"receivables.review",customerQuery:"Twin"});
    await expect(routeDashboardTask("解決客戶身份歧義",business)).resolves.toMatchObject({intent:"receivables.review",customerQuery:"Twin"});
    expect((await routeDashboardTask("Send an email to everyone tomorrow.",business)).intent).toBe("unsupported");
  });
  it("keeps a well-formed unknown customer as a review query rather than inventing trailing words",async()=>{
    await expect(routeDashboardTask("Review Unknown Company receivables.",business)).resolves.toMatchObject({intent:"receivables.review",customerQuery:"Unknown Company"});
  });
});

describe("Business World customer reference resolution",()=>{
  it("deduplicates legacy rows and preserves canonical ambiguity",()=>{
    const beacon=resolveCustomerReferences(demoSeed.customers,"Please review Beacon receivables");
    expect(beacon.canonical.map(x=>x.id)).toEqual(["customer-beacon"]);
    const twin=resolveCustomerReferences(demoSeed.customers,"Resolve Twin customer receivables");
    expect(twin.canonical.map(x=>x.id).sort()).toEqual(["customer-twin-north","customer-twin-south"]);
  });
});
