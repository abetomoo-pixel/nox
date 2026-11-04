# 0195 手貼り案内（下書き・2026-11-04 夜の自走便 6＝相談役の朝の裁定待ち・手貼りは合図まで待つ）

## ★推奨案で仮置きした点（相談役が朝に裁定・変更があれば再生成＝docs/tmp/gen_0195.cjs）
1. **§5-1 ④ キャスト別の額の上書き**＝裁定447 ④の具体化どおり **deduction_rule_casts**（rule×cast・enabled／amount_override・行が無い＝全員に店の額）。run 別の上書き（0156）は最優先のまま。
2. **§5-2 キオスクの退勤の「今日の控除」**＝打刻（kiosk_punch）の後の**別 RPC**＝cast_day_deductions_set の kiosk 腕（操作担当あり・端末の店のキャスト・audit は service＝actor 操作担当）。kiosk_punch は触らない。
3. **§5-3 月のまとめの「固定」→「月額控除」の改名**＝client だけ（DDL なし）＝フラグ true 便で。
4. **§5-4 pick（その日に選ぶ）の既定＝off**（on にした日だけ cast_day_deductions に行・always は off にした日だけ行）。
5. **§6-② 「その他」の内部の値**＝案 (a)＝deductions.kind の CHECK に **'other'** を足す（既存行の値は触らない＝画面の 2 択は表示の写し）。
6. **§9 固定手当の複数行**＝**staff_allowances**（membership×名称・月額・20 行まで・全行置換）を同乗。月の確定＝staff_attendance_confirm の行に `allowances`（内訳）を受けて **staff_labor_confirmed.allowances** に凍結（fixed＝合計は client が足す＝amount＝time_pay＋fixed の検査は不変・calc_version は client で上げる）。
7. **M-77 ②③ の DDL**＝line_links.blocked_at＋line_link_block（service_role だけ＝Webhook の unfollow）／line_link_remove（管理者・自店の店長）。push の抑止（blocked_at が null の行だけ）と再紐付けの null 戻しは route 側（フラグ true 便）。
9. **staff_allowances の RLS の本人**＝`membership_id = public.auth_membership_id()`（0194 の staff_labor_confirmed と同じ型・staff_contracts の users 結合の型は試走の harness で本人が 0 行になるため採らない）。
8. **cast_day_deductions_set の店の人の柵**＝管理者（org 内）・自店の店長（スタッフは不可＝勤怠の修正モーダルは店長以上の経路）。deduction_rule_casts_get はスタッフも読める（給与画面）。

**結論 3 行**
1. 0195＝裁定447 差し替え版（日ごとの控除ルール）＋M-73（pay_rate・other）＋裁定447 ④（deduction_rule_casts）＋M-77 ②③ の DDL＋M-80 追記②（staff_allowances）＝表 +3・列 +3・RPC 新設 6・作り直し 2（set_deduction 10 引数＝旧 9 引数 drop・staff_attendance_confirm ±0）。
2. live（0194 適用後）から生成（手打ちなし）・**begin の直後に set local lock_timeout = '10s'（教訓132）**・試走 BEGIN…ROLLBACK＝2026-11-04 20:5x **41/41・DB 変更 0**（410／116 → tx 内 416／119 → 410／116・verify 22 行が期待値と全行一致）。
3. 手順は 0194 と同じ＝本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor で事前確認 SQL（返り＝貼り先証明 1 行だけなら貼ってよい）→ 全文を 1 回 Run（begin〜commit）→ 検証クエリ（期待値と全行一致）→ CC に返り 22 行を貼る。

| 項目 | 値 |
|---|---|
| ファイル（下書き） | docs/tmp/0195_day_deductions.sql（444 行・LF）→ 確定後に supabase/migrations/0195_day_deductions.sql へ |
| sha256 | 先頭 16 桁 **50d8359957b32506** |
| 翻訳元 | live pg_get_functiondef（2026-11-04・0194 適用後・scratchpad/live0195＝docs/tmp/dump_live_0192.mjs）＋生成器 docs/tmp/gen_0195.cjs・検証＝docs/tmp/0195_verify.sql |
| 試走 | docs/tmp/try_0195.mjs（教訓128＝行頭マーカー・commit; の不在 assert・lock_timeout の 1 行 assert・関数数を tx の外で前後に）＝ 2026-11-04 20:5x **41/41・DB 変更 0**（410／116 → tx 内 416／119 → 410／116・verify 22 行が期待値と全行一致） |
| 根拠 | 台帳 裁定447（差し替え版）／M-73／裁定447 ④／M-77／M-80 追記②／docs/tmp/0195_plan.md §1〜§9 |
| 関数数・表数 | 410／116 → **416／119**（新設 6＝cast_day_deductions_set・deduction_rule_cast_set・deduction_rule_casts_get・line_link_block・line_link_remove・staff_allowances_set） |

