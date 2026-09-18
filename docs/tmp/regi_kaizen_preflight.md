# レジ改善パッケージ プリフライト報告（2026-08-18・読み取り専用・変更なし）

対象: ①セット/延長 行分離 ②manual 店の延長導線 ③時間ステータス完全化 ④入金モーダル BANZEN 型 ⑤キャスト選択パネル

供出ファイル（live pg_get_functiondef・LF 正規化済み）:
`live_check_time_charge_apply.sql` / `live_kiosk_register_state.sql` / `live_kiosk_check_detail.sql` /
`live_check_pay.sql` / `live_check_recalc.sql` / `live_check_group_due.sql`

---

## A. ①② の DB 設計材料

### A1. check_time_charge_apply と time_auto 行の構造

- live は 0088 版（供出ファイル参照）。time_auto 行は**合算1行**:
  `kind='time'・pay_group='A'・name='時間料金(セット+延長)'・unit_price=line_total=total・qty=1・fee_kind=NULL`
  （insert 列リストに fee_kind が無い＝NULL）。
- **`check_lines_one_time_auto` = `UNIQUE (check_id) WHERE time_auto`**（live 実測）。
  → **行分離（set 行＋extension 行の time_auto 2本）は構造的に衝突する**。
  ①は「部分ユニークの再定義（例: `UNIQUE (check_id, fee_kind) WHERE time_auto`）＋
  apply の upsert 2本化（on conflict 対象の変更）」＝**DB 改稿必須**。

### A2. fee_kind の受け皿

- CHECK 現物: `fee_kind IN ('set','extension','dohan','hon_shimei','jonai_shimei')`（NULL 可）。
  **'set'/'extension' は 0084 で予約済み・実データは現在 jonai_shimei 5行のみ＝set/extension は0行**。
- 過不足: 列・CHECK とも受け皿は足りる。不足は (a) apply が fee_kind を書いていない
  (b) 部分ユニークが fee_kind を見ていない、の2点＝どちらも ① の改稿範囲。
- 行の自然形の提案材料: set 行= `unit_price=set_fee×units, qty=1`／extension 行=
  `unit_price=ext_fee×units, qty=blocks, line_total=積`（qty>0 CHECK があるため blocks=0 の日は
  extension 行を立てない＝0行）。

### A3. レシートへの波及

- `lib/nox/receipt.ts` は **kind='discount' 以外を明細行としてそのまま印字**（時間料金の特別扱いなし・
  gross/discount の2分類のみ）。テンプレ改修は不要＝行分離すれば自然に2行印字される。
- **verify:nox-receipt 52 の golden fixture に time 行は存在しない**（grep 実測0）＝golden 不変。
- 波及があるのは **verify:nox-pricing-apply**: 段44(3)「time_auto 行1本・line_total=8000」と
  裁定29 で足した段44(3b) 鏡像突合＝①実装時に**書式ごと張り替え**（裁定26 書式）。

### A4. check_recalc / check_group_due の互換性

- recalc = pay_group ごとの group_due 合算 → checks.total 更新。group_due = 「kind≠discount の
  line_total 合計 − discount」＝ **time_auto 行が2本以上でも単純合算＝互換**（live 全文で確認）。
  合計計算側の改修は不要。制約は A1 の部分ユニークのみ。

### A5. manual 店の現運用（実データ・dev 全体）

- time_mode='manual' 店の check_lines 分布: `kind='set'`（time_auto=false）**32行**が時間系の実体
  （name「セット(60分)」31・「セット」1）＝**セットは商品/カスタム行で打つ運用**。
  `kind='time'` は1行のみ＝裁定29 検収の void 伝票の残痕。**延長の実データはゼロ**
  （name に延長/EXT を含む行なし）＝② は「現運用に無い操作を新設する」設計。
- ②の最小案: manual 店の伝票に「延長を追加」ボタン→ `check_add_line`（custom・kind='set'・
  name「延長(N分)」・unit_price=checks.ext_fee スナップ）＝**app のみで可**。ただし
  fee_kind='extension' のタグ付けは check_add_line に引数が無く**不可**＝タグまで求めるなら DB。

## B. ③ の材料

### B6. 0059 読取 RPC の live 全文＝供出済み

