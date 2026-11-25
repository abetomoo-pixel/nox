# 朝の便の報告 2026-11-25（相談役 11/25 朝の便 M1〜M6）

## 0. まとめ
- デモの reset の確かめ：cast_employment は全社 0 行・wipe-cover 緑・old と live が 1 バイト同じ（詳しくは docs/handoff/morning_1125.md §13）。
- 本番への書込は M1（0207）と M2（0208）の適用だけ。
  - 0207：2026-11-25 06:46:41 に適用・検証 13 行とも期待どおり・関数 483→486・表 127→128。
  - 0208：06:46:50 に適用・検証 10 行とも期待どおり・関数 486→487・表 128。
  - どちらも f0 の走行中ではなく、06:05〜06:40 の外。Vercel の設定には触れていない。
- M3：ベルとランクの出勤の時刻を main に入れ、旗 MIG_0207_APPLIED・MIG_0208_APPLIED を true にした。f0 2 連緑の後に push した（95c0a100..94f7ee65・2026-11-25 10:57:55）。本番の build の印 aN-yH1P5RN4vkk3CviDaY → j2vB4U8szMjEyIvTRMMcC（11:01:26）。
- M4：時間別の時給 A を main に入れた（旗 HOURLY_BANDS_ON は false のまま）。ア〜ウの結果は §4。
  - アで見つけた不一致 2 つ（シフトの無い日の秒・基準 shift で "02:00" の書き方の日）を、帯で切る区間の側で直した。pay.ts の式は変えていない。
- M5：起票157 の続きの mig（仮 0211）を起草して試走（28 件）した。初期設定の「招待メール」の文 5 か所を、今の作りに合わせて直した（main に入れた）。
- M6：決めのとおり進めていない。

## 1. M1 0207 の適用（ログ docs/tmp/apply_0207_1125.log）
- 指紋 3 つとも一致：本体 871c8605…ca5a60c（相談役の文と全桁同じ）・事前確認 63a99432…0578646c・検証 eb0079b0…e928df。
- 繋ぎ先の ref は hiqbfagmkrdpmlqhkmsu・ロールは postgres・ほかの CC の接続 0・前の状態は関数 483・表 127・会社 13。
- 事前確認の返りは貼り先証明の 1 行だけ（13）。本体は 1 回だけ流した（BEGIN … COMMIT）。
- 検証の全行（13 行）：

  | 行 | 値 |
  |---|---|
  | 貼り先証明 | 13 |
  | fn count (expect 486) | 486 |
  | table count (expect 128) | 128 |
  | new fns (expect 3) | 3 |
  | secdef (expect 3) | 3 |
  | ops fns acl service only (expect 2) | 2 |
  | dismiss acl (expect 1) | 1 |
  | rls on (expect true) | true |
  | policies (expect ops_support_requests_select) | ops_support_requests_select |
  | grants anon/authenticated (expect authenticated:SELECT) | authenticated:SELECT |
  | one open per org index (expect 1) | 1 |
  | rows (expect 0) | 0 |
  | support_grant_set unchanged (expect 1) | 1 |
- 後の状態は関数 486・表 128。
- 収蔵 supabase/migrations/0207_support_ask.sql（sha 一致）。
- デモの消さない名簿（DEMO_KEEP_EXTRA）に ops_support_requests を足した。verify:nox-wipe-cover は緑。
- 台帳に収載した。

## 2. M2 0208 の適用（ログ docs/tmp/apply_0208_1125.log）
- **適用の前の読取（今の本番の set_cast_rank と 0208 の関数の柵）**：
  - 同じ点：
    - 冒頭で会社か役が無ければ forbidden。次に課金の述語で billing locked。
    - owner は通す。manager は自店（auth_store_id）だけ。それ以外の役は forbidden。
  - auth_role()：memberships.role の 'admin' を 'owner' と返す（★28 0175 v2）。ただし memberships_role_check は owner／manager／staff／cast だけで、admin の行は作れない（本番の役は cast 10・manager 10・owner 12・staff 14）。
    - 両方とも auth_role() を通すので、admin は同じ扱い（owner と同じ）。owner と manager のほかに書ける役は無い。
  - 違う点は 1 つ（書ける人は同じ・断る文だけが違う）：
    - set_cast_rank は役を先に見る。0208 はランクの行（自社）を先に引き、無ければ not found。
    - そのため、自社のスタッフが存在しない id を渡すと、set_cast_rank は forbidden、0208 は not found を返す。他社の店長は、set_cast_rank は forbidden（店が自社に無い）、0208 は not found（ランクが自社に無い）。
    - どちらも書けない。存在を確かめられるのも自社のランクだけ。
  - これを「同じ形」と判断して適用した（違うと見るなら、0208 の関数の作り直し 1 本で順番をそろえられる）。
