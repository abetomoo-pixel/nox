# 0193 手貼り案内（確定版・2026-11-04 適用済み＝相談役 11/03 の承認後・手貼り前の確認＝直後に壊れる読み取り 0・drift 0）

## 手貼りの記録（2026-11-04・Agoora）
- **1 回目＝deadlock で ROLLBACK**（単一トランザクションのため変更なし）。**2 回目＝begin の直後に `set local lock_timeout = '10s';` を足して Success**（同じトランザクションの中だけに効く設定＝本体は不変）。
- verify の返り 30 行＝下の期待値と**全行一致**（Agoora の返り・CC が読取で流した返りの両方）。関数 409・表 115。
- 教訓（候補）：表の ALTER（notices／member_profiles のポリシー・cast_sensitive／memberships の列）と稼働中の関数の CREATE OR REPLACE を 1 本で流すと、営業中の読み書きとロックの順が交差して deadlock になりうる＝次の mig から begin の直後に `set local lock_timeout` を入れておく（失敗しても単一トランザクションで無傷）。


**結論 3 行**
1. 相談役 11/03 に確認待ち 6 点を推奨案で承認（条件＝admin を選択肢に出さない・0194 はローンチ前に必須）。live との drift 0 のため下書きをそのまま確定版にした（再生成なし）。
2. 確定後の手順は 0192 と同じ＝本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor で事前確認 SQL（返り 0 行＝貼ってよい）→ 全文を 1 回 Run（begin〜commit の単一トランザクション）→ 末尾の verify のコメントを外して貼り、返りを CC へ。
3. 営業中でも貼れる（関数の作り直し 12・新設 6・表 1・列追加 2 表・ポリシー 2・CHECK 1）。ただし staff_punch（キオスクのスタッフ打刻）を作り直すため、打刻の最中の数秒は避ける。

| 項目 | 値 |
|---|---|
| ファイル（下書き） | supabase/migrations/0193_roles_privacy.sql（738 行・54,124 B・LF＝手貼りした本体と同じ・lock_timeout の 1 行は SQL Editor でだけ足した） |
| sha256 | 先頭 16 桁 **93e57df1a1fe30c2**（全桁 93e57df1a1fe30c2963f279f29dc12b764b8bb50f9da4a203c7e7e3c6c081a19） |
| 翻訳元 | live pg_get_functiondef（2026-11-02・0192 適用後）＋生成器 docs/tmp/gen_0193.cjs（手打ちなし）・verify＝docs/tmp/gen_0193_verify.cjs |
| 試走 | 本番で BEGIN…ROLLBACK（docs/tmp/try_0193.mjs・教訓128 のガード＝行頭の begin;／commit; で切り出し・$function$ の外に commit／rollback／end が無いことを assert・関数数を tx の外で前後に）＝**403／114 → (tx 内 409／115) → 403／114＝DB 変更 0**・verify 全行が期待値・md5 18 本 =file・動作 **19/19**（2026-11-02 18:1x） |
| 計画・調査 | docs/tmp/0193_plan.md／docs/tmp/0193_role_scan.md |

**中身**
- ★1 店長に開く（自店）＝get_printer_config／set_printer_config／rotate_store_token・kiosk_deactivate／kiosk_reactivate／kiosk_device_unbind（端末の店＝自店）・staff_attendance_confirm の解除も店長に（★相談役確認待ち＝0192 では解除は管理者だけと決めた・推奨案＝店長も解除可・audit で追える）。分析 3 本は live で既に「店長は自店・全店は管理者」＝変更なし。
- ★2 個人情報＝cast_sensitive に住所・電話・口座（銀行・支店・種別 ordinary／checking／savings・番号 数字 8 桁まで・名義カナ）・get_cast_sensitive に自店店長の腕・get_cast_mynumber_masked（末尾 4 桁）を本人／管理者／自店店長に・新 RPC set_cast_sensitive_ext／get_cast_sensitive_ext（jsonb・閲覧は audit read_cast_sensitive）・新表 staff_sensitive（RLS 有効・ポリシー 0・grant 0）＋set_staff_sensitive／get_staff_sensitive（店長は管理者の行は不可）・member_profile_get（閲覧を audit read_member_profile）＋member_profiles_select を本人だけに。全桁（get_cast_mynumber＝service_role）と支払調書は管理者の route のまま＝不変。trials の本名の閲覧の記録（D5）は範囲外（★相談役確認待ち）。
- ★3 肩書＝memberships.title（20 字まで）＋set_membership_title（管理者・自店店長＝管理者の行は不可・audit）。
- ★4 役割の変更＝set_membership_role に管理者（owner）への任命／解除（管理者だけ・org 単位の advisory lock・残る有効な管理者が 0 なら 'last owner'・自分は変えない 'self'）・staff_deactivate に管理者の退店（同じ柵）・notices の宛先 'owners'（CHECK と notices_select＝管理者だけが読む）＋任命・解除・退店で既存の管理者がいる店ごとにお知らせ 1 件（★相談役確認待ち＝宛先の作り方）。
- ★5 キオスクの staff_punch が月の確定（staff_attendance_locks）を見る＝'confirmed'。

