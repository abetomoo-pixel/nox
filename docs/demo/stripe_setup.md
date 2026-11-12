# Stripe の設定と疎通の手順（NOX・2026-11-12 読取）

根拠＝裁定479（docs/NOX_裁定台帳.md:5829〜5838＝案 A・株式会社レクソルの 1 アカウントで NOX と BANZEN・NOX の受け口は NOX 以外のイベントを 200 で無視・metadata.service='nox'）・launch_gate（docs/demo/launch_gate.md:5 の切替手順 6＝未・:21 のゲート 13＝未疎通）・domain_switch（docs/demo/domain_switch.md:122・:147・:157）。
本書は CC の読取だけで書いた（コードと docs と本番 DB の read only 1 回）。Stripe・Vercel の画面と API は見ていない＝画面の中の状態は「Agoora が確かめる」と書く。

**鍵（sk_…）と署名シークレット（whsec_…）は Agoora が Vercel に直接入れる。チャットにも CC にも貼らない。**

---

## 1. 受け口（route）と URL

| route | file:line | 方法 | 何をする | 本番 URL | Preview URL |
|---|---|---|---|---|---|
| Webhook | app/api/stripe/webhook/route.ts:22 | POST | 署名検証（:31）→ 6 種だけ処理（:37）→ NOX か判定（:46〜51）→ org を解く（:47・:53〜61）→ org_billing を更新（:64〜67・:73〜74）。**org_billing への唯一の書込経路**（:1） | https://noxapp.jp/api/stripe/webhook | https://nox-git-&lt;branch&gt;-&lt;team&gt;.vercel.app/api/stripe/webhook |
| Checkout（契約） | app/api/billing/checkout/route.ts:17 | POST | owner だけ。price を引き（:26）、customer を確保（:31）、mode=subscription の Checkout を作る（:39〜48） | https://noxapp.jp/api/billing/checkout | 同じ形 |
| ポータル | app/api/billing/portal/route.ts:10 | POST | owner だけ。customer の請求ポータルを開く（:22〜26・NOX 用の設定 env があれば指定＝:25） | …/api/billing/portal | 同じ形 |
| 周期の変更（月↔年） | app/api/billing/interval/route.ts:18 | POST | owner だけ。subscription の price を差し替え（:55〜58）。DB は書かない＝webhook の subscription.updated が書く（:5〜6） | …/api/billing/interval | 同じ形 |
| 振込→カード | app/api/billing/switch-to-card/route.ts:15 | POST | owner だけ。mode=setup の Checkout（:39〜46） | …/api/billing/switch-to-card | 同じ形 |
| 振込→カードの戻り | app/api/billing/switch-to-card/return/route.ts:21 | GET | Stripe から戻る先（success_url）。既定の支払方法と collection_method を切替（:58〜70） | …/api/billing/switch-to-card/return | 同じ形 |

- Checkout／ポータルの戻り先は `new URL(req.url).origin` から作る（checkout/route.ts:37・:46〜47、portal/route.ts:20・:24）＝Stripe 側に戻り先 URL の登録は要らない。
- 課金の 5 本は `requireOwner`（app/api/billing/_owner.ts:12〜24）＝ログイン中の本来の役割が owner だけ（:17・:20）・デモ org は 403（:22）。課金画面のナビもデモと管理者には出ない（app/(manage)/layout.tsx:164）。
- Webhook は middleware の保護パスに入っていない（lib/supabase/middleware.ts:58＝/mine・/register・/shift・/report・/master・/dashboard だけ）＝ログイン無しで届く。デモの柵の分類も「セッション無し（B）」（scripts/verify-nox-demo-guard.ts:48・:118）。
- Preview の固定 URL＝ブランチの別名 `nox-git-<branch>-<team>.vercel.app`（main は Production・他のブランチが Preview＝裁定246・台帳:3416）。**&lt;team&gt; の正しい綴りと、使うブランチは Agoora が Vercel › Deployments で確かめる。**
- 送り先は本番では必ず `https://noxapp.jp`（vercel.app は 308 で転送されるが Stripe は 3xx を追わない＝launch_gate.md:14・:21、domain_switch.md:122・:199）。

## 2. Stripe の管理画面で選ぶイベント（6 種）

受け口が処理するのは lib/billing/webhook.ts:10〜17 の集合（逐語）。

```ts
export const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);
```

