/**
 * verify:nox-m135 — 読み込み中の表示を画面ごとにそろえる・保存の直後に件数と一覧を同じタイミングで更新して変わった所を一瞬強調（2026-11-10 相談役）
 *  ① 読み込み中＝共通部品 components/ui/loading.tsx（回転の印＋文言・role=status）＝「読み込み中…」の p を全画面で置き換え（ボタンの文言・件数の位置の文字は除く）
 *  ② 保存 → 一覧の再読込 → 成功の文言 → 変わった行を一瞬強調（lib/nox/ui/use-row-flash.ts）＝商品・顧客・キャスト
 */
import fs from "node:fs";
import path from "node:path";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const files: string[] = [];
const walk = (d: string) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p); } else if (/\.tsx$/.test(f)) files.push(p); } };
walk("app"); walk("components");
const rel = (p: string) => p.split(path.sep).join("/");
const adhoc = files.filter((p) => /<p[^>]*>読み込み中…<\/p>/.test(src(p)) && !rel(p).endsWith("components/ui/loading.tsx")).map(rel);
const users = files.filter((p) => src(p).includes('from "@/components/ui/loading"')).map(rel);
check("m135(1-1) 「読み込み中…」の p を直書きしている画面＝0（共通部品 Loading に置き換え）", adhoc.length === 0, adhoc);
check("m135(1-2) Loading を使う画面＝14 ファイル以上（分析・監査・キャスト・顧客・顧客の詳細・勤怠・給与・給与一覧・キオスク・顧客の選択・日払い・LINE のキープ・罰金・精算）", users.length >= 14, users);
const L = src("components/ui/loading.tsx");
check("m135(1-3) 部品＝role=status・aria-live・data-loading・回転の印", L.includes('role="status" aria-live="polite" data-loading="1"') && L.includes('<span className="sp" aria-hidden="true" />'));
const css = src("app/globals.css");
check("m135(1-4) 見た目＝回転の印・動きを減らす設定では止める・行の強調は表以外にも効く", css.includes(".nox-loading .sp {") && css.includes("@media (prefers-reduced-motion: reduce) { .nox-loading .sp { animation: none; } }") && css.includes("tr.nox-rowflash, .nox-rowflash { animation: nox-rowflash 1.6s ease-out; }"));
const H = src("lib/nox/ui/use-row-flash.ts");
check("m135(2-1) 共通のフック＝id の行へスクロールして 1.6 秒で解除", H.includes("export function useRowFlash(idPrefix: string)") && H.includes("scrollIntoView") && H.includes("ROW_FLASH_MS = 1600"));
const CU = src("app/(manage)/customers/customers-board.tsx");
const iLoad = CU.indexOf("await load(); // ★M-135: 一覧と件数を先に更新してから文言と強調"), iMsg = CU.indexOf('setMsg("登録しました");');
check("m135(2-2) 顧客の登録＝再読込 → 文言 → 新しい行を強調（RPC の返す id）・ランクの変更も再読込の後に文言", iLoad > 0 && iMsg > iLoad && CU.includes('flash(typeof newId === "string" ? newId : null);') && CU.includes('id={`crow-${r.customer_id}`}') && CU.includes('useRowFlash("crow-")') && CU.includes("if (!error) { await loadDetail(sel); await load(); } // ★M-135"));
const PB = src("app/(manage)/master/products/products-board.tsx");
check("m135(2-3) 商品の保存＝再読込の後に成功の文言（在庫 OFF の失敗の文言は残す）→ 行を強調", PB.includes("      await reload();\n      setMsg((m) => m ?? okMsg);") && PB.includes("if (savedId) setHighlightId(savedId);\n      return;"));
const CB = src("app/(manage)/casts/casts-board.tsx");
check("m135(2-4) キャスト＝成功のときは再読込の後に文言", CB.includes("if (!error) await load(); // ★M-135: 一覧を先に更新してから文言"));

if (fails.length) { console.error(`✗ verify:nox-m135 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-m135 OK (${pass} checks)`);
console.log("M-135 読み込み中は共通部品・保存の後は一覧→文言→強調の順");
