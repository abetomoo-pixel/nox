# 待遇プランの判定期間を「月次」にそろえる手貼り案内（本番 CLUB NOX・2026-10-19 起草・DB 変更なし＝起草のみ）

> **★f0（verify スイート）の走行中は手貼りしないこと。** f0 が終わって次の f0 を起動する前に貼る（同じ DB を使う＝途中で値が変わると suite が誤判定する）。
> **★貼る前に必ず §2 の「給与への影響」を読むこと**（判定期間を変えると、売上スライドの閾値の意味が「1 日の売上」から「月間の売上」に変わる）。

**結論 3 行**
1. 対象＝本番 CLUB NOX の org（`orgs.name = 'NOX-DEMO'`・`is_demo = false`・id `389f7668-f059-4d39-af4b-89e120bc43fa`）の comp_plans **5 件**（有効 4・無効 1）。判定期間の列＝`comp_plans.slide_period`・月次の綴り＝**`monthly`**（CHECK＝`'monthly'`／`'half'`／`'daily'` の 3 値）。
2. §3 の SQL（1 本のトランザクション）を本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に貼って Run → Success の後、§4 の検証クエリ（1 文）を貼って返った行（ok 列）を CC へ。
3. slide_apply（判定タイミング）は触らない（5 件とも null＝店設定に従う・店設定も欠損＝当期の累計）。デモ 6 org と検証用 org（NOX-VERIFY-A／B）は条件で除外。

## 1. 読取（2026-10-19・SELECT のみ・docs/tmp/q1019_plan_monthly.mjs）

| 項目 | 値 |
|---|---|
| 貼り先証明 | `select 'nox-project-proof', count(*) from public.orgs;` ＝ **9** |
| 列 | `comp_plans.slide_period` text NOT NULL 既定 `'daily'`（`comp_plans_slide_period_check` ＝ `slide_period = ANY (ARRAY['monthly','half','daily'])`） |
| 月次の綴り | **`monthly`**（半月＝`half`・日次＝`daily`） |
| is_demo=false の org | **NOX-DEMO**（CLUB NOX・本番）／NOX-VERIFY-A／NOX-VERIFY-B（verify 用＝**除外**：検証用プラン 5 件が daily＝golden と payroll の fixture が日次前提） |
| 更新トリガ | comp_plans_touch_updated_at（updated_at を更新するだけ） |

対象行（CLUB NOX・5 件）:

| プラン | 有効 | slide_period（現在） | slide_apply | 基本時給 | 売上スライド | 割当キャスト |
|---|---|---|---|---|---|---|
| あああ | 無効 | daily | null | ¥2,000 | なし | 0 |
| エース | 有効 | daily | null | ¥4,000 | 150,000 以上 → ¥5,000 | 2 |
| レギュラー | 有効 | daily | null | ¥3,000 | 100,000 以上 → ¥3,500 | 6 |
| 体験入店 | 有効 | daily | null | ¥2,500 | 100,000 以上 → ¥3,500 | 1 |
| 基本 | 有効 | daily | null | ¥3,000 | なし | 0 |

店設定 `settings_json.slide_apply`＝欠損（＝当期の累計）。確定済み給与 run＝2 件（最新 2026-09）＝**確定済みの明細は凍結値＝変わらない**（変わるのは次のプレビュー／確定から）。

## 2. 給与への影響（貼る前に読む）

- 日次（daily）＝**その日の売上**が閾値以上の日だけ段の時給。月次（monthly）＝**期間（月）の累計売上**で段を決める（裁定338）。
- エース（150,000）・レギュラー／体験入店（100,000）の閾値は**1 日の売上として入れた値**。月次にすると「月の累計 100,000 以上」でほぼ全員が段に届く＝**時給が上がる側に動く**（レギュラー ¥3,000→¥3,500・エース ¥4,000→¥5,000・体験入店 ¥2,500→¥3,500 が月の全日に効く可能性）。
- 月次にそろえる場合は、**閾値を月間の売上の値に直す**（待遇プランの「スライド・ポイント」で段を編集）までを同じ日に行うこと。直さないまま次の給与を確定しないこと。
- 当月（10 月）の給与プレビューは貼った直後から月次で計算される。

## 3. SQL（1 本のトランザクション・途中で失敗すれば全部巻き戻る）

