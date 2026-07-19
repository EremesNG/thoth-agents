import {
  type AgentRoleName,
  getAgentPackContract,
  getAgentRole,
} from '../harness/core/agent-pack';
import {
  getRequiredSddPhaseOrder,
  getSddArtifactGraph,
  getSddPhaseOwner,
  getSddRouteExecutionPolicy,
  getSddWorkflowContract,
  renderSddPhaseDispatchTemplate,
  type SddRoute,
} from '../harness/core/sdd';
import type { AgentPromptRole, HarnessPromptDialect } from './prompt-dialects';
import type { ModelEntry } from './prompt-utils';

type ModelFamily = 'openai';

export type SemanticMemoryAccess = 'base' | 'readonly' | 'writable';
export type ReadOnlyAgentRole = 'explorer' | 'librarian' | 'oracle';
export type WriteCapableAgentRole = 'designer' | 'quick' | 'deep';

export interface QuestionProtocolSection {
  kind: 'question-protocol';
  toolConcept: 'userQuestion';
}

export interface SubagentRulesSection {
  kind: 'subagent-rules';
  memoryAccess: SemanticMemoryAccess;
  progressConcept: 'progress';
  userQuestionConcept: 'userQuestion';
}

export interface ReasoningDisciplineSection {
  kind: 'reasoning-discipline';
}

export interface ResponseBudgetSection {
  kind: 'response-budget';
}

export interface StepBudgetSection {
  kind: 'step-budget';
  steps: number;
}

export interface ModelFamilySection {
  kind: 'model-family';
  role: AgentPromptRole;
  family: ModelFamily;
}

export interface RoleTextSection {
  kind: 'role-text';
  template: string;
}

export type PromptSection =
  | QuestionProtocolSection
  | SubagentRulesSection
  | ReasoningDisciplineSection
  | ResponseBudgetSection
  | StepBudgetSection
  | ModelFamilySection
  | RoleTextSection;

export type RolePromptSection = PromptSection;

export interface PromptSectionRenderer<TSection extends PromptSection> {
  render(section: TSection, dialect: HarnessPromptDialect): string;
}

export function createQuestionProtocolSection(): QuestionProtocolSection {
  return { kind: 'question-protocol', toolConcept: 'userQuestion' };
}

export function createSubagentRulesSection(
  memoryAccess: SemanticMemoryAccess = 'base',
): SubagentRulesSection {
  return {
    kind: 'subagent-rules',
    memoryAccess,
    progressConcept: 'progress',
    userQuestionConcept: 'userQuestion',
  };
}

export function createReasoningDisciplineSection(): ReasoningDisciplineSection {
  return { kind: 'reasoning-discipline' };
}

export function createResponseBudgetSection(): ResponseBudgetSection {
  return { kind: 'response-budget' };
}

export function createStepBudgetSection(
  steps?: number,
): StepBudgetSection | undefined {
  if (steps === undefined || !Number.isInteger(steps) || steps <= 0) {
    return undefined;
  }

  return { kind: 'step-budget', steps };
}

function getPrimaryModelId(model?: string | ModelEntry[]): string | undefined {
  if (Array.isArray(model)) {
    const first = model[0];
    return typeof first === 'string' ? first : first?.id;
  }

  return model;
}

export function detectModelFamilyFromModel(
  model?: string | ModelEntry[],
): ModelFamily | undefined {
  const id = getPrimaryModelId(model)?.toLowerCase();

  if (!id) return undefined;
  if (id.includes('gpt') || id.startsWith('openai/')) return 'openai';

  return undefined;
}

export function createModelFamilySection(
  role: AgentPromptRole,
  model?: string | ModelEntry[],
): ModelFamilySection | undefined {
  const family = detectModelFamilyFromModel(model);
  return family ? { kind: 'model-family', role, family } : undefined;
}

function roleText(template: string): RoleTextSection {
  return { kind: 'role-text', template };
}

function roleTemplate(role: AgentPromptRole): string {
  return `{{role.${role}}}`;
}

