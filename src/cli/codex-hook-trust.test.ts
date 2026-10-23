import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { codexAdapter } from '../harness/adapters/codex';
import { codexHookTrustEntries } from './codex-hook-trust.js';

describe('Codex 0.162.1 hook trust', () => {
  it('omits JSON null option fields like TOML None values', () => {
    const absent = {
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: 'echo' }] }],
      },
    };
    const nullable = JSON.parse(
      '{"hooks":{"SessionStart":[{"matcher":null,"hooks":[{"type":"command","command":"echo","commandWindows":null,"statusMessage":null,"additionalContextLimit":null,"timeout":null}]}]}}',
    );
    expect(codexHookTrustEntries(nullable, 'test', 'win32')).toEqual(
      codexHookTrustEntries(absent, 'test', 'win32'),
    );
  });

  it('selects commandWindows only on Windows and hashes one normalized handler', () => {
    const declarations = {
      hooks: {
        SessionStart: [
          {
            matcher: 'startup',
            hooks: [
              { type: 'command', command: 'unix', commandWindows: 'windows' },
            ],
          },
        ],
      },
    };
    const normalized = (command: string) => ({
      hooks: {
        SessionStart: [
          {
            matcher: 'startup',
            hooks: [
              {
                type: 'command',
                command,
                timeout: 600,
                async: false,
                additionalContextLimit: 2500,
              },
            ],
          },
        ],
      },
    });
    expect(codexHookTrustEntries(declarations, 'test', 'win32')).toEqual(
      codexHookTrustEntries(normalized('windows'), 'test', 'linux'),
    );
    expect(codexHookTrustEntries(declarations, 'test', 'linux')).toEqual(
      codexHookTrustEntries(normalized('unix'), 'test', 'linux'),
    );
    expect(codexHookTrustEntries(declarations, 'test', 'win32')).not.toEqual(
      codexHookTrustEntries(declarations, 'test', 'linux'),
    );
  });

  it('normalizes timeout, context spill defaults and event matcher support independently per handler', () => {
    const entries = (
      hooks: Record<
        string,
        {
          matcher?: string;
          hooks: {
            type: string;
            command: string;
            timeout?: number;
            additionalContextLimit?: number;
            async?: boolean;
            statusMessage?: string;
          }[];
        }[]
      >,
    ) => codexHookTrustEntries({ hooks }, 'test', 'linux');
    const handler = { type: 'command', command: 'echo test' };
    expect(
      entries({ SessionEnd: [{ hooks: [{ ...handler, timeout: 99 }] }] }),
    ).toEqual(
      entries({ SessionEnd: [{ hooks: [{ ...handler, timeout: 3 }] }] }),
    );
    expect(
      entries({ UserPromptSubmit: [{ matcher: 'ignored', hooks: [handler] }] }),
    ).toEqual(
      entries({
        UserPromptSubmit: [
          {
            hooks: [{ ...handler, timeout: 600, additionalContextLimit: 2500 }],
          },
        ],
      }),
    );
    expect(
      entries({
        SessionStart: [{ hooks: [{ ...handler, additionalContextLimit: 0 }] }],
      }),
    ).not.toEqual(entries({ SessionStart: [{ hooks: [handler] }] }));
    const single = entries({ SessionStart: [{ hooks: [handler] }] });
    expect(
      entries({
        SessionStart: [
          { hooks: [handler, { ...handler, command: 'different' }] },
        ],
      })['test:session_start:0:0'],
    ).toBe(single['test:session_start:0:0']);
  });

  it('reproduces both thoth-agents hashes written by Codex Desktop on Windows', () => {
    const declarations = JSON.parse(
      readFileSync(
        new URL('./fixtures/codex-thoth-agents-hooks.json', import.meta.url),
        'utf8',
      ),
    );
    expect(
      codexHookTrustEntries(
        declarations,
        'thoth-agents@personal:codex-hooks/hooks.json',
        'win32',
      ),
    ).toEqual({
      'thoth-agents@personal:codex-hooks/hooks.json:session_start:0:0':
        'sha256:08e76f0d3fae100991f3e7735681833a19e3a8f1fc0eb7ea53e0bf52d7cc21fc',
      'thoth-agents@personal:codex-hooks/hooks.json:subagent_start:0:0':
        'sha256:3325f77ea820492b2762908cbb2d957ead63be0bda938cba974ad2ac5a7e9fb0',
    });
  });

  it.each([
    'win32',
    'linux',
  ] as const)('trusts the new delivery declaration on %s without changing root/role hashes', (platform) => {
    const artifact = codexAdapter
      .render({ projectRoot: process.cwd() })
      .artifacts.find(
        (entry) => entry.path === '.codex-plugin/codex-hooks/hooks.json',
      );
    const declarations = JSON.parse(String(artifact?.content));
    expect(codexHookTrustEntries(declarations, 'test', platform)).toEqual({
      'test:session_start:0:0':
        'sha256:08e76f0d3fae100991f3e7735681833a19e3a8f1fc0eb7ea53e0bf52d7cc21fc',
      'test:subagent_start:0:0':
        'sha256:3325f77ea820492b2762908cbb2d957ead63be0bda938cba974ad2ac5a7e9fb0',
      'test:post_tool_use:0:0':
        'sha256:4f046bcabe9e0faaea318a69a7d1262fa31f988fe1e0b9470a0fb8626095a4c1',
    });
  });

  it('reproduces all five hashes written by Codex on Windows', () => {
    const declarations = JSON.parse(
      readFileSync(
        new URL('./fixtures/codex-thoth-mem-hooks.json', import.meta.url),
        'utf8',
      ),
    );
    const entries = codexHookTrustEntries(
      declarations,
      'thoth-mem@thoth-mem:hooks/hooks.json',
      'win32',
    );
    expect(entries).toEqual({
      'thoth-mem@thoth-mem:hooks/hooks.json:pre_compact:0:0':
        'sha256:f6fd6148da8f1bcd414f4ff2dd5d16b9d26dfb30d364777fa0b2557b1efa1160',
      'thoth-mem@thoth-mem:hooks/hooks.json:post_compact:0:0':
        'sha256:ba95c2199b19b66be72ac257b5e5dd113dab319e3d018fde102727494d13ef76',
      'thoth-mem@thoth-mem:hooks/hooks.json:session_start:0:0':
        'sha256:1bac29436e9f8bf8113d01c6a93c8a436c706631d038569f8e849c9d9bb06d35',
      'thoth-mem@thoth-mem:hooks/hooks.json:session_end:0:0':
        'sha256:185d35b62232b61699dd9e6a8da4df7863f6002017f3848a28a59e36a3ea11d4',
      'thoth-mem@thoth-mem:hooks/hooks.json:user_prompt_submit:0:0':
        'sha256:7b31ec7ce22d0408d09fe615fcb24f83bf62044942330cfb677beca810d6e70e',
    });
  });
});
