// NOX デザイントークン & プリミティブ（正本＝docs/NOX_デザインシステム.md・出典 mock/nox-nightwork-app.html）。
//
// 使い方: 移行済み画面/シェルは opt-in ラッパー className "nox-dark"（globals.css）を root にまとい、
//   その配下でこのモジュールの CSSProperties プリミティブを inline に使う。色は .nox-dark が定義する
//   CSS 変数 var(--x) を参照＝単一ソース（drift 防止）。プリミティブは .nox-dark 配下でのみ正しく解決する
//   （＝opt-in ダークの契約。未移行画面には持ち込まない）。
//
// 既存 15 コンポーネントの重複 const（card/input/btnDark…）を D1/D2 で theme.* へ差し替える橋渡し。
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
  background: "radial-gradient(120% 60% at 50% 0%, #15131C 0%, var(--bg) 60%)",
};
export const loginBg: CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 22,
  background: "radial-gradient(130% 55% at 50% 0%, #1A1622 0%, var(--bg) 55%)",
};
// モバイルフレーム（520px 中央・縦フレックス）
export const wrap: CSSProperties = { maxWidth: 520, margin: "0 auto", minHeight: "100dvh", display: "flex", flexDirection: "column" };

// ── ブランド・シェル ─────────────────────────────────────────────
export const brand: CSSProperties = { fontFamily: font.brand, fontWeight: 700, fontSize: 22, letterSpacing: 3, color: "var(--champ)", lineHeight: 1 };
export const topBar: CSSProperties = {
  position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", gap: 10,
  padding: "13px 16px", background: "rgba(11,11,15,.82)", backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)", borderBottom: "1px solid var(--line)",
};
export const main: CSSProperties = { flex: 1, padding: "16px 16px calc(96px + env(safe-area-inset-bottom))" };
export const rolePill: CSSProperties = {
  fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: "#0B0B0F",
  background: "linear-gradient(135deg,var(--gold2),#B8893A)", padding: "4px 9px", borderRadius: radius.pill,
};
// 下部タブナビ
export const tabBar: CSSProperties = {
  position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, display: "flex", justifyContent: "space-around",
  padding: "9px 2px calc(9px + env(safe-area-inset-bottom))", background: "rgba(13,13,18,.92)",
  backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderTop: "1px solid var(--line)",
  maxWidth: 520, margin: "0 auto",
};
export const tab = (on: boolean): CSSProperties => ({
  display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: 0,
  color: on ? "var(--champ)" : "var(--sub)", fontFamily: "inherit", fontSize: 9, fontWeight: 700, cursor: "pointer",
  padding: "3px 3px", textDecoration: "none",
});

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
export const cardTitle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 800, margin: "0 0 11px" };

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
export const fieldLabel: CSSProperties = { fontSize: 11, color: "var(--sub)", fontWeight: 700 };

// ── KPI ──────────────────────────────────────────────────────────
export const kpiGrid: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, marginBottom: 13 };
export const kpi: CSSProperties = { background: "linear-gradient(180deg,var(--card2),var(--card))", border: "1px solid var(--line)", borderRadius: radius.kpi, padding: 14 };
export const kpiLabel: CSSProperties = { fontSize: 11, color: "var(--sub)", display: "flex", alignItems: "center", gap: 6 };
export const kpiVal: CSSProperties = { fontFamily: font.num, fontSize: 24, fontWeight: 700, marginTop: 5, fontVariantNumeric: "tabular-nums" };
export const kpiValGold: CSSProperties = { ...kpiVal, color: "var(--champ)" };

// ── 数値・テキスト ─────────────────────────────────────────────────
export const num: CSSProperties = { fontFamily: font.num, fontVariantNumeric: "tabular-nums" };
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

// ── ステータス（ok/bad 色）─────────────────────────────────────────
export const ok: CSSProperties = { color: "var(--ok)" };
export const bad: CSSProperties = { color: "var(--bad)" };
export const alert: CSSProperties = {
  background: "#2C1B1B", border: "1px solid #5A2E2E", color: "#F0B9B9", borderRadius: 13,
  padding: "12px 13px", fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 9, marginBottom: 13,
};

// ── ログインカード ─────────────────────────────────────────────────
export const lcard: CSSProperties = {
  width: "100%", maxWidth: 380, background: "linear-gradient(180deg,var(--card2),var(--card))",
  border: "1px solid var(--line2)", borderRadius: 20, padding: "26px 22px", position: "relative", overflow: "hidden",
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
