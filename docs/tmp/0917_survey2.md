# 0917_survey2（読取のみ・2026-09-17 12:02〜12:20 JST・HEAD cb916cc＝origin/main・作業ツリーに 267 途中の変更あり＝不触）

判定の凡例: 実装済み／未実装／一部。「client のみ」＝mig 0・RPC 不触で閉じる見立て。「mig 要」＝無い表・RPC を 1 行で。

---

## a. 裁定259 picker 置換の対象 10 箇所の現状

行番号は 9/15 時点から **10 箇所とも不変**（各ファイルは 259 以後に該当行の前で編集されていない）。

### 台帳 本文（裁定259・逐語・台帳 3370〜3387 行）
> 対象は 10 箇所（キャスト 6・顧客 2・商品 2）。67 箇所中 57 は店舗・期間・区分・席・プラン・ランク・カテゴリ等の短い固定リストで、select のままが正しい＝対象外。ボトルキープの 2 箇所は裁定254 でピッカー化済み。
> 内訳: キャスト 6 = analytics 1176 / customers-board 480 / customer-detail 213 / comp-sections 780 / deduction-panel 195 / sensitive-tax-panel 228／顧客 2 = reservation-panel 527 / 621／商品 2 = mine/drink-claim-form 108 / stock-board 256（絞込）
> 置換先は components/nox/picker.tsx。client のみ・mig 0・RPC 不触。1 レーンで閉じる。R17（前借り・送り実費のキャスト select）・R18（ノルマのキャスト select）は本裁定に含まれる。
> 適用＝未着手（client 1 レーン・相談役の実装ブロック待ち）。

### picker.tsx の API（逐語・components/nox/picker.tsx）
```
export type PickerItem = { id: string; label: string; sublabel?: string; avatar?: { url?: string } | true };
export default function Picker({ items, value, onPick, placeholder = "検索", empty = "該当がありません", limit = 30, dense = false }: {
  items: PickerItem[];
  /** 選択中の id（未選択は null） */
  value: string | null;
  onPick: (id: string) => void;
  placeholder?: string; empty?: string;
  /** 未入力時に出す先頭件数（入力で絞り込んだときは全件） */
  limit?: number; dense?: boolean;
})
```
- 検索: `needle = q.trim().toLowerCase()`・`label.toLowerCase().includes(needle) || (sublabel ?? "").toLowerCase().includes(needle)`（部分一致・label と sublabel）。並びは `label.localeCompare(b.label, "ja")` 固定（呼び出し側の順序は捨てられる）。未入力時は先頭 limit 件＋「先頭 n 件を表示中（他 m 件は検索で絞り込めます）」。
- キーボード: **無し**（onKeyDown／Arrow／Enter の処理 0 件。input で絞り込み後にボタンをクリック／タップ）。
- 空選択: **「未選択に戻す」操作は無い**（value=null は表示上「選択中」が付かないだけ。onPick は id しか渡さない＝空文字の項目を items に混ぜない限り解除できない）。
- disabled: **props に無い**（無効化は呼び出し側で描画を止めるか包む必要がある）。
- 複数選択・グループ化（optgroup）: 無し。

### 10 箇所の逐語（value／onChange／options の型／disabled／空選択）

