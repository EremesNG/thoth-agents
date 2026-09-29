import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { SubagentHistoryStore } from '../../src/history.js';
import { SubagentManager } from '../../src/manager.js';
import type { SubagentRunner } from '../../src/types.js';

export function installSubagentTestEnv() {
  const managers = new Set<SubagentManager>();
  const stores = new Set<SubagentHistoryStore>();
  let tmp = '';
  let oldAgentDir: string | undefined;
  let oldHistoryDbPath: string | undefined;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-subagents-test-'));
    oldAgentDir = process.env.PI_CODING_AGENT_DIR;
    oldHistoryDbPath = process.env.PI_SUBAGENTS_HISTORY_DB_PATH;
    process.env.PI_CODING_AGENT_DIR = path.join(tmp, 'isolated-agent');
    process.env.PI_SUBAGENTS_HISTORY_DB_PATH = path.join(
      tmp,
      'global-agent',
      'subagents-history.sqlite',
    );
    fs.mkdirSync(path.join(tmp, '.pi', 'subagents'), { recursive: true });
  });

  afterEach(async () => {
    const errors: unknown[] = [];
    const managerResults = await Promise.allSettled(
      [...managers].map((manager) => manager.close()),
    );
    for (const result of managerResults)
      if (result.status === 'rejected') errors.push(result.reason);
    managers.clear();
    for (const store of stores) {
      try {
        store.close();
      } catch (error) {
        errors.push(error);
      }
    }
    stores.clear();
    if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
    if (oldHistoryDbPath === undefined)
      delete process.env.PI_SUBAGENTS_HISTORY_DB_PATH;
    else process.env.PI_SUBAGENTS_HISTORY_DB_PATH = oldHistoryDbPath;
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch (error) {
      errors.push(error);
    }
    if (errors.length)
      throw new AggregateError(
        errors,
        'Failed to close subagent test resources.',
      );
  });

  return {
    get tmp() {
      return tmp;
    },
    createManager(...args: ConstructorParameters<typeof SubagentManager>) {
      const manager = new SubagentManager(...args);
      managers.add(manager);
      return manager;
    },
    createHistoryStore() {
      const store = new SubagentHistoryStore();
      stores.add(store);
      return store;
    },
    writeAgent(name: string, body = '# Agent\nhello') {
      fs.writeFileSync(
        path.join(tmp, '.pi', 'subagents', `${name}.md`),
        `---\nname: ${name}\ndescription: ${name} agent\ntools:\n  - read\n  - memory_search\n---\n${body}`,
      );
    },
    mockRunner(delay = 0): SubagentRunner {
      return async ({ definition, task }) => {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        return {
          result: `${definition.name} handled ${task}`,
          model: 'mock/model',
          fallback_used: false,
        };
      };
    },
    statusSnapshot(text: string) {
      return {
        version: 1 as const,
        source: 'events' as const,
        items: [{ type: 'status' as const, text }],
      };
    },
    stripAnsi(text: string): string {
      return text
        .replace(/\u001b\[[0-9;]*m/g, '')
        .replace(/\u001b\][^\u001b]*(?:\u001b\\|\u0007)/g, '');
    },
  };
}
