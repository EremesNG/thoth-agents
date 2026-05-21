import {
  spawn as nodeSpawn,
  spawnSync as nodeSpawnSync,
} from 'node:child_process';
import { Readable } from 'node:stream';

type SpawnOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdin?: 'pipe' | 'ignore';
  stdout?: 'pipe' | 'ignore';
  stderr?: 'pipe' | 'ignore';
};

export type ManagedSubprocess = {
  stdin: { write(chunk: Uint8Array | string): unknown; end(): unknown };
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  exited: Promise<number>;
  exitCode: number | null;
  kill(): void;
};

export type ManagedSpawnSyncResult = {
  exitCode: number | null;
};

function emptyReadableStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}

function toWebReadable(
  stream: NodeJS.ReadableStream | null,
): ReadableStream<Uint8Array> {
  if (!stream) {
    return emptyReadableStream();
  }

  return Readable.toWeb(
    stream as Readable,
  ) as unknown as ReadableStream<Uint8Array>;
}

function fallbackStdin(): ManagedSubprocess['stdin'] {
  return {
    write: () => undefined,
    end: () => undefined,
  };
}

export function spawn(
  command: string[],
  options: SpawnOptions = {},
): ManagedSubprocess {
  const child = nodeSpawn(command[0], command.slice(1), {
    cwd: options.cwd,
    env: options.env,
    stdio: [
      options.stdin ?? 'pipe',
      options.stdout ?? 'pipe',
      options.stderr ?? 'pipe',
    ],
  });

  const managed: ManagedSubprocess = {
    stdin: child.stdin ?? fallbackStdin(),
    stdout: toWebReadable(child.stdout),
    stderr: toWebReadable(child.stderr),
    exited: new Promise((resolve) => {
      child.on('exit', (code) => {
        managed.exitCode = code;
        resolve(code ?? 1);
      });
      child.on('error', () => {
        managed.exitCode = 1;
        resolve(1);
      });
    }),
    exitCode: child.exitCode,
    kill: () => {
      child.kill();
    },
  };

  return managed;
}

export function spawnSync(
  command: string[],
  options: SpawnOptions = {},
): ManagedSpawnSyncResult {
  const result = nodeSpawnSync(command[0], command.slice(1), {
    cwd: options.cwd,
    env: options.env,
    stdio: [
      options.stdin ?? 'ignore',
      options.stdout ?? 'pipe',
      options.stderr ?? 'pipe',
    ],
  });

  return { exitCode: result.status };
}
