import { createHash } from "node:crypto";

export const ASSERTION_V2_VERDICT = Object.freeze({
  PASS: "PASS",
  FAIL: "FAIL",
  UNKNOWN: "UNKNOWN",
  NOT_EVALUATED: "NOT_EVALUATED",
});

const ASSERTION_V2_CLAIM_BOUNDARY = Object.freeze({
  status: "INFERRED",
  requiresHumanConfirm: true,
  finalVerifierEligible: false,
  canClaimVerifiedFixed: false,
  canClaimVerifiedOutcome: false,
  canClaimVerifiedValue: false,
  blockDecision: "NOT_ISSUED",
});

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function contentProjection(contract = {}) {
  return {
    schema: contract.schema,
    contractId: contract.contractId,
    contractVersion: contract.contractVersion,
    sourceResolution: contract.sourceResolution,
    expectedSideProvenance: contract.expectedSideProvenance,
    applicability: contract.applicability,
    binding: contract.binding,
    expected: contract.expected,
    measurement: contract.measurement,
    finalVerifierEligible: contract.finalVerifierEligible,
    canClaimVerifiedFixed: contract.canClaimVerifiedFixed,
  };
}

export function hashTransitionContractProjection(contract = {}) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(contentProjection(contract))))
    .digest("hex");
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateTransitionContractProjection(contract) {
  const errors = [];
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    return { valid: false, errors: ["contract must be an object"] };
  }
  if (contract.schema !== "fga-transition-contract-projection-v2") errors.push("schema must be fga-transition-contract-projection-v2");
  for (const field of ["contractId", "contractVersion"]) {
    if (!nonEmpty(contract[field])) errors.push(`${field} is required`);
  }
  if (!contract.sourceResolution || typeof contract.sourceResolution !== "object") {
    errors.push("sourceResolution is required");
  } else {
    if (!nonEmpty(contract.sourceResolution.status)) errors.push("sourceResolution.status is required");
    if (!nonEmpty(contract.sourceResolution.conflictStatus)) errors.push("sourceResolution.conflictStatus is required");
    if (!Array.isArray(contract.sourceResolution.records)) {
      errors.push("sourceResolution.records must be an array");
    } else {
      contract.sourceResolution.records.forEach((record, index) => {
        for (const field of [
          "sourceId",
          "sourceType",
          "locator",
          "revision",
          "authorityStatus",
          "approvalStatus",
          "currencyStatus",
        ]) {
          if (!nonEmpty(record?.[field])) errors.push(`sourceResolution.records[${index}].${field} is required`);
        }
      });
    }
  }
  if (!contract.expectedSideProvenance || typeof contract.expectedSideProvenance !== "object") {
    errors.push("expectedSideProvenance is required");
  } else {
    if (!nonEmpty(contract.expectedSideProvenance.status)) errors.push("expectedSideProvenance.status is required");
    if (typeof contract.expectedSideProvenance.observedEvidenceExcluded !== "boolean") {
      errors.push("expectedSideProvenance.observedEvidenceExcluded must be boolean");
    }
  }
  if (!contract.approval || typeof contract.approval !== "object") {
    errors.push("approval is required");
  } else {
    for (const field of ["status", "approvedBy", "approvedAt", "approvedContentHash"]) {
      if (!nonEmpty(contract.approval[field])) errors.push(`approval.${field} is required`);
    }
  }
  if (!contract.applicability || typeof contract.applicability !== "object") {
    errors.push("applicability is required");
  } else {
    for (const field of ["status", "environmentId", "routeStateId"]) {
      if (!nonEmpty(contract.applicability[field])) errors.push(`applicability.${field} is required`);
    }
  }
  if (!contract.binding || typeof contract.binding !== "object") {
    errors.push("binding is required");
  } else {
    for (const field of ["status", "routeStateId", "targetIdentity", "eventType"]) {
      if (!nonEmpty(contract.binding[field])) errors.push(`binding.${field} is required`);
    }
    if (!contract.binding.relation || typeof contract.binding.relation !== "object") {
      errors.push("binding.relation is required");
    } else if (!Array.isArray(contract.binding.relation.peerIdentities)) {
      errors.push("binding.relation.peerIdentities must be an array");
    }
  }
  if (!contract.expected || typeof contract.expected !== "object") {
    errors.push("expected is required");
  } else {
    if (!nonEmpty(contract.expected.predicate)) errors.push("expected.predicate is required");
    if (typeof contract.expected.value !== "boolean") errors.push("expected.value must be boolean");
  }
  if (!contract.measurement || typeof contract.measurement !== "object") {
    errors.push("measurement is required");
  } else {
    if (contract.measurement.requiredEvidenceClass !== "OBSERVED_INTERACTION") {
      errors.push("measurement.requiredEvidenceClass must be OBSERVED_INTERACTION");
    }
    if (contract.measurement.requiredNavigationLineage !== "PAGE") {
      errors.push("measurement.requiredNavigationLineage must be PAGE");
    }
    if (!["BROWSER_RESOLVED", "NONE"].includes(contract.measurement.requiredLinkResolutionLineage)) {
      errors.push("measurement.requiredLinkResolutionLineage is invalid");
    }
  }
  if (contract.finalVerifierEligible !== false) errors.push("finalVerifierEligible must be false");
  if (contract.canClaimVerifiedFixed !== false) errors.push("canClaimVerifiedFixed must be false");
  return {
    valid: errors.length === 0,
    errors,
  };
}

