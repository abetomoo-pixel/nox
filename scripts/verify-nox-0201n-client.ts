/*
 * verify:nox-0201n-client — 0201n の画面の便（2026-11-18 相談役 C・フラグ MIG_0201N_APPLIED＝false のまま・手貼りの後に true にする便で張り替え）。DB 不触・env 不要。
 *  nc(1) フラグ＝false・override で切り替えられる。
 *  nc(2) レジ（register/page.tsx）：キャストの立場かつフラグ true のときだけ register_cast_roster（自店＝auth_store_id）・有効な人だけ・4 列。ほかは従来どおり casts。
 *  nc(3) 日報（report-board.tsx）：キャストの立場（isCast）かつフラグ true のときだけ register_cast_roster の 3 列。ほかは従来どおり casts。
 *  nc(4) 月の日報（month-report.tsx）は店長以上だけが casts を読む＝変えない。
 */
import fs from "node:fs";
import { MIG_0201N_APPLIED, mig0201nOn, __set0201nForTest } from "../lib/nox/rules-0175/flag";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
check("nc(1) MIG_0201N_APPLIED＝false（手貼り前）・override で true／false", MIG_0201N_APPLIED === false && !mig0201nOn() && (__set0201nForTest(true), mig0201nOn()) && (__set0201nForTest(false), !mig0201nOn()));
__set0201nForTest(null);
const rg = fs.readFileSync("app/(manage)/register/page.tsx", "utf8");
check("nc(2) レジ：role cast かつフラグ true＝register_cast_roster（auth_store_id）・is_active で絞る・従来の casts の読取は残す", rg.includes('role === "cast" && mig0201nOn()') && rg.includes('supabase.rpc("register_cast_roster", { p_store_id: sid as string })') && rg.includes(".filter((c) => c.is_active)") && rg.includes('.select("id, name, photo_updated_at, rank_id")'));
const rb = fs.readFileSync("app/(manage)/report/report-board.tsx", "utf8");
check("nc(3) 日報：isCast かつフラグ true＝register_cast_roster（storeId）・従来の casts の読取は残す", rb.includes("isCast && mig0201nOn()") && rb.includes('supabase.rpc("register_cast_roster", { p_store_id: storeId })') && rb.includes('supabase.from("casts").select("id, name, is_active").eq("store_id", storeId).order("name")'));
const mr = fs.readFileSync("app/(manage)/report/month-report.tsx", "utf8");
check("nc(4) 月の日報は店長以上だけ（isManagerUp の中で casts）＝変えない", mr.includes("if (isManagerUp) {") && !mr.includes("register_cast_roster"));
if (fails.length) { console.error(`✗ verify:nox-0201n-client 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-0201n-client OK (${pass} checks)`);
