/*
 * verify:nox-nomination-card — 便 GV-A（2026-10-14）裁定359（GV-7）指名の分配率＝キャスト 1 人 1 カードの係留（DB 不触・env 不要・逐語 pin）。
 *   npm run verify:nox-nomination-card。
 */
import fs from "node:fs";
let pass = 0; const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

const rb = src("app/(manage)/register/register-board.tsx"); const css = src("app/globals.css");
check("nc(1) 1 人 1 カード（.nox-nomcard・data-kind＝左帯の色）・写真＋名前＋ランク 左・区分セグメントは nox-seg gold（選択中 金塗り）", rb.includes('data-nom-cards="1"') && rb.includes('<div key={ca.id} className="nox-nomcard" data-kind={kind}') && rb.includes('<CastAvatar name={ca.name} url={photoUrls.get(ca.id)} variant="flat" size={36} />') && rb.includes('<span className="nox-seg gold" style={{ display: "inline-flex" }}>') && css.includes(".nox-seg.gold button.on { background: var(--gold); color: #000; font-weight: 800; }") && css.includes('.nox-nomcard[data-kind="hon"] { border-left-color: var(--gold); }') && css.includes('.nox-nomcard[data-kind="jonai"] { border-left-color: var(--primary); }'));
check("nc(2) 3 注記は見出し横の ⓘ（details）に畳む・常時表示は合計バーと「均等に分配」だけ", rb.includes('<details className="nox-infofold" data-nom-info="1"') && rb.includes(">ⓘ</summary>") && !rb.includes('<b style={{ fontSize: 12 }}>料金と実績を分離</b>') && rb.includes("分配率の合計") && rb.includes("均等に分配") && !rb.includes("※変更は自動で保存されます（「分配を保存」ボタンは廃止）"));
check("nc(3) 自動加算は区分ボタン下に金額のみ（data-nom-fee）・同伴チップと % は右端（.right）・341 の切替確認は行内のまま見出し「<名前> → 本指名」・ボタンは副 48px", rb.includes('<span className="fee num" data-nom-fee="1">{yen(shimeiLine.line_total)}</span>') && rb.includes('<div className="right">') && rb.includes('data-dohan-chip="1"') && rb.includes("<b style={{ fontSize: 13 }}>{ca.name} → 本指名</b>") && rb.includes("<div style={t.btnRow48}>") && !rb.includes("自動加算\n"));
check("nc(4) ハンドラは不変（フリー戻しの confirm・341 のダイアログ分岐・同伴 OFF の confirm・% の redistribute・均等の山分け・× の removeShareCast）", rb.includes("をフリーに戻します。付いている") && rb.includes('if (v === "hon" && kind === "jonai" && isManagerUp) { setRateDlg({ castId: ca.id, name: ca.name, kinds, weights, apply: false }); return; }') && rb.includes("の同伴を解除します。同伴料の明細行を取り消します。") && rb.includes("setNomWeights((prev) => redistribute(prev, ca.id, Number(e.target.value)));") && rb.includes("const base = Math.floor(100 / n), rem = 100 - base * n;") && rb.includes("onClick={() => void removeShareCast(ca.id)}"));

if (fails.length) { console.error(`✗ verify:nox-nomination-card 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-nomination-card OK (${pass} checks)`);
