import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  EDGE_STATUS,
  decorateEdge,
  evaluateAssertionV2,
  hashTransitionContractProjection,
  isDeterministicEdge,
  isVerdictEvidenceEligible,
  verdictEvidenceEdges,
} from "fga-research-extract";
import { runExamples } from "../examples/run.mjs";
import { contractFixture, navigationFixture, transitionFixture } from "../examples/fixtures.mjs";

const examples = runExamples();

test("E1 compares one relation with only declared source and status changed", () => {
  const { inputs, outputs } = examples.examples.E1;
  assert.equal(inputs.observedRelation.type, inputs.modelRelation.type);
  assert.equal(inputs.observedRelation.from, inputs.modelRelation.from);
  assert.equal(inputs.observedRelation.to, inputs.modelRelation.to);
  assert.equal(inputs.observedRelation.confidence, inputs.modelRelation.confidence);
  assert.equal(inputs.observedRelation.status, EDGE_STATUS.OBSERVED);
  assert.equal(inputs.modelRelation.status, EDGE_STATUS.MODEL_PROPOSED);
  assert.equal(outputs.observedEligible, true);
  assert.equal(outputs.modelEligible, false);
  assert.equal(outputs.unimplementedEligible, false);
  assert.deepEqual(outputs.filteredRelationTypes, [{ type: "contains", status: "OBSERVED" }]);
  assert.equal(outputs.decoratedTrigger.status, EDGE_STATUS.MODEL_PROPOSED);
});

test("E1 known model-only type cannot be promoted by caller-supplied OBSERVED status", () => {
  assert.equal(examples.examples.E1.outputs.spoofedTriggerEligible, false);
});

test("E1 decorator preserves restrictive provenance and deterministic check rejects model-only type spoof", () => {
  const base = { type: "contains", from: "a", to: "b" };
  const proposal = decorateEdge({ ...base, status: EDGE_STATUS.MODEL_PROPOSED });
  const unimplemented = decorateEdge({ ...base, status: EDGE_STATUS.UNIMPLEMENTED });
  assert.equal(proposal.status, EDGE_STATUS.MODEL_PROPOSED);
  assert.equal(unimplemented.status, EDGE_STATUS.UNIMPLEMENTED);
  assert.deepEqual(verdictEvidenceEdges([proposal, unimplemented]), []);
  assert.equal(isDeterministicEdge({ type: "triggersState", status: EDGE_STATUS.OBSERVED }), false);
  assert.equal(isVerdictEvidenceEligible({ type: "contains", status: "UNSUPPORTED_STATUS" }), false);
  assert.equal(isVerdictEvidenceEligible(null), false);
});

test("E2 no action, completed positive and completed negative are distinct", () => {
  const { outputs } = examples.examples.E2;
  assert.deepEqual(
    [outputs.missingTransition.verdict, outputs.passingTransition.verdict, outputs.failingTransition.verdict],
    ["NOT_EVALUATED", "PASS", "FAIL"],
  );
  assert.equal(outputs.missingTransition.reasonCode, "TRANSITION_MISSING");
  assert.equal(outputs.proposedTransition.verdict, "NOT_EVALUATED");
  assert.equal(outputs.passingTransition.coverage.comparison, "EVALUATED");
  assert.equal(outputs.failingTransition.coverage.comparison, "EVALUATED");
  assert.equal(outputs.failingTransition.blockDecision, "NOT_ISSUED");
  assert.equal(outputs.failingTransition.canClaimVerifiedFixed, false);
});

test("E2 missing direct predicate data cannot become a local FAIL", () => {
  const result = examples.examples.E2.outputs.missingDelta;
  assert.equal(result.verdict, "NOT_EVALUATED");
  assert.equal(result.hardFailureEligible, false);
});

test("missing focus, presentation, and peer predicate data stay unevaluated", () => {
  const navigationIdentity = navigationFixture();
  const cases = [
    {
      contract: { expected: { predicate: "FOCUS_CHANGED", value: true }, binding: { eventType: "focus" } },
      mutate(transition) { transition.action.type = "focus"; delete transition.eventOutcome.focusChanged; },
    },
    {
      contract: { expected: { predicate: "TRANSITION_OBSERVED", value: true } },
      mutate(transition) { delete transition.eventOutcome.presentationTransitionObserved; },
    },
    {
      contract: {
        expected: { predicate: "ALL_BOUND_PEERS_CHANGED", value: true },
        binding: { relation: { relationId: "synthetic-peers", peerIdentities: ["#panel"] } },
      },
      mutate(transition) { delete transition.relatedElementDelta; },
    },
  ];
  for (const { contract: changes, mutate } of cases) {
    const contract = contractFixture();
    Object.assign(contract.expected, changes.expected);
    if (changes.binding?.eventType) contract.binding.eventType = changes.binding.eventType;
    if (changes.binding?.relation) contract.binding.relation = changes.binding.relation;
    contract.approval.approvedContentHash = hashTransitionContractProjection(contract);
    const transition = transitionFixture();
    mutate(transition);
    const result = evaluateAssertionV2({ contract, transition, navigationIdentity });
    assert.equal(result.verdict, "NOT_EVALUATED", contract.expected.predicate);
    assert.equal(result.hardFailureEligible, false, contract.expected.predicate);
  }
});

