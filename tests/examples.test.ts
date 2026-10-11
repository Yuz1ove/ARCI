import {it,expect} from 'vitest';
import {inventoryAdapter} from '../examples/adapters/inventory.mjs';
import {releaseAdapter} from '../examples/adapters/release.mjs';
import {runAdapter} from '../examples/run-adapter.mjs';
it('both domains share the engine and cover PASS, FAIL, UNKNOWN with offline replay',()=>{
 const inventory=[12,4,null].map(units=>runAdapter(inventoryAdapter,{units},{minimumUnits:10}));
 const release=[{failures:0,reviewed:true},{failures:2,reviewed:true},{failures:0,reviewed:null}].map(input=>runAdapter(releaseAdapter,input,{maxFailures:0,requiredReview:true}));
 for(const results of [inventory,release]){
  expect(results.map(r=>r.decision.status)).toEqual(['PASS','FAIL','UNKNOWN']);
  expect(results.every(r=>r.decision.executionStatus==='NOT_DISPATCHED'&&r.decision.completionStatus==='NOT_ESTABLISHED')).toBe(true);
 }
 expect(new Set([...inventory,...release].map(r=>r.engineVersion)).size).toBe(1);
});
it('bad input is rejected by adapters; absent policy remains unknown',()=>{
 expect(()=>runAdapter(inventoryAdapter,{units:-1},{minimumUnits:10})).toThrow();
 expect(()=>runAdapter(releaseAdapter,{failures:'0',reviewed:true},{})).toThrow();
 expect(runAdapter(inventoryAdapter,{units:10},{}).decision.status).toBe('UNKNOWN');
 expect(runAdapter(releaseAdapter,{failures:0,reviewed:false},{}).decision.status).toBe('UNKNOWN');
});
