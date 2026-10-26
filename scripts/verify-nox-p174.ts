/*
 * verify:nox-p174 — 便 P174（2026-10-19）0174 の client（裁定390／394／395）＋GV-55／56（wageNowOf）＋kiosk スタッフ群（355）＋スタッフ勤怠・報酬（356・追補1）＋ACE 延長パターン 3 本。
 *   npm run verify:nox-p174。静的 pin（fs）＋純関数＋live（SELECT のみ＝署名と引数の存在）。
 *   (1) 390: スライド 1〜10 行（slide-rows 純関数・SlideInput の追加／削除・保存前検査・見出しの「3段」撤去）
 *   (2) 394: 減額 4 軸（PENALTY_AXES・採用 OFF の軸は出さない・set_penalty_config 17 引数を常に明示）・GV-51（猶予 3 欄を先頭の独立行）・「表示のみ」注記の撤去
 *   (3) 395: プランの判定タイミング（collect＝プラン→店設定・core＝キャストの値・plan-editor＝p_slide_apply 明示と詳細設定・複製／無効化＝全列を写す）
 *   (4) GV-55／56: wageNowOf（基本／保証（M/D まで）／売上段／pt 段）・currentWageOf の rows・/mine の印・給与の期首保証行（baseOverrideOf）
 *   (5) 355: kiosk のキャスト群／スタッフ群（kiosk_staff_list・staff_punch）・PIN の候補に staff
 *   (6) 356: 給与画面のキャスト／スタッフ切替（?who=staff）・勤怠・報酬の確定状況（押せないボタンなし）
 *   (7) payload: ACE の平日通常に延長 3 本（既定 1）・他 5 店の延長は不変
 *   (8) live: set_penalty_config 17 引数・set_comp_plan の p_slide_apply・kiosk_staff_list／staff_punch
 */
import fs from "node:fs";
import { Client } from "pg";
import { SLIDE_ROWS_MAX, slideAddRow, slideErrOf, slideRemoveRow, slideRowsOf, slideToSave, slideWarnOf } from "../lib/nox/comp/slide-rows";
import { wageNowOf, baseRowOf } from "../lib/nox/cast/wage-now";
import { currentWageOf } from "../lib/nox/cast/current-wage";
import { baseOverrideOf } from "../lib/nox/payroll/base-override";
import { EXT_PATTERNS } from "../scripts/demo/profiles.mjs";

let pass = 0; const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");
const cs = src("app/(manage)/master/cast-comp/comp-sections.tsx"), pe = src("app/(manage)/master/cast-comp/plan/plan-editor.tsx"), pb = src("app/(manage)/master/cast-comp/plan/plan-board.tsx");
const col = src("lib/nox/payroll/collect.ts"), core = src("lib/nox/payroll/core.ts"), cb = src("app/(manage)/casts/casts-board.tsx"), mine = src("app/mine/page.tsx");
const kiosk = src("app/kiosk/page.tsx"), pin = src("app/(manage)/master/kiosk-pin-panel.tsx"), pay = src("app/(manage)/payroll/page.tsx"), sw = src("app/(manage)/staff/staff-work-panel.tsx");

