# NOX 裁定台帳

> 目的：チャット内で確定した裁定（Agoora 承認済み）を repo に現物化し、セッション断絶で失われないようにする。
> 運用：裁定は本ファイルへ追記（1裁定=1節・日付と出典を必ず書く）。実装状況は各節に注記。
> **注記（2026-07-17 起票時）**：本台帳は「追記3」指示で新規作成した。指示が参照する「追記2 の内容」の全文は
> 作成セッションに未達のため、下記は追記3 に列挙された項目＋本セッションで確定済みの裁定のみ。
> 追記2 の全文が投入され次第、差分を追補すること。

---

## 裁定1：BANZEN との分離ルールの再定義（Agoora 承認・2026-07-17）

旧ルール（2026-07-13）「BANZEN と NOX は別チャット。一方の話題を他方で出さない」は**過剰**で、
NOX の当初前提「BANZEN をベースに流用する（ゼロから書かない）」を殺した。以下に再定義する。

- NOX セッションの CC は BANZEN リポジトリ（`C:\Users\abet\Dropbox\cloude\makanai-shift`）を
  **読み取り専用で参照してよい**（流用元として）。
- BANZEN への**書込・コミット・設計変更は一切禁止**。
- BANZEN の「設計判断・推奨・課題」を NOX チャットに持ち込まない（＝元の訂正の趣旨は維持）。
- 参照目的は**実装パターンの翻訳のみ**。
- 流用の正本＝`docs/NOX_BANZEN流用マップ.md`（F0a から収載済み・2026-07-17 に §7/§8 を実測追補）。

## 裁定2：AI シフト最適化＝実装しない（Agoora・2026-07-17）

モック（canonical）の「AIでシフト最適化」（LLM に割当案 JSON を生成させ反映する機能）は**実装しない**。
シフト再実装の自動配置は BANZEN `lib/shift-autoassign.ts`（説明可能な貪欲法・純関数）の縮退翻訳で行う
（流用マップ §7）。

## 裁定3：ロゴ＝台帳#41（post-launch 保留・2026-07-17）

- canonical のロゴ層（lucide 隠し＋PNG ロックアップ/モノグラム）は **R-2 で移植しない**。
- アートワークが2種存在（B=収載版 / C=描き直し版・sha 相違を実測済み）で未確定のため、
  ブランド判断として post-launch に分離。確定後にサイドバー `::before` 等へ追加する。
- 経緯注記：canonical 自体にロゴ画像は無く（lucide アイコン）、PNG 化は responsive 層が持ち込んだもの。
  よって #41 は「差し替え」ではなく「アートワーク改訂の採否」。

## 裁定4：浮遊トースト＝台帳#42（保留・2026-07-17）

モックの toast（`bottom:28px / right:32px` の浮遊通知）への移行は保留。
現行 Toast はカード内 inline の `<p>`（D-2 で共通部品化・27箇所）。浮遊化は見た目の変更＝D-3 以降の
裁定事項として、R-2 では移植しない（components/ui/toast.tsx の実装コメントにも同旨）。

→ **E4-0（2026-08-17）で再確認・見送り継続（post-launch 維持）**。E3 でモック `.toast` の
CSS 部品（`.nox-toast`＝`position:fixed; right:26px; bottom:26px` ほか）は**用意済み**だが、
移行すると **27箇所のカード内レイアウトが同時に動く**（メッセージが流れの中から消えて画面隅へ移る＝
「どの操作の結果か」の対応づけが弱くなる）。E4 は**部品値の適用のみ**とし、
表示位置は現行（カード内 inline `<p>`）を維持する。採用するなら *全27箇所を同時に* 切り替える
独立レーンが要る＝本裁定を維持。

## 裁定5：R-2 レスポンシブ断点＝900px（相談役設計判断・Agoora 承認・2026-07-17）

- モックの 768px サイドバー化は採らず **900px に引き上げ**。
  理由：実機タブレット縦（iPad mini 744 / iPad 820 / Pro11 834）をサイドバー化すると本文約600px に
  潰れ kgrid 4列等が破綻。744 は 768 未満で 520px 固定に落ちる問題もある。
- 断点構成：≤640＝520px 固定（モバイル不変）／641–899＝幅可変760（R-1 維持・下部タブバー）／
  900+＝サイドバー212px・幅100%・内容1120cap／1180+＝padding 微調整。1024 断点は実装しない。
- 実装済み：コミット `2646da3`（シェル4部品のクラス化・!important ゼロ）。

## 裁定6：キオスク（Agoora 確定・2026-07-17 追記5/6＝要確認フラグ解除・未決ゼロ）

**1. レジ用キオスク＝作る**（従前の「作らない最終確定」を Agoora が撤回・2026-07-17）。
- 実装時期＝**N1**（追記6 で (a) 採用＝N1-b の B1/B2/B4 完了後・項番 7.5）。
- 設計方針＝**register-board の別皮。checks/会計 RPC は共用・新設しない。端末認証層のみ新規**
  （BANZEN キオスク K-a〜K-h が翻訳元候補＝流用マップ §4 参照）。

**2. 打刻キオスク（F4a・mig0043）＝残す・ただし低優先**。
- Agoora 評価（逐語）：「**スマホで十分・むしろこっちがいらないくらい**」。
- 撤去しない・以後の作り込みもしない。
- 在席判定（E3）実装後は**「スマホ打刻が正・キオスク打刻は補助」**の序列とする。

## 裁定7：決済＝方式A（Agoora・2026-07-17・★要詳細追補）

追記3 の列挙より逐語収載。方式A の内容定義は作成セッションに未達＝追記2 の全文で要追補。
参考：実装済みの決済関連は payments.method 4値（cash/card/ar/other）＋ method_detail（F4c mig0046）。

## 裁定8：モック↔repo 欠落の全件裁定＝フェーズN1 確定（Agoora 全件確定・2026-07-17・追記6 で全件確定＝未決ゼロ）

2026-07-17 のモック↔repo 全画面照合（部分実装11画面・未実装2画面）で挙がった欠落の全件裁定。
追記6 でレジ用キオスクが N1 編入（裁定6）＝**実装 15 / post-launch 12 / 凍結棚 7 / スコープ外（AI 系全部）/ 保留 2**。

### 実装する（15件）＝フェーズN1 の母体

| # | 項目 | 土台の現状 |
|---|---|---|
| A1 | 監査ログ画面 | audit_logs 完備・owner policy 有・**UI のみ** |
| A2 | ボトルキープ登録 UI | bottle_keep_register（mig0023）済・**UI のみ**。配置は checkout フロー内（NOX8 裁定準拠） |
| A4 | 月報 | daily_report_aggregate（mig0010）済。期間集計の拡張要否は設計で判定 |
| B1 | 相席（同一会計に追加） | checks 構造拡張（BANZEN にも無い＝新規設計） |
| B2 | 席移動 | 同上（B1 と同一設計でまとめて） |
| B4 | 時間料金の自動計算（セット+延長） | E1 の設定を参照する新規 |
| B6 | 売掛回収（現金振替・伝票残入金） | **#38 弁護士ゲートと並走** |
| C1 | 手渡し（現金売上−諸経費−現金支払＝当日支給） | 日報系拡張 |
| D1 | 給与確定解除 | 凍結解除の**逆 RPC・監査要件重い・設計慎重に**（相談役レビュー必須） |
| D2 | 報酬明細書の印刷/PDF | — |
| D3 | 給与CSV（振込用） | 既存 CSV は支払調書のみ |
| E1 | 料金設定 UI（本指名/場内/同伴/サービス料/カードTAX/丸め） | store 設定列の追加設計から。**台帳#25 と整合させる** |
| E3+E2 | GPS/店舗IP 在席判定＋運用トグル群（一体） | BANZEN geofence.ts **◎翻訳**・punch_self の lat/lng 受け口は既存 |
| E5 | ダッシュボード画面 | トップのスタブ解消。既存 RPC＋analytics 流用 |
| K | レジ用キオスク（追記6 で N1 編入） | register-board の別皮・checks/会計 RPC 共用・端末認証層のみ新規（裁定6・BANZEN K-a〜K-h 翻訳元） |

実装順序（固定・追記6 更新）：N1-a（DB 非改変）＝E5→A1→A2 ／
N1-b（mig レビュー先行）＝E1→B4→B1→B2→**K（レジ用キオスク＝checks 構造確定後の別皮・項番7.5）**→C1→A4→B6 ／
N1-c（3ゲート直撃域・最後に慎重に）＝D3→D2→D1 ／ N1-d＝E3+E2。
完了定義＝typecheck/lint 緑＋verify:f0 全緑＋3ゲート不変＋（DB 変更時）検証バンドル緑。
コミット＝項目単位（DB 層と UI 層分離）。push＝各群完了時。

### post-launch（12件）

B3 割勘／B5 在庫警告・発注点／C2 本部連結／C3 仕訳CSV／C4 日次サマリー送信／C5 分析タブ拡充／
D4 明細日次内訳／E4 誕生日リマインド・手動DM下書き／E6 cast系小物4件。

### 凍結棚（シフト系7件）＝BANZEN シフト設計変更中のため翻訳凍結（Agoora 2026-07-17）

日/週/月ビュー／割当グリッド／自動割当／出勤実績へ一括反映（attendance_set 済）／
シフト照合ビュー（punch-match lib 済）／can_shift 結線／希望カレンダー系。

- **解除条件＝Agoora からの「BANZEN シフト確定」通知のみ。NOX から BANZEN の進捗を見に行かない。**
- 解除時に同時裁定する保留2件：
  1. 余剰表示（BANZEN は不足/充足/余剰の3状態・NOX に入れるか）
  2. 粒度（BANZEN＝帯×職種×曜日／NOX＝曜日のみ縮退か）

### スコープ外（裁定済み・再掲）

- AI シフト最適化／AI DM／F3b 離反DM(LLM)＝**NOX は AI/LLM 完全非依存**（フェーズ表の F3b はスコープ外に更新）。
- ~~レジ用キオスク＝作らない~~ → **追記5/6 で撤回・N1 編入**（裁定6 参照）。スコープ外は AI 系のみ。

## 裁定9：B4 時間料金自動計算＝設計裁定8点（Agoora 承認・2026-07-21）

設計提案書（B4 設計フェーズ・相談役レビュー済み）に対する裁定。DB 層＝mig0052。

- (a) check_time_charge_apply の認可＝check_add_line と同一の4者 gate（owner／manager 自店／staff can_register／cast can_register）。
- (b) 冪等＝自然冪等（冪等キー無し・部分ユニークインデックス＋決定的サーバ再計算＝check_open 0038/0040 型）。
- (c) payments 存在時は apply 拒否（'has payments'・check_remove_line と同じ保守側）。
- (d) 自動行の kind='time'（語彙拡張なし。set/time/charge が全集計経路で等価なことは live prosrc で実測済み）。
- (e) 自動行の pay_group='A' 固定（グループ分割店は手動運用。TimePricingPanel の注記文言に明記＝UI フェーズ）。
- (f) UI 自動化＝**反映ボタンのみ**。伝票表示時の自動 apply はしない（却下）。close フローでの促し注記のみ可。
- (g) time_mode は checks へスナップしない（live 読み・凍結は料金5値のみ）。
- (h) stores.set_fee/ext_fee の default=0（E1 fee 流儀・誤課金ゼロ構造。time_mode 既定 manual と二重）。

**既知事項（将来の統一裁定候補・今回は触らない・2026-07-21 記録）**：
check_add_line は payments 存在時のガードを持たない（check_remove_line と check_time_charge_apply は
'has payments' で拒否＝非対称）。入金後の明細追加を許すか否かは運用実績を見て別途裁定。

**verify 追加時の齟齬と裁定（2026-07-21）**：mig0052 適用後に verify:nox-grants の G25
「stores 料金 CHECK = 7本」（`conname like 'stores_%_check'` の総数固定）が、B4 の stores 時間制6
CHECK 追加で 13本になり赤化。裁定＝**G25 を count→named スコープ化**（7 named E1 制約の存在確認へ・
逐語 assert は不変・B4 分は G26 が専任）。`===13` へ書き換える案は却下（E1 段が B4 に恒久カップリング
し次の列追加で再発）。
- **教訓の一般化**：共有テーブル（stores/checks/check_lines 等）へ列・制約を足す mig は、
  設計提案書の段階で**既存 verify の count/インベントリ型 assert（`like 'table_%'` の総数固定・
  テーブル/関数の本数固定等）への波及を棚卸しする**。列を足す側でなく数える側が壊れるため、
  mig レビューでは見落としやすい（本件は verify 追加フェーズ着手時に検知＝一段遅い）。

## 裁定10：B1 相席／B2 席移動＝設計裁定7点＋★追加（Agoora 承認・2026-07-21）

案A＝1伝票多席。DB 層＝mig0053（check_seats 新設・check_open/close/void/reservation_to_check 置換・
check_move_seat/check_add_seat/check_remove_seat 新設）。

- (a) check_seats は transient＝open 伝票の追加席占有を表し close/void/相席解除で削除（plain unique(seat_id)
  が「追加席は同時1伝票」を構造保証）。
- (b) 相席解除 RPC は最小実装（check_remove_seat・主席は解除不可＝'home seat'・席移動の領分）。
- (c) ★占有変更 RPC の冒頭で seats 行を `select … for update`（席ロック方式）。READ COMMITTED では
  post-insert 再検証が相手の未コミット行を見えずレースを閉じられないため。unique index 2本
  （checks_one_open_per_seat・check_seats_seat_occupancy）は backstop 据置。
- (d) 席移動×予約は RPC 非拒否（check_open と対称＝EXCLUDE は予約×予約のみ）。soft 警告は UI。
- (e) 主席移動時、追加席（check_seats）は据置。
- (f) 相席時 checks.people は据置（モック kx は people 非改変）。
- (g) 指名は単一（1伝票1 nom_type・1 nominations＝モック準拠）。
- ★追加：**reservation_to_check も主席 open を作る経路として同ガード適用**（席ロック＋追加席占有の
  拒否）。check_open の再利用が主席∪追加席 union になったため、to_check で塞がないと予約客が他組の
  伝票へ着く（発見1 の相席版）。

**merged_into は休眠据置**（0006 で「相席統合先」列のみ先行・案A は check_seats を採用したため
merged_into は未使用のまま保全＝drop しない）。

**既知受容（2026-07-21 記録）**：check_move_seat は**移動元 seat を lock しない**（移動先のみロック）。
移動先の占有直列化は保証するが、移動の瞬間に移動元を別端末がタップすると一瞬「空席なのに使用中表示が
残る/消える」等の UI 上の見え方のズレが起こり得る＝**既知受容**（DB 整合は不変・実害なし・floor UI の
リロードで解消）。移動元もロックすると2席ロックでロック順序デッドロックの芽が出るため採らない。

**会計無改修の実証**（rls B1/B2 段）：相席後も checks.total（=check_group_due 合算）不変・追加席あり伝票を
締めた get_cast_sales も按分に非混入（seat 参照 0 の構造＝money 関数は check_id 単位）。check_close/void
への追補は status 更新直後の check_seats delete 1文のみ（money 計算 1文字不変）。

**既知・軽微（2026-07-21 巡回で観測・post-launch 改善候補・今回は直さない）**：監査ログ画面（A1）は
コールドスタート直後の初回ロードで client セッション hydration が間に合わず一瞬「履歴はありません」を
出す（再読込で解消・データは 23,222 行健在）。恒久バグではないため今回は非修正。初回フラッシュ抑制
（loading 状態表示など）を post-launch の改善候補として記録。

## 裁定11：レジ用キオスク設計（Agoora 承認・2026-07-21・案A確定・mig 起草は Fable 5 待ちで中断中）

裁定6（レジキオスク＝作る・register-board の別皮・会計RPC 共用・端末認証層のみ新規）の**設計確定**。
提案書レビュー承認済み。**状態＝設計確定・mig 起草は Fable 5 待ちで中断**。次セッションは
「**Fable 5 切替 → 裁定11 で起草再開**」。

**アーキ＝案A：F4a 型拡張**（kiosk_devices・membership 無し・auth_role() null の**構成証明**で全 RLS/RPC を
既定遮断）。BANZEN の**ロール型（profiles.role='kiosk'＋Stage2/3 排除）は採らない**。会計RPC は**共用（複製
しない＝裁定6 堅持）**＝各 check_* の認可ゲートに **kiosk 腕を1本足す**方式。

**確定8点**：
- ① **check_void に kiosk 腕を足さない**（取消は manager 権限・キオスクから不可。誤入力訂正は
  `check_remove_line` で足りる）。
- ② 周辺RPC＝**print_enqueue 足す** / **bottle_keep_register 足す** / **approval_request 足さない**
  （割引申請は承認側が manager ゆえ責任者操作へ寄せる）/ **drink_claim は cast 自己＝対象外**。
- ③ **staff_pin キー粒度＝membership 単位**（権限 can_register と同一キー）。
- ④ **idle timeout＝セッション継続・15分失効**・会計毎の再PINは課さない（値は調整可）。
- ⑤ **打刻 device も purpose='punch' 限定に締める**（防御深度）。**F4a verify 回帰確認を実装条件**とする
  （回帰が出たら別 mig 分離を再判断）。
- ⑥ **kiosk_sessions＝専用テーブル**（device 台帳に可変セッション状態を混ぜない）。
- ⑦ **B1/B2（相席・席移動）を kiosk に出す**。
- ＋PIN桁数＝**cast_pin 現行に揃える**・**PIN 重複許容**（操作担当は membership 選択で確定・PIN は第2要素）。

**設計の要点（次セッション復元用）**：
- **PIN セッション方式**（`kiosk_sessions` に `operator_user_id` を保持）で BANZEN の**2パス化を回避**
  （PIN はログイン1箇所で照合・会計 RPC は raise のまま＝壊れ伝票の芽なし）。
- **actor 解決を全 check_* で統一**：`coalesce(auth_kiosk_operator(), 従来式(auth.uid()→users))`。
- **kiosk 腕も全 check_* で同一形**：`auth_kiosk_register_store_id()` ＋ `auth_kiosk_operator()` の**2ヘルパー
  呼び**（単一判定点＝ドリフト防止）。
- `payments.by_user_id` **NOT NULL 破れ**（kiosk は users 行を持たない）は **operator 経由で解消**。
- **席ロック（for update）は認証方式非依存**で kiosk 経由 check_open にも効く（占有直列化）。
- **提供ゲートは device 型ゆえ軽い**＝「強い未保護ロール」問題が構造的に起きない＝**本番手貼りリスト
  注記レベル**で足りる（role 型のような mig 順序ゲート不要）。
- 新設：`purpose` 列（kiosk_devices）・`staff_pin` 表・`kiosk_sessions` 表・`auth_kiosk_register_store_id()`
  ・`auth_kiosk_operator()`・`kiosk_login`・`set_staff_pin`・register provision（既存 route 拡張）。
- kiosk_devices の unique index 差し替え（**1店1 → 1店1×purpose**）＝トランザクション内。

**起草再開時の制約**：actor coalesce 統一・kiosk 腕同一形・**money 写経は逐語一致**（check_* の money 計算は
1文字も変えない・改修は gate 腕と actor 解決式のみ）・index 差し替えはトランザクション内・**打刻締めの
F4a 回帰を prosrc で確認**。

**未決（起草前に相談役裁定）**：提案書 §6 の ①〜⑦ のうち確定8点で消化。残る調整＝idle 値・PIN 再認証頻度
の運用値、席移動/相席の kiosk フロア権限の細部。

## 裁定12：A4 月報＝設計裁定6点（Agoora 承認・2026-07-21）

設計提案書（A4 設計フェーズ・相談役レビュー済み）に対する裁定。DB 層＝mig0054（読取 RPC 1本のみ）。

- ① **オンザフライ集計**（月次確定テーブルは作らない・daily_reports 凍結行＋既存集計 RPC＋payroll を読取合成）。
- ② **営業月（biz_date）ベース**・半期split（前期1-15/後期16-末/通期）は UI 側（クライアント日付演算）。
- ③ **指名は cast 集計から読取合成**＝`get_store_nom_counts`（mig0054・get_cast_ranking の nom_counts CTE を
  店集計・範囲引数へ逐語縮退）。**daily_report_aggregate は改修しない**。
- ④ **人件費は payroll 読取**（payslips の breakdown_json の gross＝源泉前）。**給与未確定（draft）月は「未確定」
  表示・概算しない**。
- ⑤ **役割別可視**：staff に月報を出す（**売上系のみ可視**）／**人件費・人件費率・cast別売上は owner/mgr のみ**
  （payroll RLS が owner/mgr＝サーバで塞がれ UI は行非表示で足りる）／**cast はタブ非可視**（daily_reports RLS
  が cast 遮断）。
- ⑥ **表示のみ・CSV なし**（会計連携 freee/MF は C3・post-launch＝A4 の外）。

**データ取得経路（会計 write RPC 非改変）**：売上系＝daily_reports 直 SELECT（owner/mgr/staff・cast 遮断）／
指名＝`get_store_nom_counts(store, from, to)`（半期split 用の唯一の新規 DB オブジェクト・件数のみ・cast 個別
なし）／人件費＝payroll_runs/payslips 直 SELECT（owner/mgr）／月→日付は既存 `period_bounds`。**A4 の DB
変更は mig0054 の読取 RPC 1本のみ**（新テーブル・新列・backfill いずれもなし）。

**A4 の外（境界）**：分析タブ（着地予測）＝C5・会計連携 CSV（freee/MF）＝C3・本部連結＝C2＝いずれも post-launch。

**検算（rls A4段）**：`get_store_nom_counts(通期)` == `get_cast_ranking` の店合算（縮退が値を変えない）・
半期split の前期+後期=通期・相席の複数指名は指名行数でカウント（ranking と同一基準）を実呼びで実測。

**UI 実装での確定追記（2026-07-21・UI フェーズ後）**：
- **客単価の分母＝売上/来客数（guests）**。モック現物 `sales/guests` に準拠（当初「売上/組数」指示を相談役が
  訂正・per 客定義とも整合）。
- **人件費/人件費率＝通期のみ表示・前期/後期は「—」**。NOX payroll は月次確定（日次労務費なし）ゆえ半期split
  が構造的に不可。他7指標の半期split との非対称は UI 上「—」で明示。
- **staff 役割別マスキングの視覚確認は台本残**（owner→staff 再ログイン時に消化）。実装は `if(isManagerUp)`
  分岐で人件費/人件費率2行を非追加＋payroll RLS が staff に 0行の二重ガード済み。
- 指名(本)＝**hon+jonai**（同伴=dohan は別行ゆえ除外・二重計上回避）。モックの `shimei` は合成データで
  分解不能のため、同伴別行との整合からこの解釈を採用。

## 裁定13：C1 手渡し＝案A（既実装で充足・クローズ）（Agoora 承認・2026-07-21）

C1 照合フェーズ（Opus・読取のみ・live DB ＋ repo 現物照合）の結果、**C1 は新規 mig・UI ゼロで
クローズ**。C1 の実体（日報／レジ現金実査／per-cast 手渡し）は DB・write RPC・UI 結線とも既に
存在し稼働している。

**既実装の内訳（照合フェーズ実測・現物根拠）**：
- **②レジ締め（現金実査）＝`daily_report_close`／`daily_report_reclose`**（`report-board.tsx` に結線済）。
  `diff = counted − (float + cash − expense − payout)`（prosrc コメント逐語「モック H=Oi−q と同一」）。
- **③per-cast 手渡し＝`payment_record_add`**（`payslips.net` 読取で `Σpaid_amount ≤ net` を構造保証＝
  モック「残り＝net−手渡し累計」を担保／run finalized ガード）。payroll の `payment-panel.tsx` に結線済。
- **①日報集計＝`daily_reports`**（`expense`/`cash_payout`/`cash_float`/`counted_cash`/`diff` 列完備・
  集計は `daily_report_aggregate`＝STABLE 読取）。
- いずれも **checks/payments 中核を変異させない**（daily_report_close は daily_reports へ INSERT のみ・
  payment_record_add は payment_records へ INSERT のみ）。二重防御／監査（audit_log_write）／冪等 完備。
  ACL＝authenticated（anon revoke 済）。

**★裁定8 の式の訂正（教訓D 適用）**：裁定8 は C1 を「現金売上−諸経費−現金支払＝当日支給」と定義して
いたが、**モック canonical 現物の復元走査の結果、この式に対応する単一ブロックはモックに存在しない**
（「当日支給」の語は 0 件）。モック現物は
(a)**残現金＝現金−諸経費**（本日の日報）、
(b)**レジ締め理論在高＝釣銭準備金＋現金売上−諸経費−現金支払**（レジ金の締め・現金実査）、
(c)**per-cast 手渡し／残り＝net−手渡し累計**（手渡し給料の記録）
——の **3 別物**。→ **モック現物を正とし、裁定8 の C1 式は「上記 (a)(b)(c) の 3 ブロックを指す」と訂正**。

**モックとの配置差＝post-launch 候補として記録**：モックは 3 ブロックを report（日報）1 画面に同居させるが、
NOX は ③ のみ payroll 画面に分散配置。**機能欠落ではなくレイアウト差**。日次（biz_date）画面から
月次（payroll_run）スコープの手渡しを触らせる**意味論衝突を避けるため現状の分散配置を維持**。
UI 統合は post-launch の UX 改善候補。

**このクローズは docs 追記のみ＝コード/mig 変更なし**（HEAD 37d7d90・verify:f0 1915 全緑・3ゲート
83/52/112 不変を照合フェーズで実測済み）。

## 裁定14：B6 売掛回収＝完全形（方向1確定・Opus 起草）（Agoora 承認・2026-07-22）

B6 設計提案フェーズ（相談役レビュー完了・推奨案一式承認）の裁定。DB 層＝mig0055（起草着手・Downloads 残置・
相談役レビュー→承認→手貼りの順・本裁定時点で手貼り未指示）。

**要件（Agoora 確定・除外なし）**：回収→帳簿反映まで・給与天引き（本人同意）含む**完全形**。法務は並行相談中で
**実装をブロックしない**（enforcement は差し替え1箇所で後付け）。

**★方向1 確定**：回収した日の帳簿に現金 in を計上・**発生日（元売上日）の凍結日報 daily_reports は不可侵**
（遡及不可）・snapshot モデル（daily_report_aggregate は payments を biz_date 窓集計する派生値）を壊さない。
方向2（発生日遡及）は不採用。

**★money-core 接触＝空**：checks / check_lines / payments を**1文字も変異させない**。慎重域は report-layer
（daily_report_aggregate/close/reclose）のみ＝**Opus 起草可**（Fable 5 はキオスク＝裁定11 の真性案件に温存）。

**設計1〜7 の確定（推奨案一式）**：
- 設計1＝**案1-A 全額回収のみ**（partial なし・collected_amount 列を作らない＝payroll_finalize の
  deducted_amount 上限式に非波及・モック「回収」全額と教訓D 一致）。RPC＝`receivable_collect`。
- 設計2＝**案c 独立テーブル `ar_collections`**（payments/checks 不変）。★**現金は別掲**（cash 売上に混ぜない
  `daily_reports.ar_collected` 新列）／`daily_report_close` の diff 式に ar_collected を加算し理論在高を整合
  （`diff = counted − (float + cash + ar_collected − expense − payout)`・ar_collected=0 で従前式に一致＝後方互換）。
  現金回収のみ理論在高加算（method='cash'）。遅延回収は `daily_report_reclose` が再集計で拾う。
- 設計3＝**案3-A 受領単位 consent**（`receivables.consent_at/consent_by`）。RPC＝`receivable_mark_deduct`
  （deduct_from_cast 印付け＋consent 記録・状態冪等）。実減算は既存 `payroll_finalize`（ar_deducted 消費）で
  **無改修**。差し替え1箇所＝`consent_ok(receivable_id, consent)` 単一関数。
- 設計4＝**案4-A `receivables_select` の cast 腕を除去**（cast＝receivables 0行・pattern2 復帰）。
- 設計5＝**check_void 既済**（回収済 `status in ('collected','deducted')` 拒否ガードが live に存在＝**改修なし**）。
- 設計6＝**案6-B 発生 enforcement は `ar_policy_ok(store, amount)` 空フックのみ設置・★check_pay へは結線しない**
  （money-core 保全）。#38 弁護士後に別 mig で check_pay の ar 分岐 INSERT 直前へ1行挿入（差し替え1箇所）。
- 設計7＝**案7-A report 画面に暫定売掛タブ**（UI フェーズ・post-launch で C3 仕訳画面へ移設）。

**★cast RLS 案4-A は「放置不可の必須」**：現状 `receivables_select` は cast(can_register) に SELECT を許し、
**cast が他人の客売掛＋customer_id を閲覧可能＝live に存在するプライバシー設計違反**（payOf 設計 §110 の
「cast パターン2＝生売掛 0行」に反する）。mig0055 で cast 腕を除去して是正。cast は payslip.breakdown_json.ar
で自分の天引き額のみ参照（既存・/mine は生 receivables を読まない＝app 実測）。

**差し替え1箇所（法務後・署名不変で本体差替）**：
- `ar_policy_ok(store, amount)`＝#38 風営法2025 売掛規制（可否/上限）。現状 無条件許可・未結線。
- `consent_ok(receivable_id, consent)`＝労基法（全額払い・本人同意・撤回）。現状 渡された同意フラグ要求のみ。
- 記録保持期間（#38 Q2）＝ar_collections/receivables の保持ポリシー（運用・別軸）。

**段1 会計一貫性の検算（起草前・read-only・三者突合が閉じる根拠）**：
- daily_report_aggregate の live prosrc 再確認＝`uri` は method='ar' の payments を**発生日（checks.started_at の
  biz_date 窓）で集計**＝掛売は**発生日日報の売上（uri）に既に計上済み**（Yes）。
- 突合の閉じ：**発生日**＝uri に売掛計上（売上・一度きり）／**回収日**＝ar_collected に現金 in（別掲・売上非計上・
  理論在高加算）／**未回収残高**＝receivables 直 SELECT で `Σopen(amount − deducted_amount)`。回収で売上を立てない
  （別掲）ため**発生日 uri との二重計上が構造的に起きない**。残高（receivables 直）と日報集計（uri/ar_collected）は
  別経路だが、uri＝発生の売上・ar_collected＝現金化イベントで**意味が直交**し矛盾しない（突合可）。
- 天引き整合：payroll_finalize が `deduct_from_cast=true ∧ status='open'` を消費し全額で `status='deducted'`＝
  未回収残高の open 条件から正しく落ちる（回収 collected と天引き deducted は排他的終端）。
- 判定＝**閉じる**（案c で三者突合が会計的に成立・UI に「回収現金と売上現金の別掲表示」要件が付くのみ＝
  日次サマリで cash と ar_collected を分けて見せる）。

**起草状態（2026-07-22）**：mig0055 全文起草済（Downloads・sha256 52cdce50…dadf4e9・35293 bytes）。money-core
非改修は本文の check_pay/check_close/check_void 非収載で構造保証。**相談役レビュー→承認→Agoora 手貼り**の順
（手貼り未指示）。verify 追加（TABLES 配列へ ar_collections・rls の cast 0行・anon-guard 新2 RPC・grants G29）は
適用後フェーズ。

## 裁定15：レジ用キオスク（N1-b）＝完全形＋ゲート null-safe 修正（Agoora 承認・2026-07-22）

裁定11（案A＝F4a 型拡張）の実装フェーズ。DB 層を3 mig で確定＝**mig0056（基盤層）/0057（arms 層）/0058（ゲート null-safe 修正）**。

- **mig0056（基盤層）**：端末認証層。新テーブル2（`staff_pin`/`kiosk_sessions`・deny-all）・`kiosk_devices.purpose` 列（'punch'/'register'）・index 差し替え（1店1→1店1×purpose）・打刻締め（`kiosk_punch`/`auth_kiosk_store_id` に purpose='punch'）・新ヘルパー2（`auth_kiosk_register_store_id`/`auth_kiosk_operator`＝60秒スロットル idle touch・15分失効）・新RPC4（`kiosk_login`/`kiosk_logout`/`kiosk_operator_list`/`set_staff_pin`）。sha256 `278c92ab…59be`。
- **mig0057（arms 層）**：会計RPC12本＋`audit_log_write` に kiosk 腕（null guard 二重化・org coalesce・gate 第5腕・actor coalesce の4点のみ＝money 写経逐語）。`check_void` 対象外（確定①＝取消は manager 権限）。sha256 `9d30f9f5…c567`。
- **★mig0058（0057 supersede）**：0057 の kiosk ゲートに **null-auth fail-open** が判明（Phase 3 実 device runtime probe で検出）。修正＝12ゲートの `if not (OR連鎖) then raise` → `if (OR連鎖) is not true then raise`（1トークン×12・money/腕は byte 同一）。sha256 `9d3b18dd…058b`。

**fail-open の機構**：kiosk セッションは `auth_role()=null`。ゲート `if not (auth_role()='owner' or … or kiosk腕)` で kiosk腕が false のとき `(NULL or … or FALSE)=NULL`・`not NULL=NULL`→raise 不発＝**他店 seat・idle 失効・logout 後でも会計RPC が通る**（他店 checks への INSERT が実際に成立）。0043 以前は素の `auth_org_id()` null-guard が null-auth 呼び手を全弾いていたため露呈せず、0057 が guard を coalesce 弱体化した結果ゲートに到達して顕在化。詳細教訓＝**F0 セキュリティセルフレビュー §7.1**。

**検証**：0058 runtime 全緑（probe 42/42・fail-open の3経路＝他店/idle/logout が forbidden に反転・正経路不変）・verify:f0 **1973 全緑**（3ゲート pay83/receipt52/payroll112・golden 54400 不変）。DB 層 repo 収載（0056/0057/0058・Downloads=repo byte 一致）＋恒久 verify（anon-guard 段35b/段37・grants G30/G31）でクローズ。UI 層（register kiosk 画面）は別コミット。

## 裁定16：v1.0.0 精査結果＝バックエンド乗換不可・デザインのみ移植（相談役精査・Agoora 承認・2026-07-22）

Agoora が別ツールで生成させ持参した `nox-v1.0.0`（Vite+React19 SPA ＋ 独立 Node server ＋ 単一 `supabase/schema.sql`・Docker/PWA/CI/E2E）を相談役が全ファイル現物精査（schema.sql 953行・server 認可層・UI シェル）。

**★結論＝デザイン/情報設計は採用価値あり／だが「これを新 NOX にする（バックエンド乗換）」は不可。** 現行 NOX（Next.js・mig0001〜0059・payOf golden・3ゲート・キオスク）を**土台として維持**し、v1.0.0 からは**デザインのみ移植**する。皮（デザイン）は運べるが、この保証レベルのバックエンドは安く作り直せない。

**乗換不可の根拠（全て現物確認）：**
1. **認可ガード皆無（CRIT）**：全 SECURITY DEFINER RPC（`finalize_ticket`/`close_payroll_with_snapshot`/`apply_payroll_adjustments_to_snapshot`/`confirm_attendance_batch`/`queue_payslips`/`check_in_reservation`/`merge_customers`）が引数 `p_store_id`/`p_actor_id` をそのまま信頼し `auth.uid()` 照合ゼロ＋schema に `revoke execute from anon` 一切無し → ブラウザの anon キー（`VITE_SUPABASE_PUBLISHABLE_KEY`）で PostgREST `/rest/v1/rpc/*` を直叩き＝Node 認可層を丸ごとバイパスし任意店舗に会計済み伝票書込・給与締め・顧客統合・actor 偽装が可能。＝#2/#28（revoke from public,anon 必須）＋null-guard-first＋0058 fail-closed で潰したばかりの穴の横断再導入（多層防御が逆立ち＝ガードがアプリ層のみ・DB 面は無防備で公開）。※ Node 側（requireAuth＋requireStoreRole・actor サーバ由来）の設計は良いが、実際に money を変異させる DB 面が独立に公開・無ガード。
2. **money クライアント信頼（CRIT）**：`finalize_ticket` が service_charge/tax をクライアント値のまま信頼（店舗設定から算出せず）→ 0 送信で過少請求。
3. **冪等 TOCTOU（HIGH）**：`on conflict do nothing` 後にロック内再チェック無し（教訓F）＋'processing'→'completed'/response_data 未更新＝並行リプレイ二重書込・重複排除不成立。
4. **報酬モデルが別物**：`close_payroll_with_snapshot` は worked_minutes×hourly_rate＋sales_back の単純給与で payOf（hon/jonai/dohan/drink/champ/bottle バック・ratio_weight 指名・源泉・売掛/前借/送り天引き・丸めモード）を何一つ持たない＝乗換は payOf golden(54400)・3ゲート・キオスク 0056〜0059 を全部捨てることになる。
5. **フロント未接続プロトタイプ**：`App.tsx` は `serverApi`/`repository` を一度も呼ばず `useState` 配列を書き換え `notify('…しました')` で成功を演出するだけ＝綺麗な SPA ＋ 未接続 Node/Supabase の二枚で動くシステムではない。
6. **schema 非互換**：`tickets/ticket_items/store_memberships/casts.display_name` … 現行 `checks/check_lines/memberships/casts.name` と別世界（積み増し不可）。

**採る価値（公平評価）：** デザイン/情報設計（一貫したアンティークゴールド×漆黒・フル responsive＝PC サイドナビ→スマホ下タブ＋ボトムシート modal）＝移植対象／読取 helper `is_store_member`/`has_store_role` は `exists(…=auth.uid())` の二値 fail-closed で正しい（読取 RLS は無事・穴は書込 RPC の内側ガード欠落）／Node 認可層・ops 基盤（Docker/CI/PWA/backup/runbook）は参考・流用価値あり。

**★不変規約：**
- v1.0.0 の `schema.sql`/RPC は **dev/本番 DB に絶対当てない・参照専用**（非互換・認可ガード無し）。
- 純増機能候補（在庫台帳/CRM/予約+同意/会計エクスポート/インフラ基盤）は**設計参考のみ・実装は現行流儀**（null-guard 先行＋`revoke from public,anon`＋新テーブルは authenticated 書込も revoke＋RLS/SECURITY DEFINER 新規）。v1.0.0 の schema/RPC は認可ガード無しゆえ流用不可。起票は**デザイン移植の後**（器＝画面が決まってから）。
- デザイン移植は**見た目だけ**＝RPC/RLS/payOf/キオスク非改変・各段で verify:f0/3ゲート/golden 不変を確認。框（Next.js＋硬化 RPC＋キオスク）の乗換はしない。フォント/厳密 hex（現行 Outfit+Zen Kaku Gothic New+gold `#C9A24A`/bg `#0B0B0F` vs v1.0.0 Inter+Georgia+gold `#d9b76d`/bg `#07070b`）は **Agoora 裁定点**。

