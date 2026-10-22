# 0175 手貼り案内（Agoora 向け・2026-10-22 起草・便 0175／0176 起草＝裁定393 追補2／3・402・404・405・407・408 追補1・409・410／X13-I・396・356・397＋413 追補1・398／399／400（BZ-R）・起票117・便 S 起票・W-24・新規店の税既定）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に **Downloads/0175_rules_bundle_draft.sql** の全文を貼って Run（1 本だけ・所要 1〜3 分）。**順序＝P175→P176→P177**（0176 は 0175 の列を前提・0177 は独立だが番号順）。
2. 中身＝①check_pay の手数料 ON／OFF と率（393 追補2）・手数料行は税込（追補3）②receipt_issue の日付訂正と再発行（402）③店設定キー 4（就業規則・達成ボーナスの段・売上の分け方・店の既定 pt ルール）＋comp_plans の slide_method／pt_rules（407／405・移行 SQL）④精算調整の種別・元記録・取消と日払いの取消（410／I-3／⑤）・除外理由の audit（I-5）⑤着席ログの created_at 引継ぎ（便 S）⑥demo_org_reset の load＝無い列は表の既定値（起票117）⑦本採用 RPC（396）・税既定 外税・W-24 メモ列・VIP のタイミング（408 追補1）・スタッフ給与 run の確定（356）⑧打刻設定の列 9＋同意ログ＋店 Wi-Fi RPC＋punch_self の範囲判定（398）⑨基本の働き方 availability／availability_terms＋RPC（397＋413）・staff_contracts／memberships の列（399）⑩users の連絡先＋set_my_contact（400）。
3. Success 後に **docs/demo/verify_0175_0176.sql（1 文）** を貼り、**返った行（ok 列）を CC へ貼る**（0175 だけの時点では mig='0176' の行が false＝想定どおり）。client（P175）は 0175 の適用確認後。

## 1. 貼る前に

| 確認 | 期待 |
|---|---|
| アドレスバー | `https://supabase.com/dashboard/project/hiqbfagmkrdpmlqhkmsu/sql/new`（`project/` の直後が hiqbfagmkrdpmlqhkmsu） |
| ファイル | Downloads/0175_rules_bundle_draft.sql（docs/tmp の同名と同一・repo の supabase/migrations には**収蔵前**＝適用確認後に 0175_rules_bundle.sql として収蔵） |
| sha256 | `62cdac53d53135d7b235e1279ec8b7a041c164bd856226dd9839367cefd872b9`（198,394 B・2,447 行・LF・CR 0） |
| 順序 | **0174 の後・0176／0177 の前**。0177（送り 4 方式）とは触る関数が重ならない（0177＝transport 系 6 本・0175＝set_store_profile／check_pay／punch_self 等） |
| 生成器 | docs/tmp/gen_0175.mjs（写経元＝docs/tmp/0175_live.json＝2026-10-22 SELECT 読取・pg_get_functiondef）。live の md5 pin: check_pay c11691b8・check_group_due 5c667792・receipt_issue a7f04e4c・set_store_profile 45012c75・set_comp_plan 21afb3f5・cast_sales_aggregate 34a0bf1e・payroll_adjustment_add 0feabfac・check_set_nominations 97dd24bb・demo_org_reset 3cdf7a30・punch_self 952f18a4・punch_proxy a760e1a4 |
| 構文検査 | scripts/mig-check.mjs＝libpg_query（175 文）＋ローカル Postgres 18（plpgsql 23 本・ROLLBACK）で **errors 0**（2026-10-22） |

手元で再計算する場合（Git Bash）:

```bash
sha256sum ~/Downloads/0175_rules_bundle_draft.sql
```

ファイルは `begin;`〜`commit;` の単一トランザクション。冒頭に貼り先証明 `select 'nox-project-proof', count(*) from public.orgs;`（9 行）。途中で失敗すれば全部戻る。

★overload 罠: check_pay（8→10 引数）・receipt_issue（4→6）・set_comp_plan（30→32）・payroll_adjustment_add（11→14）・punch_self（4→7）は冒頭で旧署名を drop（0172／0173 と同じ）。既存 client の呼び出しは新しい引数が default 付きなのでそのまま通る（P175 を待たない）。grant は drop 後に revoke public, anon／grant authenticated を明示（demo_org_reset・check_group_due・cast_sales_aggregate・check_set_nominations・set_store_profile・punch_proxy は create or replace＝ACL 不変）。
★デモとの順序: 本 mig は stores／comp_plans／pricing_rules／staff_contracts に NOT NULL の新列を足す（既定値あり）が、**同じトランザクションで demo_org_reset を「payload に無い列は表の既定値」へ置き換える**（起票117）ので、翌朝 06:05 の reset（デプロイ済み payload に新列が無い）は失敗しない（E-20 の事故の再発防止＝0175 自身が処置）。
★client との順序: 新しい引数は全部 default 付き・新設 RPC は client が無くても害なし。comp_plans.slide_method は移行 SQL で埋まる（売上の段あり→sales・pt の段→point・無し→none＝デモ ACE＝sales／LUNA＝point の見込み）。計算側（給与の cancelled_at 除外・sales_split equal・pt・VIP タイミング・丸め）は P175 で読み替える＝適用直後は従来どおりの計算。

## 2. 貼る

1. SQL Editor の新規タブに `0175_rules_bundle_draft.sql` の全文（冒頭コメントから `-- ===== end 0175 =====` まで）を貼る。
2. Run。右下に Success が出たら時刻（JST）を控える。

## 3. 検証（Success の後・1 文で）

**Supabase SQL Editor は最後の文の結果しか返さない（恒久注意31）**＝`docs/demo/verify_0175_0176.sql` の全文を新規タブに貼って Run（SELECT のみ）。

| 見るところ | 期待 |
|---|---|
| ok 列 | mig='0175' と 'both' の行が全部 true（'0176' の行は P176 まで false） |
| 「md5 不一致の関数名」の v | 0175 の 23 本は一致（set_my_contact は 0176 適用後は 0176 の値＝P176 まで 1 本だけ名前が出る） |
| 「関数数」「表数」 | 349／99 は **P176 の後**の値（0175 だけなら 326／90） |

返すもの: 行の結果＋Success 時刻。CC が live 照合→md5 pin の張替え・名簿・anon-guard／grants／rls の段→suite（verify:nox-0175-0176）を f0 に追加→client（P175）→f0 2 連→push。

**Success 表示は適用の証明にならない（恒久注意28）＝上の 1 文の返り値（ok 列）を貼ってから次便を出す。**

## 4. 適用記録
- （未適用・2026-10-22 起草）