| # | ファイル:行 | select 逐語（要点） | options の型・絞り込み | disabled | 空選択の扱い |
|---|---|---|---|---|---|
| 1 | analytics-board.tsx:1176 | `<select value={castSel} onChange={(e) => setCastSel(e.target.value)} className="nox-input" style={{ width: "auto", marginTop: 5 }}>` `<option value="">選択してください</option>` `{castOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}` | `castOptions = casts.filter(c => c.is_active && c.store_id === storeId).sort((a,b) => a.name.localeCompare(b.name))`・`type Cast = { id; name; store_id; is_active; photo_updated_at }` | なし | **空を許す**（"" で未選択＝下の 4 スタットは `castSel &&` で非表示） |
| 2 | customers-board.tsx:480 | `<select value={aCast} onChange={(e) => setACast(e.target.value)} style={{ ...input, width: "100%", marginTop: 4 }}>` `<option value="">担当なし（フリー客）</option>` `{addCastOptions.map(...)}` | `addCastOptions = casts.filter(c => c.store_id === aStore && c.is_active)`・`type Cast = { id; name; store_id; is_active }`・親 select（447）の店変更で `setACast("")` | なし（`isManagerUp &&` で描画） | **空が意味を持つ**＝「担当なし（フリー客）」 |
| 3 | customer-detail.tsx:213 | `<select value={assignSel} onChange={(e) => setAssignSel(e.target.value)} style={{ ...input, minWidth: 200 }}>` `<option value="">フリー（担当解除）</option>` `{assignCandidates.map(...)}` | `assignCandidates = cust ? casts.filter(c => c.is_active && c.store_id === cust.store_id) : []` | なし（`canAssign && assignOpen &&`） | **空が意味を持つ**＝「フリー（担当解除）」 |
| 4 | comp-sections.tsx:780（NormTab） | `<select value={castId} onChange={(e) => setCastId(e.target.value)} style={input}>` `<option value="">キャスト選択</option>` `{casts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}` | `casts: CastRow[]`＝`{ id; name }`（絞り込み無し・props の全件） | なし（`isManagerUp ?` で分岐）。保存ボタンは `disabled={!castId \|\| !period}` | 空を許す（初期 ""・保存不可） |
| 5 | deduction-panel.tsx:195（IssuePanel・前借り／送り実費） | `<select value={castId} onChange={(e) => setCastId(e.target.value)} disabled={disabled} style={inp}>` `{casts.length === 0 && <option value="">（対象なし）</option>}` `{casts.map(...)}` | `casts: Cast[]`＝`{ id; name }`・初期値 `useState(casts[0]?.id ?? "")` | **`disabled` prop**（送り実費パネルは `disabled={okuriMode !== "actual"}`・前借りは `disabled={false}`） | **空を許さない**（先頭を既定選択・0 件時のみ「（対象なし）」） |
| 6 | sensitive-tax-panel.tsx:228 | `<select value={castId} onChange={(e) => setCastId(e.target.value)} style={{ ...input, minWidth: 160, marginLeft: "auto" }} aria-label="キャスト">` `{casts.map(...)}` | `casts: Cast[]`＝`{ id; name }`・初期値 `casts[0]?.id ?? ""` | なし | **空を許さない**（空 option 無し・先頭既定） |
| 7 | reservation-panel.tsx:527（編集） | `<select value={eCustomer} onChange={(ev) => setECustomer(ev.target.value)} style={{ ...input, maxWidth: 220 }}>` `<option value="">顧客を選択</option>` `{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}` | `customers: Customer[]`＝`{ id; name; tel }`（`from("customers").select("id, name, tel").eq("is_active", true).order("name")`） | なし（radio `eUseCustomer` で select／自由入力を切替） | 空を許す（未選択）。**tel を sublabel に出せる** |
| 8 | reservation-panel.tsx:621（新規） | `<select value={fCustomer} onChange={(e) => setFCustomer(e.target.value)} style={{ ...input, maxWidth: 220 }}>` `<option value="">顧客を選択</option>` 同上 | 同上 | なし（radio `useCustomer`） | 同上 |
| 9 | mine/drink-claim-form.tsx:108 | `<select value={productId} onChange={(e) => setProductId(e.target.value)} style={inp}>` `<option value="">商品を選ぶ</option>` `{prods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}` | `prods: Product[]`＝`{ id; name; type }`（`from("products").select("id, name, type").in("type", ["drink","champ"]).eq("is_active", true).order("name")`） | なし | 空を許す。**cast 本人画面（/mine）**＝Picker の CastAvatar 依存は不要（avatar 省略可） |
| 10 | stock-board.tsx:256（履歴の絞込） | `<select value={prodFilter} onChange={(e) => { setPage(0); setProdFilter(e.target.value); }} aria-label="商品で絞り込み" style={{ ...input, padding: "6px 9px", fontSize: 12, marginLeft: "auto" }}>` `<option value="">商品で絞り込み</option>` `{products.map(...)}` | `products: MasterProduct[]`（lib/nox/master/queries）・`histOpen &&` で描画 | なし | **空が意味を持つ**＝「絞り込みなし（全件）」。onChange で `setPage(0)` を伴う |

### 置換で挙動が変わる箇所（列挙）
1. **空を「意味のある値」として使う 4 箇所**（#2 担当なし／#3 担当解除／#10 絞り込みなし／#1・#7・#8・#9 の未選択）: Picker に「未選択に戻す」操作が無いため、items の先頭に `{ id: "", label: "担当なし（フリー客）" }` のような擬似項目を足すか、Picker に `allowEmpty`／`onClear` を足す設計判断が要る。特に #3 は「解除して保存」が主用途。
2. **並び順**: Picker は `localeCompare("ja")` 固定。#1 は同じ name 順だが、#5／#6／#4 の props 順（casts の並び）は捨てられる（実害小）。
3. **disabled（#5）**: Picker に disabled prop が無い。送り実費パネルは `okuriMode !== "actual"` で select 自体を無効化しているため、置換時は包み要素で `pointer-events: none`＋opacity にするか prop を足す。
4. **既定選択（#5／#6）**: select は `casts[0]` を既定選択し空を許さない。Picker は value=null で始められるが、既定を残すなら初期 state は据え置きで可（表示は「選択中」バッジ）。
5. **面積**: select 1 行 → Picker は入力欄＋最大高 300px（dense 220px）の一覧。#1（label 内・幅 auto）・#6（見出し右の `marginLeft: "auto"`）・#10（行内の絞込・`marginLeft: "auto"`）はレイアウトの器を変える必要がある（裁定254 のボトルキープは Modal 内に置いた）。#7／#8 は radio 切替の中に置く。
6. **onChange の副作用（#10）**: `setPage(0)` を onPick に移す。#2 は親 select（店）で `setACast("")` している＝Picker の value を null に戻す形へ。
7. **cast 本人画面（#9）**: Picker は CastAvatar を import するが avatar 省略で描かない＝/mine でも使える。tel／type を sublabel に出せる（#7／#8＝tel、#9＝type）。
8. **複数選択・グループ化を使っている箇所は 0**（10 箇所とも単一選択・optgroup 無し）。

---

## b. M 群（M1 第 2 レーン・M15・M17・M4・M11・M12・M13・M5）

### 本文の所在
- 台帳に逐語があるのは **M1〜M8（裁定247・台帳 3249〜3253 行）と M1 第 2 レーンの定義（裁定251・3270〜3278 行）、M9（裁定252）** のみ。**M11〜M21 の本文は台帳に無く、handoff v32 §5（docs/handoff/NOX_相談役引き継ぎ_2026-09-15_v32.md 72〜76 行）にしか無い**（台帳 grep `\bM15\b`／`\bM17\b`＝0 件。台帳の「M11」「M13」「M17」「M4」「M5」ヒットは裁定154／158 のホーム v2.1 写像行（別番号体系）で本件ではない）。

