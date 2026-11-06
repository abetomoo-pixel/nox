# 0197 追補（0197b）手貼り案内＝on_duty_of の ACL を 0190 の内部専用に戻す（2026-11-06・0197 フラグ true 便の読取で発見）

**手貼りは相談役の合図＝ここでは貼らない。** 順序＝0197 の後（本番は 0197 適用済み＝関数 419・表 120）。

## 何が起きたか（読取）
- 0190（裁定436）で `on_duty_of(text, uuid, uuid, date)` は**内部専用**（4 ロール revoke＝public／anon／authenticated／service_role・呼ぶのは assert_on_duty だけ・client は呼ばない）。
- 0197 の起草（gen_0197.cjs）が on_duty_of を作り直した際、公開 RPC 用の ACL ヘルパー（`revoke … from public, anon; grant … to authenticated`）を当ててしまった＝**authenticated が on_duty_of を直接呼べる**（0197 の verify「authenticated exec on 3 fns＝3」がこれを期待値として固定していた＝起草の誤り）。
- 影響＝ログイン済みの誰でも `on_duty_of('cast', <id>, <store_id>, <date>)` を呼べば他店の人の出勤状態（true／false）を推定できる（org の照合は assert_on_duty 側にある＝内部ヘルパーの前提）。データの書込はできない。
- 検知＝verify:nox-0190「内部 3 本は anon も authenticated も BLOCKED」（0190 のまま）と verify:nox-0197(4-2)（本便で内部専用を期待値に）＝**追補の手貼りまで f0 はこの 2 段が赤**＝push しない。

## 事前確認 SQL（貼る前・SELECT のみ）＝返りが貼り先証明＋`authenticated=true` の 1 行なら貼ってよい（既に false なら貼らない）
```sql
select 'nox-project-proof' k, count(*)::text v from public.orgs
union all
select 'on_duty_of authenticated', has_function_privilege('authenticated', p.oid, 'execute')::text from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='on_duty_of'
union all
select 'on_duty_of service_role', has_function_privilege('service_role', p.oid, 'execute')::text from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='on_duty_of'
union all
select 'fn count (expect 419)', count(*)::text from pg_proc where pronamespace='public'::regnamespace;
```

## 本文（begin〜commit を 1 回 Run）＝docs/tmp/0197b_on_duty_of_acl.sql（4 行・DDL は ACL だけ・関数本体・表・データは触らない）
```sql
-- 0197b_on_duty_of_acl.sql（0197 追補＝on_duty_of の ACL を 0190 の内部専用に戻す・2026-11-06）
begin;
revoke execute on function public.on_duty_of(text, uuid, uuid, date) from public, anon, authenticated, service_role;
commit;
```

## 検証クエリ（貼った後・SELECT のみ）
```sql
select 'nox-project-proof' k, count(*)::text v from public.orgs
union all
select 'on_duty_of exec (expect f,f,f = anon,authenticated,service_role)', string_agg(x, ',') from (select has_function_privilege('anon', p.oid, 'execute')::text x from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='on_duty_of'
  union all select has_function_privilege('authenticated', p.oid, 'execute')::text from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='on_duty_of'
  union all select has_function_privilege('service_role', p.oid, 'execute')::text from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='on_duty_of') s
union all
select 'assert_on_duty exec (expect f,f,f)', string_agg(x, ',') from (select has_function_privilege('anon', p.oid, 'execute')::text x from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='assert_on_duty'
  union all select has_function_privilege('authenticated', p.oid, 'execute')::text from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='assert_on_duty'
  union all select has_function_privilege('service_role', p.oid, 'execute')::text from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='assert_on_duty') s
union all
select 'on_duty_of md5 (expect 925f0245 = 0197 の本文のまま)', left(md5(replace(prosrc, chr(13), '')), 8) from pg_proc where pronamespace='public'::regnamespace and proname='on_duty_of'
union all
select 'fn count (expect 419)', count(*)::text from pg_proc where pronamespace='public'::regnamespace
union all
select 'table count (expect 120)', count(*)::text from pg_tables where schemaname='public';
```
期待＝貼り先証明・f,f,f・f,f,f・925f0245・419・120（6 行）。返りを CC へ＝supabase/migrations/0197b_on_duty_of_acl.sql に収蔵し、verify:nox-0190／0197 が緑に戻る → f0 2 連 → push。

## 手貼りの記録（2026-11-06・Agoora＝本番 ref hiqbfagmkrdpmlqhkmsu）
- 事前確認＝貼り先証明 10／on_duty_of authenticated **true**／service_role false／fn 419 → 本文 1 回 Run＝Success → 検証 6 行＝**期待値と全行一致**（on_duty_of f,f,f・assert_on_duty f,f,f・md5 925f0245・419・120）。
- CC の突合（読取だけ・16:35）＝本番の on_duty_of EXECUTE（anon,authenticated,service_role）＝false,false,false・md5 925f0245・419／120。収蔵＝supabase/migrations/0197b_on_duty_of_acl.sql（5 行）。verify:nox-0190「内部 3 本」・verify:nox-0197(4-2) が緑に戻る。

## 試走（本番 ref hiqb…・BEGIN…ROLLBACK・DB 変更 0）
- 2026-11-06 17:0x: 本番の on_duty_of の EXECUTE（anon,authenticated,service_role）＝**false,true,false** → tx 内で revoke → **false,false,false** → ROLLBACK → false,true,false（DB 変更 0）。service_role は 0197 でも grant されていない（ACL ヘルパーは authenticated だけ）＝追補の revoke 1 文で 0190 の状態に戻る。
