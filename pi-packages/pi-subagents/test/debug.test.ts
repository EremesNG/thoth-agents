import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isSubagentsDebugEnabled,
  writeSubagentsDebugLog,
} from '../src/debug.js';

let tmp: string;
let globalConfig: string;
let projectConfig: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-subagents-debug-'));
  const agentDir = path.join(tmp, 'agent');
  fs.mkdirSync(agentDir);
  fs.mkdirSync(path.join(tmp, '.pi'));
  globalConfig = path.join(agentDir, 'subagents.json');
  projectConfig = path.join(tmp, '.pi', 'subagents.json');
  fs.writeFileSync(globalConfig, '{}');
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-06T12:00:00.000Z'));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('subagent debug logging', () => {
  it('isolates cached flags when the global agent directory changes', () => {
    fs.writeFileSync(globalConfig, JSON.stringify({ debug: true }));
    const otherAgentDir = path.join(tmp, 'other-agent');
    fs.mkdirSync(otherAgentDir);
    fs.writeFileSync(
      path.join(otherAgentDir, 'subagents.json'),
      JSON.stringify({ debug: false }),
    );

    expect(isSubagentsDebugEnabled(tmp)).toBe(true);
    vi.stubEnv('PI_CODING_AGENT_DIR', otherAgentDir);
    expect(isSubagentsDebugEnabled(tmp)).toBe(false);
    vi.stubEnv('PI_CODING_AGENT_DIR', path.dirname(globalConfig));
    expect(isSubagentsDebugEnabled(tmp)).toBe(true);
  });

  it.each([
    false,
    true,
  ])('resolves debug=%s config only once during a one-second event burst', (enabled) => {
    fs.writeFileSync(projectConfig, JSON.stringify({ debug: enabled }));
    const read = vi.spyOn(fs, 'readFileSync');

    expect(isSubagentsDebugEnabled(tmp)).toBe(enabled);
    for (let event = 0; event < 20; event++) {
      writeSubagentsDebugLog(tmp, 'burst_event', { event });
    }
    vi.advanceTimersByTime(999);
    expect(isSubagentsDebugEnabled(tmp)).toBe(enabled);

    expect(read.mock.calls.map(([file]) => file)).toEqual([
      globalConfig,
      projectConfig,
    ]);
    expect(fs.existsSync(path.join(tmp, '.pi', 'subagents-debug.log'))).toBe(
      enabled,
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    'global',
    'project',
  ])('observes enabling and disabling in %s config at each 1000 ms boundary', (scope) => {
    const config = scope === 'global' ? globalConfig : projectConfig;
    fs.writeFileSync(config, JSON.stringify({ debug: false }));
    const read = vi.spyOn(fs, 'readFileSync');
    expect(isSubagentsDebugEnabled(tmp)).toBe(false);

    fs.writeFileSync(config, JSON.stringify({ debug: true }));
    vi.advanceTimersByTime(999);
    expect(isSubagentsDebugEnabled(tmp)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(isSubagentsDebugEnabled(tmp)).toBe(true);

    fs.writeFileSync(config, JSON.stringify({ debug: false }));
    vi.advanceTimersByTime(999);
    expect(isSubagentsDebugEnabled(tmp)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isSubagentsDebugEnabled(tmp)).toBe(false);
    expect(read.mock.calls.map(([file]) => file)).toEqual([
      globalConfig,
      projectConfig,
      globalConfig,
      projectConfig,
      globalConfig,
      projectConfig,
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [true, false],
    [false, true],
  ])('preserves global debug=%s / project debug=%s precedence across refreshes', (globalDebug, projectDebug) => {
    fs.writeFileSync(globalConfig, JSON.stringify({ debug: globalDebug }));
    fs.writeFileSync(projectConfig, JSON.stringify({ debug: projectDebug }));

    expect(isSubagentsDebugEnabled(tmp)).toBe(projectDebug);
    vi.advanceTimersByTime(1000);
    expect(isSubagentsDebugEnabled(tmp)).toBe(projectDebug);

    fs.rmSync(projectConfig);
    vi.advanceTimersByTime(1000);
    expect(isSubagentsDebugEnabled(tmp)).toBe(globalDebug);
  });

  it('keeps interleaved project caches independent and normalizes cwd aliases', () => {
    fs.writeFileSync(globalConfig, JSON.stringify({ debug: true }));
    const otherProject = path.join(tmp, 'other-project');
    fs.mkdirSync(path.join(otherProject, '.pi'), { recursive: true });
    fs.writeFileSync(
      path.join(otherProject, '.pi', 'subagents.json'),
      JSON.stringify({ debug: false }),
    );
    const read = vi.spyOn(fs, 'readFileSync');

    expect(isSubagentsDebugEnabled(tmp)).toBe(true);
    expect(isSubagentsDebugEnabled(otherProject)).toBe(false);
    expect(isSubagentsDebugEnabled(`${tmp}${path.sep}.`)).toBe(true);
    expect(isSubagentsDebugEnabled(otherProject)).toBe(false);
    expect(read).toHaveBeenCalledTimes(4);
  });

  it('isolates default global configs when the effective home directory changes', () => {
    const firstHome = path.join(tmp, 'first-home');
    const secondHome = path.join(tmp, 'second-home');
    for (const [home, debug] of [
      [firstHome, false],
      [secondHome, true],
    ] as const) {
      const agentDir = path.join(home, '.pi', 'agent');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(
        path.join(agentDir, 'subagents.json'),
        JSON.stringify({ debug }),
      );
    }
    vi.stubEnv('PI_CODING_AGENT_DIR', '');
    const homedir = vi.spyOn(os, 'homedir').mockReturnValue(firstHome);

    expect(isSubagentsDebugEnabled(tmp)).toBe(false);
    homedir.mockReturnValue(secondHome);
    expect(isSubagentsDebugEnabled(tmp)).toBe(true);
  });

  it('keeps debug logging best-effort if config location resolution fails', () => {
    vi.stubEnv('PI_CODING_AGENT_DIR', '');
    vi.spyOn(os, 'homedir').mockImplementation(() => {
      throw new Error('Home directory unavailable');
    });

    expect(isSubagentsDebugEnabled(tmp)).toBe(false);
    expect(() =>
      writeSubagentsDebugLog(tmp, 'unavailable_event', {}),
    ).not.toThrow();
    expect(fs.existsSync(path.join(tmp, '.pi', 'subagents-debug.log'))).toBe(
      false,
    );
  });

  it('refreshes rather than retaining a stale flag when the wall clock moves backwards', () => {
    fs.writeFileSync(projectConfig, JSON.stringify({ debug: false }));
    expect(isSubagentsDebugEnabled(tmp)).toBe(false);

    fs.writeFileSync(projectConfig, JSON.stringify({ debug: true }));
    vi.setSystemTime(new Date('2026-06-06T11:00:00.000Z'));
    expect(isSubagentsDebugEnabled(tmp)).toBe(true);
  });

  it('recovers from malformed config on the next refresh', () => {
    fs.writeFileSync(projectConfig, '{');
    expect(isSubagentsDebugEnabled(tmp)).toBe(false);

    fs.writeFileSync(projectConfig, JSON.stringify({ debug: 'yes' }));
    expect(isSubagentsDebugEnabled(tmp)).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(isSubagentsDebugEnabled(tmp)).toBe(true);
  });

  it('preserves exact log lines, error serialization, and gitignore handling', () => {
    fs.writeFileSync(projectConfig, JSON.stringify({ debug: true }));
    fs.mkdirSync(path.join(tmp, '.git'));
    fs.writeFileSync(path.join(tmp, '.gitignore'), 'node_modules');
    const error = new Error('broken');
    error.stack = 'Error: broken\n    at worker';

    writeSubagentsDebugLog(tmp, 'enabled_event', { ok: true });
    writeSubagentsDebugLog(tmp, 'error_event', { error });

    expect(
      fs.readFileSync(path.join(tmp, '.pi', 'subagents-debug.log'), 'utf8'),
    ).toBe(
      '2026-06-06T12:00:00.000Z enabled_event {"ok":true}\n' +
        '2026-06-06T12:00:00.000Z error_event {"error":{"name":"Error","message":"broken","stack":"Error: broken\\n    at worker"}}\n',
    );
    expect(fs.readFileSync(path.join(tmp, '.gitignore'), 'utf8')).toBe(
      'node_modules\n.pi/subagents-debug.log\n',
    );
  });

  it('preserves the 4000-character serialized payload limit', () => {
    fs.writeFileSync(projectConfig, JSON.stringify({ debug: true }));

    writeSubagentsDebugLog(tmp, 'long_event', 'x'.repeat(5000));

    expect(
      fs.readFileSync(path.join(tmp, '.pi', 'subagents-debug.log'), 'utf8'),
    ).toBe(`2026-06-06T12:00:00.000Z long_event "${'x'.repeat(3999)}\n`);
  });

  it('keeps direct checks without cwd disabled but defaults log writes to process cwd', () => {
    fs.writeFileSync(projectConfig, JSON.stringify({ debug: true }));
    vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    const read = vi.spyOn(fs, 'readFileSync');
    expect(isSubagentsDebugEnabled()).toBe(false);
    expect(isSubagentsDebugEnabled('')).toBe(false);
    expect(read).not.toHaveBeenCalled();

    writeSubagentsDebugLog(undefined, 'cwd_event', { ok: true });

    expect(
      fs.readFileSync(path.join(tmp, '.pi', 'subagents-debug.log'), 'utf8'),
    ).toBe('2026-06-06T12:00:00.000Z cwd_event {"ok":true}\n');
  });
});