**★相談役確認待ち（推奨案で仮置き）**
1. 勤怠の確定の解除を店長にも開く（推奨＝開く）。
2. 管理者への通知の器＝notices の宛先 'owners' を足す（推奨＝足す・メールは送らない）。
3. 既存の役割 'admin'（0175 ★28・本番 0 行）の扱い（推奨＝0193 では触らない・表示は owner＝管理者・admin＝管理者（請求なし）・のちに CHECK から外す）。
4. 口座の種別の値（ordinary／checking／savings）と番号の桁（数字 8 桁まで）。
5. 「判断が要る」24 行（0193_role_scan.md 第 2 節）は 0194 候補（推奨案＝店長が日々の運営で困らない側で仮分類済み）。
6. スタッフ給与のコスト計上の確定額の保存（staff_labor_confirmed）は 0194 候補（営業日数の定義・入退社の日割り・当欠の扱いが先）。

## 事前確認 SQL（貼る前・SELECT のみ）＝返りが貼り先証明 1 行だけなら OK
```sql
select 'nox-project-proof' k, count(*)::text v from public.orgs
union all
select 'md5 drift ' || x.n, coalesce(left(md5(replace(p.prosrc, chr(13), '')), 8), 'missing')
  from (values ('get_cast_mynumber_masked','6f401f45'),('get_cast_sensitive','c94b0f51'),('get_printer_config','548bc3f2'),('kiosk_deactivate','eae71eb3'),('kiosk_device_unbind','4ca6bc71'),
               ('kiosk_reactivate','064026fb'),('rotate_store_token','6736a04e'),('set_membership_role','aa034ac3'),('set_printer_config','61a358f2'),('staff_attendance_confirm','95d4fa4a'),
               ('staff_deactivate','c64a7d72'),('staff_punch','c8ff44c4')) x(n, m)
  left join pg_proc p on p.pronamespace='public'::regnamespace and p.proname = x.n
 where p.oid is null or left(md5(replace(p.prosrc, chr(13), '')), 8) <> x.m
union all
select 'already exists ' || proname, '' from pg_proc where pronamespace='public'::regnamespace and proname in ('set_cast_sensitive_ext','get_cast_sensitive_ext','set_staff_sensitive','get_staff_sensitive','member_profile_get','set_membership_title')
union all
select 'already exists staff_sensitive', '' where to_regclass('public.staff_sensitive') is not null;
```

## verify の期待値（試走 2026-11-02 の返り）
| 行 | 期待値 |
|---|---|
| nox-project-proof | 10 |
| functions | **409**（403＋新設 6） |
| tables | **115**（114＋staff_sensitive） |
| has 0193 | 18 |
| new fns (6) | 6 |
| staff_sensitive rls/policies/grants | true/0/0 |
| cast_sensitive new cols | 7 |
| memberships.title | 1 |
| notices audience owners | 1 |
| notices_select owners arm | 1 |
| member_profiles_select self only | 1 |
| acl diff (new 6) | 0 |
| md5 get_printer_config | db1ca425 =file |
| md5 set_printer_config | e82921a9 =file |
| md5 rotate_store_token | 3f1d8b9a =file |
| md5 kiosk_deactivate | bbf16e96 =file |
| md5 kiosk_reactivate | bdf8670a =file |
| md5 kiosk_device_unbind | 74b30817 =file |
| md5 staff_attendance_confirm | 9572d741 =file |
| md5 get_cast_sensitive | 0e3a7ac0 =file |
| md5 get_cast_mynumber_masked | d44d4f3c =file |
| md5 set_cast_sensitive_ext | da4c8f19 =file |
| md5 get_cast_sensitive_ext | 438c26de =file |
| md5 set_staff_sensitive | a67fbc4a =file |
| md5 get_staff_sensitive | d1c2bd09 =file |
| md5 member_profile_get | 7abb1d5d =file |
| md5 set_membership_title | 9e39ed8d =file |
| md5 set_membership_role | 303c8895 =file |
| md5 staff_deactivate | 7dff1ff1 =file |
| md5 staff_punch | 1c1ed455 =file |

## 適用後に CC がやること（0193 のフラグ true 便）
verify の全行突合 → MIG_0193_APPLIED=true → pin 張替え（anon-guard／rls／kiosk 系／0192c の manager forbidden の assert・billing の名簿に新 RPC）→ f0 2 連 → live → lint＋tsc → commit → push → 6 店 reset。
