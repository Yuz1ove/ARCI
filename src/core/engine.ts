import { coreId,coreNow,type CoreRuntime } from './runtime.js';
import { constraintSchema,inputSchema,unknown,type Constraint,type ConstraintResult,type DecisionResult,type SourceSnapshot } from './contracts.js';
import { canonical,contentHash,hasEvidence,validateSnapshot } from './evidence.js';
import { assertBounded } from './validation.js';
export function evaluate(raw:unknown,sourceSnapshot:SourceSnapshot,rules:Constraint[],runtime:CoreRuntime={}):DecisionResult {
 assertBounded(raw);assertBounded(rules);
 const input=inputSchema.parse(raw);const snapshot=validateSnapshot(sourceSnapshot);
 if(new Set(input.selectedSources).size!==input.selectedSources.length || canonical([...input.selectedSources].sort())!==canonical(snapshot.sources.map(s=>s.sourceId).sort())) throw new Error('SOURCE_SELECTION_MISMATCH');
 const specs=constraintSchema.array().max(512).parse(rules);
 if(new Set(specs.map(s=>s.id)).size!==specs.length) throw new Error('DUPLICATE_CONSTRAINT');
 const constraints:ConstraintResult[]=specs.map(c=>{
  const actual=Object.hasOwn(input.facts,c.field)?input.facts[c.field]!:unknown('FACT_MISSING');
  const result=(status:ConstraintResult['status'],reason:string):ConstraintResult=>({...c,actual,status,reason});
  if(c.source.length===0) return result('UNKNOWN','EVIDENCE_REFERENCE_MISSING');
  if(c.source.some(ref=>!hasEvidence(snapshot,ref))) return result('UNKNOWN','EVIDENCE_REFERENCE_UNRESOLVED');
  if(actual.status==='UNKNOWN') return result('UNKNOWN',actual.reason);
  if(c.expected.status==='UNKNOWN') return result('UNKNOWN',c.expected.reason);
  if(actual.status==='NOT_APPLICABLE' || c.expected.status==='NOT_APPLICABLE') return result('NOT_APPLICABLE','EXPLICIT_NOT_APPLICABLE');
  if(actual.value===null || c.expected.value===null) return result('UNKNOWN','VALUE_MISSING');
  const a=actual.value,b=c.expected.value;
  let pass:boolean;
  if(c.operator==='PRESENT') pass=true;
  else if(c.operator==='EQUALS') pass=canonical(a)===canonical(b);
  else {
   if(!((typeof a==='number'&&typeof b==='number')||(typeof a==='string'&&typeof b==='string'))) return result('UNKNOWN','INCOMPARABLE_VALUES');
   pass=c.operator==='GREATER_THAN'?a>b:c.operator==='LESS_THAN'?a<b:c.operator==='LESS_OR_EQUAL'?a<=b:a>=b;
  }
  return result(pass?'PASS':'FAIL',pass?'CONDITION_SATISFIED':'CONDITION_NOT_SATISFIED');
 });
 const unknowns=constraints.filter(c=>c.status==='UNKNOWN').map(c=>({field:c.field,reason:c.reason}));
 if(new Set(snapshot.sources.map(s=>s.documentId)).size!==snapshot.sources.length) unknowns.push({field:'selectedSources',reason:'SOURCE_VERSION_CONFLICT'});
 if(!snapshot.sources.length) unknowns.push({field:'selectedSources',reason:'SOURCES_MISSING'});
 if(!constraints.some(c=>c.status!=='NOT_APPLICABLE')) unknowns.push({field:'constraints',reason:'NO_APPLICABLE_CONSTRAINTS'});
 for(const source of snapshot.sources) if(source.versionId===null) unknowns.push({field:source.sourceId,reason:'SOURCE_VERSION_UNKNOWN'});
 const status=constraints.some(c=>c.status==='FAIL')?'FAIL':unknowns.length?'UNKNOWN':'PASS';
 const decisionId=coreId(runtime),createdAt=coreNow(runtime),inputHash=contentHash(input);
 return {decisionId,status,admissionStatus:status==='PASS'?'ELIGIBLE':status==='FAIL'?'INELIGIBLE':'UNKNOWN',executionStatus:'NOT_DISPATCHED',completionStatus:'NOT_ESTABLISHED',constraints,unknowns,evidenceRefs:constraints.flatMap(c=>c.source),snapshotId:snapshot.snapshotId,snapshot,input,inputHash,revision:0,createdAt,audit:[{event:'EVALUATED',decisionId,revision:0,at:createdAt,inputHash,snapshotId:snapshot.snapshotId}]};
}
