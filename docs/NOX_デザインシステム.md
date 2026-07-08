# NOX デザインシステム（正本）

## 0. 正本宣言

**`mock/nox-nightwork-app.html` を NOX のデザインの正本とする**（相談役宣言・2026-07-08）。
従来の「計算仕様の出典」に加え、**色・タイポ・余白・border-radius・コンポーネント標準・画面レイアウトの参照元**とする。

- モックは `tsconfig` exclude・**参照専用**（ビルドに含めない）を維持。
- 本書はモックの `.nox` スコープ CSS（`mock/nox-nightwork-app.html` の 36〜144 行・実行時に注入される `<style>` テンプレート）を**写経したトークンの正本**。数値・hex は本書とモックが一致する（孫引き・目分量を禁止）。
- モックの**デモ機能**（レジ/予約/顧客台帳/分析＝NOX の F3/F4 相当）は**持ち込まない**。借りるのは見た目（トークン・トーン・レイアウト・コンポーネント標準）のみ。

### 世界観

黒（`--bg #0B0B0F`）× ゴールド（`--gold #C9A24A`／シャンパン `--champ #E6D6A8`）。ナイトワークの高級感。
モバイルファースト（max-width 520px・中央寄せ・下部タブナビ）。数字は Outfit（tabular-nums）で会計らしく揃える。

---

## 1. カラートークン（13変数・モック line 38 と一字一致）

`.nox`（および移行後の opt-in ラッパー `.nox-dark`）に定義する CSS 変数。

| 変数 | 値 | 用途 |
|---|---|---|
| `--bg` | `#0B0B0F` | 最背面（アプリ背景・最暗） |
| `--bg2` | `#101017` | 入力欄・トラック等の一段沈んだ面 |
| `--card` | `#16161E` | カード下端（グラデ終点） |
| `--card2` | `#1D1D27` | カード上端（グラデ始点）・KPI 背景 |
| `--line` | `#272732` | 標準ボーダー・区切り線 |
| `--line2` | `#34343F` | 強めボーダー（入力枠・ボタン枠） |
| `--gold` | `#C9A24A` | ゴールド（アクセント主） |
| `--gold2` | `#D9BC6A` | ゴールド明（グラデ・強調） |
| `--champ` | `#E6D6A8` | シャンパン（ブランド文字・数値強調・見出し） |
| `--ink` | `#ECECEF` | 主要テキスト（最明） |
| `--sub` | `#9A9AA8` | 副次テキスト（ラベル・補足） |
| `--ok` | `#7FC79B` | 成功・正常（緑） |
| `--bad` | `#D98A8A` | 警告・減算・エラー（赤） |

補助 hex（トークン外・モック内で頻出する固定値）：`#0B0B0F`（gold ボタン上の黒文字）・`#B8893A`（gold グラデ暗端）・`#1B1710`（選択チップ/セグメントの琥珀背景）・`#2C1B1B`/`#5A2E2E`/`#F0B9B9`（alert 赤系）。

---

## 2. タイポグラフィ（3書体）

Google Fonts を `@import`（モック line 36 と一致）：

```css
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap');
```

| 書体 | ウェイト | 用途 |
|---|---|---|
| **Cormorant Garamond**（serif） | 600/700 | ブランドロゴ `NOX`（`.brand`：22px・weight 700・**letter-spacing 3px**・color `--champ`・line-height 1）／アバター文字（`.ava`） |
| **Outfit**（sans） | 400–700 | **数値**（`.num`：`font-variant-numeric: tabular-nums`）・KPI 値・金額・順位・明細の金額列 |
| **Zen Kaku Gothic New**（sans） | 400/500/700/900 | 日本語 UI 本文（`.nox` の base font） |

原則：**金額・件数・日付など桁を揃えたい数値は必ず Outfit（`.num` / `theme.num`）**。見出しの強調は weight 800〜900。

---

## 3. レイアウト