**レーン順序（確定）：** ①給与（N1-c：D3→D2→D1・D1 は相談役設計必須）→ ②デザイン移植 → ③純増機能起票（★②の後）。①と②は競合しない。

**N1-c 進捗（現物・2026-07-23 時点で更新）：** D3 給与明細CSV は **landed 済み**（HEAD `fb1f217`・`lib/nox/payroll/csv.ts`＋`payroll-board` UI＋純関数テスト25本・**verify:f0 1990→2015**・golden 54400 不変）。裁定8 の N1-c ＝D3→D2→D1 のうち **次は D2 報酬明細PDF**、その次 **D1 給与確定解除**（money-core の確定状態を触る＝相談役設計必須・Fable 5 案件）。

## 裁定17：D1 給与確定解除 payroll_reopen＝finalize (B) 逆適用・6裁定（相談役設計・Agoora 承認・2026-07-24）

N1-c 給与レーンの最終 RPC（D3 給与明細CSV / D2 報酬明細PDF に続く D1）。money-core の確定状態を触るため **Fable 5 起草**・Opus は段階0 調査／route／プローブ／恒久 verify／UI を担当（相談役案内どおりの分担）。**mig0060 単一**（`reopen_idem_key` 列＋`payroll_reopen` 関数）。

**設計確定6点：**
1. **対象 = finalized のみ**。paid は `'run paid'` で全面拒否（paid→finalized の逆遷移は作らない＝完全ロック・finalize の 'run paid' と同語）。
2. **payment_records 1行でも `'payments exist'` 拒否**（finalized run にも支払記録が付きうる＝payment_record_add が finalized/paid で記録可・Σ≤net は RPC 内制約のみ・DB 制約/トリガなし。draft へ戻すと不整合ゆえ）。
3. **逆適用 = finalize (B) 巻き戻しの逐語写経**（live `pg_get_functiondef` から機械抽出51行・byte 一致・migファイル非経由）＝ar/adv/okuri を drift-safe 条件付き UPDATE（`WHERE status=applied_status AND deducted_amount=applied_deducted_amount AND deduct_period is not distinct from applied_deduct_period`）で `prev_*` へ復元。**手で動いた行は非接触**（found のみ `rolled_back_*` 記録）→ payslips delete →run を draft 不変量（`period_start/end`・`finalized_at`・`finalize_idem_key` 全 NULL）＋`reopen_idem_key=p_idem_key`。
4. **原則9 ガード順序**：null-guard → run not found → org 照合 forbidden → paid → 冪等 replay（draft＋同 idem→`'draft'` 静か返し）→ not finalized → payments exist。F0 §7.1 適合（否定 OR 連鎖ゲートなし）。
5. **service 経路**：`SECURITY DEFINER`・`revoke from public,anon,authenticated`・`grant service_role のみ`。route `/api/payroll/reopen` は **owner 限定**（`decideTaxReportAccess`＝支払調書CSV と同じ最狭・finalize の manager+ より狭い）・idemKey 必須。
6. **監査**：`audit_log_write_service` action='payroll_reopen'・before `{retired_payslips, old_finalize_idem_key, old_period_start/end, rolled_back_receivables/advances/transport}`・after `{status:'draft', reopen_idem_key}`＝finalize と対称の完全記録。

**冪等キー型**：`reopen_idem_key uuid`（起票 text 表記だが finalize_idem_key/paid_idem_key uuid・`p_idem_key uuid` との対称・無 cast 比較のため uuid＝相談役承認）。

**検証**：runtime プローブ 28/28（正経路サイクル ar+adv+okuri prev 復元・payslips 0・run draft 全 NULL＋reopen_idem・再 finalize 同結果＝サイクル冪等・拒否6種・drift 非接触＝rolled_back 不掲載・監査 before/after・anon/authenticated BLOCKED）。恒久 verify＝grants G8c（service_role のみ/署名一意/reopen_idem_key 列 +3）・anon-guard 段11c（anon/authenticated 両 BLOCKED +2）・payroll reopen サイクル段（+8）＝**verify:f0 2015→2028 全緑**（3ゲート pay83/receipt52・golden 54400 不変・payroll は 112→120 で reopen 段追加）。mig0060 repo 収載 byte 一致 sha256 `9c19b931…e85651`。UI＝payroll-board「確定を解除」（owner のみ・finalized のみ・payment_records ありは無効化＋理由・確認ダイアログ・成功後 loadRun 再発火）。

## 裁定18：デザイン移植レーン完了（正本 DESIGN_MASTER.html v1.2.0・全段 presentation-only・Agoora 目視OK・2026-07-27）

正本＝`Downloads/nox-v1.2.0-design-master/DESIGN_MASTER.html`（v1.2.0）。全段 **presentation-only**（RPC/RLS/payOf/golden 非改変・**verify:f0 2028 不変が gate**・canonical 13トークン維持・断点 641/900/1180・裁定5＝DESIGN_MASTER の 768 は非拘束）。共有 canonical＝`lib/nox/ui/theme` の `avatarInitial/avatarBg`＋`globals.css` の `.nox-modal-*`/`.nox-detailwrap`/`.nox-quickgrid`/`.nox-tilegrid`/`.nox-wgrid`/`.nox-chip`/`.nox-ava`/`.nox-medal`/`.nox-switch`。

**完了段（push 済み・前半 `90e7846..420df53`／後半 `420df53..8b6fd40`）：**
- **段A 基盤**（`05a0c80`）：`ui/modal` を ≤900px ボトムシート化（`.nox-modal-*`・可変値は `--wrap-max` 流儀の CSS 変数橋渡し・>900 は中央オーバーレイ 1px 不変）・断点明文化・canonical 13トークン byte 一致再確認。
- **段H home**（`e4acc48`）：home コマンドセンター化＝クイックアクション9本（既存ルートへの純ナビ・role gate は nav 逐語同一）＋情報整列。「すべて見る」Modal は二重化ゆえ不採用。
- **段B register**（`420df53` 束）：商品プルダウン→ `type` 別タイル＋**連打束ね**（共有フック `use-tap-batch`＝直列 flush の in-flight promise チェーン・700ms・`p_qty=N` で1行・不変量「タイルバッジ=pre-commit／明細行=commit 済＝二重計上しない」）・指名チップ・伝票詳細 ≤900 ボトムシート・滞在タイマー（register floor は `loadOpenMap` select に `started_at` 追加）。
- **段C shift**（`ee7b1f6`）：週グリッド overview（既存 `shifts` の client 再形・`.nox-wgrid`・読取専用）。
- **段E 売上顧客分析**（`40173b0`）：customers 一覧に頭文字アバター・analytics 2ランキング表の順位にメダル。report 日報は締め workflow で対象外。
- **段F casts/mine**（`631359b`）：casts 一覧にアバター・mine ranking にメダル。**★cast privacy＝情報集合を現行と完全一致**（アバターは既存 name 頭文字のみ・title/aria にも新情報を出さない）。
- **段G master/staff**（`8b6fd40`）：master の `is_active` トグルを canonical スイッチ化・staff 名簿にアバター。

**段D payroll＝対象外裁定**：`payroll-board`／`components/payslip-slip`（`/mine` と共用）は既に DESIGN_MASTER `.slip` 系の canonical 翻訳・**D2 印刷 CSS が payroll-board ルート `.nox-printpage` の直下構造 `> *:not(.nox-print)` に依存**・**money 表示中枢（数値・計算・丸め・並び・集合を1文字も変えない）**＝restyle は印刷/両 consumer/数値に波及するため**保守側で現行維持**（相談役裁定・2026-07-27）。

**対象外／純増起票（新規データ取得・RPC・集計を要するもの）**：notices（連絡ボード＝当てる component なし）・audit（現行 canonical）・analytics チャート/ヒートマップ/AI再来店DM/予測・shift 月間出勤実績カレンダ/週間 attendance グリッド/日週月ナビ/AI最適化/打刻照合・kiosk floor 滞在タイマー（`kiosk_register_state`(0059) 拡張要・純増⑦）・「会計待ちN分」（スキーマ不在）・register カテゴリマスタ（`products.category` フリーテキスト＝type 分類で presentation 成立）。

**付随ハーネス修繕（verify のみ・デザイン外）**：dev auth の **ES256 kid<nil> 間欠**（admin API 全般＝createUser/deleteUser/listUsers に波及しうる）＝`verify-nox-anon-guard` の `createUserWithRetry` に有界リトライ（`b3a4118`/前半束）＋**succeeded-but-errored の lookup 救済**（裁定C・`a2687d6`＝kid<nil> 後の `already registered` は該当 email を lookup して成功返し・誤吸収防止に `sawKidNil` ガード）。`audit_logs` は append-only ゆえ多数 run で肥大（1 org 39390行→`seed_marker` が select 1000 窓外→rls 落ち）＝verify org の非 `seed_marker` を service role で掃いて復旧（`seed_marker` 保持）。

## 裁定19：UI刷新v2 レーン完走（全13段 push 済み・presentation-only・Agoora 目視OK・2026-07-28）

正本＝`NOX_UI刷新v2_デザインガイド.md`（sha256 `01096c7b…2407`）＋**モック12枚**。
全段 **presentation-only**（RPC/RLS/payOf/golden 非改変・**verify:f0 全緑が gate**＝2028→**2136**）。
canonical 13トークンの**値は不変**で、変えたのは運用ルールと明度系サブトークン（`--v2-text/-muted/-panel2/-line/-ava`）のみ。断点 641/900/1180（裁定5）。

**完了段（実装順どおり・すべて push 済み `2568c92..8a3e584`）：**
S-1 シフト → N ナビ再編＋文言統一 → P キャスト写真 → S-2 予想人件費 → H2 ホーム → R2 レジ →
C2 キャスト → U2 顧客 → A2 分析 → L2 軽量4頁（日報/お知らせ/スタッフ/監査）→ M2 マイページ →
K2 キオスク（restyle は R2 で先行・K2 は残差分）→ **Y2 給与（最後・最厳格）**。

**本レーンで確立した横断ルール：**

- **可読性ルール（案A・ガイド §1）**＝①読む情報（金額・名前・数量）は白 `#F2F0EB`・Outfit 600・一回り大きく
  ②**金 `#C9A24A` は3役だけ**（選択状態／主ボタン／バッジ）＝見出し・金額の常用は禁止
  ③明度系サブトークンを1段明るく ④状態色は green/gold/red のみで**新色を作らない**
  ⑤最重要数値（合計・net）は 20〜24px。適用時は機械 grep（`var(--champ)`）で洗い出して逐一判断する。
- **段P＝Storage 初導入**：private バケット `cast-photos`（2MiB・image/jpeg）＋`storage.objects` ポリシー3本
  （select=同 org／insert・update=**owner ∨ manager∧自店 ∨ cast 本人**・**delete なし**＝上書き運用）
  ＋`mig0064`（`casts.photo_updated_at`＝null で写真なし 兼 キャッシュ世代）＋`mig0065`（打刻 RPC
  `set_cast_photo_updated_at`）。★**`casts` は authenticated に SELECT しか grant されておらず UPDATE
  ポリシーも無い**ため client 直 update は grant/RLS の二重で不可＝申告停止→RPC 化で解決。
  **Storage 側と RPC 側の authz は同一式**（片肺状態を構造的に作らない）。手貼りリストに Storage 節を新設。
- **S-2＝労務予測の純関数**（起草 Fable 5）：`lib/nox/labor-forecast.ts` `forecastDay()`。
  ★時給解決は **`pay.ts` の既存 export を再利用**（シフト1本を sales=0/pts=0 の `DailyRecord` として
  `wageDetail` に渡す）＝参照実装を書かないためドリフトが構造的に起きない。丸めは payOf 規約
  （cast ごと `roundYen` の整数和）。**golden 55233**（payOf の 54400/wage5931 とは別系統・非接触）。
- **Y2＝凍結値 Σ は presentation 扱い**（裁定）：確定済み `payslips.breakdown_json` の合計だけを
  カード化してよい。定義は **D3 CSV の `payrollCsvCells` と逐語同一**にすること。
  ★**率計算・丸め直し・net との整合補正は禁止**。★`payroll_finalize` は実績ゼロの cast に
  `pay = {"net":0}`（他17キー欠落）を書くため**欠落キーは 0 扱い**（`?? 0` の既定のみ許可）。
  導入時は **Σnet と Σgross−Σ控除計 の一致を dev 実データで検算**して数値を残す
  （実測＝2026-09 run 33,924−4,953=28,971=Σnet ／ 2029-01 run 0−0=0=Σnet・不一致 0 件）。

**「現物に無いものは作らない」で見送った項目（各段で明示・発明しない原則）：**
H2 の時間帯別不足（`staffing_needs` は store×dow のみ）／C2 の待遇編集（マスタ管理が現行）／
A2 の売上内訳4分類（`daily_reports` の内訳列は `drink_sales` のみ→2分類に留置）／
R2・K2 の kiosk 低在庫「残N」と着卓キャスト顔（**0059 が在庫も指名も返さない＝0059 非改変を優先**）／
K2 のカテゴリチップ化（絞り込み機能の新設になるため未実装・要裁定）／
L2 のスタッフ写真（段P は cast_id 由来のキャスト専用）／M2 の「1位まであと3件」（他人の数字）。

**運用上の教訓：**
- **正本名が指示と一致しないときは必ず止める**（R2＝`planA-readable` が未配置で v1 しか無く、
  kiosk モックが「案A 可読性ルール」を参照していたことが決め手＝申告停止→配置後に着手）。
- **段の取り違えも止める**（C2 完了時に「U2 push」と指示され、未 push の実体が C2 だったため
  push は実行しつつ U2 未着手を申告＝台帳に虚偽を書かない）。

**別レーン切り出し（バックログ）**：`payrollCsvCells` は `breakdown_json` の欠落キーで **NaN 露出**
（実績ゼロ cast を含む確定 run の D3 CSV で発生）＝凍結値 `?? 0` の同型修正＋csv25 gate で別途。

## 裁定19-b：UI刷新v2R レーン完走（裁定19 の補正・土台リワーク＋全14画面の載せ替え・2026-07-30）

裁定19（v2）は**画面単位の restyle**だったが、シェルとトークンの土台が画面ごとに揺れていた。
v2R は**土台を先に作り直し（段0R）、そこへ全画面を載せ替える**方針に補正したもの。
**すべて presentation-only**（RPC/RLS/payOf/golden 非改変・**verify:f0 2136 全緑が gate**・golden 54400 / wage 5931 不変）。
正本＝質感 `aaa.html`（sha256 `dc2da951…ad9c`）＋構成モック（画面別 redesign-mock）。断点 641/900/1180（裁定5）。

**完了区分（すべて push 済み `7c26602..30d2c6b`）：**
段0R 土台（共通シェル `.nox-tb`／`.nox-layout`／`.nox-mainarea` max-width 1480・/master ハブ＆ビュー切替・
`:target` 折り畳み全廃・パネル最外殻 `maxWidth` 撤去＝**幅は親が決める**）→
**第1陣** home（実体は `/dashboard`）・register・casts → **第2陣** customers・analytics・payroll →
**第3陣** light4（日報/お知らせ/スタッフ/監査）・mine（`nox-minewrap` 430px 1カラム）・kiosk-register。
共通骨格＝`nox-hero`／`nox-kpis`+`nox-kpi`／`nox-panel`>h3（白）／`nox-ctoolbar`／`nox-seg`。

**本レーンで確定した追加裁定：**

- **金の3役に「KPI 強調」「バー強調」は含まれない**（裁定19 の可読性ルール②の適用範囲を確定）。
  `.nox-kpi.money` の gold 枠は撤去（class は意味づけマーカーとして残置）／`.nox-kpi.warn .val` は `--bad`／
  `.nox-bar.hi` は薄金の面＋金の枠（ベタ金グラデを廃止）／payroll 合計バーは panel 地＋白太。
  ★`theme.ts` の `slipFoot`（金帯＋黒文字 `#0B0B0F`＝6ec1235 の公認 hex）と `payslip-slip.tsx` は**非改変**＝
  帳票（`ps-foot`・print CSS が反転）の配色を変えるかは別裁定。
- **payroll runbar の acts は現状維持**（モックの「runbar 内に CSV/印刷/解除/確定の4ボタン」は**不採用**）。
  理由＝D1 解除は説明文＋支払記録メッセージ付きの赤枠カード、D2 印刷は「読み込む→印刷」の2段フロー、
  確定はプレビュー後のみ出現であり、忠実な格納はボタン重複・危険操作の最上部昇格・確定ボタンの常時表示化の
  いずれかを要して「ボタン/機能/権限出し分け完全不変」と衝突する＝**money 安全設計を見た目より優先**。
- **kiosk のカテゴリチップは実装可**（裁定19 では「絞り込み機能の新設＝要裁定」として見送っていた）。
  register 側で先に実装し、**表示フィルタに限定＝タップ注文の連打束ねと送る引数は不変**と確認できたため。
  0059 非改変（低在庫「残N」・着卓キャスト顔を出さない）は**引き続き維持**。

**★grid の defect class（水平展開の対象・以後の設計則）：**
`grid-template-columns: 1fr Npx` を**無条件**に当て、右ペインを条件描画すると、未描画時に空列が残り
左カラムが痩せる（実測＝kiosk フロア 684/1100・register 1044/1440）。さらに**旧 flex 時代の `min-width` は
grid では列を超過してはみ出す**（register 伝票 480px vs 列 380px＝**100px 超過**）。
**是正型**＝`.withdetail` 修飾子で**開いているときだけ2列**にし、`> *` を `grid-column: 1 / -1` 既定にして
**列を受け持つ子だけ**に明示割当（`> .nox-regfloor` / `> .nox-detailwrap` ＋ `min-width: 0`）。
★1箇所直したら**同型を全画面 grep して水平展開**する（kiosk `nox-kmain` → register `nox-regmain` の順で是正）。

**★検収の教訓：**
- **CSS を入れても JSX が使わなければ見た目は変わらない**（`nox-sumrow` が CSS のみ landed で JSX 未適用・
  `nox-punchrow` も同型）。**完了報告は「ソース参照数＋ビルド成果物 server/client 両方の文字列出現数」まで**。
- **データ状態依存の見た目バグは空状態の検収では捕まらない**。`DrinkClaimQueue` が grid 直下の子だったため
  pending≥1 で「キュー→1列目・フロア→380px」に崩れたが、検収時 pending 0 件で潜伏した。
  **「0件」だけでなく「1件以上」の状態も検収項目に含める**。
- **dev 稼働中は `next build` 禁止**＝検証ビルドは `NEXT_DIST_DIR=.next-build` で分離し、
  build が書き換える `tsconfig.json`（`.next-build/types` の include 追加）は**復元して非コミット**。
- **ログイン後画面の実測は合成計測で代替可**（配信 CSS を実 DOM 構造に当てて幾何を測る）。
  実データ確認は人間の検収に回す。

**運用検収へ持ち越した項目：** analytics 日別バーの目視（要 締め済み日報）／payroll 宿題＝sums 4カード目視・
段Y2 金額突合・D2 印刷・D1 解除（要 税区分登録→2026-07 確定）／mine スマホ実機／kiosk の2状態／
register の承認キュー1件表示。

**未解決として残した項目：** audit の2セレクトは**別機能**（① `actionFilter`＝サーバクエリの `eq("action")`／
② `kindFilter`＝取得済みページの client 系統絞り込み）＝重複ではないためラベルで解決（「action で絞り込み」/
「操作系統（表示中のページ）」）。payslip 帳票の金帯配色は別裁定。

## 裁定20：D2 印刷の末尾空白ページ＝印刷CSSがUI刷新v2R後のシェル名に未追随（原因確定・是正済み・2026-07-31）

- **症状**：確定済み給与（CLUB NOX / 2026-07 / 6名）を Chrome A4・余白既定で印刷すると
  **7ページ**（スリップ6枚＋末尾に白紙1枚）。
- **実犯＝`.nox-mainarea` の `padding-bottom: 28px`**。印刷実測（Chrome の CSS media type: print
  エミュレーション下）で確定：`lastPage.bottom = 1904` / `printpage.bottom = 1904` /
  `section.bottom = 1904` に対し **`mainarea.bottom = 1932`・`bodyScrollH = 1932`**、
  かつ**最終スリップより下に高さを持つ要素はゼロ**（空配列）。差分 28px が余白そのもの。
- **根因**：`@media print` の 1442-1444 が旧シェル名 `.nox-topbar` / `.nox-main` を対象にしたまま。
  UI刷新v2R で `(manage)` は `.nox-tb` / `.nox-mainarea` / `.nox-side` / `.nox-layout` へ載せ替わり、
  **印刷 CSS だけが追随していなかった**。`.nox-main` は `/payroll` に存在しない。
  `/mine` は旧シェルのままなので**旧名ルールは削除せず併存**させた。
- **是正**（21b94fa・追加9行のみ・削除変更ゼロ）：`.nox-tb, .nox-side { display:none }` /
  `.nox-layout { min-height:0 }` / `.nox-mainarea { padding:0 }` を `@media print` に追加。
  DOM・JSX は無改変（段D 対象外裁定＝`.nox-printpage` 直下構造依存を維持）。
- **`.nox-layout` の `min-height: 1001px`** は今回は A4 高さ未満で不発だったが、
  **スリップ1〜2枚のとき同型の白紙を生む地雷**として同時に潰した。
- e7a9406（`.nox-print-page:last-child .nox-payslip { margin-bottom:0 }`）は**実犯ではなかったが
  残置**（最終スリップ直後の余白を削る効果自体は正しい）。
- **検収**：是正後の実測で **6ページ**（Agoora 目視・2026-07-31）。
- 経緯：`.nox-tb` / `.nox-side` は候補に挙げたが**実測で棄却**（`bottom` が 931 / 1640 で
  最終スリップ 1904 より上）。再発防止として明示的に消しただけで、今回の白紙には寄与していない。
- コミット: e7a9406 → 21b94fa（+ aab022b `.gitignore` に `~$*`）／verify:f0 2142 全緑・golden 不変。

**★起草教訓（本裁定から一般化）：**
- **シェルのクラス名を変えるリファクタは、`@media print` の追随確認を必須とする。**
  verify は print CSS を射程に持たないため、**緑のまま数か月潜伏した**。
- **カスケードの静的読解は「効くはず」までしか言えない。実測が否定したら前提を捨てる。**
  本件で推測が2回外れた。2回目は「`.nox-main > *` が効くので余白ゼロ」という報告を前提にしたが、
  **`.nox-main` は当該画面に存在しなかった**。決め手は CSSOM の `Element.matches()` による
  実一致判定と、印刷エミュレーション下の `getBoundingClientRect` 実測。
- **引き継ぎ文書に「軽微」と書かれた項目が、台帳に起票されていないことがある。**
  本件は台帳 524行に「運用検収へ持ち越し」として積まれていただけで、不具合としての起票は無かった。
  **引き継ぎ文書 §4 と台帳は別物として突き合わせること。**

## 裁定21：メモ腐敗4件＝着手前の読み取り専用確認を恒久手順とする（2026-07-31）

- 本日、引き継ぎメモと現物の乖離を**4件**踏んだ。
  ① D1/D2/D3「pending」→ 実は全て landed ② 段C+E+F+G「レビュー待ち」→ 3日前に完了済み
  ③ D2 末尾空白の是正1行「未実施」→ 89f9043(2026-07-23) で既に投入済み
  ④ ③の症状自体は実在したが**原因が別**（上記 裁定20）
- **§3-5（レーン着手前に CC へ読み取りのみの現状確認を出す）が4件とも機能した。**
  ③④は「メモが古い観測を引きずっていたが症状は実在」という複合形で、
  段1を先に返させていなければ重複行を入れた上で症状が残り、原因を見失っていた。
- **恒久手順として確定**：新レーン着手前の読み取り専用確認は省略しない。
  **この文書より repo 状態と live DB が常に正。**

## 裁定22：payroll の並び順3経路が不揃い＝観測済み・未着手（Agoora 起票のみ・2026-07-31）

**現時点で実害なし**（デモ店6名）。修正は行わない。次セッションで腐らせないための記録。

**★主題は「印刷と一覧が違う」ではなく「上部一覧が未ソート」**：引き継ぎ文書の初出表現は印刷側が不整列と読めるが逆。現物は3経路が別々の規則で並ぶ。

| 経路 | state / 取得 | データ源 | 並び |
|---|---|---|---|
| 上部一覧 | `rows`（`payroll-board.tsx:38` / `preview()` :202） | `/api/payroll/preview` → `computePayrollDraft`＝確定前の再計算 | **なし** |
| 印刷スリップ | `printRows`（:49 / `loadPayslipsForPrint()` :178） | `payslips` 直読み＝確定時の凍結値 | `castName` 昇順 `localeCompare(…,"ja")`（:190-193） |
| D3 CSV | 同上 | 同上 | `nameOf`＝**casts の現在名**で昇順（:149-153） |

- **上部一覧の順 = Set 挿入順**：`collect.ts:398,408` の `new Set([...salesByCast.keys(), ...punchByCast.keys()])` の挿入順＝checks / check_cast_backs / punches のクエリ返却順依存。SQL の order by も client sort も無い＝**実質不定・再取得で並びが変わりうる**。`collect.ts:402` の名前引き（`.in("id",[...targetIds])`）は順序に関与しない
- **CSV と印刷のズレ**：CSV はソートキーが現在名・表示が凍結名（`slipCastName`）。印刷はソートキーも凍結名。**確定後に源氏名を改名した cast がいると CSV と印刷で並びが入れ替わる**（`e7dd0ba` の凍結名導入時に印刷側だけ揃えた形）
- **顕在化条件**：20名規模で目的の人を探しにくい／確定後改名の発生。6名では未顕在
- **着手時の制約**：段D 対象外裁定（台帳:419）は payroll の「並び」を1文字も変えない前提。本件を直す = その前提を意図的に解除する行為＝**着手前に段D 裁定との整合を取り直すこと**。DOM 階層に触れるなら印刷隔離ルール `.nox-printpage > *:not(.nox-print){display:none}` の破壊確認も必須
- **規模見込み**：app のみ・migration 不要。3経路のソートキーを凍結名に統一するのが素直だが、上部一覧は確定前＝凍結値が無いため単純統一はできない（未確定時のキー選択が裁定事項）

## 裁定23：税務要件の棚卸し＝残債9件（税理士回答2026-07-31 と現物突合・2026-07-31）

**契機**：「launch 前残債ゼロ」は機能軸のみの評価だった。インフラ監査（別途）と税務監査で残債が出た。本節は税務のみ。`docs/NOX_税理士確認事項.docx` には本節の論点は**載っていない**（Agoora 確認済み・重複質問の必要なし）。

### 確定した法令解釈（税理士回答・タックスアンサー No.2807）

- **5,000円 × 日数の「日数」＝計算期間の日数**。営業日数でも出勤日数でもない。同ページに例示あり（3/1〜3/31・営業日数25日・報酬75万円 → 5,000×**31**日＝155,000円控除）。最判平成22年3月2日で決着済み
- **源泉税額は1円未満切捨**（同ページ注記）。式は `floor(max(0, gross − 5000 × periodDays) × 0.1021)`
- **期中入退店**は契約期間と計算期間の突合（max/min）。★**支払日まで期間を伸ばさない**（3/1〜3/20稼働・4/10支払 → 20日）
- **支払調書の氏名・住所・番号は「作成日の現況」**＝★現行の現在値 join は**正しい**（当初「設計漏れ」と判定したのは誤り・撤回）。ただし明文は住所と個人番号で、氏名は実務上同じ扱い
- **納期の特例はホステス等の報酬に適用されない**＝キャスト報酬は翌月10日納付固定。従業員給与と別系統
- **報奨金・衣装代・深夜帰宅のタクシー代は源泉対象**（除外すると徴収不足＝店側が不納付加算税）
- 経過措置の控除割合は **80%（〜2026-09-30）→ 50%（2026-10-01〜）**。boolean 不可・取引日から導出できる形が要る

### 残債9件

| # | 項目 | 深刻度 | 種別 | 根拠 |
|---|---|---|---|---|
| 1 | **出勤ボーナスが源泉の課税ベース外** | ★高 | app（golden 動く） | `core.ts:126-145` |
| 2 | **納付管理・納付書が皆無** | ★高 | 新機能 | grep 0件 |
| 3 | **日数＝実出勤日数（判例と相反）** | ★高 | app（golden 動く） | `pay.ts:9,337` |
| 4 | 入店日/退店日の列が無い | 中 | migration | `0001:93-104` |
| 5 | gross が税込固定（消費税を分離できない） | 中 | post-launch | `receipt.ts:7` |
| 6 | インボイス登録日/通知受領日が無い | 中 | migration | `0015:80-89` |
| 7 | 経過措置の控除割合計算が無い | 低〜中 | NOX 外の可能性 | `invoice-panel.tsx:90` |
| 8 | `casts.employment` と `cast_tax_profiles.mode` の二重持ち | 低 | migration | 計算は後者のみ参照 |
| 9 | 交通費「支給」を表現できない（transport は控除専用） | 低 | 運用次第 | `0019:102` |

### #1 出勤ボーナス（★最優先）

`core.ts` の計算順序：①`payOf` 内で gross を組む（`pay.ts:422`・**extras 非包含**）→②その gross で `withholding` →③`payOf` を抜けた後に `net = pay.net + Σextras`（:145）。**源泉徴収後の手取りに満額加算されている**。漏れ額 = ボーナス総額 × 10.21%。税理士回答の「報奨金は源泉対象」に直撃。

★是正時の注意：`available = pay0.net + extrasTotal`（:128）が AR/前借り/送りの控除可能額を決めているため、extras を gross に含めると**繰越ロジックに波及**する。デモ店 run（net 252,354）も動きうる。

### #3 日数（★golden が動く）

`effDays` の消費者は**3つ**（`pay.ts:385` 解決 → :434 / :438 / :439）。**一律差し替えは禁止**：

- `fixedDedOf`（日割り控除）→ 暦日数にすると控除額が跳ね上がる
- `withholdingOf`（源泉）→ ★ここだけ `periodDays` に変える
- `normPenaltyOf`（ノルマ未達）→ ★ノルマ22日 vs 暦31日で**未達判定が永久に不成立・ペナルティが消える。しかも例外にならず verify が緑のまま通る**（裁定20 の教訓6 と同型＝射程外の静かな破壊）

`metrics.days` は明細表示値かつ `basis:"days"` の皆勤手当（22×300=6600）の単価。

**実装**：`PayInput` に `periodDays` を追加（`win.periodEnd − win.periodStart + 1`＝`period_bounds` が既に解決済み・**DB 追加不要**）。`withholdingOf` にのみ渡す。源泉専用 `floorYen` を新設（`roundYen` は6箇所以上から呼ばれる共通集約点のため**触らない**）。

**張り替えが要る gate**：`verify:nox-pay` :160 / :183（:179 :241 :252 は純関数直呼びのため不変）、`verify:nox-payroll` :235 / :241 / ★**:772 は `(300_000 - 50_000) * 0.1021` と式ごとハードコード**＝数値差し替えでは済まない。

### 送り・衣装の扱い（現行は問題なし）

`transport` は送迎実費の**天引き**であり支給ではない。税理士指摘の「タクシー代は源泉対象」は店が負担して支給する形態の話。現行の天引き運用なら実装変更不要。★ただし「店が送り代を負担する」運用に切り替えると gross 側に交通費項目が無く表現不能。衣装は実体ゼロ（grep 0件）。

### マイナンバー＝スコープ外（裁定維持）

番号法の安全管理措置（取扱区域制限・アクセスログ・自動廃棄ジョブ）まで要件に入るため、列1本の話ではない。支払調書は税理士側で付番する運用を第一候補とする。必要になった時点で独立レーン。**弁護士確認事項に回す論点**。

### 未回答・要追加質問

- 出勤ボーナス（報奨金）を gross に含める解釈で正しいか
- 送り代の**天引き**運用でも源泉対象になるか（支給形態との差）
- 経過措置の控除割合計算は NOX 側か会計ソフト側か（分担）

## 裁定23-b：裁定23 の訂正2件＋追加回答で確定した実装スコープ（税理士追加回答・2026-07-31）

裁定23 に誤りが2件入ったため訂正する。**元の記述は書き換えず、本節で上書きする**（誤った経緯を残すため）。

### 訂正① 経過措置は4段階（裁定23 の「80%→50%」は誤り）

裁定23 に「80%（〜2026-09-30）→ 50%（2026-10-01〜）」と書いたが、**税理士の前回回答自体が誤っており、追加回答で訂正された**。正しくは：

| 期間 | 控除割合 |
|---|---|
| 〜2026-09-30 | 80% |
| 2026-10-01 〜 2028-09-30 | **70%** |
| 2028-10-01 〜 2030-09-30 | 50% |
| 2030-10-01 〜 2031-09-30 | 30% |

★ただし**裁定③により NOX は控除割合を持たない**（下記）。よって実装への影響は無く、訂正は記録の正確性のため。

### 訂正② 出勤ボーナスの不足額は「ボーナス × 10.21%」ではない

裁定23 に「漏れ額 = ボーナス総額 × 10.21%」と書いたが不正確。**5,000円 × 計算期間の日数の控除の影響を受ける**ため、単純な乗算にはならない（税理士明示）。実額は再計算が要る。

### 追加回答で確定した3点

**① 出勤ボーナス＝源泉対象に含める（確定）**
出勤日数等の条件を満たしたことに対する報奨金は役務提供の対価＝報酬。時給・各種バック・売上バック・出勤ボーナスを合算した**報酬総額**を基礎に `floor(max(0, 総額 − 5000 × periodDays) × 0.1021)`。**裁定23 の #1 は是正確定**。

**② 送迎費＝全額実費天引きなら現行実装が正しい（確定）**
店が立て替え、後日 cast から実費を**全額**天引きする運用では cast に経済的利益が生じないため、報酬への加算は**不要**。同時に、送迎費を理由に報酬総額を**減額して源泉計算することも不可**。処理順は「①報酬総額で源泉を計算 → ②送迎費を控除して手取り算出」＝`transport` を控除側に置く現行構造そのまま。

★**条件付きの残債**：店が送迎費を**全額または一部負担**する場合、その負担部分は cast への経済的利益＝報酬へ加算が必要。現行スキーマ（`transport.amount` は天引き額のみ・`0019:102-114`）は店負担を表現できない。**運用として店負担が発生しないことの確認が要る**。発生するなら列追加。

**③ インボイス＝NOX は判定材料の保持・連携のみ（確定）**
控除割合の計算・申告は**会計ソフト側が実務標準**。NOX が持つべきは以下：

| 項目 | 現状 |
|---|---|
| 取引日（役務提供日） | ✅ |
| 支払額（税抜額・消費税額） | ★税込のみ・分離不可（裁定23 #5） |
| 適用税率 | ★無し（10%内税固定・`receipt.ts:7`） |
| 相手方情報 | ✅ |
| 登録番号 | ✅ `reg_no` |
| **登録の効力発生日・失効日** | ★無し |
| **取引日時点で登録が有効かの判定材料** | ★無し |

会計ソフトへの連携出力機能も現状ゼロ＝**新機能**。

### 確定した実装スコープ

| # | 内容 | 層 | golden |
|---|---|---|---|
| 1 | extras を gross に含める（`core.ts:126-145` の計算順序） | app | ★動く |
| 3 | `periodDays` を `withholdingOf` にのみ渡す（`effDays` は不変） | app | ★動く |
| — | 源泉専用 `floorYen` 分離（`roundYen` は触らない） | app | 不変 |
| 4 | 入店日/退店日 | migration | — |
| 6 | 登録効力発生日・失効日・通知受領日 | migration | — |
| 8 | `employment`/`mode` 二重持ち解消 | migration | — |
| 2 | 納付管理（月次源泉合計・翌月10日納付） | 新機能 | — |
| — | 会計ソフト連携出力 | 新機能 | — |

★**#1 と #3 は同時に実施する**。どちらも源泉額を動かすため、別々にやると golden を2回張り替えることになる。

**順序**：migration 群（#4/#6/#8）を先に起草し1回の手貼りで投入 → その後 app（#1/#3/floorYen）。DB先コード後の原則、かつ #4 が入っていれば期中入退店の按分を #3 と同時に実装できるため。

### 税務論点はこれで全て閉じた

未回答項目なし。追加質問の予定なし（マイナンバーは裁定23 のとおりスコープ外＝弁護士確認事項へ）。

## 裁定24：verify ハーネスの構造欠陥3件＝fresh seed から自立しない（観測済み・起票のみ・2026-08-03）

**契機**：mig0073 の verify で段15 churn が FAIL。復旧過程で構造欠陥が連鎖的に露出した。

### ① churn fixture は seed+20日で期限切れする（既知・予告済み）

`seed-f0.ts:206` が `Date.now()` 相対で `started_at` を焼き込み、以後毎日 +1 ドリフト。`verify-nox-anon-guard.ts:1019-1021` 自身が「seed+20日超は seed:f0 再実行が前提」と予告。2026-07-13 seed → **2026-08-02 に期限到達**し予告どおり落ちた。正規回復＝seed:f0 再実行（2026-08-03 実施済み・次回期限は **2026-08-23 頃**）。恒久対処（assert の tier 非依存化 or verify 内動的 seed）はバックログ。

### ② ★seed:f0 は products を削除するが投入しない＝スイートが fresh seed から自立しない

VERIFY org の drink/champ 商品は `verify-nox-rls.ts:198` が作る。しかし verify:f0 の実行順は anon-guard → rls で、fresh seed 直後は anon-guard 段28-31 が商品不在で落ち、&& が止まり rls に到達しない＝**商品を作る者に永遠に届かない循環**。2026-07-13 以降の緑は、rls が過去に作った商品の残骸に依存していた。**復旧手順（確立済み）：seed:f0 → verify:nox-rls 単体 → verify:f0 フル**。★本番構築時の手貼り後検証で必ず刺さる＝launch 残債。

### ③ 段の中断で後始末が飛び、残留 fixture が次の実行を壊す

