/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import { createInstallConfig } from './install';

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
});
