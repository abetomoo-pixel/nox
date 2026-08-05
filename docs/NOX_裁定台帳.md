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
