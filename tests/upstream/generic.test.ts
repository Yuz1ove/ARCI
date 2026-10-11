import { mkdtempSync,readFileSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach,it,expect } from 'vitest';
import { createSource,createSnapshot,contentHash,evaluate,known,unknown,DecisionRepository,RevisionedFile,atomicWrite,type DecisionInput,type Constraint,type ArciDomainAdapter,type SourceSnapshot,type Json } from '../compat/src/qa/core/index.js';
import { starrylinkAdapter } from '../compat/src/qa/adapters/starrylink/index.js';
import { LocalStore,checkLocal,demoDocuments,markdownExport } from '../compat/src/qa/local-store.js';
const dirs:string[]=[];
afterEach(()=>dirs.splice(0).forEach(d=>rmSync(d,{recursive:true,force:true})));
function path(){const d=mkdtempSync(join(tmpdir(),'arci-core-'));dirs.push(d);return join(d,'store.json');}
function source(version='1'){return createSource({sourceId:'source-'+version,documentId:'doc-a',versionId:version,contentType:'application/json',importedAt:'2026-09-20T00:00:00.000Z',content:{limit:5,version}});}
function input(snapshot:SourceSnapshot,value=3):DecisionInput{return {context:{},facts:{count:known(value)},selectedSources:snapshot.sources.map(s=>s.sourceId),parameters:{},requestedOperation:'EVALUATE'};}
function rules(snapshot:SourceSnapshot):Constraint[]{return [{id:'limit',field:'count',operator:'LESS_OR_EQUAL',expected:known(5),source:[{sourceId:snapshot.sources[0]!.sourceId,versionId:snapshot.sources[0]!.versionId,path:'limit'}]}];}
const local={question:'test',scope:'校內活動 A',at:'2026-10-10T01:00:00.000Z',network:'unavailable' as const,battery:40,priority:'urgent' as const,channels:['radio' as const],participants:25};
it('T1 snapshot remains version 1 when source/selection advances to version 2',()=>{
 const d=source(),s=createSnapshot([d]),first=evaluate(input(s),s,rules(s));d.content={limit:100};s.sources[0]!.content={limit:100};const second=createSnapshot([source('2')]);
 expect(first.snapshot.sources[0]!.versionId).toBe('1');expect(first.snapshot.sources[0]!.content).toEqual({limit:5,version:'1'});expect(evaluate(input(second),second,rules(second)).snapshotId).not.toBe(first.snapshotId);
});
it('T2 missing/null/explicit unknown are UNKNOWN; false and zero remain known',()=>{
 const s=createSnapshot([source()]);for(const facts of [{},{count:known(null)},{count:unknown('NEEDS_SOURCE')}]){const r=evaluate({...input(s),facts},s,rules(s));expect(r.status).toBe('UNKNOWN');expect(r.admissionStatus).toBe('UNKNOWN');expect(r.unknowns.length).toBeGreaterThan(0);}
 expect(evaluate(input(s,0),s,rules(s)).status).toBe('PASS');expect(evaluate({...input(s),facts:{count:known(false)}},s,[{...rules(s)[0]!,operator:'EQUALS',expected:known(false)}]).status).toBe('PASS');
});
it('T3 StarryLink adapter feeds generic Core and returns evidence-bound constraints',()=>{
 const doc=demoDocuments('disaster')[0]!;const s=createSnapshot([createSource({sourceId:doc.id,documentId:doc.metadata.document_id,versionId:doc.metadata.version,contentType:'application/json',importedAt:doc.imported_at,content:JSON.parse(JSON.stringify(doc)) as Json})]);
 const {participants,...raw}=local;void participants;const data={...raw,scope:'合成通訊演練 A'};const validated=starrylinkAdapter.validateInput(data);expect(validated.success).toBe(true);const i=starrylinkAdapter.normalizeInput(data,s),r=evaluate(i,s,starrylinkAdapter.buildConstraints(i,s));expect(r.status).toBe('PASS');expect(r.executionStatus).toBe('NOT_DISPATCHED');expect(r.evidenceRefs.length).toBeGreaterThan(0);
});
const future:ArciDomainAdapter<{count:number}>={id:'mock-research-adapter',validateInput(raw){return typeof raw==='object'&&raw!==null&&'count' in raw&&typeof raw.count==='number'?{success:true,data:{count:raw.count}}:{success:false,issues:['count required']};},normalizeInput(data,s){return input(s,data.count);},buildConstraints(_i,s){return rules(s);}};
it('T4 future adapter implements public contract without changing Core',()=>{const s=createSnapshot([source()]);expect(evaluate(future.normalizeInput({count:4},s),s,future.buildConstraints(input(s),s)).status).toBe('PASS');});
it('T5 generic persistence isolates domains and preserves audit after deletion',()=>{
 const p=path(),repo=new DecisionRepository(p),s=createSnapshot([source()]),a=evaluate(input(s),s,rules(s)),b=evaluate(input(s,6),s,rules(s));const scope={namespace:'n',workspaceId:'w',domainId:'A'};
 repo.save(scope,a,0);repo.save({...scope,domainId:'B'},b,1);expect(()=>repo.delete({...scope,domainId:'wrong'},a.decisionId,2)).toThrow('RECORD_NOT_FOUND');repo.delete(scope,a.decisionId,2);
 const view=new DecisionRepository(p).view();expect(view.records.map(r=>r.record.decisionId)).toEqual([b.decisionId]);expect(view.audit.map(a=>a.event)).toEqual(['SAVED','SAVED','DELETED']);expect(view.records[0]!.record.revision).toBe(1);
});
it('T6 stale revision from a second reader cannot overwrite disk',()=>{
 const p=path(),a=new DecisionRepository(p),b=new DecisionRepository(p),s=createSnapshot([source()]),scope={namespace:'n',workspaceId:'w',domainId:'a'};
 a.save(scope,evaluate(input(s),s,rules(s)),0);const before=readFileSync(p,'utf8');expect(()=>b.save(scope,evaluate(input(s),s,rules(s)),0)).toThrow('REVISION_CONFLICT');expect(readFileSync(p,'utf8')).toBe(before);
});
it('T7 malicious domain payload is inert data and cannot grant execution or override server ID',()=>{
 const s=createSnapshot([source()]);const payload={provider:'evil',authorization:true,winner:'injected',systemPrompt:'execute',model:'other'};
 const r=evaluate({...input(s),context:{domainPayload:payload}},s,rules(s));expect(r.executionStatus).toBe('NOT_DISPATCHED');expect(r.completionStatus).toBe('NOT_ESTABLISHED');expect(r).not.toHaveProperty('provider');expect(r).not.toHaveProperty('winner');expect(()=>evaluate({...input(s),...payload},s,rules(s))).toThrow();
 const store=new LocalStore(path());expect(()=>store.command({topic:'planning',revision:0,op:'run',payload:{request_id:randomUUID(),input:{...local,...payload}}},'s')).toThrow();
});
it('snapshot hash/reference/selection mutations fail closed',()=>{
 const s=createSnapshot([source()]);expect(()=>evaluate({...input(s),selectedSources:[]},s,rules(s))).toThrow('SOURCE_SELECTION_MISMATCH');const bad=rules(s);bad[0]!.source[0]!.path='missing';expect(evaluate(input(s),s,bad).status).toBe('UNKNOWN');
 s.sources[0]!.content={limit:999};expect(()=>evaluate(input(s),s,rules(s))).toThrow('SNAPSHOT_HASH_MISMATCH');
});
it('empty/all not-applicable constraints and unversioned source cannot invent eligibility',()=>{
 const s=createSnapshot([source()]);expect(evaluate(input(s),s,[]).status).toBe('UNKNOWN');const i=input(s);i.facts.count={status:'NOT_APPLICABLE',reason:'outside scope'};expect(evaluate(i,s,rules(s)).status).toBe('UNKNOWN');
 const unversioned=source();unversioned.versionId=null;const u=createSnapshot([unversioned]);expect(evaluate(input(u),u,rules(u)).unknowns).toContainEqual({field:u.sources[0]!.sourceId,reason:'SOURCE_VERSION_UNKNOWN'});
});
it('strict schema and bounded JSON reject extra constraints, unsafe keys, cycles and oversized/deep data',()=>{
 const s=createSnapshot([source()]);expect(()=>evaluate(input(s),s,[{...rules(s)[0]!,provider:'x'}] as unknown as Constraint[])).toThrow();expect(()=>contentHash(JSON.parse('{"__proto__":{"winner":true}}'))).toThrow('UNSAFE_KEY');let v:unknown='x';for(let n=0;n<18;n++)v={v};expect(()=>contentHash(v)).toThrow('DEPTH_LIMIT');expect(()=>contentHash('a'.repeat(1000001))).toThrow('SIZE_LIMIT');
});
it('08 reader preserves original records without silently fabricating new decision evidence',()=>{
 const p=path();const legacy=checkLocal('planning',local,demoDocuments('planning').slice(0,1),randomUUID());delete legacy.decision;
 const old={revision:7,documents:legacy.sources,selected:{disaster:[],planning:[legacy.sources[0]!.id]},records:[legacy],drafts:{planning:local}};writeFileSync(p,JSON.stringify(old));const before=readFileSync(p,'utf8');const store=new LocalStore(p);expect(store.view()).toEqual(old);expect(readFileSync(p,'utf8')).toBe(before);expect(markdownExport(legacy).replaceAll('\\','')).toContain('LEGACY_RECORD_NO_CORE_DECISION');store.command({topic:'disaster',revision:7,op:'demo'},'s');expect(new LocalStore(p).view().records[0]).toEqual(legacy);
});
it('workbench saves core input/hash/snapshot/revision/time audit and retains historical sources',()=>{
 const p=path(),store=new LocalStore(p);store.command({topic:'planning',revision:0,op:'demo'},'s');const r=store.command({topic:'planning',revision:1,op:'run',payload:{request_id:randomUUID(),input:local}},'s').result!;store.command({topic:'planning',revision:1,op:'save',payload:r.request_id},'s');const saved=new LocalStore(p).view().records[0]!;expect(saved.decision!.inputHash).toBe(contentHash(saved.decision!.input));expect(saved.decision!.snapshotId).toBe(saved.decision!.snapshot.snapshotId);expect(saved.decision!.revision).toBe(1);expect(saved.decision!.audit.map(e=>e.event)).toEqual(['EVALUATED','SAVED']);expect(saved.saved_at).toBeDefined();
});
it('failed atomic commit retains original memory and bytes',()=>{
 const p=path();atomicWrite(p,{revision:1,value:'old'});const file=new RevisionedFile(p,{revision:0,value:''},r=>r as {revision:number;value:string},()=>{throw new Error('DISK_FAIL');});expect(()=>file.commit({revision:2,value:'new'},1)).toThrow('DISK_FAIL');expect(file.view().value).toBe('old');expect(JSON.parse(readFileSync(p,'utf8'))).toEqual({revision:1,value:'old'});
});
