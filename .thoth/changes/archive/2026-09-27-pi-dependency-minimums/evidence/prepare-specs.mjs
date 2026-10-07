import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const root = '.thoth/changes/pi-dependency-minimums/evidence';
const digest = (text) => createHash('sha256').update(text).digest('hex');
const updates = [];
for (const capability of ['cli-installation', 'multi-harness-agent-pack']) {
  const target = `.thoth/specs/${capability}/spec.md`;
  const original = readFileSync(target, 'utf8');
  let content = original
    .replaceAll('Pi `0.84.4`', 'Pi `0.86.1`')
    .replaceAll(
      'references external runtimes by pinned package source',
      'references external runtimes by minimum-only package ranges',
    );
  if (capability === 'cli-installation') {
    content = content
      .replace(
        'install and verify pinned Context7, pi-web-access, and the grep-only pi-mcp-adapter',
        'install and verify minimum-constrained Context7, pi-web-access, and the grep-only pi-mcp-adapter',
      )
      .replaceAll(
        'the exact selected pi-web-access pin is required',
        'the selected minimum-only pi-web-access range is required',
      )
      .replace(
        '### Requirement: Install pinned Pi interaction and web extensions',
        '### Requirement: Install minimum-constrained Pi interaction and web extensions',
      )
      .replace(
        'the selected exact pi-web-access version plus @juicesharp/rpiv-ask-user-question@2.9.0 and @juicesharp/rpiv-todo@2.9.0',
        'pi-web-access@>=0.27.0 plus @juicesharp/rpiv-ask-user-question@>=2.9.0 and @juicesharp/rpiv-todo@>=2.9.0',
      );
    content += `
### Requirement: Allow independent external Pi dependency updates

The six mandatory external dependencies MUST use native minimum-only sources: pi-subagents@>=0.71.0, @upstash/context7-pi@>=0.1.2, pi-web-access@>=0.27.0, pi-mcp-adapter@>=2.32.1, @juicesharp/rpiv-ask-user-question@>=2.9.0, and @juicesharp/rpiv-todo@>=2.9.0. Native Pi updates MUST NOT require a new Thoth release. First-party Thoth installation and receipts MUST retain their exact-version policy. These floors permit future stable major releases without asserting runtime compatibility with every future release.

Installation and status MUST validate the resolved installed manifest's package name and stable SemVer floor, not infer the installed version from the configured source. Missing, malformed, older, prerelease, ambiguous, or project-shadowed package evidence MUST NOT claim global dependency readiness. Install and Update MUST migrate legacy exact sources through native Pi package handling, preserving object-form resource filters and unrelated settings. A satisfying installed managed range MUST NOT be reinstalled merely to enforce its minimum. If a native migration is observed to downgrade a previously satisfying installation, setup MUST fail and attempt restoration; successful restoration MUST be claimed only after fresh native listing and installed-manifest evidence confirms the prior version. Failed or unverifiable recovery MUST expose manual guidance and MUST NOT record complete installation.

#### Scenario: Update an extension without a Thoth release

- **GIVEN** the RPIV question dependency is configured as npm:@juicesharp/rpiv-ask-user-question@>=2.9.0
- **WHEN** native Pi updates it to stable version 2.11.0
- **THEN** Thoth status accepts its manifest version without requiring a Thoth release or replacing it with 2.9.0

#### Scenario: Migrate a filtered legacy pin

- **GIVEN** a global dependency has an exact source and resource filters
- **WHEN** Install or applied Update migrates it to the managed minimum-only range
- **THEN** resource filters and unrelated settings survive, and a previously satisfying newer version is not silently downgraded

#### Scenario: Reject an unverified restore

- **GIVEN** native migration downgraded a satisfying package and restoration exits successfully without restoring its prior manifest version
- **WHEN** setup verifies recovery
- **THEN** it reports failed or unverifiable recovery with manual guidance rather than claiming restoration succeeded
`;
  }
  const source = `${root}/${capability}-spec.md`;
  writeFileSync(source, content);
  updates.push({
    operation: 'replace',
    capability,
    source,
    expectedDigest: digest(original),
    sourceDigest: digest(content),
  });
}
console.log(JSON.stringify(updates, null, 2));