| イベント | 受け口の動き（route.ts） |
|---|---|
| customer.subscription.deleted | org_billing.status を canceled に倒すだけ（:64〜67・lib/billing/sync.ts:66〜72） |
| 他の 5 種 | subscription id を解き（:69・webhook.ts:24〜30＝subscription.* は obj.id／checkout と旧 invoice は obj.subscription／新しい invoice は obj.parent.subscription_details.subscription）、Stripe から subscription を取り直して org_billing を upsert（:73〜74・sync.ts:46〜62・:87〜118） |
| 上の 6 種以外 | 何もせず 200 `{"received":true}`（:37） |

- **送り先にはこの 6 種だけを選ぶ**（「すべてのイベント」にしない）。同じアカウントの BANZEN の customer.subscription.* と invoice.* は NOX の送り先にも届くが、NOX の目印が無く NOX の customer でもないので 200 `{"received":true,"ignored":"not_nox"}` で無視される（:46〜51・ログ 1 行・DB も Stripe も触らない）。
- 送り先の API バージョン（推奨・推測を含む）＝SDK stripe 22.5.0（package.json:221）が固定する `2026-07-29.dahlia` を選べるなら選ぶ。選べなければアカウントの既定のまま（受け口は invoice の新旧 2 形を読む＝webhook.ts:21〜22）。

## 3. 環境変数（名前だけ）

| 名前 | 読む場所 | 無いとき | Production | Preview |
|---|---|---|---|---|
| STRIPE_SECRET_KEY | lib/stripe/client.ts:11（有無の判定）・:26（SDK 生成） | 課金画面は「Stripe 未接続」（app/(manage)/billing/page.tsx:30・billing-board.tsx:95〜97）・操作ボタンを出さない（billing-board.tsx:125）。Webhook は 500 になる（下の §4）。cron 2 本は Stripe を呼ばず 200 | **要**（本番の鍵 sk_live_…） | **要**（サンドボックスの鍵 sk_test_…） |
| STRIPE_WEBHOOK_SECRET | app/api/stripe/webhook/route.ts:25 | 受け口は 500 `not configured`（:26） | **要**（本番の送り先の whsec_…） | **要**（サンドボックスの送り先の whsec_…＝本番と別の値） |
| STRIPE_PRICE_NOX_MONTHLY | lib/billing/nox-stripe.ts:47・lib/stripe/client.ts:17 | 任意。無ければ lookup_key `nox_monthly` で引く（client.ts:35〜50・nox-stripe.ts:10）。引けなければ checkout／interval が 500 `Stripe 未接続: Price が未設定です`（checkout/route.ts:27・interval/route.ts:28） | 任意（入れない＝lookup_key で引くのが裁定479 の形） | 任意 |
| STRIPE_PRICE_NOX_YEARLY | nox-stripe.ts:47・client.ts:18 | 同上（lookup_key `nox_yearly`） | 任意 | 任意 |
| STRIPE_PORTAL_CONFIG_NOX | app/api/billing/portal/route.ts:25 | 任意。無ければアカウントの既定のポータル設定（BANZEN と共有）で開く | **未決**＝NOX 用の設定（bpc_…）は相談役の承認後に作る（裁定479-4） | 同左 |
| CRON_SECRET | app/api/cron/billing-quantity/route.ts:16・billing-reminders/route.ts:26・expire-trials/route.ts:20 | cron が 401（推測＝route の比較の形から） | 既にある（裁定246・Production and Preview） | 既にある（同） |

- Supabase の 3 本（NEXT_PUBLIC_SUPABASE_URL・NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY・SUPABASE_SECRET_KEY）は webhook と課金 route が org_billing を読み書きするのに使う（createAdminClient）＝既にある前提。
- **Preview の Supabase の 3 本がどの DB を指しているか（dev か本番か）は記録が無い**（裁定246 の時点は「dev のまま」＝台帳:3416・その後の切替で変わったかは未記録）。→ Agoora が Vercel › Settings › Environment Variables の Preview の NEXT_PUBLIC_SUPABASE_URL の ref を見る。**本番の ref（hiqbfagmkrdpmlqhkmsu）なら、サンドボックスの契約が本番の org_billing に書かれる**（§6 の後片付けが必須）。
- 鍵の権限（任意・制限付きキー rk_… にする場合）＝コードが呼ぶ API は customers（create・retrieve・update）・checkout.sessions（create・retrieve）・subscriptions（retrieve・update）・prices（list）・billingPortal.sessions（create）・invoices（list）。
- scripts/admin/create-org.mjs:49〜55 も STRIPE_SECRET_KEY を読む（--add-store の数量同期）。.env.local に無ければ毎日の cron（billing-quantity）が直す（:49）。CC の .env.local には STRIPE_* の名前は 1 本も無い（名前だけ確認）。

