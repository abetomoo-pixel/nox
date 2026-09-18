# 0918_demo_pre — 公開デモ環境（NOX-DEMO org・4 業態・1 日 1 回＋手動で「今日基準に再生成」）の読取調査（コード変更 0・結論なし・2026-09-18 13:3x JST・HEAD 91e53f7）

live 読取＝docs/tmp/0918_demo_a.txt（a）・docs/tmp/0918_demo_b_live.md（b／c／h／i の逐語＝トリガ 41・FK 246・grants・policy・RPC 41 本の引数と now()／auth.uid() 出現・ゲート済み 128 本・text 列 54 表・storage）・docs/tmp/q0918_demo_d.mjs（d の実測・ROLLBACK）。裁定は相談役（裁定273 案の材料）。

## a. NOX-DEMO org の現状と、店 4 追加・新 RPC 追加で赤になる pin

- org `389f7668…`（2026-07-28 作成）・orgs は全 3（NOX-DEMO／NOX-VERIFY-A／NOX-VERIFY-B）。店 **1**＝CLUB NOX（receivable_policy customer_only・biz_type null・setup_done true）。users 5＝owner **abetomoo@gmail.com（Agoora 個人・パスワード非保持）**／cast abetomoo0118@gmail.com／demo-manager／demo-staff1（can_register・can_crm・can_shift）／demo-staff2（can_register のみ）。org_billing＝status **active**（trial_ends_at 2026-09-16 は status≠trialing のため無効＝ゲートは通る）。
- 行数（org_id 表 69 のうち非 0）: audit_logs 1128・check_lines 405・stock_logs 352・shifts 243・check_nominations 90・checks 78・payments 62・check_cast_backs 51・products 43／product_costs 42・attendance 12・payslips 11／payroll_runs 2・pricing_rules 10・product_categories 10・drink_claims 10・seats 9・casts 7／cast_plan 7／cast_tax_profiles 7・staffing_needs 7・store_business_hours 7・receipt_issues 6・shift_wishes 5・users 5・comp_plans 3・kiosk_sessions 3・…（全表は 0918_demo_a.txt）。org_id を持たない表＝memberships・orgs のみ。orgs の列＝id／name／plan／status（**is_demo 列なし**）。
- pin（逐語 grep `scripts/*.ts`）: NOX-DEMO／CLUB NOX を**数値で固定している suite は 0**。言及は fixtures-demo／seed-demo（定義）・audit-sweep（VERIFY_ORG_IDS のみ掃除＝DEMO 不触）・inventory 303（コメント「CLUB NOX の 40 商品／1170 はデモ実測値で fixture ではない」）・receipt（"CLUB NOX 歌舞伎町" は純関数 fixture の文字列）・shift-bands 19（「CLUB NOX 等の終日バンドは不触」＝STORE_A2 で閉じる）。orgs 全数 3／stores 全数を固定する assert も 0（proof `count(*) from orgs`＝3 は mig ヘッダの手貼り検証と docs/tmp の post script のみ）。⇒ **店 4 追加で赤になる既存 pin は見当たらない**。新 RPC 追加（例: demo_reseed）は billing 段47-1（名簿 A∪B＝live 全数）・anon-guard probe・grants G2b が必ず拾う＝名簿と probe の同時更新（教訓21・84）。

## b. org 配下の表の delete 可否（FK 順・RLS・トリガ・凍結）