function renderSddRoute(route: SddRoute): string {
  return getRequiredSddPhaseOrder(route)
    .map(
      (phase) => `${phase} (${roleTemplate(getSddPhaseOwner(route, phase))})`,
    )
    .join(' -> ');
}

function renderRoleDirectory(): string {
  return getAgentPackContract()
    .roles.filter((role) => role.name !== 'orchestrator')
    .map((role) => `- ${roleTemplate(role.name)}: ${role.responsibility}`)
    .join('\n');
}

function renderArtifactSummary(): string {
  return getSddArtifactGraph()
    .filter((artifact) => artifact.requiredFor.length === 0)
    .map((artifact) => artifact.path)
    .join(', ');
}

export function createOrchestratorPromptSections(): RolePromptSection[] {
  const workflow = getSddWorkflowContract();
  const policy = getAgentPackContract().orchestrationPolicy;
  const accelerated = getSddRouteExecutionPolicy('accelerated');
  const full = getSddRouteExecutionPolicy('full');

  return [
    roleText(`<role>
You are the adaptive root for thoth-agents. Keep requirements, decisions, execution ownership, and final synthesis in this thread.
</role>

<operating-model>
- Handle bounded direct work when intent and risk are clear; never verify your own implementation.
- Delegate only for net gain from specialization, context isolation, independent review, or safe parallelism; prefer read-heavy work.
- The maximum delegation depth is ${policy.maxDelegationDepth}; child agents never delegate further.
- Maintain one writer for each mutable surface. Parallelize only independent work with no overlapping writes.
- Keep prompts bounded and request distilled evidence, not raw logs or full files.
- Use \`{{userQuestionTool}}\` only when a material unresolved choice changes the result. Continue all safe non-blocked work first.
- Use \`{{progressTool}}\` only when the work genuinely has multiple dependent steps.
</operating-model>

<routing>
${renderRoleDirectory()}
</routing>

<sdd-routing>
- An explicitly requested route wins; a generic SDD request sets Accelerated as the minimum unless Full risk applies.
- Direct: clear, bounded, low-risk work. ${renderSddRoute('direct')}.
- Documentation or mechanical work may remain Direct across multiple files when it is clear and low risk.
- Accelerated SDD: multi-surface behavior, architecture, partial clarity, or moderate risk. ${renderSddRoute('accelerated')}.
- For Accelerated, run specify -> plan -> tasks in one uninterrupted root pass. Do not pause between those planning artifacts; ask only for a material unresolved decision.
- Its thoth-sdd validator gates are ${accelerated.validationGates.join(' -> ')}; optional artifacts are off by default.
- Full SDD: uncertain scope, cross-cutting behavior or architecture, high contract risk, or high failure cost. ${renderSddRoute('full')}.
- Full gates are ${full.validationGates.join(' -> ')}; checklist remains conditional.
- Happy path: verify -> archive. Artifact-backed failure loop: verify fail -> converge -> implement -> verify. Direct failure loop: verify fail -> implement -> verify.
- Conditional phases: clarify only for material ambiguity; checklist only when requirement risk justifies it; converge only when verification finds actionable defects.
- When implementation discoveries refine the same intent, update the canonical artifact and revalidate only affected downstream artifacts. Split a new change when the intent changes.
- Load the bundled \`thoth-sdd\` skill only after selecting Accelerated or Full, then read only the reference for the current phase.
- Root owns specify, clarify, plan, checklist, tasks, converge, and archive coordination; these phases are not delegated merely to change prompts.
- Delegate analyze and every verify phase to ${roleTemplate('oracle')}, including Direct and Accelerated work. The implementation writer must never review itself.
</sdd-routing>

<external-skills>
- Use bundled \`thoth-constitution\` for constitution lifecycle and \`thoth-archive\` for verified artifact-backed closeout.
- Use the installed mandatory \`tdd\` skill for behavior changes and \`simplify\` after implementation without changing behavior.
- During an SDD, never invoke the thoth-agents CLI, \`npx skills add\`, or a network fetch to load a phase contract. Report an incomplete installation if a required local skill is missing.
- Use progressive-context-router only for repository instruction or context-router work.
- Use architectural-grilling before specification only when the user explicitly asks to be grilled or material human-owned product or architecture decisions remain unresolved.
- Do not invoke it merely because the route is Full, and do not use it for routine clarification in Direct or Accelerated work.
- While grilling, remain in discovery and decision mode, ask one material question per turn, and wait for explicit closure before continuing the SDD pipeline.
- Feed accepted decisions forward; spec.md and plan.md remain canonical instead of creating a duplicate blueprint artifact by default.
</external-skills>

<artifacts>
- Preserve Spec Kit semantics inside ${workflow.artifactRoot}.
- Required for Accelerated and Full SDD: spec.md, plan.md, tasks.md, verify-report.md, archive-report.md.
- Optional when useful: ${renderArtifactSummary()}.
- Root owns coordination artifacts under openspec/ and uses the route-specific bundled thoth-sdd validation gates.
- Product work stays with root or one writer; root alone moves task state [~] -> [x] after evidence.
- ${roleTemplate('oracle')} returns read-only findings; root persists verify-report.md and archives.
- Archive creates archive-report.md, synchronizes only explicitly declared durable specification deltas after oracle PASS, and moves the complete change to openspec/changes/archive/YYYY-MM-DD-<feature>/.
</artifacts>

<execution>
- Validate public contracts and existing tests before behavior changes; use test-first work when behavior is changing.
- Root decides whether implementation stays direct or is handed to one writer. Do not delegate merely because an agent exists.
- ${roleTemplate('oracle')} always provides independent verification and also owns Full SDD analysis. Root and implementation writers never self-approve.
- Preserve unrelated working-tree changes. Never instruct an agent to discard them.
- Installed provider guidance owns memory, hooks, MCP, persistence, and recovery mechanics. Use it only when a provider-dependent outcome is requested or required.
- Report changed files, evidence, risks, and capability gaps truthfully.
</execution>

<delegation>
- Dispatch through \`{{delegationTool}}\` with this envelope; use the same boundaries for non-SDD work.
- Launch agents together only when their work is independent. Wait for requested results before synthesis.
- Child return fields: conclusion, evidence, verification, risks, openQuestions, nextAction.

${renderSddPhaseDispatchTemplate()}
</delegation>`),
    createQuestionProtocolSection(),
  ];
}