function resultBase({ verdict, reasonCode, requiresDecisionRequest = false, hardFailureEligible = false, disposition = "" } = {}) {
  return {
    schema: "fga-assertion-result-v2",
    verdict,
    reasonCode,
    disposition,
    requiresDecisionRequest,
    hardFailureEligible,
    ...ASSERTION_V2_CLAIM_BOUNDARY,
  };
}

function unknown(reasonCode) {
  return resultBase({
    verdict: ASSERTION_V2_VERDICT.UNKNOWN,
    reasonCode,
    requiresDecisionRequest: true,
  });
}

function notEvaluated(reasonCode, disposition = "") {
  return resultBase({
    verdict: ASSERTION_V2_VERDICT.NOT_EVALUATED,
    reasonCode,
    disposition,
  });
}

function withUnevaluatedContext(result, {
  contract = null,
  transition = null,
  navigationIdentity = null,
  linkResolutionEvidence = null,
} = {}) {
  const expected = contract?.expected
    ? {
      status: "AVAILABLE",
      predicate: contract.expected.predicate || "",
      value: contract.expected.value,
      contractId: contract.contractId || "",
      contractVersion: contract.contractVersion || "",
    }
    : { status: "UNAVAILABLE" };
  const observed = transition
    ? {
      status: "INSUFFICIENT_EVIDENCE",
      evidenceClass: transition.evidenceClass || "",
      observationHash: transition.observationHash || "",
    }
    : { status: "NOT_PROVIDED" };
  const lineage = {
    contractSourceRecordIds: sortedUnique(
      Array.isArray(contract?.sourceResolution?.records)
        ? contract.sourceResolution.records.map((record) => record?.sourceId)
        : [],
    ),
    approvedContentHash: contract?.approval?.approvedContentHash || "",
    relationId: contract?.binding?.relation?.relationId || "",
    transitionObservationHash: transition?.observationHash || "",
    environmentFingerprint: transition?.environmentIdentity?.fingerprint || "",
    navigationIdentityHash: navigationIdentity?.navigationIdentityHash || "",
    linkResolutionEvidenceId: linkResolutionEvidence?.evidenceId || "",
  };
  const coverage = {
    contractSource: contract?.sourceResolution?.status || "MISSING",
    approval: contract?.approval?.status || "MISSING",
    applicability: contract?.applicability?.status || "UNKNOWN",
    binding: contract?.binding?.status || "UNBOUND",
    environment: transition?.environmentIdentity?.status || "UNOBSERVED",
    navigation: navigationIdentity?.lineageStatus || "UNOBSERVED",
    linkResolution: linkResolutionEvidence?.lineageStatus || "UNOBSERVED",
    transition: transition?.lifecycle?.captured?.status || "NOT_REACHED",
    comparison: "NOT_EVALUATED",
  };
  const identity = {
    verdict: result.verdict,
    reasonCode: result.reasonCode,
    disposition: result.disposition,
    contractId: contract?.contractId || "",
    contractVersion: contract?.contractVersion || "",
    expected,
    observed,
    lineage,
    coverage,
  };
  return {
    ...result,
    contractId: contract?.contractId || "",
    contractVersion: contract?.contractVersion || "",
    contractContentHash: contract?.approval?.approvedContentHash || "",
    expected,
    observed,
    lineage,
    coverage,
    assertionHash: createHash("sha256")
      .update(JSON.stringify(canonicalize(identity)))
      .digest("hex"),
  };
}

