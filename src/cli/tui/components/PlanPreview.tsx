import { Box, Text } from 'ink';
import type { ProviderCapabilityEvidence } from '../../../harness/types';
import type {
  ManagedTarget,
  OperationApplyResult,
  OperationPlan,
  OperationWarning,
} from '../../operations';
import { theme } from '../theme';
import { PathLine } from './PathLine';
import { ProviderCapabilityView } from './StatusView';

interface PlanPreviewProps {
  plan: OperationPlan;
  selectedAction: 'apply' | 'cancel';
  result?: OperationApplyResult;
}

function targetText(target: ManagedTarget): string {
  const label = target.label ?? target.path ?? target.kind;
  const state = target.state ? `: [${target.state}]` : '';
  const observed = target.observed ? ` - ${target.observed}` : '';
  return `${label}${state}${observed}`;
}

function warningText(warning: OperationWarning): string {
  return `[${warning.severity}]${warning.code ? ` [${warning.code}]` : ''} ${warning.message}`;
}

function providerEvidenceFor(
  value: OperationPlan | OperationApplyResult,
): ProviderCapabilityEvidence | undefined {
  return (value as { providerCapability?: ProviderCapabilityEvidence })
    .providerCapability;
}

export function PlanPreview({
  plan,
  selectedAction,
  result,
}: PlanPreviewProps) {
  const blockerTargets = plan.blockerTargets ?? [];
  const providerEvidence = providerEvidenceFor(result ?? plan);
  return (
    <Box flexDirection="column">
      <Text bold>{plan.title}</Text>
      <Text>{plan.summary}</Text>
      <Text color={theme.accent}>Consumer operation</Text>
      <Text>
        Target harness: <Text color={theme.accent}>{plan.harness}</Text>
      </Text>
      <Text>Managed action: {plan.action}</Text>
      <Text>Can apply: {plan.canApply ? 'yes' : 'no'}</Text>
      {providerEvidence ? (
        <ProviderCapabilityView evidence={providerEvidence} />
      ) : null}
      {!plan.canApply && blockerTargets.length > 0 ? (
        <Box flexDirection="column">
          <Text color={theme.warning}>Blocker targets</Text>
          {blockerTargets.map((target, index) => (
            <Text
              key={`${target.label ?? target.path ?? target.kind}-${index}`}
            >
              - {targetText(target)}
            </Text>
          ))}
        </Box>
      ) : null}
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
          - {warningText(warning)}
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
        <Box flexDirection="column">
          <Text color={result.applied ? theme.ok : theme.warning}>
            Consumer result: {result.summary}
          </Text>
          {!result.applied &&
          ((result.diagnosticTargets?.length ?? 0) > 0 ||
            result.warnings.length > 0) ? (
            <Box flexDirection="column">
              <Text color={theme.warning}>Apply diagnostics</Text>
              {result.diagnosticTargets?.map((target, index) => (
                <Text
                  key={`${target.label ?? target.path ?? target.kind}-${index}`}
                >
                  - {targetText(target)}
                </Text>
              ))}
              {result.warnings.map((warning) => (
                <Text
                  key={warning.code ?? warning.message}
                  color={theme.warning}
                >
                  - {warningText(warning)}
                </Text>
              ))}
            </Box>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
