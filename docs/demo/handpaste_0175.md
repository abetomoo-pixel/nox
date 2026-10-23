# 0175 手貼り案内（Agoora 向け・**v2＝2026-10-23 起草**・便 CN-R→0175 起草 v2＝v1（10/22）に CANON 型（裁定418）・412 追補・R-4・PR-1 の器を追加。**v1 は貼らない（Downloads から撤去済み）・P175 は v2**）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に **Downloads/0175_rules_bundle_v2_draft.sql** の全文を貼って Run（1 本だけ・所要 1〜3 分）。**順序＝P175（v2）→P176→P177**（0176 は 0175 の列を前提・0177 は独立だが番号順）。Downloads の `0175_staff_is_active_guard.sql`／`0176_workstyle_limits_manager_only.sql` は **BANZEN のファイル＝NOX には貼らない**。
2. 中身＝v1 の ★1〜★10（393 追補2／3・402・店設定キー 4・405／407・410／I-3／I-5・日払い取消・便 S 起票・起票117・396・税既定 外税・W-24・408 追補1・356・398・397＋413・399・400）＋**v2 の ★11〜★20**＝CANON 型 ①〜⑳（店設定キー 8・支払方法の割引行・comp_plans 12 列（back_rate_tiers 含む）と slide_basis 'pay_rate'・固定額＋率の併用・時間帯テーブル plan_rate_bands・ノルマ区分 plan_norm_tiers・イベント加算 plan_event_bonuses・判定ログ兼提案 slide_decisions・時給の変更履歴 cast_rate_history・RPC 8）＋attendance の 'dohan' 撤去（同伴の正本＝伝票・既存行は shukkin へ）＋daily_pay_issue の上限の表（6 引数）。
3. Success 後に **docs/demo/verify_0175_0176.sql（1 文）** を貼り、**返った行（ok 列）を CC へ貼る**（0175 だけの時点では mig='0176' の行が false＝想定どおり）。client（P175）は 0175 の適用確認後。

## 1. 貼る前に

| 確認 | 期待 |
|---|---|
| アドレスバー | `https://supabase.com/dashboard/project/hiqbfagmkrdpmlqhkmsu/sql/new`（`project/` の直後が hiqbfagmkrdpmlqhkmsu） |
| ファイル | Downloads/0175_rules_bundle_v2_draft.sql（docs/tmp の同名と同一・repo の supabase/migrations には**収蔵前**＝適用確認後に 0175_rules_bundle.sql として収蔵） |
| sha256 | `9b5a47b46d44dbcb2369048a64b553eca24211a3d0895a440c35a3ea8c691b04`（266,399 B・3,177 行・LF・CR 0・**v2 最終＝10/23 便 SH-UI-b2 B2-0 で CSV 18 店の器 3 を追加**）。v1（62cdac53…）は撤去 |
| 順序 | **0174 の後・0176／0177 の前**。0177（送り 4 方式）とは触る関数が重ならない（0177＝transport 系 6 本・0175＝set_store_profile／check_pay／punch_self／attendance_set／daily_pay_issue 等）＝再確認 10/23 で競合 0 |
| 生成器 | docs/tmp/gen_0175.mjs（写経元＝docs/tmp/0175_live.json＝2026-10-22／23 SELECT 読取・pg_get_functiondef）。live の md5 pin: check_pay c11691b8・check_group_due 5c667792・receipt_issue a7f04e4c・set_store_profile 45012c75・set_comp_plan 21afb3f5・cast_sales_aggregate 34a0bf1e・payroll_adjustment_add 0feabfac・check_set_nominations 97dd24bb・demo_org_reset 3cdf7a30・punch_self 952f18a4・punch_proxy a760e1a4・attendance_set 7a56ca05・daily_pay_issue 94f989f9 |
| 構文検査 | scripts/mig-check.mjs＝libpg_query（294 文）＋ローカル Postgres 18（plpgsql 33 本・ROLLBACK）で **errors 0**（2026-10-23） |

