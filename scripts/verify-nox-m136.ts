/**
 * verify:nox-m136 — レジの会計タブ（2026-11-10 Agoora 指摘・相談役）
 *  ① 会計タブの先頭＝請求額＋「入金へ進む」（主）・「会計を分ける」（副）＝data-pay-head
 *  ② 会計中は卓名（上の段）・請求額・入金済み・残額を上に固定（.nox-regsticky の中の data-pay-sticky）
 *  ③ 明細の調整（カスタム明細・割引・無料）は折りたたみの共通部品（components/ui/fold.tsx）・承認待ちがあれば割引は開いておく
 *  ④ 領収書は完了画面の任意の操作（折りたたみ・発行済みがあれば開いておく）
 *  入金・会計の RPC（check_pay／check_close）と引数は変えない（画面の並びだけ）
 */
import fs from "node:fs";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 300)}` : ""}`); };
const rb = fs.readFileSync("app/(manage)/register/register-board.tsx", "utf8");
const fold = fs.readFileSync("components/ui/fold.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const iHead = rb.indexOf('data-pay-head="1"'), iCols = rb.indexOf('<div className={dtab === "nom" ? "nox-checkcols" : "nox-checkcols split"}>');
const iNext = rb.indexOf('data-pay-next="1"'), iSplit = rb.indexOf('data-pay-split="1"');
check("m136(1-1) 先頭の欄（data-pay-head）は会計タブだけ・2 列の器より前（スマホでも一番上）", iHead > 0 && iHead < iCols && rb.slice(rb.lastIndexOf("{dtab === \"pay\" && (() => {", iHead), iHead).length < 400);
check("m136(1-2) 「入金へ進む」と「会計を分ける」は先頭の欄の中に 1 つずつ（会計のカードには残さない）", iNext > iHead && iNext < iCols && iSplit > iHead && iSplit < iCols && rb.split('data-pay-next="1"').length === 2 && rb.split('data-pay-split="1"').length === 2);
check("m136(1-3) 先頭の欄＝請求額（sumDue）・入金済み・残額・入金が済んだら「会計を完了」への案内", rb.includes('<span className="num v" data-pay-head-due={sumDue}>{yen(sumDue)}</span>') && rb.includes("data-pay-head-rem={remSum}") && rb.includes('data-pay-head-done="1"'));
check("m136(1-4) 入金の動き（setPayAmount(remaining)…setPayModal(true)）と残額 0 で非表示（!allCovered）は従来どおり", rb.includes("setPayAmount(remaining); setPayCardGross(null); setPaySplitN(null); setPayTendered(\"\"); setPayDetail(\"\"); setPayModal(true);") && rb.includes('{!allCovered && (\n            <div data-pay-step="1"'));
const iSticky = rb.indexOf('data-pay-sticky="1"');
check("m136(2-1) 上の固定バー＝.nox-regsticky の中（タブの下）・会計タブだけ・請求・入金済み・残額", iSticky > rb.indexOf('data-dtabs-seg="1"') && iSticky < rb.indexOf("</div>{/* /nox-regsticky */}") && rb.includes("<span>請求 <b>{yen(sumDue)}</b></span><span>入金済み <b>{yen(paidSum)}</b></span>"));
check("m136(3-1) 折りたたみの部品＝details／summary・題名と要約・data-fold・既定は閉じる", fold.includes('<details className="nox-fold" data-fold={name} open={defaultOpen || undefined}>') && fold.includes("<summary>") && fold.includes("defaultOpen = false"));
check("m136(3-2) カスタム明細と割引・無料は Fold（割引は承認待ちがあれば開く・要約に件数）", rb.includes('<Fold name="pay-custom" title="カスタム明細を追加"') && rb.includes('<Fold name="pay-discount" defaultOpen={approvals.some((a) => a.status === "pending")}') && rb.includes("承認待ち ${approvals.filter((a) => a.status === \"pending\").length}") && (rb.match(/<\/Fold>/g) ?? []).length === 3);
check("m136(4-1) 完了画面の領収書＝Fold（必要なときだけ・発行済みがあれば開く）", rb.includes('<Fold name="close-receipt" defaultOpen={rcptIssued.length > 0} title="領収書を発行する"'));
check("m136(5-1) 見た目＝折りたたみはカードと同じ地・44px 以上の押し幅・375 で固定バーは両端揃え", css.includes(".nox-fold > summary { list-style: none; display: flex;") && css.includes("min-height: 44px; }") && css.includes("@media (max-width: 430px) { .nox-paysticky { justify-content: space-between;"));
check("m136(5-2) 入金・会計の RPC は不変（check_pay／check_close の呼び出しが残る）", rb.includes('supabase.rpc("check_pay"') && rb.includes('"check_close"'));

if (fails.length) { console.error(`✗ verify:nox-m136 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-m136 OK (${pass} checks)`);
console.log("M-136 会計タブの先頭に請求額と入金へ進む・上に請求／入金済み／残額・カスタム明細と割引は折りたたみ・領収書は任意");
