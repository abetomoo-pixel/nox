// NOX デザイントークン & プリミティブ（正本＝docs/NOX_デザインシステム.md・出典 mock/nox-nightwork-app.html）。
//
// 使い方: 移行済み画面/シェルは opt-in ラッパー className "nox-dark"（globals.css）を root にまとい、
//   その配下でこのモジュールの CSSProperties プリミティブを inline に使う。色は .nox-dark が定義する
//   CSS 変数 var(--x) を参照＝単一ソース（drift 防止）。プリミティブは .nox-dark 配下でのみ正しく解決する
//   （＝opt-in ダークの契約。未移行画面には持ち込まない）。
//
// 移行状況（D-1 実態収束 2026-07-17 時点）: card/input/btn 等の差し替えは完了済み（`const card = t.card` 委譲が 15 ファイル）。
//   .nox-dark も (manage)/mine/login/kiosk の 4 シェルに適用済み＝ライトのまま残るのは app/page.tsx（F0 プレースホルダ）のみ。
//   残る重複は画面側のリテラル（secTitle ×35・overlay/modalCard ×4）＝D-2 で本モジュールへ寄せる。
import type { CSSProperties } from "react";

// ★E3（2026-08-17）: `colors` オブジェクト（raw hex 13色）を**削除**した。
//   理由＝**参照ゼロの死にコード**だったため（theme.ts 外からの `colors.` 参照 0件を2度実測）。
//   実害もあった: 2026-07-28 の段0 で `.nox-dark` 側だけが更新され、card2/line/ink/sub の4件が
//   drift したまま放置されていた（ガイド §2 の教訓3「宣言 ≠ 実参照」の repo 側事例）。
//   ★色の正本は `globals.css .nox-dark` の CSS 変数ただ一つ。JS から色が要る場合も
//     `var(--x)` を文字列で渡す（下のプリミティブがすべてその形）。
//     JS 計算が要る唯一の箇所＝アバター背景は `avatarBg()` が HSL を自前生成しており色定数に依存しない。

// ★E3（2026-08-17）: 角丸をモック実測値へ揃えた（ガイド §4 部品輪郭）。
//   card 16→**11**（モック .card border-radius:11px）／btn 11→**7**（.btn 7px）／
//   input 11→**6**（.field input 6px）／kpi 14→**11**（モック .kpi は .card の派生＝同値）／
//   btnSm 9→**7**（モック .btn.small は radius を上書きしない＝.btn を継ぐ）。
//   icon 8 は据置（モック .brandmark border-radius:8px と一致）。pill は 999 のまま。
//   ★全体に角が小さくなる＝モックの引き締まった見え方に寄る。
export const radius = { card: 11, kpi: 11, btn: 7, btnSm: 7, input: 6, pill: 999, icon: 8 } as const;

export const font = {
  brand: "'Cormorant Garamond', serif",
  num: "'Outfit', sans-serif",
  ui: "'Zen Kaku Gothic New', sans-serif",
} as const;

