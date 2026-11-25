// verify:nox-staff-self（★起票161・相談役 11/25 の便 F3）— スタッフ本人が /staff/me で自分の勤怠を見る道
//   起票161＝スタッフ本人のセッションで staff_punches を直に select すると 0 行（memberships の RLS が本人の行を返さない＝staff_punches の本人の枝が効かない）。
//   画面の道＝/staff/me はスタッフと店長を staff_my_work（SECURITY DEFINER・本人の分だけ）に回す＝直の select を使わない。オーナーだけ従来の部品（オーナーは RLS で全店を読める）。
//   (1) 配線＝/staff/me の分岐・StaffMyWork は staff_my_work だけを読む（staff_punches を直に読まない）
//   (2) DB（本番・1 トランザクション・ROLLBACK＝恒久変更 0）＝検証のスタッフ A1 に打刻 2 行を足し、本人の staff_my_work が 2 行を返す・直の select は 0（RLS の今の形の記録）・他店の店長と他のスタッフには出ない・anon は BLOCKED
import fs from "node:fs";
import pg from "pg";
import { pgTx } from "./fixtures-pgtx";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else { fails.push(label); console.error(`NG ${label} ${detail === undefined ? "" : JSON.stringify(detail).slice(0, 400)}`); } };
const src = (p: string) => fs.readFileSync(p, "utf8");

// ── (1) 配線 ──
const me = src("app/(manage)/staff/me/page.tsx"), mw = src("app/(manage)/staff/me/staff-my-work.tsx");
check("(1-1) /staff/me＝スタッフと店長は StaffMyWork（staff_my_work）・オーナーだけ従来の部品", me.includes('{mig0201eOn() && (role === "staff" || role === "manager")') && me.includes("? <StaffMyWork ") && me.includes(': <StaffWorkPanel scope="me"'));
check("(1-2) StaffMyWork は staff_my_work だけを読む（staff_punches・staff_attendance_days を直に読まない）", mw.includes("await supabase.rpc(STAFF_MY_WORK_RPC, { p_from: from, p_to: to })") && !mw.includes('from("staff_punches")') && !mw.includes('from("staff_attendance_days")') && !mw.includes('from("memberships")'));

// ── (2) DB ──
async function db2() {
  const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
  const db = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, application_name: "nox-verify-staff-self" });
  await db.connect();
  const tx = pgTx(db);
  try {
    await db.query("begin");
    const who = async (email: string) => tx.one<{ auth_user_id: string; mid: string; store_id: string; org_id: string }>("select u.auth_user_id, m.id mid, m.store_id, s.org_id from users u join memberships m on m.user_id = u.id and m.is_active join stores s on s.id = m.store_id where u.email = $1", [email]);
    const st = await who("nox-verify-staff-a1@example.com"), st2 = await who("nox-verify-staff-regon-a1@example.com"), mB = await who("nox-verify-manager-b1@example.com"), mA = await who("nox-verify-manager-a1@example.com");
    const D = "2026-01-15";   // 検証用の過去の日（今月の締めや当日の集計に触れない）
    await tx.q("insert into staff_punches (membership_id, org_id, store_id, biz_date, kind, punched_at, source) values ($1, $2, $3, $4, 'in', $5, 'kiosk'), ($1, $2, $3, $4, 'out', $6, 'kiosk')",
      [st.mid, st.org_id, st.store_id, D, "2026-01-15T11:00:00Z", "2026-01-15T15:00:00Z"]);
    const self = await tx.as(st, "select public.staff_my_work($1::date, $2::date) j", ["2026-01-01", "2026-01-31"]);
    const selfN = self.ok ? ((self.rows[0].j as { punches?: unknown[] })?.punches ?? []).length : -1;
    const direct = await tx.as(st, "select count(*)::int n from staff_punches where membership_id = $1", [st.mid]);
    check("(2-1) 本人の staff_my_work は自分の打刻 2 行を返す（画面の道）", self.ok && selfN === 2, [tx.errOf(self), selfN]);
    check("(2-2) 起票161 の記録＝本人のセッションで staff_punches を直に select すると 0 行（今の RLS の形・画面はこの道を使わない）", direct.ok && Number(direct.rows[0].n) === 0, direct.ok ? direct.rows : direct.err);
    const other = await tx.as(st2, "select public.staff_my_work($1::date, $2::date) j", ["2026-01-01", "2026-01-31"]);
    const otherN = other.ok ? ((other.rows[0].j as { punches?: unknown[] })?.punches ?? []).length : -1;
    const bMgr = await tx.as(mB, "select count(*)::int n from staff_punches where membership_id = $1", [st.mid]);
    const aMgr = await tx.as(mA, "select count(*)::int n from staff_punches where membership_id = $1", [st.mid]);
    const an = await tx.as("anon", "select public.staff_my_work($1::date, $2::date) j", ["2026-01-01", "2026-01-31"]);
    check("(2-3) 同じ店の別のスタッフの staff_my_work には出ない・他社の店長は 0 行・自店の店長は 2 行・anon は BLOCKED", other.ok && otherN === 0 && bMgr.ok && Number(bMgr.rows[0].n) === 0 && aMgr.ok && Number(aMgr.rows[0].n) === 2 && !an.ok && /permission denied for function/.test(an.err),
      [tx.errOf(other), otherN, bMgr.ok ? bMgr.rows : bMgr.err, aMgr.ok ? aMgr.rows : aMgr.err, tx.errOf(an)]);
  } finally {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  }
}
(async () => {
  await db2();
  if (fails.length) { console.error(`verify:nox-staff-self FAIL ${fails.length}（OK ${pass}）`); process.exit(1); }
  console.log(`verify:nox-staff-self OK (${pass} checks)`);
})().catch((e) => { console.error(e); process.exit(1); });