### 逐語
- 裁定247（台帳）: 「244 の「モバイル専用 @media は置かない」を改定し、モバイルに限り @media を可とする。課題は M1 横スクロールで画面が左右に動く（表の実幅がページ幅を決めている・フレックス子の min-width:0 欠落が疑い）／M2「その他」メニューのドロワーが崩れる（背景・z-index・dvh）／M3 領収書 QR が小さい／**M4 244 で中央化した行のボタンが段積み・文字が折返す**／**M5 2 ペインのモーダル（シフト追加）がスマホで機能しない**／M6 日報の表の列見出しが縦に潰れる／M7 下タブと Safari ツールバーの重なり（safe-area-inset-bottom）／M8 KPI カードの列数とラベル折返し。着手順は M1・M2 を 1 レーンで直して再撮影 → M3〜M8。」
- 裁定251（台帳・M1 第 2 レーンの定義）: 「M1: 表は共通クラス .nox-tablewrap { overflow-x:auto; max-width:100%; -webkit-overflow-scrolling:touch } で包む。第 1 レーンは report-board の 3 表（989 プレビュー・1243 締め済み一覧・699）。潰れ型（列数が多く th が 1 文字ずつ折り返す表）は th に white-space:nowrap を併用し、包んだ上で横スクロールさせる。html／body への overflow-x:hidden は入れない（はみ出しを隠すと残りの表の発見が遅れるため）。**残り 21 表と .nox-ptwrap の hidden→auto は第 2 レーン。**」適用欄:「第 2 レーン＝docs/tmp/m1_lane2.md（21 表＋.nox-ptwrap 8 表）」
- v32 §5（handoff・逐語）: 「未 | M3 QR 小／M4 ボタン段積み・文字折返し(送り方式の切替が実例)／**M5 シフト追加モーダルが 2 ペインで機能しない**／M6 日報表／M7 下タブと safe-area／M8 KPI 列数／M11 register 卓ヘッダ(軽微・要再現)／M12 ヘッダ整理(ロゴ・歯車・オーナー→ログアウト)／M13 メニュー再編／M14 ノルマ白紙(再現せず・要確認)／M15 タブ行の切れ／M16 控除ルール表／M17 端末発行の 2 カラム／M18 機能フラグ表(操作列あり)／M19 analytics キャストタブ／M20 源泉納付表(操作列あり)／M21 キャスト別ノルマ表」「M12/M13 の線引き(9/14 合意): 下タブ=ホーム/レジ/日報/シフト/その他・その他=キャスト/スタッフ/顧客/給与/分析/領収書/在庫追加・歯車=マスタ/お知らせ/監査/ご契約/ログアウト。ヘッダ左にロゴ。」v32 §4-5:「M1 第 2 レーン: 残り 21 表 + .nox-ptwrap 8 表。横スクロールで済む表(M6/M16/M19/M21)とカードに落とす表(M18/M20)を分ける」

### 判定

| 項目 | 実装状況 | client のみ or mig 要 | 根拠ファイル:行 |
|---|---|---|---|
| M1 第 2 レーン（21 表＋.nox-ptwrap 8 表） | **未実装**（21 表とも横スクロール容器なしのまま・.nox-ptwrap は overflow hidden のまま） | client のみ（globals.css＋各 tsx の包み） | analytics-board 3 表 wraps 0／comp-sections 8 表 wraps 0／plan-editor・seats-board・payment-panel・payroll-board 2・register-board 2・kiosk-register 2・mine/ranking・simulator-panel（全て wraps 0）；`.nox-ptwrap { … overflow: hidden; }` globals.css:1734（1824 の 900+ で visible）。第 1 レーンの report-board は wraps 4／3 表で済 |
| M4 ボタン段積み・文字折返し | **未実装**（`.nox-actions { display:flex; justify-content:center; gap:8px; flex-wrap:wrap }` globals.css:1334 のまま・モバイル @media の追加なし。実例の「送り方式の切替」＝deduction-panel.tsx:82〜83 の 2 ボタンは inline style のみ） | client のみ（CSS） | globals.css:1334・deduction-panel.tsx:82-83 |
| M5 シフト追加モーダル 2 ペイン | **未実装**（`gridTemplateColumns: "230px minmax(0,1fr)"` の inline grid・@media 無し＝狭幅でも 2 列） | client のみ（.nox-2pane 化＝globals.css:855 に `@media (max-width: 900px) { .nox-2pane { grid-template-columns: 1fr } }` が既に存在） | shift-add-form.tsx:365 |
| M11 register 卓ヘッダ（軽微・要再現） | **未実装**（要再現＝課題内容が未確定） | client のみ見込み | — |
| M12 ヘッダ整理（ロゴ・歯車・オーナー→ログアウト） | **未実装**（nav.tsx は下タブ 4 本＋「その他」シートのみ。歯車・ロゴ・ログアウト集約の器なし） | client のみ | components/ui/nav.tsx:9・43・68〜77 |
| M13 メニュー再編（下タブ＝ホーム/レジ/日報/シフト/その他・その他＝…・歯車＝マスタ/お知らせ/監査/ご契約/ログアウト） | **未実装**（`spPriority` で最大 4 本＋残りを「その他」に自動で回す現行設計。歯車の分類なし） | client のみ（nav.tsx＋各 layout の NavGroup 定義） | components/ui/nav.tsx:43・82〜100 |
| M15 タブ行の切れ | **未実装**（タブ行＝`.nox-subnav2 { display:flex; gap:6px; flex-wrap:wrap }` globals.css:1061 は折返し型・`.nox-seg { display:flex; … overflow:hidden }` globals.css:805 は切り落とし型。641 以下の `.nox-subnav button { min-width:96px }` globals.css:2139 のみ。どのタブ行が「切れ」たかは v32 に画面名なし＝再現待ち） | client のみ（CSS） | globals.css:805・1061・2139 |
| M17 端末発行の 2 カラム | **実装済み扱いが妥当**（`.nox-2col nox-2col--32` で包み、`@media (min-width: 900px)` でのみ 2 列＝900 未満は 1 列。v32 の起票は 9/11 のスクショ由来で、現行コードは 1 カラム化済み。実機再撮影で確認クローズ） | client のみ（確認のみ） | kiosk-device-panel.tsx:6・161・globals.css:1108・1110 |

