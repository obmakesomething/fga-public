// Synthetic values used only to exercise the extracted local evaluators.
// These are producer-authored objects, not browser captures or authority receipts.
import { hashGovernedValue, hashTransitionContractProjection } from "fga-research-extract";

const digest = (label) => hashGovernedValue({ syntheticFixture: label });

export function contractFixture() {
  const contract = {
    schema: "fga-transition-contract-projection-v2",
    contractId: "synthetic.panel-toggle",
    contractVersion: "1.0.0",
    sourceResolution: {
      status: "RESOLVED_APPLICABLE",
      conflictStatus: "NONE",
      records: [{
        sourceId: "synthetic-condition-1",
        sourceType: "SYNTHETIC_FIXTURE",
        locator: "synthetic:condition-1",
        revision: "1",
        authorityStatus: "CONFIRMED",
        approvalStatus: "APPROVED",
        currencyStatus: "CURRENT",
      }],
    },
    expectedSideProvenance: { status: "CONFIRMED", observedEvidenceExcluded: true },
    approval: {
      status: "APPROVED",
      approvedBy: "synthetic-fixture-author",
      approvedAt: "2026-01-01T00:00:00.000Z",
      approvedContentHash: "",
    },
    applicability: {
      status: "APPLICABLE",
      environmentId: "synthetic-env",
      buildId: "synthetic-build",
      routeStateId: "synthetic::closed",
    },
    binding: {
      status: "BOUND",
      routeStateId: "synthetic::closed",
      targetIdentity: "#panel-toggle",
      eventType: "click",
      relation: { relationId: "", peerIdentities: [] },
    },
    expected: { predicate: "DIRECT_TARGET_CHANGED", value: true },
    measurement: {
      requiredEvidenceClass: "OBSERVED_INTERACTION",
      requiredNavigationLineage: "PAGE",
      requiredLinkResolutionLineage: "NONE",
    },
    finalVerifierEligible: false,
    canClaimVerifiedFixed: false,
  };
  contract.approval.approvedContentHash = hashTransitionContractProjection(contract);
  return contract;
}

export function navigationFixture() {
  return {
    schema: "fga-page-navigation-identity-v1",
    lineageStatus: "OBSERVED",
    requestedUrl: "https://synthetic.invalid/panel",
    finalUrl: "https://synthetic.invalid/panel",
    documentBaseUrl: "https://synthetic.invalid/panel",
    navigationIdentityHash: digest("navigation"),
    finalVerifierEligible: false,
    canClaimVerifiedFixed: false,
  };
}

export function transitionFixture({ changed = true } = {}) {
  const environmentIdentity = {
    status: "OBSERVED",
    environmentId: "synthetic-env",
    buildId: "synthetic-build",
    fingerprint: digest("environment"),
  };
  return {
    schema: "fga-event-transition-v2",
    evidenceClass: "OBSERVED_INTERACTION",
    sourceRouteStateId: "synthetic::closed",
    action: { type: "click" },
    environmentIdentity,
    lifecycle: {
      planned: { status: "COMPLETED" },
      authorized: { status: "COMPLETED" },
      attempted: { status: "COMPLETED" },
      delivered: { status: "CONFIRMED" },
      stabilized: { status: "COMPLETED" },
      captured: { status: "COMPLETED" },
    },
    before: {
      targetIdentity: "#panel-toggle",
      targetMatchCount: 1,
      environmentIdentity: { status: "OBSERVED", fingerprint: environmentIdentity.fingerprint },
    },
    after: {
      targetIdentity: "#panel-toggle",
      targetMatchCount: 1,
      environmentIdentity: { status: "OBSERVED", fingerprint: environmentIdentity.fingerprint },
    },
    directTargetDelta: {
      key: "#panel-toggle",
      changed,
      changes: changed ? { "aria-expanded": { before: "false", after: "true" } } : {},
    },
    eventOutcome: {
      eventAttempted: true,
      eventDelivered: true,
      stateStabilized: true,
      postStateCaptured: true,
      presentationTransitionObserved: changed,
    },
    observationHash: digest(`transition-${changed}`),
    status: "INFERRED",
    requiresHumanConfirm: true,
    finalVerifierEligible: false,
    canClaimVerifiedFixed: false,
  };
}