test("all four predicates have local true and false controls; absent data is never false", () => {
  const navigationIdentity = navigationFixture();
  const predicates = ["DIRECT_TARGET_CHANGED", "FOCUS_CHANGED", "TRANSITION_OBSERVED", "ALL_BOUND_PEERS_CHANGED"];
  for (const predicate of predicates) {
    for (const [expectedValue, observedValue, expectedVerdict] of [
      [true, true, "PASS"], [true, false, "FAIL"],
      [false, false, "PASS"], [false, true, "FAIL"],
      [false, null, "NOT_EVALUATED"],
    ]) {
      const contract = contractFixture();
      contract.expected = { predicate, value: expectedValue };
      if (predicate === "FOCUS_CHANGED") contract.binding.eventType = "focus";
      if (predicate === "ALL_BOUND_PEERS_CHANGED") {
        contract.binding.relation = { relationId: "synthetic-peers", peerIdentities: ["#peer"] };
      }
      contract.approval.approvedContentHash = hashTransitionContractProjection(contract);
      const transition = transitionFixture({ changed: observedValue === true });
      if (predicate === "DIRECT_TARGET_CHANGED") {
        if (observedValue === null) delete transition.directTargetDelta;
        else transition.directTargetDelta.changed = observedValue;
      } else if (predicate === "FOCUS_CHANGED") {
        transition.action.type = "focus";
        if (observedValue !== null) transition.eventOutcome.focusChanged = observedValue;
      } else if (predicate === "TRANSITION_OBSERVED") {
        if (observedValue === null) delete transition.eventOutcome.presentationTransitionObserved;
        else transition.eventOutcome.presentationTransitionObserved = observedValue;
      } else if (observedValue !== null) {
        transition.relatedElementDelta = {
          changedElements: observedValue ? [{ key: "#peer" }] : [],
        };
      }
      const result = evaluateAssertionV2({ contract, transition, navigationIdentity });
      assert.equal(result.verdict, expectedVerdict, `${predicate} expected=${expectedValue} observed=${observedValue}`);
      assert.equal(result.blockDecision, "NOT_ISSUED");
      assert.equal(result.canClaimVerifiedFixed, false);
    }
  }
});

test("wrong predicate data types stay NOT_EVALUATED", () => {
  const contract = contractFixture();
  const navigationIdentity = navigationFixture();
  const wrongBoolean = transitionFixture();
  wrongBoolean.directTargetDelta.changed = "false";
  assert.equal(evaluateAssertionV2({ contract, transition: wrongBoolean, navigationIdentity }).verdict, "NOT_EVALUATED");

  contract.expected.predicate = "ALL_BOUND_PEERS_CHANGED";
  contract.binding.relation = { relationId: "synthetic-peers", peerIdentities: ["#peer"] };
  contract.approval.approvedContentHash = hashTransitionContractProjection(contract);
  const wrongPeers = transitionFixture();
  wrongPeers.relatedElementDelta = { changedElements: { key: "#peer" } };
  assert.equal(evaluateAssertionV2({ contract, transition: wrongPeers, navigationIdentity }).verdict, "NOT_EVALUATED");
});

test("removed lifecycle, approval, navigation, and observation evidence cannot strengthen result", () => {
  const contract = contractFixture();
  const navigationIdentity = navigationFixture();
  for (const field of ["planned", "authorized", "attempted", "delivered", "stabilized", "captured"]) {
    const transition = transitionFixture();
    delete transition.lifecycle[field];
    const result = evaluateAssertionV2({ contract, transition, navigationIdentity });
    assert.equal(result.verdict, "NOT_EVALUATED", field);
    assert.equal(result.reasonCode, "TRANSITION_EVIDENCE_INCOMPLETE", field);
  }
  const noHash = transitionFixture();
  delete noHash.observationHash;
  assert.equal(evaluateAssertionV2({ contract, transition: noHash, navigationIdentity }).verdict, "NOT_EVALUATED");

  const draft = contractFixture();
  draft.approval.status = "DRAFT";
  assert.equal(evaluateAssertionV2({ contract: draft, transition: transitionFixture(), navigationIdentity }).verdict, "UNKNOWN");
  const noApproval = contractFixture();
  delete noApproval.approval;
  assert.equal(evaluateAssertionV2({ contract: noApproval, transition: transitionFixture(), navigationIdentity }).verdict, "UNKNOWN");
  assert.equal(evaluateAssertionV2({ contract, transition: transitionFixture(), navigationIdentity: null }).verdict, "NOT_EVALUATED");
});

