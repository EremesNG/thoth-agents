import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEffort, parseModel } from '../config.js';
import type { SubagentModelProfile, SubagentModelProfiles } from '../types.js';

export type ProfileScope = 'global' | 'project';
export type NamedModelProfile = {
  agents: SubagentModelProfiles;
  orchestrator?: SubagentModelProfile;
  [key: string]: unknown;
};
export type ModelProfilesDocument = {
  version: 1;
  active?: string;
  profiles: Record<string, NamedModelProfile>;
  [key: string]: unknown;
};
export type ModelProfileSelection = {
  name: string;
  scope?: ProfileScope;
  profile: NamedModelProfile;
  warnings: string[];
};
export type ModelProfileStoreOptions = { cwd: string; agentDir?: string };
export function modelProfilePaths({ cwd, agentDir }: ModelProfileStoreOptions) {
  return {
    global: path.join(
      agentDir ??
        process.env.PI_CODING_AGENT_DIR ??
        path.join(os.homedir(), '.pi', 'agent'),
      'thoth',
      'profiles.json',
    ),
    project: path.join(cwd, '.pi', 'thoth', 'profiles.json'),
  };
}
function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function validateName(value: unknown, writable = false): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Profile name must be non-empty');
  const result = value.trim();
  if (writable && result === 'default')
    throw new Error('default is a reserved virtual profile');
  return result;
}
function parseOverride(value: unknown, label: string): SubagentModelProfile {
  if (!isObject(value)) throw new Error(`Invalid override for ${label}`);
  const model = parseModel(value.model);
  const effort = parseEffort(value.effort);
  if (value.model !== undefined && !model)
    throw new Error(`Invalid model for ${label}; expected provider/id`);
  if (value.effort !== undefined && !effort)
    throw new Error(`Invalid effort for ${label}`);
  return {
    ...value,
    ...(model ? { model } : {}),
    ...(effort ? { effort } : {}),
  };
}
function parseProfile(value: unknown): NamedModelProfile {
  if (!isObject(value) || !isObject(value.agents))
    throw new Error('Profile must contain an agents object');
  const agents: SubagentModelProfiles = Object.create(null);
  for (const [key, entry] of Object.entries(value.agents)) {
    const agent = key.trim().toLowerCase();
    if (!agent || !isObject(entry) || Object.hasOwn(agents, agent))
      throw new Error(`Invalid or duplicate agent: ${key}`);
    agents[agent] = parseOverride(entry, agent);
  }
  return {
    ...value,
    agents,
    ...(value.orchestrator !== undefined
      ? { orchestrator: parseOverride(value.orchestrator, 'orchestrator') }
      : {}),
  };
}
export function parseModelProfilesDocument(
  raw: unknown,
): ModelProfilesDocument {
  if (!isObject(raw) || raw.version !== 1 || !isObject(raw.profiles))
    throw new Error('Expected version 1 and a profiles object');
  const profiles: Record<string, NamedModelProfile> = Object.create(null);
  for (const [key, value] of Object.entries(raw.profiles)) {
    const normalized = validateName(key, true);
    if (Object.hasOwn(profiles, normalized))
      throw new Error(`Duplicate profile: ${normalized}`);
    profiles[normalized] = parseProfile(value);
  }
  return {
    ...raw,
    version: 1,
    ...(raw.active !== undefined ? { active: validateName(raw.active) } : {}),
    profiles,
  };
}
function serializeOverride(entry: SubagentModelProfile) {
  return {
    ...entry,
    ...(entry.model
      ? { model: `${entry.model.provider}/${entry.model.id}` }
      : {}),
  };
}
function serializeProfile(value: NamedModelProfile) {
  const agents = Object.fromEntries(
    Object.entries(value.agents).map(([agent, entry]) => [
      agent,
      serializeOverride(entry),
    ]),
  );
  return {
    ...value,
    agents,
    ...(value.orchestrator
      ? { orchestrator: serializeOverride(value.orchestrator) }
      : {}),
  };
}

