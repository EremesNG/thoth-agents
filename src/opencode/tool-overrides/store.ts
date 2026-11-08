import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  SPECIALIST_ROLES,
  type SpecialistRole,
  type ToolScope,
  type ToolsDocument,
  type ToolsRevision,
  type ToolsSnapshot,
  type ToolsState,
} from './types.js';
import {
  parseActionOverrides,
  parseToolsDocument,
  validateSpecialistRole,
} from './validation.js';

export type ToolsOverrideStoreOptions = {
  cwd: string;
  configDir?: string;
  homeDir?: string;
  env?: Record<string, string | undefined>;
  paths?: { global: string; project: string };
  warn?: (message: string) => void;
};

export function toolsOverridePaths(options: ToolsOverrideStoreOptions): {
  global: string;
  project: string;
} {
  if (options.paths) return { ...options.paths };
  const env = options.env ?? process.env;
  const configDir =
    options.configDir ??
    (env.OPENCODE_CONFIG_DIR?.trim() ||
      path.join(
        env.XDG_CONFIG_HOME ||
          path.join(options.homeDir ?? os.homedir(), '.config'),
        'opencode',
      ));
  return {
    global: path.join(configDir, 'thoth', 'tools.json'),
    project: path.join(options.cwd, '.opencode', 'thoth', 'tools.json'),
  };
}

const emptyDocument = (): ToolsDocument => ({ version: 1, roles: {} });
const revisionOf = (raw: string | null): ToolsRevision =>
  raw === null ? 'missing' : createHash('sha256').update(raw).digest('hex');

export class ToolsConflictError extends Error {
  readonly code = 'TOOLS_CONFLICT';
  constructor(readonly scope: ToolScope) {
    super(`Tools changed on disk: ${scope}; reload before saving.`);
    this.name = 'ToolsConflictError';
  }
}

/** Synchronous host-neutral store with per-file optimistic revisions. */
export class ToolsOverrideStore {
  readonly paths: { global: string; project: string };
  constructor(private readonly options: ToolsOverrideStoreOptions) {
    this.paths = toolsOverridePaths(options);
  }

  private raw(scope: ToolScope): string | null {
    try {
      return fs.readFileSync(this.paths[scope], 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  read(scope: ToolScope): ToolsSnapshot {
    const warnings: string[] = [];
    let raw: string | null = null;
    let document = emptyDocument();
    try {
      raw = this.raw(scope);
      if (raw !== null)
        document = parseToolsDocument(JSON.parse(raw), warnings);
    } catch (error) {
      warnings.push(`Cannot read tools ${this.paths[scope]}: ${String(error)}`);
    }
    for (const warning of warnings) this.options.warn?.(warning);
    return { document, revision: revisionOf(raw), warnings };
  }

  resolve(): ToolsState {
    const global = this.read('global');
    const project = this.read('project');
    const effective: ToolsState['effective'] = {};
    for (const role of SPECIALIST_ROLES) {
      const origin = Object.hasOwn(project.document.roles, role)
        ? 'project'
        : 'global';
      const entry = (origin === 'project' ? project : global).document.roles[
        role
      ];
      if (entry) effective[role] = { ...entry, origin };
    }
    return {
      global,
      project,
      effective,
      warnings: [...global.warnings, ...project.warnings],
    };
  }

  private mutate(
    scope: ToolScope,
    role: SpecialistRole,
    baseRevision: ToolsRevision,
    update: (document: ToolsDocument) => void,
  ): ToolsSnapshot {
    validateSpecialistRole(role);
    const raw = this.raw(scope);
    if (revisionOf(raw) !== baseRevision) throw new ToolsConflictError(scope);
    // Unlike tolerant runtime reads, mutation must never erase an invalid file.
    const document =
      raw === null ? emptyDocument() : parseToolsDocument(JSON.parse(raw));
    update(document);
    const file = this.paths[scope];
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, `${JSON.stringify(document, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      });
      if (revisionOf(this.raw(scope)) !== baseRevision)
        throw new ToolsConflictError(scope);
      fs.renameSync(temp, file);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
    return this.read(scope);
  }

  /** Save ordered rules losslessly, including duplicates; other roles survive. */
  save(
    scope: ToolScope,
    role: SpecialistRole,
    overrides: unknown,
    baseRevision: ToolsRevision,
  ): ToolsSnapshot {
    const next = parseActionOverrides(overrides);
    return this.mutate(scope, role, baseRevision, (document) => {
      document.roles[role] = { overrides: next };
    });
  }

  /** Remove a scope's role entry (project reset resumes global inheritance). */
  reset(
    scope: ToolScope,
    role: SpecialistRole,
    baseRevision: ToolsRevision,
  ): ToolsSnapshot {
    return this.mutate(scope, role, baseRevision, (document) => {
      delete document.roles[role];
    });
  }
}
