import {createSource, createSnapshot, evaluateVersioned, known} from '@arci/core';

const snapshot = createSnapshot([createSource({
  sourceId: 'synthetic-policy-v1', documentId: 'synthetic-policy', versionId: '1',
  contentType: 'application/json', importedAt: '2026-01-01T00:00:00.000Z',
  content: {limit: 5},
})]);
const result = evaluateVersioned({
  context: {}, facts: {count: known(3)}, selectedSources: ['synthetic-policy-v1'],
  parameters: {}, requestedOperation: 'EVALUATE',
}, snapshot, {
  id: 'count-limit', version: '1', constraints: [{
    id: 'maximum', field: 'count', operator: 'LESS_OR_EQUAL', expected: known(5),
    source: [{sourceId: 'synthetic-policy-v1', versionId: '1', path: 'limit'}],
  }],
});
console.log(JSON.stringify({
  status: result.decision.status,
  executionStatus: result.decision.executionStatus,
  completionStatus: result.decision.completionStatus,
  ruleVersion: result.ruleset.version,
}, null, 2));
