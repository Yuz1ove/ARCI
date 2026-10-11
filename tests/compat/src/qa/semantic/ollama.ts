import { boundedCall } from '../../foundations/async-boundary.js';
import { z } from 'zod';
import { SemanticError, type SemanticProvider, type ProviderCall, type ProviderReply } from './contracts.js';
const metadata=z.object({name:z.string(),digest:z.string().regex(/^[a-f0-9]{64}$/),size:z.number().positive(),remote_host:z.string().nullish(),remote_model:z.string().nullish()});
const generated=z.object({model:z.string(),done:z.literal(true),done_reason:z.literal('stop'),response:z.string(),prompt_eval_count:z.number().int().nonnegative().optional(),eval_count:z.number().int().nonnegative().optional()});
// Only a literal loopback address; redirects, cloud tags and remote-backed models are refused.
export class OllamaSemanticProvider implements SemanticProvider {
 readonly model:string;readonly resourceKey:string;private readonly base:string;private active=false;
 constructor(options:{model:string;baseUrl?:string;beforeDispatch?:()=>void}) {
  this.model=options.model;const url=new URL(options.baseUrl??'http://127.0.0.1:11434');
  if(url.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new SemanticError('LOCAL_ENDPOINT_REQUIRED');
  if(!this.model.trim()||/cloud/i.test(this.model))throw new SemanticError('LOCAL_MODEL_REQUIRED');
  this.base=url.origin;this.resourceKey=url.origin;this.beforeDispatch=options.beforeDispatch;
 }
 private readonly beforeDispatch:(()=>void)|undefined;
 private async json(path:string,signal:AbortSignal,body?:unknown):Promise<unknown> {
  let response:Response;
  try{response=await fetch(this.base+path,{method:body===undefined?'GET':'POST',redirect:'error',signal,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});}
  catch{throw new SemanticError(signal.aborted?'PROVIDER_TIMEOUT':'PROVIDER_UNAVAILABLE');}
  if(!response.ok){await response.body?.cancel();throw new SemanticError('PROVIDER_HTTP_'+String(response.status));}
  const reader=response.body?.getReader();if(!reader)throw new SemanticError('PROVIDER_UNAVAILABLE');
  const chunks:Uint8Array[]=[];let length=0;
  try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>262144){await reader.cancel();throw new SemanticError('OUTPUT_LIMIT');}chunks.push(part.value);}}
  finally{reader.releaseLock();}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;}catch{throw new SemanticError('INVALID_JSON');}
 }
 async generate(call:ProviderCall):Promise<ProviderReply> {
  try{return await boundedCall(signal=>this.dispatch({...call,signal}),{key:'ollama:'+this.base,timeoutMs:call.limits.timeoutMs,signal:call.signal,maximumPending:0});}
  catch(error){if(error instanceof Error&&error.message==='CALL_BUSY')throw new SemanticError('PROVIDER_BUSY');if(error instanceof Error&&error.message==='CALL_TIMEOUT')throw new SemanticError('PROVIDER_TIMEOUT');if(error instanceof Error&&error.message==='CALL_CANCELLED')throw new SemanticError('PROVIDER_CANCELLED');throw error;}
 }
 private async dispatch(call:ProviderCall):Promise<ProviderReply> {
  if(this.active)throw new SemanticError('PROVIDER_BUSY');this.active=true;
  try {
   const tags=z.object({models:z.array(metadata)}).parse(await this.json('/api/tags',call.signal));
   const model=tags.models.find(m=>m.name===this.model);if(!model||model.remote_host||model.remote_model)throw new SemanticError('LOCAL_MODEL_REQUIRED');
   const show=z.object({capabilities:z.array(z.string()),model_info:z.record(z.string(),z.unknown()),remote_host:z.string().nullish(),remote_model:z.string().nullish()}).parse(await this.json('/api/show',call.signal,{model:this.model}));
   if(show.remote_host||show.remote_model||!show.capabilities.includes('completion'))throw new SemanticError('LOCAL_MODEL_REQUIRED');
   const available=Object.entries(show.model_info).filter(([key])=>key.endsWith('.context_length')).map(([,v])=>v).filter((v):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>0);
   if(!available.length)throw new SemanticError('CONTEXT_LIMIT_UNKNOWN');
   const context=Math.min(8192,...available);
   // UTF-8 bytes conservatively upper-bound text tokens; reserve schema, template and output.
   const bound=Buffer.byteLength(call.system+call.user+JSON.stringify(call.schema))+call.limits.maxOutputTokens+512;
   if(bound>context)throw new SemanticError('CONTEXT_LIMIT');
   const version=z.object({version:z.string()}).parse(await this.json('/api/version',call.signal));
   call.signal.throwIfAborted();this.beforeDispatch?.();
   const parsed=generated.safeParse(await this.json('/api/generate',call.signal,{model:this.model,system:call.system,prompt:call.user,format:call.schema,stream:false,...(show.capabilities.includes('thinking')?{think:false}:{}),options:{temperature:0,seed:42,num_ctx:context,num_predict:call.limits.maxOutputTokens}}));
   if(!parsed.success)throw new SemanticError('OUTPUT_ENVELOPE_INVALID');const response=parsed.data;
   if(response.model!==this.model)throw new SemanticError('RESPONSE_MODEL_MISMATCH');
   return {output:response.response,model:{name:response.model,digest:model.digest,serverVersion:version.version,local:true},usage:{inputTokens:response.prompt_eval_count??null,outputTokens:response.eval_count??null}};
  }catch(error){if(error instanceof SemanticError)throw error;throw new SemanticError(call.signal.aborted?'PROVIDER_TIMEOUT':'PROVIDER_UNAVAILABLE');}
  finally{this.active=false;}
 }
}
