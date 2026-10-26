# 0179 手貼り案内（Agoora 向け・2026-10-26 起草・便 ON-1＝0175 v2 ★2 の欠陥修正・緊急・0178 の次）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に **supabase/migrations/0179_receipt_issue_reissue_fix.sql** の全文を貼って Run（1 本だけ・所要 10 秒）。0178 の後。
2. 中身＝receipt_issue 1 本の置換。0175 ★2（裁定402 再発行）で v_amt の既定を 1 式（`coalesce(p_amount, case when p_reissue_of is not null then v_old.amount else … end)`）に書いたため、plpgsql が未代入の record v_old を式の準備時に解決できず、**通常の発行が全部「record "v_old" is not assigned yet」で落ちる**（10/26 の手貼り以降、デモ 6 店と CLUB NOX で領収書が 1 枚も発行できない状態）。直し＝if p_reissue_of is not null then … else … end if（意味は同じ）。
3. Success 後に **末尾 ===== verify ===== の (2)(3)** を貼り、返った行を CC へ貼る（期待＝md5 **c564a8d7**・has_star t・proacl {postgres,authenticated,service_role}／(3) 0 件）。

| 項目 | 値 |
|---|---|
| ファイル | supabase/migrations/0179_receipt_issue_reissue_fix.sql（187 行・14,852 B・LF・CR 0） |
| sha256 | 先頭 16 桁 **1206583f893c41a9** |
| 翻訳元 | live pg_get_functiondef（2026-10-26・md5 8f036095＝0175 v2 適用後の値）に ★1 の 1 か所だけ |
| 試走 | 本番で BEGIN…ROLLBACK（2026-10-26 12:2x JST）＝CREATE 成功・md5 c564a8d7・NOX-VERIFY-A1 の manager で receipt_issue（金額指定／省略）2 回とも成功 |
| 構文検査 | scripts/mig-check.mjs（教訓116）＝OK（errors 0・plpgsql 1） |
| ACL | 写経元と同じ（postgres／authenticated／service_role・anon なし）＝revoke／grant を明示 |

ファイルは `begin;`〜`commit;` の単一トランザクション。冒頭に貼り先証明 `select 'nox-project-proof', count(*) from public.orgs;`（9 行）。途中で失敗すれば全部戻る。

**適用後に CC がやること**: verify_0175_0176.sql（receipt_issue の pin＝c564a8d7 へ張替え済み）で全 true→receipt-ledger 単独緑→f0 2 連→便 ON-1 の commit／push→6 店 reset→live。

**Success 表示は適用の証明にならない（恒久注意28）＝(2)(3) の返り値を貼ってから次へ。**
