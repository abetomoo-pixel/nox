/*
 * verify:nox-noon1119 — 通しで出た直しの便（2026-11-19 昼・相談役 ②③）。お金の計算の式には触れない（表示だけ）。
 *  g(1)〜g(3) ② レジを使えないキャストに卓の一覧（「使用中 0／6卓」と空席の並び）の代わりの案内：純関数・layout の差し込み・案内の部品。権限の判定（auth_register_access・castRegisterEntryOf）は変えない。
 *  t(1)〜t(3) ③ 明細の時給の行：時給 0 円・額 0 円の「時給 ¥0/h × ◯h ¥0」は出さない。時給のある人（0h でも＝303-2）・固定給・1稼働・区間行は今のまま。
 */
import fs from "node:fs";
import { castRegisterGuideOf, CAST_REGISTER_OFF_DUTY_GUIDE, CAST_REGISTER_GUIDE_BACK, CAST_REGISTER_STORE_WINDOW_GUIDE, CAST_REGISTER_NOT_ALLOWED_GUIDE, CAST_REGISTER_GUIDE_BACK_STORE } from "../lib/nox/register/cast-register-guide";
import { REGISTER_OFF_DUTY_NOTE_STORE } from "../lib/nox/register/register-visibility";
import { breakdownLinesOf, timeLineOf, timeZeroWageOf } from "../lib/nox/payroll/breakdown-lines";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }

// ── ② ──
check("g(1-1) 文言＝「出勤の打刻をしてから、レジを使えます」・ボタン「打刻の画面へ戻る」", CAST_REGISTER_OFF_DUTY_GUIDE === "出勤の打刻をしてから、レジを使えます" && CAST_REGISTER_GUIDE_BACK === "打刻の画面へ戻る");
check("g(1-2) 使える（allowed）＝案内なし（卓の一覧をそのまま）", castRegisterGuideOf({ allowed: true, reason: null, storeDecidesPunch: false }) === null && castRegisterGuideOf({ allowed: true, reason: "off_duty", storeDecidesPunch: true }) === null);
{
  const g = castRegisterGuideOf({ allowed: false, reason: "off_duty", storeDecidesPunch: false });
  check("g(1-3) 出勤前（off_duty・打刻する店）＝打刻の案内", !!g && g.kind === "off_duty" && g.text === CAST_REGISTER_OFF_DUTY_GUIDE && g.back === CAST_REGISTER_GUIDE_BACK, g);
  const s = castRegisterGuideOf({ allowed: false, reason: "off_duty", storeDecidesPunch: true });
  check("g(1-4) 打刻しない店の出勤前＝確定シフトの時間の案内（register-visibility と同じ文）・ボタンは「戻る」", !!s && s.text === CAST_REGISTER_STORE_WINDOW_GUIDE && s.text === REGISTER_OFF_DUTY_NOTE_STORE && s.back === CAST_REGISTER_GUIDE_BACK_STORE, s);
  const n = ["not_allowed", "store_device", "forbidden", null].map((r) => castRegisterGuideOf({ allowed: false, reason: r, storeDecidesPunch: false }));
  check("g(1-5) ほかの理由（許可なし＝締めの許可だけの人が「日報」のタイルから回された等）＝許可が無い案内（打刻を促さない）", n.every((x) => !!x && x.kind === "not_allowed" && x.text === CAST_REGISTER_NOT_ALLOWED_GUIDE && !x.text.includes("打刻")), n);
}
{
  const ly = fs.readFileSync("app/(manage)/layout.tsx", "utf8");
  check("g(2-1) 店の端末の本人セッションの cast＝auth_register_access を読む（0200 のフラグ配下）・入口の判定は今のまま（/register だけ通す）", ly.includes(`if (kioskPersonCast && mig0200On()) { const { data: ga } = await supabase.rpc("auth_register_access");`) && ly.includes('if (!(pn === "/register" || pn.startsWith("/register/"))) redirect("/register");') && ly.includes("let castReg = !!kioskPersonCast;"));
  check("g(2-2) 自分のスマホ＝/register の出勤前だけ案内（日報の出勤前・許可なし・店端末のみは今までどおり /mine へ理由つきで戻す）", ly.includes(`if (!castReg && e.reason === "off_duty" && (pathname === "/register" || pathname.startsWith("/register/"))) { castGuideAccess = { allowed: false, reason: "off_duty" }; castReg = true; }`) && ly.includes('if (!castReg) redirect(`/mine?denied=register&why=${e.reason ?? "not_allowed"}`);') && ly.includes('if (!(onRegister && castReg)) redirect("/mine");') && ly.includes("const e = await castRegisterEntryOf(supabase);"));
  check("g(2-3) 案内は本体（卓の一覧）の代わりに出す＝卓の数と空席の並びを描かない・店の営業時間の器はそのまま", ly.includes("<StoreHoursProvider value={storeHours}>{castGuide ? <CastRegisterGuidePanel guide={castGuide} kiosk={!!kioskPersonCast} /> : children}</StoreHoursProvider>"));
  check("g(2-4) 打刻しない店の見分け＝店の punch_mode（storeDecidesPunchOf）", ly.includes("storeDecidesPunch: storeDecidesPunchOf((storeRows?.[0]?.settings_json ?? null) as Record<string, unknown> | null)"));
  const cp = fs.readFileSync("components/nox/cast-register-guide.tsx", "utf8");
  check("g(3-1) 案内の部品：店の端末＝本人の終了で端末のホーム（打刻の画面）へ・スマホ＝/mine（打刻のボタンがある本人のホーム）", cp.includes(`onClick={() => { void endKioskPersonSession(createClient(), "manual"); }}`) && cp.includes(`<Link href="/mine" data-cast-register-guide-back="mine"`));
  check("g(3-2) 案内の部品は卓の数・空席を出さない（卓・使用中・空席の語が無い）", !/卓|使用中|空席/.test(cp.replace(/\/\/.*$/gm, "")));
  const ces = fs.readFileSync("lib/nox/register/cast-entry-server.ts", "utf8");
  check("g(3-3) 権限の判定は変えない（castRegisterEntryOf の出勤中の判定は今のまま）", ces.includes(`return d.onDuty ? { allowed: true, canRegister: true, reason: null } : { allowed: false, canRegister: true, reason: "off_duty" };`) && ces.includes(`const { data } = await supabase.rpc("auth_register_access");`));
}

