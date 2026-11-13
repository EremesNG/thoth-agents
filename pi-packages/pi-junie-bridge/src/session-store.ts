import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';

export interface PersistedSession {
  sessionId: string;
  cwd: string;
  model: string;
  /** One digest per Pi transcript message, including our emitted assistant. */
  digests: string[];
  cost: number;
  resumedWith?: 'resume' | 'load';
}
export interface SessionStore {
  load(piSessionId: string): PersistedSession | null;
  save(piSessionId: string, state: PersistedSession): void;
  delete(piSessionId: string): void;
}
function valid(value: unknown): value is PersistedSession {
  if (!value || typeof value !== 'object') return false;
  const state = value as PersistedSession;
  return (
    ['sessionId', 'cwd', 'model'].every(
      (key) =>
        typeof state[key as keyof PersistedSession] === 'string' &&
        state[key as keyof PersistedSession] !== '',
    ) &&
    Array.isArray(state.digests) &&
    state.digests.every(
      (digest) => typeof digest === 'string' && /^[a-f0-9]{64}$/.test(digest),
    ) &&
    Number.isFinite(state.cost) &&
    state.cost >= 0 &&
    (state.resumedWith === undefined ||
      state.resumedWith === 'resume' ||
      state.resumedWith === 'load')
  );
}
/** Tolerate retired fields (e.g. local usage snapshots) on load. */
function normalize(state: PersistedSession): PersistedSession {
  return {
    sessionId: state.sessionId,
    cwd: state.cwd,
    model: state.model,
    digests: state.digests,
    cost: state.cost,
    ...(state.resumedWith ? { resumedWith: state.resumedWith } : {}),
  };
}
export function createSessionStore(
  directory = join(getAgentDir(), 'junie-bridge', 'sessions'),
): SessionStore {
  const path = (id: string) =>
    join(
      directory,
      `s-${createHash('sha256').update(id, 'utf16le').digest('hex')}.json`,
    );
  return {
    load(id) {
      try {
        const { version, ...state } = JSON.parse(
          readFileSync(path(id), 'utf8'),
        );
        return version === 1 && valid(state) ? normalize(state) : null;
      } catch {
        return null;
      }
    },
    save(id, state) {
      if (!valid(state)) throw new Error('Invalid Junie session state');
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      chmodSync(directory, 0o700);
      const temporary = join(directory, `.${randomUUID()}.tmp`);
      try {
        writeFileSync(temporary, JSON.stringify({ version: 1, ...state }), {
          flag: 'wx',
          mode: 0o600,
        });
        chmodSync(temporary, 0o600);
        renameSync(temporary, path(id));
      } finally {
        rmSync(temporary, { force: true });
      }
    },
    delete(id) {
      rmSync(path(id), { force: true });
    },
  };
}
