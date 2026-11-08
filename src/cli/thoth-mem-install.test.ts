import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  executeThothMemCommand,
  getThothMemSetupCommand,
  runThothMemSetup,
  THOTH_MEM_SETUP_TIMEOUT_MS,
  type ThothMemCommandExecutor,
  type ThothMemSetupStatus,
} from './thoth-mem-install';

function providerJson(
  status: ThothMemSetupStatus,
  harness: 'opencode' | 'codex' | 'claude' | 'pi' = 'opencode',
): string {
  return JSON.stringify({
    status,
    changed: status === 'complete',
    ...(harness === 'opencode'
      ? {
          plugin: 'thoth-mem@0.6.3',
          opencodeVersion: '2.2.6',
          configPath: 'config',
          skillPath: 'skill',
          providerConfigPath: 'provider',
        }
      : {
          host: harness,
          source: 'thoth-mem',
          version: '0.7.0',
          verification:
            harness === 'pi'
              ? { package: true, source: true, manifest: true }
              : { marketplace: true, plugin: true, enabled: true },
        }),
    ...(harness === 'pi'
      ? { piVersion: '1.5.0' }
      : harness === 'opencode'
        ? {}
        : { strategy: 'plugin_manager', restartRequired: true }),
    actions: ['Verify provider-owned setup'],
    warnings: ['provider warning'],
    recovered: false,
    diagnostics: [`provider status: ${status}`],
    receiptPath:
      status === 'complete' ? `C:/receipts/${harness}-setup.json` : null,
  });
}

function executorReturning(
  exitCode: number | null,
  stdout: string,
  stderr = '',
): ThothMemCommandExecutor {
  return () => ({ exitCode, stdout, stderr });
}

