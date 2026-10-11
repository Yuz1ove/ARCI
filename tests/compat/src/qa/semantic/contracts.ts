import { z } from 'zod';
import { idSchema, inputSchema, constraintSchema, snapshotSchema, type DecisionResult } from '../core/contracts.js';
export const SEMANTIC_SCHEMA_VERSION = 'arci-semantic-schema-v1.2';
export const SEMANTIC_PROMPT_VERSION = 'arci-semantic-prompt-v1.3';
export const REFERENCE_RULES_VERSION = 'relevance-support-v1';
export const TASK_OPTIONS = {
 relevance: ['RELEVANT','IRRELEVANT','INSUFFICIENT_INFORMATION'],
 support: ['SUPPORTED','PARTIALLY_SUPPORTED','CONTRADICTED','INSUFFICIENT_INFORMATION'],
} as const;
export const limitsSchema = z.object({maxInputBytes:z.number().int().min(1).max(16000),maxOutputBytes:z.number().int().min(128).max(16000),maxOutputTokens:z.number().int().min(128).max(1024),timeoutMs:z.number().int().min(1).max(120000)}).strict();
export const questionSchema = z.object({id:idSchema,task:z.enum(['relevance','support']),content:z.string().trim().min(1).max(2000),options:z.array(z.string()).min(1).max(4)}).strict();
export const semanticRequestSchema = z.object({requestId:idSchema,questions:z.array(questionSchema).min(1).max(4),snapshot:snapshotSchema,rulesVersion:z.literal(REFERENCE_RULES_VERSION),limits:limitsSchema,input:inputSchema,constraints:z.array(constraintSchema).min(1).max(128)}).strict();
export type SemanticRequest = z.infer<typeof semanticRequestSchema>;
const labelSchema=z.enum(['RELEVANT','IRRELEVANT','INSUFFICIENT_INFORMATION','SUPPORTED','PARTIALLY_SUPPORTED','CONTRADICTED']);
export const answerSchema=z.object({questionId:idSchema,label:labelSchema,reason:z.string().trim().min(1).max(500),sourceIds:z.array(idSchema).max(24),quotes:z.array(z.object({sourceId:idSchema,text:z.string().min(1).max(1000)}).strict()).max(8)}).strict();
export const modelOutputSchema=z.object({answers:z.array(answerSchema).min(1).max(4)}).strict();
export const modelIdentitySchema=z.object({name:z.string().min(1),digest:z.string().nullable(),serverVersion:z.string().nullable(),local:z.literal(true)}).strict();
export const usageSchema=z.object({inputTokens:z.number().int().nonnegative().nullable(),outputTokens:z.number().int().nonnegative().nullable()}).strict();
export interface ProviderCall {system:string; user:string; schema:Record<string,unknown>; limits:SemanticRequest['limits']; signal:AbortSignal}
export interface ProviderReply {output:string;model:z.infer<typeof modelIdentitySchema>;usage:z.infer<typeof usageSchema>}
// Injected capability: one bounded completion, no tools, no authority or persistence handle.
export interface SemanticProvider { readonly resourceKey?:string;readonly model:string;generate:(call:ProviderCall)=>Promise<ProviderReply>}
export class SemanticError extends Error {constructor(readonly code:string){super(code);this.name='SemanticError';}}
const dispositionSchema=z.enum(['ADVISORY_AVAILABLE','NEEDS_INFORMATION','REVIEW_REQUIRED','NO_VALID_JUDGMENT']);
export const judgmentMetadataSchema=z.object({
 requestId:idSchema,questions:z.array(questionSchema),limits:limitsSchema,
 versions:z.object({prompt:z.enum(['arci-semantic-prompt-v1','arci-semantic-prompt-v1.1','arci-semantic-prompt-v1.2',SEMANTIC_PROMPT_VERSION]),schema:z.enum(['arci-semantic-schema-v1','arci-semantic-schema-v1.1',SEMANTIC_SCHEMA_VERSION]),rules:z.literal(REFERENCE_RULES_VERSION)}).strict(),
 status:z.enum(['VALID','NOT_RUN','DISABLED','UNAVAILABLE','TIMEOUT','INVALID_OUTPUT']),reason:z.string(),
 requestedModel:z.string().nullable(),model:modelIdentitySchema.nullable(),usage:usageSchema,latencyMs:z.number().nonnegative(),
 results:z.array(z.object({questionId:idSchema,recommendation:answerSchema.nullable(),disposition:dispositionSchema,reason:z.string(),confidence:z.null(),calibration:z.literal('NOT_CALIBRATED')}).strict()),
}).strict();
export type JudgmentMetadata=z.infer<typeof judgmentMetadataSchema>;
export type SemanticJudgment=JudgmentMetadata & {decision:DecisionResult};
