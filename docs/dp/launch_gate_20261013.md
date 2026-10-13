# ローンチ前ゲート表（2026-10-13・便 G-R・読取のみ・HEAD 6c6f66e＝origin/main）

**結論 3 行**
1. ゲート 12 項目のうち CC が閉じられるものは 0（client 済みが 6＝#75〜#79・#81 の目視待ち）。残りは Agoora の目視 4（#75〜81・4 role・起票100・Auth 設定 4 点）・相談役の裁定 3（起票97・起票98 の 3 択・第 2 期一覧の確定）・専門家 3（L3・L6・T10）。
2. 環境は「Vercel Pro（hnd1）・本番ドメイン nox-kappa-eight.vercel.app（カスタムドメインなし）・Supabase は Free と推定（PITR なし・Compute は直接接続上限 60）・Auth はサインアップ無効と確認メール必須まで設定済み・Stripe の env 4 本は本番に入っているか未記録」。値は 1 つも読んでいない。
3. 第 2 期送りは 24 件を 1 表に束ねた（起票 5＋v43 §4 の 12＋v45 追加 2＋[[nox]] の 5）。起票105 は台帳に存在しない（起票表は 104 まで・次番号 105）。

---

## G-6 ゲート表

| # | 項目 | 担当 | 状態 | 閉じる条件 |
|---|---|---|---|---|
| 1 | 確認クローズ #75〜#79・#81 | Agoora | **未**（client 済・目視待ち・9/18 の 0918_close_checklist.md は ☐ のまま） | gate_visual_20261014.md の /payroll（LUNA）・/master/cast-comp/plan（LUNA）・/analytics（ACE）の行で OK を記入→台帳の起票表 6 行を「クローズ（目視 OK 日付）」に書き換え（#80 と同形） |
| 2 | 4 role 全画面目視 | Agoora | **未**（順路表＝docs/dp/gate_visual_20261014.md・67 画面・約 3 時間） | 全行 OK／NG 記入。NG は X-13 台帳へ番号で束ねる |
| 3 | 起票100 の目視クローズ | Agoora | **未**（0165 本番適用済み・live で NOIR preview 7,134 ms） | /demo NOIR owner で給与プレビュー 2026-09 を開く（順路表 owner /payroll 2 店目） |
| 4 | 起票97 未確定 run の自動計算 | 相談役 | **裁定可**（Vercel Pro 移行済み・Hobby の cron 2 本上限は解除） | クローズ／ローンチ前実装／第 2 期の 3 択（本書 G-2） |
| 5 | 起票98 owner 自身のメール変更 | 相談役→Agoora→CC | **Auth 設定 4 点の後**（本書 G-2・G-3） | 3 択。実装なら update-email.ts 42 行の条件に本人 owner を足す（client のみ・mig 不要） |
| 6 | Auth 設定 4 点（Secure email change／サインアップ無効／OTP 期限 5〜10 分／JWT・セッション 24h） | Agoora | **一部済**＝サインアップ無効は設定済み（public settings で disable_signup true）・確認メール必須（mailer_autoconfirm false）。残り 3 点はダッシュボードでしか読めない＝未確認 | Agoora がダッシュボードで 3 点を確認・設定→台帳の 297-5 持越し（AW-5）を閉じる |
| 7 | L6 利用規約 | 専門家待ち | **未**（293-6 で責任分割の方針は確定・本文なし） | 文言到着→/terms（lp_plan.md L-2・器 60 行）→LP 公開 |
| 8 | L3 労働者性の注記文言 | 専門家待ち | **未**（C-3 の注記は仮文言で実装済み） | 文言到着→client 1 箇所差替え（pin 1 本） |
| 9 | T10 日払いの 5,000 円控除・月内複数回の日数・雇用の日額表 | 専門家待ち | **未**（0156 日払いは委託 10.21%・periodDays 式で稼働） | 回答→pay.ts withholdingOf の差替え点（F2 差し替え点に記録済み）→golden 張替え |
| 10 | 第 2 期送り一覧 | 相談役 | **確定案あり**（本書 G-4・24 件） | 相談役が番号を確定→台帳「第 2 期」節に収載 |
| 11 | 録画・LP | CC（Agoora 収録） | **設計案まで**（docs/tmp/lp_plan.md・/lp 200〜260 行・/terms 器・suite） | 相談役が LP 本便を出す→L6 が来るまで noindex で置く |
| 12 | Stripe 本番キー・Vercel env | Agoora | **未記録**（コードは STRIPE_SECRET_KEY／STRIPE_WEBHOOK_SECRET／STRIPE_PRICE_NOX_MONTHLY／STRIPE_PRICE_NOX_YEARLY を参照・Vercel に有るか・live か test かは台帳に記録なし＝VP-2 は 5 本のみ確認） | Agoora がダッシュボードで名前の有無と接頭辞（sk_live／sk_test）だけ確認して台帳へ（値は書かない） |

