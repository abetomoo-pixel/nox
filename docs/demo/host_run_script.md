# 段 3：本番で営業を通しでなぞる（ホスト）＝確定の版（相談役 11/25 の便 I【I4】）

2026-11-26 未明。下書き（docs/tmp/host_run_1125/host_run_script.md・11/25 夜）を、相談役の決め（便 I【I4】）と今日入った物（0207〜0215・0210 の初回料金・起票166 の延長のボタン）で確定した。
画面の道は app/ の page.tsx、呼ぶ物は app/ と lib/ の `rpc("…")`／`fetch("/api/…")` を grep して実在を確かめた物。

---

## 0. 決まっていること（相談役 11/25 の便 I）
- **通す会社＝新しい会社「NOX-RUN-HOST」**（業態ホスト・is_demo は false）。Agoora が /ops で作り、オーナーの受諾（招待のメール → パスワード）まで行う。**CC は作らない**。
- **役ごとの画面は CC が操作してよい（この会社に限る）**：f0 と同じ形＝サーバの側で admin の magiclink からセッションを作り、そのセッション（cookie）だけをブラウザに渡す（docs/tmp/walk_1125_common.mts の sessionOf／cookiesOf）。**パスワードは画面に打たない・記録（ログ・写し・報告）に残さない**。
- **通しの行（伝票・入金・給与の確定・支払済み）は消さずに残す**。会社ごと、通しの記録として置く。
- 赤になると分かっている検査は、通し用の会社を**名前で外す**形に直した（下の 1）。会社ができるまでは台本と検査の直しまで。会社ができたら次の便で通す。

## 1. 検査の直し（便 I で済み・名前で外す）
本番の全店を見る検査（f0 は本番の DB に直結＝ref は 1 つ）で、通しの会社の普通の設定や行で赤になる物。名前の名簿は `scripts/fixtures-f0.ts` の `RUN_ORG_NAMES`（["NOX-RUN-HOST"]）。

| 検査 | 何を見ていたか | 赤になる理由 | 直し |
|---|---|---|---|
| verify:nox-sales-basis sb(3-2) | 鍵 sales_basis／sales_back_default_off のある店は CLUB VESPER だけ | /setup で業態ホストを選ぶと 2 つの鍵が入る（lib/nox/setup/v5.ts） | 通しの会社の店を外す（sb(3-1) も同じ店の名簿） |
| verify:nox-0197 0197(5-23) と (4-1) の pm | 打刻の形 punch_mode='store' の店は本番に 0 | 店の設定で「店の打刻」を選べる | 通しの会社の店を外す |
| verify:nox-pricing-categories pc(g1) | pricing_rules.category_id は全行 null（0127 の器） | 料金区分（初回料金の区分を含む）を使う | デモの会社（is_demo）と通しの会社を外す（デモは【I3】で CLUB VESPER に初回料金の区分が入る） |

**外さずに残した物（赤になったら本当の知らせ）**

| 検査 | 理由 |
|---|---|
| verify:nox-multi-store (3)「2 店以上の会社は店の支払日がそろっている」 | 2 店目を作るときに支払日がずれるなら直すべき作り（起票142）。通しで 2 店目を作るなら、作った後に支払日がそろっているかを確かめる |
| verify:nox-multi-store (3)「名簿に入れ忘れが無い」 | 画面が書く鍵は全部名簿にある。外から鍵が入ったら知らせ |
| verify:nox-p173 p173(8-2)「非デモの達成ボーナスの段は全部 amount あり」 | 今の画面が書く形の確かめ＝本物の店にも効かせる |
| verify:nox-0200 0200(3-1)「古い鍵 cast_register_enabled の店は 0」 | 新しい店はこの鍵を書かない |

**表ぜんぶの件数を前と後で比べる検査（audit-sweep・daily-pay・punch-sequence・issue-bulk・cast-quota・contract-ack・reservation-flow・open-periods・payroll-adjust・carryover・ops・special-shift・rls の段 SCP-9・0158 ほか 15 本）**は、通しの会社が f0 の走行中に書くと赤になる。**f0 の走行中（印 F0_RUNNING）は通さない**（台本の柵）。

## 2. 柵
- 本番に書くのは NOX-RUN-HOST の中だけ。NOX-VERIFY-*・NOX-DEMO-* には書かない。
- f0 の走行中（docs/tmp/F0_RUNNING）・JST 06:05〜06:40（デモの入れ直し）は通さない。営業の 1 日は 06:00 の営業日の切り替えをまたがない（例：18:30 から 05:30 までに収める）。
- アカウントを作る段（キャスト・スタッフ・端末）は、通しの会社の中で、台本に書いた数だけ。
- お金：会計の確定（check_close）は画面が p_idem_key を送る（原則 9）。「支払済み」（payroll_mark_paid）は戻せない＝通しの記録として押す。
- 写しは全部「本番の画面（NOX-RUN-HOST）」と書く。パスワード・magiclink の URL・cookie は写しにも記録にも出さない。

