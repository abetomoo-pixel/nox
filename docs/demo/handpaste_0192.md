# 0192 手貼り案内（Agoora 向け・2026-11-02 起草＝0191 適用後の live から生成・便 M5 の DB 側＋公開デモ cron の監査）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor で、まず下の **事前確認 SQL** を貼って Run → 返りが **0 行**なら、**supabase/migrations/0192_m5_db.sql** の全文を貼って Run（1 本だけ・begin〜commit の単一トランザクション）。
2. **営業中でも貼ってよい**（表 2 つの新設・availability／availability_terms の列追加と制約の付け替え＝どちらも本番 0 行・RPC の CREATE OR REPLACE＝一瞬）。ただし**キオスクの 14 関数を作り直す**ため、打刻・キオスクのログインの最中の数秒は避ける。
3. Success の後に **末尾 ===== verify =====** のコメントを外して貼り、返った行を CC へ（期待値は下の表）。Success の表示だけでは適用の証明にならない（恒久注意28）。

| 項目 | 値 |
|---|---|
| ファイル | supabase/migrations/0192_m5_db.sql（2,305 行・185,193 B・LF） |
| sha256 | 先頭 16 桁 **241f742c8476fd08**（全桁 241f742c8476fd080f241998397cecc805c38f310224159d944d4e8af17f4534） |
| 翻訳元 | live pg_get_functiondef（**2026-11-02・0191 適用後**＝改稿 19 本の適用前 md5 は下の事前確認 SQL）＋生成器 docs/tmp/gen_0192.cjs（手打ちなし＝関数本体は live の写し＋アンカー置換・新設の表と RPC は生成器の文字列）・verify は docs/tmp/gen_0192_verify.cjs（ファイルの $function$ 本文の md5 を埋める） |
| 構文検査 | scripts/mig-check.mjs は libpg-query の器が壊れていて未実施＝代わりに本番の BEGIN…ROLLBACK（下）で全文を本番の検証器に通した |
| 試走 | 本番で BEGIN…ROLLBACK を 2 本（2026-11-02 13:5x〜14:01・f0 と並走なし）。★教訓128 のガード＝行頭の `begin;`／`commit;` で切り出し・切り出しの $function$ 本体の外に commit／rollback／end が無いことを assert・関数数と表数を tx の外で前後に取り直し＝**394／112 → (tx 内 403／114) → 394／112＝DB 変更 0**。① 構造（docs/tmp/try_0192.mjs）＝verify 全行が下の期待値・md5 28 本すべて =file・権限 67 本×3 ロールの差 0。② 動作（docs/tmp/try_0192_fn.mjs・NOX-VERIFY-A1 の owner／manager／staff の JWT を写して呼ぶ）＝**23/23** |
| 営業中に貼ってよいか | **可**（打刻・キオスクのログインの最中の数秒は避ける） |

