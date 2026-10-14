import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AgentSession,
  createAgentSession,
  createEventBus,
  DefaultResourceLoader,
  ModelRuntime,
  ProjectTrustStore,
  type ProviderConfig,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { subscribe } from '../../pi-packages/pi-core/src/channels';
import {
  SUBAGENTS_STATE_CHANNEL,
  SUBAGENTS_USAGE_CHANNEL,
} from '../../pi-packages/pi-core/src/subagents';
import {
  type QuestionParameters,
  questionParameters,
} from '../../pi-packages/pi-questions-user/src/schema';
import { SubagentHistoryStore } from '../../pi-packages/pi-subagents/src/history';
import { REQUIRED_SKILLS } from '../../src/cli/skills';
import { type ChildToolCall, childToolCalls } from './child-tools';

const repo = fileURLToPath(new URL('../../', import.meta.url));
let environmentLeased = false;
export interface Caps {
  turns: number;
  caseUsd: number;
  runUsd: number;
  timeMs: number;
  cleanupMs: number;
}
export function evaluationCaps(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<Caps> = {},
): Caps {
  const value = (key: string, fallback: number) => {
    if (env[key] === undefined) return fallback;
    const parsed = Number(env[key]);
    if (!Number.isFinite(parsed) || parsed <= 0)
      throw new Error(`${key} must be positive`);
    return parsed;
  };
  return {
    turns: value('THOTH_EVAL_MAX_TURNS', overrides.turns ?? 30),
    caseUsd: value('THOTH_EVAL_CASE_USD', overrides.caseUsd ?? 1),
    runUsd: value('THOTH_EVAL_RUN_USD', overrides.runUsd ?? 5),
    timeMs: value('THOTH_EVAL_TIME_MS', overrides.timeMs ?? 600000),
    cleanupMs: overrides.cleanupMs ?? 10000,
  };
}
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  start: number;
  end?: number;
  result?: unknown;
  isError?: boolean;
}
export interface PathChange {
  path: string;
  at: number;
  kind: 'added' | 'changed' | 'deleted';
  /** Bounded UTF-8 snapshot at observation time; absent for deleted/binary/large files. */
  content?: string;
  /** Prior bounded snapshot, to distinguish unchanged instructions from writes. */
  previousContent?: string;
  contentUnavailable?: boolean;
}
export interface EvaluationResult {
  status: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
  reasons: string[];
  warnings: string[];
  loadedSkills: { name: string; filePath: string }[];
  tools: ToolCall[];
  subagents: ToolCall[];
  questions: { payload: QuestionParameters; answer: unknown; at: number }[];
  writtenPaths: string[];
  changes: PathChange[];
  turns: number;
  parentCost: number;
  childCost: number;
  elapsedMs: number;
  specialistModels: Record<string, string>;
  modelsUsed: string[];
  tasks: { at: number; task: Record<string, unknown> }[];
  childTools?: ChildToolCall[];
  workspace?: string;
  recordSha256?: string;
  expectedOracleReviewKind?: 'plan-review' | 'final-verification';
  finalText?: string;
}
export interface EvaluationContext {
  session: AgentSession;
  cwd: string;
  agentDir: string;
  events: ReturnType<typeof createEventBus>;
}
export interface EvaluationOptions {
  prompt: string;
  model: { provider: string; id: string };
  offline?: boolean;
  provider?: ProviderConfig;
  answers?: unknown[];
  authSource?: string;
  /** Read-only external required skill source, resolved before leasing HOME. */
  skillsSource?: string;
  fixture?: string;
  /** Trust only the eval-owned disposable workspace; false exercises trust denial. */
  projectTrusted?: boolean;
  reviewedRecordPath?: string;
  caps?: Partial<Caps>;
  budget?: { spent: number };
  /** Optional local fixture preparation; runs only inside the disposable workspace. */
  prepare?: (cwd: string) => void;
  inspect?: (context: EvaluationContext) => void | Promise<void>;
  grade?: (result: EvaluationResult) => string[];
}
function snapshot(cwd: string): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isSymbolicLink())
        files.set(
          path.relative(cwd, full).replaceAll('\\', '/'),
          `link:${fs.readlinkSync(full)}`,
        );
      else
        files.set(
          path.relative(cwd, full).replaceAll('\\', '/'),
          fs.readFileSync(full).toString('base64'),
        );
    }
  };
  walk(cwd);
  return files;
}
async function bounded(action: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      action,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error('Cleanup timed out; child termination unconfirmed'),
            ),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Owns the entire session lifecycle and environment lease. Do not invoke concurrently. */
