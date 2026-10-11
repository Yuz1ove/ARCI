import {inventoryAdapter} from './adapters/inventory.mjs';
import {runAdapter, summarize} from './run-adapter.mjs';
console.log(JSON.stringify([12, 4, null].map(units => ({
  units, ...summarize(runAdapter(inventoryAdapter, {units}, {minimumUnits: 10})),
})), null, 2));
