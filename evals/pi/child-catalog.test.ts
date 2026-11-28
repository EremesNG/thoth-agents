import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { successfulSkillRead } from './child-tools';
import { runEvaluation } from './harness';
import { gradeEvaluation, liveCases } from './live-cases';
import { syntheticProvider } from './synthetic-provider';

it('real SDK children see only trusted project skills and read the forwarded path', async () => {
  const skill = '.pi/skills/fixture-ui-guidelines/SKILL.md';
  for (const trusted of [true, false]) {
    console.log(`Child catalog self-test: projectTrusted=${trusted}`);
    const assignment = {
      agent: 'thoth-designer',
      mode: 'background',
      task: 'SKILLS: none\nMEMORY: none. Inspect the welcome card.',
    };
    const readArgs = { path: '' };
    const parent = syntheticProvider([
      {
        calls: [
          {
            name: 'subagent_run',
            args: assignment,
          },
        ],
      },
      { text: 'Done.' },
    ]);
    const child = syntheticProvider([
      ...(trusted ? [{ calls: [{ name: 'read', args: readArgs }] }] : []),
      { text: 'conclusion: Improved the card.' },
    ]);
    let repositoryCatalog = false;
    let projectCatalog = false;
    let readContent = false;
    const result = await runEvaluation({
      prompt: 'Delegate the welcome card design. MEMORY: none.',
      offline: true,
      model: { provider: 'eval-fixture', id: 'fixture' },
      projectTrusted: trusted,
      fixture: fileURLToPath(new URL('./fixtures/designer/', import.meta.url)),
      caps: { timeMs: 60000, cleanupMs: 10000 },
      provider: {
        ...parent,
        streamSimple(model, context, options) {
          const text = JSON.stringify(context);
          if (
            context.messages.some(
              (message) =>
                message.role === 'system' &&
                JSON.stringify(message).includes('You are designer.'),
            )
          ) {
            repositoryCatalog ||=
              text.includes('<name>thoth-sdd</name>') &&
              text.includes('<name>plan-reviewer</name>');
            projectCatalog ||= text.includes(
              '<name>fixture-ui-guidelines</name>',
            );
            readContent ||= text.includes('PROJECT_SKILL_SENTINEL');
            console.log(
              `Child provider: repo=${repositoryCatalog}, project=${projectCatalog}, read=${readContent}`,
            );
            return child.streamSimple(model, context, options);
          }
          return parent.streamSimple(model, context, options);
        },
      },
      inspect: ({ agentDir, cwd }) => {
        if (trusted) {
          readArgs.path = path.join(cwd, skill);
          assignment.task = `SKILLS: fixture-ui-guidelines — "${readArgs.path}"\nMEMORY: none. Inspect the welcome card.`;
        }
        const settings = JSON.parse(
          fs.readFileSync(path.join(agentDir, 'settings.json'), 'utf8'),
        );
        expect(path.isAbsolute(settings.packages[0].source)).toBe(true);
        expect(settings.packages[0].extensions).toEqual([]);
        const designer = path.join(agentDir, 'agents/thoth-designer.md');
        fs.writeFileSync(
          designer,
          fs
            .readFileSync(designer, 'utf8')
            .replace(/^model:.*$/m, 'model: "inherit"'),
        );
      },
    });
    expect(result.status, result.reasons.join('; ')).toBe('PASS');
    expect(repositoryCatalog).toBe(true);
    expect(projectCatalog).toBe(trusted);
    expect(readContent).toBe(trusted);
    const task = result.tasks.find(
      ({ task }) =>
        task.agent === 'thoth-designer' && task.status === 'completed',
    )?.task;
    expect(task).toBeDefined();
    expect(task?.result).toBe('conclusion: Improved the card.');
    if (trusted) {
      const item = liveCases.find(
        (item) => item.id === 'designer-project-skill',
      );
      if (!item) throw new Error('Missing designer live case');
      gradeEvaluation(item, result);
      expect(result.status, result.reasons.join('; ')).toBe('PASS');
    }
    expect(
      successfulSkillRead(
        result.childTools ?? [],
        String(task?.id),
        skill,
        result.workspace,
      ),
    ).toBe(trusted);
    expect(result.subagents[0].args.task).toBe(assignment.task);
  }
}, 180000);
