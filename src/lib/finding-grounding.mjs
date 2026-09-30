import {
  closedRecord,
  dedupeViolations,
  hashGovernedValue,
  isPlainRecord,
  isSha256,
  nonEmpty,
  snapshotJson,
} from "./governed-receipt-core.mjs";

export const GROUNDING_CLASS = Object.freeze({
  UNAPPROVED_RULE: "UNAPPROVED_RULE",
  APPROVED_CONTRACT: "APPROVED_CONTRACT",
  CITED_STANDARD: "CITED_STANDARD",
});

const GROUNDING_KEYS = Object.freeze({
  APPROVED_PRODUCT_CONTRACT: new Set([
    "schema", "kind", "identity", "resolutionStatus", "authorityStatus",
    "admissionStatus", "applicability", "lifecycleStatus", "contentHash",
    "receipt", "finalVerifierEligible", "canClaimVerifiedFixed",
  ]),
  CITED_STANDARD: new Set([
    "schema", "kind", "identity", "resolutionStatus", "authorityStatus",
    "admissionStatus", "applicability", "lifecycleStatus", "citation",
    "receipt", "finalVerifierEligible", "canClaimVerifiedFixed",
  ]),
});
const ALL_GROUNDING_KEYS = new Set([
  ...GROUNDING_KEYS.APPROVED_PRODUCT_CONTRACT,
  ...GROUNDING_KEYS.CITED_STANDARD,
]);
const IDENTITY_KEYS = new Set(["id", "version"]);
const APPLICABILITY_KEYS = new Set(["status", "scope", "scopeHash", "decisionReceiptHash"]);
const SCOPE_KEYS = new Set(["axis", "ruleId", "routeStateId"]);
const CITATION_KEYS = new Set(["obligationId", "locator", "exactTextHash"]);
const RECEIPT_KEYS = new Set([
  "schema", "status", "groundingHash", "authorityReceiptHash",
  "admissionReceiptHash", "receiptHash", "finalVerifierEligible",
  "canClaimVerifiedFixed",
]);

const RESOLUTION_STATUS = new Set(["RESOLVED", "AMBIGUOUS", "CONFLICTING", "UNKNOWN"]);
const AUTHORITY_STATUS = new Set(["ADMITTED", "REJECTED", "UNKNOWN"]);
const ADMISSION_STATUS = new Set(["ADMITTED", "REJECTED", "UNKNOWN"]);
const APPLICABILITY_STATUS = new Set(["APPLICABLE", "NOT_APPLICABLE", "UNKNOWN"]);
const LIFECYCLE_STATUS = new Set(["CURRENT", "STALE", "REVOKED", "EXPIRED", "UNKNOWN"]);
const RECEIPT_STATUS = new Set(["VALID", "INVALID", "UNKNOWN"]);

function exactNonEmpty(value) {
  return nonEmpty(value) && value === value.trim();
}

function readGrounding(finding, violations) {
  if (!isPlainRecord(finding)) {
    violations.push("finding:NOT_A_PLAIN_OBJECT");
    return undefined;
  }
  let descriptor;
  try {
    descriptor = Object.getOwnPropertyDescriptor(finding, "grounding");
  } catch {
    violations.push("finding.grounding:INTROSPECTION_FAILED");
    return undefined;
  }
  if (!descriptor) {
    violations.push("finding.grounding:MISSING");
    return undefined;
  }
  if (!("value" in descriptor) || descriptor.get || descriptor.set) {
    violations.push("finding.grounding:ACCESSOR_NOT_ALLOWED");
    return undefined;
  }
  return descriptor.value;
}

function safeFindingIdentity(finding, violations) {
  const identity = {};
  for (const field of SCOPE_KEYS) {
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(finding, field);
    } catch {
      violations.push(`finding.${field}:INTROSPECTION_FAILED`);
      continue;
    }
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set || !exactNonEmpty(descriptor.value)) {
      violations.push(`finding.${field}:INVALID`);
      continue;
    }
    identity[field] = descriptor.value;
  }
  return identity;
}

