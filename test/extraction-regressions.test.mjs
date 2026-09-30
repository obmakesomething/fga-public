import test from 'node:test';
import assert from 'node:assert/strict';
import { isDeterministicEdge, applyHeuristicEvidencePolicy } from 'fga-research-extract';

test('a known heuristic relation cannot be upgraded to deterministic by supplied status',()=>{
  assert.equal(isDeterministicEdge({type:'answersQuestion',status:'OBSERVED'}),false);
  assert.equal(isDeterministicEdge({type:'contains',status:'OBSERVED'}),true);
  assert.equal(isDeterministicEdge({type:'near',status:'DERIVED_DETERMINISTIC'}),true);
});

test('heuristic FAIL opt-in preserves a local verdict without granting delivery authority',()=>{
  const finding={verdict:'FAIL',evidenceClass:'GRAPH_HEURISTIC'};
  const defaultResult=applyHeuristicEvidencePolicy([structuredClone(finding)]);
  const optInResult=applyHeuristicEvidencePolicy([structuredClone(finding)],{evidencePolicy:{allowHeuristicFail:true}});
  assert.equal(defaultResult[0].verdict,'REVIEW');
  assert.equal(optInResult[0].verdict,'FAIL');
  assert.equal(Object.hasOwn(optInResult[0],'blockDecision'),false);
});