describe('thoth-mem setup adapter', () => {
  test.each([
    ['opencode', 'opencode'],
    ['codex', 'codex'],
    ['claude', 'claude'],
    ['pi', 'pi'],
  ] as const)('builds the official global setup command for %s', (harness, providerHarness) => {
    expect(
      getThothMemSetupCommand(harness, false, { platform: 'linux' }),
    ).toEqual({
      command: 'npx',
      args: ['-y', 'thoth-mem@>=0.7.0', 'setup', providerHarness, '--json'],
    });
  });

  test('adds plan only for dry-run and never infers force from consumer setup', () => {
    const planned = getThothMemSetupCommand('codex', true, {
      platform: 'linux',
    });
    const applied = getThothMemSetupCommand('codex', false, {
      platform: 'linux',
    });

    expect(planned.args).toEqual([
      '-y',
      'thoth-mem@>=0.7.0',
      'setup',
      'codex',
      '--plan',
      '--json',
    ]);
    expect(applied.args).not.toContain('--plan');
    expect(planned.args).not.toContain('--force');
    expect(applied.args).not.toContain('--force');
  });

  test('routes the complete provider command through cmd.exe on Windows', () => {
    const commandShell = 'C:\\Windows\\System32\\cmd.exe';

    expect(
      getThothMemSetupCommand('codex', false, {
        platform: 'win32',
        commandShell,
      }),
    ).toEqual({
      command: commandShell,
      args: ['/d /s /c "npx -y "thoth-mem@>=0.7.0" setup codex --json"'],
    });
  });

  test('accepts only consistent complete provider evidence', () => {
    const result = runThothMemSetup({
      harness: 'opencode',
      commandExecutor: executorReturning(0, providerJson('complete')),
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        evidenceValid: true,
        status: 'complete',
        changed: true,
        harness: 'opencode',
        actions: ['Verify provider-owned setup'],
        warnings: ['provider warning'],
        diagnostics: ['provider status: complete'],
        receipt: 'C:/receipts/opencode-setup.json',
        exitCode: 0,
      }),
    );
  });

  test.each([
    ['unsupported', 1],
    ['requires-user-action', 1],
  ] as const)('preserves %s evidence without claiming success', (status, exitCode) => {
    const result = runThothMemSetup({
      harness: 'opencode',
      commandExecutor: executorReturning(exitCode, providerJson(status)),
    });

    expect(result.success).toBe(false);
    expect(result.evidenceValid).toBe(true);
    expect(result.status).toBe(status);
    expect(result.exitCode).toBe(exitCode);
    expect(result.diagnostics).toContain(`provider status: ${status}`);
    expect(result.actions).toEqual(['Verify provider-owned setup']);
  });

  test('rejects a status and exit-code contradiction', () => {
    const result = runThothMemSetup({
      harness: 'opencode',
      commandExecutor: executorReturning(0, providerJson('unsupported')),
    });

    expect(result.success).toBe(false);
    expect(result.evidenceValid).toBe(false);
    expect(result.status).toBe('unsupported');
    expect(result.error).toMatch(/exit code 0.*unsupported/i);
  });

  test.each([
    ['not-json', 'not json'],
    [
      'incomplete-json',
      JSON.stringify({ status: 'complete', harness: 'opencode' }),
    ],
    ['wrong-harness', providerJson('complete', 'codex')],
  ])('rejects %s provider output', (_caseName, stdout) => {
    const result = runThothMemSetup({
      harness: 'opencode',
      commandExecutor: executorReturning(0, stdout),
    });

    expect(result.success).toBe(false);
    expect(result.evidenceValid).toBe(false);
    expect(result.status).toBe('invalid');
    expect(result.error).toBeTruthy();
  });

  test('reports launch failures without fabricating provider evidence', () => {
    const result = runThothMemSetup({
      harness: 'claude',
      commandExecutor: () => {
        throw new Error('npx unavailable');
      },
    });

    expect(result.success).toBe(false);
    expect(result.evidenceValid).toBe(false);
    expect(result.status).toBe('invalid');
    expect(result.changed).toBe(false);
    expect(result.error).toContain('npx unavailable');
    expect(result.receipt).toBeNull();
  });

  test('bounds provider setup execution and reports timeout without fabricated evidence', () => {
    let observedTimeout: number | undefined;
    const timeoutError = Object.assign(new Error('spawnSync npx ETIMEDOUT'), {
      code: 'ETIMEDOUT',
    });

    const result = runThothMemSetup({
      harness: 'codex',
      commandExecutor: (_command, _args, options) => {
        observedTimeout = options.timeoutMs;
        return {
          exitCode: null,
          stdout: '',
          stderr: 'provider process exceeded its execution budget',
          error: timeoutError,
        };
      },
    });

    expect(THOTH_MEM_SETUP_TIMEOUT_MS).toBe(120_000);
    expect(observedTimeout).toBe(THOTH_MEM_SETUP_TIMEOUT_MS);
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        evidenceValid: false,
        status: 'invalid',
        changed: false,
        exitCode: null,
        receipt: null,
      }),
    );
    expect(result.error).toMatch(/timed out/i);
    expect(result.error).toContain(String(THOTH_MEM_SETUP_TIMEOUT_MS));
    expect(result.error).toContain('exceeded its execution budget');
  });
});

