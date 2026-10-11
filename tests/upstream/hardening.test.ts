import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import { it, expect, afterEach,vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DecisionRepository, createSnapshot, createSource, evaluate, known, RevisionedFile } from '../compat/src/qa/core/index.js';
const dirs:string[]=[]; afterEach(()=>dirs.splice(0).forEach(d=>rmSync(d,{recursive:true,force:true})));
function file(){const d=mkdtempSync(join(tmpdir(),'arci-hardening-'));dirs.push(d);return join(d,'data.json');}
function result(){const s=createSnapshot([createSource({sourceId:'s',documentId:'d',versionId:'1',contentType:'application/json',importedAt:'2026-01-01T00:00:00.000Z',content:{limit:1}})]);return evaluate({context:{},facts:{x:known(2)},selectedSources:['s'],parameters:{},requestedOperation:'EVALUATE'},s,[{id:'c',field:'x',operator:'LESS_OR_EQUAL',expected:known(1),source:[{sourceId:'s',versionId:'1',path:'limit'}]}]);}
const scope={namespace:'n',domainId:'d',workspaceId:'w'};
it.each(['status','executionStatus','snapshotId','audit'] as const)('rejects forged %s before save without changing bytes',key=>{const p=file(),r=result(),repo=new DecisionRepository(p);repo.save(scope,r,0);const before=readFileSync(p,'utf8');const bad=structuredClone(result()) as unknown as Record<string,unknown>;bad[key]=key==='status'?'PASS':key==='executionStatus'?'DISPATCHED':key==='snapshotId'?'wrong':[{event:'FABRICATED'}];expect(()=>repo.save(scope,bad as never,1)).toThrow();expect(readFileSync(p,'utf8')).toBe(before);});
it('rejects forged restored result',()=>{const p=file(),repo=new DecisionRepository(p);repo.save(scope,result(),0);const raw=JSON.parse(readFileSync(p,'utf8'));raw.records[0].record.status='PASS';writeFileSync(p,JSON.stringify(raw));expect(()=>new DecisionRepository(p)).toThrow();});
it('bounds disk read before JSON parse',()=>{const p=file();writeFileSync(p,' '.repeat(33*1024*1024));expect(()=>new RevisionedFile(p,{revision:0},x=>x as {revision:number})).toThrow('STORE_SIZE_LIMIT');});

it('detects global audit corruption',()=>{const p=file(),repo=new DecisionRepository(p);repo.save(scope,result(),0);const raw=JSON.parse(readFileSync(p,'utf8'));raw.audit[0].snapshotId='fabricated';writeFileSync(p,JSON.stringify(raw));expect(()=>new DecisionRepository(p)).toThrow();});
it('archives before resetting bounded ledger and preserves archive bytes',()=>{const p=file(),repo=new DecisionRepository(p);repo.save(scope,result(),0);const archive=p+'.archive';repo.archiveAndClear(archive,1);expect(repo.view().records).toHaveLength(0);expect(repo.view().audit).toHaveLength(0);expect(JSON.parse(readFileSync(archive,'utf8')).records).toHaveLength(1);expect(new DecisionRepository(p).headroom().records).toBe(512);});

it('deep ledger is rejected before parsing and stale writer lock is preserved',()=>{const p=file();writeFileSync(p,'['.repeat(30)+'0'+']'.repeat(30));expect(()=>new RevisionedFile(p,{revision:0},x=>x as {revision:number})).toThrow('STORE_DEPTH_LIMIT');writeFileSync(p,JSON.stringify({revision:0}));const v=new RevisionedFile(p,{revision:0},x=>x as {revision:number});writeFileSync(p+'.writer.lock','owned');expect(()=>v.commit({revision:1},0)).toThrow('STORE_WRITER_LOCKED');expect(readFileSync(p+'.writer.lock','utf8')).toBe('owned');});

it('legacy verification is not upgraded by an unrelated save',()=>{const p=file(),a=new DecisionRepository(p);a.save(scope,result(),0);const old=JSON.parse(readFileSync(p,'utf8'));delete old.schemaVersion;delete old.stateHash;delete old.records[0].recordHash;delete old.records[0].verification;writeFileSync(p,JSON.stringify(old));const b=new DecisionRepository(p);expect(b.view().records[0]!.verification).toBe('LEGACY_UNVERIFIED');b.save(scope,result(),1);expect(new DecisionRepository(p).view().records[0]!.verification).toBe('LEGACY_UNVERIFIED');});
it('archive directory sync failure preserves the live ledger',()=>{const p=file(),repo=new DecisionRepository(p);repo.save(scope,result(),0);const before=readFileSync(p,'utf8'),sync=fs.fsyncSync;const spy=vi.spyOn(fs,'fsyncSync').mockImplementation(fd=>{if(fs.fstatSync(fd).isDirectory())throw new Error('ARCHIVE_SYNC_FAIL');sync(fd);});syncBuiltinESMExports();try{expect(()=>repo.archiveAndClear(p+'.archive',1)).toThrow();expect(readFileSync(p,'utf8')).toBe(before);expect(repo.view().records).toHaveLength(1);}finally{spy.mockRestore();syncBuiltinESMExports();}});

it('creates parent for a new ledger before taking the writer lock',()=>{const p=join(file()+'.dir','nested','data.json');const repo=new DecisionRepository(p);repo.save(scope,result(),0);expect(new DecisionRepository(p).view().revision).toBe(1);});
