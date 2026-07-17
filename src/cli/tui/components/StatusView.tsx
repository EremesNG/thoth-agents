import { Box, Text } from 'ink';
import type {
  HarnessStatusReport,
  ManagedState,
  ManagedTarget,
} from '../../operations';
import { stateColor, theme } from '../theme';

export type StatusSection = 'targets' | 'warnings' | 'disclaimers';

interface StatusViewProps {
  report: HarnessStatusReport;
}

function countByState(
  report: HarnessStatusReport,
): Partial<Record<ManagedState, number>> {
  return report.targets.reduce<Partial<Record<ManagedState, number>>>(
    (counts, target) => {
      const state = target.state ?? 'unknown';
      counts[state] = (counts[state] ?? 0) + 1;
      return counts;
    },
    {},
  );
}

interface CategorizedTarget {
  category: string;
  label: string;
  state: ManagedState | undefined;
  detail?: string;
}

const categoryOrder = [
  'Agents',
  'Skills',
  'Plugin/MCP',
  'Marketplace',
  'Config',
  'Root instructions',
  'Model state',
  'Other',
];

function titleCasePart(part: string): string {
  const normalized = part.toLowerCase();
  switch (normalized) {
    case 'sdd':
      return 'SDD';
    case 'cli':
      return 'CLI';
    case 'mcp':
      return 'MCP';
    case 'opencode':
      return 'OpenCode';
    default:
      return `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`;
  }
}

function titleCase(value: string, separator = ' '): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(titleCasePart)
    .join(separator);
}

function compactPath(path: string): string {
  return path.replaceAll('\\', '/');
}

function categorizeTarget(target: ManagedTarget): CategorizedTarget {
  const path = target.path ? compactPath(target.path) : '';
  const label = target.label ?? target.kind;
  const detail = target.state !== 'installed' ? target.observed : undefined;
  const agent = path.match(/thoth-agents-([a-z0-9_-]+)\.toml$/i);
  const skill = path.match(/skills\/([^/]+)\/SKILL\.md$/i);

  if (agent?.[1]) {
    return {
      category: 'Agents',
      label: titleCase(agent[1]),
      state: target.state,
      detail,
    };
  }

  if (skill?.[1] || target.kind === 'skill') {
    return {
      category: 'Skills',
      label: skill?.[1] ? titleCase(skill[1], '-') : label,
      state: target.state,
      detail,
    };
  }

  if (/marketplace\.json$/i.test(path)) {
    return {
      category: 'Marketplace',
      label: 'Marketplace',
      state: target.state,
      detail,
    };
  }

  if (
    /\.mcp\.json$/i.test(path) ||
    /plugin\.json$/i.test(path) ||
    /plugin-assets/i.test(path) ||
    /manifest/i.test(path)
  ) {
    return {
      category: 'Plugin/MCP',
      label: titleCase(label.replace(/^codex\s+/i, '')),
      state: target.state,
      detail,
    };
  }

  if (/AGENTS\.md$/i.test(path) || /root instructions/i.test(label)) {
    return {
      category: 'Root instructions',
      label: 'AGENTS.md',
      state: target.state,
      detail,
    };
  }

  if (/config\.toml$/i.test(path) || target.kind === 'config') {
    return {
      category: 'Config',
      label: titleCase(label),
      state: target.state,
      detail,
    };
  }

  if (target.kind === 'memory-state' || /model/i.test(label)) {
    return {
      category: 'Model state',
      label: titleCase(label),
      state: target.state,
      detail: target.observed,
    };
  }

  return {
    category: 'Other',
    label: titleCase(label),
    state: target.state,
    detail: target.observed,
  };
}

function groupedTargets(
  report: HarnessStatusReport,
): Map<string, CategorizedTarget[]> {
  const grouped = new Map<string, CategorizedTarget[]>();
  for (const target of report.targets.map(categorizeTarget)) {
    grouped.set(target.category, [
      ...(grouped.get(target.category) ?? []),
      target,
    ]);
  }
  return grouped;
}

function uniqueTargets(
  targets: readonly CategorizedTarget[],
): CategorizedTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.label}:${target.state ?? 'unknown'}:${target.detail ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function StatusView({ report }: StatusViewProps) {
  const counts = countByState(report);
  const countText = Object.entries(counts)
    .map(([state, count]) => `${state}: ${count}`)
    .join('  ');
  const grouped = groupedTargets(report);
  const warnings = report.diagnostics.slice(0, 4);
  const hiddenWarnings = report.diagnostics.length - warnings.length;
  const notes = (report.disclaimers ?? []).slice(0, 2);
  const hiddenNotes = (report.disclaimers?.length ?? 0) - notes.length;

  return (
    <Box flexDirection="column">
      <Text>
        State: <Text color={stateColor(report.state)}>{report.state}</Text>
      </Text>
      <Text>{report.summary}</Text>
      <Text color={theme.dim}>{countText || 'No managed targets.'}</Text>
      <Text color={theme.dim}>
        Warnings: {report.diagnostics.length} Notes:{' '}
        {report.disclaimers?.length ?? 0}
      </Text>
      {categoryOrder.map((category) => {
        const targets = uniqueTargets(grouped.get(category) ?? []);
        if (targets.length === 0) return null;
        const visible = targets.slice(0, 6);
        const hidden = targets.length - visible.length;
        return (
          <Box key={category} flexDirection="column">
            <Text color={theme.accent}>{category}</Text>
            {visible.map((target) => (
              <Text key={`${category}-${target.label}-${target.state}`}>
                - {target.label}
                {target.state ? (
                  <Text color={stateColor(target.state)}>
                    : [{target.state}]
                  </Text>
                ) : null}
                {target.detail ? (
                  <Text color={theme.dim}> - {target.detail}</Text>
                ) : null}
              </Text>
            ))}
            {hidden > 0 ? <Text color={theme.dim}> +{hidden} more</Text> : null}
          </Box>
        );
      })}
      {report.diagnostics.length > 0 ? (
        <Box flexDirection="column">
          <Text color={theme.warning}>Warnings</Text>
          {warnings.map((warning) => (
            <Text key={warning.code ?? warning.message} color={theme.warning}>
              - [{warning.severity}]{warning.code ? ` [${warning.code}]` : ''}{' '}
              {warning.message}
            </Text>
          ))}
          {hiddenWarnings > 0 ? (
            <Text color={theme.dim}> +{hiddenWarnings} more warnings</Text>
          ) : null}
        </Box>
      ) : null}
      {notes.length > 0 ? (
        <Box flexDirection="column">
          <Text color={theme.dim}>Notes</Text>
          {notes.map((note) => (
            <Text key={note.code ?? note.message} color={theme.dim}>
              - {note.message}
            </Text>
          ))}
          {hiddenNotes > 0 ? (
            <Text color={theme.dim}> +{hiddenNotes} more notes</Text>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
