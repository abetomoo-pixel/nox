# NOX D2 残差リスト（design 締め時点の正本）

> デザインフェーズ（D0/D1/D2）の締めにあたり、モック `nox-nightwork-app.html` との残差を1本化した正本。
> **締め判断＝「P1 のみ実施、残（P2〜P5）は F3/F4 実装時に都度回収」**。
> verify で緑にならない領域（デザイン）ゆえ、ここが唯一の記録。新規画面のダーク化時は本書＋`docs/NOX_デザインシステム.md` §3〜6 を参照。

作成 2026-07-08 / 起点 origin/main = 7773e7f（F2完結＋D0/D1 移行済み）＋ 本 P1（slip 帳票様式）

---

## 0. 締め判断

- 既存主要画面は **D0+D1 で全ダーク移行・視覚的に完了・忠実**。`verify:f0` 816 緑・権限表示分岐 全 intact・回帰ゼロ。
- D2 は **P1（給与/支払明細の slip 帳票様式）のみ実施**。唯一の "機能忠実" ギャップだったため。
- **P2〜P5 は deferred**（不可視〜軽微のポリッシュ・単独フェーズの視覚 ROI が低い）。**F3/F4 で該当画面を触る際に都度回収**する。
- この判断で **design グループを締め**、次は F3/F4 or 専門家ゲート反映へ。

---

## 1. 判定表（app 27ファイル ＋ 共有UI 3）

凡例：✅忠実（残差なし）／⚠残差（P#・軽微〜中）／✅P1（本フェーズで実施）／N/A・対象外（非画面 or 未移行プレースホルダ）

| # | ファイル | 判定 | 残差 |
|---|---|---|---|
| 1 | app/(manage)/layout.tsx | ✅忠実 | — |
| 2 | app/(manage)/master/comp-master.tsx | ✅忠実 | P4（secTitle 重複・sub-tab 表 inline・gold トグルは公認） |
| 3 | app/(manage)/master/deduction-panel.tsx | ⚠残差 | P4（h3/見出し const） |
| 4 | app/(manage)/master/master-board.tsx | ⚠残差 | P4（secTitle 重複・表 t.th/t.td 不統一） |
| 5 | app/(manage)/master/page.tsx | ✅忠実（server） | — |
| 6 | app/(manage)/master/sensitive-tax-panel.tsx | ✅忠実 | P4（label const・reveal は monospace 一点物） |
| 7 | app/(manage)/payroll/page.tsx | ✅忠実（server） | — |
| 8 | app/(manage)/payroll/payment-panel.tsx | ⚠対象外 | **slip 構造的対象外**（下記2）・P4（card-title const・msg 色 raw） |
| 9 | app/(manage)/payroll/payroll-board.tsx | ✅**P1実施** | 合計行を slipFoot バー化・P4（msg 色 raw 残） |
| 10 | app/(manage)/register/page.tsx | ✅忠実（server） | — |
| 11 | app/(manage)/register/register-board.tsx | ⚠残差 | P2（UA サブ chrome）・P4（表 inline） |
| 12 | app/(manage)/report/page.tsx | ✅忠実（server） | — |
| 13 | app/(manage)/report/report-board.tsx | ✅忠実 | — |
| 14 | app/(manage)/shift/incentive-panel.tsx | ⚠残差 | P2（UA サブ chrome） |
| 15 | app/(manage)/shift/page.tsx | ✅忠実（server） | — |
| 16 | app/(manage)/shift/shift-board.tsx | ⚠残差 | P2（UA サブ chrome） |
| 17 | app/layout.tsx | N/A | ルート HTML シェル（body ライト維持＝DS2'・非画面） |
| 18 | app/login/page.tsx | ✅忠実 | — |
| 19 | app/mine/attendance-form.tsx | ⚠残差 | P5（fieldLabel 無）・P4（local input const） |
| 20 | app/mine/layout.tsx | ✅忠実 | — |
| 21 | app/mine/page.tsx | ✅**P1実施** | 確定給与明細を full slip 化・P4（見出し const title/noneP/noteP 残） |
| 22 | app/mine/punch-actions.tsx | ✅忠実 | — |
| 23 | app/mine/ranking/page.tsx | ✅忠実 | 自分行 #1B1710 は公認（選択琥珀） |
| 24 | app/mine/wishes/page.tsx | ✅忠実 | — |
| 25 | app/mine/wishes/wish-form.tsx | ✅忠実 | — |
| 26 | app/mine/wishes/withdraw-button.tsx | ✅忠実 | — |
| 27 | app/page.tsx | 対象外 | F0 公開トップ placeholder（未移行ライト・DS2' opt-in 圏外・後日差替） |
| S1 | components/ui/nav.tsx | ✅忠実 | — |
| S2 | components/ui/primitives.tsx | ✅忠実 | — |
| S3 | components/simulator-panel.tsx | ⚠残差 | P3（theme 非経由 styleSet・dead light 分岐 生 hex 20） |