ゲート外（ローンチ後でよいが記録）: Supabase Pro／Compute（裁定262＝本番 DB 切替の前提・現状 Free 推定）・PITR（Pro のアドオン・runbook §は Pro 前提で書かれている）・監視（runbook に記述 0・起票#4）・カスタムドメイン（なし）・robots の LP 開放（/ は allow 済み・/lp を足す）。

---

## G-1 確認クローズ #75〜#79・#81（本文逐語＝台帳の起票表）

| # | 本文（逐語・台帳の起票表の項目名と処置） | 現状 | 閉じるには |
|---|---|---|---|
| #75 | 「給与「この期間を確定する」が disabled のとき理由が出ない（低・修正済・目視待ち）: blockers あり／対象 0 名で disabled になるが、ボタン脇に理由がなく上の「要対応」区画を見ないと分からない（2026-09-10 Agoora 目視）。処置（同日・client）＝ボタン脇に「要対応 N 件を解消してください」（対象 0 名は「対象キャストがいません」）・title 同文。」 | client 済・目視 未 | Agoora 操作: /payroll（要対応がある月）でボタン脇の文言を見る |
| #76 | 「キャスト割当表で割当行の無いキャストのプルダウン表示（低・修正済・目視待ち）: 未割当キャストの select が「未割当（プラン選択）」で、既存割当の「プラン選択」と見分けにくい（2026-09-10 Agoora 目視）。処置（同日・client）＝割当行の無いキャストは空＝placeholder「未設定」。既存割当は現状・保存導線は不変。」 | client 済・目視 未 | Agoora 操作: /master/cast-comp/plan → 割当（デモは全員割当済み＝未割当行を見るには 1 人の割当を外す必要あり・reset で戻る） |
| #77 | 「cast-comp の割当保存で RPC 生文言 'bad valid_from' が露出（低・修正済・目視待ち）: set_cast_plan（mig0116）は `p_valid_from < current_date`（過去日）または `p_valid_from <= 現在行の valid_from` で 'bad valid_from'。処置（同日・client）＝compErrJa に「適用開始日は今日以降で、現在の適用開始日より後の日付にしてください」。同画面の他の生文言＝'bad overrides' も同時に写像。」 | client 済・目視 未 | Agoora 操作: 割当の適用開始日を過去日にして保存 |
| #78 | 「/payroll で finalized／paid でも「この期間を確定する」が表示される（低・修正済・目視待ち）: 確定済み期でもボタンが描かれ、押すと route が 409 already paid 等を返す。処置（同日・client）＝status==='draft' のときだけ描く。」 | client 済・目視 未 | Agoora 操作: /payroll の確定済み月（デモの 2026-09） |
| #79 | 「納付管理の注記が旧導線「上の支払記録から『支払済みにする』」のまま（低・修正済・目視待ち）: B5 で支払済み化は月次一覧へ移った（裁定 B5-6）ため文言が実態と不一致。処置（同日・client）＝「給与 月次一覧の『支払済みにする』を実行してください」。」 | client 済・目視 未 | Agoora 操作: /payroll → 納付管理 |
| #81 | 「analytics ヒートマップの曜日行 Fragment に key が無い（React 警告）（低・修正済・目視待ち）: `DOW.map` 直下が `<>…</>`（key なし）＝"Each child in a list should have a unique key" 警告。処置（同日・client）＝`<Fragment key={\`r${d}\`}>`。置換 1 件（client b77961f）。」 | client 済・目視 未 | Agoora 操作: /analytics → 時間帯×曜日・DevTools Console に警告なし |

