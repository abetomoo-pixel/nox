# ローンチ前ゲート 4 role 目視の順路表（2026-10-14・便 G-R G-5＝LP-1 P-4 を先行・HEAD 6c6f66e 時点の route／nav から機械的に起こした）

前提: 本番 https://nox-kappa-eight.vercel.app ・入口は /demo（店 6 × 役割 4 ＋ 端末）。デモは毎日 06:05 JST に初期化されるため**目視は同日中に完了**する（途中で日をまたぐと伝票・打刻が消える）。
到達可否の出所: app/(manage)/layout.tsx（nav の role 条件・cast は /register のみ）・app/(manage)/master/layout.tsx（owner／manager 以外を /dashboard へ）・各 page.tsx の redirect・app/mine/layout.tsx（cast 以外を /register へ）・lib/nox/master/nav.ts（マスタ 4 群 9 入口）。
記法: ○＝到達して見る／△＝到達するが差分のみ見る（owner で見た画面と同じ）／×＝redirect（拒否の確認だけ・1 秒）／—＝対象外。
見る店＝店差のある項目はその店（scripts/demo/profiles.mjs・SLIDES・docs/demo/store_profiles_20261009.md）。店差の無い画面は **LUNA**（キャバクラ・標準＝機能が一番多い中規模店）で見る。
店の差分の要点: MUSE＝時給＋バックのみ・率％型・フード 10%／LUNA＝ノルマ＋達成ボーナス・売上スライド **半月**・締め解除・売掛／NOIR＝ポイント制・**判定基準＝本指名の件数・対象ランク S／A**・確定シフト基準・送り 1,500・キャスト確認・人数不足／ACE＝売上スライド **月次**・達成ボーナス・キャスト確認・人数不足／LILY＝確定シフト基準・ノルマ・カウンター／NEST＝代表キャストの希望方式 **休み希望（off_only）**・最小規模。

## 0. 入口（役割なし・2 分）

| 画面 | 到達 | 見るべき 1 点 | 店 |
|---|---|---|---|
| /demo | 誰でも | 店 6 × 役割 4 ＋ 端末のボタン・帯文言「毎日 06:05 に初期化」・「初期状態に戻す」は同一店 10 分間隔 | — |
| /login | 誰でも | magiclink 入場後は不要（デモは共通パスワードなし＝ログイン画面から入れないのが正） | — |
| / | ログイン後 | role 別に /dashboard（owner／manager／staff）・/mine（cast）へ振り分く | — |
| robots.txt | 誰でも | `/$` と /demo だけ allow・他は disallow（LP 公開時に見直す） | — |

## 1. owner（全画面・推定 80〜95 分＝PC 60 分＋スマホ 375px で表の溢れ 6 面 20 分）