---

## 2. P1 実施済（詳細）

### 2.1 slip primitive 新設（`lib/nox/ui/theme.ts`・globals 追加なし）

モック `.slip` 系 CSS（sliphd/slipsub/slipsec/sliprow/sliprow.b/slipfoot/slipfoot b）を実体から抽出し写経（doc §4 の写経は不完全だったためモック直抽出＝正本）。`::before`／擬似要素・子孫セレクタ依存が無いため **100% inline CSSProperties で完結・globals.css 追加は不要**（nox-cardtop と異なる）。

追加した7 primitive：`slipHd`／`slipSub`／`slipSec`／`slipRow`／`slipRowB`（.sliprow.b 強調行）／`slipFoot`／`slipFootVal`（.slipfoot b・Outfit・NOX num 規約で tabular 付与）。

### 2.2 /mine `確定給与明細` を full slip 化（`app/mine/page.tsx`）

- 従来の `<ul><li>` 凝縮1行 → **1確定期間 = 1 slip カード**（slipHd=期間／slipSec「支給」→時給×時間・指名バック・商品/売上/自由バック→gross(slipRowB)／slipSec「控除」→固定控除・罰金・源泉・ノルマ未達・売掛・前借り・送り（bad 減算）／slipSec「加算」→extras（出勤ボーナス等・通常空）／slipFoot=手取り net）。
- **breakdown_json 実キー忠実**：`{ pay: PayResult, extras: Extra[] }`＋finalize 由来 `ar/adv/okuri` のみ参照。`SlipPay` の全フィールドは `lib/nox/pay.ts` の `PayResult` に実在。**欠損/ゼロは `> 0` ガードで行を出さない＝prefill・捏造なし**。
- **算術が閉じる**：支給和 = gross、gross − 控除 = pay.net、＋extras = **s.net（slipFoot 手取り）**。extras 通常空＝支給→gross→控除→手取りで完全一致。
- **cast プライバシー（パターン1）**：payslips RLS = `auth_role()<>'cast' or cast_id=auth_cast_id()`＋staff 遮断（mig0016【43】）。**新クエリを一切追加せず**、既存の自己スコープ `slips` 行から読むフィールドを増やしただけ＝他人分の混入導線ゼロ。

### 2.3 payroll-board 合計行を slipFoot バー化（`app/(manage)/payroll/payroll-board.tsx`）

- 複数キャスト表の「締め」として帳票感を付与。**表本体（t.th/t.td）は不変**、合計 `<tr>` のみ撤去し表**直下**に `slipFoot` gold バー（net は `slipFootVal` tabular）を配置。`<div>` は `<table>` 内に置けないための DOM 対処＝「置換」。`total`・列・集計ロジックは不変。

### 2.4 payment-panel は構造的に対象外

- **入力グリッド**（キャスト × net/支払済/残 ＋ 記録フォーム）で、slip（1名分の帳票）とは別物。**合計行も無い**ため slipFoot も付かない。表（t.th/t.td）維持で確定。

### 2.5 slip 帳票の spec 公認固定 hex（drift 扱い禁止）

以下は slip 帳票が導入する固定 hex。**トークン外だが公認**（`docs/NOX_デザインシステム.md` §1 の補助 hex に準じる扱い）。後続レビューで drift／未トークン化として指摘しないこと：

- **`#0E0E14`** — `slipHd` 背景（明細ヘッダーの一段沈んだ黒パネル）。**本フェーズで新規追加**。
- `#0B0B0F` — `slipFoot` の黒文字（gold バー上）。既に §1 公認（gold ボタン上の黒文字）。

### 2.6 slipSub 未使用の経緯（受け皿として定義）

- モックの `.slipsub`（中央サブタイトル位置）はキャスト名/店舗名を置く想定だが、**現状 `breakdown_json` にも `slips` クエリにも該当キーが存在しない**。**捏造せず非表示**（ユーザー条件「該当があれば」に従う）。
- 将来 `breakdown_json` にキャスト名/店舗名が入った際の**受け皿として `slipSub` primitive は一式定義済み**（他6 primitive と揃えて定義・現状 /mine full では未使用）。キーが入り次第 slipHd 直下に1行追加するだけで有効化できる。