function invalidResult(violations) {
  return {
    groundingClass: GROUNDING_CLASS.UNAPPROVED_RULE,
    candidateGroundingClass: "",
    hardEligible: false,
    reason: "GROUNDING_INVALID_OR_MISSING",
    issues: dedupeViolations(violations),
  };
}

function validateIdentity(rawIdentity, violations) {
  const identity = closedRecord(rawIdentity, IDENTITY_KEYS, "grounding.identity", violations);
  for (const field of IDENTITY_KEYS) {
    if (!exactNonEmpty(identity[field])) violations.push(`grounding.identity.${field}:INVALID`);
  }
}

function validateApplicability(rawApplicability, findingIdentity, violations) {
  const applicability = closedRecord(rawApplicability, APPLICABILITY_KEYS, "grounding.applicability", violations);
  if (!APPLICABILITY_STATUS.has(applicability.status)) {
    violations.push("grounding.applicability.status:INVALID");
  } else if (applicability.status !== "APPLICABLE") {
    violations.push("grounding.applicability.status:NOT_APPLICABLE");
  }
  const scope = closedRecord(applicability.scope, SCOPE_KEYS, "grounding.applicability.scope", violations);
  for (const field of SCOPE_KEYS) {
    if (!exactNonEmpty(scope[field])) {
      violations.push(`grounding.applicability.scope.${field}:INVALID`);
    } else if (scope[field] !== findingIdentity[field]) {
      violations.push(`grounding.applicability.scope.${field}:MISMATCH`);
    }
  }
  if (!isSha256(applicability.scopeHash)) {
    violations.push("grounding.applicability.scopeHash:INVALID");
  } else if (applicability.scopeHash.toLowerCase() !== hashGovernedValue(scope)) {
    violations.push("grounding.applicability.scopeHash:MISMATCH");
  }
  if (!isSha256(applicability.decisionReceiptHash)) {
    violations.push("grounding.applicability.decisionReceiptHash:INVALID");
  }
}

function validateCitation(rawCitation, violations) {
  const citation = closedRecord(rawCitation, CITATION_KEYS, "grounding.citation", violations);
  for (const field of ["obligationId", "locator"]) {
    if (!exactNonEmpty(citation[field])) violations.push(`grounding.citation.${field}:INVALID`);
  }
  if (!isSha256(citation.exactTextHash)) violations.push("grounding.citation.exactTextHash:INVALID");
}

function validateReceipt(rawReceipt, groundingPayload, violations) {
  const receipt = closedRecord(rawReceipt, RECEIPT_KEYS, "grounding.receipt", violations);
  if (receipt.schema !== "fga-finding-grounding-receipt-v1") violations.push("grounding.receipt.schema:INVALID");
  if (!RECEIPT_STATUS.has(receipt.status)) {
    violations.push("grounding.receipt.status:INVALID");
  } else if (receipt.status !== "VALID") {
    violations.push("grounding.receipt.status:NOT_VALID");
  }
  const expectedGroundingHash = hashGovernedValue(groundingPayload);
  if (!isSha256(receipt.groundingHash)) {
    violations.push("grounding.receipt.groundingHash:INVALID");
  } else if (receipt.groundingHash.toLowerCase() !== expectedGroundingHash) {
    violations.push("grounding.receipt.groundingHash:MISMATCH");
  }
  for (const field of ["authorityReceiptHash", "admissionReceiptHash"]) {
    if (!isSha256(receipt[field])) violations.push(`grounding.receipt.${field}:INVALID`);
  }
  if (receipt.finalVerifierEligible !== false) violations.push("grounding.receipt.finalVerifierEligible:INVALID");
  if (receipt.canClaimVerifiedFixed !== false) violations.push("grounding.receipt.canClaimVerifiedFixed:INVALID");

  const receiptIdentity = {
    schema: receipt.schema,
    status: receipt.status,
    groundingHash: receipt.groundingHash,
    authorityReceiptHash: receipt.authorityReceiptHash,
    admissionReceiptHash: receipt.admissionReceiptHash,
    finalVerifierEligible: receipt.finalVerifierEligible,
    canClaimVerifiedFixed: receipt.canClaimVerifiedFixed,
  };
  if (!isSha256(receipt.receiptHash)) {
    violations.push("grounding.receipt.receiptHash:INVALID");
  } else if (receipt.receiptHash.toLowerCase() !== hashGovernedValue(receiptIdentity)) {
    violations.push("grounding.receipt.receiptHash:MISMATCH");
  }
}

