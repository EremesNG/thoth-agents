import { Box, Text } from 'ink';
import type { ModelOption } from '../model-catalog';
import { theme } from '../theme';

const VISIBLE_MODEL_OPTIONS = 8;

interface ModelChoiceScreenProps {
  currentModel: string;
  draftModel: string;
  options: readonly ModelOption[];
  selected: number;
}

function modelWindowStart(optionsLength: number, selected: number): number {
  const maxStart = Math.max(0, optionsLength - VISIBLE_MODEL_OPTIONS);
  if (selected >= optionsLength) return maxStart;
  return Math.min(Math.max(0, selected - VISIBLE_MODEL_OPTIONS + 1), maxStart);
}

export function ModelChoiceScreen({
  currentModel,
  draftModel,
  options,
  selected,
}: ModelChoiceScreenProps) {
  const windowStart = modelWindowStart(options.length, selected);
  const visibleOptions = options.slice(
    windowStart,
    windowStart + VISIBLE_MODEL_OPTIONS,
  );
  const windowEnd = windowStart + visibleOptions.length;
  const hasHiddenBefore = windowStart > 0;
  const hasHiddenAfter = windowEnd < options.length;

  return (
    <Box flexDirection="column">
      <Text>
        Current: <Text color={theme.accent}>{currentModel}</Text>
      </Text>
      <Text>
        New: <Text color={theme.warning}>{draftModel}</Text>
      </Text>
      {hasHiddenBefore ? (
        <Text color={theme.dim}> ... {windowStart} earlier option(s)</Text>
      ) : null}
      {visibleOptions.map((option, offset) => {
        const index = windowStart + offset;
        return (
          <Text
            key={option.id}
            color={index === selected ? theme.accent : undefined}
          >
            {index === selected ? '>' : ' '} {option.id}
            <Text color={theme.dim}> - {option.provider}</Text>
          </Text>
        );
      })}
      {hasHiddenAfter ? (
        <Text color={theme.dim}>
          {' '}
          ... {options.length - windowEnd} later option(s)
        </Text>
      ) : null}
      <Text color={options.length === selected ? theme.accent : undefined}>
        {options.length === selected ? '>' : ' '} Manual entry
      </Text>
      {options.length > VISIBLE_MODEL_OPTIONS ? (
        <Text color={theme.dim}>
          Showing {windowStart + 1}-{windowEnd} of {options.length}. Use j/k to
          move through all options; Manual entry follows the catalog.
        </Text>
      ) : null}
    </Box>
  );
}