- **数の行の直し（本体は変えていない・本体の指紋 0b043ab4…5d742 は相談役の文と全桁同じ）**：
  - 0208_precheck.sql（指紋 aacac7f2… → 53ef2717…・前の版は 0208_precheck_before_1125.sql に保存）：
    - 前：`… where f not in (483, 485, 486, 488)`（関数の数だけ）
    - 後：`… 'fn ' || f || ' table ' || t … where not (f = 486 and t = 128)`（関数 486・表 128 だけを通す）
    - 冒頭のコメントの前提の文も「関数 486・表 128（0207 の後）」に。
  - 0208_verify.sql（指紋 c069744b… → d5f267a5…・前の版は 0208_verify_before_1125.sql）：
    - `fn count (expect 484)` → `(expect 487)`
    - `table count (expect 127)` → `(expect 128)`
    - 冒頭のコメントの文も同じく。
- 適用：
  - 指紋 3 つとも一致。ref と postgres を確かめた。前の状態は関数 486・表 128。事前確認は 1 行だけ。本体は 1 回。
  - 検証の全行（10 行）：貼り先証明 13・fn count 487・table count 128・new columns 2・check 1・existing ranks untouched 0・fn secdef 1・fn acl {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}・billing gate inside 1・set_cast_rank unchanged 1。
  - 後の状態は関数 487・表 128。
- 収蔵 supabase/migrations/0208_rank_shift_time.sql（sha 一致）。

## 3. M3 適用の後の client（main 94f7ee65）
- **ベル**：
  - /ops の会社の詳細：導入完了の後でサポート許可が無いとき、URL の欄の下に「サポート許可を頼む」（ひとこと・任意・200 字まで）。頼み済みなら「頼み済み（日時）・ひとこと」と「頼みを取り下げる」。
  - route は ops/orgs/[id]/support-ask（運営専用・ask／withdraw・admin で service 専用の関数）。
  - オーナーの要承認（🔔 の数と HOME のカード）の先頭に 1 行「運営がサポート許可を求めています（日時）」とひとこと。
    - 「サポート許可を開く」でサポート許可の画面（直通の URL と同じ場所）が開く。
    - 「今は出さない」（support_request_dismiss）。押しただけでは許可にならない（日数を選ぶのはオーナー）。
    - 頼みの後に許可が出ていれば出さない。店長・スタッフには出ない（RLS もオーナーだけ）。
  - 運営の記録の日本語：「オーナーにサポート許可を頼んだ（ひとこと：…）」「サポート許可の頼みを取り下げた」。
- **ランクの出勤の時刻**：枝 shift-rank-time-1124 を入れて、旗 MIG_0208_APPLIED を true。
- **張り替え**：
  - 課金ゲートの正本に A27（set_cast_rank_shift_time）と B(al)（0207 の 3 本）。
  - billing の数：対象 216→217・除外 267→270・ゲート済み 216→217・述語 217→218・形 216→217。p172 は 216→217。
  - 関数の数の pin は 483→487（15 本 20 か所）、表の数は 127→128（13 か所）。
  - ops の o5(2) の nox-actions の数は 6→8。
  - demo-guard の運営の route に 1 本（route 73）。
  - 検査：verify:nox-support-ask（25 件・DB は 1 トランザクションで ROLLBACK）、verify:nox-rank-shift-time（31 件・DB の柵 3 件を足した）。
- **写し**：
  - /ops の詳細は本物の部品を静かに描いた（運営の MFA が要らない形）：docs/tmp/shots_1125_bell/（頼む前・頼み済み・375 と 1024・横のはみ出し 0）。
  - オーナーの HOME：手元の dev を本番の DB で開き、GET 以外は止めた。本物の頼みは作らない（本番に書かない）ので、/api/home/pending の返りにだけ頼みを 1 つ足して描いた。
    - 🔔 1・見出し「要承認 1 件」・行き先 /master/system?tab=support・375 で横のはみ出し 0。
    - 「今は出さない」を押すと support_request_dismiss が止めた書込に 1 回。
    - 写しは docs/tmp/shots_1125_owner/1_home_pending_*.png。
  - マスタ › 料金・会計 › 料金マスタのランクの出勤の時刻のカード：NOX-VERIFY-A1 はランク 0 なので、カードの読みの返りにだけランク 2 つを作って描いた（docs/tmp/shots_1125_owner/2_rank_time_375.png）。
