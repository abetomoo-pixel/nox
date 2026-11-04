# 0194 手貼り案内（確定版＝裁定445 反映・2026-11-04 適用済み）

## 手貼りの記録（2026-11-04・Agoora）
- **1 回で Success**（begin の直後の `set local lock_timeout = 10s;` は本文に含めた＝0193 のように手で足す必要なし・deadlock なし）。
- verify の返り **19 行＝期待値と全行一致**（Agoora の返り・CC が同じ verify を読取で流した返りの両方）。関数 410・表 116。
- 本文＝supabase/migrations/0194_manager_open5.sql（sha16 c6ab2b20dc9b6167＝手貼りした本体と同じ）。
- 適用後の live（docs/tmp/live_0194.mjs・BEGIN…ROLLBACK）＝14/14・DB 変更 0。

**結論 3 行**
1. 0194＝裁定444（2026-11-04 確定）の「店長に開く 5」のうち DDL の 4 関数（① kiosk_provision／kiosk_delete ② set_store_receipt_profile ③ staff_payroll_run_set_status）＋ admin の CHECK 外し（相談役 11/03 ③）＋ スタッフ給与の確定額 staff_labor_confirmed（裁定439・**裁定445 ①②＝内訳ごと凍結・時給は RPC で再計算・保存は staff_attendance_confirm 1 本＝4 引数**）＋ キオスクの在庫タイル kiosk_stock_levels（裁定445 ③＝読取だけ）。④ api/payroll/mark-paid・⑤ api/staff/update-email は route の判定だけ＝DDL なし（0194 のフラグ true 便の client＝裁定445 ④）。
2. live（0193 適用後）から生成（手打ちなし）・**begin の直後に set local lock_timeout = '10s'（教訓132）**・試走 BEGIN…ROLLBACK＝verify 20 行が期待どおり・動作 **28/28**・**409／115 → (tx 内 410／116) → 409／115＝DB 変更 0**。
3. 手順は 0193 と同じ＝本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor で事前確認 SQL（返り＝貼り先証明 1 行だけなら貼ってよい）→ 全文を 1 回 Run（begin〜commit の単一トランザクション・lock_timeout で待ち続けない＝失敗したら無傷で貼り直し）→ 末尾の verify のコメントを外して貼り、返りを CC へ。営業中でも貼れる（memberships の ALTER は一瞬・作り直す 6 関数は営業中に呼ばれない）。**staff_attendance_confirm は旧署名（3 引数）を drop して 4 引数で作り直す**＝今の client は 3 引数で呼ぶ＝p_labor の既定 null で従来どおり動く（0192c suite の呼び方も不変）。

| 項目 | 値 |
|---|---|
| ファイル（下書き v2） | docs/tmp/0194_manager_open5.sql（336 行・30,003 B・LF）→ 確定後に supabase/migrations/0194_manager_open5.sql へ |
| sha256 | 先頭 16 桁 **c6ab2b20dc9b6167**（全桁 c6ab2b20dc9b6167afcd7222caad18e41034520678d298a2e9f922748d1d3b78）。**v1（裁定445 前）＝216e190c7a5b55d2 は破棄** |
| 翻訳元 | live pg_get_functiondef（2026-11-04・0193 適用後・scratchpad/live0194＝docs/tmp/dump_live_0192.mjs）＋生成器 docs/tmp/gen_0194.cjs・verify＝docs/tmp/gen_0194_verify.cjs |
| 試走 | docs/tmp/try_0194.mjs（教訓128＝行頭マーカー・commit; の不在 assert・lock_timeout の 1 行 assert・関数数を tx の外で前後に）＝ 2026-11-04 15:2x **28/28・DB 変更 0** |
| 根拠 | 台帳 裁定444／裁定439／**裁定445**／相談役 11/03 §0-2 ③⑥／docs/tmp/k2_plan.md／docs/tmp/0193_role_scan.md 第 2 節（18 行＝開く 5・残り 13 は管理者のまま） |

**中身**
- ★1 店長に開く（自店）＝kiosk_provision（p_store_id＝自店・上限 3 台は不変）・kiosk_delete（自店の無効化済みの端末だけ）・set_store_receipt_profile（自店）・staff_payroll_run_set_status（自店の run・前進のみは不変）。他店は forbidden・スタッフは forbidden。
- ★2 admin＝memberships_role_check を owner／manager／staff／cast に（行が残っていれば DO ブロックで raise＝貼れない・本番 0 行）・set_membership_role の受け口から admin を外す（client は 0193 のフラグ true 便で候補から外し済み）。auth_role（admin→owner の写し）等の関数は触らない（値が無いので無害）。
- ★3（裁定445 ①②）staff_labor_confirmed（membership_id×period・**pay_kind／hourly／minutes／time_pay／fixed／monthly／daily／days／amount／deductions（控除の内訳 jsonb）／calc_version**／confirmed_by）。保存は **staff_attendance_confirm(p_store_id, p_period, p_lock, p_labor jsonb default null)**＝p_lock=true のとき p_labor の行を同じトランザクションで凍結（店×月を丸ごと置換・audit に人数と合計）。**時給制の行は RPC が 時給 × 実働 ÷ 60 を再計算**（端数は店設定 settings_json.labor_rounding＝down（既定・切捨て＝staffPayOf の floorYen と同じ）／up／round）して time_pay と一致・amount＝time_pay＋fixed と一致、違えば 'labor mismatch' で raise（トランザクションごと落ちる＝確定も入らない）。解除（p_lock=false）で額も消す（見込みに戻る）。RLS select＝管理者／自店の店長／本人の行。v1 の別 RPC staff_labor_confirmed_set は廃止。
- ★4 kiosk_stock_levels()＝端末の店（auth_kiosk_register_store_id）・操作担当の解除あり（auth_kiosk_operator）・track_stock の品の在庫（stock_logs の合計＝product_stock_totals と同じ式）・読取のみ。書込（開栓・補充）の kiosk 腕は入れない（裁定445 ③）。

