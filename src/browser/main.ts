import { hydrateSvgIcons } from "./icons";
import { bootstrapDashboard } from "./dashboard-controller";
hydrateSvgIcons();
void bootstrapDashboard().catch((error)=>{
  console.error("Digital Employee dashboard bootstrap failed",error);
  const feedback=document.querySelector<HTMLElement>("#composer-feedback");
  if(feedback)feedback.textContent="Demo initialization failed. Reload the page or reset local site data.";
});