#80 は同表で「クローズ（2026-09-10 Agoora 目視済・9/11 収載）」＝対象外。6 件とも **client で済んでおり、閉じるのは Agoora の目視だけ**（mig・専門家・裁定は不要）。

---

## G-2 起票97・起票98（本文逐語＋事実＋3 択の材料）

### 起票97

本文（逐語・起票表）: 「未確定 run の自動計算＝cron は expire-trials に同居・core の service 分岐は裁定要（ローンチ前ゲート）」。現状＝vercel.json の cron は Hobby 上限 2 本を使用済み・computePayrollDraft は managerClient（JWT 前提 RPC）必須＝cron から preview は 401（0930_pm_pre.md ③）。処置＝expire-trials に同居＋core を admin だけで読める集計へ（service 分岐は裁定）。 **→ 2026-10-09 便 VP: Vercel Pro 移行済み（Functions hnd1・Hobby の cron 2 本上限は解除）＝裁定可・裁定待ちのまま**

事実（本日）:
- Vercel Pro 移行済み・Functions Region hnd1（便 VP）。vercel.json の crons は 2 本のまま（expire-trials 18:00Z・billing-reminders 20:00Z）＝Pro なら 3 本目を足せる。
- デモの reset は Vercel cron ではなく **pg_cron→pg_net**（cron.job 8 本 active＝6 店＋retry＋entries-purge）で稼働中＝「cron の器」は DB 側にもある。
- 自動計算の中身（computePayrollDraft→core）は JWT 前提の RPC（get_cast_sales 等）を呼ぶため、cron から動かすには (a) service 分岐（admin client で同じ集計）か (b) 店ごとの代理 JWT のどちらかが要る＝**core の service 分岐が裁定の本体**。
- 現行の運用＝manager が /payroll を開いた時に計算（プレビュー）＝自動計算が無くても給与は出る。

3 択の材料:
| 選択 | 中身 | 工数 | 向く場合 |
|---|---|---|---|
| クローズ | 「手動プレビューで足りる」と決めて起票を閉じる | 0 | ローンチ時の店数が少なく manager が月初に開ける |
| ローンチ前実装 | expire-trials に同居＋core の service 分岐（admin で読む集計）＋suite | client 150〜200 行・mig 0（RPC を service_role でも通すなら mig 要） | ダッシュボードの「未確定 run」の注意行を自動で最新にしたい |
| 第 2 期 | 上と同じ設計で後回し | 0（今） | LP・録画・目視を先に終えたい（推奨＝本便の読取では他ゲートと独立） |

### 起票98

本文（逐語・起票表）: 「owner 自身のメール変更＝update-email.ts 42 行の除外解除・Auth 設定 4 点後（mig 不要）」。現状＝lib/nox/staff/update-email.ts 42 行 decideEmailTarget が role staff／manager 以外を 403（ロックアウト防止）・Auth 設定 4 点（Secure email change・確認必須・レート制限・Site URL）は未決（0930_pm_pre.md ④）。処置＝Auth 設定の後に本人 owner を許可（新メールの確認を client で 1 段）。

事実（本日）:
- 裁定267（スタッフのメール変更）は **owner 自身を対象外**にした（ロックアウト防止＝柵 A）。42 行の条件は変わっていない。
- Supabase Auth の public settings（/auth/v1/settings・anon で読める範囲）: disable_signup＝true（サインアップ無効＝設定済み）・mailer_autoconfirm＝false（確認メール必須）・外部プロバイダは email のみ・phone／SAML／passkeys 無効。**Secure email change・SMTP・送信レート・OTP 期限・JWT 期限はこの endpoint に出ない**＝ダッシュボード（Agoora）でしか読めない。
- auth.users は 45 件・全員 email_confirmed_at あり（デモ 24＋端末 6＋verify／本番）。
- メール変更の連打で送信枠を消費する懸念（台帳 3794 未決★）は SMTP／送信レートの設定が前提＝未確認。

