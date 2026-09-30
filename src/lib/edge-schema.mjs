// Edge taxonomy: what every relation is made of, and what it is allowed to
// prove.
//
// The relations were spread across three layers with incompatible provenance —
// some read straight off the DOM, some inferred from role heuristics, one a
// pure guess — yet all of them looked alike to anything consuming them. A claim
// can never be stronger than its weakest edge, so the strength has to be
// attached to the edge itself and enforced, not left to the reader.
export const EDGE_STATUS = {
  OBSERVED: "OBSERVED",                          // read directly from the capture
  DERIVED_DETERMINISTIC: "DERIVED_DETERMINISTIC", // computed from observed data, reproducible
  DERIVED_HEURISTIC: "DERIVED_HEURISTIC",        // inferred via role/lexicon heuristics
  MODEL_PROPOSED: "MODEL_PROPOSED",              // proposed, never observed — cannot be evidence
  UNIMPLEMENTED: "UNIMPLEMENTED",
};

const S = EDGE_STATUS;

// category: structural | semantic | behavioral
// languageDependency: none | locale_pack | model
export const EDGE_TAXONOMY = {
  // --- structural: DOM and geometry, language independent -------------------
  contains: { category: "structural", status: S.OBSERVED, source: ["dom"], languageDependency: "none" },
  appearsInViewport: { category: "structural", status: S.OBSERVED, source: ["dom", "geometry"], languageDependency: "none" },
  near: { category: "structural", status: S.DERIVED_DETERMINISTIC, source: ["geometry"], languageDependency: "none" },
  above: { category: "structural", status: S.DERIVED_DETERMINISTIC, source: ["geometry"], languageDependency: "none" },
  shouldPrecede: { category: "structural", status: S.DERIVED_DETERMINISTIC, source: ["geometry"], languageDependency: "none" },

  // --- semantic: role/lexicon inference, language dependent -----------------
  belongsTo: { category: "semantic", status: S.DERIVED_HEURISTIC, source: ["role-inference"], languageDependency: "locale_pack" },
  answersQuestion: { category: "semantic", status: S.DERIVED_HEURISTIC, source: ["role-inference", "lexicon"], languageDependency: "locale_pack" },
  resolvesQuestion: { category: "semantic", status: S.DERIVED_HEURISTIC, source: ["role-inference"], languageDependency: "locale_pack" },
  shouldFollow: { category: "semantic", status: S.DERIVED_HEURISTIC, source: ["role-inference"], languageDependency: "locale_pack" },
  reducesRisk: { category: "semantic", status: S.DERIVED_HEURISTIC, source: ["role-inference"], languageDependency: "locale_pack" },
  buildsTrust: { category: "semantic", status: S.DERIVED_HEURISTIC, source: ["role-inference"], languageDependency: "locale_pack" },
  failsToResolveQuestion: { category: "semantic", status: S.DERIVED_HEURISTIC, source: ["role-inference"], languageDependency: "locale_pack" },
  mapsToUXFlowStep: { category: "semantic", status: S.DERIVED_HEURISTIC, source: ["role-inference"], languageDependency: "locale_pack" },
  preparesNextAction: { category: "semantic", status: S.DERIVED_HEURISTIC, source: ["role-inference"], languageDependency: "locale_pack" },
  createsCommitment: { category: "semantic", status: S.DERIVED_HEURISTIC, source: ["role-inference"], languageDependency: "locale_pack" },
  mapsToServiceBlueprintStep: { category: "semantic", status: S.DERIVED_HEURISTIC, source: ["role-inference"], languageDependency: "locale_pack" },
  explainsServiceStage: { category: "semantic", status: S.DERIVED_HEURISTIC, source: ["role-inference"], languageDependency: "locale_pack" },

  // --- behavioral ----------------------------------------------------------
  // Perceptual scores, not observed behaviour; thresholds are uncalibrated.
  visuallyStrongerThan: { category: "behavioral", status: S.DERIVED_HEURISTIC, source: ["attention-score"], languageDependency: "none", limitations: ["thresholds uncalibrated"] },
  competesForAttention: { category: "behavioral", status: S.DERIVED_HEURISTIC, source: ["attention-score"], languageDependency: "none", limitations: ["thresholds uncalibrated"] },
  // Emitted for every interactive node without ever performing the action, so
  // it asserts nothing about what actually happens. Not evidence until the
  // interaction layer observes real transitions.
  triggersState: {
    category: "behavioral",
    status: S.MODEL_PROPOSED,
    source: [],
    languageDependency: "none",
    limitations: ["no interaction executed", "no observed transition"],
  },
};

