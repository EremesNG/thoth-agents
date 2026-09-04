import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
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
  applyCodexPluginSetup,
  buildCodexPluginSetupPlan,
  formatCodexPluginSetupPlan,
} from './codex-plugin-install';
import {
  detectCurrentConfig,
  generateLiteConfig,
  getOpenCodePath,
  getOpenCodeVersion,
  isOpenCodeInstalled,
  updateOpenCodeMainConfig,
  writeLiteConfig,
} from './config-manager';
import {
  finalizeHarnessInstall,
  type HarnessInstallCompletionResult,
} from './install-completion';
import type { InstallLedgerOptions } from './install-ledger';
import {
  inspectPiPackageSkills,
  syncOpenCodeOwnedSkills,
} from './owned-skills';
import {
  type ExecutingPackageVersionResult,
  resolveExecutingPackageVersion,
} from './package-version';
import { getExistingLiteConfigPath } from './paths';
import {
  applyPiSetup,
  buildPiSetupPlan,
  formatPiSetupPlan,
  type PiCommandExecutor,
  type PiSetupOptions,
} from './pi-install';
import {
  getRequiredSkillInstallCommand,
  installRequiredSkill,
  REQUIRED_SKILLS,
  type SkillInstallHarness,
} from './skills';
import type {
  ThothMemSetupOptions,
  ThothMemSetupResult,
} from './thoth-mem-install';
import type { ConfigMergeResult, InstallArgs, InstallConfig } from './types';

export interface InstallDependencies {
  homeDir?: string;
  opencodeOwnedSkillPackageRoot?: string;
  runThothMemSetup?: (options: ThothMemSetupOptions) => ThothMemSetupResult;
  resolveExecutingPackageVersion?: () => ExecutingPackageVersionResult;
  updateOpenCodeMainConfig?: typeof updateOpenCodeMainConfig;
  finalizeHarnessInstall?: typeof finalizeHarnessInstall;
  installLedgerOptions?: InstallLedgerOptions;
  piCommandExecutor?: PiCommandExecutor;
  buildPiSetupPlan?: typeof buildPiSetupPlan;
  applyPiSetup?: typeof applyPiSetup;
  inspectPiPackageSkills?: typeof inspectPiPackageSkills;
  verifyPiFirstParty?: PiSetupOptions['verifyFirstParty'];
  installRequiredSkill?: typeof installRequiredSkill;
}

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

