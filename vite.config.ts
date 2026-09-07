import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  base: "/pi-digital-employee-demo/",
  build: { outDir: "dist", emptyOutDir: true },
});
