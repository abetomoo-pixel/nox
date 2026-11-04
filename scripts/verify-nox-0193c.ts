/*
 * verify:nox-0193c — 0193（下書き・未手貼り＝ブランチ draft/0193-client）の client を MIG_0193_APPLIED 配下で先に入れた分。
 *  (1) フラグ false・override で true／(2) 役割の表示＝0193 後は owner「管理者」・admin「管理者（請求なし）」・肩書があれば肩書（内部の値は不変）／(3) スタッフ詳細の 3 節（肩書・役割の変更＝管理者だけ・個人情報＝表示を押したときだけ読む）
 *  使い方: npm run verify:nox-0193c（env 不要・DB 不触）
 */
import fs from "node:fs";
import { MIG_0193_APPLIED, mig0193On, __set0193ForTest } from "../lib/nox/rules-0175/flag";
import { roleChangeTargetsOf, roleLabelOf } from "../lib/nox/rules-0175/roles";
import { roleLabelJa } from "../lib/nox/ui/theme";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
check("0193c(1-1) MIG_0193_APPLIED=false（手貼り前）", MIG_0193_APPLIED === false && mig0193On() === false);
const before = [roleLabelOf("owner"), roleLabelJa("owner")];
__set0193ForTest(true); const after = [roleLabelOf("owner"), roleLabelJa("owner"), roleLabelOf("admin"), roleLabelOf("manager", "主任"), roleLabelOf("staff", " ")]; __set0193ForTest(null);
check("0193c(2-1) フラグ false＝従来の「オーナー」・true＝「管理者」・admin＝「管理者（請求なし）」・肩書があれば肩書（空白は権限名）", before.join() === "オーナー,オーナー" && after.join() === "管理者,管理者,管理者（請求なし）,主任,スタッフ", { before, after });
const c = fs.readFileSync("components/nox/staff-0193.tsx", "utf8"), sb = fs.readFileSync("app/(manage)/staff/staff-board.tsx", "utf8");
check("0193c(3-1) スタッフ詳細＝mig0193On() の配下に Staff0193（肩書 set_membership_title・役割 set_membership_role＝管理者だけ・個人情報 get／set_staff_sensitive は押したときだけ）", sb.includes("{mig0193On() && <Staff0193 ") && c.includes('rpc("set_membership_title"') && c.includes('isOwner && roleRaw === "owner"') && c.includes('rpc("get_staff_sensitive"') && c.includes('rpc("set_staff_sensitive"') && c.includes("表示する"));
// ★相談役 11/03 §0-2 ③: 招待・役割変更・肩書の画面で admin を選択肢に出さない（0193 の後）
const tgFalse = [roleChangeTargetsOf("owner", "staff"), roleChangeTargetsOf("owner", "manager")].flat();
__set0193ForTest(true); const tgTrue = [roleChangeTargetsOf("owner", "staff"), roleChangeTargetsOf("owner", "manager"), roleChangeTargetsOf("admin", "staff")].flat(); const tgAdmin = roleChangeTargetsOf("owner", "admin"); __set0193ForTest(null);
check("0193c(4-1) 役割変更の候補＝フラグ false は従来（admin あり）・true は admin を出さない（既存の admin の解除は残す）", tgFalse.includes("admin") && !tgTrue.includes("admin") && tgAdmin.join() === "manager,staff", { tgFalse, tgTrue, tgAdmin });
const inv = fs.readFileSync("app/api/staff/invite/route.ts", "utf8"), cre = fs.readFileSync("app/api/staff/create/route.ts", "utf8");
check("0193c(4-2) 招待・登録の役割は staff／manager だけ（admin を送らない）・肩書は自由記述（役割の選択肢なし）", inv.includes('body.role === "manager" ? "manager" : "staff"') && /options=\{\[\["staff", [^\]]+\], \["manager", [^\]]+\]\] as const\}/.test(sb) && !/p_new_role: "admin"/.test(c) && !cre.includes('"admin"'));
if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-0193c ALL PASS (${pass} assertions)`);
