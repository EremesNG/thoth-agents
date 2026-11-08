import type { Plugin } from '@opencode/plugin';

export type SessionProfileSelection = { name: string; projectDir: string };

/** Plugin-global storage; selections retain the owning project's identity. */
export class SessionProfileSelections {
  constructor(
    private readonly storage: Plugin.Context['storage'],
    private readonly projectDir: string,
  ) {}

  private parse(value: unknown): SessionProfileSelection | undefined {
    if (typeof value === 'string')
      return { name: value, projectDir: this.projectDir };
    if (
      value &&
      typeof value === 'object' &&
      'name' in value &&
      'projectDir' in value &&
      typeof value.name === 'string' &&
      typeof value.projectDir === 'string'
    )
      return { name: value.name, projectDir: value.projectDir };
    return undefined;
  }

  async set(
    sessionID: string,
    name: string | undefined,
    projectDir = this.projectDir,
  ): Promise<void> {
    const key = `model-profiles/session/${sessionID}`;
    if (name === undefined) await this.storage.remove(key);
    else await this.storage.set(key, { name, projectDir });
  }

  /** Collect before mutating storage so pagination remains stable. */
  async all(): Promise<Array<SessionProfileSelection & { sessionID: string }>> {
    const prefix = 'model-profiles/session/';
    const selections: Array<SessionProfileSelection & { sessionID: string }> =
      [];
    let after: string | undefined;
    do {
      const page = await this.storage.scan({ prefix, after });
      for (const entry of page.entries) {
        const value = this.parse(entry.value);
        if (entry.key.startsWith(prefix) && value)
          selections.push({
            ...value,
            sessionID: entry.key.slice(prefix.length),
          });
      }
      after = page.next;
    } while (after !== undefined);
    return selections;
  }

  async get(sessionID: string): Promise<SessionProfileSelection | undefined> {
    return this.parse(
      await this.storage.get(`model-profiles/session/${sessionID}`),
    );
  }
}
