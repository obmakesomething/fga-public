# Reproduction and evidence scope

Run the README commands from the repository checkout or extracted source ZIP root. For a local tarball, create an empty directory with a private `package.json`, run `npm install /path/to/local-package.tgz --ignore-scripts --offline --no-audit --no-fund`, and import `fga-research-extract` by package name. The tarball intentionally omits `package-lock.json` because npm pack excludes it; the source ZIP includes the dependency-free lockfile. Both file sets have explicit manifests.

The package is distributed through the public GitHub repository and release assets. This release does not upload to npm, and registry name availability has not been checked. The reproduction commands perform local checks; they do not create a repository, upload, publish, or activate an operational gate. The v2 publication manifest records source-release authorization, not a self-issued assertion that public hosting succeeded.

## What the checks establish

`check:public-files` compares the exact allowlist, rejects symlinks and unsafe paths, checks payload hashes, scans text for a bounded set of sensitive patterns, and checks package metadata. Only root `.git` checkout metadata is excluded from source inspection; nested `.git`, symlinks, and `.git` in an npm artifact remain rejected. Archive inventories also exclude all Git metadata. This checker does not inspect Git history or local Git configuration. It is a local heuristic inspection, not a guarantee that no secret or rights issue exists. No dedicated secret-scanning program was installed in the preparation environment; that check was not run.

`check:public-imports` inventories the selected plain ESM runtime and example syntax, schema registry, local assets, and JSON `$ref` closure. It rejects unresolved and nonliteral imports in that reviewed subset. This syntax inventory is not a universal JavaScript parser or sandbox. Test and checker code is also inspected, syntax-checked, and executed during local verification. The preserved schema `$id` values under `fga.local` and `fga-engine.local` are identifiers, not contacted services. No schema network fetch occurs.

`check:public-claims` checks the declared exports, package status, disabled operational flags, and the exact README summary against the stored replay. The package check separately imports the installed package and compares actual exported names. Wording checks do not establish the truth of every sentence.

`check:public-examples` runs the examples twice, checks deterministic structured output against the stored complete output, and requires positive, negative, and unevaluated controls. It runs synthetic objects through extracted implementation. It does not drive a browser.

`check:public-package` performs npm dry-run and real pack with lifecycle scripts disabled, inspects actual tar member names and regular-file metadata, compares every file's bytes, installs the tarball in a new local consumer, imports the named package and schemas, checks error paths, and runs the synthetic examples/tests. Its temporary artifacts are retained for inspection. It never publishes. The full preparation also builds and inspects a source ZIP, validates its CRC and file hashes, and executes the README commands from its clean extraction.

## Recorded original local preparation

Prepared on 2026-09-29 using macOS arm64. Final verification pins Node.js 22.23.1 and npm 10.9.8. Early clean-environment checks instead resolved Homebrew Node.js 26.3.1 and npm 11.16.0; their logs are retained separately. The version mismatch was identified and the focused tests and package consumer were rerun on the pinned versions. The pinned original package was `fga-engine@0.0.1`, private and UNLICENSED. That sealed candidate was `fga-research-extract@0.1.0-research.0`. The public edition is `0.1.0-research.1`; it changes distribution metadata, documentation, and checkout-aware checks. Runtime implementation, schemas, and example bytes are unchanged from the sealed candidate.

The original focused baseline passed 57 tests (27 assertion, 16 delivery, 14 identity). Five new regression tests failed against original or not-yet-corrected extracted behavior before local fixes; their failed results are retained outside the package. Candidate tests and artifact execution results are recorded below after final verification. Counts for these synthetic tests are not external accuracy or detection rates.

<!-- validation-results:start -->
The candidate's 26 tests passed: 15 E1–E5/replay tests, 2 additional extraction regressions, and 9 checker-negative tests. The 57 focused upstream tests also passed against the corrected candidate modules in a separate compatibility workspace. A real 35-file tarball was inspected and installed, and its package-name imports, four schemas, error paths, 15 research tests, and exact E1–E5 outputs passed. These counts are separate checks, not 98 distinct field cases or an external benchmark. Final bundle-specific inspection and clean ZIP command logs are retained by the local preparation report.
<!-- validation-results:end -->

Only the private baseline test workspace downloaded Ajv 8.20.0 and the four versions already resolved by the original lockfile, with installation scripts disabled. The installed manifests had no install lifecycle hooks. These test dependencies and their notices remain outside the candidate and archives. The candidate itself has zero npm dependencies.

Isolation was applied by the local preparation harness, with an allowlisted environment, fresh HOME and distinct empty npm configs. A macOS sandbox profile denied all network operations and reads of the original/private source tree and the user's home outside the specific test workspace. A live loopback listener was reachable outside that profile; inside, socket creation and attempted source-file reads failed with EPERM. This supports isolation for the recorded processes. Running the public commands elsewhere does not automatically reproduce that OS profile.

Runtime model calls, customer actions, and remote writes were absent from the recorded isolated candidate runs. Development-agent model use is separate from FGA runtime model use. Source downloads and the baseline npm installation used authorized network reads before isolated tests. No total-cost-zero claim is made.

Payload hashes exclude the hash manifest itself. External tarball/ZIP hashes live beside the bundles; they identify bytes and are not independent endorsements.

Command semantics were checked against the installed npm CLI help and official [npm pack documentation](https://docs.npmjs.com/cli/v10/commands/npm-pack/), [npm ci documentation](https://docs.npmjs.com/cli/v10/commands/npm-ci/), and [package.json documentation](https://docs.npmjs.com/cli/v10/configuring-npm/package-json/).

## Public distribution verification

The publication edition adds three focused checker tests: source-checkout Git metadata handling, gitfile/symlink boundaries, and separation of publication authorization from all nine disabled operational flags. The complete public test command therefore has 29 tests (15 research, 2 extraction regressions, 12 checker tests). The three new checks first failed against the old candidate checkers before the publication changes. This count is a test inventory, not a result claim; current results are reported with the GitHub release after execution.

The original isolated runs above had no remote writes. Publishing this edition separately creates a public repository, pushes the reviewed files, and uploads release assets. Those distribution actions are not FGA runtime activity. The original private repository, local sealed candidate, and original bundles are preserved.
