# Independent final review 1

Verdict: FAIL
Fresh Oracle native run: 088036ee-9dff-4d0a-90e1-b33691c50edf
Agreement: sha256:55ab4734c7c017ce52c0bfd598a62a56076f601b37d5a73179667ba08c69f3ee
Technical: sha256:ddd6747f50208a50a3ed2872837b15b480dcee180b5026377743ad94effeaf4c
Tracked diff digest (git diff --binary --no-ext-diff): 41902404180fd8be443aaa33af3321120cda7d391c056d97c570f554c3bdc3f1

Blocking finding: AGENTS.md lines 27-33 require every agent to query CodeGraph before delegating source-code discovery. That makes root obtain source evidence before dispatching Explorer, contradicting AC1/AC3. Scope CodeGraph-first and fallback to the assigned investigator; explicitly permit root discovery dispatch without source queries. Add an active-instructions regression.

Otherwise reviewer found four harness renderings, bounded direct exception, writer routing, evidence requests, native lifecycle, memory, recovery, planning choices and independent verification consistent. Generated Explorer wording aligns routing, not model changes or specialist redesign. Staged spec preserves unrelated requirements. Prior Pi baseline limitation remains honest.

Independent validation: 13 focused Vitest files, 170 tests PASS; git diff --check PASS; ready validator PASS without warnings/errors. Inspected four actual harness renderings. Native writer transcript confirms 7 initial contract/rendering RED failures and subsequent GREEN including sanitized 1000 tests. Full suite/build not independently rerun.

Work input fingerprint: sha256:e3d1f7ac4bc2b02e16c0683205d7ff30ba3267e338bc5601a491acf84a15bec2
Work output fingerprint: sha256:e1734d2e38fd6734063ab9d93f11a695018467737723a135bd30014fe4aba319
Policy inputs: sha256:54c75652558193d6e92532f323dea259b6c942f79112f3e9eba25094096377bd
Policy outputs: sha256:dc2a5e9cb7d1a547db3e3f5e4e3e2e4d526d30f8c6b06bcd3d8844f889027ef8
Staged spec raw SHA256: 9216cc7a544d5ad4faec17e34db5003185e94b6e9dad726826b6a2866a5b98d5

No archive authorized by this failed review. Root assigns narrow fix within existing ownership then obtains fresh Oracle. Instruction tests do not establish live model compliance or savings.