## 4. 今の状態

### コードから分かること

| 状況 | 動き |
|---|---|
| STRIPE_WEBHOOK_SECRET が無い／stripe-signature ヘッダが無い | 500 `not configured`（route.ts:26）。**署名ヘッダ無しの POST は env があっても 500**（同じ if） |
| WEBHOOK_SECRET はあるが SECRET_KEY が無い | getStripe() が例外（client.ts:27・route.ts:28 は try の外）＝500（本文は Next の既定・推測） |
| 両方あるが署名が合わない | 400 `invalid signature`（route.ts:32〜34） |
| 6 種以外のイベント | 200 `{"received":true}`（:37） |
| customer が無いイベント | 200 `{"received":true}`（:42） |
| NOX の目印が無く、org_billing にもその customer が無い（BANZEN・管理画面のテスト送信） | 200 `{"received":true,"ignored":"not_nox"}`＋Runtime Logs に `stripe webhook: NOX 以外のイベントを無視 <type> <evt_id>`（:48〜51） |
| org が解けない | 200 `{"received":true}`（:61） |
| 処理中の失敗 | 500 `handler error`＋ログ `stripe webhook 失敗:`（:77〜80）＝Stripe が再送（upsert は org_id で冪等） |
| NOX の目印 | 作るもの全部に `metadata.service='nox'` と org_id：customer（_owner.ts:41）・Checkout session と subscription（checkout/route.ts:43〜44・nox-stripe.ts:14〜16・:61〜71）・setup session（switch-to-card/route.ts:43）。判定は object の metadata・price の lookup_key（nox_monthly／nox_yearly）・price／product の metadata・invoice の parent.subscription_details.metadata（nox-stripe.ts:30〜43） |
| 請求日 | 毎月 1 日 0:00 JST を起点（billing_cycle_anchor）・初回は日割り（nox-stripe.ts:52〜71）。お試しの残りが 48 時間以上なら trial_end に持ち越す（lib/billing/trial.ts） |
| 監査 | webhook は audit_logs を書かない（route.ts に audit の呼び出しなし）＝疎通の跡は org_billing.updated_at と Vercel の Runtime Logs で見る |
| デモ | デモ org は課金 route が 403（_owner.ts:22）・課金のナビを隠す（layout.tsx:164）・webhook にデモの Stripe イベントは来ない（verify-nox-demo-guard.ts:8） |
| cron | billing-quantity は鍵が無ければ 200 `{"ok":true,"skipped":"stripe_not_configured"}`（billing-quantity/route.ts:19）・billing-reminders も対象 0 件か鍵なしで 200（:44〜46）。vercel.json の crons＝expire-trials 18:00 UTC・billing-reminders 20:00・billing-quantity 20:30 |

### docs に記録された状態

- 本番の Vercel に STRIPE_SECRET_KEY・STRIPE_WEBHOOK_SECRET とも無い＝受け口は 500 not configured・課金画面は「Stripe 未接続」（台帳:5837・launch_gate.md:21・2026-11-10 読取）。
- Stripe の送り先は本番にもテストにも NOX の分が無い（テストは BANZEN の 1 件＝banzen.work だけ）（台帳:5835〜5837・v62:83）。
- サンドボックス「NOXテスト」に product と price は作成済み＝product prod_VbN6AYtVVg4n9u（metadata.service=nox）・月額 price_1UaAM5RD48RS7rDb70ErPby9（29,800 円税込・lookup_key nox_monthly）・年額 price_1UaAP8RD48RS7rDbDZo2P66K（288,000 円税込・nox_yearly）（launch_gate.md:21・v62:84）。赤帯「必須タスク 1 件」は中身未確認（v62:84）。
- 本番（live）の product／price は未作成（docs/demo/gate_checklist.md:8＝「未（テストモード）」）。
- 公開情報・ブランディング・請求書フッター＝Agoora 設定済み（11/10・v62:82）。NOX 用ポータル設定＝未（承認待ち）。Stripe の二段階認証＝未確認（launch_gate.md:30）。

