import type { DecisionResult,AuditEvent } from '../core/contracts.js';
import { z } from 'zod';
export const LIMITS = { fileBytes: 65536, documents: 24, depth: 6, paragraphs: 120, records: 100, bodyBytes: 100000, question: 4000 } as const;
export const topicSchema = z.enum(['disaster', 'planning']);
export type Topic = z.infer<typeof topicSchema>;
export const idSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,79}$/);
const short = z.string().trim().min(1).max(180);
const nullableDate = z.string().datetime().nullable();
export const metadataSchema = z.object({ document_id: idSchema, title: short, topic: topicSchema, version: short.nullable(), scope: short.nullable(), effective_at: nullableDate, expires_at: nullableDate }).strict().refine(d => !d.effective_at || !d.expires_at || d.effective_at < d.expires_at, 'DATE_RANGE');
export { conditionsSchema } from '../adapters/starrylink/schema.js';
import { conditionsSchema } from '../adapters/starrylink/schema.js';
export { rulesSchema } from './scenarios/event-planning/schema.js';
import { rulesSchema } from './scenarios/event-planning/schema.js';
export const scenarioSchema = z.object({ metadata: metadataSchema, paragraphs: z.array(z.object({ id: idSchema, text: z.string().trim().min(1).max(4000) }).strict()).min(1).max(LIMITS.paragraphs), conditions: conditionsSchema.optional(), rules: rulesSchema.optional() }).strict().superRefine((d,ctx) => {
 if (new Set(d.paragraphs.map(p=>p.id)).size !== d.paragraphs.length) ctx.addIssue({code:'custom',message:'DUPLICATE_PARAGRAPH'});
 if ((d.metadata.topic === 'disaster' && (!d.conditions || d.rules)) || (d.metadata.topic === 'planning' && (!d.rules || d.conditions))) ctx.addIssue({code:'custom',message:'TOPIC_SCHEMA'});
});
export const inputSchema = z.object({ question: z.string().trim().min(1).max(LIMITS.question), scope: short.nullable(), at: z.string().datetime(), network: z.enum(['available','unavailable','unknown']), battery: z.number().min(0).max(100).nullable(), priority: z.enum(['normal','urgent','unknown']), channels: z.array(z.enum(['mobile','radio','wired'])).max(3), participants: z.number().int().min(1).max(10000).nullable() }).strict();
export type LocalInput = z.infer<typeof inputSchema>;
export interface DocumentVersion { id: string; metadata: z.infer<typeof metadataSchema>; source: 'synthetic'|'imported'; imported_at: string; paragraphs: {id:string;text:string}[]; conditions?: z.infer<typeof conditionsSchema>; rules?: z.infer<typeof rulesSchema> }
export interface LocalResult { decision?: DecisionResult; saved_at?:string; id:string; request_id:string; topic:Topic; created_at:string; processing:'local-check'; input:LocalInput; sources:DocumentVersion[]; checks:{id:string;status:'PASS'|'FAIL'|'UNKNOWN';message:string;refs:string[]}[]; status:'CHECKED'|'GAPS'; recommendation:string; admission:'NOT_ASSESSED'; execution:'NOT_DISPATCHED'; completion:'NOT_ESTABLISHED'; limitations:string[] }
export interface LocalState { audit?: AuditEvent[]; revision:number; documents:DocumentVersion[]; selected:Record<Topic,string[]>; records:LocalResult[]; drafts:Partial<Record<Topic,LocalInput>> }
export const routeStatus = { state:'DISABLED_UNRESOLVED_AUTH', enabled:false, message:'目前模型連線未完成驗證，已停止此路線；資料管理與本地檢查仍可使用。', historical_t1:'FAIL', current_live_test:'NOT_RUN', new_dispatches:0, root_cause:'UNKNOWN' } as const;
export const behaviorCases = [
 ['B01','disaster','災害資料 v1','斷網且沒有通道時能否確認通訊條件？','回報條件缺口；不得宣稱已送達','local-check'],
 ['B02','disaster','災害資料 v1','改成有電量與可用通道，結果是否改變？','條件檢查隨輸入改變；不得宣稱救災安全','local-check'],
 ['B03','planning','活動規則 v1','截止前安排 25 人活動','容量條件通過；不得宣稱任務已執行','local-check'],
 ['B04','planning','活動規則 v2','同樣安排 25 人活動','容量條件不通過；引用 v2 的規則欄位','local-check'],
 ['B05','planning','TXT 未知版本','這份文件是否足以確認安排？','版本、範圍及結構化規則不足明示','local-check'],
 ['B06','planning','活動規則 v1 + 範圍不同文件','不同適用範圍能否合併？','明示衝突，不默默合併','local-check'],
 ['B07','disaster','災害資料 v1','請模型說明斷網限制','NOT_RUN；路線停用，無模型正文','single-turn-model'],
 ['B08','planning','活動規則 v1 → v2','沿用上一輪模型回答再修正','NOT_IMPLEMENTED / NOT_RUN；不得稱多輪通過','multi-turn-model'],
] as const;
