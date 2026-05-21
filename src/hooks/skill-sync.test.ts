/// <reference types="bun-types" />

import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type {
  CustomSkill,
  InstallCustomSkillsReport,
} from '../cli/custom-skills';
import { syncSkillsOnStartup } from './skill-sync';

function createReport(
  overrides: Partial<InstallCustomSkillsReport> = {},
): InstallCustomSkillsReport {
  return {
    success: true,
    updatedSkills: [],
    skippedSkills: [],
    failedSkills: [],
    removedSkills: [],
    ...overrides,
  };
}

const installCustomSkillsMock = mock(() =>
  createReport({
    skippedSkills: [] as CustomSkill[],
  }),
);

const logMock = mock(() => {});
const consoleErrorMock = mock(() => {});
const consoleWarnMock = mock(() => {});

describe('syncSkillsOnStartup', () => {
  beforeEach(() => {
    installCustomSkillsMock.mockReset();
    installCustomSkillsMock.mockReturnValue(createReport());
    logMock.mockReset();
    consoleErrorMock.mockReset();
    consoleWarnMock.mockReset();
  });

  test('runs skill install once and logs when skills are up to date', () => {
    installCustomSkillsMock.mockReturnValue(
      createReport({
        skippedSkills: [
          {
            name: 'brainstorming',
            description: 'desc',
            allowedAgents: ['orchestrator'],
            sourcePath: 'src/skills/brainstorming',
          },
        ],
      }),
    );

    syncSkillsOnStartup({
      install: installCustomSkillsMock,
      logger: logMock,
      error: consoleErrorMock,
      warn: consoleWarnMock,
    });

    expect(installCustomSkillsMock).toHaveBeenCalledTimes(1);
    expect(logMock).toHaveBeenCalledWith('[skill-sync] Skills up to date', {
      failedSkills: [],
      removedSkills: [],
      skippedSkills: ['brainstorming'],
      updatedSkills: [],
    });
  });

  test('logs updated and removed skill counts', () => {
    installCustomSkillsMock.mockReturnValue(
      createReport({
        updatedSkills: [
          {
            skill: {
              name: 'brainstorming',
              description: 'desc',
              allowedAgents: ['orchestrator'],
              sourcePath: 'src/skills/brainstorming',
            },
            reasons: ['hash-mismatch'],
          },
        ],
        removedSkills: ['obsolete-skill'],
      }),
    );

    syncSkillsOnStartup({
      install: installCustomSkillsMock,
      logger: logMock,
      error: consoleErrorMock,
      warn: consoleWarnMock,
    });

    expect(logMock).toHaveBeenCalledWith(
      '[skill-sync] Updated 1 skill, removed 1 obsolete skill',
      {
        failedSkills: [],
        removedSkills: ['obsolete-skill'],
        skippedSkills: [],
        updatedSkills: ['brainstorming'],
      },
    );
  });

  test('does not throw if skill sync fails', () => {
    installCustomSkillsMock.mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() =>
      syncSkillsOnStartup({
        install: installCustomSkillsMock,
        logger: logMock,
        error: consoleErrorMock,
        warn: consoleWarnMock,
      }),
    ).not.toThrow();
    expect(consoleErrorMock).toHaveBeenCalledTimes(1);
    expect(logMock).toHaveBeenCalledWith(
      '[skill-sync] Skill sync failed during plugin startup',
      expect.any(Error),
    );
  });
});
