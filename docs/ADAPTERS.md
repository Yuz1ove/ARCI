# 如何接入其他主題

應用透過 `@arci/core` 匯入公開 contracts 與函式。你不需要改引擎，也不需要競賽網站。

1. 實作 `ArciDomainAdapter<T>.validateInput(raw)`：回傳 `{success:true,data}` 或 `{success:false,issues}`，拒絕錯誤型別。
2. `normalizeInput(data, snapshot)`：產生 DecisionInput。缺少事實用 `unknown`；不要把 unknown 轉成預設 true 或 0。
3. `buildConstraints(input, snapshot)`：從 host 指定的來源／設定產生規則，為規則提供有效 EvidenceRef；缺 policy 應 UNKNOWN。
4. host 建立 SourceSnapshot、規則集 ID／版本，呼叫 `evaluateVersioned`。adapter 不取得執行權。
5. 保存完整封套以便 `replayEvaluation`，並由 host 管理可信來源、簽章、規則版本不可變性、存取控制與輸入驗證。

可直接閱讀 [inventory adapter](../examples/adapters/inventory.mjs)、[release adapter](../examples/adapters/release.mjs) 與共用 [runAdapter](../examples/run-adapter.mjs)。兩個 adapter 的程式與門檻都在應用範例層，Core 沒有 if inventory／release 的主題分支。JSDoc 使用公開 ArciDomainAdapter 型別，`npm run typecheck` 也檢查範例。

| adapter | 狀態 | 邊界 |
|---|---|---|
| inventory／release | 本輪新增、合成資料、可執行 | 純資料正規化及规则生成 |
| file-store | 既有候選抽離、已驗證 | Node 本機檔案，顯式路徑／revision |
| ArciDomainAdapter | 介面 | 不自動發現、不注入全域、不提供 server |
| 模型／Ollama | 本套件未提供 | 歷史候選有實作與測試；如接入，僅生成 advisory，host 不可讓它覆寫確定性判斷 |
| PostgreSQL／provider／通訊 | 本套件未提供 | 留在通訊／V2.1 研究來源，沒有更名假裝通用化 |

Presidential／SEA 尚未接入此套件。遷移時要自行將其領域輸入映射到 Knowledge 與 Constraint，保留原候選評分／模擬流程為外部邏輯；不能直接把不相容的 V2／V3 record 當成這裡的 DecisionResult。