3 択の材料:
| 選択 | 中身 | 工数 | 向く場合 |
|---|---|---|---|
| クローズ | owner のメール変更は Supabase ダッシュボード（Agoora 代行）で行う運用にし、route は 403 のまま | 0 | ローンチ時の owner が Agoora の顧客 1〜数社＝代行で足りる |
| ローンチ前実装 | Auth 設定 4 点（Agoora）→42 行に「本人 owner かつ新メールの確認を client で 1 段」→suite | client 40〜60 行・mig 0 | オーナーが自分で変えたいと言う前提 |
| 第 2 期 | Auth 設定 4 点だけ先に済ませ、route は後回し | 0（今） | 推奨＝ロックアウトの柵を残したまま LP へ進める |

---

## G-3 環境の現状（値は出さない・名前と有無のみ）

| 項目 | 事実 | 出所 |
|---|---|---|
| Vercel プロジェクト | 1 本・Pro チーム・Functions Region hnd1・main＝production・本番ドメイン nox-kappa-eight.vercel.app | 台帳 3375・便 VP |
| カスタムドメイン | **なし**（Vault nox_demo_reset_url も vercel.app ホスト） | cron_setup.md・台帳 D2-b |
| Vercel env（Production） | 挙動で確認済み 5 本＝CRON_SECRET／SUPABASE_SECRET_KEY／DEMO_USERS／NEXT_PUBLIC_SUPABASE_URL／NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY。**Vercel CLI はこの環境に無い**（名前一覧の機械読取は不可） | 台帳 VP-2 |
| Stripe の env | コードが参照する名前＝STRIPE_SECRET_KEY／STRIPE_WEBHOOK_SECRET／STRIPE_PRICE_NOX_MONTHLY／STRIPE_PRICE_NOX_YEARLY（名前は live／test を区別しない＝値の接頭辞でしか分からない）。本番 env に有るか・どちらのキーかは**台帳に記録なし** | grep process.env |
| Vercel cron | vercel.json 2 本（expire-trials 18:00Z・billing-reminders 20:00Z） | vercel.json |
| Supabase プラン | **Free と推定**（台帳 4565「Supabase Free は Time-box user sessions が使えず」10/8・v45 §5「Supabase Pro の Time-box 24h」を第 2 期）。runbook §は「Pro 確定」と書かれており**文書が食い違う**＝Agoora がダッシュボードで確定 | 台帳・runbook |
| Compute（SQL で読める範囲） | PostgreSQL 17.6（aarch64）・max_connections 60・shared_buffers 224 MB（28672×8 KB）・work_mem 約 17 MB・statement_timeout 120 s・DB 57 MB | pg_settings |
| バックアップ／PITR | archive_mode on・pg_stat_archiver 2,546 本（失敗 3・最終 10/13 08:39Z）＝WAL アーカイブは動いているが **PITR アドオンの有無は SQL で読めない**（Free なら日次バックアップもダッシュボードの範囲） | pg_stat_archiver |
| 拡張 | pg_cron 1.6.4・pg_net 0.20.3・pgcrypto・supabase_vault 0.3.1・pg_stat_statements | pg_extension |
| pg_cron | 8 本 active（6 店 reset 21:05〜21:15Z＝06:05〜06:15 JST・retry 21:35Z・entries-purge 20:15Z） | cron.job |
| Vault | 3 名＝nox_cron_secret／nox_demo_reset_url／nox_mynumber_key | vault.secrets（name のみ） |
| Auth 設定 4 点 | ①Secure email change＝**読めない**（ダッシュボード）②サインアップ無効＝**設定済み**（disable_signup true）③OTP 期限＝読めない ④JWT／セッション 24h＝読めない（デモは app 側 cookie で 24h＝328 追補4）。付随: Confirm email＝必須（mailer_autoconfirm false）・SMTP／送信レート＝読めない | /auth/v1/settings |
| robots／noindex | app/robots.ts＝`/$` と /demo だけ allow・他 disallow。/demo・/r/[token] は metadata noindex・入場 route は x-robots-tag noindex。/ はログイン後の振り分けのみ（LP 実体なし） | app/robots.ts |
| orgs | 9（demo 6・verify／本番 3） | public.orgs |