後始末コード（verify-nox-anon-guard.ts:3666 段28-cast / :4407 会計TMP）は存在するが、準備失敗で段が中断すると実行されない。今回 rls が6件落ちた直接原因（casts 2→4・memberships 8→9）。try/finally 化されていない段がある。恒久対処はバックログ。

→ **①②③消化済み（2026-08-08・本コミット）**：
- ①＝anon-guard 段15 冒頭で CRM卓 checks の started_at を「実行日 − daysAgo」へ再アンカー（customer_id×total で同定・seed 経過日数に非依存＝恒久化）。将来日付は「データ側を 30 日古くする」忠実シミュレーション（JS/DB の時計は同時に進むため時計モックでなくデータドリフトが等価）で自己修復を実証。
- ②＝anon-guard 段28/29 が商品不在時に自給（query-or-insert の永続 fixture 流儀・値は rls 個体と同形。段30/31 の rate drink lookup は段28 の個体で充足＝段順前提をコメント明記）。**fresh seed → verify:f0 直行 17本全緑を実測**＝「seed:f0→rls 単体→フル」の復旧手順が不要化・launch 残債の解消。
- ③＝段28/段31 を外側 try/finally 化（サインイン不成立＝ガード false／prep 例外でも 専用 cast・一時 cast 一式・store settings を残さない。正常経路では内側 finally 実施済み＝冪等 no-op）。
- 附随＝cast-photo / rate-back の成功行を他スイート同書式「ALL PASS (N assertions)」へ統一（集計 grep 漏れの是正）。
- verify:f0 合計 **2549 → 2550**（+1＝段15 再アンカー assert・anon-guard 933→934）。golden 5値（wage 5931 / withholding 125802 / rls F1b 54400 / labor-forecast 55233 / receipt 52）不変。

### 教訓9：セッションが日をまたぐと「本日」の実行記録が腐る

CC の「本日4回緑だった」は誤認＝実際は 07-31 の実行（git log で確定）。セッション内の記憶も台帳・引き継ぎ文書と同様に腐る。**「本日」を根拠にする報告は git log / mtime 等の機械的時刻で裏を取ること**。裁定21（メモ腐敗）の同族。

## 裁定25：インフラ・事業残債5件＝launch 判断確定（Agoora 裁定・2026-08-03）

**契機**：インフラ監査（2026-08-03・読み取り専用）で「launch 前残債ゼロ」が機能軸のみの評価と判明。台帳未起票だった5件を固定する。Agoora 裁定＝**有料 SaaS として課金を載せる／本番投入はまだ先／Vercel（staging）はあり**。

| # | 残債 | 現物根拠 | 裁定 |
|---|---|---|---|
| 1 | **課金機能まるごと未着手** | stripe/billing/webhook 実装 0件・`0005:9` が F4 送りを明記 | ★**launch ブロッカー確定**（有料 SaaS 裁定による）。BANZEN の4プラン+billingGate+Stripe webhook が前例。本番構築より前 |
| 2 | 本番 Supabase 未作成 | repo 内に本番 ref の現物ゼロ・`runbook:19` が「作成せよ」と手順のみ | 最後（BANZEN 後・従来方針どおり） |
| 3 | Vercel 未デプロイ・ドメインなし | vercel.json 無し・サイトURL 変数の使用 0件 | staging を先行してよい（Agoora 裁定）。★dev DB 直結にする場合、CLUB NOX の確定 run と golden 値が外部操作で壊れる＝**公開範囲かデモ org 分離の裁定が先**（BANZEN staging でデータ混在を踏んだ前例） |
| 4 | 監視・アラート皆無 | runbook にバックアップ/復旧は有・監視の記述 0件 | staging 段階は Vercel エラー通知＋Supabase 使用量アラートの最小構成。本格監視は本番構築時 |
| 5 | 手貼りリストが 0066–0073 の8本を欠く | `docs/NOX_本番手貼りリスト.md` 適用範囲「0001〜0065」のまま | ★手順どおり貼ると set_product が壊れた状態で立ち上がる（0071 欠落＝オーバーロード2本／0072 欠落＝ACL 不付与）。docs のみ・次レーンで追記 |

→ 消化済み（2026-08-03・5788f28）：0066–0073 の8本を追記し適用範囲を0073へ更新。0069→0072 のセキュリティ supersede 組（ACL 欠落→是正）を 0057→0058 と同型の「単独適用厳禁」として明記。

**文書腐敗の是正対象（同監査で検出・未着手）**：`CLAUDE.md:73` の verify:f0 構成「4本」（実際13本）／`docs/NOX_段階リリース計画.md:164` の「NOX は F0 から着手」（実際 F4 まで完了）。

→ 消化済み（2026-08-03・本コミット）：CLAUDE.md:73 の verify 構成を13本の実態へ更新・段階リリース計画の「F0 から着手」を現況（実装進行中・mig0073 到達）へ更新。

## 裁定26（2026-08-03）golden 張り替えの記録書式＋①実施記録

golden 値を意図的に変更する場合、台帳の当該裁定に「旧値→新値／変更理由（1行）／張り替えコミットのハッシュ」を対で記録し、同一コミットで CLAUDE.md・引き継ぎ文書の golden 行を新値へ更新する。旧値の履歴は台帳のみが持つ。理由の記録がない golden 差分はすべて退行として扱う。

### ①（裁定23 #1+#3）による張り替え（本コミット）

- 理由：源泉日数＝計算期間日数（最判平22.3.2）・丸め＝円未満切捨・extras を源泉対象 gross に算入（税理士確定）
- nox-pay T1a withholding 121836→117241／net 1112464→1117059
- nox-pay T1b withholding 130397→125802／net 1187753→1192348
- nox-payroll F2f 源泉 25525→22972／複合 wh 78668→76115・net 697832→700385
- T7 直呼び 39819→39819（端数ゼロで同値・ラベルのみ更新）
- fixture 前提：REINA periodDays=31／baseInp・cx periodDays=15
- 附随：computeNet 削除（extras 内在化で二重加算の罠化のため）・payslip 総支給ラベル更新・F2c-3 恒等 assert を net===pay.net へ書き換え（外側加算なしの直接検証・件数維持）・payslip「加算」節見出しを「加算（総支給の内訳）」へ（帳票の読算が合うように）
- 附記：payroll_reopen は計算を持たず巻き戻し専用＝reopen→再確定 run は新式で再計算される。これは仕様として正（税理士確定式への収束）

### 孤児ブランチ裁定

claude/wizardly-sanderson-9c96e8（67996c9・基準1172時代）はマージしない。着想（参照ゼロ限定の掃除）は裁定24③作り直し時に引き継ぐ。ブランチは残置。

### 教訓10

文書内の行番号参照は腐る（off-by-one 2件発生）。指示・台帳とも置換対象はテキスト指定を正とし、行番号は補助情報に留める。本裁定の実装指示自体でも同事象が発生（行番号 250-251 とラベル F2c-3 が別箇所を指し、片方が書き換え漏れ）＝実例として記録。

## 裁定27（2026-08-03）mig0074 入退店＝実施記録

裁定23 #4 / 引き継ぎ §4-2 の実装。`casts.joined_on` / `casts.left_on`（date・NULL 可・**backfill なし**）＋整合 CHECK `casts_active_left_on_chk`（`is_active = (left_on is null)`）＋ `cast_leave(uuid, date)` / `cast_rejoin(uuid)`。dev 適用済み（2026-08-03 手貼り）・repo 収蔵 sha256 `6c001185…39d9`（4575 bytes・repo=Downloads 一致）・live の `pg_get_functiondef` と本文一致を機械確認。

- **権限型**：owner 全店 / manager 自店＝`staff_deactivate` の逐語同型。両 RPC とも `audit_log_write` あり・ACL は `revoke from public, anon` ＋ `grant to authenticated`。
- **復活方式A（履歴なし）**：`cast_rejoin` は `joined_on` を変えず `left_on` を null に戻す。`casts_one_active_per_user_idx`（`(user_id) where is_active`）への抵触は `'already active elsewhere'` で先取りする（`staff_reactivate` 同型）。
- **★`joined_on` の default（JST 作成日）は相談役追加として採用**。ただし **`add column` とは分離して `set default` する**＝volatile default を列追加に同居させると既存行へ評価値が書き込まれ「backfill なし」に反するため。既存行は null のまま／以後の新規行のみ JST 作成日が入る。
- **給与側は非改変**：`collect.ts:397-402` の「対象 cast＝sales ∪ punch（is_active 不問・退職者含む）」は変えない。`joined_on` / `left_on` は期間按分の材料であって可視性フィルタではない。
- **退店で cast の自己経路は閉じる**：`auth_cast_id()` が `c.is_active` を見ているため、`cast_leave` 後は cast の自己 RPC が全滅する（意図どおり）。
- **runtime 検証はコミット②で実施予定**（prosrc 緑 ≠ runtime 成功・8観点）。verify:f0 の合計が動く場合は裁定26 の書式で旧合計→新合計を本節に追記する。

→ 附記（本コミット）：CHECK 追加により既存 verify fixture 3箇所（is_active 単独書込）が違反化＝fixture を is_active+left_on の対書込へ修正（assert の意味・件数不変）。制約が設計意図どおり不正パターンを検出した事例として記録。

### 教訓11

migration プリフライトの影響調査は「app の書き手」だけでなく「verify スクリプト内の書き手」も列挙対象とする（本件で is_active 単独書込 3箇所の見落としが発生）。

### runtime 検証の追加＝verify:f0 合計の張り替え（裁定26 書式）

- 旧合計 **2142 → 新合計 2152**（+10・すべて `verify:nox-anon-guard` 918→928）
- 理由：mig0074 の runtime 検証追加（prosrc 緑 ≠ runtime 成功）
- 内訳：**段38a（+2）** anon BLOCKED（`cast_leave` / `cast_rejoin`・自動列挙ではないため明示追加）／**段38（+8）** 準備1・(a) owner 退店＝is_active=false・left_on=指定日・(b) 二重退店 `already inactive`・(e) 同一 user の active 行あり復活 `already active elsewhere`・(c) 復活＝is_active=true・left_on=null・(d) 二重復活 `already active`・(f) CHECK が service_role 直 UPDATE も拒否・(g) manager の他店退店 `forbidden`
- fixture 3原則：①動的生成のみ（固定 fixture の casts を退店させない）②`p_left_on` 明示（当日 JST 非依存＝時限装置化しない・`2026-02-20` 固定）③拒否系は状態不変ゆえ復元不要。finally は `like 'NOX-VERIFY-段38%'` の削除で閉じる
- golden 5値（wage 5931 / withholding 125802 / rls F1b 54400 / labor-forecast 55233 / receipt 52）は不変
- 張り替えコミット：**本コミット（コミット②）**。収蔵＋UI は先行の コミット① `af75632`

## 裁定28（2026-08-03）納付管理の設計確定（mig0075）

- 税区分（委託/雇用）は payslip の breakdown_json.pay に凍結＝納付集計の根拠は凍結値のみ・現在値フォールバックなし（'(未凍結)' として表面化）。凍結は app（payOf 出力）・mig 不要と判明
- 集計対象＝paid run のみ（paid_at＝キャストへ支払った日・JST月で帰属）。finalized 未払は注意行で可視化
- org 合算のみ（納付書＝源泉徴収義務者単位）。店別内訳は post-launch
- 納付記録＝withholding_payments（org×月×区分 unique・実質append-only）。取消RPC と audit_log_write は post-launch に対で導入（org単位操作への audit 適用は live def 起点で設計してから）
- 期限＝翌月10日固定（納期の特例はホステス報酬に不適用・裁定23）。土日祝順延は表示課題として post-launch

→ DEMO 2026-07 の治癒は Agoora が UI から手動実施（解除→再確定＝D1 初実戦・実施後に '(未凍結)' 警告消滅を目視検収）。verify は VERIFY org の動的生成のみで DEMO 不干渉（案A）。

→ **治癒実施済み（2026-08-08・C タスク）**：reopen＝admin 代行で payroll_reopen（owner の auth を開発側が持たないため・actor=DEMO owner の users.id・"reopened"＝draft 不変量へ）→ 再確定＝demo-manager の UI 実操作（/payroll 2026-07・確定完了 6名・**全 payslip に pay.taxMode 凍結**＝'(未凍結)' の根が解消・payslips 直読で確認）→ payroll_mark_paid＝admin 代行（"paid"・paid_at 記録）。net は新式再計算で旧値から変動（例 23135→25766）＝裁定26 附記どおりの仕様。各段で verify:nox-pay 83 全緑（golden 不変）。納付管理パネルの目視は owner 限定描画のため Agoora の次回ログイン時に確認可（データ条件は充足済み）。

→ 是正（mig0076・本コミット）：sum(bigint)→numeric 昇格により宣言 bigint と不一致＝1行でも返すと必ず失敗する潜伏バグ（paid run ゼロ環境では発火せず）。F2g runtime 検証が初回検出。集計2列を ::bigint 明示キャスト。

### 教訓12

returns table を持つ集計 RPC は「行を返す状態」での runtime 実行が検証必須（sum/avg の型昇格は 0行では発火しない）。prosrc 緑≠runtime 成功の集計版。

### runtime 検証の追加＝verify:f0 合計の張り替え（裁定26 書式）

- 旧合計 **2152 → 新合計 2161**（+9・すべて `verify:nox-payroll` 124→133）
- 理由：mig0075/0076 納付管理の runtime 検証追加（8観点＋凍結の runtime 証明）
- 内訳（F2g・全9件）：(b) paid 化の差分が自 run の gross と一致＝paid 限定の証明／★taxMode が breakdown_json.pay に凍結（app 計算経路の runtime 証明）／(a) 委託・雇用が区分別に出る＋期限=翌月10日＋差分一致／(a) 自 run の payslips は全件凍結済み／(c) payment_record→paid_on 反映／(d) 同月同区分の再記録 `already recorded`／(e) `bad month`／(e) `bad category`／(f) manager は両 RPC forbidden／(h) authenticated 直の SELECT/INSERT 拒否
- fixture 3原則：①動的生成のみ（専用 period 2027-05・専用 cast 2名）②支払月/期限は RPC と同式で導出（リテラル固定にしない）③拒否系は状態不変ゆえ復元不要
- ★**org 合算 RPC ゆえ他段の paid run が混ざる**＝件数固定の assert は不成立。差分（前後の gross 差）と「自 run の全件凍結」で不変量を取る形にした
- ★**後始末の教訓（裁定24③ の同型を再演）**：`mkPunchDay` が `shifts` も作るため、shifts を消さないと FK で casts の delete が失敗し cast が蓄積、anon-guard 段35 の固定カウント（A1=2人）を壊した。finally は FK 参照元を全て消し、削除失敗時は `fails.push` で表面化させる形に是正
- golden 5値（wage 5931 / withholding 125802 / rls F1b 54400 / labor-forecast 55233 / receipt 52）は不変
- 張り替えコミット：**本コミット（コミット②）**。収蔵＋凍結＋パネルは先行の コミット① `72ab3f2`

## （参考）本セッションで確定済み・他所に記録済みの裁定

- **台帳#40 原価分離＝案C**（products.cost → product_costs・mig0049/0050・実装完了）＝mig ヘッダに記録済み。
- **モック正本＝responsive 版へ一本化**（B 採用・C 不採用・コミット `020e589`）。
- **文言統一「女の子」→「キャスト」＝完了（467c07d・2026-07-31）**。実体は `app/(manage)/layout.tsx:58`
  のコメント1行のみで、単純置換だと「「キャスト」→「キャスト」」になるため意味の通る文へ書き換えた。
  ★射程外2件＝台帳自身の記録行（この行）と `0025_f3a2q1_staff_edit.sql:51`（適用済み migration の
  SQL コメント＝改変するとファイルと live DB の prosrc が乖離する）。**適用済み migration は
  文言統一の対象外**とする。なお「mock に1件あり」の当初報告は本日の全数 grep では再現せず
  （残存は上記2件のみ）。

### 教訓13: verify 本数は必ず全13行を実測して足す。

- tail -n / head -n で切り落とした状態の出力から本数を報告しない
  （先頭スイート pay が最も切られやすい）
- 記憶している合計から他スイートを引いて個別値を逆算しない
- 台帳の現在値を参照していない状態で「基準値と一致」と書かない
- ★全緑と本数一致は別命題。実行されなかった assertion は緑のまま数が減る
  （教訓12 と同型の見落とし方）

契機: 2026-08-04 レーン①報告で pay 60 と誤報告（実測 83）。コードに差分は
無く、tail -60 で切れた先頭スイートの値を記憶の合計から逆算して埋めたもの。

### 教訓14: migration は本文とファイルを必ず同時に出す

- 相談役が本文だけで起草すると、手貼りは通るが原本がディスクに残らない。
  この状態で CC が pg_get_functiondef から再構成すると、原本と1バイト
  違うファイルが収蔵名で置かれ、以後の照合が無意味になる。
- ★原本が無い場合、CC は再構成せず停止するのが正しい（mig0077 で実践）。
  復元元は「起草時の本文」であって live ではない。
- live との照合は収蔵の前に行い、意味的な食い違い（引数・例外文言・
  ガード順序・UPDATE 対象列・audit の action/target・grant 対象）が
  あれば収蔵せず停止する＝手貼り時の貼り漏れ検知を兼ねる。

契機: 2026-08-04 mig0077。相談役がファイルを同時に出さず原本喪失。

→ 附記（本コミット）：後日あらためて原本を受領し、sha256 `b7abae39…450c`（6950 bytes）
一致を確認したうえで、live の `prosrc` と**関数本文が byte 一致**することを機械照合して収蔵した
（引数・戻り型・SECURITY DEFINER・search_path・ACL も併せて一致）。教訓の「復元元は起草時の本文」
のとおり、再構成物ではなく原本が収蔵されている。

### 教訓15: pg_catalog の "char" 型列は || の前に ::text が要る

- pg_proc.provolatile / pg_policy.polcmd などは型 "char"（1バイト文字型）で、
  text と連結すると operator is not unique: "char" || unknown で落ちる。
- ★検証バンドルは SQL Editor で一度しか走らせない前提のため、
  この種の型エラーは「貼ってから気づく」＝手貼り工程を止める。
  pg_catalog の列を連結する検証を書くときは型を確認してからにする。

契機: 2026-08-04 mig0078 の検証バンドル E 行。相談役が
p.provolatile を ::text なしで連結して構文エラー。

### 教訓16: 手貼り経由の live prosrc には CRLF が混入する

- SQL Editor へのクリップボード貼付で改行が CRLF 化し、prosrc にそのまま残る。
- 原本との byte 照合は改行正規化（CRLF→LF）後に行う。素の不一致で慌てない。
- ★live pg_get_functiondef を起点に次の migration を起草するときは、
  取得テキストを LF に正規化してから使う（CRLF を原稿に持ち込まない）。

契機: 2026-08-05 mig0079 収蔵時の live 照合。素の byte 不一致（CRLF 45個）、
正規化後に完全一致。

### 教訓17: pg_get_functiondef はセミコロンを含まない／デリミタ数検算は文区切りを保証しない

- `pg_get_functiondef` の戻り値は **末尾セミコロンを持たない**（live 172 関数すべてで実測 0/172）。
  複数関数を機械生成で連結するときは **各定義の直後に `;` を明示付与**する。
- ★**`$function$` の総数（87×2=174）が合っていても文区切りの証明にはならない**。
  区切りが無いと 87 関数が **1 文に融合**し、SQL Editor は全体を reject する。
  検算は「`$function$;` の出現数＝関数数」「`$function$;` で分割した文数＝関数数」
  「各文が `CREATE OR REPLACE FUNCTION` で始まる」の**3点セット**で行う。
- 併せて、機械生成物の「本数」をファイル全体の grep で数えない（ヘッダの説明文に同じ
  トークンが現れて水増しされる）。**コメント行を除いた本文**で数えること。

契機: 2026-08-17 mig0088_r2 の手貼りが全体 reject。**トランザクション外の全体失敗ゆえ
dev は無傷**（検証バンドル全ゼロで確認）。r3 で `;` 付与＋検証 (e) を追加して是正。

## 裁定29（2026-08-17）レジ時間UX＝旧裁定(f) の更新と見送り4件（app のみ・DB 不触）

契機: Agoora 実機所感「卓タップ→何が始まったか分からない・セット/延長の状態が見えない」。
実装は app のみ（RPC/RLS/スキーマ非改変・check_open の既存引数 p_people を使うだけ）。

### 裁定(f) の更新: 時間料金は「会計タブを開いた時点で自動反映」へ（手動ボタン廃止）

- 旧裁定(f)（mig0052 B4）「check_time_charge_apply はボタン起点のみ（自動 apply しない）」を更新。
- **契機＝時間料金未計上のまま close できる構造の是正**: check_pay/check_close は時間料金に
  触れない（close は Σpaid ≥ due を見るだけ）＝押し忘れると静かに未計上で締まる。UI 経路で塞ぐ。
- 新: manage は会計タブ遷移時・kiosk は伝票表示時（会計タブを持たない全面ビューの等価点）に
  **1回だけ** apply（check.id × 入場の ref キーで再発火抑止・タイマーからは呼ばない＝kiosk
  0059(b) 契約維持）。前置き＝open ∧ 入金0 ∧ time_mode='auto'（RPC の has payments/not open
  ガードの前置き）。RPC は自然冪等 upsert（部分ユニーク check_lines_one_time_auto）＝構造は非改変。
- 留意: apply 1回ごとに audit_log_write 1行（タブ入場単位に絞って肥大を抑制・実測で問題になったら
  mig0005 の間引き裁定と同じ土俵で再判断）。

### 併せて実装（R1/R2）

- R1 開卓モーダル: フリー卓タップ→即 check_open を廃し「開卓（セット開始）」確認＋人数入力
  （任意・空欄=null＝従来同値）→ check_open(p_people)。manage/kiosk 同型。nom_type は 'free' 維持。
- R2 時間ステータス（manage のみ）: lib/nox/check-calc.ts に blocks 式の**表示用鏡像**
  timeBlocksOf/timeStatusOf を新設（★権威はサーバ・式改修は RPC と同時＝groupDue 3点セットと同じ規律）。
  伝票ヘッダ「セット中 残りN分／延長N回目（次 HH:MM・--bad 色）」・卓タイルに超過バッジ
  （loadOpenMap の checks 直 SELECT へ set_min/ext_min/time_per/people 列追加＝RLS 行スコープで素通り）。

### 見送り4件（理由付き）

1. **kiosk の時間ステータス表示**: kiosk_register_state / kiosk_check_detail（0059）が
   スナップ5値（set_min/set_fee/ext_min/ext_fee/time_per）を返さない＝**0059 列追加（DB）待ち**。
   加算的 jsonb キー追加で後方互換・相談役設計へ。
2. **people の開栓後修正 RPC**: checks.people を update する経路が存在しない（全 mig 走査で確認）。
   time_per='person' 店で①の入力ミス復旧に効くが、新 RPC＝DB 設計事項のため見送り。
3. **close 時の時間料金防御**: R3 は UI 経路の是正であり、API 直呼びで会計タブを経ずに
   close する経路は残る（time_mode=auto ∧ time_auto 行なしの close 拒否/警告は check_close 改稿）。
   **既知負債として記録**・優先度は運用実測待ち。
4. **空伝票の staff 自己取消**: 誤開卓の復旧は現状 manager の check_void（理由必須）一択。
   R1 モーダルで誤爆自体が減るため、明細0・入金0 限定の緩和 RPC は運用実測を見てから。

### runtime 検証の追加＝verify:f0 合計の張り替え（裁定26 書式）

- verify:nox-pricing-apply へ段44(3b) を追加（+7）: 鏡像 timeBlocksOf を **RPC 返り値の
  elapsed_min で突合**（時刻非依存で決定的）＋境界5点（経過<set／=set ちょうど／set+1／
  set+ext ちょうど／+1）＋時計逆行 clamp。
- **verify:nox-pricing-apply 44→51／verify:f0 合計 2600→2607（18本・全緑・実測）**。

### 裁定29 追補（mig0089 行分離・2026-08-18）

1. **apply の audit target 変更**: `check_lines:<line_id>` → **`checks:<check_id>`**（before/after は
   time_auto 行の **jsonb 配列**）。行が2本になり単一 line_id では系列を表せないための意図的変更＝
   監査検索は 0089 適用時点を境に target キーが不連続（旧系列は 'check_lines:'・新系列は 'checks:'）。
2. **check_remove_line と time_auto 行の関係（仕様確定）**: remove_line に kind/fee_kind/time_auto の
   削除ガードは無い（従来どおり）。**auto 店**＝time_auto 行を削除しても次の apply（会計タブ遷移）が
   再生成＝自己修復・実質消せない（総額保存則）。**manual 店**＝check_open が入れた set 行を削除すると
   apply が動かないため**復活しない＝これを仕様とする**（セットを外したい営業判断を remove_line 1発で
   表現できる。check_extension_add の延長行も同様に remove_line で取消）。

### 段48（R-A・2026-08-18）: 0089 の app 結線と verify 張り替え（裁定26 書式）

- **pricing-apply 段44(3) 51→60**: 行分離仕様へ全面張り替え＝開卓 set 行（D節）・legacy 移行
  （fee_kind null 行を admin 再現→apply が delete）・2行体制・総額保存則（Σtime_auto=total）・
  額0で行なし（delete 分岐）・rewind 100分で ext 行実体化（qty=blocks×units・鏡像突合）。
- **rls B4 2件置換**（本数不変 472）: 「自動行=1本」→「2本（set 5000×1・ext 2000×qty2）・
  再呼びで同一 id 2本のまま・set 不変/ext 更新・Σ=total」。
- **grants 4件更新**（本数不変 282）: G26 index 逐語を (check_id, fee_kind) 版へ・G31 の
  register helper 14→15／operator 16→17／fail-closed 形 14→15（check_extension_add 増分）。
- **billing 正本改訂＋5 pin 更新**（本数不変 50）: 課金ゲート対象 v1 を対象 88 本へ
  （A1 18本・kiosk 腕 14本・全数 171＝live 一致）。check_extension_add はゲート内蔵（規則A形）が
  段47-1 の双方向集合一致・挿入行形・段47-3 kiosk 腕で機械検証済み。
- **verify:f0 合計 2607→2616（18本・全緑・実測）**。


## 裁定30（2026-08-18）E8 構成追随の裁定書収蔵と「意図的非追随」3件の恒久記録

正本＝`docs/NOX_E8裁定_v1.md`（マトリクス＝`docs/dp/e8_gap_matrix.md` に全134件を転記済み）。
原則: [A][B]＝モックへ寄せる（一括採用）・[C]＝個別裁定。段構成は E8-1〜E8-6。

### 収蔵時の修正1点

`analytics#6 自動インサイト` を **不採用 → ペンディング**（後送り群）へ移動し、**E8-6 実機後に再裁定**。
これにより **不採用の確定は2件のみ**＝staff#7（機密アクセス権限のデータ化・認可設計 §1.2 案A と衝突）／
audit#3（ハッシュチェーン・保管ポリシー実体・過剰）。
※staff#2（PIN 設定済み数の KPI）は「deny-all で構造上実現不能」による不採用＝性質が異なるため別掲。

### ★裁定0 型の恒久記録（差ではなく「裁定済みの非追随」＝以後モックとの差分に数えない）

1. **料金設定の会計ルール（pricing#5・時間課金の確定時点＝判定時刻）**: 判定時刻を2つ持たない＝
   **開栓時凍結の単一時点主義を維持**（`pricing-board.tsx` にコード内注記あり）。モックの
   `setting-row` 12項目のうち「確定時点」「自動延長」系は本裁定により**追随しない**。
2. **営業時間の一括設定バー（営業時間#6）**: 曜日ごとの個別保存を維持＝
   **未設定の曜日を一括で作らない**（意図しない営業日の生成を防ぐ）。既存 RPC の連続呼びで
   実現可能だが、あえて採らない。
3. **席の削除（席#5 の削除部分）**: 物理削除を持たず **is_active の無効化で代替**を維持
   （伝票・予約からの参照整合を壊さないため）。検索/フィルタ/並べ替えは E8-5 で採用するが、
   **削除ボタンは追随しない**。

契機: E8 プリフライト（13モック×実画面の構成差134件）で、これら3件が「実装の欠落」ではなく
**コード内に理由が明記された設計判断**であることが判明したため、差分表から恒久的に外す。

### 段48b: mig0090（check_set_people）の照合結果＝合格（適用前）

A1 ゲート4ブロック（0057(1)/(2)・0088 billing・0058 fail-closed 5腕）が `check_add_line` と
**コメント除去後 逐語一致**／A2 `checks_people_check = ((people IS NULL) OR (people > 0))` と
`p_people` 検証が整合（null 許容＝人数クリア可）／A3 更新対象 `time_auto ∧ fee_kind='set'` は
0089 の行構造と一致（apply の set 行と同式・**manual 延長行 time_auto=false と auto ext 行は非対象**）／
A4 `audit_log_write` 5位置引数の型順一致。★**適用時は課金ゲート正本（対象88→89本・A1 19本・
kiosk 腕 15本）と billing/grants の pin 張り替えが必要**（裁定29 追補の教訓と同型）。

## 裁定31（2026-08-19）E8 実装レーンの裁定収蔵（E8-3/E8-4/E8-6 系）＋教訓18〜20

E8-3〜E8-6 の各 mig ヘッダに「台帳収載済み」と記した裁定番号が実際には未収蔵だったため、
本裁定で一括収蔵する（正本文言＝各 mig ヘッダ・本チャットの裁定を転記）。E8-2 系（mig0092/0093）は
番号付き裁定なし＝「事実記録＝ゲート除外」等の裁定文言が mig ヘッダに直接記載済み。

### E8-3 系（mig0094・顧客レーン）
- **E8-3-1** grade text NULL可＋CHECK in ('vip','vvip')・null=無印・setter 専用 RPC（customer_update は不触）
- **E8-3-2** bottle 3列（remaining_pct/expires_on/shelf_no）全 NULL可 default なし・register 引数拡張＋update 新設（owner/manager）
- **E8-3-3** customer_notes append-only＋論理削除・RLS cast 腕なし（業務記録は担当 cast に非公開）・書込 RPC 専任

### E8-4 系（mig0095・シフトレーン）
- **E8-4-1** staffing_needs 時間帯化＝案A 行分割・from_min/to_min default 0/1440＝既存行は自動で終日バンド・backfill 不要
- **E8-4-2** ポジション軸は今回入れない（純増候補パーク）
- **E8-4-3** incentive の reason（≤200）＋target_cast_ids uuid[]（null=全員=現行完全互換）・明細テーブルなし
- **E8-4-4** 0083 非対称流儀踏襲・バンド重複は RPC ガード 'overlap'（exclusion constraint なし・半開区間交差判定）

### E8-6 系（mig0096・分析レーン）
- **E8-6-1** 時刻粒度=1時間・hour は JST 時計時刻(0..23)・曜日=biz_date（店別 cutoff 起点の営業日）の曜日・非ゼロ行のみ返却
- **E8-6-2** 返却形は returns table（jsonb 束ねにしない）
- **E8-6-3** 用途別3本（store_hourly_aggregate / store_category_aggregate / store_cohort_aggregate）
- **E8-6-4** 単層（内部+ラッパの2層にしない）・owner/manager のみ・p_store_id null=owner の org 合算（cutoff は店別適用）
- **E8-6-5** レンジガード: hourly/category=from/to（≤92日・既存流儀）・cohort=YYYY-MM＋months≤12
- **E8-6-6** store_sales_targets 新テーブル（cast_norms 対称＝UNIQUE(store_id,period)・period regex CHECK・bigint ≥0）＋setter（null=削除・なし→なし無音）
- **E8-6-7** 読取3本は非ゲート（「見える・出せる」原則＝B(f) 相当）・setter のみ billing ゲート入り（対象 92本へ）
- **E8-6-8** 5分類写像は DB に焼かない＝category RPC は kind×fee_kind 生Σ・写像は client 純関数
  （lib/nox/analytics/category-map.ts＝E8-2 日報の出荷済み kindSums と同値・fee_kind set/extension のセット帰属は将来耐性）

### 教訓18: mig の部分適用は「diff 差分0行」の顔で現れる（mig0092・2026-08-18）
dev DB が mig0092 の一部関数だけ先行コミットされた中間状態になり、適用後照合の diff が「変化なし」に
見えた（実際は check_void が不存在列を参照する壊れた状態）。手貼りは**開発・本番とも必ず1クエリで
全文一括**（部分貼り・分割 Run 禁止）。照合で「差分0」が出たときは成功と部分適用の両方を疑い、
事後診断値（オブジェクト数・引数数）で裏取りする。

### 教訓19: React の state 反映前保存（同一 tick の切替→保存は空振りする・E8-1c 実機）
トグル切替と保存ボタンを同一操作で押すと、保存が**切替前の state** で走って設定が空振りする。
実機検収では「切替」→（再描画を待って）→「保存」を別ステップで踏む。UI 側は onChange 即保存か
保存時に最新 state を ref で読む形が安全。

### 教訓20: 全数照合 pin は「非ゲート新設」で静かにズレる（2026-08-19 実測）
課金正本の全数（A+B）は、ゲート入り新設では pin 更新が波及で強制されるが、**非ゲート新設は
どの pin も赤にしないまま名簿からだけ漏れる**。mig0093 receivable_set_due・mig0094 の4本が
B 名簿未収載のまま「live 実列挙と完全一致」の表記が残っていた（E8-6 で live 185 vs 名簿 175 の
残差10本として発覚・全て非ゲート＝ゲート判定の網羅性には非影響）。→ B 名簿の追補は**要裁定**
（verify:nox-billing docExcluded=83 pin に波及）。恒久策の候補＝billing verify に「live 全数 −
（A∪B）=既知の残差リスト」の機械 assert を足し、silent drift を赤にする。

（契機: E8-6 後半 mig0096 適用後照合。0096 の読取3本＋setter で残差が 6→10 に拡大したことで顕在化）

## 裁定32（2026-08-19）E8-6c＝B 名簿追補・全数照合の機械化（E8-6-9）＋教訓21＋裁定30 の #6 確定

### E8-6-9（裁定・B 名簿追補と恒久同期）
教訓20 の残差10本を課金正本 B 名簿へ収載＝**B(f) 39本化**（mig0096 読取3本
store_hourly_aggregate/store_category_aggregate/store_cohort_aggregate＋課金述語 billing_writable_of
＋zero-arg ラッパ auth_org_billing_writable）＋**B(k) 新設5本**（0093 receivable_set_due・
0094 bottle_keep_update/customer_set_grade/customer_note_add/customer_note_remove＝事実記録）。
→ **A 92 ＋ B 93 ＝ 185 ＝ live pg_proc 実列挙と完全一致**。verify:nox-billing に
「live 全数 = 正本 A∪B」の機械 assert を追加（50→51本・docExcluded pin 83→93）。
以後、**非ゲート新設 RPC も mig と同一コミットで B 名簿を追補する**（ゲート入りの pin 波及と対称の運用）。
※billing_writable_of 自体が名簿に居なかったのは「A 見出し行にのみ登場＝パーサは見出しをスキップ」のため
（残差は当初報告の9本ではなく10本＝機械 assert が確定させた）。

### 裁定30 の更新: analytics#6 自動インサイト＝後送り確定
E8-6（分析段）の実機確認を経て再裁定＝**後送り（post-launch）で確定**（ペンディング解消）。
閾値定義・文言生成のルール層は post-launch 台帳へ。E8 のペンディングは 0 件になった。

### 教訓21: 名簿は機械 assert で live と同期を強制する（手動追補の腐りを構造排除）
「正本に転記済み」という人手の宣言は、pin を赤にしない変更（非ゲート新設）で必ず腐る（教訓20）。
live と一致すべきリストは、その一致自体を verify の assert にする＝教訓13「本数は実測のみ」の文書版。
adversarial 実証: 名簿から1本欠いた想定へ一時改変 → `FAIL: liveOnly=[receivable_set_due]
docAll=184 live=185` の赤を実測 → 復元 → 51本緑（残置なし）。

## 裁定33（2026-08-20）R2 レジ第2弾 設計ロック（R2-1〜13＋v1.1 改訂4件）

正本＝`docs/NOX_R2_設計書v1.md`（v1 本体＋§5 v1.1 改訂・CC 照合5件の裁定反映済み）。
対象4テーマ: T-a 延長メニュー複数／T-a' 開卓時ルール手動選択／T-b 延長後合流の時点起算（money-core）
／T-c 領収書本格版（採番・QR・発行台帳・匿名公開ページ）。**本裁定をもって設計ロック**＝
以後の実装は mig0097→0098→0099 の順で恒久手順（底本逐語採取→起草→照合→手貼り→検証バンドル→
app 実装→目視→push）。

### 正本文言の供給（docs 不在分・本裁定で正本化）
- **正本A（v8 §3 逐語）**: 延長メニュー複数（30分¥3000/60分¥5000・manual 店・pricing_rules extension
  複数行が受け皿）／延長後合流の時点起算（セット中合流=遡及・延長後合流=そのブロックから加算）。
- **正本B（BANZEN 資産）**: ①anon 面は公開専用 SECURITY DEFINER RPC のみ・**最小本数を白名単管理**
  ②QR トークンは乱数 UUID・**有効期限90日** ③期限切れ・不在は **raise せず null/空 return**
  ④公開ページは PII 最小（店名・金額・日付・発行番号のみ）。

### R2-1〜13（要旨・逐語は設計書 §1）
- **R2-1** checks.ext_menu_snap jsonb 新設（開栓時に有効 extension 全件を priority 順で凍結）＋
  check_extension_add に p_rule_id default null（null=既定＝現行互換）・押下時はスナップから解決。
- **R2-2** 一覧読取は新 RPC 不要（ext_menu_snap を読むだけ）。**R2-3** 複数メニューは manual 専用・
  auto の 'auto mode' ガード維持。**R2-4** 開栓後のマスタ変更は既存伝票に非波及（凍結原則の拡張）。
- **R2-5** check_open に p_set_rule_id default null（開卓時ルール手動選択・選び直し不可＝void→再開卓）。
- **R2-6** セット中の人数変更=全遡及維持／延長ブロック確定後=そのブロック以降のみ。manual は既に
  時点起算＝不触・改修対象は auto の apply のみ。