// ── (1) 390
{
  const r3 = slideRowsOf([]);
  check("p174(1-1) slide-rows: 空は初期 3 行・保存済みはその行数・上限 10・追加／削除（最低 1）", r3.length === 3 && slideRowsOf([{ at: 1, wage: 2 }]).length === 1 && SLIDE_ROWS_MAX === 10
    && slideAddRow(Array.from({ length: 10 }, () => ({ at: 0, wage: 0 }))).length === 10 && slideAddRow(r3).length === 4 && slideRemoveRow([{ at: 1, wage: 1 }], 0).length === 1 && slideRemoveRow(r3, 0).length === 2);
  check("p174(1-2) slide-rows: 昇順 strict（RPC と同条件）・0 行は除外・11 段は拒否・時給の下降は警告のみ",
    slideErrOf([{ at: 100, wage: 1 }, { at: 100, wage: 2 }]) !== null && slideErrOf([{ at: 200, wage: 1 }, { at: 100, wage: 2 }]) !== null && slideErrOf([{ at: 100, wage: 1 }, { at: 0, wage: 0 }, { at: 200, wage: 2 }]) === null
    && slideErrOf(Array.from({ length: 11 }, (_, i) => ({ at: i + 1, wage: 1 }))) !== null && slideWarnOf([{ at: 1, wage: 3000 }, { at: 2, wage: 2500 }]) !== null && slideErrOf([{ at: 1, wage: 3000 }, { at: 2, wage: 2500 }]) === null
    && JSON.stringify(slideToSave([{ at: 0, wage: 9 }, { at: 5, wage: 1 }])) === JSON.stringify([{ at: 5, wage: 1 }]));
  check("p174(1-3) SlideInput: slideRowsOf・追加（n/10）・削除・Message で検査と警告・plan-editor は保存前に slideErrOf・見出しに「3段」なし",
    cs.includes("const rows: Slide[] = slideRowsOf(slide);") && cs.includes('data-slide-add="1"') && cs.includes("data-slide-del={i}") && cs.includes('<Message kind="error" style={{ marginTop: 6 }}>{err}</Message>') && cs.includes('<Message kind="warn" style={{ marginTop: 6 }}>{warn}</Message>')
    && pe.includes("const slErr = slideErrOf(draft.salesSlide) ?? slideErrOf(draft.pointSlide);") && !pe.includes("（3段）"));
}
// ── (2) 394＋GV-51
check("p174(2-1) PenaltyTab: 4 軸（出勤日数・同伴・指名・売上）・採用 OFF の軸は出さない（normAxesOf(settings)）・売上は単位の欄（既定 10,000）・norma-board が settings を渡す",
  cs.includes('["shimei", "指名", "norm_shimei_flat", "norm_shimei_per", "回"]') && cs.includes('["sales", "売上", "norm_sales_flat", "norm_sales_per", "単位"]') && cs.includes("PENALTY_AXES.filter(([ax]) => axesOn[ax])") && cs.includes('aria-label="売上ノルマ 不足の単位（円）"')
  && src("app/(manage)/master/cast-comp/norma/norma-board.tsx").includes("<PenaltyTab settings={settings}"));
check("p174(2-2) set_penalty_config は 17 引数を常に明示（penaltyArgsOf）・新 5 引数の既定へ黙って戻さない", cs.includes('supabase.rpc("set_penalty_config", penaltyArgsOf(storeId, penalty))')
  && ["p_norm_shimei_flat", "p_norm_shimei_per", "p_norm_sales_flat", "p_norm_sales_per", "p_norm_sales_unit"].every((k) => cs.includes(k)));
check("p174(2-3) GV-51: 猶予 3 欄（遅刻／早退／残留）はパネル先頭の独立行（data-grace-row）・保存ボタンの直前には無い・「売上・指名ノルマは表示のみ」の注記なし",
  cs.includes('<div data-grace-row="1"') && !cs.includes('{num("late_grace_min")}{num("early_grace_min")}{num("over_grace_min")}\n          <button style={btnDark} onClick={save}>保存</button>') && !cs.includes("売上・指名ノルマは表示のみ"));
// ── (3) 395
check("p174(3-1) collect: comp_plans.slide_apply を読む・キャストごとに applyOf（プランだけ・★便 X13-H H-8＝null は当期の累計・店設定は読まない）・前期窓／期間キー／暫定／'next' 入力の 5 か所が applyOf・core は c.slideApply",
  col.includes("slide_rank_ids, slide_apply\")") && col.includes("const applyOf = (cid: string)") && col.includes("if (anyNext) {") && col.includes("needKeys.add(applyOf(cid0) === \"next\"") && col.includes("const src = applyOf(cid) === \"next\"")
  && col.includes("slideProvisionalOf(slidePeriodByCast.get(cid) as SlidePeriod, applyOf(cid))") && col.includes("...(applyOf(cid) === \"next\" ? { slideApply: \"next\" as const") && (col.match(/win\.slideApply/g) ?? []).length === 0 /* ★便 X13-H H-8: 店設定のフォールバックを撤去 */
  && core.includes('!!c.slideProvisional, c.slideApply === "next")'));
check("p174(3-2) plan-editor: p_slide_apply を常に明示・詳細設定（店の設定に従う／前期の実績／当期の累計）・新規の初期値 next・表示は effApply",
  pe.includes("p_slide_apply: draft.slideApply,") && pe.includes('data-slide-apply="1"') && pe.includes('slideApply: "next", // ★便 P174 T-4') && pe.includes("const effApply") && !pe.includes('slideApplyOf(settings) === "next"'));
check("p174(3-3) 複製／無効化（saveFrom）は 23〜30 引数と区分別 3 欄を行の現在値で写す・plan-editor の保存も区分別 3 欄を写す",
  pb.includes('p_slide_period: p.slide_period ?? "daily", p_slide_basis: p.slide_basis ?? "sales", p_slide_rank_ids: p.slide_rank_ids ?? [],') && pb.includes("p_norm_shimei_target: p.norm_shimei_target ?? null,") && pb.includes("p_slide_apply: p.slide_apply")
  && pb.includes("{ hon: p.product_back_fixed_hon ?? null, jonai: p.product_back_fixed_jonai ?? null, free: p.product_back_fixed_free ?? null }") && pe.includes("cur.product_back_fixed_hon ?? null"));
