import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';

type Step = {
  name?: string;
  id?: string;
  if?: string;
  run?: string;
  env?: Record<string, string>;
};

const raw = readFileSync(
  join(process.cwd(), '.github', 'workflows', 'release.yml'),
  'utf8',
);
const steps = (parse(raw) as { jobs: { publish: { steps: Step[] } } }).jobs
  .publish.steps;
const indexOf = (name: string) => steps.findIndex((s) => s.name === name);
const byName = (name: string) => steps[indexOf(name)];

// The workflow runs on Ubuntu; exercise its CLI boundary wherever GNU timeout exists.
const hasGnuTimeout =
  spawnSync('bash', ['--noprofile', '--norc', '-c', 'timeout --version'], {
    encoding: 'utf8',
    timeout: 30000,
  }).stdout?.includes('GNU coreutils') ?? false;

function runReconcile({
  npmScript,
  packageCount = 9,
  outcome = 'success',
  waitSeconds = 2,
}: {
  npmScript: string;
  packageCount?: number;
  outcome?: string;
  waitSeconds?: number;
}) {
  const root = mkdtempSync(join(tmpdir(), 'thoth-reconcile-'));
  try {
    const bin = join(root, 'bin');
    mkdirSync(bin);
    for (let i = 0; i < packageCount; i++) {
      const dir = join(root, 'pi-packages', `package-${i}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({
          name: `@thoth-agents/package-${i}`,
          version: '1.0.0',
        }),
      );
    }
    for (const [command, body] of Object.entries({
      npm: `echo "npm $*" >> "$TRACE"\n${npmScript}`,
      sleep: `echo "sleep $*" >> "$TRACE"
"$REAL_SLEEP" "$@"
status=$?
printf '%s\\n' "$(( $(<"$CLOCK") + $1 ))" > "$CLOCK"
exit "$status"`,
      timeout: `echo "timeout $*" >> "$TRACE"
"$REAL_TIMEOUT" "$@"
status=$?
echo "timeout-status $status" >> "$TRACE"
if [ "$status" = 124 ] || [ "$status" = 137 ]; then
  duration="\${2%s}"
  printf '%s\\n' "$(( $(<"$CLOCK") + duration ))" > "$CLOCK"
fi
exit "$status"`,
      git: 'echo "git $*" >> "$TRACE"\nif [ "$1" = "ls-remote" ]; then echo existing-tag; fi',
      gh: 'echo "gh $*" >> "$TRACE"',
    })) {
      writeFileSync(join(bin, command), `#!/usr/bin/env bash\n${body}\n`, {
        mode: 0o755,
      });
    }
    writeFileSync(join(root, 'trace'), '');
    writeFileSync(join(root, 'clock'), '0');
    const result = spawnSync('bash', ['--noprofile', '--norc'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30000,
      // Set fixture variables inside Bash: Windows' WSL launcher does not forward
      // arbitrary spawn env variables unless they are listed in WSLENV.
      input: `export REAL_SLEEP="$(command -v sleep)" REAL_TIMEOUT="$(command -v timeout)"
export PATH="$PWD/bin:$PATH" TRACE="$PWD/trace" TMPDIR="$PWD" CLOCK="$PWD/clock"
export PI_PUBLISH_OUTCOME='${outcome.replaceAll("'", "'\\''")}' PI_PUBLISH_WAIT_SECONDS=${waitSeconds}
# Advance the deadline clock only after mocked sleep/timeout operations. Real
# GNU timeout and sleep still run, but metadata startup and CI load cannot spend
# the propagation budget before npm has even started. Unsetting SECONDS removes
# its special wall-clock behavior; DEBUG refreshes it before each workflow command.
unset SECONDS
SECONDS=0
trap 'SECONDS=$(<"$CLOCK")' DEBUG
${byName('Reconcile Pi releases').run}`,
    });
    return {
      ...result,
      clockSeconds: Number(readFileSync(join(root, 'clock'), 'utf8')),
      trace: readFileSync(join(root, 'trace'), 'utf8').trim().split('\n'),
    };
  } finally {
    // spawnSync has reaped Bash; WSL/Windows may release its cwd handle later.
    rmSync(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
}

describe('release workflow CI gate', () => {
  const script = byName('Wait for CI').run ?? '';

  function runWait({
    status = 'completed',
    conclusion = 'success',
    failedJobs = '',
    found = true,
    runId = '42',
    jobsError = false,
    waitAttempts = 270,
  } = {}) {
    // Mock CLI responses, not the workflow's control flow. jq is not installed
    // on every development host; selection/filter expressions are pinned below.
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    return spawnSync(
      'bash',
      ['--noprofile', '--norc', '-e', '-o', 'pipefail'],
      {
        encoding: 'utf8',
        timeout: 30000,
        input: `
HEAD_SHA=tagged-sha RELEASE_BRANCH=master GITHUB_REPOSITORY=owner/repo GITHUB_OUTPUT=/dev/null
status=${quote(status)} conclusion=${quote(conclusion)} failed_jobs_fixture=${quote(failedJobs)}
run_id_fixture=${quote(runId)} CI_WAIT_ATTEMPTS=${waitAttempts}
gh() {
  if [ "$1" = api ]; then echo fixture; return; fi
  echo jobs-request >&2
  ${jobsError ? 'return 1' : 'printf \'%s\' "$failed_jobs_fixture"'}
}
jq() {
  while IFS= read -r line; do :; done
  if [ "$1" != -r ]; then ${found ? 'echo selected-run' : ':'}; return; fi
  case "$2" in
    .status) echo "$status" ;;
    '.conclusion // empty') echo "$conclusion" ;;
    '.id // empty') echo "$run_id_fixture" ;;
    .html_url) echo https://example.test/run/42 ;;
    *) exit 2 ;;
  esac
}
sleep() { echo "sleep $*" >&2; status=completed; conclusion=success; }
${script}`,
      },
    );
  }

  test.skipIf(!hasGnuTimeout)(
    'waits for pending CI and accepts only completed success',
    () => {
      const result = runWait({ status: 'in_progress', conclusion: '' });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stderr.trim().split('\n')).toEqual([
        'jobs-request',
        'sleep 10',
      ]);
    },
  );

  test
    .skipIf(!hasGnuTimeout)
    .each(['failure', 'cancelled', 'timed_out', 'neutral', 'skipped', ''])(
    'fails immediately for completed conclusion %s',
    (conclusion) => {
      const result = runWait({ conclusion });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        `CI did not pass for tagged-sha: ${conclusion || 'unknown'}`,
      );
      expect(result.stderr).toBe('');
    },
  );

  test.skipIf(!hasGnuTimeout)(
    'fails before sleeping when a job fails in an unfinished run',
    () => {
      const result = runWait({
        status: 'in_progress',
        conclusion: '',
        failedJobs: 'Linux: failure',
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('CI jobs did not pass for tagged-sha');
      expect(result.stdout).toContain('Linux: failure');
      expect(result.stderr.trim()).toBe('jobs-request');
    },
  );

  test.skipIf(!hasGnuTimeout)(
    'fails closed when job inspection fails or the run id is absent',
    () => {
      const inspection = runWait({ status: 'in_progress', jobsError: true });
      expect(inspection.error).toBeUndefined();
      expect(inspection.status).toBe(1);
      expect(inspection.stderr.trim()).toBe('jobs-request');
      const missingId = runWait({ runId: '' });
      expect(missingId.status).toBe(1);
      expect(missingId.stdout).toContain('CI run id was missing');
      expect(missingId.stderr).toBe('');
    },
  );

  test.skipIf(!hasGnuTimeout)(
    'times out after the configured polls when no eligible push run appears',
    () => {
      const result = runWait({ found: false, waitAttempts: 3 });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        'Timed out waiting for CI to complete for tagged-sha.',
      );
      expect(result.stderr.trim().split('\n')).toEqual(
        Array(3).fill('sleep 10'),
      );
    },
  );

  test('allows 45 minutes of polling with headroom for publishing', () => {
    const workflow = parse(raw);
    expect(script).toContain('wait_attempts=${CI_WAIT_ATTEMPTS:-270}');
    expect(script).toContain(
      'for ((attempt = 1; attempt <= wait_attempts; attempt++)); do',
    );
    expect(script).toContain('sleep 10');
    expect(workflow.jobs.publish['timeout-minutes']).toBe(90);
  });

  test('only accepts the latest push CI run for the release branch and SHA', () => {
    expect(script).toContain('head_sha=${HEAD_SHA}&event=push&per_page=20');
    expect(script).toContain('.head_branch == $branch and .head_sha == $sha');
    expect(script).toContain('sort_by(.created_at)');
    expect(script).toContain('last // empty');
    expect(script).toContain('CI run id was missing');
    expect(script).toContain('echo "run_id=${run_id}" >> "$GITHUB_OUTPUT"');
  });

  test('rejects completed non-success runs before checking jobs or sleeping', () => {
    expect(script).toMatch(
      /if \[ "\$status" = "completed" \]; then\s+if \[ "\$conclusion" = "success" \]; then[\s\S]+?exit 0\s+fi\s+echo "CI did not pass for \$\{HEAD_SHA\}: \$\{conclusion:-unknown\} \(\$\{url\}\)"\s+exit 1\s+fi/,
    );
    expect(script.indexOf('CI did not pass')).toBeLessThan(
      script.indexOf('gh run view'),
    );
  });

  test('rejects failed jobs while the rest of CI is still running', () => {
    expect(script).toContain(
      'gh run view "$run_id" --repo "$GITHUB_REPOSITORY" --json jobs',
    );
    expect(script).toContain('.status == "completed"');
    for (const conclusion of [
      'failure',
      'cancelled',
      'timed_out',
      'action_required',
      'startup_failure',
      'stale',
    ]) {
      expect(script).toContain(`.conclusion == "${conclusion}"`);
    }
    // Skipped/neutral jobs need not prevent a successful workflow run.
    expect(script).not.toContain('.conclusion == "skipped"');
    expect(script).not.toContain('.conclusion == "neutral"');
    expect(script).toMatch(
      /if \[ -n "\$failed_jobs" \]; then\s+echo "CI jobs did not pass[^\n]+\n\s+echo "\$failed_jobs"\s+exit 1\s+fi\s+sleep 10/,
    );
  });
});