---

## c. R6・R11・R15・R19

### 逐語
- R6（裁定253 D・台帳 3293〜3295 行）: 「R6 /staff のスタッフ編集の項目が名前のみで不足（メールアドレス・LINE 等。メールは auth 更新の経路、LINE は器の有無から調査）」→ 裁定267（本日確定・台帳未収載）で「配属店＝追加なし／メール＝admin route 1 本／LINE＝対象外」。
- R11（同）: 「R11 キャッチ入店時の紹介料＝金額は都度入力・人数単位（単価×人数）・紹介者を記録（自店＝キャスト／黒服から選択、外部＝自由入力の両方）・記録先は明細行・集計の出口は分析の節。check_lines への列追加を伴う見込み。」v32 §6:「R11 キャッチ紹介料(…check_lines に列 3 + kind 'referral' + 専用 RPC + 集計 RPC)」
- R15（裁定253 E）: 「R15 シフト画面の情報設計の見直し（「確定」の語が計画の公開・行の confirmed・確定シフトタブで別の意味に使われ、5 タブを 3 往復する導線になっている。タブ構成の畳み込みを別裁定で設計）。」
- R19: **台帳に本文なし**（grep `R19`＝0 件）。handoff v32 §6 のみ:「**R19** キャスト別ノルマをキャスト側からも設定」。

### 判定

| 項目 | 実装状況 | client のみ or mig 要 | 根拠ファイル:行 |
|---|---|---|---|
| R6 スタッフ編集の項目 | **一部**＝裁定267 レーンが作業ツリーで進行中（未コミット: app/api/staff/update-email/route.ts・lib/nox/staff/update-email.ts・staff-board.tsx の「メールを更新」・scripts/verify-nox-staff-email.ts）。HEAD cb916cc 時点では未実装 | client のみ（mig 0・裁定267-2） | git status（本便は不触）・staff-board.tsx 239〜292（HEAD の編集モーダル＝名前・異動・解除・役職・再雇用のみ） |
| R11 紹介料 | **未実装**（app／lib／migrations に `referral`／`紹介料` 0 件） | **mig 要**＝check_lines に 3 列（紹介料単価・人数・紹介者）と kind 'referral'・専用 RPC（明細行の追加）・集計 RPC（分析）が無い | grep 0 件（app・lib・supabase/migrations） |
| R15 シフト画面の情報設計 | **未実装**（タブは today／calendar／roster／build／queue の 5 本のまま・第 2 期） | client のみ見込み（設計裁定が先） | shift-board.tsx（setTab の値 5 種） |
| R19 キャスト側からのノルマ設定 | **未実装**（/mine は norm-card.tsx の表示のみ・rpc 0 件。set_cast_norm は owner／manager 限定＝`if not (public.auth_role() = 'owner' …` で cast を通さない） | **mig 要**＝cast セルフ用の set_cast_norm（auth_cast_id 本人チェック付き）が無い。既存 set_cast_norm を cast に開くなら prosrc 改定 mig | app/mine/norm-card.tsx（rpc/from 0 件）・supabase/migrations/0042_norm_expansion_okuri_base.sql:22〜46 |

---

## d. 0147 繰越の関連本文と「繰越残高を表示できる既存の口」

### 逐語
- 裁定258-8（台帳 3351〜3352 行）: 「258-8 差引後マイナスを許す。0146 時点では net=0 で止め、超過額は計算して保持するが消費しない。繰越の消費は 0147（別裁定）」
- 裁定264-11（台帳 3468〜3474 行）: 「264-11 net 0 床は恒等式を壊さない形で置く。超過額を PayResult の adjustOverflow として明示し恒等式 net = gross − totalDeductionsOf(pay) + adjustOverflow を core.ts で閉じる。凍結は breakdown_json に数値 1 キーのみ（DB 列は作らない＝0147 が読む）。右パネルに赤注記「超過 ¥X は当 run で回収されません」。明細には出さない。追補（同日承認）: 0 床は調整控除が食い込む分に限定する＝overflow = min(調整合計, −netRaw)。調整行が無い run の net は従来どおり（負を含む）不変。既存の負 net の扱いは第2期。」
- v32: §8 に 0147 の記述 **なし**（v32 は「mig は 0143〜0145 で打ち止め」の段階）。
- v33 §3:「mig は 0146 で打ち止め…0147(繰越)は 0146 の client が実機を通ってから。」§8:「**0147 の残る 1 点**: 繰越残高の可視化(給与の月次一覧に列を足すか専用の節か)。B5 の画面を見てから」
- v34 §3:「0147(繰越)は §4。」§4-5:「0147 繰越: 前提「0146 が実機を通る」は本番反映で満たした。残る判断は繰越残高の可視化(§8)」§8:「**0147 の残る 1 点**: 繰越残高の可視化(給与の月次一覧に列を足すか専用の節か)。/payroll 右パネルの超過注記を見てから」

