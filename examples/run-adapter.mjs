import {createSource, createSnapshot, evaluateVersioned, replayEvaluation} from '@arci/core';

/** @template T
 * @param {import('@arci/core').ArciDomainAdapter<T>} adapter
 * @param {unknown} raw
 * @param {import('@arci/core').Json} policy
 */
export function runAdapter(adapter, raw, policy) {
  const checked = adapter.validateInput(raw);
  if (!checked.success) throw new Error(checked.issues.join('; '));
  const snapshot = createSnapshot([createSource({
    sourceId: `${adapter.id}-policy-v1`, documentId: `${adapter.id}-policy`, versionId: '1',
    importedAt: '2026-01-01T00:00:00.000Z', contentType: 'application/json', content: policy,
  })]);
  const input = adapter.normalizeInput(checked.data, snapshot);
  const result = evaluateVersioned(input, snapshot, {
    id: `${adapter.id}-rules`, version: '1', constraints: adapter.buildConstraints(input, snapshot),
  });
  const replay = replayEvaluation(JSON.parse(JSON.stringify(result)));
  if (JSON.stringify(replay) !== JSON.stringify(result.decision)) throw new Error('REPLAY_MISMATCH');
  return result;
}
/** @param {import('@arci/core').Evaluation} result */
export function summarize(result) {
  return {status: result.decision.status, admissionStatus: result.decision.admissionStatus,
    executionStatus: result.decision.executionStatus, completionStatus: result.decision.completionStatus,
    engineVersion: result.engineVersion, ruleset: `${result.ruleset.id}@${result.ruleset.version}`,
    constraints: result.decision.constraints.map(({id,status,reason}) => ({id,status,reason}))};
}
