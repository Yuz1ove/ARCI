import { z } from 'zod';
import { known,unknown,type Knowledge,type Constraint,type DecisionInput,type SourceSnapshot,type EvidenceRef } from '../core/contracts.js';
import type { ArciDomainAdapter } from '../core/adapter-contract.js';
export const commonInputSchema=z.object({question:z.string().trim().min(1).max(4000),scope:z.string().nullable(),at:z.string().datetime()}).strict();
type CommonInput=z.infer<typeof commonInputSchema>;
export const sourceContentSchema=z.object({metadata:z.object({scope:z.string().nullable(),version:z.string().nullable(),effective_at:z.string().datetime().nullable(),expires_at:z.string().datetime().nullable()}).passthrough(),paragraphs:z.array(z.object({id:z.string(),text:z.string()})),conditions:z.unknown().optional(),rules:z.unknown().optional()}).passthrough();
export class Plan {
 facts:Record<string,Knowledge>={};constraints:Constraint[]=[];labels:Record<string,string>={};
 add(id:string,actual:Knowledge,operator:Constraint['operator'],expected:Knowledge,message:string,source:EvidenceRef[]=[]):void {
  this.facts[id]=actual;this.constraints.push({id,field:id,operator,expected,source});this.labels[id]=message;
 }
}
export function ref(s:SourceSnapshot['sources'][number],path:string):EvidenceRef{return {sourceId:s.sourceId,versionId:s.versionId,path};}
function common(plan:Plan,input:CommonInput,snapshot:SourceSnapshot):void {
 const sources=snapshot.sources;
 plan.add('sources',sources.length?known(sources.length):unknown('SOURCES_MISSING'),'GREATER_THAN',known(0),sources.length?'已綁定本次來源快照。':'沒有載入有效來源。',sources.map(s=>ref(s,'')));
 const contents=sources.map(s=>sourceContentSchema.parse(s.content));const scopes=new Set(contents.map(d=>d.metadata.scope).filter(Boolean));
 plan.add('scope-conflict',known(scopes.size),'LESS_OR_EQUAL',known(1),scopes.size>1?'來源適用範圍不同，不能合併為共同結論。':'未發現已知來源範圍互相衝突。',sources.map(s=>ref(s,'metadata.scope')));
 sources.forEach((s,i)=>{
  const m=contents[i]!.metadata;
  plan.add(s.sourceId+':version',known(m.version),'PRESENT',known(true),m.version?`明確選用版本 ${m.version}；未按匯入日期推定可信度。`:'版本未知。',[ref(s,'metadata.version')]);
  plan.add(s.sourceId+':scope',known(input.scope),'EQUALS',known(m.scope),`文件範圍：${m.scope??'未知'}；輸入範圍：${input.scope??'未知'}。`,[ref(s,'metadata.scope')]);
  // Interval membership compiled by the adapter into an explicit observed fact.
  plan.add(s.sourceId+':time',!m.effective_at||!m.expires_at?unknown('VALIDITY_INTERVAL_UNKNOWN'):known(input.at>=m.effective_at&&input.at<=m.expires_at),'EQUALS',known(true),`採用的檢查時間 ${input.at}；資料有效期 ${m.effective_at??'未知'} 至 ${m.expires_at??'未知'}。`,[ref(s,'metadata.effective_at'),ref(s,'metadata.expires_at')]);
 });
}
export function createExampleAdapter<T extends CommonInput>(id:string,schema:z.ZodType<T>,domain:(plan:Plan,input:T,snapshot:SourceSnapshot)=>void):ArciDomainAdapter<T> {
 const compile=(input:T,snapshot:SourceSnapshot)=>{const p=new Plan();common(p,input,snapshot);domain(p,input,snapshot);return p;};
 return {id,validateInput(raw){const r=schema.safeParse(raw);return r.success?{success:true,data:r.data}:{success:false,issues:r.error.issues.map(i=>i.message)};},normalizeInput(raw,snapshot):DecisionInput {
  const input=schema.parse(raw),plan=compile(input,snapshot);
  return {context:{domainPayload:input},facts:plan.facts,selectedSources:snapshot.sources.map(s=>s.sourceId),parameters:{labels:plan.labels},requestedOperation:'EVALUATE'};
 },buildConstraints(input,snapshot){return compile(schema.parse(input.context.domainPayload),snapshot).constraints;}};
}
