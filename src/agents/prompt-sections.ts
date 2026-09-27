import {
  type AgentRoleName,
  getAgentPackContract,
  getAgentRole,
  type ImplementationOwnershipPolicy,
  type SpecialistDecision,
  type TaskShapingPolicy,
} from '../harness/core/agent-pack';
import {
  getExecutionCoordinationPolicy,
  getWorkWorkflowContract,
  renderWorkUnitDispatchTemplate,
} from '../harness/core/workflow';
import type { AgentPromptRole, HarnessPromptDialect } from './prompt-dialects';
import type { ModelEntry } from './prompt-utils';

type ModelFamily = 'openai';

export type SemanticMemoryAccess = 'dispatch-scoped';
export type ReadOnlyAgentRole = 'explorer' | 'librarian' | 'oracle';
export type WriteCapableAgentRole = 'designer' | 'quick' | 'deep';

export interface QuestionProtocolSection {
  kind: 'question-protocol';
  toolConcept: 'userQuestion';
  audience: 'root' | 'child';
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

export function createQuestionProtocolSection(
  audience: 'root' | 'child' = 'root',
): QuestionProtocolSection {
  return { kind: 'question-protocol', toolConcept: 'userQuestion', audience };
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

function renderImplementationOwnershipPolicy(
  policy: ImplementationOwnershipPolicy,
): string {
  return `<implementation-ownership>
- Persistence and planning choices do not determine implementation ownership.
- Eligible owners for accepted work: ${policy.eligibleOwners
    .map((owner) => roleTemplate(owner))
    .join(', ')}.
- Delegation benefits: ${policy.delegationBenefits.join('; ')}.
- Root continuity benefits: ${policy.rootContinuityBenefits.join('; ')}.
- Explicit safe user direction is an ownership input.
- Insufficient ownership signals: ${policy.insufficientSignals.join('; ')}.
- Only after deciding delegation creates net gain: use ${roleTemplate('designer')} for UI/UX, ${roleTemplate('quick')} for known narrow low-risk work, and ${roleTemplate('deep')} for coupled or high-risk work.
</implementation-ownership>`;
}

function renderRoleDirectory(directory: SpecialistDecision[]): string {
  return directory
    .map(
      ({ role, selectWhen, rejectWhen }) =>
        `- ${roleTemplate(role)}: Select when ${selectWhen} Reject when ${rejectWhen}`,
    )
    .join('\n');
}

function renderTaskShapingPolicy(policy: TaskShapingPolicy): string {
  const execution = getExecutionCoordinationPolicy();
  return `<task-shaping>
${policy.steps.join(' -> ')}
- ${policy.decisions.dependency}; bind each unit to output, mutable ownership, specialist fit, checks, and acceptance.
- ${policy.decisions.ownershipConflict}; require compatible reads, writes, interfaces, and resources.
- ${policy.decisions.readyDispatch} through \`{{backgroundDelegationTool}}\`{{backgroundWaitInstruction}}
- ${policy.decisions.refill}; release each consumer when its own dependencies qualify, with no global wave barrier.
- Accept only {{lifecycleTerminalState}} after reconciling intent, checks, and freshness. {{lifecycleNonterminalState}}, ${policy.decisions.terminalEvidence}.
- ${execution.completion[0]} ${policy.decisions.degradation}.
- Thoth defines policy and project evidence only; never invent an executor, queue, scheduler, portable wait API, or lifecycle mirror.
</task-shaping>`;
}

export function createOrchestratorPromptSections(): RolePromptSection[] {
  const workflow = getWorkWorkflowContract();
  const policy = getAgentPackContract().orchestrationPolicy;

  return [
    roleText(`<role>
You are the adaptive root for thoth-agents. Keep requirements, decisions, ownership, and synthesis here.
</role>

<operating-model>
- Handle trivial bounded work directly when continuity outweighs delegation overhead; never self-approve.
- The maximum delegation depth is ${policy.maxDelegationDepth}; children never delegate.
- Keep one writer per mutable surface; parallelize only non-overlapping work.
- Keep prompts bounded; request distilled evidence, not raw logs or full files.
- Preserve unrelated changes; report changed files, evidence, risks, and capability gaps.
- {{progressInstruction}}
</operating-model>

<delegation-lifecycle>
- A new objective, work unit, mutable surface, or independent judgment is a work boundary: start a fresh specialist using {{lifecycleFreshDelegation}}. Never treat completed agents as a reusable role pool.
- Independent context: {{lifecycleIndependentContext}}.
- Continue with {{lifecycleSameAssignmentContinuation}} only to steer, complete, or clarify the same bounded assignment; never to cross a work boundary.
- {{lifecycleSameSessionProbe}} only collects the active nonterminal assignment and does not authorize later reuse.
- Every Oracle plan review, verification round, and PASS judgment uses a fresh Oracle instance. An existing Oracle session may only clarify its current findings.
</delegation-lifecycle>

<routing>
${renderRoleDirectory(policy.specialistDirectory)}
</routing>

${renderImplementationOwnershipPolicy(policy.implementationOwnership)}

${renderTaskShapingPolicy(policy.taskShaping)}

<work-workflow>
- Trivial bounded work may follow ${workflow.directPath} without creating a project artifact.
- Persist nontrivial or recoverable work at ${workflow.persistedWorkPath}; use phases ${workflow.phases.map(({ id }) => id).join(' -> ')} as needed. Root selects artifacts without a pipeline question.
- Root owns agreement, units, acceptance and closeout; thoth-work defines the contract.
${workflow.authorizationRules.map((rule) => `- ${rule}`).join('\n')}
- Final verification is mandatory. Use a fresh ${roleTemplate('oracle')} for persisted work and materially risky direct work; focused root checks suffice only for trivial deterministic work. No implementation writer may approve its own work.
- Checkpoints are supporting evidence at ${workflow.checkpointPath}; they never establish native liveness or terminal execution.
- Resume from work.yaml, the pending checkpoint, relevant diff and dirty files, and dependency fingerprints. Preserve partial and preexisting work; reconcile external effects before replay; unknown native liveness blocks only the conflicting surface.
</work-workflow>

<external-skills>
- Use the bundled \`thoth-work\` skill for persisted work and its validator, and \`thoth-constitution\` only for constitution lifecycle.
- Use the installed mandatory \`tdd\` skill for behavior changes and \`simplify\` after implementation without changing behavior.
- During persisted work, never invoke the thoth-agents CLI, \`npx skills add\`, or network to obtain a missing contract; report an incomplete installation.
- Use progressive-context-router only for repository instruction or context-router work.
- Use architectural-grilling only when the user explicitly asks to be grilled or a material human-owned product or architecture decision remains unresolved; ask one material question per turn.
- Feed accepted decisions into work.yaml without duplicating a second planning narrative.
</external-skills>

<memory>
- For resume/prior work, load the installed \`thoth-mem\` skill; never invent its protocol.
- Preserve only a reusable decision, root cause, convention, or discovery. Root owns the stable root session ID, project, lifecycle, real-user intent, and authorization.
- Follow it at verified compaction or a meaningful semantic boundary; children get bounded MEMORY, never root lifecycle.
- \`.thoth/\` is project work evidence and remains independent from provider memory; do not mirror work artifacts. A memory failure does not block unrelated work.
</memory>

<artifacts>
- The persisted contract is ${workflow.persistedWorkPath}; supporting context and external unit files are optional, so units may stay inline or move to focused external files.
- Root owns semantic pending or accepted state. Native execution state stays with the harness. ${roleTemplate('oracle')} returns read-only findings; root records accepted verification evidence and closes only after PASS.
- Worktree automation is deferred; do not assume it exists.
</artifacts>

<delegation>
- Use this envelope for all \`{{delegationTool}}\` delegation. Dispatch every admitted conflict-free ready unit before waiting, then refill native capacity before the next wait.
- Child return fields: conclusion, evidence, verification, risks, openQuestions, nextAction.

${renderWorkUnitDispatchTemplate()}
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
    'For selected focused plan review or final verify, load the matching bundled thoth-work guidance and remain read-only.',
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
  const dispatch = '{{dispatch.task}}';
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
          'Edit only the assigned work-unit surface.',
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
</responsibility>

<routing-contract>
- Use when: ${role.useWhen.join(' ')}
- Do not use when: ${role.doNotUseWhen.join(' ')}
- Escalate when: ${role.escalateWhen.join(' ')}
- Verification: ${role.verification.join(' ')}
</routing-contract>`),
    createReasoningDisciplineSection(),
    roleText(`<rules>
- ${modeRules.join('\n- ')}
- ${ROLE_SPECIFIC_RULES[roleName].join('\n- ')}
</rules>`),
    createSubagentRulesSection(),
    createQuestionProtocolSection('child'),
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
  section: QuestionProtocolSection,
  dialect: HarnessPromptDialect,
): string {
  if (section.audience === 'child' && dialect.harness === 'pi') {
    return `<questions>
Do not open a user dialog. Continue safe non-blocked work, then escalate the unresolved question to the root through openQuestions with the material choices and a recommended default.
</questions>`;
  }
  if (section.audience === 'root') {
    return `<questions>
Use \`${dialect.tools.userQuestionTool}\` for planning choices or a blocking decision, sensitive action, or missing secret. Ask one targeted question with a recommended default.
</questions>`;
  }
  return `<questions>
Use \`${dialect.tools.userQuestionTool}\` only for a blocking material choice, destructive or security-sensitive action, or missing secret. Do safe non-blocked work first and ask one targeted question with a recommended default.
</questions>`;
}

function renderSubagentRules(
  section: SubagentRulesSection,
  dialect: HarnessPromptDialect,
): string {
  const rules = [
    dialect.tools.progressTool
      ? `- Do not delegate further or call \`${dialect.tools.progressTool}\`; root owns progress.`
      : '- Do not delegate further; root owns progress.',
    '- Use terminating checks; avoid watch processes and indefinite waits.',
    '- Never discard or overwrite unrelated working-tree changes.',
  ];

  if (section.memoryAccess === 'dispatch-scoped') {
    rules.push(
      '- Read the dispatch MEMORY block: `none` forbids provider work, `recall` permits bounded reads, and `observe` additionally permits a bounded durable observation under the delegated scope.',
      '- For `recall` or `observe`, load and follow the installed `thoth-mem` skill; do not invent provider mechanics or claim unconfirmed effects.',
      '- MEMORY authorization does not authorize workspace mutation. It never transfers root lifecycle or real-user-intent ownership to a child.',
      '- `.thoth/` project work evidence remains independent from provider memory; do not mirror work artifacts.',
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
    .replaceAll(
      '{{backgroundWaitInstruction}}',
      dialect.tools.backgroundWaitInstruction
        ? `. ${dialect.tools.backgroundWaitInstruction}`
        : ', then use `{{backgroundStatusTool}}`.',
    )
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
    .replaceAll(
      '{{progressInstruction}}',
      dialect.tools.progressTool
        ? `Use \`${dialect.tools.progressTool}\` only when the work genuinely has multiple dependent steps.`
        : dialect.harness === 'pi'
          ? 'Use an available task/progress tool only when the work genuinely has multiple dependent steps. Follow its actual tool name and schema; if none is available, keep lightweight written progress without blocking work.'
          : 'Keep written progress notes when the work genuinely has multiple dependent steps; no native planning tool is configured.',
    )
    .replaceAll(
      '{{lifecycleStatusAction}}',
      dialect.tools.lifecycle.statusAction,
    )
    .replaceAll(
      '{{lifecycleFreshDelegation}}',
      dialect.tools.lifecycle.freshDelegation,
    )
    .replaceAll(
      '{{lifecycleIndependentContext}}',
      dialect.tools.lifecycle.independentContext,
    )
    .replaceAll(
      '{{lifecycleSameAssignmentContinuation}}',
      dialect.tools.lifecycle.sameAssignmentContinuation,
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
