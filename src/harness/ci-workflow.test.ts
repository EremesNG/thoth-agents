// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub Actions expressions are literal workflow contracts.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';

interface Step {
  name?: string;
  uses?: string;
  if?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
  'timeout-minutes'?: number;
}

interface Job {
  'runs-on': string;
  'timeout-minutes': number;
  if?: string;
  needs?: string[];
  strategy?: {
    'fail-fast': boolean;
    matrix: Record<string, (string | number)[]>;
  };
  steps: Step[];
}

const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
  permissions: Record<string, string>;
  concurrency: Record<string, string>;
  jobs: Record<string, Job>;
};
const packages = ['pi-packages', 'opencode-packages'].flatMap((root) =>
  readdirSync(root)
    .filter((dir) => existsSync(`${root}/${dir}/package.json`))
    .map((dir) => {
      const manifest = JSON.parse(
        readFileSync(`${root}/${dir}/package.json`, 'utf8'),
      );
      return { name: manifest.name as string, dir };
    }),
);

describe('parallel CI workflow', () => {
  test('cancels only superseded PR runs, never push or dispatch runs', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.concurrency).toEqual({
      group:
        "ci-${{ github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number) || github.run_id }}",
      'cancel-in-progress': "${{ github.event_name == 'pull_request' }}",
    });
  });

  test('bounds every job, preserves matrix failures, and aggregates all results', () => {
    let count = 0;
    for (const [name, job] of Object.entries(workflow.jobs)) {
      expect(job['timeout-minutes']).toBeGreaterThan(0);
      if (job.strategy) {
        expect(job.strategy['fail-fast']).toBe(false);
        count += Object.values(job.strategy.matrix).reduce(
          (total, values) => total * values.length,
          1,
        );
      } else {
        count++;
      }
      expect(job.steps[0].uses, name).toBe('actions/checkout@v4');
      expect(job.steps[1].uses, name).toBe('./.github/actions/setup');
    }
    expect(count).toBeLessThanOrEqual(20);
    const aggregate = workflow.jobs['ci-ok'];
    expect(aggregate.if).toBe('always()');
    expect(aggregate.needs?.toSorted()).toEqual(
      Object.keys(workflow.jobs)
        .filter((name) => name !== 'ci-ok')
        .sort(),
    );
    expect(aggregate.steps.at(-1)?.run).toContain(
      "Object.values(needs).every(job => job.result === 'success')",
    );
  });

  test.each(
    packages,
  )('$dir has Linux/Windows test lanes and a Linux typecheck', ({
    name,
    dir,
  }) => {
    const typechecks = workflow.jobs.static.steps.filter((step) =>
      step.run?.includes(`pnpm --filter ${name} run typecheck`),
    );
    expect(typechecks).toHaveLength(1);
    expect(workflow.jobs.static['runs-on']).toBe('ubuntu-latest');
    for (const os of ['linux', 'windows']) {
      const job = workflow.jobs[`packages-${os}`];
      expect(job['runs-on']).toBe(
        os === 'linux' ? 'ubuntu-latest' : 'windows-latest',
      );
      const command = `pnpm --filter ${name} run ${dir === 'pi-claude-bridge' ? 'test:unit' : 'test'}`;
      const steps = job.steps.filter((step) => step.run?.includes(command));
      expect(steps, `${name} on ${os}`).toHaveLength(1);
      const step = steps[0];
      const lane = step.if?.match(/matrix\.lane == '([^']+)'/)?.[1];
      expect(job.strategy?.matrix.lane).toContain(lane);
      expect(step.if).toContain('!cancelled()');
      expect(step.run).toBe(
        `${command}${os === 'windows' && dir !== 'pi-claude-bridge' ? ' --retry=2' : ''}`,
      );
      expect(
        job.steps.some((step) => step.run?.includes('run typecheck')),
      ).toBe(false);
      if (dir === 'opencode-multi-codex') {
        const build = job.steps.find((step) =>
          step.run?.includes(`pnpm --filter ${name} run build`),
        );
        expect(build?.if).toBe(step.if);
      }
    }
  });

  test('shards both root projects with the marketplace and verifies bundles on both OSes', () => {
    const root = workflow.jobs['root-tests'];
    expect(root.strategy?.matrix.shard).toEqual([1, 2, 3]);
    expect(root.steps).toContainEqual({
      name: 'Checkout marketplace',
      uses: 'actions/checkout@v4',
      with: { repository: 'EremesNG/thoth-plugins', path: 'thoth-plugins' },
    });
    expect(root.steps.at(-1)).toMatchObject({
      run: 'pnpm exec vitest run --shard=${{ matrix.shard }}/3',
      env: { THOTH_PLUGINS_ROOT: '${{ github.workspace }}/thoth-plugins' },
    });
    expect(workflow.jobs.bundles.strategy?.matrix.os).toEqual([
      'ubuntu-latest',
      'windows-latest',
    ]);
    expect(workflow.jobs.bundles.steps.at(-1)).toMatchObject({
      run: 'pnpm run test:pi-extensions',
      'timeout-minutes': 2,
    });
  });
});
