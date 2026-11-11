<!-- 2026-11-11: docs/tmp（git の対象外）から docs/demo に移して git に入れた（相談役＝切替の手順 10 のときに別の CC でも読めるように）。以後はこのファイルが正本。 -->
# ドメイン切替の調査（nox-kappa-eight.vercel.app → noxapp.jp）

2026-11-02 CC 調査（読取のみ。コード・DB・Vercel・Supabase・DNS の設定は変えていない）。

前提（Agoora 提示）: noxapp.jp はムームーDNS で Vercel に当て済み・https://noxapp.jp/ で本番が開く・www は 308 で noxapp.jp へ。
Supabase Auth の Site URL は https://nox-kappa-eight.vercel.app のまま、Redirect URLs は vercel.app/** と localhost:3200/**。
最終形は nox-kappa-eight.vercel.app → noxapp.jp の 308 転送（Agoora 決定）。LP（/lp）の canonical／og は noxapp.jp に向ける。

---

## 0. curl での確認結果（2026-11-02・GET／HEAD のみ・ログインなし）

| URL | 結果 |
|---|---|
| https://noxapp.jp/ | 307 → https://noxapp.jp/login（middleware の未ログイン振り分け） |
| https://noxapp.jp/lp | 200 |
| https://noxapp.jp/login | 200 |
| https://noxapp.jp/login?x=1 | 200 |
| https://www.noxapp.jp/ | 308 → https://noxapp.jp/ |
| https://www.noxapp.jp/lp | 308 → https://noxapp.jp/lp |
| https://www.noxapp.jp/login?x=1 | 308 → https://noxapp.jp/login?x=1（クエリは残る） |
| https://nox-kappa-eight.vercel.app/ | 307 → https://nox-kappa-eight.vercel.app/login（まだ転送なし） |
| https://nox-kappa-eight.vercel.app/lp | 200 |
| https://nox-kappa-eight.vercel.app/login(?x=1) | 200 |
| GET /api/cron/demo-reset（認証なし） | 両ホストとも 401（route は両ホストで同じ本番デプロイ） |

- 両ホストとも `Server: Vercel`・`X-Vercel-Id: hnd1::…`（東京リージョン・同一デプロイ）。
- HSTS: noxapp.jp は `max-age=63072000`（includeSubDomains なし）、vercel.app は `…; includeSubDomains; preload`。
- /lp の meta（両ホストで同一）: `robots noindex, nofollow`・`og:title`／`og:description` あり・
  **`og:image` は既に `https://noxapp.jp/lp/og.jpg`**（vercel.app から取っても noxapp.jp）。
  app/lp/page.tsx は metadataBase を持たない＝Next 15 が Vercel の本番ドメイン（VERCEL_PROJECT_PRODUCTION_URL）で解決しており、Vercel 側で noxapp.jp が本番ドメインとして扱われていると読める。
  **`<link rel="canonical">` は無い**。og:url も無い。
- robots.txt（両ホスト同一）: `Allow: /$ /demo /demo/ /lp /lp/`・`Disallow: /`・Sitemap 行なし。

---

## 1. キオスク端末（端末の固定）

### 1-1 保存先と device_fp の作り方

- **device_fp は localStorage のキー `nox_device_fp`**（lib/nox/kiosk/device-fp.ts）。Cookie・IndexedDB は使っていない。
  - 値＝`crypto.getRandomValues` の 32 桁 hex（ブラウザ指紋は採らない）。無ければ作って保存、あれば同じ値を返す（8〜128 字・空白なしでなければ作り直す）。
  - localStorage が使えない（プライベートモード等）と null → 画面に「端末の固定ができません」。
- 送り先: 端末ログイン直後に `kiosk_device_bind(p_device_fp, p_ua)`（app/kiosk/page.tsx 72 行・app/kiosk-register/page.tsx 92 行）。
  さらに `kiosk_login`／`kiosk_unlock`／`kiosk_qr_secret`／`kiosk_qr_poll` に `p_device_fp`（components/nox/kiosk-qr-display.tsx ほか）。
  MIG_0190_APPLIED=true（lib/nox/rules-0175/flag.ts 60 行）＝本番で有効。