**中身**（計画＝docs/tmp/0192_plan.md の 9 項目）
- ★1 スタッフ日別勤怠の修正・確定＝表 staff_attendance_days（membership×営業日の区分 present／absent 当欠／late 遅刻／early 早退・メモ 200 字）・staff_attendance_locks（店×月の確定）＝RLS select・revoke all→select。RPC staff_attendance_set(p_membership_id, p_biz_date, p_punches boolean, p_in, p_out, p_status, p_note)＝owner 全店／manager 自店・p_punches=true のときその日の打刻を manual で差し替え・月が確定済みなら 'confirmed'・audit。staff_attendance_confirm(p_store_id, p_period 'YYYY-MM', p_lock)＝確定は店長以上・解除は owner のみ・audit。
- ★2 M-38 退勤の取消＝punch_cancel_out(p_cast_id)／staff_punch_cancel_out(p_membership_id)＝当営業日の最後の打刻が out のときだけ消す（'not out'）・スタッフは確定済みの月なら 'confirmed'・audit。punch_corrections.punch_id は on delete set null。
- ★3 M-39 PIN ロックの解除＝staff_pin_unlock(p_membership_id)（manager は自店の owner 以外）／cast_pin_unlock(p_cast_id)＝fail_count 0・locked_until null・PIN が無ければ 'no pin'・audit。
- ★4 M-45 cast_pin_status(p_store_id)＝staff_pin_status と同型（owner 全店／manager 自店・自店 active のキャスト × cast_pin・hash は返さない）。
- ★5 M-46 ロック既定 10 分＝staff_punch の既定 15→10・kiosk_punch の固定 15 分（2 か所）→店設定 pin_lock_minutes（既定 10＝kiosk_login と同じ）。失敗回数の閾値（キャスト 5 回）は不変。
- ★6 M-47 端末の用途の廃止＝helper 2（auth_kiosk_store_id／auth_kiosk_register_store_id）＋RPC 12（auth_kiosk_operator／kiosk_lock／kiosk_login／kiosk_logout／kiosk_punch／kiosk_punch_state／kiosk_qr_claim／kiosk_qr_poll／kiosk_qr_secret／kiosk_transport_issue／kiosk_unlock／staff_punch）の `k.purpose = 'punch'|'register'` を外す＝1 台で全タイル。RLS の kiosk 腕 28 本は helper 経由で自動。kiosk_provision／kiosk_reactivate の上限＝**店ごと 3 台**（用途を数えない）・p_purpose は受けて無視（列 purpose と CHECK は残す・新規は 'punch' で書く）。既存端末は列を触らない＝helper が用途を見ないので自動で全タイル（試走で NOX-DEMO の punch／register 端末とも両 helper が店を返すことを確認）。
- ★7 M-49 店設定キー kiosk_person_idle_minutes（set_store_profile の白名単・整数 1〜120・'bad kiosk_person_idle_minutes'）。
- ★8 M-34 アカウント未発行のキャストの基本の働き方＝availability／availability_terms に cast_id（casts on delete cascade）・membership_id を null 可に・CHECK（どちらか必須）・部分ユニーク（cast_id×曜日／cast_id where membership_id is null）・terms の PK(membership_id) を UNIQUE(membership_id) に付け替え（本番は両表 0 行）。RLS＝本人は membership か（未発行のうちの行は）auth_cast_id で読める。新 RPC availability_set_cast(p_cast_id, p_rows, p_terms)＝owner 全店／manager 自店・発行済みなら 'has account'。availability_set（本人／店）は保存時に未発行のうちの行を membership へ引き取る（本人確認は初回ログイン後）・availability_list は未引き取りの行も出す（列の形は不変）。
- ★9 demo_reset_mark_failed(p_org_id, p_reason)＝公開デモ cron の失敗の監査（audit 'demo.reset.failed'）。**service_role だけが EXECUTE**（public／anon／authenticated は revoke）。audit_log_write_service の 4 ロール revoke（0135）は不変。0190／0191 で作り直した 48 本の EXECUTE は走査で落ち 0（戻す GRANT なし）。

## 事前確認 SQL（貼る前・SELECT のみ）
返りが 0 行なら貼ってよい（1 行でも返れば貼らずに CC へ＝起草後に本番の関数が変わった）。

```sql
select 'nox-project-proof' k, count(*)::text v from public.orgs
union all
select 'md5 drift ' || x.n, coalesce(left(md5(replace(p.prosrc, chr(13), '')), 8), 'missing')
  from (values ('auth_kiosk_operator','1ef44a8b'),('auth_kiosk_register_store_id','2fc8d139'),('auth_kiosk_store_id','aceb6ddf'),('availability_list','da9c6040'),
               ('availability_set','393a6d45'),('kiosk_lock','7c8a87bc'),('kiosk_login','a91f85ab'),('kiosk_logout','2b1d0d98'),('kiosk_provision','6dd9e738'),
               ('kiosk_punch','f8fc23db'),('kiosk_punch_state','48300293'),('kiosk_qr_claim','9a4d9cc5'),('kiosk_qr_poll','84afd08c'),('kiosk_qr_secret','94a6536c'),
               ('kiosk_reactivate','01c923bc'),('kiosk_transport_issue','d63097af'),('kiosk_unlock','3d65ef8c'),('set_store_profile','b074a4bf'),('staff_punch','457ab107')) x(n, m)
  left join pg_proc p on p.pronamespace='public'::regnamespace and p.proname = x.n
 where p.oid is null or left(md5(replace(p.prosrc, chr(13), '')), 8) <> x.m
union all
select 'already exists ' || proname, '' from pg_proc where pronamespace='public'::regnamespace and proname in ('staff_attendance_set','staff_attendance_confirm','punch_cancel_out','staff_punch_cancel_out','staff_pin_unlock','cast_pin_unlock','cast_pin_status','availability_set_cast','demo_reset_mark_failed')
union all
select 'rows in availability*', count(*)::text from (select 1 from public.availability union all select 1 from public.availability_terms) z having count(*) > 0;
```
（1 行目の貼り先証明 `nox-project-proof | 10` は必ず返る＝それ以外の行が 0 なら OK）

## verify の期待値（Success の後に末尾 ===== verify ===== のコメントを外して貼る）

