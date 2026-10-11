import { z } from 'zod';
import { constraintSchema, decisionResultSchema, idSchema, type DecisionResult, type SourceSnapshot } from './contracts.js';
import { contentHash } from './evidence.js';
import { evaluate } from './engine.js';
import { validateDecision } from './integrity.js';
import { assertBounded } from './validation.js';
import type { CoreRuntime } from './runtime.js';

/** This envelope is new in the standalone extraction; the missing-reference rule is hardened and explicitly versioned. */
export const ENGINE_VERSION = 'generic-0.3-evidence-v1';
export const EVALUATION_SCHEMA_VERSION = 'arci-evaluation-v1';
export const ruleSetSchema = z.object({
  id: idSchema,
  version: z.string().min(1).max(128),
  constraints: z.array(constraintSchema).max(512),
}).strict();
export type RuleSet = z.infer<typeof ruleSetSchema>;
export const evaluationSchema = z.object({
  schemaVersion: z.string(),
  engineVersion: z.string(),
  ruleset: ruleSetSchema,
  rulesetHash: z.string().regex(/^[a-f0-9]{64}$/),
  decision: decisionResultSchema,
  decisionHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type Evaluation = z.infer<typeof evaluationSchema>;

export function evaluateVersioned(
  input: unknown, snapshot: SourceSnapshot, rules: RuleSet, runtime: CoreRuntime = {},
): Evaluation {
  assertBounded(rules);
  const ruleset = ruleSetSchema.parse(rules);
  const decision = evaluate(input, snapshot, ruleset.constraints, runtime);
  const envelope = {
    schemaVersion: EVALUATION_SCHEMA_VERSION, engineVersion: ENGINE_VERSION,
    ruleset, rulesetHash: contentHash(ruleset), decision, decisionHash: contentHash(decision),
  };
  // An output must fit the same bounded contract accepted by offline replay.
  assertBounded(envelope);
  return evaluationSchema.parse(envelope);
}

/** Integrity checks detect inconsistent claims; hashes are not authentication. */
export function validateEvaluation(raw: unknown): Evaluation {
  assertBounded(raw);
  const record = evaluationSchema.parse(raw);
  if (record.schemaVersion !== EVALUATION_SCHEMA_VERSION) throw new Error('UNSUPPORTED_EVALUATION_VERSION');
  if (record.engineVersion !== ENGINE_VERSION) throw new Error('UNSUPPORTED_ENGINE_VERSION');
  if (contentHash(record.ruleset) !== record.rulesetHash) throw new Error('RULESET_HASH_MISMATCH');
  if (contentHash(record.decision) !== record.decisionHash) throw new Error('DECISION_HASH_MISMATCH');
  const originalRules = record.decision.constraints.map(({id, field, operator, expected, source}) => ({id, field, operator, expected, source}));
  if (contentHash(originalRules) !== contentHash(record.ruleset.constraints)) throw new Error('RULESET_RESULT_MISMATCH');
  validateDecision(record.decision);
  return record;
}

/** Uses only the stored input, snapshot, rules and pinned comparison-engine version. */
export function replayEvaluation(raw: unknown): DecisionResult {
  const record = validateEvaluation(raw);
  const result = evaluate(record.decision.input, record.decision.snapshot, record.ruleset.constraints, {
    id: () => record.decision.decisionId,
    now: () => record.decision.createdAt,
  });
  // Preserve a validated SAVED audit if the host stored a revision-1 DecisionResult.
  return {...result, revision: record.decision.revision, audit: structuredClone(record.decision.audit)};
}
