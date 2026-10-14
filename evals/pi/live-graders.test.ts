import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import type { EvaluationContext, EvaluationResult } from './harness';
import {
  evaluateCase,
  gradeCase,
  liveCases,
  recordPath,
  reviewLabel,
  skipLabel,
} from './live-cases';
import type { ScriptStep } from './synthetic-provider';
import { syntheticProvider } from './synthetic-provider';
import { envelope } from './test-envelope';

it('small change requires the actual typo correction, not just any write', async () => {
  const item = findCase('small-no-record');
  for (const [content, expected] of [
    ['Welcome to the fixture.\n', 'PASS'],
    ['Welcome to the fixture.\r\n', 'PASS'],
    ['Welcome to the fixture.', 'PASS'],
    ['Welcome to the fixture.\nExtra', 'FAIL'],
    ['Welcom to the fixture.\nStill wrong.', 'FAIL'],
  ]) {
    const result = await evaluateCase(item, {
      offline: true,
      caps: { timeMs: 20000, cleanupMs: 2000 },
      model: { provider: 'eval-fixture', id: 'fixture' },
      provider: syntheticProvider([
        { calls: [{ name: 'write', args: { path: 'README.md', content } }] },
      ]),
    });
    expect(result.status, result.reasons.join('\n')).toBe(expected);
  }
}, 180_000);

it('grades bash typo edits from snapshots and captures final assistant text without changing operator git config', async () => {
  const result = await evaluateCase(findCase('small-no-record'), {
    offline: true,
    caps: { timeMs: 20000, cleanupMs: 2000 },
    model: { provider: 'eval-fixture', id: 'fixture' },
    provider: syntheticProvider([
      {
        calls: [
          {
            name: 'bash',
            args: {
              command: `node -e "require('fs').writeFileSync('README.md', 'Welcome to the fixture.')"`,
            },
          },
        ],
      },
      { text: 'Corrected and verified the typo.' },
    ]),
    inspect: ({ cwd }) => {
      expect(
        execFileSync('git', ['config', '--local', '--get', 'core.autocrlf'], {
          cwd,
          encoding: 'utf8',
        }).trim(),
      ).toBe('false');
    },
  });
  expect(result.status, result.reasons.join('\n')).toBe('PASS');
  expect(result.finalText).toBe('Corrected and verified the typo.');
  expect(result.writtenPaths).toContain('README.md');
  const item = findCase('small-no-record');
  expect(
    gradeCase(item, {
      ...result,
      writtenPaths: [...result.writtenPaths, recordPath],
    }),
  ).toContain('Small change wrote a change record');
  expect(
    gradeCase(item, {
      ...result,
      tools: [
        ...result.tools,
        { id: 'review', start: 99, ...question([reviewLabel, skipLabel]) },
      ],
    }),
  ).toContain('Small change asked for plan review');
}, 60_000);

function findCase(id: string) {
  const item = liveCases.find((item) => item.id === id);
  if (!item) throw new Error(`Missing live case ${id}`);
  return item;
}

function question(labels: string[]) {
  return {
    name: 'ask_user_question',
    args: {
      questions: [
        {
          id: 'decision',
          header: 'Decision',
          prompt: 'Choose.',
          options: labels.map((label) => ({ label, value: label })),
        },
      ],
    },
  };
}
const oracle = {
  name: 'subagent_run',
  args: {
    agent: 'thoth-oracle',
    task: 'MEMORY: none. Review independently.',
    mode: 'task',
  },
};
const passRecord =
  '**Reviewer**: oracle\n**Independent from implementer**: Yes\n**Verdict**: PASS\n';