### 本番 DB（2026-11-12 CC 読取・begin read only…rollback・ref hiqbfagmkrdpmlqhkmsu）

- `select 'nox-project-proof', count(*) from public.orgs` ＝ 10。
- org_billing ＝ 10 行・全部 status=active・stripe_customer_id 0 件・stripe_subscription_id 0 件（デモ 6・デモ以外 4）＝**Stripe とつながった org はまだ 1 つも無い**。
- 列＝org_id・stripe_customer_id・stripe_subscription_id・status・interval・collection_method・trial_ends_at・current_period_end・quantity・created_at・updated_at・cancel_at_period_end。
- ★CC の .env.local の SUPABASE_DB_URL はこの本番の ref を指している（名前と ref だけ確認）。

### Agoora が画面で確かめること

1. Vercel › Settings › Environment Variables：STRIPE_* が Production／Preview に無いこと（今の状態の再確認）と、Preview の Supabase の ref。
2. Vercel › Settings › Deployment Protection：Preview に「Vercel Authentication」が掛かっているか。**掛かっていると Stripe から Preview の URL へは 401 で届かない（推測＝Stripe はログインできないため）**。その場合は「Protection Bypass for Automation」の値を送り先 URL の `?x-vercel-protection-bypass=…` に付けるか、Preview を飛ばして §5-B（本番）だけにするかを相談役と決める。
3. Stripe（サンドボックス）› Developers › Webhooks：NOX の送り先が無いこと・赤帯の必須タスクの中身。
4. BANZEN の受け口が service=nox のイベントを 200 で無視しているか（裁定479-5＝BANZEN の CC への依頼・実施の記録は NOX 側に無い）。

## 5. Agoora の手順

### A. サンドボックス（テスト）で疎通

1. Stripe の右上でサンドボックス「NOXテスト」に切り替える（本番と間違えない）。
2. 商品と価格を確かめる（作成済み＝§4）：product の metadata に `service = nox`・月額 price の lookup_key が `nox_monthly`・年額が `nox_yearly`・どちらも JPY・税込（inclusive）・数量あたり（per unit）・有効（active）。**lookup_key があれば STRIPE_PRICE_NOX_* は入れなくてよい。**
3. Developers › Webhooks › 「送り先を追加」（Add destination）：
   - イベント＝§2 の 6 種だけ。
   - 送り先 URL＝Preview の固定 URL `https://nox-git-<branch>-<team>.vercel.app/api/stripe/webhook`（§4 の 2 で保護があれば bypass を付ける）。
   - 名前の例＝「NOX Preview」。**BANZEN の送り先（banzen.work）は触らない・流用しない＝NOX 用を別に作る。**
4. 作った送り先の「署名シークレット」（whsec_…）を表示してコピー。
5. Developers › API keys のサンドボックスの「シークレットキー」（sk_test_…）をコピー。
6. Vercel › Settings › Environment Variables に **Preview だけ** を選んで入れる：STRIPE_SECRET_KEY（手順 5）・STRIPE_WEBHOOK_SECRET（手順 4）。Production には入れない。値はチャットにも CC にも貼らない。
7. Vercel で Preview を Redeploy（env は再デプロイで効く）。Preview にするブランチの最新の deploy を選ぶ。
8. CC に「Preview に入れた・URL はこれ」と伝える（URL だけ）→ §6 の 1・2 を CC が行う。
9. Stripe の送り先の画面から「テストイベントを送る」（無い画面なら Agoora の端末で Stripe CLI の `stripe trigger customer.subscription.updated` など）→ 配信ログが 200・本文 `{"received":true,"ignored":"not_nox"}`（テストの object には NOX の目印が無いので無視＝これで正しい）。
10. 実際の流れを 1 回（Preview・デモ以外の org の owner でログイン）：課金画面（/billing）で月額の契約 → Stripe の Checkout でテストカード（4242 4242 4242 4242・期限は未来・CVC 任意）→ /billing?status=success に戻る。→ §6 の 3 を CC が読む。
11. 続けて（任意）：周期を年額に変える（subscription.updated が来る）・ポータルを開く（今は既定の設定で開く＝NOX 用設定が承認されるまで、解約などのボタンが出るかを見るだけにして押さない）・Stripe 側で subscription を解約（deleted が来る）。
12. 後片付け：Preview の DB が本番なら（§3）、試した org の org_billing の stripe_customer_id／stripe_subscription_id／status を元に戻す（方法は相談役と決める＝**放置すると本番の鍵に替えたとき、テストの customer id が残って Checkout が「No such customer」で失敗する＝_owner.ts:33〜34 が既存の id をそのまま使うため**）。

