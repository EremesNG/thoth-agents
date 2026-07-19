import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { cwd } from 'node:process';
import {
  applyClaudeCodeSetup,
  buildClaudeCodeSetupPlan,
  formatClaudeCodeSetupPlan,
} from './claude-code-install';
import {
  applyCodexSetup,
  buildCodexSetupPlan,
  formatCodexSetupPlan,
} from './codex-install';
import {
  detectCurrentConfig,
  generateLiteConfig,
  getOpenCodePath,
  getOpenCodeVersion,
  isOpenCodeInstalled,
  updateOpenCodeMainConfig,
  writeLiteConfig,
} from './config-manager';
import { getExistingLiteConfigPath } from './paths';
import {
  getRequiredSkillInstallCommand,
  installRequiredSkill,
  REQUIRED_SKILLS,
  type SkillInstallHarness,
} from './skills';
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
  lines.push(`  ${SYMBOLS.check} Ten-role adaptive thoth-agents roster`);
  lines.push(`  ${SYMBOLS.check} OpenAI models by default`);
  lines.push(`  ${SYMBOLS.check} Direct, Accelerated, and Full SDD routing`);
  lines.push(
    `  ${DIM}○ Provider capability is external and was not evidenced by this install.${RESET}`,
  );
  lines.push(`  ${SYMBOLS.check} Required external skills for this harness`);
  return lines.join('\n');
}

function installRequiredSkillsForHarness(
  harness: SkillInstallHarness,
  dryRun: boolean | undefined,
  homeDir = homedir(),
): boolean {
  if (dryRun) {
    printInfo(`Dry run mode - required ${harness} skills:`);
    for (const skill of REQUIRED_SKILLS) {
      const { command, args } = getRequiredSkillInstallCommand(skill, harness);
      printInfo(`  - ${skill.name}: ${command} ${args.join(' ')}`);
    }
    return true;
  }

  let installed = 0;
  let alreadyInstalled = 0;
  for (const skill of REQUIRED_SKILLS) {
    printInfo(`Installing required skill ${skill.name} for ${harness}...`);
    const result = installRequiredSkill(skill, harness, { homeDir });
    if (result.status === 'failed') {
      printError(`Failed to install required skill: ${skill.name}`);
      return false;
    }
    if (result.status === 'installed') {
      installed += 1;
      printSuccess(`Installed: ${skill.name}`);
    } else {
      alreadyInstalled += 1;
      printInfo(`Skipped: ${skill.name} (already installed)`);
    }
  }
  printSuccess(
    `${installed} required skills installed, ${alreadyInstalled} already installed`,
  );
  return true;
}

async function runInstall(config: InstallConfig): Promise<number> {
  const detected = detectCurrentConfig();
  const isUpdate = detected.isInstalled;

  printHeader(isUpdate);

  const totalSteps = 4;

  let step = 1;

  printStep(step++, totalSteps, 'Checking OpenCode installation...');
  if (config.dryRun) {
    printInfo('Dry run mode - skipping OpenCode check');
  } else {
    const { ok } = await checkOpenCodeInstalled();
    if (!ok) return 1;
  }
  printStep(
    step++,
    totalSteps,
    'Configuring the thoth-agents plugin and OpenCode default agents...',
  );
  if (config.dryRun) {
    printInfo('Dry run mode - skipping main config update');
  } else {
    const mainConfigResult = updateOpenCodeMainConfig({
      ensurePlugin: true,
      disableDefaults: true,
    });
    if (!handleStepResult(mainConfigResult, 'Main config updated')) return 1;
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

  printStep(step++, totalSteps, 'Installing required external skills...');
  if (!installRequiredSkillsForHarness('opencode', config.dryRun)) return 1;

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
  const modelsInfo = 'Default configuration uses OpenAI models.';
  console.log(`${BOLD}${modelsInfo}${RESET}`);
  console.log(
    `  ${DIM}Includes the ten-role adaptive roster, native delegation, and Direct / Accelerated / Full SDD routing.${RESET}`,
  );
  return 0;
}

export function createInstallConfig(args: InstallArgs): InstallConfig {
  return {
    agent: args.agent ?? 'opencode',
    hasTmux: args.tmux === 'yes',
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
    if (!installRequiredSkillsForHarness('codex', config.dryRun)) return 1;
    printSuccess(
      config.dryRun
        ? 'Codex dry-run complete; no files written'
        : 'Codex agent-pack setup complete',
    );
    return 0;
  }
  if (config.agent === 'claude') {
    const plan = buildClaudeCodeSetupPlan({
      dryRun: config.dryRun,
      reset: config.reset,
      scope: 'user',
      projectRoot: cwd(),
    });
    console.log(formatClaudeCodeSetupPlan(plan));
    const result = applyClaudeCodeSetup(plan);
    for (const diagnostic of result.diagnostics) printInfo(diagnostic);
    if (!result.success) {
      printError(`Claude Code install failed: ${result.error}`);
      return 1;
    }
    if (!installRequiredSkillsForHarness('claude', config.dryRun)) return 1;
    printSuccess(
      config.dryRun
        ? 'Claude Code dry-run complete; no files written'
        : 'Claude Code plugin installed as thoth-agents@thoth-agents through the native manager (restart Claude Code or run /reload-plugins to activate)',
    );
    return 0;
  }
  return runInstall(config);
}
