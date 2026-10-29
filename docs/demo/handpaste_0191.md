# 0191 手貼り案内（Agoora 向け・2026-10-29 起草・便 OB-2 ⑤＝初期設定 v5 の器なし項目）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor で、まず下の **事前確認 SQL** を貼って Run → `missing` が空（0 行）なら、**supabase/migrations/0191_setup_v5_gaps.sql** の全文を貼って Run（1 本だけ）。**順番＝0190 → 0191**（0191 は 0190 と独立だが番号順で。0190 が未起草なら 0191 を先に貼ってよい＝handpaste に書く）。
2. **営業中でも貼ってよい**（表 1 つの新設・列 1 つの追加・RPC の CREATE OR REPLACE＝一瞬）。ただし **set_product の旧 15 引数を drop して 16 引数を作る**ため、商品の保存（マスタ › 商品管理）の最中は避ける（PostgREST は named 引数＝呼び出し元の変更なし）。
3. Success の後に **末尾 ===== verify =====** を貼り、返った行を CC へ（期待値は下の表）。Success の表示だけでは適用の証明にならない（恒久注意28）。

| 項目 | 値 |
|---|---|
| ファイル | supabase/migrations/0191_setup_v5_gaps.sql（1,439 行・LF） |
| sha256 | 先頭 16 桁 **67fafc1611e48301** |
| 翻訳元 | live pg_get_functiondef（2026-10-29・0189 適用後）＋生成器 docs/tmp/gen_0191.cjs（手打ちなし＝関数本体は live の写し＋アンカー置換・新設の表と RPC は本ファイルの文字列） |
| 構文検査 | scripts/mig-check.mjs＝parse ok（statements 25）・$function$ の対応 ok（9 本×2）・plpgsql 9 本は試走で本番の構文検査を兼ねる |
| 試走 | 本番で BEGIN…ROLLBACK（docs/tmp/t0191_rollback.mts・NOX-VERIFY-A1）＝**7/7 OK**・関数数 386→387・表 111→112・残留 0 |
| 営業中に貼ってよいか | **可**（商品の保存の最中は避ける） |

**中身**
- ★1 店設定（settings_json）の白名単 +5＝kind_back_rate {hon, jonai, free}（整数 0〜100・初期設定 STEP 5「指名の区分ごとの割合」）／withholding_default_cast（hostess／none）／withholding_default_staff（none／other_204）＝源泉区分の店の既定／cash_float_default（釣銭準備金・0〜9,999,999）／settlement_close_day（15／20／25／31＝末日）。
- ★2 products.back_rate_by_kind jsonb（%の商品の場内／フリーの率 {jonai, free}・null＝店の割合で算出）＋set_product の 16 引数（p_back_rate_by_kind default null・旧 15 引数は drop＝PostgREST の named 引数だけが呼び出し元・教訓48）。
- ★3 PIN 4〜6 桁（set_cast_pin／set_staff_pin／kiosk_punch／staff_punch の `^[0-9]{4}$` → `{4,6}`・既存の 4 桁はそのまま通る）。
- ★4 set_store_mine_settings の shift_request_mode に 'store'（店が決めて本人に通知＝希望は集めない）。
- ★5 check_remove_line＝行を消すと pending のキープも消す（M-30・active は開栓済みなので残す）。bottle_keeps.check_line_id は set null＝消さないと pending が孤児で残る。
- ★6 setup_drafts（org×store に 1 行・RLS select owner・revoke all→select）＋setup_draft_set（owner・null＝削除）。

## 事前確認 SQL（貼る前・SELECT のみ）

```sql
select 'nox-project-proof', count(*)::text from public.orgs
union all
select 'missing', string_agg(x, ', ') from (
  select t || '.' || c x from (values ('products','unit4_json'),('bottle_keeps','check_line_id'),('stores','settings_json'),('staff_pin','pin_hash'),('cast_pin','pin_hash')) v(t, c)
  where not exists (select 1 from information_schema.columns i where i.table_schema = 'public' and i.table_name = v.t and i.column_name = v.c)
  union all
  select f from (values ('set_store_profile'),('set_product'),('set_cast_pin'),('set_staff_pin'),('kiosk_punch'),('staff_punch'),('set_store_mine_settings'),('check_remove_line'),('audit_log_write'),('billing_writable_of')) v(f)
  where not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v.f)
  union all select 'setup_drafts exists' where exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'setup_drafts')
  union all select 'set_product sigs<>1' where (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'set_product') <> 1
) m;
```
期待＝`nox-project-proof 9`・`missing` が **null（空）**。

## verify の期待値（Success の後に末尾 ===== verify ===== を貼る）

| k | 期待 |
|---|---|
| nox-project-proof | 9 |
| has 0191 (8 fns) | 9（set_store_profile／set_product／set_cast_pin／set_staff_pin／kiosk_punch／staff_punch／set_store_mine_settings／check_remove_line／setup_draft_set） |
| md5 set_store_profile | **dc1f9a56** |
| md5 set_product | **86cf3cd0** |
| set_product sigs | 1 |
| md5 set_cast_pin | **aaf3bb2a** |
| md5 set_staff_pin | **52de3c97** |
| md5 kiosk_punch | **f8fc23db** |
| md5 staff_punch | **457ab107** |
| md5 set_store_mine_settings | **4a23de19** |
| md5 check_remove_line | **e313baf6** |
| md5 setup_draft_set | **b914f728** |
| products.back_rate_by_kind | 1 |
| setup_drafts acl | authenticated=SELECT |
| setup_draft_set acl | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}（並びは違ってよい・anon なし） |
| functions | 387 |
| tables | 112 |

（md5＝本体の CR を除いた md5 の先頭 8 桁。試走で本番の定義から取った値）

## 試走で確かめたこと（docs/tmp/t0191_rollback.mts・7/7）
- ★1 5 キーの受理（100/50/30・hostess／none・50,000・31）と拒否（101＝bad kind_back_rate／staff hostess＝bad withholding_default_staff／締め日 10／負）。
- ★2 set_product 1 定義（16 引数）・{jonai 5, free 3} が保存・旧 15 引数の named 呼びも通る（既定 null）・bad key は拒否。
- ★3 5 桁／6 桁 OK・3 桁／7 桁 bad pin・4 桁も通る（cast／staff）・kiosk_punch／staff_punch も {4,6}。
- ★4 'store' 受理・'x' 拒否。★5 行を消すと pending が消え active は残る。★6 owner が保存・読める・manager は forbidden・cast は 0 行・anon は BLOCKED・null で削除。関数 +1・表 +1。

## 適用後に CC がやること
1. 本番の読取で照合（sha16・md5 9 本・関数 387・表 112・set_product 1 定義）。t0191 を mig を流さずに本番の定義で（T018X_NO_APPLY=1・BEGIN…ROLLBACK・残留 0）。
2. 0191 を収蔵・フラグ **MIG_0191_APPLIED** を true（client＝初期設定 v5 の「後で（マスタから）」を実保存に＝kind_back_rate／源泉の既定／釣銭準備金／締め日／%の商品の場内・フリー／PIN 5〜6 桁／店が決める／下書き＝setup_drafts・pin 張替え verify-nox-ob2・f0 2 連・golden 不変）。
3. live＝新規 org の初期設定で STEP 5 の割合・源泉の既定・STEP 8 の釣銭準備金が保存される・CSV の PIN 5 桁が通る。

**Success 表示は適用の証明にならない（恒久注意28）＝verify の返り値を貼ってから次へ。**
