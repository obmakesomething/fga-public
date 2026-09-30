import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const CHECKER = "public-files";
const FORBIDDEN_SEGMENT = /^(?:\.git|\.env(?:\..*)?|\.npmrc|\.DS_Store|node_modules|private-review|artifacts|packs|coverage)$/i;
const TEXT_EXT = /(?:\.mjs|\.js|\.json|\.md|\.txt|\.gitignore)$/i;
const SENSITIVE = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i],
  ["token", /(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|npm_[A-Za-z0-9]{20,})/],
  ["credential-assignment", /(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[=:]\s*["']?[^\s"'{}]{12,}/i],
  ["credential-url", /(?:https?:\/\/)[^\s/@]+:[^\s/@]+@/i],
  ["private-transport", /(?:git\+ssh:\/\/|git@github\.com:|https?:\/\/[^\s/]*[.]npmjs[.]org\/[^\s]*_authToken)/i],
  ["local-home", /(?:\/Users\/[^\s/"']+\/|\/home\/[^\s/"']+\/|file:\/\/|\\Users\\[^\s\\"']+\\)/i],
];

function issue(code, path = "", kind = "") { return { code, path, ...(kind ? { kind } : {}) }; }

export function validPayloadPath(value) {
  return typeof value === "string" && value.length > 0 && !value.startsWith("/") &&
    !value.includes("\\") && !value.includes("\0") &&
    value.split("/").every((part) => part && part !== "." && part !== ".." && !FORBIDDEN_SEGMENT.test(part));
}

export function inventory(root, { allowRootGit = false } = {}) {
  const files = [];
  const problems = [];
  const base = resolve(root);
  if (!existsSync(base)) return { files, problems: [issue("ROOT_MISSING", ".")] };
  const rootStat = lstatSync(base);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) return { files, problems: [issue("ROOT_NOT_DIRECTORY", ".")] };
  function visit(relative) {
    const absolute = join(base, relative);
    let entries;
    try { entries = readdirSync(absolute, { withFileTypes: true }); }
    catch { problems.push(issue("READ_FAILED", relative || ".")); return; }
    for (const entry of entries) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      // A source checkout has local Git metadata outside the release payload.
      // Never follow it or allow it in an npm artifact or nested source path.
      if (allowRootGit && path === ".git") {
        const stat = lstatSync(join(base, path));
        if (stat.isSymbolicLink()) problems.push(issue("SYMLINK", path));
        else if (!stat.isDirectory() && !stat.isFile()) problems.push(issue("NON_FILE", path));
        continue;
      }
      if (!validPayloadPath(path)) { problems.push(issue("UNSAFE_PATH", path)); continue; }
      const target = join(base, path);
      let stat;
      try { stat = lstatSync(target); }
      catch { problems.push(issue("READ_FAILED", path)); continue; }
      if (stat.isSymbolicLink()) { problems.push(issue("SYMLINK", path)); continue; }
      if (stat.isDirectory()) { visit(path); continue; }
      if (!stat.isFile()) { problems.push(issue("NON_FILE", path)); continue; }
      const canonical = resolve(target);
      if (!canonical.startsWith(`${base}${sep}`)) { problems.push(issue("BOUNDARY_ESCAPE", path)); continue; }
      files.push(path);
    }
  }
  visit("");
  return { files: files.sort(), problems };
}