function providerWithChild(
  steps: ScriptStep[],
  text = envelope('plan-review', 'OKAY'),
) {
  const parent = syntheticProvider(steps);
  const child = syntheticProvider([{ text }]);
  return {
    ...parent,
    streamSimple: (
      model: Parameters<typeof parent.streamSimple>[0],
      context: Parameters<typeof parent.streamSimple>[1],
      options: Parameters<typeof parent.streamSimple>[2],
    ) =>
      (context.messages.some(
        (message) =>
          message.role === 'system' &&
          /You are (oracle|explorer)\./.test(JSON.stringify(message)),
      )
        ? child
        : parent
      ).streamSimple(model, context, options),
  };
}
function inheritModels({ agentDir }: EvaluationContext) {
  for (const agent of ['thoth-oracle', 'thoth-explorer']) {
    const file = `${agentDir}/agents/${agent}.md`;
    fs.writeFileSync(
      file,
      fs.readFileSync(file, 'utf8').replace(/^model:.*$/m, 'model: "inherit"'),
    );
  }
}
function fixtureDigest() {
  const record = fs.readFileSync(
    new URL(
      './fixtures/closeout/.thoth/changes/greeting/greeting.md',
      import.meta.url,
    ),
    'utf8',
  );
  return createHash('sha256')
    .update(record.replaceAll('\r\n', '\n').split('## Authorization')[0])
    .digest('hex');
}
async function trace(id: string, steps: ScriptStep[], text?: string) {
  return evaluateCase(findCase(id), {
    offline: true,
    caps: { timeMs: 20000, cleanupMs: 2000 },
    model: { provider: 'eval-fixture', id: 'fixture' },
    provider: providerWithChild(
      steps,
      text ??
        (id === 'verification-fresh-oracle'
          ? envelope('final-verification', 'PASS', fixtureDigest())
          : envelope('plan-review', 'OKAY')),
    ),
    inspect: (context) => {
      inheritModels(context);
      if (id === 'verification-fresh-oracle') {
        expect(
          execFileSync('git', ['diff', '--name-only'], {
            cwd: context.cwd,
            encoding: 'utf8',
          })
            .trim()
            .split(/\r?\n/),
        ).toEqual(['README.md', 'src/greeting.js', 'test/greeting.test.js']);
      }
    },
  });
}

it('plan review offers canonical choices then completed [OKAY] then Stop, never implementation', async () => {
  for (const [write, expected] of [
    [false, 'PASS'],
    [true, 'FAIL'],
  ] as const) {
    const steps: ScriptStep[] = [
      { calls: [question([reviewLabel, skipLabel])] },
      { calls: [oracle] },
      { calls: [question(['Implement', 'Stop'])] },
    ];
    if (write)
      steps.push({
        calls: [
          {
            name: 'write',
            args: {
              path: 'src/greeting.js',
              content: 'Unauthorized implementation',
            },
          },
        ],
      });
    const result = await trace('plan-review-choice', steps);
    expect(result.status, result.reasons.join('\n')).toBe(expected);
    if (!write) {
      const item = findCase('plan-review-choice');
      expect(
        gradeCase(item, { ...result, questions: result.questions.slice(1) }),
      ).toContain('Missing canonical plan-review options');
      expect(
        gradeCase(item, { ...result, questions: result.questions.slice(0, 1) }),
      ).toContain(
        'Missing separate Implement/Stop question answered Stop after [OKAY]',
      );
      expect(
        gradeCase(item, {
          ...result,
          changes: [
            {
              path: 'src/greeting.js',
              at: 0,
              kind: 'changed',
              content: 'early',
            },
          ],
        }),
      ).toContain('Implementation preceded the plan-review choice');
    }
  }
}, 180_000);

it('closeout requires completed Oracle before PASS; an early verdict fails even with later review', async () => {
  const write = {
    calls: [{ name: 'write', args: { path: recordPath, content: passRecord } }],
  };
  const trials: [ScriptStep[], string][] = [
    [[{ calls: [oracle] }, write], 'PASS'],
    [[write, { calls: [oracle] }], 'FAIL'],
    [[write], 'FAIL'],
  ];
  for (const [steps, expected] of trials) {
    const result = await trace('verification-fresh-oracle', [...steps]);
    expect(result.status, result.reasons.join('\n')).toBe(expected);
    expect(
      result.changes.find((change) => change.path === recordPath)?.content,
    ).toBe(passRecord);
  }
}, 180_000);