- **書込 policy はどの表にも無い**（b-4＝全表 SELECT policy のみ）。grants＝authenticated は SELECT のみ・**service_role は全表 ALL**（DELETE／TRUNCATE 含む＝0003 型の revoke は authenticated/anon のみ）。RLS は service_role をバイパス＝**service_role からの delete を阻む表は 0**。
- トリガ 41 本＝`touch_updated_at`（BEFORE UPDATE・38 表）＋check_lines の 4 本（`drink_claims_on_line_delete` BEFORE DELETE／`drink_claims_guard_line_update` BEFORE UPDATE／`check_lines_stock_ins`・`_del` AFTER INSERT／DELETE＝stock_logs へ在庫の増減を書く）＋`checks_stock_void`（void 時の在庫戻し）。**追記専用・削除拒否のトリガは無い**（audit_logs／punches／payslips も含め delete 可）。ただし check_lines の delete は stock_logs に「戻し」行を**増やす**＝先に stock_logs を消してから check_lines を消す順にしないと残骸が出る（逆に product ごと消すなら stock_logs→check_lines→checks の順）。
- FK 246 のうち ON DELETE CASCADE は 8（check_seats→checks・customer_notes→customers/orgs/stores・customers→orgs/stores・payroll_adjustments→payroll_runs・product_costs→products）・SET NULL 9（carry_from_payslip_id 等）＝**大半は RESTRICT**＝削除は子→親の順を手で並べる。概略の順（子→親）: stock_logs／check_cast_backs／check_nominations／payments／receipt_issues／drink_claims／print_jobs／check_seats → check_lines → checks；ar_collections → receivables；payslips／payroll_adjustments／payment_records／withholding_payments → payroll_runs；attendance／attendance_incentives／punches／shift_wishes／shifts／cast_unavailable_days／staffing_needs → shift_periods；cast_plan／cast_norms／cast_tax_profiles／cast_sensitive／cast_pin／cast_ranks → casts → users（cast の user 行）；advances／transport／deductions／custom_back_defs／comp_plan_components → comp_plans；product_costs／stock_logs → products → product_categories；pricing_rules／pricing_categories；reservations／customer_notes → customers；daily_reports／store_business_hours／store_sales_targets／staff_shift_*／kiosk_*／printer_config／notices／approvals／feature_flags／trials → stores → memberships／users → org_billing → orgs。正確な 246 本は 0918_demo_b_live.md b-2。
- 凍結表（payslips.breakdown_json／daily_reports の凍結列／checks の税・丸め凍結列／receipt_issues）は「消せる」が「作り直しは RPC の計算を通す必要がある」（c）。

## c. 種の経路＝凍結値を RPC が計算するもの／呼び手が渡すもの・actor・時刻

- **伝票**: check_open は `now()` を 8 箇所（started_at＝default now()・pricing_resolve_core(now()) で set／延長／同伴／VIP の凍結・biz_minutes_of(now())・assert_day_open(biz_date_of(now()))）＝**開卓時刻を過去に振れない**（引数に時刻なし）。check_add_line／check_add_referral は凍結値（name／price／back／tax_category）を RPC が計算・時刻なし。check_pay は時刻なし（paid_at default）。check_close は closed_at＝now()・売掛／在庫の凍結を RPC が計算。⇒ **RPC 経路では「今日」の伝票しか作れない**。過去日の伝票は直 INSERT（service_role・started_at／closed_at を任意）＋ checks.total と check_lines の凍結列を**呼び手が計算**（TS 鏡像＝groupDueFull／receipt.ts＝三面鏡・check_recalc／check_group_due は 4 ロール revoke＝service_role からも呼べない）。
- **打刻**: punch_self／punch_proxy は punches.punched_at＝default now()（引数なし）・kiosk_punch も now()（PIN ロックの判定にも now()）＝過去日は直 INSERT のみ。attendance_set は p_date を取る＝過去日可。
- **シフト**: shift_set／shift_bulk_set は p_date 引数＝過去日可（auth.uid() 依存＝owner／manager の JWT が要る）。shift_period_set も日付引数。shift_cast_confirm は cast 本人の JWT。
- **給与**: payroll_run_create（JWT・period 文字列）→ payroll_finalize（**service 経路＝p_org_id／p_actor＝users.id・p_payslips は呼び手が計算した breakdown を渡す**＝凍結値は client（computePayrollDraft）が計算・RPC は ar／adv／okuri の適用だけ）→ payroll_mark_paid（service 経路）。⇒ 給与はサーバから finalize を直接呼べるが、payslip の中身は TS（lib/nox/payroll/core.ts）で組む必要がある。
- **actor の立て方**: (1) JWT emulate（suite の payroll-adjust／本日の 5 suite と同型＝pg 直結で `set_config('request.jwt.claims', '{"sub":<auth_user_id>,"role":"authenticated"}', true)`＋`set local role authenticated`＝auth.uid() 依存の RPC が全て通る・トランザクション内限定）／(2) supabase-js の signInWithPassword（docs/tmp/q0917_cookie.mjs＝fixture の SEED_PASSWORD）／(3) service 経路の RPC（payroll_finalize／mark_paid／audit_log_write_service＝p_actor に users.id）。**DB 内から呼ぶ**なら (1) を plpgsql で行う（SECURITY DEFINER 関数内で set_config→perform check_open…）＝新 RPC（mig）。
- 営業日: biz_date_of(store, at)（cutoff 既定 06:00）・daily_report_close は p_biz_date を取る＝過去日の締めは RPC で可（伝票が無いと 0 で締まる）。

