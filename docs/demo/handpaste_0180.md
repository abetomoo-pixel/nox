# 0180 手貼り案内（Agoora 向け・2026-10-26 起草・便 414 追補＝送りの定額徴収に距離区分 3 段・キャストの送り区分）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に **supabase/migrations/0180_okuri_flat_tiers.sql** の全文を貼って Run（1 本だけ・所要 10 秒）。0179 の後。急ぎではない（client はフラグ配下で眠らせてある＝適用前は従来の 1 店 1 額）。
2. 中身＝★1 set_store_profile の白名単 +okuri_flat_tiers（配列・最大 3・{code,name,amount}・code 一意・amount 整数 ≥0）／★2 casts +okuri_tier（区分 code・null＝ベース額）＋CHECK／★3 okuri_today_summary＝退勤の送りの既定額をキャストの区分の額に（無ければ okuri_base_amount・当日の金額は発行時に変更可）／★4 set_cast_okuri_tier（新設・manager 以上・自店・店の区分にある code だけ・監査あり）。
3. Success 後に **末尾 ===== verify ===== の (2)(3)(4)** を貼り、返った行を CC へ貼る（期待＝md5 set_store_profile **ffc76412**・okuri_today_summary **d1b5ca84**・set_cast_okuri_tier **719129cd**／casts.okuri_tier text null 可＋CHECK／白名単 true）。

| 項目 | 値 |
|---|---|
| ファイル | supabase/migrations/0180_okuri_flat_tiers.sql（884 行・85,908 B・LF・CR 0） |
| sha256 | 先頭 16 桁 **57a84a11276ba974** |
| 翻訳元 | live pg_get_functiondef（2026-10-26）＝set_store_profile 23cd5573／okuri_today_summary e61e5dd9／写経元 set_cast_shift_request_mode（生成器 docs/tmp/gen_0180.cjs・手打ちなし） |
| 試走 | 本番で BEGIN…ROLLBACK（2026-10-26）＝CREATE 3 本成功・NOX-VERIFY-A1 の owner で 3 段の保存→読み戻し一致→set_cast_okuri_tier 'mid' 成功→'bogus' は 'bad tier'→code 重複は 'bad type'→okuri_today_summary 実行可 |
| 構文検査 | scripts/mig-check.mjs（教訓116）＝OK（errors 0・plpgsql 3） |
| ACL | 既存 2 本＝CREATE OR REPLACE で保たれる・新設 1 本＝authenticated（anon なし） |

ファイルは `begin;`〜`commit;` の単一トランザクション。冒頭に貼り先証明 `select 'nox-project-proof', count(*) from public.orgs;`（9 行）。途中で失敗すれば全部戻る。

**適用後に CC がやること**: verify_0175_0176.sql の pin（set_store_profile・okuri_today_summary）を新 md5 に張替え→0158／p172 の pin→client のフラグ（OKURI_TIERS_APPLIED）を true→f0 2 連→live（ACE＝距離区分 3 段 500／1,000／1,500・キャスト詳細の送り区分・給与の送り控除が区分の額）。

**Success 表示は適用の証明にならない（恒久注意28）＝(2)(3)(4) の返り値を貼ってから次へ。**
