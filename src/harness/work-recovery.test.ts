import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  captureBaseline,
  createCheckpoint,
  fingerprintAcceptance,
  fingerprintPaths,
  fingerprintTechnical,
  fingerprintUnit,
  fingerprintWork,
  loadWork,
  projectResumeContext,
  readCheckpoint,
  validateWork,
} from '../../skills/thoth-work/scripts/work.mjs';

describe('bounded work recovery', () => {
  test('falls back to the one previous valid checkpoint after a torn latest write', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'thoth-work-recovery-'));
    const changeRoot = join(projectRoot, '.thoth', 'changes', 'example');
    mkdirSync(changeRoot, { recursive: true });
    writeFileSync(join(projectRoot, 'input.txt'), 'one');
    writeFileSync(join(projectRoot, 'output.txt'), 'first');
    writeFileSync(join(changeRoot, 'work.yaml'), CHECKPOINT_WORK);
    const checkpointWork = loadWork({ projectRoot, changeRoot });
    writeFileSync(
      join(changeRoot, 'work.yaml'),
      CHECKPOINT_WORK.replace(
        'AGREEMENT',
        fingerprintWork(checkpointWork.work),
      ),
    );

    createCheckpoint({
      projectRoot,
      changeRoot,
      unitId: 'implementation',
      writer: 'agent-1',
      summary: 'first',
      completed: ['draft'],
      pending: ['verify'],
      checks: [],
      nextAction: 'Verify output',
      readRefs: ['input.txt'],
    });
    writeFileSync(join(projectRoot, 'output.txt'), 'second');
    const latest = createCheckpoint({
      projectRoot,
      changeRoot,
      unitId: 'implementation',
      writer: 'agent-1',
      summary: 'second',
      completed: ['draft', 'implementation'],
      pending: ['verify'],
      checks: [],
      nextAction: 'Verify output',
      readRefs: ['input.txt'],
    });
    writeFileSync(latest.path, '{torn');

    const recovered = readCheckpoint({
      projectRoot,
      changeRoot,
      unitId: 'implementation',
    });
    expect(recovered.status).toBe('fallback');
    expect(recovered.checkpoint?.summary).toBe('first');
    expect(readFileSync(latest.previousPath, 'utf8')).toContain(
      '"summary": "first"',
    );
  });

  test('validates checkpoint identity, complete shape, lineage, and symlink safety', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'thoth-work-checkpoint-'));
    const changeRoot = join(projectRoot, '.thoth', 'changes', 'example');
    mkdirSync(changeRoot, { recursive: true });
    writeFileSync(join(projectRoot, 'input.txt'), 'one');
    writeFileSync(join(projectRoot, 'output.txt'), 'first');
    writeFileSync(join(changeRoot, 'work.yaml'), CHECKPOINT_WORK);
    const loaded = loadWork({ projectRoot, changeRoot });
    const baseline = captureBaseline({ projectRoot, paths: ['output.txt'] });
    writeFileSync(
      join(changeRoot, 'work.yaml'),
      CHECKPOINT_WORK.replace(
        'AGREEMENT',
        fingerprintWork(loaded.work),
      ).replace(
        'baseline: { status: unknown }',
        `baseline:
      status: captured
      capturedAt: ${baseline.capturedAt}
      paths:
        - path: output.txt
          state: preexisting
          fingerprint: ${baseline.paths[0]?.fingerprint}`,
      ),
    );
    const created = createCheckpoint({
      projectRoot,
      changeRoot,
      unitId: 'implementation',
      writer: 'agent-1',
      summary: 'implemented',
      completed: ['implementation'],
      pending: ['verification'],
      checks: [
        {
          id: 'compare',
          command: 'manual compare',
          result: 'pass',
          inputFingerprint: fingerprintPaths({
            projectRoot,
            paths: ['input.txt'],
          }).fingerprint,
          outputFingerprint: fingerprintPaths({
            projectRoot,
            paths: ['output.txt'],
          }).fingerprint,
        },
      ],
      nextAction: 'Request root acceptance',
      readRefs: ['input.txt'],
    });
    expect(created.checkpoint).toMatchObject({
      changeId: 'example',
      writer: 'agent-1',
      baseline: { status: 'captured' },
      checks: [expect.objectContaining({ id: 'compare', result: 'pass' })],
      nextAction: 'Request root acceptance',
      readRefs: ['input.txt'],
    });

    const malformed = JSON.parse(readFileSync(created.path, 'utf8'));
    delete malformed.writer;
    writeFileSync(created.path, JSON.stringify(malformed));
    expect(
      readCheckpoint({ projectRoot, changeRoot, unitId: 'implementation' }),
    ).toMatchObject({ status: 'missing' });

    writeFileSync(
      created.path,
      JSON.stringify({ ...created.checkpoint, unitId: 'other' }),
    );
    expect(
      readCheckpoint({ projectRoot, changeRoot, unitId: 'implementation' }),
    ).toMatchObject({ status: 'missing' });

    writeFileSync(created.path, JSON.stringify(created.checkpoint));
    writeFileSync(
      join(changeRoot, 'work.yaml'),
      readFileSync(join(changeRoot, 'work.yaml'), 'utf8').replace(
        'criterion: Output is current',
        'criterion: Output is still current',
      ),
    );
    expect(
      readCheckpoint({ projectRoot, changeRoot, unitId: 'implementation' }),
    ).toMatchObject({ status: 'missing' });

    writeFileSync(created.path, JSON.stringify(created.checkpoint));
    const linkTarget = join(projectRoot, 'linked-checkpoint.json');
    writeFileSync(linkTarget, JSON.stringify(created.checkpoint));
    unlinkSync(created.path);
    symlinkSync(linkTarget, created.path, 'file');
    expect(
      readCheckpoint({ projectRoot, changeRoot, unitId: 'implementation' }),
    ).toMatchObject({ status: 'missing' });

    unlinkSync(created.path);
    writeFileSync(created.path, '{torn');
    symlinkSync(linkTarget, created.previousPath, 'file');
    expect(
      readCheckpoint({ projectRoot, changeRoot, unitId: 'implementation' }),
    ).toMatchObject({ status: 'missing' });
  });

  test('does not resume a checkpoint after the product agreement changes', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'thoth-work-agreement-'));
    const changeRoot = join(projectRoot, '.thoth', 'changes', 'example');
    mkdirSync(changeRoot, { recursive: true });
    writeFileSync(join(projectRoot, 'input.txt'), 'one');
    writeFileSync(join(projectRoot, 'output.txt'), 'first');
    writeFileSync(join(changeRoot, 'work.yaml'), CHECKPOINT_WORK);
    const loaded = loadWork({ projectRoot, changeRoot });
    const baseline = captureBaseline({ projectRoot, paths: ['output.txt'] });
    const approved = CHECKPOINT_WORK.replace(
      'AGREEMENT',
      fingerprintWork(loaded.work),
    ).replace(
      'baseline: { status: unknown }',
      `baseline:
      status: captured
      capturedAt: ${baseline.capturedAt}
      paths:
        - path: output.txt
          state: preexisting
          fingerprint: ${baseline.paths[0]?.fingerprint}`,
    );
    writeFileSync(join(changeRoot, 'work.yaml'), approved);
    createCheckpoint({
      projectRoot,
      changeRoot,
      unitId: 'implementation',
      writer: 'agent-1',
      summary: 'implemented',
      completed: ['implementation'],
      pending: ['verification'],
      checks: [],
      nextAction: 'Verify output',
      readRefs: ['input.txt'],
    });
    expect(
      projectResumeContext({
        projectRoot,
        changeRoot,
        unitId: 'implementation',
      }).freshness?.resumable,
    ).toBe(true);

    writeFileSync(
      join(changeRoot, 'work.yaml'),
      approved.replace(
        'goal: Recover bounded work',
        'goal: Deliver a new goal',
      ),
    );
    const stale = projectResumeContext({
      projectRoot,
      changeRoot,
      unitId: 'implementation',
    });

    expect(stale.checkpoint).toMatchObject({ status: 'missing' });
    expect(stale.freshness).toBeNull();
  });

  test('binds checkpoints and requests to one canonical change identity', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'thoth-work-change-id-'));
    const originalRoot = join(projectRoot, '.thoth', 'changes', 'example');
    const copiedRoot = join(projectRoot, '.thoth', 'changes', 'different');
    mkdirSync(originalRoot, { recursive: true });
    writeFileSync(join(projectRoot, 'input.txt'), 'one');
    writeFileSync(join(projectRoot, 'output.txt'), 'first');
    writeFileSync(join(originalRoot, 'work.yaml'), CHECKPOINT_WORK);
    const loaded = loadWork({ projectRoot, changeRoot: originalRoot });
    writeFileSync(
      join(originalRoot, 'work.yaml'),
      CHECKPOINT_WORK.replace('AGREEMENT', fingerprintWork(loaded.work)),
    );
    const created = createCheckpoint({
      projectRoot,
      changeRoot: originalRoot,
      unitId: 'implementation',
      writer: 'agent-1',
      summary: 'implemented',
      completed: ['implementation'],
      pending: ['verification'],
      checks: [],
      nextAction: 'Verify output',
      readRefs: ['input.txt'],
    });

    mkdirSync(join(copiedRoot, 'evidence', 'implementation'), {
      recursive: true,
    });
    writeFileSync(
      join(copiedRoot, 'work.yaml'),
      readFileSync(join(originalRoot, 'work.yaml'), 'utf8').replace(
        'change: { id: example }',
        'change: { id: different }',
      ),
    );
    writeFileSync(
      join(copiedRoot, 'evidence', 'implementation', 'checkpoint.json'),
      readFileSync(created.path),
    );

    expect(
      readCheckpoint({
        projectRoot,
        changeRoot: copiedRoot,
        unitId: 'implementation',
      }),
    ).toMatchObject({ status: 'missing' });
    expect(() =>
      projectResumeContext({
        projectRoot,
        changeRoot: originalRoot,
        changeId: 'different',
        unitId: 'implementation',
      }),
    ).toThrow(/change id.*change root/i);
  });

  test('captures a real pre-dispatch baseline and never upgrades unknown baseline', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'thoth-work-baseline-'));
    writeFileSync(join(projectRoot, 'existing.txt'), 'before');
    const baseline = captureBaseline({
      projectRoot,
      paths: ['existing.txt', 'absent.txt'],
    });
    expect(baseline).toMatchObject({
      status: 'captured',
      paths: [
        { path: 'existing.txt', state: 'preexisting' },
        { path: 'absent.txt', state: 'absent' },
      ],
    });
    expect(
      baseline.paths.every((entry) => /^sha256:/.test(entry.fingerprint)),
    ).toBe(true);

    const cli = spawnSync(
      process.execPath,
      [
        join(process.cwd(), 'skills', 'thoth-work', 'scripts', 'work.mjs'),
        'baseline',
        '--project',
        projectRoot,
        '--paths',
        'existing.txt,absent.txt',
      ],
      { encoding: 'utf8' },
    );
    expect(cli.status, cli.stderr).toBe(0);
    expect(JSON.parse(cli.stdout)).toMatchObject({ status: 'captured' });
  });

  test('creates and reads an honestly degraded checkpoint through the absolute CLI with --id', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'thoth-work-cli-'));
    const changeRoot = join(projectRoot, '.thoth', 'changes', 'example');
    mkdirSync(changeRoot, { recursive: true });
    writeFileSync(join(projectRoot, 'input.txt'), 'input');
    writeFileSync(join(projectRoot, 'output.txt'), 'partial');
    writeFileSync(join(changeRoot, 'work.yaml'), CHECKPOINT_WORK);
    const loaded = loadWork({ projectRoot, changeRoot });
    writeFileSync(
      join(changeRoot, 'work.yaml'),
      CHECKPOINT_WORK.replace('AGREEMENT', fingerprintWork(loaded.work)),
    );
    const helper = join(
      process.cwd(),
      'skills',
      'thoth-work',
      'scripts',
      'work.mjs',
    );
    const cli = spawnSync(
      process.execPath,
      [
        helper,
        'checkpoint',
        '--project',
        projectRoot,
        '--id',
        'example',
        '--unit',
        'implementation',
        '--writer',
        'native-agent-1',
        '--summary',
        'partial implementation',
        '--pending',
        'verification',
        '--check-results',
        '[]',
        '--next-action',
        'Run focused verification',
        '--read-refs',
        'input.txt',
      ],
      { encoding: 'utf8' },
    );
    expect(cli.status, cli.stderr).toBe(0);
    expect(JSON.parse(cli.stdout)).toMatchObject({
      checkpoint: {
        unitId: 'implementation',
        baseline: { status: 'unknown' },
        nextAction: 'Run focused verification',
        readRefs: ['input.txt'],
      },
    });

    const resume = spawnSync(
      process.execPath,
      [
        helper,
        'resume',
        '--project',
        projectRoot,
        '--id',
        'example',
        '--unit',
        'implementation',
      ],
      { encoding: 'utf8' },
    );
    expect(resume.status, resume.stderr).toBe(0);
    expect(JSON.parse(resume.stdout)).toMatchObject({
      freshness: {
        baseline: 'unknown',
        resumable: false,
        content: { inputs: true, outputs: true },
        lineage: true,
      },
    });
  });

  test('content and dirty-state changes make recorded evidence stale', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'thoth-work-fingerprint-'));
    writeFileSync(join(projectRoot, 'input.txt'), 'one');
    const before = fingerprintPaths({ projectRoot, paths: ['input.txt'] });
    writeFileSync(join(projectRoot, 'input.txt'), 'two');
    const after = fingerprintPaths({ projectRoot, paths: ['input.txt'] });

    expect(before.fingerprint).not.toBe(after.fingerprint);
    expect(after.entries[0]).toMatchObject({ path: 'input.txt' });
    expect(after.entries[0].provenance).toMatch(
      /^(dirty|untracked|outside-git|unknown)$/,
    );
  });

  test('rejects accepted evidence after a relevant input changes', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'thoth-work-stale-'));
    const changeRoot = join(projectRoot, '.thoth', 'changes', 'example');
    const evidence = join(changeRoot, 'evidence');
    mkdirSync(evidence, { recursive: true });
    writeFileSync(join(projectRoot, 'input.txt'), 'one');
    writeFileSync(join(projectRoot, 'output.txt'), 'result');
    writeFileSync(join(evidence, 'review.txt'), 'reviewed');
    writeFileSync(join(changeRoot, 'work.yaml'), ACCEPTED_WORK);
    const loaded = loadWork({ projectRoot, changeRoot });
    const input = fingerprintPaths({
      projectRoot,
      paths: ['input.txt'],
    }).fingerprint;
    const output = fingerprintPaths({
      projectRoot,
      paths: ['output.txt'],
    }).fingerprint;
    const proof = fingerprintPaths({
      projectRoot,
      paths: ['.thoth/changes/example/evidence/review.txt'],
    }).fingerprint;
    const staged = ACCEPTED_WORK.replaceAll(
      'AGREEMENT',
      fingerprintWork(loaded.work),
    )
      .replaceAll('INPUT', input)
      .replaceAll('OUTPUT', output)
      .replaceAll('PROOF', proof);
    writeFileSync(join(changeRoot, 'work.yaml'), staged);
    const accepted = loadWork({ projectRoot, changeRoot }).work;
    const unitDefinition = fingerprintUnit(accepted.units[0]);
    const acceptanceDefinition = fingerprintAcceptance(accepted.acceptance[0]);
    const technicalDefinition = fingerprintTechnical(accepted);
    writeFileSync(
      join(changeRoot, 'work.yaml'),
      staged
        .replace('UNIT_DEFINITION', unitDefinition)
        .replace('ACCEPTANCE_DEFINITION', acceptanceDefinition)
        .replace('TECHNICAL_DEFINITION', technicalDefinition),
    );
    expect(
      validateWork({ projectRoot, changeRoot, through: 'closeout' }).ok,
    ).toBe(true);

    writeFileSync(join(projectRoot, 'input.txt'), 'changed');
    const stale = validateWork({
      projectRoot,
      changeRoot,
      through: 'closeout',
    });
    expect(stale.ok).toBe(false);
    expect(stale.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'WORK-EVIDENCE-STALE' }),
      ]),
    );

    writeFileSync(join(projectRoot, 'input.txt'), 'one');
    const changedDefinition = readFileSync(
      join(changeRoot, 'work.yaml'),
      'utf8',
    ).replace(
      'criterion: Output is current\n    acceptance:',
      'criterion: A newer check\n    acceptance:',
    );
    writeFileSync(join(changeRoot, 'work.yaml'), changedDefinition);
    const staleDefinition = validateWork({
      projectRoot,
      changeRoot,
      through: 'closeout',
    });
    expect(staleDefinition.ok).toBe(false);
    expect(staleDefinition.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'WORK-DEFINITION-STALE' }),
      ]),
    );
  });
});

