import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const controller=readFileSync("src/browser/dashboard-controller.ts","utf8");
const main=readFileSync("src/browser/main.ts","utf8");
const pwa=readFileSync("src/pwa/client.ts","utf8");
const db=readFileSync("src/data/indexeddb.ts","utf8");
const index=readFileSync("src/i18n/index.ts","utf8");
const html=readFileSync("index.html","utf8");

describe("browser i18n architecture contract",()=>{
  it("boots one locale controller before the PWA/dashboard",()=>{expect(main).toContain("await bootstrapI18n()");expect(index).toContain('type SupportedLocale = "en"|"zh-CN"|"zh-TW"');expect(index).toContain("navigator.languages");expect(index).toContain("ui-language");});
  it("uses a normalized IndexedDB preferences store without folding state into a giant object",()=>{expect(db).toContain('BUSINESS_DB_VERSION = 3');expect(db).toContain('preferences:"preferences"');expect(db).toContain('store!==STORES.preferences');});
  it("centralizes presentation formatting instead of allowing browser locale leakage",()=>{expect(controller).not.toMatch(/toLocale(String|DateString|TimeString)/);expect(controller).not.toContain('"en-SG"');expect(controller).not.toContain('"en-GB"');for(const helper of ["formatMoney","formatDate","formatDateTime","formatTime"])expect(controller).toContain(helper);});
  it("localizes dynamic status/verification/events while preserving technical ids",()=>{expect(controller).toContain("taskOutcomeKey");expect(controller).toContain("verificationLabel");expect(controller).toContain("activityLabel");expect(controller).toContain('class="technical-id"');expect(controller).toContain("JSON.stringify(evidence");});
  it("makes manager summary language presentation-only",()=>{expect(controller).toContain("Respond in ${language}");expect(controller).toContain("Language controls presentation only");expect(controller).toContain("must not alter verification or business truth");expect(controller).toContain("manager.summary.${summaryLocale}");});
  it("localizes PWA state through the same registry",()=>{expect(pwa).toContain('statusKey = "pwa.status.offlineReady"');expect(pwa).toContain('setPwaStatus(t(statusKey))');expect(pwa).toContain('t("pwa.updateNow")');expect(pwa).toContain("onLocaleChange");});
});

it("keeps the pre-i18n boot shell language-neutral",()=>{
  expect(html).toContain('<span id="bootstrap-status" class="sr-only"></span>');
  expect(html).toContain('body[data-app-state="booting"] .skip-link');
  const boot=html.slice(html.indexOf('<div id="app-bootstrap"'),html.indexOf('<div class="app" id="app-shell"'));
  expect(boot).not.toContain('Loading Digital Employee workspace');
});
