# 驗證紀錄（2026-10-11）

本輪原始命令與錯誤完整輸出留在本機隔離 audit；公開只保存去除主機路徑的驗證摘要，沒有原專案執行日誌或私人資料。

環境：macOS arm64，Node 24.19.0、npm 10.9.4、TypeScript 5.9.3、Zod 4.4.3。來源基線與最初本機驗收使用 Vitest 3.2.7；最終公開 clone 使用修補後的 Vitest 4.1.11（Vite 7.3.7 僅為開發依賴）。每次 Vitest 最多 1 worker。原研究、主題專案及前次候選均以唯讀方式查核。

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

最終在公開 URL 的全新 clone、全新 npm cache 執行 `npm ci --ignore-scripts`，退出 0，安裝 46 packages，當日 audit 為 0 項漏洞。`npm run verify` 退出 0，先建置公開入口，再檢查型別與以下項目：

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

## 公開發布後重新 clone

- 目標：[Yuz1ove/ARCI](https://github.com/Yuz1ove/ARCI)，`main` 與 `codex/independent-core`；保留 `ea978fee` 的公開歷史，無 force push。
- 完整驗收的程式 commit：[6105f4da503d7692f48b0ef34549bb4201cfe3f8](https://github.com/Yuz1ove/ARCI/commit/6105f4da503d7692f48b0ef34549bb4201cfe3f8)。後續驗收紀錄提交只更新文件，不改變已驗證程式雜湊。
- 無憑證 `git clone`：exit 0；`npm ci --ignore-scripts`：exit 0；`npm run verify`：exit 0。所有程式檔與發布副本的雜湊相同。
- macOS 公開 clone：49 passed／9 files；外部 consumer、公開型別、兩個情境、0 應用 import I/O 全數通過。
- [Ubuntu GitHub Actions](https://github.com/Yuz1ove/ARCI/actions/runs/38104056618)：success，Node 24.21.0／npm 10.9.4，49 passed／9 files，包含相同完整驗收。

### 發布驗證實際找出的問題

首次 [798e448 的 CI](https://github.com/Yuz1ove/ARCI/actions/runs/38103833526) 與公開 clone 退出 2：`verify` 先 typecheck、後 build，乾淨 clone 找不到 package exports 對應的 dist 型別。已改為先 build，再 typecheck；沒有修改型別要求、測試斷言或忽略範圍。

接著 consumer 在乾淨 cache 出現 `ENOTCACHED`：npm ci 的 tarball 快取不保證包含 registry metadata。改用 prefer-offline 安裝，缺少依賴資訊時正常讀取 npm registry；範例和核心 import 的離線／無 I/O 檢查維持原樣。安裝不是核心執行的一部分。

乾淨安裝另回報 Vitest 3 的開發依賴警示，包括 [mocker](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) 與 [tinypool](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3)。更新到 Vitest 4.1.11，固定相容的 Vite 7.3.7；npm 10 在未固定的選用 peer 解析曾出現 edgesOut 錯誤，固定後乾淨安裝成功。最終當日 npm audit 為 0，49 項既有斷言全部維持。核心唯一執行依賴仍是 Zod。

## 未執行範圍

原研究全部歷史 suite、真實 PostgreSQL／外部 provider／LLM、真實個案或現場通訊、Presidential／SEA 全站測試與遷移均未執行。macOS arm64 與 Ubuntu CI 已通過；Windows、NFS 與硬體斷電行為仍未資格化。
