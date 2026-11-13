/**
 * verify:nox-b6 — フラグ便（2026-11-12・画面だけ・DDL なし）＝0201c／0201h／0201e の本番適用を受けた client。DB は触らない（source と純関数だけ）。
 *  (1) フラグ 3 本（MIG_0201C／0201H／0201E_APPLIED）＝true・読み口と __set…ForTest
 *  (2) 0201c 体入の条件（店の 2 キー＋日数・個人の上書き set_cast_trial）・本採用／見送り（cast_trial_decide）・カテゴリの既定（set_product_category_defaults）・給与の式は変えない
 *  (3) 0201h 給与天引きのボタンは cast_liability_allowed の店だけ・'cast liability not allowed' の和文
 *  (4) 単位つきの数値の欄の最小の幅（CSS の値を固定）・手数料の 3 欄は折り返す格子・欄の中の矢印を消す
 *  (5) 0201e 締めの許可のスイッチ（set_cast_close）・日報のキャストの締めは許可∧出勤中∧今日だけ
 *  (6) 0201e 取り下げ 2 つ（drink_claim_withdraw・reservation_withdraw＝承認前だけ）
 *  (7) 0201e スタッフの勤怠の画面（staff_my_work＝本人の勤怠と日計・端末では金額を出さない）
 *  (8) 新しい画面の文に内部の言葉・「準備中」「未実装」を出さない
 */
import fs from "node:fs";
import {
  MIG_0201C_APPLIED, MIG_0201E_APPLIED, MIG_0201H_APPLIED, __set0201cForTest, __set0201eForTest, __set0201hForTest, mig0201cOn, mig0201eOn, mig0201hOn,
} from "../lib/nox/rules-0175/flag";
import { SET_CAST_TRIAL_RPC, TRIAL_BACK_OPTIONS, TRIAL_DECIDE_RPC, trialCastArgsOf, trialCastColsOf, trialDecideArgsOf, trialStorePatchOf, trialStoreTermsOf } from "../lib/nox/cast/trial-terms";
import { CATEGORY_DEFAULTS_RPC, categoryDefaultsArgsOf, categoryDefaultsLabelOf, productDefaultsOfCategory } from "../lib/nox/master/category-defaults";
import { canMarkDeductOf, castCloseOf } from "../lib/nox/report/gates";
import { rpcErrJa } from "../lib/nox/ui/rpc-err";
import { CAST_CLOSE_RPC, castCloseArgsOf, castCloseRowsOf } from "../lib/nox/staff/cast-close";
import { DRINK_WITHDRAW_RPC, RSV_WITHDRAW_RPC, WITHDRAW_LABEL, canWithdrawOf, rsvCancelNoteOf } from "../lib/nox/mine/withdraw";
import { STAFF_MY_WORK_RPC, staffMyWorkViewOf } from "../lib/nox/staff/my-work";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
import { PUNCH_PENDING_TEXT, punchStateAfterOf, punchStateShownOf } from "../lib/nox/shift/punch-pending";
import { hoursMinutesJaOf } from "../lib/nox/mine/attendance-month";
import { TRIAL_WAGE_NOT_IN_PAY_NOTE } from "../lib/nox/cast/trial-terms";
import { PRIVACY_PUBLISHED_ON, privacyBlocksOf, privacyPublishedOf } from "../lib/nox/legal/privacy";
import { pinSelfErrJa } from "../components/nox/pin-self-card";
import { unlockNextOf } from "../lib/nox/rules-0175/kiosk";
import crypto from "node:crypto";
import { MYNUMBER_FORM_RE, decryptMynumber, encryptMynumber, mynumberKeysOf, mynumberMaskedOf, mynumberPlainOf } from "../lib/nox/mynumber/cipher";
import { MYNUMBER_DISCARD_NOTE_0201F, MYNUMBER_LAST_PAY_YEAR_LABEL, mynumberRetentionValidOf } from "../lib/nox/mynumber/discard-text";
import { MIG_0201F_APPLIED, mig0201fOn } from "../lib/nox/rules-0175/flag";
import { kioskPersonIdleMinutesOf, kioskPersonIdleValidOf } from "../lib/nox/kiosk/person-login";
import { autoConfirmHoursOf, cashFloatOf, cashRateOf, payDayOf, svcVipOf, trialDaysOf } from "../lib/nox/setup/v5";
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = JSON.stringify;
const LATIN = /[A-Za-z]/;

