# 已知限制與未包含能力

## 已實作、實驗、規劃

已實作並在本輪驗收：結構化確定性條件判斷、明確 UNKNOWN、來源快照、完整性檢查、版本封套重放、選用檔案保存、兩個合成 adapter、獨立 consumer。

研究候選但未納入本套件：通訊路由／verified delivery、Core V2 候選評分與模擬閉環、V2.1 approval／commit reconciliation、Ollama advisory、SEA V3／本機 V4。這些有各自程式與測試，不是只有文件，但不共享本套件的契約或驗收範圍。

尚未實作或未驗證：通用跨版本 migrator、多程序模型資源治理、分散式持久化／身份授權、真实應用遷移、現場通訊／硬體、真實 DB 網路故障、醫療適用性、真實模型準確率。沒有把設計文件或歷史數字當成這些能力的完成證據。

## 判斷與執行

PASS 只表示提供的規則通過；NOT_DISPATCHED 與 NOT_ESTABLISHED 永遠保持。沒有執行器，所以此套件沒有遠端取消／逾時／冪等送達 API。通訊研究版的 provider acceptance、DB commit 與 verified delivery 是分開概念，不得以本套件 PASS 替代任一概念。

資料、規則與 versionId 由 host 提供。核心不驗證世界真相、語意、來源作者、單位、日期意義或簽章。EvidenceRef 只檢查路徑存在，host 須負責 expected 與來源的一致性。hash 防毀損，不能防止可重寫整份資料的攻擊者。範例不是生產政策建議。

FAIL 優先於 UNKNOWN；必須讀取 constraints／unknowns 才能看到尚未確定的其他條件。字串排序是 JS 語意。預設時間／UUID 不是 determinism 的一部分；需要逐欄一致時使用 runtime 注入或版本重放。

## 檔案保存

來源 file-store 使用排他 writer.lock、revision、temp/fsync/rename。殘留 lock 不自動刪除；交給 host 確認持有者。讀回驗證 hash／schema／結果，但不構成身份授權；namespace/domain/workspace 是資料分組，不是多租戶安全隔離。多程序 reader 不自動 refresh，衝突應重新開啟 repository。若新 SAVED 時間早於 EVALUATED（例如 host 時鐘落後），save 在寫入前拒絕 RESULT_AUDIT_INVALID，host 應先修正時鐘；不偽造保存時間。

rename 後 directory fsync 失敗可能已改變磁碟內容，回報 DURABILITY_UNCONFIRMED，不能宣稱寫入未發生。archiveAndClear 先保存不可覆寫 archive，再清空；失敗時不得盲目重试或刪鎖。沒有自動 epoch rollover／跨封存 tombstone，舊 ID 的全域冪等由 host 處理。此 adapter 尚未在 Windows／NFS／斷電測試資格化。

file-store 只保存低階 DecisionResult，不保存完整 Evaluation；版本歷史由 host 保存完整封套。新版拒絕舊引擎不支援的封套，沒有自動把旧資料升為可信。

## 範圍與授權

本輪沒有搬移金鑰、DB、日誌、corpus、圖片、主機清冊、私人 Phase 0 contracts scaffold，也沒有鏡像私人 Git history。test/compat 中的歷史程式僅為原有 assertions 的依賴，tarball 不包含它。沒有新增自有軟體授權。來源版本／本輪驗證請見 [PROVENANCE](PROVENANCE.md)、[VALIDATION](VALIDATION.md)。
