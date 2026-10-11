import { z } from 'zod';
import { domainIdSchema } from '../domain/ids.js';
export const qaRequestSchema = z.object({ request_id: domainIdSchema, session_id: z.string().uuid(), question: z.string().trim().min(1).max(4000), scope: z.literal('single_turn_explanation') }).strict();
export type QaRequest = z.infer<typeof qaRequestSchema>;
export const checkSchema = z.object({ gate: z.string(), passed: z.boolean() }).strict();
const common = { request_id: domainIdSchema, checks: z.array(checkSchema), provider: z.string().nullable(), requested_model: z.string().nullable(), response_reported_model: z.string().nullable() };
export const qaResultSchema = z.discriminatedUnion('status', [
  z.object({ ...common, status: z.literal('success'), answer: z.string().trim().min(1).max(20000), source: z.literal('模型生成；未進行外部資料查證') }).strict(),
  z.object({ ...common, status: z.literal('failure'), error: z.object({ code: z.string(), message: z.string() }).strict() }).strict(),
]);
export type QaResult = z.infer<typeof qaResultSchema>;
export type Check = z.infer<typeof checkSchema>;
export function failure(request_id: string, code: string, message: string, checks: Check[] = []): QaResult {
  return { request_id, status: 'failure', error: { code, message }, checks, provider: null, requested_model: null, response_reported_model: null };
}
