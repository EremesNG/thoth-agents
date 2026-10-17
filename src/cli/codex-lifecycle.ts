import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, lstatSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join, parse, resolve } from 'node:path';
import {
  parseCodexToml,
  patchScalar,
  readCodexThreadsValue,
  scalarLocation,
} from './codex-config-io';
import { codexHookSource, codexHookTrustEntries } from './codex-hook-trust';
import {
  isMigratableLegacyRole,
  planLegacyRootRemoval,
  roleStructureFingerprint,
} from './codex-install';
import { resolveCodexTargets } from './codex-paths';
import {
  CODEX_PLUGIN_ID,
  type CodexHookCapabilityConfig,
  checkCodexHookCapability,
  defaultCommandExecutor,
} from './codex-plugin-install';
import { readInstallLedger } from './install-ledger';
import {
  assertSafeBackupDestination,
  parseManagedModelStateJson,
} from './managed-state-io';
import type { CodexOperationContext } from './operations/codex';
import { safeAtomicWriteFileSync } from './safe-atomic-write';

export interface CodexLifecycleContext extends CodexOperationContext {
  pluginId?: string;
  localPluginBundlePath?: CodexHookCapabilityConfig['localPluginBundlePath'];
  nodeAvailable?: () => boolean;
}
export interface CodexLifecycleResult {
  success: boolean;
  messages: string[];
}
function repairCommand(context: CodexLifecycleContext): string {
  return context.localPluginBundlePath ||
    context.pluginId === 'thoth-agents@personal'
    ? 'pnpm run setup:codex:local'
    : 'thoth-agents update --agent=codex --apply';
}
function readBytes(path: string): Buffer | undefined {
  // Refuse symlinks at every boundary, including dangling symlinks.
  const absolute = resolve(path);
  let cursor = parse(absolute).root;
  for (const part of absolute.slice(cursor.length).split(/[\\/]/)) {
    cursor = join(cursor, part);
    try {
      if (lstatSync(cursor).isSymbolicLink())
        throw new Error(`Unsafe symlink: ${cursor}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
  return readFileSync(path);
}
function read(path: string): string | undefined {
  return readBytes(path)?.toString('utf8');
}
function readConfig(path: string): string {
  const bytes = readBytes(path);
  const text = bytes?.toString('utf8') ?? '';
  // Rebase scalar edits only when decoding and writing the rest is lossless.
  if (bytes && !Buffer.from(text, 'utf8').equals(bytes))
    throw new Error(
      `Invalid UTF-8 config; preserve ${path} and review manually.`,
    );
  return text;
}
function snapshot(context: CodexLifecycleContext) {
  const targets = resolveCodexTargets({
    scope: 'user',
    projectRoot: context.cwd,
    homeDir: context.homeDir,
    codexHome: context.codexHome,
  });
  const stateBytes = readBytes(targets.managedModelsPath);
  const stateText = stateBytes?.toString('utf8');
  if (stateText !== undefined) {
    const raw = JSON.parse(stateText);
    if (
      raw?.version !== 1 ||
      !raw.models ||
      typeof raw.models !== 'object' ||
      Array.isArray(raw.models)
    )
      throw new Error(
        'Unreadable managed model state; repair it manually before uninstall.',
      );
    if (
      raw.priorThreadsValue !== undefined &&
      raw.priorThreadsValue !== null &&
      (typeof raw.priorThreadsValue !== 'string' ||
        !/^\+?\d[\d_]*$/.test(raw.priorThreadsValue))
    )
      throw new Error('Invalid prior threads ownership state.');
    for (const field of ['roleDigests', 'roleStructureDigests'])
      if (
        raw[field] !== undefined &&
        (typeof raw[field] !== 'object' ||
          raw[field] === null ||
          Array.isArray(raw[field]) ||
          Object.values(raw[field]).some(
            (value) =>
              typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value),
          ))
      )
        throw new Error(`Invalid ${field} ownership state.`);
    if (
      raw.ownedHookTrustKeys !== undefined &&
      (!Array.isArray(raw.ownedHookTrustKeys) ||
        raw.ownedHookTrustKeys.some(
          (key: unknown) =>
            typeof key !== 'string' ||
            !key.startsWith(`${codexHookSource(context.pluginId)}:`),
        ))
    )
      throw new Error('Invalid hook ownership state.');
  }
  const state = parseManagedModelStateJson(stateText, 1);
  const config = readConfig(targets.configPath);
  parseCodexToml(config);
  const roles = targets.roleAgentPaths.map((target) => {
    const bytes = readBytes(target.path);
    const content = bytes?.toString('utf8');
    const key = basename(target.path);
    const status =
      bytes === undefined
        ? 'missing'
        : createHash('sha256').update(bytes).digest('hex') ===
            state.roleDigests?.[key]
          ? 'owned'
          : roleStructureFingerprint(content ?? '') ===
              state.roleStructureDigests?.[key]
            ? 'model-edited'
            : 'drifted';
    return { ...target, content, bytes, status };
  });
  return { targets, state, stateBytes, config, roles };
}
function trust(context: CodexLifecycleContext) {
  const capability = checkCodexHookCapability({
    projectRoot: context.cwd,
    homeDir: context.homeDir,
    codexHome: context.codexHome,
    commandExecutor: context.codexPluginCommandExecutor,
    pluginId: context.pluginId,
    localPluginBundlePath: context.localPluginBundlePath,
  });
  const entries = capability.bundlePath
    ? codexHookTrustEntries(
        JSON.parse(
          readFileSync(
            join(capability.bundlePath, 'codex-hooks', 'hooks.json'),
            'utf8',
          ),
        ),
        codexHookSource(context.pluginId),
        process.platform,
      )
    : {};
  return { capability, entries };
}
function storedHash(content: string, key: string): unknown {
  const document = parseCodexToml(content);
  const hooks = document.hooks;
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks))
    return undefined;
  const state = hooks.state;
  if (!state || typeof state !== 'object' || Array.isArray(state))
    return undefined;
  const entry = state[key];
  return entry && typeof entry === 'object' && !Array.isArray(entry)
    ? entry.trusted_hash
    : undefined;
}
function removeScalar(content: string, path: string[]): string {
  const { lines, match, sectionStart, sectionEnd } = scalarLocation(
    content,
    path,
  );
  if (match) {
    // Remove an empty hook entry header, but retain comments and unrelated fields.
    if (
      path[0] === 'hooks' &&
      sectionStart >= 0 &&
      lines
        .slice(sectionStart + 1, sectionEnd)
        .every(
          (line, index) =>
            sectionStart + 1 + index === match.index ||
            /^\s*(?:#.*)?$/.test(line.text),
        )
    )
      lines[sectionStart].text = '';
    lines.splice(match.index, 1);
  }
  return lines.map((line) => line.text + line.eol).join('');
}
export function uninstallCodex(
  context: CodexLifecycleContext,
  dryRun = false,
): CodexLifecycleResult {
  const messages: string[] = [];
  const mutations: (() => void)[] = [];
  try {
    const { targets, state, stateBytes, config, roles } = snapshot(context);
    const ledger = readInstallLedger(
      context.installLedgerOptions ?? { homeDir: context.homeDir },
    );
    if (ledger.status === 'invalid') throw new Error(ledger.error);
    const recovery = join(
      dirname(targets.managedModelsPath),
      '.thoth-agents-install-recovery.json',
    );
    const recoveryText = read(recovery);
    if (recoveryText !== undefined) {
      const raw = JSON.parse(recoveryText);
      if (
        raw?.version !== 1 ||
        !raw.roles ||
        typeof raw.roles !== 'object' ||
        Array.isArray(raw.roles) ||
        Object.values(raw.roles).some(
          (value) => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value),
        )
      )
        throw new Error('Unreadable recovery journal; repair manually.');
    }
    // Native removal is an arbitrary external operation. Only mutate snapshots
    // that still match afterwards, including the ownership evidence itself.
    function unchanged(path: string, expected: Buffer | undefined): boolean {
      try {
        const current = readBytes(path);
        if (
          current === undefined
            ? expected === undefined
            : expected !== undefined && current.equals(expected)
        )
          return true;
      } catch {
        // A replacement link or unreadable file is not ours to mutate.
      }
      messages.push(`Preserve concurrently changed ${path}; review manually.`);
      return false;
    }
    function ownershipUnchanged(): boolean {
      return unchanged(targets.managedModelsPath, stateBytes);
    }
    for (const role of roles) {
      if (role.status === 'owned' || role.status === 'model-edited') {
        messages.push(`Remove ${role.path} (${role.status})`);
        mutations.push(() => {
          if (ownershipUnchanged() && unchanged(role.path, role.bytes))
            rmSync(role.path);
        });
      } else
        messages.push(
          `Preserve ${role.path} (${role.status}); review manually.`,
        );
    }
    const root = planLegacyRootRemoval(targets.rootInstructionsPath);
    messages.push(...root.diagnostics);
    for (const item of root.items) {
      const bytes = item.remainingRootBytes;
      if (!bytes)
        throw new Error('Legacy root removal is missing its preserved bytes.');
      messages.push(item.description);
      mutations.push(() => {
        if (!unchanged(item.targetPath, item.legacyRootBytes)) return;
        assertSafeBackupDestination(`${item.targetPath}.bak`);
        copyFileSync(item.targetPath, `${item.targetPath}.bak`);
        if (bytes.every((byte) => byte === 32 || (byte >= 9 && byte <= 13)))
          rmSync(item.targetPath);
        else safeAtomicWriteFileSync(item.targetPath, bytes);
      });
    }
    let patched = config;
    const configPaths: string[][] = [];
    if (state.priorThreadsValue !== undefined) {
      const current = readCodexThreadsValue(config);
      if (current !== null && Number(current.replaceAll('_', '')) === 6) {
        configPaths.push(['agents', 'max_concurrent_threads_per_session']);
        patched =
          state.priorThreadsValue === null
            ? removeScalar(patched, [
                'agents',
                'max_concurrent_threads_per_session',
              ])
            : patchScalar(
                patched,
                ['agents', 'max_concurrent_threads_per_session'],
                state.priorThreadsValue,
              );
        messages.push(
          `Restore threads setting to ${state.priorThreadsValue ?? 'absent'}`,
        );
      } else
        messages.push(
          'Preserve operator-changed threads setting; review config.toml manually.',
        );
    }
    if (state.ownedHookTrustKeys?.length) {
      const { entries } = trust(context);
      for (const key of state.ownedHookTrustKeys) {
        const path = ['hooks', 'state', key, 'trusted_hash'];
        const value = storedHash(patched, key);
        if (entries[key] && value === entries[key]) {
          configPaths.push(path);
          patched = removeScalar(patched, path);
          messages.push(`Remove owned hook trust ${key}`);
        } else
          messages.push(
            `Preserve hook trust ${key}: changed or original hash unverifiable; review in Codex.`,
          );
      }
    }
    if (patched !== config)
      mutations.push(() => {
        // The native manager can change this file during plugin removal. Rebase
        // only our planned scalar edits; never resurrect its removed settings.
        if (!ownershipUnchanged()) return;
        let current: string;
        try {
          current = readConfig(targets.configPath);
        } catch {
          messages.push(
            `Preserve concurrently changed ${targets.configPath}; review manually.`,
          );
          return;
        }
        let rebased = current;
        for (const path of configPaths) {
          const before = scalarLocation(config, path).match?.value;
          if (scalarLocation(current, path).match?.value !== before) {
            messages.push(
              `Preserve concurrently changed ${path.join('.')}; review config.toml manually.`,
            );
            continue;
          }
          const after = scalarLocation(patched, path).match?.value;
          rebased =
            after === undefined
              ? removeScalar(rebased, path)
              : patchScalar(rebased, path, after);
        }
        if (rebased !== current) {
          assertSafeBackupDestination(`${targets.configPath}.bak`);
          copyFileSync(targets.configPath, `${targets.configPath}.bak`);
          safeAtomicWriteFileSync(targets.configPath, rebased);
        }
      });
    messages.push(
      `Run codex plugin remove ${context.pluginId ?? CODEX_PLUGIN_ID} --json`,
    );
    messages.push(
      `Preserve ${(context.pluginId ?? CODEX_PLUGIN_ID).split('@')[1]} marketplace: registration ownership/other consumers not determinable.`,
      'Not removed: provider-owned thoth-mem surfaces and external skills.',
    );
    for (const path of [recovery, targets.managedModelsPath]) {
      const expected = readBytes(path);
      if (expected !== undefined) {
        messages.push(`Remove managed state ${path}`);
        mutations.push(() => {
          if (unchanged(path, expected)) rmSync(path);
        });
      }
    }
    if (ledger.status === 'valid' && ledger.ledger.harnesses.codex) {
      const next = {
        ...ledger.ledger,
        harnesses: { ...ledger.ledger.harnesses },
      };
      delete next.harnesses.codex;
      const ledgerBytes = readBytes(ledger.path);
      messages.push('Remove codex install ledger entry');
      mutations.push(() => {
        if (unchanged(ledger.path, ledgerBytes))
          safeAtomicWriteFileSync(
            ledger.path,
            `${JSON.stringify(next, null, 2)}\n`,
          );
      });
    }
    if (!dryRun) {
      if (patched !== config)
        assertSafeBackupDestination(`${targets.configPath}.bak`);
      for (const item of root.items)
        assertSafeBackupDestination(`${item.targetPath}.bak`);
      const result = (
        context.codexPluginCommandExecutor ?? defaultCommandExecutor
      )(
        'codex',
        ['plugin', 'remove', context.pluginId ?? CODEX_PLUGIN_ID, '--json'],
        {
          cwd: context.cwd,
        },
      );
      if (result.exitCode !== 0)
        throw new Error(
          `Native plugin removal failed: ${result.stderr}; local ownership state retained.`,
        );
      for (const mutate of mutations) mutate();
    }
    return { success: true, messages };
  } catch (error) {
    return { success: false, messages: [...messages, String(error)] };
  }
}
export function doctorCodex(
  context: CodexLifecycleContext,
): CodexLifecycleResult {
  const messages: string[] = [];
  let success = true;
  let fix = repairCommand(context);
  function finding(label: string, ok: boolean, fix: string) {
    messages.push(ok ? label : `${label}; Fix: ${fix}`);
    if (!ok) success = false;
  }
  try {
    const executor =
      context.codexPluginCommandExecutor ?? defaultCommandExecutor;
    let selectedContext = context;
    let pluginKnown = false;
    try {
      const result = executor('codex', ['plugin', 'list', '--json'], {
        cwd: context.cwd,
      });
      if (result.exitCode !== 0)
        throw new Error(
          `codex plugin list --json exited ${result.exitCode}; stderr: ${result.stderr || '(empty)'}; stdout: ${result.stdout || '(empty)'}`,
        );
      const plugins: unknown = JSON.parse(result.stdout).installed;
      if (!Array.isArray(plugins))
        throw new Error('Unreadable native installed plugin list.');
      const candidates = plugins.filter(
        (item) =>
          item &&
          typeof item.pluginId === 'string' &&
          item.pluginId.startsWith('thoth-agents@'),
      );
      const plugin = candidates.length === 1 ? candidates[0] : undefined;
      if (plugin) {
        pluginKnown = true;
        selectedContext = {
          ...context,
          pluginId: plugin.pluginId,
          localPluginBundlePath:
            plugin.source?.source === 'local' &&
            typeof plugin.source.path === 'string'
              ? plugin.source.path
              : context.localPluginBundlePath,
        };
      }
      fix = repairCommand(selectedContext);
      finding(
        `Plugin: ${candidates.length > 1 ? `ambiguous (${candidates.map((item) => `${item.pluginId}, enabled=${item.enabled}`).join('; ')})` : plugin ? `installed (${plugin.pluginId})` : 'missing'}, enabled=${plugin?.enabled ?? false}, version=${plugin?.version ?? 'unknown'}`,
        !!plugin?.enabled,
        candidates.length > 1
          ? 'Select exactly one thoth-agents plugin in Codex native plugin management.'
          : fix,
      );
    } catch (error) {
      finding(
        `Plugin inspection failed: ${String(error)}`,
        false,
        'Run codex plugin list --json; resolve the captured native error.',
      );
    }
    const { targets, state, config, roles } = snapshot(selectedContext);
    const { capability, entries } = pluginKnown
      ? trust(selectedContext)
      : { capability: { success: false }, entries: {} };
    finding(
      `Hook capability: ${capability.success ? 'available' : 'unavailable'}`,
      capability.success,
      fix,
    );
    if (!Object.keys(entries).length)
      for (const event of ['session_start', 'subagent_start'])
        finding(
          `Hook ${codexHookSource(selectedContext.pluginId)}:${event}:0:0: not applicable (no hook-capable bundle)`,
          true,
          fix,
        );
    for (const [key, hash] of Object.entries(entries)) {
      const raw = storedHash(config, key);
      const status =
        raw === undefined ? 'untrusted' : raw === hash ? 'trusted' : 'modified';
      finding(
        `Hook ${key}: ${status}`,
        status === 'trusted',
        `Review and trust this handler in Codex native hook review; refresh declarations if needed with ${fix}.`,
      );
    }
    const node =
      context.nodeAvailable?.() ??
      spawnSync('node', ['--version'], { encoding: 'utf8', timeout: 10000 })
        .status === 0;
    finding(
      `Node on PATH: ${node ? 'available' : 'missing'}`,
      node,
      'Install Node.js >=22.19 and restart Codex with Node on PATH.',
    );
    for (const role of roles)
      finding(
        `Agent ${role.role}: ${role.content && isMigratableLegacyRole(role.content, role.role) ? 'legacy full TOML (migratable)' : role.status}`,
        !isMigratableLegacyRole(role.content ?? '', role.role) &&
          (role.status === 'owned' || role.status === 'model-edited'),
        role.content && isMigratableLegacyRole(role.content, role.role)
          ? `Review/back up edits, then run ${fix} --replace-legacy-agents`
          : role.status === 'drifted'
            ? `Review/back up edits, then run ${fix}`
            : fix,
      );
    const threads = readCodexThreadsValue(config);
    const managed =
      state.priorThreadsValue !== undefined &&
      threads !== null &&
      Number(threads.replaceAll('_', '')) === 6;
    finding(
      `Threads: ${threads === null ? 'absent' : managed ? 'managed' : 'operator-changed'} (${threads ?? 'none'})`,
      managed,
      `Review config.toml; set agents.max_concurrent_threads_per_session = 6 and restart Codex; ${fix}.`,
    );
    const legacy = planLegacyRootRemoval(targets.rootInstructionsPath);
    const present = legacy.items.length > 0 || legacy.diagnostics.length > 0;
    finding(
      `Legacy AGENTS.md block: ${present ? 'present' : 'absent'}`,
      !present,
      legacy.diagnostics.length ? 'Repair ambiguous markers manually.' : fix,
    );
  } catch (error) {
    success = false;
    messages.push(
      `${String(error)} Fix: inspect state/config manually, then ${fix}.`,
    );
  }
  return { success, messages };
}