## 3. 準備（会社ができた後・オーナーの受諾の後）

| # | 何を | 役 | 画面の道 | 中で呼ぶ物 | 見ること |
|---|---|---|---|---|---|
| P0 | 会社を作る（業態ホスト・テスター）・オーナーを招待 → 受諾 | Agoora（運営者） | /ops/orgs/new → 招待のメール → /auth/set-password | /api/ops/orgs（ops_org_create） | **CC はしない** |
| P1 | 初期設定（業態ホスト＝VESPER の雛形） | オーナー | /setup | lib/nox/setup/v5.ts の host_standard | 9 STEP・セット 7,000／60 分・延長 3,000／30 分・本指名 3,000・場内 2,000・サ 30%・1,000 円切り上げ |
| P2 | 初回料金：区分「初回」に印・セットの行に「税・サ込み」「時間で終わり」（1 名 2,000 円・60 分） | オーナー | /master/pricing?tab=rules（初回料金のカード） | set_pricing_category・set_pricing_rule・set_pricing_category_first・set_pricing_rule_first | 当たらない並び（区分なしの行を上へ）は止まる・プレビューは込みの額のまま |
| P3 | ランクの出勤の時刻（上のランク 20:00・新人 18:00） | オーナー | /master/pricing（ランクの出勤の時刻のカード） | set_cast_rank_shift_time | — |
| P4 | 時間帯の時給のプラン（例「新人（時間帯）」18:00〜21:00 1,500 円・21:00〜26:00 2,000 円）を作り、新人 1 人に割り当てる | オーナー | /master/cast-comp/plan（基本・保証の「時間帯の時給」） | plan_rate_band_set | 重なりは止まる |
| P5 | 打刻の丸め（例：出勤 15 分切り上げ・退勤 15 分切り捨て・今月から） | オーナー | /master/store-profile（打刻の丸め） | set_punch_round | 勤怠の表に丸めた後の時刻 |
| P6 | 休憩の打刻を使う | オーナー | /master/store-profile（休憩の打刻） | set_break_punch | — |
| P7 | キャスト 4 人（新人 2・標準 2）・ログイン（合成メール＝送らない） | オーナー | /casts | /api/cast/invite | — |
| P8 | 店長 1・スタッフ 1：店長はメールの招待（0211）、スタッフはメール無しの初期パスワード（0215） | オーナー | /staff | /api/staff/invite・/api/staff/create・staff_invite_revoke（取り消しの筋も 1 回） | 招待の再送（/api/staff/invite/reissue） |
| P9 | 端末を 1 台発行・端末でログイン・PIN | オーナー | /master/system（端末・PIN） | /api/kiosk/provision・set_cast_pin・set_staff_pin | 初期パスワードは画面に 1 度だけ＝**写しに入れない** |
| P10 | 待遇プランの割り当て（新人 2＝新人と新人（時間帯）・標準 2） | オーナー | /casts | — | — |
| P11 | シフト（通す日）：追加配置の初期の時刻がランクの時刻 | 店長 | /shift | shift_set・shift_confirm_bulk | 新人は 18:00・標準は 20:00 |
| P12 | 客 2（初回の客・来店のある客） | スタッフ | /customers | — | — |

## 4. 営業の 1 日（5 役＝オーナー O・店長 M・スタッフ S・キャスト C・端末 K）

