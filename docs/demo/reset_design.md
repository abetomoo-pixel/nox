# デモ環境 巻き戻し設計（日次 05:00 JST＋手動）

便 D0-4（裁定328・2026-10-01）。読取のみ・migration は列挙まで（起草は便 D1＝0162 想定）。

## 1. 現状（repo 2026-10-01・HEAD＝便 M4）

| 器 | 所在 | 状態 |
|---|---|---|
| orgs.is_demo／demo_reset_at | mig0149 | live（本番 0001〜0161 適用済み）。 |
| demo_org_reset(p_org_id, p_payload, p_mode) | mig0149（0152／0153／0159／0160 で表順追補＝c_wipe 82／c_load 81） | live。service_role のみ・1 org＝1 tx・残す 3 表 orgs／org_billing／users・payload の全行 org_id 検査・stock_logs の sale 行は入れない（トリガ再生成）・末尾 audit 'demo.reset'。 |
| service_role statement_timeout 30s | mig0150 | live。 |
| storage cast-photos の is_demo 拒否 | mig0149 ★10 | live。 |
| lib/nox/demo/seed.ts | client | buildPayload（lib/nox/demo/recordings/<biz>.json → 今日基準にずらす → remapUuid）・runDemoReset（8 秒超で wipe→load の 2 回呼び）・afterResetHooks（形だけ・未実装）。**録画 JSON は存在しない**（録画なし＝503）。業態 4（cabaret／girlsbar／snack／lounge）前提＝`bizOfOrgName('NOX-DEMO-CABARET')`。 |
| app/api/cron/demo-reset | client | GET＋Bearer CRON_SECRET。is_demo の org を名前順に 1 つずつ reset。**vercel.json の crons に未登録**（Hobby 2 本上限＝expire-trials／billing-reminders が使用中・裁定276-5「Pro 後に 3 本目」）。 |
| app/api/demo/reset | client | POST・demo org のセッションのみ・10 分間隔（RESET_INTERVAL_MIN）・429 に残り分数。owner 用ボタンの導線は未確認（本便は読取のみ＝D1 で UI の有無を確認）。 |
| app/api/demo/enter | client | POST {biz, role} → env DEMO_USERS（"<biz>:<role>" → auth user id）→ magiclink 生成→verifyOtp→cookie→/dashboard か /mine。対象が demo org でなければ 403。 |
| app/demo（入口） | client | 業態 4 × 役割 3 のボタン・規約 5 項＋同意（裁定293-7）・noindex。 |
| lib/nox/demo/guard.ts＋verify:nox-demo-guard | client | route 柵（A 拒否 12 系／B セッション無し 6／C 許可 20）＝全 route 分類済み・未分類は赤。 |
| scripts/demo/create-demo-orgs.mjs | script | 4 業態 org＋org_billing active＋auth 3 名（owner／manager／cast）＋users。--dry-run のみ実行済み。stores／memberships／casts は作らない（録画が供給）。 |

## 2. 裁定328 との差分＝直すもの

| 328 の要件 | 現状 | 変更 |
|---|---|---|
| 6 店舗（MUSE／LUNA／NOIR／ACE／LILY／NEST） | 業態 4 org | **org 6 本**（NOX-DEMO-MUSE … NOX-DEMO-NEST）。seed.ts の DEMO_BIZ_TYPES／bizOfOrgName／recordingPath を店コード 6 へ・app/demo の入口を 6 店 × 役割へ・create-demo-orgs の BIZ を 6 へ（既存 4 org は作っていないので置換だけ）。 |
| 毎日 1 回（JST 05:00・営業日切替後）＋手動 | cron route あり・登録なし | §3 で pg_cron を選ぶ。05:00 JST は cutoff 06:00 の**前**＝営業日切替「後」にするなら 06:05 JST。**05:00 のまま進めると前営業日の深夜帯（05:00〜06:00）がリセット後の「当日」に属さない**（bizDateOf は 05:00 を前営業日と判定）＝相談役へ確認点①（推奨＝06:05 JST）。 |
| 相対日で投入・固定日付なし | dateshift あり | 変更なし（録画 JSON の形は既存）。 |
| 課金ゲート外 | org_billing active で通す（create-demo-orgs） | 変更なし（billing_writable_of は無改造＝273-6）。 |
| owner のメール／パスワード変更不可・org 削除・Auth 系なし | staff/update-email は柵 A・パスワード変更の route は無い（Supabase 直＝auth.updateUser） | **追加**: /auth の設定画面（あれば）で demo org は導線を隠す＋auth 側は「Auth 設定 4 点」（Agoora・持越し）の 1 つ＝「ユーザー自身のメール変更を無効」で塞ぐ。org 削除 route は無い。 |
| 外部送信（LINE／メール）なし | メール＝magiclink の生成はサーバ内で verifyOtp（送信しない）・LINE 送信の route は無い | 変更なし。Stripe は柵 A。 |
| kiosk トークン固定 | kiosk/provision は柵 A（デモで発行不可） | **追加**: 録画に kiosk_devices 1 台（purpose punch・auth_user_id＝DEMO_USERS の kiosk ユーザー）を含めれば ID 固定で巻き戻る。kiosk の auth ユーザーを create-demo-orgs で作る（§5 DEMO_USERS）。 |
| ID 固定（UUID 対応表を payload に） | remapUuid（org ごと決定的）＋録画 meta.users | 変更なし＋録画 meta.ids（source_id→uuid）を足す（対応表 §0）。**6 org 別録画**にするなら remapUuid は不要だが、同じ録画を複数 org に載せる余地を残すため既存のまま。 |
| 二重計上 0 | demo_org_reset は wipe→load・stock_logs sale はトリガ再生成 | 変更なし。売掛の開始残高は対応表 §4 の 2 区分。 |
| 同時利用中でも完了（tx 単位は org） | 1 org＝1 tx・30s | 変更なし。利用中のセッションは reset 後の最初の RPC で 'not found' 系の和文（rpc-err）を見る＝**上部帯**「毎朝 5 時に初期化」（273-8）で告知。 |
| 保留 5 項目は投入対象外 | — | 生成器の範囲（gen_plan）。 |

