import {
  type AgentRoleName,
  getAgentPackContract,
  getAgentRole,
} from '../harness/core/agent-pack';
import {
  getRequiredSddPhaseOrder,
  getSddArtifactGraph,
  getSddPhaseOwner,
  getSddWorkflowContract,
  type SddRoute,
} from '../harness/core/sdd';
import type { AgentPromptRole, HarnessPromptDialect } from './prompt-dialects';
import type { ModelEntry } from './prompt-utils';

type ModelFamily = 'openai';

export type SemanticMemoryAccess = 'base' | 'readonly' | 'writable';
export type ReadOnlyAgentRole = 'explorer' | 'librarian' | 'oracle';
export type CoordinationAgentRole = 'sdd-specify' | 'sdd-plan' | 'sdd-tasks';
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
    .map((artifact) => artifact.path)
    .join(', ');
}

export function createOrchestratorPromptSections(): RolePromptSection[] {
  const workflow = getSddWorkflowContract();
  const policy = getAgentPackContract().orchestrationPolicy;

  return [
    roleText(`<role>
You are the adaptive root for thoth-agents. Keep requirements, decisions, execution ownership, and final synthesis in this thread.
</role>

<operating-model>
- You may inspect, edit, and verify bounded direct work when intent, scope, and risk are clear.
- Choose delegation only when specialization, context isolation, independent review, or parallel work creates a net gain.
- Prefer subagents for read-heavy exploration, research, analysis, and independent verification.
- The maximum delegation depth is ${policy.maxDelegationDepth}; child agents never delegate further.
- Maintain one writer for each mutable surface. Parallelize only independent work with no overlapping writes.
- Keep delegated prompts bounded and request distilled evidence, never raw logs or full-file dumps.
- Use \`{{userQuestionTool}}\` only when a material unresolved choice changes the result. Continue all safe non-blocked work first.
- Use \`{{progressTool}}\` only when the work genuinely has multiple dependent steps.
</operating-model>

<routing>
${renderRoleDirectory()}

Implementation choice:
- Root handles small, clear, low-risk changes directly.
- ${roleTemplate('designer')} owns visual or UX work.
- ${roleTemplate('quick')} handles narrow mechanical edits.
- ${roleTemplate('deep')} handles correctness-heavy, multi-file, or edge-case-rich implementation.
</routing>

<sdd-routing>
- Direct: clear, local, low-risk work. ${renderSddRoute('direct')}.
- Accelerated SDD: bounded multi-file or moderate-risk work. ${renderSddRoute('accelerated')}.
- Full SDD: explicitly requested SDD, uncertain or cross-cutting scope, high contract risk, or high failure cost. ${renderSddRoute('full')}.
- Conditional phases: clarify only for material ambiguity; checklist only when requirement risk justifies it; converge only when verification finds actionable defects.
- Do not create SDD ceremony for a simple documentation or mechanical update.
</sdd-routing>

<external-skills>
- Use progressive-context-router only for repository instruction or context-router work.
- Use architectural-grilling before specification only when the user explicitly asks to be grilled or material human-owned product or architecture decisions remain unresolved.
- Do not invoke it merely because the route is Full, and do not use it for routine clarification in Direct or Accelerated work.
- While grilling, remain in discovery and decision mode, ask one material question per turn, and wait for explicit closure before continuing the SDD pipeline.
- Feed accepted decisions forward; spec.md and plan.md remain canonical instead of creating a duplicate blueprint artifact by default.
</external-skills>

<artifacts>
- Preserve Spec Kit semantics inside ${workflow.artifactRoot}.
- Required for Accelerated and Full SDD: spec.md, plan.md, tasks.md.
- Optional when useful: ${renderArtifactSummary()}.
- ${roleTemplate('sdd-specify')}, ${roleTemplate('sdd-plan')}, and ${roleTemplate('sdd-tasks')} may write coordination artifacts only under openspec/.
- Product implementation remains with root or exactly one of ${roleTemplate('designer')}, ${roleTemplate('quick')}, ${roleTemplate('deep')}.
</artifacts>

<execution>
- Validate public contracts and existing tests before behavior changes; use test-first work when behavior is changing.
- Root decides whether implementation stays direct or is handed to one writer. Do not delegate merely because an agent exists.
- ${roleTemplate('oracle')} provides independent analysis for Full SDD and verification when independence adds value; root may run focused verification directly for bounded work.
- Preserve unrelated working-tree changes. Never instruct an agent to discard them.
- Installed provider guidance owns memory, hooks, MCP, persistence, and recovery mechanics. Use it only when a provider-dependent outcome is requested or required.
- Report changed files, verification evidence, remaining risks, and any capability gap truthfully.
</execution>

<delegation>
- Dispatch through \`{{delegationTool}}\` with a concrete task, bounded scope, relevant anchors, constraints, expected verification, and the compact return contract.
- Launch agents together only when their work is independent. Wait for requested results before synthesis.
- Child return fields: conclusion, evidence, verification, risks, openQuestions, nextAction.
</delegation>`),
    createQuestionProtocolSection(),
  ];
}

const ROLE_SPECIFIC_RULES: Record<
  ReadOnlyAgentRole | CoordinationAgentRole | WriteCapableAgentRole,
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
  ],
  'sdd-specify': [
    'Own spec.md and requirement clarification; make requirements testable and implementation-neutral.',
    'Create checklists/requirements.md only when an explicit quality audit adds value.',
  ],
  'sdd-plan': [
    'Own plan.md and create research.md, data-model.md, contracts/, or quickstart.md only when the change needs them.',
    'Make technical choices traceable to spec.md and repository evidence.',
  ],
  'sdd-tasks': [
    'Own tasks.md and produce dependency-ordered, independently verifiable work slices.',
    'Cover every accepted requirement without turning trivial edits into separate tasks.',
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
  roleName: ReadOnlyAgentRole | CoordinationAgentRole | WriteCapableAgentRole,
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
      : role.mode === 'coordination-write'
        ? [
            'Do not edit product code.',
            'Write only the assigned artifacts under openspec/ and preserve unrelated changes.',
          ]
        : [
            'Edit only the assigned implementation surface.',
            'Preserve unrelated working-tree changes and never use destructive Git cleanup.',
          ];

  return [
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
}

export function createReadOnlySpecialistPromptSections(
  role: ReadOnlyAgentRole,
): RolePromptSection[] {
  return childSections(role, 'readonly');
}

export function createCoordinationSpecialistPromptSections(
  role: CoordinationAgentRole,
): RolePromptSection[] {
  return childSections(role, 'writable');
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
    case 'coordination-write':
      return createCoordinationSpecialistPromptSections(
        role as CoordinationAgentRole,
      );
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
    case 'sdd-specify':
      return 'Optimize for testable requirements and explicit scope.';
    case 'sdd-plan':
      return 'Optimize for an executable technical plan grounded in the specification.';
    case 'sdd-tasks':
      return 'Optimize for complete, dependency-ordered, verifiable work slices.';
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
    .replace(/\{\{role\.([\w-]+)\}\}/g, (_match, role: AgentPromptRole) =>
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
