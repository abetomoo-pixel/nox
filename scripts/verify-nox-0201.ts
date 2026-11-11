/**
 * verify:nox-0201 — 0201（2026-11-11 Agoora 手貼り・sha16 ccf2d6d61e36da42・529 行・検証 17 行が全行一致・関数 427→431・表 121）のフラグ便。
 *   裁定474（打刻設定を BANZEN と同じ形に＝判定は本人のスマホ打刻だけ・位置は端末・IP はサーバー）・追補（both は IP 必須＝BANZEN と違える）・M-133（PIN 4〜6 桁・本人の PIN 変更）。
 *  (1) フラグ＝MIG_0201_APPLIED=true・override・gen-demo の鏡
 *  (2) 収蔵＝supabase/migrations/0201_punch_rules_pin.sql（sha16・行数・begin;／commit; 1 回ずつ・lock_timeout＝教訓128／132）
 *  (3) live（読取）＝docs/tmp/0201_verify.sql の 17 行が期待値どおり（教訓137＝③④⑤は comment を除いた本文）
 *  (4) 純関数＝decidePunch（18 通りのうち lib 側）・打刻設定の保存の柵（■3d）・勤怠の印・本人の打刻の和文・PIN 変更の和文
 *  (5) client の結線＝route（within_schedule を必ず渡す・IP はサーバー・service_role）・/mine の打刻・店舗設定の打刻設定（店長の打刻の許可のスイッチは出さない）・
 *      本人の PIN 変更・キオスクの出退勤の PIN 4〜6 桁・初期設定の写し先・シフトの今日タブの印
 */
import fs from "node:fs";
import { createHash } from "node:crypto";
import pg from "pg";
import { MIG_0201_APPLIED, mig0201On, __set0201ForTest } from "../lib/nox/rules-0175/flag";
import { decidePunch, evaluateGeofence, type RestrictMode } from "../lib/nox/punch/geofence";
import { punchHardMissingOf, punchRulesFormErrOf, punchRulesPatchOf, type PunchRulesForm } from "../lib/nox/punch/rules-form";
import { punchMarksOf } from "../lib/nox/punch/marks";
import { overridableOf, selfPunchErrJa } from "../lib/nox/punch/self-client";
import { loadEnvOrExit } from "./fixtures-f0";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const FN = 431, TB = 121;

