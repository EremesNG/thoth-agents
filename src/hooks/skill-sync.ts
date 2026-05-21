import { installCustomSkills } from '../cli/custom-skills';
import { log } from '../utils/logger';

interface SkillSyncDependencies {
  install?: typeof installCustomSkills;
  logger?: typeof log;
  warn?: typeof console.warn;
  error?: typeof console.error;
}

function formatSkillSyncSummary(
  report: ReturnType<typeof installCustomSkills>,
): string {
  if (
    report.updatedSkills.length === 0 &&
    report.removedSkills.length === 0 &&
    report.failedSkills.length === 0
  ) {
    return 'Skills up to date';
  }

  const parts: string[] = [];

  if (report.updatedSkills.length > 0) {
    parts.push(
      `Updated ${report.updatedSkills.length} skill${report.updatedSkills.length === 1 ? '' : 's'}`,
    );
  }

  if (report.removedSkills.length > 0) {
    parts.push(
      `removed ${report.removedSkills.length} obsolete skill${report.removedSkills.length === 1 ? '' : 's'}`,
    );
  }

  if (report.failedSkills.length > 0) {
    parts.push(
      `failed ${report.failedSkills.length} skill${report.failedSkills.length === 1 ? '' : 's'}`,
    );
  }

  return parts.join(', ');
}

export function syncSkillsOnStartup(
  dependencies: SkillSyncDependencies = {},
): void {
  const install = dependencies.install ?? installCustomSkills;
  const logger = dependencies.logger ?? log;
  const warn = dependencies.warn ?? console.warn;
  const errorLogger = dependencies.error ?? console.error;

  try {
    const report = install();
    const summary = formatSkillSyncSummary(report);

    logger(`[skill-sync] ${summary}`, {
      updatedSkills: report.updatedSkills.map(({ skill }) => skill.name),
      removedSkills: report.removedSkills,
      skippedSkills: report.skippedSkills.map((skill) => skill.name),
      failedSkills: report.failedSkills.map(({ skill }) => skill.name),
    });

    if (report.failedSkills.length > 0) {
      warn(
        `[skill-sync] Failed to sync ${report.failedSkills.length} bundled skill${report.failedSkills.length === 1 ? '' : 's'}`,
      );
    }
  } catch (error) {
    errorLogger('[skill-sync] Failed to sync bundled skills on startup');
    logger('[skill-sync] Skill sync failed during plugin startup', error);
  }
}
