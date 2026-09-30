import { createHash } from "node:crypto";

export const DELIVERY_DECISION = Object.freeze({
  BLOCK: "BLOCK",
  REVIEW: "REVIEW",
  NOT_EVALUATED: "NOT_EVALUATED",
});

export const DELIVERY_GATE_STATUS = Object.freeze({
  SATISFIED: "SATISFIED",
  UNSATISFIED: "UNSATISFIED",
  UNKNOWN: "UNKNOWN",
});

export const DELIVERY_GATE = Object.freeze({
  CERTIFIED_HEAD_FAIL: "CERTIFIED_HEAD_FAIL",
  CERTIFIED_BASE_PASS: "CERTIFIED_BASE_PASS",
  SAME_CONTRACT_CONTENT_HASH: "SAME_CONTRACT_CONTENT_HASH",
  SAME_COMPARISON_SCOPE_HASH: "SAME_COMPARISON_SCOPE_HASH",
  NO_APPLICABLE_DISPUTE: "NO_APPLICABLE_DISPUTE",
  BLOCKING_POLICY_AUTHORIZED: "BLOCKING_POLICY_AUTHORIZED",
});

export const CANONICAL_DELIVERY_GATES = Object.freeze([
  DELIVERY_GATE.CERTIFIED_HEAD_FAIL,
  DELIVERY_GATE.CERTIFIED_BASE_PASS,
  DELIVERY_GATE.SAME_CONTRACT_CONTENT_HASH,
  DELIVERY_GATE.SAME_COMPARISON_SCOPE_HASH,
  DELIVERY_GATE.NO_APPLICABLE_DISPUTE,
  DELIVERY_GATE.BLOCKING_POLICY_AUTHORIZED,
]);

const ASSERTION_VERDICTS = new Set(["PASS", "FAIL", "UNKNOWN", "NOT_EVALUATED"]);
const CERTIFICATION_STATUSES = new Set(["VALID", "INVALID", "UNKNOWN"]);
const ISSUER_ADMISSION_STATUSES = new Set(["ADMITTED", "REJECTED", "UNKNOWN"]);
const DISPUTE_STATUSES = new Set(["NO_APPLICABLE_DISPUTE", "APPLICABLE_DISPUTE", "UNKNOWN"]);
const POLICY_STATUSES = new Set(["AUTHORIZED", "NOT_AUTHORIZED", "UNKNOWN"]);
const SHA256 = /^[a-f0-9]{64}$/i;

