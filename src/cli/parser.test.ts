import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseInstallArgs, parseOperationArgs } from './parser';

describe('operation role effort parsing', () => {
  test('accepts Pi explicitly for install and operation selection', () => {
    expect(parseInstallArgs(['--agent=pi']).agent).toBe('pi');
    expect(parseOperationArgs(['--harness=pi']).harness).toBe('pi');
  });

  test('accepts an explicit local package root for Pi installation', () => {
    const localPackageRoot = resolve('fixtures/pi-local-package');

    expect(
      parseInstallArgs([
        '--agent=pi',
        '--local-package-root',
        localPackageRoot,
      ]),
    ).toMatchObject({ agent: 'pi', localPackageRoot });
    expect(
      parseInstallArgs([
        '--agent=pi',
        `--local-package-root=${localPackageRoot}`,
      ]),
    ).toMatchObject({ agent: 'pi', localPackageRoot });
  });

  test('accepts an explicit local Pi runtime root', () => {
    const localPiRuntimeRoot = resolve('fixtures/pi-local-runtime');

    expect(
      parseInstallArgs([
        '--agent=pi',
        '--local-pi-runtime-root',
        localPiRuntimeRoot,
      ]),
    ).toMatchObject({ agent: 'pi', localPiRuntimeRoot });
    expect(
      parseInstallArgs([
        '--agent=pi',
        `--local-pi-runtime-root=${localPiRuntimeRoot}`,
      ]),
    ).toMatchObject({ agent: 'pi', localPiRuntimeRoot });
  });

  test('rejects invalid local package root usage', () => {
    const localPackageRoot = resolve('fixtures/pi-local-package');

    expect(() => parseInstallArgs(['--local-package-root'])).toThrow(
      '--local-package-root requires a value.',
    );
    expect(() =>
      parseInstallArgs(['--agent=pi', '--local-package-root=relative/path']),
    ).toThrow('--local-package-root requires a normalized absolute path.');
    expect(() =>
      parseInstallArgs([
        '--agent=codex',
        `--local-package-root=${localPackageRoot}`,
      ]),
    ).toThrow('--local-package-root is supported only with --agent=pi.');
    expect(() =>
      parseInstallArgs([
        '--agent=pi',
        `--local-package-root=${localPackageRoot}`,
        `--local-package-root=${localPackageRoot}`,
      ]),
    ).toThrow('--local-package-root cannot be repeated.');

    expect(() =>
      parseInstallArgs(['--agent=pi', '--local-pi-runtime-root']),
    ).toThrow('--local-pi-runtime-root requires a value.');
    expect(() =>
      parseInstallArgs(['--agent=pi', '--local-pi-runtime-root=relative/path']),
    ).toThrow('--local-pi-runtime-root requires a normalized absolute path.');
    expect(() =>
      parseInstallArgs([
        '--agent=codex',
        `--local-pi-runtime-root=${resolve('fixtures/pi-local-runtime')}`,
      ]),
    ).toThrow('--local-pi-runtime-root is supported only with --agent=pi.');
  });
  test('merges repeatable role efforts with model input or an effort-only role', () => {
    const parsed = parseOperationArgs([
      '--harness=codex',
      '--role-model=worker=openai/gpt-5.6-sol',
      '--role-effort=worker=ultra',
    ]);

    expect(parsed.roles).toEqual([
      {
        role: 'worker',
        model: 'openai/gpt-5.6-sol',
        provider: undefined,
        effort: { kind: 'effort', value: 'ultra' },
      },
    ]);
  });

  test('rejects malformed, conflicting, and removed role inputs without partial output', () => {
    expect(() => parseOperationArgs(['--role-effort=quick=default'])).toThrow(
      'Unsupported removed agent role: quick',
    );
    expect(() =>
      parseOperationArgs(['--role-model=deep=openai/model']),
    ).toThrow('Unsupported removed agent role: deep');
    expect(() => parseOperationArgs(['--role-effort=worker'])).toThrow(
      '--role-effort must use role=effort or role:effort',
    );
    expect(() =>
      parseOperationArgs([
        '--role-effort=worker=high',
        '--role-effort=worker=low',
      ]),
    ).toThrow('Conflicting --role-effort values for worker');
  });

  test('preserves existing role, provider, and model flags', () => {
    expect(
      parseOperationArgs([
        '--harness=opencode',
        '--role=worker',
        '--provider=openai',
        '--model=gpt-5.4',
      ]).roles,
    ).toEqual([{ role: 'worker', model: 'gpt-5.4', provider: 'openai' }]);
  });
});
