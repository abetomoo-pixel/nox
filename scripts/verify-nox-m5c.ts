/*
 * verify:nox-m5c — 便 M5（2026-10-30・DB 変更 0）: M-33／M-40 (c)／M-40 (x) の純関数と配線。
 *  (1) M-33 /mine「基本の働き方の確認」＝castTermsSummaryOf（時給・契約区分・送り・ノルマ・バック＝渡された項目だけ行になる・0 行なら hasTerms=false で枠を出さない）・店向け文（カード手数料）は /mine に出さない・題名と注記
 *  (2) M-40 (c) 拒否理由＝castRegisterDenyReasonOf（store_off／not_allowed／store_device_only／null＝castOwnSessionRegisterOf と一致）・CAST_REGISTER_DENY_TEXT の和文 3・cast-entry-server が reason を返し layout が /mine?denied=register&why= に載せ /mine が Message(warn) で出す
 *  (3) M-40 (x) シフト前の退勤＝punchShiftRelationOf／punchOverlapsShiftOf（30 時間表記・跨ぎ）・計算基準 'shift' でも重ならない日は実打刻のまま＋備考「シフト前」「シフト後」・重なる日は従来どおり置換（s-lane shc(3) と同値）
 *  使い方: npm run verify:nox-m5c（env 不要・DB 不触）
 */
import fs from "node:fs";
import { CONTRACT_ACK_BUTTON, CONTRACT_ACK_LINES, CONTRACT_ACK_NOTE, CONTRACT_ACK_STORE_TEXT, CONTRACT_ACK_TITLE, castTermsSummaryOf, contractAckGateOf } from "../lib/nox/mine/contract-ack";
import { CAST_REGISTER_DENY_TEXT, castOwnSessionRegisterOf, castRegisterDenyReasonOf, castRegisterDenyTextOf } from "../lib/nox/register/p173";
import { attendanceDayRowsOf, punchOverlapsShiftOf, punchShiftRelationOf, SHIFT_RELATION_NOTE } from "../lib/nox/payroll/attendance-sheet";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = JSON.stringify;

// ── (1) M-33 ──
const full = castTermsSummaryOf({ hourly: 2200, wageBasis: "基本", guaranteeLabel: "保証時給 ¥3,200（10/18 まで）", employment: "委託", okuriMode: "flat", okuriTierName: "近距離", normDaysTarget: 12, backs: { hon: 1500, jonai: 500, dohan: 1000 } });
check("m5c(1-1) 要約＝時給→契約区分→送り→ノルマ→バックの 5 行（時給は ¥ 区切り・根拠語・保証の印・定額徴収は区分名）",
  J(full) === J(["時給 ¥2,200（基本）・保証時給 ¥3,200（10/18 まで）", "契約区分 委託", "送り 定額徴収・区分 近距離", "出勤ノルマ 月 12 日", "バック 本指名 ¥1,500／場内 ¥500／同伴 ¥1,000"]), full);
check("m5c(1-2) 渡されない／空の項目は行を作らない（時給だけ＝1 行・雇用・送り なし・区分名は flat 以外に付かない・ノルマ 0／null・バック 0 は出ない）",
  J(castTermsSummaryOf({ hourly: 1800 })) === J(["時給 ¥1,800"]) && J(castTermsSummaryOf({ employment: "雇用", okuriMode: "none" })) === J(["契約区分 雇用", "送り なし"])
  && J(castTermsSummaryOf({ okuriMode: "actual", okuriTierName: "近距離" })) === J(["送り タクシー代の立替（レジ現金が出る）"]) && castTermsSummaryOf({ normDaysTarget: 0, backs: { hon: 0, jonai: null } }).length === 0
  && castTermsSummaryOf({ employment: "その他", hourly: null, okuriMode: null }).length === 0 && J(castTermsSummaryOf({ guaranteeLabel: "保証時給 ¥3,000" })) === J(["時給 保証時給 ¥3,000"]));
