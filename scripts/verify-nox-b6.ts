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

if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-b6 ALL PASS (${pass} assertions)`);