it('each discovery dispatch must state MEMORY, not just one of multiple tasks', async () => {
  for (const [task, expected] of [
    ['MEMORY: recall. Discover the greeting.', 'PASS'],
    ['Discover the greeting.', 'FAIL'],
  ]) {
    const result = await trace('memory-recall-bounded-reads', [
      {
        calls: [
          {
            name: 'subagent_run',
            args: {
              agent: 'thoth-explorer',
              task: 'MEMORY: none. First discovery.',
              mode: 'task',
            },
          },
        ],
      },
      {
        calls: [
          {
            name: 'subagent_run',
            args: { agent: 'thoth-explorer', task, mode: 'task' },
          },
        ],
      },
    ]);
    expect(result.status, result.reasons.join('\n')).toBe(expected);
  }
}, 180_000);

it('rejected review is inconclusive unless implementation violates plan-only', async () => {
  const steps = [
    { calls: [question([reviewLabel, skipLabel])] },
    { calls: [oracle] },
  ];
  const result = await trace('plan-review-choice', steps, '[REJECT]');
  expect(result.status, result.reasons.join('\n')).toBe('INCONCLUSIVE');
}, 60_000);

it('inactivity cannot pass any case, and incomplete/self-approved verdicts fail', () => {
  const empty: EvaluationResult = {
    status: 'PASS',
    reasons: [],
    warnings: [],
    loadedSkills: [],
    tools: [],
    subagents: [],
    questions: [],
    writtenPaths: [],
    changes: [],
    turns: 1,
    parentCost: 0,
    childCost: 0,
    elapsedMs: 0,
    specialistModels: {},
    modelsUsed: [],
    tasks: [],
  };
  for (const item of liveCases)
    expect(gradeCase(item, empty).length).toBeGreaterThan(0);
  const closeout = findCase('verification-fresh-oracle');
  const selfApproval = {
    ...empty,
    subagents: [
      {
        id: 'oracle',
        name: 'subagent_run',
        args: { agent: 'thoth-oracle' },
        start: 1,
      },
    ],
    tasks: [
      {
        at: 2,
        task: {
          agent: 'thoth-oracle',
          status: 'completed',
          result: envelope(),
        },
      },
    ],
    changes: [
      {
        path: recordPath,
        at: 3,
        kind: 'changed' as const,
        content: passRecord.replace('oracle', 'root'),
      },
    ],
  };
  // Format diagnostics are reported separately; provenance is the graded contract.
  expect(gradeCase(closeout, selfApproval)).toEqual([]);
  for (const content of [
    passRecord.replace('oracle', 'thoth-oracle (fresh task)'),
    passRecord.replace('oracle', 'oracle (fresh task)'),
    passRecord.replace('Yes', 'YES (fresh independent review)'),
  ]) {
    const reasons = gradeCase(closeout, {
      ...selfApproval,
      changes: [{ ...selfApproval.changes[0], content }],
    });
    expect(reasons).toEqual([]);
    expect(reasons.join('; ')).not.toContain('self-approval');
  }
  expect(gradeCase(closeout, { ...selfApproval, tasks: [] })).toContain(
    'Root PASS write without prior valid final-verification PASS envelope',
  );
});

it('cannot attribute a rejected or unparseable Oracle judgment as PASS', async () => {
  for (const [verdict, expected] of [
    ['[REJECT]', 'FAIL'],
    ['[BLOCKED]', 'FAIL'],
    ['Review completed without a verdict.', 'FAIL'],
    ['**conclusion:** PASS — AC-1 through AC-5 satisfied', 'FAIL'],
    ['```markdown\n[PASS]\n```', 'FAIL'],
    ['Verdict: PASS — withdrawn; approval denied.', 'FAIL'],
    ['Verdict: PASS\nVerdict: PASS — not justified.', 'FAIL'],
  ]) {
    const result = await trace(
      'verification-fresh-oracle',
      [
        { calls: [oracle] },
        {
          calls: [
            { name: 'write', args: { path: recordPath, content: passRecord } },
          ],
        },
      ],
      verdict,
    );
    expect(result.status, result.reasons.join('\n')).toBe(expected);
  }
}, 180_000);

