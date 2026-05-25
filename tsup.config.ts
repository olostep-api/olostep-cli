import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/index.ts" },
  format: ["cjs"],
  target: "node18",
  outDir: "dist",
  clean: true,
  minify: false,
  sourcemap: false,
  splitting: false,
  shims: false,
  banner: { js: "#!/usr/bin/env node" },
});
