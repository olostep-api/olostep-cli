import { defineConfig } from "tsup";
import { readFileSync } from "node:fs";

// Read the version from package.json at build time so the bundled CLI's
// `--version` (and update-check, status output) always match what npm
// actually published. Without this, a hardcoded `const VERSION = "..."`
// in src/index.ts goes stale every release.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

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
  define: {
    __OLOSTEP_CLI_VERSION__: JSON.stringify(pkg.version),
  },
});