| 画面 | 到達 | 見るべき 1 点 | 店 |
|---|---|---|---|
| /dashboard | ○ | KPI と今日の出勤・直近のお知らせ。**未確定 run の注意行**（起票97 が未裁定＝自動計算なし＝手動プレビューの案内文） | LUNA |
| /register | ○ | VIP 席の料金表・ランク別指名料・売掛ボタン（receivable_policy customer_only）。支払方法は現金／カード／売掛／その他（電子マネー・QR は OFF＝0164 既定＝ボタン無し） | NOIR |
| /register（2 店目） | △ | カウンターのタイル・チャージ・キャストショット（ドリンク申告の結線）・フードのバック表示「—」が残る店 | LILY |
| /report | ○ | 日報の締め→**締め解除フロー**（reopen_flow ON の店だけ「解除」導線）・月報タブの店セレクタ（owner＝org 全店） | LUNA |
| /master/stock | ○ | 在庫一覧（track_stock の商品のみ）・入出庫の記録が audit に載る | MUSE |
| /shift | ○ | 今日タブ 7 日ストリップの**不足**（必要人数 5／6 に対し 4・3 の日）・確定タブ「キャスト確認待ち」（shift_cast_confirm ON）・遅刻分数「(+N 分)」（裁定268） | NOIR |
| /shift（2 店目） | △ | 充足の店は不足バッジが 1 つも出ない・スタッフ枠 2（早番／遅番）の行 | LUNA |
| /casts | ○ | キャスト詳細のランク（S／A／標準）・**希望方式（店の既定／シフト希望／休み希望）の 3 方式が混在**（裁定337）・写真 | NOIR |
| /casts（2 店目） | △ | 代表キャスト「ケン」の希望方式＝休み希望（off_only） | NEST |
| /staff | ○ | スタッフ編集モーダルのメール変更（裁定267）＝保存後に重複メールは「既に登録」・owner 本人は変更不可（起票98） | LUNA |
| /payroll | ○ | 2026-09 プレビュー（確定済み）の明細: **売上スライド 月次**の段行「売上 ¥…→時給 ¥3,500」・達成ボーナス行・前借りの天引き・期ヘッダー「締め 月末・支払日 翌月 25 日」 | ACE |
| /payroll（2 店目） | ○ | **判定基準: 本指名の件数・対象: S・A** の印（一覧とプレビュー）・標準ランクの行は「スライド＝対象外」・ポイントスライド（60／120／200pt）・**起票100 の目視クローズ＝NOIR の 2026-09 プレビューが timeout せず開く** | NOIR |
| /payroll（3 店目） | △ | 半月（前半／後半）の期と段行・#75（disabled の理由文）・#78（確定済み月にボタンが出ない）・#79（納付管理の注記）・#80（確定解除ボタンの枠） | LUNA |
| /customers・/customers/[id] | ○ | 売掛残のある顧客の明細・休眠の一覧（canDormant）・ボトルキープ | NOIR |
| /analytics | ○ | **全店合算トグル（owner のみ）**・時間帯×曜日ヒートマップで DevTools Console に key 警告が無い（#81）・席稼働 | ACE |
| /receipts → /r/[token] | ○ | 領収書台帳から公開ページを開く（anon・noindex・5 項目のみ） | LUNA |
| /master（トップ） | ○ | 4 群 9 入口（商品・料金／キャスト・報酬／店舗・運用／スタッフ・システム）・「端末・印刷」が出る（ownerOnly） | LUNA |
| /master/products・/categories | ○ | 商品バックの列: 率％型（フード 10%）と pt 欄（本指名商品 pt）・CSV 一括 | MUSE |
| /master/products（2 店目） | △ | 4 段階型（本／場内／同伴／フリーの円）・銘柄別 ×0.9〜1.1 | LUNA |
| /master/pricing（3 タブ） | ○ | 料金マスタ＝VIP 専用料金表・適用ルール・会計設定（サービス料・税の丸め） | NOIR |
| /master/cast-comp/plan | ○ | 節④ **判定基準 select（売上／本指名の件数／同伴の件数）＋対象ランクのチェック**（裁定343）・見出し「本指名の件数スライド」・準備中バッジの残り（pt 付与ルール／粗利基準／帯の歩合 % 列＝lp_plan.md L-4） | NOIR |
| /master/cast-comp/plan（2 店目） | △ | 判定期間（月次／半月／日次）の select（裁定338）・半月の店の表示・割当表の未割当 placeholder「未設定」（#76）・過去日保存の文言（#77） | LUNA |
| /master/cast-comp/plan#norma | △ | ノルマ表（日数・同伴・売上・指名）と一括設定 | LILY |
| /master/cast-comp/deduction | ○ | 送りの基本額 1,500・控除の項目 | NOIR |
| /master/cast-comp/register | ○ | キャスト会計の許可（デモは全員 OFF＝cast は /register へ入れない） | LUNA |
| /master/referrers | ○ | 紹介者の登録・紹介料の支払（R11） | LUNA |
| /master/seats | ○ | 席の種別（VIP／テーブル／カウンター）と並び替え・フロア表示の切替（334） | NOIR |
| /master/store-profile?tab=features | ○ | **使う制度の ON/OFF が店ごとに違う**（MUSE＝時給＋バックのみ→ノルマ・ポイント・スライドの節が各面から消える） | MUSE |
| /master/store-profile?tab=info | ○ | 0164 の 7 項目（適格請求書の登録日・支払日 25・内税表示 OFF・VIP／カウンターを使う・支払方法・打刻方法）＝全店既定のまま | LUNA |
| /master/store-profile?tab=data | ○ | データ管理（エクスポート・初期化の案内）＝デモでは「初期状態に戻す」との住み分け | LUNA |
| /master/business-hours | ○ | 曜日別の営業時間・定休日（必要人数 0 の曜日と一致） | LUNA |
| /master/system（#devices／#pins／#receipts／#secrets） | ○ | 打刻端末の登録（kiosk_devices）・操作担当 PIN・レシート・機密情報（マイナンバーの保護画面） | LUNA |
| /notices | ○ | 投稿・編集・削除・対象（キャスト／スタッフ）の件数・差出人の表示 | LUNA |
| /audit | ○ | 直近の操作ログ（reset の finalize・締め・打刻訂正が並ぶ）・owner 以外は 0 行 | LUNA |
| /billing | — | デモは nav から隠す（Stripe の導線）＝URL 直打ちも見ない | — |
| /setup | — | デモの owner は /setup へ飛ばされない（N7-2 ②）＝ウィザードは本番 org でのみ | — |
| /mine | × | owner は /register へ戻される | — |

## 2. manager（差分のみ・推定 25〜30 分）

owner と同じ画面は**見ない**。見るのは「owner と違う所」＋「拒否されること」。

| 画面 | 到達 | 見るべき 1 点 | 店 |
|---|---|---|---|
| /dashboard | ○ | owner の「監査」「ご契約」が nav に無い・マスタの「端末・印刷」入口が出ない（ownerOnly） | LUNA |
| /report 月報 | ○ | 店セレクタが自店 1 件 | LUNA |
| /analytics | ○ | 全店合算トグルが**出ない** | ACE |
| /payroll | ○ | 確定と確定解除（canReopen）ができる・CSV | NOIR |
| /shift 確定タブ | ○ | 採否・確定・必要人数の編集が manager でできる | NOIR |
| /master/system | △ | nav には無いが URL 直打ちで開ける（page のガードは isManagerUp）＝**仕様どおりか相談役が判断** | LUNA |
| /audit・/billing・/setup | × | /dashboard へ戻される | — |
| /mine | × | /register へ戻される | — |

