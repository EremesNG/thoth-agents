import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  mergeCodexManagedConfig,
  parseCodexToml,
  patchScalar,
  writeCodexConfigMerge,
} from './codex-config-io';

describe('Codex config IO', () => {
  test('merges managed feature gates idempotently while preserving tables', () => {
    const source =
      'model = "gpt-5"\n\n[profiles.work]\napproval_policy = "on-request"\n\n[mcp_servers.thoth_mem]\ncommand = "bun"\n';
    const merged = mergeCodexManagedConfig(parseCodexToml(source), {});
    const mergedAgain = mergeCodexManagedConfig(
      parseCodexToml(merged.content),
      {},
    );

    expect(merged.content).toContain(
      '[features]\ndefault_mode_request_user_input = true',
    );
    expect(merged.content).not.toContain('hooks = true');
    expect(merged.content).toContain(
      '[profiles.work]\napproval_policy = "on-request"',
    );
    expect(merged.content).toContain(
      '[mcp_servers.thoth_mem]\ncommand = "bun"',
    );
    expect(mergedAgain.content).toBe(merged.content);
    expect(merged.warnings).toContain(
      'Codex TOML comments and formatting may be rewritten; a backup is created before apply.',
    );
  });

  test('preserves independently installed provider configuration outside the managed feature edit', () => {
    const source =
      '[mcp_servers.thoth_mem]\n' +
      'command = "provider-owned"\n' +
      'args = ["serve", "--state-dir", "D:\\\\provider-state"]\n' +
      '\n[mcp_servers.thoth_mem.env]\n' +
      'THOTH_PROFILE = "work"\n\n' +
      '[profiles.work]\n' +
      'approval_policy = "on-request"\n';

    const result = mergeCodexManagedConfig(parseCodexToml(source), {});
    const before = parseCodexToml(source) as {
      mcp_servers?: { thoth_mem?: unknown };
    };
    const after = parseCodexToml(result.content) as {
      mcp_servers?: { thoth_mem?: unknown };
    };

    expect(after.mcp_servers?.thoth_mem).toEqual(before.mcp_servers?.thoth_mem);
    expect(result.content).toContain(
      '[features]\ndefault_mode_request_user_input = true',
    );
  });

  test('gates plugin enablement on an explicit safe identifier', () => {
    const withoutPlugin = mergeCodexManagedConfig(parseCodexToml(''), {});
    const withPlugin = mergeCodexManagedConfig(parseCodexToml(''), {
      pluginId: 'thoth-agents',
    });

    expect(withoutPlugin.content).not.toContain('[plugins.');
    expect(withPlugin.content).toContain(
      '[plugins."thoth-agents"]\nenabled = true',
    );
  });

  test('preserves existing Codex MCP arrays, numbers, booleans, and Windows literal strings when merging', () => {
    const nodeReplCommand =
      'C:\\Users\\EremesNG\\AppData\\Local\\OpenAI\\Codex\\bin\\3c238e29bbc930ff\\node_repl.exe';
    const codexCliPath =
      'C:\\Users\\EremesNG\\AppData\\Local\\OpenAI\\Codex\\bin\\3b5d676fd5f36bba\\codex.exe';
    const codexHome = 'C:\\Users\\EremesNG\\.codex';
    const source = `
[mcp_servers.node_repl]
args = []
command = '${nodeReplCommand}'
enabled = true
startup_timeout_sec = 120

[mcp_servers.node_repl.env]
CODEX_CLI_PATH = '${codexCliPath}'
CODEX_HOME = '${codexHome}'
`;

    const merged = mergeCodexManagedConfig(parseCodexToml(source), {});
    const parsedAgain = parseCodexToml(merged.content);

    expect(merged.content).toContain('args = []');
    expect(merged.content).toContain('startup_timeout_sec = 120');
    expect(merged.content).toContain('enabled = true');
    expect(merged.content).toContain(`command = '${nodeReplCommand}'`);
    expect(merged.content).toContain(`CODEX_CLI_PATH = '${codexCliPath}'`);
    expect(merged.content).toContain(`CODEX_HOME = '${codexHome}'`);
    expect(merged.content).not.toContain('args = "[]"');
    expect(merged.content).not.toContain('"\'C:');
    expect(merged.content).not.toContain('C:\\\\Users');
    expect(parsedAgain).toMatchObject({
      mcp_servers: {
        node_repl: {
          args: [],
          command: nodeReplCommand,
          enabled: true,
          startup_timeout_sec: 120,
          env: {
            CODEX_CLI_PATH: codexCliPath,
            CODEX_HOME: codexHome,
          },
        },
      },
    });
  });

  test('round-trips literal quoted project table paths without adding extra quotes', () => {
    const projectPath = 'c:\\dev\\proyectos\\webstorm\\ragasagpt-ppt';
    const source = String.raw`
[projects.'c:\dev\proyectos\webstorm\ragasagpt-ppt']
trust_level = "trusted"
`;

    const merged = mergeCodexManagedConfig(parseCodexToml(source), {});
    const mergedAgain = mergeCodexManagedConfig(
      parseCodexToml(merged.content),
      {},
    );

    expect(merged.content).toContain(
      String.raw`[projects.'c:\dev\proyectos\webstorm\ragasagpt-ppt']`,
    );
    expect(merged.content).not.toContain(
      String.raw`[projects."'c:\dev\proyectos\webstorm\ragasagpt-ppt'"]`,
    );
    expect(merged.content).toContain('trust_level = "trusted"');
    expect(mergedAgain.content).toBe(merged.content);
    expect(parseCodexToml(merged.content)).toMatchObject({
      projects: {
        [projectPath]: {
          trust_level: 'trusted',
        },
      },
    });
  });

  test('parses dots inside quoted table path segments as part of the key', () => {
    const source = String.raw`
[projects.'c:\dev\project.with.dots']
trust_level = "trusted"
`;

    expect(parseCodexToml(source)).toMatchObject({
      projects: {
        'c:\\dev\\project.with.dots': {
          trust_level: 'trusted',
        },
      },
    });
  });

  test('preserves array-of-tables skills config headers during merge', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-config-'));
    try {
      const configPath = join(dir, 'config.toml');
      writeFileSync(
        configPath,
        'approval_policy = "on-request"\n' +
          'sandbox_mode = "workspace-write"\n' +
          'agents = ["orchestrator", "explorer", "librarian", "oracle", "designer", "worker"]\n\n' +
          '[[skills.config]]\n' +
          'enabled = true\n' +
          'sources = ["repo"]\n',
      );

      const result = writeCodexConfigMerge({ configPath, dryRun: false });
      const updated = readFileSync(configPath, 'utf8');

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.error).toBeUndefined();
      expect(updated).toContain('[[skills.config]]');
      expect(updated).not.toContain('[skills.config]\n');
      expect(result.diffSummary).toContain(
        'ensure features.default_mode_request_user_input = true',
      );
      expect(result.warnings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('leaves existing enabled feature flag byte-for-byte unchanged', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-config-'));
    try {
      const configPath = join(dir, 'config.toml');
      const source =
        '# keep this comment\n' +
        'model = "gpt-5"\n\n' +
        '[features]\n' +
        'default_mode_request_user_input = true\n\n' +
        '[[skills.config]]\n' +
        'enabled = true\n';
      writeFileSync(configPath, source);

      const result = writeCodexConfigMerge({ configPath, dryRun: false });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
      expect(readFileSync(configPath, 'utf8')).toBe(source);
      expect(existsSync(`${configPath}.bak`)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('adds missing feature flag without rewriting unrelated TOML', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-config-'));
    try {
      const configPath = join(dir, 'config.toml');
      const before =
        'approval_policy = "on-request"\n' +
        'sandbox_mode = "workspace-write"\n\n' +
        '[features]\n' +
        'experimental_client = true\n\n' +
        '[[skills.config]]\n' +
        'enabled = true\n' +
        'sources = ["repo"]\n';
      const after =
        'approval_policy = "on-request"\n' +
        'sandbox_mode = "workspace-write"\n\n' +
        '[features]\n' +
        'experimental_client = true\n' +
        'default_mode_request_user_input = true\n\n' +
        '[[skills.config]]\n' +
        'enabled = true\n' +
        'sources = ["repo"]\n';
      writeFileSync(configPath, before);

      const result = writeCodexConfigMerge({ configPath, dryRun: false });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(readFileSync(configPath, 'utf8')).toBe(after);
      expect(readFileSync(`${configPath}.bak`, 'utf8')).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('enables an existing false feature flag by changing only that line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-config-'));
    try {
      const configPath = join(dir, 'config.toml');
      const before =
        '[features]\n' +
        'default_mode_request_user_input = false # user disabled earlier\n\n' +
        '[[skills.config]]\n' +
        'enabled = true\n';
      const after =
        '[features]\n' +
        'default_mode_request_user_input = true # user disabled earlier\n\n' +
        '[[skills.config]]\n' +
        'enabled = true\n';
      writeFileSync(configPath, before);

      const result = writeCodexConfigMerge({ configPath, dryRun: false });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(readFileSync(configPath, 'utf8')).toBe(after);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('appends a features section when it is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-config-'));
    try {
      const configPath = join(dir, 'config.toml');
      const before =
        'model = "gpt-5"\n\n' + '[[skills.config]]\n' + 'enabled = true\n';
      const after =
        'model = "gpt-5"\n\n' +
        '[[skills.config]]\n' +
        'enabled = true\n\n' +
        '[features]\n' +
        'default_mode_request_user_input = true\n';
      writeFileSync(configPath, before);

      const result = writeCodexConfigMerge({ configPath, dryRun: false });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(readFileSync(configPath, 'utf8')).toBe(after);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('dry-run writes no files and apply creates backup plus atomic result', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-config-'));
    try {
      const configPath = join(dir, 'config.toml');
      writeFileSync(configPath, 'model = "gpt-5"\n');

      const dryRun = writeCodexConfigMerge({ configPath, dryRun: true });
      expect(dryRun.changed).toBe(true);
      expect(existsSync(`${configPath}.bak`)).toBe(false);

      const applied = writeCodexConfigMerge({ configPath, dryRun: false });
      expect(applied.success).toBe(true);
      expect(readFileSync(`${configPath}.bak`, 'utf8')).toBe(
        'model = "gpt-5"\n',
      );
      expect(readFileSync(configPath, 'utf8')).toContain(
        'default_mode_request_user_input = true',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test('capacity and consented trust preserve unrelated config bytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-capacity-'));
  const configPath = join(dir, 'capacity.toml');
  const before =
    '# operator\r\n[agents] # keep\r\nmax_concurrent_threads_per_session = 4  # prior\r\nother = "yes"\r\n[hooks.state."other:hook"]\r\ntrusted_hash = "sha256:other"\r\n';
  try {
    writeFileSync(configPath, before);
    const result = writeCodexConfigMerge({
      configPath,
      manageThreads: true,
      trustedHooks: { 'thoth:session_start:0:0': 'sha256:abc' },
    });
    expect(result.success).toBe(true);
    expect(result.priorThreadsValue).toBe('4');
    expect(readFileSync(configPath, 'utf8')).toBe(
      before.replace('= 4  # prior', '= 6  # prior') +
        '\r\n[features]\r\ndefault_mode_request_user_input = true\r\n\r\n[hooks.state."thoth:session_start:0:0"]\r\ntrusted_hash = "sha256:abc"\r\n',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('capacity absence is captured once and operator removal or edits survive updates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-capacity-'));
  const configPath = join(dir, 'config.toml');
  try {
    const first = writeCodexConfigMerge({ configPath, manageThreads: true });
    expect(first.priorThreadsValue).toBeNull();
    expect(
      writeCodexConfigMerge({
        configPath,
        manageThreads: true,
        priorThreadsValue: null,
      }).priorThreadsValue,
    ).toBeNull();
    writeFileSync(
      configPath,
      '# removed by operator\n[features]\ndefault_mode_request_user_input = true\n',
    );
    const before = readFileSync(configPath, 'utf8');
    const updated = writeCodexConfigMerge({
      configPath,
      manageThreads: true,
      priorThreadsValue: null,
    });
    expect(updated.warnings.join(' ')).toContain('Preserved operator-modified');
    expect(updated.priorThreadsValue).toBeNull();
    expect(readFileSync(configPath, 'utf8')).toBe(before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('patches dotted capacity and existing trust without rewriting neighboring bytes; dry-run is inert', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-capacity-'));
  const configPath = join(dir, 'config.toml');
  const before =
    'agents.max_concurrent_threads_per_session = 2 # cap\n[features]\ndefault_mode_request_user_input = true\n[hooks.state.\'owned\'] # trust\ntrusted_hash = "sha256:old"  # reviewed\nenabled = false\n[hooks.state.other]\ntrusted_hash = "sha256:keep"\n';
  const options = {
    configPath,
    manageThreads: true,
    trustedHooks: { owned: 'sha256:new' },
  };
  try {
    writeFileSync(configPath, before);
    expect(
      writeCodexConfigMerge({ ...options, dryRun: true }).priorThreadsValue,
    ).toBe('2');
    expect(readFileSync(configPath, 'utf8')).toBe(before);
    expect(existsSync(`${configPath}.bak`)).toBe(false);
    expect(writeCodexConfigMerge(options).success).toBe(true);
    expect(readFileSync(configPath, 'utf8')).toBe(
      before
        .replace('= 2 # cap', '= 6 # cap')
        .replace('sha256:old', 'sha256:new'),
    );
    expect(
      writeCodexConfigMerge({ ...options, priorThreadsValue: '2' }).changed,
    ).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('refuses inline-table capacity instead of creating conflicting TOML', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-inline-'));
  const configPath = join(dir, 'config.toml');
  const before = 'agents = { max_concurrent_threads_per_session = 4 }\n';
  try {
    writeFileSync(configPath, before);
    const result = writeCodexConfigMerge({ configPath, manageThreads: true });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported inline');
    expect(readFileSync(configPath, 'utf8')).toBe(before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const structuralConfig = readFileSync(
  new URL('./fixtures/codex-config-structural.toml', import.meta.url),
  'utf8',
);
test('reads native quoted hook headers and skips multiline values', () => {
  expect(parseCodexToml(structuralConfig)).toMatchObject({
    hooks: {
      state: {
        'computer-use@openai-bundled:plugin.json#hooks[0]:stop:0:0': {
          trusted_hash: 'placeholder#hash',
        },
        'escaped"quote.[]#@:=key': { trusted_hash: 'placeholder' },
      },
    },
    agents: { max_concurrent_threads_per_session: 6 },
  });
});
test('patches only threads, feature and hook values in structural config, preserving CRLF bytes', async () => {
  const {
    patchScalar,
    patchCodexDefaultModeUserInputFeature,
    readCodexThreadsValue,
  } = await import('./codex-config-io');
  const source = structuralConfig.replaceAll('\n', '\r\n');
  expect(readCodexThreadsValue(source)).toBe('6');
  const threads = patchScalar(
    source,
    ['agents', 'max_concurrent_threads_per_session'],
    '8',
  );
  expect(threads).toBe(source.replace('= 6 # retained', '= 8 # retained'));
  const key = 'computer-use@openai-bundled:plugin.json#hooks[0]:stop:0:0';
  const hooked = patchScalar(
    threads,
    ['hooks', 'state', key, 'trusted_hash'],
    '"new#hash"',
  );
  expect(hooked).toBe(threads.replace('"placeholder#hash"', '"new#hash"'));
  expect(parseCodexToml(hooked)).toMatchObject({
    hooks: { state: { [key]: { trusted_hash: 'new#hash' } } },
  });
  expect(patchCodexDefaultModeUserInputFeature(source)).toBe(
    source.replace(
      '[features] # retained\r\nother = true',
      '[features] # retained\r\nother = true\r\ndefault_mode_request_user_input = true',
    ),
  );
});

test.each([
  [
    '"computer-use@openai-bundled:plugin.json#hooks[0]:stop:0:0"',
    'computer-use@openai-bundled:plugin.json#hooks[0]:stop:0:0',
  ],
  ["'literal.[]#@:=key'", 'literal.[]#@:=key'],
  [
    String.raw`"escaped\"quote\\slash\u002E\U0001F600"`,
    String.raw`escaped"quote\slash.😀`,
  ],
  ['""', ''],
])('tokenizes quoted header %s and quoted assignment keys without altering comments', async (raw, key) => {
  const { patchScalar } = await import('./codex-config-io');
  const source = `[ hooks . "state" . ${raw} ] # retained\n"trusted_hash" = "old#[]" # retained\n[[unrelated."array]#"]] # retained\nvalue = 'placeholder'\n`;
  expect(parseCodexToml(source)).toMatchObject({
    hooks: { state: { [key]: { trusted_hash: 'old#[]' } } },
  });
  expect(
    patchScalar(source, ['hooks', 'state', key, 'trusted_hash'], '"new"'),
  ).toBe(source.replace('"old#[]"', '"new"'));
});
test('does not interpret arrays of tables as the managed threads table or rewrite multiline target values', async () => {
  const { patchScalar, readCodexThreadsValue } = await import(
    './codex-config-io'
  );
  const source =
    '[[agents]] # unrelated array\nmax_concurrent_threads_per_session = 9\n';
  expect(() => readCodexThreadsValue(source)).toThrow('array table parent');
  expect(() =>
    patchScalar(source, ['agents', 'max_concurrent_threads_per_session'], '6'),
  ).toThrow('array table parent');
  expect(() =>
    patchScalar(
      '[hooks.state.key]\ntrusted_hash = """\nplaceholder\n"""\n',
      ['hooks', 'state', 'key', 'trusted_hash'],
      '"new"',
    ),
  ).toThrow('Unsupported multiline');
});

test('refuses a symlink config backup without changing config or its target', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-config-backup-'));
  try {
    const configPath = join(dir, 'config.toml');
    const unrelated = join(dir, 'operator.txt');
    writeFileSync(configPath, '# original');
    writeFileSync(unrelated, 'operator');
    symlinkSync(unrelated, `${configPath}.bak`);
    expect(
      writeCodexConfigMerge({ configPath, manageThreads: true }).success,
    ).toBe(false);
    expect(readFileSync(configPath, 'utf8')).toBe('# original');
    expect(readFileSync(unrelated, 'utf8')).toBe('operator');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test.each([
  'symlink',
  'dangling',
  'regular',
] as const)('config staging preserves a pre-existing %s at the legacy temp path', (kind) => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-staging-'));
  const configPath = join(dir, 'config.toml');
  const unrelated = join(dir, 'unrelated');
  const staging = `${configPath}.tmp`;
  try {
    writeFileSync(configPath, '# original\n');
    if (kind === 'regular') writeFileSync(staging, 'operator staging');
    else {
      if (kind === 'symlink') writeFileSync(unrelated, 'operator content');
      symlinkSync(unrelated, staging, 'file');
    }
    const result = writeCodexConfigMerge({ configPath, manageThreads: true });
    expect(result.success).toBe(true);
    expect(readFileSync(configPath, 'utf8')).toContain(
      'max_concurrent_threads_per_session = 6',
    );
    expect(lstatSync(configPath).isSymbolicLink()).toBe(false);
    if (kind === 'regular')
      expect(readFileSync(staging, 'utf8')).toBe('operator staging');
    else {
      expect(lstatSync(staging).isSymbolicLink()).toBe(true);
      if (kind === 'symlink')
        expect(readFileSync(unrelated, 'utf8')).toBe('operator content');
      else expect(existsSync(unrelated)).toBe(false);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('semantic scalar insertion', () => {
  test.each([
    [
      'agents.max_threads = 4\n',
      ['agents', 'max_concurrent_threads_per_session'],
      '6',
      'agents.max_concurrent_threads_per_session = 6',
    ],
    [
      '"agents" . x = 4\n[profiles.work]\nmodel = "gpt-5"\n',
      ['agents', 'max_concurrent_threads_per_session'],
      '6',
      'agents.max_concurrent_threads_per_session = 6',
    ],
    [
      'features.other = true\n[profiles.work]\nmodel = "gpt-5"\n',
      ['features', 'default_mode_request_user_input'],
      'true',
      'features.default_mode_request_user_input = true',
    ],
    [
      'hooks.state.other.trusted_hash = "keep"\n[profiles.work]\nmodel = "gpt-5"\n',
      ['hooks', 'state', 'owned', 'trusted_hash'],
      '"hash"',
      'hooks.state.owned.trusted_hash = "hash"',
    ],
    [
      '[hooks]\nstate.owned.other = true\n[profiles.work]\nmodel = "gpt-5"\n',
      ['hooks', 'state', 'owned', 'trusted_hash'],
      '"hash"',
      'state.owned.trusted_hash = "hash"',
    ],
    [
      '[hooks.state]\nowned.other = true\n',
      ['hooks', 'state', 'owned', 'trusted_hash'],
      '"hash"',
      'owned.trusted_hash = "hash"',
    ],
  ])('inserts relative to the defining section: %s', (source, path, value, inserted) => {
    const after = patchScalar(source, path, value);
    expect(after).toContain(inserted);
    const header = after.indexOf('[profiles.work]');
    if (header >= 0) expect(after.indexOf(inserted)).toBeLessThan(header);
    expect(patchScalar(after, path, value)).toBe(after);
    expect(after).not.toContain(`[${path.slice(0, -1).join('.')}]`);
  });

  test('merges root-dotted namespaces together without redefining any table', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-dotted-'));
    try {
      const configPath = join(dir, 'config.toml');
      const source =
        'agents.max_threads = 4\nfeatures.other = true\nhooks.state.owned.other = true\n[profiles.work]\nmodel = "gpt-5"\n';
      writeFileSync(configPath, source);
      const options = {
        configPath,
        manageThreads: true,
        trustedHooks: { owned: 'hash' },
      };
      const result = writeCodexConfigMerge(options);
      expect(result.success).toBe(true);
      expect(result.priorThreadsValue).toBeNull();
      const after = readFileSync(configPath, 'utf8');
      expect(after).toContain(
        'agents.max_concurrent_threads_per_session = 6\n',
      );
      expect(after).toContain(
        'features.default_mode_request_user_input = true\n',
      );
      expect(after).toContain('hooks.state.owned.trusted_hash = "hash"\n');
      expect(after).not.toMatch(/\[(?:agents|features|hooks)/);
      expect(writeCodexConfigMerge(options).changed).toBe(false);
      expect(readFileSync(`${configPath}.bak`, 'utf8')).toBe(source);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('does not confuse dotted keys inside unrelated tables with root keys', () => {
    const source =
      '[profiles.work]\nagents.max_threads = 4\nfeatures.other = true\nhooks.state.other.trusted_hash = "keep"\n';
    expect(
      patchScalar(
        source,
        ['agents', 'max_concurrent_threads_per_session'],
        '6',
      ),
    ).toBe(`${source}\n[agents]\nmax_concurrent_threads_per_session = 6\n`);
  });

  test.each([
    ['agents = { max_threads = 4 }\n', { manageThreads: true }],
    ['features = { other = true }\n', {}],
    ['hooks = { state = {} }\n', { trustedHooks: { owned: 'hash' } }],
    ['[hooks]\nstate = {}\n', { trustedHooks: { owned: 'hash' } }],
  ])('fails closed without a backup for inline parent: %s', (source, options) => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-inline-'));
    try {
      const configPath = join(dir, 'config.toml');
      writeFileSync(configPath, source);
      const result = writeCodexConfigMerge({ configPath, ...options });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported inline or scalar parent');
      expect(readFileSync(configPath, 'utf8')).toBe(source);
      expect(existsSync(`${configPath}.bak`)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