check("m5c(1-3) 0 行＝hasTerms=false で枠を出さない（contractAckGateOf 第 3 引数・省略は従来どおり）", contractAckGateOf(true, true, castTermsSummaryOf({}).length > 0) === false && contractAckGateOf(true, true, castTermsSummaryOf({ hourly: 2000 }).length > 0) === true && contractAckGateOf(true, true) === true && contractAckGateOf(false, true, true) === false);
check("m5c(1-4) 題名「基本の働き方の確認」・注記「条件が入った／改定されたときにもう一度表示されます。」・ボタン不変・店向け文（カード手数料）は /mine の文面に無い（定数は pricing-board 用に残る）",
  CONTRACT_ACK_TITLE === "基本の働き方の確認" && CONTRACT_ACK_NOTE === "条件が入った／改定されたときにもう一度表示されます。" && CONTRACT_ACK_BUTTON === "確認しました" && !CONTRACT_ACK_LINES.includes(CONTRACT_ACK_STORE_TEXT) && CONTRACT_ACK_STORE_TEXT.startsWith("加盟店契約")
  && src("app/(manage)/master/pricing/pricing-board.tsx").includes(CONTRACT_ACK_STORE_TEXT));
const gate = src("app/mine/contract-ack-gate.tsx"), mine = src("app/mine/page.tsx");
check("m5c(1-5) 配線: gate は lines を受けて <ul data-contract-terms> で描く・page は既読の値だけで castTermsSummaryOf（mineWage・guaLabel・employment・okuriModeOf・okuri_tier→区分名・daysTargets[month]）・新規 fetch 0（casts の 1 行読取に okuri_tier を足すだけ・0180 フラグ）",
  gate.includes("export default function ContractAckGate({ lines }: { lines: readonly string[] })") && gate.includes("<ul data-contract-terms={lines.length}") && !gate.includes("加盟店契約")
  && mine.includes("const termsLines = castTermsSummaryOf({") && mine.includes("normDaysTarget: daysTargets[month],") && mine.includes('okuriTiersOn() ? "id, name, employment, okuri_tier" : "id, name, employment"')
  && mine.includes("okuriFlatTiersOf(storeSj).find((tr) => tr.code === meCast?.okuri_tier)?.name ?? null") && mine.includes('hourly: mineWage && ms.payslip_visibility !== "off" ? mineWage.hourly : null'));

// ── (2) M-40 (c) ──
const D = (enabled: boolean, canRegister: boolean, device: "store_device" | "own_phone", registerDevices: number) => ({ enabled, canRegister, device, registerDevices });
const cases = [D(false, true, "own_phone", 0), D(true, false, "own_phone", 0), D(true, true, "store_device", 2), D(true, true, "store_device", 0), D(true, true, "own_phone", 3), D(false, false, "store_device", 1)];
check("m5c(2-1) castRegisterDenyReasonOf: 店 OFF＝store_off（本人不許可より先）・本人不許可＝not_allowed・店端末のみ∧端末あり＝store_device_only・通す＝null",
  J(cases.map((c) => castRegisterDenyReasonOf(c))) === J(["store_off", "not_allowed", "store_device_only", "store_device_only" /* ★裁定473／M-131（2026-11-10）: 店端末のみ＝登録台数に関係なくスマホ不可 */, null, "store_off"]), cases.map((c) => castRegisterDenyReasonOf(c)));
check("m5c(2-2) 理由 null ⇔ castOwnSessionRegisterOf true（同じ判定・castOwnSessionRegisterOf は不変）", cases.every((c) => (castRegisterDenyReasonOf(c) === null) === castOwnSessionRegisterOf(c)));
check("m5c(2-3) 和文 3＝店 OFF／不許可／店端末のみ・castRegisterDenyTextOf は知らない語／空を null",
  CAST_REGISTER_DENY_TEXT.store_off === "この店ではキャストのレジ操作は使いません" && CAST_REGISTER_DENY_TEXT.not_allowed === "レジの操作が許可されていません（店に確認してください）" && CAST_REGISTER_DENY_TEXT.store_device_only === "レジは店の端末からだけ使えます"
  && castRegisterDenyTextOf("store_off") === CAST_REGISTER_DENY_TEXT.store_off && castRegisterDenyTextOf("zzz") === null && castRegisterDenyTextOf("") === null && castRegisterDenyTextOf(undefined) === null && castRegisterDenyTextOf("toString") === null);
