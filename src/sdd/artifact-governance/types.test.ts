import { describe, expect, test } from 'bun:test';
import {
  ARTIFACT_GOVERNANCE_ENFORCEMENT_MODES,
  ARTIFACT_GOVERNANCE_MODES,
  ARTIFACT_GOVERNANCE_SEVERITIES,
  createArtifactGovernanceReport,
  createArtifactGovernanceResult,
  getHighestArtifactGovernanceSeverity,
  isArtifactGovernanceSeverity,
  summarizeArtifactGovernanceFindings,
} from './index';

describe('artifact governance domain contract', () => {
  test('keeps severity runtime values aligned with the domain type', () => {
    expect(ARTIFACT_GOVERNANCE_SEVERITIES).toEqual([
      'error',
      'warning',
      'info',
    ]);
    expect(isArtifactGovernanceSeverity('error')).toBe(true);
    expect(isArtifactGovernanceSeverity('warning')).toBe(true);
    expect(isArtifactGovernanceSeverity('info')).toBe(true);
    expect(isArtifactGovernanceSeverity('fatal')).toBe(false);
  });

  test('defines the supported artifact governance modes and report-only checkpoint', () => {
    expect(ARTIFACT_GOVERNANCE_MODES).toEqual([
      'none',
      'thoth-mem',
      'openspec',
      'hybrid',
    ]);
    expect(ARTIFACT_GOVERNANCE_ENFORCEMENT_MODES).toEqual(['report-only']);
  });

  test('normalizes report defaults and summary fields', () => {
    const report = createArtifactGovernanceReport({
      findings: [
        {
          code: 'tasks.missing-verification',
          severity: 'warning',
          message: 'Task item is missing a verification block.',
        },
        {
          code: 'tasks.phase-detected',
          severity: 'info',
          message: 'Phase header was detected.',
        },
      ],
    });

    expect(report.mode).toBe('none');
    expect(report.enforcementMode).toBe('report-only');
    expect(report.valid).toBe(true);
    expect(report.shouldBlock).toBe(false);
    expect(report.summary).toEqual({
      total: 2,
      errorCount: 0,
      warningCount: 1,
      infoCount: 1,
      highestSeverity: 'warning',
    });
  });

  test('normalizes validator results around error findings without enabling enforcement', () => {
    const result = createArtifactGovernanceResult({
      validator: 'tasks-validator',
      artifact: 'tasks.md',
      mode: 'hybrid',
      findings: [
        {
          code: 'tasks.invalid-state',
          severity: 'error',
          message: 'Task state is not part of the SDD contract.',
        },
        {
          code: 'tasks.phase-detected',
          severity: 'info',
          message: 'Phase header was detected.',
        },
      ],
    });

    expect(result.validator).toBe('tasks-validator');
    expect(result.artifact).toBe('tasks.md');
    expect(result.mode).toBe('hybrid');
    expect(result.enforcementMode).toBe('report-only');
    expect(result.valid).toBe(false);
    expect(result.shouldBlock).toBe(false);
    expect(result.report.summary).toEqual({
      total: 2,
      errorCount: 1,
      warningCount: 0,
      infoCount: 1,
      highestSeverity: 'error',
    });
  });

  test('exports severity helpers for consumers that need stable summaries', () => {
    const findings = [
      {
        code: 'tasks.warning',
        severity: 'warning' as const,
        message: 'Warning finding.',
      },
      {
        code: 'tasks.error',
        severity: 'error' as const,
        message: 'Error finding.',
      },
      {
        code: 'tasks.info',
        severity: 'info' as const,
        message: 'Info finding.',
      },
    ];

    expect(getHighestArtifactGovernanceSeverity(findings)).toBe('error');
    expect(summarizeArtifactGovernanceFindings(findings)).toEqual({
      total: 3,
      errorCount: 1,
      warningCount: 1,
      infoCount: 1,
      highestSeverity: 'error',
    });
  });
});
