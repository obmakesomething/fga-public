import { isDeepStrictEqual } from "node:util";
import { readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const CHECKER = "public-examples";
const issue = (code, path = "") => ({ code, path });

function run(root) {
  const env = { PATH: process.env.PATH || "", NODE_OPTIONS: "", NODE_PATH: "", HOME: join(root, ".checker-empty-home") };
  const child = spawnSync(process.execPath, [join(root, "examples/run.mjs")], {
    cwd: root, env, encoding: "utf8", timeout: 15000, maxBuffer: 8 * 1024 * 1024,
  });
  if (child.error || child.status !== 0) return { error: "RUNNER_FAILED" };
  try { return { value: JSON.parse(child.stdout) }; }
  catch { return { error: "RUNNER_OUTPUT_INVALID" }; }
}

function summarize(output) {
  const { E1, E2, E3, E4, E5 } = output.examples;
  return {
    E1: {
      observedEligible: E1.outputs.observedEligible,
      modelEligible: E1.outputs.modelEligible,
      unimplementedEligible: E1.outputs.unimplementedEligible,
      spoofedTriggerEligible: E1.outputs.spoofedTriggerEligible,
    },
    E2: Object.fromEntries(Object.entries(E2.outputs).map(([name, value]) => [name, value.verdict])),
    E3: {
      targetMismatch: E3.outputs.targetMismatch.reasonCode,
      environmentMismatch: E3.outputs.environmentMismatch.reasonCode,
      missingReceipt: E3.outputs.missingReceipt.identityStatus,
    },
    E4: {
      candidateGroundingClass: E4.outputs.selfDeclaredFinding.candidateGroundingClass,
      hardEligible: E4.outputs.selfDeclaredFinding.hardEligible,
      missingReceiptHardEligible: E4.outputs.missingFindingReceipt.hardEligible,
    },
    E5: Object.fromEntries(Object.entries(E5.outputs).map(([name, value]) => [name, {
      decision: value.decision, activationStatus: value.activationStatus,
      canClaimVerifiedFixed: value.canClaimVerifiedFixed,
    }])),
  };
}

export function checkPublicExamples(root = resolve(import.meta.dirname, "..")) {
  const base = realpathSync(resolve(root));
  const errors = [];
  let expected;
  try { expected = JSON.parse(readFileSync(join(base, "examples/expected-output.json"), "utf8")); }
  catch { errors.push(issue("EXPECTED_OUTPUT_UNREADABLE", "examples/expected-output.json")); }
  let summary;
  try { summary = JSON.parse(readFileSync(join(base, "examples/summary.json"), "utf8")); }
  catch { errors.push(issue("SUMMARY_UNREADABLE", "examples/summary.json")); }
  const first = run(base);
  const second = run(base);
  if (first.error) errors.push(issue(first.error, "examples/run.mjs"));
  if (second.error) errors.push(issue(second.error, "examples/run.mjs"));
  const output = first.value;
  if (output && second.value && !isDeepStrictEqual(output, second.value)) errors.push(issue("NONDETERMINISTIC_OUTPUT", "examples/run.mjs"));
  if (output && expected && !isDeepStrictEqual(output, expected)) errors.push(issue("EXPECTED_OUTPUT_STALE", "examples/expected-output.json"));
  if (output && summary && ["E1", "E2", "E3", "E4", "E5"].every((id) => output.examples?.[id]?.outputs) && !isDeepStrictEqual(summarize(output), summary)) errors.push(issue("SUMMARY_STALE", "examples/summary.json"));
  if (output) {
    const ex = output.examples || {};
    if (output.schema !== "fga-research-examples-v1" || output.datasetKind !== "SYNTHETIC" || !["E1", "E2", "E3", "E4", "E5"].every((id) => ex[id])) errors.push(issue("EXAMPLE_SET_INVALID", "examples/run.mjs"));
    const e1 = ex.E1?.outputs;
    if (!(e1 && e1.observedEligible === true && e1.modelEligible === false && e1.unimplementedEligible === false && e1.spoofedTriggerEligible === false && e1.decoratedTrigger?.status === "MODEL_PROPOSED")) errors.push(issue("E1_PROVENANCE_CONTRAST", "examples/run.mjs"));
    const e2 = ex.E2?.outputs;
    if (!(e2 && e2.missingTransition?.verdict === "NOT_EVALUATED" && e2.passingTransition?.verdict === "PASS" && e2.failingTransition?.verdict === "FAIL" && e2.proposedTransition?.verdict === "NOT_EVALUATED" && e2.missingDelta?.verdict === "NOT_EVALUATED")) errors.push(issue("E2_TRANSITION_CONTRAST", "examples/run.mjs"));
    const e3 = ex.E3?.outputs;
    if (!(e3 && e3.targetMismatch?.verdict === "NOT_EVALUATED" && e3.environmentMismatch?.verdict === "NOT_EVALUATED" && e3.missingReceipt?.identityStatus === "NOT_EVALUATED")) errors.push(issue("E3_IDENTITY_CONTRAST", "examples/run.mjs"));
    const e4 = ex.E4?.outputs;
    if (!(e4 && e4.selfDeclaredFinding?.hardEligible === false && e4.missingFindingReceipt?.hardEligible === false && e4.unresolvedContract?.verdict === "UNKNOWN")) errors.push(issue("E4_AUTHORITY_CONTRAST", "examples/run.mjs"));
    const e5 = ex.E5?.outputs;
    if (!(e5 && e5.completeDelivery?.decision === "BLOCK" && e5.completeDelivery?.activationStatus === "NOT_ACTIVATED" && e5.unknownIssuer?.decision === "NOT_EVALUATED" && e5.scopeDrift?.decision === "REVIEW" && e5.elevatedPolicy?.decision === "NOT_EVALUATED")) errors.push(issue("E5_DELIVERY_CONTRAST", "examples/run.mjs"));
    for (const [id, value] of Object.entries(ex)) {
      if (typeof value?.interpretation !== "string" || typeof value?.limit !== "string" || !value.inputs || !value.outputs) errors.push(issue("EXAMPLE_DOCUMENTATION_INCOMPLETE", `examples:${id}`));
    }
  }
  return { checker: CHECKER, ok: errors.length === 0, runs: 2, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const at = process.argv.indexOf("--root");
  const root = at < 0 ? resolve(import.meta.dirname, "..") : process.argv[at + 1] ? resolve(process.argv[at + 1]) : "";
  let result;
  try { result = root ? checkPublicExamples(root) : { checker: CHECKER, ok: false, errors: [issue("ROOT_ARGUMENT_MISSING")] }; }
  catch { result = { checker: CHECKER, ok: false, errors: [issue("CHECKER_FAILED")] }; }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}
