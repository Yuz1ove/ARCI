import {it,expect,vi} from 'vitest';
import {createSnapshot,createSource,known,evaluateVersioned,replayEvaluation,validateDecision} from '../src/index.js';
const timestamp='2026-01-01T00:00:00.000Z';
function source(i:number){return createSource({sourceId:`s-${i}`,documentId:`d-${i}`,versionId:'1',contentType:'application/json',importedAt:timestamp,content:{limit:5}});}
it('createSnapshot rejects too many sources at the public boundary',()=>{
 const valid=Array.from({length:24},(_,i)=>source(i));
 expect(createSnapshot(valid).sources).toHaveLength(24);
 expect(()=>createSnapshot([...valid,source(24)])).toThrow();
});
it('validation and replay need no ambient ID or clock when history is complete',()=>{
 const snapshot=createSnapshot([source(1)],{id:()=> 'snapshot',now:()=> timestamp});
 const result=evaluateVersioned({context:{},facts:{x:known(3)},selectedSources:['s-1'],parameters:{},requestedOperation:'EVALUATE'},snapshot,{id:'r',version:'1',constraints:[{id:'c',field:'x',operator:'LESS_OR_EQUAL',expected:known(5),source:[{sourceId:'s-1',versionId:'1',path:'limit'}]}]},{id:()=> 'decision',now:()=> timestamp});
 vi.stubGlobal('crypto',undefined);
 const clock=vi.spyOn(Date.prototype,'toISOString').mockImplementation(()=>{throw new Error('AMBIENT_CLOCK_USED');});
 try {expect(validateDecision(result.decision)).toEqual(result.decision);expect(replayEvaluation(result)).toEqual(result.decision);}
 finally {clock.mockRestore();vi.unstubAllGlobals();}
});
