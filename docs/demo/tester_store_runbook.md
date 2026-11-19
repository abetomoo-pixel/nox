# テスター店舗の立ち上げ手順（運営用・1 枚）

2026-11-13 夜・相談役 ■11（2026-11-17 夜便 N4 で体入・送りの額・店舗設定のタブ・ロック中の名前の一覧・お試しを今の作りに合わせた）。今の作り（main・本番は 0201d まで）を読んで書いた。**今の作りで出来ない所・手で直す所はそのまま書く**（「★手作業」「★出来ない」の印）。鍵・パスワードの値はこの文書に書かない。

## 1. 会社と店を作る（運営）

```bash
node scripts/admin/create-org.mjs --store "店名" --type cabaret --email owner@example.com --org "会社名" --dry-run
```
```bash
NOX_PROD_CONFIRM=1 node scripts/admin/create-org.mjs --store "店名" --type cabaret --email owner@example.com --org "会社名"
```
- 入れる値：`--store` 店名／`--type` 業態（cabaret・girlsbar・snack・lounge・bar＝初期設定の STEP 1 の既定）／`--email` 最初のオーナーのメール（そのままログイン ID）／`--org` 会社名（省くと店名）／`--site`（省くと本番 URL）／`--link`（メールを送らず招待リンクを画面に出す）／`--yes`（確認を省く）。`scripts/admin/create-org.mjs:7-9`
- 柵：本番の ref では `NOX_PROD_CONFIRM=1` が無いと走らない・同じメール／同じ会社名があれば止まる・途中で失敗したら作った行を巻き戻す（`:10`, `:83-95`）。env は `.env.local` の URL・secret・DB_URL（値は書かない）。
- 作られるもの：orgs 1・org_billing 1（お試し）・stores 1（`setup_done:false`）・auth の招待・users 1・memberships 1（owner）・audit_logs 1（`create_org`）。
- 2 店目を同じ会社に足す：`node scripts/admin/create-org.mjs --add-store --org-id <id> --store <店名> [--type]`（`:3`, `:26-60`）。★設定の写しは無い（2 店目も空から初期設定）。
- ★自分で申し込む画面（/signup）は無い。会社を作る経路はこのスクリプトだけ。

## 2. お試し期間（切れない設定と、手で延ばす方法）

- 作った時点＝`org_billing.status='trialing'`・`trial_ends_at`＝作成から 1 か月（`create-org.mjs:101-102`・裁定475）。
- 書けるかの判定＝`billing_writable_of`：trialing／active／past_due で、trialing なら `trial_ends_at > now()`（`supabase/migrations/0087_org_billing.sql:48-60`）。切れると閲覧だけ（BillingBanner）。毎日 JST 3:00 の cron（`/api/cron/expire-trials`）が trialing を inactive に倒す（表示用）。
- ★**「切れない」専用の設定は無い**（`trial_ends_at` は NOT NULL）。テスターを長く使わせる道は 2 つ。どちらも運営が SQL Editor で手で書く（org_billing の書込は service 専用＝画面も RPC も無い）。
  - (a) 期限を延ばす：`trial_ends_at` を先の日付に。cron で `inactive` に倒れていたら `status` も `trialing` に戻す。
  - (b) 判定上は `status='active'`・`stripe_subscription_id` は null（デモと同じ形）にすると期限を見ない。**テスター店舗はこの形を使う（裁定500-5・2026-11-14）**：入れた日と理由を台帳に 1 行・テストを終えるときは status を戻す。数量の cron は契約の無い店を飛ばす・お試しの帯は出ない＝有料の店と見分けが付かないので台帳の 1 行が目印。
  - (a) の期限を遠くする形は使わない（checkout で残りのお試し期間を Stripe に持ち越すとき trial_end の上限に当たるおそれ）。
- ★延ばした記録は audit_logs に残らない（SQL の直書き）。延ばしたら台帳か運用メモに日付と理由を書く。

## 3. 無料の間は Stripe を通さない

