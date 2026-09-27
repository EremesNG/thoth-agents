import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  fingerprintPaths,
  fingerprintUnit,
  fingerprintWork,
  loadWork,
  projectResumeContext,
  validateWork,
} from '../../skills/thoth-work/scripts/work.mjs';

describe('selective resume context', () => {
  test('projects only the requested pending unit and its relevant bounded topics', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'thoth-work-context-'));
    const changeRoot = join(projectRoot, '.thoth', 'changes', 'example');
    mkdirSync(join(changeRoot, 'context'), { recursive: true });
    writeFileSync(join(changeRoot, 'context', 'api.md'), 'API topic');
    writeFileSync(join(changeRoot, 'context', 'release.md'), 'release topic');
    const source = WORK.replace('PENDING', 'sha256:pending');
    writeFileSync(join(changeRoot, 'work.yaml'), source);
    const loaded = loadWork({ projectRoot, changeRoot });
    writeFileSync(
      join(changeRoot, 'work.yaml'),
      source.replace('sha256:pending', fingerprintWork(loaded.work)),
    );

    const projection = projectResumeContext({
      projectRoot,
      changeRoot,
      unitId: 'implementation',
      maxBytes: 2048,
    });

    expect(projection.unit.id).toBe('implementation');
    expect(projection.context).toEqual([
      expect.objectContaining({ topic: 'api', content: 'API topic' }),
    ]);
    expect(JSON.stringify(projection)).not.toContain('release topic');
    expect(projection.liveness).toBe('unknown');
    expect(projection.blocking).toEqual({
      writes: ['src/output.ts'],
      resources: [],
    });
  });

  test('closeout distinguishes root acceptance from a documentary checkpoint', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'thoth-work-closeout-'));
    const changeRoot = join(projectRoot, '.thoth', 'changes', 'example');
    mkdirSync(changeRoot, { recursive: true });
    writeFileSync(join(projectRoot, 'input.txt'), 'input');
    writeFileSync(join(projectRoot, 'output.txt'), 'output');
    const source = CLOSEOUT_WORK.replace('PENDING', 'sha256:pending');
    writeFileSync(join(changeRoot, 'work.yaml'), source);
    const loaded = loadWork({ projectRoot, changeRoot });
    writeFileSync(
      join(changeRoot, 'work.yaml'),
      source.replace('sha256:pending', fingerprintWork(loaded.work)),
    );

    const result = validateWork({
      projectRoot,
      changeRoot,
      through: 'closeout',
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'WORK-ACCEPTANCE-PENDING' }),
        expect.objectContaining({ code: 'WORK-UNIT-PENDING' }),
        expect.objectContaining({ code: 'WORK-VERIFICATION-MISSING' }),
      ]),
    );
  });

  test('loads only the selected external unit and its transitive dependencies', () => {
    const projectRoot = mkdtempSync(join(tmpdir(), 'thoth-work-selective-'));
    const changeRoot = join(projectRoot, '.thoth', 'changes', 'example');
    const unitsRoot = join(changeRoot, 'units');
    mkdirSync(unitsRoot, { recursive: true });
    writeFileSync(join(projectRoot, 'dependency.txt'), 'ready');
    writeFileSync(join(projectRoot, 'dependency-evidence.txt'), 'reviewed');
    writeFileSync(join(unitsRoot, 'dependency.yaml'), EXTERNAL_DEPENDENCY);
    writeFileSync(join(unitsRoot, 'consumer.yaml'), EXTERNAL_CONSUMER);
    writeFileSync(join(changeRoot, 'work.yaml'), EXTERNAL_WORK);
    const loaded = loadWork({ projectRoot, changeRoot, unitId: 'consumer' });
    const dependency = loaded.work.units.find(
      (unit: { id: string }) => unit.id === 'dependency',
    );
    const dependencyFingerprint = fingerprintPaths({
      projectRoot,
      paths: ['dependency.txt'],
    }).fingerprint;
    const dependencyEvidenceFingerprint = fingerprintPaths({
      projectRoot,
      paths: ['dependency-evidence.txt'],
    }).fingerprint;
    const emptyFingerprint = fingerprintPaths({
      projectRoot,
      paths: [],
    }).fingerprint;
    writeFileSync(
      join(unitsRoot, 'dependency.yaml'),
      EXTERNAL_DEPENDENCY.replaceAll(
        'DEPENDENCY_FINGERPRINT',
        dependencyFingerprint,
      )
        .replace('EVIDENCE_FINGERPRINT', dependencyEvidenceFingerprint)
        .replace('EMPTY_FINGERPRINT', emptyFingerprint)
        .replace('DEPENDENCY_DEFINITION', fingerprintUnit(dependency)),
    );
    writeFileSync(
      join(changeRoot, 'work.yaml'),
      EXTERNAL_WORK.replace('PENDING', fingerprintWork(loaded.work)),
    );

    const projection = projectResumeContext({
      projectRoot,
      changeRoot,
      unitId: 'consumer',
    });
    expect(projection.unit.id).toBe('consumer');
    expect(projection.dependencies).toEqual([
      expect.objectContaining({
        id: 'dependency',
        acceptance: 'accepted',
        freshness: expect.objectContaining({ content: true, evidence: true }),
      }),
    ]);

    writeFileSync(join(projectRoot, 'dependency.txt'), 'changed');
    expect(
      projectResumeContext({ projectRoot, changeRoot, unitId: 'consumer' })
        .dependencies[0],
    ).toMatchObject({ freshness: { content: false, evidence: true } });

    writeFileSync(
      join(unitsRoot, 'consumer.yaml'),
      readFileSync(join(unitsRoot, 'consumer.yaml'), 'utf8').replace(
        'dependsOn: [dependency]',
        'dependsOn: [missing]',
      ),
    );
    expect(() =>
      projectResumeContext({ projectRoot, changeRoot, unitId: 'consumer' }),
    ).toThrow(/required unit definition missing/i);
  });
});

