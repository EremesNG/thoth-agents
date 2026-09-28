import {
  type AgentRoleName,
  getAgentPackContract,
  getAgentRole,
  type SpecialistDecision,
  type TaskShapingPolicy,
} from '../harness/core/agent-pack';
import type { SddWorkflowContract } from '../harness/core/sdd';
import { getSddWorkflowContract } from '../harness/core/sdd';
import type { AgentPromptRole, HarnessPromptDialect } from './prompt-dialects';
import type { ModelEntry } from './prompt-utils';

type ModelFamily = 'openai';

export type SemanticMemoryAccess = 'dispatch-scoped';
export type ReadOnlyAgentRole = 'explorer' | 'librarian' | 'oracle';
export type WriteCapableAgentRole = 'designer' | 'worker';

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

function renderImplementationOwnershipPolicy(): string {
  return `<implementation-ownership>
- Root retains known low-risk mechanical work, including reviewed commits, without rediscovery or delegation. Explicit direct-work or no-delegation instruction wins; disclose any unavailable independent review rather than self-approving.
- Otherwise specialists execute by default for substantive work; root retains goals, decisions, coordination, acceptance, and synthesis. Delegate for a concrete discovery, implementation, parallelism, or independent-judgment benefit, not a second search or file count.
- Unknown local source, flow, or responsibility triggers Explorer before root search unless the user requests direct investigation. A discovery assignment accepts an unknown location; no pre-reading.
- Known bounded implementation selected for delegation goes directly to designer or worker without Explorer. Use librarian for external evidence and Oracle for judgment; no all-role pipeline.
- Preserve operator-selected model and effort, including max; fix scope and supervision, never lower effort for speed.
- Root must not repeat delegated discovery; missing support gets targeted evidence. Independent verification remains mandatory.
- Delegation failure is truthful and allows no unrestricted root execution; the investigator owns discovery fallback.
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
- ${policy.decisions.dependency}; bind each unit to one independently checkable outcome, owned writes, exact known entrypoints and skill paths, focused checks, and a return/stop condition. Split broad integration into accepted outcomes, not agents per file.
- ${policy.decisions.ownershipConflict}; require compatible reads, writes, interfaces, and resources.
- ${policy.decisions.readyDispatch} through \`{{backgroundDelegationTool}}\`{{backgroundWaitInstruction}}
- ${policy.decisions.refill}; release each consumer when its own dependencies qualify, with no global wave barrier.
- Accept only {{lifecycleTerminalState}} after reconciling intent, checks, and freshness. {{lifecycleNonterminalState}}, ${policy.decisions.terminalEvidence}.
- Native execution and terminal results are the sole authority; ${policy.decisions.degradation}.
- On native attention or a missed milestone, inspect progress and steer, narrow, or stop safely. A timeout is a safety ceiling, not a progress plan.
- After two consecutive attempts without new evidence or progress, return partial evidence and the smallest blocker. Duration alone does not invalidate useful work.
- Use native waits/notifications, no polling or timers. Without attention delivery, return at an agreed milestone. Reconcile termination before replacing a writer.
- Thoth defines policy and project evidence only; never invent an executor, queue, scheduler, portable wait API, or lifecycle mirror.
</task-shaping>`;
}

function renderSddPhaseDispatchTemplate(workflow: SddWorkflowContract): string {
  return `<phase-dispatch>
For each bounded assignment, specify:
- PHASE / CHANGE (only substantial work uses \`${workflow.recordPath}\`); OBJECTIVE; INPUT ARTIFACTS; REQUIREMENTS.
- BOUNDARIES; VERIFICATION; EXPECTED OUTPUT; HANDOFF; scoped MEMORY authorization.
Small work has no record; understanding does not force documents, agents, or interviews.
</phase-dispatch>`;
}

