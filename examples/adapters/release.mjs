import {known, unknown} from '@arci/core';

/** @type {import('@arci/core').ArciDomainAdapter<{failures: number | null; reviewed: boolean | null}>} */
export const releaseAdapter = {
  id: 'synthetic-software-release',
  validateInput(raw) {
    if (typeof raw !== 'object' || raw === null || !('failures' in raw) || !('reviewed' in raw)
      || !(raw.failures === null || (typeof raw.failures === 'number' && Number.isInteger(raw.failures) && raw.failures >= 0))
      || !(raw.reviewed === null || typeof raw.reviewed === 'boolean')) {
      return {success: false, issues: ['failures must be a nonnegative integer or null; reviewed must be boolean or null']};
    }
    return {success: true, data: {failures: raw.failures, reviewed: raw.reviewed}};
  },
  normalizeInput(input, snapshot) {
    return {context: {scenario: this.id}, facts: {failures: input.failures === null ? unknown('TEST_REPORT_MISSING') : known(input.failures),
      reviewed: input.reviewed === null ? unknown('REVIEW_MISSING') : known(input.reviewed)},
      selectedSources: snapshot.sources.map(s => s.sourceId), parameters: {}, requestedOperation: 'EVALUATE'};
  },
  buildConstraints(_input, snapshot) {
    const source = snapshot.sources[0];
    const policy = source?.content;
    const values = policy !== null && typeof policy === 'object' && !Array.isArray(policy) ? policy : {};
    return [
      {id: 'test-failures', field: 'failures', operator: 'LESS_OR_EQUAL',
        expected: typeof values.maxFailures === 'number' ? known(values.maxFailures) : unknown('POLICY_MISSING'),
        source: source ? [{sourceId: source.sourceId, versionId: source.versionId, path: 'maxFailures'}] : []},
      {id: 'review-condition', field: 'reviewed', operator: 'EQUALS',
        expected: typeof values.requiredReview === 'boolean' ? known(values.requiredReview) : unknown('POLICY_MISSING'),
        source: source ? [{sourceId: source.sourceId, versionId: source.versionId, path: 'requiredReview'}] : []},
    ];
  },
};
