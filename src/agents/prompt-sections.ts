import {
  type AgentRoleName,
  getAgentPackContract,
  getAgentRole,
  type ImplementationOwnershipPolicy,
  type SpecialistDecision,
  type TaskShapingPolicy,
} from '../harness/core/agent-pack';
import {
  getRequiredSddPhaseOrder,
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

function renderSddRoute(route: SddRoute): string {
  return getRequiredSddPhaseOrder(route).join(' -> ');
}

function renderImplementationOwnershipPolicy(
  policy: ImplementationOwnershipPolicy,
): string {
  return `<implementation-ownership>
- SDD routes govern artifacts and gates, not implementation ownership.
- Eligible owners in every route: ${policy.eligibleOwners
    .map((owner) => roleTemplate(owner))
    .join(', ')}.
- Delegation benefits: ${policy.delegationBenefits.join('; ')}.
- Root continuity benefits: ${policy.rootContinuityBenefits.join('; ')}.
- Explicit safe user direction is an ownership input.
- Insufficient signals: ${policy.insufficientSignals.join('; ')}.
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
  return `<task-shaping>
${policy.steps.join(' -> ')}
- ${policy.decisions.dependency}; bind each lane to output, mutable ownership, specialist fit, and verification input.
- ${policy.decisions.ownershipConflict}; avoid duplicate evidence work.
- ${policy.decisions.readyWave} through \`{{backgroundDelegationTool}}\` within native capacity{{backgroundWaitInstruction}}
- Fan in only from {{lifecycleTerminalState}}; {{lifecycleNonterminalState}}, ${policy.decisions.terminalEvidence}.
- Reconcile against intent, dependencies, ownership, conflicts, and verification before synthesis; native execution remains authoritative; ${policy.decisions.degradation}.
</task-shaping>`;
}

export function createOrchestratorPromptSections(): RolePromptSection[] {
  const workflow = getSddWorkflowContract();
  const policy = getAgentPackContract().orchestrationPolicy;
  const accelerated = getSddRouteExecutionPolicy('accelerated');
  const full = getSddRouteExecutionPolicy('full');

  return [
    roleText(`<role>
You are the adaptive root for thoth-agents. Keep requirements, decisions, ownership, and synthesis here.
</role>

<operating-model>
- Handle bounded implementation directly in any route when continuity outweighs delegation overhead; never self-approve.
- The maximum delegation depth is ${policy.maxDelegationDepth}; children never delegate.
- Keep one writer per mutable surface; parallelize only non-overlapping work.
- Keep prompts bounded; request distilled evidence, not raw logs or full files.
- Preserve unrelated changes; report changed files, evidence, risks, and capability gaps.
- Use \`{{userQuestionTool}}\` only when a material unresolved choice changes the result. Continue all safe non-blocked work first.
- {{progressInstruction}}
</operating-model>

<delegation-lifecycle>
- A new objective, SDD phase, mutable surface, or independent judgment is a work boundary: start a fresh specialist using {{lifecycleFreshDelegation}}. Never treat completed agents as a reusable role pool.
- Independent context: {{lifecycleIndependentContext}}.
- Continue with {{lifecycleSameAssignmentContinuation}} only to steer, complete, or clarify the same bounded assignment; never to cross a work boundary.
- {{lifecycleSameSessionProbe}} only collects the active nonterminal assignment and does not authorize later reuse.
- Every Oracle plan review, verification round, and approval or PASS judgment uses a fresh Oracle instance. An existing Oracle session may only clarify its current findings.
</delegation-lifecycle>

<routing>
${renderRoleDirectory(policy.specialistDirectory)}
</routing>

${renderImplementationOwnershipPolicy(policy.implementationOwnership)}

${renderTaskShapingPolicy(policy.taskShaping)}

<sdd-routing>
- An explicitly requested route wins: no duplicate route-selection prompt. Otherwise assess and recommend one route; summarize the relevant request context, assessed scope, clarity, risk, and why the recommendation fits before asking with \`{{userQuestionTool}}\` for Direct, Accelerated, or Full. On an answerless result, make at most three total attempts. After the third answerless result, treat the recommended route as selected. Any explicit user answer wins. A generic SDD request sets Accelerated as the minimum unless Full risk applies.
- Direct is clear, bounded, low-risk: ${renderSddRoute('direct')}. Documentation or mechanical work may remain Direct across multiple files when clear and low risk.
- Accelerated SDD covers multi-surface behavior, architecture, partial clarity, or moderate risk: ${renderSddRoute('accelerated')}; run specify -> plan -> tasks in one uninterrupted root pass. Do not pause between those planning artifacts except for a material unresolved decision. Gates: ${accelerated.validationGates.join(' -> ')}.
- Full SDD covers uncertainty, cross-cutting behavior/architecture, high contract risk, or high failure cost: ${renderSddRoute('full')}. Gates: ${full.validationGates.join(' -> ')}; checklist conditional.
- After \`ready\` on Accelerated/Full, ask with \`{{userQuestionTool}}\`: \`Review plan with Oracle (Recommended)\` or \`Proceed without review\`. Any explicit \`Proceed without review\` answer wins. If the review question returns answerless, retry to that limit. After the third answerless result, treat \`Review plan with Oracle (Recommended)\` as selected. For review, load \`plan-reviewer\`; accept only \`[OKAY]\`/\`[REJECT]\` with at most 3 actionable blockers. On \`[REJECT]\`, repair same-intent planning artifacts, revalidate affected gates, and use fresh Oracle rounds until \`[OKAY]\` or a human-owned blocker. On \`[OKAY]\`, summarize the approved scope, approach, ownership, verification, and material risks before asking with \`{{userQuestionTool}}\`: \`Implement (Recommended)\` or \`Stop\`. Reuse the answerless limit. After the third answerless result, treat implementation as selected. Any explicit \`Stop\` answer wins; \`[OKAY]\` alone does not authorize implementation. Plan review never replaces mandatory final Oracle verify.
- Bounded fallbacks are only for route, plan-review, and implementation questions; never for secrets, destructive/security-sensitive actions, or material human-owned decisions.
- Happy path: verify -> archive. Artifact-backed failure loop: verify fail -> converge -> implement -> verify. Direct failure loop: verify fail -> implement -> verify.
- Same-intent discoveries update the artifact and revalidate only affected downstream artifacts; new intent starts a change.
- After Accelerated/Full selection, load the bundled \`thoth-sdd\` skill and read only the reference for the current phase. Run thoth-sdd validator. Root owns specify, clarify, plan, checklist, tasks, converge, and archive; do not delegate just to change prompts. Record owner, rationale, surface, requirements, and checks before implementation.
- Final verification is mandatory. Use a fresh ${roleTemplate('oracle')} for Accelerated/Full and materially risky Direct work. Root may run focused verification only for trivial deterministic Direct work; no implementation writer may approve its own work.
</sdd-routing>

<external-skills>
- Use bundled \`thoth-constitution\` for constitution lifecycle and \`thoth-archive\` for verified artifact-backed closeout.
- Use the installed mandatory \`tdd\` skill for behavior changes and \`simplify\` after implementation without changing behavior.
- During SDD, never invoke the thoth-agents CLI, \`npx skills add\`, or network; a missing contract means incomplete installation.
- Use progressive-context-router only for repository instruction or context-router work.
- Use architectural-grilling before specification only when the user explicitly asks to be grilled or material human-owned product or architecture decisions remain unresolved.
- Do not invoke it merely because the route is Full; while grilling, ask one material question per turn.
- Feed decisions forward; spec.md and plan.md remain canonical, without a duplicate blueprint by default.
</external-skills>

<memory>
- For resume/prior work, load the installed \`thoth-mem\` skill; never invent its protocol.
- Preserve only a reusable decision, root cause, convention, or discovery. Root owns the stable root session ID, project, lifecycle, real-user intent, and authorization.
- Follow it at verified compaction or a meaningful semantic boundary; children get bounded MEMORY, never root lifecycle.
- \`openspec/\` remains canonical; do not mirror SDD artifacts. A memory failure does not block unrelated work.
</memory>

<artifacts>
- Accelerated/Full require ${workflow.artifactRoot}{spec.md,plan.md,tasks.md,verify-report.md,archive-report.md}.
- Root owns gates/task state, moves [~] -> [x] on evidence, and keeps one product writer. ${roleTemplate('oracle')} returns read-only findings; root persists verification and archives declared deltas after PASS.
</artifacts>

<delegation>
- Use this envelope for all \`{{delegationTool}}\` delegation; parallelize only independent work and await results.
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
    'For plan-review, load the bundled plan-reviewer skill; for verify, load the matching bundled thoth-sdd reference and remain read-only.',
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
