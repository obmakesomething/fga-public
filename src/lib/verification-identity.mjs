import { createHash } from "node:crypto";

export const VERIFICATION_IDENTITY_STATUS = Object.freeze({
  BOUND: "BOUND",
  NOT_EVALUATED: "NOT_EVALUATED",
});

export const VERIFICATION_IDENTITY_COMPONENTS = Object.freeze([
  "contractSourceReceiptHash",
  "contractContentHash",
  "contractApprovalReceiptHash",
  "applicabilityContextHash",
  "semanticConfigurationHash",
  "verificationRecipeHash",
  "targetIdentityHash",
  "environmentIdentityHash",
  "routeStateSetHash",
  "evidencePolicyHash",
]);

const INPUT_KEYS = new Set([
  "schema",
  "contractId",
  "contractVersion",
  ...VERIFICATION_IDENTITY_COMPONENTS,
  "engineApiVersion",
  "comparatorVersion",
  "finalVerifierEligible",
  "canClaimVerifiedFixed",
]);
const ENGINE_VERSION_KEYS = new Set(["major", "minor"]);
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

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha256(value) {
  return nonEmpty(value) && SHA256.test(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

function digest(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function snapshotClosedRecord(value, allowedKeys, label) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { value: {}, violations: [`${label}:NOT_AN_OBJECT`] };
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return { value: {}, violations: [`${label}:NON_PLAIN_OBJECT`] };
    }
    const keys = Reflect.ownKeys(value);
    const violations = [];
    const snapshot = {};
    for (const key of keys) {
      if (typeof key !== "string") {
        violations.push(`${label}:SYMBOL_KEY`);
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) {
        violations.push(`${label}.${key}:ACCESSOR_NOT_ALLOWED`);
        continue;
      }
      if (!descriptor.enumerable) {
        violations.push(`${label}.${key}:NON_ENUMERABLE_NOT_ALLOWED`);
        continue;
      }
      if (!allowedKeys.has(key)) {
        violations.push(`${label}.${key}:UNEXPECTED_FIELD`);
        continue;
      }
      snapshot[key] = descriptor.value;
    }
    return { value: snapshot, violations };
  } catch {
    return { value: {}, violations: [`${label}:INTROSPECTION_FAILED`] };
  }
}

function normalizedHash(value) {
  return isSha256(value) ? value.toLowerCase() : "";
}

function validateAndNormalize(rawInput) {
  const outer = snapshotClosedRecord(rawInput, INPUT_KEYS, "input");
  const input = outer.value;
  const violations = [...outer.violations];

  if (input.schema !== "fga-verification-identity-input-v1") violations.push("input.schema:INVALID");
  if (!nonEmpty(input.contractId)) violations.push("input.contractId:INVALID");
  if (!nonEmpty(input.contractVersion)) violations.push("input.contractVersion:INVALID");

  const components = {};
  for (const field of VERIFICATION_IDENTITY_COMPONENTS) {
    const normalized = normalizedHash(input[field]);
    if (!normalized) violations.push(`input.${field}:INVALID`);
    components[field] = normalized;
  }

  const version = snapshotClosedRecord(input.engineApiVersion, ENGINE_VERSION_KEYS, "input.engineApiVersion");
  violations.push(...version.violations);
  const major = version.value.major;
  const minor = version.value.minor;
  if (!Number.isInteger(major) || major < 0) violations.push("input.engineApiVersion.major:INVALID");
  if (!Number.isInteger(minor) || minor < 0) violations.push("input.engineApiVersion.minor:INVALID");
  if (!nonEmpty(input.comparatorVersion)) violations.push("input.comparatorVersion:INVALID");
  if (input.finalVerifierEligible !== false) violations.push("input.finalVerifierEligible:INVALID");
  if (input.canClaimVerifiedFixed !== false) violations.push("input.canClaimVerifiedFixed:INVALID");

  return {
    normalized: {
      schema: "fga-verification-identity-input-v1",
      contractId: nonEmpty(input.contractId) ? input.contractId.trim() : "",
      contractVersion: nonEmpty(input.contractVersion) ? input.contractVersion.trim() : "",
      ...components,
      engineApiVersion: {
        major: Number.isInteger(major) && major >= 0 ? major : 0,
        minor: Number.isInteger(minor) && minor >= 0 ? minor : 0,
      },
      comparatorVersion: nonEmpty(input.comparatorVersion) ? input.comparatorVersion.trim() : "",
      finalVerifierEligible: false,
      canClaimVerifiedFixed: false,
    },
    violations: [...new Set(violations)],
  };
}

