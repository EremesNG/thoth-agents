import { Box, Text } from 'ink';
import type { HarnessId } from '../../../harness/types';
import type { ModelRoleInput } from '../../operations';
import { theme } from '../theme';

const CODEX_MODEL_CATALOG_NOTE = [
  'This list may not include every available model.',
  'Official Codex model list: https://developers.openai.com/codex/models',
];

export interface ModelRoleView extends ModelRoleInput {
  currentModel: string;
  dirty: boolean;
}

interface ModelScreenProps {
  harness: HarnessId;
  roles: ModelRoleView[];
  selected: number;
  actions: readonly string[];
}

export function ModelScreen({
  harness,
  roles,
  selected,
  actions,
}: ModelScreenProps) {
  return (
    <Box flexDirection="column">
      <Text color={theme.dim}>
        {harness === 'codex'
          ? 'Codex writes generated subagent model lines only.'
          : harness === 'claude'
            ? 'Claude Code writes subagent frontmatter model lines (sonnet, opus, haiku, inherit).'
            : 'OpenCode writes role model overrides in thoth-agents config.'}
      </Text>
      {harness === 'codex'
        ? CODEX_MODEL_CATALOG_NOTE.map((note) => (
            <Text key={note} color={theme.dim}>
              {note}
            </Text>
          ))
        : null}
      {roles.map((role, index) => (
        <Text
          key={role.role}
          color={index === selected ? theme.accent : undefined}
        >
          {index === selected ? '>' : ' '} {role.dirty ? '*' : ' '}
          {role.role}: {role.model}
          <Text color={theme.dim}>
            {role.dirty ? ` (was ${role.currentModel})` : ''}
          </Text>
        </Text>
      ))}
      {actions.map((action, offset) => {
        const index = roles.length + offset;
        return (
          <Text
            key={action}
            color={index === selected ? theme.accent : undefined}
          >
            {index === selected ? '>' : ' '} {action}
          </Text>
        );
      })}
    </Box>
  );
}
