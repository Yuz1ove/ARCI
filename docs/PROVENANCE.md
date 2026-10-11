# 來源盤點與抽離沿革

盤點日期：2026-10-11（Asia/Taipei）。以下來自 GitHub API／git refs、Git objects、實際程式及本機 dirty tree，不以 README 的完成敘述推定功能存在。

## 四個 repository 與權限

登入帳號 Yuz1ove；四庫均回報 admin／push／pull 權限。未修改任何 repository 可見性。

| repository | 可見性／預設分支 | 本輪開始時遠端 commit | 本機狀態與判斷 |
|---|---|---|---|
| [Yuz1ove/ARCI](https://github.com/Yuz1ove/ARCI) | public／main | `ea978fee824d6261563c4fa94d688aa7c31e4d4b` | 只有 README；遠端只一分支；protected=false、rulesets=[] |
| [Autonomous-Resilient-Communication-Intelligence](https://github.com/Yuz1ove/Autonomous-Resilient-Communication-Intelligence) | private／main | `bd4f32b140286109d8d582d40ed6d8003e91dbe3` | 本機 HEAD `ec7fa2e45d5827c6da315c310b2ca9da5e3e14c0`；ahead 1／behind 30；32 個 modified 與 216 個 untracked status entries（含目錄，非檔案總數） |
| [ARCI-Presidential](https://github.com/Yuz1ove/ARCI-Presidential) | public／main | `e7e8821110824151a41ac9e49b12e67483c377a4` | 本機相同 HEAD，6 個 UI／測試 modified；原狀保留 |
| [ARCI-SEA](https://github.com/Yuz1ove/ARCI-SEA) | public／main | `1388b19824604807a6d38d714dafcdcd7d605fe6` | 本機相同 HEAD，5 個 modified 與 7 個 untracked status entries；V4 尚有未提交程式 |

研究主庫另有 13 個遠端研究分支（Layer、R2J、resource-plane、safety、ironman）；公開 ARCI、Presidential、SEA 本輪初查各僅 main。研究庫本機 `codex/arci-core-decoupling-commit-01` 是獨立 worktree，commit `40dfe289ac2f81687a0859b70a94dd4aee58b45a`，不在已列出的遠端分支中。

GitHub 舊 README 曾引用 packages/generic、packages/legacy 等，對應內容找到於前次本機 `arci-publication/repo`，本機 HEAD `a5ffed9109bfe21afe9d9672830a7e12a520ba18`（前一筆 `d9b7e43`）。其完整來源未成為公開 ARCI 的已連結分支／commit；前次 metadata／圖片發布處理並未完成。這次遵照保留既有公開歷史的要求，以 `ea978fee` 為父系建立新 commit，不帶入前次本機整套 history，不 force push。新增 commit 使用 GitHub noreply 身分。

## 真正核心與不同候選

| 名稱／原始位置 | 實際程式與邊界 | 本輪採用 |
|---|---|---|
| 通訊核心：研究庫 `src/domain`、`src/routing`、`src/execution`、`src/verification`、`src/runtime`、`src/provider` | 路由、模擬派送、ACK 驗證、provider callback／correlation／reconciliation；依赖通訊模型、policy 與合成拓樸 | 不纳入 generic 預設入口；保留來源、分開測試 |
| Core V2：`src/core-v2`，研究 commit `20de125`，後續研究 main 可找到 | WorldState／Candidate／PolicyProfile，風險／模擬／評分／governance／execution port 閉環；內建候選與權重不是通用 constraint 的同義詞 | 不混接；本輪在 legacy 候選獨立重跑 closed-loop |
| Core V2.1：本機 `src/core-v2/production-*`、`approval.ts`、`integrity.ts` 等 | production plan、approval、audit、commit ambiguity／reconciliation、memory／PostgreSQL ports；有大量本機未提交內容 | 只以 2026-10-03 legacy 完整候選分開核對／測試；未發布此模組 |
| generic：`40dfe289…/src/qa/core` | 已提交的判斷核心、Evidence／Snapshot、UNKNOWN、adapter contract、DecisionRepository；與原主庫 main 分離 | lineage commit，不直接採用較早未修補 bytes |
| generic 0.2：2026-10-03 `arci-improvements/generic/src/qa/core` | pure entry、hash、runtime injection、結果重新驗證、寫入鎖與封存修補 | **選定基線**，必要程式／測試與依賴抽離 |
| 2026-09-22 semantic candidate／`ec7fa2e…` | optional semantic 程式有提交，但該 HEAD 不代表當時整個 generic tree 都納 Git | 不當成完整核心 commit；模型能力未發布 |
| Presidential：`src/presidential/engine.ts`、`model.ts`、fixtures、UI | 獨立主題規則與展示 | 衍生版本，待遷移 |
| SEA：`domain/decision-engine`、`v3` | CommerceNetworkState、MarketConfig、風險／預測／policy；`app/api/arci-core/route.ts` 接主題引擎 | 獨立候選；本機 V4 與遠端 V3 不混用，待遷移 |
| 本機 `packages/contracts` | 私人 Phase 0 scaffold，與 generic 的 `contracts.ts` 不同 | 明確排除，未換名發布 |

Core V2／generic／SEA 的 DecisionRecord／policy、版本號與完成狀態不可互換。數字相近不是相容性證據。主題通訊能力保留在其研究來源，不以重命名宣稱完成跨領域抽象。

## 選定候選的完整性

2026-10-03 `release-source-manifest.json` SHA-256：
`7a0280ff24c57e0fd86c8d99d32b57cdd7b62ae7069e7deb7b466ca2fcb49472`。

本輪讀取 manifest 指向的檔案，**1,396／1,396 hash 相符**（兩個獨立 generic／legacy 候選合計，並非發佈檔案數）。來源沒有可聲稱代表全部候選內容的 Git commit，因此逐檔標示 candidateCommit=null；lineage commit 不冒充候選精確快照。

generic 的基線測試於隔離副本保留 36 個必要程式／測試檔，先跑 35 項原測試。其他版本驗證只複製 69 個必要依賴／測試檔在本機隔離副本，不發布整庫。

## 逐檔映射與變更理由

[source-map.json](evidence/source-map.json) 記錄來源 repository、lineage commit、候選、前次 screened local commit、原始路徑、新路徑、前後 SHA-256 與變更理由。

- `src/qa/core` 的比較、schema、hash、evidence、integrity、runtime 等搬入 `src/core`；純入口無主題依賴。
- `persistence.ts → src/adapters/file-store.ts`：分離相對 import；另補存入前驗證新增 SAVED audit，防止 host 時鐘落後造成寫入後無法讀回，失敗保持原檔與 revision。
- **本輪明示修補**：`engine.ts` 的空 source 引用回傳 UNKNOWN／EVIDENCE_REFERENCE_MISSING。先重現 PASS 反例，再修補；原比較運算與 FAIL 優先語意保留。
- **本輪 API 邊界修補**：createSnapshot 立即以 schema 拒絕超量來源；validateDecision 以原 ID／時間重算，重放不再依赖當下 crypto／clock。
- **本輪新實作**：`versioned.ts`、公開 contracts／入口、package exports、合成 examples、隔離 consumer／architecture／docs 工具與 CI；沒有聲稱它們是原研究成果。
- 原 35 項測試保留全部 assertions。歷史相容 adapter 的來源存在檢查與通訊欄位檢查補上既有快照 root／conditions 欄位的引用；保留 T3 的 PASS 斷言，不以更改 expected 規避新的證據要求。import／靜態掃描路徑依搬移調整；歷史 application 斷言需要的合成 host 放在 `tests/compat`，其 core 引用是轉接到公開套件，沒有第二份引擎。
- 原比較來源 `pure.ts`／`index.ts` 的純匯出責任合併成新的 `src/index.ts`，不再從根入口匯出 file I/O 或 semantic providers。

## 發布範圍

排除所有原 .git objects、.env、金鑰、個資／真實個案、DB、runtime、執行日誌、corpus、模型、圖片、主機絕對路徑與私人 contracts scaffold。只保留必要 code、合成 fixture、測試及去除主機路徑的驗證摘要。原研究、主題 repo 與既有未提交內容的 status/hash 於本機留存前後比對，不公開原機路徑。

不把未找到的模組重寫後說成原成果。獨立通用整合 npm 套件、全域 adapter registry、跨版本 migrator、所有主題已迁移的 runtime 證據均未找到，本輪也不作這些宣告。現有可用 API 與範例是本次實際交付，驗證見 [VALIDATION](VALIDATION.md)。
