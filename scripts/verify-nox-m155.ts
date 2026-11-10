/**
 * verify:nox-m155 — ノルマ設定（店）の金額表示とレイアウト・金額欄の部品の統一（2026-11-10 Agoora 指摘）
 *  ① 金額の入力欄は MoneyInput 1 つ（暗い欄・左に ¥・右寄せ・3 桁区切り・数字キーボード）・白い欄（枠と地の無い input）を全画面で探して置き換え・後ろに「円」を付けない
 *  ② ノルマ設定（店）の未達の減額＝1 行に軸名 → 方式の切替（必要な幅だけ）→ 金額 → 短い説明・ページに最大幅
 *  ③ キャスト別の目標の表＝名前の直後に数字の列・1 行おきに薄い色・数字は右寄せ・まとめて入力は項目名を欄の上・4 欄を同じ幅・ボタンは中央
 *  ④ 375 で崩れない（≤430 は 1 列・金額 100%・方式 50／50）
 */
import fs from "node:fs";
import path from "node:path";
import { normPenaltyNoteOf } from "../lib/nox/store/norm-panel";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

// ── 全画面の走査 ──
const files: string[] = [];
const walk = (d: string) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p); } else if (/\.tsx$/.test(f)) files.push(p); } };
walk("app"); walk("components");
const white: string[] = []; const yenAfter: string[] = [];
for (const p of files) {
  const s = src(p); const rel = p.split(path.sep).join("/");
  const re = /<input\b[\s\S]*?\/>/g; let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const tag = m[0];
    if (/type=\{?["'](checkbox|radio|hidden|file|range|color)["']/.test(tag)) continue;
    const cls = (tag.match(/className=(?:"([^"]*)"|\{([^}]*)\})/) || []).slice(1).join("");
    if (/\bstyle=/.test(tag) || /nox-(input|unit|search|field|pin|kp|code|text|money|time|date|denomrow)/.test(cls)) continue;
    white.push(`${rel}:${s.slice(0, m.index).split("\n").length}`);
  }
  if (/\/>\s*円/.test(s)) yenAfter.push(rel);
}
// 親の CSS が見た目を持つ欄（白くならない）＝日報の締めの YenField（.nox-yenfield .f input）・LP の問い合わせ（.lpv4 input）・時刻の選択の直接入力（.nox-time-type input）
const PARENT_STYLED = ["app/(manage)/report/report-board.tsx", "components/nox/lp-v4-client.tsx", "components/ui/time-input.tsx"];
const whiteOut = white.filter((w) => !PARENT_STYLED.some((f) => w.startsWith(`${f}:`)));
check("m155(1-1) 枠と地の無い入力欄（白い欄）＝親の CSS が見た目を持つ 3 ファイル以外に 0（ノルマ設定の 2 欄を置き換えた）", whiteOut.length === 0, whiteOut);
const css = src("app/globals.css");
check("m155(1-2) 親の CSS が見た目を持つ欄の根拠＝.nox-yenfield／.lpv4／.nox-time-type の input に枠か地", /\.nox-yenfield[^{]*input[^{]*\{[^}]*(border|background)/.test(css) && /\.nox-time-type input \{[^}]*(border|background)/.test(css) && /\.lpv4 input[^{]*\{[^}]*(border|background)/.test(src("app/lp/lp-v4.css")));
check("m155(1-3) 入力欄の後ろに「円」を付ける書き方（/> 円）＝全画面で 0", yenAfter.length === 0, yenAfter);
const MI = src("components/ui/money-input.tsx");
check("m155(1-4) MoneyInput＝¥ の箱・数字キーボード・右寄せ・3 桁区切り・onBlur（欄を離れたら保存する画面用）", MI.includes('<em className="pre" aria-hidden="true">¥</em>') && MI.includes('inputMode="numeric"') && MI.includes('textAlign: "right"') && MI.includes("moneyDisplayOf(value)") && MI.includes("onBlur={onBlur}"));
const uses: Array<[string, string]> = [
  ["app/(manage)/master/cast-comp/norma/norm-axes-penalty-panel.tsx", "ariaLabel=\"売上ノルマ 不足の単位\""],
  ["app/(manage)/master/cast-comp/comp-sections.tsx", "ariaLabel=\"売上ノルマ 不足の単位（円）\""],
  ["app/(manage)/master/cast-comp/comp-sections.tsx", "<MoneyInput value={val} disabled={use}"],
  ["app/(manage)/master/cast-comp/comp-sections.tsx", "<MoneyInput value={penalty[k] as number}"],
  ["app/(manage)/master/cast-comp/comp-sections.tsx", "金額 <MoneyInput value={value}"],
  ["app/(manage)/master/cast-register-panel.tsx", "ariaLabel=\"スタッフの即時適用の上限\""],
  ["app/(manage)/master/deduction-panel.tsx", "<MoneyInput value={tr.amount}"],
  ["app/(manage)/master/store-profile-panel.tsx", "ariaLabel=\"釣銭準備金\""],
  ["app/(manage)/register/register-board.tsx", "ariaLabel=\"手数料の額\""],
  ["app/(manage)/register/register-board.tsx", "ariaLabel=\"割引の額\""],
  ["app/(manage)/report/report-board.tsx", "ariaLabel=\"回収額\""],
  ["app/(manage)/staff/staff-board.tsx", "ariaLabel=\"働き方の額\""],
  ["components/nox/withholding-432-panel.tsx", "ariaLabel=\"指定額\""],
];
const miss = uses.filter(([f, k]) => !src(f).includes(k) || !src(f).includes('from "@/components/ui/money-input"'));
check("m155(1-5) 置き換えた金額欄 13 か所＝MoneyInput（ノルマの減額・単位／待遇の上書き／罰金／ボーナス／スタッフ割引の上限／送りの区分／釣銭準備金／手数料の額／割引の額／回収額／働き方の額／源泉の指定額）", miss.length === 0, miss);
check("m155(1-6) 割引の額の目印（data-disc-manual-input）は残す", src("app/(manage)/register/register-board.tsx").includes('<span data-disc-manual-input="1"'));

// ── ② 軸と減額 ──
const NP = src("app/(manage)/master/cast-comp/norma/norm-axes-penalty-panel.tsx");
check("m155(2-1) 1 行＝軸名 → 方式 → 金額（MoneyInput）→ 短い説明（normPenaltyNoteOf）・白い欄（nox-numfield）なし", NP.includes('<span className="nox-normax-amt" data-norm-amt={ax}>') && NP.includes('<span className="nox-normax-note" data-norm-note={ax}>') && NP.includes("normPenaltyNoteOf(ax, mode, amount, penalty.norm_sales_unit)") && !NP.includes("nox-numfield") && (NP.match(/<MoneyInput /g) ?? []).length === 2);
check("m155(2-2) 短い説明＝定額は「未達の月に 1 回 ¥3,000」・不足ごとは 2 単位の例（日・回）・売上は単位×2 の例",
  normPenaltyNoteOf("days", "flat", 3000, 10000) === "未達の月に 1 回 ¥3,000" && normPenaltyNoteOf("days", "per", 2000, 10000) === "例：2 日不足で ¥4,000" && normPenaltyNoteOf("dohan", "per", 1500, 10000) === "例：2 回不足で ¥3,000" && normPenaltyNoteOf("sales", "per", 1000, 50000) === "例：¥100,000 不足で ¥2,000",
  [normPenaltyNoteOf("days", "per", 2000, 10000), normPenaltyNoteOf("sales", "per", 1000, 50000)]);
check("m155(2-3) CSS＝PC は 4 列（軸名｜方式は必要な幅だけ｜金額 150px｜説明）・方式のボタンは伸ばさない・ページに最大幅 980px",
  css.includes(".nox-normax-row { display: grid; grid-template-columns: 9em max-content 150px minmax(0, 1fr);") && css.includes(".nox-normax-row .nox-normax-seg .nox-segtabs { width: auto; }") && css.includes(".nox-normax-row .nox-normax-seg .nox-segtabs > button { flex: 0 0 auto;") && css.includes(".nox-normapage { max-width: 980px; }") && src("app/(manage)/master/cast-comp/norma/norma-board.tsx").includes('<div className="nox-normapage">'));

// ── ③ キャスト別の目標 ──
const CS = src("app/(manage)/master/cast-comp/comp-sections.tsx");
check("m155(3-1) 表＝名前の直後に数字の列（期間の列なし）・空のときの colSpan も同じ", CS.includes('<th className="nox-norm-namehead">キャスト</th>{axisCols.map(') && !CS.includes('className="num nox-norm-period"') && CS.includes("colSpan={(isManagerUp ? 2 : 1) + axisCols.length}"));
check("m155(3-2) 1 行おきに薄い色・選んだ行は青・名前の列は詰める・数字は右寄せ", css.includes(".nox-normtable tbody tr:nth-child(even) td { background: rgba(255, 255, 255, 0.03); }") && css.includes(".nox-normtable tbody tr.on td { background: var(--primary-soft); }") && css.includes(".nox-normtable td.nox-norm-name, .nox-normtable th.nox-norm-namehead { width: 1%; white-space: nowrap;") && css.includes(".nox-normtable th.num, .nox-normtable td.num { width: 7.5em; text-align: right; }"));
check("m155(3-3) まとめて入力＝項目名を欄の上・採用した軸の数で同じ幅（--nox-normbulk-n）・中央・売上は MoneyInput・ボタンは中央（nox-actions）",
  CS.includes('["--nox-normbulk-n" as string]: String(Math.max(1, axisCols.length))') && css.includes(".nox-normbulk { display: grid !important; grid-template-columns: repeat(var(--nox-normbulk-n, 4), minmax(0, 160px)); gap: 10px !important; justify-content: center; }") && css.includes(".nox-normbulk > label { display: flex; flex-direction: column; gap: 4px; min-width: 0; font-size: 12px; }") && CS.includes('<label data-norm-bulk="sales"><span>売上</span>{cell("sales", bulk.sales)}</label>') && CS.includes('<MoneyInput placeholder="変えない" value={v}') && CS.includes('<div className="nox-actions" style={{ marginTop: 8 }}>{/* ★便 BTN（今回の指摘）: まとめて入力は入力欄の下の中央 */}'));

// ── ④ 375 ──
check("m155(4-1) ≤430＝1 列・方式 50／50・金額 100%・説明の列指定を外す／≤599＝まとめて入力は 2 列・名前の列は詰めない",
  css.includes(".nox-normax-row .nox-normax-amt { display: flex; width: 100%; }") && css.includes(".nox-normax-row .nox-normax-off { grid-column: auto; }") && css.includes(".nox-normax-row .nox-normax-seg .nox-segtabs > button { flex: 1 1 50%; font-size: 12px; }") && css.includes("  .nox-normbulk { display: grid !important; grid-template-columns: 1fr 1fr; gap: 8px !important; }") && css.includes("  .nox-normtable td.nox-norm-name { width: auto; }"));

// ── 同乗（夜便の撮影で見つけた 375 の切れ）：時刻の選択の直接入力 ──
check("m155(5-1) 時刻の選択の直接入力＝案内は「例 26:00」・欄は残りの幅・「決定」は折り返さない", src("components/ui/time-input.tsx").includes('placeholder="例 26:00"') && css.includes(".nox-time-type input { flex: 1 1 auto; width: 0; min-width: 0;") && css.includes(".nox-time-type button { flex: 0 0 auto; white-space: nowrap;"));

if (fails.length) { console.error(`✗ verify:nox-m155 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-m155 OK (${pass} checks)`);
console.log("M-155 金額欄は MoneyInput 1 つ（白い欄 0・後ろの円 0）・軸と減額は 1 行 4 列・目標の表は名前の直後に数字・まとめて入力は同じ幅");
