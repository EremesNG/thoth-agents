import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { THOTH_OWNED_SKILL_NAMES } from '../harness/core/owned-skills';
import { PI_ROOT_END, PI_ROOT_START } from '../harness/writers/pi-agent';
import { observePiNativeRoot } from './pi-native-probe';
import { PI_SPECIALIST_NAMES } from './pi-resources';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
describe('Pi native root probe', () => {
  test('uses an isolated Pi home and exact explicit-extension command shape', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-pi-probe-'));
    roots.push(root);
    const extensionPath = join(root, 'dist', 'pi.js');
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(extensionPath, 'export default () => {}');
    let observedArgs: readonly string[] = [];
    let observedHome = '';
    const result = observePiNativeRoot({
      extensionPath,
      manifestSha256: 'a'.repeat(64),
      extensionSha256: 'b'.repeat(64),
      commandExecutor: (_command, args, env) => {
        observedArgs = args;
        observedHome = env.PI_CODING_AGENT_DIR ?? '';
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            systemPrompt: `${PI_ROOT_START}\nroot\n${PI_ROOT_END}`,
            manifestSha256: 'a'.repeat(64),
            extensionSha256: 'b'.repeat(64),
            hookCount: 1,
          }),
          stderr: '',
        };
      },
    });
    expect(result.state).toBe('observed-at-install');
    expect(observedArgs.slice(0, 6)).toEqual([
      '--mode',
      'json',
      '--no-session',
      '--no-approve',
      '--offline',
      '--no-extensions',
    ]);
    expect(observedArgs.filter((arg) => arg === '--extension')).toHaveLength(2);
    expect(observedHome).not.toContain('.pi\\agent');
    expect(existsSync(observedHome)).toBe(false);
  });
  test('accepts the final provider observation from stderr', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-pi-probe-'));
    roots.push(root);
    const extensionPath = join(root, 'pi.js');
    writeFileSync(extensionPath, 'x');
    const result = observePiNativeRoot({
      extensionPath,
      manifestSha256: 'a'.repeat(64),
      extensionSha256: 'b'.repeat(64),
      commandExecutor: () => ({
        exitCode: 0,
        stdout: '{"type":"session"}',
        stderr: JSON.stringify({
          systemPrompt: `${PI_ROOT_START}\nroot\n${PI_ROOT_END}`,
          manifestSha256: 'a'.repeat(64),
          extensionSha256: 'b'.repeat(64),
          hookCount: 1,
          sessionStartCount: 1,
        }),
      }),
    });
    expect(result.state).toBe('observed-at-install');
  });
  test('returns real-session skill discovery and specialist materialization evidence', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-pi-probe-runtime-'));
    roots.push(root);
    const packageRoot = join(root, 'installed', 'thoth-agents');
    const extensionPath = join(packageRoot, 'dist', 'pi.js');
    mkdirSync(join(packageRoot, 'dist'), { recursive: true });
    writeFileSync(extensionPath, 'x');
    const discoveredSkills = THOTH_OWNED_SKILL_NAMES.map((name) => ({
      name,
      location: join(packageRoot, 'skills', name, 'SKILL.md'),
    }));
    const result = observePiNativeRoot({
      extensionPath,
      packageRoot,
      piHome: root,
      manifestSha256: 'a'.repeat(64),
      extensionSha256: 'b'.repeat(64),
      commandExecutor: () => ({
        exitCode: 0,
        stdout: JSON.stringify({
          systemPrompt: `${PI_ROOT_START}\nroot\n${PI_ROOT_END}`,
          manifestSha256: 'a'.repeat(64),
          extensionSha256: 'b'.repeat(64),
          hookCount: 1,
          sessionStartCount: 1,
          discoveredSkills,
          materializedSpecialists: [...PI_SPECIALIST_NAMES],
          orchestratorChild: false,
        }),
        stderr: '',
      }),
    });

    expect(result).toMatchObject({
      state: 'observed-at-install',
      discoveredSkills,
      materializedSpecialists: [...PI_SPECIALIST_NAMES],
      orchestratorChild: false,
      sessionStartCount: 1,
    });
    expect(existsSync(root)).toBe(true);
    expect(readdirSync(root)).not.toContain('observer.mjs');
  });
  test('does not promote missing or duplicate markers or digest mismatch', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-pi-probe-'));
    roots.push(root);
    const extensionPath = join(root, 'pi.js');
    writeFileSync(extensionPath, 'x');
    for (const systemPrompt of [
      '',
      `${PI_ROOT_START}${PI_ROOT_END}${PI_ROOT_START}${PI_ROOT_END}`,
    ])
      expect(
        observePiNativeRoot({
          extensionPath,
          manifestSha256: 'a'.repeat(64),
          extensionSha256: 'b'.repeat(64),
          commandExecutor: () => ({
            exitCode: 0,
            stdout: JSON.stringify({
              systemPrompt,
              manifestSha256: 'a'.repeat(64),
              extensionSha256: 'b'.repeat(64),
              hookCount: 1,
            }),
            stderr: '',
          }),
        }).state,
      ).toBe('unobserved');
    expect(
      observePiNativeRoot({
        extensionPath,
        manifestSha256: 'a'.repeat(64),
        extensionSha256: 'b'.repeat(64),
        commandExecutor: () => ({
          exitCode: 0,
          stdout: JSON.stringify({
            systemPrompt: `${PI_ROOT_START}\nroot\n${PI_ROOT_END}`,
            manifestSha256: 'c'.repeat(64),
            extensionSha256: 'b'.repeat(64),
            hookCount: 1,
          }),
          stderr: '',
        }),
      }).state,
    ).toBe('unobserved');
  });
  test('distinguishes a completed Pi process failure from an unavailable executable', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-pi-probe-'));
    roots.push(root);
    const extensionPath = join(root, 'pi.js');
    writeFileSync(extensionPath, 'x');
    const result = observePiNativeRoot({
      extensionPath,
      manifestSha256: 'a'.repeat(64),
      extensionSha256: 'b'.repeat(64),
      commandExecutor: () => ({
        exitCode: 2,
        stdout: '',
        stderr: 'provider rejected request',
      }),
    });
    expect(result).toMatchObject({
      state: 'unobserved',
      basis: [expect.stringContaining('provider rejected request')],
    });
  });
  test('reports unavailable when Pi cannot execute', () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-pi-probe-'));
    roots.push(root);
    const extensionPath = join(root, 'pi.js');
    writeFileSync(extensionPath, 'x');
    expect(
      observePiNativeRoot({
        extensionPath,
        manifestSha256: 'a'.repeat(64),
        extensionSha256: 'b'.repeat(64),
        commandExecutor: () => ({
          exitCode: null,
          stdout: '',
          stderr: 'missing',
        }),
      }).state,
    ).toBe('unavailable');
  });
});
