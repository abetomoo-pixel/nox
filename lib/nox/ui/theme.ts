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

// raw hex（JS 計算が要る箇所＝アバター背景色の生成等でのみ使う。表示スタイルは下の var() 参照プリミティブを優先）。
export const colors = {
  bg: "#0B0B0F",
  bg2: "#101017",
  card: "#16161E",
  card2: "#1D1D27",
  line: "#272732",
  line2: "#34343F",
  gold: "#C9A24A",
  gold2: "#D9BC6A",
  champ: "#E6D6A8",
  ink: "#ECECEF",
  sub: "#9A9AA8",
  ok: "#7FC79B",
  bad: "#D98A8A",
} as const;

export const radius = { card: 16, kpi: 14, btn: 11, btnSm: 9, input: 11, pill: 999, icon: 8 } as const;

export const font = {
  brand: "'Cormorant Garamond', serif",
  num: "'Outfit', sans-serif",
  ui: "'Zen Kaku Gothic New', sans-serif",
} as const;

// ロール表示ラベル（server/client 両用の純関数＝ここは "use client" なし）。
export function roleLabelJa(role: string): string {
  return role === "owner" ? "オーナー" : role === "manager" ? "店長" : role === "staff" ? "黒服" : role === "cast" ? "キャスト" : role;
}

// ── canvas（アプリ背景・ログイン背景。.nox-dark と同要素に置くと var(--bg) が解決）─────────
export const appBg: CSSProperties = {
  minHeight: "100dvh",
  // R-2（2026-07-17）: 900+ はサイドバー化に合わせ広く平たいグラデへ（--app-bg は globals.css の @media 900 が定義）。
  //   フォールバック＝従来値の逐語＝≤899 は 1px も変わらない（R-1 の --wrap-max と同じ変数橋渡し）。
  background: "var(--app-bg, radial-gradient(120% 60% at 50% 0%, #15131C 0%, var(--bg) 60%))",
};
export const loginBg: CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 22,
  background: "radial-gradient(130% 55% at 50% 0%, #1A1622 0%, var(--bg) 55%)",
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
  fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: "#0B0B0F",
  background: "linear-gradient(135deg,var(--gold2),#B8893A)", padding: "4px 9px", borderRadius: radius.pill,
};
// ── ページ見出し ─────────────────────────────────────────────────
export const pheadH1: CSSProperties = { fontSize: 19, fontWeight: 900, margin: 0 };
export const pheadP: CSSProperties = { margin: "4px 0 0", fontSize: 12, color: "var(--sub)" };

// ── カード ───────────────────────────────────────────────────────
// className="nox-cardtop" を併用すると上端に gold の細線（::before）が付く。
export const card: CSSProperties = {
  background: "linear-gradient(180deg,var(--card2),var(--card))",
  border: "1px solid var(--line)", borderRadius: radius.card, padding: 15, marginBottom: 13,
  position: "relative", overflow: "hidden",
};
// 実態収束 D-1 2026-07-17・正本は描画実態: 画面側 35 箇所（27 ファイル）のリテラルへ合わせた
//   （旧値は color 欠落＋flex 3 プロパティ有りで実態と乖離し、使用は primitives.tsx の 1 箇所のみだった）。
//   flex 系は「アイコン併置」用途の画面が個別に足す（既存リテラルは素の見出し＝flex なし）。D-2 で 35 箇所を本定数へ置換する。
export const cardTitle: CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 11px" };

// ── ボタン ───────────────────────────────────────────────────────
const btnBase: CSSProperties = {
  fontFamily: "inherit", fontWeight: 800, fontSize: 13, borderRadius: radius.btn, padding: "11px 14px",
  cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
};
export const btnGold: CSSProperties = { ...btnBase, border: 0, background: "linear-gradient(135deg,var(--gold2),#B8893A)", color: "#0B0B0F" };
export const btnGhost: CSSProperties = { ...btnBase, border: "1px solid var(--line2)", background: "transparent", color: "var(--ink)" };
export const btnSm: CSSProperties = { padding: "7px 11px", fontSize: 12, borderRadius: radius.btnSm };

// ── フォーム ─────────────────────────────────────────────────────
export const input: CSSProperties = {
  background: "var(--bg2)", border: "1px solid var(--line2)", borderRadius: radius.input,
  padding: "11px 12px", color: "var(--ink)", fontFamily: "inherit", fontSize: 13, width: "100%",
};
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
