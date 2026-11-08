import { afterEach, describe, expect, test, vi } from 'vitest';
import { requestOpenCodeSkillMoveConsent } from './opencode-skill-consent';
import { parseInstallArgs, parseOperationArgs } from './parser';

const mocks = vi.hoisted(() => ({
  question: vi.fn(),
  close: vi.fn(),
  interactive: false,
}));
vi.mock('node:readline/promises', () => ({
  createInterface: () => ({ question: mocks.question, close: mocks.close }),
}));
vi.mock('./runtime', () => ({
  detectRuntimeContext: () => ({}),
  isInteractiveRuntime: () => mocks.interactive,
}));
vi.mock('./owned-skills', () => ({
  inspectLegacyOpenCodeSkills: () => [{ sourcePath: '/legacy/thoth-sdd' }],
  getLegacyOpenCodeSkillBackupRoot: () => '/data/.opencode-legacy-skills',
}));
afterEach(() => {
  vi.restoreAllMocks();
  mocks.interactive = false;
  mocks.question.mockReset();
  mocks.close.mockReset();
});

describe('explicit legacy OpenCode skill move consent', () => {
  test('non-interactive runs require the dedicated flag', async () => {
    expect(await requestOpenCodeSkillMoveConsent({})).toBe(false);
    expect(
      await requestOpenCodeSkillMoveConsent({ moveLegacyOpenCodeSkills: true }),
    ).toBe(true);
    expect(mocks.question).not.toHaveBeenCalled();
  });
  test.each([
    ['yes', true],
    ['no', false],
    ['', false],
  ])('interactive answer %s yields %s', async (answer, expected) => {
    mocks.interactive = true;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mocks.question.mockResolvedValue(answer);
    expect(await requestOpenCodeSkillMoveConsent({})).toBe(expected);
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  test('dry-run never prompts or grants move consent even with the flag', async () => {
    mocks.interactive = true;
    expect(
      await requestOpenCodeSkillMoveConsent({
        dryRun: true,
        moveLegacyOpenCodeSkills: true,
      }),
    ).toBe(false);
    expect(mocks.question).not.toHaveBeenCalled();
  });
  test('install and Update parse only the dedicated explicit flag', () => {
    expect(
      parseInstallArgs(['--move-legacy-opencode-skills'])
        .moveLegacyOpenCodeSkills,
    ).toBe(true);
    expect(
      parseOperationArgs(['--move-legacy-opencode-skills'])
        .moveLegacyOpenCodeSkills,
    ).toBe(true);
    expect(
      parseInstallArgs(['--trust-hooks']).moveLegacyOpenCodeSkills,
    ).toBeUndefined();
    expect(() =>
      parseInstallArgs(['--move-legacy-opencode-skills=false']),
    ).toThrow();
  });
});