const ROLE_SPECIFIC_RULES: Record<
  ReadOnlyAgentRole | WriteCapableAgentRole,
  string[]
> = {
  explorer: [
    'Resolve the assigned repository question with paths, symbols, and concise anchors.',
    'Search broadly only when the target is genuinely unknown; stop once the evidence is decision-ready.',
  ],
  librarian: [
    'Prefer current official documentation and primary sources.',
    'Cite every substantive external claim and label inference explicitly.',
  ],
  oracle: [
    'Separate observations, risks, and recommendations.',
    'Review against stated requirements and contracts; do not invent implementation scope.',
    'For analyze or verify, load the matching bundled thoth-sdd reference and remain read-only.',
    'Reject self-review: the implementing root or writer cannot substitute for independent oracle judgment.',
  ],
  designer: [
    'Own user-facing choices, implementation, and visual verification.',
    'Check relevant responsive and interaction states when feasible.',
  ],
  quick: [
    'Make the smallest complete edit and stop after focused verification.',
    'Escalate instead of expanding a bounded assignment into broad discovery.',
  ],
  deep: [
    'Build the necessary local mental model and use tests first for behavior changes.',
    'Verify related call sites, edge cases, and shared contracts before completion.',
  ],
};

function childSections(
  roleName: ReadOnlyAgentRole | WriteCapableAgentRole,
  memoryAccess: SemanticMemoryAccess,
): RolePromptSection[] {
  const role = getAgentRole(roleName);
  const dispatch =
    role.dispatch === 'synchronous-task-only'
      ? '{{dispatch.synchronous-task-only}}'
      : '{{dispatch.task}}';
  const writeScope = role.writeScope?.length
    ? `\n- Write scope: ${role.writeScope.join(', ')}`
    : '';

  const modeRules =
    role.mode === 'read-only'
      ? [
          'Do not mutate the workspace.',
          'Do not create coordination artifacts or durable provider state.',
        ]
      : [
          'Edit only the assigned phase surface.',
          'Preserve unrelated working-tree changes and never use destructive Git cleanup.',
        ];

  const sections: RolePromptSection[] = [
    roleText(`<role>
You are ${roleName}.
</role>

<mode>
- Mode: ${role.mode}
- Dispatch: ${dispatch}
- Scope: ${role.scope}${writeScope}
</mode>

<responsibility>
${role.responsibility}
</responsibility>`),
    createReasoningDisciplineSection(),
    roleText(`<rules>
- Do not delegate further or manage root progress.
- ${modeRules.join('\n- ')}
- ${ROLE_SPECIFIC_RULES[roleName].join('\n- ')}
- Use installed provider guidance only for an explicitly authorized provider-dependent outcome; do not invent provider mechanics.
- Ask only when a local blocking decision cannot be resolved from the assignment and evidence.
</rules>`),
    createSubagentRulesSection(memoryAccess),
    createQuestionProtocolSection(),
    roleText(`<return-contract>
Return a compact result with these fields:
- conclusion
- evidence
- verification
- risks
- openQuestions
- nextAction
</return-contract>`),
    createResponseBudgetSection(),
  ];

  return sections;
}

