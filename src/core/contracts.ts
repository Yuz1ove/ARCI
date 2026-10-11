import { z } from 'zod';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export const jsonSchema: z.ZodType<Json> = z.lazy(() => z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(jsonSchema), z.record(z.string(), jsonSchema)]));
export const idSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$/);
export const knowledgeSchema = z.discriminatedUnion('status', [
 z.object({status:z.literal('KNOWN'),value:jsonSchema}).strict(),
 z.object({status:z.literal('UNKNOWN'),reason:z.string().min(1).max(1000)}).strict(),
 z.object({status:z.literal('NOT_APPLICABLE'),reason:z.string().min(1).max(1000)}).strict(),
]);
export type Knowledge = z.infer<typeof knowledgeSchema>;
export type KnowledgeStatus = Knowledge['status'];
export const known = (value: Json): Knowledge => value === null ? unknown('VALUE_MISSING') : {status:'KNOWN',value};
export const unknown = (reason: string): Knowledge => ({status:'UNKNOWN',reason});
export const sourceSchema = z.object({sourceId:idSchema,documentId:idSchema,versionId:z.string().min(1).nullable(),title:z.string().optional(),contentType:z.string().min(1),importedAt:z.string().datetime(),contentHash:z.string().regex(/^[a-f0-9]{64}$/),content:jsonSchema}).strict();
export type SourceDocument = z.infer<typeof sourceSchema>;
export const snapshotSchema = z.object({snapshotId:idSchema,createdAt:z.string().datetime(),sources:z.array(sourceSchema).max(24),contentHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type SourceSnapshot = z.infer<typeof snapshotSchema>;
export const inputSchema = z.object({context:z.record(z.string(),jsonSchema),facts:z.record(idSchema,knowledgeSchema),selectedSources:z.array(idSchema).max(24),parameters:z.record(z.string(),jsonSchema),requestedOperation:z.literal('EVALUATE')}).strict();
export type DecisionInput = z.infer<typeof inputSchema>;
export const evidenceRefSchema = z.object({sourceId:idSchema,versionId:z.string().nullable(),path:z.string().max(500)}).strict();
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;
export const constraintSchema = z.object({id:idSchema,field:idSchema,operator:z.enum(['EQUALS','GREATER_THAN','LESS_THAN','LESS_OR_EQUAL','GREATER_OR_EQUAL','PRESENT']),expected:knowledgeSchema,source:z.array(evidenceRefSchema).max(100)}).strict();
export type Constraint = z.infer<typeof constraintSchema>;
export interface ConstraintResult extends Constraint { actual:Knowledge; status:'PASS'|'FAIL'|'UNKNOWN'|'NOT_APPLICABLE'; reason:string }
export interface AuditEvent { event:'EVALUATED'|'SAVED'|'DELETED'; decisionId:string; revision:number; at:string; inputHash:string; snapshotId:string }
export interface DecisionResult {
 decisionId:string; status:'PASS'|'FAIL'|'UNKNOWN'; admissionStatus:'ELIGIBLE'|'INELIGIBLE'|'UNKNOWN';
 executionStatus:'NOT_DISPATCHED'; completionStatus:'NOT_ESTABLISHED';
 constraints:ConstraintResult[]; unknowns:{field:string;reason:string}[]; evidenceRefs:EvidenceRef[];
 snapshotId:string; snapshot:SourceSnapshot; input:DecisionInput; inputHash:string; revision:number; createdAt:string; audit:AuditEvent[];
}

export const DECISION_SCHEMA_VERSION = 'arci-decision-v1.1';
export const auditEventSchema = z.object({event:z.enum(['EVALUATED','SAVED','DELETED']),decisionId:idSchema,revision:z.number().int().nonnegative(),at:z.string().datetime(),inputHash:z.string().regex(/^[a-f0-9]{64}$/),snapshotId:idSchema}).strict();
export const decisionResultSchema = z.object({decisionId:idSchema,status:z.enum(['PASS','FAIL','UNKNOWN']),admissionStatus:z.enum(['ELIGIBLE','INELIGIBLE','UNKNOWN']),executionStatus:z.literal('NOT_DISPATCHED'),completionStatus:z.literal('NOT_ESTABLISHED'),constraints:z.array(constraintSchema.extend({actual:knowledgeSchema,status:z.enum(['PASS','FAIL','UNKNOWN','NOT_APPLICABLE']),reason:z.string().min(1).max(1000)}).strict()).max(512),unknowns:z.array(z.object({field:idSchema,reason:z.string().min(1).max(1000)}).strict()).max(1024),evidenceRefs:z.array(evidenceRefSchema).max(51200),snapshotId:idSchema,snapshot:snapshotSchema,input:inputSchema,inputHash:z.string().regex(/^[a-f0-9]{64}$/),revision:z.number().int().min(0).max(1),createdAt:z.string().datetime(),audit:z.array(auditEventSchema).min(1).max(2)}).strict();
