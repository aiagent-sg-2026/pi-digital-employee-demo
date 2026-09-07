import { t } from "../i18n";

export type AppPresentationState = "booting" | "ready" | "error";

export function getAppState():AppPresentationState{return (document.body.dataset.appState as AppPresentationState|undefined)??"booting";}
export function setAppState(state:AppPresentationState,detail?:string):void{
  document.body.dataset.appState=state;
  document.body.setAttribute("aria-busy",state==="booting"?"true":"false");
  const main=document.querySelector<HTMLElement>("#main-content");
  if(main)main.setAttribute("aria-busy",state==="booting"?"true":"false");
  const shell=document.querySelector<HTMLElement>("#app-bootstrap");
  const status=document.querySelector<HTMLElement>("#bootstrap-status");
  const error=document.querySelector<HTMLElement>("#bootstrap-error");
  const app=document.querySelector<HTMLElement>("#app-shell");
  if(shell)shell.setAttribute("aria-busy",state==="booting"?"true":"false");
  if(status)status.textContent=state==="booting"?t("loading.app"):state==="error"?t("loading.error"):"";
  if(error){error.hidden=state!=="error";error.textContent=state==="error"?(detail||t("loading.errorHelp")):"";}
  if(app)app.setAttribute("aria-hidden",state==="ready"?"false":"true");
}