const CLAIM_BOUNDARY = Object.freeze({
  status: "INFERRED",
  requiresHumanConfirm: true,
  activationStatus: "NOT_ACTIVATED",
  finalVerifierEligible: false,
  canClaimVerifiedFixed: false,
  canClaimVerifiedOutcome: false,
  canClaimVerifiedValue: false,
});

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha256(value) {
  return nonEmpty(value) && SHA256.test(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function hash(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function gate(gateId, status, reasonCode, evidence = {}) {
  return {
    gateId,
    status,
    reasonCode,
    evidence,
  };
}

function validateAssertion(assertion) {
  const errors = [];
  if (!isRecord(assertion)) return ["assertion must be an object"];
  if (assertion.schema !== "fga-assertion-result-v2") errors.push("schema");
  if (!ASSERTION_VERDICTS.has(assertion.verdict)) errors.push("verdict");
  if (!isSha256(assertion.assertionHash)) errors.push("assertionHash");
  if (!nonEmpty(assertion.contractId)) errors.push("contractId");
  if (!nonEmpty(assertion.contractVersion)) errors.push("contractVersion");
  if (!isSha256(assertion.contractContentHash)) errors.push("contractContentHash");
  if (assertion.finalVerifierEligible !== false) errors.push("finalVerifierEligible");
  if (assertion.canClaimVerifiedFixed !== false) errors.push("canClaimVerifiedFixed");
  return errors;
}

function validateCertification(receipt) {
  const errors = [];
  if (!isRecord(receipt)) return ["certification receipt must be an object"];
  if (receipt.schema !== "fga-assertion-certification-receipt-v1") errors.push("schema");
  if (!CERTIFICATION_STATUSES.has(receipt.verificationStatus)) errors.push("verificationStatus");
  if (!ISSUER_ADMISSION_STATUSES.has(receipt.issuerAdmissionStatus)) errors.push("issuerAdmissionStatus");
  if (!ASSERTION_VERDICTS.has(receipt.certifiedVerdict)) errors.push("certifiedVerdict");
  if (!isSha256(receipt.assertionHash)) errors.push("assertionHash");
  if (!nonEmpty(receipt.contractId)) errors.push("contractId");
  if (!nonEmpty(receipt.contractVersion)) errors.push("contractVersion");
  if (!isSha256(receipt.contractContentHash)) errors.push("contractContentHash");
  if (!isSha256(receipt.comparisonScopeHash)) errors.push("comparisonScopeHash");
  if (!isSha256(receipt.certificateHash)) errors.push("certificateHash");
  if (!isSha256(receipt.verificationReceiptHash)) errors.push("verificationReceiptHash");
  if (!isSha256(receipt.issuerAdmissionReceiptHash)) errors.push("issuerAdmissionReceiptHash");
  if (receipt.finalVerifierEligible !== false) errors.push("finalVerifierEligible");
  if (receipt.canClaimVerifiedFixed !== false) errors.push("canClaimVerifiedFixed");
  return errors;
}

function evaluateCertificationGate({ gateId, assertion, receipt, expectedVerdict }) {
  const assertionErrors = validateAssertion(assertion);
  if (assertionErrors.length > 0) {
    return gate(gateId, DELIVERY_GATE_STATUS.UNKNOWN, "ASSERTION_INPUT_INVALID", {
      invalidFields: assertionErrors,
    });
  }

  const receiptErrors = validateCertification(receipt);
  if (receiptErrors.length > 0) {
    return gate(gateId, DELIVERY_GATE_STATUS.UNKNOWN, "CERTIFICATION_RECEIPT_INVALID", {
      invalidFields: receiptErrors,
    });
  }

  if (receipt.verificationStatus === "UNKNOWN" || receipt.issuerAdmissionStatus === "UNKNOWN") {
    return gate(gateId, DELIVERY_GATE_STATUS.UNKNOWN, "CERTIFICATION_AUTHORITY_UNKNOWN");
  }
  if (receipt.verificationStatus !== "VALID" || receipt.issuerAdmissionStatus !== "ADMITTED") {
    return gate(gateId, DELIVERY_GATE_STATUS.UNSATISFIED, "CERTIFICATION_NOT_ADMITTED");
  }

  const bindingMatches = receipt.assertionHash === assertion.assertionHash
    && receipt.certifiedVerdict === assertion.verdict
    && receipt.contractId === assertion.contractId
    && receipt.contractVersion === assertion.contractVersion
    && receipt.contractContentHash === assertion.contractContentHash;
  if (!bindingMatches) {
    return gate(gateId, DELIVERY_GATE_STATUS.UNSATISFIED, "CERTIFICATION_BINDING_MISMATCH");
  }
  if (assertion.verdict !== expectedVerdict) {
    return gate(gateId, DELIVERY_GATE_STATUS.UNSATISFIED, "CERTIFIED_VERDICT_NOT_REQUIRED_VALUE", {
      expectedVerdict,
      observedVerdict: assertion.verdict,
    });
  }

  return gate(gateId, DELIVERY_GATE_STATUS.SATISFIED, "CERTIFICATION_ADMITTED", {
    assertionHash: assertion.assertionHash,
    certificateHash: receipt.certificateHash,
    verificationReceiptHash: receipt.verificationReceiptHash,
    issuerAdmissionReceiptHash: receipt.issuerAdmissionReceiptHash,
  });
}

function evaluateSharedHashGate({ gateId, baseReceipt, headReceipt, field }) {
  const baseErrors = validateCertification(baseReceipt);
  const headErrors = validateCertification(headReceipt);
  if (baseErrors.length > 0 || headErrors.length > 0) {
    return gate(gateId, DELIVERY_GATE_STATUS.UNKNOWN, "COMPARISON_RECEIPT_INVALID", {
      baseInvalidFields: baseErrors,
      headInvalidFields: headErrors,
    });
  }
  if (baseReceipt.verificationStatus !== "VALID"
    || headReceipt.verificationStatus !== "VALID"
    || baseReceipt.issuerAdmissionStatus !== "ADMITTED"
    || headReceipt.issuerAdmissionStatus !== "ADMITTED") {
    return gate(gateId, DELIVERY_GATE_STATUS.UNKNOWN, "COMPARISON_AUTHORITY_NOT_ADMITTED");
  }
  const baseValue = baseReceipt[field];
  const headValue = headReceipt[field];
  if (baseValue !== headValue) {
    return gate(gateId, DELIVERY_GATE_STATUS.UNSATISFIED, "COMPARISON_HASH_MISMATCH", {
      field,
      baseHash: baseValue,
      headHash: headValue,
    });
  }
  return gate(gateId, DELIVERY_GATE_STATUS.SATISFIED, "COMPARISON_HASH_MATCH", {
    field,
    hash: baseValue,
  });
}

function validateDisputeDecision(decision) {
  const errors = [];
  if (!isRecord(decision)) return ["dispute decision must be an object"];
  if (decision.schema !== "fga-dispute-applicability-decision-v1") errors.push("schema");
  if (!DISPUTE_STATUSES.has(decision.status)) errors.push("status");
  if (decision.authorityStatus !== "ADMITTED" && decision.authorityStatus !== "REJECTED" && decision.authorityStatus !== "UNKNOWN") {
    errors.push("authorityStatus");
  }
  if (!isSha256(decision.comparisonScopeHash)) errors.push("comparisonScopeHash");
  if (!isSha256(decision.decisionHash)) errors.push("decisionHash");
  if (!isSha256(decision.authorityReceiptHash)) errors.push("authorityReceiptHash");
  if (decision.finalVerifierEligible !== false) errors.push("finalVerifierEligible");
  if (decision.canClaimVerifiedFixed !== false) errors.push("canClaimVerifiedFixed");
  return errors;
}

function evaluateDisputeGate(decision, expectedScopeHash) {
  const errors = validateDisputeDecision(decision);
  if (errors.length > 0) {
    return gate(DELIVERY_GATE.NO_APPLICABLE_DISPUTE, DELIVERY_GATE_STATUS.UNKNOWN, "DISPUTE_DECISION_INVALID", {
      invalidFields: errors,
    });
  }
  if (decision.authorityStatus === "UNKNOWN" || decision.status === "UNKNOWN") {
    return gate(DELIVERY_GATE.NO_APPLICABLE_DISPUTE, DELIVERY_GATE_STATUS.UNKNOWN, "DISPUTE_APPLICABILITY_UNKNOWN");
  }
  if (decision.authorityStatus !== "ADMITTED") {
    return gate(DELIVERY_GATE.NO_APPLICABLE_DISPUTE, DELIVERY_GATE_STATUS.UNKNOWN, "DISPUTE_AUTHORITY_NOT_ADMITTED");
  }
  if (decision.comparisonScopeHash !== expectedScopeHash) {
    return gate(DELIVERY_GATE.NO_APPLICABLE_DISPUTE, DELIVERY_GATE_STATUS.UNKNOWN, "DISPUTE_SCOPE_MISMATCH", {
      expectedScopeHash,
      observedScopeHash: decision.comparisonScopeHash,
    });
  }
  if (decision.status === "APPLICABLE_DISPUTE") {
    return gate(DELIVERY_GATE.NO_APPLICABLE_DISPUTE, DELIVERY_GATE_STATUS.UNSATISFIED, "APPLICABLE_DISPUTE_PRESENT", {
      decisionHash: decision.decisionHash,
    });
  }
  return gate(DELIVERY_GATE.NO_APPLICABLE_DISPUTE, DELIVERY_GATE_STATUS.SATISFIED, "NO_APPLICABLE_DISPUTE_ADMITTED", {
    decisionHash: decision.decisionHash,
    authorityReceiptHash: decision.authorityReceiptHash,
  });
}

function validateBlockingPolicy(decision) {
  const errors = [];
  if (!isRecord(decision)) return ["blocking policy decision must be an object"];
  if (decision.schema !== "fga-blocking-policy-decision-v1") errors.push("schema");
  if (!POLICY_STATUSES.has(decision.status)) errors.push("status");
  if (decision.authorityStatus !== "ADMITTED" && decision.authorityStatus !== "REJECTED" && decision.authorityStatus !== "UNKNOWN") {
    errors.push("authorityStatus");
  }
  if (!nonEmpty(decision.policyId)) errors.push("policyId");
  if (!nonEmpty(decision.policyVersion)) errors.push("policyVersion");
  if (!isSha256(decision.comparisonScopeHash)) errors.push("comparisonScopeHash");
  if (!isSha256(decision.policyContentHash)) errors.push("policyContentHash");
  if (!isSha256(decision.decisionHash)) errors.push("decisionHash");
  if (!isSha256(decision.authorityReceiptHash)) errors.push("authorityReceiptHash");
  if (decision.finalVerifierEligible !== false) errors.push("finalVerifierEligible");
  if (decision.canClaimVerifiedFixed !== false) errors.push("canClaimVerifiedFixed");
  return errors;
}

function evaluatePolicyGate(decision, expectedScopeHash) {
  const errors = validateBlockingPolicy(decision);
  if (errors.length > 0) {
    return gate(DELIVERY_GATE.BLOCKING_POLICY_AUTHORIZED, DELIVERY_GATE_STATUS.UNKNOWN, "BLOCKING_POLICY_DECISION_INVALID", {
      invalidFields: errors,
    });
  }
  if (decision.authorityStatus === "UNKNOWN" || decision.status === "UNKNOWN") {
    return gate(DELIVERY_GATE.BLOCKING_POLICY_AUTHORIZED, DELIVERY_GATE_STATUS.UNKNOWN, "BLOCKING_POLICY_AUTHORITY_UNKNOWN");
  }
  if (decision.authorityStatus !== "ADMITTED") {
    return gate(DELIVERY_GATE.BLOCKING_POLICY_AUTHORIZED, DELIVERY_GATE_STATUS.UNKNOWN, "BLOCKING_POLICY_AUTHORITY_NOT_ADMITTED");
  }
  if (decision.comparisonScopeHash !== expectedScopeHash) {
    return gate(DELIVERY_GATE.BLOCKING_POLICY_AUTHORIZED, DELIVERY_GATE_STATUS.UNKNOWN, "BLOCKING_POLICY_SCOPE_MISMATCH", {
      expectedScopeHash,
      observedScopeHash: decision.comparisonScopeHash,
    });
  }
  if (decision.status !== "AUTHORIZED") {
    return gate(DELIVERY_GATE.BLOCKING_POLICY_AUTHORIZED, DELIVERY_GATE_STATUS.UNSATISFIED, "BLOCKING_POLICY_NOT_AUTHORIZED", {
      policyId: decision.policyId,
      policyVersion: decision.policyVersion,
    });
  }
  return gate(DELIVERY_GATE.BLOCKING_POLICY_AUTHORIZED, DELIVERY_GATE_STATUS.SATISFIED, "BLOCKING_POLICY_ADMITTED", {
    policyId: decision.policyId,
    policyVersion: decision.policyVersion,
    policyContentHash: decision.policyContentHash,
    decisionHash: decision.decisionHash,
    authorityReceiptHash: decision.authorityReceiptHash,
  });
}

function decideFromGates(gates) {
  if (gates.some((entry) => entry.status === DELIVERY_GATE_STATUS.UNSATISFIED)) {
    return DELIVERY_DECISION.REVIEW;
  }
  if (gates.some((entry) => entry.status === DELIVERY_GATE_STATUS.UNKNOWN)) {
    return DELIVERY_DECISION.NOT_EVALUATED;
  }
  return DELIVERY_DECISION.BLOCK;
}

export function deriveDeliveryDecision({
  baseAssertion,
  headAssertion,
  baseCertification,
  headCertification,
  disputeDecision,
  blockingPolicyDecision,
} = {}) {
  const expectedScopeHash = isSha256(headCertification?.comparisonScopeHash)
    ? headCertification.comparisonScopeHash
    : "";

  const gates = [
    evaluateCertificationGate({
      gateId: DELIVERY_GATE.CERTIFIED_HEAD_FAIL,
      assertion: headAssertion,
      receipt: headCertification,
      expectedVerdict: "FAIL",
    }),
    evaluateCertificationGate({
      gateId: DELIVERY_GATE.CERTIFIED_BASE_PASS,
      assertion: baseAssertion,
      receipt: baseCertification,
      expectedVerdict: "PASS",
    }),
    evaluateSharedHashGate({
      gateId: DELIVERY_GATE.SAME_CONTRACT_CONTENT_HASH,
      baseReceipt: baseCertification,
      headReceipt: headCertification,
      field: "contractContentHash",
    }),
    evaluateSharedHashGate({
      gateId: DELIVERY_GATE.SAME_COMPARISON_SCOPE_HASH,
      baseReceipt: baseCertification,
      headReceipt: headCertification,
      field: "comparisonScopeHash",
    }),
    evaluateDisputeGate(disputeDecision, expectedScopeHash),
    evaluatePolicyGate(blockingPolicyDecision, expectedScopeHash),
  ];

  const decision = decideFromGates(gates);
  const reasonCodes = gates
    .filter((entry) => entry.status !== DELIVERY_GATE_STATUS.SATISFIED)
    .map((entry) => entry.reasonCode);
  const decisionIdentity = {
    ruleVersion: "delivery-decision-v1",
    decision,
    gates,
    baseAssertionHash: isSha256(baseAssertion?.assertionHash) ? baseAssertion.assertionHash : "",
    headAssertionHash: isSha256(headAssertion?.assertionHash) ? headAssertion.assertionHash : "",
  };

  return {
    schema: "fga-delivery-decision-v1",
    ruleVersion: "delivery-decision-v1",
    decision,
    gates,
    reasonCodes,
    summary: {
      requiredGateCount: CANONICAL_DELIVERY_GATES.length,
      satisfiedGateCount: gates.filter((entry) => entry.status === DELIVERY_GATE_STATUS.SATISFIED).length,
      unsatisfiedGateCount: gates.filter((entry) => entry.status === DELIVERY_GATE_STATUS.UNSATISFIED).length,
      unknownGateCount: gates.filter((entry) => entry.status === DELIVERY_GATE_STATUS.UNKNOWN).length,
    },
    lineage: {
      baseAssertionHash: isSha256(baseAssertion?.assertionHash) ? baseAssertion.assertionHash : "",
      headAssertionHash: isSha256(headAssertion?.assertionHash) ? headAssertion.assertionHash : "",
      baseCertificateHash: isSha256(baseCertification?.certificateHash) ? baseCertification.certificateHash : "",
      headCertificateHash: isSha256(headCertification?.certificateHash) ? headCertification.certificateHash : "",
      contractContentHash: baseCertification?.contractContentHash === headCertification?.contractContentHash
        && isSha256(headCertification?.contractContentHash)
        ? headCertification.contractContentHash
        : "",
      comparisonScopeHash: baseCertification?.comparisonScopeHash === headCertification?.comparisonScopeHash
        && isSha256(headCertification?.comparisonScopeHash)
        ? headCertification.comparisonScopeHash
        : "",
      disputeDecisionHash: isSha256(disputeDecision?.decisionHash) ? disputeDecision.decisionHash : "",
      blockingPolicyDecisionHash: isSha256(blockingPolicyDecision?.decisionHash)
        ? blockingPolicyDecision.decisionHash
        : "",
    },
    decisionHash: hash(decisionIdentity),
    claimBoundary: "This candidate separates assertion truth from merge delivery policy. It issues no readiness, customer, business-outcome, deployment, or fixed-status claim.",
    ...CLAIM_BOUNDARY,
  };
}
