import {it,expect} from 'vitest';
import {createSource,createSnapshot,known,unknown,evaluateVersioned,replayEvaluation,validateEvaluation,contentHash,ENGINE_VERSION,type RuleSet} from '../src/index.js';
const runtime={id:()=> 'fixed-decision',now:()=> '2026-01-01T00:00:00.000Z'};
function fixture(){
 const snapshot=createSnapshot([createSource({sourceId:'policy-v1',documentId:'policy',versionId:'1',contentType:'application/json',importedAt:runtime.now(),content:{limit:5}})],{...runtime,id:()=> 'snapshot-v1'});
 const input={context:{},facts:{count:known(3)},selectedSources:['policy-v1'],parameters:{},requestedOperation:'EVALUATE' as const};
 const rules:RuleSet={id:'threshold',version:'1',constraints:[{id:'maximum',field:'count',operator:'LESS_OR_EQUAL',expected:known(5),source:[{sourceId:'policy-v1',versionId:'1',path:'limit'}]}]};
 return {snapshot,input,rules};
}
it('pins input, rules, sources and engine version for offline exact replay',()=>{
 const {snapshot,input,rules}=fixture();const saved=evaluateVersioned(input,snapshot,rules,runtime);
 expect(saved.engineVersion).toBe(ENGINE_VERSION);expect(saved.decision.status).toBe('PASS');
 input.facts.count=known(100);rules.version='2';rules.constraints[0]!.expected=known(0);snapshot.sources[0]!.content={limit:0};
 expect(replayEvaluation(JSON.parse(JSON.stringify(saved)))).toEqual(saved.decision);
 expect(saved.ruleset.version).toBe('1');expect(saved.decision.snapshot.sources[0]!.content).toEqual({limit:5});
});
it.each(['PASS','FAIL','UNKNOWN'] as const)('replays %s without granting execution',status=>{
 const f=fixture();f.input.facts.count=status==='PASS'?known(3):status==='FAIL'?known(8):unknown('NOT_OBSERVED');
 const r=evaluateVersioned(f.input,f.snapshot,f.rules,runtime);expect(r.decision.status).toBe(status);
 expect(replayEvaluation(r)).toEqual(r.decision);expect(r.decision.executionStatus).toBe('NOT_DISPATCHED');expect(r.decision.completionStatus).toBe('NOT_ESTABLISHED');
});
it('rejects unknown engine and contract versions instead of replaying under latest rules',()=>{
 const f=fixture(),r=evaluateVersioned(f.input,f.snapshot,f.rules,runtime);
 expect(()=>replayEvaluation({...r,engineVersion:'future'})).toThrow('UNSUPPORTED_ENGINE_VERSION');
 expect(()=>replayEvaluation({...r,schemaVersion:'future'})).toThrow('UNSUPPORTED_EVALUATION_VERSION');
});
it('detects rules and result tampering even when result still parses',()=>{
 const f=fixture(),r=evaluateVersioned(f.input,f.snapshot,f.rules,runtime),bad=structuredClone(r);
 bad.ruleset.version='2';expect(()=>validateEvaluation(bad)).toThrow('RULESET_HASH_MISMATCH');
 const badResult=structuredClone(r);badResult.decision.status='FAIL';expect(()=>validateEvaluation(badResult)).toThrow('DECISION_HASH_MISMATCH');
 const mismatched=structuredClone(r);mismatched.ruleset.constraints[0]!.expected=known(99);mismatched.rulesetHash=contentHash(mismatched.ruleset);
 expect(()=>validateEvaluation(mismatched)).toThrow('RULESET_RESULT_MISMATCH');
});
it('advisory/model-shaped input cannot override deterministic FAIL or claim completion',()=>{
 const f=fixture();f.input.facts.count=known(99);const raw={...f.input,context:{recommendation:{status:'PASS',executionStatus:'DISPATCHED',completionStatus:'COMPLETE'}}};
 expect(evaluateVersioned(raw,f.snapshot,f.rules,runtime).decision).toMatchObject({status:'FAIL',executionStatus:'NOT_DISPATCHED',completionStatus:'NOT_ESTABLISHED'});
 expect(()=>evaluateVersioned({...raw,authorization:true},f.snapshot,f.rules)).toThrow();
});
it('exposes strict rule schema and rejects unversioned rulesets',()=>{
 const f=fixture();expect(()=>evaluateVersioned(f.input,f.snapshot,{...f.rules,version:''})).toThrow();
});
