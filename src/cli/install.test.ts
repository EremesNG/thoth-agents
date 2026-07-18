import { describe, expect, test } from 'vitest';
import { createInstallConfig, install } from './install';

describe('install', () => {
  test('createInstallConfig always enables bundled custom skills', () => {
    const config = createInstallConfig({
      tui: false,
      skills: 'no',
      tmux: 'no',
      reset: false,
    });

    expect(config.installSkills).toBe(false);
    expect(config.installCustomSkills).toBe(true);
  });

  test('createInstallConfig still respects --skills for external skills', () => {
    const config = createInstallConfig({
      tui: false,
      skills: 'yes',
      tmux: 'yes',
      dryRun: true,
      reset: true,
    });

    expect(config.installSkills).toBe(true);
    expect(config.installCustomSkills).toBe(true);
    expect(config.hasTmux).toBe(true);
    expect(config.dryRun).toBe(true);
    expect(config.reset).toBe(true);
  });

  test('createInstallConfig keeps OpenCode installer behavior when Codex is configured elsewhere', () => {
    const config = createInstallConfig({
      tui: false,
      dryRun: true,
      reset: false,
    });

    expect(config).not.toHaveProperty('harness');
    expect(config.installCustomSkills).toBe(true);
  });

  test('OpenCode dry-run reports consumer install success without claiming provider setup or persistence', async () => {
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => lines.push(String(message));
    try {
      const code = await install({
        agent: 'opencode',
        tui: false,
        skills: 'no',
        tmux: 'no',
        dryRun: true,
        reset: false,
      });
      const output = lines.join('\n');

      expect(code).toBe(0);
      expect(output).toMatch(/thoth-agents (?:installation complete|updated)!/);
      expect(output).not.toContain('thoth-mem enabled');
      expect(output).not.toContain('Delegation results persisted to disk');
      expect(output).not.toContain('thoth-mem memory defaults');
      expect(output).toContain(
        'Provider capability is external and was not evidenced by this install.',
      );
    } finally {
      console.log = originalLog;
    }
  });
});
