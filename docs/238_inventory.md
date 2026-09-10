# 裁定238 リンク階層 棚卸し（2026-09-10・読取のみ・実装なし）

- 走査: app/**/*.tsx（design 除外）＋ components/**/*.tsx＝113 ファイル。判定は実装（href／Link／router.push／window.open／location）とスタイル（btnGold・btnDark・nox-btn gold＝実行／btnGhost・btnLight・ghost・danger＝補助）で機械判定。文言では推測しない。
- 分類: (1) 実行 136 件 ／ (2) 補助 228 件 ／ (3) 遷移 34 件 ＝ 計 398 件。判定保留 178 件（別表）。

## 表 A: 分類済み

| 画面 | 要素の文言 | 現クラス | 挙動 | 238 分類 | 付け替え要否 | 所在 | 確定分類（238-a〜g） |
|---|---|---|---|---|---|---|---|
| /analytics | 営業中の速報値はホーム・日報で確認 › | var(--primary | 遷移（Link href） | 3 | 要（link クラス＝青＋下線を付与） | app/(manage)/analytics/analytics-board.tsx:563 | (3) 済（.nox-link） |
| /analytics | CSV 出力 | btnGhost,btnSm | 補助（{exportMonthlyCsv}） | 2 | 不要（現状維持） | app/(manage)/analytics/analytics-board.tsx:631 | (2) 補助＝現状維持 |
| /analytics | CSV 出力 | btnGhost,btnSm | 補助（{exportRankingCsv}） | 2 | 不要（現状維持） | app/(manage)/analytics/analytics-board.tsx:984 | (2) 補助＝現状維持 |
| /analytics | 顧客管理 | var(--primary | 遷移（Link href） | 3 | 要（link クラス＝青＋下線を付与） | app/(manage)/analytics/analytics-board.tsx:1150 | (3) 済（.nox-link） |
| /analytics | ? | btnGold | 実行（{() => void saveTarget(tgtInput.trim）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/analytics/analytics-board.tsx:1211 | (1) 実行＝現状維持 |
| /analytics | 閉じる | btnGhost,btnSm | 補助（{() => setTgtOpen(false)}） | 2 | 不要（現状維持） | app/(manage)/analytics/analytics-board.tsx:1215 | (2) 補助＝現状維持 |
| /audit | 絞り込み解除 | btnGhost,btnSm | 補助（{() => { setKindFilter(""); setDateF） | 2 | 不要（現状維持） | app/(manage)/audit/audit-board.tsx:276 | (2) 補助＝現状維持 |
| /audit | ← 新しい方 | btnGhost,btnSm | 補助（{() => setPage((p) => Math.max(0, p ）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/audit/audit-board.tsx:309 | (2) 補助＝現状維持 |
| /audit | 古い方 → | btnGhost,btnSm | 補助（{() => setPage((p) => p + 1)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/audit/audit-board.tsx:311 | (2) 補助＝現状維持 |
| /audit | 新しく出力 | btnGold,btnSm | 実行（submit）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/audit/audit-board.tsx:523 | (1) 実行＝現状維持 |
| /billing | checkout-m | btnGold | 実行（{() => void call("/api/billing/check）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/billing/billing-board.tsx:130 | (1) 実行＝現状維持 |
| /billing | checkout-y | btnGhost | 補助（{() => void call("/api/billing/check）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/billing/billing-board.tsx:134 | (2) 補助＝現状維持 |
| /billing | portal | btnGold | 実行（{() => void call("/api/billing/porta）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/billing/billing-board.tsx:142 | (1) 実行＝現状維持 |
| /billing | interval | btnGhost | 補助（{() => void call("/api/billing/inter）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/billing/billing-board.tsx:147 | (2) 補助＝現状維持 |
| /billing | switch | btnGhost | 補助（{() => void call("/api/billing/switc）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/billing/billing-board.tsx:153 | (2) 補助＝現状維持 |
| /casts | ＋ trial | btnGold | 実行（{() => setShowAdd((v) => !v)}） | 1 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:400 | (1) 実行＝現状維持 |
| /casts | {label} | nox-chip / btnGhost,gold,var(--gold | 補助（{() => setRankFilter(v as string)}） | 2 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:409 | (2) 補助＝現状維持 |
| /casts | × | btnGhost | 補助（{() => setShowAdd(false)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:438 | (2) 補助＝現状維持 |
| /casts | マスタ ▸ 待遇プラン | var(--primary | 遷移（Link href） | 3 | 要（link クラス＝青＋下線を付与） | app/(manage)/casts/casts-board.tsx:465 | (3) 済（.nox-link） |
| /casts | 閉じる | btnGhost | 補助（{() => setSel(null)}） | 2 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:551 | (2) 補助＝現状維持 |
| /casts | 編集 | btnGhost | 補助（{() => { set）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:569 | (2) 補助＝現状維持 |
| /casts | 保存 | btnGold,btnSm | 実行（{async () => { ）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:584 | (1) 実行＝現状維持 |
| /casts | やめる | btnGhost | 補助（{() => setProfEdit(false)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:590 | (2) 補助＝現状維持 |
| /casts | 退店 | btnGhost | 補助（{() => void castLeaveRejoin(selCast,）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:600 | (2) 補助＝現状維持 |
| /casts | 復活 | btnGhost | 補助（{() => void castLeaveRejoin(selCast,）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:601 | (2) 補助＝現状維持 |
| /casts | 機密・税務情報へ（システム設定） | btnGhost | 遷移（Link href） | 3 | 要（ボタン風→link クラス） | app/(manage)/casts/casts-board.tsx:628 | (3) 済（.nox-link） |
| /casts | 料金設定 | var(--primary | 遷移（Link href） | 3 | 要（link クラス＝青＋下線を付与） | app/(manage)/casts/casts-board.tsx:655 | (3) 済（.nox-link） |
| /casts | 待遇プラン・報酬シミュレーターへ | btnGhost | 遷移（Link href） | 3 | 要（ボタン風→link クラス） | app/(manage)/casts/casts-board.tsx:701 | (3) 済（.nox-link） |
| /casts | PW再発行 | btnGhost | 補助（{() => openInvite(selCast, "reset")}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:714 | (2) 補助＝現状維持 |
| /casts | 招待 | btnGold | 実行（{() => openInvite(selCast, "invite")）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:715 | (1) 実行＝現状維持 |
| /casts | 打刻PIN を設定 | btnGhost | 補助（{() => { setPinTarget(selCast); setP）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:722 | (2) 補助＝現状維持 |
| /casts | 閉じる | btnGhost | 補助（{() => setSel(null)}） | 2 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:750 | (2) 補助＝現状維持 |
| /casts | ★ | btnGhost,gold,var(--gold | 補助（{() => void setRating(selTrial, r)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:756 | (2) 補助＝現状維持 |
| /casts | 本採用 | btnGold | 実行（{async () => { if (!co）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:776 | (1) 実行＝現状維持 |
| /casts | 見送り | btnGhost,danger,var(--danger | 補助（{async () => { if (!co）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:781 | (2) 補助＝現状維持 |
| /casts | キャンセル | btnGhost | 補助（{() => setInvTarget(null)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:812 | (2) 補助＝現状維持 |
| /casts | 処理中… | btnGold | 実行（{() => void submitInvite()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:813 | (1) 実行＝現状維持 |
| /casts | コピーしました ✓ | btnGhost | 補助（{() => void copyInvite()}） | 2 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:827 | (2) 補助＝現状維持 |
| /casts | 閉じる | btnGold | 実行（{() => setInvTarget(null)}） | 1 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:828 | (1) 実行＝現状維持 |
| /casts | 閉じる | btnGold | 実行（{() => setInvTarget(null)}） | 1 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:838 | (1) 実行＝現状維持 |
| /casts | キャンセル | btnGhost | 補助（{() => setPinTarget(null)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:863 | (2) 補助＝現状維持 |
| /casts | 処理中… | btnGold | 実行（{() => void submitPin()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:864 | (1) 実行＝現状維持 |
| /casts | 閉じる | btnGold | 実行（{() => setPinTarget(null)}） | 1 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:876 | (1) 実行＝現状維持 |
| /casts | キャンセル | btnGhost | 補助（{closePhoto}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:912 | (2) 補助＝現状維持 |
| /casts | 処理中… | btnGold | 実行（{() => void submitPhoto()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:913 | (1) 実行＝現状維持 |
| /casts | 保存 | btnGhost | 補助（{() => void onSave(memo)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:930 | (2) 補助＝現状維持 |
| /casts | 追加 | btnGold | 実行（{() => void submit()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/casts/casts-board.tsx:1012 | (1) 実行＝現状維持 |
| /customers | 閉じる | btnGold,btnGhost,btnSm | 補助（{() => (addOpen ? setAddOpen(false) ） | 2 | 不要（現状維持） | app/(manage)/customers/customers-board.tsx:393 | (2) 補助＝現状維持 |
| /customers | {label} | btnGhost,btnSm,gold,var(--gold | 補助（{() => setCastFilter(v as string)}） | 2 | 不要（現状維持） | app/(manage)/customers/customers-board.tsx:408 | (2) 補助＝現状維持 |
| /customers | 登録中… | btnGold | 実行（{() => void submitAdd()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/customers/customers-board.tsx:485 | (1) 実行＝現状維持 |
| /customers | 閉じる | btnGhost,btnSm | 補助（{() => setSel(null)}） | 2 | 不要（現状維持） | app/(manage)/customers/customers-board.tsx:559 | (2) 補助＝現状維持 |
| /customers | {label} | btnGhost,btnSm,gold,var(--gold | 補助（{() => void setGrade(v)}） | 2 | 不要（現状維持） | app/(manage)/customers/customers-board.tsx:613 | (2) 補助＝現状維持 |
| /customers | 編集 | btnGhost,btnSm | 補助（{() => openBtl(b)}） | 2 | 不要（現状維持） | app/(manage)/customers/customers-board.tsx:675 | (2) 補助＝現状維持 |
| /customers | 追記 | btnGold,btnSm | 実行（{() => void noteAdd()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/customers/customers-board.tsx:693 | (1) 実行＝現状維持 |
| /customers | 削除 | btnGhost,btnSm,var(--bad) | 補助（{() => void noteRemove(n.id)}） | 2 | 不要（現状維持） | app/(manage)/customers/customers-board.tsx:706 | (2) 補助＝現状維持 |
| /customers | 詳細・編集を開く › | btnGhost,btnSm | 遷移（Link href） | 3 | 要（ボタン風→link クラス） | app/(manage)/customers/customers-board.tsx:721 | (3) 済（.nox-link） |
| /customers | {label} | btnGhost,btnSm,gold,var(--gold | 補助（{() => setBtlForm((f) => ({ ...f, st） | 2 | 不要（現状維持） | app/(manage)/customers/customers-board.tsx:751 | (2) 補助＝現状維持 |
| /customers | キャンセル | btnGhost,btnSm | 補助（{() => setBtlPick(null)}） | 2 | 不要（現状維持） | app/(manage)/customers/customers-board.tsx:765 | (2) 補助＝現状維持 |
| /customers | 保存する | btnGold,btnSm | 実行（{() => void btlSave()}） | 1 | 不要（現状維持） | app/(manage)/customers/customers-board.tsx:766 | (1) 実行＝現状維持 |
| /customers/[id] | ← 顧客一覧へ戻る | inline style | 遷移（Link href） | 3 | 要（link クラス＝青＋下線を付与） | app/(manage)/customers/[id]/customer-detail.tsx:180 | (3) 済（.nox-link） |
| /customers/[id] | ← 顧客一覧 | inline style | 遷移（Link href） | 3 | 要（link クラス＝青＋下線を付与） | app/(manage)/customers/[id]/customer-detail.tsx:191 | (3) 済（.nox-link） |
| /customers/[id] | 閉じる | btnGhost,btnSm | 補助（{() => (assignOpen ? setAssignOpen(f） | 2 | 不要（現状維持） | app/(manage)/customers/[id]/customer-detail.tsx:202 | (2) 補助＝現状維持 |
| /customers/[id] | 保存中… | btnGold,btnSm | 実行（{() => void saveAssign()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/customers/[id]/customer-detail.tsx:218 | (1) 実行＝現状維持 |
| /customers/[id] | 閉じる | btnGold,btnGhost,btnSm | 補助（{() => (editOpen ? setEditOpen(false） | 2 | 不要（現状維持） | app/(manage)/customers/[id]/customer-detail.tsx:286 | (2) 補助＝現状維持 |
| /customers/[id] | 保存中… | btnGold | 実行（{() => void saveEdit()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/customers/[id]/customer-detail.tsx:330 | (1) 実行＝現状維持 |
| /dashboard | {s.icon} {s.label} | nox-quicktile | 遷移（Link href） | 3 | 要（link クラス＝青＋下線を付与） | app/(manage)/dashboard/dashboard-board.tsx:227 | (3) カード型＝238-e（下線なし・見出し末尾「›」--primary）済 |
| /dashboard | 追加配置へ › | nox-more | 遷移（Link href） | 3 | 要（link クラス＝青＋下線を付与） | app/(manage)/dashboard/dashboard-board.tsx:247 | (3) 済（.nox-link） |
| /dashboard | 分析へ › | nox-more | 遷移（Link href） | 3 | 要（link クラス＝青＋下線を付与） | app/(manage)/dashboard/dashboard-board.tsx:311 | (3) 済（.nox-link） |
| /dashboard | すべて › | nox-more | 遷移（Link href） | 3 | 要（link クラス＝青＋下線を付与） | app/(manage)/dashboard/dashboard-board.tsx:329 | (3) 済（.nox-link） |
| / | ログアウト | nox-btn / nox-btn | 補助（） | 2 | 不要（現状維持） | app/(manage)/layout.tsx:116 | (2) 補助＝現状維持 |
| /master | 週間設定を保存 | btnGold,btnSm | 実行（{() => void saveWeek()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/master/business-hours-panel.tsx:282 | (1) 実行＝現状維持 |
| /master | 適用 | btnGold,btnSm | 実行（{applyBulk}） | 1 | 不要（現状維持） | app/(manage)/master/business-hours-panel.tsx:319 | (1) 実行＝現状維持 |
| /master | 保存 | btnGold,btnSm | 実行（{() => void saveDow(dow)}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/master/business-hours-panel.tsx:361 | (1) 実行＝現状維持 |
| /master | 特別日を追加 | btnGold,btnSm | 実行（submit）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/master/business-hours-panel.tsx:414 | (1) 実行＝現状維持 |
| /master/cast-comp | 更新 | btnDark | 実行（{save}） | 1 | 不要（現状維持） | app/(manage)/master/cast-comp/comp-sections.tsx:378 | (1) 実行＝現状維持 |
| /master/cast-comp | 新規に戻す | btnLight | 補助（{() => { setId(null); setName(""); }） | 2 | 不要（現状維持） | app/(manage)/master/cast-comp/comp-sections.tsx:379 | (2) 補助＝現状維持 |
| /master/cast-comp | 更新 | btnDark | 実行（{() => void saveComp()}） | 1 | 不要（現状維持） | app/(manage)/master/cast-comp/comp-sections.tsx:417 | (1) 実行＝現状維持 |
| /master/cast-comp | 追加に戻す | btnLight | 補助（{() => { setCId(null); setCAmount(0)） | 2 | 不要（現状維持） | app/(manage)/master/cast-comp/comp-sections.tsx:418 | (2) 補助＝現状維持 |
| /master/cast-comp | 履歴 ▾ | btnGhost,btnSm,gold,var(--gold | 補助（{() => void toggleHist(c.id)}） | 2 | 不要（現状維持） | app/(manage)/master/cast-comp/comp-sections.tsx:656 | (2) 補助＝現状維持 |
| /master/cast-comp | num 件 : "—"} ▾ | btnGhost,btnSm,gold,var(--gold | 補助（{() => toggleOv(c.id)}） | 2 | 不要（現状維持） | app/(manage)/master/cast-comp/comp-sections.tsx:666 | (2) 補助＝現状維持 |
| /master/cast-comp | 変更 | btnDark | 実行（{() => void saveRow(c.id)}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/master/cast-comp/comp-sections.tsx:674 | (1) 実行＝現状維持 |
| /master/cast-comp | 保存 | btnDark | 実行（{save}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/master/cast-comp/comp-sections.tsx:787 | (1) 実行＝現状維持 |
| /master/cast-comp | 更新 | btnDark | 実行（{save}） | 1 | 不要（現状維持） | app/(manage)/master/cast-comp/comp-sections.tsx:858 | (1) 実行＝現状維持 |
| /master/cast-comp | 新規に戻す | btnLight | 補助（{resetForm}） | 2 | 不要（現状維持） | app/(manage)/master/cast-comp/comp-sections.tsx:859 | (2) 補助＝現状維持 |
| /master/cast-comp | 保存 | btnDark | 実行（{save}） | 1 | 不要（現状維持） | app/(manage)/master/cast-comp/comp-sections.tsx:914 | (1) 実行＝現状維持 |
| /master/cast-comp | 更新 | btnDark | 実行（{save}） | 1 | 不要（現状維持） | app/(manage)/master/cast-comp/comp-sections.tsx:1004 | (1) 実行＝現状維持 |
| /master/cast-comp | 新規に戻す | btnLight | 補助（{() => { setId(null); setName(""); }） | 2 | 不要（現状維持） | app/(manage)/master/cast-comp/comp-sections.tsx:1005 | (2) 補助＝現状維持 |
| /master/cast-comp | {c.icon} {c.title} {c.desc} {c.status} 管 | inline style | 遷移（Link href） | 3 | 要（link クラス＝青＋下線を付与） | app/(manage)/master/cast-comp/page.tsx:59 | (3) カード型＝238-e（下線なし・見出し末尾「›」--primary）済 |
| /master/cast-comp | 料金設定 | var(--primary | 遷移（Link href） | 3 | 要（link クラス＝青＋下線を付与） | app/(manage)/master/cast-comp/page.tsx:71 | (3) 済（.nox-link） |
| /master/cast-comp | キャスト管理 | var(--primary | 遷移（Link href） | 3 | 要（link クラス＝青＋下線を付与） | app/(manage)/master/cast-comp/page.tsx:72 | (3) 済（.nox-link） |
| /master/cast-comp/plan | 複製 | btnGhost,btnSm | 補助（{() => void duplicate()}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/master/cast-comp/plan/plan-board.tsx:135 | (2) 補助＝現状維持 |
| /master/cast-comp/plan | 有効化 | btnGhost,btnSm | 補助（{() => void toggleActive()}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/master/cast-comp/plan/plan-board.tsx:136 | (2) 補助＝現状維持 |
| /master/cast-comp/plan | 更新 | btnGhost,btnSm | 補助（{() => void onSave(section, kind, { ） | 2 | 不要（現状維持） | app/(manage)/master/cast-comp/plan/plan-editor.tsx:92 | (2) 補助＝現状維持 |
| /master/cast-comp/plan | 追加に戻す | btnGhost,btnSm | 補助（{() => { setEditId(null); setAmount(） | 2 | 不要（現状維持） | app/(manage)/master/cast-comp/plan/plan-editor.tsx:96 | (2) 補助＝現状維持 |
| /master/cast-comp/plan | {section} を保存 | btnGold,btnSm | 実行（{() => void savePlan(section)}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/master/cast-comp/plan/plan-editor.tsx:233 | (1) 実行＝現状維持 |
| /master/cast-comp/plan | {n} （登録済） | btnGhost,btnSm,gold,var(--gold | 補助（{() => { setPresetName(n); const ex ） | 2 | 不要（現状維持） | app/(manage)/master/cast-comp/plan/plan-editor.tsx:370 | (2) 補助＝現状維持 |
| /master/cast-comp/plan | プリセットを保存 | btnGold,btnSm | 実行（{() => void savePreset()}） | 1 | 不要（現状維持） | app/(manage)/master/cast-comp/plan/plan-editor.tsx:378 | (1) 実行＝現状維持 |
| /master | キャスト管理で招待すると設定できます → | var(--primary | 遷移（a href） | 3 | 要（link クラス＝青＋下線を付与） | app/(manage)/master/cast-register-panel.tsx:114 | (3) 済（.nox-link） |
| /master/categories | ＋ カテゴリを追加 | nox-pthead-act / btnGold | 実行（{openNew}） | 1 | 不要（現状維持） | app/(manage)/master/categories/categories-board.tsx:124 | (1) 実行＝現状維持 |
| /master/categories | 編集 | btnLight | 補助（{() => openEdit(c)}） | 2 | 不要（現状維持） | app/(manage)/master/categories/categories-board.tsx:172 | (2) 補助＝現状維持 |
| /master/categories | 更新 | btnPrimaryLg | 実行（{saveCategory}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/master/categories/categories-board.tsx:210 | (1) 実行＝現状維持 |
| /master | {inner} | nox-fcard | 遷移（Link href） | 3 | 要（link クラス＝青＋下線を付与） | app/(manage)/master/master-board.tsx:180 | (3) カード型＝238-e（下線なし・見出し末尾「›」--primary）済 |
| /master | {p.label} | on ? on : | 遷移（Link href） | 3 | 要（link クラス＝青＋下線を付与） | app/(manage)/master/master-subnav.tsx:64 | (4) 切替＝238-a（画面内タブ帯・対象外） |
| /master/pricing | 待遇プラン・報酬シミュレーター | var(--primary | 遷移（Link href） | 3 | 要（link クラス＝青＋下線を付与） | app/(manage)/master/pricing/pricing-board.tsx:876 | (3) 済（.nox-link） |
| /master/pricing | 更新 | btnLight | 補助（{() => void loadLiveNow()}） | 2 | 不要（現状維持） | app/(manage)/master/pricing/pricing-board.tsx:919 | (2) 補助＝現状維持 |
| /master/pricing | ＋ 区分を追加 | btnDark | 実行（{openNewCat}） | 1 | 不要（現状維持） | app/(manage)/master/pricing/pricing-board.tsx:933 | (1) 実行＝現状維持 |
| /master/pricing | 編集 | btnLight | 補助（{() => openEditCat(c)}） | 2 | 不要（現状維持） | app/(manage)/master/pricing/pricing-board.tsx:976 | (2) 補助＝現状維持 |
| /master/pricing | ＋ 時間帯を追加 | btnDark | 実行（{openNewBand}） | 1 | 不要（現状維持） | app/(manage)/master/pricing/pricing-board.tsx:992 | (1) 実行＝現状維持 |
| /master/pricing | 編集 | btnLight | 補助（{() => openEditBand(b)}） | 2 | 不要（現状維持） | app/(manage)/master/pricing/pricing-board.tsx:1058 | (2) 補助＝現状維持 |
| /master/pricing | この条件で計算 | btnDark | 実行（{() => void runPreview()}） | 1 | 不要（現状維持） | app/(manage)/master/pricing/pricing-board.tsx:1141 | (1) 実行＝現状維持 |
| /master/pricing | 保存 | btnLight | 補助（{() => void saveRankRow(row.key)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/master/pricing/pricing-board.tsx:1322 | (2) 補助＝現状維持 |
| /master/pricing | 削除 | btnLight,var(--bad) | 補助（{() => void deleteRank(rank)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/master/pricing/pricing-board.tsx:1330 | (2) 補助＝現状維持 |
| /master/pricing | ＋ ランクを追加 | btnLight | 補助（{() => void addRank()}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/master/pricing/pricing-board.tsx:1353 | (2) 補助＝現状維持 |
| /master/pricing | 営業時間で編集 | btnLight | 遷移（a href） | 3 | 要（ボタン風→link クラス） | app/(manage)/master/pricing/pricing-board.tsx:1510 | (3) 済（.nox-link） |
| /master/pricing | 税設定を保存 | btnDark | 実行（{() => void saveTaxConfig()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/master/pricing/pricing-board.tsx:1671 | (1) 実行＝現状維持 |
| /master/pricing | 操作履歴を見る | btnLight | 遷移（a href） | 3 | 要（ボタン風→link クラス） | app/(manage)/master/pricing/pricing-board.tsx:1740 | (3) 済（.nox-link） |
| /master/pricing | キャンセル | btnGhost,btnGhostLg | 補助（{() => setCatModalOpen(false)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/master/pricing/pricing-board.tsx:1774 | (2) 補助＝現状維持 |
| /master/pricing | この区分を保存 | btnPrimaryLg | 実行（{() => void saveCat()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/master/pricing/pricing-board.tsx:1775 | (1) 実行＝現状維持 |
| /master/pricing | 削除 | btnGhost,btnGhostLg,var(--bad) | 補助（{() => void deleteBand()}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/master/pricing/pricing-board.tsx:1935 | (2) 補助＝現状維持 |
| /master/pricing | キャンセル | btnGhost,btnGhostLg | 補助（{() => setModalOpen(false)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/master/pricing/pricing-board.tsx:1938 | (2) 補助＝現状維持 |
| /master/pricing | この時間帯を保存 | btnPrimaryLg | 実行（{() => void saveBand()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/master/pricing/pricing-board.tsx:1939 | (1) 実行＝現状維持 |
| /master | shimei | btnGold,btnSm | 実行（{save}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/master/pricing-panel.tsx:127 | (1) 実行＝現状維持 |
| /master | 保存 | btnGold,btnSm | 実行（{save}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/master/pricing-panel.tsx:146 | (1) 実行＝現状維持 |
| /master/products | ＋ 商品を追加 | btnGold | 実行（{newProduct}） | 1 | 不要（現状維持） | app/(manage)/master/products/products-board.tsx:440 | (1) 実行＝現状維持 |
| /master/products | ∧ | btnLight | 補助（{() => void moveProduct(p.id, -1)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/master/products/products-board.tsx:574 | (2) 補助＝現状維持 |
| /master/products | ∨ | btnLight | 補助（{() => void moveProduct(p.id, 1)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/master/products/products-board.tsx:577 | (2) 補助＝現状維持 |
| /master/products | 入荷 | btnLight | 補助（{() => { setStockTarget(p); setStDel）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/master/products/products-board.tsx:585 | (2) 補助＝現状維持 |
| /master/products | 編集 | btnLight | 補助（{() => editProduct(p)}） | 2 | 不要（現状維持） | app/(manage)/master/products/products-board.tsx:587 | (2) 補助＝現状維持 |
| /master/products | もっと見る（残り {filtered.length - shown.leng}  | btnLight | 補助（{() => setVisible((v) => v + PAGE)}） | 2 | 不要（現状維持） | app/(manage)/master/products/products-board.tsx:599 | (2) 補助＝現状維持 |
| /master/products | 記録する | btnPrimaryLg | 実行（{addStock}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/master/products/products-board.tsx:637 | (1) 実行＝現状維持 |
| /master/products | ▾ 詳細（原価・発注点・バック） | btnLight | 補助（{() => setDetailOpen((v) => !v)}） | 2 | 不要（現状維持） | app/(manage)/master/products/products-board.tsx:691 | (2) 補助＝現状維持 |
| /master/products | 新規に戻す | btnLight | 補助（{() => { setPId(null); setPName("");） | 2 | 不要（現状維持） | app/(manage)/master/products/products-board.tsx:773 | (2) 補助＝現状維持 |
| /master/products | 更新 | btnPrimaryLg | 実行（{() => saveProduct(false)}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/master/products/products-board.tsx:777 | (1) 実行＝現状維持 |
| /master/products | 登録して続けて入力 | btnGhost,btnGhostLg | 補助（{() => saveProduct(true)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/master/products/products-board.tsx:779 | (2) 補助＝現状維持 |
| /master/products | キャンセル | btnGhost,btnGhostLg | 補助（{onClose}） | 2 | 不要（現状維持） | app/(manage)/master/products/products-board.tsx:967 | (2) 補助＝現状維持 |
| /master/products | 登録中… 件を登録`} | btnPrimaryLg | 実行（{() => void submit()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/master/products/products-board.tsx:968 | (1) 実行＝現状維持 |
| /master/seats | ＋ 席を追加 | btnDark | 実行（{() => { setSId(null); setSName("");） | 1 | 不要（現状維持） | app/(manage)/master/seats/seats-board.tsx:91 | (1) 実行＝現状維持 |
| /master/seats | 更新 | btnDark | 実行（{saveSeat}） | 1 | 不要（現状維持） | app/(manage)/master/seats/seats-board.tsx:141 | (1) 実行＝現状維持 |
| /master/seats | やめる | btnLight | 補助（{() => { setSId(null); setSName("");） | 2 | 不要（現状維持） | app/(manage)/master/seats/seats-board.tsx:143 | (2) 補助＝現状維持 |
| /master | 表示 | btnLight | 補助（{reveal}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/master/sensitive-tax-panel.tsx:253 | (2) 補助＝現状維持 |
| /master | 機密情報を保存 | btnDark | 実行（{saveSensitive}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/master/sensitive-tax-panel.tsx:264 | (1) 実行＝現状維持 |
| /master | 税務情報を保存 | btnDark | 実行（{saveTax}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/master/sensitive-tax-panel.tsx:286 | (1) 実行＝現状維持 |
| /master | 削除 | btnLight,var(--bad) | 補助（{() => void removePattern(p)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/master/staff-shift-panel.tsx:152 | (2) 補助＝現状維持 |
| /master | 過去の行を隠す ）`} | btnLight | 補助（{() => setShowPast((v) => !v)}） | 2 | 不要（現状維持） | app/(manage)/master/staff-shift-panel.tsx:185 | (2) 補助＝現状維持 |
| /master | 追加 | btnDark | 実行（{() => void addPattern()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/master/staff-shift-panel.tsx:203 | (1) 実行＝現状維持 |
| /master | 設定 | btnDark | 実行（{() => void addDeadline()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/master/staff-shift-panel.tsx:221 | (1) 実行＝現状維持 |
| /master/stock | × | btnGhost,btnSm | 補助（{() => { onChange(""); setQ(""); set） | 2 | 不要（現状維持） | app/(manage)/master/stock/stock-board.tsx:82 | (2) 補助＝現状維持 |
| /master/stock | 棚卸しを記録 | btnDark | 実行（{recordStocktake}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/master/stock/stock-board.tsx:239 | (1) 実行＝現状維持 |
| /master/stock | 履歴を隠す | btnGhost,btnSm | 補助（{() => setHistOpen((v) => !v)}） | 2 | 不要（現状維持） | app/(manage)/master/stock/stock-board.tsx:250 | (2) 補助＝現状維持 |
| /master/stock | ← 新しい方 | btnGhost,btnSm | 補助（{() => setPage((p) => Math.max(0, p ）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/master/stock/stock-board.tsx:299 | (2) 補助＝現状維持 |
| /master/stock | 古い方 → | btnGhost,btnSm | 補助（{() => setPage((p) => p + 1)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/master/stock/stock-board.tsx:302 | (2) 補助＝現状維持 |
| /master | 保存 | btnGold,btnSm | 実行（{save}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/master/time-pricing-panel.tsx:113 | (1) 実行＝現状維持 |
| /notices | LINE連携を管理 | btnLight | 補助（）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/notices/notices-board.tsx:237 | (2) 補助＝現状維持 |
| /notices | {nOr(audCount[v] ?? null)} 名 {l} all ・黒服 | gold,var(--gold | 実行（{() => setFAud(v)}） | 1 | 不要（現状維持） | app/(manage)/notices/notices-board.tsx:324 | (1) 実行＝現状維持 |
| /notices | {l} | btnDark,btnLight | 補助（{() => setFUntilSeg(v)}） | 2 | 不要（現状維持） | app/(manage)/notices/notices-board.tsx:361 | (2) 補助＝現状維持 |
| /notices | 今すぐ掲載 | btnDark | 実行（submit） | 1 | 不要（現状維持） | app/(manage)/notices/notices-board.tsx:388 | (1) 実行＝現状維持 |
| /notices | 日時を予約（ {SOON} ） | btnLight | 補助（）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/notices/notices-board.tsx:389 | (2) 補助＝現状維持 |
| /notices | 下書き保存（ {SOON} ） | btnLight | 補助（）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/notices/notices-board.tsx:390 | (2) 補助＝現状維持 |
| /notices | 内容を確認して掲載 | btnDark | 実行（{() => { if (!fTitle.trim() \|\| !fBod）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/notices/notices-board.tsx:395 | (1) 実行＝現状維持 |
| /notices | 入力をクリア | btnLight | 補助（{() => { setFTitle(""); setFBody("")） | 2 | 不要（現状維持） | app/(manage)/notices/notices-board.tsx:399 | (2) 補助＝現状維持 |
| /notices | {x.label} {x.title} | nox-listrow | 補助（{() => { setFTitle(x.title); setFBod） | 2 | 不要（現状維持） | app/(manage)/notices/notices-board.tsx:435 | (2) 補助＝現状維持 |
| /notices | 保存 | btnDark | 実行（{saveEdit}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/notices/notices-board.tsx:508 | (1) 実行＝現状維持 |
| /notices | キャンセル | btnLight | 補助（{() => setEditId(null)}） | 2 | 不要（現状維持） | app/(manage)/notices/notices-board.tsx:509 | (2) 補助＝現状維持 |
| /notices | 編集 | btnLight | 補助（{() => startEdit(n)}） | 2 | 不要（現状維持） | app/(manage)/notices/notices-board.tsx:534 | (2) 補助＝現状維持 |
| /notices | 削除 | btnLight | 補助（{() => void del(n)}） | 2 | 不要（現状維持） | app/(manage)/notices/notices-board.tsx:535 | (2) 補助＝現状維持 |
| /notices | 戻る | btnLight | 補助（{() => setConfirmOpen(false)}） | 2 | 不要（現状維持） | app/(manage)/notices/notices-board.tsx:564 | (2) 補助＝現状維持 |
| /notices | この内容で掲載 | btnDark | 実行（{async () => { setConfirmOpen(false)）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/notices/notices-board.tsx:565 | (1) 実行＝現状維持 |
| /payroll | 再読込 | btnGhost,btnSm | 補助（{() => void load()}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/payroll/invoice-panel.tsx:101 | (2) 補助＝現状維持 |
| /payroll | 支払調書CSVを出力 | btnGold,btnSm | 実行（{() => void downloadCsv()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/payroll/invoice-panel.tsx:197 | (1) 実行＝現状維持 |
| /payroll | 保存 | btnGhost,btnSm | 補助（{() => onSave(v.trim())}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/payroll/invoice-panel.tsx:213 | (2) 補助＝現状維持 |
| /payroll | 支払状況を表示 | btnGold | 実行（{load}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/payroll/payment-panel.tsx:100 | (1) 実行＝現状維持 |
| /payroll | 記録 | btnGold,btnSm | 実行（{() => record(l.castId, remaining)}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/payroll/payment-panel.tsx:155 | (1) 実行＝現状維持 |
| /payroll | 再読込 | btnGhost,btnSm | 補助（{() => void load()}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/payroll/payment-tax-panel.tsx:76 | (2) 補助＝現状維持 |
| /payroll | 納付を記録 | btnGold,btnSm | 実行（{() => void record(r)}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/payroll/payment-tax-panel.tsx:138 | (1) 実行＝現状維持 |
| /payroll | プレビュー | btnGold | 実行（{preview}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/payroll/payroll-board.tsx:396 | (1) 実行＝現状維持 |
| /payroll | マスタ › キャスト・報酬 › | inline style | 遷移（a href） | 3 | 要（link クラス＝青＋下線を付与） | app/(manage)/payroll/payroll-board.tsx:524 | (3) 済（.nox-link） |
| /payroll | この期間を確定する | btnGhost | 補助（{finalize}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/payroll/payroll-board.tsx:675 | (2) 補助＝現状維持 |
| /payroll | 明細プレビューを閉じる | btnGhost,btnSm | 補助（{() => setSlipPreview((v) => !v)}） | 2 | 不要（現状維持） | app/(manage)/payroll/payroll-board.tsx:739 | (2) 補助＝現状維持 |
| /payroll | 確定を解除 | btnGhost,var(--bad) | 補助（{() => void reopen()}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/payroll/payroll-board.tsx:781 | (2) 補助＝現状維持 |
| /payroll | 給与明細CSVを出力 | btnGold | 実行（{() => void exportPayrollCsv()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/payroll/payroll-board.tsx:815 | (1) 実行＝現状維持 |
| /payroll | 報酬明細を読み込む | btnGhost | 補助（{() => void loadPayslipsForPrint()}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/payroll/payroll-board.tsx:842 | (2) 補助＝現状維持 |
| /receipts | URL コピー | btnGhost,btnSm | 補助（{() => { void navigator.clipboard?.w） | 2 | 不要（現状維持） | app/(manage)/receipts/receipts-board.tsx:130 | (2) 補助＝238-c（誤判定訂正・遷移ではない） |
| /receipts | 取消 | btnGhost,btnSm,var(--bad) | 補助（{() => { setVoidNote(""); setVoidTar） | 2 | 不要（現状維持） | app/(manage)/receipts/receipts-board.tsx:134 | (2) 補助＝現状維持 |
| /receipts | ← 新しい方 | btnGhost,btnSm | 補助（{() => setPage((p) => Math.max(0, p ）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/receipts/receipts-board.tsx:149 | (2) 補助＝現状維持 |
| /receipts | 古い方 → | btnGhost,btnSm | 補助（{() => setPage((p) => p + 1)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/receipts/receipts-board.tsx:152 | (2) 補助＝現状維持 |
| /receipts | やめる | btnGhost,btnSm | 補助（{() => setVoidTarget(null)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/receipts/receipts-board.tsx:174 | (2) 補助＝現状維持 |
| /receipts | 取り消す | btnGold | 実行（{() => void doVoid()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/receipts/receipts-board.tsx:175 | (1) 実行＝現状維持 |
| /register | 登録 | btnGold,btnSm | 実行（{register}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/register/bottle-keep-panel.tsx:83 | (1) 実行＝現状維持 |
| /register | 承認 | btnGold | 実行（{() => void decide(c, true)}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/register/drink-claim-queue.tsx:145 | (1) 実行＝現状維持 |
| /register | 却下 | btnGhost | 補助（{() => void decide(c, false)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/register/drink-claim-queue.tsx:146 | (2) 補助＝現状維持 |
| /register | ＋会計を分ける | btnLight | 補助（{() => addSplitGroup(onChange)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1401 | (2) 補助＝現状維持 |
| /register | やめる | btnLight | 補助（{() => setOpenSeatTarget(null)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1532 | (2) 補助＝現状維持 |
| /register | 開卓（セット開始） | btnGold | 実行（{() => void confirmOpenSeat()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1544 | (1) 実行＝現状維持 |
| /register | 指定しないで追加 | btnLight | 補助（{() => { const p = drinkPick.product）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1572 | (2) 補助＝現状維持 |
| /register | 閉じる | btnLight | 補助（{() => setDrinkPick(null)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1577 | (2) 補助＝現状維持 |
| /register | やめる | btnLight | 補助（{() => setClearModal(false)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1603 | (2) 補助＝現状維持 |
| /register | 削除中… 行を削除`} | btnLight,danger,var(--danger | 補助（{() => void clearItems()}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1604 | (2) 補助＝現状維持 |
| /register | やめる | btnLight | 補助（{() => setMergeModal(false)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1649 | (2) 補助＝現状維持 |
| /register | 合算中… | btnLight | 補助（{() => void mergeCheck()}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1650 | (2) 補助＝現状維持 |
| /register | やめる | btnLight | 補助（{() => setVoidModal(false)}） | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1682 | (2) 補助＝現状維持 |
| /register | 取消する | btnLight,danger,var(--danger | 補助（{() => void voidCheck()}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1683 | (2) 補助＝現状維持 |
| /register | カード手数料を追加（ {surchargeRate} %・ {yen(Math. | btnGold,btnSm | 実行（{() => void addCardSurcharge(g, due)）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1737 | (1) 実行＝現状維持 |
| /register | {l} | btnGold | 実行（{() => { setPayMethod(v); if (!DETAI） | 1 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1753 | (1) 実行＝現状維持 |
| /register | {n} 分割 | btnLight | 補助（{() => setPayAmount(Math.ceil(balanc）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1771 | (2) 補助＝現状維持 |
| /register | ちょうど | btnLight | 補助（{() => setPayTendered(String(p))}） | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1801 | (2) 補助＝現状維持 |
| /register | 入金する（ — ） | btnGold | 実行（{async () => { const ok = await pay(）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1824 | (1) 実行＝現状維持 |
| /register | 閉じる | btnLight | 補助（{() => setSeatPick(null)}） | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1857 | (2) 補助＝現状維持 |
| /register | 会計 {g} | btnGold,btnSm | 実行（{() => { const id = groupPick; setGr） | 1 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1871 | (1) 実行＝現状維持 |
| /register | ＋会計を分けてそこへ | btnLight | 補助（{() => addSplitGroup((g) => { const ）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1878 | (2) 補助＝現状維持 |
| /register | 閉じる | btnLight | 補助（{() => setGroupPick(null)}） | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1885 | (2) 補助＝現状維持 |
| /register | {closeInfo.groups.length > 1 } のレシート印刷`  | btnDark | 実行（{() => void enqueuePrint(closeInfo.c） | 1 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1909 | (1) 実行＝現状維持 |
| /register | 発行 | btnDark | 実行（{() => void doIssue()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/register/register-board.tsx:1969 | (1) 実行＝現状維持 |
| /register | URL コピー | btnLight | 遷移（router.push／location） | 3 | 要（ボタン→link クラス・遷移は青文字＋下線） | app/(manage)/register/register-board.tsx:1982 | (2) 補助＝238-c（誤判定訂正・遷移ではない） |
| /register | 閉じる | btnGold | 実行（{() => setCloseInfo(null)}） | 1 | 不要（現状維持） | app/(manage)/register/register-board.tsx:2001 | (1) 実行＝現状維持 |
| /register | ← フロア | nox-backbtn / nox-backbtn | 補助（{() => void closeDetail()}） | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:2053 | (2) 補助＝現状維持 |
| /register | − | btnLight | 補助（{() => void setPeopleN(Math.max(1, (）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:2070 | (2) 補助＝現状維持 |
| /register | ＋ | btnLight | 補助（{() => void setPeopleN((check.people）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:2077 | (2) 補助＝現状維持 |
| /register | 延長（ person / {check.ext_min} 分） | btnLight | 補助（{() => { setExtBarMenu(false); void ）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:2109 | (2) 補助＝現状維持 |
| /register | ▾ | btnLight | 補助（{() => setExtBarMenu((v) => !v)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:2119 | (2) 補助＝現状維持 |
| /register | {m.label} | btnLight | 補助（{() => { setExtBarMenu(false); void ） | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:2130 | (2) 補助＝現状維持 |
| /register | × | btnLight,var(--bad) | 補助（{() => void removeShareCast(ca.id)}） | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:2399 | (2) 補助＝現状維持 |
| /register | 均等に分配 | btnLight | 補助（{() => { // %版の均等＝） | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:2420 | (2) 補助＝現状維持 |
| /register | × | btnLight,danger,var(--danger | 補助（{() => removeSeat(cs.seat_id)}） | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:2468 | (2) 補助＝現状維持 |
| /register | {m.label} {units > 1 ? `（×${units} 名 $ { | btnDark | 実行（{() => void addExtension(m.rule_id)}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/register/register-board.tsx:2547 | (1) 実行＝現状維持 |
| /register | 延長を追加（ person / {check.ext_min} 分） | btnDark | 実行（{() => void addExtension()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/register/register-board.tsx:2556 | (1) 実行＝現状維持 |
| /register | 追加 | btnDark | 実行（{addCustomLine}） | 1 | 不要（現状維持） | app/(manage)/register/register-board.tsx:2677 | (1) 実行＝現状維持 |
| /register | 適用 | btnDark | 実行（{requestOrApply}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/register/register-board.tsx:2710 | (1) 実行＝現状維持 |
| /register | 承認 | btnDark | 実行（{() => decide(a.id, true)}） | 1 | 不要（現状維持） | app/(manage)/register/register-board.tsx:2731 | (1) 実行＝現状維持 |
| /register | 却下 | btnLight | 補助（{() => decide(a.id, false)}） | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:2732 | (2) 補助＝現状維持 |
| /register | 会計 {l.pay_group} ▾ | gold,var(--gold | 補助（{() => setGroupPick(l.id)}） | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:2825 | (2) 補助＝現状維持 |
| /register | 取消 | btnLight | 補助（{() => void claimVoid(claim.id)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:2870 | (2) 補助＝現状維持 |
| /register | 削除 | btnLight | 補助（{() => removeLine(l.id)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:2896 | (2) 補助＝現状維持 |
| /register | 会計を完了 | btnDark | 実行（{closeCheck}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/register/register-board.tsx:3059 | (1) 実行＝現状維持 |
| /register | ← フロア | nox-backbtn / nox-backbtn | 補助（{() => void closeDetail()}） | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:3066 | (2) 補助＝現状維持 |
| /register | {printCard.groups.length > 1 } を印刷` : "レ | btnDark | 実行（{() => void enqueuePrint(printCard.c） | 1 | 不要（現状維持） | app/(manage)/register/register-board.tsx:3088 | (1) 実行＝現状維持 |
| /register | 閉じる | btnLight | 補助（{() => setPrintCard(null)}） | 2 | 不要（現状維持） | app/(manage)/register/register-board.tsx:3100 | (2) 補助＝現状維持 |
| /register | 来店済 | btnDark | 実行（{() => { if ）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/register/reservation-panel.tsx:448 | (1) 実行＝現状維持 |
| /register | 編集 | btnLight | 補助（{() => (editId === r.id ? setEditId(）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/register/reservation-panel.tsx:460 | (2) 補助＝現状維持 |
| /register | no_show | btnLight | 補助（{() => void setStatus(r, "no_show")}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/register/reservation-panel.tsx:464 | (2) 補助＝現状維持 |
| /register | 取消 | btnLight,var(--bad) | 補助（{() => void setStatus(r, "cancelled"）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/register/reservation-panel.tsx:467 | (2) 補助＝現状維持 |
| /register | 伝票を開く | btnDark | 実行（{() => void toCheck(r)}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/register/reservation-panel.tsx:502 | (1) 実行＝現状維持 |
| /register | 閉じる | btnLight | 補助（{() => setVisitId(null)}） | 2 | 不要（現状維持） | app/(manage)/register/reservation-panel.tsx:503 | (2) 補助＝現状維持 |
| /register | 保存 | btnDark | 実行（{() => void updateReservation(r)}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/register/reservation-panel.tsx:586 | (1) 実行＝現状維持 |
| /register | 閉じる | btnLight | 補助（{() => setEditId(null)}） | 2 | 不要（現状維持） | app/(manage)/register/reservation-panel.tsx:590 | (2) 補助＝現状維持 |
| /register | 予約を追加 | btnDark | 実行（{() => void createReservation()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/register/reservation-panel.tsx:672 | (1) 実行＝現状維持 |
| /report | やめる | btnLight | 補助（{close}） | 2 | 不要（現状維持） | app/(manage)/report/report-board.tsx:543 | (2) 補助＝現状維持 |
| /report | 解除する | btnDark | 実行（{() => void (isRe ? submitReopen() :）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/report/report-board.tsx:544 | (1) 実行＝現状維持 |
| /report | {r.due ? `期日 ${r.due} $ （超過） ` : "期日を設定" | btnLight,var(--bad) | 補助（{() => { setDuePick(r); setDueVal(r.） | 2 | 不要（現状維持） | app/(manage)/report/report-board.tsx:641 | (2) 補助＝現状維持 |
| /report | 給与天引き | btnLight | 補助（{() => markDeductRecv(r)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/report/report-board.tsx:661 | (2) 補助＝現状維持 |
| /report | 追加回収 | btnLight | 補助（{() => { setCollectPick(r); setColle） | 2 | 不要（現状維持） | app/(manage)/report/report-board.tsx:667 | (2) 補助＝現状維持 |
| /report | ? を回収`} | btnDark | 実行（{() => void submitCollect()}） | 1 | 不要（現状維持） | app/(manage)/report/report-board.tsx:727 | (1) 実行＝現状維持 |
| /report | キャンセル | btnLight | 補助（{() => setCollectPick(null)}） | 2 | 不要（現状維持） | app/(manage)/report/report-board.tsx:730 | (2) 補助＝現状維持 |
| /report | 設定する | btnDark | 実行（{() => void submitDue()}） | 1 | 不要（現状維持） | app/(manage)/report/report-board.tsx:747 | (1) 実行＝現状維持 |
| /report | キャンセル | btnLight | 補助（{() => setDuePick(null)}） | 2 | 不要（現状維持） | app/(manage)/report/report-board.tsx:748 | (2) 補助＝現状維持 |
| /report | 日報を締める | btnDark | 実行（{closeDay}） | 1 | 不要（現状維持） | app/(manage)/report/report-board.tsx:787 | (1) 実行＝現状維持 |
| /report | 操作履歴を見る | var(--primary | 遷移（a href） | 3 | 要（link クラス＝青＋下線を付与） | app/(manage)/report/report-board.tsx:856 | (3) 済（.nox-link） |
| /report | 分析 | var(--primary | 遷移（a href） | 3 | 要（link クラス＝青＋下線を付与） | app/(manage)/report/report-board.tsx:1066 | (3) 済（.nox-link） |
| /report | 再締め | btnDark | 実行（{() => void recloseFromForm(recloseT） | 1 | 不要（現状維持） | app/(manage)/report/report-board.tsx:1157 | (1) 実行＝現状維持 |
| /report | 締め確定 | btnDark | 実行（{closeDay}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/report/report-board.tsx:1158 | (1) 実行＝現状維持 |
| /report | クリア | btnLight | 補助（{() => setDenoms({}） | 2 | 不要（現状維持） | app/(manage)/report/report-board.tsx:1191 | (2) 補助＝現状維持 |
| /report | 実査へ反映（ {yen(total)} ） | btnDark | 実行（{() => { setCounted(String(total)); ） | 1 | 不要（現状維持） | app/(manage)/report/report-board.tsx:1192 | (1) 実行＝現状維持 |
| /report | 再締め | btnLight | 補助（{() => scrollToClose(r.biz_date)}） | 2 | 不要（現状維持） | app/(manage)/report/report-board.tsx:1253 | (2) 補助＝現状維持 |
| /report | 再締め | btnLight | 補助（{() => scrollToClose(r.biz_date)}） | 2 | 不要（現状維持） | app/(manage)/report/report-board.tsx:1256 | (2) 補助＝現状維持 |
| /report | 解除 | btnLight | 補助（{() => { setReasonVal(""); setReopen） | 2 | 不要（現状維持） | app/(manage)/report/report-board.tsx:1258 | (2) 補助＝現状維持 |
| /report | 差異を承認 | btnLight | 補助（{() => { setReasonVal(""); setApprov） | 2 | 不要（現状維持） | app/(manage)/report/report-board.tsx:1268 | (2) 補助＝現状維持 |
| /shift | × | btnLight | 補助（{() => toggle({ id: r.castId, name: ） | 2 | 不要（現状維持） | app/(manage)/shift/day-add-panel.tsx:164 | (2) 補助＝現状維持 |
| /shift | 配置中… 名を配置（仮シフト）`} | btnDark | 実行（{() => void save()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/shift/day-add-panel.tsx:169 | (1) 実行＝現状維持 |
| /shift | すべて取り消す | btnLight | 補助（{() => { setRows([]); setMsg(null); ）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/shift/day-add-panel.tsx:173 | (2) 補助＝現状維持 |
| /shift | 発行 | btnDark | 実行（{publish}） | 1 | 不要（現状維持） | app/(manage)/shift/incentive-panel.tsx:112 | (1) 実行＝現状維持 |
| /shift | 全員 | btnDark,btnLight | 補助（{() => setTargetAll(true)}） | 2 | 不要（現状維持） | app/(manage)/shift/incentive-panel.tsx:125 | (2) 補助＝現状維持 |
| /shift | 選択 {!targetAll && picked.size > } 名）` :  | btnDark,btnLight | 補助（{() => setTargetAll(false)}） | 2 | 不要（現状維持） | app/(manage)/shift/incentive-panel.tsx:126 | (2) 補助＝現状維持 |
| /shift | {c.name} | btnDark | 実行（{() => togglePick(c.id)}） | 1 | 不要（現状維持） | app/(manage)/shift/incentive-panel.tsx:135 | (1) 実行＝現状維持 |
| /shift | 取消 | btnLight | 補助（{() => cancel(r.id)}） | 2 | 不要（現状維持） | app/(manage)/shift/incentive-panel.tsx:164 | (2) 補助＝現状維持 |
| /shift | × | btnLight | 補助（{onClose}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-add-form.tsx:332 | (2) 補助＝現状維持 |
| /shift | ‹ | btnLight | 補助（{() => moveMonth(-1)}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-add-form.tsx:361 | (2) 補助＝現状維持 |
| /shift | › | btnLight | 補助（{() => moveMonth(1)}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-add-form.tsx:363 | (2) 補助＝現状維持 |
| /shift | 出勤不可以外を全部選択 | btnLight | 補助（{() => selectBulk(null)}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-add-form.tsx:368 | (2) 補助＝現状維持 |
| /shift | 毎週 金を選択 | btnLight | 補助（{() => selectBulk([5])}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-add-form.tsx:369 | (2) 補助＝現状維持 |
| /shift | 毎週 土を選択 | btnLight | 補助（{() => selectBulk([6])}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-add-form.tsx:370 | (2) 補助＝現状維持 |
| /shift | 毎週 金・土を選択 | btnLight | 補助（{() => selectBulk([5, 6])}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-add-form.tsx:371 | (2) 補助＝現状維持 |
| /shift | 選択をすべて解除 | btnLight | 補助（{() => { setSel({}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-add-form.tsx:372 | (2) 補助＝現状維持 |
| /shift | 出勤不可にする | btnLight | 補助（{() => void setUnavailable(focusDay)） | 2 | 不要（現状維持） | app/(manage)/shift/shift-add-form.tsx:433 | (2) 補助＝現状維持 |
| /shift | 不可を解除 | btnLight | 補助（{() => void removeUnavailable(focusD） | 2 | 不要（現状維持） | app/(manage)/shift/shift-add-form.tsx:436 | (2) 補助＝現状維持 |
| /shift | それでも登録 | btnLight | 補助（{() => { ）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/shift/shift-add-form.tsx:448 | (2) 補助＝現状維持 |
| /shift | 全日に適用 | btnLight | 補助（{applyAll}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-add-form.tsx:475 | (2) 補助＝現状維持 |
| /shift | × | btnLight | 補助（{() => setSel((p) => { const n = { .） | 2 | 不要（現状維持） | app/(manage)/shift/shift-add-form.tsx:489 | (2) 補助＝現状維持 |
| /shift | キャンセル | btnLight | 補助（{onClose}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-add-form.tsx:525 | (2) 補助＝現状維持 |
| /shift | 保存して次のキャスト | btnLight | 補助（{() => void save(true)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/shift/shift-add-form.tsx:526 | (2) 補助＝現状維持 |
| /shift | 保存中… 日分を保存して閉じる`} | btnDark | 実行（{() => void save(false)}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/shift/shift-add-form.tsx:529 | (1) 実行＝現状維持 |
| /shift | 今日 `} {Number(ymd.slice(8))} 日 {st.requi | gold,var(--gold | 実行（{() => { // ★SC-8 ⑦:） | 1 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:841 | (1) 実行＝現状維持 |
| /shift | 調整 | btnLight | 補助（{() => { setAdjTarget(s); setAStart(）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1025 | (2) 補助＝現状維持 |
| /shift | 確認へ | btnLight | 補助（{() => void proposeShifts([s.id])}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1028 | (2) 補助＝現状維持 |
| /shift | 確定 | btnDark | 実行（{() => confirmShift(s)}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1032 | (1) 実行＝現状維持 |
| /shift | 時間帯を設定する | btnLight | 補助（{gotoNeeds}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1068 | (2) 補助＝現状維持 |
| /shift | ‹ | btnLight | 補助（{() => shiftMonth(-1)}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1087 | (2) 補助＝現状維持 |
| /shift | › | btnLight | 補助（{() => shiftMonth(1)}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1089 | (2) 補助＝現状維持 |
| /shift | 今日 | btnLight | 補助（{() => { setMonth(bizToday.slice(0, ） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1090 | (2) 補助＝現状維持 |
| /shift | × | btnLight | 補助（{() => removeNeed(dow, n.from_min, b） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1204 | (2) 補助＝現状維持 |
| /shift | 追加 | btnDark | 実行（{addNeed}） | 1 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1231 | (1) 実行＝現状維持 |
| /shift | {ids.length} 件の希望をまとめて承認 | btnLight | 補助（{() => void approveAllWishes(ids)}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1280 | (2) 補助＝現状維持 |
| /shift | {planned.length} 件まとめてキャスト確認へ | btnLight | 補助（{() => void proposeShifts(planned.ma） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1289 | (2) 補助＝現状維持 |
| /shift | {planned.length + proposed.le} 件を一括確定 | btnDark | 実行（{() => void confirmBulkShifts([...pl）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1296 | (1) 実行＝現状維持 |
| /shift | 希望どおり承認 | btnDark | 実行（{() => decide(r.wish!.id, true)}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1410 | (1) 実行＝現状維持 |
| /shift | 見送り | btnLight | 補助（{() => decide(r.wish!.id, false)}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1413 | (2) 補助＝現状維持 |
| /shift | 時間調整 | btnLight | 補助（{() => { setAdjTarget(r.shift!); set）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1418 | (2) 補助＝現状維持 |
| /shift | キャスト確認へ | btnDark | 実行（{() => void proposeShifts([r.shift!.）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1420 | (1) 実行＝現状維持 |
| /shift | 削除 | btnLight,var(--bad) | 補助（{() => void removeShift(r.shift!)}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1423 | (2) 補助＝現状維持 |
| /shift | 再調整 | btnLight | 補助（{() => { setAdjTarget(r.shift!); set）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1428 | (2) 補助＝現状維持 |
| /shift | 差し戻す | btnLight | 補助（{() => void demoteShift(r.shift!)}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1430 | (2) 補助＝現状維持 |
| /shift | 削除 | btnLight,var(--bad) | 補助（{() => void removeShift(r.shift!)}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1431 | (2) 補助＝現状維持 |
| /shift | 必要人数を設定 | btnLight | 補助（{() => gotoNeeds()}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1495 | (2) 補助＝現状維持 |
| /shift | 作成中に戻す | btnLight | 補助（{() => cur && void setPeriodStatus(c）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1497 | (2) 補助＝現状維持 |
| /shift | スタッフに公開して確定 | btnDark | 実行（{() => cur && void setPeriodStatus(c）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1500 | (1) 実行＝現状維持 |
| /shift | 編集 | btnLight | 補助（{() => { setPEditId(p.id); setPStart） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1528 | (2) 補助＝現状維持 |
| /shift | 削除 | btnLight | 補助（{() => void removePeriod(p.id)}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1530 | (2) 補助＝現状維持 |
| /shift | 更新 | btnDark | 実行（{() => void savePeriod()}） | 1 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1542 | (1) 実行＝現状維持 |
| /shift | やめる | btnLight | 補助（{() => { setPEditId(null); setPStart） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1544 | (2) 補助＝現状維持 |
| /shift | CSV出力 | btnLight | 補助（{exportShiftsCsv}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1690 | (2) 補助＝現状維持 |
| /shift | ‹ | btnLight | 補助（{() => shiftMonth(-1)}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1706 | (2) 補助＝現状維持 |
| /shift | › | btnLight | 補助（{() => shiftMonth(1)}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1708 | (2) 補助＝現状維持 |
| /shift | 今日 | btnLight | 補助（{() => { setMonth(bizToday.slice(0, ） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1709 | (2) 補助＝現状維持 |
| /shift | 時間を調整 | btnLight | 補助（{() => { setAdjTarget(s); setAStart(）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1786 | (2) 補助＝現状維持 |
| /shift | 削除 | btnLight,var(--bad) | 補助（{() => void removeShift(s)}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1797 | (2) 補助＝現状維持 |
| /shift | 操作履歴 | var(--primary | 遷移（a href） | 3 | 要（link クラス＝青＋下線を付与） | app/(manage)/shift/shift-board.tsx:1863 | (3) 済（.nox-link） |
| /shift | × | btnLight | 補助（{() => { closeDay(); }） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1897 | (2) 補助＝現状維持 |
| /shift | 時間帯を設定する | btnLight | 補助（{() => { if (closeDay()) gotoNeeds()） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:1937 | (2) 補助＝現状維持 |
| /shift | × | btnLight | 補助（{() => { closeDay(); }） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:2049 | (2) 補助＝現状維持 |
| /shift | 調整 | btnLight | 補助（{() => { // ★C-1） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:2077 | (2) 補助＝現状維持 |
| /shift | × | btnLight | 補助（{() => setAdjTarget(null)}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:2100 | (2) 補助＝現状維持 |
| /shift | やめる | btnLight | 補助（{() => setAdjTarget(null)}） | 2 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:2139 | (2) 補助＝現状維持 |
| /shift | 保存 | btnDark | 実行（{() => void adjustShift()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/shift/shift-board.tsx:2140 | (1) 実行＝現状維持 |
| /shift | ‹ | btnLight | 補助（{() => setMonth(monthAfter(month, -1） | 2 | 不要（現状維持） | app/(manage)/shift/staff-shift-board.tsx:117 | (2) 補助＝現状維持 |
| /shift | › | btnLight | 補助（{() => setMonth(monthAfter(month, 1)） | 2 | 不要（現状維持） | app/(manage)/shift/staff-shift-board.tsx:119 | (2) 補助＝現状維持 |
| /shift | 今日 | btnLight | 補助（{() => { setMonth(bizToday.slice(0, ） | 2 | 不要（現状維持） | app/(manage)/shift/staff-shift-board.tsx:120 | (2) 補助＝現状維持 |
| /shift | {p.name} {mark} | gold,var(--gold | 実行（{(e) => { e.stopPropagation(); setSe）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/shift/staff-shift-board.tsx:145 | (1) 実行＝現状維持 |
| /shift | 備考を保存 | btnLight | 補助（{() => void saveNote(selDay)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/shift/staff-shift-board.tsx:175 | (2) 補助＝現状維持 |
| /shift | この営業日を一括確定（ proposed 件） | btnDark | 実行（{() => void confirmDay(selDay)}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/shift/staff-shift-manage.tsx:149 | (1) 実行＝現状維持 |
| /shift | 時刻を上書き | btnLight | 補助（{() => openOverride(s)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/shift/staff-shift-manage.tsx:174 | (2) 補助＝現状維持 |
| /shift | 確定 | btnDark | 実行（{() => void confirmOne(s)}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/shift/staff-shift-manage.tsx:175 | (1) 実行＝現状維持 |
| /shift | {nameOf(w.staff_id)} — var(--v2-muted) } | nox-crow | 補助（{() => void propose(selDay, w.staff_）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/shift/staff-shift-manage.tsx:197 | (2) 補助＝現状維持 |
| /shift | 配置 | btnLight | 補助（{() => void propose(selDay, pickStaf）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/shift/staff-shift-manage.tsx:219 | (2) 補助＝現状維持 |
| /shift | キャンセル | btnLight | 補助（{() => setOv(null)}） | 2 | 不要（現状維持） | app/(manage)/shift/staff-shift-manage.tsx:239 | (2) 補助＝現状維持 |
| /shift | 上書きする | btnDark | 実行（{() => void submitOverride()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/shift/staff-shift-manage.tsx:240 | (1) 実行＝現状維持 |
| /staff | ＋ スタッフを追加 | btnGold | 実行（{openAdd}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/staff/staff-board.tsx:183 | (1) 実行＝現状維持 |
| /staff | 名前を更新 | btnGold | 実行（{async () => { await r）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/staff/staff-board.tsx:245 | (1) 実行＝現状維持 |
| /staff | 異動を実行 | btnGhost | 補助（{async () => { if (!）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/staff/staff-board.tsx:256 | (2) 補助＝現状維持 |
| /staff | staff | btnGhost | 補助（{async () => { const）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/staff/staff-board.tsx:265 | (2) 補助＝現状維持 |
| /staff | 在籍を解除 | btnGhost,danger,var(--danger | 補助（{async () => { if (!）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/staff/staff-board.tsx:274 | (2) 補助＝現状維持 |
| /staff | 再雇用（復帰） | btnGold | 実行（{async () => { await）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/staff/staff-board.tsx:281 | (1) 実行＝現状維持 |
| /staff | 閉じる | btnGhost | 補助（{() => setSel(null)}） | 2 | 不要（現状維持） | app/(manage)/staff/staff-board.tsx:286 | (2) 補助＝現状維持 |
| /staff | キャンセル | btnGhost | 補助（{() => setAddOpen(false)}）・disabled 条件あり | 2 | 不要（現状維持） | app/(manage)/staff/staff-board.tsx:339 | (2) 補助＝現状維持 |
| /staff | 追加中… | btnGold | 実行（{() => void submitAdd()}）・disabled 条件あり | 1 | 不要（現状維持） | app/(manage)/staff/staff-board.tsx:340 | (1) 実行＝現状維持 |
| /staff | コピーしました ✓ | btnGhost | 補助（{() => void copyPassword()}） | 2 | 不要（現状維持） | app/(manage)/staff/staff-board.tsx:353 | (2) 補助＝現状維持 |
| /staff | 閉じる | btnGold | 実行（{() => setAddOpen(false)}） | 1 | 不要（現状維持） | app/(manage)/staff/staff-board.tsx:354 | (1) 実行＝現状維持 |
| /staff | 閉じる | btnGold | 実行（{() => setAddOpen(false)}） | 1 | 不要（現状維持） | app/(manage)/staff/staff-board.tsx:364 | (1) 実行＝現状維持 |
| /kiosk | 端末ログアウト | btnGhost,btnSm | 補助（{async () => { await supabase.auth.s） | 2 | 不要（現状維持） | app/kiosk/page.tsx:122 | (2) 補助＝現状維持 |
| /kiosk | 確認中… | btnGold | 実行（submit）・disabled 条件あり | 1 | 不要（現状維持） | app/kiosk/page.tsx:153 | (1) 実行＝現状維持 |
| /kiosk | ログアウト | btnGhost | 補助（{async () => { await supabase.auth.s） | 2 | 不要（現状維持） | app/kiosk/page.tsx:163 | (2) 補助＝現状維持 |
| /kiosk | 出勤 | btnGold | 実行（{() => void punch("in")}）・disabled 条件あり | 1 | 不要（現状維持） | app/kiosk/page.tsx:208 | (1) 実行＝現状維持 |
| /kiosk | もどる | btnGhost,btnSm | 補助（{backToSelect}） | 2 | 不要（現状維持） | app/kiosk/page.tsx:217 | (2) 補助＝現状維持 |
| /kiosk | すぐ戻る | btnGhost,btnSm | 補助（{backToSelect}） | 2 | 不要（現状維持） | app/kiosk/page.tsx:235 | (2) 補助＝現状維持 |
| /kiosk-register | 交代／離席 | btnLight | 補助（{() => void operatorLogout()}） | 2 | 不要（現状維持） | app/kiosk-register/page.tsx:551 | (2) 補助＝現状維持 |
| /kiosk-register | 端末ログアウト | btnLight | 補助（{async () => { await supabase.auth.s） | 2 | 不要（現状維持） | app/kiosk-register/page.tsx:559 | (2) 補助＝現状維持 |
| /kiosk-register | 確認中… | btnGold | 実行（submit）・disabled 条件あり | 1 | 不要（現状維持） | app/kiosk-register/page.tsx:582 | (1) 実行＝現状維持 |
| /kiosk-register | ログアウト | btnLight | 補助（{async () => { await supabase.auth.s） | 2 | 不要（現状維持） | app/kiosk-register/page.tsx:592 | (2) 補助＝現状維持 |
| /kiosk-register | ログイン | btnGold | 実行（{() => void doPinLogin()}）・disabled 条件あり | 1 | 不要（現状維持） | app/kiosk-register/page.tsx:640 | (1) 実行＝現状維持 |
| /kiosk-register | もどる | btnLight | 補助（{() => { setTarget(null); setPin("")） | 2 | 不要（現状維持） | app/kiosk-register/page.tsx:644 | (2) 補助＝現状維持 |
| /kiosk-register | やめる | btnLight | 補助（{() => setOpenSeatTarget(null)}）・disabled 条件あり | 2 | 不要（現状維持） | app/kiosk-register/page.tsx:670 | (2) 補助＝現状維持 |
| /kiosk-register | 開卓（セット開始） | btnGold | 実行（{() => void confirmOpenSeat()}）・disabled 条件あり | 1 | 不要（現状維持） | app/kiosk-register/page.tsx:671 | (1) 実行＝現状維持 |
| /kiosk-register | {printCard.groups.length > 1 } を印刷` : "レ | btnDark | 実行（{() => void enqueuePrint(printCard.c） | 1 | 不要（現状維持） | app/kiosk-register/page.tsx:689 | (1) 実行＝現状維持 |
| /kiosk-register | 閉じる | btnLight | 補助（{() => setPrintCard(null)}） | 2 | 不要（現状維持） | app/kiosk-register/page.tsx:705 | (2) 補助＝現状維持 |
| /kiosk-register | 更新 | btnLight | 補助（{() => { markAction(); void refreshS） | 2 | 不要（現状維持） | app/kiosk-register/page.tsx:717 | (2) 補助＝現状維持 |
| /kiosk-register | ← フロア | nox-backbtn / nox-backbtn | 補助（{() => void closeDetail()}） | 2 | 不要（現状維持） | app/kiosk-register/page.tsx:776 | (2) 補助＝現状維持 |
| /kiosk-register | 保存 | btnDark | 実行（{() => void saveNoms()}） | 1 | 不要（現状維持） | app/kiosk-register/page.tsx:876 | (1) 実行＝現状維持 |
| /kiosk-register | × | btnLight,var(--bad) | 補助（{() => void removeSeat(sid)}） | 2 | 不要（現状維持） | app/kiosk-register/page.tsx:893 | (2) 補助＝現状維持 |
| /kiosk-register | 延長を追加（ person / {detail.check.ext_min} 分 | btnDark | 実行（{() => void addExtension()}）・disabled 条件あり | 1 | 不要（現状維持） | app/kiosk-register/page.tsx:954 | (1) 実行＝現状維持 |
| /kiosk-register | 追加 | btnDark | 実行（{() => void addCustomLine()}） | 1 | 不要（現状維持） | app/kiosk-register/page.tsx:1023 | (1) 実行＝現状維持 |
| /kiosk-register | 削除 | btnLight | 補助（{() => void removeLine(l.id)}）・disabled 条件あり | 2 | 不要（現状維持） | app/kiosk-register/page.tsx:1051 | (2) 補助＝現状維持 |
| /kiosk-register | 入金 | btnDark | 実行（{() => void pay()}） | 1 | 不要（現状維持） | app/kiosk-register/page.tsx:1152 | (1) 実行＝現状維持 |
| /kiosk-register | 会計を締める（クローズ） | btnGold | 実行（{() => void closeCheck()}）・disabled 条件あり | 1 | 不要（現状維持） | app/kiosk-register/page.tsx:1171 | (1) 実行＝現状維持 |
| /kiosk-register | ← フロア | btnGhost | 補助（{() => void closeDetail()}） | 2 | 不要（現状維持） | app/kiosk-register/page.tsx:1179 | (2) 補助＝現状維持 |
| /login | 確認中… | btnGold | 実行（submit）・disabled 条件あり | 1 | 不要（現状維持） | app/login/page.tsx:70 | (1) 実行＝現状維持 |
| /mine | 送信 | btnGold | 実行（submit）・disabled 条件あり | 1 | 不要（現状維持） | app/mine/attendance-form.tsx:55 | (1) 実行＝現状維持 |
| /mine | 送信中… | btnGold | 実行（{() => void submit()}）・disabled 条件あり | 1 | 不要（現状維持） | app/mine/drink-claim-form.tsx:118 | (1) 実行＝現状維持 |
| /mine | ログアウト | btnGhost,btnSm | 補助（） | 2 | 不要（現状維持） | app/mine/layout.tsx:30 | (2) 補助＝現状維持 |
| /mine | ＋ 希望を提出 | btnGhost,btnSm | 遷移（Link href） | 3 | 要（ボタン風→link クラス） | app/mine/page.tsx:238 | (3) 済（.nox-link） |
| /mine | 一覧 › | btnGhost,btnSm | 遷移（Link href） | 3 | 要（ボタン風→link クラス） | app/mine/page.tsx:274 | (3) 済（.nox-link） |
| /mine | 出勤 | btnGold | 実行（{() => punch("in")}）・disabled 条件あり | 1 | 不要（現状維持） | app/mine/punch-actions.tsx:29 | (1) 実行＝現状維持 |
| /mine | 退勤 | btnGhost | 補助（{() => punch("out")}）・disabled 条件あり | 2 | 不要（現状維持） | app/mine/punch-actions.tsx:32 | (2) 補助＝現状維持 |
| /mine | 確認中… | gold,var(--gold | 実行（{() => void confirm()}）・disabled 条件あり | 1 | 不要（現状維持） | app/mine/shift-confirm-button.tsx:34 | (1) 実行＝現状維持 |
| /mine/wishes | 提出 | btnGold | 実行（submit）・disabled 条件あり | 1 | 不要（現状維持） | app/mine/wishes/wish-form.tsx:68 | (1) 実行＝現状維持 |
| /mine/wishes | 取り下げ | btnGhost,btnSm | 補助（{withdraw}）・disabled 条件あり | 2 | 不要（現状維持） | app/mine/wishes/withdraw-button.tsx:21 | (2) 補助＝現状維持 |
| components/nox | {c.name} var(--sub) }> {rank} } 1px 7px  | gold,var(--gold | 実行（{() => onPick(c.id)}） | 1 | 不要（現状維持） | components/nox/cast-picker.tsx:91 | (1) 実行＝現状維持 |
| components/ui | ご契約の手続きへ | gold,var(--gold | 遷移（Link href） | 3 | 要（link クラス＝青＋下線を付与） | components/ui/billing-banner.tsx:16 | (3) 済（.nox-link） |
| components/ui | {it.label} | it.href === active ? nox-tab on : nox-ta / nox-tab | 遷移（Link href） | 3 | 要（link クラス＝青＋下線を付与） | components/ui/nav.tsx:51 | 対象外＝238-d（グローバルナビ） |
| components/ui | {it.label} | it.href === active ? nox-tab on : nox-ta / nox-tab | 遷移（Link href） | 3 | 要（link クラス＝青＋下線を付与） | components/ui/nav.tsx:63 | 対象外＝238-d（グローバルナビ） |
| components/ui | {it.label} | it.href === active ? nox-navsheet-i on : | 遷移（Link href） | 3 | 要（link クラス＝青＋下線を付与） | components/ui/nav.tsx:87 | 対象外＝238-d（グローバルナビ） |
| components/ui | {it.label} | on ? active : undefined | 遷移（Link href） | 3 | 要（link クラス＝青＋下線を付与） | components/ui/side-nav.tsx:50 | 対象外＝238-d（グローバルナビ） |

## 表 B: 判定保留（相談役へ）

| 画面 | 要素の文言 | 現クラス | 挙動 | 仮分類 | 迷う理由 | 所在 | 確定分類（238-a〜g） |
|---|---|---|---|---|---|---|---|
| /analytics | {label} | period === target ? on : | タブ／表示切替（{() => { setPeriod(target); setCastSel("） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/analytics/analytics-board.tsx:526 | (4) 切替＝238-a（現状維持） |
| /analytics | 設定 | btnGhost,btnSm | モーダル／パネルを開く（{() => { setTgtInput(target === null ? "） | 1/2? | 同一画面内で開く＝実行か補助か | app/(manage)/analytics/analytics-board.tsx:600 | (2) 補助＝238-b（付け替えなし） |
| /analytics | {label} | view === k ? on : | タブ／表示切替（{() => setView(k)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/analytics/analytics-board.tsx:618 | (4) 切替＝238-a（現状維持） |
| /analytics | 顧客を見る | btnGhost,btnSm | タブ／表示切替（{() => setView("customers")}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/analytics/analytics-board.tsx:763 | (4) 切替＝238-a（現状維持） |
| /analytics | {label} | trendMode === k ? on : | タブ／表示切替（{() => setTrendMode(k)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/analytics/analytics-board.tsx:786 | (4) 切替＝238-a（現状維持） |
| /audit | {label} | ptab === k ? on : | タブ／表示切替（{() => setPTab(k)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/audit/audit-board.tsx:219 | (4) 切替＝238-a（現状維持） |
| /audit | {v.label} | view === v.key ? on : | タブ／表示切替（{() => { setView(v.key); setPage(0); set） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/audit/audit-board.tsx:244 | (4) 切替＝238-a（現状維持） |
| /audit | {fmtAt(l.at)} {l.action} {l.target} {use | nox-arow | 非 button 要素の onClick（div） | ? | タイル／行クリック＝ボタン化するか | app/(manage)/audit/audit-board.tsx:294 | 保留（238 の裁定外＝タイル／行クリック） |
| /casts | {label} | filter === k ? on : | タブ／表示切替（{() => { setFilter(k); setSel(null); }） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/casts/casts-board.tsx:396 | (4) 切替＝238-a（現状維持） |
| /casts | 体入 {tr.name} 体入 — 書類 完了 評価 {tr.rating ?  | nox-ccard $sel?.kind === trial && sel.id | スタイル判定不能（{() => { setSel({ kind: "trial", id:） | 1/2? | className／style からボタン種別が読めない | app/(manage)/casts/casts-board.tsx:480 | (4) 切替＝238-a（現状維持） |
| /casts | nox-ctag off ` : "退店"} } {c.name} 在籍 / ロ | nox-ccard $sel?.kind === cast && sel.id  | スタイル判定不能（{() => { setSel({ kind: "cast", id: ） | 1/2? | className／style からボタン種別が読めない | app/(manage)/casts/casts-board.tsx:506 | (4) 切替＝238-a（現状維持） |
| /casts | 写真を変更 | nox-photoedit | スタイル判定不能（{() => openPhoto(selCast)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/casts/casts-board.tsx:541 | (4) 切替＝238-a（現状維持） |
| /casts | {label} | dtab === k ? on : | タブ／表示切替（{() => setDtab(k)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/casts/casts-board.tsx:556 | (4) 切替＝238-a（現状維持） |
| /customers | {label} | tier === k ? on : | タブ／表示切替（{() => setTier(k)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/customers/customers-board.tsx:384 | (4) 切替＝238-a（現状維持） |
| /customers | 新しい順 | inline style | スタイル判定不能（{() => setSortOldest(false)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/customers/customers-board.tsx:429 | (4) 切替＝238-a（現状維持） |
| /customers | 掘り起こし順（来店が古い順） | inline style | スタイル判定不能（{() => setSortOldest(true)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/customers/customers-board.tsx:430 | (4) 切替＝238-a（現状維持） |
| /customers | {r.name} 1px 7px }> {gradeOf[r.customer_ | nox-crow2 $sel === r.customer_id ? sel : | スタイル判定不能（{() => setSel(sel === r.customer_id ） | 1/2? | className／style からボタン種別が読めない | app/(manage)/customers/customers-board.tsx:502 | (4) 切替＝238-a（現状維持） |
| /customers | {label} | dtab === k ? on : | タブ／表示切替（{() => setDtab(k)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/customers/customers-board.tsx:565 | (4) 切替＝238-a（現状維持） |
| /master | {BULK_LABEL[k]} | bulkTarget === k ? on : | タブ／表示切替（{() => setBulkTarget(k)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/master/business-hours-panel.tsx:316 | (4) 切替＝238-a（現状維持） |
| /master | 臨時休業 | (なし) | スタイル判定不能（） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/business-hours-panel.tsx:405 | (4) 切替＝238-a（現状維持） |
| /master | 特別営業 | (なし) | スタイル判定不能（） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/business-hours-panel.tsx:406 | (4) 切替＝238-a（現状維持） |
| /master/cast-comp | {p.name} {p.base} rate %` : p.hon_back}  | inline style | 非 button 要素の onClick（tr） | ? | タイル／行クリック＝ボタン化するか | app/(manage)/master/cast-comp/comp-sections.tsx:337 | 保留（238 の裁定外＝タイル／行クリック） |
| /master/cast-comp | {COMP_KIND_LABEL[c.kind] ?? c} rate rate | inline style | 非 button 要素の onClick（tr） | ? | タイル／行クリック＝ボタン化するか | app/(manage)/master/cast-comp/comp-sections.tsx:394 | 保留（238 の裁定外＝タイル／行クリック） |
| /master/cast-comp | {d.name} {DED_KIND_JA[d.kind] ?? d.kin}  | inline style | 非 button 要素の onClick（tr） | ? | タイル／行クリック＝ボタン化するか | app/(manage)/master/cast-comp/comp-sections.tsx:833 | 保留（238 の裁定外＝タイル／行クリック） |
| /master/cast-comp | {b.name} {metricJa(b.basis)} sales %` :  | inline style | 非 button 要素の onClick（tr） | ? | タイル／行クリック＝ボタン化するか | app/(manage)/master/cast-comp/comp-sections.tsx:957 | 保留（238 の裁定外＝タイル／行クリック） |
| /master/cast-comp/plan | ＋ 報酬プランを追加 | btnGhost,btnSm | タブ／表示切替（{() => { setSelId(null); setTab("base");） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/master/cast-comp/plan/plan-board.tsx:134 | (4) 切替＝238-a（現状維持） |
| /master/cast-comp/plan | {label} | tab === k ? on : / var(--primary | タブ／表示切替（{() => setTab(k)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/master/cast-comp/plan/plan-board.tsx:147 | (4) 切替＝238-a（現状維持） |
| /master/cast-comp/plan | ¥ {(c.amount ?? 0).toLocaleStri} guarant | inline style | 非 button 要素の onClick（tr） | ? | タイル／行クリック＝ボタン化するか | app/(manage)/master/cast-comp/plan/plan-editor.tsx:76 | 保留（238 の裁定外＝タイル／行クリック） |
| /master | 無効 | inline style | スタイル判定不能（{() => void switchStore(false)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/cast-register-panel.tsx:66 | (4) 切替＝238-a（現状維持） |
| /master | 有効 | inline style | スタイル判定不能（{() => void switchStore(true)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/cast-register-panel.tsx:67 | (4) 切替＝238-a（現状維持） |
| /master/categories | ∧ | nox-ordbtn / nox-ordbtn | スタイル判定不能（{() => move(i, -1)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/categories/categories-board.tsx:151 | (4) 切替＝238-a（現状維持） |
| /master/categories | ∨ | nox-ordbtn / nox-ordbtn | スタイル判定不能（{() => move(i, 1)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/categories/categories-board.tsx:153 | (4) 切替＝238-a（現状維持） |
| /master/categories | × | nox-formmodal-x | スタイル判定不能（{() => setModalOpen(false)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/categories/categories-board.tsx:188 | (4) 切替＝238-a（現状維持） |
| /master/categories | (文言なし: アイコン/式) | cActive ? nox-switch on : nox-switch | スタイル判定不能（{() => setCActive((v) => !v)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/categories/categories-board.tsx:202 | (4) 切替＝238-a（現状維持） |
| /master | 一律送り代 | inline style | スタイル判定不能（{() => switchMode("flat")}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/deduction-panel.tsx:82 | (4) 切替＝238-a（現状維持） |
| /master | 実費 | inline style | スタイル判定不能（{() => switchMode("actual")}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/deduction-panel.tsx:83 | (4) 切替＝238-a（現状維持） |
| /master | 保存 | inline style | スタイル判定不能（{() => void saveBase()}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/deduction-panel.tsx:102 | (4) 切替＝238-a（現状維持） |
| /master | 発行 | inline style | スタイル判定不能（{submit}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/deduction-panel.tsx:209 | (4) 切替＝238-a（現状維持） |
| /master | 無効化 | inline style | スタイル判定不能（{() => void deactivate(d)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/kiosk-device-panel.tsx:206 | (4) 切替＝238-a（現状維持） |
| /master | アカウントを発行 | inline style | スタイル判定不能（{() => void provision()}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/kiosk-device-panel.tsx:248 | (4) 切替＝238-a（現状維持） |
| /master | コピーしました ✓ | inline style | スタイル判定不能（{() => void copyIssued()}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/kiosk-device-panel.tsx:286 | (4) 切替＝238-a（現状維持） |
| /master | 閉じる | inline style | スタイル判定不能（{() => setIssued(null)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/kiosk-device-panel.tsx:287 | (4) 切替＝238-a（現状維持） |
| /master | 再設定 | inline style | スタイル判定不能（{() => openPinModal(m)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/kiosk-pin-panel.tsx:210 | (4) 切替＝238-a（現状維持） |
| /master | ポリシーを保存 | inline style | スタイル判定不能（{() => void savePolicy()}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/kiosk-pin-panel.tsx:252 | (4) 切替＝238-a（現状維持） |
| /master | キャンセル | inline style | スタイル判定不能（{() => setPinTarget(null)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/kiosk-pin-panel.tsx:285 | (4) 切替＝238-a（現状維持） |
| /master | PINを更新 | inline style | スタイル判定不能（{() => void setStaffPin(pinTarget.id） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/kiosk-pin-panel.tsx:286 | (4) 切替＝238-a（現状維持） |
| /master | 保存 | inline style | スタイル判定不能（{() => void save()}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/norm-config-panel.tsx:74 | (4) 切替＝238-a（現状維持） |
| /master/pricing | {label} | nox-pill$tab === k ?  on : | タブ／表示切替（{() => setTab(k)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/master/pricing/pricing-board.tsx:883 | (4) 切替＝238-a（現状維持） |
| /master/pricing | ∧ | nox-ordbtn / nox-ordbtn | スタイル判定不能（{() => void moveCat(i, -1)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/pricing/pricing-board.tsx:960 | (4) 切替＝238-a（現状維持） |
| /master/pricing | ∨ | nox-ordbtn / nox-ordbtn | スタイル判定不能（{() => void moveCat(i, 1)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/pricing/pricing-board.tsx:962 | (4) 切替＝238-a（現状維持） |
| /master/pricing | ∧ | nox-ordbtn / nox-ordbtn | スタイル判定不能（{() => void moveBand(i, -1)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/pricing/pricing-board.tsx:1023 | (4) 切替＝238-a（現状維持） |
| /master/pricing | ∨ | nox-ordbtn / nox-ordbtn | スタイル判定不能（{() => void moveBand(i, 1)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/pricing/pricing-board.tsx:1025 | (4) 切替＝238-a（現状維持） |
| /master/pricing | 有効 | nox-statebadge is-btn$b.allActive ?  on  | スタイル判定不能（{() => void toggleBand(b)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/pricing/pricing-board.tsx:1052 | (4) 切替＝238-a（現状維持） |
| /master/pricing | (文言なし: アイコン/式) | pvDohan ? nox-switch on : nox-switch | スタイル判定不能（{() => setPvDohan((v) => !v)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/pricing/pricing-board.tsx:1133 | (4) 切替＝238-a（現状維持） |
| /master/pricing | ∧ | nox-ordbtn / nox-ordbtn | スタイル判定不能（{() => void moveRank(idx, -1)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/pricing/pricing-board.tsx:1283 | (4) 切替＝238-a（現状維持） |
| /master/pricing | ∨ | nox-ordbtn / nox-ordbtn | スタイル判定不能（{() => void moveRank(idx, 1)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/pricing/pricing-board.tsx:1285 | (4) 切替＝238-a（現状維持） |
| /master/pricing | 有効 | nox-statebadge is-btn$rank.is_active ?   | スタイル判定不能（{() => void toggleRank(rank)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/pricing/pricing-board.tsx:1312 | (4) 切替＝238-a（現状維持） |
| /master/pricing | ルールで設定 | btnLight | タブ／表示切替（{() => setTab("rules")}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/master/pricing/pricing-board.tsx:1406 | (4) 切替＝238-a（現状維持） |
| /master/pricing | (文言なし: アイコン/式) | nox-switch | スタイル判定不能（） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/pricing/pricing-board.tsx:1697 | (4) 切替＝238-a（現状維持） |
| /master/pricing | 許可しない | (なし) | スタイル判定不能（） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/pricing/pricing-board.tsx:1727 | (4) 切替＝238-a（現状維持） |
| /master/pricing | 管理者のみ | (なし) | スタイル判定不能（） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/pricing/pricing-board.tsx:1728 | (4) 切替＝238-a（現状維持） |
| /master/pricing | すべて許可 | (なし) | スタイル判定不能（） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/pricing/pricing-board.tsx:1729 | (4) 切替＝238-a（現状維持） |
| /master/pricing | × | nox-formmodal-x | スタイル判定不能（{() => setCatModalOpen(false)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/pricing/pricing-board.tsx:1756 | (4) 切替＝238-a（現状維持） |
| /master/pricing | (文言なし: アイコン/式) | cActive ? nox-switch on : nox-switch | スタイル判定不能（{() => setCActive((v) => !v)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/pricing/pricing-board.tsx:1766 | (4) 切替＝238-a（現状維持） |
| /master/pricing | × | nox-formmodal-x | スタイル判定不能（{() => setModalOpen(false)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/pricing/pricing-board.tsx:1785 | (4) 切替＝238-a（現状維持） |
| /master/pricing | {d} | inline style | スタイル判定不能（{() => setMDays((p) => p.map((v, j) ） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/pricing/pricing-board.tsx:1864 | (4) 切替＝238-a（現状維持） |
| /master/pricing | (文言なし: アイコン/式) | mActive ? nox-switch on : nox-switch | スタイル判定不能（{() => setMActive((v) => !v)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/pricing/pricing-board.tsx:1925 | (4) 切替＝238-a（現状維持） |
| /master | 保存 | inline style | スタイル判定不能（{() => void saveCfg()}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/printer-panel.tsx:135 | (4) 切替＝238-a（現状維持） |
| /master | 再発行 | inline style | スタイル判定不能（{() => void rotate()}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/printer-panel.tsx:141 | (4) 切替＝238-a（現状維持） |
| /master | 更新 | inline style | スタイル判定不能（{() => void loadJobs()}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/printer-panel.tsx:149 | (4) 切替＝238-a（現状維持） |
| /master | ヘッダを保存 | inline style | スタイル判定不能（{() => void saveProfile()}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/printer-panel.tsx:198 | (4) 切替＝238-a（現状維持） |
| /master | コピーしました ✓ | inline style | スタイル判定不能（{() => void copyUrls()}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/printer-panel.tsx:236 | (4) 切替＝238-a（現状維持） |
| /master | 閉じる | inline style | スタイル判定不能（{() => setIssuedToken(null)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/printer-panel.tsx:237 | (4) 切替＝238-a（現状維持） |
| /master/products | 一括登録 | btnGhost | モーダル／パネルを開く（{() => setBulkOpen(true)}） | 1/2? | 同一画面内で開く＝実行か補助か | app/(manage)/master/products/products-board.tsx:439 | (2) 補助＝238-b（付け替えなし） |
| /master/products | すべて {pool.length} | nox-pill$selCat === __all ?  on : | スタイル判定不能（{() => selectHub("__all")}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/products/products-board.tsx:450 | (4) 切替＝238-a（現状維持） |
| /master/products | {h.label} {h.n} | nox-pill$selCat === h.key ?  on : | スタイル判定不能（{() => selectHub(h.key)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/products/products-board.tsx:454 | (4) 切替＝238-a（現状維持） |
| /master/products | (文言なし: アイコン/式) | showInactive ? nox-switch on : nox-switc | スタイル判定不能（{() => { setShowInactive((v) => !v);） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/products/products-board.tsx:473 | (4) 切替＝238-a（現状維持） |
| /master/products | 有効 | nox-statebadge is-btn$p.is_active ?  on  | スタイル判定不能（{() => toggleActive(p)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/products/products-board.tsx:556 | (4) 切替＝238-a（現状維持） |
| /master/products | × | nox-formmodal-x | スタイル判定不能（{() => setStockTarget(null)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/products/products-board.tsx:617 | (4) 切替＝238-a（現状維持） |
| /master/products | × | nox-formmodal-x | スタイル判定不能（{closeModal}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/products/products-board.tsx:646 | (4) 切替＝238-a（現状維持） |
| /master/products | (文言なし: アイコン/式) | nox-switch $pActive ? on : | タブ／表示切替（{() => setPActive(!pActive)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/master/products/products-board.tsx:770 | (4) 切替＝238-a（現状維持） |
| /master/products | × | nox-formmodal-x | スタイル判定不能（{onClose}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/products/products-board.tsx:876 | (4) 切替＝238-a（現状維持） |
| /master/seats | {label} | seatKind === v ? on : | タブ／表示切替（{() => setSeatKind(v)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/master/seats/seats-board.tsx:101 | (4) 切替＝238-a（現状維持） |
| /master/seats | {s.name} {s.kind} 有効 | inline style | 非 button 要素の onClick（tr） | ? | タイル／行クリック＝ボタン化するか | app/(manage)/master/seats/seats-board.tsx:111 | 保留（238 の裁定外＝タイル／行クリック） |
| /master/seats | (文言なし: アイコン/式) | nox-switch $sActive ? on : | タブ／表示切替（{() => setSActive(!sActive)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/master/seats/seats-board.tsx:138 | (4) 切替＝238-a（現状維持） |
| /master/stock | {p.name} 現在 {stock[p.id] ?? 0} | inline style | スタイル判定不能（） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/stock/stock-board.tsx:101 | (4) 切替＝238-a（現状維持） |
| /master/system | {t.label} | t.key === active.key ? on : | タブ／表示切替（{() => setCur(t.key)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/master/system/system-board.tsx:58 | (4) 切替＝238-a（現状維持） |
| /master | − | inline style | スタイル判定不能（{() => set(Math.max(15, value - 15))） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/time-pricing-panel.tsx:65 | (4) 切替＝238-a（現状維持） |
| /master | ＋ | inline style | スタイル判定不能（{() => set(Math.min(1440, value + 15） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/time-pricing-panel.tsx:67 | (4) 切替＝238-a（現状維持） |
| /master | − | inline style | スタイル判定不能（{() => set(Math.max(0, value - 500))） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/time-pricing-panel.tsx:72 | (4) 切替＝238-a（現状維持） |
| /master | ＋ | inline style | スタイル判定不能（{() => set(value + 500)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/time-pricing-panel.tsx:74 | (4) 切替＝238-a（現状維持） |
| /master | 手動 | inline style | タブ／表示切替（{() => setMode("manual")}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/master/time-pricing-panel.tsx:96 | (4) 切替＝238-a（現状維持） |
| /master | 自動 | inline style | タブ／表示切替（{() => setMode("auto")}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/master/time-pricing-panel.tsx:97 | (4) 切替＝238-a（現状維持） |
| /master | 卓単位 | inline style | スタイル判定不能（{() => setPer("table")}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/time-pricing-panel.tsx:104 | (4) 切替＝238-a（現状維持） |
| /master | 人数単位 | inline style | スタイル判定不能（{() => setPer("person")}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/master/time-pricing-panel.tsx:105 | (4) 切替＝238-a（現状維持） |
| /notices | {l} | audFilter === v ? on : | タブ／表示切替（{() => setAudFilter(v)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/notices/notices-board.tsx:461 | (4) 切替＝238-a（現状維持） |
| /payroll | {l} | rowTax === v ? on : | タブ／表示切替（{() => setRowTax(v)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/payroll/payroll-board.tsx:592 | (4) 切替＝238-a（現状維持） |
| /payroll | {r.castName} {r.taxMode} {pay?.wHours != | inline style | 非 button 要素の onClick（tr） | ? | タイル／行クリック＝ボタン化するか | app/(manage)/payroll/payroll-board.tsx:629 | 保留（238 の裁定外＝タイル／行クリック） |
| /payroll | 印刷 / PDFで保存 | btnGold | 印刷（window.print） | 2? | 補助動作だが画面外へ出る | app/(manage)/payroll/payroll-board.tsx:851 | (2) 補助＝238-c |
| /register | 会計 {g} | value === g ? on : | タブ／表示切替（{() => onChange(g)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/register/register-board.tsx:1393 | (4) 切替＝238-a（現状維持） |
| /register | 卓席・会計 | tab === tables ? on : undefined | タブ／表示切替（{() => { setTab("tables"); void loadOpen） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/register/register-board.tsx:1463 | (4) 切替＝238-a（現状維持） |
| /register | 予約 | tab === reserve ? on : undefined | タブ／表示切替（{() => setTab("reserve")}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/register/register-board.tsx:1464 | (4) 切替＝238-a（現状維持） |
| /register | 予約を入れる | btnLight | タブ／表示切替（{() => { setReservePre） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/register/register-board.tsx:1535 | (4) 切替＝238-a（現状維持） |
| /register | {s.name} 空席 | nox-seat / nox-seat | スタイル判定不能（{() => { setSeat） | 1/2? | className／style からボタン種別が読めない | app/(manage)/register/register-board.tsx:1844 | (4) 切替＝238-a（現状維持） |
| /register | 領収書を印刷 / PDF {rcptIssued.length > 1 ? `（ | btnLight | 印刷（window.print） | 2? | 補助動作だが画面外へ出る | app/(manage)/register/register-board.tsx:1990 | (2) 補助＝238-c |
| /register | 伝票取消 | btnLight,var(--bad) | モーダル／パネルを開く（{() => { setVoidReason(""); setVoidModal） | 1/2? | 同一画面内で開く＝実行か補助か | app/(manage)/register/register-board.tsx:2145 | (2) 補助＝238-b（付け替えなし） |
| /register | 合算 | btnLight | モーダル／パネルを開く（{() => { setMergeInto(""); setMergeReaso） | 1/2? | 同一画面内で開く＝実行か補助か | app/(manage)/register/register-board.tsx:2153 | (2) 補助＝238-b（付け替えなし） |
| /register | {label} | dtab === k ? on : | タブ／表示切替（{() => setDtab(k)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/register/register-board.tsx:2187 | (4) 切替＝238-a（現状維持） |
| /register | {l} | kind === v ? on : | タブ／表示切替（{() => { if (v =） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/register/register-board.tsx:2327 | (4) 切替＝238-a（現状維持） |
| /register | 相席を追加（同一会計） | btnDark | モーダル／パネルを開く（{() => setSeatPick("add")}） | 1/2? | 同一画面内で開く＝実行か補助か | app/(manage)/register/register-board.tsx:2475 | (1) 実行＝238-b（付け替えなし） |
| /register | 席を移動 | btnLight | モーダル／パネルを開く（{() => setSeatPick("move")}） | 1/2? | 同一画面内で開く＝実行か補助か | app/(manage)/register/register-board.tsx:2478 | (2) 補助＝238-b（付け替えなし） |
| /register | すべて | nox-cat$catFilter ===  ?  on : | スタイル判定不能（{() => setCatFilter("")}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/register/register-board.tsx:2595 | (4) 切替＝238-a（現状維持） |
| /register | {g.label} | nox-cat$catFilter === g.key ?  on : | スタイル判定不能（{() => setCatFilter(g.key)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/register/register-board.tsx:2598 | (4) 切替＝238-a（現状維持） |
| /register | nox-tile-badge } {p.name} {yen(p.price)} | nox-tile / nox-tile | モーダル／パネルを開く（{() => { noteRecent(p.id); if (p.back_ex） | 1/2? | 同一画面内で開く＝実行か補助か | app/(manage)/register/register-board.tsx:2616 | (1) 実行＝238-b（付け替えなし） |
| /register | nox-tile-badge } {p.name} {yen(p.price)} | nox-tile / nox-tile | モーダル／パネルを開く（{() => { noteRecent(p.id); // ★B3 裁定217:） | 1/2? | 同一画面内で開く＝実行か補助か | app/(manage)/register/register-board.tsx:2638 | (1) 実行＝238-b（付け替えなし） |
| /register | 商品をクリア（ {n} 行） | btnLight | モーダル／パネルを開く（{() => setClearModal(true)}） | 1/2? | 同一画面内で開く＝実行か補助か | app/(manage)/register/register-board.tsx:2757 | (2) 補助＝238-b（付け替えなし） |
| /register | キャストに付ける | btnLight | モーダル／パネルを開く（{() => { setClaimMsg(null); setDrinkPick） | 1/2? | 同一画面内で開く＝実行か補助か | app/(manage)/register/register-board.tsx:2877 | (2) 補助＝238-b（付け替えなし） |
| /register | 入金する A ）` : ""} | btnDark | モーダル／パネルを開く（{() => { setPayAmoun） | 1/2? | 同一画面内で開く＝実行か補助か | app/(manage)/register/register-board.tsx:3016 | (1) 実行＝238-b（付け替えなし） |
| /register | {s.name} stay num 名 ` : ""} {openStarted | [nox-seat, busy ? busy : ].filter(Boolea / nox-seat | スタイル判定不能（{() => openSeat(s)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/register/register-board.tsx:3126 | (4) 切替＝238-a（現状維持） |
| /register | {l} | value === v ? on : | タブ／表示切替（{() => onChange(v)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/register/reservation-panel.tsx:90 | (4) 切替＝238-a（現状維持） |
| /register | 全件 | nox-cat$selDate === null ?  on : | スタイル判定不能（{() => setSelDate(null)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/register/reservation-panel.tsx:383 | (4) 切替＝238-a（現状維持） |
| /register | {dt.getMonth() + 1} / {dt.getDate()} （ { | nox-cat$selDate === d ?  on : | スタイル判定不能（{() => setSelDate(d)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/register/reservation-panel.tsx:387 | (4) 切替＝238-a（現状維持） |
| /report | day | tab === k ? on : | タブ／表示切替（{() => setTab(k)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/report/report-board.tsx:559 | (4) 切替＝238-a（現状維持） |
| /report | {label} | arSort === k ? on : | タブ／表示切替（{() => setArSort(k)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/report/report-board.tsx:602 | (4) 切替＝238-a（現状維持） |
| /report | {label} | arFilter === k ? on : | タブ／表示切替（{() => setArFilter(k)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/report/report-board.tsx:608 | (4) 切替＝238-a（現状維持） |
| /report | 金種で数える | btnLight | モーダル／パネルを開く（{() => setDenomOpen(true)}） | 1/2? | 同一画面内で開く＝実行か補助か | app/(manage)/report/report-board.tsx:1151 | (2) 補助＝238-b（付け替えなし） |
| /report | - （ {DOW[dowOf(r.biz_date)]} ） {r.slips} | nox-histrow / nox-histrow | 非 button 要素の onClick（div） | ? | タイル／行クリック＝ボタン化するか | app/(manage)/report/report-board.tsx:1206 | 保留（238 の裁定外＝タイル／行クリック） |
| /shift | ＋ キャストを追加 | nox-addc | スタイル判定不能（{() => { setListOpen((v) => !v); set） | 1/2? | className／style からボタン種別が読めない | app/(manage)/shift/day-add-panel.tsx:120 | (4) 切替＝238-a（現状維持） |
| /shift | {c.name} nox-stpill nox-stpill ok | nox-crow / var(--primary | スタイル判定不能（{() => toggle(c)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/shift/day-add-panel.tsx:136 | (4) 切替＝238-a（現状維持） |
| /shift | {Number(ymd.slice(8))} var(--sub) }>休 }  | [nox-cald, ymd === focusDay ? sel : ].fi | スタイル判定不能（{() => clickDay(ymd)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/shift/shift-add-form.tsx:391 | (4) 切替＝238-a（現状維持） |
| /shift | {label} | target === k ? on : | タブ／表示切替（{() => { setDayModal(""); setTarget(k); ） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/shift/shift-board.tsx:798 | (4) 切替＝238-a（現状維持） |
| /shift | today queue )} | tab === k ? on : | タブ／表示切替（{() => { setDayModal(""); setTab(k); }） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/shift/shift-board.tsx:808 | (4) 切替＝238-a（現状維持） |
| /shift | ＋ 当日追加配置 | nox-addc | モーダル／パネルを開く（{() => { // ★SC-8 ⑦: 既） | 1/2? | 同一画面内で開く＝実行か補助か | app/(manage)/shift/shift-board.tsx:930 | (1) 実行＝238-b（付け替えなし） |
| /shift | {l} | on ? on : | タブ／表示切替（{() => { if (!on) void setAtt(s.cast_id,） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/shift/shift-board.tsx:993 | (4) 切替＝238-a（現状維持） |
| /shift | {Number(ymd.slice(8))} {FILL_LABEL[st.fi | cls | モーダル／パネルを開く（{() => { setSelDate(ymd); setDayModal("c） | 1/2? | 同一画面内で開く＝実行か補助か | app/(manage)/shift/shift-board.tsx:1126 | (1) 実行＝238-b（付け替えなし） |
| /shift | {label} | queueGroup === k ? on : | タブ／表示切替（{() => setQueueGroup(k)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/shift/shift-board.tsx:1366 | (4) 切替＝238-a（現状維持） |
| /shift | 確定シフトへ | btnLight | タブ／表示切替（{() => { setDayModal(""); setTab("roster） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/shift/shift-board.tsx:1489 | (4) 切替＝238-a（現状維持） |
| /shift | 希望を処理 | btnLight | タブ／表示切替（{() => { setDayModal(""); setTab("queue"） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/shift/shift-board.tsx:1509 | (4) 切替＝238-a（現状維持） |
| /shift | 月カレンダー | planView === cal ? on : | タブ／表示切替（{() => setPlanView("cal")}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/shift/shift-board.tsx:1566 | (4) 切替＝238-a（現状維持） |
| /shift | スタッフ別 | planView === staff ? on : | タブ／表示切替（{() => setPlanView("staff")}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/shift/shift-board.tsx:1567 | (4) 切替＝238-a（現状維持） |
| /shift | ＋ キャスト別にまとめて追加 | btnDark | モーダル／パネルを開く（{() => { setAddStatus("planned"); setAdd） | 1/2? | 同一画面内で開く＝実行か補助か | app/(manage)/shift/shift-board.tsx:1571 | (1) 実行＝238-b（付け替えなし） |
| /shift | {Number(ymd.slice(8))} nox-cald-c num /  | cls | モーダル／パネルを開く（{() => { setSelDate(ymd); setDayModal("b） | 1/2? | 同一画面内で開く＝実行か補助か | app/(manage)/shift/shift-board.tsx:1587 | (1) 実行＝238-b（付け替えなし） |
| /shift | カレンダー | rosterView === cal ? on : | タブ／表示切替（{() => setRosterView("cal")}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/shift/shift-board.tsx:1687 | (4) 切替＝238-a（現状維持） |
| /shift | 表で見る | rosterView === table ? on : | タブ／表示切替（{() => setRosterView("table")}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/shift/shift-board.tsx:1688 | (4) 切替＝238-a（現状維持） |
| /shift | 印刷 | btnLight | 印刷（window.print） | 2? | 補助動作だが画面外へ出る | app/(manage)/shift/shift-board.tsx:1692 | (2) 補助＝238-c |
| /shift | {Number(ymd.slice(8))} {list.slice(0, 3) | cls | モーダル／パネルを開く（{() => { setSelDate(ymd); setDayModal("r） | 1/2? | 同一画面内で開く＝実行か補助か | app/(manage)/shift/shift-board.tsx:1719 | (1) 実行＝238-b（付け替えなし） |
| /shift | ＋ | btnLight | モーダル／パネルを開く（{() => { ） | 1/2? | 同一画面内で開く＝実行か補助か | app/(manage)/shift/shift-board.tsx:1790 | (2) 補助＝238-b（付け替えなし） |
| /shift | × | btnLight | モーダル／パネルを開く（{() => setDayModal("")}） | 1/2? | 同一画面内で開く＝実行か補助か | app/(manage)/shift/shift-board.tsx:1997 | (2) 補助＝238-b（付け替えなし） |
| /shift | 時間を調整 | btnLight | モーダル／パネルを開く（{() => { // ★C） | 1/2? | 同一画面内で開く＝実行か補助か | app/(manage)/shift/shift-board.tsx:2018 | (2) 補助＝238-b（付け替えなし） |
| /shift | {Number(day.slice(8))} var(--v2-muted) } | cls | 非 button 要素の onClick（div） | ? | タイル／行クリック＝ボタン化するか | app/(manage)/shift/staff-shift-board.tsx:139 | 保留（238 の裁定外＝タイル／行クリック） |
| /shift | {Number(day.slice(8))} {e.map((p) => { } | cls | スタイル判定不能（{() => setSelDay(day)}） | 1/2? | className／style からボタン種別が読めない | app/(manage)/shift/staff-shift-manage.tsx:124 | (4) 切替＝238-a（現状維持） |
| /staff | — {isSelf(m) && <span style={{ } }>(自分)  | nox-srow2 | 非 button 要素の onClick（div） | ? | タイル／行クリック＝ボタン化するか | app/(manage)/staff/staff-board.tsx:199 | 保留（238 の裁定外＝タイル／行クリック） |
| /staff | {PERM_DEFS.map(([k, label]) =} type="but | nox-perms | 非 button 要素の onClick（div） | ? | タイル／行クリック＝ボタン化するか | app/(manage)/staff/staff-board.tsx:215 | 保留（238 の裁定外＝タイル／行クリック） |
| /staff | {label} | nox-perm $m[k] ? on : | タブ／表示切替（{() => void toggleFlag(m, k)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | app/(manage)/staff/staff-board.tsx:217 | (4) 切替＝238-a（現状維持） |
| /kiosk | {c.cast_name} var(--sub) }>PIN未設定 } | inline style | スタイル判定不能（{() => pick(c)}） | 1/2? | className／style からボタン種別が読めない | app/kiosk/page.tsx:175 | (4) 切替＝238-a（現状維持） |
| /kiosk | {d} | inline style | スタイル判定不能（{() => keyIn(d)}） | 1/2? | className／style からボタン種別が読めない | app/kiosk/page.tsx:201 | (4) 切替＝238-a（現状維持） |
| /kiosk | クリア | inline style | スタイル判定不能（{() => setPin("")}） | 1/2? | className／style からボタン種別が読めない | app/kiosk/page.tsx:203 | (4) 切替＝238-a（現状維持） |
| /kiosk | 0 | inline style | スタイル判定不能（{() => keyIn("0")}） | 1/2? | className／style からボタン種別が読めない | app/kiosk/page.tsx:204 | (4) 切替＝238-a（現状維持） |
| /kiosk | ⌫ | inline style | スタイル判定不能（{() => setPin((p) => p.slice(0, -1))） | 1/2? | className／style からボタン種別が読めない | app/kiosk/page.tsx:205 | (4) 切替＝238-a（現状維持） |
| /kiosk | 退勤 | inline style | スタイル判定不能（{() => void punch("out")}） | 1/2? | className／style からボタン種別が読めない | app/kiosk/page.tsx:212 | (4) 切替＝238-a（現状維持） |
| /kiosk-register | {o.user_name} {ROLE_LABEL[o.role] ?? o.r | inline style | スタイル判定不能（{() => pickOperator(o)}） | 1/2? | className／style からボタン種別が読めない | app/kiosk-register/page.tsx:606 | (4) 切替＝238-a（現状維持） |
| /kiosk-register | {d} | inline style | スタイル判定不能（{() => keyIn(d)}） | 1/2? | className／style からボタン種別が読めない | app/kiosk-register/page.tsx:633 | (4) 切替＝238-a（現状維持） |
| /kiosk-register | クリア | inline style | スタイル判定不能（{() => setPin("")}） | 1/2? | className／style からボタン種別が読めない | app/kiosk-register/page.tsx:635 | (4) 切替＝238-a（現状維持） |
| /kiosk-register | 0 | inline style | スタイル判定不能（{() => keyIn("0")}） | 1/2? | className／style からボタン種別が読めない | app/kiosk-register/page.tsx:636 | (4) 切替＝238-a（現状維持） |
| /kiosk-register | ⌫ | inline style | スタイル判定不能（{() => setPin((p) => p.slice(0, -1))） | 1/2? | className／style からボタン種別が読めない | app/kiosk-register/page.tsx:637 | (4) 切替＝238-a（現状維持） |
| /kiosk-register | {s.name} stay num 分` : "使用中"} stay num 分 | [nox-seat, oc ? busy : ].filter(Boolean) / nox-seat | スタイル判定不能（{() => void openSeat(s)}） | 1/2? | className／style からボタン種別が読めない | app/kiosk-register/page.tsx:729 | (4) 切替＝238-a（現状維持） |
| /kiosk-register | すべて | nox-cat$catFilter ===  ?  on : | スタイル判定不能（{() => setCatFilter("")}） | 1/2? | className／style からボタン種別が読めない | app/kiosk-register/page.tsx:984 | (4) 切替＝238-a（現状維持） |
| /kiosk-register | {g.label} | nox-cat$catFilter === g.key ?  on : | スタイル判定不能（{() => setCatFilter(g.key)}） | 1/2? | className／style からボタン種別が読めない | app/kiosk-register/page.tsx:987 | (4) 切替＝238-a（現状維持） |
| /kiosk-register | nox-tile-badge } {p.name} {yen(p.price)} | nox-tile / nox-tile | スタイル判定不能（{() => tb.tap(p.id)}） | 1/2? | className／style からボタン種別が読めない | app/kiosk-register/page.tsx:1002 | (4) 切替＝238-a（現状維持） |
| /mine | 印刷 / PDFで保存 | nox-noprint / btnGhost,btnSm | 印刷（window.print） | 2? | 補助動作だが画面外へ出る | app/mine/print-payslip-button.tsx:9 | (2) 補助＝238-c |
| components/nox | {label} | chip === k ? on : | タブ／表示切替（{() => setChip(k)}） | 2? | 同一画面内の切替＝補助か第 4 分類か | components/nox/cast-picker.tsx:75 | (4) 切替＝238-a（現状維持） |
| components | 元に戻す | btnSm | スタイル判定不能（{() => setEdit(edit ? null : { ） | 1/2? | className／style からボタン種別が読めない | components/simulator-panel.tsx:178 | (4) 切替＝238-a（現状維持） |
| components/ui | {children} | overlayCls | 非 button 要素の onClick（div） | ? | タイル／行クリック＝ボタン化するか | components/ui/modal.tsx:64 | 保留（238 の裁定外＝タイル／行クリック） |
| components/ui | {children} | nox-modal-card nox-cardtop | 非 button 要素の onClick（div） | ? | タイル／行クリック＝ボタン化するか | components/ui/modal.tsx:65 | 保留（238 の裁定外＝タイル／行クリック） |
| components/ui | その他 | restActive ? nox-tab on : nox-tab / nox-tab | スタイル判定不能（{() => setSheet(true)}） | 1/2? | className／style からボタン種別が読めない | components/ui/nav.tsx:68 | (4) 切替＝238-a（現状維持） |
| components/ui | メニュー {groups.map((g, gi) => { } `} class | nox-modal-overlay | 非 button 要素の onClick（div） | ? | タイル／行クリック＝ボタン化するか | components/ui/nav.tsx:76 | 保留（238 の裁定外＝タイル／行クリック） |
| components/ui | メニュー {groups.map((g, gi) => { } `} class | nox-modal-card nox-cardtop nox-navsheet | 非 button 要素の onClick（div） | ? | タイル／行クリック＝ボタン化するか | components/ui/nav.tsx:77 | 保留（238 の裁定外＝タイル／行クリック） |
| components/ui | {l} | on ? on : | タブ／表示切替（{() => { if (on) return; ） | 2? | 同一画面内の切替＝補助か第 4 分類か | components/ui/seg-select.tsx:34 | (4) 切替＝238-a（現状維持） |

## 保留の内訳

- スタイル判定不能: 92 件
- タブ／表示切替: 46 件
- モーダル／パネルを開く: 20 件
- 非 button 要素の onClick: 16 件
- 印刷: 4 件

## 画面別（分類済みのみ）

| 画面 | 実行 | 補助 | 遷移 |
|---|---|---|---|
| / | 0 | 1 | 0 | 保留 |
| /analytics | 1 | 3 | 2 | 保留 |
| /audit | 1 | 3 | 0 | 保留 |
| /billing | 2 | 3 | 0 | 保留 |
| /casts | 11 | 17 | 4 | 保留 |
| /customers | 3 | 8 | 1 | 保留 |
| /customers/[id] | 2 | 2 | 2 | 保留 |
| /dashboard | 0 | 0 | 4 | 保留 |
| /kiosk | 2 | 4 | 0 | 保留 |
| /kiosk-register | 9 | 11 | 0 | 保留 |
| /login | 1 | 0 | 0 | 保留 |
| /master | 11 | 3 | 3 | 保留 |
| /master/cast-comp | 7 | 6 | 3 | 保留 |
| /master/cast-comp/plan | 2 | 5 | 0 | 保留 |
| /master/categories | 2 | 1 | 0 | 保留 |
| /master/pricing | 6 | 9 | 3 | 保留 |
| /master/products | 4 | 9 | 0 | 保留 |
| /master/seats | 2 | 1 | 0 | 保留 |
| /master/stock | 1 | 4 | 0 | 保留 |
| /mine | 4 | 2 | 2 | 保留 |
| /mine/wishes | 1 | 1 | 0 | 保留 |
| /notices | 5 | 10 | 0 | 保留 |
| /payroll | 6 | 7 | 1 | 保留 |
| /receipts | 1 | 5 | 0 | 保留 |
| /register | 21 | 36 | 1 | 保留 |
| /report | 7 | 11 | 2 | 保留 |
| /shift | 17 | 60 | 1 | 保留 |
| /staff | 6 | 6 | 0 | 保留 |
| components/nox | 1 | 0 | 0 | 保留 |
| components/ui | 0 | 0 | 5 | 保留 |

## 確定分類の集計（2026-09-10 実装レーン）

- (1) 実行: 145 件（表 A 136＋表 B モーダル 9）
- (2) 補助: 244 件（表 A 227＋URL コピー 1＋表 B モーダル 11＋印刷 4）
- (3) リンク: 28 件（.nox-link 付け替え 25＋カード型 238-e 3）
- (4) 切替: 139 件（238-a）
- 対象外（グローバルナビ 238-d）: 4 件
- 保留（非 button 要素の onClick）: 16 件

## 注記（機械判定の限界＝相談役の目で見直す箇所）

- 表 A の「遷移 34」のうち、components/ui の 5 件は**グローバルナビ（nox-tab／nox-navsheet）**＝画面遷移だが「青文字＋下線」にするかは別判断（保留候補・第 4 分類「ナビ」の可能性）。
- 「/register URL コピー（btnLight）」は `location` 文字列参照で遷移と誤判定＝実体はクリップボード（補助・2）。
- 「/dashboard {s.icon} {s.label}（nox-quicktile）」「/master {inner}（nox-fcard）」は**カード全体が Link**＝青文字下線に直すと崩れる（保留候補・カード型リンク）。
- 表 B「スタイル判定不能 92」の内訳は主に (a) 行／カード選択（nox-ccard・nox-crow2・setSel）＝選択 UI、(b) 並べ替え矢印（nox-ordbtn ∧∨）、(c) 二値トグル対（有効／無効・新しい順／古い順・臨時休業／特別営業）、(d) 写真変更（nox-photoedit）＝いずれも「実行／補助」より「選択・切替」に近い＝第 4 分類か「補助」に寄せるかの裁定が要る。
- 表 B「タブ／表示切替 46」は同一画面内の nox-seg／"on" トグル＝238 の 3 分類の外（現状のセグメント表現を維持するなら除外リストへ）。
- 表 B「モーダル／パネルを開く 20」は開く動作を「実行」とみなすか「補助」とみなすかで 1／2 が変わる（同一画面内・遷移ではない）。
- 表 B「非 button 要素の onClick 16」は席タイル・履歴行・写真等＝クリック可能な領域。ボタン化（1／2）するか、対象外にするか。
- 「印刷 4」は window.print＝画面外へ出るが遷移ではない（補助・2 が自然）。
