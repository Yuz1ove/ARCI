import { boundedCall } from '../../foundations/async-boundary.js';
import { validateDecision } from '../core/integrity.js';
import { z } from 'zod';
import { evaluate } from '../core/engine.js';
import { assertBounded } from '../core/validation.js';
import { canonical, validateSnapshot } from '../core/evidence.js';
import { known, unknown, type DecisionResult } from '../core/contracts.js';
import {
 semanticRequestSchema, answerSchema, modelOutputSchema, judgmentMetadataSchema, modelIdentitySchema, usageSchema,
 SemanticError, TASK_OPTIONS, SEMANTIC_PROMPT_VERSION, SEMANTIC_SCHEMA_VERSION, REFERENCE_RULES_VERSION,
 type SemanticRequest, type SemanticProvider, type SemanticJudgment, type JudgmentMetadata, type ProviderReply,
} from './contracts.js';
import { REFERENCE_SYSTEM } from './reference.js';
const gate='semantic.v1.gate';
export function semanticOutputSchema(request:SemanticRequest):Record<string,unknown> {
 const answer=z.toJSONSchema(answerSchema);
 return {type:'object',additionalProperties:false,required:['answers'],properties:{answers:{type:'array',
  minItems:request.questions.length,maxItems:request.questions.length,
  prefixItems:request.questions.map(q=>({...answer,properties:{...answer.properties,questionId:{type:'string',const:q.id},label:{type:'string',enum:q.options},sourceIds:{type:'array',minItems:1,maxItems:24,items:{type:'string',enum:request.snapshot.sources.map(s=>s.sourceId)}}}})),
 }}};
}