### B. 本番

1. 相談役の合図の後（launch_gate 13）。Stripe を本番（live）に切り替える。
2. 商品と価格を作る（live には未作成）：product 名に「NOX」・metadata `service = nox`・月額 29,800 円（税込・per unit・毎月・lookup_key `nox_monthly`）・年額 288,000 円（税込・per unit・毎年・lookup_key `nox_yearly`）（裁定475 追補1・2）。lookup_key は BANZEN と重ならないこと（nox_ で始まる）。
3. Webhooks › 送り先を追加：URL＝**`https://noxapp.jp/api/stripe/webhook`**（vercel.app では登録しない）・イベント＝§2 の 6 種・名前の例「NOX 本番」。BANZEN の送り先とは別。
4. 署名シークレット（whsec_…）と live のシークレットキー（sk_live_…）を **Vercel の Production だけ** に入れる：STRIPE_SECRET_KEY・STRIPE_WEBHOOK_SECRET。Preview には入れない。
5. Vercel で Production を Redeploy。
6. CC に「本番に入れた」と伝える → §6 の 1・2（本番の URL）。
7. 送り先から「テストイベントを送る」→ 200 `ignored: not_nox`。
8. （ポータル）NOX 用の portal configuration（支払方法の変更と請求書の履歴だけ ON・解約とプラン変更は OFF）は裁定479-4 のとおり相談役の承認後に作り、その id（bpc_…）を STRIPE_PORTAL_CONFIG_NOX として Production（と Preview にはサンドボックスの id）に入れて Redeploy。**アカウントの既定のポータル設定は BANZEN と共有＝触らない。**
9. 初めての本番の契約＝**試し専用の org（NOX-STRIPE-TEST）と Agoora のカードで 1 回**（2026-11-12 ■K-4・Agoora の決定＝前の「CLUB NOX で 1 回」を置き換え。CLUB NOX は使わない＝解約で org_billing が canceled になり、CLUB NOX が billing locked になるため）。前提＝BANZEN 側の確認（§7・service=nox を 200 で無視）が済んでいること。
   - 試し専用の org は §5-A で作ったものを続けて使う。§5-A の後に、その org の org_billing のテストの cus_／sub_ を片づけてから本番の鍵に入れ替える（**残すと本番の Checkout が「No such customer」で失敗する**＝_owner.ts:33〜34）。片づけは本番 DB への書込＝CC は案を出して止まり、相談役の合図の後に行う。
   - その org の owner でログイン → 課金画面（/billing）で月額を契約 → Checkout で Agoora のカード → /billing?status=success に戻る → §6 の 3 を CC が読む（その org の org_billing に cus_／sub_・status active か trialing）。★お試し中の org は Checkout が trial_end を持ち越す＝初回の請求が 0 円・status trialing になる（checkout/route.ts:34〜43）。実際の課金まで確かめるなら、お試しを持ち越さない形（相談役と決める）。
10. **確かめた後に解約と返金**（Stripe の本番の画面で Agoora）：
    1. 顧客（Customers）でその org の customer（metadata.service=nox・org_id）を開く → サブスクリプション → 「サブスクリプションをキャンセル」→ **すぐに（Immediately）**（期間末の解約にしない）。日割りの返金の選択肢が出ても選ばない（下の 2 で全額を返す）。
    2. 支払い（Payments）で、その契約の初回の支払いを開く → 「返金」→ 全額 → 理由（例「動作確認」）→ 返金（0 円の請求なら返金は無い）。Stripe の手数料は戻らない場合がある（実費）。
    3. 送り先の配信ログ＝customer.subscription.deleted が 200（charge.refunded は受け口が処理しない種類＝200 で何もしない）。
11. その後の確かめ（CC が begin read only で読む）＝その org の org_billing が status=canceled。
12. **org ごと片づける**（本番 DB への書込＝相談役の合図の後）：public の行は柵つきの SQL（名前が NOX-STRIPE-TEST で始まる・デモでない・店 1・active／past_due の sub_ が無い ときだけ・memberships → org_id 列を持つ表 → orgs の順）・auth のユーザーは Supabase › Authentication › Users の Delete user。Stripe の customer は記録として残す（消さない）。

