/**
 * verify:nox-m139 — 文字色のコントラストを WCAG AA（4.5:1）に・主な操作は塗りのボタン・デモで使えない操作は近くに理由（2026-11-10 相談役＝外部レビュー）
 *  ① 文字の色トークン（--ink／--sub／--gold／--gold2／--ok／--bad／--primary-hover／--orange）×地（--bg／--card／--bg2）＝4.5 以上（globals.css の値から計算）
 *  ② 白文字の青塗りは --primary-fill（5.08）＝--primary の地（3.95）に白文字を置かない（ボタン・会計タブ・ON/OFF・出勤の主ボタン）
 *  ③ 薄くした行（停止中・取消・定休）は opacity 0.75 以上＝--sub でも 4.5 以上
 *  ④ デモで使えない操作（LINE の月の上限）は近くに理由
 *  日報のレイアウト＝指摘の具体待ち（台帳 M-139 は 1 行）＝ここでは扱わない
 */
import fs from "node:fs";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const css = src("app/globals.css");
// 画面の色の正本＝「--bg: #070707」の :root の塊（先頭の :root の --ink／--bg は後の塊で上書き・@media print の白黒は印刷だけ）
const iTheme = css.indexOf("  --bg: #070707;");
const themeBlock = css.slice(iTheme, css.indexOf("\n}", iTheme));
const tok = (name: string): string => { const m = themeBlock.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`)); if (!m) throw new Error(`token ${name}`); return m[1]; };
const lum = (hex: string) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (fg: string, bg: string, a: number) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(fg.slice(i, i + 2), 16) * a + parseInt(bg.slice(i, i + 2), 16) * (1 - a)).toString(16).padStart(2, "0")).join("");

const FG = ["ink", "sub", "gold", "gold2", "ok", "bad", "primary-hover", "orange", "danger-ink"];
const BG = ["bg", "card", "bg2"];
const low: string[] = [];
for (const f of FG) for (const b of BG) { const r = ratio(tok(f), tok(b)); if (r < 4.5) low.push(`${f} on ${b} = ${r.toFixed(2)}`); }
check("m139(1-1) 文字の色トークン × 地（--bg／--card／--bg2）＝すべて 4.5 以上", low.length === 0, low);
check("m139(1-2) --primary を文字に使っても --bg・--card で 4.5 以上（--card2 の上の文字には --primary-hover）", ratio(tok("primary"), tok("bg")) >= 4.5 && ratio(tok("primary"), tok("card")) >= 4.5 && ratio(tok("primary-hover"), tok("card2")) >= 4.5);

const fill = tok("primary-fill");
check("m139(2-1) 白文字の青塗り＝--primary-fill で 4.5 以上（--primary の地は 4.5 未満＝白文字に使わない）", ratio("#ffffff", fill) >= 4.5 && ratio("#ffffff", tok("primary")) < 4.5, [ratio("#ffffff", fill).toFixed(2), ratio("#ffffff", tok("primary")).toFixed(2)]);
const whiteOnPrimary = (css.match(/[^\n]*background:\s*var\(--primary\)[^\n]*color:\s*#fff[^\n]*/g) ?? []);
check("m139(2-2) CSS に「--primary の地に白文字」の規則が無い（ボタン・会計タブ・ON/OFF・出勤の主ボタンは --primary-fill）", whiteOnPrimary.length === 0 && css.includes(".nox-dtabs.nox-dtabs--seg button.pay.on { background: var(--primary-fill);") && css.includes('.nox-onoff > button.on[data-v="on"] { background: var(--primary-fill);') && css.includes("border-radius: 12px; background: var(--primary-fill); color: #fff;"), whiteOnPrimary);
const theme = src("lib/nox/ui/theme.ts");
check("m139(2-3) 部品の青塗りのボタン（theme.ts）も --primary-fill", theme.includes('background: "var(--primary-fill)", color: "#fff"') && !/background: "var\(--primary\)", color: "#fff"/.test(theme));
const tsxWhite: string[] = [];
for (const d of ["app", "components"]) {
  const walk = (p: string) => { for (const f of fs.readdirSync(p)) { const q = `${p}/${f}`; if (fs.statSync(q).isDirectory()) walk(q); else if (q.endsWith(".tsx") && /background: "var\(--primary\)"[^}]*color: "#fff"/.test(src(q))) tsxWhite.push(q); } };
  walk(d);
}
check("m139(2-4) 画面の直書きにも「--primary の地に白文字」が無い", tsxWhite.length === 0, tsxWhite);

const sub = tok("sub"), card = tok("card");
check("m139(3-1) 薄くした行の 0.75＝--sub でも 4.5 以上（0.6 は 4.5 未満＝使わない）", ratio(mix(sub, card, 0.75), card) >= 4.5 && ratio(mix(sub, card, 0.6), card) < 4.5);
const dims: Array<[string, string]> = [
  ["app/(manage)/master/pricing/pricing-board.tsx", "style={c.is_active ? undefined : { opacity: 0.75 }}"],
  ["app/(manage)/master/staff-shift-panel.tsx", "style={muted ? { opacity: 0.75 } : undefined}"],
  ["app/(manage)/master/stock/stock-board.tsx", "style={r.isActive ? undefined : { opacity: 0.75 }"],
  ["app/(manage)/receipts/receipts-board.tsx", "style={r.voided ? { opacity: 0.75 } : undefined}"],
  ["app/(manage)/register/reservation-panel.tsx", "style={kpiOverdue > 0 ? undefined : { opacity: 0.75 }"],
  ["components/nox/kintai-row.tsx", "r.cancelled ? { opacity: 0.75 } : {}"],
  ["app/(manage)/shift/shift-add-form.tsx", 'background: "var(--line)", opacity: 0.75, cursor: "not-allowed"'],
  ["app/(manage)/shift/staff-place-by-staff.tsx", 'background: "var(--line)", opacity: 0.75, cursor: "not-allowed"'],
];
const dmiss = dims.filter(([f, k]) => !src(f).includes(k));
check("m139(3-2) 薄くした行 8 か所＝0.75（停止中の料金・スタッフのシフト・棚卸・取消の領収書・予約の KPI・取消の勤怠・定休の日）", dmiss.length === 0, dmiss);
check("m139(4-1) デモで使えない LINE の月の上限＝近くに理由（data-demo-reason）", src("app/(manage)/master/line-config-panel.tsx").includes('data-demo-reason="line-limit">デモでは上限を変えられません'));

if (fails.length) { console.error(`✗ verify:nox-m139 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-m139 OK (${pass} checks)`);
console.log("M-139 文字色は AA・白文字の青塗りは --primary-fill・薄い行は 0.75・デモで使えない操作は近くに理由");
