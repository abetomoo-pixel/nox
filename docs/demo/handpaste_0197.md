# 0197 手貼り案内（裁定455＝打刻の 3 択目「打刻しない（店が勤怠を付ける）」・2026-11-05 夜の自走便 3 で起草）

**手貼りは相談役の合図＝ここでは貼らない。** 順序＝**0196 の後**（検証クエリの fn count 419＝0196 の 418＋1・表 120＝119＋1）。

## ★仮置き 5 点（相談役が朝に裁定・変更があれば gen_0197.cjs を直して live から再生成）
1. **punch_mode の受け口**＝新 RPC は作らず **set_store_profile の白名単**に `punch_mode`（'punch'／'store'）と窓の 2 キー `register_window_before_min`（既定 30）／`register_window_after_min`（既定 60・0〜240 の整数）を足す＝初期設定 v5 と店舗設定が同じ 1 本を使う（owner 限定は従来どおり）。punch_methods の白名単は触らない（'store' のとき punch_methods は無視）。
2. **確定シフトの「終了」**＝shifts.end_hm／staff_shifts.end_hm はどちらも NOT NULL＝仮の終了は不要（計画の確認 2 は消える）。
3. **「今日だけ許可」の有効期間**＝その営業日だけ。p_biz_date は今日の営業日か**翌営業日**まで指定可（開店前の準備で前倒し）＝それ以外は 'bad date'。p_on=false で取消。
4. **staff の確定シフト**＝staff_shifts（status 'confirmed'・staff_id＝membership）を on_duty_of が読む（cast＝shifts status 'confirmed'）。
5. **punch_mode='store' の店は on_duty_of が打刻を見ない**（シフトの窓か今日だけ許可だけ）。店長以上の免除（assert_on_duty）・duty_gate=false の店の素通りは今のまま。'punch' の店は 1 バイト同値（打刻を見る）。

**結論 3 行**
1. 0197＝set_store_profile の白名単 +3 キー（作り直し 1）・register_day_grants（表 +1・RLS select＝org ∧（owner／自店の店の人／本人）・revoke→grant select）＋register_day_grant_set（新設 1＝店長以上・自店・今日か翌営業日・audit 'register_day_grant'）・on_duty_of の 'store' 分岐（作り直し 1）＝関数 418→**419**・表 119→**120**。
2. live（0195 適用後・2026-11-05）から生成（手打ちなし＝docs/tmp/gen_0197.cjs）・**begin の直後に set local lock_timeout = '10s'（教訓132）**・試走 BEGIN…ROLLBACK＝2026-11-05 **19/19・DB 変更 0**（0196 を含まない dev で単独＝416／119 → tx 内 417／120 → 416／119。fn count の行だけ 417＝0196 の後に貼れば 419）。
3. 手順は 0196 と同じ＝本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor で事前確認 SQL（返り＝貼り先証明 1 行だけなら貼ってよい）→ 全文を 1 回 Run（begin〜commit）→ 検証クエリ（期待値と全行一致）→ CC に返り 17 行を貼る → CC が MIG_0197_APPLIED=true の便 E。

| 項目 | 値 |
|---|---|
| ファイル | docs/tmp/0197_punch_mode.sql（1,029 行・98,513 B・LF）→ 手貼り後に supabase/migrations/0197_punch_mode.sql へ収蔵 |
| sha256 | 先頭 16 桁 **f28f737489916c38** |
| 翻訳元 | live pg_get_functiondef（2026-11-05・0195 適用後・scratchpad/live0196＝set_store_profile 867 行・on_duty_of 28 行）＋生成器 docs/tmp/gen_0197.cjs・検証＝docs/tmp/0197_verify.sql |
| 試走 | docs/tmp/try_0197.mjs（教訓128）＝2026-11-05 **19/19・DB 変更 0** |
| 根拠 | 台帳 裁定455（1・5）／docs/tmp/0197_plan.md §1 |
| 関数数・表数 | 418／119（0196 後）→ **419／120** |

