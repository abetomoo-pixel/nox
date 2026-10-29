# 0189 手貼り案内（Agoora 向け・2026-10-29 起草・M-16 の翌表記＝必要人数の時間帯を翌 24:00 まで）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor で、まず下の **事前確認 SQL** を貼って Run → `missing` が空（0 行）かつ `bad rows` が 0 なら、**supabase/migrations/0189_staffing_needs_next_day.sql** の全文を貼って Run（1 本だけ）。**順番＝0187 → 0188 → 0189**（0189 は他と独立＝先でも後でもよい）。
2. **営業中でも貼ってよい**（staffing_needs は 50 行・CHECK の差し替えと set_staffing_need の CREATE OR REPLACE は一瞬・伝票の書き込みに影響なし）。
3. Success の後に **末尾 ===== verify =====** を貼り、返った行を CC へ（期待値は下の表）。Success の表示だけでは適用の証明にならない（恒久注意28）。

| 項目 | 値 |
|---|---|
| ファイル | supabase/migrations/0189_staffing_needs_next_day.sql（73 行・5,947 B・LF・CR 0） |
| sha256 | 先頭 16 桁 **c6a8dab6a32a6c81** |
| 翻訳元 | live pg_get_functiondef（2026-10-29・0186 適用後＝set_staffing_need）＋生成器 docs/tmp/gen_0189.cjs（手打ちなし＝関数本体は live の写し＋アンカー置換）・live 照合＝SAME |
| 構文検査 | scripts/mig-check.mjs＝parse ok（statements 8）・$function$ の対応 ok（1 本） |
| 試走 | 本番で BEGIN…ROLLBACK（docs/tmp/t0189_rollback.mts・NOX-VERIFY-A1）＝**4/4 OK**・残留 0 |
| 営業中に貼ってよいか | **可** |

**中身**
- ★1 staffing_needs の CHECK＝`to_min <= 1440` → `to_min <= 2880`（翌 24:00・営業日の分＝24 時超は +1440）。既存 50 行（max to_min 1440）はすべて満たす。
- ★2 set_staffing_need の検証を同じ上限に（'bad band'）。重複ガード（overlap）・upsert（store, dow, from_min）・権限・課金ゲートは不変。shift_period_needs_set（曜日と人数だけ）は対象外。
- client（**MIG_0189_APPLIED＝true** の後）＝lib/nox/shift/half-hour.ts bandOptionsOf の範囲を店の営業時間の翌側まで（「翌01:00」の表記・値は 25:00 の形）。読み手（充足の分母＝shift_gap／labor-forecast）は分で比較しているので不変。

## 事前確認 SQL（貼る前・SELECT のみ）

```sql
select 'nox-project-proof', count(*)::text from public.orgs
union all
select 'missing', string_agg(x, ', ') from (
  select 'staffing_needs.' || c x from (values ('from_min'),('to_min'),('dow'),('required')) v(c)
  where not exists (select 1 from information_schema.columns i where i.table_schema = 'public' and i.table_name = 'staffing_needs' and i.column_name = v.c)
  union all
  select f from (values ('billing_writable_of'),('auth_staff_can_shift'),('audit_log_write')) v(f)
  where not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v.f)
) m
union all
select 'bad rows', count(*)::text from public.staffing_needs where not (from_min >= 0 and from_min < to_min and to_min <= 2880);
```
期待＝`nox-project-proof 9`・`missing` が **null（空）**・`bad rows 0`。何か出たら貼らずに CC へ。

## verify の期待値（Success の後に末尾 ===== verify ===== を貼る）

| k | 期待 |
|---|---|
| nox-project-proof | 9 |
| band check | CHECK (((from_min >= 0) AND (from_min < to_min) AND (to_min <= 2880))) |
| rows ok | 0 bad / 50 rows（行数は貼った時点の件数） |
| has 0189 | 1 |
| md5 set_staffing_need | **b394d912** |
| set_staffing_need acl | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}（並びは違ってよい・anon なし） |

## 試走で確かめたこと（docs/tmp/t0189_rollback.mts・4/4）
- 既存の行が不変で新しい CHECK を満たす・CHECK の定義（2880・1440 なし）。
- set_staffing_need＝20:00〜翌06:00（1200〜1800）可・翌06:00〜翌24:00（1800〜2880）可・2881＝bad band・from≥to＝bad band・重なり（1700〜2000）＝overlap・同じ from_min は upsert（人数 3→4）。
- 直 INSERT の 2881 は CHECK で拒否・anon は set_staffing_need を BLOCKED。

## 適用後に CC がやること
1. 本番の読取で照合（sha16・md5・CHECK の定義・proacl）。
2. 0189 を収蔵（未追跡→追跡）・フラグ **MIG_0189_APPLIED** を true（client＝必要人数の時間帯の選択肢に翌 01:00〜翌 06:00・店の営業時間の翌側まで）・suite（shift-bands／m2 の 16-1）の pin 張替え・f0 2 連・golden 不変。
3. live＝デモ ACE の必要人数で「20:00〜翌02:00」を保存・390 で 2 段・充足の分母が翌側の時間を数える。

**Success 表示は適用の証明にならない（恒久注意28）＝verify の返り値を貼ってから次へ。**