- DB 側（supabase/migrations/0190_duty_gate_device_bind.sql 3446〜3492 行）:
  - `kiosk_devices.device_fp` が null なら束縛（fp・bound_at・bound_ua）、同じ fp なら last_seen、**別の fp は `raise exception 'device bound'`**。
  - kiosk_login／unlock／qr_secret／qr_poll も「束縛済みなら同じ fp からだけ」＝別 fp は 'device bound'。
  - 解除＝`kiosk_device_unbind(p_device_id)`（owner・device_fp を null に・audit）。画面＝マスタ › システム › 端末の「固定を解除」（app/(manage)/master/kiosk-device-panel.tsx 166 行）。

### 1-2 noxapp.jp へ移ると 2 台目扱いになるか → **なる（拒否される）**

- localStorage はオリジン単位。noxapp.jp では `nox_device_fp` が空 → **新しい乱数 ID が作られる**＝DB に束縛済みの fp と一致しない。
- さらに Supabase のセッションも Cookie（@supabase/ssr の `sb-<ref>-auth-token`・ホスト限定）なので noxapp.jp では未ログイン → 端末のメール／パスワードでログインし直し → 直後の kiosk_device_bind が **'device bound'** → 画面は「この端末アカウントは別の端末に固定されています…」で denied。
- その他オリジン単位で消えるもの: `nox.kiosk.person`／`nox.kiosk.device_session`（M-49 本人ログイン中の印と控えた端末セッション）・`nox.sidenav`・`nox.shift.queueOpen`・初期設定の下書き `nox.setup.v5.draft.<store>`・レジの最近使った商品など（いずれも利便のみ）。
- **ホーム画面に追加した PWA**（public/manifest-kiosk.json・start_url /kiosk・scope /）は vercel.app のオリジンに結びつく。転送後はスコープ外の URL になるので、noxapp.jp で追加し直す。iOS のホーム画面アプリは Safari と別の保存領域を持つ＝**固定は実際に使う起動形態（追加し直した PWA）で行う**こと。

### 1-3 必要な手順（店ごと・オーナー）

転送をかける前に店ごとに移せる（vercel.app と noxapp.jp が並走している今のうちが楽）。端末 1 台ごとに:

1. 端末アカウントの ID（login_email）とパスワードを手元に用意。パスワードを控えていなければ、マスタ › システム › 端末で **「認証情報を再発行」**（旧 PW は即時無効・新 PW は 1 回だけ表示）。
2. 同じ画面で **「固定を解除」**（kiosk_device_unbind）。
3. すぐにその端末で **https://noxapp.jp/kiosk**（レジ端末は /kiosk-register）を開き、端末アカウントでログイン → kiosk_device_bind が新しい fp で固定し直す。
   PWA で使っている端末は、旧アイコンを消して noxapp.jp/kiosk から「ホーム画面に追加」し、その PWA からログインする。
4. 端末一覧で「固定あり・固定日時が今」になったことを確認。
   - 解除してから再ログインまでの間は「次にログインした端末」が固定を取る＝間を空けない。
   - 移した後に同じ端末で vercel.app を開くと fp が違うので 'device bound'（期待どおり）。
   - 営業中に「本人でログイン」中だった印（nox.kiosk.person）は新オリジンに引き継がれない＝営業時間外に行う。

---

## 2. 認証（招待・パスワード設定／再設定・ログイン）

### 2-1 戻り先 URL の作り方（コード）

