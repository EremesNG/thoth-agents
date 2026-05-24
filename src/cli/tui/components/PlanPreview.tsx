import { Box, Text } from 'ink';
import type { OperationApplyResult, OperationPlan } from '../../operations';
import { theme } from '../theme';
import { PathLine } from './PathLine';

interface PlanPreviewProps {
  plan: OperationPlan;
  selectedAction: 'apply' | 'cancel';
  result?: OperationApplyResult;
}

export function PlanPreview({
  plan,
  selectedAction,
  result,
}: PlanPreviewProps) {
  return (
    <Box flexDirection="column">
      <Text bold>{plan.title}</Text>
      <Text>{plan.summary}</Text>
      <Text>
        Target harness: <Text color={theme.accent}>{plan.harness}</Text>
      </Text>
      <Text>Action: {plan.action}</Text>
      <Text>Can apply: {plan.canApply ? 'yes' : 'no'}</Text>
      {plan.surfaces.length > 0 ? (
        <Text color={theme.dim}>Managed surfaces</Text>
      ) : null}
      {plan.surfaces.map((surface) => (
        <Box key={surface.id} flexDirection="column">
          <Text>- {surface.label}</Text>
          {surface.path ? <PathLine value={surface.path} /> : null}
        </Box>
      ))}
      <Text color={theme.dim}>
        Backup: {plan.backup.required ? 'required' : 'not required'} (
        {plan.backup.strategy})
      </Text>
      {plan.backup.destinations?.map((path) => (
        <PathLine key={path.path} label={path.label} value={path.path} />
      ))}
      {plan.items.length > 0 ? <Text color={theme.dim}>Preview</Text> : null}
      {plan.items.slice(0, 5).map((item) => (
        <Box key={item.title} flexDirection="column">
          <Text>- {item.title}</Text>
          {item.target.path ? <PathLine value={item.target.path} /> : null}
          {item.preview ? (
            <Text color={theme.dim}>
              {item.preview.length > 120
                ? `${item.preview.slice(0, 120)}...`
                : item.preview}
            </Text>
          ) : null}
        </Box>
      ))}
      {plan.items.length > 5 ? (
        <Text color={theme.dim}>...{plan.items.length - 5} more items</Text>
      ) : null}
      {plan.warnings.map((warning) => (
        <Text key={warning.code ?? warning.message} color={theme.warning}>
          - [{warning.severity}] {warning.message}
        </Text>
      ))}
      {plan.disclaimers.map((disclaimer) => (
        <Text key={disclaimer.code ?? disclaimer.message} color={theme.dim}>
          - {disclaimer.message}
        </Text>
      ))}
      <Box marginTop={1}>
        <Text color={selectedAction === 'apply' ? theme.accent : undefined}>
          [Apply]
        </Text>
        <Text> </Text>
        <Text color={selectedAction === 'cancel' ? theme.accent : undefined}>
          [Cancel]
        </Text>
      </Box>
      <Text color={theme.dim}>Enter selects. a applies. c cancels.</Text>
      {result ? (
        <Text color={result.applied ? theme.ok : theme.warning}>
          {result.summary}
        </Text>
      ) : null}
    </Box>
  );
}
