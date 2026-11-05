# 0195 手貼り案内（裁定450 反映版・2026-11-05＝11/04 夜の下書き 50d8359957b32506 を裁定450 の 6 で再生成）

## 手貼りの記録（2026-11-05・Agoora）
- 本番 ref hiqbfagmkrdpmlqhkmsu に **本文（sha16 90ed3a2656aed407・449 行）を 1 回 Run**。★順序＝本文を Run した**後**に事前確認 SQL を流した（返り＝already applied yes・md5 drift set_deduction 8b319af5／staff_attendance_confirm 3fea3e3f＝0195 適用後の本文の md5）。次回からは事前確認→本文の順（手順 3 行目のとおり）。
- CC の突合（読取だけ・2026-11-05）＝①verify（docs/tmp/0195_verify.sql）を本番に SELECT＝**21 行（貼り先証明を含む）が期待値と全行一致・不一致 0**（関数 416・表 119・set_deduction 10 引数 1／9 引数 0・新設 6・列 3 yes・CHECK 3 yes・RLS 3・grants SELECT×3／anon 0・anon exec 0／authenticated exec 7・line_link_block authenticated f／service_role t・policies 3・day_rule 非 always 0）。②本番の set_deduction／staff_attendance_confirm の prosrc md5（CR 除去・先頭 8）＝**8b319af5／3fea3e3f＝0195_day_deductions.sql（90ed3a2656aed407）の $function$ 本体の md5 と一致**＝貼ったのは裁定450 反映版（prosrc は SQL Editor の CRLF で逐語は違う＝0180〜0186 と同じ・md5 は CR 除去で同じ）。③新設 3 表の行 0・day_rule 非 always 0・blocked_at 0・直近 3 時間の audit 0＝データは動いていない。
- 収蔵＝supabase/migrations/0195_day_deductions.sql（docs/tmp のバイトそのまま）・MIG_0195_APPLIED=true（lib/nox/rules-0175/flag.ts）→ フラグ true 便。

## ★仮置き 9 点＝裁定450（2026-11-05 朝・相談役）で確定＝1・2・3・4・5・7・8・9 は推奨案のまま承認・**6 だけ変更**（RPC 側でも検証）→ gen_0195.cjs に反映して live から再生成
1. **§5-1 ④ キャスト別の額の上書き**＝裁定447 ④の具体化どおり **deduction_rule_casts**（rule×cast・enabled／amount_override・行が無い＝全員に店の額）。run 別の上書き（0156）は最優先のまま。
2. **§5-2 キオスクの退勤の「今日の控除」**＝打刻（kiosk_punch）の後の**別 RPC**＝cast_day_deductions_set の kiosk 腕（操作担当あり・端末の店のキャスト・audit は service＝actor 操作担当）。kiosk_punch は触らない。
3. **§5-3 月のまとめの「固定」→「月額控除」の改名**＝client だけ（DDL なし）＝フラグ true 便で。
4. **§5-4 pick（その日に選ぶ）の既定＝off**（on にした日だけ cast_day_deductions に行・always は off にした日だけ行）。
5. **§6-② 「その他」の内部の値**＝案 (a)＝deductions.kind の CHECK に **'other'** を足す（既存行の値は触らない＝画面の 2 択は表示の写し）。
6. **§9 固定手当の複数行**＝**staff_allowances**（membership×名称・月額・20 行まで・全行置換）を同乗。月の確定＝staff_attendance_confirm の行に `allowances`（内訳）を受けて **staff_labor_confirmed.allowances** に凍結。**★裁定450 の 6＝RPC 側でも検証**＝staff_attendance_confirm が行の allowances の月額を合計し、内訳の fixed と一致しなければ **'labor mismatch: fixed % <> sum(allowances) %'** で raise（裁定445 ①と同じ型＝client の合計を信用しない・pay_kind に関係なく全行・要素の形が悪ければ 'bad allowances'）。amount＝time_pay＋fixed の検査はそのまま・calc_version は client で上げる。allowances を送らない行は Σ 0 として扱う＝fixed 0 なら通る（旧 client の行は壊れない）・fixed>0 なら raise＝**フラグ true 便の client は契約の fixed_allowance 1 本も allowances の 1 行として送る**。
7. **M-77 ②③ の DDL**＝line_links.blocked_at＋line_link_block（service_role だけ＝Webhook の unfollow）／line_link_remove（管理者・自店の店長）。push の抑止（blocked_at が null の行だけ）と再紐付けの null 戻しは route 側（フラグ true 便）。
9. **staff_allowances の RLS の本人**＝`membership_id = public.auth_membership_id()`（0194 の staff_labor_confirmed と同じ型・staff_contracts の users 結合の型は試走の harness で本人が 0 行になるため採らない）。
8. **cast_day_deductions_set の店の人の柵**＝管理者（org 内）・自店の店長（スタッフは不可＝勤怠の修正モーダルは店長以上の経路）。deduction_rule_casts_get はスタッフも読める（給与画面）。

