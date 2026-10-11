import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { runEvaluation } from './harness';
import { syntheticProvider } from './synthetic-provider';

function sourceSnapshot(source: string) {
  return fs.readdirSync(source, { recursive: true }).map((entry) => {
    const file = path.join(source, String(entry));
    return [
      entry,
      fs.statSync(file).isFile() ? fs.readFileSync(file, 'utf8') : null,
    ];
  });
}

it('discovers manifest and required skills in the parent and lets real lean children read catalog paths without changing the source', async () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-skills-'));
  const names = [
    'tdd',
    'simplify',
    'progressive-context-router',
    'architectural-grilling',
  ];
  for (const name of names) {
    fs.mkdirSync(path.join(source, name));
    fs.writeFileSync(
      path.join(source, name, 'SKILL.md'),
      `---\nname: ${name}\ndescription: Offline ${name} skill\n---\nSKILL_SOURCE_SENTINEL\n`,
    );
  }
  fs.writeFileSync(path.join(source, 'operator-sentinel'), 'untouched');
  const before = sourceSnapshot(source);
  const readArgs = { path: '' };
  let parentVisible = false;
  let childRead = false;
  const taskArgs = { agent: 'thoth-worker', mode: 'task', task: '' };
  const parent = syntheticProvider([
    { calls: [{ name: 'subagent_run', args: taskArgs }] },
    { text: 'Done.' },
  ]);
  const child = syntheticProvider([
    { calls: [{ name: 'read', args: readArgs }] },
    { text: 'Read skill.' },
  ]);
  try {
    const result = await runEvaluation({
      prompt: 'Delegate reading a skill.',
      skillsSource: source,
      offline: true,
      model: { provider: 'eval-fixture', id: 'fixture' },
      provider: {
        ...parent,
        streamSimple(model, context, options) {
          const text = JSON.stringify(context);
          const isChild = text.includes('You are worker.');
          if (isChild) {
            childRead ||= text.includes('SKILL_SOURCE_SENTINEL');
            return child.streamSimple(model, context, options);
          }
          parentVisible ||=
            text.includes('<name>thoth-sdd</name>') &&
            text.includes('<name>tdd</name>');
          return parent.streamSimple(model, context, options);
        },
      },
      inspect: ({ agentDir, session }) => {
        for (const skill of session.resourceLoader.getSkills().skills)
          expect(fs.readFileSync(skill.filePath, 'utf8')).toContain('name:');
        readArgs.path = path.join(agentDir, 'skills/tdd/SKILL.md');
        taskArgs.task = `MEMORY: none. Read ${readArgs.path}.`;
        expect(fs.readFileSync(readArgs.path, 'utf8')).toContain(
          'SKILL_SOURCE_SENTINEL',
        );
        // Providers retain these step objects; wire the actual isolated catalog path.
        const worker = path.join(agentDir, 'agents/thoth-worker.md');
        fs.writeFileSync(
          worker,
          fs
            .readFileSync(worker, 'utf8')
            .replace(/^model:.*$/m, 'model: "inherit"'),
        );
      },
    });
    expect(result.status, result.reasons.join('\n')).toBe('PASS');
    expect(result.loadedSkills.map((skill) => skill.name)).toEqual(
      expect.arrayContaining([
        ...names,
        'thoth-sdd',
        'plan-reviewer',
        'thoth-init',
        'thoth-constitution',
        'thoth-archive',
      ]),
    );
    expect(parentVisible).toBe(true);
    expect(childRead).toBe(true);
    expect(
      result.warnings.some((warning) =>
        warning.includes('Missing external required skill'),
      ),
    ).toBe(false);
    expect(sourceSnapshot(source)).toEqual(before);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
}, 30_000);

it('warns by name for every missing external required skill', async () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-missing-skills-'));
  try {
    const result = await runEvaluation({
      prompt: 'Offline only.',
      skillsSource: source,
      offline: true,
      model: { provider: 'eval-fixture', id: 'fixture' },
      provider: syntheticProvider([{ text: 'Done.' }]),
    });
    for (const name of [
      'tdd',
      'simplify',
      'progressive-context-router',
      'architectural-grilling',
    ])
      expect(result.warnings).toContain(
        `Missing external required skill: ${name} (${path.join(source, name, 'SKILL.md')})`,
      );
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
}, 30_000);
