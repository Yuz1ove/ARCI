import {it,expect} from 'vitest';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSource,createSnapshot,evaluate,known} from '../src/index.js';
import {DecisionRepository} from '../src/adapters/file-store.js';
it('a SAVED event older than EVALUATED is rejected before touching durable state',()=>{
 const dir=mkdtempSync(join(tmpdir(),'arci-clock-')),path=join(dir,'state.json');
 try {
  const snapshot=createSnapshot([createSource({sourceId:'s',documentId:'d',versionId:'1',contentType:'application/json',importedAt:'2026-01-01T00:00:00.000Z',content:{limit:5}})]);
  const input={context:{},facts:{x:known(3)},selectedSources:['s'],parameters:{},requestedOperation:'EVALUATE' as const};
  const rules=[{id:'c',field:'x',operator:'LESS_OR_EQUAL' as const,expected:known(5),source:[{sourceId:'s',versionId:'1',path:'limit'}]}];
  const repo=new DecisionRepository(path),scope={namespace:'n',domainId:'d',workspaceId:'w'};
  repo.save(scope,evaluate(input,snapshot,rules),0);const before=readFileSync(path,'utf8');
  const future=evaluate(input,snapshot,rules,{id:()=> 'future-decision',now:()=> '2099-01-01T00:00:00.000Z'});
  expect(()=>repo.save(scope,future,1)).toThrow('RESULT_AUDIT_INVALID');
  expect(readFileSync(path,'utf8')).toBe(before);expect(repo.view().revision).toBe(1);
  expect(new DecisionRepository(path).view().records).toHaveLength(1);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