- **R2-7** check_lines.block_no 追加＋部分ユニークを (check_id, fee_kind, block_no) where time_auto へ
  張り替え〔→ v1.1 改訂〕。**R2-8** verify 張り替え承認（pricing-apply 約19本＋set-people 6〜10本・
  rewind 方式・adversarial 最低2本＝遡及消滅の証明・段49(4) は正解のまま）。
- **R2-9** 新テーブル receipt_issues（ePOS の「採番テーブルを作らない」裁定はレシート＝会計証跡の話で
  あり領収書＝金銭受領証とは別物）。**R2-10** store×通し連番・1枚1行〔→ v1.1 改訂〕。
- **R2-11** anon 面は nox_receipt_public の1関数から開始〔→ v1.1 改訂〕。**R2-12** 発行日と取引日を併記・
  適格請求書事項は紙側。**R2-13** E8-1 分割領収書の既知欠落2点（伝票総額粒度・印刷実行日）は
  receipt_issues 化で自然解消・揮発 UI は receipt_issue 結線へ置換。

### v1.1 改訂4件（CC 照合5件への裁定・逐語は設計書 §5）
1. **R2-7 改訂（照合①）**: set 行は **block_no=0 固定**（null をやめる）＝3列推論の on conflict が
   set/extension 両対応。auto extension の確定ブロックは block_no=1..n。
2. **R2-7b 新設（照合②）**: 凍結＝「最初に生成された apply 時点の units で凍結・以後不触」。
   **check_set_people を2段 apply 化**（①更新前 apply で旧 units 凍結→②people 更新→③apply で
   進行中ブロックのみ新 units）＝放置伝票でも時点起算が厳密成立。**裁定9(b) の自然冪等は
   「同一状態からの apply は決定的」へ意味を精緻化**（履歴依存は行凍結という明示状態に記録）。
3. **R2-10 改訂（照合③）**: FOR UPDATE を撤回し **UNIQUE(store_id, serial) 衝突リトライ**
   （max+1 insert・unique_violation 捕捉・最大3回・3回失敗は 'busy'）。カウンタ行テーブルは作らない
   （0053 注記の罠を回避）。
4. **R2-11 改訂（照合④⑤）**: pin 実態を実測どおり置換＝(A) grants **G2b を「白名単1件を除き0本」**へ
   改訂＋白名単の機械 assert 新設（教訓21 同型）(B) anon-guard へ公開 RPC の正常系/異常系を列挙追記
   （+2〜4本）。「934本を白名単方式に作り替える」文言は削除。**門は SECURITY DEFINER 白名単**
   （token ゲートは引数で受ける DEFINER のみ安全・invoker＋anon select ポリシーは token を policy 式に
   束縛できずテーブル grant 開放の瞬間に全行列挙可能＝G2 も赤）。**G2b コメントの「将来の anon 公開は
   invoker で」は本裁定で上書き・コメント改訂**。白名単 RPC の安全要件＝引数は token のみ・返却は
   正本B④の最小5項目・不在/期限切れ/voided は null return・STABLE・search_path 固定・
   receipt_issues 以外を読まない。

### mig 分割と順序（設計書 §2）
0097 R2-b（block_no＋部分ユニーク張り替え＋apply 改稿＋check_set_people 2段 apply 化）→
0098 R2-a（ext_menu_snap＋check_open 拡張＋check_extension_add 拡張）→
0099 R2-c（receipt_issues＋receipt_issue/void＋nox_receipt_public）。
順序理由＝b が apply の意味論を確定してから a の複数メニューを載せる（逆順だと a の行生成を b で再改修）。
検証は段54〜56。**billing pin は 0099 で 92→94**（receipt_issue／receipt_issue_void の2本＝ゲート入り新設
＝pin 波及6回目・0096 と同型）。

### mig0097 起草の前提（CC 照合の実測を受理・2026-08-20）
- **on conflict 2箇所＋索引1本がセット**（現行 `check_lines_one_time_auto = UNIQUE(check_id, fee_kind)
  WHERE time_auto`・apply の on conflict は set 行/extension 行の2箇所とも同3語）＝R2-7 の張り替えは3点同時。
- **check_set_people の署名を変えなければ billing/grants pin は不動**（ACL は apply と同型＝
  postgres|authenticated|service_role・VOLATILE・SECURITY DEFINER）。
- **receipt golden 52 は不変**（fixture に時間行なし・金額段は Σline_total 由来＝行分割は総額に非波及）。
  実伝票の印字行数のみ増える＝段54 の期待どおり。
- 底本＝`nox_mig0097_live_defs.sql`（sha256 `2e9d8e48…7014c`・22130 bytes・348行・
  check_time_charge_apply／check_set_people を各1回・app 側鏡像2点を末尾併録）。

## 裁定34（2026-08-20）mig0097/0097b＝R2-b 実装（時点起算）・set 行二重化バグの検出と封鎖（R2-7c）＋教訓22

### 経緯（バグ検出→0097b）
mig0097（block_no＋部分ユニーク3列化＋apply 改稿＋set_people 2段 apply 化）は手貼り前照合合格・
適用後 byte 一致だったが、適用後の既存 verify 実測（自律チェック）で **set 行の二重化**が
5 assert の赤として顕在化。機序＝**check_open（0097 改稿対象外）が set 行を block_no=null で
insert し続ける**→3列ユニークは NULL distinct で null 行に効かない→apply の block_no=0 行が
conflict 不発火で新規 insert＝同一伝票に auto set 行2本（set 額の過大計上）。
手貼り前照合(5) は改稿対象の apply/set_people の中だけを見て、**改稿対象外の INSERT 経路
（check_open）が旧形式の行を再生産し続ける**ことを見落とした。実店は全店 manual のため実運用被害ゼロ・
verify fixture でのみ顕在化。→ **0097b（R2-7c）**: apply 冒頭に set null 行の無条件吸収 delete 1本
（extension null 吸収と対称・再適用可・同一署名置換＝pin 不変）。check_open 側の block_no=0 化
（再生産の停止）は 0098 同梱。0097b 適用で二重化系5赤は全治癒を実測。

### 段54（verify 張り替え＋直接検証・実測）
- pricing-apply: 60本不変（ext 行 assert をブロック行化へ張り替え＝行数=blocks・block_no=1..n・
  各行 qty=units・name #k。旧「qty=blocks×units の1行」は廃止）。
- set-people: 29→**42本**（+13＝段54 節）。(7) rewind 115分＝2ブロック確定+1進行中→people 2→3 で
  **確定 #1/#2 は qty2 凍結・進行中 #3 のみ qty3**・set 行は全遡及（qty3）・総額保存則=25500=Σ実測。
  (8) **放置伝票**（apply 未実行のまま 2ブロック経過）→set_people の2段 apply が旧 units で凍結＝
  (7) と同一形。(10) check_open の null set 行→apply→block_no=0 の1本へ収束。(11) null+0 二重化の
  再現→apply→単一行収束・checks.total 正常化（11000）。
- adversarial 3本: (7) を遡及想定（#1 qty3）へ→FAIL 実測→復元／(8) を全遡及想定へ→FAIL→復元／
  (10) を吸収無効化想定（set 2本）へ→FAIL→復元。いずれも残置なし。
- 鏡像3点: blocks 式は逐語不変＝check-calc.ts は**無改修**（契約コメントのみ 0097 追随）・
  receipt.ts は素通し印字で複数 ext 行が自動対応＝無改修（注記のみ・golden 52 不変を実測）・
  register-board の人数注記文言を時点起算へ更新（「全時間に反映」→「確定済みの延長には反映されません」）。
- ★段54(11) 初回実行の副次実測: **check_open は同一 seat の open 伝票を自然冪等で返す**
  （seat 再利用で新伝票は作られない）＝fixture は新規 seat 必須。

### 教訓22: 行形式を変える mig は「その行を INSERT する経路」を全数走査してから照合を閉じる
mig0097 の見落としは「改稿した関数の中」だけを照合し、**同じ行形式を作る他の INSERT 経路**
（check_open の set 行自動挿入）を走査しなかったこと。部分ユニークの推論列を変える・行に列を足す
改修では、`grep insert into public.<table>` を**全 mig＋live prosrc に対して**実行し、経路ごとに
「新形式で書くか・旧形式の吸収があるか」を表にしてから手貼り可を出す。NULL distinct なユニーク索引は
「制約が効いている」という思い込みの死角になる（null 行はすり抜ける）＝3列化のとき null を残す設計は
必ず「誰が null を作り続けるか」を問う。


## 裁定35（2026-08-20・遡及収蔵）R2-c 領収書レーン ＋ 課金app レーン①〜⑦ の裁定群

※**本エントリは 2026-08-21（DP3 P3）に遡及して収蔵した**。裁定34（R2-b）と裁定36（DP レーン完了）の
間に、**実装は着地しているのに台帳へ収まっていない2レーン**があり、34→36 が飛んで見えていたため。
番号は相談役の採番指示に従う（**34→35→36→37 が連番で自己説明する**）。

### A. R2-c 領収書レーン（mig0099・push `71c134c`）

| # | 裁定 | 内容 |
|---|---|---|
| A-1 | **`receipt_issues` 台帳を持つ**（mig0099） | 揮発 UI（E8-1c の `receiptSplitOf` によるその場の分割表示）を**発行台帳へ全置換**。1枚＝台帳1行。分割は**複数回発行**で表現する（1伝票に複数行） |
| A-2 | **serial は衝突リトライで採番** | `R-` 連番。並行採番の衝突は**リトライで吸収**（採番を止めない）。verify で並行採番を実測 |
| A-3 | **Σ発行額 ≤ 伝票総額 をサーバで守る** | `FOR UPDATE` ガード。**既知欠落だった「伝票総額粒度」の解消**＝画面側の合計に依存しない |
| A-4 | **★NOX 初の anon 面を作る**（`/r/[token]`） | `nox_receipt_public` を publishable key の素クライアントで server 実行。**UUID 形式外は RPC すら呼ばない**。不在・期限切れ・void は**同一の「見つかりません」表示**＝存在推測を与えない。掲載期限 **90日**・**PII なし**・`noindex` |
| A-5 | **anon 白名単の1号として登録** | `verify:nox-grants` の G2b 白名単＝`[nox_receipt_public]`。以後 anon に見せる関数は**この白名単に足す形でしか増やせない**（増えたら grants が落ちる） |
| A-6 | **印字は「発行済み全枚＝1枚1ページ」** | R- 番号＋**発行日と取引日を併記**（R2-12＝印刷実行日問題の解消）。内消費税 `floor(額×10/110)`＝ePOS `taxOf` と同式。登録番号は `settings_json.invoice_reg_no` が空なら非表示。**店名は発行時スナップ** |
| A-7 | **金額訂正は「取消→再発行」** | `receipt_issue_void`（理由任意）。台帳に void 済みの行が残るのが正＝痕跡を消さない |
| A-8 | **QR は uqr（依存ゼロ）** | `renderSVG` でモーダル 44px と印刷面 22mm の両方＝R2-13 のライブラリ選定を消化 |
| A-9 | **白地黒字の帳票トーンは画面パレット対象外** | `/r/[token]` は `.nox-dark` を着せない（DP でも**不触継続**＝裁定36） |

### B. 課金app レーン ①〜⑦（BIL-1〜10・mig0100・push `3144508`）

| # | 裁定 | 内容 |
|---|---|---|
| B-1 | **単一プラン**（裁定7 の適用） | プラン軸を持たず**周期（月/年）軸のみ**。donor の `plans.ts` / `resolvePlan` / `applyPlanFlags` は**移植しない**。画面にプラン選択 UI を出さない |
| B-2 | **status は NOX 5値**（`trialing/active/past_due/canceled/inactive`） | Stripe の7値からの写像を `normalizeStatus` に閉じる＝`incomplete→inactive` ／ `incomplete_expired,unpaid,未知,null,undefined→canceled` ／ `paused→past_due`（**安全側**）。書込可は `WRITABLE_STATUSES` 3値 |
| B-3 | **`billing_payments` は作らない**（BIL-4 の不採用） | donor の `recordPayment` / `jstMonthStart` も削除。**支払明細は Stripe を正とする**（二重台帳を持たない） |
| B-4 | **mig0100 は `cancel_at_period_end` 列のみ** | 本レーンの DB 変更は**この1本だけ**。`org_billing` の他列は既存（mig0087） |
| B-5 | **webhook が `org_billing` への唯一の書込経路** | raw body 署名検証必須・**HANDLED 6 events**・非 HANDLED は 200 素通し（Stripe に再送させない）。org 解決は2経路（`stripe_customer_id` ローカル → `customer.metadata.org_id`）。`subscription.deleted` のみ `markBillingStatus` で status だけ倒し、他は subscription 再取得→現在値 upsert＝**順不同・再送に強い** |
| B-6 | **cron 2本＋vercel.json 新設** | `expire-trials`（JST 3:00）・`billing-reminders`（JST 5:00）。保護は `Authorization: Bearer CRON_SECRET`。★`expire-trials` は**表示用であって判定ではない**＝`billing_writable_of` が `trialing` の期限を述語内で見るため、cron が落ちても課金判定は無傷 |
| B-7 | **失効文言は定数1箇所**（`BILLING_LOCKED_MSG`） | `isBillingLocked` で RPC の英語例外文字列との対応を1箇所に閉じる。kiosk のみ責任者表現の別定数 |
| B-8 | **失効バナーは述語の否定で出す** | `auth_org_billing_writable()` の zero-arg ラッパ（authenticated 全員に grant・boolean しか返さない）を使う＝**全ロールに告知でき課金情報は漏れない**。`org_billing` の RLS SELECT は owner 限定（mig0087）なので**行を読む実装だと owner にしかバナーが出ない** |
| B-9 | **`/billing` に billingGate は噛ませない** | 失効中でも**復帰できる必要がある**ため。webhook も同様（Stripe 発＝ユーザー文脈が無い） |
| B-10 | **★mail 基盤が無いので送信は実装しない** | `billing-reminders` は対象を数えて `mail_disabled:true` を返すのみ。**無い基盤に合わせた偽実装を置かない**（送信手段が入ればループ内に1行足せば完成する形） |

**この2レーンの申し送り（2026-08-21 時点）**: 課金app は **Stripe env 未設定**
（`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `PRICE_NOX_MONTHLY` / `PRICE_NOX_YEARLY` /
`CRON_SECRET` がいずれも `.env.local` に無いことを実測）＝実呼び系は動作不可。
`verify:nox-billing-app`（169本）は **env 非依存の純関数スイート**なので緑のまま＝**課金app ⑧の前提は env 投入**。

## 裁定36（2026-08-21）#7.5 デザイン移植レーン（DP）完了＝DP0/DP1/DP2 の全裁定と成果

※かつて裁定35 は欠番だったが、**DP3 P3（2026-08-21）で遡及収蔵して補充済み**
（裁定35＝R2-c 領収書レーン＋課金app レーン①〜⑦）。**34→35→36→37 が連番で通る**。

**レーンの定義**: 本レーンは **#7.5 デザイン移植**（2026-08-20 前倒し裁定）。内部段は
**DP0（調査）/ DP1（構造変換）/ DP2（意匠仕上げ）**。repo 既存の D0（2026-07 ダーク移行）・
E レーン（E0〜E8）とは**別物**。canonical は `mock/pages-2026-08/`。

### 裁定一覧（DP0-1〜6＋DP0-4改訂＋DP1-①〜⑪＋DP2-①②）

| 裁定 | 内容 |
|---|---|
| DP0-1 | 14枚目 = **M2待遇 canonical・DP 対象外**。トークン多数決の母数は **13枚**（E1 据え置き）＝`--card2 #22221e` / `--ink #f3f0e8` を維持（14枚にすると `--panel3` `--text` の2値が 7:6 で反転するが**採らない**） |
| DP0-2 | アバター色は I2 据え置き（**恒久対象外**）。DP2 の是正は**分析ビューの内部用語のみ** |
| DP0-3 | 生 hex 是正＝`theme.ts` の旧 `--bg` 削除＋金暗面3色＋残り。**意図的3件は据え置き** |
| DP0-4（改訂） | **`mock/pages-2026-08` は構造 canonical**＝DP1 で実装の IA・レイアウト・動線をモックへ寄せる（初版の「実装 IA が正・見た目のみ」を上書き） |
| DP0-5 | 対応表は **33ルート基準**（E レーン当時の30から `/billing` `/receipts` `/r/[token]` の +3） |
| DP0-6 | フォント＝sans **Inter + Noto Sans JP** ／ serif **Lora + Noto Serif JP**（旧 Georgia 役＋旧 Yu Mincho 役を一本化）。Outfit / Zen Kaku Gothic New / Cormorant Garamond は **canonical から降格** |
| DP1-① | `/register` はモック構造へ追随。ただし **v3 動線**（卓選択→全画面切替・「← フロア」・会計後自動復帰）が**優先** |
| DP1-② | `/master` は**ルート分割**（seat / hours / system を個別ルート化） |
| DP1-③ | `/payroll` は裁定18 維持・**構造も不触** |
| DP1-④ | `cast-comp` 4ページは **M2待遇レーン扱い・DP 対象外** |
| DP1-⑤ | **E5 裁定0（レジ構成差は不追随）を上書き**＝追随する（保留であって恒久不追随ではなかった） |
| DP1-⑥ | 分割ルートの URL は**モック名準拠**（`/master/seats` `/master/business-hours` `/master/system`） |
| DP1-⑦ | `/master/system` は**モック準拠の4タブ再編を含む**（端末／PIN／プリンタ／機密） |
| DP1-⑧ | `/register` は **b 採用・c 不採用（v3 優先）・d は起票記録のみ** |
| DP1-⑨ | `casts#9` 登録フロー集約を実施（M級 IA・機能不変・RPC/RLS 非改変） |
| DP1-⑩ | 文書是正（ガイド §11-6 上書き・`register#1` 解消追記・d 3件の起票・対応表の訂正） |
| DP1-⑪ | **支払方法の3択は非追随＝NOX の4値を維持**（`payments_method_check` / `check_pay` の検証 / `daily_report_aggregate` の名指し集計の**3経路に直結**。新語彙は `other` にも落ちず日次サマリからサイレント欠落する。モックの「併用」は方法ではなく「分けて払う」操作で `payments` 複数行として機構は実装済み＝**導線の可視化で対応**） |
| DP2-① | **spacing はトークン化しない**（モック13枚にスケール不在＝役割別の最頻値が 31〜46%・±1〜4px の手調整分布。E レーン §4 の部品別実測記録を正本とする） |
| DP2-② | `analytics-board:552` の補助説明を「全店舗で集計（時間帯別・カテゴリ別・再来店）」へ（見出し3語の製品文言化に語彙を揃える） |

### 成果（構造＝DP1・push `66a64ae`）

- **`/master` 3ルート分割**（`f653639`）＝`/master/seats`・`/master/business-hours`・`/master/system` を新設。
  **リダイレクト不要**＝旧3ビューは URL を持たず（素の `useState`）壊れる既存 URL がゼロの純増。
  `system` は**モック準拠の4タブ**へ再編し `kiosk-panel.tsx` を端末／PIN の2部品へ分割。
  ナビは `MASTER_NAV` に群を1行足すだけ（描画側は不触の契約）。**products/categories/stock に続く3度目**の同型分割。
- **`/register` b 6件**（`00bdd15`）＝タイル列数（`.nox-seatgrid.floor` 8/4/2）／伝票取消のモーダル化／
  sectionhead 2段組／商品をクリア（**商品行だけ**＝set/time/charge/custom/discount は触らない）／
  **会計3段化（表示段のみ）**／併用導線。**c 1件（フロア縦並び）は不採用**＝v3 の伝票全面を維持。
  `kiosk-register` へも同基準で波及。
  ★**`check_pay` / `check_close` / `check_remove_line` は関数本体の sha256 照合で逐語不変を機械証明**。
- **`casts#9` モーダル集約**（`19e3d18`）＝モック `castDialog` 準拠。写真・プラン・招待は**送信に含めない**
  （authz と経路が別・`trial_hire` とフォーム共有＝E8-5 のスキップ理由が生きている）＝
  「登録した後に設定する項目」4行として同じ面に順序で見せるところまで。RPC 6経路と select 列集合は逐語不変。

### 成果（意匠＝DP2・push `304e757`）

- **フォント2語彙化**（`b178e1f`）＝`--font-sans` / `--font-serif` へ集約。`@import url(fonts.googleapis.com)` を廃し
  **next/font/google で自前ホスト**（262ファイル・和文は `subsets` 無し＋`preload:false` で unicode-range 込み取得）。
  生成 CSS に**旧フォント名 0件**を機械確認。
- **生 hex 18箇所是正**（同）＝金暗面3色を `--goldface` / `--goldface2` / `--goldface3` へトークン化（16箇所・値は同一＝見た目不変）
  ＋**E4 是正辞書の取り残し2件**（`theme.ts logo` の旧 `--bg` `#0B0B0F`／`.nox-medal.g1` の旧 gold `#C9A24A`）。
  是正後の live 生 hex は `.ts/.tsx` が**意図的3件のみ**、`globals.css` は印刷5行＋**一点物13行（要裁定）**。
- **spacing はトークン化見送り**（`304e757`・DP2-①）。
- **分析ビューの内部用語**（`6b3f7bf`/`304e757`）＝ヒートマップ→曜日別・時間帯別の売上／セグメント→客層の内訳／
  リテンション→初来店の月ごとの再来店／:552 の補助説明も追随。**画面文言としての内部用語は残存ゼロ**。
- **`/billing`・`/receipts` の初回意匠検収**（`6b3f7bf`）＝**逸脱ゼロ**（生 hex 0・非トークン色 0・
  `fontFamily` 直書き 0・未定義トークン参照 0）。E レーン後発の2ルートだが最初から canonical に整合していた。
- **14枚目を収蔵**（`f2c0c79`）＝git 追跡へ追加し台帳へ sha 全64桁付きで追記
  （`899e51000b21f705…6999f455` / 39,474 bytes）。**DP トークン母数外・DP 変換対象外**＝
  **実装はマスタ残りレーン**（`/master/cast-comp` 4ページは D2 で実装済み）。

### 不触の維持と申し送り

- **`/payroll`・`/r/[token]`・`app/page.tsx` は不触継続**（裁定18／R2-c 裁定／D2残差 #27）。
- **純増起票候補 d 3件**＝端末オンライン状態（`kiosk_devices` に last_seen 列なし・`kiosk_sessions.last_seen_at` は
  レジ端末のみ近似可＝E8 staff#5 と同一の裁定待ち）／席なし新規伝票（`check_open` が `p_seat_id` 必須＝RPC 改稿）／
  席の定員（`seats` に capacity 列なし＝卓タイルと入金モーダルの2箇所が同一原因）。
- **要裁定の残**＝`globals.css` の一点物 13行（トークン新設／最近傍へ丸め／現状維持）。
- **対応表の訂正**＝`nox-staff-system-settings` は `/staff` を含まない（h2 12本＝端末/PIN/プリンタ/機密のみ）。
  **分割後は mock 13枚がすべて 1:1**＝1:1 崩れは解消。`/staff` はモック無しの B型。
- **サーベイの誤りの是正**＝`#46 予約KPI4枚`・`#48 次の来店予定`は**実測で既に実装済み**だった（b→a 再分類）。

### 教訓23：是正辞書は「色の集合」ではなく「走査範囲」で漏れる

E4 は旧パレット4色（`#C9A24A/#23232B/#0B0B0F/#B8893A`）の辞書で全数是正を宣言し、
E5a/E6 が残置を消して「**旧パレットのリテラルは残ゼロ**」とガイドに書いた。しかし DP0 の実測で
**2種類の漏れ**が出た＝①**辞書外の色**（金暗面3色は最初から辞書に無い）②**走査範囲外のファイル**
（`globals.css` を見ておらず `.nox-medal.g1` の旧 gold が live で残っていた）。
→ **「残ゼロ」を宣言するときは、辞書（何を）と範囲（どこを）の両方を明記する**。
色名の列挙だけでは「その色は消えた」しか言えず、「リテラルが残っていない」の証明にならない。
DP2 では**コメントを除去した機械走査**で全ファイルの live 生 hex を数え、残った数を理由付きで表に載せた。

### 教訓24：トークン化は「多数決が成立するか」を先に測る

色は `--bg` が 13/13、他も 5〜9/13 で**多数決が成立**したのでトークン化できた。
spacing は役割別に測ると最頻値が **31〜46%**（`.formgrid` gap は 4/13）で、競合値との差は **±1〜4px**＝
**手調整の分布**であってスケールではなかった。ここで「上位値を採ってトークン化」すると、
値の根拠が無いまま数百箇所を機械置換することになる。
→ **トークン化の可否は、置換対象の数ではなく「値を決める根拠があるか」で決める**（DP2-①）。

## 裁定37（2026-08-21）DP3 構造残差レーン（shift ＋ announcement）＝DP3-①〜④

**レーンの定義**: DP3 = **構造残差**。`mock/pages-2026-08` の構造反映のうち、DP1/DP2 で扱わなかった
`/shift` と `/notices` を対象にする。**順序改訂裁定**＝**モック構造の反映が根幹・機能深部より先行**。
調査は `docs/dp/dp3_structure_survey.md`（DP3-S）。

### 裁定 DP3-①〜④

| 裁定 | 内容 |
|---|---|
| **DP3-①** | **`/notices` の b 5件を実装する**＝E8 の「ページごと触れない」（T3 LINE 前提）を**部分上書き**。E8 §4-7 が「先に入れる場合は要指示」と保留していた分に指示が出た形 |
| **DP3-②** | **`/shift` の手動シフト追加はモーダル化する**（モック `planShiftDialog`・DP1 P3 `castDialog` と同型） |
| **DP3-③** | **勤務時間の調整モーダルは入れる／「元の希望との対比」は入れない**＝`shifts` が希望の原型（`wish_id`）を保持しておらず出せないため。**対比は d＝シフト深部レーン**へ |
| **DP3-④** | **「配置を組む」4段フロー表示は出さない**＝実装の `status` は**採用/見送りの二値**でモックの中2段に実体が無く、出すと**実体のない段を描く**ことになる（`shift#6`＝T6 後送りのまま）。★あわせて**裁定2 の射程を明確化**（下記） |
| **DP3-⑤** | **`/notices` の宛先人数表示は (b) で実装**＝`page.tsx`（server）で件数だけ取り props で渡す（`categories`/`stock` と同じ `initial` 流儀・**+2 クエリ**・RPC 非改変）。DP3-① の b 5件目として保留していた分の解決 |

### ★裁定2 の射程明確化（DP3-④ の一部）

**裁定2（2026-07-17）「AI シフト最適化＝実装しない」の射程は「学習型」に限る。**
**規則ベース（貪欲法などの決定的アルゴリズム）は対象外＝移植してよい。**

- 根拠: 裁定2 が否定したのは**説明できない配置**（学習・最適化モデルが出す結果を人が検証できない状態）。
  BANZEN の貪欲法（流用マップ §7）は**規則が読めば分かる決定的な手続き**で、
  出た配置を人が追跡・修正できる＝裁定2 の懸念に当たらない。
- したがって E8 `shift#7`（自動配置＋配置ルール）は **裁定2 を理由に止まらない**。
  止まっている理由は**配置ルールを保持する列/テーブルが無いこと**＝**シフト深部レーン**で消化する。

### 実装（DB 変更なし・migration なし・RPC/RLS 非改変）

**P1 `/notices`（`9bcd250`）＝b 4件**

1. **検索**（`notices#8`）＝取得済み rows の client フィルタのみ・ヒット件数表示つき。
   ★状態フィルタは出さない（`notices` に status が無い＝T3/T6）。
2. **文字数カウンタ**（`notices#9`）＝投稿・編集の両方に `x/80`・`x/4000`。
   ★モックの本文カウンタは 1000 だが **NOX の実装上限 4000 を正**とする（RPC の `bad body` が 4000 で弾く）。
3. **「今月の掲載」KPI**＝モック4枚のうち **LINE 非依存の1枚だけ**。取得済み rows の `created_at` を
   JST 年月で数え直すだけ＝**新規取得ゼロ**。★他3枚（LINE連携／平均既読率／未連携）は**出さない**。
4. **定型文**＝**定数のみ**（DB に列を足さない）。`notices#3` の「テンプレートは定数で足りるが
   カテゴリ保持には列追加が要る」に従い**カテゴリとは分離**した。

**★b 5件目「宛先の人数表示」は DP3-⑤ で解決**（P1補・下記）。当初は「新規取得ゼロ」の原則から
逸脱するため**着手せず申告**していた（`notices-board` は `notices` しか取得しておらず、
`casts` と `memberships` の件数取得が新たに要るため）。

**P1補 `/notices` 宛先人数表示（裁定 DP3-⑤）**

- `page.tsx`（server）で **`count: "exact", head: true`＝行は取らずヘッダの件数だけ**を +2 クエリで取得し、
  `audienceCounts` として props で渡す（`categories`/`stock` と同じ `initial` 流儀）。**client の取得は増やさない**。
- 数えるのは **`is_active` のみ**（退店済み・無効メンバーは宛先に数えない）。可視範囲は RLS 任せ＝
  `casts`・`memberships` とも自店スコープ（page 側に store 条件を書かない）。
- **取得失敗は `null`→画面で「—」**＝嘘の 0 を出さない。人数は補助情報で投稿の可否には関わらない。
- 公開範囲の `<select>` を**モック準拠のカード3枚へ**（人数・ラベル・補足の3段）。
  **持つ値（`all`/`cast`/`staff`）も state も送る引数も不変**＝表示の置換のみ。
- ★**数の意味は「宛先」であって「見える人」ではない**。notices の RLS は
  `auth_role() <> 'cast' or audience in ('all','cast')`＝**オーナー・店長は公開範囲にかかわらず全件見える**。
  数だけ見せて誤解させないよう、その但し書きを画面に出した。

**P2 `/shift`（`0e839ad`）＝b 1件＋DP3-③**

- 手動シフト追加のモーダル化（`addShift` は本体 sha `58601460b1ff` で**逐語不変**）。
- 勤務時間の調整モーダル＝**新しい RPC は作らず**既存 `shift_set` の update 経路へ。
  **status は現在値を据え置く**（調整で予定→確定へ昇格させない）。予定・確定のどちらでも押せる。
- ★**予想人件費は不触**（`forecastDay()`・golden 55233）。

**証明**: `/shift` の**旧6 RPC 呼び出しを式まるごと sha256 で集合照合**し全件そのまま存在すること、
増分が `adjustShift` の `shift_set` 1本のみであることを機械確認。`/notices` は3経路とも逐語一致。
両画面とも `select` 列集合も不変。

### DP3 完了記録（2026-08-21・push `5cc664b`）

**commit 4本**（すべて DB 変更なし・migration なし・RPC/RLS 非改変）:

| # | commit | 内容 |
|---|---|---|
| P1 | `9bcd250` | `/notices` b 4件（検索・文字数カウンタ・今月の掲載 KPI・定型文） |
| P2 | `0e839ad` | `/shift` b 1件＋DP3-③（手動追加のモーダル化・勤務時間の調整モーダル） |
| P3 | `8636290` | 裁定37 収蔵＋**裁定35 の欠番補充（遡及）**＋DP3-S サーベイの裁定反映と申し送り |
| P1補 | `5cc664b` | `/notices` 宛先人数表示（**DP3-⑤**） |

**b の実装＝計7件**: `/notices` **5件**（検索／文字数カウンタ／今月の掲載 KPI／定型文／**宛先人数表示**＝DP3-⑤）
＋ `/shift` **2件**（手動追加のモーダル化＝DP3-②／勤務時間の調整モーダル＝DP3-③）。

**c は 2件とも不採用で決着**: 4段フロー表示は出さない（DP3-④・教訓25）／
勤務時間調整の「元の希望との対比」は入れない（DP3-③）。

**d は申し送り済み**: `/shift` の 5件（配置ルール・自動配置・下書き/公開・計画ビュー・原型対比）は
**シフト深部レーン**へ、`/notices` の 11件（LINE 連携・既読率・カテゴリ列・チャネル・予約/下書き ほか）は
**LINE レーン（T3）**へ。申し送りの本文は `docs/dp/dp3_structure_survey.md` の末尾。

**要裁定の残＝ゼロ**（DP3-S が挙げた4件は DP3-①〜④ で、5件目は DP3-⑤ で解決）。

**ゲート**: 各段で `verify:f0` **26本 / 3000 全緑**・golden 全一致
（wage 5931 / withholding 125802 / labor-forecast 55233 / receipt 52 / rate-back 64 / billing 51）。
P1補は新規 `select` を足したため **grants 283・rls 472・anon-guard 938 も個別に確認**。
`tsc` / `lint` 緑・`next build` 成功（**規約 §3-4b の3条件**で実施）。

**証明の型（DP1 から継続）**: RPC 呼び出しを式まるごと sha256 で照合。
`/notices` は3経路とも逐語一致、`/shift` は**旧6件を集合照合で全件不変**・増分は `adjustShift` の
`shift_set` 1本のみ。関数本体も `addShift` `58601460b1ff` ほかが sha 一致。
**予想人件費は不触**（`forecastDay()`・golden 55233）。

### 教訓25：「実体のない段」を描かない

モックが4段のフロー（希望→管理者確認→キャスト確認→確定）を見せていても、
実装の `status` が二値なら**中2段には対応する状態が無い**。ここで見た目だけ4段を描くと、
画面は「その段がある」と言っているのに**押しても何も起きない／進んだことにならない**。
→ **段・タブ・ステータスの表示は、対応する状態が DB にあるときだけ出す**（DP3-④）。
同じ理由で `/notices` の状態フィルタ（配信済/予約/下書き）も出さなかった。
E8 M7（キャスト会計許可のチェックボックスが恒久 disabled）で「防御は正しいが説明が無い」と
判定したのと同じ筋＝**無い状態を UI で作らない／有る防御は理由を書く**。

---

## 裁定38（2026-08-21）教訓26＝検収基準の恒久変更 ＋ DP-R 全画面再監査

### 教訓26：「要素の存在 ≠ 構造の一致」（恒久ルール変更）

DP3-S まで、モック反映の検収は**要素チェックリスト**（その要素が実装のどこかに在るか）で
行っていた。この基準では「在る＝a（一致）」と分類されるが、**同じ要素が別のタブ・別のカード・
別の順序・別のレイアウトに置かれていても a になる**。実際 `/shift` は要素基準では a が並ぶのに、
モックと**画面としては別物**だった（承認待ちの4段フローがシフト作成タブに在る、
create が2カラムでなく1カラム縦積み、配置ビュー（月カレンダー⇄スタッフ別）が無い 等）。

→ **今後のモック反映の検収は画面単位の構造照合で行う**。すなわち
**モックをブラウザ実表示した状態と実装画面を並べ、セクション構成・レイアウト・タブ構造・
情報の置き場がモックと同形かを画面ごとに判定する**。
**DP3-S の a 分類は本基準で無効**＝全画面を再監査する（＝DP-R）。

### DP-R 全画面再監査（`docs/dp/dpr_audit.md`）

判定は自己申告ではなく機械抽出の突合で行った＝モックは `HTMLParser` で body の DOM 順に
`nav.tabs` / `section.panel` / `card` / `cardhead>h2` / 骨格クラスを、実装は各 `*.tsx` から
`<section>` / 見出し実テキスト / `tab === "x"` 分岐 / 骨格クラスをソース順に抽出して並置。

**実測の判明事項**: **モックでタブを持つのは2枚だけ**（`nox-shift-management` 5本・
`nox-staff-system-settings` 4本）。他は縦スクロールで、`nox-pricing-settings` は `pagehead` 3本、
`nox-analytics-dashboard` は `kpis` 帯4本、`nox-daily-report` は2本＝**1ファイルに複数画面/ビューを積んだ体裁**。
この「積み」を実装のタブ/ビュー切替へ写したものは**構造一致とみなす**（静的モックの表現限界による差）。

**判定**: 不一致3枚（`/shift`・`/audit`・`/master/business-hours`）／部分一致9枚／
対象外2枚（`/payroll`＝裁定18・`nox-cast-compensation-all-in-one`＝DP0-1）。

### 修正順（相談役裁定）

| 順 | 対象 | 備考 |
|---|---|---|
| ① | `/shift` | 不一致13項目＝最大。SD レーンで RPC・純関数の実体が揃った直後＝結線先が全部ある |
| ② | `/notices` | **お知らせ・通知の器を全構築**。**LINE 実送信のみ無効化**。
データ源の無い数値は「—」か「準備中」で**嘘を出さない**（教訓25 の適用形＝実体が無いものを
「動くように」見せない一方、器そのものは作ってよい） |
| ③以降 | 判定表を見て相談役が裁定 | — |

---

## 裁定39（2026-08-21）DP-R 第3・4弾 ＋ R1〜R4（Agoora 裁定の反映）

### DP-R 第3弾（マスタ群4枚）／第4弾（/audit）

| 対象 | 結果 |
|---|---|
| `/master/business-hours` | モック4ブロックへ（KPI帯4枚／週間営業時間＝一括設定＋表／特別営業日／特別日を追加）。後2つは**実体なし**（mig0032 は「店×曜日」1テーブルのみ）＝器＋準備中。旧「#7 後送りにつき作らない」は本裁定で上書き |
| `/master/pricing` | **会計ルール4カード**。★**齟齬を申告→裁定 A（読み取り専用ミラー＋基本料金への導線）**を採用 |
| `/master/seats` | 一覧カードと編集カードを分離（モック同形）。席種カテゴリは器＋準備中 |
| `/master/system` | KPI帯4枚。**数えられるものだけ数える**（`kiosk_devices`・`staff_pin` は deny-all） |
| `/audit` | 上位4タブ12ブロックへ。日報・現金照合は `daily_reports` の実列で実装 |

#### 齟齬の裁定（A 採用）— pricing の「設定の置き場」

サービス料・カード手数料・端数単位・端数処理方法は `set_store_pricing` の引数で、
**指名料（本指名・場内・同伴）と同一の upsert**。自動延長（`time_mode`）も `set_store_time_pricing` の引数。
どちらも UI は「基本料金」タブのパネル1枚が保存する。モックはこれらを「会計ルール」に置くが、
**入力ごと移すと1本の atomic な upsert が2タブに割れる**（片方だけ開いた状態の保存が他方を巻き戻しうる）。
→ **A: 会計ルール側は読み取り専用のミラー＋編集導線のみ。保存経路は1文字も触らない。**

