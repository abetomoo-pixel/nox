/**
 * verify:nox-c201 — 0201 のフラグ便に同乗した client 便（2026-11-11）。DB 不触（M-137 の本番経路は verify:nox-pricing-resolve-category prc(m137)）。
 *  (1) M-158／M-159 レジの出し分け＝1 つの関数（registerVisibilityOf）を役割×許可×出勤×打刻しない店の全組み合わせで・ナビ（layout）とホームのクイック操作が同じ関数・出勤前の案内
 *  (2) M-157 差異の承認と再締め＝店長以上と「締め」権限のスタッフだけ（レジ ON のキャストに出さない）
 *  (3) M-139 日報＝主要な数字のカード 5（売上・現金・組数・人数・未会計）と内訳の別ブロック（2 列・375 は 1 列）
 *  (4) M-155 追記 375 の縞＝tr に色・td の地を外す
 *  (5) M-154 キオスクの PIN 入力＝共通部品 PinPad（出退勤と本人ログインの両方）
 *  (6) M-160 自分のシフト＝ホームのカードと自分の分だけの一覧（確定だけ・確認／辞退のボタンなし）
 */
import fs from "node:fs";
import { registerVisibilityOf, REGISTER_OFF_DUTY_NOTE_PUNCH, REGISTER_OFF_DUTY_NOTE_STORE } from "../lib/nox/register/register-visibility";
import { myStaffScheduleRowsOf } from "../lib/nox/staff/my-shift-server";
import { scheduleOf } from "../lib/nox/mine/schedule";
import { pinReady } from "../components/nox/pin-pad";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