- **モバイルファースト**：`.wrap { max-width:520px; margin:0 auto; min-height:100dvh; display:flex; flex-direction:column; }`
- **背景**：`radial-gradient(120% 60% at 50% 0%, #15131C 0%, var(--bg) 60%)`（上部にほのかな明るみ）
- **sticky ヘッダー**：`.top { position:sticky; top:0; z-index:20; padding:13px 16px; background:rgba(11,11,15,.82); backdrop-filter:blur(10px); border-bottom:1px solid var(--line); }`
- **本文**：`.main { flex:1; padding:16px 16px calc(96px + env(safe-area-inset-bottom)); }`（下部 tabbar 分の余白 96px）
- **下部タブナビ**：`.tabbar { position:fixed; left:0; right:0; bottom:0; z-index:30; display:flex; justify-content:space-around; padding:9px 2px calc(9px + env(safe-area-inset-bottom)); background:rgba(13,13,18,.92); backdrop-filter:blur(14px); border-top:1px solid var(--line); max-width:520px; margin:0 auto; }`
  - `.tab { flex-direction:column; align-items:center; gap:3px; color:var(--sub); font-size:9px; font-weight:700; }` ／ `.tab.on { color:var(--champ); }`
- **ページ見出し**：`.phead h1 { font-size:19px; font-weight:900; }` ／ `.phead p { font-size:12px; color:var(--sub); }`
- **ロールピル**：`.rolepill { font-size:10.5px; font-weight:800; letter-spacing:1px; color:#0B0B0F; background:linear-gradient(135deg,var(--gold2),#B8893A); padding:4px 9px; border-radius:999px; }`
- **店セレクタ**：`.storesel { border:1px solid var(--line2); padding:6px 10px; border-radius:999px; font-size:12px; color:var(--sub); }`

**border-radius 基準**：カード 16px／KPI 14px／ボタン 11px（sm 9px）／入力 11px／ピル・チップ 999px／小アイコンボタン 8px。

---

## 4. コンポーネント標準（モック写経）

### カード
```css
.card { background:linear-gradient(180deg,var(--card2),var(--card)); border:1px solid var(--line); border-radius:16px; padding:15px; margin-bottom:13px; position:relative; overflow:hidden; }
.card::before { content:""; position:absolute; left:0; top:0; right:0; height:1px; background:linear-gradient(90deg,transparent,rgba(201,162,74,.55),transparent); } /* 上端に gold の細い光 */
.h3 { display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:800; margin:0 0 11px; } /* カード見出し */
```

### ボタン
```css
.btn { font-weight:800; font-size:13px; border-radius:11px; padding:11px 14px; border:1px solid var(--line2); background:transparent; color:var(--ink); cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:7px; }
.btn.gold { background:linear-gradient(135deg,var(--gold2),#B8893A); color:#0B0B0F; border:0; } /* 主要アクション */
.btn.sm { padding:7px 11px; font-size:12px; border-radius:9px; }
.btn.block { width:100%; }
```
- 主要＝gold グラデ＋黒文字（`btnGold`）／副次＝透明＋`--line2` 枠＋`--ink`（`btnGhost`）。

### フォーム入力
```css
.iteminp { background:var(--bg2); border:1px solid var(--line2); border-radius:9px; padding:8px 10px; color:var(--ink); font-family:inherit; font-size:13px; width:100%; }
/* login の field 版 */
.field .inp { background:var(--bg2); border:1px solid var(--line2); border-radius:11px; padding:11px 12px; color:var(--ink); font-size:13px; width:100%; }
.field label { font-size:11px; color:var(--sub); font-weight:700; }
```

### KPI タイル
```css
.kgrid { display:grid; grid-template-columns:1fr 1fr; gap:11px; margin-bottom:13px; }
.kpi { background:linear-gradient(180deg,var(--card2),var(--card)); border:1px solid var(--line); border-radius:14px; padding:14px; }
.kpi .lab { font-size:11px; color:var(--sub); display:flex; align-items:center; gap:6px; }
.kpi .val { font-family:'Outfit'; font-size:24px; font-weight:700; margin-top:5px; }
.kpi .val.gold { color:var(--champ); }
```

