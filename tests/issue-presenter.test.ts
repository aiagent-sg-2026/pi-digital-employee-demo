import { describe, expect, it } from "vitest";
import { presentInboxIssue } from "../src/browser/issue-presenter";
import type { BusinessInboxItem } from "../src/data/models";

const base=(overrides:Partial<BusinessInboxItem>):BusinessInboxItem=>({id:"issue-1",issueKey:"unmatched-payment:payment-unmatched-001",type:"unmatched-payment",severity:"warning",relatedEntityType:"payment",relatedEntityId:"payment-unmatched-001",createdAt:"2025-03-01T00:00:00Z",status:"open",title:"Fallback title",detail:"Fallback detail",...overrides});

describe("dynamic issue presenter",()=>{
  it("localizes canonical issue metadata without translating business identifiers",()=>{
    const issue=base({messageKey:"issue.unmatchedPayment",messageParams:{amount:2750,currency:"SGD",payment:"BANK-UNMATCHED-001"}});
    const cn=presentInboxIssue(issue,"zh-CN");
    expect(cn.title).toBe("未匹配付款需要调查");
    expect(cn.detail).toContain("SGD");expect(cn.detail).toContain("2,750");
    expect(issue.issueKey).toBe("unmatched-payment:payment-unmatched-001");
    expect(issue.relatedEntityId).toBe("payment-unmatched-001");
  });
  it("uses the same canonical metadata for English and Traditional Chinese",()=>{
    const issue=base({type:"invoice-dispute",issueKey:"invoice-dispute:invoice-riverside-river-401",messageKey:"issue.invoiceDispute",messageParams:{invoice:"INV-RIVER-401"}});
    expect(presentInboxIssue(issue,"en").title).toContain("INV-RIVER-401");
    const tw=presentInboxIssue(issue,"zh-TW");expect(tw.title).toContain("INV-RIVER-401");expect(tw.title).not.toContain("Invoice");
  });
  it("falls back to stored presentation for legacy or unknown message keys",()=>{
    const issue=base({messageKey:"issue.unknown",title:"Legacy title",detail:"Legacy detail"});
    expect(presentInboxIssue(issue,"zh-CN")).toMatchObject({title:"Legacy title",detail:"Legacy detail"});
  });
  it("localizes resolution feedback while keeping raw fallback available",()=>{
    const issue=base({status:"escalated",resolution:"Escalated raw fallback",resolutionKey:"issue.resolution.escalated"});
    expect(presentInboxIssue(issue,"zh-CN").resolution).toContain("经理审核");
    expect(issue.resolution).toBe("Escalated raw fallback");
  });

  it("localizes runtime customer-not-found and approval-required issues",()=>{
    const missing=base({type:"ambiguous-customer",issueKey:"customer-not-found:missing-co",messageKey:"issue.customerNotFound",messageParams:{customer:"Missing Co"},relatedEntityType:"customer",relatedEntityId:"unresolved-customer"});
    expect(presentInboxIssue(missing,"zh-CN")).toMatchObject({title:"未找到客户：Missing Co"});
    const approval=base({type:"approval-required",issueKey:"approval:123",messageKey:"issue.approvalRequired",messageParams:{customer:"ACME"},relatedEntityType:"approval",relatedEntityId:"approval-123"});
    const tw=presentInboxIssue(approval,"zh-TW");expect(tw.title).toContain("ACME");expect(tw.title).not.toContain("Approval required");
  });
});
