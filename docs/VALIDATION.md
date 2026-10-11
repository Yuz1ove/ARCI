# 驗證紀錄（2026-10-11）

本輪原始命令與錯誤完整輸出留在本機隔離 audit；公開只保存去除主機路徑的驗證摘要，沒有原專案執行日誌或私人資料。

環境：macOS arm64，Node 24.19.0、npm 10.9.4、TypeScript 5.9.3、Vitest 3.2.7、Zod 4.4.3。每次 Vitest 最多 1 worker。原研究、主題專案及前次候選均以唯讀方式查核。

## 來源基線，先於抽離

`baseline-generic` 是 2026-10-03 generic manifest 核對後的 36 個必要檔案副本，測試原始 bytes 不變。

| 命令／範圍 | 退出碼 | 結果 |
|---|---:|---|
| `npm install --ignore-scripts --no-audit --no-fund`，固定精確依賴版本 | 0 | 安裝 55 packages |
| `npm test -- --reporter=json`，原 `tests/qa/core` 4 檔 | 0 | 35 passed／0 failed |

這是本輪跑出的數字，不沿用 2026-10-09 的 113／114 或擴大回歸數字。[逐項基線摘要](evidence/baseline-tests.json)

## 不同版本，獨立驗證

2026-10-03 **legacy** 候選只複製 69 個必要程式／測試檔，與 generic 套件分開執行。

| 原測試檔 | 本輪結果 |
|---|---:|
| `tests/core-v2/closed-loop.test.ts` | 5 passed |
| `tests/core-v2-v21/production-recovery.test.ts` | 25 passed |
| `tests/verification/verification.test.ts` | 8 passed |
| `tests/foundations/async-boundary.test.ts` | 3 passed |
| `tests/provider/scenarios.test.ts` | 7 passed，含 54 canonical scenarios 的十輪 replay assertion |

首次合併指令退出 1：前四檔 41 passed，provider 7 failed，因沙箱無法開啟本機模擬 server。只針對 provider 在允許 loopback 的隔離副本重跑，退出 0，7 passed。沒有放寬 assertion、接觸真實 provider 或進行現場派送。[首次摘要](evidence/variant-tests.json)／[provider 重跑](evidence/provider-tests-retry.json)

這些是其他候選的結果，不算入公開 @arci/core 測試總數。不代表已完成 PostgreSQL 故障、所有 execution ownership 路徑或全部研究 suite。

## 本輪新增／修補反例

- versioned test 先因公開 API 尚不存在而失敗；實作後 8 項通過。
- 空 evidence references 的反例先得到 PASS，斷言 UNKNOWN 失敗；加入明確 UNKNOWN 規則後通過。引擎版本為 `generic-0.3-evidence-v1`。
- 完整回歸曾發現 T3 歷史 adapter 隱含規則無引用；修正 adapter 為既有快照欄位補上 refs，原 PASS assertion 保持，不把測試改成 UNKNOWN。
- 獨立審查新增三項反例：25 個來源在 createSnapshot 被接受、歷史重放依赖當下 crypto、未來 createdAt 導致 save 寫成無法讀回的 audit。三項均先失敗再修補，分別補即時 schema、歷史 runtime 與 SAVED audit 驗證。
- import 探針初次因 macOS `/var` 與 `/private/var` 真實路徑，以及 Node loader 正常讀取模組被攔截而失敗；改用 canonical path、精確區分 loader 讀取與應用 I/O。檔案／HTTP 負控制仍需失敗，未開放應用 I/O。
- 依賴圖首次把 Zod 已發行 JS 當成 TS 路徑而失敗；修正解析規則，實際繼續走訪 Zod JS 傳遞依賴，沒有忽略它。

## 獨立套件驗收

乾淨 `npm ci --offline --ignore-scripts --no-audit --no-fund`（先前正常下載的 npm 快取）退出 0。`npm run verify` 退出 0，依序完成：

| 項目 | 本輪結果 |
|---|---|
| typecheck／build | 各 exit 0；含 JS adapter 型別檢查 |
| `npm test` | **49 passed／0 failed，9 files**；含全部 35 項來源斷言 |
| architecture | core／contracts 各走訪 89 modules（含實裝 Zod）；執行依賴僅 Zod |
| README／docs | 相對連結有效、npm scripts 存在、README JS 與 minimal 檔完全一致並實際執行 |
| minimal／inventory／release | 各 exit 0；兩情境均 PASS／FAIL／UNKNOWN，全部未派送／未完成 |
| tarball／獨立 consumer | workspace 外 npm 安裝，非 symlink，公開 types／deep-import 邊界通過 |
| import probe | 3 入口、0 次應用 I/O；檔案／HTTP 負控制有效，Node loader 讀模組另計 |

[本輪命令、退出碼與程式雜湊](evidence/validation.json)。

遠端推送後將從公開 URL 重新 clone 驗證，結果另記，以上目前是本機獨立副本驗收。

## 未執行範圍

原研究全部歷史 suite、真實 PostgreSQL／外部 provider／LLM、真實個案或現場通訊、Presidential／SEA 全站測試與遷移均未執行。macOS 之外平台的 CI 狀態以 GitHub Actions 實際結果為準，不把待跑 workflow 當成通過。