- お試しはカード登録なしで始まる（`create-org.mjs:2`）。Stripe を通るのはオーナーが /billing から契約したときだけ（`/api/billing/checkout`＝カード必須・残りのお試し期間は Stripe に引き継ぐ＝`app/api/billing/checkout/route.ts:1-5, 33-47`）。
- テスターには /billing の「契約」を押さないよう伝える。★押させない柵は無い（オーナーには /billing が出る）。契約すると `trial_ends_at` が null になり期限は Stripe 側に移る（`lib/billing/sync.ts:39-44`）。

## 4. 最初のオーナーのログインの渡し方

- 既定：招待メール（Supabase の招待・リンクの期限は Auth の「Email OTP expiration」）→ `/auth/set-password` で本人がパスワード（8〜72 字）を決める（`app/auth/set-password/page.tsx`・`/api/auth/invite-accept`）。
- メールが届かない店：`--link` で作り、出たリンクを運営が本人に直接渡す（LINE など）。★リンクはログインそのもの＝渡す相手を間違えない・期限内に使ってもらう。
- 忘れたとき：`/auth/forgot`。
- 初回の流れ：ログイン → 規約の同意（/terms/accept）→ /setup（初期設定）。

## 5. 初期設定に同席するときの順番（/setup・9 段）

お店 → 席・卓 → 料金 → メニュー → キャスト待遇 → スタッフ → シフト・勤怠 → 会計・レジ → 確認（`lib/nox/setup/v5.ts:25`）。「この内容で始める」で店舗設定・送り・売掛・税・領収書・営業時間・席・料金・商品・待遇・スタッフ（作成と PIN）・最初のシフト期間・店の端末の発行を順に書き、最後に `setup_done:true`（`v5.ts:308-383`）。
- 同席のコツ：営業時間と定休日（STEP 1）は正しく。0201d から**定休日には開卓できない**（店長以上は臨時営業に切り替えられる・スタッフは止まる）。
- 送りの額（裁定501・11/16）：送りが**定額**の店は STEP 5（キャスト待遇）で「本人の退勤と店の端末から送りを記録するときの額（1 回）」を入れないと先へ進めない（空のまま 1000 円を書くことはもうない）。定額でない店は送りの方式どおり。手数料・自動確定の時間などの刻みは 11/13 の便 1 で直した。
- 初期設定のあとに設定を見直す場所＝マスタ › 店舗設定（タブは 7 つ＝店舗情報／レジ／シフトと打刻／給与／キャスト画面／税と請求／LINE 連携・スマホは 2 列）。補足は項目の横の ⓘ・特殊な設定（略称・店舗コード・表示名・店の端末で本人がログインしたときの戻る時間・LINE Developers に貼る URL）は「詳しい設定」に畳んである・保存のボタンはカードの下の帯。

## 6. LINE の公式アカウントをつなぐ

- 店ごと（全体の env は無い）。手順書＝`docs/demo/line_first_run.md`（8 段）。LINE Developers に Messaging API と LINE ログインの 2 チャネル・LIFF（Full・openid・エンドポイント `https://noxapp.jp/liff/<storeId>`）・Webhook `https://noxapp.jp/api/line/webhook/<storeId>`（ON）・応答メッセージ OFF。
- NOX 側：店舗設定 › LINE 連携 に公開値（login_channel_id・liff_id・bot_destination）と秘密値（channel_secret・access_token＝Vault へ）。
- キャスト・スタッフの紐付け＝キャスト／スタッフの画面から LINE の招待リンク（1 回だけ・7 日）。★紐付けの解除は画面に無い（SQL）。
- リッチメニュー＝`docs/demo/line_richmenu_manual_setup.md`（店が手で登録・今は 3 つとも /mine に着く）。

## 7. 店の端末（キオスク）の登録

