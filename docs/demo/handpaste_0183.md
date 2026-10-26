# 0183 手貼り案内（Agoora 向け・2026-10-26 起草・便 M＝裁定429 シフト権限／M-4 新規客の予約／M-7 ノルマ未達の意思保存＋★4 裁定432 源泉区分と控除の入れ方＝同日 相乗り）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に **supabase/migrations/0183_shift_staff_reservation_guest_norm_intent.sql** の全文を貼って Run（1 本だけ）。0180〜0182 と順不同（独立）。
2. 中身＝①シフトの 11 本で「シフト ON のスタッフ＝店長と同じ」（裁定429）②キャストの新規客の予約（呼び名＋人数）と来店時の顧客カルテ作成（M-4）③ノルマ未達の適用／除外を意思として保存する表（M-7）。既存の動きは変えない（owner／manager は従来どおり・担当客の予約も従来どおり）。
3. Success 後に **末尾 ===== verify =====** を貼り、返った行を CC へ（期待＝can_shift 句 11・guest fn 1・rtc has 0183 true・**432 tables 2・432 rpc 3・432 kind cols 2**・intents 1・intents grant SELECT）。

| 項目 | 値 |
|---|---|
| ファイル | supabase/migrations/0183_shift_staff_reservation_guest_norm_intent.sql（909 行・59,631 B・LF・CR 0） |
| sha256 | 先頭 16 桁 **045043b7edb2bac9**（★4 相乗り後・旧 1819fa1f69b61575 は破棄） |
| 翻訳元 | live pg_get_functiondef（2026-10-26 16:5x・14 本）＋生成器 docs/tmp/gen_0183.cjs（手打ちなし）＋★4 の新設分＝docs/tmp/0183_432.sql（新しい列 2・表 2・RPC 3＋内部 2） |
| 適用後の md5（代表） | shift_set **338c83b2**・shift_confirm_bulk **2fb071c0**・shift_period_set **14d16c28**・reservation_request_guest **7b524da5**・reservation_to_check **70d9158c**・norm_shortfall_decide **38b85613** |
| 構文検査 | scripts/mig-check.mjs＝OK（errors 0・plpgsql 17・sql 2） |
| 試走 | 本番で BEGIN…ROLLBACK（docs/tmp/t0183_rollback.mts・NOX-VERIFY-A1）＝8/8 OK（★4 の 4 段を含む） |

**試走で確かめたこと**
- ★1 シフト OFF のスタッフ＝forbidden・ON＝配置（planned）→確定（shift_confirm_bulk）・期間を作って作成中から直接公開・キャストは不可のまま。
- ★2 キャストが「田中様（試走）・2 名」で申請（customer_id なし・承認待ち）→店長が承認→来店＝顧客カルテ（名前＝呼び名・担当＝申請したキャスト）ができ、予約と伝票に紐づく。呼び名なしは拒否・店長はキャスト専用 RPC を呼べない。
- ★4 区分＝店長が cast／staff を変更（null で既定）・不正値は bad kind・スタッフは forbidden／額の指定＝その期だけ（自動 12,345→指定 10,000・税理士確認済み）・audit に元額と指定額・本人は自分の行を読める・null で外す／社員の控除＝0 の行は保存しない（3 行）・その他は名前付き・本人が読める・[] で空／確定済みの期は period finalized・anon と内部 2 本は BLOCKED。
- ★3 適用→除外で 1 行（最後の意思と理由）・除外の理由なしは拒否・キャストからは 0 行。anon は permission denied。

ファイルは `begin;`〜`commit;` の単一トランザクション。冒頭に貼り先証明 `select 'nox-project-proof', count(*) from public.orgs;`。途中で失敗すれば全部戻る。

**適用後に CC がやること**: フラグ MIG_0183_APPLIED を true（lib/nox/rules-0175/flag.ts と scripts/demo/rules-0175-flag.mjs）→suite の pin 張替え（関数数・grants の表数）→live（⑧ 小林（スタッフ・シフト ON）で 11/3 に配置・M-4 新規客で予約申請・M-7 適用後に罰金を追加→提案額が更新）。

**Success 表示は適用の証明にならない（恒久注意28）＝verify の返り値を貼ってから次へ。**