## 3. 日次リセットの起動＝pg_cron 案 vs Vercel cron

| 観点 | A. pg_cron（DB 内） | B. Vercel cron（既存 route） |
|---|---|---|
| 器 | nox-dev／本番の Supabase に pg_cron・pg_net が有効（門番の pg_stat_activity に「pg_cron scheduler」「pg_net 0.20.3」の backend が常駐＝確認済み）。 | vercel.json crons。Hobby は 2 本上限＝**3 本目が登録できない**（276-5）。Pro 移行は未着手（起票97 も Pro 待ち）。 |
| 呼び方 | A-1 `cron.schedule('nox-demo-reset', '5 21 * * *' /*06:05 JST*/, $$select public.demo_org_reset_all()$$)`＝DB 内で payload を読んで 6 org 順に demo_org_reset。**payload を DB に置く必要**（録画 JSON は repo にある）→ 新表 demo_payloads（org_id・payload jsonb・meta）＝0162。／A-2 pg_net で `GET /api/cron/demo-reset`（Bearer CRON_SECRET を vault に置く）＝payload は repo のまま・DB は HTTP を叩くだけ。 | route がそのまま動く。payload は repo。 |
| 失敗時の再試行 | A-1: 関数内で org ごとに `begin … exception when others` で続行し、失敗 org を audit 'demo.reset.failed' に残す。cron.job_run_details に履歴。再試行＝30 分後の 2 本目 job（失敗 org だけ）。／A-2: pg_net は非同期・応答は net._http_response に残る（route 側の results JSON）。再試行は route 内で org ごとに続行（既存）＋ 2 本目 job。 | Vercel cron は再試行なし（失敗はログのみ）。route 内の org ごと続行は既存。 |
| 所要時間 | 1 org の reset＝suite 実測 1〜3 秒（伝票 5 枚）。先月 1 か月分（伝票 300〜600 枚・行 3,000〜6,000）＝**見積 5〜15 秒／org**（jsonb_populate_recordset は表ごと 1 文・トリガ sale 再生成が check_lines 行数に比例）。6 org 直列 30〜90 秒。A-1 は statement_timeout が cron の実行ロール（postgres）＝上限なし。A-2／B は service_role 30s（0150）＝1 org ずつなら足りる見込み・超えたら wipe→load 2 回呼び（既存）。 | 同左。Vercel 関数の実行上限（Hobby 10s／Pro 60s〜）＝**6 org 直列は Hobby で確実に超える**。 |
| 日付基準 | A-1: 関数内で `biz_date_of(now(), cutoff)`（0010 の DB 関数）＝TS の dateshift と同じ規約を plpgsql に写す必要（shiftPayload の鏡像）＝実装量が大きい・二重実装。／A-2: TS 側で既存（dateshift）。 | TS 側で既存。 |
| 推奨 | **A-2（pg_cron → pg_net → 既存 route）**。payload・日付ずらし・remapUuid・afterResetHooks を TS に一本化したまま、起動だけ DB に持たせる。Vercel Pro に移行した日に B へ切り替えられる（route は同じ）。A-1 は 0162 の規模が大きく dateshift の鏡像を SQL に持つ＝裁定276-1「鏡像を新設しない」の趣旨に反する。 | Pro 移行後の第 2 候補。 |

A-2 の形（0162 の内容＝§4）: `select cron.schedule('nox-demo-reset', '5 21 * * *', $$select net.http_get(url := (select decrypted_secret from vault.decrypted_secrets where name='nox_demo_reset_url'), headers := jsonb_build_object('authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='nox_cron_secret')), timeout_milliseconds := 120000)$$)`。URL と CRON_SECRET は Supabase Vault（手貼りは Agoora・mig には秘密を書かない）。route 側は 6 org を**直列ではなく 1 呼び 1 org**にできるよう `?org=<name>` を足し、cron を 6 行（06:05／06:07／…）にして Vercel の関数上限を避ける（仮決め・D1）。

