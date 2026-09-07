import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8")) as Record<string, unknown>;
const sw = readFileSync("public/sw.js", "utf8");
const client = readFileSync("src/pwa/client.ts", "utf8");
const buildScript = readFileSync("scripts/finalize-pwa.mjs", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version:string; scripts:Record<string,string> };

describe("PWA standard contract", () => {
  it("ships a scoped standalone manifest using SVG-only app icons", () => {
    expect(manifest.name).toBe("Alex · Digital Employee");
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");
    expect(manifest.display).toBe("standalone");
    const icons = manifest.icons as Array<Record<string,string>>;
    expect(icons.length).toBeGreaterThanOrEqual(2);
    expect(icons.every((icon) => icon.type === "image/svg+xml" && icon.src.endsWith(".svg"))).toBe(true);
    expect(icons.some((icon) => icon.purpose === "maskable")).toBe(true);
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('name="theme-color"');
  });

  it("uses versioned build output as the service-worker cache identity", () => {
    expect(pkg.version).toBe("0.2.0");
    expect(pkg.scripts.postbuild).toBe("node scripts/finalize-pwa.mjs");
    expect(sw).toContain('const APP_VERSION = "__PWA_VERSION__"');
    expect(sw).toContain('const BUILD_ID = "__PWA_BUILD_ID__"');
    expect(sw).toContain("digital-employee-shell-${APP_VERSION}-${BUILD_ID}");
    expect(buildScript).toContain("version.json");
    expect(buildScript).toContain("__PWA_PRECACHE__");
  });

  it("keeps updates user-controlled through a waiting worker", () => {
    expect(sw).not.toContain('self.skipWaiting();\n});');
    expect(sw).toContain('event.data?.type === "SKIP_WAITING"');
    expect(sw).toContain('event.data?.type === "GET_VERSION"');
    expect(client).toContain('registration.waiting');
    expect(client).toContain('updatefound');
    expect(client).toContain('waitingWorker.postMessage({ type: "SKIP_WAITING" })');
    expect(client).toContain('navigator.serviceWorker.addEventListener("controllerchange"');
    expect(html).toContain('id="pwa-update-version"');
    expect(html).toContain('id="pwa-update-now"');
    expect(html).toContain('Update Now');
  });

  it("shows current version and supports install UI", () => {
    expect(client).toContain("CURRENT_APP_VERSION");
    expect(client).toContain('beforeinstallprompt');
    expect(client).toContain('Offline · cached');
    expect(html).toContain('id="app-version"');
    expect(html).toContain('id="pwa-status"');
    expect(html).toContain('id="pwa-install"');
  });

  it("caches only same-origin GET app-shell traffic and leaves version checks network-fresh", () => {
    expect(sw).toContain('request.method !== "GET"');
    expect(sw).toContain('url.origin !== self.location.origin');
    expect(sw).toContain('url.pathname.endsWith("/version.json")');
    expect(sw).toContain('request.mode === "navigate"');
    expect(sw).toContain('cache: "no-store"');
    expect(sw).toContain("ignoreVary: true");
  });
});
