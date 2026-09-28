export const CAPABILITY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseRequirementDelta(metadata) {
  if (metadata === 'INTERNAL') return { operation: 'INTERNAL' };

  const change = /^(ADDED|MODIFIED|REMOVED)\s+(\S+)$/.exec(metadata);
  if (change && CAPABILITY_PATTERN.test(change[2])) {
    return { operation: change[1], capability: change[2] };
  }

  const rename = /^RENAMED\s+(\S+)\s+FROM\s+(.+)$/.exec(metadata);
  if (
    rename &&
    CAPABILITY_PATTERN.test(rename[1]) &&
    rename[2].trim().length > 0
  ) {
    return {
      operation: 'RENAMED',
      capability: rename[1],
      previousTitle: rename[2].trim(),
    };
  }

  return undefined;
}

export function parseCanonicalSpec(content) {
  const candidates = [...content.matchAll(/^### Requirement:[^\r\n]*$/gm)];
  const headings = [
    ...content.matchAll(/^### Requirement:[ \t]+(\S(?:[^\r\n]*?\S)?)[ \t]*$/gm),
  ];
  if (candidates.length !== headings.length) {
    throw new Error(
      'Canonical specification contains a malformed Requirement heading',
    );
  }
  const requirements = new Map();
  const prefix =
    headings.length === 0
      ? content.trimEnd()
      : content.slice(0, headings[0].index).trimEnd();

  for (const [index, heading] of headings.entries()) {
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? content.length;
    const title = heading[1].trim();
    if (requirements.has(title)) {
      throw new Error(`Canonical specification repeats requirement: ${title}`);
    }
    requirements.set(title, content.slice(start, end).trim());
  }

  return { prefix, requirements };
}

function issue(code, capability, title, message) {
  return { code, capability, title, message };
}

export function preflightRequirementDeltas({
  capability,
  present,
  requirements,
  deltas,
}) {
  const initialTitles = [...requirements.keys()];
  const titles = new Set(initialTitles);
  const errors = [];
  const warnings = [];

  for (const delta of deltas) {
    if (delta.operation === 'ADDED') {
      if (titles.has(delta.title)) {
        errors.push(
          issue(
            'SDD-SPEC-DELTA-ADDED-EXISTS',
            capability,
            delta.title,
            `${capability} already contains requirement: ${delta.title}`,
          ),
        );
        continue;
      }
      if (present && initialTitles.length > 0) {
        warnings.push(
          issue(
            'SDD-SPEC-DELTA-ADDED-REVIEW',
            capability,
            delta.title,
            `${capability} already contains canonical requirements; confirm ${delta.title} does not overlap: ${initialTitles.join(', ')}`,
          ),
        );
      }
      titles.add(delta.title);
      continue;
    }

    if (!present) {
      const code =
        delta.operation === 'RENAMED'
          ? 'SDD-SPEC-DELTA-RENAMED-SOURCE-MISSING'
          : `SDD-SPEC-DELTA-${delta.operation}-MISSING`;
      errors.push(
        issue(
          code,
          capability,
          delta.title,
          `${capability} has no canonical specification for ${delta.operation}: ${delta.title}`,
        ),
      );
      continue;
    }

    if (delta.operation === 'RENAMED') {
      if (!titles.has(delta.previousTitle)) {
        errors.push(
          issue(
            'SDD-SPEC-DELTA-RENAMED-SOURCE-MISSING',
            capability,
            delta.title,
            `${capability} does not contain requirement: ${delta.previousTitle}`,
          ),
        );
        continue;
      }
      if (delta.previousTitle !== delta.title && titles.has(delta.title)) {
        errors.push(
          issue(
            'SDD-SPEC-DELTA-RENAMED-TARGET-EXISTS',
            capability,
            delta.title,
            `${capability} already contains requirement: ${delta.title}`,
          ),
        );
        continue;
      }
      titles.delete(delta.previousTitle);
      titles.add(delta.title);
      continue;
    }

    if (!titles.has(delta.title)) {
      errors.push(
        issue(
          `SDD-SPEC-DELTA-${delta.operation}-MISSING`,
          capability,
          delta.title,
          `${capability} does not contain requirement: ${delta.title}`,
        ),
      );
      continue;
    }

    if (delta.operation === 'REMOVED') titles.delete(delta.title);
  }

  return { errors, warnings, titles };
}
