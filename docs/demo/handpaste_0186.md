# 0186 手貼り案内（Agoora 向け・2026-10-26 起草・便 W-10＝「準備中」の「作る」の DB 分）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に **supabase/migrations/0186_w10_make.sql** の全文を貼って Run（1 本だけ）。0180〜0185 と順不同（独立）。
2. 中身＝①特別営業日・臨時休業（表 store_special_days＋登録／削除の RPC・シフトの定休日判定と予約の定休日判定が特別日を先に見る）②機能の公開の「既定に従う」へ戻す（flag_unset）③納付記録の取消（withholding_payment_cancel・理由必須）④監査ログを出力した記録（audit_export_record）。
3. Success 後に **末尾 ===== verify =====** を貼り、返った行を CC へ（期待＝special table true・special grant SELECT・rpc 5 が 5・closed-day 0186 が 2）。

| 項目 | 値 |
|---|---|
| ファイル | supabase/migrations/0186_w10_make.sql（215 行・14,816 B・LF・CR 0） |
| sha256 | 先頭 16 桁 **15143fd04f488674** |
| 翻訳元 | live pg_get_functiondef（2026-10-26 20:0x・shift_is_closed_day md5 388546cd／reservation_is_closed_day b8d1c52a）＋生成器 docs/tmp/gen_0186.cjs（新設の表 1・RPC 5 は生成器の文字列） |
| 適用後の md5 | set_store_special_day **c79f75e9**・remove_store_special_day **9d6f499b**・flag_unset **6a77903f**・withholding_payment_cancel **538bb64a**・audit_export_record **db4f0a69**・shift_is_closed_day **8c2434a2**・reservation_is_closed_day **54e0bb33** |
| 構文検査 | scripts/mig-check.mjs＝OK（errors 0・plpgsql 7） |
| 試走 | 本番で BEGIN…ROLLBACK（docs/tmp/t0186_rollback.mts・NOX-VERIFY-A1）＝**5/5 OK** |

**試走で確かめたこと**
- 特別日＝臨時休業で定休日扱い（shift_is_closed_day true）・特別営業で営業（時間必須＝無ければ bad time）・スタッフは forbidden・予約の判定も同じ・削除で曜日の設定に戻る。
- flag_unset＝店の上書きが消える・2 回目は何もしない（冪等）・店長は forbidden・audit flag_unset。
- 納付記録の取消＝理由なしは reason required・取消で消える・2 回目は not found・店長は forbidden。
- 監査ログの出力の記録＝オーナーのみ・期間の逆は bad range・audit に件数と目的。anon は permission denied・RPC 5 本は authenticated のみ・表は authenticated＝SELECT だけ。

**適用後に CC がやること**: フラグ MIG_0186_APPLIED を true（lib/nox/rules-0175/flag.ts と scripts/demo/rules-0175-flag.mjs）→suite の pin 張替え（関数数・grants の表数）→live（営業時間の特別日・機能の公開の「既定に従う」・納付記録の取消・監査ログの CSV 出力）。

ファイルは `begin;`〜`commit;` の単一トランザクション。冒頭に貼り先証明 `select 'nox-project-proof', count(*) from public.orgs;`。

**Success 表示は適用の証明にならない（恒久注意28）＝verify の返り値を貼ってから次へ。**