const ACCEPTED_WORK = `version: 1
change: { id: example }
agreement: { status: approved, fingerprint: AGREEMENT }
goal: Verify freshness
bounds: { include: [input.txt, output.txt], exclude: [] }
autonomy: { allowed: [edit], requiresApproval: [], forbidden: [] }
acceptance:
  - id: AC-1
    criterion: Output is current
    inputs: [input.txt]
    outputs: [output.txt]
    checks: [compare]
    result:
      status: accepted
      reviewedBy: root
      reviewedAt: 2026-09-26T00:00:00Z
      evidence: [.thoth/changes/example/evidence/review.txt]
      evidenceFingerprint: PROOF
      inputFingerprint: INPUT
      outputFingerprint: OUTPUT
      definitionFingerprint: ACCEPTANCE_DEFINITION
units:
  - id: implementation
    output: Produce output
    dependsOn: []
    reads: [input.txt]
    writes: [output.txt]
    resources: []
    owner: { role: worker }
    checks:
      - id: compare
        criterion: Output is current
    acceptance: [AC-1]
    baseline:
      status: captured
      capturedAt: 2026-09-26T00:00:00Z
      paths: [{ path: output.txt, state: preexisting, fingerprint: OUTPUT }]
    semantic:
      status: accepted
      result:
        status: accepted
        reviewedBy: root
        reviewedAt: 2026-09-26T00:00:00Z
        evidence: [.thoth/changes/example/evidence/review.txt]
        evidenceFingerprint: PROOF
        inputFingerprint: INPUT
        outputFingerprint: OUTPUT
        definitionFingerprint: UNIT_DEFINITION
verification:
  reviewer: oracle
  verdict: pass
  evidence: [.thoth/changes/example/evidence/review.txt]
  evidenceFingerprint: PROOF
  inputFingerprint: INPUT
  outputFingerprint: OUTPUT
  agreementFingerprint: AGREEMENT
  technicalFingerprint: TECHNICAL_DEFINITION
`;

const CHECKPOINT_WORK = `version: 1
change: { id: example }
agreement: { status: approved, fingerprint: AGREEMENT }
goal: Recover bounded work
bounds: { include: [input.txt, output.txt], exclude: [] }
autonomy: { allowed: [edit], requiresApproval: [], forbidden: [] }
acceptance:
  - id: AC-1
    criterion: Output is produced
    inputs: [input.txt]
    outputs: [output.txt]
    checks: [compare]
units:
  - id: implementation
    output: Produce output
    dependsOn: []
    reads: [input.txt]
    writes: [output.txt]
    resources: []
    owner: { role: worker }
    checks:
      - id: compare
        criterion: Output is current
    acceptance: [AC-1]
    baseline: { status: unknown }
    semantic: { status: pending }
`;
