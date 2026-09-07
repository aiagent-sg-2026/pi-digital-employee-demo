import { readFile, writeFile, readdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const version = process.env.APP_VERSION_OVERRIDE || pkg.version;
const buildId = process.env.PWA_BUILD_ID || process.env.GITHUB_SHA?.slice(0, 7) || execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();

async function listFiles(dir, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(path.join(dir, entry.name), relative));
    else out.push(relative);
  }
  return out;
}

const allFiles = await listFiles(dist);
const precache = ["./", ...allFiles.filter((file) => !["sw.js", "version.json"].includes(file))].sort();
const swPath = path.join(dist, "sw.js");
let sw = await readFile(swPath, "utf8");
sw = sw
  .replaceAll("__PWA_VERSION__", version)
  .replaceAll("__PWA_BUILD_ID__", buildId)
  .replace("__PWA_PRECACHE__", JSON.stringify(precache));
if (/__PWA_(VERSION|BUILD_ID|PRECACHE)__/.test(sw)) throw new Error("PWA service-worker placeholders were not fully replaced.");
await writeFile(swPath, sw);
await writeFile(path.join(dist, "version.json"), JSON.stringify({ version, buildId, builtAt: new Date().toISOString() }, null, 2));
console.log(`PWA finalized: v${version} · ${buildId} · ${precache.length} shell resources`);
