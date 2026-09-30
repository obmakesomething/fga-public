import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  EDGE_STATUS,
  ASSERTION_V2_VERDICT,
  VERIFICATION_IDENTITY_STATUS,
  decorateEdge,
  isVerdictEvidenceEligible,
  verdictEvidenceEdges,
  evaluateAssertionV2,
  buildVerificationIdentity,
  classifyFindingGrounding,
  deriveDeliveryDecision,
} from "fga-research-extract";
import {
  contractFixture,
  deliveryFixture,
  findingFixture,
  identityFixture,
  navigationFixture,
  syntheticHash,
  transitionFixture,
} from "./fixtures.mjs";

const copy = (value) => structuredClone(value);

export function runExamples() {
  const contract = contractFixture();
  const navigationIdentity = navigationFixture();
  const changed = transitionFixture({ changed: true });
  const unchanged = transitionFixture({ changed: false });

  // E1 changes only the declared status/source of the same relation.
  const observedRelation = {
    type: "contains", from: "#panel", to: "#panel-toggle",
    status: EDGE_STATUS.OBSERVED, source: ["dom"], confidence: 0.99,
  };
  const modelRelation = {
    ...observedRelation, status: EDGE_STATUS.MODEL_PROPOSED, source: [],
  };
  const unimplementedRelation = {
    ...observedRelation, status: EDGE_STATUS.UNIMPLEMENTED, source: [],
  };
  const spoofedTrigger = {
    type: "triggersState", from: "#panel-toggle", to: "#panel-open",
    status: EDGE_STATUS.OBSERVED, source: ["dom"], confidence: 0.99,
  };
  const e1 = {
    inputs: { observedRelation, modelRelation, unimplementedRelation, spoofedTrigger },
    outputs: {
      observedEligible: isVerdictEvidenceEligible(observedRelation),
      modelEligible: isVerdictEvidenceEligible(modelRelation),
      unimplementedEligible: isVerdictEvidenceEligible(unimplementedRelation),
      filteredRelationTypes: verdictEvidenceEdges([observedRelation, modelRelation, unimplementedRelation])
        .map(({ type, status }) => ({ type, status })),
      spoofedTriggerEligible: isVerdictEvidenceEligible(spoofedTrigger),
      decoratedTrigger: decorateEdge({ type: "triggersState", from: spoofedTrigger.from, to: spoofedTrigger.to, weight: 0.99 }),
      decoratedModelRelation: decorateEdge({ type: "contains", from: observedRelation.from, to: observedRelation.to, status: EDGE_STATUS.MODEL_PROPOSED, weight: 0.99 }),
      decoratedUnimplementedRelation: decorateEdge({ type: "contains", from: observedRelation.from, to: observedRelation.to, status: EDGE_STATUS.UNIMPLEMENTED, weight: 0.99 }),
    },
    interpretation: "Declared MODEL_PROPOSED and UNIMPLEMENTED relationships are excluded even with confidence 0.99. The same candidate relation is eligible only with declared OBSERVED provenance.",
    limit: "The taxonomy and filter operate on supplied metadata; this example does not prove that DOM data was really observed. The isolated candidate fix preserves restrictive supplied status and rejects known model-only type spoofing, not all false provenance.",
  };

  const missingTransition = { contract, transition: null, navigationIdentity };
  const passingTransition = { contract, transition: changed, navigationIdentity };
  const failingTransition = { contract, transition: unchanged, navigationIdentity };
  const proposedTransition = copy(passingTransition);
  proposedTransition.transition.evidenceClass = "MODEL_PROPOSED";
  const missingDelta = copy(passingTransition);
  delete missingDelta.transition.directTargetDelta;
  const e2 = {
    inputs: { missingTransition, passingTransition, failingTransition, proposedTransition, missingDelta },
    outputs: {
      missingTransition: evaluateAssertionV2(missingTransition),
      passingTransition: evaluateAssertionV2(passingTransition),
      failingTransition: evaluateAssertionV2(failingTransition),
      proposedTransition: evaluateAssertionV2(proposedTransition),
      missingDelta: evaluateAssertionV2(missingDelta),
    },
    interpretation: "With a synthetic governed contract, no transition is NOT_EVALUATED. Supplied complete OBSERVED_INTERACTION objects produce local PASS or FAIL; model-proposed and missing predicate data do not complete the comparison.",
    limit: "These objects were assembled in memory. No browser event, page capture, approval, or real observation happened.",
  };

  const targetMismatch = copy(passingTransition);
  targetMismatch.transition.after.targetIdentity = "#different-panel-toggle";
  const environmentMismatch = copy(passingTransition);
  environmentMismatch.transition.after.environmentIdentity.fingerprint = syntheticHash("other-environment");
  const identityInput = identityFixture(contract);
  const targetDriftInput = { ...identityInput, targetIdentityHash: syntheticHash("other-target") };
  const environmentDriftInput = { ...identityInput, environmentIdentityHash: syntheticHash("other-environment") };
  const expectedDriftInput = { ...identityInput, contractContentHash: syntheticHash("other-contract-content") };
  const missingReceiptInput = copy(identityInput);
  delete missingReceiptInput.contractApprovalReceiptHash;
  const e3 = {
    inputs: { targetMismatch, environmentMismatch, identityInput, targetDriftInput, environmentDriftInput, expectedDriftInput, missingReceiptInput },
    outputs: {
      targetMismatch: evaluateAssertionV2(targetMismatch),
      environmentMismatch: evaluateAssertionV2(environmentMismatch),
      identity: buildVerificationIdentity(identityInput),
      targetDrift: buildVerificationIdentity(targetDriftInput),
      environmentDrift: buildVerificationIdentity(environmentDriftInput),
      expectedDrift: buildVerificationIdentity(expectedDriftInput),
      missingReceipt: buildVerificationIdentity(missingReceiptInput),
    },
    interpretation: "Before/after target and environment mismatches stop the assertion comparison. Real identity component fields change the bound scope or expected hashes; a missing receipt hash produces NOT_EVALUATED identity.",
    limit: "Identity hashes bind supplied bytes only; they do not compare actual deployments or independently validate receipt authority.",
  };

  const selfDeclaredFinding = findingFixture();
  const missingFindingReceipt = copy(selfDeclaredFinding);
  delete missingFindingReceipt.grounding.receipt;
  const unresolvedContract = copy(contract);
  unresolvedContract.sourceResolution.records[0].authorityStatus = "UNCONFIRMED";
  // The existing hash is intentionally left unchanged: the source gate runs first.
  const e4 = {
    inputs: { selfDeclaredFinding, missingFindingReceipt, unresolvedContract },
    outputs: {
      selfDeclaredFinding: classifyFindingGrounding(selfDeclaredFinding),
      missingFindingReceipt: classifyFindingGrounding(missingFindingReceipt),
      unresolvedContract: evaluateAssertionV2({ contract: unresolvedContract, transition: changed, navigationIdentity }),
    },
    interpretation: "A self-consistent producer-authored grounding receipt remains a candidate with hardEligible false. Missing receipt is invalid; unresolved source authority stays UNKNOWN.",
    limit: "The evaluator has no independent authoritative receipt readback. Synthetic APPROVED or ADMITTED strings are fixture claims, not real approval.",
  };

  const baseAssertion = e2.outputs.passingTransition;
  const headAssertion = e2.outputs.failingTransition;
  const completeDeliveryInput = deliveryFixture(baseAssertion, headAssertion, e3.outputs.identity.comparisonScopeHash);
  const unknownIssuerInput = copy(completeDeliveryInput);
  unknownIssuerInput.headCertification.issuerAdmissionStatus = "UNKNOWN";
  const scopeDriftInput = copy(completeDeliveryInput);
  scopeDriftInput.baseCertification.comparisonScopeHash = syntheticHash("other-comparison-scope");
  const elevatedPolicyInput = copy(completeDeliveryInput);
  elevatedPolicyInput.blockingPolicyDecision.finalVerifierEligible = true;
  const e5 = {
    inputs: { completeDeliveryInput, unknownIssuerInput, scopeDriftInput, elevatedPolicyInput },
    outputs: {
      completeDelivery: deriveDeliveryDecision(completeDeliveryInput),
      unknownIssuer: deriveDeliveryDecision(unknownIssuerInput),
      scopeDrift: deriveDeliveryDecision(scopeDriftInput),
      elevatedPolicy: deriveDeliveryDecision(elevatedPolicyInput),
    },
    interpretation: "The pure delivery function returns raw BLOCK for six supplied satisfied gates, REVIEW for scope drift, and NOT_EVALUATED for unknown issuer or elevated disabled field. All outputs remain NOT_ACTIVATED with disabled verified-claim fields.",
    limit: "The synthetic certificates, admission receipts, dispute decision, and policy decision were all producer-authored here. Raw BLOCK is a local function return, not an actual CI block, publication, issuance, or VERIFIED_FIXED claim.",
  };

  const unsupportedSchemaInput = copy(passingTransition);
  unsupportedSchemaInput.contract.schema = "unsupported-contract-schema";
  const elevatedContractInput = copy(passingTransition);
  elevatedContractInput.contract.finalVerifierEligible = true;
  const elevatedIdentityInput = { ...identityInput, canClaimVerifiedFixed: true };
  const malformedContractInput = { contract: [], transition: changed, navigationIdentity };
  const negativeControls = {
    inputs: { malformedContractInput, unsupportedSchemaInput, elevatedContractInput, elevatedIdentityInput },
    outputs: {
      malformedContract: evaluateAssertionV2(malformedContractInput),
      unsupportedSchema: evaluateAssertionV2(unsupportedSchemaInput),
      elevatedContract: evaluateAssertionV2(elevatedContractInput),
      elevatedIdentity: buildVerificationIdentity(elevatedIdentityInput),
    },
  };

  const summary = {
    E1: {
      observedEligible: e1.outputs.observedEligible,
      modelEligible: e1.outputs.modelEligible,
      unimplementedEligible: e1.outputs.unimplementedEligible,
      spoofedTriggerEligible: e1.outputs.spoofedTriggerEligible,
    },
    E2: Object.fromEntries(Object.entries(e2.outputs).map(([name, result]) => [name, result.verdict])),
    E3: {
      targetMismatch: e3.outputs.targetMismatch.reasonCode,
      environmentMismatch: e3.outputs.environmentMismatch.reasonCode,
      missingReceipt: e3.outputs.missingReceipt.identityStatus,
    },
    E4: {
      candidateGroundingClass: e4.outputs.selfDeclaredFinding.candidateGroundingClass,
      hardEligible: e4.outputs.selfDeclaredFinding.hardEligible,
      missingReceiptHardEligible: e4.outputs.missingFindingReceipt.hardEligible,
    },
    E5: Object.fromEntries(Object.entries(e5.outputs).map(([name, result]) => [name, {
      decision: result.decision,
      activationStatus: result.activationStatus,
      canClaimVerifiedFixed: result.canClaimVerifiedFixed,
    }])),
  };
  return {
    schema: "fga-research-examples-v1",
    datasetKind: "SYNTHETIC",
    execution: "local in-memory evaluation; no browser, remote model, or customer action",
    sourceBehavior: "Six extracted modules plus isolated candidate fixes; results are bounded to these exact inputs.",
    summary,
    examples: { E1: e1, E2: e2, E3: e3, E4: e4, E5: e5 },
    negativeControls,
    expectedEnums: {
      edgeObserved: EDGE_STATUS.OBSERVED,
      localPass: ASSERTION_V2_VERDICT.PASS,
      identityNotEvaluated: VERIFICATION_IDENTITY_STATUS.NOT_EVALUATED,
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(runExamples(), null, 2)}\n`);
}