---

## G-4 第 2 期送り一覧（確定案・重複は束ねた）

| # | 要旨 | 出所 | 送る理由 |
|---|---|---|---|
| 1 | 起票99 /mine 勤怠一覧の実働を店の計算基準（pay_time_basis）に合わせる | 起票99 | 表示のみ・給与は正しい |
| 2 | 起票102 フロアの卓で束ねる（seats.parent_seat_id） | 起票102 | mig＋UI 6 面・現行の相席で足りる |
| 3 | 起票103 kiosk の打刻出し分け（punch_methods.kiosk） | 起票103 | kiosk_punch_state に器なし＝mig・全店既定 ON |
| 4 | 起票104 内税表示の金額変換（tax_inclusive_display） | 起票104 | 計算に触れる・全店既定 OFF |
| 5 | 起票105 | — | **台帳に存在しない**（起票表は 104 まで・次番号 105）＝相談役が意図した項目を確認 |
| 6 | Supabase Pro の Time-box user sessions 24h | v45 §5 | Free では使えない・デモは app cookie で代替済み（328 追補4） |
| 7 | デモ写真の露出（キャバ 3 店）＝LP・SNS のサムネイルに使う場合のみ差替え | v43 §7・v45 §5 | デモ画面内は可・LP 制作時に判断 |
| 8 | 店負担売掛の日報合計 | v43 §4 | |
| 9 | 早上がりの本人／店都合 | v43 §4 | |
| 10 | 紹介料の給与連動 | v43 §4 | R11 は起票のみ・298 で給与側は撤去 |
| 11 | LINE 通知（スタッフ LINE を含む） | v43 §4＋[[nox]] | 外部連携 |
| 12 | 一括発行の通知 | v43 §4 | |
| 13 | 確定後打刻修正の差額自動計算（315） | v43 §4 | |
| 14 | cast 新規顧客登録 | v43 §4 | |
| 15 | 達成ボーナス多段／売上スライド／新人保証の自動終了（331 で非表示） | v43 §4 | PREP_ITEMS achievement_params 等 |
| 16 | 承認者／お知らせ差出人のスタッフ写真（329-2 ⑤ 器なし） | v43 §4 | |
| 17 | open_punch の自動解決 | v43 §4 | |
| 18 | 勤務の無い期間の注意行一覧 | v43 §4 | |
| 19 | R20-c | [[nox]] | 台帳の裁定253 実機課題 R1〜R15 の後続＝本文は相談役が持つ |
| 20 | 既存の負 net（確定済み run の net がマイナスの扱い） | [[nox]] | 計算の方針が先 |
| 21 | shift-add-form の prompt（モーダル内の入力案内） | [[nox]]・裁定112 | UI のみ |
| 22 | シャンパン tier の上位段 | [[nox]] | 料金表の拡張 |
| 23 | R15 シフト画面の残り（裁定274 で 3 タブ化済み・残分） | [[nox]]・裁定270-4 | 設計裁定が先 |
| 24 | 準備中 3 点（pt 付与ルール・粗利基準・帯の歩合 % 列）＝mig 3 本・client 約 280 行 | lp_plan.md L-4 | 器なし・ローンチ範囲外 |

束ねた重複: 「スタッフ LINE」は 11 に合流。「売上スライド（331 非表示）」は 15 に合流（343 の判定基準は実装済みのため対象外）。起票100／101 は解決済み（0165・裁定342）のため載せない。