const EXTERNAL_WORK = `version: 1
change: { id: example }
agreement: { status: approved, fingerprint: PENDING }
goal: Resume selected external work
bounds: { include: [consumer.txt], exclude: [] }
autonomy: { allowed: [edit], requiresApproval: [], forbidden: [] }
acceptance:
  - id: AC-1
    criterion: Consumer resumes
    inputs: [dependency.txt]
    outputs: [consumer.txt]
    checks: [focused]
unitRefs:
  - .thoth/changes/example/units/dependency.yaml
  - .thoth/changes/example/units/consumer.yaml
  - .thoth/changes/example/units/unrelated.yaml
`;

const EXTERNAL_DEPENDENCY = `id: dependency
output: Produce dependency
dependsOn: []
reads: []
writes: [dependency.txt]
resources: []
owner: { role: worker }
checks:
  - id: dependency-check
    criterion: Dependency exists
acceptance: [AC-1]
baseline: { status: unknown }
semantic:
  status: accepted
  result:
    status: accepted
    reviewedBy: root
    reviewedAt: 2026-09-26T00:00:00Z
    evidence: [dependency-evidence.txt]
    evidenceFingerprint: EVIDENCE_FINGERPRINT
    inputFingerprint: EMPTY_FINGERPRINT
    outputFingerprint: DEPENDENCY_FINGERPRINT
    definitionFingerprint: DEPENDENCY_DEFINITION
`;

const EXTERNAL_CONSUMER = `id: consumer
output: Consume dependency
dependsOn: [dependency]
reads: [dependency.txt]
writes: [consumer.txt]
resources: []
owner: { role: worker }
checks:
  - id: consumer-check
    criterion: Consumer works
acceptance: [AC-1]
baseline: { status: unknown }
semantic: { status: pending }
`;

const WORK = `version: 1
change: { id: example }
agreement:
  status: approved
  fingerprint: PENDING
goal: Resume bounded work
bounds:
  include: [src/**]
  exclude: []
autonomy:
  allowed: [edit assigned files]
  requiresApproval: []
  forbidden: []
acceptance:
  - id: AC-1
    criterion: Output exists
    inputs: []
    outputs: [src/output.ts]
    checks: [focused test]
context:
  - topic: api
    path: .thoth/changes/example/context/api.md
    relevantTo: [implementation]
  - topic: release
    path: .thoth/changes/example/context/release.md
    relevantTo: [release]
units:
  - id: implementation
    output: Implement output
    dependsOn: []
    reads: []
    writes: [src/output.ts]
    resources: []
    owner: { role: worker }
    checks:
      - id: test
        criterion: Focused test passes
    acceptance: [AC-1]
    baseline: { status: unknown }
    semantic: { status: pending }
  - id: release
    output: Release output
    dependsOn: [implementation]
    reads: [src/output.ts]
    writes: [release.txt]
    resources: [release]
    owner: { role: worker }
    checks:
      - id: release-check
        criterion: Release verified
    acceptance: [AC-1]
    baseline: { status: unknown }
    semantic: { status: pending }
`;

const CLOSEOUT_WORK = `version: 1
change: { id: example }
agreement:
  status: approved
  fingerprint: PENDING
goal: Close work
bounds: { include: [output.txt], exclude: [] }
autonomy: { allowed: [edit], requiresApproval: [], forbidden: [] }
acceptance:
  - id: AC-1
    criterion: Output matches
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
        criterion: Output matches
    acceptance: [AC-1]
    baseline: { status: captured, paths: [{ path: output.txt, state: preexisting }] }
    semantic: { status: pending }
`;
