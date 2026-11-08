import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { defaultModelProfile } from './resolver.js';
import {
  type EffectiveRoster,
  type ModelProfileSelection,
  type ModelProfilesDocument,
  type NamedModelProfile,
  PROFILE_ROLES,
  type ProfileScope,
  type RoleProfile,
} from './types.js';

export const DEFAULT_PROFILE = 'default';
export type ModelProfileStoreOptions = {
  cwd: string;
  configDir?: string;
  homeDir?: string;
  env?: Record<string, string | undefined>;
  /** Injected effective thoth-agents.json roster, including shipped defaults. */
  roster?: EffectiveRoster;
  warn?: (message: string) => void;
  paths?: { global: string; project: string };
};

export function modelProfilePaths(options: ModelProfileStoreOptions): {
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
    global: path.join(configDir, 'thoth', 'profiles.json'),
    project: path.join(options.cwd, '.opencode', 'thoth', 'profiles.json'),
  };
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateProfileName(value: unknown, writable = false): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Profile name must be non-empty');
  const name = value.trim();
  if (writable && name === DEFAULT_PROFILE)
    throw new Error('default is a reserved read-only virtual profile');
  return name;
}

export function parseRoleProfile(value: unknown): RoleProfile {
  if (!object(value)) throw new Error('Role override must be an object');
  if (
    value.model !== undefined &&
    (typeof value.model !== 'string' ||
      !/^[^/\s#]+\/[^\s#]+$/.test(value.model))
  )
    throw new Error('Invalid model; expected provider/id without #variant');
  if (
    value.variant !== undefined &&
    (typeof value.variant !== 'string' || !/^[^\s#]+$/.test(value.variant))
  )
    throw new Error(
      'Invalid variant; expected a non-empty string without whitespace or #',
    );
  return {
    ...(value.model !== undefined ? { model: value.model as string } : {}),
    ...(value.variant !== undefined
      ? { variant: value.variant as string }
      : {}),
  };
}

export function parseNamedModelProfile(value: unknown): NamedModelProfile {
  if (!object(value) || !object(value.agents))
    throw new Error('Profile must contain an agents object');
  const agents: NamedModelProfile['agents'] = {};
  for (const [role, override] of Object.entries(value.agents)) {
    const canonical = PROFILE_ROLES.find((name) => name === role);
    if (!canonical) throw new Error(`Unknown profile role: ${role}`);
    agents[canonical] = parseRoleProfile(override);
  }
  return { agents };
}

/** Strict parser for editors; runtime readers catch errors and warn instead. */
export function parseModelProfilesDocument(
  raw: unknown,
): ModelProfilesDocument {
  if (!object(raw) || raw.version !== 1 || !object(raw.profiles))
    throw new Error('Expected version 1 and a profiles object');
  const profiles: ModelProfilesDocument['profiles'] = Object.create(null);
  for (const [key, value] of Object.entries(raw.profiles)) {
    const name = validateProfileName(key, true);
    if (Object.hasOwn(profiles, name))
      throw new Error(`Duplicate profile: ${name}`);
    profiles[name] = parseNamedModelProfile(value);
  }
  return {
    version: 1,
    ...(raw.active !== undefined
      ? { active: validateProfileName(raw.active) }
      : {}),
    profiles,
  };
}

const emptyDocument = (): ModelProfilesDocument => ({
  version: 1,
  profiles: Object.create(null),
});

/** Identifiable optimistic-concurrency failure for RPC/TUI reload prompts. */
export class ProfileConflictError extends Error {
  readonly code = 'PROFILE_CONFLICT';
  constructor(
    readonly scope: ProfileScope,
    readonly profileName: string,
  ) {
    super(
      `Profile changed on disk: ${scope}:${profileName}; reload before saving.`,
    );
    this.name = 'ProfileConflictError';
  }
}

/** Synchronous, host-neutral file store. Runtime reads never throw for bad files. */
export class ModelProfileStore {
  readonly paths: { global: string; project: string };
  constructor(private readonly options: ModelProfileStoreOptions) {
    this.paths = modelProfilePaths(options);
  }

  defaultProfile(): NamedModelProfile {
    return defaultModelProfile(this.options.roster ?? {});
  }

  private load(scope: ProfileScope): ModelProfilesDocument {
    try {
      return parseModelProfilesDocument(
        JSON.parse(fs.readFileSync(this.paths[scope], 'utf8')),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return emptyDocument();
      throw new Error(
        `Cannot read model profiles ${this.paths[scope]}: ${String(error)}`,
        { cause: error },
      );
    }
  }

  read(scope: ProfileScope, warnings: string[] = []): ModelProfilesDocument {
    try {
      return this.load(scope);
    } catch (error) {
      const warning = String(error);
      warnings.push(warning);
      this.options.warn?.(warning);
      return emptyDocument();
    }
  }

  lookup(
    name: string,
    scope?: ProfileScope,
  ): { profile: NamedModelProfile; scope?: ProfileScope } | undefined {
    const key = validateProfileName(name);
    if (key === DEFAULT_PROFILE) return { profile: this.defaultProfile() };
    for (const source of scope ? [scope] : (['project', 'global'] as const)) {
      const profiles = this.read(source).profiles;
      if (Object.hasOwn(profiles, key))
        return { profile: profiles[key], scope: source };
    }
    return undefined;
  }

  private write(scope: ProfileScope, document: ModelProfilesDocument): void {
    const validated = parseModelProfilesDocument(document);
    const file = this.paths[scope];
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, `${JSON.stringify(validated, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      });
      fs.renameSync(temp, file);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  }

  /** Re-read before writing. An expected baseline enables same-profile conflict detection. */
  save(
    scope: ProfileScope,
    name: string,
    value: unknown,
    options: { expected?: NamedModelProfile | null } = {},
  ): void {
    const key = validateProfileName(name, true);
    const next = parseNamedModelProfile(value);
    const document = this.load(scope);
    const existing = Object.hasOwn(document.profiles, key)
      ? document.profiles[key]
      : null;
    if (
      Object.hasOwn(options, 'expected') &&
      !isDeepStrictEqual(existing, options.expected)
    )
      throw new ProfileConflictError(scope, key);
    document.profiles[key] = next;
    this.write(scope, document);
  }

  create(scope: ProfileScope, name: string, value: unknown): void {
    const key = validateProfileName(name, true);
    if (Object.hasOwn(this.load(scope).profiles, key))
      throw new Error(`Profile already exists: ${key}`);
    this.save(scope, key, value, { expected: null });
  }

  /** Pins that actually resolved to a global profile follow rename/delete. */
  private projectPointsToGlobal(name: string): boolean {
    const project = this.load('project');
    return project.active === name && !Object.hasOwn(project.profiles, name);
  }

  rename(scope: ProfileScope, source: string, target: string): void {
    const from = validateProfileName(source, true);
    const to = validateProfileName(target, true);
    const document = this.load(scope);
    if (!Object.hasOwn(document.profiles, from))
      throw new Error(`Profile not found: ${from}`);
    if (Object.hasOwn(document.profiles, to))
      throw new Error(`Profile already exists: ${to}`);
    const followPin = scope === 'global' && this.projectPointsToGlobal(from);
    document.profiles[to] = document.profiles[from];
    delete document.profiles[from];
    if (document.active === from) document.active = to;
    this.write(scope, document);
    if (followPin) this.setProjectPin(to);
  }

  delete(scope: ProfileScope, name: string): { clearedActive: boolean } {
    const key = validateProfileName(name, true);
    const document = this.load(scope);
    if (!Object.hasOwn(document.profiles, key))
      throw new Error(`Profile not found: ${key}`);
    const clearPin = scope === 'global' && this.projectPointsToGlobal(key);
    delete document.profiles[key];
    const clearedActive = document.active === key;
    if (clearedActive) delete document.active;
    this.write(scope, document);
    if (clearPin) this.setProjectPin();
    return { clearedActive };
  }

  setActive(scope: ProfileScope, name?: string): void {
    const document = this.load(scope);
    if (name === undefined) delete document.active;
    else {
      const key = validateProfileName(name);
      if (
        key !== DEFAULT_PROFILE &&
        !(scope === 'global'
          ? Object.hasOwn(document.profiles, key)
          : this.lookup(key))
      )
        throw new Error(`Profile not found: ${key}`);
      document.active = key;
    }
    this.write(scope, document);
  }

  setGlobalActive(name?: string): void {
    this.setActive('global', name);
  }
  setProjectPin(name?: string): void {
    this.setActive('project', name);
  }

  resolve(sessionSelection?: string): ModelProfileSelection {
    const warnings: string[] = [];
    const documents = {
      global: this.read('global', warnings),
      project: this.read('project', warnings),
    };
    for (const [level, name] of [
      ['session', sessionSelection],
      ['project', documents.project.active],
      ['global', documents.global.active],
    ] as const) {
      if (!name) continue;
      if (name === DEFAULT_PROFILE)
        return { name, profile: this.defaultProfile(), warnings };
      const scope = Object.hasOwn(documents.project.profiles, name)
        ? 'project'
        : 'global';
      if (
        Object.hasOwn(documents[scope].profiles, name) &&
        (level !== 'global' || Object.hasOwn(documents.global.profiles, name))
      )
        return {
          name,
          scope,
          profile: documents[scope].profiles[name],
          warnings,
        };
      const warning = `Missing ${level} model profile "${name}"; falling back.`;
      warnings.push(warning);
      this.options.warn?.(warning);
    }
    return { name: DEFAULT_PROFILE, profile: this.defaultProfile(), warnings };
  }
}
