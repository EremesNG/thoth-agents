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

export type SemanticMemoryAccess = 'dispatch-scoped';
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
  memoryAccess: SemanticMemoryAccess = 'dispatch-scoped',
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
- Delegate only for net gain from specialization, context isolation, review, or safe parallelism. The maximum delegation depth is ${policy.maxDelegationDepth}; children never delegate.
- Maintain one writer for each mutable surface. Parallelize only independent work with no overlapping writes.
- Keep prompts bounded; request distilled evidence, not raw logs or full files.
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
- During an SDD, never invoke the thoth-agents CLI, \`npx skills add\`, or a network fetch. A missing local contract means incomplete installation.
- Use progressive-context-router only for repository instruction or context-router work.
- Use architectural-grilling before specification only when the user explicitly asks to be grilled or material human-owned product or architecture decisions remain unresolved.
- Do not invoke it merely because the route is Full. While grilling, ask one material question per turn and await explicit closure.
- Feed accepted decisions forward; spec.md and plan.md remain canonical instead of creating a duplicate blueprint artifact by default.
</external-skills>

<memory>
- Load the installed \`thoth-mem\` skill for resume or prior work and provider-backed memory; never invent its protocol.
- Preserve a durable decision, root cause, convention, or discovery only when reusable. Root owns the stable root session ID, project, lifecycle, real-user intent, and authorization; never invent identity or confirmed effects.
- Follow the skill at verified compaction and a meaningful semantic boundary. Children receive only bounded MEMORY dispatch and never own root lifecycle.
- \`openspec/\` remains canonical; do not mirror SDD phase artifacts into provider memory. A memory failure degrades memory only and does not block unrelated implementation or verification.
</memory>

<artifacts>
- Preserve Spec Kit semantics inside ${workflow.artifactRoot}.
- Accelerated and Full require spec.md, plan.md, tasks.md, verify-report.md, and archive-report.md; optional when useful: ${renderArtifactSummary()}.
- Root owns openspec/ coordination and thoth-sdd gates; product work has one writer, and root alone moves [~] -> [x] after evidence.
- ${roleTemplate('oracle')} returns read-only findings. Root persists verification; after PASS, archive syncs declared durable deltas and moves the change to openspec/changes/archive/YYYY-MM-DD-<feature>/.
</artifacts>

<execution>
- Validate contracts and tests first; use test-first work for behavior. Root or one writer implements; do not delegate merely because an agent exists.
- ${roleTemplate('oracle')} always provides independent verification and also owns Full SDD analysis. Root and implementation writers never self-approve.
- Preserve unrelated working-tree changes. Never instruct an agent to discard them.
- Report changed files, evidence, risks, and capability gaps truthfully.
</execution>

<delegation>
- Dispatch through \`{{delegationTool}}\` with this envelope; use the same boundaries for non-SDD work.
- Parallelize only independent work and await requested results before synthesis.
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
          'Do not create coordination artifacts.',
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
- Ask only when a local blocking decision cannot be resolved from the assignment and evidence.
</rules>`),
    createSubagentRulesSection(),
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
  return childSections(role);
}

export function createWriteCapableSpecialistPromptSections(
  role: WriteCapableAgentRole,
): RolePromptSection[] {
  return childSections(role);
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

  if (section.memoryAccess === 'dispatch-scoped') {
    rules.push(
      '- Read the dispatch MEMORY block: `none` forbids provider work, `recall` permits bounded reads, and `observe` additionally permits a bounded durable observation under the delegated scope.',
      '- For `recall` or `observe`, load and follow the installed `thoth-mem` skill; do not invent provider mechanics or claim unconfirmed effects.',
      '- MEMORY authorization does not authorize workspace mutation. It never transfers root lifecycle or real-user-intent ownership to a child.',
      '- `openspec/` remains canonical; do not mirror SDD phase artifacts into provider memory.',
      '- Report unavailable, degraded, stale, contradictory, or insufficient memory evidence and continue unrelated assigned work when safe.',
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
