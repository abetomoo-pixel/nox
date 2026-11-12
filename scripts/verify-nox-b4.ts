/**
 * verify:nox-b4 — client 便（2026-11-12・画面だけ・DDL なし）。DB は触らない（source と純関数だけ）。
 *  (1) M-187 ナビの名前＝ホーム／シフト  (2) M-188 定休のマスと凡例  (3) M-183 明細の見出しとファイル名  (4) 裁定334 締め日の選択と送信を外す
 *  (5) M-190 % の単位・M-189 a キオスクの分の欄・M-191 精算方式の折り返し  (6) M-189 b 内部の言葉  (7) M-186 1 人への催促の LINE  (8) M-192 開卓の見込みの曜日
 *  (9) M-182 分析の主要客リスト（案 A）
 */
import fs from "node:fs";
import { wishNavLabelOf, wishPageTextOf } from "../lib/nox/mine/wish-mode";
import { DAY_STATE_ORDER, dayStateLabelOf, dayStateOf } from "../lib/nox/mine/day-state";
import { closedDaysOfMonth, dowOfYmd, monthDaysOf, probeDaysOf } from "../lib/nox/mine/closed-days";
import { slipPdfTitleOf } from "../lib/nox/payroll/list";
import { buildV5Plan, applyType, v5DefaultState, type V5Ctx } from "../lib/nox/setup/v5";
import { MINE_SETTINGS_DEFAULT } from "../lib/nox/store/mine-settings";
import { lineNotifyKindOfNotif } from "../lib/nox/line/notify-kinds";
import { resolveRuleOf, type EstimateRule } from "../lib/nox/register/open-estimate";
import { castTableRowsOf, filterCastRows, sortCastRows } from "../lib/nox/analytics/cast-table";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const ctx: V5Ctx = { storeId: "11111111-1111-4111-8111-111111111111", current: { round_unit: 1, round_mode: "down", time_mode: "manual", time_per: "person", receipt: { address: "", tel: "", reg_no: "", footer: "" }, mine: { ...MINE_SETTINGS_DEFAULT }, tax: { business_tax_status: "taxable", price_display: "tax_excluded", invoice_status: "unregistered", invoice_reg_no: "", tax_rounding: "floor", card_surcharge_rate: 0 } } as unknown as V5Ctx["current"], deviceIdemKey: "22222222-2222-4222-8222-222222222222", staffIdemKeys: [] }; // verify-nox-s3 と同じ

