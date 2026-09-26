# Planning choices and recovery

Root selects the smallest useful artifacts after focused exploration; never ask
for Direct/Accelerated/Full. Trivial bounded work may remain artifact-free.
For a ready persisted plan, summarize scope, approach, ownership, checks and
material risks, then ask through the harness's native question tool:

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
