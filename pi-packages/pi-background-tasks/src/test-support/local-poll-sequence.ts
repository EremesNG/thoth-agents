import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandResult, CommandSpec } from "../types.js";

/** Real Node polls with a private on-disk counter; no external services or shell utilities. */
export class LocalPollSequence {
  readonly spec: CommandSpec;
  constructor(results: CommandResult[]) {
    const counter = join(mkdtempSync(join(tmpdir(), "bg-local-polls-")), "counter");
    this.spec = {
      shell: "none" as const,
      argv: [process.execPath, "-e", `
        const fs = require('node:fs');
        const results = JSON.parse(process.argv[1]);
        const counter = process.argv[2];
        let n = 0;
        try { n = Number(fs.readFileSync(counter, 'utf8')); } catch {}
        fs.writeFileSync(counter, String(n + 1));
        const result = results[Math.min(n, results.length - 1)];
        process.stdout.write(result.stdout);
        process.stderr.write(result.stderr);
        process.exitCode = result.exitCode;
      `, JSON.stringify(results), counter],
    };
  }
}
