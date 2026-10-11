# 公開 API 與版本契約

所有執行入口是 ESM，附 TypeScript declarations。深層路徑沒有 exports，不屬支援 API。

| 函式／型別 | 用法 |
|---|---|
| `known(value)`、`unknown(reason)` | 建立 Knowledge；null 轉 UNKNOWN；false／0 保持已知 |
| `createSource(input)` | 驗證資料並計算內容 hash；呼叫者指定來源 ID、documentId、versionId 與 importedAt |
| `createSnapshot(sources, runtime?)` | 複製來源、檢查 hash 與重複 sourceId；最多 24 份 |
| `evaluate(input, snapshot, constraints, runtime?)` | 回傳 DecisionResult；相容低階比較 API |
| `evaluateVersioned(input, snapshot, ruleset, runtime?)` | 回傳 Evaluation；新接入建議使用，有規則／引擎版本 |
| `validateDecision(raw)` | 嚴格驗證低階結果與稽核，按目前引擎重算；不是跨版本 replay |
| `validateEvaluation(raw)` | 驗證版本、來源、輸入、規則、結果 hash 及一致性 |
| `replayEvaluation(raw)` | 只依封套歷史資料重放，回傳 DecisionResult |
| `contentHash(value)` | canonical JSON 的 SHA-256，含資料邊界檢查 |
| `ArciDomainAdapter<T>` | 外部 adapter 介面，本身不是執行器 |

`runtime` 可注入 `{id: () => string, now: () => ISODateString}`。一般呼叫使用 crypto.randomUUID 與目前時間；**判斷邏輯確定性不代表每次新呼叫的 ID／時間相同**。版本重放使用原決策 ID／時間，可取得相同結構化結果。

`DecisionInput` 包含 `context`、`facts`、`selectedSources`、`parameters`、`requestedOperation: 'EVALUATE'`。額外頂層欄位拒絕。`context` 中的模型建議是惰性資料，不會成為 authority。

`Constraint` 包含 `id`、`field`、`operator`、`expected: Knowledge`、`source: EvidenceRef[]`。支援 EQUALS、GREATER_THAN、LESS_THAN、LESS_OR_EQUAL、GREATER_OR_EQUAL、PRESENT。大小比較只接受同型的 number 或 string；string 依 JS 字串順序，不解析時間、單位或自然語言。PRESENT 仍要求有效證據與已知 expected。NOT_APPLICABLE 必須明示，全部不適用時整体 UNKNOWN。

`EvidenceRef` 是 `{sourceId, versionId, path}`；path 使用點分隔屬性，空字串引用整份內容。引用確認只驗證存在，不保證 expected 等於來源中的值；這是 host／adapter 的規則治理責任。

## 版本與重放

- 套件 0.3.0；新封套 `arci-evaluation-v1`；引擎 `generic-0.3-evidence-v1`。
- 低階 DecisionResult 結構延續 `arci-decision-v1.1`；資料結構版本與比較引擎版本是不同概念。
- RuleSet 為 `{id, version, constraints}`；保存時包含完整規則內容與 hash，不只保存版本字串。
- 重放拒絕不支援的 schema／engine version，不用目前 policy 替代舊 policy。
- 舊 DecisionResult 沒有規則版本，不能冒充新版 Evaluation。旧版無證據引用 PASS 會被本輪驗證拒絕，必須保留原紀錄供人工處理，不自動遷移。
- 雜湊是完整性檢查，不能證明作者或真實性；有能力重寫全部內容及 hash 的攻擊者仍可另造自洽紀錄。

## 錯誤契約

格式錯誤以 ZodError 拋出，可透過公開 `inputSchema.safeParse`、`ruleSetSchema.safeParse` 等預先檢查；不要依賴 Zod 英文錯誤訊息。引擎／保存不變量以 Error 拋出穩定 message code。業務判斷 FAIL／UNKNOWN 是正常結果，並不是 exception。

| 分類 | 代表 code／結果 |
|---|---|
| 證據不足 | UNKNOWN：FACT_MISSING、EVIDENCE_REFERENCE_MISSING、EVIDENCE_REFERENCE_UNRESOLVED、SOURCE_VERSION_UNKNOWN |
| 輸入邊界 | INVALID_JSON_VALUE、INVALID_OBJECT、UNSAFE_KEY、DEPTH_LIMIT、SIZE_LIMIT |
| 來源一致性 | SOURCE_SELECTION_MISMATCH、DUPLICATE_SOURCE_VERSION、SOURCE_HASH_MISMATCH、SNAPSHOT_HASH_MISMATCH、DUPLICATE_CONSTRAINT |
| 歷史／版本 | UNSUPPORTED_ENGINE_VERSION、UNSUPPORTED_EVALUATION_VERSION、RULESET_HASH_MISMATCH、DECISION_HASH_MISMATCH、RULESET_RESULT_MISMATCH、RESULT_INVARIANT_FAILED、RESULT_AUDIT_INVALID |
| 保存 | REVISION_CONFLICT、IMMUTABLE_DECISION、RECORD_NOT_FOUND、STORE_WRITER_LOCKED、STORE_SIZE_LIMIT、STORE_COUNT_LIMIT、DURABILITY_UNCONFIRMED |

所有 JSON 入口最多 1,000,000 UTF-8 bytes、深度 16；versioned envelope 也受此總量限制。規則最多 512，來源最多 24；大資料由外部 adapter 精選成 bounded input，不在核心隱式查資料库。

## 選用檔案保存

```js
import {DecisionRepository} from '@arci/core/adapters/file-store';
// 此片段需 host 提供路徑與先前取得的 evaluation；不是預設示範。
const repository = new DecisionRepository('/your/application/decisions.json');
repository.save({namespace: 'demo', domainId: 'inventory', workspaceId: 'one'}, evaluation.decision, 0);
```

這個來源 adapter 保存 **DecisionResult**，不是新版 Evaluation 封套。若需要版本重放，host 應另保存完整 `evaluation` JSON；不可只保存 ID 後從最新規則重建。constructor 才會讀取指定檔案，import 不讀寫；save/delete/archive 才會寫入。32 MiB、512 決策、4096 稽核限制。詳見 [限制與保存邊界](LIMITATIONS.md)。
