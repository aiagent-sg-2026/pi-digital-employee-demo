import { runPhase0 } from "../shared/demo-agent";

const result = await runPhase0("node");
console.log("NODE_PHASE0_PASS");
console.log(JSON.stringify(result.evidence, null, 2));
