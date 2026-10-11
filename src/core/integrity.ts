import { decisionResultSchema, type DecisionResult } from './contracts.js';
import { contentHash } from './evidence.js';
import { evaluate } from './engine.js';
import { assertBounded } from './validation.js';
/** Validates stored claims by deterministic reevaluation. Hashes detect corruption, not authorship. */
export function validateDecision(raw:unknown):DecisionResult {
 assertBounded(raw);const r=decisionResultSchema.parse(raw);
 if(r.snapshotId!==r.snapshot.snapshotId)throw new Error('RESULT_SNAPSHOT_MISMATCH');
 if(contentHash(r.input)!==r.inputHash)throw new Error('INPUT_HASH_MISMATCH');
 const expected=evaluate(r.input,r.snapshot,r.constraints.map(({id,field,operator,expected,source})=>({id,field,operator,expected,source})),{id:()=>r.decisionId,now:()=>r.createdAt});
 for(const key of ['status','admissionStatus','constraints','unknowns','evidenceRefs'] as const)if(contentHash(r[key])!==contentHash(expected[key]))throw new Error('RESULT_INVARIANT_FAILED');
 if(r.audit.length!==r.revision+1)throw new Error('RESULT_AUDIT_INVALID');
 for(const [i,a] of r.audit.entries())if(a.event!==(i===0?'EVALUATED':'SAVED')||a.revision!==i||a.decisionId!==r.decisionId||a.inputHash!==r.inputHash||a.snapshotId!==r.snapshotId||(i===0&&a.at!==r.createdAt)||Date.parse(a.at)<Date.parse(r.createdAt))throw new Error('RESULT_AUDIT_INVALID');
 return r;
}
