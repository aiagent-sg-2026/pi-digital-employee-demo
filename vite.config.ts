import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };
const appVersion = process.env.APP_VERSION_OVERRIDE ?? pkg.version;
const buildId = process.env.PWA_BUILD_ID
  ?? process.env.GITHUB_SHA?.slice(0, 7)
  ?? execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();

export default defineConfig({
  root: ".",
  base: "/pi-digital-employee-demo/",
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  build: { outDir: "dist", emptyOutDir: true },
});
