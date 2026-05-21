export const ARTIFACT_GOVERNANCE_SEVERITIES = [
  'error',
  'warning',
  'info',
] as const;

export type ArtifactGovernanceSeverity =
  (typeof ARTIFACT_GOVERNANCE_SEVERITIES)[number];

export const ARTIFACT_GOVERNANCE_MODES = [
  'none',
  'thoth-mem',
  'openspec',
  'hybrid',
] as const;

export type ArtifactGovernanceMode = (typeof ARTIFACT_GOVERNANCE_MODES)[number];

export const ARTIFACT_GOVERNANCE_ENFORCEMENT_MODES = ['report-only'] as const;

export type ArtifactGovernanceEnforcementMode =
  (typeof ARTIFACT_GOVERNANCE_ENFORCEMENT_MODES)[number];

export type ArtifactGovernanceMetadataValue = string | number | boolean | null;

export interface ArtifactGovernanceFinding {
  code: string;
  severity: ArtifactGovernanceSeverity;
  message: string;
  path?: string;
  line?: number;
  column?: number;
  detail?: string;
  source?: string;
  metadata?: Readonly<Record<string, ArtifactGovernanceMetadataValue>>;
}

export interface ArtifactGovernanceSummary {
  total: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  highestSeverity: ArtifactGovernanceSeverity | null;
}

export interface ArtifactGovernanceReport {
  mode: ArtifactGovernanceMode;
  enforcementMode: ArtifactGovernanceEnforcementMode;
  findings: readonly ArtifactGovernanceFinding[];
  summary: ArtifactGovernanceSummary;
  valid: boolean;
  shouldBlock: boolean;
}

export interface ArtifactGovernanceResult extends ArtifactGovernanceReport {
  validator: string;
  artifact: string;
  report: ArtifactGovernanceReport;
}

export interface CreateArtifactGovernanceReportOptions {
  mode?: ArtifactGovernanceMode;
  enforcementMode?: ArtifactGovernanceEnforcementMode;
  findings?: readonly ArtifactGovernanceFinding[];
}

export interface CreateArtifactGovernanceResultOptions
  extends CreateArtifactGovernanceReportOptions {
  validator: string;
  artifact: string;
}

const SEVERITY_PRIORITY: Record<ArtifactGovernanceSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export function isArtifactGovernanceSeverity(
  value: string,
): value is ArtifactGovernanceSeverity {
  return ARTIFACT_GOVERNANCE_SEVERITIES.includes(
    value as ArtifactGovernanceSeverity,
  );
}

export function getHighestArtifactGovernanceSeverity(
  findings: readonly ArtifactGovernanceFinding[],
): ArtifactGovernanceSeverity | null {
  let highestSeverity: ArtifactGovernanceSeverity | null = null;

  for (const finding of findings) {
    if (
      highestSeverity === null ||
      SEVERITY_PRIORITY[finding.severity] < SEVERITY_PRIORITY[highestSeverity]
    ) {
      highestSeverity = finding.severity;
    }
  }

  return highestSeverity;
}

export function summarizeArtifactGovernanceFindings(
  findings: readonly ArtifactGovernanceFinding[],
): ArtifactGovernanceSummary {
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  for (const finding of findings) {
    switch (finding.severity) {
      case 'error':
        errorCount += 1;
        break;
      case 'warning':
        warningCount += 1;
        break;
      case 'info':
        infoCount += 1;
        break;
    }
  }

  return {
    total: findings.length,
    errorCount,
    warningCount,
    infoCount,
    highestSeverity: getHighestArtifactGovernanceSeverity(findings),
  };
}

export function createArtifactGovernanceReport(
  options: CreateArtifactGovernanceReportOptions = {},
): ArtifactGovernanceReport {
  const findings = [...(options.findings ?? [])];
  const summary = summarizeArtifactGovernanceFindings(findings);

  return {
    mode: options.mode ?? 'none',
    enforcementMode: options.enforcementMode ?? 'report-only',
    findings,
    summary,
    valid: summary.errorCount === 0,
    shouldBlock: false,
  };
}

export function createArtifactGovernanceResult(
  options: CreateArtifactGovernanceResultOptions,
): ArtifactGovernanceResult {
  const report = createArtifactGovernanceReport(options);

  return {
    validator: options.validator,
    artifact: options.artifact,
    mode: report.mode,
    enforcementMode: report.enforcementMode,
    findings: report.findings,
    summary: report.summary,
    valid: report.valid,
    shouldBlock: report.shouldBlock,
    report,
  };
}
