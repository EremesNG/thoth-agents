import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { JobLaunchOptions } from '@thoth-agents/pi-core/windows-job';
import { expect, test, vi } from 'vitest';
import { launchJunie } from '../src/junie-process.js';

const fakeJob = () => {
  let reportExit!: (value: { code: number }) => void;
  const exited = new Promise<{ code: number }>((resolve) => {
    reportExit = resolve;
  });
  return {
    pid: 1,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exited,
    terminate: async () => reportExit({ code: 1 }),
    release: async () => {},
  };
};
test('direct launcher appends a headless config argument without changing UI launch', async () => {
  const launchJob = vi.fn(async (_options: JobLaunchOptions) => fakeJob());
  for (const configLocation of [
    undefined,
    "C:\\path with spaces\\O'Brien.json",
    'C:\\100% real\\config%PATH%.json',
  ]) {
    const child = await launchJunie({
      command: { file: 'junie.exe', args: [] },
      platform: 'win32',
      launchJob,
      configLocation,
    });
    await child.terminate();
  }
  expect(launchJob.mock.calls[0][0].args).toEqual([
    '--acp',
    'true',
    '--skip-update-check',
  ]);
  expect(launchJob.mock.calls[1][0].args).toEqual([
    '--acp',
    'true',
    '--skip-update-check',
    '--config-location',
    "C:\\path with spaces\\O'Brien.json",
  ]);
  expect(launchJob.mock.calls[2][0].args).toEqual([
    '--acp',
    'true',
    '--skip-update-check',
    '--config-location',
    'C:\\100% real\\config%PATH%.json',
  ]);
});

test.skipIf(process.platform !== 'win32')(
  'batch launcher round trips the config path through encoded PowerShell',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'junie batch '));
    const output = join(dir, 'args.json');
    const script = join(dir, 'capture.cjs');
    const shim = join(dir, 'junie.bat');
    const configLocations = [join(dir, "config O'Brien.json")];
    writeFileSync(
      script,
      `require('fs').writeFileSync(process.env.OUTPUT, JSON.stringify(process.argv.slice(2)))`,
    );
    writeFileSync(
      shim,
      `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`,
    );
    try {
      for (const configLocation of configLocations) {
        const child = await launchJunie({
          command: { file: shim, args: [] },
          configLocation,
          env: { OUTPUT: output },
        });
        const exit = await child.exited;
        expect(exit.code).toBe(0);
        expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual([
          '--acp',
          'true',
          '--skip-update-check',
          '--config-location',
          configLocation,
        ]);
        await child.terminate();
      }
    } finally {
      rmSync(dir, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  },
);

test.each([
  '%',
  '&',
  '^',
  '!',
  '"',
  '|',
  '<',
  '>',
  '\r',
  '\n',
])('unsafe batch config path containing %j fails before launch without a temporary copy', async (character) => {
  const dir = mkdtempSync(join(tmpdir(), 'junie-meta-'));
  const temp = join(dir, 'temp');
  mkdirSync(temp);
  const configDir = join(dir, `agent${character}dir`);
  const configLocation = join(configDir, 'native-tool-hooks.json');
  if (['%', '&', '^', '!'].includes(character)) {
    mkdirSync(configDir);
    writeFileSync(configLocation, '{"hooks":{"PreToolUse":[]}}');
  }
  const previousTemp = process.env.TEMP;
  const previousTmp = process.env.TMP;
  process.env.TEMP = temp;
  process.env.TMP = temp;
  const launchJob = vi.fn(async (_options: JobLaunchOptions) => fakeJob());
  try {
    const before = readdirSync(temp);
    await expect(
      launchJunie({
        command: { file: 'junie.bat', args: [] },
        platform: 'win32',
        configLocation,
        env: { TEMP: temp, TMP: temp, LOCALAPPDATA: temp },
        launchJob,
      }),
    ).rejects.toThrow(/JUNIE_BRIDGE_LAUNCHER.*junie\.exe/i);
    expect(launchJob).not.toHaveBeenCalled();
    expect(readdirSync(temp)).toEqual(before);
  } finally {
    if (previousTemp === undefined) delete process.env.TEMP;
    else process.env.TEMP = previousTemp;
    if (previousTmp === undefined) delete process.env.TMP;
    else process.env.TMP = previousTmp;
    rmSync(dir, { recursive: true, force: true });
  }
});
