import { createHash } from "node:crypto";

export const GOVERNED_RECEIPT_CLAIM_BOUNDARY = Object.freeze({
  status: "INFERRED",
  requiresHumanConfirm: true,
  activationStatus: "NOT_ACTIVATED",
  finalVerifierEligible: false,
  canClaimVerifiedFixed: false,
  canClaimVerifiedOutcome: false,
  canClaimVerifiedValue: false,
});

const SHA256 = /^[a-f0-9]{64}$/i;

export function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isSha256(value) {
  return nonEmpty(value) && SHA256.test(value);
}

export function normalizedHash(value) {
  return isSha256(value) ? value.toLowerCase() : "";
}

export function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function safeSet(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

export function snapshotJson(value, label = "input", ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return { value, violations: [] };
  }
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? { value, violations: [] }
      : { value: null, violations: [`${label}:NON_FINITE_NUMBER`] };
  }
  if (typeof value !== "object") {
    return { value: null, violations: [`${label}:UNSUPPORTED_JSON_VALUE`] };
  }
  if (ancestors.has(value)) return { value: null, violations: [`${label}:CYCLE`] };

  let prototype;
  let keys;
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
  } catch {
    return { value: null, violations: [`${label}:INTROSPECTION_FAILED`] };
  }

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);

  if (Array.isArray(value)) {
    const output = [];
    const violations = [];
    for (let index = 0; index < value.length; index += 1) {
      let descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      } catch {
        violations.push(`${label}[${index}]:INTROSPECTION_FAILED`);
        output.push(null);
        continue;
      }
      if (!descriptor) {
        violations.push(`${label}[${index}]:SPARSE_ARRAY`);
        output.push(null);
        continue;
      }
      if (!("value" in descriptor) || descriptor.get || descriptor.set) {
        violations.push(`${label}[${index}]:ACCESSOR_NOT_ALLOWED`);
        output.push(null);
        continue;
      }
      const child = snapshotJson(descriptor.value, `${label}[${index}]`, nextAncestors);
      output.push(child.value);
      violations.push(...child.violations);
    }
    const unexpected = keys.filter((key) => {
      if (key === "length") return false;
      return typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length;
    });
    if (unexpected.length > 0) violations.push(`${label}:UNEXPECTED_ARRAY_PROPERTY`);
    return { value: output, violations };
  }

  if (prototype !== Object.prototype && prototype !== null) {
    return { value: {}, violations: [`${label}:NON_PLAIN_OBJECT`] };
  }

  const output = {};
  const violations = [];
  for (const key of keys) {
    if (typeof key !== "string") {
      violations.push(`${label}:SYMBOL_KEY`);
      continue;
    }
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      violations.push(`${label}.${key}:INTROSPECTION_FAILED`);
      continue;
    }
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) {
      violations.push(`${label}.${key}:ACCESSOR_NOT_ALLOWED`);
      continue;
    }
    if (!descriptor.enumerable) {
      violations.push(`${label}.${key}:NON_ENUMERABLE_NOT_ALLOWED`);
      continue;
    }
    const child = snapshotJson(descriptor.value, `${label}.${key}`, nextAncestors);
    safeSet(output, key, child.value);
    violations.push(...child.violations);
  }
  return { value: output, violations };
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

export function hashGovernedValue(value) {
  const serialized = JSON.stringify(canonicalize(value));
  return createHash("sha256").update(serialized === undefined ? "null" : serialized).digest("hex");
}

export function closedRecord(value, allowedKeys, label, violations) {
  if (!isPlainRecord(value)) {
    violations.push(`${label}:NOT_A_PLAIN_OBJECT`);
    return {};
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) violations.push(`${label}.${key}:UNEXPECTED_FIELD`);
  }
  return value;
}

export function uniqueSorted(values = []) {
  return [...new Set(values.filter(nonEmpty).map((value) => value.trim()))].sort();
}

export function dedupeViolations(violations = []) {
  return [...new Set(violations.filter(nonEmpty))].sort();
}