| 時刻 | 役 | 押す物 | 画面の道 | 中で呼ぶ物 | 見ること |
|---|---|---|---|---|---|
| 18:00 | C（新人） | 本人の出勤 | /mine | punch_self | 丸めた後の時刻（勤怠の表で翌日に） |
| 18:30 | K | スタッフの出勤・キャストの出勤（名前 → PIN） | /kiosk | staff_punch・kiosk_punch | — |
| 20:00 | M | 今日のシフトの確かめ・追加配置 | /shift | shift_set | ランクの時刻が初期値 |
| 20:00 | S | 卓 1 を開く：区分「初回」・2 名・フリー | /register | register_open_categories → check_open | 行「初回料金(60分) 税・サ込」・請求 4,000 ちょうど・札「初回 あと 60 分で終了」・**延長のボタンが出ない**（起票166） |
| 20:05 | S | 卓 1 に場内指名・キャストドリンク | /register | check_set_nominations・check_add_line | 込みの額の外だけにサ料・丸め |
| 20:10 | S | 卓 2 を開く：区分なし・本指名（来店のある客）・同伴 | /register | check_open（p_nom_type 'hon'） | 今と同じ請求 |
| 20:30 | K | 端末のレジで卓 3 を開く（初回の区分が選べる） | /kiosk → レジのタイル → PIN → /register | register_open_categories・check_open | 端末でも同じ画面（延長のボタンの出し分けも同じ） |
| 20:50 | S | 卓 1 が 10 分前に黄 | /register | — | 札の色 |
| 21:00 | C | 休憩 → 21:30 休憩終了 | /mine | break_self | 休憩中は退勤できない |
| 21:00 | K | 別のキャストの休憩 | /kiosk | kiosk_break_state・kiosk_break | — |
| 21:00 | S | 卓 1 が時間で赤・「時間の卓 1」・**スタッフには延長のボタンも切り替えも出ない** | /register | — | 起票166 の直し |
| 21:05 | M | 卓 1 を「延長に切り替える」→ 延長 1 回 | /register | check_set_time_end → check_extension_add | 延長は通常の延長料金・切り替えた後は今までどおり |
| 21:30 | S | 卓 2 の延長 | /register | check_extension_add | — |
| 22:00 | S | 卓 1 の会計（現金）→ 確定 → 領収書 | /register | check_pay → check_close（p_idem_key）→ receipt_issue | R1 の書き方（「税・サ込みの料金」・内消費税） |
| 22:30 | S | 卓 2 の会計（カード・手数料）→ 確定 → 領収書 | /register | check_pay → check_close → receipt_issue | — |
| 23:00 | S | 卓 3 の会計（端末で開いた卓） | /register | check_pay → check_close | — |
| 23:10 | O | 窓口：要望を 1 件（「スタッフの勤怠の CSV の列」等） | /master/inquiry | /api/inquiry（inquiry_create） | 運営への知らせ（inquiry_mail_note） |
| 23:15 | O | 窓口：2 店舗目の依頼 | /master/inquiry?kind=store_add | /api/inquiry（p_store_add） | 依頼の状態（運営が受けるまで） |
| 23:20 | Agoora（運営） | 依頼に返事・サポート許可を頼む | /ops/inquiries/[id]・/ops/orgs/[id] | inquiry_reply・/api/ops/orgs/[id]/support-ask（ops_support_request） | **運営の側は Agoora** |
| 23:25 | O | ベル（要承認）に「サポート許可の依頼」→ サポート許可（1 日） | HOME のベル → /master/system?tab=support | /api/home/pending・SupportGrantPanel | ベルの数・許可の期限 |
| 23:30 | O | 窓口の返事を読む（既読） | /master/inquiry | inquiry_mark_read | — |
| 25:00 | C・K | 退勤 | /mine・/kiosk | punch_self・kiosk_punch・staff_punch | 丸めた後の時刻 |
| 25:10 | M | 日報を締める | /report | daily_report_close | 現金・カード・初回料金の注記 |
| 25:20 | O | 売上・分析・監査 | /dashboard・/analytics・/audit | — | 込みの額が売上に入る（既定） |
| 翌日 | M | 勤怠の表（休憩の分・丸め） | /payroll | — | — |

## 5. 月末（期間が終わった翌営業日から＝11 月分は 12/1 以降）

| 役 | 押す物 | 画面の道 | 中で呼ぶ物 | 見ること |
|---|---|---|---|---|
| O | 下書き（帯の時給・休憩・丸め・歩合の段・新人の最低保証） | /payroll | /api/payroll/preview | 帯ごとの時給の行 |
| O | 確定 | /payroll | /api/payroll/finalize | 明細の凍結 |
| C | 明細（375 幅） | /mine | — | — |
| O | 支払済み | /payroll | /api/payroll/mark-paid | 戻せない＝通しの記録 |

## 6. 残る行（全部 NOX-RUN-HOST の中・消さない）
伝票・明細・指名・入金・領収書・日報・打刻・休憩・シフト・給与（確定と支払済み）・窓口（問い合わせと返事）・サポート許可・監査・運営の監査・ユーザー（オーナー・店長・スタッフ・キャスト 4・端末）。2 店舗目を運営が作ったら、その店も残る。

## 7. 決めてほしい点（残り）
1. 会社を作るとき「テスター」に印を付けるか（推し＝付ける：課金が active のまま＝月末の確定まで書ける・運営の一覧で対象外に分かれる）。付けないなら試用の期限が月末の確定（12/1 以降）まで持つかを先に確かめる。
2. 通す日（営業日）と、月末の確定・支払済みを押す日（12/1 以降）。
3. 2 店舗目の依頼を、運営が受けて実際に 2 店目を作るところまで通すか（作るなら multi-store (3) の支払日の確かめが効く）。依頼までで止めるか。
4. 人数：キャスト 4（新人 2・標準 2）・店長 1・スタッフ 1・端末 1 でよいか。
5. 運営の側（返事・サポート許可を頼む）は Agoora が押す（CC は /ops に入らない）でよいか。
