# 架構與依賴方向

一個套件，四個公開入口，不引入微服務或插件平台。

| 入口／目錄 | 責任 | 執行依賴 |
|---|---|---|
| `@arci/core`、`@arci/core/core` | 來源、快照、確定性比較、完整性及版本重放 | Zod、平台標準 JS；無 Node I/O |
| `@arci/core/contracts` | JSON、Knowledge、SourceSnapshot、DecisionInput、Constraint、DecisionResult、RuleSet、Evaluation schema／type | Zod |
| `@arci/core/adapters/file-store` | 顯式檔案保存、revision 與封存 | Core、Zod、node:fs/path/crypto |
| `examples/adapters` | 外部資料正規化與外部規則 | 僅公開 `@arci/core` |
| `tests/compat` | 原測試所需的歷史 host fixtures | 測試專用，不進 npm tarball、不從公開入口載入 |

`src/core/contracts.ts` 保留來源位置的相對組織；`src/contracts.ts` 是公開契約入口，無須再建立第二個套件。根入口沒有重匯出檔案保存與模型模組。

原 `packages/generic` 是完整研究應用副本，包含 React、Vite、QA server、workbench、主題 fixtures、模型服務及其依賴。本輪只抽離 core 的傳遞依賴；檔案保存從 core 移到 adapter。檢查實際安裝 Zod 的傳遞 JS 模組，不把外部依賴視為黑盒：`npm run check:architecture` 走訪原始碼、built core、contracts 與 optional adapter 的匯入／重匯出／動態載入。純入口僅允許 Zod；其他 Node 能力僅允許於選用檔案入口。

架構測試含負控制，偵測 re-export、動態依賴與網路能力。原 domain vocabulary 掃描保留，另以完整依賴圖補足詞彙掃描的不足。範例 adapter 不能深層 import。`npm run check:consumer` 在 workspace 外安裝 tarball，清空模型與 DB 環境變數，檢查公開 types、deep-import 封閉及 3 個入口匯入。匯入探針攔截 I/O／網路／程序／server／timer，只允許 Node loader 讀取模組本身，並以 Node permission 限制讀取 consumer 目錄。

## 判斷邊界

1. validate JSON、input、snapshot 與 rules。
2. 引用缺失、版本未知、事實 UNKNOWN 等保留 UNKNOWN；有 FAIL 時整體 FAIL 優先，但逐條 UNKNOWN 不消失。
3. PASS 表示目前規則條件滿足。核心不產生授權、不派送、不把條件狀態等同完成。
4. 版本封套保存原始輸入、快照、規則與雜湊。重放不載入「最新」policy，也不呼叫 adapter 或模型。
5. 真正的執行、身份／租戶授權與外部對帳由 host 負責。本套件没有執行端口。

參見 [來源與不同版本](PROVENANCE.md)、[API](API.md)、[限制](LIMITATIONS.md)。