// (1) M-187
{
  const ml = src("app/mine/layout.tsx");
  check("b4(1-1) M-187 キャストのナビ＝「ホーム」「シフト」（休み希望だけの店も「シフト」）・見出しも「シフト」", ml.includes('{ href: "/mine", label: "ホーム" }') && !ml.includes('label: "マイ"')
    && wishNavLabelOf("shift") === "シフト" && wishNavLabelOf("off_only") === "シフト" && wishPageTextOf("shift").title === "シフト" && wishPageTextOf("off_only").title === "シフト");
}
// (2) M-188
{
  check("b4(2-1) M-188 定休＝期間外と分ける（マスに「定休」・凡例は「定休」と「期間外」）", DAY_STATE_ORDER.includes("closed") && dayStateLabelOf("closed") === "定休" && dayStateLabelOf("dim") === "期間外"
    && dayStateOf({ wish: null, shift: null, open: true, closed: true }).mark === "定休" && dayStateOf({ wish: null, shift: null, open: false }).key === "dim");
  const days = monthDaysOf("2026-11");
  const sun = new Set(days.filter((d) => dowOfYmd(d) === 0));
  const cl = closedDaysOfMonth("2026-11", new Set([0]), [{ day: "2026-11-15", kind: "open" }, { day: "2026-11-18", kind: "closed" }]);
  check("b4(2-2) その月の定休日＝曜日の定休（日曜）＋臨時休業（11/18）・臨時営業（11/15 の日曜）は除く・代表の日は特別日を避けて曜日ごとに 1 日",
    days.length === 30 && cl.has("2026-11-01") && cl.has("2026-11-08") && !cl.has("2026-11-15") && cl.has("2026-11-18") && cl.size === sun.size && probeDaysOf("2026-11", ["2026-11-01"]).get(0) === "2026-11-08" && probeDaysOf("2026-11", []).size === 7, [...cl]);
  const wf = src("app/mine/wishes/wish-form.tsx");
  check("b4(2-3) 希望の画面＝月を開いたら store_special_days と shift_is_closed_day（曜日ごと）で定休日を先に出す", wf.includes("probeDaysOf(month, specials.map((s) => s.day))") && wf.includes('supabase.rpc("shift_is_closed_day", { p_store_id: storeId, p_date: d })') && wf.includes("setClosedDates(closedDaysOfMonth(month, dows, specials))"));
}
// (3) M-183
{
  check("b4(3-1) M-183 ファイル名＝給与明細_年月_店名_本人の名前・使えない文字は _", slipPdfTitleOf("ひなの", "2026-10", "CLUB ACE") === "給与明細_2026-10_CLUB ACE_ひなの" && slipPdfTitleOf("a/b", "2026-10", "X:Y") === "給与明細_2026-10_X_Y_a_b");
  const mp = src("app/mine/page.tsx"), pb = src("app/mine/print-payslip-button.tsx");
  check("b4(3-2) M-183 /mine の明細＝店名・本人の名前（store と castName を渡す）・印刷のファイル名＝document.title を印刷中だけ変える", mp.includes("castName={meCast?.name ?? undefined}") && mp.includes("store={myStore ? { name: myStore.name as string") && mp.includes("<PrintPayslipButton fileTitle={slipPdfTitleOf(") && pb.includes("document.title = fileTitle;") && pb.includes('window.addEventListener("afterprint", done);'));
}
// (4) 裁定334
{
  const sp = src("app/(manage)/master/store-profile-panel.tsx"), sw = src("app/(manage)/setup/setup-wizard.tsx");
  const T = applyType(v5DefaultState("2026-11-12"), "cabaret"); T.payroll.close = "20"; // 古い下書きに 20 日が残っていても送らない
  const plan = buildV5Plan(T, ctx);
  const patch = (plan.steps.find((s) => s.key === "settings")?.args?.p_patch ?? {}) as Record<string, unknown>;
  check("b4(4-1) 裁定334 締め日を選ぶ UI が無い（店舗設定・初期設定とも「月末（固定）」の表示だけ）", !sp.includes('options={[["15", "15 日"]') && sp.includes('data-close-day-fixed="1">月末（固定）') && !sw.includes('ariaLabel="締め日"') && sw.includes('data-close-day-fixed="1">月末（固定）'));
  check("b4(4-2) 裁定334 client は締め日のキーを送らない（店舗設定の patch・初期設定の計画）・説明の内部の言葉も無い", !sp.includes("out.settlement_close_day") && patch.settlement_close_day === undefined && !sp.includes("末日以外は 0191 の器") && !src("lib/nox/setup/v5.ts").includes("patch.settlement_close_day"), patch);
}
// (5) M-190／M-189 a／M-191
{
  const sp = src("app/(manage)/master/store-profile-panel.tsx"), pr = src("app/(manage)/master/products/products-board.tsx");
  check("b4(5-1) M-190 手数料 3 欄と場内・フリーのバック率に「%」", sp.includes('<UnitBox post="%" width="100%"><input type="number" min={0} max={100} step={1} inputMode="numeric" value={form.pay_fee[k]}') && pr.includes('data-back-pct="jonai" /></UnitBox>') && pr.includes('data-back-pct="free" /></UnitBox>'));
  check("b4(5-2) M-189 a キオスクの分の欄は上に寄せる（行の高さに引き伸ばさない）・M-191 精算方式は wrap", sp.includes('alignContent: "start", alignSelf: "start", justifyItems: "start" }} data-kiosk-person-idle="0192"') && sp.includes('options={SETTLEMENT_CYCLE_OPTIONS} ariaLabel="精算方式" wrap />'));
}
// (6) M-189 b
{
  const files = ["app/(manage)/audit/audit-board.tsx", "app/(manage)/master/cast-comp/page.tsx", "app/(manage)/master/cast-comp/plan/plan-editor.tsx", "app/(manage)/master/cast-register-panel.tsx", "app/(manage)/master/kiosk-device-panel.tsx", "app/(manage)/master/kiosk-pin-panel.tsx", "app/(manage)/master/products/products-board.tsx", "app/(manage)/staff/staff-board.tsx", "app/(manage)/staff/staff-work-panel.tsx", "components/nox/kiosk-unlock-pad.tsx", "components/nox/no-shift-confirm.tsx", "components/nox/settlement-presets-editor.tsx", "lib/nox/store-systems.ts", "lib/nox/line/notify-kinds.ts", "lib/nox/shift/okuri-mode.ts", "lib/nox/payroll/advance-okuri.ts", "lib/nox/ui/rpc-err.ts", "app/(manage)/setup/setup-wizard.tsx", "lib/nox/setup/v5.ts"];
  const bad = ["裁定により<b>", "店フラグ＋", "裁定vi・", "0192（cast_pin_status）", "（フラグ対象外）", "スタッフの器が無いため", "0175 適用前か", "自動起票", "0177 の適用前は", "器＝待遇プラン"];
  const hits = files.flatMap((f) => { const s = src(f); return bad.filter((b) => s.includes(b)).map((b) => `${f}:${b}`); });
  check("b4(6-1) M-189 b 店の人に見える文に開発の内部の言葉（mig の番号・器・便・裁定・フラグ・起票）を残さない（一覧の 39 件の文言・★■K-2（2026-11-12）: フラグの裏の未使用の文 14 件は言い換えを戻した＝出さない形は相談役の判断の後）", hits.length === 0, hits);
}
// (7) M-186
{
  const sb = src("app/(manage)/shift/shift-board.tsx"), nt = src("lib/nox/people/notify.ts");
  check("b4(7-1) M-186 1 人への催促も remind＝裁定459 で既定 OFF（お知らせ扱いにしない）", sb.includes('ref: notifRefOf("shift_periods", pe.id), remind: true });') && nt.includes("lineNotifyAllowedOf(supabase, p.castId, p.lineKind ?? p.kind, { remind: p.remind })") && lineNotifyKindOfNotif("other", { remind: true }) === "remind" && lineNotifyKindOfNotif("other") === "notice");
}
// (8) M-192
{
  const r48: EstimateRule = { fee_kind: "set", seat_kind: null, category_id: null, dow_mask: 48, time_from_min: null, time_to_min: null, amount: 8000 } as unknown as EstimateRule;
  const q = (dow: number) => resolveRuleOf([r48], { feeKind: "set", seatKind: "卓", categoryId: null, dow, min: 1260 });
  check("b4(8-1) M-192 開卓の見込み＝曜日（0＝日）を dow_mask（bit0＝月）に直して比べる＝金土のルール（48）は土（6）・金（5）に当たり、日（0）・木（4）には当たらない", q(6) !== null && q(5) !== null && q(0) === null && q(4) === null);
}
// (9) M-182
{
  const rows = castTableRowsOf([{ id: "a", name: "あいり" }, { id: "b", name: "みさき" }, { id: "c", name: "れいな" }], [{ castId: "a", name: "あいり", sales: 600000, hon: 3, jonai: 1, dohan: 0 }, { castId: "b", name: "みさき", sales: 400000, hon: 2, jonai: 0, dohan: 1 }], "final", new Map([["a", 180000], ["b", 160000]]));
  const draft = castTableRowsOf([{ id: "a", name: "あいり" }], [{ castId: "a", name: "あいり", sales: 600000, hon: 3, jonai: 1, dohan: 0 }], "draft", new Map([["a", 180000]]));
  const bySales = sortCastRows(rows, "sales", "desc").map((r) => r.castId), byRate = sortCastRows(rows, "rate", "desc").map((r) => r.castId);
  check("b4(9-1) M-182 キャスト別の表＝在籍全員（売上 0 も）・構成・報酬（確定の月だけ）・報酬率＝報酬 ÷ 按分売上・確定前は「—」（null）", rows.length === 3 && rows.find((r) => r.castId === "a")!.rate === 30 && rows.find((r) => r.castId === "b")!.rate === 40 && rows.find((r) => r.castId === "c")!.sales === 0 && rows.find((r) => r.castId === "c")!.rate === null && rows.find((r) => r.castId === "a")!.share === 60 && draft[0].pay === null && draft[0].rate === null, rows);
  check("b4(9-2) M-182 見出しで並べ替え（null は最後）・検索は名前の絞り込み", JSON.stringify(bySales) === JSON.stringify(["a", "b", "c"]) && JSON.stringify(byRate) === JSON.stringify(["b", "a", "c"]) && filterCastRows(rows, "みさ").length === 1 && filterCastRows(rows, "").length === 3, { bySales, byRate });
  const ab = src("app/(manage)/analytics/analytics-board.tsx"), css = src("app/globals.css");
  check("b4(9-3) M-182 画面＝名前の縦並び（Picker）をやめて表の行で選ぶ・PC は右に固定・1023px 以下は押した行の真下", !ab.includes("<Picker") && ab.includes('data-cast-row={r.castId} onClick={() => setCastSel(castSel === r.castId ? "" : r.castId)}') && ab.includes('<tr className="nox-ana-inline" data-cast-inline="1">') && ab.includes('<aside className="nox-ana-side" data-cast-side="1">')
    && css.includes(".nox-ana-side { position: sticky; top: 12px;") && css.includes("@media (max-width: 1023px) {\n  .nox-ana-a { display: block; }\n  .nox-ana-side { display: none; }\n  .nox-ana-inline { display: table-row; }"));
}

if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-b4 ALL PASS (${pass} assertions)`);