function sourceIsResolved(sourceResolution = {}) {
  const records = Array.isArray(sourceResolution.records) ? sourceResolution.records : [];
  return sourceResolution.status === "RESOLVED_APPLICABLE"
    && ["NONE", "RESOLVED"].includes(sourceResolution.conflictStatus)
    && records.length > 0
    && records.every((record) => record?.authorityStatus === "CONFIRMED"
      && record?.approvalStatus === "APPROVED"
      && record?.currencyStatus === "CURRENT");
}

function transitionBindingMatches(contract, transition) {
  const binding = contract.binding || {};
  return transition?.sourceRouteStateId === binding.routeStateId
    && transition?.before?.targetIdentity === binding.targetIdentity
    && transition?.after?.targetIdentity === binding.targetIdentity
    && transition?.before?.targetMatchCount === 1
    && transition?.after?.targetMatchCount === 1
    && transition?.action?.type === binding.eventType;
}

function environmentGate(contract, transition) {
  const expected = contract.applicability || {};
  const observed = transition?.environmentIdentity || {};
  const before = transition?.before?.environmentIdentity || {};
  const after = transition?.after?.environmentIdentity || {};
  if (observed.status !== "OBSERVED" || !nonEmpty(observed.environmentId) || !nonEmpty(observed.fingerprint)) {
    return "ENVIRONMENT_IDENTITY_UNOBSERVED";
  }
  const fingerprints = [observed.fingerprint, before.fingerprint, after.fingerprint];
  const sameFingerprint = fingerprints.every((value) => nonEmpty(value) && value === observed.fingerprint);
  const identityMatches = observed.environmentId === expected.environmentId
    && (!nonEmpty(expected.buildId) || observed.buildId === expected.buildId);
  return sameFingerprint && identityMatches ? "" : "ENVIRONMENT_IDENTITY_MISMATCH";
}

function navigationGate(contract, navigationIdentity) {
  if (!navigationIdentity) return "NAVIGATION_LINEAGE_MISSING";
  if (navigationIdentity.lineageStatus === "CONTRADICTED") return "NAVIGATION_LINEAGE_CONTRADICTED";
  if (navigationIdentity.lineageStatus !== "OBSERVED") return "NAVIGATION_LINEAGE_UNKNOWN";
  const complete = [
    navigationIdentity.requestedUrl,
    navigationIdentity.finalUrl,
    navigationIdentity.documentBaseUrl,
    navigationIdentity.navigationIdentityHash,
  ].every(nonEmpty);
  return complete ? "" : "NAVIGATION_LINEAGE_UNKNOWN";
}

function linkResolutionGate(contract, navigationIdentity, linkResolutionEvidence) {
  if (contract.measurement?.requiredLinkResolutionLineage !== "BROWSER_RESOLVED") return "";
  if (!linkResolutionEvidence) return "LINK_RESOLUTION_LINEAGE_MISSING";
  if (linkResolutionEvidence.lineageStatus === "CONTRADICTED" || linkResolutionEvidence.browserParity === "MISMATCH") {
    return "LINK_RESOLUTION_LINEAGE_CONTRADICTED";
  }
  if (linkResolutionEvidence.sourceRouteStateId !== contract.binding?.routeStateId) {
    return "LINK_RESOLUTION_BINDING_MISMATCH";
  }
  const sameNavigation = linkResolutionEvidence.sourceRequestedUrl === navigationIdentity?.requestedUrl
    && linkResolutionEvidence.sourceFinalUrl === navigationIdentity?.finalUrl
    && linkResolutionEvidence.sourceDocumentBaseUrl === navigationIdentity?.documentBaseUrl;
  if (!sameNavigation) return "LINK_RESOLUTION_NAVIGATION_MISMATCH";
  const complete = linkResolutionEvidence.lineageStatus === "OBSERVED"
    && linkResolutionEvidence.browserParity === "MATCH"
    && linkResolutionEvidence.destinationCheckEligibility === "ELIGIBLE"
    && nonEmpty(linkResolutionEvidence.evidenceId)
    && nonEmpty(linkResolutionEvidence.rawHref)
    && nonEmpty(linkResolutionEvidence.resolvedHref);
  return complete ? "" : "LINK_RESOLUTION_LINEAGE_UNKNOWN";
}

function transitionEvidenceComplete(contract, transition) {
  const lifecycle = transition?.lifecycle || {};
  const requiredStatuses = {
    planned: "COMPLETED",
    authorized: "COMPLETED",
    attempted: "COMPLETED",
    delivered: "CONFIRMED",
    stabilized: "COMPLETED",
    captured: "COMPLETED",
  };
  return Object.entries(requiredStatuses).every(([gate, status]) => lifecycle[gate]?.status === status)
    && transition?.evidenceClass === contract.measurement?.requiredEvidenceClass
    && nonEmpty(transition?.observationHash)
    && transition?.eventOutcome?.eventAttempted === true
    && transition?.eventOutcome?.eventDelivered === true
    && transition?.eventOutcome?.stateStabilized === true
    && transition?.eventOutcome?.postStateCaptured === true;
}

