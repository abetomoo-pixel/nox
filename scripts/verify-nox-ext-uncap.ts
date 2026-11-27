/*
 * verify:nox-ext-uncap — 0224（裁定508（提案）・相談役 11/26 夜便 N の N3）延長パターンの数の上限（裁定385・0173 の 1 店 3 本）の撤去＝client（旗 MIG_0224_APPLIED の後ろ）。
 *  DB に触れない（純関数と原文の pin）。f0 の chain には入れない（0224 の適用と旗 true の便で入れる）。
 *  (1) 旗＝false（0224 は起草と試走まで）
 *  (2) マスタの表記＝旗 true は「n 件」だけ（上限・超過・満杯の印なし）・旗 false は今のまま「4 件（上限 3・超過）」
 *  (3) レジの一覧の並び（extPickerRowsOf）＝8 本・12 本で 今の時間帯 → 時間帯なし → ほかの時間帯・群の中は凍結の順・見出しは群が 2 つ以上のときだけ・時間帯の表記・選択中の印・旧い凍結（band なし）は今と同じ並び
 *  (4) 原文＝料金マスタ（和文と先回りは旗 false のときだけ・件数の表記）・レジ（自動の「延長パターン ▾」・手動の ▾・手動の時間料金カードの 3 か所が旗の後ろで新しい一覧・旧い一覧は残す）
 *  (5) 初期設定 v5＝旗 false は延長 3 本まで（ob2 と同じ）・旗 true は全部（平日 60 と週末 60 を別に入れる）
 *  (6) 起草のファイル（docs/tmp/ext_pattern_cap_1126・あるときだけ）＝本体は set_pricing_rule 1 本・'too many extension' の raise が無い・begin／commit が 1 つずつ
 *  使い方: npx tsx scripts/verify-nox-ext-uncap.ts
 */
import fs from "node:fs";
import { MIG_0224_APPLIED, mig0224On, __set0224ForTest } from "../lib/nox/rules-0175/flag";
import { extCountTextOf, extCountTextV2Of, extPickerRowsOf, extBandTextOf, EXT_PICKER_BOX_STYLE, type ExtPickItem } from "../lib/nox/rules-0175/ext-pattern";
import { applyType, buildV5Plan, v5DefaultState, type V5Ctx, type V5State } from "../lib/nox/setup/v5";
import { MINE_SETTINGS_DEFAULT } from "../lib/nox/store/mine-settings";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const J = JSON.stringify;
const src = (p: string) => fs.readFileSync(p, "utf8");

// (1)
check("(1-1) 旗 MIG_0224_APPLIED は false（0224 は起草と試走まで）・mig0224On() も false", (MIG_0224_APPLIED as boolean) === false && mig0224On() === false);

// (2)
check("(2-1) 旗 true の表記＝件数だけ（4・8・12 本とも超過の印なし）", J([4, 8, 12].map(extCountTextV2Of)) === J([{ text: "4 件", over: false, full: false }, { text: "8 件", over: false, full: false }, { text: "12 件", over: false, full: false }]));
check("(2-2) 旗 false の表記は今のまま（4 件（上限 3・超過））", J(extCountTextOf(4)) === J({ text: "4 件（上限 3・超過）", over: true, full: true }));

// (3) 試走（try-0224）と同じ 8 本・12 本の凍結メニュー（並び＝既定→priority→作成順）。今＝営業日の分 1165（19:25）・今の時間帯 18:25〜20:25・朝の時間帯 08:00〜10:00
const it = (id: string, d: number, a: number, band: { from: number; to: number } | null, def = false): ExtPickItem => ({ rule_id: id, duration_min: d, amount: a, label: `延長 ${d}分 ¥${a}`, is_default: def, unit: "table", band });
const NOW = { from: 1105, to: 1225 }, MORN = { from: 480, to: 600 };
const M8 = [it("r1", 60, 13000, null, true), it("r2", 30, 7000, null), it("r3", 60, 15000, null), it("r4", 30, 8000, null), it("r5", 45, 10000, null), it("r6", 30, 6000, NOW), it("r7", 60, 12000, MORN), it("r8", 20, 5000, null)];
const M12 = [...M8, it("r9", 30, 9000, null), it("r10", 60, 18000, null), it("r11", 90, 25000, null), it("r12", 15, 3000, null)];
const r8 = extPickerRowsOf(M8, 1165, "r8");
check("(3-1) 8 本＝今の時間帯（r6）→ 時間帯なし（r1〜r5・r8＝凍結の順）→ ほかの時間帯（r7）", J(r8.map((r) => r.item.rule_id)) === J(["r6", "r1", "r2", "r3", "r4", "r5", "r8", "r7"]), r8.map((r) => r.item.rule_id));
check("(3-2) 8 本＝見出しは群の頭だけ（今の時間帯・時間帯なし・ほかの時間帯）・時間帯の表記 18:25〜20:25／08:00〜10:00・選択中は r8 だけ",
  J(r8.map((r) => r.heading)) === J(["今の時間帯", "時間帯なし", null, null, null, null, null, "ほかの時間帯"]) && r8[0].bandText === "18:25〜20:25" && r8[7].bandText === "08:00〜10:00" && r8[1].bandText === null
  && r8.filter((r) => r.current).map((r) => r.item.rule_id).join() === "r8", r8.map((r) => [r.heading, r.bandText, r.current]));
