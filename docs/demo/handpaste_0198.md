# 0198 手貼り案内（裁定458＝前借りは「貸付」＝貸付台帳 view・本人確認（PIN）・返済の RPC・待遇プランの同意・2026-11-06 夜便レーン 3 で起草）

**手貼りは相談役の合図＝ここでは貼らない。** 順序＝0197b の後（本番は 0197b 適用済み＝関数 419・表 120）。

## ★仮置き 6 点（相談役が朝に裁定・変更があれば gen_0198.cjs を直して live から再生成）
1. **貸付台帳＝advances を正本のまま、cast_loans は view**（security_invoker＝advances の RLS＝店の人／本人）。列＝org・store・cast（cast_name）・biz_date（advanced_on）・amount・repaid（deducted_amount）・remaining・status・repaid_at（status='deducted' の updated_at）・settlement（deduct_period）・granted_by（created_by＋名前）・ack_method／ack_at／ack_by・note。**別表（cast_loans 表）にすると advances（給与の天引き・繰越・finalize）と二重台帳になる**ため view＝相談役の指示「cast_loans（貸付台帳…）」の見え方を view で満たす案。残高＝cast_loan_balances（本人別 open）。
2. **本人確認**＝advances に ack_method（'none'／'manager'／'pin'）・ack_at・ack_by。`cast_loan_grant(p_store_id, p_cast_id, p_amount, p_biz_date, p_note, p_pin default null)`＝adv_issue と同じ柵（店長以上・自店・billing・paid 期の繰り下げ）を**adv_issue を呼んで**満たし、p_pin があれば cast_pin と照合（不一致＝'bad pin'・失敗回数は数えない）→ ack='pin'・無ければ 'manager'。
3. **返済（現金）**＝`cast_loan_repay(p_advance_id, p_amount, p_note)`＝店長以上・open の行・残額まで（超過＝'bad amount'）・全額で status='deducted'（給与の天引き＝payroll_finalize とは別の経路・同じ列を進める）・audit 'cast_loan_repay'。
4. **同意の記録**＝comp_plans に advance_loan_agreed（既定 false）／advance_loan_agreed_at＝set_comp_plan の末尾に p_advance_loan_agreed（default null＝現値のまま・旧 32 引数は drop）。本人の契約確認（cast_contract_acks）は触らない。
5. 貸付時に同意が無くても**拒否しない**（audit の after_json に plan_agreed を残すだけ）＝拒否するかは相談役。
6. **demo_org_reset の wipe 一覧に 6 表**（cast_day_deductions／deduction_rule_casts／availability_terms／availability／register_day_grants／staff_allowances）＝デモ org で基本の働き方などを触ると reset が FK で止まる不具合（2026-11-06 ACE の 500）の直し＝load 一覧と ACL（service_role だけ）は不変（★5）。
7. 月末精算の計算順序（報酬総額 →（5,000 円×暦日数）→ 源泉 → 貸付返済 → 支払額）は pay.ts（client）で既に裁定どおり＝**DB の変更なし**（レーン 2 で表示順だけ直す）。

**結論 3 行**
1. 0198＝列 2（comp_plans）＋列 3（advances）＋RPC 新設 2（cast_loan_grant／cast_loan_repay）＋作り直し 2（set_comp_plan＝33 引数・demo_org_reset＝wipe 6 表）＋view 2（cast_loans／cast_loan_balances）＝関数 419→**421**・表 120 不変（view は表に数えない）。
2. live（0197b 適用後・2026-11-06）から生成（手打ちなし＝set_comp_plan は live の写し＋アンカー置換 4 か所・docs/tmp/gen_0198.cjs）・**begin の直後に set local lock_timeout = '10s'（教訓132）**・試走 BEGIN…ROLLBACK＝下の記録。
3. 手順は 0197 と同じ＝本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor で事前確認 SQL（返り＝貼り先証明 1 行だけなら貼ってよい）→ 全文を 1 回 Run（begin〜commit）→ 検証クエリ（期待値と全行一致）→ CC に返り 17 行を貼る → CC が MIG_0198_APPLIED=true のフラグ便。