export function buildVerificationIdentity(rawInput = {}) {
  const { normalized, violations } = validateAndNormalize(rawInput);
  const artifactIdentity = {
    ruleVersion: "verification-identity-v1",
    normalizedInput: normalized,
    violations,
  };
  const artifactHash = digest(artifactIdentity);

  if (violations.length > 0) {
    return {
      schema: "fga-verification-identity-v1",
      ruleVersion: "verification-identity-v1",
      identityStatus: VERIFICATION_IDENTITY_STATUS.NOT_EVALUATED,
      contractId: normalized.contractId,
      contractVersion: normalized.contractVersion,
      componentHashes: Object.fromEntries(
        VERIFICATION_IDENTITY_COMPONENTS.map((field) => [field, normalized[field]]),
      ),
      engineApiVersion: normalized.engineApiVersion,
      comparatorVersion: normalized.comparatorVersion,
      contractAuthorityHash: "",
      expectedSideHash: "",
      comparisonScopeHash: "",
      verificationIdentityHash: "",
      artifactHash,
      violations,
      claimBoundary: "This artifact binds candidate identity inputs only. It does not verify source authority, approval, target authority, evidence, deployment, customer outcome, or fixed status.",
      ...CLAIM_BOUNDARY,
    };
  }

  const contractAuthorityHash = digest({
    contractId: normalized.contractId,
    contractVersion: normalized.contractVersion,
    contractSourceReceiptHash: normalized.contractSourceReceiptHash,
    contractContentHash: normalized.contractContentHash,
    contractApprovalReceiptHash: normalized.contractApprovalReceiptHash,
  });
  const expectedSideHash = digest({
    contractAuthorityHash,
    applicabilityContextHash: normalized.applicabilityContextHash,
    semanticConfigurationHash: normalized.semanticConfigurationHash,
    verificationRecipeHash: normalized.verificationRecipeHash,
  });
  const comparisonScopeHash = digest({
    targetIdentityHash: normalized.targetIdentityHash,
    environmentIdentityHash: normalized.environmentIdentityHash,
    routeStateSetHash: normalized.routeStateSetHash,
    applicabilityContextHash: normalized.applicabilityContextHash,
    semanticConfigurationHash: normalized.semanticConfigurationHash,
    verificationRecipeHash: normalized.verificationRecipeHash,
    evidencePolicyHash: normalized.evidencePolicyHash,
    engineApiVersion: normalized.engineApiVersion,
    comparatorVersion: normalized.comparatorVersion,
  });
  const componentHashes = Object.fromEntries(
    VERIFICATION_IDENTITY_COMPONENTS.map((field) => [field, normalized[field]]),
  );
  const verificationIdentityHash = digest({
    contractAuthorityHash,
    expectedSideHash,
    comparisonScopeHash,
    componentHashes,
    engineApiVersion: normalized.engineApiVersion,
    comparatorVersion: normalized.comparatorVersion,
  });

  return {
    schema: "fga-verification-identity-v1",
    ruleVersion: "verification-identity-v1",
    identityStatus: VERIFICATION_IDENTITY_STATUS.BOUND,
    contractId: normalized.contractId,
    contractVersion: normalized.contractVersion,
    componentHashes,
    engineApiVersion: normalized.engineApiVersion,
    comparatorVersion: normalized.comparatorVersion,
    contractAuthorityHash,
    expectedSideHash,
    comparisonScopeHash,
    verificationIdentityHash,
    artifactHash,
    violations: [],
    claimBoundary: "This artifact binds candidate identity inputs only. It does not verify source authority, approval, target authority, evidence, deployment, customer outcome, or fixed status.",
    ...CLAIM_BOUNDARY,
  };
}