- `kiosk_register_state`: checks 配列= id/seat_id/extra_seat_ids/total/**started_at のみ**。
- `kiosk_check_detail`: check= id/seat_id/status/people/nom_type/started_at/total/service_rate/
  round_unit/round_mode（＋time_mode 別キー）。**スナップ5値（set_min/set_fee/ext_min/ext_fee/
  time_per）はどちらにも無い**＝kiosk 追随は**両 RPC への加算的キー追加（DB）**。

### B7. manage 卓一覧の R2 現物と ③ への差分

- 済み: loadOpenMap が set_min/ext_min/time_per/people を取得済み・`timeStatusOf` 純関数・
  30秒 tick・超過バッジ（auto 店のみ・超過時のみ）。
- ③ 差分= (a) セット内もカウントダウン常時表示（表示条件の変更のみ） (b) manual 店にも出す
  =「両モード共通」: checks スナップ5値は**全店で凍結済み**（time_mode 非依存）なので
  **表示自体は app のみで可**。ただし manual 店の set_min は「時間料金は打たないが目安として
  見せる」意味になる＝見せ方の裁定事項。 (c) kiosk= B6 の DB 待ち。

## C. ④ の材料

### C8. check_pay live＝供出済み（要点）

- 引数: `(p_check_id, p_method, p_amount, p_pay_group='A', p_tendered=null, p_idem_key=null, p_method_detail=null)`。
- ガード: method 4値・amount>0・**tendered は cash のみかつ ≥ amount**（'bad tendered'）・
  detail 50字・group_due − paid の残額検証（'no balance'/'exceeds balance'）・idem_key リプレイ対応。
- → BANZEN モーダルの UI 要素（残額既定・均等割り・お預かり・お釣り）は**全て既存引数で表現可＝app のみ**。

### C9. BANZEN 写経元

- **`../makanai-shift/app/(app)/register/register-table.tsx` の入金モーダル（:360-483）**が正本。
  構成: 合計/既入金/残額カード → 手段4ボタン → **均等割り（案イ）= ceil(残額÷N) を入金額に
  セットするだけ**（2〜6分割・最後の人は残額既定＝Σ≥total 保証）→ 入金額（既定=残額）→
  cash のみ「お預かり＋プリセット（ちょうど/1000丸め/5000丸め/10000）＋お釣り表示・不足で
  実行不可」→ 実行。kiosk 縮退版= `app/kiosk/_components/checkout.tsx`。
- NOX との差分: 手段が BANZEN `cash/card/emoney/qr` → NOX **`cash/card/ar/other` 4値＋
  method_detail メモ**（台帳#36）。RPC が `pos_table_pay` → `check_pay`（引数対応は C8 で充足）。
  pay_group（分割会計）は BANZEN に無い NOX 固有＝モーダルに group 選択を残す設計判断が要る。

### C10. NOX 現行の入金 UI

- register-board :1243-1277: **モーダルなしの1行フォーム**（group 入力・method select・
  金額 number（既定 0・残額プリフィルなし）・cash 時お預かり raw input・detail メモ・入金ボタン）。
  お釣り表示は**入金後の履歴行**にのみ（預/釣）。均等割り・プリセット・残額既定なし。
  kiosk も同型フォーム。

## D. ⑤ の材料

### D11. キャスト選択の現 UI と データ源

- 現箇所（manage）: (a) 按分チップ（指名・席タブ・CastAvatar 付きチップ＝タップトグル＋重み入力）
  (b) 指名料・同伴料カードの `<select>`（★着卓を先頭 sort・:875）
  (c) 明細行の claimPick `<select>`（★着卓先頭・選択は制限しない・:1155）。
  kiosk: 按分チップのみ（指名料課金・claim は kiosk 非対象）。
- データ源: page.tsx が `casts(id, name, photo_updated_at)` を取得済み・photoUrls（署名 URL Map）も
  既存。**写真グリッド化の素材は揃っている**。
- 「本日出勤」判定素材: `punches` の SELECT ポリシー= org＋store スコープ
  （owner=org 全店/他=自店・cast のみ本人限定）＝**staff/manager は自店キャスト全員の当日
  punches を直 SELECT 可能**。ペアリング純関数は `lib/nox/punch-io.ts` に既存。
  着卓中= check_nominations（openNoms として取得済み）。→ **⑤は app のみで可**
  （追加コスト=当日 punches の select 1本）。

### D12. CastAvatar 現仕様

- `components/ui/cast-avatar.tsx`: url あり→写真（object-fit:cover・onError で頭文字へ）／
  なし→頭文字＋name 由来 HSL グラデ（variant: gradient=.nox-ava / flat=.nox-ava2）。
  size 指定可＝グリッドの大判表示にそのまま使える。

## E. 報告

### E13. デモ org の open 伝票の現況（実測）

| 卓 | 営業日 | total | lines | payments |
|---|---|---|---|---|
| テーブル4 | 7/27 | 21,000 | 8 | 0 |
| カウンター1 | 7/27 | 263,500 | 9 | **1** |
| カウンター2 | 7/27 | 166,100 | 7 | 0 |
| テーブル1 | 7/29 | 476,300 | 5 | 0 |
| VIP1 | 7/29 | 113,800 | 11 | 0 |
| VIP2 | 7/30 | 20,300 | 5 | 0 |
| テーブル3 | 7/30 | 13,200 | 7 | 0 |
| （テーブル2） | 8/16 | 11,000 | 5 | 0 |

- 旧 open は**7卓**（7/27〜7/30）。テーブル2 は**別セッションが現在検収中**＝治癒対象外。
- ★カウンター1 は **payments 1件あり**＝check_void が入金ありを拒否する場合は
  「入金取消→void」or「close で締める」の分岐が要る＝治癒実装時の論点。

### E14. 実装規模の見積り

**DB 改稿が要る（相談役設計へ）**:
1. ① 行分離: `check_lines_one_time_auto` の再定義（fee_kind を含む部分ユニーク）＋
   `check_time_charge_apply` の 2行 upsert 化（fee_kind='set'/'extension' 書込・
   on conflict 対象変更・旧合算1行からの移行規則=既存 open 伝票の扱い）。
2. ③ kiosk 追随: 0059 読取2本へスナップ5値の加算的キー追加。
3. （②を fee_kind タグ付きでやる場合のみ）check_add_line への fee_kind 引数 or 専用 RPC。

**app のみで可**:
- ② 最小形（custom 行「延長(N分)」＝ext_fee スナップ単価・タグなし）
- ③ manage 分（カウントダウン常時・両モード共通表示＝見せ方の裁定のみ）
- ④ 入金モーダル全部（check_pay 既存引数で充足・NOX 4値+pay_group の意匠差のみ）
- ⑤ キャスト選択パネル全部（検索・出勤先頭=punches 直 SELECT・写真グリッド=既存素材）

**検証の波及**: ①で pricing-apply 段44(3)/(3b) の張り替え必須・receipt golden は不変。