export async function runEvaluation(
  options: EvaluationOptions,
): Promise<EvaluationResult> {
  if (environmentLeased)
    throw new Error(
      'Pi evaluations must run sequentially (process environment is leased)',
    );
  const started = Date.now();
  const caps = evaluationCaps(process.env, options.caps);
  for (const [key, value] of Object.entries(caps))
    if (!Number.isFinite(value) || value <= 0)
      throw new Error(`Invalid cap ${key}`);
  if (!Number.isInteger(caps.turns))
    throw new Error('Parent turn cap must be an integer');
  const budget = options.budget ?? { spent: 0 };
  const result: EvaluationResult = {
    status: 'PASS',
    reasons: [],
    warnings: [],
    loadedSkills: [],
    tools: [],
    subagents: [],
    questions: [],
    writtenPaths: [],
    changes: [],
    turns: 0,
    parentCost: 0,
    childCost: 0,
    elapsedMs: 0,
    specialistModels: {},
    modelsUsed: [`${options.model.provider}/${options.model.id}`],
    tasks: [],
    childTools: [],
  };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thoth-eval-'));
  const cwd = path.join(root, 'workspace');
  const agentDir = path.join(root, 'agent');
  result.workspace = cwd;
  // Resolve operator auth before changing HOME; never copy settings, agents, or extensions.
  const auth =
    options.authSource ??
    (options.offline
      ? undefined
      : path.join(
          process.env.PI_CODING_AGENT_DIR ??
            path.join(os.homedir(), '.pi', 'agent'),
          'auth.json',
        ));
  const skillsSource = path.resolve(
    options.skillsSource ??
      process.env.THOTH_EVAL_SKILLS_DIR ??
      path.join(os.homedir(), '.pi', 'agent', 'skills'),
  );
  const bindings: Record<string, string> = {
    HOME: root,
    USERPROFILE: root,
    PI_CODING_AGENT_DIR: agentDir,
    PI_SUBAGENTS_HISTORY_HOME: path.join(root, 'history'),
    PI_SUBAGENTS_HISTORY_DB_PATH: path.join(root, 'history.sqlite'),
    TMP: path.join(root, 'tmp'),
    TEMP: path.join(root, 'tmp'),
    TMPDIR: path.join(root, 'tmp'),
  };
  const previousCwd = process.cwd();
  const previous = Object.fromEntries(
    Object.keys(bindings).map((key) => [key, process.env[key]]),
  );
  let promptStarted = false;
  let session: AgentSession | undefined;
  let runtime: ModelRuntime | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let quietTimer: ReturnType<typeof setTimeout> | undefined;
  let parentPromptReturned = false;
  let activeChildren: number | undefined;
  let settle!: () => void;
  const settled = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const checkSettled = () => {
    clearTimeout(quietTimer);
    // Completion publishes state before queuing the terminal follow-up. A small
    // quiet window lets that delivery and agent_settled's deferred actions run.
    quietTimer = setTimeout(() => {
      if (
        parentPromptReturned &&
        activeChildren === 0 &&
        session?.isIdle &&
        session.pendingMessageCount === 0
      )
        settle();
    }, 25);
  };
  let cleanup: Promise<void> | undefined;
  let capSettled!: () => void;
  const capped = new Promise<void>((resolve) => {
    capSettled = resolve;
  });
  const off: (() => void)[] = [];
  let baseline = new Map<string, string>();
  let sequence = 0;
  const captureTasks = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const details = (value as { details?: Record<string, unknown> }).details;
    if (!details) return;
    // A write discovered alongside a completion is not evidence of a later write.
    capturePaths();
    const tasks = [
      details.task,
      ...(Array.isArray(details.tasks) ? details.tasks : []),
      ...(Array.isArray(details.results) ? details.results : []),
    ];
    for (const task of tasks) {
      if (!task || typeof task !== 'object') continue;
      result.tasks.push({ at: ++sequence, task });
      if (
        typeof task.model === 'string' &&
        !result.modelsUsed.includes(task.model)
      )
        result.modelsUsed.push(task.model);
      if (/auth|api.?key|credentials/i.test(String(task.error ?? ''))) {
        result.status = 'INCONCLUSIVE';
        result.reasons.push(
          `Child model setup error: ${task.model ?? 'unknown'}: ${task.error}`,
        );
      }
    }
  };
  const capturePaths = () => {
    const next = snapshot(cwd);
    for (const name of new Set([...baseline.keys(), ...next.keys()])) {
      if (baseline.get(name) !== next.get(name)) {
        const encoded = next.get(name);
        const bytes =
          encoded && !encoded.startsWith('link:')
            ? Buffer.from(encoded, 'base64')
            : undefined;
        const readable =
          bytes &&
          bytes.length <= 256 * 1024 &&
          !bytes.includes(0) &&
          Buffer.from(bytes.toString('utf8')).equals(bytes);
        const previousEncoded = baseline.get(name);
        const previousBytes = previousEncoded
          ? Buffer.from(previousEncoded, 'base64')
          : undefined;
        const previousReadable =
          previousBytes &&
          previousBytes.length <= 256 * 1024 &&
          !previousBytes.includes(0) &&
          Buffer.from(previousBytes.toString('utf8')).equals(previousBytes);
        result.changes.push({
          ...(previousReadable
            ? { previousContent: previousBytes.toString('utf8') }
            : {}),
          path: name,
          at: ++sequence,
          kind: !next.has(name)
            ? 'deleted'
            : !baseline.has(name)
              ? 'added'
              : 'changed',
          ...(readable ? { content: bytes.toString('utf8') } : {}),
          ...(encoded && !readable ? { contentUnavailable: true } : {}),
        });
      }
    }
    baseline = next;
  };
  const close = () =>
    (cleanup ??= (async () => {
      clearTimeout(timer);
      clearTimeout(quietTimer);
      if (session) {
        try {
          await bounded(
            (async () => {
              // Start abort, then shutdown: background children need the latter even if parent abort hangs.
              const aborting = session?.abort();
              await Promise.all([
                aborting,
                session?.extensionRunner?.emit({
                  type: 'session_shutdown',
                  reason: 'quit',
                }),
              ]);
            })(),
            caps.cleanupMs,
          );
        } catch (error) {
          result.status = 'INCONCLUSIVE';
          result.reasons.push(String(error));
        } finally {
          try {
            session.dispose();
          } catch (error) {
            result.status = 'INCONCLUSIVE';
            result.reasons.push(`Dispose error: ${String(error)}`);
          }
        }
      }
    })());
  let capHit = false;
  const breach = (reason: string) => {
    if (capHit) return;
    capHit = true;
    result.status = 'INCONCLUSIVE';
    result.reasons.push(reason);
    // Defer until the event callback returns, avoiding synchronous reentrancy.
    queueMicrotask(() => {
      void close().finally(capSettled);
    });
  };
  const checkCost = () => {
    const total = result.parentCost + result.childCost;
    if (total >= caps.caseUsd) breach('case cost cap');
    else if (budget.spent + total >= caps.runUsd) breach('run cost cap');
  };
  const duringSetup = <T>(work: Promise<T>): Promise<T> =>
    Promise.race([
      work,
      capped.then(() => {
        throw new Error('Setup interrupted by wall time cap');
      }),
    ]);
  // Cover asynchronous SDK setup as well as model execution. Merely starting
  // a timer here is insufficient: each setup wait must also race cancellation.
  timer = setTimeout(
    () => breach('wall time cap'),
    Math.max(1, caps.timeMs - (Date.now() - started)),
  );
  try {
    environmentLeased = true;
    for (const [key, value] of Object.entries(bindings))
      process.env[key] = value;
    fs.mkdirSync(agentDir, { recursive: true });
    fs.mkdirSync(bindings.TMP, { recursive: true });
    fs.writeFileSync(
      path.join(agentDir, 'settings.json'),
      JSON.stringify({
        packages: [{ source: repo, extensions: [] }],
        retry: { enabled: false },
      }),
    );
    // Follow the package's declared skill roots, without discovering its dist extension.
    const manifest = JSON.parse(
      fs.readFileSync(path.join(repo, 'package.json'), 'utf8'),
    ) as { pi: { skills: string[] } };
    const skillPaths = manifest.pi.skills.map((entry) =>
      path.resolve(repo, entry),
    );
    for (const skill of REQUIRED_SKILLS) {
      const source = path.join(skillsSource, skill.skillName);
      if (!fs.existsSync(path.join(source, 'SKILL.md'))) {
        result.warnings.push(
          `Missing external required skill: ${skill.name} (${path.join(source, 'SKILL.md')})`,
        );
        continue;
      }
      const target = path.join(agentDir, 'skills', skill.skillName);
      // Copy supporting assets too; all writes stay in the disposable agent dir.
      fs.cpSync(source, target, { recursive: true, dereference: true });
      skillPaths.push(target);
    }
    if (auth && fs.existsSync(auth)) {
      fs.copyFileSync(auth, path.join(agentDir, 'auth.json'));
      fs.chmodSync(path.join(agentDir, 'auth.json'), 0o600);
    } else if (!options.offline)
      throw new Error(`Pi auth source not found: ${auth}`);
    else fs.writeFileSync(path.join(agentDir, 'auth.json'), '{}');
    if (options.offline && !options.provider)
      throw new Error('Offline evaluation requires a synthetic provider');
    fs.cpSync(
      options.fixture ?? path.join(repo, 'evals/pi/fixtures/workspace'),
      cwd,
      { recursive: true },
    );
    execFileSync('git', ['init', '--quiet'], { cwd });
    execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd });
    options.prepare?.(cwd);
    if (options.reviewedRecordPath) {
      const record = fs.readFileSync(
        path.join(cwd, options.reviewedRecordPath),
        'utf8',
      );
      const boundary = record.indexOf('## Authorization');
      if (boundary >= 0)
        result.recordSha256 = createHash('sha256')
          .update(record.slice(0, boundary))
          .digest('hex');
    }
    baseline = snapshot(cwd);
    new ProjectTrustStore(agentDir).set(cwd, options.projectTrusted !== false);
    process.chdir(cwd);
    const events = createEventBus();
    const extensions = [
      path.join(repo, 'src/pi.ts'),
      path.join(repo, 'pi-packages/pi-subagents/index.ts'),
    ];
    const settingsManager = SettingsManager.inMemory(
      {
        extensions,
        retry: { enabled: false },
      },
      { projectTrusted: options.projectTrusted !== false },
    );
    runtime = await duringSetup(
      ModelRuntime.create({
        modelsPath: null,
        authPath: path.join(agentDir, 'auth.json'),
        allowModelNetwork: !options.offline,
      }),
    );
    if (options.provider)
      runtime.registerProvider(options.model.provider, options.provider);
    await duringSetup(runtime.refresh({ allowNetwork: !options.offline }));
    const model = runtime.getModel(options.model.provider, options.model.id);
    if (!model)
      throw new Error(
        `Unknown evaluation model ${options.model.provider}/${options.model.id}. Available provider/model ids: ${
          runtime
            .getAvailableSnapshot()
            .map((entry) => `${entry.provider}/${entry.id}`)
            .join(', ') || '(none with configured auth)'
        }. Known ids for this provider: ${
          runtime
            .getModels(options.model.provider)
            .map((entry) => `${entry.provider}/${entry.id}`)
            .join(', ') || '(none)'
        }.`,
      );
    if (Object.values(model.cost).every((price) => price === 0))
      result.warnings.push(
        'Model has zero pricing; cost cap cannot bound unpriced usage.',
      );
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      eventBus: events,
      noExtensions: true,
      additionalExtensionPaths: extensions,
      // In SDK 1.0.2 noSkills suppresses default/package discovery, not explicit paths.
      noSkills: true,
      additionalSkillPaths: skillPaths,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await duringSetup(loader.reload());
    result.loadedSkills = loader
      .getSkills()
      .skills.map(({ name, filePath }) => ({
        name,
        filePath,
      }));
    for (const diagnostic of loader.getSkills().diagnostics)
      result.warnings.push(
        `Skill setup ${diagnostic.type}: ${diagnostic.message} (${diagnostic.path})`,
      );
    const created = await duringSetup(
      createAgentSession({
        cwd,
        agentDir,
        settingsManager,
        modelRuntime: runtime,
        resourceLoader: loader,
        model,
        sessionManager: SessionManager.inMemory(cwd),
        customTools: [
          {
            name: 'ask_user_question',
            label: 'Scripted question',
            description: 'Ask the user structured questions.',
            parameters: questionParameters,
            async execute(_id, payload) {
              const index = result.questions.length;
              if (index >= (options.answers?.length ?? 0))
                throw new Error('Question script exhausted');
              const answer = options.answers?.[index];
              capturePaths();
              result.questions.push({
                payload: payload as QuestionParameters,
                answer,
                at: ++sequence,
              });
              return {
                content: [{ type: 'text', text: JSON.stringify(answer) }],
                details: answer,
              };
            },
          },
        ],
      }).then((created) => {
        // SDK construction has no abort signal. If it resolves after the cap,
        // dispose its session rather than adopting it in a restored workspace.
        if (capHit) {
          created.session.dispose();
          throw new Error('Session created after wall time cap');
        }
        return created;
      }),
    );
    session = created.session;
    if (created.extensionsResult.errors.length)
      throw new Error(JSON.stringify(created.extensionsResult.errors));
    off.push(
      session.subscribe((event) => {
        checkSettled();
        if (event.type === 'tool_execution_update')
          captureTasks(event.partialResult);
        if (event.type === 'message_end') captureTasks(event.message);
        if (event.type === 'turn_start') {
          result.turns++;
          if (result.turns > caps.turns) breach('parent turn cap');
        }
        if (
          event.type === 'message_end' &&
          event.message.role === 'assistant'
        ) {
          result.finalText = event.message.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join('\n');
          result.parentCost += event.message.usage.cost.total;
          checkCost();
          if (
            event.message.stopReason === 'error' &&
            !capHit &&
            result.status !== 'INCONCLUSIVE'
          ) {
            const error = event.message.errorMessage ?? 'Provider error';
            result.status = /auth|api.?key|credentials/i.test(error)
              ? 'INCONCLUSIVE'
              : 'FAIL';
            result.reasons.push(error);
          }
        }
        if (
          event.type === 'tool_execution_start' &&
          !('parentToolCallId' in event && event.parentToolCallId)
        ) {
          result.tools.push({
            id: event.toolCallId,
            name: event.toolName,
            args: event.args,
            start: ++sequence,
          });
        }
        if (event.type === 'tool_execution_end') {
          const call = result.tools.find(
            (entry) => entry.id === event.toolCallId,
          );
          if (call) {
            call.end = ++sequence;
            call.result = event.result;
            call.isError = event.isError;
            captureTasks(event.result);
            capturePaths();
          }
        }
      }),
    );
    off.push(
      subscribe(events, SUBAGENTS_USAGE_CHANNEL, {
        sessionId: session.sessionManager.getSessionId(),
        onSnapshot: (event) => {
          result.childCost = Math.max(result.childCost, event.data.totalCost);
          checkCost();
        },
      }),
    );
    off.push(
      subscribe(events, SUBAGENTS_STATE_CHANNEL, {
        sessionId: session.sessionManager.getSessionId(),
        onSnapshot: ({ data }) => {
          activeChildren =
            data.counts.queued + data.counts.running + data.counts.stopping;
          for (const task of data.tasks) {
            if (task.model && !result.modelsUsed.includes(task.model))
              result.modelsUsed.push(task.model);
          }
          checkSettled();
        },
      }),
    );
    await duringSetup(
      Promise.resolve(
        session.extensionRunner?.emit({
          type: 'session_start',
          reason: 'startup',
        }),
      ),
    );
    const override = process.env.THOTH_EVAL_SPECIALIST_MODEL?.trim();
    if (override)
      result.warnings.push(`Temporary specialist model override: ${override}`);
    for (const entry of fs.readdirSync(path.join(agentDir, 'agents'))) {
      const file = path.join(agentDir, 'agents', entry);
      let text = fs.readFileSync(file, 'utf8');
      if (override) {
        text = text.replace(
          /^model:.*$/m,
          `model: ${JSON.stringify(override)}`,
        );
        fs.writeFileSync(file, text);
      }
      result.specialistModels[entry.replace(/\.md$/, '')] =
        text.match(/^model:\s*(.+)$/m)?.[1] ?? 'inherit';
    }
    // The production non-UI question extension is intentionally not loaded. Reassert after startup hooks.
    session.setActiveToolsByName([
      ...new Set([...session.getActiveToolNames(), 'ask_user_question']),
    ]);
    checkCost();
    await Promise.race([
      Promise.resolve(options.inspect?.({ session, cwd, agentDir, events })),
      capped,
    ]);
    if (!capHit) {
      promptStarted = true;
      await Promise.race([session.prompt(options.prompt), capped]);
      parentPromptReturned = true;
      if (!capHit) {
        checkSettled();
        await Promise.race([settled, capped]);
      }
    }
  } catch (error) {
    if (result.status !== 'INCONCLUSIVE') {
      result.status = promptStarted ? 'FAIL' : 'INCONCLUSIVE';
      result.reasons.push(
        `${promptStarted ? 'Execution' : 'Setup'} error: ${String(error)}`,
      );
    }
  } finally {
    try {
      await close();
      // Child sessions remain available after shutdown and before disposable cleanup.
      const seen = new Set<string>();
      const history = new SubagentHistoryStore();
      try {
        for (const { task } of [...result.tasks].reverse()) {
          const id = String(task.id ?? task.task_id ?? '');
          // Completion notifications intentionally omit session paths. Recover only
          // the exact task's native history in this eval-owned disposable home.
          const file =
            task.nested_session_path ??
            (id ? history.getTask(cwd, id)?.nested_session_path : undefined);
          if (
            typeof file !== 'string' ||
            !id ||
            seen.has(id) ||
            !fs.existsSync(file)
          )
            continue;
          // Read only native data in the eval-owned temp tree, never operator sessions.
          const relative = path.relative(
            fs.realpathSync(root),
            fs.realpathSync(file),
          );
          if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
          try {
            const entries = fs
              .readFileSync(file, 'utf8')
              .split(/\r?\n/)
              .filter(Boolean)
              .map((line) => JSON.parse(line));
            result.childTools?.push(...childToolCalls(id, entries));
            seen.add(id);
          } catch (error) {
            result.warnings.push(
              `Child tool evidence unavailable for ${id}: ${String(error)}`,
            );
          }
        }
      } catch (error) {
        result.warnings.push(
          `Native child history unavailable: ${String(error)}`,
        );
      } finally {
        history.close();
      }
      if (fs.existsSync(cwd)) capturePaths();
      for (const release of off) release();
      clearTimeout(quietTimer);
    } finally {
      try {
        process.chdir(previousCwd);
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      } finally {
        environmentLeased = false;
      }
      fs.rmSync(root, { recursive: true, force: true });
      result.elapsedMs = Date.now() - started;
      budget.spent += result.parentCost + result.childCost;
    }
  }
  result.writtenPaths = [
    ...new Set(result.changes.map((change) => change.path)),
  ];
  result.subagents = result.tools.filter(
    (call) => call.name === 'subagent_run',
  );
  if (result.status === 'PASS') {
    const reasons = options.grade?.(result) ?? [];
    if (reasons.length) {
      result.status = 'FAIL';
      result.reasons.push(...reasons);
    }
  }
  return result;
}
