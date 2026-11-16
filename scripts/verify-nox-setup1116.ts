/*
 * verify:nox-setup1116 — 初期設定の直し（Agoora 確定 2026-11-16 ■6）。DB 不触・env 不要＝純関数と逐語 pin。
 *   npm run verify:nox-setup1116。
 *  s(1) 送りの基本額＝定額の店は「本人の退勤と店の端末から送りを記録するときの額」を聞く（最初は空＝保存しない・先へ進めない）・定額でない方式は従来の式（既定 1000）のまま・確認の画面に保存する額。
 *  s(2) 控除の画面（sys_penalties）＝ノルマ ON、または遅刻・当欠の控除の額 > 0。
 *  s(3) キャストのレジの説明＝実際の最初の値（全卓・店の端末だけ・本人ごとの許可）。
 *  s(4) 店の端末の在庫・日報のタイル＝set_store_profile の白名単に無い（mig が要る）ので書かない（従来の 3 キーのまま）。
 *  逆テスト（手動・1 回）: okuriBaseOf の fixed の枝を従来の式に戻す→s(1-2) 赤・戻して緑。
 */
import fs from "node:fs";
import { buildV5Plan, okuriBaseOf, okuriFlatBaseMissingOf, penaltiesOnOf, v5Checks, v5DefaultState, OKURI_FLAT_BASE_REQUIRED, CAST_REGISTER_SETUP_NOTE, type V5State, type V5Ctx } from "../lib/nox/setup/v5";
import { MINE_SETTINGS_DEFAULT } from "../lib/nox/store/mine-settings";
const ctx: V5Ctx = { storeId: "11111111-1111-4111-8111-111111111111", current: { round_unit: 100, round_mode: "up", time_mode: "manual", time_per: "person", receipt: { address: "", tel: "", reg_no: "", footer: "" }, mine: { ...MINE_SETTINGS_DEFAULT }, tax: { business_tax_status: "taxable", price_display: "tax_excluded", invoice_status: "unregistered", invoice_reg_no: "", tax_rounding: "floor", card_surcharge_rate: 0 } } as unknown as V5Ctx["current"], deviceIdemKey: "22222222-2222-4222-8222-222222222222", staffIdemKeys: [] }; // verify:nox-m65 と同じ

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: unknown) { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");
const st = (f: (s: V5State) => void): V5State => { const s = JSON.parse(JSON.stringify(v5DefaultState("2026-11-16"))) as V5State; f(s); return s; };
const patchOf = (S: V5State) => (buildV5Plan(S, ctx).steps.find((x) => x.rpc === "set_store_profile")?.args as { p_patch?: Record<string, unknown> } | undefined)?.p_patch ?? {};

// s(1)
const fixed0 = st((s) => { s.payroll.okuriMode = "fixed"; });
check("s(1-1) 既定の状態は定額・額は空（null）", v5DefaultState("2026-11-16").payroll.okuriMode === "fixed" && (v5DefaultState("2026-11-16").payroll.okuriFlatBase ?? null) === null && okuriFlatBaseMissingOf(fixed0));
check("s(1-2) 定額で空＝保存する額は null・patch に okuri_base_amount を入れない（聞いていない 1000 を書かない）", okuriBaseOf(fixed0) === null && !("okuri_base_amount" in patchOf(fixed0)), patchOf(fixed0).okuri_base_amount);
check("s(1-3) 定額で空＝確認の警告（STEP 5＝index 4）", v5Checks(fixed0).some((w) => w[0] === 4 && w[1] === OKURI_FLAT_BASE_REQUIRED && w[2] === "payroll:okuriFlat"));
const fixed800 = st((s) => { s.payroll.okuriMode = "fixed"; s.payroll.okuriFlatBase = 800; });
check("s(1-4) 定額で 800＝保存 800・警告なし", okuriBaseOf(fixed800) === 800 && patchOf(fixed800).okuri_base_amount === 800 && !okuriFlatBaseMissingOf(fixed800) && !v5Checks(fixed800).some((w) => w[2] === "payroll:okuriFlat"));
check("s(1-5) 定額で 0 も入れた値（0＝送りの記録 0 円）", okuriBaseOf(st((s) => { s.payroll.okuriMode = "fixed"; s.payroll.okuriFlatBase = 0; })) === 0);
const actual = st((s) => { s.payroll.okuriMode = "actual"; });
check("s(1-6) 定額でない方式は従来の式（既定 1000・欄の値）のまま・警告なし", okuriBaseOf(actual) === 1000 && patchOf(actual).okuri_base_amount === 1000 && okuriBaseOf(st((s) => { s.payroll.okuriMode = "store"; s.payroll.okuri = 1200; })) === 1200 && !okuriFlatBaseMissingOf(actual));
const sw = src("app/(manage)/setup/setup-wizard.tsx");
check("s(1-7) 画面＝定額のときだけ欄（最初は空）・入れないと「次へ」と「この内容で始める」を押せない", sw.includes('{pr.okuriMode === "fixed" && <div style={{ marginTop: 8 }} data-setup-okuri-flat="1" data-setup-field="payroll:okuriFlat">')
  && sw.includes('value={pr.okuriFlatBase == null ? "" : String(pr.okuriFlatBase)}') && sw.includes("(S.step === 4 && okuriFlatBaseMissingOf(S))") && sw.includes("|| okuriFlatBaseMissingOf(S) /* ★■6-1: 段の番号から飛んでも始められない */"));
check("s(1-8) 確認の画面＝保存する額（okuriBaseOf）", sw.includes('["送りの基本額（保存する額）", okuriBaseOf(S) === null ? "未入力" :'));

// s(2)
check("s(2-1) ノルマ ON＝控除の画面 ON", penaltiesOnOf(st((s) => { s.pay.norma = true; s.payroll.lateAmt = 0; s.payroll.absentAmt = 0; })));
check("s(2-2) ノルマ OFF でも遅刻か当欠の額 > 0＝ON（スナック・ガールズバー・バー）", penaltiesOnOf(st((s) => { s.pay.norma = false; s.payroll.lateAmt = 1000; })) && penaltiesOnOf(st((s) => { s.pay.norma = false; s.payroll.absentAmt = 3000; })));
check("s(2-3) ノルマ OFF・額 0／未設定＝OFF", !penaltiesOnOf(st((s) => { s.pay.norma = false; s.payroll.lateAmt = 0; s.payroll.absentAmt = 0; })) && !penaltiesOnOf(st((s) => { s.pay.norma = false; delete s.payroll.lateAmt; delete s.payroll.absentAmt; })));
const pen = st((s) => { s.pay.norma = false; s.payroll.lateAmt = 2000; s.payroll.okuriFlatBase = 500; });
check("s(2-4) patch の sys_penalties＝penaltiesOnOf（sys_norms はノルマのまま）", patchOf(pen).sys_penalties === true && patchOf(pen).sys_norms === false);

// s(3)
check("s(3-1) キャストのレジの説明", CAST_REGISTER_SETUP_NOTE.includes("全卓") && CAST_REGISTER_SETUP_NOTE.includes("店の端末だけ") && CAST_REGISTER_SETUP_NOTE.includes("「レジ使用」を許可した人だけ") && sw.includes('<Opt title="キャストのレジ使用" sub={CAST_REGISTER_SETUP_NOTE}>') && !sw.includes("自分の卓だけ・自分のスマホから。"));

// s(4)
check("s(4-1) kiosk_features は 3 キーのまま（在庫・日報は白名単に無い＝mig が要る）", JSON.stringify(Object.keys((patchOf(fixed800).kiosk_features ?? {}) as object)) === JSON.stringify(["punch", "register", "shift"]));

if (fails.length) {
  console.error(`verify:nox-setup1116 FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-setup1116 OK (${pass} checks)`);
console.log("初期設定の直し（■6）: 定額の店の送りの額は必須で聞いた額だけ・控除の画面＝ノルマ ON か遅刻・当欠の額 > 0・キャストのレジの説明・端末のタイルは mig 待ち");