### 教訓27：プルダウンは「一覧できないもの」だけ（R2・恒久規約）

**選択肢7以下の入力はボタン群（seg／チップ）にする。プルダウンは選択肢が多く一覧できないもの
（キャスト・店舗・顧客・商品・席など件数可変のもの）に限って許可する。**

全数走査の結果（`docs/dp/r2_select_scan.md`）: `<select>` は全 **81本**。
**許可（動的・件数可変）51本 ／ ボタン化対象（固定 ≤7）30本 ／ 固定8以上 0本**。
是正実装は**裁定後**（今回の実装は R1 の出勤記録1本のみ）。
★是正時に注意が要るものを申告済み: 権限付与（黒服/店長）と指名種別（キオスク・金額に直結）は
**誤タップの危険が上がる**ため、確認を挟むか対象外にするかの裁定が要る。

### R1：出勤記録をシフト表へ統合

独立区画「出勤板」を廃止し、「本日のシフト」表に **出勤記録列**（ボタン群）を追加。
`attendance_set` の RPC・引数・値域は不変。
★**同伴・休みも残した**（値域は5つ＝落とすと記録できなくなる。同伴は売上の同伴カウントに使う実データ）。
★**解除（未記録に戻す）は現行 RPC の仕様内では不可**（`p_status` が null／5値以外は `bad status`）＝選択替えのみ。
★**申告**: 旧「出勤板」の日付ピッカーが無くなるため、**過去日の出勤記録の修正は本画面からは行えない**
（当日運用の機能のため今日固定で足りると判断。過去日の修正が要るなら別途裁定）。

### R4：確定シフトタブ＝人ベース月カレンダー

日セルに確定者の名前チップ（先頭3名＋「他N名」）、日タップで全員展開＋時間調整への導線。
**confirmed だけを描く**＝「確定シフト」の名に嘘をつかせない（教訓25）。
「表で見る」トグルで現行リストを残置・CSV 出力は維持。
役割分担を画面が自己説明（カレンダータブ＝充足管理／確定シフトタブ＝誰がいつ）。

### R3：タイポ・余白のモック実値写し（第1弾＝/shift・/notices）

ルート要素に `.nox-mv1` を付けた配下だけに効く上書きを `globals.css` に追加。
**共有クラスの素の定義は一切変えない**（他画面へ波及させない）。全画面展開は Agoora 目視合格後。
★**DP2-① とは別件**と明記: あちらは「共通の段階値を作るか」の判断、こちらは
「モックの実値をその画面へ写すか」＝よって**変数化せず数値を直に書く**（写した元をコメントで示す）。

### 記録のみ（実装は変えない）

**営業時間の入力作法差**: モックは「閉店＜開店なら**自動的に**翌日扱い」、NOX は**「翌」チェックが必須**で
オフだと `bad hours` で弾く。保存される値（30時間制表記）は同一で、入力の作法だけが違う＝**実装維持**。

---

## 裁定40（2026-08-21）R2 是正の確定 ＋ 教訓28 ＋ B1〜B5 一括バッチ

### R2 是正の確定（走査30本の裁定）

| 区分 | 本数 | 裁定 |
|---|---|---|
| ボタン化 | **28** | 承認。seg／チップへ置換（RPC・引数・値域は不変＝表示置換のみ） |
| 権限付与（`staff-board.tsx:317` 黒服/店長） | 1 | **ボタン化＋確認ダイアログ必須**（「〇〇さんを店長に変更しますか？」） |
| 指名種別（`kiosk-register/page.tsx:794` 本指名/場内/同伴/フリー） | 1 | **対象外・現状維持**。★許可理由＝**単価に直結**し、プルダウンの**二段動作（開く→選ぶ）が誤操作ガードとして機能している**。1タップのボタンにすると触りやすい端末で単価を取り違える危険が上がる |

### 教訓28：CSS コメントにパス文字列を書かない

`globals.css` のコメントに `**/shift` と書いたところ、`*/` がコメントの終端になり
以降が CSS として解釈されて `cssnano` が `Unexpected '/'` で落ちた（R3 で実測・build 失敗）。
→ **CSS コメント内にパスや `*` を含む装飾（`**…**`）を書かない**。書くならスラッシュの前に `*` を置かない。
同じ理由で `/* … http://… */` も避ける（`//` は無害だが `*/` を作る綴りに注意）。

---

## 裁定41（2026-08-24）DP-R／R／B 一括バッチ完了 ＋ 教訓29

### 完了範囲（push 済み・`9d5c0d1`）

DP-R 全画面再監査（教訓26）→ 第1弾 `/shift`／第2弾 `/notices`／第3弾 マスタ4画面／第4弾 `/audit`、
R1（出勤記録の統合）・R2（プルダウン走査）・R3（タイポ写し）・R4（人ベース月カレンダー）、
B1（ページヘッダ統一）〜B5（ホーム点検）、SD レーン V1/V2（mig0101/0102）、
SC レーン DB 編（mig0103）まで **18 commit を origin/main へ push**。

### 記録のみ（実装は変えない）

- **daily-report の順序差**: モックは「売上内訳 → 営業サマリー → 締め済み日報 → 現金照合 → 締めチェック」の順だが、
  実装は「プレビュー → 営業サマリー → 現金照合 → 売上ランキング → 締め → 金種 → 締め済み日報」。
  **締めの動線（数字を見る → 現金を数える → 締める）を優先**したため順序が入れ替わっている。
  構造照合（教訓26）は「同じカードが同じ面にあるか」で見るため一致扱いとし、順序差はここに記録して閉じる。
- **`dpr_audit.md` の誤記是正確認**: DP-R 監査で `/casts`「一覧の下の詳細カードが無い」・
  `/customers`「一覧と詳細がルート分離」と書いたが、**どちらも実測で誤り**だった
  （casts は行タップで開く3タブ詳細カード＋待遇プラン実値まで持つ／customers は一覧行がモック `.customer_row` と
  同形で右詳細ペインと導線も持つ）。**B4 で追加実装はせず、自己是正として commit `68a9830` に記録済み**。
  監査書そのものは当時の判断の記録として残す（後から書き換えない）。

### 教訓29：`git add -A` を使わない（対象を明示してステージする）

B1 のコミット時に `git add -A` を使い、**未追跡の `docs/tmp` / `mock` の scratch 39件を巻き込んだ**。
`reset --soft` で戻して意図した23件のみ再ステージし直した（`47479b2`）。
→ **ステージは常にパス明示**。`docs/tmp` は「repo に置くが追跡しない作業領域」という運用があるため、
`add -A` はその運用を壊す。以後 `git add <path> …` のみを使う。

---

## 裁定42（2026-08-24）今日タブ「＋追加」＝ページ内フロー・`ShiftAddForm` 部品化・既定 confirmed

**現状の問題**: 今日タブの「＋ 追加」は `setFDate(bizToday); setTab("build")` で**タブを飛ばすだけ**＝
その場で足せない。手動追加フォームは `shift-board.tsx` にインライン JSX で書かれ、
`fCast`/`fDate`/`fStart`/`fEnd`/`fStatus`/`addModal` の6 state と `bhRows` に密結合＝流用できない。

**裁定**:
1. 手動追加フォームを **`ShiftAddForm` として部品化**（state ごと切り出す・送る RPC と引数は `shift_set` のまま不変）
2. 今日タブの「＋ 追加」は**タブ遷移をやめ、その面でフォームを開く**（ページ内フロー）
3. **既定 status は `confirmed`**（当日その場で足すのは「もう入る人」＝予定ではない。
   `shift_set` は insert 経路で `p_status` をそのまま格納＝planned 固定ではないことを live 実測済み）
4. シフト作成タブ側の既存モーダルも同部品へ寄せる（見た目と既定値だけ面ごとに変える）

---

## 裁定43（2026-08-24）募集期間の粒度3択・重複禁止・希望提出は open 期間内のみ

1. **粒度は3択**（月／半月／週）。UI は開始日を選ぶと終了日が自動で決まる形にする
   （自由入力は残すが、既定は3択から作る）
2. **同一店で期間の重なりは禁止**＝mig0103 の `shift_periods_no_overlap`
   （`EXCLUDE USING gist (store_id WITH =, daterange(start_date,end_date,'[]') WITH &&)`）が物理防衛。
   RPC は `exclusion_violation` を捕まえて **`'overlap'`** に翻訳（insert・update の2箇所）
3. **希望提出は open 期間内のみ**＝`shift_wish_submit` に
   「自店の `status='open'` な期間が `p_date` を含むこと」のガードを追加。
   **open 期間が1本も無ければ提出できない（fail-closed）**＝`'period_not_open'`。
   ★締切（`wish_deadline`）は**表示のみ**で提出をブロックしない（SD-6 据え置き）
4. **期間の作成時 status は `draft` 固定**（作った瞬間に募集が始まらない）。
   open への変更は明示操作（計画バーの状態遷移）で行う

---

## 裁定44（2026-08-24）`/shift` タブ順の変更・「カレンダー」→「仮シフト」改名

1. **タブ順を「今日 → 承認待ち → シフト作成 → 仮シフト → 確定シフト」へ**
   （現行は 今日／カレンダー／シフト作成／承認待ち／確定シフト）。
   ★順序変更で壊れる参照は**無い**ことを実測済み＝タブは配列の並びではなくキー文字列（`tab === "today"` 等）で
   分岐しており、URL・ルーティング・他画面からの `setTab` 参照はゼロ
2. **「カレンダー」→「仮シフト」に改名**。この面は**充足管理**（日ごとの人数の過不足）を見る面と位置づける
3. 充足計算は **全 status を分母に数える**（予定も確認待ちも「その日入る予定の人」）。
   ただし**内訳は3値で出す**（確定／確認待ち／予定）＝合計だけを見せて中身を隠さない
4. 不足日に **「出勤を依頼」** を置き、`/notices` へ**プリフィル遷移**（対象日・不足人数を件名/本文の下書きに載せる）。
   ★お知らせの掲載自体は既存 `notice_create` のまま＝新しい送信経路は作らない

---

## 裁定45（2026-08-24）キャスト別の一括作成（v1 は管理者側のみ）

`shift_bulk_set(p_cast_id, p_dates date[], p_start_hm, p_end_hm)`（mig0103 新設）を UI へ結線する。
- **v1 は管理者側のみ**＝「このキャストを、この日とこの日とこの日に入れる」という入れ方
- 定休日・同日既存は **raise せず `skipped` 配列で返す**（一括の性質＝1件の衝突で全部倒さない）
- 上限62日・`null`/重複日付は正規化・空配列は完全 no-op（`{inserted:0, skipped:[]}`）
- **キャスト側の「休み希望」kind は v2**（`shift_wishes` に種別列が無く、DB 変更が要る＝下の純増起票へ）

---

## 裁定46（2026-08-24）自動配置プレビューの改善

1. **プレビューをグリッドに重畳表示**（箇条書きではなく、仮シフトの月グリッド上に「入る予定」を重ねる）
2. **0件のときは理由を出す**（希望が無い／全員が連勤上限／定休日／必要人数が満たされている 等）＝
   純関数 `autoAssign` は既に `unassignedWishes` と `shortages` を返すので、**理由の材料は揃っている**
3. **公開済み（`published`）の期間ではプレビューを無効化**（`shift_auto_apply` が `'period published'` で
   拒否するため、押せるボタンを出すと「押しても何も起きない」になる＝教訓25）
4. 黄バナーの文言を修正（現行「未処理の希望が N件あります」→ 何をすればよいかまで書く）
5. **3段ガイド**を置く（① 期間を作る → ② 希望を集める → ③ 配置を組む）＝
   初見で「どこから触るのか」が分かるようにする

---

## 裁定47（案・Agoora 最終裁定待ち）シフト成立の3パターンと公開ボタン2種

★**本項は案であり確定していない**。実装は最終裁定の後。

| # | パターン | 経路 | 結果 status |
|---|---|---|---|
| P1 | 希望どおり承認 | 承認待ち → 「希望どおり承認」 | **`confirmed` 直行**（キャスト確認を挟まない） |
| P2 | 直接配置 | 管理者が手で入れる | **`confirmed`** |
| P3 | 配置 → 確認 | 自動配置や時間調整をした | **`proposed`**（キャストの確認を待つ） |

- **公開ボタン2種**: 「仮シフトを公開（＝キャストに見せる）」と「確定して公開」を分ける
- **mig0104 が要る**: `shift_wish_decide` を P1 に合わせて改稿（現行は accept で必ず `planned`）＋
  **`shift_publish` 新設**（期間単位で proposed→confirmed／公開フラグを立てる）
- ★この裁定が入ると **SD-4（給与分母は confirmed のみ）の意味が変わる**（P1/P2 が即 confirmed になるため
  分母が増える）。**給与側の再確認とセット**で裁定すること

---

## 裁定48（2026-08-24・恒久規約）操作ボタンの体裁と一覧の選択行

1. **操作ボタンのラベルは中央揃え**
2. **最小サイズを設ける**（タップ標的として小さすぎるものを作らない）
3. **一覧は選択行のハイライトを必須**とする（どれを選んでいるか常に分かる）
   ★`/audit` の「記録の詳細」を独立カードへ分離したとき、選択行が分からなくなり
   金面ハイライトを後追いで足した（`0659871`）。この種の後追いを規約で先に潰す

→ **B6 レーンで全画面走査**して是正する（R2 と同じく、まず全数を数えてから裁定）。

---

## 裁定49（2026-08-25）欠番

本セッション中に「`--blue` とリンク色の衝突」として言及されたが、**実測の結果 repo 上に該当する衝突は存在しなかった**
（`--blue` は [globals.css:77](../app/globals.css) の宣言のみでモック由来・採否は E3 送り／アプリでの使用は
`shift-board.tsx` の4箇所ですべて `shifts.source === 'auto'` の意味／**リンク色トークンは未定義**で `a` に
`--blue` を当てている箇所はゼロ）。**誤認の記録として欠番を残す**（番号を詰めると誤認そのものが消えるため）。

---

## 裁定50〜60（2026-08-25）欠番

本セッション前半で番号を仮に確保したが、実体は**裁定61 以降に整理し直した**ため使用しなかった。

---

## 裁定61（2026-08-25・恒久規約）伝票の金額が動く操作の完了メッセージは、動いた金額を出す

1. 形式は **「同伴料 ¥3,000×1名 を追加しました（計 ¥3,000）」**。単価×数量の操作は**両方出す**。
2. 表示する数値は**伝票に実際に書かれた行の金額**とし、**マスタ価格からのクライアント再計算は禁止**
   （`back_snapshot` を凍結している設計と同じ理由＝乖離したとき画面が嘘をつく）。
3. 税の基準は**伝票の他の金額表示と揃える**。
4. 完了メッセージは**発生源のカード内に1つだけ**出す。他カードへの染み出しは**不具合**とする。
5. 対象は同伴料に限らず、本指名料・場内指名料の「＋按分」、延長、相席追加など
   **伝票行が増える操作すべて**。

★現状 `/register` で同一メッセージが**指名カードと同伴料カードの両方**に出ている＝不具合。**R-1 で修正**。

---

## 裁定62（2026-08-25・恒久規約）タイポグラフィの下限

役割ごとに下限を定め、**トークンで一括管理**する。

| 役割 | 下限 |
|---|---|
| 行の主情報（卓番・キャスト名・金額） | **17px / bold** |
| 本文・ボタンラベル | **15px** |
| 列見出し・フィールドラベル | **14px** |
| 注記 | **13px**（これが下限・**これ未満を作らない**） |

- **暗背景の小さい灰文字はサイズだけ上げても読めない**ため、**前景色も1段上げる**。
- 生の px リテラルを使わず **`--fs-*` トークン**に寄せる。
- **money 表示の桁は触らない**。

---

## 裁定63（2026-08-25・恒久規約）人から組む月カレンダーの日セルは2層を持つ

- **層A＝その日が今どうなっているか**（確定／打診中／仮／希望あり未処理／なし）を**下地**に。
- **層B＝今回の選択**を**上**に乗せる。
- **状態と由来は別軸**とし、**同じ表現に2つの意味を載せない**。
- **既にシフトがある日も選択可能**とし、**選んだ瞬間に上書きになると見える**こと
  （白紙の日と確定済みの日で、選んだ後の見え方が変わる）。
- **確定前に必ず内訳を出す**。例：`選択 12日 ＝ 新規 8 ／ 上書き 4（うち 確定2・打診1・希望承認1）`
- **二段確認は入れない**（毎回出る確認は読まれなくなる）。

---

## 裁定64（2026-08-25・恒久規約）希望由来は上書きしても消えない

「**本人が希望を出し承認された**」という事実は、時間を後で変えても**残す**。
理由は `back_snapshot` と同じ＝**確定した事実に後から別の意味を被せない**。
給与・労務の説明時に「**本人希望か店が入れたか**」が答えられる必要がある。

---

## 裁定65（2026-08-25・恒久規約）ノルマは出勤日数で数える（時間ノルマは存在しない）

- 主表示は**残り1本のカウントダウン**、内訳を下に添える。
  例：`ノルマ 20日／あと 8日／実績 12日（シフト13日・欠勤1）＋ 予定 10日 ＝ 22日／超過 2日`
- **実績＝`attendance` の記録**（**遅刻・同伴も出勤として1**、**当欠は0**）。
- **予定＝`bizToday` 以降のシフト行**。境界は**営業日基準の今日**とし、**二重計上させない**。
- **欠勤は0と数え、内訳に出す**（過去に遡って数字が悪化するのは**正しい挙動**・隠さない）。
- 選択を増減するたび**即座に動く**こと。**0 で達成**、超過はマイナスで止めず「**超過 N日**」と出す。
- **未達でも確定は止めない**。ノルマは**月単位**（裁定66）。

★**自動配置の純関数の第1ソートキーが「最低月間時間の未達」＝実在しない基準で並んでいる**。
　**日数へ修正が必要**（golden 33 assertions が動く・**Fable 5 案件**）。

---

## 裁定66（2026-08-25・恒久規約）ノルマは月単位で数える（半月で組んでも分割しない）

**半月は作成の単位であって、ノルマの単位ではない**。
前半を組み終えた時点で大きく不足するのは**正常**なので、そこで不足の赤を出すと**毎回赤くなり意味を失う**
（色の当て方は **B6** で詰める）。

---

## 裁定67（2026-08-25・恒久規約）働き方の条件は3層（評価順は ③ > ② > ①）

| 層 | 内容 |
|---|---|
| **①** | **未設定曜日の既定**（店舗既定＋人ごと上書き・入れる/入れない） |
| **②** | **曜日ごとの既定＋時間帯**（例：月水金 20:00-23:00 ／ 木 19:00-21:00） |
| **③** | **日ごとの例外**（本人が提出・休み/入れる・時間は任意） |

- 内部で持つのは「**その日に入れるか**」**1本**で、**極性は入力の見せ方に過ぎない**。
- **未提出日は既定に従う**（「未提出」と「入れないと言った」を**区別しない**）。
- キャスト側は**3層を見ない**＝日を押すだけで、**押した意味が人によって反転する**。
- 店舗差は**①の店舗既定で吸収**し、同じ店に**希望型と休み型が混在しても成立**する。

★**①②は組むときの初期値であって本人の約束ではない。確定は必ず管理側が押す**
　（裁定65 で**欠勤を0と数える**ため、混同すると**出し忘れた日に確定シフトが入り欠勤計上される**）。

- 時間の決定順序は **③の時間 > ②の曜日既定 > 営業時間**。**②がその人のデフォルト値**。
- 日セルの軸は**3つ（状態／由来／入れるか）**になるため、「**入れない日**」は**減光**する
  （既存の「過去日を減光」と同じ扱い・**押せるが目立たない**）。

---

## 裁定68（2026-08-25・恒久規約）画面外の設定へ飛ぶボタンは、ラベルを行き先の粒度に合わせる

日詳細モーダルの「**時間帯を設定する**」は**曜日×時間帯の店舗設定**へ飛ぶが、
ラベルが「**この日の**時間帯」と誤読される。

- ラベルを「**必要人数（曜日・時間帯別）を設定する**」に改める。
- 飛んだ先で**文脈を保つ**（元の日の**曜日行へスクロール＋強調**）。**戻り導線**を置く。
- **注記文言も同様に**、「この日の問題」ではなく「**曜日設定の不備**」であると書く。

**R-1 で実施**。

---

## 裁定69（2026-08-25・恒久規約）日詳細モーダルは4面すべてに「＋ キャストを追加」を持つ

- 並びは **空状態 → ＋キャストを追加 → 一覧** で統一。
- 既定 status は **面2（仮シフト）・面3（配置ビュー）が `planned`**、
  **今日タブ本体は `対象日 === bizToday ? 'confirmed' : 'planned'`**
  （裁定42 の「当日その場で足すのは もう入る人」は**当日限定の根拠**のため）。
- **`isManagerUp` ガード**を付ける。

---

## 裁定70（2026-08-25・裁定19 ② の改定）金の3役から「主ボタン」を外す

金は「**選択状態／バッジ**」の**2役**に絞り、**主要操作専用色 `--action-primary` / `--action-primary-hover`**
を新設する。候補 `#4F9FE8` / `#68B2F0` は**暫定**で、**黒背景上の輝度差を実測して確定**する。

**視覚強度の順位＝主要操作 ＞ 警告・危険 ＞ 選択中 ＞ 自動・補助 ＞ 装飾。**

- **`--blue` は auto（自動配置の出自）の意味を維持**し、**操作色には使わない**。
- 裁定19 ④「状態色は green/gold/red のみで新色を作らない」は**状態色の規約**であり、
  **操作色はその射程外**とする。
- 主ボタンは `lib/nox/ui/theme.ts` の `btnGold` 系に集約されているため**変更点は1箇所**。
- 実施は **B6（走査表）に統合**する。

---

## 裁定71（2026-08-27・レーン再編）R-2a の後は M（マスタ確定）を先頭に置く

順序を **R-2a → M（マスタ確定）→ R-2b → SC → B6 → P → LINE** へ変更する。

- **R-2b（キャスト別種別・check_close 改修＝裁定74）は店舗設定（請求とバックの分離）に依存する**
  ため、マスタ確定（M）の後に置く。
- **B6 を後ろにした理由**＝モック準拠の確定（裁定36 DP0-4 改訂）により、走査対象の面が
  **モック移植後に変わる**ため。移植前に走査しても結果が無効になる。
- ★**引き継ぎ v14 §3 のレーン順序（R-1 → B6 → P-1 → SC …）は前セッションの判断であり仮**。
  起動ブロックの実測で照合されるまで正本としない（本裁定が上書き）。

---

## 裁定72（2026-08-27・恒久規約）モック準拠の例外＝キャスト選択のプルダウンは不採用

- モック `nox-register-pos.html` の **`castSelect`（指名キャスト）／`shareCastSelect`（キャストを追加）**
  は採用しない。**カード／チップ選択（CastPicker）**とする。
- 根拠＝**20人超で素のセレクトは破綻**（シフト設計 §4 入口②「人を選ぶ」と同一の裁定）。
- **種別プルダウン（`nominationType`）は R-2b で存在自体が変わるため本裁定の対象外**（別扱い）。

---

## 裁定73（2026-08-27）分配率と分配結果は1カードに統合（モック超えの判断）

- モックの **2カラム（指名の分配率／分配結果）** を、実装は縦積みレイアウトのため
  **1カード「指名の分配率」へ統合**する。同じ人名を2枚のカードで2度読ませない。
- 1行＝**名前／実績配分（種別副文）／%入力／件数換算／×**。
- **件数換算（0.NN件相当）は表示のみ**＝本数の集計は在席キャストに満額計上
  （`lib/nox/payroll/collect.ts`）で、**golden 不変のため計算は触らない**。
  脚注で目安である旨を明示する。

---

## 裁定74（2026-08-27・設計骨子）R-2b＝キャスト別種別と請求/バック分離（★マスタ確定後に着手）

- **同伴と指名種別は別軸**とし、**同一キャストに同時成立を許す**（「同伴かつ本指名」）。
- **店舗設定で「請求」と「バック」を別々に持つ**＝同伴料請求／本指名料請求／同伴バック／
  本指名バック／同伴時の本指名自動付与、を**各々独立の設定**にする。
- **同一伝票・同一キャスト・同一種別の指名料行は一意制約で禁止**
  （現状ガードなし＝2回押すと2行入る実測あり・R-2 事前調査 2026-08-27）。
- **同伴料は cast_id 必須へ**（現状 `check_dohan_add` は cast_id=null＝同伴バックが計算不能）。
- **`check_nominations` にキャスト別種別列を追加**し、`check_close` の分配を
  「卓から1回引く（`checks.nom_type` 単一値）」から「**キャストごとに積む**」へ改修する。
- ★**裁定(g)（:168「指名は単一＝1伝票1 nom_type・モック準拠」）は本裁定により変更予定**。
  実装時に明示的に上書きする。
- **free の %入力不可・重み1固定（`check_set_nominations` の 'bad weight'）は R-2b まで据え置き**。

---

## 裁定75（2026-08-27・M-①②）請求/バック分離の器＝live の既存分離を正本と読み替える

- **裁定74「店舗設定で請求とバックを各々独立に」は、live の既存分離を正本と読み替える**。
  **請求**＝`stores.hon_fee` / `jonai_fee` / `dohan_fee` ＋ `pricing_rules`、
  **バック**＝`comp_plans` ＋ `cast_plan.overrides_json`。
  **店舗側にバック列を二重化しない**（`payroll/collect.ts` が `comp_plans` を直読するため）。
- **店舗設定に新設するのは「同伴時の本指名自動付与」1本のみ**。
  器＝`stores` の**実列 `boolean NOT NULL default false`**。
  **`settings_json` キーは不採用**（未存在キーが既定値で動く状態を増やさない）。
  **列追加は R-2b の mig に同梱**（挙動が同伴 `cast_id` 必須に依存）。**M では意味と既定値のみ確定**。
- 根拠＝**M-1/M-2 実測（2026-08-27）**。

---

## 裁定76（2026-08-27・M-③④）同伴の凍結経路と dohan_back

- **`check_dohan_add` が `pricing_rules` を参照しないのは設計書 v1.2 §3-2 どおり**。
  `check_open` が**開栓時に帯を解決して `checks.dohan_fee` に凍結**し、追加時はその凍結値を読む。
  **「同伴料は入店時の帯で決まる」を凍結原則として明文化**する。**改修しない**。
- **`dohan_back` の率方式（mode/rate）は M では追加しない**。
  **R-2b で同伴行の `cast_id` 必須化が済み、現場で率の要望が出てから**。

---

## 裁定77（2026-08-27・M-⑤⑥）小穴2件＝mig0104・Opus

- **`set_cast_rank_of` / `set_pricing_rule` は `rank_id` 指定時に `cast_ranks.is_active` を要求する**。
  **新規割当のみ拒否・既存参照は据え置き**。例外名＝**`'inactive rank'`**。
- **`comp_plans` に `UNIQUE (store_id, lower(name))` を追加**し、
  `set_comp_plan` に **`cast_ranks` と同型の `duplicate name` 検査**を入れる。**live 重複0件を確認済み**。

---

## 裁定78（2026-08-27・M-⑦⑧）スコープ外

- モック `plan.html` / `nox-cast-compensation-all-in-one.html` の**コンポーネント模型**
  （ポイント・利益歩合・達成ボーナス・保証判定単位 月/半月/日・複合スライド）は **M に入れない**。
  `comp_plans` 変更は **`payroll/collect.ts` 直撃で golden が動く** → **起票#25**。
- **`cast_plan` の期間列（履歴）は据え置き**。**遡及計算に効くため社労士回答と対** → **起票#26**。

---

## 裁定79（2026-08-27・M-⑨'）ランク別指名料は絶対額

- **`pricing_rules.amount`（`rank_id` 付き行）は基本指名料への加算ではなく絶対額**。
  モック `nox-pricing-settings.html` の「**基本の指名料金に加算する**」文言は**不採用**。
- 理由＝**率バックの母数が指名料額であり、加算にすると母数が二段になる**／
  **凍結値が1値で読み切れる**。**UI 文言もこれに合わせる**。

---

## 裁定80（2026-08-27・M-⑩）既定行の priority

- 指名料の**既定（`rank_id` null）行は UI から `priority` 200 固定**で upsert、**ランク行は 100**。
- **`pricing_resolve_core` の解決規則（特異性加点なし・`priority`→`created_at`→`id`）は不触**。

---

## 裁定81（2026-08-27・M-⑪）comp_plans の可視範囲

- **`comp_plans_select` を `cast_ranks` 型に揃える**＝**owner ∨ manager 自店**、
  **cast は自分の `cast_plan.plan_id` 行のみ**、**staff は不可視**。
- **RLS 変更＝Fable 5・mig0105**。
  **`casts-board` / `shift-board` の staff 経路が 0 行で壊れないことを実測してから mig 化**する。

---

## 裁定82（2026-08-27・専門家回答反映）NOX は計算「機構」を提供し、法適合の判断と責任は店舗に置く

- **NOX が提供するのは計算機構**であり、**労働関係法令・税法への適合の判断と責任は店舗**に置く。
- **既定は現場運用どおり**＝**上限も警告も掛けない**（手取り下限0・罰金上限なし・区分判定なし）。
  **法定上限・警告は「店舗が任意に有効化できるオプション」に留める**（既定 off）。
- **責任分配は利用規約で明記する**（**弁護士見解＝提供会社の責任は低い**）。
- **社労士回答 S1〜S10 は「設計の選択肢」として保持**する（実装義務としては読まない）。
  正本＝**`docs/NOX_専門家確認事項_2026-08-27.md`**（S1 天引き協定／S2 手取り下限1/4制限／
  S3 減給91条／S4 深夜割増／S5 社会保険／S6 雇用委託区分／S7 保証の形／S8 ポイント制／
  S9 達成ボーナス／S10 半月締め）。
- ★**含意**：S6 の「労働者性チェック／注意表示」は**画面警告層としては置かない**＝注意文は
  **規約・ヘルプ側**へ寄せる。S2 の `net = max(0, …)` も**既定のまま据え置く**
  （控除種別ごとの上限処理は**オプション実装**の位置づけ）。

---

## 裁定83（2026-08-27・専門家回答反映）payroll_finalize の「確定」の射程

- **`payroll_finalize` の「確定」＝キャスト報酬の集計確定**である。
- **社会保険・源泉は「目安」と明記**する。**雇用キャストの法定控除の確定は店舗／社労士側**に置く。
- **器は持つ**＝`insurance_status`・**標準報酬月額**・**都道府県**・**年齢**・**保険年度**。
  **計算は launch 後**（料率ハードコード不可＝S5 の社労士指摘に対応）。
- ★根拠＝S5「雇用係数1.0・天引きなしのまま給与確定するのは不十分／目安がシミュレーターだけなら可」。
  本裁定は**(a) 報酬集計の確定・社保は目安・器のみ**を採る。

---

## 裁定84（2026-08-27・M 棚卸し）モック無し13画面＝「モック外＝実装が canonical」

- **モック無しの13画面**（`/dashboard`／`/staff`／`/kiosk`（打刻 PIN 面）／`/login`／公開トップ `/`／
  `/r/[token]`／`/billing`／`/receipts`／`/mine`×4／**`/master/cast-comp/register`**）は
  **「モック外＝実装が canonical」**とする。**後からモックを起こさない**
  （起こすとモック照合の正本が2系統になり教訓40 の判定基準が壊れる）。
- ★**`/master/cast-comp/register`（キャスト会計の許可）は本裁定で初めて明記**＝
  `nox-cast-reward` 4本のどれにも会計許可の区画は無い。DP1-④は cast-comp 群を
  「M2待遇レーン所属・DP 対象外」と群単位で裁定しただけで、この画面のモック不在は
  どこにも書かれていなかった（M-10 逆引きで検出）。

---

## 裁定85（2026-08-28・M-11b）操作担当PINタブの開放範囲＝owner に加え manager

- **`/master/system` の「操作担当PIN」タブは owner に加え manager にも開放する**。
- **根拠**＝当該タブが呼ぶ RPC 群の権限判定が **「owner ∨ manager（自店）」**である
  （`staff_pin_status` は mig0108 で owner ∨ manager 自店を許可・`set_staff_pin` も従来から manager 自店可）。
  **UI だけ owner 限定にすると RPC との整合が崩れる**。
- **系（一般則）：表示範囲は RPC 権限と常に一致させる**。
  UI だけ絞るのは「隠しただけ」で防御にならず（真の防御は RPC / RLS 側＝二重防御の原則）、
  UI だけ開くのは RPC が弾く死んだ画面になる。**どちらもズレとして扱う**。
- **同タブ内の非対称は許す**＝ロック閾値の保存（`set_store_pin_policy`）は
  **mig0108 で `auth_role() <> 'owner'` 拒否**＝owner 限定のため、**パネル内で表示制御**する
  （タブの可視と個々の操作の可視を別に判定する。粒度は RPC 単位）。
- ★実装は **M-11b（commit b76db42）で先行**＝本裁定はその追認と一般則の明文化。

---

## 裁定86（2026-08-28・C1/C2）報酬モデル v2 設計書 v1 をロックする

- **正本＝`docs/NOX_C12設計書v1.md`**（sha256 `07abee03…9e86d7`・8,236 bytes・repo=掲出版 byte 一致）。
  以後の設計変更は**本書の版を上げてから**行う（写しは腐る・repo 収蔵版が正本）。
- **★2026-08-28 改版＝正本は `docs/NOX_C12設計書v1.1.md` へ**（sha256 `fb137dc4…3995b`・8,252 bytes・
  弁護士 L1〜L6 回答を反映し §7 待ちスロット3点を確定内容で充填。§2-1〜2-3・§5・§6 は v1 から不変）。
  **v1 は残置**（本裁定時点の凍結版として保存・実装の底本は v1.1）。
- **ロック前の裁定要求5点はすべて推奨案で確定**（設計書 §8 の裁定記録と対）:

| # | 論点 | 確定 |
|---|---|---|
| ① | 新報酬概念の持ち方 | **行型 `comp_plan_components` 新設**（列の増殖にしない＝`pricing_rules` 一般化と同型。`kind` 追加で伸ばす） |
| ② | dohan rate の解錠 | **RPC ガード＋UI 準備中**（`dohan rate requires R-2b`）。**CHECK 制約にしない**＝R-2b 後の解錠を RPC 差替のみで済ませ mig を増やさない |
| ③ | `cast_plan` の期間（起票#26） | **案A＝`valid_from`/`valid_to` 列＋同一 cast の期間重複を排他制約で禁止**（案B の履歴テーブルは不採用） |
| ④ | hon+dohan の合成（裁定74 の同時成立） | **加算を既定**（請求側が別料金線で立つ以上バックも独立に積む）。択一（高い方）は comp_plans のオプション候補 |
| ⑤ | mig 分割 | **1本（C1-1 一括）**＝全て挙動不変の追加のみなので **golden 6値不変を1回で証明**する |

- **受け入れ条件の二段構え**: mig 段は**スキーマ追加のみ＝golden 6値不変が受け入れ条件**、
  挙動段で初めて張り替えが起きる。★**張り替え対象は 5931 / 125802 の2値のみ**で、
  **55233 は労務予測の別系統＝不関与**（`docs/dp/survey_c12.md` の実測。注記 assert で固定する）。
- **L3（弁護士）待ちは §7 のスロットに隔離**＝`sanction` の上限器・委託 cast への ノルマ/罰金/売掛負担・
  `store_receivable` 天引きの3件。回答前でも他は実装できる構造にしてある。
- **モデルは Fable 5**（money 隣接・golden 張り替え・RLS 新設）。UI 段のみ Opus 可。
- ★着手順は **C3/C4 の後**（引き継ぎ v18 §3）。設計書 §0 は「R-2b の前」とだけ書いており
  C3/C4 との前後は書いていないため、**順序の正本は v18 §3 側**とする。
- ★本裁定は**設計の収蔵とロックのみ**＝実装・migration は開始していない。

---

## 裁定87（2026-08-28）二層ガード原則（裁定82 の精緻化）

NOX のガードは二層に分ける。第1層=法定数値が存在する領域（深夜時間帯・最低賃金・
雇用の減給制裁上限[労基法91条]・税計算・法定保存期間）は NOX がシステム強制。
第2層=店舗事情依存の領域（委託の罰金・ノルマ・売掛負担）は警告＋契約根拠確認の
必須化＋確認記録の保存とし、NOX 独自の数値上限は作らない。根拠: 弁護士 L3/L6。

---

## 裁定88（2026-08-28）audit_logs 永久保存方針の撤回

「audit_logs 全件・削除なし」を撤回し、データ種別別 retention へ転換する
（労務3年[将来5年]・会計原則7年・マイナンバーは必要期間のみ・CRM/監査ログは
ポリシー期間）。器: legal_min_retention_until / scheduled_delete_at /
anonymize_at / deletion_hold。実装は新レーン RT として独立（起票#36）。
根拠: 弁護士 L2。既存文書の「削除なし」前提箇所は survey_L.md c 項の列挙に従い順次是正。

本裁定は CLAUDE.md 原則6（全書込 RPC は audit_log_write を呼ぶ）を一切変えない。
変えるのは保持期間のみ。append-only 前提の検証 assert と現行挙動は RT レーン実装まで維持する。

---

## 裁定89（2026-08-28）receivable_policy と売掛4段分割

stores.receivable_policy（disabled / customer_only / cast_liability_allowed・
既定 customer_only）を持つ。売掛→キャスト負担→回収は一続きにせず
customer_receivable → cast_liability（根拠記録）→ settlement_request →
payroll_deduction（雇用/委託別チェック）の4段に分割する（本体は起票#37）。
C1 レーンは policy 器と payroll_deduction 直前チェックのみ実装。根拠: 弁護士 L1/L3。

---

## 裁定90（2026-08-28・C3/C4）税・会計ルール設計書 v1 をロックする

- **正本＝`docs/NOX_C34設計書v1.md`**（sha256 `eec01e97…8246a7`・8,820 bytes・repo=掲出版 byte 一致）。
  設計変更は本書の版を上げてから（正本は repo 収蔵版）。
- **ロック前の裁定要求5点はすべて推奨案で確定**（設計書 §8 の裁定記録と対）:

| # | 論点 | 確定 |
|---|---|---|
| ① | tax_category の置き場 | **マスタ＋`check_lines` スナップショット**（伝票凍結の既存原則と同型＝後からマスタを変えても過去伝票が動かない） |
| ② | taxable_8 | **enum 完備・UI 準備中**（4値 `taxable_10/taxable_8/exempt/out_of_scope` を器で持ち、UI 露出は3値。解錠は F5 差し替え点＝mig 不要） |
| ③ | 外税対応 | **内税/外税とも挙動段で実装**（既定 `tax_included`＝現行同値） |
| ④ | tax_rounding 既定 | **floor**（現行の `taxOf`=floor と同値＝mig 段 golden 不変の要。既存 `round_unit/round_mode`=金額側は不変・税額専用の新設） |
| ⑤ | card_surcharge | **本レーンで器＋警告まで実装**（taxable_10 固定・既定無効・有効化時は裁定87 第2層＝転嫁可否は加盟店契約次第の警告＋確認記録。`merchant_fee` は伝票外＝日報側現状維持） |

- **性格**: 実測（survey_c34_tax）が示したとおり現行実装は既に「値引き後課税・一伝票×税率×1回」に
  適合しており、本レーンは**新造ではなく「固定値の設定化＋税区分の器＋準備中の解錠」**。
  「伝票×税率×1回」の性質は新 assert で将来に対して係留する。
- **golden 予告**: 挙動段で **52（receipt）のみ張り替え**。**書込 RPC 新設/署名変更時に 51 が
  課金ゲート名簿の本数として動く**（`set_store_tax_config` 新設・`set_pricing_rule` 14引数化＝
  教訓21 の billing pin 同時更新）。5931/125802/55233/64 は不関与を注記 assert で固定。
  ★実績（2026-08-28・読み経路段）: **52→57 は読み経路段の新 assert 5本による本数増**
  （taxOf 既定引数同値／taxRound 3値／taxSettingsOf 既定補完／既定値明示＋tax_category 付与で
  XML sha 完全一致／一伝票×税率×端数1回の性質固定）。**金額系（5931/125802/55233）と
  XML sha pin 7本は不変・逆張り2系統（行ごと丸め注入＝10赤／既定値破壊＝3赤）済み・f0 2連続
  28本/3232 緑**。以後の golden 6値 = **5931/125802/55233/57/64/51**。
  ★実績（同日・§6-3＝mig0112）: **51→52 は A8 名簿+1（`set_store_tax_config`）の runtime 代表 1本**
  （対象 105→106・全数 200→201・billing pin 4点更新＝教訓21。逆張り=権限3系統＋ガード2系統の
  期待反転で 5赤→復元緑・f0 2連続 28本/3250 緑）。以後の golden 6値 = **5931/125802/55233/57/64/52**。
  ★実績（同日・§6-4 挙動段＝mig0113）: **三面同時改修が完了**（DB=check_open 凍結3列＋check_group_due
  外税分岐＋check_tax_round／TS=groupDueFull（check-calc）＋receipt.ts の外税/exempt 分岐・taxOf 第3引数）。
  **既定経路の XML sha pin 7本は無更新のまま全緑＝1バイト同値**（「金額張り替え」は外税という新経路の
  追加で消化＝既存 pin の張り替えは発生しなかった）。receipt 57→**64**（+7＝外税/exempt/鏡像手計算）・
  pricing 137→**148**（+11＝段43(21) DB↔TS 鏡像 C1〜C9）・billing 52 のまま（名簿は除外+1＝check_tax_round
  を B(a) へ・**教訓21 assert が f0 実走で名簿漏れを検知した初の実例**）。f0 2連続 **28本/3268** 緑・
  金額系 golden 3値不変。以後の golden 6値 = **5931/125802/55233/64/64/52**。
- 受け入れは二段（mig 段=列追加＋既定値=現行挙動で golden 6値不変／挙動段=三面鏡同時変更・Fable 5）。
- 店舗設定は4分離（`business_tax_status`/`price_display`/`invoice_status`+`invoice_reg_no`/`tax_rounding`）＝
  T5 の「内税/外税/適用しない」同列3択の解体。`registered ⊂ taxable` は RPC ガード。
- ★本裁定は**設計の収蔵とロックのみ**＝実装・migration は開始していない。mig C3-1 の前提実測は
  `docs/dp/survey_c3_lines.md`（同日実施）。
- ★注記（2026-08-28・mig0111 突合時）: **`withholding_payments.tax_category` は既存の同名異義列**
  （mig0075・源泉納付の税区分＝報酬/給与の別。0111 不触）。C3/C4 の `tax_category`
  （消費税区分 taxable_10 系）を列名で検索すると必ず1行混ざる。**混同しないこと（教訓40 の実例）**。

---

## 裁定91（2026-08-28・C3/C4 §6-5）料金モックの正本＝pages-2026-08 を維持・redesign は参照格下げ

- **canonical は `mock/pages-2026-08/nox-pricing-settings.html` を維持**（教訓40 の照合正本群の一員＝
  モック13枚 1:1 対応を崩さない）。`mock/nox-rate-settings-redesign.html` は**参照へ格下げ**
  （`pricing-board.tsx` ヘッダの「底本」記述は本裁定で是正）。
- **redesign 固有要素は pages-2026-08 へ移植する**（実測＝survey_c34_tax 4a＋同日再 grep）:
  ①「サービス料率 %」「カードTAX率 %」（サービス・カード料金区画＝実装の `service_rate`/`card_tax_rate` と同語彙）
  ②「端数処理」＝丸め単位（1/10/100/1,000円）＋丸め方（実装の `round_unit`/`round_mode`）
  ③「基本の時間料金」区画（stores の set/ext 既定＝帯0件フォールバックの器）
  ④「時間課金と会計の運用ルール」（時間課金確定タイミング等の運用注記）
  ⑤ 料金プレビューの「初回セット概算」注記。
  ※③④⑤は器の移植のみ・図柄の再設計はしない（M-10 型＝実装が正・モックを追随させる）。
- pages-2026-08 側の**税 UI は T5 回答で陳腐化**（「内税/外税/適用しない」同列3択・「TAX込み調整＝非課税」
  サンプル行）＝**同 phase のモック是正で2軸化・discount 化**する（裁定90 §2-4 の実施）。

---

## 裁定92（2026-08-28・C3/C4 §6-6）card_surcharge の v2.0 規則＝通常の課税 charge 行

- **card_surcharge は通常の課税 charge 行**＝既存 `check_add_line` カスタム経路の
  `kind='charge'`・`fee_kind=null`・`name='カード手数料(N%)'`。`tax_category` は RPC 未指定＝
  列 default `'taxable_10'` スナップ（T6 と一致・mig0111 の設計どおり）。**専用 kind/fee_kind は作らない**。
- **基底＝挿入時点の対象 pay_group の due**（サ料・税・店設定丸め適用後の請求額）× rate/100 を
  **round（half-up）で1回**。**挿入後は通常行として due 再計算に参加**して最終請求額が確定
  （外税店では手数料行にも税が乗る・サ料の母集合にも入る）。
- **二重取り防止は 1 pay_group 1行まで（UI ガード）**＝`kind='charge'` ∧ name 前方一致
  「カード手数料(」で判定。削除は既存の行削除経路。
- **支払い方法との連動なし（v2.0）**＝手動追加の導線のみ。card 選択時は導線を強調表示してよいが
  **自動挿入はしない**。`stores.card_surcharge_rate` が null なら導線非表示。
- **新 RPC/mig 不要を確認済み**＝`check_add_line` カスタム経路は `kind in ('set','time','charge','custom')`
  を受理し（prosrc 実測）、insert は12列＝`fee_kind`/`tax_category` を書かない → null / default 凍結。
- ★UI 追随（同日実装）: 表示 due の鏡像を `groupDue`（内税専用）→ **`groupDueFull`（完全鏡像）**へ
  差し替え＝外税店でもレジの請求表示が `check_group_due` と一致（内税/exempt は従来式へ委譲＝1バイト同値）。

---

## 裁定93（2026-08-28・C1-1）cast_plan の期間排他＝部分 unique＋RPC ガード（btree_gist 不採用）

- 裁定86-③（案A＝期間列＋排他）の**排他の実装方式**を確定する。**daterange の排他制約
  （btree_gist EXCLUDE）は不採用**とし、**部分 unique 2本＋RPC ガード**で排他する:
  ①現在行の一意＝`unique (cast_id) where valid_to is null`
  ②期間開始の一意＝`unique (cast_id, valid_from)`。
- 根拠＝**書込経路が `set_cast_plan` 単一**（live_c1.sql 実測・admin/seed は fixture 工作のみ）で、
  期間の連続性・非重複は v2 RPC（「現在行を閉じて新期間を開く」の1トランザクション）が
  構造的に保証できる。EXCLUDE 制約は btree_gist 拡張の追加が必要で、防御が RPC と二重になる
  割に fixture 工作（過去期間の合成）まで縛って verify を書きにくくする。
- v2.0（mig0114 時点）の意味論は**現在行の上書きのまま**＝履歴行の生成は挙動段の v2 RPC の責務。

---

## 裁定94（2026-08-28・C1-1）控除種別の器は C1-2 へ分離

- C12設計書 v1.1 §2-4（控除の6区分固定語彙＝A5 編入・`agreed_cost` 既定ほか）の**器は
  mig0114 に同梱しない**。**C1-2 として分離**する。
- 根拠＝対象テーブル（`deductions` / `advances` / `transport` / okuri 系）の **live 定義を
  底本として未取得**のため（**記憶で書かない**＝live 逐語 baseline の規律。0091 以降の全 mig と同じ）。
  C1-2 着手時に live_c1 と同型の実測（live_c1_2.sql）を先行させる。
- ★追記（同日・mig0115）: **deductions の live 取得（live_c1_rpc2.sql）により C1-2 は 0115 へ同梱・
  独立 mig として消滅**（`deductions.kind` 6区分固定語彙・default 'agreed_cost' の**列のみ・RPC 改修なし**＝
  既存書込は default で現行同値。receivables/advances/transport はテーブル自体が種別＝列不要）。

---

## 裁定95（2026-08-28・C1 §6-4 UI 段）components UI のモック対比と params 仮置き

- **モック対比（教訓40/42・実測）**: components 相当区画は**ある**＝`mock/nox-cast-reward/plan.html` の
  **composer（「本指名の報酬設計」＝報酬コンポーネントの併用設計・KPI「12コンポーネント」）**。
  ただし軸が違う＝モックは**報酬項目×方式**（固定金額/ポイント/売上歩合/利益歩合/スライドの5方式併用
  ＝起票#25 の kind 未実装群 point_rate/profit_share 系）、v2.0 DB は **kind 2種**
  （guarantee_min/achievement_bonus）。→ v2.0 UI は**モック composer の縮退版**（一覧＋追加の型は踏襲・
  kind 2種のみ）として実装し、5方式 composer への拡張は kind 追加（挙動段以降）で追随する。
  ＝**裁定84 系の「モック無し」ではない**が、対応区画の完全一致もない（縮退の明示が本裁定）。
- **params の形（UI が書く最小形＝仮置き・裁定要求ではない）**: 挙動段の payOf 実装と同時に確定する。
  それまで UI は次を書く:
  - `guarantee_min` → `{"period":"month"}`（判定単位は月固定＝半月/日は挙動段で解錠）
  - `achievement_bonus` → `{"thresholds":[{"pct":100,"add":N}]}`（1段のみ・N は p_amount と同値・
    複数段/率 mode は挙動段で）
- UI: 書込フォームは owner のみ（RPC の D3a と一致＝裁定85 の系）。非 owner はプラン行の選択で
  components とプラン構成プレビューを**閲覧のみ**できる。

---

## 裁定96（2026-08-28・C1/C2 挙動段）components 結線の仕様5点

| # | 論点 | 確定 |
|---|---|---|
| ① | guarantee_min | **控除前総支給への月次床・差額補填**＝Σ（時給・バック・スライド・achievement 込みの総支給）が保証額未満なら差額を加算。控除（売掛/前借り/送り等）の前に判定する |
| ② | achievement_bonus | 目標は **`cast_norms.sales_target` 固定**・実績は **`cast_sales_aggregate` の期間合計**。**target が 0 または行なしは不適用**（0除算・全員達成の事故を構造で封じる） |
| ③ | 適用順 | **バック・歩合 → achievement_bonus（priority 順）→ guarantee_min（最後）→ 控除**＝保証はボーナス込み総額に床を張る |
| ④ | 履歴 | `set_cast_plan` 4引数化（mig0116）＝null は現在行上書き（0114 同値）・指定日で履歴生成。**給与適用は「期間開始日時点で有効な行」＝期中変更は翌期から** |
| ⑤ | golden | **components 空で 5931/125802 pin 不変が受け入れ条件**（既存 golden は動かさない）。components 付きの新 golden は**新規 assert 側**に立てる |

- rate モードの components は挙動段 v2.0 では**明示スキップ**（'not implemented' 相当＝黙殺しない）。

---

## 裁定97（2026-08-31・相談役）collect 適用行の3段フォールバック

| # | 条件 | 確定 |
|---|---|---|
| ① | 期首に有効行あり | その行を適用＝**裁定96-④ 不変**（期中変更は翌期から） |
| ② | 期首に無く期間内にあり | **期間内で最も早い valid_from の行**を適用。**日割りなし**＝期間丸ごとその行で計算 |
| ③ | 期間内にも無し | **no_plan**（従来どおり blocker） |

- 動機＝mig0116 の backfill（`valid_from=導入日`）のままだと**本番適用月（期首 < 導入日）の給与が
  全員 no_plan 化**する。②の救済で現在行計算と同値に戻る＝**手貼りリスト 0114 行に運用注記**。
- 期首行の排他は部分 unique＋`set_cast_plan` の区間検証で高々1行＝**期首時点の有効行が2行以上あれば
  throw**（不正データを黙って片方採用しない・collect.ts）。
- 実装＝`collect.ts` の cast_plan 取得を「`valid_from ≤ 期末` ∧ (`valid_to` null ∨ `valid_to ≥ 期首`)」へ
  広げ、cast 単位で3段選択。期末は **period_bounds 由来の `win.periodEnd`**（写像単一ソース・Date 非経由）。
  UI 系（comp-sections）の現在行読みと `set_cast_plan` RPC は不触。
- verify＝payroll スイートへ **A（期首＋期中→期首・96-④ 回帰）／B（期中のみ→適用＋guarantee/achievement が
  計算に出る）／C（backfill 型→現在行と同値）／D（翌期のみ→no_plan）＋期首2行 throw** を追加（155→166）。
  逆張り3通り実測（期首優先反転→A 赤／フォールバック削除→B/C 系4本 赤／期末境界撤去→D 赤）。
  period は動的（今日+3年・同月）＝固定 period 群と衝突せず時限装置化しない。

---

## 裁定98（2026-08-31・C1-3）sanction 二層ガードの結線（mig0117）— 実機: Agoora済
<!-- 実機OK 2026-08-31 15:26（制裁登録→一覧に種別/根拠確認日を確認）。テスト行「テスト罰金」（CLUB NOX）は
     同日 demo-manager の set_deduction 経由で is_active=false 化（削除しない・basis_note に無効化事由を記録）。 -->


| # | 面 | 確定 |
|---|---|---|
| A | 器（mig0117） | `deductions` に根拠確認3列（`basis_confirmed_at/by/note`）＋CHECK `deductions_sanction_basis_check`。`set_deduction` 6→9引数化（`p_kind/p_basis_confirmed/p_basis_note`・旧署名明示 DROP・4者 revoke→2者 grant）。**sanction は保存のたびに確認必須**（update でも再チェック）。update の `p_kind=null` は**不変**（教訓43 型・黙戻りで kind を潰さない）。非 sanction へ変更すると basis 3列は null へ |
| B | 計算（pay.ts） | sanction を他 kind から分離（非 sanction は現行式と1バイト同値＝golden 構造保証）。**雇用**＝労基法91条をシステム強制: `capEach=floor(平均賃金/2)`・回数 day=出勤日数/month=1/rate=1・`applied=min(Σmin(額,capEach)×回数, floor(gross/10))`。**委託**＝上限なし（現行式・警告のみ）。`PayResult.sanction`（original/applied/capEach/capTotal/avgDailyWage/provisional・行なしは null＝凍結互換） |
| C | 平均賃金 | 直近3確定期（finalized/paid・period 降順）の payslips 凍結値から `max(floor(Σgross÷Σ暦日数), floor(Σgross÷Σ出勤日数×0.6))`（0.6=3/5 整数演算・出勤0は前者のみ）。暦日数は periodDaysBetween/periodCalendarDays（core:periodDays の写像を関数化＝当期と同系列）。**確定期0本は null→pay.ts の暫定式** `max(floor(gross/暦日数), floor(gross×3/(出勤日数×5)))`＋provisional=true。※労基法12条の厳密算定（起算日・除外期間等）との差分は**社労士 S-1 で確認中**（専門家確認事項） |
| D | employment 分岐 | 店に active な sanction 控除があるとき `casts.employment` null は **blocker 'no_employment'**（行を作らない）。sanction が無ければ従来どおり。導出は純関数 `employmentBlockerOf`（export＝verify が DB 非依存で係留・allocateCategory 前例） |
| E | 警告の器 | `PayrollDraft.warnings`（`sanction_capped`/`sanction_contractor`/`avg_wage_provisional`・確定は止めない・warnEmptyPool は温存）。導出は純関数 `sanctionWarningsOf` |
| F | UI | 控除タブに種別 select＋sanction 時の警告文（雇用=91条自動適用／委託=フリーランス法注意）＋確認チェック＋note（≤400字）・**9引数常時明示送信**。一覧に種別と確認日。payroll-board に warnings 一覧＋no_employment 文言 |

- verify＝rls r1〜r4（basis required／3列充填+by=uid／p_kind null 不変／agreed_cost 変更で3列 null・492→496）＋
  payroll p1〜p7（capEach/capTotal/委託無clamp/no_employment/暫定式/max選択/非sanction同値・166→174）。
  逆張り3ラン実測（A: capEach反転+委託clamp+blocker無効=4赤／B: capTotal撤去+0.6→0.5+agreed_cost脱落=4赤／
  C: rls 期待反転=4赤・すべて復元緑）。anon-guard は9引数 null 呼びで BLOCKED 不変（986）。
- sim 経路は employment/平均賃金を持たない＝sanction は現行式同値（cap なし・payOf の契約コメントに明記）。

### 教訓44：teardown は FK 参照先を先に消す（起票#35 同型の予防）

名前ベースの teardown（`comp_plans.delete().in("name", PLANS)` 型）は、**子テーブル（comp_plan_components）が
残っていると FK で黙って失敗し、fixture が次 run へ残置される**（エラーを確認しない delete の常）。
裁定97 段で planB が components を持った時点で顕在化する穴を、**teardown に「plan id を引いて
comp_plan_components を先に削除」を追加**して先回りで塞いだ（verify-nox-payroll.ts）。
★一般則: **fixture に FK 子を持たせたら、teardown の親 delete の前に子 delete を必ず対で足す**
（mkPunchDay→shifts の前例＝F2g 後始末コメントと同型）。

---

## 裁定99（2026-08-31・U-1）給与画面のモック収斂 — 実機: CC済※／Agoora未
<!-- ※CC 検収＝実装当日に dev 実セッション（owner ログイン）で全区画の DOM/テキスト描画と console エラー 0 を確認済み。
     スクショのみ Browser ペイン非表示のため未取得＝ペイン表示が得られ次第追補し、この注記を外す。 -->
<!-- 実装実績（2026-08-31）: 段0=v2 モック未受領のためスキップ裁定（v1＋本文の構造定義で実装・v2 は後日 docs 差替）。
     段①5fd14f7（hero/KPI4枚/4ステップ/要対応・kpiOfDraftRows）／段②dd79b60（状態列 payStatusOf・PayslipSlip 拡張）／
     段③04922f9（下段2枚移設）／段④25ef263（純関数3本 assert＋逆張り3赤→緑・payroll 174→177）。 -->


> 正本モック: mock/pages-2026-08/nox-payroll-management.html（v2 差替予定・構造の正本であって配色の正本ではない＝実装は現行トークン）。
> 裁定18（デザイン移植 段D で payroll を対象外）の対象外指定を解除し、収斂対象とする（起票#40）。

10点の要旨（**逐語の正本＝`docs/NOX_U1給与収斂設計書v1.md` §1**・底本 sha256 `7fa5e2a8…71df3f9`）:

| # | 要旨 |
|---|---|
| ① | 構造＝モック組成採用（hero＋KPI4枚＋4ステップ＋キャスト別表＋右パネル明細＋下段2枚）。現行8区画を畳む・機能削除なし |
| ② | 確定単位は run のまま（finalize/reopen 既設）。キャスト単位確定は作らない。表の状態列は支払状態のみ（net−Σpaid 導出） |
| ③ | KPI 4種＝確定期は凍結Σ（現行 sum4）・draft 期は rows から表示層合算（新設・純関数）。前月比は現行維持・欠落キー0円既定 |
| ④ | 「集計」直下に要対応区画＝blockers 3種＋warnings 3種（裁定98）。0件なら「要対応なし」 |
| ⑤ | PayslipSlip 拡張＝guaranteeAdd（支給側）・achievementBonus・sanction（原額/適用額）・税区分バッジで源泉行名切替。凍結済み＝遡及表示可・mine 自動追随 |
| ⑥ | 手動調整は採用しない（器なし・money-core）。準備中表示もしない |
| ⑦ | LINE 明細公開は出さない（T3 後送り維持）。4段目は「支払・明細」 |
| ⑧ | CSV/一括PDF/納付管理/インボイス集計は下段「税務・出力」へ移設（挙動・経路不変） |
| ⑨ | route スイート新設なし。新設純関数（draft KPI 合算/支払状態導出/要対応整形）に assert＋逆張り。区画コミットごとに CC スクショ＋console 0（ログイン不可なら停止） |
| ⑩ | 完了条件＝f0 2連続緑（golden 6値不変）＋CC スクショ全区画＋Agoora 実機 OK の3点 |

実装順＝①hero/KPI/ステップ/要対応 → ②表＋右パネル → ③下段移設 → ④test → ⑤docs（区画単位コミット・Opus・money-core 不触）。

---

## 裁定100（2026-08-31・R-2b）キャスト別指名種別・同伴の別軸化＝裁定74 の実装仕様 — 実機: 2026-09-01 Agoora 済（レジ2cast→締め→給与プレビュー）

**逐語の正本＝`docs/NOX_R2b設計書v1.md` §1**（底本 sha256 `c29add11…e0d8f5`・5,614 bytes）。要旨:

| 面 | 確定 |
|---|---|
| A 器（mig0118・挙動ゼロ） | `check_nominations` に `nom_kind`（hon/jonai/free・default free）＋`is_dohan boolean`（別軸＝同一 cast に hon∧dohan 可）。backfill＝親 nom_type をキャスト別へ1バイト同値写像（dohan→free+is_dohan）。unique(check_id,cast_id)・指名料行の partial unique（二重押し禁止＝起票#18）・`fee_kind='dohan' → cast_id 必須` CHECK **NOT VALID**・`stores.dohan_auto_hon`（裁定75 実列）。**nom_type は派生サマリとして温存**（撤去は R-2c 別裁定） |
| B RPC（mig0119・live 逐語底本必須） | `check_set_nominations`＝jsonb[{cast_id,weight,nom_kind,is_dohan}] へ（旧署名 DROP）・free 昇格は dohan_auto_hon∧is_dohan∧free→hon のみ／`check_dohan_add`＝cast 必須（'cast required'）／`get_cast_sales`＝nom_kind/is_dohan からキャスト別に数える／`check_close`＝名簿の行ごとに積む（pt は nom_kind='hon' のみ）。**dohan rate ガードは外さない**（裁定76） |
| C/D 鏡・UI | 鏡＝check_close/get_cast_sales/collect+pay/register-board（check-calc・receipt 不触）。UI＝キャスト行ごとに種別＋同伴チェック＋重み・課金ボタンを行へ紐づけ |
| E 受け入れ | golden 6値不変・f0 2連緑・新スイート verify-nox-r2b 8観点＋全逆張り・名簿 A/B 収載（教訓21）・実機（2 cast 本指名+同伴→締め→給与で各自に本数） |
| F 段取り | 段0 live 逐語（Fable 5）→0118→手貼り→f0 不変→0119→手貼り→TS/UI/verify→逆張り→f0 2連→push。**Fable 5 継続（money 直撃）** |

- 裁定(g)（1伝票1 nom_type・モック準拠）を**明示的に上書き**。段0 live 逐語＝`docs/tmp/live_r2b.sql`。

---

## 裁定101（2026-08-31・U-2）待遇画面のモック収斂（設計ロック）— 実機: CC済※／Agoora未
<!-- ※CC 検収＝dev 実セッションで全節の DOM 実測（①c9f663a／②〜⑤0c23ceb／⑦7754a5b／⑧c68a4b6・
     採用方式バッジ/節別保存済み表示/準備中バッジ/ノルマ統合/右サマリーの live 値一致を確認）。
     console 新規エラー0（残存は編集中間状態の履歴）。スクショはペイン表示時に追補。段3=a1ff5bf（純関数3種+逆張り3赤→緑・payroll 177→181）。 -->

**逐語の正本＝`docs/NOX_U2待遇収斂設計書v1.md` §1**（底本 sha256 `7ac2eea9…9e8d8e`・4,473 bytes）。要旨:

- 正本モック＝`nox-cast-compensation-canonical.html`（v2・構造の正本・配色は現行トークン）。**DB/RPC 署名不触＝UI＋純関数のみ**（起票#38 の収斂レーン）。
- モック補正3点: ①ノルマ未達の契約区分 select は**置かない**（employment は cast 属性）＝説明2行＋根拠確認チェック（器なし＝**準備中**）②割当行に「個別上書き▸」＋set_cast_plan 4引数（適用開始日）③自由バック追加導線＋「率方式バック（R-2b 後）」を準備中リストへ。
- **器なし項目は全て準備中表示（C5＝起票#42 に一覧・器は作らない）**。丸め2軸も C5（相談役裁定）。
- 保存＝**セクション単位**（既存 RPC そのまま・一括保存なし・セクション別の保存済み/未保存表示・失敗は当該セクションのみ赤）。
- 画面構成＝モック順（プラン選択→ナビ→採用方式(自動判定)→基本給・保証→バック→pt→スライド→達成→シミュ→ノルマ→割当→右サマリー sticky）。旧タブ: 控除・送り/キャスト会計は残置・待遇プラン/ノルマは統合先へリダイレクト。
- 受け入れ＝純関数3種 assert＋逆張り・f0 2連緑（**本数不変**・動いたら停止）・CC 検収＋Agoora 実機。率解錠はトグル追加だけで済む構造。

---

## 裁定102（2026-09-01・R-2b 補遺）連打/再送の吸収は idem_key＝裁定74「一意制約で禁止」の撤回 — 実機: 2026-09-01 Agoora 済（レジ2cast→締め→給与プレビュー）
<!-- 実装実績（2026-09-01）: mig0119 収蔵 8d18349・UI 0b69b73（idem_key 描画時生成/成功後再生成・同伴ボタン→is_dohan 保存）・
     verify-nox-r2b (3)(9) で同キー再送＝行不増・同一行 id を機械 assert。 -->

行＝指名事実1回の記録（0円行・ランク差の共存が仕様）のため**行レベル unique は誤り**。裁定74 の
「一意制約で禁止」を**撤回**し、連打・再送の吸収は `check_lines.idem_key`（partial unique
`check_lines_idem_key_uidx`）＋`check_shimei_add`／`check_dohan_add` の `p_idem_key`
（**同キー再送は既存行 id を返す**・UI は**描画時生成・成功後に再生成**）。
同伴 cast 必須 CHECK（`check_lines_dohan_cast_check`）は **NOT VALID** で 0119 同梱（教訓47）。
unit4 キー＝`nom_unit4_key`（hon/jonai 優先→dohan→free）。`checks.nom_type` は `nom_type_summary` の
**派生サマリ**（撤去は R-2c）。**dohan rate ガードは外さない**（裁定76）。

---

## 裁定103（2026-09-01・mig0120）予約→伝票化の指名転写＝0118 backfill と同一写像（0119 の見逃し是正） — 実機: 2026-09-01 Agoora 済（同伴予約→来店済→名簿に同伴チェック）

0119 が旧3引数 `check_set_nominations(uuid, text, jsonb)` を drop した際、**definer チェーンの
`reservation_to_check` が旧署名を内部呼びしたまま残った**（prosrc 走査で呼び残しは本関数1本のみ・
**指名キャスト付き予約の来店処理だけ**が実行時エラー・cast なし予約は旧呼びを通らず成功。
検知＝f0 anon-guard 段19 FAIL 7・2026-09-01＝教訓48）。mig0120 で 2引数呼びへ差替え。

- 予約 `nom_type`（伝票単位・dohan 含む）→キャスト行への転写は **0118 backfill と同一写像**＝
  `nom_kind = case nom_type when 'hon' then 'hon' when 'jonai' then 'jonai' else 'free' end`／
  `is_dohan = (nom_type = 'dohan')`・単一指名・weight=1・全置換。
- `dohan_auto_hon` による free→hon 昇格は**店設定に従う（レジ経路と同じ）**。
- 署名 `(uuid, uuid, text)` 不変＝**ACL 保存（create or replace・drop なし）**。
  底本＝live 逐語 `docs/tmp/live_r2c.sql`（sha256 `bb4a11d2…4e32d3`・93行）。
- verify＝r2b(11a)（dohan 予約→free/is_dohan=true）／(11b)（hon 予約→hon/false）＋
  データ逆張り（写像破壊→11a のみ赤→復元→緑を実測）。

---

## 裁定106（2026-09-01・M2待遇）キャスト待遇 canonical v3 差替（モック正本の更新）

正本＝`mock/pages-2026-08/nox-cast-compensation-canonical-v3.html`
（sha256 `a88accc730b7fcd8975ceb989ced9db87b638e89fe412345eb90b7e0c63ec62e`・39,657 bytes・
title「NOX | キャスト待遇 正本 v3」・受領来歴＝Downloads 推敲5版の最終 v6-readable を byte 同一収蔵）。

v2 からの主変更＝**6タブ構成**（basic/backs/slides/quota/sim/assign）・**機能トグル型**
（使うノルマ／達成条件だけ有効化＝出勤/本指名/同伴/売上の4軸）・割当行に進捗表示・
**準備中カード列挙の撤去**（pt 系の注記1文のみ）。

- 器の充足調査（2026-09-01・A〜C 10項目実測）: **そのまま載る**＝components 2種(amount)・自由バック
  （本数×円/flat/sales%）・priority 撤去（挙動不変）・タブ化（c1〜c3/16引数 非影響）。
  **小改修**＝スライド4段（`comp_plan_slide_check` の `v_len > 3` 1行差替 mig）。
  **器なし＝別 mig 設計**＝商品売上×率のバック・基本時給と保証の分離・保証期間（joined_on 結線）・
  ノルマのプラン既定→キャスト上書き2層・達成条件の他軸（出勤/本指名/同伴）。
- 実装レーンは別途裁定（v2 実装＝裁定101/104 は据置・v3 収斂は器の裁定後）。v2 ファイルは前版として残置。
- **実装（2026-09-01・B レーン）**: `/master/cast-comp/plan` を **6タブの殻**へ再構成＝固定ヘッダ
  （編集中プラン select・プラン名・状態バッジ読取専用・適用中・新規/複製/無効化）＋6タブ＋右パネル
  （プラン概要／保存状態＝節別未保存件数）。**PlanEditor は常時マウント・タブは display 切替**＝
  draft/snapshot がタブ移動で消えない（B1 要件を常時マウントで充足・set_comp_plan 16引数・c1〜c3 不変）。
  B2 8点＝保証時給主・最低月額保証「使う」トグル（既定 OFF）・**priority UI 撤去**（guarantee=100/
  achievement=90 固定送信＝適用順は kind 決定・同 kind 内は順序非依存の実測済み）・自由バック
  **計算方法3種**（本数×円/固定額/売上×%＝保存語彙 basis/value 不変）・スライド判定基準/対象の固定表示・
  ノルマ・ボーナス타ブ＝上段プラン達成ボーナス/下段「店共通（全プラン）」norma-board（契約区分はプランに
  置かない）・シミュレーション compact（主入力＋「詳細」畳み＝SimulatorPanel に compact prop・/mine 不変）・
  割当に**進捗列**（cast_norms 当月 sales_target ÷ get_cast_sales 暦月実績・実績なし 0・目標なしは実績のみ）。
  ★準備中の新規2種（商品売上×率・スライド判定基準/対象の選択）は **PREP_ITEMS 不触の生バッジ**
  （c3 の本数 pin を動かさない＝C5 解錠時に PREP_ITEMS へ正式収載）。

---

## 裁定107（2026-09-01・mig0121）「free は均等（weight=1 固定）」の撤去 — 実機: 未（段5 依頼中）

種別（本数）と ratio_weight（金額按分）は**独立**（裁定105）。R-2b 前の「伝票に種別1つ」時代の
「free＝均等」規則は、行ごとに種別が混在する現在は根拠がないため**撤去**
（check_set_nominations 53行目の1行差替・署名 (uuid, jsonb) 不変＝ACL 保存・底本＝live 逐語
`docs/tmp/live_csn.sql` sha256 `481190a1…bc1711`・73行）。
**weight の汎用検証（1以上の整数）は据え置き**＝weight=0／小数は引き続き 'bad weight'。
dohan_auto_hon 昇格（free→hon）の順序・挙動は不変。

- UI 追随（段1）: CastPicker の rank 並べ替えを撤去（**名前順固定**・選択/着卓/出勤はバッジと枠色のみ）／
  free 行の weight=1 正規化と「均等」表示を撤去＝**全行に％入力**（register-board・kiosk とも）／
  **課金行（指名料・同伴料＝check_lines.cast_id 保持行）が残るキャストは × と名簿再タップで外せない**
  （「先に指名料を取り消してください」・stillHasFee を castFeeLines へ一般化＝行削除追随と同じ関所。
  ★kiosk は kiosk_check_detail が fee_kind/cast_id を返さないため対象外＝0119 不触の既知留意）。
- verify＝r2b(12) 3本（weight=0／小数＝負例・free weight=2 通過＝0121 の証明）・INVERT 全赤 16/16。
- ★教訓49 続報＝teardown 無音残置の真因確定: 在庫台帳 trigger（stock_on_check_line）の stock_logs 行が
  products 削除を FK で塞いでいた（可視化ログが特定・累積残置3件掃除）→ **stock_logs 先行削除で完治**。

---

## 裁定109（2026-09-01・mig0122）set_cast_profile 新設＝源氏名・入店日の更新 RPC — 実機: 未

casts の name/joined_on に**更新経路が無かった**（cast_create のみ・joined_on default=行作成日・
app 内 casts 直 update ゼロ＝2026-09-01 実測）を解消。

- 対象は**源氏名(name)・入店日(joined_on) のみ**。left_on（退店フロー＝cast_leave/rejoin 既設）・
  store_id（**店移動＝起票#44**）は含めない。
- 権限＝set_cast_rank_of と同型（owner=org 全店／manager=自店／staff・cast=forbidden）。
  底本＝live 逐語 `docs/tmp/live_set_cast_rank_of.sql`（sha256 `1355b9fd…0cb84`・55行）。
- 源氏名は**店内 active 行同士の lower 一致を拒否**（'duplicate name'・自分除外）＝casts に name unique が
  無い現状（実測）への RPC 側ガード（comp_plans の duplicate name と同思想・既存重複はバンドル ord8=0 を実測）。
- joined_on 必須・left_on があれば joined_on <= left_on（'bad joined_on'・`casts_active_left_on_chk`＝
  active∧left_on 両立禁止も実測）。
- audit＝**変更列のみ** before/after（set_cast_rank_of 流儀・PII を before/after 以外に載せない）・
  **変更なし再送は no-op**（update も audit もしない）。
- verify＝grants **G43**（1本3引数 secdef・ACL authenticated/service_role・anon なし）・
  rls **段SCP 9本**（owner 他店 ok／manager 自店 ok／manager 他店・staff・cast forbidden／anon BLOCKED／
  duplicate name（lower）／bad joined_on／no-op audit 不増）＝**INV9 逆張り 9/9 全赤→復元緑を実測**。
- UI＝casts-board 基本タブに「編集」（源氏名・入店日→set_cast_profile）＋入店日行＋
  「機密・税務情報へ」導線（/master/system）。待遇・バックタブのラベル是正＝
  「**指名料ランク**」「**標準（店の既定指名料）**」（DB 呼び形 set_cast_rank_of 不変）。
- ★実装教訓: 段SCP の fixture をクラッシュ時に残すと**先行段の casts 数 assert まで汚染**
  （prefix 掃除を段頭・生成は try 内＝教訓30/49 の複合型で是正・実測）。

---

## 裁定110（2026-09-01・mig0123＋0123b セット）weight=0 の許可＝「按分なし」の名簿行 — 実機: 未

- weight は **0 以上の整数**（0＝按分なし・小数は 'bad weight' 据置）。**名簿あり∧合計0 は拒否**
  （分母ゼロ＝RPC 入口 `if v_pos > 0 and v_sumw = 0 then raise 'bad weight'`）。空配列（全解除）は許可。
- **端数（最大剰余法の +1）は w=0 行に数学的に届かない**（k ≥ R+1 の証明＝設計書 §2-7・底本
  `docs/tmp/live_alloc.sql`）＝**check_close／cast_sales_aggregate／sales-alloc.ts は不触**。
- ★**0123 は器抜けで一度関門停止**: `check_nominations_ratio_weight_check (ratio_weight > 0)` が残存し
  insert が constraint violation（＝教訓50）。**0123b（CHECK を >= 0 へ緩和・validated・既存行 >= 1 で通過）
  とセット適用が必須**（手貼りリスト両行に注記）。
- verify＝r2b(12a〜12f)：w=0 正例（保存値まで確認）・名簿あり∧全0 負例・小数据置・**実締め2伝票**
  （[100,0]＝w=0 行は backs/sales とも 0・[1,1,0]×qty3＝端数 +1 は w>0 の先頭へ・w=0 は backs 行なし）・
  INVERT **19/19 全赤→復元緑**。
- UI（A2・register-board／kiosk-register）: **名簿＝キーの存在**（w=0 も一員）・既定分配
  （本指名で 100% 等分→場内→フリーの優先・名簿追加/種別変更のたび適用＝手動値はそこまで保持）・
  自動補完（編集行を確定し残りを 0 でない行へ現在比配分＝**Σ 常時100**・他が全0なら編集行100固定・
  端数は先頭行）・「均等に分配」残置・**buildNomList は w=0 も送信**・％入力 0〜100 clamp・
  0% 行「按分なし」バッジ・純関数3本＝`lib/nox/nom-shares.ts`（両画面共用）。

### 教訓50：RPC の入力検証を緩める mig は、同じ列のテーブル CHECK・NOT NULL・trigger を同 mig で必ず見る

0123 は check_set_nominations の検証を weight>=0 へ緩めたが、テーブル側
`check_nominations_ratio_weight_check (ratio_weight > 0)` が残存＝**prosrc 緑・関数バンドル緑でも
insert が constraint violation**（'bad weight' ではない生エラー・全置換は例外で rollback＝名簿無傷）。
教訓47（NOT VALID でも新規 INSERT に即時強制）の**裏面**＝入口を緩めるときは器（CHECK/NOT NULL/trigger）も
対で見る。検知は r2b(12) の**実走**（関数バンドルだけでは出ない）。対策＝緩和系 mig のバンドルに
**対象列の CHECK def を1行入れる**（0123b の ord2 `def_ge_zero` が実例）。

---

## 裁定111（2026-09-02・mig0124＋0124b セット）名簿操作を正・課金は派生（指名料/同伴料の自動課金）— 実機: 未

正本＝設計書 v1.1（`NOX_裁定111設計書_v1_1_2026-09-02.md`）・構造正本モック＝`mock/pages-2026-09/nox-pos-nomination-autocharge-v1.html`・底本＝`docs/dp/live_0124prep.sql`（sha256 `1e293101…b35a8d`・4関数逐語）。

**確定案7項**:
1. 種別 hon/jonai 化で指名料行を自動追加（既存あれば追加しない）。free 戻し＝確認付き取消
2. 同伴 ON＝同伴料行（行内人数ステッパー既定1）自動追加・OFF＝確認付き取消・下部「同伴料（課金）」カード撤去
3. 名簿は変更のたび自動保存（「分配を保存」廃止）。％は裁定110 の既定・自動補完の上
4. 指名料ボタン行撤去・行に「¥N 自動加算」補助表示（凍結値のみ＝裁定61-2）・例外＝明細側 check_remove_line（取消＝料金サービス・復活しない）
5. `ended_at` セット＋weight 0 既定＝「以後の按分から外す」。実績1件と指名料行は残す。**裁定107 の除外拒否は撤回**（★UI の ended 面は未実装＝モックに ended UI が無く着手前申告・裁定待ち。それまで 0121 の castFeeLines 関所は経過措置として残置）
6. 按分は現行（締め時の最終 weight で一括）のまま。**着席区間按分（allocation period）は launch 後の別起票**＝将来の器への制約注記: **weight 0 に「過去の按分を消す」意味を持たせない**
7. 延長指名料＝店設定 `ext_shimei_enabled` ON ∧ pricing_rules(fee_kind='ext_shimei') ヒットで check_extension_add が active hon ごとに1行（料金だけ・本数は増やさない）

**設計判断（v1.1 A'〜H）**: A'＝p_nominations の `nom_kind`/`is_dohan`/`ended` とも**キー欠落＝既存値保持**（新規 cast は free/false）・ended true＝旧値引継ぎ（なければ now()）・false＝解除。B＝合計0判定は **active（ended_at is null）行のみ**（active あり∧合計0拒否・全員 ended＝許可＝按分なし）＋ **check_close の sumw=0 ガード必須同梱**（D2 実測でガード不在＝division 時限装置）。C＝**check_set_nominations 内の遷移ベース派生**（v_before 差分・reconcile なし＝明細側取消は復活しない・行形/価格解決は check_shimei_add/check_dohan_add と同形）＋ **kiosk はキー無送信**（free 落ち既存バグの是正を兼ねる・#45 は据置）。D＝ext_shimei は live 解決（`pricing_resolve_core`）・snap 列なし・rank 非対応・ヒットなし＝skip（stores フォールバック額は作らない）。E＝初版 manual 店のみ（auto 店は起票#47）。H＝dohan_count 同期は該当 cast の dohan 行**ちょうど1本**のときのみ。

**実装（2026-09-02）**: mig0124（器7点）＋**0124b（pricing_resolve_core 白名単＝関門で検出した器抜けの是正・セット適用）**・kiosk ペイロード整合（weight のみ送信・種別/同伴 UI 撤去）・register-board UI 差替え（自動保存・トグル即時/入力系 blur 保存・確認ダイアログ2種・行内ステッパー・「¥N 自動加算」表示・派生系は入金後 disabled）・verify:nox-autocharge 新設（**26 assert・INVERT 26 全赤→復旧緑**・f0 30本目）。f0＝**30本 3,395** 2連緑・golden 6値不変。

### 教訓51：fee_kind の語彙追加は「CHECK 2箇所＋pricing_resolve_core 白名単」の3点セット

0124 は `check_lines_fee_kind_check`・`pricing_rules_fee_kind_check` の2 CHECK へ 'ext_shimei' を足したが、
**関数側の入力検証（pricing_resolve_core の `p_fee_kind not in (...)` 白名単）を見落とし**、
`ext_shimei_enabled=true` で check_extension_add が丸ごと 'bad fee kind' 例外＝延長課金自体が不能だった
（既定 false のため潜伏・verify ac(g2)/(g3) の実走で検出→0124b で是正）。教訓50（テーブル CHECK）の**関数版**＝
語彙を広げる mig は、その語彙を**読む全関数の白名単**を prosrc 走査（`prosrc like '%fee_kind%'`）で洗ってから閉じる。

---

## 裁定112（2026-09-02・mig0125）シフト作成の責務転換＝キャスト単位登録モーダル（v6）— 実機: 未

正本＝設計書 v1（`NOX_裁定112設計書_v1_2026-09-02.md`）・構造正本モック＝`mock/pages-2026-09/nox-shift-v6.html`・
底本＝`docs/dp/live_0125prep.sql`（sha256 `7269c1d3…4927f`・shift_set/shift_bulk_set/shift_wish_decide 逐語＋
shifts/shift_wishes の器面）。

**責務転換の骨子**: 「配置を組む」＝キャスト単位登録モーダル（キャスト→日付→時間→保存）へ。
店全体を見る機能（必要人数・不足・ルール）は作成中に出さず確定側で確認。外側骨格（タブ5面）は維持。

**設計判断（A〜H）**: A＝撤去3機能は **UI 撤去・器/RPC 残置**（自動配置カード・配置ルールカード撤去／
**必要人数カードは仮シフト（calendar）タブへ移設**＝セル状態色と同居。器の削除は launch 後に別起票）。
B＝build タブ縮退形（計画バー＋「＋シフトを追加」＋登録済み一覧＋希望通知残置・shift-add-form を
v6 モーダルの母体として拡張＝新規作り直さない）。C＝**`shift_bulk_set_daily(p_cast_id, p_items jsonb)` 新設**
（日別時刻・単一 Tx・skipped 理由付き返却〔closed/duplicate/unavailable〕・上限62・planned 固定・
既存 bulk_set は残置＝別名でオーバーロード回避）。D＝**器に LAST を持ち込まない**（希望 end_hm＝閉店時刻の
表示写像「〜LAST」のみ・閉店時刻変更で過去希望の表示解釈が変わり得る＝許容）。E＝**`cast_unavailable_days` 新設**
（出勤不可の事前宣言・UNIQUE(cast_id,date)・reason・RPC set/remove/list＝owner/manager・attendance 不流用）。
F＝**不可はソフト拒否**（定休日ハードとの非対称・`p_override_reason` 必須で押し切り可・
**shifts.override_reason 列**が正本・不可日のみ保存・旧6引数シグネチャ明示 DROP）。
**G'＝希望日の登録は wish_decide(accept)→時刻変更ありのみ shift_set 更新の2段で確定**
（実測: wish_decide は時刻引数なし＝accept は希望時刻で planned 自動生成。2段目失敗は
「希望時刻のまま登録済み」を UI 明示）。H＝保存ボタン（0件 disabled・「保存して次のキャスト」は選択のみリセット）。

**実装（2026-09-02）**: mig0125（器5点＋検証13行）・verify:nox-shift-modal（22 assert・INVERT 全赤・f0 31本目）・
課金名簿 mig0125 追随（A5+3/B(f)+1＝教訓21 の機械検知 **4例目**・billing pin 111/99/112 へ・53 assert 不変）・
UI＝shift-add-form v6 拡張（2ペイン・月カレンダー・繰返し選択・不可 override・LAST/翌表示・
bulk_daily/2段保存・skipped トースト）＋build 縮退＋必要人数移設。
★モックに無い「不可の登録 UI」はモーダル内の日詳細バー（出勤不可にする/解除）へ配置＝申告済み判断。
★cast セルフの不可宣言は**起票#49**（v1 は owner/manager のみ）。

---

## 裁定113（2026-09-02・骨子先行）指名実績バックと商品販売バックの分離 — 設計書 v1 確定・mig0132 適用済・f0 pb 係留（2026-09-04）・UI＝Opus 待ち

① 指名実績バックと商品販売バックは**併存・加算・完全別系統** ② 商品販売バックの計算方式は
plan の**3択排他**（product_rule／plan_rate／plan_fixed） ③ **排他の執行点は check_close**
（給与集計に方式判定を持ち込まない・check_cast_backs＝確定スナップショット） ④ back_snapshot へ
source_mode／根拠値／calculated_back_amount を記録 ⑤ 時間軸は**伝票の営業日時点の plan**
（実現機構＝凍結 or 時点解決は設計書で） ⑥ 既存 plan の既定＝**product_rule（golden 不変）**。
UI 名称＝**指名実績バック／商品販売バック**。構造正本＝`mock/pages-2026-09/nox-comp-back-ruling113-v2.html`
（sha256 `56f8804b…46c855`）・来歴＝`nox-comp-back-simple-v1.html`（裁定113 前の叩き台）。本文＝設計書（D調査後）。

**設計書 v1 確定（2026-09-04・正本＝`docs/NOX裁定113設計書_v1.md`・sha256 `c91120cd…6fae6`・6,893 bytes・
基礎資料＝D調査 draft＋実測①③）**: ④の記録先＝**check_cast_backs 側へ列追加**（source_mode／product_sales_base／
calculated_back_amount・nullable＋読み手フォールバック＝null は product_rule 扱い・行 back_snapshot は無改修）／
**plan_rate の母数＝close 時に back_snapshot 按分と同腕で凍結**（drink_claims 起点は不採用）／
**plan_fixed＝期間固定額**（per-close ではない・日割りなし＝C3 と同思想・金額化は payOf 側の加算1点）／
**裁定4＝drink_claims は射程外・完全不干渉**（mig の diff に claim 関連は1行も入らない・転用は #57）。
前提事実（2026-09-04 実測）: (1) **同一ドリンク行の二重は現行仕様**（claim 済み行でも close 按分は不変＝
drink_back=400 ∧ claim back_amount=400・対照 claim なしも 400 で同値・check_close prosrc に drink_claims 参照ゼロ）
(2) cast_plan 3段選択の境界＝valid_from 期首ちょうど→**a) 分岐**（atStart・`<=`・逆張り2行で「期首時点の有効行が
複数」throw を実走確認）／期首翌日のみ→**b) 救済**（collect 無改修）。器＝comp_plans 3列（product_back_mode
default 'product_rule'／rate／fixed・pair CHECK は mig0086 流儀）。順序＝mig 1本（**Fable 固定**・起草直前 live 再 dump
＋'product_back' 識別子で全 prosrc 走査・丸め流儀は現行 rate 系を写す）→f0 新スイート（§5・**実測②はここで消化**）
→UI（Opus・3択セレクタ＋sim 拡張）。**D-1（給与確定取消）は 113 完了後**。
★恒久注意（伝票系 fixture 掃除）: close の在庫自動減算が **stock_logs（product FK）** を残すため、fixture 商品の
削除は **stock_logs 先行削除**が必須（2026-09-04 実測①の掃除で削除が弾かれて検知・残0 確認済み）。

