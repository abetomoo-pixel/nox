# 0178 手貼り案内（Agoora 向け・2026-10-26 起草・便 ON-1＝0175 v2 ★29 の欠陥修正・緊急）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に **supabase/migrations/0178_check_group_due_closed_fix.sql** の全文を貼って Run（1 本だけ・所要 10 秒）。0175／0176／0177 の後（10/26 手貼り済みを前提）。
2. 中身＝check_group_due 1 本の置換（★29「開いている伝票は stores の丸めを読む」の select … into が、closed（該当行なし）のとき v_unit／v_mode を NULL で上書きしていた→ if found のときだけ上書き）。**適用前の本番＝確定済み伝票の due が全部 NULL**（demo 6 店 closed 5,176 件で実測）＝cast_sales_aggregate の g.due > 0 で**キャスト売上・ノルマ・歩合・スライドが 0**（f0 payroll F2c-2／裁定97-B が赤・live の給与も 0 売上）。
3. Success 後に **末尾 ===== verify ===== の (2)(3)** を貼り、返った行を CC へ貼る（期待＝md5 **dc4163e6**・has_star t・proacl {postgres=X/postgres}／closed の null_due **0**・same_as_total 5,176 前後）。

| 項目 | 値 |
|---|---|
| ファイル | supabase/migrations/0178_check_group_due_closed_fix.sql（94 行・8,339 B・LF・CR 0） |
| sha256 | 先頭 16 桁 **6a952a2811c5eaad** |
| 翻訳元 | live pg_get_functiondef（2026-10-26・md5 ea7754a9＝0175 v2 適用後の値）に ★1 の 1 か所だけ |
| 試走 | 本番で BEGIN…ROLLBACK（2026-10-26 11:5x JST）＝CREATE 成功・md5 dc4163e6・closed 5,176 件の null_due 0・same_as_total 5,176・open 31 件の null 0 |
| 構文検査 | scripts/mig-check.mjs（教訓116）＝台帳の便エントリに結果 |
| ACL | 内部専用（postgres のみ）＝CREATE OR REPLACE で保たれる＋4 ロール revoke を明示（0175 と同じ） |

ファイルは `begin;`〜`commit;` の単一トランザクション。冒頭に貼り先証明 `select 'nox-project-proof', count(*) from public.orgs;`（9 行）。途中で失敗すれば全部戻る。

**適用後に CC がやること**: verify_0175_0176.sql の md5 pin（check_group_due＝dc4163e6 へ張替え済み）で全 true→f0 2 連→便 ON-1 の commit／push→6 店 reset→live。

**Success 表示は適用の証明にならない（恒久注意28）＝(2)(3) の返り値を貼ってから次へ。**