describe('release workflow Pi packages', () => {
  test('publishes Pi packages before root npm publish', () => {
    const pi = byName('Publish Pi packages');
    expect(pi.id).toBe('pi-publish');
    expect(pi.run?.trim()).toBe(
      'pnpm publish -r --filter "./pi-packages/*" --ignore-scripts --no-git-checks',
    );
    expect(indexOf('Check built plugin runtime')).toBeLessThan(
      indexOf('Publish Pi packages'),
    );
    expect(indexOf('Publish Pi packages')).toBeLessThan(
      indexOf('Publish to npm'),
    );
    expect(byName('Publish Pi packages').if).toBeUndefined();
    expect(byName('Publish to npm').if).toBeUndefined();
  });

  test('reconciles tags and releases independently, even after publish failure', () => {
    const step = byName('Reconcile Pi releases');
    expect(step.if).toContain('always()');
    expect(step.if).toContain("steps.install.outcome == 'success'");
    expect(steps[indexOf('Install dependencies')].id).toBe('install');
    expect(indexOf('Publish Pi packages')).toBeLessThan(
      indexOf('Reconcile Pi releases'),
    );
    expect(indexOf('Reconcile Pi releases')).toBeLessThan(
      indexOf('Publish to npm'),
    );

    const script = step.run ?? '';
    expect(script).toContain('npm view');
    expect(script).toContain('git ls-remote --tags origin');
    expect(script).toContain('gh release view');
    expect(script).toContain('--verify-tag');
    expect(script).toContain('--latest=false');
    expect(script).toMatch(/--to "\$\{tag\}"/);
    expect(script).toMatch(/--tag-prefix "\$\{name\}@"/);

    // Release check is a sibling of the tag check, not nested inside it.
    const tagBlockStart = script.indexOf('git ls-remote --tags origin');
    const tagBlockEnd = script.indexOf('\n  fi\n', tagBlockStart);
    expect(tagBlockEnd).toBeGreaterThan(tagBlockStart);
    expect(script.indexOf('gh release view')).toBeGreaterThan(tagBlockEnd);
    expect(script.indexOf('gh release create')).toBeGreaterThan(tagBlockEnd);
  });

  test('waits for npm propagation after successful Pi publish and fails on timeout', () => {
    const step = byName('Reconcile Pi releases');
    expect(step.env?.PI_PUBLISH_OUTCOME).toBe(
      `\${{ steps.pi-publish.outcome }}`,
    );

    const script = step.run ?? '';
    expect(script).toContain('set -uo pipefail');
    expect(script).toContain(
      `publish_deadline=$((SECONDS + \${PI_PUBLISH_WAIT_SECONDS:-300}))`,
    );
    expect(script).toContain(
      `npm view "\${name}@\${version}" version --prefer-online --fetch-retries=0 --fetch-timeout=10000`,
    );
    expect(script).toContain('[ "$PI_PUBLISH_OUTCOME" != "success" ]');
    expect(script).toContain('[ "$remaining" -le 0 ]');
    expect(script).toContain('sleep "$sleep_seconds"');
    expect(script).toMatch(
      /if \[ "\$PI_PUBLISH_OUTCOME" = "success" \]; then\s+echo "Timed out[^\n]+\n\s+failed=1/,
    );
    expect(script).toContain(`Skipping \${tag}: not published to npm.`);
  });

  test.skipIf(!hasGnuTimeout)(
    'terminates a hung npm process even when it ignores SIGTERM without polling later packages',
    () => {
      const result = runReconcile({
        waitSeconds: 1,
        npmScript:
          'trap "" TERM\necho npm-ready >> "$TRACE"\nexec "$REAL_SLEEP" 6',
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      // SIGKILL status proves timeout escalation, independent of host scheduling.
      expect(result.clockSeconds).toBe(1);
      expect(result.stdout.match(/Timed out waiting for/g)).toHaveLength(9);
      expect(result.trace).toContain('npm-ready');
      expect(result.trace).toContain('timeout-status 137');
      expect(
        result.trace.filter((line) => line.startsWith('npm ')),
      ).toHaveLength(1);
      expect(result.trace.some((line) => line.startsWith('gh '))).toBe(false);
    },
    30000,
  );

  test.skipIf(!hasGnuTimeout)(
    'shares one deadline across nine missing packages and clamps propagation sleeps',
    () => {
      const result = runReconcile({ npmScript: 'exit 1' });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.clockSeconds).toBe(2);
      expect(result.stdout.match(/Timed out waiting for/g)).toHaveLength(9);
      const npmCalls = result.trace.filter((line) => line.startsWith('npm '));
      // Once the budget expires, no registry checks start for later packages.
      expect(new Set(npmCalls.map((line) => line.split(' ')[2])).size).toBe(1);
      const sleeps = result.trace.filter((line) => line.startsWith('sleep '));
      // The single clamped sleep spends the entire shared budget, not nine budgets.
      expect(sleeps).toEqual(['sleep 2']);
      for (const sleep of sleeps) {
        expect(Number(sleep.split(' ')[1])).toBeLessThanOrEqual(2);
      }
    },
    30000,
  );

  test.skipIf(!hasGnuTimeout).each(['failure', 'cancelled', 'skipped'])(
    'checks each package once with process timeouts and never sleeps after a %s Pi publish',
    (outcome) => {
      const result = runReconcile({
        npmScript: 'exit 1',
        outcome,
        waitSeconds: 0,
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stdout.match(/Skipping /g)).toHaveLength(9);
      expect(
        result.trace.filter((line) => line.startsWith('npm ')),
      ).toHaveLength(9);
      expect(
        result.trace.filter((line) => line.startsWith('timeout ')),
      ).toHaveLength(9);
      expect(result.trace.some((line) => line.startsWith('sleep '))).toBe(
        false,
      );
      expect(result.trace.some((line) => line.startsWith('gh '))).toBe(false);
    },
  );

  test('root notes exclude Pi packages and package tags', () => {
    const run = byName('Generate release notes').run ?? '';
    expect(run).toContain('--exclude-path pi-packages');
    expect(run).toContain("--package-tags '@thoth-agents/*@*'");
  });

  test('uses OIDC without npm token secrets', () => {
    expect(raw).not.toContain('NPM_TOKEN');
    expect(raw).not.toContain('NODE_AUTH_TOKEN');
    expect(raw).toContain('id-token: write');
  });
});