test("E3 actual target and environment mismatches stop assertion comparison", () => {
  const { outputs } = examples.examples.E3;
  assert.equal(outputs.targetMismatch.verdict, "NOT_EVALUATED");
  assert.equal(outputs.targetMismatch.reasonCode, "TRANSITION_BINDING_MISMATCH");
  assert.equal(outputs.environmentMismatch.verdict, "NOT_EVALUATED");
  assert.equal(outputs.environmentMismatch.reasonCode, "ENVIRONMENT_IDENTITY_MISMATCH");
});

test("E3 actual identity components bind expected and comparison scope separately", () => {
  const { outputs } = examples.examples.E3;
  assert.equal(outputs.identity.identityStatus, "BOUND");
  assert.equal(outputs.identity.expectedSideHash, outputs.targetDrift.expectedSideHash);
  assert.notEqual(outputs.identity.comparisonScopeHash, outputs.targetDrift.comparisonScopeHash);
  assert.equal(outputs.identity.expectedSideHash, outputs.environmentDrift.expectedSideHash);
  assert.notEqual(outputs.identity.comparisonScopeHash, outputs.environmentDrift.comparisonScopeHash);
  assert.notEqual(outputs.identity.expectedSideHash, outputs.expectedDrift.expectedSideHash);
  assert.equal(outputs.identity.comparisonScopeHash, outputs.expectedDrift.comparisonScopeHash);
  assert.equal(outputs.missingReceipt.identityStatus, "NOT_EVALUATED");
  assert.equal(outputs.missingReceipt.verificationIdentityHash, "");
});

test("E4 self-declared grounding and missing receipt cannot authorize a hard gate", () => {
  const { outputs } = examples.examples.E4;
  assert.equal(outputs.selfDeclaredFinding.groundingClass, "UNAPPROVED_RULE");
  assert.equal(outputs.selfDeclaredFinding.candidateGroundingClass, "APPROVED_CONTRACT");
  assert.equal(outputs.selfDeclaredFinding.reason, "GROUNDING_AUTHORITY_NOT_VERIFIED");
  assert.equal(outputs.selfDeclaredFinding.hardEligible, false);
  assert.equal(outputs.missingFindingReceipt.reason, "GROUNDING_INVALID_OR_MISSING");
  assert.equal(outputs.missingFindingReceipt.hardEligible, false);
  assert.equal(outputs.unresolvedContract.verdict, "UNKNOWN");
});

test("E5 raw synthetic delivery decision does not activate a blocker or verified claim", () => {
  const { outputs } = examples.examples.E5;
  assert.equal(outputs.completeDelivery.decision, "BLOCK");
  assert.equal(outputs.completeDelivery.summary.satisfiedGateCount, 6);
  assert.equal(outputs.completeDelivery.activationStatus, "NOT_ACTIVATED");
  assert.equal(outputs.completeDelivery.canClaimVerifiedFixed, false);
  assert.equal(outputs.unknownIssuer.decision, "NOT_EVALUATED");
  assert.equal(outputs.scopeDrift.decision, "REVIEW");
  assert.equal(outputs.elevatedPolicy.decision, "NOT_EVALUATED");
});

test("unsupported schema and disabled-field escalation do not become evaluated claims", () => {
  const { outputs } = examples.negativeControls;
  assert.equal(outputs.malformedContract.verdict, "UNKNOWN");
  assert.equal(outputs.malformedContract.reasonCode, "CONTRACT_INVALID");
  assert.equal(outputs.unsupportedSchema.verdict, "UNKNOWN");
  assert.equal(outputs.unsupportedSchema.reasonCode, "CONTRACT_INVALID");
  assert.equal(outputs.elevatedContract.verdict, "UNKNOWN");
  assert.equal(outputs.elevatedIdentity.identityStatus, "NOT_EVALUATED");
  assert.equal(outputs.elevatedIdentity.canClaimVerifiedFixed, false);
});

test("checked-in example output matches the current extracted candidate byte for byte", async () => {
  const expected = await readFile(new URL("../examples/expected-output.json", import.meta.url), "utf8");
  assert.equal(`${JSON.stringify(runExamples(), null, 2)}\n`, expected);
  const summary = await readFile(new URL("../examples/summary.json", import.meta.url), "utf8");
  assert.equal(`${JSON.stringify(runExamples().summary, null, 2)}\n`, summary);
});
