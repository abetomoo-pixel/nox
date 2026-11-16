/*
 * verify:nox-k201m — 0201m の画面の便（2026-11-16・端末のロック中に「名前を選んで入る」一覧＝kiosk_unlock_people）。DB 不触・env 不要＝純関数と逐語 pin。
 *   npm run verify:nox-k201m。（ACL は verify:nox-grants の G30・anon の BLOCKED は verify:nox-anon-guard・課金ゲート対象の正本は verify:nox-billing の B(ae)）
 *  k(1) フラグ MIG_0201M_APPLIED＝true・__set0201mForTest。
 *  k(2) 一覧＝フラグ true は kiosk_unlock_people（has_pin で絞らない＝関数が PIN を設定した人だけ返す）・false は従来の kiosk_staff_list。
 *  k(3) 役割の表示＝オーナー・管理者・店長・スタッフ・キャスト（2 つの一覧とも同じ関数）・空のときの文。
 *  逆テスト（手動・1 回）: unlockRoleLabelOf の cast を外す→k(3-1) 赤・戻して緑。
 */
import fs from "node:fs";
import { MIG_0201M_APPLIED, mig0201mOn, __set0201mForTest } from "../lib/nox/rules-0175/flag";
import { unlockRoleLabelOf, UNLOCK_PEOPLE_EMPTY } from "../lib/nox/rules-0175/kiosk";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: unknown) { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

check("k(1-1) MIG_0201M_APPLIED＝true・テスト用の上書き", MIG_0201M_APPLIED === true && mig0201mOn() && (() => { __set0201mForTest(false); const off = !mig0201mOn(); __set0201mForTest(null); return off && mig0201mOn(); })());
const kp = src("components/nox/kiosk-unlock-pad.tsx");
check("k(2-1) フラグ true＝kiosk_unlock_people・false＝kiosk_staff_list", kp.includes('const { data, error } = mig0201mOn() ? await supabase.rpc("kiosk_unlock_people") : await supabase.rpc("kiosk_staff_list");'));
check("k(2-2) true の枝は has_pin で絞らない・false の枝は従来どおり絞る", kp.includes("? ((data ?? []) as { membership_id: string; user_name: string; role: string }[]).map((x) => ({ membership_id: x.membership_id, name: x.user_name, role: x.role }))")
  && kp.includes(": ((data ?? []) as { membership_id: string; user_name: string; role: string; has_pin: boolean }[]).filter((x) => x.has_pin)"));
check("k(3-1) 役割の表示", unlockRoleLabelOf("owner") === "オーナー" && unlockRoleLabelOf("admin") === "管理者" && unlockRoleLabelOf("manager") === "店長" && unlockRoleLabelOf("staff") === "スタッフ" && unlockRoleLabelOf("cast") === "キャスト");
check("k(3-2) 2 つの一覧（名前を選んで入る・同じ PIN の候補）とも unlockRoleLabelOf", (kp.match(/\{unlockRoleLabelOf\(c\.role\)\}/g) ?? []).length === 2 && !kp.includes('c.role === "manager" ? "店長" : "管理者"'));
check("k(3-3) 空のときの文（フラグ true）", UNLOCK_PEOPLE_EMPTY === "名前で入れる人がいません（PIN を設定した、この端末のレジに入れる人だけが出ます）" && kp.includes("{mig0201mOn() ? UNLOCK_PEOPLE_EMPTY :"));
const mig = src("supabase/migrations/0201m_kiosk_unlock_people.sql");
check("k(3-4) 関数の返り＝membership_id・user_name・role（画面が読む列と同じ）", mig.includes("returns table(membership_id uuid, user_name text, role text)"));

if (fails.length) {
  console.error(`verify:nox-k201m FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-k201m OK (${pass} checks)`);
console.log("0201m の画面: 端末のロック中に名前を選んで入る一覧＝kiosk_unlock_people・役割 5 種・空のときの文");