describe('thoth-mem 0.7 contract matrix', () => {
  test('rejects complete OpenCode evidence without recovered', () => {
    const fixture = JSON.parse(providerJson('complete'));
    delete fixture.recovered;
    expect(
      runThothMemSetup({
        harness: 'opencode',
        commandExecutor: executorReturning(0, JSON.stringify(fixture)),
      }),
    ).toMatchObject({
      success: false,
      evidenceValid: false,
      status: 'invalid',
    });
  });

  // Required fields from thoth-mem 0.7.0's per-host result interfaces.
  for (const harness of ['opencode', 'pi', 'codex', 'claude'] as const) {
    const requiredFields = [
      'status',
      'changed',
      'actions',
      'warnings',
      'receiptPath',
      'recovered',
      ...(harness === 'opencode'
        ? [
            'plugin',
            'opencodeVersion',
            'configPath',
            'skillPath',
            'providerConfigPath',
          ]
        : [
            'host',
            'source',
            'version',
            'verification',
            ...(harness === 'pi'
              ? [
                  'piVersion',
                  'verification.package',
                  'verification.source',
                  'verification.manifest',
                ]
              : [
                  'strategy',
                  'restartRequired',
                  'diagnostics',
                  'verification.marketplace',
                  'verification.plugin',
                  'verification.enabled',
                ]),
          ]),
    ];
    test.each(requiredFields)(
      '%s: ' + harness + ' rejects omission and wrong type independently',
      (field) => {
        for (const mutation of ['omit', 'mistype'] as const) {
          const fixture = JSON.parse(providerJson('complete', harness));
          const [parent, child] = field.split('.');
          const target = child ? fixture[parent] : fixture;
          const key = child ?? parent;
          if (mutation === 'omit') {
            delete target[key];
          } else {
            target[key] = typeof target[key] === 'boolean' ? 'false' : 42;
          }
          expect(
            runThothMemSetup({
              harness,
              commandExecutor: executorReturning(0, JSON.stringify(fixture)),
            }),
            `${harness} ${mutation} ${field}`,
          ).toMatchObject({
            success: false,
            evidenceValid: false,
            status: 'invalid',
          });
        }
      },
    );

    test(`${harness} tolerates unknown extra fields`, () => {
      expect(
        runThothMemSetup({
          harness,
          commandExecutor: executorReturning(
            0,
            JSON.stringify({
              ...JSON.parse(providerJson('complete', harness)),
              future: { anything: true },
            }),
          ),
        }).success,
      ).toBe(true);
    });
  }

  test.each([
    'codex',
    'claude',
  ] as const)('%s validates strategy literals and accepts false verification flags', (harness) => {
    const fixture = JSON.parse(providerJson('complete', harness));
    fixture.verification = {
      marketplace: false,
      plugin: false,
      enabled: false,
    };
    fixture.strategy = 'unsupported';
    expect(
      runThothMemSetup({
        harness,
        commandExecutor: executorReturning(0, JSON.stringify(fixture)),
      }).success,
    ).toBe(true);
    fixture.strategy = 'unknown';
    expect(
      runThothMemSetup({
        harness,
        commandExecutor: executorReturning(0, JSON.stringify(fixture)),
      }).success,
    ).toBe(false);
  });

  test.each([
    undefined,
    false,
  ] as const)('Claude accepts optional modelUse %s', (modelUse) => {
    const fixture = JSON.parse(providerJson('complete', 'claude'));
    if (modelUse !== undefined) fixture.verification.modelUse = modelUse;
    expect(
      runThothMemSetup({
        harness: 'claude',
        commandExecutor: executorReturning(0, JSON.stringify(fixture)),
      }).success,
    ).toBe(true);
  });

  test.each([
    true,
    'false',
    null,
  ])('rejects Claude modelUse %s outside its declared false type', (modelUse) => {
    const fixture = JSON.parse(providerJson('complete', 'claude'));
    fixture.verification.modelUse = modelUse;
    expect(
      runThothMemSetup({
        harness: 'claude',
        commandExecutor: executorReturning(0, JSON.stringify(fixture)),
      }).success,
    ).toBe(false);
  });

  test.each([
    'opencode',
    'pi',
    'codex',
    'claude',
  ] as const)('%s accepts only mode-consistent success', (harness) => {
    for (const dryRun of [true, false]) {
      const status = dryRun ? 'planned' : 'complete';
      const result = runThothMemSetup({
        harness,
        dryRun,
        commandExecutor: executorReturning(0, providerJson(status, harness)),
      });
      expect(result.success).toBe(true);
      expect(result.actions).toEqual(['Verify provider-owned setup']);
      expect(result.warnings).toEqual(['provider warning']);
      const wrongMode = runThothMemSetup({
        harness,
        dryRun: !dryRun,
        commandExecutor: executorReturning(0, providerJson(status, harness)),
      });
      expect(wrongMode.success).toBe(false);
      expect(wrongMode.evidenceValid).toBe(false);
    }
  });

  test.each([
    'codex',
    'claude',
  ] as const)('%s retains unsuccessful native-manager evidence', (harness) => {
    for (const status of ['unsupported', 'requires-user-action'] as const) {
      const result = runThothMemSetup({
        harness,
        commandExecutor: executorReturning(1, providerJson(status, harness)),
      });
      expect(result).toMatchObject({
        success: false,
        evidenceValid: true,
        status,
        restartRequired: true,
        actions: ['Verify provider-owned setup'],
        warnings: ['provider warning'],
        diagnostics: [`provider status: ${status}`],
      });
    }
  });

  test.each([
    ['status', 'unknown'],
    ['changed', 'false'],
    ['actions', [1]],
    ['warnings', null],
    ['receiptPath', false],
    ['diagnostics', [false]],
    ['restartRequired', 'yes'],
    ['host', 'pi'],
  ])('rejects mistyped or wrong %s', (field, value) => {
    const fixture = { ...JSON.parse(providerJson('complete')), [field]: value };
    expect(
      runThothMemSetup({
        harness: 'opencode',
        commandExecutor: executorReturning(0, JSON.stringify(fixture)),
      }),
    ).toMatchObject({
      success: false,
      evidenceValid: false,
      status: 'invalid',
    });
  });

  test.each([
    'status',
    'changed',
    'actions',
    'warnings',
    'receiptPath',
  ])('rejects missing %s', (field) => {
    const fixture = JSON.parse(providerJson('complete'));
    delete fixture[field];
    expect(
      runThothMemSetup({
        harness: 'opencode',
        commandExecutor: executorReturning(0, JSON.stringify(fixture)),
      }).success,
    ).toBe(false);
  });

  test.each([
    ['planned', 1],
    ['complete', 1],
    ['unsupported', 0],
    ['requires-user-action', 0],
    ['complete', 2],
  ] as const)('rejects status %s with exit %s', (status, exitCode) => {
    expect(
      runThothMemSetup({
        harness: 'codex',
        dryRun: status === 'planned',
        commandExecutor: executorReturning(
          exitCode,
          providerJson(status, 'codex'),
        ),
      }),
    ).toMatchObject({ success: false, evidenceValid: false, status, exitCode });
  });

  test.each([
    '',
    'not JSON',
  ])('reports bounded stderr for exit 1 without JSON (%s)', (stdout) => {
    const result = runThothMemSetup({
      harness: 'opencode',
      commandExecutor: executorReturning(
        1,
        stdout,
        `Setup failed: ${'x'.repeat(3000)}`,
      ),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Setup failed:');
    expect(result.error?.length).toBeLessThan(2100);
    expect(result.actions).toEqual([]);
  });

  test('accepts captured real OpenCode 0.7 plan with unknown extra fields', () => {
    const captured = {
      status: 'planned',
      changed: false,
      plugin: 'thoth-mem@0.6.3',
      opencodeVersion: '2.2.6',
      configPath: 'C:UsersEremesNG.configopencodeopencode.jsonc',
      skillPath: 'C:UsersEremesNG.configopencodeskills\thoth-mem',
      providerConfigPath: 'C:UsersEremesNG.config\thoth-memconfig.json',
      receiptPath: null,
      actions: [
        'converge one OpenCode plugin entry to thoth-mem@0.6.3',
        'remove only an unmodified receipt-owned copied Skill at C:UsersEremesNG.configopencodeskills\thoth-mem; use the packaged Skill',
        'preserve provider configuration',
        'restart OpenCode and verify native tools, packaged Skill, lifecycle, and recovery',
      ],
      recovered: false,
      warnings: [],
    };
    const result = runThothMemSetup({
      harness: 'opencode',
      dryRun: true,
      commandExecutor: executorReturning(
        0,
        `${JSON.stringify(captured, null, 2)}\n`,
      ),
    });
    expect(result).toMatchObject({
      success: true,
      status: 'planned',
      actions: captured.actions,
      warnings: [],
      receipt: null,
    });
    expect(
      runThothMemSetup({
        harness: 'opencode',
        dryRun: true,
        commandExecutor: executorReturning(
          0,
          JSON.stringify({ ...captured, future: { anything: true } }),
        ),
      }).success,
    ).toBe(true);
  });
});

test.skipIf(process.platform !== 'win32')(
  'Windows executor passes the selector literally without redirection',
  () => {
    const cwd = mkdtempSync(join(tmpdir(), 'thoth-mem-argv-'));
    try {
      const observer = join(cwd, 'observer.cjs');
      writeFileSync(
        observer,
        'console.log(JSON.stringify(process.argv.slice(2)))',
      );
      const { command, args } = getThothMemSetupCommand('opencode', true);
      const observed = executeThothMemCommand(
        command,
        args.map((arg) =>
          arg.replace('npx', `"${process.execPath}" "${observer}"`),
        ),
        { cwd, timeoutMs: 10000 },
      );
      expect(observed.error).toBeUndefined();
      expect(observed.exitCode).toBe(0);
      expect(JSON.parse(observed.stdout)).toEqual([
        '-y',
        'thoth-mem@>=0.7.0',
        'setup',
        'opencode',
        '--plan',
        '--json',
      ]);
      expect(existsSync(join(cwd, '=0.7.0'))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  },
);
