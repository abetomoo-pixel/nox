/*
 * verify:nox-shop-contrast — 店の側の画面の「読める」と「割れない」（2026-11-21 夜・相談役 18:40 の 2a・2b）。数え方は verify:nox-ops-contrast と同じ（scripts/contrast-probe.ts）。
 *  本物の部品を react-dom/server で静的に描き、app/globals.css を載せて Edge に入れる（ログインも DB も使わない）。375 と 1024・light と dark で写す（docs/tmp/shop_contrast/）。
 *  s(1) 利用規約の同意の画面（/terms/accept）：ロゴが上・カードが下（縦）・カードは画面の幅に収まり中央・ボタンは中央・版は「利用規約（v0.9）」だけ（「雛形・弁護士確認前」を出さない）・規約の本文の印は残す。
 *  s(2) 初期設定の上の帯：「あとからすべて変更できます」と「入力は自動で保存されます」が語の途中で割れない（どちらも 1 行）・店名と重ならない。
 *  s(4) /setup のホスト（相談役 18:40 の 3）：業態に host・雛形＝VESPER（売上の基準 subtotal・既定の売上歩合を止める・ランキング off・自由設計のバック 6 行・新人の最低保証）・業態が入っている初回の店は STEP 1 を固定し biz_type を書かない。
 *  s(3) どちらも全文字の明るさの比が基準以上（初期設定は上の帯だけ＝本文と下の固定バーは数えない）・light と dark で一致・横のはみ出し無し。
 *  使い方: npm run verify:nox-shop-contrast
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { chromium, type Browser } from "playwright-core";
import TermsAcceptForm from "../components/nox/terms-accept-form";
import SetupWizard from "../app/(manage)/setup/setup-wizard";
import * as t from "../lib/nox/ui/theme";
import { TERMS_ACCEPT_LABEL, TERMS_VERSION_LABEL } from "../lib/nox/terms";
import { mineSettingsOf } from "../lib/nox/store/mine-settings";
import { docOf, PROBE, type Probe } from "./contrast-probe";
import { applyType, buildV5Plan, HOST_COMMISSION_TIERS, HOST_SALES_BACKS, V5_TYPES, v5DefaultState, type V5Ctx } from "../lib/nox/setup/v5";
process.loadEnvFile(".env.local"); // 部品の中の createClient（ブラウザ用）が URL と鍵の名前を読む＝通信はしない
(globalThis as { React?: unknown }).React = React;

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => { if (ok) pass++; else { fail++; console.log(`  FAIL: ${name}${detail ? ": " + detail : ""}`); } };
const src = (p: string) => fs.readFileSync(p, "utf8");
const OUT = "docs/tmp/shop_contrast";
fs.mkdirSync(OUT, { recursive: true });
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
const wrap = (el: React.ReactElement) => renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router as never }, el));

// /terms/accept の main は page.tsx（サーバ・redirect あり）＝同じ style をここで組む（源の pin は s(1-1)）
const termsMain = (isOwner: boolean) => wrap(React.createElement("main", { className: "nox-dark", style: { ...t.loginBg, flexDirection: "column", minHeight: "100dvh", padding: "24px 16px" }, "data-terms-accept-page": "1" },
  React.createElement("div", { style: { textAlign: "center", marginBottom: 18 } }, React.createElement("span", { style: { ...t.brand, fontSize: 26 } }, "NOX")),
  React.createElement(TermsAcceptForm, { isOwner, orgName: "CLUB 見本 銀座本店" })));
const setupHtml = (setupDone: boolean) => wrap(React.createElement("div", { className: "nox-dark nox-setup-page" }, React.createElement(SetupWizard, {
  store: { id: "00000000-0000-4000-8000-000000000001", name: "CLUB 見本 銀座本店", setupDone, current: { round_unit: 1000, round_mode: "floor", time_mode: "rule", time_per: "set", receipt: { address: "", tel: "", reg_no: "", footer: "" }, mine: mineSettingsOf({}), tax: { business_tax_status: "taxable", price_display: "tax_included", invoice_status: "unregistered", invoice_reg_no: null, tax_rounding: "floor", card_surcharge_rate: null } } },
  counts: { seats: 0, products: 0, plans: 0, rules: 0 }, isOwner: true, initialType: "cabaret",
})));
const SCREENS = [
  { key: "terms-owner", html: termsMain(true) },
  { key: "terms-staff", html: termsMain(false) },
  { key: "setup", html: setupHtml(false) },
  { key: "setup-done", html: setupHtml(true) },
];

const LAYOUT = `(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom, lines: e.getClientRects().length }; };
  const lh = (s) => { const e = document.querySelector(s); return e ? parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.5 : 0; };
  return { logo: r('[data-terms-accept-page] > div'), card: r('[data-terms-accept]'), btn: r('[data-terms-submit]'), vw: window.innerWidth,
    hint: r('.nox-setup-sub-hint'), hintLh: lh('.nox-setup-sub-hint'), store: r('.nox-setup-sub-store'), save: r('[data-setup-saved]'), saveLh: lh('[data-setup-saved]'), h1: r('.nox-setup-bar h1') };
})()`;
type Box = { x: number; y: number; w: number; h: number; r: number; b: number; lines: number } | null;
const overlap = (a: Box, b: Box) => !!a && !!b && a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1;

async function main() {
  let browser: Browser | null = null;
  try {
    // 源の pin
    const ta = src("app/terms/accept/page.tsx"), tf = src("components/nox/terms-accept-form.tsx"), tl = src("lib/nox/terms.ts"), tp = src("app/terms/page.tsx");
    check("s(1-1) /terms/accept の main は縦（flexDirection column）・カードは width 100%（最大 560・中央）・ボタンは .nox-actions の中",
      ta.includes('<main className="nox-dark" style={{ ...t.loginBg, flexDirection: "column", minHeight: "100dvh", padding: "24px 16px" }} data-terms-accept-page="1">')
      && tf.includes('style={{ ...t.card, width: "100%", maxWidth: 560, margin: "0 auto" }} data-terms-accept="1"') && tf.includes('color: "var(--sub)", opacity: 1 }) }}') && tf.includes('<div className="nox-actions" style={{ marginTop: 14 }}><button type="button"'));
    check("s(1-2) 版の表記：同意の画面は TERMS_ACCEPT_LABEL＝v0.9 だけ（雛形・弁護士確認前を出さない）・規約の本文（/terms）は今までどおり印つき",
      TERMS_ACCEPT_LABEL === "v0.9" && !tf.includes("TERMS_VERSION_LABEL") && !/弁護士確認前|雛形/.test(tf.replace(/^\s*\/\/.*$/gm, "")) && TERMS_VERSION_LABEL.includes("弁護士確認前") && tp.includes("版: {TERMS_VERSION_LABEL}") && tl.includes('export const TERMS_ACCEPT_LABEL = `v${TERMS_VERSION}`;'));
    const owner = SCREENS[0].html;
    check("s(1-3) 描いた同意の画面：説明の文とチェックの欄に「利用規約（v0.9）」・「雛形」「弁護士確認前」の語が無い",
      owner.includes("店舗向け利用規約（v0.9）への同意が必要です") && owner.includes("利用規約（v0.9）に同意する") && !/雛形|弁護士確認前/.test(owner));

    // s(4) ホスト
    {
      const ctx = (lockedType: "host" | null): V5Ctx => ({ storeId: "S", setupDone: false, lockedType, deviceIdemKey: "D", staffIdemKeys: ["K0"], current: { round_unit: 1000, round_mode: "down", time_mode: "manual", time_per: "person", receipt: { address: "", tel: "", reg_no: "", footer: "" }, mine: { payslip_visibility: "net_only", ranking: true, ranking_show_others: false, drink_claim: false, punch_correction_request: false, reservation_request: true, shift_request_mode: "shift" } as never, tax: { business_tax_status: "taxable", price_display: "tax_included", invoice_status: "unregistered", invoice_reg_no: null, tax_rounding: "floor", card_surcharge_rate: null } } });
      const S = applyType(v5DefaultState("2026-11-21"), "host"); S.timeMode = "manual";
      const p = buildV5Plan(S, ctx(null)).steps, pL = buildV5Plan(S, ctx("host")).steps;
      const patchOf = (x: typeof p) => (x.find((y) => y.key === "settings")!.args as { p_patch: Record<string, unknown> }).p_patch;
      check("s(4-1) 業態の 6 つ目＝ホストクラブ（指名・売上の歩合中心）・雛形＝セット 7,000／60 分・本指名 3,000・場内 2,000・サービス料 30%・卓 7・時給 0・体験入店 0・ランキング off・丸め 切り上げ・税別",
        V5_TYPES.length === 6 && V5_TYPES[5].id === "host" && V5_TYPES[5].name === "ホストクラブ" && S.rules[0].set === 7000 && S.fees.hon === 3000 && S.fees.jo === 2000 && S.svc === 30 && S.seats.table === 7 && S.pay.base === 0 && S.pay.trial === 0 && S.mine.rank === false && S.roundMode === "up" && S.tax === "ex" && S.menu.reduce((n, c) => n + c.items.length, 0) === 22);
      // ★0202f（2026-11-22 03:02 適用・旗 true）: 売上歩合の段は自由設計のバック 6 行から、基本プラン・体験入店・新人の段の表（comp_plan_ext_set の commission_tiers）へ
      const tierSteps = p.filter((x) => x.rpc === "comp_plan_ext_set" && /_tiers$/.test(x.key));
      check("s(4-2) 確定：業態 host・売上の基準 subtotal・既定の売上歩合を止める・段の表 3 つ（基本プラン・体験入店・新人＝40〜65%・6 段・自由設計のバックは作らない）・新人の月の最低保証 160,000",
        patchOf(p).biz_type === "host" && patchOf(p).sales_basis === "subtotal" && patchOf(p).sales_back_default_off === true
        && p.filter((x) => x.rpc === "set_custom_back_def").length === 0 && HOST_SALES_BACKS.length === 6
        && tierSteps.length === 3 && tierSteps.map((x) => x.useResult?.from).join(",") === "comp_0,comp_1,comp_2" && tierSteps.every((x) => JSON.stringify((x.args as { p_patch: { commission_tiers: unknown } }).p_patch.commission_tiers) === JSON.stringify(HOST_COMMISSION_TIERS))
        && (p.find((x) => x.key === "comp_2_guarantee")?.args as { p_amount: number; p_kind: string }).p_amount === 160000 && p.find((x) => x.key === "comp_2_guarantee")?.useResult?.from === "comp_2");
      check("s(4-3) 業態が入っている初回の店（lockedType host）：確定の設定に biz_type が無い（host のまま）・ほかの鍵は同じ",
        !("biz_type" in patchOf(pL)) && patchOf(pL).sales_basis === "subtotal" && JSON.stringify({ ...patchOf(p), biz_type: undefined }) === JSON.stringify({ ...patchOf(pL), biz_type: undefined }));
      const locked = wrap(React.createElement("div", { className: "nox-dark nox-setup-page" }, React.createElement(SetupWizard, { store: { id: "S", name: "CLUB 見本", setupDone: false, current: { round_unit: 1000, round_mode: "floor", time_mode: "rule", time_per: "set", receipt: { address: "", tel: "", reg_no: "", footer: "" }, mine: mineSettingsOf({}), tax: { business_tax_status: "taxable", price_display: "tax_included", invoice_status: "unregistered", invoice_reg_no: null, tax_rounding: "floor", card_surcharge_rate: null } } }, counts: { seats: 0, products: 0, plans: 0, rules: 0 }, isOwner: true, initialType: "host", lockedType: "host" })));
      const pg = src("app/(manage)/setup/page.tsx");
      check("s(4-4) STEP 1：業態が入っている初回の店はその業態だけ（選び直しのボタンを出さない）＋「変えるときは運営へ」・page は biz_type が入っていて初回なら lockedType",
        (locked.match(/data-type="/g) ?? []).length === 1 && locked.includes('data-type="host"') && locked.includes("業態はお申し込みのときの値です。変えるときは運営へご連絡ください。")
        && pg.includes('const lockedType = typeof sj.biz_type === "string" && V5_IDS.includes(sj.biz_type) && sj.setup_done !== true ? (sj.biz_type as V5Type) : null;') && pg.includes("lockedType={lockedType}"));
    }

    browser = await chromium.launch({ channel: "msedge", headless: true });
    for (const sc of SCREENS) {
      const per: Record<string, string> = {};
      for (const w of [375, 1024]) {
        for (const scheme of ["light", "dark"] as const) {
          const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme, locale: "ja-JP" });
          const page = await ctx.newPage();
          await page.setContent(docOf(sc.html), { waitUntil: "load" });
          // 初期設定は上の帯（2b の範囲）だけを数える＝本文と下の固定バーを外す（下の「次へ」は業態を選ぶ前は全体の決まりで薄い＝2.22・帯の外＝報告に並べた）
          if (sc.key.startsWith("setup")) await page.evaluate(() => { document.querySelectorAll(".nox-setup-main, .nox-setup-foot").forEach((e) => e.remove()); });
          const r = (await page.evaluate(PROBE)) as { probes: Probe[]; docW: number; vw: number };
          const L = (await page.evaluate(LAYOUT)) as Record<string, Box | number>;
          await page.screenshot({ path: path.join(OUT, `${sc.key}_${w}_${scheme}.png`), fullPage: sc.key.startsWith("terms") });
          await ctx.close();
          per[`${w}_${scheme}`] = JSON.stringify(r.probes.map((p) => [p.sel, p.text, p.fg, p.bgs]));
          const bad = r.probes.filter((p) => p.ratio < p.need);
          check(`s(3) ${sc.key} ${w} ${scheme}：文字 ${r.probes.length} 個がすべて基準以上`, r.probes.length > 0 && bad.length === 0, bad.slice(0, 4).map((p) => `${p.sel}「${p.text}」${p.fg} on ${p.bgs.join("|")} = ${p.ratio}（要 ${p.need}）`).join(" ／ "));
          check(`s(3) ${sc.key} ${w} ${scheme}：横のはみ出し無し`, r.docW <= r.vw, `文書 ${r.docW} > 画面 ${r.vw}`);
          if (scheme !== "light") continue;
          if (sc.key.startsWith("terms")) {
            const logo = L.logo as Box, card = L.card as Box, btn = L.btn as Box, vw = L.vw as number;
            const cardCenter = card ? (card.x + card.r) / 2 : -1;
            check(`s(1-4) ${sc.key} ${w}：ロゴが上・カードが下（縦）・カードは画面の幅に収まり中央`,
              !!logo && !!card && logo.b <= card.y + 1 && card.x >= 0 && card.r <= vw && Math.abs(cardCenter - vw / 2) <= 2 && (w > 600 || card.w >= vw - 40), JSON.stringify({ logo, card, vw }));
            if (sc.key === "terms-owner") check(`s(1-5) ${sc.key} ${w}：同意のボタンはカードの中央`, !!btn && !!card && Math.abs((btn.x + btn.r) / 2 - (card.x + card.r) / 2) <= 2, JSON.stringify({ btn, card }));
          } else {
            const hint = L.hint as Box, save = L.save as Box, store = L.store as Box, h1 = L.h1 as Box;
            check(`s(2) ${sc.key} ${w}：「あとからすべて変更できます」と「入力は自動で保存されます」がどちらも 1 行（割れない）・店名や見出しと重ならない`,
              !!hint && !!save && hint.h <= (L.hintLh as number) * 1.3 && save.h <= (L.saveLh as number) * 1.3 && !overlap(save, hint) && !overlap(save, store) && !overlap(save, h1) && !overlap(hint, store),
              JSON.stringify({ hint, save, store, h1, hintLh: L.hintLh, saveLh: L.saveLh }));
          }
        }
        check(`s(3) ${sc.key} ${w}：light と dark で文字と地の色が一致`, per[`${w}_light`] === per[`${w}_dark`]);
      }
    }
    console.log(`  写し：${OUT}/（画面_幅_light|dark.png）`);
  } catch (e) {
    fail++; console.log(`  FAIL: 例外 ${(e as Error).message}`);
  } finally {
    if (browser) await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))]);
  }
}
void main().then(() => {
  if (fail) { console.log(`verify:nox-shop-contrast FAIL ${fail} / pass ${pass}`); process.exit(1); }
  console.log(`verify:nox-shop-contrast OK (${pass} checks)`);
  process.exit(0);
});