// ── (4) GV-55／56
{
  const G = (from: string, to: string | null, base: number) => ({ valid_from: from, valid_to: to, overrides_json: { guarantee: true, base } });
  const N = (from: string, to: string | null, ov: Record<string, unknown> = {}) => ({ valid_from: from, valid_to: to, overrides_json: ov });
  const rows = [N("2026-10-01", "2026-10-15"), G("2026-10-16", "2026-10-18", 3200), N("2026-10-19", null)];
  const a = wageNowOf({ planBase: 2200, rows, today: "2026-10-17", lastDay: { hourly: 2200, basis: "保証" } });
  const b = wageNowOf({ planBase: 2200, rows, today: "2026-10-19", lastDay: { hourly: 2200, basis: "保証" } });
  const c = wageNowOf({ planBase: 2200, rows: [N("2026-10-01", null)], today: "2026-10-17", lastDay: { hourly: 2200, basis: "保証" } });
  const d = wageNowOf({ planBase: 2200, rows: [N("2026-10-01", null)], today: "2026-10-17", lastDay: { hourly: 3500, basis: "売上" } });
  check("p174(4-1) wageNowOf: 保証中＝¥3,200「保証（10/18 まで）」・基本 2,200（保証行の base を基本にしない）・期限切れ＝¥2,200「基本」", a.hourly === 3200 && a.suffixLabel === "保証（10/18 まで）" && a.base === 2200 && !a.overridden && b.hourly === 2200 && b.suffixLabel === "基本" && b.guarantee === null, JSON.stringify({ a, b }));
  check("p174(4-2) wageNowOf: GV-55＝保証行が無いのに basis「保証」→「基本」・売上段の日＝¥3,500「売上段」・非保証の個別上書きは overridden", c.suffixLabel === "基本" && c.hourly === 2200 && d.suffixLabel === "売上段" && d.hourly === 3500
    && wageNowOf({ planBase: 2200, rows: [N("2026-10-01", null, { base: 2500 })], today: "2026-10-17" }).base === 2500 && wageNowOf({ planBase: 2200, rows: [N("2026-10-01", null, { base: 2500 })], today: "2026-10-17" }).overridden
    && baseRowOf(rows, "2026-10-17")?.valid_from === "2026-10-01");
  const cw = currentWageOf({ wdays: [{ hourly: 2200, basis: "保証" }] }, { today: "2026-10-17", planBase: 2200, rows });
  check("p174(4-3) currentWageOf(rows): 時給・接尾・保証を wageNowOf で（rows なし＝従来の読み方）・casts-board と /mine が同じ関数", cw.hourly === 3200 && cw.basis === "保証（10/18 まで）" && cw.guarantee && !!cw.now
    && currentWageOf({ wdays: [{ hourly: 2200, basis: "保証" }] }, { today: "2026-10-17" }).basis === "保証" && cb.includes("rows: planRowsOf[c.id] ?? []") && cb.includes('data-wage-now="1"') && mine.includes("wageNowOf({ planBase: null,"));
  const pick = { validFrom: "2026-10-01", override: { guarantee: true, base: 3200 } as never };
  const all = [pick, { validFrom: "2026-10-04", override: { base: 2500 } as never }];
  check("p174(4-4) 給与（R-11 (d)）: 期首行が保証行なら base／guarantee を外し戻し行の base（無ければ外すだけ）・非保証の期首行はそのまま・collect が baseOverrideOf を使う",
    JSON.stringify(baseOverrideOf(pick, all)) === JSON.stringify({ base: 2500 }) && JSON.stringify(baseOverrideOf(pick, [pick])) === "{}" && JSON.stringify(baseOverrideOf({ validFrom: "2026-10-01", override: { base: 2400 } as never }, [])) === JSON.stringify({ base: 2400 })
    && col.includes("override: baseOverrideOf(pick, rows)"));
}
// ── (5) 355
check("p174(5-1) kiosk: kiosk_staff_list（読めなければ空）・キャスト群／スタッフ群のタブ（スタッフがいる店だけ）・staff_punch（in／out・送りなし）・'not in' の和文",
  kiosk.includes('supabase.rpc("kiosk_staff_list")') && kiosk.includes("data-kiosk-group={group}") && kiosk.includes('supabase.rpc("staff_punch", { p_membership_id: target.cast_id, p_pin: pin, p_kind: type })') && kiosk.includes('if (target.staff) { void punch("out"); return; }') && kiosk.includes("出勤の打刻がありません"));
