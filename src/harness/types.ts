export type HarnessId = 'opencode' | 'codex';

export type HarnessArtifactKind =
  | 'agent-config'
  | 'harness-config'
  | 'mcp-config'
  | 'skill'
  | 'hook-config'
  | 'manifest'
  | 'documentation';

export type HarnessDiagnosticSeverity = 'info' | 'warning' | 'error';

export type HarnessDiagnosticCode =
  | 'harness.unsupported'
  | 'harness.capability_gap'
  | 'harness.surface_unvalidated'
  | 'harness.artifact_skipped'
  | (string & {});

export type HarnessCapabilityStatus =
  | 'supported'
  | 'unsupported'
  | 'instruction-only'
  | 'unknown';

export interface HarnessCapabilities {
  agentDefinitions: HarnessCapabilityStatus;
  delegatedExecution: HarnessCapabilityStatus;
  parallelDelegation: HarnessCapabilityStatus;
  runtimeHooks: HarnessCapabilityStatus;
  mcpConfiguration: HarnessCapabilityStatus;
  skillPackaging: HarnessCapabilityStatus;
  rolePermissions: HarnessCapabilityStatus;
  parentContextInjection: HarnessCapabilityStatus;
  memoryGovernanceEnforcement: HarnessCapabilityStatus;
}

export interface HarnessRenderOptions {
  dryRun?: boolean;
  overwrite?: boolean;
  targetHarness?: HarnessId;
  outputRoot?: string;
  codexSkillOutputModes?: readonly ('plugin-package' | 'repo-local-fallback')[];
}

export interface HarnessArtifact {
  path: string;
  kind: HarnessArtifactKind;
  content: string | Uint8Array;
  description?: string;
  harness: HarnessId;
}

export interface HarnessDiagnostic {
  severity: HarnessDiagnosticSeverity;
  code: HarnessDiagnosticCode;
  message: string;
  harness?: HarnessId | string;
  capability?: keyof HarnessCapabilities;
  surface?: string;
  fallback?: 'instruction-only' | 'diagnostic-only' | 'none';
}

export interface UnsupportedHarnessDiagnostic extends HarnessDiagnostic {
  severity: 'error';
  code: 'harness.unsupported';
  requestedHarness: string;
  supportedHarnesses: HarnessId[];
  fallback: 'none';
}

export interface CapabilityGapDiagnostic extends HarnessDiagnostic {
  code: 'harness.capability_gap';
  capability: keyof HarnessCapabilities;
  fallback: 'instruction-only' | 'diagnostic-only' | 'none';
}

export interface HarnessRenderContext {
  projectRoot: string;
  packageRoot?: string;
  options?: HarnessRenderOptions;
}

export interface HarnessRenderResult {
  harness: HarnessId;
  artifacts: HarnessArtifact[];
  diagnostics: HarnessDiagnostic[];
}

export interface HarnessWriterResult {
  artifacts: HarnessArtifact[];
  diagnostics: HarnessDiagnostic[];
  wroteArtifacts: boolean;
}

export interface HarnessAdapter {
  id: HarnessId;
  displayName: string;
  capabilities: HarnessCapabilities;
  render(context: HarnessRenderContext): HarnessRenderResult;
}

export interface UnsupportedHarnessResult {
  ok: false;
  harness: string;
  artifacts: [];
  diagnostics: [UnsupportedHarnessDiagnostic];
}

export interface SupportedHarnessResult {
  ok: true;
  harness: HarnessId;
  adapter: HarnessAdapter;
  artifacts: HarnessArtifact[];
  diagnostics: HarnessDiagnostic[];
}

export type HarnessResolutionResult =
  | SupportedHarnessResult
  | UnsupportedHarnessResult;
