import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSubagentsConfig } from './config.js';

// Pick up config edits without doing synchronous config I/O on every event.
const DEBUG_CONFIG_CACHE_MS = 1000;
const debugEnabledCache = new Map<
  string,
  { enabled: boolean; checkedAt: number }
>();

export function isSubagentsDebugEnabled(cwd?: string): boolean {
  if (!cwd) return false;
  try {
    const agentDir =
      process.env.PI_CODING_AGENT_DIR ||
      path.join(os.homedir(), '.pi', 'agent');
    const key = JSON.stringify([path.resolve(cwd), path.resolve(agentDir)]);
    const now = Date.now();
    const cached = debugEnabledCache.get(key);
    if (
      cached &&
      now >= cached.checkedAt &&
      now - cached.checkedAt < DEBUG_CONFIG_CACHE_MS
    ) {
      return cached.enabled;
    }

    let enabled = false;
    try {
      enabled = readSubagentsConfig(cwd).debug === true;
    } catch {}
    debugEnabledCache.set(key, { enabled, checkedAt: now });
    return enabled;
  } catch {
    return false;
  }
}

const DEBUG_LOG_RELATIVE_PATH = '.pi/subagents-debug.log';

function ensureDebugLogGitignored(root: string): void {
  try {
    if (!fs.existsSync(path.join(root, '.git'))) return;
    const gitignorePath = path.join(root, '.gitignore');
    let current = '';
    try {
      current = fs.readFileSync(gitignorePath, 'utf8');
    } catch {}
    const lines = current.split(/\r?\n/).map((line) => line.trim());
    if (lines.includes(DEBUG_LOG_RELATIVE_PATH)) return;
    const prefix = current.length > 0 && !current.endsWith('\n') ? '\n' : '';
    fs.appendFileSync(gitignorePath, `${prefix}${DEBUG_LOG_RELATIVE_PATH}\n`);
  } catch {}
}

export function writeSubagentsDebugLog(
  cwd: string | undefined,
  scope: string,
  data: unknown,
): void {
  const root = cwd ?? process.cwd();
  if (!isSubagentsDebugEnabled(root)) return;
  try {
    const file = path.join(root, DEBUG_LOG_RELATIVE_PATH);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    ensureDebugLogGitignored(root);
    fs.appendFileSync(
      file,
      `${new Date().toISOString()} ${scope} ${JSON.stringify(data, (_key, value) => (value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value)).slice(0, 4000)}\n`,
    );
  } catch {}
}