// ── アバター（段E/F/G デザイン移植 2026-07-24・presentation-only）───────────────────
// 頭文字＋名前から決定的な gradient 背景を client 生成する純関数＝★新情報を一切持たない
//   （既存 name の1文字と、name から算出した色のみ・新規フィールド取得なし・privacy 不変）。
// 使い方: <span className="nox-ava" style={{ background: t.avatarBg(name) }}>{t.avatarInitial(name)}</span>
export function avatarInitial(name: string): string {
  const s = (name ?? "").trim();
  return s ? Array.from(s)[0] : "?";
}
export function avatarBg(name: string): string {
  let h = 0;
  for (const ch of Array.from(name ?? "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(135deg, hsl(${hue} 42% 58%), hsl(${(hue + 36) % 360} 38% 42%))`;
}

// ロール表示ラベル（server/client 両用の純関数＝ここは "use client" なし）。
export function roleLabelJa(role: string): string {
  return role === "owner" ? "オーナー" : role === "manager" ? "店長" : role === "staff" ? "黒服" : role === "cast" ? "キャスト" : role;
}

// ── canvas（アプリ背景・ログイン背景。.nox-dark と同要素に置くと var(--bg) が解決）─────────
export const appBg: CSSProperties = {
  minHeight: "100dvh",
  // R-2（2026-07-17）: 900+ はサイドバー化に合わせ広く平たいグラデへ（--app-bg は globals.css の @media 900 が定義）。
  // ★E3: 紫寄りの旧トーン（#15131C）を廃し、モック body の**右上からの淡い金グロー**へ
  //   （モック実測: `radial-gradient(circle at 80% -10%, rgba(215,170,80,.1), transparent 28%), var(--bg)`）。
  //   金の淡色は E1 で追加した **var(--goldbg)** を参照＝トークンのみで表現（リテラルを持たない）。
  background: "var(--app-bg, radial-gradient(circle at 80% -10%, var(--goldbg), transparent 28%)), var(--bg)",
};
export const loginBg: CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 22,
  // ★E3: 同上（#1A1622 → 金グロー）。ログインは中央寄せなので glow も中央寄りに置く。
  background: "radial-gradient(circle at 50% -10%, var(--goldbg), transparent 34%), var(--bg)",
};
// アプリフレーム（中央寄せ・縦フレックス）。
// R-1（D-3 2026-07-17）: 上限を CSS 変数へ逃がして可変化した。inline style に @media は書けないため、
//   実値は globals.css の .nox-dark が持つ（R-2 2026-07-17 で再設計＝≤640=520px 据置／641–899=760／900+=100%）。
//   ★これ以前は 520 固定で、配下 board の maxWidth 720/760/860 宣言が全て死んでいた（親 520−padding32=488 で頭打ち）。
//   フォールバック 520px は .nox-dark 配下でない場合の保険（＝従来値と同じ＝崩さない）。
export const wrap: CSSProperties = { maxWidth: "var(--wrap-max, 520px)", margin: "0 auto", minHeight: "100dvh", display: "flex", flexDirection: "column" };

// ── ブランド・シェル ─────────────────────────────────────────────
export const brand: CSSProperties = { fontFamily: font.brand, fontWeight: 700, fontSize: 22, letterSpacing: 3, color: "var(--champ)", lineHeight: 1 };
// topBar / main / tabBar / tab は R-2（2026-07-17）で globals.css の実クラスへ全面移行した
// （.nox-topbar / .nox-main / .nox-tabbar / .nox-tab）。900+ のサイドバー化が擬似要素・:hover・
// 子孫セレクタ・複数プロパティの @media 分岐を要し、inline style では表現できないため（R-2 裁定1）。
// 基底はここにあった inline 値の逐語＝≤899 の描画は不変。
export const rolePill: CSSProperties = {
  // ★E3: 旧 --bg のベタ書き #0B0B0F → モック .btn.primary の文字色 #17130c へ。
  //   金の暗端 #B8893A → モック値 #b48634 へ（gold グラデの終点をモック正本に合わせる）。
  fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: "#17130c",
  background: "linear-gradient(135deg,var(--gold2),#b48634)", padding: "4px 9px", borderRadius: radius.pill,
};
// ── ページ見出し ─────────────────────────────────────────────────
export const pheadH1: CSSProperties = { fontSize: 19, fontWeight: 900, margin: 0 };
export const pheadP: CSSProperties = { margin: "4px 0 0", fontSize: 12, color: "var(--sub)" };

// ── カード ───────────────────────────────────────────────────────
// className="nox-cardtop" を併用すると上端に gold の細線（::before）が付く。
// ★E3（2026-08-17）: モック `.card` の実体グラデへ（ガイド §1-3 裁定2 の履行）。
//   モック実測（9枚/3種の多数派）: border:1px solid var(--line); border-radius:11px;
//     background:linear-gradient(145deg, rgba(25,25,22,.95), rgba(15,15,14,.98)); box-shadow:var(--shadow)
//   ★角度が 180deg → **145deg**、面が「--card2→--card の2トークン」から
//     **半透明リテラルのグラデ**へ変わる（下地 --bg が透ける＝モックの見え方）。
//   ★radius.card は 16→11 へ更新済み（上の radius スケール）。影は E1 で追加した var(--shadow) を参照。
//   padding/marginBottom は NOX 固有の余白規約＝据置（モックは .card に padding を持たない）。
export const card: CSSProperties = {
  background: "linear-gradient(145deg, rgba(25,25,22,.95), rgba(15,15,14,.98))",
  border: "1px solid var(--line)", borderRadius: radius.card, padding: 15, marginBottom: 13,
  boxShadow: "var(--shadow)",
  position: "relative", overflow: "hidden",
};
// 実態収束 D-1 2026-07-17・正本は描画実態: 画面側 35 箇所（27 ファイル）のリテラルへ合わせた
//   （旧値は color 欠落＋flex 3 プロパティ有りで実態と乖離し、使用は primitives.tsx の 1 箇所のみだった）。
//   flex 系は「アイコン併置」用途の画面が個別に足す（既存リテラルは素の見出し＝flex なし）。D-2 で 35 箇所を本定数へ置換する。
export const cardTitle: CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 11px" };

// ── ボタン ───────────────────────────────────────────────────────
// ★E3: モック `.btn` 輪郭へ（9枚/4種の多数派）:
//   height:38px; border:1px solid var(--line2); background:#171715; padding:0 15px;
//   border-radius:7px; inline-flex; gap:7px; font-weight:650
//   ★NOX は高さを padding で作ってきた（height 指定なし）ため、**高さ 38px 相当の padding**
//     （縦 10px＋fontSize 13＋border 2 ≒ 38）に寄せて height 指定は入れない
//     （height を入れると既存の inline 上書き〔width/padding〕と衝突しうるため）。
//   ★font-weight 800→650（モック値）。gap 7・radius は radius.btn(=7) を参照。
const btnBase: CSSProperties = {
  fontFamily: "inherit", fontWeight: 650, fontSize: 13, borderRadius: radius.btn, padding: "10px 15px",
  cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
};
// モック `.btn.primary`: linear-gradient(135deg,#e2bd6b,#b48634); border-color:#d2a952;
//   color:#17130c; box-shadow:0 6px 18px rgba(216,173,85,.12)
//   ★旧実装は文字色に **#0B0B0F（旧 --bg のベタ書き）** を使っていた（E1 の申し送り）。
//     モックの #17130c（金地に対する暗褐色）へ置換＝トークン外だがモック正本の値。
export const btnGold: CSSProperties = {
  ...btnBase, border: "1px solid #d2a952", background: "linear-gradient(135deg,#e2bd6b,#b48634)",
  color: "#17130c", boxShadow: "0 6px 18px rgba(216,173,85,.12)",
};
// モック `.btn.ghost`: background:transparent; color:var(--muted)＝NOX は --sub
export const btnGhost: CSSProperties = { ...btnBase, border: "1px solid var(--line2)", background: "transparent", color: "var(--ink)" };
// モック `.btn.small`: height:30px; padding:0 10px（radius は .btn を継ぐ）
export const btnSm: CSSProperties = { padding: "6px 10px", fontSize: 12, borderRadius: radius.btnSm };
// ★レーン④c: フォームモーダル用の大きめ寸法（④b-3 で products-board のローカル定数として作ったもの）。
//   カテゴリ側でも同じ形を使うため、複製せずここへ引き上げた（2画面で同じ「指で押せる寸法」を
//   別々に持つと必ず片方だけ動いて食い違うため）。inputLg は input の宣言より後に置く（TDZ 回避）。
export const btnPrimaryLg: CSSProperties = { ...btnGold, width: "100%", padding: "14px", fontSize: 14 };
export const btnGhostLg: CSSProperties = { ...btnGhost, width: "100%", padding: "12px", fontSize: 13 };

// ── フォーム ─────────────────────────────────────────────────────
// ★E3: モック `.field input/.field select` 輪郭へ（register-pos 基準）:
//   height:34px; border:1px solid var(--line2); border-radius:6px; background:#0c0c0b;
//   padding:0 9px; outline:none
//   ★地色 `#0c0c0b` に一致するトークンは無い（--bg #080808 と --card #11110f の中間）。
//     入力欄は「面より沈む」のが要件なので、**カード面（--card）より暗い --bg** を採る
//     ＝トークンのみ使用（ガイド §9-2 に記録）。旧値 --bg2(#181815) はカードより明るく、
//     モックの「沈み」と逆になっていた。
//   ★height ではなく padding で高さを作る（btnBase と同じ理由＝inline 上書きとの衝突回避）。
export const input: CSSProperties = {
  background: "var(--bg)", border: "1px solid var(--line2)", borderRadius: radius.input,
  padding: "9px 9px", color: "var(--ink)", fontFamily: "inherit", fontSize: 13, width: "100%",
};
// ★レーン④c: フォームモーダルの入力（min-height 46px＝指で押せる最低ライン）。btnPrimaryLg と対。
export const inputLg: CSSProperties = { ...input, padding: "12px 13px", fontSize: 14, minHeight: 46 };
// 実態収束 D-1 2026-07-17・正本は描画実態: fontSize 11 を維持（変更しない）。
//   64 箇所中 59 箇所が上書きなし＝11px が実態。12px 上書きは report-board の 5 箇所のみ（例外側）。
export const fieldLabel: CSSProperties = { fontSize: 11, color: "var(--sub)", fontWeight: 700 };

// ── KPI ──────────────────────────────────────────────────────────
// 実態収束 D-1 2026-07-17・正本は描画実態: 判定 a（現行値を維持）。
//   customer-detail.tsx:230-247 が kpiGrid/kpi/kpiLabel/kpiVal/kpiValGold を実使用中＝この値で描画されている。
//   モック .kpi（bg:var(--card2)/radius:11/padding:9px 6px）との微差は許容し触らない（触ると当該画面の視覚が変わる）。
// R-2（2026-07-17）: 900+ で 4列（モック .kgrid の読み替え＝裁定5・--kpi-cols は globals.css の @media 900 が定義）。
//   フォールバック＝従来値の逐語＝≤899 は 2列のまま不変。
export const kpiGrid: CSSProperties = { display: "grid", gridTemplateColumns: "var(--kpi-cols, 1fr 1fr)", gap: 11, marginBottom: 13 };
export const kpi: CSSProperties = { background: "linear-gradient(180deg,var(--card2),var(--card))", border: "1px solid var(--line)", borderRadius: radius.kpi, padding: 14 };
export const kpiLabel: CSSProperties = { fontSize: 11, color: "var(--sub)", display: "flex", alignItems: "center", gap: 6 };
export const kpiVal: CSSProperties = { fontFamily: font.num, fontSize: 24, fontWeight: 700, marginTop: 5, fontVariantNumeric: "tabular-nums" };
export const kpiValGold: CSSProperties = { ...kpiVal, color: "var(--champ)" };

// ── 数値・テキスト ─────────────────────────────────────────────────
export const num: CSSProperties = { fontFamily: font.num, fontVariantNumeric: "tabular-nums" };
// 実態収束 D-1 2026-07-17・正本は描画実態: fontSize 11 を維持（変更しない）。
//   調査時の「実装実態 12/13px」は画面側のローカル const（noneP/noteP/lbl 等）＝本定数を参照しない別語彙で、
//   t.sub 自体は 23 箇所が上書きなしで 11px のまま描画中＝12/13 へ動かすとその 23 箇所の視覚が変わる。
export const sub: CSSProperties = { fontSize: 11, color: "var(--sub)" };

// ── 行リスト ─────────────────────────────────────────────────────
export const row: CSSProperties = { display: "flex", alignItems: "center", gap: 11, padding: "11px 0", borderTop: "1px solid var(--line)" };
export const rowName: CSSProperties = { fontWeight: 700, fontSize: 14 };

// ── 明細（減算=bad / 合計=champ）────────────────────────────────────
export const bdRow: CSSProperties = { display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "6px 0" };
export const bdKey: CSSProperties = { color: "var(--sub)" };
export const bdVal: CSSProperties = { fontFamily: font.num, fontWeight: 600 };
export const bdValMinus: CSSProperties = { ...bdVal, color: "var(--bad)" };
export const bdTotal: CSSProperties = { borderTop: "1px solid var(--line2)", marginTop: 6, paddingTop: 10, fontSize: 14 };
export const bdTotalVal: CSSProperties = { fontFamily: font.num, color: "var(--champ)", fontWeight: 800, fontSize: 16 };

// ── テーブル ─────────────────────────────────────────────────────
export const th: CSSProperties = { textAlign: "left", padding: "6px 10px", borderBottom: "1px solid var(--line2)", fontSize: 11, color: "var(--sub)", fontWeight: 700 };
export const td: CSSProperties = { padding: "6px 10px", borderBottom: "1px solid var(--line)", fontSize: 13 };
// 実態収束 D-1 2026-07-17: 数値列（右寄せ＋Outfit tabular）。同値の複製が 2 箇所にあったため正本化＝
//   analytics-board.tsx:120-121 / mine/ranking/page.tsx:29-30（どちらも `{...t.th, textAlign:"right"}` の派生）。D-2 で置換。
export const thNum: CSSProperties = { ...th, textAlign: "right" };
export const tdNum: CSSProperties = { ...td, textAlign: "right", fontFamily: font.num };

// ── バッジ基底（mock .tag 実測 2026-07-17 = 10.5/800/3px 9px/999/border 1px transparent）──
// 実態収束 D-1: 基底のみ正本化。色は用途別＝呼び出し側が color/background/borderColor を重ねる。
//   画面側の独自バッジ関数（churnPill/dormantPill/pill/rolePillMini 等）は D-1 では触らない（置換は D-2 の判断）。
export const tag: CSSProperties = {
  fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: radius.pill,
  whiteSpace: "nowrap", border: "1px solid transparent",
};

// ── ステータス（ok/bad 色）─────────────────────────────────────────
export const ok: CSSProperties = { color: "var(--ok)" };
export const bad: CSSProperties = { color: "var(--bad)" };
export const alert: CSSProperties = {
  background: "#2C1B1B", border: "1px solid #5A2E2E", color: "#F0B9B9", borderRadius: 13,
  padding: "12px 13px", fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 9, marginBottom: 13,
};

// ── ログインカード ─────────────────────────────────────────────────
// R-2（2026-07-17）: 900+ で max-width 420 / padding 30px 28px（モック .login .lcard・globals.css の @media 900 が定義）。
//   フォールバック＝従来値の逐語＝≤899 は不変。
export const lcard: CSSProperties = {
  width: "100%", maxWidth: "var(--lcard-max, 380px)", background: "linear-gradient(180deg,var(--card2),var(--card))",
  border: "1px solid var(--line2)", borderRadius: 20, padding: "var(--lcard-pad, 26px 22px)", position: "relative", overflow: "hidden",
};
export const logo: CSSProperties = {
  width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg,#1F1B12,#0B0B0F)",
  border: "1px solid var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px",
};

// ── 給与/支払明細（slip・mock .slip 系写経）──────────────────────────
// .slip は無スタイルのセマンティック容器（素の <div>）。以下は各要素へ直付けする inline プリミティブ。
// ::before/擬似要素・子孫セレクタ依存が無いため globals.css 追加は不要（nox-cardtop と異なる）。
export const slipHd: CSSProperties = { textAlign: "center", fontWeight: 800, letterSpacing: 3, background: "#0E0E14", border: "1px solid var(--line2)", borderRadius: 8, padding: 7 };
export const slipSub: CSSProperties = { textAlign: "center", fontSize: 11.5, color: "var(--sub)", margin: "8px 0 10px" };
export const slipSec: CSSProperties = { fontWeight: 800, fontSize: 12, background: "var(--card2)", borderLeft: "3px solid var(--gold)", padding: "4px 9px", margin: "10px 0 4px" };
export const slipRow: CSSProperties = { display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: 4, borderBottom: "1px dashed var(--line)" };
export const slipRowB: CSSProperties = { ...slipRow, fontWeight: 800, color: "var(--champ)", borderBottom: "1px solid var(--line2)" }; // .sliprow.b（強調行）
export const slipFoot: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, background: "linear-gradient(135deg,var(--gold),var(--gold2))", color: "#0B0B0F", borderRadius: 9, padding: "9px 13px", fontWeight: 800 };
export const slipFootVal: CSSProperties = { fontFamily: font.num, fontSize: 19, fontVariantNumeric: "tabular-nums" }; // .slipfoot b（Outfit・NOX num 規約で tabular 付与）