---

## 3. P2〜P5 deferred（回収は F3/F4 で該当画面を触る時）

いずれも**回帰でなく任意ポリッシュ**。視覚は `var()` で正しくダーク解決済み（P4 は視覚同一・保守性のみ）。

### P2 — native フォーム控件の UA サブ chrome が未ダーク化（低〜中・実視覚）

`<select>`／`<input type=date|number>`／`<checkbox>` は **局所 `input` 定数（＝`t.input` を spread）を box には既に適用済み**（register-board:40・shift-board:22・incentive-panel:12・attendance-form:34 も同型）。残差の実体は **「t.input 未適用」ではなく「`t.input` に `color-scheme`／`accent-color` が欠落」**：UA 由来のサブ chrome（select のドロップダウン矢印/option popup・date のカレンダーアイコン・checkbox の箱）がダークカード上で明色寄りに残る。
回収＝**`t.input` に `colorScheme:'dark'` を1行足す**のが最小・最大レバー（`input` alias を使う全画面＝register/shift/incentive/attendance の select/date/number の box chrome を一括ダーク化）＋checkbox のみ `accentColor`（要工夫）。個々の控件へ再適用は不要（既に適用済のため no-op）。

- `app/(manage)/register/register-board.tsx`：select 247・282・296・365／checkbox 256／number 265・290・303・371
- `app/(manage)/shift/shift-board.tsx`：select 141・149・182／date 145・176
- `app/(manage)/shift/incentive-panel.tsx`：date 68／select 69／number 73

### P3 — SimulatorPanel が theme.ts 非経由＋dead light 分岐（低・DRY/dead-code）

`components/simulator-panel.tsx`：`styleSet(dark)`（237-272）が theme.* を使わず自前再宣言。dark 分岐は `var()` 参照で**視覚忠実**だが微スケール逸脱（input radius 9 vs token 11・card padding 16 vs 15）。light 分岐の生 hex 20個（240・247 等）は**両呼び出し元が `variant="dark"` 固定ゆえ未使用（dead）**。回収＝dark 分岐を theme.* へ差替＋light 分岐（dead）削除。

### P4 — DRY／トークン統合（不可視・視覚同一）

- **champ 見出し const の重複**（`{fontSize:13.5, fontWeight:800, color:var(--champ)}`）が散在：`/mine` page.tsx 92（title）・master-board.tsx 20（secTitle）・comp-master.tsx 34（secTitle）・deduction-panel.tsx 55（h3）・sensitive-tax-panel.tsx 19（label 相当）。→ theme に `cardTitleGold` 等を1本足して統合。
- **表を `t.th`/`t.td` へ統一**：master-board.tsx 124・157／comp-master.tsx 各 sub-tab table／register-board.tsx 313-334。
- **生 `var()` 色 → semantic token**：payroll-board.tsx 114（`var(--bad)`→`t.bad`）・payment-panel.tsx 97（msg 色）。
- ※ 注意：manage boards の local const のうち **`btnDark={...t.btnGold,...t.btnSm}` 等の合成・`card=t.card` alias は正当なトークン利用**（drift ではない・統合は任意）。P4 対象は上記の見出し重複・表不統一・生色のみ。

### P5 — attendance-form の fieldLabel 無し（低・a11y/忠実）

`app/mine/attendance-form.tsx`：入力に `<label>＋t.fieldLabel` が無い（36-60）・local `input` const（34）。回収＝`t.fieldLabel` ラップ＋compact 入力の token 化。

---

## 4. 締め後の回収方針

- **原則**：P2〜P5 は独立フェーズを立てず、**F3/F4 で該当画面を新規実装/改修する際に、その画面分だけ都度回収**する（触るついでに theme.* へ寄せる）。
- **新規画面**は最初から `docs/NOX_デザインシステム.md` §3.5 手順（親 `.nox-dark` 配下で `t.*` を inline 使用・カードに `nox-cardtop`）で作れば P2〜P5 の負債を新たに増やさない。
- **絶対条件（不変）**：機能ロジック不可侵（RLS/RPC/payOf/暗号化/権限境界/route）・権限表示分岐の JSX 条件式を触らず見た目のみ・`verify:f0` 816 緑維持が各変更の gate。
