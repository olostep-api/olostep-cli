import { Command } from "commander";

import { isJsonMode } from "../lib/output.js";

export function registerVersion(program: Command, version: string): void {
  program
    .command("version")
    .description("Show CLI version, Node version, and release channel.")
    .option("--json", "Machine-readable JSON output")
    .action((opts) => {
      const payload = {
        cli: version,
        node: process.version,
        channel: "stable",
      };

      if (isJsonMode(opts)) {
        process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
        return;
      }

      const lines: string[] = [];
      lines.push(`olostep ${version}`);
      lines.push(`node ${process.version}`);
      lines.push(`channel: ${payload.channel}`);
      process.stdout.write(lines.join("\n") + "\n");
    });
}