const ces = src("lib/nox/register/cast-entry-server.ts"), lay = src("app/(manage)/layout.tsx");
check("m5c(2-4) 配線: cast-entry-server が { allowed, canRegister, reason } を返す（店 OFF と本人不許可は castRegisterLevelOf で読み分け）・layout は /register・/report で通さないとき /mine?denied=register&why=（他パスは従来の /mine）・/mine は searchParams を読み Message(warn)＋data-mine-denied",
  ces.includes("export type CastRegisterEntry = { allowed: boolean; canRegister: boolean; reason: CastRegisterDenyReason | null };") && ces.includes("const storeOn = castRegisterLevelOf(sj) >= 1;") && ces.includes("reason: castRegisterDenyReasonOf(i)")
  && lay.includes('if (!castReg) redirect(`/mine?denied=register&why=${e.reason ?? "not_allowed"}`);') && lay.includes('if (!(onRegister && castReg)) redirect("/mine");')
  && mine.includes("searchParams?: Promise<{ denied?: string; why?: string }>") && mine.includes('const deniedText = sp.denied === "register" ? castRegisterDenyTextOf(sp.why) : null;') && mine.includes('<div data-mine-denied="register"') && mine.includes('<Message kind="warn" style={{ margin: 0 }}>{deniedText}</Message>'));
check("m5c(2-5) 0190 の打刻ゲート（'off duty'＝「出勤してからレジを開けます」）は別経路＝触らない（register-board に残る・layout には無い）", src("app/(manage)/register/register-board.tsx").includes("出勤してからレジを開けます") && !lay.includes("off duty"));

// ── (3) M-40 (x) ──
check("m5c(3-1) punchShiftRelationOf: 16:28→16:40 vs 20:00–25:00＝before・20:00→25:10＝overlap・25:30→27:00＝after・19:50→翌01:10（0-47 域）＝overlap・退勤がシフト開始ちょうど＝before・出勤がシフト終了ちょうど＝after・退勤なし（勤務中）は開き窓・打刻なし＝null",
  punchShiftRelationOf("16:28", "16:40", "20:00", "25:00") === "before" && punchShiftRelationOf("20:00", "25:10", "20:00", "25:00") === "overlap" && punchShiftRelationOf("25:30", "27:00", "20:00", "25:00") === "after"
  && punchShiftRelationOf("19:50", "25:10", "20:00", "25:00") === "overlap" && punchShiftRelationOf("16:00", "20:00", "20:00", "25:00") === "before" && punchShiftRelationOf("25:00", "26:00", "20:00", "25:00") === "after"
  && punchShiftRelationOf("16:30", null, "20:00", "25:00") === "overlap" && punchShiftRelationOf("25:30", null, "20:00", "25:00") === "after" && punchShiftRelationOf(null, "16:40", "20:00", "25:00") === "before" && punchShiftRelationOf(null, null, "20:00", "25:00") === null);
