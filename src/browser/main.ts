import { hydrateSvgIcons } from "./icons";
import { bootstrapDashboard } from "./dashboard-controller";
import { bootstrapPwa } from "../pwa/client";
import { bootstrapI18n, t } from "../i18n";
import { setAppState } from "./app-state";

async function start(){
  await bootstrapI18n();
  setAppState("booting");
  hydrateSvgIcons();
  const pwa=bootstrapPwa();
  await bootstrapDashboard();
  setAppState("ready");
  void pwa;
}
void start().catch((error)=>{
  console.error("Digital Employee dashboard bootstrap failed",error);
  setAppState("error",t("loading.errorHelp"));
});