### 既存の口（payslips.breakdown_json を読んでいるか・adjustOverflow の扱い）

| 口 | breakdown_json を読むか | 読む範囲 | adjustOverflow | 根拠 |
|---|---|---|---|---|
| 給与の月次一覧（/payroll 一覧・payroll-list） | 読む | `select("run_id, cast_id, net, breakdown_json")` → list.ts の `grossOf(breakdown_json)`（pay.gross＋Σextras）と net だけ | **読まない**（列を足すなら list.ts に `overflowOf` を足し合計列＝client のみ） | app/(manage)/payroll/payroll-list.tsx:54〜58・lib/nox/payroll/list.ts |
| /payroll 右パネル（payroll-board） | 確定後サマリは読む（148〜170: `breakdown_json.pay` の Σ）。プレビュー時は draft の pay をそのまま | pay 全キー | **プレビューの pay.adjustOverflow を赤注記で表示済み**（804〜806「超過 ¥X は当 run で回収されません」）。確定後サマリ（Σ）には未加算 | payroll-board.tsx:42・148〜170・804〜806 |
| 明細（PayslipSlip＝/payroll 明細印刷・/mine 共用） | 読む | `payOf(breakdown_json)`・extras・ar/adv/okuri・`readFrozenAdjustments`（adjustments／adjustments_hidden） | **意図的に出さない**（264-11「明細には出さない」・pa(7-7) が「超過」不在を assert） | components/payslip-slip.tsx:38〜56 |
| /mine（cast 本人） | 読む | `select("period, net, breakdown_json")` → PayslipSlip へ素通し | 明細と同じ＝出さない | app/mine/page.tsx:93〜99・179 |
| CSV（export-csv） | 読む | `breakdown_json.pay`・extras | 読まない（csv.ts の PayrollCsvPay は部分集合） | app/(manage)/payroll/export-csv.ts:18〜42・lib/nox/payroll/csv.ts:12〜31 |
| 分析／月報の人件費 | 読む | `pay.gross` のみ | 読まない | analytics-board.tsx:246・month-report.tsx:115・lib/nox/payroll/labor-cost.ts |

前提の確認: finalize は `pay.adjustOverflow` を数値のまま凍結（app/api/payroll/finalize/route.ts:43 注記）。調整の無い run はキー自体を足さない（adjust.ts:74・pa(7-3)）＝読み手は `Number(bj?.pay?.adjustOverflow ?? 0)` の欠落許容が要る（labor-cost.ts:20〜22 の `gross` 読みと同型）。**繰越残高の可視化は 4 口とも client のみで足せる**（凍結値の合算＝再計算なし）。消費（翌 run で引く）は 0147 の mig（collect の読取＋payOf 入力）＝別裁定。

---

## f. /shift 今日タブ（shift-board）の遅刻分数・出勤打刻・KPI 算出・区分ボタンの書き先

### 遅刻分数の表示
**無し**。行に出るのは「最終 in 打刻の時刻」だけ（`{punchIn.get(s.cast_id)}打刻`＝例「20:01打刻」・shift-board.tsx:1072〜1076・裁定222）。確定開始との差（分）は計算も表示もしていない（`分遅刻`／`lateMin` 等 0 件）。

### 行に出勤打刻時刻を出すのに必要な取得
**既存の punches 読取で足りる**。今日タブは表示日の打刻を既に引いている:
```
supabase.from("punches").select("cast_id, type, punched_at")
  .eq("store_id", storeId).gte("punched_at", startIso).lt("punched_at", endIso).order("punched_at")   // 764〜771
```
- 列＝cast_id・type（'in'|'out'）・punched_at（timestamptz）。粒度＝営業日窓（`bizDateRange(todayDate, cutoff)`）の全打刻行を `punchRows` に保持し、`punchIn` は「最終 in の HH:MM 文字列」（out が後なら削除＝打刻中のみ表示）。
- 遅刻分数を出すなら `punchRows` の in と `s.start_hm`（暦日 00:00 JST＋start_hm・30 時間制）の差を行で計算するだけ＝新規取得なし。punch-match.ts の `matchPunches` の結果 `final.type==='late'` も行ごとに得られる（817〜823 と同じ呼び出し）。