function sortedUnique(values = []) {
  return [...new Set(values.filter(nonEmpty))].sort();
}

function comparePredicate(contract, transition) {
  const predicate = contract.expected?.predicate;
  const expectedValue = contract.expected?.value;
  if (typeof expectedValue !== "boolean") return { reasonCode: "PREDICATE_EXPECTED_VALUE_INVALID" };

  if (predicate === "DIRECT_TARGET_CHANGED") {
    // Research extraction correction: absent/invalid observation is not false.
    if (typeof transition.directTargetDelta?.changed !== "boolean") {
      return { reasonCode: "PREDICATE_OBSERVATION_MISSING_OR_INVALID" };
    }
    return {
      expected: {
        predicate,
        value: expectedValue,
        targetIdentity: contract.binding.targetIdentity,
      },
      observed: {
        value: transition.directTargetDelta?.changed === true,
        directTargetDelta: transition.directTargetDelta,
      },
    };
  }

  if (predicate === "ALL_BOUND_PEERS_CHANGED") {
    const peerIdentities = sortedUnique(contract.binding?.relation?.peerIdentities);
    if (peerIdentities.length === 0) return { reasonCode: "RELATION_DENOMINATOR_MISSING" };
    if (!Array.isArray(transition.relatedElementDelta?.changedElements)
      || !transition.relatedElementDelta.changedElements.every((entry) => nonEmpty(entry?.key))) {
      return { reasonCode: "PREDICATE_OBSERVATION_MISSING_OR_INVALID" };
    }
    const changedIdentities = sortedUnique(
      (transition.relatedElementDelta?.changedElements || []).map((entry) => entry?.key),
    );
    const changedPeerIdentities = peerIdentities.filter((identity) => changedIdentities.includes(identity));
    const missingChangedPeerIdentities = peerIdentities.filter((identity) => !changedIdentities.includes(identity));
    const changedUnboundIdentities = changedIdentities.filter((identity) => !peerIdentities.includes(identity));
    return {
      expected: {
        predicate,
        value: expectedValue,
        relationId: contract.binding?.relation?.relationId || "",
        peerIdentities,
      },
      observed: {
        value: missingChangedPeerIdentities.length === 0,
        changedPeerIdentities,
        missingChangedPeerIdentities,
        changedUnboundIdentities,
      },
    };
  }

  if (predicate === "FOCUS_CHANGED") {
    if (typeof transition.eventOutcome?.focusChanged !== "boolean") {
      return { reasonCode: "PREDICATE_OBSERVATION_MISSING_OR_INVALID" };
    }
    return {
      expected: { predicate, value: expectedValue, targetIdentity: contract.binding.targetIdentity },
      observed: { value: transition.eventOutcome?.focusChanged === true },
    };
  }

  if (predicate === "TRANSITION_OBSERVED") {
    if (typeof transition.eventOutcome?.presentationTransitionObserved !== "boolean") {
      return { reasonCode: "PREDICATE_OBSERVATION_MISSING_OR_INVALID" };
    }
    return {
      expected: { predicate, value: expectedValue, targetIdentity: contract.binding.targetIdentity },
      observed: { value: transition.eventOutcome?.presentationTransitionObserved === true },
    };
  }

  return { reasonCode: "PREDICATE_UNSUPPORTED" };
}