| 行 | 期待値 |
|---|---|
| nox-project-proof | 10 |
| functions | **403**（394＋新設 9） |
| tables | **114**（112＋2） |
| has 0192 | 28 |
| new fns (9) | 9 |
| k.purpose left | 0 |
| kiosk_punch 15 min left | 0 |
| staff_punch default 15 left | 0 |
| kiosk_devices purpose check | 1（CHECK は残す） |
| new tables rls | staff_attendance_days=true,staff_attendance_locks=true |
| new tables acl | availability:authenticated=SELECT,availability_terms:authenticated=SELECT,staff_attendance_days:authenticated=SELECT,staff_attendance_locks:authenticated=SELECT |
| availability cast_id cols | 2 |
| availability membership nullable | availability=YES,availability_terms=YES |
| acl rows | 67 |
| **acl diff** | **0**（0190／0191 の 48 本＋0192 の新設・改稿＝has_function_privilege の anon／authenticated／service_role が期待どおり） |
| acl demo_reset_mark_failed (anon,auth,service) | **false,false,true** |
| acl audit_log_write_service (anon,auth,service) | false,false,false（不変） |
| md5 staff_attendance_set | 83446f6c =file |
| md5 staff_attendance_confirm | 95d4fa4a =file |
| md5 punch_cancel_out | dc70956e =file |
| md5 staff_punch_cancel_out | b047febc =file |
| md5 staff_pin_unlock | a84eb37a =file |
| md5 cast_pin_unlock | be0a26d8 =file |
| md5 cast_pin_status | cebedc8d =file |
| md5 auth_kiosk_store_id | 00f65b4b =file |
| md5 auth_kiosk_register_store_id | 66587880 =file |
| md5 auth_kiosk_operator | f2f0d080 =file |
| md5 kiosk_lock | 51c43564 =file |
| md5 kiosk_login | 81ced32e =file |
| md5 kiosk_logout | cc6c9f5f =file |
| md5 kiosk_punch | ffa49ad5 =file |
| md5 kiosk_punch_state | 0ed80625 =file |
| md5 kiosk_qr_claim | 1e31abb2 =file |
| md5 kiosk_qr_poll | e12933d5 =file |
| md5 kiosk_qr_secret | 5d3e8ad0 =file |
| md5 kiosk_transport_issue | 599162b4 =file |
| md5 kiosk_unlock | 8cf87df4 =file |
| md5 staff_punch | c8ff44c4 =file |
| md5 kiosk_provision | ab75d422 =file |
| md5 kiosk_reactivate | 064026fb =file |
| md5 set_store_profile | b9d361eb =file |
| md5 availability_set | dcfed778 =file |
| md5 availability_list | dfe5361c =file |
| md5 availability_set_cast | 7ccb95af =file |
| md5 demo_reset_mark_failed | b0cee9c7 =file |

`≠file(…)` が 1 行でも出たら、貼った本文が違う（途中で切れた等）＝CC へ。

## 試走で確かめたこと（docs/tmp/try_0192_fn.mjs・23/23・2026-11-02 14:01）
- cast_pin_status＝owner は自店のキャスト・staff は forbidden／cast_pin_unlock・staff_pin_unlock＝ロックが外れ失敗 0・manager から owner の解除は forbidden
- punch_cancel_out＝今日の out を消して出勤中に戻る・2 回目は not out／staff_punch_cancel_out＝同じ
- staff_attendance_set＝打刻 2 本（manual）＋遅刻・退勤だけは bad time・staff 本人は forbidden／月の確定＝manager で確定→修正は confirmed→manager の解除は forbidden→owner で解除
- availability_set_cast＝2 回で行 2・terms 1 行（部分ユニークの on conflict）・発行済みのキャストは has account／availability_list は従来どおり読める
- set_store_profile の kiosk_person_idle_minutes＝15 は保存・0 は bad
- M-47＝NOX-DEMO の打刻端末とレジ端末のどちらでも auth_kiosk_register_store_id／auth_kiosk_store_id が店を返す（既存端末の自動昇格）
- demo_reset_mark_failed＝service_role で ACE に audit 1 行・デモ以外は not demo・authenticated／anon は permission denied・audit_log_write_service は service_role でも denied のまま
- audit＝7 種（availability_set／cast_pin_unlock／punch_cancel_out／staff_attendance_confirm／staff_attendance_set／staff_pin_unlock／staff_punch_cancel_out）がすべて書かれる

## 適用後に CC がやること（0192 のフラグ true 便）
verify の返り値を全行突合 → 一致なら MIG_0192_APPLIED=true → client 済みの配線を live で確認（マスタ › システム › PIN のキャストの行と解除・端末の発行欄に用途なし・1 台で 5 タイル・給与 › 勤怠の退勤の取消・給与 › 勤怠（スタッフ）の修正と月の確定・店設定の無操作で戻す分・未発行キャストの基本の働き方・cron の失敗の監査）→ f0 2 連（基準線＝**165 段 7,073**（7c6da83・11/02 13:08／13:31 の 2 連）＋新 suite）→ lint＋tsc → commit → push → 6 店 reset。