| 項目 | 値 |
|---|---|
| ファイル | docs/tmp/0198_cast_loans.sql（LF）→ 手貼り後に supabase/migrations/0198_cast_loans.sql へ収蔵 |
| sha256 | 先頭 16 桁 **0aba613cc2dd5576**（419 行・36673 B・LF） |
| 翻訳元 | live pg_get_functiondef（2026-11-06・0197b 適用後・docs/tmp/dump_live_0192.mjs→scratchpad/live0198）＋生成器 docs/tmp/gen_0198.cjs・検証＝docs/tmp/0198_verify.sql |
| 試走 | docs/tmp/try_0198.mjs（教訓128＝行頭マーカー・commit; の不在 assert・lock_timeout の 1 行 assert・関数数を tx の外で前後に）＝2026-11-06 **19/19・DB 変更 0** |
| 根拠 | 台帳 裁定458／docs/tmp/advance_loan_scan.md の変更案 3・4 |
| 関数数・表数 | 419／120 → **421／120**（view 2） |

## 事前確認 SQL（貼る前・SELECT のみ）＝返りが貼り先証明 1 行だけなら OK（md5 は 2026-11-06 の本番＝0197b 適用後の値）
```sql
select 'nox-project-proof' k, count(*)::text v from public.orgs
union all
select 'md5 drift ' || x.n, coalesce(left(md5(replace(p.prosrc, chr(13), '')), 8), 'missing')
  from (values ('set_comp_plan','e9143f01'),('demo_org_reset','0d689b6e'),('adv_issue','f25d845d'),('adv_cancel','8ff4572b'),('advances_open_balance','724d7551')) x(n, m)
  left join pg_proc p on p.pronamespace='public'::regnamespace and p.proname = x.n
 where p.oid is null or left(md5(replace(p.prosrc, chr(13), '')), 8) <> x.m
union all
select 'already applied', 'yes' from information_schema.columns where table_schema='public' and table_name='advances' and column_name='ack_method';
```

## 本文
docs/tmp/0198_cast_loans.sql の全文（begin〜commit を 1 回 Run）。URL の ref＝hiqbfagmkrdpmlqhkmsu を目視してから。

## 検証クエリ（貼った後）＝docs/tmp/0198_verify.sql（17 行＝貼り先証明＋16 行・期待値は各行の見出しに）
| k | 期待 |
|---|---|
| nox-project-proof | orgs の件数 |
| fn count／table count | 421／120 |
| view count／new fns grant/repay | 2／2 |
| set_comp_plan 33 args／32 args | 1／0 |
| cols comp_plans agreed／cols advances ack | 2／3 |
| advances ack_method none | 全行（既存は none）＝N/N |
| anon exec on 3 fns／authenticated exec on 3 fns | 0／3 |
| views grants authenticated／anon | SELECT,SELECT／0 |
| views security_invoker | 2 |
| cast_loan_grant uses crypt+adv_issue／set_comp_plan writes agreed | yes／yes |

## 試走の記録（本番 ref hiqb…・BEGIN…ROLLBACK・DB 変更 0）
- 2026-11-06 19:4x（★5 を足した再生成＝sha16 0aba613cc2dd5576）: body 408 行・commit-free ok・lock_timeout ok → 419／120／0 → tx 内 421／120／2 → ROLLBACK → 419／120／0（DB 変更 0）・verify 17 行一致・動作 19/19。
- 2026-11-06 19:2x（本番 ref hiqb…・0197b 適用後・★5 なし＝c18da0a15dea897c）: body 273 行・commit-free ok・lock_timeout ok → 関数 419／表 120／view 0 → tx 内 **421／120／2** → ROLLBACK → 419／120／0（DB 変更 0）。verify 17 行＝期待値と全行一致（advances の ack_method none＝6/6＝既存行）。
- 動作 **19/19**＝★1 set_comp_plan 33 引数（agreed true で新規・省略＝現値・false で null・旧 32 引数は無い）／★3 cast_loan_grant（PIN なし＝ack manager・audit 2 行／PIN 不一致 bad pin／PIN 一致＝ack pin／staff forbidden／0 円 bad amount／貸付時に源泉も控除も引かない）・cast_loan_repay（4,000＝open のまま／超過 bad amount／残額ちょうど＝deducted／settled の行は advance settled／staff forbidden）／★4 view cast_loans（店長＝2 行・列）・cast_loan_balances（open 3,000）・他のキャスト 0 行・anon 不可。
