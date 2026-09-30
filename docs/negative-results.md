# Negative results and open checks

The negative cases are part of the research result. They identify inputs the selected functions cannot turn into an authorized product claim. Two modules contained source behavior gaps and were corrected locally. Five focused regression tests failed before the relevant corrections and passed afterward. The source behavior and candidate behavior are retained in the private execution ledger. Candidate tests and the isolated tarball consumer passed; no external validation is implied.

| Case | Expected local observation | Claim boundary |
| --- | --- | --- |
| Heuristic evidence | Default policy demotes a heuristic `FAIL` to `REVIEW`; an opt-in preserves the local `FAIL` field. | This package has no CI action adapter. Preserving `FAIL` does not establish `BLOCK`. |
| Missing contract or incomplete transition | AssertionV2 returns `UNKNOWN` or `NOT_EVALUATED` under the applicable guard. The local correction also treats missing predicate-specific observation data as `NOT_EVALUATED`. | Neither is a passed check or evidence of a product defect. |
| Caller-declared observation | A caller can supply status, lifecycle, approval, and hash fields that satisfy local predicates. | Local consistency does not prove a browser action occurred or an owner approved a contract. |
| Self-consistent grounding | Valid internal hashes can produce a candidate class. | `hardEligible` remains false without independent authority readback. |
| Synthetic delivery receipts | All six local gates can be made satisfied, causing raw decision enum `BLOCK`. | The result remains `NOT_ACTIVATED` and cannot block a real change. No external issuer or policy authority was checked. |

## Source behavior gaps retained as negative baselines

In the selected source revision, `isVerdictEvidenceEligible` used a caller-supplied `edge.status` before its known type's taxonomy. A caller could mark a known model-proposed relation `OBSERVED` and make it locally eligible. Also, `decorateEdge` overwrote restrictive declared provenance with the taxonomy, and `isDeterministicEdge` accepted an observed label on a known heuristic relation. The candidate correction rejects known model-only upgrades, preserves restrictive model/unimplemented labels through decoration, and requires a deterministic taxonomy as well as a deterministic supplied status. Arbitrarily fabricated but otherwise valid observed records remain outside this guarantee. This is a local input-integrity correction, not browser provenance authentication.

In the selected source revision, the `DIRECT_TARGET_CHANGED` predicate read `transition.directTargetDelta?.changed === true`. General transition completeness did not require `directTargetDelta`. When all other guard fields were supplied and the expected value was `true`, missing delta could produce `FAIL`; with expected value `false`, it could produce `PASS`. The candidate correction requires actual boolean predicate data for `DIRECT_TARGET_CHANGED`, `FOCUS_CHANGED`, and `TRANSITION_OBSERVED`, and an array of changed elements for `ALL_BOUND_PEERS_CHANGED`; missing data yields `NOT_EVALUATED`. It still trusts the caller's supplied observation and lifecycle records.

A separate historical negative mechanism motivates one boundary: a relative destination URL can resolve against a page's document base URL to a different destination than a checker predicts from the request URL alone. A source-only or synthetic replay cannot establish the browser's actual resolution or the target's current behavior. That historical observation is not part of the new E1–E5 dataset and supplies no measured accuracy or customer result here.

These tests are synthetic controls, not a browser evaluation, field validation, external benchmark, or empirical false-positive study. Any unexpected result should be retained with its exact fixture and output rather than silently reclassified as a passing case.
