import { sha256Text } from './hash.js';
import { coreId, coreNow,type CoreRuntime } from './runtime.js';
import { sourceSchema, snapshotSchema, type Json, type SourceDocument, type SourceSnapshot, type EvidenceRef } from './contracts.js';
import { assertBounded } from './validation.js';
export function canonical(value:Json):string {
 if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
 if(value!==null && typeof value==='object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k]!)).join(',')+'}';
 return JSON.stringify(value);
}
export function contentHash(value:unknown):string {assertBounded(value);return sha256Text(canonical(value as Json));}
export function createSource(input:Omit<SourceDocument,'contentHash'>):SourceDocument {
 assertBounded(input); return sourceSchema.parse({...input,contentHash:contentHash(input.content)});
}
export function createSnapshot(sources:SourceDocument[],runtime:CoreRuntime={}):SourceSnapshot {
 assertBounded(sources);
 const copy=sources.map(s=>sourceSchema.parse(s));
 if(new Set(copy.map(s=>s.sourceId)).size!==copy.length) throw new Error('DUPLICATE_SOURCE_VERSION');
 for(const source of copy) if(contentHash(source.content)!==source.contentHash) throw new Error('SOURCE_HASH_MISMATCH');
 return snapshotSchema.parse({snapshotId:coreId(runtime),createdAt:coreNow(runtime),sources:copy,contentHash:contentHash(copy)});
}
export function validateSnapshot(raw:unknown):SourceSnapshot {
 assertBounded(raw);const s=snapshotSchema.parse(raw);
 if(contentHash(s.sources)!==s.contentHash) throw new Error('SNAPSHOT_HASH_MISMATCH');
 if(new Set(s.sources.map(s=>s.sourceId)).size!==s.sources.length)throw new Error('DUPLICATE_SOURCE_VERSION');
 for(const source of s.sources)if(contentHash(source.content)!==source.contentHash)throw new Error('SOURCE_HASH_MISMATCH');return s;
}
export function hasEvidence(snapshot:SourceSnapshot,ref:EvidenceRef):boolean {
 const source=snapshot.sources.find(s=>s.sourceId===ref.sourceId&&s.versionId===ref.versionId);
 if(!source) return false;
 let value:Json=source.content;
 if(!ref.path) return true;
 for(const part of ref.path.split('.')) {
  if(value===null || typeof value!=='object' || !Object.hasOwn(value,part)) return false;
  value=(value as Record<string,Json>)[part]!;
 }
 return true;
}