手元で再計算する場合（Git Bash）:

```bash
sha256sum ~/Downloads/0175_rules_bundle_v2_draft.sql
```

ファイルは `begin;`〜`commit;` の単一トランザクション。冒頭に貼り先証明 `select 'nox-project-proof', count(*) from public.orgs;`（9 行）。途中で失敗すれば全部戻る。

★overload 罠: check_pay（8→10 引数）・receipt_issue（4→6）・set_comp_plan（30→32）・payroll_adjustment_add（11→14）・punch_self（4→7）・**daily_pay_issue（5→6・v2）**は冒頭で旧署名を drop（0172／0173 と同じ）。既存 client の呼び出しは新しい引数が default 付きなのでそのまま通る（P175 を待たない）。CANON 拡張の 11 列は set_comp_plan の引数を増やさず **comp_plan_ext_set（jsonb patch）** で書く。
★既存データの書換え＝comp_plans.slide_method の導出（27 行）と **attendance.status 'dohan'→'shukkin'**（件数は verify の「dohan 行 0」で確認・今日タブの「同伴」ボタンは PR-1 で外す＝伝票の同伴が正本・裁定417）。他は列追加（既定値つき）と関数置換。
★デモとの順序: NOT NULL の新列（stores／comp_plans／pricing_rules／staff_contracts）は既定値あり＋**同じトランザクションで demo_org_reset を「payload に無い列は表の既定値」へ置き換える**（起票117）ので、翌朝 06:05 の reset（デプロイ済み payload に新列が無い）は失敗しない。payload の attendance に status 'dohan' は**無い**（2026-10-23 確認＝6 店 0 件）＝新 CHECK で load は落ちない。
★client との順序: 新しい引数は全部 default 付き・新設 RPC は client が無くても害なし。計算側（給与の cancelled_at 除外・sales_split equal・pt・VIP タイミング・丸め・報酬率スライド・時間帯・ノルマ区分・イベント加算・予約バック・時給の履歴）は P175 で読み替える＝適用直後は従来どおりの計算。**取消 RPC（payroll_adjustment_cancel／daily_pay_cancel）の cancelled_at を計算側が除外する分は PR-1 の R-2（営業日ごとの時給解決）と同じ便（P175 client）で入れる。**

## 2. 貼る

1. SQL Editor の新規タブに `0175_rules_bundle_v2_draft.sql` の全文（冒頭コメントから `-- ===== end 0175 =====` まで）を貼る。
2. Run。右下に Success が出たら時刻（JST）を控える。

## 3. 検証（Success の後・1 文で）

**Supabase SQL Editor は最後の文の結果しか返さない（恒久注意31）**＝`docs/demo/verify_0175_0176.sql` の全文を新規タブに貼って Run（SELECT のみ）。

| 見るところ | 期待 |
|---|---|
| ok 列 | mig='0175' と 'both' の行が全部 true（'0176' の行は P176 まで false・「関数数 357」「表数 104」も P176 後） |
| 「md5 不一致の関数名」の v | 0175 の 33 本は一致（set_my_contact は 0176 適用後は 0176 の値＝P176 まで 1 本だけ名前が出る） |
| 「新表 8（v2）」「comp_plans v2 列 12」「dohan 行 0」「v2 新設 RPC 8」 | 8／12／1/0／8 |
| 「関数数」「表数」 | 0175 だけなら **334／95**・P176 後 357／104 |

返すもの: 行の結果＋Success 時刻。CC が live 照合→md5 pin の張替え・名簿・anon-guard／grants／rls の段→suite（verify:nox-0175-0176）を f0 に追加→client（P175）→f0 2 連→push。

**Success 表示は適用の証明にならない（恒久注意28）＝上の 1 文の返り値（ok 列）を貼ってから次便を出す。**

## 4. 適用記録
- （未適用・2026-10-22 v1 起草→2026-10-23 v2 起草。v1 は Downloads から撤去）