// (1)
check("0201(1-1) MIG_0201_APPLIED=true（2026-11-11 手貼り・検証 17 行一致）・override", (MIG_0201_APPLIED as boolean) === true && mig0201On() === true);
__set0201ForTest(false); check("0201(1-2) __set0201ForTest(false) で mig0201On() は false", mig0201On() === false); __set0201ForTest(null);
check("0201(1-3) gen-demo の鏡（scripts/demo/rules-0175-flag.mjs）も true", /export const MIG_0201_APPLIED = true;/.test(src("scripts/demo/rules-0175-flag.mjs")));
// (2)
{
  const mig = fs.readFileSync("supabase/migrations/0201_punch_rules_pin.sql");
  const sha16 = createHash("sha256").update(mig).digest("hex").slice(0, 16);
  const L = mig.toString("utf8").split("\n");
  const b = L.indexOf("begin;"), e = L.indexOf("commit;");
  check("0201(2-1) 収蔵＝sha16 ccf2d6d61e36da42・529 行・begin;／commit; 1 回ずつ・begin の直後に lock_timeout（教訓128／132）",
    sha16 === "ccf2d6d61e36da42" && L.length === 530 && b >= 0 && e > b && L.filter((l) => l === "commit;").length === 1 && L[b + 1] === "set local lock_timeout = '10s';", { sha16, lines: L.length, b, e });
}
// (4) 純関数
{
  const STORE = { lat: 35.69, lng: 139.70, radius: 100, allowIp: ["203.0.113.5"] };
  const IN = { lat: 35.6905, lng: 139.7003, ip: "198.51.100.9", accuracy: 20 };
  const kind = (enf: boolean, mode: RestrictMode, c: typeof IN, reason: string | null = null) => { const d = decidePunch(enf, mode, evaluateGeofence(mode, STORE, c), reason); return d.kind === "blocked" ? d.code : d.kind; };
  check("0201(4-1) decidePunch＝both ハード・精度不足＋他の IP は geofence_blocked（裁定474 追補＝BANZEN と違える）・＋店の IP は ok・either は精度不足で ok",
    kind(true, "both", { ...IN, accuracy: 500 }) === "geofence_blocked" && kind(true, "both", { ...IN, accuracy: 500, ip: "203.0.113.5" }) === "ok" && kind(true, "either", { ...IN, accuracy: 500 }) === "ok");
  check("0201(4-2) decidePunch＝gps ハード・位置なし＝geofence_unavailable・理由ありで override・tablet は理由でも terminal_only・ソフトは常に ok",
    kind(true, "gps", { lat: null as unknown as number, lng: null as unknown as number, ip: null as unknown as string, accuracy: null as unknown as number }) === "geofence_unavailable"
    && kind(true, "gps", { ...IN, lat: 35.70, lng: 139.72 }, "理由") === "override" && kind(true, "tablet", IN, "理由") === "terminal_only" && kind(false, "both", { ...IN, accuracy: 500 }) === "ok");
  const F = (o: Partial<PunchRulesForm>): PunchRulesForm => ({ enforce: true, mode: "gps", lat: "", lng: "", radius: "", ipCount: 0, requireShift: "off", ...o });
  const pos = { lat: "35.69", lng: "139.7", radius: "100" };
  check("0201(4-3) ■3d ハードは判定方法に必要な値が揃わないと保存できない（gps＝位置と半径／ip＝IP 1 件以上／both＝両方／either＝どちらか／tablet＝要らない）・ソフトは常に可",
    !!punchHardMissingOf(F({})) && punchHardMissingOf(F(pos)) === null && !!punchHardMissingOf(F({ mode: "ip" })) && punchHardMissingOf(F({ mode: "ip", ipCount: 1 })) === null
    && !!punchHardMissingOf(F({ mode: "both", ...pos })) && !!punchHardMissingOf(F({ mode: "both", ipCount: 1 })) && punchHardMissingOf(F({ mode: "both", ...pos, ipCount: 1 })) === null
    && !!punchHardMissingOf(F({ mode: "either" })) && punchHardMissingOf(F({ mode: "either", ipCount: 1 })) === null && punchHardMissingOf(F({ mode: "either", ...pos })) === null
    && punchHardMissingOf(F({ mode: "tablet" })) === null && punchHardMissingOf(F({ enforce: false })) === null);
  check("0201(4-4) 打刻設定の形の検査（緯度・経度・半径の範囲・片方だけは不可）と patch の 6 キー",
    punchRulesFormErrOf(F({ lat: "91", lng: "1" })) !== null && punchRulesFormErrOf(F({ lat: "35", lng: "" })) !== null && punchRulesFormErrOf(F({ radius: "5" })) !== null && punchRulesFormErrOf(F(pos)) === null
    && JSON.stringify(Object.keys(punchRulesPatchOf(F(pos))).sort()) === JSON.stringify(["punch_enforce", "punch_lat", "punch_lng", "punch_radius_m", "punch_require_shift", "punch_restrict_mode"]));
  const mk = punchMarksOf([{ cast_id: "a", within_geofence: false, geo_override: true }, { cast_id: "a", within_schedule: false }, { cast_id: "b", within_geofence: null, within_schedule: null }, { cast_id: "c", within_geofence: false }]);
  check("0201(4-5) 勤怠の印＝範囲外（理由あり）／範囲外／予定外・null（未判定）は印なし", JSON.stringify(mk.get("a")) === JSON.stringify(["範囲外（理由あり）", "予定外"]) && !mk.has("b") && JSON.stringify(mk.get("c")) === JSON.stringify(["範囲外"]));
  check("0201(4-6) 本人の打刻の和文＝範囲外と位置が取れないだけ理由で通る・no shift は和文", overridableOf("geofence_blocked") && overridableOf("geofence_unavailable") && !overridableOf("terminal_only") && !overridableOf("no shift") && selfPunchErrJa("no shift").includes("確定シフト"));
}
// (5) client の結線
{
  const rt = src("app/api/punch/self/route.ts"), wf = src("app/api/punch/wifi/route.ts"), pa = src("app/mine/punch-actions.tsx"), pp = src("app/(manage)/master/punch-rules-panel.tsx"), sp = src("app/(manage)/master/store-profile/page.tsx");
  check("0201(5-1) route＝本人の auth・IP はサーバー（clientIpOf(x-forwarded-for)）・within_schedule を必ず渡す（④）・service_role で punch_self_impl",
    rt.includes("supabase.auth.getUser()") && rt.includes('clientIpOf((await headers()).get("x-forwarded-for"))') && rt.includes("within_schedule: (count ?? 0) > 0") && rt.includes('admin.rpc("punch_self_impl"'));
  check("0201(5-2) Wi-Fi の登録＝route がサーバーで IP を読んで store_wifi_add（画面の申告にしない）", wf.includes('clientIpOf((await headers()).get("x-forwarded-for"))') && wf.includes('supabase.rpc("store_wifi_add", { p_store_id: storeId, p_ip: ip })'));
  check("0201(5-3) /mine の打刻＝フラグ true は route（selfPunch）・範囲外は理由の欄（別部品＝金額の入力欄を置かない約束）", pa.includes("if (mig0201On()) {") && pa.includes("await selfPunch({") && pa.includes("<PunchReason ") && !pa.includes("<input"));
  check("0201(5-4) 店舗設定の打刻設定＝利用機能に出す・保存は set_store_profile・ハードの柵の理由を保存ボタンの近く・★店長の打刻の許可のスイッチは出さない（■3c＝0201c のフラグ便）",
    sp.includes("{mig0201On() && <PunchRulesPanel stores={stores} isOwner={isOwner} />}") && pp.includes('rpc("set_store_profile", { p_store_id: storeSel, p_patch: punchRulesPatchOf(f) })') && pp.includes("data-punch-save-block") && !pp.includes("set_store_manager_punch") && !/manager_punch_enabled\b(?! のスイッチ)/.test(pp.replace(/\/\/[^\n]*/g, "")));
  check("0201(5-5) 本人の PIN 変更＝スタッフ・店長はホーム（staff_pin_self_set）・キャストは /mine（cast_pin_self_set）・jsonb の reason を和文",
    src("components/nox/pin-self-card.tsx").includes('kind === "staff" ? "staff_pin_self_set" : "cast_pin_self_set"') && src("app/(manage)/dashboard/page.tsx").includes('<PinSelfCard kind="staff" />') && src("app/mine/page.tsx").includes('<PinSelfCard kind="cast" />'));
  check("0201(5-6) キオスクの出退勤の PIN＝0201 の後は 4〜6 桁（共通部品 PinPad）", src("app/kiosk/page.tsx").includes("const pinMax = (): number => (mig0201On() ? 6 : 4);") && src("app/kiosk/page.tsx").includes("<PinPad value={pin} onChange={setPin} max={pinMax()}"));
  check("0201(5-7) 初期設定の「条件に合わないとき」の写し先＝punch_enforce（予定外 punch_require_shift ではない）・ハードは店舗設定で値を入れてから", src("lib/nox/setup/v5.ts").includes('if (S.punch.how === "any") patch.punch_enforce = false;') && !src("lib/nox/setup/v5.ts").includes("patch.punch_require_shift =") && src("app/(manage)/setup/setup-wizard.tsx").includes("data-setup-punch-hard"));
  check("0201(5-8) シフトの今日タブ＝勤怠の印（within_geofence／geo_override／within_schedule を読む）", src("app/(manage)/shift/shift-board.tsx").includes("within_geofence, geo_override, within_schedule") && src("app/(manage)/shift/shift-board.tsx").includes("data-punch-mark={mk}"));
}

(async () => {
  const env = loadEnvOrExit(["SUPABASE_DB_URL"]);
  const pc = new pg.Client({ connectionString: env.SUPABASE_DB_URL as string, ssl: { rejectUnauthorized: false } });
  await pc.connect();
  try {
    await pc.query("begin read only");
    const rows = (await pc.query(src("docs/tmp/0201_verify.sql"))).rows as { k: string; v: string }[];
    const exp = ["", String(FN), String(TB), "10", "1", "0/0/1", "yes", "yes", "yes", "0/3", "yes/yes", "jsonb/jsonb", "yes", "yes", "yes", "yes", "yes"];
    const bad = rows.map((r, i) => (i === 0 ? null : r.v === exp[i] ? null : `${r.k}=${r.v}`)).filter(Boolean);
    check("0201(3-1) 検証 17 行（貼り先証明＋16）＝期待値どおり（Agoora の返り 2026-11-11 と同値・③④⑤は comment を除いた本文）", rows.length === 17 && bad.length === 0, bad);
    await pc.query("rollback");
  } finally { await pc.end(); }
  if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
  console.log(`verify:nox-0201 ALL PASS (${pass} assertions)`);
})();