## d. 所要（実測・A1・owner-a の JWT emulate・pg 直結・ROLLBACK・snapshot 一致）

| 区間 | 3 回の実測 ms |
|---|---|
| check_open | 66／49／64 |
| check_add_line×5（custom） | 318／288／325（≈60 ms／行） |
| check_pay（cash 全額） | 110／127／143 |
| check_close | 47／57／64 |
| **合計（1 枚・明細 5 行）** | **541／521／596 ≈ 0.55 s** |

概算（RPC 逐次・直列）: 4 店×14 日×20 枚＝1,120 枚 ≈ **616 s（≈10 分）**／1 店×14 日×20 枚＝280 枚 ≈ **154 s**。打刻・シフト・給与を足すとさらに増える。Vercel の関数実行上限＝現プラン Hobby は 10 s 既定（maxDuration で最大 60 s）・Pro は 300 s（Fluid 最大 800 s）＝**RPC 逐次を Vercel の 1 関数で回す案は 1 店でも超過**。並列化しても DB（t4g.nano）側が詰まる。cron（vercel.json の 2 本と同型）から DB 内の一括関数を叩くか、外部ジョブが必要。

## e. 1 店リセットを 30 秒に収める経路

| 経路 | 30 秒 | 三面鏡・golden・pin への影響 | mig |
|---|---|---|---|
| E1 RPC 逐次（Vercel から） | ✗（154 s／店） | 影響なし（正規経路） | 不要 |
| E2 DB 内関数で一括（plpgsql が set_config で actor を立て、check_open→add_line→pay→close をループ） | △（ネットワーク往復 0＝1 枚 100〜200 ms 見込み → 280 枚 30〜60 s・要実測） | 正規 RPC を通るため三面鏡不変・新 RPC は名簿 B(a)（service 限定）＋anon-guard probe＋grants G2b | **要**（新 RPC 1 本＋delete 一括の関数） |
| E3 直 INSERT（過去日を振れる）＋凍結値は TS で計算（groupDueFull／receipt.ts の鏡像・payslip は core.ts）＋ delete は service_role の直 DELETE | ○（COPY／multi-row INSERT で数秒） | **三面鏡の 4 面目を作る**＝DB の check_group_due と TS の値が一致する保証は pricing 段43(21)／receipt suite の範囲内のみ。set／延長／同伴の凍結（pricing_resolve_core）を TS で再現する必要（未実装）。golden 不変・既存 pin に触れない | 不要（TS のみ） |
| E4 折衷＝直 INSERT で骨（checks／check_lines を過去日で）＋凍結値だけ RPC | ✗＝check_recalc／check_group_due は 4 ロール revoke で service_role から呼べない | — | **要**（recalc の公開 or demo 専用ラッパ） |

## f. template-plan の再適用（setup_done 済みの店）