function evaluatedResult({ contract, transition, navigationIdentity, linkResolutionEvidence, comparison }) {
  const matches = comparison.expected.value === comparison.observed.value;
  const verdict = matches ? ASSERTION_V2_VERDICT.PASS : ASSERTION_V2_VERDICT.FAIL;
  const lineage = {
    contractSourceRecordIds: sortedUnique(contract.sourceResolution.records.map((record) => record.sourceId)),
    approvedContentHash: contract.approval.approvedContentHash,
    relationId: contract.binding?.relation?.relationId || "",
    transitionObservationHash: transition.observationHash,
    environmentFingerprint: transition.environmentIdentity.fingerprint,
    navigationIdentityHash: navigationIdentity?.navigationIdentityHash || "",
    linkResolutionEvidenceId: linkResolutionEvidence?.evidenceId || "",
  };
  const observed = {
    ...comparison.observed,
    destinationComparisonStatus: linkResolutionEvidence?.comparisonStatus || "NOT_REQUIRED",
  };
  const assertionIdentity = {
    contractId: contract.contractId,
    contractVersion: contract.contractVersion,
    contractContentHash: contract.approval.approvedContentHash,
    expected: comparison.expected,
    observed,
    lineage,
    verdict,
  };
  return {
    ...resultBase({
      verdict,
      reasonCode: matches ? "EXPECTED_OBSERVATION_MATCH" : "EXPECTED_OBSERVATION_CONTRADICTION",
      hardFailureEligible: !matches,
    }),
    contractId: contract.contractId,
    contractVersion: contract.contractVersion,
    contractContentHash: contract.approval.approvedContentHash,
    expected: comparison.expected,
    observed,
    lineage,
    coverage: {
      contractSource: "RESOLVED_APPLICABLE",
      approval: "VALID",
      applicability: "APPLICABLE",
      binding: "BOUND",
      environment: "COMPARABLE",
      navigation: "OBSERVED",
      linkResolution: linkResolutionEvidence ? "OBSERVED" : "NOT_REQUIRED",
      transition: "CAPTURED",
      comparison: "EVALUATED",
    },
    assertionHash: createHash("sha256")
      .update(JSON.stringify(canonicalize(assertionIdentity)))
      .digest("hex"),
  };
}

export function evaluateAssertionV2({
  contract = null,
  transition = null,
  navigationIdentity = null,
  linkResolutionEvidence = null,
} = {}) {
  const context = { contract, transition, navigationIdentity, linkResolutionEvidence };
  const asUnknown = (reasonCode) => withUnevaluatedContext(unknown(reasonCode), context);
  const asNotEvaluated = (reasonCode, disposition = "") => withUnevaluatedContext(
    notEvaluated(reasonCode, disposition),
    context,
  );
  if (!contract) {
    return asUnknown("CONTRACT_MISSING");
  }
  if (!validateTransitionContractProjection(contract).valid) return asUnknown("CONTRACT_INVALID");
  if (!sourceIsResolved(contract.sourceResolution)) return asUnknown("CONTRACT_SOURCE_UNRESOLVED");
  if (contract.expectedSideProvenance?.status !== "CONFIRMED"
      || contract.expectedSideProvenance?.observedEvidenceExcluded !== true) {
    return asUnknown("EXPECTED_SIDE_PROVENANCE_UNKNOWN");
  }
  if (contract.approval?.status !== "APPROVED") return asUnknown("CONTRACT_NOT_APPROVED");
  if (!nonEmpty(contract.approval?.approvedBy)) return asUnknown("CONTRACT_NOT_APPROVED");
  if (contract.approval?.approvedContentHash !== hashTransitionContractProjection(contract)) {
    return asUnknown("CONTRACT_APPROVAL_HASH_MISMATCH");
  }
  if (["UNKNOWN_APPLICABILITY", "CONFLICTING_APPLICABILITY", "STALE_CONTRACT"].includes(contract.applicability?.status)) {
    return asUnknown("CONTRACT_APPLICABILITY_UNKNOWN");
  }
  if (contract.applicability?.status === "NOT_APPLICABLE") {
    return asNotEvaluated("CONTRACT_NOT_APPLICABLE", "NOT_APPLICABLE");
  }
  if (contract.applicability?.status !== "APPLICABLE") return asUnknown("CONTRACT_APPLICABILITY_UNKNOWN");
  if (!transition) return asNotEvaluated("TRANSITION_MISSING");
  if (contract.binding?.status !== "BOUND") return asNotEvaluated("CONTRACT_NOT_BOUND");
  if (!transitionBindingMatches(contract, transition)) return asNotEvaluated("TRANSITION_BINDING_MISMATCH");
  const environmentReason = environmentGate(contract, transition);
  if (environmentReason) return asNotEvaluated(environmentReason);
  const navigationReason = navigationGate(contract, navigationIdentity);
  if (navigationReason) return asNotEvaluated(navigationReason);
  const linkResolutionReason = linkResolutionGate(contract, navigationIdentity, linkResolutionEvidence);
  if (linkResolutionReason) return asNotEvaluated(linkResolutionReason);
  if (!transitionEvidenceComplete(contract, transition)) return asNotEvaluated("TRANSITION_EVIDENCE_INCOMPLETE");
  const comparison = comparePredicate(contract, transition);
  if (comparison.reasonCode) return asNotEvaluated(comparison.reasonCode);
  return evaluatedResult({ contract, transition, navigationIdentity, linkResolutionEvidence, comparison });
}
