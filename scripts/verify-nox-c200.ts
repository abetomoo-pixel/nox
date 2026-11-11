/**
 * verify:nox-c200 — 0200 の client 便（2026-11-10＝フラグ MIG_0200_APPLIED=false の裏で先に実装）＋DDL 不要の部分。
 *  (1) 裁定472／473・M-131＝スマホのレジ＝出勤中だけ（duty_gate の例外を廃止）・店端末のみはスマホ不可（登録台数に関係なく）・キャスト会計の許可の 1 画面（段階 → 操作端末 → 会計できる卓 → キャスト別）・キャスト画面の設定はリンク 1 行・注文のみは会計タブなし
 *  (2) M-129＝お知らせの個別選択の純関数（区分→全員にチェック・外す／足す・検索・全選択／全解除・宛先 ○人・LINE ○通・残り ○通・LINE の宛先）と画面の配線（フラグの裏）
 *  (3) M-130＝スタッフ給与の支払い済み（確定後・解除は支払い済みの間は不可）・月報の経費一覧（支払い記録は利益に含めない＝利益が変わらない）
 *  (4) M-132＝明細＝ボタン名「明細」・プレビュー上部に「PDF で保存」（1 人分だけ印刷・ファイル名）
 *  (5) 0200 の heartbeat＝route /api/kiosk/person-touch（本人の auth・cookie・端末の fp・フラグ false は 409）・guard は操作がある間だけ 1 分ごと
 *  (6) M-133＝スタッフ編集モーダルにキオスクの PIN 欄（set_staff_pin／staff_pin_unlock・4〜6 桁・一覧に「PIN 未設定」）
 *  (7) gen-demo＝ACE の代表キャストに can_register・操作端末＝自分のスマホからも・0200 の後の個別送信と支払い済みはフラグの鏡の裏
 *  (8) live（BEGIN…ROLLBACK＝DB 変更 0）＝M-133＝店長がスタッフに PIN を設定 → 端末で kiosk_unlock（PIN だけ）→ kiosk_person_claim で本人セッション（role staff）・audit に PIN の値が無い
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { MIG_0200_APPLIED, mig0200On, __set0200ForTest } from "../lib/nox/rules-0175/flag";
import { castMineRegisterNavOf, castOwnSessionRegisterOf, castRegisterDenyReasonOf, castRegisterReasonOfAccess, CAST_REGISTER_DENY_TEXT } from "../lib/nox/register/p173";
import { castRegisterScopeOf, castRegisterScopeNoteOf } from "../lib/nox/rules-0175/cast-register";
import { emptyTargetSel, noticeAudLabelOf, noticeConfirmLineOf, noticeLineLinksOf, noticeRecipientsOf, noticeTargetsArgsOf, setTargetsAll, targetCountOf, targetPeopleFilterOf, targetSelOfGroup, toggleTarget, type TargetPerson } from "../lib/nox/notices/targets";
import { monthExpenseRowsOf, monthProfitOf, staffPayMarkableOf, staffUnlockableOf } from "../lib/nox/staff/labor-payment";
import { slipPdfTitleOf } from "../lib/nox/payroll/list";
import { staffPinStateTextOf, pinValidOf } from "../components/nox/kiosk-pin-field";
import { kioskPersonTouchDueOf } from "../components/nox/kiosk-person-guard";
import { loadEnvOrExit } from "./fixtures-f0";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = (x: unknown) => JSON.stringify(x);

// (0) フラグ
check("c200(0-1) ★0200 フラグ便（2026-11-10 手貼り・検証 32 行一致）＝MIG_0200_APPLIED=true・鏡（gen-demo）も true", (MIG_0200_APPLIED as boolean) === true && mig0200On() === true && src("scripts/demo/rules-0175-flag.mjs").includes("export const MIG_0200_APPLIED = true;"));
__set0200ForTest(false); const off = mig0200On(); __set0200ForTest(null); check("c200(0-2) __set0200ForTest(false) で mig0200On() は false（client の器はフラグの裏に戻る）", off === false && mig0200On() === true);

// (1) 裁定472／473・M-131
{
  const D = (device: "store_device" | "own_phone", registerDevices: number) => ({ enabled: true, canRegister: true, device, registerDevices });
  check("c200(1-1) M-131 店端末のみ＝登録台数 0 でもスマホ不可（store_device_only）・自分のスマホからも＝通す", castOwnSessionRegisterOf(D("store_device", 0)) === false && castRegisterDenyReasonOf(D("store_device", 0)) === "store_device_only" && castOwnSessionRegisterOf(D("own_phone", 0)) === true && castRegisterDenyReasonOf(D("own_phone", 3)) === null);
  check("c200(1-2) 裁定472 ナビ＝duty_gate に関わらず出勤中だけ（dutyGate false でも onDuty false なら off_duty）・文言「出勤中だけ使えます」", J(castMineRegisterNavOf({ reason: null, dutyGate: false, onDuty: false })) === J({ show: false, reason: "off_duty", note: "レジ：出勤中だけ使えます（出勤の後にナビに出ます）" }) && castMineRegisterNavOf({ reason: null, dutyGate: false, onDuty: true }).show === true && CAST_REGISTER_DENY_TEXT.off_duty === "レジは出勤中だけ使えます");
  check("c200(1-3) RPC auth_register_access の reason → 画面の理由語（off_duty／store_device→store_device_only／not_allowed は店の段階で store_off と読み分け）", castRegisterReasonOfAccess("off_duty", true) === "off_duty" && castRegisterReasonOfAccess("store_device", true) === "store_device_only" && castRegisterReasonOfAccess("not_allowed", true) === "not_allowed" && castRegisterReasonOfAccess("not_allowed", false) === "store_off" && castRegisterReasonOfAccess(null, true) === null);
  const ces = src("lib/nox/register/cast-entry-server.ts"), lay = src("app/(manage)/layout.tsx");
  check("c200(1-4) 入場（/register・/report）も出勤中だけ＝castRegisterEntryOf が castOnDutyOf を通す・フラグ true は auth_register_access の 1 本・duty_gate の例外なし", ces.includes("const d = await castOnDutyOf(supabase, sj);   // ★裁定472: 入場も出勤中だけ") && ces.includes('supabase.rpc("auth_register_access")') && !ces.includes("sj.duty_gate === true") && !ces.includes("registerDevices = count"));
  check("c200(1-5) スタッフ＝フラグ true で auth_register_access（出勤中だけ・店長以上は常に可）＝/register は /dashboard へ", lay.includes("staffRegister = regVis.show;") && fs.readFileSync("lib/nox/register/register-visibility-server.ts", "utf8").includes('gateOn ? supabase.rpc("auth_register_access")') /* ★M-158／M-159（2026-11-11）: 判定は registerVisibilityServerOf の 1 本（ナビとホームのクイック操作が共用） */);
  const crp = src("app/(manage)/master/cast-register-panel.tsx"), msp = src("app/(manage)/master/mine-settings-panel.tsx");
  check("c200(1-6) 裁定473 キャスト会計の許可の 1 画面＝段階 → 操作端末 → 会計できる卓（0200 の後に選択・前は注記）→ キャスト別・「店のキャスト会計 有効／無効」（set_store_cast_register）は撤去", ["1. キャストのレジ使用（段階）", "2. 操作端末", "3. 会計できる卓", "4. キャスト別の許可"].every((w) => crp.includes(w)) && crp.indexOf("2. 操作端末") < crp.indexOf("3. 会計できる卓") && crp.includes("patchStore({ cast_register_device: v }") && crp.includes("patchStore({ cast_register_scope: v }") && !crp.includes('rpc("set_store_cast_register"') && !crp.includes("switchStore"));
  check("c200(1-7) キャスト画面の設定＝レジ使用・操作端末を外しリンク 1 行（/master/cast-comp/register）", msp.includes('data-cast-register-link="473"') && msp.includes('href="/master/cast-comp/register"') && !msp.includes('rpc("set_store_cast_register"') && !msp.includes('data-cast-register-device="1"') && !msp.includes("setCastRegDevice"));
  check("c200(1-8) 会計できる卓＝既定は全卓・'own' だけ自分の卓・文言は設定に合わせる（「自分が着卓中／指名されている卓だけ」の固定文言は撤去）", castRegisterScopeOf(null) === "all" && castRegisterScopeOf({ cast_register_scope: "own" }) === "own" && castRegisterScopeNoteOf("all").includes("全卓") && !src("lib/nox/rules-0175/cast-register.ts").includes("どの段階でも自分が着卓中／指名されている卓のみ"));
  const rp = src("app/(manage)/register/page.tsx"), rb = src("app/(manage)/register/register-board.tsx");
  check("c200(1-9) 注文のみ（段階 1）のキャストには会計タブを出さない（RPC も check_pay／check_close で拒否）・段階は店の設定から（auth_cast_register_level は内部専用）", rp.includes("castRegisterLevelOf(") && rp.includes("castLevel={castLevel}") && rb.includes('.filter(([k]) => !(k === "pay" && castLevel === 1))'));
  check("c200(1-10) 段階の旧キー読み（cast_register_enabled）は画面から撤去（cast-comp の 2 page）・店舗設定の打刻ゲートは 0200 の後に撤去", !src("app/(manage)/master/cast-comp/page.tsx").includes("cast_register_enabled === true") && !src("app/(manage)/master/cast-comp/register/page.tsx").includes("cast_register_enabled === true") && !src("app/(manage)/master/store-profile-panel.tsx").includes("data-duty-gate") && src("app/(manage)/master/store-profile-panel.tsx").includes("★M-143") /* ★M-143（2026-11-10）: 打刻ゲート（duty_gate）は撤去＝裁定472 で例外が廃止 */);
}
// (2) M-129
{
  const P: TargetPerson[] = [{ kind: "cast", id: "c1", name: "ひなの", linked: true }, { kind: "cast", id: "c2", name: "るな", linked: false }, { kind: "staff", id: "s1", name: "田中", linked: true }];
  let sel = targetSelOfGroup(P, "cast");
  check("c200(2-1) 区分を押す＝その区分の全員にチェック → 個別に外す／足す", targetCountOf(sel) === 2 && sel.cast.has("c1") && (sel = toggleTarget(sel, { kind: "cast", id: "c2" }), !sel.cast.has("c2")) && (sel = toggleTarget(sel, { kind: "staff", id: "s1" }), sel.staff.has("s1")) && targetCountOf(sel) === 2);
  const shown = targetPeopleFilterOf(P, "ひな");
  check("c200(2-2) 名前検索・全選択／全解除は見えている人だけ", shown.length === 1 && targetCountOf(setTargetsAll(emptyTargetSel(), shown, true)) === 1 && targetCountOf(setTargetsAll(targetSelOfGroup(P, "all"), shown, false)) === 2);
  check("c200(2-3) 宛先 ○人・LINE ○通（連携済みだけ）・残り ○通＝裁定459 と同じ数え方・LINE を送らないときは宛先だけ", J(noticeRecipientsOf(P, "targets", sel)) === J({ people: 2, line: 2 }) && J(noticeRecipientsOf(P, "cast", sel)) === J({ people: 2, line: 1 }) && noticeConfirmLineOf({ people: 2, line: 2, sendLine: true, sent: 150, limit: 200 }) === "宛先 2人・LINE 2通・残り 50通" && noticeConfirmLineOf({ people: 2, line: 2, sendLine: false, sent: 0, limit: 200 }) === "宛先 2人（LINE は送らない）");
  check("c200(2-4) 作成の引数＝cast_ids／staff_ids（0 人と 200 人超は null）・一覧は「個別 N 人」", J(noticeTargetsArgsOf(sel)) === J({ p_cast_ids: ["c1"], p_staff_ids: ["s1"] }) && noticeTargetsArgsOf(emptyTargetSel()) === null && noticeAudLabelOf({ audience: "targets", cast_ids: ["a"], staff_ids: ["b", "c"] }, {}) === "個別 3人" && noticeAudLabelOf({ audience: "cast" }, { cast: "キャスト" }) === "キャスト");
  const L = [{ subject_kind: "cast", subject_id: "c1" }, { subject_kind: "cast", subject_id: "c2" }, { subject_kind: "membership", subject_id: "s1" }, { subject_kind: "membership", subject_id: "s2" }];
  check("c200(2-5) LINE の宛先＝targets は配列で絞る・cast_ids つきの旧型も絞る・区分は subject_kind", J(noticeLineLinksOf(L, { audience: "targets", cast_ids: ["c1"], staff_ids: ["s1"] }, ["cast", "membership"]).map((x) => x.subject_id)) === J(["c1", "s1"]) && J(noticeLineLinksOf(L, { audience: "cast", cast_ids: ["c2"] }, ["cast"]).map((x) => x.subject_id)) === J(["c2"]) && noticeLineLinksOf(L, { audience: "staff" }, ["membership"]).length === 2);
  const nb = src("app/(manage)/notices/notices-board.tsx"), rt = src("app/api/line/notice/route.ts");
  check("c200(2-6) 画面＝個別に選ぶ（フラグの裏）・キャスト／スタッフの見出し・検索・全選択／全解除・LINE の印・作成は notice_create_targets（6 引数）・確認に宛先 ○人・編集で宛先は変えない・route は宛先だけに送る", nb.includes("const targetsOn = mig0200On() && isManagerUp;") && nb.includes('data-notice-targets="1"') && nb.includes('data-notice-target-group={k}') && nb.includes("全選択") && nb.includes("全解除") && nb.includes('data-notice-target-linked="1"') && nb.includes('supabase.rpc("notice_create_targets", { p_title: fTitle, p_body: fBody, ...targetArgs, p_pinned: fPinned === true,') && nb.includes('data-notice-confirm-count="1"') && nb.includes("（宛先は変更できません）") && rt.includes("const links = noticeLineLinksOf(") && rt.includes('.is("blocked_at", null)'));
  check("c200(2-7) 375 幅＝宛先の一覧は auto-fill（minmax 140px）・名前は ellipsis・操作ボタンは .nox-actions（中央）", nb.includes('gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))"') && nb.includes('textOverflow: "ellipsis"') && (nb.match(/className="nox-actions" style=\{\{ display: "flex", gap: 6, flexWrap: "wrap"/g) ?? []).length >= 2);
}
// (3) M-130
{
  const pay = { period: "2026-10", paid_on: "2026-11-05", method: "transfer" as const, amount: 480000, headcount: 2, note: null };
  const rowsNo = monthExpenseRowsOf({ dailyExpense: 32000, payment: null }), rowsPaid = monthExpenseRowsOf({ dailyExpense: 32000, payment: pay });
  const base = { sales: 9_000_000, castLabor: 3_000_000, staffLabor: 480_000 };
  check("c200(3-1) 経費一覧＝日報の諸経費＋給与（スタッフ）の支払い記録（利益には含めない）", rowsNo.length === 1 && rowsPaid.length === 2 && rowsPaid[1].label === "給与（スタッフ）" && rowsPaid[1].inProfit === false && rowsPaid[1].amount === 480000 && rowsPaid[1].note === "振込・2人");
  check("c200(3-2) ★支払い済みにしても月報の利益が変わらない（二重計上しない＝損益の人件費は確定額の 1 本）", monthProfitOf({ ...base, expenses: rowsNo }) === monthProfitOf({ ...base, expenses: rowsPaid }) && monthProfitOf({ ...base, expenses: rowsPaid }) === 9_000_000 - 3_000_000 - 480_000 - 32_000);
  check("c200(3-3) 支払い済みにする＝店長以上 ∧ 確定済み ∧ 未払い・確定の解除は支払い済みの間は出さない", staffPayMarkableOf({ managerUp: true, locked: true, paid: false }) && !staffPayMarkableOf({ managerUp: true, locked: false, paid: false }) && !staffPayMarkableOf({ managerUp: false, locked: true, paid: false }) && !staffUnlockableOf({ locked: true, paid: true }) && staffUnlockableOf({ locked: true, paid: false }));
  const sw = src("app/(manage)/staff/staff-work-panel.tsx"), mr = src("app/(manage)/report/month-report.tsx");
  check("c200(3-4) 画面＝支払日・方法（現金／振込）のモーダル・staff_labor_mark_paid（冪等キー）／unmark・支払済のピル（キャストと同じ nox-runbadge paid）・解除の柵の 1 行・月報の経費一覧（data-not-in-profit）", sw.includes('supabase.rpc("staff_labor_mark_paid", { p_store_id: payForm.storeId, p_period: month, p_paid_on: payForm.paidOn, p_method: payForm.method, p_idem_key: payForm.idem, p_note: null })') && sw.includes('supabase.rpc("staff_labor_unmark_paid"') && sw.includes('className="nox-runbadge paid"') && sw.includes('data-staff-unlock-blocked="1"') && sw.includes('options={[["transfer", "振込"], ["cash", "現金"]]}') && mr.includes('data-not-in-profit="1"') && mr.includes("if (isManagerUp && mig0200On()) {"));
}
// (4) M-132
{
  const pb = src("app/(manage)/payroll/payroll-board.tsx");
  check("c200(4-1) 一覧のボタン名＝「明細」・プレビュー上部に「PDF で保存」（1 人分だけ印刷＝nox-print-only・全員分は外す）・ファイル名＝キャスト名_YYYY-MM_明細", pb.includes("setSlipPreview(true); }}>明細</button>") && !pb.includes(">明細 PDF</button>") && pb.includes("data-slip-pdf={r.castId}") && pb.includes("PDF で保存") && pb.includes('className="nox-print nox-print-only" data-slip-print') && pb.includes("&& !slipPrint ?") && slipPdfTitleOf("ひなの", "2026-10") === "ひなの_2026-10_明細" && slipPdfTitleOf("a/b c", "2026-10") === "a_b_c_2026-10_明細");
}
// (5) heartbeat
{
  const rt = src("app/api/kiosk/person-touch/route.ts"), gd = src("components/nox/kiosk-person-guard.tsx");
  check("c200(5-1) route＝本人の auth・cookie の session・端末の fp を service_role の kiosk_person_touch へ（フラグ false は 409）", rt.includes('if (!mig0200On()) return NextResponse.json({ error: "not available" }, { status: 409 });') && rt.includes('createAdminClient().rpc("kiosk_person_touch", { p_session_id: c.sessionId, p_auth_user: user.id, p_device_fp: fp })') && rt.includes("isValidDeviceFp(b.device_fp)"));
  check("c200(5-2) guard＝PIN の本人セッション ∧ フラグ true ∧ 直近 1 分に操作があるときだけ 1 分ごと（無操作・端末へ戻る・ロックで止まる）", gd.includes("const beat = isPin && mig0200On() ? window.setInterval(") && gd.includes("if (leaving.current || !kioskPersonTouchDueOf(last.current, Date.now())) return;") && kioskPersonTouchDueOf(1000, 30_000) && !kioskPersonTouchDueOf(1000, 90_000) && src("scripts/verify-nox-demo-guard.ts").includes('"kiosk/person-touch"'));
}
// (6) M-133
{
  const sb = src("app/(manage)/staff/staff-board.tsx"), pf = src("components/nox/kiosk-pin-field.tsx");
  check("c200(6-1) 純関数＝4〜6 桁・未設定／設定済み／ロック中", pinValidOf("1234") && pinValidOf("123456") && !pinValidOf("123") && !pinValidOf("1234567") && !pinValidOf("12a4") && staffPinStateTextOf(null, 0).label === "PIN 未設定" && staffPinStateTextOf({ has_pin: true, fail_count: 0, locked_until: null }, 0).label === "設定済み" && staffPinStateTextOf({ has_pin: true, fail_count: 5, locked_until: "2099-01-01T00:00:00Z" }, 0).locked === true);
  check("c200(6-2) 編集モーダル＝LINE 連携の下に PIN 欄（在籍・owner か自店）・一覧に「PIN 未設定」のチップ・状態は staff_pin_status", sb.indexOf('label="LINE 連携"') < sb.indexOf('label="キオスクの PIN"') && sb.includes("<KioskPinField membershipId={sel.id}") && sb.includes('data-staff-pin-chip="none">PIN 未設定</span>') && sb.includes('supabase.rpc("staff_pin_status", { p_store_id: st.id })'));
  check("c200(6-3) 部品＝set_staff_pin／staff_pin_unlock・入力は password（値は送信後に空）・ボタンは .nox-actions（中央）", pf.includes('createClient().rpc("set_staff_pin", { p_membership_id: membershipId, p_pin: val })') && pf.includes('createClient().rpc("staff_pin_unlock", { p_membership_id: membershipId })') && pf.includes('type="password"') && pf.includes('setBusy(false); setVal(""); // PIN の値は残さない') && pf.includes('className="nox-actions"'));
}
// (7) gen-demo
{
  const gd = src("scripts/demo/gen-demo.mjs"), ace = JSON.parse(src("docs/demo/payload/ace.json")) as { tables: Record<string, Record<string, unknown>[]> };
  const castMem = (ace.tables.memberships ?? []).find((m) => m.role === "cast"), st = (ace.tables.stores ?? [])[0];
  check("c200(7-1) デモ ACE＝代表キャストに can_register・操作端末＝自分のスマホからも（会計まで）・★0200 フラグ便で個別送信 1 件と支払い済み 1 か月分が payload に入った", castMem?.can_register === true && (st?.settings_json as Record<string, unknown>)?.cast_register_device === "own_phone" && (st?.settings_json as Record<string, unknown>)?.sys_cast_register === 2 && gd.includes('if (MIG_0200_APPLIED && code === "ace") push("notices"') && gd.includes('push("staff_labor_payments"') && (ace.tables.staff_labor_payments ?? []).length === 1 && (ace.tables.staff_labor_confirmed ?? []).length === 2 && (ace.tables.notices ?? []).filter((n) => n.audience === "targets").length === 1);
}

// (7-2) M-125＝操作担当 PIN の対象に can_register のキャスト（set_staff_pin と同じ条件）・デモ ACE の代表キャストに staff_pin
{
  const kpp = src("app/(manage)/master/kiosk-pin-panel.tsx"), ace2 = JSON.parse(src("docs/demo/payload/ace.json")) as { tables: Record<string, Record<string, unknown>[]> };
  const castMem2 = (ace2.tables.memberships ?? []).find((m) => m.role === "cast");
  check("c200(7-2) M-125 操作担当 PIN の対象＝owner／manager／staff＋can_register のキャスト・ACE の代表キャストに staff_pin（キオスクの PIN でキャストの本人セッション）", kpp.includes('(m.role === "cast" && m.can_register === true)') && !!castMem2 && (ace2.tables.staff_pin ?? []).some((p) => p.membership_id === castMem2.id));
}

(async () => {
  const env = loadEnvOrExit(["SUPABASE_DB_URL"]);
  const pc = new pg.Client({ connectionString: env.SUPABASE_DB_URL as string, ssl: { rejectUnauthorized: false } });
  await pc.connect();
  const cnt = async () => (await pc.query(`select (select count(*)::int from pg_proc where pronamespace='public'::regnamespace) f, (select count(*)::int from pg_tables where schemaname='public') t`)).rows[0] as { f: number; t: number };
  const before = await cnt();
  try {
    await pc.query("begin");
    try {
      const st = (await pc.query(`select s.id, s.org_id from public.stores s where s.name='NOX-VERIFY-A1'`)).rows[0] as { id: string; org_id: string };
      const mem = async (role: string) => (await pc.query(`select m.id, m.user_id, u.auth_user_id from public.memberships m join public.users u on u.id=m.user_id where m.store_id=$1 and m.role=$2 and m.is_active and u.auth_user_id is not null order by m.id limit 1`, [st.id, role])).rows[0] as { id: string; user_id: string; auth_user_id: string };
      const manager = await mem("manager"), staff = await mem("staff");
      type R = { ok: boolean; rows: Record<string, unknown>[]; err: string };
      const as = async (who: { auth_user_id: string }, sql: string, params: unknown[] = []): Promise<R> => {
        await pc.query("savepoint a");
        try {
          await pc.query("set local role authenticated");
          await pc.query(`select set_config('request.jwt.claims', $1, true)`, [J({ sub: who.auth_user_id, role: "authenticated" })]);
          const q = await pc.query(sql, params); await pc.query("reset role"); await pc.query("release savepoint a"); return { ok: true, rows: q.rows, err: "" };
        } catch (e) { await pc.query("rollback to savepoint a"); await pc.query("reset role"); return { ok: false, rows: [], err: (e as Error).message }; }
      };
      const su = async (sql: string, params: unknown[] = []): Promise<R> => { await pc.query("savepoint s"); try { const q = await pc.query(sql, params); await pc.query("release savepoint s"); return { ok: true, rows: q.rows, err: "" }; } catch (e) { await pc.query("rollback to savepoint s"); return { ok: false, rows: [], err: (e as Error).message }; } };
      // M-133: 店長がスタッフに PIN（他の人と重ならない値）を設定
      const PIN = "7391"; // ★kiosk_login は 4 桁固定（0191 の 4〜6 桁に追随していない＝既存の不具合＝0201 候補）＝ここは 4 桁で通す
      let x = await as(manager, `select public.set_staff_pin($1, $2)`, [staff.id, PIN]);
      check("c200(8-1) M-133 店長が自店のスタッフに PIN を設定＝ok・staff_pin_status で has_pin", x.ok && ((await as(manager, `select has_pin from public.staff_pin_status($1) where membership_id=$2`, [st.id, staff.id])).rows[0]?.has_pin === true), x.err);
      const au = (await pc.query(`select after_json::text a from public.audit_logs where action='set_staff_pin' and target=$1 order by at desc limit 1`, ["staff_pin:" + staff.id])).rows[0]?.a ?? "";
      check("c200(8-2) audit＝設定した事実だけ（PIN の値は残らない）", au.length > 0 && !au.includes(PIN), au);
      x = await as(staff, `select public.set_staff_pin($1, '1111')`, [staff.id]); check("c200(8-3) スタッフ本人からは forbidden（本人の変更は 0201 候補）", !x.ok && /forbidden/.test(x.err), x.err);
      // 端末（束縛済み）で PIN だけの解錠 → 本人セッション
      const kUid = randomUUID();
      const kr = await as(manager, `select public.kiosk_provision($1, $2, 'NOX-VERIFY-C200 端末') id`, [kUid, st.id]);
      check("c200(8-4) 試走用の端末", kr.ok, kr.err);
      const devId = kr.rows[0]?.id as string;
      await pc.query(`update public.kiosk_devices set device_fp='fpc200', bound_at=now() where id=$1`, [devId]);
      x = await as({ auth_user_id: kUid }, `select public.kiosk_unlock($1, null, 'fpc200') j`, [PIN]);
      const uj = (x.rows[0]?.j ?? null) as Record<string, unknown> | null;
      check("c200(8-5) キオスクの PIN だけの解錠（kiosk_unlock）で本人を特定＝ok", x.ok && !!uj && uj.ok === true, x.ok ? uj : x.err);
      const cj = await su(`select public.kiosk_person_claim($1, 'fpc200') j`, [kUid]);
      const j = (cj.rows[0]?.j ?? null) as Record<string, unknown> | null;
      check("c200(8-6) M-133 その PIN で本人セッションに入れる（kiosk_person_claim＝role staff・membership＝設定したスタッフ）", cj.ok && !!j && j.ok === true && j.role === "staff" && j.membership_id === staff.id, cj.ok ? j : cj.err);
      const mid = await cnt(); check("c200(8-7) tx 内も関数・表は不変", mid.f === before.f && mid.t === before.t, mid);
    } finally { await pc.query("rollback"); }
    const after = await cnt();
    check("c200(8-8) ROLLBACK＝DB 変更 0", after.f === before.f && after.t === before.t, after);
  } finally { await pc.end(); }
  if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
  console.log(`verify:nox-c200 ALL PASS (${pass} assertions)`);
})();
