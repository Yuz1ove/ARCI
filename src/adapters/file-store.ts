import { sha256Text } from '../core/hash.js';
import { fstatSync,readSync,writeFileSync,renameSync,openSync,fsyncSync,closeSync,existsSync,unlinkSync,mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { contentHash,canonical } from '../core/evidence.js';
import { z } from 'zod';
import { idSchema,auditEventSchema,DECISION_SCHEMA_VERSION,type DecisionResult,type AuditEvent } from '../core/contracts.js';
import { validateDecision } from '../core/integrity.js';
export const STORE_LIMITS=Object.freeze({bytes:32*1024*1024,records:512,audit:4096});
function readJson(path:string):unknown {
 const fd=openSync(path,'r');try{const size=fstatSync(fd).size;if(size>STORE_LIMITS.bytes)throw new Error('STORE_SIZE_LIMIT');const bytes=Buffer.alloc(size+1);let n=0;while(n<bytes.length){const got=readSync(fd,bytes,n,bytes.length-n,null);if(got===0)break;n+=got;}if(n>STORE_LIMITS.bytes||n>size)throw new Error('STORE_SIZE_LIMIT');const text=bytes.subarray(0,n).toString('utf8');let depth=0,quoted=false,escaped=false;for(const c of text){if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='\"')quoted=false;}else if(c==='\"')quoted=true;else if(c==='{'||c==='['){if(++depth>24)throw new Error('STORE_DEPTH_LIMIT');}else if(c==='}'||c===']')depth--;}return JSON.parse(text) as unknown;}finally{closeSync(fd);}
}
export function atomicWrite(path:string,state:unknown):void {
 const data=JSON.stringify(state);if(Buffer.byteLength(data)>STORE_LIMITS.bytes)throw new Error('STORE_SIZE_LIMIT');
 mkdirSync(dirname(path),{recursive:true,mode:0o700});const temp=path+'.'+randomUUID()+'.tmp';
 try {writeFileSync(temp,data,{flag:'wx',mode:0o600});const fd=openSync(temp,'r');try{fsyncSync(fd);}finally{closeSync(fd);}renameSync(temp,path);const parent=openSync(dirname(path),'r');try{fsyncSync(parent);}catch{throw new Error('DURABILITY_UNCONFIRMED');}finally{closeSync(parent);}}finally{if(existsSync(temp))unlinkSync(temp);}
}
/** Archive filename must be durable before its source ledger can be cleared. */
export function writeArchive(path:string,state:unknown):void {
 const data=JSON.stringify(state);if(Buffer.byteLength(data)>STORE_LIMITS.bytes)throw new Error('STORE_SIZE_LIMIT');
 const fd=openSync(path,'wx',0o600);try{writeFileSync(fd,data);fsyncSync(fd);}finally{closeSync(fd);}
 const parent=openSync(dirname(path),'r');try{fsyncSync(parent);}finally{closeSync(parent);}
}
export class RevisionedFile<T extends {revision:number}> {
 private state:T;
 constructor(private path:string,initial:T,private read:(raw:unknown)=>T,private persist:(path:string,state:T)=>void=atomicWrite) {
  this.state=existsSync(path)?read(readJson(path)):structuredClone(initial);
 }
 view():T{return structuredClone(this.state);}
 commit(next:T,expected:number):void {
  mkdirSync(dirname(this.path),{recursive:true,mode:0o700});
  const lock=this.path+'.writer.lock';let lockFd:number;
  try{lockFd=openSync(lock,'wx',0o600);}catch{throw new Error('STORE_WRITER_LOCKED');}
  try{
   const disk=existsSync(this.path)?this.read(readJson(this.path)):this.state;
   if(expected!==this.state.revision||expected!==disk.revision||next.revision!==expected+1)throw new Error('REVISION_CONFLICT');
   try{this.persist(this.path,next);}catch(error){if(error instanceof Error&&error.message==='DURABILITY_UNCONFIRMED')this.state=this.read(readJson(this.path));throw error;}
   this.state=structuredClone(next);
  }finally{closeSync(lockFd);unlinkSync(lock);}

 }
}
export interface DecisionRecord {namespace:string;domainId:string;workspaceId:string;record:DecisionResult;savedAt:string;recordHash?:string;verification?:'VERIFIED'|'LEGACY_UNVERIFIED'}
interface State {stateHash?:string;archiveAnchor?:string;schemaVersion?:string;revision:number;records:DecisionRecord[];audit:AuditEvent[]}
export class DecisionRepository {
 private file:RevisionedFile<State>;
 constructor(path:string) {this.file=new RevisionedFile(path,{revision:0,records:[],audit:[]},raw=>{
  const stored=z.object({schemaVersion:z.literal(DECISION_SCHEMA_VERSION).optional(),stateHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),archiveAnchor:z.string().regex(/^[a-f0-9]{64}$/).optional(),revision:z.number().int().nonnegative(),records:z.array(z.object({namespace:idSchema,domainId:idSchema,workspaceId:idSchema,record:z.unknown(),savedAt:z.string().datetime(),recordHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),verification:z.enum(['VERIFIED','LEGACY_UNVERIFIED']).optional()}).strict()).max(STORE_LIMITS.records),audit:z.array(auditEventSchema).max(STORE_LIMITS.audit)}).strict().parse(raw);
  const s=stored as State;
  if(s.stateHash&&s.stateHash!==stateHash(s))throw new Error('STORE_HASH_MISMATCH');
  if(s.schemaVersion&&(!s.stateHash||s.records.some(r=>!r.recordHash)))throw new Error('STORE_HASH_MISSING');
  if(new Set(s.records.map(r=>r.record.decisionId)).size!==s.records.length)throw new Error('STORE_INVALID');
  for(const r of s.records){validateDecision(r.record);if(r.record.revision!==1)throw new Error('STORE_INVALID');if(r.recordHash!==undefined&&contentHash(r.record)!==r.recordHash)throw new Error('RECORD_HASH_MISMATCH');if(s.schemaVersion&&r.recordHash===undefined)throw new Error('RECORD_HASH_MISSING');r.verification=r.recordHash?(r.verification??'VERIFIED'):'LEGACY_UNVERIFIED';}
  return s;
 });}
 view():State{return this.file.view();}
 save(scope:Pick<DecisionRecord,'namespace'|'domainId'|'workspaceId'>,record:DecisionResult,expected:number):void {
  validateDecision(record);if(record.revision!==0)throw new Error('IMMUTABLE_DECISION');for(const v of Object.values(scope))idSchema.parse(v);
  const s=this.view(),copy=structuredClone(record),at=new Date().toISOString();
  if(s.records.some(r=>r.record.decisionId===record.decisionId))throw new Error('IMMUTABLE_DECISION');
  copy.revision=1;const event:AuditEvent={event:'SAVED',decisionId:copy.decisionId,revision:1,at,inputHash:copy.inputHash,snapshotId:copy.snapshotId};copy.audit.push(event);validateDecision(copy);
  s.records.push({...scope,record:copy,savedAt:at,recordHash:contentHash(copy),verification:'VERIFIED'});s.audit.push(event);s.revision++;this.seal(s);this.validateBudget(s);this.file.commit(s,expected);
 }
 headroom():{records:number;audit:number}{const s=this.view();return {records:STORE_LIMITS.records-s.records.length,audit:STORE_LIMITS.audit-s.audit.length};}
 private seal(s:State):void{s.schemaVersion=DECISION_SCHEMA_VERSION;for(const r of s.records){r.recordHash=contentHash(r.record);r.verification??='LEGACY_UNVERIFIED';}s.stateHash=stateHash(s);}
 archiveAndClear(archivePath:string,expected:number):void {
  if(expected!==this.view().revision)throw new Error('REVISION_CONFLICT');
  const current=this.view();const data=JSON.stringify(current);if(Buffer.byteLength(data)>STORE_LIMITS.bytes)throw new Error('STORE_SIZE_LIMIT');
  writeArchive(archivePath,current);
  const next:State={revision:expected+1,records:[],audit:[],archiveAnchor:sha256Text(data)};this.seal(next);this.file.commit(next,expected);
 }
 private validateBudget(s:State):void{if(s.records.length>STORE_LIMITS.records||s.audit.length>STORE_LIMITS.audit)throw new Error('STORE_COUNT_LIMIT');}
 delete(scope:Pick<DecisionRecord,'namespace'|'domainId'|'workspaceId'>,id:string,expected:number):void {
  const s=this.view(),r=s.records.find(r=>r.record.decisionId===id&&r.namespace===scope.namespace&&r.domainId===scope.domainId&&r.workspaceId===scope.workspaceId);
  if(!r)throw new Error('RECORD_NOT_FOUND');s.records=s.records.filter(x=>x!==r);s.revision++;
  s.audit.push({event:'DELETED',decisionId:id,revision:r.record.revision+1,at:new Date().toISOString(),inputHash:r.record.inputHash,snapshotId:r.record.snapshotId});this.seal(s);this.validateBudget(s);this.file.commit(s,expected);
 }
}

function stateHash(s:State):string{const {stateHash:_digest,...data}=s;return sha256Text(canonical(JSON.parse(JSON.stringify(data))));}