export function createReadOnlySpecialistPromptSections(
  role: ReadOnlyAgentRole,
): RolePromptSection[] {
  return childSections(role, 'readonly');
}

export function createWriteCapableSpecialistPromptSections(
  role: WriteCapableAgentRole,
): RolePromptSection[] {
  return childSections(role, 'writable');
}

export function createRolePromptSections(
  role: AgentRoleName,
): RolePromptSection[] {
  const mode = getAgentRole(role).mode;

  switch (mode) {
    case 'adaptive-root':
      return createOrchestratorPromptSections();
    case 'read-only':
      return createReadOnlySpecialistPromptSections(role as ReadOnlyAgentRole);
    case 'write-capable':
      return createWriteCapableSpecialistPromptSections(
        role as WriteCapableAgentRole,
      );
  }
}

function renderQuestionProtocol(
  _section: QuestionProtocolSection,
  dialect: HarnessPromptDialect,
): string {
  return `<questions>
Use \`${dialect.tools.userQuestionTool}\` only for a blocking material choice, destructive or security-sensitive action, or missing secret. Do safe non-blocked work first and ask one targeted question with a recommended default.
</questions>`;
}

function renderSubagentRules(
  section: SubagentRulesSection,
  dialect: HarnessPromptDialect,
): string {
  const rules = [
    `- Do not delegate further or call \`${dialect.tools.progressTool}\`.`,
    `- Use \`${dialect.tools.userQuestionTool}\` only for a local blocking choice.`,
    '- Use terminating checks; avoid watch processes and indefinite waits.',
    '- Never discard or overwrite unrelated working-tree changes.',
  ];

  if (section.memoryAccess === 'readonly') {
    rules.push(
      '- Any authorized provider context is read-only; do not create durable observations, summaries, or checkpoints.',
    );
  } else if (section.memoryAccess === 'writable') {
    rules.push(
      '- Provider state is outside this role unless the parent explicitly authorizes a provider-dependent outcome and installed guidance defines it.',
    );
  }

  return rules.join('\n');
}

function renderReasoningDiscipline(): string {
  return `<reasoning-discipline>
- Check the most likely failure mode and one meaningful alternative before acting.
- Ground conclusions in current evidence and verify the assigned outcome before returning.
</reasoning-discipline>`;
}

