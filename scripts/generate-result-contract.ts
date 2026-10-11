import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SPECIALIST_RESULT_CONTRACT } from '../src/harness/core/agent-pack';

const output = new URL(
  '../skills/thoth-sdd/scripts/result-contract.json',
  import.meta.url,
);
writeFileSync(
  output,
  `${JSON.stringify(SPECIALIST_RESULT_CONTRACT, null, 2)}\n`,
);
const biome = new URL(
  '../node_modules/@biomejs/biome/bin/biome',
  import.meta.url,
);
const formatted = spawnSync(
  process.execPath,
  [fileURLToPath(biome), 'format', fileURLToPath(output), '--write'],
  { stdio: 'inherit' },
);
if (formatted.error) throw formatted.error;
if (formatted.status !== 0) process.exit(formatted.status ?? 1);
console.log(`Result contract written to ${output.pathname}`);
