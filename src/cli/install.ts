import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { cwd } from 'node:process';
import {
  applyCodexSetup,
  buildCodexSetupPlan,
  formatCodexSetupPlan,
} from './codex-install';
import {
  addPluginToOpenCodeConfig,
  detectCurrentConfig,
  disableDefaultAgents,
  generateLiteConfig,
  getOpenCodePath,
  getOpenCodeVersion,
  isOpenCodeInstalled,
  writeLiteConfig,
} from './config-manager';
import {
  CUSTOM_SKILLS,
  type InstallCustomSkillsReport,
  installCustomSkills,
} from './custom-skills';
import { getExistingLiteConfigPath } from './paths';
import { installRecommendedSkill, RECOMMENDED_SKILLS } from './skills';
import type { ConfigMergeResult, InstallArgs, InstallConfig } from './types';

// Colors
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const SYMBOLS = {
  check: `${GREEN}✓${RESET}`,
  cross: `${RED}✗${RESET}`,
  arrow: `${BLUE}→${RESET}`,
  bullet: `${DIM}•${RESET}`,
  info: `${BLUE}ℹ${RESET}`,
  warn: `${YELLOW}⚠${RESET}`,
  star: `${YELLOW}★${RESET}`,
};

function printHeader(isUpdate: boolean): void {
  console.log();
  console.log(`${BOLD}thoth-agents ${isUpdate ? 'Update' : 'Install'}${RESET}`);
  console.log('='.repeat(30));
  console.log();
}

function printStep(step: number, total: number, message: string): void {
  console.log(`${DIM}[${step}/${total}]${RESET} ${message}`);
}

function printSuccess(message: string): void {
  console.log(`${SYMBOLS.check} ${message}`);
}

function printError(message: string): void {
  console.log(`${SYMBOLS.cross} ${RED}${message}${RESET}`);
}

function printInfo(message: string): void {
  console.log(`${SYMBOLS.info} ${message}`);
}

function formatCustomSkillReasons(report: InstallCustomSkillsReport): string {
  if (report.updatedSkills.length === 0 && report.removedSkills.length === 0) {
    return 'all bundled skills already up to date';
  }

  return `${report.updatedSkills.length} updated, ${report.removedSkills.length} removed, ${report.skippedSkills.length} unchanged`;
}

function formatSkillReasons(reasons: string[]): string {
  return reasons.join(', ');
}

async function checkOpenCodeInstalled(): Promise<{
  ok: boolean;
  version?: string;
  path?: string;
}> {
  const installed = await isOpenCodeInstalled();
  if (!installed) {
    printError('OpenCode is not installed on this system.');
    printInfo('Install it with:');
    console.log(
      `     ${BLUE}curl -fsSL https://opencode.ai/install | bash${RESET}`,
    );
    console.log();
    printInfo('Or if already installed, add it to your PATH:');
    console.log(`     ${BLUE}export PATH="$HOME/.local/bin:$PATH"${RESET}`);
    console.log(`     ${BLUE}export PATH="$HOME/.opencode/bin:$PATH"${RESET}`);
    return { ok: false };
  }
  const version = await getOpenCodeVersion();
  const path = getOpenCodePath();
  const detectedVersion = version ?? '';
  const pathInfo = path ? ` (${DIM}${path}${RESET})` : '';
  printSuccess(`OpenCode ${detectedVersion} detected${pathInfo}`);
  return { ok: true, version: version ?? undefined, path: path ?? undefined };
}

function handleStepResult(
  result: ConfigMergeResult,
  successMsg: string,
): boolean {
  if (!result.success) {
    printError(`Failed: ${result.error}`);
    return false;
  }
  printSuccess(
    `${successMsg} ${SYMBOLS.arrow} ${DIM}${result.configPath}${RESET}`,
  );
  return true;
}