### 上部「遅刻 n 人／未着 n 人」の算出（逐語・806〜828）
```
const todayCounts = (() => {
  const list = shiftsOn(todayDate);
  const nowMs = Date.now();
  const base = Date.parse(`${todayDate}T00:00:00+09:00`);
  let arrived = 0, late = 0, missing = 0, absent = 0;
  for (const s of list) {
    const st = attOf(s.cast_id, todayDate)?.status;
    if (st === "shukkin" || st === "dohan") { arrived += 1; continue; }
    if (st === "absent") { absent += 1; continue; }
    if (st === "off") continue; // 休み＝数えない
    const mine = punchRows.filter((p) => p.cast_id === s.cast_id).map((p) => ({ punched_at: p.punched_at, type: p.type }));
    const r = matchPunches({
      ...buildMatchInput({ punches: mine, shifts: [{ date: todayDate, start_hm: s.start_hm, end_hm: s.end_hm }],
        attendance: st === "late" ? [{ date: todayDate, status: "late" }] : [], cutoffHm: cutoff }),
      config: { lateGraceMin, close: s.end_hm },
    });
    const fin = r.days.find((d) => d.bizDate === todayDate)?.final;
    if (fin?.type === "late") late += 1;
    else if (fin?.type === "ok") arrived += 1;
    else if (nowMs >= base + (hm2min(s.start_hm) + lateGraceMin) * 60_000) missing += 1; // 打刻なし ∧ 猶予経過
  }
  return { planned: list.length, arrived, late, missing, absent };
})();
```
閾値 `lateGraceMin` は `supabase.from("penalty_config").select("late_grace_min").eq("store_id", storeId).maybeSingle()`（787）・既定 `LATE_GRACE_MIN_DEFAULT`（punch-match.ts）。KPI 描画は 1007〜1008（`["遅刻", todayCounts.late, …]`・`["未着", todayCounts.missing, …]`）。

### 行の「遅刻」区分ボタンが書く先（逐語）
- ボタン群（1050〜1058）: `ATT_OPTIONS = [["shukkin","出勤"],["late","遅刻"],["absent","当欠"],["dohan","同伴"],["off","休み"]]`（103）。`onClick={() => { if (!on) void setAtt(s.cast_id, v); }}`（1056）。
- setAtt（560〜568）:
```
const { error } = await supabase.rpc("attendance_set", {
  p_cast_id: castId, p_date: attDate, p_status: status, p_eta: null, p_reason: null,
});
```
書き先＝**attendance 表の status 列**（RPC attendance_set・値域 5 値・eta と reason は今日タブからは null）。読み戻しは `from("attendance").select("cast_id, date, status, eta")`（402）。punches には書かない（punches へ書くのは R20-b の `proxyOut` → punch_proxy 'out' のみ・1077〜1085）。

---

## g. 初期設定 STEP 3 の 9 制度（読取のみ・2026-09-17 12:11〜12:25 JST）

出典＝mock/onboarding-2026-08/step3.html の可視文言（逐語）: 「採用する待遇制度｜複数選択｜時給・最低保証（基本時給 3,000円/h）／各種バック（本指名 / 同伴 / ドリンク）／売上歩合（基本 5%）／ポイント制（本指名・同伴・売上等）／売上スライド（売上帯で時給・歩合を変更）／ポイントスライド（pt帯で待遇を変更）／ノルマ（出勤 / 本指名 / 同伴 / 売上 / pt）／罰金・控除（遅刻 / 欠勤 / 送り等）／達成ボーナス（出勤 / 売上 / 指名達成）」「親カテゴリ → 個別項目 → 値入力の3段階で設定します。ノルマあり・売上ノルマなし、のような組み合わせを表現できます。」

### (1)(2)(3) 制度別の表・列と管理画面の節

管理画面の主戦場は /master/cast-comp/plan（plan-board.tsx のタブ＝base「基本・保証」／backs「歩合・バック」／slides「スライド・ポイント」／quota「ノルマ・ボーナス」／sim／assign・24〜29 行、`show={{ base, backs, slides, achieve }}` で plan-editor の節を出し分け・162 行）と comp-sections.tsx の各 Tab（PlanTab 252／AssignTab 483／NormTab 741／DeductionTab 803／PenaltyTab 884／BackTab 930）。cast 単位の設定は cast_plan（cast_id・plan_id・overrides_json・valid_from／valid_to）＝プラン割当＋上書き（set_cast_plan(p_cast_id, p_plan_id, p_overrides jsonb, p_valid_from)）と cast_norms の 2 表に集約され、他は store 単位（comp_plans・penalty_config・deductions・custom_back_defs＝store_id 列）。

