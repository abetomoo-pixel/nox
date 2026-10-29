# 0188 手貼り案内（Agoora 向け・2026-10-29 起草・裁定433 源泉の税率表＋裁定434 源泉区分 4 つ（other_fee 廃止）＋日払いの settlement は daily の店だけ＋外交員報酬の直書き撤去）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor で、まず下の **事前確認 SQL** を貼って Run → `missing` が空（0 行）かつ `other_fee rows 0+0` なら、**supabase/migrations/0188_withholding_rates_kinds.sql** の全文を貼って Run（1 本だけ）。**順番＝0187 → 0188 → 0189**（0188 は 0187 と独立だが、番号順で）。
2. **営業中でも貼ってよい**（表の新設と小さい CHECK の差し替え・RPC の CREATE OR REPLACE は一瞬）。ただし **日払いの発行中（daily_pay_issue）・紹介料の支払中は避ける**。
3. Success の後に **末尾 ===== verify =====** を貼り、返った行を CC へ（期待値は下の表）。Success の表示だけでは適用の証明にならない（恒久注意28）。税理士 T11／T17 の最終確認で違いが出たら、その点だけ次の mig で改める（裁定434）。

| 項目 | 値 |
|---|---|
| ファイル | supabase/migrations/0188_withholding_rates_kinds.sql（280 行・24,850 B・LF・CR 0） |
| sha256 | 先頭 16 桁 **d9fceaa24e2e93ac** |
| 翻訳元 | live pg_get_functiondef（2026-10-29・0186 適用後＝daily_pay_issue／referral_payout_pay／set_withholding_kind）＋生成器 docs/tmp/gen_0188.cjs（手打ちなし＝関数本体は live の写し＋アンカー置換・新設 2 本と表は本ファイルの文字列）・live 照合＝19 本 SAME |
| 構文検査 | scripts/mig-check.mjs＝parse ok（statements 27）・$function$ の対応 ok（5 本）・sql の withholding_rate_of ok（plpgsql 4 本は試走で本番の構文検査を兼ねる） |
| 試走 | 本番で BEGIN…ROLLBACK（docs/tmp/t0188_rollback.mts・NOX-VERIFY-A1）＝**14/14 OK**・関数数 382→384・表 110→111・残留 0 |
| 営業中に貼ってよいか | **可**（日払い・紹介料の支払の最中は避ける） |

**中身**
- ★1 裁定433: 税率表 **withholding_rates**（運営側・店ごとではない）＝kind（hostess／other_204／salesperson）× valid_from（適用開始日＝**支払日で行を選ぶ**）・rate_bp（1021）・deduction（hostess 5,000／日・salesperson 120,000／月）・threshold＋over_rate_bp（other_204＝100 万円・2042）・breakdown（所得税／復興／防衛の bp＝表示用）。初期行＝2013-01-01 と 2027-01-01 の 2 世代×3 区分（6 行）。読取は authenticated の SELECT だけ・書込ポリシーなし（行の追加は mig＝裁定433 ③）。読み口＝withholding_rate_of（支払日の行）・withholding_calc（整数計算＝裁定431 ②）＝内部専用（4 ロール revoke）。
- ★2 裁定434: 区分の CHECK＝none／hostess／**other_204**／manual（other_fee 廃止）＝cast_tax_profiles／staff_contracts（本番は全員 null＝影響 0）・set_withholding_kind の受理値。委託スタッフの既定 none・画面の注記・withholding_rate 列を読まないのは client（MIG_0188_APPLIED）。
- ★3 daily_pay_issue: kind 'settlement' は **settlement_cycle＝'daily' の店だけ**（それ以外は 'settlement not allowed'＝二重控除を DB でも防ぐ・裁定434 ④）・区分（withholding_kind・null＝委託 hostess／雇用 manual）を読む・税額＝withholding_calc（hostess は従来と 1 円も違わない）・戻りと audit に withholding_kind。
- ★4 referral_payout_pay: 外交員報酬（salesperson）の 120,000／1021 の直書きを税率表から（従来と同値）。
- 残る直書き＝lib/nox/pay.ts・money.ts（withholding1021Of）＝client 便で税率表を読む形に（golden 不変を確かめる）。**デモ LILY の日払い 4 件（settlement・月次の店）は gen-demo の payload で advance に（client 便・reset で反映）**。

## 事前確認 SQL（貼る前・SELECT のみ）＝ plpgsql が参照する列と関数の存在