**結論 3 行**
1. 0195＝裁定447 差し替え版（日ごとの控除ルール）＋M-73（pay_rate・other）＋裁定447 ④（deduction_rule_casts）＋M-77 ②③ の DDL＋M-80 追記②（staff_allowances）＝表 +3・列 +3・RPC 新設 6・作り直し 2（set_deduction 10 引数＝旧 9 引数 drop・staff_attendance_confirm ±0＝裁定450 の 6 の検査 3 行を追加）。
2. live（0194 適用後・2026-11-05 に md5 を再照合＝set_deduction 8ca7f0df／staff_attendance_confirm 9bb9a0be＝11/04 と同じ）から生成（手打ちなし）・**begin の直後に set local lock_timeout = '10s'（教訓132）**・試走 BEGIN…ROLLBACK＝2026-11-05 **46/46・DB 変更 0**（410／116 → tx 内 416／119 → 410／116・verify 22 行が期待値と全行一致・11/04 の 41 に裁定450 の 6 の 5 段を追加）。
3. 手順は 0194 と同じ＝本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor で事前確認 SQL（返り＝貼り先証明 1 行だけなら貼ってよい）→ 全文を 1 回 Run（begin〜commit）→ 検証クエリ（期待値と全行一致）→ CC に返り 22 行を貼る。

| 項目 | 値 |
|---|---|
| ファイル（裁定450 反映版） | docs/tmp/0195_day_deductions.sql（449 行・LF）→ 手貼り後に supabase/migrations/0195_day_deductions.sql へ収蔵 |
| sha256 | 先頭 16 桁 **90ed3a2656aed407**（旧＝11/04 夜の下書き 50d8359957b32506・差分＝staff_attendance_confirm の declare 1 行＋検査 3 行＋コメント 4 か所） |
| 翻訳元 | live pg_get_functiondef（2026-11-05 再取得・0194 適用後・md5 は 11/04 と同じ＝docs/tmp/dump_live_0192.mjs）＋生成器 docs/tmp/gen_0195.cjs（裁定450 の 6 を反映）・検証＝docs/tmp/0195_verify.sql（変更なし） |
| 試走 | docs/tmp/try_0195.mjs（教訓128＝行頭マーカー・commit; の不在 assert・lock_timeout の 1 行 assert・関数数を tx の外で前後に）＝ 2026-11-05 **46/46・DB 変更 0**（410／116 → tx 内 416／119 → 410／116・verify 22 行が期待値と全行一致）。追加の 5 段＝Σ 5,000≠fixed 6,000 は labor mismatch／allowances なしで fixed 6,000 も labor mismatch／fixed 0 で allowances なしは通る／amount が数でない要素は bad allowances／2 行の合計＝fixed は通る（内訳 2 行を凍結） |
| 根拠 | 台帳 裁定447（差し替え版）／M-73／裁定447 ④／M-77／M-80 追記②／**裁定450**／docs/tmp/0195_plan.md §1〜§9 |
| 関数数・表数 | 410／116 → **416／119**（新設 6＝cast_day_deductions_set・deduction_rule_cast_set・deduction_rule_casts_get・line_link_block・line_link_remove・staff_allowances_set） |

**中身**
- ★1 deductions＝列 day_rule（always／pick・既定 always）・per の CHECK に pay_rate・kind の CHECK に other・set_deduction を 10 引数（p_day_rule DEFAULT 'always'）に作り直し（旧 9 引数は drop＝9 引数の呼び出しは DEFAULT で従来どおり）。
- ★2 cast_day_deductions（cast×biz_date×deduction・enabled＝既定と違う日だけ行）＋cast_day_deductions_set（rows＝[{deduction_id, enabled}]・既定どおりは delete・違う行は upsert・per=day かつ有効なルールだけ・確定済みの月（payroll_runs finalized／paid）は 'finalized'）。RLS select＝org ∧（管理者 ∨ 自店の店長・スタッフ ∨ 本人）∨ kiosk 腕。
- ★3 deduction_rule_casts（rule×cast・enabled／amount_override）＋deduction_rule_cast_set（enabled=true かつ override=null は行を消す）／deduction_rule_casts_get(p_store_id)。
- ★4 line_links.blocked_at＋line_link_block(p_store_id, p_line_user_id)（service_role だけ・戻り＝更新行数・audit は userId なし）／line_link_remove(p_subject_kind, p_subject_id)（管理者・自店の店長・delete・audit）。
- ★5 staff_allowances＋staff_allowances_set(p_membership_id, p_rows)（管理者＝org 内／店長＝自店の staff・20 行まで・全行置換）・staff_labor_confirmed.allowances（jsonb・既定 []）・staff_attendance_confirm の行に allowances＝**Σ amount＝fixed を RPC が検証（裁定450 の 6・不一致は 'labor mismatch'・形が悪ければ 'bad allowances'）**。

## 事前確認 SQL（貼る前・SELECT のみ）＝返りが貼り先証明 1 行だけなら OK（期待値の md5 は 2026-11-05 の本番と一致＝set_deduction 8ca7f0df／staff_attendance_confirm 9bb9a0be・0195 未適用＝day_rule 列なし）
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
