import fs from 'node:fs';
import path from 'node:path';
import type {
  LoadSkillsResult,
  ResolvedPaths,
  ResolvedResource,
} from '@earendil-works/pi-coding-agent';
import { excludeOrcaManagedExtensions } from './orca-managed-extensions.js';

/** Resolve once with a skip handler, then give reload a package-free snapshot. */
export async function leanResources(
  sdk: any,
  cwd: string,
  agentDir: string,
  ctx: any,
  enabled: boolean,
  filter: string[] | undefined,
  diagnostic: (message: string) => void,
) {
  const SettingsManager = sdk.SettingsManager;
  const parentCwd = ctx?.sessionManager?.getCwd?.() ?? ctx?.cwd;
  // Lexical containment is not a trust boundary: a nested junction can point
  // outside the parent's project. Use the same canonical decision for all
  // project resources, and never inherit trust when canonicalization fails.
  let withinParent = false;
  try {
    if (typeof parentCwd !== 'string')
      throw new Error('Parent project root unavailable');
    const canonicalParent = fs.realpathSync.native(parentCwd);
    const canonicalChild = fs.realpathSync.native(cwd);
    const normalizeCase = (value: string) =>
      process.platform === 'win32' ? value.toLowerCase() : value;
    const relative = path.relative(
      normalizeCase(canonicalParent),
      normalizeCase(canonicalChild),
    );
    withinParent =
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative);
    if (!withinParent)
      diagnostic(
        'Child project is outside the canonical parent project; using persisted trust only.',
      );
  } catch (error) {
    diagnostic(
      `Canonical project containment unavailable; using persisted trust only: ${String(error)}`,
    );
  }
  let trusted = false;
  try {
    if (withinParent) {
      const trust =
        ctx?.isProjectTrusted?.() ?? ctx?.settingsManager?.isProjectTrusted?.();
      trusted = trust === true;
      if (typeof trust !== 'boolean')
        diagnostic(
          'Parent project trust API unavailable; project skills excluded.',
        );
    } else if (typeof sdk.ProjectTrustStore === 'function') {
      trusted = new sdk.ProjectTrustStore(agentDir).get(cwd) === true;
    } else {
      diagnostic('ProjectTrustStore unavailable; project skills excluded.');
    }
  } catch (error) {
    diagnostic(
      `Project trust unavailable; project skills excluded: ${String(error)}`,
    );
  }

  // Never change the parent's manager. Trust is explicit, not create()'s default.
  let settingsManager: any;
  if (typeof SettingsManager?.create === 'function') {
    settingsManager = SettingsManager.create(cwd, agentDir, {
      projectTrusted: trusted,
    });
    if (typeof settingsManager.setProjectTrusted === 'function')
      settingsManager.setProjectTrusted(trusted);
    else {
      diagnostic(
        'SettingsManager trust API unavailable; project resources excluded.',
      );
      trusted = false;
      settingsManager = SettingsManager.inMemory(
        settingsManager.getGlobalSettings?.() ?? {},
        { projectTrusted: false },
      );
    }
    const parentGlobal = ctx?.settingsManager?.getGlobalSettings?.();
    if (parentGlobal && typeof SettingsManager.fromStorage === 'function') {
      const snapshots: Record<string, string> = {
        global: JSON.stringify({
          ...settingsManager.getGlobalSettings(),
          ...parentGlobal,
        }),
        project: JSON.stringify(
          trusted ? settingsManager.getProjectSettings() : {},
        ),
      };
      settingsManager = SettingsManager.fromStorage(
        {
          withLock(
            scope: string,
            update: (current: string) => string | undefined,
          ) {
            const next = update(snapshots[scope]);
            if (next !== undefined) snapshots[scope] = next;
          },
        },
        { projectTrusted: trusted },
      );
    }
  } else {
    diagnostic(
      'Child settings discovery unavailable; project resources excluded.',
    );
    trusted = false;
    settingsManager = SettingsManager.inMemory(
      ctx?.settingsManager?.getGlobalSettings?.() ?? {},
      { projectTrusted: false },
    );
  }

  let resolved: Pick<ResolvedPaths, 'extensions' | 'skills'> = {
    extensions: [],
    skills: [],
  };
  if (typeof sdk.DefaultPackageManager === 'function') {
    try {
      const packages = new sdk.DefaultPackageManager({
        cwd,
        agentDir,
        settingsManager,
      });
      // Older resolvers without the skip-handler seam must not run against
      // configured sources. Conservatively omit entries rather than install.
      if (
        typeof packages.resolve !== 'function' ||
        packages.resolve.length < 1
      ) {
        diagnostic(
          'Offline package resolver missing skip-handler API; child catalog omitted.',
        );
      } else {
        resolved = await packages.resolve(async (source: string) => {
          diagnostic(
            `Missing package skipped (offline child discovery): ${source}`,
          );
          return 'skip';
        });
      }
    } catch (error) {
      diagnostic(
        `Offline child resource discovery failed; affected entries omitted: ${String(error)}`,
      );
    }
  } else {
    diagnostic(
      'DefaultPackageManager unavailable; child skill catalog omitted.',
    );
  }

  // noSkills alone does NOT prevent reload() from resolving/installing packages.
  // This child-owned snapshot removes every source that could trigger an install.
  const loaderSettings = SettingsManager.inMemory(
    {
      ...settingsManager.getSettings(),
      packages: [],
      extensions: [],
      skills: [],
      prompts: [],
      themes: [],
    },
    { projectTrusted: trusted },
  );
  const enabledPaths = (entries: ResolvedResource[]) =>
    entries
      .filter(
        (entry) =>
          entry.enabled && (trusted || entry.metadata.scope !== 'project'),
      )
      .map((entry) => entry.path);
  return {
    settingsManager,
    loaderSettings,
    additionalExtensionPaths: excludeOrcaManagedExtensions(
      enabledPaths(resolved.extensions),
      cwd,
    ),
    additionalSkillPaths: enabled ? enabledPaths(resolved.skills) : [],
    skillsOverride: (base: LoadSkillsResult) => {
      const visible = enabled
        ? base.skills.filter((skill) => !skill.disableModelInvocation)
        : [];
      if (enabled && filter) {
        for (const pattern of filter) {
          if (!visible.some((skill) => path.matchesGlob(skill.name, pattern)))
            diagnostic(`Skill filter matched no visible skill: ${pattern}`);
        }
      }
      return {
        ...base,
        skills: filter
          ? visible.filter((skill) =>
              filter.some((pattern) => path.matchesGlob(skill.name, pattern)),
            )
          : visible,
      };
    },
  };
}