```sql
select 'nox-project-proof', count(*)::text from public.orgs
union all
select 'missing', string_agg(x, ', ') from (
  select t || '.' || c x from (values
    ('cast_tax_profiles','withholding_kind'),('cast_tax_profiles','mode'),('staff_contracts','withholding_kind'),
    ('daily_pays','kind'),('daily_pays','settle_period'),('daily_pays','withholding_category'),('stores','settings_json'),
    ('referral_payouts','withholding'),('referrers','withholding_category')
  ) v(t, c)
  where not exists (select 1 from information_schema.columns i where i.table_schema = 'public' and i.table_name = v.t and i.column_name = v.c)
  union all
  select f from (values ('billing_writable_of'),('audit_log_write'),('auth_role'),('auth_org_id'),('auth_store_id')) v(f)
  where not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v.f)
  union all
  select 'withholding_rates exists' where exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'withholding_rates')
) m
union all
select 'other_fee rows', (select count(*) from public.cast_tax_profiles where withholding_kind = 'other_fee')::text || '+' || (select count(*) from public.staff_contracts where withholding_kind = 'other_fee')::text;
```
期待＝`nox-project-proof 9`・`missing` が **null（空）**・`other_fee rows 0+0`（0 でなくても mig が other_204 へ写す＝件数を CC へ）。

## verify の期待値（Success の後に末尾 ===== verify ===== を貼る）

| k | 期待 |
|---|---|
| nox-project-proof | 9 |
| withholding_rates rows | 6 |
| withholding_rates acl (select only) | SELECT |
| helpers 2 (acl postgres only) | 2 |
| calc hostess 20000x1 | 1531 |
| calc hostess 300000x31 | 14804 |
| calc other_204 1500000 | 204200 |
| calc salesperson 200000 | 8168 |
| kinds check (cast) | CHECK (((withholding_kind IS NULL) OR (withholding_kind = ANY (ARRAY['hostess'::text, 'other_204'::text, 'manual'::text, 'none'::text])))) |
| kinds check (staff) | 同上 |
| other_fee rows | 0+0 |
| has 0188 (4 fns) | 4 |
| md5 withholding_rate_of | 75a0f2c5 |
| md5 withholding_calc | 532d05c7 |
| md5 set_withholding_kind | 58f7d87d |
| md5 daily_pay_issue | 3e5628ad |
| md5 referral_payout_pay | 2be65150 |

（md5＝本体の CR を除いた md5 の先頭 8 桁。試走で本番の定義から取った値）

## 試走で確かめたこと（docs/tmp/t0188_rollback.mts・14/14）
- 回帰＝既存の日払い（直近 200 件）の源泉・差引が不変。
- 税率表 6 行（率 1021）・読み口＝支払日で行を選ぶ（2026-10-29→2013 行・控除 5,000／2027-03-01→2027 行／2000 年＝行なし）。
- calc hostess＝従来の withholdingOf（pay.ts）と 8 点で 1 円も違わない（300,000×31 日・20,000×1 日＝1,531・4,999／5,000／5,001×1 日・150,000×31・1,000,000×30・0）。other_204＝100 万まで 10.21%・超える部分 20.42%（100 万＝102,100／150 万＝204,200／100 万 1 円＝102,100／5 万＝5,105）。salesperson＝(累計−120,000)×10.21%（20 万＝8,168／10 万＝0）。manual／none／null＝0・other_fee＝bad kind。
- 区分＝other_204 は受理・other_fee は set_withholding_kind で bad kind・CHECK でも拒否。
- daily_pay_issue＝月次（settlement_cycle 欠損）の店は settlement を拒否（'settlement not allowed'）・advance は可（源泉 0）／daily の店は settlement 可＝(20,000−5,000)×10.21%＝1,531・net 18,469／区分 none→0・manual→0＋warn 'manual'・other_204→2,042／雇用（区分 null）＝0＋warn 'T10 pending'（従来）・audit に withholding_kind と settlement_cycle。
- referral_payout_pay＝税率表（salesperson）から・120,000 の直書きなし。内部 2 本は anon も authenticated も BLOCKED・税率表は authenticated が読める・anon は読めない・書けない。

## 適用後に CC がやること
1. 本番の読取で照合（sha16・md5 5 本・関数数 382→384・表 110→111・CHECK・proacl）。試走と同じ t0188 を mig を流さずに本番の定義で（BEGIN…ROLLBACK・残留 0）。
2. 0188 を収蔵（未追跡→追跡）・フラグ **MIG_0188_APPLIED** を true（client＝裁定434 の区分 4 つ（other_fee→other_204・委託スタッフの既定 none・注記）・M-21 の働き方の欄・日払いの種別の出し分け（settlement_cycle≠daily は前払だけ・前払のプレビュー「源泉 0（期の精算で差し引き）」）・pay.ts の二重控除の除外と税率表の参照・TS で mode だけ見ている箇所（日払いのプレビュー・adjust.ts・明細の源泉行・シミュの係数・CSV）を withholding_kind 優先に・staff_contracts.withholding_rate を読まない＝画面から消す・gen-demo の LILY 4 件を advance に＋reset）・suite 張替え（daily-pay／0158／432＝A1 の settlement は daily に切り替えて検査）・f0 2 連・golden 不変。
3. live＝デモ LILY（月次）の日払いが前払だけ・ACE のキャスト詳細で区分 4 つ・給与画面に「源泉の率 10.21%（2027-01-01 から内訳変更）」の読取表示。

**Success 表示は適用の証明にならない（恒久注意28）＝verify の返り値を貼ってから次へ。**