export function checkPublicFiles(root = resolve(import.meta.dirname, ".."), { artifact = "source" } = {}) {
  const base = resolve(root);
  const { files, problems } = inventory(base, { allowRootGit: artifact === "source" });
  const errors = [...problems];
  if (problems.length) return { checker: CHECKER, ok: false, inspectedFiles: files.length, errors };
  let manifest;
  try { manifest = JSON.parse(readFileSync(join(base, "provenance/public-files.json"), "utf8")); }
  catch { errors.push(issue("MANIFEST_UNREADABLE", "provenance/public-files.json")); }
  const listed = manifest?.files;
  if (manifest && (manifest.schema !== "fga-public-files-v1" || !Array.isArray(listed))) {
    errors.push(issue("MANIFEST_INVALID", "provenance/public-files.json"));
  }
  if (artifact !== "source" && artifact !== "npm") errors.push(issue("ARTIFACT_KIND_INVALID"));
  if (Array.isArray(listed)) {
    const allowed = new Set();
    for (const path of listed) {
      if (!validPayloadPath(path)) errors.push(issue("MANIFEST_UNSAFE_PATH", String(path)));
      else if (allowed.has(path)) errors.push(issue("MANIFEST_DUPLICATE", path));
      else allowed.add(path);
    }
    for (const path of files) if (!allowed.has(path)) errors.push(issue("UNLISTED_FILE", path));
    for (const path of allowed) if (!files.includes(path) && !(artifact === "npm" && path === "package-lock.json")) errors.push(issue("MISSING_FILE", path));
    for (const path of ["package.json", "provenance/public-files.json", "publication-review.json"])
      if (!allowed.has(path)) errors.push(issue("REQUIRED_FILE_UNLISTED", path));
    const digestPath = "provenance/payload-sha256.json";
    if (files.includes(digestPath)) {
      let digests;
      try { digests = JSON.parse(readFileSync(join(base, digestPath), "utf8")); }
      catch { errors.push(issue("DIGEST_MANIFEST_UNREADABLE", digestPath)); }
      if (digests) {
        if (digests.schema !== "fga-payload-sha256-v1" || !Array.isArray(digests.excluded) ||
            digests.excluded.length !== 1 || digests.excluded[0] !== digestPath ||
            !digests.files || typeof digests.files !== "object" || Array.isArray(digests.files)) {
          errors.push(issue("DIGEST_MANIFEST_INVALID", digestPath));
        } else {
          const expectedPaths = [...allowed].filter((path) => path !== digestPath).sort();
          const actualPaths = Object.keys(digests.files).sort();
          if (JSON.stringify(expectedPaths) !== JSON.stringify(actualPaths)) errors.push(issue("DIGEST_KEYSET_MISMATCH", digestPath));
          for (const path of expectedPaths) {
            if (artifact === "npm" && path === "package-lock.json" && !files.includes(path)) continue;
            if (!files.includes(path)) continue;
            const expected = digests.files[path];
            if (typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected)) { errors.push(issue("DIGEST_INVALID", path)); continue; }
            const actual = createHash("sha256").update(readFileSync(join(base, path))).digest("hex");
            if (actual !== expected) errors.push(issue("DIGEST_MISMATCH", path));
          }
        }
      }
    }
  }
  let pkg;
  try { pkg = JSON.parse(readFileSync(join(base, "package.json"), "utf8")); }
  catch { errors.push(issue("PACKAGE_UNREADABLE", "package.json")); }
  if (pkg) {
    if (pkg.private !== true) errors.push(issue("PRIVATE_REQUIRED", "package.json"));
    if (pkg.license !== "UNLICENSED") errors.push(issue("UNLICENSED_REQUIRED", "package.json"));
    for (const field of ["author", "contributors", "maintainers", "publishConfig", "repository", "homepage", "bugs", "funding"])
      if (pkg[field] !== undefined) errors.push(issue("PERSONAL_OR_PUBLISH_METADATA", "package.json", field));
    if (!Array.isArray(pkg.files) || pkg.files.some((path) => !validPayloadPath(path) || !listed?.includes(path) || path.endsWith("/")) ||
        (Array.isArray(listed) && JSON.stringify([...pkg.files].sort()) !== JSON.stringify(listed.filter((path) => path !== "package.json" && path !== "package-lock.json").sort())))
      errors.push(issue("NPM_FILES_NOT_EXPLICIT", "package.json"));
  }
  for (const path of files) {
    if (!TEXT_EXT.test(path)) { errors.push(issue("UNREVIEWED_FILE_TYPE", path)); continue; }
    let bytes;
    try { bytes = readFileSync(join(base, path)); }
    catch { errors.push(issue("READ_FAILED", path)); continue; }
    if (bytes.includes(0)) { errors.push(issue("BINARY_CONTENT", path)); continue; }
    const content = bytes.toString("utf8");
    if (content.includes("\uFFFD")) errors.push(issue("NON_UTF8_CONTENT", path));
    for (const [kind, pattern] of SENSITIVE) if (pattern.test(content)) errors.push(issue("SENSITIVE_PATTERN", path, kind));
    if (/\.map$/i.test(path) || /[#@]\s*sourceMappingURL\s*=/.test(content)) errors.push(issue("SOURCE_MAP", path));
  }
  return { checker: CHECKER, ok: errors.length === 0, inspectedFiles: files.length, errors };
}

function cliRoot() {
  const at = process.argv.indexOf("--root");
  if (at < 0) return resolve(import.meta.dirname, "..");
  if (!process.argv[at + 1]) throw new Error("--root requires a path");
  return resolve(process.argv[at + 1]);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let result;
  try { result = checkPublicFiles(cliRoot(), { artifact: process.argv.includes("--artifact") ? process.argv[process.argv.indexOf("--artifact") + 1] : "source" }); }
  catch { result = { checker: CHECKER, ok: false, errors: [issue("CHECKER_FAILED")] }; }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}