export function classifyFindingGrounding(finding = {}) {
  const violations = [];
  const rawGrounding = readGrounding(finding, violations);
  if (rawGrounding === undefined) return invalidResult(violations);

  const snapshotted = snapshotJson(rawGrounding, "grounding");
  violations.push(...snapshotted.violations);
  const snapshot = snapshotted.value;
  if (!isPlainRecord(snapshot)) {
    violations.push("grounding:NOT_A_PLAIN_OBJECT");
    return invalidResult(violations);
  }

  const kind = snapshot.kind;
  const allowedKeys = GROUNDING_KEYS[kind] || ALL_GROUNDING_KEYS;
  const grounding = closedRecord(snapshot, allowedKeys, "grounding", violations);
  if (grounding.schema !== "fga-finding-grounding-v1") violations.push("grounding.schema:INVALID");
  if (!GROUNDING_KEYS[kind]) violations.push("grounding.kind:INVALID");
  validateIdentity(grounding.identity, violations);

  if (!RESOLUTION_STATUS.has(grounding.resolutionStatus)) {
    violations.push("grounding.resolutionStatus:INVALID");
  } else if (grounding.resolutionStatus !== "RESOLVED") {
    violations.push("grounding.resolutionStatus:NOT_RESOLVED");
  }
  if (!AUTHORITY_STATUS.has(grounding.authorityStatus)) {
    violations.push("grounding.authorityStatus:INVALID");
  } else if (grounding.authorityStatus !== "ADMITTED") {
    violations.push("grounding.authorityStatus:NOT_ADMITTED");
  }
  if (!ADMISSION_STATUS.has(grounding.admissionStatus)) {
    violations.push("grounding.admissionStatus:INVALID");
  } else if (grounding.admissionStatus !== "ADMITTED") {
    violations.push("grounding.admissionStatus:NOT_ADMITTED");
  }

  const findingIdentity = safeFindingIdentity(finding, violations);
  validateApplicability(grounding.applicability, findingIdentity, violations);

  if (!LIFECYCLE_STATUS.has(grounding.lifecycleStatus)) {
    violations.push("grounding.lifecycleStatus:INVALID");
  } else if (grounding.lifecycleStatus !== "CURRENT") {
    violations.push("grounding.lifecycleStatus:NOT_CURRENT");
  }

  if (kind === "APPROVED_PRODUCT_CONTRACT") {
    if (!isSha256(grounding.contentHash)) violations.push("grounding.contentHash:INVALID");
  } else if (kind === "CITED_STANDARD") {
    validateCitation(grounding.citation, violations);
  }
  if (grounding.finalVerifierEligible !== false) violations.push("grounding.finalVerifierEligible:INVALID");
  if (grounding.canClaimVerifiedFixed !== false) violations.push("grounding.canClaimVerifiedFixed:INVALID");

  const groundingPayload = Object.fromEntries(
    Object.entries(grounding).filter(([key]) => key !== "receipt"),
  );
  validateReceipt(grounding.receipt, groundingPayload, violations);

  const issues = dedupeViolations(violations);
  if (issues.length > 0) return invalidResult(issues);
  return {
    // A self-consistent object is candidate metadata only. Without an
    // authoritative resolver/receipt readback, every status and hash in it can
    // still have been authored by the same untrusted producer as the finding.
    groundingClass: GROUNDING_CLASS.UNAPPROVED_RULE,
    candidateGroundingClass: kind === "APPROVED_PRODUCT_CONTRACT"
      ? GROUNDING_CLASS.APPROVED_CONTRACT
      : GROUNDING_CLASS.CITED_STANDARD,
    hardEligible: false,
    reason: "GROUNDING_AUTHORITY_NOT_VERIFIED",
    issues: [],
  };
}
