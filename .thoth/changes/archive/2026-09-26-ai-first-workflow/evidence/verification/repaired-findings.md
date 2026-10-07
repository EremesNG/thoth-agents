# Independent findings and repairs

Fresh reviewers identified target replacement and archive admission races, incomplete checkpoint lineage/baseline/selected dependency evidence, and later agreement/change identity gaps. Implementation was not approved on test success alone.

The first aggregate run returned FAIL from /root/oracle_workflow_final: changed goal with retained agreement digest and a copied checkpoint could still report resumable; contradictory requested change identity was not rejected. A fresh bounded worker owns those regressions and repairs. Aggregate approval remains pending a new review.

The first full suite had 947 passing and two failing tests (949 total). Both publication failures were caused by the central catalog requiring the removed thoth-sdd skill. The publisher now synchronizes required owned skills from the built plugin inventory, then the existing central validator verifies them in the release tag. Six focused publication tests pass, including rejection of an unreleased skill, idempotent retry, preservation of another plugin and rejection of a concurrent central push. Tests use only temporary local repositories; no remote publication occurred.

Earlier dispatch began before the new baseline helper existed. This change keeps its unit baselines explicitly unknown rather than fabricating historical content. The initial workspace inspection reported only unrelated staged/deleted benchmark SQLite files; review must preserve those entries.