it('rejects all legacy prose verdicts, even affirmative lines', () => {
  const result: EvaluationResult = {
    status: 'PASS',
    reasons: [],
    warnings: [],
    loadedSkills: [],
    tools: [],
    subagents: [
      {
        id: 'oracle',
        name: 'subagent_run',
        args: { agent: 'thoth-oracle' },
        start: 1,
      },
    ],
    questions: [],
    writtenPaths: [recordPath],
    changes: [
      { path: recordPath, at: 3, kind: 'changed', content: passRecord },
    ],
    turns: 1,
    parentCost: 0,
    childCost: 0,
    elapsedMs: 0,
    specialistModels: {},
    modelsUsed: [],
    tasks: [],
  };
  const item = findCase('verification-fresh-oracle');
  for (const text of [
    'Verdict: PASS',
    '**Conclusion**: PASS',
    '**conclusion:** PASS',
    '## Verdict: PASS',
    '[PASS]',
    '**Verdict:** [PASS]',
  ]) {
    expect(
      gradeCase(item, {
        ...result,
        tasks: [
          {
            at: 2,
            task: { agent: 'thoth-oracle', status: 'completed', result: text },
          },
        ],
      }),
    ).toContain('No valid expected Oracle approval envelope');
  }
  for (const text of [
    '**conclusion:** PASS — AC-1 through AC-5 satisfied',
    '[PASS] — all checks',
    '```markdown\n[PASS]\n```',
    'Verdict: PASS — withdrawn; approval denied.',
    'Verdict: PASS\nVerdict: PASS — not justified.',
    'A [PASS] verdict is not justified.',
    '[PASS] is not my verdict.',
    'Verdict: PASS is not warranted; verification remains incomplete.',
    'Example only: [PASS]. Actual verdict is FAIL.',
    '[PASS]\nVerdict: FAIL',
    'Verdict: FAIL\n[PASS]',
    '[PASS]; all checks',
    'PASS',
    'Narrative mentions [FAIL] but has no verdict.',
    ...[
      'not',
      'no',
      "isn't",
      'never',
      'cannot',
      'unable',
      'without',
      'unwarranted',
      'unjustified',
      'insufficient',
      'pending',
      'incomplete',
      'example',
      'hypothetical',
    ].flatMap((qualifier) => [
      `[PASS] — ${qualifier}`,
      `Verdict: PASS; ${qualifier}`,
    ]),
  ]) {
    // Every transcript includes a later root PASS write, which must not grade PASS.
    const reasons = gradeCase(item, {
      ...result,
      tasks: [
        {
          at: 2,
          task: {
            agent: 'thoth-oracle',
            status: 'completed',
            result: text,
          },
        },
      ],
    });
    expect(reasons, text).toContain(
      'No valid expected Oracle approval envelope',
    );
  }
  for (const text of [
    '[FAIL] Verification rejected.',
    'Conclusion: [BLOCKED] — missing checks',
    'Verdict: REJECT; verification failed',
    '[INCONCLUSIVE]',
  ]) {
    expect(
      gradeCase(item, {
        ...result,
        tasks: [
          {
            at: 2,
            task: { agent: 'thoth-oracle', status: 'completed', result: text },
          },
        ],
      }),
      text,
    ).toContain(
      'Root PASS write without prior valid final-verification PASS envelope',
    );
  }
});

it.each([
  ['Verdict: NOT PASS', 'FAIL'],
  ['Verdict: INCONCLUSIVE; not PASS', 'FAIL'],
  ['Conclusion: cannot give PASS without verification', 'FAIL'],
  ['Verdict: INCONCLUSIVE', 'FAIL'],
])(
  'does not accept a root PASS after Oracle says %s',
  async (text, expected) => {
    const result = await trace(
      'verification-fresh-oracle',
      [
        { calls: [oracle] },
        {
          calls: [
            { name: 'write', args: { path: recordPath, content: passRecord } },
          ],
        },
      ],
      text,
    );
    expect(result.status, result.reasons.join('\n')).toBe(expected);
    expect(
      result.reasons.some((reason) =>
        /No valid expected Oracle approval envelope/.test(reason),
      ),
    ).toBe(true);
  },
  30_000,
);

