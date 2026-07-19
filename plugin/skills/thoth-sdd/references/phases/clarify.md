# Clarify contract

**Owner**: root<br>
**Activation**: material ambiguity only

Classify requirement dimensions as **Clear**, **Partial**, or **Missing** across
scope, actors, data, interactions, non-functional constraints, failure behavior,
and success evidence. Resolve from repository evidence or a safe documented
assumption first. Ask one targeted human question only when the answer materially
changes the result; Full SDD should normally ask no more than five high-impact
questions in one clarification pass.

Write every accepted answer directly into `spec.md`, cite the changed FR/SC/story,
then re-run structural validation and revalidate any existing requirements
checklist. Do not create a parallel clarification document.