export class ModelProfileStore {
  readonly paths: ReturnType<typeof modelProfilePaths>;
  constructor(options: ModelProfileStoreOptions) {
    this.paths = modelProfilePaths(options);
  }
  read(scope: ProfileScope): ModelProfilesDocument {
    const file = this.paths[scope];
    try {
      return parseModelProfilesDocument(
        JSON.parse(fs.readFileSync(file, 'utf8')),
      );
    } catch (error: any) {
      if (error?.code === 'ENOENT')
        return { version: 1, profiles: Object.create(null) };
      throw new Error(`Cannot read model profiles ${file}: ${error.message}`, {
        cause: error,
      });
    }
  }
  private write(scope: ProfileScope, document: ModelProfilesDocument): void {
    const validated = parseModelProfilesDocument(document);
    const serialized = {
      ...validated,
      profiles: Object.fromEntries(
        Object.entries(validated.profiles).map(([key, value]) => [
          key,
          serializeProfile(value),
        ]),
      ),
    };
    const file = this.paths[scope];
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, `${JSON.stringify(serialized, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      });
      fs.renameSync(temp, file);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  }
  save(scope: ProfileScope, profileName: string, value: unknown): void {
    const key = validateName(profileName, true);
    const document = this.read(scope);
    const next = parseProfile(value);
    const existing = document.profiles[key];
    for (const [agent, entry] of Object.entries(next.agents)) {
      const previous = { ...existing?.agents[agent] };
      delete previous.model;
      delete previous.effort;
      next.agents[agent] = { ...previous, ...entry };
    }
    document.profiles[key] = { ...existing, ...next };
    this.write(scope, document);
  }
  create(scope: ProfileScope, profileName: string, value: unknown): void {
    const key = validateName(profileName, true);
    if (Object.hasOwn(this.read(scope).profiles, key))
      throw new Error(`Profile already exists: ${key}`);
    this.save(scope, key, value);
  }
  lookup(
    profileName: string,
    sourceScope?: ProfileScope,
  ): { profile: NamedModelProfile; scope?: ProfileScope } | undefined {
    const key = validateName(profileName);
    if (key === 'default') return { profile: { agents: {} } };
    for (const scope of sourceScope
      ? [sourceScope]
      : (['project', 'global'] as const)) {
      const value = this.read(scope).profiles[key];
      if (value) return { profile: value, scope };
    }
    return undefined;
  }
  clone(
    source: string,
    scope: ProfileScope,
    target: string,
    sourceScope?: ProfileScope,
  ): void {
    const found = this.lookup(source, sourceScope);
    if (!found) throw new Error(`Profile not found: ${source}`);
    this.create(scope, target, found.profile);
  }
  rename(scope: ProfileScope, source: string, target: string): void {
    const from = validateName(source, true);
    const to = validateName(target, true);
    const document = this.read(scope);
    if (!Object.hasOwn(document.profiles, from))
      throw new Error(`Profile not found: ${from}`);
    if (Object.hasOwn(document.profiles, to))
      throw new Error(`Profile already exists: ${to}`);
    document.profiles[to] = document.profiles[from];
    delete document.profiles[from];
    if (document.active === from) document.active = to;
    this.write(scope, document);
  }
  delete(scope: ProfileScope, profileName: string): { clearedActive: boolean } {
    const key = validateName(profileName, true);
    const document = this.read(scope);
    if (!Object.hasOwn(document.profiles, key))
      throw new Error(`Profile not found: ${key}`);
    delete document.profiles[key];
    const clearedActive = document.active === key;
    if (clearedActive) delete document.active;
    this.write(scope, document);
    return { clearedActive };
  }
  setActive(scope: ProfileScope, profileName?: string): void {
    const document = this.read(scope);
    if (profileName !== undefined) {
      const key = validateName(profileName);
      if (
        key !== 'default' &&
        !(scope === 'global'
          ? Object.hasOwn(document.profiles, key)
          : this.lookup(key))
      )
        throw new Error(`Profile not found: ${key}`);
      document.active = key;
    } else delete document.active;
    this.write(scope, document);
  }
  setGlobalActive(profileName?: string): void {
    this.setActive('global', profileName);
  }
  setProjectPin(profileName?: string): void {
    this.setActive('project', profileName);
  }
  resolve(sessionSelection?: string): ModelProfileSelection {
    const warnings: string[] = [];
    const documents = {} as Record<ProfileScope, ModelProfilesDocument>;
    for (const scope of ['global', 'project'] as const) {
      try {
        documents[scope] = this.read(scope);
      } catch (error) {
        warnings.push(String(error));
        documents[scope] = { version: 1, profiles: Object.create(null) };
      }
    }
    for (const [level, key] of [
      ['session', sessionSelection],
      ['project', documents.project.active],
      ['global', documents.global.active],
    ] as const) {
      if (!key) continue;
      if (key === 'default')
        return { name: 'default', profile: { agents: {} }, warnings };
      const scope = Object.hasOwn(documents.project.profiles, key)
        ? 'project'
        : 'global';
      const value = documents[scope].profiles[key];
      if (
        value &&
        (level !== 'global' || Object.hasOwn(documents.global.profiles, key))
      )
        return { name: key, scope, profile: value, warnings };
      warnings.push(`Missing ${level} model profile "${key}"; falling back.`);
    }
    return { name: 'default', profile: { agents: {} }, warnings };
  }
}
