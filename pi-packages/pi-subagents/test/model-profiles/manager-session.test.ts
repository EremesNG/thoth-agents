import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { ModelProfileStore } from '../../src/model-profiles/store.js';
import { installSubagentTestEnv } from '../helpers/subagent-test-helpers.js';

const env = installSubagentTestEnv();
it('captures the session selection at each new run and continuation, without changing configs', async () => {
  env.writeAgent('analyst');
  const configPath = path.join(env.tmp, '.pi', 'subagents.json');
  fs.writeFileSync(configPath, JSON.stringify({ enable_continue: true }));
  const store = new ModelProfileStore({ cwd: env.tmp });
  store.save('project', 'fast', { agents: { analyst: { effort: 'low' } } });
  store.save('project', 'deep', { agents: { analyst: { effort: 'max' } } });
  store.setProjectPin('fast');
  const before = fs.readFileSync(store.paths.project, 'utf8');
  const nested = path.join(env.tmp, 'nested.jsonl');
  fs.writeFileSync(nested, '');
  const seen: string[] = [];
  const manager = env.createManager(async ({ effectiveProfile }: any) => {
    seen.push(effectiveProfile.profileName);
    return {
      result: 'done',
      effort: effectiveProfile.effort.value,
      nested_session_path: nested,
      fallback_used: false,
    };
  });
  manager.setSessionModelProfile('deep');
  const first = await manager.run(
    { agent: 'analyst', task: 'first', mode: 'task' },
    { cwd: env.tmp },
  );
  expect(first.results?.[0].effort).toBe('max');
  manager.setSessionModelProfile(undefined);
  const next = await manager.continueTask(
    { task_id: first.task_ids[0], prompt: 'continue', mode: 'task' },
    { cwd: env.tmp },
  );
  expect(next.results?.[0].effort).toBe('low');
  expect(seen).toEqual(['deep', 'fast']);
  expect(fs.readFileSync(store.paths.project, 'utf8')).toBe(before);
  expect(fs.readFileSync(configPath, 'utf8')).toBe('{"enable_continue":true}');
});