export const EXTRACTOR_VERSION = "1.0.0";

const UNKNOWN_EDGE = {
  category: "semantic",
  status: S.DERIVED_HEURISTIC,
  source: ["unspecified"],
  languageDependency: "locale_pack",
  limitations: ["edge type not registered in EDGE_TAXONOMY"],
};

export function describeEdge(type) {
  const entry = EDGE_TAXONOMY[type] || UNKNOWN_EDGE;
  return {
    category: entry.category,
    status: entry.status,
    source: entry.source || [],
    determinism: entry.status === S.DERIVED_HEURISTIC || entry.status === S.MODEL_PROPOSED ? "heuristic" : "deterministic",
    languageDependency: entry.languageDependency,
    extractorVersion: EXTRACTOR_VERSION,
    limitations: entry.limitations || [],
  };
}

// Stamp an edge with its provenance so consumers can tell what it can prove.
export function decorateEdge(edge = {}) {
  const meta = describeEdge(edge.type);
  // Preserve explicitly restrictive provenance through the decoration path.
  if (edge.status === S.MODEL_PROPOSED || edge.status === S.UNIMPLEMENTED) {
    meta.status = edge.status;
    meta.source = Array.isArray(edge.source) ? edge.source : [];
    meta.determinism = "heuristic";
  }
  return {
    ...edge,
    ...meta,
    confidence: typeof edge.weight === "number" ? edge.weight : 1,
  };
}

// MODEL_PROPOSED and UNIMPLEMENTED edges assert nothing that was measured, so
// they must never be required evidence for a verdict.
export function isVerdictEvidenceEligible(edge = {}) {
  // Research extraction correction: a caller cannot upgrade a known
  // model-only relation by overwriting its declared status.
  if (!edge || typeof edge !== "object" || Array.isArray(edge)) return false;
  const taxonomyStatus = describeEdge(edge.type).status;
  if (taxonomyStatus === S.MODEL_PROPOSED || taxonomyStatus === S.UNIMPLEMENTED) return false;
  const status = edge.status || describeEdge(edge.type).status;
  return [S.OBSERVED, S.DERIVED_DETERMINISTIC, S.DERIVED_HEURISTIC].includes(status);
}

export function isDeterministicEdge(edge = {}) {
  if (!isVerdictEvidenceEligible(edge)) return false;
  const taxonomyStatus = describeEdge(edge.type).status;
  if (taxonomyStatus !== S.OBSERVED && taxonomyStatus !== S.DERIVED_DETERMINISTIC) return false;
  const status = edge.status || describeEdge(edge.type).status;
  return status === S.OBSERVED || status === S.DERIVED_DETERMINISTIC;
}

export function verdictEvidenceEdges(edges = []) {
  return edges.filter((edge) => isVerdictEvidenceEligible(edge));
}

// A finding derived only from heuristics cannot hard-fail a build. Callers pass
// the pack's opt-in; without it a heuristic FAIL is demoted to REVIEW and the
// demotion is recorded on the finding.
const HEURISTIC_EVIDENCE = /_HEURISTIC$/;

export function isHeuristicFinding(finding = {}) {
  return HEURISTIC_EVIDENCE.test(String(finding.evidenceClass || ""))
    || HEURISTIC_EVIDENCE.test(String(finding.graphEvidenceClass || ""));
}

export function applyHeuristicEvidencePolicy(findingList = [], auditConfig = {}) {
  const allowHeuristicFail = auditConfig.evidencePolicy?.allowHeuristicFail === true;
  if (allowHeuristicFail) return findingList;
  for (const finding of findingList) {
    if (finding.verdict !== "FAIL" || !isHeuristicFinding(finding)) continue;
    finding.verdict = "REVIEW";
    finding.gateDemotion = {
      from: "FAIL",
      policy: "heuristic-evidence-review-lane",
      reason: "Finding rests on heuristic-derived evidence only; a heuristic edge cannot hard-fail on its own.",
    };
  }
  return findingList;
}
