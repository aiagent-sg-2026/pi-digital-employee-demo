import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const html=readFileSync("index.html","utf8"),controller=readFileSync("src/browser/dashboard-controller.ts","utf8"),router=readFileSync("src/browser/router.ts","utf8");
describe("product navigation contract",()=>{
  it("uses real hash destinations for every sidebar item",()=>{for(const route of ["home","work","inbox","customers","history","approvals","connections","capabilities","settings"])expect(html).toContain(`href="#/${route}"`);expect(html).not.toContain('href="#my-work"');expect(html).not.toContain('href="#customers-view"');});
  it("supports detail deep links and route hydration",()=>{expect(router).toContain('pieces[0]==="tasks"');expect(router).toContain('pieces[0]==="customers"');expect(router).toContain('pieces[0]==="approvals"');expect(controller).toContain('renderApprovalDetailPage');expect(controller).toContain('renderTaskPanels');expect(controller).toContain('await applyRoute(parseHash())');});
  it("keeps active state, aria-current, titles and filters route-aware",()=>{expect(controller).toContain('setAttribute("aria-current","page")');expect(controller).toContain('document.title');expect(controller).toContain('customerId=currentRoute.query.get("customerId")');expect(controller).toContain('inboxSeverityFilter');expect(controller).toContain('workStatusFilter');});
  it("makes View actions navigate instead of secretly populating the composer",()=>{expect(controller).toContain('routeHref("/inbox",{customerId:customer.id})');expect(controller).toContain('routeHref("/work",{customerId:customer.id})');expect(controller).toContain('View exceptions');expect(controller).toContain('View related tasks');});
});
