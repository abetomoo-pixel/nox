-- cron_shift_periods_close.sql — 便 ON-3（2026-10-26・0176 ★5 (b)）: 希望の締切を過ぎた募集中の期間を配置中へ（shift_periods_auto_close）＝毎日 JST 06:20 に route を叩く pg_cron job。
--   ★2026-10-27 Agoora 手貼り時に 10 21（JST 06:10）→ 20 21（JST 06:20）へ変更＝デモ 6 店の reset（21:05〜21:15 UTC）の途中に締めが入り ACE／LILY／NEST の reset が締めの後になるのを避ける（21:35 の retry より前）。登録の結果＝nox-shift-periods-close,20 21 * * *,true。
--   Agoora 手貼り（SQL Editor・本番 ref hiqbfagmkrdpmlqhkmsu）。cron_setup.md §6（nox-shift-auto-confirm）と同型＝Vault の nox_demo_reset_url／nox_cron_secret を実行時に読む（値は出さない）。
--   DB の表・関数は増えない（job の登録だけ）。止め方＝select cron.unschedule('nox-shift-periods-close');
select 'nox-project-proof', count(*) from public.orgs;                       -- 貼り先証明
select cron.unschedule('nox-shift-periods-close') where exists (select 1 from cron.job where jobname='nox-shift-periods-close');   -- 冪等
select cron.schedule('nox-shift-periods-close', '20 21 * * *', $$select net.http_get(url := replace((select decrypted_secret from vault.decrypted_secrets where name = 'nox_demo_reset_url'), '/api/cron/demo-reset', '/api/cron/shift-periods-close'), headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nox_cron_secret')), timeout_milliseconds := 60000)$$);   -- 21:20 UTC＝JST 06:20
select jobname, schedule, active from cron.job where jobname='nox-shift-periods-close';   -- 1 行
-- 動作確認（翌朝）: select id, status_code, left(content::text, 200) from net._http_response order by id desc limit 3;   -- {"ok":true,"at":…,"closed":n}
