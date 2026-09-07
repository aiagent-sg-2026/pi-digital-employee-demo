import { hydrateSvgIcons } from "./icons";
import { bootstrapDashboard } from "./dashboard-controller";
import { bootstrapPwa } from "../pwa/client";
import { bootstrapI18n, t } from "../i18n";

async function start(){
  await bootstrapI18n();
  hydrateSvgIcons();
  void bootstrapPwa();
  await bootstrapDashboard();
}
void start().catch((error)=>{
  console.error("Digital Employee dashboard bootstrap failed",error);
  const feedback=document.querySelector<HTMLElement>("#composer-feedback");
  if(feedback)feedback.textContent=t("feedback.initFailed");
});