**実装（2026-09-04）: mig0132 適用済み**（dev・検証バンドル `docs/dp/0132_verify_bundle.sql` 14/14 全緑・相談役確認済み）＝
comp_plans 3列（mode default 'product_rule'／rate／fixed・pair CHECK は mig0086 流儀）＋check_cast_backs 3列
（source_mode／product_sales_base／calculated_back_amount・nullable＝旧行 null は product_rule 扱い）＋**`biz_date_of` 新設**
（営業日 date ヘルパー・クライアント grant なし・**課金名簿 B(f) へ収載＝教訓21 の7例目**〔「grant なし内部関数は
対象外」の想定は f0 billing 段47-1 の全数照合で赤＝除外 100→101・全数 213→214〕）＋check_close OR REPLACE（営業日＝`biz_date_of(store, started_at)`
時点の cast_plan で cast 別 mode 解決・plan_rate は同腕売上按分を base 凍結＋`round(base×rate/100)` を calc 凍結・
plan_fixed は pt のみ・割当なし＝product_rule・drink_claims 不干渉）。
**f0 新スイート verify-nox-product-back-modes（pb・36本目・28 assert）**＝(0) 器 CHECK 3点 (a) product_rule 従来同値＋
source_mode 記録 (b) plan_rate 3列 0・同腕 base（多 cast weight 2:1 で alloc 2/1 を実証）・calc 算術（.5＝152 の 0 から
遠い側・rate 0 境界）(c) plan_fixed 3列 0・pt のみ・jonai は行なし (d) 割当なし fallback (e) pt 射程外 (f) claim 不干渉
（close 前後で back_amount/status 不変）(g) 営業日境界（started_at D 05:30 JST→D-1＝product_rule／D 06:30 JST→D＝plan_rate）
＝**実測②（排他 close の 3列 0 凍結）は (b)(c) で消化**。逆試験＝PB_INVERT 28 全赤＋PB_BREAK（b4 期待値裏書き）1本のみ赤
→復元緑。fixture＝NOX-VERIFY-pb*・cast_plan は admin 直 insert（valid_from 2020-01-01＝cutoff 前実行でも割当が効く＝時限
装置化しない）・teardown は stock_logs 先行。
- **鏡像注記（教訓52 型）**: cutoff 読み（`stores.settings_json.biz_cutoff_hm`・既定 '06:00'・営業日＝(JST−cutoff)::date）は
  **`biz_minutes_of`／`biz_date_of`／TS `bizDateOf`（lib/nox/biz-date.ts）の三鏡像**＝cutoff 仕様変更は3点同時。
- **113 給与側消化（2026-09-04・mig なし・設計書 v1.1 §4・裁定123 前提）**: collect が check_cast_backs の新3列を読み
  cast 別 Σ `calculated_back_amount`（null=0＝旧行フォールバック）を `CastRaw.calculatedBack` へ・CompPlan へ
  productBackMode/Rate/Fixed の3項を**読取保持**（collect が comp_plans 3列を読み assemble が素通し・payOf は参照しない・
  product_back_fixed の意味＝**円／販売数1点あたり**）・payOf の grossBase へ **`+calculatedBack`（凍結値の単純Σ・再計算
  しない）の1項のみ**を既存加算群と同列に追加（guarantee 床／achievement 加算の位置は不変・丸め不要）。★0132 前提で
  一度書いた「plan_fixed＝payOf 側の期間固定加算」は**裁定123 で廃止＝実装前に撤去**（PayResult に productBackFixed なし）。
  product_rule／未指定は 0＝従来 gross と1バイト同値（golden 不変で証明）。payroll f0 追補＝113 節 12 assert（collect 5／
  payOf 6／blocker 1・plan_fixed は凍結Σ 60000 が乗り期間加算なしを係留）＋PR_INVERT／PR_BREAK。sim は UI レーンで
  SimInput 拡張と同時（本段は calculatedBack 0 固定＝現行 sim 同値）。
- **get_cast_ranking 注記**: 順位の最終タイブレーク＝`Σ(drink_back+champ_back+bottle_back)` のため、plan_rate／plan_fixed
  cast は商品3列 0 で**タイブレーク寄与が変わる**（calculated_back_amount／期間固定額は不参照）＝UI／collect レーンの検討点。

---

## 裁定114（2026-09-02・mig0126）shift_confirm_bulk＝一括確定 RPC — 実機: 済（2026-09-02）

底本＝`docs/dp/live_0126prep.sql`（shift_propose 逐語・sha256 `77860b25…eb25b`）。

shift_confirm_bulk 新設。planned/proposed→confirmed 一括。**raise 型**（shift_propose 相似＝全件事前検証
'bad rows' raise・row_count 照合 'concurrent change'）。重複除去後 **上限62**（'too many'）。
audit action='shift_confirm_bulk'／target='shifts:bulk'。
★v22 §1 の「スキップ返却」記述は起草時に raise 型へ解決（承認待ちタブの一括確定＝**表示全件確定操作**につき、
不適格混入は並行変更→raise＋再取得が正）。

**実装（2026-09-02）**: mig0126・f0 verify-nox-shift-confirm（10 assert）・承認待ちタブ一括確定ボタン。
2026-09-02 実機確認・push 済み（`2328497`）。

---

## 裁定115（2026-09-02・設計書 v2）延長メニュー複数尺＝現行器で並置 — 器・resolve 無改変

正本＝`docs/NOX_裁定115_116_設計書_v2.md`（sha256 `ee0f56d0…62cb`・論点①②の確定裁定）。

延長メニュー複数尺は現行器で並置により実現する。snap は開栓時点適用可能全件のまま
（窓外の裁量選択は導入しない）。既定=priority 最小を明文化し、帯編集 UI で並び替え可能・
先頭=既定表示とする。器・resolve 無改変。

---

## 裁定116（2026-09-02・設計書 v2）料金区分軸＝区分テーブル＋null 許容 FK — 116-1/116-2/116-UI（段①②a②b）全実装済・完

正本＝`docs/NOX_裁定115_116_設計書_v2.md`（同上・論点③④⑤の確定裁定）。

料金区分は pricing_categories テーブル＋pricing_rules.category_id（null 許容 FK・null=全区分）で実現する。
開栓時に区分選択（6引数化・default null・kiosk 互換）→set/ext/dohan を区分で解決→snap に凍結。
同 priority 内のみ区分一致>null。重複警告は（fee_kind, 窓, 区分）単位・null vs 区分は警告。
既存行無改変・golden 不変。初来店は区分へ移行し approval は裁量減免用に分離。

**調査要旨（D調査＋論点⑤ live 実測）**: 設計書 v2 §1 参照。底本＝`docs/dp/live_115116prep.sql`
（21,899 bytes・sha256 `b662a039a7095158a4b7bea551d414b9b084c895eb1ec34caa9340a55233e30f`・
approval_request/decide/direct＋check_open の逐語＋execute 権限実測）。approval 申請=owner/manager/
staff・cast（自店∧can_register）＝check_add_line と同一ゲート・承認/direct=owner/manager のみ・
3本とも anon=false。check_open=5引数全 default・kiosk 腕あり・resolve 3呼び＋ext_menu_snap は
鏡像規律コメント付き（core と同一式・同時改修必須）。

**116-1 実装済み（2026-09-02）**: mig0127（pricing_categories 器・rules.category_id null FK・
set_pricing_category）＋**mig0127b（ACL 是正・セット適用）**。f0 verify-nox-pricing-categories
12 assert（33本目）・2連緑 3,439・golden 6値不変。resolve/check_open/set_pricing_rule は
**未改修＝挙動不変**（116-2 で原子的対応）。課金名簿 A6 へ set_pricing_category 先回り収載済み。
コミット `ff38e19`。

**116-2 実装追認（mig0128）**: pricing_resolve_core 6引数化＝区分条件
（category_id is null or = p_category_id）＋同 priority 内区分一致優先
（(category_id is not null) desc・priority 第一鍵は維持）。check_open 6引数化＝
区分検証（同org同店active・'bad category'）→resolve 3呼び引渡し→ext_menu_snap
where/order 鏡像（教訓52）→checks へ category_id/category_name 凍結（開栓時・
非遡及・FK あり）。set_pricing_rule 15引数化＝区分は set/extension/dohan のみ
受理（'bad category kind'＝shimei 死蔵予防・将来レーンで解除）・停止中区分の
新規参照拒否（'inactive category'＝0104 rank 型）。旧署名3本 DROP・ACL live 再現
（core＝grant なし）。override（p_set_rule_id）は区分フィルタ不適用＝明示選択優先。
区分検証は既存 open 再利用の後＝再利用返却の冪等挙動不変。f0 34本目
verify-nox-pricing-resolve-category 16 assert・2連緑・golden 6値不変。
grants 署名 pin 3本（G37/G37b/G42）を15引数へ追随（mig0112 と同型・機械的追随）。

### 教訓52：区分条件は core＋snap の鏡像2点セット

pricing_resolve_core の where 変更は check_open 内 ext_menu_snap 列挙の同一式へ同時反映必須。
片方だけは snap（凍結表示）と請求（resolve）の乖離を生み runtime まで発覚しない
（教訓51 の姉妹形。live 逐語の鏡像コメントで実証）。

### 教訓53：新テーブルの ACL は「全剥奪→必要 grant のみ戻す」の標準型③で書く

新テーブルの ACL は `revoke all on table ... from public, anon, authenticated` →
必要 grant のみ戻す（標準型③）。**個別権限の列挙剥奪は Supabase auto-grant の
TRUNCATE/REFERENCES/TRIGGER を残置する**。TRUNCATE は RLS 非適用につき実害。
G1（grants スイートのスキーマ全体ガード）が検知線（0127→0127b で実証・関門作動1例目）。

### 教訓54：fee_kind 追加の同時改修点は reorder/delete 系 RPC の whitelist を含む

fee_kind 追加の同時改修点は教訓51 の3点＋set_pricing_rule に加え、
**reorder/delete 系 RPC の whitelist を含む**（0130 で pricing_rule_reorder の漏れを検知＝1例目・
UI は priority 再送で回避＝mig0131 で whitelist 是正し回避撤去済み・起票#55 クローズ）。fee_kind 追加時は **'fee_kind' を含む全 RPC の prosrc 走査**を
起草前チェックに（教訓48 の fee_kind 版）。

---

## 裁定117（2026-09-02・v3 モック）料金・会計画面の3責務分割＝UI は分ける・DB は分けない

正本モック＝`mock/pages-2026-09/nox-pricing-structure-mock-v3.html`
（sha256 `a3af3e5acdc7def1d867234093f6bac4b7859cb095319ac9bc9086ac54abe0c0`・21,823 bytes・v2 は来歴）。

料金・会計画面は「料金マスタ／料金適用ルール／会計設定」の**3責務に分割**する。
ただしデータ責務は現行 pricing_rules を維持し、料金マスタと料金適用ルールは
**同一 rule 群の別ビュー**として扱う（UI は分ける・DB は分けない）。
料金マスタ＝pricing_rules の金額ビュー。**別正本・別テーブルを作らない**。
フォールバック＝stores の基本料金（店単位の独立実体・席種別なし）。
**優先順位の数値は UI に露出しない**（順序＝表示順・DB priority/sort は内部表現）。
**「時間だけのルール」は作らない**——各行が時間帯・条件・金額・基準時間を持つ。
時間課金の確定は**伝票オープン時固定**（選択制にしない）。区分も開栓時凍結。
116-UI 実装はこのモックが構造正本（本体が正・モックが従の原則は不変）。

**実装追認（2026-09-03・段②b）**: 3責務再編（段②b）実装済＝T1〜T4／M1〜M4／R1・R7・R9・R10／A2・A4。
分割マウント保存は stores 再読→全値明示送信の stale 防止型（pricing-panel.tsx）。
§4-b は既存①カード文言が確定文言を包含につき据え置き。

---

## 裁定118（2026-09-03・mig0130）VIP 方式B＋課金単位 — 118-1/118-UI 実装済・完

正本＝`docs/NOX裁定118設計書_v1.md`（v1.1 追記込み）・要件正本＝`docs/NOX_料金設定改修指示_2026-09-03.md`
§5/§6・D調査＝`docs/dp/118_D調査.md`・起草前提実測＝`docs/tmp/118prep_live.sql`。

裁定118: VIP 方式B＋課金単位。fee_kind 'vip_charge' 新設（7種化・教訓51 の3点＋
set_pricing_rule/ラッパ同時）・pricing_rules.billing_unit（'person'/'table'/null=店既定
time_per）・対象 set/extension/vip_charge（dohan 対象外）・#52 吸収（ラッパ 6引数化＋
whitelist 同期）・vip_charge は区分可/duration 不可/rank 不可・category-map は time 系
吸収・apply 非対象（開栓時1回生成）・person 単位は人数変更追随・snap 後方互換
（null→time_per フォールバック）・three-mirror 不触（行凍結 qty 経由の実測根拠）。

実装＝mig0130（関数7本・CHECK 7種化・checks 単位4列）。f0 35本目 verify-nox-vip-unit
26 assert・8系統・2連緑・golden 6値不変。pin 追随＝grants 3点（15→16引数）＋prc(p1)。
ext-menu/pricing-apply は値チェック型＝追随不要を実走確認。categoryOf('charge',
'vip_charge')='other' の現状を h2 で記録 pin＝118-UI で time 系へ張り替え（裁定118-6）。
#52 は本 mig で消化済（ラッパ 6引数化＋whitelist 7種同期）＝起票クローズ。

**f0 証跡**: 118-UI コミット時 f0 2連＝35本/3,486×2（夜間 0-2 でログ回収・実測確認済み）。

**118-UI 実装追認（2026-09-03）**: 帯モーダルへ VIPチャージ4枠目（額のみ・区分可）＋課金単位セレクタ
3値（set/extension/vip_charge のみ・「店の設定に従う」=null 既定・同伴/shimei 非表示）・一覧/M3 へ
VIPチャージ列＋単位表示・方式AB併記説明・category-map=vip_charge→**time 系張り替え**（裁定118-6・
スイート 67→83 assert・vu(h2) を time 期待へ更新）。★pricing_rule_reorder の vip_charge 非対応
（0130 漏れ）は UI 側の priority 再送で回避＝mig0131 で是正し回避撤去済み（#55 クローズ・2026-09-04）。
**台帳メモ**: categoryOf の消費者は analytics 1面が実勢（report 側未使用・118-UI 実測）。

---

## デザイン: 青系アクセント正本化（2026-09-03・実装済・実機: 済）

青系アクセント正本化（2026-09-03）: `mock/pages-2026-09/nox-admin-blue-accent-v2-white-cta.html`
（sha `859f1501…ef81`）＝**色・操作系の正本**。v3 モックは構造正本のまま（役割分担・本体が正の原則不変）。
**3分離**＝ブランド金／操作文脈青（タブ選択・リンク・選択状態・補助ボタン）／主 CTA 白抜き
（hover=うっすら白・白地黒文字は不採用）。状態色はモック値へ更新（旧値: --ok #77ba83／
--bad #d86c64／--orange #df9956／--blue #74a6d8）。surface/bg/line 系地色は不触（列挙外・変更は別裁定）。
適用＝管理画面全体（レジ含む）・kiosk 対象外。
停止3件の裁定＝switch 青／gold リンクは Link 系のみ青（強調テキスト29箇所据え置き）／
金グラデピルは選択用途のみ青 soft（ロール・待遇表示は金）。

---

## 裁定119（2026-09-03・mig0129）適用セットルールの凍結 — 実装済・実機: 済

裁定119（mig0129）: 適用セットルールの凍結。checks へ set_rule_id/set_rule_name
（純スナップ・FK なし＝pricing_rules は物理削除 RPC 現存につき削除・改名は非遡及）。
check_open は override 確定後の r_set.rule_id から名称凍結。フォールバック＝両列
null（0129 以前の既存伝票と同表現・「基本料金」誤表示経路を作らない）。UI 表示規則:
set_rule_name not null のときのみ明細セット行下に「適用: {name}」・null＝非表示。
同 arity＝DROP なし・OR REPLACE のみ・ACL 明示再設定。f0 は prc スイート追補
16→21 assert（自動解決/override/name null/改名非遡及/フォールバック）・2連緑・
golden 6値不変。

---

## 裁定120（2026-09-04・UI のみ・mig なし）アラート・通知系は semantic 状態色のみ — 実装済

アラート・通知系は **semantic 状態色のみ**（金・青不使用）。
**Danger**＝不足・異常・基準割れ・エラー・対応必要／**Warning**＝現時点で異常ではないが
注意・確認・将来対応／**Success**＝完了・正常。判定は**「基準を割っているか・すでに異常か」で
機械的に**。在庫対応表: 割れ=Danger／切れ=Danger強／接近=Warning／発注予定=Warning／
正常=Success or Neutral。

- **danger 3層＋bd/ink の正本値**: `--danger #df6d69`／`--danger-soft rgba(223,109,105,.12)`（既存）に
  `--danger-bd rgba(223,109,105,.28)`／`--danger-ink #e7aaa7` を**正本モック .badge.red の実測値から採録**
  （夜間レーンの「指示列挙外トークン不触」は本裁定で1点解除）。
- **シフト充足 -1 は「接近」扱い＝Warning**（-2 以上=Danger である限り2段階表現は裁定120 と整合）。

実装（2026-09-04）: マスタの在庫発注基準割れ帯＝`.nox-alert.danger` 修飾方式（薄赤 soft 地＋赤枠＋
赤アイコン ⚠＋赤文字・ベタ塗り禁止。共有クラス `.nox-alert` は billing/audit/notices/shift の
注意・案内4面が使用中＝無修飾は Warning 相当の金系で据え置き）・サマリー「要補充の商品」と
機能カード status「N件 要補充」は既存 `ng` クラスへ切替（`--bad`＝`--danger` 同値）・
`.nox-stockbar.low` を danger 化（stkbadge.low/tile-low の赤と統一＝バーだけ金の不整合を解消）・
pricing-board の未定義トークン `var(--warn, #b45309)` → `var(--warning)` 張り替え。
機密注記（閲覧ログあり）・汎用 warn 系（badge/dot/caldst/stpill/cald）＝Warning 適合で据え置き。

### 教訓55：priority は fee_kind 系列内でのみ意味を持つ

priority は **fee_kind 系列内でのみ意味を持つ**（reorder の 1..N 正規化は kind 内）。
表示順・比較ロジックを**跨系列 min(priority) で書かない**。初出＝0131 レーンの帯表示順欠陥
（唯一の vip 帯が自系列 priority=1 で最上位張り付き・#55 クローズ経緯参照）。

---

## 裁定121（2026-09-04・UI のみ・mig なし）シフト作成の2経路整理＝日付起点はモーダル内完結・キャスト起点はウィザード — 実装済

1. **日付起点（日詳細モーダル）**: 「＋ キャストを追加」でキャスト一覧を**モーダル内に展開**→クリックで即行追加
   （時間帯は**営業時間マスタの当曜日をプリセット**・編集可・営業時間なしは 20:00〜26:00）→同じキャストの
   再クリックで行削除（**トグル**）→「保存」で**一括 draft（planned）書込**。この日に登録済みのキャストは「登録済み」で押せない。
2. **名称**: キャスト起点ウィザード（ShiftAddForm・v6）の起動ボタンは「＋ キャスト別にまとめて追加」へ。
   日詳細モーダル内は「＋ キャストを追加」のまま。
3. **キャスト起点ウィザードの挙動は不変**（名称のみ・送る RPC・引数・2ペイン構造とも不触）。
4. **書込＝`shift_set`（planned）を行ごと順次**（複数キャスト×1日の器は shift_set 個別のみ＝bulk_daily は cast 単位）。
   1行失敗＝行単位トースト・成功分は反映。**部分成功時はモーダルを閉じず失敗行を残す**（バッファ破棄しない＝
   時刻を直して再試行可）。
5. **保存前クローズ＝破棄確認**（×・overlay・「時間帯を設定する」・「調整」の全ての閉じる口が `closeDay` を通る。
   バッファ空なら確認なし・アンマウントで dirty は必ず false）。
6. **2面（割当 calendar／配置 build）へ共通サブコンポーネント `DayAddPanel` を適用**＝面で挙動を割らない。
   ShiftAddForm へ送る旧導線（裁定44-4）は撤去。migration なし・RPC 不変。

---

## 裁定123（2026-09-04・mig0133）plan_fixed の粒度＝販売数×固定額（期間固定を廃止・close 凍結へ）— 実装済

**plan_fixed＝販売数 × 固定額**（実需＝イベントのオリジナルシャンパン等「売れた数×一律◯円」）。0132 の「期間固定額・
payOf 側加算」を**廃し、plan_rate と完全同型の close 凍結へ**＝給与側は凍結値Σのみ＝「方式判定を給与側に持ち込まない」原則が
**例外なしで成立**（payOf の例外消滅）。**器は無改修**（`comp_plans.product_back_fixed`＝円／販売数1点あたりとして使用・CHECK >=0 のまま）。
変更は check_close のみ（mig0133・0132 適用後・冪等可）。凍結形（新）＝商品3列 0・`product_sales_base`＝同腕売上Σ（監査用・
plan_rate 同形）・`calculated_back_amount`＝**同腕按分数量Σ×product_back_fixed**（整数×整数＝丸め不要）・pt／base／数量の
いずれか>0 で行あり（ゼロ専用行は作らない）。dev に plan_fixed 実データなし（pb fixture は掃除済み）＝データ移行不要。
- **UI 文言行**: 「**販売数 × 固定額**」。「1本あたり」は本数で数えない商品（杯・品）に不適合のため不採用＝杯・品も同一計算。
  mock v3 の第3タブ文言は UI レーンで差し替え。
- 実装追認（2026-09-04）: mig0133 dev 適用済み（バンドル `docs/dp/0133_verify_bundle.sql` 6/6 全緑・相談役確認済み）。
  ★手貼りが f0 実走（0132 後の run1→run2 の間）と並走し pb スイート c 系が赤で検知＝**live 変更の検知線として機能**
  （教訓56）。pb c 系を凍結形へ張替（c2＝base 2000／calc 60000・c3＝jonai でも数量>0 で行あり・c4＝fixed 0 境界）＝29 assert。
  給与側（collect/payOf）は裁定123 前提で縮退実装（裁定113 節「113 給与側消化」参照）。

### 教訓56：dev 手貼りと f0 実走を並走させない

dev への mig 手貼りは **f0 完了後**に行い、f0 実行中に手貼りが要るときは**申告してから**行う。並走すると
run1 緑→run2 赤の「差分がコードに無い赤」が出て原因特定に往復が要る（0131＝for_register 検知／0132＝biz_date_of 検知／
0133＝plan_fixed 凍結形の検知で**3例目**）。逆に言えば f0 は live 変更の検知線として働いている＝止まったら「コードの
バグ」より先に「live が動いたか」を疑う（prosrc と収蔵 mig の本文照合＝113prep の drift 確認型）。

---

## 裁定A〜E（mig0103 に付随・2026-08-24）

| 裁定 | 内容 |
|---|---|
| **A** | `shift_wishes` の同 `(cast,date)` 重複は **`withdrawn` 化**して部分 UNIQUE（`status in ('pending','accepted')`）を張る。生存者は「shifts から参照される行 → created_at 新 → id 新」の順 |
| **B** | `shifts` の重複は **mig 内で dedupe**。生存者は **confirmed > proposed > planned → created_at 新 → id 新**。★**安全弁**＝同一 `(cast,date)` に **confirmed が2行以上**ある組があれば `dedupe stop: N groups` で**全体を停止**（機械で決めない）。★**消える行の wish は `withdrawn`**（`pending` に戻すと新しい部分 UNIQUE で必ず落ちるため。「復元」ではなく「取り下げ」が正しい） |
| **C** | verify fixture に **open 期間を常設**（下記「fixture 変更の記録」） |
| **D** | **`shift_remove` 新設**＝個別削除。`confirmed` は **attendance があれば `'has attendance'` で拒否**（出勤記録のある日のシフトは消させない）。`wish_id` があれば wish を `pending` へ復元（`shift_auto_clear` と同型・**delete の前**に update） |
| **E** | 反復実行するスイートは**自前で掃除**するか**日付をローテーション**する（教訓30） |

### fixture 変更の記録（台帳記録対象）

- **`seed:f0` に常設 open 期間を追加**＝verify org A1・**2026-07-01〜31・status=open**
  （dev の実 id `6b96b4d3-6133-4b1a-acc4-db0854680125`）。
  rls F1d の 07-15・billing の 07-22 を覆い、shift-deep の 09月 とも rls F1d-SD の 06月 とも重ならない
- `seed:f0` の削除リストへ **`shift_periods` / `shift_rules`** を追加（0101 の2表）
- **rls F1d-SD の period を 2026-06 月へ**（常設 fixture との `overlap` 回避）・`shift_set` の専用日を **07-16** へ
- **billing の wish を 2026-07-22 へ**（常設 open 期間の内側・rls の 07-15 と別日）
- **anon-guard 段26 は実行月を覆う open 期間を一時確保**（既存被覆があれば再利用し、自作したときだけ finally で削除
  ＝常設 fixture を誤って消さない）

**2026-08-25 `seed:f0` 事故と復旧（案A）。**

`seed:f0` が **`orgs` 削除時に `org_billing_org_id_fkey`（ON DELETE NO ACTION）で FK 違反により中断**し、
**配下 fixture が全消えた状態で停止**した。

★**del リストに `org_billing` を足すだけでは復旧しない**＝`orgs` を作り直すと `org_id` が変わり、
**mig0087 の backfill は再実行されない**ため新 org に `org_billing` 行が無く、
**fail-closed で全書込 RPC が拒否される**（教訓38・39）。

採った方針＝**案A：`orgs` を削除せず既存を流用する**。
del リストから `orgs` を外し、再投入部を「**既存があれば流用・無ければ作る**」に変更。
**org を新規作成した経路に限り** `org_billing` に `{org_id, status:'active'}` を
`on conflict do nothing` で入れる。

**理由**：`org_billing` は**課金正本**で書込は **service 専用**（webhook / sync / provision）。
**seed を課金正本の書き手にしない**ため。

**結果**：**org id が事故前と同一**（`6408ecea-…`）＝**課金との紐付けが切れていないことの直接証拠**。

### 教訓30：制約を入れると verify の反復実行が赤くなる