**中身**
- ★1 deductions＝列 day_rule（always／pick・既定 always）・per の CHECK に pay_rate・kind の CHECK に other・set_deduction を 10 引数（p_day_rule DEFAULT 'always'）に作り直し（旧 9 引数は drop＝9 引数の呼び出しは DEFAULT で従来どおり）。
- ★2 cast_day_deductions（cast×biz_date×deduction・enabled＝既定と違う日だけ行）＋cast_day_deductions_set（rows＝[{deduction_id, enabled}]・既定どおりは delete・違う行は upsert・per=day かつ有効なルールだけ・確定済みの月（payroll_runs finalized／paid）は 'finalized'）。RLS select＝org ∧（管理者 ∨ 自店の店長・スタッフ ∨ 本人）∨ kiosk 腕。
- ★3 deduction_rule_casts（rule×cast・enabled／amount_override）＋deduction_rule_cast_set（enabled=true かつ override=null は行を消す）／deduction_rule_casts_get(p_store_id)。
- ★4 line_links.blocked_at＋line_link_block(p_store_id, p_line_user_id)（service_role だけ・戻り＝更新行数・audit は userId なし）／line_link_remove(p_subject_kind, p_subject_id)（管理者・自店の店長・delete・audit）。
- ★5 staff_allowances＋staff_allowances_set(p_membership_id, p_rows)（管理者＝org 内／店長＝自店の staff・20 行まで・全行置換）・staff_labor_confirmed.allowances（jsonb・既定 []）・staff_attendance_confirm の行に allowances。

## 事前確認 SQL（貼る前・SELECT のみ）＝返りが貼り先証明 1 行だけなら OK
```sql
select 'nox-project-proof' k, count(*)::text v from public.orgs
union all
select 'md5 drift ' || x.n, coalesce(left(md5(replace(p.prosrc, chr(13), '')), 8), 'missing')
  from (values ('set_deduction','8ca7f0df'),('staff_attendance_confirm','9bb9a0be')) x(n, m)
  left join pg_proc p on p.pronamespace='public'::regnamespace and p.proname = x.n
 where p.oid is null or left(md5(replace(p.prosrc, chr(13), '')), 8) <> x.m
union all
select 'already applied', 'yes' from information_schema.columns where table_schema='public' and table_name='deductions' and column_name='day_rule';
```

## 本文
docs/tmp/0195_day_deductions.sql の全文（begin〜commit を 1 回 Run）。URL の ref＝hiqbfagmkrdpmlqhkmsu を目視してから。

## 検証クエリ（貼った後）＝docs/tmp/0195_verify.sql（22 行・期待値は各行の見出しに）
| k | 期待 |
|---|---|
| nox-project-proof | orgs の件数（10） |
| fn count | 416 |
| table count | 119 |
| set_deduction 10 args／9 args | 1／0 |
| new fns | 6 |
| col deductions.day_rule／line_links.blocked_at／staff_labor_confirmed.allowances | yes／yes／yes |
| check per has pay_rate／kind has other／day_rule | yes／yes／yes |
| rls on 3 tables | 3 |
| table grants authenticated | SELECT,SELECT,SELECT |
| table grants anon | 0 |
| anon exec on 8 fns | 0 |
| authenticated exec on 7 fns | 7 |
| line_link_block authenticated／service_role | f／t |
| policies on 3 tables | 3 |
| deductions day_rule default always | 0 |

## 手貼りの後（CC）
verify の全行突合 → 収蔵（supabase/migrations/0195_day_deductions.sql）→ MIG_0195_APPLIED=true（flag.ts）→ フラグ true 便の client（docs/tmp/0195_plan.md §2・§6・§7・§8・§9 の画面）→ pin 張替え（関数数 416・表数 119・grants・billing 名簿・anon-guard・verify:nox-0195 新設）→ f0 2 連 → push。
