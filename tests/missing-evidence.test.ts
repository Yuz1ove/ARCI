import {it,expect} from 'vitest';
import {createSnapshot,createSource,evaluate,known} from '../src/index.js';
it('a rule without evidence references remains UNKNOWN, even with a known fact and unrelated source',()=>{
 const s=createSnapshot([createSource({sourceId:'s',documentId:'d',versionId:'1',contentType:'application/json',importedAt:'2026-01-01T00:00:00.000Z',content:{limit:5}})]);
 const r=evaluate({context:{},facts:{x:known(3)},selectedSources:['s'],parameters:{},requestedOperation:'EVALUATE'},s,[{id:'c',field:'x',operator:'LESS_OR_EQUAL',expected:known(5),source:[]}]);
 expect(r.status).toBe('UNKNOWN');expect(r.constraints[0]!.reason).toBe('EVIDENCE_REFERENCE_MISSING');
 expect(r.executionStatus).toBe('NOT_DISPATCHED');
});
