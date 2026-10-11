import type { Constraint, DecisionInput, DecisionResult, SourceSnapshot } from './contracts.js';
export type ValidationResult<T> = {success:true;data:T}|{success:false;issues:string[]};
export interface ArciDomainAdapter<T,Output=unknown> {
 readonly id:string;
 validateInput(input:unknown):ValidationResult<T>;
 normalizeInput(input:T,sources:SourceSnapshot):DecisionInput;
 buildConstraints(input:DecisionInput,sources:SourceSnapshot):Constraint[];
 interpretResult?(result:DecisionResult):Output;
}