mig0103 で `(cast_id,date)` UNIQUE・部分 UNIQUE・EXCLUDE を入れた結果、
**同じ日付に同じデータを作るスイートは2回目から落ちる**ようになった（1回目の生成物が残るため）。
→ **反復実行するスイートは「実行前に自分の生成物を掃除する」か「日付をローテーションする」**。
どちらかを必ず持たせる。★実測: shift-deep 80×2／rls 487×2／billing 51×2 の**2回連続緑**で確認する運用にした。
★併せて、**中断（タイムアウト・SIGTERM）の残骸で1回赤になっても、スイート自身の掃除機構で次回自浄する**
ことも実測（categories／rate-back）。掃除機構があれば中断は回復可能な障害に留まる。

### 教訓31・32・34：欠番（本セッションでは新規に確定していない）

台帳・`docs/` 配下とも **教訓31・32・34 の記述は0件**（実測）。前セッションからの積み残しも存在しなかったため、
**番号を詰めずに欠番として残す**（詰めると後から書かれた参照が別の教訓を指してしまう）。

### 教訓33：面をまたいで共有する state を、外側の判定で排他しない

日詳細モーダルは当初 **`dayModal`（boolean）1本を4面で共有**し、**`tab === "…"` の判定で切り分けて**いた。
この形は「**条件を1つ落とすと2面が同時に出る**」という事故を**実際に起こした**。
**守りを人間の注意力に預けている**ためである。

**対処**：state を「**どの面か**」を持つ**面識別子の union** にする
（`"" | "roster" | "calendar" | "build"`）。
state が**構造上1値しか取れない**ので**多重描画が起こり得なくなり**、**`tab` 判定への依存も消える**。
判定は必ず **`===` で書き**、**truthy 判定（`dayModal && …`）を残さない**。

★**続き（③-1）**：**同じ面の中のビュー切替（`rosterView` / `planView`）は条件に残す**。
　「**開く口が1つしか無いから到達しない**」は**守りにならない**＝**到達性ではなく条件で守る**。
　**開く口が将来増えたときに黙って壊れる**ため。

★**不変条件**：**`dayModal` の各値に対して開く口がちょうど1つ**。
　**`setDayModal(` の全呼び出しを grep で列挙して毎回測る**。
　**閉じる口は内訳（`setTab` 直前／`onClose`／`×`／面内の遷移）まで出す**
　＝**総数が合っていても内訳の誤りが打ち消し合うことがある**（2026-08-25 に実際に発生）。

### 教訓35：単調増加テーブルへの参照は verify に2方向の時限装置を仕込む

PostgREST 既定上限1000行のため、**行が増え続けるテーブルを絞らずに select する assert は
ある日を境に窓の外を見なくなる**。しかも壊れ方が2方向ある。

- **存在を主張する assert は赤くなる**（fail-loud）＝気づける。
- **不可視を主張する assert は緑のまま黙る**（**fail-silent**）＝**気づけない**。
  **後者が危険**で、**RLS / anon 面の隔離検証がそこに集中していた**。

★**危険な形は3つ**。①**絞りなし** ②**絞りはあるが `order` なしの `limit`**
③**クライアント側での `[length-1]` / `[0]` 参照**。
サーバ側の **`order`＋`limit`** と **`count:'exact', head:true`** は**母集合が増えても耐性がある**。
**母集合が増えるかは危険度を上げる条件であって、それ単独では判定基準にならない**。

**対処**：assert が見ている行は**クエリ側で名指しする**。不可視の主張は
**「見えてはいけない行を名指しして0行」**の形に書く。

**実測**：seed 直後の org A `audit_logs` は**1行**、`verify:f0` **1回で約527行**増える。
**2回目の途中で1000を跨ぐ**＝「**1回目緑・2回目赤**」の観測と正確に一致。**事故前は 53,319行**。

### 教訓36：dev サーバー起動中に verify / build を回さない

ポートとビルドプロセスを食い合って**待ちが延びるか固まる**。**`.next` 破損の恐れ**もある。
**指示に無いプロセス起動は自律判断に当たる**。**BANZEN で確立していた規約が NOX に当たっていなかった**。

回復手順＝`Get-NetTCPConnection -LocalPort 3200` で PID 特定 → 停止 → `Remove-Item -Recurse -Force .next`。

### 教訓37：assert が error を捨てると、落ちたときに原因が残らない

`const { data } = await …` で **`error` を受けない**と、**0行だったのかエラーだったのか区別できず**、
一過性の赤が**診断不能**になる。**assert の第3引数には `error` も載せる**。

### 教訓38：実行されていないスクリプトは、緑でも壊れている

`seed:f0` は **mig0087（`org_billing` 追加）以降ずっと完走できなかった**が、
**回す機会が無く数ヶ月露見しなかった**。

★**「1行足せば直る」と見えたものが実は構造の問題だった**。FK を外すだけでは
**「消した先の行を誰が作り直すか」が解けていない**。
**削除の順序を直す前に、作り直しの経路があるかを見る**。

### 教訓39：fail-closed なゲートは、fixture が消えたときに全面赤になる

`billing_writable_of` は行が無ければ **`coalesce(NULL, false)` で false**。
**安全側の設計として正しい**が、**seed が課金行を作らない前提と噛み合っていなかった**。
**ゲートを足すときは、テスト環境で誰がその行を用意するかを対で決める**。

### 教訓40：仕分けは語の一致で判定しない（生成コードの出力まで読む）

DP の仕分けで「実装済み(a)」と判定するとき、**語の一致で判定してはならない**。
モック側の**生成コード（renderX の出力先と中身）まで読んで照合**する。

- 実例＝`dp1_structure_survey` #24 `autoCharges` を「サービス料実装済み」で a 判定したが、
  **モック全文に「サービス料」は0件**。実体は `renderCharges()` の**セット料金の時間帯分解**だった
  （時間帯分解が未移植のまま「実装済み」で通過した直接原因）。
- #31（指名の分配率）／#33（100%で追加）も「按分」「100%」の**語の存在だけ**で a 判定
  （実装は重み整数入力で %入力・×・合計検証が無かった）。
- `dpr_audit.md:170` は「指名の分配率の見出しが無い」と**差分を記録していたが是正されなかった**
  ＝**監査で記録するだけでは是正されない**。
- **系**: レーン着手前に、対応するモック要素の差分を**実測**する。
  **実測前に設計指示を出した時点で違反**。

### 教訓41：帰属経路は3系統を辿ってから断ずる

相談役が **`check_lines` の `cast_id=null` だけを見て「同伴バックは計算不能」と誤判定**した。
実際は **`checks.nom_type` × `check_nominations` 経由（`cast_sales_aggregate`）で計上されていた**。

- **金額の帰属は「行（`check_lines`）・集計 RPC・`pay.ts`」の3系統を全部辿ってから言う**。

### 教訓42：区画の存在≠移植完了

route map（`docs/dp/dp1_route_map.md`）の「あり」は**モックの区画が実装に存在するか**で
数えており、**中身が動くかを見ていない**。`/master/system` は4タブ名が揃っているだけで
「あり」になっていた（中身は M-11 まで1カラム・履歴は生 action 表示のままだった）。

- **モック照合は「区画の中の要素・生成コードの出力・数字が読めているか」まで見て初めて「済」と書く**
  （教訓40 の延長＝語の一致で仕分けしない、の区画版）。

### 教訓43：関数の新設にも Supabase default privileges の自動 grant が付く（auto-grant 系の追記）

新規**テーブル**への anon/authenticated 既定 grant（0002 検証(4)・CLAUDE.md 標準型の根拠）と同じ機構が
**関数の新設**にも働く＝Supabase の default privileges は `create function` 時点で
**authenticated / service_role へ EXECUTE を自動 grant する**（**0113 の `check_tax_round` で実測**・
2026-08-28）。`revoke ... from public, anon` の2者だけでは authenticated / service_role の
自動 grant が残る＝**内部専用関数の revoke は `public, anon, authenticated, service_role` の
4者明示が必須**（CLAUDE.md 二重防御2 の「4ロール明示 revoke」は新設関数の初回 ACL にも適用される。
mig0004＝audit_log_write の service_role 残置と同型）。live の `check_tax_round` は4者 revoke 後の
クリーン状態（`{postgres=X}` のみ）を実測確認済み。★**手貼りリスト 0113 行に「4者 revoke を別途」の
注記が必須**＝収蔵ファイルの revoke は2者のままなので、そのまま本番手貼りすると authenticated/service_role
が残る。

### 教訓45：UI 段の完了条件は3点（verify 緑＋CC スクショ/console 0＋Agoora 実機）

verify 緑は完了条件の 1/3 でしかない。「止まらない」は選択肢の話で**関門ではない**。
台帳の裁定行に実機欄を持たせ、**CC 検収（スクショ＋console 0）と Agoora 実機 OK が揃って初めて「済」**と
書く（U-1/U-2 で運用実証＝引き継ぎ v20 恒久注意1 の台帳収載）。

### 教訓46：verify fixture の「当月」相対日付は月境界で赤くなる

rls punch_self の当日打刻 fixture が**月替わりで 9月の payroll 窓に入り込み**、payroll スイートを
汚染した（2026-09-01 に実発火・92f5294 で段内掃除により是正＝教訓30型）。fixture の日付は
**固定の隔離 period**（r2b の 2031-03 型）か**段内掃除**のどちらかを必ず持たせ、
「実行日からの相対日付」を集計対象テーブルへ残さない。

### 教訓47：partial unique・NOT VALID CHECK は新規 INSERT に即時強制＝RPC 改修と同 mig に置く

NOT VALID は「既存行を検査しない」だけで**新規 INSERT には即時に効く**。partial unique も同様。
器 mig（0118 v1）に先行して入れた結果、**現行 RPC の書込が落ちて f0 8赤**（2026-08-31 実測・
pricing-apply 段44）→ rollback し、**制約は RPC 改修（0119）と同梱**へ組み替えた。
「新規 INSERT に即時に効く制約」は器と RPC を分けない（引き継ぎ v20 恒久注意4 の台帳収載）。

### 教訓48：公開 RPC の署名変更 mig は prosrc 走査で DB 内の呼び出し元を全数検出してから drop する

0119 は TS 側の呼び出し元（UI・verify）を新署名へ追随させたが、**DB 内の呼び出し元**
（`reservation_to_check` が旧3引数 `check_set_nominations` を perform）を見逃した。旧署名を drop すると
内部呼びは**実行時（当該分岐到達時）まで発覚しない**＝条件付き分岐（cast あり予約のみ）だと手動確認も
すり抜ける。署名変更 mig の起草時は
`select proname from pg_proc where pronamespace='public'::regnamespace and prosrc like '%<関数名>%'`
で**definer チェーンの呼び出し元を全数列挙し、同 mig（または同時適用のセット mig）で差替える**
（0120 で是正＝裁定103。検知の決め手は anon-guard 段19 の definer チェーン**実走** assert）。

### 教訓49：verify teardown は失敗を必ず投げる（無音失敗が残置→他スイートの偽赤の原因）＝教訓44 の一般化

教訓44（FK 順序）は「失敗の一因」を潰しただけで、**エラーを確認しない delete は原因が何であれ
（FK・一過性の API/statement timeout）無音で残置を作る**。実発火（2026-09-01）＝verify-nox-r2b の
teardown で `products` delete が一過性失敗→fixture 商品（unit4・price1000）が残置→**次 run の
anon-guard 段28 が無差別 `limit(1)` でそれを拾い 'bad amount'/BV=undefined の偽赤**（f0 2連の間に発生・
自スイートは緑のまま＝原因と症状が別スイートに出るのが厄介）。一般則:
- **teardown の各 delete は error を受けて必ず投げる（最低でも stderr へ可視化）**。無音の握り潰しを残さない。
- **fixture を実物から選ぶ側も、段の意味的要件をクエリで明示する**（段28 は rate 絞りへ＝残置耐性）。
- 残置は次 run の先頭 teardown で自浄する設計を対にする（教訓30 の掃除機構と同型）。

### 純増起票（追加分・実装しない）

| # | 内容 | 要る変更 |
|---|---|---|
| 1 | **1日2部制**（早番／遅番） | `shifts` の `(cast_id,date)` UNIQUE を緩める＋**`attendance` も対で変更が要る**（現状 `(cast_id,date)` UNIQUE＝1日1件しか出勤記録を持てない）。片方だけ直すと記録の対応が付かない |
| 2 | **出勤ボーナスの予告→発行の結線** | `bonus_offers`（予告）テーブル新設＋発行との紐付け。★Fable 5 の慎重域（money） |
| 3 | **休み希望 kind（v2）** | `shift_wishes` に種別列（出勤希望／休み希望）。現状は「入りたい」しか表現できない |
| 4 | **シフト行の削除 UI** | `shift_remove`（mig0103 で新設済み）の結線。現状 UI から個別削除ができず、手動追加した行は消せない |
| 5 | **`audit_logs` に `(action, target, at)` 複合インデックス** | 起票時は「母集合5万行で `order by at desc limit 1` が**タイムアウトした疑い**（未確定）」。**2026-08-28 に実発火＝疑いが確定**＝1セッションで f0 を4連走した末、`audit_logs` **34,921行**で **anon-guard 段16 の audit 照会**（`action` + `target` で絞り `order by at desc`）が `canceling statement due to statement timeout` で赤（直後の再走は緑＝蓄積依存）。既存索引は pkey /`(actor_user_id, at)`/`(org_id, store_id, at)` の**3本のみ**で当該パターンに効くものが無いのが機序（実測）。**mig0110 で解消**（`create index if not exists audit_logs_action_target_at_idx on audit_logs (action, target, at desc)`・索引追加のみでデータ/関数/ACL/RLS 不触）。適用後の索引は**4本**を実測確認 |
| 6 | **verify の C群（厳密件数 `length===N`・掃除依存）5件** | 原因は**窓ではなく蓄積**で、`seed:f0` を回さない限り赤くなる。verify を独立実行可能にするなら **org を run ごとに分ける**設計が要る。対象＝`rls:1761` advances／`rls:1764` transport／`anon-guard:2270` reservations／`anon-guard:1983` customers／`anon-guard:1377`・`1576` customers |
| 7 | **過去日の出勤記録の修正** | 打ち忘れは必ず起きるが、**どの画面で行うか未裁定**。R1 の「書き込み対象日は今日のみ」は SC-8 ⑦ で**未来日方向のみ**緩めた |
| 8 | **未来日ガードを DB に置くか**（`attendance_set` / `attendance_set_self`） | 現在 **UI のみ**で止めている。`bizToday` の `"06:00"` ハードコードと絡むため**設計を先に決める** |
| 9 | **`stores` に打刻の有効/無効フラグが無い** | 運用（kiosk 発行・cast ログイン配布）で分かれているだけ。**ノルマの実績判定に関わる**ため明示が要る可能性 |
| 10 | **`attendance` の `unique (cast_id, date)` ＝1日1枠** | **1日2部制（#1）の未対応と直結** |
| 11 | **`todayStat` / `todayFc` / `todayBands` の改名** | SC-8 ⑦ で**基準日が `bizToday` でなくなり名前が実体とずれている**。コメントで補っているが誤読の種。**B6 で改名** |
| 12 | **今日タブ本体の表と面2 が同じ情報を別構造（表／縦リスト）で出している** | **片方だけ直す事故**が起きうるため **B6 で整合を確認** |
| 13 | **KPI 帯で「未承認」だけ日付非連動**（`wishes.length`・全期間） | 同じ帯に**連動と非連動が混在**するため**副文で明示**する。**B6 で見直す** |
| 14 | **`bizToday` cutoff の `"06:00"` ハードコード**（`stores` の設定を読んでいない） | ★**ノルマの実績/予定の境界そのものになった**ため、**裁定65 の実装前に潰す** |
| 15 | **manual 店の時間帯分解** | `check_extension_add` が `block_no` を書かない（time_auto=false）ため行から回次を復元できない。列を書くか apply 時吸収かの設計が要る（R-2a-2 は auto 店のみ実装） |
| 16 | **時間帯分解の行数閾値** | 1ラウンド1行のため延長327回で327行出る。合算表示への切替閾値が要る |
| 17 | **重み比 100:1 超で正規化後 0% に落ちる縁** | `normalizeShares` で 0% になり、保存時の `w>0` フィルタで名簿から脱落する。%入力は 1〜100 clamp のため **UI からは作れない値**（レガシーは実質全員 weight=1） |
| 18 | **`check_remove_line` に time_auto 拒否の DB ガードなし** | 「削除不可」は UI のみ＝RPC 直呼びで auto 時間行を消せる。R-2b の一意制約とセットで裁定 |
| 19 | **MSG_PAY の stale** | 入金モーダルを閉じて開き直すと旧額の「¥N を入金しました」が残る（クリアは pay() 冒頭のみ） |
| 20 | **feeCast の stale** | 別伝票を開いても「対象: ○○」が残る（openSeat/closeDetail は msg/feeMsg を消すが feeCast は消さない） |
| 21 | **同伴人数変更で完了文言の（N名分）が旧値のまま** | dohanN を変えても直前の完了文言は追従しない |
| 22 | **seatMsg のクリアが openSeat のみ** | setSeatPick（席モーダルの開閉）では消えない |
| 23 | **割引/無料の適用額表示** | 完了文言に金額が無い。loadCheck 後の discount 行から実額を出せる（裁定61 の残） |
| 24 | **無言操作の要否** | 開卓/商品追加/明細削除/人数変更/グループ付替に完了メッセージが無い。裁定61-5「伝票行が増える操作すべて」との整合を裁定する |
| 25 | **報酬のコンポーネント模型**（裁定78） | モック `plan.html` / `nox-cast-compensation-all-in-one.html` のポイント・利益歩合・達成ボーナス・保証判定単位（月/半月/日）・複合スライド。`comp_plans` 変更は **`payroll/collect.ts` 直撃で golden が動く** |
| 26 | **`cast_plan` の期間列（履歴）**（裁定78） | 現状は上書き型で履歴を持たない。**遡及計算に効くため社労士回答と対**で判断する |
| 27 | **CLUB NOX seed の `sales_slide` `at:0` 段** | UI（`SlideInput`）が `at=0` を除外送信するため、**再保存で段が消える**。**seed 側を修正・dev のみ** |
| 28 | **半月 period と `shift_rules.min_month_min` の単位食い違い** | autoassign 鍵②の分母は **period 範囲**（`shift-board.tsx` の `monthMinutes`）。半月 period を作ると「最低月間（分）」と食い違う。**SC レーンへ** |
| 29 | **クライアント算出 `biz_date` の素通し3経路** | `incentive_publish` / `transport_issue` / `receivable_collect` が `p_biz_date` を**検証なしで insert** する（実測 2026-08-27）。cutoff はクライアント側で決まり、`incentive-panel.tsx:30` は **`"06:00"` ハードコード**。**サーバ算出へ寄せる**（`receipt_issue` が `settings_json` から自前計算している形が前例）。★**Fable 5**（payroll の入力になる＝money 隣接） |
| 30 | **`biz_cutoff_hm` イディオムの分散** | 同一の `coalesce(nullif(trim(settings_json->>'biz_cutoff_hm'),''),'06:00')` が **live 14関数へインライン展開**（設計書 v1.2 §2 が「負債として台帳記録」と予告した箇所）。①`biz_minutes_of` への集約 ②**`check_open` が `pricing_resolve_core` を呼ばず帯解決を写経**している解消 ③**`reservation_is_closed_day` だけ不正値で `raise` せず `'06:00'` へ黙って戻す**非対称の解消。★TS 側にも**設定を読まない `"06:00"` ハードコード呼び出しが7箇所**（`notices-board:95` / `incentive-panel:30` / `shift-board:136` / `mine/notices:12` / `mine/page:27,36` / `mine/ranking:20`）＝起票#14 と対で扱う |
| 31 | **/master/system の機能層（M-11b）** | ①端末の最終アクセス・IP（`kiosk_devices` に列なし・`kiosk_sessions.last_seen_at` はレジ端末のみ＋deny-all） ②PIN 失敗回数の表示・ロック閾値の設定化・90日更新・重複PIN検査（現行＝5回/15分ハードコード・`staff_pin` deny-all） ③PIN設定済み数を返す count RPC ④プリンタ最終接続・ONLINE 表示（ポーリング時刻を記録していない）・テスト印刷 ⑤プリンタ名列 ⑥KPI 要確認の集計。**①②③は launch 前候補・④⑤⑥は実機後** |
| 32 | **/master/system KPI「登録端末」が端末数を読んでいなかった** | kiosk_devices deny-all のため「—」表示だった。**M-11 B-0 で解消**（owner のみ admin 経路で org 件数を表示・記録のみ） |
| 33 | **rls F1e `check_void(check5)` の error assert 欠落** | `scripts/verify-nox-rls.ts:1946`（修正前）が戻り error を見ずに捨てている。void が一過性で失敗すると **check5 が open のまま残置** → 直後の `daily_report_reclose` が `'open checks remain'` で落ち、**後続6本が連鎖赤**になる（**`reclose audit` を含む**＝起票時の「5本」は実測で6本に訂正）。0108 起因ではない＝f0 連続実行フレークの型①。**bd3f27c で解消**（assert 1行追加＝`F1e check5 void 成功（open 残置→reclose 連鎖赤の防止）`。逆張り＝存在しない id で void を失敗させ **原因1本＋連鎖6本＝計7本の赤**を実測し、原因行が連鎖の先頭に立つことを確認。rls 491→**492**・f0 3222→**3223**） |
| 34 | **rls F2b `read_cast_sensitive` カウントの exact 依存** | `verify-nox-rls.ts:1290`／`:1326`（修正前）が `=== readBefore + 1` の**厳密一致**で、二重到達時に **+2** で赤（型②）。**bd3f27c で解消**＝判定を **`delta >= 1`** へ変更し、**実 delta を detail に出力**（旧実装は第3引数が無く、赤になっても値が読めないのが診断不能の原因だった）。★**実測根拠**＝`get_cast_sensitive` は `audit_log_write` を `return query` の前で**無条件に1回**・同一トランザクション。dev 実測 64ラン中 **60ランが正常3行**（owner→cast→owner・間隔600〜900ms）／**二重到達2件**（同一 actor で **0ms・1ms** 間隔。`audit_logs.at` の default は `now()`＝**Tx 時刻**ゆえ別 Tx の同時刻＝**POST の二重配送**）／**+0 は 1件も無し**。よって **+0 は「読んだのに残っていない」＝非計上バグとして赤のまま**（起票時の「遅延で +0 もあり得る」は実測で否定）、**+2 は read が実際に2回起きて2行残った形＝「読むたび必ず残る」という assert の主旨を満たすので緑**。逆張りは before/after 双方を書かれない target にして **`delta=0` の赤**を実測 |
| 35 | **payroll スイートの statement timeout 残置汚染** | `payroll` が statement timeout 等で異常終了すると `NOX-VERIFY-pay*` の cast が store A1 に active のまま残置され、次 run の **anon-guard 段35 を汚染**する（`teardown()` は冒頭 `:124` でも走るが**自スイートの中でしか効かない**＝ verify:f0 の並びが **anon-guard → payroll** のため次 run では anon-guard が先に当たる。段35 の `wipe35()` は `NOX-VERIFY-段35` **接頭辞の cast しか消さない**ので payroll 由来の残骸は素通りする）。★起票#6「原因は窓ではなく蓄積」と同系（型③）。**4e7a27c で解消**＝`teardown` の参照をモジュール層へ上げ **`main().catch()` から必ず呼ぶ**形にした（差分 +23/-1＝24行。本体を `try/finally` で包む案は 880 行の再インデントになるため不採用）。**汚染する具体点は `kiosk_cast_list` の `A1=2人` 固定カウント**（実測で特定）。逆張り＝fixture 作成後に中断を注入し、**旧実装では A1 active cast が 2→11・段35 が 11行で赤**、**新実装では「異常終了後の teardown 完了」を出して 2 に戻り段35 緑（984）**を実測。★**案b（段35 の wipe を `NOX-VERIFY-` 全体へ拡張）は不採用**＝実店舗データに当該接頭辞は 0件だが、**他スイートの常設 fixture が 16件（seats 14・comp_plans 2）生存**しており巻き込むため |
| 36 | **RT レーン: データ種別別 retention の実装** | 裁定88 の実装本体。retention 列群・削除/匿名化バッチ・法定期間ロック・店舗ポリシー UI。着手時期は別途裁定（launch 前必須かは要判断） |
| 37 | **売掛4段分割の実装** | 裁定89 の実装本体。cast_liability / settlement_request の器と経路分割。R-2b/F2e 系との統合設計が必要。着手は R-2b 以降 |
| 38 | **待遇 UI のモック収斂** | **実装済（2026-08-31・裁定101 U-2 段2）・実機待ち**＝`/master/cast-comp/plan` を canonical 準拠のセクション編集面へ再構成（採用方式の自動判定・節別保存・準備中バッジ C5・ノルマ統合・右サマリー・割当の適用開始日＝履歴 UI）。kind 追加（point_rate/profit_share 系）と多段しきい値は**C5 準備中のまま**（起票#42）。残＝Agoora 実機 OK |
| 39 | **初期設定ウィザード（OB レーン）** | モック `mock/onboarding-2026-08/`（**15 html**＝step1＋業態別 step1×5（追加受領・全 sha 相異）／業態別 step2×5／step3 待遇9カテゴリ／step4 会計・レジ／step5／done・script なし・Unicode escape なし）を収蔵。前提実測済み: stores に住所/業態/onboarding 列なし・**店作成 RPC なし**（seed の admin insert のみ）・会計方式（卓/個別/併用）のフラグなし＝器の設計から。step3 9カテゴリ↔既存の器の対応表は 2026-08-31 調査報告に収載 |
| 40 | **給与画面のモック収斂（U-1）** | **裁定18 の「段D payroll 対象外」を裁定99 で解除**。正本＝`nox-payroll-management.html`（構造の正本・配色は現行トークン）。設計書＝`docs/NOX_U1給与収斂設計書v1.md`・実装順と完了条件（f0 2連緑＋CC スクショ＋Agoora 実機の3点）は裁定99 ⑨⑩。**進捗（2026-08-31）: 段①〜④実装済み**（DOM/console 検収済み・スクショはペイン表示待ち・**残＝CC スクショ追補と Agoora 実機 OK と v2 モック差替**） |
| 41 | **レジモック v2 追随（R-2b 後）** | `nox-register-pos.html` の「指名の分配率」カードは**卓単位の指名区分**（内部 JS も `t.shareType` 単一値）＝裁定100 のキャスト別種別（行ごとに 種別＋同伴チェック＋重み）を表現できない。R-2b 実装後にモック v2 を受領し差替（裁定91 の canonical 維持手順で README 更新）。**→ R-2b 実装済（2026-09-01・mig0119/0120＋UI 0b69b73）＝v2 モック受領待ちへ前進** |
| 42 | **待遇画面の準備中項目（C5）** | 裁定101 §2 の器なし項目（日給制/保証時間帯/判定単位 半月・日/pt付与ルール/粗利基準/延長・昇格バック/帯歩合%/丸め2軸/未達根拠確認記録/達成 params 拡張/率方式=R-2b 後・**＋達成条件の他軸〔出勤/本指名/同伴〕＝U-2 是正で追記・計12項目**）。**器は作らず準備中バッジで明示**（正本＝`lib/nox/comp-methods.ts PREP_ITEMS`・c3 assert が本数 pin）。**＋ノルマ節の圧縮**＝店設定・キャスト別目標・ペナルティの3カードをモック型へ縮約する再設計（現状は NormaBoard 搭載のまま＝U-2 是正で起票）。解錠は項目ごとに別裁定（設計書 §3）。**→ 照合先を v3 へ更新（2026-09-01・裁定106）**＝v3 は準備中カード列挙を撤去し**機能トグル型**（使うノルマ/達成条件だけ有効化）へ・pt 系のみ注記1文。準備中12項目の実体（器なし）は不変で、v3 で**器なしの新規要素が追加**＝ノルマ4軸のプラン既定（基準値）・達成ボーナス4軸トグル・シャンパン等「商品売上に対して率」・スライド判定基準（指名売上/総売上）・送り回数（sim 入力）＝裁定106 の器調査に収載。**→ v3 実装（2026-09-01）で新規2種（商品売上×率・スライド判定基準/対象の選択）を生バッジで画面へ**（PREP_ITEMS 不触＝c3 pin 維持・正式収載は C5 解錠時）。ドリンク杯数 basis は**起票#46** |
| 43 | **キャスト選択 select の残存2面を CastPicker へ置換（裁定108 の順次適用）** | 裁定108 で「キャスト選択の select 禁止・CastPicker 共通化（components/nox）」を確立。シフト手動追加は置換済み（Picker 2段＋表の行「＋」直開き・shift_set 6引数不変）。**残存＝grep 実測2面**: ①キャスト別ノルマ目標（comp-sections NormTab の select）②控除の対象キャスト select（deduction-panel）。置換は import と onPick 結線のみ（CastPicker は純部品＝金額・RPC 非関与） |
| 44 | **店移動 RPC（casts.store_id の更新経路）** | 裁定109 が明示的に対象外とした残穴＝casts.store_id を動かす経路が無い（cast_create 時のみ）。移動は **memberships（1ユーザー1アクティブ）・店スコープ集計（cast_sales/norms/plan は store_id 列持ち）・指名料ランク（cast_ranks は store 別＝移動先に無いランクの扱い）・店別 pricing** へ波及するため器の設計から別裁定。実装しない |
| 45 | **kiosk_check_detail の R-2b 追随（拡張 mig）** | 0119/0121 とも kiosk_check_detail 不触＝kiosk が (a) 名簿の nom_kind/is_dohan を読めない（フリー表示で開く注意書き運用・保存で置換の但し書き）(b) check_lines の fee_kind/cast_id を読めない＝**課金行キャストの除外拒否（裁定107 の castFeeLines 関所）を kiosk に置けない**。detail の返却列拡張（読み取りのみ・挙動不変）の別 mig で2点まとめて解消 |
| 46 | **自由バック「ドリンクバック」プリセットの杯数 basis** | プリセット保存は **basis='flat'（定額）＝杯数非連動**（savePreset 実測・2026-09-01）。custom_back_defs の basis CHECK に**ドリンク杯数が存在しない**（本数系は champCnt/bottleCnt のみ・pay.ts の Metrics にもドリンク杯数なし）。「杯数×円」のドリンクバックには **basis 追加（CHECK 拡張 mig）＋pay.ts Metrics 拡張＋collect の杯数集計**が対で要る＝器の設計から別裁定。v3 タブの計算方法「本数×円」でドリンクを選べないのはこの穴が根拠 |
| 47 | **auto 店の延長指名料**（裁定111 判断E） | 0124 の ext_shimei フックは **manual 店の check_extension_add のみ**。auto 店は権威が別関数（check_time_charge_apply）＝二重計上封じの構造を崩さないため初版対象外。auto 店で延長指名料を効かせるには time_charge_apply 側のフック設計（延長回数の検知・遡及の扱い）から別裁定 |
| 48 | **レジ backbar の延長ボタン複製** | **実装済（2026-09-02・裁定112 UI レーン同乗）＝追認起票**。テーブル情報行（卓名・滞在・合計の backbar）に「延長（¥N/M分）」＝manual 店∧open のみ表示・checks スナップ ext_fee/ext_min 表示・check_extension_add 呼び（会計タブと同一経路・`from:"bar"` で完了/エラー文言を MSG_DETAIL へ）・入金後 disabled。会計タブ側カードは残置 |
| 49 | **cast セルフの出勤不可宣言** | 0125 の cast_unavailable_set/remove は **owner/manager のみ**（v1）。cast 本人が mine 画面から不可を宣言するには専用 RPC（auth_cast_id 本人チェック型・原則5）＋mine UI とセットで別レーン。**着手前に shift_wish_submit の逐語確認が必須**（open 期間ガード・定休日ガードとの整合＝不可と希望の同日共存をどう扱うか） |
| 50 | **商品一覧の表示3点是正** | **実装済（2026-09-02・`3e1390d`）＝追認起票**。在庫セルは折返し禁止の1行化（発注点をスラッシュ短縮「5/3」・hover にフル文言）・低在庫赤枠と残量バーは同一行で維持・バック設定を独立列へ昇格（率と4段階と防御ダッシュ表示）・商品名下段の重複サブテキスト撤去 |
| 50b | **商品一覧カテゴリチップ行とスクロールバーの重なり** | **実装済（2026-09-02・`4145008`）＝追認起票**。下パディング10px＋細バー化で解消。チップ視認は不変・下マージン調整で合計間隔は据置 |
| 51 | **シフトモーダル CastPicker の写真アバター** | **実装済（2026-09-02・`7c39673`）＝追認起票**。シフトモーダルの CastPicker へ写真アバター（photoUrls）を伝搬＝唯一の欠落だった（部品と CastAvatar は写真と onError フォールバック対応済み・他4箇所は伝搬済み・kiosk は署名経路なしの仕様） |
| 52 | **pricing_resolve 公開ラッパの区分対応（6引数化・小 mig）** | **クローズ（2026-09-03・mig0130 で消化）**＝裁定118-3 の #52 吸収でラッパ 6引数化＋whitelist 7種同期（ext_shimei/vip_charge 含む）。プレビューの区分入力 UI は 118-UI／プレビュー拡張レーンで別途 |
| 53 | **VIP 方式B＋課金単位（ルール単位）** | VIP 方式B（**加算チャージ＝新 fee_kind 級**・教訓51 の3点セット〔CHECK 2箇所＋pricing_resolve_core 白名単〕＋set_pricing_rule whitelist）＋課金単位（**ルール単位 1名/1卓**・check_open units 計算改修）。要件正本＝`NOX_料金設定改修指示_2026-09-03.md` §5/§6。**読み取り調査（Opus）→設計書（相談役）→裁定→mig（Fable）の D調査型**。§4 プレビュー拡張は #52＋本件消化後 |
| 54 | **区分一覧の SECURITY DEFINER RPC（staff/cast/kiosk の開栓時区分選択対応）** | **クローズ（2026-09-04・mig0131 で実装）**＝pricing_categories_for_register（STABLE SECURITY DEFINER・id/name/sort のみ・開栓 RPC と同腕・org 照合 forbidden・is_active のみ・vu(n1〜n3) で staff 実セッション/他 org 拒否/停止中非返却を係留）。★**開栓セレクタの staff/cast 接続（register/kiosk UI の新 RPC への差し替え）は未着手＝RPC 側だけ先行**（現状 UI は RLS 直読＝staff/cast はセレクタ非表示のまま） |
| 55 | **mig0131: reorder whitelist＋区分一覧 RPC（#54 実装）＋duration 上限** | **クローズ（2026-09-04・mig0131 消化）**＝(1) reorder whitelist へ vip_charge（vu(r1) 係留）・**UI の priority 再送回避も撤去＝正規 RPC へ復帰**。★撤去実走で**帯表示順の潜在欠陥が露出**: priority は fee_kind ごとの独立系列（reorder が kind 内 1..N 正規化）のため min(priority) の帯間比較は kind 構成が非対称な帯（唯一の vip 帯等）で破綻＝旧回避実装が偶然隠していた。bandsOf を「kind 系列の合流」順（束縛は同一 kind 内の priority 大小のみ・無束縛同士は現行比較＝既存表示不変）へ是正し CC 往復で確認 (2) delete 系 whitelist 確認済み (3) for_register 新設（#54 欄へ） (4) duration>1440 拒否（vu(du1/du2)＝1440 受理・1441 'bad duration'） |
| 56 | **duration 上限ガード（UI 警告＋RPC 拒否・duration_min > 1440）** | **RPC 側消化（2026-09-04・mig0131＝#55 同乗・vu(du1/du2) 係留）**。★残2点: (a) **UI（帯モーダル）の警告は未実装** (b) **実データ逆転1件（CLUB NOX「VIP20:00〜20:59」延長 30円/5000分）は 2026-09-04 実測で未訂正のまま**＝バインド正常は実機往復で実証済み（2026-09-03）・訂正は CLUB NOX owner＝実アカウントのため CC の UI 代行不可＝**Agoora 実機修正待ち**（済んだら本欄を「訂正済み」へ） |
| 57 | **drink_claims 転用設計（申告→帰属訂正フロー）** | 金の発生源を**商品バック1系統（check_cast_backs）へ統一**し、claim は確認・訂正申請＋append-only 調整行へ転用する設計。背景＝**実測①（2026-09-04）で「同一ドリンク行の二重（claim back_amount と drink_back の両立）」が現行仕様と確定**・裁定113 の裁定4で drink_claims は 113 の射程外（完全不干渉）。訂正締切が D-1（給与確定取消）と隣接のため**着手時期は D-1 設計時に裁定**。D調査で現行 claim 機能の店別 on/off 設定の有無を確認 |

### 未裁定・消し込み待ち

- **P-4 の5裁定点（引き継ぎ v14 §5）**は、**`pricing_rules` 既実装（mig0083）に照らして
  Agoora 側で消し込み待ち**。

### 未実測（引き継ぎ §6）の消し込み

- **6-4「`shifts` から `shift_wishes` を辿れるか」＝クローズ（2026-08-28・実測）。**
  **辿れる。しかも実装済み**＝`shifts.wish_id uuid NULL`（mig0101）＋
  `shifts_wish_id_fkey FOREIGN KEY (wish_id) REFERENCES shift_wishes(id)` が実在し、
  `shift-board.tsx` が **4箇所**（`:871` / `:1145` / `:1659` / `:1835`）で
  `s.wish_id → shift_wishes` を突き合わせて「申請時間」を表示している。
  RPC 側も `wish_id` を本文に持つものが5本（`shift_wish_decide` / `shift_wish_withdraw` /
  `shift_auto_apply` / `shift_auto_clear` / `shift_remove`）＝**書き手と戻し手が対で存在**。
  ★**「未実測」ではなく「実装済みだが台帳が追随していなかった」項目**（教訓42 の同型）。
  ★同ファイルに「`shifts` が wish_id を保持していない」と書いた**古いコメントが2箇所残存**して
  おり、読むと逆の設計判断に誘導される状態だった＝**本クローズと同時にコメントのみ是正**
  （実行コードは 1565 行で完全一致・tsc 通過を機械確認）。
  なお同じ文にあった「**メモ列が無い**」の側は**正しい**（実測: `shifts` 14列 / `shift_wishes` 12列に
  該当列なし）ため、消さずに理由を分けて残した。
  根拠の全文＝`docs/dp/survey_6-4.md`。
