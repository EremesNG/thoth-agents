import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Plugin } from '@opencode/plugin';

type SessionID = Parameters<
  Plugin.Context['session']['instructions']['entry']['put']
>[0]['sessionID'];
export type StateEvent =
  | {
      type: 'session.created';
      data: { sessionID: SessionID; parentID?: SessionID };
    }
  | {
      type: 'session.status';
      data: {
        sessionID: SessionID;
        status: { type: 'idle' | 'busy' | 'retry' };
      };
    }
  | { type: 'session.deleted'; data: { sessionID: SessionID } };

function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

/** Read-only record inventory plus live children. All updates are serialized. */
export class SessionState {
  private readonly parents = new Map<SessionID, SessionID>();
  private readonly running = new Set<SessionID>();
  private readonly published = new Map<SessionID, string>();
  private readonly records = new Map<
    string,
    { fingerprint: string; label: string }
  >();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly directory: string,
    private readonly instructions: Plugin.Context['session']['instructions'],
  ) {}

  private serialize<T>(run: () => Promise<T>): Promise<T> {
    const result = this.queue.then(run);
    this.queue = result.catch(() => {});
    return result;
  }

  refresh(sessionID: SessionID): Promise<string> {
    return this.serialize(() => this.publish(sessionID));
  }

  event(event: StateEvent): Promise<void> {
    return this.serialize(async () => {
      const { sessionID } = event.data;
      if (event.type === 'session.created') {
        if (event.data.parentID) {
          this.parents.set(sessionID, event.data.parentID);
          this.running.add(sessionID);
          await this.publish(event.data.parentID);
        }
        await this.publish(sessionID);
        return;
      }
      const parent = this.parents.get(sessionID);
      if (event.type === 'session.status') {
        if (event.data.status.type === 'idle') this.running.delete(sessionID);
        else if (parent) this.running.add(sessionID);
        if (parent) await this.publish(parent);
        if (this.published.has(sessionID)) await this.publish(sessionID);
        return;
      }
      this.parents.delete(sessionID);
      this.running.delete(sessionID);
      this.published.delete(sessionID);
      // A deleted parent must not retain orphan bookkeeping.
      for (const [child, owner] of this.parents) {
        if (owner !== sessionID) continue;
        this.parents.delete(child);
        this.running.delete(child);
      }
      if (parent) await this.publish(parent);
    });
  }

  private async inventory(): Promise<string[]> {
    const root = join(this.directory, '.thoth', 'changes');
    const entries = await readdir(root, { withFileTypes: true }).catch(
      (error: unknown) => {
        if (missing(error)) return [];
        throw error;
      },
    );
    const active = new Set<string>();
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'archive') continue;
      const id = entry.name;
      const path = join(root, id, `${id}.md`);
      try {
        const info = await stat(path);
        if (!info.isFile()) continue;
        active.add(id);
        const fingerprint = `${info.mtimeMs}:${info.ctimeMs}:${info.size}`;
        if (this.records.get(id)?.fingerprint === fingerprint) continue;
        const content = await readFile(path, 'utf8');
        const title = /^#\s+(.+)$/m.exec(content)?.[1]?.trim() ?? id;
        const status =
          content.match(/^\*\*(?:Status|Phase)\*\*:\s*.+$/gm) ?? [];
        this.records.set(id, {
          fingerprint,
          label: `${title}${status.length ? ` (${status.join('; ')})` : ''}`,
        });
      } catch (error) {
        if (!missing(error)) throw error;
        active.delete(id);
      }
    }
    for (const id of this.records.keys())
      if (!active.has(id)) this.records.delete(id);
    return [...this.records]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(
        ([id, record]) => `- .thoth/changes/${id}/${id}.md — ${record.label}`,
      );
  }

  private async publish(sessionID: SessionID): Promise<string> {
    const records = await this.inventory();
    const children = [...this.parents]
      .filter(
        ([child, parent]) => parent === sessionID && this.running.has(child),
      )
      .map(([child]) => child)
      .sort();
    const value = [
      'Thoth state',
      'Active SDD records:',
      ...(records.length ? records : ['- none']),
      'Running delegated sessions:',
      ...(children.length ? children.map((id) => `- ${id}`) : ['- none']),
    ].join('\n');
    if (this.published.get(sessionID) !== value) {
      await this.instructions.entry.put({
        sessionID,
        key: 'thoth.state' as Parameters<
          typeof this.instructions.entry.put
        >[0]['key'],
        value,
      });
      this.published.set(sessionID, value);
    }
    return value;
  }
}
