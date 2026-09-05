import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { PI_ROOT_END, PI_ROOT_START } from '../harness/writers/pi-agent';

export type PiNativeObservationState =
  | 'observed-at-install'
  | 'unobserved'
  | 'unavailable';
export interface PiNativeProbeCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: unknown;
}
export type PiNativeProbeExecutor = (
  command: string,
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
) => PiNativeProbeCommandResult;
export interface PiNativeProbeOptions {
  extensionPath: string;
  packageRoot?: string;
  piHome?: string;
  manifestSha256: string;
  extensionSha256: string;
  commandExecutor?: PiNativeProbeExecutor;
  piCommand?: string;
  probePrompt?: string;
}
export interface PiNativeProbeResult {
  state: PiNativeObservationState;
  basis: string[];
  command: { command: string; args: string[] };
  discoveredSkills?: Array<{ name: string; location: string }>;
  materializedSpecialists?: string[];
  orchestratorChild?: boolean;
  sessionStartCount?: number;
}

function defaultExecutor(
  command: string,
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): PiNativeProbeCommandResult {
  let executable = command;
  let executableArgs = [...args];
  if (process.platform === 'win32' && command === 'pi') {
    const located = spawnSync('where.exe', ['pi.cmd'], { encoding: 'utf8' })
      .stdout?.split(/\r?\n/)
      .find(Boolean);
    const cli = located
      ? join(
          dirname(located),
          'node_modules',
          '@earendil-works',
          'pi-coding-agent',
          'dist',
          'bundle',
          'cli.js',
        )
      : undefined;
    if (cli && existsSync(cli)) {
      executable = process.execPath;
      executableArgs = [cli, ...args];
    }
  }
  const result = spawnSync(executable, executableArgs, {
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, ...env },
  });
  return {
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}
function occurrences(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

export function observePiNativeRoot(
  options: PiNativeProbeOptions,
): PiNativeProbeResult {
  const ownsIsolatedRoot = options.piHome === undefined;
  const isolatedRoot =
    options.piHome ?? mkdtempSync(join(tmpdir(), 'thoth-pi-observer-'));
  const observerPath = join(
    isolatedRoot,
    `observer-${process.pid}-${Date.now()}.mjs`,
  );
  try {
    writeFileSync(
      observerPath,
      `import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
const manifestSha256=${JSON.stringify(options.manifestSha256)};
const extensionSha256=${JSON.stringify(options.extensionSha256)};
const packageRoot=${JSON.stringify(options.packageRoot)};
function discoveredSkills(systemPrompt) {
  const block=systemPrompt.match(/<available_skills>([\\s\\S]*?)<\\/available_skills>/)?.[1] ?? '';
  const entries=[...block.matchAll(/<skill>[\\s\\S]*?<name>([^<]+)<\\/name>[\\s\\S]*?<location>([^<]+)<\\/location>[\\s\\S]*?<\\/skill>/g)]
    .map((match)=>({name:match[1],location:match[2]}));
  if (!packageRoot) return entries;
  const skillRoot=resolve(packageRoot,'skills');
  return entries.filter(({location}) => {
    const child=relative(skillRoot,resolve(location));
    return child !== '' && !child.startsWith('..') && !isAbsolute(child);
  });
}
function specialistEvidence() {
  const root=join(process.env.PI_CODING_AGENT_DIR ?? '', 'agents');
  if (!existsSync(root)) return {materializedSpecialists:[],orchestratorChild:false};
  const managed=readdirSync(root)
    .filter((name)=>name.endsWith('.md'))
    .filter((name)=>/^managed-by:\\s*thoth-agents\\s*$/m.test(readFileSync(join(root,name),'utf8')))
    .map((name)=>name.slice(0,-3))
    .sort();
  return {materializedSpecialists:managed.filter((name)=>name!=='orchestrator'),orchestratorChild:managed.includes('orchestrator')};
}
export default function observer(pi) {
  let hookCount=0;
  let sessionStartCount=0;
  let sessionEvidence={materializedSpecialists:[],orchestratorChild:false};
  let skills=[];
  pi.on('session_start', () => {
    sessionStartCount += 1;
    sessionEvidence=specialistEvidence();
  });
  pi.on('before_provider_request', (event) => {
    hookCount += 1;
    process.stdout.write(JSON.stringify({systemPrompt:JSON.stringify(event.payload),manifestSha256,extensionSha256,hookCount,sessionStartCount,discoveredSkills:skills,...sessionEvidence})+'\\n');
  });
  pi.registerProvider('thoth-observer', {
    name:'Thoth Observer', baseUrl:'local://thoth-observer', apiKey:'credential-free', api:'thoth-observer',
    models:[{id:'probe',name:'Probe',api:'thoth-observer',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:8192,maxTokens:16}],
    streamSimple(model, context, streamOptions) {
      const stream=createAssistantMessageEventStream();
      queueMicrotask(async () => {
        try {
          skills=discoveredSkills(context.systemPrompt);
          const raw={systemPrompt:context.systemPrompt,messages:context.messages};
          if (streamOptions?.onPayload) await streamOptions.onPayload(raw);
          const message={role:'assistant',content:[{type:'text',text:'probe'}],api:model.api,provider:model.provider,model:model.id,usage:{input:0,output:1,cacheRead:0,cacheWrite:0,totalTokens:1,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:Date.now()};
          stream.push({type:'done',message});
        } catch (error) { stream.push({type:'error',error}); }
      });
      return stream;
    }
  });
}
`,
    );
    const args = [
      '--mode',
      'json',
      '--no-session',
      '--no-approve',
      '--offline',
      '--no-extensions',
      '--extension',
      resolve(options.extensionPath),
      '--extension',
      observerPath,
      '--provider',
      'thoth-observer',
      '--model',
      'thoth-observer/probe',
      '--print',
      options.probePrompt ?? 'Return the single word probe.',
    ];
    const command = { command: options.piCommand ?? 'pi', args };
    const result = (options.commandExecutor ?? defaultExecutor)(
      command.command,
      args,
      { PI_CODING_AGENT_DIR: isolatedRoot },
    );
    if (result.exitCode === null || result.error)
      return {
        state: 'unavailable',
        basis: [
          result.stderr || String(result.error ?? 'Pi executable unavailable'),
        ],
        command,
      };
    if (result.exitCode !== 0)
      return {
        state: 'unobserved',
        basis: [`Pi probe exited ${result.exitCode}: ${result.stderr.trim()}`],
        command,
      };
    const records = `${result.stdout}\n${result.stderr}`
      .split(/\r?\n/)
      .flatMap((line) => {
        try {
          const value = JSON.parse(line) as Record<string, unknown>;
          return typeof value.systemPrompt === 'string' ? [value] : [];
        } catch {
          return [];
        }
      });
    const record = records.at(-1);
    const prompt =
      typeof record?.systemPrompt === 'string' ? record.systemPrompt : '';
    const discoveredSkills = Array.isArray(record?.discoveredSkills)
      ? record.discoveredSkills.flatMap((entry) => {
          if (
            !entry ||
            typeof entry !== 'object' ||
            typeof entry.name !== 'string' ||
            typeof entry.location !== 'string'
          )
            return [];
          return [{ name: entry.name, location: entry.location }];
        })
      : undefined;
    const materializedSpecialists = Array.isArray(
      record?.materializedSpecialists,
    )
      ? record.materializedSpecialists.filter(
          (name): name is string => typeof name === 'string',
        )
      : undefined;
    const orchestratorChild =
      typeof record?.orchestratorChild === 'boolean'
        ? record.orchestratorChild
        : undefined;
    const sessionStartCount =
      typeof record?.sessionStartCount === 'number'
        ? record.sessionStartCount
        : undefined;
    const valid =
      record?.manifestSha256 === options.manifestSha256 &&
      record?.extensionSha256 === options.extensionSha256 &&
      record?.hookCount === 1 &&
      occurrences(prompt, PI_ROOT_START) === 1 &&
      occurrences(prompt, PI_ROOT_END) === 1 &&
      prompt.indexOf(PI_ROOT_START) < prompt.indexOf(PI_ROOT_END);
    return valid
      ? {
          state: 'observed-at-install',
          basis: [
            'Real Pi final provider request contained exactly one receipt-bound root marker.',
          ],
          command,
          ...(discoveredSkills ? { discoveredSkills } : {}),
          ...(materializedSpecialists ? { materializedSpecialists } : {}),
          ...(orchestratorChild !== undefined ? { orchestratorChild } : {}),
          ...(sessionStartCount !== undefined ? { sessionStartCount } : {}),
        }
      : {
          state: 'unobserved',
          basis: [
            'Pi probe did not return one complete digest-bound native root marker.',
          ],
          command,
        };
  } finally {
    if (ownsIsolatedRoot)
      rmSync(isolatedRoot, { recursive: true, force: true });
    else rmSync(observerPath, { force: true });
  }
}