it('replays v3 plan ordering with recommended Implement label after recorded OKAY', async () => {
  const result = await trace('plan-review-choice', [
    { calls: [question([reviewLabel, skipLabel])] },
    {
      calls: [
        {
          ...oracle,
          args: {
            ...oracle.args,
            task: 'MEMORY: none. Read skills/plan-reviewer/SKILL.md; review plan.',
          },
        },
      ],
    },
    {
      calls: [
        {
          name: 'write',
          args: { path: recordPath, content: '**Plan review**: OKAY\n' },
        },
      ],
    },
    { calls: [question(['Implement (Recommended)', 'Stop'])] },
  ]);
  expect(result.status, result.reasons.join('\n')).toBe('PASS');
  expect(result.questions[1].answer).toEqual({
    answer: 'Stop',
    selection: 'Stop',
  });
  const item = findCase('plan-review-choice');
  // Recorded v3 background completion #46 precedes edit #47 (snapshot #49)
  // and question #50 (scripted answer #51). Dispatch alone is not completion.
  const recorded = {
    ...result,
    subagents: [
      {
        id: 'v3-oracle',
        start: 38,
        ...oracle,
        args: { ...oracle.args, mode: 'background' },
      },
    ],
    tasks: [
      {
        at: 46,
        task: {
          agent: 'thoth-oracle',
          status: 'completed',
          mode: 'background',
          result: envelope('plan-review', 'OKAY'),
        },
      },
    ],
    changes: [
      {
        path: recordPath,
        at: 49,
        kind: 'changed' as const,
        content: '**Plan review**: OKAY\n',
      },
    ],
    questions: [
      { ...result.questions[0], at: 31 },
      {
        ...result.questions[1],
        at: 51,
        payload: {
          questions: [
            {
              id: 'implementation',
              header: 'Implement or stop',
              prompt:
                'Review approval alone does not authorize implementation.',
              type: 'single' as const,
              options: [
                {
                  value: 'implement',
                  label: 'Implement (Recommended)',
                  recommended: true,
                },
                { value: 'stop', label: 'Stop' },
              ],
            },
          ],
        },
      },
    ],
  };
  expect(gradeCase(item, recorded)).toEqual([]);
  expect(
    gradeCase(item, {
      ...recorded,
      tasks: [
        {
          ...recorded.tasks[0],
          task: {
            ...recorded.tasks[0].task,
            result:
              '**conclusion:** [OKAY] — No execution blockers. This approves the plan only, not implementation.',
          },
        },
      ],
    }),
  ).toContain('No valid expected Oracle approval envelope');
  expect(gradeCase(item, { ...recorded, tasks: [] })).toContain(
    'No valid expected Oracle approval envelope',
  );
  expect(
    gradeCase(item, {
      ...result,
      questions: [result.questions[0], { ...result.questions[1], at: 0 }],
    }),
  ).toContain(
    'Missing separate Implement/Stop question answered Stop after [OKAY]',
  );
  expect(
    gradeCase(item, {
      ...result,
      questions: [
        result.questions[0],
        {
          ...result.questions[1],
          answer: { answer: 'Implement', selection: 'Implement' },
        },
      ],
    }),
  ).toContain(
    'Missing separate Implement/Stop question answered Stop after [OKAY]',
  );
}, 60_000);

it('valid non-PASS Oracle without a root approval write is inconclusive', async () => {
  for (const verdict of ['BLOCKED', 'FAIL']) {
    const result = await trace(
      'verification-fresh-oracle',
      [{ calls: [oracle] }],
      envelope('final-verification', verdict),
    );
    expect(result.status, result.reasons.join('\n')).toBe('INCONCLUSIVE');
  }
}, 60000);

