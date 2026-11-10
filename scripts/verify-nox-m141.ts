/**
 * verify:nox-m141 — 初期設定の確認画面 3 点（2026-11-10・相談役／Agoora の TEST CLUB の確認）
 *  M-141 要確認の「直す」＝種類ごとに飛び先の欄が画面にある（鍵 → セレクタ → 該当 STEP の描画の中に目印）・値段 0 円は確認画面のメニューの段に一覧と値段の欄
 *        （従来は go(i - 1)＝1 つ前の STEP に飛び、0 円は料金に出て直せる欄が無かった）
 *  M-142 確認画面のカード＝項目名を上・値を下の 2 段・値は keep-all・キャスト待遇は PC で横 2 枠（.nox-setup-wide）
 *  M-143 「出勤していない人はレジを使えない」（duty_gate）＝要確認・初期設定の項目・計画の patch・器の表・店舗設定のスイッチ・キャスト一覧の案内文から撤去（裁定472）
 */
import fs from "node:fs";
import { V5_SAVE_MAP, applyType, buildV5Plan, v5CheckSelectorOf, v5Checks, v5DefaultState, v5ZeroPriceItems, type V5State } from "../lib/nox/setup/v5";
import { applyMenuTemplate } from "../lib/nox/setup/menu-template";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const WZ = src("app/(manage)/setup/setup-wizard.tsx");
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// ── 要確認を全種類出す状態 ──
const base = applyType(v5DefaultState("2026-11-10"), "cabaret");
const S: V5State = clone(base);
S.rules[0].to = "03:00";                                   // はみ出し（rule:0）
S.rules.push({ ...clone(S.rules[0]), name: "重なり" });     // 重なり（rule:1）
S.rules.push({ ...clone(S.rules[0]), name: "曜日なし", days: [] });   // 曜日なし（rule:2）
S.rules.push({ ...clone(S.rules[0]), name: "VIP 向け", seat: "vip", days: ["月"] as typeof S.rules[0]["days"] });   // VIP 席なし（rule:3）
S.seats.vip = 0; S.vip.on = true;                           // seats:vip
S.timeMode = null;                                          // timeMode
S.roundUnit = 0;                                            // roundUnit
S.menu[0].items[0].n = " ";                                 // menu:0:0:n
S.menu[0].items[1].p = 0;                                   // menu:0:1:p
S.menu[0].items[2].bt = "pct"; S.menu[0].items[2].b = 150;  // menu:0:2:b
S.pay.slide = "sales"; S.slideTiers = [[100000, 3000], [50000, 3500]] as typeof S.slideTiers;   // slide:1
S.pay.trial = 1000; S.pay.base = 3000;                      // pay:trial
S.kindRate = { hon: 10, jo: 50, free: 60 };                 // kindRate
S.punch.how = "device"; S.devReg = false; S.reg.kiosk = true;   // devReg
S.firstShift = { ...S.firstShift, from: "2026-12-01", to: "2026-11-01" };    // firstShift
const W = v5Checks(S);
const S2 = clone(S); S2.reg.kiosk = false;                  // 端末の欄が無い店＝punch:how
const W2 = v5Checks(S2);
const all = [...W, ...W2.filter(([, , k]) => k === "punch:how")];
const kinds = new Set(all.map(([, , k]) => k.replace(/:\d+/g, ":#")));
check("m141(1-1) 要確認の全種類に鍵（直す先）がある", all.length > 0 && all.every(([i, w, k]) => Number.isInteger(i) && !!w && typeof k === "string" && k.length > 0), all.filter(([, , k]) => !k));
const EXPECT_KINDS = ["rule:#", "seats:vip", "timeMode", "roundUnit", "menu:#:#:n", "menu:#:#:p", "menu:#:#:b", "slide:#", "pay:trial", "kindRate", "devReg", "punch:how", "firstShift"];
check("m141(1-2) 種類＝13（ルール・VIP 席・延長の付け方・丸め・商品の名前／値段／バック・時給スライド・体入の時給・バックの割合・店の端末・打刻の場所・最初の期間）", EXPECT_KINDS.every((k) => kinds.has(k)) && kinds.size === EXPECT_KINDS.length, [...kinds]);