- **f0**：2 連緑＝docs/tmp/f0_1125_j.log・f0_1125_k.log（253 段 9,424 件・golden 5931／125802）。その前に 3 回止まって、そのつど直した：62 段目 messages（ランクのカードの結果の文が素の span＝Message に）・81 段目 0158（表の数の pin の書き方の違う 3 か所＝0158 の tables・0200／0201 の TB）・144 段目 m2（日の追加の初期時間の照合＝ランクの時刻を最後の引数に・同じ形の m83 も）。144 段目からの残りを先に流して緑（f0_1125_i_rest.log）を見てから、頭から 2 連。
- **build の印**：push 95c0a100..94f7ee65（10:57:55）→ 本番の build の印 aN-yH1P5RN4vkk3CviDaY → j2vB4U8szMjEyIvTRMMcC（11:01:26・push から 3 分 32 秒）。
- 注：verify:nox-billing の段47-3（shift_wish_submit）は、06:20 の shift-periods-close が NOX-VERIFY-A1 の 7 月の常設の期間を閉じるので、単独で流すと period_not_open で赤になる。f0 の鎖では rls（7 段目）が先に open に戻す（教訓125）ので、f0 では緑。

## 4. M4 時間別の時給 A（main に入れた・旗 HOURLY_BANDS_ON は false）
置き場は docs/tmp/hourly_1125/（README.md・sim_ab.mts・off／flat／cut の json）。
- **ア：帯で切った分の合計＝その日の今の勤務時間（分）**
  - 直した所（帯で切る区間の側・pay.ts の式は変えていない）：
    1. シフトの無い日の区間の長さを、時間（noShiftHoursOf＝ミリ秒の差）と同じにした。前は分に四捨五入していて、秒のある打刻で最大 30 秒ずれた。
    2. 区間の選び方を純関数 bandWindowOf に出し、pay.ts の dailyBase（★324-2）と同じ条件にした。
       - 前は、基準 shift で end が start 以下の書き方（"02:00"＝今は時間 0）の日に打刻の区間へ戻り、今は 0 の時間を帯では払う形だった。
    3. shift_guarantee のシフトで切る候補は、今日までの確定シフトの日だけ。
  - 検査 verify:nox-hourly-window（26 件・DB に触れない・f0 の鎖）：本物の loadPunch に作り物の行を渡した。
    - 日をまたぐ（26:00 と 02:00 の書き方）・基準 shift（26:00／02:00）・打刻しない店・シフトの無い日（秒あり）・shift_guarantee（実働が短い／長い）。
    - 境と端の純関数、collect の配線も見る。
  - 本番の実データ（読むだけ・帯の表だけ偽の読取）：デモ 7 店と NOX-VERIFY × 10 月・11 月の 18 件に、額の違う帯を当てた。
    - 帯で切った **1,500 日がすべて一致**（合わない日 0・区間が取れない日 0）。
    - 内訳は実打刻 1,100 日・基準 shift 400 日。本番に無い場合は作り物の検査で見た。
  - shift_guarantee で帯の額が日によって違うときは、決め（打刻で切った額とシフトで切った額の高い方）どおり、選ばれた側の時間になる。帯の額が同じなら今の max(実働, シフト) と一致する（検査で確かめた）。
- **イ：全員に基本時給と同じ額の帯＝今と 1 円も変わらない**
  - 同じ 18 件（116 行）を、旗 false と、旗 true・全プランに基本時給と同じ額の帯（21 時で切る 2 本）で計算した。帯の道を通った日は 1,213 日。
  - 時給の部分 20,933,091 円・総額 45,358,494 円・源泉 2,776,358 円が**両方同じ**・差のある行 0・結果全体の sha256 も同じ（8948a6b6…4c833f）。
  - 途中で一度合わなかった。原因は試算の道具：偽の読取が同伴バックの帯（target 'dohan_back'・MUSE は本物）の読みにも時給の帯を返していた。target で絞り、ほかの読みは本物のままにして一致した。
    - 本物の読みは target ごと（collect・rules-0175-collect とも .eq("target", …)）なので、本番で時給の帯を入れても同伴バックには混ざらない。
- **ウ：勤務時間があるのに帯で切れない日**（今はその日は帯なしの時給で計算）
  - アの直しの後に起こりうる条件：
    1. 同じ営業日に、確定シフトの日の時間とシフトの無い日の時間の両方が入った日（今の照合では起きない作り）。
    2. "02:00" の書き方の確定シフト（今は時間 0＝払いも 0＝金額は同じ）。
    3. in と out が同じ分（時間 0）。
  - 本番の実データでは 0 日。
  - 案（作っていない）：
    - collect が日付を残す（hourlyBands.unbanded）。
    - 下書きの警告 'hourly_band_unbanded'（「時間帯の時給を当てられなかった日 n 日（帯なしの時給で計算）」）と、給与の要対応に 1 行（押すと勤怠のその日）。
    - 凍結にも日付を残し、明細に注記 1 行。
    - "02:00" の書き方は保存で 25:30 の形にそろえる。
  - 決めてほしい点：警告か要対応か・凍結に残すか・"02:00" を DB で断るか（mig）。