**流れのまとめ（■K-4）**＝試し専用の org を作る → テストの鍵で疎通（§5-A）→ その org の org_billing を片づける → 本番の鍵・送り先・商品と価格・NOX 用のポータル設定に入れ替える（§5-B の 1〜8）→ 同じ org で本番の最初の契約を 1 回 → 解約と返金 → org ごと片づける。

**試し専用の org の作り方（案・実行しない）**＝`node scripts/admin/create-org.mjs --store "NOX-STRIPE-TEST" --type cabaret --email "<Agoora のアドレスの + 付き>" --link`（本番 ref では NOX_PROD_CONFIRM=1 が要る・--link はメールを送らずリンクを出す＝1 回だけ使える・--dry-run は DB に接続もしない）。作られる行＝orgs・org_billing（trialing・1 か月）・stores・auth.users・users・memberships（owner）・audit_logs。

### metadata.service の付け方

- コードが作るもの（customer・Checkout session・subscription・setup session）には **コードが自動で** `service=nox` と `org_id` を付ける（§4 の表）。Agoora が手で付けるのは **product の metadata `service=nox`** と **price の lookup_key `nox_monthly`／`nox_yearly`**（どちらも判定に使う＝nox-stripe.ts:20〜27）。
- 管理画面で手で customer や subscription を作る場合（銀行振込の運用など）は、customer と subscription の metadata に `service = nox` と `org_id = <org の id>` を必ず入れる（無いと受け口が NOX のものと分からず無視する＝route.ts:48〜51。ただし org_billing に先に customer id があれば通る＝:47）。

### C. NOX 用の請求ポータル設定（portal configuration・裁定479-4＝2026-11-12 相談役が作成を承認）

中身＝**支払方法の変更と請求書の履歴だけ ON・解約とプラン変更は OFF**。まずサンドボックスに作り、本番は疎通の前に作る。**アカウントの既定のポータル設定（BANZEN と共有）は触らない。**

1. Stripe をサンドボックス「NOXテスト」に切り替える。
2. 設定 › Billing › カスタマーポータル（Customer portal）を開き、既定の設定は変えずに「新しい設定を作る」（Configurations の追加・名前の例「NOX」）。画面に追加の口が無い場合は、Agoora の端末で Stripe CLI の `stripe billing_portal configurations create`（下の項目を指定）でもよい（CC は Stripe の API に触れない）。
3. 機能（Features）：
   - **支払方法の更新（Payment method update）＝ON**
   - **請求書の履歴（Invoice history）＝ON**
   - サブスクリプションの解約（Cancel subscriptions）＝OFF
   - サブスクリプションの更新（プラン・数量の変更・Update subscriptions）＝OFF
   - 顧客情報の更新（住所・メール・税 ID など）＝相談役の指示が無い限り OFF
   - 業務情報（利用規約・プライバシーポリシーの URL）＝利用規約 https://noxapp.jp/terms（プライバシーポリシーは公開の後に足す）
4. 保存して、その設定の id（**bpc_…**）をコピーする。
5. Vercel › Settings › Environment Variables の **Preview** に `STRIPE_PORTAL_CONFIG_NOX`＝サンドボックスの bpc_…（値はチャットにも CC にも貼らない）→ Preview を Redeploy。
6. 本番（live）でも 1〜4 を同じ中身で作り（**疎通の前に**）、**Production** に `STRIPE_PORTAL_CONFIG_NOX`＝本番の bpc_… → Production を Redeploy。
7. 確かめ（Agoora）＝課金画面（/billing）からポータルを開き、支払方法の変更と請求書の一覧だけが出て、解約とプランの変更のボタンが出ないこと（コード＝app/api/billing/portal/route.ts:25 が env の id を渡す）。

**Preview を使うかどうかは、Agoora の確認（Preview の Supabase の ref・Deployment Protection＝§4 の 1・2）の後に相談役が決める。それまで CC は §6 の疎通の検査を流さない（2026-11-12 相談役）。**

## 6. 疎通の確かめ方（CC が流す検査）