// 飛び先の目印が「その STEP の描画」の中にある（{S.step === N && の直後〜次の STEP の前）
const stepBlocks: { n: number; from: number; to: number }[] = [];
{ const re = /\{S\.step === (\d) && /g; let m: RegExpExecArray | null; const hits: { n: number; at: number }[] = []; while ((m = re.exec(WZ))) hits.push({ n: Number(m[1]), at: m.index }); hits.forEach((h, i) => stepBlocks.push({ n: h.n, from: h.at, to: i + 1 < hits.length ? hits[i + 1].at : WZ.length })); }
const markerOf = (key: string): string => {
  const [k] = key.split(":");
  if (k === "rule") return "data-rule={i}";
  if (k === "slide") return "data-slide-tier={i}";
  if (k === "timeMode") return "data-setup-time-mode=";
  if (k === "roundUnit") return "data-setup-round=";
  if (k === "menu") return "data-setup-field={`menu:${ci}:${ii}:" + key.split(":")[3] + "`}";
  return `data-setup-field="${key}"`;
};
const bad: string[] = [];
for (const [step, w, key] of all) {
  const mk = markerOf(key); const at = WZ.indexOf(mk);
  const blk = stepBlocks.find((b) => at >= b.from && at < b.to);
  if (at < 0 || !blk || blk.n !== step) bad.push(`${key}（STEP ${step}・${w.slice(0, 20)}）→ 目印 ${mk} ${at < 0 ? "なし" : `は STEP ${blk?.n}`}`);
}
check("m141(1-3) ★「直す」の飛び先＝要確認の種類ごとに、その STEP の描画の中に欄の目印がある（ルール・時給スライド・延長・丸めは既存の data-*・ほかは data-setup-field）", bad.length === 0, bad);
check("m141(1-4) 鍵 → セレクタ（v5CheckSelectorOf）", v5CheckSelectorOf("rule:2") === '[data-rule="2"]' && v5CheckSelectorOf("slide:1") === '[data-slide-tier="1"]' && v5CheckSelectorOf("timeMode") === "[data-setup-time-mode]" && v5CheckSelectorOf("roundUnit") === "[data-setup-round]" && v5CheckSelectorOf("menu:0:1:p") === '[data-setup-field="menu:0:1:p"]' && v5CheckSelectorOf("pay:trial") === '[data-setup-field="pay:trial"]');
check("m141(1-5) 「直す」＝fixCheck(i, key)（STEP は 0 始まりのまま＝go(i - 1) を廃止）・欄へスクロールして入力にフォーカス", WZ.includes("onClick={() => fixCheck(i, key)}>直す</button>") && !WZ.includes("go(i - 1 < 0 ? 0 : i - 1)") && WZ.includes("document.querySelector(v5CheckSelectorOf(key))") && WZ.includes("f.focus?.({ preventScroll: true })"));
// 値段 0 円＝確認画面のメニューの段
const z = v5ZeroPriceItems(S);
check("m141(2-1) 値段 0 円の商品の一覧（レジに出す・名前あり）＝v5ZeroPriceItems", z.length === 1 && z[0].ci === 0 && z[0].ii === 1 && z[0].p === 0, z);
check("m141(2-2) 確認画面のメニューの段に「値段 0 円の商品」と値段の欄（data-setup-field=confirm:menu:…:p）・「直す」は確認画面の欄があればそこへ", WZ.includes("値段 0 円の商品（このまま直せます）") && WZ.includes("data-setup-field={`confirm:menu:${z.ci}:${z.ii}:p`}") && WZ.includes("data-setup-zero-list={zeroItems.length}") && WZ.includes("document.querySelector(`[data-setup-field=\"confirm:${key}\"]`)"));
// ガールズバー（スナックの代用）のテンプレート＝ボトルキープ管理料 0 円
const gb = applyMenuTemplate(applyType(v5DefaultState("2026-11-10"), "girlsbar"), "snack", { mixFree: false, adjPct: 0 });
const gz = v5ZeroPriceItems(gb);
check("m141(2-3) ガールズバー（スナックの代用テンプレート）＝0 円は「その他／ボトルキープ管理料」の 1 件・要確認に鍵 menu:…:p", gz.length === 1 && gz[0].n === "ボトルキープ管理料" && v5Checks(gb).some(([i, w, k]) => i === 3 && /ボトルキープ管理料」の値段が 0 円/.test(w) && k === `menu:${gz[0].ci}:${gz[0].ii}:p`), gz);

// ── M-142 ──
check("m142(1) カード＝項目名を上・値を下の 2 段（dt／dd を 1 つの div に）・値は keep-all", WZ.includes('data-setup-box-rows="2"') && WZ.includes('wordBreak: "keep-all"') && !WZ.includes('gridTemplateColumns: "auto 1fr", gap: "2px 10px"'));
check("m142(2) キャスト待遇のカードは wide（PC で横 2 枠）＝.nox-setup-wide（720px 以上で span 2）", /\{box\(4, "キャスト待遇", \[[\s\S]*?\], true\)\}/.test(WZ) && /@media \(min-width: 720px\) \{ \.nox-setup-wide \{ grid-column: span 2; \} \}/.test(src("app/globals.css")));

// ── M-143 ──
const S3 = clone(base); S3.punch.gate = true; S3.devReg = false;
const plan = buildV5Plan(S3, { storeId: "11111111-1111-4111-8111-111111111111", current: { round_unit: 100, round_mode: "down", time_mode: "auto", time_per: "person", receipt: { address: "", tel: "", reg_no: "", footer: "" }, mine: {} as never, tax: { business_tax_status: "taxable", price_display: "in", invoice_status: "none", invoice_reg_no: null, tax_rounding: "floor", card_surcharge_rate: null } }, deviceIdemKey: "d", staffIdemKeys: [] } as never);
const patch = plan.steps.find((s) => s.key === "settings")?.args?.p_patch as Record<string, unknown> | undefined;
check("m143(1) 要確認から「出勤していない人はレジを使えない」を撤去・計画の settings patch に duty_gate を送らない・器の表と後回しにも無い",
  !v5Checks(S3).some(([, w]) => /出勤していない人はレジを使えない/.test(w)) && !!patch && patch.duty_gate === undefined && !V5_SAVE_MAP.some((x) => /打刻ゲート/.test(x.item)) && !plan.deferred.some((d) => /打刻ゲート/.test(d.item)));
check("m143(2) 初期設定の項目（シフト・勤怠の段の Opt）・店舗設定のスイッチ（data-duty-gate）・キャスト一覧の案内文「打刻ゲート ON の店は」を撤去",
  !WZ.includes('<Opt title="出勤していない人はレジを使えない"') && !src("app/(manage)/master/store-profile-panel.tsx").includes("data-duty-gate") && !src("app/(manage)/master/store-profile-panel.tsx").includes("打刻ゲート（出勤していない人はレジを使えない）") && !src("app/(manage)/casts/casts-board.tsx").includes("打刻ゲート ON の店は"));

if (fails.length) { console.error(`✗ verify:nox-m141 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-m141 OK (${pass} checks)`);
console.log("M-141 直す＝欄へ・0 円の一覧／M-142 カード 2 段・待遇は横 2 枠／M-143 duty_gate 撤去");