check("p174(5-2) 操作担当 PIN の候補＝owner／manager／staff（can_register 条件なし＝0173）", pin.includes('m.role === "owner" || m.role === "manager" || m.role === "staff"') && !pin.includes('(m.role === "staff" && m.can_register)'));
// ── (6) 356
check("p174(6-1) 給与画面: キャスト／スタッフ切替（?who=staff＝StaffWorkPanel scope store）・勤怠・報酬は確定状況（staff_payroll_runs）＝押せない確定ボタンなし",
  pay.includes("data-payroll-who={who}") && pay.includes('<StaffWorkPanel scope="store" stores={storeList} />') && sw.includes("data-staff-pay-run=") && !sw.includes("報酬を確定する（準備中）"));
// ── (7) payload
{
  const pl = (c: string) => JSON.parse(src(`docs/demo/payload/${c}.json`)).tables as Record<string, Record<string, unknown>[]>;
  const ext = (c: string) => pl(c).pricing_rules.filter((r) => r.fee_kind === "extension");
  const wd = ext("ace").filter((r) => r.dow_mask === ext("ace").find((x) => x.name === "平日通常 延長 60 分")?.dow_mask); // ★便 SH-UI-c2 C2-14: 既定＝60 分
  check("p174(7-1) ACE: 延長 3 本（★便 SH-UI-c2 C2-14 ①＝上限 3）＝平日通常 60 分 ¥13,000〈既定〉／VIP 延長 30 分 ¥9,000（席種は限定しない）／週末通常 30 分 ¥4,000（元データの行）・既定は 1 本・平日 30 分 ¥7,000 は外した",
    wd.length === 2 && wd.filter((r) => r.is_default_ext === true).length === 1 && wd.find((r) => r.is_default_ext)?.amount === 13000 && wd.some((r) => r.amount === 13000 && r.duration_min === 60) && wd.some((r) => r.name === "VIP 延長" && r.amount === 9000 && r.seat_kind === null)
    && ext("ace").length === 3 && ext("ace").some((r) => r.amount === 4000 && r.duration_min === 30) && EXT_PATTERNS.ace.rows.length === 2, JSON.stringify(ext("ace").map((r) => [r.name, r.amount, r.is_default_ext])));
  check("p174(7-2) 他 5 店: 延長に既定の印なし（従来どおり）", ["lily", "luna", "muse", "nest", "noir"].every((c) => ext(c).every((r) => r.is_default_ext === false)));
}

// ── (8) live
async function live() {
  try { process.loadEnvFile(".env.local"); } catch { /* env 無し＝下で missing */ }
  if (!process.env.SUPABASE_DB_URL) { check("p174(8-0) SUPABASE_DB_URL", false, "missing"); return; }
  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 60000 });
  await db.connect();
  try {
    await db.query("set default_transaction_read_only = on");
    const r = (await db.query(`select proname, pronargs, pg_get_function_identity_arguments(oid) a from pg_proc where pronamespace='public'::regnamespace and proname in ('set_penalty_config','set_comp_plan','kiosk_staff_list','staff_punch')`)).rows as { proname: string; pronargs: number; a: string }[];
    const f = (n: string) => r.filter((x) => x.proname === n);
    check("p174(8-1) live: set_penalty_config 17 引数 1 本・set_comp_plan 30 引数 1 本（p_slide_apply）・kiosk_staff_list／staff_punch(uuid, text, text)",
      f("set_penalty_config").length === 1 && f("set_penalty_config")[0].pronargs === 17 && f("set_comp_plan").length === 1 && f("set_comp_plan")[0].pronargs === 32 /* ★0175 v2: 30→32（p_slide_method／p_pt_rules・便 ON-1） */ && f("set_comp_plan")[0].a.includes("p_slide_apply text")
      && f("kiosk_staff_list").length === 1 && f("staff_punch").length === 1 && f("staff_punch")[0].a === "p_membership_id uuid, p_pin text, p_kind text", JSON.stringify(r.map((x) => [x.proname, x.pronargs])));
  } finally { await db.end(); }
}
void live().then(() => {
  if (fails.length) { console.log(`✗ verify:nox-p174 失敗 ${fails.length}（成功 ${pass}）`); for (const x of fails) console.log(" - " + x); process.exit(1); }
  console.log(`verify:nox-p174 OK (${pass} checks)`);
  console.log("便 P174: 390 スライド 1〜10 段・394 減額 4 軸＋GV-51・395 プランの判定タイミング・GV-55／56 wageNowOf・355 kiosk スタッフ群・356 給与のスタッフ切替・ACE 延長 3 本");
});