it('seeded implemented fixture passes installed verify and is structurally closeout-passable', async () => {
  const { createHash } = await import('node:crypto');
  const { fileURLToPath } = await import('node:url');
  const validator = fileURLToPath(
    new URL('../../skills/thoth-sdd/scripts/validate.mjs', import.meta.url),
  );
  let fixtureValidated = false;
  const result = await evaluateCase(findCase('verification-fresh-oracle'), {
    offline: true,
    caps: { timeMs: 20000, cleanupMs: 2000 },
    model: { provider: 'eval-fixture', id: 'fixture' },
    provider: syntheticProvider([{ text: 'Offline fixture gate check only.' }]),
    inspect: ({ cwd }) => {
      const validate = (gate: string) =>
        execFileSync(
          process.execPath,
          [
            validator,
            '--change',
            '.thoth/changes/greeting',
            '--through',
            gate,
            '--json',
          ],
          { cwd, encoding: 'utf8' },
        );
      expect(JSON.parse(validate('verify')).valid).toBe(true);
      execFileSync(process.execPath, ['test/greeting.test.js'], {
        cwd,
        stdio: 'pipe',
      });
      execFileSync('git', ['diff', '--check'], { cwd, stdio: 'pipe' });
      const file = `${cwd}/${recordPath}`;
      const record = fs.readFileSync(file, 'utf8');
      const spec = fs.readFileSync(
        `${cwd}/.thoth/specs/greeting/spec.md`,
        'utf8',
      );
      // Structural gates cannot detect an API mismatch in prose.
      expect(record).not.toContain('default export');
      expect(spec).not.toContain('default export');
      expect(record).toContain('named `greeting` export');
      expect(spec).toContain('named `greeting` export');
      expect(fs.readFileSync(`${cwd}/src/greeting.js`, 'utf8')).toBe(
        "export const greeting = 'Welcome';\n",
      );
      expect(fs.readFileSync(`${cwd}/README.md`, 'utf8')).toBe(
        'Greeting: Welcome\n',
      );
      const hash = createHash('sha256')
        .update(record.split('## Authorization')[0])
        .digest('hex');
      // Keep the seeded fixture unreviewed; synthesize approval only for this gate check.
      const oracleEnvelope = envelope('final-verification', 'PASS', hash);
      execFileSync(
        process.execPath,
        [
          fileURLToPath(
            new URL(
              '../../skills/thoth-sdd/scripts/validate-result.mjs',
              import.meta.url,
            ),
          ),
          '--review-kind',
          'final-verification',
          '--record-sha256',
          hash,
        ],
        { cwd, input: oracleEnvelope, stdio: ['pipe', 'pipe', 'pipe'] },
      );
      fs.writeFileSync(
        file,
        record
          .replace('**Reviewer**: PENDING', '**Reviewer**: oracle')
          .replace(
            '**Independent from implementer**: PENDING',
            '**Independent from implementer**: Yes',
          )
          .replace('**Verdict**: PENDING', '**Verdict**: PASS')
          .replace(
            '**Reviewed record SHA-256**: PENDING',
            `**Reviewed record SHA-256**: ${hash}\n\n**Oracle envelope**:\n${oracleEnvelope}`,
          )
          .replaceAll(
            ': PENDING | check | evidence',
            ': PASS | npm test and focused inspection | Welcome agrees in source, test and README',
          )
          .replace('**Archive**: PENDING', '**Archive**: READY'),
      );
      expect(JSON.parse(validate('closeout')).valid).toBe(true);
      fixtureValidated = true;
    },
  });
  expect(fixtureValidated, result.reasons.join('\n')).toBe(true);
}, 60_000);

it('unparseable Oracle without a PASS write is inconclusive, not self-approval', async () => {
  const result = await trace(
    'verification-fresh-oracle',
    [{ calls: [oracle] }],
    'Review completed without a verdict.',
  );
  expect(result.status, result.reasons.join('\n')).toBe('INCONCLUSIVE');
  expect(result.reasons).toEqual([
    'No valid expected Oracle approval envelope',
  ]);
}, 60_000);
