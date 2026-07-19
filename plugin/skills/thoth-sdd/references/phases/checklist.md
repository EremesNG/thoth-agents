# Checklist contract

**Owner**: root<br>
**Output**: `checklists/requirements.md`<br>
**Activation**: high contract/failure risk, compliance sensitivity, or
ambiguity-prone scope

Record the concrete activation reason. Use sequential `CHK###` items to audit
the requirements—not implementation—across the base taxonomy: Completeness,
Clarity, Consistency, Measurability, and Coverage.

Add only applicable domain lenses, such as security, privacy, accessibility,
compliance, performance, migration, or domain-specific failure rules. If none
apply, record an evidence-backed `None` decision instead of boilerplate checks.
Map every US, FR, SC, actor, failure mode, and relevant constraint to evidence.

After clarification or planning changes, check affected revalidation items. If
no requirement-affecting artifact changed, record an evidence-backed `Not
required` no-op. Unresolved high-risk gaps return to specify; checklist status
must never be inferred from code tests.