| 制度 | (1) 表・列（cast 単位の所在） | (2) 管理画面の節（ファイル:行）／出し分けで隠す対象の数 | (3) 器 |
|---|---|---|---|
| 時給・最低保証 | comp_plans.base（保証時給）＋comp_plan_components kind='guarantee_min'（mode／amount／params {period:'month'}）。cast 単位＝cast_plan.overrides_json（mig0086 の 8 キー・base を含む） | plan-editor.tsx:269〜（② 基本・保証・SecHead 271「時給と保証条件を設定します」・275「保証時給」・最低月額保証は「使う」で開く 153）／plan-board タブ base（24）＝**2 箇所**（タブ 1・節 1） | あり |
| 各種バック（本指名／同伴／ドリンク） | comp_plans.hon_back／jonai_back／dohan_back（定額）＋hon_back_mode／hon_back_rate・jonai_*・dohan_*（fixed/rate・mig0114）＋product_back_mode／product_back_rate／product_back_fixed（mig0132）。商品側＝products.back_mode／back_value／hon_pt（set_product）。cast 単位＝cast_plan.overrides_json | plan-editor.tsx:292〜（③ 歩合・バック・SecHead 294 keys honBack…productBack）／plan-board タブ backs（25）／商品側 /master/products（set_product の back_mode 列）＝**3 箇所** | あり |
| 売上歩合 | 同上の *_back_mode='rate'（率バック＝裁定D3・母数は指名料金／売上）＋custom_back_defs basis='sales'（value・cond_json） | plan-editor ③ 歩合・バック（292〜・mode 切替）＋BackTab（comp-sections.tsx:930〜・カスタムバック basis 選択 977／991）＝**2 箇所**（③ と共有） | あり（「基本 5%」の単独スイッチは無く *_back_mode の値で表現） |
| ポイント制 | products.hon_pt（商品 pt・set_product p_hon_pt）＋comp_plans.point_slide（jsonb 3 段・basis pt）＋custom_back_defs basis='pt'／'champCnt'／'bottleCnt' | plan-editor ④ スライド・ポイント（388〜・SlideInput「ポイントスライド（3段）」399）／products の pt 列／BackTab basis pt＝**3 箇所** | あり（pt の付与は products.hon_pt・集計は payOf） |
| 売上スライド | comp_plans.sales_slide（jsonb 3 段・comp_plan_slide_check(p_slide)）。cast 単位＝cast_plan.overrides_json（salesSlide キーは無い＝プラン単位のみ） | plan-editor ④（388〜・SlideInput「売上スライド（3段）」398）／plan-board タブ slides（26）＝**1 箇所**（④ をポイントスライドと共有） | あり |
| ポイントスライド | comp_plans.point_slide（同上） | 同上 SlideInput 399＝**1 箇所**（④ 共有） | あり |
| ノルマ | cast 単位＝cast_norms（cast_id・period・days_target・dohan_target・sales_target・shimei_target・set_cast_norm 6 引数）。店単位＝penalty_config.norm_on／norm_days_flat／norm_days_per／norm_dohan_flat／norm_dohan_per（未達罰金）＋stores.settings_json.sales_norm_enabled／shimei_norm_enabled／shimei_norm_scope（set_store_norm_config・mig0042） | NormTab（comp-sections.tsx:741〜・キャスト select 780＝裁定259 #4）／norm-config-panel.tsx:54「売上・指名ノルマの採用」／PenaltyTab（884〜・norm_* 5 列）／plan-board タブ quota（27）／/mine/norm-card.tsx（本人表示）＝**5 箇所** | あり（「pt ノルマ」は列なし＝cast_norms に pt_target が無い） |
| 罰金・控除 | penalty_config.fine_absent／fine_late／hours_per_shift／late_grace_min／early_grace_min／over_grace_min（店）＋deductions（店・name／amount／per／kind 6 値 'unworked','sanction','statutory','agreed_cost','store_receivable','advance_settlement'・basis_confirmed_*）＋advances／transport（前借り・送り実費＝deduction-panel）＋payroll_adjustments（run 別・cast 別＝裁定258／264）。cast 単位＝payroll_adjustments と advances／transport のみ | PenaltyTab（comp-sections.tsx:884〜）／DeductionTab（803〜）／/master/cast-comp/deduction（deduction-board.tsx＋deduction-panel.tsx 195＝前借り・送り実費・裁定259 #5）／/payroll 右パネル「調整控除」節＝**4 箇所** | あり |
| 達成ボーナス | comp_plan_components kind='achievement_bonus'（mode／amount／params {thresholds:[{pct,add}]}・priority・is_active）。cast 単位＝なし（プラン単位） | plan-editor.tsx:406〜415（⑤ 達成ボーナス・CompRows kind="achievement_bonus"）／plan-board タブ quota（27）＝**1 箇所** | あり（1 段固定「達成100%・1段（固定）」79 行＝多段は未実装） |

出し分けで隠す対象の合計＝plan-board のタブ 4（base／backs／slides／quota）＋plan-editor の節 4（②③④⑤）＋comp-sections の Tab 4（Norm／Deduction／Penalty／Back）＋norm-config-panel 1＋/master/cast-comp/deduction 1＋products の back／pt 列 1＋/mine/norm-card 1＝**16 箇所**（重複を除く）。制度名と器の対応で「器が無い」ものは無し。ただし (a)「pt ノルマ」（cast_norms に pt 列なし）(b) 達成ボーナスの多段（1 段固定）(c)「売上歩合」の単独 ON/OFF（*_back_mode の値で表現）の 3 点は部分的。

### (4) 店舗単位で ON/OFF を持てる既存の器
- feature_flags の store_id 行: あり（org 既定行＋store 行の 2 層・flag_enabled(p_key, p_store_id)／flag_set 4 引数・owner 限定）。ただし **key は CHECK で 4 値固定**（'staff_shift','reopen_flow','qr_order','notify'＝mig0135:91）＝待遇制度の ON/OFF を載せるには CHECK 改定の補正 mig が要る。live の行は 2（staff_shift・reopen_flow とも NOX-DEMO の org 既定行・store 行 0）。
- stores の列: dohan_auto_hon／ext_shimei_enabled（boolean・set_store_profile 白名単）・time_mode／price_display 等の text。settings_json の既存キー＝okuri_mode／okuri_base_amount／biz_cutoff_hm／cast_register_enabled／shift_cast_confirm／sales_norm_enabled／shimei_norm_enabled／shimei_norm_scope／printer_enabled／pin_lock_max_fail 等（live の CLUB NOX は okuri_mode・biz_cutoff_hm・cast_register_enabled の 3 キーのみ）。set_store_profile(p_store_id, p_patch jsonb) は **白名単 8 キー固定**（裁定250: name／short／ext_shimei_enabled／dohan_auto_hon・settings_json の store_code／display_name／show_open_status／shift_cast_confirm）＝制度スイッチ（例 comp_features_json）を settings_json に足すなら「白名単に 1 行足す補正 mig」（裁定250 の方式）。
- penalty_config.norm_on（boolean・店）と set_store_norm_config の 3 値は「ノルマ」だけ既に店単位 ON/OFF を持つ。