### 行リスト・タグ・アバター
```css
.row { display:flex; align-items:center; gap:11px; padding:11px 0; border-top:1px solid var(--line); }
.row:first-of-type { border-top:0; }
.ava { width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:15px; color:#0B0B0F; font-family:'Cormorant Garamond'; } /* 背景色は動的 */
.nm { font-weight:700; font-size:14px; } .sub { font-size:11px; color:var(--sub); }
.tag { font-size:10.5px; font-weight:800; padding:3px 9px; border-radius:999px; white-space:nowrap; border:1px solid transparent; }
```

### 明細行（金額の増減・合計）
```css
.bd { display:flex; justify-content:space-between; font-size:12.5px; padding:6px 0; }
.bd .k { color:var(--sub); } .bd .v { font-family:'Outfit'; font-weight:600; }
.bd.minus .v { color:var(--bad); }                 /* 天引き・減算は bad 色 */
.bd.tot { border-top:1px solid var(--line2); margin-top:6px; padding-top:10px; font-size:14px; }
.bd.tot .v { color:var(--champ); font-weight:800; font-size:16px; } /* 合計＝champ 強調 */
```

### セグメント・チップ・スイッチ・ステッパー
```css
.seg { display:inline-flex; border:1px solid var(--line2); border-radius:9px; overflow:hidden; }
.seg button { background:transparent; border:0; color:var(--sub); font-size:11.5px; font-weight:700; padding:7px 8px; }
.seg button.on { background:#1B1710; color:var(--champ); }
.chipd { padding:7px 11px; border:1px solid var(--line2); border-radius:999px; background:var(--bg2); color:var(--sub); font-size:12px; font-weight:700; }
.chipd.on { border-color:var(--gold); color:var(--champ); background:#1B1710; }
.switch { width:46px; height:26px; border-radius:99px; border:1px solid var(--line2); background:var(--bg2); position:relative; }
.switch.on { background:linear-gradient(135deg,#B8893A,#E6D6A8); border-color:transparent; }
.switch i { position:absolute; top:2px; left:2px; width:20px; height:20px; border-radius:50%; background:#ECECEF; transition:.15s; } .switch.on i { left:22px; background:#0B0B0F; }
.stepper button { width:29px; height:29px; border-radius:9px; border:1px solid var(--line2); background:var(--card2); color:var(--champ); }
```

### ステータス表示（ok/bad）・アラート・プログレスバー
```css
.alert { background:#2C1B1B; border:1px solid #5A2E2E; color:#F0B9B9; border-radius:13px; padding:12px 13px; font-size:12.5px; font-weight:700; display:flex; align-items:center; gap:9px; }
.bar { height:8px; background:var(--bg2); border-radius:99px; overflow:hidden; } .bar i { display:block; height:100%; background:linear-gradient(90deg,#B8893A,#E6D6A8); }
/* 正常=var(--ok) #7FC79B ／ 異常・減算=var(--bad) #D98A8A をテキスト/ドット色に使う */
```

### 下部タブ・トースト
```css
.tabbar { /* §3 参照 */ }
.tab { color:var(--sub); } .tab.on { color:var(--champ); }
.toast { position:fixed; left:50%; transform:translateX(-50%); bottom:calc(108px + env(safe-area-inset-bottom)); z-index:50; background:#0B0B0F; border:1px solid var(--gold); color:var(--champ); font-size:12.5px; font-weight:700; padding:11px 16px; border-radius:12px; }
```

### ログイン
```css
.login { min-height:100dvh; display:flex; align-items:center; justify-content:center; padding:22px; background:radial-gradient(130% 55% at 50% 0%, #1A1622 0%, var(--bg) 55%); }
.lcard { width:100%; max-width:380px; background:linear-gradient(180deg,var(--card2),var(--card)); border:1px solid var(--line2); border-radius:20px; padding:26px 22px; position:relative; overflow:hidden; }
.lcard::before { content:""; position:absolute; left:0; top:0; right:0; height:2px; background:linear-gradient(90deg,transparent,var(--gold),transparent); }
.logo { width:52px; height:52px; border-radius:14px; background:linear-gradient(135deg,#1F1B12,#0B0B0F); border:1px solid var(--gold); display:flex; align-items:center; justify-content:center; margin:0 auto 12px; }
```
※ NOX のログインは**ロール選択を持たない**（認証結果でロール判定）。モックの `.roles` ピッカーは**持ち込まない**（`.lcard`/`.field`/`.logo` の見た目のみ借りる）。

