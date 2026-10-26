# 0182 手貼り案内（Agoora 向け・2026-10-26 起草・便 ON-4＝裁定427 席移動で席種が変わるときの料金＝C2-23）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に **supabase/migrations/0182_check_move_seat_pricing.sql** の全文を貼って Run（1 本だけ）。0180／0181 と順不同（独立）。
2. 中身＝checks に列 service_pre（既定 '{}'）・check_group_due と check_move_seat の 2 本を置換。席種が変わらない移動・入金済みの卓・既存の伝票は今までと同じ（service_pre が空なら従来の式）。
3. Success 後に **末尾 ===== verify =====** を貼り、返った行を CC へ（期待＝service_pre 1・move_seat has 0182 true・group_due has 0182 true・group_due acl に authenticated なし・move_seat acl に authenticated あり）。

| 項目 | 値 |
|---|---|
| ファイル | supabase/migrations/0182_check_move_seat_pricing.sql（316 行・24,374 B・LF・CR 0） |
| sha256 | 先頭 16 桁 **454bf43a4c790086** |
| 翻訳元 | live pg_get_functiondef（2026-10-26 15:4x・check_move_seat md5 29d94b48／check_group_due md5 ade16c7e）＋生成器 docs/tmp/gen_0182.cjs（手打ちなし） |
| 適用後の md5 | check_move_seat **837b2d11**・check_group_due **875291c8** |
| 構文検査 | scripts/mig-check.mjs＝OK（errors 0・plpgsql 2） |
| 試走 | 本番で BEGIN…ROLLBACK（docs/tmp/t0182_rollback.mts・NOX-VERIFY-A1 に一時の料金ルール）＝9/9 OK |

**試走で確かめたこと（裁定427 ①〜⑤＋Agoora 確定 10/26 ①）**
- ① セット中に 卓→VIP＝セット行 5,000→8,000（置換・1 行のまま）・サ率 10→35・移動前の分は旧率で凍結（service_pre A＝母数 5,000・サ料 500）・合計 8,000＋500＋3,000×35%＝9,550→店の丸めで 9,500。
- ② 延長中に 卓→VIP＝セット行は 5,000 のまま・移動した時点の延長行が 2,000→5,000（VIP 延長パターンなし＝通常延長＋差額 3,000）・その後の延長も 5,000。
- ④ VIP→卓＝VIP のセット行は残る（返金なし）・サ率は店の率に戻り、VIP 時間の分は 35% で凍結。
- 同種間（卓→卓）＝何も変えない。⑤ 入金済み＝席は移るが料金は変えない。
- service_pre が空の既存伝票 3 件＝check_group_due が今の total と同じ値（従来の式と同値）。anon は permission denied。

ファイルは `begin;`〜`commit;` の単一トランザクション。冒頭に貼り先証明 `select 'nox-project-proof', count(*) from public.orgs;`。途中で失敗すれば全部戻る。

**適用後に CC がやること**: verify_0175_0176.sql の pin（check_group_due dc4163e6→875291c8）張替え→フラグ SEAT_MOVE_PRICING_APPLIED を true（lib/nox/rules-0175/flag.ts と scripts/demo/rules-0175-flag.mjs）→レジの席移動に確認ダイアログ→live（VIP 卓のある店で開卓→VIP へ移動→明細）。

**Success 表示は適用の証明にならない（恒久注意28）＝verify の返り値を貼ってから次へ。**
