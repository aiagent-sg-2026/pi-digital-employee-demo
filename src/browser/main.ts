import { runPhase0 } from "../shared/demo-agent";

const status = document.querySelector<HTMLParagraphElement>("#status")!;
const evidence = document.querySelector<HTMLPreElement>("#evidence")!;

runPhase0("browser")
  .then((result) => {
    status.textContent = "BROWSER_PHASE0_PASS";
    status.dataset.phase0 = "pass";
    evidence.textContent = JSON.stringify(result.evidence, null, 2);
  })
  .catch((error) => {
    status.textContent = `BROWSER_PHASE0_FAIL: ${String(error)}`;
    status.dataset.phase0 = "fail";
  });
