export type DemoDelayPoint = "indexeddb"|"hydrate"|"route"|"execution"|"mutation";
declare global { interface Window { __DIGITAL_EMPLOYEE_TEST_DELAYS__?:Partial<Record<DemoDelayPoint,number>>; } }
export async function waitForDemoTestDelay(point:DemoDelayPoint):Promise<void>{
  const ms=typeof window!=="undefined"?Number(window.__DIGITAL_EMPLOYEE_TEST_DELAYS__?.[point]??0):0;
  if(ms>0)await new Promise(resolve=>window.setTimeout(resolve,ms));
}
