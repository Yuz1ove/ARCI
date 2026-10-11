# 範例、案例與主題版本

所有示範資料為本輪新建的合成規則，不使用真實個案、資料庫、模型或私人文件。

| 指令 | 三種輸入 | 結果 |
|---|---|---|
| `npm run example:inventory` | units 12／4／null，minimumUnits 10 | PASS／FAIL／UNKNOWN |
| `npm run example:release` | 0 failures + reviewed true／2 failures／reviewed null | PASS／FAIL／UNKNOWN |

兩者共用 [run-adapter.mjs](../examples/run-adapter.mjs)，以同一 `evaluateVersioned` 判斷，再把封套 JSON serialize／parse 後重放比較。沒有複製引擎。發布範例只判斷條件，沒有執行部署。

## 歷史主題定位

- StarryLink：generic 候選原本透過通訊 adapter 與 workbench 使用核心；本輪只保留驗證所需的合成 host fixtures 在 tests/compat，沒有把 server 或 Ollama 掛到公開入口。
- Presidential：以資源／通訊題目展示政策與候選比較的衍生應用，另有 UI 與主題 fixtures；仍使用其既有程式，未遷移至 @arci/core。
- SEA：以 CommerceNetworkState、市場設定、延遲／成本及風險模型為主，遠端為 V3；本機 V4 另有治理、校準與持久化候選。不是 generic 核心的同義名稱，未直接整合。

本輪不重建競賽畫面、不使用歷史截圖。範例成功不等同外部專案已完成遷移。[各版本來源](PROVENANCE.md)
