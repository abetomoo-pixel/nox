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

## （参考）本セッションで確定済み・他所に記録済みの裁定

- **台帳#40 原価分離＝案C**（products.cost → product_costs・mig0049/0050・実装完了）＝mig ヘッダに記録済み。
- **モック正本＝responsive 版へ一本化**（B 採用・C 不採用・コミット `020e589`）。
- **文言統一「女の子」→「キャスト」**は段1 調査完了・実装保留中（R-2 コミット待ちで停止した経緯。
  なお「mock に該当なし」の当初報告は pack 見落としによる誤り＝mock に1件あり。実装時は mock も更新対象）。