const r12 = extPickerRowsOf(M12, 1165, null);
check("(3-3) 12 本＝今の時間帯 1・時間帯なし 10・ほかの時間帯 1＝全部出る（落とさない）・選択中なし", r12.length === 12 && r12.filter((r) => r.group === "now").length === 1 && r12.filter((r) => r.group === "allday").length === 10 && r12.filter((r) => r.group === "other").length === 1 && r12.every((r) => !r.current) && r12[0].item.rule_id === "r6" && r12[11].item.rule_id === "r7");
const r12b = extPickerRowsOf(M12, 500, null); // 朝 08:20
check("(3-4) 時刻で並びが変わる＝08:20 は朝の時間帯（r7）が上・夕方の時間帯（r6）が下", r12b[0].item.rule_id === "r7" && r12b[11].item.rule_id === "r6", r12b.map((r) => r.item.rule_id));
const old = M8.map(({ band: _b, ...x }) => x as ExtPickItem);
const rOld = extPickerRowsOf(old, 1165, null);
check("(3-5) 旧い凍結（band キーなし＝0187 前）＝凍結の順のまま・見出しなし", J(rOld.map((r) => r.item.rule_id)) === J(M8.map((m) => m.rule_id)) && rOld.every((r) => r.heading === null && r.bandText === null));
check("(3-6) 締めの後の時間帯（営業日の分 1440〜1560）の表記は 00:00〜02:00", extBandTextOf({ from: 1440, to: 1560 }) === "00:00〜02:00" && extBandTextOf(null) === null);
check("(3-7) 一覧の箱は高さを抑えてスクロール（多いときに画面からはみ出さない）", EXT_PICKER_BOX_STYLE.maxHeight === "min(60vh, 420px)" && EXT_PICKER_BOX_STYLE.overflowY === "auto");

// (4) 原文
const pb = src("app/(manage)/master/pricing/pricing-board.tsx");
const rb = src("app/(manage)/register/register-board.tsx");
check("(4-1) 料金マスタ＝'too many extension' の和文と 4 件目の先回りは旗 false のときだけ・件数の表記は旗で分岐・説明文は旗 true で「数の上限なし」",
  pb.includes('if (!mig0224On() && msg.includes("too many extension"))') && pb.includes("if (!mig0224On() /* ★0224: 上限の撤去の後は先回りしない */ && fk === \"extension\" && !existing")
  && pb.includes("const extCount = mig0224On() ? extCountTextV2Of(exts.length) : extCountTextOf(exts.length);") && pb.includes("{extCountLabel}") /* ★2026-11-27: verify-nox-messages の {x.text} を避けて名前を替えた */ && pb.includes("数の上限なし") && pb.includes('data-ext-note={mig0224On() ? "uncap" : "cap3"}'));
