# 0184 手貼り案内（Agoora 向け・2026-10-26 起草・裁定431 ②＝日払いの源泉 10.21% を整数で）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に **supabase/migrations/0184_withholding_integer.sql** の全文を貼って Run（1 本だけ・数秒）。0180〜0183 と順不同（独立）。
2. 中身＝daily_pay_issue の源泉の 1 式だけ（× 0.1021 の小数 → × 1021 ÷ 10000 の整数・1 円未満切捨て）。代表値で旧式と同じ額（試走で確認）。給与（TS）は便 431 で同じ式に切替済み。
3. Success 後に **末尾 ===== verify =====** を貼り、返った行を CC へ（期待＝daily_pay_issue integer true・acl に authenticated あり）。

| 項目 | 値 |
|---|---|
| ファイル | supabase/migrations/0184_withholding_integer.sql（97 行・7,838 B・LF・CR 0） |
| sha256 | 先頭 16 桁 **94c5fcab2281d17b** |
| 翻訳元 | live pg_get_functiondef（2026-10-26 17:4x・daily_pay_issue md5 1bdd3260）＋生成器 docs/tmp/gen_0184.cjs（手打ちなし） |
| 適用後の md5 | daily_pay_issue **31094062** |
| 構文検査 | scripts/mig-check.mjs＝OK（errors 0・plpgsql 1） |
| 試走 | 本番で BEGIN…ROLLBACK（docs/tmp/t0184_rollback.mts）＝関数の式が整数・代表 7 値（0／4,999／5,000／15,000／25,000／54,321／1,234,567）で新旧が同額 |

**変えないもの**: 5,000 円 × 日数（支払時 1 日）＝裁定431 ⑤（税理士 T17 待ち）。紹介料（referral_payout_pay）は既に整数系。

ファイルは `begin;`〜`commit;` の単一トランザクション。冒頭に貼り先証明 `select 'nox-project-proof', count(*) from public.orgs;`。

**Success 表示は適用の証明にならない（恒久注意28）＝verify の返り値を貼ってから次へ。**