手動リセット: 既存 POST /api/demo/reset（demo org セッション・10 分間隔）を使う。owner 用ボタン＝(manage) ヘッダの上部帯（273-8）に「いま初期化」（owner／manager のみ・確認 Modal・429 の残り分数を表示）。内部 API＝cron route を `?org=` 付きで CRON_SECRET から叩ける（運用者用・画面なし）。

## 4. 必要な migration（0162 想定・起草はまだ）

| # | 内容 | 根拠 |
|---|---|---|
| ★1 | `create extension if not exists pg_cron`／`pg_net`（既に有効なら no-op）・`cron.schedule` 6 行（店ごと 06:05 JST 以降 2 分おき・UTC 表記）・`cron.unschedule` の冪等化（同名があれば先に外す） | 328「毎日 1 回」・§3 A-2 |
| ★2 | Vault に `nox_demo_reset_url`／`nox_cron_secret` を置く手順（**mig には書かない**・SQL Editor で `select vault.create_secret(...)` を Agoora が実行・検証クエリは `select name from vault.secrets`） | 秘密を repo に残さない |
| ★3 | demo_org_reset: 失敗時の記録＝呼び出し側（route）で audit_log_write_service 'demo.reset.failed'（RPC 変更なし） | 再試行の材料 |
| ★4 | demo_org_reset の c_wipe／c_load に **0161 以降の新表**（payroll_attentions は 0158 で追加済み・punch_corrections／daily_pays／payroll_run_deduction_overrides は 0159 で追加済み・cast_quotas／cast_notice_reads は 0160 で追加済み）＝**0161 は表を足していない**ため追補なし。D1 で live の c_load を読んで 81 表と照合（suite dr(0-2) が pin） | 表の漏れは 'bad table' ではなく「消えない」側の事故 |
| ★5 | kiosk_devices の ID 固定＝payload に含める（表は c_load にある）。追補なし | 328「kiosk トークン固定」 |
| ★6 | 入場ログ（magiclink の email 短期保持・30 日削除＝裁定293-7・持越し）＝表 demo_enter_logs（org_id・role・at・ip hash）＋ 30 日 purge（audit_purge と同型・service_role）。**0162 に同乗するか別 mig かは相談役** | 293-7 |
| ★7 | デモ org の制限の DB 側＝**なし**（柵は route 層＝273-6・RPC 無改造） | — |

→ 0162 の最小形＝★1＋★6（★2 は手順書・★3 は client）。pg_cron の job は SQL の中に URL／秘密を書かず vault 参照にするため mig 単体で完結する。

## 5. デモ制限の demo フラグ判定箇所（一覧）

| 層 | 判定 | 所在 |
|---|---|---|
| route（API） | `assertNotDemo(orgId)`／`demoGuardErr` → 403「デモ環境ではこの操作はできません」 | lib/nox/demo/guard.ts。拒否 12 系＝billing（checkout／interval／portal／switch-to-card）・cast/invite・cast/mynumber・kiosk/provision・print/jobs・staff/create・staff/update-email（verify:nox-demo-guard の A 群・全数 pin）。 |
| route（セッション無し） | 差し込みなし | stripe/webhook・cron 3 本・print/poll／result（B 群）。 |
| 課金ゲート | org_billing.status active（create-demo-orgs が入れる）＝billing_writable_of はそのまま通す | DB 無改造（273-6）。 |
| storage | cast-photos insert／update policy の `not exists (orgs.is_demo)` | mig0149 ★10。 |
| client（導線） | `useIsDemo()`（DemoProvider・layout が orgs.is_demo を 1 回読む）で招待・写真・キオスク発行・印刷・ご契約のボタンを隠す | lib/nox/demo/context.tsx・(manage)/layout.tsx・casts-board・staff-board・shift-board・mine/photo-card・mine/layout。 |
| Auth | **未着手**＝Auth 設定 4 点（Agoora・持越し）: ①メール変更の無効（Secure email change／ユーザー自身の updateUser を止める）②サインアップ無効③magiclink の有効期限短縮④パスワード変更の無効（demo ユーザーはパスワードを知らない＝magiclink 入場のみ）。route 層では staff/update-email だけが柵。 | Supabase Dashboard。 |
| 送信 | LINE・メール送信の route は無い。magiclink は generateLink（送信しない） | — |
| robots | / と /demo 以外 disallow・/demo noindex | app/robots.ts・app/demo/page.tsx。 |

## 6. 便の順序（328 の「次」）

D1（0162 起草＋生成器 gen-recording＋seed.ts 6 店化＋/demo 6 店 UI＋cron route の ?org）→ Agoora（0162 手貼り・Vault 2 本・Auth 設定 4 点）→ D2（create-demo-orgs --apply・6 店の録画を repo に収蔵・DEMO_USERS を Vercel env・LP の導線・f0 に demo-recording suite＝録画 6 本の golden 突合）。
