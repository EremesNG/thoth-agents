#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') options.json = true;
    else if (argument === '--constitution') {
      options.constitution = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!options.constitution) throw new Error('--constitution is required');
  return options;
}

function issue(code, message) {
  return { code, message };
}

function metadata(content, name) {
  return new RegExp(`^\\*\\*${name}\\*\\*:\\s*([^<\\n]+)`, 'im')
    .exec(content)?.[1]
    .trim();
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

function validate(content) {
  const errors = [];
  if (
    /\bYYYY-MM-DD\b|\[[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\]|TODO\([A-Z0-9_]+\)/.test(
      content,
    )
  ) {
    errors.push(
      issue(
        'CONSTITUTION-PLACEHOLDER',
        'Resolve every template placeholder and deferred TODO before adoption.',
      ),
    );
  }

  const version = metadata(content, 'Version');
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
    errors.push(
      issue(
        'CONSTITUTION-VERSION',
        'Version must be a complete MAJOR.MINOR.PATCH value.',
      ),
    );
  }

  const ratified = metadata(content, 'Ratified');
  const lastAmended = metadata(content, 'Last amended');
  if (!isIsoDate(ratified) || !isIsoDate(lastAmended)) {
    errors.push(
      issue(
        'CONSTITUTION-DATE',
        'Ratified and Last amended must be real ISO dates in YYYY-MM-DD format.',
      ),
    );
  } else if (lastAmended < ratified) {
    errors.push(
      issue(
        'CONSTITUTION-DATE-ORDER',
        'Last amended cannot precede the ratification date.',
      ),
    );
  }

  const report = /^\s*<!--([\s\S]*?)-->/.exec(content)?.[1];
  const requiredImpactFields = [
    'Version change',
    'Modified principles',
    'Added sections',
    'Removed sections',
    'Templates',
    'Follow-up TODOs',
  ];
  if (
    !report?.includes('Sync Impact Report') ||
    requiredImpactFields.some(
      (field) => !new RegExp(`^- ${field}:\\s*\\S`, 'im').test(report),
    )
  ) {
    errors.push(
      issue(
        'CONSTITUTION-SYNC-IMPACT',
        'Prepend a complete Sync Impact Report describing the amendment propagation.',
      ),
    );
  }
  if (
    version &&
    report &&
    !new RegExp(
      `^- Version change:\\s*.+?(?:->|→)\\s*${version.replaceAll('.', '\\.')}(?:\\s|$)`,
      'im',
    ).test(report)
  ) {
    errors.push(
      issue(
        'CONSTITUTION-SYNC-VERSION',
        'The Sync Impact Report version transition must end at the adopted version.',
      ),
    );
  }

  const governance = /^##\s+Governance\s*$([\s\S]*)/im.exec(content)?.[1];
  if (
    !governance ||
    !['MAJOR', 'MINOR', 'PATCH'].every((term) =>
      new RegExp(`\\b${term}\\b`).test(governance),
    )
  ) {
    errors.push(
      issue(
        'CONSTITUTION-SEMVER-POLICY',
        'Governance must define explicit MAJOR, MINOR, and PATCH amendment semantics.',
      ),
    );
  }

  if (!/^##\s+(?:Core )?Principles\s*$/im.test(content)) {
    errors.push(
      issue(
        'CONSTITUTION-PRINCIPLES',
        'Define an explicit Principles section with active project rules.',
      ),
    );
  }

  return { valid: errors.length === 0, version, errors };
}

try {
  const options = parseArgs(process.argv.slice(2));
  const path = resolve(options.constitution);
  if (!existsSync(path)) throw new Error(`Constitution not found: ${path}`);
  const result = validate(readFileSync(path, 'utf8'));
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else if (result.valid) {
    process.stdout.write(`Constitution ${result.version} is valid.\n`);
  } else {
    process.stderr.write(
      `${result.errors.map((error) => `${error.code}: ${error.message}`).join('\n')}\n`,
    );
  }
  if (!result.valid) process.exitCode = 1;
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 2;
}
