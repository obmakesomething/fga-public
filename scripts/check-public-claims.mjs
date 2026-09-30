import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CHECKER = "public-claims";
const issue = (code, path = "") => ({ code, path });
const DISABLED = [
  "runtimeImplementationAuthorized", "certificateIssuanceAuthorized", "blockingActivationAuthorized",
  "publicReadinessAuthorized", "packetIssuanceAuthorized", "finalVerifierEligible",
  "canClaimVerifiedFixed", "canClaimVerifiedOutcome", "canClaimVerifiedValue",
];
const EXPECTED_STATUS = {
  status: "INFERRED", admissionStatus: "NOT_ADMITTED", activationStatus: "NOT_ACTIVATED",
  requiresHumanConfirm: true,
};

function readJson(base, path, errors) {
  try { return JSON.parse(readFileSync(join(base, path), "utf8")); }
  catch { errors.push(issue("JSON_UNREADABLE", path)); return null; }
}

export function rootExports(source) {
  const names = new Set();
  for (const match of source.matchAll(/\bexport\s*\{([^}]+)\}/g)) {
    for (const part of match[1].split(",")) {
      const token = part.trim();
      if (!token) continue;
      const alias = token.match(/\bas\s+([\w$]+)$/);
      names.add(alias ? alias[1] : token);
    }
  }
  for (const match of source.matchAll(/\bexport\s+(?:const|let|var|function|class)\s+([\w$]+)/g)) names.add(match[1]);
  return [...names].sort();
}

export function checkPublicClaims(root = resolve(import.meta.dirname, "..")) {
  const base = resolve(root);
  const errors = [];
  const pkg = readJson(base, "package.json", errors);
  const review = readJson(base, "publication-review.json", errors);
  let source = "";
  let readme = "";
  try { source = readFileSync(join(base, "src/index.mjs"), "utf8"); }
  catch { errors.push(issue("ENTRY_UNREADABLE", "src/index.mjs")); }
  try { readme = readFileSync(join(base, "README.md"), "utf8"); }
  catch { errors.push(issue("README_UNREADABLE", "README.md")); }
  if (pkg) {
    if (pkg.name !== "fga-research-extract" || pkg.private !== true || pkg.license !== "UNLICENSED") errors.push(issue("PACKAGE_PUBLICATION_STATE", "package.json"));
    if (pkg.exports?.["."] !== "./src/index.mjs" || pkg.exports?.["./manifest"] !== "./publication-review.json") errors.push(issue("PACKAGE_EXPORT_CONTRACT", "package.json"));
  }
  if (review) {
    if (review.schema !== "fga-publication-review-v2" ||
        review.publicationReviewStatus !== "OWNER_AUTHORIZED_SOURCE_RELEASE" ||
        review.publicationChannel !== "GITHUB_SOURCE_AND_RELEASE_ASSETS" ||
        review.registryReleasePerformed !== false || review.published !== undefined)
      errors.push(issue("PUBLICATION_REVIEW_STATE", "publication-review.json"));
    for (const [field, expected] of Object.entries(EXPECTED_STATUS)) if (review[field] !== expected) errors.push(issue("FROZEN_STATUS_CHANGED", `publication-review.json:${field}`));
    for (const field of DISABLED) if (review[field] !== false) errors.push(issue("AUTHORITY_PROMOTION", `publication-review.json:${field}`));
    if (review.packageVersion !== pkg?.version || !/^[a-f0-9]{40}$/.test(review.sourceCommit || "")) errors.push(issue("PROVENANCE_MISMATCH", "publication-review.json"));
    const actual = rootExports(source);
    const declared = Array.isArray(review.exports) ? [...review.exports].sort() : [];
    if (new Set(declared).size !== declared.length || JSON.stringify(actual) !== JSON.stringify(declared)) errors.push(issue("EXPORT_MANIFEST_MISMATCH", "publication-review.json"));
    if (!/SUBSET|NOT_PUBLIC_V1_COMPATIBLE/.test(review.compatibility || "")) errors.push(issue("COMPATIBILITY_SCOPE", "publication-review.json"));
  }
  if (readme) {
    for (const [code, pattern] of [
      ["README_RESEARCH_SCOPE", /research/i],
      ["README_LICENSE", /UNLICENSED/],
      ["README_PRIVATE_STATE", /private\s*:\s*true/i],
      ["README_ACTIVATION_LIMIT", /NOT_ACTIVATED/],
    ]) if (!pattern.test(readme)) errors.push(issue(code, "README.md"));
    if (/\b(?:fully|completely)\s+compatible\s+with\s+(?:the\s+)?(?:upstream|original|fga-engine)/i.test(readme)) errors.push(issue("OVERBROAD_COMPATIBILITY_CLAIM", "README.md"));
    const marker = readme.match(/<!-- example-summary:start -->([\s\S]*?)<!-- example-summary:end -->/);
    if (!marker) errors.push(issue("README_EXAMPLE_SUMMARY_MISSING", "README.md"));
    else {
      const raw = marker[1].trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      let summary;
      try { summary = JSON.parse(raw); }
      catch { errors.push(issue("README_EXAMPLE_SUMMARY_INVALID", "README.md")); }
      const expected = readJson(base, "examples/summary.json", errors);
      if (summary && expected && JSON.stringify(summary) !== JSON.stringify(expected)) errors.push(issue("README_EXAMPLE_SUMMARY_STALE", "README.md"));
    }
  }
  return { checker: CHECKER, ok: errors.length === 0, declaredExports: review?.exports?.length ?? 0, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const at = process.argv.indexOf("--root");
  const root = at < 0 ? resolve(import.meta.dirname, "..") : process.argv[at + 1] ? resolve(process.argv[at + 1]) : "";
  let result;
  try { result = root ? checkPublicClaims(root) : { checker: CHECKER, ok: false, errors: [issue("ROOT_ARGUMENT_MISSING")] }; }
  catch { result = { checker: CHECKER, ok: false, errors: [issue("CHECKER_FAILED")] }; }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}
