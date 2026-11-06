# ローンチゲート（本番で最後に確認する項目・2026-11-06 夜便レーン 6 で起草）

本番＝Supabase ref **hiqbfagmkrdpmlqhkmsu**・Vercel 本番ドメイン **https://noxapp.jp**（nox-kappa-eight.vercel.app は fallback）。「誰が」＝Agoora（手貼り・実機・外部サービスの画面）／相談役（合図・文面・裁定）／CC（verify・reset・撮影・読取）。期待値は実測で埋める（本書は 1 枚＝済んだら「済（日付）」に書き換える・正本は台帳の「次の番号」）。

| # | 項目 | 誰が | どこで | 期待値 | 状態 |
|---|---|---|---|---|---|
| 1 | mig 0001〜0197b が本番に適用済み（手貼りの検証行が期待値と全行一致） | Agoora（手貼り）／CC（突合） | Supabase › SQL Editor／verify:nox-0196・0197・grants | 関数 419・表 120・0196 22 行／0197 17 行／0197b 6 行一致 | 済（2026-11-06）＝0198 は起草まで（レーン 3）・適用は相談役の合図 |
| 2 | client のフラグ＝lib/nox/rules-0175/flag.ts の MIG_*_APPLIED が本番の mig と一致（0183〜0197 true・0198 false） | CC | verify:nox-bene／benf／0195〜0197（フラグの pin） | f0 緑 | 済（2026-11-06・0197 まで true） |
| 3 | f0 の基準線＝2 連緑（段数・件数・golden 5931／125802） | CC | docs/tmp/f0_*.log＋f0_count.cjs | 最新の 2 連緑と同じ段数・件数 | 夜便の最終便で更新（台帳の「次の番号」に併記） |
| 4 | 6 店 reset が noxapp.jp の route で 6/6 ok（Vault nox_demo_reset_url の host＝noxapp.jp） | CC | docs/tmp/on1_reset.mjs | muse／luna／noir／ace／lily／nest＝200 ok | 済（2026-11-06 17:36＝host noxapp.jp） |
| 5 | 無人 reset（pg_cron 06:05〜・Vercel Cron 03:00／05:00）が翌朝 200 | CC（翌朝読取） | cron.job_run_details・net._http_response・Vercel Logs | status 200・6 店＋retry・expire-trials／billing-reminders 200 | 未（11/07 朝に読む） |
| 6 | vercel.app → noxapp.jp の 308（旧 URL の GET が 308 で noxapp.jp に飛ぶ・/r/<token> の領収書 QR も） | Agoora（Vercel › Domains）／CC（curl） | Vercel › Settings › Domains／curl -I | `curl -I https://nox-kappa-eight.vercel.app/login` が 308・Location が noxapp.jp | 未（domain_switch.md §4 手順 8） |
| 7 | Supabase Auth の URL＝Site URL https://noxapp.jp・Redirect URLs に https://noxapp.jp/**（vercel.app/** は 1〜2 週残す） | Agoora | Supabase › Authentication › URL Configuration | 保存後の再表示で値が一致・/auth/forgot の戻りが noxapp.jp | 未（§4 手順 1・2）＝相談役が「NEXT_PUBLIC_SITE_URL と LIFF の host は noxapp.jp」と確認済み（11/06） |
| 8 | Vercel env NEXT_PUBLIC_SITE_URL=https://noxapp.jp（Production）＋Redeploy | Agoora | Vercel › Settings › Environment Variables | LINE の招待リンク・LIFF の redirectUri が noxapp.jp 始まり | 済（2026-11-06・相談役の確認） |
| 9 | カスタム SMTP（Resend・noreply@noxapp.jp・Sender name NOX）で 1 通届く（/auth/forgot の recovery） | Agoora | Supabase › Authentication › SMTP Settings／Resend | 件名・ロゴ・ボタン・リンク先 noxapp.jp/auth/set-password | 未（レーン 5＝文面は相談役が明朝差し替え） |
| 10 | Email OTP expiration＝3600 秒・メールテンプレ 5 本を貼る | Agoora | Supabase › Authentication › Providers › Email／Emails | 3600・5 テンプレが NOX の文面 | 未（レーン 5） |
| 11 | LINE 連携 1 回＝友だち追加→返事の URL が noxapp.jp・LIFF ログイン・紐付け・期限切れ ID トークンの自動再ログイン（M-116）が通る | Agoora（実機） | LINE アプリ／docs/demo/line_first_run.md 4〜8 | /api/line/bind・session が 200・Runtime Logs に line verify の理由（失敗時） | 未（1〜3 済・4〜8 未・M-116 の実機は夜便の push 後） |
| 12 | キオスク PIN 1 回＝端末で「スタッフでログイン（PIN）」→ 本人の /register・卓カードの指名・出勤時の「今日の控除」 | Agoora（実機）／CC（デモで撮影済み） | 店の端末＝https://noxapp.jp/kiosk | 帯「端末で ◯◯ さんとして操作中」・チップ・チェック群 | デモ＝済（2026-11-06 撮影 shots_0196／benf）・実機＝未（束縛の解除→noxapp.jp で再固定＝§4 手順 5） |
| 13 | Stripe Webhook 1 回＝エンドポイント https://noxapp.jp/api/stripe/webhook・テストイベントが 2xx | Agoora | Stripe › Developers › Webhooks | 配信ログ 2xx・org_billing が動く | 未（§4 手順 6＝本番で登録済みかも未確認） |
| 14 | 11-⑦＝スタッフの登録→招待→受諾を自分の org で 1 回（メールのリンクが noxapp.jp/auth/set-password に着く） | Agoora | /staff → メール → /auth/set-password | 受諾後にログインできる | 未 |
| 15 | ロール 4 種のログイン＝オーナー／店長／スタッフ／キャスト（＋端末）で noxapp.jp に入り直せる（Cookie はホスト限定） | Agoora（本番 org）／CC（デモ 6 店） | /login・/demo | 各ロールの最初の画面（/dashboard・/mine・/kiosk） | デモ＝済（オーナー／店長／キャスト／端末＝2026-11-06 撮影）・本番 org＝未 |
| 16 | プリンタ（使っている店）＝SDP の 2 URL を noxapp.jp に・テスト印刷 | Agoora | プリンタの Web 設定 | テスト印刷が出る | 未（§4 手順 7・使っている店の数は未読） |
| 17 | デモ 6 店の punch_mode／pick ルール＝gen-demo の最新 payload で reset（M-115 のヘアメ代・ACE の承認待ち 1 件） | CC | reset → /mine・ホーム | チェック群・要承認の行が出る | 夜便の push 後の reset で確認 |
| 18 | 0198（貸付台帳）＝起草・試走・handpaste まで（適用は相談役の合図）→ 適用後にフラグ便 | 相談役（合図）／Agoora（手貼り）／CC | docs/demo/handpaste_0198.md | 試走 BEGIN…ROLLBACK・DB 変更 0 | 夜便レーン 3 で起草 |

## 使い方
- 上から順に埋める。「未」の行は domain_switch.md §4 の手順番号と対応（6→手順 8・7→1・2・12→5・13→6・16→7）。
- 済にするときは「済（日付・誰が）」と期待値の実測を書く。f0 の段数と件数は台帳の「次の番号」の数と一致させる。