// ── ③ ──
{
  const host = { wage: 0, wHours: 120, timePay: 0, honBack: 5000, cbacks: [{ name: "売上歩合（小計の 40%）", amount: 80000 }], customTotal: 80000, gross: 85000, net: 85000 };
  const bd = breakdownLinesOf({ pay: host, frozen: true });
  check("t(1-1) 時給 0 円・額 0 円＝時給の行を出さない（ホストの明細の先頭）", !bd.earn.some((l) => l.key.startsWith("timePay")) && !bd.earn.some((l) => /時給 ¥0\/h/.test(l.label)), bd.earn.map((l) => l.key));
  const withLine = [timeLineOf(host), ...bd.earn];
  check("t(1-2) 合計と手取りは変わらない（0 円の行を外しただけ）", bd.earnTotal === withLine.reduce((a, l) => a + (l.info ? 0 : l.amount), 0) && bd.net === 85000, [bd.earnTotal, bd.net]);
  check("t(1-3) シフト時間保証でも時給 0 円・額 0 円なら出さない", !breakdownLinesOf({ pay: { ...host, payRule: { rule: "shift_guarantee", guaranteedHours: 100 } }, frozen: true }).earn.some((l) => l.key.startsWith("timePay")));
  const keep = [
    breakdownLinesOf({ pay: { wage: 3000, wHours: 0, timePay: 0, gross: 0, net: 0 } }),
    breakdownLinesOf({ pay: { wage: 3000, wHours: 10, timePay: 30000, gross: 30000, net: 30000 } }),
    breakdownLinesOf({ pay: { payRule: { rule: "fixed", fixedAmount: 0, calcDays: 31, periodDays: 31 }, timePay: 0, gross: 0, net: 0 } }),
    breakdownLinesOf({ pay: { payRule: { rule: "per_shift", perShiftAmount: 0, shiftCount: 0 }, timePay: 0, gross: 0, net: 0 } }),
    breakdownLinesOf({ pay: { wage: 0, wHours: 10, timePay: 500, gross: 500, net: 500 } }),
  ];
  check("t(2-1) 時給のある人（0h でも＝303-2）・固定給・1稼働・額のある行は今のまま先頭に出す", keep.every((b) => b.earn[0]?.key === "timePay"), keep.map((b) => b.earn[0]?.label));
  check("t(2-2) 時給のある 0h の行＝「時給 ¥3,000/h × 0h」（303-2 のまま）", keep[0].earn[0].label === "時給 ¥3,000/h × 0h" && keep[0].earn[0].amount === 0);
  check("t(2-3) 判定の関数：区間行（2 本以上）は外さない・時給の行以外は外さない", !timeZeroWageOf({ wage: 0, timePay: 0 }, [{ key: "timePay-1", label: "a", amount: 0 }, { key: "timePay-2", label: "b", amount: 0 }]) && !timeZeroWageOf({ wage: 0, timePay: 0, payRule: { rule: "fixed" } }, [{ key: "timePay", label: "固定給", amount: 0 }]) && timeZeroWageOf({ wage: 0, timePay: 0 }, [{ key: "timePay", label: "時給 ¥0/h × 3h", amount: 0 }]));
  const src = fs.readFileSync("lib/nox/payroll/breakdown-lines.ts", "utf8");
  check("t(3-1) 表示だけ（breakdownLinesOf の時給の行の差し込みだけ・確定の内訳を作る core／collect は触らない）", src.includes("if (!timeZeroWageOf(p, timeLines)) earn.push(...timeLines);") && !fs.readFileSync("lib/nox/payroll/core.ts", "utf8").includes("timeZeroWageOf") && !fs.readFileSync("lib/nox/payroll/collect.ts", "utf8").includes("timeZeroWageOf"));
}

if (fails.length) { console.error(`✗ verify:nox-noon1119 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-noon1119 OK (${pass} checks)`);