function formatConfigSummary(): string {
  const lines: string[] = [];
  lines.push(`${BOLD}Configuration Summary${RESET}`);
  lines.push('');
  lines.push(`  ${BOLD}Preset:${RESET} ${BLUE}openai${RESET}`);
  lines.push(`  ${SYMBOLS.check} Seven-agent thoth-agents roster`);
  lines.push(`  ${SYMBOLS.check} OpenAI models by default`);
  lines.push(`  ${SYMBOLS.check} thoth-mem enabled for orchestrator memory`);
  lines.push(`  ${SYMBOLS.check} Delegation results persisted to disk`);
  lines.push(`  ${SYMBOLS.check} Bundled SDD skills ready for install`);
  const seeDocs = 'see docs/provider-configurations.md';
  lines.push(`  ${DIM}○ Kimi — ${seeDocs}${RESET}`);
  lines.push(`  ${DIM}○ GitHub Copilot — ${seeDocs}${RESET}`);
  lines.push(`  ${DIM}○ ZAI Coding Plan — ${seeDocs}${RESET}`);
  return lines.join('\n');
}

async function runInstall(config: InstallConfig): Promise<number> {
  const detected = detectCurrentConfig();
  const isUpdate = detected.isInstalled;

  printHeader(isUpdate);

  let totalSteps = 4;
  if (config.installSkills) totalSteps += 1;
  if (config.installCustomSkills) totalSteps += 1;

  let step = 1;

  printStep(step++, totalSteps, 'Checking OpenCode installation...');
  if (config.dryRun) {
    printInfo('Dry run mode - skipping OpenCode check');
  } else {
    const { ok } = await checkOpenCodeInstalled();
    if (!ok) return 1;
  }
  printStep(step++, totalSteps, 'Adding thoth-agents plugin...');
  if (config.dryRun) {
    printInfo('Dry run mode - skipping plugin installation');
  } else {
    const pluginResult = await addPluginToOpenCodeConfig();
    if (!handleStepResult(pluginResult, 'Plugin added')) return 1;
  }
  printStep(step++, totalSteps, 'Disabling OpenCode default agents...');
  if (config.dryRun) {
    printInfo('Dry run mode - skipping agent disabling');
  } else {
    const agentResult = disableDefaultAgents();
    if (!handleStepResult(agentResult, 'Default agents disabled')) return 1;
  }

  printStep(step++, totalSteps, 'Writing thoth-agents configuration...');
  if (config.dryRun) {
    const liteConfig = generateLiteConfig(config);
    printInfo('Dry run mode - configuration that would be written:');
    console.log(`\n${JSON.stringify(liteConfig, null, 2)}\n`);
  } else {
    const configPath = getExistingLiteConfigPath();
    const configExists = existsSync(configPath);

    if (configExists && !config.reset) {
      printInfo(
        `Configuration already exists at ${configPath}. ` +
          'Use --reset to overwrite.',
      );
    } else {
      const liteResult = writeLiteConfig(
        config,
        configExists ? configPath : undefined,
      );
      if (
        !handleStepResult(
          liteResult,
          configExists ? 'Config reset' : 'Config written',
        )
      )
        return 1;
    }
  }

  // Install skills if requested
  if (config.installSkills) {
    printStep(step++, totalSteps, 'Installing recommended external skills...');
    if (config.dryRun) {
      printInfo('Dry run mode - would install skills:');
      for (const skill of RECOMMENDED_SKILLS) {
        printInfo(`  - ${skill.name}`);
      }
    } else {
      let skillsInstalled = 0;
      let skillsAlreadyInstalled = 0;
      for (const skill of RECOMMENDED_SKILLS) {
        printInfo(`Installing ${skill.name}...`);
        const result = installRecommendedSkill(skill);
        if (result.status === 'installed') {
          printSuccess(`Installed: ${skill.name}`);
          skillsInstalled++;
        } else if (result.status === 'already-installed') {
          printInfo(`Skipped: ${skill.name} (already installed)`);
          skillsAlreadyInstalled++;
        } else {
          printError(`Failed to install recommended skill: ${skill.name}`);
          return 1;
        }
      }
      printSuccess(
        `${skillsInstalled} installed, ${skillsAlreadyInstalled} already installed`,
      );
    }
  }

  // Install bundled custom skills
  if (config.installCustomSkills) {
    printStep(step++, totalSteps, 'Installing bundled thoth-agents skills...');
    if (config.dryRun) {
      printInfo('Dry run mode - would install bundled skills:');
      for (const skill of CUSTOM_SKILLS) {
        printInfo(`  - ${skill.name}`);
      }
    } else {
      const report = installCustomSkills();

      for (const updatedSkill of report.updatedSkills) {
        printSuccess(
          `Installed: ${updatedSkill.skill.name} (${formatSkillReasons(updatedSkill.reasons)})`,
        );
      }

      for (const skippedSkill of report.skippedSkills) {
        printInfo(`Up to date: ${skippedSkill.name}`);
      }

      for (const removedSkill of report.removedSkills) {
        printInfo(`Removed obsolete skill: ${removedSkill}`);
      }

      for (const failedSkill of report.failedSkills) {
        printError(
          `Failed: ${failedSkill.skill.name} (${formatSkillReasons(failedSkill.reasons)})`,
        );
      }

      if (!report.success) {
        return 1;
      }

      printSuccess(
        `Bundled skills processed: ${formatCustomSkillReasons(report)}`,
      );
    }
  }

  // Summary
  console.log();
  console.log(formatConfigSummary());
  console.log();

  const statusMsg = isUpdate
    ? 'thoth-agents updated!'
    : 'thoth-agents installation complete!';
  console.log(`${SYMBOLS.star} ${BOLD}${GREEN}${statusMsg}${RESET}`);
  console.log();
  console.log(`${BOLD}Next steps:${RESET}`);
  console.log();

  console.log(`  1. Start OpenCode:`);
  console.log(`     ${BLUE}$ opencode${RESET}`);
  console.log();
  const modelsInfo =
    'Default configuration uses OpenAI models (gpt-5.4 / gpt-5.4-mini).';
  console.log(`${BOLD}${modelsInfo}${RESET}`);
  console.log(
    `  ${DIM}Includes the seven-agent roster, thoth-mem memory defaults,${RESET}`,
  );
  console.log(
    `  ${DIM}native task delegation, and bundled SDD skills.${RESET}`,
  );
  const altProviders =
    'For alternative providers (Kimi, GitHub Copilot, ZAI Coding Plan)';
  console.log(`${BOLD}${altProviders}, see:${RESET}`);
  const docsUrl =
    'https://github.com/EremesNG/thoth-agents/' +
    'blob/master/docs/provider-configurations.md';
  console.log(`  ${BLUE}${docsUrl}${RESET}`);
  console.log();

  return 0;
}

export function createInstallConfig(args: InstallArgs): InstallConfig {
  return {
    agent: args.agent ?? 'opencode',
    hasTmux: args.tmux === 'yes',
    installSkills: args.skills === 'yes',
    installCustomSkills: true,
    dryRun: args.dryRun,
    reset: args.reset ?? false,
  };
}

export async function install(args: InstallArgs): Promise<number> {
  const config = createInstallConfig(args);
  if (config.agent === 'codex') {
    const plan = buildCodexSetupPlan({
      dryRun: config.dryRun,
      reset: config.reset,
      scope: 'user',
      projectRoot: cwd(),
      homeDir: homedir(),
    });
    console.log(formatCodexSetupPlan(plan));
    const result = applyCodexSetup(plan);
    for (const diagnostic of result.diagnostics) printInfo(diagnostic);
    if (!result.success) {
      printError(`Codex install failed: ${result.error}`);
      return 1;
    }
    printSuccess(
      config.dryRun
        ? 'Codex dry-run complete; no files written'
        : 'Codex agent-pack setup complete',
    );
    return 0;
  }
  return runInstall(config);
}