function parseRequest(raw:unknown):SemanticRequest {
 try {
  assertBounded(raw);const r=semanticRequestSchema.parse(raw);validateSnapshot(r.snapshot);
  if(new Set(r.questions.map(q=>q.id)).size!==r.questions.length)throw new Error();
  for(const q of r.questions)if(canonical(q.options)!==canonical([...TASK_OPTIONS[q.task]]))throw new Error();
  if(Object.hasOwn(r.input.facts,gate)||Object.hasOwn(r.input.parameters,'semanticJudgment')||r.constraints.some(c=>c.field===gate||c.id===gate))throw new Error();
  if(r.snapshot.sources.some(s=>typeof s.content!=='string'||s.contentType!=='text/plain'))throw new Error();
  if(Buffer.byteLength(JSON.stringify(r))>r.limits.maxInputBytes)throw new SemanticError('INPUT_LIMIT');
  evaluate(r.input,r.snapshot,r.constraints);return r;
 }catch(error){throw error instanceof SemanticError?error:new SemanticError('INVALID_INPUT');}
}
function validateOutput(reply:ProviderReply,r:SemanticRequest):z.infer<typeof modelOutputSchema> {
 if(typeof reply.output!=='string'||Buffer.byteLength(reply.output)>r.limits.maxOutputBytes)throw new SemanticError('OUTPUT_LIMIT');
 let raw:unknown;try{raw=JSON.parse(reply.output) as unknown;}catch{throw new SemanticError('INVALID_JSON');}
 const parsed=modelOutputSchema.safeParse(raw);if(!parsed.success)throw new SemanticError('OUTPUT_SCHEMA_INVALID');const out=parsed.data;
 if(out.answers.length!==r.questions.length||new Set(out.answers.map(a=>a.questionId)).size!==r.questions.length)throw new SemanticError('QUESTION_ID_MISMATCH');
 for(const a of out.answers){
  const q=r.questions.find(q=>q.id===a.questionId);if(!q)throw new SemanticError('QUESTION_ID_MISMATCH');
  if(!q.options.includes(a.label))throw new SemanticError('OPTION_INVALID');
  if(new Set(a.sourceIds).size!==a.sourceIds.length||a.sourceIds.some(id=>!r.snapshot.sources.some(s=>s.sourceId===id)))throw new SemanticError('SOURCE_ID_INVALID');
  if(a.quotes.some(quote=>!a.sourceIds.includes(quote.sourceId)||!r.snapshot.sources.some(s=>s.sourceId===quote.sourceId&&typeof s.content==='string'&&s.content.includes(quote.text))))throw new SemanticError('QUOTE_INVALID');
  if(['SUPPORTED','PARTIALLY_SUPPORTED','CONTRADICTED'].includes(a.label)&&a.quotes.length===0)throw new SemanticError('QUOTE_REQUIRED');
  if(a.label!=='INSUFFICIENT_INFORMATION'&&a.sourceIds.length===0)throw new SemanticError('SOURCE_REQUIRED');
 }
 return out;
}
export async function judgeSemantic(raw:unknown,provider?:SemanticProvider,options:{signal?:AbortSignal}={}):Promise<SemanticJudgment> {
 const start=performance.now(),r=parseRequest(raw),preflight=evaluate(r.input,r.snapshot,r.constraints);
 const m:JudgmentMetadata={requestId:r.requestId,questions:r.questions,limits:r.limits,versions:{prompt:SEMANTIC_PROMPT_VERSION,schema:SEMANTIC_SCHEMA_VERSION,rules:REFERENCE_RULES_VERSION},status:'NOT_RUN',reason:'NOT_RUN',requestedModel:provider?.model??null,model:null,usage:{inputTokens:null,outputTokens:null},latencyMs:0,results:[]};
 const finish=(status:JudgmentMetadata['status'],reason:string,disposition:JudgmentMetadata['results'][number]['disposition']):SemanticJudgment=>{
  m.status=status;m.reason=reason;m.latencyMs=Math.round((performance.now()-start)*1000)/1000;
  if(m.results.length===0)m.results=r.questions.map(q=>({questionId:q.id,recommendation:null,disposition,reason,confidence:null,calibration:'NOT_CALIBRATED'}));
  const metadata=judgmentMetadataSchema.parse(m),ready=status==='VALID'&&metadata.results.every(x=>x.disposition==='ADVISORY_AVAILABLE');
  const input=structuredClone(r.input);input.parameters.semanticJudgment=metadata;input.facts[gate]=ready?known(true):unknown(reason);
  const refs=Array.from(new Set(metadata.results.flatMap(x=>x.recommendation?.sourceIds??[]))).map(id=>({sourceId:id,versionId:r.snapshot.sources.find(s=>s.sourceId===id)!.versionId,path:''}));
  const decision=evaluate(input,r.snapshot,[...r.constraints,{id:gate,field:gate,operator:'EQUALS',expected:known(true),source:refs}]);
  return {...metadata,decision};
 };
 if(preflight.status!=='PASS'){
  const reason=preflight.status==='FAIL'?'HARD_CONSTRAINT_FAILED':preflight.unknowns[0]?.reason??'FACT_MISSING';
  return finish('NOT_RUN',reason,preflight.status==='FAIL'||reason==='SOURCE_VERSION_CONFLICT'?'REVIEW_REQUIRED':'NEEDS_INFORMATION');
 }
 if(r.snapshot.sources.some(s=>typeof s.content==='string'&&!s.content.trim()))return finish('NOT_RUN','SOURCE_TEXT_MISSING','NEEDS_INFORMATION');
 if(!provider)return finish('DISABLED','PROVIDER_DISABLED','NO_VALID_JUDGMENT');
 try {
  const reply=await boundedCall(signal=>provider.generate({system:REFERENCE_SYSTEM,user:JSON.stringify({questions:r.questions,sources:r.snapshot.sources.map(s=>({sourceId:s.sourceId,text:s.content}))}),schema:semanticOutputSchema(r),limits:r.limits,signal}),{key:provider.resourceKey?'semantic:'+provider.resourceKey:provider,timeoutMs:r.limits.timeoutMs,...(options.signal?{signal:options.signal}:{})});
  const identity=modelIdentitySchema.safeParse(reply.model),usage=usageSchema.safeParse(reply.usage);
  if(!identity.success||!usage.success)throw new SemanticError('PROVIDER_METADATA_INVALID');m.model=identity.data;m.usage=usage.data;
  const out=validateOutput(reply,r);
  m.results=r.questions.map(q=>{const a=out.answers.find(a=>a.questionId===q.id)!;
   const disposition=a.label==='INSUFFICIENT_INFORMATION'?'NEEDS_INFORMATION':['CONTRADICTED','PARTIALLY_SUPPORTED'].includes(a.label)?'REVIEW_REQUIRED':'ADVISORY_AVAILABLE';
   return {questionId:q.id,recommendation:a,disposition,reason:a.label==='INSUFFICIENT_INFORMATION'?'INSUFFICIENT_INFORMATION':disposition==='REVIEW_REQUIRED'?'CLAIM_REQUIRES_REVIEW':'VALIDATED_ADVISORY_ONLY',confidence:null,calibration:'NOT_CALIBRATED'};
  });
  const review=m.results.some(x=>x.disposition==='REVIEW_REQUIRED'),missing=m.results.some(x=>x.disposition==='NEEDS_INFORMATION');
  return finish('VALID',review?'CLAIM_REQUIRES_REVIEW':missing?'INSUFFICIENT_INFORMATION':'VALIDATED_ADVISORY_ONLY','ADVISORY_AVAILABLE');
 }catch(error){
  const code=error instanceof SemanticError?error.code:error instanceof Error&&error.message==='CALL_TIMEOUT'?'PROVIDER_TIMEOUT':error instanceof Error&&error.message==='CALL_CANCELLED'?'PROVIDER_CANCELLED':error instanceof Error&&error.message==='CALL_BUSY'?'PROVIDER_BUSY':'PROVIDER_UNAVAILABLE';
  const status=code==='PROVIDER_TIMEOUT'?'TIMEOUT':/^(INVALID_JSON|OUTPUT_|QUESTION_|OPTION_|SOURCE_ID_|SOURCE_REQUIRED|QUOTE_|PROVIDER_METADATA_|RESPONSE_MODEL_)/.test(code)?'INVALID_OUTPUT':'UNAVAILABLE';
  return finish(status,status==='TIMEOUT'?'PROVIDER_TIMEOUT':code,'NO_VALID_JUDGMENT');
 }
}
export function readSemanticJudgment(record:DecisionResult):SemanticJudgment {
 validateDecision(record);
 const parsed=judgmentMetadataSchema.safeParse(record.input.parameters.semanticJudgment);if(!parsed.success)throw new SemanticError('SEMANTIC_RECORD_INVALID');
 return {...parsed.data,decision:structuredClone(record)};
}
