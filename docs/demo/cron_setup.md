# デモ環境 日次リセットの起動（pg_cron → pg_net → 既存 route）手順書

便 D1-6（裁定328 追補1 ①・reset_design §3 A-2・2026-10-02）。**秘密は mig に書かない**＝本手順で Agoora が SQL Editor に貼る（Vault）。0163 の cron job は Vault の名前だけを参照する。

## 1. 前提（順序）

1. 0163（supabase/migrations/0163_demo_entries_cron.sql）を手貼り＝pg_cron／pg_net の有効化・demo_entries・demo_entries_purge・cron job 8 本。
2. Vault に 2 本（本書 §2）。job は Vault の値を**実行時**に読むため、順序はどちらが先でも動く（Vault が無い間の job は net.http_get の url が null で失敗＝害なし）。
3. Vercel env: `CRON_SECRET`（既存）・`DEMO_USERS`（create-demo-orgs --apply の出力＝D2）。
4. Auth 設定 4 点（demo_users.md §4）: ①Secure email change＝ユーザー自身の email 変更を止める ②サインアップ無効 ③magiclink／OTP 有効期限を 5〜10 分 ④JWT／セッション有効期限＝24 時間（328 追補1 ②「セッション 24 時間」）。

## 2. Vault（SQL Editor・nox-dev の ref を目視してから）

```sql
select 'nox-project-proof', count(*) from public.orgs;                       -- 貼り先証明
select vault.create_secret('https://nox-kappa-eight.vercel.app/api/cron/demo-reset', 'nox_demo_reset_url', 'デモ日次リセットの route（0163 の cron job が参照）');   -- ★ホスト＝Vercel Production（nox-kappa-eight.vercel.app）。10/8 にプレースホルダ「<本番の NOX ホスト>」のまま投入された（便 D2-a で検知）＝下の update_secret で差替え
select vault.create_secret('', 'nox_cron_secret', 'cron route の Bearer（0163 の cron job が参照）');   -- ★第 1 引数の '' の中に Vercel → nox → Settings → Environment Variables → CRON_SECRET の値をそのまま貼る（角括弧の例文は置かない＝10/8 に例文のまま投入された・教訓104 候補）
select name, length(decrypted_secret) as len, decrypted_secret ~ '^[A-Za-z0-9_\-]+$' as ascii_ok, substring(decrypted_secret from '^https?://([^/]+)') as host from vault.decrypted_secrets where name like 'nox_%' order by name;   -- 形の確認（値は出さない）: nox_cron_secret は ascii_ok true・nox_demo_reset_url の host は nox-kappa-eight.vercel.app
select name, description, created_at from vault.secrets where name like 'nox_%' order by name;   -- 3 行（nox_mynumber_key ＋ 2）
```

値の更新は `select vault.update_secret((select id from vault.secrets where name='nox_demo_reset_url'), '<新しい URL>');`。

**★差替え（2026-10-08・便 D2-a の検知）**: 投入済みの値がプレースホルダのままなので、SQL Editor（本番 ref hiqbfagmkrdpmlqhkmsu を URL で目視・貼り先証明を先頭に）で次を実行:

```sql
select 'nox-project-proof', count(*) from public.orgs;
select vault.update_secret((select id from vault.secrets where name='nox_demo_reset_url'), 'https://nox-kappa-eight.vercel.app/api/cron/demo-reset');
select name, substring(decrypted_secret from '^https?://([^/]+)') as host from vault.decrypted_secrets where name='nox_demo_reset_url';   -- host＝nox-kappa-eight.vercel.app（値そのものは出さない）
```

## 3. 動作確認（手貼り後）

★初回の巻き戻し（便 D2-c・2026-10-08）: 作ったばかりの demo org は memberships が無く（payload が供給）、帯の「初期状態に戻す」（POST /api/demo/reset）は auth_org_id が null で 403 になる。**初回は本節の once job か、route を同ヘッダ（Authorization: Bearer CRON_SECRET）で GET する**（?org=<店コード>）。2 回目以降は帯のボタンで可（10 分間隔）。

```sql
select jobname, schedule, active from cron.job where jobname like 'nox-demo-%' order by jobname;   -- 8 行
-- 手動で 1 本だけ試す（結果は cron.job_run_details と net._http_response に残る）
select cron.schedule('nox-demo-reset-once', '* * * * *', (select command from cron.job where jobname='nox-demo-reset-muse'));
select * from cron.job_run_details order by start_time desc limit 5;
select id, status_code, left(content::text, 200) from net._http_response order by id desc limit 3;
select cron.unschedule('nox-demo-reset-once');
```

route 側の応答＝`{ ok, count, retry, results: [{ org, ok, mode, chunks }] }`。失敗 org は audit `demo.reset.failed` に理由（200 字）が残り、06:35 の `?retry=1` がその営業日に未 reset の org だけをやり直す。

## 4. 時刻（JST ⇄ UTC）

| job | UTC | JST | 内容 |
|---|---|---|---|
| nox-demo-entries-purge | 20:15 | 05:15 | demo_entries の 30 日超を削除（audit 'demo.entries.purged'） |
| nox-demo-reset-muse／luna／noir／ace／lily／nest | 21:05／07／09／11／13／15 | 06:05〜06:15 | 店ごとに `?org=<code>`（営業日切替 06:00 の後） |
| nox-demo-reset-retry | 21:35 | 06:35 | `?retry=1`＝demo_reset_at がその営業日でない org だけ |