// (1)
{
  const bad: string[] = [];
  for (const role of ["owner", "manager", "admin", "staff", "cast", null]) for (const canRegister of [true, false]) for (const duty of ["in", "before", "after"] as const) for (const punchMode of ["punch", "store"]) {
    const access = duty === "in" ? { allowed: true, reason: null } : { allowed: false, reason: "off_duty" };
    const v = registerVisibilityOf({ role, canRegister, access, gateOn: true, punchMode });
    const expShow = role === "owner" || role === "manager" || role === "admin" ? true : role === "staff" ? canRegister && duty === "in" : false;
    const expNote = role === "staff" && canRegister && duty !== "in" ? (punchMode === "store" ? REGISTER_OFF_DUTY_NOTE_STORE : REGISTER_OFF_DUTY_NOTE_PUNCH) : null;
    if (v.show !== expShow || v.note !== expNote) bad.push(`${role}/${canRegister}/${duty}/${punchMode}=${JSON.stringify(v)}`);
  }
  check("c201(1-1) M-158／M-159 レジの出し分け＝店長以上は常時・スタッフは許可 ∧ 出勤中・出勤前／退勤後は許可のある人だけ案内（打刻する店／しない店で文言）・キャストは (manage) では出さない（全 72 通り）", bad.length === 0, bad.slice(0, 5));
  check("c201(1-2) 案内の文言（M-159 確定）", REGISTER_OFF_DUTY_NOTE_PUNCH === "店の端末で出勤するとレジが使えます" && REGISTER_OFF_DUTY_NOTE_STORE === "確定シフトの時間内にレジが使えます");
  const lay = src("app/(manage)/layout.tsx"), dp = src("app/(manage)/dashboard/page.tsx"), db = src("app/(manage)/dashboard/dashboard-board.tsx");
  check("c201(1-3) ナビ（サイドメニューと下の固定ナビ＝同じ navGroups）・/register の入口・ホームのクイック操作が同じ関数（registerVisibilityServerOf）・クイック操作のレジは regVis.show のときだけ・案内の 1 行",
    lay.includes("registerVisibilityServerOf(supabase, role)") && lay.includes("staffRegister = regVis.show;") && lay.includes('redirect("/dashboard")')
    && dp.includes("const regVis = await registerVisibilityServerOf(supabase, role);") && dp.includes('...(regVis.show ? [{ href: "/register", label: "レジ" }] : []),') && !dp.includes('    { href: "/register", label: "レジ" },')
    && dp.includes("registerNote={regVis.note}") && db.includes('data-register-note="1"'));
}
{
  const rp = src("app/(manage)/register/page.tsx");
  check("c201(1-4) M-159 追記＝/register のページ自体でも同じ判定（レイアウトは画面の移動で描き直さない＝ホームのリンクから入れた）・出せない人はホームへ",
    rp.includes('if (role === "staff" && !(await registerVisibilityServerOf(supabase, role)).show) redirect("/dashboard?reg=off");'));
}
// (2)
{
  const rb = src("app/(manage)/report/report-board.tsx");
  check("c201(2-1) M-157 差異の承認と再締め＝canApproveDiff（店長以上 ∨ 締め権限のスタッフ＝cash_diff_approve／daily_report_reclose と同じ・キャストを含まない）",
    rb.includes("const canApproveDiff = isManagerUp || staffPerm.close;") && rb.includes('canApproveDiff && <button style={{ ...btnLight, marginLeft: 6 }} data-diff-approve="1"') && rb.includes("{canApproveDiff && <button style={btnLight} onClick={() => scrollToClose(r.biz_date)}>再締め</button>}") && !/canClose && <button[^\n]*差異を承認/.test(rb));
}
// (3)
{
  const rb = src("app/(manage)/report/report-board.tsx"), css = src("app/globals.css");
  const i = rb.indexOf('<div className="l">売上（暫定）</div>'), seg = rb.slice(i, rb.indexOf("</div>\n          );", i));
  const labels = [...seg.matchAll(/<div className="l">([^<{]+)<\/div>/g)].map((m) => m[1]);
  check("c201(3-1) M-139 主要な数字のカード＝売上（暫定）・現金・組数・人数・未会計（この順）", JSON.stringify(labels) === JSON.stringify(["売上（暫定）", "現金", "組数", "人数", "未会計"]), labels);
  check("c201(3-2) M-139 内訳＝別のブロック（dl 2 列・項目名と右寄せの数字・375 は 1 列・表の横スクロールなし）",
    rb.includes('<dl className="nox-repdetail-list">') && rb.includes('<div key={label} className="row"><dt>{label}</dt><dd className="num">{v}</dd></div>') && !rb.includes('className="nox-tablewrap plain nw nox-rep-kpiband"')
    && css.includes(".nox-repdetail-list dd { margin: 0; font-weight: 700; color: var(--ink); text-align: right;") && css.includes("@media (max-width: 599px) { .nox-repdetail-list { grid-template-columns: 1fr; } }"));
}
// (4)
{
  const css = src("app/globals.css");
  check("c201(4-1) M-155 追記 375 の縞＝カードの tr に 1 行おきの色・td の地は外す", css.includes(".nox-rwrap table.nox-normtable tbody tr:nth-child(even) { background:") && css.includes(".nox-rwrap table.nox-normtable tbody tr td { background: transparent !important; }"));
}
// (5)
{
  const pad = src("components/nox/pin-pad.tsx"), kp = src("app/kiosk/page.tsx"), up = src("components/nox/kiosk-unlock-pad.tsx"), css = src("app/globals.css");
  check("c201(5-1) M-154 PIN 入力の共通部品＝出退勤（/kiosk）と本人ログイン（KioskUnlockPad）が同じ PinPad・丸は入力した数だけ（薄い丸なし）・表示「PIN（4〜6 桁）」・金の枠のキーが横幅いっぱい 3 列・決定は横幅いっぱい",
    kp.includes("<PinPad value={pin} onChange={setPin}") && up.includes("<PinPad value={pin} onChange={setPin} />") && pad.includes("Array.from({ length: value.length }") && pad.includes("PIN（${PIN_MIN}〜${PIN_MAX} 桁）")
    && css.includes(".nox-pinpad-keys { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; width: 100%; }") && css.includes("border: 1px solid var(--gold)") && kp.includes('<div className="nox-pinpad-go two">') && up.includes('<div className="nox-pinpad-go">')
    && !kp.includes("[0, 1, 2, 3].map") && !up.includes("[0, 1, 2, 3, 4, 5].map"));
  check("c201(5-2) PIN の桁＝4〜6 だけ決定できる", !pinReady("123") && pinReady("1234") && pinReady("123456") && !pinReady("1234567"));
}
// (6)
{
  const rows = myStaffScheduleRowsOf(
    [{ id: "a", biz_date: "2026-11-12", start_hm: "19:00", end_hm: "25:00", status: "confirmed" }, { id: "b", biz_date: "2026-11-13", start_hm: "19:00", end_hm: "25:00", status: "proposed" }],
    [{ id: "w1", biz_date: "2026-11-14", available: true }, { id: "w2", biz_date: "2026-11-15", available: false }]);
  const sc = scheduleOf({ ...rows, month: "2026-11", today: "2026-11-11" });
  check("c201(6-1) M-160 自分のシフト＝確定だけ（確定前の行は本人へ出さない）・希望は出られる日だけ「申請済み」・確認／辞退のボタンなし（proposed は作らない）",
    sc.fixed.map((x) => x.id).join() === "a" && sc.pending.map((x) => x.id).join() === "w1" && sc.pending.every((x) => !x.proposed) && sc.fixed.every((x) => !x.proposed));
  const dp = src("app/(manage)/dashboard/page.tsx"), pg = src("app/(manage)/shift/mine/page.tsx"), card = src("app/mine/schedule-card.tsx");
  check("c201(6-2) M-160 ホームのカード（スタッフ・店長・シフトの権限が無くても）と自分の分だけの一覧ページ（/shift/mine＝全体の表は出さない）・部品は readOnly で確認／辞退を出さない",
    dp.includes('const my = role === "staff" || role === "manager" ? await myStaffScheduleOf(supabase, cutoffOf(store)) : null;') && dp.includes('<Link href="/shift/mine"') && pg.includes("<ScheduleCard tabs={my.tabs} readOnly")
    && !pg.includes("ShiftBoard") && card.includes("{x.proposed && !readOnly && <ShiftConfirmButton") && card.includes("{wishHref && <Link href={wishHref}"));
}

if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-c201 ALL PASS (${pass} assertions)`);
