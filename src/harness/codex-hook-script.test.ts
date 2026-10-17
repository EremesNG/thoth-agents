import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { codexAdapter } from './adapters/codex';

describe('Codex hook command runtime', () => {
  test('injects complete root and each native TOML role payload with built-ins only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoth-codex-hooks-'));
    try {
      const result = codexAdapter.render({ projectRoot: process.cwd() });
      for (const artifact of result.artifacts) {
        if (!artifact.path.startsWith('.codex-plugin/codex-hooks/')) continue;
        const path = join(dir, artifact.path.slice('.codex-plugin/'.length));
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, String(artifact.content));
      }
      const declarations = JSON.parse(
        readFileSync(join(dir, 'codex-hooks/hooks.json'), 'utf8'),
      );
      const command = declarations.hooks.SessionStart[0].hooks[0].command;
      // Execute the exact portable loader without a shell, from outside the plugin.
      const loader = command.slice('node -e "'.length, -1);
      const run = (input: string) => {
        const output = spawnSync(process.execPath, ['-e', loader], {
          input,
          encoding: 'utf8',
          cwd: tmpdir(),
          env: { ...process.env, PLUGIN_ROOT: dir },
          timeout: 5_000,
        });
        expect(output.error).toBeUndefined();
        expect(output.status).toBe(0);
        expect(output.stderr).toBe('');
        return output.stdout;
      };
      const roles = result.artifacts
        .filter((a) => a.kind === 'agent-config')
        .map((a) => String(a.content).match(/^name = "([^"]+)"/m)?.[1]);
      expect(roles).toEqual([
        'explorer',
        'librarian',
        'oracle',
        'designer',
        'worker',
      ]);
      for (const role of [undefined, ...roles]) {
        const event = role ? 'SubagentStart' : 'SessionStart';
        expect(
          JSON.parse(
            run(JSON.stringify({ hook_event_name: event, agent_type: role })),
          ),
        ).toEqual({
          hookSpecificOutput: {
            hookEventName: event,
            additionalContext: readFileSync(
              join(dir, 'codex-hooks/payloads', `${role ?? 'root'}.md`),
              'utf8',
            ),
          },
        });
      }
      for (const input of [
        '',
        '{',
        'null',
        '[]',
        '42',
        '"text"',
        '{}',
        JSON.stringify({ hook_event_name: 'Stop' }),
        ...[
          'unknown',
          'orchestrator',
          'thoth-agents-oracle',
          '../root',
          'constructor',
          null,
          {},
        ].map((agent_type) =>
          JSON.stringify({ hook_event_name: 'SubagentStart', agent_type }),
        ),
      ])
        expect(run(input), input).toBe('');
      rmSync(join(dir, 'codex-hooks/payloads/root.md'));
      expect(run('{"hook_event_name":"SessionStart"}')).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
