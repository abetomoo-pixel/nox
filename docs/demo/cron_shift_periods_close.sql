-- cron_shift_periods_close.sql — 便 ON-3（2026-10-26・0176 ★5 (b)）: 希望の締切を過ぎた募集中の期間を配置中へ（shift_periods_auto_close）＝毎日 JST 06:10 に route を叩く pg_cron job。
--   Agoora 手貼り（SQL Editor・本番 ref hiqbfagmkrdpmlqhkmsu）。cron_setup.md §6（nox-shift-auto-confirm）と同型＝Vault の nox_demo_reset_url／nox_cron_secret を実行時に読む（値は出さない）。
--   DB の表・関数は増えない（job の登録だけ）。止め方＝select cron.unschedule('nox-shift-periods-close');
select 'nox-project-proof', count(*) from public.orgs;                       -- 貼り先証明
select cron.unschedule('nox-shift-periods-close') where exists (select 1 from cron.job where jobname='nox-shift-periods-close');   -- 冪等
select cron.schedule('nox-shift-periods-close', '10 21 * * *', $$select net.http_get(url := replace((select decrypted_secret from vault.decrypted_secrets where name = 'nox_demo_reset_url'), '/api/cron/demo-reset', '/api/cron/shift-periods-close'), headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'nox_cron_secret')), timeout_milliseconds := 60000)$$);   -- 21:10 UTC＝JST 06:10
select jobname, schedule, active from cron.job where jobname='nox-shift-periods-close';   -- 1 行
-- 動作確認（翌朝）: select id, status_code, left(content::text, 200) from net._http_response order by id desc limit 3;   -- {"ok":true,"at":…,"closed":n}
