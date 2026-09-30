import { existsSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { inventory } from "./check-public-files.mjs";

const CHECKER = "public-imports";
const BUILTINS = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));
const issue = (code, path = "", detail = "") => ({ code, path, ...(detail ? { detail } : {}) });

function within(base, target) { return target.startsWith(`${base}${sep}`); }
function sourceImports(source) {
  const imports = [];
  // Deliberately bounded syntax inventory for the package's plain ESM source.
  for (const match of source.matchAll(/\b(?:import|export)\s+(?:\{[^}]*\}|\*\s*(?:as\s+[\w$]+)?|[\w$]+(?:\s*,\s*\{[^}]*\})?)\s+from\s*(["'])([^"']+)\1/g)) imports.push(match[2]);
  for (const match of source.matchAll(/\bimport\s*(["'])([^"']+)\1/g)) imports.push(match[2]);
  const dynamic = [];
  for (const match of source.matchAll(/\b(?:import|require)\s*\(\s*([^)]*)\)/g)) {
    const literal = match[1].trim().match(/^(["'])([^"']+)\1\s*$/);
    if (literal) imports.push(literal[2]); else dynamic.push("NON_LITERAL_IMPORT");
  }
  return { imports, dynamic };
}

function resolveSpecifier(base, from, specifier, packageName, errors) {
  if (specifier.startsWith("node:")) {
    if (!BUILTINS.has(specifier.slice(5))) errors.push(issue("UNKNOWN_NODE_BUILTIN", from));
    return;
  }
  if (BUILTINS.has(specifier)) return;
  if (specifier === packageName) return;
  if (!specifier.startsWith(".")) { errors.push(issue("EXTERNAL_DEPENDENCY", from, specifier)); return; }
  const target = resolve(base, dirname(from), specifier);
  if (!within(base, target)) { errors.push(issue("IMPORT_ESCAPE", from)); return; }
  if (!existsSync(target) || !statSync(target).isFile()) errors.push(issue("IMPORT_MISSING", from, specifier));
  else if (!/[.]m?js$|[.]json$/.test(target)) errors.push(issue("IMPORT_UNREVIEWED_TYPE", from));
}

function pointerExists(document, fragment) {
  if (!fragment || fragment === "#") return true;
  if (!fragment.startsWith("#/")) return false;
  let cursor = document;
  for (const encoded of fragment.slice(2).split("/")) {
    const key = decodeURIComponent(encoded).replace(/~1/g, "/").replace(/~0/g, "~");
    if (!cursor || typeof cursor !== "object" || !Object.hasOwn(cursor, key)) return false;
    cursor = cursor[key];
  }
  return true;
}

function inspectSchemaRefs(base, file, seen, errors) {
  if (seen.has(file)) return;
  seen.add(file);
  let document;
  try { document = JSON.parse(readFileSync(join(base, file), "utf8")); }
  catch { errors.push(issue("SCHEMA_UNREADABLE", file)); return; }
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (typeof value.$ref === "string") {
      const [path, fragment = ""] = value.$ref.split("#", 2);
      if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith("/")) errors.push(issue("EXTERNAL_SCHEMA_REF", file));
      else {
        const target = path ? resolve(base, dirname(file), path) : join(base, file);
        if (!within(join(base, "schemas"), target) || !existsSync(target) || extname(target) !== ".json") errors.push(issue("SCHEMA_REF_MISSING", file));
        else {
          let targetDocument;
          try { targetDocument = path ? JSON.parse(readFileSync(target, "utf8")) : document; }
          catch { errors.push(issue("SCHEMA_REF_UNREADABLE", file)); }
          if (targetDocument) {
            if (!pointerExists(targetDocument, fragment ? `#${fragment}` : "")) errors.push(issue("SCHEMA_REF_POINTER_MISSING", file));
            if (path) inspectSchemaRefs(base, relative(base, target).split(sep).join("/"), seen, errors);
          }
        }
      }
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(document);
}

export function checkPublicImports(root = resolve(import.meta.dirname, "..")) {
  const base = resolve(root);
  const errors = [];
  const { files, problems } = inventory(base, { allowRootGit: true });
  errors.push(...problems);
  if (problems.length) return { checker: CHECKER, ok: false, inspectedRuntimeFiles: 0, inspectedSchemas: 0, errors };
  let pkg;
  try { pkg = JSON.parse(readFileSync(join(base, "package.json"), "utf8")); }
  catch { errors.push(issue("PACKAGE_UNREADABLE", "package.json")); }
  const packageName = pkg?.name;
  if (packageName !== "fga-research-extract" || pkg?.dependencies && Object.keys(pkg.dependencies).length || pkg?.optionalDependencies && Object.keys(pkg.optionalDependencies).length) errors.push(issue("PACKAGE_DEPENDENCY_CONTRACT", "package.json"));
  const runtimeFiles = files.filter((path) => /^(?:src|examples)\/.*\.mjs$/.test(path));
  for (const path of runtimeFiles) {
    const content = readFileSync(join(base, path), "utf8");
    const parsed = sourceImports(content);
    for (const specifier of parsed.imports) resolveSpecifier(base, path, specifier, packageName, errors);
    for (const code of parsed.dynamic) errors.push(issue(code, path));
    if (/\b(?:child_process|worker_threads|process\.env|process\.exec|eval\s*\(|new\s+Function\s*\()/.test(content)) errors.push(issue("RUNTIME_CAPABILITY", path));
    if (/\b(?:readFile(?:Sync)?|readdir(?:Sync)?|glob(?:Sync)?|createReadStream)\s*\(/.test(content) && path !== "src/schemas.mjs") errors.push(issue("UNREVIEWED_RUNTIME_IO", path));
    if (path === "src/schemas.mjs") {
      const reads = [...content.matchAll(/\breadFileSync\s*\(([^)]*)\)/g)];
      if (reads.length !== 1 || reads[0][1].trim() !== "url") errors.push(issue("UNREVIEWED_SCHEMA_IO", path));
    }
    for (const match of content.matchAll(/new\s+URL\s*\(\s*([^,]+),\s*import\.meta\.url\s*\)/g)) {
      const literal = match[1].trim().match(/^(["'])([^"']+)\1$/);
      if (literal) resolveSpecifier(base, path, literal[2], packageName, errors);
      else if (!(path === "src/schemas.mjs" && /^`\.\.\/schemas\/\$\{fileName\}`$/.test(match[1].trim()))) errors.push(issue("NON_LITERAL_ASSET_URL", path));
    }
  }
  const registryPath = "src/schemas.mjs";
  if (files.includes(registryPath)) {
    const registry = readFileSync(join(base, registryPath), "utf8");
    const listed = [...registry.matchAll(/"([\w-]+)"\s*:\s*"([\w.-]+\.schema\.json)"/g)].map((m) => m[2]);
    const actual = files.filter((path) => /^schemas\/[^/]+\.schema\.json$/.test(path)).map((path) => path.slice(8));
    for (const name of listed) if (!actual.includes(name)) errors.push(issue("REGISTRY_SCHEMA_MISSING", registryPath, name));
    for (const name of actual) if (!listed.includes(name)) errors.push(issue("UNREGISTERED_SCHEMA", `schemas/${name}`));
    if (new Set(listed).size !== listed.length || listed.length !== 4) errors.push(issue("REGISTRY_SCHEMA_SET", registryPath));
  } else errors.push(issue("REGISTRY_MISSING", registryPath));
  const seen = new Set();
  for (const path of files.filter((name) => /^schemas\/.*\.json$/.test(name))) inspectSchemaRefs(base, path, seen, errors);
  return { checker: CHECKER, ok: errors.length === 0, inspectedRuntimeFiles: runtimeFiles.length, inspectedSchemas: seen.size, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let root = resolve(import.meta.dirname, "..");
  const at = process.argv.indexOf("--root");
  if (at >= 0) root = process.argv[at + 1] ? resolve(process.argv[at + 1]) : "";
  let result;
  try { result = root ? checkPublicImports(root) : { checker: CHECKER, ok: false, errors: [issue("ROOT_ARGUMENT_MISSING")] }; }
  catch { result = { checker: CHECKER, ok: false, errors: [issue("CHECKER_FAILED")] }; }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}
