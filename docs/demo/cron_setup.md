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

## 5. 止め方・戻し方

- 一時停止: `update cron.job set active=false where jobname like 'nox-demo-reset%';`
- 全撤去: `select cron.unschedule(jobname) from cron.job where jobname like 'nox-demo-%';`（表・関数・拡張は残る＝0163 の器）。
- Vercel Pro へ移行した日に vercel.json の crons へ切り替える場合は、上の全撤去を先に行う（二重起動を避ける＝裁定276-5）。