| # | 検査 | 期待 |
|---|---|---|
| 1 | `curl -s -o /dev/null -w "%{http_code}" https://<host>/api/stripe/webhook`（GET） | 405（GET は無い＝route は生きている・domain_switch.md:157） |
| 2 | `curl -s -X POST -H "stripe-signature: t=1,v1=x" -d '{}' https://<host>/api/stripe/webhook`（自分の route に偽の署名で 1 回・Stripe の API は呼ばない） | **400 `invalid signature`**＝2 本の env が入った。500 `not configured`＝WEBHOOK_SECRET が無い。500（別の本文）＝SECRET_KEY が無い（§4） |
| 3 | Agoora の §5-A の 9・10 の後、DB を `begin read only` … `rollback` で読む：`select 'nox-project-proof', count(*) from public.orgs;` と `select org_id, stripe_customer_id like 'cus_%' c, stripe_subscription_id like 'sub_%' s, status, interval, quantity, trial_ends_at, current_period_end, cancel_at_period_end, collection_method, updated_at from public.org_billing where stripe_customer_id is not null;` | 試した org の 1 行：c=true・s=true・status=trialing か active・interval=month（年額に変えたら year）・quantity=その org の店舗数（1 以上）・trial_ends_at=null・current_period_end=翌月 1 日 0:00 JST（＝前日 15:00 UTC）・collection_method=charge_automatically・updated_at が試した時刻。解約後は status=canceled。**Preview が dev DB を指す場合は CC の .env.local（本番 ref）では読めない＝dev の接続を相談役と決める** |
| 4 | Vercel › Logs（Runtime Logs・/api/stripe/webhook で絞る）を Agoora が見る（CC は Vercel の画面・CLI に触れない） | テスト送信＝`stripe webhook: NOX 以外のイベントを無視 <type> <evt_id>`・本物の流れ＝エラー行なし（`stripe webhook 失敗:` が無い）・各 POST が 200 |
| 5 | Stripe › 送り先の配信ログ（Agoora） | すべて 2xx。テスト送信は本文 `{"received":true,"ignored":"not_nox"}`・本物は `{"received":true}` |
| 6 | 課金画面（/billing）を Agoora が見る | 「Stripe 未接続」の表示が消え、契約の額（「¥29,800/月（単価 × N店舗）」の形・lib/billing/amount.ts）と周期が出る |

既存の verify（Stripe を呼ばない・DB を書かない純関数と文字列の pin＝疎通の代わりにはならない。f0 に入っているので CC は単独では流さない）：

- scripts/verify-nox-billing-app.ts：HANDLED が 6 種で一致（:166〜169）・resolveSubscriptionId の 3 経路・normalizeStatus・billingFieldsFromSubscription・computeTrialEnd。
- scripts/verify-nox-night1110.ts：isNoxStripeObject の判定（:43〜44）・受け口の not_nox の位置（:45〜46）・lookup_key（:48）・数量の cron（:70）・ポータル設定の env（:71）。
- scripts/verify-nox-demo-guard.ts：stripe/webhook はセッション無し（B）・課金 4 本は柵 A（:48・:118）。
- scripts/verify-nox-billing.ts：DB の課金ゲート（org_billing の status と書込可否）。

## 7. 未決・確かめること（まとめ）

- Preview の Supabase の ref（dev か本番か）と Deployment Protection（§4 の 1・2）＝Agoora の確認の後に、Preview を使うかを相談役が決める（それまで疎通の検査は流さない）。
- NOX 用ポータル設定の作成（裁定479-4）＝**2026-11-12 相談役が承認**＝§5 の C の手順でサンドボックス→本番（疎通の前）。作るまでは本番のポータルはアカウントの既定（BANZEN と共有）で開く。
- サンドボックスの赤帯「必須タスク 1 件」の中身＝Agoora。
- **BANZEN 側が service=nox の通知を 200 で無視しているか（裁定479-5）＝NOX の本番の最初の契約の前に必須**（BANZEN の CC への依頼の結果を確かめてから・確かめていなければ本番の最初の契約をしない）。
- **2026-11-12 相談役**＝BANZEN の受け口は今は metadata.service を見ていない（NOX の通知はテナントにつながらないので結果として 200 で無視されているだけ）＝BANZEN 側で「service が入っていて banzen 以外なら 200 で無視」の直しを入れる裁定が出た。**NOX の本番の最初の契約は、BANZEN の直しが本番に出てから**。
- Stripe の二段階認証（launch_gate 22）＝Agoora。
- 本番の初回の契約を誰の org・カードで行うか＝相談役と Agoora。
