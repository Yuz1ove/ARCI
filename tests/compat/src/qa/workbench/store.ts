import { validateDecision } from '../core/integrity.js';
import { STORE_LIMITS,writeArchive } from '../core/persistence.js';
import { createSnapshot,createSource,contentHash } from '../core/evidence.js';
import { evaluate } from '../core/engine.js';
import { atomicWrite,RevisionedFile } from '../core/persistence.js';
import { auditEventSchema } from '../core/contracts.js';
import type { Json } from '../core/contracts.js';
import { starrylinkAdapter } from '../adapters/starrylink/index.js';
import { starrylinkDocuments } from './scenarios/starrylink-disaster/index.js';
import { eventPlanningAdapter } from './scenarios/event-planning/index.js';
import { eventDocuments } from './scenarios/event-planning/fixtures.js';
export { atomicWrite } from '../core/persistence.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { LIMITS, topicSchema, metadataSchema, scenarioSchema, inputSchema, type Topic, type LocalState, type LocalInput, type DocumentVersion, type LocalResult } from './contracts.js';
export class LocalError extends Error { constructor(public code:string) { super(code); } }
export function ensureSafeText(text:string):void {
 if (text.includes(String.fromCharCode(0)) || /\ufffd|(?:api[_ -]?key|session[_ -]?token|authorization|password)\s*[:=]\s*\S+|Bearer\s+\S+|\bsk-[A-Za-z0-9_-]{12,}|(?:\/Users\/|\/home\/|[A-Z]:\\Users\\)/i.test(text)) throw new LocalError('PRIVATE_OR_INVALID_TEXT');
}
export function parseBoundedJson(text:string):unknown {
 let depth=0, quoted=false, escape=false;
 for(const c of text) { if(quoted) { if(escape) escape=false; else if(c==='\\') escape=true; else if(c==='"') quoted=false; } else if(c==='"') quoted=true; else if(c==='{' || c==='[') { if(++depth>LIMITS.depth) throw new LocalError('JSON_DEPTH_LIMIT'); } else if(c==='}' || c===']') depth--; }
 try { return JSON.parse(text) as unknown; } catch { throw new LocalError('INVALID_JSON'); }
}
const importSchema=z.object({filename:z.string().max(180).regex(/^[^/\\]+\.(txt|md|json)$/i).refine(s=>!Array.from(s).some(c=>c.charCodeAt(0)<32)),text:z.string(),metadata:metadataSchema.optional()}).strict();
export function importDocument(raw:unknown,topic:Topic):DocumentVersion {
 const data=importSchema.parse(raw);
 if(Buffer.byteLength(data.text,'utf8')>LIMITS.fileBytes) throw new LocalError('FILE_SIZE_LIMIT');
 ensureSafeText(data.text); if(data.metadata) ensureSafeText(JSON.stringify(data.metadata));
 let content:z.infer<typeof scenarioSchema>;
 if(data.filename.toLowerCase().endsWith('.json')) content=scenarioSchema.parse(parseBoundedJson(data.text));
 else {
  const metadata=metadataSchema.parse(data.metadata);
  const paragraphs=data.text.split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean).map((text,i)=>({id:`p${i+1}`,text}));
  if(!paragraphs.length || paragraphs.length>LIMITS.paragraphs || paragraphs.some(p=>p.text.length>4000)) throw new LocalError('PARAGRAPH_LIMIT');
  return {id:randomUUID(),metadata:validateTopic(metadata,topic),paragraphs,source:'imported',imported_at:new Date().toISOString()};
 }
 validateTopic(content.metadata,topic);
 return {id:randomUUID(),metadata:content.metadata,paragraphs:content.paragraphs,...(content.conditions?{conditions:content.conditions}:{}),...(content.rules?{rules:content.rules}:{}),source:'imported',imported_at:new Date().toISOString()};
}
function validateTopic<T extends {topic:Topic}>(data:T,topic:Topic):T { if(data.topic!==topic) throw new LocalError('TOPIC_MISMATCH'); return data; }
export function demoDocuments(topic:Topic):DocumentVersion[] { return topic==='disaster'?starrylinkDocuments():eventDocuments(); }
export function checkLocal(topic:Topic,input:LocalInput,sources:DocumentVersion[],requestId:string):LocalResult {
 const snapshot=createSnapshot(sources.map(d=>createSource({sourceId:d.id,documentId:d.metadata.document_id,versionId:d.metadata.version,title:d.metadata.title,contentType:'application/json',importedAt:d.imported_at,content:d as unknown as Json})));
 const {participants,...disaster}=input;
 const planning={question:input.question,scope:input.scope,at:input.at,participants};
 const adapter=topic==='disaster'?starrylinkAdapter:eventPlanningAdapter;
 const validation=adapter.validateInput(topic==='disaster'?disaster:planning);
 if(!validation.success) throw new LocalError('INVALID_INPUT');
 // The union is narrowed explicitly; adapters own interpretation of their fields.
 const normalized=topic==='disaster'?starrylinkAdapter.normalizeInput(disaster,snapshot):eventPlanningAdapter.normalizeInput(planning,snapshot);
 const decision=evaluate(normalized,snapshot,adapter.buildConstraints(normalized,snapshot));
 const labels=normalized.parameters.labels as Record<string,string>;
 const checks:LocalResult['checks']=decision.constraints.map(c=>({id:c.id,status:c.status==='NOT_APPLICABLE'?'UNKNOWN':c.status,message:labels[c.id]??c.reason,refs:c.source.map(r=>`${r.sourceId}#${r.path}`)}));
 const gaps=decision.status!=='PASS';
 return {id:decision.decisionId,request_id:requestId,topic,created_at:decision.createdAt,processing:'local-check',input:structuredClone(input),sources:structuredClone(sources),checks,status:gaps?'GAPS':'CHECKED',recommendation:gaps?'資料有缺口或條件不符，請依下列條目補齊或修正。':'目前有限條件檢查通過，可檢視來源後提出安排；尚未執行。',admission:'NOT_ASSESSED',execution:'NOT_DISPATCHED',completion:'NOT_ESTABLISHED',limitations:['本地通用條件核心判定，不是 U01 封版執行器。','不驗證文件真假或現實可行性；example adapter 不代表實際執行。','未呼叫模型；自然語言問題僅作任務紀錄，不作語義推理。'],decision};
}
const commandSchema=z.object({topic:topicSchema,revision:z.number().int().nonnegative(),op:z.enum(['demo','import','select','run','save','delete','clear','draft']),payload:z.unknown().optional()}).strict();
export class LocalStore {
 private file:RevisionedFile<LocalState>;
 private get state():LocalState{return this.file.view();}
 private pending=new Map<string,LocalResult>();
 constructor(path:string,persist:(path:string,state:LocalState)=>void=atomicWrite) {
  this.file=new RevisionedFile(path,{revision:0,documents:[],selected:{disaster:[],planning:[]},records:[],drafts:{}},raw=>{
   const state=raw as LocalState;
   if(!state||!Number.isInteger(state.revision)||state.revision<0||!Array.isArray(state.documents)||!Array.isArray(state.records)||!state.selected||!Array.isArray(state.selected.disaster)||!Array.isArray(state.selected.planning)||!state.drafts)throw new LocalError('STORE_INVALID');
   if(state.documents.length>LIMITS.documents||state.records.length>LIMITS.records||(state.audit?.length??0)>STORE_LIMITS.audit)throw new LocalError('STORE_INVALID');
   if(state.audit) auditEventSchema.array().max(STORE_LIMITS.audit).parse(state.audit);
   for(const r of state.records)if(r.decision){
    validateDecision(r.decision);if(r.id!==r.decision.decisionId||r.decision.revision!==1||r.created_at!==r.decision.createdAt)throw new LocalError('STORE_INVALID');
    const expected=checkLocal(topicSchema.parse(r.topic),inputSchema.parse(r.input),r.sources,z.string().uuid().parse(r.request_id));
    for(const key of ['processing','checks','status','recommendation','admission','execution','completion','limitations'] as const)if(contentHash(r[key])!==contentHash(expected[key]))throw new LocalError('STORE_INVALID');
    if(contentHash(expected.decision!.input)!==r.decision.inputHash||expected.decision!.snapshot.contentHash!==r.decision.snapshot.contentHash||contentHash(expected.decision!.constraints)!==contentHash(r.decision.constraints))throw new LocalError('STORE_INVALID');
    if(state.audit&&!state.audit.some(a=>contentHash(a)===contentHash(r.decision!.audit[1])))throw new LocalError('STORE_INVALID');
   }
   for(const a of state.audit??[]){const record=state.records.find(r=>r.id===a.decisionId);if(record?.decision&&(a.event!=='SAVED'||contentHash(a)!==contentHash(record.decision.audit[1])))throw new LocalError('STORE_INVALID');}
   return state;
  },persist);
 }
 archiveAndClear(archivePath:string,expected:number):void {
  const current=this.state;if(expected!==current.revision)throw new LocalError('REVISION_CONFLICT');
  writeArchive(archivePath,current);
  this.file.commit({revision:expected+1,documents:[],selected:{disaster:[],planning:[]},records:[],drafts:{}},expected);this.pending.clear();
 }
 headroom():{documents:number;records:number;audit:number}{const s=this.state;return {documents:LIMITS.documents-s.documents.length,records:LIMITS.records-s.records.length,audit:STORE_LIMITS.audit-(s.audit?.length??0)};}
 view():LocalState { return structuredClone(this.state); }
 forget(session:string):void { for(const [key] of this.pending) if(key.startsWith(session+':')) this.pending.delete(key); }
 command(raw:unknown,session:string):{state:LocalState;result?:LocalResult} {
  const c=commandSchema.parse(raw); if(c.revision!==this.state.revision) throw new LocalError('REVISION_CONFLICT');
  const next=structuredClone(this.state); const topic=c.topic;
  if(c.op==='run') {
   const p=z.object({request_id:z.string().uuid(),input:inputSchema}).strict().parse(c.payload); ensureSafeText(JSON.stringify(p.input));
   const key=session+':'+p.request_id;
   if(this.pending.has(key)) { const prior=this.pending.get(key)!; if(prior.topic!==topic || JSON.stringify(prior.input)!==JSON.stringify(p.input)) throw new LocalError('REQUEST_ID_CONFLICT'); return {state:this.view(),result:structuredClone(prior)}; }
   const sources=next.documents.filter(d=>d.metadata.topic===topic&&next.selected[topic].includes(d.id));
   const result=checkLocal(topic,p.input,sources,p.request_id);
   if(this.pending.size>=200) throw new LocalError('PENDING_RESULT_LIMIT');
   this.pending.set(key,structuredClone(result)); return {state:this.view(),result};
  }
  if(c.op==='demo') {
   for(const d of demoDocuments(topic)) if(!next.documents.some(old=>old.metadata.topic===topic&&old.metadata.document_id===d.metadata.document_id&&old.metadata.version===d.metadata.version)) next.documents.push(d);
   next.selected[topic]=next.documents.filter(d=>d.metadata.topic===topic&&d.source==='synthetic'&&d.metadata.version==='1').map(d=>d.id);
  } else if(c.op==='import') {
   const d=importDocument(c.payload,topic);
   if(next.documents.some(old=>old.metadata.topic===topic&&old.metadata.document_id===d.metadata.document_id&&old.metadata.version===d.metadata.version)) throw new LocalError('VERSION_EXISTS');
   next.documents.push(d);
  } else if(c.op==='select') {
   const ids=z.array(z.string().uuid()).max(LIMITS.documents).parse(c.payload); const docs=ids.map(id=>next.documents.find(d=>d.id===id&&d.metadata.topic===topic));
   if(docs.some(d=>!d)||new Set(docs.map(d=>d!.metadata.document_id)).size!==ids.length) throw new LocalError('INVALID_VERSION_SELECTION');
   next.selected[topic]=ids;
  } else if(c.op==='draft') { const input=inputSchema.parse(c.payload); ensureSafeText(JSON.stringify(input)); next.drafts[topic]=input; }
  else if(c.op==='save') {
   const id=z.string().uuid().parse(c.payload); const result=this.pending.get(session+':'+id);
   if(!result||result.topic!==topic) throw new LocalError('RESULT_SESSION_MISMATCH');
   if(!next.records.some(r=>r.id===result.id)) {
    const saved=structuredClone(result);saved.saved_at=new Date().toISOString();
    if(saved.decision){validateDecision(saved.decision);saved.decision.revision=1;const event={event:'SAVED' as const,decisionId:saved.id,revision:1,at:saved.saved_at,inputHash:saved.decision.inputHash,snapshotId:saved.decision.snapshotId};saved.decision.audit.push(event);(next.audit??=[]).push(event);}
    next.records.push(saved);
   }
  } else if(c.op==='delete') {
   const id=z.string().uuid().parse(c.payload); const result=next.records.find(r=>r.id===id&&r.topic===topic); if(!result) throw new LocalError('RECORD_NOT_FOUND');
   if(result.decision)(next.audit??=[]).push({event:'DELETED',decisionId:id,revision:result.decision.revision+1,at:new Date().toISOString(),inputHash:result.decision.inputHash,snapshotId:result.decision.snapshotId});
   next.records=next.records.filter(r=>r.id!==id);
  } else if(c.op==='clear') { for(const r of next.records.filter(r=>r.topic===topic))if(r.decision)(next.audit??=[]).push({event:'DELETED',decisionId:r.id,revision:r.decision.revision+1,at:new Date().toISOString(),inputHash:r.decision.inputHash,snapshotId:r.decision.snapshotId}); next.documents=next.documents.filter(d=>d.metadata.topic!==topic); next.records=next.records.filter(r=>r.topic!==topic); next.selected[topic]=[]; delete next.drafts[topic]; }
  if(next.documents.length>LIMITS.documents) throw new LocalError('DOCUMENT_COUNT_LIMIT');
  if(next.records.length>LIMITS.records) throw new LocalError('RECORD_COUNT_LIMIT');
  if((next.audit?.length??0)>STORE_LIMITS.audit)throw new LocalError('AUDIT_COUNT_LIMIT');
  next.revision++; try{this.file.commit(next,c.revision);}catch(e){if(e instanceof Error&&e.message==='REVISION_CONFLICT')throw new LocalError('REVISION_CONFLICT');throw e;}
  if(c.op==='clear'||c.op==='delete') for(const [key,r] of this.pending) if(r.topic===topic&&(c.op==='clear'||r.id===c.payload)) this.pending.delete(key);
  return {state:this.view()};
 }
}
export function markdownExport(r:LocalResult):string {
 const escape=(s:string)=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!)).replace(/([\\`*_[\]#!|])/g,'\\$1');
 return ['# ARCI 本地檢查紀錄',`紀錄 ID：${r.id}`,`處理方式：${r.processing}；主題：${r.topic}`,`輸入來源：使用者輸入`,escape(r.input.question),'## 採用條件',escape(JSON.stringify(r.input)),`狀態：${r.status} / ${r.admission} / ${r.execution} / ${r.completion}`,escape(r.recommendation),'## 檢查與引用',...r.checks.map(c=>`${c.status} — ${escape(c.message)}\n引用：${c.refs.join(', ')||'使用者輸入／無文件依據'}`),'## Structured decision / provenance',escape(JSON.stringify(r.decision??{status:'LEGACY_RECORD_NO_CORE_DECISION'})),`Saved at: ${r.saved_at??'UNKNOWN'}`,'## 來源快照',...r.sources.map(d=>`${escape(d.metadata.title)} / ${d.metadata.version??'UNKNOWN'} / ${d.source}\n${escape(JSON.stringify(d))}`),'## 限制',...r.limitations].join('\n\n');
}
