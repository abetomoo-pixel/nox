# 0181 手貼り案内（Agoora 向け・2026-10-26 起草・便 ON-2＝卓種別のサービス率（CANON ②＝VIP 35%）を check_open が凍結）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に **supabase/migrations/0181_check_open_service_rate_by_seat.sql** の全文を貼って Run（1 本だけ・所要 10 秒）。0180 と順不同（独立）。急ぎではない（適用前は従来＝店の率を凍結）。
2. 中身＝check_open 1 本の置換。v_seat に stores.service_rate_by_seat（0175 ★11 の列＝set_store_profile の patch で書く・{"VIP": 35} の形＝seats.kind がキー・小文字も可）を足し、キーがあればその率を checks.service_rate に凍結。無ければ店の率（従来と 1 バイト同値）。既存の open 伝票は非遡及。
3. Success 後に **末尾 ===== verify ===== の (2)** を貼り、返った行を CC へ貼る（期待＝md5 **9869c236**・has_star t・proacl {postgres,service_role,authenticated}）。

| 項目 | 値 |
|---|---|
| ファイル | supabase/migrations/0181_check_open_service_rate_by_seat.sql（330 行・22,603 B・LF・CR 0） |
| sha256 | 先頭 16 桁 **10769e5f9d9603ea** |
| 翻訳元 | live pg_get_functiondef（2026-10-26・md5 c67dcab6）に ★1 の 2 か所（生成器 docs/tmp/gen_0181.cjs・手打ちなし） |
| 試走 | 本番で BEGIN…ROLLBACK（2026-10-26 13:4x JST）＝CREATE 成功・NOX-VERIFY-A1 に {"VIP": 35} と VIP 卓を置いて owner が開卓→VIP 卓 35／通常卓 10（店の率）・md5 9869c236 |
| 構文検査 | scripts/mig-check.mjs（教訓116）＝OK（errors 0・plpgsql 1） |
| ACL | CREATE OR REPLACE で保たれる（postgres／service_role／authenticated・anon なし） |

ファイルは `begin;`〜`commit;` の単一トランザクション。冒頭に貼り先証明 `select 'nox-project-proof', count(*) from public.orgs;`（9 行）。途中で失敗すれば全部戻る。

**適用後に CC がやること**: verify_0175_0176.sql の pin（check_open）を 9869c236 に張替え→0158／p172 の pin→デモ MUSE の reset（stores.service_rate_by_seat {"VIP": 35}・VIP 卓）→live（MUSE の VIP 卓を開卓→明細のサービス料 35%）。

**Success 表示は適用の証明にならない（恒久注意28）＝(2) の返り値を貼ってから次へ。**