function printWarning(message: string): void {
  console.log(`${SYMBOLS.warn} ${message}`);
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

function formatConfigSummary(dryRun: boolean | undefined): string {
  const lines: string[] = [];
  lines.push(`${BOLD}Configuration Summary${RESET}`);
  lines.push('');
  lines.push(`  ${BOLD}Preset:${RESET} ${BLUE}openai${RESET}`);
  lines.push(`  ${SYMBOLS.check} Seven-role adaptive thoth-agents roster`);
  lines.push(`  ${SYMBOLS.check} OpenAI models by default`);
  lines.push(`  ${SYMBOLS.check} Direct, Accelerated, and Full SDD routing`);
  lines.push(
    `  ${SYMBOLS.check} ${dryRun ? 'thoth-mem setup plan confirmed' : 'thoth-mem setup completed through its provider-owned installer'}`,
  );
  lines.push(
    `  ${DIM}○ thoth-mem remains the owner of hooks, MCP, skill, lifecycle, persistence, receipts, and recovery.${RESET}`,
  );
  lines.push(`  ${SYMBOLS.check} Global thoth-owned OpenCode skills`);
  lines.push(`  ${SYMBOLS.check} Required external skills for this harness`);
  return lines.join('\n');
}

function installOwnedSkillsForOpenCode(
  dryRun: boolean | undefined,
  dependencies: InstallDependencies,
): boolean {
  const result = syncOpenCodeOwnedSkills({
    dryRun,
    homeDir: dependencies.homeDir ?? homedir(),
    packageRoot: dependencies.opencodeOwnedSkillPackageRoot,
  });
  for (const skill of result.skills) {
    printInfo(`  - ${skill.name}: ${skill.destinationPath}`);
  }
  if (!result.success) {
    printError(
      `Failed to synchronize global thoth-owned OpenCode skills: ${result.error ?? 'unknown error'}`,
    );
    return false;
  }
  printSuccess(
    dryRun
      ? 'Global thoth-owned OpenCode skills planned'
      : 'Global thoth-owned OpenCode skills synchronized',
  );
  return true;
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
    printSuccess(`Required external skills planned for ${harness}`);
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

function printThothMemSetupResult(
  result: ThothMemSetupResult,
  dryRun: boolean | undefined,
): boolean {
  printInfo(`Provider command: ${result.command} ${result.args.join(' ')}`);
  for (const step of result.steps) {
    printInfo(`thoth-mem: ${step.name} [${step.outcome}]`);
  }
  for (const diagnostic of result.diagnostics) printInfo(diagnostic);
  if (result.receipt) printInfo(`thoth-mem receipt: ${result.receipt}`);
  for (const action of result.manualActions) {
    printWarning(`thoth-mem manual action: ${action}`);
  }

  if (!result.success) {
    printError(`thoth-mem setup is incomplete: ${result.status}`);
    if (result.error) printError(result.error);
    return false;
  }

  printSuccess(
    dryRun
      ? 'thoth-mem setup plan confirmed'
      : 'thoth-mem setup complete through its provider-owned installer',
  );
  return true;
}

function finalizeInstallForHarness(
  harness: SkillInstallHarness,
  dryRun: boolean | undefined,
  version: string,
  dependencies: InstallDependencies,
): boolean {
  const finalize =
    dependencies.finalizeHarnessInstall ?? finalizeHarnessInstall;
  const result: HarnessInstallCompletionResult = finalize({
    harness,
    version,
    dryRun,
    cwd: cwd(),
    runThothMemSetup: dependencies.runThothMemSetup,
    ledgerOptions: dependencies.installLedgerOptions ?? {
      homeDir: dependencies.homeDir ?? homedir(),
    },
  });
  const providerComplete = printThothMemSetupResult(result.provider, dryRun);
  if (!providerComplete) return false;
  if (!result.success) {
    printError(result.error ?? 'Failed to record the completed CLI install.');
    return false;
  }
  if (result.ledger.status === 'planned') {
    printInfo(`CLI-managed install record planned: ${result.ledger.path}`);
  } else if (result.ledger.status === 'recorded') {
    printSuccess(`CLI-managed install version recorded: ${result.ledger.path}`);
  }
  return true;
}

async function runInstall(
  config: InstallConfig,
  dependencies: InstallDependencies,
  pluginVersion: string,
): Promise<number> {
  const detected = detectCurrentConfig();
  const isUpdate = detected.isInstalled;

  printHeader(isUpdate);

  const totalSteps = 6;

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
    const updateMainConfig =
      dependencies.updateOpenCodeMainConfig ?? updateOpenCodeMainConfig;
    const mainConfigResult = updateMainConfig({
      ensurePlugin: true,
      pluginVersion,
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

  printStep(
    step++,
    totalSteps,
    'Synchronizing global thoth-owned OpenCode skills...',
  );
  if (!installOwnedSkillsForOpenCode(config.dryRun, dependencies)) return 1;

  printStep(step++, totalSteps, 'Installing required external skills...');
  if (
    !installRequiredSkillsForHarness(
      'opencode',
      config.dryRun,
      dependencies.homeDir ?? homedir(),
    )
  )
    return 1;

  printStep(step++, totalSteps, 'Configuring provider-owned thoth-mem...');
  if (
    !finalizeInstallForHarness(
      'opencode',
      config.dryRun,
      pluginVersion,
      dependencies,
    )
  ) {
    return 1;
  }

  // Summary
  console.log();
  console.log(formatConfigSummary(config.dryRun));
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
    `  ${DIM}Includes the seven-role adaptive roster, native delegation, and Direct / Accelerated / Full SDD routing.${RESET}`,
  );
  return 0;
}

async function runPiInstall(
  config: InstallConfig,
  dependencies: InstallDependencies,
  packageVersion: string,
  executingPackageRoot: string,
): Promise<number> {
  const buildPlan = dependencies.buildPiSetupPlan ?? buildPiSetupPlan;
  const applyPlan = dependencies.applyPiSetup ?? applyPiSetup;
  const plan = buildPlan({
    dryRun: config.dryRun,
    homeDir: dependencies.homeDir ?? homedir(),
    cwd: cwd(),
    commandExecutor: dependencies.piCommandExecutor,
    expectedVersion: packageVersion,
    packageRoot: executingPackageRoot,
    receiptOptions: dependencies.installLedgerOptions,
    verifyFirstParty: dependencies.verifyPiFirstParty,
  });
  console.log(formatPiSetupPlan(plan));
  for (const diagnostic of [...plan.diagnostics, ...plan.disclaimers]) {
    printInfo(diagnostic);
  }
  if (!plan.ready) {
    for (const blocker of plan.blockers) printError(blocker);
    return 1;
  }
  const applied = applyPlan(plan);
  for (const diagnostic of applied.diagnostics) printInfo(diagnostic);
  if (!applied.success) {
    printError(
      `Pi install failed after ${applied.installedPackages.length} package step(s): ${applied.error ?? 'unknown error'}`,
    );
    return 1;
  }

  if (config.dryRun) {
    printInfo(
      'Pi package-declared skills remain unavailable until the first-party package is receipt-validated.',
    );
  } else {
    if (!applied.configuredPackageRoot) {
      printError('Verified configured Pi package root is unavailable.');
      return 1;
    }
    const packageSkills = (
      dependencies.inspectPiPackageSkills ?? inspectPiPackageSkills
    )({ packageRoot: applied.configuredPackageRoot });
    for (const skill of packageSkills.skills)
      printInfo(
        `  - ${skill.name}: ${join(skill.destinationPath, 'SKILL.md')}`,
      );
    if (!packageSkills.success) {
      printError(
        `Failed to inspect package-declared Pi skills: ${packageSkills.error ?? 'unknown error'}`,
      );
      return 1;
    }
  }

  if (config.dryRun) {
    if (!installRequiredSkillsForHarness('pi', true, dependencies.homeDir)) {
      return 1;
    }
  } else {
    const installSkill =
      dependencies.installRequiredSkill ?? installRequiredSkill;
    for (const skill of REQUIRED_SKILLS) {
      const result = installSkill(skill, 'pi', {
        homeDir: dependencies.homeDir ?? homedir(),
      });
      if (result.status === 'failed') {
        printError(`Failed to install required Pi skill: ${skill.name}`);
        return 1;
      }
      printInfo(`  - ${skill.name}: ${result.skillPath}`);
    }
  }

  if (
    !finalizeInstallForHarness(
      'pi',
      config.dryRun,
      packageVersion,
      dependencies,
    )
  ) {
    return 1;
  }
  printSuccess(
    config.dryRun
      ? 'Pi dry-run complete; no packages, files, provider state, or ledger state changed'
      : 'Complete Pi native package, agent, skill, research, provider, and ledger setup applied',
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

export async function install(
  args: InstallArgs,
  dependencies: InstallDependencies = {},
): Promise<number> {
  const config = createInstallConfig(args);
  const resolvePackageVersion =
    dependencies.resolveExecutingPackageVersion ??
    resolveExecutingPackageVersion;
  const packageVersion = resolvePackageVersion();
  if (!packageVersion.ok) {
    printError(
      `Could not resolve the executing thoth-agents package version: ${packageVersion.error.message}`,
    );
    return 1;
  }

  if (config.agent === 'codex') {
    const projectRoot = cwd();
    const pluginPlan = buildCodexPluginSetupPlan({
      dryRun: config.dryRun,
      expectedVersion: packageVersion.version,
      homeDir: dependencies.homeDir,
      projectRoot,
    });
    console.log(formatCodexPluginSetupPlan(pluginPlan));
    const pluginResult = applyCodexPluginSetup(pluginPlan);
    for (const diagnostic of pluginResult.diagnostics) printInfo(diagnostic);
    if (!pluginResult.success) {
      printError(`Codex plugin install failed: ${pluginResult.error}`);
      return 1;
    }

    const plan = buildCodexSetupPlan({
      dryRun: config.dryRun,
      reset: config.reset,
      scope: 'user',
      projectRoot,
      homeDir: dependencies.homeDir ?? homedir(),
    });
    console.log(formatCodexSetupPlan(plan));
    const result = applyCodexSetup(plan);
    for (const diagnostic of result.diagnostics) printInfo(diagnostic);
    if (!result.success) {
      printError(`Codex install failed: ${result.error}`);
      return 1;
    }
    if (
      !installRequiredSkillsForHarness(
        'codex',
        config.dryRun,
        dependencies.homeDir ?? homedir(),
      )
    )
      return 1;
    if (
      !finalizeInstallForHarness(
        'codex',
        config.dryRun,
        packageVersion.version,
        dependencies,
      )
    ) {
      return 1;
    }
    printSuccess(
      config.dryRun
        ? 'Codex dry-run complete; no files written'
        : 'Codex plugin installed as thoth-agents@thoth-plugins and agent-pack setup complete (restart Codex to activate)',
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
    if (
      !installRequiredSkillsForHarness(
        'claude',
        config.dryRun,
        dependencies.homeDir ?? homedir(),
      )
    )
      return 1;
    if (
      !finalizeInstallForHarness(
        'claude',
        config.dryRun,
        packageVersion.version,
        dependencies,
      )
    ) {
      return 1;
    }
    printSuccess(
      config.dryRun
        ? 'Claude Code dry-run complete; no files written'
        : 'Claude Code plugin installed as thoth-agents@thoth-plugins through the native manager (restart Claude Code or run /reload-plugins to activate)',
    );
    return 0;
  }
  if (config.agent === 'pi') {
    return runPiInstall(
      config,
      dependencies,
      packageVersion.version,
      packageVersion.packageRoot,
    );
  }
  return runInstall(config, dependencies, packageVersion.version);
}
