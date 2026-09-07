import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const html=readFileSync("index.html","utf8");
const controller=readFileSync("src/browser/dashboard-controller.ts","utf8");
const pwa=readFileSync("src/pwa/client.ts","utf8");
const icons=readFileSync("src/browser/icons.ts","utf8");

describe("presentation polish contract",()=>{
  it("keeps Work operational and filterable by status/customer",()=>{
    expect(html).toContain('id="work-status-filter"');
    expect(html).toContain('id="work-customer-filter"');
    expect(controller).toContain('renderWorkCustomerFilter');
    expect(controller).toContain('terminal.has(a.task.status)');
  });
  it("makes Inbox hierarchy and manager decisions visually distinguishable",()=>{
    expect(controller).toContain('issue-manager');
    expect(controller).toContain('issue-operational');
    expect(controller).toContain('severity-${esc(item.severity)}');
    expect(controller).toContain('inbox.managerDecision');
  });
  it("keeps Customer detail contextual and honest",()=>{
    expect(controller).toContain('customers.exceptions');
    expect(controller).toContain('relatedIssues=issuePairs');
    expect(controller).toContain('routeHref("/inbox",{customerId:customer.id})');
    expect(controller).toContain('routeHref("/work",{customerId:customer.id})');
  });
  it("keeps verification prominent and raw evidence collapsed by record",()=>{
    expect(html).toContain('id="task-trust-summary"');
    expect(controller).toContain('task.verificationSummary');
    expect(controller).toContain('task-evidence-record');
    expect(controller).not.toContain('class="task-evidence-pre"');
  });
  it("documents employee responsibility on Capabilities and connection boundaries",()=>{
    for(const key of ['capabilities.reads','capabilities.mayChange','capabilities.approvalRequirement','capabilities.demoLimitation'])expect(controller).toContain(key);
    expect(controller).toContain('connections.appPurpose');
    expect(controller).toContain('connections.erp');
    expect(controller).toContain('connections.gmail');
  });
  it("groups Settings into language, PWA, demo data and about without weakening update semantics",()=>{
    for(const id of ['language-select','settings-app-version','settings-pwa-status','settings-update-state','clear-history','restore-business-data','reset-entire-demo'])expect(html).toContain(`id="${id}"`);
    expect(html).toContain('settings-boundaries');
    expect(pwa).toContain('settings-update-state');
    expect(pwa).toContain('updateAcceptedByUser = true');
  });
  it("keeps all newly introduced presentation icons SVG-based",()=>{
    for(const icon of ['globe','download','database','info'])expect(icons).toContain(`${icon}:`);
  });
  it("keeps route focus stable and plain mobile links touch-safe",()=>{
    expect(controller).toContain('closeDrawer(false)');
    expect(controller).toContain('function closeDrawer(restoreFocus=true)');
    expect(html).toContain('a.link-btn{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px}');
  });
});
