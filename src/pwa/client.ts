import { onLocaleChange, t } from "../i18n";
export interface PwaVersionInfo { version: string; buildId: string; }

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const SW_URL = `${import.meta.env.BASE_URL}sw.js`;
const SW_SCOPE = import.meta.env.BASE_URL;
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

export const CURRENT_APP_VERSION: PwaVersionInfo = {
  version: __APP_VERSION__,
  buildId: __APP_BUILD_ID__,
};

function versionLabel(info: PwaVersionInfo): string {
  return `v${info.version} · ${info.buildId}`;
}

function getWorkerVersion(worker: ServiceWorker): Promise<PwaVersionInfo> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => reject(new Error("Service worker version request timed out.")), 2500);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout);
      const data = event.data as Partial<PwaVersionInfo>;
      if (typeof data.version === "string" && typeof data.buildId === "string") resolve({ version: data.version, buildId: data.buildId });
      else reject(new Error("Service worker returned an invalid version response."));
    };
    worker.postMessage({ type: "GET_VERSION" }, [channel.port2]);
  });
}

export async function bootstrapPwa(): Promise<void> {
  const versionNode = document.querySelector<HTMLElement>("#app-version");
  const pwaStatus = document.querySelector<HTMLElement>("#pwa-status");
  const versionRail = document.querySelector<HTMLElement>("#app-version-rail");
  const pwaStatusRail = document.querySelector<HTMLElement>("#pwa-status-rail");
  const installButton = document.querySelector<HTMLButtonElement>("#pwa-install");
  const updateBanner = document.querySelector<HTMLElement>("#pwa-update-banner");
  const updateVersion = document.querySelector<HTMLElement>("#pwa-update-version");
  const updateNow = document.querySelector<HTMLButtonElement>("#pwa-update-now");
  const updateLater = document.querySelector<HTMLButtonElement>("#pwa-update-later");
  const settingsVersion = document.querySelector<HTMLElement>("#settings-app-version");
  const settingsStatus = document.querySelector<HTMLElement>("#settings-pwa-status");
  const settingsUpdateState = document.querySelector<HTMLElement>("#settings-update-state");

  const currentLabel = versionLabel(CURRENT_APP_VERSION);
  if (versionNode) versionNode.textContent = currentLabel;
  if (versionRail) versionRail.textContent = currentLabel;
  if (settingsVersion) settingsVersion.textContent = currentLabel;
  if (settingsUpdateState) settingsUpdateState.textContent = t("settings.upToDate");
  if (!import.meta.env.PROD) {
    if (pwaStatus) pwaStatus.textContent = t("pwa.status.dev");
    if (pwaStatusRail) pwaStatusRail.textContent = t("pwa.status.devPreview");
    return;
  }
  if (!("serviceWorker" in navigator)) {
    if (pwaStatus) pwaStatus.textContent = t("pwa.status.unsupported");
    if (pwaStatusRail) pwaStatusRail.textContent = t("pwa.status.unsupported");
    return;
  }

  let installPrompt: BeforeInstallPromptEvent | null = null;
  let waitingWorker: ServiceWorker | null = null;
  let updateAcceptedByUser = false;
  let reloadingForUpdate = false;

  let statusKey = "pwa.status.offlineReady";
  let updateStateKey = "settings.upToDate";
  const setPwaStatus = (text: string) => {
    if (pwaStatus) pwaStatus.textContent = text;
    if (pwaStatusRail) pwaStatusRail.textContent = text;
    if (settingsStatus) settingsStatus.textContent = text;
  };
  const setUpdateState = (key:string) => {updateStateKey=key;if(settingsUpdateState)settingsUpdateState.textContent=t(key);};
  const syncNetworkStatus = () => {statusKey=navigator.onLine?"pwa.status.offlineReady":"pwa.status.offlineCached";setPwaStatus(t(statusKey));};
  window.addEventListener("online", syncNetworkStatus);
  window.addEventListener("offline", syncNetworkStatus);
  if (!navigator.onLine) syncNetworkStatus();

  const hideUpdate = () => {
    if (updateBanner) updateBanner.hidden = true;
  };

  const showWaitingWorker = async (worker: ServiceWorker) => {
    waitingWorker = worker;
    let info: PwaVersionInfo;
    try {
      info = await getWorkerVersion(worker);
    } catch {
      info = { version: "new", buildId: "build" };
    }
    if (updateVersion) updateVersion.textContent = versionLabel(info);
    if (updateBanner) updateBanner.hidden = false;
    setUpdateState("settings.updateReady");
  };

  const observeInstallingWorker = (registration: ServiceWorkerRegistration) => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      if (installing.state === "installed" && navigator.serviceWorker.controller && registration.waiting) {
        void showWaitingWorker(registration.waiting);
      }
    });
  };

  try {
    const registration = await navigator.serviceWorker.register(SW_URL, {
      scope: SW_SCOPE,
      updateViaCache: "none",
    });
    await navigator.serviceWorker.ready;
    syncNetworkStatus();

    if (registration.waiting) void showWaitingWorker(registration.waiting);
    registration.addEventListener("updatefound", () => observeInstallingWorker(registration));

    const checkForUpdate = () => void registration.update().catch(() => undefined);
    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkForUpdate(); });
    window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
    checkForUpdate();
  } catch (error) {
    if (navigator.onLine) {
      statusKey="pwa.status.unavailable";setPwaStatus(t(statusKey));
      console.error("PWA service worker registration failed", error);
    } else {
      statusKey="pwa.status.offlineCached";setPwaStatus(t(statusKey));
    }
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event as BeforeInstallPromptEvent;
    if (installButton) installButton.hidden = false;
  });

  installButton?.addEventListener("click", async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    installButton.hidden = true;
  });

  updateNow?.addEventListener("click", () => {
    if (!waitingWorker) return;
    updateAcceptedByUser = true;
    updateNow.disabled = true;
    updateNow.textContent = t("pwa.updating");
    setUpdateState("pwa.updating");
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  });
  updateLater?.addEventListener("click", hideUpdate);

  onLocaleChange(()=>{
    setPwaStatus(t(statusKey));
    if(updateNow&&!updateNow.disabled)updateNow.textContent=t("pwa.updateNow");
    if(updateLater)updateLater.textContent=t("pwa.later");
    if(installButton)installButton.textContent=t("pwa.install");
    if(settingsVersion)settingsVersion.textContent=currentLabel;
    if(settingsUpdateState)settingsUpdateState.textContent=t(updateStateKey);
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForUpdate || !updateAcceptedByUser) return;
    reloadingForUpdate = true;
    window.location.reload();
  });
}
