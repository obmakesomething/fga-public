# FGA research extraction

This is a locally runnable research extraction of evidence, comparison, identity, and delivery semantics. It contains selected real implementation files from a pinned engine revision, plus two explicitly documented local corrections. The owner authorized distribution of this research subset through this public GitHub repository and its release downloads. It remains `UNLICENSED` and operationally `NOT_ACTIVATED`. `private: true` prevents npm registry publication; it does not describe this repository’s visibility. The package name is a local import identity; this edition is distributed without an npm registry upload, and name availability in the registry has not been checked.

[Download the research prerelease](https://github.com/obmakesomething/fga-public/releases/tag/v0.1.0-research.1) for the source ZIP, installable tarball, and SHA-256 checksums. Clone this repository or extract the source ZIP, then run the commands below from its root.

For example, the evaluator distinguishes a missing transition from supplied positive and negative synthetic transitions. A local `FAIL` does not issue a block. Even the delivery function's raw `BLOCK` enum remains `NOT_ACTIVATED`.

```sh
npm ci --ignore-scripts --no-audit --no-fund --offline
npm test
npm run examples
npm run check:public-files
npm run check:public-imports
npm run check:public-claims
npm run check:public-examples
npm run check:public-package
```

Use Node.js 22 or newer, npm, and the system `tar` command for the package check. There are no runtime or development npm dependencies in this package. The installation command needs no registry downloads for this dependency-free lockfile. `--offline` and `--ignore-scripts` alone are not network isolation or a security sandbox.

`npm run examples` returns complete synthetic inputs, exact function outputs, and an interpretation and limit for E1–E5. The following is the recorded summary; automated checks compare it with a fresh replay.

<!-- example-summary:start -->
```json
{
  "E1": {
    "observedEligible": true,
    "modelEligible": false,
    "unimplementedEligible": false,
    "spoofedTriggerEligible": false
  },
  "E2": {
    "missingTransition": "NOT_EVALUATED",
    "passingTransition": "PASS",
    "failingTransition": "FAIL",
    "proposedTransition": "NOT_EVALUATED",
    "missingDelta": "NOT_EVALUATED"
  },
  "E3": {
    "targetMismatch": "TRANSITION_BINDING_MISMATCH",
    "environmentMismatch": "ENVIRONMENT_IDENTITY_MISMATCH",
    "missingReceipt": "NOT_EVALUATED"
  },
  "E4": {
    "candidateGroundingClass": "APPROVED_CONTRACT",
    "hardEligible": false,
    "missingReceiptHardEligible": false
  },
  "E5": {
    "completeDelivery": {
      "decision": "BLOCK",
      "activationStatus": "NOT_ACTIVATED",
      "canClaimVerifiedFixed": false
    },
    "unknownIssuer": {
      "decision": "NOT_EVALUATED",
      "activationStatus": "NOT_ACTIVATED",
      "canClaimVerifiedFixed": false
    },
    "scopeDrift": {
      "decision": "REVIEW",
      "activationStatus": "NOT_ACTIVATED",
      "canClaimVerifiedFixed": false
    },
    "elevatedPolicy": {
      "decision": "NOT_EVALUATED",
      "activationStatus": "NOT_ACTIVATED",
      "canClaimVerifiedFixed": false
    }
  }
}
```
<!-- example-summary:end -->

To use the downloaded tarball from an empty consumer directory, run `npm init -y` and `npm install /path/to/fga-research-extract-0.1.0-research.1.tgz --ignore-scripts --offline --no-audit --no-fund`. Import it from an `.mjs` file by name:

```js
import { evaluateAssertionV2 } from 'fga-research-extract';
import { getPublicSchema } from 'fga-research-extract/schemas';
const result = evaluateAssertionV2({});
console.log(result.verdict, result.reasonCode); // UNKNOWN CONTRACT_MISSING
const schema = getPublicSchema('transition-contract-projection-v2');
```

The root has 22 named exports. The schema entry exposes four schema documents with content hashes. The manifest entry records the exact exported subset and unchanged disabled authority fields. Edge and grounding diagnostics add selected internal functions; this is not the original complete `public/v1` API. Proof packet builders/verifiers, readiness issuers, browser collection, CI actions, customer packs, and external model calls are absent from package bytes.

The source revision is `495aead654a75d7a7eddd3b3ea5387884471561b`. Four implementation modules and four schemas preserve source bytes. Two implementation modules contain local fixes for provenance downgrade/upgrade handling and missing predicate observations. The schema registry is narrowed with one path adjustment, and the entry point is newly assembled. [Public provenance](provenance/public-source-manifest.json) records source and candidate hashes. No claim depends on access to the private source repository at runtime; the original commit is not publicly resolvable, and ownership has not been independently verified.

The local validation environment is macOS arm64, Node.js 22.23.1, npm 10.9.8. The retained source baseline covers 57 upstream tests; candidate synthetic and checker tests are reported separately in [reproduction](docs/reproduction.md). The tarball consumer and a clean source ZIP are checked with a fresh credential-free home, without the original source tree, and with an OS network-deny profile. No hosted CI or independent external validation is claimed.

These results establish narrow behavior for supplied records. They do not authenticate observations, justify a chosen expectation, establish a product defect, prove a new regression, authorize a real block, or certify a fix. They do not demonstrate general UX quality, operational safety, commercial adoption, customer benefit, or frontier AI safety. All browser-looking URLs and approval/receipt values are synthetic. Hash equality establishes byte consistency, not producer trust or independent authority.

The owner’s source-publication instruction does not grant an open-source license or establish independent rights review. `UNLICENSED` is retained; no new license is granted by this release. No third-party assets or npm dependency bytes are bundled. Implementation extraction, corrections, tests, and documentation were prepared with AI assistance; see [authorship](docs/authorship.md).

Read [architecture](docs/architecture.md), the [claims table](docs/claims-and-limits.md), [negative results](docs/negative-results.md), and [reproduction details](docs/reproduction.md) before interpreting an output.
