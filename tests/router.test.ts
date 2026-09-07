import {describe,expect,it} from "vitest";
import {navParent,parseHash,routeHref} from "../src/browser/router";
describe("hash router",()=>{
 it("parses page and detail routes",()=>{expect(parseHash("#/home").name).toBe("home");expect(parseHash("#/tasks/task-1?tab=timeline")).toMatchObject({name:"task",params:{taskId:"task-1"}});expect(parseHash("#/customers/customer-acme")).toMatchObject({name:"customer",params:{customerId:"customer-acme"}});expect(parseHash("#/approvals/approval-1")).toMatchObject({name:"approval",params:{approvalId:"approval-1"}});});
 it("parses URL queries",()=>{const route=parseHash("#/inbox?customerId=customer-acme&type=unmatched-payment");expect(route.query.get("customerId")).toBe("customer-acme");expect(route.query.get("type")).toBe("unmatched-payment");expect(routeHref("/work",{customerId:"customer-acme"})).toBe("#/work?customerId=customer-acme");});
 it("maps detail pages to sidebar parents",()=>{expect(navParent(parseHash("#/tasks/a"))).toBe("work");expect(navParent(parseHash("#/customers/a"))).toBe("customers");expect(navParent(parseHash("#/approvals/a"))).toBe("approvals");});
});