function renderResponseBudget(): string {
  return 'Be concise. Return distilled evidence and outcomes, not raw logs or full-file dumps.';
}

function renderStepBudget(section: StepBudgetSection): string {
  return `<step-budget>
- Execution budget: ${section.steps} steps.
- Prioritize high-signal checks and return partial evidence with the next target instead of looping.
</step-budget>`;
}

function getRoleModelProfile(role: AgentPromptRole): string {
  switch (role) {
    case 'orchestrator':
      return 'Act directly on bounded work; delegate only for net gain and synthesize all results.';
    case 'explorer':
      return 'Navigate from broad uncertainty to exact repository anchors.';
    case 'librarian':
      return 'Prioritize current primary sources, versions, and explicit citations.';
    case 'oracle':
      return 'Challenge assumptions and return evidence-backed judgment.';
    case 'designer':
      return 'Make concrete UX choices and verify the visible result.';
    case 'quick':
      return 'Favor the smallest complete edit and focused verification.';
    case 'deep':
      return 'Trace shared behavior, test assumptions, and verify edge cases.';
  }
}

function renderModelFamily(section: ModelFamilySection): string {
  const familyGuidance: Record<ModelFamily, string> = {
    openai:
      'Plan briefly, then act with explicit tool targets and return shapes.',
  };

  return `<model-profile family="${section.family}">
- ${familyGuidance[section.family]}
- ${getRoleModelProfile(section.role)}
</model-profile>`;
}

function renderRoleText(
  section: RoleTextSection,
  dialect: HarnessPromptDialect,
): string {
  return section.template
    .replaceAll('{{delegationTool}}', dialect.tools.delegationTool)
    .replaceAll(
      '{{backgroundDelegationTool}}',
      dialect.tools.backgroundDelegationTool ?? dialect.tools.delegationTool,
    )
    .replaceAll(
      '{{backgroundStatusTool}}',
      dialect.tools.backgroundStatusTool ??
        dialect.tools.hostStatusSurface ??
        '',
    )
    .replaceAll('{{userQuestionTool}}', dialect.tools.userQuestionTool)
    .replaceAll('{{progressTool}}', dialect.tools.progressTool)
    .replaceAll(
      '{{lifecycleStatusAction}}',
      dialect.tools.lifecycle.statusAction,
    )
    .replaceAll(
      '{{lifecycleTerminalState}}',
      dialect.tools.lifecycle.terminalState,
    )
    .replaceAll(
      '{{lifecycleNonterminalState}}',
      dialect.tools.lifecycle.nonterminalState,
    )
    .replaceAll(
      '{{lifecycleSameSessionProbe}}',
      dialect.tools.lifecycle.sameSessionProbe,
    )
    .replaceAll('{{dispatch.task}}', dialect.dispatchLabel('task'))
    .replaceAll(
      '{{dispatch.synchronous-task-only}}',
      dialect.dispatchLabel('synchronous-task-only'),
    )
    .replace(/{{role\.([\w-]+)}}/g, (_match, role: AgentPromptRole) =>
      dialect.renderRoleInvocation(role),
    );
}

export function renderPromptSection(
  section: PromptSection,
  dialect: HarnessPromptDialect,
): string {
  switch (section.kind) {
    case 'question-protocol':
      return renderQuestionProtocol(section, dialect);
    case 'subagent-rules':
      return renderSubagentRules(section, dialect);
    case 'reasoning-discipline':
      return renderReasoningDiscipline();
    case 'response-budget':
      return renderResponseBudget();
    case 'step-budget':
      return renderStepBudget(section);
    case 'model-family':
      return renderModelFamily(section);
    case 'role-text':
      return renderRoleText(section, dialect);
  }
}

export function renderRolePrompt(
  sections: RolePromptSection[],
  dialect: HarnessPromptDialect,
): string {
  return sections
    .map((section) => renderPromptSection(section, dialect).trim())
    .filter(Boolean)
    .join('\n\n');
}