- 発行：初期設定の STEP 8 か、マスタ › システム の端末の欄（owner・自店の店長）→ `/api/kiosk/provision` が仮のメールと 16 字の初期パスワードを 1 回だけ返す。
- 端末で `/kiosk` を開き、そのメールとパスワードでログイン。★パスワードは再表示できない＝その場で端末に入れる。
- PIN：スタッフ＝`set_staff_pin`（推測されやすい PIN と重複は 0201g で拒否）・キャストの打刻＝キャストの画面。
- 「名前を選んで入る」は**いつも出る**（11/18 から）。一覧に出るのは、店長とスタッフのうち PIN を設定した人と、**レジか締めの許可があるキャスト**（スタッフの PIN が無ければ打刻の PIN で入る＝0201r・本番に適用済み 11/18）。オーナー（PIN を持たない）は出ない＝オーナーに端末を触らせるときは店長かスタッフの PIN で。
- PIN の失敗が続くと端末はしばらくロック（**既定 5 分**＝0201r）。ロック中は数字のキーを畳み、名前と PIN で入る形が主になる。出退勤の打刻はロック中も使える。
- キャストが店の端末で入れるのはレジの画面だけ。レジが「出勤中だけ」の店で出勤前に入ると、卓の一覧の代わりに「出勤の打刻をしてから、レジを使えます」と「打刻の画面へ戻る」が出る（11/19 から）。
- キャストの締めの許可は、レジの許可がある人にだけ付けられる。レジの許可を外すと締めの許可も外れる（11/19 から・画面の決まり）。

## 7-2. 体入（体験入店）の人を入れる（11/16 から）

- 入れ方：キャスト › 体入 の「体入を追加」。名前と生年月日（18 歳の判定）だけで入る。待遇は**店の既定のプラン**（選び直せる）・始まりの日は今日（変えられる）・保証は付けない（裁定490 の 12 点の 1）。
- 体入の間の時給＝本人に付けた体入の時給 → 無ければ店の体入の時給（店舗設定の「体験入店の条件」）。給与の画面にそのまま反映される（0201l・裁定490）。どちらも無いときはプランの時給で計算し、給与の画面に注意が出る。
- 終わり方は 3 通り：**本採用**（プランを選ぶ）／**見送り**（退店扱い）／**退店**。
- 時給の見込み（「来月／今月の時給の見込み」）は体入の間は出ない（段を使わないため）。

## 8. マイナンバーを使うか使わないか

- ★**店ごとの「使う／使わない」の設定は無い**。使わない店は登録しなければよい（登録は owner・自店の店長が `/api/cast/mynumber/register`）。
- 使う店：サーバーの env `NOX_MYNUMBER_KEYS`・`NOX_MYNUMBER_KEY_CURRENT` が本番にあること（値は書かない・11/13 に相談役が名前を確認済み）。保持年数は店舗設定の `mynumber_retention_years`（1〜20・既定 7）。
- 説明に使う文書：`docs/legal/privacy_v0.5.md`（/privacy で公開済み）。

## 9. 困ったときに運営が見る所

- 監査：`/audit`（owner だけ・自分の会社の分だけ）。「要確認」の自動判定あり（`lib/nox/audit/alerts.ts`）。★運営が全社を見る画面は無い＝運営は SQL Editor で `audit_logs` を org_id で引く。
- お試し・契約：`org_billing`（status・trial_ends_at・stripe_subscription_id）。
- cron：Vercel の Logs で expire-trials・billing-reminders・audit-purge が 200 か（`docs/demo/domain_switch.md:121, 174`）。★Vercel の画面は Agoora が見る（CC はブラウザで Vercel にログインしない）。
- 障害の手順：`docs/NOX_運用runbook.md`（構築・復旧・既知の不具合）。

## まとめ：今の作りで手作業になる所

1. お試しを延ばす（org_billing を SQL で・記録は手で）＝テスター店舗では使わない（下の 2 を使う）。
2. 「切れない」状態＝status='active'・stripe_subscription_id は null を SQL で入れる（裁定500-5・§2 (b)）・入れた日と理由を台帳に 1 行・テストを終えるときは status を戻す。
3. 契約の押し間違いを止める柵が無い（口頭で伝える）。
4. LINE の紐付けの解除（SQL）。
5. リッチメニューのボタンごとの行き先（橋の直し待ち）。
6. 2 店目の設定の写し（無い）。
7. 運営が全社の監査を見る画面（無い）。
