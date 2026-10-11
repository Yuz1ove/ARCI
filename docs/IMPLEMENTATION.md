# 獨立核心抽離設計與驗收計畫（2026-10-11）

使用者已指定完整目標、發布入口與驗收條件。本輪在既有 ARCI main 的獨立 clone 作業，保留遠端歷史，原研究與主題專案唯讀。由本 session 直接執行；不以額外設計審批延遲已授權工作。

## 設計決策

以經 manifest 核對的 2026-10-03 generic 判斷核心為基線。單一 @arci/core 套件：src/core 保存原引擎、contracts 公開 schema／types，adapters/file-store 提供選用 Node 保存。根入口純匯出判斷能力，無 React、Vite、provider、主題 UI、資料庫或伺服器。原比較運算與 FAIL 優先順序不改；另明示修補空證據引用、快照容量、重放 runtime 與保存時鐘邊界；新版本封套提供規則 ID／版本／雜湊與明確版本重放，與原 DecisionResult 分開。

方案取捨：整批發布前次 packages/generic 仍會帶入 UI 與主題；採 Core V2 會引入不同的候選評分、通訊 policy 與執行語意。選用已有純入口、UNKNOWN 與完整性驗證的 generic 核心，其他候選只記錄来源和差異。

## 工作與驗收

- [x] 來源核對：四庫遠端權限、分支、commit，本機 dirty 與候選 manifest；來源測試保持 assertions。
- [x] 單一可打包核心：公開 exports、schema、錯誤契約；搬移後核心及保存測試。
- [x] 版本封套：先測規則版本固定、歷史重放與篡改拒絕，再加最小實作。
- [x] 範例：合成庫存門檻與軟體發布條件，共用引擎，adapter 僅使用公開 API。
- [x] 隔離驗證：傳遞 import、import 時無 I/O、npm pack／外部 consumer／型別／失敗路徑。
- [x] 文件：繁中 README、架構、API、來源映射、限制與本輪命令／退出碼。
- [x] 發布：安全檢查、noreply 新 commit、非強制推送至既有 main，再由公開 URL clone 驗證。

## Review focus

來源未知與零／false 不混淆；FAIL 與 UNKNOWN 同時存在的優先順序不變；規則更新不影響歷史重放；偽造 PASS／執行權與 hash 篡改拒絕；外部 consumer 不使用來源相對路徑。檔案保存保持 revision、殘留鎖、失敗與封存界線。完整原研究 suite、真實模型、資料庫與現場部署不在本輪驗收。