## 6. シフトの自動確定（裁定380・0172・便 P172・2026-10-16）＝Agoora 手貼り

店設定「送り返しの自動確定時間」（settings_json.shift_auto_confirm_hours＝1〜168・0＝しない）が入っている店だけ、送り返し（status proposed）のまま放置された希望を設定時間後に確定する。route＝`/api/cron/shift-auto-confirm`（GET＋Bearer CRON_SECRET・demo-reset と同型・15 分間隔）。URL は Vault の nox_demo_reset_url の末尾を置換（新しい秘密は作らない）。

```sql
select 'nox-project-proof', count(*) from public.orgs;                       -- 貼り先証明（hiqbfagmkrdpmlqhkmsu）
select cron.unschedule('nox-shift-auto-confirm') where exists (select 1 from cron.job where jobname='nox-shift-auto-confirm');   -- 冪等
select cron.schedule('nox-shift-auto-confirm', '*/15 * * * *', $$select net.http_get(url := replace((select decrypted_secret from vault.decrypted_secrets where name = 'nox_demo_reset_url'), '/api/cron/demo-reset', '/api/cron/shift-auto-confirm'), headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nox_cron_secret')), timeout_milliseconds := 60000)$$);
select jobname, schedule, active from cron.job where jobname='nox-shift-auto-confirm';   -- 1 行
-- 動作確認（15 分後）: select id, status_code, left(content::text, 200) from net._http_response order by id desc limit 3;   -- {"ok":true,"count":<店数>,"results":[{"store":…,"hours":…,"confirmed":n}]}
```

止め方＝`select cron.unschedule('nox-shift-auto-confirm');`。route 側は確定した店ごとに audit 'shift.auto_confirm'（audit_log_write_service＝service_role に grant が無く現状は console だけ＝起票115 と同根）。

## 5. 止め方・戻し方

- 一時停止: `update cron.job set active=false where jobname like 'nox-demo-reset%';`
- 全撤去: `select cron.unschedule(jobname) from cron.job where jobname like 'nox-demo-%';`（表・関数・拡張は残る＝0163 の器）。
- Vercel Pro へ移行した日に vercel.json の crons へ切り替える場合は、上の全撤去を先に行う（二重起動を避ける＝裁定276-5）。

初回無人 reset OK（2026-10-09 JST・便 V44 続き V-2 読取）: purge 05:15 succeeded／reset 6 店 06:05〜06:15＝status_code muse 200・luna 200・noir 200・ace 200・lily 200・nest 200（wipe+load chunk 3／3／3／3／4／4・所要 wipe+load 8／5／7／6／10／13 秒・finalize まで 11／17／11／11／13／17 秒）／retry 06:35 200（6 店 skipped already reset today）／cron.job_run_details 8 本 succeeded・audit demo.reset 26（failed 0）・demo.finalize.failed 0・payroll_runs 2026-09 finalized 6・写真 casts 38＋staff 6・cron.job 8。
10/10〜13 無人 reset OK（2026-10-13 JST・便 V45 V-2 読取）: cron.job_run_details 4 日 × 8 本＝32 本すべて succeeded（purge 05:15／reset 6 店 06:05〜06:15／retry 06:35）・10/13 の net._http_response 7 本すべて 200（6 店 wipe+load chunk 3／3／3／3／4／4・retry は 6 店 skipped）・6 org の demo_reset_at＝10/13（06:05:08〜06:15:07）・payroll_runs 2026-09 finalized 6・cron.job 8。★10/10〜12 の HTTP 応答行は pg_net.ttl（6 時間）で消えるため status_code は当日分しか読めない＝読むなら当日 12:35 JST（retry 06:35＋6 h）まで。

- 2026-10-14 無人 reset OK（uuid[] 写像後 初回）: purge 05:15・reset 6 店 06:05〜06:15・retry 06:35＝8 job succeeded・http 200×7・demo_reset_at 6 org＝10/14・NOIR slide_rank_ids 3 本とも A/S 一致（便 V1014 V-1）。
- 2026-10-15 無人 reset OK（gen-demo 重複ガード＋norm_axes 後 初回）: purge 05:15・reset 6 店 06:05〜06:15・retry 06:35＝8 job succeeded・http 200×7（06:05〜06:35）・demo_reset_at 6 org＝10/15（便 GV-B P-0）。★失敗理由の audit 行は未整備＝起票115。
- 2026-10-16 無人 reset OK（便 V46 V-3・10:29 JST 読取＝SELECT のみ）: purge 05:15・reset 6 店 06:05〜06:15・retry 06:35＝cron.job_run_details runid 59〜66 の 8 job succeeded（'1 row'）・net._http_response id 52〜58＝http 200×7（timed_out false・error_msg null・6 店 wipe+load chunks 3／3／3／3／4／4・retry は 6 店 skipped already reset today）・audit demo.reset 26（failed 0）・demo_reset_at 6 org＝10/16（06:05:08〜06:15:07）・payroll_runs 2026-09 finalized 6・casts 38／写真 38・cron.job 8 active。