check("(4-2) レジ＝自動の「延長パターン ▾」・手動の ▾・手動の時間料金カードの 3 か所が旗 true で新しい一覧（extPickerRowsOf・今の営業日の分）・旧い一覧は旗 false で残す",
  rb.includes('{extAutoMenu && mig0224On() && (') && rb.includes('{extAutoMenu && !mig0224On() && (') && rb.includes('data-ext-picker="auto"')
  && rb.includes('{extBarMenu && mig0224On() && (') && rb.includes('{extBarMenu && !mig0224On() && (') && rb.includes('data-ext-picker="bar"')
  && rb.includes("(check.ext_menu_snap?.length ?? 0) >= 2 && mig0224On() ? (") && rb.includes('data-ext-picker="manual"')
  && (rb.match(/extPickerRowsOf\(/g) ?? []).length === 3 && (rb.match(/bizClockOf\(new Date\(nowMs\), cutoffHm\)\.min/g) ?? []).length >= 4 && (rb.match(/\.\.\.EXT_PICKER_BOX_STYLE/g) ?? []).length === 2);
check("(4-3) レジの切替と追加は今と同じ RPC（自動＝check_set_ext_rule・手動＝check_extension_add の p_rule_id）", rb.includes("void setExtRule(row.item.rule_id)") && rb.includes('void addExtension(row.item.rule_id, "bar")') && rb.includes("void addExtension(m.rule_id)}"));

// (5) 初期設定 v5
const ctx: V5Ctx = { storeId: "11111111-1111-4111-8111-111111111111", deviceIdemKey: "00000000-0000-4000-8000-000000000001", staffIdemKeys: ["00000000-0000-4000-8000-000000000002"],
  current: { round_unit: 1, round_mode: "down", time_mode: "fixed", time_per: "table", receipt: { address: "", tel: "", reg_no: "", footer: "" }, mine: { ...MINE_SETTINGS_DEFAULT }, tax: { business_tax_status: "taxable", price_display: "tax_excluded", invoice_status: "unregistered", invoice_reg_no: null, tax_rounding: "floor", card_surcharge_rate: null } } };
const stateOf = (): V5State => { const s = applyType(v5DefaultState("2026-11-26"), "cabaret"); s.payroll.okuriFlatBase = 1000; return s; };
const extSteps = (s: V5State) => buildV5Plan(s, ctx).steps.filter((x) => x.rpc === "set_pricing_rule" && x.args!.p_fee_kind === "extension");
const s0 = stateOf(); const total = s0.rules.reduce((a, r) => a + r.ext.length, 0);
const off = extSteps(s0).length;
__set0224ForTest(true); const on = extSteps(stateOf()).length;
// 平日／週末 × 60／30 の 4 本＋時間帯つき 4 本＝8 本（試しの店の形）
const s8 = stateOf(); const base = s8.rules[0];
s8.rules = [
  { ...base, name: "平日", days: ["月", "火", "水", "木"], ext: [[60, 13000, 1], [30, 7000, 0]] },
  { ...base, name: "週末", days: ["金", "土"], ext: [[60, 15000, 0], [30, 8000, 0]] },
  { ...base, name: "平日 遅い", days: ["月", "火", "水", "木"], from: "23:00", to: base.to, ext: [[60, 14000, 0], [30, 7500, 0]] },
  { ...base, name: "週末 遅い", days: ["金", "土"], from: "23:00", to: base.to, ext: [[60, 16000, 0], [30, 8500, 0]] },
] as V5State["rules"];
const on8 = extSteps(s8); const plan8 = buildV5Plan(s8, ctx);
__set0224ForTest(false); const off8 = extSteps(s8).length;
__set0224ForTest(null);
check("(5-1) 旗 false＝キャバクラの延長は 3 本まで（ob2(B-1) と同じ）", off === 3, { off, total });
check("(5-2) 旗 true＝キャバクラの延長は重なりを除いて全部（3 本で切らない）", on >= off && on <= total, { on, total });
check("(5-3) 旗 true＝平日／週末 × 60／30 × 時間帯 2＝8 本を全部入れる・既定は 1 本・後回しに延長の行が無い（旗 false は 2 本＝旧い重なりの鍵「席種:長さ」で平日 60 と週末 60 が 1 本になる）",
  on8.length === 8 && on8.filter((x) => x.args!.p_is_default_ext === true).length === 1 && !plan8.deferred.some((d) => d.item.startsWith("延長パターン")) && off8 === 2,
  { on8: on8.length, off8, deferred: plan8.deferred.map((d) => d.item) });

// (6) 起草のファイル（gitignore の docs/tmp・あるときだけ）
const DR = "docs/tmp/ext_pattern_cap_1126/0224_ext_pattern_uncap.sql";
if (fs.existsSync(DR)) {
  const m = src(DR); const lines = m.split(/\r?\n/).map((l) => l.trim());
  check("(6-1) 起草＝begin／commit が 1 つずつ・作り直しは set_pricing_rule 1 本・'too many extension' の raise が無い・★0224 の印",
    lines.filter((l) => l === "begin;").length === 1 && lines.filter((l) => l === "commit;").length === 1 && (m.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length === 1
    && m.includes("CREATE OR REPLACE FUNCTION public.set_pricing_rule(") && !m.includes("raise exception 'too many extension'") && m.includes("★0224（裁定508"));
}

if (fails.length) { console.error(fails.map((f) => "FAIL " + f).join("\n")); console.error(`verify:nox-ext-uncap FAIL ${fails.length}／${pass + fails.length}`); process.exit(1); }
console.log(`verify:nox-ext-uncap OK ${pass} checks`);