### 給与明細（slip・支払明細の様式・D1/D2 で使用）
```css
.slip .sliphd { text-align:center; font-weight:800; letter-spacing:3px; background:#0E0E14; border:1px solid var(--line2); border-radius:8px; padding:7px; }
.slip .slipsec { font-weight:800; font-size:12px; background:var(--card2); border-left:3px solid var(--gold); padding:4px 9px; }
.slip .sliprow { display:flex; justify-content:space-between; font-size:12.5px; padding:4px; border-bottom:1px dashed var(--line); }
.slip .slipfoot { background:linear-gradient(135deg,var(--gold),var(--gold2)); color:#0B0B0F; border-radius:9px; padding:9px 13px; font-weight:800; } .slip .slipfoot b { font-family:'Outfit'; font-size:19px; }
```

---

## 5. 導入機構（NOX の実装方式に合わせる）

現状の NOX は **100% inline `React.CSSProperties`**（`className` 使用 0・Tailwind/CSS Modules なし）。この idiom を維持し、**Tailwind は導入しない**。

トークン配布は2経路：

1. **`app/globals.css`**：全トークンを CSS 変数として定義＋Google Fonts `@import`＋base（`.num` の tabular-nums 等）。**body 全体はダークにしない**——ダークは opt-in ラッパー **`.nox-dark`** に閉じる。
2. **`lib/nox/ui/theme.ts`**：TS のトークン定数（`colors`/`radius`/`font`）＋`React.CSSProperties` プリミティブ（`card`/`btnGold`/`btnGhost`/`input`/`th`/`td`/`pill`/`kpi`/`num` 等）。**15 コンポーネントが各自重複定義していた const を束ねる1ソース**。D1/D2 で各画面の local const を `theme.*` へ差し替える橋渡し。薄い primitive（`<Card>`/`<Button>`/`<Pill>`）も可。

### DS2'：opt-in ダーク戦略（過渡状態を作らない）

**ダークテーマは body 全体に先敷きしない。「移行が完了した画面/コンポーネント」だけが opt-in で `.nox-dark` をまとう。**

- 理由：globals に先にダーク canvas を敷くと、未移行の内側コンポーネント（ライト前提の inline hex＝白カード）が黒背景に浮き、**全画面が中途半端に崩れる過渡状態**が生まれる。
- 方針：**移行済み＝ダーク・きれい／未移行＝ライト・従来**を常に保つ。移行はページ/シェル単位で `.nox-dark` を付けて進める。崩れた中間状態を作らない。
- 移行第一陣（D0-d）：`/login`＋シェル2本（`(manage)/layout`・`mine/layout`）＋`/mine`。以降 D1/D2 で画面を1つずつ `.nox-dark` 化。

---

## 6. デザイン変更の絶対条件（厳守）

1. **機能ロジックに一切触らない**：RLS・RPC・payOf・暗号化・権限境界・route。デザインは CSS・レイアウト・コンポーネントのみ。
2. **権限表示分岐を壊さない**：cast に金額が出ない（自分の分のみ）・staff に void ボタンが出ない・manager に機密が出ない等の**ロール表示分岐（既存 JSX の条件式）は触らず**、見た目だけ変更。
3. **モックのデモ機能を持ち込まない**：レジ/予約/顧客台帳/分析（F3/F4）は D0/D1/D2 では作らない。既存画面の見た目を寄せるのみ。
4. **gate**：`verify:f0`（816）緑維持が全デザイン変更の gate（機能を壊していない証明＝各フェーズ末に流す）。verify は CSS を検査しないため、緑維持＝ロジック無改変の代理指標。