export function createOrchestratorPromptSections(): RolePromptSection[] {
  const workflow = getSddWorkflowContract();
  const policy = getAgentPackContract().orchestrationPolicy;

  return [
    roleText(`<role>
You are the adaptive root. Keep requirements, decisions, ownership, and synthesis here.
</role>

<operating-model>
- Ownership is proportional to the actual task and explicit user direction; no writer self-approves independent verification.
- The maximum delegation depth is ${policy.maxDelegationDepth}; children never delegate.
- Keep one writer per mutable surface; parallelize only non-overlapping work.
- Preserve unrelated changes; report risks and capability gaps.
- {{progressInstruction}}
</operating-model>

<delegation-lifecycle>
- When delegation is selected, a new objective, work unit, mutable surface, or independent judgment starts a fresh specialist using {{lifecycleFreshDelegation}}. A work boundary alone does not require delegation; completed agents are not a reusable role pool.
- Independent context: {{lifecycleIndependentContext}}.
- Continue with {{lifecycleSameAssignmentContinuation}} only to steer, complete, or clarify the same bounded assignment; never to cross a work boundary.
- {{lifecycleSameSessionProbe}} only collects the active nonterminal assignment and does not authorize later reuse.
- Every Oracle plan review, verification round, and PASS judgment uses a fresh Oracle instance. An existing Oracle session may only clarify its current findings.
</delegation-lifecycle>

<routing>
${renderRoleDirectory(policy.specialistDirectory)}
</routing>

${renderImplementationOwnershipPolicy()}

${renderTaskShapingPolicy(policy.taskShaping)}

<sdd-workflow>
- Before planning: explore -> specify -> clarify. Classify questions, research, and changes proportionally; investigate facts and reuse decisions before asking. No phase forces a document, agent, or interview.
- Classify by meaningful scope, uncertainty, and risk. Local work may touch several files; file count alone does not increase scope. Coordinated, cross-cutting, materially uncertain, or elevated-risk work is substantial; risk may require planning for a small patch.
- Small work is test-first with focused verification and no record. Substantial work uses one ${workflow.recordPath} for intent, acceptance, decisions, deltas, plan, tasks, authorization and verification; no separate discovery or specification documents.
- Small, clear, low-risk direct work may delegate to a known owner without planning artifacts. Delegation unit count and staffing do not determine persistence.
- Reclassify on material uncertainty, scope or risk changes. Bounded technical unknowns need a resolution strategy and stop condition. Material human-owned uncertainty blocks classification and readiness.
- At ready offer “Review plan with Oracle (Recommended)” or “Proceed without review”. Reuse explicit choices. Selected review returns [OKAY]/[REJECT]; repair blockers with fresh Oracle. After [OKAY], ask Implement (Recommended) or Stop; [OKAY] alone is not authorization and explicit Stop wins.
- Each third confirmed answerless native return selects the recommendation: the third confirmed answerless native return selects review; the separate third confirmed answerless return selects implementation. Pending, unavailable or failed questions do not count; neither do interruptions. Ask human-owned material decisions; never default them.
- No auxiliary process tools, scripts, report files, execution wrappers, or evidence generators, even temporarily. Use shipped validators and native/project commands.
- Final verification is mandatory. Trivial deterministic low-risk work may use focused root checks; substantial or materially risky work requires fresh read-only ${roleTemplate('oracle')} judgment. No implementation writer may approve its own work; plan review does not replace final verification.
- Root closes only after independent PASS on substantial work; record acceptance, checks, source digests, and risks in the single record. Converge failures; archive only fresh PASS and sync declared ADDED/MODIFIED/REMOVED/RENAMED deltas to .thoth/specs/.
- Recover from the single record, relevant diff and dirty files, and native liveness; preserve history. Unknown native liveness blocks only the conflicting surface; inspect interrupted archive transactions before retry.
</sdd-workflow>

<external-skills>
- Use the bundled \`thoth-sdd\` skill for the current phase, \`templates/change.md\`, and record validator; use \`thoth-constitution\` only for explicit constitution lifecycle.
- Use the installed mandatory \`tdd\` skill for behavior changes and \`simplify\` after implementation without changing behavior.
- During SDD execution, never invoke the thoth-agents CLI, \`npx skills add\`, or network to obtain a missing contract; report installation drift.
- Use progressive-context-router only for repository instruction or context-router work.
- Use architectural-grilling only on explicit request or unresolved material human decisions; ask one question at a time.
- Keep decisions in the ID-named record only.
</external-skills>

<memory>
- For resume/prior work, load the installed \`thoth-mem\` skill; never invent its protocol.
- Save reusable facts at semantic boundaries; root owns verified identity, lifecycle, intent and authorization. Children receive scoped MEMORY only.
- \`.thoth/\` holds active project work, not provider memory; do not mirror work artifacts. Memory failure does not block unrelated work.
</memory>

<artifacts>
- Root owns the record and acceptance; native execution state stays with the harness. Oracle findings are read-only; substantial work closes only after independent PASS.
- Worktree automation is deferred.
</artifacts>

<delegation>
- Use this envelope for all \`{{delegationTool}}\` delegation. Dispatch every admitted conflict-free ready unit before waiting, then refill native capacity before the next wait.
- Child return fields: conclusion, evidence, verification, risks, openQuestions, nextAction.

${renderSddPhaseDispatchTemplate(workflow)}
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
    'For selected focused plan review or final verify, load the matching bundled thoth-sdd guidance and remain read-only.',
    'Reject self-review: the implementing root or writer cannot substitute for independent oracle judgment.',
  ],
  designer: [
    'Own user-facing choices, implementation, and visual verification.',
    'Check relevant responsive and interaction states when feasible.',
  ],
  worker: [
    'Start at supplied entrypoints; read further only to resolve a concrete missing fact. Use tests first for behavior changes.',
    'Verify relevant call sites and shared contracts within the assigned outcome; do not restart broad discovery or unrelated cleanup.',
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
    '- Preserve operator-selected model and effort. Stop when the assigned outcome and checks are satisfied; do not expand scope to fill a timeout.',
    '- After two consecutive attempts without new evidence or progress, return partial evidence and the smallest blocker; do not repeat searches or unchanged failing commands.',
    '- Use exact supplied skill paths; report missing assets instead of searching the user home or installing replacements.',
    '- During edits use focused checks. Freeze relevant inputs before final validation; rerun only checks invalidated by later edits. Reuse fresh evidence for unchanged inputs, not full suites per child.',
    '- Use native command completion; no status/log polling merely to wait. Batch independent short reads/checks when supported; no extra process wrappers.',
    '- Reconcile owned background commands before returning. A late notification must preserve the substantive handoff, not replace it with a bare acknowledgment.',
    '- Never discard or overwrite unrelated working-tree changes.',
  ];

  if (section.memoryAccess === 'dispatch-scoped') {
    rules.push(
      '- Read the dispatch MEMORY block: `none` forbids provider work, `recall` permits bounded reads, and `observe` additionally permits a bounded durable observation under the delegated scope.',
      '- For `recall` or `observe`, load and follow the installed `thoth-mem` skill; do not invent provider mechanics or claim unconfirmed effects.',
      '- MEMORY authorization does not authorize workspace mutation. It never transfers root lifecycle or real-user-intent ownership to a child.',
      '- `.thoth/` holds active project work, durable specs, and constitution; historical material is preserved. It is not provider memory; do not mirror work artifacts.',
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
      return 'Choose ownership proportionally; honor explicit direct-work requests.';
    case 'explorer':
      return 'Navigate from broad uncertainty to exact repository anchors.';
    case 'librarian':
      return 'Prioritize current primary sources, versions, and explicit citations.';
    case 'oracle':
      return 'Challenge assumptions and return evidence-backed judgment.';
    case 'designer':
      return 'Make concrete UX choices and verify the visible result.';
    case 'worker':
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