- buildSetupPlan の guard 4 条件（271-12 冪等）＝seats_empty／products_empty／plans_empty／rules_empty（setup-wizard 102〜109 が既存件数で skip）。setup_done 済み＋データありの店に再適用すると **席・商品・待遇・料金は skip**・書かれるのは settings_json（biz_type／billing_mode／sys_*）・営業時間 7＋cutoff・feature_flags・receivable_policy・setup_done のみ。⇒ リセットで「テンプレから作り直す」なら先に seats／products／comp_plans／pricing_rules を消す（b の順）か、guard を無視する呼び方（PlanStep の guard を外す新しい入口）が要る。
- 0148 後の food／other＝template v1.json の食品 7 件が投入対象に入る（verify:nox-setup su(2-3) 除外 0＝cabaret 67 件全投入・girlsbar 34・snack 28・lounge 40）。/setup は owner の JWT（set_store_profile は owner 限定）＝サーバから回すなら (c) の actor 手段が要る。

## g. セッション発行（資格情報をクライアントに出さない）

- 既存の写経元: (1) app/login/page.tsx＝client の `signInWithPassword`（パスワードは利用者が入力）／(2) app/api/kiosk/provision・app/api/cast/invite・app/api/staff/create＝`admin.auth.admin.createUser`／`updateUserById({password})` で初期 PW を生成し**レスポンスで一度だけ返す**（DB に平文なし）／(3) suite＝docs/tmp/q0917_cookie.mjs（SEED_PASSWORD で signInWithPassword → session を `sb-<ref>-auth-token=base64-…` cookie に）。
- デモ用の候補: (a) サーバ route が env の demo 用 PW で `signInWithPassword` し、@supabase/ssr の server client（lib/supabase/server＝cookie set 済みの器）で cookie を焼く＝PW はサーバ env のみ（写経元＝login page＋middleware の updateSession）／(b) `admin.auth.admin.generateLink({ type: "magiclink" })`＋`verifyOtp` をサーバで完結（PW を持たない・ただし generateLink はメール送信なしでもトークンが返る）。どちらも既存 route に無い＝新 route（app/api・admin route＝名簿外・h の許可リストへ）。

## h. 許可リストの掛け所（書込口の全数）