---

## h. 初期設定ウィザードの受け皿

| 項目 | 現状 | 根拠 |
|---|---|---|
| (1) owner の初回ログイン判定 | **専用の列・フラグは無し**（app／lib／migrations に onboard／wizard／first_login／setup_done 0 件）。使える既存状態＝stores.created_at（timestamptz・全店にあり）／stores.settings_json の空（NOX-VERIFY-A2／B1 は null）／pricing_rules 0 件／comp_plans 0 件／seats 0 件／business_hours 0 件。「store_profile 未設定」は表ではなく stores の列（name／short／settings_json.store_code 等）＝未設定＝空文字・null | information_schema（stores 30 列）・grep 0 件 |
| (2) 業態列 | **無し**（stores／settings_json に business_type／store_type 相当なし。cabaret／girlsbar 等の語は app・lib・migrations に 0 件・モック step1-*.html にのみ存在）。持たせるなら settings_json.business_type（白名単に 1 行＝補正 mig）か stores 列追加 mig | grep 0 件・mock/onboarding-2026-08/step1-{bar,cabaret,girlsbar,lounge,snack}.html |
| (3) 料金の初期値を一括で書く RPC | **一括 RPC は無し**。料金は 1 行ずつ: set_pricing_rule(p_id uuid, p_store_id uuid, p_fee_kind text, p_seat_kind text, p_dow_mask integer, p_time_from_min integer, p_time_to_min integer, p_rank_id uuid, p_amount integer, p_duration_min integer, p_priority integer, p_is_active boolean, p_name text, p_tax_category text, p_category_id uuid…)／set_pricing_category(p_id, p_store_id, p_name, p_sort, p_is_active)／pricing_rule_reorder(p_store_id, p_fee_kind, p_ids uuid[])／delete_pricing_rule(p_id)。店の基本料金＝set_store_pricing(p_store_id, p_hon_fee, p_jonai_fee, p_dohan_fee, p_service_rate, p_card_tax_rate, p_round_unit, p_round_mode)／set_store_time_pricing(p_store_id, p_set_min, p_set_fee, p_ext_min, p_ext_fee, p_time_mode, p_time_per)／set_store_tax_config(6 引数)。一括の前例＝product_bulk_insert(p_store_id, p_items jsonb)（商品 CSV）＝「業態別テンプレート」を書くなら同型の pricing_bulk_insert(p_store_id, p_items jsonb) を mig で新設するか、client から set_pricing_rule を N 回呼ぶ（非原子） | live pg_proc（set_%／%pricing%） |
| (4) STEP 4 会計方式（卓／個別／併用） | **相当する設定・列は無し**（app・lib・migrations に 卓会計／個別会計／bill_mode 等 0 件。register の「併用」は支払方法の分割払いの導線＝別概念・register-board.tsx:1727〜1762）。checks は席（seat_id）単位＋people 列で、個別会計は check_split／merge（check_merge RPC）で運用。持たせるなら settings_json.bill_mode（白名単 1 行＝補正 mig）。STEP 4 の「使う機能」＝NOXレジ／キオスク／QR注文／キャスト自動紐付け のうち、QR注文＝feature_flags 'qr_order'（既存 key）・キオスク＝kiosk_devices の有無・キャスト自動紐付け＝settings_json.cast_register_enabled（set_store_cast_register）に対応 | grep 0 件・mock step4.html 逐語「会計方式｜卓会計（卓単位で注文・会計）｜個別会計（お客様単位）｜併用（必要時だけ分割）」 |
| (5) /master のタブ構成 | lib/nox/master/nav.ts の 4 群: 概要（/master）／商品・料金（商品・商品カテゴリ・在庫・料金設定）／店舗・端末（席・卓・営業時間・スタッフ・システム）／**キャスト・報酬**（概要 /master/cast-comp・待遇プラン /master/cast-comp/plan・控除・送り /master/cast-comp/deduction・ノルマ /master/cast-comp/norma・キャスト会計 /master/cast-comp/register）。「報酬制度」タブ＝**キャスト・報酬群の pages に 1 行足す**（nav.ts 42〜49・例 { label: "報酬制度", href: "/master/cast-comp/features" }）＋cast-comp/page.tsx のハブカード（5〜14 行の 4 枚）に 1 枚。plan-board のタブ（base〜assign）は待遇プラン内のタブで群とは別層 | lib/nox/master/nav.ts:42〜49・app/(manage)/master/cast-comp/page.tsx:5〜14・plan-board.tsx:24〜29 |
| (6) R15 本文（v32 §6 逐語） | 「R15 シフト画面の情報設計(第2期)」（未の行）。253 E の台帳本文＝「R15 シフト画面の情報設計の見直し（「確定」の語が計画の公開・行の confirmed・確定シフトタブで別の意味に使われ、5 タブを 3 往復する導線になっている。タブ構成の畳み込みを別裁定で設計）。」v32 §7:「第2期 21(v26 §3 の 5 件 + B6-3 + 245-4 + 起票 13 + R15)」 | docs/handoff/NOX_相談役引き継ぎ_2026-09-15_v32.md:81・86／台帳 3295 行 |