// (1) フラグ
{
  check("b6(1-1) フラグ 3 本＝true（本番に 0201c・0201h・0201e が適用済み）", MIG_0201C_APPLIED && MIG_0201H_APPLIED && MIG_0201E_APPLIED && mig0201cOn() && mig0201hOn() && mig0201eOn());
  __set0201cForTest(false); __set0201hForTest(false); __set0201eForTest(false);
  const off = !mig0201cOn() && !mig0201hOn() && !mig0201eOn();
  __set0201cForTest(null); __set0201hForTest(null); __set0201eForTest(null);
  check("b6(1-2) 読み口はテストから差し替えられる（false→null で戻る）", off && mig0201cOn() && mig0201hOn() && mig0201eOn());
}
// (2) 0201c
{
  const st = trialStoreTermsOf({ trial_wage: 2500, trial_back: "none", trial_guarantee_days: 5 });
  const st0 = trialStoreTermsOf(null);
  check("b6(2-1) 店の既定＝時給・バック（same／none）・日数（欠損＝未設定・本採用と同じ・3）", J(st) === J({ wage: 2500, back: "none", days: 5 }) && J(st0) === J({ wage: null, back: "same", days: 3 }) && J(TRIAL_BACK_OPTIONS.map(([k]) => k)) === J(["same", "none"]));
  const p1 = trialStorePatchOf({ wage: "3000", back: "same", days: "5" }, st);
  const p2 = trialStorePatchOf({ wage: "100001", back: "same", days: "5" }, st);
  const p3 = trialStorePatchOf({ wage: "2500", back: "none", days: "5" }, st);
  check("b6(2-2) 店の patch＝変更分だけ（trial_wage・trial_back・trial_guarantee_days）・時給は 0〜100,000 の整数", p1.ok && J(p1.patch) === J({ trial_wage: 3000, trial_back: "same" }) && !p2.ok && p3.ok && J(p3.patch) === J({}));
  const a1 = trialCastArgsOf("c1", { wage: "", days: "7", startedOn: "2026-11-12" });
  const a2 = trialCastArgsOf("c1", { wage: "-1", days: "", startedOn: "" });
  const a3 = trialCastArgsOf("c1", { wage: "", days: "91", startedOn: "" });
  check("b6(2-3) set_cast_trial の引数＝空欄は null（店の既定）・時給 0〜100,000・日数 1〜90", SET_CAST_TRIAL_RPC === "set_cast_trial" && a1.ok && J(a1.args) === J({ p_cast_id: "c1", p_wage: null, p_days: 7, p_started_on: "2026-11-12" }) && !a2.ok && !a3.ok);
  check("b6(2-4) cast_trial_decide の引数＝本採用はプラン・見送りはプランなし・p_from は今日", TRIAL_DECIDE_RPC === "cast_trial_decide"
    && J(trialDecideArgsOf("c1", "hire", "p1", "2026-11-12")) === J({ p_cast_id: "c1", p_decision: "hire", p_plan_id: "p1", p_from: "2026-11-12" })
    && J(trialDecideArgsOf("c1", "decline", "p1", "2026-11-12")) === J({ p_cast_id: "c1", p_decision: "decline", p_plan_id: null, p_from: "2026-11-12" }));
  const cb = src("app/(manage)/casts/casts-board.tsx");
  check("b6(2-5) キャスト管理の詳細＝本採用は cast_trial_decide（フラグ false なら従来の set_cast_plan）・見送り・体入の条件（set_cast_trial）・列は 3 列を足す",
    cb.includes('? await supabase.rpc(TRIAL_DECIDE_RPC, trialDecideArgsOf(c.id, "hire", planId, today))') && cb.includes('supabase.rpc(TRIAL_DECIDE_RPC, trialDecideArgsOf(c.id, "decline", null, today))')
    && cb.includes('data-trial-decline="1"') && cb.includes("const { error } = await supabase.rpc(SET_CAST_TRIAL_RPC, a.args);") && cb.includes('data-trial-terms="1"') && cb.includes("{mig0201cOn() && isTrialCast(selCast) && (")
    && cb.includes(".select(CAST_RELOAD_COLS + trialCastColsOf())") && src("app/(manage)/casts/page.tsx").includes(".select(CAST_LOGIN_COLS + trialCastColsOf())") && trialCastColsOf() === ", trial_wage, trial_days, trial_started_on");
  const tp = src("app/(manage)/master/trial-terms-panel.tsx"), sp = src("app/(manage)/master/store-profile/page.tsx");
  check("b6(2-6) 店舗設定 › 店舗情報「体験入店の条件」＝set_store_profile（オーナーだけ保存）・info タブにフラグ配下で置く",
    tp.includes('createClient().rpc("set_store_profile", { p_store_id: storeSel, p_patch: p.patch })') && tp.includes("{isOwner && (") && sp.includes('{tab === "info" && mig0201cOn() && <TrialTermsPanel stores={stores} isOwner={isOwner} />}'));
  const d1 = productDefaultsOfCategory({ default_back_rate: 30, default_track_stock: true }), d0 = productDefaultsOfCategory({ default_back_rate: null, default_track_stock: null });
  const c1 = categoryDefaultsArgsOf("k1", { backRate: "", trackStock: false }), c2 = categoryDefaultsArgsOf("k1", { backRate: "101", trackStock: true });
  check("b6(2-7) カテゴリの既定＝バック率（0〜100・空欄なし）・在庫（null は管理しない）・表示・set_product_category_defaults の引数",
    CATEGORY_DEFAULTS_RPC === "set_product_category_defaults" && J(d1) === J({ backRate: 30, trackStock: true }) && J(d0) === J({ backRate: null, trackStock: false })
    && categoryDefaultsLabelOf({ default_back_rate: 30, default_track_stock: true }) === "バック 30%・在庫を管理する" && categoryDefaultsLabelOf(null) === "既定なし"
    && c1.ok && J(c1.args) === J({ p_category_id: "k1", p_back_rate: null, p_track_stock: false }) && !c2.ok);
  const cg = src("app/(manage)/master/categories/categories-board.tsx"), pb = src("app/(manage)/master/products/products-board.tsx"), q = src("lib/nox/master/queries.ts");
  check("b6(2-8) 配線＝カテゴリの編集で既定を保存・新しい商品でカテゴリを選ぶとバック率を当てる・登録後の在庫はカテゴリの既定・カテゴリの読取に 2 列",
    cg.includes("await supabase.rpc(CATEGORY_DEFAULTS_RPC, defA.args)") && cg.includes('data-cat-defaults-form="1"') && pb.includes("onChange={(e) => pickCategory(e.target.value)}")
    && pb.includes('if (d.backRate !== null) { setPBackMode("rate"); setPBackValue(d.backRate); }') && pb.includes('supabase.rpc("set_product_track_stock", { p_product_id: data, p_track: true })')
    && q.includes('"id, name, sort_order, is_active, default_back_rate, default_track_stock"'));
  const pay = src("lib/nox/pay.ts"), asm = src("lib/nox/payroll/assemble.ts"), col = src("lib/nox/payroll/collect.ts");
  check("b6(2-9) 体入の時給を給与に当てる式は入れない（pay.ts・payroll の組み立てと読取に trial_wage／trial_back が無い）", ![pay, asm, col].some((s) => /trial_wage|trial_back/.test(s)));
}
// (3) 0201h
{
  check("b6(3-1) 給与天引きは cast_liability_allowed の店だけ（customer_only・disabled・不明は出さない）＋フラグ false は従来どおり",
    canMarkDeductOf("cast_liability_allowed") && !canMarkDeductOf("customer_only") && !canMarkDeductOf("disabled") && !canMarkDeductOf(null)
    && (() => { __set0201hForTest(false); const r = canMarkDeductOf("customer_only"); __set0201hForTest(null); return r; })());
  const ja = rpcErrJa("cast liability not allowed");
  check("b6(3-2) 'cast liability not allowed' の和文（英字なし）", ja === "この店の売掛の方針では、キャストの給与から天引きできません" && !LATIN.test(ja));
  const rb = src("app/(manage)/report/report-board.tsx");
  check("b6(3-3) 日報の売掛タブ＝方針の列を読み、本人同意と「給与天引き」は castLiabilityOk のときだけ",
    rb.includes('.select("settings_json, receivable_policy")') && rb.includes("const castLiabilityOk = canMarkDeductOf(arPolicy);")
    && (rb.match(/\{r\.cast_id && castLiabilityOk && \(/g) ?? []).length === 2 && rb.includes('data-ar-deduct="1"') && !rb.includes("{r.cast_id && (\n"));
  const others = ["not trial", "bad wage", "bad days", "bad trial_wage", "bad trial_back", "bad back_rate", "not a cast", "biz date passed", "bad range"].map(rpcErrJa);
  check("b6(3-4) 0201c／0201e の RPC の語も和文（英字なし）", others.every((s) => !LATIN.test(s)), others);
}
// (4) 単位つきの欄の幅
{
  const css = src("app/globals.css"), sp = src("app/(manage)/master/store-profile-panel.tsx");
  check("b6(4-1) 単位つきの欄の下限の幅（枠 84px・中の数値は 3 桁＋左右の余白・余白は CSS で決める）",
    css.includes(".nox-unitbox { min-width: 84px; }") && css.includes(".nox-unitbox input { padding: 9px 10px !important; min-width: calc(3ch + 20px) !important; }"));
  check("b6(4-2) 単位つきの欄の中の数値は上下の矢印を出さない",
    css.includes('.nox-unit input[type="number"]::-webkit-inner-spin-button,') && css.includes('.nox-unit input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; appearance: none; margin: 0; }') && css.includes('.nox-unit input[type="number"] { -moz-appearance: textfield; appearance: textfield; }'));
  check("b6(4-3) 手数料（お客様負担）の 3 欄＝折り返す格子（auto-fit・下限 96px）・3 等分（minmax(0, 1fr)）をやめた",
    sp.includes('gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 8, marginTop: 4 }} data-pay-fee-grid="1"') && !sp.includes('"repeat(3, minmax(0, 1fr))"'));
}
// (5) 締めの許可
{
  const rows = castCloseRowsOf([{ id: "c1", name: "あい", user_id: "u1", store_id: "s1" }, { id: "c2", name: "みき", user_id: null, store_id: "s1" }, { id: "c3", name: "れな", user_id: "u3", store_id: "s1" }],
    [{ id: "m1", user_id: "u1", store_id: "s1", can_register: true, cast_can_close: true }, { id: "m3", user_id: "u3", store_id: "s2", can_register: true, cast_can_close: true }]);
  check("b6(5-1) 行＝同じ店・同じ user の membership（未招待・別の店は membershipId なし）・既定 OFF",
    J(rows.map((r) => [r.castId, r.membershipId, r.canRegister, r.canClose])) === J([["c1", "m1", true, true], ["c2", null, false, false], ["c3", null, false, false]]));
  check("b6(5-2) set_cast_close の引数は明示の boolean", CAST_CLOSE_RPC === "set_cast_close" && J(castCloseArgsOf("m1", false)) === J({ p_membership_id: "m1", p_on: false }) && J(castCloseArgsOf("m1", true)) === J({ p_membership_id: "m1", p_on: true }));
  const cp = src("app/(manage)/staff/cast-close-panel.tsx"), pg = src("app/(manage)/staff/page.tsx");
  check("b6(5-3) スタッフ管理に「キャストの締めの許可」（キャストごとのスイッチ・フラグ配下）",
    cp.includes("await createClient().rpc(CAST_CLOSE_RPC, castCloseArgsOf(r.membershipId, next))") && cp.includes('data-cast-close-toggle="1"') && cp.includes('.select("id, user_id, store_id, can_register, cast_can_close").eq("role", "cast")')
    && pg.includes("{mig0201eOn() && <div className=\"nox-mv1 nox-mv1-m\"><CastClosePanel "));
  check("b6(5-4) 日報のキャストの締め＝許可∧出勤中（auth_cast_close_ok）∧今日の営業日・キャスト以外は false・フラグ false は従来（キャストは締める）",
    castCloseOf({ isCast: true, closeOk: true, bizDate: "2026-11-12", todayBiz: "2026-11-12" }) && !castCloseOf({ isCast: true, closeOk: false, bizDate: "2026-11-12", todayBiz: "2026-11-12" })
    && !castCloseOf({ isCast: true, closeOk: true, bizDate: "2026-11-11", todayBiz: "2026-11-12" }) && !castCloseOf({ isCast: false, closeOk: true, bizDate: "2026-11-12", todayBiz: "2026-11-12" })
    && (() => { __set0201eForTest(false); const r = castCloseOf({ isCast: true, closeOk: false, bizDate: "x", todayBiz: "y" }); __set0201eForTest(null); return r; })());
  const rb = src("app/(manage)/report/report-board.tsx");
  check("b6(5-5) 日報の配線＝auth_cast_close_ok を読む・締めの節と canClose は castClose",
    rb.includes('supabase.rpc("auth_cast_close_ok", { p_store_id: storeId })') && rb.includes("const canClose = isManagerUp || staffPerm.close || castClose;") && rb.includes("{(isManagerUp || castClose) && (") && !rb.includes("{(isManagerUp || isCast) && ("));
}
// (6) 取り下げ
{
  check("b6(6-1) 取り下げは承認前（pending）だけ・RPC 名", canWithdrawOf("pending") && !canWithdrawOf("approved") && !canWithdrawOf("booked") && !canWithdrawOf("void") && !canWithdrawOf(null)
    && DRINK_WITHDRAW_RPC === "drink_claim_withdraw" && RSV_WITHDRAW_RPC === "reservation_withdraw" && WITHDRAW_LABEL === "取り下げ");
  const dc = src("app/mine/drink-claim-form.tsx"), rc = src("app/mine/reservation-request-card.tsx");
  check("b6(6-2) /mine のドリンクの申告と予約の申請に「取り下げ」（行ごと・承認前だけ）",
    dc.includes("await supabase.rpc(DRINK_WITHDRAW_RPC, { p_claim_id: c.id })") && dc.includes("{canWithdrawOf(c.status) && (") && dc.includes('data-drink-withdraw="1"')
    && rc.includes("await createClient().rpc(RSV_WITHDRAW_RPC, { p_reservation_id: id })") && rc.includes("{canWithdrawOf(r.status) && <button") && rc.includes('data-rsv-withdraw="1"') && rc.includes("{rsvCancelNoteOf()}"));
  check("b6(6-3) 予約の申請の注記＝承認前は取り下げ・承認後は店に連絡（人数の注記は残す）", rsvCancelNoteOf().includes("取り下げ") && rsvCancelNoteOf().includes("店にご連絡ください") && rsvCancelNoteOf().includes("人数"));
}
// (7) staff_my_work
{
  const raw = {
    membership_id: "m1", amounts_hidden: false,
    contract: { contract_kind: "parttime", pay_kind: "hourly", hourly: 1500, fixed_allowance: 0, tax_class: null },
    punches: [{ biz_date: "2026-11-03", kind: "in", punched_at: "2026-11-03T11:00:00Z" }, { biz_date: "2026-11-03", kind: "out", punched_at: "2026-11-03T14:00:00Z" }, { biz_date: "2026-10-31", kind: "in", punched_at: "2026-10-31T11:00:00Z" }],
    attendance: [{ biz_date: "2026-11-03", status: "late" }],
    allowances: [{ name: "交通", amount: 3000 }],
    confirmed: [{ period: "2026-11", minutes: 180, days: 1, amount: 7500 }],
    paid_periods: [{ period: "2026-11", paid_on: "2026-11-25", method: "transfer" }],
  };
  const v = staffMyWorkViewOf(raw, "2026-11", "2026-11-12");
  check("b6(7-1) 本人の勤怠＝その月の日だけ・実働 3h・日計（時給×実働）・見込み（時給＋手当）・確定・支払い（既存の計算のまま）",
    STAFF_MY_WORK_RPC === "staff_my_work" && v.rows.length === 1 && v.rows[0].inHm === "20:00" && v.rows[0].outHm === "23:00" && v.rows[0].hours === 3 && v.rows[0].dayPay === 4500 && v.rows[0].statusLabel === "遅刻"
    && v.days === 1 && v.minutesLabel === "3:00" && v.gross === 7500 && v.payHead === "時給 ¥1,500 × 実働" && J(v.confirmed) === J({ days: 1, minutesLabel: "3:00", amount: 7500 }) && J(v.paid) === J({ paidOn: "2026-11-25", method: "振込" }), v);
  const h = staffMyWorkViewOf({ ...raw, amounts_hidden: true, contract: { contract_kind: "parttime", pay_kind: "hourly", valid_from: "2026-01-01" }, allowances: [], paid_periods: [], confirmed: [{ period: "2026-11", minutes: 180, days: 1 }] }, "2026-11", "2026-11-12");
  check("b6(7-2) 店の端末（amounts_hidden）＝金額を出さない（給与の形・日計・見込み・確定額・支払いが無い）・勤怠は出す",
    h.hidden && h.payHead === null && h.gross === null && h.rows[0].dayPay === null && h.confirmed?.amount === null && h.paid === null && h.rows[0].hours === 3);
  const me = src("app/(manage)/staff/me/page.tsx"), mw = src("app/(manage)/staff/me/staff-my-work.tsx");
  check("b6(7-3) /staff/me＝スタッフと店長は staff_my_work（月ごと・62 日以内）・オーナーは従来の部品・端末では日計の列を出さない",
    me.includes('{mig0201eOn() && (role === "staff" || role === "manager")') && me.includes('<StaffWorkPanel scope="me"') && mw.includes("await supabase.rpc(STAFF_MY_WORK_RPC, { p_from: from, p_to: to })")
    && mw.includes("{!view.hidden && <th style={th}>日計</th>}") && mw.includes("STAFF_MY_WORK_HIDDEN_NOTE"));
}
// (8) 内部の言葉
{
  const visible = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s\/\/.*$/, "")).join("\n");
  const strings = (s: string) => (visible(s).match(/"[^"\n]*"|`[^`]*`|>[^<>{}\n]+</g) ?? []).join("\n");
  const files = ["app/(manage)/master/trial-terms-panel.tsx", "app/(manage)/staff/cast-close-panel.tsx", "app/(manage)/staff/me/staff-my-work.tsx", "lib/nox/cast/trial-terms.ts", "lib/nox/master/category-defaults.ts", "lib/nox/staff/cast-close.ts", "lib/nox/mine/withdraw.ts", "lib/nox/staff/my-work.ts"];
  const bad = /0201|mig|フラグ|準備中|未実装|裁定|便 |器/;
  const hits = files.filter((f) => bad.test(strings(src(f))));
  check("b6(8-1) 新しい画面と文言に内部の言葉（番号・フラグ・便・器）や「準備中」「未実装」を出さない", hits.length === 0, hits);
}

// ★通しの確かめ A-2（2026-11-12 夜）: キオスクの本人の cookie を、ログアウト・デモの入場・ログインの前に消す
{
  const so = fs.readFileSync("app/auth/signout/route.ts", "utf8"), de = fs.readFileSync("app/api/demo/enter/route.ts", "utf8"), lg = fs.readFileSync("app/login/page.tsx", "utf8");
  check("b6(a2-1) ログアウトは本人のセッションを終えて cookie を消す・デモの入場とログインの前も消す",
    so.includes('kiosk_person_end", { p_session_id: kp.sessionId') && so.includes("res.cookies.set(KIOSK_PERSON_COOKIE, \"\", { path: \"/\", maxAge: 0 });")
    && de.includes("res.cookies.set(KIOSK_PERSON_COOKIE, \"\", { path: \"/\", maxAge: 0 });")
    && lg.indexOf('fetch("/api/kiosk/person-end"') > 0 && lg.indexOf('fetch("/api/kiosk/person-end"') < lg.indexOf("signInWithPassword"));
}

// ★通しの確かめ C-1・C-2・C-6（2026-11-13・相談役＝テスター店舗への依頼の前に直す）
{
  const nf = fs.readFileSync("app/not-found.tsx", "utf8");
  check("b6(c1-1) 404 は日本語の画面（not-found.tsx・英字の文を出さない）",
    nf.includes('const NOT_FOUND_TITLE = "ページが見つかりません";') && nf.includes("トップへ戻る") && nf.includes('href="/"') && !/could not be found/i.test(nf));
  const rb = fs.readFileSync("app/(manage)/register/register-board.tsx", "utf8");
  const lc = rb.slice(rb.indexOf("const loadCheck = useCallback"), rb.indexOf("const loadCheck = useCallback") + 4000);
  check("b6(c2-1) 伝票の読み直しは 8 本を同時に投げる（Promise.all・順番に 1 本ずつ待たない）",
    lc.includes("const [{ data: c }, { data: ls }, { data: dcs }, { data: ps }, { data: ns }, { data: aps }, { data: cs }, { data: cr }] = await Promise.all([")
    && !/const \{ data: (ls|dcs|ps|ns|aps|cs|cr) \} = await supabase/.test(lc));
  check("b6(c2-2) 入金の後、読み直しの間は入金済み・残額を「反映中…」（古い額を見せない）",
    rb.includes('export const PAY_REFRESHING_JA = "反映中…";') && rb.includes("if (!error) setPayRefreshing(true);") && rb.includes("try { await loadCheck(check.id); } finally { setPayRefreshing(false); }")
    && (rb.match(/payRefreshing \? PAY_REFRESHING_JA : yen\(paidSum\)/g) ?? []).length === 2 && (rb.match(/payRefreshing \? PAY_REFRESHING_JA : yen\(remSum\)/g) ?? []).length === 2);
  const css = fs.readFileSync("app/globals.css", "utf8");
  check("b6(c6-1) /mine の勤怠の表は入れ物の幅（600px 以下）で 3 列に畳む（PC でも横に送らない）",
    css.includes("[data-mine-kintai] { container-type: inline-size; }") && css.includes("@container (max-width: 600px) { [data-mine-kintai] .nox-kintai-table .opt { display: none; }")
    && fs.readFileSync("app/mine/page.tsx", "utf8").includes('data-mine-kintai="1"'));
}

// ★2026-11-13 client 便（相談役【3】a〜d・0201g の文言）
{
  const pend = src("lib/nox/shift/punch-pending.ts"), pa = src("app/mine/punch-actions.tsx"), pg2 = src("app/mine/page.tsx");
  check("b6(c7-1) 打刻の直後＝打刻の後の状態で先に描く（出勤→出勤中・退勤→退勤済み・サーバーが追いついたら外す）",
    punchStateAfterOf("in") === "open" && punchStateAfterOf("out") === "closed" && punchStateShownOf("none", { from: "none", to: "open" }) === "open" && punchStateShownOf("open", { from: "none", to: "open" }) === "open" && punchStateShownOf("closed", { from: "none", to: "open" }) === "closed" && punchStateShownOf("none", null) === "none");
  check("b6(c7-2) 読み直しの間はサーバーで描いた行（今日のシフト・レジの理由）を「反映中…」に",
    PUNCH_PENDING_TEXT === "反映中…" && pend.includes("PUNCH_PENDING_EVENT") && pa.includes("startRefresh(() => router.refresh())") && pa.includes("punchStateShownOf(state, optimistic)") && pg2.includes('<PunchPending attr="register-note">') && pg2.includes('<PunchPending attr="today-shift">'));
  check("b6(c7-3) /mine の勤怠の行の時間＝「◯ 時間 ◯ 分」（0.9666…h＝0 時間 58 分・額は変えない）",
    hoursMinutesJaOf(0.9666666666666667) === "0 時間 58 分" && hoursMinutesJaOf(7.5) === "7 時間 30 分" && hoursMinutesJaOf(2) === "2 時間 0 分" && src("components/nox/kintai-row.tsx").includes("× ${hoursMinutesJaOf(p.hours)}）") && !src("components/nox/kintai-row.tsx").includes("× ${p.hours}h"));
  check("b6(c7-4) 体入の時給の欄の注記（店舗設定・キャスト・初期設定の 3 か所）",
    TRIAL_WAGE_NOT_IN_PAY_NOTE === "体入の時給は、まだ給与の計算に反映されません" && ["app/(manage)/master/trial-terms-panel.tsx", "app/(manage)/casts/casts-board.tsx", "app/(manage)/setup/setup-wizard.tsx"].every((f) => src(f).includes("{TRIAL_WAGE_NOT_IN_PAY_NOTE}")));
  const md = src("docs/legal/privacy_v0.5.md"); const bl = privacyBlocksOf(md, "2026-11-20");
  check("b6(c7-5) /privacy＝★2026-11-13 夜 公開（相談役■2 e・制定日 2026-11-13）・リンクは LP・ログイン・規約（公開の日が無ければ 404 とリンクなし）／本文は docs/legal/privacy_v0.5.md・表 5 つ・制定日に公開の日・デモの記録は 30 日",
    PRIVACY_PUBLISHED_ON === "2026-11-13" && privacyPublishedOf() && !privacyPublishedOf(null) && md.includes("| デモのご利用 | IP アドレスをハッシュ化した値（30 日で消去します） |") && md.includes("| デモの入場の記録 | 30 日で消去 |") && !md.includes("毎日消去") && src("app/privacy/page.tsx").includes("if (!privacyPublishedOf()) notFound();")
    && ["app/lp/page.tsx", "app/login/page.tsx", "app/terms/page.tsx"].every((f) => src(f).includes("privacyPublishedOf() &&") && src(f).includes("PRIVACY_PATH"))
    && bl.filter((b) => b.kind === "table").length === 5 && bl.some((b) => b.kind === "p" && b.text === "制定日：2026 年 11 月 20 日") && bl[0].kind === "h1" && md.includes("制定日：{{公開日}}"));
  check("b6(c7-6) 0201g の文言（本人の設定 weak／taken／too_many・端末の device_locked・管理側の pin weak／pin taken）",
    pinSelfErrJa("too_many") === "PIN の変更は 1 日 5 回までです。店長に設定を頼んでください。" && pinSelfErrJa("weak") === "推測されやすい番号は使えません" && pinSelfErrJa("taken") === "この PIN は使えません。別の番号にしてください"
    && unlockNextOf({ ok: false, reason: "device_locked" }).message === "この端末はしばらく使えません（PIN の失敗が続きました）" && rpcErrJa("pin weak") === "推測されやすい番号は使えません" && rpcErrJa("pin taken") === "この PIN は使えません。別の番号にしてください");
}

// ★0201f のフラグ便（フラグ false・2026-11-13）: 暗号化の純関数・route と画面の配線・言葉（DB の 0201f が無くても流せる段だけ）
{
  const K = { keys: { test1: crypto.randomBytes(32).toString("base64"), test2: crypto.randomBytes(32).toString("base64") }, current: "test1" };
  const cid = "7f441220-ff3f-456d-875c-7798d5afd82c", cid2 = "00000000-0000-0000-0000-000000000001";
  const enc = encryptMynumber("1234-5678 9012", cid, K);
  const raw = Buffer.from(enc.split(":")[2], "base64");
  check("b6(c8-1) 暗号文の形＝nox1:test1:<base64>・40 バイト（DB の検査 29〜128・CHECK の正規表現と同じ形）・12 桁の数字が暗号文に現れない",
    MYNUMBER_FORM_RE.test(enc) && enc.startsWith("nox1:test1:") && raw.length === 40 && !/d{12}/.test(enc) && enc.length <= 256 && enc.split(":")[2].length % 4 === 0);
  check("b6(c8-2) 復号で戻る・nonce が毎回違う（同じ番号でも暗号文が違う）",
    decryptMynumber(enc, cid, K) === "123456789012" && encryptMynumber("123456789012", cid, K) !== encryptMynumber("123456789012", cid, K));
  let aadNg = false; try { decryptMynumber(enc, cid2, K); } catch { aadNg = true; }
  let keyNg = false; try { decryptMynumber(enc, cid, { keys: { test1: K.keys.test2 }, current: "test1" }); } catch { keyNg = true; }
  let tampered = false; const t2 = Buffer.from(raw); t2[20] ^= 1; try { decryptMynumber("nox1:test1:" + t2.toString("base64"), cid, K); } catch { tampered = true; }
  check("b6(c8-3) 他人の行に写した暗号文は戻らない（AAD）・鍵が違えば戻らない・1 バイト変えれば戻らない", aadNg && keyNg && tampered);
  const encV2 = encryptMynumber("123456789012", cid, { ...K, current: "test2" });
  check("b6(c8-4) 版の入れ替え＝暗号文の版の鍵で戻る（test2 で作った暗号文を current test1 の鍵束で戻せる）", decryptMynumber(encV2, cid, K) === "123456789012" && encV2.startsWith("nox1:test2:"));
  let bad = 0; for (const p of ["12345678901", "1234567890123", "12345678901a", ""]) { try { encryptMynumber(p, cid, K); } catch { bad++; } }
  check("b6(c8-5) 平文は 12 桁の数字だけ（空白とハイフンは除く）・末尾 4 桁の表示・鍵の env の読み方（無い・壊れた JSON・版が無い＝null）",
    bad === 4 && mynumberPlainOf(" 1234 5678 9012 ") === "123456789012" && mynumberMaskedOf("123456789012") === "********9012"
    && mynumberKeysOf(undefined, "v1") === null && mynumberKeysOf("{", "v1") === null && mynumberKeysOf(JSON.stringify({ v2: "x" }), "v1") === null && mynumberKeysOf(JSON.stringify({ v1: "x" }), "v1")?.current === "v1");
  const reg = src("app/api/cast/mynumber/register/route.ts"), l4 = src("app/api/cast/mynumber/last4/route.ts"), full = src("app/api/cast/mynumber/route.ts"), csv = src("app/api/payroll/tax-report-csv/route.ts"), panel = src("app/(manage)/master/sensitive-tax-panel.tsx");
  check("b6(c8-6) フラグ true（★0201f 本番適用 2026-11-13 夕）＝新しい route は動く（false のときだけ 404）・画面は route・全桁と CSV は復号",
    MIG_0201F_APPLIED === true && mig0201fOn() && reg.includes('if (!mig0201fOn()) return NextResponse.json({ error: "not found" }, { status: 404 });') && l4.includes('if (!mig0201fOn()) return NextResponse.json({ error: "not found" }, { status: 404 });')
    && full.includes("if (mig0201fOn() && typeof data === \"string\")") && csv.includes("mig0201fOn() ? decryptMynumberEnv(v, castId) : v") && panel.includes('if (mig0201fOn() && p_mynumber !== null)') && panel.includes('fetch("/api/cast/mynumber/last4"'));
  check("b6(c8-7) 登録は利用者のセッションの client で set_cast_sensitive（service では呼ばない）・末尾 4 桁は service で get_cast_mynumber_masked(p_org_id, p_actor, p_cast_id)・どちらもデモは 403",
    reg.includes('supabase.rpc("set_cast_sensitive"') && !reg.includes("createAdminClient") && reg.includes("assertNotDemo") && l4.includes('admin.rpc("get_cast_mynumber_masked", { p_org_id: orgId, p_actor: actor.id, p_cast_id: castId })') && l4.includes("assertNotDemo"));
  check("b6(c8-8) 言葉＝「最後に報酬の支払いがあった年」（「支払調書の対象になった年」は使わない）・3 つの拒否の和文・年数 1〜20",
    MYNUMBER_LAST_PAY_YEAR_LABEL === "最後に報酬の支払いがあった年" && MYNUMBER_DISCARD_NOTE_0201F.includes("最後に報酬の支払いがあった年") && !src("app/(manage)/casts/casts-board.tsx").includes("支払調書の対象になった年") && !MYNUMBER_DISCARD_NOTE_0201F.includes("支払調書")
    && rpcErrJa("plaintext rejected").startsWith("マイナンバーの保存の形") && rpcErrJa("bad ciphertext").startsWith("マイナンバーの保存の形") && rpcErrJa("bad mynumber_retention_years").includes("1〜20")
    && mynumberRetentionValidOf("1") && mynumberRetentionValidOf("20") && !mynumberRetentionValidOf("0") && !mynumberRetentionValidOf("21") && !mynumberRetentionValidOf("7.5"));
}

// ★2026-11-13 夕（相談役 A〜C・本番に接続しない段だけ）
{
  const rb = src("app/(manage)/register/register-board.tsx"), css = src("app/globals.css"), sw = src("app/(manage)/setup/setup-wizard.tsx"), v5 = src("lib/nox/setup/v5.ts"), kp = src("components/nox/kiosk-unlock-pad.tsx");
  check("b6(c9-1) A 会計＝残額 0 で「会計を完了」を下に固定（下のナビのすぐ上・広い画面はサイドバーの右）＋最後の行と重ならない余白・いちばん下の今のボタンは残す",
    rb.includes('<div className="nox-paydone-bar" data-pay-close-bar="1"><button type="button" onClick={closeCheck} disabled={!allCovered} style={t.btnPrimary56} data-pay-close-fixed="1">会計を完了</button></div>') && rb.includes('<div className="nox-paydone-spacer" aria-hidden="true" />')
    && rb.includes('data-pay-close="1">会計を完了</button>') && css.includes("body:has(.nox-tabbar) .nox-paydone-bar { bottom: calc(var(--nox-bnav-h, 64px) + env(safe-area-inset-bottom, 0px)); }") && css.includes(".nox-paydone-spacer { height: 84px; }"));
  check("b6(c9-2) A 緑の案内＝「入金は済んでいます。会計を完了してください。」＋同じボタン（「下の〜を押してください」は消した）",
    rb.includes('const PAY_DONE_NOTE = "入金は済んでいます。会計を完了してください。";') && rb.includes('data-pay-close-head="1">会計を完了</button>') && !rb.includes("下の「会計を完了」を押してください"));
  check("b6(c9-3) A 残額 0 のときは延長の表（自動・手動）・カスタム明細・割引を畳む（開けば使える）",
    rb.includes('<PayDoneFold done={allCovered} name="pay-time-auto"') && rb.includes('<PayDoneFold done={allCovered} name="pay-time-manual"') && rb.includes('<Fold key={allCovered ? "pay-custom-done" : "pay-custom"} name="pay-custom"') && rb.includes('defaultOpen={!allCovered && approvals.some((a) => a.status === "pending")}'));
  check("b6(c9-4) B 初期設定のカードの手数料＝1% 刻みの整数（小数は入らない）・確認の画面と保存で同じ値（cardFeePctOf）・Math.round で黙って丸めない",
    sw.includes('<Money value={S.cardfee} unit="%" step={1} integer') && sw.includes('["カード手数料", `${cardFeePctOf(S)}%`]') && v5.includes("pay_fee_rates: { card: cardFeePctOf(S),") && v5.includes("p_card_tax_rate: cardFeePctOf(S)") && !v5.includes("Math.round(S.cardfee"));
  check("b6(c9-5) C 端末のロック中に「名前を選んで入る」＝kiosk_staff_list（PIN を設定した人）→名前→本人の PIN→kiosk_unlock に p_membership_id",
    kp.includes('if (!r.ok && r.reason === "device_locked") setLocked(true);') && kp.includes('supabase.rpc("kiosk_staff_list")') && kp.includes("filter((x) => x.has_pin)") && kp.includes("onClick={() => void unlockPin(named?.membership_id)}") && kp.includes('data-kiosk-unlock-by-name="1">名前を選んで入る</button>'));
}

// ★2026-11-13 夜（相談役■2 c）: 店の端末で本人がログインしたときの無操作＝店の設定に従う（3〜10 分・既定 10・範囲の外は寄せる）
{
  const io = (v: unknown) => kioskPersonIdleMinutesOf({ kiosk_person_idle_minutes: v });
  check("b6(c10-1) 無操作＝設定なし 10・3〜10 はそのまま・範囲の外（1・120）は 3／10 に寄せる・小数と文字は既定 10・欄は 3〜10 の整数だけ",
    kioskPersonIdleMinutesOf({}) === 10 && io(3) === 3 && io(7) === 7 && io(10) === 10 && io(1) === 3 && io(120) === 10 && io(5.5) === 10 && io("x") === 10 && io("8") === 8
    && kioskPersonIdleValidOf("3") && kioskPersonIdleValidOf("10") && !kioskPersonIdleValidOf("2") && !kioskPersonIdleValidOf("11") && !kioskPersonIdleValidOf("5.5"));
  const sp = src("app/(manage)/master/store-profile-panel.tsx");
  check("b6(c10-2) 店舗設定の欄＝3〜10・既定 10・言葉「店の端末で本人がログインしたとき：操作が無いと戻るまで」・保存の前に 3〜10 で止める",
    sp.includes('<UnitInput value={form.kiosk_person_idle} type="number" min={3} max={10} step={1}') && sp.includes("店の端末で本人がログインしたとき：操作が無いと戻るまで") && sp.includes('if ("kiosk_person_idle_minutes" in patch && !kioskPersonIdleValidOf(String(patch.kiosk_person_idle_minutes)))'));
}

// ★2026-11-13 夜（相談役■2 e）: 監査ログの 7 年の消去を 1 日 1 回（既存の audit_purge を Vercel Cron で）
{
  const cr = src("app/api/cron/audit-purge/route.ts"), vj = src("vercel.json");
  check("b6(c11-1) cron の route＝CRON_SECRET で守る・admin で audit_purge を呼ぶだけ（DB は変えない）・vercel.json に 1 日 1 回（JST 4:30）",
    cr.includes('if (req.headers.get("authorization") !== `Bearer ${secret}`)') && cr.includes('admin.rpc("audit_purge")') && vj.includes('{ "path": "/api/cron/audit-purge", "schedule": "30 19 * * *" }'));
}

// ★2026-11-13 夜（相談役■2 d）: 初期設定の 8 欄＝欄の刻みと範囲を保存できる値に合わせ、確認の画面は保存の式と同じ関数
{
  const sw = src("app/(manage)/setup/setup-wizard.tsx"), v5s = src("lib/nox/setup/v5.ts");
  check("b6(c12-1) 保存の値＝範囲に寄せた整数（支払日 1〜31・体入 1〜90・自動確定 0〜168・釣銭 0〜999 万・VIP 0〜100）・現金割引は小数 1 桁",
    payDayOf({ payroll: { payday: 40 } }) === 31 && payDayOf({ payroll: { payday: 25 } }) === 25 && trialDaysOf({ pay: { trialDays: 120 } }) === 90 && autoConfirmHoursOf({ shift: { auto: 36 } }) === 36
    && cashFloatOf({ float: 30000 }) === 30000 && svcVipOf({ svcVip: 25 }) === 25 && cashRateOf({ cashOff: true, cashRate: 7.25 }) === 7.2 && cashRateOf({ cashOff: true, cashRate: 7.5 }) === 7.5 && cashRateOf({ cashOff: false, cashRate: 7 }) === 0);
  check("b6(c12-2) 欄＝支払日・体入の日数・自動確定・釣銭・VIP・商品の値段とバックは整数だけ＋範囲・現金割引は 0.1 刻み・確認の画面は保存の式（payDayOf／trialDaysOf／cashRateOf／cashFloatOf／svcVipOf／autoConfirmHoursOf）",
    sw.includes('<Money value={pr.payday} unit="日" integer min={1} max={31}') && sw.includes('<Money value={p.trialDays} unit="日" integer min={1} max={90}') && sw.includes('<Money value={S.shift.auto} unit="時間後" integer min={0} max={168}') && sw.includes('<Money value={S.float} unit="円" pre integer min={0} max={9999999}')
    && sw.includes('<Money value={S.svcVip} unit="%" integer min={0} max={100}') && sw.includes('<Money value={it.p} pre integer min={0}') && sw.includes('<Money value={S.cashRate} unit="% OFF" step={0.1} decimals={1} min={0} max={100}')
    && sw.includes("支払 ${payDayOf(S)} 日") && sw.includes("（${trialDaysOf(S)} 日）") && sw.includes("cashRateOf(S)") && sw.includes("cashFloatOf(S)") && sw.includes("svcVipOf(S)") && sw.includes("autoConfirmHoursOf(S)"));
  check("b6(c12-3) 保存の側に黙った Math.round が残っていない（送りの基本額 1000 だけは判断待ちで触らない）",
    !v5s.includes("Math.round(S.payroll.payday") && !v5s.includes("Math.round(S.pay.trialDays") && !v5s.includes("Math.round(S.shift.auto") && !v5s.includes("Math.round(S.float") && !v5s.includes("Math.round(S.svcVip") && !v5s.includes("Math.round(it.p)") && v5s.includes("okuri_base_amount: Math.max(0, Math.min(99999, Math.round(S.payroll.okuri || 0)))"));
}

if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-b6 ALL PASS (${pass} assertions)`);