- **RPC 名簿 A＝live 128 本**（0918_demo_b_live.md h-1 に全列挙）＋ B の書込（payroll 系 6・打刻 5・kiosk 3 ほか）。**admin route＝app/api の route.ts 34 本**: advance/cancel・issue／billing/checkout・interval・portal・switch-to-card（＋return）／cast/invite・mynumber／cron/billing-reminders・expire-trials／incentive/cancel・publish／kiosk/provision／mine/norm-progress・norm-set／payment/record／payroll/adjustment/add・delete・finalize・mark-paid・preview・reopen・tax-overview・tax-report-csv／print/jobs・poll・result／staff/create・update-email／store/okuri-mode／stripe/webhook／transport/cancel・issue。
- 仮分類（迷うものに ★）: **拒否**＝billing/*（Stripe）・stripe/webhook（外部）・cast/invite・staff/create・staff/update-email（アカウント作成＝資格情報が出る）・cast/mynumber（PII）・kiosk/provision（端末発行）・cron/*（内部）・print/*（実機）／**許可**＝レジ（check_* ・drink_claim_*・receipt_issue）・シフト・日報締め・給与 preview／finalize／reopen／mark-paid（デモ内で完結）・mine/norm-set／★迷う＝set_store_*・flag_set・set_product／product_bulk_insert（マスタを壊されると翌朝まで残る→再生成前提なら許可）・customer_register（自由入力＝i）・notice_create（他の閲覧者に見える）・advance／transport の issue（金額の器）。
- 共通の差し込み点: 128 本全てが**同じ 1 行**（`if not public.billing_writable_of(v_org) then raise exception 'billing locked'`／`…(public.auth_org_id())…`＝v_org 版 62・auth_org_id 版 66）を持つ＝`billing_writable_of(p_org_id)` の**述語 1 本**が唯一の共通口（org_billing を読む 1 行＝status in (trialing,active,past_due) かつ trialing は期限内）。ここに「demo org は X を拒否」を足すと**全 128 本が一律**（op 別の許可は述語からは見えない＝関数名を渡す口が無い）。op 別に絞るなら (1) 各 RPC のゲート行を `billing_writable_of(v_org, 'check_open')` のように**署名変更**（128 本の mig＋名簿の形 pin「引数は 2 種のみ」が赤）か (2) 拒否したい少数の RPC（staff／cast 作成系・set_store_*）だけに `if is_demo(v_org) then raise` を足す補正 mig か (3) app 側（route／画面）で demo ユーザーの導線を消す＝DB は触らない。**現状 DEMO org は status active でゲートを素通り**（is_demo の器なし＝orgs.plan／status か org_billing の新値で表す案）。

## i. 他の閲覧者に見える自由入力（text 列）とストレージ

- text 列を持つ org 表 54（全列挙は 0918_demo_b_live.md i-1）。見える／残るものの代表: notices（title／body／audience＝全員に見える）・customers（name／furigana／tel／prefs／memo／grade）・customer_notes・casts（name）・cast_sensitive（**real_name**＝機密・cast_sensitive は authenticated に SELECT すら無い）・check_lines.name_snapshot（custom 明細名・紹介料 memo）・receipt_issues（recipient／proviso）・shifts.override_reason・payroll_adjustments.reason・audit_logs.reason・stores（name／short／invoice_reg_no）。長さ CHECK があるのは一部（reason 1..200・name 80 等＝i-2）。
- storage: bucket **cast-photos**（private・2 MB・image/jpeg のみ）＝lib/nox/cast-photo.ts が 512px に縮小して upsert（`<org>/<cast>.jpg`）。policy は 0918_demo_b_live.md i-4。デモでは写真投稿を許すと他の閲覧者に画像が見える（公開デモの規約・モデレーションの論点）。

## k. レート制限と noindex の既存の器

- middleware.ts＝`updateSession` のみ（レート制限なし）。vercel.json＝crons 2 本のみ（WAF／レート設定なし）。lib／app に rateLimit の実装 0。Supabase 側＝Auth のレート制限（sign-in／OTP）は既定で効く・PostgREST（RPC）には無い。掛け所の候補＝middleware（IP×パス・Vercel KV／Upstash が要る）／Vercel Firewall（ダッシュボード設定・Pro）／RPC 側（demo org の書込回数を audit_logs で数える＝DB）。
- noindex＝app/layout.tsx の metadata に robots 指定なし・app/robots.ts なし＝**現状は全ページ index 可**（ログイン画面のみ実質到達）。デモ公開時は robots.ts＋metadata.robots（noindex, nofollow）を LP 以外に。

## 相談役に裁定してほしい問い（結論は書かない）

- Q1 種の経路: E2（DB 内一括＝mig 1 本・正規 RPC を通す）か E3（直 INSERT＋TS 凍結＝mig 0・三面鏡の 4 面目）か。過去 14 日分の伝票が「今日基準」に要るなら E1 は不可（check_open は now() 固定）。
- Q2 デモ org の識別子: orgs.plan／status の新値か org_billing.status の新値か（is_demo 列は無い・mig 要否）。
- Q3 書込の許可: 述語 1 本で一律に切るか、拒否したい少数（アカウント作成・店設定・Stripe）だけ補正 mig／app 側で消すか。
- Q4 デモの owner: 現状は Agoora 個人アカウント＝公開デモでは差し替え（demo-owner を作り memberships を付け替える＝seed-demo の改修）。
- Q5 4 業態の店を同 org に置くか org を 4 つに分けるか（同 org なら owner は全店に触れる・org 別なら g のセッションを 4 本）。
- Q6 公開デモの規約・自由入力（i）・写真（storage）の扱いと、再生成の頻度（1 日 1 回＝cron 20:00 系に同乗か）。