- **SITE_URL 系の環境変数は無い**（コードが読む env は SUPABASE_URL／PUBLISHABLE_KEY／SECRET_KEY・CRON_SECRET・DEMO_USERS・STRIPE_* だけ）。
- 画面・route の URL はすべて **実行時のオリジン**から作る:
  - `window.location.origin`: 領収書 QR /r/<token>（components/nox/receipt-print.tsx・receipts-board・register-board）、キオスク QR /kq#<token>（kiosk-qr-display）、LINE 連携リンク /liff/<store>?t=…&m=bind（casts-board・staff-board）、LINE 設定パネルの LIFF／Webhook URL 表示（line-config-panel）、プリンタの SDP URL（printer-panel）。
  - `new URL(req.url).origin`: スタッフ招待 /i/<token>（app/api/staff/invite）、Stripe Checkout／Portal の success/cancel/return（app/api/billing/*）、LINE webhook の応答に入れる LIFF URL。
  - → 転送後は自動的に noxapp.jp になる（コード変更不要）。転送前に作って配ったものは vercel.app のまま（3 章）。
- **ハードコードは 1 か所だけ**: scripts/admin/create-org.mjs 20 行の `--site` 既定値 `https://nox-kappa-eight.vercel.app`（オーナー招待の redirectTo＝`${site}/auth/set-password`）。切替後は `--site https://noxapp.jp` を明示するか、既定値を変える（別便のコード変更）。
- アプリ内に resetPasswordForEmail／signInWithOtp／OAuth は無い。パスワード再設定は Supabase ダッシュボード（Send password recovery）経由＝リンクの戻り先は **Site URL**。
  キャスト／スタッフの招待は自前トークン（/i/<token>・createUser）でメールを Supabase から送らない。

### 2-2 着地点の処理

- app/login/page.tsx 21〜28 行: `#…&type=recovery|invite|magiclink` で着いたら hash を付けたまま /auth/set-password へ。
- app/auth/set-password/page.tsx: ① `#access_token&refresh_token`（implicit）→ setSession ② `?code=`（PKCE）→ exchangeCodeForSession ③ `?token_hash&type` → verifyOtp。
- admin の generateLink／inviteUserByEmail とダッシュボードの recovery はサーバ発行＝コード検証子が無いので **implicit（#access_token）** で返る。

### 2-3 308 転送をはさんで完了するか

- **ハッシュ（#access_token…）**: ブラウザは Location にフラグメントが無い転送で元のフラグメントを引き継ぐ（RFC 7231 7.1.2）。vercel.app/auth/set-password#… → 308 → noxapp.jp/auth/set-password#… で setSession は noxapp.jp で行われ、Cookie も noxapp.jp に載る＝**完了する**。
- **クエリ（?token_hash= 等）**: Vercel のドメイン転送はパスとクエリを保つ（www→noxapp.jp で `?x=1` が残るのを実測）。vercel.app 側の転送も同じ設定方式なら残る（切替直後に実測で確認）。
- **PKCE（?code=）**: 検証子は開始したオリジンの Cookie にある＝vercel.app で開始して noxapp.jp で交換すると失敗する。NOX はブラウザ発の PKCE フローを持たないので実害なし（set-password の②は保険）。
- **ログイン**: signInWithPassword は同じオリジン内で完結。転送後は全員（オーナー・店長・スタッフ・キャストの /mine）が **noxapp.jp で 1 回ログインし直す**（Cookie はホスト限定＝引き継がれない）。キャストのホーム画面アプリ（manifest.json・start_url /）も追加し直しが要る。
- デモ（/api/demo/enter）の nox_demo_until、LINE の店 Cookie もホスト単位＝転送後に入り直せば作られる（影響なし）。
- Supabase は redirect_to が Redirect URLs に無いと **Site URL に落とす**＝noxapp.jp を許可リストに入れる前に noxapp.jp を戻り先にしたリンクを出すと Site URL（vercel.app）に着く。

### 2-4 Supabase Auth の変更順

1. **Redirect URLs に `https://noxapp.jp/**` を追加**（vercel.app/** と localhost:3200/** は残す）。www は 308 で本体に寄るので不要。
2. **Site URL を `https://noxapp.jp` に変更**（メールテンプレートの {{ .SiteURL }}・許可外 redirect_to の落ち先・recovery の戻り先が noxapp.jp になる）。
3. Vercel で vercel.app → noxapp.jp の 308 を有効化（4 章）。
4. create-org.mjs の `--site` を noxapp.jp に（実行時に明示 or 既定値の変更便）。
5. **後日**（出済みの招待・再設定メールの有効期限＝Auth の Email OTP expiration を十分過ぎてから。目安 1〜2 週）`vercel.app/**` を Redirect URLs から外す。外した後に古いリンクが来ても Site URL（noxapp.jp）に落ちるだけ。localhost:3200/** は dev 用に残す。

---

## 3. vercel.app を呼ぶもの（cron・外部・印刷物）

| 呼び手 | 現在の URL の持ち方 | 308 の影響 | 対処 |
|---|---|---|---|
| **Supabase pg_cron＋pg_net**: nox-demo-reset-{muse,luna,noir,ace,lily,nest}（JST 06:05〜06:15）・nox-demo-reset-retry（06:35）＝mig 0163 | Vault `nox_demo_reset_url`（= https://nox-kappa-eight.vercel.app/api/cron/demo-reset・docs/demo/cron_setup.md 16／28 行）＋ `nox_cron_secret`。GET＋Authorization: Bearer | **止まる見込み**。pg_net（libcurl）は既定でリダイレクトを追わない（と理解・未検証）。仮に追っても curl は別ホストへの転送で Authorization を落とす → 401。 | 転送前に `select vault.update_secret((select id from vault.secrets where name='nox_demo_reset_url'), 'https://noxapp.jp/api/cron/demo-reset');` → host 確認クエリ（cron_setup.md 29 行の形）。 |
| **nox-shift-auto-confirm**（15 分毎・cron_setup.md 87 行） | 同じ Vault 値の末尾を置換 | 同上 | 上の 1 本の更新で一緒に直る（job の作り直し不要）。 |
| **nox-shift-periods-close**（JST 06:20・docs/demo/cron_shift_periods_close.sql） | 同上 | 同上 | 同上。 |
| nox-demo-entries-purge | DB 関数のみ（HTTP なし） | なし | なし。 |
| **Vercel Cron**（vercel.json: /api/cron/expire-trials JST 03:00・/api/cron/billing-reminders JST 05:00） | パスだけ。Vercel がプロジェクトの本番デプロイを呼ぶ | 影響しない見込み（Vercel 内部から本番デプロイを直接呼ぶ）。ただしドメイン転送との関係は未検証。 | 切替翌朝に Vercel › Logs で 2 本が 200 か確認。 |
| **Stripe Webhook**（app/api/stripe/webhook・POST・署名検証） | Stripe ダッシュボードに登録したエンドポイント URL | Stripe は 3xx を失敗として扱い追わない＝**届かなくなる**。 | 登録済みなら Stripe › Webhooks でエンドポイントを https://noxapp.jp/api/stripe/webhook に変更（署名シークレットは変わらない＝URL 編集なら STRIPE_WEBHOOK_SECRET 不変。新規作成にした場合は env 差替えが要る）。Checkout／Portal の戻り先は req.url から作るので変更不要。 |
| **LINE Messaging API Webhook**（店ごと /api/line/webhook/<storeId>・POST） | 各店の LINE Developers コンソールに登録（設定パネルが表示した URL） | LINE は転送を追わない（検証も 3xx は失敗）＝**届かなくなる**。 | LINE 連携を設定済みの店ごとに Webhook URL を https://noxapp.jp/api/line/webhook/<storeId> に変更 →「検証」。 |
| **LINE LIFF エンドポイント URL**（店ごと /liff/<storeId>） | 各店の LINE ログインチャネル › LIFF に登録 | LIFF はエンドポイント URL と実ページの URL が一致する前提（liff.init／liff.login の redirectUri）＝転送後は init／ログインが失敗し得る。 | 同じく店ごとに https://noxapp.jp/liff/<storeId> に変更。noxapp.jp 側で LINE 連携を開き直して確認。 |
| **レシートプリンタ（Server Direct Print）**（/api/print/poll/<token>・/api/print/result/<token>・POST） | プリンタ本体の Web 設定に貼った URL（printer-panel が location.origin で表示） | プリンタが 3xx を追うかは機種依存・**未検証**（POST の 308 追従は期待しない方が安全）。 | 印刷を使う店ごとに、noxapp.jp でマスタ › 印刷の URL をコピーしてプリンタの設定を差替え（トークンは同じ）。 |
| **領収書 QR（/r/<token>）を印刷した紙** | 紙に vercel.app が焼き込み | GET＝308 で noxapp.jp/r/<token> に着く＝読める | vercel.app のドメインを外さず転送を**恒久に**残す。 |
| **スタッフ招待 /i/<token>・LINE 連携リンク /liff/…?t=…&m=bind**（送付済み分） | 送った文面に vercel.app | /i は GET＝308 で着く。LIFF 連携リンクは LIFF の URL 変更後に転送経由で開けるかは未検証 | 切替後に出し直すのが確実（LINE 連携リンクは期限付きトークン）。 |
| **キオスク QR（/kq#<token>）** | 端末画面で origin から都度生成 | 端末が noxapp.jp に移れば noxapp.jp。移す前でも GET＋フラグメント＝308 で着く（キャストは noxapp.jp でログインが要る） | 1 章の端末移行で解消。 |
| Supabase Auth のメール | Site URL／redirect_to | 2 章 | 2-4 の順。 |
| ハードコード `nox-kappa-eight` | コード中は scripts/admin/create-org.mjs 5／20 行のみ（docs には多数・手順書 cron_setup.md など） | — | create-org の既定値。docs の手順書（cron_setup.md の URL 例）は別便で更新。 |

---

## 4. 切替の手順（2026-11-05 夜の自走便 6 で書き直し＝今の状態に合わせた 1 枚・Agoora が順にやる）

**今の状態（11/05）**＝noxapp.jp は Vercel の本番ドメインとして稼働中（https://noxapp.jp で開く・www は 308）。LINE Developers の Webhook URL と LIFF エンドポイント URL は **noxapp.jp で設定済み**。M-102（便 D）で LINE の招待リンク・入口 URL・Webhook の返事・liff.login の redirectUri は env `NEXT_PUBLIC_SITE_URL`（未設定なら今の origin）から組む。
残っているのは **Supabase Auth の URL・Vault の cron URL・Vercel の env・キオスク端末の移し替え・vercel.app→noxapp.jp の 308**。推奨時間帯＝JST 07:00〜15:00（pg_cron 06:05〜06:35 と Vercel Cron 03:00／05:00 の後・開店前）。

### 手順（この順で・各行の右が確認）
| # | やること | どこで | 確認 |
|---|---|---|---|
| 1 | Redirect URLs に `https://noxapp.jp/**` を**追加**（vercel.app/** と localhost:3200/** は残す） | Supabase › Authentication › URL Configuration | 一覧に 3 行 |
| 2 | Site URL を `https://noxapp.jp` に変更 | 同上 | 保存後に再表示して値を確認 |
| 3 | Vault `nox_demo_reset_url` を noxapp.jp に（★URL の ref＝hiqbfagmkrdpmlqhkmsu を目視） | Supabase › SQL Editor | 下の SQL の最後の行（host）が noxapp.jp |
| 4 | Vercel の env に `NEXT_PUBLIC_SITE_URL=https://noxapp.jp`（Production）を追加 → **Redeploy**（env は再デプロイで効く） | Vercel › Settings › Environment Variables → Deployments › Redeploy | デプロイ success・キャスト管理の「LINE 連携のリンクを発行」が noxapp.jp 始まり（vercel.app でログインしていても） |
| 5 | キオスク端末（店ごと）＝vercel.app の /kiosk で「固定を解除」（マスタ › 店の端末 › 解除）→ noxapp.jp/kiosk を開いて端末のメール／パスワードでログイン → 固定される（§1-3） | 各端末＋マスタ › 店の端末 | 端末一覧の固定日時が新しい・打刻 1 回・QR 表示 |
| 6 | Stripe Webhook のエンドポイントを `https://noxapp.jp/api/stripe/webhook` に（URL 編集＝署名シークレット不変） | Stripe › Developers › Webhooks | テストイベント送信が 2xx |
| 7 | プリンタ（使っている店）＝SDP の 2 URL を noxapp.jp に | プリンタの Web 設定 | テスト印刷 |
| 8 | vercel.app → noxapp.jp の **308 転送**（Vercel が .vercel.app の本番ドメイン転送を許すか画面で確認＝許さなければ middleware の host 条件付き redirect を CC が別便で） | Vercel › Settings › Domains | `curl -I https://nox-kappa-eight.vercel.app/login?x=1` → 308・Location に /login?x=1 |
| 9 | noxapp.jp で全員ログインし直し（Cookie はホスト限定＝引き継がれない）＝オーナー→/dashboard・キャスト→/mine | ブラウザ | 画面が開く |
| 10 | 1〜2 週後＝Redirect URLs から `https://nox-kappa-eight.vercel.app/**` を外す（転送そのものは恒久に残す＝印刷済みの領収書 QR） | Supabase › URL Configuration | — |

### 手順 5〜10 で CC が確認すること（2026-11-06 夜便レーン 4 で追記＝Agoora の各手順の直後に CC が読取だけで確かめる）
| # | CC が確認すること（読取・コマンド） | 期待 |
|---|---|---|
| 5 | 端末の固定（kiosk_devices.device_fp／bound_at）が店ごとに「今」の時刻で入っている＝`select label, bound_at from kiosk_devices where store_id=…`（読取）・端末から https://noxapp.jp/kiosk の PIN 入口（スタッフでログイン）が開く | bound_at＝切替時刻・/kiosk 200・unlock が 'device bound' にならない |
| 6 | Stripe › Webhooks の配信ログ（最新 1 件）が 2xx・`curl -I https://noxapp.jp/api/stripe/webhook` が 405 か 400（GET は受けない＝route は生きている） | 2xx／405 or 400 |
| 7 | プリンタ＝`print_jobs` の最新行の status と created_at（読取）＝テスト印刷の後に 1 行増えて done | done |
| 8 | 308＝`curl -I https://nox-kappa-eight.vercel.app/login`（308・Location: https://noxapp.jp/login）・`curl -I https://nox-kappa-eight.vercel.app/r/<token>`（308＝領収書 QR が新 URL へ）・LIFF `curl -I https://noxapp.jp/liff/<storeId>`＝200・Webhook `curl -I https://noxapp.jp/api/line/webhook/<storeId>`＝405 か 400（GET は受けない）・デモ reset（on1_reset.mjs）＝6/6 200 | 308／200／405 or 400／6 店 ok |
| 9 | 全員ログインし直し＝デモ 6 店の 4 ロール＋端末を noxapp.jp で 1 周（docs/tmp/shot_benf.mts／shot_m119.mts＝SHOT_BASE は noxapp.jp が既定）＝/dashboard・/mine・/kiosk が開く・ヘッダーのベルとカード | 画面が開く・撮影 ok |
| 10 | Redirect URLs から vercel.app/** を外した後＝`curl -I https://nox-kappa-eight.vercel.app/auth/set-password`（308 のまま）・Supabase › URL Configuration の一覧に vercel.app が無い・Auth の Site URL が noxapp.jp（/auth/forgot の 1 通が noxapp.jp に戻る） | 308・一覧 2 行（noxapp.jp／localhost） |

### 3 の SQL（SELECT で現値 → update_secret → SELECT で確認）
```sql
select 'nox-project-proof' k, count(*)::text v from public.orgs
union all select name, substring(decrypted_secret from '^https?://([^/]+)') from vault.decrypted_secrets where name='nox_demo_reset_url';
select vault.update_secret((select id from vault.secrets where name='nox_demo_reset_url'), 'https://noxapp.jp/api/cron/demo-reset');
select name, substring(decrypted_secret from '^https?://([^/]+)') host from vault.decrypted_secrets where name='nox_demo_reset_url';
```
（nox-shift-auto-confirm・nox-shift-periods-close は同じ Vault 値の末尾を置換して呼ぶ＝この 1 本で一緒に直る）

### 切替後の確認項目
- [ ] 翌朝: `select jobname, status, return_message from cron.job_run_details order by start_time desc limit 20` と `net._http_response`（status_code 200・6 店＋retry）・shift-auto-confirm の 15 分毎が 200。
- [ ] 翌朝: Vercel › Logs で /api/cron/expire-trials（03:00）・billing-reminders（05:00）が 200。
- [ ] 招待テスト（11-⑦）: スタッフの登録→招待→受諾を自分の org で 1 回＝メールのリンクが noxapp.jp/auth/set-password に着く。
- [ ] パスワード再設定: /auth/forgot（M-84）からの recovery が noxapp.jp に戻る（Site URL）。
- [ ] LINE: docs/demo/line_first_run.md の 8 段（友だち追加→返事の URL が noxapp.jp・LIFF からログイン・紐付け）。
- [ ] Stripe › Webhooks の配信ログが 2xx。プリンタのテスト印刷。
- [ ] /lp の og:image が https://noxapp.jp/lp/og.jpg のまま（canonical は別便）。

### メールテンプレート（Resend／カスタム SMTP と同時に）
- 下書き＝docs/demo/mail_templates/（招待 invite.html・パスワード再設定 recovery.html・マジックリンク magic_link.html・メール変更 email_change.html・README.md）。文面は相談役が差し替える前提・ロゴ＝https://noxapp.jp/brand/nox_logo_horizontal_dark.png・ボタン＝金・送信元 noreply@noxapp.jp。
- 貼る場所＝Supabase › Authentication › Email Templates（Invite user／Reset password／Magic Link／Change Email Address）。カスタム SMTP＝Resend（noxapp.jp の TXT／MX → API キー → Supabase › Authentication › SMTP Settings＝noreply@noxapp.jp）→ Email OTP expiration 3600 秒。

### LP（/lp）の canonical／og
- 現状 og:image は既に `https://noxapp.jp/lp/og.jpg`。canonical／og:url は app/layout.tsx の metadataBase（別便）。公開時（noindex 解除時）に robots.ts へ sitemap／host を足すかは別判断。

---

## 未検証・要確認
- pg_net の net.http_get がリダイレクトを追うか（追わない前提で Vault を先に更新するので結論は変わらない）。
- Vercel Cron がドメイン転送の影響を受けないか（翌朝ログで確認）。
- Vercel で .vercel.app 本番ドメインに 308 転送を設定できるか（画面で確認）。
- プリンタ（SDP）・LIFF が 308 を追うか（追わない前提で URL を差し替える）。
- Stripe Webhook が本番で登録済みか・LINE 連携／プリンタを使っている店の数（DB は読んでいない）。


## 追記（2026-11-11・手順 8 の後）
- 旧 URL（nox-kappa-eight.vercel.app）と www.noxapp.jp は 308 で https://noxapp.jp の同じパスへ（GET も POST も）。**外部の webhook は転送を追わない前提＝Stripe・LINE の送り先は必ず https://noxapp.jp で登録する**（相談役 2026-11-11）。
- LINE Developers（2026-11-11 Agoora 確認）＝Messaging API の Webhook URL は https://noxapp.jp/api/line/webhook/<id>・Webhook の利用 ON。LIFF のエンドポイントとリッチメニューのリンクは未確認。
