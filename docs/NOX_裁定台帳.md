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
- **mig0134（書き手 19引数化・2026-09-04）**: `set_comp_plan` に `p_product_back_mode`（default 'product_rule'）／`p_product_back_rate`／
  `p_product_back_fixed`（default null）を末尾追加＝旧16引数版は DROP・名前指定呼び出し＋末尾 default で UI 呼び出し元3箇所は無改修で通る
  （後方互換）。検証＝mode 3値 whitelist＋rate pair（plan_rate ⟺ not null・0..100）＋fixed pair（plan_fixed ⟺ not null・>=0）＝列 CHECK（0132）と
  二段（mig0086 の hon/jonai と同型）。ACL 現状同値・A6 名簿＝A7 12本の1本で名前不変＝本数不動（billing 単独 53 緑）。f0 追補＝rls スイート
  F2a★0134 13 assert（成功2経路＋列反映2・拒否5種＋列不動・16引数相当の後方互換＋既定 product_rule/null/null・audit +3）＋RLS_INVERT_0134／
  RLS_BREAK_0134 の局所逆試験。これで⑫（113 UI）段0 の停止条件は解消。
- **113 UI 消化・113 完了（2026-09-04・mig なし・設計書 §6）**: (1) 書き手＝UI 呼び出し元3箇所（plan-editor 節保存／plan-board
  複製・無効化／comp-sections PlanTab）を **19引数全明示**へ（原則7・複製経路も product_back 3項を行から写す・pair は
  `productBackArgsOf` 1箇所＝当該 mode のときだけ値・他は null＝RPC/CHECK と同輪郭）。(2) 3択セレクタ「商品ごとの設定／売上の割合／
  販売数 × 固定額」を歩合・バック節の商品インセット（起票#42 の生バッジ位置）へ・単位 UI は方式連動（`20 %`／`¥ 500 円/点`＝
  UI 共通規約 §3/§4）・フロント検証＝`productBackErrOf`（rate 0..100 整数／fixed >=0 整数＝RPC と同条件・節ローカル赤）・
  RPC 拒否3種の和訳を compErrJa へ。(3) 一覧表記＝右レール「プラン概要」に「商品バック」行（自然語＝商品ごとの設定／売上の20%／
  販売数×500円/点＝規約 §5）・採用方式ピルに「商品販売バック（方式）」。(4) sim 拡張＝SimInput へ `productSales`（商品売上・
  按分後・円）と `productQty`（販売数・按分後・点）を追加し、simulate が plan の方式で `calculatedBack` を合成
  （plan_rate＝Σ売上×rate/100 を roundYen 1回／plan_fixed＝Σ数量×fixed／product_rule＝0）・plan_rate/plan_fixed では
  productBack 3列を 0 へ落とす（close の凍結形と同形）・入力軸は方式で出し分け（店モード編集にも3択）。payOf は不変
  （凍結値Σ一本の原則は sim でも例外なし＝合成は simulate 内・二重実装なし）。
  **鏡像注記（教訓52 型）**: `check_close`（plan_rate＝round(base×rate/100)・plan_fixed＝Σ数量×fixed・商品3列 0 凍結）⟷
  `lib/nox/payroll/sim.ts simulate`（同式・同丸め・productBack 0 落とし）は**二鏡像**＝方式の式・丸め・射程（drink/champ/bottle）を
  変えるときは2点同時（pb スイート c 系と payroll 113 節が close 側・sim 側は f0 に係留なし＝CC 検収の数値一致で代替）。
  起票#42 は本レーンでクローズ（残る準備中12項目は PREP_ITEMS 正本のまま）。
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
（sha `859f1501…ef81`）＝色・操作系の正本（**→2026-09-04 裁定124 でデザインパック v1.0 へ譲り、参照用として残置**）。
v3 モックは構造正本のまま（役割分担・本体が正の原則不変）。
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

### 教訓120（候補・相談役案で確定扱い）：plpgsql の select … into は該当行なしのとき変数を NULL で上書きする＝条件付きで上書きしたい値は作業変数に受けて if found で代入する（2026-10-26・便 ON-1・0175 v2 ★29 の本番欠陥）

0175 v2 ★29（裁定424 候補＝開いている伝票は stores の丸めを読む）を `select s.round_unit, s.round_mode into v_unit, v_mode … where c.status='open'` と書いたため、closed の伝票（該当行なし）では凍結値を読んだ直後の v_unit／v_mode が NULL に上書きされ、check_group_due が NULL→cast_sales_aggregate の `g.due > 0` で確定済み伝票の売上が 0 になった（demo 6 店 closed 5,176 件・10/26 手貼りから 0178 適用まで）。手貼り前の検証（mig-check・md5 pin・verify SQL の構造照合）は構文と差分だけを見ており、**行なし経路の値**は見ていなかった。直し＝0178（作業変数 v_unit2／v_mode2＋if found）。再発防止＝「既存の変数を条件付きで上書きする select … into」を生成器のレビュー項目に加え、起草時の BEGIN…ROLLBACK 試走で closed／該当なしの経路を 1 文は叩く（0178 の試走で closed 5,176 の null_due 0 を見た形）。
同根 2 件目（同日）＝0175 ★2 receipt_issue の `coalesce(p_amount, case when p_reissue_of is not null then v_old.amount else … end)`：plpgsql は式を準備する時点で record のフィールドを解決するため、未代入の record を CASE の入らない分岐に書いても「record "v_old" is not assigned yet」で落ちる（通常の発行が全滅・0179 で if／else に分離）。**未代入になりうる record は、代入した分岐の中でしか参照しない**。

### 教訓119：ポータル（下シート・メニュー）は最寄りの .nox-dark の中に描く＝テーマの外に出ると黒地に黒文字で「見えない」（2026-10-21・便 X13-I H-20・相談役採番＝相談役ブロックでは「教訓117」と呼称・台帳の 117 は E-22 で採番済みのため 119 に収載）

H-20（右上アカウントメニューの中身が出ない）の真因＝GV-C で body 直下に createPortal で描いたため、テーマのトークン（.nox-dark の --ink／--card）が効かず黒地に黒文字になった。1,280px では枠だけが見え、位置の判定（E-23）では捕まらない。直し＝最寄りの .nox-dark へポータル。判定＝E-23 追補1（押せる＋見える）。

### 教訓118：シート・ダイアログ・ボタンの live 確認は、主ボタンの中心で elementFromPoint がそのボタン自身を返すこと（押せること）で判定する（2026-10-21・便 X13-G・相談役採番＝E-23）

GV-C で 390px のアカウント下シートを位置（y 591–812）だけで OK とし、iOS Safari でぼかしの下に入って押せないことを見落とした（W-1）。表示や座標でなく、押す点に何があるかを確かめる。

### 教訓117：f0 の suite は自分が作った org／店の範囲だけを数える（2026-10-21・便 GV-C／X13-G・相談役採番＝E-22）

customers-keep が DB 全体の check_lines／stock_logs の件数を ROLLBACK の前後で比べていて、f0 中のデモ操作（外部の書込）で赤になった。件数の照合は suite が作った org／店に絞る（X13-G で org_id＝$2 に）。

### 教訓116：migration は手貼り前にローカル Postgres で BEGIN…ROLLBACK の構文検査（2026-10-16・便 P173・相談役採番＝E-19）

0173 の初回手貼りで 42601（生成器が values 句の途中にコメントを挿し、残りの列が消えた）。ドル引用タグは合っていたので目視では見つからない。手貼り前に scripts/mig-check.mjs（libpg_query で全体を parse＋使い捨てのローカル Postgres で plpgsql を CREATE＝ROLLBACK・127.0.0.1 以外は拒否）を通し errors 0 を確認してから handpaste を出す（手順＝docs/dp/mig_check.md・恒久注意30）。表・列・関数名の誤りは見えない＝live DDL 照合と検証クエリで補う。

### 教訓115：migration 後の f0 は、走らせる前に pin 系・走査型の suite を単独で一括洗いしてから回す（2026-10-16・便 M173・相談役採番＝E-18）

便 P172 で md5 pin／名簿／grants／anon-guard の張替えを f0 の赤で 1 本ずつ見つけ、取り直しが 5 回になった。migration を当てた直後は、f0 を回す前に pin 系（0158／billing／grants／demo-guard／store-systems／master-top）と走査型（anon-guard／rls）を単独で一括洗いし、全部緑にしてから f0 2 連に入る。f0 は確認の場であって発見の場ではない。

### 教訓114：f0 後の fix コミットは、触った文字列を pin する suite を単独走してから push（2026-10-15・便 GV-B・相談役採番）

**本文（逐語）**: 「f0 後の fix コミットは、触った文字列を pin する suite を単独走してから push」。出典＝便 DM-1 の dp(5-1)（教訓候補 E-6）＝f0 2 連緑の後に入れた fix が、同じ文字列を pin する suite を赤にしたまま push される穴。便 GV-B では docs/tmp/q1015_pincheck.mjs（触ったファイルを読む suite の includes 逐語を全走査）で 3 本（messages／wish-state／systems-off）を f0 前に張替え。次＝115。

### 教訓113：payload の pin は == null で張る（2026-10-14・便 N1014・相談役採番）

**本文（逐語）**: 「payload の pin は == null で張る」。出典＝便 P171 の na(4-1)（教訓候補 E-7）＝payload の行にキーが無い列は jsonb_populate で null になるが、payload を読む suite では undefined＝`=== null` が偽になる→`== null`（キー無し＝null）で書く。次＝114。

### 教訓112：ブラウザ目視は hydration 前に JS を評価すると「効いていない」に見える→実クリック後に再評価（2026-10-14・便 P171・相談役採番）

**本文（逐語）**: 「ブラウザ目視は hydration 前に JS を評価すると『効いていない』に見える→実クリック後に再評価」。出典＝便 N1013b の /demo 初期選択（E-5）。次＝113（→便 N1014 で採番済み・次＝114）。

### 教訓111：push 前に tsc だけでなく local next build を通す（2026-10-14・便 V1014・相談役採番）

**本文（逐語）**: 「push 前に tsc だけでなく local next build を通す。Vercel build は page.tsx の非 Page export と "use client" の値を server から読む型で落ちる」。出典＝便 N1013b の fix 408788b／eeed3d0（/lp が 404 のまま 2 回）。手順＝dev 非稼働なら `NEXT_DIST_DIR=.next-verify npx next build`→出力削除→tsconfig.json を git checkout（build が include を書き換える）。次＝112。

### 教訓110：client の文字列を変えたら f0 の前に、その文字列を pin している suite を grep して張り替える（f0 で見つけるのは走数の無駄・CC 提案 2026-10-13 便 W5-2a・相談役採番 2026-10-13 便 W5-2b）

本文（逐語）: 「client の文字列を変えたら f0 の前に、その文字列を pin している suite を grep して張り替える。f0 で見つけるのは走数の無駄（W5-2a で赤 2 回）」。次＝教訓111。
経緯: 便 W5-2a で buildSetupPlan の呼び出し末尾（pv(7-5)）と StoreProfilePanel の sections／ALL_SECTIONS（mt(7-2)(7-3)）の文字列 pin が外れ、f0 run1 が 2 回赤（走数 2 消費）。便 W5-2b では f0 の前に grep し、338 sp(3-1)・today-row tr(6-4)・w52a mg(1-3) を先に張り替えた（赤 0）。
運用: ①client／lib を触った便は、触った行の「元の文字列」で `scripts/*.ts` を grep する（Object.entries(…)・select("…")・呼び出しの末尾・aria-label 等）②張り替えは挙動 pin（教訓108）を優先し、文字列 pin は新しい形に合わせる③単独走で緑を見てから f0。

### 教訓109：候補付き入力は datalist を使わず select で出す（▾ を描くなら必ず動作を結ぶ・月の候補と印は 1 本の純関数に寄せる・CC 提案 2026-10-09 便 P168・相談役採番 2026-10-13 v45 §3）

本文（逐語・CC 案）: 「候補付き入力は datalist を使わず select で出す。▾ を描くなら必ず動作を結ぶ。Firefox／Chrome とも候補が出なかった」。追記（相談役・v45 §3）: 「月の候補と印は 1 本の純関数（list-periods）に寄せ、画面ごとに作らない」。
経緯: 給与の期間（YYYY-MM）入力が便 X-5 の period-picker（テキスト＋▾＝datalist）で候補が出ず（X-13-28・Firefox／Chrome とも）。便 P168 で components/nox/period-select.tsx（select・当月＋過去 12 か月・新しい順・確定の印・既定＝当月・末尾「もっと前…」）に置換し、給与／分析／月報／ノルマ表の 4 箇所に統一（native type="month" も置換）・候補と印は lib/nox/payroll/list-periods（payroll-list X-13-14 と同じ純関数）。
運用: 候補付き入力は select で出す（datalist 不使用＝恒久注意 26）。▾ の意匠だけの要素を置かない（描くなら開閉・選択の動作を結ぶ）。期間の候補と印は list-periods を経由し、画面ごとに月の配列を作らない。次＝教訓110。

### 教訓108：pin は「実装の文字列」ではなく「挙動（PostgREST 200・行数）」で張る＝欠陥を含む文字列を pin にすると欠陥が固定化される（CC 提案 2026-10-09 便 X-13d-1・相談役採番 2026-10-09 便 X-13d-2b）

経緯: customers-keep ck(6-3) が from("comp_plans, product_back_fixed_hon, product_back_fixed_jonai, product_back_fixed_free") という壊れた from 文字列を「区分別 3 欄を読む証拠」として pin にしていた。PostgREST は PGRST205（404）を返し plans が常に空になっていたのに suite は緑のまま＝X-13-23 は 11 日間（9/28 19aba5d〜10/9）見逃された。
運用: ①suite に文字列 pin を足すときは、その文字列が仕様か偶然かを 1 行で書く ②一覧読取は suite で PostgREST 200・行数（≥1）を見る（verify-nox-comp-list の型＝同じ形の select が error null・壊れた形は PGRST205）③欠陥を直したら、その欠陥文字列を含む pin を grep して張替える（ck(6-3) は select("*") の形へ）。

### 教訓107：PostgREST の `.in()` は 150 件で分割する（URL 16 KB 超で undici HeadersOverflow＝DB ではなく HTTP 層・CC 提案 2026-10-09 便 V44・相談役採番 2026-10-09 便 V44 続き）

経緯: id を URL のクエリに展開するため 400 件超で URL が 16 KB を超え、undici が HeadersOverflow（HTTP 431 相当）で落ちる＝DB 側のエラーではなく HTTP 層。便 P166 で collect.ts の check_id の `.in()` が月 500 伝票級の店（NOIR）で再現→150 件チャンクに分割して解消。
運用: 可変長の id 配列を `.in()` に渡す箇所は lib の 1 本（chunk 150）を経由し、新規の読取で素の `.in()` を書かない。

### 教訓106：push 前に tsc を通す（Vercel のビルドは tsc 赤で failure＝本番 route が旧デプロイの payload を読み続ける・CC 提案 2026-10-09 便 V44・相談役採番 2026-10-09 便 V44 続き）

経緯: Vercel のビルドは tsc 赤で failure になり、本番 route（cron／demo reset）が旧デプロイの payload を読み続ける。便 X-13c で db5f6ca（型宣言なし）が failure→5f8cb1f（profiles.d.mts）で success の実例。
運用: client／scripts を触った便は `npx tsc --noEmit` を f0 の前・commit の前に 1 回走らせ、報告に「tsc 0」を書く。次＝教訓108。

### 教訓105：STABLE な plpgsql 関数を CTE 内で呼ぶときは、その CTE を materialized にする（PG12 以降の inline 化で行ごと・参照ごとに再評価される＝N+1 型・CC 提案 2026-10-08 便 G2・相談役採番 2026-10-08 便 P165）

経緯: cast_sales_aggregate（mig0014 系）の CTE groups が check_group_due（STABLE plpgsql）を呼び、1 回参照の CTE が inline されて後段の join（noms）と window（ranked）の行ごと・参照ごとに再評価された。NOIR（closed 501 件・1 か月）で 8,359 ms＞authenticated の statement_timeout 8s＝給与プレビュー 500（起票100）。`groups as materialized` で 1 回評価（呼出 501 回）＝95.5 ms（87 倍）・結果の行は不変（0165・裁定336）。
運用: ①STABLE／VOLATILE の関数呼出を持つ CTE は materialized を明示する（結果を 1 回だけ評価する形に）②遅いときは index／RLS を疑う前に「関数を定数に置換した同クエリ」（due=0 で 30 ms）と「VOLATILE ラッパで呼出回数を数える」（docs/tmp/q1008_g1.mjs／q1008_g1b.mjs の型）で切り分ける③SECURITY DEFINER の本文の explain は定義者（postgres）で行う（authenticated では内部関数が permission denied）。

### 教訓104：手順書の例文に角括弧のプレースホルダを残さない＝「貼る値／出どころ」を別表にし、投入後は name だけでなく値の形まで確認する（CC 提案 2026-10-08・相談役採番 2026-10-08 便 G1）

経緯: docs/demo/cron_setup.md §2 の例文 `'https://<本番の NOX ホスト>/…'`／`'<Vercel env CRON_SECRET と同じ値>'` が 2 本ともそのまま Vault に投入された（便 D2-a で URL・便 D2-c で secret を検知＝cron の 401）。name の存在確認（vault.secrets 3 行）では検知できず、値の形（ホスト名の抽出・長さ・ASCII・`<` 始まり）の読取で初めて分かった。
運用: ①手順書の SQL は実値で書くか、値の欄を空にして「貼る値／出どころ（Vercel env の名前・ダッシュボードの場所）」を直前の表に分ける ②投入後の確認クエリは値を出さずに形を返す（length・正規表現・host の substring）を標準にする ③CC は手貼り依頼の報告に「形の確認クエリ」を同梱する（handpaste 案内の型に追加）。適用＝cron_setup.md §2（便 D2-c で改稿済み）。

### 教訓103：生成 mig の突合は文単位で流す（1 文字列で通らないことを mig の欠陥と誤認しない・手貼り手順は不変・CC 提案 2026-10-02・相談役採番 2026-10-08 便 P163）

経緯: 0163 の突合（docs/tmp/q1002_ag_0163.mjs・BEGIN…ROLLBACK）で、生成物の begin/commit を外した本文を 1 文字列で db.query に渡すと、`create extension if not exists pg_cron` を含む並びで 25P02（in_failed_sql_transaction）になった（q1002_ag_0163_dbg.mjs で確認）。splitStatements で文単位に分割し同じ 1 tx 内で順に流すと 22 文が通った。SQL Editor の手貼りは文単位に流すため影響なし＝手貼り手順は変えない（0163 本番適用 2026-10-08 は Success）。
運用: 以後の突合スクリプト（q*_ag_*.mjs）は分割実行を標準とし、「1 文字列で通らない」を mig の欠陥と誤認しない。本文は便 V 報告（2026-10-08）のとおり。

### 教訓102：疎通門番は DB 実行時間と回線 RTT を分けて判定する（select 1 の壁時計は回線を含む・相談役起こし）

2026-10-02: 再開門番「直結 select 1 が 10 ms 台」が 47〜84 ms で NG になったが、explain analyze の Execution Time は 0.056 ms・ICMP RTT が Supabase edge 60 ms（google 3 ms）＝回線経路の遅延で DB は健全だった。壁時計 1 本では「DB が重い（昨日型＝503・pool timeout・秒単位クエリ）」と「回線が遠い」を区別できない。以後の門番＝裁定332 の 3 値（REST 認証付き 200×3／Execution Time<5 ms／RTT<150 ms）・ステータスは当該リージョンのみ・RTT>50 ms なら所要見込みを先に報告。

### 教訓101：同一 tx 内は now() 固定で打刻順序が不定・suite は clock_timestamp()（相談役起こし）

出典＝相談役 2026-10-01 受領（便「台帳記入＋0162 起草」・逐語）: 「教訓101＝『同一 tx 内は now() 固定で打刻順序が不定・suite は clock_timestamp()』（CC 提案の『教訓98（提案）』はこの番号に改める・既存 98 は不変）」。
経緯: 便 M4 の f0 run2 で 0158 suite（6-6／6-8／6-9）が 'no open punch'／'invalid_input' で赤。原因＝BEGIN…ROLLBACK の 1 tx 内で直 insert した in（punched_at default now()）と RPC が入れた out（now()）が同時刻＝punch_seq_check の「最終打刻」（order by punched_at desc）の並びが不定で、out が in より前に見えることがある（0161 で順序検査が入ったため顕在化）。本番は打刻ごとに時刻が進むため影響なし。
運用: suite が同一 tx 内で「時刻の前後」に意味のある行を作るときは now() ではなく clock_timestamp() を入れる（0158／daily-pay の reopen fixture・punch-sequence は成功した打刻の punched_at／created_at を clock_timestamp() へ寄せる）。並びの同定は教訓98（id で find）・時刻の前後は本教訓（clock_timestamp()）。

### 教訓100：hm 等の正規表現 CHECK は NULL を素通りする＝NULL 不可なら is not null を明示（0160 ★4・相談役起こし）

出典＝相談役 2026-09-30 受領（便 S160-1・逐語）: 「教訓100『hm 等の正規表現 CHECK は NULL を素通りする＝NULL 不可なら is not null を明示（0160 ★4）』」。
経緯: 0160 ★4 の shift_wishes_hm_kind_ck を `kind='work' and start_hm ~ '…' and end_hm ~ '…'` と書いたところ、突合 4-2（work の片方 NULL）が通ってしまった＝SQL の CHECK は NULL（unknown）を違反にしない（`NULL ~ regex` は NULL・`and` の結果も NULL）。`is not null` を足して赤→緑（2026-09-30 便 D160-3）。
運用: 列を null 可にした上で条件つきの CHECK を書くときは、必須側に `col is not null and col ~ '…'` を明示する。突合には「必須側の片方だけ NULL」の段を必ず置く（0160 の 4-2 型）。

### 教訓99：相談役の裁定本文はブロック内に置く＝ブロック外の本文は CC に届かない（相談役起こし）

出典＝相談役 2026-09-30 受領（便 P-2・逐語）: 「教訓99『相談役の裁定本文はブロック内に置く＝ブロック外の本文は CC に届かない（9/30 S159-1）』」。
経緯: 便 S159-1「裁定324 追補3 を本文つきで収載（上の逐語）」の「上の逐語」がブロックの外に置かれていたため CC に届かず、教訓70（本文が無い番号は作らない）で停止＝再送で 1 往復を失った（2026-09-30）。
運用: 裁定・追補・教訓・起票の本文は、CC に渡すブロック（【repo】…報告後停止）の**中**に「---- 本文（逐語） ----」で囲って置く。ブロック外の説明文・チャットの前後の文は CC の入力にならない。CC 側＝本文が無い番号を受けたら収載せず停止して本文を求める（教訓70）。

### 教訓98：suite は同一 tx 内で作った行を順序（rows[0]・order by 時刻）で同定しない＝now() が同値で並びが不定。id で find する（相談役起こし）

出典＝相談役 2026-09-29 受領（便 W-1f・逐語）: 「教訓98『suite は同一 tx 内で作った行を順序（rows[0]・order by 時刻）で同定しない＝now() が同値で並びが不定。id で find する。9/28 便 U の daily-pay dp(3-5) で run 2 が赤』」。
経緯: 便 U で新設した verify-nox-daily-pay の dp(3-5) は okuri_today_summary の 3 行（self／proxy／kiosk の out）を `order by punched_at` で受け、`rows[0].punch_id === p2id` で先頭を self の行と決め打ちしていた。3 行とも同じ BEGIN…ROLLBACK 内の挿入で punched_at＝now()＝トランザクション開始時刻の同値＝並びは実行ごとに不定。9/28 便 W の f0 は run 1（18:22〜18:34）緑 79 段 5,074 の直後、run 2（18:35〜18:47）が最終 79 段目の dp(3-5) だけ赤（返った 3 行の中身は正しい＝DB 側の回帰ではない）。教訓96（audit 照合は tx 内に限定）の起草時にも「tx 内の order by at は無意味＝after_json で同定」と同型を踏んでいた。
運用: 同一 tx で複数行を作る suite は、行を **id（punch_id・返り値の id・idem_key）で find** して照合する。件数は length、集合は every／some で見る。`rows[0]`／`rows[n]` を使ってよいのは 1 行しか返らない照会だけ。時刻で並べたいときは fixture 側で明示の時刻（punched_at を 1 分ずつずらす等）を与える。

### 教訓97：画面ソースを編集する便は、その画面を読む pin suite を grep で洗い出し、単独走に全部含める（相談役起こし）

出典＝相談役 2026-09-28 受領（便 W-1c・逐語）: 「教訓97『画面ソースを編集する便は、その画面を読む pin suite を grep で洗い出し（scripts/verify-nox-*.ts の import・正規表現）、単独走に全部含める。9/28 便 X で today-row を落として f0 が赤』」。
経緯: 便 X-2（裁定310）で shift-board の行内「出勤を修正／退勤を修正」リンクと旧 PunchCorrectionModal を除去し、修正フォームを「調整」モーダルのタブ①に埋め込んだ。便 X-4 の検査は tsc／lint／messages／ui-tokens／nav の単独走だけで、shift-board のソースを正規表現で係留している verify-nox-today-row の tr(7-9)（旧配線＝`<PunchCorrectionModal castId={corr.castId}`・`{KIND_LABEL[k]}を修正`）を走らせなかった。便 W の f0 run 1b（18:07〜18:19）が 66 段目 today-row で赤＝pin の取り残し（フレークではない）。
運用: 画面ファイルを編集したら、コミット前に `grep -ln "<そのファイルのパス>" scripts/verify-nox-*.ts`（readFileSync の対象）で pin suite を洗い出し、単独走に**全部**含める（今回なら today-row＋messages）。pin が意図した変更で赤になるなら、同じ便で suite を新配線に張り替えて suite としてパス個別コミットする。

### 教訓96：suite の audit_logs 照合は action 名だけで数えない＝target＋`at >= now()` で tx 内に限定（本番の運用履歴で赤になる）（相談役起こし）

出典＝相談役 2026-09-28 受領（便 V-1・逐語）: 「教訓96『suite の audit_logs 照合は action 名だけで数えない＝target＋at >= now() で tx 内に限定（本番の運用履歴で赤になる）』」。
経緯: 便 U の f0 run1（2026-09-28 16:03〜16:14）が compliance cp(5-5) で赤。suite は `select … from audit_logs where action='customer_anonymize'` で 1 行を期待していたが、同日の Agoora 目視（便 S ①〜⑥）で本番の顧客 1 件が実際に匿名化されており、その運用記録を拾って 2 行になった。関数もデータも正しく、suite の照合が甘かった。
運用: suite が自分の tx で書いた audit 行を数えるときは、action だけでなく target（`customers:<id>` 等）と `at >= now()`（tx 内の行は transaction timestamp＝now() と同値）で限定する。compliance／daily-pay の 5 箇所を同日に是正（45bef2e）。live に運用履歴が積まれるほど「action 名だけ」の照合は赤くなる＝先回りで限定する。

### 教訓95：単独 suite 走行の直後に門番を走らせない（自分の audit 行で audit 60s が NG）＝60 秒以上空ける（相談役起こし）

出典＝相談役 2026-09-28 受領（便 V-1・逐語）: 「教訓95『単独 suite 走行の直後に門番を走らせない（自分の audit 行で audit 60s が NG）＝60 秒以上空ける』」。
経緯: 便 U で変更 suite 4 本を単独走した直後（16:01）に裁定200 の門番を走らせ、「直近 60 秒の audit_logs」が 113 行で NG（direct 0・verify proc 0）。行はすべて自分の単独走（billing／anon-guard 等の書込）が残したもので、他プロセスの併走ではなかった。75 秒待って再走（16:03）→ 0 で OK。
運用: 単独 suite（または seed）を走らせた後は 60 秒以上空けてから門番（docs/tmp/q0928_gate.mjs＝direct／audit 60s／local verify proc）を走らせる。門番の NG は「自分の直前の書込か」をまず疑い、他プロセスの併走と区別して報告する。

### 教訓94：【ローンチ後に発効】f0 の起動可能帯＝06:00〜19:30 JST（営業 20:00 開始・締め帯を避ける）。ローンチ前は時間帯の制限なし（相談役起こし・9/28 Agoora 改稿）

出典＝相談役 2026-09-28 受領（便 T-1・逐語）: 「教訓94『f0 は本番 DB を叩くため 18:00〜翌 06:00 JST は起動しない（営業・締め帯）。帯内は停止して報告』」。
経緯: f0（78 段・約 13 分×2 連）は nox-dev の本番共有 DB に直結して fixture を書き・ROLLBACK する。営業中（開店〜締め）は会計 RPC・打刻・締めの本番書込と並走し、statement timeout／pooler の無応答（9/25 run2b・教訓85）を誘発しやすい。
便 R（9/28 13:50 起動）で「営業時間帯なら起動せず停止」の指示に対し台帳に帯の定義が無く CC が「昼＝起動可」と判断した＝定義を台帳に置く。
改稿（2026-09-28・便 W-0・Agoora）: 「【ローンチ後に発効】f0 の起動可能帯＝06:00〜19:30 JST（営業 20:00 開始・締め帯を避ける）。ローンチ前は時間帯の制限なし（9/28 Agoora）」。初版の 06:00〜18:00 は 9/28 17:3x の便 W が帯超過で止まった実績を受けて改稿＝ローンチ前は本番の営業書込が無いため帯の制限を外し、ローンチ後に 06:00〜19:30 JST を発効する。
運用: **ローンチ後**は f0（`npm run verify:f0`）の起動可能帯を **06:00〜19:30 JST** とし、起動前チェック（裁定200 の 3 値）に加えて機械時刻を確認し、19:30〜翌 06:00 は起動せず「帯内のため停止」と報告して次便に回す。**ローンチ前は時間帯の制限なし**（3 値 0 のみ）。単発 suite の追試（BEGIN…ROLLBACK・1 本）は帯の対象外だが、同じ理由で最小限にする。将来「検証 DB 分離」（ローンチ前ゲート）が入れば本教訓は解除を再裁定する。

### 教訓93：docs 便は `git commit -- <パス>` でパス指定コミット・stage 済み index に依存しない（相談役起こし）

出典＝相談役 2026-09-28 受領（v40 §10-2 P-1・逐語）: 「教訓93『docs 便は git commit -- <パス> でパス指定コミット・stage 済み index に依存しない（9/25 2412601 の同乗）』」。
経緯: 2026-09-25 無人便 N3 で、0153 手貼り後ブロック E の直前に stage した supabase/migrations/0153_customers_keep.sql（収蔵版 sha 4a5145b0…7c68）が index に残ったまま docs コミット `2412601` を `git commit -m` で作ったため、docs のみのはずの push に mig 1 本が同乗した（内容は最終の収蔵版＝本番適用済み・害なし・v40 §0 で「そのままで確定」）。
運用: docs のみの便は `git add <docs パス>` の直後に `git commit -m "..." -- <docs パス>` とパス指定でコミットし、index に何が stage されていても巻き込まない。コミット直前に `git diff --cached --stat` で対象外のパスが無いことを確認する。夜間規則「push は docs のみ」の担保はこの 2 点。

### 教訓92：mig で列・キー・RPC を足すときの pin 走査は「その値を読む suite を全部」挙げる（相談役起こし）

出典＝相談役 2026-09-24 受領（逐語）: 「教訓92 mig で列・キー・RPC を足すときの pin 走査は“その値を読む suite を全部”挙げる(store-profile だけでなく store-systems も 21 キーを pin していた・0151 run1 の赤)」。
経緯: 0151 の突合 c-3 は set_store_profile 白名単の pin を store-profile だけ挙げ、同じ白名単を prosrc から読む store-systems（ss(4-0)＝20 キー）を落とした→ 2026-09-24 f0 run1 が 51 段目で赤（timeout ではなく設計上の pin 漏れ）→ `5f76dbc` で 21 キーへ張り替え。
運用: 値・列・キー・関数名を pin する suite は grep（その語・その本数）で全数を挙げてから張り替える。名簿 A/B（billing）・probe（anon-guard）・grants に加え、prosrc を読む suite（store-systems 型）も走査対象。

### 教訓91：逆テストの破壊・復元に git checkout／stash を使わない（相談役起こし）

出典＝相談役 2026-09-18 受領（逐語）: 「[教訓91] 逆テストの破壊・復元に git checkout/stash を使わない。出典=9/18 Y 便の stash 事故(tracked 変更の退避→結線欠落で発覚・pop で復旧)。」実例＝2026-09-18 便 Y（紹介料の入口）の逆テストで、untracked の lib/nox/register/referral.ts を `git checkout --` で戻そうとして失敗し、フォールバックに書いた `|| git stash -q` が **tracked の register-board／layout／nav-icons の未コミット変更を退避**した。直後の suite で結線 grep（re(8-4)）が赤・サイドバーのアイコン欠けで発覚し `git stash pop` で完全復旧（DB 影響なし）。対策＝逆テストは python（または sed）で壊して同じ手段で戻す・退避が要るならファイルのコピー（cp）で行う・`git checkout`／`git stash`／`git restore` を逆テストや一時退避に使わない。

### 教訓90：名簿正本（docs/NOX_課金ゲート対象_v1.md）の説明文に関数名を裸で書かない（相談役起こし）

出典＝相談役 2026-09-18 受領（逐語）: 「名簿正本(docs/NOX課金ゲート対象v1.md)の説明文に関数名を裸で書かない。パーサ docNames が名簿行として拾い全数がずれる」。実例＝2026-09-18 0148 B-1: A1 の check_add_referral の説明文に「課税額から除外（check_group_due）」、A7 の set_cast_norm_self の説明文に「auth_cast_id() 由来」と書いたところ、verify:nox-billing 段47-1 の docNames（`## A. 対象`〜`## B. 除外` 区間の live 名一致トークンを名簿として拾う）が check_group_due・auth_cast_id を A の名簿に数え「対象 130（期待 128）」「対象→live: check_group_due,auth_cast_id にゲートなし」で赤。説明文を「DB の group due 計算」「呼び出し元 JWT から導出」に書き換えて緑（`8af0be5`）。対策＝名簿の A／B 区間の説明文では他の関数名を書かない（書くなら区間外のヘッダ bullet か、名簿行として意図した名前だけ）。

### 教訓89：fixture の認証情報（auth のメール等）を書き換える逆テストは finally の復元を先に書いてから壊す（相談役起こし）

出典＝相談役 2026-09-17 受領（逐語）: 「教訓89: fixture の認証情報（auth のメール等）を書き換える逆テストは finally の復元を先に書いてから
壊す。267 で ownerA のメールが書き換わったまま残り以後の走行が全て sign-in 失敗で赤になった
（se(fin-fx) で防御的復元を追加）。」実例＝2026-09-17 裁定267 の逆テスト「owner 自身許可」で performUpdateEmail が nox-verify-owner-a の auth／public のメールを実際に書き換え、以後の suite が ownerA の sign-in 失敗で全滅（rev-b／rev-c／final が空出力）。原状復帰 script（docs/tmp/q0917_fix.mjs）で戻したうえで、verify-nox-staff-email の finally に ownerA／castA1a の email を fixture 値と照合して auth→public の順で戻す se(fin-fx) を追加（正常時は no-op・逆テスト時は赤で復元を報告）。※教訓88 は提案段階のため未収載。

### 教訓88：DB を触る script（node -e 含む）は finally で接続を閉じる（相談役起こし）

出典＝相談役 2026-09-17 提案・2026-09-18 承認（逐語）: 「DB を触る script(node -e 含む)は finally で接続を閉じる」。背景＝Supabase Free（t4g.nano）は backends が少なく、検証や調査の使い捨て script（node -e／docs/tmp/*.mjs）が例外で落ちると接続が残り、次の f0 が statement timeout 型の赤や無応答（教訓85）を引く。実例＝0148 便（2026-09-18）は A 段の q0918_0148_post.mjs から O 段の読取まで全 script を `try { … } finally { await db.end().catch(() => {}) }` で書き、f0 4 走の走行前 3 値は backends 16〜20（全て Supabase 内部＋走行中 suite）で残骸 0。suite 本体（verify-nox-*.ts）も同じ形（`finally { await db.end() }`）＝1 トランザクション＋ROLLBACK 型の suite は例外時も rollback→end の順で閉じる。

### 教訓87：裁定本文に「N 箇所」と書くときは実ファイルの逐語 grep で内訳を確定してから書く（相談役起こし）

出典＝相談役 2026-09-17 受領（逐語）: 「教訓87: 裁定本文に「N 箇所」と書くときは survey の記述ではなく実ファイルの逐語 grep で内訳を
確定してから書く。件数が合っていても中身が違うことがある（264-3 の slip）。」実例＝裁定264-3 は「控除計の和を持つ 5 箇所」と書いたが、survey 段階の 5 箇所には slip が含まれ、実ファイルでは slip は和を持たず hasDed の存在判定のみ＝対象外だった（実装時の grep で右パネル Σ に差し替え・件数 5 は一致したまま中身が 1 箇所違った）。以後、裁定本文の「N 箇所」は grep の出力（ファイル:行）を添えてから確定する。

### 教訓86：凍結値の計算主体を prosrc で確かめてから補正 mig の要否を判断する（相談役起こし）

出典＝相談役 2026-09-17 受領（逐語）: 「教訓86: 凍結値の計算主体を prosrc で確かめてから補正 mig の要否を判断する。money-core の md5
不変は「器が変わらない」であって計算不変ではない（計算が route 側にある RPC では器と計算の
所在が別）。0146 で相談役が「payroll_finalize に読み口が無い＝補正 mig 要」と見立てて外れた。」実例＝mig0146 の起草時、payroll_finalize の prosrc に payroll_adjustments の読み口が無いことから補正 mig を見込んだが、finalize の凍結値（breakdown_json・net）は route 側の computePayrollDraft（core.ts）が計算して RPC に渡す構造＝RPC は器で計算主体ではないため、client レーンだけで凍結値に調整が乗り mig 0 で済んだ。以後、補正 mig の要否は「その凍結値を誰が計算しているか」を prosrc と route の両方で確かめてから判断する。

### 教訓85：DB 無応答時、60 秒間隔の再試行ループを長時間続けない。状態確認はダッシュボードで行う（相談役起こし）

出典＝相談役 2026-09-15 受領（逐語）: 「教訓85: DB 無応答時、60 秒間隔の再試行ループを長時間続けない。復帰を早めず、
hang する probe が接続を消費して詰まりを助長しうる。状態確認はダッシュボードで行う
（STATUS・Advisor・Postgres ログ）。2026-09-15 は 1 時間続けたが、復帰は再起動によるものだった。」実例＝15:33〜16:46 の無応答中に CC が 60 秒間隔の probe を 6 ループ（約 70 分）継続・hang した probe 1 本を kill。復帰は Agoora の再起動（postmaster 16:46:22）。以後の運用＝接続エラー・認証タイムアウト・DB 無応答は「DB 起因」と明記して即停止・再走もループも組まず、ダッシュボード確認を相談役に求める（2026-09-15 16:47 ブロックで規定）。

### 教訓84：新 RPC を足す mig は、起草の時点で既存 pin の走査対象に入るかを洗う（相談役起こし）

出典＝相談役 2026-09-15 受領（逐語）: 「教訓84: 新 RPC を足す mig は、起草の時点で既存 pin の走査対象に入るかを洗う。
payroll_* を走査している suite の全数、課金ゲート名簿の追随要否を先に見る。
手貼り後の f0 で見つかると走数と時間を使う。2026-09-15 は 0146 が 2 箇所（B5 A2・課金ゲート名簿）に
触れ、f0 の赤 2 本を招いた。」実例＝run1 15:00（verify-nox-payroll B5 A2 が payroll_adjustment_add の p_cast_id を拾う→裁定260 で許可列挙化・`c9f6aee`）・run2 15:07（verify-nox-billing 段47-1 liveOnly=2→裁定261 で B(e) 収載・`7064df9`）。静的突合ブロック（a〜h）に「既存 suite の prosrc／pg_proc 走査（proname like）に新名が入るか」「課金正本 A/B の追随」を項目として加える。

### 教訓83：CC ブロックの冒頭に対象 repo とパスを明記する（相談役起こし）

出典＝相談役 2026-09-15 受領（逐語）: 「教訓83: CC ブロックの冒頭に対象 repo とパスを明記する（【repo: nox / C:\Users\abet\Dropbox\cloude\nox】）。
BANZEN と NOX が同時に動いており、2026-09-15 に NOX の指示が BANZEN セッションへ渡った。
CC 側が内容から気づいて実行せず止めたが、ブロックに repo があれば即座に弾ける。」実例＝2026-09-14 の RECTUS push 指示（誤セッション・HEAD 不一致で停止）と 2026-09-15 の NOX 指示の BANZEN セッション着信。以後のブロックは冒頭 1 行目に【repo: … / パス】＝CC は git remote と cwd を照合し、不一致なら 1 行で報告して停止。

### 教訓82：security definer RPC で actor を入れるときは auth.uid() を直に使わず、既存 RPC の actor 導出行を写経する（相談役起こし）

出典＝相談役 2026-09-15 受領（逐語）: 「教訓82: security definer RPC で actor を入れるときは auth.uid() を直に使わず、既存 RPC の actor 導出行を写経する。auth.users.id と public.users.id の 2 系統があり、混同すると created_by と audit が別空間の uuid になる」実例＝0146 初稿（335b90fd）が created_by と audit の actor に auth.uid() を渡していた→静的突合 ★a-2／★3 で指摘→`select id into v_actor from public.users where auth_user_id = auth.uid() and is_active;`（既存 88 箇所と一字同形）へ差し替え・created_by に users(id) FK を追加（b66c2c89）。

### 教訓81：CC ブロックの期待 HEAD は、同じ便で自分が指示したコミットを織り込んでから書く（相談役起こし）

出典＝相談役 2026-09-15 受領（逐語）: 「教訓81: CC ブロックの期待 HEAD は、同じ便で自分が指示したコミットを織り込んでから書く。直前の報告値をそのまま写さない」実例＝裁定257 ブロック（client 1 本でコミット）の直後に届いた 0146 突合ブロックが期待 HEAD 32d2123・rev-list 0 0 のままで、実際は dd9cc0a・0 2（257 の client＋docs）→手順 1 で停止・再発行。

### 教訓80：裁定本文に既存 CHECK の値・件数を書く前に live 逐語で照合する（相談役起こし）

出典＝相談役 2026-09-15 受領（逐語）: 「教訓80: 裁定本文に既存 CHECK の値・件数を書く前に live 逐語で照合する（deductions の kind を 7 種と書いたが正は 6 種）」実例＝docs/tmp/0915_survey2.md b（deductions の kind CHECK＝unworked／sanction／statutory／agreed_cost／store_receivable／advance_settlement の 6 種・pay.ts 121 の型も 6 値）。

### 教訓79：新クラスを裁定本文に書く前に、その名前が既に存在しないか grep させる（相談役起こし）

出典＝相談役 2026-09-14 受領（逐語）: 「教訓79 新クラスを裁定本文に書く前に、その名前が既に存在しないか grep させる。0144/251 の調査ブロックで .nox-tablewrap の実在を確認せず本文に定義を書き、CC が上書き（既存 7 表の枠が消える）を避けて修飾子で逃がす判断を要した。」実例＝globals.css 1176 の既存 `.nox-tablewrap`（枠つき・7 ファイル使用）と裁定251 の同名定義が衝突→既存へ 2 プロパティ追加＋修飾子 `.plain` で回避（`5543d9b`）。調査ブロックの手順に「提案する新クラス名・新関数名は grep で実在 0 件を確認して報告」を含める。

### 教訓78：裁定243 のタイムアウト型は cast-photo の 504 に限らない（payroll の statement timeout も同型）。起動ブロックで再走条件を特定の段に限定して書かない（相談役起こし）

出典＝相談役ブロック 2026-09-14 手順 5（逐語）: 「裁定243 のタイムアウト型は cast-photo の 504 に限らない（payroll の statement timeout も同型）。起動ブロックで再走条件を特定の段に限定して書かない（2026-09-14 に run2 が payroll の statement timeout で止まり、再走指示を挟む往復が発生した）」。タイムアウト型の判定は段名ではなくエラー種別（statement timeout・504・ETIMEDOUT）で行う。

### 教訓77：verify の assertion 集計は段ごとの出力書式差で取りこぼす（staff-shift だけ括弧内に所要秒が付く）。集計器は既知値（9/11 run4＝41 段 3,765）で先に較正する（相談役起こし）

出典＝相談役ブロック 2026-09-14「裁定240 新設」手順 3。2026-09-14 の f0 run1 集計で verify:nox-staff-shift の出力「(53 assertions・21s)」が正規表現 `assertions)` に掛からず 44 段 3,771 と誤集計→括弧内の数値だけ拾う集計へ直し 45 段 3,824 を確定（9/11 run4 も同集計で 41 段 3,765 と一致）。

### 教訓76：裁定は承認したセッションで台帳に収載する。相談役ブロックだけで進めると正本から落ちる（240 が 9/10 承認のまま 9/14 まで台帳に無く、244・245 がその上に積まれた）（相談役起こし）

出典＝相談役ブロック 2026-09-14「裁定240 新設」手順 3。教訓70（番号を振る時点で本文を残す）の続き＝承認済みでも収載を別セッションへ送ると落ちる。裁定240 は 2026-09-14 に追認収載（承認時の逐語ではない）。

### 教訓75：機械走査の候補は親行のソースで照合してから置換する。走査数を作業量と読まない（240 で 141→54）（相談役起こし）

出典＝相談役 9/12 起動ブロック 手順 6（2026-09-11 受領・2026-09-14 収載）。裁定240 の棚卸し（docs/240_inventory.md）は機械走査で対象 141 行＋ダイアログ 64 行を数えたが、親行のソース照合後の実対象は (a) 64→28・(b) 70→15・(c) 71→11＝付け替え 54 行。

### 教訓74：率の合成は元値（金額）から計算する。丸め済み表示値を足さない（B6-12 初版で 3 名合計が 99.9% になった）（相談役起こし）

出典＝相談役 9/12 起動ブロック 手順 6（2026-09-11 受領・2026-09-14 収載）。集中度（上位 3 名）の初版は丸め済み構成 % の和（99.9%）＝裁定 B6-12 改定で按分売上 ¥ 合計 ÷ salesRankTotal（100.0%）へ（`2bb9cd6`／`2296319`）。

### 教訓73：CC ブロック内の「上記」「前述」参照は貼り付けで切れる。裁定本文はブロックに逐語で含める（242 で本文なしのまま届き停止）（相談役起こし）

出典＝v31 §5（2026-09-11 提案・2026-09-14 収載）。

### 教訓72：sha を引き継ぎ書に載せる前に桁数 64 を機械で確認する（v30 §8 で 63 桁を載せた）（相談役起こし）

出典＝v31 §5（2026-09-11 提案・2026-09-14 収載）。以後の収蔵ブロックは「桁数 64 を確認・不一致なら収蔵せず停止」を手順に含める。

### 教訓71：CC を新セッションに切り替える前に旧セッションの実行中プロセス（f0・watcher）を確認する（相談役起こし）

出典＝v31 §5（2026-09-11 提案・2026-09-14 収載）。2026-09-10 は旧セッションが 10:09 に run1 を起動済みのまま新セッションへ切替→並走（裁定241 で本日限り 2 連緑扱い）。

### 教訓69：合算＝子表の行移送は unique／partial unique を全列挙してから設計し、目視前に「2 卓とも自動時間料金あり」の fixture を suite に入れる（相談役起こし）

2026-09-10、check_merge（mig0138／0139）は from の check_lines を `update … set check_id = into` で丸ごと移すが、check_lines には部分ユニーク `check_lines_one_time_auto`＝`(check_id, fee_kind, block_no) where time_auto` がある。check_open は set_fee×units＞0 の店で必ず `time_auto=true・fee_kind='set'・block_no=0` の行を作る（vip_charge 行も `'vip_charge'・0`、auto 店の延長は `'extension'・k`）ため、**時間料金のある店では 2 卓とも同じキーの自動行を持ち、合算は Postgres の unique 違反（`merge_conflict:*` ではない生の duplicate key）で失敗する**。verify-nox-reopen の merge fixture は pg 直 insert の伝票（set 行なし）で作ったため緑のまま通り、目視前の読取調査（本日 13:42）で露見した。

- **設計時**: 子表を移送する RPC は、対象表の **unique／partial unique index を pg_indexes で全列挙**し、キーごとに「移送後に衝突し得るか」「衝突時の扱い（拒否＝merge_conflict／変換＝time_auto を落として手動行化／統合＝upsert）」を設計書に書く。check_lines 以外の実測＝check_nominations(check_id, cast_id)→merge_conflict:cast で封鎖済み／check_seats(seat_id)→移送は seat_id 不変・主席は on conflict／payments(idem_key)→money 拒否で不到達／checks_one_open_per_seat→from は merged になるため不衝突。
- **自動行の変換を選ぶ場合の確認点（prosrc 実測）**: check_time_charge_apply は `time_auto` 行だけを delete／upsert し（L59-148）、check_set_people も `time_auto and fee_kind in ('set','vip_charge')` だけを人数追随させ、check_line_set_group は `time_auto` 行だけ 'time line' で拒否、check_recalc は time_auto を見ない（pay_group 別の Σline_total）。＝from の自動行を `time_auto=false・block_no=null` の手動行へ変換して移せば、into 側の再計算・延長・人数変更は into 自身の自動行だけを対象にし、移した行は凍結値のまま合計に残る（二重計上ではなく from 卓ぶんの実額）。manual 店の check_extension_add は元から `time_auto=false`＝影響なし。
- **suite**: 合算の fixture は check_open（RPC）で開卓し **2 卓とも set 行（time_auto）を持つ**状態を必ず含める。pg 直 insert の伝票だけで merge を緑にしない。

### 教訓68：生成 mig の挿入行は「参照する変数が宣言済みか・その行の時点で代入済みか」を機械で assert する（相談役起こし）

2026-09-10、mig0140（16 本へ関所 1 行を機械挿入）の生成器は、伝票行のない check_open だけ `assert_day_open(v_store, biz_date_of(v_store, now()))` を**ゲート行の直後**に差したが、check_open に v_store は無く（店は `v_seat.store_id`・しかも select はゲート行より後）、手貼り後の live で開卓が全件 `column "v_store" does not exist` になった（billing 段47-3 で検知→0141 で補正）。生成器の機械確認は「挿入前に呼出なし・挿入位置 1 本・行数 +1」だけで、**挿入行が参照する識別子を見ていなかった**。生成 mig では**挿入行に現れる v_*／p_* を declare 部と引数リストに照合し、かつ代入（`into v_x`／`v_x :=`）が挿入位置より前にあること**を assert する（0141 生成器の (c) が前例）。加えて、生成した mig は手貼り前に **verify の単体（billing 等）を先に走らせる**か、少なくとも代表 1 本を dry-run（begin〜rollback）で呼ぶ＝「本文一致」の突合だけでは実行時エラーを拾えない。

### 教訓67：NOT NULL 列を持つ表への insert は列定義を先に写す（相談役起こし）

2026-09-10、mig0138 の check_merge が from の主席を into の追加席へ移す `insert into public.check_seats (check_id, seat_id)` を書いたが、check_seats は org_id／store_id が NOT NULL・default なしで、統合の通常ケースで not-null 違反になる（CC 突合で検知→0139 で補正）。mig の起草では**insert 先の表の列定義（NOT NULL・default・FK）を live dump から先に写し、insert の列リストと突き合わせる**。proof も「関数が存在する」だけでなく「insert 文の列リストに NOT NULL 列が揃う」（`prosrc like '%insert into … (org_id, store_id, …)%'`）を 1 行入れる（0139 の proof が前例）。

### 教訓66：RLS policy から呼ぶ関数は authenticated に execute を付ける（policy 評価は呼出者権限）

2026-09-09、mig0136 の 4 表 select policy が `staff_shift_can_manage(store_id)` を呼び、同関数を内部専用の流儀（4 ロール明示 revoke）で作ったため、policy 評価が `permission denied for function` で落ちて全ロールの select がエラーになった（RPC 本文からの呼出は SECURITY DEFINER 文脈＝postgres 権限で通るため mig 末尾の proof では見えない）。**policy の using／with check から呼ぶ関数は auth_* ヘルパー同型＝`grant execute to authenticated`** が要る（内部専用の 4 ロール revoke は「公開 RPC の本文からだけ呼ぶ関数」に限る＝CLAUDE.md 二重防御 8 の流儀の境界）。検知は verify の 3 ロール select（ss(7a〜7d)）と直結 pg の `set local role authenticated` 再現。0137 で補正（裁定231）。

### 教訓65：ブロックの項目を差し替えるときは全体を再提示する（差分だけ送らない）

2026-09-09、mig0136 収蔵ブロックの「名簿: A8/B(f) に 7 RPC を追加」は 0136 の RPC が課金ゲート未内蔵だったため機械 assert と矛盾し、CC が B(l) 係留へ読み替えた。その後 0137 で 6 本を A8 へ・staff_wish_set を B(i) へ差し替える指示が出たが、前ブロックの残項目（f0 連結・pin 更新・逆張り）との関係が差分だけでは追えない。**項目を差し替えるときは、ブロック全体（前提・番号・期待値）を再提示する**＝CC 側は差し替え後の全体で読み直し、前ブロックの残項目を勝手に持ち越さない（教訓64「走数・日付条件は手順行の先頭」と対）。

### 教訓64：走数／日付条件は手順行の中に書く（末尾注記に置かない・相談役起こし）

2026-09-09 夕、指示ブロックの手順 1 に「裁定200 起動前チェック → f0 run1 → run2」が書かれ、走数上限（当日 5/6）と日付条件（明朝 9/10）は末尾の注記にあった。CC は手順を上から実行して起動前チェック直後に run1 を起動し、注記の受信はその約 1 分後＝当日 6/6 に到達（途中停止は各段の finally 掃除が走らないため完走させ run2 は打たず・9/9 の run1 緑は持ち越さない）。恒久注意 9（1 日 6 走以内）・裁定200（1 本ずつ・起動前チェック）は守れても「今日は打たない」は手順行に無いと効かない。以後、f0 を含む手順行は **「当日 N/6 を確認してから」「9/10 のみ」のように走数・日付の条件を同じ行の先頭に書く**（末尾注記・別段落に置かない）。CC 側も、f0 を起動する行を読んだら**同ブロック全体を読み切ってから**起動する。

### 教訓63：複数チャットの f0 衝突＝f0 を含む起動ブロックは 1 チャットにのみ貼る

2026-09-09 朝、別チャットが handoff v27 収蔵（`c07a422`）を積む間に本チャットが f0 run1 を起動した（相談役指摘＝複数チャットの f0 衝突。本チャットは他チャットの f0 走行を直接は観測していない＝run2 前の実測は直結 client 自分のみ）。同一 dev DB の fixture と sweep は共有のため、並走すると赤・timeout・sweep の取りこぼしが起きうる（教訓56 の同型＝「f0 と f0」）。予防＝(1) f0 を含む起動ブロックは同時に 1 チャットへだけ貼る (2) 起動前 60 秒チェック（裁定200）(3) 走行中に別チャットへ指示を出すときは「CC 走行中」と一言 (4) sweep の起動ガード（#65）。本日の run1 は裁定201 で例外扱い。

### 教訓62：docs の一括更新スクリプトは「git から戻して1回だけ適用」・行番号は id 照合で守る

対応表の行更新スクリプトで行番号を1つ誤り（見出し行を数え違え）、途中で例外＝台帳側だけ書込済みの状態から再実行して**台帳ブロックを二重挿入**
（2026-09-07・分析 N1 docs）。是正＝`git checkout -- <docs>` で両ファイルを戻し、修正済みスクリプトを 1 回だけ流す。予防＝(1) 行更新は必ず
`c[1].trim() === EXPECT[ln]`（行 id 照合）で守り、不一致は throw (2) 台帳挿入と対応表更新を**同じスクリプトで同時に**行い、失敗時は両方戻す
(3) 適用後に見出しの重複を `grep -c` で確認（各 1）。

### 教訓61：改行コードが変わると全行差分になる＝コミット前に `git diff --stat` の行数を見る

分析 N1（2026-09-07）で編集ツールが analytics-board.tsx を CRLF で書き戻し、index（LF）との比較で **1,225／1,216 の全行差分**としてコミットされた
（`git diff --ignore-all-space --stat` では 21 行）。未 push だったため LF へ戻して amend。原因＝リポジトリに `.gitattributes` が無く、core.autocrlf は
system=true／user=false の個人設定依存＝ツールが書く改行がそのまま index に入る。gate＝**コミット前に `git diff --stat` を見て、変更行数がファイル行数
に近ければ改行を疑う**（`git ls-files --eol` で i/ と w/ を照合）。恒久策＝`.gitattributes`（`*.ts *.tsx *.css *.md *.json *.sql text eol=lf`）の追加
＝夜間 O1 で試行したが `git add --renormalize .` が対象外の `.html` 1 本を拾って 191/191 の差分が出たため停止リスト行き。★翌朝の再実測（2026-09-09）で
向きが逆と判明＝index は LF・**worktree 側が CRLF**（Dropbox／エディタ由来）で、昨夜の `git checkout --` により解消済み。再 renormalize は差分ゼロ＝`.gitattributes` 単独で収蔵。

### 教訓60：対応表の「既存」＝当該画面に描画済みのもの。他画面実装の流用は「既存（他面）」で区別する

ホーム v2.1（§9）の写像で、他画面（reservation-panel／register-board／report-board）に実装がある要素を「既存」と分類したため、
A層（表示追随）の見積りと実作業（新規クエリ＋合成 UI）が食い違った（2026-09-07・裁定154 で 5 行を「新要件（ホーム合成）」へ訂正）。
対応表の区分は**「その画面に描画済みか」**で付け、他画面の実装を流用できる場合は「既存（他面）」と書いて A層の外に置く。
「既存（他面）」を A層で拾ってよいのは、**新規クエリなし・既存 state／計算からの表示追加**で済む場合のみ（M9／M14／M22／M23 型）。

### 教訓59：verify org の一括掃除は seed 固定行（seed_marker）を除外述語に含める

org_id 一括 delete（`delete from audit_logs where org_id = any(verify 2値)`）は seed:f0 が置く常設マーカー（org A・action='seed_marker'＝
rls 段「ownerA audit_logs ≥1 行」の被験行）まで消す。2026-09-07 の手貼り掃除と初版 sweep がこれを落とし、**f0 2 走が rls 段で決定論的に赤**
（timeout ではない）になって検知＝**相談役側の起草ミス**。是正＝sweep の述語に `and action <> 'seed_marker'` を足し、marker 不在は FAIL で
seed:f0 再投入を促す（sweep-m）。**org_id 一括 delete は fixture 台帳（seed-f0.ts の投入一覧＝常設行）と突合してから起草する**＝
「verify org の行＝全部残骸」ではない。

### 教訓58：単調増加表の verify 残骸が f0 timeout の主因（fixture は insert だけでなく delete の追随を gate に含める）

#58 の追跡（2026-09-07）で、audit_logs が 125,012 行／151 MB・うち **99.3%（124,134 行）が NOX-VERIFY 系 org の残骸**と実測。verify スイートは
書込 RPC ごとに audit_log_write（原則6）で行を積むが、掃除は「自スイートの action／target」に限られ、累計 insert 213,483 に対し delete 89,397＝
追随していない。この表を PostgREST（authenticated・statement_timeout 8s）越しに全件スキャン（rls 147／166 行の非 owner 0 行 assert＝平均 3.1 s）・
target 削除・action+target 読取する statement が max 7.2〜8.0 s に張り付き、小型インスタンス（shared_buffers 224 MB・work_mem 2 MB・temp 94 GB）で
同時に走る無関係な RPC（set_cast_sensitive／check_time_charge_apply／check_add_line…）も 5〜7 s へ伸びて timeout する。**教訓35（単調増加表）の実証例**。
9 走中 3 赤（r2b／pb 派生／rls）は全て authenticated で RPC を呼ぶ最中。pooler モード（session 5432）や f0 の並走（完全直列）は無関係。

対処の型（裁定139）: (a) 掃除は手貼り（org_id 直書き・単一 statement）(b) 以後は **fixture の delete 追随を gate に含める**＝f0 冒頭 sweep で
verify org の残骸を 0 に戻し、5,000 行超で warn (c) 全件 select は count head へ。timeout が出た走を「再走で緑なら妥当」と扱う運用は、
残骸が閾値内であることを前提にする。★手貼りで全消しすると seed:f0 の marker も消える＝rls が決定論的に赤＝sweep-m で検知して seed:f0 再投入。

### 教訓57：他プロジェクトの guard 名を指示されたら「実測して不在を報告し停止」が正動作

料金 v8.1 ブロックで「各コミット前: verify:ui-tokens 緑」と指示されたが、NOX には同名 script も `scripts/verify-ui-tokens.ts` も無かった
（相談役が BANZEN 側の guard 名を NOX へ持ち込んだ）。CC は package.json と scripts/ を実測して**不在を報告し、代替（追加行の色リテラル手動 grep）を
明示して進めた**＝正動作。**存在しない guard を「緑」と報告しない／勝手に同名を捏造しない**。不在が判明したら別レーンで新設（→ 裁定132 案・
`verify:ui-tokens` 2026-09-07 新設）。

### 教訓56：dev 手貼りと f0 実走を並走させない

dev への mig 手貼りは **f0 完了後**に行い、f0 実行中に手貼りが要るときは**申告してから**行う。並走すると
run1 緑→run2 赤の「差分がコードに無い赤」が出て原因特定に往復が要る（0131＝for_register 検知／0132＝biz_date_of 検知／
0133＝plan_fixed 凍結形の検知で**3例目**）。逆に言えば f0 は live 変更の検知線として働いている＝止まったら「コードの
バグ」より先に「live が動いたか」を疑う（prosrc と収蔵 mig の本文照合＝113prep の drift 確認型）。

---

## 裁定122（2026-09-04）管理画面 共通UIルール v1＝全画面適用・原本が正

正本＝`mock/pages-2026-09/NOX_UI_COMMON_RULES_v1.md`（sha256 `285b6eb5…afe2c`・4,668 bytes・デザインパック v1.0 同梱）。
報酬プラン管理で確定したルールを全管理画面へ横展開する共通基準＝13節（①色の意味固定＝Gold/Brand・Blue/Primary・
Green/Success・Yellow/Warning・Red/Danger・Gray/Neutral＋アラート判定例〔変更前=Warning・未保存=Danger・「見える設定が
現行計算に反映されない」=Danger〕 ②ボタン同一コンポーネント化〔Primary 青／Secondary 中立／Danger 赤〕 ③入力欄の単位常時
表示（prefix/suffix） ④方式切替時は単位 UI も同時切替 ⑤一覧は自然言語・入力は記号表記 ⑥段階設定は固定列 ⑦罫線
⑧タブ（選択＝青 soft＋下線・折返し境界に罫線） ⑨文字サイズ（page 24–28／section 16–18／sub 14／body 13–15／label 12／
help 10–11・10px 未満原則不使用） ⑩余白 ⑪保存状態（済=Green／未保存=Red／対象外=Neutral） ⑫レスポンシブ ⑬基本原則＝
色・文字・余白・罫線・ボタンはページごとに再設計しない）。**数値は MD 原本が正**（台帳は要約・差異があれば原本優先）。
裁定120（アラート＝semantic 状態色のみ）と整合（①③④⑪が同趣旨の一般化）。

---

## 裁定124（2026-09-04）デザインパック v1.0 正本化＝色・文字・余白・操作系の正本 — トークン値更新 実装済

正本＝`docs/NOX_デザインパックv1_0_正本化台帳.md`（sha256 `b912d7c2…3560`）。出所＝Agoora v1.zip（sha `faf3cfb3…6f07`）を
相談役が正規化（料金 v8→v8.1＝色名→意味名 41箇所・中立色統一／報酬 v3→v3.1＝第3タブ文言「販売数 × 固定額」＝裁定123）。
収蔵＝`mock/pages-2026-09/` へ `nox-compensation-plan-unified-v3_1.html`（`72555ac8…08e1`・報酬プラン＝113 UI の構造・文言正本）／
`nox-master-store-settings-v3.html`（`5e4c593c…c918`・マスタ一覧＋店舗設定）／`nox-pricing-settings-unified-v8_1.html`
（`2815b0d1…9c12`・料金設定13セクション）／`NOX_UI_COMMON_RULES_v1.md`（裁定122）。★zip 内の台帳 md ファイル名は cp932 化け＝
正名 `NOX_デザインパックv1_0_正本化台帳.md` で docs/ へ収蔵（内容 sha は一致）。

裁定124（6項）: 1) 命名＝意味名が正・色名トークンは今後作らない 2) 値＝本パックの :root が正＝globals.css の該当トークンを
本値へ更新（旧値＝blue-accent v2 は下表へ退避） 3) 裁定120 の派生2本＝`--danger-bd` は新 danger から再導出
rgba(226,103,98,.28)・`--danger-ink` #e7aaa7 は据え置き 4) MD v1 は全画面適用（裁定122）・数値は MD 原本が正
5) 適用順＝113 UI（報酬 v3.1）→ 店舗設定 v3・料金 v8.1 は写像 D調査（既存機能との対応表）→ 裁定 → UI レーン
6) blue-accent v2（859f1501…）は色・操作系正本を本パックへ譲り参照用として残置（削除しない）。

**トークン値更新（2026-09-04・名前の追加削除なし・21 本）＝blue-accent v2 旧値の退避表**:

| トークン（app） | パック名 | 新値 | 旧値（blue-accent v2 期） |
|---|---|---|---|
| `--bg` | bg | #070707 | #080808 |
| `--bg2` | panel2 | #151512 | #181815 |
| `--line` | line | #302e28 | #2d2c27 |
| `--line2` | line-strong | #484339 | #3b3931 |
| `--ink` | text | #f4f1e9 | #f3f0e8 |
| `--sub` | sub（★名前一致で採用・旧はモック muted 由来） | #b8b2a8 | #99978f |
| `--brand-soft` | brand-soft | rgba(216,173,85,.10) | rgba(216,173,85,.12) |
| `--primary`／`--blue`（同値別名） | primary | #2f7fe7 | #4f9fe8 |
| `--primary-hover` | primary2（明端＝hover 相当） | #61a7ff | #68b2f0 |
| `--primary-soft` | primary-soft | rgba(47,127,231,.15) | rgba(79,159,232,.12) |
| `--success`／`--ok`（同値別名） | success | #4dc37d | #52b788 |
| `--success-soft` | success-soft | rgba(77,195,125,.11) | rgba(82,183,136,.12) |
| `--warning`／`--orange`（同値別名） | warning | #d9a43a | #d6a84b |
| `--warning-soft` | warning-soft | rgba(217,164,58,.10) | rgba(214,168,75,.12) |
| `--danger`／`--bad`（同値別名） | danger | #e26762 | #df6d69 |
| `--danger-soft` | danger-soft | rgba(226,103,98,.11) | rgba(223,109,105,.12) |
| `--danger-bd` | （裁定124-3 再導出） | rgba(226,103,98,.28) | rgba(223,109,105,.28) |

一致（更新なし）: `--card`＝panel #11110f／`--brand`,`--gold`＝brand #d8ad55／`--gold2`,`--champ`＝brand2 #f0cf82／
`--goldbg`＝brand-soft rgba(216,173,85,.1)／`--danger-ink` #e7aaa7（据え置き）。
対応トークン無し＝追加せず据え置き: field #090909・muted #7f7a71・文字6段（page 26／section 17／subsection 14／body 13／
label 12／help 11）・r 10px・row 46px・sidebar 205px（`--card2` #22221e＝旧モック panel3 も不触）。
実装追認: CC 実走（マスタ／料金設定／シフト＝console 増分ゼロ・裁定120 の在庫アラート帯が新 danger 値で表示）・f0 2連緑。
デザインパックは **v1.1**（`8098c9d`＝レジ v12.1／シフト v4.1／キャスト管理 v3.1＋台帳 v1_1）・**v1.2**（最終ラウンド4面＝日報・月報・売掛／
ホーム／分析／お知らせ・通知 v2.1＋台帳 v1_2・zip `5748901c…020c`）へ改版（10ページで管理画面デザインは一旦完結・2026-09-04 Agoora）。
写像 D調査＝`docs/dp/dp_v1_写像対応表_v1.md`（6面→10面へ追補）。

---

## 裁定 C③-1〜12（Agoora 承認 2026-09-10・設計書 draft `NOX_C3_解除型統一_設計書_v1_draft_20260910.md` §0）

出典＝C層③ 着手前調査（`docs/tmp/c3_survey_20260910.md` §6 の 12 点）に相談役訂正 2 点（7＝重複 cast は拒否・8＝全 line が A 群のときだけ可）を反映。

| 裁定 | 内容 |
|---|---|
| **C③-1** | 日報の解除は daily_reports に列追加（reopened_at／by／reason・reclosed_at／by）。「行の存在＝締め済み」は維持。解除中＝reopened_at not null and reclosed_at is null |
| **C③-2** | 締め済み営業日への伝票書込は check_* の書込 RPC が `day closed` で raise。解除中のみ通す。flag off の時は関所を評価しない（現行どおり） |
| **C③-3** | 再締め＝既存 daily_report_reclose を「解除中のみ・reclosed_at／by 記録・冪等キー」へ改修（名前維持） |
| **C③-4** | 現金差異承認＝daily_reports に diff_reason／diff_approved_by／diff_approved_at＋RPC cash_diff_approve（reason 必須） |
| **C③-5** | payroll_reopen に p_reason 必須・route の authz を can_reopen へ・flag ゲート（service 経路は維持） |
| **C③-6** | check_merge は open 同士・payments／receivables なしのみ |
| **C③-7** | 重複 cast（両伝票に同一 cast の nomination）は拒否 `merge_conflict:cast`。合算は第 2 期 |
| **C③-8** | pay_group は両伝票の全 line が A 群の時だけ可。それ以外 `merge_conflict:pay_group` |
| **C③-9** | audit action は既存名維持＋新規 3（report_reopen／cash_diff_approve／check_merge）。横断 §3 の 10 種表を実名へ訂正（perm_change→set_staff_perms 等） |
| **C③-10** | flag off の raise は `feature_disabled:reopen_flow` |
| **C③-11** | memberships に can_close／can_reopen（boolean not null default false）＋set_staff_perms を 6 引数へ（#63 同梱）。daily_report_close／cash_diff_approve は staff∧can_close 可。report_reopen／payroll_reopen は owner／manager＋staff∧can_reopen |
| **C③-12** | D45（入金方法別照合）は本書対象外＝別 mig |
| **C③-13** | payroll_reopen は 5 引数版（末尾 p_reason・default なし）を新設し 4 引数版を drop。route と呼出を同時改修（2026-09-10 追加） |
| **C③-14** | 理由は新規 4 RPC 本文で `length(trim(p_reason)) between 1 and 200` を判定（違反 `reason_required`）。新列には同値の CHECK。check_void は触らない |
| **C③-15** | 関所 `assert_day_open` は課金ゲート内蔵の書込 RPC **16 本全部**（§8-1 実名）に 1 行。伝票行のない check_open は `biz_date_of(p_store_id, now())` で判定。**追記（2026-09-10・mig0141）**: check_open の実引数は p_seat_id（p_store_id は無い）ため店の出所は **`v_seat.store_id`（seats join stores の select 後）**＝関所行は `if v_seat.id is null … forbidden` の**直後**に `assert_day_open(v_seat.store_id, biz_date_of(v_seat.store_id, now()))`。0140 はゲート行直後に未宣言の v_store で書いており開卓が全件エラー（教訓68）→ 0141 で補正 |
| **C③-16** | merged は「void を除外する述語」の全箇所に併記（app: collect.ts 1・SQL 集計: §8-2 実測 0）。stock 戻しトリガは void 限定のまま（line は into へ移る） |
| **C③-17** | route authz は `decideReopenAccess(role, can_reopen)` 新設（owner／manager／staff∧can_reopen）。decideTaxReportAccess は不触 |
| **C③-18** | cash_diff_approve は counted_cash null で `not_counted`（実査前は承認不可） |
| **C③-19** | 冪等キー列は 2 本（daily_reports.reclose_idem_key・checks.merge_idem_key）。再締めで diff が動いた（`v_diff is distinct from 前値`）ら diff_reason／diff_approved_by／diff_approved_at を null に戻す（承認は差異の値に紐づく）。report_reopen は reclosed_*／reclose_idem_key を null に戻す（2026-09-10 追加・mig0138 実装どおり） |
| **C③-20** | check_merge は from の自動時間料金行（time_auto＝set／vip_charge／extension）を **`time_auto=false・block_no=null` の手動行へ変換してから** into へ移す（部分 unique `check_lines_one_time_auto (check_id, fee_kind, block_no) where time_auto` との衝突回避＝時間料金のある店では 2 卓とも ('set',0) を持つ）。金額は凍結値のまま into の合計に残る（from 卓ぶんの実額＝二重計上ではない）。into 側の check_time_charge_apply／check_set_people／check_line_set_group は time_auto 行のみを対象にし check_recalc は time_auto を見ないため、変換行は不変のまま再計算に耐える。mig0142・教訓69（2026-09-10 追加） |

理由必須の統一: 解除（report_reopen／payroll_reopen）・承認（cash_diff_approve）・合算（check_merge）は p_reason not null・1〜200 字（C③-14）。C③-13〜18 は draft §8 実測（`c4e59b5`）の食い違い 10 点を確定したもの＝設計書 v1（2026-09-10・`NOX_C3_解除型統一_設計書_v1_20260910.md`）。次＝live 再 dump → mig0138（相談役）→ 手貼り → suite 逆張り → UI（Fable）。

## 裁定 B5-1〜8（Agoora 承認 2026-09-10・設計書 `NOX_設計書_B5給与_v1_2026-09-10.md` §2 逐語）

出典＝B5 着手前調査（2026-09-10 14:42 JST・`docs/tmp/b5_dump.sql`・調査 1〜8）と相談役引き継ぎ v29。B5＝裁定125 ローンチ範囲 B層 5/6・B3／B4 と同型（A層の面を店舗運用に乗せる）・C層③ 解除型（payroll_reopen p_reason・reopen_flow）に乗る。**mig なし**（client＋route＋suite＋docs のみ・§7 固定手順は不発動）。

| 裁定 | 内容 |
|---|---|
| **B5-1** | 境界=§1 |
| **B5-2** | 粒度=store×period の run 単位。cast 単位 UI なし |
| **B5-3** | 入口=月次一覧新設（page.tsx 起点）。B4 部品を写す |
| **B5-4** | flag 新設なし。確定/解除は reopen_flow 共用 |
| **B5-5** | 給与は owner/manager のみ。route decideReopenAccess の staff∧can_reopen 分岐を削除し page と揃える（#71 解消） |
| **B5-6** | payroll_mark_paid の route＋UI を含める（owner 限定・状態遷移のみ・#73 解消） |
| **B5-7** | 確定/解除/支払の idem_key は run ごと randomUUID。連打ガードは client pending。DB unique は足さない |
| **B5-8** | 一覧行整形は純関数化→verify:nox-payroll-list（走数外）。RLS スコープ/run 単位/CSV 活性は nox-payroll 9段目へ追加 |

境界（§1）＝含む: 月次一覧（店舗×期間＝payroll_runs 1 行を 1 行で）・既存 payroll-board への遷移／確定・解除・支払済み化の導線（run 単位）／D3 CSV の導線（storeId＋period → run 解決 → 既存 buildPayrollCsv）／変更履歴列（audit_logs action in payroll_finalize／payroll_reopen／payroll_mark_paid・owner 限定）。含まない: 金額計算・再計算（表示は payslips 凍結値の集計のみ・golden 6 値不変）／cast 単位の確定・解除（D1 送り）／支払調書 CSV（裁定178 税務凍結）・明細 PDF（D2）／新 feature_flag・新 RPC・列 CHECK 追加（#72 は観察）。起票＝#71（B5-5 で解消）・#72 観察・#73（B5-6 で解消）・#74 台帳注記。実装は設計書 §9 の CC ブロック（9/11 §8 push 完了後・全体で 1 本）。

## 裁定 B6-1〜10（Agoora 承認 2026-09-11・B6 分析＝裁定125 の B 層最終・着手前調査 第 1 次 2026-09-10／第 2 次 2026-09-11 `docs/tmp/b6_survey.md` を入力）

出典＝相談役ブロック 2026-09-11「B6 裁定収載＋#83」。**本文（逐語）**（B6-3 のみ前提確認 (a) 未充足のため「第 2 期送り」へ書き換え＝原文を併記）:

| 裁定 | 内容 |
|---|---|
| **B6-1** | 境界: 既存 RPC 不変・mig 0・凍結表の新設なし。凍結値は payslips と daily_reports の 2 表のみ、それ以外(checks・指名・出勤)は既存 RPC の再集計を表示。B6 は今ある数字の並べ直しと欠けている比較の追加であり、新しい集計の定義は作らない |
| **B6-2** | 権限: B5-5 踏襲。owner=全店舗トグル・manager=自店。cast 個人の報酬率が manager に見える売上貢献ランキングは現状維持(縮めも広げもしない)。新規に cast 個人の金額を出す指標は B6 に含めない(PII 弁護士ゲート待ち) |
| **B6-3** | 直近 30 日: **第 2 期送り**（2026-09-11 前提確認 (a) 未充足＝下記実測）。原文＝「RPC を足さず daily_reports の凍結値を client で 30 日分集計。日別売上が揃っていることが前提。揃っていなければ第 2 期送り」 |
| **B6-4** | 人件費式の純関数化: analytics の現行式を正として純関数に固定し、dashboard と month-report の直書きも同じ関数に付け替える(二重計算の解消を B6 の成果に含める)。list.ts の gross は CSV 定義として別名で残す。純関数に DB 非依存 suite 1 本(走数外) |
| **B6-5** | 指名 2 系統: 混ぜない。「指名(店合計)」=get_store_nom_counts、「指名(ランキング)」=nom_type 合算とラベルで分け、同じ KPI 枠に両方を出さない |
| **B6-6** | 色: 裁定120 に沿い前月比・前年同月比は Neutral。danger は実査差異のみ。増減は矢印と数値 |
| **B6-7** | 定義: 出勤=B4 の出勤実績の日数(予定ではなく実績)。集中度=按分売上の上位 3 名の占有率(%)。いずれも表の注記に定義を書く |
| **B6-8** | 語: 「商品売上(明細)」とし、セット・延長は「時間料金」として分ける(レジの語と揃える) |
| **B6-9** | 日別人件費率列: 不可。人件費は payslips の period 凍結値で日別に分けられず、日割りは再計算(B5-1 に反する)。月次のみ |
| **B6-10** | 入口とレーン: 新ページなし。/analytics の板に節を足す。client 3 本(①純関数化+suite ②比較・直近 30 日 ③指名・出勤・商品売上)・mig 0・f0 は ① の後に 1 回(3 画面に触るため) |
| **B6-11** | 比較（改訂版・Agoora 承認 2026-09-11・台帳収載 2026-09-14・**逐語**）: 「/analytics の KPI カード 5 枚それぞれの .sub 直後に差分行 1 行を置く。比較列を持つ表は作らない。差分行=「前月比（月全体）」「前年同月比」の 2 項目。各項目は当月−比較月の差分（売上・組単価=円、組数=組、率指標=pt）と変化率（%・小数 1 桁）。率指標（人件費率・目標進捗）は変化率を出さず pt 差のみ。色は var(--sub)（裁定120 の Neutral。専用トークンは作らない。.warn の --bad は使わない）。増減で赤緑・矢印・記号を付けない。比較月のデータが無い（daily_reports 0 行／paid run 無し／store_sales_targets 無し）場合、その項目は「—」。分母 0 の変化率も「—」。比較月の値は当月と同じ経路で取る（daily_reports・payroll_runs/payslips・store_sales_targets の既存の直 SELECT を比較月の period で再取得。人件費は labor-cost.ts の finalRunOf/laborRatePct を比較月で呼ぶ）。RPC は KPI 5 枚に関与しないため不触。RPC 変更・mig・凍結表の新設は無し（B6-1）。cast 個人金額の新規露出無し（B6-2）。売上カード既存の「前月同期」（.sub）は据え置き。差分行の前月比とは定義が異なる（月全体 vs 同期）ため置換しない。月間目標カードの差分行は進捗バーの後に置く。前月・前年同月の算出は既存 addMonths と同じ Date 演算を compare.ts に写す（−1／−12）。差分計算は純関数 lib/nox/analytics/compare.ts（diffOf・prevMonthOf・prevYearMonthOf）に置き、DB 非依存 suite verify:nox-compare を走数外で新設（f0 43 本目に連結）。当月の 5 値・前月同期・人件費率・ランキングは前後完全一致。ui-tokens baseline 56 不変。client 1 本（B6-10 の ②）。新ページ無し。dashboard・month-report は対象外。」 適用＝client `207b60b`（compare.ts＋KPI 差分行）＋suite `a4caf13`（verify:nox-compare 20 本・f0 43 本目） |
| **B6-12** | 指名・出勤・商品売上（改定版・Agoora 承認 2026-09-11・台帳収載 2026-09-14・**逐語**）: 「/analytics の casts ビュー先頭（売上貢献の前）に既存 .nox-kpis で小 KPI 3 枚を置く: 「指名（店合計）」=get_store_nom_counts を月初〜月末で呼び 本／場内／同伴 の 3 値をそのまま表示（ランキング行・売上貢献行の指名は足さない。B6-5）／「集中度（上位 3 名）」=既存 salesRanking の上位 3 行の按分売上 ¥ 合計 ÷ salesRankTotal を小数 1 桁 % で表示（丸め済み構成 % は足さない。総和 0 または行 0 は「—」。3 行未満は在る行の合計）／「出勤実績」=attendance の shukkin・dohan・late を店×月で数えた人日と distinct cast 数「X 人日（Y 名）」。sales ビューの売上カテゴリ節直後に「商品売上（明細）」=drink＋champ＋bottle と「時間料金（明細）」=time＋set＋extension＋vip_charge の 2 値を置き、注記 1 行「明細ベース（サ料前・丸め前）。上の売上（決済ベース）とは一致しません」を添える。既存の 5 分類ラベルは不触。出勤扱いの状態集合（shukkin・dohan・late）は cast-stats.ts の定数 PRESENT_STATUSES と純関数 presentDaysOf に集約し、analytics と dashboard の直書き 2 箇所を置換する（前後完全一致）。純関数は lib/nox/analytics/cast-stats.ts（top3ShareOf・presentDaysOf・productTimeOf・nomStoreOf）に置き、DB 非依存 suite verify:nox-cast-stats を走数外で新設（f0 44 本目に連結）。新規読取は attendance の店×期間 直 SELECT 1 本のみ。RPC 変更・mig・凍結表の新設は無し（B6-1）。cast 個人の金額・順位の新規露出無し（B6-2）。差分行は付けない。色は既存 KPI と同じ。client 1 本（B6-10 の ③）。新ページ無し。month-report は対象外。」 適用＝client `f59dcda`＋suite `fbcb15e`（初版・集中度は丸め済み % の和＝99.9%）→改定追随 `2bb9cd6`／`2296319`（¥ ベース＝100.0%・verify:nox-cast-stats 14 本・f0 44 本目） |

**対象外（4 件・逐語）**: 販売実績の器(第 2 期)・PII ゲート待ち・RPC 変更が要る顧客系 5 行・時点再現不可の A56。

前提確認（2026-09-11・読取のみ・BANZEN ゲート中＝verify／f0 なし・proof orgs=3）: **(a) daily_reports の日別凍結**＝列は cash／card_gross／card_tax／uri／other／drink_sales／dohan_checks／slips／guests／expense／cash_payout／cash_float／counted_cash／diff／ar_collected＋closed_at／reclosed_at／reopened_at（biz_date 単位・締め時に凍結）で**器は揃っている**。ただし nox-dev の行は全期間 **5 行**（CLUB NOX 2026-09-09／09-10・NOX-VERIFY-A1 09-11／09-12・NOX-VERIFY-B1 2020-01-01）・直近 60 日 **4 行**＝欠損 56 日超で「日別売上が揃っている」前提を満たさない→ B6-3 は第 2 期送り（日次締めが 30 日分蓄積した時点で裁定により復帰可＝器の変更は不要）。**(b) payroll_runs の store×period unique**＝live pg_indexes に `payroll_runs_store_period_uidx UNIQUE (store_id, period)` が実在（mig0016:137 の 2 行書き。pg_constraint 側に unique はなく index 方式）＝#83 は観察・クローズ可。②の直近 30 日を除いた B6-10 のレーンは client 3 本のまま（②＝比較のみ）。実装は BANZEN 終了後に①から。

**B6-4 実装（2026-09-11・client **`3254919`**・Agoora 目視 OK 同日・B6-10 ①）**: 対象は **analytics・month-report の 2 画面**（dashboard は人件費を出さない＝式なし・対象外）。純関数 `lib/nox/payroll/labor-cost.ts`（finalRunOf／slipGross／laborCostOf／laborRatePct／castLaborRatePct・DB 非依存）に analytics の現行式を固定し、analytics-board（合計・state・cast 別 Map・KPI 人件費率・ランキング報酬率・CSV 列）と month-report（合計・state・率）を同関数へ付け替え。**月報の人件費率は整数 %（Math.round(x*100)）→小数 1 桁 %（Math.round(x*1000)/10）へ変更**（Agoora 判断・桁数引数は持たせない）。month-report の payslips select に cast_id を足しただけで RLS・行数は不変。list.ts の gross（CSV 定義）は不触。suite＝verify:nox-labor-cost **13 本**（走数外・f0 **42 本目**へ連結）。表示値一致（DEMO CLUB NOX・pg 直結読取）＝2026-07 人件費 276,145・KPI 率 null（日報 0 行）・ランキング 6 行同値／2026-09 人件費 234,647・KPI 率 67.3・ランキング 5 行同値・月報率 67→67.3。tsc／lint／ui-tokens 56 緑。

設計書＝`docs/NOX_設計書_B6分析_v1_2026-09-11.md`（2026-09-14 収蔵・Downloads から・sha256 b1753bc0445d381d505dfddfa203209d72938080c11624a44f3aec3560dc15ab・12,161 B・§4 に「final 無し → null（state の draft／none は laborCostOf 側）」を含むことを grep で確認）。B6 ①②③（B6-4／B6-11／B6-12）の実装対照は同書 §4。

## 裁定237（Agoora 承認 2026-09-10）締切ロックの client 算出（deadlines 表から RPC と同式）は許容＝式の二重管理は #68 で解消

出典＝相談役ブロック（2026-09-10）。staff_shift_deadline_at は内部専用（0136）で client から呼べないため、面 b／c は staff_shift_deadlines を select し「対象営業日 − days_before の deadline_hm（JST）・行なし＝3 日前 21:00」を同式で算出している。書込側の判定は RPC（staff_wish_set）が正＝client は表示のロックのみ。同じ式を 2 箇所で持つ状態は #68（関数を authenticated へ公開→client 算出撤去）で解消する。

## 裁定238（Agoora 承認 2026-09-10）リンク階層＝押せる要素の 3 分類（提案中 → 承認）

出典＝相談役 v29「238 提案中（ボタン階層）」→ 相談役ブロック 2026-09-10「裁定238 リンク階層 棚卸し」で本文を収載し承認。**本文（逐語）**:

「押せる要素を 3 分類に固定する。(1) 青塗り・白字＝その場で実行するボタン（現状維持）。(2) 白枠・透明地＝補助動作（現状維持）。(3) リンク＝青文字＋下線・枠なし・塗りなし＝別画面へ遷移するもの全部。青文字＋下線は遷移以外に使わない。トークン値・クラス値は変えず、link 用クラス 1 つを追加（青は既存トークン参照）。」

実施＝棚卸し（`docs/238_inventory.md`＝tmp から収蔵・2026-09-10 実装レーンで確定分類列を追加）→ 判定保留の裁定（238-a〜g）→ CC 1 レーン（client のみ・ui-tokens baseline 不変）。教訓70（提案に番号を振る時点で台帳に本文を残す）は CLAUDE.md へ。

**裁定 238-a〜g（Agoora 承認 2026-09-10・逐語）**

| 裁定 | 内容 |
|---|---|
| **238-a** | タブ・選択・並べ替え・トグルは (4) 切替＝現状維持、青文字下線にしない |
| **238-b** | モーダル・パネルを開くは (1) または (2)、付け替えなし |
| **238-c** | 印刷・URL コピーは (2) |
| **238-d** | グローバルナビは対象外、billing「ご契約の手続きへ」のみ (3) |
| **238-e** | カード全体 Link 2 件は下線化せず見出し末尾「›」を --primary 色に（無ければ追加）、枠は現状 |
| **238-f** | 文字 --primary・hover --primary-hover、--primary-hover 直書きは --primary へ |
| **238-g** | globals.css .nox-link 1 つ＋theme.ts link: CSSProperties 1 つ、同一トークン参照 |

実装（2026-09-10・client コミット）: .nox-link（globals.css・.nox-btn 群の直後）＋theme.link。付け替え 25 件（analytics 2・casts 4・customers 1・customer-detail 2・dashboard 3・cast-comp page 2・cast-register-panel 1・pricing 3・payroll 1・report 2・shift 1・mine 2・billing-banner 1）。カード型は 238-e を 3 件に適用（dashboard quicktile・master fcard＋**master/cast-comp のカード Link**＝棚卸しで inline style 扱いだったがカード全体が Link のため同型）。master-subnav のタブ（Link だが画面内タブ帯）は 238-a により現状維持＝対象外。URL コピーは 238-c により (2) 据え置き。ブロック指定の「28 件」との差＝URL コピー（c）・cast-comp カード（e）・master-subnav（a）の 3 件。
## 裁定239（Agoora 承認 2026-09-10）実行ボタンの青塗り＝(1) の見た目を --primary へ

出典＝相談役ブロック 2026-09-10「裁定239 実行ボタン青塗り 実装」（v30 §10）。裁定238 の 3 分類のうち (1) 実行の見た目を定める。**本文（逐語）**:

1. (1) 実行ボタン=背景 var(--primary)・文字 #fff・hover var(--primary-hover)。定義 2 箇所(globals.css .nox-btn.gold・theme.ts btnGold)を青へ。クラス名・変数名は据え置き
2. (2) 補助=白枠・透明地、Danger=red 枠、(3) リンク=青文字下線(238)、(4) 切替=いずれも現状維持
3. gold は見出しラベル・状態バッジ・ブランド要素に残し、ボタンからは外す
4. 選択中タブ・seg の青塗りと実行ボタンの青塗りは同色で可(タブは帯・ボタンは角丸単体で区別)
5. トークン値は変えない(--primary 既存)。ui-tokens baseline 不変想定・動いたら停止
6. kiosk の実行ボタンも同じ青、gold を残す画面はなし
7. レーン: client 1 本・suite なし・f0 不要

実装（2026-09-10・client コミット **217bb13**・目視待ち）: .nox-btn.gold＝background／border var(--primary)・color #fff・影なし・hover var(--primary-hover)。theme.btnGold＝同値（inline のため hover なし）。gold 直書きの実行ボタンは 1 件（/mine シフト「確認する」＝goldface2 地→btnGold 経由・寸法据え置き）。棚卸し (1) 145 件のうち theme（btnDark／btnGold／btnPrimaryLg・136 件）と .nox-btn.gold 経由は定義差替えで一括、gold 直書き 5 件のうち 4 件（notices の対象フィルタ・shift の日付セレクタ・staff-shift の ◯／× パターン・cast-picker）は aria-pressed／選択の切替＝(4)＝239-4 で現状維持（棚卸しの機械判定が (1) に寄せていた分）。kiosk（/kiosk・/kiosk-register）は t.btnGold 経由＝定義差替えで同じ青（239-6）。ui-tokens baseline 56 不変（#fff は globals.css／lib＝走査外・TSX 側はトークン参照のみ）。

## 裁定240（Agoora 承認 2026-09-10・本文は 2026-09-14 追認）ボタンは行の中央に配置する

出典＝相談役ブロック 2026-09-10 で承認されたが台帳未収載のまま 244（追補）と 245 が積まれたため、2026-09-14 に実装（HEAD 4a7f201 の .nox-actions／theme.actionsRow）と 244 本文・docs/240_inventory.md から起こして追認収載した。承認時の逐語ではない。**本文（逐語）**:

ボタンは行の中央に配置する（節・表・フォーム直下のボタン、ダイアログの確定／キャンセル）。例外＝表の行内の操作列・ヘッダ右上のログアウト／印刷・リンクと切替・kiosk の下部固定ボタン。実装は共通ラッパ .nox-actions／theme.actionsRow。

注記: 244 で例外確定・(a)(b)(c) 適用済み 2026-09-11・付け替え 54 行＋CSS 1 行・docs/240_inventory.md 参照。

## 裁定241（Agoora 承認 2026-09-11・例外）他プロジェクトの verify が終日稼働の日は、結果同一の 2 走を本日限り 2 連緑と認める

出典＝相談役ブロック 2026-09-11「裁定241・例外」。**本文（逐語）**: 「本日は他プロジェクトの verify が終日稼働のため清浄な窓が取れない。run1・run2(41/41・3,765・golden 不変・結果同一)を本日限り 2連緑と認める。根拠: 並走の害は偽赤・タイムアウト側で偽緑は生じない。恒久注意 17 は維持(例外は裁定で明示した場合のみ)。」

適用＝2026-09-11 の f0 run1（10:09〜10:24・923s）と run2（10:30〜10:46・993s）。いずれも 41 段 ALL PASS・3,765・golden 6 値不変・段別 assertion 数も同一。run1 は 32 段目以降、run2 は 10:34:23 以降で makanai-shift の run-all-verifies が並走（watcher 28 サンプル中 25 で検知）。この 2 走を pin（41 本 3,765）の根拠とし、push を行う。**例外は本裁定で明示した本日分のみ**＝以後は恒久注意 17（並走した run は走数消費のみ・他プロジェクトの verify は止めず終了を待つ）どおり。

## 裁定242（Agoora 承認 2026-09-11）補助ボタン青枠化＝238-(2) 改定

出典＝相談役ブロック 2026-09-11「裁定242＋#82・client 1 本」。**本文（逐語）**:

裁定242(補助ボタン青枠化・238-(2) 改定・Agoora 承認 2026-09-11)
背景: 239 で実行=青塗り、238 でリンク=青文字下線としたが、補助が白枠のままでは「青=押せる」が補助ボタンだけ揃わない。押せるものは基本青で統一する。
(1) 補助ボタン=枠 var(--primary)・文字 var(--primary)・地は透明。hover は枠・文字とも var(--primary-hover)、地は薄い青(--primary の 10% 程度。トークン追加なし・color-mix か既存の透過値)。定義箇所(globals.css .nox-btn.ghost・theme.ts btnGhost)を差し替え、クラス名・変数名は据え置き
(2) 対象=印刷・URL コピー・モーダルを開く・合算・←フロア・再読込・表示する・報酬明細を読み込む・+会計を分ける など inventory の (2) 244 件
(3) CSV 出力は全画面で「補助」に統一=青枠。明細の「給与明細CSVを出力」は青塗り→青枠へ付け替え(一覧の CSV と同形)
(4) 実行=青塗り・白字(239)、リンク=青文字下線(238)、Danger=red 枠、切替=現状維持。いずれも不変
(5) disabled の補助=枠・文字とも既存 muted 色、地は透明
(6) ヘッダ右上のログアウトも補助=青枠。kiosk の補助も同じ。gold 枠は選択中切替(全ランク等)にのみ残る(切替は不触)
(7) トークン値は変えない。ui-tokens baseline 不変想定・動いたら停止
(8) レーン: client 1 本(定義 2 箇所+直書き白枠の付け替え+明細 CSV 1 件)・suite なし・f0 不要。目視 NG は client 1 本で追随

棚卸し（2026-09-11・実装前）: 定義 2 箇所＝globals.css `.nox-btn.ghost`／theme.ts `btnGhost`（btnGhostLg は継承）。直書き白枠の付け替え＝simulator-panel のローカル `btnSm` 1 件（transparent＋`--line2` 枠＋`--ink` 字＝補助の直書き）。非該当（不触）＝staff-shift-manage の希望行ボタン 1 件（`className="nox-crow"` の行型・配置導線）と CSS の切替・戻る系 6 セレクタ（`.nox-formmodal-x`／`.nox-subnav2 button`／`.nox-backlink`／`.nox-backbtn`／1702 行のピル型／`.nox-ordbtn`＝既に hover 青）。(6) のヘッダ右上ログアウトは `className="nox-btn"`（基底のみ・白枠）＝`ghost` クラス付与で補助へ。kiosk のログアウトは `t.btnGhost` 経由＝定義差替えで一括。経由件数の実測（app／components の `btnGhost` 参照＝121＋`btnGhostLg` 8）＝129（本文 (2) の 244 とは集計基準が異なる＝報告のみ・本文は逐語のまま）。

実装（2026-09-11・docs `5619695`・client **`226acae`**・Agoora 目視 OK 同日）: 定義 2 箇所＝`.nox-btn.ghost`（枠／字 var(--primary)・透明地・hover 枠／字 var(--primary-hover)＋地 color-mix(in srgb, var(--primary) 10%, transparent)・disabled 枠 var(--line2)／字 var(--sub)／透明地）と `btnGhost`（同値・inline のため hover／disabled なし＝呼び出し側の opacity 据え置き）。付け替え＝simulator-panel `btnSm` 1 件（青枠・青字）＋ヘッダ右上ログアウトに `ghost` 付与（242-(6)）＋明細「給与明細CSVを出力」を btnGold→btnGhost（242-(3)）。非該当 7 件は不触。tsc／lint 緑・ui-tokens 新規ヒット 0（baseline 56 不変）。globals.css は作業ツリー CRLF のまま行末を吸収して当て、差分は ghost ブロックのみ。

## 裁定243（Agoora 承認 2026-09-11）恒久注意 17 を廃止＝他プロジェクトの verify との並走は可・並走下の緑は有効

出典＝相談役ブロック 2026-09-11「裁定243 収載＋f0→push」。**本文（逐語）**: 「恒久注意 17 を廃止。恒久注意 10 は『同じ DB を触る verify を並走させない』に限定。他プロジェクトの verify との並走は可・並走下の緑は有効・赤がタイムアウト由来なら走数消費のみで再走可(段名で判定)。根拠: 9/11 実測 run1/2 並走 923/993s vs 単独 458/595s、いずれも 41/41・3,765 で結果同一=負荷は失敗方向にのみ効く。裁定200 の 3値は『NOX の DB を触る別プロセス』の検出に読み替え、他プロジェクトのローカルプロセス数は判定から外す。」

適用＝恒久注意 10 は限定・17 は廃止（下記 §恒久注意の各行に注記）。裁定200 チェックの 3 値＝(1) pg_stat_activity の NOX DB 直結クライアント (2) 直近 60 秒の audit_logs (3) ローカルの **NOX** verify プロセス。他プロジェクト（makanai-shift 等）のローカルプロセスは数えない。裁定241（9/11 の例外）は本裁定で一般化＝以後は例外採番不要。

追補（Agoora 承認 2026-09-17・逐語）: 「裁定243 追補: タイムアウト型の判定は段名ではなく「statement timeout の文言＋DB が直後に応答」で行う。243 の段名 3 つは例示であって閉じたリストではない。初例＝9/17 run2 の anon-guard 段（loadAdvances）。」実例＝2026-09-17 12:54 の run2 が verify:nox-anon-guard 段の drinkOf→collectPeriod→loadAdvances で「canceling statement due to statement timeout」・直後の DB 応答 145ms（advances 0 行）＝タイムアウト型と判定して再走（12:59 再走は緑 626s）。

## 裁定244（Agoora 承認 2026-09-11）240 追補＝例外の追加・並び順・実装形（.nox-actions／actionsRow）・レーン (a)(b)(c)

出典＝相談役 2026-09-11 受領（台帳収載 2026-09-14）。**本文（逐語）**: 「240 の例外に追加: 月送り「‹／›／今日」＝切替／register の会計操作バー（← フロア・−・＋・延長 等の並び）＝固定バー／一覧の選択タイル＝切替／入力と同行のインライン・文中のインライン＝対象外／文言＋ボタンの左右分割（notices・simulator）＝例外／横幅いっぱいのボタン＝据え置き（幅は変えない）。並び順: 同じ行に複数あるとき 実行（青塗り）を右端・補助（青枠）をその左・Danger を左端。ダイアログはキャンセル左・確定右。3 個以上は flex-wrap で折返し各段中央。モバイル専用 @media は置かない。実装形: globals.css に .nox-actions（display flex・justify-content center・gap 既存値・flex-wrap wrap）を .nox-btn.ghost:disabled 直後、theme.ts に actionsRow を btnGhostLg 直後。inline style の justifyContent flex-end／marginLeft auto は対象行のみ外してラッパへ置換。.nox-formmodal-foot は justify-content center を 1 行追加（sticky は不変）。新トークン 0・ui-tokens baseline 56 不変。レーン: (a) 定義 2 箇所＋ダイアログ脚 64 → (b) /shift・/master・/register・/casts → (c) 残り。各 client 1 本。suite は作らず docs/240_inventory.md を収蔵して目視で守る。」

適用＝(a) client `002c6fc`（globals.css .nox-actions＋.nox-formmodal-foot justify center 1 行・theme.ts actionsRow・ダイアログ脚は走査 64 行→ソース照合で実対象 28 行）→ (b) client `4bd3342`（/shift・/master・/register・/casts の節直下 15 行・入替 4）→ (c) client `4a7f201`（残り全画面＋共通部品 11 行・入替 4）＝**付け替え 54 行＋CSS 1 行**。棚卸し＝docs/240_inventory.md（`59f6e64`・走査器の疑義は本裁定で確定）・レーン内訳＝docs/tmp/240_lane_{a,b,c}.md（未追跡）。新トークン 0・ui-tokens 56・tsc／lint 緑（各 client）。目視は Agoora 持ち越し。

## 裁定245（Agoora 承認 2026-09-11）B4 追補＝キャスト確認の任意化・承認待ち行の「確定」・一括確定の 62 件分割・shift-add-form の「不足 n」

出典＝相談役 2026-09-11 受領（台帳収載 2026-09-14）。**本文（逐語・245-1〜7）**: 「245-1 キャスト確認は店舗設定 settings_json.shift_cast_confirm（boolean・既定 false）。setter は店舗設定 setter mig（小・set_store_profile 群と統合）に同梱し本裁定の client には含めない。client は settings_json を select で読み、キー無しは false。false: 「確認へ」「n 件まとめて」を非表示・段階表示は 申請→承認→確定 の 3 段・承認待ちの proposed 行のバッジは「承認済み（未確定）」。true: 現状どおり（4 段・確認へ・キャスト確認待ち）。245-2 承認待ちの操作列に「確定」（青塗り・実行）を追加。planned／proposed とも shift_confirm_bulk([id]) を 1 件で呼ぶ。操作列は 244 の例外＝配置不変。245-3 一括確定は client で 62 件ずつ分割して shift_confirm_bulk を順に呼ぶ。事前の 62 件超ブロックは撤去。途中失敗は「n／m 件確定・残りは再試行」で停止し、確定済み分は戻さない。245-4 本人確認と店側確定を区別する列は第 2 期送り（audit_logs の actor で足りる）。245-5 差し戻し／時間調整は現状維持。245-6 shift-add-form に本体の staffing_needs と日別配置数を props で渡し、日セルに「不足 n」（required−assigned>0 の日のみ・色は本体カレンダーの不足表示と同じトークン・新トークン 0）。このキャストを選択中の日は n−1 で表示（0 は「充足」）。一括ボタンに「不足日を全部選択」を追加（出勤不可・登録済みの日は除く）。245-7 DEMO の 108 件は残す（目視で 行確定 1 件＋一括 107 件の 2 分割を実行して確認する）。純関数 lib/nox/shift/gap.ts（gapOf(required, assigned, selected) → number|null・chunkOf(ids, 62) → ids[][]）＋ DB 非依存 suite verify:nox-shift-gap（走数外・f0 46 本目）。client 1 本。」

適用＝client `c0b96da`（245-1／2／3／5／6・mig 0・RPC 不触・shift/page.tsx が settings_json.shift_cast_confirm を castConfirm prop で渡す＝dev はキー無し→false）＋suite `b4be1ab`（lib/nox/shift/gap.ts＝gapOf／chunkOf・verify:nox-shift-gap 12 本・走数外・f0 では現在 **45 本目**＝d45 suite が入れば 46 本目）。setter（shift_cast_confirm の書込）は店舗設定 setter mig（小）待ち。245-7 の目視（DEMO 2026-09 の 108 件＝行確定 1 件＋一括 107 件＝62＋45 の 2 分割）は Agoora 持ち越し。

## 裁定246（Agoora 承認 2026-09-11）NOX のデプロイ環境

出典＝相談役ブロック 2026-09-11（台帳収載 2026-09-14）。**本文（逐語）**: 「裁定246 NOX のデプロイ環境（Agoora 承認 2026-09-11）
Vercel プロジェクト 1 本（agoora projects／Hobby・repo abetomoo-pixel/nox・本番ドメイン nox-kappa-eight.vercel.app）。main=production・他ブランチ=preview（目視専用）。DB は NOX dev Supabase のまま＝「オンラインで見られる dev」。本番 DB への切替・本番 env・Pro 移行は別裁定。env は NEXT_PUBLIC_SUPABASE_URL／NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY／SUPABASE_SECRET_KEY／CRON_SECRET の 4 本（Production and Preview）。SUPABASE_DB_URL・SEED_PASSWORD は置かない。Stripe 4 本は未設定＝billing は動かない。crons 2 本は vercel.json のまま（CRON_SECRET で保護）。push の条件（f0 2 連緑）は不変＝production は push と同時に更新される。目視は原則この URL で行う。」

## 裁定247（Agoora 承認 2026-09-11）モバイル対応の横断ルール＝244 の「モバイル専用 @media は置かない」を改定・課題 M1〜M8

出典＝相談役ブロック 2026-09-11（スマホ実機 4 枚の課題出し・台帳収載 2026-09-14）。**本文（逐語）**: 「裁定247 モバイル対応の横断ルール（Agoora 承認 2026-09-11・課題確定 M1〜M8）
244 の「モバイル専用 @media は置かない」を改定し、モバイルに限り @media を可とする。課題は M1 横スクロールで画面が左右に動く（表の実幅がページ幅を決めている・フレックス子の min-width:0 欠落が疑い）／M2「その他」メニューのドロワーが崩れる（背景・z-index・dvh）／M3 領収書 QR が小さい／M4 244 で中央化した行のボタンが段積み・文字が折返す／M5 2 ペインのモーダル（シフト追加）がスマホで機能しない／M6 日報の表の列見出しが縦に潰れる／M7 下タブと Safari ツールバーの重なり（safe-area-inset-bottom）／M8 KPI カードの列数とラベル折返し。着手順は M1・M2 を 1 レーンで直して再撮影 → M3〜M8。」

適用＝**M5 client `6b1f017`**（2026-09-18・追加便 H・Agoora 不在の仮決め＝docs/tmp/0918_pm_decisions.md #1〜3）: shift-add-form 365 の inline grid（`230px minmax(0,1fr)`・@media なし＝9/17 調査）を既存 `.nox-2col` の修飾子 `.nox-2col--side`（globals.css・900+ は 230px＋1fr・gap 12＝旧値と同じ／≤899 は既存規則の 1 列）へ置換＝スマホではキャスト選択の下に月カレンダーが積まれる。表示のみ・中身／経路／RPC 不変・新トークン 0・tsc 0・ui-tokens 新規 0・verify:nox-shift-modal 22 緑。375px 目視（dev）＝`.nox-2col--side` 1 列 307px・モーダル本文 343px・横溢れなし。文言「左でキャストを選択してください」は据え置き（1 列時は「上」＝文言は裁定待ち）。M1 第 2 レーン（`9cff22c`）は裁定251 の適用欄。台帳本文の対象特定＝docs/tmp/0918_M5.md（逐語 grep N=3）。
適用＝**M15／M18 client `ee2a3fc`**（2026-09-18・便 Q・docs/tmp/0918_M_survey.md）: M15＝`.nox-seg` を `overflow: hidden auto`（横のみ auto・iOS 慣性）＋ `> * { flex: 0 0 auto }`＝幅に収まらないタブ行を切り落とさず容器内で横スクロール（12 ファイル 35 箇所共通・収まる幅では従来と同じ描画）。M18＝`.nox-tablewrap.stickyfirst`（先頭列 sticky left・地色 --card）を feature-flags-panel の表に＝店舗列で横に伸びても行見出しが残る。表示のみ・新トークン 0・tsc 0・ui-tokens 新規 0。M20（源泉納付表）は既に inline overflowX:auto で包まれていた（K-1 の「容器なし」は誤り）＝`91e53f7` で共通容器へ統一。仮決め＝0918_pm2_decisions.md #2〜#3。

## 裁定248（Agoora 承認 2026-09-14）f0 の 1 日 6 走の上限を廃止する

出典＝相談役ブロック 2026-09-14（同日収載）。**本文（逐語）**: 「裁定248 f0 の 1 日 6 走の上限を廃止する（Agoora 承認 2026-09-14）。push の条件「f0 2 連緑」は不変。走数は報告に残す（並走・タイムアウトの判断材料）。」

## 裁定249（Agoora 承認 2026-09-14）プロジェクト間の実行優先＝NOX の f0／verify は他プロジェクトのゲートに譲らない

出典＝相談役 2026-09-14 受領（同日収載）。**本文（逐語）**: 「NOX の f0／verify は他プロジェクト（BANZEN 等）のゲートに譲らない。BANZEN 側の宣言を受けても NOX は待たず、そのまま起動する。並走下の緑は有効（裁定243）。BANZEN 側が単独実行を要する場合は BANZEN が待つ。CC 間の SendMessage では「NOX は待たない」と返す。」

適用＝裁定243（並走可・並走下の緑は有効・タイムアウト型の赤は走数消費のみで再走可）の運用側の補足。BANZEN48 等からの「ゲート起動・f0 を控えて」の宣言に対する NOX 側の返信は「NOX は待たない」の 1 文＋現在の走行状態のみ。裁定200 の 3 値は NOX DB 基準（他プロジェクトのローカルプロセスは判定から外す）のまま。

## 裁定250（Agoora 承認 2026-09-14）店舗設定 setter の統合＝set_store_profile 1 本・白名単 8 キー

出典＝相談役ブロック 2026-09-14（f0 2 連緑後の収載）。**本文（逐語）**: 「裁定250 店舗設定 setter の統合（Agoora 承認 2026-09-14）。set_store_profile(p_store_id uuid, p_patch jsonb) を 1 本新設し、白名単 8 キー（列 name／short／ext_shimei_enabled／dohan_auto_hon、settings_json の store_code／display_name／show_open_status／shift_cast_confirm）のみを書く。白名単外は bad key で拒否・型違いは bad type・patch に無いキーは不変。owner 限定＋billing_writable_of は既存 setter と同格。既存の set_store_* 11 本は不触・cast-register の付け替えもしない。以後の設定追加は白名単に 1 行足す補正 mig で済ませ、RPC 本数を増やさない。UI は /master/business-hours の先頭に『店舗情報』節と『シフト運用』節、/master/pricing の該当節の隣にトグル 2 つ。これにより N3 基本情報・N4(b) ext_shimei/dohan_auto_hon・裁定245-1 の shift_cast_confirm の 3 件が開く。」

適用＝mig0144 `00917f8`（相談役起草・dev 適用は Agoora 手貼り・適用記録は §実施記録）・正本／名簿 `7deb6c2`・suite verify:nox-store-profile 39 本 `9c78d7d`（f0 47 本目）・client `7da5fb6`（store-profile-panel＝店舗情報 4 項目 owner 限定＋シフト運用 キャスト確認・store-flag-toggle＝.nox-seg 切替（244 の例外）＋storeProfileErrJa・pricing-board の 基本料金（フォールバック）に延長指名／指名・同伴料金に同伴の本指名自動付与・ハブ desc 1 文）。目視は Agoora 持ち越し（/master/business-hours・/master/pricing）。

## 裁定251（Agoora 承認 2026-09-14）M1 横スクロール・M2 ドロワー崩れの是正（裁定247 の M1／M2）

出典＝相談役 2026-09-14 受領（調査 docs/tmp/mobile_m1_m2_survey.md を受けた裁定・同日収載）。**本文（逐語）**: 「裁定251 M1 横スクロール・M2 ドロワー崩れの是正（Agoora 承認 2026-09-14・裁定247 の M1／M2）
M1: 表は共通クラス .nox-tablewrap { overflow-x:auto; max-width:100%; -webkit-overflow-scrolling:touch } で包む。第 1 レーンは report-board の 3 表（989 プレビュー・1243 締め済み一覧・699）。潰れ型（列数が多く th が 1 文字ずつ折り返す表）は th に white-space:nowrap を併用し、包んだ上で横スクロールさせる。html／body への overflow-x:hidden は入れない（はみ出しを隠すと残りの表の発見が遅れるため）。残り 21 表と .nox-ptwrap の hidden→auto は第 2 レーン。
M2: components/ui/nav.tsx の「その他」シートを className の借用から Modal 部品（maxWidth 520・scroll）へ置き換える。既存の handle 行は二重描画を避けて削る。× ボタン（.nox-formmodal-x）と Esc を追加。/mine の「その他」も同じ部品を通す。
新トークン 0・ui-tokens baseline 56 不変。client 1 本。」

適用＝第 1 レーン client `5543d9b`（2026-09-14: report-board 3 表を `.nox-tablewrap plain` で包み 18 列表は th nowrap・nav.tsx の「その他」を Modal 520 scroll＋×＋Esc へ・/mine も同部品）。★同名クラス `.nox-tablewrap`（globals.css 1176・枠つき・7 ファイル使用）が既存だったため、既存へ max-width 100%／-webkit-overflow-scrolling touch を追加し修飾子 `.nox-tablewrap.plain`（枠・角丸・地色なし）を新設して衝突を回避（教訓79）。第 2 レーン＝docs/tmp/m1_lane2.md（21 表＋.nox-ptwrap 8 表）。調査の根拠: html／body／シェル 3 層に overflow-x のクランプなし・table 51 のうち横スクロール容器なし 24・`.nox-ptwrap` は overflow hidden（切り落とし）・「その他」シートは Modal 部品を通らず地色／padding／角丸が未適用・× と Esc なし。
適用＝**第 2 レーン client `9cff22c`**（2026-09-18・追加便 I・docs/tmp/0918_M1_lane2.md）: 第 1 レーンの `.nox-tablewrap.plain` をそのまま **20 表**へ（analytics 2・comp-sections 8＝SlideInput／PlanTab 2／AssignTab 割当表＋適用履歴／NormTab／DeductionTab／BackTab・plan-editor 1・seats 1・payment-panel 1・payroll-board 2・register 伝票グループ別残額 1・kiosk-register 2・mine/ranking 1・simulator 1）＋ `.nox-ptwrap` の overflow hidden→auto（901+ のみ・≤900 のカード積みは不変＝8 表）。**見送り 1**＝register-board 会計タブ明細表（表内 Picker のポップが容器の overflow で切れる＝裁定259 追補の 300px 据え置きと同じ扱い）。「21 表」は 9/14 の実測で本日の実数は 22（analytics コホート表が増えたが既存の overflowX:auto で包まれている＝対象外）。表示のみ・新トークン 0・tsc 0・ui-tokens 新規 0。375px 目視（dev・owner-a／cast-a1a）＝8 ページ＋/mine/ranking で body 横幅 375 のまま・描画された対象表（seats／ranking／ptwrap 2）は容器内に収まる。★verify org はデータが薄く容器から溢れる表は出なかった＝溢れの実機は Agoora（CLUB NOX・docs/tmp/0918_close_checklist.md）。★9/14 の一覧に無い容器なし表＝payment-tax-panel.tsx 99（M20 源泉納付表）を発見＝次の client 便で追補（docs/tmp/0918_M_survey.md）。

## 裁定252（Agoora 承認 2026-09-14）主要な実行ボタンは左右分割の例外から外す＝244 追補・M9 プレビュー表の nowrap

出典＝相談役 2026-09-14 受領（同日収載）。**本文（逐語）**: 「裁定252 主要な実行ボタンは左右分割の例外から外す（Agoora 承認 2026-09-14・244 追補）
見出し＋ボタンの左右分割であっても、その画面で最も重い実行ボタン（日報を締める・締め確定）は .nox-actions で中央に置く。対象は /report の日報タブ（締める・締め確定）。他の左右分割（notices・simulator 等の副次ボタン）は 244 のまま例外。
M9: /report プレビュー表（report-board 989）の th／td に white-space:nowrap を付け、.nox-tablewrap.plain 内で横スクロールさせる。長いラベルはモバイル幅で短縮（「カード手数料（日報集計用）」→「カード手数料」）。」

適用＝client `bb9743c`（締める／締め確定を独立の .nox-actions 行へ・プレビュー表に .nw 修飾子で nowrap・列見出しを『カード手数料』に短縮し注記 1 文）。関連＝裁定244（左右分割は例外）・裁定251（.nox-tablewrap.plain・プレビュー表は 991 行目に移動済み）。

【2026-09-17 遡及追記・出典 handoff v32 §5（docs/handoff/NOX_相談役引き継ぎ_2026-09-15_v32.md 72〜76 行・原文不改変）】M11〜M21 の本文は台帳に無く v32 §5 にのみあったため逐語で遡及収載する。
v32 §5（逐語）: 「| 済 | M1 横スクロール／M2 その他シート崩れ／M9 プレビュー表の縦書き／M10 主要ボタンの右寄せ |」「| 未 | M3 QR 小／M4 ボタン段積み・文字折返し(送り方式の切替が実例)／**M5 シフト追加モーダルが 2 ペインで機能しない**／M6 日報表／M7 下タブと safe-area／M8 KPI 列数／M11 register 卓ヘッダ(軽微・要再現)／M12 ヘッダ整理(ロゴ・歯車・オーナー→ログアウト)／M13 メニュー再編／M14 ノルマ白紙(再現せず・要確認)／M15 タブ行の切れ／M16 控除ルール表／M17 端末発行の 2 カラム／M18 機能フラグ表(操作列あり)／M19 analytics キャストタブ／M20 源泉納付表(操作列あり)／M21 キャスト別ノルマ表 |」「M12/M13 の線引き(9/14 合意): 下タブ=ホーム/レジ/日報/シフト/その他・その他=キャスト/スタッフ/顧客/給与/分析/領収書/在庫追加・歯車=マスタ/お知らせ/監査/ご契約/ログアウト。ヘッダ左にロゴ。」
9/17 調査の判定（docs/tmp/0917_survey2.md b・全て client のみ）: M11 未実装（要再現）／M12 未実装（nav.tsx に歯車・ロゴ・ログアウト集約の器なし）／M13 未実装（spPriority 4 本＋その他の自動振り分けのまま）／M14 未実装（要確認）／M15 未実装（.nox-subnav2 は折返し型・.nox-seg は overflow hidden＝切り落とし型・画面未特定）／M16・M18・M19・M20・M21 未実装（M1 第 2 レーンの 21 表に含む＝横スクロール容器なし）／**M17 実装済み扱い**（kiosk-device-panel は .nox-2col nox-2col--32 で 900 未満 1 列・再撮影で確認クローズ）。M1 第 2 レーン（21 表＋.nox-ptwrap 8 表）・M4（.nox-actions に @media なし）・M5（shift-add-form 365 の inline grid 230px+1fr に @media なし）も未実装。

## 裁定253（Agoora 承認 2026-09-14）実機課題 R1〜R15 の登録とレーン分け（A モーダル化／B UI 小物／C シフト導線／D 要調査／E 第 2 期）

出典＝相談役ブロック 2026-09-14（実機スクショからの課題出し R1〜R15・同日収載）。**本文（逐語）**: 「裁定253 実機課題 R1〜R15 の登録とレーン分け（Agoora 承認 2026-09-14）
A モーダル化レーン（client 1 本・mig 0）: R1 /master 席・卓の「席を追加」と「席を編集」をモーダル化／R4 /casts のキャスト編集をモーダル化（タブ構成と中身は不変・器のみ）／R5 /staff のスタッフ編集をモーダル化／R7 /customers の顧客登録・編集をモーダル化。いずれも既存 Modal 部品を通し、閉じるは ×・背景タップ・Esc。244/245 の配置ルールに従う。
B UI 小物レーン（client 1 本・mig 0）: R2 席一覧の行から表示順を変更できるようにする（指名料金ランク別と同型の ∧∨）／R3 /master 待遇プランのヘッダで plan 名が select と見出しに二重に出るのを解消（select を見出しのタイポグラフィに合わせ、右の見出しテキストを削除。バッジは残す）／R9 /shift 確定シフト下部の変更履歴を初期非表示にし見出しクリックで開閉／R10 レジ会計タブのカスタム明細・割引の金額入力に ¥ 表示を付ける（他画面と同形）／R14 /shift「スタッフ確認状況」が settings_json.shift_cast_confirm を見ておらず OFF の店でも proposed を「未確認」と表示する不整合を是正（OFF のときは「未確定 n 件」）。
C シフト導線レーン（client 1 本・mig 0）: R12 「スタッフに公開して確定」は計画期間の公開であってシフトの確定ではないためラベルを「スタッフに公開する」に改める。仮シフトタブ・シフト作成タブ・確定シフトタブに「未確定 n 件 → 確定する」の導線（承認待ちタブへ遷移）を置く。
D 要調査レーン（読取 → 裁定 → 実装）: R6 /staff のスタッフ編集の項目が名前のみで不足（メールアドレス・LINE 等。メールは auth 更新の経路、LINE は器の有無から調査）／R8 レジのボトルキープ登録が顧客・ボトルとも select 二段で件数増に耐えないため検索付きモーダルへ／R11 キャッチ入店時の紹介料＝金額は都度入力・人数単位（単価×人数）・紹介者を記録（自店＝キャスト／黒服から選択、外部＝自由入力の両方）・記録先は明細行・集計の出口は分析の節。check_lines への列追加を伴う見込み。
R16 席の並べ替えが非原子（set_seat 2 回呼びで sort_order を交換）。本番運用前に reorder RPC（1 トランザクションで 2 行更新）へ移す。mig 1 本。現状は dev の席数が少なく実害が小さいため B レーンでは client のまま通した（★2026-09-14 追記＝D レーンへ） → **解消（mig0145・裁定255・2026-09-14）**
E 第 2 期: R15 シフト画面の情報設計の見直し（「確定」の語が計画の公開・行の confirmed・確定シフトタブで別の意味に使われ、5 タブを 3 往復する導線になっている。タブ構成の畳み込みを別裁定で設計）。
着手順は A → B → C → D の調査。R13（確定シフトが 1 件しか出ない）は不具合ではなく未確定 107 件が proposed のままであることを確認済み＝課題から除外。」

適用＝A＝client `2cb3e2a`（席・キャスト・スタッフ・顧客の 4 画面をモーダル化・Modal 部品に Esc を追加）／B＝client `e0392c1`（席の ∧∨・プラン select の見出し化・変更履歴の折りたたみ・会計タブの ¥ 表示・確認状況の castConfirm 対応）／C＝client `a9fd505`（公開ボタンのラベル・トースト・3 タブに『確定する（n 件）』の導線）。D は未着手。R13 の確認根拠＝2026-09-14 読取: CLUB NOX 2026-09 の shifts は confirmed 1（9/1 じゅり）・proposed 107・9/14 の shift 系 audit 0 件・確定カレンダーは status=confirmed のみを描く（shift-board 1722〜1728）。R14 の根拠＝shift-board 1836〜1860 が castConfirm を見ずに proposed を「未確認」と数える。

【2026-09-17 遡及追記・出典 handoff v32 §6（同ファイル 78〜86 行・原文不改変）】R17〜R20 の本文は台帳に無く v32 §6 にのみあったため逐語で遡及収載する。
v32 §6（逐語・未の行）: 「| 未 | **R6** スタッフ編集の項目不足(メール変更=route+RPC・LINE は器なし)／**R11** キャッチ紹介料(金額都度入力・人数単位・紹介者を記録=自店選択と外部自由入力の両方・記録先は明細行・出口は分析の節。check_lines に列 3 + kind 'referral' + 専用 RPC + 集計 RPC)／R15 シフト画面の情報設計(第2期)／**R17** 前借り・送り実費のキャスト select／R18 ノルマのキャスト select／**R19** キャスト別ノルマをキャスト側からも設定／**R20 出退勤と送り代・罰金の連動** |」「R17/R18 は「select → picker(components/nox/picker.tsx) の一括置換」として対象を洗い出してから 1 レーンで。」
9/17 の棚: R6＝裁定267（c0fa85c）／R11＝0148 棚（裁定270-3）／R15＝設計裁定待ち（第2期・裁定270-4）／R17・R18＝裁定259（f8fdc0e）／R19＝0148 棚（cast セルフ norm RPC・裁定270-3）／R20-a・b＝裁定257（ae0e387）・R20-c＝第2期。
9/18 の棚: R11＝**0148 適用**（`8af0be5`・check_add_referral＝金額都度入力・紹介者 cast 任意（外部は null）・記録先 check_lines kind 'referral'・案 Q＝店が払う手当＝伝票合計除外・cast gross の referralTotal＝collect→pay→明細／CSV・裁定272-2＋追補 2）／R19＝**0148 適用**（set_cast_norm_self＋/mine「目標を設定」→/api/mine/norm-set・裁定272-3）＝D レーンの 0148 棚は解消。R15 は設計裁定待ちのまま。

## 裁定254（Agoora 承認 2026-09-14）汎用ピッカーとボトルキープの検索化（R8）

出典＝相談役ブロック 2026-09-14（253 D レーン調査 docs/tmp/d_lane_survey.md を受けた裁定・実装ブロックに逐語同梱・同日収載）。**本文（逐語）**: 「裁定254 汎用ピッカーとボトルキープの検索化（Agoora 承認 2026-09-14・R8）
検索欄＋一覧から 1 件選ぶ UI を汎用部品 components/nox/picker.tsx として起こす（cast-picker.tsx と同流儀・キャスト専用型に依存しない）。props は items（id・label・sublabel・avatar 任意）・value・onPick・placeholder・empty 文言。件数が多いときは入力で絞り込み、未入力時は先頭 n 件を出す。
register のボトルキープ登録を、顧客 select とボトル select の二段からモーダルへ移す。「ボトルキープを登録」ボタン → モーダル内で 顧客をピッカーで選ぶ → ボトルをピッカーで選ぶ → メモ（棚番号等・任意）→ 登録。呼ぶ RPC と引数は現行のまま。閉じるは ×・背景タップ・Esc。脚は キャンセル左・登録 右（244）。
cast-picker.tsx は今回は置き換えない（回帰を避ける。将来の統合は別レーン）。新トークン 0・ui-tokens 56 不変・mig 0・RPC 不触。」

適用＝client `6a3470d`（components/nox/picker.tsx 新設＝items／value／onPick／placeholder／empty／limit（既定 30）／dense・検索は label と sublabel の部分一致・未入力時は名前順の先頭 limit 件＋残数注記・bottle-keep-panel を「ボトルキープを登録」→Modal 520 へ＝顧客（名前・ふりがな）→ボトル（価格を副表示）→メモ→登録・bottle_keep_register の引数不変）。253 の R8 はこれで着手済み（D レーンの残り＝R6／R11／R16）。

## 裁定255（Agoora 承認 2026-09-14）席の並べ替えを原子化＝seat_reorder 新設（R16）

出典＝相談役 2026-09-14 受領（R16 調査 docs/tmp/d_lane_survey.md・live dump docs/tmp/seat_dump.txt を受けた裁定・同日収載）。**本文（逐語）**: 「裁定255 席の並べ替えを原子化（R16・Agoora 承認 2026-09-14）
seat_reorder(p_store_id uuid, p_ids uuid[]) を新設し、既存 reorder 4 本（cast_rank_reorder／pricing_rule_reorder／product_category_reorder／product_reorder）と同契約とする: org null→forbidden／billing_writable_of→billing locked／空→bad ids／重複→duplicate ids／owner は全店・manager は自店／渡した id が全て店内か（不一致→forbidden）／店の全件数と一致するか（不一致→partial ids）／update … from unnest(p_ids) with ordinality で sort_order＝1..N に再採番・updated_at＝now()／before・after を jsonb_agg で audit_log_write。
set_seat は不触（個別更新の口は残す）。seats の列・CHECK・index・RLS は不変。
client は seats-board の ∧∨ を lib/nox/ui/reorder.ts の swapAdjacent → seat_reorder に付け替え、失敗時は reorderErrJa で表示（pricing-board の moveBand と同型）。B レーンで入れた set_seat 2 回呼びは撤去。
課金正本は A6（マスタ系・product_category_reorder と同節）に登録し、対象 124→125・全数 238→239。anon-guard に probe 1 行。suite verify:nox-seat-reorder（走数外・f0 48 段目）。」

適用＝mig 手貼り 2026-09-14（ref hiqbfagmkrdpmlqhkmsu・検証 6 項目 OK・既存 reorder 4 本と set_seat の md5 不変・ゲート済み 124→125）＝`d1a5e4d`／suite verify:nox-seat-reorder（f0 48 段目・31 本）／正本 A6 14→15 本・対象 124→125・全数 238→239＝`2df543d`／client＝seats-board の ∧∨ を seat_reorder へ・set_seat 2 回呼び撤去＝`7ae283b`。前提の live 値（2026-09-14 17:52）: set_seat は 6 引数 acl {postgres,authenticated,service_role}・seats は sort_order の CHECK／UNIQUE なし・audit_log_write は 6 引数（p_reason 既定 null）・ゲート済み 124／public 関数 238。

## 裁定257（Agoora 承認 2026-09-15）R20-a 遅刻閾値の統一・R20-b 代理打刻の UI 露出（client のみ）

出典＝相談役ブロック 2026-09-15 14:18（実装ブロックに逐語同梱・同日収載・前提調査 docs/tmp/0915_survey.md／0915_survey2.md）。**本文（逐語）**:
「裁定257 R20-a(遅刻閾値の統一・client のみ)
/shift 今日タブの「遅刻・未着」は現在 閾値 0 分(開始を過ぎれば未着)で数えており、給与側 lib/nox/punch-match.ts の判定(in − start > late_grace_min・既定 10・penalty_config)と割れている。表示を penalty_config 基準に揃え、合算を 2 つに分ける: 遅刻 = in 打刻あり ∧ in − start > late_grace_min、または attendance.status='late'／未着 = 打刻なし ∧ now ≥ start + late_grace_min。判定は punch-match.ts の既存関数を呼ぶ。新規クラス・新規純関数を作らない(教訓79)。penalty_config は client から SELECT のみ。取得できない場合の既定は 10 分。表示文言は「遅刻 n 人／未着 m 人」。
裁定257 R20-b(代理打刻の UI 露出・client のみ)
punch_proxy(source='manager') は実装済み(owner 全店／manager 自店・inactive cast 拒否・audit 付き)で UI からの呼び出しが 0 件。/shift 今日タブに「退勤」を出し punch_proxy を呼ぶ。出勤(in)側は出さない。attendance の 5 択が既に機能しており二重の入口を作らない。打刻の訂正・削除 RPC は存在しないため、誤打刻の修正は本レーンに含めない(第2期)。権限は RPC 側の判定に従う。ボタンは裁定239(実行=青塗り)・裁定240(行の中央)に従う。」

適用＝client `ae0e387`（shift-board のみ＝matchPunches＋buildMatchInput を今日タブの各シフト行に適用・penalty_config.late_grace_min を SELECT・KPI「遅刻」「未着」の 2 枚・退勤ボタン＝punch_proxy 'out' を in 打刻中のみ有効で .nox-actions 中央・成功後に打刻を再読込）。着手前確認＝(a) 算出は shift-board 776〜792 (b) matchPunches({shifts, punches, attendance, config}) と buildMatchInput (c) penalty_config の client 読取は comp-sections 190 と同じ select (d) 行に .nox-actions 無し→退勤の器として追加。f0 は相談役指示待ち（suite 不触＝pin 48 本 3,925 不変の見込み）。

## 裁定258（Agoora 承認 2026-09-15）run 別調整控除・mig 0146

出典＝相談役 2026-09-15 14:5x 受領（逐語・別便）。前提調査 docs/tmp/0915_survey.md／0915_survey2.md・手貼り前控え docs/tmp/0146_pre.txt（14:10）／0146_post_pre.txt（14:50）・検証 docs/tmp/0146_post.txt（14:52）。**本文（逐語）**:
「### 裁定258（2026-09-15 承認・run 別調整控除・mig 0146）

背景: deductions は店単位（store_id のみ・cast_id なし・適用期間列なし・is_active のみ）で、
特定キャストへの随時控除を原理的に表現できない。payslips に手修正の口は無く、作らない（B5-1）。
よって調整は計算の入力側に置く。実務例＝報酬総額の 20% を引く（率）、出勤誤りでいくらか引く（定額）。

- 258-1 粒度＝run × キャスト。1 キャスト複数行可。定額行と率行の混在可
- 258-2 分母＝gross（各バック＋customTotal＋extras＋achievement＋guarantee床。
  fixedDed・fine・withholding を引く前）。率行が複数でも全て同じ gross に掛け、逐次適用しない
  ＝入力順・並べ替えで金額が動かない
- 258-3 源泉の前後は行ごとに before_withholding で選択。true＝gross から引き源泉対象額が減る
  （報酬の減額・ペナルティ）。false＝withholding の後に引く（立替回収・貸付返済）。
  既存 fixedDed は源泉の前に固定のまま不変
- 258-4 理由必須（1..200・length(trim) 判定）
- 258-5 明細表示は行ごとに show_detail。true＝理由付きで 1 行ずつ、false＝控除計に合算し理由を出さない。
  データは常に行で保持し、合算保持はしない
- 258-6 入力権限＝owner/manager（B5-5 踏襲）
- 258-7 棲み分け＝deductions は店単位・毎月自動のルール、0146 はキャスト単位・当該 run 限り。
  出勤誤りは本来 attendance を直すのが筋で、確定後に判明した分のみ調整行で引く
- 258-8 差引後マイナスを許す。0146 時点では net=0 で止め、超過額は計算して保持するが消費しない。
  繰越の消費は 0147（別裁定）
- 258-9 確定後の修正口は作らない＝reopen → 調整行を直す → 再 finalize（全件差し替え）
- 258-10 RLS は owner/manager・自店のみ（cast 本人にも非開示）。payslips_select と書式が割れるのは
  0146 が金額の入力側であって明細ではないため。キャストが見るべきは payslips に凍結された結果（控除計）
  であり、その内訳行ではない。許可列挙 auth_role() in ('owner','manager') は payroll_runs_select と同形
- 258-11 casts.is_active は検証しない。退店キャストの最終 run にこそ調整が要る
  （貸付の回収漏れ・備品の未返却・最終月の精算）。punch_proxy が inactive を拒むのは
  「退店した人を出勤させられない」ためで性格が異なる
- 配分順序は現状維持＝調整控除が先に引かれ available が減る。結果として ar/adv/okuri の回収は
  残高で翌月に回る。前借りは残高が残るだけだが、率の減額は当月の報酬定義そのものなので後ろに回さない
- 格納形＝rate_bp は整数ベーシスポイント（0..10000・20%=2000）。deductions.amount の整数 %（0..100）
  とは異なるが、基底が違う（deductions=sales・0146=gross）ため fixedDedOf は流用できず専用の除算行が
  要る。どちらでも行数は同じで bp の方が刻みが細かい。UI は %↔bp の換算を持つ
- 適用: mig 0146（2026-09-15 14:4x 手貼り・ref hiqbfagmkrdpmlqhkmsu）。
  money-core 3 本の md5 不変・検証 6 項目 ALL OK」

適用＝mig 0146 `5d9caac`（supabase/migrations/0146_payroll_adjustments.sql・sha256 b66c2c897080c843b0de8548c71e081c39b08d49f12928d876d55f4822cfd0ce・9,061 B・相談役起草→CC 静的突合 14:26（★1〜★9）→再突合 14:46（★A）→Agoora 手貼り 14:4x・ref hiqbfagmkrdpmlqhkmsu・proof orgs=3）。検証（docs/tmp/0146_post.txt・ALL OK）＝(1) 列 13・CHECK 3・index 3+pk・RLS enabled・policy 1（using 式は payroll_runs_select 同形） (2) 表 grant authenticated=SELECT のみ・anon 0／関数 2 本 authenticated=EXECUTE・anon／public なし (3) FK 5＝orgs／stores／payroll_runs ON DELETE CASCADE／casts＋created_by→users (4) 署名 add (uuid,uuid,text,integer,integer,boolean,boolean,text)→uuid・delete (uuid,text)→void・SECURITY DEFINER (5) money-core 3 本の md5＝手貼り前と同値（3021fc96…／4229f5d2…／2ecbb653…） (6) 異常系 5 件＝reason 空白のみ→'reason required'・mode 不正→'bad mode'・fixed で amount null→'bad amount'・rate_bp 10001→'bad amount'・finalized な run→'run not draft'（NOX-VERIFY-A1 の仮 run 2099-01 を 1 トランザクション内で作り owner-a の claims を emulate・最後に ROLLBACK・残留 0）＋正常 add 1 件で audit の actor=users.id・reason 保持を確認。**未着手**＝suite（verify:nox-payroll-adjustments 新設・f0 49 本目）・課金正本の追随（A 群 +2 本＝payroll_adjustment_add／_delete）・anon-guard の段追加・core.ts／pay.ts の合成（258-2／258-3／258-8・専用の ÷10000 行）・breakdown の凍結形（show_detail）・payroll-board の入力 UI（%↔bp 換算）・reopen 後の再 finalize 経路の確認＝相談役の次ブロック待ち。

## 裁定259（Agoora 承認 2026-09-15）select → picker の一括置換

出典＝相談役 2026-09-15 17:0x 受領（逐語・別便）。前提調査 docs/tmp/0915_survey.md g（select 67 箇所の全数）。**本文（逐語）**:
「### 裁定259（2026-09-15 承認・select → picker の一括置換）

対象は 10 箇所（キャスト 6・顧客 2・商品 2）。67 箇所中 57 は店舗・期間・区分・席・プラン・
ランク・カテゴリ等の短い固定リストで、select のままが正しい＝対象外。
ボトルキープの 2 箇所は裁定254 でピッカー化済み。

内訳:
  キャスト 6 = analytics 1176 / customers-board 480 / customer-detail 213 /
               comp-sections 780 / deduction-panel 195 / sensitive-tax-panel 228
  顧客 2   = reservation-panel 527 / 621
  商品 2   = mine/drink-claim-form 108 / stock-board 256（絞込）

置換先は components/nox/picker.tsx。client のみ・mig 0・RPC 不触。1 レーンで閉じる。
R17（前借り・送り実費のキャスト select）・R18（ノルマのキャスト select）は本裁定に含まれる。」

適用＝未着手（client 1 レーン・相談役の実装ブロック待ち）。

追補（Agoora 承認 2026-09-17・逐語）: 「259-a picker.tsx に onClear（×で null に戻す）と disabled の 2 props を足す。空文字が意味を持つ
  4 箇所（顧客登録の担当なし・顧客詳細の担当解除・在庫履歴の絞り込みなし・未選択許容）は
  擬似項目ではなく onClear で表現。先頭既定で空を許さない 2 箇所（sensitive-tax・deduction-panel）
  は onClear を渡さない。
259-b 行内小型の 3 箇所（analytics の label 内・sensitive-tax 見出し右・在庫履歴の行内）は
  dense で置換を試み、収まらなければ select 据え置きで対象外として報告。
259-c 新トークン 0。UI 規約 238/240/242/244。」

実装（2026-09-17）＝`f8fdc0e`（picker.tsx に onClear／disabled・置換 **8 箇所**＝キャスト 5（analytics 1176・customers-board 480・customer-detail 213・comp-sections 780＝R18・deduction-panel 195＝R17）＋顧客 2（reservation-panel 527／621・tel を sublabel）＋商品 1（mine/drink-claim-form 108）。**据え置き 2 箇所**＝sensitive-tax-panel 228（見出し右）・stock-board 256（履歴の行内）＝dense でも見出しの flex 行に一覧（最大 220px）が入り行高が約 300px に膨らむ（在庫履歴で 302px 実測）ため select のまま対象外（259-b）。analytics 1176 は label 直下の独立行のため dense で収まる。実機＝dev 3200 で 選択→反映・×→解除（analytics／customers 登録／customer-detail／norma／register 予約）・deduction の disabled（A1 一律モード）・Tab 到達・760px 横はみ出しなし。Enter 確定は自動操作で再現不可（素の button）・reservation 編集側は既存予約 0 件・/mine は open 伝票が無いと描画されず未確認。verify:ui-tokens 新規 0・tsc 0。

追補 2（2026-09-18・M-3）: レジ会計タブの明細表（register-board 2820・表内に Picker）は M1 第 2 レーン（`9cff22c`）の横スクロール容器を当てず据え置き＝**クローズ**（Picker のポップが容器の overflow で切れるため。ポータル化は第 2 期）。259-b の据え置き 2 箇所（sensitive-tax 228・stock-board 256）と同じ扱い。

## 裁定260（Agoora 承認 2026-09-15）pin の走査対象は許可列挙で書く

出典＝相談役 2026-09-15 17:0x 受領（逐語・別便）。**本文（逐語）**:
「### 裁定260（2026-09-15 承認・pin の走査対象は許可列挙で書く）

新設 RPC が既存 pin に引っかかったとき、除外リストを足して通さない。
pin が何を守っているかを許可列挙で書き直す。

根拠: 除外リストは「この 1 本を通す」という書き方で、同種の RPC を足すたびに例外が伸びる。
伸びた例外は読み返されないため、本当に守りたい対象が同じ条件で入ってきても気づけない。
許可列挙なら、新しく足したものは自動で通り抜けず、列挙に加える時点で一度考えることになる。

初例: B5 A2「cast 単位の確定／解除／支払済み化 RPC は存在しない」が mig0146 の
payroll_adjustment_add（p_cast_id あり）を拾って赤になった。除外（!/^payroll_adjustment_/）ではなく、
対象を payroll_finalize / payroll_reopen / payroll_mark_paid の 3 本に固定し、
(a) 3 本が live に実在 (b) 3 本に p_cast 系引数なし の 2 assert に書き直した（c9f6aee）。」

適用＝verify `c9f6aee`（scripts/verify-nox-payroll.ts B5 A2・212→213）。

## 裁定261（Agoora 承認 2026-09-15）課金ゲート正本の A/B はゲート行の有無で決める

出典＝相談役 2026-09-15 17:0x 受領（逐語・別便）。**本文（逐語）**:
「### 裁定261（2026-09-15 承認・課金ゲート正本の A/B はゲート行の有無で決める）

新 RPC を課金ゲート正本（docs/NOX課金ゲート対象v1.md）に追随させるとき、
A（ゲート対象）か B（除外）かは prosrc のゲート行（'billing locked'）の有無で決める。
名前の系統で判断しない。

根拠: 名前が payroll_* でも、ゲート行を持たなければ A に載せた時点で
「対象→live」assert が赤になる。区分は実装が決めるもので、命名規則ではない。

初例: mig0146 の payroll_adjustment_add / _delete を当初 A 群 +2 と読んだが、
ゲート行を持たないため正しくは B(e) payroll 系一式（給与＝過去労働の清算＝非ゲート・
payroll_run_create / payment_record_add と同列）。対象 125 不変・除外 114→116・全数 239→241（7064df9）。」

適用＝docs `7064df9`（正本 B(e) 3→5 本）・verify `c9f6aee`（billing 段47-1 除外 pin 114→116）。

## 裁定262（Agoora 承認 2026-09-15）本番 DB 切替の前提に Compute の引き上げを加える

出典＝相談役 2026-09-15 17:0x 受領（逐語・別便）。**本文（逐語）**:
「### 裁定262（2026-09-15 承認・本番 DB 切替の前提に Compute の引き上げを加える）

本番 DB への切替（別裁定）の前提条件に、Supabase Compute の引き上げを加える。
v32 §7「運用・環境」で Vercel Pro 移行と同じ棚に置く。

根拠: 2026-09-15、t4g.nano（Free）で f0 49 段・3,966 を 590s 走らせた 2 分後に
Postgres がクラッシュし、73 分間無応答になった（§DB 障害）。再起動後の run4 は 492s で
緑に通ったため nano で走行不能ではないが、ダッシュボードが「複数リソースを使い果たしている」と
警告する水準で運用している。本番データと本番トラフィックが乗る前に上げる。

必須ではなく前提条件。切替の実施時に同時に判断する。」

適用＝前提条件の登録のみ（本番切替の別裁定で判断）。障害の記録＝f0 新基準 pin（2026-09-15・49 本 3,966）の bullet（15:33〜16:46 無応答・pooler timeout→econnrefused→再起動で復帰・postmaster 16:46:22・接続 18／60）。

## 裁定264（Agoora 承認 2026-09-15）0146 client レーン＝調整控除の UI・並び・凍結形・net 0 床（全 12 項）

出典＝相談役ブロック 2026-09-15（0146 client レーン a／b／c の実装ブロックに逐語同梱・2026-09-17 収載）。**本文（逐語）**:
「裁定264（2026-09-15 承認・0146 client レーン・全 12 項）:
264-1 入力 UI＝payroll-board 右 sticky パネル（cast 選択済み・draft 限定）に「調整控除」節。
  独立 section は cast 選択の口を二重に作るため不採用。
264-2 明細の並びは計算順を写す。show_detail=true の行は before_withholding=true なら源泉の直前、
  false なら源泉の直後。同群の複数行は入力順。show_detail=false は行として出さず控除計にのみ乗る。
264-3 控除計の和を持つ 5 箇所（右パネル・CSV・board 142・board 588・ui-calc）を純関数
  totalDeductionsOf に集約してから新キーを足す（B6-4 同型・500 例で前後完全一致 assert）。
  slip は和を持たず hasDed の存在判定のみ＝対象外。5 箇所に同じ式を書き足さない。
264-5 sanction cap の基底は生 gross のまま不変。調整控除は基底を動かさない。
264-6 before_withholding=true の行は withholdingOf に渡す gross から before 群の合計を引く。
  0 未満は 0 で止める。
264-7 入力は %（小数 2 桁まで・12.5% 可）、保存は Math.round(pct*100) で bp 整数。
  0..10000 を client と route の両方で assert。表示は常に %。定額行は円をそのまま。
264-8 route は add／delete の 2 本新設。既存 payment/record を型の前例に。add に冪等キー引数が
  無いため連打ガードは client（B5-7 同型）。
264-9 確定後（draft 以外）の行は読取表示のみ・削除ボタン非表示。編集は reopen 後（258-9）。
264-10 breakdown_json に理由を凍結するのは show_detail=true の行だけ。false の行は合算額を
  adjustments_hidden 1 キーに入れ理由は凍結しない。根拠＝/mine は payslips の直 SELECT で
  breakdown_json の文字列は本人に届く。RLS は表を守るもので凍結値には及ばない。
  show_detail は「本人の明細に理由を表示する」の切替として実装する。調整なしの run はキー自体を
  入れない（従来 breakdown と完全一致）。
264-11 net 0 床は恒等式を壊さない形で置く。超過額を PayResult の adjustOverflow として明示し
  恒等式 net = gross − totalDeductionsOf(pay) + adjustOverflow を core.ts で閉じる。
  凍結は breakdown_json に数値 1 キーのみ（DB 列は作らない＝0147 が読む）。右パネルに赤注記
  「超過 ¥X は当 run で回収されません」。明細には出さない。
  追補（同日承認）: 0 床は調整控除が食い込む分に限定する＝overflow = min(調整合計, −netRaw)。
  調整行が無い run の net は従来どおり（負を含む）不変。既存の負 net の扱いは第2期。
264-12 run_create は調整行の保存時に呼ぶ（パネルを開いた時ではない）。同一 store×period の
  既存 run を status 問わず返す自然冪等なので finalize が同じ run を拾う。draft 行が月次一覧に
  出るのは副作用ではなく正しい状態。」

適用＝実装＝`dd4beaa`（(a) 純関数・pay.ts/core.ts 合成・5 箇所集約）／`7bad2a3`（(b) 右パネル・route 2 本）／`edf2d15`（(c) 明細並び・凍結形・裁定265）。f0 2連緑（run1 587s／run2 514s・49 段 4,027）で 9/17 11:19 push。mig 0（0146 打ち止めのまま）。（★2026-09-17 裁定270-3 で打ち止めを解除・0147 適用＝裁定269 の適用欄）逆テスト（(c) 4 本＝2026-09-17: a 並び順→pa(7-6)・b 隠し理由→pa(7-2)＋7-1／7-4／7-7／7b-1・c 超過キーの型→pa(7-5)＋恒等 12 本・d 空配列回帰→pa(7-3)＝各々赤→復元で 101 緑・suite 追記なし）。関連＝裁定258（mig0146・DB 側）・裁定265（削除モーダル）・裁定266（担保方法）。

## 裁定265（Agoora 承認 2026-09-15）調整行の削除理由はモーダルで入力する（window.prompt 不使用）

出典＝相談役ブロック 2026-09-15（(c) 実装ブロックに逐語同梱・2026-09-17 収載）。**本文（逐語）**:
「裁定265（2026-09-15 承認）: 調整行の削除の理由入力はモーダル（既存 .nox-formmodal）に置く。
  window.prompt は使わない（裁定238/240/242 の 4 分類に属さず、キャンセルと空文字の区別が曖昧で
  258-4 の理由必須が client 側で崩れる）。空文字・空白のみは client で弾き route の 400 に
  到達させない。shift-add-form の既存 prompt は本裁定で触らない（別件で棚上げ）。」

適用＝client `edf2d15`（(c) に同梱）。shift-add-form の prompt は据え置き（別件）。

## 裁定266（Agoora 承認 2026-09-17）264-2 の並びと 264-10 の凍結形は suite の機械 assert と /mine の HTML 直読で担保する

出典＝相談役ブロック 2026-09-17（逆テスト 4 本の実施ブロックに逐語同梱・同日収載）。前提の読取＝2026-09-17 10:4x（dev 全店舗・全 period の gross 走査＝docs/tmp/q0917_4.mts）。**本文（逐語）**:
「裁定266（2026-09-17 承認）: 264-2 の並び順と 264-10 の凍結形は、実機の finalize→reopen ループ
  ではなく suite の機械 assert と /mine の HTML 直読で担保する。根拠＝dev に源泉が出る非 paid の
  cast×period が 0 件（7 store×period・14 行を走査。CLUB NOX 2026-09 の 1 件のみ閾値超えだが
  run が paid）。fixture 新設は demo データを増やす別判断のため行わない。源泉差の数値は suite
  fixture（161,500）で担保済み。実機での並び目視は本番データが載ってから。」

適用＝担保の所在＝verify:nox-payroll-adjust (7) 節（pa(7-1)〜(7-8)・renderToStaticMarkup で PayslipSlip の行順を機械で読む）＋(7b) cast 本人の payslips 直 SELECT（HIDDEN 0 件）。逆テスト 4 本の結果は裁定264 の適用欄。実機の並び目視は本番データ搭載後の別便。

## 裁定267（Agoora 承認 2026-09-17）スタッフ編集の拡張＝配属店は既存で足りる・メール変更は admin route 1 本・LINE は対象外

出典＝相談役ブロック 2026-09-17（調査 docs/tmp/0917_survey2.md e を受けた裁定・実装ブロックに逐語同梱・同日収載）。**本文（逐語）**:
「裁定267（2026-09-17 承認・スタッフ編集の拡張）:
267-1 配属店＝追加実装なし。staff_transfer_store と「異動先」select（owner かつ複数店のときのみ
  表示）で既に足りる。単店 org に異動先は無い。
267-2 メール変更＝admin route 1 本新設（app/api/staff/update-email・mig 0）。ガードは
  kiosk/provision の guardOwner（owner のみ・manager には開かない）。lower 正規化・org 内 unique を
  public.users で先引き。auth 更新は updateUserById（email_confirm: true・確認メールなし）。
  書き順は auth.users.email → public.users.email。後者失敗時は auth を元の値に戻す補償。
  対象は staff／manager のみ。owner 自身のメールは対象外（ロックアウト防止・第2期）。
  cast のメールも対象外（別レーン）。UI はモーダルに「メール」入力＋「メールを更新」。owner にのみ表示。
  追補（同日）: GoTrue は重複メールに code 無しの 500 しか返さないため、public.users を org 条件
  なしで先引きし auth 書込前に 409 を返す（staff/create と同形・補償不要）。
267-3 LINE＝スタッフ向けは対象外。器が皆無。T3 着手時にスタッフを含めるか判断。
実装＝c0fa85c。suite verify:nox-staff-email 43（f0 50 段目）。」

適用＝`c0fa85c`（route app/api/staff/update-email＋lib/nox/staff/update-email.ts＝parseUpdateEmailBody／decideOwnerAccess／decideEmailTarget／performUpdateEmail＋staff-board「メールを更新」＋scripts/verify-nox-staff-email.ts 43 本・f0 50 段目）。逆テスト 4 本＝auth 重複写像を外す→se(5-5)・owner 自身許可→se(5-2)＋se(fin-fx)・重複許可→se(5-4)・補償を外す→se(5-9b) 各赤→復元 43 緑。実機＝dev サーバ経由（NOX-VERIFY-A・ownerA）で 401／403／403／409／400／200→auth＝public→復帰、CLUB NOX は demo-manager 403（route）・demo-staff2 は performUpdateEmail で変更→同値→復帰（CLUB NOX owner の資格情報を持たないため route 経由は未実施）。教訓89 の実例（ownerA のメール書換）は本レーンで発生。

## 裁定268（Agoora 承認 2026-09-17）/shift 今日タブの行に遅刻分数「(+N 分)」を出す（client のみ）

出典＝相談役ブロック 2026-09-17（調査 docs/tmp/0917_survey2.md f を受けた裁定・同日収載）。**本文（逐語）**:
「裁定268（2026-09-17 承認・遅刻分数の表示）: /shift 今日タブの行の打刻 HH:MM の右に確定開始との差を
  「(+N 分)」で出す。猶予 penalty_config.late_grace_min 以内は出さない。KPI の遅刻判定と同じ閾値・
  同じ算出行を使い別式を書かない。未着（打刻なし）は分数なし。punches は既に全件取得済みで新規取得
  なし＝client のみ。罰金連動は R20-c 第2期のまま。未着手。」

適用＝client `2f3377e`（2026-09-17）: lib/nox/shift/late.ts 新設（lateMinutesOf(startHm, inPunchHm, graceMin)＝猶予を超えたときだけ開始からの差（分）を返す純関数・猶予以内／ちょうど／打刻なし／開始なしは null・30 時間制の開始×24 時間表示の打刻の日跨ぎ対応）。KPI の未着判定（shift-board 826）も同関数を呼ぶ形に置換＝閾値の式は 1 箇所。行表示＝shift-board 1073〜1079（打刻 HH:MM の右に「(+N 分)」薄字・既存スコープの s.start_hm／punchIn（punchRows 由来）／lateGraceMin のみ・新規 fetch 0）。suite verify:nox-late 25（DB 不触・punch-match と同境界を assert・逆テスト＝猶予無視で 6 本赤→戻して緑）＝f0 53 段目。実機 A1（fixture＝A1a 15:00 開始・15:25 in／A1b 15:00 開始）: 旧式（stash）と新式で KPI 同一（出勤予定 2／出勤済み 0／遅刻 1／未着 1／欠勤 0）・遅刻行「15:25打刻(+25 分)」・未着行は分数なし・A1b に 15:05 in（猶予内）を足すと「15:05打刻」で分数なし・KPI 出勤済み 1／未着 0。fixture は id で削除し件数一致。前提の読取＝shift-board.tsx 764〜778（punches 読取・punchIn）・806〜828（todayCounts＝matchPunches）・1072〜1076（「HH:MM打刻」の補助表示・裁定222）。

**裁定268 追補（Agoora 承認 2026-09-17・逐語）**: 「猶予ちょうどの 1 分は punch-match の「> 猶予」に揃える。旧 KPI 826 は「≥ 猶予」で未着判定しており、閾値が 2 箇所で 1 分ずれていた。同じ関数に寄せて解消。」

## 裁定269（Agoora 承認 2026-09-17）店舗の「使う制度」設定と管理画面の出し分け（0147＝set_store_profile 白名単 +12）

出典＝相談役ブロック 2026-09-17（調査 docs/tmp/0917_survey2.md g／h を受けた裁定・同日収載）。**本文（逐語）**:
「裁定269（2026-09-17 承認・店舗の「使う制度」設定と管理画面の出し分け）:
269-1 店舗の「使う制度」9 フラグ（時給・最低保証／各種バック／売上歩合／ポイント制／売上スライド／
  ポイントスライド／ノルマ／罰金・控除／達成ボーナス）＋業態（biz_type）＋会計方式（billing_mode）
  ＋初期設定完了（setup_done）は store_profile.settings_json に置き、set_store_profile の白名単を
  補正 mig（0147）で 12 キー拡張する。feature_flags には載せない（運用トグルと報酬制度を混ぜない）。
269-2 OFF は表示と入力の口を隠すだけ。計算は cast_plan／cast_norms が正で不変。
269-3 既存設定を持つ cast がいる制度は OFF 不可（件数を出して止める）。
269-4 隠す対象 16 箇所（plan-board タブ 4・plan-editor 節 4・comp-sections Tab 4・norm-config／
  deduction／products／mine 各 1）。出し分けは純関数 isSystemOn(store, key) 1 本で判定し、
  16 箇所に個別条件を書かない。
269-5 初回ログイン判定は setup_done 一本。settings_json 空や料金 0 件の推定は使わない。
269-6 料金テンプレは client 定数＋set_pricing_rule を行数分呼ぶ（一括 RPC は作らない・最大 3 行）。
269-7 マスタ「報酬制度」タブは lib/nox/master/nav.ts のキャスト・報酬群に 1 行。」

適用＝**mig 0147 手貼り（2026-09-17 13:44〜13:49 JST・ref hiqbfagmkrdpmlqhkmsu・Agoora）**＝supabase/migrations/0147_store_settings_keys.sql（CC 写経・sha256 e99b49bb8cd8560a7e321757431aea8accc55981d56415a74bd13d2f2e55065a・320 行・★1〜★5）。貼付後の md5(prosrc)＝`f2196d09d7f791a24bc439e6d0e78817`（貼付前 07d114ff0b570462c3330b87497fc17c）・検証 A-1〜6 ALL OK（署名 (uuid, jsonb) 不変・12 キー包含・'billing locked' 残存・proacl postgres／authenticated／service_role のみ・他 set_store_* 11 本＋money-core 3 本の md5 不変・埋め戻し setup_done=true **4 行**（CLUB NOX の既存 3 キー残存）・billing 47-1 ゲート済み 125／全数 241 不変・grants G2b 0・anon-guard 31a BLOCKED）。suite verify:nox-store-profile 39→**58**（20 キー化＝①②⑨-2・④-7・⑤-4〜7・fx-2・⑩-4・逆テスト 3 本＝enum 未知値の写像を外す→⑤-5 赤／length 20→8→⑨-2 赤／A1 の setup_done を false に書く→fx-2＋⑩-4 赤・各復元で緑）＝`fbf1f9c`。client レーン（isSystemOn・報酬制度タブ・/setup）は未着手。前提の読取（2026-09-17）＝制度別の表・列と 16 箇所の内訳は docs/tmp/0917_survey2.md g。set_store_profile の現白名単 8 キー＝裁定250。feature_flags の key は CHECK 4 値固定（mig0135:91）＝載せない根拠の一つ。　**(a) client＝`45c8031`**（2026-09-17）: lib/nox/store-systems.ts（純関数＝SYSTEM_KEYS 9・isSystemOn＝欠損／null／非 boolean は ON・false のみ OFF・SECTION_KEYS 17 節キー＋isSectionOn・systemUsageOf＝cast_plan.overrides_json／cast_norms から使用 cast 数・対応表は冒頭コメント）。出し分け 16 箇所→17 節（plan-board タブ 4＋quota 下段・plan-editor 4 節＋自由バック表・norma-board 3・deduction-board 2・products-board 2＝バック列／本指名pt・mine NormCard・settings は既存の店読取に乗せ新規取得 0）。マスタ「報酬制度」タブ（nav.ts キャスト・報酬群＋ハブ 5 枚目・/master/cast-comp/systems）＋components/nox/store-systems-panel.tsx（props settings／onChange／usage・manager は閲覧のみ・使用中 n>0 は OFF disabled）。suite verify:nox-store-systems 30（f0 51 段）。実機（A1・ownerA／managerA1／castA1a）＝全 ON で不変・時給／pt／罰金控除／達成ボーナス OFF で該当節が消え ON で復帰・使用中 n>0（各種バック 1・ノルマ 1）は OFF 不可・/mine は sys_norms=false で NormCard 不マウント（norm-progress fetch 0→1）。

## 裁定270（Agoora 承認 2026-09-17）裁定125 ローンチ範囲の追補＝初期設定ウィザード・報酬制度タブ・mig 0147／0148

出典＝相談役ブロック 2026-09-17（同日収載）。**本文（逐語）**:
「裁定270（2026-09-17 承認・裁定125 ローンチ範囲の追補）:
270-1 初期設定ウィザード（/setup・owner 初回ログイン・STEP 1 業態と基本情報／2 料金テンプレ／
  3 使う制度／4 会計方式と機能／5 確認）をローンチ範囲に加える。
270-2 マスタ「報酬制度」（既存店向け）を加える。STEP 3 と同じ器を同じ画面部品で書く。
270-3 mig は 0146 打ち止めを解き 2 本に割る。0147＝set_store_profile 白名単 +12（269-1）。
  0148＝繰越の消費（258-8）＋R11 紹介料（check_lines 3 列＋kind 'referral'＋RPC 2 本）＋
  R19 cast セルフ norm RPC。0148 は 0147 の client が実機を通ってから。
270-4 R11・R19 は第2期に送らず 0148 に同乗。R15 は設計裁定が先（本文は v32 §6）。
270-5 見積り＝W/S レーン 2〜3 セッション。着手は 0147 手貼り後。」

適用＝**(b) client＝`7c0524a`**（2026-09-17）: /setup 5 STEP（app/(manage)/setup/page.tsx＋setup-wizard.tsx＝STEP 1 業態 5 択＋店舗名＋営業時間／2 テンプレ表示＋「商品テンプレも取り込む」＋料金編集／3 store-systems-panel 再利用／4 会計方式＋feature_flags 4 値の flag_set／5 確認表→計画実行・進捗と失敗位置・再実行）。差し込み点＝app/(manage)/layout.tsx 1 箇所（既存 stores 読取に settings_json を足し owner かつ setup_done!==true の店があれば /setup・/setup 自身は除外・manager／staff／cast 対象外）。suite verify:nox-setup 56（f0 52 段・DB 不触）。実機（B1・fixture に ownerB が無いため一時 owner を service role で作成→後片付けで削除）＝25 件 8 秒・営業時間 7（19:00〜26:00）・席 8・料金行 2＋店既定・comp_plan 1・products 60（67−食品 7・drink 31／champ 10／bottle 19）・back 上書き 54・product_costs 60・カテゴリ 9・settings_json に biz_type／billing_mode／sys_* 9／setup_done・再ログイン後 /dashboard に留まる・/setup 直接再完了で件数不変（skip）・後片付け＝作成行・stores 列・audit 90 行・ownerB を戻し snapshot 一致。裁定125（ローンチ範囲）の追補として本エントリを参照。W/S の (c)＝新規 org での実機は本件の B1 で代替。モックの出典＝mock/onboarding-2026-08/（step1〜5・業態別 step1／step2 各 5）。
適用＝**(c) 0148＝`8af0be5`**（2026-09-18・裁定272 の適用欄参照）: 270-3 の 0148（繰越の消費・R11 紹介料・R19 cast セルフ norm）に 272-4（food／other）・272-5（receivable_policy setter）を同乗して dev 適用＝270-4 の R11・R19 は完了。残＝R15（設計裁定待ち）。

## 裁定271（Agoora 承認 2026-09-17）テンプレ投入の範囲と落とし方＝初期設定ウィザードの書込計画（271-1〜13）

出典＝相談役ブロック 2026-09-17（調査 docs/tmp/0918_survey.md §g2 を受けた裁定・実装ブロックに逐語同梱・同日収載）。**本文（逐語）**:
「裁定271 確定（逐語）:
 271-1 テンプレ JSON は lib/nox/setup/templates/v1.json に正本として置く。器が無いキーも削らない。
 271-2 bar は空テンプレ（料金 1 行・商品 0）。JSON に追記せず client で空を返す。
 271-3 営業時間＝set_store_business_hours を曜日 7 回。close は 30 時間制に写像（02:00→26:00）。
   cutoff＝set_store_biz_cutoff。
 271-4 席＝set_seat をループ。既存 seats が 0 のときだけ投入。
 271-5 料金＝set_store_pricing（無い値は現値マージ）・set_store_time_pricing・set_pricing_rule。
 271-6 報酬既定＝set_comp_plan（base 時給・指名／場内／同伴 fixed＝unit4・per_count）。月額保証は投入しない。
 271-7 商品＝product_bulk_insert 1 発 → back 持ちは set_product で個別上書き → product_costs。
   既存 products が 0 のときだけ。STEP 2 に「商品テンプレも取り込む」チェック（既定 ON）。
 271-8 back.type 写像＝none→rate 0／fixed→unit4／sale_pct→rate+back_value／
   product_specific→product_rule／tier→最下段の率を sale_pct／gross_profit_pct→未対応（使用 0）。
 271-9 food／other は v1 では投入しない（products.type 拡張は 0148）。【2026-09-18 解除＝0148 適用（裁定272-4・`8af0be5`）: products.type／check_lines.kind に food／other・set_product／product_bulk_insert の白名単 +2・template-plan の食品除外 0（verify:nox-setup su(2-3) 除外 0）＝投入可】
 271-10 request＝hon に写像。
 271-11 投入しない: tax_pct・karaoke_*・newcomer_guarantee・request_back・bottle_back のプラン側・
   features 4 種・inventory_managed・gross_margin_pct。
 271-12 書込順＝settings_json → 営業時間・cutoff → 席 → 料金 → 報酬 → 商品 bulk → back 上書き →
   原価 → 最後に setup_done=true。途中失敗はどこまで書いたかを画面に出し再実行可。
 271-13 ノルマ・罰金・売掛負担は投入しない。」
裁定269-5 初回ログイン判定は setup_done 一本。270-1 STEP 1〜5。270-2 STEP 3 は store-systems-panel を再利用。本便で確定＝billing_mode は表示のみの記録（挙動を変えない）・STEP 3 の既定＝時給・各種バックのみ ON、他 7 制度は OFF（template_policy の do_not_auto_enable と 269-2 に整合。OFF は表示のみ）。

**271-12 追補（Agoora 承認 2026-09-17・逐語）**: 「271-12 追補（同日）: 冪等条件は seats 0／products 0 に加え comp_plans 0／pricing_rules 0。set_comp_plan は p_id null で新規作成・set_pricing_rule は行追加のため。店既定（set_store_pricing／time_pricing）は上書きでガード不要。」

テンプレ正本＝lib/nox/setup/templates/v1.json（sha256 b8cf1720b79efe8ed227c090a2ff0d3c549d00fdcf8e24dd903076be1a03f8b1・75,783 B・4 業態＝cabaret_standard／girlsbar_standard／snack_standard／lounge_standard・商品 67／34／28／40・食品等除外 7／4／8／3＝投入 60／30／20／37）。back.type の 6 値と back_mode の対応・器が無いキーの一覧は docs/tmp/0918_survey.md §g2（未収蔵）。

適用＝`7c0524a`（lib/nox/setup/template-plan.ts＝buildSetupPlan が 271-12 の順で PlanStep[] を返す純関数・to30h／backArgsOf／productsPlanOf／pricingOf（request_yen→hon_fee）／compOf（request_back→hon）／seatsOf・冪等ガード seats_empty／products_empty／plans_empty／rules_empty）。suite verify:nox-setup 56（JSON sha・4 業態＋bar の計画配列・食品除外・30 時間制・back 写像・request→hon・tier 最下段・商品 OFF・冪等ガード）。逆テスト 2 本＝食品除外を外す→su(2-3) 赤／写像順を変える→su(2-1)＋(2-2) 赤。実機は裁定270 の適用欄。

## 裁定272（Agoora 承認 2026-09-17）0148 の設計＝繰越の消費・R11 紹介料・R19 cast セルフ norm・food／other・receivable_policy setter（272-1〜6）

出典＝相談役ブロック 2026-09-17（0148 起草ブロックに逐語同梱・同日収載）。**本文（逐語）**:
「裁定272 確定（逐語）:
 272-1 繰越の消費は mig で受ける。payroll_adjustments に source（'manual'／'carryover'・既定 'manual'）と
   carry_from_payslip_id を足し、部分 unique（run_id, cast_id）where source='carryover'。
   RPC payroll_carryover_sync(p_run_id) が draft run の各 cast について前期 payslip の
   breakdown_json の adjustOverflow を読み、>0 なら carryover 行を upsert（定額・源泉後・show_detail true・
   理由「前期繰越」）、0 なら削除。preview の route から毎回呼ぶ（冪等）。draft 以外は拒否。
 272-2 check_lines.kind に 'referral'。RPC check_add_referral＝check_add_line の custom 分岐を写経
   （product なし・kind 固定）。gross は pay.ts の新キー referralTotal（client・本 mig の外）。
 272-3 RPC set_cast_norm_self＝actor は shift_wish_submit 冒頭 3 行・本体は set_cast_norm を写経し
   自分の cast 行のみ。店の sys_norms が 'false' なら拒否。
 272-4 products.type と check_lines.kind の両 CHECK に food／other を同時追加。set_product／
   product_bulk_insert の白名単も同 mig で。
 272-5 RPC set_store_receivable_policy＝set_store_okuri_mode の骨格＋実列 update。CHECK 3 値をそのまま。
 272-6 新 RPC 4 本はゲート行の有無で A/B（裁定261）。payroll_carryover_sync は B5 A2 の許可列挙に入れない。」
裁定234（適用済み mig は書き換えない）・教訓82（actor は既存 RPC の行を写経）・教訓84（pin の走査対象）。revoke／grant は 0146 流（revoke all ... from public, anon → grant execute to authenticated, service_role）。

**追補（Agoora 承認 2026-09-17・同日）**: ★5 の idem は `p_idem_key uuid`（check_lines.idem_key が uuid・dohan／shimei の逐語行に合わせる）。紹介料の伝票合計への載せ方は R11 本文で判定（案 P＝客請求＝現状の ★5 のまま／案 Q＝店が払う手当＝★10 で check_group_due の `kind <> 'discount'` 条件行 2 箇所に `and kind <> 'referral'`＋TS 三面鏡＝docs/tmp/0148_draft_notes.md A-3・CC の判定は案 Q・手貼り前に確定）。

**追補 2（案 Q 確定・2026-09-18・本便で確定）**: 紹介料は店が払う手当（R11 本文「キャッチ入店時の紹介料」）＝伝票合計・課税額から除外し cast の gross（referralTotal）にのみ載せる。★10＝check_group_due を live 逐語で CREATE OR REPLACE し、`kind <> 'discount'` の条件行 2 箇所（v_bx＝L20／v_bx10・v_bx8＝L36）に `and kind <> 'referral'` を足すだけ・4 ロール revoke を再掲（内部専用のまま）。三面鏡＝client の groupDueFull（lib/nox/check-calc.ts・bx／bx10／bx8 の 3 式）と receipt.ts（gross／bx10／bx8 の 3 式＋明細行を印字しない）に同じ除外を足した（`8af0be5`）。起草時の控え（sha256 5dfd2a9f…・661 行・★1〜★9）は ★10 追加で sha256 c2944808…b187・720 行・★10 本へ更新（突合 a〜j 全 OK・致命 0）。

適用＝**mig0148 手貼り 2026-09-18 11:1x JST**（Agoora・ref hiqbfagmkrdpmlqhkmsu・Success・便 1「docs: v37 収蔵」`fe0e19c` の直後）→ 検証 A-1〜A-6 **ALL OK**（docs/tmp/0148_post.md・11:20 JST）: payroll_adjustments 列 15（末尾 source／carry_from_payslip_id）・CHECK 4（source_ck）・index 5（carryover_uidx＝UNIQUE (run_id, cast_id) WHERE source='carryover'）・FK carry_from→payslips ON DELETE SET NULL／新 RPC 4 本の署名逐語・secdef・search_path・proacl 3 ロール（anon・PUBLIC なし）／'billing locked' referral・norm_self・receivable_policy＝t・carryover_sync＝f／check_lines_kind_check 11 値・products_type_check 5 値・既存行の違反 0／check_group_due proacl {postgres=X/postgres} 不変・prosrc に kind <> 'referral' 2 箇所／set_store_profile f2196d09… 不変・set_store_* 11 本＋money-core 3 本＋不触 9 本（写経元）の md5 が控えと一致／billing 全数 245・gated 128・G2b 0・anon 5 本 BLOCKED。**新 md5(prosrc)**＝payroll_carryover_sync `b9bb34aee0e85c6752928889cabd35db`／check_add_referral `bd6b52952f8aceb36b1576ea84ebc3b7`／set_cast_norm_self `0ce771c7fbd7effea276a3955487bdb2`／set_store_receivable_policy `b1f14280015dcc78a255b67b55e490df`／check_group_due `7114f3c3…→8285d0d8db07720b398705cc779b1d88`（白名単 2 本＝set_product `b07d0343…→5e57813a97fc6ae82c7fd4f86fd3d33d`／product_bulk_insert `cd2d1133…→d87ff33806687039fe9879cd824d791d`）。
名簿・pin（`8af0be5`）: 課金ゲート正本 A に check_add_referral（A1[K]）／set_cast_norm_self（A7）／set_store_receivable_policy（A8）・B(e) に payroll_carryover_sync＝**全数 241→245・対象 125→128・除外 116→117**（billing 段47-1 の 5 pin＋段47-3 kiosk 腕 16→17）・grants G31 の kiosk 腕 3 pin（18→19／20→21／18→19＝check_add_referral が check_add_line の腕を逐語で持つため＝ブロックの想定外の張り替え点）・anon-guard probe 4 本（988→992）・payroll-adjust 列 15／CHECK 4／index 5／FK 6／署名 3（101→110）・**reopen ro(3b-4)／(3b-6)＝assert_day_open の呼出関数 15→16／16→17**（check_add_referral が check_add_line の perform 行を逐語で持つ＝f0 run1（11:43〜11:50・39 段まで緑）の 40 段目で赤→張り替え・教訓84 の走査で漏れた 2 点目）。★名簿 A 節の説明文に他の live 関数名（check_group_due・auth_cast_id）を書くと docNames パーサが名簿として拾い「対象 130」で赤になった＝説明文では関数名を避ける（本便で文言修正・教訓90）。
補記（2026-09-18・M-4）: (i) set_store_* の実数＝控え（0147_pre §7）12 本（biz_cutoff／business_hours／cast_register／norm_config／okuri_base／okuri_mode／pin_policy／pricing／profile／receipt_profile／tax_config／time_pricing）に対し live は **13 本**＝控え外は **set_store_receivable_policy（0148 ★8 新設）のみ**。0148 前後で控え 12 本の md5 は全て不変（11 本は pg_get_functiondef の md5・set_store_profile は prosrc md5 f2196d09… で照合）。A-5 の検証式は当初「set_store_* 走査 15 本」を前提にしていたため新設 1 本で 16 本になり NG 表示＝式を「控え 12＋新設 1＋money-core 3＝16 本・新設は控えと照合しない」に直して OK（DB 側の不一致ではない）。(ii) **check_add_referral は kiosk 腕（`auth_kiosk_register_store_id()`／`auth_kiosk_operator()` の OR 連鎖・`coalesce(auth_org_id(), auth_kiosk_org_id())`）を持つ**＝check_add_line の冒頭〜role 判定（custom 分岐の写経元）をそのまま逐語で写したことに由来。名簿 A1 は [K] で収載・billing 段47-3（kiosk 腕 16→17）・grants G31（18→19／20→21／18→19）の pin をそれに合わせた。**現状維持**（腕を外す改修はしていない）。kiosk から紹介料を起票させるかの是非は裁定273 系で相談役が判断。→ **追補（2026-09-18 午後・本便で確定・Agoora「推奨で」・相談役ブロック「272 追補2」）: check_add_referral の kiosk 腕は現状維持で確定**（改修しない・名簿 A1[K]／billing 段47-3／grants G31 の pin はこのまま）。
**追補 3（本便で確定・Agoora「推奨で」・2026-09-18・逐語）**: 「[272 追補3] 紹介料の入口=レジ「指名・席」タブ(3c6fcaa)。紹介者未選択=外部紹介は記録のみ(給与に乗らない)。日報への店負担合計の表示は第2期。」
適用＝**client `3c6fcaa`**（2026-09-18・便 Y）: レジ「指名・席」タブの指名カードの直後に「紹介料」カード＝金額＋紹介者 picker（裁定259 の components/nox/picker・未選択＝外部紹介）＋メモ＋「追加」（青塗り・check_add_referral・p_idem_key は client の crypto.randomUUID()）・注記「店が負担する手当です。お客様のお会計には含まれません。」・追加済みは同カードに一覧（キャスト名／外部紹介・メモ・金額・取消＝既存 check_remove_line・入金前のみ＝Danger red 枠）。owner／manager のレジのみ（isManagerUp）・kiosk-register には出さない。明細一覧は lib/nox/register/referral.ts（純関数 detailLinesOf／referralRowsOf／referralTotalOf）で紹介料行を除外・グループ小計の UI 鏡像も除外・合計の下に「紹介料(店負担) ¥n」を別掲＝三面鏡の 4 面目を作らない（合計の権威は checks.total）。suite verify:nox-referral 25→**30**（(8) 入口→明細別掲→due 不変＝groupDueFull(detailLinesOf)＝checks.total・referralTotalOf 3,500・register-board の結線 5 点・kiosk 0）・逆テスト＝detailLinesOf を素通し→re(8-1) 赤→戻して緑。tsc 0・ui-tokens 新規 0。dev 目視（owner-a・段28卓4 を開卓→1,500 追加→一覧「外部紹介 紹介料 ¥1,500 取消」・合計 ¥0 のまま別掲・注文タブの明細に出ない→取消で行 0）。目視の伝票は pg で削除（A1 open 0）。★便中の事故＝教訓91（逆テストの退避で git stash が tracked の Y／Z 変更を退避＝pop で復旧）。
suite 5 本（`8af0be5`・全て Postgres 直結 1 トランザクション＋JWT claims emulate＋ROLLBACK＝残留 0・snapshot 一致・逆テスト各 1 本＝壊して赤→戻して緑）: verify:nox-carryover **30**（finalize→次期 sync で carryover 1 行＝amount 4000・源泉後・前期繰越・carry_from／冪等・更新追随／manager 自店可・他 org 'run not found'・staff／cast forbidden／reopen→削除→再 finalize→sync で消える／not draft・not found・前期なし 0／manual 2 行共存・carryover 2 行目は unique 違反／audit 6 行）・verify:nox-referral **25**（kind referral・product null・紹介者／★案 Q＝checks.total 不変（内税・外税）＝DB＝groupDueFull＝receipt の三面鏡／idem・bad amount・既定名「紹介料」・bad name／bad cast・inactive cast・外部紹介 null／forbidden・not open／pay.ts referralTotal 1:1／audit）・verify:nox-cast-norm-self **16**（本人 upsert・署名 5 引数＝他 cast を指せない・sys_norms=false は 'norms off'・入力検証・manager／owner は 'no cast for caller'・audit 4）・verify:nox-product-types **20**（CHECK 逐語 5／11・bulk_insert by_type 5 キー・set_product food／other・check_add_line kind=food・category-map other・pay 器 3 キー）・verify:nox-receivable-policy **13**（3 値受理＋audit 各 1・4 値目／null は 'bad receivable_policy'・manager／他 org／不在は forbidden）。既存 suite 追随＝receipt 64→**67**（referral 行ありでも 381／347／1311）・pricing 150→**151**（段43(21) C1r＝紹介料 1000 込みで DB=TS=手計算 300）・product-bulk 39・setup 61 不変。D-2 実測＝dev 3200 で /api/payroll/preview（A1・2097-12 の draft run）が 2 回とも HTTP 200・server log に `payroll_carryover_sync … changed=0`・audit 2 行（upserted 0／deleted 0）→ run と audit を戻し snapshot 一致。tsc 0・ui-tokens 新規 0。
コミット 4 本＝`478303d`（client 前倒し）／`fe0e19c`（v37 収蔵）／`8af0be5`（0148 SQL 収蔵＋名簿／probe／pin＋suite 5 本＋三面鏡）／`d7a2084`（reopen pin）＝f0 2 連緑（58 段 4,337・613s／851s）で push（`580718a..d7a2084`・2026-09-18 12:18 JST）。教訓88（DB を触る node -e は finally で閉じる）は本便の全 script で遵守（2026-09-18 承認＝教訓88 として収載）。

## 裁定273（本便で確定・Agoora「推奨で」・2026-09-18）業態別公開デモ（273-1〜8）

出典＝相談役ブロック 2026-09-18 午後（読取調査 docs/tmp/0918_demo_pre.md a〜k を受けた裁定・同日収載）。**本文（逐語）**:
「[裁定273 業態別公開デモ] 273-1 器は org 4 分割・新設(NOX-DEMO-CABARET/GIRLSBAR/SNACK/LOUNGE)。既存 NOX-DEMO(CLUB NOX)は不触。
 273-2 識別子は orgs.is_demo boolean。org_billing.status は使わない。
 273-3 種は TS 純関数が今日の営業日基準で過去 14 日分を決定的に生成→jsonb 1 個→RPC demo_org_reset(p_org_id,p_payload) 1 回
   (service_role 限定・is_demo 以外は raise・子→親削除→jsonb_populate_recordset 投入を 1 トランザクション)。E1/E2/E4 は不採用。
 273-4 suite demo-seed で 凍結合計＝check_group_due＝receipt の三点一致を抜き取り。日報は daily_report_close、給与は payroll_finalize 正規経路。golden 不触。
 273-5 開いている伝票 3 卓と当日の出勤打刻は入場時補充(直近 3 時間に無ければ今基準で足す)。
 273-6 柵は app/api route の共通ガード 1 本(拒否=stripe/billing・invite・staff create/email・mynumber・provision・cast-photo・print)。
   RPC 128 本と billing_writable_of は無改造。set_store_*・flag・商品・顧客・notice は許可。demo org は setup_done に依らず /setup へ飛ばさない。
 273-7 入場は /demo→サーバ完結の generateLink＋verifyOtp。リセット時に demo ユーザーの email/PW を admin で戻す。
 273-8 日次 05:00 JST＋org 単位の手動リセット(10 分間隔)・上部帯・/demo noindex・アプリ全体は LP 以外 disallow。
 未決★ auth.updateUser 経由のメール変更連打による送信枠の消費。公開の前提=Vercel Pro＋Compute 引き上げ(裁定262)。」

適用＝未着手（0149＝orgs.is_demo＋demo_org_reset の mig と TS 種生成・事前読取は docs/tmp/0149_pre.md）。

**DB 側 完了（2026-09-18・mig0149／0150 手貼り済・検証 ALL OK・suite verify:nox-demo-reset 34・client `425f21c`）**＝273-4 の suite は demo-reset として f0 60 段目に。273-1〜3／5〜8（業態テンプレ・route・cron・公開導線）は client 便（v38）へ。

## 裁定274（本便で確定・Agoora「推奨で」・2026-09-18）R15 シフト画面の情報設計＝5→3 タブ・語は 3 語固定

出典＝相談役ブロック 2026-09-18 午後（読取調査 docs/tmp/0918_R15_pre.md の分岐点・Q1〜Q5 を受けた裁定・同日収載）。**本文（逐語）**:
「[裁定274 R15] シフト画面を 5→3 タブ(今日／作る＝[作成|仮]／確定＝[承認待ち|確定シフト])・語は 3 語固定(公開/承認/確定)。
 status 拡張・既読と同意の分離は第2期。client 1 便。」

適用＝**client `9e6cf85`**（2026-09-18・便 S・docs/tmp/0918_R15_impl.md）: lib/nox/shift/tabs.ts 新設（純関数＝SHIFT_VIEWS 今日／作る／確定・VIEW_TABS 作る＝[build 作成|calendar 仮シフト]／確定＝[queue 承認待ち|roster 確定シフト]・viewOfTab／tabOfView＝旧 5 キーの写像・深リンク維持）。shift-board は旧 5 タブの nav を 3 タブ＋`.nox-seg` の 2 択に置換し、state 型・setTab 5 箇所・各パネルの分岐は不変（承認待ちの件数バッジは「確定」タブに丸数字＋seg に素の数字）。語の統一＝**行を承認する動詞のみ「承認」（置換 15・13 種）**＝トースト（承認に失敗／承認しました）・確認ダイアログ・title・CTA「承認する（n 件）」・行ボタン「承認」・一括「件を一括承認」・案内文「「確定」タブの承認待ち」×3。状態名（確定＝confirmed／未確定／確定シフト／確定時間／確定人時／確定者）・監査ラベル（shift_confirm_bulk「確定」）・DB status 値・RPC 名は不変（91→81 箇所）。suite verify:nox-shift-tabs **14**（純関数＋shift-board の結線を逐語 grep・逆テスト＝viewOfTab の calendar を confirm に→3 本赤→戻して緑）＝f0 59 段目。既存 suite に UI 文言・タブキーの pin は 0（張り替え点 0）。tsc 0・ui-tokens 新規 0。dev 目視（owner-a・375／1280）＝3 タブが 1 行・seg の切替と 3 タブ往復で state が保たれる・body 横幅不動。cast 側（/mine）は本便の変更対象外＝不変。仮決め＝docs/tmp/0918_pm2_decisions.md #10〜#14。

## 裁定275（本便で確定・Agoora「推奨で」・2026-09-18）M12／M13 ヘッダ整理とメニュー再編＝歯車の口

出典＝相談役ブロック 2026-09-18 午後（読取調査 docs/tmp/0918_M_survey.md M12/M13 節を受けた裁定・同日収載）。**本文（逐語）**:
「[裁定275 M12/M13] 歯車の口は Modal(「その他」Modal 写経)。下タブ=ホーム/レジ/日報/シフト、その他=キャスト/スタッフ/顧客/給与/分析/領収書(＋在庫)、
 歯車=マスタ/お知らせ/監査/ご契約/ログアウト。在庫は既存画面があればリンク 1 本・無ければ見送り。≥900 は SideNav 下部に同群。MASTER_NAV 不触。」

適用＝**client `2c379bf`**（2026-09-18・便 R）: components/ui/nav.tsx＝NavGroup に `gear`・TabBar に `gear` prop＝≤899 の下タブ（spPriority 4 本）＋「その他」Modal＋**「歯車」Modal**（見出し「設定」・gear=true の群＝マスタ／お知らせ／監査／ご契約＋脚にログアウト＝form POST /auth/signout・「その他」Modal の写経・Esc／× で閉じる・⚙ は文字 U+2699・aria-label「設定」）。app/(manage)/layout.tsx＝下タブ **ホーム／レジ／日報／シフト**（旧: ホーム／レジ／シフト／キャスト）・分析群の末尾に **在庫**（/master/stock＝既存画面・URL 不変・manager 以上）・店舗群を gear・topbar 左に **≤899 のみロゴ**（SideNav の .brand 写経・900+ は CSS で非表示＝同じ情報を 2 箇所に出さない）・topbar のログアウトは **≤899 で非表示＝歯車へ集約**（900+ は従来どおり）。項目集合・URL・role ゲート・MASTER_NAV（lib/nox/master/nav.ts）は不変。cast は レジ＋歯車（ログアウトのみ）。role 別の口＝docs/tmp/0918_pm2_decisions.md R-3 表。tsc 0・ui-tokens 新規 0。dev 目視＝375px で下タブ 6 項目（ホーム 37／レジ 27／日報 27／シフト 38／その他 38／⚙ 15 px）が 375 に収まり body 不動・その他＝キャスト／スタッフ／給与／顧客／分析／領収書／在庫・歯車＝4 本＋ログアウト・1280px はサイドバー（店舗群が最後）＋topbar ログアウト＝従来どおり。仮決め＝0918_pm2_decisions.md #4〜#9。
**追補（本便で確定・Agoora「推奨で」・2026-09-18・逐語）**: 「[275 追補] nav-icons 3 個・在庫を営業群へ(5208cf1)。」

**追補2（本便で確定・相談役ブロック・2026-09-24・逐語）**: 「裁定275 追補2（2026-09-24・9/19 の実機指摘によるナビ・ヘッダー改定）
1 下タブは 5 本「ホーム／レジ／日報／シフト／メニュー」（その他→メニュー・歯車は下タブから外す）。メニューにお知らせを置く。
2 歯車はヘッダー右（マスタ・監査・ご契約）。ヘッダー左＝ロゴ（ホームへ）＋店舗名。右＝「登録名｜役割」（押すと自分の情報＋ログアウト）。
3 メニュー・設定はアイコン＋説明＋「›」の一覧型。選択中タブはアイコン＋上辺の線＋太字。
4 owner 自身のメール変更をローンチ範囲へ（実装は Auth 設定 4 点の後・本追補では読取のみ）。
5 cast・黒服・kiosk 端末での名前表示は各 role の目視で確認（Agoora）。」
適用＝夜間便 N4（2026-09-24・client 未 push）: lib/nox/ui/nav-tabs.ts（純関数 tabsFor／splitNav／activeHrefOf／userChipLabelOf・NAV_DESC）＋ components/ui/header-chips.tsx（HeaderGear＝⚙→設定 Modal・UserChip＝「登録名｜役割」→自分の情報＋ログアウト form POST /auth/signout）＋ nav.tsx（下タブ 5 本目「メニュー」＝一覧型 NavListRow・下タブの歯車撤去）＋ (manage)/layout.tsx（ヘッダー左 Link /dashboard＋店舗名・右＝歯車＋登録名チップ・users 行の読取 1 本）＋ globals.css（選択中タブ＝上辺の線＋太字・.nox-navrow／.nox-hdrbtn・トークン新規 0）＋ suite verify-nox-nav 14（f0 71 段目）。4 は読取のみ（AW-5＝docs/tmp/0924_night_log.md）・5 は Agoora。
適用＝**client `5208cf1`**（便 Z）: components/ui/nav-icons.tsx に /receipts（紙＋金額行）・/master/stock（箱）・/billing（カード）を既存と同じ線幅 1.7・18px・viewBox 24 で追加＝サイドバー 15 項目すべてにアイコン。layout.tsx＝在庫を分析群から営業群（レジ・日報の下）へ＝≤899 の「その他」でも先頭側。項目集合・URL・role 条件は不変。tsc 0・ui-tokens 新規 0・dev 目視。

## 裁定276（本便で確定・Agoora「推奨で」・2026-09-18）デモの種と 0149 の形（276-1〜5）

出典＝相談役ブロック 2026-09-18 午後（0149 事前読取 docs/tmp/0149_pre.md u1〜u8 を受けた裁定・同日収載）。**本文（逐語）**:
「[裁定276 デモの種と 0149 の形]
 276-1 種は録画再生。TS に pricing_resolve_core・按分・時間課金の鏡像を新設しない。実 RPC で作って閉じた伝票の行を JSON に録り、
   日付は営業日からの相対で保存→リセット時に今日へずらして投入。延長は open 後に started_at を過去へ UPDATE してから close。
   録画は 1 トランザクション内で SELECT→ROLLBACK。給与 run・日報は録画に含めず再生後に正規経路で作る。
 276-2 demo_org_reset は表非依存の汎用形(固定の表順で削除→逆順に payload->'表名' を jsonb_populate_recordset)。
   orgs・org_billing・users・memberships は残す。check_lines の後に stock_logs を再削除。payload に stock_logs の sale 行を入れない・drink_claims は最後。
 276-3 mig 0149＝orgs.is_demo boolean・orgs.demo_reset_at timestamptz・RPC demo_org_reset 1 本。名簿 B(a)・INTERNAL_PROBES。
   org／org_billing の作成は mig 外の一度きりスクリプト。
 276-4 柵＝route 冒頭 assertNotDemo × 12 系＋34 route 全数の許可列挙 suite(裁定260 型)。middleware/JWT claim は不採用。
   cast-photo は導線を隠す＋storage policy(パスから org を引ければ 0149 同乗)。
 276-5 cron は Vercel Pro 後に 3 本目。それまでは手動リセット。
 未決★ auth.updateUser のメール変更は Auth 設定で対処(mig と独立・公開のブロッカー)。」

適用＝未着手（事前読取の追補＝docs/tmp/0149_pre.md w1〜w6・録画再生の PoC＝scripts/demo/poc-record.mjs＋docs/tmp/0149_poc.md＝本便 X・コミットしない）。

**DB 側 完了（2026-09-18・mig0149／0150 手貼り済・検証 ALL OK・suite verify:nox-demo-reset 34・client `425f21c`）**＝276-1（is_demo 列）・276-2（残す表＝278-1 で 3 表に改定）・276-3（録画再生＝suite で 5 枚三点一致）・cast-photo の storage policy is_demo 句（276-4 後段）が live。276-4 の route 柵・276-5 cron は client 便。

## 裁定308（本便で確定・Agoora・2026-09-25）306 目視の NG（308-1〜3）

出典＝Agoora のスマホ実機目視（裁定306 の 16 項・2026-09-25）を受けた指示（便 K308 で収載）。次の裁定番号は 309。**本文（逐語）**:
「裁定308（2026-09-25・306 目視の NG・Agoora）
308-1 /shift 期間の新規フォームの「作成」は幅いっぱいの 1 行（≤899px）。306-7 の「最下段右端」を本項で訂正。
308-2 「配置を組む」の月カレンダーは曜日行の直上に MonthNav（年月・‹ ›・今月）を sticky で必ず描画（≤899px 含む）。K-1 で描画箇所を逐語確認し、タブ切替や幅で消えない位置に置く。
308-3 306 のスマホ目視は 308-1／2 を除き OK（Agoora・2026-09-25）＝306 適用欄に記録。
実装＋suite shift-nav に pin（作成ボタンの幅・MonthNav が 配置タブの曜日行の直前の兄弟要素）・逆テスト → f0 2 連に同乗 → push。」

適用＝便 K308（0153 手貼り後ブロックの f0 2 連に同乗）: 308-1＝.nox-periodform .pf-acts は ≤899px で column・button width 100%（globals.css）／308-2＝MonthNav を「配置を組む」カードの planView 分岐の直前（＝.nox-calgrid の直前の兄弟）へ移設（planbar 上の 1 本は撤去・タブ切替・幅で消えない）／suite shift-nav sn(3-6)（作成ボタン全幅）・sn(2-6)（MonthNav が曜日行の直前の兄弟）。

## 裁定309（2026-09-28・§8 未裁定 10 件・P-4 live 読取 02:15Z 基準）

出典＝v40 §8 の未裁定 10 件と P-4 live 読取（docs/tmp/0155_pre.md／0156_pre.md【DB】節・2026-09-28T02:15:57Z・proof orgs 3）を受けた Agoora 指示（2026-09-28・便 Q-1 で収載）。次の裁定番号は 310。**本文（逐語）**:
「裁定309（2026-09-28・§8 未裁定 10 件・P-4 live 読取 02:15Z 基準）
309-1 【293-1 売掛・0155】stores.settings_json.ar_enabled boolean。0155 で既存全店（live で保持店 0＝org 3 の stores 全数）を true に明示 UPDATE・新規店は coalesce で既定 false。check_pay の ar 分岐で ar_policy_ok（0055 の空フック）を結線し false なら raise 'ar disabled'。set_store_profile 白名単 +1。UI＝店設定「売掛を使う」トグル（owner のみ）。
309-2 【293-2 audit 保持・0155】列を足さない。保持 7 年固定（L2 趣旨・店設定にしない）。audit_purge(service_role のみ)＝at < now()-7年 の行を削除し action 'audit_purge' 1 行に件数・最古・最新を残す。実行は手動＝cron は Vercel Pro 後に起票。
309-3 【293-5 マイナンバー廃棄・0155】cast_sensitive に mynumber_deleted_at／mynumber_deleted_by／mynumber_deletion_method の 3 列（別表なし）。cast_mynumber_discard(cast_id, reason)（owner のみ・mynumber_enc=null・audit）。廃棄候補一覧 RPC（退店日の翌年 1/1 起算 7 年経過・owner）。自動削除なし。get_cast_mynumber／masked の署名・proacl は不変（20163586／6f401f45）。
309-4 【305-11 顧客匿名化・0155】物理削除なし。customer_anonymize(customer_id, reason)＝name '削除済み顧客'・furigana／tel／birthday／prefs／memo null・is_active=false・anonymized_at=now()・audit。check_customers／receivables の FK は残す。retention_until 到来の候補一覧 RPC（owner）・自動化なし。deleted_at は予約列のまま不使用。
309-5 【307-1・0155】referral_payouts_unpaid から billing_writable_of の 1 行のみ除去（A4→B(f)・billing 145→144）。md5 は突合で更新。
309-6 【T9 日払い・0156】専用表 daily_pays（org・store・cast・biz_date・gross・withholding・net・paid_by・idem_key unique）＋daily_pay_issue（owner／manager・支払時に源泉確定・委託 10.21%・雇用は T10 回答まで 0 で warn）。月次 run は「日払い済み」を支給後控除行（支払済額）と源泉の既徴収額として差し引く。専用 run なし。payment_records（0 行）は触らない。
309-7 【年越し過払債権・0156】open の advances は年を跨いでも同一行で回収継続（別勘定なし）。年末に「貸付残高一覧」（cast 別 open 合計）を給与画面に出す。貸倒は adv_cancel（理由必須）手動。payroll_carryover_sync 不変。live は advances 0 行＝データ移行なし。
309-8 【300 追補1・0156】表 payroll_run_deduction_overrides（run_id×cast_id×deduction_id unique・enabled・amount_override）。collect.ts の deductions 読取直後で cast 別に差替え。finalize の凍結は現行（breakdown_json に上書き後の値）。UI＝run 明細右パネル「固定控除」節（draft のみ編集）。
309-9 【302-5 退勤連動・0156】自動発行なし。out 打刻（punch_self／kiosk_punch／punch_proxy）に punches.okuri boolean。既定は新キーを増やさず既存 settings_json.okuri_mode から導く（値の意味は 0156 pre で確定）。daily_report_close 前に「今日の送り n 件・合計 ¥m」を確認→transport_issue_bulk（idem＝punch id）。手動発行との二重は idem で防ぐ。
309-10 【D5 kiosk・0155 同乗】kiosk_check_keeps(check_id)＝伝票の顧客名＋active キープのボトル名のみ（裁定11 の例外を明示・305-4 と同一露出）。
不変: 249・248・256・261・281・265。0155 の器＝309-1〜5・10、0156＝309-6〜9。」

適用＝便 Q-2 で supabase/migrations/0155_compliance.sql を起草（309-1〜5・10）・手貼りは Agoora・収蔵は手貼り後の次便（教訓93）。0156（309-6〜9）は別便。

**309 追補1（2026-09-28・0155 起草判断の裁定・Agoora）**: 0155_compliance.sql 起草版（sha256 a1c11e5b…cd6a7・便 Q-2）冒頭の起草判断 (a)〜(g) を受けた裁定。
(a)(b)(c)(e)(f)(g) は起草どおり確定＝(a) audit_purge は org ごとに 1 行（org_id NOT NULL）・削除 0 の org は書かない・actor null・reason 'retention 7y'／(b) cast_mynumber_discard／customer_anonymize は billing ゲートなし＝名簿区分は名簿追補時に「非ゲート書込・法定履行」の新区分として裁定／(c) customer_anonymize は owner のみ／(e) mynumber_enc null は 'no mynumber' 拒否・method 'overwrite_null'／(f) 廃棄候補は enc 非 null の退店 cast のみ／(g) 結線位置＝receivables INSERT 直前。
(d) 改稿: customer_anonymize は customer_notes を同時削除（本文は audit に残さない・件数のみ after_json に 'notes_deleted'）。
追加: kiosk_check_keeps は STABLE（check_customer_names と同型）。
適用＝便 Q-2b-2 で gen_0155.mjs／0155_template.sql 経由で改稿（★9 notes 削除＋notes_deleted・★12 stable・冒頭 (d)・期待 md5）・Q-2b-3 で BEGIN…ROLLBACK 追試。手貼りは Agoora・収蔵は手貼り後（教訓93）。
**0155 適用欄（2026-09-28）**: 手貼り＝Agoora 2026-09-28 13:2x JST（貼付版＝改稿版 sha256 **6b30084efd0170a7c2662e72378e7ebfd660eae4661455d74caf4344f2d5c6bb**・748 行・63,012 B＝収蔵版と同一・ヘッダ書換なし）。CC の適用後読取 13:38 JST＝proof orgs 3・md5 12 本一致（check_pay 05ca579b／set_store_profile 86a7a86b／referral_payouts_unpaid 4340d19f／ar_policy_ok d7b0bfcb／audit_purge f2946b95／cast_mynumber_discard 3c2d917d／cast_mynumber_discard_candidates e285a272／customer_anonymize 11b4f43b／customer_anonymize_candidates d1ce4ace／kiosk_check_keeps b68a8e0c・不触 get_cast_mynumber 20163586／get_cast_mynumber_masked 6f401f45）・proacl 期待どおり（audit_purge＝postgres, service_role・ar_policy_ok＝postgres のみ）・stores ar_true 4／4・cast_sensitive 11 列・relacl 不変（authenticated なし）・pg_proc 全数 274。**目視（Agoora・2026-09-28）＝①〜⑥ OK**（便 S の client＝店設定トグル／レジ売掛非表示／廃棄＋候補／匿名化＋候補／kiosk 顧客・キープ／owner 未描画＝01d0fcd・Vercel Production success 14:54:02）。
事前突合＝docs/tmp/q0928_ag_0155.mjs（BEGIN…ROLLBACK・36 段 NG 0＝静的列挙 3・md5／proacl／stores／列 7・audit_purge 実削除 4・kiosk_check_keeps 5・discard／候補 7・anonymize／候補 7・検証 1・ROLLBACK 後不変 2）。収蔵＝便 R-1（mig をパス指定コミット・sha 照合済み）。名簿 268→274／billing 145→144・suite 張り替え・compliance suite 新設＝便 R-2〜R-5。

**309 追補2（2026-09-28・0156 起草判断の裁定・Agoora）**: 0156_daily_pay_advance.sql 起草版（sha256 e1db1381…66e7・便 T-2）冒頭の起草判断 (a)〜(h) を受けた裁定。
(a)(b)(d)(e)(g)(h) は起草どおり確定＝(a) punches.okuri の既定＝out かつ okuri_mode='actual' の店で false・'flat'／未設定と in は null（列は null 可）／(b) daily_pays_of_run が ★2 の collect 用を兼ねる／(d) 控除上書きは 'run not draft'・理由不要／(e) okuri_today_summary は未発行のみ・合計は client／(g) 旧署名 3 本 drop／(h) RLS＝daily_pays は advances 同型・overrides は deductions 同型＋cast 不可視。
(f) 改稿: get_cast_mynumber_masked は不触（署名・戻り text・md5 6f401f45 不変）。廃棄記録は新設 cast_mynumber_discard_status(p_cast_id) returns table(mynumber_deleted_at timestamptz, mynumber_deletion_method text, has_mynumber boolean)＝owner／manager 自店／cast 本人・audit なし（値を返さない）・名簿 B(f)。
(c) 改稿: 日払いの源泉は月次 run と同式＝lib/nox/pay.ts withholdingOf（委託のみ floor(max(0, gross − 5,000 × periodDays) × 0.1021)・Math.floor＝1 円未満切捨て・雇用 0・DB 関数は無く TS。課税ベースは payOf の gross − before 調整）を日数 1 で写経＝floor(max(0, gross − 5,000) × 0.1021)・負は 0（double precision＝TS の Number と同じ IEEE754）。5,000 円控除の日払いへの適用可否と月内複数回の日数の数え方は専門家確認事項 T10 へ。
(e) 補足: okuri_base_amount は未設定なら null＝client が行ごとに金額入力。
適用＝便 T-2b-3 で gen_0156.mjs／0156_template.sql 経由で改稿（★6 の masked 部分を除去・★6b cast_mynumber_discard_status 新設・★1 の源泉式差替え・冒頭 md5／名簿影響 274→283／検証文）・T-2b-4 で追試追加（masked 不変・discard_status 3 role・源泉境界）。手貼りは Agoora・収蔵は手貼り後（教訓93）。
**0156 適用欄（2026-09-28）**: 手貼り＝Agoora 2026-09-28 15:4x JST（貼付版＝改稿版 sha256 **29d5c427b45788f70a97b000dd91747686f25e2f8e9764247aec919ef07bdc9b**・644 行・45,590 B＝収蔵版と同一・ヘッダ書換なし）。CC の適用後読取 15:54 JST＝proof orgs 3・検証 6 文一致＝md5 13 本一致（punch_self f2c9b923／punch_proxy 83f2a99f／kiosk_punch b31ff8fa／kiosk_register_state e01d2b83／cast_mynumber_discard_status e5a00d20／okuri_default_of 434e69d9／daily_pay_issue bac429f9／daily_pays_of_run da3d45a0／payroll_run_deduction_override_set bfc5fdb4／payroll_run_deduction_override_clear 86badf90／payroll_run_deduction_overrides_of a33a2b30／okuri_today_summary e61e5dd9／advances_open_balance 724d7551）・get_cast_mynumber_masked 6f401f45 不変（戻り text）・列 daily_pays 12／overrides 10／punches 14・policy 2（select）・旧署名 count 3（punch 3 本＝各 1 定義）・proacl 期待どおり（okuri_default_of＝postgres のみ・他 12 本 authenticated, service_role）・pg_proc 全数 283・'billing locked' 145。
事前突合＝docs/tmp/q0928_ag_0156.mjs（BEGIN…ROLLBACK・37 段 NG 0＝静的 4・md5／署名／proacl／列 5・日払い 8（源泉境界 11 点）・上書き 4・打刻／送り 7・残高 1・同乗 5・検証 1・ROLLBACK 後不変 2）。収蔵＝便 U-1（mig をパス指定コミット・sha 照合済み）。名簿 274→283／billing 144→145・suite 張り替え・daily-pay suite 新設＝便 U-2〜U-5。collect.ts の結線（daily_pays_of_run・overrides）と client（日払い UI・控除上書き・okuri トグル・貸付残高・kiosk 売掛非表示・廃棄状況）は便 V。

## 裁定310（本便で確定・Agoora・2026-09-28）/shift 今日タブの「調整」モーダル＝タブ 2 つ（出退勤／確定シフトの時間）

出典＝Agoora 指示（2026-09-28・便 X-1 で収載）。次の裁定番号は 311。**本文（逐語）**:
「裁定310 /shift 今日タブの『調整』モーダルはタブ 2 つ＝①出退勤（打刻・既定）②確定シフトの時間。打刻修正は現行 punch_correction（理由必須・承認）に流し『給与に反映されます』の注記、確定枠は『打刻は変わりません・給与は動きません』の注記。行の『出勤を修正／退勤を修正』リンクは廃止しモーダルに一本化」

適用＝便 X-2／X-3（2026-09-28・client のみ・DB 恒久変更 0・RPC 追加 0）: 今日タブの行右端「調整」→ shift-board の調整モーダルに `.nox-seg` の tablist（①出退勤＝既定・②確定シフトの時間）。
①＝出勤・退勤の実績時刻（punchIO・未打刻は「—」）＋「修正／記録する」→ components/nox/punch-correction-modal.tsx から切り出した PunchCorrectionForm（Modal なし・punch_correction_request・理由必須・owner／manager は同 tx で approved＝承認導線は現行）を同じモーダル内に埋め込む。注記「打刻の修正は理由が必須で記録に残り、給与に反映されます」。打刻の書込は当日のみ（SC-8 ⑦ と同じ・別日は 修正 disabled）。
②＝現行の開始・終了フォームを移設（見出し「確定シフトの時間を調整」・shift_set update 経路・status 据置）。注記に「打刻は変わりません・給与は動きません」を追加。
①は表示日（todayDate）の行だけ出す（他ビューから開いた別日の行は打刻を読んでいない＝②のみ・既定②）。行の「出勤を修正／退勤を修正」リンクと旧 corr モーダルは除去。
X-3（裁定306 の型）: モーダルは isManagerUp のときだけ描画＝cast は①②とも未描画。cast 本人の打刻修正申請は /mine の現行フォーム（punch-correction-form）のまま。
suite messages ms(2-4)（注記 2 文・tablist・『を修正』リンク 0・PunchCorrectionModal 参照 0）。

## 裁定311（本便で確定・Agoora・2026-09-28）支払記録の method 選択式・日報「現金支払」の集計プレフィル・支払履歴・内訳行（311-①〜④）

出典＝Agoora 指示（2026-09-28・便 Y-1 で収載）。次の裁定番号は 312。**本文（逐語）**:
「裁定311 ①支払記録の method は選択式（現金 cash／振込 transfer／その他 other・列は text のまま・既存 null は『その他』表示）②日報『現金支払』は client 集計でプレフィル＝当日営業日の 送り実費（transport・actual 店の発行分）＋前借り（advances.advanced_on）＋日払い（daily_pays.net）＋給与支払（payment_records.method='cash'・paid_at）。手入力で上書き可・集計値と違えば『集計 ¥n と差 ¥m』の注記・保存は現行 cash_payout ③支払記録に履歴一覧（日付・cast・金額・方法・メモ・記録者）④日報に現金支払の内訳行」

適用＝便 Y-2〜Y-5（2026-09-28・client のみ・DB 恒久変更 0・RPC 追加 0・名簿不変）:
①＝lib/nox/payroll/payment-method.ts（PAYMENT_METHODS＝cash／transfer／other・paymentMethodLabelOf＝null／other→「その他」・列挙外の旧文字列はそのまま）。payment-panel の方法欄を select（既定＝現金）・app/api/payment/record/route.ts は cash／transfer／other 以外を 400（null は旧記録互換で許容→RPC が null 保存）。payment_record_add（0021）は不触＝nullif(trim) のまま。
②④＝lib/nox/report/cash-payout.ts（純関数: CashPayoutParts・cashPayoutTotalOf・cashPayoutRowsOf・payoutDiffNoteOf＝「集計 ¥n と差 ±¥m」）。report-board は storeId×bizDate×canClose の effect で 4 表を直読（transport は stores.settings_json.okuri_mode='actual' の店だけ・transport／advances は status<>'cancelled'・daily_pays は net・payment_records は method='cash' かつ paid_at＝営業日）→ 合計を payout の既定値に（再締め＝#70 の日報の値を写す経路が優先）。欄の直下に内訳 4 行＋合計＋注記＋「集計値に戻す」。締めの p_cash_payout は現行どおり入力値。
RLS 確認（live pg_policies・2026-09-28）: transport／advances／daily_pays／payment_records の 4 表とも SELECT ポリシー＝`org_id=auth_org_id() and (owner or store_id=auth_store_id()) and (auth_role()<>'cast' or cast_id=auth_cast_id())`・authenticated は SELECT のみ＝締める側（owner／manager／staff）は自店全行が届く。停止条件（届かない表）なし。
③＝payment-panel「支払状況を表示」の下に「支払履歴（期間）」＝payment_records（run 全行・paid_at 降順・created_at 降順）・cast 名（casts）・方法（写像）・メモ・記録者（users.name・owner 全員／manager は自店会員の RLS・届かなければ「—」）。行の「支払済」数字を押すとその cast だけに絞る（再押下で全員）。
Y-5（裁定306 の型）: PaymentPanel は /payroll（page.tsx が owner／manager 以外を redirect）にだけ載る＝cast／staff は未描画。
suite messages ms(2-6)（payoutDiffNoteOf／paymentMethodLabelOf の純関数＋payment-panel が select・自由入力 placeholder 0＋report-board が内訳 4 語）。

## 裁定312（本便で確定・Agoora・2026-09-29）支払済み期間の前借り・日払いは控除先を翌期へ自動繰り下げ（0158）

出典＝Agoora 指示（2026-09-29・便 X-8-1 で収載）。**本文（逐語）**:
「裁定312 支払済み期間の前借り・日払いは控除先を翌期（deduct_period＝翌月）に自動繰り下げて発行可・発行時に『翌月の給与から控除』を明示・翌期も paid なら拒否」＝0158。

適用＝未着手（mig 0158 ★起草に同乗）。現行は 0156 の 'paid period'（rpcErrJa「その営業日を含む給与は支払済みのため登録できません」）で拒否。

## 裁定313（本便で確定・Agoora・2026-09-29）/shift 今日タブの行は 1 段構成（出勤記録＝セグメント＋退勤・操作＝時刻修正／減額）

出典＝Agoora 指示（2026-09-29・便 X-8-1 で収載）。**本文（逐語）**:
「裁定313 今日タブの行は 1 段構成。出勤記録列＝セグメント（出勤／遅刻／当欠／同伴／休み）＋同段右に『退勤』（出勤後のみ活性）。操作列＝『時刻修正』（裁定310 のモーダル）『減額』（精算調整の登録）の 2 ボタン。行内のテキストリンクは全廃」

適用＝便 X-8-2／X-8-3（2026-09-29・client のみ・DB 恒久変更 0・RPC 追加 0）: shift-board 今日タブの出勤記録セル＝`.nox-attrow`（セグメント＋打刻時刻の小字＋送りチェック（actual 店）＋「退勤」を同段・≤899px は 2 行折り返し）。「退勤」は書込可の日は常に描画し、出勤区分かつ in 打刻あり・out なしのときだけ活性（判定は従来の outButtonOf）。
操作列＝`.nox-rowops`（「時刻修正」＝裁定310 のモーダル・「減額」＝SettlementModal＝精算調整の登録。減額は委託キャストで遅刻／当欠／早退が検知された行だけ活性・他は理由を title に出して非活性）。行内の「精算調整を登録」リンクは除去（裁定310 で除去済みの「出勤を修正／退勤を修正」と合わせて行内テキストリンク 0）。≤899px は 2 ボタンを全幅縦積み。
操作列は isManagerUp のときだけ th／td ごと描画（staff は未描画・cast は layout が /mine へ戻すため画面自体に来ない）。
★本文の「操作列＝2 ボタン」に対し、未確定（planned／proposed）の行にだけ従来の「確認へ」「承認」を残した（今日タブから確定できなくなるのを避ける＝確定済みの行は 2 ボタン）。不要なら次便で除去。

## 裁定314（本便で確定・Agoora・2026-09-29）ボトル種商品の明細行に「キープ」

出典＝Agoora 指示（2026-09-29・便 X-8-1 で収載）。**本文（逐語）**:
「裁定314 ボトル種商品の明細行に『キープ』→伝票の顧客から選択→bottle_keeps に active 登録（開栓日＝営業日・ボトル名既定＝商品名・残量任意）→行を『キープ済み』。顧客未付与なら指名・席タブへ誘導」

適用＝便 X-8-10（2026-09-29・client のみ）: live に bottle_keep_register(p_store_id, p_customer_id, p_product_id, p_note, p_remaining_pct, p_expires_on, p_shelf_no, p_bottle_name, p_check_line_id)（0153 ★16・SECURITY DEFINER・authenticated／service_role）があるため client 実装。明細の kind='bottle' 行に「キープ」→ 伝票の顧客（check_customer_names）から選択・ボトル名（既定＝商品名）・残量（任意 0〜100）→ RPC（p_check_line_id＝その行＝行の注文者も同じ顧客になる）。顧客 0 人なら「指名・席」タブへ誘導。
★bottle_keeps に check_line_id 列が無い（RPC は行の customer_id を更新するだけ）ため、「キープ済み」の判定は「その行の注文者の active なキープに同じ商品があり、opened_at が伝票の開始以降」の近似。厳密な紐づけは 0158 で bottle_keeps.check_line_id を足すのが筋（起票候補）。opened_at は RPC の now()（営業中の登録＝営業日内）。

## 裁定315（本便で確定・Agoora・2026-09-29）確定済み・支払済み期の打刻修正は許可（凍結給与は不変・翌期の調整導線）（0158）

出典＝Agoora 指示（2026-09-29・便 X-8-1 で収載）。**本文（逐語）**:
「裁定315 確定済み・支払済み期の打刻修正は許可（理由必須・承認・監査は現行）。凍結給与は不変。給与画面の要対応に『確定後の打刻修正: cast・日・before→after』を積み、翌期の調整導線。差額の自動計算は第2期」＝0158。

適用＝未着手（mig 0158 ★起草に同乗）。

### 裁定315 追補1（便 AB の実装判断・2026-09-30 便 AC-0 で収載）

出典＝便 AB（2026-09-30・client 20c49d9）の報告で CC が示した判断 4 点を、便 AC-0 の指示で追補として収載。**本文**:
「315 追補1-1（AB-2）『翌期の調整へ』は翌期へ切替→プレビュー→当該 cast の明細を開き、調整入力に種別＝定額・備考『YYYY-MM 確定後の打刻修正（M/D 出勤 hh:mm→hh:mm）の差額』を prefill する。**金額は自動計算しない（手入力）**。翌期に cast の行が無ければメッセージで止める（lib/nox/payroll/attention.ts attentionCarryOf）。
315 追補1-2（AB-3）確定済み期の判定＝店側（今日タブ①・修正モーダル）は payroll_runs（RLS owner／manager）を cast の所属店×営業日の月で引く。/mine は cast が payroll_runs を読めないため**本人の給与明細（payslips）がある期＝確定済み**とみなす（isFinalizedDay・注記は info・赤エラーではない）。
315 追補1-3（AB-9）確定できない文言は notEndedMessageOf（期間終了（M/D）の翌日から確定できます）1 本＝ボタン注記・API 400・DB 由来（'period not ended'）の 400 で同文。rpcErrJa の 'period not ended' は日付を持てないため generic 文のまま（messages ms(2-8) が error 種別を要求）。
315 追補1-4（AB-4／AB-5）送り実費の本人・打刻端末発行が失敗しても、打刻（okuri=true）は残して『送りは店が締めで確定します』を出す（締め前モーダルの未発行に載る）。基本額が未設定（null／0）の店は発行しない。」

適用＝便 AB（2026-09-30）で実装済み（20c49d9・suite 53f42bd messages ms(2-18)〜(2-23)）。

## 裁定316（本便で確定・Agoora・2026-09-29）給与確定は期間終了の翌営業日から（API と DB でガード）

出典＝Agoora 指示（2026-09-29・便 X-8-1 で収載）。**本文（逐語）**:
「裁定316 給与確定は period_end < 今日の営業日のときのみ（期間終了の翌営業日から）。締め前は確定ボタン無効＋『期間終了（M/D）の翌日から確定できます』。プレビュー・内容確認は途中でも可。ガードは API と DB（payroll_finalize）」＝0158（API 側は本便 X-8-13）。

適用（API・client 側）＝便 X-8-13（2026-09-29）: lib/nox/payroll/finalize-guard.ts（純関数 finalizeGuardOf＝period_end < 今日の営業日のときだけ ok・文言「期間終了（M/D）の翌日から確定できます」）。app/api/payroll/finalize/route.ts は run_create の前に resolvePayrollWindow の periodEnd と bizDateOf(now, 店の biz_cutoff_hm) を比べ、未終了なら 400 'period not ended'（run を作らない）。payroll-board は確定ボタンを無効化し同じ文言を表示（プレビューは従来どおり可）。rpcErrJa に 'period not ended'。
DB 側（payroll_finalize のガード）＝0158。★0158 で DB ガードを入れると、verify-nox-payroll 等の fixture 期間（P＝2026-09 ほか未来期）で admin 直呼びの payroll_finalize が拒否される＝0158 の起草時に suite の期間を過去期へ寄せる／ガードの判定日を引数化する要検討（起草判断の材料）。

## 裁定317（本便で確定・Agoora・2026-09-29）退勤の送りは金額ダイアログで即時発行・締め前モーダルは確認＋未発行の残り

出典＝Agoora 指示（2026-09-29・便 X-9-1 で収載）。**本文（逐語）**:
「裁定317 退勤の送りは『送り』押下→金額ダイアログ（既定＝店設定 okuri_base_amount、無ければ同 cast の直近 transport 額、無ければ空欄必須）→変更可→確定で退勤打刻（p_okuri=true）＋transport_issue_bulk 1 件（idem＝punch id）を即時発行。日報締め前モーダルは『発行済み n 件・合計 ¥m』の確認＋未発行の残りのみ。店設定 okuri_base_amount の白名単は 0158」

適用＝便 X-9-3（2026-09-29・client のみ・DB 恒久変更 0・RPC 追加 0）:
(a) /shift 今日タブ（owner／manager の退勤）＝出勤記録セルの「退勤」の隣に「送り」（okuri_mode='actual' の店のみ・退勤と同じ活性条件）→ 金額ダイアログ（components/nox/okuri-out-dialog.tsx・既定＝lib/nox/shift/okuri-default.ts okuriDefaultAmountOf＝店設定 okuri_base_amount → 同 cast の直近 transport 額 → 空欄必須）→ 確定＝punch_proxy('out', p_okuri=true) → 戻りの punch id を p_idem_key にして transport_issue_bulk（1 件）。打刻成功・発行失敗は「退勤は記録しました。送りは未発行です」を表示＝okuri_today_summary（未発行のみ）に残り、締め前モーダルで発行できる。
(b) 日報の締め前モーダル＝「発行済み n 件・合計 ¥m」（当日営業日の transport・cancelled 除外）の確認＋未発行の残り（okuri_today_summary）の金額入力（現行）。actual 店で発行済み／未発行のどちらかが 1 件以上あれば開く。
(c) ★/mine（cast 本人の退勤）と kiosk 打刻は、本便では金額ダイアログ→即時発行を実装できない＝停止して報告:
  transport_issue_bulk は owner／manager 自店のみ（0157・'forbidden'）＝cast／kiosk からは必ず失敗する。kiosk は okuri_mode を読む経路も無い（起票87）。RPC 追加 0 の便では器が無い。
  /mine は現行（便 V）の「送り あり／なし」→ punch_self(p_okuri) のまま、あり のときは「送りの金額は店が締めのときに確定します」を表示（未発行として締め前モーダルに残る＝317 の失敗時の扱いと同じ帰結）。kiosk は現行どおり送りの口なし。
  0158 で (1) cast／kiosk からの送り発行の器（例: punch_self／kiosk_punch に p_okuri_amount を足し同 tx で transport を作る・または cast 自己発行 RPC）(2) kiosk_register_state／kiosk 打刻側に okuri_mode・okuri_base_amount（起票87）(3) okuri_base_amount の白名単、を起草判断にかける。

## 裁定318（本便で確定・Agoora・2026-09-29）時刻入力は HHMM／HH:MM／H:MM／HH を受けて HH:MM に正規化

出典＝Agoora 指示（2026-09-29・便 X-9-1 で収載）。**本文（逐語）**:
「裁定318 時刻入力は HHMM／HH:MM／H:MM／HH を受けて HH:MM に正規化（翌日 24〜47 も同様）・スマホは inputmode=numeric」

適用＝便 X-9-2（2026-09-29・client のみ）: lib/nox/time/hhmm.ts（純関数 normalizeHHMM＝HHMM／HH:MM／H:MM／HH（＋HMM＝900→09:00）→'HH:MM'・0〜47 時・全角の数字とコロンは半角へ・不正は null／HM_FORMAT_ERR＝「時刻の形式が不正です（例 2000・20:00）」）＋共通部品 components/ui/hm-input.tsx（blur 時に正規化表示・inputmode=numeric・maxLength 5）。
置換した自由入力の時刻欄＝打刻修正（components/nox/punch-correction-modal.tsx／app/mine/punch-correction-form.tsx）・確定シフトの時間（shift-board 調整モーダル タブ②）・必要人数の時間帯（shift-board）・その日に追加（day-add-panel）・シフト追加（shift-add-form）・希望提出（mine/wishes/wish-form）・遅刻連絡の出勤見込み（mine/attendance-form）。input type=time の欄（営業時間・料金帯・スタッフ枠・予約）は OS の時刻ピッカーのため対象外。
検証は正規化後＝requestArgsOf（打刻修正）は内部で正規化してから ISO 化（'9:00'・'2000' も通る）。旧文言「時刻は HH:MM（00:00〜47:59）で入力してください」「時間は HH:MM 形式で入力してください」は HM_FORMAT_ERR に統一。

**318 追補（2026-09-29・Agoora・便 X-10-1 で収載）**: 「時刻入力は入力マスク（数字のみ・最大 4 桁・':' 自動挿入・範囲外はその場で赤＋送信非活性）」。
適用＝便 X-10-3: components/ui/hm-input.tsx を入力マスクに置換（数字のみ・最大 4 桁・2 桁で ':' 自動挿入・5 桁目は無視・貼り付けも同形に整形・全角は半角へ・'9:30' は 09:30）。時 00〜47（開始欄は 00〜23）／分 00〜59 の範囲外はその場で赤＋文言「時は 00〜47 で入力してください」「分は 00〜59 で入力してください」。
送信の非活性は hm-input を使う全経路（打刻修正 2 面・確定シフトの時間・必要人数・その日に追加・シフト追加・希望提出・遅刻連絡）で lib/nox/time/hhmm.ts hmRangeErrorOf を見る。送信時の normalizeHHMM は残す（二重防御・blur に依存しない＝マスクが入力のたびに形を揃える）。純関数＝maskHHMM／hmRangeErrorOf／hmDigitsOf。


## 裁定319（本便で確定・Agoora・2026-09-29）cast 本人／kiosk からの送り発行は店設定 okuri_base_amount に固定（0158）

出典＝Agoora 指示（2026-09-29・便 Z-1 で収載）。次の裁定番号は 320。**本文（逐語）**:
「裁定319 cast 本人（/mine）と kiosk からの送り発行は店設定 okuri_base_amount に固定（変更不可・未設定なら発行不可＝締めで店が入力）。金額変更は manager／owner のみ」

適用＝未着手（mig 0158 ★6＝transport_issue_self／kiosk_transport_issue・★4＝set_store_profile の白名単 okuri_base_amount・★5＝kiosk_register_state に okuri_mode／okuri_base_amount）。client は 0158 手貼り後の便（/mine・kiosk の退勤で「送り」→ 固定額の確認→ 打刻＋発行）。裁定317 適用欄 (c) の「器が無い」をこの裁定で解く。

**319 追補1（2026-09-29・0158 起草判断の裁定・Agoora・便 Z-2b-1 で収載）**: 「0158 起草判断＝(a)(b)(c)(d)(e)(f)(g)(h)(j)(k) 起草どおり。(i) 改稿: 打刻端末用 kiosk_punch_state() returns jsonb(okuri_mode, okuri_base_amount)＝打刻端末の腕（kiosk_devices purpose='punch'・自店）のみ・B(f)」。
起草どおり確定＝(a) 前借りは settle_period を足さず既存の deduct_period を翌月へ／(b) daily_pays.settle_period は null 可（null＝営業日の月）／(c) adv_issue の戻りは uuid のまま・carried_to は daily_pay_issue の jsonb／(d) adv_issue_bulk にも同じ繰り下げ／(e) 要対応は新表 payroll_attentions・解決の理由は audit／(f) 'period finalized' の解除は punch_correction_request と decide・書込は apply／(g) 確定ガードは同キー再送と 'run paid' の後／(h) kiosk 発行は打刻端末・10 分以内・transport.created_by を null 可／(j) 送りは支払済みの期なら本人・kiosk とも 'paid period'／(k) ベース額 0 は未設定と同じ。
(i) 改稿＝kiosk_register_state の 2 キー（レジ端末用）はそのまま残し、打刻端末が送りの設定を読む経路として kiosk_punch_state() を新設（kiosk_punch と同じ端末認証・戻りは 2 キーのみ・STABLE・名簿 B(f)）。関数 283 → 288。
適用＝便 Z-2b-2 で docs/tmp/gen_0158.mjs／0158_template.sql 経由で改稿（★8 kiosk_punch_state・grants は ★9 へ・冒頭の起草判断を「319 追補1 で確定」に書換・検証文 8 文と期待値）。手貼りは Agoora。

**0158 適用欄（2026-09-29）**: 手貼り＝Agoora 2026-09-29 18:0x〜18:1x JST（貼付版＝改稿版 sha256 **7d2901359fd8fb24d075ae31da05e1e634284a48a465229b2cdd325d1fc82c6b**・1,484 行・109,345 B＝supabase/migrations/0158_settle_attention_okuri.sql・生成器 docs/tmp/gen_0158.mjs）。
事前突合＝docs/tmp/q0929_ag_0158.mjs（BEGIN…ROLLBACK・51 段 NG 0＝静的 5・md5／署名／proacl／列 7・★1 繰り下げ 9・★2 要対応 7・★3 確定ガード 4・★4 白名単 2・★5 レジ端末 1・★6 送り発行 10・★7 キープ 2・★8 打刻端末 1・検証文 1・ROLLBACK 後 2）。
適用後の検証（live 読取 2026-09-29T09:15:49.113Z・docs/tmp/q0929_post_0158.mjs・検証文 8 文）＝一致: 貼り先証明 orgs 3／md5 16 本（adv_issue f25d845d・adv_issue_bulk 0e2044cc・daily_pay_issue 7e9d29d0・daily_pays_of_run b81e8659・punch_correction_request 2588fd86・punch_correction_decide e5dc188e・punch_correction_apply 857dd4cf・payroll_finalize e402804d・set_store_profile 4f2e9f82・kiosk_register_state a4426533・bottle_keep_register e9028559・payroll_attentions_of 04d88b37・payroll_attention_resolve 01b27881・transport_issue_self 2eebb64f・kiosk_transport_issue 76412c7e・kiosk_punch_state 48300293）／不触 3 本（kiosk_punch b31ff8fa・payroll_mark_paid 409c9770・transport_issue_bulk 9d10c990）／
proacl 7 行（新設 5 本＝authenticated＋service_role・punch_correction_apply＝postgres のみ・payroll_finalize＝service_role）／列 3（bottle_keeps.check_line_id・daily_pays.settle_period・transport.created_by とも null 可）／payroll_attentions は RLS 有効・policy 1（payroll_attentions_select・SELECT）・grant authenticated＝SELECT のみ（anon なし）／関数 288・表 79・課金ゲート（'billing locked' を持つ関数）148 本。
手貼りの直後から、未終了の期で payroll_finalize を直接呼ぶ suite は 'period not ended' で赤（起票88・便 X-11 の f0 run 1 が rls で停止）＝便 AA-3 で fixture の期を過去月へ張り替え。

**0158 suite 追随（便 AA・2026-09-29）**: 名簿 A 148／B 140／288・起票88 の処置＝期の文字列は据え置き、確定の直前に run の凍結値 period_start／period_end を 2000-01-01 に置く（scripts/fixtures-f0.ts の endedRuns／ENDED_RUN_SQL・rls 9／payroll 24／ar-partial 2／reopen 1／carryover 2 箇所）＝指示の「期を過去月へ張り替え」とは別の手段（待遇プランの有効開始日・曜日・suite 間の期の住み分けを壊さないため・**9/30 Agoora 追認**）。collect の日払い読取は settle_period（null＝営業日の月）。verify:nox-0158 新設（51）。**f0 pin＝80 段 5,159**（2 連緑 18:49〜19:01／19:03〜19:15・golden 6 値不変）。起票91・92 を収載。
**便 AB 完了＝台帳の現在地（2026-09-30）**: HEAD **53f42bd**＝origin/main（0 0）・f0 pin **80 段 5,165**（2 連緑 11:00〜11:13／11:14〜11:26・golden 6 値不変）・Vercel success **11:28:06 JST**・messages **38**。0158 の client 追随（裁定312／314／315／316／317／319）は完了。次＝0159 事前読取（docs/tmp/0159_pre.md）→ ★指定 → 起草（スコープ＝324-6＋起票89・91・92 を 1 本）。 **目視（2026-09-30 便 D159-1）**: 9/30 Agoora 目視 OK＝0156 11 点・X-8〜X-11・便 AB。**便 X-12 の中身＝起票90・93・94（0159 client 便に同乗）**。
**無人便 L 完了＋0159 本番適用＝台帳の現在地（2026-09-30）**: 無人便 L 完了 HEAD **efc7f72**（X-12-1〜3・L-2-1〜4・L-3-1／2）・f0 **81 段 5,208**（2 連緑）・Vercel **13:24:43 JST**／0159 本番適用 **9/30 午後・時刻不明（Agoora 申告）**・sha **00ed3da283e2fd2cbb9ac9887d024819ba69408b39d1c3cdd19fa26add5bf4b7**・live 照合 all_ok（md5 5 本・proacl・列 18／CHECK 6／index 7・関数 290・表 79・'billing locked' 149・形 149・述語参照 150＝docs/tmp/q0930_post_0159.mjs）・名簿 **290**（A 149／B 141）。次＝0159 client 便（店舗設定 UI・STEP 3・明細表示）。
**0160 本番適用＝台帳の現在地（2026-09-30）**: 0160 本番適用 **9/30 午後・時刻不明（Agoora 申告）**・sha **d0a1ed21a21ab9312217d04a7fa75cbb5faf58ad734dbbde2c131e8b79fbef1e**・live 照合 all_ok（md5 12 本・proacl・新表 2 の列／policy／grant・reservations 21／shift_wishes 13／patterns 11 列・関数 296・表 81・set_cast_norm_self 不在・'billing locked' 154・形 154・述語参照 155＝docs/tmp/q0930_post_0160.mjs）・名簿 **296**（A 154／B 142）・**表 81**。次＝suite 張替え（便 P160-3）→ f0 2 連 → push → 0160 client 便 M1。
**便 P160 完了＋0161 本番適用＝台帳の現在地（2026-09-30）**: P160 完了 HEAD **06e04c7**＝origin/main（0 0・push 17:0x）・f0 **84 段 5,276**（2 連緑 16:36:11〜16:47:31／16:49:07〜17:03:35・golden 6 値不変・pin 張替え 7 suite＝grants 461／anon-guard 1045／rls 527／billing 53／customers-keep 32／demo-reset 34／0158 51・cast-norm-self 1・新規 3 suite＝mine-settings 9／reservation-request 12／cast-quota 9）・Vercel success **17:09:26 JST**・名簿 296（A 154／B 142）／0161 本番適用 **9/30 夕・時刻不明（確定＝Agoora 申告「不明」・便 M1-0）**・sha **b45e966180224778f08a26315c1a5df4975898dd298dafd16187d496616b7017**・live 照合 all_ok（17:26:03 JST・md5 5 本・proacl・kind CHECK 2 値・open_punch_ck・run_id null 可・部分 unique・関数 297・表 81・'billing locked' 154・述語参照 155＝docs/tmp/q0930_post_0161.mjs）・名簿 **297**（A 154／B 143）・**表 81**。次＝suite 張替え（便 P161-3）→ f0 2 連 → push → M1（v42 §10-2＋rpc-err 和文 3 種＋/mine 打刻カード 3 状態＝326 追補3）。
**便 P161 完了＝台帳の現在地（2026-09-30）**: HEAD **51b5ee3**＝origin/main（0 0・push 18:11）＝d4b0e01（0161 収蔵・名簿 297）／d1cd92c（裁定327＋追補1・0008 決定1 退役・v42 収蔵）／51b5ee3（verify 張替え＋新規 suite punch-sequence 12）・f0 **85 段 5,293**（2 連緑 17:43:21〜17:56:01／17:57:01〜18:10:36・golden 6 値不変・pin＝0158 51／daily-pay 34／rls 527／anon-guard 1047／grants 464／billing 53・新規 punch-sequence 12・逆テスト赤→緑）・名簿 **297**（A 154／B 143）・proof 関数 297／表 81・v42 収蔵 sha **7bed660fcd3b263602208ed4ba4c2624fea10caffae381107a2ca13f1cf46941**（10,674 B・92 行・提示値と一致）・Vercel success **18:13:20 JST**。次＝M1（0160 client 第 1 便＝mine_settings ヘルパ・店舗設定 UI・/mine 出し分け・打刻カード 3 状態・rpc-err 和文・注意行 open_punch）。
**便 M1〜M4 完了＝台帳の現在地（2026-10-01）**: HEAD **30bfb7e**＝origin/main（0 0・push 14:0x）＝7c6e6f3（M1 mine_settings ヘルパ・店舗設定 UI・打刻カード 3 状態）／626fabc（M2 /mine 再構成・ノルマ・お知らせ未読・勤怠一覧・87 段 5,324）／a6eea90（M3 予約申請・承認待ちタブ・88 段 5,337）／bcdc669・5639aad・4624059・30bfb7e（M4 シフト希望／休み希望・autoassign 候補反転・枠マスタ無効化・T6 契約確認の記録）・f0 **89 段 5,349**（2 連緑 13:35:12〜13:49:42／13:50:42〜14:07:25・golden 6 値不変）・DB 恒久変更 0（0001〜0161 適用済み）・教訓98（同一 tx の now() 固定＝打刻の順序不定→suite は clock_timestamp()）。追補6（M3）・追補7（M4）＝追認待ち。便 D0（裁定328・デモ環境の設計）＝docs のみ。
**便 P162 完了＝台帳の現在地（2026-10-01）**: HEAD **4dea3ba**＋docs（本行）＝origin/main（push 16:2x）＝666f8ca（0162 収蔵・名簿 302＝A 154／B 148・台帳 329 追補1・0162 の欄・裁定330／331）／4dea3ba（verify pin 張替え 7 suite＋新規 contract-ack 12）。f0 **90 段 5,402**（2 連緑 15:32:39〜15:48:08／16:00:53〜16:16:10・間の run4 は shift-bands の connection pool timeout＝既知フレーク型・golden 6 値不変）。proof 関数 302／表 82・0162 本番適用 10/1 時刻不明（Agoora 申告・live 照合 all_ok 05:54Z）。次＝M5-1〜4（スタッフ写真と契約確認の client）→ MC0（裁定330／331 の読取）。
**便 M5 完了＝台帳の現在地（2026-10-01）**: 便 M5-1〜4（裁定329＋追補1・326 追補7-6＝スタッフ写真と cast の契約確認の client）＝lib（staff-photo・mine/contract-ack・rpc-err・shift/staff-place）／client（UserChip「自分の情報」に本人の写真・/staff 編集 Modal に登録／差替え／削除・/casts 詳細に「写真を削除」・スタッフ枠の avatar・/mine 契約確認 gate）／verify（新規 staff-photo 12・nav nv(4-3) 張替え）。f0 **91 段 5,414**（2 連緑 16:27:17〜16:38:53／16:39:53〜16:51:05・golden 6 値不変）。仮決め 9 点＝docs/tmp/v43_pre.md（329 追補2 で追認を求める）。デモ写真＝docs/tmp/demo_photos/casts 38/38（staff 0/9）。次＝MC0（裁定330／331 の読取・収蔵）→ MC1。
**便 MC0＋MC1 完了＝台帳の現在地（2026-10-01）**: MC0＝09902cb（docs/handoff/mock/20261001＝正本モック 3 ファイル・master_map.md・setup_map.md）。MC1（裁定330 第 1 便・client のみ・DB 恒久変更 0）＝lib/nox/master/nav.ts を 3 層（群 4／入口 9／タブ）に・master-board＝4 パネル × 9 入口＋検索（在庫カードと発注推奨の KPI／警告は在庫画面へ）・master-subnav＝「マスタ ▸ 群 ▾ ▸ 入口 ▾」＋入口内タブ・pricing-board が ?tab= を初期タブに・旧 17 href は全部そのまま有効（redirect 不要＝resolveMasterNav が入口・タブへ解決）。verify＝新規 master-top 10・nav nv(5-1)〜(5-4) 張替え。f0 **92 段 5,424**（2 連緑 16:57:42〜17:13:15／17:14:15〜17:28:22・golden 6 値不変）。仮決め 9 点＝docs/tmp/v43_pre.md（330 追補で追認を求める）。次＝MC2（店舗設定の利用機能／店舗情報分割・データ管理の分離・キャスト会計の移動・席・卓／営業時間）。

**便 MC2 完了＝台帳の現在地（2026-10-01）**: MC2（裁定330 第 2 便・330 追補1／329 追補2 の適用・client のみ・DB 恒久変更 0）＝店舗設定を 2 タブ（?tab=features 利用機能＝報酬制度 9・売掛・機能の公開（owner）・勤務時間の計算基準・キャスト画面の設定／?tab=info 店舗情報）に・権限・情報管理（入口 href /master/cast-comp/register）＝キャスト会計の許可／データ管理（?tab=data）／機密情報の 3 タブ・報酬設定＝待遇プラン／控除・送り／ノルマ・料金・会計の内側ピル撤去（外側 ?tab の 1 本・「ルールで設定」は router.push）・/master/system の「機能の公開」タブ撤去（案内行＋リンク）・旧 href 17 本は alias で解決（新 route 0）・contract-ack 2 行目を 329 追補2 の文面に。verify＝master-top 14（タブ構成・alias・店舗設定 3 面・system に機能の公開なし・内側ピルなし）・nav nv(5-1)／(5-2) 張替え。f0 **92 段 5,428（2 連緑 15:22:07〜15:45:46／15:46:48〜16:04:32・RTT 60 ms で 1 走 18〜24 分・前日 10-01 の run1 緑 92 段 5,428 は不採用・10-02 の最初の 2 連は rls 固定具 prof1〜4 の残置（10-01 run2 の REST 劣化で teardown 無音失敗）で anon-guard 段35 が赤→同経路で除去して再走）**・golden 6 値不変。仮決め 9 点＝docs/tmp/v43_pre.md「MC2 の仮決め」（330 追補2 で追認を求める）。次＝便 W5-1（初期設定 v5 第 1 便）。

**便 W5-1 完了＝台帳の現在地（2026-10-02）**: W5-1（裁定331 第 1 便・client＋JSON のみ・DB 恒久変更 0・新 RPC 0）＝初期設定ウィザードを 6 ステップ（お店について／料金／商品／キャスト報酬／会計と運用／確認→次にやること・モック文言）に・業態 5 × 特徴 5（VIP 席の取り方／指名料／売上スライド／新人保証／達成ボーナス）→ テンプレ 6 種（lib/nox/setup/templates/v2.json＝正本モックの SRC 6 店・v1.json は廃止）を composeDraft（モック build() の写経）で組み立て・計画＝既存 RPC 17 本（set_store_profile／receivable_policy／pay_time_basis／receipt_profile／penalty_config／mine_settings／business_hours／biz_cutoff／seat／pricing／time_pricing／pricing_rule（VIP 専用 set＋extension・VIP 加算）／comp_plan（プランごと・sales_slide 3 段）／comp_component（達成ボーナス 1 段・plan id は実行時）／product_bulk_insert／set_product（back・本指名pt の上書き）／flag_set）・進捗バー・途中保存（localStorage 下書き＝補助・正は DB）・あとで設定（laterDefaultsOf）・完了画面「次にやること」（/casts・/shift・/master/stock・/master/system#devices）。C 5（インボイス登録日・締め日／支払日・内税・支払い方法・打刻方法）・D 5（ランク別指名料・多段ボーナス・売上歩合のみ・自動切替・スタッフバック）は SETUP_HIDDEN_ITEMS＝非表示。verify＝setup 79（JSON v2 sha・業態 5 の計画配列・特徴の分岐・写像・目安・あとで設定・次にやること・画面 pin・逆テスト 2 本）・payroll-view pv(7-5) 張替え。ブラウザ実描画＝6 STEP 遷移・console 0（書込は未実行）。f0 **92 段 5,445（2 連緑 17:07:28〜17:19:15／17:20:16〜17:40:46・S1 と同じ合成ツリー）**・golden 6 値不変。仮決め 21 点＝docs/tmp/v43_pre.md「W5-1 の仮決め」（331 追補で追認を求める）。次＝相談役の裁定（締め日／支払日・0164 の範囲・フロア機能）→ W5-2（B の結線）。

**便 D1 完了＝台帳の現在地（2026-10-02）**: D1（裁定328＋追補1・client＋scripts＋payload・DB 恒久変更 0・--apply なし）＝生成器 scripts/demo/gen-demo.mjs（nox_demo_all.json → 6 店の payload docs/demo/payload/<store>.json＝追跡・ID 固定 docs/demo/ids.json・先月＝月相対 {$m:-1,d}／当日＝{$rel:0}・率 bps→%・税前価格・保留 5 項目除外・代表伝票 6＋48 ヘッダ固定）／突合 scripts/demo/check-demo.mjs（BEGIN…ROLLBACK で仮 org に demo_org_reset・83 段・NG 5＝パッケージ側の不一致：NOIR シャンパン 108 本と在庫 sold（luna 1／noir 5／ace 5）と ACE 同伴 5 名が NOX の人数単価と同じ月次に収まらない→優先順＝売上 ±1%＞指名＞在庫＞ドリンク＞シャンパン で縮小・docs/demo/check_20261002.md）・代表伝票 6 件の total＝check_group_due＝expected・全 closed 伝票の三点一致・月次 6 店 ±0.2%・日次 ±0.8%・売掛残 4・ランキング上位 3・payload 1.2〜2.8 MB＝全店 1 MB 超→wipe→load を 3〜4 chunk に分割（splitPayload・RPC 不変）／create-demo-orgs 6 店化（--dry-run＝docs/demo/dry_run_20261002.md・DEMO_USERS 30 キー）／upload-photos（dry-run 47・casts 38 全結線・staff 代表 6 結線・--apply は D2＝sharp）／入口 /demo＝店 6 × 役割 4 ＋ 端末・入場 route（store／role・is_demo・staff→/register・kiosk→/kiosk・demo_entries へ 1 行＝表が無い間 no-op）・帯「デモ環境・毎日 06:05 に初期化」／デモ制限 5 種の所在を suite に列挙（demo-guard dg(6-1)〜(6-6)）／0163 起草＝supabase/migrations/0163_demo_entries_cron.sql（sha256 f5b8bc61…3530・9,887 B・104 行・突合 16 段 NG 0・pg_cron＋pg_net・demo_entries・demo_entries_purge md5 fdc33bb7・cron 8 job・Vault 手順 docs/demo/cron_setup.md・demo_org_reset 不触）。verify＝新規 demo-payload 52・demo-guard 24・demo-dateshift 18。f0 **93 段 5,506（2 連緑 19:28:58〜19:40:36／19:41:37〜19:55:08・新規 demo-payload 52・demo-guard 24・demo-dateshift 18）**・golden 6 値不変。仮決め 15 点＋不一致 5 点＝docs/tmp/v43_pre.md「便 D1」。次＝0164 起草（同便）→ Agoora（0163 手貼り・Vault・Auth 4 点・--apply・DEMO_USERS）→ D2。

**便 S1 完了＝台帳の現在地（2026-10-02）**: S1（裁定333・client のみ・DB 恒久変更 0・新 RPC 0）＝「スタッフから配置」を複数日化（人を選ぶ→カレンダーで複数日トグル（月送りで保持・過去日／定休日／配置済み／有効枠なしは選べず理由を表示）→枠（名前で束ね日ごとに有効版へ解決）と時刻を 1 回→右の「選択した日」一覧（×・N 日に配置）→ staff_shift_propose（＋override）を日ごとに順次・失敗は赤で残し成功分はそのまま）。旧 3 状態と 1 日画面は撤去（入口①は従来どおり）。verify＝staff-shift 82（段S1-1〜9 新規・N6-8 張替え・逆テスト 2 本）・picker 10・staff-photo 12・ui-tokens 新規 0・tsc 0・lint 0。f0 **92 段 5,445（2 連緑 17:07:28〜17:19:15／17:20:16〜17:40:46・S1＋W5-1 の合成ツリー・直前の run G／H は messages ms(2-1) の 1 段赤＝S1 モーダルの素の span 描画→裁定281-3 の型に差し替えて再走）**・golden 6 値不変（W5-1 と同じ合成ツリー＝仮決め 1）。仮決め 10 点＝docs/tmp/v43_pre.md「S1 の仮決め」。目視＝staff_shift ON の店で（NOX-VERIFY は OFF のためブラウザ未確認）。次＝W5-1 のコミット・報告。

**便 V 完了（v43 収蔵＋追補記入）＝台帳の現在地（2026-10-08）**: 前提照合＝HEAD c8a402e＝origin/main（rev-list 0 0・変更 0・未追跡＝scripts/demo/poc-record.mjs と docs/tmp（.gitignore）・0163／0164 は追跡済み＝f2573d4／c8a402e）・DB 恒久変更 0・DB 読取 0。V-0＝v43 収蔵（sha e4fbaab9…45ba・12,851 B・101 行＝提示値と一致・上の引き継ぎ欄）。V-1＝330 追補2／331 追補1／333 追補1／328 追補2／334 追補1／裁定335 を v43 §3 の逐語＋v43_pre.md の仮決め本文の転記で収載・docs/demo/check_20261002.md の NG 5 を仕様差でクローズ。V-2＝手貼り案内 docs/demo/handpaste_0163_0164.md（本番 ref hiqbfagmkrdpmlqhkmsu の URL 目視・sha／バイト／行・0163→Success→0164・proof＝cron.job 8／demo_entries／stores 列 7／md5 2e7b4963／関数 303／表 83・Success 時刻の控え）。コミット「docs: v43 収蔵・追補」＝docs のみ（コード・mig 不触・f0 不走＝裁定256）。★0163／0164 の行数は `wc -l` では 103／457（末尾改行あり・CR 0）・台帳と v43 の 104／458 は split('\n') の数え方（0162 の 523 は wc と一致）＝sha とバイト数が一致しているため不一致ではない（手貼り案内に両方を記す）。次＝Agoora 手貼り（0163→0164）→便 P163（収蔵・名簿・pin 張替え・f0 2 連・push）→D2。

**便 P163 完了＝台帳の現在地（2026-10-08）**: 0163／0164 本番適用（10/8・時刻「不明」）後の収蔵便。門番＝REST 認証付き 200×3（806／60／26 ms）・DB 実行時間 0.05〜0.09 ms（初回は cold で 7.8 ms→再測）・RTT 9 ms。live 照合 all_ok（02:20:44Z＝0163／0164 欄）。名簿 **303**（A 154／B 149・B(a) +demo_entries_purge）・proof 関数 303／表 83。payload 再生成（columns 取り直し→gen-demo→check 83 段 NG 5＝仕様差のみ・docs/demo/check_20261008.md）＝demo-payload sha 6 店更新。pin 張替え 7 suite＝grants 481／anon-guard 1055／billing 53／0158 51／store-profile 82（⑪ +24）／store-systems 30（ss(4-0) 白名単 26→33＝run1 で検知→張替え）／demo-payload 52（setup 79・demo-reset 34 は不変）。f0 **93 段 5,533**（2 連緑 11:38:10〜11:48:19／11:49:16〜12:01:45・golden 6 値不変 5170／5931・源泉 125802・net 1208848・55233・rate-back 64・張替え前の run は store-systems で赤＝不採用）。教訓103 採番・裁定335 追補1。コミット「chore(P163): 0163/0164 収蔵・名簿303・pin 張替え」（docs 4＋payload 8＋scripts 8）。次＝push→Vercel→D2（--apply は Agoora の Vault 2 本・Auth 設定 4 点の完了報告後）。

**便 D2-a 完了（デモ投入の直前確認・読取のみ）＝台帳の現在地（2026-10-08）**: DB 恒久変更 0・--apply なし。A-1＝supabase.auth.signUp の経路は app／lib／scripts に 0 本（owner 新規＝scripts の admin.createUser と Agoora 手作業・cast 招待 app/api/cast/invite/route.ts:88・staff 追加 app/api/staff/create/route.ts:66・kiosk 発行 app/api/kiosk/provision/route.ts:137＝全て admin.createUser・メール変更 lib/nox/staff/update-email.ts:90＝admin.updateUserById・デモ入場 app/api/demo/enter/route.ts:67／72＝admin.generateLink(magiclink)→verifyOtp（既存ユーザー）・ログイン app/login／kiosk／kiosk-register＝signInWithPassword）＝**「Allow new users to sign up」は OFF にして良い**。A-2＝24 時間の器なし（demo_entries は at のみ・入場 route は cookie 期限を持たない・middleware は user 有無のみ）＝D2-b で client のみ追加（入場 route が httpOnly cookie nox_demo_until＝入場＋24h を置き、middleware で期限切れなら signOut→/demo?expired=1・/demo に文言・suite demo-guard に段）・mig 不要。**A-3＝Vault の nox_demo_reset_url がプレースホルダのまま（host「<本番の NOX ホスト>」・path /api/cron/demo-reset・41 文字）＝cron 8 job は Vault 名を正しく参照しているが URL が無効→Agoora が vault.update_secret で https://nox-kappa-eight.vercel.app/api/cron/demo-reset に差替え（docs/demo/cron_setup.md §2 を実ホストに書換え）**。nox_cron_secret は 29 文字（Vercel CRON_SECRET との一致は cron_setup §3 の手動 1 本＝D2-b で疎通）。本番ホスト実在＝/demo 200・/api/cron/demo-reset 無認証 401。A-4＝create-demo-orgs --dry-run 6 店（org 6・org_billing 6・auth 30・users 24・DEMO_USERS 30 キー「<店>:<owner|manager|staff|cast|kiosk>」＝uuid）・upload-photos --dry-run 47 件（casts 38 全結線・staff 9＝結線 6・結線先なし 3）・sharp＝next 経由の推移依存 0.34.5 を devDependencies に明示（裁定335・package.json +1・lock 7 行・インストール差分 0）。次＝Agoora が Vault URL 差替え＋②OFF→相談役 GO→D2-b。

**便 D2-b 完了（デモ 24h cookie・create-demo-orgs --apply・写真投入）＝台帳の現在地（2026-10-08）**: B-0＝Vault nox_demo_reset_url の host＝nox-kappa-eight.vercel.app（Agoora 差替え 04:39Z・Vercel Production と一致・/demo 200）。B-1＝328 追補4（上）＝lib/nox/demo/session.ts 新設・入場 route の cookie・middleware の期限判定・/demo の文言＋DemoExpiredNote・demo-guard dg(7-1)〜(7-3)（24→27）・付随＝afterResetHooks の写真再打刻（dp(6-5)）と upload-photos --apply（dp(6-3) 張替え・demo-payload 52→53）。dev で /demo と /demo?expired=1 を目視（文言 2 行・console 0）。B-2＝create-demo-orgs --apply（ref hiqbfagmkrdpmlqhkmsu）＝live orgs +6（NOX-DEMO-MUSE 216ffeec／LUNA 8a7cf47f／NOIR 2f3ba3db／ACE 7f5eab4b／LILY d4e55f95／NEST 049a5a76）・org_billing +6（active）・auth.users +30・users +24・DEMO_USERS 30 キー（uuid のみ・報告に貼付・Vercel env Production・Sensitive は Agoora）。B-3＝upload-photos --apply --casts --staff＝Storage cast-photos に 44 オブジェクト（casts 38＋staff 6・結線先なし 3 は未投入・各店 6〜9）・users.photo_updated_at 6 打刻・casts は行なし（payload の再生前）＝初回 reset 後に afterResetHooks が打刻。f0 **93 段 5,537**（2 連緑 13:48:31〜13:59:39／13:59:50〜14:14:39・golden 6 値不変）。コミット「feat(D2-b): demo 24h cookie・demo orgs 6 店・写真 47」。次＝Agoora が DEMO_USERS を Vercel env（Production・Sensitive）に入れて Redeploy→便 D2-c（cron 疎通 cron_setup §3 手動 1 本→手動巻き戻し 1 回→報酬参考 13,648,300 の突合→/demo 4 role 目視の案内）。

**便 D2-c 完了＝D2 完了＝台帳の現在地（2026-10-08）**: 実測は 328 追補5 の欄。到達＝デモ 6 店が本番で稼働（入場 30 ボタン・初回 reset 済み・写真 38＋6・cron 8 job＝Vault 2 本とも実値・CRON_SECRET 一致・24h cookie）。**残課題**＝①NOIR の給与プレビュー 500（get_cast_sales 8.6 s＞8 s＝起票候補・第 1 期）②報酬参考 13,648,300 は算術参考値で一致しない（仕様差・gen_plan §4 の ±1,000 円は撤回候補）③手動 reset は memberships 後のみ（初回は cron route）＝docs/demo/cron_setup.md §3 に注記要。教訓104 候補（CC 提案・採番は相談役）＝下。コミット「docs: D2-c 疎通・巻き戻し・突合」。次＝Agoora の /demo 目視（docs/demo/visual_check_20261008.md）→X-13→W5-2。

**教訓104 候補→教訓104 で採番（便 G1・2026-10-08）**: 手順書の例文に角括弧のプレースホルダを残さない＝「貼る値／出どころ」を別表にし、投入後は name だけでなく値の形まで確認する。 経緯＝docs/demo/cron_setup.md §2 の例文 `'https://<本番の NOX ホスト>/…'`／`'<Vercel env CRON_SECRET と同じ値>'` が 2 本ともそのまま Vault に投入された（便 D2-a で URL・便 D2-c で secret を検知＝cron の 401）。name の存在確認（vault.secrets 3 行）では検知できず、値の形（ホスト名の抽出・長さ・ASCII・`<` 始まり）の読取で初めて分かった。運用＝①手順書の SQL は実値で書くか、値の欄を空にして「貼る値／出どころ（Vercel env の名前・ダッシュボードの場所）」を直前の表に分ける②投入後の確認クエリは値を出さずに形を返す（length・正規表現・host の substring）を標準にする③CC は手貼り依頼の報告に「形の確認クエリ」を同梱する（handpaste 案内の型に追加）。

**便 G1 完了（起票100 読取・改善案）＝台帳の現在地（2026-10-08）**: DB 恒久変更 0（計測は tx 内・rollback・f0 走行外）。**G-1 計測**（NOIR・owner JWT 文脈・timeout off・explain (analyze, buffers)）＝下表。最大ノード＝alloc→ranked→parts→sales_by_day の GroupAggregate／Sort 鎖（1 か月 8,327 ms＝全体の 99.6%）で、その下で `groups` の check_group_due が行ごとに再評価されている（inline 化）。SubPlan／InitPlan 0・RLS 述語なし（SECURITY DEFINER）・index は使用済み。

| 範囲 | get_cast_sales wall | 本文 explain | due=0 の同クエリ | (check,pay_group) | groups MATERIALIZED |
|---|---|---|---|---|---|
| 1 週間（09-01〜07） | 907 ms | 751.6 ms | 3.6 ms | 124 | 17.1 ms |
| 2 週間（〜14） | 2,137 ms | 2,102 ms | 8.7 ms | 246 | — |
| 1 か月（〜30） | 8,308 ms | 8,359 ms（Buffers 1,412,836） | 30.6 ms | 501 | **95.5 ms**（Buffers 7,931・呼出 501 回） |

**G-2 切り分け**＝③の変種（N+1 型＝CTE inline による check_group_due の再評価）。①index 不足ではない（due=0 で 30 ms・index scan 使用）②RLS 述語ではない（SECURITY DEFINER＝定義者で実行・SubPlan 0）。案: **A（推奨）＝0165 で cast_sales_aggregate の `groups as (` を `groups as materialized (` に（1 語・PG17・結果不変・期待 1 か月 ≈ 100 ms＝87 倍・mig 要（CREATE OR REPLACE・写経元 live f765c36a・差分 1 語）・名簿不変（B(a) 内部ヘルパー・ACL postgres のみ不変・関数数 303 不変）・pin＝md5 控え無し（autocharge／r2b／rls は挙動 pin＝golden 不変で証明）・demo_org_reset 不触）**。B＝check_group_due の本体を集合演算として CTE に展開（関数呼出をやめる）＝大改修・二重定義の保守負担・不採用。C（G-3・DB 不変）＝lib/nox/payroll/collect.ts で窓を 7 日ずつに分割して get_cast_sales を複数回呼び連結（行は cast×biz_date＝重複なし・slide 'next' の前月窓も同様）＝月 4〜5 回 × 0.75 s ≈ 3〜4 s で 8 s 内だが超線形のため密度 2 倍の店で再発＝暫定ゲートとしてのみ妥当・A の後は不要。**0165 の骨子（起草はしない）**＝単一 tx／冒頭コメント（名・翻訳元 0014 系・検証クエリ）／cast_sales_aggregate を live 本文の写経＋1 語（materialized）で CREATE OR REPLACE（署名・STABLE・SECURITY DEFINER・search_path 不変）／grant 文なし（内部専用＝4 ロール revoke 済みを再掲 revoke で保全）／検証＝md5 新値・`explain (analyze) select * from cast_sales_aggregate(NOIR, '2026-09-01','2026-09-30')` が 200 ms 未満・関数 303／表 83 不変／f0 golden 6 値不変（cast-stats／payroll／r2b／autocharge）。docs＝教訓104 採番・328 追補6・起票100。コミット「docs: G1 読取・起票100」。次＝相談役の裁定→便 G2（0165 起草・突合・手貼り案内）。

**便 G2 完了（0165 起草・突合・手貼り案内）＝台帳の現在地（2026-10-08）**: DB 恒久変更 0（突合は tx 内 rollback・f0 走行外）。裁定336＝案 A を収載。0165＝sha 75be081a…59b0・7,756 B・131／130 行・突合 13 段 NG 0（md5 e232dac8・explain 82.6 ms・get_cast_sales 8,749→127 ms・行 147／Σ 9,099,065／署名 71b0a188 不変・303／83・ACL 不変）。0158 に s-2b（過渡 pin・単独走 52 緑）。手貼り案内 docs/demo/handpaste_0165.md（結論 3 行・形の確認クエリ・proof は 9＝本番 3＋デモ 6）。f0 不走（mig 起草＋pin 追加＝単独走 1 本）。コミット「feat(0165): cast_sales_aggregate materialized 起草（裁定336・起票100）」。次＝Agoora 手貼り→便 P165（live 照合・収蔵・0158 を e232dac8 に絞る・f0 2 連・push）→NOIR 給与プレビューの目視で起票100 クローズ。

**便 P165 完了（0165 収蔵・pin 確定・起票100 live 200）＝台帳の現在地（2026-10-08）**: 0165 本番適用（10/8・時刻「不明」）後の収蔵便。P-1 live 照合 all_ok（explain は初回 311 ms cold→68〜73 ms・get_cast_sales 85 ms・署名 71b0a188 不変・303／83・ACL 不変）。P-2＝6 店 preview 200（NOIR 7,134 ms・gross 5,497,431）。P-3＝0165 欄（適用済み）・教訓105 採番・起票100「0165 適用済み・目視クローズ待ち」・328 追補5 の表に NOIR 実値。P-4＝0158 s-2b を e232dac8 の 1 値に（単独走 52）。f0 **93 段 5,538（2 連緑 15:50:43〜16:09:14／16:09:39〜16:26:29・最初の run（15:37:20〜15:50:12）は rate-back の「指名料行: upstream request timeout」＝PostgREST ゲートウェイのタイムアウト型フレーク＝門番再測（REST 200×3・Execution 1.4〜2.5 ms）後に再走・不採用）**（golden 6 値不変）。コミット「chore(P165): 0165 収蔵・pin 確定・起票100 live 200」。次＝Agoora が /demo NOIR owner で給与プレビュー（2026-09）を目視→起票100 クローズ→目視 NG の束ね（X-13）→W5-2。

**便 X-13a 完了（目視 NG 1〜10＋12／14・0166 起草）＝台帳の現在地（2026-10-08）**: DB 恒久変更 0（0166 は起草・突合のみ・デモ org の reset は可）。
R-1 読取＝①X-13-6 の原因＝casts-board の源氏名 draft（profEdit／profName／profJoined）が「編集」押下時にだけ初期化され、モーダルの ×／別キャスト選択で**リセットされない**（再現＝みさきを開く→編集→×→あかりを開く＝編集フォームが「みさき」のまま）→処置＝sel 変更で useEffect が編集を閉じ draft を空に。②X-13-9＝タブ表示は flag_enabled(key, store)（店舗行→org 行＝会社の既定→false）を shift-board（staff_shift）／report-board（reopen_flow）が読む・payload に feature_flags が無かった→gen-demo が org 既定（store_id null・enabled true）2 行を 6 店に投入。③写真 UI の所在＝本人側 app/mine/photo-card.tsx（cast）・components/ui/header-chips.tsx（スタッフ「自分の情報」）／店側 casts-board（旧プレビュー付きモーダル）・staff-board（直接 pick）＝2 型→共通部品 components/ui/photo-edit.tsx（直接 pick 型）に統一。★デモ org は 328 ④で導線を隠していた＝Agoora が LUNA 等で「写真を変更」を見なかった理由→「表示するが無効（理由を表示）」に変更（dg(6-4) の useIsDemo pin は維持）。
実装＝X-13-1 レジ 指名・席タブの並び 指名→分配率→顧客→紹介→席・1 人は分配率を「100%」に畳む（種別／同伴のトグルは残す）／X-13-2 自分の情報＝メール非表示（PC・スマホ）・案内 1 行は残す・≤900 は Modal の既存シート／X-13-3 キャスト別ノルマ目標＝表（1 人 1 行・列 6・単位固定・3 桁区切り）＋チェック複数選択→「選択した N 人にまとめて入力」（空欄は変えない・期間の初期値＝当月・set_cast_norm 6 引数のまま・Picker 撤去＝picker suite −1）／X-13-4 スタッフ編集＝名前の横に PhotoEdit／X-13-5 キャスト詳細＝ヘッダー写真の下に PhotoEdit 常時（旧モーダル経路撤去）／X-13-6 draft 初期化／X-13-7 商品バック列＝率 0・4 段階すべて 0 は「—」・値ありは本／場内／同伴／フリー・22 字超は「4段階 ▸」で展開／X-13-8 0166 起草＋client（一覧「—」・レジ残数なし・在庫画面の対象外・商品編集に「在庫を管理する」＝既存商品のみ・RPC 不在は和文）＝列が無くても動く（型は optional・register の select 追加は X-13b）／X-13-9 payload＝feature_flags 2 行＋products.track_stock true→gen-demo→check 83 段 NG 5（仕様差）→6 店 reset（cron route 200）＝**ライブの flag＝push（ed0cfe9）→Vercel success 後に 6 店を再 reset（cron route 200）→owner JWT の flag_enabled が **6 店とも staff_shift true／reopen_flow true**（org 既定 2 行・写真打刻 38 も再現）。★本番 route はデプロイ済み payload を読む＝push 前の reset では 0 行だった（payload 変更は push→Vercel の後に reset する＝恒久注意）**／X-13-10 利用機能の説明文＝店長は「機能の公開」なし／X-13-12 給与 月次一覧の空状態＝店舗・期間を選んで「先月のプレビューを開く」（既定＝先月）／X-13-14 月別の期間候補＝当月＋過去 12 か月（run 不問・確定済みに ✓確定済）＝lib/nox/payroll/list-periods.ts。
X-13-13（デモの finalize hook＝afterResetHooks の payroll 正規経路）＝**X-13b に送る（本便は台帳に記すのみ）**。
suite＝新規 verify-nox-x13 **24**（register-nom 3／header-sheet 2／quota-table 3／staff-photo 2／cast-photo 3／products-back 2／inventory-track 3／demo-flags 2／store-settings 1／payroll-periods 2／payroll-empty 1＝f0 94 段目）・張替え staff-photo 12（sp(3-1)(3-2)＝PhotoEdit）・picker 10（13 箇所／11 ファイル）・demo-payload 53（_report sha 自動追随）。payload sha 6 店＝muse 7e9eb152／luna a7898b51／noir bafdeb2f／ace 432690f5／lily 28d5a80a／nest 88676b09（表 +1＝feature_flags）。dev 目視＝給与一覧の空状態（候補 13・リンク /payroll?store=&period=2026-09）・ノルマ表＋まとめて入力・バック列の展開（本 7,000／場内 6,000／同伴 6,000／フリー 5,000）・console 0（キャスト／スタッフのモーダルは suite pin＋tsc）。f0 **94 段 5,562（2 連緑 16:56:54〜17:18:48／17:19:08〜17:37:58・新規 x13 24・staff-photo／picker 張替え）**（golden 6 値不変）。コミット「feat(X-13a): 目視 NG 1〜10（0166 起草）」。次＝Agoora 0166 手貼り→便 P166／X-13b（名簿・pin・track_stock の payload・register select・finalize hook・目視再確認）→W5-2。

**便 P166／X-13b 完了（0166 収蔵・名簿 304・X-13-11・track_stock payload・finalize hook）＝台帳の現在地（2026-10-08）**: DB 恒久変更 0（デモ org の reset・finalize は実施）。B-1 live 照合 all_ok（0166 の欄）。B-2 収蔵・名簿 304・328 追補7・恒久注意。B-3 pin 4 本＋store-systems 単独走 緑（billing 53／anon-guard 1057／grants 483／0158 53／store-systems 30）。**X-13-11**＝globals.css に --nox-bnav-h（64px）を置き、≤900 の .nox-mainarea（従来 padding 20px＝下部タブに最下段が隠れる原因）と ≤641・/mine の .nox-main の下余白を「var(--nox-bnav-h)＋余白＋env(safe-area-inset-bottom, 0px)」に＝suite layout-bottom 10（f0 95 段目・6 画面は (manage) 配下）。**B-5 track_stock**＝register の select に track_stock・payload＝グラス物（accounting_class drink＝キャストドリンク・ビール・ウイスキー・サワー・ソフト・カクテル・ショット・ワイン glass）を false＝**74／138 件**（muse 8／luna 9／noir 9／ace 8／lily 18／nest 22）・シャンパン／ボトル／フードは true（source の stock_tracking は drink の 7 件が true だが X-13b の規則で false＝仕様差として記録）→gen-demo→check 83 段 NG 5→payload sha＝muse 8c33084e／luna 8eff74d7／noir 04d1983e／ace f4fdc9c7／lily 777d507d／nest efb2e8ae。**B-6 X-13-13 finalize hook**＝afterResetHooks に finalizePrevMonthForDemo（先月＝bizDate の前月・demo owner の magiclink をサーバ内で消費した owner 文脈で payroll_run_create→computePayrollDraft→payroll_finalize（service）・冪等＝finalized／paid の run があれば skip・失敗は audit 'demo.finalize.failed'・写真 hook と reset は止めない）・payslips の形は lib/nox/payroll/finalize-payslips.ts で /api/payroll/finalize と共通。所要＝ローカル計測 1 店 1.0〜2.2 秒・6 org 合計 10.6 秒（cron の 2 分間隔に収まる＝別 job に分けない）。★発見（起票候補）＝lib/nox/payroll/collect.ts の `.in("check_id", 全件)` が閉じ伝票 ~400 件超で URL 16 KB 超→fetch が HeadersOverflow（UND_ERR_HEADERS_OVERFLOW）＝「会計明細: TypeError: fetch failed」（LUNA 458 件で再現・MUSE 278 件は可）→150 件ずつに分割（意味不変・payroll／payroll-csv／rate-back／labor-cost 緑）＝本番でも月 400 伝票級の店で給与プレビュー／確定が落ちる経路だった。**B-7**＝push（94a6a81）→Vercel success 18:01:23 JST→6 店 reset（200・route 4.7〜24.7 秒＝hook 込み）→live＝track_stock false 74（店別 8／9／9／8／18／22）・payroll_runs 6 店とも 2026-09:finalized（payslips 38）・給与 月次一覧に先月行・flag 2 本 true・写真 38・demo.finalize.failed 0。X-13a の 12 件＋X-13-11＝**本番反映・目視再確認待ち**（Agoora）。f0 **95 段 5,577（2 連緑 18:03:28〜18:18:18／18:18:31〜18:31:40・新規 layout-bottom 10・anon-guard 1057・grants 483・0158 53・billing 53・x13 24）**（golden 6 値不変）。コミット「feat(P166/X-13b): 0166 収蔵・名簿304・X-13-11・track_stock payload・finalize hook」。次＝Agoora の目視再確認（X-13 の 14 件＋スマホ下余白）→W5-2。

**便 X-13c 完了（デモ 6 店の差別化・全ドリンクバック・必要人数と 14 日分シフト＝X-13-15／16）＝台帳の現在地（2026-10-08 夜）**: DB 恒久変更 0（デモ org の reset は実施）。**仮決め 13 点＝docs/demo/store_profiles_20261009.md §3（Agoora が明朝に表へ赤入れ→X-13d で反映）**。正本（定数）＝scripts/demo/profiles.mjs（PROFILES・sysSettingsOf・backOf）＝gen-demo と suite demo-profiles（53・f0 96 段目）が同じ定数を読む。
C-1 表＝業態テンプレ 5 種（キャバクラは LUNA 中／ACE 大の 2 店・NOIR ラウンジ・MUSE スナック・LILY ガールズバー・NEST バー）／報酬制度の組み合わせ（時給＋バックのみ MUSE・NEST／ノルマ LUNA・NOIR・LILY／達成ボーナス LUNA・ACE／ポイント NOIR／売上スライド ACE）／バック型（率％ MUSE 高・LILY 中・NEST 低／4 段階 LUNA 中・NOIR 高・ACE 中）／価格帯（現行の札）／運用（計算基準 実打刻 4・確定シフト NOIR／LILY・送り LUNA 1,000／NOIR 1,500／ACE 1,000・売掛 3 店 顧客のみ・締め解除 3 店・キャスト確認 NOIR／ACE）／規模（現行）。差分列＝同 md §2。
C-2（X-13-15）＝全ドリンクに商品バック＝**MUSE 20/20・LUNA 20/22・NOIR 23/25・ACE 17/19・LILY 21/23・NEST 26/29**（残り＝フードのみ・MUSE はフードにも 10%）。率型は銘柄別 ±2pt（10〜30）・4 段階は価格×率（本＞場内＞同伴＞フリー・100 円単位・キャストドリンクは定額）。
C-3（X-13-16）＝staffing_needs 7（曜日別・終日・金土 +1・日曜定休 0）／当週 7 日の確定（キャスト＝日ごとの人数パターンで充足 MUSE・LUNA・LILY／不足 NOIR・ACE・NEST・当日は on_duty 込み）／翌週＝shift_periods open（締切 R+3）＋希望 pending／accepted（accepted は仮シフト proposed）／スタッフ＝枠 2（早番・遅番）・当週 confirmed 11・翌週 proposed 5・希望 7（休み希望 1）。★FK＝staff_shift_patterns／staff_shifts の created_by・confirmed_by は memberships(id)（users ではない）＝突合で検知→修正。
C-4＝gen-demo→check-demo **89 段・NG 5（仕様差 5 のみ）**→payload sha＝muse 22be973e／luna 31f6a49b／noir 6385a446／ace 8efa97fd／lily 82a8ad6b／nest b383ab04（表 33〜39）→push（db5f6ca＋5f8cb1f＝profiles.mjs の型宣言・★最初の push は tsc 赤のまま＝Vercel failure→型宣言で success 18:45:56）→6 店 reset（200・hook 込み 7〜20 秒）→live＝バック 127/138・needs 7×6・当週 confirmed 25〜35／仮 5〜8／希望 pending 9〜15／期間 2／スタッフ 16／枠 2・runs 6 店 finalized・flags（reopen は店どおり）・写真 38・cast_norms 21（3 店）・達成ボーナス 2・demo.finalize.failed 0。
suite＝demo-profiles 53（新規）・check-demo +1 段・x13 demo-flags pin を店別 reopen に・payload 系 4 本緑。f0 **96 段 5,630（2 連緑 18:48:26〜19:03:16／19:03:29〜19:1x・新規 demo-profiles 53）**（golden 6 値不変）。コミット「feat(X-13c): demo 6 店の差別化・全ドリンクバック・必要人数と 14 日分シフト」。次＝Agoora が表に赤を入れる→X-13d で反映→W5-2。

**便 V44 完了（v44 収蔵＋裁定337／338・恒久注意 18〜20・X-13 台帳）＝台帳の現在地（2026-10-09）**: 前提照合＝HEAD 817e423＝origin/main（rev-list 0 0・変更 0・未追跡＝scripts/demo/poc-record.mjs と docs/tmp（.gitignore）・0163〜0166 は追跡済み）・DB 恒久変更 0・DB 読取 0（V-2 無人 reset の読取は Agoora の GO 待ち＝本便に含めず）。V-0＝v44 収蔵（sha 93ac76ee…6d21・14,494 B・103 行＝提示値と一致・引き継ぎ欄）。V-1＝裁定337／338 を v44 §3 の逐語で収載（裁定336 の上）・恒久注意欄に 18〜20・次番号は最大番号で確認（裁定 336→次 339・起票 100→次 101・教訓 105→106／107 は候補）。V-1b＝docs/demo/x13_ledger.md（v44 §4 の #1〜22・状態列つきを転記）。教訓106／107 は本文案を報告に貼付（採番は相談役）。コミット「docs: v44 収蔵・裁定337／338・X-13 台帳」＝docs のみ（コード・mig 不触・f0 不走＝裁定256）。次＝Agoora の無人 reset 確認（§5-0）→V-2 読取→Vercel Pro＋hnd1→読取便（ホスト不変・env 5 本・cron route 200・/demo 4 role 200・6 店 preview ms）→X-13d。

**便 V44 続き完了（V-2 初回無人 reset 読取＋教訓106／107 採番）＝台帳の現在地（2026-10-09）**: 前提照合＝HEAD abda9c5＝origin/main（0 0・変更 0・未追跡 poc-record.mjs のみ）・DB 恒久変更 0・DB 読取＝V-2 の SELECT のみ（docs/tmp/q1009_v2_reset.mjs／_d.mjs・default_transaction_read_only）・f0 不走。**V-2 実測（2026-10-09 JST）＝初回無人 reset OK**: (a) cron.job_run_details 8 本すべて succeeded（purge 05:15:00／reset muse 06:05・luna 06:07・noir 06:09・ace 06:11・lily 06:13・nest 06:15／retry 06:35・return_message '1 row'）。(b) net._http_response 7 本すべて status_code 200・timed_out false・error_msg null（6 店＝ok true・mode wipe+load・chunks muse 3／luna 3／noir 3／ace 3／lily 4／nest 4・retry＝count 6・6 店とも skipped 'already reset today'）。★created は要求時刻（分 +0.3 秒）で応答時刻ではない＝所要秒は start_time→demo_reset_at／finalized_at で測る。(c) audit demo.reset 26 行（wipe 6＋load 20＝chunk 数と一致）・demo.reset.failed 0・demo.finalize.failed 0（finalize hook は失敗時のみ audit＝成功は payroll_runs で証明）・demo.entries.purged 0（30 日超の行なし＝削除 0 件は audit を書かない仕様・0163）。(d) 6 org の demo_reset_at＝10/9 06:05:08／06:07:05／06:09:07／06:11:06／06:13:10／06:15:13＝wipe+load 8／5／7／6／10／13 秒・payroll_runs 2026-09 finalized 6（06:05:11／06:07:17／06:09:11／06:11:11／06:13:13／06:15:17＝起動から 11／17／11／11／13／17 秒）・写真打刻 casts 38/38・staff（users.photo_updated_at・memberships→stores 経由）6。(e) cron.job 8（purge 1＋reset 6＋retry 1・once の残骸なし・全 active）。docs/demo/cron_setup.md 末尾に「初回無人 reset OK」1 行。V-3＝教訓106（push 前に tsc）・107（PostgREST .in() 150 件分割）を V44 報告の本文案の逐語で教訓欄（教訓105 の上）に採番・恒久注意欄に「（候補）」表記は無し（v44 §10 のみ）＝変更なし・次＝教訓108。コミット「docs: 無人 reset 初回読取・教訓106／107」＝docs のみ（f0 不走＝裁定256）。次＝Agoora の Vercel Pro＋hnd1→読取便（ホスト不変・env 5 本・cron route 200・/demo 4 role 200・6 店 preview ms）→X-13d。

**便 VP 完了（Vercel Pro＋hnd1 移行後の読取）＝台帳の現在地（2026-10-09）**: Agoora 報告＝agoora projects（Hobby）→Pro チームへ Transfer 完了・Functions Region hnd1（東京）・Redeploy Ready（時刻＝Agoora 申告待ち・ブロックでは未記入）・ホスト nox-kappa-eight.vercel.app 不変。前提照合＝HEAD d0a7bc4＝origin/main（0 0・変更 0・未追跡 poc-record.mjs と docs/tmp）・DB 恒久変更 0・DB 読取＝Vault nox_cron_secret 1 行のみ（VP-3 の指示）・本番書込＝MUSE 手動 reset 1 回（VP-4）＋入場ログ demo_entries（VP-5 4 行＋VP-6 18 行＝30 日で purge）・f0 不走。読取スクリプト docs/tmp/q1009_vp.mjs（a＝VP-1〜5／b＝VP-6）。
- **VP-1 リージョン**: 関数実行を伴う route（cron 無認証 401）の x-vercel-id＝**hnd1::hnd1::…**（edge hnd1・Functions hnd1）。/demo（PRERENDER）・/login（HIT）は hnd1::… のみ＝静的配信。VP-3／VP-4 の応答も hnd1::hnd1。iad1 の出現なし。
- **VP-2 env 5 本（Production・挙動で確認・Vercel CLI 無し＝長さは本番値を読めない）**: CRON_SECRET＝cron route が 401（500 'not configured' ではない）／SUPABASE_SECRET_KEY＝VP-4 の reset（admin client）200／DEMO_USERS＝VP-5 の 4 role 入場 303／NEXT_PUBLIC_SUPABASE_URL・PUBLISHABLE_KEY＝入場後の /dashboard・/register・/mine 200（@supabase/ssr の cookie）＝5 本とも有効。参考＝ローカル .env.local の長さ URL 40・PUBLISHABLE_KEY 46・SECRET_KEY 41（CRON_SECRET・DEMO_USERS はローカルに無し）。
- **VP-3 cron route**: Vault nox_cron_secret（40 字）で `?org=zzz` → **400 'bad org'**（認証通過・書込なし＝dry モードは無いため無効 org で代替）・無認証 → 401。
- **VP-4 MUSE 手動 reset 1 回**（cron route・前回 06:05 から 10 分以上）: **200・5,808 ms**（wipe+load chunks 3＋finalize hook 込み＝route は hooks を await してから応答）。V-2（iad1・06:05）＝wipe+load 8 s／finalize まで 11 s → **hnd1＝finalize まで 5.8 s**（wipe+load の内訳は DB 不読のため未分離）。
- **VP-5 /demo 入場 MUSE 4 role**: owner→/dashboard 200（33,397 B）／manager→/dashboard 200／staff→/register 200／cast→/mine 200（42,222 B）＝全 303→200・cookie＝nox_demo_until（Max-Age 86400・Secure・HttpOnly・SameSite=lax・24.00 h）＋sb-…-auth-token・signOut 303。入場 1 往復 0.96〜2.6 s。
- **VP-6 給与プレビュー ms（/api/payroll/preview・owner・2026-09・各 3 回・中央値）**: 測り方＝P165 と同じ「入場＋preview＋signOut の往復」＋ preview 単体。

| 店 | P165 往復（iad1・10/8） | VP 往復 中央値（hnd1・10/9） | 3 回 | preview 単体 中央値 | 差 | casts／gross（X-13c 後の payload） |
|---|---|---|---|---|---|---|
| MUSE | 7,828 ms | **1,738 ms** | 6,203／1,738／1,633 | 1,164 ms | −6,090 | 5／1,138,650 |
| LUNA | 8,826 ms | **1,687 ms** | 1,747／1,667／1,687 | 1,220 ms | −7,139 | 7／2,920,845 |
| NOIR | 7,134 ms | **1,643 ms** | 1,708／1,643／1,628 | 1,182 ms | −5,491 | 8／5,324,982 |
| ACE | 12,534 ms | **1,687 ms** | 2,565／1,687／1,562 | 1,228 ms | −10,847 | 7／2,516,405 |
| LILY | 9,657 ms | **1,620 ms** | 1,606／1,662／1,620 | 1,138 ms | −8,037 | 6／1,738,180 |
| NEST | 7,098 ms | **1,523 ms** | 1,523／1,562／1,367 | 1,056 ms | −5,575 | 5／1,192,667 |

6 店とも 200・往復 1.5〜1.7 s（iad1 の 7.1〜12.5 s から 5.5〜10.8 s 短縮・初回 MUSE 6.2 s は cold start）。NOIR の DB 側 get_cast_sales 85 ms は不変の前提（本便は DB 不読）。gross は X-13c の payload 差替え後の値＝P165（5,497,431）とは payload が違うため不一致で正。VP-7＝本欄・恒久注意 21〜23（V-2 の読取注意）・起票97 の状態「Pro 移行済み・裁定可」。コミット「docs: Vercel Pro＋hnd1 移行後の読取」＝docs のみ。次＝X-13d。

**便 X-13d-1 完了（裁定339＋X-13-17／19／21／22＋目視手順書）＝台帳の現在地（2026-10-09）**: 前提照合＝HEAD 6fcfe5b＝origin/main（0 0）・DB 恒久変更 0・mig 起草なし・本番書込＝デモ 6 店の reset（push→Vercel success 後に実施・実測は便 X-13d-2a の現在地に記載）。D-0＝裁定339（上）。D-1（X-13-17）＝既存の .nox-table.cardrows（X-8-11）を拡張（td[data-label]::before の見出し・td.wide・td.ops・stickyfirst 解除・inline style の表にも効く !important）し、①シフト「今日」の表（shift-board）②給与 月次一覧（payroll-list・wrapper を .nox-tablewrap plain に）③日報 全列表（19 列）＋回収履歴（report-board）④顧客詳細のキープ一覧（customer-detail）を ≤900 で 1 行 1 カード・PC は表のまま。在庫（stock-board）は .nox-ptable で既にカード＝変更なし。D-2（X-13-19）＝SlideInput を 1 段 1 行「n段 [判定] 円 以上 → 時給 [時給] 円」（MoneyInput×2・.nox-sliderow・≤899 は入力欄が伸縮＝折返しなし）・¥ 接頭と「円 円」の二重を撤去・CompRows（最低月額保証／達成ボーナス）も接尾「円」・ラベル「保証額（月）」「加算額」・ノルマ表の売上「x 円 / y 円」。D-3（X-13-22）＝HeaderGear を Link /master（PC も同じ・ポップオーバーと OPEN_MENU_EVENT の発火を撤去・gear 群 0 なら null）→ pin 張替え nv(6-2)／ms(2-25)／sp(2-1)（variant="top" 2→1）。D-4（X-13-21）＝live 読取: 6 店とも cast_plan は全員割当（overrides {}）・プランは NOIR 3／LILY 3（うち 2 はデモ内の手入力＝reset で消える・源泉 1）／MUSE・LUNA・ACE・NEST 1。「使用中 0 名」の原因＝systemUsageOf が cast_plan.overrides_json だけを数える（プラン本体の値を見ない）→ **仮決め**: plans／components を任意で受け取りプラン側の値でも数える（base>0→時給・バック>0→各種バック・rate→売上歩合・slide≠[]→スライド・achievement_bonus 有効→達成ボーナス）＝systems／store-profile の 2 面が comp_plans・comp_plan_components を渡す・store-systems ss(3-9)〜(3-12)。payload＝profiles.mjs EXTRA_PLANS（MUSE +1 Senior／LUNA +2 Premium・新人／LILY +1 Senior／NEST +1 Senior・ACE 据え置き＝実体 1 本）→ gen-demo が末尾に足しキャストを順番に割当（達成ボーナス店は追加プランにも）→ check-demo 89 段 NG 5（仕様差 5 のみ）・demo-profiles 59（dpf(2-5) 新設）・demo-payload 53。D-5＝docs/demo/visual_check_20261009.md（#1〜14・23・17／19／21／22・PC／スマホ別・結論 3 行）。D-7＝x13_ledger.md（#17／19／21／22／23）。tsc 0（教訓106）。f0 **97 段 5,657（2 連緑 16:21:25〜16:33:12（707 s）／16:34:23〜16:47:43（800 s）・golden 6 値不変・新 suite comp-list 7＝97 段目・x13 24→34・store-systems 30→34・demo-profiles 53→59）**。コミット「feat: X-13d-1（339・17・19・21・22）」＝本便のコミット（docs 同梱）。教訓108 案＝報告に貼付（採番は相談役）。次＝Agoora の目視（visual_check_20261009）→d-2（0167 起草→手貼り→P167→裁定337 client・X-13c 赤入れ反映）。

**便 X-13d-2a 完了（無人便＝裁定340・X-13-25／26／27・デモ前借り・0167 起草）＝台帳の現在地（2026-10-09）**: 前提照合＝HEAD 2ddf2ac（d-1）＝origin/main（0 0）・DB 恒久変更 0・mig は 0167 の起草のみ（適用しない）・本番書込＝デモ 6 店の reset（d-1 分 16:58 JST＝6 店 200・d-2a 分は push→Vercel success 後）・DB 読取＝読取便 R-1／R-4 の SELECT と 0167 突合（BEGIN…ROLLBACK）。
- **読取便 X-13-24〜27（d-1 の後）**: R-1＝前借り列は payroll-board dedCell（−N＋（繰越 N））・2 値は collect.ts loadAdvances→core.ts の budget 引当（advDeductTotal／advCarriedTotal・規則 A＝coalesce(deduct_period, advanced_on の月)）。デモ MUSE さおりの ¥50,000（advanced_on 10/8・10/9 15:53 に再発行）は 10 月分＝仕様どおり。payload に前借りは無かった（gen-demo／profiles に該当行なし）→本便で新設。R-2＝「支払状況を表示」＝PaymentPanel（payment_records 直読＋1 人ずつ入力→/api/payment/record→payment_record_add(run, cast, amount, paid_at, method, note, idem_key)・部分支払可・一括 RPC なし）・状態「未払／一部／支払済」＝payStatusCellOf(run.status, payslips.net×Σpayment_records)＝client 計算→裁定340 は client のみで可（mig 不要）。R-3＝「明細プレビューを閉じる」＝内訳パネル末尾の .nox-actions.end（右寄せ・t.btnGhost+btnSm）・共通の閉じる部品は Modal の × （.nox-formmodal-head＋.nox-formmodal-x・24 ファイル）＝ページ内パネルには中央の .nox-actions が共通。R-4＝MUSE 2026-10 の 25 件＝未来日（10/10〜10/15）の確定シフト 21＋昨日（10/8）の in のみ 4（missingOut 4）。原因＝collect.ts loadPunchStats が period の暦日の確定シフトを全部 matchPunches に渡し、shift あり＋in なし→rawOut noout→不整合 +1（未来日の除外判定は無かった）。本番 CLUB NOX も同じ経路＝lib 修正で両方直る（RPC 不変・mig 不要）。
- **A-1 裁定340**（上）。**A-2 X-13-25**＝.nox-actions（中央）。**A-3 X-13-26**＝advCell 2 行（天引き／残・0 は「—」）・売掛／送りは dedCell のまま。**A-4 X-13-27**＝lib/nox/payroll/anomaly.ts anomalyFlagsOf（bizDate > 営業日の今日→counted／missingOut とも false）・collect.ts は todayBiz＝bizDateOf(now, win.cutoffHm)・pv(5-4) の pin を純関数へ張替え。★仮決め: 未来日は不整合と退勤なしだけ除外し days／absentN／確定シフト時間（報酬型 shift 基準）は従来どおり（未来日の absent 計上・shift 基準の時給は別起票候補）。**A-5 デモ**＝profiles.mjs ADVANCES（MUSE 50,000・他 30,000・0＝なし）→gen-demo が代表キャストに 1 件（advanced_on {$m:-1,d:15}・open・deduct_period null・created_by users.owner）→先月分の finalize hook で天引き（規則 A）→当月に繰越なし。payload sha＝muse 819a5d79／luna d34dfe06／noir a9c53af4／ace 39ef5c00／lily e468b21c／nest 132b78ae（表 +1＝advances）・check-demo 89 段 NG 5（仕様差 5 のみ）・demo-profiles 59・demo-payload 53。X-13-21 は d-1 で充足（6 店 全員割当・プラン 2〜3 本・ACE 1 据え置き）。**A-6 0167 起草**＝supabase/migrations/0167_cast_shift_request_mode.sql（sha256 608c1bcbd4ee6c369c2349c7e728e5f1accdfde2a3ae3e5f1e9da1867797e8fb・6,491 B・69 行（台帳方式）／68（wc -l）・LF）＝★1 casts.shift_request_mode text null＋CHECK（is null or in ('shift','off_only')＝教訓100 で NULL を明示）★2 set_cast_shift_request_mode(p_cast_id uuid, p_mode text)（規則A形＝billing locked・owner ∨ manager 自店・cast forbidden・null＝店の既定に戻す・'bad mode'・no-op・audit）★3 grants（public／anon revoke・authenticated）。突合 docs/tmp/q1009_ag_0167.mjs＝15 段 NG 0（文単位 7 文・新 md5 ee7f7243・関数 305／表 83／'billing locked' 156・既存 48 行は NULL・rollback 後 304／0）。手貼り案内 docs/demo/handpaste_0167.md（結論 3 行・docs/handoff/sql は存在しないため従来どおり supabase/migrations＋docs/demo）。A-4 の RPC 変更は不要＝0167 に同乗なし。
- **suite**＝新規 verify-nox-x13d2 23（f0 98 段目＝pay 10／close 1／adv 1／anom 4／demo 6／mig 1）・pin 張替え pv(5-4)・ms(2-1) は共通 Toast へ寄せて不変。tsc 0（教訓106）。f0 **98 段 5,680（2 連緑 17:02:52〜17:15:01（729 s）／17:16:12〜17:28:05（713 s）・golden 6 値不変）**。コミット「feat: X-13d-2a（340・25〜27・payload）」→push→Vercel success→6 店 reset→live（MUSE 2026-09 さおり 天引き 50,000／2026-10 不整合 25→4）＝実測は報告と次便の現在地。**仮決め一覧は最終報告の冒頭（相談役が追補で追認）**。次＝Agoora の 0167 手貼り→d-2b（P167・裁定337 client・デモ 3 方式）・読取便 338-R。

**便 P167＋X-13d-2b 完了（0167 収蔵・裁定337 client・デモ 3 方式・0168 起草）＝台帳の現在地（2026-10-09）**: 前提照合＝HEAD 6078228＝origin/main（0 0）・DB 恒久変更 0（0167 は Agoora 適用済み 18:24・0168 は起草のみ）・本番書込＝デモ 6 店の reset（push→Vercel success 後）・DB 読取＝P-1 proof／B-4 件数／0168 突合（BEGIN…ROLLBACK）。P-1＝0167 の欄（裁定337 節）。B-1＝裁定337 の適用欄。B-2＝payload sha（casts 3 方式・comp_plans.slide_period 先行）＝muse c609e7e7／luna b5dd13a5／noir a882fa5d／ace 157a5bba／lily 1dbcf5e4／nest 1e79d4ae・check-demo 89 段 NG 5（仕様差 5 のみ）・demo-profiles 65・demo-payload 53。B-3＝本欄・339 追補1・340 追補1・338 追補1（0168 の欄）・起票101・教訓108・x13_ledger（#18 クローズ・#20 0168 起草）。B-4＝起票101 の件数（MUSE 21／CLUB NOX 57）。B-5＝0168（上）。tsc 0。f0 **99 段 5,708（2 連緑 18:40:37〜18:51:22（645 s）／18:53:49〜19:05:28（699 s）・golden 6 値不変・新 suite 337 15＝99 段目・anon-guard 1057→1059・grants 483→485・m4 12→14・demo-profiles 59→65・0158 52→54）**。コミット「feat: P167・X-13d-2b（337 client・デモ 3 方式）」→push→Vercel success→6 店 reset→live（MUSE キャスト詳細の 3 択・/mine の反転・作る画面の印）＝実測は報告。★仮決めは報告の冒頭。次＝Agoora の 0168 手貼り→P168（338 の lib・UI・デモ 月次 2 店＝ACE／NOIR・半月 1 店＝LUNA）。

**便 P168 完了（無人便＝0168 収蔵・裁定338 lib／UI・X-13-28・裁定341＋0169 起草）＝台帳の現在地（2026-10-09）**: 前提＝P167 の HEAD 641e958（0168 は 18:48 に適用済み＝P167 の f0 走行中・赤なし）・DB 恒久変更 0（0169 は起草のみ）・本番書込＝デモ 6 店の reset・DB 読取＝P-1 proof／0169 の写経元 dump／0169 突合（BEGIN…ROLLBACK）。P-1＝0168 適用欄（338 追補1 節）。P-2／P-3＝338 の適用欄（同節）。**P-4 X-13-28**＝components/nox/period-select.tsx（select・当月＋過去 12 か月・新しい順・確定済みに「確定」・既定＝当月・末尾「もっと前…」で 12 か月延長・候補と印は lib/nox/payroll/list-periods＝payroll-list X-13-14 と同じ純関数）を給与（確定の印＝payroll_runs）・分析（対象月）・月報（対象月）・ノルマ表（期間）の 4 箇所に統一。旧 components/nox/period-picker.tsx（便 X-5・テキスト＋▾）は撤去。grep で「テキスト＋▾」部品は給与の 1 箇所だけ・他 3 箇所は native type="month"（★仮決め: 同じ select に統一・領収書／支払調書／/mine に月選択の入力は無い）。**P-5 裁定341**（上）＝読取・client の無効チェック・0169 起草。**P-6**＝SLIDES（profiles.mjs）・9 月分は reset の finalize hook で凍結明細に反映（再確定不要）。**pin 張替え（P167／P168）**＝billing 段47-1（156／157／156）・anon-guard（0167 probe＋authenticated(cast)）・grants（公開 +1）・0158（s-2d ee7f7243・関数 305 ×2）・m4 wm(4-1)（layout＝解決値）・demo-profiles dpf(1-3)（売上スライド 2・ポイントスライド 1）・337 c337(4-1)（SLIDES）・x13 quota-table-3（PeriodSelect）。教訓109 候補（採番は相談役）＝報告に貼付。tsc 0。f0 **100 段 5,722（2 連緑 19:16:28〜19:28:18（710 s）／19:29:20〜19:41:15（715 s）・golden 6 値不変・新 suite 338 14＝100 段目）**。コミット「feat: P168（338・X-13-28・341）」→push→Vercel success→6 店 reset→live（ACE 給与 2026-09 の月次スライド段・LUNA の半月・NEST cast の /mine＝休み希望）。次＝Agoora の目視→0169 手貼り→P169→W5-2。

**便 V45 完了（v45 収蔵＋裁定342・教訓109・追補記入＋週末 reset 読取）＝台帳の現在地（2026-10-13）**: 前提照合＝HEAD 7e60c1a＝origin/main（rev-list 0 0・変更 0・未追跡 poc-record.mjs・docs/tmp は .gitignore・0167〜0169 追跡済み・0169 未適用）・DB 恒久変更 0・DB 読取＝V-2 の SELECT のみ（docs/tmp/q1013_v2_reset.mjs／q1013_v2_ttl.mjs・default_transaction_read_only）・f0 不走。V-0＝v45 収蔵（sha256 8e8a931d…1d85・15,054 B・105 行 LF＝提示値と一致・引き継ぎ欄に行）。V-1＝裁定342（起票101 クローズ・次 102）・教訓109（次 110）・337 追補1・338 追補2・341 追補1（pin 張替え一覧の追認を含む）・X-13-28 追補（⑤＝4 画面を period-select に統一・native type="month" も置換＝docs/demo/x13_ledger.md #28 に注記）・X-13-29（#29 は便 P168 で既に行あり＝名前と状態を v45 §3 へ更新）・恒久注意欄 24〜26。次の採番＝裁定343・教訓110・起票102。**V-2 実測（10/10〜10/13 JST）＝失敗 0**: (a) cron.job_run_details＝4 日 × 8 本＝32 本すべて succeeded（purge 05:15／reset muse 06:05・luna 06:07・noir 06:09・ace 06:11・lily 06:13・nest 06:15／retry 06:35・return_message '1 row'・runid 11〜42）。(b) net._http_response＝**10/13 分の 7 本のみ残存・すべて 200**（timed_out false・error_msg null・6 店 ok true・mode wipe+load・chunks 3／3／3／3／4／4・retry count 6＝6 店とも skipped 'already reset today'）。★10/10〜10/12 の応答行は **pg_net.ttl＝6 hours（pg_net 0.20.3）で消えており読めない**＝status_code の実測は 10/13 分だけ・10/10〜12 は cron 側 succeeded（要求の発行）と 10/13 の正常が証拠（恒久注意候補「net._http_response は 6 時間で消える＝当日 12:35 JST までに読む」＝採番は相談役）。(c) audit demo.reset 26 行（10/13・wipe 6＋load 20＝chunk 数と一致・demo.reset.failed／demo.finalize.failed 0・10/10〜12 の行は翌日の wipe で消えるため残らない）。(d) 6 org の demo_reset_at＝10/13 06:05:08（muse）／06:07:05（luna）／06:09:06（noir）／06:11:07（ace）／06:13:07（lily）／06:15:07（nest）＝全 6 店 10/13・payroll_runs 2026-09 finalized 6（06:05:10／06:07:08／06:09:09／06:11:10／06:13:11／06:15:11）・casts 38／写真打刻 38。(e) cron.job 8（purge 1＋reset 6＋retry 1・全 active・once の残骸なし）。docs/demo/cron_setup.md 末尾に「10/10〜13 無人 reset OK」1 行。コミット「docs: v45 収蔵・裁定342・教訓109・週末 reset」＝docs のみ（f0 不走＝裁定256）。次＝Agoora の目視（v45 §5-1）→「あああ」無効化→0169 手貼り→P169（相談役が出す）。

**便 P169 完了（0169 収蔵・X-13-29 結線・裁定342・6 店 reset）＝台帳の現在地（2026-10-13）**: 前提照合＝HEAD 6eb3bf2＝origin/main（0 0・変更 0）・DB 恒久変更 0（0169 は Agoora 手貼り 11:34・P-0 で 5 点照合＝1 回目は未適用を検知して停止→再手貼り後に一致）・本番書込＝デモ 6 店の reset と P-7 の live 試走（MUSE 伝票 2 枚＝翌朝の reset で消える）・DB 読取＝P-0 proof／342 計測（admin・SELECT）。P-1＝0169 の欄・名簿 306（A 157／B 149）・gated 157・pin 張替え（上）。P-2＝341 追補2（X-13-29 の仮決め 7 点）。P-3＝342 の適用欄（MUSE 当欠 21→0・CLUB NOX 80→33）。P-4＝目視 NG なし（Agoora 記入）。P-5＝本欄・342 追補1（SX-1）・恒久注意27／28（SX-1）・x13_ledger #29。tsc 0。f0 **101 段 5,750（2 連緑 03:00:52〜03:15:33 UTC（run1 再走）／03:16:57〜03:30:19 UTC（802 s・run1 877 s）・golden 6 値不変・新 suite 341 21＝101 段目・anon-guard 1059→1061・grants 485→487・0158 54→57）**。★run1 の 1 回目は仮決め B-3（受給者判定も今日まで）で payroll F2c-3 が赤→取り消して再走（走数 1 消費・342 追補1 で追認）。コミット「feat: 0169 収蔵・X-13-29 結線・裁定342」（000d9a7）＋「docs: 341 追補2・342 実測・恒久注意27」（本行・便 SX-1／SX-2 の記入を同乗）→push→Vercel success→6 店 reset（同一店 10 分間隔）→live（レジの切替オフ／オン＋率変更 audit 1 件・MUSE 2026-10 プレビューの当欠）＝実測は報告。次＝W5-2（相談役が出す）。

**便 W5-2a 完了（器なし 5 項目の結線・331 ⑱・334 フロア表示・0170 起草）＝台帳の現在地（2026-10-13）**: 前提照合＝HEAD 5ce653c＝origin/main（0 0・変更 0）・DB 恒久変更 0（0170 は起草のみ・突合は BEGIN…ROLLBACK）・本番書込＝デモ 6 店の reset と live の試走（ACE の会計と運用の保存＝元値に戻す）。A-1＝lib/nox/store/ops-profile.ts（純関数 5 本）＋store-profile-panel に節 'ops'「会計と運用」（列 7 つ＝invoice_registered_on／pay_day／tax_inclusive_display／use_vip／use_counter／payment_methods／punch_methods・同じ set_store_profile の差分 patch・owner のみ・先回り検査＋errJa 3 トークン）＋店舗情報タブに 'ops'＋setup-wizard STEP 5 に同じ 7 項目（page が現値を渡す・差分は settings の patch に同乗・SETUP_HIDDEN_ITEMS は C 0／D 5）。A-2＝STEP 3 の行チェック（既定＝全選択・全選択）＋名前／価格 inline・productsEff を plan／上書き／件数の 3 か所へ（同じ RPC）・下書きに prodSel／ops。A-3＝lib/nox/floor-kinds.ts（hiddenKindsOf／seatsVisibleOf）・register/page が stores.use_vip／use_counter で席タイルを絞る・seats/page→SeatsBoard hiddenKinds（フィルタと新規の選択肢・既存行は残る）・kiosk は不触（仮決め）。A-4＝0170 の欄（裁定343 節）＋handpaste_0170.md＋gen-demo の先行投入（payload 6 本再生成・demo-payload 53／demo-profiles 65 緑）。A-5＝裁定343（逐語は【相談役記入】）・純増起票 102（卓で束ねる）・docs/demo/handpaste_template.md（末尾に恒久注意28）・x13_ledger #17〜#29 クローズ（目視 OK 10/13 Agoora）・仮決め一覧 docs/tmp/w52a_decisions.md（A1 9／A2 4／A3 3／A4 4／A5 3）。★出し分けの読取側（レジ入金ボタン・/mine 打刻カード・代行・/kiosk）は本便では未結線＝保存の器まで（W5-2b）。suite＝新規 verify:nox-w52a 19（f0 102 段目）・setup su(1-5)／su(5-2) 張替え（C 0）。tsc 0。f0 **102 段 5,769（2 連緑 05:35:20〜05:52:11（1,011 s）／06:09:33〜06:22:22（769 s）UTC・run1 は 2 回（pv(7-5)／mt(7-2)(7-3) の文字列 pin）・run2 は 1 回（0158(6-9) のフレーク＝単独 57 緑）赤を挟む＝走数 5・golden 6 値不変・0170 未適用＝DB pin 不変）**。コミット「feat: 器なし 5 項目・331 ⑱・334 フロア表示」（5694cb0）＋「docs: 裁定343・0170 起草・恒久注意28 テンプレ」（本行）→push→Vercel success→6 店 reset→live（デモ ACE の store-profile「会計と運用」保存・STEP 3 の行チェック）＝実測は報告。次＝Agoora の 0170 手貼り（検証クエリの返り値を貼る）→W5-2b。

**便 W5-2b 完了（0170 収蔵・判定基準／対象の lib・UI・器なし 5 項目の読取側）＝台帳の現在地（2026-10-13）**: 前提照合＝HEAD 79236c7＝origin/main（0 0・変更 0）・DB 恒久変更 0（0170 は Agoora 手貼り＝B-0 で 1 回目は未適用を検知→再手貼り後に 4 点一致）・本番書込＝デモ 6 店の reset と live の読取（NOIR owner の給与プレビュー）。B-1＝0170 適用欄・pin 張替え（0158 s-2h／s-2i）。B-2＝lib（slide.ts に SlideBasis／slideBasisValueOf／slideRankIncludedOf／slideScopeFreezeOf・collect＝select +2 列・件数の期間累計／営業日ごと・casts.rank_id・対象外は planEff・assemble＝daily＋件数の slideByDay・core＝凍結形に basis／scope・breakdown＝件数の文言／対象外 1 行）＋UI（plan-editor 25 引数・基準 select・ランクのチェック・SlideInput count・plan-board の印）。B-3＝レジ入金ボタン（payment_methods・電子マネー／QR＝'other'＋固定 detail・内税の印）・/mine（punch_methods.self）・shift-board（proxy＝退勤ボタン・in 打刻）・payroll-board／month-report（支払日・内税表記）・kiosk 不触（器なし・裁定要）。B-4＝裁定343 逐語差替え・343 追補1・教訓110・本欄。仮決め一覧＝docs/tmp/w52b_decisions.md（L 7／U 4／R 7／D 2）。デモ＝NOIR を hon_count（月次 3／6／10 件）・対象ランク S／A（payload 再生成・demo-payload 53／demo-profiles 65 緑）。suite＝新規 verify:nox-w52b 25（f0 103 段目）・pin 張替え（338 sp(3-1)・today-row tr(6-4)・w52a mg(1-3)・0158 +2）＝f0 の前に grep（教訓110）。tsc 0。f0 **103 段 5,796（2 連緑 06:56:13〜07:08:11（718 s）／07:18:26〜07:29:56（690 s）UTC・run2 の 1 回目は接続プールのタイムアウト（payroll 単独 231 緑）＝走数 3・golden 6 値不変）**。コミット「feat: 0170 収蔵・判定基準／対象・器なし 5 項目の出し分け」（c926ac5）＋「docs: 裁定343 逐語・343 追補1・教訓110」（本行）→push→Vercel success→6 店 reset→live（NOIR の給与プレビューに基準名・default ランクの 3 名は対象外・レジ入金ボタン）＝実測は報告。★live（最初の reset 後）で NOIR 全員が「対象外」＝デモ reset の id 付け替え（lib/nox/demo/seed.ts remapUuid）が uuid[] 列（slide_rank_ids）を素通ししていたのを検知→配列の要素も同じ写像に修正（suite w52b sb(5-5)・demo-reset 34／demo-guard 27 緑）→f0 103 段 5,797 2 連緑（07:36:59〜07:49:51（772 s）／08:00:58〜08:15:12（854 s）UTC・冷却 180 秒・run2 の 1 回目は payroll の statement timeout＝走数 3）→コミット「fix: デモ reset の uuid[] 列を写像（slide_rank_ids）」（9fad6ee）→push→reset→live 再確認＝実測は報告。次＝録画・LP（相談役が出す）。

**便 LP-R 完了（録画・LP の設計案＋10/14 無人 reset 読取＋docs）＝台帳の現在地（2026-10-13）**: 前提照合＝HEAD 6fc2b6c＝origin/main（0 0・変更 0）・DB 恒久変更 0・DB 読取＝L-0 の SELECT のみ・f0 不走。**L-0＝10/14 06:05 JST の無人 reset は未到来**（読取 2026-10-13 17:24 JST＝cron.job_run_details に 10/14 分なし・6 org の demo_reset_at＝10/13 17:19〜17:20 JST（便 W5-2b fix 後の手動 reset）・2026-09 finalized 6・cron.job 8 全 active・NOIR の slide_rank_ids＝cast_ranks の A／S と一致（3 プラン））＝cron_setup.md の「10/14 無人 reset OK」行は書かない（翌朝の読取便で）。L-1／L-2＝docs/tmp/lp_plan.md（poc-record.mjs＝伝票の録画再生 PoC で画面は撮れない・6 店の台本 60〜90 秒・自動（Playwright recordVideo）と手動の比較＝初回は手動・2 回目以降は自動／LP＝Next.js 内 /lp を推奨・構成 7 ブロック・仮決め候補 6・見積）。L-3＝328 追補9（NOIR 本指名件数・対象 S／A）・起票103（kiosk 打刻出し分け・第 2 期）・起票104（内税の金額変換・第 2 期）・恒久注意29（run2 は 180 秒冷却）・本欄。次の採番＝起票105・恒久注意30。★台帳に 328 追補8 の見出しは無い（追補9 の欄に注記）。コミット「docs: 328 追補9・起票103／104・恒久注意29・10/14 reset」＝docs のみ（f0 不走＝裁定256）。次＝相談役が録画・LP 本便を出す。

**便 N1013b 完了（裁定344 /lp・345 4 段・346 売上軸・準備中チップ 6 撤去・GV-3 総点検・0171 起草）＝台帳の現在地（2026-10-13）**: 前提照合＝HEAD 702e8da＝origin/main（0 0・変更 0）。DB 恒久変更 0・読取は SELECT のみ（live set_comp_plan の functiondef を docs/tmp/0171_set_comp_plan_live.sql へ＝md5 1cddaa0e）。B-1〜B-3／B-2b／B-8／B-9＝client のみ（lib 2 新規＝shift/wish-state.ts・payroll/cast-sales.ts・app/lp/page.tsx 新規・/mine 3 面・shift-board・analytics・casts-board・collect・norm-progress・demo-terms・session／robots・comp-methods・gen-demo＋payload 6 本再生成）。B-6／B-7＝器なし＝0171 起草のみ（適用しない・裁定347 は「提案中」）。suite 新設 4＝lp 13／wish-state 25／ranking 14／systems-off 12・pin 張替え＝payroll U2 c3・wc(5-1)・dpf(3-3)・mr(5-2)・mc(4-1)(4-3)・demo-payload（_report 同期）→tsc 0→f0 107 段 5,861 2 連緑（run1 18:33／run2 18:50 JST・107 段 5,861）→コミット「feat: /lp（裁定344）」「feat: シフト状態表示の一本化（裁定345）・準備中チップ撤去」「feat: ノルマ 4 軸の採用と OFF の非表示（GV-2）・設定 OFF の総点検（GV-3）」「docs: 裁定344／345／346・起票97／98／105〜112・ゲート表」（99c496a／ac16e44／4040a58／17a9b3a）→push→**Vercel build 失敗 2 回→fix 408788b（page.tsx の非 Page export＝Next の Page export 検査）／eeed3d0（"use client" の DEMO_TERMS を server の /lp から値として読めない→lib/nox/demo/terms.ts へ）→/lp 200（19:04 JST）→fix 2f4e9a3（force-static では useSearchParams が空＝mount 後に window.location.search）**→6 店 reset 19:08 JST（6/6 200・wipe+load）→live（docs/tmp/q1013_n1013b_live.mjs／live2.mjs・19:2x JST）: /lp 200（6 店カード・この店で試す 6 リンク・ポスター枠 6・noindex・mailto）／/demo?store=ace&role=owner＝ACE カードが先頭＋金枠・「オーナーで入る（おすすめ）」（ブラウザ目視）／ACE ひなの＝reset 後の希望 3 件（10/21・23・24＝open 期間内・10/27〜29 は reset で期間外）を本人 RPC で提出→owner が採用→**/mine 直近 4 件・/mine/wishes 提出済み＋今日以降のシフト節とも「採用・確認待ち（管理者確認）」**・shift-board の配信 JS に「代行確定」「採用・確認待ち」・旧「承認」ボタン 0／analytics JS に「売上（按分）」＋軸切替／plan JS に準備中チップ 5 語なし／casts JS に normsOnOf／ACE（sys_norms false）の /mine にノルマカードなし／/mine/ranking＝self（自分の行だけ・¥ なし）。**GV-1 の 10/29 相当（8 件目）は reset 後は 5 件のため再現不可＝上限 14 は suite ws(3-3) で係留**。起票 次＝113。仮決め一覧＝docs/tmp/n1013b_decisions.md。

**便 V1014 完了（10/14 無人 reset 読取＋0171 再起草（起票112 同乗）＋追認 docs）＝台帳の現在地（2026-10-14）**: 前提照合＝HEAD 4399e8f＝origin/main（0 0）。★変更 0 ではない＝便 DM-1（裁定348）が作業中（profiles／gen-demo／payload／suite／app/mine が未コミット・f0 run1 走行中）のため、V1014 は DM-1 が触っていないファイル（台帳・launch_gate・cron_setup・0171・handpaste）だけを明示パスでコミット。DB 恒久変更 0・f0 不走。V-1＝10/14 無人 reset OK（purge 05:15・reset 6 店 06:05〜06:15・retry 06:35＝8 job succeeded・http 200×7・demo_reset_at 6 org＝10/14・NOIR slide_rank_ids 3 本 A/S 一致）→cron_setup.md に 1 行。V-2＝0171 再起草（上の 347 追補1）。V-3＝347／345／344／346 追補1・教訓111・launch_gate（起票112 クローズ・GV-3 残りを第 2 期一覧 25／26 へ）。

**教訓候補 E-1〜E-5（便 N1013b・docs/tmp/n1013b_decisions.md・逐語・採番は相談役）**: E-1「push 後 /lp が 404 のまま＝Vercel build 失敗（tsc は緑）→app/lp/page.tsx の export const LP_CONTACT_MAILTO を非 export に（Next の Page export 検査）＝page.tsx から Page 以外を export しない」／E-2「2 回目も 404＝"use client" の demo-terms.tsx から DEMO_TERMS を server component（/lp）が値として読めない（client reference）→正本を lib/nox/demo/terms.ts へ・demo-terms.tsx は再 export＝"use client" モジュールの非コンポーネント値は server から読まない＝純データは lib へ」／E-3「/demo?store=ace の初期選択が効かない＝force-static では useSearchParams が空→mount 後に window.location.search を読む（SSR は初期選択なし）＝force-static の page で query を使うなら useEffect＋window.location」／E-4「tsc 緑でも build は別物＝push 前に next build（dev 非稼働なら可・NEXT_DIST_DIR 分離・tsconfig 復元・出力削除）→3 回目の fix 前に local build で確認してから push＝route／export／client 境界を触った便は push 前に local build」（E-1〜E-4 は教訓111 に束ねた）／E-5「在宅ブラウザの目視は hydration 前に JS を評価すると「効いていない」に見える→実クリック後に再評価」。追加候補 E-6（便 DM-1）「N1013b の fix 3 本（/lp）は f0 2 連の後に積んだ＝demo-payload dp(5-1)（demo-terms.tsx の 06:05 文言）が HEAD で赤のまま push されていた（DM-1 の単独走で検知・pin を lib/nox/demo/terms.ts へ）→f0 後の fix コミットは、触った文字列を pin する suite を単独走してから push」。

**便 DM-1 完了（裁定348 マトリクス＋追補1 体験入店・payload 再生成）＝台帳の現在地（2026-10-14）**: 前提照合＝HEAD 4399e8f＝origin/main（0 0・変更 0）。DB 恒久変更 0・読取は SELECT／preview のみ。D-1＝併用は高い方（pay.ts max・mig 0）。D-2／D-2b＝profiles.mjs（表＋TRIAL）・gen-demo・/mine の保証印・payload 6 本再生成（proposed 0・体験入店 6・cast_plan 3 行形 6・daily_pays LILY 4）・suite demo-profiles 77（+12）・demo-payload 53（dp(5-1) 張替え＝N1013b の fix 後に赤だった pin）→tsc 0→f0 107 段 5,873 2 連緑（run1 15:15／run2 15:38 JST・107 段 5,873）→コミット「feat: デモ 6 店の報酬形態マトリクス（裁定348）」＋docs（7849838（feat）／1c652b2（docs））→push→Vercel→6 店 reset→live（after）: 6 店 reset 15:48 JST（体験入店 6・保証 3 行形 6・LILY daily_pays 4）→preview 2026-09 after＝ACE ひなの 月次スライド ¥1,295,563→3,500（不変）／LUNA みさき 半月 2 行（不変）／NOIR あべ 本指名 53 件→5,000・対象ランク（不変）／LILY みく 雇用＝源泉 23,654→0・日払い済み 30,000 天引き（net 351,680）／NEST レン 体験入店 base 1,200（gross 112,180→91,860）／体験入店 6 名の gross＝まり 307,187→253,145・まい 586,567→234,827・こころ 560,614→155,091・るな 472,757→329,670・ゆな 411,570→314,370。★MUSE さおり の併用は「売上 ¥0→¥0／pt 0→¥0」＝指名なしの店は按分売上 0・pt 0 で段が発火しない（裁定要＝dm1_decisions.md）。★達成ボーナスは cast_norms が当月分だけ＝9 月の確定明細には出ない（10 月は売上 0）。★保証時給の明細行は 10 月の時間 0 のため未発生＝DB の 3 行形で確認（/mine の印は体験入店キャストが demo ログイン対象外＝目視不可）。仮決め一覧＝docs/tmp/dm1_decisions.md（教訓候補 E-6＝f0 後の fix は pin suite を単独走）。

**便 P171 完了（0171 収蔵＋裁定347 client＋ノルマ 4 軸 UI＋346 self＋デモ既定目標）＝台帳の現在地（2026-10-14）**: 前提照合＝HEAD 6d280f8（DM-1 完了時）＝origin/main（0 0・変更 0・未追跡＝docs/expert/answers_20261014.md（Agoora）・poc-record.mjs）。【検証値】は未記入のまま Q-0 を CC の live 照合で代替（全点一致・上の 0171 の欄）。DB 恒久変更 0。client＝norm-axes.ts（新）・plan-editor・casts-board・comp-sections・norma-board・norm-config-panel・norm-progress・/mine/ranking・profiles／gen-demo（payload 6 本再生成）・suite norm-axes 28（f0 108 段目）・pin 張替え x13(quota-table-1)／dpf(2-4)／rk(4-4)→tsc 0→local next build 緑→f0 108 段 5,901 2 連緑（run1 16:44／run2 17:04 JST・108 段 5,901（run1 初回は w52a mg(1-3) の pin 赤＝gen-demo の行末 ...normDefaultsOf＝張替えて再走））→コミット「feat: 0171 収蔵・裁定347・ノルマ 4 軸・346 self」＋docs（63d6395（feat））→push→Vercel→6 店 reset→live: 6 店 reset 17:1x JST（プラン既定＝ACE Sales Slide 売上 800,000／指名 30・MUSE 2 本・quotas は代表 1 名・norms 1 行）→ACE ひなの の /api/mine/norm-progress＝個別（hon 34／sales 2,350,000・source override）→set_cast_quota null で既定（hon 30／sales 800,000・source plan）→同伴 OFF（set_store_norm_axes）で dohan null（ACE は同伴を採用しない店＝元から null＝弱い検証）→ON と個別を戻して override に復帰／/mine/ranking＝自分の按分売上 1 件だけ（他人の額 0）・selfOnly／配信 JS＝casts「プランの既定に戻す」「個別」・plan「プラン既定の目標」「出勤日数」set_store_norm_axes「プランの既定（継承）」。

**便 N1014 完了（裁定352〜357・GV-4／GV-5・347 追補2 修正・348 追補2・裁定354・専門家回答 T10／L3／L6 収蔵＝裁定349〜351 案）＝台帳の現在地（2026-10-14）**: 前提照合＝HEAD d6d49fe（P171 完了時）＝origin/main（0 0・変更 0・未追跡＝answers_20261014.md・poc-record.mjs）。DB 恒久変更 0・読取は SELECT／preview のみ。A（client）＝裁定352 改訂版の開卓モーダル・353 今日の状態・GV-4 kiosk グリッド・347 追補2 修正（/mine の日数・達成ボーナスの目標の出所）・357 送り（退勤後も可・退勤ダイアログ）。A-5（355）は器なし→0172 案。B（payload）＝348 追補2＋354（PIN 1234・/kiosk 上部の注記は器なし＝入口のみ）。X＝専門家確認事項 ④ に逐語転記・T11 起票・裁定349〜351 案・起票113・規約雛形 docs/legal/terms_store_v0.9.md・docs/tmp/x_plan.md。suite n1014 16（新・f0 109 段目）・today-row +4・payroll +1・張替え demo-profiles／norm-axes／mine-recon。f0＝**2 連緑 109 段 5,922**（run1e 18:56／run2b 19:27・golden 5170／5931・withholding 125802 不変・+21＝n1014 16・today-row 4・payroll 1）。★run1＝anon-guard の statement timeout（E-9）・run1b＝crm-base の statement timeout・run1c＝messages ms(2-11) の pin（E-10・張替え）・run1d＝contract-ack ca(0-2)（E-11・デモ実利用の並走→fixture org に絞った）・run2＝product-back-modes の statement timeout→run2b 緑（同日 statement timeout 3 回＝DB 側の間欠負荷・要観察）。コミット＝4d61b2c（feat A・client＋suite）／3fb3268（feat B・デモ）／3af8907（docs X・専門家回答）／07be9a8（fix: 体験入店の出勤行の重複→demo reset 失敗の修正）／76b92c3（fix: 在席（フリー）で売上を按分＝MUSE・LILY・体験入店の退勤は同じ営業日）／56a5a25（fix: 「送り済」＝transport.biz_date）／d27bed9（fix: 店設定 norm_axes・biz_type）＋本 docs（N1014 の現在地・裁定352〜357・349〜351 案）・push 済み（d27bed9＝origin/main・本 docs の後に更新）。★19:30 の 6 店 reset＝MUSE／LUNA／ACE／LILY が「reset failed」（最終 chunk の shifts／attendance unique 違反＝体験入店の 10 月出勤が元データの同日行と重複）・NOIR／NEST 成功→gen-demo に重複ガード→07be9a8→再 reset（E-12 候補・markFailed の audit 行が残らない＝起票候補）。live（2026-10-14 19:5x〜20:3x・6 店 reset 19:30／19:44／19:54／20:14 の 4 回＝payload 修正 3 回）＝MUSE 店長 T4 開卓（人数 3→伝票「¥5,500 × 3名」・BANZEN 形モーダル）／ACE /casts「今日: 未出勤 20:00 予定」×5・「出勤中 20:00〜（予定 翌02:00）」（るな）・「今日出勤」で予定なしが消える／ACE kiosk あい 1234→「出勤しました」（punches source kiosk 20:07）・グリッド 4／3／2 列（1280／700／500）／ACE るな 退勤→ダイアログ「送りを発行して退勤／退勤のみ」→「退勤を記録し、送り ¥1,000 を発行しました」→行「送り済」（56a5a25 後）・10 月 preview net 12,200＝13,200−送り 1,000／MUSE さおり 9 月＝売上 ¥1,063,856→¥3,000・pt 31→¥2,600＝3,000 採用（76b92c3 後）／LILY みく 達成ボーナス 10,000・ゆな なし／NEST レン 保証 12h＋基本 6h／ACE るな 10/13 基本 2,200（保証は 10/14 以降の時間が付いてから）／LUNA みさき /mine「出勤日数 1日/21日・同伴 0件/8件」→owner で同伴 OFF→キャスト別ノルマ目標の列・キャスト詳細「今月のノルマ」（採用していない軸は出ません）・/mine の 3 画面から同伴が消える→ON に戻した。★4 店 reset failed（重複）・按分 0（MUSE 売上段／LILY ボーナス）・退勤の $rel・「送り済」の列名・norm_axes 欠落の 5 件を live で検知して修正。仮決め一覧＝docs/tmp/n1014_decisions.md。次＝相談役が 349〜351（＋356）を確定→0172 起草（daily_pays.kind・扶養申告書・店設定 2 キー・terms_acceptances・staff_punches／contracts）→実装便。

**便 GV-A 完了（裁定358〜371＝目視指摘 GV-6〜22・PWA standalone 対応）＝台帳の現在地（2026-10-15）**: 前提照合＝HEAD 54747ad（N1014 完了時）＝origin/main（0 0・変更 0）。DB 恒久変更 0・RPC 不触・reset 不要。client＝shift-board（358・371）・register-board（359・360・367・368〜370）・side-nav／nav（361・362）・dashboard／analytics／mine ranking（363）・customers-board（364）・payroll-board（365）・payslip-slip／theme（366・369）・customer-pick-modal（新）・okuri-out-dialog（369）・globals.css・manifest（shortcuts）。suite 新設 9（today-layout 3／nomination-card 4／register-tabs 3／sidebar-rail 3／menu-grid 3／ranking-default 3／register-customer 3／register-sticky 3／statement-print 3）＋customers-keep ck(7-1)・payroll-view pv(7-1)・張替え 6（n1014／today-row／messages／nav／x13／customers-keep）。f0＝**2 連緑 118 段 5,952**（run1 15:42／run2 15:59・golden 5170／5931・withholding 125802 不変・+30＝新 suite 9 本 28＋ck 1＋pv 1）。コミット＝f594df9（feat・client＋suite＋manifest）＋本 docs（裁定358〜371・x13_ledger 28〜41）＋live 後の docs。live（2026-10-15 16:0x・デモ NOIR 店長・Vercel 反映後）＝1180px: サイドバー＝レール 64px（data-side-mode rail）・上部ヘッダー static・ホーム見出し「売上ランキング（今月 2026-10・按分）」＋切替（10 月は閉じた伝票 0 件＝「データがありません」は正）・/shift 今日タブ＝2 列が 1 列（1045px・右カラムは表の下）・行はカード（grid・セグメント 48px）・/register＝サイドバー hidden＋≡（ドロワー＝全 14 項目・3 列グリッド・「›」なし）・VIP-1 を開く→操作バー＋セグメントが sticky（不透明 rgb(7,7,7)）・セグメント 3 本 52px・「指名・席」選択で金塗り（rgb(216,173,85)）・会計は .pay・分配率＝1 カード 58px（あべ S｜本 場内 フリー｜¥5,000｜同伴 100% ×・左帯 hon）・ⓘ あり・商品行の「お客様」チップ 31（未指定）／820px: 今日タブ＝3 段カード（areas name state conf／req／att／ops・セグメント 48px・退勤 100%（NOIR は送りなし）・時刻修正は下線リンク・横スクロール 0）・下部ナビ「メニュー」＝2 列グリッド・「›」なし・上部ヘッダー static。仮決め一覧＝docs/tmp/gva_decisions.md（A-1〜A-14・E-15 候補）。x13_ledger に GV-6〜22「反映・目視待ち」。次＝Agoora のスクショ目視（GV-6〜22）→便 GV-B（裁定372〜382・0172 起草）。

**便 GV-B 完了（裁定372〜378・380〜384＝目視指摘 GV-23〜37・0172 起草・349〜351／356 確定）＝台帳の現在地（2026-10-15）**: 前提照合＝HEAD 0f51d61（GV-A 完了時）＝origin/main（0 0・未追跡＝poc-record.mjs）。DB 恒久変更 0・RPC 不触・reset 不要（P-0＝10/15 無人 reset OK＝8 job succeeded・http 200×7（06:05〜06:35）・6 org demo_reset_at 10/15）。client＝components/ui/responsive-kit.tsx（新・382＝ResponsiveTable／FieldStack／SegmentTabs／InfoNote／TelLink）・feature-flags／time-pricing／pricing-board／comp-sections／master-subnav／plan-board（382・373）・casts-board＋lib/nox/cast/current-wage.ts（新・374）・register-board（375・376・384）・customer-pick-modal（377＝4 タブ再構成）・check-customers-card／line-keep-button（377）・reservation-panel（378）・shift-board／store-profile-panel／mine 2 面／wish-state（380・383）・staff-board／shift/page／layout／customers 2 面（381）・cast-picker（384）・today-row.ts（383）・pay.ts（373）・globals.css（372・382）。0172＝supabase/migrations/0172_settlement_terms_staff.sql（起草のみ・sha256 cea1f38458e899813b8a759be5374b6b00cf5f76d6a7d99b908091bf9252b40a・77,638 B・922 行（台帳方式）／921（wc -l）・LF・関数 +3＝311・表 +4＝87・'billing locked' +1＝159・md5 pin 5 本＝daily_pay_issue 7e9d29d0→94f989f9／daily_pays_of_run b81e8659→37ff6ed0／set_store_profile 2e7b4963→67e96c04／staff_create e69adbe4→8c2fef04／staff_update_profile f6633371→b710ebae・生成器 docs/tmp/gen_0172.mjs（写経元 docs/tmp/0172_live.json＝10/14 読取・\r 込み md5 が pin と不一致なら生成しない）・手貼り案内 docs/demo/handpaste_0172.md）。suite 新設 2（gvb 22／cast-picker 3＝f0 119／120 段目）＋today-row tr(9-1〜3)＋張替え 7（messages ms(2-7)(2-9)(2-10)(2-14)／wish-state ws(4-1)(4-3)／systems-off so(2-1)／customers-keep ck(6-1)／master-top mt(5-1)／register-customer rc(1)＝教訓114 の pincheck（docs/tmp/q1015_pincheck.mjs）と残チェーンの単独走で f0 前に検知）。local next build 緑（教訓111）。f0＝**2 連緑 120 段 5,980**（run1d 18:12〜18:28／run2 18:35〜18:48・golden 5170／5931・withholding 125802 不変・+28＝gvb 22・cast-picker 3・today-row 3）。★run1＝messages の pin 3 本（張替え）・run1b＝payroll の statement timeout（E-9・起票116）・run1c＝customers-keep ck(6-1)（張替え）→残チェーンを単独走（master-top・wish-state・register-customer の 3 本を張替え）→run1d 緑。コミット＝dd8d956（feat・client＋suite＋package.json）／04fdcb5（docs＝裁定372〜384・349〜351／356 確定・教訓114・起票115／116・0172 起草・x13_ledger 42〜56・cron_setup 10/15）／e5fa875（fix・領収書シート＝教訓114 の単独走 gvb／messages／register-customer／register-sticky／n1014／nomination-card／register-tabs 緑・tsc 0・local build 緑）／本 docs（live）。push 04fdcb5（Vercel deployment success 18:53 JST・globals.css の塊 74c69837… に .nox-segtabs＝反映確認）。live（2026-10-15 19:2x〜19:5x・デモ ACE オーナー・390×844・横スクロール 0＝scrollWidth 390 全画面）＝店舗設定「利用機能」＝機能の公開カード（data-rtable・td は block／tr は flex・::before「機能」・FieldStack 1）／「店舗情報」＝シフト運用（キャスト確認トグルなし・自動確定時間 select 非活性 4 択）／料金「会計設定」＝時間料金設定 FieldStack 4＋SegmentTabs 48px（時間制課金 手動＊・単位 人数単位＊）／料金「料金適用ルール」＝ResponsiveTable（data-label 48・英字チップ 0）／待遇プラン#norma＝減額 軸ごと「定額／不足 1 日（本）ごと＊」入力 1 つ・両方入力の注記 2／/casts＝今期の時給「¥2,500 基本 日次・当期の累計で判定」・ノルマ「未達 本指名 0件/30件 売上 ¥0/¥800,000」・絞り込み（プラン／ノルマ／時給の段）・並び替え（名前／時給／達成率）／/shift 今日＝るな「出勤 20:00」チップ＋同伴（5 択なし）・ひなの／もも／のあ＝5 択／承認待ち＝キャスト別折りたたみ 7（▾あい（2件）…）・行「希望どおり採用／調整／見送り」・planned 行「調整／送り返す／削除」・「希望どおり一括採用（11件）」・段 1 2 3／/staff＝注記「シフト＝シフト画面を開ける権限…」（将来リリース 0）・編集シート「保存」56（「＋ スタッフ登録」はデモ非表示＝N7-2 ③）／/register A3＝会計 4 列（伝票／請求（サ料込）／入金済／残額）・「入金へ進む」56 幅 100%・「会計を分ける」・③なし→入金モーダル キーパッド 13・「入金する（¥14,520）」56→入金→③「会計を完了」56→会計完了シート＝領収書 3 入力（幅 328）・「発行」56・「分割して発行」48・「閉じる」48（★説明の残骸「（残額 ¥14,520）。」と閉じる重複を live で検知→e5fa875）／VIP-2 Cast Drink S＝既定チップ「担当中＊」（出勤中／担当中＊／すべて）／A1 指名・席＝「＋ お客様を追加」48→モーダル「伝票にお客様を追加」（この伝票のお客様／候補＊／全員／新規登録して選ぶ・48px・検索は上部 82px・全員＝50 音チップ 11・新規＝「登録して選ぶ」56）／予約＝「来店済」48→卓タイル→種別 4 分割（本指名＊）→キャスト 7（もも＊）→「伝票を開く」56（空卓なし＝非活性）・フリーでキャスト非表示・「予約どおり」0。★未確認＝ボトルキープの入口（ACE の開卓 6 卓にボトル行なし）・tel: リンク（デモ顧客に電話番号なし＝「—」）・スタッフ登録モーダル（デモ非表示）。★裁定379 はブロックに本文なし＝見出しを作らず（教訓70）＝相談役の本文待ち。★裁定381 の「シフト権限」は効かせた（can_shift=false の既存 staff は /shift が開けなくなる＝外すなら 2 箇所戻し・仮決め B-14）。★裁定383 の「出勤前＝5 択」と「遅刻を手で付ける操作は廃止」は両立せず＝5 択は現行のまま・出勤後の遅刻は自動のみ（仮決め B-15）。仮決め一覧＝docs/tmp/gvb_decisions.md（B-1〜B-17・E-16／E-17 候補）。x13_ledger に GV-23〜37「反映・目視待ち」（#42〜56）。次＝相談役 379 本文＋0172 ★指定→Agoora 手貼り→実装便（日払い種別・扶養申告書・店設定 3 項目・/terms/accept 開通ゲート・スタッフの電話／LINE ID 保存・期間精算から settlement 除外）。

**教訓候補 E-6／E-7（採番は相談役）**: E-6「f0 後の fix コミットは、触った文字列を pin する suite を単独走してから push（便 DM-1 で dp(5-1) の赤を検知）」／E-7「payload の行にキーが無い列は jsonb_populate で null になるが、payload を読む suite では undefined＝`=== null` が偽になる→payload を読む pin は `== null` で書く（便 P171 na(4-1)）」＝**教訓113 で採番（便 N1014）**。E-6 は候補のまま。**便 N1014 の候補 E-8／E-9（docs/tmp/n1014_decisions.md 逐語）**: E-8「文字列 pin の『不在』判定は対象ブロックの範囲で行う（`!rb.includes(">やめる</button>")` は他ダイアログの『やめる』で偽になる＝便 N1014 nd(1-2)）」／E-9「anon-guard の statement timeout は再走で消える既知のフレーク（便 N1014 f0 run1＝段28-18→28-21／22 連鎖）＝★f0フレーク=statement timeout型は再実行」／E-10「教訓110 の grep は『変えた文字列』だけでなく『変えたファイルを読む suite』を対象にする（便 N1014 f0 run1c＝messages ms(2-11) が shift-board の呼び出し順を indexOf で pin→A-6 の分岐追加で順が入れ替わり赤→lastIndexOf に張替え）」／E-11「suite の before／after スナップショットは fixture org に絞る（全体件数は、デモ org の実利用が並走すると偽赤＝便 N1014 f0 run1d の contract-ack ca(0-2)＝18:39 に LUNA デモで check_add_line が走っていた→audit_logs の count を org_id で絞った）」／E-12「payload に相対日の行を足すときは元データとの unique（shifts／attendance＝cast_id×date・punches）を生成器で先に落とす（便 N1014 19:30 の reset で 4 店が最終 chunk の unique 違反＝wipe 後に途中まで載った状態・route の markFailed の audit 行は残っていない）」／E-13「payload の相対日 $rel は営業日＝深夜（02:00）の退勤は in と同じ $rel に載せる（d+1 だと 1 日遅れ＝退勤なし・便 N1014 NEST レン）」。

**裁定372〜384 追補1（2026-10-16 確定・相談役 v46 §3・便 V46 V-2）＝便 GV-B の仮決め B-1〜B-17 を追認**: 出典＝相談役引き継ぎ v46 §3（docs/handoff/NOX_相談役引き継ぎ_2026-10-16_v46.md・「新チャットで台帳に記す・本書で確定」＝便 V46 V-2 で記入・2026-10-16）。**本文（逐語）**: 「**GV-B の仮決め B-1〜B-17**＝追認（372〜384 追補1）。」仮決めの逐語（docs/tmp/gvb_decisions.md は .gitignore＝ここが追跡される唯一の写し）:

| # | 裁定 | 仮決め | 理由 |
|---|---|---|---|
| B-1 | 382 | 共通部品＝components/ui/responsive-kit.tsx（lib ではなく components/ui＝JSX を含むため）。ResponsiveTable は thead の文言を MutationObserver で td の data-label に写す（<600 のカード化は CSS だけ）。SegmentTabs は .nox-seg と同居（.nox-seg.nox-segtabs の上書き） | 既存の .nox-seg pin を壊さない |
| B-2 | 382 | InfoNote は部品だけ（最初の 1 文＋ⓘ details）。2 行超の説明文は本便の 6 面に無かった＝適用先 0 | 適用先が無い部品を無理に当てない |
| B-3 | 382 | 英字チップ（eyebrow）は DOM に残し aria-hidden＋CSS display none（PageHead の props は不変＝各画面の pin を壊さない） | 既存 pin との共存 |
| B-4 | 372① | html／body overflow-x hidden＋.nox-main* min-width 0＋/analytics の固定幅（maxWidth 130・min(200px,100%)）。/shift 確定タブ上部の金色の帯は再現せず（同根ではない＝触らない） | 全画面 grep の型 |
| B-5 | 373 | 軸ごとに「定額／不足 1 件ごと」のセグメント 1 つ＋金額 1 つ。未選択側は **0 を送る**（set_penalty_config は 12 引数とも null を拒否＝null は送れない）。両方入っている既存店は normPenaltyModeOf＝「不足ごと」扱い（per＞0）＝一覧に件数（data-penalty-both の注記）。normPenaltyOf（golden 16,500）は不変＝新純関数 normPenaltyModeOf／normPenaltyOneOf を足しただけ | RPC 不触 |
| B-6 | 374 | 今期の時給＝/api/payroll/preview（当月）の PayResult の wdays 最終営業日の hourly／basis（別計算なし）。判定期間＝プランの slide_period＋店の slide_apply（next＝前期の実績で判定／current＝当期の累計）。達成状況＝cardAxesOf（/mine と同値）→ none／done／progress（経過率以上）／behind（経過率未満）。絞り込み＝待遇プラン／ノルマ／時給の段／今日出勤（ランクは既存チップ）。並び替え＝名前／時給／達成率。読取＝preview 1 本＋get_cast_sales 1 本＋cast_quotas／cast_norms／punches 各 1 クエリ | 1 クエリ＝表ごと（キャストごとの問い合わせ 0） |
| B-7 | 375 | ②は既存の入金モーダルを「入金へ進む」から開く（支払方法セグメント→金額＝既定残額→数字キーパッド→「入金する」主 56）。①の表は 4 列（伝票／請求（サ料込）／入金済／残額）＝小計・割引の列は落とした。③は allCovered のときだけ描画（残額があるうちは①②だけ）。会計分けは「会計を分ける」副 48（addSplitGroup 不変） | RPC・引数不変 |
| B-8 | 376 | 金額／宛名／但し書きを 1 行 1 項目（幅 100%）・「発行」主 56・「分割して発行」「閉じる」副 48。説明は 1 文（分割の案内文は削除＝ボタンが語る） | — |
| B-9 | 377 | 共通モーダル 1 つ（customer-pick-modal）に mode＝line（商品行・ボトル）／add（伝票の顧客追加）／select（キープの持ち主）。候補＝customer_list_summary＋customers（既存 2 本・N+1 なし・RPC 新設なし）。③全員＝50 音チップ（kanaRowOf＝ふりがな→名前）＋担当キャストチップ＋50 件ずつ。④新規登録＝customer_register→（add／line は check_customer_add）。select は選んだお客様が伝票に未付与なら併存で check_customer_add してから持ち主に。旧インライン候補（check-customers-card）と「指名・席タブへ」誘導は撤去 | 器あり＝0172 同乗不要 |
| B-10 | 378 | 卓タイル（開いている卓は選べない・予約卓に印）→指名種別 4 分割（初期値＝予約の nom_type・無ければフリー）→キャスト（初期値＝予約の担当・同伴は「同伴の相手」・フリーは非表示）→「伝票を開く」主 56。reservation_to_check は不変（p_nom_type に選択値）。キャストか種別を変えたときだけ戻り id で check_set_nominations（1 件・同伴＝hon＋is_dohan＋dohan_count 1）。予約カードの来店ボタンは 48px | RPC 新設なし |
| B-11 | 380 | 3 本道＝「希望どおり採用」＝shift_wish_decide→shift_confirm_bulk（即確定・店設定に依らない）／「調整」→希望の調整モーダル＝採用→shift_set（時間）→「調整して確定」は status confirmed・「調整して送り返す」は planned→shift_propose（キャスト確認待ち）。planned／proposed 行の調整モーダルも同じ 2 ボタン（confirmed は従来の保存）。planned 行に代行確定は出さない（調整して確定で代替）・一括代行確定は proposed のみ。承認待ちの既定＝キャスト別・見出し行で折りたたみ（既定は展開）。段は 3（審査中／採用・確認待ち（調整中・送り返し）／採用・確定）。castConfirm は常に true（proposed＝「キャスト確認待ち」）＝shift/page の prop は残すが読まない | RPC 3 本のみ |
| B-12 | 380 | 店設定「キャスト確認」トグルは撤去。「送り返しの自動確定時間（準備中）」を非活性 select で表示先行（0172 の shift_auto_confirm_hours＝整数 0〜168）。実行器（cron／RPC）は別起票 | 器は 0172 |
| B-13 | 381 | 「＋ スタッフ登録」＝名前必須・メール任意（入力したときだけログイン ID＝招待メールは送らない＝初期パスワード表示の現行経路）・電話・LINE ID・配属店・役職・契約区分（正社員／アルバイト／業務委託）＝電話・LINE ID・契約区分は **送らない**（器は 0172）＝注記。写真は登録後（編集シート）。編集シート＝名前／メール（owner）を縦積み・「保存」1 ボタン（変わった項目だけ送る）。電話番号の tel: リンク＝TelLink（顧客一覧の詳細・顧客詳細）＝スタッフには電話列が無い（0172 後） | 器は 0172 |
| B-14 | 381 | 「シフト権限の適用は将来リリース」注記は**効かせた**＝staff かつ can_shift≠true は /shift を /dashboard へ・nav のシフトも出さない（auth_staff_can_shift＝0022 で既設・authenticated 実行可＝live 確認）。理由＝/customers の can_crm と同型の器が既にあり、トグルが保存されるのに効かない方が事故（教訓25＝表示と状態は同コミット）。★影響＝can_shift=false の既存 staff（本番 CLUB NOX の staff 行）はシフト画面が開けなくなる＝相談役が「外す」なら shift/page.tsx と layout.tsx の 2 箇所を戻すだけ。デモ 6 店の staff は can_shift=true（gen-demo） | — |
| B-15 | 383 | 出勤前＝5 択セグメント（出勤・遅刻・当欠・同伴・休み＝現行の 5 語のまま）／出勤後＝「出勤 HH:MM」or「遅刻 HH:MM」（lateMinutesOf＝店設定 late_grace から自動）＋同伴トグルだけ／退勤後＝「出勤 HH:MM〜HH:MM」チップ＋操作なし（時刻修正は従来の文字リンク）。★「遅刻を手で付ける操作は廃止」と「出勤前＝5 択」は両立しない（5 択に遅刻が含まれる）＝出勤前の 5 択は現行どおり残し、出勤後の遅刻は自動判定のみにした。4 択（遅刻を外す）にするなら attendance の status 'late' を手で付ける経路が消える＝裁定要 | 逐語の矛盾 |
| B-16 | 384 | pickerDefaultChipOf＝seated＞0→担当中／working＞0→出勤中／それ以外→すべて。担当中 1 人なら selectedIds に入れて「{名前} に追加」主 56（data-pick-single）。分配率カードの CastPicker・378 のキャスト選択（予約の担当が初期値）にも同じ既定。切替ダイアログ（341）は CastPicker を使っていない＝対象外 | — |
| B-17 | 0172 | daily_pays.kind 既定 settlement・既存行も settlement（現行＝発行時 1 日分控除）。daily_pay_issue は p_kind（advance＝控除なし）。daily_pays_of_run は戻り型に settlement_gross／settlement_withholding／advance_gross を足すだけ（既存 4 列不変）＝「期間精算から settlement を除く」計算は client（lib/nox/payroll）の次便。cast_private は実在せず（cast_sensitive／cast_tax_profiles）＝扶養申告書は cast_tax_profiles に 2 列＋set_cast_dependents_form。PIN hash は staff_pin が既にある＝memberships に足さない。W-7 の RPC は不要。terms_accept は billing lock を見ない（開通前の同意）・terms_accepted_version_ok はデモ org 常に true | 器の最小 |

**便 V46 完了（v46 収蔵＋§3 の台帳記入＋HF-1 状態確認＋10/16 reset 読取）＝台帳の現在地（2026-10-16）**: 前提照合＝HEAD 2ddb5c0＝origin/main（rev-list 0 0・変更 0・未追跡＝poc-record.mjs のみ・★docs/expert/answers_20261014.md は 3af8907 で追跡済み＝v46 §0 と不一致だが安全側＝停止せず報告）・DB 恒久変更 0・DB 読取＝V-3 と W-10 の SELECT のみ（docs/tmp/q1016_v3_reset.mjs／q1016_can_shift.mjs・default_transaction_read_only）・f0 不走・migration 0。V-0＝v46 収蔵（sha256 5f001543…97fa・15,191 B・96 行 LF＝提示値と一致・引き継ぎ欄に行）・poc-record.mjs→docs/dp/poc_record_20261016.md（起票105 の処置）。V-1＝HF-1（361 の副作用＝900px 未満で本文が潰れる）の fix コミットは無し（直近コミットに「fix: 361」なし）＝390px の DOM 実測は【V-1 実測】に追記。V-2＝裁定379 欠番（380 参照）・381／383／373 に GV-B 要判断 3 点の確定（①can_shift 追認＝本番 CLUB NOX の can_shift=false は 1 件（佐藤）・②W-13 撤回＝5 択は残す・③W-3 0 送信追認）・372〜384 追補1（B-1〜B-17 追認・表を逐語で収載）・教訓候補 E-8〜E-17 の整列（下）・385／386 を案【相談役確定待ち】・387／388・352 追補1／356 追補1／370 追補1 を「確定・未実装（GV-C）」で記入・x13_ledger #57〜61（GV-38〜42）。V-3＝10/16 無人 reset OK（cron.job_run_details runid 59〜66＝purge 05:15・reset 6 店 06:05〜06:15・retry 06:35＝8 本すべて succeeded '1 row'／net._http_response id 52〜58＝7 本すべて 200・timed_out false・error_msg null（6 店 wipe+load chunks 3／3／3／3／4／4・retry は 6 店 skipped 'already reset today'）／audit demo.reset 26（4＋4＋4＋4＋5＋5・failed 0）／6 org demo_reset_at＝10/16（muse 06:05:08・luna 06:07:07・noir 06:09:05・ace 06:11:06・lily 06:13:08・nest 06:15:07）／payroll_runs 2026-09 finalized 6／casts 38・写真 38／cron.job 8 active）＝cron_setup.md に 1 行。次の採番＝裁定389・教訓115・起票117・恒久注意30（v46 §0 のとおり）。コミット「docs: v46 収蔵・裁定379 欠番・GV-B 追認・385／386 案・10/16 reset」＝docs のみ（裁定256）。次＝Agoora 0172 手貼り→P172。

**便 P172 完了（0172 収蔵＋349／351／356／380／381 の client＋cron）＝台帳の現在地（2026-10-16）**: 前提照合＝HEAD b04853d（V46 完了時）＝origin/main（0 0・変更 0）。DB 恒久変更 0（0172 は Agoora 手貼り 10:25・Q-0 live 照合 全一致＝上の 0172 の欄）・DB 読取＝SELECT のみ・migration 0。client＝**349**: lib/nox/pay.ts（dailySettlementGross＝課税ベースから除外・dailyAdvanceGross＝支給後控除のみ・既徴収の相殺廃止＝dailyWithholdingShort 常に 0・雇用の taxClass 甲／乙＝employeeTaxClassOf・税額表は器なし＝employeeWithholdingOf 0）・collect（kind 別合計・dependents_form）・assemble／core（2 列）・daily-pay-form（種別 SegSelect 既定 advance・p_kind）・sensitive-tax-panel（扶養控除等申告書＝雇用のとき・set_cast_dependents_form）・store-profile-panel（精算方式／途中払い＝settlement_cycle／mid_pay・lib/nox/payroll/settlement-cycle.ts）／**351**: lib/nox/terms.ts（TERMS_VERSION 0.9・termsGateRedirectOf・termsBlocksOf）・app/terms（force-static・noindex・docs/legal の md を build 時に読む）・app/terms/accept＋components/nox/terms-accept-form（owner＝同意して使い始める 56・他は オーナー待ち）・(manage)/layout の org 読取直後に terms_accepted_version_ok→/terms/accept（デモ org は読まない）／**356**: lib/nox/staff/pay.ts（staffHoursOf／staffPayOf＝雇用 時給×実働＋手当・源泉 0／委託 時給 or 日額×日数・率は T11 待ち 0）・/staff ?tab=work（staff-work-panel＝staff_contracts／staff_punches 直 SELECT・確定は無効ボタン＝第 2 期）・/staff/me（本人）・nav「勤怠」（staff）／**380**: lib/nox/shift/auto-confirm.ts＋/api/cron/shift-auto-confirm（15 分・proposed かつ updated_at < now−hours を confirmed・audit shift.auto_confirm は service grant なし＝起票115 同根）・店設定の select 活性（owner 保存）・cron_setup.md §6（Agoora 手貼り SQL）／**381**: route-guard tel／lineId・/api/staff/create p_tel／p_line_id・staff-board（登録で送る・編集シートに電話／LINE ID・staff_update_profile 4 引数・一覧に tel: リンク）。**止めた 2 点**＝Q-4 kiosk スタッフ群（punch 端末から PIN 照合・staff_punches 書込・一覧の RPC が無い＝kiosk_login は purpose 'register' のみ・Node に bcrypt なし＝0173 で kiosk_staff_list／staff_punch(p_membership_id, p_pin, p_kind) を起草）・Q-8 payload（demo_org_reset の c_load 固定配列に staff_contracts／staff_punches が無く 'bad table'＝0173 で c_wipe／c_load に +4 表）＝client に入口を作らず p172(7-1) で pin。T11 待ち＝委託スタッフの源泉率（staffPayOf の withholding_rate 0）・雇用キャストの税額表（employeeWithholdingOf 0＝起票113）。suite 新設 verify:nox-p172 30（f0 121 段目・live 6 段）＋張替え 7（0158 s-2 md5 3 本／s-3・t-1 関数 311 表 87／m-6 daily_pays 14・billing 段47-1 159／152／160／159・grants TABLES +4・G9 0156 daily_pays 14・gvb(9-3)(10-1)・payroll 0156-3／4＋0172-1・messages ms(2-1)＝/terms の RAW_PROP 形）。名簿＝A10 +set_cast_dependents_form・B(f) +terms_accepted_version_ok・B(m) +terms_accept・mig0172 追随・現在値 159＋152＝311。tsc 0・lint（新規 5 ファイル）0・local next build 緑（教訓111・/terms ○ static・/terms/accept／/staff/me／cron ƒ）。f0＝**2 連緑 121 段（grep 集計 115 本 5,907 assertion＋出力形式の違う 6 本）＝run1f 12:42:24〜13:06:21／run2 13:09:21〜13:35:15 JST・golden 5170／5931／125802 不変。★run1（11:13）＝anon-guard 段18 ①（0172 の合成 email で null／空白が成功＝pin 張替え＋残骸 2 組を検査用テナントで削除）／run1b（11:22）＝vip-unit vu(h1) 'bad amount'（読み直後の total のフレーク・単独緑 32・BANZEN ゲートと並走）／run1c（11:39）＝store-systems ss(4-0) 白名単 33→36／run1d（11:59）＝demo-guard dg(1-1) cron/shift-auto-confirm 未分類→B／run1e（12:21）＝master-top mt(7-3) set_store_profile の呼び口 2→1（setStoreProfile）＝いずれも張替え後に単独緑→run1f 緑**（golden 5170／5931／125802 不変）。コミット＝**3481ba4**「feat: 0172 client（349 日払い種別・甲乙／351 /terms と同意ゲート／356 勤怠・報酬タブ／380 自動確定 cron／381 tel・LINE ID）＋suite p172（355 kiosk スタッフ群・デモ payload は 0173 待ち）」push 済（origin 0 0）・【live】（2026-10-16 13:4x JST・Vercel 本番 nox-kappa-eight.vercel.app・デモ ACE オーナー・390×844）＝/terms＝200・版 0.9・h1 1／h2 16（第1〜16条）・「同意画面へ」・横はみ出し 0（scrollWidth 390）／/staff?tab=work＝タブ 一覧／勤怠・報酬（選択中）・行 2（店長＝契約未登録・小林＝契約未登録・0 日 0:00）・「報酬を確定する（準備中）」disabled／/terms/accept＝デモ org は /dashboard へ（ゲート除外）／kiosk スタッフ群＝未実装（0173）。★390px では HF-1（361 の副作用＝.nox-mainarea 64px）で本文が潰れたまま＝V46 V-1 の実測どおり・P172 の対象外（別便）＝DOM と 1000px で内容を確認。★本番 org（NOX-DEMO＝CLUB NOX）は次のログインで /terms/accept（owner の同意）が出る＝ローンチ前ゲートの初回。★追記（便 HF-1 まとめ版）＝anon-guard 段18 の張替え（null／空白 email＝0172 の合成 email で成功＝ガードの緩みではなく仕様の追従・検査用テナントの残骸 2 組は削除）・store-systems ss(4-0) 白名単 33→36・**cron nox-shift-auto-confirm を本番登録（Agoora 手貼り・cron_setup §6・10/16 14:00 JST 初回 200・count 0・14:15／14:30 も succeeded＝SELECT で確認）**。
次＝EX-R（読取）→0173 起草（相談役）・GV-C。
【V-1 実測】HF-1 実測（2026-10-16 10:5x JST・本番ホスト nox-kappa-eight.vercel.app＝HEAD 2ddb5c0 のデプロイ・デモ ACE オーナー・/dashboard・★ローカル dev は DEMO_USERS が無く /api/demo/enter 503「デモは準備中です」のため本番ホストで読取・登録／保存なし）: **390×844＝本文が 64px に潰れる＝HF-1 は未修正**。innerWidth 390・body scrollWidth 390（横はみ出し 0）だが .nox-layout の computed grid-template-columns＝「64px 326px」・aside.nox-side は class is-rail（data-side-mode rail）かつ display none・.nox-mainwrap／.nox-mainarea／.nox-tb の幅＝64px（本文の最初のカード 32px）。800×900 も同じ（「64px 721px」・mainarea 64）。1000×900 は正常（レール 64 表示・mainarea 921）。原因＝globals.css:2411 `.nox-layout:has(> .nox-side.is-rail) { grid-template-columns: 64px minmax(0, 1fr); }` が @media なし＝<900 の `.nox-layout { grid-template-columns: 1fr; }`（:1452）より詳細度が高く勝ち、aside が display none でも 64px の列が残って main が 1 列目（64px）に落ちる。side-nav.tsx は matchMedia 1280 だけで <900 を hidden にしない。修正案（本便では触らない＝P172 の前に相談役が別便で出す）＝2411〜2412 を @media (min-width: 900px) で包む（最小 1 行）か side-nav で <900 を hidden 扱いに＋suite sidebar-rail に <900 の pin を足す。

**便 HF-1 完了（361 の本文幅＋GV-46／47＋EX-R 追補）＝台帳の現在地（2026-10-16）**: 前提照合＝HEAD 9009575＝origin/main（0 0・変更 0）。DB 恒久変更 0・読取＝SELECT 3 本（comp_plans の形・slide_check・store_category_aggregate）・f0 不走（client の layout と docs のみ＝次の 0173 便の f0 で回帰）。**H-1**＝globals.css の 361 の 2 行（:has(> .nox-side.is-rail／is-hidden)）を @media (min-width: 901px) の中へ・<900 の .nox-layout は minmax(0, 1fr)＝rail の有無にかかわらず 1 列・本文 100%（PC ≥901 の配置は不変・sr(3) の pin 文字列は不変）。**H-2（GV-46）**＝≤899 で input／select／textarea（checkbox／radio／range／color／file 除く）を 16px !important（theme の inline fontSize 13 を上書き・maximum-scale 不変）。**H-3（GV-47）**＝/shift 今日タブの出勤前 5 択に .nox-attseg＝≤899 は横並びチップ（折り返し・各 36px・丸枠・選択中は primary 枠）・PC は .nox-seg のまま。tsc 0・単独 suite 13 本緑（sidebar-rail／layout-bottom／gvb／today-layout／today-row／x13／p172／n1014／shift-nav／statement-print／payroll-view／messages／master-top）・local next build 緑。コミット **17b2403**「fix: 361 の本文幅（900px 未満）＋GV-46／47」push 済・**a49696d**「fix: GV-47 の 5 択チップ＝371 の 5 分割（.nox-todaywrap）より後置・≤899 だけ横並びチップ」push 済。**H-4 実測**＝本番 nox-kappa-eight.vercel.app（17b2403→a49696d のデプロイ後・デモ ACE オーナー／キャスト・教訓112＝hydration 後に実クリック（今日タブ・卓タイル・指名席タブ・お客様を追加・新規登録して選ぶ）してから再評価）: **390／500／768 の 6 画面**＝/（本文 390／500／753・padding 16／16／20・.nox-layout 1 列（gtc 390px／500px／753px）・横スクロール 0・デモ帯 358／468／713＝全幅の通常段落）／/register（本文 390／500／768・「伝票にお客様を追加」モーダル＝検索欄 16px・新規登録の名前欄 3 つ 16px（3 幅とも）・モーダル幅 390／500／753）／/shift 今日タブ（本文 390／500／753・5 択＝[data-att-seg] 5 個の button 52×36・padding 6px 12px・丸枠 999px・1 行に 5 個＝個別要素・入力欄 3 本 16px）／/mine（キャスト・本文 390／500／753・入力 9 本 16px）／/staff（390／500／768）／マスタ 報酬設定 /master/cast-comp（390／500／753）＝全画面 scrollWidth＝ビューポート（横スクロール 0）・可視 input／select／textarea の最小 16px。1000px＝371 の 5 分割グリッド（repeat(5, minmax(0,1fr))・padding 0）のまま＝PC 不変。★初回デプロイ（17b2403）では 5 択が 371 の `.nox-todaywrap .nox-attrow > .nox-seg`（詳細度 0,3,0）に負けて padding 0・幅 28px だった→a49696d で同じ詳細度の規則を後置（≤899 だけ）→緑。live（ACE 390px）＝/ と /shift の 2 画面を上の実測と同時に確認。H-5／H-6／H-7＝裁定385 追補・389 追補1／2／追記・390・391・起票110（ブロックの 109）前倒し・E-18 候補・x13 #58 修正済み＋#62〜71（GV-43〜54）・R-5c＝ACE の売上歩合は pay.ts の DEFAULT_SALES_BACK_TABLE が無条件（collect が salesBackTable を渡していない）＝GV-C で sys_sales_rate OFF の店は [] を渡す（golden 不変）・ex_plan R-4b／R-5／R-5b／R-6b。次＝0173 起草（相談役）。

**便 M173 完了（0173／0174 起草＋handpaste＋台帳・ex_plan）＝台帳の現在地（2026-10-16）**: 前提照合＝HEAD 409543b＝origin/main（0 0・変更 0）。DB 恒久変更 0・DB 読取＝SELECT のみ（docs/tmp/q1016_m173_live.mjs→docs/tmp/0173_live.json＝live 39 関数の定義・CHECK・列・policy・default_transaction_read_only）・client 不触・f0 不走・**migration は起草のみ（適用なし）**。M-0＝393 追補1・395 追補1・裁定392 の見出し補完（教訓70）・裁定396（M-0 差替）・E-18→教訓115・起票 109→110 の訂正（台帳行 110 に記載済み＝ブロックの番号 109＝台帳 110）・0173／0174 の欄（上の mig 欄）・x13 #72〜75（GV-55〜58）。M-1／M-2＝上の 0173／0174 の欄（sha・行数・見込み）。M-3＝検証クエリ 13／11 本・貼り先証明＝両方の冒頭と verify の 1 本目。M-4＝docs/demo/handpaste_0173.md／handpaste_0174.md（0172 と同型・順序 0173→0174・恒久注意28）。M-5＝ex_plan「P173 で張替え」（docs/dp/ex_plan_20261016.md M173-1）。M-6＝payload 差分案（同 M173-2）。M-7＝GV-56（同 R-11＝期限付き保証の保存先と 4 か所・DB 変更なし）。M-8＝GV-58（同 R-12＝ホームは client の load() 1 回・revalidatePath は NOX に 0 件＝全書込が client の rpc・DB 変更なし）。★仮決め（相談役確認）＝①393 の「カード 既定 10%」は UI の新規店の初期値（DB は欠損キー＝0）②385 の 3 本上限は新規追加時のみ（live に 5 本の店が 1 つ）③386 のセット凍結＝checks.set_frozen（auto 店の apply も不触）④385 追補の切替＝確定ブロックは新単価で引き直し（分数違いはブロック数不変）⑤389 追補1＝set_staff_pin／staff_pin_status の staff は can_register に関わらず PIN 可（0174 の staff_punch 用）⑥394 の新 5 引数に既定（EX-1 までの旧呼び互換）⑦396 の一括操作は client（RPC は作らない）。コミット「feat(mig): 0173 register_payment・0174 comp_norm_staff 起草＋handpaste」（mig 追加のみ・適用なし）。裁定397（働き方＝器 0175・P175）を M-0 追記で収載（docs コミット「docs: 裁定397（働き方）」）。**便 M173-fix（2026-10-16）**＝Agoora の本番手貼りで 0173 が 42601（LINE 2042: end $function$;・単一トランザクションで巻き戻り＝関数 311 のまま）。原因＝gen_0173.mjs の bottle_keep_register の置換＝`values (…, 'active', now(), p_note,` という行の途中で終わる anchor に `-- ★5 …` を足し、同じ行の残り（p_remaining_pct〜p_check_line_id)）がコメント化＝insert が閉じないまま $function$ に達した（ドル引用タグは 24 本×2 で対応・ずれなし）。同型が 0174 の demo_org_reset c_load 1 行目（'cast_ranks', の後に表名が続く）にもあり同時に修正。生成器の rep() に guard（行の途中で終わる anchor＋コメント付き to＝同じ行の残りがコードなら生成を止める）。**恒久注意30**＝「migration は手貼り前に libpg_query かローカル ROLLBACK で構文検査（0173 で 2,042 行目のドル引用ずれ＝実体は行の途中のコメント）」＝scripts/mig-check.mjs（libpg_query 17 wasm で全体 parse＋ローカル使い捨て Postgres で plpgsql を CREATE＝BEGIN…ROLLBACK・127.0.0.1 以外は拒否）・手順＝docs/dp/mig_check.md。結果＝cbd89d1 の 0173 で同じ 42601 を再現・修正後の 0173（2,781 行・sha 7b116cea9ca08a5e3f88a6e6f9b66a47693eae2056c464298a0cfd969f09faef）／0174（613 行・sha 8c2df449a1648f22b5a060f75931fd300e102bac796153abe02421ada9b9f009）は両方 errors 0（0173 plpgsql 22・sql 2／0174 plpgsql 5・sql 1）。見込み値（関数 312／314・表 87・gated 160・pin 24＋6）は不変・md5 pin は bottle_keep_register（579efaff→6cce7d77）と demo_org_reset（4a1fa1ea→3cdf7a30）の 2 本が変わる（handpaste と mig 欄は同期済み）。E-19 候補。コミット「fix(mig): 0173 ドル引用の対応・0173／0174 構文検査」。**便 VQ（2026-10-16）**＝Agoora の手貼りで **0173 適用**（SQL Editor の最終行＝functions 312／tables 87／gated 160＝見込みどおり）。Editor は最後の文しか返さないため 13 本中 12 本の返り値が未取得→**恒久注意31**＝「Supabase SQL Editor は最後の文の結果しか返さない＝検証は union all の 1 文で」＝docs/demo/verify_0173_0174.sql（31 行・mig／k／v／expected／ok・関数数／表数／gated／md5 pin 24＋6 の一致数と不一致名／新列／CHECK／index／policy／引数／移行行数／既存データ不変）・handpaste_0173／0174 の §3 を差替え・template に注記。**live 照合（CC・便 VQ・2026-10-16・SELECT のみ＝docs/demo/verify_0173_0174.sql を default_transaction_read_only で実行）**: 31 行すべて ok=true＝**0173 と 0174 の両方が本番に適用済み**（関数 314／表 87／'billing locked' 160・md5 pin 24＋6 全一致・不一致名 空・新列 8＋6・CHECK pending／pay_fee・index・policy cast 枝・引数 17／8／17／30・旧版なし・新設 3 本・anon 付与 0・内部専用 5 本 authenticated なし・thresholds 移行 2/2・既存データ不変＝bottle_keeps active 以外 0／is_default_ext 0／set_frozen 0／slide_apply null／4 段以上 0・demo_org_reset 4 表）。手貼りの時刻は Agoora の申告待ち。 0173／0174 の欄＝「起草のみ・手貼り待ち」→**本番適用済み**（下の mig 欄に追記）。コミット「docs: verify_0173_0174 1 文化・恒久注意31」。次＝P173（live 照合・pin 張替え・client＝EX-1 の器側・payload・f0）→0175 起草（397）。

**CLUB NOX の扱い（2026-10-19 Agoora 判断）**: CLUB NOX（org NOX-DEMO・is_demo=false）は Agoora のテスト店舗。ローンチ前の是正対象外。実店舗の初期設定は OB 便（初期設定 v4）で月次／半月を選ぶ（docs/demo/handpaste_plan_monthly.md＝「適用しない」で保管）。

**便 P173 完了（0173 client＋payload・T-2 達成ボーナス多段・GV-62／GV-63・デモ 6 店の復旧）＝台帳の現在地（2026-10-19）**: 前セッションが文脈上限で終了→新セッションで再開（作業ツリーは未コミットのまま保全＝reset／checkout／stash なし）。**S-0**＝HEAD 57d9737＝origin/main（rev-list 0 0）・変更 50（M 47・未追跡 3＝lib/nox/register/cast-entry-server.ts／p173.ts・verify-nox-p173.ts）・セッションプーラー 5432 で select 1＝645 ms（ref hiqbfagmkrdpmlqhkmsu）。typecheck／lint（変更ファイル）緑。

**便 P174 完了（0174 の client＝390／394／395・GV-55／56・kiosk スタッフ群（355）・スタッフ勤怠・報酬（356／追補1）・ACE 延長 3 本）＝台帳の現在地（2026-10-19）**: 前提＝HEAD 44e32bd＝origin（0 0・変更 0）。DB 恒久変更 0・読取は SELECT のみ。**T-0**＝x13 #80 GV-59（裁定402）・#81 GV-60（裁定403）・裁定402／403 を記入・ex_plan R-13（receipt_issue は伝票 id で呼べる・日付訂正／対応関係／操作者は引数も列も無い＝0175）。**T-1（390）**＝lib/nox/comp/slide-rows.ts（1〜10 行・初期 3・昇順 strict＝RPC と同条件・時給の下降は警告のみ）・SlideInput の追加／削除・plan-editor の保存前検査・見出しの「3段」撤去。**T-3（394）**＝PenaltyTab 4 軸（出勤日数・同伴・指名・売上＝単位 既定 10,000）・採用 OFF の軸は非表示・set_penalty_config 17 引数を常に明示（penaltyArgsOf＝★12 引数のままだと保存のたびに新 5 引数が既定へ戻る）・「表示のみ」注記を撤去・GV-51（猶予 3 欄をパネル先頭の独立行）。**T-4（395／395 追補2）**＝collect がキャストごとに applyOf（プランの slide_apply→店設定）＝前期窓・期間キー・暫定・'next' 入力の 5 か所・core は c.slideApply・plan-editor は p_slide_apply を常に明示＋詳細設定（店の設定に従う／前期の実績／当期の累計・主表示は判定期間）・新規の UI 初期値 next。★既存の穴を同時に塞いだ＝プランの複製／無効化（plan-board saveFrom）が 23〜30 引数と区分別 3 欄を送らず RPC 既定（slide_period daily・basis sales・ランク空・目標 null・slide_apply null・区分別 null）へ戻していた→行の現在値を写す／plan-editor の保存も区分別 3 欄を null に戻していた→行の現在値を写す。**T-5（GV-55／56・R-11）**＝lib/nox/cast/wage-now.ts（base＝非保証行の値・保証＝今日を含む保証行・接尾「保証（M/D まで）」／売上段／pt 段／基本）・currentWageOf(rows)・casts-board のカード／詳細（「基本時給 ¥2,200／保証中 ¥3,200（10/18 まで）」・個別上書きは非保証キーだけ）・/mine の印・給与（R-11 (d)）＝lib/nox/payroll/base-override.ts（期首行が保証行なら base／guarantee を外し戻し行の base）。**T-6（355）**＝kiosk にキャスト群／スタッフ群のタブ（kiosk_staff_list・staff_punch・スタッフは送りなし・'not in' の和文）・操作担当 PIN の候補に staff（can_register 条件を外す＝0173）。**T-7（356／追補1）**＝給与画面のキャスト／スタッフ切替（?who=staff）・勤怠・報酬の押せない「確定（準備中）」ボタンを撤去→確定状況（staff_payroll_runs の読取）＝**確定の書込 RPC が無い＝0175**（教訓25）。**T-7b**＝ACE の平日通常に延長 3 本（30 分 ¥7,000〈既定〉／60 分 ¥13,000／VIP 延長 30 分 ¥9,000＝席種は限定しない）・週末 1 本は据え置き・payload の差分は ACE の pricing_rules のみ。
**pin 張替え（旧→新→理由）**: 338＝sp(3-1) select に slide_apply・src は applyOf／sp(3-2) core は c.slideApply／sp(4-1) ピル・説明は effApply（395）・w52b＝sb(5-1) select に slide_apply（395）・p172＝p172(3-2) 確定ボタン（無効）の pin を「確定状況の表示・ボタンなし」へ反転（356・教訓25）・新 suite verify-nox-p174（f0 123 段目・19 checks）。golden で動いた行 0（玲奈 5931／125802・payroll 233 不変）。
**f0**＝run a（338 の文字列 pin で赤 3）→338／w52b を張替え→338 より後ろの 23 本を単独で一括洗い（教訓115）→run b 未走・run c 緑（123 段・1,586 秒・5,983）・run d 赤（30 段目 rate-back＝DB の遅延・単独は緑 64）・run e 赤（1 段目 ECHECKOUTTIMEOUT）→**DB 接続不可で停止（16:19）**→Agoora が compute Small＋再起動（16:30）→**run g 804 秒・h 732 秒＝123 段 2 連緑（括弧内の合計 5,983・玲奈 5931／125802・payroll 233）・run h （上に同じ）**。
**コミット（push 済）**＝a22542f「feat: 0174 client（390／394／395）＋kiosk スタッフ群＋スタッフ勤怠」。**6 店 reset**＝17:00 ローカル admin client（docs/tmp/q1019_d1_reset.mts・デモ 6 org のみ）＝6 店 ok（chunks 3〜4・2.7〜6.2 秒）・demo_reset_at 17:00・件数は 10:46 と同じ。
**live（ACE 390px・オーナー・17:0x・a22542f のデプロイ後）**: ①スライド 10 行＝ACE Sales Slide の売上スライドに 7 行を追加（10/10 で追加ボタンが消える）→保存→DB 10 段（最終 4,400,000→¥8,000）・slide_period monthly／slide_apply next を保持＝OK ②減額 4 軸＝ACE は採用軸が指名・売上の 2 つ＝その 2 軸だけ表示（OFF 軸は非表示）・猶予 3 欄は先頭の独立行・指名 定額 3,000／売上 不足ごと 500（単位 10,000）を保存→DB 一致・出勤日数／同伴の値は保持＝OK（★既存の挙動＝定額も不足ごとも 0 のとき「不足ごと」を押しても定額に戻る（normPenaltyModeOf・裁定373 の部品）＝金額を入れてから切替で回避・GV-C 候補）（★店の採用軸の注記「未達は表示のみ・報酬には接続されません」が norm-config-panel に残存＝GV-C で直す）③ひなの ¥3,500＝**NG（データ）**＝カードは ¥2,500 基本・プレビューの wdays 0 件＝デモ payload のひなのの打刻・出勤は 9 月分だけ（10 月は退勤 1 件・確定シフト 4）＝7 人とも 10 月の勤務日 0＝段の時給が出る材料が無い（DB のプランは monthly／next・段 80 万／120 万／160 万で正しい）→判断待ち（前期判定のプランは勤務日 0 でも段を出す or payload に当月の勤務）④せな「¥2,500 基本」・るな「¥3,200 保証（10/21 まで）」＝OK ⑤kiosk スタッフ（MUSE）＝タブとスタッフ 2 名（デモ店長・田中）は出る・2 名とも「PIN未設定」＝**打刻不可（データ）**＝payload に staff_pin が 0 件（cast_pin は 1234 のハッシュで入っている）→GV-C で payload に店長・スタッフの PIN（1234）を入れる・打刻は PIN 入力が要る＝Agoora ⑥/staff 勤怠タブ（MUSE）＝7 日分（業務委託 ¥2,000・正社員 ¥1,300）・確定状況「未確定（見込み）」＝表示 OK・★実働 224:00（1 日 32 時間）＝payload の退勤が $rel d+1 02:00＝dateshift は深夜を翌暦日に送る規約＝2 日後の 02:00 になっていた→GV-C で $rel d 02:00 に直す ⑦ACE のレジで延長 3 択（VIP-2 で新規開卓）＝「延長 30分 ¥7000（既定）」「延長 60分 ¥13000」「延長 30分 ¥9000」＝OK
**読取（便 P174 同乗）**: ①キャスト売上の配分（複数指名）＝cast_sales_aggregate が check_nominations.ratio_weight で按分（整数演算・剰余配り・全 0 は按分なし）・get_cast_sales・給与（collect→payOf・allocateQty は本数）・ランキング（get_cast_ranking＝本数・売上軸は get_cast_sales）・ノルマ進捗（sumCastSales）はすべてこの按分結果・初期値＝レジの defaultWeights（最上位種別の人数で 100 を均等）・**店設定で均等に切り替える器は無い**（settings_json に配分キーなし）→裁定409 を 0175 の対象に。②本番 CLUB NOX の comp_plans＝5 件とも判定期間 daily・基準 sales・ランク 0・目標 null・slide_apply null・区分別 null／audit set_comp_plan 5 件（新規 3・更新 2＝エース 9/18 有効のまま・あああ 10/13 無効化＝saveFrom の経路・before の slide_period も daily＝判定期間は戻っていない）／判定基準・ランク・目標・slide_apply・区分別は **audit の after_json に記録されていない＝意図か戻りかは判別不可**（これらを既定以外にした set_comp_plan の痕跡はない）→起票118。③R-0（16:3x）＝pg_stat_activity は再起動直後のみ（PostgREST idle 2・pgbouncer／Supavisor 3・pg_cron・pg_net・exporter・Storage 各 1・max_connections 90）＝2 日 idle 15 本の持ち主は再起動で消え特定不可。
**GV-C 追記**＝C-14g（新規の待遇プラン作成＝template／saveFrom 以外の新規経路で、判定期間・判定基準・対象ランク・既定目標・slide_apply・区分別固定額を毎回送る・未入力は店設定の既定・RPC 既定 daily に頼らない）・C-14h（X-13-2 の未反映＝900px 未満はアカウントボタンで下からのシートに「登録名・役割・店舗＋ログアウト」＝PC のポップオーバーと同じ中身・メールは両方とも出さない・「登録名・メールの変更はスタッフ画面（オーナー）から行います」はオーナーのときだけ・PC のポップオーバーはヘッダー直下の右寄せでデモ帯の文言に重ねない・x13 の X-13-2 を済に・live ⑮＝390px でアカウントボタン→下シートに 3 行＋ログアウト）・C-0 追記（x13 の X-13-1〜＝10/9 以降の目視分を一覧し live で未反映のものを列挙・未反映は GV-C で直すか番号ごとに理由を報告）。**次**＝GV-C（C-14e／C-14f／C-14g を含む）・0175 起草。
**便 GV-C 完了（まとめ便 G・2026-10-19）＝台帳の現在地**: 前提＝HEAD 59d826f＝origin（P174 docs）。DB 恒久変更 0・DB 読取は SELECT のみ・migration の起草なし。**コミット**＝1c4c4d8（fix: GV-C・49 ファイル）→c09b92a（fix: GV-C live＝下の 2 件）。**実装**＝C-1（387 お預かり 1 欄・お釣りの枠・送る額は min(入力, 残額)）・C-2（352 追補1 開卓のお客様＝check_open 後に check_customer_add）・C-3（388 給与の自動表示＝run 読込後だけ・暫定ピル・行ごとの明細 PDF）・C-4（370 追補1 連続する同一商品は ×N・お客様チップは条件付き）・C-5（GV-43 制度 OFF の出し分け＝スライドタブ・ボーナス・シミュレーター）・C-6（GV-44 最近使った＝この伝票の商品行）・C-7（GV-48 ハブの説明 1 行）・C-8（最終来店＝営業日の n日前）・C-9（GV-52 ON／OFF の共通部品 OnOffSeg）・C-10（GV-53 OFF の制度の行）・C-11（GV-54 日報の締め＝予定額 28px・差額 ¥±・4 欄 2×2／スマホ 1 列・¥ 接頭・締め確定 56・締め済み行 14px）・C-12（GV-58／R-12 useLiveReload＝ホーム・/shift・キャスト一覧）・C-13（GV-59 台帳の再発行・公開ページ・印刷＝共用 ReceiptPrintSheet・再発行＝取消→同額で receipt_issue）・C-14（GV-60 日の状態 7 種・凡例 345 の語・過去月も確定実績・/shift 月表示も同じ色）・C-14b（GV-61 任意欄の autofocus 撤去）・C-14e（GV-64 ≥1280 の 5 択は潰さず送り／退勤は右寄せで折り返す）・C-14f（GV-65 裁定396＝体入タブは在籍区分で絞る・体入を追加＝cast_create→set_cast_plan→set_cast_guarantee・本採用＝既定プランへ set_cast_plan・在籍キャストへの体験入店は警告・残日数チップ）・C-14g（初期設定の新規プランも 30 引数）・C-14h（X-13-2 アカウントの注記はオーナーだけ・PC は右寄せ）・payload（MUSE／LUNA のスタッフ退勤＝$rel d 02:00＝1 日 8 時間・staff_pin 4 行）・norm-config の「表示のみ」注記撤去。**仮決め（相談役確認）**＝①本採用で在籍区分（casts.kind）を書く RPC が無い＝本採用はプラン切替だけ・体入タブは「区分 体入 ∧ プランが体験入店／なし」（kind 更新は 0175）②再発行の対応関係・日付訂正・操作者は 0175（今は 2 RPC の順呼び＝非原子・途中失敗は取消済みの行から再発行し直せる）③体入の保証額＝体験入店プランの基本時給④直接登録の区分の既定を「体入」→「レギュラー」⑤顧客モーダル「新規登録」後の名前欄は autofocus のまま（押した直後に打つ必須欄）⑥初期設定の新規プランの判定期間＝月次。**suite**＝verify:nox-gvc 新設（25 checks）・f0 124 段。張替え＝p173(4-5)・norm-axes na(3-1)・register-customer rc(3)・mine-cast-settings mc(4-2)（いずれも GV-C で変えた文字列）・CSS は ms(2-25)／x13 の pin 文字列を保つ形に。**f0**＝1c4c4d8 前：run1（17:39）customers-keep ck(0-2) 赤＝DB 全体の check_lines／stock_logs 件数が +6（17:44:46 に CLUB NOIR へ実書込＝デモの外部操作・下の E-22）→run2（17:48）337 c337(1-2) 赤＝casts の select に kind を末尾へ足して pin 文字列が崩れた→列順を戻す→**run3（17:59〜18:08）・run4（18:11〜18:19）＝124 段 6,115 の 2 連緑**・golden 不変（pay 130・payroll 233・5170／5931／125802）・local build 緑。c09b92a 前：**run6（18:31〜18:38）・run7（18:41〜18:48）＝124 段 6,116 の 2 連緑**・build 緑。**デプロイ**＝1c4c4d8 は 18:21 JST に到達（ACE owner の /receipts 本文で判定）・c09b92a は 18:52 に到達（シートの位置で判定）。**6 店 reset**＝18:21:33〜18:21:56 ローカル（q1019_d1_reset.mts・admin client・6 店とも wipe+load ok・payroll finalized）。**live（本番・デモ ACE オーナー／キャスト ひなの／MUSE 端末・375／1,100／1,280／1,440／1,920）**: ①日報の締め 375＝1 列・¥ 接頭・予定額 28px・実査 49,000 で「差額 −¥1,000」・締め確定 56・締め済み行 14px／1,280＝2×2 ②今日タブ 1,280／1,440／1,920＝5 行とも 5 択と送り／退勤の重なり 0・5 択の容器内スクロール 0 ③給与 10 月＝プレビューのボタンなしで 7 行・暫定ピル・行の明細 PDF 7・るなの明細に OFF の制度の行なし ④マスタのハブ 9 枚＝説明 1 行 ⑤利用機能＝OnOffSeg 19 個・ON 青／OFF グレー・状態文字・OFF 行 8 が減光 ⑥待遇プラン＝スライドタブあり（売上スライド ON）・pt スライドの節なし ⑦体入タブ＝るな 1 名（体験入店・「保証 あと2日」・KPI 体入中 1 名）・詳細に本採用（デモは店の既定プラン未設定＝候補から選ぶ形） ⑧顧客詳細＝最終来店 9/25→「24日前」 ⑨開卓モーダル（VIP-2）＝「お客様（任意）お客様を選ぶ」 ⑩伝票 A1＝最近使った 4 品＝この伝票の商品・チップ 0（お客様 1 人） ⑪入金＝1 欄「お預かり」・¥35,000 で「お釣り ¥4,007」・送る額 ¥30,993（入金はしていない） ⑫/mine（ひなの）＝日の状態の印・凡例 7 語・10 月 確定 4／確認待ち 1／審査中 2／募集中 3・9 月 確定 20（減光なし） ⑬端末（MUSE）＝キャスト／スタッフのタブ・スタッフ 2 名・PIN 画面（PIN は入力していない＝Agoora） ⑭スタッフ打刻＝MUSE／LUNA とも 1 日 8 時間×7 日×2 名（旧 224:00 の解消）・staff_pin 4 行 ⑮アカウント 375＝**NG を発見→修正**: シートが画面外（上）＝ヘッダー .nox-tb の backdrop-filter が fixed の基準になり overlay が高さ 63px→UserChip のモーダルを body へ portal（c09b92a）→再確認で 591〜812 の下シート・3 行＋ログアウト・メールなし・注記はオーナーだけ／1,280＝ヘッダー直下 72px・右寄せ。**追加修正（live）**＝/mine の確定明細（9 月）のスライド行に「／pt 0→¥0」＝pt スライド OFF の店でも pt 部分が出ていた→breakdown-lines は売上／pt の片方だけ OFF でも OFF 側を出さない（段で時給が付いていれば出す）＝c09b92a。**C-0（x13 の未反映）**＝X-13-2（≤900 の下シート）＝上の⑮で未反映を発見→c09b92a で反映・GV-49（392 キープの会計前表示）＝live 確認には書込が要る＝未確認（P173 で実装済み）・#15／16＝仮決め 13 点の赤入れ待ち（コードではない）・GV-45／51／57／62＝live で確認済み・x13 の状態列を 21 行「済（便 GV-C）・目視待ち」に更新。**残**＝normPenaltyModeOf の 0 円トグル（P174 live ② の癖）未着手・デモ 6 店に default_plan_id 未設定（payload 追補）・デモに発行済み領収書なし＝台帳の行操作は live 未確認。
**便 ON-2（2026-10-26・MUSE＝CANON 型＝P-6 の payload を適用・裁定418 ①②④⑥⑦⑨）完了＝台帳の現在地**: 前提＝HEAD fe265e7（414 追補）。**読取**＝①payload は RULES_0175_APPLIED=true の再生成で主プランに CANON（reward_axis pay_rate・段 10・streak 2・免除 3 か月）が入る ②「22:00 入店のセット ¥8,000」は料金ルールの時間帯（pricing_resolve_core が started_at で解決）＝MUSE の元データは 1 本（通常料金 90 分 ¥5,500）→CANON のルール 3 本に差し替え ③「VIP のサービス率 35%」は check_open が stores.service_rate を凍結するだけ＝**DB が要る→0181 起草**（check_open が stores.service_rate_by_seat（0175 ★11 の列・seats.kind がキー）を凍結・md5 c67dcab6→9869c236・sha16 10769e5f9d9603ea・mig-check OK・本番 ROLLBACK 試走＝VIP 卓 35／通常卓 10・handpaste_0181.md）・MUSE には VIP 卓が無い→payload に VIP 卓 1 ④同伴バックの時間帯＝plan_rate_bands（c_load に無い＝reset 後処理で入れる）＋collect／pay の配線が無かった ⑤「誰のドリンクか」の非表示＝drinkCountBackOn が店設定パネルだけで、レジに配線されていなかった ⑥給与の「報酬率 ○%→段」の行は無かった（pay.ts の canon は値だけ）。
- **実装**: gen-demo＝CANON 店に VIP 卓・時間帯別セット 3 本（〜22:00 ¥6,000／22:00〜 ¥8,000／深夜 ¥8,000・priority 90）・stores の列 service_rate_by_seat {VIP:35}（settings_json からは外す）・サ料 30・主プランの本指名 率 10%／場内 500 は末尾で上書き（前の spread が per_count で潰していた）／seed.ts afterResetHooks＝demoCanonBandsFor（reward_axis pay_rate のプランに plan_rate_bands dohan_back 3 帯＝20:00〜20:30 30／20:35〜21:00 20／21:05〜22:00 15・plan_norm_tiers 3 段）／collect＝plan_rate_bands と check_nominations（is_dohan・ratio_weight・checks の started_at／total）を読み、同伴伝票のキャスト分（total×weight÷Σweight）×帯の率＝CanonCtx.dohanBandBack／pay.ts＝帯があれば同伴バックを置換（無ければ従来＝golden 不変）／breakdown-lines＝「報酬率 42.3% → 段 2（UP +¥300/h）」「提案＝店が適用を選ぶ・連続 1／2 期」の情報行／register＝ドリンクバック OFF の店はタップ 2 か所と行のボタンで「誰のドリンクか」を聞かない。suite verify-nox-on2（12 checks・f0 136 段目）・張替え p175prep(2-8)（CANON spread 3）。
- **f0**＝run1 136 段 6,493 緑（13:54→14:03）・run2 136 段 6,493 緑（14:03→14:12）＝2 連緑・golden 不変（5931／125802・pay 130・payroll 234）・tsc 0・build 緑。**コミット**＝feat 8f8436e push 済み（14:13）。**deploy**＝GitHub deployments（Vercel）で 8f8436e success 14:15:39（push から 2 分）。**6 店 reset 14:15〜14:16**（cron route・6 店 ok＝修正済み payload で wipe+load 成功＝**06:05 の無人 reset は落ちない根拠**＝同じ route・同じデプロイ済み payload を 6 店とも通した）。
- **live（本番・MUSE オーナー・内蔵ブラウザ）**: ①セットの時間帯＝本番の pricing_resolve_core を MUSE オーナーの claims で直接引いた（SELECT）＝20:00→¥6,000／22:10→¥8,000／03:00→¥8,000／14:40→一致なし（店の基本 ¥6,000 に落ちる）。レジで T4 を 14:4x に開卓→明細「セット料金(90分) ¥6,000」・サービス料 30%・合計 ¥8,580（VIP 35% は 0181 待ち＝列には {VIP:35} が入っている）。★live ① の初回は ¥5,500 だった＝gen-demo の深夜帯 0〜1139 が cutoff 06:00 の正規化（from<cut だけ +1440）で決して一致せず、店の基本 set_fee 5,500 に落ちていた→深夜帯を 0〜359 に・CANON 店の set_fee を ¥6,000 に（gen-demo 2 か所・payload 再生成・on2(2-2) 張替え・6 店ローカル reset 14:4x）＝本便のコミットに同乗（ON-3）。②給与 10 月（暫定・さおり）に「報酬率 35.1% → 段 1（UP）／提案＝店が適用を選ぶ・連続 1／2 期／—」の行（売上スライドの行の直下）。③同伴バック ¥2,087（帯の率×同伴伝票のキャスト分＝従来の円／本の倍数でない・plan_rate_bands 3 帯が reset 後処理で入っている＝SELECT で確認）。④レジでキャストドリンクをタップ→「誰のドリンクか」のモーダルは出ず、そのまま明細に入る（最近使った に出る）。
- **【事後承認待ち】**: ①0181（check_open の卓種別サ料）は手貼り待ち＝VIP 35% の live はその後 ②深夜帯の定義＝0:00〜05:59（cutoff 手前）・06:00〜開店前は店の基本（〜22:00 の単価）に落とす＝相談役案で確定扱い ③同伴バックの帯＝入店時刻（checks.started_at）の分で引く・最後の帯の後は直前の帯を引き継ぐ（bandValueOf の隙間規則）。

**便 M（2026-10-26・M-1〜M-13＝390px 実機指摘＋確定動線＋シフト権限＋新規客の予約＋ノルマ未達の意思保存）＝台帳の現在地**: 前提＝HEAD ad44b90（ON-4）＝origin。DB 恒久変更 0（0183 は起草のみ）。本文＝台帳「M-10」「M-11」「裁定429」「裁定430（提案中）」の節と、相談役ブロック（M-1〜M-9・2026-10-26 13:2x〜14:0x）の逐語。
- **読取**: M-12＝「代行確定する（21 件）」は承認待ちタブへ切り替えるだけの導線（一括確定はしない）・承認待ちの一括は proposed（キャスト確認）だけが対象＝ACE の 21 件は planned（管理者確認）＝「送り返す」しか無かった。RPC（shift_confirm_bulk）は planned／proposed とも確定できる（ACE オーナーで BEGIN…ROLLBACK 21/21）・段階（作成中〜公開済み）で縛る RPC は無い。M-9＝シフトの RPC 11 本が owner／自店 manager だけ（staff の can_shift を見ていない）＝RPC 側。M-7＝今の「適用」は押した時点で精算調整の行（payroll_adjustment_add）を作る・「除外」は画面の状態だけ（保存先なし）。M-4＝reservation_request は担当客（customer_id）必須・①「お客様 3名」＝自分指名の予約でお客様の担当が別のキャスト＝customers の RLS で名前が見えなかった（他人の予約は混ざっていない＝reservations の RLS は cast_id＝本人）。M-10 補足＝シフト無し出勤は仕様（punch-match の no_shift・受給者判定は確定シフトの日だけ）。
- **M-1**: 今日タブのカード＝連絡ブロックを名前のセルから独立した段（rep）に（カードでは td を display: contents・連絡なしと同じ 1 段目）。
- **M-2**: 勤怠シート（390px）＝表は横スクロールの枠・合計表の行名と注記は折り返し・BottomSheet の見出し＝閉じる右上（order 2）・操作は 2 段目（全幅・折返し）・本文は横にはみ出さない。
- **M-3**: /mine 遅刻連絡の見込み＝予定開始（今日の確定シフト）からのチップ＋15／30／45／60／90 分＋その他（時刻入力）・当欠では出さない・最終打刻に「（前日分）」（営業日の切替前）。
- **M-4**（Agoora 確定 ⑤・フラグ MIG_0183_APPLIED）: /mine の予約申請に「既存客から／フリー入力」（レジの新規予約と同じ語）・呼び名＋人数→reservation_request_guest（0183）・一覧は呼び名＋「新規」・来店時に顧客カルテを作って担当客に（0183 の reservation_to_check）。① 自分指名の予約の名前＝サーバで名前だけ引く（フラグ不要）。② 10/25 の「19:48 が退の列」＝ひなのの 10/25 は確定シフトなし・打刻 in 19:48／out 02:03＝データは正しい＝表示の列ずれは deploy 後に 390px の live で確認（M-10 のシフト無し出勤の印も同じ行に出る）。
- **M-5**: まとめて追加＝600px 以下はフルスクリーン・状態セグメント縦積み・下部固定（保存 2 つ横並び・キャンセルはリンク）。
- **M-6**（裁定393 追補5 候補）: 手数料 4 択＝店の率（n%）／率を指定（%→額に換算して p_fee_amount）／額を指定／なし・欄はカード等の方法ボタンの直下・率を指定もカードの入金額の既定（残額＋手数料）に連動。DB 変更 0。
- **M-7**（確定 ⑥・フラグ）: 適用／除外＝norm_shortfall_decide（意思だけ・0183 の norm_shortfall_intents）・バッジ「適用する（現在 ¥n）」・額が変わったら「提案額が変わりました ¥旧→¥新（確定時に最新の額で入ります）」・確定 route が最新の提案額で精算調整を書いて計算し直す・確定前の最終確認に「未達減額 n 名・合計 ¥m（最新）を精算調整に入れます」。
- **M-8**: サイドバー畳み時（≡ 固定）＝ヘッダーは ≡ の右から 1 列（padding-left 66px・左寄せ）。
- **M-9**（裁定429 確定・フラグ）: シフト画面＝シフト ON のスタッフはフラグ true で isManagerUp（配置・承認・確定・公開・期間・まとめて追加）・スタッフ一覧の注記「シフト＝シフトの作成・配置・承認まで（店長と同じ）」・RPC 11 本は 0183。★0181 は手貼り案内済み＝相乗りせず 0183。
- **M-10**（確定 ⑧）: 「この月のシフトを開く」＝公開済みの期間がある月は確定シフト・無ければ ③配置（同月）・ボタン風（CSV と同じ外枠・左端）。シフト無し出勤＝collect が noShiftDates（in の打刻あり・確定シフトなし・今日まで）・給与の要対応に「シフト無し出勤 n 日」＋行ごとに「当日追加配置」・勤怠の行に印＋リンク・シフト板の ?date&add&cast で追加モーダルを採用・確定で開く。時給なしの仕様は維持。
- **M-11**: 新規の配置の既定＝採用・確定（まとめて追加・日モーダル・当日追加配置・確定シフトから）・希望の取り込みも選択中の状態・一括の終了も「＝翌02:00」。
- **M-12**（裁定430 提案中）: 語「代行確定」→「確定」・上の「確定（n 件）」はその場で確定（管理者確認／キャスト確認の両方・確認 1 回）・承認待ちの上部「この n 件を確定」・管理者確認の行にも「確定」（調整の左）・③配置と④公開は公開前の期間すべて（作成中から）・公開時に確認ダイアログ 1 回。
- **M-13**: 確定シフトの日モーダル＝「＋ キャストを追加」（定休日は押せない・既定は採用・確定）・行に「時刻変更／外す」（公開を戻さない）・追加／変更／外しは本人へ通知（まとめて追加・日モーダルの追加も通知）・旧語「仮シフト」「『確定』タブの承認待ち」→「シフト作成→③配置」。RPC は公開済み期間への追加を拒まない（読取）＝DB 不要。
- **C2-22 live の直し（ON-4 live）**: ①ACE＝「今期の判定値」が前月の値（core が月次で apply を monthly に書き換える）→ prevMonth≠month で見分けて今月の日次の合計に ②MUSE＝見込みの基準がプランの基本（¥1,800）→今期の決定時給（加重平均）に。
- **0183 起草**＝docs/tmp/gen_0183.cjs（live 14 本＋文字列）・mig-check OK（plpgsql 14）・本番 BEGIN…ROLLBACK 4/4（docs/tmp/t0183_rollback.mts）・sha16 1819fa1f69b61575・docs/demo/handpaste_0183.md。
- **suite**＝verify-nox-m（16 checks・f0 139 段目）・張替え＝wish-state ws(2-4)(4-1)(4-5)・c2 c2(3-1)(12-2)・gvb(9-2)・x13h（attendance-board の末日を lib/nox/month に）・reservation-flow rf(3-2)。
- **f0**＝run1 は p175prep の手数料 3→4 択の pin で赤（正当・張替え）→ 残りを単独走で確認 → run2 139 段 6,553 緑（17:03→17:12）・run3 139 段 6,553 緑（17:12→17:21）＝2 連緑・golden 不変（5931／125802・pay 130・payroll 234）・build は M-7 のフックが早期 return の後にあった 1 か所（rules-of-hooks）を直して緑。張替え追加＝p175prep(4-3)(7-3)。
- **【事後承認待ち】**: ①M-12 の語の統一で「代行確定」の語が画面から消える（確定に一本化）②M-12 の公開はどの段階からでも（確認 1 回）＝作成中に戻す導線は④のまま ③M-10 シフト無し出勤の「当日追加配置」は採用・確定で開く（店が時刻を入れて保存＝時給が付く）④M-4 の新規客は来店時に必ず顧客カルテを作る（同名の既存客と突き合わせない＝重複はカルテの統合で）⑤M-7 の確定時の再計算は最新の提案額（店が適用時に減らした額は使わない＝減らしたいときは除外して調整控除で）⑥M-6 の率を指定は小数 1 桁・額は入金額×率の四捨五入 ⑦M-13 外すは確定済みでも出勤記録が無ければ可（RPC の 'has attendance' は従来どおり）⑧M-3 のチップは今日の確定シフトがある日だけ（無い日は時刻入力）。

**便 431（2026-10-26・裁定431 源泉の直し・Agoora 確定 10/26）＝台帳の現在地**: 前提＝HEAD 4a0a041（専門家確認 10/26 追補）＝origin。DB 恒久変更 0（0184 は起草のみ）。読取＝同日の源泉の現状確認（コード変更 0）。
- **① 源泉の前／後**: lib/nox/payroll/adjust.ts effectiveAdjustmentsOf＝委託は source settlement（遅刻・当欠・罰金ダイアログ・ノルマ未達の減額）を源泉の後へ（行の before_withholding より優先）・雇用の懲戒減給（sanction）／不就労（shortfall）／手入力は行の指定どおり。pay.ts（計算）と core.ts（明細の凍結）が同じ関数＝表示と計算がずれない。collect が payroll_adjustments の source を読む。手入力の調整控除の既定＝委託は「源泉の後に引く」（キャストを開くたびに既定へ）。
- **② 整数**: lib/nox/money.ts withholding1021Of＝floor(課税額 × 1021 ÷ 10000)（剰余を引いてから割る＝浮動小数を使わない）・pay.ts の委託の源泉・スタッフ委託（10.21%）も同じ・SQL は 0184 起草（daily_pay_issue の 1 式・mig-check OK・本番 ROLLBACK で代表 7 値が新旧同額・sha16 94c5fcab2281d17b・docs/demo/handpaste_0184.md）。0〜200 万円で旧 floor(t × 0.1021) と同値＝golden 不変の根拠（suite 431(2-1)）。
- **③ 送り代の二重**: lib/nox/shift/okuri-mode.ts＝送りが使える店（なし以外）は名前に「送り／送迎／タクシー」を含む固定控除を作れない（保存で止めて理由）・既存は警告（自動で消さない）。
- **④ 文言**: pay.ts 冒頭「源泉の日数＝計算期間の暦日数（出勤日数ではない＝T1 回答・裁定23）・日次精算の扱いは T17 待ち」・給与右パネル「日次精算で支払済みの額は源泉の基礎から除きます」。
- **⑤**: 日次精算の 5,000 円 × 日数（支払時 1 日＋月末に全日数）は現状維持＝税理士 T17 待ち（コード変更なし）。
- **⑥ 雇用のシフト無し出勤**: collect がシフト無しの日の打刻時間（その営業日の最初の in〜最後の out）を noShiftHours に・雇用だけ日次の時間に足す（時給が付く）・委託は従来どおり 0（当日追加配置で後追い）。勤怠一覧も雇用は実働を出す。要対応の文＝「シフト無し出勤 n 日（委託 x 日＝時給なし・当日追加配置で時給が付きます／雇用 y 日＝打刻の時間で時給を付けています）」。
- **golden の差**＝なし（pay 130・payroll 234・T1b 5931／125802・payroll-adjust 131・daily-pay 34＝すべて不変。①は fixture に委託の settlement 行が無い・②は整数化で同値・⑥は fixture に雇用のシフト無し打刻が無い）。
- **suite**＝verify-nox-431（10 checks・f0 140 段目）。
- **f0**＝run1 140 段 6,563 緑（17:35→17:44）・run2 140 段 6,563 緑（17:44→17:52）＝2 連緑・golden 不変（5931／125802・pay 130・payroll 234）・tsc 0・build 緑。コミットは 0180〜0184 の起草ファイルを含めない（手貼り待ち）。
- **【事後承認待ち】**: ①委託で source settlement の行は before_withholding が true でも源泉の後（行を書き換えず計算時に優先＝既存の行もそのまま効く）②送り代の判定は名前（送り／送迎／タクシー）＝別名で作った控除は検知しない ③雇用のシフト無し出勤の時間＝その営業日の最初の in〜最後の out（休憩は引かない＝シフトのある日と同じ扱い）④スタッフ委託の率が 10.21% 以外の契約は floor(gross × 率×100 ÷ 10000)。

**便 BTN（2026-10-26・主ボタン中央の徹底・Agoora の指摘＝最優先の割り込み）＝台帳の現在地**: 前提＝HEAD 4b05e7d（便 431・未 push）。DB 恒久変更 0（suite の走査中だけ NOX-VERIFY の規約同意の行を足して終わりに消す＝残留 0 を確認）。
- **① 洗い出しと直し**: 直す前の違反＝**111 件**（68 画面×組 186・1,280／390）。うち 58 件は ON／OFF の行内スイッチ（例外に分類）・残り 53 件（26 か所×2 幅＋1）を .nox-actions（裁定242・中央）へ＝営業時間（週間設定を保存＝見出しの右端→表の下・適用・特別日を追加）・待遇（プランの節の保存＝節の末尾の中央・登録／更新＋新規に戻す 4 か所・プリセット以外）・控除（登録・保存）・ノルマ（**保存**・**選択した n 人にまとめて入力**＝今回の指摘）・送りの区分の保存・マスタ見出しの主アクション（MasterPageHead＝商品／カテゴリ ほか 10 画面共通＝見出しの下の中央）・料金（区分を追加・時間帯を追加・この条件で計算・税・サービス料を保存・お客様への加算を保存）・紹介者（未払を表示）・席（席を追加）・棚卸し（記録する＝中央・390 は下部固定バー）・店舗設定（この基準にする）・LINE の設定を保存・給与の空状態（先月のプレビューを開く）・レジ（ボトルキープを登録）。
- **例外（許可列挙・理由つき）**: 表の行内／セグメント・タブ（選択状態の表示）／行内のスイッチ（ON／OFF）／ナビゲーション（サイド・第 2 ナビ・下部タブ）／ヘッダーのツール（上部バー）／固定バー（モーダル下部・390 の下部固定）／幅いっぱいのボタン（中央と同じ）／data-actions-exempt 3 か所＝送りの方式の選択・キャスト会計の有効／無効の選択・インセンティブの対象（全員／選択）。
- **② suite**: verify-nox-actions-center（f0 の末尾・Edge＋playwright-core 1.55.0＝開発依存・ブラウザのダウンロードなし）＝dev（3200・無ければ suite が起動して止める）に NOX-VERIFY のオーナー／キャストでログイン（パスワードは .env.local の SEED_PASSWORD・localhost だけ）・マスタ全タブ（セグメントの ?tab= を辿る）・給与・勤怠・シフト 6 タブ・レジ・日報・/mine・/mine/wishes・キオスク 2 画面を 1,280／390 で開き、主ボタンの組の中心 x が親カードの中心 x ±8px。判定は lib/nox/ui/actions-center-probe（page.evaluate）。
- **③ 列ずれ**: キャスト別の目標の表＝見出しの期間・日数・同伴・売上・指名を値と同じ右揃え（th.num）。
- **直した後**＝違反 0（同じ 68 画面×2 幅・referrers のカードに data-card・LINE の保存をフォームの列の外へ）。
- **f0**＝run1 141 段 6,749 緑（19:05→19:18）・run2 141 段 6,749 緑（19:18→19:32）＝2 連緑・golden 不変（5931／125802・pay 130・payroll 234）・actions-center 186 組・違反 0・例外 98・build 緑。
- **④ 教訓122**（下の見出し）を収載。
- **【未完】**: キオスクの端末ログイン後の画面とレジの入金（伝票を開いた後）は fixture に端末・開いた伝票が無く suite の対象外（ログイン前の画面だけ）。
- **【事後承認待ち】**: ①suite の走査中だけ NOX-VERIFY の org に規約同意の行を足す（終わりに消す・失敗は投げる） ②ON／OFF スイッチ・選択ボタン（選択中が青）は主ボタンではなく例外 ③マスタ見出しの主アクション（＋商品を追加 等）は見出しの下の中央へ移した（右上ではない）。

**便 431 続き＝裁定432＋M-14（2026-10-26）＝台帳の現在地**: 前提＝HEAD 75db8fc（便 BTN）＝origin。DB 恒久変更 0（0183 に ★4 を相乗り＝起草のみ）。
- **裁定432 ①区分**: lib/nox/payroll/withholding-kind.ts＝hostess／other_fee／manual／none・既定（cast 委託→hostess・雇用→manual／staff contractor→other_fee・他→manual）・自動額（hostess＝従来の委託と同値・other_fee＝定率）。キャスト詳細の税務パネル・スタッフの勤怠・報酬の行の詳細で変更（set_withholding_kind＝店長以上）。
- **②委託の額の指定**: 給与の右パネル／スタッフの行の詳細＝「自動 ¥n」＋「額を指定」（その期だけ・理由任意・税理士確認済み・audit に元額と指定額＝payroll_withholding_override_set）・明細の源泉ラベル「（指定額）」。
- **③社員の控除**: 社会保険料／源泉所得税／住民税／その他（名前付き複数行）・空欄＝0・入れた分だけ支給後に引く（pay.ts／staff pay の net・控除計・明細の行・CSV の「社員の控除」列は 1 人でも入れたときだけ）・「前月と同じ」・確定の前に「社員 n 名の控除が未入力です」を 1 回（止めない）。雇用の税額表の自動計算（employeeWithholdingOf・EMPLOYEE_TAX_TABLE_READY）は撤去。
- **④注記**「区分と額は顧問税理士・社労士にご確認ください」（右パネル・税務パネル・スタッフの勤怠・報酬）。
- **DB**＝0183 ★4（docs/tmp/0183_432.sql を生成器が取り込む）＝cast_tax_profiles／staff_contracts.withholding_kind・payroll_withholding_overrides・payroll_employee_deductions（RLS＝店長以上＋本人・revoke all→select だけ）・RPC 3 本＋内部 2 本（payroll_period_locked_of／payroll_subject_store_of＝4 ロール revoke）。mig-check OK（plpgsql 17・sql 2）・本番 BEGIN…ROLLBACK 8/8（★4 の 4 段）・909 行・sha16 **045043b7edb2bac9**（旧 1819fa1f69b61575 は破棄）・handpaste_0183 を更新。client はフラグ MIG_0183_APPLIED（false）配下＝collect は読まない・右パネルは出ない。
- **golden の差**＝なし（pay 130・payroll 234・T1b 5931／125802）＝区分を渡さない間は従来式・雇用の税額表は元々 0（撤去で差なし）。
- **M-14 ①**: 勤怠の行の「退勤記録なし」「出勤記録なし」を押すと今日タブと同じ打刻の時刻修正（PunchCorrectionModal＝punch_correction_request＝修正前後と理由を audit）→保存で再読込（実働・時給分・日計を再計算）。営業日がまだ終わっていない日（今日）は「勤務中」（赤字ではない・退勤記録なしに数えない）。
- **M-14 ②**: シフト無し出勤の行に「シフトとして確定」（既定＝打刻の出〜退・店の営業時間から選び直し・手入力）→shift_set（採用・確定・理由つき）→時給分が付く。行の「当日追加配置」リンクは置き換え（給与の要対応の一覧のリンクは従来のまま）。
- **M-14 読取 1 行**: shift_set／punch_correction_request とも過去日を拒まない（日付の下限なし）・確定済みの期は punch_correction_request が受け付けて要対応に積む（裁定315）＝勤怠の画面は確定済みの月を開かない（rowEditableOf）。**ただし shift_set は定休日を必ず拒む**（live ⑬ の LUNA あかり 10/04＝日曜＝定休日で「その日は定休日です」）＝**0183 ★5 に相乗り**（定休日に実際に出勤した過去日＝理由つきなら確定シフト・未来の定休日は従来どおり・本番 ROLLBACK で確認・0183 は 911 行・sha16 f7a98b59338ce400 に更新）。
- **live ⑬（本番・LUNA オーナー・20:3x）**: 10/26（今日）の退＝「勤務中」（data-kintai-out-kind working）✓・10/04 の「シフト無し出勤」に「シフトとして確定」が出て押せる ✓・保存＝定休日のため拒否（0183 ★5 の後に時給分が付く）＝【未完】（0183 の手貼り待ち）。
- **suite**＝verify-nox-432（12）・verify-nox-m14（5）（f0 141・142 段目・actions-center は 143 段目）・張替え p172(1-1)(1-6)・431(5-1)（源泉の基礎の行）・s-lane（fixture の今日 10/04＝勤務中・退勤記録なし 0・CSV も「勤務中」）・daily-pay dp(3-1)（同一 tx の now() で in と out が同時刻＝順序が不定の偶発の赤＝in を 1 秒前へ・教訓98 の型）。
- **f0**＝run1 は daily-pay の偶発の赤（単独走 2 回目で緑）・run2 は s-lane（M-14 の正当な変更）→張替え後 run3 143 段 6,766 緑（19:56→20:09）・run4 143 段 6,766 緑（20:09→20:23）＝2 連緑・golden 不変（5931／125802・pay 130・payroll 234）・build 緑。
- **【事後承認待ち】**: ①hostess を明示した委託キャストも結果は従来と同じ（凍結に区分と自動額のキーが増える）②指定額は「この期だけ」＝次の期は自動に戻る③社員の控除は支給後に引く（源泉の基礎は動かさない＝NOX は税額を計算しない）④スタッフの区分の変更は契約（staff_contracts）の行がある人だけ（契約の書込 RPC が無い）⑤M-14 の「シフトとして確定」の既定の時間は出の時刻を 0〜23 時に丸める。

**QR 便（2026-10-26・裁定423 変更＝Agoora 確定 10/26 ⑫）＝台帳の現在地**: 前提＝HEAD 42fc5f9（裁定432・M-14）＝origin。DB 恒久変更 0（0185 は起草のみ）。
- **向き**: キオスク（レジ端末）に QR（端末の秘密鍵の TOTP・30 秒で回る・端末×counter で 1 回限り・使用済みの次の QR を出す）＝中身は URL（origin/kq#noxq:端末.6 桁＝# の後＝サーバに送られない）→本人がログイン済みのスマホで読む（標準カメラでも /mine の「キオスクを開く（QR を読む）」→/kq のカメラでも）→「このキオスクを開きますか？」→kiosk_qr_claim→キオスクが kiosk_qr_poll（2 秒ごと・この画面の間だけ）で受け取り、本人の権限で開く（無操作 3 分で戻る＝kiosk-register の idleMsRef・サーバも auth_kiosk_operator が least(180, 店設定)）。
- **権限**: PIN の解除と同じ式＝owner／admin／manager・スタッフはレジ権限・キャストはレジ権限かつ店のキャストのレジ操作 ≥1（OFF＝punch_only＝「打刻は出退勤の端末かスマホで」）。owner は org 内のどの店の端末も可・他は同じ店だけ。失敗 5 回で 10 分ロック（本人単位）。
- **旧向きの撤去**: /mine の「キオスク用 QR」（全画面の QR）と部品 kiosk-qr-modal を削除・キオスクの解除パッドのカメラを撤去・0185 で my_qr_secret／kiosk_unlock_qr の本体を retired に（引数と ACL は不変）。PIN（4〜6 桁）は基本の入口として維持。
- **本番の不具合（読取で発見）**: 0175 ★27 の 4 本（kiosk_unlock／kiosk_unlock_qr／my_qr_secret／totp_code_of）の search_path が `'public, extensions'`（1 つの名前）＝pgcrypto（crypt／hmac／gen_random_bytes）が見つからない・kiosk_unlock は min(uuid)（PG に無い）も＝**レジ端末の「PIN だけで解除」は本番で常に失敗していた**（BEGIN…ROLLBACK で再現）。0185 ⑤b で kiosk_unlock と totp_code_of を直す（live 逐語＋2 か所）。**0185 を貼るまではレジ端末を従来の「操作担当を選んで PIN」（kiosk_login＝本番で動く）に戻した**（rules0175On() && mig0185On() の間だけ新しい解除）。
- **DB**＝0185 起草（表 kiosk_qr_keys／kiosk_qr_claims＝deny-all・RPC kiosk_qr_secret／kiosk_qr_claim／kiosk_qr_poll・auth_kiosk_operator・kiosk_unlock・totp_code_of・旧 2 本 retired）・mig-check OK（plpgsql 8）・本番 BEGIN…ROLLBACK 17/17・265 行・sha16 **a00055c966c294e1**・docs/demo/handpaste_0185.md。client はフラグ MIG_0185_APPLIED（false）配下＝/kq は 404・キオスクの QR タブと /mine の入口は出ない。
- **suite**＝verify-nox-qr（13・f0 143 段目）・張替え p175prep（10-3）（11-3）（11-4）・p175prep（10-3）は 0185 までの解除の出し分け。
- **f0**＝run1 は actions-center がログイン画面の水和待ちで赤（dev が編集途中の構文エラーと削除した部品をキャッシュ＝500）→dev を再起動・run2 144 段 6,779 緑（20:45→20:59）・run3 144 段 6,779 緑（20:59→21:14）＝2 連緑・golden 不変・build 緑。**運用の注意**＝actions-center は dev（3200）に依存＝ファイルの削除・大きな置換の後は dev を再起動してから f0。
- **【未完】**: シフトのタイル（/kiosk-shift）は未実装のまま＝QR で開くのはレジ端末（kiosk-register）だけ。実機（iPhone で店の iPad の QR を読む）は 0185 の後。
- **【事後承認待ち】**: ①QR の中身は URL（標準カメラで読める・トークンは # の後）②スマホ側は「開く」を 1 回押す（読んだだけでは開かない）③無操作 3 分は QR で開いたときだけ（PIN は従来の 15 分）④0185 までレジ端末は従来の操作担当選択に戻す（PIN だけの解除が本番で失敗していたため）⑤キオスクの QR の表示はタブ（PIN／QR）＝既定は PIN。

**便 GV-D（2026-10-26・docs/demo/gvd_20261023.md の 14 件）＝台帳の現在地**: 前提＝HEAD e9d3083（QR 便）＝origin。DB 恒久変更 0。
- **直す 9 件**: #1 給与 390 の期ヘッダー（締め／計算基準／暫定）＝600px 以下は折り返す（data-payroll-headtag）・#2 日報の追加 KPI＝列数をインラインから class へ（641px 以下は 2 列＝見出しが切れない）・#3 シフト今日の「退勤」＝min-height 40・#5 セグメント＝600px 以下 min-height 40（.nox-seg の CSS 1 か所）・#6 btnSm 系の主ボタン＝600px 以下 40px（theme の btnSm に min-height の変数 --nox-btnsm-h・広い幅は auto）・#7 スタッフの権限ピル＝役職で固定／退店済みは表示専用の灰ピル（span）・押せるのはスタッフの有効な行だけ・#8 月送り ‹ › 40×40（MonthNav）＋取り下げ（btnSm＝#6 で 40）・#9 /lp「この店で試す」（btnSm＝#6 で 40）・#14 分析の「設定」（btnSm＝#6 で 40）。
- **重複・残す**: #11 商品の「無効も表示」・#12 棚卸しの縦積み＝**C2-8 で済**（便 SH-UI-c2）・#4 デモ帯の 31px／#10 初期設定の STEP チップ／#13 レジのレイアウト＝残す（相談役案）。M 便と重なる箇所＝なし（M-2 は勤怠シートの見出し＝#1 とは別の画面）。
- **主ボタン中央**（教訓122）＝actions-center は f0 の末尾で緑（違反 0）。
- **suite**＝verify-nox-gvd（7・f0 144 段目）。
- **f0**＝run1 は 6 段目（anon-guard 段37 の掃除確認）で赤＝同時に走らせたデモ 6 店の reset が kiosk_devices を 1 行足した（全体件数の比較）→reset の後に run2 145 段 6,786 緑（21:19→21:35）・run3 145 段 6,786 緑（21:35→21:54）＝2 連緑・golden 不変・build 緑。**運用の注意**＝デモの reset は f0 と重ねない（push→デプロイ→reset が終わってから次の f0）。
- **live（本番・ACE オーナー・f28d708 のデプロイ後・22:0x）**: 375 幅＝#2 日報の追加 KPI 2 列・見出しの切れ 0 ✓／#3 退勤 40px ✓／#5 セグメント 40px ✓／#6 --nox-btnsm-h 40px ✓（1,280 は未設定＝従来）／#7 権限ピル＝表示専用 span 6・押せる button 6（青枠）✓／#9 この店で試す 40px×6 ✓／#14 分析の設定 40px ✓／横スクロール 0 ✓。**#1 は NG**＝折り返しは効いたが期ヘッダーの行が nowrap の flex で 3 つが縦長に潰れて右へはみ出した（right 383／434・幅 375）→ W-10 の便で section:has(> [data-payroll-headtag]) を折り返しに直す（live は W-10 のデプロイ後）。スクショは pane が隠れていて撮れない＝実測値で記録。
- **【事後承認待ち】**: ①390 のタップの目安 40px は btnSm 全体（600px 以下）に効かせた＝行内の小さなボタンも 40px になる ②権限ピルの灰＝表示専用（押せない）③#2 は店長の 3 列もオーナーの 4 列も 390 は 2 列。

**便 W-10（2026-10-26・docs/demo/w10_junbichu.md の「作る」8・「消す」17）＝台帳の現在地**: 前提＝HEAD f28d708（GV-D）＝origin。DB 恒久変更 0（0186 は起草のみ）。
- **作る 8**: #2 操作履歴の要確認＝直近 30 日の伝票の取消（¥50,000 以上）と営業時間外（6〜17 時台）の機微情報の閲覧を自動で拾い上げる（lib/nox/audit/alerts）・#5 取消の承認者と理由＝after_json の voided_by／void_reason を列に・#7 監査ログの CSV 出力（期間・利用目的必須）＋出力の記録（audit_export_record＝0186）と出力の履歴・#10 特別営業日・臨時休業（store_special_days＝0186・営業時間の画面の部品 SpecialDaysPanel・シフトと予約の定休日判定も同じ）・#12 同伴の率バック（円/本・率の 2 択＝0175 で解錠済み＝client だけ）・#15 機能の公開の「既定に従う」へ戻す（flag_unset＝0186）・#21 お知らせの LINE 配信（掲載と同時に連携している人へ push＝/api/line/notice・KPI＝LINE 連携／未連携の人数）・#22 納付記録の取消（withholding_payment_cancel＝0186・理由必須）。
- **消す 17**: #1 分析の自動コメント・#3／#4／#6／#8 操作履歴の注記（理由は行の詳細に・保管期間は「無期限（削除していません）」）・#9 営業時間の KPI「特別日設定」・#11 季節営業・#13／#14 待遇プランの第 2 期のピルと「割合方式は準備中」・#15 の QR 注文・通知の文・#16〜#18 料金の 8% 切替／締め後の伝票修正の権限／保存期間・#19 席種カテゴリのピル・#20 システムの KPI「要確認」・#21 の LINE 以外（メール・確認回答・予約掲載・下書き・カテゴリ・既読）・#23 日報のピル・#24 初期設定の QR 注文・通知のスイッチ・#25 /lp の「紹介動画（準備中）」。画面の「準備中」「未実装」＝0（suite が app／components を走査）。
- **DB**＝0186 起草（表 store_special_days・RPC 5 本・判定 2 本）・mig-check OK（plpgsql 7）・本番 BEGIN…ROLLBACK 5/5・215 行・sha16 **15143fd04f488674**・docs/demo/handpaste_0186.md。client はフラグ MIG_0186_APPLIED（false）配下＝特別日・既定に従う・納付記録の取消・監査ログの出力の 4 つは 0186 の後に出る（それまでは出さない＝準備中の表示もしない）。
- **suite**＝verify-nox-w10（12・f0 145 段目）・demo-guard の分類に line/notice（A＝デモ org は送らない）・監査の出力の文言は Message（裁定281）。
- **f0**＝run1 messages（素の <p>）→直し・run2 demo-guard（route の分類）→直し・run3 145 段 6,785 緑（w10 が鎖に入っていなかった）→鎖に足す・run4 146 段 6,797 緑・run5 shift-modal の 1 項目が HTML 応答（API の一過性＝単独走 2 回とも緑）・run6 146 段 6,797 緑（22:54→23:10）・run7 146 段 6,797 緑（23:10→23:29）＝2 連緑・golden 不変・build 緑。
- **【未完】**: 「確認済み」の印（要確認を確認済みにする）は器が無い＝出さない。お知らせのメール送信・確認回答・予約掲載・下書き・既読の追跡は器が無い＝撤去（作るならローンチ後）。
- **【事後承認待ち】**: ①要確認のしきい値＝取消 ¥50,000・営業時間外＝6〜17 時台（JST・夜の店の営業外の定数）②監査ログの CSV は 1 回 20,000 件まで③お知らせの LINE は連携している全員に 1 人ずつ push（上限の判定なし＝429 は failed で台帳）④0186 の前は 0186 の入口を出さない（W-10 の「作る」のうち 4 つ）。
- **commit／live**＝29a6a02 push 済＝origin・デプロイ success 23:36・6 店 reset 200（23:36〜23:37）・live（MUSE owner・390 系＝375×812・給与 2026-10）＝期ヘッダーの 3 つが 2 行に折り返し・右端 312／幅 375・横スクロールなし（GV-D #1 合格）・主ボタン中央のずれ 0px。

**便 OB（2026-10-26・初期設定 v4 の本番化）＝台帳の現在地**: 前提＝HEAD 29a6a02（W-10）＝origin。DB 恒久変更 0（既存 RPC の接続だけ・相乗りの起草なし）。
- **正本モック**: 初期設定 v4（artifact PtWVBE3iFfek3GZHyrAwRu・9 STEP・iPad 向け）を docs/handoff/mock/setup_v4.html にバイト複写（repo へ）。
- **client 接続**: 税設定＝ウィザードの STEP 5 に「端数の扱い」（切り捨て／四捨五入／切り上げ・既定＝店の現値＝新しい店は切り捨て＝現行の計算）→計画に set_store_tax_config（7 引数全値明示＝原則7・変わるときだけ・登録番号（T＋13 桁）があればインボイス登録・課税事業者）・ページが stores の税設定 6 列を読む。定休日＝STEP 1 の営業時間の下に 7 曜日（複数・無ければ選ばない）→set_store_business_hours の p_is_closed（時刻は null）＝シフトの定休日・予約の受付も同じ。
- **新しい店の既定（Agoora 確定 10/26）**: 送り＝定額徴収（settings_json.okuri_mode が未設定の店だけ set_store_okuri_mode flat を明示）・ノルマ＝使う店は 4 軸（set_store_norm_axes＝日数・同伴・売上・指名）・定休日＝上の選択・手数料 4 択＝既定は「店の率」（PAY_FEE_MODES の先頭・変更なし）・キオスクの給与表示＝既定 OFF（kiosk_payroll が true のときだけ見せる・変更なし）。
- **v4 との差（残り）**: v4 の 9 STEP（席・卓／メニュー／スタッフ／シフト・勤怠／会計・レジ の各 STEP の分割・業態 5 種・コピー元のお店・キャストの CSV 一括登録・最初のシフト期間・店の端末の登録）は現行の 6 STEP のまま＝【未完】（OB は「client 接続と既定」の便。STEP の作り直しは別便）。
- **suite**＝verify-nox-ob（7・f0 147 段目・actions-center の前）。
- **張替え**＝w52a の 2 項目（ウィザードの計画に ob・下書きに ob＝逐語の差だけ・計算の差なし）。
- **f0**＝run1 payroll-view pv(7-5)＝ウィザードの計画の引数に ob（逐語の差）→張替え・run2 147 段 6,804 緑・run3 staff-shift ss(6d)(7b)＝**日付が変わった後の時計依存**（営業日は 06:00 までが前日＝0:00〜06:00 は「当日 23:59 の締め切り」が過ぎている・締め切りの上限は営業日の 23:59）→suite をその時間帯だけ翌営業日（版は 4 章の P1c）で確かめるように直した（単独走 82 緑）・run4 147 段 6,804 緑・run5 actions-center＝dev（3200）が落ちて接続拒否（規約同意の行の残留 0 を確認）→dev を起動し直し・run6 147 段 6,804 緑（00:54→01:07）・run7 147 段 6,804 緑（01:07→01:21）＝2 連緑・golden 不変。
- **commit／live**＝3161b61 push 済＝origin・デプロイ success 01:26・6 店 reset 200・live（MUSE owner・375×812・/setup）＝STEP 1 で業態を選ぶと「定休日」7 曜日（日〜土・未選択・右端 314／幅 375）・「次へ」で STEP 5 まで進むと「端数の扱い」3 択（切り捨て＝選択中＝店の現値）・横スクロールなし・保存はしていない（計画の組み立て＝RPC と引数は suite verify-nox-ob の純関数で確認・RPC の実行は既存 RPC の既存 suite）。
- **【事後承認待ち】**: ①端数の既定＝店の現値（新しい店は切り捨て）＝v4 の既定「四捨五入」には合わせていない（計算が変わるため）②税設定はウィザードで変わるときだけ呼ぶ（課税／免税・表示は店の現値のまま送る）③送りの方式は未設定の店だけ定額徴収を明示（設定済みの店は触らない）④ノルマ 4 軸はノルマを使う店だけ。⑤staff-shift の suite の直し＝0:00〜06:00 は「当日 23:59 の締め切り」の検査を翌営業日で行う（仕様＝締め切りの上限は営業日の 23:59 は変えていない・深夜の営業中に当日の希望を出せないのが正しいかは要判断）。

**便 LP-R（2026-10-26・録画台本と LP の機能一覧の更新＝docs のみ）＝台帳の現在地**: 前提＝HEAD 3161b61（OB）＝origin。DB 恒久変更 0・client 変更 0。
- **成果**: docs/demo/lp_script_20261026.md＝6 店の録画台本（各 60〜90 秒・1 本 1 テーマ）と LP（/lp）の機能一覧 9 項目＝CANON 型の料金と報酬率・時間帯別の同伴バック・キオスクの PIN／QR・電子領収書（簡易インボイス）・手数料 4 択・送り 4 方式・ノルマ 4 軸と要対応・管理者の役割・席移動の VIP 料金。
- **手貼りの前に撮れない秒**: 0181（VIP の税サ）・0182（席移動の VIP 料金）・0183・0185（キオスクの QR）＝台本の表の「手貼り」の列。LP の画面への反映は LP 本便。
- **【事後承認待ち】**: なし（台本の更新のみ）。

**締め（2026-10-27 早朝・夜間連続便の最後）＝台帳の現在地**: 前提＝HEAD a199051（LP-R）。DB 恒久変更 0。
- **引き継ぎ v52**＝docs/handoff/NOX_相談役引き継ぎ_2026-10-27_v52.md（v51 の様式・v51 以降の差分＝裁定427〜432・0178〜0186・ON-1〜ON-4・NR-1・414 追補・M-1〜M-14・夜間連続便・【未完】6 件・残フェーズ・起動ブロック）。
- **明朝の手貼り**＝docs/demo/handpaste_morning_20261027.md（0185 を最優先→0180〜0184→0186・7 本の行数と sha16 をファイルと照合済み・7 本とも貼り先証明と単一トランザクション）。
- **事後承認の一覧**＝docs/demo/pending_approvals_20261027.md（台帳の【事後承認待ち】を 22 か所（締め＋21 便）1 か所に集約・Agoora 確定 10/26 の 12 件・裁定431・裁定432 は除外）。
- **06:05 の自動 reset**＝最終報告で 1 行（05:45〜06:20 は push しない）。
- **f0**（docs だけの変更でも便ごとに 2 連）＝run1 147 段 6,804 緑・run2 pricing-categories が Supabase API の 502（単独走 緑）・run3 reopen のサインインが認証の回数上限（Request rate limit reached・5 分待って単独走 緑）・run4 crm-base の掃除で商品 1 件残り（02:07 の走りで作られた NOX-VERIFY-P51 の行＝その走りの削除が API の一過性で失敗・参照 0 を確かめて消した・単独走 24 緑）・run5 payroll が 502・API を 10 分測って 502 なし→run6 147 段 6,804 緑（02:22→02:39）・run7 147 段 6,804 緑（02:39→02:57）＝2 連緑・golden 不変。**教訓の候補**: 夜間に f0 を続けて回すと認証の回数上限に当たる（1 晩 20 走超）＝赤の前に API の状態を見る。
- **【事後承認待ち】**: ①verify 用の DB（本番と同じ ref の NOX-VERIFY org）で、f0 の掃除に失敗して残った商品 1 行（NOX-VERIFY-P51-ボトル酒）を手で消した（参照 0 を BEGIN…ROLLBACK で確かめてから・suite の掃除と同じ範囲）。

### 教訓125：本番の cron が走り始めた日は、suite の fixture が cron に書き換えられていないかを先に疑う（2026-10-29・便 2・本文は相談役）

**本文（相談役・2026-10-29）**: 「本番の cron が走り始めた日は suite の fixture（NOX-VERIFY の期間・伝票）が cron に書き換えられていないかを先に疑う。suite は自分の fixture を冒頭で open に戻し、null で落ちない guard を置く」。CLAUDE.md へは便 M3 で 1 行。
**根拠（rls の F1d・2026-10-29）**: 10/27 に登録した cron nox-shift-periods-close（0176 の shift_periods_auto_close＝毎朝 JST 06:20）が、10/28 06:20 の初回で NOX-VERIFY-A1 の fixture の期間（2026-07-01〜07-31・open・締切 2026-07-05）を closed にした（updated_at 2026-10-27T21:20Z）→ rls の F1d で shift_wish_submit が 'period_not_open'→wishId 空→shift_wish_decide 失敗→suite が `sFull!.org_id` の null で TypeError（異常終了）＝10/29 の f0 1 走目で発覚（10/27 17:03 の 2 連緑の後、最初の f0）。直し＝scripts/verify-nox-rls.ts F1d の冒頭で admin が fixture の期間を open に戻す（seed:f0 と同じ状態・cron は翌朝また閉じる＝毎回戻す）＋decide の戻りが null なら原因を出して止める guard。中断で残った当日伝票は次の走の掃除が消した（残留の確認＝教訓123）。rls 単独＝529/529 緑。

### 教訓124：プロセスを止めるときは語で絞らない・照合に npm run の本物を書かない（2026-10-27・手貼りの締め）

2026-10-27、照合用のコマンドに `npm run -s verify:f0 --dry-run` と書いた＝`--dry-run` は npm script に渡らず本物の f0 が走った（rls の途中で停止＝残留は rls の単独走 2 回目で 528/528 緑・残留 0 を確認）。止めるときの絞り込みを `CommandLine -match 'verify'` にしたため、**別 repo（BANZEN＝makanai-shift）の verify も止めた**。**プロセスを止めるときはコマンドラインに NOX の repo のパス（C:UsersabetDropboxcloude
ox）を含むものだけ**に絞る（別 repo の verify が並走している前提）。**照合用のコマンドに npm run の本物を書かない**。CLAUDE.md の verify 節にも 1 行。

### 教訓123：f0 を途中で止めたら、次の f0 の前に NOX-VERIFY の残留を見る（2026-10-27・手貼り 0180〜0186 の締め）

f0 を途中で止めると、走っていた suite の finally（掃除）が走らず NOX-VERIFY に行が残る（実例＝手貼りが続いて f0 を 2 回止めた＝anon-guard 段24 の顧客「NOX-VERIFY-段24客1／客2」が残り、次の f0 で同じ suite の段18／段23 が件数違いで赤）。**f0 を止めた後は、次の f0 の前に NOX-VERIFY の残留を見る（参照 0 を確かめて消す）**。CLAUDE.md の verify 節にも 1 行。

### 教訓122：主ボタン中央は f0 で機械判定する（2026-10-26・便 BTN）

主ボタン（青塗り）と補助ボタンの組は裁定242 の .nox-actions（中央寄せ）。目視の指摘を待たず **f0 の verify-nox-actions-center** で毎回判定する。**live 検証には毎便「主ボタン中央」を含める**。例外は表の行内・ヘッダー右上のツール・モーダル下部の固定バー（とナビゲーション・セグメント／タブ・行内のスイッチ・幅いっぱい）だけ＝suite の許可列挙（理由つき）で持つ。

**便 ON-4（2026-10-26・残作業＝C2-22 来期の時給見込み／C2-23 席移動の料金（裁定427＋Agoora 確定 ①）／I-2 ③／0177 残り）＝台帳の現在地**: 前提＝HEAD 0c13010（ON-3）＝origin。DB 恒久変更 0（0182 は起草のみ）。
- **C2-22（本文＝台帳「C2-22 本文」・Agoora 確定 ⑨）**: lib/nox/payroll/next-wage.ts（slideNextWageOf＝売上／pt スライドは slideAt と同じ・nextWageOfPay＝next は日次の合計・それ以外は months の累計・nextWageLineOf＝「来期の時給見込み ¥n（今期の判定値 m・あと ¥k で次の段）」＋小さく「見込み＝確定値ではありません」）・canon.ts canonNextWageOf（報酬率軸＝段・方向・連続 N 期・W 別規定＝canonOutcomeOf と同じ部品・UP は規定と N 期を満たしたときだけ・査定／据え置きは時給を変えない・次の段＝報酬率が今の段の下限を下回る売上小計）・pay.ts が canon.forecast を積む（金額に効かない）・給与右パネル（breakdown-lines の next-wage 行・確定済みの明細には出さない）・/mine 今期の時給の下（data-mine-next-wage）。一覧に列は足さない。
- **C2-23（裁定427＋確定 ①）**: 0182 起草（checks +service_pre＝席移動前に旧率で確定したサ料と母数・check_group_due＝凍結額＋増分×現在率・check_move_seat＝①セット中→VIP はセット行を VIP セットに置換 ②延長中→VIP は移動した時点の延長行を VIP 額に・延長パターンを再凍結（VIP 用 or 通常＋差額）・VIP チャージが無ければ 1 行 ③サ率は移動時点から席種の率 ④下位へ＝VIP 行は残す ⑤入金済み・同種間は不変）。生成器 docs/tmp/gen_0182.cjs（live の定義＋文字列）・mig-check OK・本番 BEGIN…ROLLBACK 9/9 OK（docs/tmp/t0182_rollback.mts）・sha16 454bf43a4c790086・docs/demo/handpaste_0182.md。client＝フラグ SEAT_MOVE_PRICING_APPLIED（false）・lib/nox/register/seat-move.ts（確認文）・register-board の席移動はフラグ true のときだけ確認を挟む。
- **I-2 ③(a)(b)**＝済み（便 P175-prep P-4 で wish-form に wishDefaultOf（基本の働き方を希望の既定値に）・fixedOffConflictOf（固定休の注意）を実装済み・ON-1 のフラグ true で有効）＝コード変更なし。
- **0177 残り**: 一括フォームの見出しを送り方式で（issue-bulk-form の bulkHeadOf＝実費「タクシー代の立替」／定額徴収／店負担／なし＝前借りだけ）。payload LILY store／NOIR none は便 414 追補で済み。店負担／定額の live は ON-4 の live で見る。
- **ON-3 live の直し**: 通知の文面の時刻を fmtWin（「翌02:00」）に（on3(1-1) 張替え）。
- **suite**＝verify-nox-on4（13 checks・f0 138 段目）＝C2-22 純関数 5（ACE 型の売上スライド・MUSE 型の報酬率軸 N＝2＝期末に店が適用したときの canonOutcomeOf の upAmount と一致・規定未達 あと 4 日・連続 1／2・査定）／配線 3／C2-23 3（確認文・フラグ・0182 の形）／一括見出し 1／通知の時刻 1。
- **f0**＝run1 138 段 6,537 緑（16:10→16:19）・run2 138 段 6,537 緑（16:19→16:28）＝2 連緑・golden 不変（5931／125802・pay 130・payroll 234）・tsc 0・build 緑。**コミット**＝feat（本節の直後に push）。0180〜0182 は起草のまま（未追跡・手貼り後に収蔵）。
- **【事後承認待ち】**: ①C2-22 の「規定未達」の日数＝normRequiredOf（規定日数×期の日数÷30 の切上げ）＝給与の判定と同じ ②報酬率軸の「次の段」＝報酬率が今の段の下限を下回るまでの売上小計（時給分は今のまま）③C2-23 の確認ダイアログは 0182 手貼り後（フラグ true）から ④0182 ②で既存の延長行は最後の 1 行だけ VIP 化（それより前の延長行は移動前の時間＝不変）。

**便 ON-3（2026-10-26・0176 の client＝通知・登録→招待の 2 段・LINE（401）・連絡の確認済みと履歴（I-4）・本人の連絡先変更（400）・シフトの 5 件・C2-13 催促・裁定413「相手に通知」）完了＝台帳の現在地**: 前提＝HEAD 8f8436e（ON-2）＝origin。DB 恒久変更 0（0176 は手貼り済み＝RPC 24 本を使うだけ・cron job の登録 SQL は起草＝docs/demo/cron_shift_periods_close.sql＝Agoora 手貼り）。**読取**＝①0176 の RPC 24 本と表 9（supabase/migrations/0176_people_line.sql）②client は 0176 の器を何も使っていなかった（set_my_contact の呼び出しも無し・LINE のコードは 0・催促は disabled・辞退ボタン無し・必要人数は店の staffing_needs だけ）③招待・スタッフ作成はデモ org 403（裁定273-6）＝live ① はデモでは通せない→nox-dev で suite が本物の Auth を作って通す（on3(4-1)(4-2)）④line_push_log.kind は 4 種（shift_published／shift_changed／punch_unclosed／notice）＝キャスト通知は shift_*→shift_changed・それ以外→notice に写す。
- **純関数**: lib/nox/people/notify-text.ts（kind 6 種・文面・未読の合算・宛先つきお知らせの可視）／invite.ts（URL /i/<token>・状態・フォーム検査・パスワード 8〜72）／invite-server.ts（sha256）／contact.ts（patch・検査・履歴の 1 行）／lib/nox/shift/period-needs.ts（期間×曜日→必要人数・フォーム 7 欄）／decline.ts（辞退の印）／cast-report.ts（ack 状態・chip・履歴の 1 行）／lib/nox/line/liff-endpoint.ts（入口・bind・Webhook の URL・設定検査・上限の段 200／5,000／30,000）／push-forecast.ts（JST 暦月・見込み・状態）／server.ts（Vault・署名・id_token・セッション・push＋台帳・reply）／subject.ts（subject→Auth・行き先）。
- **通知（0176 ★5 (d)・裁定413）**: lib/nox/people/notify.ts＝cast_notification_create＋POST /api/line/push（連携済みなら LINE・デモ org は 204）。配線＝shift-board の 確定（confirmShift／decide／一括採用／一括確定／行の確定＝shift_added）・外し（shift_remove＝shift_removed）・送り返し（proposeShifts／調整して送り返す＝shift_proposed）・確定済みの時間変更（shift_changed）・催促（C2-13＝kind other・remindWishBody）／availability-editor＝店側の保存で availability_changed（本人側は通知しない＝本人→店の器は無い・audit と詳細の表示）。/mine/notices＝上に「あなたへの通知」（開いたら cast_notification_read）・ナビの未読＝お知らせ（本人宛を含む）＋通知。
- **登録→招待の 2 段（0176 ★2 I-1）**: staff-board の登録モーダルに「ログインの方法」（初期パスワード＝従来／招待リンク＝本人がパスワードを決める・メール必須）→POST /api/staff/invite（柵＝staff/create と同じ・デモ 403）→招待リンク <origin>/i/<token>（1 回だけ表示・14 日）・「招待中」の一覧（未受諾・期限内）。公開面 app/i/[token]（admin で sha256 引き・白地）→POST /api/staff/invite/accept（Auth 作成→staff_invite_accept→失敗は deleteUser→signInWithPassword で cookie）→/dashboard。
- **LINE（0176 ★1・401）**: 店舗設定 ＞ LINE 連携（?tab=line・nav）＝入口 URL（LIFF エンドポイント）と Webhook URL のコピー・公開値 3（set_store_line_config）・シークレット 2（POST /api/line/secret→Vault・「変更時のみ入力」）・月の上限（set_store_line_limit・段 −／＋・任意の数）・今月の送信数（line_push_month_summary・着地見込み・near／over の文）。紐付け＝キャスト詳細／スタッフ編集の「連携のリンクを発行」（line_bind_token_create・7 日・1 回だけ・デモは出さない）→/liff/[storeId]?t=…&m=bind（LIFF SDK→id_token→POST /api/line/bind→bind_line→セッション）。ログイン＝/liff/[storeId]（POST /api/line/session＝line_links→subject→magiclink をサーバ内で消費・cookie nox_line_store）。Webhook＝/api/line/webhook/[storeId]（署名・destination・follow／テキストに入口を reply・デモは返事なし）。push＝lib/nox/line/server.ts pushAndLog（上限の判定なし・429 は failed で台帳）。★キャストが未招待（user_id なし）のときの LINE からの初回作成（onboard）は器が無い＝0182 起草候補（【事後承認待ち】）。
- **I-4（0176 ★3）**: /mine の連絡＝attendance_set_self の後に attendance_contact_log（self）・店の「遅刻／当欠として記録」＝attendance_contact_log（store）・今日タブの chip「連絡 n 件（未確認 m）」（m＝ack_at 無し）・行に「確認済みにする」（attendance_ack）→「確認済み 15:50」・同日 2 回以上は「連絡 n 回」の折りたたみ履歴・/mine は「店が確認しました（時刻）」。
- **400（0176 ★4）**: /mine「連絡先」カード（contact-form＝set_my_contact・デモは案内）→店側 /casts・/staff の「連絡先の変更（未確認 N）」パネル（contact-changes-panel＝contact_change_confirm・0 件は出ない）。
- **シフトの 5 件（0176 ★5）**: (a) 期間フォームに必要人数 7 欄（空欄＝店の既定・shift_period_needs_set 全置換・カードに「必要 月3・金4」の chip・dayStat は期間の行があれば終日 1 バンドで優先）(b) /api/cron/shift-periods-close（Bearer CRON_SECRET→shift_periods_auto_close）＋cron の手貼り SQL（JST 06:10）(c) /mine 確認待ち（あなた）の行に「辞退」（shift_cast_decline・理由任意）→承認待ちの行に「辞退あり 10/26『理由』」(d) 追加／外しの通知（上）(e) 募集中の「未提出の N 人にお知らせを送る」（notice_create_targets・掲載期限＝希望締切・LINE 連携済みには LINE も）。
- **suite**＝verify-nox-on3（28 checks・f0 137 段目）＝純関数 8／配線 8／DB 段 10（nox-dev・1 トランザクション ROLLBACK＝招待の発行・I-4 の履歴と ack・通知の可視と既読・宛先つきお知らせ・期間の必要人数・辞退・LINE 設定／bind／上限／台帳／月次・自動締切）／招待の受諾 2（PostgREST＝本物の Auth を作って staff_invite_accept→決めたパスワードでログイン→finally で全部消す）。張替え＝demo-guard（A に staff/invite・line/secret・line/push、B に staff/invite/accept・line/session・line/bind・line/webhook/[storeId]・cron/shift-periods-close・dg(6-3) は「LINE の route は柵つき」に改定）・messages（公開面 2 つを除外＝白地で Message 部品が使えない）。★f0 で見つかった正当な張替え 6＝nav nv(5-2)（店舗設定タブ 2→3）／shift-nav sn(3-4)（期間フォーム pf-row 2→3）／mine-recon mr(5-4)（notices select に cast_ids）／master-top mt(1-3)（店舗設定 3 タブ）／s-lane shb(8)（辞退ボタンが「無い」→「ある」）／shb2(4-3)（催促 無効→有効）／x13h(10-1)（/mine の文言「記録待ち」→「確認待ち」・keep 変数化）＝いずれも本便の変更そのもの（golden 不変）。x13h(1-2) は push-forecast.ts の「翌月 0 日」を lib/nox/month の daysInMonthOf に寄せて解消（規約側が正）。
- **f0**＝run1〜run4 は張替え赤（nav→shift-nav→mine-recon→master-top／s-lane／shb2（単独走の洗い出し）→x13h）を 1 本ずつ直し、run5 137 段 6,524 緑（15:31→15:41）・run6 137 段 6,524 緑（15:41→15:52）＝2 連緑・golden 不変（5931／125802・pay 130・payroll 234）・tsc 0・lint 0（既存 warn 1）・build 緑。ON-4 で先行した 4 ファイル（flag.ts／flag.mjs／lib/nox/register/seat-move.ts／register-board の確認文）と 0180〜0182 起草は本コミットから外す（ON-4 の f0 で回す）。
- **コミット**＝feat 0c13010 push 済み（15:52）。**deploy**＝GitHub deployments success 15:5x。**6 店 reset**＝cron route 6 店 ok（wipe+load）。
- **live（本番・ACE・内蔵ブラウザ・E-23＝scrollIntoView 後の elementFromPoint）**: ②ひなの（キャスト）が遅刻連絡（見込み 21:30・理由）→/mine「遅刻の連絡は店に届きました（店の確認待ち）」→オーナーの今日タブ chip「連絡 2 件（未確認 2）」→行の「確認済みにする」（押せる＝elementFromPoint 一致）→「確認済み 15:57」・chip「未確認 1」。③② 提出一覧（11/2〜11/8 募集中・未提出 7）→「未提出の 7 人にお知らせを送る」→件名／本文の既定（「シフト希望（11/2〜11/8）の提出をお願いします。締切 10/29」）→送信「未提出の 7 人にお知らせを送りました」→ひなのの /mine/notices にお知らせ・ナビ「お知らせ（2）」。催促ボタン 7 つとも有効。④オーナーが ③配置でひなの 11/4 を調整（21:00〜）→「調整して送り返す」→ひなのの /mine/notices に通知「確認のお願い」・/mine 来月の行「確認待ち（あなた）確認する／辞退」→辞退（理由）→行は「確認待ち」（店側へ戻る）→オーナーの ③（ym=2026-11）承認待ちの行に「辞退あり 10/26『用事が入りました（live ON-3）』」。LINE 連携タブ＝入口 URL と Webhook URL が出る・デモは保存ボタンなし・上限 200・今月 0（normal）。①（招待の受諾）はデモ 403＝suite on3(4-1)(4-2) で代替。
- **live で見つけたこと（ON-4 で直す）**: 通知の文面の終了時刻が「26:00」表記（他の画面は「翌02:00」）＝notify-text の時刻を fmtWin 相当にする。承認待ちのシフト行は表示月の分だけ（既存の挙動・ym=2026-10 では 11 月の辞退行が出ない）＝【事後承認待ち】⑨。
- **【事後承認待ち】**: ①LINE からの初回作成（onboard＝未招待のキャストが LINE で入る）は 0182 起草候補（cast_invite の service_role 版）＝本便は bind のみ（ログインの招待が先） ②催促の通知は kind 'other'（0176 の CHECK に remind が無い） ③未提出者への一括お知らせは通知（cast_notifications）を作らない（お知らせ＋LINE だけ＝二重に出さない） ④LINE push の上限判定は無い（BANZEN と同じ） ⑤本人→店の「相手に通知」は器が無い（audit だけ・キャスト詳細の表示）＝0182 候補 ⑥cron job の登録（docs/demo/cron_shift_periods_close.sql）は Agoora 手貼り ⑦live ①（スタッフ登録→招待→受諾）はデモ org 403（裁定273-6）＝nox-dev の suite で代替・本番は Agoora の自 org で ⑧LINE の live は LINE Developers のチャネルが要る＝設定画面の表示まで ⑨承認待ちのシフト行（planned／proposed）は表示月の分だけ＝別の月の辞退は月を切り替えて見る（希望は全期間）＝既存の挙動を維持。

**便 NR-1（2026-10-26・裁定428 候補＝ノルマ設定（店）の再構成＋定休日のシフト反映・DB 変更 0）＝台帳の現在地**: 前提＝HEAD 63459bc（ON-1 feat）＝origin。読取＝①減額の保存先＝penalty_config（norm_days／dohan／shimei／sales の flat・per＋norm_sales_unit＝4 軸ぶん揃っている）②cast_norms＝days／dohan／sales／shimei の 4 目標（set_cast_norm 6 引数・cast_quotas は /mine 用の別表）③出勤日数の目標＝cast_norms.days_target（個別＞プラン既定）・裁定418 ⑤の規定日数＝plan_norm_tiers（W 別）＝別物で混ぜない／B＝配置の追加・希望の採用は UI＋RPC 'closed day' でブロック済み・月カレンダーのセル・必要人数・不足日・予想人件費は store_business_hours を読んでいなかった。
- **A ノルマ設定（店）**: パネル 2 つ＝「軸と減額」（app/(manage)/master/cast-comp/norma/norm-axes-penalty-panel.tsx＝採用チェックと同じ行に 定額／不足 1 単位ごと＋金額・未採用の軸は減額を出さない・保存 1 つ＝set_store_norm_axes→set_store_norm_config→set_penalty_config を順に・引数は全部明示）／「キャスト別の目標」（NormTab＝列は採用した軸だけ・まとめて入力も同じ列）。遅刻・当欠の検知（閾値）は控除・送りタブ（deduction-board・PenaltyTab part="detect"・ひな形への案内つき）へ移設。説明は 1 行＋ⓘ（InfoNote）・※の注記を撤去・旧 norm-config-panel.tsx は撤去。⑤390px＝CSS .nox-normax（≤430: セグメント 2 択 50／50・金額欄 100%・保存は中央）。⑥同伴の単位＝「不足 1 回ごと」（PENALTY_AXES／ラベルの「本」を「回」に）。純関数＝lib/nox/store/norm-panel.ts（axisModeOf／axisSwitchModeOf／axisSetAmountOf／perUnitLabelOf）。
- **B 定休日**: lib/nox/shift/cal-cell.ts に Fill "closed"（cellTextOf(st, closed)＝中央「定休日」）・CalCell に closed prop（data-cal-closed・地色 --cal-closed-bg #3b3b46／fg #d7d7df＝コントラスト 8.9・進行バッジ非表示）・凡例に「定休日（対象外）」（LEGEND_FILL は 4 のまま）。shift-board＝closedDows（store_business_hours.is_closed）／isClosedDay・dayStat は定休日で required 0（不足日から除外）・予想人件費は定休日を continue・スタッフ別の列（data-staff-closed）・必要人数の定休日行「定休日（必要人数 0・入力不可）」（data-need-closed）＋saveNeed のガード・既にある行は赤バッジ「定休日」（従来）＋確定表の案内（data-closed-shift-note＝消す／残すは店長・自動削除なし）。新規配置・希望のブロックは従来どおり（shiftHoursStatus closed＋RPC 'closed day'）。⑤デモ＝lib/nox/demo/seed.ts afterResetHooks に demoDropClosedDayShifts（定休日の曜日の shifts／shift_wishes を reset 後に削除・全デモ店）＝payload の日付は {$rel} で曜日が reset 日で決まるため生成器では落とせない。
- **suite**＝verify-nox-nr1（21 checks・f0 134 段目）・張替え＝x13i(2-2)／p174(2-1)／na(3-2)(3-4)／x13h(9-1)。**f0**＝run1 134 段 6,469 緑（12:42→12:50・golden 不変 5931／125802・pay 130・payroll 234）・run2 134 段 6,469 緑（12:50→12:59）＝2 連緑。lint 0・tsc 0・build 緑（Compiled successfully 13.0s）。
- **【事後承認待ち】**: ①裁定428 候補（本便の A①〜⑥・B①〜⑤）②「未達の減額を使う」（norm_on）は「軸と減額」の先頭に残した（OFF の軸は「減額なし」）③罰金ひな形は利用機能タブにある（控除・送りではない）＝閾値パネルから「ひな形を開く」で飛ばす④定休日の既存シフトは自動で消さない（デモの reset 後処理だけ消す＝B⑤の実装）⑤定休日は予想人件費・不足日から除外するが、既にある確定行の確定人時（月の集計）には入る⑥旧 norm-config-panel.tsx の撤去⑦CI（GitHub Actions typecheck／lint／verify:ci）は 10/23 以降ずっと失敗＝ON-1 起因ではない（ローカルは tsc 0・lint 0・verify:ci 緑）＝要確認（Agoora の Actions ログ）⑧**ON-1 の Vercel deploy が push（63459bc）から 70 分以上届かない**（本番は旧ビルド＝data-okuri-pending が残る）＝ON-1／NR-1 の live は deploy が届いてから。
- **コミット**＝feat b8cedf3 push 済み。**deploy**＝push から 103 秒で到達（ON-1 の 63459bc も同時に到達＝ON-1 の deploy 遅れは Vercel 側の 70 分超の遅延・原因不明＝【事後承認待ち】⑧は「遅れて届いた」に更新）。**6 店 reset 13:06**（cron route・6 店 ok）。
- **live（本番・ACE オーナー・内蔵ブラウザ・E-23＝elementFromPoint）**: NR-1 ①PC＝4 軸をチェックすると減額欄が 4 行（定額／不足 1 日ごと・不足 1 回ごと（同伴・指名）・不足 100,000 円ごと（売上）＋金額）・キャスト別の目標は採用軸の列（売上(円)・指名(回)）・InfoNote 2・※なし・保存ボタン hit ②390px（375 実測）＝4 軸のセグメント 155／155 px（親幅 311）・金額欄 293 px・保存は中央（cx 188／375）・横スクロールなし（scrollWidth 375） ③11 月カレンダー＝日曜 5 日が「定休日」（地色 #3b3b46・進行バッジ非表示・凡例に「定休日（対象外）」）・不足日は期間のある日のうち・予想人件費に入らない ④11/1（日）の「その日の配置」でキャストを押しても追加されない（確定 0／予定 0・DB でも 11/1 の shifts 0）・必要人数の日曜行は「定休日（必要人数 0・入力不可）」＋ガードの文言 ⑤reset 後＝デモ 6 店とも日曜の shifts 0（demoDropClosedDayShifts が効いた）。**ON-1 の live 5 点**（同じ deploy）＝①利用機能＝就業規則の行・ドリンクバック ON／OFF（切替→「OFF にしました」→戻す＝保存できる）・売上小計の範囲・支払サイクル・税の既定の注記／キャストのレジ 3 段階（ACE＝会計まで）・スタッフの割引 3 段階（ACE＝上限内は即時）／待遇プランの「報酬の軸」ラジオ 4 択（店の軸に従う） ②入金（カード）＝手数料 3 択「店の率／なし／額を指定」（¥1,452＝10%） ③**レジ A3 の延長ボタン＝パターン名・▾ が出ない**＝payload の開いている伝票に ext_menu_snap／ext_rule_id が無かった（gen-demo が null で書いていた＝本番の check_open だけが凍結する）→ gen-demo を直し（開いている伝票だけ店の延長ルールを凍結・既定に印）payload を再生成＝次の deploy＋reset で出る ④顧客管理「キープボトル」タブ（hit・0 本） ⑤給与右パネル（ひなの）＝「前借り／送り実費」「送りの発行（ひなの）」（実費の店の文言）。**領収書 1 枚発行**＝/receipts の再発行＝R-000002 発行・R-000001 取消済み（receipt_issue の 0179 経路）。
- **次**＝裁定414 追補（client 実装済み・f0 2 連→commit→push→reset→live）。

**便 414 追補（2026-10-26・裁定414 追補＝送りの既定を定額徴収に・定額に距離区分 3 段・日報の送り行は実費立替の店だけ）起草＝台帳の現在地**: 読取＝①0177 の transport.mode（actual／flat／store）・定額は stores.settings_json.okuri_base_amount＝1 店 1 額（距離区分なし）・okuri_mode の既定は coalesce→'flat'＝新規店はすでに定額徴収 ②casts に送り区分の列なし→v3 起草 ③日報の送り行＝transport の mode='actual' だけ現金支払（okuriCashOf）・枠は 'none' 以外の店で出る。**0180_okuri_flat_tiers.sql 起草**（884 行・85,908 B・sha16 **57a84a11276ba974**・生成器 docs/tmp/gen_0180.cjs＝live 定義に★差分）＝★1 set_store_profile 白名単 +okuri_flat_tiers（配列・最大 3・{code,name,amount}・code 一意・整数 ≥0・23cd5573→**ffc76412**）／★2 casts +okuri_tier text（CHECK 1〜32）／★3 okuri_today_summary＝退勤の送りの既定額をキャストの区分の額に（無ければ okuri_base_amount・e61e5dd9→**d1b5ca84**）／★4 set_cast_okuri_tier（新設・manager 以上・店の区分の code だけ・**719129cd**）。mig-check OK（plpgsql 3）・本番 BEGIN…ROLLBACK 試走＝3 段の保存→読み戻し一致→set_tier 成功→'bogus' は bad tier→code 重複は bad type→summary 実行可。handpaste_0180.md 済み＝**手貼り待ち（急ぎではない・client はフラグ配下）**。
- **client 実装（2026-10-26）**: フラグ OKURI_TIERS_APPLIED（flag.ts＋鏡・false＝0180 手貼り前・okuriTiersOn()）／lib/nox/shift/okuri-mode.ts＝表示名（actual「タクシー代の立替（レジ現金が出る）」・flat「定額徴収」）＋距離区分の純関数（okuriFlatTiersOf／okuriTierAmountOf／okuriFlatTiersErrOf／okuriTierLabelOf・最大 3）／店設定「控除・送り」（deduction-panel）＝定額徴収の店に距離区分 3 段の編集（code／name／amount・set_store_profile の patch・フラグ false は案内「0180 の適用後に使えます」）／キャスト詳細（casts-board）＝「送り区分（定額徴収）」の select（set_cast_okuri_tier・okuri_tier の select はフラグ true のときだけ＝列が無い本番で落ちない）／日報＝送りの行は okuriCashOf（実費立替）の店だけ／デモ payload＝ACE okuri_mode flat＋okuri_flat_tiers 3 段（500／1,000／1,500）・MUSE actual・LILY store・NOIR none（gen-demo が profileOkuriModeOf を書く＝OKURI_4WAY_APPLIED true）。新規店の既定＝okuri_mode キー無し→'flat'（定額徴収）＝DB の coalesce と client の okuriModeOf が同じ読み方＝変更なし。suite verify-nox-414b（12 checks・f0 135 段目）・張替え demo-profiles dpf(1-4)(2-1)・s-lane s4(8)／shc(1)。**同乗**＝gen-demo の開いている伝票に ext_menu_snap／ext_rule_id を凍結（ON-1 live ③の原因＝payload の開卓伝票にメニューが無かった）。
- **コミット**＝feat fe265e7 push 済み（f0 2 連＝run1 135 段 6,481 緑（13:17→13:25）・run2 は anon-guard 段30（準備）で単発赤→単独緑 1066→取り直し 135 段 6,481 緑（13:29→13:38）・build 緑）。deploy＝13:44 到達（「定額徴収」の SSR）。
- **★reset 失敗（13:45・deployed payload fe265e7）＝ACE と MUSE が wipe されたまま load 失敗**: ①ACE＝'org mismatch'＝フラグ true で gen-demo が載せる **ACE の admin membership（demo-ace-admin）の users 行が本番に無い**（create-demo-orgs --apply＝Agoora 未実施）→ meta.users の写像が効かず memberships の検査で落ちた ②MUSE＝comp_plans.pay_rate_tiers の NOT NULL＝主プランだけ CANON のキーを持ち、追加プラン・体験入店は持たない→jsonb_populate_recordset は表内のキー集合の和で列を作り、無い行は null（既定は使わない＝恒久注意）③同乗で見つけた ext_rule_id＝checks が pricing_rules より先に load されるため FK で落ちる（cron の 'reset failed' 経路）。**復旧**＝gen-demo を直し（admin membership は DEMO_ACE_ADMIN_USER_READY=false で載せない・CANON 店の comp_plans 全行に 0175 のキー・ext_rule_id は null＝ext_menu_snap だけ）→payload 再生成→**ローカル reset（docs/tmp/q1019_d1_reset.mts --apply・admin client）で 6 店とも ok（13:5x）**。deployed payload は次の push（ON-2）で直る＝06:05 の cron までに push する。**教訓候補 2 件**＝(a) payload は表ごとにキー集合を揃える（jsonb_populate_recordset は既定を使わない＝★恒久注意の再確認）(b) payload に FK 先が後ろの表の id を載せない（c_load の順＝checks→pricing_rules）。
- **live（本番 fe265e7・ACE オーナー・内蔵ブラウザ）**: ①日報の現金支払の内訳＝前借り／日払い／給与支払／その他だけ（送りの行なし＝定額徴収） ②控除・送り＝「現在: 定額徴収」・4 択「タクシー代の立替（レジ現金が出る）／定額徴収／店負担／なし」・距離区分は案内「0180 の適用後に使えます」（フラグ false） ③キャスト詳細の送り区分＝フラグ false で出さない（0180 後） ④給与の送り控除が区分の額＝0180 後。**ON-1 ③ の再確認**＝レジ A3「延長（¥13,000 / 60分・平日通常 延長 60 分）」＋「▾」（hit・ext_menu_snap 凍結が効いた）。
- **【事後承認待ち】**: ⓪admin membership は demo-ace-admin の users 行ができるまで payload に載せない（R-8 の管理者ログインの live は Agoora の create-demo-orgs の後）・①裁定414 追補（相談役案）＝既定は定額徴収（DB・client とも従来の 'flat' 既定のまま＝変更なし）・実費立替の表示名・距離区分は最大 3・区分 code は店設定の配列の code（キャストは null＝ベース額）②0180 は適用まで client がフラグで眠る（距離区分・送り区分・退勤の既定額）③日報の送り行は定額徴収・店負担・なしの店には出さない（送りの枠自体＝記録ボタンは okuriAsks のまま）④デモ MUSE は「実費立替」のまま（指示どおり）⑤ACE の okuri_flat_tiers を payload に入れた（0180 前は白名単外のキーだが payload は settings_json を丸ごと載せる＝読まれないだけ）⑥gen-demo の ext_menu_snap 凍結（開いている伝票だけ・closed は null）。

**便 ON-1（2026-10-26・RULES_0175_APPLIED／OKURI_4WAY_APPLIED＝true）完了＝feat 63459bc push 済み・f0 2 連緑 133 段 6,448（12:06→12:14／12:15→12:23・golden 不変）・build 緑・live は Vercel deploy 待ち（push から 70 分超で旧ビルドのまま＝【事後承認待ち】⑧）**: 前提＝HEAD 068417f＝origin（裁定427 docs）。本番 DB＝0175 v2（3979b9fcf596acb7）／0176（afaf05e83adba894）／0177（e22bfcc3eb93625c）を Agoora が 10/26 に手貼り済み。**着手前の確認**＝①verify_0175_0176.sql を psql（read only）で再実行＝全 true（関数数 367＝期待 357 を 314＋30（0175 v2 追補 2・3 込み）＋23 に張替え・表数 104・md5 不一致 空）②0177＝transport.mode（text not null 既定 actual・CHECK 3 値）・set_store_okuri_mode の受理 4 値・6 本の md5（set_store_okuri_mode 7720dc91／okuri_default_of 65ac2719／transport_issue 3a9b8a0d／transport_issue_bulk d998fd83／transport_issue_self be4c7cdd／kiosk_transport_issue d63097af）＝起草の関数本体の md5 と全一致・proacl 不変・既存 1 行 actual＝**適用済み**。**収蔵**＝supabase/migrations/0175_rules_bundle.sql／0176_people_line.sql／0177_okuri_mode_4way.sql（Downloads／docs/tmp から byte 複写・sha16 一致）。
- **フラグ true**＝lib/nox/rules-0175/flag.ts＋scripts/demo/rules-0175-flag.mjs（両方・鏡）。pin 張替え＝p175prep (1-1)(1-2)(1-3)(3-0)(3-9)・s-lane s4(8)／sh(2)・payroll「mig0115 ★dohan rate 封印」→0175 v2 ★12 で解錠＝rate 50 が通る＋per_count に戻す 1 check（golden 233→234 見込み）。
- **DB 段の合流**＝verify-nox-0175-0176 の SKIP を撤去（未適用は赤）＋(3) 0177 DB 段（列・CHECK・6 本 md5＝収蔵 mig と照合・proacl・pgTx で owner の 4 値／'bogus'＝'bad mode'／'none' の店の transport_issue＝'okuri none'／'store'＝通って mode='store'／'flat'／anon BLOCKED）＋(4) 効く段（★17 attendance_set('dohan')＝'bad status'・★29 check_group_due＝開卓後に stores を 100・up にすると due が 100 の倍数、1・down に戻すと元・R-2 payroll_adjustment_cancel が cancelled_at を書く／cast は forbidden・P-1 cast_rate_history_add・ROLLBACK 残留 0・admin 経由の loader＝loadPayrollAdjustments が取消済みを数えない／loadRateHistory が期間の履歴を読む＝隔離 period 2033-02・finally 削除）＝**38 checks 緑**→ f0 末尾（133 段目）。
- **fix（本番 0175 後の初走で発覚）**＝①lib/nox/payroll/rules-0175-collect.ts loadCastMeta0175 と components/nox/availability-editor.tsx が **memberships.cast_id（存在しない列）** を読んでいた→casts.user_id→memberships（user_id・store_id・is_active）で解く（payroll suite が「column memberships.cast_id does not exist」で異常終了した）。
- **★本番欠陥（0175 v2 ★29・裁定424 候補の実装）＝check_group_due が closed の伝票で丸め設定を NULL にする**: 「開いている伝票は stores の丸めを読む」の `select s.round_unit, s.round_mode into v_unit, v_mode … where c.status='open'` は、closed（該当行なし）だと plpgsql の select…into が v_unit／v_mode を NULL で上書き→check_round_amount(…, NULL, NULL)＝NULL→**cast_sales_aggregate の g.due > 0 で確定済み伝票の売上が 0**（demo 6 店の closed 5,176 件すべて due NULL を実測・payroll suite F2c-2 4 件＋裁定97-B 1 件が赤＝get_cast_sales が sales 0）。**live の影響＝10/26 の手貼り以降、デモ 6 店と本番 CLUB NOX のキャスト売上・ノルマ・歩合・スライド・給与の売上部分が 0**（会計・入金・日報の金額は checks の凍結値＝影響なし）。**直し＝0178_check_group_due_closed_fix.sql**（supabase/migrations・94 行・8,339 B・LF・sha16 **6a952a2811c5eaad**・翻訳元＝live pg_get_functiondef md5 ea7754a9・★1 だけ＝作業変数 v_unit2／v_mode2 に受け if found のときだけ上書き・4 ロール revoke 明示・新 md5 **dc4163e6**）。検証＝本番で BEGIN…ROLLBACK 試走（11:5x JST）＝CREATE 成功・md5 dc4163e6・closed 5,176 の null_due 0・same_as_total 5,176・open 31 の null 0／scripts/mig-check.mjs（教訓116・使い捨てローカル Postgres 5499＋libpg-query 17）＝OK（errors 0・plpgsql 1）。手貼り案内＝docs/demo/handpaste_0178.md・verify_0175_0176.sql の pin は check_group_due＝dc4163e6 に張替え済み（適用前は ea7754a9＝false になる）。
- **build**＝next build 緑（Compiled successfully 19.3s・tsc 0・tsconfig 復元）。**f0 2 連・commit・push・6 店 reset・live は 0178 適用後**（payroll の売上 5 件が DB 由来で赤のため）。reset＝docs/tmp/on1_reset.mjs（Vault の nox_cron_secret／nox_demo_reset_url を読んで cron route を叩く）・live SSR 指紋＝docs/tmp/on1_live.mjs（デモ入場 cookie・data-rules-0175-panel／キープボトル／data-okuri-4way・--wait で deploy 検知）。
- **【事後承認待ち】**: ①関数数の期待を 367 に張替え（式 314＋30＋23）②0178 を便 ON-1 の同乗 hotfix として起草（0175 の ★29 を差し戻さず if found 化＝裁定424 候補の意図は保つ）③0175-0176 suite の (4) は NOX-VERIFY-A1 の隔離 period 2033-02 を admin で書いて finally で消す（pgTx で見えない loader の検証のため・教訓117 の範囲内）④mig0115 の封印 pin を「解錠」に張替え（CN-R ⑭ 承認済みの帰結）⑤collect／availability-editor の membership 解決＝casts.user_id 経由（memberships は user × store）。
- **0178 適用欄（2026-10-26）**: 手貼り＝Agoora 2026-10-26（sha16 6a952a2811c5eaad・supabase/migrations の収蔵版と同一）。CC の適用後読取（psql・read only）＝check_group_due md5 **dc4163e6**・★0178 の語あり・proacl {postgres=X/postgres}（内部専用のまま）・demo 6 店 closed 5,176 件の null_due **0**・same_as_total 5,176・open 31 件の null 0・verify_0175_0176.sql 全 true（関数数 367・表数 104・md5 不一致 空＝check_group_due の pin dc4163e6 で一致）。payroll 単独＝**ALL PASS 234**（売上 5 件の赤が消え、mig0115 解錠＋per_count 戻しの 1 check 増＝golden 233→234）。教訓120 候補（select … into の行なし NULL 上書き）を §教訓に起案。
- **f0 run1（0178 後・11:3x）**＝anon-guard 段31-c で赤（★25＝set_store_cast_register(true) は「注文のみ（1）」→cast の check_pay forbidden）→ suite を 3 段階に張替え（1 で forbidden・owner が set_store_profile {sys_cast_register: 2}・2 で通る＝1066）。以降の段を止まらない形で一括洗い（docs/tmp/on1_rest.log・教訓115）＝赤 15 suite＝**全部 0175 v2／0177 の正当な変更に対する pin**: grants G9（transport 16・bottle_keeps 17・check_lines 22・punches 15・daily_pays 17）／rls F2e-2（flat は受理＝拒否は 'none'）／ext-menu 段55（延長行の名前「延長料金（<パターン名>）」）／rate-back 段45-4（per_count＋rate の併用は通る）／r2b(8)・payroll mig0115（dohan rate の封印は解錠）／store-systems ss(4-0)(4-1)（白名単 67 キー・sys_* は 9＋0175 の 4）／issue-bulk ib(2-1)（'none' で拒否）・md5 transport_issue／daily-pay dp(3-3)（flat は out 省略→false）／0158（md5 12 本・comp_plans 47 列・関数 367・transport 16）／p172(6-3)(6-4)・p173(8-1)（0175 以降で変わった 8 種の行は除外）・p174(8-1)（set_comp_plan 32 引数）／payroll-adjust（列 24・CHECK 7・FK 8・add 14 引数）／customers-keep ck(1-4)（sys_cast_register 1 を併記）／billing 段47-1（対象 181・除外 186＝docs/NOX_課金ゲート対象_v1.md に A11（21 本）と B(o)（32 本）を収載）。
- **★本番欠陥 2 件目（0175 v2 ★2・裁定402 再発行）＝receipt_issue が全呼び出しで落ちる**: `v_amt := coalesce(p_amount, case when p_reissue_of is not null then v_old.amount else … end)` の 1 式が、未代入の record v_old を plpgsql の式準備時に解決できず「record "v_old" is not assigned yet」（receipt-ledger 段56(2) で発覚・本番 BEGIN…ROLLBACK で manager の通常発行 2 回とも再現）。**live の影響＝10/26 の手貼り以降、領収書の発行（再発行・公開ページの元）が 1 枚もできない**。直し＝**0179_receipt_issue_reissue_fix.sql**（187 行・14,852 B・sha16 **1206583f893c41a9**・翻訳元 md5 8f036095・★1＝if p_reissue_of is not null then … else … end if・新 md5 **c564a8d7**・ACL 写経元どおり）。検証＝本番 BEGIN…ROLLBACK（12:2x JST＝CREATE 成功・manager の発行 2 回成功・md5 c564a8d7）／mig-check OK（plpgsql 1）。手貼り案内＝docs/demo/handpaste_0179.md・verify_0175_0176.sql の pin は receipt_issue＝c564a8d7 に張替え済み。教訓120 候補に追記（未代入 record の参照は CASE の分岐に入らなくても落ちる＝同根）。
- **次**＝Agoora 手貼り 0179→CC＝verify 全 true→receipt-ledger 単独緑→f0 2 連（133 段）→「feat: ON-1（RULES_0175_APPLIED=true）」→push→6 店 reset→live 5 点→NR-1→裁定414 追補→ON-2。

**便 SH-UI-c2 完了（2026-10-23・勤怠一覧の編集と日別の算定給与＋C2-6〜C2-21）＝台帳の現在地**: 前提＝HEAD d5fc6a9（追補 3 docs）。DB 恒久変更 0（0175 v2 は起草のみ・★29 を追加）。本番書込＝デモ 6 店の reset と live の試走（ACE）。feat 088693f（5 コミット＝勤怠 391eefb／棚卸し・スライド・売上バック・請求 9c5f889／C2-13〜21 a3f6981／追補 088693f＝C2-20 ② 営業時間の深夜またぎ＝終了が開始以下（stores に "01:00" 形式で保存された店）は翌日扱い＝live で ACE の 22:30 予約が「営業時間外」になり発見）。
- **C2-1〜C2-5 勤怠の編集・日別算定**: 日付の遷移（→今日タブ）を撤去＝日付を押すとその行が編集で開く（components/nox/kintai-edit＝Modal・≤900 はシート）・「この月のシフトを開く」1 本。編集＝出／退（翌表記）→ punch_correction_request（owner／manager は申請＝確定・理由必須・店の修正に残る）・区分→ attendance_set・追加＝shift_set（confirmed＝飛び入り）＋punch_correction_request（新規 insert）・取消＝打刻の削除（after null）＋shift_remove＋区分 off（理由）＝行は「取消済み」（器 cancelled_at は無い＝0175 行き）。確定済みの月は読取専用で「確定済み」。**日別算定で使った関数**＝lib/nox/payroll/daily-pay.ts（dailyWageOf＝wdays の hourly×hours・dailyBacksOf＝pay.ts の指名バック式を日に写す（per_count／rate）＋check_cast_backs／drink_claims の営業日合算・dailyFinesOf＝payroll_adjustments の sanction／settlement／shortfall を target_shift_id／biz_date で日に・dailyPayRowsOf・monthSummaryOf＝①月で決まる支給（gross−Σ(時給分＋バック)）②控除（(gross−net)−Σ罰金）③差引＝net＝恒等 Σ日計＋①−②＝net）・組み立て＝lib/nox/payroll/kintai-sheet.ts buildKintaiSheet（computePayrollDraft＝給与と同じ draft・確定済みは payslips の凍結値・route と /mine が共用）。**golden の差＝0**（玲奈 5170／5931・源泉 117241／125802 不変＝daily-pay は結果を読むだけ・payload byte 同一）。CSV・印刷用にも 4 列。390px＝日付・出／退・日計の 3 列。デモ ACE ひなの＝reset 後処理で遅刻 ¥2,000（精算調整・target_shift_id・demoLateFineForAce）。
- **C2-6／C2-7**: 合計表に 時給分｜バック｜罰金・減額｜現時点の差引支給（＝給与の net・注記「現時点（10/23 まで）」／「確定」）＋合計行・390px は キャスト｜日数｜差引＋▸で残り。1,024px 未満は画面下のシート（components/ui/bottom-sheet＝高さ 90%・取っ手・閉じる・CSV／印刷は上端）。
- **C2-8 棚卸し 390px**: 分類はグループ見出し行（広い幅も）・2 行カード（商品名…現在庫／[−][n][＋] 本 差分）・既定値＝現在庫・長押し連続・固定バー「記録する（差分あり N 件）」・「無効の商品も表示（n 件）」・説明は「？」。
- **C2-9 スライド行**: slideLinesOf（breakdown-lines）＝段なし「スライド 10月（暫定・期首〜今日）」＋「売上 ¥211,604 → 段なし・基本時給 ¥1,800 のまま」・金額「—」／段あり「→ 段 2（時給 ¥2,000・+¥200/h）」＝上乗せ Σ／保証中「・保証 ¥3,200（10/24 まで）が優先」／確定済みは「（月の累計）」等／390px は見出し＋結果の 2 行（.nox-bd-l2）。右パネル・明細 PDF（/mine）が同じ関数。CSV（lib/nox/payroll/csv.ts）は行を持たない＝対象外。
- **C2-10（裁定412 の残り）**: 「売上歩合」→「売上バック（率）」＝各種バックの並び・出し分けは sys_backs（collect の売上率テーブルも sys_backs）。**sys_sales_rate を読んでいた箇所**＝lib/nox/payroll/breakdown-lines.ts（行の制度）・collect.ts（R-5c の gate）・assemble.ts（型の注記）・store-systems.ts（使用中の集計 backsUsageOf・ラベル・REWARD_AXIS_KEYS＝不変）・setup/template-plan.ts（初期設定の既定 false＝不変）・demo profiles.mjs（設定キー＝不変）＝client だけで統合できた（0175 の器は不要）。
- **C2-11**: 追補 2（裁定420＝3 段階 sys_cast_register）で実施済み＝本便の対象外。
- **C2-12**: 会計タブ「①請求を確認」の見出し＝外税「請求（税・サ込）」／内税「請求（サ込・内税）」（伝票の凍結値で判定・値は明細の「合計（税込）」と同じ due）・キオスクも同じ。
- **C2-13 HOME 要承認**: /api/home/pending（RLS・DB 書込なし）＝割引・無料の申請（approvals pending＋卓名・申請者・経過）／シフト希望（期間ごと）／退勤記録なし（直近 7 日の punches）／full=1 で提案（給与 preview と同じ draft）。カード（components/nox/pending-card）＝行内で承認／却下（approval_decide＝レジと同じ RPC・却下は理由必須＝画面で確認・RPC に理由の引数が無い＝audit には残らない＝0175 行き）・他の種別は該当画面へ・0 件は「要承認なし」・スタッフは自分の申請・390px は 2 行。ベル（pending-bell）＝上部バー右上・同じ API＝カードの見出しと同じ数（提案は数えない）。
- **C2-14 デモ payload**: ACE 延長 3 本（平日通常 60 分 ¥13,000 既定／VIP 30 分 ¥9,000／週末通常 30 分 ¥4,000＝平日 30 分 ¥7,000 を外した）・checks.ext_fee／ext_min と延長行＝開卓時のパターン（60/13000 527・30/9000 216・30/4000 222）・延長行 18 本（13,000 の行は日予算に収まらない＝パターンの店は確率 3%（VIP 5%）で予算外＝monthDiffPct +0.13%）。**pin／golden**＝p174(7-1) を張替え（4 本→3 本・既定 60 分）・demo-payload／demo-profiles／x13g は不変（sha は _report.json と同時再生成）。
- **C2-15 読取（3 行）**: ①価格表示／事業者区分／インボイス／税額の端数の SegSelect は「税・サービス料」カード、保存ボタン「税設定を保存」は 2 枚下の別カード（カード手数料の下）＝カード内の「サービス料を保存」（PricingPanel＝set_store_pricing）を押しても価格表示は送られない＝「保存されない」の正体。RPC＝set_store_tax_config（7 引数・白名単あり＝stores.price_display に保存できている）。②バッジ「この店は外税」＝taxBase.pd＝stores.price_display・税計算＝checks の凍結値（開卓時に stores から写す）＝同じ場所。③デモ店で税既定を固定する処理＝なし（payload の stores.price_display＝tax_excluded 6 店）。直し＝保存ボタンをブロック直下に 1 つ「税・サービス料を保存」（PricingPanel の save→set_store_tax_config の順・saveRef）・免税→インボイス「未登録」固定（SegSelect disabled）・注記はボタンの横・保存後は再読込せずバッジが変わる（taxBase）。
- **C2-16 読取（3 行）**: ①丸め（round_unit／round_mode）は開卓時に checks へ凍結（check_open）＝DB の check_group_due も client の groupDueFull も凍結値を読む。②明細の合計と入金ダイアログの請求額＝同じ groupDueFull（due）。③デモ payload の伝票＝round_unit 1／round_mode down（丸めなし）。直し（裁定424 候補・相談役案）＝**0175 v2 ★29**＝check_group_due が開いている伝票（status open）では stores.round_unit／round_mode を読む（税率・サ料・外税／内税・延長パターンの凍結は不変・closed は凍結値）＋client＝lib/nox/rules-0175/rounding.ts dueSettingsOf（フラグ true・open だけ）・端数調整の行は丸めが掛かるときだけ・店設定の注記「（丸め設定は開卓済みの伝票にも次の会計から適用）」はフラグ true で。**v2 最終＝4,739 行・379,986 B・sha16 3979b9fcf596acb7**（mig-check OK plpgsql 56・sql 5・verify SQL pins 83＝0175 61／0176 24・handpaste 更新）。
- **C2-17**: 「承認待ちシフト」＝既定は畳む（見出し「承認待ち 13 件（希望どおり 7・要調整 0・確認待ち 14）▸」・0 は「承認待ちなし」・端末に記憶）・説明は「？」・開くと 集計 4 → 主ボタン「希望どおり一括採用（N 件）」（中央 1 本）→ 副「調整中を送り返す（N）」「放置分を代行確定（N）」（0 は非表示）→ 3 段 → 日付順／人ごと → 一覧。**数字の整合（読取）**＝旧「希望どおり」は採用後（planned／proposed）の時刻一致を数え、一括採用の N は未処理の希望（定休日除く）＝別の集合だった（8≠7）→ 集計の「希望どおり」＝未処理の希望のうち定休日でない件数（＝一括採用の対象）・「要調整」＝定休日の希望。右端の「27 件」＝未処理＋planned＋proposed → 「合計 27 件（未処理 13＋確認待ち 14）」。⑤配置中の期間が無く締切前の期間があるとき＝「締切前の期間が 1 つ（10/30〜11/5・締切 10/26）。締め切ると配置に移ります」＋「②提出一覧で今すぐ締め切る」。
- **C2-18**: ①＝期間の一覧（状態バッジ・編集・削除・状態ごとの導線＝募集中→②／配置中→③／公開済み→④）・フォーム・「必要人数を設定」・凡例（進行の帯）だけ。外した＝見出しカード（月名・公開済み・確定シフトへ・作成中に戻す・④公開シフトへ）・代行確定・集計 4・警告帯・「配置を組む」カレンダー。移設＝代行確定と集計（確定人時／予想人件費／不足日／未処理希望）は ③（既存）・「配置を組む」（月カレンダー／スタッフ別・＋ キャスト別にまとめて追加）は ③ のカレンダー節・「作成中に戻す」と公開ボタンは ④ だけ・④の見出しの月名＝期間の実日付（同じ月「2026年10月」・またぐ「10/30〜11/5」）。
- **C2-19（B2-1 を上書き）**: lib/nox/shift/cal-cell.ts＋components/nox/shift-cal-cell.tsx（CalCell／CalLegend）＝地色は充足だけ（緑／黄／赤／灰の暗い地に明るい字）・右上バッジは進行（作成中ティール／募集中 青／配置中 シアン／公開済み 明緑／期間なし 灰）・中央「確定/必要」＋「あと N 名」（充足／未設定）・「3/4（確認待ち 1）」の小字・凡例 2 列（進行 5／充足 4・390px は 2 段）・不足日は期間のある日だけ（注記）・「手修正」「手3」「●＝確定 ◐」「枠色は自動／手修正」の表示と凡例を撤去（スタッフ別の表は開始時刻の字・日詳細の出所表示も撤去）・セルを押すと「その日の配置」ダイアログは従来・色は CSS 変数（--cal-*／--stg-*）＝コントラスト 3 以上を全組合せで suite が検算。確定シフトタブも同じ地色と右上バッジ。/mine＝店側のカレンダーは無い（wish-form は本人の希望入力＝対象外）。
- **C2-20 レジ「予約」**: 1,024px 以上＝2 列（左 55%＝日付タブ・集計 4・来店見込み・一覧／右 45%＝新規予約フォーム＝sticky）・一覧の「編集」→右のフォームがその予約の編集（見出し「予約の編集」・「やめる」で新規に戻る）・未満は縦 1 列（行内の編集）。②営業時間＝終了時刻ちょうどは営業内（lib/nox/business-hours.ts minutes <= close＝01:00 OK・01:01 時間外・深夜またぎは bizDayParts）。③担当のバッジ＝「打刻」をやめ、その日の予定（出勤予定 20:00／休み＝薄く／着卓中（A3））＝lib/nox/register/reservation-badges.ts castBadgesOf（shifts・attendance・open 伝票の名簿）。④未来店 0 は薄く。
- **C2-21 読取**: 明細の見出し＝components/payslip-slip.tsx の <BrandLogo height={22} print /> 1 か所（横ロゴ 1 枚のはず）。print 版は 2 枚の img（画面＝dark・印刷＝light）を描き CSS（.nox-logo-print display none）で切り替える設計だったが、BrandLogo の inline style display:block が CSS に勝ち、画面にも白地用（黒い「NOX」が暗地で消え N の印だけ見える）が出て二重に見えた＝旧マークの残骸ではない。直し＝print 版の 2 枚は inline に display を持たせない（CSS .nox-logo-screen＝block／.nox-logo-print＝none）。A-2 の 8 か所の再点検＝side-nav／上部バー／login／demo／lp／mine／領収書（light 1 枚）＝単体 1 枚・print 版は明細だけ＝二重なし。
- **suite**＝verify-nox-c2 **51**（f0 132 段・追補で c2(15-1b) 深夜またぎを追加）。pin 張替え＝shc(5)／gvb(5-1)(2-2)(2-3)(9-3)／ms(2-17)／shb2(2-1)(2-2)／sn(2-1)(2-2)(2-6)／p174(7-1)＝いずれも UI の文字列・構造の移動（golden 不変）。
- **f0**＝2 連緑（132 段・run1 19:10→19:18・run2 19:21→19:28・180 秒冷却・赤 0。手前の単独走で re(12-1)／dg(1-1)／pv(7-3)／sp(3-2)／sb(4-1)(4-4)／ws(4-1)／c337(3-2) を張替え＝文言と位置の移動のみ・golden 不変）。追補（深夜またぎ）で取り直し＝run1 19:40→19:48・run2 19:49→19:58・132 段・赤 0。**build**＝next build OK（Compiled successfully 23.7s・tsc 0。追補の取り直し＝tsc 0・Compiled successfully 22.3s）。
- **live（本番・6 店 reset 後）**＝deploy 検知 58 秒（19:30・/dashboard の data-pending-card）→6 店 reset 19:31 ok→API（ACE owner）＝/api/home/pending total 13（割引・無料の申請 6＋シフト希望 7・提案 0・退勤記録なし 0）・/api/attendance/sheet 2026-10 ACE 7 人全員 identity ok（Σ日計＋月で決まる支給−控除＝差引）・ひなの 10/12 罰金 ¥2,000（遅刻・精算調整）・SSR の印＝棚卸し／税設定 1 ボタン／HOME カード＋ベル／予約 2 列／請求の見出し＝Y・旧「税設定を保存」なし。ブラウザ目視（ACE owner・1,280／390px）＝①HOME「要承認 13 件」＋ベル 13 ②勤怠 390px＝3 列＋編集はシート・合計表 3 列＋合計行 ③編集の試走＝ひなの 10/12 出 20:11→20:00 保存→店の修正 1 件・日計 24,267→24,908・差引 388,685→389,261・identity ok（遅刻の印は区分 late 由来＝区分を出勤にすれば消える）・「＋ 日を追加」は 10/24＝未来日で不可（仕様どおり） ④/mine ひなの＝日計 3 列＋罰金 ¥2,000＋月のまとめ 389,261・編集なし ⑤棚卸し 390px＝分類の見出し・2 行カード・固定バー「記録する（差分あり 1 件）」 ⑥シフト ③＝折り畳み見出し「承認待ち 13 件（希望どおり 8・要調整 5・確認待ち 3）」・合計 16 件・主「希望どおり一括採用（8 件）」・副「調整中を送り返す（7）」・締切前の期間の案内・凡例 2 列・11/2 募集中／11/9 期間なし・不足日は期間のある日のうち 4 日 ⑦① カード＝期間一覧＋フォーム＋必要人数・④「2026年10月」＋作成中に戻す ⑧レジ予約＝2 列・編集で右フォーム・未来店 0 は薄く・22:30 の予約が「営業時間外」→ACE は close_hm "01:00" 保存＝深夜またぎの追補（本便の 5 コミット目）で営業内 ⑨A3 延長（¥13,000／60分）・見出し「請求（税・サ込）」 ⑩明細（せな）ロゴ 1 枚 ⑪税＝内税保存→バッジ→再読込で保持→免税でインボイス固定→外税に戻した ⑫料金適用ルール「延長パターン 3 件（上限 3）」 ⑬せな のスライド行の文言 ok。未確認＝MUSE ひかり のスライド行（ブラウザが描画せず・slideLinesOf は ACE と共用）・丸め（0175 ★29 は手貼り後）
- **【事後承認待ち】→ 承認済み（2026-10-26・Agoora・15 件全部）**: ①取消＝cancelled_at の器が無い＝打刻削除＋shift_remove＋区分 off で「取消済み」（0175 行き）②日を追加は営業日の今日まで（未来日は不可・live ②の 10/24 は翌日＝10/22 で試走）③日別のバック＝rate は日ごとに丸め、月の 1 回丸めとの差は「月のまとめ」が吸収④月のまとめの 2 行の名前（月で決まる支給／控除）⑤/mine の日計は builder（本人の cast で絞る・get_cast_sales は本人セッション）⑥C2-13 却下の理由は audit に残らない（approval_decide に引数なし）・ベルの数に提案は含めない⑦C2-14 延長行はパターンの店だけ予算外（確率 3%／5%）⑧C2-15 1 ボタンは PricingPanel の save→税設定の順（サ料率の保存に失敗したら税設定は保存しない）⑨C2-16 は 0175 v2 ★29（DB）＝フラグ false の live では既存伝票の丸めは変わらない（live ⑬は手貼り後）⑩C2-17 集計「希望どおり／要調整」の定義変更⑪C2-18 ① の凡例＝進行の帯（periodBandsJsx）を残した⑫C2-19 スタッフ別の表＝開始時刻の字・確定シフトタブは地色とバッジだけ（名前は従来）・色の実値⑬C2-20 2 列の境は 1,024px（useNarrow）・着卓中は open 伝票の名簿から⑭C2-21 の原因は inline display⑮C2-20 ② 深夜またぎ＝終了が開始以下は翌日扱い（25:00 表記はそのまま・終了ちょうどは営業内）・f0 2 連は追補で取り直し（c2c／c2d）。
- **次**＝Agoora 手貼り P175（v2 最終 sha16 3979b9fcf596acb7）→P176→P177→フラグ true の便（live ⑬ 丸め・管理者ログイン・0175 client）。
**追補 3 完了（2026-10-23・R-8 役割「管理者」の追加＝裁定425 候補）＝台帳の現在地**: 前提＝HEAD 5d23c8a＝origin（追補 2 docs）。DB 恒久変更 0（0175 v2 は起草のみ・本番適用は Agoora 手貼り）。feat 139d060。
- **R-8 ①読取（3 行）**: ①memberships.role＝**text＋CHECK**（owner／manager／staff／cast＝enum ではない）・auth_role()＝sql stable security definer で m.role をそのまま返す（grant authenticated・service_role）。②owner 判定＝**RPC 210 本／314 本**（'owner' literal 226・auth_role() = 'owner' 直書き 106 箇所・v_role 経由 29＋14・'forbidden' 型 24＋7・in ('owner','manager') 型 9＋3）・**RLS 70 本**（全部 auth_role() = 'owner' 経由＝memberships の行を直接読む policy は 0）・memberships の行（m.role）を直接読む RPC は **4 本**（kiosk_login／kiosk_operator_list／staff_pin_status／set_staff_pin＝キオスクと PIN の候補）。③UI のオーナー専用＝/audit（page）・/billing（page＋api/billing 5 route の requireOwner＋org_billing の RLS）・規約の同意（terms/accept＝terms_accept RPC）・ナビ「監査」「ご契約」・課金バナーの復帰導線・スタッフ画面（役職変更 staff_change_role・メール変更・店の選択）・店設定の読み取り専用化（isOwner＝plan-editor 33 箇所ほか）＝grep role === "owner"／isOwner で **71 ファイル 271 箇所**。
- **設計（相談役案）**: owner 判定 210＋70 を書き換えず、**auth_role() が admin→'owner' を返す**（RLS・RPC・client の role 判定がそのまま管理者に効く）。本来の役割は **auth_role_raw()**（新設・authenticated）＝owner 限定 4 つと表示「管理者」だけが使う。
  - **admin に広げなかった 4 つの実装箇所**: ①店舗の解約／削除＝該当 RPC なし（解約は Stripe ポータル＝③の中）②オーナーの変更（移譲）＝**owner_transfer**（新設・raw owner・相手は同じ org の有効な admin／manager→owner・自分は admin に・audit）③NOX の契約と請求＝**org_billing_select を auth_role_raw() = 'owner' に・terms_accept を auth_role_raw に**・client は /billing page・api/billing/_owner.ts（auth_role_raw）・terms/accept・layout の「ご契約」導線・課金バナーの復帰導線（isOwnerRaw）④管理者の任命と解除＝**set_membership_role**（新設・staff／manager／admin・admin の付与と解除は raw owner・staff↔manager はオーナーか管理者・自分の役割は 'self'・owner／cast は 'bad target'・audit by_role）。
  - 監査（/audit・audit_logs_select）は 4 つに無いので管理者も読める（不変）。staff_change_role（staff↔manager・owner 判定＝写しで管理者も可）は不変で残す。
- **0175 v2 最終（追補 3 後）**＝Downloads/0175_rules_bundle_v2_draft.sql（docs/tmp と同一）・**4,671 行・374,589 B・sha16 bf104469163e71ed**・LF・mig-check OK（plpgsql 55・sql 5・errors 0）。前版 f474fb3d706ca96a は撤去。生成器 patch＝gen_0175_r8_patch.cjs（live 補助 0175_live_r8d.json＝read_live_r8d.mjs・読取 read_live_r8.mjs／r8b／r8c）。
  - **★28（裁定425 候補・R-8）**: memberships.role CHECK に 'admin'（序列 owner→admin→manager→staff→cast）・auth_role（admin→'owner'）・auth_role_raw・org_billing_select（raw）・terms_accept（raw）・set_membership_role・owner_transfer・kiosk_login／kiosk_operator_list／staff_pin_status／set_staff_pin＋★27 kiosk_unlock／kiosk_unlock_qr の候補に 'admin'（管理者も PIN／QR で解除できる）。写経元 pin +6（auth_role db860f0a・terms_accept 190912da・kiosk_login 90ab95a4・kiosk_operator_list e9c868bf・staff_pin_status c70866bf・set_staff_pin bda3b520）。
  - handpaste_0175.md（sha・行数・★28・pin 6）・verify_0175_0176.sql 再生成（pin 83＝0175 60／0176 24・新設 RPC 21・★28 の段 1/1/1）・suite verify-nox-0175-0176（新設 21・v175(1-5)）。
- **client（フラグ false で眠る）**: lib/nox/rules-0175/roles.ts（序列・表示名・effectiveRoleOf・任命と解除の候補 roleChangeTargetsOf・文言・ピル・OWNER_ONLY 4・RPC 例外の日本語）。getSessionRole に **roleRaw**（フラグ true で auth_role_raw を 1 本並行・false は従来 1 本）。(a) スタッフ画面＝一覧に管理者（staffListRolesOf）・役割ピル「管理者」（濃い地＝オーナーの隣）・役割変更＝候補ボタン（オーナー: 店長に昇格／管理者に昇格・店長→スタッフに降格／管理者に昇格・管理者→店長に降格／スタッフに降格。管理者: 店長↔スタッフだけ＋注記「管理者の任命・解除はオーナーのみ」）＝RPC set_membership_role・フラグ false は従来の staff_change_role ボタン。(b) オーナー専用の画面・ボタン＝role は auth_role の写しで管理者に開く（client 変更なし）・4 つだけ roleRaw（/billing・規約・api/billing・「ご契約」・課金バナー）。(c) 上部バー＝roleJa に「管理者」（デモは users.name「デモ 管理者」＝payload の users 行は Agoora の create-demo-orgs）。(d) GV-D＝docs/demo/gvd_20261023.md §5 に 5 role（管理者の目視はフラグ true の便）。(e) デモ ACE の管理者 1 人＝gen-demo で RULES_0175_APPLIED のときだけ memberships に admin（payload byte 不変・users／auth ユーザー・seed.ts DEMO_ROLES／env DEMO_USERS の ace:admin はフラグ true の便で Agoora）。
- **suite**＝verify-nox-p175prep 88→**94**（(12) 序列・候補・文言・配線・v2 ★28 の 10 点・読取の記録 210／314／70／226）。眠らせた箇所＝**30 ファイル 85 箇所**（+auth.ts／layout／staff page＋board／billing page／terms page／_owner.ts）。payload 6 店 byte 同一・golden 不変・pin 張替え 0。
- **f0**＝2 連緑（131 段・run1 17:21→17:28・run2 17:32→17:39・180 秒冷却・赤 0。手前の run1 で demo-guard dg(6-5) が赤＝layout の「ご契約」導線の pin（role === "owner" && !isDemo→isOwnerRaw && !isDemo・フラグ false は同値）を張替え→単独走 27 緑→run1 やり直し。DB を使わない関連 suite gvb／layout-bottom／staff-photo／x13 も単独走 緑）。**build**＝next build OK（NEXT_DIST_DIR=.next-build・tsc --noEmit 0）。
- **live（本番・6 店 reset 後・ACE オーナー 1,280px）**＝deploy 検知＝/staff のチャンクに data-role-change（116 秒・17:42）・6 店 reset 17:42 全 200。①SSR 指紋＝/casts・/master/cast-comp/systems・/payroll 2026-10・/register・/master/deductions が追補 2 後と同一（/report は reset 由来の差）。②ACE オーナー＝上部バー「デモ オーナー｜オーナー」・/staff と /dashboard に「管理者」の文字なし・役割変更の新部品（data-role-change）は出ない・/audit 200「監査」・ACE 店長＝「デモ 店長｜店長」・/audit は 307→/dashboard（従来どおり）。管理者ログインの目視（店設定の保存・「オーナーの変更」が出ない）＝デモに管理者ユーザーが無い＝フラグ true の便（Agoora の create-demo-orgs --apply 後）
- **【事後承認待ち】**: ①auth_role() の写し方式（admin→'owner'＝RLS 70・RPC 210 を書き換えない・本来の役割は auth_role_raw）②監査は管理者も読める（4 つに無い）③owner_transfer＝自分は admin に・相手は有効な admin／manager だけ・確認フローなし（1 回で移る）④set_membership_role＝自分の役割は変えない・owner／cast は対象外・staff_change_role は不変で残す⑤店舗の解約／削除＝該当 RPC なし＝Stripe ポータル（③）に含める⑥キオスクと PIN の候補 6 本に admin（管理者も PIN／QR で解除）⑦デモの管理者ログイン（DEMO_ROLES／DEMO_USERS／auth ユーザー）はフラグ true の便で Agoora＝本便は payload 不変⑧管理者のピル＝濃い地（オーナーの隣）⑨役割変更＝候補ボタン方式（従来の 1 ボタン切替はフラグ false に残す）⑩/mine の roleJa は不変（キャストのみ）⑪staff_create の p_role は staff／manager のまま（管理者は既存の staff／manager を任命）。
- **C2-17（承認待ちシフトの折り畳み）・C2-18（期間を作るの整理＝裁定406 の役割分担）・C2-19（シフト月カレンダーの表現統一＝B2-1 を上書き・地色＝充足／バッジ＝進行／「手修正」撤去・11 月の実画面スクショ受領）・C2-20（レジ「予約」タブ＝1,024px 以上 2 列・右 sticky フォームが編集に切替・営業時間の判定は開始時刻ちょうど OK で深夜またぎ・担当バッジは当日の予定・未来店 0 は薄く）・C2-21（報酬明細プレビュー／PDF の見出しロゴが二重＝横ロゴ 1 つ・_light・24px・左寄せ・A-2 の 6 か所を再点検）受領**＝便 SH-UI-c2 に追加（C2-1〜C2-21）。
- **次**＝便 SH-UI-c2（C2-1〜C2-21・前提 HEAD＝追補 3 の HEAD・C2-15 は読取から）→ Agoora 手貼り P175（v2 最終 sha16 bf104469163e71ed）→P176→P177→フラグ true の便。
**追補 2 完了（2026-10-23・裁定421 候補 スタッフの割引・手数料カット／裁定420 キャストのレジ使用の DB 側／裁定418 ⑦⑫ 差し替え／R-6 裁定422 候補 簡易インボイス／R-7 裁定423 候補 キオスク PIN・QR）＝台帳の現在地**: 前提＝HEAD b526c5c＝origin（追補 docs）。DB 恒久変更 0（0175 v2 は起草のみ）・DB 読取は SELECT のみ（approval_*・auth_cast_can_register／set_store_cast_register・receipt 系・kiosk 系の定義と列＝docs/tmp/0175_live_p11／r6／r7.json）。client は RULES_0175_APPLIED=false で眠らせた。**コミット**＝49d9d13。**R-8（裁定425 候補・管理者）は owner 判定の全数置換＝追補 3 として直後に（①読取から）。**
- **C2-11 ①読取（3 行・先出し）**: ①店設定「キャストのレジ使用可」＝settings_json.cast_register_enabled（boolean）を **専用 RPC set_store_cast_register（owner）** が書く＝set_store_profile の白名単には無いが保存は効いている。「操作端末」＝cast_register_device（0173 の白名単に有り）。本人の許可＝memberships.can_register（set_cast_register）。②/mine のナビとルートガード＝app/mine/layout.tsx が castRegisterEntryOf（auth_cast_can_register ∧（own_phone ∨ 店端末 0））を読んでいる。③**切れていたのは ACE の payload**＝cast_register_enabled も cast_register_device も書いておらず（null＝OFF／店端末のみ）→ c2 で payload を ON（会計まで・own_phone）にしナビとルート（/mine/register・自分の卓だけ）を作る。
- **R-6 ①読取（3 行）**: ①receipt_issues＝serial（番号）・amount・recipient（宛名）・proviso（但し書き）・store_name_snap・biz_date・issued_at・token・expires_on・voided／void_note（v2 ★2 で reissue_of／by_membership）＝**税内訳・発行者 snapshot・支払方法・hash は無かった**。②公開 URL の 90 日＝行の expires_on（署名付き URL ではない・nox_receipt_public が期限切れを空で返す）。③店設定＝stores.invoice_status／invoice_reg_no（T＋13 桁の形式チェック＝set_store_tax_config）・settings_json.receipt_address／tel／footer（set_store_receipt_profile）＝**法人名／屋号／既定の但し書きは無かった**。
- **R-7 ①読取（3 行）**: ①キオスクログイン＝kiosk_devices（端末ごとの Supabase auth ユーザー・purpose 'punch'／'register'・memberships 非連動＝auth_org_id() null で他ルートの RPC が全遮断・/kiosk と /kiosk-register だけ）。②打刻の本人特定＝名前の一覧から選んで PIN 4 桁（cast_pin／staff_pin＝bcrypt・失敗回数とロック＝店設定 pin_lock_max_fail 5／pin_lock_minutes 15）・レジ端末＝操作担当を選んで PIN（kiosk_login→kiosk_sessions・15 分無操作で失効）。③memberships に PIN 列は無い（staff_pin／cast_pin の別表）・398 の打刻設定（punch_*）は本人のスマホ打刻（punch_self）の縛り＝キオスク打刻は端末行で担保。
- **0175 v2 最終（追補 2 後）**＝Downloads/0175_rules_bundle_v2_draft.sql（docs/tmp と同一）・**4,344 行・354,717 B・sha16 f474fb3d706ca96a**・LF・mig-check OK（plpgsql 49・sql 2・errors 0）。前版 4097c8676d7a7ec8／5d51a003443db8aa は撤去。生成器 patch＝gen_0175_p11／r6／r7／r7b_patch.cjs。
  - **★24（裁定421 候補）**: 白名単 +sys_staff_discount（0 承認制／1 上限内は即時／2 不可）・staff_discount_cap・approvals +staff_direct。approval_direct＝staff は 1 のときだけ（上限超え 'over cap'・理由必須）・approval_request＝**キャスト撤去**・2 は forbidden。check_pay の p_fee_amount＝cast 不可・staff は 1 かつ（店の率の手数料 − 指定額）≤ 上限。
  - **★25（裁定420）**: 白名単 +sys_cast_register（0／1／2・書くと cast_register_enabled も同期）・既存の店は旧 boolean から導出・set_store_cast_register は両方を書く・auth_cast_can_register は >0・新設 auth_cast_register_level（内部）・check_pay は cast 2 のときだけ・receipt_issue に cast（2）。
  - **★26（裁定422 候補・R-6）**: receipt_issues +tax_breakdown（[{rate, amount_incl, tax, display}]＝受領額を税区分の構成比で按分→税率ごとに 1 回丸め・割引は負）／issuer_snapshot（法人名・屋号・店名・住所・電話・登録番号＝registered のときだけ）／payment_method（cash／card／other／mixed）／issued_hash（sha256＝番号・金額・宛名・但し書き・取引日・発行時刻・内訳・発行者・支払方法）・stores +legal_name／trade_name／receipt_default_desc・但し書きの既定＝店設定→「ご飲食代として」・nox_receipt_public は **drop→create**（RETURNS TABLE 11 列・anon＋authenticated の ACL を明示＝白名単 1 号のまま）・set_store_invoice_profile（新設・owner）・削除 RPC は作らない（保存 7 年＝取消は打消し行）。
  - **★27（裁定423 候補・R-7）**: 白名単 +kiosk_features（{punch, register, shift}）／kiosk_idle_sec（60〜900・既定 900＝従来 15 分・デモ ACE 180）・kiosk_sessions +end_reason／token_hash／unlock_method・kiosk_unlock（PIN だけで本人特定＝一致 2 人以上は ambiguous で候補→kiosk_login）・kiosk_lock（done／idle／manual）・auth_kiosk_operator が店設定の秒数を読む。**QR**＝memberships +qr_secret／qr_fail_count／qr_locked_until・my_qr_secret（本人・20 byte hex）・kiosk_unlock_qr（'noxk:'+membership+'.'+TOTP 6 桁・±1 窓・失敗 5 回で 10 分・同じトークンは 1 回＝token_hash・unlock_method 'qr'・audit）・totp_code_of（内部・RFC 6238 SHA1）。PIN の桁は 4 のまま（4〜6 桁は set_*_pin／kiosk_punch／staff_punch の同時改修＝P175 後）。
  - handpaste_0175.md（sha・行数・★24〜★27）・verify_0175_0176.sql 再生成（pin 74＝0175 50／0176 24・新設 RPC 18・追補の列・内部関数の ACL）・suite verify-nox-0175-0176（列 4 群）。
- **裁定418 ⑦⑫ 差し替え（10/23）**: ⑦＝直前 N 期（既定 2）の移動窓＝N 期すべて同じ帯のときだけ今期に適用＝canon.ts の連続カウント streak ≥ N と同値（窓は 1 期ずつずれる＝連続すれば毎期）・不成立は前期の決定時給のまま。⑫＝UP は +額を決定時給に加算（累積＝cast_rate_history slide_up）・査定は決定時給を変えず総報酬に支給率・バック倍率はバックに＝**減率（wage_cut_pct）は使わない＝常に 0**（fixture から撤去・suite 3-5f／5g 張替え＝120％：総報酬 1,250,000×70%＝875,000）。⑪＝規定未達は UP だけ停止（Agoora 確定）。判定ログ（窓の N 期の率・帯・処理）は slide_decisions.detail＝P175 client。
- **client（フラグ false で眠る）**: lib/nox/rules-0175/staff-discount.ts・cast-register.ts・invoice-receipt.ts・kiosk.ts・kiosk-qr.ts＋部品 invoice-profile-fields／kiosk-unlock-pad／kiosk-qr-modal。店設定「キャスト会計」に 3 段階 ×2＋上限／レジ＝割引ボタンの出方（即時適用／申請／なし）・手数料 3 択はスタッフも 1 のときだけ・但し書きの既定／日報＝「割引（スタッフ即時）」「キャスト入金（締めで確認）」／公開面＝簡易インボイス（税率別・発行者・宛名・但し書き・カード 1 行・PDF 保存・印刷・紙の注記なし）／印刷＝印紙の注意（現金 5 万円以上）／台帳＝支払の列／店設定（プリンタ）＝発行者の 3 項目／キオスク＝ホームのタイル（出退勤・レジ・シフト）・PIN だけで解除・QR で解除（BarcodeDetector→jsQR・カメラ無しはタブなし）・終了＝kiosk_lock('manual')／mine＝「キオスク用 QR」（全画面・30 秒・リング）。デモ payload＝ACE 上限内は即時 ¥10,000・会計まで／LILY 承認制・注文のみ（P175 前は読まれないキー）。
- **suite**＝verify-nox-p175prep 61→**88**（(7) 421／(8) 420／(9) R-6＝外税／内税の内訳一致・登録番号 null は行なし・印紙・形式／(10) R-7＝タイル・秒数・バー・解除の分岐／(11) QR＝RFC 6238 検証値 287082／081804・30 秒で変わる・±1 窓・2 回目拒否・5 回ロック・カメラ無しはタブなし）。眠らせた箇所＝**23 ファイル／74 箇所**。golden 差 0。**f0**＝2 連緑（131 段・run1 16:24→16:33・run2 16:36→16:44・180 秒冷却・赤 0。直前の単独走で messages（kiosk-qr-modal の素の p→Message）と p175prep(7-6)（白名単の末尾が ★27 で伸びた）を張替え）。local build＝next build OK（Compiled successfully 21.6s）。
- **live（本番・6 店 reset 後・ACE オーナー 1,280px）**＝deploy 検知＝/kiosk のチャンクに data-kiosk-tiles（16:48）・6 店 reset 16:48 全 200。①SSR 指紋＝/casts・/master/cast-comp/systems・/payroll 2026-10・/register・/master/deductions が P175-prep 前と同一（/report は reset 由来の差）。②ACE オーナー 1,280px＝レジ A3 会計タブ「割引・無料（適用・承認）」のまま（data-staff-discount-level なし）・延長「延長（¥3,500 / 30分）」・領収書台帳の列＝番号／金額／宛名／取引日／発行者／状態／操作（支払の列なし）・公開面 /r/d40f60c0…＝従来の 4 行＋紙の注記（税率別 0・発行者ブロックなし・PDF 保存なし）・店設定「キャスト会計」＝店のキャスト会計／キャスト別の許可だけ（3 段階なし）・/master/system に発行者の節なし・日報に「割引（スタッフ即時）」「キャスト入金」なし。キオスク端末の PIN／QR は端末アカウントが要る＝Agoora 実機（フラグ true の便）
- **【事後承認待ち】**: ①421 の上限＝新キー staff_discount_cap②手数料カットの上限＝（店の率の手数料 − 指定額）≤ 上限③approval_request からキャスト撤去④確定後＝'not open' で止まる（従来）＝client は closed なら申請⑤日報の内訳＝approvals.staff_direct／payments.by_membership の role⑥sys_cast_register と cast_register_enabled の同期⑦C2-11 ③ は c2⑧「注文のみ」の入金＝'forbidden'⑨R-6 宛名・但し書き＝既存の recipient／proviso をそのまま使う（addressee／description の別列は作らない）⑩R-6 税内訳の按分＝受領額を税区分の構成比で（分割発行は比例・端数は 10% に寄せる）⑪R-6 法人名・屋号・既定の但し書き＝stores の列（新 RPC set_store_invoice_profile・登録番号は税設定のまま）⑫R-6 画面の明るさは変えられない（白地で代替）⑬R-7 PIN の桁は 4 のまま⑭R-7 一致 0 の PIN は失敗回数を数えない（人を特定できないため）⑮R-7 QR の replay 窓＝5 分⑯R-7 「シフト」タイルの先（/kiosk-shift）は c2 以後⑰R-7 無操作の自動ロックの既定＝900（従来）・ACE デモだけ 180⑱R-8 は追補 3。
- **ローンチ後（裁定426 候補・2026-10-23 受領・本便では実装しない）**: 店からの問い合わせ窓口と不具合・要望のポイント還元＝①問い合わせ画面（BANZEN の /inquiry と同型・質問／不具合／要望・スレッド返信・添付・店長以上）②運営コンソール（全店の一覧・返信・状態 受付／確認中／対応済み／見送り・「妥当」で付与 pt＝不具合 1〜3／要望 1〜5）③ポイント台帳 store_points（付与／消費・理由・問い合わせ ID）④10pt＝1 か月分の利用料をサービス（Stripe customer balance にマイナス・繰越・Stripe なしはアマギフ手動＋台帳）⑤店側の表示「ポイント 7pt／10pt・次回 1 か月無料まであと 3pt」⑥BANZEN と共通の表（製品 ID で区別）・Yuiba の代理店にも付与できる器。
- **次**＝追補 3（R-8 裁定425 候補 管理者＝①読取→v2 ★28→client）→ 便 SH-UI-c2（C2-1〜C2-16）→ Agoora 手貼り P175（v2 最終）→P176→P177。
**連続便 3 追補 完了（2026-10-23・P-8 カード手数料の入金ごとの上書き／P-9 キープボトルのタグ名と一覧／P-10 レジの延長パターン選択）＝台帳の現在地**: 前提＝HEAD 1bd772a＝origin（GV-D docs）。DB 恒久変更 0（0175 v2 は起草のみ・本番適用なし）・DB 読取は SELECT のみ（bottle_keep_register／update・check_set_ext_rule／check_extension_add／check_open・daily_report_aggregate の pg_get_functiondef と payments／bottle_keeps／checks／pricing_rules の列＝docs/tmp/0175_live_p89.json／0175_live_p10.json）。client は RULES_0175_APPLIED=false で眠らせた（P175-prep と同じ flag.ts）。**コミット**＝f25a50b。
- **P-10 読取（先に 3 行）**: ①伝票の「選んだ延長パターン」＝checks.ext_menu_snap（開卓時に凍結したメニュー＝rule_id／duration_min／amount／label／unit／is_default）と ext_min／ext_fee／ext_unit（選択中の値）で持ち、**選択中の rule_id を持つ列（ext_rule_id）は無い**（0173 の check_set_ext_rule(p_check_id, p_rule_id) が値を書き替え・レジは値の一致で cur を探す）。②マスタの「4/3」＝分子は有効な延長ルール（fee_kind 'extension' かつ is_active）の実数・分母は裁定385 の上限 3 のハードコード＝ACE のデモ payload は EXT_PATTERNS で延長 4 本（平日通常 7,000／平日通常 60 分 13,000／VIP 9,000／週末通常 4,000）を入れているため **上限超過（4/3）が正しい表示**。③デモ A3 の延長 ¥3,500＝**凍結値**（読み違いではない）＝gen-demo が checks.ext_fee に源泉の店既定（mainRule.extension_price_yen＝3,500）を書き、延長行「延長30分=3500」もその凍結値（28 行・週末 4,000 が 2 行）。延長パターン 7,000 と不一致なのは payload の生成（ext_menu_snap null＝旧伝票形）。
- **0175 v2 最終（追補後）**＝Downloads/0175_rules_bundle_v2_draft.sql（docs/tmp と同一）・**3,800 行・310,100 B・sha256 5d51a003443db8aa00de25d969073b281d5b3ef11df90946be380592f504cf3b（sha16 5d51a003443db8aa）**・LF・mig-check OK（plpgsql 38・errors 0）。前版 9b5a47b46d44dbcb（3,177 行）は撤去。生成器 docs/tmp/gen_0175.mjs に ★21〜★23（patch＝docs/tmp/gen_0175_p8910_patch.cjs）。
  - **★21（P-8）**: check_pay +p_fee_amount（**11 引数**・null＝店の率で自動／0＝なし／正＝この入金だけその額・上限＝残額・p_fee_on は互換）・payments +fee_amount／fee_source（auto／none／manual）・manual は手数料行「カード手数料（指定）」（fee_rate null）・audit に pay_fee_amount／pay_fee_source・manual と「なし」は pay_fee_override の行。日報の手数料・check_group_due は手数料行を読む（Σ行＝Σfee_amount）。
  - **★22（P-9）**: bottle_keeps +tag_label（≤60・既定「{顧客名} {ボトル名}」＝RPC が自動生成・既存行は埋める）・bottle_keep_register **11 引数**（+p_tag_label）・bottle_keep_update **8 引数**（+p_tag_label・null＝据え置き＝旧 client 互換）。棚＝既存 shelf_no・opened_at／last_used_at は既存。
  - **★23（P-10）**: checks +ext_rule_id（null＝旧伝票／既定）・check_open が既定の rule_id を書く・check_set_ext_rule が ext_rule_id を書き確定済みの延長行を「延長料金（週末通常 30分）」に・check_extension_add は選択中の label を併記（旧伝票は「延長料金(30分)」）。
  - handpaste_0175.md（sha・行数・★21〜★23・overload 罠 3 本）・verify_0175_0176.sql 再生成（pin 61＝0175 38／0176 24・引数 check_pay=11・追補の列 4・bottle_keep_register=11／update=8）・suite verify-nox-0175-0176（DB 段・check_pay 11・列 4）。
- **client（フラグ false で眠る）**: P-8＝lib/nox/rules-0175/pay-fee.ts（PayFeeMode・feeAmountArgOf・payFeeNoteWithModeOf・payFeeRowTextOf・payFeeModesFor＝スタッフは店の率だけ）・レジの入金モーダル＝残額の下に「手数料 ¥7,862（10%）」＋3 択（店の率／なし／額を指定＝数字入力・上限 残額）・選ぶとお客様からもらう額と「入金する（¥…）」が即時に変わる・check_pay の p_fee_amount は rules0175On() のときだけ送る（false＝従来の 8 引数）。P-9＝lib/nox/rules-0175/keeps.ts（tagLabelDefaultOf・keepTagOf・keepSearchOf・keepSortOf・keepCallTextOf）・components/nox/keep-list.tsx（顧客管理「キープボトル」タブ＝タグ名｜顧客｜担当｜ボトル｜残量｜棚｜最終利用日｜状態・検索・棚→最終利用日・行→顧客詳細・KPI「ボトルキープ中」からも・390 はカード型 .cardrows）・キープ登録（レジ）にタグ名（既定値入り・編集可）と棚・顧客詳細のキープ表にタグ名列＋行内編集（残量・棚・状態も）・レジの顧客カードのキープ呼び出しは「H様 山崎 10/23」。P-10＝lib/nox/rules-0175/ext-pattern.ts（extCurrentOf＝ext_rule_id 優先・extButtonTextOf・extMenuShowOf・extLineNameOf・extCountTextOf）・レジ＝延長ボタンにパターン名を併記（凍結メニュー 2 件以上のときだけ・▾ は従来の分割型をそのまま）・自動延長の店の「延長パターン ▾」の cur も ext_rule_id で。**P-10 ④（ゲートなし）**＝マスタ「延長パターン 4/3」→「4 件（上限 3・超過）」＋警告「3 件まで…4 件目以降は追加できません」＋4 件目の保存は送らない（RPC 'too many extension' の先回り）。
- **suite**＝verify-nox-p175prep 44→**61**（(4) P-8 店の率／なし／指定 ¥5,000＝手数料 7,862／0／5,000・p_fee_amount null／0／5,000（上限）・文言・役割・配線・v2 逐語／(5) P-9 既定「山田 山崎」・検索 山崎 2 件・並び A-1 10/22→A-1 10/1→B-2→棚なし・呼び出し「H様 山崎 10/20」・配線・v2 逐語／(6) P-10 選択中＝ext_rule_id 優先・切替で 7,000→4,000・1 パターンは ▾ なし・「4 件（上限 3・超過）」・配線・v2 逐語）。眠らせた箇所＝**15 ファイル／44 箇所**（P175-prep の 10 ファイル＋register-board 7・bottle-keep-panel 3・customers-board 7・customer-detail 9・check-customers-card 3）。golden 差 0（pay 130／payroll-csv 27／punch-match 93・demo-profiles 77）・payload 不変。関連 26 suite 単独走 緑。**f0**＝2 連緑（131 段・run1 15:19→15:27・run2 15:30→15:38・180 秒冷却・赤 0。手前の 3 回は pin の張替え漏れ＝messages（keep-list の素の p→Message）・customers-keep ck(6-2)・x13g(28) を単独走で緑にしてから）。local build＝next build OK（Compiled successfully 23.0s）。
- **live（本番・6 店 reset 後・ACE オーナー 1,280px）**＝deploy 検知＝/master/pricing のチャンクに data-ext-over（15:42）・6 店 reset 15:43 全 200。①SSR 指紋＝/casts・/master/cast-comp/systems・/payroll 2026-10・/register・/master/deductions が P175-prep 前（ea69c9f）と同一（/report は reset 由来の差）。②ACE オーナー 1,280px＝料金設定 › 料金適用ルール「延長パターン 4 件（上限 3・超過）」＋赤の警告 1 行（ゲートなし＝4 本＝平日通常 60 分／平日通常 30分 既定／週末通常／VIP）・レジ A3 の延長ボタン「延長（¥3,500 / 30分）」＝パターン名なし・入金モーダル（カード）＝手数料 3 択なし（data-pay-fee-mode 0）・「うち 残額への充当 ¥14,520／カード手数料 ¥1,452」「入金する（¥15,972）」＝従来どおり・顧客管理＝上段タブなし（data-cust-view 0）・KPI「ボトルキープ中」は押せない・顧客詳細 S様＝キープ表にタグ名列なし
- **【事後承認待ち】**: ①P-8 の集計＝日報の手数料・check_group_due・daily_report_aggregate は従来どおり手数料行（check_lines fee_kind pay_fee）を読む＝Σ行＝Σpayments.fee_amount（fee_amount は実額の記録・読み替えは P175 後に必要なら）②P-8 manual の手数料行は fee_rate null・名前「カード手数料（指定）」③P-8 「なし」の上書き（p_fee_amount 0）は店の率 >0 のとき pay_fee_override の audit 行（p_fee_on=false と同じ扱い）④P-9 bottle_keep_update の p_tag_label は null＝据え置き（規約7 の「全値明示」の例外＝旧 client が消さないため）・空文字＝消す⑤P-9 既存行の埋め＝「顧客名 ボトル名（なければ商品名）」の 1 文⑥P-10 ②＝ext_rule_id は check_open（既定）と check_set_ext_rule が書く・check_extension_add(p_rule_id) は行を足すだけで ext_rule_id は変えない（1 押し 1 行の選択＝従来）⑦P-10 ③ 手動延長の店の「開卓時に既定を選ぶ小さな確認」は既存の分割ボタン ▾ で代替（小確認はフラグ true の便で）・自動延長の延長行の名前は check_time_charge_apply 側＝未改稿（フラグ true の便で）⑧P-10 ④ デモ ACE の延長 4 本は payload のまま（上限超過の表示で見せる）⑨A3 ¥3,500 の不一致（店既定 3,500 と延長パターン 7,000）は payload の課題＝直すなら gen-demo の checks.ext_fee を既定パターンに（次便）。
- **次**＝便 SH-UI-c2（C2-1〜C2-8・前提 HEAD＝この追補の HEAD）→ Agoora 手貼り P175（v2 最終 sha16 5d51a003443db8aa）→P176→P177 → フラグ true の便。
**便 GV-D 読取 完了（2026-10-23・連続便 3 の 2・直さない・docs のみ）＝台帳の現在地**: 前提＝HEAD 8fb8115＝origin（P175-prep docs）。コード変更 0・DB 変更 0。本番（6 店 reset 後）を ACE のオーナー／店長／スタッフ／キャスト（ひなの）＋公開ページで 1,280／390 の全画面＝判定スクリプト（横スクロール・はみ出し・切れ・junk・準備中・主ボタン E-23 追補1）＋スクショ 17 枚（docs/demo/gvd/）。**成果物**＝docs/demo/gvd_20261023.md。
- **指摘 14 件**＝崩れ 4（給与 390 の期ヘッダーがカードで切れる／日報 390 の KPI 小ピル 4 列の見出しが切れる／シフト今日の「退勤」27px／在庫 棚卸しの縦積み＝C2-8 と重複）・文言 2（スタッフの権限ピルが主ボタン色＝押せる見た目／商品「無効も表示」＝C2-8 ④ と重複）・導線 8（390 のフィルタ seg 31px・btnSm 主ボタン 31px＝41 本・上部バー 31px・シフト希望の月送り 29px／取り下げ 25px・/lp「この店で試す」35px・初期設定の STEP チップ・レジ専用レイアウト・分析「設定」19px）・機能 0。相談役案＝直す 9／残す 3／C2-8 重複 2。
- **主ボタン不合格 0**（記録分 133 本＋先行走査約 170 本＝elementFromPoint は全部 button・コントラスト 4.0〜14.1）。横スクロール 0 画面・junk 0・「準備中」新規 0（出た 8 画面分は W-10 の #1・#2・#9／#10・#15・#19・#20・#21・#23）。
- **要判断**＝①390 のタップ目安 40px を E-23 追補2 として規約にするか②給与の期ヘッダー／日報の小ピルの直しは C2-7（シート化）の便に同梱か③スクショは pane の JPEG→PNG（原寸が要れば Agoora 実機）。
- **次**＝連続便 3 追補（P-8 カード手数料の入金ごとの上書き・P-9 キープボトルのタグ名と一覧＝0175 v2 の器＋RULES_0175_APPLIED=false の client）→ 便 SH-UI-c2（C2-1〜C2-8・前提 HEAD＝追補の HEAD）→ Agoora 手貼り P175→P176→P177。
**便 P175-prep 完了（2026-10-23・連続便 3 の 1）＝台帳の現在地**: 前提＝HEAD ea69c9f＝origin（SH-UI-b2 docs）。DB 恒久変更 0・SELECT のみ（デモ payload は 6 店とも byte 同一＝gen-demo 再生成で sha 不変）。0175／0176／0177 は未適用（手貼りは Agoora）。**P175 前に作れる client を RULES_0175_APPLIED=false で眠らせて先行実装**＝フラグ false のとき live の挙動・DOM・golden は不変（suite で担保）。**コミット**＝6426fd1（feat: P175-prep（RULES_0175_APPLIED=false））。
- **フラグ**＝lib/nox/rules-0175/flag.ts（RULES_0175_APPLIED／OKURI_4WAY_APPLIED・読み口 rules0175On()／okuri4wayOn()・テスト用の上書き）＋鏡 scripts/demo/rules-0175-flag.mjs（gen-demo 用・suite が同値を pin）。**眠らせた箇所＝10 ファイル／18 箇所**（collect 3・systems-board 2・plan-editor 1・casts-board 1・/mine 1・wish-form 1・report-board 1・payroll-board 4・daily-pay-form 3・deduction-panel 1）＋mount されない新部品 2（availability-editor・store-rules-0175-panel）＋フラグ true 専用の collect 補助 1（lib/nox/payroll/rules-0175-collect.ts）。
- **P-1 時給の履歴**（裁定416・cast_rate_history）: lib/nox/rules-0175/rate-history.ts（baseRateOnDayOf＝base／manual の最新＋slide_up の累積・guaranteeOnDayOf・dayRatesOf・rateHistoryInputOf）→ assemble.rateInputOf（履歴があれば日別の床を guaranteeByDay に＝wageDetail の max 経路を流用・基本と同額の日は床を作らない・履歴なし＝guaranteeInputOf と deep-equal）。collect は if (rules0175On()) の中で loadRateHistory。
- **P-2 取消済み**（裁定413 I-3・cancelled_at）: lib/nox/rules-0175/cancelled.ts（activeRowsOf／isCancelledOf／cancelledLabelOf「取消済み（種別）」）。collect＝payroll_adjustments／daily_pays の .is("cancelled_at", null) をフラグで三項・日報の現金支払（report-board）も同じ・給与右パネルの調整控除は取消済みを消さず印＋削除ボタンを出さない・日払いカード（daily-pay-form）に「取消」（daily_pay_cancel・理由必須）と印・合計は取消済みを除く。領収書再発行の自動取消は 0175 の RPC 側（client 変更なし）。不整合件数の除外＝取消済みの日払い・調整は集計に乗らない（collect 側で完結）。
- **P-3 店設定**: systems-board＝WAGE_CUT_RULE_APPLIED を rules0175On() に（0175 後に保存が効く）・StoreRules0175Panel（ドリンクバック ON／OFF＝OFF の店は設定項目と「誰のドリンクか」を隠す（★フラグ true の便で商品・レジに配線）・売上小計の範囲 due／pre_tax_service・支払サイクル＝週の締め曜日と支払までの日数・新規店の税既定＝外税の注記）。plan-editor＝報酬の軸（店の軸に従う／売上／pt／報酬率）のラジオ＝comp_plan_ext_set（保存済みプランだけ・裁定412 追補）。lib/nox/rules-0175/settings.ts（キー 11・planRewardAxisOf＝null は店の軸を引き継ぐ）。
- **P-4 基本の働き方**（裁定397＋413）: lib/nox/rules-0175/availability.ts＋components/nox/availability-editor.tsx（曜日 可／不可／相談＋時間帯・週の目安・適用開始日・メモ・availability_set・雇用の時間帯は店のみ＝本人は表示＋メモ・通知は audit のみ）。キャスト詳細「基本」タブの所属店の下／mine の勤怠の下（フラグ true のときだけ）。希望提出（wish-form）＝日別の上書きが無い日は その曜日の基本の時間帯を既定・固定休と矛盾する希望に注意の印（提出は止めない）。
- **P-5 CANON 型**（裁定418 ①〜⑰）: lib/nox/rules-0175/canon.ts（サ料の席種別・支払方法の割引・時給帯・バック単位 6・席種別の商品バック・報酬率＝時給分÷売上小計・報酬率表の段・方向 up／hold／assess・連続 N 期・W 別規定（週の目安→必要日数／時間・期の日数で按分）・支給可否・免除・提案→店の適用／除外・金額への適用＝バック倍率／支給率（総報酬に掛ける）／減率／ボーナス・⑳ 日払い上限／イベント加算／予約バック）。pay.ts＝PayInput.rules0175（任意）があるときだけ gross の後で canonOutcomeOf→canonApplyOf・結果 canon を付ける（無ければ 1 バイト同値）。collect＝reward_axis='pay_rate' のプランだけ CanonCtx を組む。**⑩ 売上小計は本便は会計額（按分 sales）＝pre_tax_service の按分集計（check_lines 直読）はフラグ true の便で**。
- **P-6 MUSE→CANON 型の payload**: docs/demo/fixtures/canon_stores.json（CANON＝セット 6,000／VIP 8,000・税サ 30／VIP 35・現金 10% OFF・同伴 30／20／15・本指名 10%・場内 500・ドリンクバック OFF・報酬率表 10 段・W 別規定 3 段・N＝2・免除 3 か月＋5 店 CLUB G／CLASS／BELLEZZA／Premier／NECT＝suite 専用・未確定は注記）。profiles.canonOf（フラグ true かつ muse だけ非 null）→gen-demo の stores.settings_json（sys_drink_count_back／sales_subtotal_mode／pay_discount_rates／service_rate_by_seat）と comp_plans（reward_axis pay_rate／pay_rate_tiers／slide_streak_n／assess_grace_months／hon_back rate 10%）を ...(CANON ? … : {}) で畳む＝false は byte 同一。
- **P-7 0177 後の残作業**（OKURI_4WAY_APPLIED=false のまま）: deduction-panel の定数を flag.ts に一本化・profiles.okuriModeOf（true で LILY 'store'／NOIR 'none'）・給与右パネル「送り」見出しを方式で（実費／定額／店負担）。残り＝demo-profiles pin dpf(1-4)／(2-1) の張替え・店負担／定額の live 判定・一括フォーム見出し・okuri_mode を payload に書く＝P177 後の便。
- **suite**＝verify-nox-p175prep 44（f0 に追加＝131 段）: フラグの同値・眠らせた箇所の grep・false で canon なし／rateInputOf 同値／payload 不変・true で P-1〜P-7 の fixture（CANON 40％ UP・75％ 査定・120％ 査定＝減率 10％→支給率 70％＝791,000・連続 2 期の発動／不発動・規定未達は UP だけ停止・免除は査定停止・未決は効かない・W 別規定 31 日按分 13 日／62h）。**golden**＝差 0（pay 130／payroll-csv 27／punch-match 93・T1a 5170／T1b 5931・源泉 117241／125802・demo-profiles 77）。**f0**＝2 連緑（131 段＝verify-nox-p175prep を追加・run1 7.5 分／run2 7.4 分・run2 は 180 秒冷却・赤 0。初回 2 回は pin の張替え漏れ＝pv(7-3)（取消済みは削除ボタンなし）／s4(8)・sh(2)（フラグ定数の一本化）を単独走で緑にしてから再走）。local build＝next build OK（Compiled successfully 26.1s・NEXT_DIST_DIR 分離・tsconfig 復元）。
- **live（本番・6 店 reset 後・ACE オーナー 1,280px）**＝deploy 検知＝/casts のチャンクに data-availability-row（14:05）・6 店 reset 14:06 全 200。①SSR テキスト指紋（ACE オーナー・fetch）＝/casts・/master/cast-comp/systems・/payroll 2026-10・/register・/master/deductions が before（ea69c9f）と同一（len／hash 一致）。/report だけ hash 差＝len 同一・連続 2 回の fetch では安定＝reset で当日の日報データが入れ替わったため（コード差ではない）。②ブラウザ 1,280px＝店設定「使う制度」に 0175 の新項目なし（data-rules-0175-panel 0・ドリンクバック文言なし・就業規則チェックは従来どおり「0175 の適用後」の注記・OFF）・キャスト詳細「基本」タブ（ひなの）に働き方の行なし（data-availability-row 0）・給与 10 月＝見出し「送り」のまま・取消済みの印なし・7 人の差引 260,010／204,984／283,065／334,139／182,012／174,119／117,708・レジ描画 OK（エラー 0）・/mine ひなの＝h3 12 節に「基本の働き方」なし・/mine/wishes＝固定休の注意なし。フラグ true 専用の fetch（availability／cast_rate_history 等）は Network に出ない（SSR 指紋同一で担保）
- **【事後承認待ち】**: ①P-1 の床の乗せ方（履歴の基本＋累積加算を guaranteeByDay の max 経路に乗せる＝wageDetail 不改変・「保証」行の表示名は P175 client で「段」に分ける）②P-5 ⑩ 売上小計＝本便は会計額（pre_tax_service はフラグ true の便）③P-5 UP の up_amount は金額に効かせず時給の履歴（cast_rate_history slide_up）に積む設計＝canonApplyOf は倍率／支給率／減率／ボーナスだけ④P-3 支払サイクルの UI は週払いの 2 キーだけ（settlement_cycle の切替は既存の精算 UI）⑤P-4 希望の既定値は提出時に当てる（セルの表示は一括既定のまま）⑥P-6 fixture 5 店の仮置き値（未確定の注記）⑦日払い取消の理由は window.prompt（モーダル化は GV-D 以後）⑧eslint は eslint.config 不在で未実行（tsc・suite・build で担保）。
- **P175 後に true にする手順（1 行）**＝lib/nox/rules-0175/flag.ts と scripts/demo/rules-0175-flag.mjs の RULES_0175_APPLIED を true→verify-nox-0175-0176 を f0 に追加→gen-demo 再生成（MUSE CANON）→demo-profiles pin 張替え→f0 2 連→live。
- **次**＝便 GV-D 読取（docs のみ）→ Agoora 手貼り P175（v2 最終）→P176→P177 → フラグ true の便。
**便 SH-UI-b2 完了（2026-10-23）＝台帳の現在地**: 前提＝HEAD 58136a4＝origin（PR-1 docs）。DB 恒久変更 0（0175 v2 は起草のみ）。PR-1 の【事後承認待ち】は Agoora 承認（10/23）＝印を書き換え（裁定416／417 とも）。**コミット**＝a44f911（feat: SH-UI-b2（期間の地色・ロゴでホーム・提出一覧から処理・単日表記））。
- **B2-0 CN-R 残り**: CSV（docs/dp/店舗報酬制度_18店舗_20261023.csv・sha256 68c5633f…9272・18 店）を受領し canon_gap_20261023.md §3 を 18 店の表（届く項目／新規に足した器／公開範囲・不明点）に差し替え。**v2 に足した器 3**＝comp_plans.back_rate_tiers（SCANDAL＝売上小計帯→本指名／場内のバック率）・back_unit 'hourly_add'（BELLEZZA＝当日時給増額）・pay_rate_tiers の鍵 bonus_pct／down_amount（DAYTONA A／B）。**0175 v2 最終**＝Downloads/0175_rules_bundle_v2_draft.sql・**3,177 行・266,399 B・sha256 9b5a47b46d44dbcb…1b04（sha16 9b5a47b46d44dbcb）**・mig-check OK（294 文・plpgsql 33）・comp_plans の列 12・verify_0175_0176.sql（pin 56）／handpaste_0175／suite v175(1-11)=12 列 を更新。0176 は変更なし。
- **B2-0b**: 1 日だけの区間は単日表記「10/22」（wage-spans.ts wageSpanLabelOf＝明細・/mine・PDF・CSV とも同じ関数）。
- **B2-1**: lib/nox/shift/period-cell.ts（periodCellStageOf／periodCellClassOf／periodBoundaryOf／PERIOD_LEGEND）＝③④①の月カレンダーの日セルの地色を期間の状態で（募集中 青 primary-soft／配置中 黄 warning-soft／公開済み 緑／期間なし 灰＋「期間なし」の字）・境目は左右 1px（pb-l／pb-r）・凡例 4 つ（旧「凡例: セルの地色＝…」の文と期間番号の循環色 periodToneOf は撤去）・期間なしの日を押すと①の新規作成フォームへ開始日を入れて遷移（openNewPeriodAt）。
- **B2-2**: ロゴ＝サイドバー（SideNav homeHref・manage は "/"）・上部バー（"/"）・/mine（"/mine"）・/demo（"/demo"）・/lp（"/lp"）を Link（aria-label「ホームへ」・.nox-brandlink cursor pointer）。"/" は app/page.tsx が role で振り分け（cast→/mine・他→/dashboard）。
- **B2-3**: ②提出一覧の「提出済み」の行を押すと、そのキャスト・その期間の希望一覧（日付｜時間帯｜状態 未処理／確定／調整中／見送り｜操作）＝wishRowsOf（wish_id→shift・裁定345／380／406 の 4 状態）・操作＝確定（decide accept＝即確定）／調整（setAdjWish＝調整して確定／送り返す）／見送り（decide reject）／調整中は再調整（setAdjTarget）＝③と同じ関数・「未処理を一括確定（n 件）」＝approveAllWishes（定休日の希望は除く・confirm に件数）・③の承認リスト（pending）と同じデータ＝処理すると消える・締切前でも処理可。未提出の行＝「催促」は無効表示（0176 の cast_notifications 後）。390px＝行は 2 列・操作は全幅で縦並び中央。
- **suite**＝verify-nox-shb2 14（f0 130 段）・pin 張替え＝nav nv(4-3)（ロゴ Link "/"）・period-stage ps(4-1)（periodCellStageOf）。**f0**＝2 連緑（130 段＝verify-nox-shb2 を追加・run2 は 180 秒冷却・赤 0）。local build＝next build OK（Compiled successfully 19.5s・出力削除・tsconfig 復元）。
- **live（本番・6 店 reset 後・ACE オーナー 1,280／390）**＝①1,280px 11 月カレンダー＝11/1〜11/5（期間 10/30〜11/5）が募集中の青・11/6 以降 25 日が「期間なし」の灰＋字・境目 11/5 右／11/6 左・凡例 4 つ（募集中 青／配置中 黄／公開済み 緑／期間なし 灰）・旧文なし ②ロゴ＝サイドバーと上部バーの href "/"・/mine（ひなの）の href "/mine"・aria-label「ホームへ」・cursor pointer ③提出一覧でひなのを押すと希望 3 行（10/30 調整中／11/1 未処理／11/4 未処理）・11/4 を「確定」→✓希望どおり採用し確定・③の承認リスト 13→12・一括確定の件数＝未処理のうち定休日（11/1 日曜）を除く 1 ④るな 10 月の 2 行目「時給 ¥2,200/h × 6h（10/22・基本）」＝単日表記 ⑤390px＝凡例 4 つ見える・「期間なし」の字が出る・提出一覧の行は全幅（326）で開き操作は縦並び中央（centerOff 0）・横スクロール 0。E-23 追補1 で判定。
- **【事後承認待ち】**: ①v2 最終の器 3（back_rate_tiers・hourly_add・bonus_pct／down_amount）②期間なしの日の遷移は manager 以上だけ（キャスト閲覧は従来の日詳細）③凡例は draft（作成中）を出さない（カレンダーでは期間なしと同じ灰）④提出一覧の「調整」は③と同じモーダル（調整して確定／送り返す）＝新しい UI を作らない ⑤催促は無効表示（文言「0176 適用後に送れます」）⑥ロゴのホーム＝"/"（role で振り分け）＝オーナー／店長は /dashboard に着地。
- **次**＝連続便 3（P175-prep→GV-D 読取）→ Agoora 手貼り P175（v2 最終）→P176→P177。
**便 PR-1 完了（2026-10-23）＝台帳の現在地**: 前提＝HEAD b30bb44＝origin（CN-R・v2 docs）。DB 恒久変更 0・DB 読取は SELECT のみ（デモ payload の変更＝ACE るな）。**コミット**＝c0f3791（feat: PR-1（時給の日付解決・同伴の正本化・390px 税務出力））。
- **R-1 読取**＝裁定416 の読取欄。**R-2**＝wage-spans.ts（区間）・breakdown-lines timeLinesOf・WageDay.gua・右パネル／PayslipSlip に period と splitAtD（半月 16）。**R-3**＝profiles.mjs ace guaFromMonthStart／guaToRel −2・gen-demo の cast_plan 3 行（前月末／当月 1 日〜R−2／R−1〜）・payload ace.json 再生成。**R-4**＝裁定417 の適用欄（dohan-mark.ts・collect.loadPunch・今日タブ・/mine）。**R-5**＝.nox-taxcard（給与明細CSV／報酬明細／支払調書CSV）・.nox-taxhead（再読込 2 か所）・.nox-invtable（カード型・data-label 8・空の任意列は非表示・3 択は横 1 行）・.nox-tablewrap の器（1,024px 以上は表のまま・本体は横に動かない）・.nox-wraplink（控除・送りへ ›）。左寄せを直したボタン＝給与明細CSVを出力・報酬明細を読み込む・印刷／PDFで保存・支払調書CSVを出力・再読込（インボイス／納付管理）の 6 本。
- **suite**＝verify-nox-pr1 18（f0 に追加＝129 段）・pin 張替え＝today-row tr(9-3)（同伴トグル→伝票の印）・demo-profiles dpf(2-7)（るなの 3 行＝月相対）。**golden**＝差 0（pay 130／payroll 233／payroll-csv 27／punch-match 93 不変・T1a 5170／T1b 5931・源泉 117241／125802 不変＝1 区間の明細は従来の 1 行）。**f0**＝2 連緑（129 段＝verify-nox-pr1 を追加・run2 は 180 秒冷却・赤 0）。local build＝next build OK（Compiled successfully 23.6s・出力削除・tsconfig 復元）。
- **live（本番・6 店 reset 後・ACE オーナー・1,280／390）**＝①ACE オーナー 1,280px・10 月 るな＝右パネルの支給が 2 行「時給 ¥3,200/h × 88.9h（10/1〜10/21・保証）」「時給 ¥2,200/h × 6h（10/22〜10/22・基本）」（一覧の合計 h は 94.9h＝reset 前後で不変） ②キャスト詳細（体入タブ）るな「今期の時給 ¥2,200 基本」＝右パネルの最後の区間（10/22〜 基本）と一致（保証は 10/21 で終了） ③/mine＝デモの cast ログインは ひなの（るな は user_id null でログイン不可）＝ひなの の明細プレビュー 1 行「時給 ¥2,500/h × 126h」（保証なし＝1 行で正）・るな の 2 行は右パネル／PayslipSlip が同じ関数のため同値（suite pr1(5-4)） ④A2 で るな（★れいな は ACE に不在＝るな で代替）の同伴 ON→今日タブ るな の行に「同伴（A2）」（同伴ボタン無し・出勤前の 4 択に同伴なし）・OFF（confirm＝同伴料行の取消）→印が消える ⑤390px 給与→税務・出力＝主ボタン 5 本（給与明細CSVを出力／報酬明細を読み込む／再読込×2／支払調書CSVを出力）が中央（centerOff 0・幅 326・コントラスト 4〜5.1・押せる）・インボイス表＝カード型 7 人（名前と 3 択「—／登録／免税」が横 1 行で全部見える・空の任意列は非表示）・本体の横スクロール 0・リンク「控除・送り…へ ›」は折り返して切れない。E-23 追補1 で判定。
- **【事後承認待ち】→ 承認済み（2026-10-23・連続便 3 冒頭で全件）**: ①裁定416（営業日単位・保証は下限・区間行・半月は 16 日で切る・1 区間は従来の行＝golden 不変）②裁定417（伝票が正本・同伴で遅刻免除・今日タブのボタン撤去・旧値は 0175 v2 で削除）③R-3 のるな＝保証の終了を「R−2」（相対・今日 10/23 なら 10/21）にした＝指示の「10/24 まで」は固定日で payload は相対日のため・基本の行が出るには保証の終了が過去日である必要 ④裁定418 の⑥⑨⑩⑪⑫・412 追補⑱（Agoora 承認済み）・⑳（0175 v2 の器）⑤R-5 の 6 本以外の左寄せは無し（給与の他カードの主ボタンは既に右／中央）。
- **次**＝Agoora 手貼り P175（v2）→P176→P177。
**便 CN-R＋0175 起草 v2 完了（2026-10-23）＝台帳の現在地**: 前提＝HEAD 4f6b86e＝origin。読取＋起草のみ＝コード変更 0・本番適用なし・DB 読取は SELECT のみ（attendance_set／daily_pay_issue の live 定義を 0175_live.json に追加読取）。連続便 1 の【事後承認待ち】①〜④は **Agoora 承認（10/23）**＝各エントリの印を書き換え。**裁定418**（CANON 型は全部ローンチ前・器は 0175・デモは MUSE 差し替え）・**裁定412 追補**（報酬の軸をプラン単位＝comp_plans.reward_axis・Agoora 承認 10/23）。
- **CN-R**: docs/dp/canon_gap_20261023.md（①〜⑳＝今の器｜可／設定追加／新規｜0175 v2 に足す器｜MUSE payload の値・⑭〜⑳の横断分・14 店の表）。**入力の CSV（Downloads/店舗報酬制度_18店舗_20261023.csv）はこの PC に無い＝18 店の表は本文に出た 14 店で書き、残り 4 店と「公開範囲・不明点」欄は CSV 受領後に 1 便で埋める。**追補（10/23）＝⑳の 4 件（週払い・日払いの上限・イベント加算・予約バック）はローンチ前＝0175 v2 の器に含めた（精算調整の代替は不要）。
- **0175 v2**＝Downloads/0175_rules_bundle_v2_draft.sql（docs/tmp と同一・v1 は撤去）・**3,158 行・263,806 B・sha256 a83987462761ec07…b02（sha16 a83987462761ec07）**・LF・mig-check OK（291 文・plpgsql 33 本）・v1 からの増分 +711 行＝★11〜★20＝店設定キー 8（service_rate_by_seat 列／pay_discount_rates／sys_drink_count_back／sales_subtotal_mode／sales_subtotal_includes_shimei／settlement_week_close_dow／settlement_pay_days_after／daily_pay_cap_tiers）・check_pay の割引行（fee_kind pay_discount）・comp_plans +11 列（pay_rate_tiers／slide_streak_n／reward_axis／assess_grace_months／back_unit 3／product_back_rate_by_kind／product_back_fixed_vip／product_back_rate_vip／reservation_back_tiers）＋slide_basis pay_rate＋back_rate 併用（0115 の同伴率封印を解錠）・表 5（plan_rate_bands／plan_norm_tiers／plan_event_bonuses／slide_decisions／cast_rate_history）・RPC 8（comp_plan_pay_rate_check 内部／comp_plan_ext_set／plan_rate_band_set／plan_norm_tier_set／plan_event_bonus_set／slide_decision_propose／slide_decision_decide／cast_rate_history_add）・attendance_set（dohan 撤去＝裁定417・+help／duty_absent・既存 dohan 行は shukkin へ）・daily_pay_issue 6 引数（p_worked_hours＝上限の表）。0177 との競合＝再確認 0。0176 は変更なし（sha16 afaf05e83adba894）。verify_0175_0176.sql（md5 pin 56）・handpaste_0175.md（v2）・suite verify-nox-0175-0176（v2 の段 3 本）を更新。関数数／表数の期待＝0175 後 334／95・0176 後 357／104。
- **【事後承認待ち】**: docs/dp/canon_gap §4 の 9 件（④の帯の隙間・⑥の分子分母・⑦＝⑬の提案表兼用・⑨ 店 1 スイッチ・⑫ cast_rate_history＋支給率は総報酬に掛ける・⑭ 排他 CHECK 緩和と同伴率封印の解錠・⑪⑫「店に確認」・CANON 拡張は comp_plan_ext_set（jsonb patch）・CSV 未着）＋v2 の設計＝割引は残額に対する率（p_fee_on=false で割引も止める）・attendance の dohan 撤去と shukkin 移行（P175 前に payload の dohan を外す）・daily_pay_issue の上限は settlement のみ。
- **次**＝PR-1（R-1〜R-5・本便で上書き版）→ Agoora 手貼り P175（v2）→P176→P177。
**便 0175／0176 起草 完了（2026-10-22）＝台帳の現在地**: 前提＝HEAD bc0f9a0＝origin（BZ-R docs）。**起草のみ＝本番適用なし・DB 読取は SELECT のみ（docs/tmp/0175_live.json＝pg_get_functiondef 2026-10-22）**。
- **0175_rules_bundle_draft.sql**＝Downloads（docs/tmp と同一）・**2,447 行・198,394 B・sha256 62cdac53d53135d7…72b9（sha16 62cdac53d53135d7）**・LF・mig-check OK（libpg_query 175 文・plpgsql 23 本）・生成器 docs/tmp/gen_0175.mjs（live の関数 11 本に★差分＋新設 12 本＋DDL）。**対象（★1〜★10）**＝393 追補2／3（check_pay +p_fee_rate／p_fee_on・check_lines.fee_rate・audit pay_fee_override／check_group_due 外税の母数から手数料行を除く）／402（receipt_issue +p_biz_date／p_reissue_of・receipt_issues +reissue_of／by_membership）／店設定キー 4（sys_wage_cut_rule・bonus_tier_mode・sales_split・pt_rules_default）＋398 の列側 8 キー＋同意版／405（comp_plans.pt_rules・products.pt・pt_rules_check）／407（comp_plans.slide_method＋移行 SQL・set_comp_plan 32 引数）／409（cast_sales_aggregate equal）／410・I-3（payroll_adjustments +kind／source_table／source_id／cancelled_*・payroll_adjustment_add 14 引数・payroll_adjustment_cancel）／I-5（norm_shortfall_decide＝audit のみ）／⑤ 日払い取消（daily_pays +cancelled_*・daily_pay_cancel）／便 S 起票（check_set_nominations の created_at 引継ぎ）／起票117（demo_org_reset の列指定 insert）／396（set_cast_kind・本採用で joined_on 空なら当日）／新規店の税既定 外税（price_display default）／W-24（daily_reports.other_cash_memo・候補）／408 追補1（pricing_rules +vip_timing／vip_ext_amount・set_pricing_rule_vip）／356（staff_payroll_run_set_status・owner）／398（stores 打刻列 9・punch_round_consents・store_wifi_add／remove・punch_self 7 引数・punch_proxy within true・punches.geo_override）／397＋413 追補1（availability・availability_terms・availability_set／list）／399（staff_contracts +6・memberships +hire／leave）／400（users +contact_email／phone・set_my_contact）。H-8／H-11／起票118＝DB 変更なし（既に器あり）。
- **0176_people_line_draft.sql**＝Downloads（docs/tmp と同一）・**974 行・77,266 B・sha256 afaf05e83adba894…b821（sha16 afaf05e83adba894）**・LF・mig-check OK（153 文・plpgsql 24 本）・生成器 docs/tmp/gen_0176.mjs（全部新設＝set_my_contact の置換だけ既存）。**対象（★1〜★5）**＝401 LINE（stores.line_config／line_monthly_limit・line_links・line_bind_tokens・line_push_log・RPC 8＝Vault は service_role 専用）／399 の残り（staff_contract_set・staff_invites＋create／accept・member_profiles＋self_save／store_save／confirm）／I-4（attendance.ack_*・attendance_contacts・attendance_contact_log／attendance_ack）／400 の残り（contact_changes・set_my_contact 置換・contact_change_confirm）／SH-UI-b の 0176 行き 5 件（shift_period_needs＋set・shift_periods_auto_close＝cron 用・shift_cast_decline・cast_notifications＋create／read・notices.cast_ids＋notice_create_targets）。411＝DB 変更なし。
- **対象数**＝0175: 裁定・起票 22 項目（表 3・列 44・RPC 置換 11＋新設 12・白名単 13 キー）／0176: 5 群（表 9・列 7・RPC 新設 23＋置換 1）。**0177 との競合＝0**（0177 は transport 系 6 関数と transport.mode だけ・順序 P175→P176→P177）。
- **手貼り案内**＝docs/demo/handpaste_0175.md／handpaste_0176.md（0173／0174 と同じ体裁）・検証 1 文＝docs/demo/verify_0175_0176.sql（md5 pin 46＝起草本体の md5・libpg_query OK）・suite＝scripts/verify-nox-0175-0176.ts（DB 段・未適用は SKIP で緑・**f0 への追加は P175 後**・今は verify:nox-0175-0176 単独）。
- **【事後承認待ち】→ 承認済み（2026-10-23・連続便 2 冒頭で全件）**: ①BZ-R の 6 件（docs/dp §7）②0175 の設計判断＝check_pay の p_fee_on 既定 true・手数料行は税込（check_group_due 1 行）・receipt_issue の再発行は元の行を同一 tx で取消（void_note「再発行のため取消」）・set_comp_plan の slide_method null＝新規は段から導出／更新は現値・pt_rules null＝新規は店の既定をコピー・payroll_adjustment_cancel／daily_pay_cancel は行を消さず cancelled_at（計算側の除外は P175）・norm_shortfall_decide は audit のみ（表なし）・set_cast_kind の値域＝キャスト／接客スタッフ／体入・408 追補1 は set_pricing_rule_vip の別 RPC（set_pricing_rule は触らない・計算は P175）・356 は owner のみ・W-24 列は候補（書く RPC なし）・punch_self の判定は route（p_within_geofence を信じる＝lat／lng と同じ信頼）・ハード×位置の範囲必須は DB でも検査（Wi-Fi は UI）・availability は台帳の器＋terms 別表・雇用キャストの時間帯は本人不可（RPC で拒否）・通知は client ③0176 の設計判断＝LINE の kind 4 種・bind トークン 7 日・staff_invite_accept が users＋memberships を直接作る（staff_create は auth 文脈が要るため）・member_profiles は users 単位（キャストの本名／生年月日の正は cast_sensitive のまま）・shift_periods_auto_close は service_role（cron route は P176）・cast_notifications の kind 6 種・notices.cast_ids ④verify の関数数 349／表数 99 は P176 後の値。
- **次**＝Agoora 手貼り P175→P176→P177（戻り次第・verify_0175_0176.sql の返りを CC へ）→ P175 client（計算側の読み替え・店設定 UI・打刻 route・availability UI）→ P176 client（LINE route・スタッフ登録→招待・連絡の確認・シフト 0176 行き）。次の裁定番号＝416（PR-1 候補）・417（R-4 候補）。
**便 BZ-R 完了（2026-10-22）＝台帳の現在地**: 前提＝HEAD e68383d＝origin（SH-UI-b docs）。読取・設計のみ＝コード変更 0・DB 変更 0。入力＝docs/handoff/nox_port_2026-10-21.md（Downloads からバイト複写・sha256 717d6535…482・BANZEN repo の同名と同一）。出力＝**docs/dp/bzr_port_20261022.md**（398 打刻設定／399 勤務条件／400 本人の連絡先変更／401 LINE＝項目ごとに BANZEN 側の器｜NOX で既にある器｜足りない列・RPC｜行先｜client 1 行・未読取 9 か所を BANZEN repo で読み切り＝§6・0177 との競合 0）。**行先（相談役案）**＝398・399・400 は 0175、401 は 0176（v50 §3-3 と一致・399 の staff_contracts 書込 RPC と本人基本情報は 0176）。**0175 に増えた対象**＝3 項目（表 3＝punch_round_consents／availability／availability_terms・列 19＝stores 9＋staff_contracts 6＋memberships 2＋users 2・RPC 6＝store_wifi_add／remove・availability_set／list・set_my_contact＋punch_self 署名・白名単 8 キー）。**0176 に増えた対象**＝3 項目（401＝列 2・表 3 line_links／line_bind_tokens／line_push_log・RPC 5／399 の残り＝staff_contract_set・登録→招待・member_profiles／400 の残り＝contact_changes）。v50（2026-10-22）も docs/handoff に収蔵（sha256 2e5d2909…6d0）。**【事後承認待ち】→ 承認済み（2026-10-23・連続便 2 冒頭で全件）**＝docs/dp §7 の 6 件（行先・manager_punch_enabled 不採用と punch_self 署名変更・availability は台帳の器＋terms 別表・users に contact_email／phone・LINE の kind 4 種と bind トークン表・手順書に Webhook の Step）。**次**＝0175／0176 起草（Downloads へ・適用しない）。
**便 SH-UI-b 完了（2026-10-22）＝台帳の現在地**: 前提＝HEAD f53835c＝origin（SH-UI-c live docs）。DB 恒久変更 0・DB 読取は SELECT のみ（デモ payload 変更 0）。**コミット**＝d9c334d（feat: SH-UI-b（シフト画面の再構成））。
- **U-0 読取**: ①/shift＝shift-board.tsx 1 本（state tab 5 キー today／calendar／build／queue／roster・裁定274 の 3 タブ 今日／作る／確定を tabs.ts で被せる・期間一覧＋新規作成＋必要人数＋代行確定は build／queue パネルの中）②期間の状態＝shift_periods.status（draft／open／closed／published）・遷移 RPC＝shift_period_set（p_status）・語は period-stage.ts の 4 語 ③proposed の時間変更＝shift_set／shift_propose・本人の承諾＝shift_cast_confirm（proposed→confirmed）・**辞退 RPC は無い** ④必要人数＝staffing_needs＝**店単位（曜日×時間帯）・期間単位は無い** ⑤公開後の追加・外し＝shift_set／shift_remove（既存）・通知＝notice_create（手動のお知らせ・自動通知は無い）⑥締切到達の遷移＝**無い**（cron は shift-auto-confirm のみ）→ 本便は表示の実効段（effectiveStageOf＝募集中で締切を過ぎたら「配置中」と表示・DB の status は変えない）で代替。
- **0176 行き（DB が足りない 5 件）**: (a) 期間ごとの必要人数（shift_periods × dow or date の needs 表＋shift_set の充足計算の切替）(b) 締切日到達で open→closed に進める遷移（cron か shift_period_set の自動呼び出し＝表示の実効段を正本化）(c) 本人の辞退 RPC（shift_cast_decline＝proposed→planned か rejected・/mine の「辞退」ボタン）(d) 公開後の追加・外しの自動通知（notice_create を shift_set／shift_remove から呼ぶか、cast ごとの通知表）(e) 未提出の人への一括お知らせ（提出一覧の「未提出の人にお知らせを送る」＝cast を絞った notice_create）。
- **U-1**: 裁定406 を台帳に収載（v48 §2 の本文を逐語・ここまで台帳に無かった＝v48 §8-4 U-1「確定済み」との食い違い）。
- **U-2 実装（client・DB 変更 0）**: lib/nox/shift/tabs.ts＝上段 3 タブ（今日／シフト作成／確定シフト）＋手順 4 段（build 期間を作る／submit 提出一覧／queue シフト配置／publish 公開シフト）・7 キー（旧 5＋submit／publish・旧 calendar は ③ の中）・URL ヘルパー（tabFromSearch／searchOfTab＝/shift?tab=make&step=3&period=<id>・他のクエリ ym は保持）。period-stage.ts＝closed「仮シフト調整」→**「配置中」**＋effectiveStageOf。shift-board＝手順 ol（.nox-steps・PC 4 列／≤899 2 列／≤600 縦）・②提出一覧（募集中の期間切替・締切まで／提出済み／未提出・未提出の名前・提出済みの表＝shift_wishes の kind／created_at・「今すぐ締め切って ③ シフト配置へ」＝shift_period_set closed）・③の頭＝配置中の期間切替＋「④ 公開シフトへ」（承認リスト＝従来の queue・月カレンダー＝従来の calendar を ③ の中へ）・④公開シフト（期間切替＝配置中・無ければ公開済み・「キャストに公開する」＝shift_period_set published→確定シフトへ・不足日＝dayStat の required>assigned・「③ で配置する」）・確定シフト＝公開済みの期間を選んでカレンダー（追加／外す・代行確定は従来どおり）。① の「スタッフに公開する」は「④ 公開シフトへ」に（① から直接 published にしない）・新規フォームの既定＝募集中・作成ボタン「作成して募集を始める」・主ボタン中央（.nox-cta）。既存機能（今日・当日追加配置・代行確定・必要人数設定）は消さず置き場だけ移動。働き方（397）の列は未実装のまま（候補の並びは従来どおり）。
- **U-3 /mine**: 凡例＝GV-60 の 7 状態（data-day-legend）据え置き（状態名は shift の語＝審査中／確認待ち／確定…で期間の段の語とは別物＝変更なし）。承諾＝shift-confirm-button（shift_cast_confirm）あり。**辞退は RPC が無いので導線を足していない**（0176 行き (c)）。
- **verify**＝shift-tabs 28（張替え＝st(1)〜(5)＋URL 7 本）・period-stage 9（配置中）・wish-state ws(4-4)・shift-nav sn(3-4)（pf-acts nox-cta・文言）・s-lane 39（＋8 shb(1)〜(8)）。**f0**＝2 連緑（run1 19:0x／run2 19:04・128 段・run2 は 180 秒冷却・赤 0。run1 の初回は st(5-1) の pin 1 本が URL ガード（urlTabPending）の文言に追随しておらず赤→張替えて再走＝緑）。local build＝next build OK（NEXT_DIST_DIR=.next-build・Compiled successfully 18.3s・出力削除済み）。
- **live（本番・6 店 reset 後・ACE 1,280／390・オーナー／ひなの）**＝①1,280px オーナー＝上段 今日／シフト作成⑬／確定シフト・手順 4 段が順に（押せる・コントラスト 8.9〜9）・② 提出一覧＝10/29〜11/4（募集中・提出 7/7・締切まで 3 日・未提出 0）・③ ひなの 10/29（採用・確認待ち（管理者確認））の「調整」＝モーダル「調整して確定」「調整して送り返す」（押せる・4／5.3）・「送り返す」実行→「採用・確認待ち（キャスト確認待ち）」＋✓1件をキャスト確認へ送りました・④ 公開シフト＝配置中なし→公開済み 10/22〜10/28 を表示・不足日 3（10/23 4/5・10/24 4/5・10/27 3/4・「③ で配置する」）・① CTA「作成して募集を始める」中央 ②ひなの /mine/wishes＝凡例 7 状態（採用・確定／採用・確認待ち／審査中／休み希望／見送り／募集中／定休・期間外）・/mine に 10/29 確認待ち（あなた）「確認する」が出る ③390px オーナー＝手順 4 段が縦 1 列（grid 358px・left 16・横スクロール 0）・主ボタン 4 本とも中央（centerOff 0・幅 326・コントラスト 4）・KPI 3 枡は 1 列。E-23 追補1 で判定。観察＝調整モーダルの「確定シフトの時間」はラベル風ボタンでコントラスト 1.6（既存部品・本便の対象外）
- **【事後承認待ち】→ 承認済み（2026-10-23・連続便 2 冒頭で全件）**: ①裁定406 の台帳収載（v48 §2 逐語）②closed の語「仮シフト調整」→「配置中」（ps(1-1) 張替え）③締切後の「配置中」は表示の実効段（DB の status は open のまま＝提出一覧から消え ③ に出る）④新規期間フォームの既定を募集中に（「作成して募集を始める」）⑤0176 行き 5 件の切り方 ⑥④ 公開シフトで配置中が無いときは公開済みの期間を出す（不足日の確認用）。
- **次**＝BZ-R（docs/handoff/nox_port_2026-10-21.md 読取→docs/dp/bzr_port_20261022.md）→0175／0176 起草。次の裁定番号＝416（PR-1 候補）・417（R-4 候補）。
**便 SH-UI-c 完了（2026-10-22）＝台帳の現在地**: 前提＝HEAD b01685d＝origin（SH-UI-a docs）。DB 恒久変更 0・DB 読取は SELECT のみ（デモ payload の変更のみ）。**コミット**＝17e86ad（feat: SH-UI-c（勤怠一覧・指名かぶり・W-10 列挙））。
- **先に（X13-H の再掲）**: 結論 3 行＝①H-9「-31」固定 2 か所（dashboard-board・month-report＝30 日の月で 0 件）＋翌月 0 日の組み立て 18 か所を lib/nox/month（daysInMonthOf／monthLastDayOf／monthAfterOf／monthRangeOf）に統一 ②H-8 計算が読んでいた判定タイミングの保存先＝プランの comp_plans.slide_apply（null なら店の settings_json.slide_apply＝26／27 プランが店の値に依存）→ 計算・表示ともプランだけ（null＝当期の累計・店の値は読まない・保存先はプラン＝0175 不要）③H-11 本入店日＝casts.joined_on・set_cast_profile（既存・audit）・cast_create は本入店日を持たない＝登録直後に set_cast_profile。f0 126 段 6,170 2 連緑・live OK。
- **A-0 追補**: 裁定415（指名かぶり＝指名は必ず入れ、席だけを聞く＝B 案）を台帳に収載・W-1 クローズ＝x13_ledger #82 を「済（10/22 Agoora が iPhone 実機で右上アカウント→下シートの「ログアウト」を確認・H-20 修正後）」に。GV-D の一覧は台帳・x13_ledger に無い（W-1 の行で実機確認待ちを外した）。
- **C-1 読取**: 実働 h＝collect.ts **loadPunch**（shifts confirmed／attendance／punches を読む）→ punch-io **buildMatchInput**（営業日帰属 bizDateOf・分 floor・0-47 域）→ punch-match **matchPunches**（in＝最初・out＝最後・late／early／over は penalty_config の猶予・S3 対応表で final）→ punch-io **dayWorkedHours**（raw の in／out の差・in か out が無ければ 0）→ hoursByDate → daily（売上日 ∪ 打刻日）→ pay.ts **wageDetail** が Σ hours を **roundPt1** で wHours。計算基準 'shift'（確定シフト）＝payOf 613 行で「実打刻 h>0 の日だけ確定シフトの時間に置換」（shift_guarantee は max）。日数＝anomaly.ts punchCountsUpToOf（final ok／late・営業日の今日まで＝裁定342・当欠は数えない）。遅刻＝final late（猶予 late_grace_min）・早退＝raw.out early（early_grace_min・罰金非接続）。
- **C-2 勤怠一覧**: lib/nox/payroll/attendance-sheet.ts（純関数＝attendanceDayRowsOf／attendanceSummaryOf／attendanceCsvOf＝上の同じ関数を呼ぶ・別計算なし）・route `/api/attendance/sheet`（POST store×period・guardPayroll・合計表の数字は **computePayrollDraft の pay.wHours／wdays.length／lateN／absentN／missingOutDates そのまま**＝給与画面と一致）・給与の「勤怠」タブ（page.tsx ?tab=attendance・スタッフは StaffWorkPanel＝/staff と同じ）・attendance-board.tsx（①合計表→行で②・②＝日付｜確定シフト｜出／退（翌表記）｜店の修正（punch_corrections approved・修正者・時刻・元の値の折りたたみ）｜遅刻／当欠／早退（連絡あり HH:MM）｜実働 h＋基準の印｜送り（方式）｜備考・退勤記録なしは赤・日付→今日タブのその日・CSV（UTF-8 BOM・②の列・client 生成）・印刷（A4 横・1 人 1 枚・店名と期間と出力日時）・390px＝3 列＋行を開く）・③導線＝一覧の「時間」セルと右パネルの「時給 ¥n/h × 74.9h」が link・④/mine「今月の勤怠」＝同じ部品 KintaiRow（修正者名なし・金額なし・自分の行＝RLS）。**★店の修正の出所**＝punch_corrections（audit_logs は owner 限定の RLS で店長が読めない・店長の「時刻修正」（shift_set）は audit だけ＝勤怠表には出ない）。**★CSV の出力記録**＝client から呼べる audit の RPC が無い＝出していない（0175 行き）。**★/mine の日数**＝打刻日（本人の行）・店長側は給与の日数（売上日 ∪ 打刻日）＝定義が違う（表に注記）。
- **C-3 デモ payload**: ACE ひなの＝当月（$m:0 の写し）の 10/12 を遅刻（本人連絡 18:42・見込み 20:00・理由）＋in 打刻 +30 分（20:16）。**店の時刻修正（punch_corrections）は demo_org_reset の c_load に表が無く payload に入れられない＝0175 行き**（live は店長が本人の申請を承認して作る）。
- **S-7 指名かぶり（裁定415）**: register-board＝他卓に着卓中のキャストをタップ→NomConflictDialog（「るな は A3 に着卓中です（指名かぶり）。この卓の指名料は入ります。A3 の伝票は変わりません。席はどうしますか？」・「指名だけ入れる（席は A3 のまま）」＝本指名で追加（他卓の名簿は触らない）／「指名して A3 から付け回す」＝本指名＋S-6 の付け回し（他卓で ended）・キャンセル）。どちらも他卓の指名料・分配率は不変（RPC は伝票ごと）。キャストカード＝「本指名」と「着卓中（A3）」の両方・分配率の行に「A3 着卓中」の小さな印。
- **W-10**: docs/demo/w10_junbichu.md＝25 か所（作る 8／消す 17・相談役案・【事後承認待ち】）。
- **verify**＝s-lane 31（＋8）・pin 張替え＝x13g(21)（/mine の見出し）・s6(4)（他卓タップ＝ダイアログ）。**f0**＝128 段 6,213（6,205＋s-lane 8）2 連緑 17:43:05〜17:51:02／17:54:30〜18:03:07（run2 は 180 秒冷却後・1 回目は demo-guard の route 分類で止め→attendance/sheet を C に）。local build＝OK（next build 18:0x・exit 0）。
- **live（本番・6 店 reset 後・ACE 1,280／390・オーナー／ひなの）**＝本番 d1c8d21（feat 17e86ad＋docs）→fix a1c1a9e・6 店 reset 18:07。①給与 ACE 2026/10 の一覧「時間」セル（せな 81h）を押す→勤怠タブの せな＝「出勤 16 日・実働 81h・遅刻 0・当欠 1」＝給与の 81h・16日 と一致（打刻日の行は 14）。②ひなの 10/12＝「20:16｜翌01:52｜遅刻（連絡あり 18:42）｜5.6h 実打刻｜電車の遅延で 30 分ほど遅れます」＝payload の遅刻が出る。店の時刻修正の折りたたみ＝**出せない**（punch_corrections は c_load に無く payload 不可・ACE は本人の修正申請 OFF＝live で作る口も無い＝0175 行き）。③CSV＝ブラウザで Blob を捕まえて数えた＝見出し 2 行＋表と同じ行数（fix 後）・BOM 付き。印刷用＝A4 横の @page と 1 人 1 枚（.nox-print）は静的 pin＝headless では 1 枚に収まるかを目視できない。④/mine ひなの＝同じ表（15 行・10/12 の遅刻と理由・修正者名なし・¥ なし・見出し「出勤 14 日・実働 87.7h」＝打刻日）。⑤VIP-1 で るな（A2 着卓中）→ダイアログ「るな は A2 に着卓中です（指名かぶり）。この卓（VIP-1）の指名料は入ります。A2 の伝票は変わりません。席はどうしますか？」→「指名だけ」＝VIP-1 に るな 本指名 ¥3,000・分配率の行に「A2 着卓中」・A2 の名簿と指名料は不変（DB で照合）／のあ（A3）→「付け回す」＝VIP-1 に のあ 本指名 ¥3,000・A3 の のあ は ended（指名料は残る）・両伝票に本指名 ¥3,000（DB で照合）。390px＝ダイアログの 2 ボタンは elementFromPoint＝自身・コントラスト 3.95／5.31・横はみ出し 0。勤怠表 390px＝4 列（日付・出・退・実働）・行を押すと残り・CSV ボタン押せる（E-23 追補1）。★live で直した 2 点＝CSV の行（未来日以外の全日→表と同じ行）・「着卓中（A2）」バッジが名簿に入れた後に消えていた（seated 条件を外す）。
- **【事後承認待ち】**: ①裁定415（指名かぶり＝B 案）②W-1 クローズ（GV-D の一覧は無し）③W-10 の作る／消す 25 件 ④勤怠表の「店の修正」＝punch_corrections だけ（shift_set の時刻修正は出ない・出すなら 0175 で audit の読み口か punch_corrections への記録）⑤CSV の出力記録なし（0175 の RPC）⑥C-3 の店の修正は payload 不可（0175 で c_load に punch_corrections）⑦/mine の日数の定義（打刻日）。
- **次**＝SH-UI-b（裁定406 シフト再構成）。次の裁定番号＝416（PR-1 候補）・417（R-4 候補）。
**便 SH-UI-a 完了（2026-10-22）＝台帳の現在地**: 前提＝HEAD 0d9407c＝origin（便 S docs）。DB 恒久変更 0・DB 読取は SELECT のみ（デモ payload の変更のみ）。**コミット**＝c413361（feat: SH-UI-a（台帳・就業規則キー・ロゴ））→e64c234（fix: LILY の penalty_config）。
- **A-0 台帳**: E-23 追補1（押せる＋見える＝コントラスト比 3 以上・opacity>0・visibility visible）・教訓（H-20 の真因＝body 直下のポータルが .nox-dark の外→**台帳では教訓119**＝相談役ブロックの「教訓117」は E-22 で採番済みのため番号を繰った・注記あり）・裁定413 追補1（基本の働き方＝0175 の 397 に統合・週の出勤日数の目安と適用開始日を列として追加）・X13-I の要判断の裁定 8 件・0175／0176／0177 の対象一覧 1 枚（P175→P176→P177）。
- **A-1 就業規則チェックの保存**: キー＝**stores.settings_json.sys_wage_cut_rule**（boolean・既定 OFF・lib/nox/store-systems.ts WAGE_CUT_RULE_KEY／wageCutRuleOf・SYSTEM_KEYS 9 には入れない＝白名単 pin ss(4) を崩さない）。読み＝payroll collect の hasWorkRule（旧 sanction_work_rule＝保存先が無かった）→ ON で I-5 ④の雇用向け提案（91 条キャップ）。書き＝利用機能「報酬制度」の下に行（systems-board・set_store_profile の 1 キー patch・audit は RPC）。**★set_store_profile の白名単に無い＝適用前は RPC が 'bad key' で拒む→切替は WAGE_CUT_RULE_APPLIED=false で無効（「0175 の適用後に切り替えられます」）・白名単への追加は 0175 ⑧**（DB 変更 0 の枠では保存の器を作れない＝相談役の「sys_* と同じ読み書き」は白名単 9 キーに限る）。デモ＝LILY（雇用の店）の payload を ON（profiles.mjs sys.wage_cut_rule・sysSettingsOf＝6 店の payload に sys_wage_cut_rule が入る・他 5 店 OFF・payload 6 本＋_report 再生成）。suite＝s-lane sh(1)〜(3)（ON→提案 proposed>0／OFF→no_rule・collect の読み・payload LILY ON／ACE OFF）。
- **A-2 ロゴ（Concept 2 改）**: Downloads/NOX_logo_concept2_revised.zip → public/brand/（README のとおり・preview は入れない）。部品 components/ui/brand-logo.tsx（横組み dark／light・print＝画面 dark・印刷 light を CSS .nox-logo-screen／.nox-logo-print で切替・高さ指定＋max-width 100%）。差し替え＝サイドバー（side-nav・34px・rail 26px）・上部バー（manage layout・22px）・ログイン（56px＝「N」の箱と文字を撤去）・/demo（34）・/lp（40）・mine（26）・領収書（印刷＝light 34）・報酬明細 PDF（ps-hd の左・22・画面 dark／印刷 light）。favicon＝public/favicon.ico／favicon.svg／apple-touch-icon.png（180）を置換・manifest の 192／512 と shortcuts は /brand/favicon_192／512・layout.tsx の icons を新 5 本に。旧 favicon-32.png／icon-192.png／icon-512.png は削除。suite＝s-lane sh(4)〜(5)・register-sticky rs(3)（sizes だけの pin＝不変）。
- **verify**＝s-lane 23（＋5）・pin suites 17 本単独緑（337／demo-payload／demo-profiles／gvc／n1014／norm-axes／p173／p174／register-sticky／setup／store-systems／wish-state／x13／x13d2／x13g／x13h／x13i）。**f0**＝128 段 6,205（6,200＋s-lane 5）2 連緑 16:15:38〜16:24:04／16:27:21〜16:35:50（run2 は 180 秒冷却後）。local build＝OK（next build 16:36・exit 0）。
- **live（本番・6 店 reset 後）**＝本番ビルド c413361→e64c234（fix）・6 店 reset 16:43（LILY は payload fix 後に 16:54 再 reset）。①LILY 2026/10 の要対応に「ノルマ未達の懲戒減給（雇用・労基法 91 条の上限内）」＝みく ¥6,000・ほのか ¥1,000・はる ¥2,000・ちなつ ¥5,043（計算 ¥12,000）・こはる ¥2,945（計算 ¥23,000）＝91 条キャップが効いている／ACE（OFF・委託の店）＝「ノルマ未達 6 名・提案額 合計 ¥190,000 委託キャストのみ」＝雇用の節は出ない。★初回の LILY は penalty_config が payload に無く提案 0→fix e64c234（LILY の norm_on・日数 1,000・売上 2,000／100,000）。②ログイン（56px）・/lp（40）・サイドバー（34）・上部バー（22）＝新ロゴ・naturalWidth>0・1,280／1,024／390 で欠けない（scrollWidth 390）・<link rel=icon>＝favicon.ico／favicon.svg／brand 32・192・512／apple-touch-icon。③右上アカウント＝中身（登録名・役割・店舗・ログアウト）が見える（登録名のコントラスト比 18.6・ログアウト 5.31・opacity 1・visible）・ログアウトは elementFromPoint＝自身（1,280／1,024／390）＝E-23 追補1 合格。
- **迷って選んだ所**: ①sys_wage_cut_rule の保存＝白名単外のため切替を適用後まで無効にした（失敗する切替を出さない・デモは payload で ON＝live ① は満たす）②教訓の番号＝衝突を避けて 119（相談役の呼称は注記）③ロゴは <img>（静的 SVG・next/image の最適化は不要）④kiosk-register の「NOX」文字は対象外のまま（指定外）。
- **次**＝SH-UI-b（裁定406 のシフト再構成＝相談役が出す）。次の裁定番号＝415。
**便 S 完了（2026-10-21）＝台帳の現在地**: 前提＝HEAD 4634596＝origin（X13-I docs）。DB 恒久変更 0（migration は 0177 の起草のみ＝流していない）・DB 読取は SELECT のみ。live はデモ org（ACE／LUNA）で行い、作った伝票 2 本は void・送り 1 件は記録→取消で戻した（名簿の着席ログ＝check_nominations の ended_at は 06:05 の reset で戻る）。**コミット**＝6f339dc（S-5・S-6）→eea7c58（S-4 client＋0177 起草＋suite）。
- **S-5 伝票の上段に顧客名**: 卓名（.t）の直後に最初のお客様（併存）を太字「やまだ様」・2 人目以降「やまだ様 ＋1」・未登録は出さない（lib/nox/register/line-groups.ts checkCustHeadOf＝旧 W-3 checkCustLineOf「K様 ほか n 名」を置換・1 段下の行と .nox-checkcust は撤去・押すと「指名・席」の顧客の節へ）。フロアの卓タイルにも同じ 1 行（loadOpenMap で check_customers＋customers(name) 埋め込み 1 クエリ・.nox-seat .cust 省略記号）。390px＝.nox-backbar .cust は flex 0 0 100%（卓名の次の行・同じ太字）。live＝ACE A1 に やまだ を付けて開卓→上段「やまだ様」（elementFromPoint＝自身・390 で次の行・横はみ出し 0）→フロア A1 タイルに「やまだ様」→顧客を外すと上段から消えた→伝票は void。
- **S-6 指名・席のキャスト一覧とフリーの付け回し**: ①一覧は名簿の状態に関係なく常に出す（CastPicker chips chipSet="two"＝出勤中（既定）／全員・名簿の人は本／場内／フリーの印（nomKindBadgesOf＝名簿の種別）と選択枠・押すと名簿から外れる（課金行が残る人は従来の関所「先に指名料を取り消してください」のまま）・他卓の人は「着卓中（B2）」（servingSeatMapOf）・押すと確認 1 回→その卓の名簿を全置換（当該 cast だけ ended:true・他は ended キー無し＝既存値保持・離席済みの行も残る）→この卓へ追加（lib/nox/register/seat-roster.ts）。②フリー＝分配率の節に出さない（shareCardIdsOf＝着席中かつフリー以外）・「席」の節（分配率の上・data-seat-rows）に「着卓中：せな 19:05〜」＋本／場内／フリーの切替＋「離席」（ended:true）・離席済みは薄く「せな 19:05〜19:05（離席）」＋「再着席」（ended:false）。着席ログ＝既存の check_nominations（created_at／ended_at・列は足さない）。重複着席＝他卓で自動 ended。③本指名・場内・同伴は今のまま分配率。フリー→本に変えると分配率の節へ移る（逆も）。④390px＝.nox-castgrid 3 列（横スクロールなし）。live＝ACE A1 でひなの（場内）・めい（本指名）→せな（B1 着卓中）をフリーで着席（確認→B1 で ended）→分配率はひなの・めいだけ・席の節に「着卓中：せな 19:05〜」→A3 を開いてせなを着席（確認）→A1 の席の節が「せな 19:05〜19:05（離席）」・一覧のせなは「出勤中」→伝票 2 本 void。★発見＝check_set_nominations は全置換（delete→insert）のため **created_at が保存ごとに今になる**＝「着卓中：ひなの 20:05〜」の時刻は最後の名簿保存の時刻（着席の時刻ではない）。直すには RPC が旧行の created_at を引き継ぐ変更＝**0175 行き（起票）**。
- **S-4 送りの 4 方式（裁定414）**: 読取＝okuri_mode は 2 値（flat／actual・キー無し＝flat）・「店負担」「なし」の器なし（dm1 で店負担＝なしと言い換え）・現金支払と控除の両方に一律で載せる箇所は無し（transport 1 行＝現金支払＋控除＝実費の正そのもの）・定額は deductions マスタの月額固定（退勤ごとではない）。**0177 の起草**＝`Downloads/0177_okuri_mode_4way_draft.sql`（同じ中身 docs/tmp/0177_okuri_mode_4way_draft.sql・**321 行・21,952 B・sha16 e22bfcc3eb93625c**・生成器 docs/tmp/gen_0177.mjs＝live の pg_get_functiondef（docs/tmp/0177_live.json・md5 set_store_okuri_mode 71e07a1e／okuri_default_of 434e69d9／transport_issue 7740e3c4／transport_issue_bulk 9d10c990／transport_issue_self 2eebb64f／kiosk_transport_issue 08c5dbc3）に★差分）。番号＝**0177**（台帳に 0177 の予約なし・裁定401 LINE は案で器の番号なし＝次の空き）。**scripts/mig-check＝OK（errors 0・plpgsql 5・sql 1）**（libpg-query@17＋ローカル Postgres 18.6 port 54329・BEGIN…ROLLBACK・検査後に停止・削除）。中身＝★1 transport.mode text not null default 'actual' check in ('actual','flat','store')（既存 2 行＝actual）★2 set_store_okuri_mode 受理値 4 つ ★3 transport_issue／bulk／self／kiosk＝'none' は 'okuri none'・不正値 'bad okuri mode'・insert と audit に mode ★4 okuri_default_of＝'none' 以外の 3 方式で p_okuri を聞く。grant は写経元と同じ。client（今便・mode を読む形＝値が無い間は従来どおり）＝lib/nox/shift/okuri-mode.ts（okuriModeOf キー無し＝flat・okuriAsks＝none 以外・okuriOutTextOf 実費「送り代 ¥1,000 を立て替えて退勤（給与から控除）」／定額「送り ¥1,000 は給与から控除します（現金は動きません）」／店負担「送り代 ¥1,000 を店が負担して退勤」・okuriBucketsOf＝現金支払 actual／控除 actual+flat／諸経費 store）①退勤ダイアログ（okuri-out-dialog okuriMode・説明文＝方式の 1 文・注記＝方式の説明・「送りを記録（して退勤）」）・今日タブ（title「送りを記録します…」・成功文）・/mine（PunchActions okuriMode・方式の 1 文）・kiosk（okuriSelfPlanOf.mode・方式の 1 文）＝「発行」→「記録」（cash-payout-issue 題「送りの記録」・日報の内訳ボタン「＋ 記録」・一括発行の成功文「送りを n 人…記録しました」・ISSUE_LABEL transport「送り」）②日報＝現金支払の行名「送り立替」（mode='actual' だけ・select * で mode を読む）・諸経費の内訳「送迎費（店負担）」（data-expense-bd・mode='store' の当日分・無ければ出さない・諸経費の欄が 0 なら既定に入れる・欄が内訳より小さければ 1 行で知らせる）・締め前モーダル「記録済み／未記録」③給与＝collect.loadTransport は select * で mode を読み 'store' を除外 ④/mine 明細＝breakdown.okuri の transport_id→transport.mode（本人の行＝RLS）で「送り立替」「送り（定額）」の 2 行（mode が無い間は従来の「送り」1 行・breakdownLinesOf okuriModes）⑤設定画面＝deduction-panel 4 択（実費／定額／店負担／なし・OKURI_4WAY_APPLIED=false＝'store'／'none' は「0177 の適用後に選べます」で無効・route は 4 値受理）・okuriEnabledOf＝none だけ false・エラー文 'okuri none'／'okuri not actual'（適用前）＝issueErrJa と rpcErrJa。**live（今便）**＝ACE（actual）：今日タブ「送り」→ダイアログ「めい：送り代 ¥1,000 を立て替えて退勤（給与から控除）」・注記「…日報の現金支払「送り立替」に載ります」・「確定して退勤」→成功文「めい の退勤を記録しました。送り代 ¥1,000 を立て替えとして記録しました（給与から控除）」→日報の現金支払「送り立替 ¥2,000」（既存 1,000＋1,000）→給与 2026-10 のめいの行「送り −1,000」→マスタ「控除・送り」の当日一覧から取消（2 段）→日報「送り立替 ¥1,000」。LUNA（flat）：今日タブに「送り」の導線が出る（従来は出なかった）・ダイアログ「かれん：送り ¥1,000 は給与から控除します（現金は動きません）」・注記＝定額の説明＝**P 前の差**＝確定すると DB が 'okuri not actual' で止める（打刻は残る・文言「この店の送り方式ではまだ記録できません（0177 の適用前は「実費」の店のみ）」）＝確定は押していない。**P 前のもう 1 つの差**＝okuri_mode キー無しの店（デモ NOIR／LILY＋検査 2 店）は DB の既定どおり flat 扱い＝退勤の導線が出る（P 後の便で NOIR 'none'／LILY 'store' を payload に入れる）。
- **P（0177 適用）後に残る作業**: ①デモ payload（profiles.mjs LILY okuriMode "store"／NOIR "none"・gen-demo の okuri_mode を 4 値で書く）と verify-nox-demo-profiles dpf(1-4)／(2-1) の pin（文言「なし 2（NOIR・LILY 店負担）」→店負担 1／なし 1）・demo_golden は NOX に無い（BANZEN の表）＝対象外 ②DB 段の suite（transport.mode の刻み・set_store_okuri_mode の 4 値・'okuri none'・flat 店で transport_issue が通る＝ao(3-3) の期待を反転）③deduction-panel の OKURI_4WAY_APPLIED を true（4 択の有効化）④店負担の記録＝日報の諸経費に載る live（LILY）・定額の控除だけ live（LUNA）⑤給与右パネル（payroll-board）の「送り」セルは合計のまま＝mode 分けは /mine 明細のみ（必要なら preview に mode 別を足す）⑥一括発行フォームの見出し「前借り／送り実費の一括発行」の語（送りは記録）。
- **verify**＝新 suite verify:nox-s-lane 18（S-5 4・S-6 6・S-4 8＝純関数＋静的 pin・DB 段は skip と明記）・x13g(3) を W-3→S-5 に張替え・ao(1-4)／ao(4-4)／pk(4-2) を 4 方式の語に張替え。**f0**＝128 段 6,200（5,772＋s-lane 18＋張替え）2 連緑 20:08:14〜20:16:01／20:16:48〜20:25:10。★f0 の 1 回目は verify:nox-punch-match pm(9-17) ROLLBACK の残留で赤（単独で緑＝デモの live 操作と同時刻に punches が動いた同時書込み＝検査の作り・コードの変化ではない）→ live を終えてから再走。
- **迷って選んだ所**: S-6 のフリーの重み＝check_set_nominations は active 行の合計 0 を拒むため、フリーだけの名簿では既定分配（均等）をそのまま保ち画面に出さない（本／場内がいれば従来どおりフリー 0）。S-6 の「押すと名簿から外れる（確認なし）」＝課金行が残る本／場内は 0121 の関所を残した（会計行と名簿の不一致を作らない）。S-4 のキー無し店＝DB の coalesce と同じ flat 扱い（UI だけ別の既定を作らない）。S-5 の上段の名前は押せる（顧客の節へ）＝旧行の導線を残した。
- **次の裁定番号＝415**。起票＝「check_set_nominations が created_at を引き継がない（着席ログの時刻）」（0175 行き）。
**便 X13-I 完了（2026-10-21）＝台帳の現在地**: 前提＝HEAD 293c133＝origin（X13-H docs）。DB 恒久変更 0・DB 読取は SELECT のみ（デモ payload の変更のみ）。**コミット**＝6dafc3b（X13-H に I-1／I-3／I-4 を先行・ファイルが重なるため）→0817023（feat: X13-I＝I-5・H-19・H-20・一覧カードの判定期間）→a8eefc3／f48657b（live＝当期の給与が無いと適用・罰金の確定ができなかった→payroll_run_create で作る）＝HEAD f48657b。**I-1 の読取**＝①スタッフの作成＝/api/staff/create（Auth ユーザーを先に作る→staff_create 7 引数）・キャストの「登録（cast_create）→招待（/api/cast/invite）」の 2 段は流用できない（staff は membership＝Auth ユーザーが要る）＝0176・デモの店では「＋ スタッフ登録」を出さない（isDemo）②契約＝staff_contracts（0172・表だけ・書込 RPC なし・区分は employee／parttime／contractor＋時給＋手当＝月給は「雇用・時給 0＋手当」で表す）＝保存は 0176・本便は表示のみ（保存しない契約区分の入力は撤去）③/staff の出勤 0 日＝payload に MUSE／LUNA しか契約と打刻が無かった（reset で消えたのではない）→6 店に追加。**I-2**＝保存先なし＝0176（裁定397 の availability に統合）・画面なし。**I-3**＝精算調整の行がシフトを参照する列＝payroll_adjustments.target_shift_id（shifts.id）・0175 に足す列＝取消済みの状態（今は payroll_adjustment_delete＝行を削除・理由つき audit）・種別（今は理由の文字列「精算調整（遅刻 10/21）」で判定）。**I-4**＝保存先＝attendance（attendance_set_self＝cast×日付で 1 行の upsert・source 'self'）・店の今日タブは既に attendance を読んでいた（連絡としては出していなかった）・0176＝確認済み（ack_at／ack_by）と同日の複数連絡の履歴。**I-5**＝提案は core（collect が penalty_config の 4 軸・採用軸・個別＞プラン既定の目標）→preview→給与の要対応。**H-20 の原因**＝W-1 の ::before ではなく、GV-C（c09b92a）で UserChip のシートを document.body へポータルしたこと＝ダークのトークン（.nox-dark）の外で文字が #171717（暗色）＝空の枠に見えた。elementFromPoint は押せる判定のまま通る＝E-23 だけでは見落とす（表示の色も見る）。**golden**＝影響なし（提案は penalty_config が無い fixture では出ない・行にキーを足すだけ）。**f0**＝0817023 前＝run32（16:54〜17:01）・run33（17:02〜17:09）＝127 段 6,181 の 2 連緑・a8eefc3／f48657b 前＝run34・run35（〜17:37）＝127 段 6,182 の 2 連緑・golden 不変（pay 130・payroll 233・5170／5931／125802）・local build 緑。**6 店 reset**＝17:12（0817023 後）・17:44（live の後始末）。**live（ACE・1,280／390）**: ①小林＝アルバイト・時給 ¥1,400・7 日・56:00・支給見込み ¥78,400（デモ店長＝正社員・月給 ¥300,000）・「＋ スタッフ登録」はデモの店で出ない（登録は確認できず） ②I-2＝0176（画面なし） ③めい／ひなの＝今日タブで「遅刻として記録」→「遅刻の罰金（ひなの・10/21）」既定 ¥2,000→確定（elementFromPoint＝自身）→給与の控除に「精算調整（遅刻 10/21） −¥2,000」が時給と別の行（a8eefc3 前は当期の給与が無く確定できなかった＝NG→修正） ④ひなの（/mine）で遅刻の連絡（見込み 21:30・電車遅延）→「店に届きました」「遅刻の連絡は店に届きました（店の記録待ち）」→今日タブ「連絡 1 件（未確認 1）」・ひなのの行に「遅刻の連絡 17:16・見込み 21:30『電車遅延』」＋記録の 2 ボタン ⑤給与 10 月の要対応＝「ノルマ未達 6 名・提案額 合計 ¥201,000」・せな＝内訳「指名 不足 12 回 × ¥1,000 ＝ ¥12,000」「売上 不足 ¥238,633（¥100,000 ごとに 3）× ¥2,000 ＝ ¥6,000」→適用→「適用済み ¥18,000」・プレビューの控除に別行・合計 ¥183,000／あい＝除外（理由が空なら押せない）→「除外（理由）」（確定はしていない）・H-20＝オーナー／店長／キャスト×1,280／390 で中身が見え（文字色 rgb(244,241,233)）ログアウトを押せる→/login→再入場・H-19＝前借り／送りの主ボタンが枠内・elementFromPoint＝自身（390 で 44px・メモ全幅）・一覧カード／詳細＝「月次・前月の累計で判定」「前月売上 ¥807,083（按分後）→ 1 段」（せな）。live の取消＝reset（精算調整は給与画面の「削除」でも消せる）。**要判断**＝①X13-H と同じコミットに I-1／I-3／I-4 を先行 ②雇用の就業規則チェックは保存先が無い（白名単外）＝常に「定めなし」＝雇用の提案は出ず案内だけ（0175／0176）③除外の理由は画面の中だけ（audit は 0175）④スタッフの登録はデモの店で出ない ⑤E-23 に「表示の色（中身が見えること）」を足す（H-20）。
**便 X13-H 完了（2026-10-21）＝台帳の現在地**: 前提＝HEAD abdbd5a＝origin（v49 収蔵）。DB 恒久変更 0・DB 読取は SELECT のみ（デモ payload の変更のみ）。**コミット**＝6dafc3b（fix: X13-H＋X13-I の先行分 I-1／I-3／I-4）。**H-9 の全箇所**＝「-31」固定 2（dashboard-board:104・month-report:97＝30 日の月で 22008→0 件）＋翌月 0 日（翌月 1 日）の組み立て 18（analytics-board／comp-sections（ym でなく今月の日数を使っていた）／referrers-board／payroll-board／shift-add-form 2／shift-board 2／staff-shift-board／current-wage／dateshift 2／wish-calendar／settlement／slide 2／window／staff/pay）＋report-board の monthAfter・DailyPayForm の翌月＝lib/nox/month（daysInMonthOf／monthLastDayOf／monthAfterOf／monthRangeOf）。**H-8 の読取**＝計算（collect.ts の applyOf）＝プランの comp_plans.slide_apply→null なら店の settings_json.slide_apply（26／27 プランが null＝店の値に依存）・表示（currentWageOf）＝プレビューの slideBasis.apply を見ていたが core が月次／半月で 'monthly'／'half' に書き換えるため常に「当期の累計」・シミュレーター／段の注記＝店の値だけ。**直した形**＝計算・表示ともプランの slide_apply だけ（null＝当期の累計・店の値は読まない）・詳細設定の「店の設定に従う」を撤去・初期設定の新規プラン＝前期の実績・保存先はプラン（0175 不要）。**H-11**＝casts.joined_on・set_cast_profile（既存・audit）・cast_create は本入店日を持たない＝登録の直後に set_cast_profile。**golden**＝影響なし（DB に店＝next の店が無く fixture も店の値を使わない）。**H-7 の 6 店**＝MUSE 売上（新）／LUNA 売上／NOIR pt／ACE 売上／LILY 売上／NEST 売上・往復で sys_* 不変（SELECT）。**f0**＝run28（15:46）は H-14 の追加で中止・run30（16:08〜16:17）・run31（16:20〜16:27）＝126 段 6,170 の 2 連緑・golden 不変（pay 130・payroll 233・5170／5931／125802）・local build 緑。**6 店 reset**＝16:31。**live（ACE オーナー／ひなの・1,280／390）**: ①月報 2026-09（30 日）＝売上 ¥9,236,403・25 日・前年同月比「—」（エラーなし）・2026-11 は未来で選べない（ダッシュボードは当月固定＝suite の本物の Postgres で確認） ②/mine ひなの＝「売上段・月次・前月の累計で判定」「前月売上 ¥1,295,563（按分後）→ 2 段」＝給与（10 月）の「9月 基準 売上 ¥1,295,563」と一致・**NG**＝一覧カード／詳細は「日次・当日までの累計」＝casts-board の loadPlans が select した slide_period を詰めていなかった（裁定374 から）→修正は X13-I のコミット ③利用機能 ACE＝軸 売上・バック ON・売上スライド ON（pt は個別設定 6 名で切替不可）・MUSE 売上・NOIR pt・売上歩合の行なし・sys_* 不変 ④登録モーダル＝入店日*（既定 2026-10-21）・あい＝本入店日 2026-05-22＋編集・るな＝「—」 ⑤VIP-1 カード＝「カードでのお支払額 ¥76,811（残額 ¥69,828＋手数料 ¥6,983）」・2 分割＝「1 人分 ¥38,406（手数料込み）」・現金で消える・390 で枠内（入金はしていない） ⑥閾値パネルの「ひな形を開く」（48px・elementFromPoint＝自身）→報酬制度の精算調整のひな形へ・遅刻 ¥2,000／当欠 ¥5,000・早退は選べない・「既定の 2 件に戻す」 ⑦在庫＝マイナス 0・在庫少 1（黒霧島 2） ⑧S様＝「詳細・編集を開く」48px・中央（ずれ 0・1,280／390）・顧客詳細へ。**要判断**＝①ひな形は「店舗設定」でなく「報酬制度」画面＝文言は実際の場所で書いた ②計算の sys_sales_rate（売上歩合の表）は読んだまま ③X13-I の I-1／I-3／I-4 を同じコミットに先行（ファイルが重なるため）④LILY は在庫少 0 品 ⑤日払い・精算調整の取消 RPC が無い＝live の取消は reset。
**便 X13-G 完了（目視 X-13・2026-10-21）＝台帳の現在地**: 前提＝HEAD f4fef1f＝origin。DB 恒久変更 0・DB 読取は SELECT のみ・migration の起草なし（デモ payload の変更のみ）。**コミット**＝2c7dc3a（W-1〜W-19）→ed182b4（W-22／W-23／W-13 差し替え／W-18 ⑦）→6645f18（W-24・W-25 ①・live 修正 4 件＝顧客名の「様様」・料金マスタに settings_json・待遇プランの短いタブ名・デモ店設定の中の ID 写像）→821dbbf（live ㉓ 修正＝DailyPayForm の受け順と月末・/mine の指名予約「M様 様」）。**W-1 の原因**＝暗幕（.nox-modal-overlay）の -webkit-backdrop-filter の子孫として transform 付きのカードが合成され、iOS Safari でぼかしの下に入る（推定・iOS 実機は未再現）→ぼかしを暗幕の擬似要素へ・カードは z-index 1・背面スクロール停止。GV-C は位置（y 591–812）だけで判定し押せるかを見なかった＝E-23 を新設。**W-25 ②（停止・報告）**＝ACE A1 の ¥34,092→¥34,402＝check_pay（0173 l.2535）が手数料行を tax_category 'taxable_10' で挿入→check_group_due の外税の分岐で bx10（10% の課税対象）に入り ¥310 の税（サ料の母数からは除外）＝30,993＋3,099＋310。393 追補3（手数料は税込扱い・消費税を乗せない）と食い違い。client からは直せない（check_group_due は内部専用・受取額は check_pay がサーバで決める）＝0175 で check_pay／check_group_due の修正が要る。**f0**＝2c7dc3a／ed182b4 は前段で 2 連緑・6645f18 前＝run22（13:54〜14:01）・run23（14:04〜14:11）＝125 段 6,147 の 2 連緑・821dbbf 前＝run24 緑→run25 赤（0158(6-9)＝punch_self の out が空で transport_issue_self(null)＝invalid_input・時刻依存・単独再走は緑・本便の変更とは無関係）→run26（14:41〜14:49）・run27（14:53〜15:00）＝125 段 6,148 の 2 連緑・golden 不変（pay 130・payroll 233・5170／5931／125802）・local build 緑。**6 店 reset**＝2026-10-21 14:15 頃（6645f18 後）・15:12（㉓ で発行した日払いを消す＝日払いの取消 RPC が無いため）＝q1019_d1_reset.mts・6 店とも wipe+load ok・payroll finalized・15:12 後の ACE daily_pays 0 行（SELECT）。**live（本番・デモ ACE オーナー／NOIR オーナー／ACE キャスト・390／1,280）**: ㉓日報の締め（ACE・10/21）＝内訳の日払い「＋ 発行」→ひなの 日払い（日次精算）¥10,000＝源泉 ¥510・手取り ¥9,490→内訳・現金支払（読取専用＝入力しても 9,490 のまま）・予定額 ¥50,000→¥40,510 が同時に変わる・金額を押すと「ひなの ¥9,490」・390px で各行 1 行／横スクロール 0・★キャスト詳細の「発行済み（今月）」が空＝DailyPayForm の Promise.all の受け順が逆（起票93 から）→821dbbf で修正（再確認＝「2026-10-21 ¥10,000・源泉 ¥510・手取り ¥9,490・日次精算」が出る）・日払いの取消 RPC は無い＝デモは reset で戻す ㉔A1 でカード＝既定 ¥34,092・「うち 残額への充当 ¥30,993／カード手数料 ¥3,099」・入金ボタン ¥34,092（elementFromPoint＝ボタン自身）・2 分割＝¥17,046（充当 ¥15,496／手数料 ¥1,550）・現金は従来どおり（入金はしていない） ⑫待遇プラン 390＝6 タブとも 1 行（「ノルマ・ボーナス」） ⑰b お客様への加算＝有効 10% を表示・保存→再読込で保持 ⑱るな（体入）＝「本採用（ACE Sales Slide）」＝既定プランを認識（押していない） ②NOIR VIP-3 の開卓→お客様を選ぶ→候補の行＝elementFromPoint で行自身・選ぶと「A様」（やめるで閉じた＝開卓していない） ③伝票のお客様の行＝reset 後の伝票に顧客なし＝suite（H様＋K様→「H様 ほか 1 名」）で係留・/mine の指名予約で「M様 様」を発見→修正。**前段の live（2c7dc3a／ed182b4 後・ACE）**＝①ログアウト＝elementFromPoint でボタン自身（Chromium）→再ログイン可 ②お客様シート＝候補／全員／新規のみ ④担当中に本指名チップ・他タブは着卓中 ⑤〜⑧⑩ OK ⑪今日タブ 390／1,280＝出勤で勤怠記録 ⑬待遇プランのパンくず「報酬設定」 ⑭VIP 1 名 ¥15,840／2 名 ¥31,680 ⑮12,000→2,400→1,440→15,840・入金の内訳 税抜 14,400／消費税 1,440 ⑯ OK ⑰a 日報集計用カード手数料 10 保存・c 税設定の保存 ⑱インボイス未登録・ひなの 10 月 ¥3,500×88.2h・9 月 7 名 ¥1,966,155 不変・領収書 R-000001→R-000002 ⑲/mine 390／1,280 ⑳MUSE さおり「確認待ち 2→3 日」 ㉑キャストの打刻＝使わないで /mine は 1 行・kiosk にキャストなし→使うへ戻した ㉒OFF の店は「使用中 7 名」のガードで live 切替できず。**残**＝dashboard-board:104／month-report:97 の「-31」lte（30 日の月でエラー→0 件）＝別便・W-25 ②の税は 0175。
**P-2 pg_stat_activity（17:06・SELECT のみ・max_connections 90）**＝PostgREST（authenticator）idle 10（再起動直後から・最長 idle 38 分）／Storage API idle 3／pgbouncer idle 2・Supavisor（auth_query）idle 1・Supavisor（postgres）active 1／pg_cron 1・postgres_exporter 1・supabase_auth_admin 1・pg_net 1＝再起動前の idle 15（最長 2 日）は PostgREST のプールと同じ形の可能性が高い（持ち主は消滅＝確証なし）。
**ゲート候補（便 P174 P-3）**＝テスト店舗の印（org に test フラグ）を付け、golden・本番点検の対象から外す（CLUB NOX＝org NOX-DEMO・is_demo=false＝Agoora のテスト店舗）。
**0175 の対象（便 X13-H／X13-I 追記・v49 §3-3 に加える）**: ①H-1＝check_pay と check_group_due（カード手数料に消費税を乗せない・393 追補3）②裁定410＝精算調整の行の元記録の参照列（今は payroll_adjustments.target_shift_id＝shifts の id だけ）＋取消（取消済みの状態列 cancelled_at／cancelled_by と取消 RPC）・種別の列（遅刻／当欠／ノルマ未達＝今は reason の文字列で判定）③判定タイミングの保存先＝不要（comp_plans.slide_apply が既にある・H-8 で店の slide_apply を読まなくした）④本入店日の RPC＝不要（set_cast_profile が既にある）⑤W-24 のメモの列化（候補）。
**0176 の対象（便 X13-H／X13-I）**: ①I-1 スタッフ＝登録→招待の 2 段（今は /api/staff/create が Auth ユーザーを先に作る＝キャストの cast_create→/api/cast/invite と同じ形にするには staff 行を Auth なしで作る器が要る）・契約の書込 RPC（staff_contracts は 0172 で表だけ・月給／日給の区分列も無い＝今は雇用の時給 0＋手当で月給を表す）②I-2 基本の働き方（裁定413）＝保存先なし＝裁定397 の availability（0175 予定）に「固定休（曜日）・基本の時間帯・週の出勤日数の目安・適用開始日・雇用は本人編集不可」を足す形で統合し、変更通知（notices）も同じ RPC で③I-4 遅刻・当欠の連絡＝確認済みの列（ack_at／ack_by）と同日の複数連絡の履歴（今は attendance の 1 行 upsert）。
**0175／0176 の追記（便 X13-I）**: ④I-5 就業規則チェック＝店設定キー sanction_work_rule（set_store_profile の白名単・初回のみ・audit）⑤I-5 除外の理由の audit＝提案の除外を記録する RPC（今は画面の中だけ）⑥I-3 精算調整の取消済みの状態（今は payroll_adjustment_delete＝行を削除・理由つき audit）。
**0177（便 S・裁定414）**: 送りの 4 方式＝transport.mode 列（既定 'actual'）・set_store_okuri_mode の受理値 4 つ・transport_issue／bulk／self／kiosk は 'none' だけ拒否し mode を刻む・okuri_default_of は 'none' 以外で聞く。起草＝Downloads/0177_okuri_mode_4way_draft.sql（321 行・21,952 B・sha16 e22bfcc3eb93625c・mig-check OK plpgsql 5／sql 1・生成器 docs/tmp/gen_0177.mjs）・手貼り待ち。**0175 行き（便 S 起票）**: check_set_nominations が旧行の created_at を引き継がない（全置換＝着席ログの時刻が保存の時刻になる）。
**X13-I の要判断の裁定（2026-10-22 確定・相談役・便 SH-UI-a A-0）**: ①I-1／I-3／I-4 の X13-H 同乗（同じコミット）は可（注記で足りる）②雇用の就業規則チェックの保存先＝店設定キー **sys_wage_cut_rule**（便 SH-UI-a A-1 で client・白名単は 0175）③除外理由の audit＝0175 ④精算調整の取消済み状態と種別列＝0175 ⑤日払いの取消 RPC＝0175 ⑥遅刻・当欠の連絡の確認済みと履歴＝0176 ⑦デモの店でスタッフ登録を出さないのは正 ⑧check_set_nominations の着席ログ created_at（便 S 起票）＝0175 行き。
**0175／0176／0177 の対象一覧（便 SH-UI-a A-0・2026-10-22・適用の順＝P175→P176→P177）**:
- **0175**（起草前）: ①H-1 check_pay／check_group_due＝カード手数料に消費税を乗せない（393 追補3）②裁定410 精算調整＝元記録の参照列・取消済みの状態列（cancelled_at／cancelled_by）と取消 RPC・種別の列（遅刻／当欠／ノルマ未達）③裁定397 availability（膳＝membership 単位・曜日 × 3 値＋時間帯）＋**裁定413 追補1 の列（週の出勤日数の目安・適用開始日）**④売上／pt の段の移行（売上の段あり→sales・pt の段→point・無し→none）と P175 client ⑤裁定405 ポイント制（pt 付与ルール＝comp_plans +4 列・起票106 統合）⑥I-5 除外の理由の audit（提案の除外を記録する RPC）⑦日払いの取消 RPC ⑧I-5 就業規則チェックの白名単＝set_store_profile の v_keys に **sys_wage_cut_rule**（便 SH-UI-a A-1）⑨check_set_nominations＝旧行の created_at を引き継ぐ（着席ログの時刻・便 S 起票）⑩W-24 その他の現金支払のメモの列化（候補）。
- **0176**（起草前）: ①I-1 スタッフ＝登録→招待の 2 段（staff 行を Auth なしで作る器）・契約の書込 RPC（staff_contracts の月給／日給の区分列）②I-4 遅刻・当欠の連絡＝確認済みの列（ack_at／ack_by）と同日の複数連絡の履歴 ③I-3 精算調整の取消済みの状態（0175 ② と同じ器＝0175 に寄せる）。
- **0177**（起草済み・手貼り待ち）: 裁定414 送りの 4 方式＝transport.mode・set_store_okuri_mode 4 値・RPC 4 本・okuri_default_of（Downloads/0177_okuri_mode_4way_draft.sql・321 行・sha16 e22bfcc3eb93625c・mig-check OK）。P 後＝payload LILY 'store'／NOIR 'none'・demo-profiles pin・DB 段の suite・設定 4 択の有効化。
**規約 v1.0 の弁護士レビュー論点（追記・便 X13-I）**: 雇用キャストのノルマ未達減給（懲戒減給として労基法 91 条の上限内・就業規則に減給の定めがある場合のみ・平均賃金の算定・本人への通知と明細の表示）。
**初期設定の正本＝v4（2026-10-19・相談役）**: https://claude.ai/artifact/PtWVBE3iFfek3GZHyrAwRu（裁定331 v5＝nox-setup-v5.html を置き換え）。9 段（お店→席・卓→料金→メニュー→キャスト待遇→スタッフ→シフト・勤怠→会計・レジ→確認）＋完了後のキャスト登録（1 人ずつ／CSV・PIN 自動採番・招待）。1 店舗目は「どのお店の設定ですか」を出さない（会社に既存店があるときだけ・コピー元と内容を選ぶ）。キャストのマイページ表示項目（給与明細の範囲・ノルマ進捗・ランキング・ドリンク申告〈既定 OFF〉・打刻修正申請・遅刻当欠の連絡・予約申請・出勤ボーナス）・最初のシフト期間・店の端末登録・釣銭準備金・PIN。DB の器は 0175／0176 に依存・本番化＝OB 便（0175・0176 の後）。repo の mock/onboarding-2026-08 を v4 の HTML で置き換える（artifact の HTML は Agoora がダウンロードして渡すまで保留）。395 追補2・407 追補1 の参照モックと同じ URL。
【事故】**10/17〜19 の 06:05 無人 reset が 3 日連続で load 失敗**（0172／0173 の NOT NULL 列 pricing_rules.is_default_ext／cast_tax_profiles.dependents_form／checks.set_frozen／daily_pays.kind（LILY）が本番デプロイ済み payload（HEAD 57d9737 の docs/demo/payload）に無く、jsonb_populate_recordset が既定値を使わない）。wipe のみ成功（runDemoReset の wipe→load 分割で wipe は別トランザクション）＝**デモ 6 店が空**（comp_plans／casts／checks すべて 0）。cron.job_run_details は 3 日とも succeeded（'1 row'＝pg_net の要求が出ただけ）・net._http_response は 200 で本文 {"ok":false,…,"error":"reset failed"}・audit は demo.reset（mode wipe）のみ＝気づかず。空だった期間＝**10/17 06:05（MUSE の wipe）〜10/19 10:46**（各店は自店の 06:05〜06:15 から）。発見＝f0 run1（10:20 起動）の 98 段目 comp-list「NOX-DEMO-MUSE の comp_plans ≥1」赤。
**D-1（復旧・Agoora 判断＝選択肢 1）**＝作業ツリーの buildPayload／runDemoReset／afterResetHooks を tsx（docs/tmp/q1019_d1_reset.mts・admin client）で 6 店に 1 回。対象＝orgs.is_demo かつ name ∈ NOX-DEMO-{MUSE,LUNA,NOIR,ACE,LILY,NEST} を実行前に列挙（CLUB NOX＝org NOX-DEMO・is_demo=false は対象外）・DEMO_USERS（Vercel env）の代わりに users のメール（demo-<店>-<役割>）と auth のキオスクユーザーから店:役割→auth user id を組む（30/30・プロセス内のみ）・dry-run（rows 2,396〜5,067）→ --apply 10:46:15〜10:47:00＝6 店とも ok（wipe+load・chunks 3／3／4／3／4／4・5.0〜11.6 秒・写真の再打刻・先月の給与確定 finalized）。SELECT 確認＝demo_reset_at 6 店とも 10-19 10:46・comp_plans／casts／checks＝ACE 2／7／485・LILY 3／6／594・LUNA 4／7／462・MUSE 3／5／281・NEST 3／5／507・NOIR 4／8／506・audit demo.reset＝各店 wipe 1＋load 3〜4（chunks と一致）。payload の NOT NULL 欠落検査（live information_schema と突合・docs/tmp/q1019_nn.mjs）＝作業ツリー 6 店とも欠落 0／HEAD は上の 3〜4 列。
**D-2（CLUB NOX の無傷・SELECT のみ）**＝非デモ org は 1（NOX-DEMO＝店舗 CLUB NOX）・reset 前後とも全表 3,260 行・差のある表 0（docs/tmp/q1019_club_before／after.json）・10/17 06:05 以降の変更＝10/17 16:29〜16:30 のオーナー操作 check_set_nominations 12 件（audit）のみ・demo_org_reset 冒頭の 'not demo' ガードあり・10/17 以降の demo.reset の audit はデモ 6 org のみ。
**f0**＝run1（10:20・中断扱い＝98 段赤＝上の事故）→D-1→run1b（10:47・121／122・p173(8-1) の「適用時点のデータ行 2」が reset で変わる＝8-1 から外し 8-2 で非デモ org に絞る）→T-2／GV-62 の実装→**run1（11:22）974 秒・run2（11:41・180 秒冷却後）968 秒＝122 段 2 連緑**（括弧内の件数の合計 5,851・玲奈 5931／125802・payroll 233）→GV-63→**run3 1,194 秒・run4 1,267 秒＝122 段 2 連緑（5,854）**→nav 修正→run5（13:13・121／122＝p173 8-1 がデータ行で赤＝live 確認で入れた ACE の会計前キープ・NOIR の既定の延長＝E-21）→8-1 を構造 25 行に限る→**run7 1,710 秒・run8 1,567 秒＝122 段 2 連緑（5,855・玲奈 5931／125802・payroll 233）**。
**コミット（すべて push 済）**＝ebcdf26「feat: 達成ボーナス多段（起票110・裁定404 max）＝thresholds を {pct, amount} に一本化」・f277ee8「feat: 0173 client（385／386／389／391／392／393）＋payload」・67c481c「fix: GV-62 今日タブの出勤記録 5 択＝カード表示なら幅に関係なくチップ」・b442c3e「fix: GV-63 キャスト・報酬の上段タブと下段タブの分離」・6896939「fix: GV-63 追補＝下段の ?tab で上段の選択が外れる・p173 の live を構造の行に限る」＝**HEAD 6896939＝origin/main（0 0）**。T-2 を先にしたのは p173 suite と payload が BONUS_TIERS を参照するため（各コミット単体で整合）。デプロイ後の手動 reset はしていない（ACE は 10:46 にデプロイ版と同じ payload で投入済み・LILY の旧形 {pct} は後方互換で読める）。
**pin 張替え（旧→新→理由）**: 0158＝s-2 set_store_profile md5 67e96c04→45012c75（0173 白名単 +5 キー）・s-2b cast_sales_aggregate e232dac8→34a0bf1e（393 手数料行を除外）・s-2f check_close 69cf2a19→f94dc8c3（392 会計で pending→active）・s-2h set_comp_plan 4fa34575→21afb3f5（0174 30 引数・p_slide_apply）・s-2i comp_plans 列 32→33（slide_apply）・t-1 関数 311→314／表 87 不変／billing locked 159→160／billing＝段47-1 正本 対象 159→160（A1 +check_set_ext_rule）・除外 152→154（B(c) +staff_punch・B(d) +kiosk_staff_list）・live gated 159→160・述語参照 160→161・挿入行の形 159→160・段47-3 kiosk 腕 19→20（check_set_ext_rule）／grants＝関数 311→314（0173／0174）／anon-guard＝+3 段（check_set_ext_rule・kiosk_staff_list・staff_punch＝BLOCKED）／store-systems＝ss(4-0) 白名単 36→41 キー（join_mode／cast_register_device／pay_fee_rates／trial_guarantee_days／default_plan_id）／customers-keep＝ck(5-1) c_wipe 79→83・c_load 78→82（0174 +4 表）／demo-reset＝dr(0-2) 投入順 78→82 表（memberships の直後に staff 3 表＋terms_acceptances）／master-top＝store-profile の pin に isOwner（389 レジ使用・操作端末は owner）・GV-63 で上段名「ノルマ」→「ノルマ設定（店）」（mt(1-3)・mt(2-2)）・+mt(2-5)（下段の ?tab を上段の解決に使わない）／nav＝上段名「ノルマ」→「ノルマ設定（店）」（GV-63）／register-customer＝rc(1) 368 の pin に p_keep: isBottle（392 ボトル＝会計前キープ）／pricing-resolve-category＝区分検査の fixture を extension→set（0173 の 1 店 3 本上限 'too many extension' が区分検査より先に効く）・prc(p1) set_pricing_rule 16→17 引数／reopen＝ro(3b-4) v_chk 版 perform 17→18・ro(3b-6) assert_day_open 呼出 18→19（check_set_ext_rule）／set-people＝段54(7)(8) set 行は凍結（qty 2／10000 のまま）＋合流セット行 1（386）・総額保存則は Σ(time_auto 行＋合流セット行)／p172＝p172(7-1) 反転（0174 で kiosk_staff_list／staff_punch・c_load に 4 表）・set_store_profile md5 45012c75・p172(6-4) 関数 314／'billing locked' 160／pay＝T2-1〜8 追加（122→130 assertions）・C96 の fixture を {pct, amount}／payroll・setup＝fixture を {pct, amount}（値同じ）／p173（新設・f0 122 段目）＝(1)〜(10)＋live 8-1／8-2（45 checks）。
**T-2（起票110＝達成ボーナス多段・裁定404）**＝lib/nox/bonus-tiers.ts（純関数・{pct, amount}・旧形 {pct}／{pct, add} は amount＝コンポーネントの amount・mode max（既定）／sum）・pay.ts は全段を読み max 固定・待遇プランの達成ボーナス＝段の追加／削除（1〜10 段・昇順検査）・売上の軸 OFF の注記・試算に components とプラン既定の売上目標＋達成ボーナス行・初期設定テンプレ／gen-demo（profiles.mjs BONUS_TIERS）は {pct, amount}・payload は LILY の comp_plan_components のみ変化（値不変）。golden で動いた行 0（玲奈 5931／125802・payroll 233 不変・pay は T2 の 8 本を追加）。★試算に最低保証（guarantee_min）も載るようになった（確定と同じ payOf の入力）。
**GV-62**＝x13 #76 済（67c481c）。**GV-63**＝x13 #77 済（b442c3e）＋live で見つけた取りこぼし（下段の ?tab=quota 等で上段が選択表示にならない＝resolveMasterNav が ?tab を上段のタブ指定と取り違え）を ⑤ で修正（入口のタブが ?tab を使っていない報酬設定では URL の ?tab を上段の解決に使わない・pricing／store-profile は従来どおり）。
**live（本番 nox-kappa-eight.vercel.app・デモ ACE オーナー 390px・b442c3e のデプロイ後・12:47〜13:0x）**: ①延長パターン選択＝料金マスタの「延長パターン n/3」節と既定ラジオ（NOIR で「既定を『通常メイン 延長』にしました」）は OK／レジの複数パターン選択は**未確認**（ACE・NOIR とも 1 伝票に当たる延長は 1 本＝表示条件 2 件以上に当たらない）／②合流セット行＝**未確認**（セット終了後の人数追加が要る・開いている伝票は着席 19:00 以降で残り 60 分）＝suite（set-people 段54・p173）で代替／③明細の並び順と小計 2 行＝OK（A1・A2：セット→本指名→商品・「セット・延長・指名」「商品」の 2 行）／④カード入金の手数料行＝モーダル「カード手数料 10%（お客様負担）¥3,099・お客様からもらう額 ¥34,092」・入金後に伝票行（charge・pay_fee・¥3,099）OK・★**ただし受取額は ¥34,402＝モーダルより ¥310 多い**（ACE は外税・サ料 20%＝サーバの check_group_due は手数料をサ料の母数から外し税の母数には含める→手数料に消費税 10% が乗る／モーダルは残額＋手数料で税を見込まない）＝**相談役判断待ち**（手数料に税を乗せるか・モーダルを税込み表示にするか）・ACE の pay_fee_rates は live 確認のため card 10 を設定（デモ・06:05 に初期化）／⑤キープ→顧客詳細の会計前＝OK（A2 に吉四六→368 の自動モーダル→K様→「キープ済み」・bottle_keeps.status pending・K様の詳細「1本（うち会計前 1）」・吉四六 会計前）／⑥るなが体入タブ＝**NG**（DB の casts.kind はるな＝体入で正しい・体入タブは trials 表を表示＝裁定396 の client「体入タブは在籍区分で絞る」は EX-1 で未実装＝GV-C／EX-1 へ）。**R-12**＝未実施（キオスク打刻にキャストの PIN 入力が要る＝本番ホストで CC は資格情報を入力しない→Agoora の打刻待ち・打刻後のホーム反映は CC が SELECT と画面で確認可）。**GV-62 実測**＝/shift 今日タブ・390／768／1,000／1,100px＝カード表示（tr grid・thead none）で 5 択チップ 5 個（各 52×36・丸枠 999px・枠 1px・gap 6px）・elementFromPoint で 5 個とも個別に当たる／1,280px＝表表示（tr table-row）で従来の連結 .nox-seg（変更なし）。★1,280px の表表示では「同伴」「休み」の中心が行の余白／右隣の「送り」に当たる（5 択の右端 2 つが隣と重なる）＝GV-62 の対象外（表表示は現状維持）・**相談役判断待ち**。
**ゲート**＝Supabase＝**Pro 組織 Agoora-ABE へ移転（10/16 夜）・compute Small（10/19 16:30・Agoora が変更＋再起動＝★10/16 の「Small 済み」の記録は誤り＝実際は Nano のままだった・便 P174 で訂正）・日次バックアップ 7 日・PITR は未**。
**裁定の欠番**＝台帳に裁定398〜403 の本文なし（教訓70＝番号は台帳の見出し）＝相談役に確認。→**便 D-173 で 398〜401 を【案・BZ-R 後に確定】で記入・407／408 確定**（402／403／406 は本文なし＝未記入）。本便で記入＝裁定404・405・393 追補2・教訓116（作業ツリーで先行記入済み）・E-20 候補・起票115 格上げ・起票116 追記・起票117 新設。次＝P174（相談役）・0175 起草（397＋404＋393 追補2＋405＋起票117）。

**教訓候補 E-8〜E-17（整列・便 V46 V-2・2026-10-16・採番は相談役＝v46 §3「E-16・E-17 を優先」で先頭に）**:
- E-16「JSX の `{/* */}` コメントは三項演算子・`&&` の括弧の内側（`</button>` の直後）に置けない＝`)}` の外へ（便 GV-B で 2 回・N1014 でも 1 回）」（docs/tmp/gvb_decisions.md 逐語）。
- E-17「ブロックの裁定番号に本文が無いとき（GV-B の 379）は見出しを作らず報告で返す（教訓70 の運用）」（同上）。
- E-8「文字列 pin の『不在』判定は対象ブロックの範囲で行う（`!rb.includes(">やめる</button>")` は他ダイアログの『やめる』で偽になる＝便 N1014 nd(1-2)）」（上の候補段落の逐語）。
- E-9「anon-guard の statement timeout は再走で消える既知のフレーク（便 N1014 f0 run1＝段28-18→28-21／22 連鎖）＝★f0フレーク=statement timeout型は再実行」（同上・起票116 で観察中）。
- E-10「教訓110 の grep は『変えた文字列』だけでなく『変えたファイルを読む suite』を対象にする（便 N1014 f0 run1c＝messages ms(2-11) が shift-board の呼び出し順を indexOf で pin→A-6 の分岐追加で順が入れ替わり赤→lastIndexOf に張替え）」（同上）。
- E-11「suite の before／after スナップショットは fixture org に絞る（全体件数は、デモ org の実利用が並走すると偽赤＝便 N1014 f0 run1d の contract-ack ca(0-2)＝18:39 に LUNA デモで check_add_line が走っていた→audit_logs の count を org_id で絞った）」（同上）。
- E-12「payload に相対日の行を足すときは元データとの unique（shifts／attendance＝cast_id×date・punches）を生成器で先に落とす（便 N1014 19:30 の reset で 4 店が最終 chunk の unique 違反＝wipe 後に途中まで載った状態・route の markFailed の audit 行は残っていない）」（同上・起票115）。
- E-13「payload の相対日 $rel は営業日＝深夜（02:00）の退勤は in と同じ $rel に載せる（d+1 だと 1 日遅れ＝退勤なし・便 N1014 NEST レン）」（同上）。
- E-14「supabase-js の .eq(存在しない列) は黙って空＝列名は型か suite で縛る」（docs/tmp/n1014_decisions.md 逐語・live 修正 56a5a25＝今日タブの「送り済」判定の transport 列名 biz_date）。
- E-15「共有クラス（.nox-2col／.nox-dtabs／cardrows）の既定を変えず修飾子クラスで足す＝他画面の pin と目視を壊さない」（docs/tmp/gva_decisions.md 逐語・便 GV-A）。
- E-6 は候補のまま（教訓114 と同趣旨＝相談役の判断）。
- E-18「migration 後の f0 は、走らせる前に pin 系・走査型の suite を単独で一括洗いしてから回す（P172 で取り直し 5 回）」（相談役起草・便 HF-1 H-5・2026-10-16）→**教訓115 で採番（便 M173 M-0）**。
- E-19「migration は手貼り前に libpg_query＋ローカル Postgres（BEGIN…ROLLBACK）で構文検査する＝scripts/mig-check.mjs・docs/dp/mig_check.md（0173 の初回手貼りで 42601＝行の途中のコメントが values 句の残りを消した）」（相談役起草・便 M173-fix・2026-10-16）→**教訓116 で採番（便 P173 Q-0）**。
- E-20「NOT NULL 列を足す migration は、同じ便でデモ payload を更新してデプロイするまで手貼りしない（または demo_org_reset の load を既定値で補う＝起票117）」（相談役起草・便 P173・2026-10-19＝10/17〜19 の無人 reset が 3 日連続 load 失敗・デモ 6 店が空）。
- E-21「verify suite で live デモ org の可変データ（キープ・延長既定など）を不変条件として assert しない。mig 直後の状態確認は非デモ org か検査用 org に限る（P173 で p173 8-1 が 2 回赤）」（相談役起草・便 P173・2026-10-19＝1 回目は D-1 の reset で ACE slide_apply next／LILY の thresholds 旧形、2 回目は live 確認で ACE の会計前キープ／NOIR の既定の延長＝8-1 からデータ 6 行を外し 8-2 は非デモ org の thresholds の形だけ）。
- E-22「verify suite の ROLLBACK 後 snapshot を DB 全体の件数で取ると、f0 中のデモ操作で赤になる（2026-10-19 17:44 CLUB NOIR・customers-keep ck(0-2)）＝snapshot は検証用 org に限る／f0 中はデモを触らない」（便 GV-C・候補）
- E-23「シート・ダイアログ・ボタンの live 確認は、表示や位置でなく、主ボタンの中心で document.elementFromPoint がそのボタン自身を返すこと（押せること）で判定する」（便 X13-G W-20・GV-C で live ⑮ を位置 y 591–812 だけで OK とし、iOS で押せないことを見落とした）
- E-23 追補1（2026-10-22 確定・相談役・便 SH-UI-a A-0）「live の判定は『主ボタン中心の elementFromPoint がそのボタン自身』＋『中身が見える（文字色と背景のコントラスト比 3 以上・opacity>0・visibility visible）』の両方」（H-20＝GV-C で body 直下に描いたポータルが .nox-dark の外に出て黒地に黒文字＝位置は合っていたが見えなかった）

## 裁定320（本便で確定・Agoora・2026-09-29）領収書の分割発行 UI

出典＝Agoora 指示（2026-09-29・便 X-10-1 で収載）。次の裁定番号は 321。**本文（逐語）**:
「裁定320 領収書の分割発行 UI＝『分割して発行』→行（金額・宛名・但し書き）・2 行目は自動残額・『行を追加』・合計＝総額で『n 枚を発行』活性→順に発行→R-番号と QR を並べて表示。『取消して分け直す』後はこの UI を既定で開く」

適用＝便 X-10-2（2026-09-29・client のみ・DB 恒久変更 0・RPC 追加 0）: register-board の会計完了シート「領収書発行」に「分割して発行」。行＝金額・宛名・但し書き。最後の行の金額は自動残額（残額 − 他の行の合計・入力不可）＝合計は常に残額に一致し、他の行が正の整数かつ自動残額 > 0 のとき「n 枚を発行」が活性。「行を追加」は自動残額の行の手前に足す（3 枚以上）。
発行＝既存 receipt_issue を 1 枚ずつ順に（Σ ≤ 伝票総額のガード・採番・QR は RPC のまま）。失敗はその行で停止し、発行済みは残す（未発行の行が 2 行以上なら分割欄に残す・1 行なら通常の発行欄＝空欄で残額）。発行後は R-番号／金額／宛名 → QR（各 240px・タップで全画面）→ URL コピー／印刷 を枚数ぶん並べる（便 X-8-8 の表示）。
「取消して分け直す」（便 X-8-9）が成功したら、この分割 UI を 2 行で開く。


## 裁定321（本便で確定・Agoora・2026-09-29）レジ顧客カードの「新規登録して追加」

出典＝Agoora 指示（2026-09-29・便 X-11-1 で収載）。**本文（逐語）**:
「裁定321 レジ顧客カードに『新規登録して追加』＝名前必須・ふりがな・電話任意→customer_register→check_customer_add で伝票に付ける。権限はレジ操作可の role。詳細は /customers で後編集」

適用＝便 X-11-2／X-11-2b／X-11-3（2026-09-29・client のみ・DB 恒久変更 0・RPC 追加 0）: components/nox/check-customers-card.tsx。
- 「新規登録して追加」→ インライン入力（名前必須 1〜80 字・ふりがな・電話）→ customer_register → 戻りの id で check_customer_add → 「○○ を登録して付けました」。登録は通ったが追加に失敗したときはその旨を出す。kiosk レジは対象外。
- ★権限の差: customer_register（0023／0088）は owner／manager／顧客権限のある staff（auth_staff_can_crm）だけ。本文の「レジ操作可の role」（レジ権限のみの staff・レジ可の cast）は RPC が 'forbidden' を返す＝文言「登録する権限がありません」を出す。RPC のゲートを can_register に広げるかは 0158 以降の起草判断（起票候補）。
- 候補表示（X-11-2b）: 検索欄が空＝一覧は出さず「最近来店 5 人」「担当キャストの顧客（伝票の指名キャストが担当・5 人まで）」。1 文字以上で名前／ふりがな／電話の部分一致・最終来店日の降順・10 件＋「さらに表示」。0 件のときは「新規登録して追加」を主ボタンに。
  材料＝customers の直読（tel を含む）＋ customer_list_summary(p_include_dormant=true) の戻り（last_visit・cast_id・visits。戻りに電話は無いため電話の一致は customers.tel で見る）。純関数 lib/nox/register/customer-candidates.ts。
- X-11-3（外す→同じ顧客を追加できない件）: live の RPC は 13 通りすべて成功（外す＝物理削除・unique は (check_id, customer_id) と (check_id, position)・再追加を拒む作りではない＝docs/tmp/q0929_cust_readd.mjs・BEGIN…ROLLBACK）。
  client は「選択→追加」の 2 段（共通 Picker で選んでから「追加」）で、9 人以上では一覧が畳まれ、結果の文言はカード最下部（誰の注文・キープ出しの下）に出ていた＝押したあとの成否が見えにくい。
  対処＝候補の行から直接「追加」・文言は追加欄の直下・キーボード ↑↓／Enter。

## 裁定322（本便で確定・Agoora・2026-09-29）レジのキャスト選択の共通の並びと表示

出典＝Agoora 指示（2026-09-29・便 X-11-5 で収載）。**本文（逐語）**:
「レジのキャスト選択（裁定322）: 指名タブ一覧・商品を付けるキャストのモーダル・キープ／紹介の選択で共通の並びと表示＝①接客中／場内／着卓中 → ②出勤中（in 打刻あり・out なし） → ③未出勤（シフトあり） → ④未出勤。各群は名前順。①②は『出勤中』バッジ、③④はグレー＋『未出勤』ラベルで既定折りたたみ『未出勤を表示（n 人）』。モーダルの既定タブは『出勤中』。判定は当日の punches と確定シフトを既存の読取で。並び関数は lib に 1 本（castPickerOrder）で共有。」

適用＝便 X-11-5（2026-09-29・client のみ）: lib/nox/register/cast-picker-order.ts（castPickerOrder／castPickGroupOf／offDutyToggleLabelOf）＋ components/nox/cast-picker.tsx の grouped・shiftIds。register-board の指名タブ一覧と「商品を付けるキャスト」モーダル（既定チップ＝出勤中）に適用。検索中は未出勤も一緒に出す。
- 裁定107（並びは名前順固定）は、grouped を渡した面についてこの裁定で置き換え（群の中だけ名前順）。grouped を渡さない面（シフト追加・予約・kiosk レジ）は従来どおり名前順。
- 確定シフトの読取は register-board に無かったため、attendance を読む effect に 1 本足した（shifts・当日営業日・status='confirmed'・cast_id のみ）。
- ★キープ／紹介の選択は対象がキャストではない（キープ＝顧客とボトル商品・紹介＝マスタ「紹介者」referrers）＝並びの適用対象なし。紹介者にキャストを結ぶ列は無い。

## 裁定323（本便で確定・Agoora・2026-09-29）在庫の棚卸しは一覧型

出典＝Agoora 指示（2026-09-29・便 X-11-7 で収載）。**本文（逐語）**:
「在庫 棚卸し（裁定323）: 一覧型＝在庫管理ありの有効商品のみ（在庫を持たない商品＝在庫列 null／管理フラグ off は出さない）をカテゴリ順に全行（商品名・現在庫・実数入力・差分）、検索欄は絞り込み、実数を入れた行だけ『n 件を記録』で一括（既存の棚卸し RPC を行ごと・失敗行で停止・記録後は差分 0）。無効商品は『無効も表示』トグル。商品ページの『入荷』（増減）は現行のまま＝役割を注記で分ける（入荷・返品＝商品ページ／実数で置き換え＝在庫ページ）。在庫管理の判定列が無ければ『在庫数 null＝管理なし』で代用し、判定に使った列を報告。」

適用＝便 X-11-7（2026-09-29・client のみ）: app/(manage)/master/stock/stock-board.tsx の「検索して 1 件選択」（ProductCombo）を撤去し一覧型へ。純関数 lib/nox/stock/stocktake.ts（stocktakeRowsOf／stocktakePlanOf／isStockManaged）。
- 在庫管理の判定＝products に管理フラグの列は無い → **product_stock_totals の戻りに行がある商品（＝stock_logs に 1 行以上ある商品）** を「管理あり」とした（在庫数が無い＝管理なし）。入荷の記録が無い商品は一覧に出ず、件数だけ注記する。
- 記録＝既存 product_stock_add(delta, '棚卸し') を行ごとに順に・失敗した行で停止（記録済みは残す）・記録した行は実数欄を空に戻す。差分 0 と整数でない入力は対象外。


## 便 X-13a（2026-10-08・Agoora 目視 NG 1〜10＋12／14 の処理・0166 起草）＝相談役ブロックの指示（裁定番号なし・逐語は台帳「便 X-13a 完了」）

**0166 の欄（本番適用済み・収蔵＝便 P166・2026-10-08）**: supabase/migrations/0166_product_track_stock.sql＝**sha256 ebd23bdb165cf20e580c12dbafee97abda80ab47d56c2f9bbb22660634dc987a・5,542 B・65 行（台帳方式）／64（wc -l）・突合 18 段 NG 0（docs/tmp/q1008_ag_0166.mjs・BEGIN…ROLLBACK・文単位 5 文）**。中身＝★1 products.track_stock boolean not null default true（既存 184 行は全部 true）★2 新規 RPC set_product_track_stock(p_product_id, p_track)＝課金ゲート内蔵（規則A形）・owner ∨ manager 自店・cast／他店 forbidden・null は bad args・同値は no-op・audit 'set_product_track_stock'（before/after・store_id）★3 grants（public／anon revoke・authenticated）。期待 md5 **set_product_track_stock 594c5e98**（docs/tmp/0166_expected.json）・不触 set_product／demo_org_reset a4bd6a18／cast_sales_aggregate e232dac8。名簿＝A +1（商品マスタ）＝**303→304・'billing locked' 154→155**（手貼り後の便 P166 で名簿・billing／anon-guard／grants／0158 の pin）。**demo 表への影響＝products の NOT NULL 列＝payload の products 行に track_stock を先行して持たせた（gen-demo・列が無い間は jsonb_populate_recordset が無視＝0166 の前後どちらでも reset は壊れない・突合 c-14／c-15）**。トリガ stock_on_check_line は不触（false でも sale 行は積むが画面に出さない＝抑止は X-13b で裁定）。手貼り案内 docs/demo/handpaste_0166.md（結論 3 行・形の確認クエリ・proof 9）。 **本番適用＝2026-10-08・時刻不明（Agoora 申告「不明」で確定）**・Agoora 申告 proof＝orgs 9・products.track_stock boolean/NO/true・184/184 true・set_product_track_stock 594c5e98・関数 304／表 83。live 照合＝docs/tmp/q1008_post_0166.mjs **all_ok（08:48:32Z）**＝列の型・既存 184 行 true・md5 594c5e98・secdef・gated・ACL（authenticated＋service_role 可／anon／PUBLIC 不可）・挙動（owner 可・manager 自店 可・manager 他店 forbidden・cast forbidden・監査行 target products:<id>・before/after track_stock・store_id）・関数 304／表 83／'billing locked' 155／述語参照 156。収蔵＝sha256 ebd23bdb165cf20e580c12dbafee97abda80ab47d56c2f9bbb22660634dc987a・5,542 B・65 行（台帳方式）／64（wc -l）。名簿 **303→304（A 155／B 149）**＝A6 +1（docs/NOX_課金ゲート対象_v1.md mig0166 追随・現在値 304）。pin＝billing（対象 155・ゲート 155・述語 156・形 155）／anon-guard（probe set_product_track_stock＝anon BLOCKED・authenticated(cast) は bad args／forbidden）／grants（G4d +1＝authenticated＋service_role）／0158（関数 304・s-2c md5 594c5e98）・store-systems 不変（30）。

### 裁定328 追補7（2026-10-08 確定・相談役追認・便 P166）デモ org の写真導線＝「表示するが無効」の追認

出典＝相談役ブロック 2026-10-08（便 P166 B-2）。**本文（逐語）**: 「328 追補7（デモ org の写真導線＝表示するが無効を追認）。」
内容＝便 X-13a で components/ui/photo-edit.tsx を共通部品にし、デモ org（orgs.is_demo）では「写真を変更／削除」を隠すのではなく disabled＋理由「デモ環境では写真を変更できません」で表示する（真の防御は storage policy 0149 ★10・dg(6-4) の useIsDemo pin は維持）。328 本文 ④「写真のアップロード不可」の制限は不変＝見せ方だけ。

**恒久注意（追加・便 P166）: 本番 route（cron／手動の demo reset）はデプロイ済み repo の payload（docs/demo/payload）を読む＝payload を変えたら push→Vercel success の後に reset する**（push 前の reset は旧 payload＝便 X-13a で flag 0 行の実例）。

## 裁定406（2026-10-19 確定・相談役・v48 §2・台帳収載は 2026-10-22 便 SH-UI-b）シフト画面の再構成（モック確定）

出典＝相談役引き継ぎ v48 §2（docs/handoff/NOX_相談役引き継ぎ_2026-10-19_v48.md）。**本文（逐語）**: 「シフト画面の再構成（モック確定）＝上段 今日／シフト作成／確定シフト。手順 4 段＝①期間を作る（作成済み一覧と編集・曜日別必要人数）②提出一覧（募集中期間の選択・締切日で自動配置中）③シフト配置（承認リスト＝承認／調整〈差し戻し or 確定〉／見送り・辞退で戻る・月カレンダー・配置中期間の切替）④公開シフト（月カレンダー＋不足日）。確定シフト＝期間を選んでカレンダー・追加／外す＋通知・期間ごとの代行確定。状態名＝作成中→募集中→配置中→公開済み。主ボタンは中央・自動配置なし。休み希望のみの店は承認リストが休みだけ。」モック＝https://claude.ai/artifact/AFAM1d9j3kSonNVwRMHTgR（構成と遷移の正本・見た目は NOX の既存部品）。
適用＝便 SH-UI-b（lib/nox/shift/tabs.ts 7 キー＋URL ヘルパー・period-stage.ts closed「配置中」＋effectiveStageOf・shift-board の手順 ol／②提出一覧／③の頭／④公開シフト／確定シフトの期間切替・globals.css .nox-steps／.nox-cta）。DB 変更 0。**DB が足りず本便で出来なかった 5 件は 0176 行き**（期間ごとの必要人数・締切日到達の自動遷移・本人の辞退 RPC・追加／外しの自動通知・未提出の人への一括お知らせ＝便の現在地に列挙）。v48 §8-4 U-1 は「台帳に確定済み」としていたが台帳に無かった＝本便で収載。**承認済み（2026-10-23・連続便 2 冒頭＝連続便 1 の①〜④全件承認）**

## 裁定427（2026-10-26 確定・Agoora）席移動で席種が変わるときの料金

出典＝相談役ブロック 2026-10-26（裁定427 収載便・本文は前便報告の①〜⑤）。**本文（逐語）**:
「①上位へ（セット中）＝通常セット行を VIP セット料金の行に差し替える（追加ではなく置換・確認ダイアログ付き）。
②上位へ（延長中）＝入店時のセット行は変えない。移動した延長行から VIP 料金を乗せる＝VIP 用の延長パターンがあればそれ、無ければ 通常延長額＋（VIP セット−通常セット）。以後の延長も VIP 単価。延長パターンは移動時点で再凍結。
③サービス率は席移動時点から VIP 率。移動前に確定済みの行は旧率のまま（行ごとの凍結値を移動時に再凍結）。
④下位へ＝VIP 料金の行は残す（返金しない）。同種間＝不変。
⑤入金済みの卓は①〜③とも不変（裁定424 と同じ）。」
適用＝未着手。**実装先＝C2-23（席移動の料金）＝§8-4 ON-4 で着手**（手貼り P175→P176→P177 の後）。本便は台帳収載のみ（コード変更 0・DB 変更 0）。


## 裁定428（提案中・②定休日のブロックと⑪閾値の置き場は 2026-10-26 Agoora 確定）ノルマ設定（店）の再構成＋定休日のシフト反映（便 NR-1）

出典＝相談役ブロック 2026-10-26 12:12（便 NR-1・差し替え版）。番号＝相談役の指定（「裁定428 候補」）。実装済み＝feat b8cedf3（便 NR-1）。承認待ち＝【事後承認待ち】（便 NR-1 の節）。**本文（逐語）**:
「A. ノルマ設定（店）: ①PC も 4 軸（出勤日数・同伴・売上・指名）を出す＝減額パネルは採用した軸だけ・キャスト別目標の表は採用した軸の列だけ（cast_norms.days_target／dohan／sales／shimei・plan_norm_tiers とは混ぜない）②パネル 2 つに（「軸と減額」＝軸チェックと同じ行に 定額／不足 1 単位ごと＋金額／「キャスト別の目標」）③遅刻・当欠の閾値は控除・送りタブへ ④説明は 1 行＋ⓘ・※削除・保存はパネルごと 1 つ ⑤390px＝4 軸のセグメントは全部 同じ幅（左右 50／50・親幅いっぱい）・金額欄も同じ幅・保存ボタンは中央 ⑥文言＝同伴の単位は「不足 1 回ごと」（「本」は誤り）。B. 定休日のシフト反映（読取 1 行＝カレンダー・必要人数が stores の曜日設定を読んでいるか）: ①月カレンダー／スタッフ別で定休日のセルは地色グレー「定休日」・募集／配置／代行確定の対象外・不足日と予想人件費から除外 ②必要人数（曜日・時間帯別）は定休日の曜日を 0 固定・入力不可 ③定休日への新規配置・希望はブロック（理由を表示） ④既にある定休日のシフト行は赤バッジ「定休日」で見せ、店長が消す／残すを選ぶ（自動削除なし）⑤デモ ACE の payload で日曜に入っているシフトは消す。」

## 裁定429（2026-10-26 確定・Agoora）スタッフのシフト権限＝シフト ON は店長と同じ操作（M-9）

出典＝相談役ブロック 2026-10-26 13:59（M-9）＋同日 15:5x の番号整理（「シフト権限＝裁定429。台帳をこの番号で」）。適用＝未着手（M 便の M-9）。**本文（逐語）**:
「スタッフ一覧で「シフト」ON のスタッフが日モーダルで配置できない（「＋ キャストを追加」が出ない・店長は出る）。読取 1 行＝client の出し分けか RPC の role 判定か。シフト ON＝店長と同じ操作（配置・承認・代行確定・公開・期間の作成・まとめて追加）にする。RPC が店長以上で縛っていれば perm 'shift' を通す形で 0181 に相乗り（起草のみ）。スタッフ一覧の注記を「シフト＝シフトの作成・配置・承認まで（店長と同じ）」に。live 検証に ⑧ 小林（スタッフ・シフト ON）で 11/3 に配置できる を追加。」
★0181 は起草済み・手貼り案内を出した後（sha16 10769e5f9d9603ea）＝相乗りで中身を変えると案内の sha と食い違う→RPC 側は別番号（0183）で起草する＝【事後承認待ち】。

## 番号整理（2026-10-26 15:5x・相談役）

「送り 定額 3 段＝裁定414 追補（新番号なし）・シフト権限＝裁定429。台帳をこの番号で。」＝便 414 追補の節（距離区分 3 段・0180）は新しい裁定番号を持たない。

## C2-22 本文（2026-10-26 15:5x・相談役＝来期の時給見込み・ON-4 で実装・相談役案で確定扱い・DB 変更 0）

**本文（逐語）**: 「目的: 裁定418 ⑫（移動窓・UP は決定時給に累積・不成立の期は据え置き）とスライド（売上軸／報酬率軸）の結果を、期の途中で「来期の時給見込み」として見せる。
表示先: ①/mine の今月の欄に「来期の時給見込み ¥n（今期の判定値 m・あと ¥k で次の段）」1 行 ②給与右パネル（キャスト詳細）のスライド行の下に同じ 1 行 ③給与の一覧に列は足さない。
計算: 給与と同じ関数で、今期の現時点の値（売上 or 報酬率・規定日数／時間の達成状況・N 期の移動窓）を入れて来期の決定時給を出す。規定未達なら「規定未達のため UP なし（あと n 日）」。スライドの無いプランは表示しない。見込みは確定値ではない旨を小さく注記。
検証: ACE（売上スライド）と MUSE（報酬率軸・N＝2）で 1 名ずつ見込み行が出る・給与の確定値と期末時点で一致することを suite で確認。」

## M-10（2026-10-26 15:3x／15:5x・相談役＝M 便に追加・M-9 の後）

**本文（逐語）**: 「M-10 給与→勤怠「この月のシフトを開く」: ①飛び先を今日タブではなく、表示中の月の確定シフト（公開前なら シフト作成→③配置の同月）に ②テキストリンクをボタン風（CSV・印刷用と同じ外枠・左端）に。
M-10 補足（読取）: 勤怠一覧で確定シフトが無い日に出退勤の打刻がある行（ACE せな 10/04・10/18）が実働・時給分「—」になる。仕様（シフト無し＝時給なし）か取りこぼしかを 1 行で報告。取りこぼしなら、打刻ありシフト無しの日は「シフト無し出勤」として不整合に出し、店が「当日追加配置」で後追いできる導線を同じ行に付ける。
live 検証に ⑨ 勤怠→「この月のシフトを開く」で同月の確定シフトが開く を追加。」
**読取（1 行）**: 仕様＝lib/nox/punch-match.ts の規約「shift 無しの attendance は final に昇格せず no_shift」＋payroll/core.ts「受給者のみ（シフト無し raw は recipientsByDate に不在）」＝確定シフトの無い日の打刻は時給の対象外（取りこぼしではない）。
**相談役案（同日 15:5x・事後承認待ち）**: 「シフト無し出勤は時給なしの仕様を維持。勤怠一覧と給与の要対応に「シフト無し出勤 n 日」を出し、行から「当日追加配置」へ飛べるようにする（追加後は時給が付く）。」

## Agoora 確定 10/26（夕）＝相談役案の確定 12 件（【事後承認待ち】から外す）

出典＝相談役ブロック 2026-10-26 16:0x（Agoora 回答）。**本文（逐語）**:
「①裁定427 細部＝延長中の VIP 席移動は延長行のみ VIP 化（入店時のセット行は不変）・延長行の額＝VIP 延長パターン or 通常延長＋（VIP セット−通常セット）・サ料は移動時点から VIP 率＝確定。
②定休日のシフト＝ブロック確定。
③送りの距離区分＝キャストに固定し、出勤日ごとに当日変更可。誤りは後日でも修正できる（確定前の給与なら即反映・確定後は精算調整で）。
④遅刻チップ＋15／30／45／60／90＋その他＝確定。⑤新規客の予約（仮名＋人数→来店時に紐づけ→担当客に自動登録）＝確定。⑥ノルマ未達の適用＝意思保存・確定時再計算＝確定。⑦裁定429 シフト権限 ON＝店長と同じ操作・読取専用は作らない＝確定。⑧シフト無し出勤＝時給なし維持・要対応に出して当日追加配置で後追い＝確定。⑨C2-22＝確定。⑩キオスクで給与は見せない（設定項目も出さない）。⑪閾値は控除・送りタブへ＝確定。
⑫裁定423 変更（キオスクの QR の向き）: キオスクに QR を表示（30 秒で回る短命トークン・1 回限り）→本人がログイン済みの NOX（スマホ）で読む→そのキオスクが本人の権限で開く（無操作 3 分で戻る）。旧向き（スマホに QR・キオスクのカメラで読む）は撤去。PIN（4〜6 桁）は基本の入口として維持。使える機能は本人の role と権限どおり＝スタッフは権限のある機能（レジ・シフト等）、キャストはレジのみ（sys_cast_register が OFF なら打刻のみ）。DB が要れば 0183 に起草のみ。夜間便の OB の前に実装。」
**反映先**: ①＝0182 の ② 延長中（移動した時点の延長行＝最後の延長行を VIP 額に置き換え・以後の延長も VIP 額＝延長パターンを再凍結・セット行は不変）・②＝便 NR-1（実装済み）・③＝0180 の続き（キャストの固定区分＋出勤日ごとの当日変更＝transport の行で区分を持つ＝0183 起草）・④＝M-1（遅刻チップ）・⑤＝M-4・⑥＝M-7・⑦＝M-9（裁定429）・⑧＝M-10・⑨＝ON-4 C2-22・⑩＝OB（キオスクの給与表示 OFF・設定項目なし）・⑪＝便 NR-1（実装済み）・⑫＝夜間便の QR 便（OB の前）。
**裁定423 の扱い**: 追補 2 の ★27（裁定423 候補・R-7＝kiosk_unlock_qr／my_qr_secret＝スマホに QR・キオスクのカメラで読む）は ⑫ で向きが逆になる＝my_qr_secret（本人の秘密）を使う旧経路を撤去し、キオスク側が短命トークンを出して本人のセッションで引き換える形に（DB が要る＝0183 に起草）。

## 裁定430（提案中）シフトの確定動線＝店が決める（M-12・Agoora 10/26）

出典＝相談役ブロック 2026-10-26 16:2x（M-12）。番号＝相談役の指定（「裁定430 候補」）。適用＝未着手（M 便）。**本文（逐語）**:
「読取 1 行＝「代行確定する（21件）」が効かない原因（対象の状態と RPC の条件）。
①期間の段階（作成中／募集中／締切／公開済み）は進行の目安とし、配置・確定・公開はどの段階からでも可（作成中→公開を直接許可・公開時に確認ダイアログ 1 回）。RPC が段階で縛っていれば 0181 に相乗り（起草のみ）。
②「代行確定」と管理者確認の確定を 1 つに統一＝ボタン名「確定（n 件）」・対象は確認待ち（管理者確認／キャスト確認）の両方→採用・確定。
③提出一覧・承認待ちの各行に「確定」ボタン（調整・送り返す・削除の左）・上部に「この n 件を確定」（「調整中を送り返す」の隣）。
④M-11 と合わせ、新規の配置は既定で採用・確定。
live 検証に ⑪ 作成中の 11/9〜11/30 で配置→確定→公開まで通る・確認待ち 21 件が一括で確定になる を追加。」
★0181 は手貼り案内済み（sha16 10769e5f9d9603ea）＝RPC 側が要れば 0183 に起草（裁定429 と同じ扱い）。


## 裁定431（2026-10-26 確定・Agoora）源泉の直し（委託の精算調整・ノルマ未達減額は源泉の後／整数計算／送り代の二重防止／文言 2 か所／日次精算の控除日数は T17 待ち／雇用のシフト無し出勤は時給を払う）

出典＝相談役ブロック 2026-10-26 17:2x（源泉の直し・裁定431 候補）＋同日 17:3x の Agoora 確定（「源泉の直し＝裁定431 として確定」）。前提＝源泉の読取（同日・コード変更 0）。**本文（逐語）**:
「①委託（ホステス等報酬）の源泉の計算基礎から、精算調整（遅刻・当欠・罰金ダイアログ）とノルマ未達減額を外す＝源泉の後に手取りから引く（裁判例：罰金は違約金で報酬の減額要素ではない）。雇用の懲戒減給・不就労は現状どおり源泉前。手入力の調整控除は委託の既定を「源泉後」に。
②源泉の計算を整数に（floor(taxable*1021/10000)）。SQL 側も numeric／整数で同じ式に。
③固定控除マスタの「送り代」と送りの控除の二重を防ぐ（送りが ON の店では固定控除に送り代を作れない・既存があれば警告）。
④文言＝pay.ts 冒頭の「源泉の日数＝出勤日数」を「計算期間の暦日数」に。給与右パネルの「源泉は既徴収分を差し引きます」を実装どおり「日次精算で支払済みの額は源泉の基礎から除きます」に。
⑤日次精算の 5,000 円控除の日数（支払時 1 日＋月末に全日数）は現状維持・台帳に「税理士 T17 待ち」と記録。
⑥雇用キャストはシフト無しで打刻した日も時給を払う（勤怠一覧と要対応に「シフト無し出勤」と出す）。委託は従来どおり時給なし＋当日追加配置で後追い（M-10 補足を雇用／委託で分岐）。
検証: golden の差（pay・payroll）を報告してから更新→f0 2 連→push。報告（3 行）。」
**⑤の記録**: 日次精算（settlement）の 5,000 円控除の日数＝支払時 1 日＋月末に月の全日数（現状維持）＝**税理士 T17 待ち**（専門家確認 2026-10-26 追補 T17 ②）。
**M-10 補足の分岐（Agoora 確定 10/26）**: シフト無し出勤＝雇用キャストは時給を払う（勤怠一覧と要対応に「シフト無し出勤」と出す）・委託は従来どおり時給なし＋当日追加配置で後追い。
適用＝便 431（M 便の後・夜間便 GV-D の前）。

## 裁定432（2026-10-26 確定・Agoora）源泉区分と控除の入れ方（人ごとの区分／委託の額の指定／社員の控除 4 欄／注記）

出典＝相談役ブロック 2026-10-26 夕（「裁定432 確定（Agoora 10/26）＝源泉区分と控除の入れ方。裁定431 と同じ便で・【事後承認待ち】から外す」）。**本文（逐語）**:
「①人ごとの区分: 委託キャスト＝hostess（10.21%・5,000円×計算期間の暦日数を控除・自動）／委託スタッフ＝other_fee（10.21% 定率・控除なし・自動・税理士 T11 待ちの仮置きと台帳に記録）／社員（雇用キャスト・雇用スタッフ）＝manual／none。詳細画面で変更可（店長以上）。
②委託（hostess／other_fee）: 給与画面で自動額を表示し、横に「額を指定」でその期だけ上書き可（理由任意・「税理士確認済み」チェック・audit に元額と指定額）。
③社員（manual）: NOX は税額を計算しない。控除欄＝社会保険料／源泉所得税／住民税／その他（名前付きで複数行）を月ごとに手入力・既定は全部空欄＝0・入れた分だけ差し引く。「前月と同じ」ボタン（前期の 4 欄を一括コピー）。確定時に未入力の社員がいれば「社員 n 名の控除が未入力です」を 1 回確認（止めない）。明細 PDF・給与 CSV・/mine は入力した項目だけ出す。今の雇用キャストの税額表による自動計算は撤去（golden の差を報告してから更新）。
④画面注記 1 行：「区分と額は顧問税理士・社労士にご確認ください」。
DB が要れば（区分・上書き額・社員の控除 4 欄）0183 に相乗り（起草のみ・client はフラグ配下）。live 検証に ⑭ 委託スタッフの源泉 10.21%・額を指定して明細に反映／社員の控除を 2 欄だけ入れて差引に反映・「前月と同じ」で翌月にコピー を追加。」
**other_fee の記録**: 委託スタッフの 10.21% 定率（5,000 円の控除なし）は**税理士 T11 待ちの仮置き**（専門家確認 T11）。
適用＝便 431 の続き（同じ便・BTN の割り込みの後）。

## 専門家確認 10/26 追補（2026-10-26・docs のみ）

docs/NOX_専門家確認事項_2026-08-27.md に「2026-10-26 追補」＝税理士 T12〜T19／社労士 S11〜S14／弁護士 L8〜L12（相談役の質問文を逐語・④回答は空欄）と、既存 S1 に「送りは店のドライバーによる定額徴収が主流（Agoora 10/26）」の 1 行を収載。番号は既存と重ならないよう相談役が指定（旧案の T11〜T18・S3〜S7 は既存番号と衝突＝読取で報告済み）。

## M-11（2026-10-26 16:2x・相談役＝M 便に追加）

**本文（逐語）**: 「M-11 シフト「＋キャスト別にまとめて追加」: ①新規日の状態の既定を「採用・確定」に（夜の店は店が決めるのが基本・Agoora 10/26）。希望から取り込む日も選択中の状態に従う（「採用（管理者確認）として取り込み」固定をやめる）。登録済みの日の編集は元の状態を保つ。日モーダルの「＋ キャストを追加」の既定も同じく確定。②時刻の表記統一＝「3. 時間を設定」の終了も表示は「翌02:00」（入力は 26:00 も受ける）。live 検証に ⑩ まとめて追加の既定が採用・確定 を追加。」

## Agoora 確定 10/27＝M-15〜M-19・便 EXT・便 CASH（2026-10-27・便 L で収載）

出典＝相談役ブロック 2026-10-27（Agoora が 10/26 夜〜10/27 昼に出した指摘の確定分）。適用＝M-15／M-16／M-18／M-19＝便 M2（client のみ）・M-17＝便 CASH の後・便 EXT／便 CASH の DB 分＝0187（0180〜0186 の本番適用後に本番の pg_get_functiondef を元に起草・開始は相談役の合図）。**本文（逐語）**:
「- M-15 390 の月カレンダー：バッジは上端の色帯・日付は左上・下タブの現在地をシフトに・CSV／印刷は横並び
- M-16 必要人数の時間帯は 30 分刻みの選択式（翌表記）・期間作成の日付欄は全幅・「時間帯を設定する」中央・端末・印刷のタブ二重を解消（名称＝キオスク端末・「要確認 準備中」撤去）
- M-17 入金モーダルの大きな赤字＝選んだ方法で受け取る額（カード＝残額＋手数料・現金＝残額−現金割引）
- M-18 キャスト状態バッジの色（待機中 緑・着卓中 金・出勤予定 青・遅刻 赤・退勤／休み グレー）・並び順も同じ・予約の日付が今日以外ならその日のシフトで表示
- M-19 日モーダルの「＋キャストを追加」はその日専用のシート（キャスト選択→店の枠の時間→既定 採用・確定→通知）・月全体のまとめて追加は開かない
- 便 EXT 延長のご案内＝その卓の延長パターンに設定済みの延長時間を全部出す（人数・税サ・丸め込み・お客様向け全画面・タップで追加）※追加の方式は Agoora 回答待ち
- 便 CASH 店設定「支払方法の調整」（なし／カード手数料／現金割引／両方）・割引対象は「合計から（既定）／小計から」を店で選択」
**注**: 便 EXT の「タップで追加」は、開卓時凍結の ext_menu_snap に無い延長時間を足す方式なら check_extension_add の変更が要る（0187）・凍結メニューの範囲なら client のみ＝Agoora 回答で決める。便 CASH の現行＝check_pay（0175 v2 ★11）の割引は「この方法で払う残額に対する率」の 1 方式＝基準の選択は check_pay と set_store_profile の白名単（0180 で再定義済み＝0180 適用後の定義の上に書く）の変更＝0187。割引の基準（小計／合計）の税務は税理士 T15 待ち（専門家確認 10/26 追補）。

### Agoora 回答（2026-10-27・上の※の回答と 433 の番号）

出典＝相談役ブロック 2026-10-27（Agoora 回答）。**本文（逐語）**:
「- 便 EXT の範囲＝開卓時に固める範囲を、その卓の延長パターンの全行に広げる（DB あり＝0187 に同乗）。開卓後に店の設定を変えても、その卓の料金は動かない。
- 裁定433（源泉の税率表）＝0188 に分ける（0187 とは別）。
- 運営管理画面の最小版＝ローンチ後。税率表は当面 mig で行を追加する。」
**反映**: 0187＝便 CASH＋便 EXT の DB 分（起草は便 M2 の push 後・0187 前の読取を受けて相談役が範囲を確定して合図）。0188＝裁定433。

### 事後承認の確定（2026-10-27・Agoora＝docs/demo/pending_approvals_20261027.md の §0〜§21）

出典＝相談役ブロック 2026-10-27（Agoora 確定）。**本文（逐語）**:
「- 承認：§0〜§21 のうち下の A・B・C・D 以外すべて。
- A（変える）15-③ owner_transfer：画面に確認ダイアログを 1 段足す（相手の名前を表示して「譲渡する」・主ボタン中央・DB 変更なし）。次の client 便で実装。
- B（承認・ローンチ前に直す候補として台帳に控える）：4-② 送り代の判定を名前から控除の種類の印へ／6-④ スタッフの契約の行を作る動線／9-① 要確認の営業時間外を店の営業時間から／17-⑨ デモ ACE の延長額の不一致を録画の前に直す（gen-demo の checks.ext_fee を既定パターンに）／18-⑦ 日払い取消の理由を prompt からモーダルへ／1-① 新しい店の端数の既定は初期設定 v4 の作り直しで決め直す。
- C（不要になった＝台帳に「解消」と記録）：7-④（0185 のフラグ便で PIN だけの解除に戻す）／16-⑮（0185 の新しい向きで置換）／19-⑤（0176 適用済み＝催促ボタンが有効になっているか確かめ、無効のままなら有効化を次の client 便へ）／21-⑤（0186 の audit_export_record で解消）。
- D（Agoora の作業として台帳に残す）：12-⑦ CI の失敗の原因・11-⑥ cron の手貼り・13-⓪ create-demo-orgs・11-⑦ 自分の org での招待の確認。」
**A（未実装＝次の client 便）**: 15-③ owner_transfer の確認ダイアログ（相手の名前・「譲渡する」・主ボタン中央・DB 変更なし）。
**B（ローンチ前に直す候補）**: 4-②／6-④／9-①／17-⑨（録画の前）／18-⑦／1-①（初期設定 v4 の作り直しで）。
**C（解消・2026-10-27）**: 7-④＝0185 の手貼り後に MIG_0185_APPLIED true（レジ端末は PIN だけの解除に戻る・本番の kiosk_unlock を BEGIN…ROLLBACK で呼んで解除できることを確認済み）／16-⑮＝0185 の新しい向き（キオスクが QR を出す）で置換／19-⑤＝催促ボタンは有効（shift-board の「催促」は送信中だけ disabled・「0176 適用後に送れます」の文言は残っていない）＝追加の client 作業なし／21-⑤＝0186 の audit_export_record（出力の記録）で解消。
**D（Agoora の作業）**: 12-⑦ CI（GitHub Actions「typecheck / lint / verify:ci」）の失敗の原因（2026-10-27 の 9434679 も failure・注記は Node.js 20 の非推奨と「ubuntu-latest は 10/19 から Ubuntu 26 へ移行」の 2 つ・ログの本文は認証が要る＝Actions の画面で確認）／11-⑥ cron の手貼り（docs/demo/cron_shift_periods_close.sql）＝**済（10/27・JST 06:20 に変更）**＝登録の結果 nox-shift-periods-close,20 21 * * *,true・Vault の nox_cron_secret／nox_demo_reset_url の存在を確認済み・時刻は 10 21（06:10）→ 20 21（06:20）＝デモ reset（21:05〜21:15）の途中を避け 21:35 の retry の前・翌朝 06:20 以降の動作確認（net._http_response に {"ok":true,…}）は次のセッション冒頭の起動確認に含める／13-⓪ create-demo-orgs（管理者ログインの users 行）／11-⑦ 自分の org での招待（スタッフ登録→招待→受諾）の確認。
**12-⑧ の確認（2026-10-27 14:2x）**: 本番の Vercel の最新 deploy＝9434679（Production・success・05:04Z）＝origin/main の HEAD と一致。

### 便 2 完了（2026-10-29・0187 の client＝MIG_0187_APPLIED=false の配下・DB 恒久変更 0）＝台帳の現在地

前提＝HEAD 2ab7001（0187 ② 反映）＝origin。**コミット 3 層＝e6151f4（flag）／97d0d99（純関数＋鏡＋suite）／c9f40e7（client）・push 済み＝origin**。f0 2 連緑 143 段・FAIL 0（15:00→15:21／15:21→15:40）・golden 不変（pay 130・payroll 234・T1b 5931／125802）・actions-center 188（68 画面・違反 0）。6 店 reset＝全店 200（15:40〜15:41・wipe+load）。
- **フラグ**＝lib/nox/rules-0175/flag.ts MIG_0187_APPLIED=false（読み口 mig0187On・テストで差し替え）。false の間＝割引欄・店設定「支払方法の調整」・延長のご案内・M-17 の割引の内訳は出ず、check_pay に p_disc_* を送らない（旧 11 引数のまま）。
- **純関数と鏡**＝lib/nox/rules-0175/pay-discount.ts（check_pay の割引額と check_group_due の鏡＝合計から／小計から・事後承認 ②＝丸めた合計から引いてもう一度丸める・4 択の引数 discountArgsOf・M-17 の受け取る額 payReceiveOf・店設定 payAdjustModeOf）・lib/nox/register/ext-guide.ts（ext_menu_pick の鏡＝時間帯つき→選択中→既定・長さごとに 1 行・金額＝groupDueFull の差）・check-calc.ts／receipt.ts に fee_kind 'pay_discount_total'（小計から引かず最後に引く＝post 0 なら 1 バイト同値・dueBreakdownOf に postDiscount／postRounding・レシートに「割引(合計から)」）・pay-fee.ts に率の ±（feeRateStepOf＝0.5% 刻み 0〜20%・空欄＝店の率）。
- **client**＝入金モーダル「現金」など割引の率がある方法の直下に割引欄（店の率／率を指定／額を指定／なし＝M-6 と同じ部品・なし・指定は店長以上＝事後承認 ④）・残額は割引後・M-17 大きな赤字＝選んだ方法で受け取る額（カード＝残額＋手数料／現金＝残額−割引／その他＝残額・内訳 1 行・旧の「残額」行と手数料の内訳と長い説明行は撤去）・**M-17 追補（Agoora 10/29・同乗）**＝率を指定の既定は店の率・−／＋ 0.5% 刻み 0〜20%・長押しで連続（C2-8 の −／＋を components/ui/step-button に共通化＝stock-board も同じ部品）・入力と ± はその場で反映（空欄＝店の率＝「10」で ¥0 のままの不具合の直し）・集計に「カード手数料 ¥b（n%）」「割引 ¥c（n%・合計から）」の行・末尾の枠の注記 2 行は手数料の枠の下へ・方法の切替で割引の方式は既定へ・延長のご案内（お客様向け全画面 .nox-extguide＝今の時間帯の延長時間を長さごとに全部・税・サービス料・人数・丸め込み＝会計と同じ関数・内部情報なし・タップ→確認 1 回→check_extension_add(p_rule_id)・自動延長の店は表示だけ・入口は backbar と時間料金（手動）カードの .nox-actions 中央）・店設定「支払方法の調整」（なし／カード手数料／現金割引／両方・現金割引の率（小数 1 桁）・割引対象＝合計から（既定・税理士 T15 待ちの仮置き）／小計から）。
- **suite**＝verify:nox-0187 40（CASH の境界値＝丸め 3 種×10%×端数 1〜9 円・手数料 4 択との共存・M-17 追補・EXT の鏡を**本番の延長パターンで突合**＝BEGIN…ROLLBACK で 0187 の ext_menu_build／ext_menu_pick を tx 内に一時作成し 7 店 24 凍結 60 比較 一致・配線の pin）＝f0 に組込み（144 段目相当）・pin 張替え x13h(8-1)／x13g(17)／p173(6-5)／c2(4-4)／m(6-2)。
- **教訓125 の直し**＝rls F1d（cron の auto_close 対策＝冒頭で fixture の期間を open に戻す＋null guard）。中断した f0 の残留（当日伝票・casts・日報）は参照 0 を確かめて消した（教訓123）。
- **残り（手貼り後の便）**＝フラグ true・pin 張替え（関数数 382→384・課金ゲートの名簿・md5）・live＝デモ MUSE（現金 10%）の割引行・小計からへの切替・延長のご案内（ACE 1,280／390）・カード手数料 ±2 回（M-17 追補の live）。
- 【事後承認待ち】①割引欄の「なし・指定」は payFeeModesFor(isManagerUp)（スタッフは店の率だけ＝裁定421 の段階は読まない）②延長のご案内は長さごとに 1 行（同じ長さの帯なし行は時間帯の行に負ける＝ext_menu_pick と同順）③延長のご案内の金額は「その行を足したときの合計の増分」（丸めの影響を含む）④M-17 の内訳に丸め直しの差を「−丸め ¥70」と出す⑤C2-8 の −／＋を共通部品に移した（見た目は不変）。

### 0188 起草（2026-10-29・裁定433 税率表＋裁定434 源泉区分 4 つ＋日払いの settlement は daily の店だけ＋外交員報酬の直書き撤去）

**起草のみ・DB 恒久変更 0・手貼り待ち**＝supabase/migrations/0188_withholding_rates_kinds.sql（280 行・24,850 B・sha16 **d9fceaa24e2e93ac**・LF）・手貼り案内＝docs/demo/handpaste_0188.md（順番 0187→0188→0189・事前確認 SQL・verify の期待値・営業中でも可＝日払い・紹介料の支払中は避ける）・生成器＝docs/tmp/gen_0188.cjs（live の定義＋アンカー置換・live 照合 19 本 SAME）・mig-check parse ok（statements 27）・試走＝docs/tmp/t0188_rollback.mts（本番 BEGIN…ROLLBACK **14/14**・関数数 382→384・表 110→111・残留 0）・md5＝withholding_rate_of 75a0f2c5／withholding_calc 532d05c7／set_withholding_kind 58f7d87d／daily_pay_issue 3e5628ad／referral_payout_pay 2be65150。フラグ **MIG_0188_APPLIED=false** を追加（flag.ts）。
- 税率表 withholding_rates（kind hostess／other_204／salesperson × valid_from 2013-01-01／2027-01-01・率 bp・控除（日／月）・閾値と超過率・内訳 jsonb・authenticated は SELECT だけ）・読み口 withholding_rate_of（支払日の行）・withholding_calc（整数計算＝hostess は従来の withholdingOf と 8 点で同値・other_204 は 100 万円の段階・salesperson は 12 万円控除）＝内部専用。
- 区分の CHECK＝none／hostess／other_204／manual（other_fee 廃止・本番は全員 null）・set_withholding_kind の受理値。daily_pay_issue＝settlement は settlement_cycle='daily' の店だけ（'settlement not allowed'）・区分を読む・税額は税率表・戻りと audit に withholding_kind。referral_payout_pay＝税率表から。
- client（フラグ true の便）＝区分 4 つの UI（委託スタッフの既定 none・注記）・M-21・日払いの種別の出し分け・pay.ts の二重控除の除外と税率表の参照・TS の mode 箇所・withholding_rate を読まない・gen-demo の LILY 4 件→advance。
- 【事後承認待ち】①salesperson（外交員・紹介者）も税率表の区分に入れた（裁定433 は 4 区分だが直書きの撤去対象に含まれるため）②other_204 の閾値は「1 回の支払金額」＝daily_pay_issue の 1 回分で判定（月次 run の課税額での判定は client）③manual の warn＝委託で manual を選んだ人は 'manual'・雇用は従来の 'T10 pending'。

### 0189 起草（2026-10-29・M-16 の翌表記＝staffing_needs の時間帯を翌 24:00 まで）

**起草のみ・DB 恒久変更 0・手貼り待ち**＝supabase/migrations/0189_staffing_needs_next_day.sql（73 行・5,947 B・sha16 **c6a8dab6a32a6c81**・LF）・手貼り案内＝docs/demo/handpaste_0189.md（営業中でも可）・生成器＝docs/tmp/gen_0189.cjs（live 照合 SAME）・mig-check parse ok（statements 8）・試走＝docs/tmp/t0189_rollback.mts（本番 BEGIN…ROLLBACK **4/4**・残留 0）・md5 set_staffing_need **b394d912**。フラグ **MIG_0189_APPLIED=false** を追加。範囲＝staffing_needs の CHECK（to_min ≤ 2880）と set_staffing_need の検証だけ（既存 50 行は満たす・overlap／upsert 不変・shift_period_needs_set は対象外）。client（フラグ true）＝half-hour.ts bandOptionsOf の翌側の選択肢。

### 0187 適用欄（2026-10-29・Agoora 手貼り＝便 2 の続き）

手貼り＝Agoora 2026-10-29（sha16 **15037e893c142cad**＝supabase/migrations の収蔵版と同一・verify の返り値 17 行＝handpaste_0187.md の期待値と**全行一致**。「has 0187 (8 fns)＝9」は見出しの 8 が古いだけ＝対象 9 関数すべてに ★0187 の注記が入る設計）。CC の適用後読取（SELECT のみ）＝関数数 382→**384**・★0187 を持つ関数 11 本（9＋内部 2・余分なし）・md5 11 本すべてファイルと一致・check_pay 13 引数 1 本・ACL に anon なし・check_lines の CHECK に pay_discount_total。mig を流さない t0187（本番の定義で BEGIN…ROLLBACK）＝**20/20**・残留 0。
- フラグ＝**MIG_0187_APPLIED=true**（flag.ts 1 行）。pin 張替え＝verify-nox-0187（A-1／E-1＝true）・課金ゲートの正本 docs/NOX_課金ゲート対象_v1.md（A13＝remove_store_special_day を B(p) から移動・B(q)＝内部 2 本 ext_menu_build／ext_menu_pick）・verify-nox-billing（対象 186・除外 198・ゲート済み 186・述語 187・形 186）・verify-nox-store-systems（白名単 69 キー＝pay_discount_base）。handpaste_0187.md の期待値の注記を 9 に直した。
- 収蔵＝0187_cash_ext_menu.sql を追跡へ（適用＋検証確認後＝規約）。
- **フラグ true 便の締め（2026-10-29 17:0x〜17:4x）**: f0 2 連緑 **144 段**（punch-match-db を含む）・FAIL 0（16:26→16:47／16:47→17:07）・golden 不変（pay 130・payroll 234・T1b 5931／125802）・actions-center 188。commit fc66d3a（フラグ true・pin・収蔵）／aa3812b（docs）＝push→Vercel deploy 68 秒で SSR に data-pay-adjust。
- **live（本番・デモ・built-in ブラウザ・1,280／390）**: ①MUSE（現金 10%・合計から）T1 ¥24,260→集計「割引（10%・合計から）−¥2,426」→赤字「現金でのお支払額 ¥21,834」→入金→DB の請求 ¥21,834・残額 0・明細に「現金割引 10%」。「率を指定 5%」→¥1,213／¥23,047・「なし」→¥0／¥24,260・「カード」→「カードでのお支払額 ¥24,260」（MUSE は手数料なし）＝すべて即時。②店設定「支払方法の調整」で割引対象を小計からへ→T2 ¥30,516→「割引（10%・小計から）−¥2,522」（小計 25,220 の 10%）→お支払額 ¥27,464（サ・税が割引分だけ減る＝check_group_due と一致）・390 の下シートで 4 択が 1 行。③ACE VIP-2（0187 後に開卓＝新しい凍結）＝backbar に「延長のご案内」→全画面「延長 30分 ¥11,880／延長 60分 ¥17,160（税・サービス料込み）」（VIP 単価×サ 20%×税 10%）・閉じるで戻る。④ACE カード＝集計「カード手数料（10%）¥1,584」・赤字「カードでのお支払額 ¥17,424」・内訳「残額 ¥15,840＋手数料 ¥1,584（10%）」・注記 2 行は手数料の枠の下・「率を指定」の既定 10 →＋2 回で 11%（¥1,742／¥17,582）→−1 回で 10.5%（¥1,663／¥17,503）＝その場で反映・390 で −／10.5／％／＋ が 1 行。
- **live で見つけた直し（fix・同日）**: 小計からのとき内訳の末尾が「−丸め ¥530」と出ていた（丸めではなくサ・税の減り）→ payReceiveOf に base を渡し「−サ・税の減り ¥530」に（合計からは従来どおり「丸め」）。suite 0187 F-3 に live の値（30,516→2,522→27,464）を追加・x13h／0187 の pin 追随・影響 suite 8 本（0187／x13h／x13g／p173／gvc／m／c2／messages）単独緑。**f0 2 連は次の便（0188／0189 フラグ true 便）でこの fix を含めて取り直す＝【事後承認待ち】**（純関数の文言 1 か所・DB 不触）。
- 6 店 reset＝live の後（MUSE の割引対象は reset で合計からへ戻る）。
- pin 張替え 2 件目（f0 1 走目で発覚）＝verify-nox-0158（s-3／t-1 関数 384・m-1 set_store_profile md5 ffc76412→4cf860c3）・verify-nox-p172（6-4 関数 384・ゲート 186・md5）・verify-nox-0175-0176（1-3 check_pay 11→13 引数）。後段の suite（0175-0176〜actions-center 188）を単独で全部緑にしてから f0 2 連。
- **CI 完了（2026-10-29・Agoora 確定 10/27（6））**＝verify-nox-punch-match の DB 段 (9)（0154・SUPABASE_DB_URL・pg tx ROLLBACK）を **verify:nox-punch-match-db** へ分離（f0 に組込み＝144 段）。pure 側は純関数 75 本（env なしで緑）。洗い出し＝verify:ci の 5 本（pay／shift-time／punch-match／receipt／payroll-csv）＋typecheck／lint のうち DB／env／dev サーバに依存していたのは punch-match の (9) だけ。本番 DB の接続先を secrets に入れない・SKIP で 0 終了する形にしない（ci.yml は注記のみ）。**Actions b2f6a3b＝success**（直前の 7707c0a／c9f40e7／2ab7001 は failure）。punch-match-db は f0 と同時に走らせると 9-17（ROLLBACK 後の残留＝実行前と同値）が件数ずれで赤＝f0 は同一 DB で 1 本ずつ（単独走＝18/18 緑）。
- **裁定436 の前提の読取（2026-10-29・相談役の依頼）**: ①お金の RPC（check_open／check_add_line／check_pay／check_close／product_stock_add／daily_report_close）は当日の打刻を見ない（punches／attendance の参照 0）。取れる既存＝punches（キャスト）／staff_punches（スタッフ）＋staff_shift_biz_today／biz_date_of・TS は punch-io.ts。ゲートは RPC 側（on_duty_of の内部ヘルパーを冒頭に・店長以上は免除）。②端末の識別＝kiosk_devices.auth_user_id だけ（device_id／cookie／UA なし・kiosk_sessions.device_id は端末行の id）＝0190 の見立て＝device_fp・bound_at・bound_ua・unbound_at／by＋kiosk_device_bind／unbind＋kiosk_* で fp 照合。③退店＝cast_leave（casts.is_active＋left_on）／staff_deactivate（memberships.is_active）だけ＝auth の失効・ban・staff_pin の削除なし（auth_* が is_active を見るので RLS／RPC は閉じる・kiosk_login も is_active を見る＝PIN は実質無効）。

### 0188／0189 適用欄（2026-10-29・Agoora 手貼り＝フラグ true 便）

手貼り＝Agoora 2026-10-29（順番 0187→0188→0189）。verify の返り値＝**handpaste_0188.md／0189.md の期待値と全行一致**（0188＝proof 9・withholding_rates 6 行・SELECT のみ・helpers 2・calc hostess 20000×1＝1,531／300000×31＝14,804・other_204 1,500,000＝204,200・salesperson 200,000＝8,168・kinds CHECK 4 値（cast／staff）・other_fee 0+0・md5 rate_of 75a0f2c5／calc 532d05c7／set_withholding_kind 58f7d87d／daily_pay_issue 3e5628ad／referral_payout_pay 2be65150。0189＝proof 9・band CHECK to_min ≤ 2880・rows 0 bad／50・md5 set_staffing_need b394d912・ACL 3 ロール）。CC の適用後読取＝sha16 d9fceaa24e2e93ac／c6a8dab6a32a6c81（収蔵版と同一）・mig を流さない試走（本番の定義で BEGIN…ROLLBACK・T018X_NO_APPLY=1）＝**t0188 14/14・t0189 4/4**・関数 384→**386**・表 110→**111**・残留 0。
- フラグ＝**MIG_0188_APPLIED=true・MIG_0189_APPLIED=true**（flag.ts 各 1 行）。収蔵＝0188_withholding_rates_kinds.sql／0189_staffing_needs_next_day.sql を追跡へ。
- **0188 client（裁定433／434）**: 税率表の TS 鏡 lib/nox/payroll/withholding-rates.ts（6 行・支払日で行を選ぶ withholdingRateOf・withholding_calc と同式の withholdingCalcOf＝整数・切捨て・「源泉の率 10.21%（2027-01-01 から内訳変更）」の読取表示 withholdingRateNoteOf）／withholding-kind.ts＝区分 4 つ（none／hostess／other_204／manual・選択肢 withholdingKindChoices()・委託スタッフの既定 none・旧 other_fee の保存値は other_204 と読む・autoWithholdingOf はフラグ true で税率表＝hostess は従来と 1 円も違わない・注記「肩書ではなく業務内容で選ぶ…」・支払調書の注記）／pay.ts（withholdingPayDate・二重控除の除外の注記＝settlement は daily の店だけ）／breakdown-lines（「源泉（その他 204 条）」）／staff/pay.ts（withholding_rate を読まない＝型 optional）／スタッフの勤怠・報酬（フラグ true の select に withholding_rate なし・選択肢・注記）／キャスト詳細の税務設定（選択肢・注記）／日払いフォーム（daily 以外の店は前払だけ＝SegSelect を出さず「この店の精算方式（月次）では日次精算は選べません」・RPC には kindEff・'settlement not allowed' の日本語・プレビューは区分で withholding_calc と同値・warn 'manual'）／gen-demo の LILY 4 件＝kind advance（payload 再生成＝lily.json だけ変化）。
- **0189 client**: half-hour.ts＝HALF_HOUR_HMS_2DAY（翌 24:00 まで）・bandOptionsOf（翌日またぎの店は close＋24h・行なし／定休日は翌 24:00 まで）・bandHmLabelOf／bandMinLabelOf（「翌02:00」）・shift-board の選択肢と一覧が翌表記。
- suite＝**verify:nox-0188（25）**（税率表の鏡・calc 境界値 14 点（本番の withholding_calc と同値）・区分 4 つ・payOf golden 125,802 不変（2027 の支払日でも同値）・staffPayOf 既定 none＝0・日払いの出し分け・LILY payload・0189 翌表記・本番 BEGIN…ROLLBACK＝税率表 6 行同値・CHECK 4 区分／2880・関数 386 表 111・md5 6 本・内部 2 本の ACL・月次の店の settlement 拒否／daily の店 20,000→1,531／other_204 20,000→2,042／other_fee bad kind／set_staffing_need 2880 可・2881 bad band）を f0 に組込み（145 段）。pin 張替え＝432（委託スタッフの既定）・p172（1-7 kindEff・6-3 daily_pay_issue 3e5628ad・6-4 386／111）・0158（daily_pay_issue 3e5628ad・関数 386・表 111・A1 を tx 内で daily に）・daily-pay（A1 を tx 内で daily に＝settlement は daily の店だけ）。
- 実装中に suite が拾った不具合 1＝isWithholdingKind が旧 4 値の配列を見ていて other_204 の保存値を既定に落とす（withholding-kind.ts）→ 5 値の全集合で判定。
- M-21（働き方の欄）は便 M3 で（Agoora 確定 10/29 の順番どおり）。

### 0187 起草（2026-10-27 夜・便 CASH＋便 EXT＋remove_store_special_day の課金ゲート）

**起草のみ・DB 恒久変更 0・手貼り待ち**＝supabase/migrations/0187_cash_ext_menu.sql（2,011 行・sha16 **15037e893c142cad**＝事後承認 ② 反映後・LF・反映前の fcb5ff0b6894e67d は無効）・手貼り案内＝docs/demo/handpaste_0187.md（事前確認 SQL・verify の期待値・営業時間外に貼る）・生成器＝docs/tmp/gen_0187.cjs（live の定義＋アンカー置換・手打ちなし）・試走＝docs/tmp/t0187_rollback.mts（本番 BEGIN…ROLLBACK 15/15・関数数 382→384）。
- **便 EXT**: 凍結＝その営業日の曜日・席種の延長パターンを時間帯を問わず全行（band つき）＝新設 ext_menu_build（内部）。延長を足すとき＝延長の開始時刻の時間帯に合う行＝新設 ext_menu_pick（内部）＝**時間帯つき→選択中のパターン→既定→メニューの順**（★開卓時の ext_rule_id は自動の既定＝これを先にすると時間帯の行が選ばれない＝CC 判断で時間帯を先に＝【事後承認待ち】①）。手動で行を指定＝その行・自動延長＝ブロックごと（長さは選択中のパターンに揃える）・席移動（VIP）の再凍結も同じ形・**旧い凍結（band キーなし）は従来どおり**（試走④⑥⑦）。
- **便 CASH**: 店設定 pay_discount_base（total＝合計から・既定／subtotal＝小計から）。合計から＝新しい fee_kind **pay_discount_total**（check_group_due が丸め後の合計から最後に引く）・小計から＝従来の pay_discount（税・サの前）。今の過大な割引を直す（試走① 12,870・従来は 12,255）。check_pay に p_disc_rate／p_disc_amount（DROP→CREATE・ACL を戻す）。紹介料の母数・席移動の凍結サ料の母数は合計からの割引を入れない（referral_recalc／check_move_seat）。receipt_issue は不変（受領額を税区分の構成比で按分＝割引後の額で正しい）。**入金済みの伝票の額は変えない**（試走の回帰＝直近 400 伝票の due が適用前後で同じ）。
- **remove_store_special_day** に課金ゲート。
- 事後承認 4 点＝**決着（Agoora 10/27）**: ①延長の行の選び方の順（時間帯→選択中→既定）＝承認・③小計からの割引は未入金分の比で按分＝承認・④入金ごとの上書き（なし・指定）は店長以上＝承認・**②合計からの割引＝「丸めの後に引く」を「割引を引いてから店の丸め規則で丸める」に変更**（お支払額が丸め単位の倍数になる）。
- **② の反映（2026-10-27 夜）**: check_group_due の返り＝`check_round_amount(greatest(0, check_round_amount(合計) − 合計からの割引), unit, mode)`＝丸めた合計（画面の合計）から割引を引き、店の丸め規則でもう一度丸める（外税・内税の 2 経路とも）。割引額の計算（check_pay＝残額×率）は不変。生成器 gen_0187.cjs のアンカー 5 か所＋試走 t0187_rollback.mts の ③ 期待値を 12,870→12,800 に張替え・境界値 5 本追加（③b 切上 100 円＝12,900／③c 丸め前が倍数でない 14,428→表示 14,400×5%＝720→13,600＝丸め前から引く 13,700 ではない／③d 一部入金 4,350 の後の現金 10%＝995→13,300→残 8,950・8,951 は exceeds balance／③e 率 100＝お支払額 0→入金 1 は exceeds balance／③f 小計から切捨 100＝10,090→12,900）。再生成＝sha16 **15037e893c142cad**（2,011 行・169,581 B・LF）・mig-check parse ok（statements 22・$function$ 11 本）・生成器の入力と本番の定義を再照合＝13 本 SAME（関数 382）・本番 BEGIN…ROLLBACK **20/20**（既存伝票 400 組の due 不変・関数数 382→384）・残留 0（試走ルール 0・行 0・A1 open 0・check_pay 11 引数のまま）。md5 の張替え＝check_group_due 7948247d→**e1f58187**・check_pay 08933d4c→**c2f2b8a6**（コメントの文言だけ・本体の計算は不変）・他 9 本は不変。handpaste_0187.md を更新。TS の鏡（check-calc.ts／receipt.ts）は 0187 の client 便で同じ順に揃える。

### Agoora 確定 10/27（6）＝CI の直し方・0187 の起草の条件（2026-10-27 夕・便 M2 の報告を受けて）

出典＝相談役ブロック 2026-10-27。**本文（逐語）**:
「■ CI の直し方（0187 の起草の後でよい）
- 本番 DB の接続先（SUPABASE_DB_URL 等）を GitHub の secrets に入れて通す直し方はしない。
- 「Verify (pure suites)」の組から DB に接続する段（punch-match の DB 段ほか）を外す。DB を要する段は、env が無いときに SKIP と明示して 0 終了する形ではなく、そもそも pure の組に含めない（pure の組＝DB なしで完結するものだけ）。DB を要する検査は今どおり手元の f0 で行う。
- 同じ型（pure の組の中で DB／dev サーバーに依存しているもの）を全部洗い出して報告。Actions が緑になったら報告 1 行。
■ 0187 の起草の条件（追加）
- 互換：0187 の適用時点で開いている伝票は、旧い形の ext_menu_snap（開卓時の時間帯で絞ったもの）を持っている。check_extension_add・check_time_charge_apply・check_move_seat は、旧い形の snap でも従来どおりの行を選んで動くこと（新しい形の判定ができない snap は従来の選び方に戻る）。旧い形の snap を持つ伝票での手動延長・自動延長・席移動を境界値の suite に入れる。
- CASH の直しは、入金済み（check_pay 済み）の伝票の額を変えない。過去の伝票を再計算する処理を入れない。
- handpaste には「営業中に貼ってよいか」を 1 行で書く（伝票の書き込みが待たされる操作があるか・あるなら営業時間外に貼るよう明記）。
- 事前確認の SQL（plpgsql が参照する列と関数の存在）と verify（md5・proacl・新しい列）を handpaste に入れる。」

### Agoora 確定 10/27（5）＝補遺：10/26 夜〜10/27 昼の 390 実機指摘の詳細（M-15〜M-19・便 EXT・便 CASH・裁定433・便 BTN 追記）

出典＝相談役ブロック 2026-10-27（「補遺の要約（各 1 行）しか渡っていなかった。以下が詳細」）。各項目（M-15〜M-19＝（1）・便 EXT／便 CASH＝（1）（2）・裁定433＝本台帳の裁定433）への追記。便 M2・0187・0188 の作業に反映（作業中の便は止めずに取り込む）。**本文（逐語）**:
「■ 便 BTN の追記分（10/26 夜）が 75db8fc に入っているか確かめ、未反映なら便 M2 に入れる
- キャスト別の目標の表：見出し（期間・出勤日数・同伴 等）と値の列を同じ揃え・同じ幅に。同じ部品の表も。
- 390 のマスタ→ノルマ設定（店）：まとめて入力の数値欄は 2 つ横並びで各 50%・「変えない」が切れない幅。カード化した行は見出し語「キャスト」「期間」を消して 1 行＝「名前　日数 12・同伴 4」（採用した軸だけ・未設定は —）。
■ M-15（確定シフトの月カレンダー・390）
- 期間バッジの文字は出さず、セル上端の細い色帯（凡例と同じ色）。日付は左上に常に表示。凡例はカレンダー下に 1 行。シフト作成の配置カレンダーも同じ部品なら同様。1,024 以上は現状どおり。
- 下タブの現在地：/shift 配下は「シフト」。他の画面の現在地も一括で確かめ、nav の suite に足す。
- 「CSV 出力」「印刷」は 390 で横並び（各 50%・中央）。
■ M-16（390）
- 必要人数の時間帯：30 分刻みの選択式（範囲＝店の営業時間）。390 では「曜日／終日」と「開始〜終了・人数・追加」の 2 段。表示の切れ（20:0C）を解消。同じ時刻入力を使う箇所（M-3 の「その他」・期間作成）も選択式に揃える。翌の選択肢は MIG_0189_APPLIED の配下（既決どおり）。
- 期間を作る：日付欄（開始・終了・希望締切）は全幅で縦積み。期間一覧の日付は「10/26〜11/1・締切 10/21」の短い表記で折り返さない。
■ M-17（入金モーダル・0187 の CASH の後）
- カード：赤字＝残額＋手数料・ラベル「カードでのお支払額」・下に小さく「残額 ¥a＋手数料 ¥b（n%）」。
- 現金：赤字＝残額（現金割引の店は残額−割引）・ラベル「現金でのお支払額」・下に割引の内訳。その他：赤字＝残額・ラベル「残額」。
- 手数料・割引の欄の変更に即時追随。入金額の既定値も同じ額。従来の長い説明行は内訳行に統合して撤去。1,280／390 とも。
■ M-18（キャストの状態バッジ・全画面共通の部品）
- 既存トークンで色を付ける（新色を作らない）。キャスト一覧の上に凡例 1 行。
- 遅刻で連絡ありは「遅刻連絡 見込み HH:MM」。
- 390 の新規予約は「日付・時刻・人数」を 1 段に収める。
■ M-19（日モーダルの「＋キャストを追加」＝その日専用のシート）
- キャスト一覧はその日の状態つき（希望あり／シフトなし／出勤不可・色は M-18 と同じ）。既にその日に入っている人は出さない。
- 時間の既定＝希望ありなら希望時間・なければ店の通常枠（30 分刻みで変更可）。
- 複数人をまとめて選んで同じ時間で追加できる。
- 定休日はブロック。出勤不可の人は「それでも追加」＋理由必須（既存ルールどおり）。
■ 便 EXT（0187・お客様に見せる全画面）
- 金額は人数・サービス料・税・丸め込みで、会計と同じ関数で計算。VIP 卓は VIP 単価。
- 大きな文字。内部情報（バック・キャスト名・手数料の内訳）は出さない。閉じるで戻る。
- 行をタップ→確認 1 回→伝票に追加。延長パターンがある店だけボタンを出す。1,280／390 とも。
■ 便 CASH（0187）
- 入金モーダルで「現金」を選んだ直下に割引欄（店の率／率を指定／額を指定／なし・M-6 のカード手数料と同じ部品）。
- 領収書・日報・分析に割引額を出す。
- 税・サービス料と割引の計算順は税理士 T15 の回答待ちの仮置き（既定＝合計から）と台帳に記録。
■ 裁定433（0188・税率表）
- 列：区分・適用開始日・率（bp）・1 日控除額（hostess のみ 5,000）・内訳（所得税／復興特別所得税／防衛特別所得税の bp・表示用）。区分は裁定434 の 4 区分に合わせる（none と manual は行を持たない）。
- 初期行：2013-01-01〜 1021（所得税 1000・復興 21）／2027-01-01〜 1021（所得税 1000・復興 11・防衛 10）。
- 計算は支払日で行を選ぶ。コード中の 0.1021／5000 の直書き（pay.ts・SQL・紹介者の外交員報酬）を全部この表の参照に置き換える。整数計算（裁定431 ②）。golden 不変を確かめる。
- 店の画面（給与・明細・支払調書）には「源泉の率 10.21%（2027-01-01 から内訳変更）」を読取で表示。」
**便 CASH の記録（仮置き）**: 税・サービス料と割引の計算順は**税理士 T15 の回答待ちの仮置き**（既定＝合計から）。
**★CC の読取（2026-10-27・0187 前）＝今の現金割引は過大**: check_pay は割引額を「残額（サ料・税込みの合計）×率」で出し、それを kind 'discount' の明細行（正の値）として入れる。check_group_due は discount 行をサ料・税の**前**の小計から引く＝サ料・税も一緒に下がる＝合計に対する実際の割引は率×（1＋サ率）×（1＋税率）倍。例＝小計 10,000・サ 30%・外税 10%＝合計 14,300 で現金 10%＝本来 1,430 のところ実際は約 2,045（約 14.3%）。本番で設定している店は **デモ MUSE（cash 10%）だけ**・割引行（fee_kind pay_discount）は本番で 0 件＝実害 0。0187 の便 CASH で「合計から（割引後の合計＝合計×(1−率)）」「小計から（割引行＝小計×率）」の 2 つを正しく分けて直す（境界値の suite と BEGIN…ROLLBACK の live を厚く）。
**便 CASH の 2 方式（2026-10-27 相談役＝0187 で直す・境界値の suite で固定）**: 「合計から」＝税・サ込みの合計に率を掛けた額を**最後に**引く／「小計から」＝税・サの**前**の小計から引いてから税・サを計算する。T15 の回答待ちの仮置きは既定＝合計から。live でデモ MUSE の割引行の表示が直ることを確かめる。
**M-15 ② 下タブの現在地＝再現せず（2026-10-27 便 M2）**: 本番の ACE オーナー 390 で /shift?tab=today・tab=fixed とも「シフト」が点灯・app/(manage) の全画面が nav のどれかに当たる（/setup を除く）＝verify-nox-m2 (15-3) で機械判定。**クローズ（2026-10-27・Agoora が実機で再確認＝再現なし・nav の suite で現在地を固定済み）**。
**便 BTN 追記の確認**: 75db8fc に入っていたのはノルマの減額パネルの保存ボタン中央だけ＝表の揃え・390 のまとめて入力・カード 1 行は**未収載**＝便 M2 で実装。

### Agoora 確定 10/29＝M-23・M-24 の詳細・M-25（C2-7 の給与一覧）・M-26（「仮シフト」の残り）＝便 M3 に収載（2026-10-29・便 2 の途中で受領）

出典＝相談役ブロック 2026-10-29（便 2＝0187 client の途中に受領・実装は便 M3）。390px 基準・主ボタン中央・live に 390 相当。**本文（逐語）**:
「M-23 スタッフの日ごとの勤怠（詳細）:
①給与 › 勤怠（スタッフ）タブ＝キャストの勤怠（給与 › 勤怠）と同じ日別の表（日付｜確定シフト｜出｜退｜店の修正｜遅刻・当欠・早退｜実働｜備考｜時給分（時給制のみ・月給は —）｜日計）・同じ操作（日を追加・行から時刻修正・シフト無し出勤→シフトとして確定・CSV・印刷用・この月のシフトを開く）・同じ部品を使う（別実装にしない）。月給のスタッフは時給分と日計を —・見出し行に「月給 ¥n（固定）」。
②スタッフ › 勤怠・報酬タブは月次サマリのまま。行を押したとき＝源泉・控除の入力（今のまま）の上に「日ごとの勤怠を開く」の副ボタン（中央）→給与 › 勤怠（スタッフ）の同じ人・同じ月へ。サマリの出勤日数・実働は日別の表と同じ関数で一致（suite で突合）。
③390px＝キャストの勤怠と同じカード化・シート化（C2-7 と同型）。
M-24 末尾の遷移リンクを中央の副ボタンに（詳細）:
①キャスト詳細シート末尾「機密・税務情報へ（システム設定）」＝テキストリンクをやめ .nox-actions の副ボタン（中央・ラベル「機密・税務情報（システム設定）」）。
②同じ型（シートやパネルの末尾に遷移のテキストリンク）を grep で全画面洗い、同じ副ボタンに統一。対象一覧を報告。便 BTN の f0 機械判定（教訓122）の対象に含める。」
**M-25（C2-7 の給与一覧＝相談役 2026-10-29・読取の結果）**: C2-7「1,024px 未満は画面下のシート」は勤怠タブ（attendance-board.tsx＝BottomSheet・useNarrow(1024)）だけに実装され、給与一覧の右パネル（payroll-board.tsx）には一度も入っていない（git log -S BottomSheet＝0 件・suite c2(3-6) も attendance-board だけを pin）。本番 390 で内訳が合計行の下に積まれるのは裁定365（GV-13＝.nox-paycols は 1,280 未満で aside を全幅で下へ）の仕様がそのまま効いている状態＝巻き戻りではない。**M-25 の範囲**＝payroll-board の右パネルの中身（差引支給額・支給・控除・前借り／送り・明細プレビュー・支払を記録）を 1,024px 未満でキャスト行を押したら bottom-sheet で開く・開いた行ハイライト・閉じると同じ位置・確定前の一覧と支払ステップ（未払／明細 PDF）の一覧の両方（同じ表＝payroll-board の rows 表）・suite ⑦＝390／768 でシート・1,280 で右パネル（c2(3-6) を payroll-board にも広げる）。
**M-26（「仮シフト」の残り＝相談役 2026-10-29・監査の結果）**: M-13 の旧語の置換は「『確定』タブの承認待ち」の 2 文だけ（7391933）で、「仮シフト」は描画文字列に 5 件残存＝shift-board.tsx 2410（「人数の過不足は「仮シフト」タブで見ます」）／2694・2816（「仮シフトを保存しました」）・dashboard-board.tsx 296（「仮シフト未確認 n名」）・notices-board.tsx 45-47（「仮シフト公開」のテンプレ）。現行の語（シフト作成→③配置／配置を保存しました 等）に置換し、suite m(13-1) に「仮シフト」の不在 assert を追加。
**M-28（相談役 2026-10-29・便 M3 に追加・DB 変更 0）＝本文（逐語）**: 「M-28 マスタ › スタッフ・システムの下段タブ（キオスク端末／操作担当PIN／レシート・プリンタ／機密・税務情報）が小さく目立たない（DB 変更 0）:
① 給与の上段タブ（キャスト／スタッフ／勤怠）と同じ .nox-seg（40px・青枠・選択中は塗り）に置換。アイコンは残してよいが文字サイズは他のセグメントと同じ。390px は 2 行折り返し（各 50%）。
② 同じ型の小さいタブ列が他のマスタ画面・店舗設定にもあれば grep で洗い、同じ部品に統一。対象一覧を報告。
③ 同画面の不整合＝KPI「登録端末 1 台」と一覧「0 台」。デモ org は 403 で一覧が空になるため、デモでは KPI も一覧と同じ元から出すか、一覧に「デモ環境では端末を発行できません」の 1 行を出して KPI は 0 台にする（相談役案＝後者）。本番 org では KPI と一覧の件数が一致することを suite で突合。」
**M-17 追補（相談役 2026-10-29・便 2 に同乗＝未コミットだったため・DB 変更 0）＝本文（逐語）**: 「①「率を指定」の既定値＝店の率（store の card_fee_rate）。入力欄の左右に −／＋（0.5% 刻み・0〜20%・長押しで連続＝C2-8 と同じ部品）。直接入力も残す。入力・±はその場で手数料に反映（blur 待ちにしない・現状「10」と入れても ¥0（指定 0%）のままの不具合を直す）。② カードを選んだとき＝上の集計に「カード手数料 ¥b（n%）」の行を足し、残額＝伝票の残額＋手数料（¥34,540）に更新。赤字の大きい数字のラベル＝「カードでのお支払額」・額＝残額＋手数料。その下に小さく「残額 ¥a＋手数料 ¥b（n%）」。入金額の既定＝残額＋手数料。「なし」なら手数料行を消して元の残額に戻す。③ 末尾の「カード手数料 率を指定／お客様からもらう額」の枠は ② と重複するので撤去し、注記 2 行（伝票の行として残る・売上には含めない・併用時はこの方法の分だけ）は手数料の枠の下に移す。④ 現金（0187 の CASH）も同じ型＝赤字の大きい数字のラベル「現金でのお支払額」・額＝残額−現金割引・下に小さく「残額 ¥a−割引 ¥c（n%・合計から／小計から）」。suite（verify:nox-0187）に足す＝率 ± で手数料が即時に変わる・カード選択で残額が ＋手数料 になり「なし」で戻る・入金額の既定＝残額＋手数料。live に足す＝ACE 1,280／390 でカードを選び ±2 回→手数料と残額が変わる。」
**裁定435（提案中・相談役 2026-10-29・Agoora 確定後に投入・まず読取）＝便 K（キオスクの機能拡張）・本文（逐語）**: 「便 K（キオスクの機能拡張・裁定435）:
① 読取：キオスクのホームのタイル（出退勤／レジ／シフト）の実装・PIN 解除の仕組み（解除中の role の持ち方・無操作 3 分の戻り）・/kiosk-register が既存のレジ画面をどう再利用しているか。
② /kiosk-shift を作る＝PIN 解除後に本人の /shift（店長以上＝管理・スタッフ＝権限どおり・キャスト＝自分の今日タブ）を同じ部品で表示。
③ 在庫（棚卸し・入庫）と日報（閲覧・締め）のタイルを追加＝PIN 解除後に本人の権限どおり（在庫・日報の権限がない人には出さない・キャストには出さない）。
④ 給与・マスタ・顧客・分析・監査はキオスクに出さない（ルートガード）。解除中の画面にはヘッダーに「〇〇さんとして操作中・ロック」を常に出す。
⑤ suite：タイルの出し分け（オーナー／店長／シフト ON スタッフ／キャスト）・3 分で戻る・ガードの 403。live：CLUB NOX の入口タブレットで PIN 解除→シフト・在庫・日報が開き、給与は出ない。
DB 変更 0 の見込み。要れば 0190 起草のみ。」
**裁定435 追補＝K-0（相談役 2026-10-29・便 K の先頭・まず読取）・本文（逐語）**: 「K-0 キオスクのレジを本店のレジと同じ部品に統一（裁定435 追補）:
① 読取：kiosk-register/page.tsx の中で「キオスク固有で残すもの」だけを列挙（端末ログイン・PIN 解除と解除中の本人・交代／離席・自動ロック・端末の店舗の固定）。それ以外（開卓・顧客・指名・席・延長・注文・明細・請求・入金・締め）は本店の register-board と比較せず、すべて撤去対象として扱う。
② 実装：kiosk-register を上の固有部分だけの包みにし、中身は register-board を同じ props で描画（店舗＝端末の店舗に固定・操作者＝PIN 解除中の本人・権限は本人の role と裁定420 の 3 段階）。本店で直したもの（開卓シート・EXT・427・手数料 4 択・CASH・M-17・420・422・424）がキオスクでも同じ挙動になることを suite と live で確かめる。古い写しは削除（git に残る）。
（①②は相談役 2026-10-29 の差し替え後の文＝旧文「差分を表に」は廃止）
③ 自動ロック＝裁定423 の無操作 3 分に統一（「15 分」の表示と実装を直す）。ロック後は PIN 画面へ戻り、開卓中の伝票はそのまま。
④ suite：本店のレジの suite（check-calc・pay・EXT・0187）をキオスクの経路でも同じ golden で通す・3 分ロック・role による操作の出し分け。live：CLUB NOX の入口タブレットで開卓シート（お客様・指名・席種）が出る・延長パターンの選択・カード手数料 ± が本店と同じ。
⑤ 台帳：裁定435 追補「キオスクのレジは本店の register-board と同一部品。キオスク専用の写しは作らない」・教訓126 候補「共用端末の画面は本体画面の包みとして作る＝写しを作ると改修が追いつかない」。」
**裁定435 追補（相談役・2026-10-29）**: キオスクのレジは本店の register-board と同一部品。キオスク専用の写しは作らない。
**教訓126（候補・相談役 2026-10-29・採番は便 K で）**: 共用端末の画面は本体画面の包みとして作る＝写しを作ると改修が追いつかない（根拠＝kiosk-register が 1,253 行の写経で、0187 EXT／CASH・M-17・427・420・422 に追随していない）。
**裁定435 追補＝K-4（相談役 2026-10-29・便 K に追加・DB 変更 0）・本文（逐語）**: 「K-4 キオスクを起動先に（DB 変更 0）:
① 端末アカウント（端末ログイン）のセッションでは / と /home 等のトップを /kiosk へリダイレクト（middleware）。本人の PIN 解除中も同じ。
② /kiosk 配下でだけ別の manifest（/kiosk/manifest.webmanifest：name「NOX レジ端末」・short_name「NOX レジ」・start_url「/kiosk」・display standalone・scope「/kiosk」・アイコンは本店と色違い）を <link rel="manifest"> で配信。apple-touch-icon も同様。本店の manifest は変えない。
③ live：iPad Safari で /kiosk を開き「ホーム画面に追加」→ アイコン名が「NOX レジ端末」・起動で /kiosk が開く・端末ログインの状態が保たれる。」
**K-0 ① の読取（2026-10-29・CC）**: 固有で残すもの＝端末ログイン（page.tsx:192–220／592–616・kiosk_operator_list・店は DB の auth_kiosk_register_store_id()）・PIN 解除と本人（:59–60／111–124／273–315／618–674・kiosk_login／kiosk_unlock／QR・role は返値の role・Session は state だけ）・交代／離席（:317–321／177–190・kiosk_lock／kiosk_logout）・自動ロック（:70 IDLE_MS 15 分・:200–210 ローカル tick・QR は kioskIdleMsOf 3 分）・店舗の固定（client は store_id を持たない＝毎 RPC で DB 判定・store_id を返す kiosk RPC は無い）。撤去対象 ≈ 955 行／残す ≈ 295 行。**前提**＝RegisterBoard の props（seats／products／categories／casts／isManagerUp／showReserve／storeId）と board 本体の多数の select は「ログイン中の人の RLS」依存＝端末ユーザーでは 0 行→**同じ部品で描くには端末ユーザーに店スコープの行を見せる鍵（kiosk_sessions を鍵にした RLS か kiosk_* 読取 RPC の拡張）＝0190 起草が前提**。approval_decide／check_void／receipt_issue 等の kiosk 腕は未確認・board に onSessionLost／onAction の props なし・裁定420 の 3 段階は settings_json の RLS 由来。
**裁定436（提案中・相談役 2026-10-29）＝K-5 打刻ゲート・端末の束縛・退店の失効＝0190 起草＋client（MIG_0190_APPLIED＝false の配下）・本文（逐語）**: 「K-5 裁定436（打刻ゲート・端末の束縛・退店の失効）＝0190 起草＋client（MIG_0190_APPLIED＝false の配下）:
① 0190（起草のみ・handpaste_0190.md・本番 BEGIN…ROLLBACK 試走・live 照合）:
 a.（差し替え・相談役 2026-10-29）on_duty_of の assert を置くのはレジの RPC だけ＝check_open／check_add_line／check_pay／check_close（延長・席移動・割引など check_* の経路で伝票を動かすものも同じ冒頭）。product_stock_add／daily_report_close には置かない。店長以上は免除・免除で通した操作は audit に 'off_duty_exempt'。store_profiles.duty_gate（既定 true）が false の店は assert しない。
 b. kiosk_devices に device_fp text・bound_at・bound_ua・unbound_at・unbound_by。kiosk_device_bind（初回ログインで束縛・別 fp は 'device bound' で拒否）／kiosk_device_unbind（オーナー・audit）。kiosk_* の RPC は auth.uid()＋p_device_fp の一致を見る。既存の 1 台（CLUB NOX 入口タブレット）は次のログインで束縛（移行）。
 c. cast_leave／staff_deactivate の中で staff_pin の削除・kiosk_sessions の終了（end_reason 'retired'）。auth 側（admin.auth.admin.signOut 全セッション＋ban）は route で RPC の後に呼ぶ。
② client：端末は localStorage に device_fp を持ち kiosk ログインと kiosk_* の呼び出しに付ける。マスタ › キオスク端末の一覧に「束縛中の端末（UA・束縛日）」と「端末を解除」（M-29 の再発行・無効化と同じ列）。店舗設定 › 利用機能に「打刻ゲート」のスイッチ（既定 ON・説明 1 行・キオスク端末が 0 台の店には注意）。退店の確認ダイアログに「ログイン・PIN は即時に無効になります」。ゲートで弾かれたときの文言＝「出勤の打刻がありません。店の端末で打刻してから操作してください」。
③（差し替え・相談役 2026-10-29）suite：打刻 fixture はレジの経路だけに足す（打刻なし→403・打刻後→通る・店長以上は通って audit に印・duty_gate=false は通る）。在庫・日報の suite は現状のまま。端末の束縛（別 fp 拒否・解除後に再束縛）・退店で PIN と kiosk_sessions が消える。golden 不変。
④ 台帳：裁定436 本文（相談役案＋店設定 duty_gate 既定 ON）・0190 の sha16・handpaste。」
**裁定436 本文（相談役 2026-10-29 の差し替え）**: 「打刻ゲートの対象はレジ（伝票を動かす操作）のみ。在庫・日報は対象外」。
**M-29（相談役 2026-10-29・便 M3 に追加・まず読取）＝本文（逐語）**: 「M-29 キオスク端末の発行（本番 CLUB NOX で「レジ」2 台目が 409 already provisioned・発行時の認証情報を後から取り戻せない）:
① 読取：端末の発行 RPC の上限の規則（店舗×用途で 1 台か・無効化済みを数えるか）・無効化→再発行で新しい認証情報が出るか・0185 の PIN 解除が複数端末で成り立つかを報告。
② 設計（相談役案・DB 変更があれば 0190 起草のみ）：上限＝店舗×用途ごとに 3 台（無効は数えない・プランで変更可）。一覧の操作に「認証情報を再発行」を追加＝旧い認証情報は即時無効・新しい ID／PASS を発行時と同じモーダルで 1 回だけ表示・監査ログに「端末の認証情報を再発行」。「無効化」はそのまま。
③ エラー文言：409＝「この店舗の『レジ』端末は上限（n 台）に達しています。不要な端末を無効化するか、認証情報を再発行してください」。他の端末 API の英語の生文（already provisioned 等）も日本語に（W-10 の型・一覧を報告）。
④ suite：上限の判定（無効を数えない）・再発行で旧い認証情報が拒まれる・新しい認証情報で端末ログインが通る。live：CLUB NOX で 2 台目の発行が通る・再発行で新しい PASS が出る。
⑤ 無効化した端末の操作列に「認証情報を再発行して有効化」（新しい ID／PASS を 1 回表示・状態→有効）と「削除」（監査ログに残す・最終アクセスのある端末は確認ダイアログ）を出す。旧い認証情報をそのまま生き返らせる「有効化」は置かない。
⑥ KPI「登録端末 n 台・すべて有効」は一覧と同じ元から＝有効台数／登録台数（例「1 台登録・有効 0」）。無効化・発行の直後に KPI と一覧を再取得。
⑦ 「端末を無効化しました」「発行しました」は成功の帯（緑／青）で出す＝エラー枠（赤）を使わない。他の端末操作の成功文言も同じ。」
**監査（2026-10-29・直近便の「済」全件×HEAD 2ab7001）**: SH-UI-c2／GV-D／W-10／便 BTN／便 M1／便 M2／OB の「済」「完了」項目を HEAD の git grep で全件照合＝あり 80 件超・**部分 2（C2-7＝M-25・M-13 の「仮シフト」＝M-26）**・なし 0。x13_ledger.md に対象 7 便の行は無い。


### 便 OB-2（2026-10-29 夜・初期設定 9 STEP の本体＝v5 が正本・裁定438 候補）

**裁定438（候補・相談役 2026-10-29）「初期設定 v5＝正本」**: 初期設定の正本＝docs/handoff/mock/setup_v5.html（9 STEP・業態 5 種・v4 は参照のみ）。画面は v5 と同じ文言・同じ順・同じ既定値。業態を選ぶと初期値が入る。入力は自動保存（再開できる）。確認画面の要確認は v5 の checks と同じ条件。「この内容で始める」で一括反映。完了画面でキャスト登録（1 人ずつ／CSV 9 列）と最初のシフト期間の募集開始。器が無い項目は画面に出して保存は「後で（マスタから）」＝0191。**採番は相談役（候補のまま記載）**。
- ④ 読取＝保存先の表（項目｜保存先｜あり／なし）＝lib/nox/setup/v5.ts **V5_SAVE_MAP**（39 行・なし 11＝店の割合 kind_back_rate／商品ごとの場内・フリーの %／締め日／源泉区分の店の既定／マイページ 3 項目（遅刻連絡・ノルマ進捗・出勤ボーナス）／PIN 5〜6 桁／シフト「店が決める」／打刻ゲート（0190）／釣銭準備金／org 単位の下書き）。
- ⑤ **0191 起草のみ**（supabase/migrations/0191_setup_v5_gaps.sql・生成器 docs/tmp/gen_0191.cjs＝live の定義＋アンカー置換・mig-check parse ok（statements 25・$function$ 9×2）・試走 docs/tmp/t0191_rollback.mts）: ★1 店設定 +5 キー（kind_back_rate／withholding_default_cast／withholding_default_staff／cash_float_default／settlement_close_day）★2 products.back_rate_by_kind＋set_product 16 引数（旧 15 引数 drop＝教訓48: 呼び出し元は PostgREST の named 引数だけ）★3 PIN 4〜6 桁（set_cast_pin／set_staff_pin／kiosk_punch／staff_punch）★4 shift_request_mode 'store' ★5 check_remove_line＝pending のキープも消す（M-30 の RPC 側）★6 setup_drafts＋setup_draft_set（owner）。client は MIG_0191_APPLIED＝false の配下（器が無い項目は注記＝保存しない・下書きは localStorage）。
- ⑥ 実装＝app/(manage)/setup/setup-wizard.tsx（v5 の 9 STEP・主ボタン中央 .nox-actions・?step／?type の深いリンク・自動保存＝localStorage 店ごと・完了画面＝1 人ずつ／CSV／PIN 印刷／ホームへ・発行したログイン ID と初期 PW は完了画面に 1 回）・lib/nox/setup/v5.ts（純関数＝テンプレ値の写経・checks・CSV・buildV5Plan＝既存 RPC と route 3 本の呼び出し列・castPlanOf）・page.tsx（税設定の現値・?step／?type）。既存の org（setup_done true）には layout が出さない（従来どおり）。
- ⑦ suite **verify:nox-ob2**（正本の存在・テンプレ値の逐語 pin・業態 5 種の計画の行数と値・要確認の条件・CSV 9 列と不正行・再開の往復・画面の pin・本番 BEGIN…ROLLBACK＝A1 で RPC 段を実行して行と値を突合・A2 を空にして席／料金／商品／プランの guard 段）＋pin 張替え（setup 5-x／w52a／ob／x13g／actions-center ＋9 画面）。
- ⑧ org 作成＋オーナー招待（読取＝本番に「org を作ってオーナーを招待する」経路は無かった＝seed／create-demo-orgs（デモ）だけ・招待メールの送り元と URL の有効期限は Supabase Auth の設定（コードには無い＝既定 noreply@mail.app.supabase.io／OTP expiry）・パスワード設定の画面も無かった）→ **scripts/admin/create-org.mjs**（orgs＋org_billing active＋stores{biz_type, setup_done false}＋inviteUserByEmail（--link で generateLink）＋users＋memberships owner＋audit_logs create_org・本番 ref は NOX_PROD_CONFIRM=1・運営の確認 1 回・失敗は巻き戻し）＋**/auth/set-password**（implicit／PKCE／token_hash の 3 形を受ける→POST /api/auth/invite-accept＝admin.updateUserById・デモ auth／デモ org は 403＝柵 A・client は auth.updateUser を呼ばない）→ ログイン → (manage) layout が規約の同意（/terms/accept）→ 初期設定 STEP 1 へ（setup_done false の間は他の画面に行けない＝従来の redirect）。
- **仮決め（相談役案で確定扱い）**: (a) 下書き＝localStorage（店ごと）＝org 単位の表は 0191 の後 (b) キャスト 1 人ずつ登録に生年月日を足した（cast_create が 18 歳判定で必須・CSV 9 列には無い＝CSV の人は登録後にキャスト画面で）(c) 体入＝cast kind '体入'＋待遇プラン「体験入店」（trials 表は使わない）(d) スタッフは /api/staff/create（初期 PW 方式・email は後からスタッフ管理）＋staff_contract_set＋set_staff_perms＋set_staff_pin（4 桁＝5〜6 桁は 0191 の後は自動で 4 桁）(e) 店の端末＝「この内容で始める」で /api/kiosk/provision（purpose register）＝ID と初期 PW を完了画面に・端末でのログインは /kiosk-register から（オーナーのセッションを切らない）(f) 打刻の「条件に合わないとき」＝punch_require_shift（hard＝block／soft＝warn）・丸めの方式＝nearest (g) 報酬率スライドの段＝待遇プランで（pay_rate_tiers の写像は画面で）(h) 新しい org の org_billing＝active（seed と同じ・Stripe 接続後に切替）(i) 招待は Supabase の既定メール（カスタム SMTP・10 分の期限は Dashboard の設定＝コードでは決められない）。

**M-30（相談役 2026-10-29・便 M3）＝本文**: 「行を消すと pending のキープが残り得る＝check_remove_line で bottle_keeps を削除」。RPC 側は 0191 ★5（pending だけ削除・active は開栓済みなので残す）。client（便 M3）＝行削除時に pending のキープを取り消す（0191 の前も残さない）。

**教訓126（候補・相談役採番のまま）**: 共用端末の画面は本体画面の包みとして作る＝キオスクのレジは register-board を同じ props で描き、固有部分（端末ログイン・解除・交代／離席・自動ロック・店舗固定）だけを包みに置く。写しを作ると本体の直しが届かない（0187 の割引欄・延長のご案内がキオスクに無かった）。

### Agoora 確定 10/27（4）＝M-24（実機指摘 10/27 15:52・デモ LUNA・キャスト詳細）

出典＝相談役ブロック 2026-10-27（Agoora の実機指摘）。便 M3 に入れる（日払いの種別の 1 項目は 0188 の便の client 分に追記）。390px 基準・live に 390 相当と「主ボタン中央」。**本文（逐語）**:
「- M-24 キャスト詳細のモーダルの末尾にある文字リンク 2 つ（「機密・税務情報へ（システム設定）」→ /master/system・「待遇プラン・報酬シミュレーターへ」→ /master/cast-comp/plan）を、副ボタン（枠線）にして .nox-actions で中央に置く。
- 同じ型（区切りの末尾・画面の末尾に置いた「〇〇へ」の文字リンクで別画面へ移るもの）を全画面で洗い出し、同じく中央の副ボタンにする。文中のリンク（説明文の中の「料金設定」など）はそのまま。
- verify-nox-actions-center に、この型（ブロックの末尾に単独で置いた遷移リンク）を検知する判定を足す。教訓122 に 1 行追記。
- 0188 の便の client 分に追記：日払いの発行の「種別」は settlement_cycle≠daily の店では「前払（仮払）」だけを出す（日次精算のタブを出さない）。前払のプレビューは「源泉 0（期の精算で差し引き）」と表示し、「月次と同じ式・日数 1」の説明は日次精算のときだけ。」

### Agoora 確定 10/27（3）＝M-20〜M-23（実機指摘 10/27 15:50・デモ LUNA・PC）

出典＝相談役ブロック 2026-10-27（Agoora の実機指摘）。順番＝今の順番（便 M2→0187→0188→0189 の起草）は変えず後ろに積む。M-21＝0188 の便の client 分（フラグ配下）・M-20／M-22／M-23／置き場所の整理＝便 M3（0189 の起草の後）。いずれも 390px 基準・主ボタン中央・live に 390 相当と「主ボタン中央」。**本文（逐語）**:
「- M-20 スタッフ一覧（/staff）に「＋スタッフを追加」（.nox-actions 中央・キャストの追加と同じ形）。staff_create で作り、続けて招待まで。追加の時点で働き方（M-21）も入れられる。
- M-21 働き方の欄（キャスト詳細・スタッフ詳細）：雇用形態（業務委託／アルバイト・パート／正社員）・給与の形（時給／日給／月給・キャストは今の報酬プランのまま）・額・源泉区分（裁定434 の none／hostess／その他 204 条／manual・雇用形態から既定・変更可・「肩書ではなく業務内容で選ぶ。接待が業務ならホステス等・実態が雇用なら給与」の注記）。スタッフは staff_contract_set（0176）で保存・キャストは cast_tax_profiles。0188 の便の client 分として作る（フラグ配下）。
- M-22 勤怠・報酬の月の入力（今は「2026-10」の手入力）を、他の画面と同じ月の切り替え（◀ 2026年10月 ▶）に。
- M-23 スタッフの勤怠の行を押すと、その月の日ごとの勤怠（日付・出勤・退勤・休憩・実働・打刻の修正）を出す。キャストの勤怠と同じく行から時刻を直せる（M-14 の形）。源泉区分・額の指定・社員の控除の欄はその下に。
- 置き場所の整理：スタッフの勤怠・報酬の正本は「給与 → 勤怠（スタッフ）」の 1 か所。「スタッフ → 勤怠・報酬」のタブはそこへ移るだけにする。給与の画面のタブ「勤怠」は「勤怠（キャスト）」に改名。2 つが同じ部品か別実装かを先に確かめ、別実装なら片方を撤去。」

### Agoora 確定 10/27（2）＝便 EXT の値段の決め方・0188 の範囲（2026-10-27 夕）

出典＝相談役ブロック 2026-10-27（報告受領後・Agoora 確定）。**本文（逐語）**:
「- 便 EXT の値段の決め方：check_open は、その営業日の曜日・その席種の延長パターンを時間帯を問わず全行凍結する（曜日の絞りは残す）。延長を足すとき（check_extension_add・自動延長の check_time_charge_apply）は、その延長の開始時刻の時間帯に合う行を凍結の中から選ぶ。手動で行を指定したときはその行。案内には今の時間帯に合う延長時間を全部出し、タップでその行を足す。0182 の check_move_seat の再凍結も同じ形に揃える。
- 0188 の二重控除：月次（settlement_cycle≠daily）の店では daily_pay_issue が kind 'settlement' を拒否する（裁定434 ④ を DB でも）。pay.ts は念のため、その期の settlement の日払いの日を 5,000 円×日数の日数から除く。デモ LILY の 4 件（9/10〜9/20）は gen-demo で kind 'advance' に直す。
- (c) の「advance を先に渡した分を 1 回の支払に含めるか」は税理士確認の項目として専門家確認の正本に T20 で追加（その他 204 条の人が出るまで実装は月次 run の課税額で判定）。
- (d) staff_contracts.withholding_rate は読まない列にして画面から消す。スタッフの契約の行は 0176 の staff_contract_set を画面から呼ぶ（client）。委託の既定は none。
- TS で mode だけ見ている箇所（日払いのプレビュー・adjust.ts・明細の源泉行の名前・シミュの係数・CSV の列）は 0188 と同じ便で withholding_kind 優先に直す。」
**順番（同ブロック）**: ①便 M2（M-15・M-16 の翌表記を除く部分・M-18・M-19＋事後承認 A 15-③）→②0187 起草（便 CASH＋便 EXT＋remove_store_special_day の billing_writable_of）→③0188 起草（裁定433＋裁定434＋二重控除の拒否＋daily_pay_issue が withholding_kind を読む・client／TS 分も同じ便でフラグ配下）→④0189 起草（M-16 の翌表記）。起草は DB に流さない（Agoora の手貼り）。
**CI（12-⑦）の原因（2026-10-27 読取）**: ubuntu-24.04 に固定しても「Verify (pure suites)」が赤（4c5982a）。手元で再現＝.env.local なし（CI と同じ）で verify:ci を回すと verify:nox-punch-match が「.env.local に SUPABASE_DB_URL が必要」で止まる＝0154（2026-09-24）で punch-match に足した DB 段 (9)（打刻の修正申請・pg tx）が env を必須にした。直し案＝(9) を SUPABASE_DB_URL が無いときだけ SKIP（CI）にするか、DB 段を別 suite に分ける（f0 では従来どおり走る）。直しは便 M2 の後。

### 手貼り 0180〜0186 の締め（2026-10-27）

Agoora が 7 本を手貼り（0185→0180→0181→0182→0183→0184→0186）＝各 verify の返り値は全行が期待どおり。CC の照合（読取・BEGIN…ROLLBACK・DB 恒久変更 0）＝各ファイルの sha16 と行数・`$function$` 本体の md5（本番は SQL Editor の CR を除いて比較）が全関数で一致・関数数 367→382（0185 +3・0180 +1・0181 0・0182 0・0183 +6・0184 0・0186 +5＝+15）・表 104→110・新設／作り直しの RPC を実際に呼んで実行時エラー 0（docs/tmp/t0185_post.mts 19/19・t0180_0181_post.cjs 16/16・t0181_live.cjs（MUSE VIP 35・通常 30）・t0183_post.mts 11/11＋md5・t0184_post.mts 4/4（課税額 16 点で withholding1021Of と 1 円も違わない）・t0186_post.mts 8/8）・NOX-VERIFY の残留 0。フラグ＝lib/nox/rules-0175/flag.ts の 7 本すべて true。
- **小さな直しの候補（次の mig に同乗・今は起草しない）**: remove_store_special_day に billing_writable_of の確認が無い（set_store_special_day にはある）＝揃える。
- **0183 の (a)**: payroll_withholding_overrides／payroll_employee_deductions の period は YYYY-MM＝payroll_runs.period も CHECK で YYYY-MM・period_bounds も月だけ＝run は精算方式（settlement_cycle）に関係なく月単位で、half／weekly／daily は源泉の暦日数の注記と日払いの種別だけ（本番 10 店とも settlement_cycle 未設定＝月次）＝今は足りる。半月・週の run を作るときは run・上書き・控除の 3 つの period を一緒に設計し直す。
- **0183 の (b)**: キャストの源泉区分は「税務情報を保存」で set_cast_tax_profile（upsert＝行を作る）の後に set_withholding_kind を呼ぶ＝not found にならない。スタッフは契約の行がある人だけ区分の選択が出る（行を作る動線＝B の 6-④）。

## 裁定434（2026-10-27 確定・Agoora）源泉区分を 4 つに（other_fee 廃止）・委託スタッフの既定 none・支払調書・日払いの kind の出し分け

出典＝相談役ブロック 2026-10-27（Agoora 確定・専門家確認 T11／T17 の調査回答を受けて・税理士の最終確認待ち＝10/27 に Agoora が確認のメールを送付・**税理士の返事で違いが出たら、その点だけ本裁定を改める**）。適用＝未着手（DB 分は 0188 に同乗＝裁定433 の税率表・daily_pay_issue ほかが withholding_kind を読まない穴の直しと一緒・起草は相談役の合図）。裁定432 ① の区分（hostess／other_fee／manual／none）を置き換える。**本文（逐語）**:
「1. 源泉区分を 4 つに：none（対象外）／hostess（ホステス等＝(報酬−5,000 円×計算期間の日数)×10.21%）／その他 204 条（1 回の支払金額のうち 100 万円以下 10.21%・超える部分 20.42%）／manual（給与＝雇用・NOX は税額を計算しない）。other_fee（委託スタッフ 10.21% 定率・控除なし）は廃止。
2. 委託スタッフの既定＝none。区分の選択画面に「肩書ではなく業務内容で選ぶ。接待が業務ならホステス等・実態が雇用なら給与」と注記。
3. 支払調書：hostess＝同一人への年間支払が 50 万円超で対象。その他 204 条の提出基準は税理士確認まで注記のみ。none は対象外。
4. 日払い：kind 'settlement'（計算期間 1 日・5,000 円×1 日を控除）は settlement_cycle＝'daily' の店だけ選べる。それ以外の店の日払いは kind 'advance'（その場で源泉なし・期の精算で源泉）だけ。
5. DB 分は 0188 に同乗（裁定433 の税率表・daily_pay_issue ほかが withholding_kind を読まない穴の直しと一緒）。」
**影響**: 裁定432 ① の other_fee（T11 待ちの仮置き）はこの裁定で廃止＝T11 は調査回答（税理士の最終確認待ち）。裁定431 ⑤（日次精算の 5,000 円×日数＝T17 待ち）は ④ で「日次精算は daily の店だけ」に置き換わる。事後承認 4-④（スタッフ委託の率が 10.21% 以外の契約）・6-④（スタッフの契約の行を作る動線）は前提が変わる＝0188 前の読取で直し方の案を出す。

## 裁定433（提案中）源泉の税率表（運営側・適用開始日つき）

出典＝相談役ブロック 2026-10-27（便 L で本文を収載＝教訓70）。適用＝未着手。mig 番号＝0188 で分ける案（**Agoora 回答待ち**）。**本文**:
①源泉の税率（現行 10.21%＝所得税 10%＋復興特別所得税 0.21%）を運営側の税率表に持つ（店ごとではない）。各行に適用開始日を持ち、**支払日**で行を選ぶ（計算期間ではなく支払った日）。
②2027 年以降の内訳（所得税／防衛特別所得税／復興特別所得税）を行の内訳として持てる形にする（合計 10.21% は不変の見込み・明細と支払調書で内訳を分けるかは税理士 T19 待ち）。
③編集 UI は運営管理画面（別フェーズ）。当面は行の追加を mig で行う（店からは読取のみ）。
④起草は 0180〜0186 の本番適用後に、本番の pg_get_functiondef を元に（開始は相談役の合図）。
**CC 注（本文ではない・起草時の論点）**: 現行の式（裁定431 ②＝floor(課税額×1021÷10000)・pay.ts と 0184 の daily_pay_issue）を税率表の率から引く形に置き換えるとき、現行行の率＝10.21% なら golden 不変。

## 裁定417（2026-10-23 確定・相談役案＝連続便 2 PR-1 R-4・Agoora 承認 2026-10-23）同伴の正本化＝伝票が正本・同伴があれば遅刻免除

出典＝連続便 2（2026-10-23）R-4。**本文（逐語）**: 「R-4 同伴の正本化（裁定417・相談役案＝伝票が正本・同伴があれば遅刻免除）: 先に読取＝シフト今日タブの「同伴」ボタンの書き先と読み手（遅刻判定・同伴バック・ノルマの同伴本数・給与）を 3 行で報告。実装＝今日タブの同伴ボタンを外し、伝票の同伴（check_set_nominations の同伴フラグ）をその営業日・そのキャストで読んで「同伴（A2）」の印を出勤記録の横に出す（伝票で外せば消える）。遅刻判定はその営業日に同伴があれば免除（出勤記録は実時刻のまま・印に「同伴のため遅刻扱いなし」）。同伴バック・同伴本数は伝票だけを数え、シフト側の旧値を読んでいたら外す（旧値の列の削除は 0175 v2 に追記）。/mine の今日も同じ。」
**読取（R-4）**: 今日タブの「同伴」ボタン＝attendance_set(p_status 'dohan')＝attendance.status（1 行 upsert）。読み手＝①遅刻判定＝punch-match の applyAttendance（status dohan→final ok＝late を打ち消す）②同伴バック・ノルマの同伴本数＝cast_sales_aggregate（check_nominations.is_dohan＝伝票）＝**既に伝票だけ**③給与の出勤日数（collect.ts attendanceDays）は shukkin／late／dohan を数える（同伴＝出勤扱い）④今日タブの KPI 出勤済み（shukkin／dohan）。
**適用**＝便 PR-1（lib/nox/shift/dohan-mark.ts＝dohanSeatsOf／dohanMarkTextOf／lateExemptByDohanOf／attendanceWithDohanOf・collect.loadPunch が check_nominations（is_dohan・checks!inner・void 除く）を読み attendance に重ねる＝給与・勤怠一覧・/mine の勤怠が同じ入口・今日タブ＝ボタン撤去＋「同伴（A2）」の印＋注記・/mine の今日＝同じ印）。**旧値の削除＝0175 v2 ★17**（attendance.status から 'dohan' を外す・既存行は shukkin へ・attendance_set の値域）。**承認済み（2026-10-23・連続便 3 冒頭で全件）**

## 裁定416（2026-10-23 確定・相談役案＝連続便 2 PR-1 R-2・Agoora 承認 2026-10-23）時給の日付解決＝営業日単位・保証は下限（高い方）・同じ時給が続く区間ごとに明細 1 行

出典＝連続便 2（2026-10-23）R-2。**本文（逐語）**: 「R-2 時給の日付解決（裁定416・相談役案＝営業日単位・保証は下限＝高い方）: 各シフトの営業日 d で rate(d)＝max(保証（開始〜期限内のみ）, その日に有効なスライド段, 基本時給)。深夜またぎは出勤した営業日の時給。同じ rate が続く区間でまとめ、明細の支給は区間ごとに 1 行「時給 ¥3,200/h × 70.2h（10/1〜10/24・保証）」「時給 ¥2,200/h × 18.7h（10/25〜10/31・基本）」。合計 h は SH-UI-c の C-1 と同じ関数。半月判定のプランは判定日を境に 2 区間。取消済み（cancelled_at）の行は計算から除外（P175 後に有効）。」
**読取（R-1）**: rate(d) は既に営業日単位＝assemble.guaranteeInputOf（保証行→baseByDay）→pay.ts wageDetail（日ごと max(売上段, pt 段, max(保証, 基本))＝裁定287-5 N3）。明細だけが加重平均 1 行＋「うち基本／うち保証」の補助行だった。時給の変更履歴の器は無し（保証＝cast_plan の 3 行形）→**0175 v2 の cast_rate_history**（P175 後に読む）。ACE るなの 9 月 ¥2,200＝保証外（体験入店プランの基本）で正しい。
**適用**＝便 PR-1（lib/nox/payroll/wage-spans.ts＝wageSpansOf／wageSpanLabelOf・WageDay に gua 印・breakdown-lines timeLinesOf＝区間 2 つ以上で区間行（Σ＝timePay・端数は最後の区間）・1 区間は従来の 1 行＋補助行＝golden 不変・period／splitAtD（半月＝[16]）は右パネルと PayslipSlip が同じ引数）。R-3＝ACE るなの保証を当月 1 日〜R−2（開始日を明示）に＝10 月の支給が 2 行。cancelled_at の除外は P175 client。**承認済み（2026-10-23・連続便 3 冒頭で全件）**

## 裁定415（2026-10-22 確定・相談役・便 SH-UI-c A-0／S-7）指名かぶり＝他卓に着卓中のキャストを指名に入れたとき、指名は必ず入れ（両伝票に指名料）、席だけを聞く（B 案）

出典＝相談役ブロック 2026-10-22（便 SH-UI-c）。**本文（逐語）**: 「裁定415＝他卓に着卓中のキャストを指名に入れたとき、指名は必ず入れ（両伝票に指名料）、席だけを聞く（B 案）。」「S-7 指名かぶり（裁定415・DB 変更 0）: 伝票「指名・席」で他卓に着卓中のキャストをタップしたとき、ダイアログ＝「るな は A3 に着卓中です（指名かぶり）。この卓の指名料は入ります。A3 の伝票は変わりません。席はどうしますか？」＋ボタン「指名だけ入れる（席は A3 のまま）」「指名して A3 から付け回す」＋キャンセル。前者＝指名のみ追加（席の節は変えない）。後者＝指名追加＋S-6 の付け回し（着席ログに退席・着席）。どちらも A3 側の指名料・分配率は不変。キャストカードのバッジは「本指名」と「着卓中（A3）」の両方を出す（指名を入れても着卓情報を消さない）。分配率の節の行にも「A3 着卓中」の小さな印。suite＝両ボタンで指名料が両伝票に入る・前者で席が動かない・後者で着席ログが 2 行増える。」
適用＝便 SH-UI-c（components/nox/nom-conflict-dialog.tsx・lib/nox/register/seat-roster.ts nomConflictTextOf／servingMarkOf・register-board の onPick→setNomConflict・addToRoster(id, "hon")・cast-picker の両バッジ）。RPC 変更 0（check_set_nominations は伝票ごと＝他卓の伝票は触らない）。【事後承認待ち】

## 裁定414（2026-10-21 確定・相談役・便 S S-4）送りの 4 方式（実費／定額／店負担／なし）＝方式ごとに現金支払・給与控除・諸経費へ載せ分ける・文言は方式の 1 文・「発行」は送りに使わない（「記録」）

出典＝相談役ブロック 2026-10-21（便 S・S-4 読取→承認）。**本文（逐語・読取の枠）**: 「S-4 送りの 3 方式の整合（裁定414）: 読取＝店設定の送り方式（実費／定額／店負担／なし）の保存先と、退勤ダイアログ・今日タブの「送り」・日報の現金支払・給与の控除・/mine の明細がそれぞれ方式をどう読み分けているかを一覧で報告（方式を読まずに一律で現金支払と控除の両方に載せている箇所があれば列挙）。正＝実費＝レジ現金が出る（日報の現金支払「送り立替」）＋同額を給与から控除／定額＝現金は動かず給与から定額控除（日報の現金支払には載せない）／店負担＝日報の諸経費「送迎費」に載せ控除なし／なし＝送りの導線を出さない。文言＝方式ごとに：実費「送り代 ¥1,000 を立て替えて退勤（給与から控除）」、定額「送り ¥1,000 は給与から控除します（現金は動きません）」、店負担「送り代 ¥1,000 を店が負担して退勤」。「発行」は送りに使わない（「記録」）。日報の内訳の行名も「送り立替」「送迎費（店負担）」に。退勤ダイアログの説明文を方式の 1 文に差し替え。デモ payload＝ACE 実費・LUNA 定額・LILY 店負担・NOIR なし（348 のとおり・ずれていれば直す）。suite＝4 方式で現金支払・諸経費・控除の 3 か所に正しく載る／載らない。golden に影響する場合は影響する段と差を報告してから更新。live＝ACE（実費）で退勤→現金支払に ¥1,000・給与の控除に −¥1,000、LUNA（定額）で退勤→現金支払に載らず控除だけ、LILY（店負担）で退勤→諸経費に載り控除なし（確認後に取消・デモ org のみ）。」
**本文（逐語・承認の枠）**: 「S-4 承認（裁定414・DB-first）: 設計は読取の提案どおり＝okuri_mode を 'actual'／'flat'／'store'／'none' の 4 値（既定 'flat'）・set_store_okuri_mode の受理値拡張・transport に mode 列（既定 'actual'）・RPC 4 本（transport_issue／bulk／self／kiosk）は 'none' だけ拒否し他は mode を刻む・okuri_default_of は actual 以外の 3 方式でも p_okuri を聞く。番号＝台帳の予約を見て、0177 が LINE（裁定401）に予約済みなら次の空き（0178）で単独。予約が無ければ 0177。選んだ番号と理由を報告。本便では起草まで（流さない・Agoora が手貼り＝P）: Downloads/<番号>_okuri_mode_4way_draft.sql（up と確かめの select を同じファイルに。既存 flat 店の「deductions マスタの月額固定控除」はそのまま残す＝別物。退勤ごとの定額控除は mode='flat' の transport 行で表す。既存 transport 行は 'actual' で埋める）。scripts/mig-check（ローカル ROLLBACK）で構文検査。client は今便で mode を読む形に書き、'store'／'none' の値は P 後に初めて現れる前提＝値が無い間は従来どおり動く: ①退勤ダイアログ・今日タブ・/mine・kiosk の文言を方式の 1 文に、「発行」→「記録」 ②日報の行名「送り実費」→「送り立替」、諸経費に「送迎費（店負担）」の内訳行（mode='store' の当日分・W-24 と同じ型・値が無ければ行を出さない） ③給与 collect.loadTransport で mode='store' を除外 ④/mine 明細の「送り」行は mode を読んで「送り立替」「送り（定額）」に ⑤設定画面は 4 択だが、'store'／'none' は P 前は「適用後に選べます」で無効化。suite＝純関数（方式→現金支払・控除・諸経費の載る／載らない）＋DB 段は P 後に有効（今は skip と明記）。デモ payload（LILY 'store'／NOIR 'none'）と demo-profiles pin・demo_golden の stores 行の更新は P 後の便（今便では差を報告するだけ）。live（今便）＝ACE（actual）で退勤→文言が実費の 1 文・現金支払の行名が「送り立替」・給与控除に同額。LUNA（flat）で退勤→送りの導線が出る（P 前は従来どおりの挙動で可・差を報告）。報告に加える: 番号・起草の行数と sha16・mig-check の結果・P 後に残る作業の一覧（payload・golden・DB 段の suite・設定画面の有効化）。」
**読取（便 S）**: 保存先＝stores.settings_json.okuri_mode（'flat'／'actual'・キー無し＝flat）＋okuri_base_amount。読み分け＝退勤ダイアログ・今日タブ・/mine・kiosk＝actual だけ／日報の現金支払＝actual の transport 当日分／給与控除＝transport の open 行（方式を読まない＝実費と同額控除）／定額＝deductions マスタの月額固定（退勤ごとではない）／店負担・なし＝器なし（dm1 で「店負担＝なし」）。一律に両方へ載せる箇所＝無し。
適用＝器 **0177**（起草済み・流していない・P は Agoora 手貼り）・client＝便 S（上の現在地）・P 後＝payload（LILY 'store'／NOIR 'none'）・demo-profiles pin・DB 段の suite・設定 4 択の有効化。

## 裁定413（2026-10-21 確定・相談役・便 X13-I I-2）キャストの基本の働き方（固定休・基本の出勤時間帯・週の出勤日数の目安・適用開始日）＝店とキャストの両側で直接編集

**本文（要旨）**: 項目＝固定休（曜日・複数）・基本の出勤時間帯（開始〜終了・翌表記）・週の出勤日数の目安・適用開始日。店側＝キャスト詳細「基本」タブの本入店日の下、キャスト側＝/mine「出勤予定」の右上「基本の働き方を変更」。どちらで変えても audit と相手への通知（店→キャスト＝お知らせ、キャスト→店＝今日タブの通知欄）。雇用キャストの基本の時間帯は店のみ編集可（キャストは表示と「変更を希望する」のメモ）。使う場所＝シフト希望の提出（基本の時間帯を既定値・固定休の日は対象外）・シフト作成（固定休の日に割り当てると注意）・出勤ノルマの不足行（固定休を除いた最大日数）。**適用**＝**0176**（保存先なし＝casts に列なし・cast 設定の JSON なし）＝画面なし。裁定397 の availability（0175 予定・membership 単位の曜日×3 値＋時間帯＋メモ）に「固定休・週の目安・適用開始日・雇用は本人編集不可・変更通知」を足す形で 1 つの器にする。

**裁定410 追補（2026-10-21 確定・相談役・便 X13-I I-3／I-5）**: ①罰金ダイアログ＝今日タブで遅刻／当欠を記録したとき委託キャストにだけ（送りと同じ形・既定額＝ひな形・減額と 0 円可・増額不可・変えたら理由必須・「罰金を確定」「罰金なしで記録」・同じシフトの二重は出さない）＝payroll_adjustment_add（source 'settlement'・target_shift_id＝その日のシフト・basis＝ひな形の文）。当期の draft run が無ければ payroll_run_create で作る。②ノルマ未達の減額＝提案→確定（給与の要対応・軸ごとの内訳・適用／除外（理由必須）・減額可・増額不可）。委託＝精算調整の行（理由「ノルマ未達（10月・指名 不足 12 回）」）。③**雇用＝懲戒減給**（別の見出し「ノルマ未達の懲戒減給（雇用・労基法 91 条の上限内）」・1 回＝平均賃金の半額・当期合計＝賃金総額の 1/10 でキャップし「上限で ¥n に制限」・source 'sanction'・精算調整の行は作らない）・**就業規則チェック**（店設定「就業規則に減給の定めがある」＝OFF の店は雇用の提案を出さず案内）・平均賃金が算定できない新人は「算定不能」。**未了（0175／0176）**＝就業規則チェックの保存先（set_store_profile の白名単にキー sanction_work_rule を足す・初回のみ・audit）・除外の理由の audit（client から書ける RPC が無い）・精算調整の取消済みの状態（今は削除）・種別の列。

**裁定413 追補1（2026-10-22 確定・相談役・便 SH-UI-a A-0）**: 基本の働き方の器は 0175 の 397（availability＝membership 単位・曜日 0〜6 × 3 値＋時間帯）に統合し、**週の出勤日数の目安・適用開始日を列として追加**する（固定休＝曜日の「不可」・基本の時間帯＝可の時間帯・雇用は本人編集不可・変更通知は同じ RPC）。

## 裁定411（2026-10-21 採番・相談役・便 X13-G W-23 で適用済み）キャストの打刻＝使う／使わない（店が勤怠を記録）

出典＝v49 §2（裁定411 案）・便 X13-H H-5 で採番。**本文（要旨）**: 店設定の「打刻方法」（W5-2a＝stores.punch_methods）に「キャストの打刻＝使う／使わない（店が勤怠を記録）」を置く（別項目は作らない＝self／kiosk OFF・proxy ON の組合せ）。使わない店は /mine の打刻カードと /kiosk のキャストを出さない（/mine は「出勤・退勤は店が記録します」）・今日タブはそのまま・勤務時間の計算基準が実打刻の店は店の記録時刻を実打刻として扱う・遅刻の判定も店の記録時刻・初期設定にも同じ項目。**適用**＝ed182b4（便 X13-G W-23）。

## 裁定412（2026-10-21 確定・相談役・便 X13-H H-7）報酬の軸は店で 1 つ（売上（円）／ポイント（pt））

**本文（要旨）**: 利用機能の「報酬の軸」ラジオ 1 つ＝既存フラグから導出（ポイント制 or ポイントスライドが ON なら pt・それ以外は売上）。保存はラジオに合わせて sys_* を書く（売上→sys_points／sys_point_slide を false・pt→sys_sales_slide を false）。各種バックとスライドの ON／OFF は軸の下の 2 行。「売上歩合」の独立行は消し、表示名の分岐も「各種バック」に統一（sys_sales_rate は読まない・残すだけ）。キャスト個別の設定がある軸へは切り替えない。**適用**＝6dafc3b（lib/nox/store-systems の rewardAxisOf 他・store-systems-panel）。**要判断**＝計算（collect.ts の R-5c＝sys_sales_rate OFF で売上歩合の表を空）は読んだまま（外すと支給額が変わる）。

**裁定348 追補（2026-10-21・便 X13-H H-7）**: デモの MUSE は売上軸（ポイント制・ポイントスライド OFF・プランの pt 段も空）・pt のデモは NOIR。verify:nox-demo-profiles のピンも同値。

**393 追補3 の適用先（2026-10-21・便 X13-G W-25 ②／X13-H H-1）**: 手数料の行に外税 10% が乗るのはサーバ（check_pay が tax_category 'taxable_10' で手数料行を挿入→check_group_due の外税分岐で課税対象）＝client では直せない。**0175 で check_pay と check_group_due の両方を修正**（ACE A1: 30,993＋3,099＋310＝34,402）。

**W-24 のメモ（2026-10-21）**: 日報の「その他の現金支払」のメモは daily_reports.note の 1 行目「【その他の現金支払 ¥n：メモ】」（新しい列なし・再締めで欄へ戻す）＝0175 で列化の候補。

## 裁定410（2026-10-21 確定・相談役・便 X13-G W-20）遅刻・当欠の罰金＝精算調整のひな形の既定額で、委託キャストにだけ記録時のダイアログ（雇用は懲戒減給）・早退は罰金の対象外

出典＝相談役ブロック 2026-10-21（便 X13-G W-20）。**本文（逐語の要旨）**: 既定額は店舗設定「精算調整のひな形（委託）」の遅刻・当欠（新しい金額欄は作らない・「遅刻・当欠の検知（閾値）」パネルにはひな形へのリンクのみ）。今日タブで遅刻・当欠を記録したとき（自動遅刻は遅刻チップから）、委託キャストにだけ送りと同じ形のダイアログ＝金額（初期値＝既定額・減額／0 円可）・既定額から変えたら理由必須・キオスクには出さない。精算調整の行として明細へ（「時給の減少」とは別の行）・取消／変更可・audit。雇用キャストにはダイアログを出さず、給与画面の懲戒減給（91 条の上限）で扱う。早退は罰金の対象外＝実働の減少（punch）か不足分の自動起票（shift・裁定324）で扱う（ひな形の早退行は既存データ保護のため残す）。
**器（W-0 ④）**: ひな形＝stores.settings_json.settlement_presets（set_store_profile・既存）・起票＝payroll_adjustment_add（source 'settlement'・reason・basis・target_shift_id＝既存）・明細＝breakdown-lines の調整控除の行（既存）・懲戒減給＝sanction（source 'sanction'・RPC が 91 条の上限・既存）。**元の記録の参照が shifts 固定（target_shift_id）**＝attendance／punch の id を持てない → 参照列（source_table／source_id）を足すなら **0175**。ダイアログ（client）は既存 RPC で作れる＝0175 を待たずに P175 で可。

## 消費税の既定＝外税（2026-10-21 確定・Agoora 決定・便 X13-G W-15／W-20）

消費税の既定は業界で一般的な**外税**・内税は店ごとに選べる・外税は画面に明示（「（税抜）」「消費税（外税 10%）」「合計（税込）」・伝票の上部と税設定の節に外税／内税）。**新しく作る店の既定**＝DB の列既定値（stores.price_display＝'tax_included'・mig0111）を変えるには migration が要る＝**0175 行き**（本便は計算・列既定値を変えない）。初期設定 v4 の client 側は税設定を送っていない（set_store_tax_config を呼ばない＝列既定値のまま）＝P175 で「外税」を初期値にして送る。

## CC 判断の承認（2026-10-21・相談役・便 X13-G W-20）

GV-C の仮決め＝本採用はプラン切替のみ（在籍区分は書けない）／領収書の再発行は「取消→同額で新番号」の 2 段＝**承認**。**0175 の範囲に追加**＝在籍区分（casts.kind）を書き換える RPC・再発行の元と新番号の対応（reissue_of）と日付の訂正。

## 裁定409（2026-10-19 確定・相談役・便 P174 同乗）キャスト売上の配分（複数指名の卓）＝店設定 sales_split（prorate｜equal・既定 prorate）

出典＝相談役ブロック 2026-10-19（便 P174 同乗の読取）。**本文（逐語）**: 「無ければ裁定409（店設定 sales_split＝prorate｜equal・既定 prorate）として 0175 の対象に」。**読取（便 P174）**＝配分は伝票ごとの按分比（check_nominations.ratio_weight→cast_sales_aggregate）で固定・店設定の切替は無い（現在地の読取①）。
適用＝未着手。器＝**0175**（店設定キー sales_split・equal のときは按分比を人数で均等に読む＝cast_sales_aggregate／check_close の分岐）・client＝P175。

## 裁定408（2026-10-19 確定・相談役・便 D-173）VIP 料金は 2 方式＝卓ごと（1 卓に 1 回）／人ごと（お客様 1 人あたり・人数増で追加）・料金ルールごとに選択

出典＝相談役ブロック 2026-10-19（便 D-173）。**本文（逐語）**: 「VIP 料金は 2 方式＝卓ごと（1 卓に 1 回）／人ごと（お客様 1 人あたり・人数増で追加）。料金ルールごとに選択。器＝0175（読取で既存の VIP 料金の持ち方を確認）・client＝P175・初期設定にも反映」。
適用＝未着手。器＝**0175**（起草時に既存の VIP 料金の持ち方＝pricing_rules の VIP 行・billing_unit 等を読取で確認してから設計）・client＝**P175**・初期設定（ウィザード）にも反映。
**408 追補1（2026-10-19 確定・相談役・便 P174 P-3）**: **本文（逐語）**: 「VIP 料金のかかるタイミング＝セットごと（既定・VIP 席のセット料金ルールの時間に準拠・延長は延長 1 回あたりの VIP 料金を別額で加算）／入店時に 1 回だけ。卓ごと／人ごとと組み合わせ可。器＝0175」。

## 裁定407（2026-10-19 確定・相談役・便 D-173）時給スライドの方式はプランごとに単一選択（売上スライド／ポイントスライド／使用しない）

出典＝相談役ブロック 2026-10-19（便 D-173）。**本文（逐語）**: 「時給スライドの方式はプランごとに単一選択（売上スライド／ポイントスライド／使用しない）。同じ報酬項目（時給）を決めるスライドは 1 つ。別項目なら併用可（pt を達成ボーナスの軸・売上を売上バック率）。店の利用機能はプランで選べる選択肢を絞る。移行＝売上の段あり→sales・なければ pt の段→point・どちらも無し→none。デモ ACE＝sales・LUNA＝point。器＝0175・client＝P175」。
適用＝未着手。器＝**0175**（移行 SQL＝売上の段あり→sales・なければ pt の段→point・どちらも無し→none）・client＝**P175**・デモ＝ACE sales／LUNA point（payload）。裁定405（pt の付与ルール・pt を達成ボーナスの軸）と対。
**407 追補1（2026-10-19 確定・相談役）**: **本文（逐語）**: 「初期設定ではポイント制（pt の付け方）は時給スライド＝ポイントスライドのときだけ表示」。参照モック＝「NOX 初期設定 v2（iPad 向け）」https://claude.ai/artifact/PtWVBE3iFfek3GZHyrAwRu（6 ステップ＝お店／料金／キャスト待遇／シフト・勤怠／会計・レジ／確認・2026-10-19 受領）＝STEP 3 の「ポイントの付け方」節（本指名・場内・同伴・指名売上 1pt あたり）は時給スライドで「ポイントスライド」を選んだときだけ出る。裁定405（pt 付与ルール）の店の既定値を初期設定で入れる入口＝P175。

## 裁定401（案・BZ-R 後に確定・2026-10-19 便 D-173 記入）LINE 連携と送信数（BANZEN 準拠・ローンチ前）

出典＝相談役ブロック 2026-10-19（便 D-173）。**本文（逐語・相談役ブロックの要約）**: 「398 打刻設定・399 勤務条件・400 本人の連絡先変更・401 LINE 連携と送信数＝いずれも BANZEN 準拠・月給はスタッフのみ・LINE はローンチ前」。
**【案・BZ-R 後に確定】**＝本文の詳細は BANZEN の読取（BZ-R）の後に相談役が確定。LINE 連携はローンチ前。

## 裁定400（案・BZ-R 後に確定・2026-10-19 便 D-173 記入）本人の連絡先変更（BANZEN 準拠）

出典＝相談役ブロック 2026-10-19（便 D-173）。**本文**＝裁定401 の段の逐語（398〜401 は 1 文で受領）。**【案・BZ-R 後に確定】**。

## 裁定399（案・BZ-R 後に確定・2026-10-19 便 D-173 記入）勤務条件（BANZEN 準拠・月給はスタッフのみ）

出典＝相談役ブロック 2026-10-19（便 D-173）。**本文**＝裁定401 の段の逐語（398〜401 は 1 文で受領）。**【案・BZ-R 後に確定】**。月給はスタッフのみ（キャストは対象外）。

## 裁定398（案・BZ-R 後に確定・2026-10-19 便 D-173 記入）打刻設定（BANZEN 準拠）

出典＝相談役ブロック 2026-10-19（便 D-173）。**本文**＝裁定401 の段の逐語（398〜401 は 1 文で受領）。**【案・BZ-R 後に確定】**。

## 裁定403（2026-10-19 確定・相談役・便 P174 T-0 記入）/mine シフト希望のカレンダー＝日の状態 7 種・凡例を 345 の語に・過去月も確定実績・/shift 月表示も同じ色規則

出典＝相談役ブロック 2026-10-19（便 P174 T-0）。**本文（逐語）**: 「GV-60（裁定403＝/mine シフトカレンダーの日の状態 7 種・凡例を 345 の語に・過去月も確定実績・/shift 月表示も同じ色規則・休み希望のみ方式＝募集期間中の無印は出られる日）」。日の状態 7 種＝確定（時刻＋緑塗り）／確認待ち（時刻＋緑枠）／審査中（「希望」＋黄枠）／休み希望（グレー塗り）／見送り（灰字）／募集中（点線枠）／定休・期間外（減光）（便 GV-C ブロックの C-14 の語）。
適用＝GV-C（client）。x13 #81。

## 裁定402（2026-10-19 確定・相談役・便 P174 T-0 記入）領収書台帳から再発行・公開ページ・印刷

出典＝相談役ブロック 2026-10-19（便 P174 T-0）。**本文（逐語）**: 「領収書台帳の各行に再発行／公開ページ／印刷・取消済みにも再発行・同じ伝票の金額で新番号・宛名／但し書き／日付は訂正可・既定は元の取引日・元の行は自動取消＋対応関係・入金ごとの発行は会計完了モーダルと同じ・発行者と操作者を記録＝GV-C」。
**読取（便 P174 T-0・live）**＝receipt_issue(p_check_id uuid, p_amount integer, p_recipient text, p_proviso text)＝**伝票 id で呼べる**（会計完了モーダルと同じ RPC）／receipt_issue_void(p_issue_id, p_note)／receipt_issues の列＝id・check_id・serial・amount・recipient・proviso・store_name_snap・biz_date・issued_at・issued_by・token・expires_on・voided・void_note・voided_at・voided_by＝**日付の訂正（p_biz_date）・元の行との対応関係（reissue_of）・操作者 membership の引数と列は無い**→**0175 で receipt_issue に p_biz_date／p_reissue_of（元の行は同一トランザクションで取消）＋receipt_issues に reissue_of／by_membership**。GV-C は台帳の行から伝票 id で会計完了モーダル相当の発行（宛名・但し書き・金額固定）と「公開ページ」「印刷」までを client で、日付訂正と対応関係は 0175 後。x13 #80。

## 裁定405（2026-10-19 確定・相談役・便 P173 S-3 追記）ポイント制（pt 付与ルール）＝対象 6 種・付与の単位・小数 1 桁で合計してから段判定・スライド先は時給と達成ボーナスの pt 軸・プランごと（新規は店の既定をコピー）・加点のみ・/mine と給与明細に pt・デモ LUNA

出典＝相談役ブロック 2026-10-19（便 P173 S-3 追記）。**本文（逐語）**: 「ポイント制（pt 付与ルール）。対象＝本指名・場内・同伴・商品・売上・出勤日。付与＝1 件○pt／売上は指名売上のみ○円ごと○pt（既定 10,000 円＝1pt）／商品は商品マスタの pt 列。小数 1 桁・合計してから段判定。判定期間・タイミングはプランのスライド設定に従う。スライド先＝時給（ポイントスライド）と達成ボーナスの pt 軸（売上バック率には使わない）。プランごと（新規プランは店の既定をコピー）。加点のみ（マイナス pt なし）。/mine に今期 pt と内訳・次の段まで・給与明細に pt。店のポイント制 OFF なら非表示。デモ＝LUNA（本指名 1／場内 0.5／同伴 2／商品個別・月間 5 段 0／10／20／30／50pt→3,500〜6,000 円）。起票106 を統合しローンチ前に。器＝0175・client＝P175」。
適用＝未着手。器＝**0175**・client＝**P175**。**起票106（指名 pt の重みとポイント単価）を本裁定に統合しローンチ前へ**（起票106 の処置案＝comp_plans +4 列は本裁定の器設計で置き換え）。

## 裁定404（2026-10-19 確定・相談役・便 P173）達成ボーナス多段の計算方式＝店ごとに選択（max＝到達した最上段のみ／sum＝到達した全段の合計）・既定 max

出典＝相談役ブロック 2026-10-19（便 P173）。**本文（逐語）**: 「達成ボーナス多段の計算方式＝店ごとに選択（max＝到達した最上段のみ／sum＝到達した全段の合計）・既定 max」。
**適用**: 本便（P173＋T-2）＝lib/nox/bonus-tiers.ts の bonusOf に mode 引数（max／sum・既定 max）・呼び出し側（pay.ts・試算の表示）は当面 max 固定・pay suite の多段 assert は max 前提（T2-1〜8）・sum の分岐は純関数単体で assert（p173 9-1）＝UI からは選べない（ebcdf26）。**器（0175）**＝店設定キー bonus_tier_mode（'max'｜'sum'・欠損＝max）。**client（P175）**＝ノルマ・ボーナスの店設定に「達成ボーナスの段＝最上段のみ／到達した段をすべて合計」の 2 択・試算と給与計算に接続。

## 裁定397（2026-10-16 確定・相談役・便 M173 M-0 追記）働き方（出勤可能の目安）＝曜日ごとに可／不可／相談の 3 値＋可の曜日の出勤可能時間帯＋メモ 1 行・キャスト・スタッフ共通（memberships 単位）・店は詳細の基本タブ、本人は /mine・/staff/me から変更可・希望（345）は申請、働き方は目安・シフト作成の候補順＝可→相談→不可・一覧カードに曜日チップ・器＝0175・client＝P175

出典＝相談役ブロック 2026-10-16（便 M173 M-0 追記）。**本文（逐語）**: 「働き方（出勤可能の目安）。曜日ごとに可／不可／相談の 3 値＋可の曜日の出勤可能時間帯（曜日ごと・翌日またぎ可・共通から一括コピー）＋メモ 1 行。キャスト・スタッフ共通（memberships 単位）。店は詳細の基本タブ、本人は /mine・/staff/me から変更可（本人変更は店にお知らせ 1 行）。希望（345）は申請・働き方は目安で、希望の無い日は働き方を候補に使う。シフト作成（一括配置・当日追加配置・調整して確定・自動配置）の候補順＝可→相談→不可（折りたたみ）・フィルタ『出られる人のみ』既定 ON。一覧カードに曜日チップ。器＝0175（availability 表・RLS・availability_set／availability_list）・client＝P175」。
適用＝未着手。器＝**0175**（新表 availability＝membership 単位・曜日 0〜6 × 3 値＋時間帯（from／to 分・翌日またぎ＝to ≤ from を許す）＋メモ・テーブル追加の標準型（RLS SELECT＝自店 ∧ 本人 or manager 以上・revoke→grant select）・availability_set（本人＝auth_membership_id() か manager 以上の自店・audit・本人変更は notices 1 行）・availability_list(p_store_id)）→client＝P175（詳細の基本タブ・/mine・/staff/me・シフト作成 4 面の候補順とフィルタ・一覧カードの曜日チップ・希望の無い日の候補）。起草は 0173／0174 の手貼り後（set_store_profile は触らない見込み＝独立表）。 **0175 の対象（追記・2026-10-19 便 P173・P174 で +裁定402 receipt_issue の p_biz_date／p_reissue_of＋receipt_issues の reissue_of／by_membership）**＝397 availability＋裁定404 店設定 bonus_tier_mode＋393 追補2 check_pay p_fee_rate＋裁定405 pt 付与ルールの器＋起票117 demo_org_reset の既定値補完。 **追記（便 D-173）**＝＋393 追補3（check_pay：手数料行は税込・外税でも追加の税なし）＋裁定407（時給スライドの単一選択・移行）＋裁定408（VIP 料金の 2 方式）。 **追記（便 P174 同乗）**＝＋裁定409（店設定 sales_split）＋起票118（set_comp_plan の audit に全列）＋スタッフ報酬の確定 RPC（staff_payroll_runs・356）。

## 裁定396（2026-10-16 確定・相談役・便 M173 M-0 差替）「体入を追加」＝在籍区分 体入＋プラン 体験入店＋期限付き保証（店設定の既定日数）を一度に設定・本採用（体入→在籍）で店の既定プランへ自動切替（確認なし・audit・切替後は詳細から変更可）・在籍キャストへの体験入店プラン割当は警告・体入タブは在籍区分で絞る・体入カードには保証の残日数チップ

出典＝相談役ブロック 2026-10-16（便 M173 M-0）。**本文（逐語）**: 「『体入を追加』＝在籍区分 体入＋プラン 体験入店＋期限付き保証（店設定の既定日数）を一度に設定。本採用（体入→在籍）の操作でプランを店の既定プランへ自動切替（確認なし・audit に記録・切替後は詳細から変更可）。在籍キャストへの体験入店プラン割当は警告。体入タブは在籍区分で絞る。体入カードには保証の残日数チップ」。
読取（便 M173）＝在籍区分＝casts.kind（live の値＝キャスト／接客スタッフ／体入／null・cast_create の p_kind）・体験入店プラン＝comp_plans.name '体験入店'（gen-demo の TRIAL）・期限付き保証＝set_cast_guarantee（cast_plan の 3 行形）。器＝**0173 ★7**（店設定 2 キー＝trial_guarantee_days 整数 1〜90 既定 3／default_plan_id 自店の有効プラン・null 可＝set_store_profile の白名単）。「体入を追加」「本採用」の一括操作は client（cast_create→set_cast_plan→set_cast_guarantee の順呼び・本採用＝set_cast_plan(default_plan_id)＋casts.kind の更新＝既存 RPC）＝EX-1。GV-57（デモ 6 店の体験入店キャストの在籍区分を『体入』に＝payload・P173）＝x13 #74。
適用＝0173（店設定 2 キー）＋EX-1／P173（client・payload）。

## 裁定395（2026-10-16 確定・相談役・便 HF-1 H-5 まとめ版）スライドの判定タイミングをプランに追加＝「前期の実績で当期の時給を決める（既定）」／「当期の累計で判定（現状）」・前期方式の初回は基本時給（期限付き保証が優先）・デモ ACE は前期方式・器＝0173（comp_plans 1 列）・client＝EX-1・golden 更新

出典＝相談役ブロック 2026-10-16（便 HF-1 H-5 追記 3）。**案（逐語）**: 「スライドの判定タイミングをプランに追加＝『前期の実績で当期の時給を決める（既定）』／『当期の累計で判定（現状）』。前期方式の初回は基本時給（期限付き保証が優先）。キャスト一覧・詳細の『今期の時給』注記と給与のスライド行は方式に従う。デモ ACE は前期方式。器＝0173（comp_plans 1 列）・client＝EX-1・golden 更新」。
読取（便 HF-1 H-7 R-10・docs/dp/ex_plan_20261016.md）＝判定タイミングは **店設定 settings_json.slide_apply（'next'＝前期の実績／'current'＝当期の累計・裁定288・既定 current）として既設**。判定する関数＝lib/nox/pay.ts（slideAt＝営業日の段・'next' は prevMonthTotals／prevPeriod の合計）・lib/nox/payroll/collect.ts（'next' の店で各期の「前の期間」の窓を get_cast_sales で読む＝periodKeysInRange／prevPeriodKeyOf＝月次と半月の前期境界は実装済み・日次は対象外）・assemble.ts slideInputOf・core.ts slideBasisForPeriodOf（凍結形 apply／provisional）・lib/nox/cast/current-wage.ts（/casts「今期の時給」＝preview の PayResult・判定期間の注記＝slide_period＋店の slide_apply）・/mine（preview 経由）・sim.ts（シミュレーター）。デモ 6 店は gen-demo で slide_apply 'current'。
差分＝comp_plans.slide_apply text null（'next'／'current'・null＝店設定にフォールバック）＋set_comp_plan 30 引数（md5 pin 1 本・29 引数版 drop）＋collect が cast のプラン列→店設定の順で解決・current-wage の注記・plan-editor のセグメント・gen-demo（ACE のプランを 'next'）。**golden**＝fixture（fixtures-pay REINA_INPUT・payroll fixture A1）はプラン列を持たない＝null→店設定 'current'→**不変**（列の DB 既定を 'next' にすると fixture も前期方式になり golden が変わる＝既定は UI 側（新規プランの初期値 next）に置き、DB 既定は null を推奨）。ACE は payload（プランの列）で前期方式＝live の時給が変わる（golden ではない）。
**確定（まとめ版 H-5・2026-10-16）**: 「スライドの判定タイミングをプランに追加＝『前期の実績で当期の時給を決める』（既定・月次なら前月・半月なら前半月）／『当期の累計で判定』（現状・存廃は R-10 後に相談役）。前期方式の初回（入店初月・プラン変更直後）は基本時給（期限付き保証が優先）。キャスト一覧・詳細の『今期の時給』注記と給与のスライド行は方式に従う。デモ ACE は前期方式に変更（ひなの 10 月＝¥3,500）。器＝0173（comp_plans 1 列）・client＝EX-1・golden 更新」。→R-10＝「前期」の境界（月次＝前月・半月＝前半月）は prevPeriodKeyOf に実装済み・プラン変更直後の初回は「プラン変更日 ≥ 前期の初日なら基本時給」の判定を client（collect）に足す。golden 更新の範囲＝DB 既定を 'next' にする場合のみ（fixture が前期方式になる＝pay 玲奈 5931／125802・payroll A1 の net）＝相談役の指定どおり「golden 更新」なら既定 next・fixture の期待値を張替え。
適用＝0173（列 1・set_comp_plan 30 引数）＋EX-1（plan-editor・current-wage 注記・gen-demo ACE＝ひなの 10 月 ¥3,500・golden 張替え）。
**395 追補1（2026-10-16 確定・相談役・便 M173 M-0）**: 出典＝相談役ブロック 2026-10-16（便 M173 M-0）。**本文**: 「comp_plans.slide_apply は nullable・店設定が既定・null は店設定に従う・'current' 存置・デモ ACE は payload で 'next'」。→0174 ★4＝列 text null check (next／current)・set_comp_plan 30 引数（p_slide_apply default null）・判定＝プラン列→店設定の順（client＝collect）。**golden 不変**（fixture はプラン列なし→店設定 current）。デモ ACE＝payload（プランの slide_apply 'next'＝ひなの 10 月 ¥3,500）＝P173。
**395 追補2（2026-10-19 確定・相談役）**: **本文（逐語）**: 「判定の単位は月単位／半月単位を主に見せる。『当期の累計で判定（current）』は稀なので初期設定には出さず、待遇プランの詳細設定でのみ選べる」。参照モック＝「NOX 初期設定 v2（iPad 向け）」https://claude.ai/artifact/PtWVBE3iFfek3GZHyrAwRu（6 ステップ＝お店／料金／キャスト待遇／シフト・勤怠／会計・レジ／確認・2026-10-19 受領）＝STEP 3「時給スライド」の判定の単位は 2 択（月単位＝前月の実績で今月の時給／半月単位＝前の半月の実績で次の半月）＋注記「今の期間の累計で決める方式は、あとでマスタの待遇プランから選べます」。適用＝初期設定の client（P175 以降のウィザード改修）・待遇プランの詳細設定は現行の slide_apply（395／追補1）のまま。

## 裁定394（2026-10-16 確定・相談役・便 HF-1 H-5 まとめ版）ノルマ未達の減額を 4 軸に＝出勤日数／同伴／指名／売上（定額／不足 1 単位ごと・片方のみ）・減額は精算調整の経路・採用 OFF の軸は減額欄も非表示

出典＝相談役ブロック 2026-10-16（便 HF-1 H-5 追記 2）。**案（逐語）**: 「ノルマ未達の減額を 4 軸に＝出勤日数（定額／不足 1 日ごと）・同伴（定額／不足 1 本ごと）・指名（定額／不足 1 件ごと）・売上（定額／不足 1 万円ごと・単位は店設定）。373 と同じく片方のみ。減額は現行の精算調整の経路。『売上・指名ノルマは表示のみ』の注記は削除。採用 OFF の軸は減額欄も非表示」。
読取（便 HF-1 H-7 R-9・docs/dp/ex_plan_20261016.md）＝器は penalty_config（norm_on・norm_days_flat／per・norm_dohan_flat／per＝2 軸・set_penalty_config 12 引数）。pay.ts の normPenaltyOf は 0154 D3 で罰金撤去＝常に 0（検知の器）・減額の実体は精算調整（payroll_adjustment_add source 'settlement'・ひな形 settings_json.settlement_presets＝遅刻／当欠／早退の 3 件・検知 detectTargetOf＝attendance／打刻）。指名・売上の 2 軸＝**penalty_config に +5 列（norm_shimei_flat／per・norm_sales_flat／per・norm_sales_unit＝既定 10,000）＋set_penalty_config 17 引数（0173）**・ひな形に norm_* の 4 件（client）・検知＝ノルマ進捗（cast_norms／cast_quotas と get_cast_sales）から不足量×単価（client の純関数）→精算調整 1 行（既存 RPC・DB 変更なし）。
**確定（まとめ版 H-5・2026-10-16）**: 「ノルマ未達の減額を 4 軸に＝出勤日数（定額／不足 1 日ごと）・同伴（定額／不足 1 本ごと）・指名（定額／不足 1 件ごと）・売上（定額／不足 1 万円ごと・単位は店設定・既定 1 万円）。373 と同じく片方のみ。減額は現行の精算調整の経路。『売上・指名ノルマは表示のみ』の注記は削除。採用 OFF の軸は減額欄も非表示。器＝R-9 の結果で 0173 か client のみ」。→R-9 の結果＝**0173**（penalty_config +5 列・set_penalty_config 17 引数）＋EX-1。
適用＝0173（列 5・RPC 1 改稿）＋EX-1（PenaltyTab 4 軸・注記削除・採用 OFF の軸は非表示・精算調整の候補）。

## 裁定393（2026-10-16 確定・相談役・便 HF-1 H-5 追記）支払方法別の手数料＝店設定で率（カード 既定 10%・電子マネー 0%・その他 0%・現金／売掛は対象外・0 で非表示）・入金額（サ料込）×率・四捨五入・伝票に行「カード手数料」・キャストの売上・ノルマ・歩合には含めない・日報に手数料合計 1 行・器＝0173・client＝EX-1

出典＝相談役ブロック 2026-10-16（便 HF-1 H-5 追記）。**本文（逐語）**: 「支払方法別の手数料。店設定で支払方法ごとに率（カード 既定 10%・電子マネー 0%・その他 0%・現金／売掛は対象外・0 で非表示）。その支払方法で入金する金額（サ料込）× 率・1 円未満四捨五入・併用時はその方法で入金する分だけ。入金モーダルで『カード手数料 10%＝¥…』を 1 行表示し、お客様からもらう額＝入金額＋手数料・均等割りは手数料込み。伝票に行『カード手数料』として残す（391 の分類は上段・内税対象）。キャストの売上・ノルマ・歩合には含めない。日報・分析＝カード入金は手数料込みの受取額・手数料合計を日報に 1 行・現金差異に影響なし。器＝0173・client＝EX-1」。
読取（便 HF-1 H-7 R-8・docs/dp/ex_plan_20261016.md）＝入金＝check_pay（p_method cash／card／ar／other・電子マネー／QR は 'other'＋p_method_detail＝client の rpcMethodOf）・payments.method CHECK 4 値・残額＝check_group_due（Tp(Bx＋サ料)）・'exceeds balance' で上限。伝票行＝check_lines.kind CHECK 11 値（料金行は kind 'charge'＋fee_kind）。日報＝daily_report_aggregate の card_gross＝Σcard 入金・card_tax＝card_gross×settings_json.card_tax_rate（既定 5%＝**店負担の見込み・客には乗せない**＝393 の客負担の率とは別物＝併存の可否は相談役）。キャスト売上＝cast_sales_aggregate／get_cast_sales（check_lines を kind／fee_kind で集計）。
適用＝0173（店設定 pay_fee_rates jsonb {card, emoney, other}％＝白名単 +1／check_pay＝対象方法で率＞0 なら 手数料行（kind 'charge'・fee_kind 'pay_fee'＝CHECK +1・name 'カード手数料 10%'・内税対象・pay_group 同じ）を先に立てて check_recalc→payments.amount＝入金額＋手数料・取消は行も消す／daily_report_aggregate +'pay_fee_total'・daily_reports +1 列・daily_report_close が凍結／cast_sales_aggregate・get_cast_sales＝fee_kind 'pay_fee' を除外）＋EX-1（店設定 UI・入金モーダルの 1 行表示・均等割り手数料込み・分析の分類＝上段・日報の 1 行）。
**393 追補1（2026-10-16 確定・相談役・便 M173 M-0）**: 出典＝相談役ブロック 2026-10-16（便 M173 M-0）。**本文**: 「card_tax_rate（店負担）と 393（客負担）は併存・ラベルで区別」。→0173 ★6＝既存の card_tax（stores.card_tax_rate×card 入金＝店負担の控除見込み）は不変・393 の手数料（客負担）は check_lines の行（fee_kind 'pay_fee'）と日報の pay_fee_total＝別列。UI のラベル＝「カード手数料（お客様負担）」／「カード決済手数料（店負担・見込み）」。起草＝docs/tmp/gen_0173.mjs（店設定 pay_fee_rates の欠損キー＝0＝手数料なし・UI の新規店の初期値がカード 10＝「既定 10%」の置き場＝仮決め・相談役確認）。
**393 追補2（2026-10-19 確定・相談役・便 P173）**: **本文**: 「入金モーダルでカード（率>0 の方法）を選んだとき『手数料を上乗せ ON／OFF』（既定 ON）と率の欄（0〜・小数 1 桁・既定＝店設定）を出し、手数料行とお客様からもらう額を即時再計算。OFF／0% なら手数料行なし。伝票行に適用率を記録・店設定と異なる率／OFF は audit（操作者付き）。併用時は方法ごと」。**読取（便 P173）**＝0173 の check_pay は手数料をサーバ側で店設定 pay_fee_rates から計算（v_rate int・round(p_amount×率/100)）・率を渡す引数なし（p_fee_key はキーの選択のみ）・率は整数＝**渡せない**→**器＝0175**（check_pay に p_fee_rate numeric default null・null＝店設定・v_rate を numeric（小数 1 桁）・適用率の記録・店設定と異なる率／OFF の audit）・**client＝P175**（GV-C には入れない）。★live（便 P173）で外税の店はモーダルの「お客様からもらう額」とサーバの受取額が手数料の消費税分ずれる（ACE ¥34,092 対 ¥34,402）＝0175／P175 と同時に相談役判断。
**393 追補3（2026-10-19 確定・相談役・便 D-173）**: **本文（逐語）**: 「カード手数料の行は税込の金額として扱い、外税の店でも追加の消費税を乗せない（入金モーダルの表示＝受取額）。check_pay の修正は 0175」。＝便 P173 live の ACE（外税・サ料 20%）で受取額 ¥34,402 がモーダル表示 ¥34,092 より手数料の消費税分 ¥310 多かった件の処置。器＝**0175**（check_pay／check_group_due の外税分岐で pay_fee 行を税の母数から除く＝行の金額は税込）。

## 裁定392（2026-10-16 確定・相談役・便 HF-1 H-5 追記＝本文は GV-49 と同時に受領・台帳の見出しは便 M173 M-0 で補完＝教訓70）キープはレジで押した時点で顧客のキープ一覧に出る（状態＝会計前）・会計で確定・伝票取消で削除・顧客詳細のキープ欄と来店状況の本数は会計前も含め、会計前は注記

出典＝相談役ブロック 2026-10-16（便 HF-1 H-5 追記）。**本文（逐語）**: 「キープはレジで押した時点で顧客のキープ一覧に出る（状態＝会計前）。会計で確定・伝票取消で削除。顧客詳細のキープ欄と来店状況の本数は会計前も含め、会計前は注記」。
読取（便 HF-1 H-7 R-7・便 M173）＝レジ明細の「キープ」（お客様チップ）は check_line_set_customer（行の customer_id）だけを呼び、bottle_keeps は作らない（GV-49 の原因）。bottle_keeps.status CHECK＝active／empty／removed（pending なし）。
適用＝**0173 ★5**（bottle_keeps.status +'pending'・bottle_keep_register 10 引数 p_status・check_line_set_customer 3 引数 p_keep＝pending 行を作る／外すと消す・check_close＝この伝票の pending→active・check_void＝pending 削除・customer_summary +pending_bottles）＋EX-1（レジの「キープ」が p_keep: true を送る・顧客詳細のキープ欄と来店状況の本数に pending を含め「（会計前）」注記）。

## 裁定391（2026-10-16 確定・相談役・便 HF-1 H-5）レジ明細の並び順＝セット→延長→指名群（本指名・場内・同伴）→商品（注文順）・小計内訳＝「セット・延長・指名」「商品」の 2 行・日報・分析の売上内訳も同じ 2 分類

出典＝相談役ブロック 2026-10-16（便 HF-1 H-5）。**本文（逐語）**: 「レジ明細の並び順＝セット→延長→指名群（本指名・場内・同伴）→商品（注文順）。小計内訳＝『セット・延長・指名』『商品』の 2 行。日報・分析の売上内訳も同じ 2 分類」。
読取（便 HF-1 H-7 R-5b・docs/dp/ex_plan_20261016.md）＝レジの明細は check_lines.sort_order（追加順）で描画・小計内訳は E8-1 #7 の 6 行構成（セット・延長／商品・指名ほか）＝client（register-board）の並べ替えと 2 行化で足りる（DB 不触）。分析の内訳＝store_category_aggregate（kind／fee_kind 別の合計＝DB 側）→client の category-map（5 分類）を 2 分類に写像＝client のみ。日報の内訳＝daily_report_aggregate が持つのは drink_sales だけ＝**2 分類（セット・延長・指名／商品）は DB 側に +2 キー（0173 の対象）**か client で check_lines を直読（manager 以上は RLS で読める）＝0173 推奨（締めの凍結値に載せる）。GV 台帳 #64（GV-45＝レジ側）。
適用＝EX-1（レジ・分析＝client）＋0173（daily_report_aggregate +2 キー＝'set_ext_nom'／'products'）。

## 裁定390（2026-10-16 確定・相談役・便 HF-1 H-5）売上スライド・ポイントスライドの段数を可変（1〜10 段・行の追加／削除・閾値は昇順必須・時給の単調増加は警告のみ）・初期表示 3 行・器＝0173・client＝EX-1

出典＝相談役ブロック 2026-10-16（便 HF-1 H-5）。**本文（逐語）**: 「売上スライド・ポイントスライドの段数を可変（1〜10 段・行の追加／削除・閾値は昇順必須・時給の単調増加は警告のみ）。初期表示 3 行。器＝0173・client＝EX-1」。
読取（便 HF-1 H-7 R-4b）＝comp_plans.sales_slide／point_slide は **jsonb 配列**（Slide {at, wage}）＝comp_plan_slide_check が「3 段まで・at 昇順 strict・整数 ≥0」を検査（v_len > 3 で 'bad slide'）・pay.ts の slideAt は段数非依存・UI（SlideInput）が 3 行固定（「3段」の見出し）。達成ボーナスは comp_plan_components（kind 'achievement_bonus'・params.thresholds＝jsonb [{pct}]・pay.ts は [0] だけ読む＝1 段固定）。**推奨＝jsonb のまま**（別表 comp_plan_slides／comp_plan_bonus_tiers は作らない）＝RLS・grant・名簿・既存 6 店データの移行（≤3 段はそのまま有効）・f0 golden（fixture は 3 段）がすべて不変。0173＝comp_plan_slide_check の上限 3→10（md5 pin 1 本）＋thresholds の配列化（pay.ts が全段を読む・amount を段ごとに＝params の形 [{pct, amount}]・既存行は amount 省略＝コンポーネントの amount を使う）。起票110（達成ボーナスの多段しきい値＝ブロックでは 109）は第 2 期→**ローンチ前**（390 と同じ器）。
適用＝0173（slide_check 上限・thresholds 配列）＋EX-1（SlideInput の可変行＝初期 3 行・＋／−・昇順検査・時給の単調増加は警告のみ・達成ボーナスの多段 UI）。

## 裁定389（2026-10-16 確定・相談役・便 EX-R R-1）キャストによるレジ運用＝店設定 2 キー（cast_register OFF／ON 既定 OFF・cast_register_device 店端末のみ／自分のスマホからも 既定 店端末のみ）・ON のキャストは /register で開卓・注文・会計・日次の締め（全卓）・承認系は店長以上のまま・操作者にキャスト membership を記録

出典＝相談役ブロック 2026-10-16（便 EX-R R-1）。**本文（逐語）**: 「キャストによるレジ運用。店設定 2 キー（cast_register OFF／ON 既定 OFF・cast_register_device 店端末のみ／自分のスマホからも 既定 店端末のみ・前者 ON のときだけ有効）。ON のキャストは /register を開き 開卓・注文・会計・日次の締めができる（全卓）。値引き・伝票取消・締め解除・現金差異の承認は店長以上のまま。操作者にキャスト membership を記録。置き場＝キャスト画面の設定・予約の申請の次。器＝0173・client＝EX-1」。
読取（便 EX-R R-3・docs/dp/ex_plan_20261016.md）＝店フラグ cast_register_enabled（set_store_cast_register・owner）・cast 別 memberships.can_register（set_cast_register）・auth_cast_can_register()・8 表の RLS cast 枝・会計 6 RPC＋延長／人数／ボトル／顧客／紹介／印刷の cast 枝は **mig0039 以降で既設**（開卓・注文・会計は通る）。無いもの＝cast_register_device（器なし・「店端末」の判定方式は相談役確定待ち）・日次の締め（report_can_close に cast 枝なし・daily_reports の RLS は cast 除外）・操作者の membership 列（checks.created_by／daily_reports.closed_by は users.id）。承認系（approval_direct／decide・check_void・report_reopen／reclose・cash_diff_approve）は manager 以上＝389 と一致＝不変。
適用＝0173（店設定 cast_register_device・report_can_close の cast 枝・daily_reports select の cast 枝・checks.opened_by_membership／daily_reports.closed_by_membership）＋EX-1（キャスト画面の設定「予約の申請」の次に 2 項目＝cast-register-panel から移設・layout の cast 枝に /report・report-board の cast 表示・/mine ナビ「レジ」）＝相談役が出す便。

**389 追補1（2026-10-16 確定・相談役・便 HF-1 H-5）**: 出典＝相談役ブロック 2026-10-16（便 HF-1 H-5）。**本文（逐語）**: 「店端末＝端末・印刷で登録済みのレジ端末（既存登録を流用・未登録は自分のスマホ扱い）」。→EX-R の保留 2（端末判定の方式）＝kiosk_devices（purpose 'register'）の登録を流用＝「店端末のみ」の店では cast 本人のセッションからの /register を通さず、レジ端末（kiosk_login の候補に cast を足す）だけ。未登録の店は「自分のスマホ扱い」＝本人セッションを通す（現行）。
**389 追補2（2026-10-16 確定・相談役・便 HF-1 H-5）**: 出典＝相談役ブロック 2026-10-16（便 HF-1 H-5）。**本文（逐語）**: 「キャストの締めは通常の締め・再締めは店長以上が締め解除フロー（C層③）で解除→再締め・キャスト自身は解除不可」。→EX-R の保留 3＝再締め（daily_report_reclose）は cast に開かない＝report_can_close の cast 枝は daily_report_close だけに効かせる（reclose は report_can_reopen 側＝manager 以上）。
**389 追記（2026-10-16 確定・相談役・便 HF-1 H-5）**: 「他キャストの指名／同伴も付与可」＝ON のキャストは check_set_nominations／check_dohan_add で他キャストの指名・同伴も付与できる（既設の cast 枝＝本人限定の条件は無い＝現行どおり・UI の出し分けも本人限定にしない）。

## 裁定388（確定・未実装（GV-C）・2026-10-16・相談役 v46 §3）給与一覧の自動表示（プレビュー廃止）

出典＝相談役引き継ぎ v46 §3（docs/handoff/NOX_相談役引き継ぎ_2026-10-16_v46.md・「新チャットで台帳に記す・本書で確定」＝便 V46 V-2 で記入・2026-10-16）。**本文（逐語）**: 「**未実装の確定裁定（GV-C として 1 便）**＝387（お預かり 1 欄）・352 追補1（開卓時のお客様）・388（給与一覧の自動表示）・356 追補1（給与画面のキャスト／スタッフ切替・計算は 0172 後）・370 追補1（お客様チップは条件付き・同一行 ×N 集約）。」／v46 §1「388（給与一覧の自動表示＝未実装）」／v46 §8-4「388 給与一覧の自動表示（プレビュー廃止）」。
適用＝未実装（GV-C＝相談役が出す便・client のみ・f0 2 連・live は ACE 390px）。GV 台帳 #41（x13_ledger）。

## 裁定387（確定・未実装（GV-C）・2026-10-16・相談役 v46 §3）お預かり 1 欄

出典＝相談役引き継ぎ v46 §3（docs/handoff/NOX_相談役引き継ぎ_2026-10-16_v46.md・「新チャットで台帳に記す・本書で確定」＝便 V46 V-2 で記入・2026-10-16）。**本文（逐語）**: 「387（お預かり 1 欄）」（上の 388 の逐語と同じ 1 文）／v46 §1「387（お預かり 1 欄＝未実装）」／v46 §8-4「387 お預かり 1 欄」。
適用＝未実装（GV-C）。GV 台帳 #38（x13_ledger）。

## 裁定386（案・【相談役確定待ち】・2026-10-16 記入・相談役 v46 §3）途中合流＝セット終了後の＋は合流（セット料金を引き直さない）・店設定「合流セット（既定）／延長のみ」

出典＝相談役引き継ぎ v46 §3（docs/handoff/NOX_相談役引き継ぎ_2026-10-16_v46.md・「新チャットで台帳に記す・本書で確定」＝便 V46 V-2 で記入・2026-10-16）。**案（逐語）**: 「**案（読取後に確定）**＝385（延長を最大 3 パターン・レジで選択・自動延長の既定・料金ルールごと）・386（セット終了後の＋は合流＝セット料金を引き直さず・店設定「合流セット（既定）／延長のみ」・−は引き直さない）。」／v46 §1「386（途中合流＝案・既定は合流セット）」。
適用＝未着手（EX-R＝読取のみ（fee_rules／pricing_resolve／延長ボタン／自動延長／check_set_headcount の現状と差分・0173 要否・見積→docs/tmp/ex_plan.md）→0173（器）→EX-1）。確定は読取後に相談役。

## 裁定385（案・【相談役確定待ち】・2026-10-16 記入・相談役 v46 §3）延長パターン＝最大 3 パターン・レジで選択・自動延長の既定・料金ルールごと

出典＝相談役引き継ぎ v46 §3（docs/handoff/NOX_相談役引き継ぎ_2026-10-16_v46.md・「新チャットで台帳に記す・本書で確定」＝便 V46 V-2 で記入・2026-10-16）。**案（逐語）**: 「385（延長を最大 3 パターン・レジで選択・自動延長の既定・料金ルールごと）」（上の 386 と同じ 1 文）／v46 §1「385（延長パターン＝案）」。
適用＝未着手（EX-R→0173→EX-1・386 と同便）。確定は読取後に相談役。

**385 追補（2026-10-16 確定・相談役・便 HF-1 H-5）**: 出典＝相談役ブロック 2026-10-16（便 HF-1 H-5）。**本文（逐語）**: 「自動延長の店は既定パターンを自動適用・レジの選択は手動延長時のみ・自動延長後の切替は可（差額を引き直す）」。→EX-R の保留 1（自動店での選択）＝切替は可＝自動延長後の切替 RPC（check_set_ext_rule＝checks.ext_min／ext_fee を snap の別パターンへ・確定済みブロックの差額を引き直す）は 0173 の対象（docs/dp/ex_plan_20261016.md R-6b）。

## 裁定384（2026-10-15 確定・相談役・便 GV-B W-14＝目視指摘 GV-37）キャスト選択の既定は担当中→出勤中→すべて・担当中 1 人なら選択済み

出典＝相談役ブロック 2026-10-15（便 GV-B W-14）。**本文（逐語）**: 「キャスト選択の既定は担当中→出勤中→すべて・担当中 1 人なら選択済み」。指示の詳細＝「キャストドリンクの帰属先モーダル（『<商品> を付けるキャスト』）の既定タブ＝この伝票を担当中のキャストがいれば『担当中』、いなければ『出勤中』、それも 0 なら『すべて』。担当中が 1 人だけなら選択済みにして『追加』1 タップで通す。同じ既定順を 359 の分配率カードの追加・378 のキャスト選択・切替ダイアログにも適用」。
適用＝便 GV-B（client のみ・DB 恒久変更 0）: components/nox/cast-picker.tsx に pickerDefaultChipOf＋prop defaultChip・register-board のドリンク帰属（担当中 1 人なら selectedIds＋「{名前} に追加」主 56＝data-pick-single）と分配率カード・378 の来店処理は予約の担当が初期値。切替ダイアログ（341）は CastPicker を使わない＝対象外（仮決め B-16）。suite cast-picker 3（新・f0 120 段目）。

## 裁定383（2026-10-15 確定・相談役・便 GV-B W-13＝目視指摘 GV-36）今日タブの出勤記録は出勤前＝5 択・出勤後＝出勤チップ＋同伴のみ・退勤後＝実績チップのみ・遅刻は猶予から自動

出典＝相談役ブロック 2026-10-15（便 GV-B W-13）。**本文（逐語）**: 「今日タブの出勤記録は出勤前＝5 択・出勤後＝出勤チップ＋同伴のみ・退勤後＝実績チップのみ・遅刻は猶予から自動」。指示の詳細＝「/shift 今日タブの行（表・カードとも）: 出勤前＝5 分割セグメント／出勤後＝セグメントを畳み『出勤 HH:MM』チップ（猶予超過は『遅刻 HH:MM』を自動判定・店設定 late_grace）＋『同伴』トグル（未設定なら押せる・設定済みはチップ）のみ・当欠と休みは非表示／退勤後＝『出勤 HH:MM〜HH:MM』の実績チップ＋同伴の結果のみ・操作は『時刻修正』だけ。遅刻を手で付ける操作は廃止（時刻修正で代替）。371 のカード 2 段目も同じ切替」。
適用＝便 GV-B（client のみ）: lib/nox/shift/today-row.ts に attRowModeOf（pre／arrived／done）・arrivedChipOf・dohanToggleOf、shift-board の行に data-att-mode（pre だけ 5 択・arrived／done はチップ＋同伴トグル・done は減額／確認へ／確定も非表示）。★「出勤前＝5 択」と「遅刻を手で付ける操作は廃止」は両立しない（5 択に遅刻が含まれる）＝出勤前の 5 択は現行どおり・出勤後の遅刻は自動判定のみ（仮決め B-15・4 択にするなら裁定要）。suite today-row tr(9-1〜3)・systems-off so(2-1) 張替え。

**確定（相談役 v46 §3・便 V46 V-2・2026-10-16）＝W-13 の撤回**: 「②W-13 の「遅刻を手で付ける操作は廃止」は撤回＝出勤前 5 択は残す・出勤後は 383 どおり（出勤チップ＋同伴のみ）」。＝仮決め B-15（出勤前 5 択は現行の 5 語のまま・出勤後の遅刻は自動判定のみ）を追認・client の変更なし。

## 裁定382（2026-10-15 確定・相談役・便 GV-B W-1＝目視指摘 GV-24／35）スマホ幅の共通ルール＝ResponsiveTable／FieldStack／SegmentTabs／InfoNote・英字の飾りチップは廃止

出典＝相談役ブロック 2026-10-15（便 GV-B W-1）。**本文（逐語）**: 「共通部品 ResponsiveTable（600px 未満で列 3 つ以上の表を 1 行 1 カード・縦書きヘッダ全廃）／FieldStack（ラベル上・入力下・ステッパーと金額は 1 行）／SegmentTabs（48px・幅 100%・金塗り・収まらなければ横スクロール 1 段）／InfoNote（2 行超の説明は最初の 1 文＋ⓘ）を lib に置き、機能の公開・料金適用ルール・時間料金設定・キャスト別ノルマ目標・承認待ち・マスタ配下のサブタブ・待遇プランの 6 タブ（372②）に適用。英字の飾りチップ（DATE & TIME・FALLBACK・STAFF ACCOUNTS 等）は廃止」。
適用＝便 GV-B（client のみ）: components/ui/responsive-kit.tsx（JSX を含むため lib ではなく components/ui）＝ResponsiveTable（data-rtable・thead→td data-label・<600 は CSS でカード化）／FieldStack（.nox-fieldstack）／SegmentTabs（.nox-segtabs・.nox-seg と同居）／InfoNote（部品のみ・本便の 6 面に 2 行超の説明なし＝適用先 0・仮決め B-2）。適用＝feature-flags-panel・time-pricing-panel・pricing-board（料金適用ルール 2 表）・comp-sections（ノルマ表・減額）・shift-board（承認待ち）・master-subnav／plan-board（.nox-segtabs）。英字チップ＝page-head の eyebrow を aria-hidden＋CSS display none（props 不変＝各画面の pin を壊さない）。suite gvb(1-1)〜(1-3)。

## 裁定381（2026-10-15 確定・相談役・便 GV-B W-10＝目視指摘 GV-33／34）/staff の「＋スタッフ登録」・編集シートは「保存」1 ボタン・電話番号は tel: リンク・シフト権限は効かせる

出典＝相談役ブロック 2026-10-15（便 GV-B W-10）。**本文（逐語）**: 「/staff に『＋スタッフ登録』（名前必須・メール任意＝入力時のみ招待・電話・LINE ID テキスト・役割・契約区分・写真）・編集シートは『保存』1 ボタン・電話番号は全画面 tel: リンク・『シフト権限の適用は将来リリース』注記は権限を効かせるか外す（理由を報告）。器は 0172 に同乗・client 先行」。
適用＝便 GV-B（client のみ）: staff-board＝「＋ スタッフ登録」モーダル（名前／メール（入力したときだけログイン ID＝招待メールは送らない現行経路）／電話／LINE ID／配属店／役職／契約区分 セグメント／写真は登録後の注記・「登録する」主 56）＝電話・LINE ID・契約区分は**送らない**（器＝0172 ★6 memberships.tel／line_id・★5 staff_contracts・注記あり）。編集シート＝名前／メール（owner）縦積み＋「保存」1 ボタン（変わった項目だけ staff_update_profile／update-email）。tel: リンク＝components/ui/responsive-kit.tsx TelLink（顧客一覧の詳細・顧客詳細＝スタッフには電話列が無い）。**シフト権限は効かせた**＝staff かつ auth_staff_can_shift≠true は /shift を /dashboard へ・nav のシフトも出さない（理由＝/customers の can_crm と同型の器 auth_staff_can_shift が 0022 で既設・トグルが保存されるのに効かないのは教訓25 の逆。★影響＝can_shift=false の既存 staff はシフト画面が開けなくなる＝外すなら shift/page.tsx と layout.tsx の 2 箇所を戻す・仮決め B-14）。注記は撤去。suite gvb(10-1)〜(10-4)。

**確定（相談役 v46 §3・便 V46 V-2・2026-10-16）＝W-10 can_shift 追認**: 「①W-10 シフト権限（can_shift）を効かせた＝追認（既存 staff で can_shift=false の人は /shift が開けない＝本番 org の該当者を V46 で読んで報告）」。V46 の SELECT 実測（2026-10-16 10:29 JST・memberships→stores→orgs）: 本番 org（is_demo=false・verify 以外）＝NOX-DEMO（CLUB NOX）の active staff 2 のうち **can_shift=false は 1 件**（佐藤・can_register true／can_crm false）・田中は true。検査用テナント NOX-VERIFY-A＝staff 4 すべて false（fixture）・NOX-VERIFY-B＝staff 0。デモ 6 店＝各 staff 1・すべて true（gen-demo）。仮決め B-14 のとおり 2 箇所（shift/page.tsx・layout.tsx）は戻さない。

## 裁定380（2026-10-15 確定・相談役・便 GV-B W-9＝目視指摘 GV-31／32）シフト希望の 3 本道＝希望どおり採用（即確定）／調整して確定／調整して送り返す・店設定 shift_cast_confirm は廃止（345 追補2 を置換）

出典＝相談役ブロック 2026-10-15（便 GV-B W-9）。**本文（逐語）**: 「シフト希望の 3 本道（希望どおり採用＝即確定／調整して確定／調整して送り返す＝確認待ち）・店設定 shift_cast_confirm を UI から廃止・承認待ちはキャスト別折りたたみ・一括は『希望どおり一括採用』・『代行確定』は送り返し放置分のみ・自動確定は店設定キー（0172 に同乗・client は表示先行）。345 追補2 を 380 で置換」。
適用＝便 GV-B（client のみ・RPC は既存 3 本＝shift_wish_decide／shift_set／shift_propose＋shift_confirm_bulk）: shift-board＝「希望どおり採用」＝採用→shift_confirm_bulk（店設定に依らず即確定）・「調整」→希望の調整モーダル（採用→shift_set で時間→「調整して確定」＝confirmed／「調整して送り返す」＝planned→shift_propose）・planned／proposed 行の調整モーダルも同じ 2 ボタン（confirmed は従来の保存）・planned 行に代行確定なし・一括＝「希望どおり一括採用」（採用→62 件ずつ confirm）・一括代行確定は proposed のみ・承認待ちの既定＝キャスト別（見出し行で折りたたみ）・段は 3（審査中／採用・確認待ち（調整中・送り返し）／採用・確定）・castConfirm は常に true（送り返し＝「キャスト確認待ち」・/mine 2 面も同じ）。store-profile-panel＝キャスト確認トグル撤去・「送り返しの自動確定時間（準備中）」非活性（0172 ★3 shift_auto_confirm_hours・実行器は別起票）。345 追補2（OFF の店は採用＝確定）は本裁定で置換。suite gvb(9-1)〜(9-3)・wish-state ws(4-3) 張替え。

## 裁定379（欠番・2026-10-16 確定・相談役 v46 §3）380 に統合＝380 参照

出典＝相談役引き継ぎ v46 §3（docs/handoff/NOX_相談役引き継ぎ_2026-10-16_v46.md・「新チャットで台帳に記す・本書で確定」＝便 V46 V-2 で記入・2026-10-16）。**本文（逐語）**: 「**裁定379＝欠番**（380 に統合）。台帳に「379 欠番・380 参照」の 1 行。」
経緯＝便 GV-B のブロックで 379 だけ本文が無く、教訓70（本文の無い番号は作らない）により見出しを作らず報告で返した（仮決め一覧 docs/tmp/gvb_decisions.md 結論 2・教訓候補 E-17）。本行が「379 欠番・380 参照」の 1 行。

## 裁定378（2026-10-15 確定・相談役・便 GV-B W-8＝目視指摘 GV-30）予約の来店処理＝卓タイル→指名種別 4 分割→キャスト選択→「伝票を開く」

出典＝相談役ブロック 2026-10-15（便 GV-B W-8）。**本文（逐語）**: 「予約の来店処理＝卓タイル→指名種別 4 分割（『予約どおり』廃止・予約の担当は初期値）→キャスト選択（同伴は相手・フリーは非表示）→『伝票を開く』主。予約カードのボタン中央 48px」。
適用＝便 GV-B（client のみ）: reservation-panel の来店インセット＝卓タイル（使用中は選べない・予約卓に印）→SegmentTabs 4 分割（初期値＝予約の nom_type・無ければフリー）→キャストチップ（初期値＝予約の担当・同伴は「同伴の相手」・フリーは非表示）→「伝票を開く」主 56。reservation_to_check は不変（p_nom_type に選択値）・キャストか種別を変えたときだけ戻り id で check_set_nominations（1 件・同伴＝hon＋is_dohan＋dohan_count 1）。来店ボタン 48px。suite gvb(8-1)。

## 裁定377（2026-10-15 確定・相談役・便 GV-B W-7＝目視指摘 GV-29）顧客選択の共通モーダル＝①この伝票のお客様②候補③全員④新規登録して選ぶ・検索欄は最上部固定

出典＝相談役ブロック 2026-10-15（便 GV-B W-7）。**本文（逐語）**: 「顧客選択の共通モーダル（ボトルキープ登録・お客様チップ・伝票の顧客追加）＝①この伝票のお客様②候補（伝票キャストの担当客 5→最近来店 10）③全員（50 音チップ＋担当キャストチップ・50 件ずつ）④新規登録して選ぶ（名前必須）・検索欄最上部固定。器が足りなければ既存 select で N+1 禁止・RPC が要るなら 0172 に同乗」。
適用＝便 GV-B（client のみ・RPC 新設なし）: components/nox/customer-pick-modal.tsx を 4 タブに再構成（mode＝line／add／select）・候補＝customer_list_summary＋customers（既存 2 本）・50 音＝kanaRowOf（ふりがな→名前）・④＝customer_register→check_customer_add。3 入口＝商品行チップ（line）・伝票の顧客追加（check-customers-card「＋ お客様を追加」＝add・旧インライン候補は撤去）・ボトルキープの持ち主（line-keep-button＝select・未付与なら併存で追加）。W-7 の候補 RPC は不要（0172 ★7）。suite gvb(7-1)〜(7-3)・messages ms(2-14) 張替え。

## 裁定376（2026-10-15 確定・相談役・便 GV-B W-6＝目視指摘 GV-28）領収書発行＝入力 1 行 1 項目・「発行」主 100% 56px・「分割して発行」「閉じる」副・説明 1 行

出典＝相談役ブロック 2026-10-15（便 GV-B W-6）。**本文（逐語）**: 「会計完了シートの領収書発行＝入力 1 行 1 項目・『発行』主 中央 100% 56px・『分割して発行』『閉じる』副・説明 1 行」。
適用＝便 GV-B（client のみ）: register-board の領収書 form（data-rcpt-form）＝金額／宛名／但し書きを縦積み（幅 100%）・「発行」btnPrimary56・「分割して発行」「閉じる」btnSecondary48・説明は「発行ごとに台帳へ記録され、発行番号と確認用 QR がつきます。」の 1 文。suite gvb(6-1)。

## 裁定375（2026-10-15 確定・相談役・便 GV-B W-5＝目視指摘 GV-27）会計タブは 1 画面 1 ステップ＝①請求表 4 列→「入金へ進む」／②支払方法→金額（数字キーパッド）→「入金する」／③「会計を完了」

出典＝相談役ブロック 2026-10-15（便 GV-B W-5）。**本文（逐語）**: 「会計タブを 1 画面 1 ステップ（①請求表 4 列→『入金へ進む』主・『会計を分ける』副／②支払方法セグメント→金額（既定残額・数字キーパッド）→『入金する』主・残額 0 で両ボタン非表示＋履歴のみ残し③へ自動遷移／③『会計を完了』主・『← フロア』副）。disabled は必ず減光（全画面 grep）」。
適用＝便 GV-B（client のみ・check_pay の引数不変）: ①＝伝票／請求（サ料込）／入金済／残額の 4 列（小計・割引の列は落とした）＋「入金へ進む」主 56（data-pay-next）＋「会計を分ける」副 48・残額 0（allCovered）で非表示／②＝既存の入金モーダル（支払方法セグメント→金額＝既定残額→数字キーパッド 0〜9・00・⌫・C→「入金する」主 56）／③＝allCovered のときだけ「会計を完了」主 56＋「← フロア」副 48。disabled＝globals.css `button:disabled, .nox-btn:disabled { opacity: .45 }`。suite gvb(5-1)(5-2)。

## 裁定374（2026-10-15 確定・相談役・便 GV-B W-4＝目視指摘 GV-26）/casts に「今期の時給」と「ノルマ達成状況」・絞り込み・並び替え

出典＝相談役ブロック 2026-10-15（便 GV-B W-4）。**本文（逐語）**: 「/casts カードと詳細に『今期の時給』（給与プレビューと同じ純関数・判定期間併記・保証中／体験入店の印）と『ノルマ達成状況』（採用軸ごとの 実績／目標＋進捗バー・/mine と同値）。絞り込みチップ＝待遇プラン／ランク／ノルマ（達成・進行中・未達）／時給の段／今日出勤。並び替え＝名前・時給・達成率。1 クエリ」。
適用＝便 GV-B（client のみ）: lib/nox/cast/current-wage.ts（currentWageOf＝/api/payroll/preview の PayResult から wdays 最終営業日の hourly／basis・判定期間＝slide_period＋slide_apply・保証中／体験入店・castNormStatusOf＝cardAxesOf の結果を none／done／progress／behind に畳む・monthElapsedOf）・casts-board（カードに今期の時給＋ノルマの進捗バー・絞り込み＝待遇プラン／ノルマ／時給の段／今日出勤（ランクは既存チップ）・並び替え＝名前／時給／達成率・読取＝preview 1 本＋get_cast_sales＋表ごと 1 クエリ）。suite gvb(4-1)(4-2)。

## 裁定373（2026-10-15 確定・相談役・便 GV-B W-3＝目視指摘 GV-25）ノルマ未達の減額は軸ごとに「定額／不足 1 件ごと」の 1 方式

出典＝相談役ブロック 2026-10-15（便 GV-B W-3）。**本文（逐語）**: 「ノルマ未達の減額は軸（出勤日数／同伴）ごとに『定額／不足 1 件ごと』のセグメントで 1 方式・入力は 1 つ・未選択側は null・両方入っている既存店は『不足ごと』扱いで件数を一覧に」。
適用＝便 GV-B（client のみ・set_penalty_config 不触）: lib/nox/pay.ts に normPenaltyModeOf（per＞0 なら不足ごと）・normPenaltyOneOf（normPenaltyOf＝golden 16,500 は不変）・comp-sections の PenaltyTab＝軸ごとに SegmentTabs＋金額 1 つ。★未選択側は **0 を送る**（RPC は 12 引数とも null を拒否＝null は送れない・仮決め B-5）。両方入っている既存店は「不足ごと」扱い＋注記（data-penalty-both）。suite gvb(3-1)(3-2)。

**確定（相談役 v46 §3・便 V46 V-2・2026-10-16）＝W-3 の 0 送信 追認**: 「③W-3 の未選択側は 0 送信＝追認（表示は「未使用」）」。＝仮決め B-5（set_penalty_config は null を拒否＝未選択側は 0 を送る）を追認。★表示「未使用」の文言は本便では client を触らない（docs のみ＝裁定256）＝plan-board の未選択側の見せ方は次の client 便で「未使用」に合わせる（報告に記載）。

## 裁定372（2026-10-15 確定・相談役・便 GV-B W-2＝目視指摘 GV-23／24）横はみ出し 0（①）・6 タブの共通部品化（②＝382）

出典＝相談役ブロック 2026-10-15（便 GV-B W-2）。**本文（逐語）**: 「/analytics 他で body の横スクロールを 0 に（固定幅・min-width・長い行を潰す・X-13-19 の型で全画面 grep）。/shift 確定タブ上部の金色の帯の描画崩れも同根なら一緒に」。②（6 タブ）は裁定382 の適用面。
適用＝便 GV-B（client のみ）: globals.css `html, body { overflow-x: hidden; }`・`.nox-mainarea, .nox-mainwrap, .nox-main { min-width: 0; }`・<600 の表は .nox-rwrap でカード化（td[data-label]::before）・/analytics の固定幅（maxWidth 130・min(200px, 100%)）。/shift 確定タブ上部の金色の帯は再現せず＝触らない（仮決め B-4）。suite gvb(2-1)。

## 裁定371（2026-10-14 確定・相談役・便 GV-A＝目視指摘 GV-22）今日タブのカードは 3 段固定＝見出し／5 分割セグメント／送り・退勤 50／50・時刻修正は文字リンク

出典＝相談役ブロック 2026-10-14（便 GV-A）。**本文（逐語）**: 「/shift 今日タブのカード（900〜1279px と 900px 未満）を 3 段構成に固定＝1 段目 写真・名前・状態チップ（左）＋確定時刻（右寄せ・18px）・打刻済み時刻はその下に小さく・「申請」は値がある時のみ／2 段目 出勤・遅刻・当欠・同伴・休み の 5 分割セグメント幅 100%（選択中は金塗り・高さ 48px）／3 段目 「送り」「退勤」を 50／50 の副ボタン（48px・送り実費以外の店は退勤 100%）・「時刻修正」は右下の文字リンク。カード間 12px・内側余白 16px。1280px 以上の表形式は V-1 のまま。」
適用＝便 GV-A（client のみ・DB 恒久変更 0・RPC 不触）: globals.css `.nox-todaywrap`（<1280・grid-template-areas name／state／conf・req・att・ops）・shift-board の td に c-name／c-req（data-empty）／c-conf／c-state・.nox-seg 5 列 48px 金塗り・.out 50／50（送りなし店は 100%）・.nox-rowops は文字リンク。suite today-row tr(5-3) 張替え・today-layout tl(3)。仮決め＝docs/tmp/gva_decisions.md。

## 裁定370（2026-10-14 確定・相談役・便 GV-A＝目視指摘 GV-21）誰の注文は商品行のみ・行内チップから同じモーダル・料金行は対象外

出典＝相談役ブロック 2026-10-14（便 GV-A）。**本文（逐語）**: 「「誰の注文を付ける」セクションを廃止し、明細の各商品行に「お客様」チップ（未指定＝灰「お客様 未指定」／指定済み＝金枠「H様」）を置き、タップで①と同じモーダル（見出し「このボトルのお客様を選ぶ」・ドリンク等は「この注文のお客様を選ぶ」）。料金行（セット・延長・指名料・サービス料）には出さない。画面・明細・印刷の用語は「お客様」で統一（「誰の注文」「名義」は使わない）。既存の保存先（注文行の customer_id）は不変。」
適用＝便 GV-A（client のみ・DB 恒久変更 0・RPC 不触）: register-board の明細 cd 列に `.nox-custchip`（customerChipLineOf＝商品行だけ）・check-customers-card の「誰の注文」節を撤去＋文言「来店のお客様（併存）」・customer-pick-modal（customerPickTitleOf／customerChipLabelOf）。suite register-customer rc(3)・customers-keep ck(6-1) 張替え。仮決め＝docs/tmp/gva_decisions.md。

**370 追補1（確定・未実装（GV-C）・2026-10-16・相談役 v46 §3）＝お客様チップは条件付き・同一行 ×N 集約**: 出典＝相談役引き継ぎ v46 §3（docs/handoff/NOX_相談役引き継ぎ_2026-10-16_v46.md・「新チャットで台帳に記す・本書で確定」＝便 V46 V-2 で記入・2026-10-16）。**本文（逐語）**: 「370 追補1（お客様チップは条件付き・同一行 ×N 集約）」／v46 §8-4「370 追補1 お客様チップ条件付き＋×N 集約」。適用＝未実装（GV-C）。GV 台帳 #42。

## 裁定369（2026-10-14 確定・相談役・便 GV-A＝目視指摘 GV-20）主ボタン 56px 幅 100% 中央・副 48px・行内は小

出典＝相談役ブロック 2026-10-14（便 GV-A）。**本文（逐語）**: 「ボタン基準＝主ボタン 高さ 56px・幅 100%・中央／副ボタン 高さ 48px・横並び中央／行内操作（削除・キープ・誰）は小の枠ボタンのまま。この基準を lib の button variant に置き、レジ・開卓モーダル・退勤ダイアログ・切替確認に適用。」
適用＝便 GV-A（client のみ・DB 恒久変更 0・RPC 不触）: lib/nox/ui/theme.ts btnPrimary56／btnSecondary48／btnRow48→開卓モーダル（主）・okuri-out-dialog（確定＝主・退勤のみ／キャンセル＝副）・341 の切替確認（副 2 本）・お客様モーダル。suite register-customer rc(2)・n1014 nd(1-2) 張替え。仮決め＝docs/tmp/gva_decisions.md。

## 裁定368（2026-10-14 確定・相談役・便 GV-A＝目視指摘 GV-19）ボトル投入直後に顧客選択モーダル・顧客セクションへ飛ばない

出典＝相談役ブロック 2026-10-14（便 GV-A）。**本文（逐語）**: 「ボトル（キープ対象の商品）を明細に入れた直後に顧客選択モーダル（キャスト選択モーダルと同形＝最近来店 5 名・名前／ふりがな／電話検索・「新規登録して追加」・「あとで」）。選んだ顧客が伝票に未付与なら来店名義として併存で追加。顧客セクションへの遷移はしない。」
適用＝便 GV-A（client のみ・DB 恒久変更 0・RPC 不触）: components/nox/customer-pick-modal.tsx（候補＝customers 1 本＋customer_list_summary 1 本＝N+1 なし・未付与なら check_customer_add→check_line_set_customer）・register-board の useEffect（この伝票を開いてから増えたボトル行だけ自動オープン）・キープ登録の onNeedCustomer も同じモーダル。suite register-customer rc(1)・messages ms(2-9) 張替え。仮決め＝docs/tmp/gva_decisions.md。

## 裁定367（2026-10-14 確定・相談役・便 GV-A＝目視指摘 GV-15〜18）上部ヘッダーは非固定・レジは伝票操作バーとセグメントの 2 段を固定・人数変更の注記は削除

出典＝相談役ブロック 2026-10-14（便 GV-A）。**本文（逐語）**: 「アプリ上部ヘッダー（ロゴ・店名・ユーザーチップ）は全画面で非固定（スクロールで流れる・下部ナビと PC サイドバーは不変）。/register では伝票の操作バー（卓名・人数・延長・合計・伝票取消・合算）と「注文／指名・席／会計」セグメント（V-3）の 2 段を上部に sticky（上部ヘッダーが流れた後は画面最上部に張り付く・背景は不透明）。注記「※セット中の人数変更はセット料金に反映されます…」は削除し、開卓モーダル（A-1）の人数ステッパー脇に「延長は追加時点の人数で確定」の 1 行だけ。」
適用＝便 GV-A（client のみ・DB 恒久変更 0・RPC 不触）: globals.css `.nox-tb { position: static }`・`.nox-regsticky`（backbar＋row2＋セグメント・不透明）・register-board の注記 2 本削除＋開卓モーダルに data-people-note。suite register-sticky rs(1)〜(3)（PWA 含む）。仮決め＝docs/tmp/gva_decisions.md。

## 裁定366（2026-10-14 確定・相談役・便 GV-A＝目視指摘 GV-14）報酬明細は 1 人 1 カード・手取りは黒地に金枠金文字

出典＝相談役ブロック 2026-10-14（便 GV-A）。**本文（逐語）**: 「報酬明細（印刷／PDF）は 1 人 1 カード＝外周 1px 枠・見出し行は名前を 22px・月と契約区分チップを右・カード間は 24px・印刷時は 1 人 1 ページ（page-break-after）。支給／控除の見出し帯は薄灰。手取り帯は金塗り＋黒文字を廃止→黒地・金 2px 枠・金文字 28px 太字・右寄せ。PDF 出力も同じ CSS。」
適用＝便 GV-A（client のみ・DB 恒久変更 0・RPC 不触）: components/payslip-slip.tsx（ps-name／ps-meta・marginBottom 24）・theme slipHd／slipName／slipSec／slipFoot／slipFootVal・globals.css `.nox-payslip` 枠＋@media print の .ps-foot（黒地金枠金文字・print-color-adjust exact）。suite statement-print sp(1)〜(3)。仮決め＝docs/tmp/gva_decisions.md。

## 裁定365（2026-10-14 確定・相談役・便 GV-A＝目視指摘 GV-13）給与一覧は全幅・1280px 未満は 7 列横書き・900px 未満はカード

出典＝相談役ブロック 2026-10-14（便 GV-A）。**本文（逐語）**: 「/payroll の月次一覧は表を全幅に。1280px 未満は縦書きヘッダ廃止・列は キャスト／時間／日数／総支給／控除計／手取り／前借り の 7 列（税区分は名前の下のチップ・売掛は手取り列の下に小さく）。900px 未満は 1 人 1 カード（X-13-17 と同形）。名前・日数は折り返さない。」
適用＝便 GV-A（client のみ・DB 恒久変更 0・RPC 不触）: payroll-board `.nox-paytable.v365`＋`.nox-paycols`（右パネルは ≥1280 だけ横並び）・名前下 .nox-paytax・手取り下 .nox-payar・globals.css（<1280＝nth-child で 税区分／売掛／送り／不整合 を隠す・<900 カード）。suite payroll-view pv(7-1)。仮決め＝docs/tmp/gva_decisions.md。

## 裁定364（2026-10-14 確定・相談役・便 GV-A＝目視指摘 GV-12）顧客詳細はすべての幅でモーダル表示・右パネルと下送りは廃止

出典＝相談役ブロック 2026-10-14（便 GV-A）。**本文（逐語）**: 「/customers の顧客詳細を右パネル／下送りからモーダルに統一（全幅・中央寄せ・幅は画面の 90%・上限 720px・概要／来店／ボトル／メモのタブはそのまま・「詳細・編集を開く」も内部で遷移）。一覧の選択行は金枠のまま残し、× か背景タップで閉じる。幅 1280px 以上でもモーダル（右パネルは廃止）。」
適用＝便 GV-A（client のみ・DB 恒久変更 0・RPC 不触）: customers-board＝右パネルの中身を Modal（maxWidth 720・≥901 は 90vw＝globals.css :has）へ・一覧は 1 列（.nox-2pane 不使用）・onClose＝setSel(null)。suite customers-keep ck(7-1)。仮決め＝docs/tmp/gva_decisions.md。

## 裁定363（2026-10-14 確定・相談役・便 GV-A＝目視指摘 GV-11）ランキングの既定軸は売上（按分）＝ホームの「本指名ランキング」カードを「売上ランキング（今月）」に変え本指名件数は切替で

出典＝相談役ブロック 2026-10-14（便 GV-A）。**本文（逐語）**: 「ランキングの既定軸は売上（按分）＝ホームの「本指名ランキング」カードを「売上ランキング（今月）」に変え本指名件数は切替で。/analytics と /mine/ranking の既定も売上・切替で本指名件数（346 の off／self／top は不変）。」
適用＝便 GV-A（client のみ・DB 恒久変更 0・RPC 不触）: dashboard-board（get_cast_sales 当月→castSalesRankingOf 上位 5・SegSelect 売上／本指名件数・既定 sales）・analytics-board 既定 sales・/mine/ranking（既定＝売上の順位＝自分の行・本指名件数は ?axis=nom・346 不変）。suite ranking-default rd(1)〜(3)。仮決め＝docs/tmp/gva_decisions.md。

## 裁定362（2026-10-14 確定・相談役・便 GV-A＝目視指摘 GV-10）メニュー一覧（下部ナビ「メニュー」）: 600〜899px は 2 列グリッド・900px 以上は 3 列・600px 未満は 1 列

出典＝相談役ブロック 2026-10-14（便 GV-A）。**本文（逐語）**: 「メニュー一覧（下部ナビ「メニュー」）: 600〜899px は 2 列グリッド・900px 以上は 3 列・600px 未満は 1 列。カード内の「＞」を削除しカード全体をタップ対象（説明 1 行は残す）。」
適用＝便 GV-A（client のみ・DB 恒久変更 0・RPC 不触）: nav.tsx の項目 map を `.nox-navsheet-grid` で包む・Modal 760・globals.css（1／2／3 列・.nox-navchev 非表示）。suite menu-grid mg(1)〜(3)・nav nv(6-3) 張替え。仮決め＝docs/tmp/gva_decisions.md。

## 裁定361（2026-10-14 確定・相談役・便 GV-A＝目視指摘 GV-9）サイドバー: 幅 900〜1279px はアイコンのみのレール（64px・ラベルはホバー／長押し・現在地は金）

出典＝相談役ブロック 2026-10-14（便 GV-A）。**本文（逐語）**: 「サイドバー: 幅 900〜1279px はアイコンのみのレール（64px・ラベルはホバー／長押し・現在地は金）。1280px 以上は全幅。/register・/floor・/kiosk はレールも畳んで左上 ≡ のドロワーに。手動の「畳む／広げる」トグルを置き localStorage に記憶（try/catch）。900px 未満は下部ナビのまま。」
適用＝便 GV-A（client のみ・DB 恒久変更 0・RPC 不触）: side-nav.tsx（mode＝hidden／rail／full・localStorage nox.sidenav・matchMedia 1280・data-side-toggle・≡ data-nav-burger→TabBar のシート drawer 節＝全項目）・nav.tsx sheetGroups・globals.css（.is-rail 64px・.is-hidden）。/kiosk は (manage) 外＝対象なし（仮決め）。suite sidebar-rail sr(1)〜(3)。仮決め＝docs/tmp/gva_decisions.md。

## 裁定360（2026-10-14 確定・相談役・便 GV-A＝目視指摘 GV-8）伝票の「注文／指名・席／会計」をタブから大きな 3 分割セグメントに＝選択中は金塗り・未選択は枠のみ・高さ 1.5 倍・アイコン付き（注文／指名・席／会計）・伝票上部に sticky

出典＝相談役ブロック 2026-10-14（便 GV-A）。**本文（逐語）**: 「伝票の「注文／指名・席／会計」をタブから大きな 3 分割セグメントに＝選択中は金塗り・未選択は枠のみ・高さ 1.5 倍・アイコン付き（注文／指名・席／会計）・伝票上部に sticky。会計は右端で主ボタン色（青塗り）。」
適用＝便 GV-A（client のみ・DB 恒久変更 0・RPC 不触）: register-board `.nox-dtabs--seg`（DTAB_ICON・会計は .pay）＝裁定367 の sticky 器の中。suite register-tabs rt(1)〜(3)。仮決め＝docs/tmp/gva_decisions.md。

## 裁定359（2026-10-14 確定・相談役・便 GV-A＝目視指摘 GV-7）レジ「指名の分配率」: キャスト 1 人＝1 カード（写真・名前・ランクを左に大きく・右に区分の切替のみ）

出典＝相談役ブロック 2026-10-14（便 GV-A）。**本文（逐語）**: 「レジ「指名の分配率」: キャスト 1 人＝1 カード（写真・名前・ランクを左に大きく・右に区分の切替のみ）。選択中の区分は金塗り・未選択は枠のみ・行の左帯を区分色（本＝金／場内＝青／フリー＝灰）。常時表示は「分配率の合計」バーと「均等に分配」だけ。「料金と実績を分離」「件数換算は目安」「変更時点で明細を同期」の 3 注記は見出し横の ⓘ に畳む。「本指名料 ¥3,000 自動加算」は区分ボタン下に「¥3,000」のみ。341 の切替確認は行内のまま・見出しを「<名前> → 本指名」に短縮。同伴チップと % 入力は行右端にまとめる。1 行の高さを現状の半分以下に。」
適用＝便 GV-A（client のみ・DB 恒久変更 0・RPC 不触）: register-board `.nox-nomcard`（data-kind＝左帯色・写真 36px・nox-seg gold・¥ のみ・右端に同伴チップ／人数／%／×・341 の見出し）・3 注記は `<details>` の ⓘ・ハンドラは逐語不変。suite nomination-card nc(1)〜(4)・x13 nom-2 張替え。仮決め＝docs/tmp/gva_decisions.md。

## 裁定358（2026-10-14 確定・相談役・便 GV-A＝目視指摘 GV-6）/shift 今日タブ: 幅 1280px 未満では右カラム（時間帯別の充足・出勤ボーナス）を「今日のシフト」表の下に落とし、表を全幅に

出典＝相談役ブロック 2026-10-14（便 GV-A）。**本文（逐語）**: 「/shift 今日タブ: 幅 1280px 未満では右カラム（時間帯別の充足・出勤ボーナス）を「今日のシフト」表の下に落とし、表を全幅に。表の列は iPad 横で折り返さない（確定時間は 1 行・操作ボタンは 2 段可）。」
適用＝便 GV-A（client のみ・DB 恒久変更 0・RPC 不触）: shift-board `.nox-2col.nox-2col--today`（globals.css＝1 列・≥1280 で 1fr 380px）。suite today-layout tl(1)〜(3)。仮決め＝docs/tmp/gva_decisions.md。

## 裁定357（2026-10-14 確定・相談役・便 N1014 A-6＝GV-5）送り実費の発行は退勤後も営業日内は可・退勤時に未発行ならダイアログ

出典＝相談役ブロック 2026-10-14（便 N1014 A-6・Agoora 目視 GV-5）。**本文（逐語）**: 「送り実費の発行は退勤後も営業日内は可。退勤時に未発行ならダイアログで『送りを発行して退勤／退勤のみ』。disabled は方式と当日発行済みのみ」。
適用＝便 N1014（client のみ・mig 0）: lib/nox/shift/today-row.ts（okuriButtonOf＝有効条件は 実費店・出勤打刻あり・当日未発行＝退勤後も可／outDialogNeeded＝実費店かつ当日未発行）・/shift 今日タブ（「送り」→発行済みは「送り済」disabled・「退勤」→実費店で未発行なら退勤ダイアログ＝「送りを発行して退勤」（既定・金額は前回値か店の既定・メモ任意）／「退勤のみ」・実費以外はダイアログなし・退勤後の単独発行は transport_issue_bulk のみ＝冪等キー＝最後の out 打刻 id）・components/nox/okuri-out-dialog.tsx（mode outAndIssue／issueOnly・onOutOnly）。翌営業日以降の発行は既存の時刻修正と同じ扱い（本便は触らない）。suite today-row tr(8-1)〜(8-4)。仮決め＝docs/tmp/n1014_decisions.md §A-6。

## 裁定356（2026-10-15 確定・相談役・便 GV-B W-12＝案は 2026-10-14 便 N1014 X-7）スタッフの勤怠・報酬

**確定（便 GV-B W-12・2026-10-15）**: 案のとおり。器＝0172 ★5（staff_contracts／staff_punches／staff_payroll_runs＝読取のみ・書込 RPC は次便）。

出典＝相談役ブロック 2026-10-14（便 N1014 X-7 差し替え）。**案（逐語）**: 「スタッフも契約区分 雇用／委託。雇用＝時給×実働＋固定手当−控除・源泉は給与所得（甲／乙・月額表／日額表）。委託＝時給×実働か固定報酬・源泉率は既定 0（T11 税理士確認後に確定）・インボイスはキャスト委託と同じ器・労働者性注記（350）を同文で表示。月次締め・本人は自分の勤怠と明細のみ・店長は自店の勤怠修正と報酬プレビュー・確定は owner・店長自身の報酬は owner のみ」。
読取＝器なし（スタッフの打刻表・勤怠・報酬・memberships の契約区分／時給／税区分すべて無し。在るのは staff_pin／set_staff_pin／kiosk_login＝レジ kiosk のログイン）。差分（DB＝0172 同乗: staff_contracts／staff_punches／staff_pay_runs＋lines・RPC 5・lib/nox/staff/pay.ts・UI 4 画面・suite +12 段）＝docs/tmp/x_plan.md X-7。T11（委託スタッフの源泉と支払調書）を専門家確認事項に起票。

**356 追補1（確定・未実装（GV-C）・2026-10-16・相談役 v46 §3）＝給与画面のキャスト／スタッフ切替（計算は 0172 後）**: 出典＝相談役引き継ぎ v46 §3（docs/handoff/NOX_相談役引き継ぎ_2026-10-16_v46.md・「新チャットで台帳に記す・本書で確定」＝便 V46 V-2 で記入・2026-10-16）。**本文（逐語）**: 「356 追補1（給与画面のキャスト／スタッフ切替・計算は 0172 後）」／v46 §1「356（スタッフ勤怠・報酬・雇用／委託＋追補1 給与画面の切替＝未実装）」／v46 §8-4「356 追補1 キャスト／スタッフ切替（器のみ）」。適用＝未実装（GV-C・器のみ）。

## 裁定355（2026-10-14 確定・相談役・便 N1014 A-5）/kiosk のスタッフ群＝器なし・0172 案へ

出典＝相談役ブロック 2026-10-14（便 N1014 A-5）。**本文（逐語）**: 「裁定355（X-1 で器ありの場合のみ）＝/kiosk の一覧を『キャスト』『スタッフ』の 2 群・スタッフも PIN→出勤／退勤・書き先はスタッフ勤怠（分離）・オーナーは出さない。器が無ければ 0172 案に『memberships に PIN（hash）』を含めて報告」。
読取（X-1）＝PIN は**あり**（staff_pin＝membership_id PK・pin_hash・set_staff_pin／kiosk_login）・スタッフの打刻表・勤怠 RPC は**なし**→実装せず。0172 案＝staff_punches（membership_id・in／out・biz_date・source kiosk／manual）＋staff_punch（PIN＝kiosk_login 流用）＝裁定356 の表と同じ便（docs/tmp/x_plan.md X-1／X-7）。

## 裁定354（2026-10-14 確定・相談役・便 N1014 B-5）デモ 6 店のキャスト全員に PIN 1234

出典＝相談役ブロック 2026-10-14（便 N1014 B-5）。**本文（逐語）**: 「裁定354＝デモ 6 店のキャスト全員（A-5 実装時はスタッフも）に PIN 1234 を payload で設定（既存経路・デモ org のみ）。/demo の『打刻端末で開く』脇と /kiosk 上部（デモ org のみ）に『デモの PIN は 1234』。本番 org は表示なし・PIN 未設定は押せないまま」。
適用＝便 N1014（payload・client のみ）: gen-demo が cast_pin を全キャストに生成（bcrypt cost 6 の固定ハッシュ＝1234）・components/ui/demo-terms.tsx の「打刻端末で開く」脇に `data-demo-pin`「デモの PIN は 1234」。★/kiosk 上部の注記は**出さない**（kiosk は PIN 前の匿名面で orgs.is_demo を読めない＝器なし・仮決め B-5）。スタッフの PIN は A-5 器なしのため未設定。suite n1014 nd(3-2)／nd(4-1)。

## 裁定353（2026-10-14 確定・相談役・便 N1014 A-2）/casts のカードに「今日の状態」1 行＋「今日出勤」フィルタ

出典＝相談役ブロック 2026-10-14（便 N1014 A-2）。**本文（逐語）**: 「/casts のカードに『今日の状態』1 行＝予定なし／出勤予定 HH:MM〜翌HH:MM／出勤中 HH:MM〜（予定 翌HH:MM）／退勤 HH:MM〜HH:MM／未出勤 HH:MM 予定／休み希望・当欠。今日タブ（/shift）の判定純関数をそのまま呼ぶ・別計算を作らない。一覧上部に『今日出勤』フィルタ。casts-board の select に今日の shifts と punches（1 クエリ・N+1 禁止）」。
適用＝便 N1014（client のみ・mig 0）: lib/nox/shift/today-row.ts に todayStateOf（7 種・今日タブと同じ firstInLastOut／punchTimeLabel／bizDateOf）と isTodayWorking・casts-board は shifts／attendance／punches を表ごとに 1 クエリ（キャストごとの問い合わせ 0）・カード「今日: …」（data-today-state）・フィルタ「今日出勤」＝is_active かつ isTodayWorking。suite n1014 nd(2-1)〜(2-3)。仮決め＝n1014_decisions.md §A-2。

## 裁定352（2026-10-14 確定・相談役・便 N1014 A-1＝改訂版）開卓モーダル＝BANZEN 形

出典＝相談役ブロック 2026-10-14（便 N1014 A-1・便の途中で改訂版が届き初版を上書き）。**本文（逐語・改訂版）**: 「開卓モーダルは中央寄せで大きく・人数は −／＋ステッパー・セット料金ルールは横並びセグメント・『開卓（セット開始）』を中央に大きく 1 つ・予約とやめるはその下に小さく」。指示の詳細＝「中央寄せ・幅は画面の 80%（上限 560px）・文字と余白を今の 1.5 倍。見出し『<卓名> を開卓』。人数＝−／＋ステッパー（既定 1・下限 1・上限＝卓の定員があればそれ・無ければ 20・直接入力なし）。セット料金ルール＝プルダウン廃止→横並びのセグメント（自動／各ルール名・選択中は金塗り・既定は自動・ルールが 1 つなら非表示）。主ボタン『開卓（セット開始）』を中央に大きく 1 つ（幅 100%・高さ 56px）。『予約を入れる』『やめる』はその下に小さく横並び。開卓 RPC は既存のまま・相席導線は不変・kiosk 不触」。初版（「席を開くダイアログは席名を見出し・人数は −／＋ステッパー（既定 1・上限は席定員か 20）・『席を開く』1 ボタン・直接入力なし」）は改訂で置換。
適用＝便 N1014（client のみ・mig 0・check_open の引数 1 バイト不変）: app/(manage)/register/register-board.tsx（Modal maxWidth 560＋globals.css `.nox-modal-card:has(> [data-open-seat-modal]) { width: 80vw }`（>900px のみ・≤900 はシート全幅）・見出し 21px・本文 15px・ステッパー 72×60・ルール＝data-rule-seg（owner／manager かつ有効ルール 2 件以上のときのみ）・主ボタン data-open-seat 幅 100%／56px・予約／やめる（data-open-cancel）は下に小さく）。料金区分（116-UI）は対象外＝select のまま。suite n1014 nd(1-1)／(1-2)。仮決め＝n1014_decisions.md §A-1。

**352 追補1（確定・未実装（GV-C）・2026-10-16・相談役 v46 §3）＝開卓時のお客様**: 出典＝相談役引き継ぎ v46 §3（docs/handoff/NOX_相談役引き継ぎ_2026-10-16_v46.md・「新チャットで台帳に記す・本書で確定」＝便 V46 V-2 で記入・2026-10-16）。**本文（逐語）**: 「352 追補1（開卓時のお客様）」（裁定388 の欄の逐語 1 文）／v46 §1「352（開卓モーダル＋追補1 開卓時のお客様＝未実装）」／v46 §8-4「352 追補1 開卓時のお客様」。適用＝未実装（GV-C）。GV 台帳 #40。

### GV-4（2026-10-14・便 N1014 A-3・裁定番号なし）/kiosk の名前タイルをグリッドに
適用＝app/kiosk/page.tsx `.nox-kioskgrid`（globals.css＝2 列・≥600px 3 列・≥900px 4 列）。suite n1014 nd(3-1)。

## 裁定351（2026-10-15 確定・相談役・便 GV-B W-12＝案は 2026-10-14 便 N1014 X-4）店舗向け利用規約＝雛形 v0.9 先行・本番 org の開通は同意ゲート

**確定（便 GV-B W-12・2026-10-15）**: 案のとおり。器＝0172 ★4（terms_acceptances＋terms_accept＋terms_accepted_version_ok＝開通ゲートの read・デモ org は常に true）。client（/terms/accept・layout のゲート）は適用後の便。

**案**: 「店舗向け利用規約は雛形 v0.9（docs/legal/terms_store_v0.9.md・16 見出し＝サービス内容／アカウント管理／利用料金・支払／店舗データの取扱い／個人情報／再委託／禁止事項／バックアップ・データ保持／解約時のデータ／メンテナンス・停止／知的財産／免責・損害賠償／契約解除／規約変更／反社／準拠法・管轄・各条【弁護士確認】）で先行実装。同意は店舗・法人単位＝terms_acceptances（org_id・terms_version・accepted_at・accepted_by_user_id＝owner）＋RPC terms_accept（owner・冪等・audit）。本番 org（is_demo＝false）は現行 version の同意が無ければ /terms/accept へ誘導する必須ゲート（デモ org は除外・置き場＝(manage)/layout の org 読取直後）。デモ規約（L7）はそのまま完了。/terms は lp_plan.md L-2 の器（60 行・noindex・弁護士確認後に公開）。DB＝0172 同乗（表 1・RPC 1・suite 4 段）」。出典＝弁護士回答 2026-10-14（専門家確認事項 L6 ④・逐語）。読取＝docs/tmp/x_plan.md X-4。

## 裁定350（2026-10-15 確定・相談役・便 GV-B W-12＝案は 2026-10-14 便 N1014 X-3）労働者性の注記＝弁護士の文言 2 段へ差し替え

**確定（便 GV-B W-12・2026-10-15）**: 案のとおり。client 2 箇所（NOTE_EMPLOYMENT＋NOTE_LABOR・報酬調整の注記）＋pin 2 本は次便（mig 0）。

**案**: 「契約区分の注記（NOTE_EMPLOYMENT＋NOTE_LABOR＝lib/nox/cast/pay-rule.ts・キャスト詳細『待遇・バック』）を本文 1 段『業務委託として登録しても、法令上の労働者性や税務上の所得区分が確定するものではありません。仕事を断る自由、業務上の指揮監督、勤務時間・場所の拘束、代替性、報酬の決め方など、実際の働き方によっては労働者に該当する場合があります。』に差し替え、報酬調整（契約）の減額・控除の下に『報酬の減額・控除を設定する場合は、契約上の根拠と実際の運用が一致していることを確認してください。』を追加。291 追補1 の考え方は維持。mig 0・client 2 箇所・pin 2 本」。出典＝弁護士回答 2026-10-14（専門家確認事項 L3 ④・逐語）。読取＝docs/tmp/x_plan.md X-3。

## 裁定349（2026-10-15 確定・相談役・便 GV-B W-12＝案は 2026-10-14 便 N1014 X-2）日払いの源泉＝日数は暦日数・日払いは settlement／advance・雇用は税額表

**確定（便 GV-B W-12・2026-10-15）**: 案のとおり。器＝0172 ★1（daily_pays.kind・daily_pay_issue p_kind・daily_pays_of_run の kind 別 3 列）・★2（扶養控除等申告書）・★3（店設定 settlement_cycle／mid_pay）。雇用の税額表（日額／月額・甲／乙）は器が別（起票113 と同じ第 2 期の表）＝0172 には載せない。期間精算から settlement を除く計算は client（lib/nox/payroll）の適用後の便。

**案**: 「委託の源泉は（報酬 − 5,000 円 × 計算期間の暦日数）× 10.21%・日数＝精算方式の暦日数（月次 28〜31／半月 13〜16／週次 7／日次 1）。日払いは settlement（日次精算・1 日分控除・期間精算から除外）と advance（前払・仮払・控除なし）＝『日払いの発行』は settlement・『前借りの発行』は advance。雇用は支払方式で日額表／月額表・扶養控除等申告書あり甲／なし乙・丙欄は第 2 期（起票113）。店設定は契約区分／精算方式／途中払いの 3 フィールド（『日払い ON』の 1 フラグで源泉方式を決めない）」。出典＝税理士回答 2026-10-14（専門家確認事項 T10 ④・逐語）。読取＝現行の「暦日数 × 5,000」は回答と一致（golden 不変）・欠け＝daily_pays.kind・雇用の税額表・扶養申告書の列・店設定の 2 キー＝**0172 が要る**（docs/tmp/x_plan.md X-2 の表）。

## 裁定348（2026-10-14 確定・相談役・便 DM-1）デモ 6 店の報酬形態マトリクス

出典＝相談役ブロック 2026-10-14（便 DM-1 D-2・相談役提示の表）。**本文（逐語）**: 「ACE 売上月次＋指名・商品バック＋売上・指名ノルマ＋送り実費／LUNA 売上半月＋ドリンク区分別＋日数・同伴＋送り定額／NOIR pt 月次・本指名件数・S／A＋商品 pt・指名バック＋指名ノルマ＋送りなし／MUSE 併用＋売上歩合＋4 軸＋送り実費／NEST スライドなし・固定＋期限付き保証＋ノルマなし・休み希望のみ＋送り定額／LILY 雇用・確定シフト基準＋達成ボーナス＋日払い＋日数ノルマ＋送り店負担」。既存の X-13 で目視 OK 済みの値（ACE の段・LUNA の半月・NOIR の件数）は動かさない。店ごとに「見せ場 1 行」を store_profiles に追記。

D-1 読取（併用）＝**高い方**（lib/nox/pay.ts wageDetail `hourly = max(bySales, byPts, base)`・同値時 売上＞ポイント＞保証・338 の期間累計も同じ式）＝器あり・mig 0。

適用＝便 DM-1（client・payload のみ・DB 恒久変更 0）: scripts/demo/profiles.mjs（PROFILES に okuriMode／normAxes／employment／dailyPay／wishMode／showcase・sys を表に・SLIDES.muse＝月次 売上段 30／50／80 万→2,200／2,500／3,000＋pt 段 40／80／150→2,300／2,600／3,000・sysSettingsOf に sales_rate）・gen-demo.mjs（okuri_mode・shift_request_mode・MUSE 商品バック plan_rate 10%・LILY 雇用／cast_tax_profiles 雇用／daily_pays 4 件・cast_norms／cast_quotas は採用軸だけ・達成ボーナスは LILY のみ）・payload 6 本再生成・suite demo-profiles（dpf(1-3)(1-4)(2-1)(2-4)(2-5)(2-6) 張替え＋(2-7)(2-8) 新設）・demo-payload dp(5-1)（06:05 の文言＝lib/nox/demo/terms.ts）・337。器なしの言い換え＝売上歩合＝商品バック plan_rate（指名料の率ではなく売上の割合）・送り店負担＝送りなし（okuri_mode は flat／actual）。仮決め一覧＝docs/tmp/dm1_decisions.md。

### 裁定348 追補1（2026-10-14 確定・相談役・便 DM-1 D-2b）体験入店

**本文（逐語）**: 「体験入店＝6 店すべてに待遇プラン「体験入店」（スライド・バックなし・基本時給は店ごとに別額）を置き、各店 1 名を体験入店プランに割り当て、set_cast_guarantee の期限付き保証時給（開始＝デモ基準日・期間 3 営業日・額は店ごと別・NEST だけは期限切れ済み＝基本時給に戻った状態）を payload に入れる。/mine と給与プレビューに「保証時給（〜10/xx）」の印が出ること・期限切れ後は基本時給で計算されることを D-3 の before／after と live に含める。」

適用＝便 DM-1: profiles.mjs TRIAL（base＝MUSE 1,500／LUNA 2,000／NOIR 2,500／ACE 2,200／LILY 1,300／NEST 1,200・保証＝2,300／3,000／3,500／3,200／1,800／1,800・R〜R+2・NEST は R-5〜R-3・割当＝まり／まい／こころ／るな／ゆな／レン）・gen-demo（プラン＝スライド 0・指名バック 0・商品バック plan_fixed 0／cast_plan は set_cast_guarantee の 3 行形＝直前行 valid_to R-1・保証行 {base, guarantee:true}・戻し行 R+3〜）・/mine の印「保証時給（〜MM/DD）¥X」（app/mine/page.tsx・今日を含む保証行があるときだけ・期限後は出さない）・給与プレビューは既存の明細行「うち保証 MM/DD〜MM/DD ¥X」。

### 裁定348 追補2（2026-10-14 確定・相談役・便 N1014 B-1〜B-4）MUSE 指名 ON・LILY 9 月ノルマ・体験入店の 10 月出勤・業態

**本文（逐語）**: 「B-1 profiles.mjs＝MUSE を指名 ON（キャバ型）に戻し、併用（売上段＋pt 段）と売上歩合が 2026-09 で発火する伝票・pt を入れる（さおり で両段に値・高い方が採用）。B-2 LILY＝2026-09 の cast_norms 2 名分（1 名達成＝達成ボーナス行あり・1 名未達）。B-3 体験入店 6 名＝2026-10 に出勤 2〜3 日・保証時給の明細行と NEST レン の期限切れ後＝基本時給行。B-4 store_profiles に業態 1 行（ACE キャバクラ／LUNA キャバクラ／NOIR ラウンジ／MUSE キャバクラ／NEST スナック／LILY ガールズバー）・profiles.mjs の業態テンプレと一致（不一致なら profiles.mjs を合わせる）」。
適用＝便 N1014（payload のみ・DB 恒久変更 0）: profiles.mjs（muse＝cabaret・nominations true・pt 段 10／20／40→2,300／2,600／3,000・lily normAxes days／sales・nest＝snack）・gen-demo（MUSE に既定ランク 1 本と指名を注入＝check_nominations 53・LILY 先月の cast_norms＝みく 300,000 達成／ゆな 9,000,000 未達・体験入店 6 名の 10 月出勤＝保証期間 [R−1, R, R+1]（NEST は [R, R+1, 期限+1]）の今日以前＝確定シフト＋出勤＋in 20:00／out 翌 02:00）・store_profiles §3c 業態・seed.ts DEMO_STORE_LABEL（muse キャバクラ・nest スナック）。before／after（給与プレビュー・docs/tmp/dm1_preview_*.json）＝【B-6 の表】。suite n1014 nd(4-1)〜(4-4)・demo-profiles 張替え。

## 裁定346（2026-10-13 確定・相談役・便 N1013b B-2b）ランキングに売上軸・キャスト側は off／self／top

出典＝相談役ブロック 2026-10-13（便 N1013b B-2b・改訂版）。**本文（逐語）**: 「ランキングに売上軸を追加。売上は給与と同じ按分後の額。キャスト側の表示は off／self／top の 3 値・既定 self・他人の金額は出さない」

適用＝便 N1013b（client のみ・mig 0）: lib/nox/payroll/cast-sales.ts（sumCastSales／castSalesRankingOf＝collect・/api/mine/norm-progress・analytics の 3 箇所が同じ関数・castRankingModeOf＝既存キー ranking×ranking_show_others→off／self／top）・analytics-board（キャストランキングの軸切替 指名数／売上）・/mine/ranking（self＝自分の行だけ）・/mine（off 以外はカード）・mine-settings-panel の説明。suite ranking 14。
★キャスト側の売上軸の順位は器なし（get_cast_sales は cast に本人行のみ・順位は他人の額が要る）＝起票112（0172 候補）。仮決め＝docs/tmp/n1013b_decisions.md §B-2b。

### 裁定346 追補1（2026-10-14 確定・相談役・便 V1014 V-3）self は 0171 の器で実装

**本文（逐語）**: 「346 追補1（self は 0171 の器で実装）」。読取＝cast は get_cast_sales で本人行しか読めず順位に他人の額が要る（便 N1013b 仮決め R-4）→0171 に get_cast_sales_rank(p_store_id, p_period)（cast＝自分の 1 行だけ・owner／manager＝全員・売上＝cast_sales_aggregate）を同乗（起票112 はクローズ）。client（/mine ランキングの売上順位 self・top は名前のみ）は 0171 適用後の便。

## 裁定345（2026-10-13 確定・相談役・便 N1013b B-2）シフト希望の表示状態＝シフトの状態から導く 4 段

出典＝相談役ブロック 2026-10-13（便 N1013b B-2・読取＝docs/tmp/sr_plan.md・GV-1 ACE ひなの）。**本文（逐語）**: 「シフト希望の表示状態はシフトの状態から導く 4 段＝審査中／採用・確認待ち／採用・確定／見送り。3 画面とも同じ純関数。管理側の確定ボタンは『代行確定』（manager 以上）。shift_cast_confirm OFF の店は採用＝確定」

適用＝便 N1013b（client のみ・mig 0・RPC 不触）: lib/nox/shift/wish-state.ts（wishStateOf／wishStateDetailOf／wishStateTextOf・PROXY_CONFIRM_LABEL・MINE_RECENT_SHIFT_LIMIT 14）・/mine/wishes（shifts を wish_id で結線・今日以降のシフト節）・/mine 直近（14 件＋「すべて見る」＝GV-1 の 10/29 はこれで出る）・shift-board（SHIFT_ST_LABEL＝4 段・queue の段＝wishStateTextOf・「承認」→「代行確定」・OFF の店は採用→shift_confirm_bulk 即時）・wish-calendar（採用／見送り）・gen-demo（採用済み＝planned・payload 6 本再生成）。タブ名「承認待ち」は不変（裁定274）。suite wish-state 25・wc(5-1)／dpf(3-3) 張替え。

### 裁定345 追補1（2026-10-14 確定・相談役・便 V1014 V-3）OFF 店は採用で即 confirm・代行確定の理由省略

**本文（逐語）**: 「345 追補1（OFF 店は採用で即 confirm・代行確定の理由省略）」＝便 N1013b の仮決め S-1（shift_cast_confirm OFF の店の「採用＝確定」は採用操作で shift_wish_decide の戻り id を shift_confirm_bulk 1 件へ＝ラベルは常に shifts.status から）と S-5（「代行確定」の理由は RPC に器が無い＝入力欄なし）を追認。S-2〜S-4・S-6・S-7 も同じ扱い。

## 裁定344（2026-10-13 確定・相談役・便 N1013b B-1）LP＝/lp

出典＝相談役ブロック 2026-10-13（便 N1013b B-1・読取＝docs/tmp/lp_plan.md L-2）。**本文（逐語）**: 「/lp は Next.js 内の static route・/demo と同じ土台。6 店カード＋動画＋『この店で試す』＝/demo?store=&role= の初期選択・帯は DEMO_RESET_TIME_JA と DEMO_TERMS の逐語・料金は問い合わせ導線・/terms は L6 待ちで非公開・動画は public/lp/<store>.mp4」

適用＝便 N1013b（client のみ）: app/lp/page.tsx（force-static・noindex＝公開ゲートの後に index・6 店カード＝DEMO_STORES／DEMO_STORE_LABEL・動画は public/lp/<store>.mp4 が無い間はポスター枠・この店で試す＝/demo?store=&role=owner・料金＝mailto・/terms リンクなし・スマホ 1 列）・demo-terms（demoInitialSelectionOf／demoBizOrderOf・?store=&role= の初期選択）・/demo page（Suspense）・session.ts（/lp exempt）・robots.ts（allow /lp）。suite lp 13。仮決め＝docs/tmp/n1013b_decisions.md §B-1。

### 裁定344 追補1（2026-10-14 確定・相談役・便 V1014 V-3）mailto 仮・初期選択は mount 後に window.location

**本文（逐語）**: 「344 追補1（mailto 仮・初期選択は mount 後に window.location）」＝便 N1013b の仮決め L-2（LP_CONTACT_MAILTO＝mailto:info@agoora.co.jp は仮・Agoora 記入で差替え）と fix 2f4e9a3（force-static では useSearchParams が空＝DemoEntry は mount 後に window.location.search を読む・SSR は初期選択なし）を追認。L-1（noindex のまま）・L-3〜L-7 も同じ扱い。

## 裁定347（提案中・2026-10-13・便 N1013b B-7＝読取と 0171 起草のみ）プラン既定の目標（4 軸）

読取＝comp_plans にプラン既定の目標の器なし（列は slide_* まで・cast_norms はキャスト別のみ）。起草＝supabase/migrations/0171_plan_norm_targets_axes.sql（生成器 docs/tmp/gen_0171.mjs・写経元 live set_comp_plan 1cddaa0e・sha256 cf0b8a6313a8ffb7cf1242023fa6d50094033d7745e0be7db42e83dd32b56c97・19,486 B・226 行・手順 docs/demo/handpaste_0171.md）＝comp_plans 4 列（norm_days／dohan／sales／shimei_target・null＝継承なし）＋set_comp_plan 29 引数（default null＝既存は挙動不変）＋**GV-2 のノルマ採用軸 set_store_norm_axes（settings_json.norm_axes・4 キー boolean・欠損＝ON）**を同乗。**適用しない**＝相談役が 347 と GV-2 を裁いてから Agoora 手貼り→client（継承・上書き印・「プランの既定に戻す」・表の薄濃・OFF 軸の非表示・suite norm-axes）。

### 裁定347 追補1（2026-10-14 確定・相談役・便 V1014 V-3）N1013b の B-6／B-7 仮決めを追認

**本文（逐語）**: 「347 追補1（N1013b の B-6／B-7 仮決め追認）」＝仮決め N-1（ノルマの採用軸は settings_json の既存キーで持てない→0171 に専用 RPC set_store_norm_axes・set_store_profile の白名単は触らない）・N-2（0171＝comp_plans 4 列＋set_comp_plan 29 引数＋set_store_norm_axes・生成器 docs/tmp/gen_0171.mjs）・N-3（client と suite norm-axes は 0171 適用後）を追認。**便 V1014 V-2 で 0171 を再起草**＝起票112 の get_cast_sales_rank を同乗（sha256 fb8b168bad748be5df07b8ccaf7b32b47167c98a668dc0830499fbeabb656b51・22,870 B・268 行・関数見込み 308・'billing locked' 158・set_comp_plan md5 pin 候補 1cddaa0e→4fa34575・手順 docs/demo/handpaste_0171.md）。適用は Agoora 手貼り（相談役が 347 と GV-2 を裁いた後）。

### 裁定347 追補2（2026-10-14・便 P171・実装仮決め＝相談役が追認／差替え）

適用＝便 P171（client のみ・0171 適用後）: lib/nox/store/norm-axes.ts（normAxesOf＝欠損 ON・quotaKeysOfAxes・planDefaultQuotaOf＝shimei は指名のカウントで hon へ・resolveQuotaOf＝個別＞既定＞なし・resolveNormTargetsOf＝cast_norms の 0＝継承）・plan-editor 節⑥「ノルマ（プラン既定の目標）」（set_comp_plan 29 引数・空＝null・OFF 軸は入力口なし）・casts-board「今月のノルマ」（placeholder に既定・印「個別」・「プランの既定に戻す」＝set_cast_quota 4 引数 null・採用軸だけ）・comp-sections「キャスト別ノルマ目標」（採用軸の列・継承＝薄・上書き＝濃・一括は上書き）・norm-config-panel（4 軸＝set_store_norm_axes→旧 2 キーを同期して set_store_norm_config）・/api/mine/norm-progress（admin で現在の cast_plan→comp_plans.norm_*・店設定で解決・source を返す）・/mine/ranking（get_cast_sales_rank の自分の行＝「売上の順位: N位 / M人中」＝346 追補1）・デモ（プラン既定＝基本 12／4／500,000／20・優遇 16／6／800,000／30・体験入店は空・個別上書きは代表キャスト 1 名）。仮決め一覧＝docs/tmp/p171_decisions.md（C-1〜C-5・A-1／A-2・R-1／R-2・D-1〜D-3）。★2 表（cast_quotas／cast_norms）は統合しない（統合は第 2 期＝起票114）。**修正 2 点（相談役 2026-10-14・便 N1014 A-4）**＝① /mine の進捗カードは採用軸すべて（days を含む＝cast_norms の days_target を個別＞プラン既定＞なしで解決・実績＝自分の in 打刻の営業日数）・② 達成ボーナスの目標（collect）は /mine と同じ純関数で解決し、core はプラン既定から継承したときだけ凍結形に normTarget{source:"plan"} を出す（明細「達成ボーナス（目標 ¥X＝プランの既定）」・既存 21 プランは既定 null＝従来どおり cast_norms・凍結形 1 バイト同値）。suite norm-axes 28・payroll 段N1014-1。

## 裁定343（2026-10-13 確定・相談役・便 W5-2b 再開ブロック）待遇プランの判定基準と対象はプランの属性（comp_plans.slide_basis／slide_rank_ids・0170）

出典＝相談役ブロック 2026-10-13（便 W5-2b 再開＝「B-4 用の逐語」・便 W5-2a では【相談役記入】の仮置き）。**本文（逐語）**:
「待遇プランの判定基準と対象はプランの属性として持つ。comp_plans.slide_basis は sales／hon_count／dohan_count の 3 値・既定 sales、comp_plans.slide_rank_ids は空＝全員。338 の判定期間（月次／半月／日次）とは直交。set_comp_plan は 25 引数・既存呼び出しは既定で挙動不変。個人上書き（overrides_json）には持たない」。

**0172 の欄（本番適用済み・起草＝便 GV-B W-11（2026-10-15）・収蔵＝便 P172・2026-10-16）**: supabase/migrations/0172_settlement_terms_staff.sql＝生成器 docs/tmp/gen_0172.mjs（写経元＝docs/tmp/0172_live.json＝2026-10-14 読取）。sha256 **cea1f38458e899813b8a759be5374b6b00cf5f76d6a7d99b908091bf9252b40a**・77,638 B・922 行（台帳方式）／921（wc -l）・LF。本番適用＝Agoora 手貼り **2026-10-16 10:25 JST**（検証 12 項目すべて期待値＝相談役ブロック P172 の前提）→live 照合（docs/tmp/q1016_p172_q0.mjs・便 P172 Q-0・SELECT のみ）**全点一致**＝関数 **311**（+3＝set_cast_dependents_form／terms_accept／terms_accepted_version_ok）・表 **87**（+4＝terms_acceptances／staff_contracts／staff_punches／staff_payroll_runs＝RLS 有効・authenticated=SELECT のみ・policy 1 本ずつ）・'billing locked' **159**（+1）・md5 5 本（prosrc）＝daily_pay_issue 94f989f9／daily_pays_of_run 37ff6ed0／set_store_profile 67e96c04／staff_create 8c2fef04／staff_update_profile b710ebae（pg_get_functiondef の md5＝858d973c／41e2a227／f75635ee／429489d2／cc544dc7＝参考）・列 5（daily_pays.kind 既定 'settlement'（既存 4 行＝settlement）／cast_tax_profiles.dependents_form・_on／memberships.tel・line_id）・proacl 7 本＝authenticated＋service_role（anon なし）。pin 張替え（便 P172）＝0158 s-2／t-1（関数 308→311・表 83→87・md5 3 本）・billing 段47-1（対象 158→159・除外 150→152・gated 159・述語参照 160・形 159）・grants TABLES +4・課金ゲート名簿（A10 +set_cast_dependents_form・B(f) +terms_accepted_version_ok・B(m) +terms_accept・mig0172 追随）・新 suite verify:nox-p172（f0 121 段目）。

**0173 の欄（本番適用済み＝2026-10-16 15:27 頃 JST Agoora 手貼り（申告）・便 VQ の live 照合で確認・起草＝便 M173 M-1・2026-10-16）**: supabase/migrations/0173_register_payment.sql＝生成器 docs/tmp/gen_0173.mjs（写経元＝docs/tmp/0173_live.json＝2026-10-16 読取・live 23 関数の md5（\r 込み）pin 一致で生成）。sha256 7b116cea9ca08a5e3f88a6e6f9b66a47693eae2056c464298a0cfd969f09faef（196,017 B・2781 行・LF）。中身＝★1 385（pricing_rules.is_default_ext＋部分ユニーク・set_pricing_rule 17 引数（新規 extension は 1 店 3 本まで）・pricing_resolve_core／check_open 既定優先・check_set_ext_rule 新設）★2 386（店設定 join_mode・checks.set_frozen・check_set_people 合流セット行・check_time_charge_apply 凍結不触）★3 389（店設定 cast_register_device・report_can_close／daily_report_close の cast 枝・daily_report_reclose／cash_diff_approve は cast 拒否・daily_reports select の cast 枝・checks.opened_by_membership／payments.by_membership／daily_reports.closed_by_membership・kiosk_login／kiosk_operator_list／staff_pin_status／set_staff_pin の候補に cast）★4 391（daily_report_aggregate +set_ext_nom／products・daily_reports +2 列）★5 392（bottle_keeps 'pending'・bottle_keep_register 10 引数・check_line_set_customer 3 引数・check_close／check_void・customer_summary +pending_bottles）★6 393（店設定 pay_fee_rates・fee_kind 'pay_fee'・check_pay 8 引数・check_group_due 3 引数・daily_report_aggregate +pay_fee_total・cast_sales_aggregate 除外）★7 396（店設定 trial_guarantee_days／default_plan_id）。適用後の見込み＝関数 311→**312**・表 87・'billing locked' 159→**160**・md5 pin **24 本**（新設 1）＝check_group_due 5c667792・pricing_resolve_core 4779acc3・set_pricing_rule d41e22d9・check_open 82dfd091・check_time_charge_apply 8305089f・check_set_people 1f6b9fd8・set_store_profile 45012c75・report_can_close 12b4ad7a・daily_report_reclose a140f36c・cash_diff_approve 12810b5f・daily_report_close f599bd09・kiosk_login 90ab95a4・kiosk_operator_list e9c868bf・staff_pin_status c70866bf・set_staff_pin bda3b520・daily_report_aggregate ca2dd22d・bottle_keep_register 6cce7d77・check_line_set_customer 644cd7ba・check_close f94dc8c3・check_void 4eb77409・customer_summary c83aa2af・check_pay c11691b8・cast_sales_aggregate 34a0bf1e・check_set_ext_rule 02b145a6。検証クエリ 13 本（末尾 ===== verify =====）。手貼り案内＝docs/demo/handpaste_0173.md。**0174 より先に貼る。**
**0174 の欄（本番適用済み＝2026-10-16 15:30 頃 JST Agoora 手貼り（申告）・便 VQ の live 照合で確認・起草＝便 M173 M-2・2026-10-16）**: supabase/migrations/0174_comp_norm_staff.sql＝生成器 docs/tmp/gen_0174.mjs（写経元＝同上・4 関数の pin 一致で生成）。sha256 8c2df449a1648f22b5a060f75931fd300e102bac796153abe02421ada9b9f009（45,628 B・613 行・LF）。中身＝★1 390（comp_plan_slide_check 上限 3→10）★2 110（comp_plan_components.params.thresholds の各要素に amount＝移行 SQL・live 2 行）★3 394（penalty_config +5 列・set_penalty_config 17 引数＝新 5 引数は既定あり）★4 395（comp_plans.slide_apply null・set_comp_plan 30 引数）★5 kiosk_staff_list()／staff_punch(p_membership_id, p_pin, p_kind) 新設（P172 Q-4 の積み残し）★6 demo_org_reset の c_wipe／c_load +4 表（P172 Q-8 の積み残し）。適用後の見込み＝関数 312→**314**・表 87・'billing locked' **160**・md5 pin **6 本**（新設 2）＝comp_plan_slide_check 8aedb6d7・set_penalty_config d6c05607・set_comp_plan 21afb3f5・demo_org_reset 3cdf7a30・kiosk_staff_list 53e9d7a7・staff_punch 250c61b0。検証クエリ 11 本。手貼り案内＝docs/demo/handpaste_0174.md。**0173 の後に貼る**（0173 が set_store_profile を改稿するため 396 の店設定 2 キーは 0173 に同乗）。
**0171 の欄（本番適用済み・起草＝便 N1013b／再起草＝便 V1014・収蔵＝便 DM-1（pin）／便 P171（client）・2026-10-14）**: supabase/migrations/0171_plan_norm_targets_axes.sql＝生成器 docs/tmp/gen_0171.mjs（写経元＝live pg_get_functiondef＝set_comp_plan 1cddaa0e・2026-10-13 読取・★以外 1 バイト不変）。sha256 **fb8b168bad748be5df07b8ccaf7b32b47167c98a668dc0830499fbeabb656b51**・22,870 B・268 行（台帳方式）／267（wc -l）・LF。本番適用＝Agoora 手貼り 2026-10-14（**時刻不明**・Success 表示のみ＝便 N1014 で「10/14・不明」として確定）→live 照合（docs/tmp/q1014_p171_q0.mjs・便 P171 Q-0）**全点一致**＝関数 **308**（+2＝set_store_norm_axes／get_cast_sales_rank）・'billing locked' **158**（+1）・set_comp_plan 29 引数 md5 **4fa34575**・comp_plans の既定目標 4 列（norm_days／dohan／sales／shimei_target integer null）・新 RPC 2 本の proacl＝authenticated（＋service_role＝Supabase 既定）。pin 張替え（便 DM-1 の f0 で収蔵）＝0158 s-2h（md5）／s-2i（列 28→32）／s-3・t-1（関数 306→308）・billing 段47-1（対象 157→158・除外 149→150・gated 158・述語参照 159・形 158）・課金ゲート名簿（A8 +set_store_norm_axes・B(f) +get_cast_sales_rank・mig0171 追随）。

**0170 の欄（本番適用済み・起草＝便 W5-2a・収蔵＝便 W5-2b・2026-10-13）**: supabase/migrations/0170_comp_plan_slide_basis.sql＝生成器 docs/tmp/gen_0170.mjs（写経元＝live pg_get_functiondef＝set_comp_plan 3ebd1624・2026-10-13 読取・★以外 1 バイト不変）。sha256 **f854521f7899fc6151469d69208bac1eb87348989202992b63d6d98fcc6886bb**・17,200 B・192 行（台帳方式）／191（wc -l）・LF・突合 docs/tmp/q1013_ag_0170.mjs **12 段 NG 0**（BEGIN…ROLLBACK＝列 2 本 NOT NULL 既定 'sales'／'{}'・CHECK 3 値・既存 21 行は sales・全員・set_comp_plan 1 本 25 引数・新 md5 **1cddaa0e**・ACL secdef authenticated＋service_role・ゲート行あり・関数 306／表 83／'billing locked' 157 不変・auth なし forbidden・23 引数呼出も default で解決・rollback 後 306／3ebd1624／列 0）。中身＝★1 comp_plans.slide_basis text not null default 'sales'＋CHECK（sales／hon_count／dohan_count）・slide_rank_ids uuid[] not null default '{}' ★2 set_comp_plan 25 引数（末尾 p_slide_basis default 'sales'・p_slide_rank_ids default '{}'・NULL は 'bad slide_basis'／'bad slide_rank_ids'・rank id は自店の有効な cast_ranks・重複拒否・insert／update に 2 列・23 引数版 drop）★3 grants。関数数見込み 306→306（置換）・名簿不変（A7・改稿のみ）。md5 pin 候補＝set_comp_plan 3ebd1624→1cddaa0e（手貼り後に live で確定）。手貼り案内 docs/demo/handpaste_0170.md（0169 の後・末尾に恒久注意28 の定型 1 文）。デモ＝gen-demo の comp_plans 行に slide_basis 'sales'・slide_rank_ids [] を先行投入（payload 6 本再生成・0170 適用後の 06:05 reset を壊さない）。

**0170 適用（本番・収蔵＝便 W5-2b・2026-10-13）**: 手貼り＝Agoora 2026-10-13（時刻不明・Success 表示のみ・検証クエリの返り値は未提示）。★1 回目の申告（便 W5-2b の初回ブロック）は B-0 の live 照合で **未適用**（md5 3ebd1624・23 引数・列 0・CHECK なし）→停止報告→再手貼り→再開ブロックの B-0 で 4 点一致（恒久注意28 の 2 例目）。live proof（docs/tmp/q1013_b0_0170.mjs）＝set_comp_plan md5 **1cddaa0e**・25 引数（末尾 p_slide_basis text, p_slide_rank_ids uuid[]）／comp_plans.slide_basis text NOT NULL default 'sales'・slide_rank_ids uuid[] NOT NULL default '{}'／CHECK（sales／hon_count／dohan_count）／既存 21 行＝sales・全員（読み替えなし）／関数 306／表 83／'billing locked' 157（不変）。sha256 f854521f…86bb 不変。名簿＝不変（改稿のみ・A7）。pin 張替え＝0158 s-2h（set_comp_plan 1cddaa0e）・s-2i（comp_plans 28 列）＝挙動で張る。

### 裁定343 追補1（2026-10-13・CC 仮決め・便 W5-2a／W5-2b・相談役の追認待ち）W5-2a の仮決め 24 点と W5-2b の仮決め

出典＝docs/tmp/w52a_decisions.md（A1 9／A2 4／A3 3／A4 4／A5 4＝24 点）と docs/tmp/w52b_decisions.md（L 7／U 4／R 7／D 2）。要点（逐語は両ファイル）:
- W5-2a: 純関数 lib/nox/store/ops-profile.ts／店舗情報タブに「会計と運用」（owner のみ・差分 patch・先回り検査）／締め日は欄なし（月末固定）・支払日だけ／内税表示も保存 UI（表示だけの注記）／ウィザード STEP 5 に同 7 項目（SETUP_HIDDEN_ITEMS は C 0）／331 ⑱＝行チェック（既定全選択）＋名前・価格 inline・productsEff を bulk／上書き／件数の 3 か所へ／フロア＝lib/nox/floor-kinds（register は席タイルを店ごとに絞る・seats-board は選択肢から外し既存行は残す・kiosk 不触）／0170 の rank id 検証（NULL・重複・他店・停止中は拒否）・gen-demo 先行投入／裁定343 の逐語は W5-2b で差替え／起票102＝卓で束ねる／handpaste_template.md 新設／pin 張替え（payroll-view pv(7-5)・master-top mt(7-2)(7-3)・setup su(1-5)(5-2)）。
- W5-2b（lib）: 件数基準の判定値＝get_cast_sales の hon／dohan（伝票単位）・monthly／half は期間累計の sales 枠に件数・daily は営業日ごと（slideDailyBasis・pts は pay.ts の dayPts と同じ式・明細は 1 行に畳む）／ポイントスライドは pts のまま／'next' と件数が重なる店は件数優先（該当店なし）／対象外＝プランの段を空にした plan（planEff）で base・売上・ポイント両方を外す／ランクは casts.rank_id の現在値／凍結形に basis・scope（sales・全員は従来形＝既存 payslip 同値）。
- W5-2b（UI）: plan-editor 節④＝基準 select＋対象ランクのチェック群（cast_ranks・無ければ「ランク未登録＝全員」）＋印／件数基準は見出し・単位（件）・説明文を切替／一覧と明細に印／既存プランは印なし。
- W5-2b（読取側）: レジ入金ボタン＝現金（常に）／カード／売掛／電子マネー／QR 決済／その他（電子マネー・QR は 'other'＋固定 detail・OFF の方法は現金へ戻す）／内税表示＝レジ支払方法と給与の期ヘッダーに印（金額の再計算はしない）／/mine＝punch_methods.self OFF で本人打刻を出さず案内文／代行＝proxy OFF で退勤ボタンと区分後の in 打刻を出さない／kiosk＝不触（器なし・裁定要）／締め日・支払日＝給与の期ヘッダーと月報の見出しに注記。
- デモ: NOIR のプラン 3 本＝hon_count（月次 3／6／10 件→4,000／4,500／5,000） ★D-3＝デモ reset の uuid[] 写像の修正（seed.ts・w52b_decisions.md）。・対象ランク S／A（default の りな・みお・こころ は対象外＝base）。★X-13 で目視 OK 済みの NOIR 9 月明細（りな 172pt→4,500 等）は対象外へ変わる＝追認待ち。

## 裁定342（2026-10-13 確定・相談役・v45 §3）未来日の確定シフトは日数・当欠・シフト基準の時給に数えない（起票101 の解決・P169 同乗）

出典＝相談役引き継ぎ v45 §3（docs/handoff/NOX_相談役引き継ぎ_2026-10-13_v45.md・「新チャットで台帳に記す・本書で確定」＝便 V45 V-1 で記入・2026-10-13）。**本文（逐語）**:
「裁定342（起票101 の解決）＝未来日（今日より後）の確定シフトは、日数・当欠（absentN）・シフト基準の時給（pay_time_basis 'shift'）のいずれにも数えない。判定は営業日の終了時点まで。プレビューの「当欠 N」は今日までの分だけ。実装は client（collect／anomaly と同経路）・RPC 不変の見込み・P169 に同乗。デモ MUSE（未来 21）・本番 CLUB NOX（未来 57）で before／after を報告。起票101 クローズ・次＝102。」

実装便＝P169（0169 収蔵・X-13-29 と同じ便）。器＝lib（matchPunches の days／absentN・shiftHoursByDate を営業日の今日までに絞る＝X-13-27 anomalyFlagsOf と同経路・collect.ts）・RPC 不変の見込み・mig なし。検証＝デモ MUSE 2026-10（未来日の確定シフト 21・5 名・126 h）／本番 CLUB NOX 2026-10（57・6 名・240 h）の before／after（件数の出典＝起票101・docs/tmp/q1009_p167.mjs）。適用＝未（本便は記入のみ・DB 恒久変更 0）。起票101＝本裁定でクローズ（起票欄に注記）・次＝起票102・次の裁定番号は 343。

**適用（lib）＝便 P169（2026-10-13）**: lib/nox/payroll/anomaly.ts に純関数 2 本（punchCountsUpToOf＝days／lateN／absentN を営業日の今日まで・shiftHoursUpToOf＝'shift' 基準の時給の母数を今日まで）。collect.ts の loadPunch が todayBiz（店の cutoff）で呼ぶ（旧 m.absentN／m.lateN の直渡しを撤去・matchPunches は不変）。受給者判定は不変（342 追補1）。attendanceDays／shortfallDays／hoursByDate は不変（仮決め B-4）。RPC 不変・mig なし。**実測（2026-10 プレビュー相当＝lib loadPunch を admin で計測・docs/tmp/q1013_342_measure.mts・before→after）**: デモ MUSE＝当欠 **21→0**・日数 4→4・不整合 4→4・確定シフト時間 150 h→24 h（未来 21 日 126 h を除外）／本番 CLUB NOX＝当欠 **80→33**・日数 2→2・不整合 36→36・343 h→147 h（未来 47 日 196 h を除外・10/9 の 57 から日が進んだ分）。両店 pay_time_basis 'punch'。live（本番 route の /api/payroll/preview・MUSE owner）の当欠は便 P169 の報告に記載。仮決め一覧＝docs/tmp/p169_decisions.md §B。

### 裁定342 追補1（2026-10-13 確定・相談役・便 SX-1）受給者判定は 342 の対象外

出典＝相談役ブロック 2026-10-13（便 SX-1）。**本文（逐語）**: 「受給者判定（run に載せる対象）は 342 の対象外＝未来日のみの確定シフトでも run に載せる・金額は 0。P169 仮決め B-3 の取り消しを追認」。次＝追補 2。
経緯＝便 P169 の仮決め B-3（出勤インセンティブの受給者判定も今日まで）で f0 run1 が payroll suite F2c-3（未来月 2026-11 の fixture に打刻を置く）で赤→取り消して再走（collect.ts の受給者判定は final ok／late のまま・days／lateN／absentN／shiftHoursByDate だけ今日まで）。docs/tmp/p169_decisions.md B-3。

### 裁定328 追補9（2026-10-13 確定・相談役・便 LP-R）デモ NOIR＝本指名件数スライド・対象ランク S／A（便 W5-2b D-1 の追認）

出典＝相談役ブロック 2026-10-13（便 LP-R L-3「328 追補9（D-1＝NOIR 本指名件数・対象 S／A）」）。**本文（逐語）**: 「328 追補9（D-1＝NOIR 本指名件数・対象 S／A）」。
内容＝デモ CLUB NOIR のプラン 3 本（Standard／Premium／新人保証）を slide_basis 'hon_count'・売上スライド＝本指名 3／6／10 件→4,000／4,500／5,000（月次）・slide_rank_ids＝ランク S／A（標準（default）の りな・みお・こころ は対象外＝基本率）。ポイントスライド（60／120／200pt）は従来どおり。profiles.mjs SLIDES.noir・gen-demo＝SL.basis／SL.ranks（cast_ranks の uid）・seed.ts の uuid[] 写像（fix 9fad6ee）。X-13 で目視 OK 済みの NOIR 9 月明細（りな 172pt→4,500 等）は対象外に変わる＝本追補で追認。live（2026-10-13 17:2x JST・fix 後の reset）＝あべ 53 件→5,000（S）・えれな 46・さくら 42・ゆい 31・まりあ 21→5,000（pt 109→4,000）・りな／みお／こころ＝対象外。★台帳に「328 追補8」の見出しは無い（v44／v45 は「328 追補8＝X-13c 仮決め 13 点追認」と記すが台帳には未収載＝docs/demo/store_profiles_20261009.md §3 が実体）。

## 裁定341（2026-10-09 確定・相談役・無人便 P168 P-5）レジ＝場内→本指名の切替は非遡及が既定（既出のドリンクは注文時点の率）・「既出も本指名の率にする」チェック（店長以上・既定オフ）

出典＝相談役ブロック 2026-10-09（無人便 P168 P-5）。**本文（逐語）**:
「裁定341（レジ・場内→本指名の切替）: 読取＝現状の切替処理が既出のキャストドリンク行の指名区分／バック率を触るか（RPC 名・行番号）。実装＝非遡及が既定（既出行は注文時点の率のまま）。切替ダイアログに「この伝票の既出ドリンクも本指名の率にする」チェック（既定オフ・店長以上）＝オンなら当日未確定伝票の該当行の区分を本指名に書き換え、監査ログ「指名切替に伴う率変更」。RPC 変更が要るなら 0169 として起草のみ（適用しない）・client 側はチェックを無効表示で先に置く。」

読取（2026-10-09・便 P168）: 切替＝register-board の指名種別セグメント（本／場内／フリー）→ autoSaveNoms → RPC check_set_nominations(p_check_id, p_nominations)（live md5 1dbd13ca・0124 判断C＝指名料の明細行を付け替えるだけ）。ドリンクの区分別バック（unit4 のキー・pt）は **会計時 check_close（live 3f4e73b5）が check_nominations の現在の nom_kind で全行を計算**（v_kinds[i]・nom_unit4_key／pt）＝現状は**遡及**（切替前に出た行も本指名の率）。行に区分のスナップショットは無い（check_lines に nom 系の列なし）。
適用＝RPC 変更が要る→ **0169 起草のみ**（下の欄）。client（便 P168）＝指名種別が場内のとき、店長以上に無効チェック「この伝票の既出ドリンクも本指名の率にする（準備中）」を表示（0169 適用後の便 P169 で切替ダイアログ＋check_nomination_rate_apply に結線）。suite 338 r341(1-1)。

**0169 の欄（本番適用済み・起草＝便 P168・収蔵＝便 P169・2026-10-13）**: supabase/migrations/0169_nomination_rate_nonretro.sql＝生成器 scratchpad/gen_0169.py（写経元＝live pg_get_functiondef＝check_set_nominations 1dbd13ca／check_close 3f4e73b5・★以外 1 バイト不変）。sha256 82ed5269116edc3a4bb7124432dd177aeacf5ca3f9a953a384806e17001906e6・35,895 B・528 行（台帳方式）／527（wc -l）・LF・突合 docs/tmp/q1009_ag_0169.mjs 15 段 NG 0（文単位 11 文・新 md5 check_set_nominations 1dbd13ca→97dd24bb／check_close 3f4e73b5→69cf2a19／check_nomination_rate_apply 84f6f80e・関数 306／表 83／'billing locked' 157・改稿 2 本の ACL 不変・manager の check_open→場内→本指名で prev_kind 'jonai'＋kind_changed_at・同伴 ON では引継ぎ・apply で消える＋audit note・cast forbidden・rollback 後 305／0／1dbd13ca／3f4e73b5）。中身＝★1 check_nominations.prev_kind text null＋kind_changed_at timestamptz null（CHECK prev_kind in hon／jonai／free）★2 check_set_nominations 改稿（旧行の切替記録を退避・引継ぎ・場内→本指名の遷移で prev_kind='jonai'／kind_changed_at=now()・監査 before/after に 2 キー）★3 check_close 改稿（行の created_at < kind_changed_at なら旧区分で unit4 キーと pt＝v_k・plan_rate／plan_fixed の母数は不変）★4 新規 RPC check_nomination_rate_apply(p_check_id, p_cast_id)（店長以上・課金ゲート・open のみ・記録を消す・audit note「指名切替に伴う率変更」・記録なしは no-op）★5 grants。名簿＝A1 +1（306・'billing locked' 157）。手貼り案内 docs/demo/handpaste_0169.md（0168 の後）。

**0169 適用（本番・収蔵＝便 P169・2026-10-13）**: 手貼り＝Agoora 2026-10-13 **11:34 JST**（Success）。★1 回目（10/13 午前・「Success 確認済み」の申告）は P-0 の live 照合で **未適用**（関数 305・列 0・新 RPC なし・md5 旧値）→停止報告→再手貼り 11:34→P-0 再照合で 5 点一致（恒久注意28 の実例）。live proof（docs/tmp/q1013_p0_0169c.mjs）＝関数 **306**／表 83／check_set_nominations md5 **97dd24bb**／check_close **69cf2a19**／check_nomination_rate_apply **84f6f80e**（ACL＝authenticated=X・anon なし）／check_nominations.prev_kind・kind_changed_at 2 列／'billing locked' **157**。sha256 82ed5269…06e6 不変。名簿＝A1 +1（check_nomination_rate_apply）＝対象 **157**／除外 149／全数 **306**（docs/NOX_課金ゲート対象_v1.md mig0169 追随）。pin 張替え＝billing 段47-1（157／158／157）・anon-guard（probe +1＋authenticated(cast) +1＝1059→1061）・grants（公開 +1＝485→487）・0158（s-2e／s-2f／s-2g md5 3 本＋s-3／t-1 関数 306＝54→57）・338 r341(1-1)（挙動 pin へ張替え＝教訓108）。

### 裁定341 追補1（2026-10-13 確定・相談役追認・v45 §3）便 P168 の仮決め ⑥⑦⑧ と P167／P168 の pin 張替え一覧の追認

出典＝相談役引き継ぎ v45 §3（便 V45 V-1 で記入・2026-10-13）。**本文（逐語）**: 「⑥⑦⑧（チェックは無効表示で先置き／audit after に kind_switch／ACL 不変）→341 追補1。P167／P168 の pin 張替え一覧も同追補で追認。」
内容＝⑥ client（便 P168）は指名種別が場内のとき、店長以上に無効チェック「この伝票の既出ドリンクも本指名の率にする（準備中）」を先置き（結線は P169＝X-13-29）。⑦ 0169 の check_set_nominations は切替記録（prev_kind／kind_changed_at）を監査の after に kind_switch として残す。⑧ 改稿 2 本（check_set_nominations／check_close）の ACL は不変・新 RPC check_nomination_rate_apply は店長以上＋課金ゲート（名簿 A1 +1＝306・gated 157）。**pin 張替え一覧（P167／P168）の追認**＝billing 段47-1（156／157／156）・anon-guard（0167 probe＋authenticated(cast) 不可）・grants（公開 +1）・0158（s-2d ee7f7243・関数 305 ×2）・m4 wm(2-5)(2-6)＋wm(4-1)（layout＝解決値）・demo-profiles dpf(2-6)・dpf(1-3)（売上スライド 2・ポイントスライド 1）・337 c337(4-1)（SLIDES）・x13 quota-table-3（PeriodSelect）。

### 裁定341 追補2（2026-10-13・CC 仮決め・便 P169＝X-13-29 の結線・相談役の追認待ち）

出典＝便 P169 の仮決め一覧（docs/tmp/p169_decisions.md §A）。実装＝app/(manage)/register/register-board.tsx（client のみ・RPC／mig 不変）。**仮決め（7 点）**:
A-1 場内→本指名の切替は店長以上にだけ切替ダイアログ（nox-inset・「本指名に切り替える」／「やめる」）。staff は従来どおり即保存（ダイアログもチェックも出ない＝RPC が店長以上）。
A-2 ダイアログのチェックは既定オフ。確定＝check_set_nominations（名簿保存）→保存成功のときだけ check_nomination_rate_apply。
A-3 切替記録（kind_changed_at）が残る本指名キャストには行の下に常設のチェック「この伝票の既出ドリンクも本指名の率にする（切替前の N 行は場内の率）」（店長以上・open のみ・オンで即 RPC・N＝created_at < kind_changed_at のドリンク／シャンパン／ボトル行＝check_close と同じ判定）。
A-4 行の区分表示＝切替前の行にタグ「{キャスト} 場内の率（切替前）」。apply で記録が消えるとタグも消える（行の select に created_at・名簿の select に prev_kind／kind_changed_at を追加＝表示のみ）。
A-5 RPC 失敗は和訳して赤（forbidden／billing locked／not open／not found）・成功文言「…本指名の率にしました（監査: 指名切替に伴う率変更）」。
A-6 P168 の無効チェック「（準備中）」は撤去（文字列 0）。338 suite の r341(1-1) は挙動 pin に張替え。
A-7 kiosk-register は触らない（店長以上の操作がない）。
suite＝新規 verify:nox-341 21（f0 101 段目＝f342 4／r341 client 4／r341 DB 13: 切替記録・切替前 300＋後 400＝700（チェックオフ）・staff／cast forbidden・manager apply で記録消去＋audit note 1 行＋close 800・記録なしは no-op・close 後は 'not open'）。

## 裁定340（2026-10-09 確定・相談役・便 X-13d-2a A-1）X-13-24＝支払記録の導線（行の「未払」→ダイアログ／内訳の「支払を記録」／未払の全員を一括記録・client のみ）

出典＝相談役ブロック 2026-10-09（無人便 X-13d-2a A-1・便 X-13-24〜27 読取で「client のみで可・一括 RPC 不要」と判定）。**本文（逐語）**:
「裁定340（X-13-24・client のみ）: ①給与一覧の行の「未払」クリック→支払ダイアログ（支払日＝今日・方法 現金／振込／その他・金額＝差引支給額既定・部分支払可・メモ）→既存の支払記録 RPC を呼ぶ→「支払済」に。②内訳パネルの手取りの下に「支払を記録」（同じダイアログ）。③未払カードに「未払の全員を一括記録」＝方法と日付を 1 回選ぶ→確認ダイアログ→既存 RPC を 1 人ずつ順に呼ぶ（新規 RPC は作らない・部分失敗は赤で残す・裁定333 と同じ流儀）。「支払状況を表示」は残す。案内文「次: 下の『支払・明細』で支払いを記録」→「行の『未払』を押して支払を記録」。suite＝ダイアログ経由で 1 件記録→状態「支払済」→未払合計が減る（デモ MUSE）。」

適用＝便 X-13d-2a（2026-10-09・client のみ・DB 恒久変更 0）: lib/nox/payroll/pay-record.ts（純関数＝既定値 remainingOf／payDialogDefaultsOf・検証 payDialogErrorOf（RPC と同じ輪郭＝正の整数・残額以内・日付・メモ 200）・一括計画 bulkPlanOf（残額 > 0 だけ）・applyPaidOf／unpaidTotalOf・結果文 bulkSummaryOf）＋payroll-board.tsx の PayDialog／BulkPayDialog（Modal・PAYMENT_METHODS・MoneyInput）。①状態列の「未払」「一部」は確定済み run だけ button（支払済／未確定は文字のまま）②内訳パネルの手取りの右に「支払を記録」（確定済み∧残額 > 0）③未払カードに「未払の全員を一括記録」（確定済み∧未払 > 0）＝方法・日付・メモを 1 回→確認（人数・合計・一覧）→1 人ずつ /api/payment/record（payment_record_add・冪等キーは人ごと）→失敗した人は赤で残し成功分はそのまま（続行・全取消なし）。成功後は loadRun（payment_records／payslips の再読込＝支払状態と未支払 KPI）。「支払状況を表示」（PaymentPanel）は残す。★仮決め: suite はデモ MUSE に書かない（デモ org を支払済みで汚さない＝純関数で「1 件記録→残額 0→未払合計が減る」を係留・x13d2 pay(1-4)）／一括は部分失敗でも続行（333 の「失敗した日は赤で残し成功分はそのまま」の読み）／金額の既定＝残額（部分払い後は残り）。

### 裁定340 追補1（2026-10-09 確定・相談役追認・便 X-13d-2b）便 X-13d-2a の仮決めの追認

出典＝相談役ブロック 2026-10-09（便 P167＋X-13d-2b B-3）。**本文（逐語）**: 「340 追補1（d-2a ⑩⑪⑬⑭⑮ 追認・2026-10-09）」。
仮決め ⑩suite はデモ MUSE に支払を書かない ⑪一括は部分失敗でも続行し赤で残す ⑬デモ前借り＝MUSE 50,000・他 30,000・代表キャスト・先月 15 日 ⑭docs/handoff/sql は無いため 0167 も supabase/migrations＋docs/demo ⑮0167 の setter は set_cast_shift_request_mode（null＝店の既定）＝追認。⑫（未来日の除外は不整合と退勤なしだけ）は起票101 で裁く。適用＝変更なし。

## 裁定339（2026-10-09 確定・相談役・便 X-13d-1 D-0）X-13-23＝待遇プラン一覧の読取修正（from に列名が混入・error を握りつぶさない）

出典＝相談役ブロック 2026-10-09（便 X-13d-1 D-0・便 X-13-23 読取の報告を受けて確定）。**本文（逐語）**:
「comp-sections.tsx の useCompData.load の一覧読取を from("comp_plans").select("*") に修正。同 hook の全読取で error を握りつぶさない＝error 時は setMsg 赤帯（rpc-err の和文）・plans は直前値を保持（[] に落とさない）。suite に「待遇プラン一覧読取＝PostgREST 200・行数≧1（CLUB NOX・デモ MUSE）」を追加。plan-board の select に既存 4 プラン＋新規が出ることを本番で確認（読取のみ・無効化は Agoora が画面で行う）。」

背景（便 X-13-23 読取・2026-10-09）: CLUB NOX で「あああ」（base 2,000）は 15:40:39 JST に INSERT 済み（audit set_comp_plan あり）なのに一覧にも編集中にも出なかった。原因＝0153 client 便（19aba5d・2026-09-28）で comp-sections.tsx:196 の from が `"comp_plans, product_back_fixed_hon, product_back_fixed_jonai, product_back_fixed_free"` になり、PostgREST が PGRST205（404「Could not find the table」）→ error を捨てて plans=[]（9/28 以降・全店・デモ 6 店も）。保存後の setSelId(newId) は plans に無いため draft が BLANK に戻る＝「入力が空に戻る」症状。RPC（set_comp_plan 0153・md5 3fdd6e81）は正常。

適用＝便 X-13d-1（2026-10-09・本便のコミット（docs 同梱））: comp-sections.tsx の from を表名だけに・useCompData(storeId, onError?) で 7 本の読取の error を最初の 1 件だけ rpcErrJa で赤帯（plan-board／norma-board／deduction-board が setMsg を渡す）・失敗した読取は直前値を保持（if (!p.error) setPlans …）。suite＝新規 verify-nox-comp-list 7（f0 97 段目＝owner A の同じ形の select が error null／壊れた from は PGRST205／CLUB NOX・NOX-DEMO-MUSE の行数 ≥1／逐語）＋x13 comp-list 3。★customers-keep ck(6-3) の旧 pin は壊れた from 文字列そのものを「区分別 3 欄を読む証拠」にしていた＝欠陥を固定化（教訓108 案）→ select("*") の形へ張替え。本番確認＝cl(3-1)（CLUB NOX 5 本＝レギュラー／エース／体験入店／基本／あああ）・無効化や整理は Agoora が画面で（本便は DB 不触）。

### 裁定339 追補1（2026-10-09 確定・相談役追認・便 X-13d-2b）便 X-13d-1 の仮決めの追認

出典＝相談役ブロック 2026-10-09（便 P167＋X-13d-2b B-3）。**本文（逐語）**: 「339 追補1（d-1 ①〜⑨ 追認・2026-10-09）」。
仮決め ①スマホの境界は既存の ≤900 ②日報の 19 列表もカード化（裁定251 の横スクロールは PC だけ維持）③systemUsageOf はプラン本体の値でも数える ④EXTRA_PLANS（MUSE Senior／LUNA Premium・新人／LILY Senior／NEST Senior・ACE 据え置き＝源泉 1 本）⑤LILY の live 3 本中 2 本はデモ内の手入力 ⑥CompRows のラベル「保証額（月）」「加算額」⑦HeaderGear の aria-current・title ⑧pin 張替え ck(6-3)／sp(2-1)／ms(2-25)／nv(6-2) ⑨pv(5-4)＝追認。適用＝変更なし。

## 裁定338（2026-10-09 確定・相談役・v44 §3）売上スライド／ポイントスライドの判定期間＝月次（既定）／半月／日次

出典＝相談役引き継ぎ v44 §3（docs/handoff/NOX_相談役引き継ぎ_2026-10-09_v44.md・「新チャットで台帳に記す・本書で確定」＝便 V44 V-1(b) で記入・2026-10-09）。**本文（逐語）**:
「売上スライド／ポイントスライドの判定期間＝月次（既定）／半月／日次 の 3 択。新規プランの初期値は月次・既存プラン（日次）は読み替えなし・説明文は選択に応じて切替・判定の売上は期間の累計（按分後）。実装は W5-2 の C5 と同じ便。デモは月次 2 店・半月 1 店・日次は使わない。」

実装便＝W5-2（0164 の C5 判定基準／対象と同じ便・X-13 台帳 #20＝docs/demo/x13_ledger.md）。mig 要否＝W5-2 の設計で決める（v44 §2）。適用＝未（本便は記入のみ・DB 恒久変更 0）。

### 裁定338 追補1（2026-10-09 確定・相談役・便 X-13d-2b・読取便 338-R を受けて）判定期間の計算と遡及＝mig 0168

出典＝相談役ブロック 2026-10-09（便 P167＋X-13d-2b B-3）。**本文（逐語）**:
「monthly／half は期間累計（按分後）で段を決め、その期間の全勤務時間に適用。確定時に段確定・プレビューは期首〜今日の累計で暫定（印）。daily は同日反映（現状の実装どおり・文言を直す）。slide_apply='next' は『前の期間の累計』として両立。ポイントスライドも同じ期間。mig＝0168」

読取便 338-R（2026-10-09）＝段判定は lib/nox/pay.ts wageDetail（slideAt・営業日ごとの按分後売上で同日の時給・run／プレビューで再計算・確定で payslips.breakdown_json に凍結）。店設定 slide_apply='next'（0151）は collect.ts 612〜635 の前月合計→assemble slideInputOf→pay の slideByDay＝「前月基準の月次」の器が既にある。C5（判定基準／対象＝何の売上・誰の売上）は直交し PREP_ITEMS に残置。
**0168 の欄（起草・未適用・便 X-13d-2b・2026-10-09）**: supabase/migrations/0168_comp_plan_slide_period.sql＝**sha256 44674b5d7ee7a055eab8c8746884977d9c82ce838da6df4caffd9b060121256e・14,894 B・180 行（台帳方式）／179（wc -l）・LF**・生成器 scratchpad/gen_0168.py（写経元＝0153 ★7 の set_comp_plan 全文＝docs/tmp/0153_set_comp_plan.sql・★以外 1 バイト不変）・突合 docs/tmp/q1009_ag_0168.mjs **15 段 NG 0**（文単位 8 文・新 md5 **3ebd1624**・関数 305／表 83／'billing locked' 156 不変・既存 21 行 daily・22 引数呼びは default 'daily' で通る・'weekly'／NULL は 'bad slide_period'・manager forbidden・22 引数版は残らない・payload（noir）populate NOT NULL 充足・rollback 後 305／0／3fdd6e81）。中身＝★1 comp_plans.slide_period text not null default 'daily'＋CHECK（monthly／half／daily）★2 set_comp_plan 23 引数（末尾 p_slide_period default 'daily'・NULL は明示拒否＝教訓100・insert／update に列・22 引数版 drop）★3 grants。手貼り案内 docs/demo/handpaste_0168.md（0167 の後）。payload は先行して comp_plans に slide_period（ACE／NOIR monthly・LUNA half・他 daily＝338 R-4・列が無い間は無視）。lib（slide.ts 期間キー／collect 期間累計／assemble slideByDay・pay.ts 不変）と UI（3 択・青ピル・説明文 3 種・新規プランの初期値 monthly）は適用後の便 P168。

**0168 適用（本番・収蔵＝便 P168・2026-10-09）**: 手貼り＝Agoora 2026-10-09 **18:48 JST**（Success・No rows returned・f0 P167 run1 走行中に適用＝赤なし）。live proof（便 P168 P-1）＝関数 **305**／表 83／set_comp_plan md5 **3ebd1624**・23 引数（末尾 p_slide_period text）・22 引数版なし／comp_plans.slide_period text・NOT NULL・default 'daily'／CHECK（monthly／half／daily）／既存 21 行 daily／'billing locked' 156。sha256 44674b5d…256e 再計算一致。名簿＝改稿 1 本（docs/NOX_課金ゲート対象_v1.md mig0168 追随）・対象 156／全数 305 不変。

**適用（lib・UI）＝便 P168（2026-10-09）**: lib/nox/payroll/slide.ts＝SlidePeriod／periodKeyOf（'YYYY-MM'／'YYYY-MM-H1'＝1〜15／'YYYY-MM-H2'＝16〜末）／periodRangeOfKey／prevPeriodKeyOf／periodKeysInRange／periodLabelOf／slideDescOf・slidePillOf・slideAtLabelOf／slideBasisForPeriodOf。collect.ts＝comp_plans の select に slide_period・slidePeriodByPlan・cast ごとに有効プランの期間で日次売上（按分後）と pts（castPts＝指名回数＋pt 商品）を期間ごとに累計（期の外や半月の窓は get_cast_sales／loadAccounting を窓ごと）・'next' は前の期間の累計・provisional＝期の末日が今日より後。assemble.ts＝slideInputOf は slidePeriod 優先（期間累計を全日の slideByDay に）。core.ts＝slideBasisForPeriodOf で凍結形（apply＝期間・provisional）。breakdown-lines＝「スライド 10月分＝月の累計・暫定（期首〜今日） 売上 …→時給 …」。pay.ts 不変。UI＝plan-editor 節④に 3 択 select（月次（既定）／半月／日次・owner・set_comp_plan 23 引数・新規プランの初期値 monthly・既存は現状値）・青ピル slidePillOf・説明文 slideDescOf（翌日反映の語は全撤去）・SlideInput period。suite＝新規 verify-nox-338 14（f0 100 段目＝sp(2-1) 月中に段が上がっても月初の勤務にも新段／sp(2-2) half は H1／H2 独立／sp(2-3) daily 従来）。デモ＝profiles.mjs SLIDES（ACE 月次・売上 800k／1.2M／1.6M→3,000／3,500／4,500・NOIR 月次・pt 60／120／200→4,000／4,500／5,000・LUNA 半月・売上 400k／700k／1M→3,300／3,600／4,000・他 daily＝スライドなし）・sys_point_slide を NOIR に・LUNA に sys_sales_slide。live（reset 後）＝reset 6 店 200（19:46〜19:47 JST）→ ACE 2026-09 凍結明細＝ひなの 月累計 1,295,563→時給 3,500／るな 915,101→3,000／せな 807,083→3,000／他 4 名は閾値未満＝2,500・LUNA 半月＝みさき H1 636,644→3,300・H2 554,780→3,300／れいな H1 448,257→3,300・H2 349,890→base・NOIR pt 月次＝あべ 327pt→5,000／りな 172pt→4,500／みお 72pt→4,000・provisional false（確定済み）・NEST cast の /mine＝「休み希望」（裁定337 の反転）。

### 裁定338 追補2（2026-10-13 確定・相談役追認・v45 §3）便 P168 の仮決め ①③④ の追認

出典＝相談役引き継ぎ v45 §3（便 V45 V-1 で記入・2026-10-13）。**本文（逐語）**: 「P168 ①③④（デモの段・'next' の両立・暫定印の条件）→338 追補2。」
内容＝① デモの段（profiles.mjs SLIDES）＝ACE 月次・売上 800k／1.2M／1.6M→3,000／3,500／4,500・NOIR 月次・pt 60／120／200→4,000／4,500／5,000・LUNA 半月・売上 400k／700k／1M→3,300／3,600／4,000・他は daily＝スライドなし（9 月分は reset の finalize hook で凍結明細に反映＝再確定不要）。③ 店設定 slide_apply='next'（0151）は「前の期間の累計」として判定期間（月次／半月）と両立（collect.ts の前期間累計→assemble slideInputOf）。④ 暫定印（provisional）の条件＝期の末日が今日より後（プレビューは期首〜今日の累計で暫定・確定で段確定）。

## 裁定337（2026-10-09 確定・相談役・v44 §3）シフト希望の方式をキャスト別に上書き可（0167）

出典＝相談役引き継ぎ v44 §3（docs/handoff/NOX_相談役引き継ぎ_2026-10-09_v44.md・「新チャットで台帳に記す・本書で確定」＝便 V44 V-1(a) で記入・2026-10-09）。**本文（逐語）**:
「シフト希望の方式をキャスト別に上書き可。キャスト詳細（待遇タブ）に『店の既定に従う／シフト希望／休み希望のみ』の 3 択・既定＝店の既定に従う・/mine は『キャスト個別→店の既定』で解決し 'off_only' の候補反転（M4）も解決値で・店側『作る』画面に方式の印・0167（casts +1 列 nullable）・デモは 3 方式が混ざるよう payload。」

実装便＝X-13d（X-13 台帳 #18＝docs/demo/x13_ledger.md）。mig＝0167（casts +1 列 nullable＝null は「店の既定に従う」・起草待ち→手貼り→P167）。適用＝未（本便は記入のみ・DB 恒久変更 0）。

**0167 の欄（本番適用済み・収蔵＝便 P167・2026-10-09）**: supabase/migrations/0167_cast_shift_request_mode.sql＝**sha256 608c1bcbd4ee6c369c2349c7e728e5f1accdfde2a3ae3e5f1e9da1867797e8fb・6,491 B・69 行（台帳方式）／68（wc -l）・LF・突合 15 段 NG 0（docs/tmp/q1009_ag_0167.mjs・BEGIN…ROLLBACK・文単位 7 文）**。手貼り＝Agoora 2026-10-09 **18:24 JST**（Success・No rows returned）。live proof（docs/tmp/q1009_p167.mjs）＝関数 **305**／表 83／set_cast_shift_request_mode md5 **ee7f7243**／casts.shift_request_mode text・NULL 可／CHECK＝IS NULL OR IN ('shift','off_only')／既存 48 行 NULL／'billing locked' **156**／authenticated 可・anon 不可／不触 set_comp_plan 3fdd6e81・demo_org_reset a4bd6a18・cast_sales_aggregate e232dac8・set_product_track_stock 594c5e98。名簿＝A10 +1（set_cast_shift_request_mode）＝対象 **156**／除外 149／全数 **305**（docs/NOX_課金ゲート対象_v1.md）。pin 張替え＝billing 段47-1（156／157／156）・anon-guard（probe +1・authenticated(cast) 不可 +1）・grants（公開 +1）・0158（s-2d md5 ee7f7243・関数 305）。

**適用（client）＝便 X-13d-2b（2026-10-09）**: ①キャスト詳細（待遇タブ）に「シフト希望の方式」3 択（店の既定に従う（既定の表示付き）／シフト希望／休み希望のみ・既定＝null）→ set_cast_shift_request_mode・casts の select に列。②/mine＝layout（ナビ文言）と wishes page（文言・WishForm）は auth_cast_id で自分の casts 行→ resolveWishMode（キャスト個別→店の既定）。③自動配置の候補 candidateWishesOf に castModes（cast ごとに解決・'off_only' の人だけ反転＝M4 の反転も解決値）。④店側「作る」＝配置ビュー（キャスト×日）のキャスト名に個別の方式の印（null は印なし）。⑤デモ＝gen-demo が casts に 3 方式を混ぜる（idx%4＝1 off_only・2 shift・他 null）。suite＝新規 verify-nox-337 15（f0 99 段目）・m4-wish-mode wm(2-5)(2-6)＋wm(4-1) 張替え・demo-profiles dpf(2-6)。

### 裁定337 追補1（2026-10-13 確定・相談役追認・v45 §3）便 P167（X-13d-2b）の仮決め ①〜③ と P168 ② の追認

出典＝相談役引き継ぎ v45 §3（docs/handoff/NOX_相談役引き継ぎ_2026-10-13_v45.md・便 V45 V-1 で記入・2026-10-13）。**本文（逐語）**:
「仮決め追認＝P167 ①〜③（印は個別設定があれば出す／本人行は auth_cast_id／デモ 3 方式は idx%4）→337 追補1。」「②（NEST ケンのみ off_only）→337 追補1 に含める。」
内容＝① 店側「作る」画面（配置ビュー・キャスト×日）のキャスト名の方式の印は、個別設定（casts.shift_request_mode が非 null）があるときだけ出す（null＝店の既定に従う＝印なし）。② /mine（layout のナビ文言・wishes page の文言・WishForm）は auth_cast_id で自分の casts 行を引き resolveWishMode（キャスト個別→店の既定）で解決する。③ デモは gen-demo が casts に 3 方式を混ぜる（idx%4＝1 off_only・2 shift・他 null）。P168 ②＝デモ NEST はケンのみ off_only（/mine が「休み希望」に反転する実例・他のキャストは店の既定）。pin 張替え一覧の追認は裁定341 追補1 に集約。

## 裁定336（2026-10-08 確定・相談役・便 G2）起票100 の処置＝案 A（cast_sales_aggregate の CTE groups を materialized に）

出典＝相談役ブロック 2026-10-08（便 G2 の前提「裁定336＝案 A」・逐語）。**本文（逐語）**: 「裁定336＝案 A。」
案 A（便 G1 の 3 案・台帳「便 G1 完了」）＝0165 で cast_sales_aggregate の `groups as (` を `groups as materialized (` に（1 語・PG17・結果不変・名簿不変）。B（check_group_due の集合展開）・C（app 側 7 日分割）は不採用。

適用＝便 G2（2026-10-08）: 0165 起草（下の欄）・突合 13 段 NG 0・手貼り案内 docs/demo/handpaste_0165.md（教訓104 の形）・0158 に過渡 pin s-2b（f765c36a｜e232dac8→P165 で 1 値）。

**0165 の欄（本番適用済み・収蔵＝便 P165・2026-10-08）**: supabase/migrations/0165_cast_sales_aggregate_materialized.sql＝**sha256 75be081a485238a96e70ce6e5cad4ce9621d16e58bd52d43507080ebd91559b0・7,756 B・131 行（台帳方式）／130（wc -l）・LF・突合 13 段 NG 0（docs/tmp/q1008_ag_0165.mjs・BEGIN…ROLLBACK・文単位 2 文）**。生成器 docs/tmp/gen_0165.mjs（live を dump→1 語置換・出現 1 回と長さ +13 を assert）・写経元 docs/tmp/0165_live.json（cast_sales_aggregate f765c36a）・期待 docs/tmp/0165_expected.json＝**cast_sales_aggregate f765c36a → e232dac8**・不触 get_cast_sales eaec39a4／check_group_due 6c1ef055／demo_org_reset a4bd6a18。中身＝★1 cast_sales_aggregate の CREATE OR REPLACE（live 写経＋materialized）★2 4 ロール明示 revoke 再掲（ACL {postgres=X/postgres} 不変）。突合の 4 値＝①適用後 md5 e232dac8・prosrc＝live＋' materialized'（他 1 バイト不変・署名／STABLE／SECURITY DEFINER／search_path 不変）②explain (analyze) cast_sales_aggregate(NOIR, 09-01, 09-30)＝**82.6 ms**（<200）・get_cast_sales 同範囲 wall **8,749 ms → 127 ms**（owner JWT）③get_cast_sales の行数 147・Σsales 9,099,065・Σhon 233／jonai 120／dohan 41・全行の署名 71b0a188＝適用前と同一④関数 303／表 83／'billing locked' 154 不変・ACL 不変・authenticated 直呼びは permission denied のまま・ROLLBACK 後 f765c36a。名簿不変（内部ヘルパー B(a)）。手貼り後に赤になる段＝なし（0158 s-2b は両値可→P165 で e232dac8 に絞る）。 **本番適用＝2026-10-08・時刻不明（Agoora 申告「不明」で確定）**・Agoora 申告 proof＝orgs 9・cast_sales_aggregate e232dac8・get_cast_sales eaec39a4・demo_org_reset a4bd6a18・関数 303／表 83。live 照合＝docs/tmp/q1008_post_0165.mjs（06:34:35Z）＝md5 e232dac8・position('groups as materialized')>0・proacl {postgres=X/postgres}・不触 3 本不変（check_group_due 6c1ef055）・関数 303／表 83／gated 154・get_cast_sales(NOIR, 09-01, 09-30) owner JWT＝行 147・Σ 9,099,065・hon 233／jonai 120／dohan 41・署名 **71b0a188**（適用前と同一）・wall **85 ms**（適用前 8,749 ms）。explain (analyze) cast_sales_aggregate 同範囲＝初回 311 ms（cold・plan 未キャッシュ）→以後 **68〜73 ms**（Buffers shared hit 7,939・4 回）＝200 ms 未満。収蔵＝sha256 75be081a485238a96e70ce6e5cad4ce9621d16e58bd52d43507080ebd91559b0・7,756 B・131 行（台帳方式）／130（wc -l）。名簿 303 不変（B(a) 内部・md5 更新のみ）。pin＝0158 s-2b を e232dac8 の 1 値に確定（単独走 52 緑）。**起票100 の live 確認（P-2）＝/api/payroll/preview（owner・2026-09・本番 Vercel 経由）6 店とも 200**: MUSE 7,828 ms／LUNA 8,826／NOIR **7,134**／ACE 12,534／LILY 9,657／NEST 7,098（入場＋preview＋signOut の往復込み）。NOIR の gross＝**5,497,431**（8 名・こころ 257,224 込み・参考 4,605,500 はこころ除外＝除外後 5,240,207・差 +634,707＝328 追補6 の仕様差 3 系統と同型）。6 店計 15,064,718（参考 13,648,300）。

**教訓候補→教訓105 で採番（便 P165・2026-10-08）**: STABLE な plpgsql 関数を CTE 内で呼ぶときは、その CTE を materialized にする（または結果を 1 回だけ評価する形にする）。 PG12 以降は 1 回参照の CTE が inline されるため、関数の戻り値が後段の join／window の行ごと・参照ごとに再評価され、呼出回数が (check,pay_group) の数十倍になる（起票100＝8,359 ms→95 ms）。index／RLS を疑う前に「due=0 に置換した同クエリ」と「VOLATILE ラッパで呼出回数を数える」で切り分ける（docs/tmp/q1008_g1.mjs／q1008_g1b.mjs の型）。
**恒久注意（追加・便 G2）: Agoora 向けの md（手貼り案内・目視案内）は冒頭に「結論 3 行」を置く**（何を・どこに・何を返すか）。例文に角括弧のプレースホルダを残さず、確認クエリは値を出さず形を返す（教訓104）。

## 裁定335（2026-10-08 確定・相談役・v43 §3）sharp を devDependency に追加して良い

出典＝相談役引き継ぎ v43 §3（docs/handoff/NOX_相談役引き継ぎ_2026-10-08_v43.md・「提案・新チャットで確定」＝便 V-1 で確定・2026-10-08）。**本文（逐語）**:
「**裁定335**（提案・新チャットで確定）＝sharp を devDependency に追加して良い（upload-photos の 512px 縮小・本番バンドル不変）。」

背景＝D1 の仮決め ⑫（scripts/demo/upload-photos.mjs の --apply は 512px 縮小に sharp が要る・D1 は dry-run 47 件まで＝328 追補2）。適用＝D2 の --apply 便で package.json の devDependencies に追加（便 V-1 では package.json 不触＝docs のみ）。追加時の確認＝next build の本番バンドルに sharp が入らないこと（scripts/ からのみ import・app/ と lib/ では import しない）を f0 の前に確認し、台帳の本欄に追加コミットのハッシュを記す。

### 裁定335 追補1（2026-10-08 確定・相談役追認・便 P163）便 V の仮決めの追認

出典＝相談役ブロック 2026-10-08（便 P163 P-2）。**本文（逐語）**: 「裁定335 追補1＝便 V の仮決め（333 追補1 の「10→11 点」注記・check_20261002 のクローズ節）を追認。」
仮決め 2 点＝①333 追補1 の適用欄「仮決め 10 点」は便 S1 報告時の数で、11 点目（失敗理由の Message 化＝裁定281-3）は同便内で追加した分＝11 点で収載し注記で残す。②docs/demo/check_20261002.md の末尾に「クローズ（2026-10-08・裁定328 追補2）」節を追記し NG 5 を仕様差として記録。便 P163 で check-demo の出力先を日付付き check_<YYYYMMDD>.md に変更（20261002 はクローズ節つきの記録として残す・20261008＝0164 後の再突合 83 段 NG 5＝同じ 5 段）。

適用＝変更なし（便 V の記入どおり）。

## 裁定334（2026-10-02 確定・相談役）W5 の未裁定＝締め日／支払日・フロア機能

出典＝相談役ブロック 2026-10-02（【予約・無人便の追加】D1→0164 起草・逐語）。**本文（逐語）**:
「裁定334（W5 の未裁定）＝給与の締め日は月末固定（既存の期単位・324 と整合）／支払日は店設定 pay_day（翌月 1〜31・既定 25・表示と「次にやること」の案内用・計算には使わない）／フロア機能＝stores に use_vip・use_counter（boolean・既定 true）で席・卓 UI の表示切替のみ・計算不変。裁定333（S1）の仮決めは報告で追認待ち。」

適用＝0164 起草（stores に pay_day／use_vip／use_counter ＋ setup_map C 5 項目の器）→ W5-2／W5-3。締め日は payroll_runs.period（YYYY-MM）のまま＝migration なし。

### 裁定334 追補1（2026-10-08 確定・相談役追認・v43 §3）0164 の起草判断の追認

出典＝相談役引き継ぎ v43 §3（便 V-1 で収載・2026-10-08）。**本文（逐語）**: 「**334 追補1**＝0164 の起草判断を追認（set_store_profile 置換・新規 RPC なし・非ゲート）。」
追認された起草判断 6 点＝docs/tmp/v43_pre.md「0164 の仮決め」（逐語転記・docs/tmp は未追跡のため台帳が正）:
1. 7 項目は settings_json ではなく **stores の実列**（既定付き・既存行は既定で埋まる）。締め日は列を足さない（月末固定＝334）。
2. 設定の書き手＝既存 set_store_profile の白名単 +7（新 RPC なし・owner 限定・課金ゲート・'bad key'／'bad type' の流儀はそのまま）。jsonb 2 項目は現値とマージ（無いキーは不変）・cash は常に true・打刻は 1 つ以上。
3. invoice_registered_on は 'YYYY-MM-DD' か null（印字判定は receipt＝W5-3 の client・check_close 時点との比較）。
4. payment_methods は UI の出し分けだけ（記録は payments.method の 4 値＋method_detail のまま）。punch_methods も UI だけ（RPC 側の拒否は裁定要）。
5. **demo payload への影響**＝stores の NOT NULL 列が増える→手貼り後に columns_20261002.json を取り直して gen-demo を再実行（payload の sha が変わる＝demo-payload suite dp(1-1) 張替え）。
6. 手貼り順＝0163 → 0164（独立だが名簿の pin を 1 回で張り替えるため連続で）。

適用＝0164 は起草どおり（下の欄・手貼りは Agoora・0163 の後）。手貼り案内＝docs/demo/handpaste_0163_0164.md（便 V-2・2026-10-08）。④ の「punch_methods の RPC 側の拒否」は引き続き裁定待ち（本追補は UI の出し分けまで）。

### 裁定334 追補2（2026-10-08 確定・相談役追認・便 D2-a）store-systems の pin 張替えの追認

出典＝相談役ブロック 2026-10-08（便 D2-a A-5）。**本文（逐語）**: 「334 追補2＝store-systems pin 張替え追認。」
内容＝便 P163 の f0 run1 で verify:nox-store-systems ss(4-0)（live の set_store_profile 白名単＝26 キー pin）が赤→0164 の列側 7 キー（invoice_registered_on／pay_day／tax_inclusive_display／use_vip／use_counter／payment_methods／punch_methods）を含む **33 キー**に張替え（7 キーの実在も assert）。0164_pre §5 の想定「store-profile 27→34」は store-systems の pin が実体だった＝指定外の張替えとして報告→本追補で追認。

適用＝72c7e29（便 P163）どおり。

**0164 の欄（本番適用済み・収蔵＝便 P163・2026-10-08）**: supabase/migrations/0164_store_ops_settings.sql＝**sha256 02d378983e202eacae914e5c9cf4489732dbb32526d6f366e5612ac3a2f4dcfc・458 行・45,322 B・突合 11 段 NG 0（docs/tmp/q1002_ag_0164.mjs・BEGIN…ROLLBACK）**・生成器 docs/tmp/gen_0164.mjs＋0164_template.sql・写経元 docs/tmp/0163_live.json の set_store_profile（4f2e9f82 → 期待 2e7b4963・★追加 74 行・他は 1 バイト不変）。中身＝stores に 7 列（invoice_registered_on date null／pay_day int 25・1〜31／tax_inclusive_display bool false／use_vip・use_counter bool true／payment_methods jsonb {cash,card,emoney,qr}／punch_methods jsonb {self,proxy,kiosk}）＋ set_store_profile の白名単 +7（列側・型検査・cash は常に true・打刻は 1 つ以上・監査 before/after）。新規 RPC なし＝名簿不変（303／83／154 は 0163 後の値）。締め日は列を足さない（月末固定）。**demo 表への影響＝stores の NOT NULL 列が増える→payload の stores 行に 7 列が要る（jsonb_populate_recordset は default を使わない・c-10 で実証）＝手貼り後に columns スナップショットを取り直して gen-demo を再実行**。手貼り後に赤になる段＝docs/tmp/0164_pre.md §5。 **本番適用＝2026-10-08・時刻不明（Agoora 申告「不明」で確定）・0163 の後**・Agoora 申告 proof＝stores 列 7（invoice_registered_on／pay_day／payment_methods／punch_methods／tax_inclusive_display／use_counter／use_vip）・set_store_profile 2e7b4963・demo_org_reset a4bd6a18・関数 303／表 83・stores 4/4 既定値。live 照合 all_ok（同上の q1008_post＝7 列の型／nullable／default・CHECK 3 本（pay_day 1〜31・jsonb object 2）・stores 37 列・全 4 行が既定値・本文に 7 キーと検査文）。収蔵＝sha256 02d378983e202eacae914e5c9cf4489732dbb32526d6f366e5612ac3a2f4dcfc・45,322 B・458 行（split）／457 行（wc -l）。名簿不変（改稿 1 本＝mig0164 追随）。**payload 再生成**＝columns_20261002.json を取り直し（docs/tmp/q1008_cols.mjs・stores 30→37 列・他 77 表に差分なし）→gen-demo（★jsonb の default を実値で補完する 1 行を追加＝payment_methods／punch_methods が {} にならない）→check-demo 83 段 **NG 5＝仕様差 5 のみ（328 追補2・docs/demo/check_20261008.md・出力先を日付付きに変更）**→demo-payload の sha 6 店更新（muse 7274d138／luna dd865507／noir f11afccb／ace 239fbb91／lily e88b5c5f／nest 152c6f0a・bytes 1,196,339／1,836,141／2,009,082／1,889,594／2,562,132／2,806,486・rows 不変）。suite 張替え＝0158（set_store_profile md5 2e7b4963）・store-profile（⑪ 列側 7 キー＝書込・監査・拒否 13 種・manager／cast forbidden・null・復元＝58→82）・demo-payload（_report.json の sha＝自動追随）。

## 裁定333（2026-10-02 確定・相談役・便 S1）スタッフから配置の複数日化

出典＝相談役ブロック 2026-10-02（【予約の変更】MC2 の push・報告後、W5-1 の前に便 S1）。**本文（逐語）**:
「裁定333（ブロック内）: 『スタッフから配置』をキャストの複数日配置と同じ流れにする。
- 1 スタッフを選ぶ → 2 カレンダーで日付を複数クリック（クリックでトグル・選択日は強調・月送りしても選択は保持・定休日と既存の配置済み日は選べずその旨を表示）→ 3 枠（早番／遅番）と時刻を 1 回だけ選ぶ（枠から写す・上書き可・翌日）→ 4 画面右に「選択した日」一覧（日付・曜日・枠・時刻・個別の×）→「N 日に配置」で一括。
- 配置の単位と状態は現状どおり（各日が「確認待ち」で入り、確定は既存の「この営業日を一括確定」）。
- 投入は既存の staff 配置 RPC を日ごとに呼ぶ（一括 RPC があればそれを使う・新規 RPC なし）。途中で失敗した日は一覧に赤で残し、成功分はそのまま（全取消はしない）。
- 1 日だけ選んだ場合も同じ流れ（従来の 1 日画面は廃止）。
- キャスト側の複数日 UI の部品を再利用し、見た目・文言を揃える。」

適用＝便 S1（2026-10-02・client のみ・DB 恒久変更 0）: app/(manage)/shift/staff-place-by-staff.tsx を 2 状態（pick／select）に書き換え・lib/nox/shift/staff-place.ts に純関数（dayBlockOf／toggleDay／patternChoicesOf／defaultPatternNameFor／dayPlansOf／partitionResults／placeLabelOf）・staffShiftErrJa に staff_shifts_uq の和文・verify staff-shift 段S1-1〜9（＋N6-8 張替え）。一括 RPC は無いため staff_shift_propose（＋override）を日ごとに順次。仮決め 10 点＝docs/tmp/v43_pre.md「S1 の仮決め」（追補で追認）。

### 裁定333 追補1（2026-10-08 確定・相談役追認・v43 §3）S1 の仮決め 11 点の追認

出典＝相談役引き継ぎ v43 §3（便 V-1 で収載・2026-10-08）。**本文（逐語）**: 「**333 追補1**＝S1 の仮決め 11 点を追認（propose の順次投入・部分失敗は残す・旧 1 日画面は撤去）。」
11 点＝docs/tmp/v43_pre.md「S1 の仮決め」（逐語転記・docs/tmp は未追跡のため台帳が正。上の適用欄の「仮決め 10 点」は便 S1 報告時の数＝11 点目は messages suite ms(2-1) の赤を受けて同便内で追加した分）:
1. 便の順序＝「MC2 → S1 → W5-1」の指示を受けた時点で W5-1 の実装が作業ツリーに済んでいたため、W5-1 を退避せず S1 を重ね、f0 2 連は両便の合成ツリーで 1 回・コミットは S1（lib／app／verify）→ W5-1（lib＋JSON／app／verify）の順にパス指定・報告は S1 → W5-1 の順。
2. 状態遷移＝2 状態（pick／select）。配置後も select に留まる（失敗した日が赤で残る・続けて別の日を選べる）。旧 3 状態（calendar／place）と StaffPlaceForm の 1 日画面は本モーダルから撤去（日付起点の入口①＝staff-place-day は従来どおり StaffPlaceForm）。
3. 枠は「名前」で束ねる（枠は日ごとに有効な版が違う）。日ごとに同名の有効版へ解決し、無い日は一覧に赤で「有効な枠がありません」＝配置ボタンは押せない（その日を外すか別の枠）。既定の枠＝選択日の ◯ 希望の枠名で最多・無ければ全日で有効な枠・無ければ先頭。
4. 時刻は 1 回だけ（枠から写す・上書き可・翌日は終了≦開始で自動オン）。枠の時刻と違う日だけ配置後に staff_shift_override（従来の 2 段・親の onPlace）。
5. 投入＝既存 staff_shift_propose を日ごとに順次（一括 RPC は無い・新規 RPC なし）。親の onPlace が日ごとに onChanged を呼ぶ（従来どおり）。失敗した日は赤で残し成功分はそのまま。
6. 選べない日＝過去日／定休日（store_business_hours.is_closed の曜日）／配置済み（枠を問わず・既存行があれば）／有効な枠なし。優先順＝この順で title に理由。定休日の読取は本モーダル自前（RPC 側の検査は従来どおり）。
7. 月送りしても選択は保持。希望・配置の読取は「表示中の月＋選択日の月」の範囲に広げる（他月の配置済みも判定できる）。他月で見えていない重複は RPC の staff_shifts_uq → 和文「この日はすでにこの枠に配置済みです…」（S1-2・既存様式に 1 行）。
8. 右の一覧＝日付（M/D(曜)）・枠・時刻・「上書き」「希望から」印・個別の ×・「選択をすべて解除」・「N 日に配置」（0 日は disabled）。結果の文言＝「N 日に配置しました（確認待ち）」＋失敗数（warn）。
9. 見た目・文言＝キャスト側 ShiftAddForm の凡例（■ 今回選択・● 登録済み…）と「選択した日」一覧の型に揃える（部品はクラスと配置を写経・コンポーネントの共有は型が違うため行わない）。
10. モーダル幅 1100・右ペインは nox-2col で「枠と時刻」と「選択した日」を並べる（≤899 は 1 列）。
11. 失敗した日の理由＝行には「失敗」バッジ（赤枠・title に理由）・理由の本文は一覧の下の Message（kind error）に列挙（裁定281-3＝素の span で文言を描かない。messages suite ms(2-1) が検知したため差し替え）。

適用＝便 S1 の実装どおり（変更なし・client のみ・DB 恒久変更 0）。目視は v43 §4-2（Agoora・NG は X-13 に束ねる）。

## 裁定332（2026-10-02 確定・相談役）疎通門番の判定

出典＝相談役ブロック 2026-10-02（便「MC2 再開」R-0 停止の報告への回答・逐語）。**本文（逐語）**:
「裁定332（疎通門番の判定）＝f0 前の疎通は 3 値＝①REST 認証付き GET が 200（3 回）②DB 実行時間＝explain analyze の Execution Time が 5 ms 未満（select 1 ではなく実クエリ）③回線 RTT（Supabase edge への ICMP）が 150 ms 未満。Supabase ステータスは「当該リージョン（ap-northeast-1）に障害なし」で可・他リージョンの Degraded は無視。RTT が 50 ms 超なら f0 の所要見込みを報告してから起動し、1 走が 60 分を超えるかタイムアウト型フレークが 2 回続いたら停止。」

背景＝2026-10-01 夜に nox-dev の PostgREST が 503 PGRST002（schema cache 不可）・pool checkout timeout・anon-guard の insert null（15〜49 分）で f0 2 連が取れず教訓85 で停止。翌 10-02 の再開門番「select 1 が 10 ms 台」は回線 RTT（Supabase edge 60 ms・1.1.1.1 53 ms・google 3 ms）を含むため NG となり、DB 実行時間（explain analyze 0.056 ms）は健全だった＝教訓102。計測＝docs/tmp/q1002_exec.mjs（explain analyze）・q1002_rest_auth.mjs（認証付き REST）・q1001_lat.mjs（壁時計）。

適用＝便「MC2 再開」R-0（2026-10-02 15:0x・REST 200×3・Execution 0.056 ms・RTT 60 ms＝3 値 OK）から f0 を起動。

## 裁定331（2026-10-01 確定・相談役）初期設定 v5

出典＝相談役チャット 2026-10-01（便 MC0 の直前・逐語）。正本モック＝docs/handoff/mock/20261001/nox-setup-v5.html（MC0-1 で収蔵）。**本文（逐語）**:
「裁定331（初期設定 v5）＝正本モック nox-setup-v5.html・6 ステップ・業態テンプレ 6 種・達成ボーナス多段／売上スライド／新人保証の自動終了は現行で動く範囲のみ表示（未実装は非表示・第 2 期）・勤務時間の数え方＝324・キャストのスマホ画面＝326 の 8 キー・打刻方法 3 択。差し戻しはモック修正で行う（BANZEN UH と同じ運用）。順序＝MC（2 便）→W5（3 便）→D1。」

適用＝便 MC0（読取・対応表 docs/handoff/mock/20261001/setup_map.md）→ W5（3 便想定・client）。

**W5-1 適用（2026-10-02）**: 6 ステップ化・テンプレ 6 種（v2.json＝モック SRC）・特徴 5 の分岐（VIP 専用料金表／VIP 加算／指名料なし／売上スライド 3 段（当日判定の文言）／新人保証 2 本目／達成ボーナス 1 段）・C／D 非表示（SETUP_HIDDEN_ITEMS 10）・進捗バー・途中保存・あとで設定・次にやること。B（曜日時間帯の料金行・ランク別指名料・個別商品選択・契約の形）は W5-2。仮決め 21 点＝docs/tmp/v43_pre.md（追補で追認）。

### 裁定331 追補1（2026-10-08 確定・相談役追認・v43 §3）W5-1 の仮決め 21 点の追認（④⑱ は W5-2 で開く）

出典＝相談役引き継ぎ v43 §3（便 V-1 で収載・2026-10-08）。**本文（逐語）**: 「**331 追補1**＝W5-1 の仮決め 21 点を追認。うち ④「キャストのランク別」は W5-2 で開く・⑱ 商品の個別選択は W5-2。」
21 点＝docs/tmp/v43_pre.md「W5-1 の仮決め」（逐語転記・docs/tmp は未追跡のため台帳が正）:
1. 業態 5＝モック BIZ（キャバクラ／ラウンジ／ガールズバー／スナック／バー・順序と文言そのまま）。ラウンジの土台＝cabaret_vip（モック BIZ.lounge.base＝NOIR）。biz_type enum は 5 のまま（migration 0）。
2. テンプレ JSON＝v1.json（4 テンプレ＋bar 空・2026-09）を v2.json（正本モック nox-setup-v5.html の SRC 6 店をそのまま JSON 化・6 テンプレ・57,349 B）へ全置換。v1 の lounge_standard は廃止（ラウンジは cabaret_vip）。bar の空テンプレは廃止（bar_staffback＝テーブルチャージ 1,100・商品 29）。
3. 営業時間の既定＝モックの S 既定（20:00〜01:00・営業日の切替 06:00）を 6 テンプレ共通に（v1 の業態別の値は使わない）。
4. 指名料の 3 択のうち「キャストのランク別」は W5-2（ランク行＋ランク別ルールの結線）まで画面に出さない（型と SETUP_HIDDEN_ITEMS に残す）。
5. 売上スライドの説明文はモック「前月の売上で今月の時給が決まります」ではなく現行の判定「その日の売上で当日の時給が決まります（3 段）」（裁定331 の指示どおり）。段＝cabaret_slide（ACE）の 4 段を基本時給差で写し at=0 を除く 3 段。
6. 達成ボーナス＝1 段・金額のみ（set_comp_component kind achievement_bonus・mode amount・params thresholds[{pct:100,add}]）。目標額はキャスト別目標（ノルマ）で設定する旨を注記（モックの「月の売上 N 円以上」の閾値は器が無い）。plan id は実行時に set_comp_plan の戻りから取る（argsOf 'comp_component'）。
7. 勤務時間の数え方＝裁定324（既定 実打刻）。モックの「確定シフトどおり（既定）」の「（既定）」は実打刻側へ移す。説明文はモックの 2 文そのまま。
8. STEP 4／5 の副題＝モック「時給・給与の締め日」「税・支払い方法・打刻」は C 非表示と矛盾するため「時給・バック・控除」「会計・キャストのスマホ画面」に言い換え（題 6 本はそのまま）。
9. 遅刻とみなすまでの猶予＝値を触ったときだけ set_penalty_config（12 引数明示・他 11 は comp-sections の DEFAULT_PENALTY と同値・既定表示 10 分）。
10. 送りの基本額＝set_store_profile の patch okuri_base_amount（既定 1,000＝モック comp.okuri）。別 RPC（set_store_okuri_base）は使わない。
11. カード手数料＝ON で p_card_tax_rate に率・OFF で 0（現行の「現値マージ」を置換）。既定＝現値>0 なら ON・率は現値（0 なら 4%＝モック cardRate）。
12. キャストのスマホ画面＝mine 8 キーのうち 7（給与明細 3 値／シフトの出し方／予約申請／ドリンク申告／修正申請／ランキング）を STEP 5 に。contract_ack と ranking_show_others は出さない（店舗設定で）。書込＝set_store_mine_settings の差分だけ。
13. 必須＝店舗名・住所（モック canNext どおり）。電話・住所は set_store_receipt_profile（reg_no／footer は現値を明示送信）。インボイス登録・但し書きは出さない（C／裁定要）。
14. 完了画面「次にやること」の導線＝招待 /casts・シフト /shift・在庫 /master/stock（在庫管理の商品があるときだけ）・レジ端末 /master/system#devices（owner 以外は /register）。完了後の router.push('/dashboard') は撤去（完了画面に留まる）。
15. 途中保存＝localStorage の下書き（店ごとのキー・hydration 後に復元・完了で削除・「最初からやり直す」）。正は DB（完了時の計画実行＝現行 W/S の保存機構）＝下書きは補助のみ。
16. 「あとで設定」＝STEP 2〜5 の footnav。laterDefaultsOf（テンプレ値・実打刻・猶予 null・ノルマ OFF・送り 1,000・卓会計・カード現値・売掛＝テンプレ ar なら customer_only／無ければ disabled・スマホ画面＝既定＋テンプレの shift_request_mode）を入れて進む。確認表に「あとで設定」の印・「ここで設定する」で解除。
17. 使う制度（sys_* 9）のパネルはモックに無いため撤去し、特徴とスイッチから導く（hourly／backs ON・sales_slide＝スライド・bonus＝達成ボーナス・norms＝ノルマ・他 OFF）。残りは店舗設定 › 利用機能で。
18. 商品＝一覧表示＋「商品テンプレを取り込む」1 本（1 品ずつの選択・名前／価格の編集は W5-2）。上書き＝back 非既定か本指名pt>0 の商品（set_product 15 引数・hon_pt はテンプレ値）。
19. VIP 専用の料金表＝cabaret_vip の VIP 行（VIP平日／VIP週末）の先頭有効行を seat_kind 'VIP' の set／extension 2 本で投入（曜日時間帯の行は W5-2）。VIP 元が無い業態は通常の 1.5 倍を 500 円単位で合成（モック build どおり）。VIP 加算＝vip_charge 1 本（5,000）。
20. 受取方針＝モックの 2 択（受けない／店が負担して受ける）を現行 3 値（RECEIVABLE_POLICIES）で出す。紹介料＝器なし（表示のみ・紹介者マスタへの案内）。不就労控除・日払い・精算調整のひな形＝表示のみ（常に ON／完了時 3 件）。
21. 1 日の報酬の目安＝モック previewHTML の写経（時間報酬 5 時間・本指名 1・場内 1・指名別バックの先頭ドリンク 4 杯）。契約の形／報酬の型は W5-2（器なし＝既定表示）のため目安は時間報酬で固定。

適用＝W5-1 の実装どおり（変更なし）。④（指名料「キャストのランク別」＝ランク行＋ランク別ルールの結線）と ⑱（商品の 1 品ずつの選択・名前／価格の編集）は W5-2 で開く（SETUP_HIDDEN_ITEMS から外す・0164 の C 5 項目の UI と同便＝v43 §4-3）。

## 裁定330（2026-10-01 確定・相談役）マスタ整理

出典＝相談役チャット 2026-10-01（便 MC0 の直前・逐語）。正本モック＝docs/handoff/mock/20261001/nox-master-consolidated.html（MC0-1 で収蔵）。**本文（逐語）**:
「裁定330（マスタ整理）＝正本モック docs/handoff/mock/20261001/nox-master-consolidated.html・トップ 4 パネル 9 入口・既存編集画面をタブ内に配置・旧 URL 維持・在庫はマスタから外し営業メニューへ・店舗名編集は店舗情報に一本化・キャスト会計の許可は権限へ・データ管理（利用目的・保持年数・操作ログ）は店舗情報から分離・設定値／計算／権限／履歴は不変。」

適用＝便 MC0（読取・対応表 docs/handoff/mock/20261001/master_map.md）→ MC（2 便想定・client）。順序＝MC → W5 → D1（裁定331 と同文）。

**MC1 適用（2026-10-01）**: トップ 4 パネル × 9 入口・入口内タブ・在庫はマスタ外（営業メニュー）・旧 URL 維持（新 route 0）。MC2 送り＝店舗設定の利用機能／店舗情報分割・データ管理の分離・キャスト会計の許可の移動（MC1 は報酬設定のタブに仮置き）・報酬制度／機能の公開の置き場。仮決め 9 点は docs/tmp/v43_pre.md（追補で追認）。

### 裁定330 追補1（2026-10-01 確定・相談役追認・便 MC2）MC1 の仮決め 9 点の追認

出典＝相談役ブロック 2026-10-01（便 MC2 の直前）。**本文（逐語）**: 「330 追補1＝MC1 の仮決め 9 点を追認、ただし ⑤料金・会計の内側ピルは MC2 で撤去し外側 ?tab= の 1 本に／M1『キャスト画面の設定』の置き場は『店舗設定 ＞ 利用機能』タブに変更（master_map を更新）。」
9 点＝docs/tmp/v43_pre.md「MC1 の仮決め」（①3 層の nav ②入口の href＝先頭タブ ③旧 URL の redirect 不要 ④MC2 までの仮置き ⑤料金・会計の ?tab（→内側ピルは MC2 で撤去） ⑥パンくず ⑦KPI と在庫警告の移設 ⑧検索 ⑨オーナーバッジ）。

適用＝便 MC2（pricing-board の内側ピル撤去・MineSettingsPanel を店舗設定 ＞ 利用機能タブへ・master_map.md 更新）。

**MC2 適用（2026-10-01）**: 店舗設定 2 タブ（利用機能／店舗情報・住所／電話／インボイス番号は端末・印刷のまま＝二重編集を作らない）・権限・情報管理 3 タブ（キャスト会計の許可／データ管理／機密情報）・報酬設定 3 タブ・料金・会計の内側ピル撤去・system の機能の公開タブ撤去・旧 href は alias 解決（/master/cast-comp/systems・/master/system#features → 店舗設定／利用機能）。新 route 0・新 RPC 0。フロア機能（VIP／カウンター）は器なし＝出さない（W5 の 0164 で裁定）。master_map.md §8。仮決め 9 点＝docs/tmp/v43_pre.md「MC2 の仮決め」（追補2 で追認）。

### 裁定330 追補2（2026-10-08 確定・相談役追認・v43 §3）MC2 の仮決め 9 点の追認

出典＝相談役引き継ぎ v43 §3（便 V-1 で収載・2026-10-08）。**本文（逐語）**: 「**330 追補2**＝MC2 の仮決め 9 点を追認（v43_pre.md「MC2 の仮決め」）。」
9 点＝docs/tmp/v43_pre.md「MC2 の仮決め」（逐語転記・docs/tmp は未追跡のため台帳が正）:
1. 店舗設定の 2 タブ＝?tab=features（利用機能・既定）／?tab=info（店舗情報）。利用機能＝SystemsBoard（sys_* 9＝「ノルマを使う」は sys_norms として含む・別トグルは作らない）＋売掛＋機能の公開（owner）＋勤務時間の計算基準＋キャスト画面の設定。
2. 店舗情報タブ＝店舗名・略称・店舗コード・表示名・送りの基本額・キャスト確認。**住所・電話・インボイス登録番号は端末・印刷 ＞ レシート・プリンタのまま**（set_store_receipt_profile の器＝二重編集を作らない・注記で導線）。送りの基本額は店舗情報に据え置き（控除・送り画面に注記あり）。
3. データ管理＝/master/store-profile?tab=data（権限・情報管理の入口のタブ）＝顧客情報の利用目的・保持年数・操作ログの保持（7 年固定の注記）。StoreProfilePanel に sections（profile／data／timeBasis／shift／ar・既定＝全節）を足して描く節を選ぶだけ＝フォーム・RPC・patchOf は不変。
4. 権限・情報管理の入口 href＝/master/cast-comp/register（キャスト会計の許可＝既存 page）。タブ＝キャスト会計の許可／データ管理／機密情報（/master/system#secrets）。新 route 0。
5. 旧 href は alias で解決（/master/cast-comp/systems・/master/system#features → 店舗設定／利用機能）。ページの描画は従来どおり（報酬制度ページは残る・system ページの「機能の公開」タブは撤去し案内行＋リンク）。
6. 料金・会計＝内側ピル撤去・「ルールで設定」ボタンは router.push(?tab=rules)。
7. 在庫（/master/stock）は引き続きナビ外（旧 17 href のうち 16 解決・在庫は null）＝「17/17 解決」は在庫を営業メニューと数える解釈。
8. /master/cast-comp（概要ページ）はナビ未登録のまま残す（カード 5 枚の文言は旧構成＝MC3 か撤去を裁定）。
9. 新 suite 段＝master-top 14（タブ構成・alias・店舗設定 3 面・system に機能の公開なし・内側ピルなし）。nav nv(5-1)／(5-2) 張替え。

適用＝MC2 の実装どおり（変更なし・client のみ・DB 恒久変更 0）。⑧ の /master/cast-comp 概要ページ（カード 5 枚の旧文言）の MC3 か撤去かは本追補の射程外＝引き続き裁定待ち。目視は v43 §4-2（Agoora・NG は X-13 に束ねる）。

## 裁定329（2026-10-01 確定・相談役・便 M5）スタッフの写真

出典＝相談役ブロック 2026-10-01（便 M5・ブロック内の裁定）。便「台帳記入＋0162 起草」で確定（0162 の範囲＝写真＋cast_contract_acks）。**本文（逐語）**:
「裁定329（スタッフの写真・ブロック内）:
- スタッフ（owner／manager／staff）もキャストと同じく写真を登録できる。保存先・縮小・権限の型はキャストと同一（新しい bucket や別経路は作らない）。
- 本人: 自分のプロフィール（キャストの /mine 相当の画面。無ければ店側ナビの「自分」節）から「写真を変更」。
- 店側: /staff のスタッフ詳細から owner／manager が登録・差替え・削除。/casts のキャスト詳細にも同じ操作を揃える（現状なければ追加・あれば不変）。
- 表示: スタッフ一覧・シフト（スタッフ枠）・担当や承認者の表示・お知らせの差出人など、キャスト写真を出している箇所と同じ場所にスタッフも出す。未登録はイニシャル表示（既存の挙動）。
- 削除時は Storage の実体も消す（キャストと同じ）。」

適用＝便 M5-0 読取（2026-10-01）: **client のみでは不可＝0162 要**。キャスト写真の器＝Storage bucket cast-photos・パス `{org_id}/{cast_id}.jpg`・policy 3 本（insert／update／select＝casts 表の id と filename を照合・owner∨manager 自店∨本人・delete policy なし）・casts.photo_updated_at（0064）・RPC set_cast_photo_updated_at（casts 限定）。users／memberships に写真列なし・削除経路（Storage remove）はキャストにも無い。0162 の中身＝便「台帳記入＋0162 起草」で起草（★1 users.photo_updated_at＋パス {org_id}/u_{user_id}.jpg・★2 Storage policy の users 腕＋delete policy 新設・★3 set_user_photo_updated_at／clear_cast_photo／clear_user_photo・★4 cast_contract_acks＋cast_contract_ack_self／cast_contract_ack_needed・★5 名簿＝非ゲート）。手貼りは Agoora・client は 0162 適用後（便 M5-1〜3）。

### 裁定329 追補1（2026-10-01 確定・相談役追認・便 P162）0162 の起草判断の追認

出典＝相談役ブロック 2026-10-01（便 P162）。**本文（逐語）**: 「329 追補1（相談役追認）: select policy 不触・contract_ack_rev は OFF→ON の切替時刻（clock_timestamp）・cast は u_ パス不可・clear_* RPC は null 戻しのみで実体削除は client から policy 経由。」

適用＝0162（下の欄）どおり。client（M5-1）: 削除＝storage.remove → clear_*（実体が残っても署名 URL は出ない）。

### 裁定329 追補2（2026-10-01 確定・相談役追認・便 MC2）M5 の仮決め 9 点の追認

出典＝相談役ブロック 2026-10-01（便 MC2 の直前）。**本文（逐語）**: 「329 追補2＝M5 の仮決め 9 点を追認（⑥の cast 向け 1 行は『上記の報酬条件を確認しました。条件が改定された場合は、この画面がもう一度表示されます。』に差替え）。」
9 点＝docs/tmp/v43_pre.md「M5 の仮決め」（①本人の写真＝「自分の情報」Modal ②削除＝storage.remove→clear_* ③/staff 編集 Modal ④/casts 詳細の削除 ⑤表示＝一覧・スタッフ枠（承認者・差出人は器なし） ⑥契約確認の文面 ⑦表示条件＝店 ON ∧ 未記録 ⑧rpc-err 2 語 ⑨suite staff-photo 12）。

適用＝便 MC2（lib/nox/mine/contract-ack.ts の 2 行目を差替え・staff-photo suite の pin を追従）。

**0162 の欄（本番適用済み・収蔵）**: supabase/migrations/0162_staff_photo_contract_ack.sql＝**sha256 e635d114ae50ce9f414e58ee23eb9ea2948145fc774af07bafc0d52d1c702a1d・523 行・37,533 B・突合 30 段 NG 0（docs/tmp/q1001_ag_0162.mjs・BEGIN…ROLLBACK）**・生成器 docs/tmp/gen_0162.mjs＋0162_template.sql・写経元 0162_live.json・期待 md5 0162_expected.json＝set_store_mine_settings 09595c7e／demo_org_reset a4bd6a18／新設 set_user_photo_updated_at 97a3da84・clear_cast_photo 22c0d2b2・clear_user_photo 372b28e5・cast_contract_ack_needed a7b2ca2f・cast_contract_ack_self e9dc61dd。器＝★1 users.photo_updated_at null 可（パス {org_id}/u_{user_id}.jpg・既存 bucket 同居）／★2 storage policy cast_photos_insert／update を drop→create（cast 腕・is_demo 句は live 逐語＋users 腕＝owner∨manager 自店∨本人（role owner／manager／staff＝cast は u_ 不可））・cast_photos_delete 新設（using＝update の using と同文）・select 不触／★3 RPC 3 本（非ゲート・authz は policy と同一式・audit 'set_user_photo'／'clear_cast_photo'／'clear_user_photo'）／★4 cast_contract_acks（cast_id・contract_rev・org_id・store_id・acked_at・PK (cast_id, contract_rev)・RLS select＝cast 本人∨owner∨manager 自店・grant SELECT のみ）＋set_store_mine_settings に ★3 行（contract_ack の false／欠損→true で settings_json.contract_ack_rev＝clock_timestamp()・白名単 8 不変）＋cast_contract_ack_needed／cast_contract_ack_self（cast セルフ・'not required'・冪等・audit 'cast_contract_ack'）／★5 grants（新設 5＝authenticated＋service_role・再作成 2 は live 再掲）・demo_org_reset 配列に cast_contract_acks（cast_quotas の直前に消し・直後に入れる＝80／78）。**本番適用＝2026-10-01・時刻不明（Agoora 申告・proof 302／82・users.photo_updated_at・cast_contract_acks 5 列を Agoora が確認）**・live 照合 docs/tmp/q1001_post_0162.mjs all_ok（2026-10-01T05:54:02Z＝関数 302／表 82・md5 7 本・不触 24 本・policy 4 本・demo 80／78・rev 行）。名簿 A 154／B 143→148＝302（課金ゲート対象 v1 に mig0162 追随・B(a) 5 本）。

## 裁定328（2026-10-01 確定・相談役・便 D0）デモ環境

出典＝相談役ブロック 2026-10-01（便 D0・ブロック内の裁定）。便「台帳記入＋0162 起草」で確定・追補1 を併載。**本文（逐語）**:
「裁定328（デモ環境・ブロック内）:
- デモは 6 店舗（MUSE／LUNA／NOIR／ACE／LILY／NEST）を公開の「触れる」環境として用意し、毎日 1 回（JST 05:00・営業日切替後）と手動で初期状態へ巻き戻す。
- 日付は投入時に「リセット日基準の相対日」へ変換する（当日＝営業中のライブ状態・先月＝9 月相当の全月実績）。固定日付は持たない。
- 先月分の伝票・打刻は日次目標（daily_sales_targets・shift_targets・cast_monthly_targets）に合うよう生成し、golden＝代表伝票 6 件の金額とバック・月次売上 43,740,000・報酬参考 13,648,300（±丸め）・ランキング参考。
- デモ org は課金ゲート外（既存の demo 区分に揃える）・owner のメール／パスワード変更不可・org 削除・Auth 系・外部送信（LINE／メール）なし・kiosk トークン固定・この制限は demo フラグで判定し本番 org には影響しない。
- 巻き戻しは ID 固定（UUID 対応表を payload に持つ）・二重計上 0・同時利用中でも完了する（トランザクション単位は org）。
- パッケージ側の保留 5 項目（多段ボーナス・指名ボーナス・pt 自動付与・新人保証の自動終了・時給スライド適用日）は投入対象外。
- 率は bps→NOX の単位へ変換・価格は税前値として投入。」

適用＝便 D0（2026-10-01・読取と設計のみ・DB 恒久変更 0）: 収蔵 docs/demo/source/20261001/（nox_demo_all.json・manifest・00_docs 8・06_validation 10＝21 ファイル・manifest sha 20/20 一致・validate.py は Downloads の完全展開で PASS 5,121 checks）・対応表 docs/demo/mapping_20261001.md・生成案 docs/demo/gen_plan.md・巻き戻し設計 docs/demo/reset_design.md・DEMO_USERS 案 docs/demo/demo_users.md。次＝相談役の追認（328 追補・確認点①05:00 と cutoff 06:00 の前後／②共通パスワードを置かない／③役割 4／④cast は代表伝票の受領者／⑤kiosk ユーザー）→便 D1（0162 起草・生成器）→Agoora の Auth 設定 4 点→D2（--apply・録画・LP）。

### 裁定328 追補1（2026-10-01 確定・相談役）D0 の確認点 5 つ

出典＝相談役ブロック 2026-10-01（便「台帳記入＋0162 起草」）＋同日のチャット（②入場方式）。**本文**:
「裁定328 追補1:
① 巻き戻しの時刻＝**JST 06:05**（cutoff 06:00 の後＝営業日切替後）。05:00 は改める。
② 入場方式＝**入口ページで店（6）×役割（owner／manager／staff／cast）のボタン 1 つでログイン・パスワード／メール入力なし・セッション 24 時間・kiosk は固定トークンの端末ページ。DEMO_USERS の共通パスワードは置かない（magiclink も使わない）。入口の実装は D1（0163 と同じ便）。**
③ 役割＝**4**（owner／manager／staff／cast・staff を入場 route に追加）。
④ cast のデモユーザー＝**代表伝票の受領者 6 名**（MUSE さおり／LUNA みさき／NOIR あべ／ACE ひなの／LILY みく／NEST ケン）に結線。
⑤ kiosk＝**店ごと 1 台・6 本固定**（録画に kiosk_devices を含めて ID 固定）。」

**D1 適用（2026-10-02）**: 上記の現在地 D1 のとおり（生成器・突合・6 店化・入口・制限・0163 起草）。②入場方式＝ボタン 1 つ（magiclink はサーバ内で消費・送信しない・24 時間は Auth 設定）・③役割 4＋端末・④cast＝代表伝票の受領者 6 名を users.cast に結線・⑤kiosk 6 台＝payload の kiosk_devices（auth_user_id＝DEMO_USERS の `<store>:kiosk`）。パッケージ側の不一致 5 点（v43_pre「D1 の不一致」）は 328 追補2 で裁定を求める。

### 裁定328 追補2（2026-10-08 確定・相談役・v43 §3）D1 の仮決め 15 点の追認＋golden 不一致 5 点の確定（check_20261002 の NG 5＝仕様差でクローズ）

出典＝相談役引き継ぎ v43 §3（便 V-1 で収載・2026-10-08）。**本文（逐語）**:
「**328 追補2**＝D1 の仮決め 15 点を追認。**golden 不一致 5 点は CC の優先順（売上 ±1% ＞ 指名 ＞ 在庫 ＞ ドリンク ＞ シャンパン）で確定**＝①NOIR シャンパン 59 本 ②在庫 sold の不足は closing 成立で可 ③ACE 同伴 1〜2 回不足は可 ④人数は予算優先 ⑤報酬参考 13,648,300 は D2 の正規経路（確定処理）で突合。check_20261002 の NG 5 は「仕様差」として記録しクローズ。」

15 点＝docs/tmp/v43_pre.md「D1 の仮決め」（逐語転記・docs/tmp は未追跡のため台帳が正）:
1. payload の形＝旧「録画」と同形（meta＋tables・日付は {$rel}／{$m,d}）。**月相対 {$m:-1, d}** を dateshift に追加（先月＝R の前月の同じ日・無い日は末日に畳む・fmt "ym" で 'YYYY-MM'）。固定日付を持たない（328）。
2. ID 固定＝source_id → uuid（sha1 v5 風・docs/demo/ids.json）→ 再生時に org ごと remapUuid（既存）。payload の users は meta.users（役割）→ demo org の users.id に写す（kiosk は auth user id）。
3. 伝票の total は lib/nox/check-calc の groupDueFull（check_group_due の鏡像）で計算して凍結＝再生後の三点一致（check-demo c 系で確認）。店設定＝外税（price_display 'tax_excluded'）・round_unit 1・down・tax_rounding floor・time_per 'person'（代表伝票のセット qty＝人数から）。
4. 先月の生成＝予算配分（セット→指名→在庫商品→キャストドリンク→延長→人数→汎用商品で ±0.5%）。固定行（代表伝票 6・48 ヘッダ＝「飲食代」1 行で gross に合わせる・LU-C001 の 7 来店）は先に置く。曜日依存の料金は**写像元（9 月）の曜日**で選ぶ（写像先の実曜日では引き直さない＝gen_plan §2 と違う・ランダム性を抑えるため）。
5. 指名は同じ種類だけを同じ伝票に（get_cast_ranking は checks.nom_type で数える）。指名のない店（MUSE／LILY／NEST）はバック順を参考（product_reward_target）に揃える後処理。
6. daily_reports は凍結値（生成値）で投入（正規経路 daily_report_close は呼ばない）。payroll_runs／payslips は投入しない（D2 の正規経路）。stock_logs は '入荷' の opening／received だけ（sale 行はトリガ再生成）。
7. memberships＝demo ユーザー 4 名（owner／manager／staff／cast）だけ。people の STAFF（9 名）のうち代表 1 名を staff ユーザーに結線・残り 8 名は users が無い（写真の結線先なし 3＝staff 9 のうち代表 6 名以外）。
8. kiosk＝店ごと 1 台（kiosk_devices.auth_user_id＝DEMO_USERS の `<store>:kiosk`・purpose punch）。入場は /demo の「端末（キオスク）で入る」→ /kiosk（kiosk ユーザーの magiclink をサーバ内で消費）。
9. 入場 route＝store 6 × role 4 ＋ kiosk・staff の初期画面は /register・入場ログ demo_entries（0163）は表が無い間 no-op・IP は sha256 先頭 16 桁・UA 200 字。セッション 24 時間は Auth 設定（Agoora）。
10. 日次リセットの起動＝0163 の pg_cron → pg_net → 既存 cron route（?org=<code>・6 job を 2 分おき・?retry=1 を 06:35・失敗は audit 'demo.reset.failed'）。URL と秘密は Vault（手順書）。
11. 1 MB 超の payload＝wipe → 分割 load（先頭 chunk＝マスタ＋当日・以降は日付群）。RPC は不変。
12. upload-photos の --apply（512px 縮小）は sharp が要る＝D2 で devDependency を足す（裁定要）。D1 は dry-run（47 件・sha）まで。
13. 既存 demo 入口の文言（毎朝 5 時）→「毎日 06:05」に統一（帯・規約・入口）。
14. 0163 の purge は 30 日（裁定293-7）・service_role 専用・audit に件数。demo_entries は demo_org_reset の c_load に入れない（ログは reset で消えない）。
15. 突合（check-demo）は仮 org を tx 内に作って demo_org_reset を流す（本物の demo org は D2 まで無い）。

golden 不一致 5 点（docs/tmp/v43_pre.md「D1 の不一致」の逐語＋本追補の確定）:
1. **NOIR シャンパン 108 本**: 生成 59/108（高額 5 銘柄が置けない）。セット（人数分・8,000〜14,000）＋指名料で月次 13,680,000 の 8 割を使うため、シャンパン 108 本（約 900 万円）は同じ月次に収まらない。優先順＝売上 ±1% ＞ 指名回数 ＞ 在庫 ＞ キャストドリンク ＞ キャスト別シャンパン で縮小。→ **確定 ①＝59 本で可**（カフェ・ド・パリ 14・モエ 24・ヴーヴ・クリコ 20・ドン・ペリニヨン 1＝check_20261002 の生成値）。
2. **在庫 30 商品の sold＝目標**: luna 1 商品（ドン・ペリニヨン）・noir 5・ace 5 が不足（同じ理由）。closing は opening＋received−sold で整合（在庫 golden の式は成立・値が目標と違う）。→ **確定 ②＝closing の式が成立していれば可**（sold の目標値との差は仕様差）。
3. **ACE の同伴回数**: 5 名で 1〜2 回不足（予算）。本指名／場内は全店一致。→ **確定 ③＝可**（ひなの 8/9・るな 5/6・あい 3/4・めい 1/2・もも 2/3）。
4. 人数（guests_target）は予算優先で縮小（1 人基本＋余りを配る＝guestsShort muse 126／luna 186／noir 292／ace 289／lily 211／nest 0）。→ **確定 ④＝予算優先**（人数は golden に含めない）。
5. 報酬参考 13,648,300 は payroll（D2 の正規経路）＝本便の突合対象外。→ **確定 ⑤＝D2 の正規経路（payroll_finalize＝確定処理）で突合**（±丸め＝裁定328 本文）。

クローズ＝docs/demo/check_20261002.md の NG 5（luna 在庫 sold 不足 1／noir 在庫 sold 不足 5／noir シャンパン 59/108／ace 在庫 sold 不足 5／ace 指名回数（同伴）不足 5 名）を**仕様差として記録しクローズ**（同ファイル末尾に 2026-10-08 の注記）。D2 の再突合（0164 後の columns 取り直し→gen-demo 再実行→check 83 段）では、この 5 段は「仕様差（328 追補2）」の既知 NG として扱い、**それ以外の NG が 0** であることを合格条件とする（v43 §4-1「NG は仕様差 5 のみ」）。生成器の優先順（売上 ±1% ＞ 指名 ＞ 在庫 ＞ キャストドリンク ＞ キャスト別シャンパン）は本追補で確定＝以後は変えない。

適用＝D1 の実装どおり（変更なし）。⑫ の sharp は裁定335 で確定（D2 で devDependency）。

### 裁定328 追補3（2026-10-08 確定・相談役追認・便 D2-a）gen-demo の jsonb 補完・check の日付化・payload sha 6 店

出典＝相談役ブロック 2026-10-08（便 D2-a A-5）。**本文（逐語）**: 「328 追補3＝gen-demo jsonb 補完・check 日付化・payload sha 6 店。」
内容（便 P163 の仮決め 3 点の追認）: ①gen-demo の行補完で jsonb 列の default を実値で写す（0164 の payment_methods／punch_methods が {} にならない・'…'::jsonb を JSON.parse・失敗時は従来どおり {}／[]）。②check-demo の出力先を日付付き docs/demo/check_<YYYYMMDD>.md に（20261002 はクローズ節つきの記録として残す・20261008＝0164 後の再突合 83 段 NG 5＝仕様差のみ）。③0164 後の columns 取り直し→再生成で payload の sha が 6 店とも更新＝muse 7274d138／luna dd865507／noir f11afccb／ace 239fbb91／lily e88b5c5f／nest 152c6f0a（rows 不変・bytes 1,196,339／1,836,141／2,009,082／1,889,594／2,562,132／2,806,486）＝demo-payload dp(1-1) は _report.json から自動追随。

適用＝72c7e29（便 P163）どおり。

### 裁定328 追補4（2026-10-08 確定・相談役・便 D2-b）デモのセッション 24 時間＝アプリ側の cookie で区切る

出典＝相談役ブロック 2026-10-08（便 D2-b B-1・逐語）。**本文（逐語）**: 「24h cookie（328 追補4）: app/api/demo/enter/route.ts に httpOnly・Secure・SameSite=Lax の cookie nox_demo_until＝入場時刻＋24h を設置／lib/supabase/middleware.ts で demo ユーザー（DEMO_USERS の uuid）かつ cookie 期限切れ or 欠落なら signOut→/demo?expired=1／/demo に「お試しは 24 時間で終了します。再度入場できます」文言／suite demo-guard に 2〜3 段（期限内通過・期限切れ遮断・非デモユーザー非影響）。本番ユーザーの経路に影響しないことを段で示す。」
背景＝Supabase Free は Time-box user sessions が使えず refresh token が無期限＝Access token expiry 86400 だけでは 24 時間で切れない（便 D2-a A-2）。

適用＝便 D2-b（2026-10-08・client のみ・mig 不要）: 新規 lib/nox/demo/session.ts（Edge 安全＝fs を使わない・DEMO_UNTIL_COOKIE／DEMO_SESSION_MS 24h／parseDemoUsers（seed.ts から移動・seed.ts は再 export）／isDemoAuthUserId／demoUntilValue／demoSessionExpired（欠落・非数値・≦now・24h 超は期限切れ）／demoUntilCookieOptions（httpOnly・Secure は https のとき・SameSite=Lax・path=/・maxAge 86400）／isDemoSessionExemptPath（/demo・/api/demo/*・/auth/*））。入場 route＝redirect レスポンスに cookie を載せる。middleware＝getUser 後に「デモユーザー ∧ 除外パス外 ∧ 期限切れ」で signOut→/demo?expired=1（sb-* cookie の破棄を redirect に写し・nox_demo_until も削除）。/demo＝DEMO_SESSION_JA の 1 行＋ ?expired=1 のとき client 部品 DemoExpiredNote（useSearchParams＋Suspense・page は force-static のまま）。suite＝demo-guard dg(7-1)〜(7-3)（24→27・純関数の挙動＝期限内 false／期限切れ・欠落・壊れた値・24h 超 true・非デモ id／env 無し／壊れた env は false＝本番ユーザー非影響・route／middleware／page の逐語 pin）。
同便の付随＝★写真の再打刻: payload の casts.photo_updated_at は null（写真の有無は DB 列）のため reset のたびに写真が消える→lib/nox/demo/seed.ts afterResetHooks を結線（Storage cast-photos/{org_id}/ の実体から casts／users の photo_updated_at を admin で now() に・失敗しても reset は止めない）＝demo-payload dp(6-5)。upload-photos --apply を結線（sharp 512px q85・EXIF 回転・Storage upsert・photo_updated_at 打刻・demo org（is_demo）だけ・staff は users.email demo-<店>-staff@nox-demo.local で結線）＝dp(6-3) 張替え。

### 裁定328 追補5（2026-10-08 確定・相談役追認・便 D2-c）afterResetHooks（写真の再打刻）と upload-photos --apply の結線の追認

出典＝相談役ブロック 2026-10-08（便 D2-c C-6）。**本文（逐語）**: 「328 追補5（afterResetHooks・upload-photos 結線の追認）。」
内容＝便 D2-b の付随 2 点を追認: ①lib/nox/demo/seed.ts afterResetHooks＝reset のたびに Storage cast-photos/{org_id}/ の実体から casts／users の photo_updated_at を admin で now() に（payload の null を上書き・失敗しても reset は止めない）。②scripts/demo/upload-photos.mjs --apply＝sharp 512px q85・EXIF 回転・Storage upsert・photo_updated_at 打刻・demo org（is_demo）だけ・staff は users.email demo-<店>-staff@nox-demo.local で結線。
実証（便 D2-c）＝初回 reset（cron route）後に casts.photo_updated_at **38 件**（MUSE 5／LUNA 7／NOIR 8／ACE 7／LILY 6／NEST 5）・署名 URL 200 image/jpeg（NOIR 2 件を fetch）。

**便 D2-c の実測（2026-10-08・DB 恒久変更 0・once job は作って消した）**:
- C-0＝本番 /demo 200・POST /api/demo/enter（muse:staff）303→/register・Set-Cookie＝nox_demo_until（Path=/・Max-Age=86400・Secure・HttpOnly・SameSite=lax・残り 24.00h）＋sb-*-auth-token・signOut 303→/login。★初回 reset 前は /register・/mine が 307→/login（memberships は payload が供給＝0 行）→ reset 後に再確認: muse:staff→/register 200・muse:cast→/mine 200・muse:owner→/dashboard 200（staff／owner の /mine 307 は role gating＝正）。
- C-1＝1 回目（05:32:00Z）は **401**＝Vault nox_cron_secret がプレースホルダ「<Vercel env CRON_SECRET と同じ値>」のまま（len 29・非 ASCII 4・完全一致 true）→Agoora 差替え（len 40・ascii_ok・05:47Z）→2 回目（05:55:00Z）**200** {ok:true,count:1,results:[NOX-DEMO-MUSE wipe+load chunks 3]}・demo_reset_at 05:55:11Z・**cron.job 8 に復帰・once 0**（両回とも確認）。CRON_SECRET＝Vault の一致を証明。
- C-2＝★手動経路（POST /api/demo/reset）は memberships が無い org では auth_org_id null→403＝**初回 reset は cron route（同ヘッダ GET＝route 冒頭コメントの手動起動）でのみ可**（luna／noir／ace／lily／nest 各 200・wipe+load 3〜4 chunk・6〜10 秒）。MUSE の手動経路＝200（06:07:48Z・wipe+load・rows 2,065・hooks photos casts 5／users 1＝10 分間隔の 429 を経て成功）。6 org とも demo_reset_at＝当日・memberships 4／org・audit demo.reset 26 行（wipe 6＋load 20＝chunk 数と一致）・demo.reset.failed 0・casts 38＝写真打刻 38・署名 URL 200。
- C-3＝/api/payroll/preview（owner・2026-09・正規経路の再計算＝finalize と同じ computePayrollDraft）: MUSE 1,138,650（参考 913,700・+224,950）／LUNA 2,920,845（2,607,300・+313,545）／ACE 2,516,405（3,172,000・−655,595）／LILY 1,798,720（1,364,800・+433,920）／NEST 1,192,667（985,000・+207,667）／**NOIR 500「get_cast_sales: canceling statement due to statement timeout」**（→0165 適用後＝便 P165: NOIR **200・gross 5,497,431**（こころ込み・除外後 5,240,207・参考 4,605,500・+634,707）・6 店計 15,064,718）。5 店計 9,567,287 vs 参考 9,042,800（13,648,300−NOIR 4,605,500）。切り分け＝**仕様差 3 系統＋バグ 1 件**: ①時間＝payload の打刻（実働 h が参考 hours_input より +2〜9h・ACE は売上スライドで時給が下がる）②バック＝参考 product_reward_input は算術参考（NOX は products.back 率×実売＝MUSE／LILY／NEST は 2 倍前後・ACE はシャンパン縮小で下）③ボーナス＝参考 bonus_from_proposed_rules は保留 5 項目（328 本文＝投入対象外）→NOX 0。参考値自体が record_status 'arithmetic_reference_only'（伝票・勤務明細との突合未・割増未反映）＝**±1,000 円の一致は成立しない＝仕様差として記録・gen_plan §4 の「報酬参考 ±店別 1,000 円」は撤回候補（起票）**。④**バグ（起票候補）＝get_cast_sales(store, 2026-09-01, 09-30) が NOIR（closed 501 件）で Execution Time 8,625 ms（owner JWT 文脈・1 週間なら 744 ms）＞authenticated の statement_timeout 8s＝月次の給与プレビュー／確定が 500**。本番でも月 500 伝票級の店で再現する＝第 1 期で要対応（index か集計の書換え・修正は別便）。
- C-4＝check-demo 83 段 NG 5（仕様差のみ）＋live 6 org の先月 Σdaily_reports 全店 ±0.2%（docs/demo/check_20261008.md 判定節）。
- C-5＝docs/demo/visual_check_20261008.md（MUSE 全 role 29 項目・残り 5 店 owner 15 項目・共通 3）。

### 裁定328 追補6（2026-10-08 確定・相談役・便 G1）D2-c の切り分けの追認＝報酬参考は仕様差・初回 reset は cron route・get_cast_sales は起票100

出典＝相談役ブロック 2026-10-08（便 G1 G-4＝「328 追補6」の指示・本文は便 D2-c の報告を CC が起こした＝相談役の文言差替え可）。**本文**:
「328 追補6＝①報酬参考 13,648,300（店別・こころ除外）は source の record_status 'arithmetic_reference_only'（hours_input×時給＋指名＋product_reward_input＋保留 5 項目のボーナス）であり、NOX の正規経路（payload の打刻・products.back 率×実売・保留 5 項目なし）の gross とは一致しない＝**仕様差として確定**・gen_plan §4 の「報酬参考 Σ gross ±店別 1,000 円」は撤回（golden からは外し参考値として残す）。②デモ org の初回 reset は cron route（Authorization: Bearer CRON_SECRET の GET か once job）＝帯の手動経路は memberships（payload が供給）の後のみ（cron_setup §3 に注記済み）。③NOIR の給与プレビュー 500（get_cast_sales の statement timeout）は**起票100**として読取（便 G1）→裁定後に 0165（便 G2）。」

適用＝docs のみ（gen_plan §4 の撤回は次回の docs 便で本文へ反映）。

**0163 の欄（本番適用済み・収蔵＝便 P163・2026-10-08）**: supabase/migrations/0163_demo_entries_cron.sql＝**sha256 f5b8bc61d6928a6f91ed2b5611c7084fca100907d7dfb22ad48a0a2fc3973530・104 行・9,887 B・突合 16 段 NG 0（docs/tmp/q1002_ag_0163.mjs・BEGIN…ROLLBACK・文単位）**・生成器 docs/tmp/gen_0163.mjs＋0163_template.sql・写経元 docs/tmp/0163_live.json・期待 md5 docs/tmp/0163_expected.json＝demo_entries_purge fdc33bb7・不触 demo_org_reset a4bd6a18／audit_purge f2946b95。中身＝pg_cron（pg_catalog）＋pg_net（extensions）／demo_entries（RLS・policy 0・service_role の select／insert のみ＝4 ロール revoke）／demo_entries_purge（30 日・audit 'demo.entries.purged'・service_role 専用）／cron 8 job（reset 6＝UTC 21:05〜15・retry 21:35・purge 20:15・Vault 参照・冪等）。手貼り後に赤になる段＝docs/tmp/0163_pre.md §4（grants／anon-guard／billing／0158）。★教訓候補→**教訓103 で採番（2026-10-08・便 P163）**: 生成物を 1 文字列で流すと pg_cron の create extension を含む並びで 25P02＝突合は文単位で流す（SQL Editor の手貼りは文単位＝影響なし）。 **本番適用＝2026-10-08・時刻不明（Agoora 申告「不明」で確定・恒久注意）**・Agoora 申告 proof＝orgs 3・cron_jobs 8・demo_entries あり・RLS true・demo_entries_purge fdc33bb7・demo_org_reset a4bd6a18・関数 303／表 83。live 照合＝docs/tmp/q1008_post_0163_0164.mjs **all_ok（2026-10-08T02:20:44Z）**＝cron 8 job の schedule／active／Vault 参照／https 直書き 0・demo_entries RLS t・policy 0・grant service_role INSERT／SELECT のみ・7 列・purge の EXECUTE service_role のみ＋SECURITY DEFINER・md5 4 本（demo_entries_purge fdc33bb7／demo_org_reset a4bd6a18／audit_purge f2946b95／set_store_profile 2e7b4963）・関数 303／表 83／'billing locked' 154／述語参照 155・RLS 有効表 83。収蔵＝sha256 f5b8bc61d6928a6f91ed2b5611c7084fca100907d7dfb22ad48a0a2fc3973530・9,887 B・104 行（台帳方式＝split('\n')）／103 行（wc -l・末尾改行あり）。名簿 A 154／B 148→**149**＝**303**（B(a) +1 demo_entries_purge・docs/NOX_課金ゲート対象_v1.md mig0163 追随）。suite 張替え＝grants（TABLES +demo_entries・G4e 0163 purge ACL）／anon-guard（probe demo_entries_purge＝anon・authenticated 両 BLOCKED・表 demo_entries anon DENIED）／billing（除外 149）／0158（関数 303／表 83）。

mig の範囲＝**0162＝写真（裁定329）＋cast_contract_acks（326 追補7-6）**・**0163＝デモ cron（pg_cron→pg_net）・Vault・入場ログ（293-7）＝便 D1**。現状の入場 route（app/api/demo/enter）は generateLink(magiclink)→verifyOtp をサーバ内で完結（メール送信なし）＝②の「magiclink も使わない」は D1 で route を改める（セッション 24 時間の発行方式は D1 の設計）。

## 裁定327（2026-09-30 承認・Agoora）打刻の順序検査＝0008 決定1「盲目記録」を退役

出典＝Agoora 指示（2026-09-30・0161 起草便で受領・便 P161 で収載）。次の裁定番号は 328。**本文（逐語）**:
「裁定327（打刻の順序検査・0008 決定1「盲目記録」を退役）:
- punch_self（および kiosk 等、cast の打刻を記録する全 RPC。まず一覧を報告）に順序検査を入れる。判定単位は当該店の当日営業日（既存 biz_date 規則）。
- 出勤: 当日営業日に未閉鎖の出勤があれば 'already in'、当日営業日に閉鎖済みの対があれば 'already out'（同一営業日の再出勤は不可）。
- 退勤: 当日営業日に未閉鎖の出勤がなければ 'no open punch'。
- 前営業日以前の未閉鎖出勤は今日の打刻を塞がない。閉鎖は店の修正で行う。注意行の器（0159 の payroll_attentions 系）に 'open_punch' として出す。既存の kind に収まらなければ 0161 で kind を足す。
- 店側の打刻修正（owner／manager の行編集）は順序検査の対象外。
- cast 本人の取消は無し。修正は punch_correction_request 経由（M1 の出し分け）。
- 拒否は rpc-err の既存様式（'already in'／'already out'／'no open punch'）。和文は M1 で client に付ける。」

### 裁定327 追補1（0161 起草判断・2026-09-30 相談役追認）

出典＝相談役追認（2026-09-30・便 P161 で収載）。0161 事前読取（docs/tmp/0161_pre.md）の ★指定 5 点への裁定。**本文（逐語）**:
「裁定327 追補1（相談役追認）: run_id null 可・punch_proxy も対象・kiosk は raise・open_punch は手動 resolve。0008 決定1 は退役（台帳に「327 により退役」と記す）。」

**0008 決定1「盲目記録」（in-in／孤立 out もそのまま記録・本文の所在＝supabase/migrations/0008_f1d_shift_schema.sql 119 行・docs/NOX_データモデル設計_Supabase版.md 217 行・payOf 精密仕様 192 行 S1）＝裁定327 により退役（2026-09-30・0161 本番適用）**。退役するのは「RPC がシーケンスを検証しない」の部分＝新規打刻を RPC で拒否する。punch-match.ts の S1／S2（既存行の解決規則）は不触＝過去行の in-in／孤立 out はそのまま解決する。

0161-0 読取（docs/tmp/0161_pre.md）: 打刻を書く RPC＝punch_self／punch_proxy／kiosk_punch（順序検査の対象）・punch_correction_apply（店側修正＝対象外）の 4 本（demo_org_reset は payload 投入のみ）。payroll_attentions の kind は 'post_finalize_punch' の 1 値のみ・run_id NOT NULL が壁（打刻時点では期間の run が無い）→ 追補1 で null 可。

適用＝0161_punch_sequence（2026-09-30 本番適用・Agoora 手貼り・**適用時刻は不明で確定（Agoora 申告「不明」・便 M1-0）**・live 照合 all_ok 17:26 JST）。
**0161 の欄（本番適用済み・収蔵）**: supabase/migrations/0161_punch_sequence.sql＝**sha256 b45e966180224778f08a26315c1a5df4975898dd298dafd16187d496616b7017・327 行・20,817 B・突合 24 段 NG 0（docs/tmp/q0930_ag_0161.mjs・BEGIN…ROLLBACK）**・生成器 docs/tmp/gen_0161.mjs＋0161_template.sql・写経元 0161_live.json・期待 md5 0161_expected.json＝punch_self 952f18a4／punch_proxy a760e1a4／kiosk_punch 5a1d5f10／payroll_attentions_of 3721bf4e／punch_seq_check f5fd8b84（新設・内部専用・4 ロール revoke）。器＝★1 payroll_attentions の run_id null 可（FK cascade 不変）・kind CHECK ('post_finalize_punch','open_punch')・open_punch_ck（detail に punch_id／biz_date）・部分 unique（1 打刻 1 行・競合は on conflict do nothing）／★2 punch_seq_check（当日営業日の最終打刻で 'already in'／'already out'／'no open punch'・前営業日以前の未閉鎖 in は塞がず注意行 'open_punch'＋audit 'punch_open_attention'・run があれば run_id）／★3 打刻 3 本の insert 直前に perform 1 行（punch_self は 0008 決定1 のコメント行を差替え）／★4 payroll_attentions_of が run 未作成時に積んだ open_punch を期間で拾う／★5 grants。proof＝関数 297／表 81・'billing locked' 154 不変・名簿 A 154／B 143＝297。pin＝0158（out 始まりの段は in→out）／daily-pay（in→out→out は 'no open punch' を期待）／rls（in-in は 2 度目 'already in'）／anon-guard（probe +1・段35 は out）／grants（G4c 内部 +1・G9 0161）／billing（除外 143）／新規 suite punch-sequence。

## 裁定326（2026-09-30 承認・Agoora）/mine の再構成と店設定化

出典＝Agoora 承認（2026-09-30・便 C-0 で収載）。次の裁定番号は 327。**本文（逐語）**:
「裁定326 /mine の再構成と店設定化（2026-09-30 承認・Agoora）
326-1 店設定 mine_settings（owner／manager・settings_json）: payslip_visibility 'off'（既定）／'net_only'（手取りのみ）／'detail'（明細まで）、drink_claim 'off'（既定）／'on'、punch_correction_request 'off'（既定）／'on'、ranking 'off'（既定）／'on'、ranking_show_others 'off'（既定）／'on'（ranking 'on' のときのみ有効）、reservation_request 'on'（既定）／'off'。
326-2 /mine から報酬シミュレーターと今月のバックの 2 カードを削除。
326-3 ノルマ進捗: cast の「目標を設定」を廃止。店がキャスト別・月別に本指名件数・場内件数・同伴件数・売上額の 4 項目を設定（未設定項目は出さない・全項目未設定なら非表示）。/mine は当月実績÷ノルマの達成率を項目ごとに表示。実績の集計は指名ランキングと同じ源（本指名・場内・同伴）＋売上は既存の月次売上集計。
326-4 指名予約・同伴予約の申請: cast が /mine から 顧客（候補表示・裁定321 と同じ）・日時・種別（本指名／同伴）を申請 → status 'pending' → 店（owner／manager／レジ権限 staff）が承認・却下 → 承認済みだけが「指名予約（今日以降）」と店側の予約一覧に載る。店側の予約一覧に「承認待ち」タブ。却下は理由任意。
326-5 今月の勤怠に出勤・退勤の打刻時刻を表示（「M/D 出勤 hh:mm〜hh:mm」・退勤未打刻は「〜」）。
326-6 お知らせ未読: cast ごとの既読を持ち、未読 N 件ならナビと /mine の見出しに「お知らせ（N）」。開いたら既読。
326-7 希望タブは「シフト希望」に改名。店設定 shift_request_mode 'shift'（既定・現行）／'off_only'（休み希望）。off_only ではタブ名「休み希望」・cast は休みたい日だけ提出・提出のない日は出勤可能として店の確定案に載せられる（裁定58 の前倒し）。（注記・2026-10-13 便 SX-1: 裁定58 は欠番（裁定50〜60 欠番・2026-08-25）。290-5／326-7 の「休みだけ提出（裁定58）」は本項＝shift_wishes.kind 'off'（0160）を指す）
326-8 ranking 'off' の店では /mine のナビ項目とランキングページを出さない（直 URL は /mine へ）。drink_claim／punch_correction_request 'off' も同様にカードを出さない。
326-9 器＝0160: cast_quotas（org・store・cast・month・4 項目・NULL 可）＋set_cast_quota RPC／予約表に status・requested_by_cast・rejected_reason＋cast 用 RPC reservation_request と店用 reservation_decide／cast_notice_reads（cast×notice）＋既読 RPC／settings_json +7 キー（白名単か専用 RPC は起草時に裁く）。起票95（枠マスタ無効化）・96（T6 契約確認）と同乗。」

適用＝未着手（0160 ★起草の入力＝便 C の後の R160 事前読取 docs/tmp/0160_pre.md → 追補1 で ★指定 6 点を確定 → 便 D160 で起草）。

### 裁定326 追補1（0160 起草判断・2026-09-30）

出典＝Agoora（2026-09-30・便 D160-1 で収載）。R160 事前読取（docs/tmp/0160_pre.md）の ★指定 6 点への裁定。**本文（逐語）**:
「裁定326 追補1（0160 起草判断・2026-09-30）
1 予約申請の承認者＝reservation_create と同じゲート（owner／manager／レジ権限 staff＝can_crm）。can_register は含めない。
2 ノルマは新表 cast_quotas（本指名・場内・同伴・売上の 4 項目・NULL 可）。既存 cast_norms は表・読取とも残し、cast の自己設定 set_cast_norm_self は削除。/mine の目標カードは cast_quotas のみを読む。
3 休み希望は shift_wishes に kind（work／off）を足す形。'off' は時刻 NULL。確定案の候補条件（提出のない日＝出勤可能）は client（autoassign 純関数）で反転。
4 mine_settings は専用 RPC set_store_mine_settings（owner／manager）・8 キー（326-1 の 6＋shift_request_mode＋contract_ack）。set_store_profile の白名単は不変。
5 cast の予約申請は自分の担当客の中から（customer_list_summary と同じ判定）。新規顧客の登録は不可（追補2-5 のまま）。
6 名簿区分＝店設定系 4 本は A・予約 2 本は reservation_create と同区分・notice_mark_read は B（cast セルフ）。」

0160 のスコープ（追補1＋便 D160 の ★1〜★8）: ★1 cast_quotas＋set_cast_quota／★2 set_cast_norm_self を revoke→drop／★3 reservations の status +pending・rejected・列 +4（requested_by_cast／rejected_reason／decided_by／decided_at）＋reservation_request（cast セルフ）／reservation_decide／★4 shift_wishes +kind（work／off・off は時刻 NULL）＋submit に p_kind／★5 set_store_mine_settings（8 キー・contract_ack＝起票96）／★6 cast_notice_reads＋notice_mark_read／★7 staff_shift_patterns +disabled_from＋staff_pattern_disable／enable（起票95）／★8 demo_org_reset に 2 表。名簿＝A +4（set_cast_quota／set_store_mine_settings／staff_pattern_disable／enable）・予約 2 本＝A3（reservation_create と同区分）・B +1（notice_mark_read）・A −1（set_cast_norm_self drop）。

### 裁定326 追補2（0160 起草判断・2026-09-30 承認）

出典＝Agoora 承認（2026-09-30・便 S160-1 で収載）。便 D160 の起草判断 5 点への追認。**本文（逐語）**:
「裁定326 追補2（0160 起草判断・2026-09-30）
1 shift_wish_decide と shift_auto_apply は kind='off' の wish を accept／自動配置しない（'off wish' で拒否・reject は可）。shifts の時刻 NULL を作らないため。
2 staff_pattern_effective（内部・staff_shift_propose／staff_wish_set が呼ぶ）に disabled_from is null or disabled_from > p_biz_date を追加。枠マスタ一覧の絞りは client。
3 reservation_request は reservation_create と同区分 A3（課金ゲート適用）。created_by＝cast の user_id。decided_by／decided_at を持つ。
4 shift_wish_submit は 4 引数（p_kind default 'work'）に置換（旧 3 引数は drop）。既存呼出は同値。
5 他 org の manager が staff_pattern_disable／enable を呼ぶと feature_disabled:staff_shift（staff_shift_gate の既存挙動・不変）。」

適用＝便 D160-2 の起草どおり（改稿なし）。

### 裁定326 追補4（便 M1 の判断・2026-10-01 相談役追認）

出典＝相談役追認（2026-10-01・便 M2-0 で収載）。便 M1（7c6e6f3）で CC が仮決めした 3 点の追認。**本文**:
「裁定326 追補4（M1 の判断）: ① ranking OFF の店では /mine の指名ランキングカードも非表示（ナビ項目・ランキングページと同じ扱い）。② /mine の layout に自店 settings_json の読取 1 本を足す（ナビの出し分け用・page 側は既存の店読取に相乗り）。③ 給与画面の要対応（打刻）の描画条件は「run があれば」（open_punch は下書きの run にも積まれる＝status で絞らない）。」

326-1 への補記（便 M2-0・意味の変更なし・326-7／起票96 からの転記）: shift_request_mode の既定は 'shift'（'shift'／'off_only'）・contract_ack の既定は false（boolean・T6 契約確認の記録）。

適用＝便 M1（7c6e6f3）どおり。便 M2 の仮決め（/mine 再構成の見た目・文言・並び）は便 M2 の最終報告に一覧＝追補5 で追認。

### 裁定326 追補5（便 M2 の仮決め 9 点の追認・2026-10-01 相談役追認）

出典＝相談役追認（2026-10-01・便 M3-0 で収載）。便 M2（626fabc）の最終報告の仮決め一覧をそのまま追認。**本文**:
「裁定326 追補5（M2 の仮決め）: ① ノルマの目標 0 は NULL と同じ「目標なし」（進捗に出さない）・達成率は切捨て・100% 超もそのまま・バーは 100 で止める。② 店側の月選択は今月／翌月の 2 択（月＝casts-board 既存の month）・空欄保存で全項目 NULL に戻せる。③ /mine のノルマカードは店設定 sys_norms（269-4）の出し分けを据え置き・旧 norm-set route は削除。④ 勤怠は当日「出勤 HH:MM／退勤 HH:MM」1 行・一覧は打刻のある日だけ新しい日が先・実働は dayWorkedHours（確定シフトのある日だけ・退勤なしは —）・シフトのない日の in／out は出す。⑤ 当月の打刻を 1 本で読み当日分を絞る・shifts は当月初から 1 本（直近 7 件はそこから）。⑥ 明細 'net_only' の PDF は同じ DOM の印刷・マイナンバー廃棄済みの注記は明細カードの外。⑦ お知らせの既読は一覧を開いた時点で未読分を一括記録・開いた回は「新着」・未読数は notices と cast_notice_reads の 2 本読み。⑧ rpc-err に 'bad quota'／'bad month'・入力検証の和文は quotaArgsOf。⑨ verify-nox-payroll の fixture の cast_plan は valid_from 2020-01-01 に固定（教訓46 の実例）。」

適用＝便 M2（626fabc）どおり。

### 裁定326 追補6（便 M3 の仮決め 9 点の追認・2026-10-01 相談役追認）

出典＝相談役追認（2026-10-01・便「台帳記入＋0162 起草」で収載）。便 M3（a6eea90）の最終報告の仮決め一覧（docs/tmp/v43_pre.md §M3）をそのまま追認。**本文**:
「裁定326 追補6（M3 の仮決め）:
1. 申請の入力は担当客・来店日・来店予定時刻・区分の 4 つ。人数・備考は RPC（4 引数）に無いため送らない＝注記「人数や卓の希望も店で設定します」。
2. 申請の取消 RPC は無い＝取消ボタンを出さず「申請の取消・承認後の変更は店にご連絡ください」。
3. 来店日時は今より後だけ（client 検証）・日付欄の min は当日営業日。区分の既定＝本指名。時刻の既定＝20:00。
4. 自分の申請一覧＝requested_by_cast が入っている行（RLS で cast_id＝自分）・承認待ちを先→来店日時の新しい順・最大 20 件・却下は理由を併記。承認済みは既存の「指名予約（今日以降）」にも出る（重複表示は許容）。
5. 店側＝既存の予約一覧の状態絞り込みに「承認待ち（N）」「却下」を足す（別ページ・別タブ構造は作らない）。「すべて（取消を除く）」は承認済みの予約だけ（pending／rejected を除く）。件数バッジは日付バーの絞りに関係なく全件。
6. 却下の理由は UI で必須（RPC は任意）・200 字。承認は確認ダイアログなし（1 タップ）。
7. 承認者の出し分けは既存の showReserve（owner／manager／staff can_crm）に乗せる＝新しい権限判定を client に書かない（RPC が最終防御）。
8. rpc-err に 'bad customer'／'bad reserved_at'／'bad decision'／'not bookable' の和文。パネル側の局所写像にも 'not pending'／'bad decision'／'bad reason'／'billing locked'／'forbidden' を追加。
9. 承認／却下の結果の通知は無し（cast は申請一覧の状態で見る＝LINE 通知と同じ束で第 2 期）。」

適用＝便 M3（a6eea90）どおり。

### 裁定326 追補7（便 M4 の仮決め 8 点の追認・2026-10-01 相談役追認）

出典＝相談役追認（2026-10-01・便「台帳記入＋0162 起草」で収載）。便 M4（30bfb7e）の最終報告の仮決め一覧を追認。6 は 0162 送り・8 は教訓101 へ。**本文**:
「裁定326 追補7（M4 の仮決め）:
1. 'off_only' の提出＝shift_wish_submit(p_date, null, null, 'off')。時間欄（一括・日別）を出さず、選択日の印は「休み」。提出済み一覧・フォーカス行の時間は「休み」。
2. ページ文言: 'shift'＝「シフト希望／希望を提出・審査状況を確認／希望を提出」・'off_only'＝「休み希望／休みたい日を提出・審査状況を確認／休みたい日を提出」＋説明 1 行。ナビも同じ語（「希望」→「シフト希望」／「休み希望」）。/mine の「＋ 希望を提出」リンクの文言は据え置き。
3. autoassign の候補反転＝アダプタ candidateWishesOf（純関数）。'off_only' は期間の各日×各 cast で off（pending／accepted）の無い組を仮想 wish（既定の帯時間・id "virtual:<cast>:<date>"）にする。仮想 id は shift_auto_apply に渡せない＝確定案にするときは shift_bulk_set（placementsOfVirtual）。自動配置 UI は裁定112-A で撤去済み＝呼び出し側は無い（アダプタのみ・計算本体は不触）。
4. 枠の無効化＝翌月以降の月初 3 か月から選ぶ（SegSelect）。無効化済み行は effectivePatterns から外れる（RPC と同じ条件を client の同関数に 1 行足した＝配置フォームの候補からも消える）。過去行は対象外。取消＝staff_pattern_enable。
5. T6 contract_ack＝店単位の boolean（0160）。料金マスタの手数料節に「加盟店契約の確認（記録）」OFF/ON を置き、手数料の有効化保存でチェック済みなら自動で ON。改定日の列は無い＝改定時は店が OFF→ON で再確認（手動）。記録済みの店では有効化時のチェック行を出さない。
6. cast の /mine 初回表示の契約確認画面＋記録は器なし＝**0162 送り**（cast_contract_acks（cast×rev）＋RPC cast_contract_ack_self／cast_contract_ack_needed＝0162 ★4）。
7. rpc-err に 'off wish'（接頭一致＝shift_auto_apply の「off wish: <id>」も拾う）。
8. suite の同一 tx 内の now() 固定＝**教訓101** として独立（既存 98 は不変）。」

適用＝便 M4（bcdc669／5639aad／4624059／30bfb7e）どおり。

**0160 の欄（起草済み・手貼り待ち）**: supabase/migrations/0160_mine_settings.sql＝**起草済み・sha256 d0a1ed21a21ab9312217d04a7fa75cbb5faf58ad734dbbde2c131e8b79fbef1e・707 行・49,748 B・突合 36 段 NG 0（docs/tmp/q0930_ag_0160.mjs・BEGIN…ROLLBACK）・手貼り待ち・適用後の proof＝関数 296／表 81**（未追跡・生成器 docs/tmp/gen_0160.mjs＋0160_template.sql・写経元 0160_live.json・期待 md5 0160_expected.json＝decide 4c8c7d6b／auto_apply 55cbb0e8／pattern_effective a65c716d／demo_org_reset a331cdcd／submit 4afdf603／set_cast_quota 1987d03d／reservation_request f0c51a0a／reservation_decide a0088416／set_store_mine_settings 5aaecb0f／notice_mark_read b1329e24／staff_pattern_disable cb1d4a34／staff_pattern_enable e768f710・削除 set_cast_norm_self cfde419e）。適用後の見込み＝名簿 A 154／B 142＝296・'billing locked' 154・形 154・述語参照 155・表 81。


## 裁定325（2026-09-30 承認・Agoora）無人便 L の仮決めの追認

出典＝Agoora 承認（2026-09-30・便 P-2 で収載）。無人便 L（HEAD efc7f72）で CC が仮決めした 7 点の追認。次の裁定番号は 326。**本文（逐語）**:
「裁定325 無人便 L の仮決めの追認（2026-09-30）
1 保証時給の終了注記＝終了日が当期内または残り 0〜7 日のキャストに「保証時給は M/D まで（以後 基本時給 ¥N）」（基本時給なし／0 は金額を省く）。/casts と給与プレビュー（warning kind guarantee_ending・確定は止めない）。
2 日払い過徴収 warn＝当期プレビューの差引支給見込み（net＋dailyPaidGross）を、当期の日払い累計＋今回額が超えるとき「当期の見込み手取り ¥N を超えます（翌期で控除）」。同額は出さない・失敗時は出さない・発行は止めない。
3 shortfall の額＝roundYen(日別 hourly（保証時給・スライド込み）×(遅刻＋早上がり分)÷60)。無断欠勤・不足 0 分・hourly 0 の日は行を出さない。委託の表示名は「報酬調整（契約）」。
4 pay_time_basis 'shift' は実働のある日だけ hours を確定シフト時間に置換（打刻なし＝0・シフトの無い日は実働）。next の判定は run の期の初日。
5 日払いフォームの期の注記＝paid は info「翌月へ」・finalized（未払い）は warn「確定解除して再計算するまで給与明細には載りません」。
6 単位付き金額（円/本・円/点）は MoneyInput の「円」に統一しラベルで単位を示す。数量・分・%・pt は対象外。
7 RPC 不在の判定＝PGRST202／'Could not find the function'／'schema cache'（0159 適用後は結線に置換＝P-4）。」

適用＝無人便 L（2026-09-30・push 済み efc7f72）で実装済み。7 は便 P-4 で probe を外し結線に置換。

## 裁定324（2026-09-30 承認・Agoora）勤務時間の計算基準（店設定・2 択）

出典＝Agoora から 2026-09-30 に受領（便 AB の f0 走行中・「（提案中）」で収載）→ 便 AC-0（2026-09-30）で Agoora 承認を確認し見出しを日付へ差し替え。次の裁定番号は 325。**本文（逐語）**:
「裁定324 勤務時間の計算基準（店設定・2 択）
324-1 stores.settings_json.pay_time_basis: 'punch'（実打刻・既定）／'shift'（確定シフトどおり）。欠損は 'punch'＝既存店・golden 不変。set_store_profile 白名単に pay_time_basis／pay_time_basis_next／pay_time_basis_next_from を追加（enum 検証 'bad pay_time_basis'・next_from は date）。
324-2 切替は次の給与期の初日から。設定変更は pay_time_basis_next＋next_from（＝変更時点の次の期の初日・期の定義は T1 calc_period と同じ）に書き、pay.ts は run の calc_period_start ≥ next_from なら next、未満なら現行値で計算。確定済み期は再計算しない（316・315 と同じ凍結）。
324-3 'shift' の計算: 時給部分の gross は確定シフトの開始〜終了時間で算出。実打刻との不足分（遅刻＝裁定268 の猶予式を適用・早上がり＝猶予なし）を営業日ごとに自動起票＝payroll_adjustments に source 'shortfall'（basis＝shift_id・punch の元/後・不足分数・時給・理由「不就労控除（遅刻 N 分／早上がり N 分）」を breakdown に凍結・before 源泉・show_detail true）。雇用は不就労控除、委託は報酬調整（契約）として名称のみ出し分け（291 追補1）。額＝基本時給（保証時給適用中はその額）×不足分数÷60・端数は既存の給与丸めに従う。無断欠勤（確定シフトあり・打刻なし）は当日の時給部分を 0＝控除ではなく支給なし。打刻が確定シフトを超える分は払わない（早出・残業は owner／manager が確定シフトを修正して反映）。
324-4 shortfall の同期は 272-1 carryover_sync と同型＝draft run の preview から毎回 upsert・部分 unique(run_id, cast_id, biz_date) where source='shortfall'・0 なら削除・確定済み期は追随せず 315 の payroll_attentions に積む。手入力の 'settlement'／'sanction' とは別行で共存。
324-5 権限: 設定変更は owner／manager。時刻修正は 315 のまま。ウィザード STEP 3 に 2 択（既定 punch）。
324-6 mig 0159＝白名単 +3・payroll_adjustments.source CHECK に 'shortfall'・部分 unique 1・RPC payroll_shortfall_sync(p_run_id)。client 便＝pay.ts 結線・店舗設定 UI・明細表示・STEP 3・suite。」

適用＝未着手（0159 ★起草の入力）。
CC の事前メモ（起草時の確認点・追補1 で (c)(d) は確定・(a)(b) は 0159 事前読取で事実を出す）: (a) 324-2 の「現行値」＝pay_time_basis の既定 'punch' を欠損時に読む位置は pay.ts の PayInput（store 設定→calc 入力）で 1 箇所に。(b) 324-3 の「保証時給適用中はその額」は 0154 の cast_guarantee（保証時給の span）を参照＝pay.ts の guarantee.spans と同じ判定を使う。(c) 324-4 の部分 unique は 0148 の carryover（source='carryover'・部分 unique）と同型＝payroll_adjustments に biz_date 列が無い→追補1 で列追加に確定。(d) 確定済み期の追随停止（315 へ積む）は kind の追加（payroll_attentions_kind_check は 1 値）→追補1 で 'shortfall_after_finalize' に確定。

### 裁定324 追補1（起草前提の補正・2026-09-30 受領）

**本文（逐語）**:
「裁定324 追補1（起草前提の補正）
324-4 の部分 unique は payroll_adjustments に biz_date date 列（NULL 可・shortfall のみ必須）を追加して (run_id, cast_id, biz_date) where source='shortfall' とする。carryover の既存 unique は不変。
324-4 の「確定済み期は payroll_attentions に積む」は payroll_attentions.kind の CHECK を拡張（現行 1 値＋'shortfall_after_finalize'）して受ける。
0159 のスコープ＝324-6（白名単 +3・source CHECK +'shortfall'・biz_date 列・部分 unique・kind CHECK 拡張・RPC payroll_shortfall_sync）＋起票89（customer_register をレジ権限 staff へ）＋起票91（kiosk_transport_issue ゲート行の形・billing pin 147→148）＋起票92（payroll_attentions の cascade・demo_org_reset）を 1 本。
pay.ts の読取位置と保証時給の参照先（CC 確認点 (a)(b)）は 0159 事前読取で事実を出し、★指定で確定する。」

0159 のスコープ（追補1 で確定）＝324-6 ＋ 起票89 ＋ 起票91 ＋ 起票92 を 1 本。起草の前に事前読取（docs/tmp/0159_pre.md）で (a)(b) の事実を出し、★指定を待つ（→ 便 AC-3 で事前読取済み・追補2 で反映）。

### 裁定324 追補2（0159 事前読取の反映・2026-09-30 受領・便 AC-3 の ③⑤⑥⑧ への裁定）

**本文（逐語）**:
「裁定324 追補2（0159 事前読取の反映・2026-09-30）
1 設定の書込は set_store_profile ではなく新 RPC set_store_pay_time_basis(p_store_id uuid, p_value text, p_apply text)。ゲート＝owner／manager 自店（set_store_okuri_mode 骨格）。p_apply='next'＝pay_time_basis_next=p_value・pay_time_basis_next_from=翌暦月 1 日（JST）を settings_json に書く。p_apply='now'＝当店の payroll_runs が 0 行のときのみ pay_time_basis=p_value を直接書く（ウィザード STEP 3 用）・1 行以上なら raise 'runs exist'。値検証は slide_apply 型（'bad pay_time_basis'／'bad apply'）。set_store_profile の白名単は変更しない（追補1 の「白名単 +3」を撤回）。次期初日到来後の昇格は pay.ts の比較（324-2）で吸収し、settings_json は書き換えない。
2 payroll_shortfall_sync(p_run_id uuid, p_rows jsonb)。金額計算は pay.ts（wageDetail の hourly × 不足分数 ÷ 60・保証時給適用中はその額）で行い、route が p_rows＝[{cast_id, biz_date, amount, target_shift_id, basis, reason}] を渡す。RPC は payroll_carryover_sync の写経＝二重防御 3 段→run 読取（not found／manager 自店／not draft）→upsert on conflict (run_id, cast_id, biz_date) where source='shortfall'→p_rows に無い shortfall 行を delete→audit_log_write 6 引数→件数。基準の shift は target_shift_id（0154 列）に置き、basis text は表示用要約（「遅刻 N 分」「早上がり N 分」「遅刻 N 分・早上がり M 分」）。mode は 'before' 固定。
3 追補1 の payroll_attentions.kind 拡張は撤回（確定済み期の打刻修正は 315 の既存 kind で要対応に積まれる）。起票92＝payroll_attentions・daily_pays・payroll_run_deduction_overrides の 3 表を demo_org_reset の c_wipe（payroll_adjustments の前）／c_load（payroll_runs の後）に追加。
4 早上がりは新純関数 earlyLeaveMinutesOf(endHm, outPunchHm)（確定シフト終了との差・猶予なし・client）。close 基準の early_grace は不変。
5 customer_register の開放は staff のみ（auth_staff_can_register() を足し staff 分岐を can_crm OR can_register に）。cast は含めない。」

追補2 後の 0159 スコープ（起草の入力・確定）: (1) 新 RPC set_store_pay_time_basis（owner／manager 自店・'next'／'now'・'bad pay_time_basis'／'bad apply'／'runs exist'）＝白名単は不変（追補1 の +3 撤回） (2) payroll_adjustments: +biz_date date（null 可・shortfall のみ必須）・source_ck +'shortfall'・部分 unique (run_id, cast_id, biz_date) where source='shortfall'（carryover の unique は不変） (3) 新 RPC payroll_shortfall_sync(p_run_id, p_rows jsonb)＝carryover_sync の写経（金額は pay.ts 側・mode は 'before' 固定＝before_withholding=true・target_shift_id＝基準 shift・basis＝表示用要約） (4) payroll_attentions.kind の拡張なし（撤回） (5) 起票89＝customer_register の staff 分岐を can_crm OR can_register（cast なし） (6) 起票91＝kiosk_transport_issue のゲート行を v_org 形へ（billing 段47-1 147→148） (7) 起票92＝demo_org_reset の c_wipe／c_load に payroll_attentions・daily_pays・payroll_run_deduction_overrides の 3 表。関数 288→290（+2）・表 79 不変。
CC の注記（本文には触れない）: 追補2-2 の「mode は 'before' 固定」＝payroll_adjustments.mode は 'fixed'／'rate' の 2 値（mode_ck）で 'before' は入らない＝**mode='fixed'・before_withholding=true** と読む（源泉前＝324-3「before 源泉」）。起草でこの読みを冒頭コメントに明記し、違えば★で訂正。

### 裁定324 追補3（0159 起草判断・2026-09-30 承認）

出典＝Agoora 承認（2026-09-30・便 S159-1 で収載）。便 D159 の起草判断 4 点（要裁定 1・要追認 1・注記 2）への裁定。**本文（逐語）**:
「裁定324 追補3（0159 起草判断・2026-09-30）
1 payroll_shortfall_sync は課金ゲート非適用（B(e)＝給与は過去労働の清算・payroll_adjustment_add／carryover_sync と同列）。名簿は B(e) +1・'billing locked' 149・形 149。set_store_pay_time_basis はゲート適用（A8・店設定）。
2 demo_org_reset の payroll_run_deduction_overrides は deductions を FK 参照するため c_wipe は 'deductions' の直前・c_load は 'deductions' の直後。他 2 表は payroll_adjustments の前／payroll_runs の後。
3 set_store_pay_time_basis の 'now' は pay_time_basis のみを書き next／next_from は触らない。
4 他 org の manager は 'forbidden' ではなく 'run not found'（run を org で引く carryover_sync 同型）。」

適用＝便 S159-2（2026-09-30）で ★2 のゲート行 1 行を除去（改稿前の控え docs/tmp/0159_before_324-3.sql・sha b4f7f933…6aaa）。2〜4 は D159 起草の判断どおり（改稿なし）。

**0159 の欄（起草済み・手貼り待ち）**: supabase/migrations/0159_pay_time_basis.sql＝**起草済み・sha256 00ed3da283e2fd2cbb9ac9887d024819ba69408b39d1c3cdd19fa26add5bf4b7・494 行・33,999 B・再突合 37 段 NG 0（docs/tmp/q0930_ag_0159.mjs・BEGIN…ROLLBACK）→ 本番適用 2026-09-30 午後・時刻不明（Agoora 手貼り・Success 申告・便 C-0 で確定）→ 便 P-1 で live 照合 all_ok・収蔵**（未追跡・生成器 docs/tmp/gen_0159.mjs＋0159_template.sql・写経元 0159_live.json・期待 md5 0159_expected.json＝customer_register e165599a／kiosk_transport_issue 08c5dbc3／demo_org_reset 7b6070a6／payroll_shortfall_sync 0cc27ae4／set_store_pay_time_basis 7b8e7fb1）。適用後の見込み＝関数 290・表 79・名簿 A 149／B 141・'billing locked' 149・形 149・述語参照 150。

## 裁定307（本便で確定・Agoora 承認・2026-09-25）0153 要裁定 4 件の裁定（307-1〜5）

出典＝便 M153 の報告（0153_customers_keep.sql 冒頭の要裁定 (1)〜(4)・突合 q0925_ag_0153.mjs NG 0）を受けた Agoora 承認（2026-09-25・0153 手貼り後ブロック S-1 で収載）。次の裁定番号は 308。**本文（逐語）**:
「裁定307（2026-09-25・0153 要裁定 4 件の裁定・Agoora 承認・出典 M153 報告）
307-1 読取 2 本（check_customer_names／customer_sales_summary）はゲート行を持たない＝名簿 B(f)（裁定261 の読取は課金停止中も通す）。referral_payouts_unpaid が A なのは 0152 の写経の名残＝起票（次の mig で B(f) に揃える・本便では触らない）。
307-2 bottle_keep_register の p_check_line_id は bottle_keeps に列を足さず「その購入行の customer_id を持ち主に付ける」。行が伝票に紐づく顧客でなければ 'not on check'（起草どおり）。
307-3 check_customer_add／check_customer_remove／check_line_set_customer の権限＝check_open と同じ腕（owner／manager／staff can_register／cast can_register・kiosk 腕なし）（起草どおり）。
307-4 305-12 の unit4 最優先は plan_fixed の cast にも効く（承認済み・live の plan_fixed×unit4 の組 0・golden 3 fixture 不変を突合で実測）。以後この組が出た場合は商品側が勝つ＝仕様であり期待値の張り替えで対応する。
307-5 0153 冒頭コメントの不触 md5 控え customer_assign_cast は accfb2a6 が正（accbf2a6 は転記ミス・本文への影響なし）。S-1 で同時に修正。
S-1 の書き換え＝「要裁定 (4)＝裁定307 で確定（改稿なし・貼付版 sha 417c5952…0b11）」＋307-5 の訂正。新 sha を報告し、台帳の 0153 適用欄には貼付版 sha と収蔵版 sha を併記。続けて B〜G を実行。」

適用＝0153 手貼り後ブロック S-1（0153 冒頭コメントの書き換え＝改稿なし・本文の $$ 内 md5 不変）。307-1 の起票＝v39 §3 残り小物（次の mig で referral_payouts_unpaid を B(f) へ）。 ＝ S-1 0066094（docs）・手貼り後の A 再走 ALL OK・307-2／307-3／307-4 は customers-keep suite ck(2-1)／ck(5-3)／ck(4-1) が係留・ローカルコミット `未コミット（f0 2 連未達＝run1b 緑 77 段 4,941／run2 pricing statement timeout／run2b DB 無応答＝教訓85 で停止・作業ツリーに保持）`。

## 裁定306（本便で確定・Agoora 承認・2026-09-25）スマホ実機の崩れ一式（306-1〜16）

出典＝Agoora のスマホ実機目視（2026-09-25）を受けた承認（便 K-0 で収載）。次の裁定番号は 307。**本文（逐語）**:
「裁定306（2026-09-25・スマホ実機の崩れ一式・Agoora 承認）
306-1 /shift「配置を組む」の月カレンダーに年月見出し（「YYYY年M月」）と前月／翌月／今月。見出しは sticky。
306-2 月移動で「キャスト別にまとめて追加」「日セルの＋」「スタッフ表示」の対象月も追従。募集中の期間と表示月が違うときは見出し下に薄字「募集期間: M月」。
306-3 ≤899px: セグメント「月カレンダー／スタッフ」は切らず幅いっぱいの 1 行・その下に「＋キャスト別にまとめて追加」を幅いっぱいの 1 行。
306-4 /mine の希望カレンダー（裁定290）にも同じ年月見出しと前月／翌月（提出可能な期間の外は移動可・提出不可の注記）。
306-5 確定タブの月カレンダーの「未確定」バッジは日付と重ねない（≤899px はセル上辺 3px の色帯＋凡例「帯＝未確定」・名前 3 名の領域を侵さない）。
306-6 306-1 の年月見出し・‹ ›・今日 は確定タブの既存部品を切り出して「配置を組む」と /mine で共用（新規に作らない）。
306-7 /shift 期間カード（≤899px）: 各期間は「開始〜終了」「希望締切」「状態」を縦 2 段・「編集」「削除」は横書きの小ボタンを右端に横並び（縦書き禁止）。新規フォームは 開始／終了 1 行・希望締切／状態 1 行・「作成」は最下段右端。状態は SegSelect（4 択）に統一し picker を使わない。
306-8 ＝306-3 と同じ（セグメント 1 行＋ボタン 1 行）。
306-9 用語統一: 画面上の「黒服」を「スタッフ」に（タブ・見出し・説明・ボタン・注記・ナビ・エラー・マスタ「機能の公開」・/mine・kiosk を含む）。コードの識別子は不変。
306-10 スタッフシフトの月カレンダー（≤899px）: 枠別は「早 0/0」「遅 0/0」の 1 行ずつ・折返し禁止・3 枠以上は「+n」。≥900px は現行。
306-11 ヘッダーの ⚙: ≤899px はページ内パネルを差し込まず、下タブ「メニュー」と同じボトムシート（overlay・fixed）を「設定」節から開く。閉じるは外側タップ／×／戻る。≥900px は現行＋押下時に該当パネルへ scrollIntoView。
306-12 /casts 詳細の「前借り／送り実費」節（300-2）は「待遇・バック」から「基本」タブへ（今月指名・今月出勤・次回シフトの下・機微情報注記の上）。
306-13 /casts 詳細「待遇・バック」の「待遇プラン」行を選択可能に: 店の有効な comp_plans を選ぶ＋「適用開始日」（既定＝次の給与期の初日・過去日不可・確定済みの期は不可）→ 既存の割当 RPC（K-1 で名前確認）。切替後も個別上書きは維持＝注記「上書きは維持されます」。エラーは 281 の共通部品。
306-14 同タブ「契約区分: 未設定」は「未設定（委託として計算）」と表示。
306-15 「›」の折返し禁止: ホームのクイック操作タイル・メニューシートのカード・マスタ概要カードで「›」はタイトル行の右端に inline（flex・nowrap）。正方形タイルは「›」を出さずタイル全体をタップ対象。横長カードは「タイトル ›」1 行＋説明 1 行。
306-16 ホームのクイック操作タイルのアイコン（■ ☾ ▤ ◉ ▲ ¥ ♦ ✦ の文字記号）はメニューシートと同じ lucide に統一。」

適用＝便 K-1（読取）・K-2（L1 見出し部品の共用＋月移動＋?ym → L2 シフト画面の崩れ → L3 用語 → L4 ⚙ シート → L5 casts 詳細 → L6 カード）・K-3（verify-nox-shift-nav 新設＋messages／nav／cast-guarantee／advance-okuri 追補）・K-4（f0 2 連→push）。 ＝ **`de6b376`（2026-09-25・f0 2 連緑 76 段 4,884）**。
L1: components/nox/month-nav.tsx（MonthNav＝‹ 年月 › 今月・sticky・注記・useYmQuery＝?ym 同期）＋lib/nox/ui/month-nav.ts（ymLabelOf／ymShift／ymFromSearch／ymSearchOf／recruitNoteOf／outOfPeriodNoteOf／staffCellCompactOf）。shift-board 3 箇所（カレンダー／確定／配置を組む）と /mine wish-form が同じ部品（306-6）・旧 shiftMonth 撤去・「＋ キャスト別にまとめて追加」は表示月に追従（306-2）。
L2: .nox-plantools（306-3／306-8）・未確定＝.nox-cald--unpub の帯＋凡例（306-5）・期間カード .nox-periodcard／フォーム .nox-periodform・状態は SegSelect（PERIOD_ST_OPTIONS・Picker 撤去＝picker suite 12→13 は casts-board の追加で相殺）（306-7）・staff-shift-manage の圧縮セル（306-10）。
L3: 「黒服」47 箇所／19 ファイル→「スタッフ」（識別子 staff_* 不変・messages ms(3-1) で 0 を係留）。L4: HeaderGear は ≤899px で OPEN_MENU_EVENT を dispatch→nav.tsx のメニューシートに「設定」節（gear 群・id nox-sheet-settings）・戻る（pushState／popstate）／外側／×／Esc で閉じる・≥900px は現行 Modal＋hashTargetOf→scrollIntoView（306-11）。
L5: 前借り／送り実費の節を「基本」タブへ（306-12）・待遇プラン行「変更」→Picker（有効プランのみ・同じ取得に is_active 同乗）＋適用開始日（既定 nextPeriodStartOf＝翌月 1 日・過去日不可・確定済み期は payroll_runs を保存時に 1 回読んで拒否）→既存 RPC set_cast_plan（上書き維持＝lib/nox/cast/plan-switch.ts）（306-13）・「未設定（委託として計算）」（306-14）。
L6: クイック操作タイル＝NavIcon（文字記号撤去）・「›」なし（306-15／16）・マスタ概要カードは .nox-cardtitle＋.nox-cardchev（nowrap）＋.nox-carddesc 1 行・メニュー行の .nox-navchev nowrap。
suite: verify-nox-shift-nav 17（新設・f0 76 段目）・messages 16・nav 25・cast-guarantee 56・advance-okuri 25・picker 10（allow-list 13／11）。逆テスト＝L1〜L6 各 1（赤→復元→緑）。fetch +1＝casts 詳細の待遇プラン保存時のみ（payroll_runs 1 行）。
**スマホ目視（Agoora・2026-09-25）＝308-1／308-2 を除き OK（裁定308-3）**。

## 裁定305（本便で確定・Agoora 承認・2026-09-25）0153 顧客複数・ボトルキープの設計（305-1〜12）

出典＝docs/tmp/0153_pre.md §(a) の E1〜E10（便 T-4 読取）と 293-4／296 追補2 を受けた Agoora 承認（2026-09-25・便 M153-1 で収載）。次の裁定番号は 306。**本文（逐語）**:
「裁定305（2026-09-25・0153 顧客複数・ボトルキープの設計・Agoora 承認・出典 0153_pre §(a) E1〜E10）
305-1 E1 checks.customer_id は併存（check_customers の position=0 と同値・廃止予定なし）。
305-2 E2 注文行の顧客は後付け RPC check_line_set_customer(p_line_id, p_customer_id null=解除) で付ける。check_add_line ほか注文 RPC 9 本は不触。
305-3 E3 check_customer_remove は当該顧客が付いた check_lines.customer_id を null に戻す（拒否しない）。position=0 を外したら次の顧客が繰り上がり checks.customer_id も追従。
305-4 E4 check_customer_names(p_check_id)＝顧客名＋その顧客の active なキープのボトル名のみを返す。can_register の cast にも開放。電話・メモ・誕生日・グレードは返さない。
305-5 E5 キープ出し＝bottle_keep_out(p_keep_id, p_check_id, p_idem_key)→ kind 'keep_out'・qty 1・unit_price 0・line_total 0・back_snapshot null（バック 0）・在庫は減らさない（販売時に減算済み）・印字「キープ出し」。last_used_at を更新。check_lines_kind_check に 'keep_out' を追加（pin 5 suite 張り替え）。
305-6 E6 bottle_keeps に bottle_name text null・last_used_at timestamptz null。
305-7 E7 bottle_keep_out は kiosk 腕あり（0057 の型・authenticated＋kiosk トークン）。
305-8 E8 顧客検索は client filter・RPC なし。
305-9 E9 顧客別売上: 顧客が付いた行はその顧客・付いていない行は check_customers の人数で均等割り・端数は position=0 に寄せる。RPC customer_sales_summary(p_store_id, p_from, p_to)（owner／manager）。
305-10 E10 単独便。
305-11 293-4: customers に last_visit_at（check_close で更新）・retention_until（last_visit_at＋店設定 customer_retention_years・既定 5）・deleted_at・anonymized_at。利用目的＝stores.settings_json.customer_purpose（set_store_profile 白名単 +2）。削除・匿名化の RPC は 0155。
305-12 296 追補2: comp_plans.product_back_fixed_hon／jonai／free（integer null ≥0）・set_comp_plan 署名 +3・set_cast_plan 白名単 +3（productBackFixedHon／Jonai／Free）・check_close の plan_fixed 解決＝商品 unit4（back_mode='unit4'）→ cast_plan 区分別 → comp_plans 区分別 → 一律 product_back_fixed。同伴＝本指名。golden fixture に plan_fixed×unit4 商品の組があれば期待値が動く＝突合で報告（要裁定）。」

適用＝便 M153-2（起草 supabase/migrations/0153_customers_keep.sql＝★1〜★22・未追跡）・M153-3（突合 BEGIN…ROLLBACK）。手貼りは Agoora（要裁定の裁定後）。client（顧客複数 UI・キープ出し・顧客別売上・商品／プランの区分別欄）は手貼り後ブロック。
**0153 適用欄（2026-09-25）**: 手貼り＝Agoora 18:4x JST（末尾検証 count 1 申告）・CC の A-0／A 検証 18:35 JST ALL OK（docs/tmp/q0925_a0_0153.mjs・docs/tmp/0153_post_a.json）。
sha256＝**貼付版 417c5952dfc3a9203c1b05004d7e9b21d9df13f82e49cdf6e4ad23f326190b11**（1,838 行・136,831 B）／**収蔵版 4a5145b0adf802a8942421c52105b8656d40002f64bdec28a296f0d1598d7c68**（1,839 行・136,902 B＝S-1 で冒頭コメントのみ書き換え＝要裁定 (4)→裁定307 で確定・307-5 の md5 誤記訂正・本文の $$ 内 md5 不変）。**収蔵版 4a5145b0…7c68＝`2412601` で収蔵**（docs コミットへの同乗＝教訓93・v40 §0 で「そのままで確定」・2026-09-28 便 P-1 追記）。
live md5（CR 除去・$$ 内）＝check_close 3f4e73b5／demo_org_reset 30c846ae／set_comp_plan 3fdd6e81／set_cast_plan 37dd29a2／set_store_profile e9bb2b66／check_open f306b0a0／check_merge 88e8e203／bottle_keep_register 03ff8bca／bottle_keep_update c1eff580／check_customer_add ed5f7c6e／check_customer_remove 8cd4e3d3／check_line_set_customer 5af12065／check_customer_names 70a81e91／bottle_keep_out e6d14ca5／customer_sales_summary 81c424d5・不触 17 本不変（customer_assign_cast は accfb2a6）。
名簿 A1 +4／B(f) +2＝対象 145／除外 123／全数 268（billing 段47-1 145／146・段47-3 kiosk 腕 19）。pin 新値＝anon-guard 1018（probe +6）・grants 383（TABLES +check_customers・G4d +6・G9 列集合 customers 18／bottle_keeps 15／check_lines 21／check_customers 8・kind 11 値・G31 21／23／21）・product-types 20（kind 11 値逐語）・category-map 84（keep_out→other）・receipt 68（keep_out 行）・crm-base 24（register 9 引数／update 7 引数）・demo-reset 34（72 表）・customers-keep 32（新設・f0 77 段目）・picker 10（allow-list 14／12）・messages 16。
client＝D1 レジ「指名・席」の顧客カード（components/nox/check-customers-card.tsx＝names／add／remove／line_set／keep_out・fetch +1＝3 クエリ並列）・D2 顧客詳細のキープ一覧＋顧客別売上（fetch +2）・D3 店舗情報 2 欄（利用目的・保持年数）＋プラン区分別 3 欄（plan_fixed のみ・22 引数）＋cast 上書き 3 キー（商品マスターの unit4 4 欄は既存）・D4 三面鏡＝receipt／category-map の pin（lib 無改変＝¥0 行）・**D5 kiosk のキープ出し＝停止**（裁定11 顧客系非開示＝kiosk に keeps の読取経路がなく 305-7 の腕だけでは選べない＝v40 §3 の問い）。
f0 2 連緑 **run1b 77 段 4,941（run2／run2b は未達）**（golden 5931／125802／55233・rate-back 64・billing 53）。ローカルコミット **`未コミット（f0 2 連未達＝run1b 緑 77 段 4,941／run2 pricing statement timeout／run2b DB 無応答＝教訓85 で停止・作業ツリーに保持）`**（0153＋client＋suite＋名簿を 1 本・夜間規則で未 push＝朝の相談役確認後）。

## 裁定304（本便で確定・Agoora 承認・2026-09-25）0157 要裁定 (2) の裁定（304-1〜2）

出典＝便 X-3 の報告（0157_issue_bulk.sql 冒頭の要裁定 (1)(2)）を受けた Agoora 承認（2026-09-25・便 S-1 で収載）。次の裁定番号は 305。**本文（逐語）**:
「裁定304（2026-09-25・0157 要裁定・Agoora 承認）
304-1 p_items に同じ cast_id が 2 回以上あれば 'duplicate cast' で raise（全件失敗・部分成功なし）。
304-2 audit action＝'adv_issue_bulk'／'transport_issue_bulk'・target は行ごと advances:<id>／transport:<id>・after に bulk_idem（起草どおり）。」

適用＝便 S-2（gen_0157.py に 304-1＝ループ前の count(*) <> count(distinct cast_id) → 'duplicate cast'・再生成・改稿前の控え docs/tmp/0157_before_304.sql（sha256 a5269e15…addd））・S-3（再突合 q0925_ag_0157.mjs に d 段 +1）。手貼りは Agoora。 → **手貼り済み（2026-09-25・上の 0157 適用欄）**・suite verify-nox-issue-bulk ib(1-4) が 'duplicate cast' を係留・client の和文「同じキャストが重複しています」（bulkErrJa）＝`913f9cc`。

## 裁定303（本便で確定・Agoora 承認・2026-09-25）給与右パネルの支給内訳（303-1〜3）

出典＝Agoora 承認（2026-09-25・便 Y-0 で収載）。次の裁定番号は 304。**本文（逐語）**:
「裁定303（2026-09-25・給与右パネルの支給内訳・Agoora 承認）
303-1 給与 run 明細の右パネル「支給」内訳は PayslipSlip と同じ行・同じ順・同じ値（単一の内訳関数を両方が使う）。残り物の行（「その他バック」等）は作らない。
303-2 時給行は報酬型に時給を含む cast では 0h でも表示（「0h × ¥n ＝ ¥0」）。雇用は常に表示。非表示は「その報酬型に存在しない行」のみ。
303-3 時間 0h かつ日数>0 の cast は一覧の時間セルに「打刻なし」を薄字で出す（値は変えない）。」

適用＝便 Y-1（読取）・Y-2（lib/nox/payroll/breakdown-lines.ts＋両画面の結線・旧計算の撤去）・Y-3（suite payroll-view 追補）・Y-4（f0 2 連→push）＝`f7bc3f2`（2026-09-25・f0 2 連緑 74 段 4,819・Z152 同乗）。

**追補1（本便で確定・相談役ブロック 2026-09-25・便 S-1 で収載）**。**本文（逐語）**:
「裁定303 追補1（2026-09-25）: payroll-board の KPI 支給総額・一覧の総支給列・csv.ts grossTotal は gross のみ（extras は gross 内在＝裁定26・二重加算の是正）。303-3 の文言は「打刻なし／不完全」。実装は 0157 手貼り後ブロックに同乗。」

適用＝便 E（0157 手貼り後ブロック・2026-09-25）＝`913f9cc`: csv.ts grossTotal＝p.gross・payroll-board の KPI＝runSummaryOf（lib/nox/payroll/view.ts・Σgross）・一覧の総支給＝gross（`+ extras` 撤去）。golden（玲奈）で extras 1,000 → payOf の gross 1,387,150→1,388,150（+1,000・源泉 +102・net +898）を payroll-csv が係留（旧式なら総支給 +2,000）。303-3 の文言「打刻なし／不完全」（pv(6-4)）。suite payroll-csv 25→27・payroll-view 18→20。

## 裁定302（本便で確定・Agoora 承認・2026-09-25）前借り／送り実費の一括発行（302-1〜5）

出典＝Agoora 承認（2026-09-25・便 X-0 で収載）。次の裁定番号は 303。**本文（逐語）**:
「裁定302（2026-09-25・前借り／送り実費の一括発行・Agoora 承認）
302-1 発行フォームはチェックボックス一覧型: 候補は当日の出勤者（attendance の出勤打刻あり）を上・他は下（検索で絞り込み）。「出勤者を全員チェック」「全解除」。各行に金額欄（送り実費は送りベース額をプリフィル・行ごとに上書き可）・下部に「n 人・合計 ¥m」・メモは共通 1 欄（全行に同じ値）・「一括発行」1 回。
302-2 DB: transport_issue_bulk／adv_issue_bulk を新設（1 tx・部分成功なし・冪等）。署名＝(p_store_id uuid, p_items jsonb, p_idem_key uuid)・p_items＝[{cast_id, amount, date, note}]。各件は既存の transport_issue／adv_issue と同じ検査（'okuri not actual'・cast の店所属・amount>0）を通す。各件の idem＝md5(p_idem_key || ':' || cast_id)::uuid。返り＝発行 id の配列。同キー再送は既存 id の配列を返し新規 0。
302-3 発行済み一覧: フォーム直下に当日（営業日）の発行済み（cast・額・メモ・取消）＝既存 adv_cancel／transport_cancel。
302-4 mig 番号＝0157_issue_bulk（0153 の前に手貼り・番号順に依存しない・0154→0152 の前例）。
302-5 起票（0156 へ）: 退勤打刻と送りの連動（打刻画面の「送り あり／なし」トグル・日報締めで当日分を確認）／前借りのキャスト申請制（/mine 申請→今日タブ「未決裁」で承認＝発行）／一括発行の LINE 通知は第 2 期。」

適用＝便 X-1（事前読取 docs/tmp/0157_pre.md）・X-2（★指定）・X-3（起草 supabase/migrations/0157_issue_bulk.sql＋突合 BEGIN…ROLLBACK・未追跡）。手貼りは Agoora（要裁定の裁定後）。302-1／302-3 の UI は手貼り後（マスタは一括型・casts／給与は 1 人型のまま）。
**0157 適用欄（2026-09-25）**: 手貼り＝Agoora 16:5x JST 申告（CC の A-0／A 検証 16:46 JST ALL OK＝docs/tmp/q0925_a0_0157.mjs・docs/tmp/0157_post_a.json）。sha256 630565ae422819f3609ce603e51ea8f3e07f66b2d3c2be87a7c13bc1100c0dfb（180 行・13,729 B・裁定304 反映版）。
live md5（CR 除去）＝adv_issue_bulk 18899985／transport_issue_bulk 9d10c990・既存 4 本不変（adv_issue b8568921／adv_cancel 8ff4572b／transport_issue 7740e3c4／transport_cancel 5735aa45）・unique index 2 本（advances_store_idem_uidx／transport_store_idem_uidx）・列集合 advances 16／transport 15。
名簿 A4 +2＝全数 262／gated 141（billing 段47-1 141／142）。pin 新値＝anon-guard 1012（probe +2）・grants 368（G4d +2・index 2・列集合）・issue-bulk 16（新設・f0 75 段目）・advance-okuri 24（一括の純関数＋配線）・payroll-csv 27・payroll-view 20・demo-guard 18（route 39）。
client＝302-1／302-3（マスタ「控除・送り」のみ一括型＝components/nox/issue-bulk-form.tsx・lib/nox/payroll/issue-bulk.ts・route /api/advance/issue-bulk／/api/transport/issue-bulk・当日一覧＋取消・fetch +1（attendance／advances／transport の 3 クエリ並列））。
f0 2 連緑 **75 段 4,856**（run1 は demo-guard dg(1-1) の route 未分類で赤→C に追加・run1b／run2 緑・golden 5931／125802／55233・rate-back 64・billing 53）。push＝`913f9cc`（0157＋client＋suite＋名簿を 1 本）。

## 裁定301（本便で確定・Agoora 承認・2026-09-25）picker の折りたたみ型（301-1〜4）

出典＝Agoora 承認（2026-09-25・便 W-0 で収載・301-4 は同便の追記）。次の裁定番号は 302。**本文（逐語）**:
「裁定301（2026-09-25・picker の折りたたみ型・Agoora 承認）
301-1 components/nox/picker.tsx: 候補が 9 件以上のとき既定で折りたたむ＝選択中の 1 行（チップ・解除ボタン付き）＋検索欄のみ表示。検索欄のフォーカス／入力でリストを下に開く（最大 8 行＋「他 n 名・絞り込んでください」）。Escape・外側クリック・選択で閉じる。候補 8 件以下は従来どおり全展開。
301-2 折りたたみ時のリストは position 絶対配置（親のフォーム行の高さに影響しない）。キーボード（↑↓ Enter）対応・aria-expanded。
301-3 259 R17 の他の性質（dense・検索・選択中の表示・0 件文言）は不変。既存の呼び出し側はコードを変えずに恩恵を受ける（prop 追加なし・閾値は定数 PICKER_COLLAPSE_AT=9）。
301-4 「控除・送り」の天引き節の余白: 節見出し「天引き（前借り・送り実費）」の上 24px・下 12px。各カード内は 見出し→12px→「キャスト」ラベル→6px→picker→16px→フォーム行（金額／日付／メモ／発行）→8px→注記（給与から天引き…）→カード下端 16px。ラベルと入力の間は全ラベル 6px。値は ui-tokens の既存段階（4/8/12/16/24）から選び、新しい生の px を書かない。同じ型を advance-okuri-form.tsx に入れて 3 入口（マスタ／casts／給与右パネル）で共通に効かせる。」

適用＝便 W-1（読取）・W-2（実装＋逆テスト＝閾値 1）・W-3（suite verify-nox-picker）・W-4（f0 2 連→push）。

## 裁定300（本便で確定・Agoora 承認・2026-09-25）控除・送り画面の修正と前借り／送り実費の入口統一（300-1〜4）

出典＝Agoora 承認（2026-09-25・便 V-0 で収載）。次の裁定番号は 301。**本文（逐語）**:
「裁定300（2026-09-25・控除・送り画面の修正と前借り／送り実費の入口統一・Agoora 承認）
300-1 マスタ「控除・送り」の前借り／送り実費の発行フォーム: キャスト選択を共通 picker（picker.tsx・裁定259）に置換・金額／日付／メモ／発行は 1 段のフォーム行・≤899px は 1 列（M5 の型）。
300-2 前借り／送り実費の発行口を 3 箇所に統一: マスタ「控除・送り」・/casts のキャスト詳細（cast 固定）・給与 run 明細の右パネル「前借り／送り実費」節（cast・期固定・確定後は読取のみ）。3 箇所とも同じ部品（components/nox/advance-okuri-form.tsx）と既存 RPC を呼ぶ。新 RPC 0。
300-3 給与 run 明細で固定控除（控除ルール）の当期の ON/OFF・額の上書きを可能にする。器が client で足りるか mig が要るかは V-1 の読取で判定し、mig が要る場合は 0156 に同乗（本便では実装しない）。
300-4 前借りの残高管理（貸付・年越し過払債権）は 0156。本便は入口と表示のみ。」

適用＝便 V-1（読取）・V-2（300-1）・V-3（300-2＋suite verify-nox-advance-okuri）・V-4（f0 2 連→push）。300-3 は V-1(d) の判定のみ（client で足りるなら次便・mig なら 0156 同乗）。

**追補1（本便で確定・相談役ブロック 2026-09-25・V-1(d) の読取＝deductions は店単位 is_active のみで run 別の器なし・逐語）**: 「裁定300 追補1（2026-09-25）: 300-3（固定控除の当期 ON/OFF・額の上書き）は mig が要る＝0156 に同乗。器＝payroll_run_deduction_overrides（run_id×cast_id×deduction_id・enabled・amount_override）＋finalize での凍結。client の負の調整控除で代替しない（二重帳簿）。」
＝適用: 300-1／300-2 は 2026-09-25 便 V で本番（ef4af53・f0 73 段 4,798）。300-3 は 0156 の起草材料。

## 裁定299（本便で確定・Agoora 承認・2026-09-25）0152 要裁定 10 件の裁定（299-1〜11）

出典＝便 M152 の報告（docs/tmp/0152_ag_result.json・mig 冒頭の要裁定 (1)〜(10)）を受けた裁定・2026-09-25 便 S152-1 で収載。次の裁定番号は 300。**本文（逐語）**:
「裁定299（2026-09-25・0152 要裁定 10 件の裁定・Agoora 承認・出典 M152 報告）
299-1 ★8 fixed_per_person: referral_recalc は coalesce(checks.people, 1)（起草どおり・recalc が伝票操作を止めない）。ただし check_referral_set で method='fixed_per_person' かつ checks.people is null のときは 'no people' で raise（人数を先に入れさせる）。改稿はこの 1 点。
299-2 ★17 daily_report_close の diff 式は referral_cash_payout を減算する（起草どおり・当日現金払いはドロワーから出た現金）。
299-3 ★6／★7 kiosk 腕は check_add_line／check_remove_line の逐語（腕あり）のまま。0057 の 3 箇所は触らない。
299-4 ★7 'has payments' は逐語で残す（burden='store' でも支払後は remove 不可・訂正は void 経路）。
299-5 ★10 一括の冪等＝md5(p_idem_key || ':' || id)::uuid（起草どおり）。
299-6 ★9 「同月」＝paid_at の JST 暦月（起草どおり・源泉は支払日基準）。
299-7 ★1 referrers.membership_id は on delete set null・CHECK は external→null のみ・staff の必須は set_referrer で検査（起草どおり）。
299-8 ★15 paid の payout がある伝票の void は通す・payout は据え置き・audit before に支払行（起草どおり・'referral paid' raise は不採用）。
299-9 ★3 referral_payouts.check_id unique＋close の早期 return＋not exists の二重化（起草どおり）。
299-10 ★5 set_referrer の p_is_active null は coalesce(…, true)（起草どおり）。
299-11 写経の注記: live prosrc の CR は LF に正規化して写す。「★以外 diff 0」は改行コードを除いた意味とする（0152 以降の mig に適用）。」

適用＝便 S152-2〜S152-4（gen_0152.py に 299-1 を入れて再生成・改稿前の控え docs/tmp/0152_before_299.sql（sha256 1323a073…97e1）・再突合 q0925_ag_0152.mjs に d 段 +1）。手貼りは Agoora（相談役の手順）。

## 裁定298（本便で確定・Agoora 承認・2026-09-25）0152 紹介料の設計（298-1〜10）

出典＝v39 引き継ぎ §9＋R152（docs/tmp/0152_pre.md・R152-3 の live 読取＝2026-09-25 便 M152-1 で収載）。分岐 D1〜D14（284 分の D8／D10 を除く）への裁定。次の裁定番号は 299。**本文（逐語）**:
「裁定298（2026-09-25・0152 紹介料の設計・Agoora 承認・出典 v39 §9＋R152）
298-1 D1 rate 系の丸め＝floor（money 系既定）。rate_set の母数＝kind='set' の line_total 合計（割引前）。rate_account の母数＝当該伝票の全 pay_group の割引後小計（kind<>'discount'・vip_charge を含む・紹介料自身は含めない）。
298-2 D2 check_lines_kind_check から 'referral' を外す。live に残る referral 行（NOX-DEMO・void 伝票・1 件）は同 mig 内で先に update kind='custom'（where kind='referral'）→ count=0 を assert → CHECK 差し替え。pin 5 suite は張り替え。
298-3 D3 1 伝票 1 紹介（check_referrals.check_id unique）。付け替え＝check_referral_remove→check_referral_set の 2 操作。check_merge は from 側に紹介があれば 'referral on from' で raise（先に remove させる）。
298-4 D4 客負担の印字＝初回セット行（block_no=0 の最初の set 行）に合算・qty 据え置き・紹介行は印字しない。set 行が無い伝票は最初の行に合算。
298-5 D5 スタッフ退店＝トリガなし・client 表示制御のみ。D6 同名重複＝許す（連絡先で区別・UI 警告）。D7 3 表は cast 0 行（RLS）。
298-6 D9 支払 RPC＝referral_payout_pay（1 件）＋referral_payouts_pay_bulk（一括）の 2 本・未払一覧は referral_payouts_unpaid（RPC）。D11 amount=0 は payout を作らない。D12 mig 1 本（2 パスにしない）。
298-7 D13 payouts.withholding は支払 RPC で確定。salesperson＝同月（支払月）の当該紹介者への支払累計で (累計−120,000)×10.21% を floor し、既確定分との差分を当該 payout に載せる（負なら 0）。employee＝0（給与側で源泉）。none＝0。
298-8 D14 check_group_due の除外 2 箇所の削除と三面鏡（check-calc 3・receipt 3）の削除は同便（鏡像 suite の pin 張り替え込み）。
298-9 負担: burden='customer' は check_referrals.amount を check_group_due の v_bx／v_bx10（pay_group 'A'・taxable_10）に加算＝サ料・税の母数に入る（9/18 Agoora 仕様）。burden='store' は伝票合計に一切乗らない。
298-10 支払経路: check_close で frozen_at を書き referral_payouts を insert（status 'unpaid'・withholding 0）。check_void は unpaid を 'voided'・paid は据え置き（返金は手動・audit に記録）。paid_via は 'cash_daily'（当日現金＝daily_reports.referral_cash_payout に集計）／'monthly'。給与（payroll）には一切載せない（280・297-5 とは無関係）。」

適用＝便 M152-2（起草 supabase/migrations/0152_referral.sql＝★1〜★21・未追跡）・M152-3（突合 docs/tmp/q0925_ag_0152.mjs＝BEGIN…ROLLBACK）。手貼りは Agoora（要裁定の裁定後）＝手貼り済み（2026-09-25・便 A 検証 NG 0・`ae557c8`）。**実機目視 OK（Agoora・2026-09-25）**。

**DB 側 完了（2026-09-25 12:2x JST・Agoora 手貼り Success・A-0 APPLIED 12:21・A 検証 docs/tmp/q0925_a152.mjs NG 0）**: sha256 adea663df7c4b3e32a725c1974c87094f2c15b4d0ff0852a0a6748d1c4b7feb3・1,200 行・88,778 B（裁定299 反映版）。
md5 表（live prosrc は SQL Editor 貼付で CRLF 化＝CR を落とした値で照合＝299-11・ファイル本文と全 14 本一致）: 改稿 7 本＝check_group_due 6c1ef055／check_recalc d90a3988／check_close 31ff9cca／check_void 62daaccf／check_merge f79dc159／daily_report_close 744912a1／demo_org_reset 677cb575。
新 7 本＝set_referrer 1e7032f9／check_referral_set e9735cf6／check_referral_remove 25bb4329／referral_recalc 2c5b1013／referral_payout_pay 61213c27／referral_payouts_pay_bulk 57781acc／referral_payouts_unpaid b0f96a2b。不触 8 本（check_pay d480a565／billing_writable_of 185818bb／check_add_line 8629536b／check_remove_line 3728e3a1／audit_log_write 90948ad7／assert_day_open 70fb5928／biz_date_of 35e0f76d／daily_report_aggregate b1e6b158）は生 prosrc の md5 不変。
proacl＝公開 6＋close／void／merge／daily_report_close＝authenticated,service_role・referral_recalc／check_group_due／check_recalc＝postgres のみ・demo_org_reset＝postgres,service_role。3 表 RLS on／policy 1／grant authenticated SELECT のみ。NOX-DEMO の旧 referral 行（55e580e8…）は kind='custom' で残存・kind_check 10 値。
名簿 全数 254→**260**／gated 134→**139**（A1 +2＝check_referral_set[K]／check_referral_remove[K]・A4 +3＝referral_payout_pay／pay_bulk／unpaid・A8 +1＝set_referrer・B(a) +1＝referral_recalc・check_add_referral は drop・C 18 本）。
pin 新値（許可列挙・裁定260）: billing 段47-3 17→18・grants G31 19→20／21→22・fail-closed 19→20・G4d +6／G4c +1・reopen ro(3b-4) 16→17／(3b-6) 17→18・product-types pt(1-2) 11→10 値・demo-reset 68→71 表・anon-guard 段35h（公開 6）＋INTERNAL referral_recalc。
収蔵 `ae557c8`（mig）／`7bb53f7`（名簿・probe・pin・suite 追従）／`380ae8e`（client D／E＝紹介の入口・/master/referrers 紹介者マスタ＋支払一覧・receipt 合算・日報「紹介料(現金)」・給与からの撤去）＝2026-09-25 13:08 に 1 push。f0 71 段 4,765 2 連緑（下記 pin）。
client 撤去（298-8・R152-3(c) 全列挙）: pay.ts 5 箇所・payroll collect／assemble／core／csv・check-calc 3 箇所（第 3 引数 referralCustomer へ）・receipt 3 箇所＋印字（referralTargetIndex＝298-4）・register-board 12 箇所（紹介カードへ置換）・lib/nox/register/referral.ts 削除・payslip-slip 2・payroll-board 2。逆テスト 3 本（check-calc／receipt／register-board）赤→復元→緑。
★pricing suite（supabase-js・tx 外）は A1 に 'verify 紹介者' 1 行を残す（既存行の再利用で増えない）＝referral suite の RLS pin は live 実数との相対比較。

## 裁定297（本便で確定・Agoora 承認・2026-09-25）0154 の運用細目（297-1〜5）

出典＝v39 引き継ぎ §8（docs/handoff/NOX_相談役引き継ぎ_2026-09-25_v39.md・Agoora 承認・2026-09-25 便 D297 で収載）。v39_material §5 の問い 2〜6 への裁定。次の裁定番号は 298。**本文（逐語）**:
「裁定297（2026-09-25・0154 の運用細目・Agoora 承認・v39 §8）
297-1 D1 決裁 UI: cast の pending 打刻修正申請を店が承認／却下する画面を作る。場所は /shift 今日タブの「異議あり n 件」warn と同じ位置に「未決裁 n 件」一覧。承認／却下とも理由必須（decide_reason に書く・裁定295-1）。対象 role は owner／manager。client のみ・次の client 便。
297-2 D3 旧 payslip（0154 以前に確定）の breakdown_json に fine>0 が残る行の表示語は「精算調整（旧: 罰金）」。値は改変しない（凍結値・B5-1）。
297-3 D4 精算調整は源泉前に計上（payroll_adjustment_add の位置＝before）。早退の検知＝退勤打刻＜確定シフトの終了時刻・猶予は店設定に持たず 0 固定。月次の「未登録候補」は attendance の遅刻／当欠のみを母数とし、早退は打刻から別途表示（候補には含めない）。
297-4 D2 shift_guarantee（シフト時間保証）は欠勤日を 0 とする。fixed（固定給）の按分は payslips.calc_period_start/end の暦日で行う（T1）。
297-5 持越し（起票のまま・裁定なし）: AW-5 Auth 設定 4 点（Agoora）・デモ入場ログ 30 日削除の器・AV-2 未確定 run の自動計算（fetch +1 なら案のまま）・AV-1 給与外 date セル 3 箇所・275 追補2-5 の 4 role 目視。」

適用＝297-2〜297-4 は夜間便 2 の仮決め（v39_material §3 D2／D3／D4）どおり実装済み＝本裁定で追認（DB 変更なし）。297-1 は未着手（client のみ・次の client 便）。297-5 は起票のまま。

## 裁定296（本便で確定・相談役ブロック・2026-09-24）ドリンクバックを指名区分で分ける（296-1〜4）

出典＝相談役ブロック 2026-09-24（0152 の同乗項目・本文の収載は 2026-09-25 便 F3）。次の裁定番号は 297。**本文（逐語）**:
「裁定296（2026-09-24・ドリンクバックを指名区分で分ける）
296-1 ドリンクバックの額を指名区分ごとに持つ: drinkBack_hon（本指名）／drinkBack_jonai（場内）／drinkBack_free（フリー）。cast_plan の overrides と comp_plans の両方（白名単 +3）。欠損は現行の drinkBack（一律）にフォールバック＝既存店の計算不変・golden 不変。
296-2 伝票のドリンク行がどの区分で付くかは、その伝票のキャスト割当（本指名／場内／フリー）で決める（レジ側の指名区分が正）。同伴は本指名扱い。
296-3 UI: 待遇画面と報酬制度タブ・ウィザードの報酬 STEP に「ドリンクバック 本指名／場内／フリー」の 3 欄（一律欄は残し「区分ごとに変える」トグルで展開）。シミュレーターと明細の内訳に区分別の本数・額。
296-4 mig の同乗先: 0152（伝票のキャスト割当を読む会計系と同じ便）。pay.ts・sim.ts は client。」

適用＝未着手（mig 0152 に同乗＝cast_plan overrides／comp_plans の白名単 +3・欠損は現行 drinkBack へフォールバック＝golden 不変・pay.ts／sim.ts は client）。

**追補1（本便で確定・相談役ブロック 2026-09-25・R152-3(d) の読取＝cast_plan overrides に drinkBack キーは無く区分別単価は products.unit4_json{hon,jonai,dohan,free} に既在・逐語）**: 「裁定296 追補1（2026-09-25）: 296（ドリンクバック区分別）は 0152 から外し、器の指定（商品 unit4 か プラン側 product_back_fixed の区分別か）を Agoora 確認後に 0153 へ同乗（仮置き）。0152 は紹介料のみ。」
＝296-4 の同乗先は本追補で 0152 → 0153（仮置き）に変更。0152 は紹介料のみ（裁定298）。

**追補2（本便で確定・相談役ブロック 2026-09-25・器の指定・Agoora 承認・同日収載）**。**本文（逐語）**:
「裁定296 追補2（2026-09-25・器の指定・Agoora 承認）: 0153 に同乗。
(1) comp_plans に商品バックの区分別固定額 3 欄（product_back_fixed_hon／product_back_fixed_jonai／product_back_fixed_free・integer null）。null＝現行の一律 product_back_fixed を使う（既存プラン不変）。同伴は本指名と同額。
(2) cast_plan overrides_json に同 3 キー（set_cast_plan の白名単に追加・型検査 integer≥0）。
(3) 解決順＝商品の unit4（商品側に区分別額があれば最優先）→ cast_plan の区分別 → comp_plans の区分別 → 一律（現行）→ 既定。pay.ts は凍結Σ（check_cast_backs）を読む構造は不変＝配分時（会計確定）に上の順で単価を決める。
(4) client: 待遇プランと cast 個別の上書きに 3 欄・商品マスターの編集に本／場内／同伴／フリーの 4 欄（既存の器 unit4_json の UI 露出）。
影響: golden 6 値は区分別が null のため不変。pin＝pay／payroll／payroll-csv／payroll-adjust の drinkBack 段（R152-3 (d)）は値不変・set_cast_plan 白名単 pin は張り替え。」

適用＝**0153 で本番（2026-09-25）**＝comp_plans.product_back_fixed_hon／jonai／free・set_comp_plan 22 引数・set_cast_plan 白名単 +3・check_close の解決順（商品 unit4→cast_plan 区分別→comp_plans 区分別→一律・同伴＝本）＝customers-keep ck(4-1)／(4-2)／(4-3) が係留（本 500＋unit4 700＝1,200／場内 300＋400＝700／上書き 600）。client＝プラン編集の区分別 3 欄（plan_fixed のみ）・cast 上書き 3 キー・商品マスターの unit4 4 欄（既存）＝`未コミット（f0 2 連未達＝run1b 緑 77 段 4,941／run2 pricing statement timeout／run2b DB 無応答＝教訓85 で停止・作業ツリーに保持）`（未 push）。

## 裁定295（本便で確定・相談役ブロック・2026-09-24）0154 要裁定 (1)〜(12) の裁定（295-1〜7）

**DB 側 完了（2026-09-24 夕・0154 手貼り済み＝295-1 decide_reason／295-7 FK は live で確認・便 A 検証 NG 0）**。client＝夜間便 2 D1〜D6（未 push）。

出典＝相談役ブロック 2026-09-24（便 S・0154_punch_pay.sql 起草時の要裁定 12 件＝mig 冒頭に列挙・突合 q0924_ag_0154.mjs 致命 0 を受けた裁定・同日収載）。次の裁定番号は 296。**本文（逐語）**:
「裁定295（2026-09-24・0154 要裁定 (1)〜(12) の裁定）
295-1 (1) punch_corrections に decide_reason text を追加。rejected は必須・approved は任意。本人の /mine で読める（RLS 本人 select）。
295-2 (2) sanction の総額上限の基底は起草どおり＝当 run に payslip があればその gross・無ければ平均賃金×当期暦日数の推計。推計基底で通した件は client が明細に「（推計基底）」を付す。
295-3 (3) sanction は mode='fixed' のみ（率は不可）。
295-4 (4) 承認時の punches 書込＝既存行 update／新規 insert(source='manager')／削除は delete し punch_corrections.punch_id は SET NULL で履歴を残す。
295-5 (5) 内部ヘルパー punch_correction_apply は 4 ロール revoke（名簿 A +4・除外 +1）。
295-6 (6)〜(11) 起草どおり（文言・ack は decided 行のみ・区分変更の期初＝period_bounds の月初・calc_period_* は nullable・営業日窓＝biz_date_of・staff 本人＝auth_cast_id 一致）。S1 の全文で裁定294 と食い違う項があれば手貼り前に相談役へ。
295-7 (12) demo_org_reset（0149）は触らない。punch_corrections の FK は cast_id→casts ON DELETE CASCADE・punch_id→punches ON DELETE SET NULL。demo の c_wipe は casts の削除で連鎖・c_load は投入しない（空）。」

適用＝便 S3〜S4（0154 の改稿＝decide_reason 列＋FK の 2 点・生成器 gen_0154.py で再生成・改稿前の控え docs/tmp/0154_before_295.sql・再突合 q0924_ag_0154.mjs に d 3 段追加）。手貼りは Agoora（新 sha は改稿後の報告値）。

## 裁定294（本便で確定・相談役ブロック・2026-09-24）0154 出退勤・報酬型・懲戒減給・計算期間・雇用区分の設計（294-1〜11）

出典＝相談役ブロック 2026-09-24（便 M・docs/tmp/0154_pre.md（D3）と docs/tmp/0924_tx_read.md（TX1-7）の読取を受けた設計裁定・同日収載）。次の裁定番号は 295。**本文（逐語）**:
「裁定294（2026-09-24・0154 出退勤・報酬型・懲戒減給・計算期間・雇用区分の設計）
294-1 表 punch_corrections: id／org_id／store_id／cast_id／punch_id(null 可＝新規打刻の申請)／biz_date／kind('in'|'out')／before_at／after_at(null＝削除)／reason(必須 NOT NULL)／requested_by／requested_at／decided_by／decided_at／decision('pending'|'approved'|'rejected')／ack('unconfirmed'|'confirmed'|'disputed')／ack_at。確定時は punches の元行を update（新規は insert・削除は delete）。punches が給与・表示の唯一の読み口であることは不変。
294-2 RPC punch_correction_request(p_cast_id, p_punch_id, p_biz_date, p_kind, p_after_at, p_reason): cast 本人・staff 本人・owner/manager が呼べる。owner/manager が呼んだ場合は同 tx 内で approved まで進める（申請＝確定・1 行）。営業日窓内・確定済み期（payroll_runs finalized/paid に含まれる日）は 'period finalized'。reason 空は 'reason required'。
294-3 RPC punch_correction_decide(p_id, p_approve boolean, p_reason): owner/manager。approved で punches を update/insert/delete・audit（理由つき 6 引数の型）。rejected は理由必須。
294-4 RPC punch_correction_ack(p_id, p_ack): 本人のみ。confirmed／disputed。disputed は店側一覧に表示（client）。
294-5 cast_plan 白名単 +3: pay_rule('actual'|'shift_guarantee'|'fixed'|'per_shift'・欠損＝'actual')／per_shift_amount(integer ≥0)／fixed_amount(integer ≥0)。set_cast_plan で検査: shift_guarantee／fixed は雇用のみ・per_shift は委託のみ（違反 'bad pay_rule for employment'）。その他保証＝現行 minimum。
294-6 payroll_adjustment_add に p_source('manual'|'settlement'|'sanction')・p_basis text・p_target_shift_id uuid を追加（既存呼出は 'manual'・null で不変）。settlement は委託のみ・basis 必須。sanction は雇用のみ・basis 必須・91 条検査＝1 件 ≦ floor(平均賃金/2)・当期の sanction 合計 ≦ floor(当期 gross/10)（平均賃金＝直近 3 期の確定 payslip の gross 合計÷暦日数・確定 payslip が無ければ 'no basis for average wage'）。違反 'sanction cap'。
294-7 settings_json 白名単 +1: settlement_presets（配列・最大 10・各要素 {code, name, amount, basis, target('late'|'absent'|'early'|'other')}・形が違えば 'bad type'）。ウィザードの既定 3 件（遅刻／当欠／早退・額 0・文は店が編集）は client。
294-8 payslips に calc_period_start／calc_period_end（date・既存行は run の period で埋め戻し）。payroll_finalize は p_payslips の同名キーを写す。days の算出は client（core.ts）で計算期間から。
294-9 casts に employment_valid_from（date・既存行は null＝不定）。RPC set_cast_employment(p_cast_id, p_employment, p_valid_from): owner のみ・p_valid_from は最後に確定した期の翌日以降かつ給与期の初日のみ・audit。過去分を付け替えない。
294-10 penalty_config の表・列は不変。自動計算の撤去は client（pay.ts fine・sim）で 0154 手貼り後の同レーン。
294-11 revoke/grant は 0151 の形。新 RPC 4 本の A/B はゲート行で決める（裁定261）。名簿 A +4 見込み。pin 走査＝payslips 10・punches 8・attendance 8・employment 3・set_store_profile 5・rate-back／store-systems（白名単 8→11）・payroll-adjust（列 +3）・honBackRate 2（教訓92）。」

適用＝便 M2〜M4（起草 supabase/migrations/0154_punch_pay.sql＝未追跡・突合 docs/tmp/q0924_ag_0154.mjs＝BEGIN…ROLLBACK）。手貼りは Agoora（要裁定の裁定後）。

**DB 側 完了（2026-09-24 夕・Agoora 手貼り済み＝便 A 検証 docs/tmp/q0924_a154.mjs 15 段 NG 0）**: sha256 4d82a688077b9ff84619799430c5529496f649d56d701242a7fc42fd6d026439・1,247 行・92,278 B（裁定295 反映版・decide_reason 列・FK cast_id CASCADE／punch_id SET NULL）。
改稿 4 本の新 md5＝set_cast_plan 9f06ceecd3846773021c0d8ff6e8e2b9／payroll_adjustment_add dc290e02e56371217dc60cf9f0cf3275（11 引数・旧 8 引数 DROP）／set_store_profile 3dad1a6effd82f535aad21fa8faa3f1d（白名単 22 キー）／payroll_finalize c193966d074e7b49f89ae04ee78e0ea6。
名簿 全数 254／gated 134（A +4＝punch_correction_request／decide／ack→A5・set_cast_employment→A10・除外 +1＝punch_correction_apply→B(a)）。payslips 11 行の calc_period_* 埋め戻し欠損 0。不触 12 本の md5 一致・statement_timeout 3s/8s/30s 不変。
収蔵 `ec6c3e3`（2026-09-25 便 F2「mig: 0154 出退勤・報酬型(手貼り済み・裁定294/295)」・client 11 本と 1 本で push＝便 F4）。v39 §5-3＝suite の net 期待値の変動（pay T1a 1,117,059→1,133,559／T1b 1,192,348→1,208,848／payroll-adjust pa(0-6d) 152,326→155,326／payroll F2f 複合 700,385→724,385）は**裁定293-3（罰金撤去）の帰結として承認・golden 3 値（5931／125802／55233）不変**（2026-09-25 便 F3）。suite 追従＝AG d 38 段を punch-match (9)／cast-guarantee (10)(11)／payroll-adjust (8)／payroll 段0154／store-profile sp(⑤-10) へ移植（夜間便 2 N4）。**目視 6 項（v39 §6）OK＝Agoora・2026-09-25。**
client（0154 レーン・未 push）: D1 出退勤の修正（今日タブ「修正」・/mine 申請と確認・異議あり warn）／D2 待遇 v2（pay_rule 4 型・pay.ts／sim 共有）／D3 罰金撤去（fine／normPenalty 0・文言 27 箇所）／D4 精算調整（ひな形・登録・未登録候補）／D5 懲戒減給（91 条の和文・推計基底）／D6 雇用区分（set_cast_employment UI・calc_period の days）。

## 裁定293（本便で確定・相談役ブロック・2026-09-24）弁護士 L1〜L7 の反映（293-1〜8）＋追補1（精算調整の運用形）

**DB 側 完了（2026-09-24 夕・0154 手貼り済み）＝293-3（罰金撤去＝client D3・penalty_config は検知として残置）・293 追補1（精算調整＝settlement_presets／payroll_adjustment_add source=settlement＝client D4）・293-8 の 0154 は live**。0152／0153／0155 は未着手。

出典＝相談役ブロック 2026-09-24（便 D1・docs/NOX_専門家確認事項_2026-08-27.md の弁護士 L1〜L7 の回答を受けた裁定・追補1 は同日先行受領＝215c1e4・本文は本便で差し込み）。次の裁定番号は 294。**本文（逐語）**:
「裁定293（2026-09-24・弁護士 L1〜L7 の反映。全項ローンチ範囲）
293-1 L1 売掛: 店設定 receivable_policy は「売掛不可」「店舗負担」の 2 値。新規店の既定＝売掛不可。「キャスト負担→給与天引き」経路（0148 の 'cast' と F2e の天引き）は撤去。キャストが客の料金を立て替えた場合は cast_advance（立替債権）として別台帳に記録し、給与・報酬と自動相殺しない。partial／oldest-first は顧客売掛の入金充当順序としてのみ残す。既存 org（CLUB NOX）の設定は現状維持。
293-2 L2 記録保持: audit_logs に retention_until と category（financial／operation）。financial（給与・報酬・売掛・会計・契約区分・報酬制度の変更）＝7 年標準・operation＝店設定（既定 1 年）。期限まで immutable（UPDATE／DELETE 不可の RLS＋トリガ）・期限後は自動削除または匿名化（cron・Vercel Pro 後まで手動）。顧客 CRM は店が保持年数を設定し、期限後は削除または匿名化。
293-3 L3 ノルマ・罰金: 汎用「罰金」機能を廃止（改名ではなく撤去）。penalty_config による自動計算（遅刻 n 回×額・当欠×額・ノルマ未達）はローンチ範囲から外す。雇用＝①不就労控除（実働払いで自動・シフト時間保証／固定給では無し）②懲戒減給（就業規則の根拠フラグ必須・1 件≦平均賃金 1 日分の半額・1 賃金支払期の総額≦賃金総額の 1/10 を RPC でハード検査・上限内でも適法とは限らない旨を画面に注記）③損害賠償・売掛負担＝給与外の別債権・自動天引き禁止。委託＝報酬条件（comp_plans／cast_plan）＋実績に応じた報酬計算＋例外的な精算調整（run 別調整控除の器に手入力・理由／契約根拠／対象取引を必須保存・自動計算しない・NOX 独自の % 上限は置かない）。ノルマは目標と達成状況の表示・達成バックのみ。裁定291 追補1 の C-1／C-2 は本項で置き換え、C-3 の労働者性注記は維持。運用形は 293 追補1。
293-4 L4 顧客: 0153 は続行。customers に last_visit_at／retention_until／deleted_at／anonymized_at。店設定に顧客情報の利用目的（必須・テンプレ「当店では、予約・来店管理、接客サービス、ボトルキープその他店舗サービスの提供およびこれらに付随する顧客管理のため、顧客情報を利用します。」・ウィザード STEP に追加）・第三者共有は標準 OFF・最終来店からの保持年数（既定 3 年）。
293-5 L5 キャスト個人情報: マイナンバーは cast_sensitive（別表・暗号化）に加え、閲覧者限定（owner のみ）・閲覧ログ（audit financial）・退職後の削除期限（法定保存期間終了後・既定は退職翌年から 7 年経過で対象）・廃棄ログ my_number_deleted_at／deleted_by／deletion_method。写真・LINE ID は通常個人情報として退職後アカウント無効化→必要項目のみ保持→期限後削除。
293-6 L6 規約: BANZEN 型条項を残しつつ責任を分割＝店舗（入力内容・契約区分・制度選択・必要な同意）／NOX（設定どおりの計算・システム運営・セキュリティ・NOX 自身の個人情報取扱い）。法令違反を起こしやすい設定へのプロダクト側ガード（293-1〜5・291 追補1）を維持。
293-7 L7 デモ: 完全架空名＋イラスト／生成アバターに統一（実在の写真禁止）。デモ規約（実在人物の個人情報を入力しない／本番利用禁止／データはリセットされる／計算結果を給与等へ利用しない／不正利用禁止）を /demo 入場前に表示。magiclink のメールアドレスは短期保持（入場ログは 30 日で削除）。
293-8 mig の配置: 0154（出退勤・打刻修正・報酬型・懲戒減給 91 条・penalty 自動計算の撤去・T1 計算期間・T3 雇用区分の期間）→ 0152（紹介料・withholding_category）→ 0153（顧客・キープ＋293-4）→ 0155（売掛分離 293-1・audit retention 293-2・マイナンバー廃棄 293-5）→ 0156（日払い・前借り T9）。デモ録画は 0153 の後。」

**DB 側 完了（2026-09-24 夕・0154 手貼り済み）＝A（出退勤の修正＝punch_corrections／request／decide／ack）・B（報酬型＝cast_plan 白名単 +3）・C（懲戒減給＝payroll_adjustment_add source=sanction／91 条検査）は live。client＝夜間便 2 D1／D2／D5（未 push）。**

**追補1（本便で確定・逐語）**: 「裁定293 追補1（2026-09-24・精算調整の運用形）
1. 名称は「精算調整」。店は「精算調整のひな形」を持つ（名称・既定額・契約根拠の文・対象＝遅刻／当欠／早退／その他。既定ひな形 3 件をウィザードと報酬制度タブで設定・文は編集可）。委託キャストにのみ表示。
2. 今日タブと給与の明細で、遅刻・当欠・早退が検知された行に「精算調整を登録」ボタン（ひな形と額を初期表示）。owner／manager が押して確定＝run 別調整控除（0146 の器）に 1 行（理由＝ひな形名・契約根拠＝ひな形の文・対象取引＝該当日のシフト id・source='settlement'）。自動計算・自動天引きはしない。
3. 額はその場で変更可。確定後は給与プレビューに「精算調整 −¥n（遅刻 9/24）」として明細表示・本人の /mine にも同文言で見える。確定済みの期は登録不可。
4. 月次一覧に「精算調整の未登録候補: n 件」（遅刻・当欠が検知され登録の無い日）を出す＝登録忘れ防止。候補は人が確定するまで金額に影響しない。
5. 雇用キャストにはこの機能を出さない（不就労控除は自動・懲戒減給は別画面）。
6. 器: penalty_config の遅刻／当欠の閾値（何分から遅刻か）は「検知の条件」として残す。額の自動適用だけを撤去。」

適用＝未着手（291 追補1 C-2「報酬調整（契約）」の運用形＝本追補で「精算調整」に確定・0154 の設計材料＝docs/tmp/0924_tx_read.md TX1-7）。
**293-4 の器＝0153 で本番（2026-09-25・裁定305-11）**: customers.last_visit_at／retention_until（check_close が更新・店設定 customer_retention_years 既定 5）／deleted_at／anonymized_at・stores.settings_json.customer_purpose／customer_retention_years（set_store_profile 白名単 +2・店舗情報 2 欄＝`未コミット（f0 2 連未達＝run1b 緑 77 段 4,941／run2 pricing statement timeout／run2b DB 無応答＝教訓85 で停止・作業ツリーに保持）` 未 push）。削除・匿名化の RPC は 0155（事前読取 docs/tmp/0155_pre.md (d)）。

## 裁定292（本便で確定・相談役ブロック・2026-09-24）税理士回答 T1〜T9 の反映（292-1〜7）

出典＝相談役ブロック 2026-09-24（docs/NOX_専門家確認事項_2026-08-27.md の税理士 T1〜T9（9/24 追補 T7〜T9 含む）の回答を受けた裁定・同日収載）。次の裁定番号は 293。**本文（逐語）**:
「裁定292（2026-09-24・税理士回答 T1〜T9 の反映）
292-1 T2: ホステス報酬の源泉は floor（1 円未満切捨て）。給与・消費税・源泉で丸め関数を分ける（共通 round を源泉に使わない）。golden 125802 は本裁定で張り替え（単独便・段別内訳を台帳に）。
292-2 T8: 裁定284（サ料に税を掛けない店設定）は撤回。税方式は現行のまま。客負担の紹介料はセット料金に合算し課税対価に含める（裁定280 追補1 のとおり）。0152 は紹介料のみ。
292-3 T7: referrers に withholding_category（none／salesperson／employee）。salesperson は外交員報酬として（月支払−120,000）×10.21% を月締め払いで計算し payouts に源泉額を持つ。当日現金払いは源泉額を同じ式で記録（渡す額＝額面−源泉）。employee は給与側へ送る（第2期）。
292-4 T9: 日払い＝報酬の支払＝支払時に源泉を計算して記録。前借り＝貸付残高（源泉なし）。月末は差額精算。年越しの渡しすぎは翌年の報酬を負にせず過払債権として別残高。設計は週末バックログ 4 の読取（AV-5）の後に mig 0155 として起草。
292-5 T1: payslips に計算期間の start/end を持ち days＝両端含む暦日数。期中入退店はその人の計算期間で切る。
292-6 T3: cast_tax_profiles に registration_start_date／end_date・雇用区分の有効期間。過去分を付け替えない。
292-7 T4〜T6: 現状との差分を読取で確認し、違う点だけ小物で直す（税の端数は伝票×税率ごとに 1 回・値引後に課税・カード手数料転嫁は標準 OFF＋確認フラグ）。」

適用＝未着手。292-2 により **裁定284 は撤回**（docs/tmp/0152_design_draft.md の「1-4 stores.service_taxable」「3 節の 284 差分」「D8／D10」は 0152 の対象外＝0152 は紹介料のみ）。292-1 の golden 張り替えは単独便（段別内訳を本台帳へ）。292-4 は AV-5 の読取後に mig 0155。

## 裁定290（本便で確定・相談役ブロック・2026-09-24）キャスト側 希望シフトのカレンダー化（290-1〜5）

出典＝相談役ブロック 2026-09-24（便 AX・番号は 291／292 の後に収載＝291・292 は収載済み・次の裁定番号は 293）。**本文（逐語）**:
「裁定290（2026-09-24・キャスト側 希望シフトのカレンダー化）
290-1 /mine/wishes の提出は月グリッドのカレンダー形式にする。募集中（open）の期間に含まれる営業日だけ活性・それ以外は disabled。提出済みの日は状態（審査中／承認／却下）の印を出す。
290-2 日をタップで選択／解除。時間は一括既定（店の営業時間・未設定なら 20:00〜26:00）＋日別の上書き可。
290-3 「提出」で選択日ごとに既存 shift_wish_submit を順に呼ぶ（新 RPC なし・非原子）。途中失敗は「n/m 件を提出」と失敗日を赤で残し再提出可。1 日 1 枠は DB の部分 unique が守る。
290-4 取り下げは既存の口のまま。締切超過は案内のみ（裁定43）。
290-5 休みだけ提出（裁定58・shift_wishes.kind）は第2期。」

適用＝便 AX（client のみ・新 RPC なし・仮決め＝docs/tmp/0924_ax_decisions.md）。

## 裁定291（本便で確定・相談役ブロック・2026-09-24）出退勤の時刻記録・修正・勤務時間の計算方式（291-1〜6）

出典＝相談役ブロック 2026-09-24（便 AT の読取 docs/tmp/0924_at1_read.md＝attendance_set は時刻を書かない・時給の勤務時間は punches・時刻 RPC なし、を受けた裁定・同日収載）。次の裁定番号は 292。**本文（逐語）**:
「裁定291（2026-09-24・出退勤の時刻記録・修正・勤務時間の計算方式）
291-1 店の設定 work_hours_basis: 'punch'（実際の出退勤時刻＝現行）／'shift'（確定シフトの時間どおり）。settings_json 白名単 +1（mig 0154）・欠損は 'punch'＝golden 不変・ウィザード STEP 3 に 2 択（既定は 'shift'＝多数派）。
291-2 'shift' のとき勤務時間＝確定シフトの start〜end。遅刻・当欠は現行の判定と罰金のまま。早上がりは 'shift' では時間を差し引かない（罰金で取る店の型）・本人都合／店都合の区別は第2期。
291-3 出勤区分（出勤・遅刻・同伴）を今日タブで押したら attendance_set の後に punch_proxy(cast,'in') を呼ぶ（既に in があれば呼ばない）。client のみ・先行可。退勤は現行どおり punch_proxy('out')。
291-4 mig 0154: punch_set(p_cast_id, p_biz_date, p_kind in/out, p_at, p_reason)／punch_delete(p_punch_id, p_reason)。owner/manager 自店のみ・営業日窓内・確定済み（finalized/paid）の期に属する日は 'period finalized'・理由任意・before/after を audit_logs。名簿 A +2・pin 9 suite。
291-5 今日タブの時刻表示の右に「修正」（owner/manager）＝出勤・退勤の時刻を入力するモーダル（裁定265 型）。締め前に「退勤の記録が無い勤務が n 件」の warn（AV-4 と同じ文言）。
291-6 順序: 291-3 と表示は次の client 便・0154 は AU／AX の後の f0 便で push してから起草（0152 より先・小さく独立）。」

適用＝未着手（291-3・291-5 の client は次の client 便／0154 は f0 便の push 後に起草）。読取＝docs/tmp/0924_at1_read.md（AT1-1〜5）・仮決め＝docs/tmp/0924_at_decisions.md。
**追補1（本便で確定・相談役ブロック 2026-09-24・社労士 S-1／S2 の反映・同日 2 版目＝1 版目（6 項・work_pay_rule 3 値・`1b9cac5`）は本版で置換・逐語）**: 「裁定291 追補1（2026-09-24・社労士 S-1／S2 の反映＝勤務記録・報酬計算・時刻修正の分離。全項ローンチ範囲）
A 勤務記録
 A-1 「勤務時間の計算方式」2 択は廃止。店設定 work_hours_basis は作らない。
 A-2 雇用キャストは必ず実出退勤を記録（punches）。委託キャストも記録するが呼称は「稼働実績」（雇用は「労働時間」）＝画面の用語を契約区分で出し分ける。
 A-3 「出勤」区分を押したら in を書く。退勤も同じ重み。
B 報酬・給与計算（契約区分で選べる型を出し分け・器は comp_plans／cast_plan）
 B-1 雇用: 実働時間払い（現行の時給×実働）／シフト時間保証（確定シフトの時間を下限に保証・超過は実働）／固定給（期ごとの定額・期中入退店は暦日按分）／その他保証（月額保証＝現行 minimum の型）。
 B-2 委託: 時間報酬（現行）／1 稼働固定（出勤 1 回あたり定額）／売上歩合（現行の売上バック・スライド）／各種バック（現行）／保証報酬（現行 minimum＋期限つき保証）。
 B-3 全型ローンチ範囲。設定は cast_plan の overrides（pay_rule／per_shift_amount／fixed_amount）＝mig 0154 の白名単・計算は pay.ts。
C 遅刻・早退
 C-1 雇用: 不就労時間控除のみ（実働払いなら自動・シフト時間保証と固定給では控除しない）。懲戒減給は別機能（run 別調整控除の型・労基法 91 条の上限＝1 回の額は平均賃金 1 日分の半額以下・総額は当期賃金総額の 1/10 以下を RPC で検査）。「罰金」は使わない＝雇用キャストには penalty_config を適用しない（設定画面で非表示・既存設定があれば無視して warn）。
 C-2 委託: 「罰金」の機能名を廃止し、現行 penalty_config は「報酬調整（契約）」に改名して委託にのみ適用。遅刻・当欠の閾値と額は現行の器のまま。
 C-3 労働者性の警告: 委託キャストに「報酬調整（契約）」または「1 稼働固定」を設定したとき、待遇画面に「強い時間拘束を伴う場合は労働者性の判断に影響します」の注記を常時表示（文言は L3 の回答で更新）。
D 打刻の修正（mig 0154）
 D-1 本人（cast／staff）→ 修正申請 punch_correction_request(p_punch_id または p_cast_id＋p_biz_date＋p_kind, p_at, p_reason)。owner／manager → 確定 punch_correction_decide(p_id, approve／reject, p_reason)。manager／owner が直接直す場合も同じ表に「申請＝確定」で 1 行残す。
 D-2 必須保存＝元時刻／修正後時刻／修正者／日時／理由（理由は必須）。audit_logs に加え punch_corrections 表で本人に見える形で保持。
 D-3 本人の同意は必須にせず ack_status 未確認／確認済み／異議あり を本人が更新（/mine）。異議ありは店側の一覧に表示。
 D-4 確定済み給与の期に属する日は修正不可（'period finalized'）。営業日窓内のみ。
E 旧 291-1〜291-6 は本追補で置き換える。0154＝punch_corrections 表＋修正 2 RPC＋cast_plan 白名単（pay_rule／per_shift_amount／fixed_amount）＋懲戒減給の 91 条検査＋penalty の適用区分。」
＝旧 291-1〜291-6 は本追補で置換（work_hours_basis は作らない・0154＝punch_corrections 表＋punch_correction_request／decide＋cast_plan 白名単 3 キー＋91 条検査＋penalty の適用区分）。1 版目（work_pay_rule 3 値・punch_set／punch_delete）は無効。 **C-1／C-2 は裁定293-3 で置換（2026-09-24・遡及追記＝罰金の汎用機能は改名ではなく撤去・精算調整の運用形は 293 追補1）。C-3 の労働者性注記は維持。**

## 裁定289（本便で確定・相談役ブロック・2026-09-24）0151 要裁定 (1)〜(8) の裁定（289-1〜7）＋追補1（夜間便の仮決め承認）

出典＝相談役ブロック 2026-09-24（便 S1・0151_holes.sql 冒頭の要裁定 (1)〜(8)＝便 AE 起草／便 AG 突合／2026-09-24 R1 再掲を受けた裁定・同日収載）。次の裁定番号は 290。**本文（逐語）**:
「裁定289（2026-09-24・0151 要裁定 (1)〜(8) の裁定）
289-1 (1) staff_shift_cancel の行不在は raise 'not_found'（下線）。staff_shift_confirm／override と同じ文言に揃える。'forbidden' は org 不一致のみ。
289-2 (2) shift_open_periods_mine は cast 以外・cast 行なしの呼び出しで 0 行を返す（raise しない）。読取専用 RPC のため、裁定287-2 を維持。未認証は既存どおり permission denied。
289-3 (3) set_cast_guarantee は cast_plan の現在行 C が無いとき raise 'no plan'。保証は既存プランへの上書きであり、プラン無しで保証行だけを作らない。client は「先に報酬プランを設定してください」と案内。
289-4 (4) 保証行の overrides_json は C の他キーを継ぎ base と guarantee だけ上書き（起草どおり）。
289-5 (5) 戻し行は直前の非保証行が base キーを持つときだけ復元、持たなければ base キーを外す（起草どおり）。
289-6 (6)(8) 'guarantee exists' は次のいずれかで raise: ①p_start〜p_end と重なる別の保証行がある（valid_to null か valid_to >= p_start、かつ valid_from <= p_end。C 自身は除く） ②valid_from > p_start の別の保証行がある（骨格は C を割る形しか持たず、既存の予定より前に差し込めない）。延長＝前の保証行の valid_to < p_start かつ後続の保証行なし＝通る。
289-7 (7) 返す列は start_date／end_date／wish_deadline の 3 列（一致・変更なし）。
289 追補1（夜間便の仮決め承認）: N4 (a) 延長は終了日翌日から同額（(b) 経路）／(c) 残り日数＝終了日−今日・終了日当日は「あと 0 日」で印あり／(e) 予定があるときは「保証を設定」を無効化（DB も 289-6 ②で止める）。N5 締切超過の日は選べるまま（DB は拒否しない・案内のみ＝裁定43）。N6 別枠なら配置可・同枠は画面で止める・入口①は cast 以外の active membership 全員。N7 B 群（stripe／cron／print poll・result）は差し込みなし・layout の orgs 読取は新規 fetch 1 を記録して許容・dateshift の +1 日は再生側を正とし poc-record.mjs は不触。N8 D1〜D12／E1〜E10 は 0152 の★指定便で裁く。」

適用＝便 S2（0151_holes.sql の改稿＝'not_found'・'guarantee exists' の ①②）／S3（client・suite の追従＝rpc-err 和文・AG d3-7＝`96afa4f`）／S4（再突合 BEGIN…ROLLBACK＝致命 0・d3-7 緑）。
**DB 側 完了（2026-09-24・mig0151 手貼り済・A-0〜A-4 検証 OK＝live に 'not_found'／289-6 の判定式を prosrc で確認・suite 追従 `6d70483`／`30f9b59`・mig 収蔵 `cb24385`）**。手貼りは Agoora（手順は相談役が新 sha を埋めて出す）。

## 裁定288（本便で確定・Agoora 回答（9/18）に基づく・2026-09-18）スライドの基準と適用月（288-1〜7）

出典＝相談役ブロック 2026-09-18 夜（夜間便 N3b-0・同日収載）。**本文（逐語）**:
「[裁定288 スライドの基準と適用月]
 288-1 slide_apply='next'(翌月反映)のとき、段の判定に使う実績は「前月(暦月・営業日基準で 1 日〜末日)の売上合計／ポイント合計」とし、
   sales_slide／point_slide の閾値は月間合計として解釈する。
 288-2 適用は「当月に属する営業日すべて」に同じ段を当てる。給与の期が半月でも、同じ暦月の前半と後半で段は変わらない。
   期が月をまたぐ場合は、営業日ごとにその日が属する暦月の前月の実績で段を決める。
 288-3 前月の実績が無い(前月に該当 cast の売上・ポイントが 0 件)場合は最下段＝プランの基本時給。
 288-4 slide_apply='current' または欠損のときは現行どおり(営業日ごとの売上・ポイントでその日の時給を決める・閾値は 1 日あたり)。
   既存店と golden は不変。基準(月間／1 日)の切替は slide_apply に連動させ、別の設定は持たない。
 288-5 時給は現行と同じく max(売上スライドの時給, ポイントスライドの時給, base)。base は N3 の日単位の保証を含む。
 288-6 前月の実績は前月の伝票から集計する(確定 payslip の凍結値に依存しない・裁定287-4)。集計の定義は現行の当月の売上・ポイントの
   集計と同じ式を前月の窓に当てる。
 288-7 plan-editor の段の入力欄は、店の slide_apply に応じて単位表示を「月間売上 ○円以上」／「1 日の売上 ○円以上」に出し分ける。
   シミュレーションも同じ分岐に従う。」

適用＝夜間便 N3b（計算側＝client `fc5f7e1`）。ウィザードの 'next' 書き込み（285）＝**`e76fae4`（2026-09-24・完了 step の patch に slide_apply:'next'・既存店は不触＝欠損 'current'・setup suite 61→66）**。
**DB 側 完了（2026-09-24・mig0151 ★4 手貼り済＝set_store_profile 白名単 21 キー（'slide_apply'）・md5 f2196d09→a988029017d1c9327f33af98f6d0e621・store-profile 58→61／store-systems 21 キー pin `5f76dbc`）**。

## 裁定287（本便で確定・Agoora「推奨で」・2026-09-18）mig 0151 の設計（穴埋め 4 点）（287-1〜5）

出典＝相談役ブロック 2026-09-18 夜（便 AD・便 AC の事前読取 docs/tmp/0151_holes_pre.md を受けた裁定・同日収載）。**本文（逐語）**:
「[裁定287 mig 0151 の設計(穴埋め 4 点)]
 287-1 黒服シフトの取消＝RPC staff_shift_cancel(p_id uuid, p_reason text default null)。行を delete する(写経元 shift_remove)。
   status に 'cancelled' は足さない。proposed は理由不要。confirmed は p_reason が空なら raise 'reason required'、あれば delete を許す。
   biz_date が営業日の今日より前なら raise 'biz_date_past'(staff_shift_override と同じ判定)。権限は staff_shift_can_manage。
   audit は before に行全体・after null・理由を含める。課金ゲート行あり(名簿 A)。
 287-2 募集中の期間をキャストが読む口＝RPC shift_open_periods_mine()。引数なし。actor は shift_wish_submit 冒頭と同じ(auth_cast_id)。
   自分の所属店の shift_periods のうち status='open' の行について start_date・end_date・wish_deadline のみを返す(id・status ほかは返さない)。
   RLS は変更しない。書込なし・課金ゲート行なし(名簿 B(f))。cast 以外が呼んだ場合は 0 行。
 287-3 保証時給を期限つきで入れる口＝RPC set_cast_guarantee(p_cast_id uuid, p_amount integer, p_start date, p_end date)。
   検証: p_amount > 0・p_start >= current_date・p_end >= p_start。不成立は raise 'bad amount'／'bad valid_from'／'bad valid_to'。
   現在行(valid_to is null の行)を C とする。
   (a) p_start > C.valid_from のとき: C.valid_to = p_start - 1 → 保証行を insert(valid_from=p_start・valid_to=p_end・plan は C と同じ・
       overrides_json＝C の overrides_json に base=p_amount と guarantee=true を上書き)→ 戻し行を insert(valid_from=p_end+1・valid_to null・
       plan と overrides_json は C と同じ。ただし C 自身が guarantee=true の場合は guarantee を外し base を C の直前の非保証行の値に戻す。
       直前の非保証行が無ければ base キーを外す)。
   (b) p_start = C.valid_from のとき(入店当日からの保証・延長): C を保証行に書き換える(valid_to=p_end・overrides_json に base と guarantee=true)→
       戻し行を insert((a) と同じ規則)。
   (c) p_start < C.valid_from は raise 'bad valid_from'。
   既に p_start 以降に開始する別の保証行(guarantee=true)がある場合は raise 'guarantee exists'。
   保証の印は cast_plan.overrides_json の guarantee キーで持ち、列追加・別表は作らない。set_cast_plan の白名単は変更しない
   (guarantee キーを書けるのは set_cast_guarantee のみ)。権限・課金ゲート行・audit は set_cast_plan と同じ(名簿 A)。
   mode は minimum 相当のみ(時給の式が max を採るため)。fixed は第2期。
 287-4 スライド適用月＝set_store_profile の白名単に 'slide_apply' を 1 キー追加(0147 と同型)。値は 'next'|'current' 以外で raise 'bad slide_apply'。
   欠損は 'current' として扱う(client 側)。前期の実績は前期の伝票から集計し直す(確定 payslip の凍結値には依存しない)。
 287-5 期の途中で保証が切れる場合の日単位の適用は、mig 後の client 便で collect の行選択と pay.ts の base を日ごとに改める(裁定97 の
   「期首時点の 1 行」を、保証行に限り日単位に改める追補として扱う)。」

適用＝起草（便 AE）→ 改稿（便 S2・裁定289）→ 突合（便 AG／S4＝致命 0）。
**DB 側 完了（2026-09-24・Agoora 手貼り済・sha256 `0abb484903141685c01421e5c90e68283cfef4a11e4fb44cd67e2cf9866c6125`・462 行・37,681 B・set_store_profile 新 md5 `a988029017d1c9327f33af98f6d0e621`・名簿 全数 249／gated 130・md5 控え 17 本不変・service_role statement_timeout 30s 不変・収蔵 `cb24385`）**。client＝夜間便 N4／N5／N6（RPC 不在の probe→隠す型は手貼り後に自動で出る）。

## 裁定283〜286（本便で確定・Agoora 回答（9/18）と調査結果に基づく・2026-09-18）mig の束ね方・税方式・スライド適用月・紹介料の細目

出典＝相談役ブロック 2026-09-18 夜（便 AA・便 V／V2／V3／W の読取結果を受けた裁定・同日収載）。**本文（逐語）**:
「[裁定283 mig の束ね方と順序] 0151＝穴埋め 4 点(黒服シフトの取消 RPC／募集中の期間をキャストが読む口／保証時給を期限つきで入れる口／
   スライド適用月の店設定)。0152＝紹介料の作り直し(裁定280＋追補1)と税方式の追加を 1 本で(どちらも check_group_due を改めるため)。
   0153＝顧客の複数紐づけ・注文者・キープ(ボトルの名前・1 杯出す)。順序は 0151→0152→0153。デモの録画は 0152 の後。
   従前の「紹介料＝0151」の呼称は本裁定で 0152 に改める(docs/tmp/0151_pre.md は紹介料の事前読取として名称を据え置く)。
[裁定284 税・サービス料の方式] 外税のとき「サービス料に税を掛けるか」を店の設定として持つ。掛ける＝現行(小計＋サービス料に税)、
   掛けない＝サービス料と税をどちらも小計に掛ける(小計 6,000・各 10% で 7,200)。既定は現行どおり(既存店・golden 不変)。
   奉仕料の課税区分と請求書記載は税理士確認 T5 として追加。
[裁定285 スライド適用月の入れ方] 店設定 slide_apply＝'next'(翌月反映)|'current'(当月遡及)。欠損は 'current' として扱い、既存店と golden は不変。
   新規店はウィザードが 'next' を書き込む(裁定282-4 の「既定」はこの形で実現する)。前期の実績が無い期は最下段(プランの基本時給)。
[裁定286 紹介料の細目] rate_all の再計算は check_recalc の冒頭 1 箇所で行う(14 本の RPC には手を入れない)。
   紹介料は伝票全体に対して計算し、客負担の行は pay_group 'A' に載せる。合算(merge)は into 側の紹介を残し from 側の紹介は破棄する。
   支払済の紹介料がある伝票は void 不可(receivable settled と同型)。」

適用＝未着手（0151 の事前読取＝便 AC docs/tmp/0151_holes_pre.md／逐語 0151_holes_live.md）。呼称の改め＝裁定280（紹介料）の mig は **0152**（280 の適用欄「0151 の client 便」は 0152 と読む・docs/tmp/0151_pre.md は名称据え置き）。税理士確認 T4（外部キャッチの税務・280-8）・T5（奉仕料の課税区分＝284）。
**裁定284 撤回（遡及追記 2026-09-24・出典＝便 TX0b・相談役ブロック）**: 裁定292-2（税理士 T8 回答＝サービス料・奉仕料も課税対価で「サービス料だけ非課税」の 7,200 方式は税額計算として不整合）により **裁定284 は撤回**。税方式は現行のまま（0152 は紹介料のみ・stores.service_taxable は作らない）。本文は消さず本注記のみ追記。
**裁定283 追補1（本便で確定・Agoora 回答（9/18）に基づく・2026-09-18・逐語）**: 「[裁定283 追補1] 0151(穴埋め)・0152(紹介料の作り直し＋税方式)・0153(顧客の複数紐づけ・注文者・キープボトル)は、いずれもローンチ前に
   実装する。裁定125 のローンチ範囲表に次を追加する: R11 改(紹介料＝裁定280・0152)／税・サービス料の方式(裁定284・0152)／
   黒服シフトの取消と配置フロー(裁定287-1・S)／募集期間のキャスト表示(裁定287-2)／保証時給の期限(裁定282・287-3)／
   スライド適用月(裁定285・287-4)／顧客の複数紐づけ・注文者・キープボトル(0153)／メッセージ表示の型(裁定281)／業態別公開デモ(裁定273・276〜279)。
   デモの録画は 0152・0153 の後とする(裁定283 の「0152 の後」を改める)。」
適用＝裁定125 のローンチ範囲表への追加は本追補で確定（表の書き換えは次の docs 便）。

## 裁定282（本便で確定・Agoora 回答（9/18）に基づく・2026-09-18）待遇: 保証時給の期限・スライドの適用月（282-1〜5）

出典＝相談役ブロック 2026-09-18 夕（便 W w9・Agoora 回答（9/18）に基づく・同日収載）。**本文（逐語）**:
「[裁定282 待遇: 保証時給の期限・スライドの適用月]
 282-1 プラン側の時給の名称を「基本時給」に統一(期限なし)。「保証時給」はキャスト個別・期限つきのものだけを指す。
 282-2 キャストごとの保証時給＝金額＋開始日＋終了日。期間中はその時給、期限後は自動でプランの基本時給に戻る。判定は営業日単位。
   延長は新しい期間として追加し履歴を残す。確定済みの給与は変わらない。
 282-3 期限が近い保証はキャスト一覧に印とホームのお知らせ。
 282-4 スライドは翌月反映型(前期の実績で次期の段が決まる)を既定とし、店の設定で当月遡及型に切り替えられる。
 282-5 裁定271 で第2期とした newcomer_guarantee(期間付き時給)はローンチ範囲に戻す。」

適用＝未着手（事前読取＝便 W・docs/tmp/0918_guarantee_slide_pre.md／逐語 docs/tmp/0918_guarantee_slide_live.md・結論は書かない）。271-9（newcomer_guarantee は投入しない）は 282-5 で解除。

## 裁定281（本便で確定・Agoora 指摘（9/18）に基づく・2026-09-18）メッセージ表示の型（UI 横断）（281-1〜6）

出典＝相談役ブロック 2026-09-18 夕（便 U・Agoora 指摘（9/18）に基づく・同日収載）。**本文（逐語）**:
「[裁定281 メッセージ表示の型(UI 横断)]
 281-1 種別は 4 つ: error(赤)／success(緑)／warn(黄)／info(通常色)。色は既存トークンのみ。
 281-2 error は赤枠＋薄い赤地＋赤系の文字＋先頭に記号「！」。success は先頭に「✓」、warn は「△」。色だけで区別しない。
 281-3 操作の結果は、操作したボタンと同じカード内(ボタンの直下または直上)に出す。ページ最上部の共有枠に出すのは、
    ページ全体に関わるもの(読み込み失敗・権限なし等)だけ。
 281-4 error は自動で消さない。次の操作の開始・タブ切替・同じ枠への success 表示で消える。error と success を同時に表示しない。
    success は従来どおり(自動で消す画面はそのまま)。
 281-5 error は role="alert"、success・info は role="status"。
 281-6 共通部品 1 本(components/ui 配下)にまとめ、各画面の個別実装を置き換える。文言は変えない(T-2 で直す期間重複の文言を除く)。」

適用＝**client `574752b`（便 U・push＝便 F0 `3430e6d..6ef7c29`）**: components/ui/toast.tsx を拡張（新設せず）＝Message（kind 明示・role・data-message-kind・記号・既存トークン --danger 系／--success 系／--warning 系／--line2・--card2）＋ Toast（msg 1 本の従来型＝文言→種別の純関数 messageKindOf で Message を描く・失敗／エラー／できません／生の RPC 語→error・しました→success・他 info）＋ useClearOn（残留解消の型）。U-1 調査＝docs/tmp/0918_messages.md（描画箇所 N＝106・58 ファイル＝error 固定 10／成否で色分岐 29／単一 state 67・見た目 赤 57／通常色 48／緑 1・位置 カード内 83／ページ最上部 23）。置換＝素の <p>／<span> 69 箇所を script で共通部品へ（error 名の state 21＝Message kind="error"・他 48＝Toast 自動判定）＋ 3 箇所を手で（business-hours の素の {msg}・login の role=alert <p>・staff-shift-board の kind ok/bad オブジェクト）＋ <Toast> 既存 23 箇所は部品側の変更で追随＝**置換 95／106**。残り 11＝描画行ではない行（props の setMsg 渡し・disabled={costsError} のボタン・setMErr 呼び出し等＝見送り不要）。ページ最上部の共有枠（<Toast msg={msg} /> 23 画面）は**据え置き（見送り）**＝各画面の操作結果を全てカード内へ移すのは画面ごとの構造変更＝本便は shift-board の期間フォームのみカード内へ（便 T）・残りは画面ごとの便で。suite verify:nox-messages **11**（純関数 8＋許可列挙 pin「素の描画 0」＋Toast→Message 経由＋shift-board の結線・f0 61 段目・逆テスト＝ERROR_WORDS から「失敗」を外す→ms(1-6) 赤→戻して緑）。tsc 0・ui-tokens 新規 0。目視（dev 3200・1280／375）: ① /shift 期間重なり＝赤（rgba(226,103,98,.11) 地・role=alert・「！」）で作成ボタンの直下・同カード・ボタン disabled／④ 成功＝緑（rgba(77,195,125,.11)）・同時表示なし（count 1）／⑤ タブ切替でメッセージ 0／③ /master/seats の 41 字名＝生の 'bad name' が info（通常色）で出た→messageKindOf に生 RPC 語を追加して error に（ms(1-8)）／② レジの失敗操作（入金後の取消）は目視未実施（ボトルキープ登録は未選択だと disabled＝失敗を起こせず）・375px で折り返し（幅 311・高さ 39・横はみ出し 0）。★トークン不足なし。

## 裁定280（本便で確定・Agoora 回答（9/18）に基づく・2026-09-18）紹介料の作り直し（R11・裁定272 追補 案 Q の撤回）（280-1〜8）

出典＝相談役ブロック 2026-09-18 夕（便 P・Agoora 回答（9/18）に基づく・同日収載）。**本文（逐語）**:
「[裁定280 紹介料の作り直し(R11・裁定272 追補 案 Q の撤回)]
 280-1 受取人は紹介者(外部のキャッチ、または自店スタッフ)。キャストの給与には乗せない。0148 の「cast gross に加算」(案 Q・pay.ts の
   referralTotal 経路)は撤回し、0151 の client 便で撤去する。
 280-2 紹介者マスタ(店単位): 名前・種別(外部／スタッフ)・既定の方式・既定の値・既定の負担・有効。
 280-3 方式 3 種: rate(初回セット料金×人数分に対する %)／fixed_person(1 人あたり固定)／fixed_group(1 組あたり固定)。
 280-4 負担 2 種: customer＝伝票合計に含め、セット料金と同じ扱い(サービス料・税の対象)。客向けの面(領収書・印字)ではセット料金に合算し
   別行を出さない。店内のレジ明細では内訳を見せる。store＝伝票合計に含めない。
 280-5 金額は付与時に自動計算・セット中の人数変更で再計算・会計確定時の値で凍結。延長・ドリンクは対象外。1 伝票 1 紹介。
   rate の対象は税・サービス料を乗せる前の初回セット料金×人数。
 280-6 支払管理: 会計確定で紹介料の支払 1 件(未払)。当日現金払い＝支払済にし日報の現金照合に出金として反映／月締め＝紹介者別の
   未払一覧からまとめて支払済に。
 280-7 0151 で demo_org_reset の表順配列(c_wipe／c_load)に新表を追加し、「org に属する全表 ⊆ c_wipe ∪ c_keep」を検査する pin を足す。
 280-8 外部キャッチへの支払の税務(外注費・インボイス・源泉の要否)を税理士確認 T4 として追加。
 現行のレジ「紹介料」カード(3c6fcaa)は実利用が無いため閉じず、0151 の client 便で置換する。」

適用＝未着手（事前読取＝便 Q・docs/tmp/0151_pre.md／逐語 docs/tmp/0151_live.md・結論は書かない）。272 追補 2／追補 3（案 Q）は本裁定で撤回＝0151 の client 便で撤去。
**追補1（本便で確定・Agoora 回答（9/18）に基づく・2026-09-18・逐語）**: 「[裁定280 追補1] 280-3 を改め、方式は 4 種とする: rate_set(初回セット料金の合計に対する %)／rate_all(会計割合＝割引後の小計(セット・延長・
   商品・指名ほか全行。紹介料自身は含めない)に対する %)／fixed_person(1 人あたり固定×人数)／fixed_group(1 組あたり固定)。
   rate_set の対象は、店の課金単位(人数単位・卓単位)に関わらず「その伝票の初回セット行の line_total の合計」とする。
   rate_all は明細の増減のたびに再計算し、会計確定時の値で凍結する。会計を分けた場合は紹介が付いている伝票の小計に対して計算する。
   customer 負担は、方式に関わらず紹介料を足した後の金額がサービス料・税の計算対象になる(Agoora 確認: 5,000＋1,000＝6,000 に
   サービス料・税)。客向けの印字は方式に関わらずセット料金に合算し内訳行を出さない。」
追加読取＝便 V3 y2（docs/tmp/0151_pre.md「y2」節＝再計算の RPC と呼び出し順・割引の持ち方・分割／合算の属性・reopen）。

## 裁定279（本便で確定・Agoora「推奨で」・2026-09-18）memberships の例外・docs/tmp の ignore・秘密情報スキャン（279-1〜3）

出典＝相談役ブロック 2026-09-18 夕（便 AF の起草停止＝memberships に org_id 列なし docs/tmp/0149_af_stop.md・便 AE の docs/tmp 同乗事故を受けた裁定・同日収載）。**本文（逐語）**:
「[裁定279]
 279-1 demo_org_reset の memberships は ★5・★6 の唯一の例外。memberships に org_id 列が無いため、削除は
   「store_id が p_org_id の stores に属する行」、投入時の検査は「全行の store_id が p_org_id の stores に実在し、かつ user_id が
   p_org_id の users に実在する」こと、不成立は raise 'org mismatch'。memberships への org_id 列追加は不採用(RLS ヘルパーへの波及)。
 279-2 docs/tmp/ を .gitignore に入れる。コミット時の git add はファイルパスを個別指定する。
   出典=9/18 AE 便で git add docs/ により docs/tmp の scratch 256 本が 91e9c8b に同乗(fae3213 で追跡解除・履歴は不変)。
 279-3 同乗分の秘密情報スキャンを実施(結果は件数のみ収載)。」

適用（便 AH）: 279-2＝.gitignore に `docs/tmp/` 1 行（本コミット）。279-3＝スキャン結果（docs/tmp/0918_secret_scan.md・値は記録せず・対象 263 本）: (1) JWT 形 0／(2) service_role 等の語 53 本 455 行＝全て SQL／ACL ダンプのロール名・key 形 0／(3) sb-…auth-token cookie **11 本 11 行＝verify ユーザー（NOX-VERIFY-*・dev）の session cookie 値を含む**／(4) 接続文字列 0／(5) password 等 10 本 18 行（★便 H-1 で再分類＝代入形 7 行は全て env `SEED_PASSWORD` の参照・literal **0**・パスワード値の漏えいなし）／(6) sk_live 等 0 → **要ローテーション判断**（dev の verify ユーザーの password 変更＋セッション失効で足りる見込み・本番ユーザー・service key・DB URL の同乗なし）。279-1＝便 AI（0149 改稿 ★A〜★E）／AJ（再突合）。

**DB 側 完了（2026-09-18・mig0149／0150 手貼り済・検証 ALL OK・suite verify:nox-demo-reset 34・client `425f21c`）**＝279-1 の例外 2 句（wipe＝store_id in stores(org)・load 直前の store_id／user_id 検査）が live（suite dr(5-7)・dr(4-1) 隔離）。279-3 の後処理（ローテーション）は便 H＝本行の直後に追記。
- **279-3 ローテーション実施（2026-09-18 16:43 JST・便 H）**: 対象＝NOX-VERIFY-* の auth ユーザー 9 人（供給元は env `SEED_PASSWORD` 1 変数＝tracked の suite／seed／e2e 40 ファイル超が全て env 参照・literal 0＝docs/tmp/0918_rotation.md）→ 全員を同じ新しい乱数値に変更・.env.local 更新（値は記録しない）。セッション失効＝9 人 signOut(global)＋漏えい cookie の demo-manager（NOX-DEMO・verify 外・パスワード不変）は auth.sessions／refresh_tokens 直接削除＝失効後 10 人 sessions 0／有効 refresh_tokens 0。**service key／DB URL の同乗なし**。H-4＝f0 1 走（16:43:23〜17:03:59・1,236s・60 段 ALL PASS・4,404＝inventory 126→132／shift-tabs 14→20 は同時進行の client 便 R／T の suite 追加が走行中に載ったもの・他 58 段は pin と同一・golden 不変）＝新しい資格情報でログイン段が緑。

## 裁定278（本便で確定・Agoora「推奨で」・2026-09-18）0149 改稿（278-1〜3）

出典＝相談役ブロック 2026-09-18 夕（便 AD の突合 docs/tmp/0149_ad.md＝f-4 `memberships_store_id_fkey` raise を受けた裁定・同日収載）。**本文（逐語）**:
「[裁定278 0149 改稿]
 278-1 demo_org_reset で残す表は orgs・org_billing・users の 3 表。memberships は wipe／load の対象に含める(id 固定で入れ直す)。
   理由=memberships.store_id が stores を参照するため stores を消せない(AD f-4)。stores を残す案は訪問者が変えた店舗設定が
   リセットで戻らないため不採用。FK の cascade 化は不採用。276-2 の「残す 4 表」は本項で 3 表に改める。
 278-2 ★7(stock_logs の sale 行の at 当て直し)は (store_id, product_id, delta) の partition＋row_number の対応付けで確定。
   列レベルの結合キーは無いが、対応付けが入れ替わる行同士は店・商品・数量が同一で、時刻を入れ替えても結果の行集合は同一のため。
 278-3 突合 a-7 の 'billing locked' 判定は関数本文に限定する。」

適用＝便 AF（0149 改稿＝残す 3 表・memberships を削除順／投入順へ機械整列で追加・diff は docs/tmp/0149_rev_diff.md）／便 AG（再突合＝docs/tmp/q0918_ad.mjs 改稿版・c' で残す 3 表が wipe 対象を参照する FK の全数列挙）。0149／0150 は未追跡・手貼り待ち（0149→0150 の順）。

**DB 側 完了（2026-09-18・mig0149／0150 手貼り済・検証 ALL OK・suite verify:nox-demo-reset 34・client `425f21c`）**＝278-1 残す 3 表・memberships を 68 手目（stores 直前）／投入 2 番目（stores 直後）・278-2 partition 対応付け・278-3 a-7 本文限定（AJ）。

## 裁定277（本便で確定・Agoora「推奨で」・2026-09-18）0149 の設計（277-1〜6）

出典＝相談役ブロック 2026-09-18 午後（0149 事前読取の追補 docs/tmp/0149_pre.md w1〜w6・録画再生 PoC docs/tmp/0149_poc.md を受けた裁定・同日収載）。**本文（逐語）**:
「[裁定277 0149 の設計] 277-1 demo_org_reset に p_mode('all'|'wipe'|'load')。別 mig 0150 で alter role service_role set statement_timeout='30s'。
   0150 が効かなければ route から wipe→load の 2 回呼び。関数レベル SET は不採用。
 277-2 stock_logs の日付は関数内で check_lines 投入後に sale 行の at を元明細の時刻へ当て直す。本番の在庫トリガは不触。
 277-3 帯持ち店の録画は tx 内で時間帯 rule を一時的にずらす。 277-4 audit_logs は payload に入れない。1 org＝伝票 150〜200 枚・payload 1 MB 以下。
 277-5 storage(cast-photos)policy の is_demo 句を 0149 に同乗。
 277-6 payload 全行の org_id＝p_org_id を検査し不一致は raise。表名は関数内の固定配列のみ・payload のキーから SQL を組まない。」

適用＝起草（本便 AC）: supabase/migrations/0149_demo_org_reset.sql（★1〜★10）／0150_service_role_timeout.sql（未追跡・手貼り待ち・sha256 は本便の報告）。突合＝本便 AD（起草者を疑う別パス＝docs/tmp/0149_ad.md）。手貼り後ブロックは相談役。

**DB 側 完了（2026-09-18・mig0149／0150 手貼り済・検証 ALL OK・suite verify:nox-demo-reset 34・client `425f21c`）**＝277-1 p_mode 3 種＋0150（service_role 30s＝role 設定値まで確認・API 経由の実測は demo org 作成後）・277-2 ★7 当て直し（suite dr(2-4) mismatch 0）・277-4 payload 1 MB 以下（dr(1-5)）・277-5 storage 同乗・277-6 org_id 検査（dr(5-6)）。277-3（帯持ち店の rule ずらし）は録画 route 側＝client 便。

## 裁定D45-1〜8（Agoora 承認 2026-09-11）入金方法別照合の範囲・凍結列・表示先

出典＝相談役ブロック 2026-09-11（着手前調査 docs/tmp/d45_survey.md を受けた起案）。mig0143 のヘッダが本文を参照している。**本文（逐語）**:

D45-1 範囲: 凍結 2 列＋mig＋回収 UI の method select（cash／card／other）＋日報タブ表示を 1 セットとする。UI select だけの先行は不可（裁定206「同時」）。ar_collections 直読のみの案も不採用（裁定206 の「回収方法の日報凍結」に応えない）。
D45-2 凍結列の形: daily_reports に ar_collected_card／ar_collected_other（integer・NOT NULL・default 0・CHECK >= 0）の 2 列。jsonb 1 列は照合式が静的に書けないため不採用。既存 ar_collected は名称据え置き・意味は cash 回収のまま。
D45-3 理論在高: 式は不変。mig0055「非現金回収はドロワー非加算」を維持。aggregate に 2 源・close／reclose の insert／update に 2 列・返り jsonb に 2 キー追加（既存キー不変）。
D45-4 照合の定義: 売上 4 列（cash／card／uri／other）＝Σ payments.method 別、売掛回収 3 列＝Σ ar_collections.method 別。締め済みの凍結値と再集計の読取比較のみ・差異は表示のみ・自動修正はしない。
D45-5 表示先: 日報タブの回収現金の隣に「カード回収」「その他回収」（締め前＝再集計・締め済み＝凍結）。analytics の売掛回収（ar_collections 生 Σ）の凍結列への付け替えは D45 に含めない（B6 の板を動かさない。要るなら裁定 1 本）。
D45-6 mig 検証: 0055 型＝aggregate／close／reclose の prosrc を live dump 逐語で写経し差分最小。単体 suite verify:nox-d45（走数外）で 2 キー・2 列・reclose の再凍結・理論在高不変を固定。f0 の daily-report 段は default 0 のため golden 不変見込み（差が出たら停止）。欠陥は補正 mig（裁定234）。
D45-7 回収モーダル注記: 「カード・その他での回収は現金在高（ドロワー）に含まれません」。
D45-8 kiosk-register は対象外。回収 UI は /report 売掛タブのみ。ar_collections.method の CHECK（cash／card／other）は不変。

適用＝mig0143 `8c89d4e`（dev 適用 2026-09-14 11:40・検証 1〜6 一致）・suite verify:nox-d45 `1a5c49e`（29 本・f0 46 段目）・client `e5f7728`（回収モーダル method select＋注記・日報タブ カード回収／その他回収・kiosk-register 不触）。追補＝D45-9（下記）。

## 裁定 D45-9（Agoora 承認 2026-09-14）締め前ライブの「売掛の回収（現金）」は method='cash' のみ＝凍結 ar_collected と同定義

出典＝相談役 2026-09-14 受領（D45 client `e5f7728` の報告に対する追補・同日収載）。**本文（逐語）**: 「締め前ライブの「売掛の回収（現金）」は method='cash' のみを集計する（凍結 ar_collected と同定義）。カード・その他は「カード回収（在高外）」「その他回収（在高外）」として別掲し、理論在高・実査差異には混入させない。cash 固定運用だった従来の表示値は不変。」

適用＝client `e5f7728`（report-board の loadPreview が ar_collections を method 別に再集計＝arCollectedToday は cash のみ・arCollectedCardToday／arCollectedOtherToday を「カード回収（在高外）」「その他回収（在高外）」として var(--sub) で別掲・レジ内予定額と実査差異の式は cash のみ＝daily_report_close の v_ar と同定義）。DB 側は 0143（`8c89d4e`）・suite verify:nox-d45（`1a5c49e`・29 本・f0 46 段目）。

## 裁定 D45-10（Agoora 承認 2026-09-14）回収モーダルの実行ボタンは回収額に追随させる

出典＝相談役 2026-09-14 受領（同日収載）。**本文（逐語）**: 「回収モーダルの実行ボタンは回収額に追随させる。空欄（＝全額）のときは「全額を回収」、金額入力時は「¥n を回収」。client 小物レーン（0145 と同時）で対応。」

現状（2026-09-14 読取）: report-board の回収モーダル実行ボタンは E8-2 #13 以来 `collectAmt === "" ? "全額を回収" : `${yen(Number(collectAmt) || 0)} を回収`` で既に追随している（`e5f7728` でも不変）。client 小物レーン（0145 と同時）では現物との差分を目視で確認し、差が無ければ「既存で充足」と記録する。

## 裁定236（Agoora 承認 2026-09-10）希望の取消（「なし」へ戻す）は C層② の範囲外＝staff_wish_delete RPC（本人・締切前）は次の補正 mig で

出典＝相談役ブロック（2026-09-10）。面 b の ◯× は「なし→◯→×→◯」の巡回で、一度出した希望を「なし」へ戻す経路は 0136／0137 に無い（設計書 v1 §2 の RPC 7 本に削除なし）。取消は #67 の補正 mig（staff_wish_delete＝本人・締切前・監査 action＝RPC 名）で足す。C層② の UI はそれまで現状のまま。

## 裁定235（Agoora 承認 2026-09-09）C層② 面 c の月ストリップ表示は「配置 n／希望 m」（n＝その枠の行数〔確認待ち＋確定〕・m＝◯の希望者数）

出典＝相談役ブロック（2026-09-09「面 c の表示を『配置 n／希望 m』へ（ラベルのみ）」）。「枠×充足 n/m」は必要人数の器が無いため「充足」と読めず、配置数と希望者数の 2 語に改めた。値と取得は不変＝`b9311bc`。裁定236／237・起票 #67／#68 は 2026-09-10 の再提示で収載。

## 裁定234（2026-09-09・CC 起こし・裁定229／230 の補足文＝承認文から分離して保管）

**229 の補足**: dev に手貼り済みの mig は sha256 と手貼りリストの記録で固定し、欠陥は手貼りリストに注記＋補正 mig（`create or replace`／`grant` のみ・表は触らない）で直す。本番は補正 mig と対で手貼り（0136→0137）。

**230 の補足**: f0 の 1 日 6 走（恒久注意 9）とは別枠だが、同じ dev DB への負荷として数える。赤の run に逆張りを重ねても証明にならないため、赤なら逆張りを打たず原因を live で切り分けて報告する（2026-09-09 の run1＝policy の permission denied を直結 pg で再現→0137 で補正→run2 緑→逆張り、の順）。

## 裁定233（Agoora 承認 2026-09-09）C層② 書込 RPC 6 本は課金ゲート内蔵で A8 へ・staff_wish_set は B(i)（mig0137）

出典＝相談役ブロック（0137 ヘッダ「③書込 RPC 6本に課金ゲート逐語行を挿入」）。段47-1 形 f の逐語行 `if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;` を flag gate の直後（auth 後・入力検証前）に置く。staff_pattern_set／staff_pattern_delete／staff_deadline_set（店設定）・staff_shift_propose／staff_shift_override／staff_shift_confirm（黒服シフト行）を A8 へ収載＝対象 114→120・除外 115→109・全数 229。staff_wish_set（黒服本人の希望◯×）は cast の shift_wish_submit と同型の事実記録＝B(i)。live 実測＝gated 120／refs 121／shapes 120／wrapper 0。

## 裁定232（Agoora 承認 2026-09-09）staff_shift_biz_today は biz_date_of（0132・既定 06:00）へ委譲＝営業日ロジックの一本化（mig0137）

出典＝相談役ブロック（0137 ヘッダ②）。0136 の独自実装は cutoff 未設定時の既定が 00:00 で、既存の biz_date_of／code の bizDateOf（既定 06:00）と JST 00:00〜06:00 に 1 日ずれた（CC 実測 2026-09-09）。本文＝`select public.biz_date_of(p_store_id, now())`。未知 store の 'forbidden' は権限判定後の呼出なので到達しない。

## 裁定231（Agoora 承認 2026-09-09）policy から呼ぶ staff_shift_can_manage は authenticated に execute（mig0137・教訓66）

出典＝相談役ブロック（0137 ヘッダ①）。0136 は同関数を 4 ロール明示 revoke（内部専用の流儀）で作ったが、RLS policy の評価は呼出者（authenticated）権限で行われるため `permission denied for function staff_shift_can_manage` で 4 表の select が全ロールで落ちた（verify:nox-staff-shift run1＝ss(7a〜7d) 赤・直結 pg で再現）。auth_* ヘルパー同型に `grant execute … to authenticated`（service_role には付けない）。名簿＝grants の HELPERS へ移動（G4c 内部ヘルパーは 4 本）。

## 裁定230（Agoora 承認 2026-09-09）新設 suite の単体実走は run＋逆張りで 2 走以内・赤なら再走せず段名を報告して止まる

出典＝相談役ブロック（2026-09-09「単体 suite は run2＋逆張りで 2走以内」「赤なら段名を報告して停止」）。CC 起こしの補足文は裁定234。

## 裁定229（Agoora 承認 2026-09-09）適用済み mig は書き換えない＝補正は次番号の mig で積む（0136→0137）

出典＝相談役ブロック（0137 ヘッダ「0136 は書き換えない」）。CC 起こしの補足文は裁定234。

## 裁定228（Agoora 承認 2026-09-10・追認）f0 新基準＝39 本 3,642（0136／0137＋verify:nox-staff-shift 連結・名簿更新の追認）

出典＝相談役ブロック（2026-09-10「2連緑 → pin を 39本/実測値へ更新・裁定228『追認』」）。2026-09-10 の裁定200 チェック（10:29:27／10:30:40／10:38:48＝3 値 0）の後に f0 run1 412s／run2 454s の 2 連緑・39 段 ALL PASS・assertion 合計 3,642（内訳＝旧 3,570＋staff-shift 53＋grants 19〔TABLES 4 表と G4c／HELPERS の追補〕）・golden 6 値不変。これをもって 9/9 の未 push 分（B2〜B4・#66 修正・C層② mig0136／0137・suite・UI 4 面・裁定202〜237）を追認し push する。

## 裁定227（Agoora 承認 2026-09-09）H4 期間粒度（月／半月／週）は据え置き＝shift_periods の粒度運用と同時

出典＝B4 着手前調査の裁定要点 10（`docs/tmp/b4_survey_20260909.md`）。表示だけの前半／後半絞込は「半月単位で作成」（period の粒度）と意味がずれ混乱要因＝B4 では月のまま。

## 裁定226（Agoora 承認 2026-09-09）H27 は「確認済み／未確認」の 2 値だけ人別に出す（変更希望・辞退希望・催促は出さない）

出典＝B4 着手前調査の裁定要点 9。shifts.status の proposed（未確認）／confirmed（確認済み）の再形＝新規クエリ 0。変更希望・辞退希望は器なし・催促は通知なし＝C層／設計書行き。

## 裁定225（Agoora 承認 2026-09-09）H41 候補検索＝DayAddPanel に名前部分一致の検索 input のみ（勤務条件の表示は H15 後）

出典＝B4 着手前調査の裁定要点 8。並びは名前昇順のまま・新規クエリ 0。

## 裁定224（Agoora 承認 2026-09-09）H39 確定後の変更履歴＝owner のみ描画・manager 非表示（裁定190 同型）・「管理者変更を追加」は出さない

出典＝B4 着手前調査の裁定要点 7。audit_logs（owner 限定 RLS・0002:78）のシフト系 action を表示月・自店で読み、target の shifts:id を名前へ解決して並べる。理由付き起票の器は無い＝ボタンを出さない。新規クエリ 1（owner のみ）。

## 裁定223（Agoora 承認 2026-09-09）H37 印刷＝window.print＋印刷隔離（.nox-printpage）で確定一覧のみ・PDF はブラウザ印刷・CSV は残す

出典＝B4 着手前調査の裁定要点 6。レジ領収書（E5b／E8-1b F6）と同じ機構の流用・新規クエリ 0。

## 裁定222（Agoora 承認 2026-09-09）H32 打刻表示＝当日 punches の最終 'in' を「HH:MM打刻」として出勤記録の補助表示（書込なし・book は attendance）

出典＝B4 着手前調査の裁定要点 5。cast 自身の打刻は /mine（punch_self）のまま。新規クエリ 1（当日・自店 punches）。

## 裁定221（Agoora 承認 2026-09-09）H31「未着」＝attendance 未記録 ∧ 開始時刻経過 ∧ 打刻 'in' なし（打刻ありは「出勤済み」扱い）

出典＝B4 着手前調査の裁定要点 4。4 カウンタの定義（二重計上なし）＝「出勤予定」＝当日シフト行数／「出勤済み」＝attendance が shukkin・dohan、または attendance 未記録で打刻 'in' あり／「遅刻・未着」＝attendance が late ＋ 未着（上の定義）／「欠勤」＝absent。休み（off）はどれにも数えない。

## 裁定220（Agoora 承認 2026-09-09）H31 今日 KPI 4 枚は既存 KPI 帯（出勤予定／確定／未承認／不足＋予想人件費）を残し、本日の勤務表の上に 4 カウンタとして追加（置換しない）

出典＝B4 着手前調査の裁定要点 3。予想人件費カード（S-2・money 慎重域）は不触。新規クエリ 0（attendance は取得済み・打刻は裁定222 と共有）。

## 裁定219（Agoora 承認 2026-09-09）H20 人ごとグルーピング＝「日付順／人ごと」の切替を置き既定は現行の日付順

出典＝B4 着手前調査の裁定要点 2。現行の見え方を変えない。新規クエリ 0。

## 裁定218（Agoora 承認 2026-09-09）H18 承認待ち KPI 4 枚の定義＝未処理（pending wish 件数）／申請者（その distinct cast）／希望どおり（wish_id を持つ shift の時刻が wish と一致）／要調整（不一致）

出典＝B4 着手前調査の裁定要点 1。承認表が既に組んでいる wish→shift の対比（shift-board `:1217-1222`）の再形＝新規クエリ 0。

## 裁定217（Agoora 承認 2026-09-09）R28「最近使った」＝端末ローカル（localStorage・商品 id のみ）・「よく使う」は対象外

出典＝B3 着手前調査の裁定要点 9（`docs/tmp/b3_survey_20260909.md`）。この端末で直近にタップした商品 id を localStorage に最大 8 件保持し、タイル群の上に「最近使った」列として出す（タップ経路は既存 tb.tap／キャストドリンク指定と同じ・新規クエリ 0）。金額・数量・顧客情報は保存しない。「よく使う」は check_lines 集計＝B3 対象外。

## 裁定216（Agoora 承認 2026-09-09）R14 卓操作ドロワーは据え置き（レジ本レーン）

出典＝B3 着手前調査の裁定要点 8。人数変更／席移動／相席／統合／分割／閉卓は money 隣接操作の導線再編＝B3（非 money・表示のみ）では扱わない。

## 裁定215（Agoora 承認 2026-09-09）R4 席種フィルタは S16／S17（店舗設定の席種フラグ）と同時に扱う＝B3 据え置き

出典＝B3 着手前調査の裁定要点 7。店設定なしの client 絞込は混乱要因＝店舗設定 v3 の席種フラグ（器なし）と同時に。

## 裁定214（Agoora 承認 2026-09-09）R36 ボトルキープ表示は PII ゲート後＝B3 対象外

出典＝B3 着手前調査の裁定要点 6。顧客名なしの先行表示はしない（bottle_keeps は顧客と不可分・前回卓は器なし）。対応表 §4 R36 は「対象外（PII ゲート後・裁定214）」へ。

## 裁定213（Agoora 承認 2026-09-09）R29 商品タイルの在庫常時表示＝reorder_point 未設定は数のみ・在庫行なしは非表示

出典＝B3 着手前調査の裁定要点 5。stockOf（product_stock_totals RPC・既読）を常時「在庫 N」で出し、reorder_point 以下のときだけ現行の低在庫色（残N）。在庫行の無い商品は何も出さない。タップ挙動は不変（在庫切れでも売れる）。新規クエリ 0。

## 裁定212（Agoora 承認 2026-09-09）R34 帰属モーダルのチップ［出勤中］［担当中］＝絞込（filter）・並びは名前順固定（裁定107）

出典＝B3 着手前調査の裁定要点 4。出勤中＝attendance（裁定209）・担当中＝自伝票の名簿（seatedIds）。チップは表示の絞込だけで並び替えはしない。新規クエリ 0（裁定209 の attendance を共有）。

## 裁定211（Agoora 承認 2026-09-09）#64「接客中」＝他卓の open 伝票の check_nominations に載るキャスト・自伝票は現行「着卓中」を維持

出典＝B3 着手前調査の裁定要点 3。フロアで取得済みの open 伝票の名簿（loadOpenMap の check_nominations）を再利用＝新規クエリ 0。優先＝着卓中（自伝票）＞接客中（他卓）＞出勤中＞打刻。

## 裁定210（Agoora 承認 2026-09-09）#64 ランク名＝cast_ranks が読めた場合のみ描画・staff は要素ごと非表示（空チップ不可）・RLS 不変（0083:45-52）

出典＝B3 着手前調査の裁定要点 2。cast_ranks の select は owner ∨ manager 自店のみ＝staff∧can_register のレジでは 0 行。policy は変えず、行が返った id にだけランク名を描く（返らない id・返らないロールでは要素そのものを出さない）。候補一覧・帰属モーダル・指名カードの 3 面で同じ規則。新規クエリ 1（cast_ranks id/name）。

## 裁定209（Agoora 承認 2026-09-09）#64「出勤中」の器＝attendance を正・打刻のみは「打刻」（併用）

出典＝B3 着手前調査の裁定要点 1。営業日の attendance（status in shukkin／dohan／late＝出勤板・casts-board と同じ PRESENT 集合）にある＝「出勤中」。attendance が無く punches の最終打刻が 'in' のみ＝「打刻」（現行「出勤」バッジの改称）。両方無ければバッジなし。金額・RPC には一切関与しない。新規クエリ 1（attendance date＝営業日・自店）。

## 裁定208（Agoora 確定 2026-09-09）D22 締め履歴の説明文／D43「伝票を見る」は据え置き（B2 対象外）

出典＝B2 着手前調査の裁定要点 7・8（`docs/tmp/b2_survey_20260909.md`）。D22 は現行仕様（daily_report_reclose＝解除なしの直接再集計）に合わせた文言のまま・C層③（締め解除フロー）後に差し替え。D43 は R57（会計後タイムライン）停止中のため据え置き（裁定189 同型）。

## 裁定207（Agoora 確定 2026-09-09）D47 回収履歴リスト＝当月・自店・最新 30 件・列＝入金日／方法／金額／顧客／担当／登録者

出典＝B2 着手前調査の裁定要点 5。売掛タブに ar_collections の一覧を追加（読取のみ・RLS＝owner／manager／staff∧can_register・cast 0 行）。範囲＝当月（biz_date）・自店・created_at 降順 30 件で打ち切り、「それ以前は売掛タブの各行「前回回収」で確認」の導線文を置く。顧客名は現行の未回収一覧と同粒度（customers.name＝0055:143-150 で開示済みの範囲・PII ゲートの範囲拡大はしない）。登録者＝created_by→users.name（表示専用）。

## 裁定206（Agoora 確定 2026-09-09）D45 回収方法の選択は据え置き＝対応表「準備中(money 境界)」

出典＝B2 着手前調査の裁定要点 4。receivable_collect の p_method は UI で "cash" 固定のまま（RPC は cash/card/other 受理・現金照合式 0055:351-353 は cash のみ＝DB 不変）。入金方法別の照合（カード・その他を日報のどこへ載せるか）と同時に C層③で扱う。B2 では触らない。

## 裁定205（Agoora 確定 2026-09-09）D6 営業時間の表示位置＝「営業日切替 翌HH:MM」の隣・定休日は「定休日」・cast 非表示

出典＝B2 着手前調査の裁定要点 6。日報タブの営業日行に、表示中営業日の曜日に対応する store_business_hours（0032）の open_hm〜close_hm を「本日 19:00〜翌5:00」の形で併記（close の 24h 超表記は「翌」へ変換＝business-hours-panel と同じ規則）。is_closed の日は「定休日」。行が無い店は非表示。RLS は cast 不可のまま（cast へ見せる要素を増やさない）。新規クエリ 1（dow 7 行 select）。

## 裁定204（Agoora 確定 2026-09-09）D14／D37「発生」＝receivables.created_at を bizDateOf で営業日正規化（D8 と同一関数）

出典＝B2 着手前調査の裁定要点 3。売掛の「本日発生（D14）」「今月発生（D37）」は receivables.created_at を cutoff（settings_json.biz_cutoff_hm）で営業日へ正規化して数える（bizDateRange の [startIso, endIso) で select）。checks.closed_at 基準にはしない。KPI 追加（カード枚数増）は裁定196 で許容済み。新規クエリ＝D14 1／D37 1（amount のみ select・client で件数＋合計）。

## 裁定203（Agoora 確定 2026-09-09）D15 未処理の入出金＝advances／transport の open 件数＋金額のみ・立替は対象外・cast 名は出さない

出典＝B2 着手前調査の裁定要点 2。日報タブに「日払い（前借り）」＝advances（status='open'）・「送り代」＝transport（status='open'）の件数と金額合計を表示（自店・読取のみ・adv_issue 等の書込 RPC は呼ばない）。立替は器なし（テーブル無し）のため出さず「対象外」と注記。cast 名・行明細は出さない（KPI 2 枚のみ）。新規クエリ 2。

## 裁定202（Agoora 確定 2026-09-09）D12 取消・返金＝owner には件数＋操作履歴への導線・manager には非表示（裁定190 同型）

出典＝B2 着手前調査の裁定要点 1。audit_logs は owner 限定 RLS（0002:78）のまま＝policy 変更なし。日報タブに表示中営業日の「取消・巻き戻し」系 action（audit-board の VIEW_DEFS「取消・巻き戻し」と同じ明示リスト）の件数を owner のときだけ count（head）し、「操作履歴を見る」（/audit）への導線を置く。manager 以下は要素ごと描画しない（RLS 0 行の空表示も出さない）。新規クエリ 1（owner のみ）。

## 裁定201（2026-09-09・Agoora 承認 2026-09-09・CC 起こし）本日 2026-09-09 の f0 run1 は例外として有効（2 連緑の 1 本目に数える）

出典＝相談役ブロック（「run1 例外有効」・本文なし＝CC 起こし）。run1（761s・38 本 3,570・golden 6 値不変）は別チャットが handoff v27 収蔵コミット `c07a422` を積んだ時間帯と重なった（裁定200 の「同一 DB で 1 本ずつ」に照らすと起動前チェック未実施）。本チャットの実測では直結 client は自分のみ・PostgREST active 0（run2 起動前）で他の f0 走行は観測されず、run2（723s）も同値の緑＝結果への影響なしとして例外扱い。以後は裁定200 に従う。

## 裁定200（2026-09-09・Agoora 承認 2026-09-09・CC 起こし）f0 は同一 DB で 1 本ずつ・起動前 60 秒チェック

出典＝相談役ブロック（本文なし＝CC 起こし）。verify 用 org／ユーザー（NOX-VERIFY-*）と sweep（audit_logs 削除）は dev DB で共有＝複数チャットの f0 並走は fixture の相互干渉（赤・timeout）を生む（教訓56「手貼りと f0」の同型）。規約＝(1) f0 は同一 DB で同時に 1 本だけ（chat をまたいでも）(2) 起動前に pg_stat_activity（client backend・自分以外の直結 client と PostgREST active）を実測し、60 秒後に再実測して変化なしを確認してから起動 (3) f0 を含む起動ブロックは 1 チャットにのみ貼る（教訓63）(4) sweep 側の機械ガードは #65。恒久注意 9（1 日 6 走以内）はそのまま。

## 裁定199（2026-09-09・Agoora 承認 2026-09-09）監査書込 2 本（audit_log_write／_service）の ACL は postgres のみを 4 ロール明示 revoke で再明示（mig0135）

出典＝mig0135 収蔵時の実装差分（設計書 v1 §3.3 は ACL に言及なし）。live 実測＝proacl `{postgres=X/postgres}`＝現状同値。内部専用関数の流儀（CLAUDE.md 二重防御 2・4 ロール明示）に一致。

## 裁定198（2026-09-09・Agoora 承認 2026-09-09）flag_set は課金ゲート内蔵・returns uuid（mig0135・設計書 v1 §3.2 は returns void）

出典＝mig0135 収蔵時の実装差分。A8 店設定（ゲート済み区分）へ収載する以上、冒頭の `billing_writable_of(v_org)` ゲートは名簿の規約どおり＝実装を正とし v1 を追従。返値は upsert 行 id。
verify＝`verify-nox-flags.ts` 20 assertions（逆張り＝owner 判定を manager 許容へ一時変更→fl(3) 赤→復元 9/9）。

## 裁定197（Agoora 確定 2026-09-09）対応表の区分訂正＝実装済みなのに「準備中」の 4 行を「実装済(B層)」へ（H19／H30 shift_remove／K34／D34）

出典＝B層調査（教訓60 の同型）。H19 一括承認・H30 の shift_remove 結線・K34 適用履歴は N4（`daee5e2`）で実装済み、D34 日別確定状況は month-report に描画済み。

## 裁定196（Agoora 確定 2026-09-09）D49 締め確認モーダルは位置だけ寄せる（モーダル化しない・裁定136 の常設優先と同型）／D14・D37 の KPI 追加はカード枚数増を許容

出典＝B層調査の裁定要点 7。差異承認（D20）が器なしのため、確認 3 項目は現行の同画面下部を「締め」直上へ寄せる範囲に留める。

## 裁定195（Agoora 確定 2026-09-09）A45 キャスト 4 スタットは A15（按分表示の降格）と同時に扱う＝B層では触らない

出典＝B層調査の裁定要点 5・裁定要点28。按分客単価の削除と延長率／杯数の準備中表示は同じ裁定で決める。

## 裁定194（Agoora 確定 2026-09-09）A38 商品販売実績（店合計）は catSums の drink＋champ＋bottle 近似で表示し「会計明細ベース（cast 別の販売実績＝A11 とは母数が別）」と注記

出典＝B層調査の裁定要点 5。A11（cast 別販売実績）の器が無いため、店合計だけを明細合算で出す。

## 裁定193（Agoora 確定 2026-09-09）K7 メール未登録 KPI＝users.email を配下 cast 分だけ読む（RLS 実測で owner／manager とも可読）

出典＝B層調査の裁定要点 4・B1 の前提実測（2026-09-09: NOX-VERIFY-A1 の cast 2/2 を owner／manager とも読取可）。email は KPI 判定専用で画面に出さない。
既存 KPI 4 枚は据え置き＝5 枚目。K16 カードバッジはランク名／プラン名を nox-stpill の 2 バッジへ（スタイルのみ・意味名トークン）。実装＝`777fe75`。

## 裁定192（Agoora 確定 2026-09-09）ホームの店舗セレクタ＝owner の閲覧切替のみ（limit(1) を外し既存 state で切替・F4 とは二層）

出典＝B層調査の裁定要点 3・要点29。**第 1 層＝閲覧切替**（本裁定・`e617eaa`）: page.tsx が RLS の返す全店を渡し、board が選択店を state で持って
attendance／daily_reports／shifts／staffing_needs／notices の読取を store_id で絞る（get_cast_ranking も選択店）。owner かつ 2 店以上のときだけセレクタ・
manager は自店名の表示のみ。**第 2 層＝F4 マルチ店舗切替**（memberships 部分 unique の drop＋auth_store_id 差替＝CLAUDE.md）は別レーン＝本裁定では触らない。

## 裁定191（Agoora 確定 2026-09-09）H23「時間調整して承認」は wish 段では出さないまま（裁定112-G' 維持）

出典＝B層調査の裁定要点 2・要点15。合成（accept→shift_set）はウィザード側に実装済み＝承認待ち行への露出は行わない。B層シフトレーンの対象外。

## 裁定190（Agoora 確定 2026-09-09）audit_logs 読みの履歴 UI（H30／H39／W41）は owner 限定 RLS のまま＝policy 変更なし・manager には非表示

出典＝B層調査の裁定要点 1。manager 開放は C層③（監査 10 種）の policy と同時に扱う。B層では owner のときだけ描画（RLS が 0 行なら空）。

## 裁定189（2026-09-09）レジの会計後タイムライン（R57）は停止リスト継続・カード手数料（N%）行の文言は据え置き

出典＝相談役ブロック（レジ v12.1 A層）・Agoora「推奨で」確定。R57 は audit_logs 読みの新規 UI（owner 限定 RLS）＝A層外＝レジ本レーン（Fable）でも新規＝停止リスト継続。
伝票の「カード手数料(N%)」行（SURCHARGE_PREFIX＝客加算）は日報の「カード手数料（日報集計用）」と別概念だが、money 境界（check_add_line 経路）のため文言も不触。

## 裁定188（2026-09-09）#61 逆転値凍結の伝票は Agoora 実機で void→再開栓（現行唯一の経路）・凍結値訂正 RPC は C層③（監査 price_snap_fix）

出典＝相談役ブロック・Agoora「推奨で」確定。live 再実測（2026-09-09）＝`105a0a77…` は **open のまま（voided_at null・入金 0・行 1 本）**＝#61 は継続。
訂正 RPC（横断設計書 §3 の 7 番 price_snap_fix・reason 必須）は C層③ の設計へ。
★同日 13:40 JST に Agoora が void 実施（#61 クローズ）。

## 裁定187（2026-09-09）会計方法 4 値・低在庫「残N」は据え置き（R53／R8・規則 b）

出典＝相談役ブロック・Agoora「推奨で」確定。モックの 3 値（その他欠落）・在庫常時表示（R29 準備中）へ寄せない＝既存 UI を減らさない／増やす方は準備中行。

## 裁定186（2026-09-09）レジの数値強調 15 行（割引・残額・不足・分配率≠100・延長超過）は --bad 系のまま

出典＝相談役ブロック（G2）・Agoora「推奨で」確定。裁定120 の Danger は「取り消し困難な操作」と「エラー文」に限る＝金額・状態の強調赤は据え置き。

## 裁定185（2026-09-09）レジの取り消し操作 4 箇所は --danger／--danger-bd（G2）

出典＝相談役ブロック（G2）・Agoora「推奨で」確定。商品クリアの確定ボタン／伝票取消モーダルの見出しと確定ボタン／相席解除「×」の `--bad`／`--bad-bd` → `--danger`／`--danger-bd`
（裁定146 と同型）。★候補として残る 2 箇所＝伝票ビューの「伝票取消」トリガ（1939 行）と分配率カードの「×」（2177 行）＝次の裁定へ。実装＝`c33055f`。

## 裁定184（2026-09-09）レジのエラー文 12 箇所は --danger-ink（G2）

出典＝相談役ブロック（G2）・Agoora「推奨で」確定。msg（フロア／伝票ビュー×3）・rcptMsg・peopleMsg・feeMsg・seatMsg・timeMsg×2・claimMsg・printMsg の `--bad` → `--danger-ink`。
`git diff -U0` で全変更行がトークン置換のみ（−／＋対で一致）を機械確認。実装＝`c33055f`。

## 裁定183（2026-09-09）レジの席タイル・伝票ヘッダの滞在表記をモック形式へ（R5／R13・R26 は実装済）

出典＝相談役ブロック（G1）・Agoora「推奨で」確定。席タイル「N名 · 滞在 N分」→「N名　滞在N分」・伝票ヘッダ「滞在 N 分」→「滞在N分」（値・elapsedMin は不変）。
R26 カテゴリチップの「すべて」は既に実装済み＝差分なし。R3／R6／R7／R8／R43／R44／R1／R58／R59 は変更なし。money 境界（R9/R11/R15〜R17/R23〜R25/R31/R33/R39/R40/R45/R46/R53/R55）は不触。実装＝`d2eb1f2`。

## 裁定182（Agoora 確定 2026-09-08・実測反映 2026-09-09）feature flag＝二層（org 既定×店舗上書き）の新表（横断設計書 §4）

正本＝`docs/NOX_横断設計書_v1_20260909.md` §4。`feature_flags` 新表（org_id／store_id null=org 既定／key／enabled・unique(org_id, store_id, key)）。
stores.settings_json（live 3 キー: biz_cutoff_hm／cast_register_enabled／okuri_mode）には置かない。解決＝`flag_enabled(key)`（店舗行→org 行→false・fail-closed・
SECURITY DEFINER・null-guard）。切替＝owner のみ・監査 `flag_toggle`。UI は off なら導線ごと出さない＋RPC 側も raise。ACL＝authenticated select のみ・書込は RPC。
key＝staff_shift／reopen_flow／qr_order／notify（ローンチ時すべて off）。実測＝flag 専用表・関数 0（母数 public 表 65・関数 214）。C層① の最初の mig。

## 裁定181（Agoora 確定 2026-09-08・実測反映 2026-09-09）監査 10 種＝共通 1 表（横断設計書 §3）

正本＝横断設計書 §3。既存 `audit_logs` に統一（新表なし）。action 10 種＝report_reopen／report_reclose／payroll_reopen／cash_diff_approve／check_merge／
check_void／price_snap_fix／perm_change／flag_toggle／staff_deactivate。`reason` は解除系で必須＝**現行列なし → C層① mig で `reason text` 追加・
`audit_log_write` に `p_reason` を末尾追加（既定 null・既存呼出不変）**（起票 #62）。実測＝audit_logs 列 id/org_id/store_id/actor_user_id/action/target/
before_json/after_json/at/ip・関数 audit_log_write(p_action,p_target,p_before,p_after,p_store_id)＋audit_log_write_service(p_org_id,p_actor,…)。書込主体は RPC 内のみ。

## 裁定180（Agoora 確定 2026-09-08・実測反映 2026-09-09）権限 4 層＝役職既定＋黒服個別付与（横断設計書 §2）

正本＝横断設計書 §2。既存の黒服 4 権限（can_register／can_crm／can_shift／can_view_backs＝memberships・boolean・default false）と同じ方式で
**`can_close`（締め）／`can_reopen`（解除・承認）の 2 列追加**。保持単位＝**memberships（store 単位）**（実測＝org_id 列なし・store_id→stores.org_id）。
付与は owner／manager のみ・新規黒服は両方 false・解除型 RPC は null-guard 直後に role 判定（fail-closed）・付与剥奪は `perm_change`。
set_staff_perms は 6 引数化（C層③ mig 同梱・A6 名簿更新＝起票 #63）。request_accept/reject の店長代理承認は現状維持。

## 裁定179（Agoora 確定 2026-09-08・実測反映 2026-09-09）適用期間＝effective_from 型（横断設計書 §1）

正本＝横断設計書 §1。期間を持つ設定は `effective_from date not null` のみ（終了日なし・次行の effective_from が終了）。重なり禁止（unique）・過去日禁止・
遡及なし（開栓時／締め時凍結）・解決＝effective_from ≤ 営業日の最大行、無ければ店舗基本・未来行のみ削除可。ローンチ範囲＝C層② 勤務パターン・希望方式/
確定単位/締切。第2期＝入店時給保証・4段時給・在籍状態。**pricing_rules は非対象**（既存の dow/time 型を維持）。

## 裁定178（2026-09-07・無人確定・翌朝承認待ち）給与の税務系 3 行は除外（W37／W39／W40＝税理士ゲート）

出典＝夜間 O レーン規則 e。支払明細・請求関連（invoice／tax-overview／tax-report-csv）・源泉徴収・納付管理・源泉額の計算根拠は税務出力の凍結範囲＝A層で触らない。

## 裁定177（2026-09-07・無人確定・翌朝承認待ち）給与の要確認位置・5 タブ化は据え置き（W2／W12）

出典＝夜間 O レーン規則 b／f。W2「要確認 N件」のヘッダ移設・W12 の 5 タブ化（計算・確認／確定・訂正／支払・明細／税務・出力／履歴）は構造の再配置＝
文言追随の範囲を超えるため無人では行わない（履歴タブは W41 準備中）。

## 裁定176（2026-09-07・無人確定・翌朝承認待ち）給与対象者表に「日数」列（W23・PayResult.wdays の件数）

出典＝夜間 O レーン規則 d（新規クエリなし・計算なし）。preview は PayResult 全キーを返す（裁定99-⑤）ため `wdays`（日次内訳）の件数を「N日」で表示するだけ。
Row 型に `wdays?: unknown[]` を足し、配列でなければ「-」。実装＝`ac73128`。

## 裁定175（2026-09-07・無人確定・翌朝承認待ち）給与対象者の絞り込みチップ（W22・全員／雇用／委託）

出典＝夜間 O レーン規則 b／d。取得済み rows の taxMode で client 絞り込み（並び・数値不変・検索と併用）。モックの「要確認」（確認記録の器なし＝W19）
「キャスト／スタッフ」（スタッフ給与＝W24 新要件）は置かない。実装＝`ac73128`。

## 裁定174（2026-09-07・無人確定・翌朝承認待ち）給与 KPI 4 枚のラベルは据え置き（W10・既払額 W11 の定義変更前）

出典＝夜間 O レーン規則 d／f。モック「対象者／総支給／控除合計／既払額／今回支払」は既払額（前借り＝現行は控除）の会計定義変更（W11）を含む＝
現行「支給総額／控除合計（源泉含む）／差引支給額／未支払」を据え置き（値の定義は D3 CSV と逐語同一）。

## 裁定173（2026-09-07・無人確定・翌朝承認待ち）「プレビュー」は据え置き（W7・モック「再集計」へ改名しない）

出典＝夜間 O レーン規則 f。ボタンだけ「再集計」にすると 4 ステップ「プレビューで取込」・案内文・参考値の注記と語が割れる＝翌朝判断。

## 裁定172（2026-09-07・無人確定・翌朝承認待ち）給与の lead は「出勤」→「勤怠」のみ（W1・「明細公開」は書かない）

出典＝夜間 O レーン規則 a。モック「勤怠・売上・報酬ルールから計算し、確認・確定・支払・明細公開まで管理します。」のうち「明細公開」は
W34（LINE 公開＝裁定99-⑦ 後送り）の語＝書かない。W3／W9／W16／W18／W21／W25／W27／W30／W33／W35／W36 は差分なし（W9 の 4 段目は裁定99-⑦ どおり
「支払・明細」）。実装＝`ac73128`。

## 裁定171（2026-09-07・無人確定・翌朝承認待ち）お知らせの対象注記は据え置き（N9・「休店」は第2期の語）

出典＝夜間 O レーン規則 a／e。モック「休店・退店者は除外」の「休店」は在籍 5 状態（K25・第2期）の語＝現行「退店済み・無効の担当は数えません」を据え置き。

## 裁定170（2026-09-07・無人確定・翌朝承認待ち）「掲載」と「配信」の語は据え置き（N29／N30・読み替え裁定済み）

出典＝夜間 O レーン規則 a／f。「配信＝掲示」の読み替えは既裁定（台帳:1388）。ボタン「今すぐ掲載」→モック「今すぐ配信」への置換は確認モーダル
（お知らせの掲載確認）や案内文と語が割れるため無人では行わない（翌朝判断）。

## 裁定169（2026-09-07・無人確定・翌朝承認待ち）お知らせの lead は据え置き（N1・LINE／メールは凍結の語）

出典＝夜間 O レーン規則 a／e。モック「アプリ内・LINE・メールで、必要な相手に必要な連絡を届けます。」は LINE／メール（T3 凍結・器なし）を含む＝
現行「店舗の連絡をスタッフ・キャストのマイページに掲載します。」を据え置き。

## 裁定168（2026-09-07・無人確定・翌朝承認待ち）お知らせのテンプレートをモックの 5 種へ（N32・定数のみ）

出典＝夜間 O レーン規則 a／b。3 種→5 種（仮シフト公開／シフト確定を追加＝いずれも既存機能：shift_period_set published／shift_confirm_bulk とマイページの
シフト確認導線）。ラベルをモック逐語へ（ミーティング案内→全体ミーティング・給与明細の公開→給与明細公開）。定数のみ＝DB・RPC・引数不変。
N11／N12／N13／N21／N22／N25／N31／N33／N44 は差分なし。実装＝`2fb16d3`。

## 裁定167（2026-09-07）分析のエラー文 5 箇所は Danger 系トークン（裁定120 適用・分析面のみ）

出典＝相談役ブロック（N1）・Agoora「推奨で」確定。err／t4Err／custErr／custSummaryErr／tgtMsg の `--bad` → `--danger-ink`（月報 R2＝裁定151 と同型）。
「離反リスク N人」の赤字と曜日ラベルの日曜赤（--bad）は数値・暦の強調＝据え置き。実装＝`ad44954`。

## 裁定166（2026-09-07）CSV 出力の位置は据え置き（A2・ランキング CSV の按分列は A15 に従属）

出典＝相談役ブロック（N1「A2 変更なし」）・Agoora「推奨で」確定。ヘッダ右への集約はランキング CSV（「売上（按分）」列）を含む＝A15（帰属させない・新要件）の裁定に従属するため触らない。

## 裁定165（2026-09-07）支払方法は現行 4 分類のまま（A32・売掛を「その他」へ畳まない）

出典＝相談役ブロック（N1「A32 変更なし」）・Agoora「推奨で」確定。モック 3 分類（現金／カード／その他）は売掛の独立表示を消す＝情報を減らすため据え置き。

## 裁定164（2026-09-07）時間帯別は 1h 刻みのまま（A31・2h バケット化は集計側の境界＝A層で触らない）

出典＝相談役ブロック（N1「A31 変更なし」）・Agoora「推奨で」確定。store_hourly_aggregate の 1h 刻みを表示側で 2h に再集計するのは「集計式に触らない」境界に近い＝A層外。

## 裁定163（2026-09-07）「組単価」は据え置き（A18・モック「客単価」へ改名しない）

出典＝相談役ブロック（N1「A18 変更なし」）・Agoora「推奨で」確定。現行は slips 基準（組単価）。guests 基準へ変えると式が変わり、語だけ「客単価」にすると値と語がずれる＝据え置き。

## 裁定162（2026-09-07）分析の売上カテゴリは「シャンパン」「ボトル」別掲のまま・表示順も現行（A27）

出典＝相談役ブロック（N1「A27 変更なし」）・Agoora「推奨で」確定。日報 R2（裁定149）は表示合算したが、分析モック自体が別掲（金額降順）＝分析は category-map の 5 分類
（セット・延長／ドリンク／シャンパン／ボトル／指名・その他）を固定順で据え置き。日報と分析で粒度が違うのは面の目的差＝許容。

## 裁定161（2026-09-07）分析の集計前提注記は 3 行＋速報導線（A7・人件費行は A19 実装後）

出典＝相談役ブロック（N1）・Agoora「推奨で」確定。「集計: 締め済み営業日のみ／売上: 会計確定額／比較: 同じ締め済み日数で比較」＋「営業中の速報値はホーム・日報で確認 ›」
（導線先＝既存の日報タブ /report）。モック 4 行目「人件費: 給与未確定分は概算」は現行が未確定＝「—」のため書かない（A19 準備中）。実装＝`ad44954`。

## 裁定160（2026-09-07）分析の lead はモック逐語へ（A1）

出典＝相談役ブロック（N1）・Agoora「推奨で」確定。「確定した営業データを比較し、売上・キャスト・顧客の変化を確認します。」＝器のある語のみ。
A3／A5／A8／A9／A10／A12／A16／A17／A22／A35／A53／A54／A59／A60 は差分なしまたは残置＝変更なし。A44（主要客の顧客名）は PII ゲート待ち＝不触。実装＝`ad44954`。

## 裁定159（2026-09-07）ホームの不足表示は Warning 系のみ＝Danger トークンを使わない（裁定120 適用・ホーム v2.1 M23）

出典＝相談役ブロック（H2）・Agoora「推奨で」確定。時間帯バーと充足ピルは既存 `nox-stpill` の ok／warn／ng（裁定B の3色＝警告面）で描き、
`--danger` 系は使わない（不足は「取り消し困難な操作」ではなく状態の警告）。dashboard-board に --bad／--warning／--danger の直接参照は 0 件のまま。実装＝`84c3e82`。

## 裁定158（2026-09-07）ホームの lead・営業日・お知らせは据え置き（M3／M4／M28）

出典＝相談役ブロック（H1「M3・M4・M28 変更なし」）・Agoora「推奨で」確定。モック lead「今日やることと、営業状況を優先順に確認します。」は
「今日やること」（M11）・「営業状況」（M26）＝いずれも新要件で実体がない語のため寄せない。M4 営業日・M28 お知らせ最新2件は逐語一致。

## 裁定157（2026-09-07）本日の出勤 KPI は「N / 予定N名」＋内訳「未着・遅刻／欠勤」（M8・late＋eta で近似）

出典＝相談役ブロック（H2）・Agoora「推奨で」確定。attendance の既存 status（shukkin／dohan／late／absent）から導出＝式・取得は不変。
「未着」の明示ステータスは無い（M16 打刻判定は新要件）ため「未着・遅刻」を late で表す。実装＝`84c3e82`。

## 裁定156（2026-09-07）ランキングは見出しのみ「本指名ランキング（今月）」へ・上位 5 名と場内／同伴の併記は据え置き（M27）

出典＝相談役ブロック（H1）・Agoora「推奨で」確定。モックの 3 名・本指名のみへの縮約は情報を減らす＝行わない。get_cast_ranking の取得・順位式不変。実装＝`8e2eeff`。

## 裁定155（2026-09-07）クイック操作は見出し・文言のみ寄せ、9 枚の導線は据え置き（M25）

出典＝相談役ブロック（H1）・Agoora「推奨で」確定。「クイックアクション」→「クイック操作／よく使う業務だけに絞ります。」。モックの 4 枚
（レジを開く／当日シフト／日報・締め／顧客検索）へ削るのは既存導線を消すこと＝行わない（href／label／role ゲート不変）。実装＝`8e2eeff`。

## 裁定154（2026-09-07）ホーム v2.1 の「既存」行は当該画面に描画済みのものだけ A層で追随し、他画面実装の流用行は M11「今日やること」レーンへ送る

出典＝相談役ブロック（H2＝案(b)）・Agoora「推奨で」確定。対応表 §9 で「既存」とされた 19 行のうち、ホームに描画済みは 9 行・他画面の実装を
流用する行が 10 行（教訓60）。A層では**新規クエリを足さず既存 state／計算からの表示追加で済む行だけ**を実装＝M9 帯ラベル／M12・M15 導線文言
（不足時「追加配置へ」・遷移先は /shift のまま）／M14 仮シフト未確認（proposed 件数）／M22 4分割（出勤予定／出勤済み／未着・遅刻／欠勤）／
M23 時間帯バー（計算済み todayBands の展開）。**M13／M17／M18／M20／M24 は新規クエリ（予約・open 伝票・当日日報・売掛）を伴う合成**＝
対応表を「新要件（ホーム合成・M11 レーン）〔旧: 既存…〕」へ訂正し、M11「今日やること」カードと同じレーンで設計する。実装＝`84c3e82`。

## 裁定153（2026-09-07）帯訂正 6e0c73e7 の伝票側影響＝開栓時スナップショットで凍結・日報側に是正経路なし（起票#61＝レジ v12.1 送り）

出典＝相談役ブロック（日報 v2.1 付記実測）・Agoora「推奨で」確定。日報集計（daily_report_aggregate）は check_lines.line_total を合算するだけで
料金ルールを読まない。延長の額は check_open 時に pricing_resolve_core で解決した `checks.ext_fee／ext_min／ext_menu_snap` に凍結され、
check_time_charge_apply がそこから行を作る＝**訂正は訂正後に開栓した伝票からのみ反映**。live 実測（CLUB NOX・2026-09-07）: ext_fee=30／ext_min=5000 で
凍結された伝票 **1 件**（`105a0a77-c33c-4814-a862-1ba5b36886c5`・2026-09-03 05:57 UTC 開栓・**open のまま**・行はセット料金 1 本＝延長行の生成なし）。
延長行の母数 12 本のうち 30 円／5000 分で生成された行は **0**（日報への実害は現時点でゼロ）。当該伝票に延長を適用すると逆転値で課金されるため、
レジ側（void→再開栓 or 凍結値の訂正 RPC）で扱う＝#61。

## 裁定152（2026-09-07）日報の「カードTAX」表記を「カード手数料（日報集計用）」へ（会計設定 C1＝裁定131 と整合）

出典＝相談役ブロック（R1）・Agoora「推奨で」確定。日報プレビューは stores.card_tax_rate（page.tsx 22 行）から `cardTax = roundYen(card×rate/100)`、
締めは daily_report_close が列読みで daily_reports.card_tax へ凍結（mig0051:130）。値・式は不変で表記のみ（プレビュー行・全列表ヘッダ「TAX」→「カード手数料」）。
実装＝`98fb7d0`。

## 裁定151（2026-09-07）月報のエラー文は Danger 系トークン（裁定120 適用・日報面の他の --bad 系は触らない）

出典＝相談役ブロック（R2）・Agoora「推奨で」確定。month-report 162 行の `--bad` → `--danger-ink`（暗面上の文字色として可読＝裁定124 で据え置きの値）。
report-board の締めチェック帯（NG＝--bad-bg／--bad）は「問題あり」の**警告面**＝Warning 扱いで --bad 系のまま整合。実査差異・諸経費・値引きの赤字は
数値強調＝Danger ではない。締める／再締め／回収／給与天引きの操作ボタンは日常操作＝Danger 色は付けない。実装＝`9531d41`。

## 裁定150（2026-09-07）日報の表記 4 件をモック逐語へ（D3／D7／D18／D44）

出典＝相談役ブロック（R1）・Agoora「推奨で」確定。D3「営業中（未締め）」→「営業中・未締め」／D7「区切り HH:MM」→「営業日切替 翌HH:MM」
（値は settings_json.biz_cutoff_hm のまま）／D18「実査差」→「実査差異」（注記の式も語だけ追随・式不変）／D44「回収」→未回収は「回収を登録」・
一部回収済みは「追加回収」（経路は同じ部分回収モーダル）。実装＝`98fb7d0`。

## 裁定149（2026-09-07）売上内訳は「シャンパン・ボトル」を表示合算のみ（D21・kindSums 不変）

出典＝相談役ブロック（R2）・Agoora「推奨で」確定。モック 5 分類「セット・延長／ドリンク／シャンパン・ボトル／指名・同伴／その他・調整」に対し、
champ＋bottle を**表示側で合算**（集計式 kindSums は不変）。「指名・同伴」は check_lines.kind に同伴の区別が無いため「指名・その他」据え置き、
「その他・調整」は値引きを別掲しているため作らない。実装＝`9531d41`。

## 裁定148（2026-09-07）日報 KPI は並びのみモックへ・「暫定」表記は据え置き（D9）

出典＝相談役ブロック（R1）・Agoora「推奨で」確定。当日カードはクライアント集計（暫定）で、確定値は締め時のサーバ再集計＝締め前に「確定売上」と
書くと意味が変わる。並びを「売上（暫定）／組数／客単価／現金／カード」へ。「カード等」の「等」は現行 card のみ＝付けない。実装＝`98fb7d0`。

## 裁定147（2026-09-07）日報・締め管理の lead はモック逐語へ（D1）

出典＝相談役ブロック（R1）・Agoora「推奨で」確定。「営業日の締め、月次集計、売掛回収までを一つの流れで管理します。」＝月次集計（月報タブ）・
売掛回収（売掛タブ）とも器あり。D2／D5／D11／D13／D17／D19／D26／D27／D28／D32／D33／D36／D41／D46 は変更なし。実装＝`98fb7d0`。

## 裁定146（2026-09-07）裁定120 の適用＝取り消し困難な操作ボタンは Danger 系トークン（キャスト管理 v3.1 C2）

出典＝相談役ブロック（キャスト管理 v3.1 A層 C2）・Agoora「推奨で」確定。globals.css に `--danger`（107 行・#e26762＝--bad 同値）と
`--danger-bd`（112 行・rgba(226,103,98,.28)）が定義済みであることを実測してから、体入「見送り」（casts-board）と「在籍を解除」（staff-board）の
`--bad`／`--bad-bd` を置換。--bad 系は警告面（bg/bd/ink）用・Danger 系は操作用の意味分離。**app/ 全体の --bad 系参照は 201 件／42 ファイル**
（register 36・payroll 22・kiosk-register 14・report 14・shift 10…）＝本コミットは 2 箇所のみ・残りは各 UI レーンで報告のうえ是正。実装＝`62d476e`。

## 裁定145（2026-09-07）スタッフ権限は現行 2 値のまま（キャスト管理 v3.1 K45・モック 3 値は粒度差）

出典＝相談役ブロック（C1「K45 は変更なし」）・Agoora「推奨で」確定。モックの「閲覧のみ／編集可／不可」3 値は set_staff_perms の boolean 4 フラグと
粒度が違う＝RPC 領域。A層では触らない（表示は現行チップのまま）。

## 裁定144（2026-09-07）写真モーダルは文言のみ寄せる（キャスト管理 v3.1 K24・削除／トリミング／D&D は対象外）

出典＝相談役ブロック（C1）・Agoora「推奨で」確定。見出し「プロフィール写真（名前）」・説明「キャスト一覧・レジ・指名画面などで使用します。」・
「写真を選ぶ（JPEG/PNG）」・「写真を保存」へ。削除は bucket `cast-photos` に delete policy が無い＝policy 追加は mig 領域・トリミングは client 実装・
D&D は UI＝いずれも A層の外。実装＝`0b896ce`。

## 裁定143（2026-09-07）待遇タブの「保証時給」→「通常時給（プラン基本）」（キャスト管理 v3.1 K35）

出典＝相談役ブロック（C1）・Agoora「推奨で」確定。現行ラベル「保証時給」は comp_plans.base（＋overrides.base）＝プラン基本を指し、モックの
「入店時給保証」（K33・第2期・期間付き別レイヤ）と語が衝突する。キャスト詳細側を「通常時給（プラン基本）」へ改名（値・経路不変）。
★報酬プラン側（plan-editor 2 箇所・comp-sections 5 箇所）は「保証時給」のまま＝射程外。キャスト詳細のマスタ導線注記に
「マスタ側の表記は『保証時給』」と併記して橋渡し。報酬プラン側の改名は報酬レーンで再裁定。実装＝`0b896ce`。

## 裁定142（2026-09-07）基本情報の「入店日」→「本入店日」（キャスト管理 v3.1 K27）

出典＝相談役ブロック（C1）・Agoora「推奨で」確定。joined_on は cast_create／trial_hire の入店日＝体験入店（trials）との対比語として
モックの「本入店日」と整合する。表示行と編集行ラベル（源氏名・本入店日）を改名。値・RPC（set_cast_profile）不変。実装＝`0b896ce`。

## 裁定141（2026-09-07）キャスト管理の lead は器のある語だけで寄せる（キャスト管理 v3.1 K2）

出典＝相談役ブロック（C1）・Agoora「推奨で」確定。モック「在籍・待遇・勤務条件・連絡先・アカウントをキャストごとに管理します。」のうち
「勤務条件」（K30/K31 器なし）「連絡先」（K37 LINE 器なし）は書かない＝「在籍・待遇・実績・アカウントをキャストごとに管理します。」。
K36 の説明文もモックの 2 カード語彙（本人レコード／NOXログインアカウント）へ寄せる（構造は現行の行形式のまま）。実装＝`0b896ce`。

## 裁定140（2026-09-07）一覧フィルタの「休入」は寄せない＝「体入」据え置き（キャスト管理 v3.1 K9・第2期で再裁定）

出典＝相談役ブロック（C1「K9 は変更なし」）・Agoora「推奨で」確定。モックの「休入」は在籍 5 状態（K25・第2期）の語で、現行の「体入」
（trials 別表）とは別概念＝A層で語だけ寄せると意味が先行してずれる。K40 打刻 PIN・K41 体入詳細・K44 スタッフ一覧（表形式）も変更なし。

## 裁定139（2026-09-07）#58 対処＝f0 冒頭の audit_logs 掃除 gate（b）＋rls の全件 select を count head へ（c）

出典＝相談役ブロック（#58 対処(b)(c)・確定扱い）。主因＝**単調増加表の verify 残骸**（教訓58）。mig なし。
- **(b) `verify:nox-audit-sweep`（`scripts/verify-nox-audit-sweep.ts`）を verify:f0 の先頭に追加**（grants 段と同じ Postgres 直結＝
  SUPABASE_DB_URL・postgres・statement_timeout 2min）。verify org（NOX-VERIFY-A／B）の **org_id 2 値を直書き**（orgs.name に依存しない）で
  `delete from audit_logs where org_id = any(...) and action <> 'seed_marker'`。出力＝削除前／削除／削除後（期待 0・>0 なら FAIL）＋残総数。
  削除前が **5,000 行超なら warn**（肥大の早期検知・fail はしない）。seed:f0 の常設マーカー（org A・action='seed_marker'＝rls 段の被験行）は
  除外し、**無ければ FAIL して seed:f0 再投入を促す**（手貼り全消しで marker まで消え rls が決定論的に赤になった同日実例＝下記）。
  FK 参照元 0 本・トリガ 0 本（live 実測）＝DELETE は単独で完結。verify org 以外の行には触れない（sweep-2 で総数差を assert）。
- **(c) `verify-nox-rls.ts` 147／166 行**（managerA1／castA1a の「audit_logs = 0 行」）: 全件 `select('id')` → `select('id', {count:'exact', head:true})`
  ＝意味不変・転送ゼロ。RLS 越しの per-row 評価コストは残る旨をコメント（母数は (b) で抑える）。
- **実測**: Agoora の手貼り掃除（124,134 行）後の live＝878 行（autovacuum 15:00 JST）。**同日 15 時台に Agoora が `vacuum full` 実施（SQL Editor 単文）**＝
  total **151 MB → 1,640 kB（index 432 kB）**（Agoora 実測直後）。CC 再実測（f0 1 走後・sweep 前）＝total 2,656 kB／heap 1,744 kB／index 784 kB・live 1,678。f0 1 走あたりの verify 残骸＝**約 400〜800 行**（sweep の削除前件数＝397／797）。
  f0 2 連緑＝**37 本 3,550**（36 本＋sweep 4）・所要 439s／706s（掃除前 7〜12 分と同程度＝全体は他スイート支配。**rls 段は 7 分→2 分未満**）。
  golden 6 値不変。逆張り＝(b) service_role で verify org に 1 行 insert→sweep で削除→0 ／ (c) probe 1 行を置いた状態で owner セッションの同 assert が
  count=1 で FAIL・sweep 後に 0 で PASS（rls の意味が変わっていないことの実証）。
- **f0 本数の基準（handoff 参照用）**: 36 本 3,546 → 37 本 3,550（sweep 4 assertions）→ 38 本 3,570（flags 20 assertions・2026-09-09 2 連緑 761s／723s）→ 39 本 3,642（staff-shift 53 assertions＋grants 298→317・2026-09-10 2 連緑 412s／454s）→ 40 本 3,721（reopen 65 assertions＋billing 53→53＋grants 317→329・2026-09-10 2 連緑 889s／1049s）→ **41 本 3,765**（旧 3,721＋reopen 65→73（+8）＋payroll 195→212（+17）＋payroll-list 新設 19（+19）＝+44・2026-09-11 2 連緑 923s／993s）。→ **45 本 3,824**（3,765＋labor-cost 13（B6-4）＋compare 20（B6-11）＋cast-stats 14（B6-12）＋shift-gap 12（裁定245）・2026-09-14 2 連緑 488s／630s）。→ **46 本 3,853**（3,824＋d45 29（mig0143・裁定D45-1〜9）・2026-09-14 2 連緑 471s／541s）。→ **47 本 3,893**（3,853＋anon-guard 986→987（set_store_profile probe）＋store-profile 新設 39（mig0144・裁定250）・2026-09-14 2 連緑 758s／700s）。→ **48 本 3,925**（3,893＋anon-guard 987→988（seat_reorder probe）＋seat-reorder 新設 31（mig0145・裁定255）・2026-09-14 2 連緑 567s／547s）。→ **49 本 3,966**（3,925＋payroll-adjust 新設 40（mig0146・裁定258）＋payroll 212→213（B5 A2 を許可列挙化＝3 RPC の実在 assert +1）・2026-09-15 2 連緑 590s／492s・同一 HEAD c9f6aee）。→ **49 本 4,027**（3,966＋payroll-adjust 40→101（+61・裁定264 (a)(b)(c)）・段数不変・2026-09-17 2 連緑 587s／514s・同一 HEAD edf2d15）。→ **50 本 4,070**（4,027＋staff-email 新設 43（裁定267）・2026-09-17 2 連緑 618s／626s・同一 HEAD f8fdc0e）。→ **50 本 4,089**（4,070＋store-profile 39→58（mig0147・裁定269-1）・段数不変・2026-09-17 2 連緑 811s／787s・同一 HEAD fbf1f9c）。→ **52 本 4,175**（4,089＋store-systems 新設 30（裁定269）＋setup 新設 56（裁定271）・2026-09-17 2 連緑 526s／603s・同一 HEAD 7c0524a）。→ **53 本 4,200**（4,175＋late 新設 25（裁定268）・2026-09-17 2 連緑 467s／531s・同一 HEAD 2f3377e）。→ **58 本 4,337**（4,200＋478303d の client 前倒し分（product-bulk 35→39・setup 56→61・payroll-adjust 101→102）＋0148＝carryover 新設 30・referral 新設 25・cast-norm-self 新設 16・product-types 新設 20・receivable-policy 新設 13＋既存追随（anon-guard 988→992・receipt 64→67・pricing 150→151・payroll-adjust 102→110）・2026-09-18 2 連緑 613s／851s・同一 HEAD d7a2084）。→ **58 本 4,337**（段数・件数不変＝M5 `6b1f017`・M1-2 `9cff22c` は表示のみ・2026-09-18 2 連緑 753s／843s・同一 HEAD 9cff22c）。→ **59 本 4,351**（4,337＋shift-tabs 新設 14（裁定274）・2026-09-18 2 連緑 939s／1013s・同一 HEAD 9e6cf85）。**golden 6 値は不変＝5931／125802／55233／64／64／53**。
- **handoff v34 収蔵（2026-09-17）**: Downloads から `docs/handoff/` へ収蔵（git 追跡へ追加・sha 全64桁付き・教訓72）。v34＝`NOX_相談役引き継ぎ_2026-09-17_v34.md`（14,107 B・sha256 `6d1cea98f86990656b7fb2650fa950953c37af3cbb43e6ce38f0fca838cf669d`・64 桁と照合一致・Downloads 原本と収蔵後の再計算がともに同 sha）。v33（`3c786f7`・14,537 B・sha256 `dcef14298c0aecb14e17de76011a7f9e4867ee888fdc8852f0a46fe8e91082a4`）に続く版。教訓88 は提案段階＝本収蔵では収載しない。docs のみ＝f0 不走（裁定256）。
- **handoff v35 収蔵（2026-09-17）**: Downloads から `docs/handoff/` へ収蔵（git 追跡へ追加・sha 全64桁付き・教訓72）。v35＝`NOX_相談役引き継ぎ_2026-09-17_v35.md`（13,262 B・sha256 `4c2a5b9d6e29d84045e173beaff0cda0a267cf5fa2d19f9edd43d3967c70624a`・64 桁と照合一致・Downloads 原本と収蔵後の再計算がともに同 sha）。v34（`cb916cc`・14,107 B・sha256 `6d1cea98f86990656b7fb2650fa950953c37af3cbb43e6ce38f0fca838cf669d`）に続く版＝本断面（267／259／0147・f0 pin 50 段 4,089）の最終断面。教訓88 は提案段階＝本収蔵では収載しない。docs のみ＝f0 不走（裁定256）。
- **handoff v36 収蔵（2026-09-17）**: Downloads から `docs/handoff/` へ収蔵（git 追跡へ追加・sha 全64桁付き・教訓72）。v36＝`NOX_相談役引き継ぎ_2026-09-17_v36.md`（12,410 B・sha256 `e39df6315c8818fd0e1d9d1650845548948f548222b8da103c1b5a3ac71fa40b`・64 桁と照合一致・Downloads 原本と収蔵後の再計算がともに同 sha）。v35（`580d0b4`・13,262 B・sha256 `4c2a5b9d6e29d84045e173beaff0cda0a267cf5fa2d19f9edd43d3967c70624a`）に続く版＝本断面（269 出し分け／270・271 ウィザード・f0 pin 52 段 4,175）の最終断面。教訓88 は提案段階＝本収蔵では収載しない。docs のみ＝f0 不走（裁定256）。
- **handoff v37 収蔵（2026-09-18）**: Downloads から `docs/handoff/` へ収蔵（`fe0e19c`「docs: v37 収蔵」・git 追跡へ追加・sha 全64桁付き・教訓72）。v37＝`NOX_相談役引き継ぎ_2026-09-18_v37.md`（15,811 B・sha256 `e33766f2e0557942befbc259645e33d07d8d73a08242782e01897b1f508e4f5a`・64 桁と照合一致・Downloads 原本と収蔵後の再計算がともに同 sha・cp のバイト複写＝改行変換なし）。v36（`e3b73a0`・12,410 B・sha256 `e39df6315c8818fd0e1d9d1650845548948f548222b8da103c1b5a3ac71fa40b`）に続く版＝本断面（268 遅刻分数・裁定272 0148 設計・0148 起草／突合・client 前倒し 478303d）の最終断面。収蔵時は 0148 未貼付＝478303d を道連れにしないため push せず（同便の報告後に Agoora が 0148 を手貼り）。★便 1 の報告で機械時刻を「02:13 JST」と書いたが Git Bash の `TZ=Asia/Tokyo date` は tzdata 不在で UTC を GMT 表示する＝実際は 11:13 JST（本便で訂正・以後は `date`（Windows ローカル＝JST）と `date -u` を併記）。
- **handoff v41 収蔵（2026-09-30・便 AC-1）**: Downloads から `docs/handoff/` へバイト複写（git 追跡へ追加・sha 全64桁付き・教訓72）。v41＝`NOX_相談役引き継ぎ_2026-09-30_v41.md`（10,994 B・96 行・sha256 `8f79939553f636be81461cc67383f644ff52de26ab8796bc2a3b901e250cc3c9`・64 桁と期待値（先頭 8f799395・末尾 c3c9）を照合一致）。v38〜v40 は収蔵済み（v40＝3527957）だが本欄に行が無い＝ここで補記（v38 2026-09-24／v39 2026-09-25／v40 2026-09-28・sha は各収蔵コミットの現物）。
- **handoff v42 収蔵（2026-09-30・便 P161-2）**: Downloads から `docs/handoff/` へバイト複写（git 追跡へ追加・sha 全64桁付き・教訓72）。v42＝`NOX_相談役引き継ぎ_2026-09-30_v42.md`（10,674 B・92 行・sha256 `7bed660fcd3b263602208ed4ba4c2624fea10caffae381107a2ca13f1cf46941`・64 桁と提示値（先頭 7bed660f・末尾 6941／10,674 B／92 行）を照合一致・Downloads 原本と収蔵後の再計算がともに同 sha）。v42 §0 の「P160 の確定値は新チャットで台帳に記す」＝上の現在地（便 P160 完了＋0161 本番適用）で確定。
- **handoff v43 収蔵（2026-10-08・便 V-0）**: Downloads から `docs/handoff/` へバイト複写（cp・改行変換なし・git 追跡へ追加・sha 全64桁付き・教訓72）。v43＝`NOX_相談役引き継ぎ_2026-10-08_v43.md`（12,851 B・101 行（LF・CR 0）・sha256 `e4fbaab95203201ea901d1166cbb6f7bc1d96fd94462bbca6169fa8f38cc45ba`・64 桁と提示値（先頭 e4fbaab9・末尾 45ba／12,851 B／101 行）を照合一致・Downloads 原本と収蔵後の再計算がともに同 sha・cmp 一致）。v42（`d1cd92c`・10,674 B・sha256 `7bed660fcd3b263602208ed4ba4c2624fea10caffae381107a2ca13f1cf46941`）に続く版＝本断面（M3〜M5・MC0〜MC2・S1・W5-1・D0／D1・0163／0164 起草・f0 93 段 5,506）の最終断面。同じ docs コミット「docs: v43 収蔵・追補」で §3 の追補（330 追補2／331 追補1／333 追補1／328 追補2／334 追補1）と裁定335 を収載。教訓103 は提案段階＝本収蔵では採番しない（本文は便 V の報告に貼付・採番は相談役）。docs のみ＝f0 不走（裁定256）。
- **handoff v44 収蔵（2026-10-09・便 V44 V-0）**: Downloads から `docs/handoff/` へバイト複写（cp・改行変換なし・git 追跡へ追加・sha 全64桁付き・教訓72）。v44＝`NOX_相談役引き継ぎ_2026-10-09_v44.md`（14,494 B・103 行（LF・CR 0）・sha256 `93ac76ee3046ffbd89e1e9be82397def7e33d776aa734c0b2ad3de0fd2667d21`・64 桁と提示値（先頭 93ac76ee・末尾 6d21／14,494 B／103 行）を照合一致・Downloads 原本と収蔵後の再計算がともに同 sha）。v43（`9b2021a`・12,851 B・sha256 `e4fbaab95203201ea901d1166cbb6f7bc1d96fd94462bbca6169fa8f38cc45ba`）に続く版＝本断面（便 V〜X-13c・0163〜0166 本番適用・名簿 304・f0 96 段 5,630）の最終断面。同じ docs コミット「docs: v44 収蔵・裁定337／338・X-13 台帳」で §3 の裁定337・338・恒久注意 3 点（恒久注意欄 18〜20）と X-13 台帳の転記（docs/demo/x13_ledger.md）を収載。教訓106／107 は提案段階＝本収蔵では採番しない（本文は便 V44 の報告に貼付・採番は相談役）。docs のみ＝f0 不走（裁定256）。
- **handoff v45 収蔵（2026-10-13・便 V45 V-0）**: Downloads から `docs/handoff/` へバイト複写（cp・改行変換なし・git 追跡へ追加・sha 全64桁付き・教訓72）。v45＝`NOX_相談役引き継ぎ_2026-10-13_v45.md`（15,054 B・105 行（LF・CR 0）・sha256 `8e8a931d5cacf3ad4e33edf16c0e57cd3dc36639edc91012cd45caea878a1d85`・64 桁と提示値（先頭 8e8a931d・末尾 1d85／15,054 B／105 行）を照合一致・Downloads 原本と収蔵後の再計算がともに同 sha）。v44（`abda9c5`・14,494 B・sha256 `93ac76ee3046ffbd89e1e9be82397def7e33d776aa734c0b2ad3de0fd2667d21`）に続く版＝本断面（便 V44〜P168・0167／0168 本番適用・0169 起草・名簿 305・f0 100 段 5,722）の最終断面。同じ docs コミット「docs: v45 収蔵・裁定342・教訓109・週末 reset」で §3（337 追補1・338 追補2・X-13-28 追補・341 追補1・教訓109・裁定342・X-13-29・恒久注意欄 24〜26）と V-2（10/10〜10/13 の無人 reset 読取）を収載。docs のみ＝f0 不走（裁定256）。
- **handoff v46 収蔵（2026-10-16・便 V46 V-0）**: Downloads から `docs/handoff/` へバイト複写（cp・改行変換なし・git 追跡へ追加・sha 全64桁付き・教訓72）。v46＝`NOX_相談役引き継ぎ_2026-10-16_v46.md`（15,191 B・96 行（LF・CR 0）・sha256 `5f001543c24874dc2e96b0c5e4607303a14add8c446f81951d7828e2464597fa`・64 桁と提示値（先頭 5f001543・末尾 97fa／15,191 B／96 行）を照合一致・Downloads 原本と収蔵後の再計算がともに同 sha・cmp バイト一致）。併せて＝docs/expert/answers_20261014.md は `3af8907`（便 N1014）で既に追跡済み（v46 §0 の「未追跡」は旧い＝前提の不一致はこの 1 点のみ・停止せず報告）・scripts/demo/poc-record.mjs は docs/dp/poc_record_20261016.md に逐語で md 化して本体削除（起票105 の処置・docs/tmp/0149_poc.md は .gitignore のまま）。
- **本番向け付記**: audit_logs の retention（保持期間・アーカイブ）は**ローンチ後必須**（税理士ゲート後＝裁定23 系）。本 gate は verify org 限定であり
  本番 org の行には一切触れない。

## 裁定138（2026-09-07）仮シフトタブに「確定シフトへ」導線（シフト v4.1 H29）

出典＝相談役ブロック（シフト v4.1 A層 S2）・Agoora「推奨で」確定。公開状態ピルの横に「確定シフトへ」＝`setTab("roster")` の表示切替のみ
（RPC なし・計画期間がある月に表示）。モックの「公開状態」カード自体（公開日時・公開後の変更一覧＝H26/H30）は器なし＝対象外。実装＝`085e8d3`。

## 裁定137（2026-09-07）承認待ちの差分表示＝「本人希望 → 管理側」（シフト v4.1 H21）

出典＝相談役ブロック（S1）・Agoora「推奨で」確定。現行の2段表示「希望 HH:MM／提案 HH:MM」をモック逐語の横並び「本人希望 HH:MM → 管理側 HH:MM」へ。
「管理側」＝planned 段の提案時刻（shift_wish_decide 後に shift_set で直した時刻）＝現行の意味と一致・値と出所は不変。実装＝`fa4d613`。

## 裁定136（2026-09-07）「必要人数を設定」はモーダル化せず常設カードへのスクロール導線（シフト v4.1 H7／H43）

出典＝相談役ブロック（S2）・Agoora「推奨で」確定。モックはボタン→モーダル（曜日基本＋時間帯上乗せ）だが、現行は仮シフトタブ内の常設カード
（裁定112-A で移設＝「見る場所と設定する場所の一致」）＝モーダル化はこの裁定と衝突するため行わない。計画ヘッダに「必要人数を設定」ボタンを置き
既存 `gotoNeeds`（日詳細からの導線）で `#shift-needs` へスクロール。必要人数の形状（バンド絶対値 vs 基本＋上乗せ・H43）は変更なし。実装＝`085e8d3`。

## 裁定135（2026-09-07）期間バッジ draft の表示語＝「作成中」（シフト v4.1 H9）

出典＝相談役ブロック（S1）・Agoora「推奨で」確定。`PERIOD_ST_LABEL.draft` を「下書き」→「作成中」（モック逐語）。open「募集中」／closed「締切」／
published「公開済み」はモックに無い＝据え置き。戻すボタンも「下書き保存」→「作成中に戻す」で語を揃える（RPC・status 値は不変）。実装＝`fa4d613`。

## 裁定134（2026-09-07）H8「スタッフに公開して確定」は据え置き（シフト v4.1・モック「スタッフへ公開」へ寄せない）

出典＝相談役ブロック（S1「H8 は変更なし」）・Agoora「推奨で」確定。現行の published 化は「公開＝確定」の意味を含む（期間単位の確定 H38 は準備中・
status に confirmed 値なし）。モック語「スタッフへ公開」へ寄せると「確定」の語が消え、H38 実装前に意味が先行してずれるため据え置き。H38 のレーンで再裁定。
★本項の案文はブロックに本文が無く、CC が「H8 変更なし」の指示から起こしたもの＝相談役の意図と違えば差し替え。

## 裁定133（2026-09-07）承認待ちのフロー帯は4段のまま語彙をモックへ寄せる（シフト v4.1 H5）

出典＝相談役ブロック（S1）・Agoora「推奨で」確定。モックの6段「申請→承認→作成→公開→仮シフト→確定」のうち「作成・公開」は period 側の状態
（shift 行の status 遷移ではない）＝この帯には載せない。4段の語彙を「申請（キャスト希望）／承認（管理者確認・時間調整）／仮シフト（キャスト確認）／確定」
へ寄せ、括弧内に従来の段名を残して意味を保つ（件数の母数＝wishes pending／planned／proposed／confirmed は不変）。実装＝`fa4d613`。

## 裁定132（案・2026-09-07）NOX UI トークン guard＝globals.css 正本 parse・baseline 減少のみ（Agoora 確定待ち）

出典＝相談役ブロック（トークン guard 新設）。`scripts/verify-ui-tokens.ts`＋`npm run verify:ui-tokens`（**f0 には組み込まない＝別 gate**・DB 非接続）。
- **正本＝`app/globals.css` を直接 parse**（手書きミラー禁止）。★着手前実測: `:root` は ink/bg/font-sans/font-serif の**4本のみ**で、パレット本体は
  `.nox-dark` ブロック（53 名）＋局所セレクタ（modal 3 名）＝計 **57 名**。`:root` 単独を正本にすると既存参照 1,424 件が未定義になるため、
  **globals.css 内で定義される全カスタムプロパティ（コメント除去後）を正本**とし、出力に定義元の内訳（:root／.nox-dark／局所）を出す。
  :root の 4 名は全て意味名・色名系 0（`.nox-dark` 側には gold/gold2/champ/blue/orange 等の色名トークンが残る＝裁定124「今後作らない」の既存分）。
- **検出A**＝色リテラルの裸使用（`#hex`／`rgb(`／`hsl(`／CSS プロパティ文脈の色名。コメントは除去・tone 識別子 "gold" 等は対象外）。
  **検出B**＝定義されていない `var(--…)` 参照。走査＝app/ と components/ の .tsx/.css（globals.css 自身と design/ 配下は除外）。
- **baseline**＝`scripts/ui-tokens-baseline.json`（`path|kind|hit` → 件数）。baseline 内＝warn・baseline 外＝**FAIL**。baseline 件数は必ず出力し
  **減少方向のみ許容**（現状が baseline を下回った鍵は stale 表示＝削除可・新規ヒットは baseline に足さず是正）。`--write-baseline` は減少更新にのみ使う。
- 着手時実測（2026-09-07）: 走査 **109 ファイル**（tsx 109／css 0）・A＝**56 件／16 ファイル**（rgba( 31・#fff 5・#000 5・#666 5 ほか＝領収書公開面
  `r/[token]`・印刷面・ピル枠 rgba が主）・B＝**1 件**（pricing-board `var(--fg)`＝未定義・既存 ack ラベル）・baseline＝**30 鍵／57 件**。
  **既存コードの色は本 guard では直さない**（報告のみ）＝是正は各 UI レーンの裁定で。
- 逆張り: 一時 tsx に `#ff0000`＋`var(--not-exist)` 注入→FAIL 2 件→撤去→緑／baseline から既存鍵1つ削除→FAIL 1 件→復元→緑（2026-09-07 実走）。
- 旧値台帳（デザインパック正本化台帳 裁定124）に退避された旧トークン**名**は無い（退避は**値**＝blue-accent v2 の旧値のみ・名前は不変）。
- **既存 `.nox-dark` の色名トークン 53 名は凍結**（gold／gold2／champ／blue／orange 等＝参照 1,400 件超・改名は全画面の差分を生むため行わない）。
  **意味名規則（裁定124「色名トークンは今後作らない」）は新規トークンにのみ適用**＝guard は新規の色リテラル・未定義参照を止めるものであり、
  既存色名トークンの参照は検出対象外。
- 2026-09-07 追記: B 1 件（pricing-board `var(--fg)`）は `--ink`（本文基底色・:root／.nox-dark 双方で定義・`--v2-text` は同値のエイリアス）へ差替
  → baseline 57→56 へ減少更新（減少方向の更新例1件目）。

## 裁定131（2026-09-07）カード手数料の2系統を1カードに再編（料金 v8.1 P52 移設・P53/P54 不変）

出典＝相談役ブロック（料金 v8.1 A層 C1）・Agoora「推奨で」確定。`card_tax_rate`（日報集計用・set_store_pricing）と `card_surcharge_rate`
（お客さまへ加算・set_store_tax_config・裁定90-⑤／87 第2層）は**列レベルで分離済み**＝DB・RPC 不変で **UI のみ再編**。
- PricingPanel に `fields="card_tax"`（card_tax_rate のみ）を新設し、`"service"` の担当から card_tax_rate を外す。分割マウントの保存は
  従来どおり**保存直前に stores を再読し担当外をサーバ現在値で埋める**＝どちらの保存でも相手側を巻き戻さない（実走で service_rate 不変を確認）。
- 会計設定の「税・サービス料」カードはサ料のみ。旧「カード手数料の転嫁」カードを**「カード手数料」**へ改称し、日報集計用の率入力を同居
  （モック v8.1 132〜135 行の構造）。有効／無効・加算率・警告文・初回 ack は現状維持（ack は裁定130）。保存ボタンは経路ごとに2本のまま。
- 実装＝`ea3b621`。

## 裁定130（2026-09-07）転嫁の契約確認 ack はモックに無くても残置（料金 v8.1 P54・法務）

出典＝相談役ブロック（C1 の「ack は現状維持」）・Agoora「推奨で」確定。モック v8.1 の「カード手数料」カードは警告文のみで ack チェックを
持たないが、**裁定87 第2層（無効→有効の切替時に「契約上の可否を確認しました」を必須・保存で記録）は残置**する（加盟店契約の転嫁制限＝法務）。
「モックに無い既存機能は消さない」（恒久注意・裁定126 §16）の適用例。

## 裁定129（2026-09-07）VIP料金方式カード＝読み取り表示のみ・保存 UI は置かない（料金 v8.1 P39）

出典＝相談役ブロック（料金 v8.1 A層 C2）・Agoora「推奨で」確定。店単位の VIP 既定額列は存在しない（live 実測）＝保存型にすると mig 領域。
- 料金マスタタブに**読み取りカード「VIP料金方式」**を新設（モック 92 行の構造）。方式A（VIP 専用料金）は席種「VIP」の set／extension ルール、
  方式B（VIPチャージ）は `vip_charge` ルールを rules から判定し「使用中／未使用」で表示（方式B は額・課金単位・表示名を最大3件）。
- 導線は「ルールで設定」（ルールタブへ切替）のみ。裁定118（2方式は常時併用可・選択式トグルは作らない）は不変＝カードの「使用する／しない」は実態表示。
- タブ冒頭の2方式説明文はカードへ吸収（消さず移動）。実装＝`916ac02`。

## 裁定128（2026-09-07）プレビューの「指名キャスト」は「キャストランク」に統合（料金 v8.1 P13→P14）

出典＝相談役ブロック（C3「指名キャストのランク(ranks state)」）・Agoora「推奨で」確定。キャスト個別料金の器は無い（pricing_rules は rank_id 行のみ）
＝「指名キャスト」の入力は**ランクの代理選択**にしかならないため、入力1本「指名キャストのランク」（ranks state・is_active のみ・7択以下はセグ、
超えたらプルダウン＝教訓27）に統合する。キャスト名一覧の新規読み取りは行わない。対応表 P13 は P14 へ統合＝「実装済(A層)」。

## 裁定127（2026-09-07）料金プレビュー拡張＝6種の解決結果と解決順の注記（料金 v8.1 P12／P14〜P20）

出典＝相談役ブロック（料金 v8.1 A層 C3）・Agoora「推奨で」確定。mig0130（#52 消化＝pricing_resolve 6引数・whitelist 7種）で器は揃っている
＝**mig 不要・UI のみ**。
- 入力＝既存5種＋区分（pricing_categories・is_active）＋指名キャストのランク（裁定128）。runPreview は `p_category_id`／`p_rank_id` を送信し、
  set／extension／hon_shimei／jonai_shimei は常時、`vip_charge` は VIP 席のみ（check_open の行生成条件と同じ）、dohan は同伴時に並列照会。
  返却の `rule_id`／`billing_unit` は捨てず保持し、名前・出所はレンダ時に手元 rules／ranks で解決（R9＝stale closure を作らない）。
- 結果＝適用ルール名（name null は「表示名なしのルール」・base は「なし（基本料金）」）／セット（額・分・出所）＋**セット終了時刻**
  （入店日時＋セット分の表示計算・日跨ぎは「翌」）／延長／本指名・場内（出所＝「○○ランク」／料金ルール／店舗基本）／同伴／VIPチャージ
  （VIP 席以外は「なし（VIP 席以外）」）。既存5行（セット／同伴／サービス料／初回セット概算／カードTAX概算）と概算計算は不変＝
  延長・指名・VIPチャージは概算に含めない旨を注記。
- **解決順の注記2行（確定文言）**: 「指名料金の解決順: ランク＞料金ルール＞店舗基本」「時間料金の解決順: 料金ルール＞基本料金」
  ＝モックの「キャスト個別」は器が無いため書かない（対応表 P20 備考）。
- 実装＝`54bf807`（C2 の描画ヘルパー `usePill`→`statePill` 改名＝react-hooks lint の誤検知解消を同梱）。

---

## 裁定126（2026-09-04）UI モック設計まとめ＝設計思想の正本（§16 の8項は恒久注意へ昇格）

正本＝`docs/NOX_UI_MOCKS_HANDOFF_20260904.md`（sha256 `951838f9…5213`・18,731 bytes・Agoora 2026-09-04）。デザインパック v1.0〜v1.2 の
10ページが「何を壊してはいけないか」を束ねた**設計思想の正本**として収蔵する。「本体が正・モックが従」の原則は不変＝本書は
構造・状態遷移・表示条件・権限・履歴・設定依存の思想を定め、実装済み機能の削除根拠にはしない（裁定124 と同じ射程）。
モック名は完成候補（pricing v8／store-settings v3／register v12／shift v4／cast-staff v3／daily-ar v2／home v2／analysis v2／
announcements v2）＝正本化後の収蔵ファイルは v8.1／v12.1／v4.1／v3.1／v2.1（相談役正規化版・裁定124）。
§14「実装前に共通仕様として確定したい事項」（適用期間の非遡及／権限4層×6操作／監査対象10種／店舗機能フラグの共通定義）は
写像対応表 v1 の裁定要点と突合のうえ**仕様書化の入力**とする（§17＝次フェーズは追加モックより仕様固定）。

### 恒久注意（裁定126 §16 昇格・8項＝実装担当への重要注意）

1. モック HTML をそのまま全面書き換えで移植しない。既存実装に合わせて段階的に反映する。
2. 既存 DB を UI 都合で安易に分割しない。
3. 過去伝票・過去給与・過去シフトを、マスタ変更で自動再計算しない。
4. 人物選択に大人数プルダウンを使わない（裁定72・裁定108 CastPicker と整合）。
5. 店舗利用機能 OFF 時は UI を消すが、履歴・過去データは保持する。
6. 「現在値」だけでなく、適用期間と履歴を持たせる。
7. 会計売上・販売実績・担当顧客・指名実績を混同しない。
8. 確定後・締め後・配信後は、通常編集ではなく訂正・再確定・履歴の概念を使う。
9. **f0 は面完了時のみ・1 日 6 走以内**（2026-09-07 の 30 走超で PostgREST が夜間に signin 13.8s／rpc 22.6s へ劣化・翌朝回復＝横断設計書 §8・#58）。
10. **【裁定243（2026-09-11）で限定＝「同じ DB を触る verify を並走させない」。他プロジェクト（別 DB）の verify との並走は可】** 旧文: **他プロジェクトの verify と f0 を同一 PC で並走させない**（2026-09-10 13:00 台・makanai-shift の run-all-verifies と並走した f0 run1 889s／run2 1049s＝前回 pin 412s／454s の約 2 倍。DB は別（裁定200 の 3 値は 0）でも CPU・回線を食い合い statement timeout 型フレークの温床になる。裁定200 チェックに「ローカルの verify 系 node プロセス 0＝他リポジトリ含む」を含めて読む。相談役ブロック 2026-09-10 で恒久注意へ昇格・番号は本表の連番）。
11. **f0 は同一 DB で1本ずつ**(裁定200)。起動前に pg_stat_activity・直近60秒 audit_logs 書込・ローカル verify プロセスを実測し、60秒後に再実測してから起動。走数上限 6 は **DB 単位**(セッション単位ではない)。単走の緑は翌日に持ち越さない(2連=同日連続)
12. **起動ブロックは1チャットにのみ貼る**(教訓63)。CC を切り替える時は旧を終了させてから新を起こす
13. **走数/日付条件は手順行の先頭に書く**(教訓64)。CC はブロック全体を読み切ってから起動する
14. KPI 数値に danger-ink を使わない(裁定120 の範囲=エラー文のみ)。「操作履歴を見る」等の導線色は accent
15. 走行中の f0 は途中停止しない(各段 finally 掃除が走らず翌朝の赤要因)
16. 9/9 6走目は 914s(2連緑時 761/723s より遅い)。同日 5走目以降の遅延は PostgREST 疲弊の兆候として扱い、timeout 赤は回帰扱いしない
（11〜16＝相談役引き継ぎ v28 §5 の逐語・2026-09-10 収載。10 は v29 で追加された項目のため番号順が前後する）
17. **【裁定243（2026-09-11）で廃止＝並走下の緑は有効・赤がタイムアウト由来なら走数消費のみで再走可（段名で判定）】** 旧文: **f0 中に他プロジェクトの verify が起動した場合、その run は走数消費のみで緑判定に数えない。他プロジェクトの verify は止めず終了を待つ**（2026-09-11 run1＝41 段 ALL PASS だったが 32 段目以降で makanai-shift の run-all-verifies が並走＝恒久注意10 抵触→ 1/6 消費のみ。CC が同日 10:26／10:28 に BANZEN の verify を 2 回停止したのは誤り＝別プロジェクトが稼働中であり止めない。以後は ps で終了を待ってから 3 値を再測し、次の走数で再走する）
（18〜20＝相談役引き継ぎ v44 §3「恒久注意（追加）」の逐語・2026-10-09 便 V44 で収載。18 は便 P166・19 は便 G2 の「恒久注意（追加）」行で先行記載済み＝本欄に番号を振って集約）
18. **本番 route（cron／手動の demo reset）はデプロイ済み payload を読む**（push 前の reset は空＝旧 payload を読む。payload を変えたら push→Vercel success の後に reset する・便 X-13a で flag 0 行の実例）。
19. **Agoora 向け md（手貼り案内・目視案内）は冒頭に結論 3 行**（何を・どこに・何を返すか。例文に角括弧を残さず値は形で確認＝教訓104）。
20. **staff_shift_patterns・staff_shifts の created_by／confirmed_by は memberships(id)**（users(id) ではない・便 X-13c の突合で検知→修正）。
（21〜23＝便 V44 続き V-2 の読取注意・2026-10-09 便 VP で収載）
21. **cron.job_run_details は jobname を持たない＝cron.job と jobid で join して読む**（status／return_message／start_time は run_details・名前は job）。
22. **memberships に org_id は無い＝org への結びは stores 経由**（memberships(user_id, store_id)→stores.org_id。users.photo_updated_at の org 別計数も同じ）。
23. **net._http_response.created は要求時刻（分 +0.3 秒）で応答時刻ではない＝所要秒には使わない**（demo reset の所要は start_time→orgs.demo_reset_at（wipe+load）／payroll_runs.finalized_at（finalize まで）で測る。手動 reset は route の wall ms＝hooks 込み）。
（24〜26＝相談役引き継ぎ v45 §3「恒久注意（追加）」の逐語・2026-10-13 便 V45 で収載）
24. **手貼りは f0 走行中でも可だが md5／関数数の pin が赤になる＝張替えで再走**（0168 で実証＝P167 の f0 run1 走行中に適用）。
25. **コミット直後に台帳パッチの書込と CRLF 化を確認**（P168 コミット 2 の補正＝コミット 3 の実例）。
26. **datalist 不使用**（教訓109＝候補付き入力は select で出す・▾ を描くなら必ず動作を結ぶ）。
（27＝便 P169 P-5・28＝便 SX-1・2026-10-13 収載・相談役の逐語）
27. **net._http_response は pg_net.ttl 6 時間で消える＝HTTP 応答を読むなら当日 12:35 JST（retry 06:35＋6 h）まで。それ以前の日の正常性は cron.job_run_details の succeeded と当日分の 200 からの推定**（便 V45 V-2 で実証）。
28. **手貼り後は手順書の検証クエリの返り値を CC に貼る。SQL Editor の Success 表示は適用の証明にならない**（0169 で実証＝10/13 の 1 回目は「Success 確認済み」でも本番に未適用・P-0 の 5 点照合で検知）。次＝恒久注意 29。
（29＝便 LP-R・2026-10-13 収載・相談役の逐語）
29. **f0 の run2 は run1 の直後に起動しない＝180 秒の冷却を置く**（2026-10-13 に run1 直後の run2 が payroll で接続プールのタイムアウト／statement timeout＝2 回・冷却 180 秒で解消＝便 W5-2b）。次＝恒久注意 30。

既存裁定との突合5点＝対応表 v1 §12（優先順位数値露出 vs 裁定115-②／締め解除→再締め vs reclose・裁定12①／顧客按分禁止と
check_cast_backs／機能フラグ共通定義 vs 裁定101 自動導出／履歴・適用期間 vs 現行の上書き更新）→ **裁定125 で決着**。

---

## 裁定125（2026-09-04）ローンチ範囲＝A層＋B層＋C層3件・写像対応表 v1 の突合5点（X1〜X5）の決着

入力＝写像対応表 v1（`docs/dp/dp_v1_写像対応表_v1.md`・11面 546行＝既存258／準備中91／新要件197／要 mig 約134）と裁定126（設計思想の正本）。
**ローンチ範囲**を層で切る（表示層の追随は安く、器のない新要件は設計書→mig→f0 の順でしか積めない＝恒久注意1「段階的反映」）。

- **A層＝既存**（対応表「既存」258行＋給与 W 系の既存23行）: モック構造への表示追随のみ（RPC・DB 不変）。各面の「既存」行が対象＝
  報酬プラン v3.1（C 系 33行）／マスタ一覧・店舗設定 基本情報（S 系 18行）を先頭に、順次。
- **B層＝器あり・UI なし**（対応表 §6-16／§6-10 ほか）: cast_plan 適用履歴の表示（K34・期間化済み・読み取りのみ）／`ext_shimei_enabled`・
  `dohan_auto_hon` の設定 UI（列あり・書込 RPC の有無で可否）／`shift_remove` の UI 露出（H30）／wish 一括承認（H19・ループ発行）／
  会計後タイムライン（R57・audit_logs は owner 限定 RLS）。**既存 RPC の引数を増やす必要が出た項目は mig 領域＝B層から外す**。
- **C層＝ローンチに含める新要件 3件**（設計書必須）: ①**機能フラグの器**（X4＝`stores.settings_json.features` or `store_features` を
  共通定義とし、ページごとの判定を禁止＝恒久注意5・報酬側は自動導出を既定としフラグは明示 OFF のみ上書き＝裁定101 と両立）
  ②**黒服シフト＋勤務パターン＋希望方式／確定単位／締切**（H3・H15・H16・H25＝cast／staff 二軸の最初の実装点）
  ③**解除型の統一**（D-1 給与確定取消＋日報の締め解除＋現金差異承認を同族の unlock RPC＝理由＋承認者＋audit で揃える・X2）
  ＋**伝票統合**（レジ v12.1 の伝票軸）。**横断設計書（裁定126 §14＝適用期間の非遡及／権限4層×6操作／監査対象10種／feature flag）を
  C層3件の前に置く**（＝仕様固定が先・追加モックは作らない）。
- **第2期**（ローンチ後）: 在籍5状態（K25）／入店時給保証＋4段時給（K33・K32＝S-1 系）／販売実績の器（#57 drink_claims 転用）／
  売掛の手動登録（D 系）／月次確定 CSV（裁定12①⑥の見直し＝X2 の月次側）。
- **ゲート待ち**（専門家・外部）: 通知基盤＋LINE（T3・N 系）／顧客紐付けの PII（顧客 v2 系）／税務出力（裁定23・W39）／写真拡張（K37 系）。
- **追補（2026-09-18・0148 完了）**: 裁定270 で追補した mig 2 本のうち 0148（繰越の消費 258-8・R11 紹介料・R19 cast セルフ norm・food／other・receivable_policy setter＝裁定272）は `8af0be5` で dev 適用・名簿・suite・三面鏡まで完了。ローンチ範囲の残り＝M 群（全て client）と R15（設計裁定待ち）。

**突合5点の決着**:
- **X1**: 裁定115-②（priority 数値非露出）を**維持**。「上から優先」は相対表示（N 番目／○○の上）で可視化し、数値入力は復活させない。
- **X2**: 日報の締め解除・現金差異承認は **D-1（payroll_reopen）と同レーン**＝同族の unlock 型（理由＋承認者＋audit）へ揃える（C層③）。
  `daily_report_reclose` の上書き型は当面据え置き（過去日報の自動再計算はしない＝恒久注意3）。
- **X3**: 「顧客への売上按分は行わない」を**明文化**。キャスト按分（check_cast_backs＝販売実績・名簿 ratio_weight）と顧客帰属
  （checks.customer_id＝伝票単位・非按分）は**主語が違う**＝混同しない（恒久注意7）。同行者（R52）を足す場合も顧客へは非按分。
- **X4**: 機能フラグは**共通定義**（C層①）＋**二層**＝「自動導出（裁定101）＝既定」と「明示 OFF＝上書き」。ページ個別の判定は禁止。
- **X5**: 履歴の持ち方を**二分**＝「audit_logs で足りるもの（操作の記録＝shift_set 更新・notice_update 等）」と「**適用期間列が要るもの**
  （金額・条件が期間で効くもの＝cast_plan 期間化 0114・pricing 凍結 0128〜0130 の流儀・ランク適用開始日 K29・在籍状態 K25）」。
  後者は第2期／C層の設計書で列を持たせ、前者は上書き型のまま audit で追える状態を維持。

**起票#42**: 段B（`6ccb990`・2026-09-04）で**クローズ済み**（3択セレクタで「商品売上×率」を消化・準備中12項目は PREP_ITEMS のまま）。

### 夜間 N レーン実施記録（2026-09-04・push なし・翌朝の push 可否は相談役裁定）

- **N1 docs**: 本裁定125 収載・X1〜X5 決着・#42 クローズ確認＝完了。
- **N2 UI・A層（報酬プラン v3.1・C 系「既存」33行）**: 節ヘッダ（16px 見出し＋説明＋保存ボタン右＋保存状態ピル Green/Red）・入力単位の
  常時表示（`¥ … 円`／`… %`／`¥ … 円/本`）・指名実績バック3ブロック（方式トグル「固定額 円/本｜割合 %」＝方式連動の単位切替・同伴は
  固定額のみ＝C18 準備中）・スライド2表（段／判定基準／時給の固定列・`¥ … 以上`／`… pt以上`）・タブ折返し罫線＋青下線（規約 §8）・
  右レール保存状態 6行・「＋ 報酬プランを追加」＝完了。**保存経路（set_comp_plan 節保存／set_comp_component／set_cast_plan）は不変**。
  新要件11行・準備中6行は不触（最低月額保証は現行どおり・C19/C14 の文言追加も見送り＝A層外）。
- **N3 UI・A層（マスタ一覧 v3・S 系「既存」）**: hero 説明・群名「店舗・運用」・カード文言/アイコン・KPI「発注推奨の商品」を v3 逐語へ＝完了
  （裁定120 の Danger 帯・要補充カードは不変・「利用機能」カードは作らない）。**店舗設定「基本情報」タブ＝停止**（理由: 店舗名／表示名／
  略称は列あり・**書込 RPC なし**＝S9/S11/S12「要 mig」＝停止条件「保存 RPC が無い項目を出す必要」に該当。読み取り専用で出す価値も薄い）。
- **N4 UI・B層**: (a) cast_plan 適用履歴（K34）＝割当表の「履歴 ▸」で期間つき一覧を展開（読み取りのみ）＝完了。(c) `shift_remove` の UI 露出
  （H30）＝承認待ち（計画中／確認待ち）と確定シフト「表で見る」の行に「削除」＝完了。(d) wish 一括承認（H19）＝承認待ちヘッダに
  「N件の希望をまとめて承認」（定休日除外・1件ずつ shift_wish_decide ループ・新 RPC なし）＝完了。
  **(b) `ext_shimei_enabled`／`dohan_auto_hon` の設定 UI＝停止**（理由: 両列を書く `set_store_*` RPC が存在しない＝RPC 引数追加＝mig 領域＝
  対応表 §6 要点10「単独起票候補」のまま）。**(e) 会計後タイムライン（R57）＝停止**（理由: audit_logs は owner 限定 RLS でレジ担当（staff／
  manager）に出せず、レジ伝票詳細への履歴 UI 追加は複雑と判断＝着手せず）。
- **N5 docs/tmp 棚卸し**: 明示された処分可のみ削除（f0 ログ全件・113_D調査_draft・118prep_live・113prep_live・dp_v1_写像_draft・m113_live.mts）。
  「レーンD 分類表」は docs に実在せず（引き継ぎ v25 に言及のみ）＝分類表に無いものは全て残置＝停止リストへ（0088_billing_gate_r3.sql／
  0088_samples／0089_time_line_split.sql／ddl_*.txt／design_tokens_draft.md／e1_shots／live_*.sql 22本／next_boot.md／nox_billing_donor.md／
  q115_3.mjs／r2b_saitei110_wip.patch／r2b_stage0_report.md／regi_kaizen_preflight.md／rpc_inventory.txt／sd0_*.md／u2_progress.md）。
  手貼りリスト 0131〜0134 行＝2列表の書式・並び（連番）を確認済み。
- **停止リスト4件の処置（相談役裁定 2026-09-07）**: ①N3 店舗設定「基本情報」タブ（店舗名／表示名／略称の書込 RPC なし）＝**店舗設定 setter mig へ統合**（S9/S11/S12 の `set_store_profile` 系＝C層①の機能フラグ器と同じ設計書で起草）。②N4(b) `ext_shimei_enabled`／`dohan_auto_hon` の設定 UI＝**同じ店舗設定 setter mig へ統合**（対応表 §6 要点10 の単独起票は本 mig に吸収）。③N4(e) 会計後タイムライン（R57）＝**レジ v12.1 レーン送り**（伝票詳細の履歴 UI は v12.1 の写像 R 系と一体で設計・audit_logs の閲覧スコープはそこで裁定）。④N5 docs/tmp 残置39件＝**「レーンD 分類表」を docs 化した後に棚卸し**（分類表なしの削除は行わない）。


### 実施記録（2026-09-07 追記）

- **帯訂正 6e0c73e7**（CLUB NOX「VIP20:00〜20:59」延長）: Agoora 実機で **5000円/30分** へ訂正済み（live 実測 amount=5000／duration_min=30）＝#56(b) 消し込み。
- **料金 v8.1 A層 C1〜C3 完了**（対応表の既存行のみ・新要件不触・既存機能不消・mig なし・push なし）:
  `ea3b621`（C1 カード手数料再編＝裁定131）／`916ac02`（C2 VIP料金方式カード＝裁定129）／`54bf807`（C3 プレビュー拡張＝裁定127/128）。
  verify:f0＝36本3546 **連続2走緑**（run4/run5・run1 は r2b timeout・run3 は pb 派生症状＝#58 追記）・golden 6値不変（5931/125802/55233/64/64/53）。
- **P13（指名キャスト）は P14（キャストランク）に統合**（裁定128）＝対応表 §2 の 143〜151／165／166／170／183〜185 を「実装済(A層)」へ更新。
- **料金 v8.1 目視**: 会計設定・料金マスタ＝スクショ確認済 ／ 適用料金を確認（C3）＝**未目視のまま push**（2026-09-07 Agoora 判断・push `d28951c`＝origin 0 0）。
- **シフト v4.1 A層 S1/S2 完了**（既存19行のみ・mig なし）: `fa4d613`（S1 文言・表現＝裁定133/135/137）／`085e8d3`（S2 導線＝裁定136/138）。H8/H14/H34/H40/H43 は変更なし（裁定134 ほか）。対応表 §5 の19行を「実装済(A層)」へ更新。
- **キャスト管理 v3.1 A層 C1/C2 完了**（既存22行のみ・mig なし・bucket policy なし）: `0b896ce`（C1 文言＝裁定141〜144・K36）／`62d476e`（C2 裁定120 適用＝裁定146）。K9/K40/K41/K44/K45 は変更なし（裁定140/145）。f0 2 連緑＝37 本 3,550（所要 386s／629s・sweep 削除前 797/797）・golden 6 値不変。対応表 §6 の22行を「実装済(A層)」へ更新。
- **日報・月報・売掛 v2.1 A層 R1/R2 完了**（既存21行のみ・集計式不触・mig なし）: `98fb7d0`（R1 文言・表記＝裁定147/148/150/152）／`9531d41`（R2 内訳合算＋裁定120 適用＝裁定149/151）。除外＝売掛手動登録 D38・月次確定/CSV D29〜D31・税務出力。付記実測＝逆転値凍結の伝票 1 件（open・延長行 0／母数 12）＝#61 起票・裁定153。f0 2 連緑＝37 本 3,550（所要 529s／546s・sweep 削除前 797/797）・golden 6 値不変。対応表 §8 の21行を「実装済(A層)」へ更新。
- **ホーム v2.1 A層 H1/H2 完了**（描画済み行＋既存 state からの表示追加のみ・新規クエリなし・KPI 式不変・mig なし）: `8e2eeff`（H1 見出し・文言＝裁定155/156/158）／`84c3e82`（H2 表示追加＝裁定154/157/159）。M13/M17/M18/M20/M24 は「新要件（ホーム合成・M11 レーン）」へ訂正（教訓60）。f0 2 連緑＝37 本 3,550（所要 350s／615s・sweep 削除前 797/797）・golden 6 値不変。対応表 §9 の19行を更新。
- **分析 v2.1 A層 N1 完了**（既存行のみ・集計式/RPC 不触・A44 PII 不触・mig なし）: `ad44954`（lead＝裁定160／注記3行＋速報導線＝裁定161／エラー文5箇所 --danger-ink＝裁定167）。据え置き＝A2/A18/A27/A31/A32（裁定162〜166）。★初版コミットで analytics-board.tsx の改行が CRLF 化し全行差分（1225/1216）になったため LF へ戻して amend（差分 21 行・未 push のローカルのみ）。f0 2 連緑＝37 本 3,550（所要 423s／615s・sweep 削除前 797/797）・golden 6 値不変。対応表 §10 の22行を更新。
- **夜間 O レーン（2026-09-07 夜・無人）**: O1 `.gitattributes` は renormalize で対象外の `.html` 1 本（index CRLF／worktree LF の既存不一致）が差分となり停止リスト（案は scratchpad 退避・教訓61/62 は `ae00521`）。O2 お知らせ `2fb16d3`（N32 テンプレート5種＝裁定168〜171・無人確定）。O3 給与 `ac73128`（W1 勤怠／W22 チップ／W23 日数列＝裁定172〜178・無人確定）。**f0**: O2 run1 緑 37本3,550（416s）→ run2 赤（pricing 段 `check_add_line` の error 未捕捉→null.id・単独再走緑）→ run3 赤（pricing 段43(18)d statement timeout・936s）／O3 run1 赤（anon-guard 段 null.id・1,183s）／run2 は sweep が pooler 接続取得不能（ECHECKOUTTIMEOUT 15s）。**PostgREST 経路の遅延を実測**＝direct pg 9ms に対し signin 13.8s・rpc 22.6→1.6s＝API 層／pooler 側の劣化（DB 直結は正常・長時間クエリなし・接続 22/60）。**O2/O3 の 2 連緑は未達**＝翌朝に f0 再走で取り直し（無人では再走ループしない）。#58 は観察継続。O5 朝報告＝`docs/handoff/NOX_夜間O_20260907.md`。
- **翌朝の取り直し（2026-09-09）**: PostgREST 経路は回復（signin 1.21s／rpc 0.70s／DB 直結 0.01s・active クエリ 0）。f0 **2 連緑＝37 本 3,550**（388s／655s・sweep 削除前 28／797）・golden 6 値不変＝O2 `2fb16d3`／O3 `ac73128` の gate 充足。O1 は `.gitattributes` 単独で `4f7ca54`（renormalize 差分ゼロ・教訓61 の記述を訂正）。#58＝夜間の劣化は一過性（日中 30 走超の負荷後）として観察継続。
- **レジ v12.1 A層 G1/G2 完了＝A層 11 面完了**（2026-09-09・非 money 群のみ・mig なし）: `d2eb1f2`（G1 滞在表記＝裁定183）／`c33055f`（G2 エラー文 12 行→--danger-ink・操作要素 4 行→--danger／--danger-bd・数値強調 15 行不触＝裁定184〜186・diff はトークン置換のみを機械確認）。据え置き＝R53／R8（裁定187）・R57 停止継続（裁定189）。#61 は void 確認でクローズ（裁定188）。f0 2 連緑＝37 本 3,550（400s／562s・sweep 削除前 797/797）・golden 6 値不変。対応表 §4 の 28 行＋R57 を更新。**A層＝料金／シフト／キャスト／日報／ホーム／分析／お知らせ／給与／レジ＋報酬プラン（N2）／マスタ一覧（N3）の 11 面完了**＝次は B層（器あり UI なし・調査済み）と C層①（feature_flags・横断設計書）。
- **B層 B1 ホーム＋キャスト 完了**（2026-09-09・読取のみ・mig なし・policy 変更なし）: `e617eaa`（B1-a M6 店舗閲覧切替＝裁定192・F4 とは二層）／`777fe75`（B1-b K16 バッジ＋K7 メール未登録 KPI＝裁定193・RLS 実測で owner/manager とも配下 cast の users.email 可読 2/2）。裁定190〜197 収載（190 audit 履歴は owner 限定のまま／191 H23 非表示維持／194 A38 近似＋注記／195 A45 は A15 と同時／196 D49 位置のみ／197 区分訂正 H19・H30・K34・D34→実装済(B層)）。#64 は B3 で解消予定。f0 2 連緑＝37 本 3,550（420s／720s・sweep 削除前 797/797）・golden 6 値不変＝本日 6 走で上限。C層① 設計書 draft は `e1242ad` で収蔵＋突合済み。
- **C層① mig0135 完了**（2026-09-09・Agoora 手貼り 9/9・CC 再実行 9/9）: `65c1ef0`（mig 収蔵＋手貼りリスト＋課金ゲート対象 A8/B(f)＋billing pin）／`fc2b2bf`（verify:nox-flags 20 assertions＋f0 連結）／docs。設計書 v1 `58306ec`・draft 突合 `e1242ad`・実装差分 2 点＝裁定198／199（承認 2026-09-09）・#62 クローズ。単独緑＝flags 20／billing 53／grants 298。**f0 の新基準見込み＝38 本 3,570**（本日は上限のため未連結走行＝明日の 2 連緑で pin）。UI（/master/system#features）は別コミット（C層① UI レーン）。
- **C層① UI 完了**（2026-09-09・mig なし・読取＝feature_flags RLS select／切替＝flag_set）: `4f4d905`（`feature-flags-panel.tsx` 新設 142 行＋`system/page.tsx` に「◈ 機能の公開」タブを owner のみ push＋`master-board.tsx` 店舗・運用群へ導線 1 枚「機能の公開」→`/master/system#features`）。表示 key＝staff_shift「黒服シフト」／reopen_flow「締め解除フロー」の 2 つ（qr_order／notify は非表示）・列＝[会社の既定 OFF/ON][店舗ごと 既定に従う/ON/OFF]・理由は任意・エラー文は --danger-ink・削除 RPC なし＝「店舗の上書きは ON/OFF のみ」注記。gate＝tsc 緑／lint 緑／ui-tokens baseline 56 不変／eol LF（3 ファイル i/lf w/lf）。f0 は本日上限のため未走行（明日の 2 連緑＝38 本 3,570 見込みで pin）・目視は明日の f0 後。裁定198／199 は承認 2026-09-09 へ。対応表 §1 S4 を実装済(C層①) へ。
- **f0 新基準 pin**（2026-09-09・翌朝取り直し）: プローブ回復（DB 直結 0.06s／signin 0.92s／rpc 0.80s）→ f0 **2 連緑＝38 本 3,570**（761s／723s・38 段 ALL PASS を機械集計・golden 6 値不変＝wage 5931／withholding 125802／labor-forecast 55233／receipt 64／rate-back 64／billing 53）。run1 は別チャットの handoff v27 収蔵（`c07a422`）と同時刻帯＝裁定201 の例外扱い。裁定200（1 本ずつ・起動前 60 秒チェック）・教訓63（複数チャット f0 衝突）・#65（sweep 起動ガード）を起票（200／201 は承認 2026-09-09）。目視（/master/system#features・/casts）は Agoora の owner ログイン後 → OK で push（ahead 8）。
- **B層 B2 日報・売掛 完了**（2026-09-09・読取のみ・mig なし・policy 変更なし）: `02f0033`（B2-a 日報タブ D6／D8／D12／D14／D15／D49＝裁定202〜205・196）／`d5e7142`（B2-b 売掛タブ D37／D40／D42／D47＝裁定204・207）。裁定202〜208 収載 `aaee4d1`（206 D45 据え置き＝対応表「準備中(money 境界)」・208 D22／D43 据え置き）。新規読取 8 本＋既存 select の列追加 1＝着手前調査（`docs/tmp/b2_survey_20260909.md`）と同数・集計式／RPC／PII／凍結は不触・cast 可視範囲不変（日報の追加 KPI は manager 以上のみ描画）。gate＝tsc／lint／ui-tokens baseline 56 不変・PostgREST 疎通＝新規 8 本すべて 200（users 埋込含む）。目視＝manager ログインで日報 D6（行なし店＝非表示）／D8／D14（1 件 ¥1,600＝DB 実測一致）／D15（0／0）／D49 と売掛タブ D37（1 件 ¥1,600）／D40 セグメント／D47 節を確認・D12 は manager 非表示を確認（owner 側の件数表示と D42／D47 の実データ表示は fixture に ar_collections 0 行のため未目視）。**f0 は本日 5／6 走のため打たず＝面完了の 2 連緑は翌日**（基準 38 本 3,570 のまま）。対応表 §8＝13 行を実装済(B層)／据え置きへ・対象外 12 行へ理由を追記。
- **#66 クローズ（2026-09-09・修正 `6702fff`・Agoora 目視済・push）**: 各画面の console「resource 400」の正体＝月末を `${ym}-31` 固定で `lte` する既存クエリが 30 日月／2 月に Postgres 22008（`date/time field value out of range: "2026-09-31"`）で落ちる。捕捉 URL（fetch フックで各 1 回・manager ログイン）: **/report**＝`rest/v1/ar_collections?select=amount&store_id=eq.0f748408…&biz_date=gte.2026-09-01&biz_date=lte.2026-09-31`（`report-board.tsx:233`・E8-2 #12 今月回収 KPI＝該当月は ¥0 表示に落ちる）／**/casts**＝`rest/v1/attendance?select=cast_id,status&date=gte.2026-09-01&date=lte.2026-09-31`（`casts-board.tsx:137`・今月出勤者 KPI＝該当月は 0 名に落ちる）／**/receivables** はルート無し＝売掛タブの 400 は /report と同一 URL。壊れた img は 0。B2 の新規 8 本は無関係（すべて 200）。月末は翌月 1 日 `lt` へ寄せるのが筋（B2-b の D37/D47 は同方式で実装済み）＝修正は別裁定。 **→ 修正済（2026-09-09・`6702fff`・report-board の monthAfter ヘルパー＋casts-board 内 inline・月の決め方と集計式は不触・tsc／lint／ui-tokens 緑）。検証待ち＝9/10 の f0 2 連緑＋push 後の /report・/casts 実機目視（400 消失・今月 KPI 非ゼロ）でクローズ。**
- **観察（低・2026-09-09・不触）**: 日報タブ「営業サマリー」の平均滞在は値なしのとき `—` に単位 `<small>分</small>` が付いて「—分」＝「一分」と読める（`report-board.tsx` 営業サマリー節・E8-2 #2／B4-3 の A層既存・上の 8 指標 inset は `—` のみで単位なし）。B2 では触らない＝文言／単位の扱いは A層の一括見直し時に。あわせて D12「取消・返金」件数の色を他 KPI と同じ通常色へ戻した（裁定120＝danger-ink はエラー文のみ・「操作履歴を見る」のリンク色は据え置き）。
- **B層 B3 レジ非 money 完了**（2026-09-09・読取のみ・mig なし・RPC 変更なし・policy 変更なし）: `acc5be5`（B3-1 #64＝R43 候補一覧／帰属モーダル／指名カードに出勤中・接客中・打刻＋ランク名＝裁定209〜211）／`e119e6c`（B3-2 R34 チップ＝裁定212）／`87abae2`（B3-3 R29 在庫常時表示＝裁定213）／`2c7f357`（B3-4 R28 最近使った＝裁定217）。裁定209〜217 収載 `604046c`（214 R36 対象外・215 R4／216 R14 据え置き）。新規読取＝面1 で 2（attendance／cast_ranks）＋既存 casts select へ rank_id 列追加 1・面2〜4 は 0＝合計 2（上限 4）。接客中は loadOpenMap の openNoms を再利用・cutoff は既存 stores 読取の settings_json から。cast 可視範囲不変（cast は /register 非到達・kiosk の CastPicker は任意 props で無改修）。**3 ロールの描画差**（RLS 実測＝DEMO org を role 切替で直結 select・cast_ranks: owner 2／manager 2／staff 0／cast 0・attendance／check_nominations は staff 可読）: owner／manager＝ランク名あり・staff＝ランク名の要素そのものが出ない（空 Map）・出勤中／接客中／打刻の状態語は 3 ロール同じ。verify org（NOX-VERIFY-A1）は cast_ranks 0 行・open 伝票 0・attendance 当日 0 のため候補一覧の実データ目視は不可＝**Agoora の実機目視（DEMO org・open 伝票あり）で #64 クローズ→目視済（2026-09-09・Agoora owner 実機・/register 候補一覧／帰属モーダル／指名カード・#64 クローズ）**。gate＝tsc／lint／ui-tokens baseline 56 不変（4 面とも）。Browser の manager セッションは 17:01 JST に期限切れ＝CC 目視は /register 到達前でブロック。f0 は本日 6/6 のため打たず＝9/10 朝の手順（§8 → 2 連緑 → push）へ。
- **B層 B4 シフト 完了**（2026-09-09・読取のみ・mig なし・RPC 変更なし・policy 変更なし）: `15b52ef`（B4-a 今日＝H31 4 カウンタ＋H32 打刻表示＝裁定220〜222）／`180fe0d`（B4-b 承認待ち＝H18 KPI 4 枚＋H20 人ごと切替＋H41 候補検索＝裁定218・219・225）／`436840b`（B4-c 確定シフト＝H37 印刷＋H39 変更履歴（owner のみ）＋H27 確認済み／未確認＝裁定223・224・226）。裁定218〜227 収載 `7c27f31`（227 H4 据え置き）。新規読取＝2（punches／audit_logs owner のみ・actor 名は既存 users 1 クエリへ相乗り）＝上限 5 内。人件費カード・凍結・集計式は不触。**3 ロールの描画差**: owner＝変更履歴あり／manager＝変更履歴なし（要素非描画・RLS も 0 行）／staff＝閲覧（4 カウンタ・打刻・KPI・確認状況は読める＝punches／attendance／shifts の RLS は自店 staff 可読）・操作列は従来どおり isManagerUp／cast＝/shift 非到達。ui-tokens は H27 ピルの枠色を `var(--gold-bd)` に置いて baseline 56 不変（同ファイル既存の rgba 1 箇所を同トークンへ寄せた＝見た目同値）。CC 目視＝Browser の manager セッション期限切れ（17:01）のため未実施→**目視済（2026-09-09・Agoora owner 実機・/shift 今日／承認待ち／確定シフトの 3 タブ）**。f0 は本日 6/6 のため打たず＝9/10 朝の手順へ。対応表 §5＝実装済 9 行（H18／H20／H27／H31／H32／H37／H39／H41＋H30 変更なし）・据え置き H4・対象外 12 行＋H10／H23 へ理由。
- **C層② 黒服シフト 完了**（2026-09-09・mig0136 `5ee9a2f`＋0137 `c9fe0a3`・suite 53 assertions `9bad581`・UI＝面 a `d2bf48e`／面 b `ae7ee97`／面 c `946e643`／H3 切替 `c742261`）。設計書 v1 §4 どおり flag_enabled('staff_shift') off では節・切替とも不在（横断 §4）。読取＝面 a 4（flag_enabled／stores.settings_json／patterns／deadlines）・面 b 5（patterns／deadlines／wishes／staff_shifts／auth_membership_id）・面 c ＋2（memberships／users＝名前）・切替 1（flag_enabled）。書込は 0136／0137 の 7 RPC のみ・mig 0・RPC 追加 0。cast の shifts／shift_wishes・money・凍結は不触。**3 ロール描画差**: owner／manager＝切替あり→黒服＝面 c（配置・上書き・一括確定）・店舗設定に面 a／staff＝切替あり→黒服＝面 b（自分の ◯× と備考のみ・締切後ロック・面 a は /master 非到達）／cast＝/shift・/master 非到達。**設計書 v1 §4 との差分**: ①面 a の置き場＝「店舗設定」ページが無いため /master/business-hours（営業時間・定休日）の下に節として置いた ②面 b の ◯× は「なし→◯→×→◯」の巡回（wish の削除 RPC は設計外＝「なし」へは戻せない） ③締切の表示＝client で deadlines 表から RPC と同式で算出（staff_shift_deadline_at は内部専用） ④面 c の「枠×充足 n/m」＝n は行数（確認待ち＋確定）・m は ◯希望者数（必要人数の器が無いため） ⑤面 c に「希望なしの直接配置」を追加（v1 §2 の propose 仕様どおり・§4 には明記なし） ⑥営業日一括確定＝行ごと順次・1 件 raise で残りを止め件数報告（C②-3）。CC 目視＝dev の verify org は flag off・Browser セッション期限切れのため未実施→**目視済（2026-09-10・Agoora owner・DEMO org・flag ON/OFF の 4 面＝実機 OK）＝C層② 完了**。f0 は本日 6/6＝9/10 朝（39 本）。
- **f0 新基準 pin（2026-09-10）**: 裁定200 チェック 3 回（3 値 0）→ f0 **2 連緑＝39 本 3,642**（412s／454s・39 段 ALL PASS・golden 6 値不変）＝裁定228 追認・push。
- **f0 新基準 pin（2026-09-11）**: 裁定200 チェック（10:07:53／10:08:55＝3 値 0）→ run1 10:09〜10:24（923s）・run2 10:30〜10:46（993s）＝いずれも **41 段 ALL PASS・3,765・golden 6 値不変・結果同一**。run1 は 32 段目以降・run2 は 10:34 以降で makanai-shift の verify が並走（恒久注意10／17 抵触）したが、**裁定241（例外）により本日限り 2 連緑と認める**＝41 本 3,765 を pin。内訳＝旧 3,721＋reopen 65→73（+8）＋payroll 195→212（+17）＋payroll-list 新設 19（+19）＝+44（前 pin 3,721 との差を段別で照合・一致）。走数 2/6 消費。push＝9/10 分 27 コミット＋本 pin。
- **f0 pin 不変の再確認（2026-09-11 午後・裁定242＋#82 の push 根拠）**: 裁定200 チェック 2 回（11:45:11／11:46:12＝3 値 0・他プロジェクト verify プロセス 0）→ run3 11:46〜11:53・458s・run3 後の再実測は自 run の teardown 監査 3 件で 1 分待ち→ 11:55:36 に 3 値 0 → run4 11:55〜12:05・595s＝いずれも **41 段 ALL PASS・3,765・golden 不変（5931／125802／55233）・段別 assertion 数も同一**。watcher（30 秒間隔）で他プロジェクトの verify は両 run とも 0＝恒久注意 17 の無効条件に該当せず、通常の 2 連緑。pin 41 本 3,765 は不変。
- **f0 新基準 pin（2026-09-14・45 本 3,824）**: 9/12 朝の起動ブロック（v31 §8）を 9/14 に実施（9/12・9/13 は未起動＝走数消費なし）。裁定200 の 3 値＝NOX DB 基準（10:42:35／10:43:48／10:53:43＝0・他プロジェクト BANZEN の run-all-verifies は並走＝裁定243 で除外）→ run1 10:43〜10:52・488s・run2 10:53〜11:04・630s＝いずれも **45 段 ALL PASS・3,824・golden 不変（5931／125802／55233）・段別 assertion 数も同一**。差分＝verify:nox-labor-cost 13（42 本目・B6-4）＋verify:nox-compare 20（43 本目・B6-11）＋verify:nox-cast-stats 14（44 本目・B6-12）＋verify:nox-shift-gap 12（45 本目・裁定245）＝見込み 3,824 と一致。9/11 の run5 赤（28 段目 verify:nox-cast-photo 署名 URL GET 504＝裁定243 のタイムアウト型）は走数消費のみ。push の根拠。
- **f0 新基準 pin（2026-09-14 午後・46 本 3,853）**: 裁定200 の 3 値＝NOX DB 基準（11:59:16／12:18:36＝0・run1 は BANZEN M2b-4 と並走・2 連目は単独＝裁定243 で除外）→ run1 11:59〜12:07・471s・run2 12:18〜12:27・541s＝いずれも **46 段 ALL PASS・3,853・golden 不変（5931／125802／55233）・段別 assertion 数も同一**。差分＝verify:nox-d45 29（46 本目・mig0143）のみ＝見込み 3,853 と一致。間の run（12:08〜12:11・183s）は 9 段目 verify:nox-payroll の statement timeout（collect.ts loadTransport・BANZEN M2b-4 と並走）＝裁定243 のタイムアウト型で走数消費のみ・2 連目は BANZEN 完走後の単独窓で緑。本日 f0 5/6 消化。push の根拠。
- **f0 新基準 pin（2026-09-14 夕・47 本 3,893）**: 裁定200 の 3 値＝NOX DB 基準（14:28:21／14:41:32／14:42:33＝0・BANZEN M3-1 と並走＝裁定249 で待たず）→ run1 14:28〜14:41・758s・run2 14:42〜14:54・700s＝いずれも **47 段 ALL PASS・3,893・golden 不変（5931／125802／55233）・段別 assertion 数も同一**。差分＝verify:nox-anon-guard 986→987（set_store_profile の anon BLOCKED probe）＋verify:nox-store-profile 39（47 本目・mig0144）＝見込み 3,893 と一致。本日 f0 通算 7 走（裁定248 で上限なし）。push の根拠。
- **mig0144 店舗設定 setter 適用記録（2026-09-14）**: 貼り先 ref **hiqbfagmkrdpmlqhkmsu**（Agoora が SQL Editor で手貼り＝live prosrc は CRLF・CC は 14:07 に Downloads の 0144（sha256 618727298588d8e9c46292a6dc38283b4f1ec2a83bc5e43fd3e7b24c7f9bfd73・12,129 B）と**本文一字一致**を機械照合）。検証＝署名 set_store_profile(p_store_id uuid, p_patch jsonb) 1 本・acl **{postgres,authenticated,service_role}**（anon なし）・既存 set_store_% **11 本**と money-core **3 本**（check_pay／check_close／check_void）の md5 不変・stores の grant（authenticated=SELECT のみ）／policy（stores_select 1 本）／列数 **30** 不変・settings_json キー集合 4 店とも不変・audit_logs 0 行（適用時点）。控え＝docs/tmp/0144_post.txt。静的突合＝権限ガードは set_store_receipt_profile 型と同型・白名単 8 キーは既存 17 キーと衝突なし・libpg-query で SQL 層 parse OK。**課金正本の追随**＝A8 22→23 本・対象 **123→124**・除外 114 不変・全数 **237→238**（履歴 bullet mig0144・E 節に現在値）・verify:nox-billing の pin 4 箇所（124／124／125／124）＝`7deb6c2`・anon-guard probe 1 行。suite verify:nox-store-profile 39 本（`9c78d7d`）・UI `7da5fb6`（裁定250 参照）。
- **f0 pin 不変の再確認（2026-09-14 夕・裁定251 第 1 レーンの push 根拠）**: 裁定200 の 3 値（15:25:56／15:42:15＝0・run1 は単独窓・run2 は BANZEN M3-2a と並走＝裁定249）→ run1 15:26〜15:42・960s・run2 15:42〜15:59・1034s＝いずれも **47 段 ALL PASS・3,893・golden 不変（5931／125802／55233）・段別 assertion 数も同一**。client `5543d9b`（M1 report-board 3 表＋M2 その他シートの Modal 化）は suite に触れず pin 47 本 3,893 は不変。本日 f0 通算 9 走（裁定248 で上限なし）。
- **f0 pin 不変の再確認（2026-09-14 夕・裁定252 の push 根拠）**: 裁定200 の 3 値（16:36:11／16:49:45／17:03:03＝0・run1 は BANZEN M3-2b-1 と並走・run2 は単独）→ run1 16:49〜17:01・715s・run2 17:03〜17:14・665s＝いずれも **47 段 ALL PASS・3,893・golden 不変（5931／125802／55233）・段別 assertion 数も同一**。client `bb9743c`（日報の締める／締め確定の中央化＋プレビュー表 nowrap）は suite に触れず pin 47 本 3,893 は不変。本日 f0 通算 12 走（10 走目 16:36〜16:48・715s は 33 段目 verify:nox-product-back-modes の statement timeout＝裁定243 のタイムアウト型・BANZEN 並走・60 秒後に再走で緑）。
- **f0 pin 不変の再確認（2026-09-14 夜・裁定253 A／B／C＋252 pin docs の push 根拠）**: 裁定200 の 3 値（17:20:08／17:30:41／17:31:53＝0・他プロジェクト verify 0）→ run1 17:20〜17:30・615s・run2 17:31〜17:39・455s＝いずれも **47 段 ALL PASS・3,893・golden 不変（5931／125802／55233）・段別 assertion 数も同一**。client `2cb3e2a`／`e0392c1`／`a9fd505`（UI のみ・suite と lib は不触）を含む木で取り直した 2 連緑＝pin 47 本 3,893 は不変。本日 f0 通算 14 走。
- **f0 新基準 pin（2026-09-14 夜・48 本 3,925）**: 裁定200 の 3 値＝NOX DB 基準（18:17:01／18:18:13／18:29:04＝0）→ run1 18:18〜18:27・567s・run2 18:29〜18:38・547s＝いずれも **48 段 ALL PASS・3,925・golden 不変（5931／125802／55233）・段別 assertion 数も同一**。差分＝verify:nox-anon-guard 987→988（seat_reorder の anon BLOCKED 段39b）＋verify:nox-seat-reorder 31（48 本目・mig0145）＝見込み 3,925 と一致。push の根拠。
- **mig0145 seat_reorder 適用記録（2026-09-14）**: 貼り先 ref **hiqbfagmkrdpmlqhkmsu**（pooler ap-northeast-1・proof orgs=3）・2026-09-14 18:09 適用（CC が相談役ブロックの明示指示で pg 直結・単一トランザクション・例外なし）・検証 6 項目 OK＝(1) 署名 seat_reorder(p_store_id uuid, p_ids uuid[]) 1 本 (2) acl **{postgres,authenticated,service_role}**（anon なし） (3) 既存 reorder 4 本（cast_rank／pricing_rule／product_category／product）＋set_seat の md5 不変 (4) money-core 3 本の md5 不変 (5) seats 列 9・制約 4・grant（authenticated=SELECT のみ）・policy seats_select 不変 (6) **ゲート済み 124→125**・public 関数 238→239。静的突合＝契約の並びと文言は product_category_reorder と同一・org 照合とロール判定は set_seat 18〜23 行と一字一致・updated_at＝now() は cast_rank_reorder 型・audit は named 5 引数（live は 6 引数で p_reason 既定 null）・partial ids は is_active を問わない全件・libpg-query で SQL 層 parse OK。ファイル sha256 d784add2fcea1805cf201a30be385dfbda8a97000285d3bd0b96822df4688a78・7,646 B（Downloads と同一）＝`d1a5e4d`。控え＝docs/tmp/0145_pre.txt／0145_post.txt。**課金正本の追随**＝A6 14→15 本・対象 **124→125**・除外 114 不変・全数 **238→239**（履歴 bullet mig0145・E 節に現在値）・verify:nox-billing の pin 4 箇所（125／125／126／125）・anon-guard 段39b＝`2df543d`。suite verify:nox-seat-reorder 31 本（同）・client `7ae283b`。
- **f0 新基準 pin（2026-09-15・49 本 3,966）**: 裁定200 の 3 値＝NOX DB 基準（BANZEN の verify プロセスは 裁定249 で除外）→ run3 15:21:46〜15:31:36・590s／run4 16:47:02〜16:55:14・492s＝いずれも **49 段 ALL PASS・3,966・golden 不変（5931／125802／55233／64／64／53）・段別 assertion 数も同一・同一 HEAD `c9f6aee`**。内訳＝verify:nox-payroll-adjust 新設 40（mig0146・裁定258・49 段目）＋verify:nox-payroll 212→213（B5 A2＝payroll_finalize／reopen／mark_paid の 3 本に許可列挙し実在 assert +1）＝3,925＋41＝3,966 と見込み一致。同日の先行 2 走は赤＝run1 15:00（payroll B5 A2 が payroll_adjustment_add の p_cast_id を拾う→許可列挙化）・run2 15:07（billing 段47-1 liveOnly=2＝教訓21 の名簿漏れ→B(e) 収載・除外 114→116）。run3 と run4 の間に **NOX DB が 15:33〜16:46 無応答**（pooler timeout→econnrefused→Agoora の再起動で復帰・postmaster 16:46:22・max_connections 60・接続 18／60）＝DB 起因の赤は再走せず即停止（本ブロックの新ルール）。push＝`32d2123..c9f6aee`（7 コミット）。
- **f0 新基準 pin（2026-09-17・49 段 4,027）**: 裁定200 の 3 値＝NOX DB 基準（11:00:15＝直結 0／audit 60 秒 0／ローカル verify プロセス 0・run2 前 11:10:36 も 0）→ run1 11:00:31〜11:10:19・587s／run2 11:10:44〜11:19:17・514s＝いずれも **49 段 ALL PASS・4,027・golden 不変（5931／125802／55233／64／64／53）・段別 assertion 数も同一・同一 HEAD `edf2d15`**。内訳＝3,966＋verify:nox-payroll-adjust 40→101（+61＝純関数 34（(a)）＋route 層 16（(b)）＋凍結形・並び 11（(c)））。他 48 段は 2026-09-15 pin と同一。走行前に 9/15 18:09／18:11 起動の残骸 node -e 2 本（feature_flags.created_at 不在の SQL エラー後に c.end() 未呼びで idle 接続を保持）を停止し直結 0 を確認してから起動。push＝`3c786f7..edf2d15`（3 コミット・11:19）。
- **f0 新基準 pin（2026-09-17・50 段 4,070）**: 裁定200 の 3 値＝NOX DB 基準（12:43:25＝直結 0／audit 60 秒 0／ローカル verify プロセス 0・run2 前も 0）→ run1 618s／run2 626s＝いずれも **50 段 ALL PASS・4,070・golden 不変（5931／125802／55233／64／64／53）・段別 assertion 数も同一・同一 HEAD `f8fdc0e`**。内訳＝4,027＋verify:nox-staff-email 新設 43（裁定267・50 段目）。他 49 段は 2026-09-17 朝の pin と同一。push＝`cb916cc..f8fdc0e`（c0fa85c 裁定267＋f8fdc0e 裁定259）。
- **f0 新基準 pin（2026-09-17・50 段 4,089・0147 適用後）**: 裁定200 の 3 値＝NOX DB 基準（run1 前・run2 前とも 0）→ run1 811s／run2 787s＝いずれも **50 段 ALL PASS・4,089・golden 不変（5931／125802／55233／64／64／53）・段別 assertion 数も同一・同一 HEAD `fbf1f9c`**。内訳＝4,070＋verify:nox-store-profile 39→58（+19・mig0147 の 20 キー化）。他 49 段は同日昼の pin と同一。push＝`5ab47b8..fbf1f9c`（fbf1f9c＝mig 0147＋suite）。
- **f0 新基準 pin（2026-09-17・52 段 4,175・裁定269／271 client）**: 裁定200 の 3 値＝NOX DB 基準（run1 前 15:36:50・run2 前とも 0・BANZEN の verify 3 プロセスと並走＝裁定249 で待たず・所要は伸びる）→ run1 526s／run2 603s＝いずれも **52 段 ALL PASS・4,175・golden 不変（5931／125802／55233／64／64／53）・段別 assertion 数も同一・同一 HEAD `7c0524a`**。内訳＝4,089＋verify:nox-store-systems 新設 30（裁定269・51 段目）＋verify:nox-setup 新設 56（裁定271・52 段目）。他 50 段は同日 14 時台の pin と同一。push＝`580d0b4..7c0524a`（45c8031＝裁定269 出し分け＋報酬制度タブ／7c0524a＝裁定270／271 初期設定ウィザード）。
- **f0 新基準 pin（2026-09-17・53 段 4,200・裁定268 client）**: 裁定200 の 3 値＝NOX DB 基準（run1 前 18:35:28・run2 前 18:45:10＝いずれも 0・他プロジェクトの verify なし）→ run1 467s／run2 531s＝いずれも **53 段 ALL PASS・4,200・golden 不変（5931／125802／55233／64／64／53）・段別 assertion 数も同一・同一 HEAD `2f3377e`**。内訳＝4,175＋verify:nox-late 新設 25（裁定268・53 段目）。他 52 段は同日 16 時台の pin と同一。push＝`e3b73a0..2f3377e`（2f3377e＝裁定268 遅刻分数の表示）。
- **f0 新基準 pin（2026-09-18・58 段 4,337・mig0148／裁定272）**: 裁定200 の 3 値＝NOX DB 基準（run1 前 11:51:52＝backends 20・postmaster 2026-09-15 16:46・orgs 3／run2 前 12:02:44 同値・他プロジェクトの verify なし）→ run1 613s（11:52:19 起動）／run2 851s（12:03:16 起動）＝いずれも **58 段 ALL PASS・4,337・golden 不変（5931／125802／55233／64／64／53）・段別 assertion 数も同一・同一 HEAD `d7a2084`**。段別内訳（run2 実測）＝1 audit-sweep 4／2 pay 102／3 shift-time 44／4 punch-match 75／5 receipt 67／6 anon-guard 992／7 rls 521／8 grants 329／9 payroll 213／10 payroll-csv 25／11 inventory 126／12 product-bulk 39／13 pricing 151／14 pricing-apply 60／15 pricing-categories 12／16 pricing-resolve-category 21／17 vip-unit 32／18 set-people 42／19 ext-menu 35／20 receipt-ledger 23／21 ar-partial 30／22 crm-base 21／23 shift-bands 24／24 shift-autoassign 33／25 shift-deep 80／26 analytics-t4 34／27 categories 49／28 cast-photo 20／29 labor-forecast 26／30 rate-back 64／31 r2b 19／32 autocharge 26／33 product-back-modes 29／34 shift-modal 22／35 shift-confirm 10／36 billing 53／37 billing-app 169／38 flags 20／39 staff-shift 53／40 reopen 73／41 payroll-list 19／42 labor-cost 13／43 compare 20／44 cast-stats 14／45 shift-gap 12／46 d45 29／47 store-profile 58／48 seat-reorder 31／49 payroll-adjust 110／50 staff-email 43／51 store-systems 30／52 setup 61／53 late 25／54 carryover 30／55 referral 25／56 cast-norm-self 16／57 product-types 20／58 receivable-policy 13。★本 pin の前に run（11:43〜11:50・39 段まで緑）が 40 段目 reopen ro(3b-4)／(3b-6) で赤＝check_add_referral の assert_day_open 行で呼出関数 15→16／16→17（張り替え `d7a2084`）。その run は無効・run2 は起動直後（sleep 中）に停止し DB 不触。push＝`580718a..d7a2084`（478303d＝client 前倒し／fe0e19c＝v37 収蔵／8af0be5＝0148 SQL＋名簿・pin＋suite 5 本＋三面鏡／d7a2084＝reopen pin）。
- **f0 pin 不変の再確認（2026-09-18 午後・58 段 4,337・M5／M1-2 client）**: 裁定200 の 3 値＝NOX DB 基準（run1 前 12:27:49＝backends 17・postmaster 2026-09-15 16:46・orgs 3／run2 前 12:41:03＝backends 20・同 postmaster・orgs 3・他プロジェクトの verify なし）→ run1 753s（12:28:12 起動）／run2 843s（12:41:31 起動）＝いずれも **58 段 ALL PASS・4,337・golden 不変・段別 assertion 数も同一（正午の pin と同一内訳）・同一 HEAD `9cff22c`**。段別内訳（run2 実測）＝1 audit-sweep 4／2 pay 102／3 shift-time 44／4 punch-match 75／5 receipt 67／6 anon-guard 992／7 rls 521／8 grants 329／9 payroll 213／10 payroll-csv 25／11 inventory 126／12 product-bulk 39／13 pricing 151／14 pricing-apply 60／15 pricing-categories 12／16 pricing-resolve-category 21／17 vip-unit 32／18 set-people 42／19 ext-menu 35／20 receipt-ledger 23／21 ar-partial 30／22 crm-base 21／23 shift-bands 24／24 shift-autoassign 33／25 shift-deep 80／26 analytics-t4 34／27 categories 49／28 cast-photo 20／29 labor-forecast 26／30 rate-back 64／31 r2b 19／32 autocharge 26／33 product-back-modes 29／34 shift-modal 22／35 shift-confirm 10／36 billing 53／37 billing-app 169／38 flags 20／39 staff-shift 53／40 reopen 73／41 payroll-list 19／42 labor-cost 13／43 compare 20／44 cast-stats 14／45 shift-gap 12／46 d45 29／47 store-profile 58／48 seat-reorder 31／49 payroll-adjust 110／50 staff-email 43／51 store-systems 30／52 setup 61／53 late 25／54 carryover 30／55 referral 25／56 cast-norm-self 16／57 product-types 20／58 receivable-policy 13。push＝`488a169..9cff22c`（6b1f017＝M5／9cff22c＝M1 第 2 レーン 20 表）。
- **f0 新基準 pin（2026-09-18 午後・59 段 4,351・裁定274／275・M15／M18・N）**: 裁定200 の 3 値＝NOX DB 基準（run1 前 13:48:37＝backends 16・postmaster 2026-09-15 16:46・orgs 3／run2 前 14:05:04＝backends 18・同・他プロジェクトの verify なし）→ run1 939s（13:49:06 起動）／run2 1013s（14:05:28 起動）＝いずれも **59 段 ALL PASS・4,351・golden 不変・段別 assertion 数も同一（58 段は前 pin と同一＋59 段目 shift-tabs 14）・同一 HEAD `9e6cf85`**。★run1 の exit を読んでから run2 を起動（正午の停止 1 の再発防止）。push＝`bc56be6..9e6cf85`（91e53f7＝M5 文言＋payment-tax-panel／10f15a1＝裁定273〜275／ee2a3fc＝M15・M18／2c379bf＝M12・M13／9e6cf85＝R15）。
- **所要の観察（2026-09-18・相談役）**: 9/18 日中の f0＝939s／1013s（夜間 9/17 の 467s／531s 比で約 2 倍・段数は 53→59・BANZEN 並走なし・backends 16〜20）＝**Compute 引き上げ（裁定262）は「f0 が 20 分超」を先行実施の目安**とする（公開デモの前提＝裁定273 未決★と同じ Pro／Compute の束）。
- **f0 新基準 pin（2026-09-18 夕・59 段 4,356・便 Y／Z＝R11 レジ入口・nav 追補）**: 裁定200 の 3 値＝NOX DB 基準（run1 前 15:10:59＝backends 17（PostgREST 11）／run2 前 15:22:55＝backends 20（PostgREST 11）・postmaster 2026-09-15 16:46・orgs 3・dev 3200 は Agoora 使用中＝PostgREST 分は Agoora の操作を含む・他プロジェクトの verify なし）→ run1 685s（15:11:17 起動）／run2 641s（15:23:13 起動）＝いずれも **59 段 ALL PASS・4,356・golden 不変・段別 assertion 数も同一（referral 25→30 のみ増・他 58 段は前 pin と同一）・同一 HEAD `5208cf1`**。★run1 の exit を読んでから run2 を起動。push＝`53ab697..5208cf1`（3c6fcaa＝R11 レジ入口／5208cf1＝nav-icons 3＋在庫）。
- **f0 新基準 pin（2026-09-25 昼・0152 手貼り後ブロック・71 段 4,765・push 済み `380ae8e`＝mig ae557c8＋suite 7bb53f7＋client 380ae8e を 1 push）**: 裁定200 の 3 値＝NOX DB 基準（run1 pre1 12:45:57＝backends 12（PostgREST 7）／pre2 12:47:02＝11（7）・run2 pre1 12:56:30＝16（10）／pre2 12:57:31＝16（10）・direct 0・postmaster 2026-09-15 16:46・orgs 3）→ **run1 538s（12:47:02→12:56:00）／run2 613s（12:57:32→13:07:45）＝いずれも 71 段 ALL PASS・4,765・段別同一（docs/tmp/f0_count.py）・golden 不変（5931／125802／55233・rate-back 64・billing 53）**。内訳＝前 pin（71 段 4,740）に対し **anon-guard 1010（+7）／grants 360（+14）／pay 122（−7＝T11 撤去）／referral 41（+11＝全面改稿）**＝+25（段数不変＝新 suite なし）。ログ docs/tmp/0925_f0_run1.log／run2.log。
- **f0 新基準 pin（2026-09-24 夜・夜間便 2＝0154 手貼り後の追従・71 段 4,740・push 済み＝2026-09-25 便 F4・0154 収蔵 `ec6c3e3` と client 11 本を 1 本で push）**: 裁定200 の 3 値＝NOX DB 基準（run1 前 19:28:10＝backends 18（PostgREST 11）・direct 0／19:29:11＝backends 17（PostgREST 11）・direct 0（60 秒）・run2 前 19:39:16＝backends 18（PostgREST 11）・direct 0／19:40:16＝backends 17（PostgREST 11）・direct 0・postmaster 2026-09-15 16:46・orgs 3）→ **run1（19:20:20）は rate-back 段45-1 の pin 漏れで赤（411s）→ pin 張り替え 3987767 → run1b 591s（19:29:11）／run2 585s（19:40:16）＝いずれも 71 段 ALL PASS・4,740・golden 不変（5931／125802／55233・rate-back 64・billing 53）・段別同一・同一 HEAD `3987767`**。内訳＝前 pin（71 段 4,650）に対し **anon-guard 1003／grants 346／store-profile 62／punch-match 93／cast-guarantee 52／payroll-adjust 129／payroll 217／today-row 32／pay 129**（段数は不変＝新 suite なし）。★pay の T1a／T1b net と payroll-adjust pa(0-6d)・payroll F2f 複合は罰金撤去（裁定293-3）の写像で期待値を張り替え（wage 5931／withholding 125802 は不変）＝裁定293-3 の帰結として承認（2026-09-25 便 F3・v39 §5-3）。client 10 本＝aaf15d8 名簿・probe・pin／e785eac〜8e3b56a suite 追従／4bd684d D1／a43324d D2・D6／96ebcc2 D3／df55a9b D4／bb362bc D5／3987767 rate-back pin。引き継ぎ＝docs/tmp/v39_material.md（§5 問い・§6 目視手順）。
- **f0 新基準 pin（2026-09-24 夜・71 段 4,650・夜間便 N1〜N8＝AY1／AY2／N3 給与表示／N4 ナビ／N5 デモ規約）**: 裁定200 の 3 値＝NOX DB 基準（run1 前＝未計測（起動 17:23:03・取り忘れ＝走行中は規則 8 で DB を触らず）／run2 前 pre1 17:32:51＝backends 17（PostgREST 11）・pre2 17:33:51＝backends 17（PostgREST 11）＝60 秒不変・postmaster 2026-09-15 16:46・orgs 3・direct 0）→ **run1 556s（17:23:03）／run2 546s（17:33:52）＝いずれも 71 段 ALL PASS・4,650・golden 不変（5931／125802・rate-back 64・billing 53）・段別同一（docs/tmp/f0_count.py で機械集計・diff 0）・同一 HEAD `6012ffb`**。内訳＝前 pin（69 段 4,614）に対し **payroll-view 13（70 段目・新設＝N3）／nav 14（71 段目・新設＝N4）／today-row 19→23（AY1 +4）／wish-calendar 15→17（AY2 +2）／demo-guard 15→18（N5 +3）＝差 +36**。変遷チェーン: 65 段 4,563（0151）→ 69 段 4,614（AT〜AX）→ **71 段 4,650（夜間便 N）**。push＝便 F `a014f4d..6012ffb`（5 本＝本番に出た client）: c12e36b shift: 出勤区分で punch in を記録／ca864d7 mine: 提出済みの日は選択不可(裁定290-1)／a9fec7c payroll: 表示・文言(週末バックログ 4)／ceecb48 nav: 下タブ 5 本・ヘッダー改定(裁定275 追補2)／6012ffb demo: 入場前の規約表示。docs は先行 push（7644271 裁定295／a014f4d 275 追補2）。引き継ぎ＝docs/tmp/v39_material.md（§5 問い 7 件）。0154 は未追跡（sha 4d82a688…・裁定295 反映・突合 66 段 致命 0）＝Agoora 手貼り待ち。
- **f0 新基準 pin（2026-09-24 夕・69 段 4,614・便 AT／X／AU／AX＝週末バックログ 1〜3・黒服一覧の取消／上書き・希望カレンダー）**: 裁定200 の 3 値＝NOX DB 基準（run1 前 15:48:40＝backends 14（PostgREST 10）／run2 前 16:00:36＝backends 16（PostgREST 10）・postmaster 2026-09-15 16:46・orgs 3）→ **run1 700s（15:48:46）／run2 607s（16:00:42）＝いずれも 69 段 ALL PASS・4,614・golden 不変（5931／125802／55233・rate-back 64・billing 53）・段別同一**（run1＝HEAD 7bc8aed・run2＝215c1e4＝差は docs 1 本＝裁定293 追補1 の台帳のみ・コード同一）。内訳＝前 pin（65 段 4,563）に対し **today-row 19（66 段目・AT2）／period-stage 9（67 段目・AU2）／cell-names 5（68 段目・AU3）／wish-calendar 15（69 段目・AX）＝新設 4 段 48**・staff-shift 70→73（X2 の段X-1〜3）・他は不変＝差 +51。push＝`b940add..215c1e4`（15 本）: fe40c1d 教訓92／b7dca76 AT2 今日タブ 出退勤の表示／ff89aad X2 黒服一覧の取消・上書き結線と時刻表示（翌日の自動判定）／3e83100 AU2 期間の進行の帯と凡例／e843538 AU3 確定シフト 7 列／eb7e28f AX 希望シフトのカレンダー化（裁定290）／facde3c 裁定291／325d1e7 専門家確認事項 9/24 追補（T7〜T9・S2・L7）／0ad5cf6 裁定292／e82fecb 裁定290／1b9cac5＋3e845fb 裁定291 追補1（1 版→2 版）／421d233 専門家回答 T1〜T9・S-1・S2 収載／7bc8aed 裁定284 撤回の追記／215c1e4 裁定293 追補1。変遷チェーン: 65 段 4,521（夜間便）→ 65 段 4,563（0151）→ **69 段 4,614（AT〜AX）**。
- **f0 新基準 pin（2026-09-24・65 段 4,563・mig0151 手貼り後＝名簿・probe・pin／suite 追従／setup 'next'）**: 裁定200 の 3 値＝NOX DB 基準（run1 前 14:15:50＝backends 12（PostgREST 7）／run1b 前 14:29:23＝backends 15（PostgREST 8）／run2 前 14:44:58＝backends 16（PostgREST 10）・postmaster 2026-09-15 16:46・orgs 3）→ run1（14:15:57）は 51 段目 store-systems の ss(4-0)（白名単 20 キー pin）が 0151 の slide_apply で赤＝**設計上の pin 漏れ（timeout ではない）**→ `5f76dbc` で 21 キーへ張り替え → **run1b 915s（14:29:30）／run2 897s（14:45:04）＝いずれも 65 段 ALL PASS・4,563・golden 不変（5931／125802／55233）・段別同一・同一 HEAD `e76fae4`**。内訳＝前 pin（夜間便 65 段 4,521）に対し staff-shift 62→70（段 9 取消 8）・open-periods 18→23（DB 段 5）・cast-guarantee 30→41（DB 段 11）・store-profile 58→61・setup 61→66・anon-guard 994→997・grants 330→336＝差 +42。変遷チェーン: 61 段 4,415（R／T／U）→ 65 段 4,521（夜間便 N1〜N9）→ **65 段 4,563（0151）**。push＝`30e91ba..cb24385`（21 本＝夜間便 13＋v38 収蔵・裁定289・追従・B〜D・store-systems pin・mig 収蔵）。
- **f0 新基準 pin（2026-09-18 夜・61 段 4,415・便 R／T／U＝在庫・期間フォーム・メッセージ型）**: 裁定200 の 3 値＝NOX DB 基準（run1 前 17:35:37＝backends 17（PostgREST 11）／run2 前 17:47:10＝backends 18（PostgREST 11）・postmaster 2026-09-15 16:46・orgs 3・dev 3200 は Agoora 使用中＝PostgREST 分は Agoora の操作を含む・他プロジェクトの verify なし）→ run1 676s（17:35:43 起動）／run2 590s（17:47:15 起動）＝いずれも **61 段 ALL PASS・4,415・golden 不変（5931／125802／55233）・段別同一・同一 HEAD `6ef7c29`**。段別内訳＝前 pin（60 段 4,392）に対し **inventory 126→132（便 R・stockUnitOf 6）＋shift-tabs 14→20（便 T・period 6）＋messages 11（新設・61 段目＝便 U）・他 58 段は同一**。変遷チェーン: 58 段 4,337（0148）→ 59 段 4,351（274／275）→ 59 段 4,356（Y／Z）→ 60 段 4,392（0149／0150）→ **61 段 4,415（R／T／U）**。★run1 の exit を読んでから run2 を起動。push＝`3430e6d..6ef7c29`（36d3c47 R＝在庫／1e007c3 T＝期間フォーム・topbar／574752b U＝メッセージ型／1c807bd 裁定281／712eb1a 裁定282／6ef7c29 裁定280 追補1）。
- **便 R／S／T／U 適用記録（2026-09-18）**: **R**＝`36d3c47`（/master/stock 棚卸し行＝4 コントロール高さ 34（theme E3 の入力高さ）・補助行「現在庫 n」撤去・数値入力は裁定104 の流儀（.nox-numfield・onWheel blur・右寄せ）・単位＝lib/nox/inventory/unit.ts stockUnitOf（bottle／champ／drink→本・food／other／未知→個）を候補一覧・入力右ラベル・「現在 n本 → 差分 ±m本」・履歴の増減の 4 箇所に（履歴に残数列は無い）・同型行は棚卸し 1 行のみ・inventory 126→132・逆テスト赤→緑・計測 1280px＝4 つとも top 316／height 34・375px＝折り返しで高さ 34 揃い・横はみ出し 0）。**S**＝**停止（RPC 不足）**＝黒服シフトの「取消」（配置済み staff_shifts の削除／取消）に当たる RPC が無い（propose＝insert・override／confirm＝update・status は proposed／confirmed の 2 値・authenticated は SELECT のみ）→ 実装せず docs/tmp/0918_staffshift_flow.md（S-0 のキャスト側 2 入口の構成・現行の黒服側・要る RPC の案 staff_shift_cancel・S 再開時の仮決め）。**T**＝`1e007c3`（期間フォーム＝lib/nox/shift/period.ts（nextPeriodDefaults／periodsOverlap／overlappingPeriods＝店の全期間から・閉区間＝DB の daterange '[]' と同型）・既定＝既存の最終日の翌日から同じ長さ・締切は開始の前日・重なりは赤（裁定281）＋作成 disabled・成否は同カード内（Message）・タブ切替で共有 msg と pMsg を消す・状態 4 値＝picker（裁定259）・作成した期間を一覧で強調（表示月の外でも 1 行）・T-0 d＝「募集中」はキャスト側では shift_wish_submit の門のみ（client の結線 0・RLS で cast は期間を読めない）＝案内文は出さない・topbar .nox-tb の地色 rgba(8,8,8,.94)→var(--bg)・shift-tabs 14→20・目視 5 項目 OK・作った期間は UI 削除で原状）。**U**＝`574752b`＋docs `1c807bd`（裁定281 の適用欄に詳細）。★U の残り＝register-board の routed msg 4 箇所（`{msg.text}`＝to／kind 型）は script と pin の識別子条件（`{識別子}`）を素通り＝次の client 便で Message へ置換し pin を `{x.text}` 型にも広げる。
- **f0 新基準 pin（2026-09-18 夕・60 段 4,392・mig0149／0150＝demo_org_reset）**: 裁定200 の 3 値＝NOX DB 基準（run1 前 16:12:29＝backends 14（PostgREST 10）／run2 前 16:24:03＝backends 17（PostgREST 11）・postmaster 2026-09-15 16:46・orgs 3・dev 3200 は Agoora 使用中＝PostgREST 分は Agoora の操作を含む・他プロジェクトの verify なし）→ run1 669s（16:12:34 起動）／run2 958s（16:24:08 起動）＝いずれも **60 段 ALL PASS・4,392・golden 不変（5931／125802／55233）・同一 HEAD `425f21c`**。段別内訳＝前 pin（59 段 4,356）に対し **demo-reset 34（新設・60 段目）＋anon-guard 992→994（INTERNAL_PROBES に demo_org_reset＝anon／authenticated の 2 assert）・他 58 段は同一**（billing 53 は pin 値の張り替え＝除外 117→118 で本数不動）。変遷チェーン: 58 段 4,337（0148）→ 59 段 4,351（274／275）→ 59 段 4,356（Y／Z）→ **60 段 4,392（0149／0150）**。★run1 の exit を読んでから run2 を起動。push＝`e803261..425f21c`。
- **mig0149／0150 適用記録（2026-09-18）**: 貼り先 ref **hiqbfagmkrdpmlqhkmsu**（proof orgs 3＝NOX-DEMO／NOX-VERIFY-A／NOX-VERIFY-B）・Agoora 手貼り 0149→0150 の順（1 回目の Success 申告は未反映＝便 A で停止→Agoora が SQL Editor で再確認・16:02 JST の再走で反映を確認）。0149 sha256 `1ffc959f6387fe7b70c09e499d8563b61198e510e15b32605484a107fe564af8`（218 行・18,726 B）／0150 sha256 `c6637923c687599b320f9ae8608791a4028368c88357466ad60f8dbee974063d`（21 行・1,619 B）。demo_org_reset の md5(prosrc)＝`742919540d9cb14dd41602a0fadb622e`（live は CRLF＝SQL Editor の貼付で LF→CRLF・LF 正規化 `b9c212593932156eca7e2b73d89ba3b6`＝mig 本体と一致）。検証 A-1〜A-6 **ALL OK**（docs/tmp/0149_post.md）: orgs 8 列（is_demo not null default false／demo_reset_at）・既存 3 org false／null・署名 (p_org_id uuid, p_payload jsonb, p_mode text)・secdef・search_path=public・proacl service_role のみ・storage cast_photos insert／update に is_demo 句・select 不変・delete なし・不触 md5 19 本一致・0150＝service_role statement_timeout=30s（anon 3s／authenticated 8s／authenticator 8s 不変）。名簿＝live 全数 **246**（対象 128／除外 118・B(a) 26→27）・grants G2b 自動走査で anon／PUBLIC 0・anon-guard probe 追加。suite verify:nox-demo-reset **34**（録画 5 枚 golden 5 値・reset all 件数／三点一致／stock_logs 再生成／★7／復元／隔離 B 68 表／raise 8 種／冪等／権限／storage／0150／ROLLBACK 一致・逆テスト＝golden 先頭 5501 で dr(1-3) 赤→戻して緑）。コミット `425f21c`（7 ファイル）。★0150 の実効確認は role 設定値まで＝API 経由（service key・PostgREST）の実測は demo org 作成後。
- **本日（2026-09-18）の f0 走数＝6（緑 4・無効 1・停止 1）**: 停止 1＝11:50:48 に run1（11:43〜11:50・40 段目 reopen で赤）の結果を読む前に run2 を bg 起動してしまい、直後に赤を確認して TaskStop（起動 sleep 中＝段 0・suite 未起動・DB 不触＝f0_run13.start 未作成）。型判定＝走行前の手順ミス（裁定230「赤なら再走せず段名を報告して止まる」の順序違反・DB 応答や設計上の衝突ではない）。以後は run1 の exit を読んでから run2 を起動する。
- **mig0143 D45 適用記録（2026-09-14）**: 貼り先 ref **hiqbfagmkrdpmlqhkmsu**（pooler ap-northeast-1・proof orgs=3）・2026-09-14 11:39 適用（CC が相談役ブロックの明示指示で pg 直結・単一トランザクション・例外なし）・検証 6 項目 OK＝(1) 新 2 列 NOT NULL default 0 (2) 列数 **38→40**・制約 **28→30**・新 CHECK 2 本 (3) n_card／n_other＝aggregate 1/1・close 2/2・reclose 2/2 (4) diff 式に v_ar_card／other なし (5) proacl 3 本 9/11 と同値 (6) **money-core 4 本の md5 不変**（check_pay／check_close／check_void／receivable_collect）。既存 daily_reports **5 行とも新 2 列 0**・行数前後 5。手貼り前の控え（9/11）と 9/14 再実測は同一＝間に誰も触っていない。ファイル sha256 ada2fc9e…8753・20,204 B（Downloads と同一）＝`8c89d4e`。控え＝docs/tmp/0143_pre.txt／0143_pre_0914.txt／0143_post.txt。
- **C層③ DB 側完了（0138〜0141）**（2026-09-10・mig0138 `ec6c3e5`＋0139 `ec6c3e5`＋0140／0141 `8d94923`・追随 `5005a9a`・名簿 `1a78d50`・suite `ac125d7`）: 設計書 v1 §1〜§3 どおり memberships.can_close／can_reopen＋set_staff_perms 7 引数（#63 クローズ）・daily_reports 9 列＋report_reopen／daily_report_reclose 8 引数（p_idem_key）／cash_diff_approve・checks.status merged＋check_merge（0139 補正）・payroll_reopen 5 引数（p_reason・service 経路）・関所 assert_day_open を課金ゲート内蔵の check_* 16 本へ（0140・check_open は 0141 で v_seat.store_id 版へ補正＝教訓68）。verify:nox-reopen 65 assertions（run1 緑・逆張り 3 本同時で 12 赤→backup 復元 差分 0）を f0 末尾へ連結＝**40 本 3,721**（2 連緑 889s／1049s・40 段 ALL PASS・run1／run2 の段別 assertion 数は同一・golden 6 値不変）。内訳の計算値＝旧 3,642＋reopen 65＋billing +0＋grants +12＝3,719 で実測 3,721 と 2 差（pin は実測値・差の出所は本ブロックでは未特定＝段別ログは docs/tmp に残置しない・次の pin 時に段別で照合）。UI（§4 の 4 面）は次ブロック。
- **handoff v29／v30 収蔵（2026-09-11）**: Downloads から `docs/handoff/` へ収蔵（git 追跡へ追加・sha 全64桁付き）。v29＝`NOX_相談役引き継ぎ_2026-09-10_v29.md`（7,604 B・sha256 `4573dfdafa30be4240cafc2c4566d125701e8509b598ffbc53cfd48a3bf79d0a`）／v30＝`NOX_相談役引き継ぎ_2026-09-10_v30.md`（9,576 B・sha256 `e21dd85b72e97989ef7f1aee6e618d2b0d14de11362f348ff0e52f36472b1660`・Downloads の「v30 (1)」「(2)」「(3)」は 3 つとも同 sha＝「(1)」を無印名で収蔵。Downloads の無印 v30.md は 9,772 B・16:49 旧稿＝収蔵せず削除もせず）。収蔵後に再計算した sha は照合値と一致。v29 §0 の HEAD／ahead は 9/10 14:30 時点・v30 §0 は 9/10 17:05 時点の値のままで正（#81 は v30 未記載＝v31 で記載）。旧セッションの pin push（`18c5b2b`・0 0）を待って収蔵＝f0 不要（docs のみ）。
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
| 42 | **待遇画面の準備中項目（C5）** | 裁定101 §2 の器なし項目（日給制/保証時間帯/判定単位 半月・日/pt付与ルール/粗利基準/延長・昇格バック/帯歩合%/丸め2軸/未達根拠確認記録/達成 params 拡張/率方式=R-2b 後・**＋達成条件の他軸〔出勤/本指名/同伴〕＝U-2 是正で追記・計12項目**）。**器は作らず準備中バッジで明示**（正本＝`lib/nox/comp-methods.ts PREP_ITEMS`・c3 assert が本数 pin）。**＋ノルマ節の圧縮**＝店設定・キャスト別目標・ペナルティの3カードをモック型へ縮約する再設計（現状は NormaBoard 搭載のまま＝U-2 是正で起票）。解錠は項目ごとに別裁定（設計書 §3）。**→ 照合先を v3 へ更新（2026-09-01・裁定106）**＝v3 は準備中カード列挙を撤去し**機能トグル型**（使うノルマ/達成条件だけ有効化）へ・pt 系のみ注記1文。準備中12項目の実体（器なし）は不変で、v3 で**器なしの新規要素が追加**＝ノルマ4軸のプラン既定（基準値）・達成ボーナス4軸トグル・シャンパン等「商品売上に対して率」・スライド判定基準（指名売上/総売上）・送り回数（sim 入力）＝裁定106 の器調査に収載。**→ v3 実装（2026-09-01）で新規2種（商品売上×率・スライド判定基準/対象の選択）を生バッジで画面へ**（PREP_ITEMS 不触＝c3 pin 維持・正式収載は C5 解錠時）。ドリンク杯数 basis は**起票#46**。**→ クローズ（2026-09-04・裁定113 UI レーン）**＝生バッジ「商品売上×率」は3択セレクタ（商品ごとの設定／売上の割合／販売数 × 固定額＝mig0132〜0134）で消化。スライド判定基準/対象の選択の生バッジと PREP_ITEMS 12項目（C5・器なし）は**準備中バッジのまま残置**（正本＝comp-methods.ts・c3 pin 不変）＝本起票は閉じ、個別解錠は項目ごとの裁定で起票し直す |
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
| 56 | **duration 上限ガード（UI 警告＋RPC 拒否・duration_min > 1440）** | **RPC 側消化（2026-09-04・mig0131＝#55 同乗・vu(du1/du2) 係留）**。★残2点: (a) **UI（帯モーダル）の警告は未実装** (b) **実データ逆転1件（CLUB NOX「VIP20:00〜20:59」延長 30円/5000分）は 2026-09-04 実測で未訂正のまま**＝バインド正常は実機往復で実証済み（2026-09-03）・訂正は CLUB NOX owner＝実アカウントのため CC の UI 代行不可＝**訂正済み（2026-09-07・live 実測 amount=5000／duration_min=30）**。★訂正で `updated_at` が動かなかった件は #59 へ分離 |
| 57 | **drink_claims 転用設計（申告→帰属訂正フロー）** | 金の発生源を**商品バック1系統（check_cast_backs）へ統一**し、claim は確認・訂正申請＋append-only 調整行へ転用する設計。背景＝**実測①（2026-09-04）で「同一ドリンク行の二重（claim back_amount と drink_back の両立）」が現行仕様と確定**・裁定113 の裁定4で drink_claims は 113 の射程外（完全不干渉）。訂正締切が D-1（給与確定取消）と隣接のため**着手時期は D-1 設計時に裁定**。D調査で現行 claim 機能の店別 on/off 設定の有無を確認 |
| 58 | **f0 の statement timeout フレーク（原因追跡）** | 2026-09-04 の 5走中2走で **billing 段47-3（locked でも seats を SELECT）／payroll `loadMasters`（collect.ts:95 マスタ読み取り）** が `canceling statement due to statement timeout` で赤・assert 赤ではなく DB 側のタイムアウト（同型＝起票#33〜35・drink_claims 1行表・advances・payroll timeout の既往）。**再走緑なら gate 妥当**（2連緑の判定は「連続2走が緑」＝フレーク走は数に入れず再走で取り直す運用を継続）。**原因追跡は別レーン**（pooler／statement_timeout 値／並走クエリ／対象テーブルの行数増＝audit_logs・stock_logs 等の単調増加表の疑いを含む・教訓35）。起票 2026-09-07 **追跡材料（2026-09-07・料金 v8.1 C3 後の f0 5走）**: 5走中2赤＝run1 r2b(11b) `statement timeout`／run3 pb 段 `check_set_nominations: has payments`＝**派生症状**（pb は check_close のエラーを非致命 assert で受ける→close が timeout で落ちると支払済み伝票が同席に open のまま残留→次の check_open が `on conflict (seat_id) where status='open'` で同伝票を返す→set_nominations が has payments）。pb 単独再走 2/2 緑・残留ゼロ実測（seats/products/checks とも 0）・run4/run5 連続緑 36本3546。timeout の派生形として同件で追跡 **→ 主因確定・対処済・観察中（2026-09-07・裁定139／教訓58）**: 主因＝audit_logs の verify 残骸 124,134 行（99.3%）。手貼り掃除（Agoora）＋f0 冒頭 sweep（org_id 直書き・seed_marker 除外・5,000 行 warn）＋rls 全件 select→count head。対処後 2 連緑 37 本 3,550。**timeout 無しで 5 面連続なら close**。本番向け＝audit_logs retention はローンチ後必須（税理士ゲート後） **2026-09-07 vacuum full 実施（Agoora・SQL Editor 単文）＝151 MB → 1.6 MB**（heap の未回収は解消・pg_repack 不要） **観察（2026-09-07 夜・O4）**: sweep 後の 5 面（キャスト／日報／ホーム／分析／お知らせ run1）は timeout 0 で 9 走緑だったが、お知らせ run3 で pricing 段43(18)d の statement timeout・給与 run1 で null.id（error 未捕捉の派生）・run2 で pooler ECHECKOUTTIMEOUT＝**クローズせず観察継続**。新材料＝**PostgREST 経路だけが遅い**（direct pg 9ms／signin 13.8s／rpc 22.6s→1.6s・DB 側に長時間クエリなし）＝pooler／API コンテナ側の疑い（日中 30 走超の負荷後）。翌朝に再走して回復を確認 **翌朝 2026-09-09**: 回復（signin 1.21s）・f0 2 連緑・夜間の遅延は一過性＝観察継続（timeout 無しで 5 面連続の数え直し＝本日から） |
| 59 | **pricing_rules に updated_at の自動更新トリガなし** | 帯訂正 6e0c73e7（CLUB NOX 延長・2026-09-07 実施・5000円/30分）後も `updated_at` は **2026-09-03 14:56:18 のまま＝不変を live 実測**。pricing_rules のユーザートリガ **0 本**（pg_trigger 実測）・列は created_at/updated_at とも存在。`set_pricing_rule` の update 経路は `updated_at = now()` を明示するが、本訂正は audit_logs に set_pricing_rule 行が無い＝**RPC を通らない直接 update 経路では更新されない**（audit も残らない）。要る変更＝`before update` トリガ（`set updated_at = now()`）を pricing_rules へ（mig 小・他の上書き型テーブルへの横展開は別途棚卸し）。当面の更新追跡は audit_logs（RPC 経由のみ）。起票 2026-09-07 |
| 60 | **「保証時給」語の不整合（キャスト側／報酬プラン側）** | キャスト詳細「待遇・バック」は裁定143（2026-09-07・`0b896ce`）で comp_plans.base を「通常時給（プラン基本）」へ改名済み。報酬プラン側は旧語のまま＝`plan-editor.tsx` 2 箇所（269／275 行）＋`comp-sections.tsx` 5 箇所（354／430／453／544／682 行）の計 **7 箇所**が「保証時給」。同じ列を2つの語で呼ぶ状態＝キャスト詳細のマスタ導線注記に「マスタ側の表記は『保証時給』」を併記して暫定橋渡し。**K33 入店時給保証（第2期・期間付き別レイヤ・保証方式2択）を実装する前に報酬レーンで「通常時給（プラン基本）」へ統一**（語が衝突すると保証の意味が二重になる）。値・RPC・pay.ts は不変＝文言のみ。起票 2026-09-07 |
| 61 | **帯訂正前に逆転値で凍結された伝票の扱い（レジ v12.1 送り）** | live 実測（2026-09-07・CLUB NOX）: ext_fee=30／ext_min=5000／ext_menu_snap「延長 5000分 ¥30」で凍結された伝票 **1 件**＝`105a0a77-c33c-4814-a862-1ba5b36886c5`（2026-09-03 05:57 UTC 開栓・**open**・行はセット料金 10,000 円 1 本・total 11,000）。延長行の母数 12 本中、30 円／5000 分で生成された行は **0**＝日報への実害なし。当該伝票に延長を適用すると逆転値で課金される＝レジ側で void→再開栓（凍結値を取り直す）か、開栓済み伝票の凍結値を訂正する RPC（現行なし）を裁定。日報側に是正経路なし（裁定153）。起票 2026-09-07 **→ クローズ（2026-09-09）**: Agoora 実機で void（voided_at 2026-09-09 04:40:59 UTC・本日の check_void audit 8 行・CLUB NOX の open 伝票 0）。逆転値での延長行は生成されず＝**課金発生なし**。凍結値訂正 RPC（price_snap_fix）は横断設計書 §3 の 7 番として C層③へ |
| 62 | **audit_logs.reason 列＋audit_log_write p_reason（C層① mig 同梱）** | 横断設計書 §3（裁定181）: 解除系 5 種（report_reopen／payroll_reopen／cash_diff_approve／check_void／price_snap_fix）は reason 必須。現行 audit_logs に reason 列なし（live 実測 10 列）。C層①（feature_flags）の mig に `alter table audit_logs add column reason text` と `audit_log_write` の末尾引数 `p_reason text default null`（既存呼出不変・audit_log_write_service も同型）を同梱。f0＝解除型 RPC で「audit 1 行増・before/after 非 null・reason 空で raise」。起票 2026-09-09 **→ クローズ（2026-09-09・mig0135）**: reason 列追加・audit_log_write 6 引数／_service 8 引数（旧 signature DROP・呼出 141 本は位置引数＝無改修）・dev 適用済み（検証 9/9）・verify fl(6)/(7) で reason の書込と後方互換を係留 |
| 63 | **set_staff_perms 6 引数化（can_close／can_reopen・C層③ mig 同梱・A6 名簿）** | 横断設計書 §2（裁定180）: memberships に `can_close boolean not null default false`／`can_reopen boolean not null default false` を追加し、set_staff_perms(p_membership_id, 4 boolean) → 6 boolean へ（旧署名 DROP・原則7＝UI は全引数明示・A6 名簿は署名変更として全数照合）。解除型 RPC の判定＝`auth_role() in ('owner','manager') or (auth_role()='staff' and can_reopen)`。付与剥奪は `perm_change` で監査。staff-board の権限チップに 2 列追加（黒服のみ操作可）。起票 2026-09-09。**クローズ（2026-09-10・mig0138）**: 実装は **7 引数**（p_membership_id＋6 boolean＝can_register／can_crm／can_shift／can_view_backs／can_close／can_reopen・旧 5 引数 DROP＝裁定 C③-11）。判定は report_can_close／report_can_reopen（内部）＋auth_staff_can_close／can_reopen（authenticated 可）。監査は既存 set_staff_perms action（perm_change 新設なし）。staff-board 2 列・anon-guard 22 箇所・grants 追随済み。verify:nox-reopen 3c／3d／3g で係留 |
| 64 | **レジのキャスト候補にランク・出勤状態を併記（R43・attendance 読取＝新規クエリ）** | モック v12.1 の候補文「あべ｜エース・出勤中」「れいな｜接客中」。現行 CastPicker は名前・写真のみで、register-board は attendance／cast_ranks を読んでいない＝A層（新規クエリなし）の外。レジ本レーン（Fable）で「候補の並び・在席（openNoms）・出勤（attendance）」を 1 クエリで足すか、CastPicker 共通部品側で受けるかを裁定。PII なし。起票 2026-09-09（CC 起こし） **→ B3（レジ非 money レーン R34 と同じ attendance 読取）で解消予定**（2026-09-09） **→ クローズ（2026-09-09・B3-1 `acc5be5`＝出勤中／接客中／打刻＋ランク名・Agoora owner 実機で目視済・push）** |
| 65 | **sweep の起動ガード（他 verify 走行中は f0 を起動しない・機械化）** | 裁定200・教訓63（複数チャットの f0 並走）。`verify-nox-audit-sweep.ts`（f0 先頭）の冒頭で「他の verify 走行中」を検知して停止する案: (a) 直結で pg_stat_activity を読み、`application_name` に verify 印（各スイートの pg／supabase-js 接続へ `nox-verify:<suite>` を付与）を持つ自分以外の backend があれば raise (b) 60 秒の再実測で消えなければ停止。audit_logs へ開始マーカーを書く案は監査系列の汚染（#58 の残骸型）になるため不採用。設計は相談役・起票 2026-09-09 |
| 67 | **staff_wish_delete RPC 新設（本人・締切前・監査 action=RPC 名）**（低） | C層② 面 b の希望は upsert のみで「なし」へ戻せない（裁定236）。補正 mig（0138 想定・裁定229 型）で staff_wish_delete(p_wish_id) を新設＝本人の行のみ・締切前のみ（staff_shift_deadline_at で判定）・flag gate・課金ゲート不要（事実記録＝B(i) 同型）・audit action='staff_wish_delete'。UI は面 b のタップ巡回へ「なし」を足す。起票 2026-09-10 |
| 68 | **staff_shift_deadline_at を authenticated 公開へ切替→client 算出を撤去**（低） | 面 b／c は締切ロックを deadlines 表から同式で算出（裁定237）。補正 mig（裁定234 型＝grant execute … to authenticated のみ・本文不変）で関数を公開し、staff-shift-board.tsx の deadlineMsOf を RPC 呼出（日ごと or 月まとめ）へ置換＝式の二重管理を解消。名簿＝B(f) へ（読取・非ゲート）・grants の G4c から外し HELPERS 側へ。起票 2026-09-10 |
| 69 | **/shift の対象切替（キャスト／黒服）時に scrollTo(0)**（低） | C層② H3 の切替は同一ページ内の描画差し替えで scrollY を変えないため、cast 面でスクロール後に黒服へ切り替えると見出しが sticky 上バー（.nox-tb 64px）の下に潜る（2026-09-10 Agoora 目視・約 40px）。切替 onClick で `window.scrollTo({ top: 0 })` を 1 行（B4 の面は不触）。起票 2026-09-10 |
| 70 | **/report で解除中の日報に対し、締め欄の入力値を渡して再締めする経路がない**（中） | 再現（2026-09-10 Agoora 目視）: 9/10 を解除→締め欄に諸経費 400・実査 397,000 を入れる→表の行の「再締め」は既存値で daily_report_reclose（p_expense 等を送らない＝差異 —・諸経費 0 のまま）／締め欄の「締め確定」は解除中の日に効かない（daily_report_close は already closed）。処置＝面 a 追補（同日・client コミット）: 解除中（flag on）／締め済み（flag off＝現行の上書き再集計）の日を選ぶと締め欄の見出しとボタンが「再締め」になり、諸経費／現金支払／釣銭／実査／メモ／強行チェックの値を p_expense／p_cash_payout／p_cash_float／p_counted_cash／p_note／p_force＋p_idem_key で送る。値は選択時に日報の現在値を締め欄へ写す。表の行の「再締め」は締め欄へスクロール＋諸経費にフォーカスするだけ（値を送らない＝経路 1 本）。flag on で締め済み・未解除の日は「締め確定」を disabled（title で解除を案内）。起票・処置 2026-09-10。**クローズ（2026-09-10 Agoora 目視済・9/11 収載）** |
| 71 | **/api/payroll/reopen の staff∧can_reopen 分岐が UI から到達不能**（中・**B5 レーンで解消予定**＝裁定 B5-5） | app/(manage)/payroll/page.tsx が owner／manager 以外を /register へ redirect するため、route の decideReopenAccess（C③-17）にある staff∧auth_staff_can_reopen 分岐は UI からは呼べず、直叩き時だけ有効＝page と route の判定が不整合（B5 調査 8-1・2026-09-10）。処置＝B5-5「給与は owner／manager のみ」＝route の staff 分岐を削除し page と揃える（authz.ts の関数シグネチャは維持・分岐のみ変更・既存 suite の該当 assertion を更新）。起票 2026-09-10 |
| 72 | **audit_logs.reason に列 CHECK が無い（daily_reports の reopen_reason／diff_reason とは非対称）**（低・**観察**） | 理由 1〜200 字は report_reopen／cash_diff_approve／check_merge／payroll_reopen の RPC 本文だけで担保し、audit_logs.reason 列には CHECK・NOT NULL・enum が無い（B5 調査 8-2）。daily_reports 側は列 CHECK（mig0138）あり＝非対称。B5 では列 CHECK を足さない（裁定 B5-1「含まない」）＝観察継続。RPC 以外の書込経路（audit_log_write_service の直呼び）が増えたときに再判断。起票 2026-09-10 |
| 73 | **payroll_mark_paid を呼ぶ route／UI が無い**（中・**B5 レーンで解消予定**＝裁定 B5-6） | payroll_mark_paid（service_role 限定・finalized→paid・冪等 paid_idem_key）は suite からしか呼ばれず、app に route も UI も無い（B5 調査 8-3）。'paid' は seed か手動でしか作れず、DEMO の 2026-07 run は 'paid'（payslips 6・payment_records 0）。処置＝B5-6「payroll_mark_paid の route＋UI を含める（owner 限定・状態遷移のみ）」＝app/api/payroll/mark-paid/route.ts 新設＋月次一覧の「支払済みにする」（設計書 §3.3／§5）。起票 2026-09-10 |
| 74 | **payroll_reopen の reopen_flow 直読みは flag_enabled と二重**（注記のみ） | payroll_reopen は service 文脈（auth.uid() なし）のため flag_enabled（RPC）を使えず、feature_flags を店舗行→org 行→false の順で本文が直読みしている（mig0138 §9・B5 調査 8-6）。解決順は flag_enabled と同じだが実装は二重＝**key を増やす・解決順を変えるときは両方を追随する**（列 CHECK・flag_set 白名単・feature-flags-panel の 3 箇所＝0135 同型に加えて 4 箇所目）。B5 は flag 新設なし（裁定 B5-4）＝台帳注記のみ。起票 2026-09-10 |
| 75 | **給与「この期間を確定する」が disabled のとき理由が出ない**（低・**修正済・目視待ち**） | blockers あり／対象 0 名で disabled になるが、ボタン脇に理由がなく上の「要対応」区画を見ないと分からない（2026-09-10 Agoora 目視）。処置（同日・client）＝ボタン脇に「要対応 N 件を解消してください」（対象 0 名は「対象キャストがいません」）・title 同文。起票・処置 2026-09-10 |
| 76 | **キャスト割当表で割当行の無いキャストのプルダウン表示**（低・**修正済・目視待ち**） | 未割当キャストの select が「未割当（プラン選択）」で、既存割当の「プラン選択」と見分けにくい（2026-09-10 Agoora 目視）。処置（同日・client）＝割当行の無いキャストは空＝placeholder「未設定」。既存割当は現状・保存導線は不変。起票・処置 2026-09-10 |
| 77 | **cast-comp の割当保存で RPC 生文言 'bad valid_from' が露出**（低・**修正済・目視待ち**） | set_cast_plan（mig0116）は `p_valid_from < current_date`（過去日）または `p_valid_from <= 現在行の valid_from` で 'bad valid_from'（2026-09-10 Agoora 目視）。処置（同日・client）＝compErrJa に「適用開始日は今日以降で、現在の適用開始日より後の日付にしてください」（判定 2 条件を両方含む文言）。同画面の他の生文言＝'bad overrides'（上書き値の型・範囲）も同時に写像。'reason_required'／'feature_disabled' は cast-comp の RPC には無い。起票・処置 2026-09-10 |
| 78 | **/payroll で finalized／paid でも「この期間を確定する」が表示される**（低・**修正済・目視待ち**） | 確定済み期でもボタンが描かれ（disabled 条件は blockers／rows のみ）、押すと route が 409 already paid 等を返す（2026-09-10 Agoora 目視）。処置（同日・client）＝status==='draft' のときだけ描く。起票・処置 2026-09-10 |
| 79 | **納付管理の注記が旧導線「上の支払記録から『支払済みにする』」のまま**（低・**修正済・目視待ち**） | B5 で支払済み化は月次一覧へ移った（裁定 B5-6）ため文言が実態と不一致（2026-09-10）。処置（同日・client）＝「給与 月次一覧の『支払済みにする』を実行してください」。起票・処置 2026-09-10 |
| 80 | **確定解除ボタンの style 警告（border 短縮形と borderColor の混在）**（低・**修正済・目視待ち**） | payroll-board の「確定を解除」（payCount===0 分岐）が `{ ...t.btnGhost, borderColor: … }`＝t.btnGhost の `border: "1px solid var(--line2)"`（短縮形）に個別指定 borderColor を重ね、React が shorthand と longhand の混在を警告（2026-09-10 Agoora 目視）。処置（同日・client コミット）＝`border: "1px solid var(--bad)"` の短縮形で上書き。同型（btnGhost／btnLight 展開＋borderColor・条件付き spread 含む）を grep し **17 箇所**を同じ形へ（payroll 1・casts 2・staff 1・comp-sections 2・plan-editor 1・register 5・kiosk-register 1・customers 3・report 1）。条件付きで非選択時に undefined を渡していた 3 箇所（comp-sections 2・plan-editor 1）は `border: cond ? "1px solid var(--gold)" : t.btnGhost.border`＝非選択時も短縮形で明示。値は同じ＝見た目不変。番号は相談役指定（#75〜79 は本表に無い＝欠番）。起票・処置 2026-09-10。**クローズ（2026-09-10 Agoora 目視済・9/11 収載）** |
| 81 | **analytics ヒートマップの曜日行 Fragment に key が無い（React 警告）**（低・**修正済・目視待ち**） | analytics-board の時間帯×曜日ヒートマップで `DOW.map` 直下が `<>…</>`（key なし）＝子の span／div に key があっても親 Fragment に無く "Each child in a list should have a unique key" 警告（2026-09-10 Agoora 目視）。処置（同日・client）＝`<Fragment key={\`r${d}\`}>`（react から Fragment import）。同型（map 直下の key なし `<>`）を app／components で grep＝他 2 件は非該当（master-board は keyed Link の内側の変数・pricing-board は IIFE の戻り）＝置換 1 件。起票・処置 2026-09-10 18:35（client b77961f） |
| 82 | **月次一覧の支払済み件数と明細の未支払カードが run 状態を見ていない**（中・**起票 2026-09-11**） | **本文（逐語）**: 一覧サマリー「支払済み N 件」は payment_records の有無ではなく run.status=paid の件数。明細「未支払」カードは run が paid なら ¥0・通常色(赤にしない)で「支払済み化済み」を添える。支払状況列「—」は paid 時「支払済み化」。金額の再計算はしない(B5-1)。client のみ・suite なし。起票 2026-09-11。処置（同日・client **`36860ba`**・Agoora 目視 OK 同日）＝list.ts の ListKpi に `paidRuns`（status=paid の run 数）を追加し sumListKpi で集計（paidCount＝payment_records 件数は行の支払状況列用に残す）／payroll-list のサマリー「支払済み N 件」を paidRuns へ・支払状況列の「—」は paid 時「支払済み化」／payroll-board の未支払カードは run が paid なら ¥0・通常色・「支払済み化済み」（Σnet−Σpaid の再計算なし＝表示分岐のみ）。verify:nox-payroll-list は pl(1j) に paidRuns 1＋記録なし run でも 1＋finalized は 0 を、pl(1k) に paidRuns 0 を畳み込み＝19 本不変（pin 3,765 を動かさないため独立 1 本を足さず既存へ畳んだ）。 |
| 83 | **payroll_runs の store×period unique が index 一覧に出ない（b6_survey 第 2 次 欠陥候補 5）**（低・**観察・クローズ可**） | 第 2 次調査の grep（`create index ... on public.payroll_runs` の 1 行一致）が mig0016:137 の 2 行書き `create unique index if not exists payroll_runs_store_period_uidx`＋次行 `on public.payroll_runs (store_id, period)` を拾えなかった調査側の見落とし。処置＝2026-09-11 live 照合（pg_indexes: `payroll_runs_store_period_uidx` UNIQUE (store_id, period) 実在・pg_constraint に unique 制約なし＝index 方式・proof orgs=3）。補正 mig 不要（裁定234 型の起草不要）。B5 一覧の eq(store_id, period) 1 件前提は担保されている。起票・クローズ 2026-09-11 |
| 84 | **kiosk_register_state に ar_enabled が無い＝kiosk レジは「売掛」を非表示にできない**（低・**起票 2026-09-28 便 T-1**） | 0155 で店設定 settings_json.ar_enabled を足し、管理画面のレジは stores 直読で「売掛」を未描画にした（便 S-2）。kiosk は読取が kiosk_register_state／kiosk_check_detail の 2 本のみ（0059 契約・直 SELECT なし）で店設定を読めず、サーバの 'ar disabled' と文言で受けるのみ。処置＝kiosk_register_state の jsonb に `ar_enabled` 1 キーを足す（0156 ★6 同乗・署名不変・戻りキー追加）→ kiosk の METHOD_LABEL を同じ条件で filter（client 便） |
| 85 | **get_cast_mynumber_masked の戻りが text 1 値＝廃棄済み（mynumber_deleted_at）を cast 本人に示せない**（低・**起票 2026-09-28 便 T-1**） | 0155 ★6 で cast_sensitive に廃棄記録 3 列を足したが、cast 本人が読む経路は masked（末尾 4 桁 text）のみで、廃棄後は null（未登録と区別できない）。owner 側は audit_logs から日付を拾って表示（便 S-3）。処置＝masked の戻りに `mynumber_deleted_at`／`mynumber_deletion_method` を足す（0156 ★6 同乗・署名（p_cast_id uuid）不変・戻りを record／jsonb へ＝呼び出し元 /mine の追随は client 便・G10 の search_path pin は不変） |
| 86 | **マスタハブに「店舗情報」カードが無い＝S-1 の「売掛を使う」への導線名が「営業時間・定休日」のまま**（低・**起票 2026-09-28 便 T-1**） | store-profile-panel（店舗情報／シフト運用／売掛・記録の保持）は /master/business-hours の先頭 3 節に置かれ、ハブのカード名・ナビ名は「営業時間・定休日」「営業時間」のみ（便 S 読取 1）。処置＝master-board に「店舗情報」カード（href /master/business-hours・説明に 売掛・保持年数・利用目的）を新設、または store-profile-panel を /master/store へ分離（client・裁定待ち＝nav.ts の pin（verify:nox-nav）張り替え） |
| 87 | **kiosk_register_state に okuri_mode が無い＝kiosk 打刻の退勤に「送り あり／なし」を出せない**（低・**起票 2026-09-28 便 Y-1**） | 0156 で punch_self／punch_proxy／kiosk_punch に p_okuri が付き、/mine と /shift の退勤は okuri_mode='actual' の店だけトグルを出す（便 V-5）。kiosk（anon 面）は stores.settings_json を読めず kiosk_register_state にも okuri_mode が無い＝トグルを出す判定材料が無い（便 V で未実装＝報告済み）。処置＝次 mig に同乗: kiosk_register_state の jsonb に okuri_mode（ar_enabled と同型・店設定の写し）→ kiosk 打刻の out に「送り あり／なし」→ kiosk_punch p_okuri（client）。 |
| 88 | **裁定316 の DB ガード（payroll_finalize の period not ended）で、未来期・当期を使う suite の fixture が落ちる**（中・**起票 2026-09-29 便 Z-1**） | 本文（逐語）: 「316 の DB ガードで未来期を使う suite は fixture の期を過去月に張り替え（手貼り後の suite 便）」。0158 ★3 で payroll_finalize が coalesce(period_end, period_bounds) >= 今日の営業日 を 'period not ended' で拒否する。verify-nox-payroll（P＝2026-09・2026-11・2026-12・2027-xx・2098-09 ほか）・reopen・payroll-list・payroll-adjust・carryover・advance-okuri・daily-pay・compliance など payroll_finalize を admin／tx 内で直接呼ぶ suite は、期が「今日の営業日より前に終わる月」でないと赤になる。処置＝0158 手貼り後の suite 便で fixture の期を過去月へ張り替える（対象の洗い出しは docs/tmp/0158_pre.md【suite】節）。 **追認＝凍結値 2000-01-01 の手段で確定（9/30 Agoora）**＝期の文字列は据え置き、確定の直前に run の period_start／period_end を 2000-01-01 に置く（scripts/fixtures-f0.ts の endedRuns／ENDED_RUN_SQL・便 AA-3）。クローズ。 |
| 89 | **customer_register の権限が「レジ操作可の role」より狭い＝レジ権限のみの staff・レジ可の cast は新規登録できない**（中・**起票 2026-09-29 便 AA-1**） | 本文（逐語）: 「customer_register をレジ権限 staff にも開放＝0159」。customer_register（0023／0088）のゲートは owner／manager／顧客権限のある staff（auth_staff_can_crm）。裁定321 の「新規登録して追加」は can_register の staff では 'forbidden'（client は「登録する権限がありません」を出す＝便 X-11-2）。処置＝mig 0159 でゲートに auth_staff_can_register（と要否を裁定のうえ auth_cast_can_register）を足す。 |
| 90 | **MoneyInput（金額欄の共通部品）に置き換えていない金額入力が残る**（低・**起票 2026-09-29 便 AA-1**） | 本文（逐語）: 「MoneyInput の残り（マスタ・シミュレーター・保証額・売上目標）＝X-12」。便 X-11-6 で置換したのは 11 面（前借り／送り実費の 1 件・一括、日払い、出勤ボーナス、給与の調整と控除上書き、支払記録、送りの金額ダイアログ、減額 2 種、日報の送り行、分割領収書）。残り＝マスタ（料金 pricing-board・商品 products-board・待遇プラン comp-sections／plan-editor）・components/simulator-panel.tsx・casts-board の保証額・analytics-board の売上目標・mine/norm-card。処置＝便 X-12。 |
| 91 | **kiosk_transport_issue の課金ゲート行が規約の形（引数 v_org／auth_org_id() の 2 種）に当たらない**（低・**起票 2026-09-29 便 AA-3**） | 0158 の kiosk_transport_issue は `billing_writable_of(v_device.org_id)` でゲートしている。ゲート自体は効く（'billing locked' を持つ関数 148 本に含まれる）が、verify:nox-billing 段47-1 の「挿入行の形」は 147 本（148 にならない）。原因＝0158 起草（便 Z-2b）で打刻端末の腕を kiosk_punch から写した際に v_org へ受け直さなかった（CC の起草の見落とし）。暫定＝形の pin を 147 に置き注記（便 AA-3）。処置＝mig 0159 で v_org := v_device.org_id に受けてから規約の 1 行へ直し、pin を 148 に戻す。 |
| 92 | **payroll_attentions の cast_id／store_id／org_id は cascade しない＝cast を消す経路と demo_org_reset が新表を知らない**（中・**起票 2026-09-29 便 AA-3**） | 0158 の payroll_attentions は run_id のみ ON DELETE CASCADE。要対応の行が残る cast は delete が FK で止まる（verify:nox-punch-match pm(9-15) は casts delete の前に自前で消す形にした）。demo_org_reset（0149）は削除対象の表の一覧に payroll_attentions を持たない＝デモ org に要対応が 1 行でもあると reset が FK で失敗しうる（payroll_runs を先に消す順なら cascade で消えるため、live の削除順の確認が先）。処置＝0159 で demo_org_reset の削除順を確認のうえ payroll_attentions を明示で足す。 |
| 93 | **日払いフォームの「確定済みのため、日払いの発行はできません（読取のみ）」を裁定312 に合わせて見直し**（低・**起票 2026-09-30 便 AC-0**） | 本文（逐語）: 「日払いフォームの『確定済みのため発行できません（読取のみ）』を裁定312 に合わせて見直し＝便 X-12」。裁定312（0158）で支払済みの期の営業日でも日払いは翌月へ繰り下げて発行できるようになったが、components/nox/daily-pay-form.tsx は readOnly（給与画面の adjEditable=false＝確定済み run）で発行欄ごと隠す。処置＝便 X-12 で readOnly の条件を見直す（確定済み run でも発行可・繰り下げ先を表示）。 |
| 94 | **歯車ポップオーバーが画面上端より上に描画され、名前・メール行が切れる**（中・**起票 2026-09-30 便 D159-1・9/30 Agoora 目視**） | 本文（逐語）: 「歯車ポップオーバーが画面上端より上に描画され名前・メール行が切れる＝ヘッダー直下に固定・viewport 内に収め超過は内部スクロール・≤899 はシート」。処置＝ヘッダーの ⚙ ポップオーバーをヘッダー直下に固定（top をヘッダー高さ基準に）・高さは viewport 内に収め、超過分は内部スクロール（overflow-y: auto）・≤899px は裁定306-11 のボトムシート（overlay・fixed）を使う。便 X-12（0159 client 便に同乗）。 |
| 95 | **枠マスタ（staff_shift_patterns）の無効化＝器なし**（中・**起票 2026-09-30 便 P-2**） | 本文（逐語）: 「枠マスタの無効化＝+disabled_from・staff_pattern_disable／enable（0160）」。現状＝staff_pattern_set は insert のみ・delete は未来行のみ・effectivePatterns は同名の最新行を常に有効とみなす（docs/tmp/0930_pm_pre.md ①）。処置＝0160 で列 disabled_from date と RPC 2 本（owner／manager 自店）・client は effectivePatterns で除外＋「停止中」バッジ。 |
| 96 | **T6 加盟店契約確認の記録＝器なし（client の ack は保存の前提にするだけで記録が残らない）**（中・**起票 2026-09-30 便 P-2**） | 本文（逐語）: 「T6 加盟店契約確認の記録＝器を追加・読取は料金マスタ（0160・白名単 +1 か set_store_tax_config +p_contract_ack は起草時に裁く）」。現状＝pricing-board 340 行の tSurAck は set_store_tax_config に渡らず「保存すると確認の記録が残ります」の文言と食い違う（0930_pm_pre.md ②）。処置＝0160。 |
| 97 | **未確定 run の自動計算＝cron の器と auth**（低・**起票 2026-09-30 便 P-2**） | 本文（逐語）: 「未確定 run の自動計算＝cron は expire-trials に同居・core の service 分岐は裁定要（ローンチ前ゲート）」。現状＝vercel.json の cron は Hobby 上限 2 本を使用済み・computePayrollDraft は managerClient（JWT 前提 RPC）必須＝cron から preview は 401（0930_pm_pre.md ③）。処置＝expire-trials に同居＋core を admin だけで読める集計へ（service 分岐は裁定）。 **→ 2026-10-09 便 VP: Vercel Pro 移行済み（Functions hnd1・Hobby の cron 2 本上限は解除）＝裁定可・裁定待ちのまま** **→ 2026-10-13 便 N1013b B-4: 第 2 期クローズ（相談役）＝手動プレビューで足りる・自動計算は第 2 期（core の service 分岐）** |
| 98 | **owner 自身のメール変更＝route が owner を 403**（低・**起票 2026-09-30 便 P-2**） | 本文（逐語）: 「owner 自身のメール変更＝update-email.ts 42 行の除外解除・Auth 設定 4 点後（mig 不要）」。現状＝lib/nox/staff/update-email.ts 42 行 decideEmailTarget が role staff／manager 以外を 403（ロックアウト防止）・Auth 設定 4 点（Secure email change・確認必須・レート制限・Site URL）は未決（0930_pm_pre.md ④）。処置＝Auth 設定の後に本人 owner を許可（新メールの確認を client で 1 段）。 **→ 2026-10-13 便 N1013b B-4: 実装は第 2 期・Auth 設定 4 点は Agoora がローンチ前（ゲート表 #6）** |
| 99 | **/mine 勤怠一覧の実働表示を店の計算基準（裁定324 pay_time_basis）に合わせる**（低・**起票 2026-10-01 便 M3-0**・第 2 期） | 本文: 便 M2 の勤怠一覧（lib/nox/mine/attendance-month.ts）は実働＝dayWorkedHours（実打刻の in〜out）で表示している。計算基準 'shift' の店では給与の時給部分が確定シフトの時間に置換される（324-2）ため、一覧の実働と明細の時間が食い違い得る。処置＝第 2 期で表示側に pay_time_basis の分岐（'shift' は確定シフト時間を併記 or 置換）を足す。本便では注記のみ。 |
| 100 | **get_cast_sales（cast_sales_aggregate）が月次で 8 秒超＝給与プレビュー／確定が statement timeout**（高・**起票 2026-10-08 便 G1**・裁定336＝案 A・**0165 本番適用済み 2026-10-08（便 P165）＝live で 6 店の preview 200・NOIR 7,134 ms・get_cast_sales 85 ms＝目視クローズ待ち（Agoora が /demo NOIR owner で給与プレビュー 2026-09 を開く）**） | 本文: cast_sales_aggregate（mig0014 系・STABLE・SECURITY DEFINER・md5 f765c36a）の CTE `groups` が `check_group_due(check_id, pay_group)`（STABLE plpgsql・md5 6c1ef055）を呼ぶが、PG12 以降は 1 回参照の CTE が inline（subquery 化）され、due が後段の join（noms）と window（ranked）の行ごと・参照ごとに再評価される＝N+1 型。実測（NOIR demo org・closed 501 件・owner JWT・timeout off・2026-10-08）: 1 週間 751.6 ms（(check,pay_group) 124）／2 週間 2,102 ms（246）／1 か月 **8,359 ms**（501・Buffers shared hit 1,412,836）＝超線形。due を 0 にした同クエリは 3.6／8.7／**30.6 ms**＝重さは check_group_due の再評価に集中・SubPlan／InitPlan 0（SECURITY DEFINER＝RLS 不適用・index は checks_store_status_idx／check_nominations_check_idx を使用＝index 不足ではない）。`groups as materialized` にすると 1 週間 17.1 ms／1 か月 **95.5 ms**（Buffers 7,931・呼出 501 回＝1.0 倍）＝87 倍。再現: owner で /api/payroll/preview {storeId: NOIR, period: '2026-09'} → 500「get_cast_sales: canceling statement due to statement timeout」（authenticated の statement_timeout 8s）。本番でも月 500 伝票級の店で再現。ゲート: 0165 適用までは NOIR の給与プレビュー／確定は失敗する（visual_check 2-10 は NG 記録扱い）・暫定の app 側回避（collect.ts で窓を 7 日ずつ分割＝月 3〜4 s）は DB 不変だが密度 2 倍の店で再発するため採らない（裁定要）。処置案＝台帳「便 G1 完了」の 3 案（推奨 A＝0165 で `groups as materialized` の 1 語・意味不変・名簿不変）。 |
| 101 | **未来日の確定シフトを days／absentN／シフト基準の時給に数えるか**（低・**起票 2026-10-09 便 X-13d-2b B-4**） | 本文: X-13-27 で未来日（営業日の今日より後）の確定シフトは「不整合」と「退勤なし」から除外した（anomalyFlagsOf）が、matchPunches の days（final ok／late＝未来日は 0）・absentN（未来日は in なし→absent で +1）・shiftHoursByDate（報酬型 shift 基準＝確定シフトの時間）は従来どおり未来日を含む。件数（2026-10-09 読取・docs/tmp/q1009_p167.mjs）＝デモ MUSE 2026-10: 未来日の確定シフト **21**（5 名・126 h）／過去 4・本番 CLUB NOX 2026-10: **57**（6 名・240 h）／過去 25・両店とも pay_time_basis 'punch'（＝シフト基準の時給には現状効かない・absentN は未来日ぶん増える＝罰金撤去（293-3）後は金額に効かず表示「当欠 N」だけ）。処置案＝absentN と shiftHoursByDate も今日までに絞る（lib 1 箇所・payroll suite の fixture は過去日なので pin 不変の見込み）・裁定要。 **→裁定342（2026-10-13 確定・v45 §3・便 V45 で記入）で解決＝クローズ**（未来日は日数・当欠・シフト基準の時給のいずれにも数えない・判定は営業日の終了時点・実装は client＝P169 同乗・次＝起票102） |
| 102 | **フロアの卓で束ねる（seats.parent_seat_id）**（第 2 期・便 W5-2-R R-4・2026-10-13） | 席を卓の子にする＝seats +1 列（parent_seat_id uuid null・親は kind '卓'）・set_seat +1 引数・check_open の「卓で開けたら子席は busy」規則＝裁定要・UI 6 面（register floor 2 階層・席選択モーダル・kiosk・seats-board・analytics 席稼働・demo payload 6 本）・suite seat-reorder／rls／grants の pin。計算は不変（料金は seat_kind）。現行＝seats 1 行＝タイル＋check_seats の相席で足りる（334 の種別表示切替は便 W5-2a で結線） |
| 103 | **kiosk の打刻出し分け（punch_methods.kiosk）**（第 2 期・**起票 2026-10-13 便 LP-R＝便 W5-2b R-6**） | 本文: 店設定 punch_methods.kiosk（0164）が OFF でも /kiosk の打刻は出る（kiosk の腕は stores を読めず、kiosk_punch_state／kiosk_cast_list は punch_methods を返さない＝器なし）。処置案＝kiosk_punch_state の戻りに punch_methods を足す mig（内部で stores を引く・RPC 側で拒否するかは裁定要＝0164 ヘッダ「RPC 側の拒否は裁定要」）→ /kiosk で OFF なら「この店は打刻端末を使っていません」。本人（self）と代行（proxy）は W5-2b で UI の出し分け済み（RPC は拒否しない）。 |
| 104 | **内税表示の金額変換（tax_inclusive_display）**（第 2 期・**起票 2026-10-13 便 LP-R＝便 W5-2b R-3**） | 本文: 店設定 tax_inclusive_display（0164）は W5-2b で「金額表記: 内税」の印（レジ支払方法・給与の期ヘッダー）まで。伝票・レシート・給与明細の金額を税込で表記し直す変換（price_display・check_lines の凍結値は税前・外税店の due 鏡像＝groupDueFull）は計算に触れるため未着手。処置案＝表示層だけの変換（groupDueFull の税額を足して表記・凍結値不変）か、内税店は 0111 の tax_category と price_display 'tax_included' で持つかの裁定。 |
| 105 | **録画の Playwright 自動収録**（第 2 期・**起票 2026-10-13 便 N1013b B-4**） | 本文: 6 店の見せ場（docs/tmp/lp_plan.md L-1 台本）を Playwright で自動収録（devDependency 追加は裁定要）。初回は Agoora の手動収録（public/lp/<store>.mp4・≤4MB・H.264・音なし）。 |
| 106 | **指名 pt の重みとポイント単価**（第 2 期・**起票 2026-10-13 便 N1013b B-4＝lp_plan.md L-4 ①b／①c**） | 本文: pay.ts castPts の重み（本 3／場内 1／同伴 2）は定数・ポイント単価（pt→円）は器なし。処置案＝comp_plans +4 列（pt_hon／pt_jonai／pt_dohan／pt_unit_yen・既定 3／1／2／0＝golden 不変）＋set_comp_plan 引数・pay.ts gross に pt×単価の項（源泉・丸めは裁定要）。準備中チップは撤去済み。 |
| 107 | **売上スライドの粗利基準**（第 2 期・**起票 2026-10-13 便 N1013b B-4＝L-4 ②**） | 本文: product_costs はあるがスライドへ届く経路なし（get_cast_sales は売上・件数のみ・back_snapshot に原価なし・slide_basis の CHECK は 3 値）。処置案＝CHECK に 'gross_profit'＋締め時に原価を凍結（check_lines or back_snapshot）＋get_cast_sales に gross 列。準備中チップは撤去済み。 |
| 108 | **スライド帯の歩合 % 列**（第 2 期・**起票 2026-10-13 便 N1013b B-4＝L-4 ③**） | 本文: comp_plan_slide_check が {at,wage} の 2 キーちょうどを強制＝rate を足せない。処置案＝check を {at,wage,rate?}（0〜100 整数）に緩和＋pay.ts の段→率の合成（売上率テーブル salesBackTable と二重適用しない規則が先）。準備中チップは撤去済み。 |
| 109 | **未達処理の根拠確認記録**（第 2 期・**起票 2026-10-13 便 N1013b B-9**） | 本文: penalty_config に確認記録の器なし（旧 PREP_ITEMS penalty_basis_record）。plan-board の disabled チェック「契約上の根拠を確認した」と準備中チップは撤去（教訓25）。処置案＝penalty_config +confirmed_at／confirmed_by＋set RPC。 |
| 110 | **達成ボーナスの多段しきい値**（**ローンチ前へ前倒し**＝裁定390 と同じ器（0173・params.thresholds の配列化）・2026-10-16 便 HF-1 H-5＝相談役ブロックの番号は「起票109」だが台帳の 109 は未達処理の根拠確認記録＝本行（110）が多段しきい値・**起票 2026-10-13 便 N1013b B-9**） | 本文: comp_plan_components は 100%・1 段固定（旧 PREP_ITEMS achievement_params）。処置案＝params_json に段配列・pay.ts の達成判定を段ごとに。準備中チップは撤去済み。 |
| 111 | **達成条件の他軸（出勤／本指名／同伴）**（第 2 期・**起票 2026-10-13 便 N1013b B-9**） | 本文: 達成ボーナスの目標は売上のみ（旧 PREP_ITEMS achievement_metrics）。処置案＝params_json に metric（days／hon／dohan／sales）＋collect の実績の引き回し。準備中チップは撤去済み。 |
| 113 | **雇用キャスト・スタッフの丙欄（日雇賃金）**（第 2 期・**起票 2026-10-14 便 N1014 X-6**） | 本文: T10 回答（2026-10-14）＝「日払いだから丙欄」ではない・丙欄は日雇賃金の要件（2 か月以内の有期雇用等）を満たす場合だけ・2 か月を超えれば使えない。NOX は雇用の税額表（日額／月額・甲／乙）を 0172（裁定349 案）で持ち、丙欄は雇用期間の要件判定が要るため第 2 期。処置案＝cast_tax_profiles（staff_contracts も）に employment_until date＋税額表 '丙' の分岐と 2 か月超の警告。 |
| 114 | **ノルマ 2 表（cast_quotas／cast_norms）の統合**（第 2 期・**起票 2026-10-14 便 N1014 C**） | 本文: 347 追補2 の★＝cast_quotas（hon／jonai／dohan／sales＝/mine カード・casts-board「今月のノルマ」）と cast_norms（days／dohan／sales／shimei＝comp-sections・達成ボーナスの目標）は別表のまま。本便は days を cast_norms から /mine に引き、達成ボーナスの目標を同じ純関数（個別＞プラン既定＞なし）で解決して整合させた。統合＝1 表 5 軸＋period＋set RPC 1 本＋旧 2 RPC（set_cast_quota／set_cast_norm）の互換＝mig 1 本・UI 3 画面・suite 4 本の張替え。次＝起票115。 |
| 115 | **demo reset の失敗理由を audit に残す**（ローンチ前・**起票 2026-10-15 便 GV-B W-12**） | 本文: 2026-10-14 19:30 の 6 店 reset で 4 店が「reset failed」（最終 chunk の shifts／attendance unique 違反＝E-12）になったが、route の markFailed が書く audit 行（demo.reset failed＋理由）が残っていなかった＝失敗理由は Vercel ログでしか追えない。処置案＝/api/demo/reset の markFailed を try/finally で必ず audit_log_write（action demo.reset.failed・reason＝エラー文の先頭 200 字）→cron_setup.md の読取手順に「failed 行の reason」を足す。次＝起票116。 **★2026-10-19 便 P173: ローンチ前の必須に格上げ・P174 に同乗**＝失敗時に audit demo.reset.failed（理由）＋ホームの帯／お知らせに「デモの初期化に失敗」を出す（10/17〜19 の 3 日連続 load 失敗は cron succeeded・http 200 のため気づかなかった＝便 P173 の【事故】）。 |
| 116 | **statement timeout の観察（Supabase プラン確認待ち）**（ローンチ前・**起票 2026-10-15 便 GV-B W-12**） | 本文: 2026-10-14 の f0 で statement timeout が 3 回（anon-guard 段28／crm-base 段51／product-back-modes＝E-9・再走で緑）＝同日に集中。DB 側の間欠負荷か接続上限か未確定。処置案＝f0 の各 suite に所要秒を出し、timeout の時刻と pg_stat_activity（verify 接続数）を docs/tmp に記録して 1 週間観察→Supabase プラン（compute）の確認後に裁定。次＝起票117。 **追記（2026-10-19 便 P173）**: Nano で f0 2 連の負荷により pooler 枯渇・Unhealthy（10/16 18:00）→ Pro 組織 Agoora-ABE へ移転（10/16 夜・★compute は Nano のまま＝Small の記録は誤り）。10/19 の f0 は 6 走（各 122 段・974〜1,267 秒）で timeout 0。**追記（便 P174・10/19）**: 15:37〜16:07 の f0 run d が 30 段に 1,796 秒（rate-back で作成直後の行が null）→ run e は 1 段目で ECHECKOUTTIMEOUT（Session mode 5432・15 秒）→ 16:19 に認証が 15 秒で完了しない（接続不可）。直前（14:5x）の pg_stat_activity＝idle 15（最長 2 日 21 時間）・active 2（持ち主は未取得＝再起動で消滅）→ Agoora が compute Small へ変更・再起動（16:30・Healthy・接続 19/90）→ 400 ms で復旧。 |
| 117 | **demo_org_reset の load を「payload に無い列は表の既定値」で補う**（ローンチ前・**起票 2026-10-19 便 P173**＝相談役） | 本文: jsonb_populate_recordset は列の既定値を使わない＝NOT NULL 列を足す migration が先に当たると、デプロイ済み payload の load が失敗する（10/17〜19 の 3 日連続・便 P173 の【事故】）。処置＝demo_org_reset の load で payload に無い列は表の既定値（insert の列指定を payload のキーに限る or 既定値で埋める）。器＝0175。E-20 と対。 |
| 118 | **set_comp_plan の audit after_json に全列を記録**（ローンチ前・**起票 2026-10-19 便 P174**＝相談役） | 本文: 「set_comp_plan の audit after_json に全列（判定基準・対象ランク・既定目標 4 軸・slide_apply・区分別固定額を含む）を記録する。器＝0175」。根拠＝便 P174 の CLUB NOX 調べで、これらの列が audit に残っておらず意図した値か戻った値かを判別できなかった（記録は base〜slide_period の 26 キー）。 |
| 119 | **f0 の verify が Session mode（5432）のプールを占有しやすい**（候補・**起票 2026-10-19 便 P174**＝相談役） | 本文: 「f0 の verify が Session mode（5432）のプールを占有しやすい。①suite の接続を終了時に必ず close ②可能な suite は Transaction mode（6543）へ ③f0 の同時接続数に上限」。経緯＝10/19 16:07〜16:19 の run d（遅延）・run e（ECHECKOUTTIMEOUT）→接続不可→compute Small＋再起動で復旧（起票116 追記）。 |
| 112 | **キャスト側ランキングの売上軸（自分の順位）**（第 2 期・**起票 2026-10-13 便 N1013b B-2b**） | 本文: 裁定346 の売上軸は管理側のみ。cast は get_cast_sales で本人行しか読めず（金額の RLS）、順位には他人の額が要る＝RPC（順位と名前だけ返す・金額は本人分のみ or null）が要る＝0172 候補。 **→ 2026-10-14 便 V1014 V-2: 0171 に get_cast_sales_rank を同乗（cast＝自分の 1 行だけ）＝クローズ（裁定346 追補1）** |
| — | **0160 のスコープ＝裁定326-9＋起票95・96**（**便 C-0・2026-09-30**） | 0160＝cast_quotas＋set_cast_quota／予約表の status・requested_by_cast・rejected_reason＋reservation_request／reservation_decide／cast_notice_reads＋既読 RPC／settings_json +7 キー（mine_settings 6＋shift_request_mode）＋起票95（staff_shift_patterns の無効化）＋起票96（T6 契約確認の記録）。起草の前に R160 事前読取（docs/tmp/0160_pre.md）→ ★指定。 |

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

## 次の番号（2026-10-27 便 L 時点）

- **次の M＝M-30**（M-15〜M-19＝Agoora 確定 10/27・M-20〜M-23＝同（3）・M-24＝同（4）・M-25／M-26／M-28／M-29＝Agoora 確定 10/29 で収載済み・M-27 は欠番＝M-17 追補を便 2 に同乗させたため）。
- **次の教訓＝126**（125＝cron と suite の fixture・2026-10-29）。
- **次の裁定＝437**（433＝提案中・本文収載済み・434＝2026-10-27 確定・435＝提案中＝便 K キオスクの機能拡張・436＝提案中＝K-5 打刻ゲート・端末の束縛・退店の失効（0190）・2026-10-29 本文収載済み）。