**中身**
- ★1 set_store_profile＝白名単に 3 キー・'bad punch_mode'／'bad register_window_before_min'／'bad register_window_after_min'（0〜240 の整数）・before／after の audit は従来の型。
- ★2 register_day_grants（id・org・store・subject_kind cast|staff・subject_id・biz_date・granted_by・reason・unique(store, kind, subject, date)）＋register_day_grant_set(p_subject_kind, p_subject_id, p_biz_date, p_on, p_reason)（owner＝org 内／manager＝自店・対象＝自店の有効なキャストか manager／staff の membership・今日か翌営業日・on＝upsert／off＝delete・audit）。
- ★3 on_duty_of＝punch_mode='store' の店＝「今日だけ許可」があれば true／その営業日の確定シフト（cast＝shifts・staff＝staff_shifts）の開始 −before 〜 終了 ＋after の中なら true（営業時計 0〜47 時＝営業日の 0:00 JST から分で足す）／それ以外 false。'punch' は従来の最後の打刻が in。

## 事前確認 SQL（貼る前・SELECT のみ）＝返りが貼り先証明 1 行だけなら OK（md5 2 本＝**2026-11-06 に 0196 適用後の本番 ref hiqb… で再照合＝一致**（set_store_profile b9d361eb／on_duty_of dd0a738d・0196 はこの 2 本を触らない＝重なり 0・再生成なし・sha16 f28f737489916c38 のまま））
```sql
select 'nox-project-proof' k, count(*)::text v from public.orgs
union all
select 'md5 drift ' || x.n, coalesce(left(md5(replace(p.prosrc, chr(13), '')), 8), 'missing')
  from (values ('set_store_profile','b9d361eb'),('on_duty_of','dd0a738d')) x(n, m)
  left join pg_proc p on p.pronamespace='public'::regnamespace and p.proname = x.n
 where p.oid is null or left(md5(replace(p.prosrc, chr(13), '')), 8) <> x.m
union all
select 'already applied', 'yes' from pg_tables where schemaname='public' and tablename='register_day_grants'
union all
select '0196 not yet', 'stop' from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='kiosk_person_claim' having count(*) = 0;
```

## 本文
docs/tmp/0197_punch_mode.sql の全文（begin〜commit を 1 回 Run）。URL の ref＝hiqbfagmkrdpmlqhkmsu を目視してから。

## 検証クエリ（貼った後）＝docs/tmp/0197_verify.sql（17 行＝貼り先証明＋16 行・期待値は各行の見出しに）
| k | 期待 |
|---|---|
| nox-project-proof | orgs の件数 |
| fn count | 419 |
| table count | 120 |
| new fn register_day_grant_set | 1 |
| table／rls／policies／grants authenticated／grants anon／unique | yes／t／1／SELECT／0／1 |
| set_store_profile has punch_mode／window keys・on_duty_of has store branch | yes／yes／yes |
| anon exec on 3 fns／authenticated exec on 3 fns | 0／3 |
| stores with punch_mode store | 0 |

## 試走の記録（本番 ref hiqb…（SUPABASE_DB_URL）・BEGIN…ROLLBACK・DB 変更 0）
- **2026-11-06（0196 適用後の再走・事前確認）**: 0197 が触る関数＝set_store_profile（作り直し）・on_duty_of（作り直し）・register_day_grant_set（新設）＝0196 の 11 本との重なり **0** → 再生成なし（sha16 **f28f737489916c38** のまま）。body 1,019 行・commit-free ok・lock_timeout ok → 関数 **418／表 119** → tx 内 **419／120** → ROLLBACK → 418／119（DB 変更 0）。verify 17 行＝期待値と全行一致（fn count 419・table count 120）。動作 **19/19**。
- 2026-11-05: body 1,019 行・commit-free ok・lock_timeout ok → 416／119 → tx 内 417／120 → ROLLBACK → 416／119。verify 17 行＝fn count（417＝0196 なしの dev）以外は期待値どおり。
- 動作 19/19＝★1 owner の保存 ok／bad punch_mode／窓 241＝bad／manager forbidden／★3 シフトなし false・終了+60 分過ぎ false・開始 −30 分の中 true・窓 10 分で false／★2 付与→true＋audit・取消→false・翌営業日 ok・2 日後／昨日 bad date・staff forbidden・staff の membership にも付与 ok・owner の membership は forbidden・RLS 自店 staff 読める／★3 'punch' の店＝窓の中でも打刻なしは false・最後の打刻 in で true（従来）。A2 の manager が無いため「他店の店長 forbidden」は未実行（RPC は store 照合＝manager 自店だけ）。