## 3. staff（推定 15〜20 分）

| 画面 | 到達 | 見るべき 1 点 | 店 |
|---|---|---|---|
| /register（入場先） | ○ | 会計・打刻の代行ができる・予約申請の表示（can_crm＝デモは ON） | LUNA |
| /dashboard | ○ | staff 向けの簡易版（KPI の金額系が無い） | LUNA |
| /report | ○ | 閲覧のみ（締め・再締めのボタンが無い） | LUNA |
| /shift | ○ | 閲覧＋出勤板のみ（採否・確定・必要人数の編集が無い）・今日タブの退勤ボタン（punch_methods.proxy ON） | NOIR |
| /customers | ○ | can_crm ON なので見える（OFF の店では nav から消える＝デモに OFF の店なし） | NOIR |
| /notices | ○ | 閲覧のみ（投稿ボタン無し） | LUNA |
| /casts・/staff・/payroll・/analytics・/receipts | × | /register へ戻される | — |
| /master・/master/* | × | /dashboard へ戻される（master/layout） | — |
| /audit | × | /dashboard へ | — |

## 4. cast（推定 25〜30 分＝4 店の /mine を見る）

| 画面 | 到達 | 見るべき 1 点 | 店（代表キャスト） |
|---|---|---|---|
| /mine（入場先） | ○ | 今月の明細（payslip_visibility detail）・**売上スライド 月次**の段・契約確認ゲート・目標設定（ノルマ OFF の店は 409「norms off」ではなく非表示） | ACE（ひなの） |
| /mine（2 店目） | ○ | ポイント・ランク・**対象外の表示**（標準ランクならスライド無し）・勤怠一覧の実働（確定シフト基準の店＝起票99 の食い違いが見える） | NOIR（あべ） |
| /mine（3 店目） | ○ | 自己打刻ボタン（punch_methods.self ON）・ドリンク申告・予約申請・写真・明細印刷 | LUNA（みさき） |
| /mine/wishes | ○ | **ナビ名が「休み希望」**（代表キャスト ケン＝off_only）・時刻なしで提出・取下げは pending のみ | NEST（ケン） |
| /mine/wishes（2 店目） | △ | ナビ名「シフト希望」・翌週 open 期間（締切 R+3）に時刻付きで提出・採用済み（accepted）の行 | ACE（ひなの） |
| /mine/ranking | ○ | 期間（当月）のランキング・ranking OFF の店は nav から消える（デモは全店 ON） | NOIR |
| /mine/notices | ○ | 未読バッジ（noticeNavLabelOf）・pinned の順 | LUNA |
| /register | × | キャスト会計の許可が OFF（デモ既定）＝/mine へ戻される | — |
| /dashboard・/master・/payroll 等 | × | すべて /mine へ戻される（manage layout の cast 分岐） | — |

## 5. 端末（kiosk・推定 10 分）

| 画面 | 到達 | 見るべき 1 点 | 店 |
|---|---|---|---|
| /kiosk | ○（/demo の「端末」） | 源氏名グリッド→PIN→出勤／退勤・退勤時の「送り あり／なし」は方式が実費の店だけ（デモは基本額方式＝問いは出ない想定・出たら NG）・**punch_methods.kiosk OFF でも出る＝起票103（第 2 期・仕様）** | NOIR |
| /kiosk-register | — | デモにレジ端末アカウントが無い（kiosk_devices は打刻端末のみ）＝目視対象外。必要なら本番 org の端末で別途 | — |

## 6. 所要時間のまとめ

| role | 画面数（○＋△） | 推定 | 備考 |
|---|---|---|---|
| 入口 | 4 | 2 分 | |
| owner | 36 | 80〜95 分 | PC で一巡 60 分＋スマホ 375px の溢れ 6 面（/payroll 明細・/analytics・/master/cast-comp/plan・/master/seats・/register 会計・/mine/ranking）20 分 |
| manager | 8 | 25〜30 分 | 差分と拒否のみ |
| staff | 9 | 15〜20 分 | |
| cast | 9 | 25〜30 分 | 4 店の /mine |
| 端末 | 1 | 10 分 | |
| **合計** | **67** | **約 2 時間 40 分〜3 時間** | 同日中に完了（06:05 の初期化前） |

判定の書き方: 各行の右に OK／NG＋一言。NG は X-13 台帳（docs/demo/x13_ledger.md）に番号で束ねる（0918_close_checklist.md と同じ流儀）。#75〜#79・#81 の確認クローズは本表の該当行（/payroll LUNA・/master/cast-comp/plan LUNA・/analytics ACE）で同時に閉じる。