**CC 注（裁定445 の読み替え 2 点＝違えば直す）**
1. 「staff_attendance_unlock で額も消す」＝解除の関数は別に無い（0192 は staff_attendance_confirm の p_lock=false が解除）。その経路で staff_labor_confirmed を消す形にした（別関数は作らない）。
2. 「端数は店設定」＝スタッフ給与の端数の店設定は無い（今は floorYen 固定）。settings_json.labor_rounding（down 既定／up／round）を RPC が読む形で仮置き＝UI は作らない・既定は今の計算と同じ。

## 事前確認 SQL（貼る前・SELECT のみ）＝返りが貼り先証明 1 行だけなら OK
```sql
select 'nox-project-proof' k, count(*)::text v from public.orgs
union all
select 'md5 drift ' || x.n, coalesce(left(md5(replace(p.prosrc, chr(13), '')), 8), 'missing')
  from (values ('kiosk_provision','ab75d422'),('kiosk_delete','93f674cb'),('set_store_receipt_profile','d1fb7e3d'),('staff_payroll_run_set_status','f9352445'),
               ('set_membership_role','303c8895'),('staff_attendance_confirm','9572d741')) x(n, m)
  left join pg_proc p on p.pronamespace='public'::regnamespace and p.proname = x.n
 where p.oid is null or left(md5(replace(p.prosrc, chr(13), '')), 8) <> x.m
union all
select 'staff_attendance_confirm not arity 3', count(*)::text from pg_proc where pronamespace='public'::regnamespace and proname='staff_attendance_confirm' and pronargs <> 3 having count(*) > 0
union all
select 'admin rows (must be 0)', count(*)::text from public.memberships where role = 'admin' having count(*) > 0
union all
select 'already exists ' || proname, '' from pg_proc where pronamespace='public'::regnamespace and proname in ('kiosk_stock_levels','staff_labor_confirmed_set')
union all
select 'already exists staff_labor_confirmed', '' where to_regclass('public.staff_labor_confirmed') is not null;
```

## 貼る本文
docs/tmp/0194_manager_open5.sql の全文（1 行目のコメント〜 `commit;` まで・末尾の `-- ===== verify =====` 以下はコメント＝そのまま貼ってもよい）。begin; の直後の `set local lock_timeout = '10s';` は本文に入っている（0193 のように手で足す必要はない）。

## verify（手貼り後・SQL Editor で読取だけ）＝docs/tmp/0194_verify.sql（mig 末尾のコメントと同じ・先頭に貼り先証明）
## verify の期待値（試走 2026-11-04 の返り）
| 行 | 期待値 |
|---|---|
| nox-project-proof | 10 |
| functions | **410**（409＋kiosk_stock_levels 1・staff_attendance_confirm は作り直し＝±0） |
| tables | **116**（115＋staff_labor_confirmed） |
| has 0194 | 9 |
| new fn kiosk_stock_levels | 1 |
| staff_attendance_confirm arity 4 (1) | 1 |
| staff_attendance_confirm arity 3 (0) | 0 |
| staff_labor_confirmed rls/policies/grants | true/1/authenticated:SELECT |
| staff_labor_confirmed cols (17) | 17 |
| memberships_role_check without admin | 1 |
| admin rows | 0 |
| acl diff (new 1 + arity 4) | 0 |
| md5 kiosk_provision | 54135aa2 =file |
| md5 kiosk_delete | 9d05ac36 =file |
| md5 set_store_receipt_profile | 06866803 =file |
| md5 staff_payroll_run_set_status | b1b8fdec =file |
| md5 set_membership_role | 16fcc87e =file |
| md5 staff_attendance_confirm | 9bb9a0be =file |
| md5 kiosk_stock_levels | 5c5a6c7d =file |

## 適用後に CC がやること（0194 のフラグ true 便＝v57 §8-3・裁定445 ④）
verify の全行突合 → MIG_0194_APPLIED=true（lib/nox/rules-0175/flag.ts に新設） → pin 張替え（anon-guard 段35 manager kiosk_provision forbidden・段36 manager set_store_receipt_profile forbidden・関数 409→410・表 115→116・billing の名簿＋grants の ACL に新 RPC と 4 引数の署名）→ client＝④ api/payroll/mark-paid（guardPayroll の owner 限定を外す＝manager は自店）⑤ api/staff/update-email（decideOwnerAccess→owner∨manager 自店の staff）・店長に開く 3 画面（端末の発行・削除／領収書の店情報／スタッフ給与 run の状態）・「この月を確定」で p_labor（lib/nox/staff/labor.ts の内訳＝calc_version）を送る・確定後は凍結額（staff_labor_confirmed）を表示して再計算しない（月報の「スタッフ人件費（確定）」も）・キオスクの在庫タイル ready → live の RPC 層（BEGIN…ROLLBACK）→ f0 2 連 → lint＋tsc → commit → push → 6 店 reset → 報告 3 行。
