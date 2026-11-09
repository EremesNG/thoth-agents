import { execFile } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { promisify } from 'node:util';
import {
  getPowerShellConfig,
  getShellConfig,
} from '@earendil-works/pi-coding-agent';
import { launchInJob } from '@thoth-agents/pi-core/windows-job';
import { beforeAll, describe, expect, it } from 'vitest';
import { createContainedOperations } from '../src/index.ts';

const exec = promisify(execFile);
const windows = process.platform === 'win32';
async function powershell(script: string): Promise<string> {
  const result = await exec(
    getPowerShellConfig().shell,
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64'),
    ],
    { timeout: 15_000, windowsHide: true },
  );
  return result.stdout.trim();
}
async function markerPids(marker: string): Promise<number[]> {
  // The query's own command line is encoded, so it cannot match the literal marker.
  return JSON.parse(
    await powershell(
      `$ids = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${marker}') } | ForEach-Object { [int]$_.ProcessId }); ConvertTo-Json -Compress -InputObject $ids`,
    ),
  ) as number[];
}
async function cleanupMarker(marker: string): Promise<void> {
  for (const pid of await markerPids(marker)) {
    // Only exact-marker matches are eligible; never walk parents or kill by name.
    await powershell(
      `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}"; if ($p.CommandLine -and $p.CommandLine.Contains('${marker}')) { Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue }`,
    );
  }
}
function operations(kind: 'bash' | 'powershell') {
  return createContainedOperations(kind, () => {
    throw new Error('Integration requires a working job launcher');
  });
}

describe.skipIf(!windows)('Windows shell containment', () => {
  beforeAll(async () => {
    // Pay the per-worker PowerShell/Add-Type cold start outside command deadlines.
    const job = await launchInJob({
      file: process.execPath,
      args: ['-e', ''],
      cwd: process.cwd(),
      env: process.env,
    });
    job.stdin.end();
    job.stdout.resume();
    job.stderr.resume();
    try {
      await job.exited;
    } finally {
      try {
        await job.terminate(5_000);
      } finally {
        await job.release();
      }
    }
  }, 60_000);

  it.each([
    'pipeline',
    'nested',
    'powershell',
  ] as const)('contains %s timeout descendants', async (kind) => {
    const marker = String(randomInt(100_000_000, 999_999_999));
    const bashCommand =
      kind === 'nested'
        ? `bash -c 'sleep ${marker}; echo done' | head -1`
        : `sleep ${marker} | head -1`;
    const bash = getShellConfig().shell.replaceAll("'", "''");
    const command =
      kind === 'powershell'
        ? `& '${bash}' -c 'sleep ${marker} | head -1'`
        : bashCommand;
    try {
      await expect(
        operations(kind === 'powershell' ? 'powershell' : 'bash').exec(
          command,
          process.cwd(),
          {
            onData: () => {},
            timeout: 1.5,
          },
        ),
      ).rejects.toThrow(/^timeout:1.5$/);
      expect(await markerPids(marker)).toEqual([]);
    } finally {
      await cleanupMarker(marker);
    }
  }, 30_000);

  it('kills background descendants on normal exit and preserves UTF-8 output and exit status', async () => {
    const marker = String(randomInt(100_000_000, 999_999_999));
    const output: Buffer[] = [];
    try {
      const result = await operations('bash').exec(
        `sleep ${marker} & printf 'final stdout'; printf 'final stderr' >&2; exit 23`,
        process.cwd(),
        {
          onData: (b) => output.push(b),
          timeout: 5,
        },
      );
      expect(result).toEqual({ exitCode: 23 });
      const text = Buffer.concat(output).toString();
      expect(text).toContain('final stdout');
      expect(text).toContain('final stderr');
      expect(await markerPids(marker)).toEqual([]);
      const ps: Buffer[] = [];
      expect(
        await operations('powershell').exec(
          "Write-Output 'café'; exit 7",
          process.cwd(),
          {
            onData: (b) => ps.push(b),
            timeout: 5,
          },
        ),
      ).toEqual({ exitCode: 7 });
      expect(Buffer.concat(ps).toString()).toContain('café');
    } finally {
      await cleanupMarker(marker);
    }
  }, 30_000);

  it.each([
    'bash',
    'powershell',
  ] as const)('contains %s abort descendants', async (kind) => {
    const marker = String(randomInt(100_000_000, 999_999_999));
    const bash = getShellConfig().shell.replaceAll("'", "''");
    const command =
      kind === 'bash'
        ? `sleep ${marker} | head -1`
        : `& '${bash}' -c 'sleep ${marker} | head -1'`;
    const controller = new AbortController();
    const running = operations(kind).exec(command, process.cwd(), {
      onData: () => {},
      signal: controller.signal,
      timeout: 15,
    });
    const rejected = expect(running).rejects.toThrow(/^aborted$/);
    try {
      await expect
        .poll(async () => (await markerPids(marker)).length, {
          timeout: 10_000,
        })
        .toBeGreaterThan(1);
      controller.abort();
      await rejected;
      expect(await markerPids(marker)).toEqual([]);
    } finally {
      controller.abort();
      await running.catch(() => {});
      await cleanupMarker(marker);
    }
  }, 30_000);
});
