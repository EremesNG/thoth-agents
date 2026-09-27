# Planning readiness, choices and recovery

## Before a plan exists

Use the smallest process that preserves intent and verification; never ask the
user to choose Direct/Accelerated/Full. These are reasoning obligations, not a
new artifact bundle, runtime state machine, or requirement to interview everyone.

### Classify

Distinguish questions, research, and requested changes. A consultation does not
authorize a mutation. Use bounded inspection to assess scope, uncertainty, risk,
coordination, and recovery needs; do not create a plan merely to classify work.

Clear, bounded, low-risk work may go through inspect -> implement -> verify
without planning files. Useful delegation alone does not require persistence,
nor does unit count. Root or a fitting specialist may implement; preserve one
writer per surface, native lifecycle authority, and proportional verification.
Nontrivial or risky changes, coordination needing a durable agreement, and work
needing resumption require persisted planning. If direct work reveals material
uncertainty, broader scope, or risk, stop expanding the implementation, preserve
useful work, reclassify, and resolve the new bounds before proceeding.

### Explore

Inspect current behavior, relevant product contracts, tests, interfaces and
constraints. Identify what is known, what evidence supports it, and what is still
unknown. Search focused entrypoints; delegate discovery only for net gain. Exit
when there is enough grounded understanding to specify the change and identify
material uncertainty, not when the whole repository has been read.

### Specify

Describe desired observable behavior, inclusions and exclusions, measurable
acceptance, and autonomy bounds independently of implementation steps. Reuse
settled requirements and durable specifications. Exit when success and scope can
be judged without silently substituting technical guesses for user intent.

### Clarify

Separate facts, assumptions, and human-owned decisions. Repository facts require investigation,
not questions asking the user to explore for the agent. Ask only for unresolved
material intent, priorities, trade-offs, permissions, or other necessary human
input. Do not repeat settled decisions or treat silence as product approval.
Use architectural-grilling only when explicitly requested or when a material
human-owned product or architecture decision needs it; follow its one-material-
question-at-a-time guidance. Grilling is not a mandatory planning interview.

Material uncertainty affecting intent, acceptance, approach, or authorization blocks a ready plan.
Iterate exploration, specification, and clarification when new evidence requires
it. Bounded remaining technical uncertainty is allowed only with an explicit
resolution strategy and a point at which an affected implementation must stop
or be replanned. It must not hide an unresolved human-owned decision.

### Plan and persist

Only after those readiness conditions hold, shape technical outputs,
dependencies, read/write ownership, shared resources, and verification. Then
persist the agreed result in `work.yaml`, using existing goal, bounds, autonomy,
acceptance, decisions, and unit fields. No separate discovery or specification documents are required.
Keep useful findings or residual uncertainty in decision rationale, unit inputs
and checks, or optional referenced context only when a consumer needs it; do not
copy the whole conversation. A draft or checkpoint is not a ready plan.

The `ready` validator checks structure, references, coverage and freshness, not
whether exploration was adequate or human decisions were really settled. Root
must assess these semantic exit conditions before calling the plan ready;
selected Oracle review independently challenges them. Passing tests of these
instructions does not prove harness/model compliance.

## Choices for a ready persisted plan

Summarize scope, approach, ownership, checks and material risks, then ask through
the harness's native question tool:

1. **Review plan with Oracle (Recommended)** or **Implement directly**. Offering
   this choice is mandatory unless already resolved explicitly or by the bounded
   default for this plan. General authorization of the objective does not choose
   either option. Direct implementation skips only the plan review.
2. If review was selected, load the sibling plan-reviewer skill and use a fresh
   read-only Oracle. Repair same-intent [REJECT] blockers and obtain a fresh
   judgment. After [OKAY], summarize the approved plan and ask **Implement
   (Recommended)** or **Stop with approved plan**, even if the objective was
   already authorized. Oracle approval alone never authorizes implementation.

An explicit Stop leaves the approved plan available and performs no implementation
or archive. Keep it stopped until the user resumes it. Final fresh Oracle PASS
remains mandatory for persisted work regardless of the first choice.

## Bounded unanswered returns

Each of those two questions has its own budget of at most three total native
attempts. An attempt consumes that budget only when a successfully presented
question returns without a usable answer to that choice. Ask one choice at a
time. Count a confirmed native timeout or an unanswered/cancelled return; do not
count an explicit Stop as unanswered. Preserve any usable explicit answer, even
when the enclosing multi-question result is partial.

After the third confirmed unanswered return, record and announce the recommended
resolution: review with Oracle for the first question; implement for the second,
only after [OKAY]. Explicit answers always override the default. Before dispatch,
check for newer explicit user input. A late Stop stops further execution; reconcile
any active native writer rather than treating it as already stopped.

Pending/open questions, elapsed time observed by root, process interruption,
missing tools, unavailable UI and transport errors never count. Do not start a
retry while the preceding question remains open. Do not add an artificial timer
or an unsupported tool argument. Respect native retry restrictions; when the
surface cannot provide these choices or evidence, report that limitation and
retain the unresolved choice. Never pretend three questions were presented.
The policy does not override harness/system restrictions. It does not select a
pipeline or authorize secrets, destructive/security-sensitive actions, or new
material product/architecture decisions. Those still require their real answer.

## Compact root-owned evidence

For persisted planning, root keeps one small record at
`.thoth/changes/<id>/evidence/planning.json`. This is documentary evidence, not
a scheduler, event log, schema extension, or source of native lifecycle truth.
Root writes it before asking and updates it from actual native returns. Children
neither ask these questions nor mutate the record. Load it alongside work.yaml
when planning or resuming; the unit-context helper does not load it automatically.

Record the change id and current agreement/technical fingerprints; for each
choice, record its value, explicit/fallback/pending resolution, confirmed
unanswered count, distinct unanswered native return references, and any open question
reference. Bind the implementation choice to the Oracle approval it follows.
Store the review verdict, native reviewer reference, plan fingerprints and
reviewed input digests. A small example of a choice resolved by default is:

```json
{
  "choice": "oracle",
  "resolution": "fallback",
  "unansweredCount": 3,
  "nativeReturnRefs": ["actual-return-1", "actual-return-2", "actual-return-3"],
  "openQuestionRef": null
}
```

Use actual references, never the example values. Counts without supporting native
returns are unknown, not permission. Keep at most the three references per
question and the current approved-plan identity; do not copy whole transcripts.
Safe replacement of the small record should preserve the last valid copy when
possible. A missing, torn or contradictory record requires native/user evidence;
it cannot invent prior questions, approval or authorization.

On resume, retain explicit **and fallback** resolutions, a Stop and the remaining
attempt budgets. Reconcile a recorded open question with native evidence before
retrying; interruption does not consume a return. Expected implementation edits
do not reopen completed choices. A material change to the reviewed approach,
interfaces, ownership, acceptance or risk invalidates the review: preserve the
choice to review, use a fresh Oracle, then obtain the implementation choice for
that new approval. A stored Stop is never cleared by replanning. Routine in-scope
refinement does not require repeated permission, but final verification always
uses the current agreement, definitions, content and evidence.

The offline work validator does not validate this documentary JSON or authenticate
native answers. Root must reconcile it with the user and native results. Checks
of generated instructions prove contract consistency, not harness/model compliance.
