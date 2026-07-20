# Requirements checklist: [Feature name]

**Activation reason**: [Concrete risk, compliance need, or ambiguity.]

## Initial validation

- [ ] CHK001 [Completeness] [Question covering required actors, flows, failures, and constraints with an evidence anchor.]
- [ ] CHK002 [Clarity] [Question proving each requirement has one observable interpretation.]
- [ ] CHK003 [Consistency] [Question comparing stories, FRs, SCs, assumptions, and non-goals.]
- [ ] CHK004 [Measurability] [Question proving every FR/SC has objective evidence.]
- [ ] CHK005 [Coverage] [Question mapping every US/FR/SC and failure mode.]

## Domain lenses

[Add sequential CHK items only for applicable lenses such as security,
accessibility, compliance, performance, migration, or domain rules; otherwise
keep the evidence-backed None line.]

- None: [evidence-backed reason no domain-specific lens applies]

## Revalidation

[After requirement-affecting changes, add checked CHK items. If none occurred,
keep only the evidence-backed no-op.]

- [ ] CHK006 [Coverage] [Confirm affected US/FR/SC were revalidated after the change.]
- Not required: [evidence-backed reason]
