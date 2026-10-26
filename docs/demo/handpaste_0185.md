# 0185 手貼り案内（Agoora 向け・2026-10-26 起草・QR 便＝裁定423 変更＋本番のキオスク解除の不具合の直し）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に **supabase/migrations/0185_kiosk_qr_reverse.sql** の全文を貼って Run（1 本だけ）。0180〜0184 と順不同（独立）。
2. 中身＝①キオスクの QR の向きを逆に（キオスクが QR を出す→本人のスマホで読む→本人の権限で開く・無操作 3 分）②**本番の不具合の直し**＝レジ端末の「PIN だけで解除」（kiosk_unlock）が 0175 の search_path の書き方と min(uuid) で**常に失敗していた**＝2 か所を直す（totp_code_of も同じ直し）。
3. Success 後に **末尾 ===== verify =====** を貼り、返った行を CC へ（期待＝tables rls `kiosk_qr_claims:true,kiosk_qr_keys:true`・table grants 0・rpc 3 行とも authenticated あり・retired 2 行 true・operator qr 180 true・**search_path fixed true**・qr_secret left 0）。

| 項目 | 値 |
|---|---|
| ファイル | supabase/migrations/0185_kiosk_qr_reverse.sql（265 行・20,300 B・LF・CR 0） |
| sha256 | 先頭 16 桁 **a00055c966c294e1** |
| 翻訳元 | live pg_get_functiondef（2026-10-26 20:3x・auth_kiosk_operator／kiosk_unlock／kiosk_unlock_qr／my_qr_secret／totp_code_of）＋生成器 docs/tmp/gen_0185.cjs（新設の表 2・RPC 3 は生成器の文字列） |
| 構文検査 | scripts/mig-check.mjs＝OK（errors 0・plpgsql 8） |
| 試走 | 本番で BEGIN…ROLLBACK（docs/tmp/t0185_rollback.mts・NOX-VERIFY-A1）＝**17/17 OK** |

**試走で確かめたこと**
- 端末の秘密鍵（2 回目は同じ）→TOTP の QR を店長が読む＝解除（店名つき）→同じ QR の 2 回目は used→端末が受け取る（無操作 ≤180 秒・qr）・2 回目は pending→auth_kiosk_operator が店長。
- スタッフ＝レジ権限 OFF は no_permission・ON は解除（前の解除は relogin で終わる）／キャスト（店のキャストのレジ操作 OFF）＝punch_only（打刻だけ）／違うコード＝wrong_token と失敗回数 +1／形が違う＝bad_token／anon は permission denied／端末でない人の poll は forbidden。
- 旧向き（my_qr_secret／kiosk_unlock_qr）＝retired。
- **PIN だけの解除（kiosk_unlock）＝スタッフの PIN で解除できる・違う PIN は wrong_pin・search_path の壊れた関数 0**（試走の前は本番で `min(uuid) does not exist`・`gen_random_bytes／hmac does not exist` で失敗することを同じ方法で確認）。

**今の本番への影響（0185 を貼るまで）**: レジ端末は「PIN だけで解除」を使わず、従来の「操作担当を選んで PIN」（kiosk_login＝本番で動く）に戻してある（client の変更・フラグ MIG_0185_APPLIED＝false）。

**適用後に CC がやること**: フラグ MIG_0185_APPLIED を true（lib/nox/rules-0175/flag.ts と scripts/demo/rules-0175-flag.mjs）→suite の pin 張替え（関数数・grants の表数）→live（キオスクに QR・スマホで読む・3 分で戻る・PIN だけの解除）。

ファイルは `begin;`〜`commit;` の単一トランザクション。冒頭に貼り先証明 `select 'nox-project-proof', count(*) from public.orgs;`。途中で失敗すれば全部戻る。

**Success 表示は適用の証明にならない（恒久注意28）＝verify の返り値を貼ってから次へ。**