```sql
-- 待遇プランの判定期間を月次にそろえる（本番 CLUB NOX・2026-10-19 起草）
-- 対象＝org NOX-DEMO（is_demo=false・CLUB NOX）の comp_plans 全件（無効含む）・デモ org と NOX-VERIFY-* は除外
-- slide_apply は触らない。audit は action 'comp_plans.slide_period_bulk_fix'（set_comp_plan と区別）
begin;

-- ① 貼り先証明（9 行）＋ org の確認（違えば止める）
select 'nox-project-proof', count(*) from public.orgs;
do $$
begin
  if not exists (select 1 from public.orgs where id = '389f7668-f059-4d39-af4b-89e120bc43fa' and name = 'NOX-DEMO' and is_demo = false) then
    raise exception 'wrong project or org (NOX-DEMO / is_demo=false が見つからない)';
  end if;
end $$;

-- ② 更新前の一覧（対象＝月次でない行）
create temp table _pm_before on commit drop as
  select p.id, p.store_id, p.name, p.slide_period, p.slide_apply, p.is_active
    from public.comp_plans p
    join public.orgs o on o.id = p.org_id
   where o.id = '389f7668-f059-4d39-af4b-89e120bc43fa' and o.is_demo = false
     and p.slide_period <> 'monthly';
select name, slide_period, slide_apply, is_active from _pm_before order by name;

-- ③ 月次へ（対象の行だけ・slide_apply は触らない）
update public.comp_plans p
   set slide_period = 'monthly'
  from _pm_before b
 where p.id = b.id;

-- ④ audit に 1 行（理由つき・before／after に判定期間と件数）
insert into public.audit_logs (org_id, store_id, actor_user_id, action, target, before_json, after_json, reason)
select '389f7668-f059-4d39-af4b-89e120bc43fa', (array_agg(store_id))[1], null,
       'comp_plans.slide_period_bulk_fix',
       'comp_plans:org:389f7668-f059-4d39-af4b-89e120bc43fa',
       jsonb_build_object('count', count(*), 'plans', jsonb_agg(jsonb_build_object('id', id, 'name', name, 'slide_period', slide_period, 'is_active', is_active) order by name)),
       jsonb_build_object('count', count(*), 'slide_period', 'monthly', 'plan_ids', jsonb_agg(id order by name)),
       'ローンチ前の一括是正（日次→月次）'
  from _pm_before
having count(*) > 0;

-- 守り: 件数と slide_apply 不変を確認できなければ止める（全部巻き戻る）
do $$
declare v_target int; v_monthly int; v_apply_changed int; v_other int;
begin
  select count(*) into v_target from _pm_before;
  select count(*) into v_monthly from public.comp_plans p join _pm_before b on b.id = p.id where p.slide_period = 'monthly';
  select count(*) into v_apply_changed from public.comp_plans p join _pm_before b on b.id = p.id where p.slide_apply is distinct from b.slide_apply;
  select count(*) into v_other from public.comp_plans p where p.org_id <> '389f7668-f059-4d39-af4b-89e120bc43fa' and p.updated_at = now();
  if v_monthly <> v_target or v_apply_changed <> 0 or v_other <> 0 then
    raise exception 'guard: target % / monthly % / slide_apply changed % / other org changed %', v_target, v_monthly, v_apply_changed, v_other;
  end if;
end $$;

commit;
```

## 4. 検証クエリ（Success の後に 1 文で貼る・恒久注意31＝Editor は最後の文しか返さない）

```sql
select 'proof' k, (select count(*) from public.orgs)::text v, '9' expected, (select count(*) from public.orgs) = 9 ok
union all
select '対象件数（audit の count）', (select (after_json->>'count') from public.audit_logs where action = 'comp_plans.slide_period_bulk_fix' and org_id = '389f7668-f059-4d39-af4b-89e120bc43fa' order by at desc limit 1), '5',
       (select (after_json->>'count')::int from public.audit_logs where action = 'comp_plans.slide_period_bulk_fix' and org_id = '389f7668-f059-4d39-af4b-89e120bc43fa' order by at desc limit 1) = 5
union all
select '月次になった件数（CLUB NOX）', (select count(*) from public.comp_plans where org_id = '389f7668-f059-4d39-af4b-89e120bc43fa' and slide_period = 'monthly')::text, '5',
       (select count(*) from public.comp_plans where org_id = '389f7668-f059-4d39-af4b-89e120bc43fa' and slide_period = 'monthly') = 5
union all
select '月次でない残り（CLUB NOX）', (select count(*) from public.comp_plans where org_id = '389f7668-f059-4d39-af4b-89e120bc43fa' and slide_period <> 'monthly')::text, '0',
       (select count(*) from public.comp_plans where org_id = '389f7668-f059-4d39-af4b-89e120bc43fa' and slide_period <> 'monthly') = 0
union all
select 'slide_apply が null のまま（CLUB NOX）', (select count(*) from public.comp_plans where org_id = '389f7668-f059-4d39-af4b-89e120bc43fa' and slide_apply is null)::text, '5',
       (select count(*) from public.comp_plans where org_id = '389f7668-f059-4d39-af4b-89e120bc43fa' and slide_apply is null) = 5
union all
select 'デモ org の変化（audit 以降に更新）', (select count(*) from public.comp_plans p join public.orgs o on o.id = p.org_id where o.is_demo and p.updated_at >= (select max(at) from public.audit_logs where action = 'comp_plans.slide_period_bulk_fix'))::text, '0',
       (select count(*) from public.comp_plans p join public.orgs o on o.id = p.org_id where o.is_demo and p.updated_at >= (select max(at) from public.audit_logs where action = 'comp_plans.slide_period_bulk_fix')) = 0
union all
select '検証 org（NOX-VERIFY-*）の daily 件数（不変）', (select count(*) from public.comp_plans p join public.orgs o on o.id = p.org_id where o.name like 'NOX-VERIFY%' and p.slide_period = 'daily')::text, '（f0 の残骸で増減あり＝参考）', true
union all
select 'audit 行（action comp_plans.slide_period_bulk_fix）', (select count(*) from public.audit_logs where action = 'comp_plans.slide_period_bulk_fix')::text, '1',
       (select count(*) from public.audit_logs where action = 'comp_plans.slide_period_bulk_fix') = 1;
```

★「デモ org の変化」は、06:05 の無人 reset が audit の後に走るとデモのプランが入れ直されて 0 にならない（reset は wipe＋load）＝**貼った当日のうちに検証**する。reset 後に見る場合はこの行を参考扱いにする（E-21）。

## 5. 起草時の検査（2026-10-19）

ローカルの使い捨て Postgres（127.0.0.1:54329・本番には触れない）に orgs 9／stores／comp_plans（CHECK と更新トリガつき）／audit_logs を本番と同じ id で作り、§3 を実行→§4 の 8 行がすべて ok＝t（対象 5・月次 5・残り 0・slide_apply null 5・デモ変化 0・検証 org の daily 5 のまま・audit 1）。再実行しても対象 0 件で何もしない（audit も入らない）。

## 6. 戻し方（必要になったとき）

audit 行の before_json.plans（id／slide_period）が元の値。戻す SQL は CC が起草する（この案内では用意しない）。