check("m5c(3-2) punchOverlapsShiftOf＝overlap だけ true・備考語＝シフト前／シフト後", punchOverlapsShiftOf("16:28", "16:40", "20:00", "25:00") === false && punchOverlapsShiftOf("20:30", "24:00", "20:00", "25:00") === true && punchOverlapsShiftOf(null, null, "20:00", "25:00") === false && SHIFT_RELATION_NOTE.before === "シフト前" && SHIFT_RELATION_NOTE.after === "シフト後");
const P = (d: string, hm: string) => ({ punched_at: d + "T" + hm + ":00+09:00", type: "in" as const });
const O = (d: string, hm: string) => ({ punched_at: d + "T" + hm + ":00+09:00", type: "out" as const });
const shifts = ["2026-10-01", "2026-10-02", "2026-10-03"].map((date) => ({ date, start_hm: "20:00", end_hm: "25:00" }));
// 10/01 シフト前の打刻（16:28→16:40）／10/02 シフト内（20:10→翌00:50）／10/03 シフト後（翌01:30→翌02:30）
const punches = [P("2026-10-01", "16:28"), O("2026-10-01", "16:40"), P("2026-10-02", "20:10"), O("2026-10-03", "00:50"), P("2026-10-04", "01:30"), O("2026-10-04", "02:30")];
const base = { punches, shifts, attendance: [], cutoffHm: "06:00", closeHm: "25:00", todayBiz: "2026-10-05", periodStart: "2026-10-01", periodEnd: "2026-10-03" };
const rowsS = attendanceDayRowsOf({ ...base, payTimeBasis: "shift" });
const rowsP = attendanceDayRowsOf({ ...base, payTimeBasis: "punch" });
const bd = (rs: typeof rowsS, d: string) => rs.find((r) => r.bizDate === d)!;
check("m5c(3-3) 計算基準 'shift': シフト前の打刻の日は実打刻のまま（0.2h・basis punch・備考「シフト前」）・シフト内の日は従来どおり 5h に置換（basis shift・備考なし）・シフト後の日は 1h のまま（備考「シフト後」）",
  bd(rowsS, "2026-10-01").hours === 0.2 && bd(rowsS, "2026-10-01").basis === "punch" && bd(rowsS, "2026-10-01").note === "シフト前"
  && bd(rowsS, "2026-10-02").hours === 5 && bd(rowsS, "2026-10-02").basis === "shift" && bd(rowsS, "2026-10-02").note === ""
  && bd(rowsS, "2026-10-03").hours === 1 && bd(rowsS, "2026-10-03").basis === "punch" && bd(rowsS, "2026-10-03").note === "シフト後", rowsS.map((r) => [r.bizDate, r.hours, r.basis, r.note]));
check("m5c(3-4) 計算基準 'punch' は不変（実打刻のまま・備考に シフト前／後 は付けない＝従来の表示を変えない）", bd(rowsP, "2026-10-01").hours === 0.2 && bd(rowsP, "2026-10-02").hours === 4.7 && bd(rowsP, "2026-10-03").hours === 1 && rowsP.every((r) => r.basis === "punch" && r.note === ""), rowsP.map((r) => [r.bizDate, r.hours, r.basis, r.note]));
// s-lane shc(3) と同じ fixture＝同値（19:50→翌01:10 はシフトと重なる＝5h に置換）
const shiftsSl = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"].map((date) => ({ date, start_hm: "20:00", end_hm: "25:00" }));
const rowsSl = attendanceDayRowsOf({ punches: [P("2026-10-01", "19:50"), O("2026-10-02", "01:10"), P("2026-10-02", "20:25"), O("2026-10-03", "00:20"), P("2026-10-04", "20:00")], shifts: shiftsSl, attendance: [], cutoffHm: "06:00", closeHm: "25:00", payTimeBasis: "shift", todayBiz: "2026-10-04", periodStart: "2026-10-01", periodEnd: "2026-10-04" });
check("m5c(3-5) 既存の golden（s-lane shc(3)）は不変＝重なる日は 5h（shift）・打刻なしの日は 0", bd(rowsSl, "2026-10-01").hours === 5 && bd(rowsSl, "2026-10-01").basis === "shift" && bd(rowsSl, "2026-10-02").hours === 5 && bd(rowsSl, "2026-10-04").hours === 0);
check("m5c(3-6) pay.ts（給与側の 'shift' 置換）は触らない＝wageDetail の前段の置換が残る（差分表に載せる）", src("lib/nox/pay.ts").includes('const dailyBase: DailyRecord[] = input.payTimeBasis === "shift"'));

if (fails.length) { console.error(`verify:nox-m5c FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`verify:nox-m5c OK ${pass} checks（便 M5＝M-33 基本の働き方の確認・M-40 (c) 拒否理由・M-40 (x) シフト前の退勤）`);
