import {known, unknown} from '@arci/core';

/** @type {import('@arci/core').ArciDomainAdapter<{units: number | null}>} */
export const inventoryAdapter = {
  id: 'synthetic-inventory',
  validateInput(raw) {
    if (typeof raw !== 'object' || raw === null || !('units' in raw)
      || !(raw.units === null || (typeof raw.units === 'number' && Number.isFinite(raw.units) && raw.units >= 0))) {
      return {success: false, issues: ['units must be a nonnegative number or null']};
    }
    return {success: true, data: {units: raw.units}};
  },
  normalizeInput(input, snapshot) {
    return {context: {scenario: this.id}, facts: {units: input.units === null ? unknown('NOT_COUNTED') : known(input.units)},
      selectedSources: snapshot.sources.map(s => s.sourceId), parameters: {}, requestedOperation: 'EVALUATE'};
  },
  buildConstraints(_input, snapshot) {
    const source = snapshot.sources[0];
    const policy = source?.content;
    const minimum = policy !== null && typeof policy === 'object' && !Array.isArray(policy) ? policy.minimumUnits : undefined;
    return [{id: 'minimum-stock', field: 'units', operator: 'GREATER_OR_EQUAL',
      expected: typeof minimum === 'number' && Number.isFinite(minimum) ? known(minimum) : unknown('POLICY_MISSING'),
      source: source ? [{sourceId: source.sourceId, versionId: source.versionId, path: 'minimumUnits'}] : []}];
  },
};