- **待遇プランの編集の「時間帯の時給」の表**：前の便で作ってある（旗の後ろ・オーナーだけ・plan_rate_band_set target 'hourly'・重なりは画面で止める・額 0＝時給なし・12 個まで）。旗は false なので、今は出ない。

## 5. M5 起票157 の続き（mig の起草まで）
- 置き場 docs/tmp/staff_invite_1125/：

  | ファイル | sha256 |
  |---|---|
  | 0211_staff_invite_reissue.sql | cd6a3ddf9ba098a59453eb50f32432eab0626cd0ee6f989b313cb18acdf942e5 |
  | 0211_precheck.sql | bc671b0610514ba4c1e753028724739a92a5de4ea60b6508bf4320ff91ef8e6d |
  | 0211_verify.sql | 06acb85b30e7ad7c59f16071be5adac42c584288c25cec7dd5e6c8131fa3f066 |
  | try-0211.mts | 4cc4c76e5243c710d24fd1166b32d6ea11872bac9dfb748262d82010ca1cf136 |
  | plan.md | 7829a1a46e57295201543b81a68596396e149b659a6b2adec8ee053991969487 |
  | READY.md | 2cad56fb70255eead7a0fcde76f3218536f7d43e2270d520bddfde0601a1bb6b |

- 番号は仮 0211（0209＝運営者の管理・0210＝初回料金の次）。当てる直前に本番から数え直す。
- 中身：
  - staff_invites.revoked_at（列 1）。
  - 関数 3：
    - staff_invite_reissue：トークンを替えて前のリンクを無効・期限は出し直しから 14 日・1 日 5 回まで・課金 A。
    - staff_invite_revoke：取り消し・課金の外。
    - staff_invite_mail_note：送った結果を監査に 1 行・課金 A。
  - 回数は audit_logs を数える（今ある索引・招待の行を for update で先に取る・JST の日）。送った記録の表は作らない。
  - 数は関数 487→490・表 128 のまま。
- 試走：本番 BEGIN … ROLLBACK で OK 28 件（11/25 00:03・0207／0208 の前だったので、数の期待値だけ試走の中で今の数に置き換えた）。
- 初回のパスワード変更：Auth の app_metadata.must_change_password を推す（mig なし）。
  - 止めるのは middleware。
  - メール無しの人は新しい画面 /auth/change-password（今のパスワード＋新しいパスワード）。
- route の案（plan.md）：
  - POST /api/staff/invite の中で、RPC の後に Resend の API を呼ぶ。鍵は RESEND_API_KEY（値は書いていない）。
  - 8 秒で打ち切り・429／5xx は 1 回やり直す・ログに宛先とトークンを出さない。
  - 送れなくてもリンクは画面に出す。デモ／preview／鍵なし／テスト用ドメインには送らない。
  - 件名に店名なし・本文に店名・署名は「NOX（株式会社レクソル）」・reply-to は support@noxapp.jp。
- 初期設定の「招待メール」の文 5 か所（app/(manage)/setup/setup-wizard.tsx）を、今の作り（ログイン ID と初期パスワードを画面に出す・メールは送らない）に合う文に直した。main に入れた。
- 決めてほしい点（plan.md §9 の 11 点）：
  1. 回数を audit_logs から数える
  2. 5 回は出し直しと送り直しの合計か
  3. 1 日は JST の 0 時で区切るか
  4. 取り消しを課金の外にするか・2 回目の取り消しの扱い
  5. メールの「送信専用です」を「返信は NOX のサポートへ」にするか
  6. 期限切れの招待を一覧に何日まで出すか
  7. 発行の時は回数に入れないか・会社ごとの 1 日の上限
  8. メール無しの人が忘れたとき、店が初期パスワードを出し直す route を作るか
  9. 今いる人に変更の印を付け直すか
  10. パスワードの変更を DB の監査にも残すか
  11. 初期設定の文の言い回しと、残りの 2 か所（「・招待済み」「招待に失敗」）

## 6. M6 そのまま置いた物
丸め（起票159・枝 setup-consent-1124 は main に入れていない）・休憩（起票158 の 2）・初回料金（起票140）・運営者の管理（0209）・ポイントの還元・窓口の段 1・/ を LP にする件。mig の番号は 0209＝運営者の管理・0210＝初回料金・仮 0211＝スタッフの招待の続き（台帳に収載）。
