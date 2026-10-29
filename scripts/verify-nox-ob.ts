/*
 * verify:nox-ob — OB 便（2026-10-26）: 初期設定 v4 の本番化。DB 不触（純関数＝buildSetupPlan＋逐語 grep）。
 *  ① 正本モック（初期設定 v4）を repo へ（docs/handoff/mock/setup_v4.html）
 *  ② 定休日＝営業時間の曜日に定休日として保存（set_store_business_hours p_is_closed true・時刻は null）
 *  ③ 税設定＝端数の扱い・インボイス（登録番号があれば登録）を set_store_tax_config（7 引数全値明示・変わるときだけ）
 *  ④ 新しい店の既定（Agoora 確定 10/26）＝送りは定額徴収（未設定の店だけ明示）・ノルマは 4 軸・キオスクの給与表示は OFF（kiosk_payroll が true のときだけ見せる）・手数料は店の率が既定
 *  ob を渡さない（従来の呼び出し）＝計画は従来と同じ
 */
import fs from "node:fs";
import { buildSetupPlan, type SetupSelection } from "../lib/nox/setup/template-plan";
import { kioskPayrollAllowedOf } from "../lib/nox/rules-0175/kiosk";
import { PAY_FEE_MODES } from "../lib/nox/rules-0175/pay-fee";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

const html = fs.existsSync("docs/handoff/mock/setup_v4.html") ? src("docs/handoff/mock/setup_v4.html") : "";
check("ob(1-1) 正本モック（初期設定 v4）が repo にある（9 STEP・iPad 向け）", html.includes("<title>NOX 初期設定 v3（iPad 向け）</title>") && html.includes('var STEPS=["お店","席・卓","料金","メニュー","キャスト待遇","スタッフ","シフト・勤怠","会計・レジ","確認"];'));

const wiz = src("app/(manage)/setup/setup-wizard.tsx"), plan = src("lib/nox/setup/template-plan.ts"), page = src("app/(manage)/setup/page.tsx");
// 最小の選択（fixture）
const base = {
  storeId: "s1", biz: "cabaret", features: {} as never, storeName: null, tel: "", address: "", hours: { open: "20:00", close: "01:00", cutoff: "06:00" },
  seats: { table_count: 0, vip_count: 0, counter_count: 0 } as never, includeProducts: false, products: [], pricing: { hon_fee: 3000, jonai_fee: 2000, dohan_fee: 3000, service_rate: 20, set_min: 60, set_fee: 7000, ext_min: 30, ext_fee: 3500, rules: [] } as never, plans: [],
  payTimeBasis: "punch", lateGraceMin: null, norms: true, okuriBase: 1000, billingMode: "table", cardFee: { on: false, rate: 0 }, receivablePolicy: "allow" as never, mine: {} as never,
  current: { card_tax_rate: 0, round_unit: 1, round_mode: "floor", time_mode: "x", time_per: "x", receipt: { address: "", tel: "", reg_no: "T1234567890123", footer: "" }, mine: {} as never,
    tax: { business_tax_status: "taxable", price_display: "tax_included", invoice_status: "unregistered", invoice_reg_no: null, tax_rounding: "floor", card_surcharge_rate: null }, okuriMode: null },
} as unknown as SetupSelection;
let p0: ReturnType<typeof buildSetupPlan> = [], p1: ReturnType<typeof buildSetupPlan> = [];
try { p0 = buildSetupPlan(base); p1 = buildSetupPlan({ ...base, ob: { holidays: [0, 3], taxRounding: "round" } }); } catch (e) { fails.push(`buildSetupPlan: ${(e as Error).message}`); }
const keys0 = p0.map((x) => x.key), keys1 = p1.map((x) => x.key);
check("ob(2-1) 定休日＝日・水は p_is_closed true（時刻は null）・ほかは営業時間・ob なしは従来（全曜日営業）", (p1.find((x) => x.key === "hours_0")?.args as Record<string, unknown> | undefined)?.p_is_closed === true && (p1.find((x) => x.key === "hours_0")?.args as Record<string, unknown>)?.p_open_hm === null && (p1.find((x) => x.key === "hours_3")?.args as Record<string, unknown>)?.p_is_closed === true && (p1.find((x) => x.key === "hours_1")?.args as Record<string, unknown>)?.p_is_closed === false && (p0.find((x) => x.key === "hours_0")?.args as Record<string, unknown>)?.p_is_closed === false);
const tax = p1.find((x) => x.key === "tax_config");
check("ob(3-1) 税設定＝端数（四捨五入）と登録番号（T＋13 桁＝登録）が変わるので set_store_tax_config を 7 引数全値明示で 1 回・ob なしは呼ばない", !!tax && tax.rpc === "set_store_tax_config" && JSON.stringify(Object.keys(tax.args ?? {}).sort()) === JSON.stringify(["p_business_tax_status", "p_card_surcharge_rate", "p_invoice_reg_no", "p_invoice_status", "p_price_display", "p_store_id", "p_tax_rounding"]) && (tax.args as Record<string, unknown>).p_tax_rounding === "round" && (tax.args as Record<string, unknown>).p_invoice_status === "registered" && !keys0.includes("tax_config"), tax);
const pSame = buildSetupPlan({ ...base, current: { ...base.current, receipt: { ...base.current.receipt, reg_no: "" } }, ob: { holidays: [], taxRounding: "floor" } });
check("ob(3-2) 変わらないとき（端数＝現値・登録番号なし）は税設定を呼ばない", !pSame.some((x) => x.key === "tax_config"));
check("ob(4-1) 新しい店の既定＝送りの方式が未設定なら定額徴収（set_store_okuri_mode flat）・設定済みの店は触らない・ノルマを使う店は 4 軸（set_store_norm_axes）", (p1.find((x) => x.key === "okuri_mode")?.args as Record<string, unknown>)?.p_mode === "flat" && !buildSetupPlan({ ...base, current: { ...base.current, okuriMode: "actual" }, ob: { holidays: [], taxRounding: "floor" } }).some((x) => x.key === "okuri_mode") && JSON.stringify((p1.find((x) => x.key === "norm_axes")?.args as Record<string, unknown>)?.p_axes) === JSON.stringify({ days: true, dohan: true, sales: true, shimei: true }) && !buildSetupPlan({ ...base, norms: false, ob: { holidays: [], taxRounding: "floor" } }).some((x) => x.key === "norm_axes") && !keys0.includes("okuri_mode") && !keys0.includes("norm_axes"));
check("ob(4-2) キオスクの給与表示＝既定 OFF（kiosk_payroll が true のときだけ）・手数料の既定＝店の率（4 択の先頭）", kioskPayrollAllowedOf({}) === false && kioskPayrollAllowedOf({ kiosk_payroll: true }) === true && PAY_FEE_MODES[0] === "auto");
check("ob(5-1) 配線＝ウィザードに定休日（7 曜日・複数）と端数の扱い・計画に ob・ページが税設定の現値と送りの方式を読む", wiz.includes('data-setup-holidays="1"') && wiz.includes('ariaLabel="端数の扱い"') && wiz.includes("buildV5Plan(S, ctx)") /* ★便 OB-2: v5 の計画 */ && page.includes("business_tax_status, price_display, invoice_status, invoice_reg_no, tax_rounding, card_surcharge_rate") && plan.includes('rpc: "set_store_tax_config"'));

if (fails.length) { console.error(`verify:nox-ob FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`verify:nox-ob OK ${pass} checks（OB 便＝初期設定 v4 の本番化）`);