export function identityFixture(contract = contractFixture()) {
  return {
    schema: "fga-verification-identity-input-v1",
    contractId: contract.contractId,
    contractVersion: contract.contractVersion,
    contractSourceReceiptHash: digest("contract-source-receipt"),
    contractContentHash: contract.approval.approvedContentHash,
    contractApprovalReceiptHash: digest("contract-approval-receipt"),
    applicabilityContextHash: digest("applicability"),
    semanticConfigurationHash: digest("semantic-config"),
    verificationRecipeHash: digest("recipe"),
    targetIdentityHash: digest("target-panel-toggle"),
    environmentIdentityHash: digest("environment"),
    routeStateSetHash: digest("route-set"),
    evidencePolicyHash: digest("evidence-policy"),
    engineApiVersion: { major: 1, minor: 0 },
    comparatorVersion: "synthetic-assertion-v2",
    finalVerifierEligible: false,
    canClaimVerifiedFixed: false,
  };
}

export function findingFixture() {
  const finding = {
    axis: "syntheticInteraction",
    ruleId: "panel-change",
    routeStateId: "synthetic::closed",
    verdict: "FAIL",
  };
  const scope = {
    axis: finding.axis,
    ruleId: finding.ruleId,
    routeStateId: finding.routeStateId,
  };
  const grounding = {
    schema: "fga-finding-grounding-v1",
    kind: "APPROVED_PRODUCT_CONTRACT",
    identity: { id: "synthetic.panel-toggle", version: "1.0.0" },
    resolutionStatus: "RESOLVED",
    authorityStatus: "ADMITTED",
    admissionStatus: "ADMITTED",
    applicability: {
      status: "APPLICABLE",
      scope,
      scopeHash: hashGovernedValue(scope),
      decisionReceiptHash: digest("grounding-applicability-decision"),
    },
    lifecycleStatus: "CURRENT",
    contentHash: digest("grounding-content"),
    finalVerifierEligible: false,
    canClaimVerifiedFixed: false,
  };
  const receipt = {
    schema: "fga-finding-grounding-receipt-v1",
    status: "VALID",
    groundingHash: hashGovernedValue(grounding),
    authorityReceiptHash: digest("grounding-authority-receipt"),
    admissionReceiptHash: digest("grounding-admission-receipt"),
    finalVerifierEligible: false,
    canClaimVerifiedFixed: false,
  };
  return {
    ...finding,
    grounding: { ...grounding, receipt: { ...receipt, receiptHash: hashGovernedValue(receipt) } },
  };
}

export function deliveryFixture(baseAssertion, headAssertion, comparisonScopeHash) {
  function certification(assertion, label) {
    return {
      schema: "fga-assertion-certification-receipt-v1",
      verificationStatus: "VALID",
      issuerAdmissionStatus: "ADMITTED",
      assertionHash: assertion.assertionHash,
      certifiedVerdict: assertion.verdict,
      contractId: assertion.contractId,
      contractVersion: assertion.contractVersion,
      contractContentHash: assertion.contractContentHash,
      comparisonScopeHash,
      certificateHash: digest(`${label}-certificate`),
      verificationReceiptHash: digest(`${label}-verification-receipt`),
      issuerAdmissionReceiptHash: digest(`${label}-issuer-admission-receipt`),
      finalVerifierEligible: false,
      canClaimVerifiedFixed: false,
    };
  }
  return {
    baseAssertion,
    headAssertion,
    baseCertification: certification(baseAssertion, "base"),
    headCertification: certification(headAssertion, "head"),
    disputeDecision: {
      schema: "fga-dispute-applicability-decision-v1",
      status: "NO_APPLICABLE_DISPUTE",
      authorityStatus: "ADMITTED",
      comparisonScopeHash,
      decisionHash: digest("dispute-decision"),
      authorityReceiptHash: digest("dispute-authority-receipt"),
      finalVerifierEligible: false,
      canClaimVerifiedFixed: false,
    },
    blockingPolicyDecision: {
      schema: "fga-blocking-policy-decision-v1",
      status: "AUTHORIZED",
      authorityStatus: "ADMITTED",
      policyId: "synthetic.blocking-policy",
      policyVersion: "1.0.0",
      comparisonScopeHash,
      policyContentHash: digest("blocking-policy-content"),
      decisionHash: digest("blocking-policy-decision"),
      authorityReceiptHash: digest("blocking-policy-authority-receipt"),
      finalVerifierEligible: false,
      canClaimVerifiedFixed: false,
    },
  };
}

export { digest as syntheticHash };
