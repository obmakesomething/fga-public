import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { checkPublicFiles, inventory } from "../scripts/check-public-files.mjs";
import { checkPublicImports } from "../scripts/check-public-imports.mjs";
import { checkPublicClaims } from "../scripts/check-public-claims.mjs";
import { checkPublicExamples } from "../scripts/check-public-examples.mjs";

const source = resolve(import.meta.dirname, "..");
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "fga-public-check-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(source, root, { recursive: true, filter: (path) => path !== join(source, ".git") && !path.split("/").includes("node_modules") });
  const manifestPath = join(root, "provenance/public-files.json");
  if (!existsSync(manifestPath)) {
    const files = [...inventory(root).files, "provenance/public-files.json"].sort();
    writeFileSync(manifestPath, `${JSON.stringify({ schema: "fga-public-files-v1", files })}\n`);
  }
  return root;
}
function contains(result, code) { assert.equal(result.ok, false); assert.ok(result.errors.some((error) => error.code === code), JSON.stringify(result.errors)); }

test("checkout metadata is excluded only at the source root", (t) => {
  const root = fixture(t);
  mkdirSync(join(root, ".git"));
  writeFileSync(join(root, ".git", "config"), "checkout metadata\n");
  assert.equal(checkPublicFiles(root).ok, true);
  assert.equal(checkPublicImports(root).ok, true);
  contains(checkPublicFiles(root, { artifact: "npm" }), "UNSAFE_PATH");
  mkdirSync(join(root, "src", ".git"));
  contains(checkPublicFiles(root), "UNSAFE_PATH");
});

test("a checkout gitfile is excluded but a symlink is rejected", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, ".git"), "gitdir: synthetic-worktree-metadata\n");
  assert.equal(checkPublicFiles(root).ok, true);
  assert.equal(checkPublicImports(root).ok, true);
  rmSync(join(root, ".git"));
  symlinkSync(join(root, "README.md"), join(root, ".git"));
  contains(checkPublicFiles(root), "SYMLINK");
});

test("source publication authorization preserves all disabled operational flags", (t) => {
  const root = fixture(t);
  const path = join(root, "publication-review.json");
  const review = JSON.parse(readFileSync(path, "utf8"));
  review.schema = "fga-publication-review-v2";
  review.publicationReviewStatus = "OWNER_AUTHORIZED_SOURCE_RELEASE";
  review.publicationChannel = "GITHUB_SOURCE_AND_RELEASE_ASSETS";
  review.registryReleasePerformed = false;
  delete review.published;
  writeFileSync(path, `${JSON.stringify(review)}\n`);
  assert.equal(checkPublicClaims(root).ok, true);
  for (const field of ["runtimeImplementationAuthorized", "certificateIssuanceAuthorized",
    "blockingActivationAuthorized", "publicReadinessAuthorized", "packetIssuanceAuthorized",
    "finalVerifierEligible", "canClaimVerifiedFixed", "canClaimVerifiedOutcome", "canClaimVerifiedValue"]) {
    writeFileSync(path, `${JSON.stringify({ ...review, [field]: true })}\n`);
    contains(checkPublicClaims(root), "AUTHORITY_PROMOTION");
  }
});

test("an unlisted source file fails the payload inventory", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, "unlisted.txt"), "extra\n");
  contains(checkPublicFiles(root), "UNLISTED_FILE");
});

test("symlink is rejected even when it points to a harmless local file", (t) => {
  const root = fixture(t);
  symlinkSync(join(root, "README.md"), join(root, "linked-readme.md"));
  contains(checkPublicFiles(root), "SYMLINK");
});

test("traversal in the public manifest is rejected", (t) => {
  const root = fixture(t);
  const path = join(root, "provenance/public-files.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  manifest.files.push("../private-review/secret.txt");
  writeFileSync(path, `${JSON.stringify(manifest)}\n`);
  contains(checkPublicFiles(root), "MANIFEST_UNSAFE_PATH");
});

test("sensitive pattern reports kind and path without returning its value", (t) => {
  const root = fixture(t);
  const path = join(root, "docs/architecture.md");
  const marker = `ghp_${"A".repeat(28)}`;
  writeFileSync(path, `${readFileSync(path, "utf8")}\n${marker}\n`);
  const result = checkPublicFiles(root);
  contains(result, "SENSITIVE_PATTERN");
  assert.equal(JSON.stringify(result).includes(marker), false);
});

test("a changed payload byte fails the SHA-256 manifest", (t) => {
  const root = fixture(t);
  const manifestPath = join(root, "provenance/public-files.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const digestPath = "provenance/payload-sha256.json";
  if (!manifest.files.includes(digestPath)) manifest.files.push(digestPath);
  manifest.files.sort();
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
  const files = Object.fromEntries(manifest.files.filter((path) => path !== digestPath).map((path) => [
    path, createHash("sha256").update(readFileSync(join(root, path))).digest("hex"),
  ]));
  writeFileSync(join(root, digestPath), `${JSON.stringify({ schema: "fga-payload-sha256-v1", files, excluded: [digestPath] })}\n`);
  const path = join(root, "docs/architecture.md");
  writeFileSync(path, `${readFileSync(path, "utf8")}\nchanged\n`);
  contains(checkPublicFiles(root), "DIGEST_MISMATCH");
});

test("unresolved and nonliteral runtime imports fail dependency closure", (t) => {
  const root = fixture(t);
  const path = join(root, "src/index.mjs");
  writeFileSync(path, `${readFileSync(path, "utf8")}\nexport { missing } from './missing.mjs';\nconst p = './other.mjs'; import(p);\n`);
  const result = checkPublicImports(root);
  contains(result, "IMPORT_MISSING");
  assert.ok(result.errors.some((error) => error.code === "NON_LITERAL_IMPORT"));
});

test("a promoted operational flag fails claim review", (t) => {
  const root = fixture(t);
  const path = join(root, "publication-review.json");
  const review = JSON.parse(readFileSync(path, "utf8"));
  review.finalVerifierEligible = true;
  writeFileSync(path, `${JSON.stringify(review)}\n`);
  contains(checkPublicClaims(root), "AUTHORITY_PROMOTION");
});

test("a stale recorded example result fails replay", (t) => {
  const root = fixture(t);
  const path = join(root, "examples/expected-output.json");
  const expected = JSON.parse(readFileSync(path, "utf8"));
  expected.examples.E2.outputs.passingTransition.verdict = "FAIL";
  writeFileSync(path, `${JSON.stringify(expected)}\n`);
  contains(checkPublicExamples(root), "EXPECTED_OUTPUT_STALE");
});

test("a runner omitting E1 outputs fails the provenance contrast", (t) => {
  const root = fixture(t);
  const path = join(root, "examples/run.mjs");
  const original = readFileSync(path, "utf8");
  assert.ok(original.includes("examples: { E1: e1, E2: e2"));
  writeFileSync(path, original.replace("examples: { E1: e1, E2: e2", "examples: { E1: { ...e1, outputs: undefined }, E2: e2"));
  contains(checkPublicExamples(root), "E1_PROVENANCE_CONTRAST");
});
