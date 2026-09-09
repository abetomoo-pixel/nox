/*
 * verify:nox-staff-shift — C層② 黒服シフト＋勤務パターン（mig0136・設計書 v1 §5・裁定 C②-1〜11）の係留。
 *   npm run verify:nox-staff-shift（事前に seed:f0 済み・env: URL/PUBLISHABLE/SECRET/SEED_PASSWORD/SUPABASE_DB_URL）
 *
 * 観点（設計書 v1 §5）:
 *  1 4 表の ACL/RLS（authenticated=SELECT のみ・anon なし・policy は select 4 本）・7 RPC の execute（authenticated 可・anon 不可）・
 *    6 ヘルパー（auth_membership_id・staff_shift_can_manage は authenticated 可〔policy から呼ぶ＝0137・教訓66〕・他 4 は 4 ロール不在）・
 *    課金ゲート（書込 6 本に段47-1 形 f の逐語行が各 1・staff_wish_set は無し＝0137・裁定233）・biz_today は biz_date_of 委譲（裁定232）
 *  2 flag off で 7 RPC すべて raise 'feature_disabled:staff_shift'（逐語一致）・on で通る
 *  3 effective_from: 同名同日 unique・過去日 raise・解決（営業日 D に有効な枠＝同名の最大 effective_from）
 *  4 凍結: 枠の新行を足しても既存 staff_shifts 行の時刻は不変
 *  5 override: manager 可（override_by 記録）・staff raise 'forbidden'・audit 1 行（action=RPC 名・reason）
 *  6 締切: 締切後の staff_wish_set raise 'deadline_passed'・deadlines 行で延長すれば通る・manager の propose/override は締切に関係なく通る
 *  7 RLS 3 ロール（owner/manager 自店全行・staff 本人行・cast 0 行・他 org 0 行）・直接 insert は permission denied
 *  8 pattern_delete: 未来行のみ・当日以前 raise・参照ありは pattern_in_use／confirm: 2 度目 already_confirmed／監査 action 6 種
 *
 * fixture: verify org A（店 A1）の 4 表＋feature_flags＋audit_logs（staff_* 6 action・flag_toggle）＝finally で全消し。
 *   ★verify org 以外の行には触れない（org_id 直書き述語）。money 非接触（golden 不変）。cast の shifts/shift_wishes は不触。
 *   ★営業日「今日」は live の staff_shift_biz_today(A1) を正とする（fixture の日付を RPC と同じ基準に置く）。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { FIXTURE_USERS, STORE_A1, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
  "SUPABASE_DB_URL",
]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
const DISABLED = "feature_disabled:staff_shift";
const RPCS = ["staff_pattern_set", "staff_pattern_delete", "staff_wish_set", "staff_shift_propose", "staff_shift_override", "staff_shift_confirm", "staff_deadline_set"];
const HELPERS_INTERNAL = ["staff_shift_biz_today", "staff_shift_gate", "staff_pattern_effective", "staff_shift_deadline_at"]; // ★0137: can_manage は policy から呼ぶ＝authenticated 可
const GATED = ["staff_pattern_set", "staff_pattern_delete", "staff_shift_propose", "staff_shift_override", "staff_shift_confirm", "staff_deadline_set"];
const GATE_LINE = "if not public.billing_writable_of(public.auth_org_id()) then raise exception 'billing locked'; end if;";
const TABLES = ["staff_shift_patterns", "staff_shift_wishes", "staff_shifts", "staff_shift_deadlines"];
const AUDIT_ACTIONS = ["staff_pattern_set", "staff_pattern_delete", "staff_shift_propose", "staff_shift_override", "staff_shift_confirm", "staff_deadline_set"];
const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function main() {
  const t0 = Date.now();
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = async (key: keyof typeof FIXTURE_USERS) => {
    const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
    if (error) { console.error(`✗ ${key} サインイン失敗（seed:f0 実行済みか）: ${error.message}`); process.exit(1); }
    return c;
  };
  const owner = await signIn("ownerA");
  const mgr = await signIn("managerA1");
  const staff = await signIn("staffA1");
  const staff2 = await signIn("staffRegOnA1");
  const cast = await signIn("castA1a");
  const mgrB = await signIn("managerB1");
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();

  const { data: sA1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
  const storeA1 = sA1!.id as string;
  const orgA = sA1!.org_id as string;
  const memOf = async (email: string) => (await db.query(
    `select m.id from public.memberships m join public.users pu on pu.id = m.user_id join auth.users u on u.id = pu.auth_user_id
      where u.email = $1 and m.is_active`, [email])).rows[0].id as string;
  const staffMid = await memOf(FIXTURE_USERS.staffA1.email);
  const mgrMid = await memOf(FIXTURE_USERS.managerA1.email);
  const today = (await db.query(`select public.staff_shift_biz_today($1)::text as d`, [storeA1])).rows[0].d as string;
  const D5 = addDays(today, 5), D12 = addDays(today, 12);

  async function teardown() {
    for (const [t, msg] of [["staff_shifts", "shifts"], ["staff_shift_wishes", "wishes"], ["staff_shift_patterns", "patterns"], ["staff_shift_deadlines", "deadlines"], ["feature_flags", "flags"]] as const) {
      const { error } = await admin.from(t).delete().eq("org_id", orgA);
      if (error) console.error(`[ss teardown] ${msg}: ${error.message}`);
    }
    const { error: ea } = await admin.from("audit_logs").delete().eq("org_id", orgA).in("action", [...AUDIT_ACTIONS, "flag_toggle"]);
    if (ea) console.error(`[ss teardown] audit: ${ea.message}`);
  }
  await teardown();

  const flag = (on: boolean) => owner.rpc("flag_set", { p_key: "staff_shift", p_store_id: storeA1, p_enabled: on, p_reason: "NOX-VERIFY-ss" });

  try {
    // ══ 1 ACL / RLS の器 ══
    {
      const { rows: t } = await db.query(
        `select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs from information_schema.role_table_grants
          where table_schema='public' and table_name = any($1) and grantee in ('anon','authenticated') group by 1,2 order by 1,2`, [TABLES]);
      check("ss(1a) ★4 表とも authenticated=SELECT のみ・anon なし",
        t.length === 4 && t.every((r) => r.grantee === "authenticated" && r.privs === "SELECT"), JSON.stringify(t));
      const { rows: pol } = await db.query(`select tablename, cmd from pg_policies where schemaname='public' and tablename = any($1) order by 1`, [TABLES]);
      check("ss(1b) policy は 4 表 × select 1 本（書込 policy なし）", pol.length === 4 && pol.every((r) => r.cmd === "SELECT"), JSON.stringify(pol));
      const { rows: rls } = await db.query(`select count(*)::int as n from pg_class where relnamespace='public'::regnamespace and relname = any($1) and relrowsecurity`, [TABLES]);
      check("ss(1c) 4 表とも RLS 有効", rls[0].n === 4, `got ${rls[0].n}`);
      const { rows: f } = await db.query(
        `select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth_ok, has_function_privilege('anon', p.oid, 'execute') as anon_ok
           from pg_proc p where p.pronamespace='public'::regnamespace and p.proname = any($1) order by p.proname`, [RPCS]);
      check("ss(1d) ★公開 RPC 7 本＝authenticated 可・anon 不可", f.length === 7 && f.every((r) => r.auth_ok === true && r.anon_ok === false), JSON.stringify(f));
      const { rows: h } = await db.query(
        `select p.proname, prosecdef, coalesce(array_to_string(proconfig, ','), '') as config,
                has_function_privilege('authenticated', p.oid, 'execute') as auth_ok, has_function_privilege('anon', p.oid, 'execute') as anon_ok,
                has_function_privilege('service_role', p.oid, 'execute') as svc_ok
           from pg_proc p where p.pronamespace='public'::regnamespace and p.proname = any($1) order by p.proname`, [[...HELPERS_INTERNAL, "auth_membership_id", "staff_shift_can_manage"]]);
      check("ss(1e) ヘルパー 6 本が存在・SECURITY DEFINER・search_path=public",
        h.length === 6 && h.every((r) => r.prosecdef === true && (r.config as string).includes("search_path=public")), JSON.stringify(h.map((r) => [r.proname, r.prosecdef, r.config])));
      const amid = h.find((r) => r.proname === "auth_membership_id");
      check("ss(1f) auth_membership_id＝authenticated 可・anon 不可", !!amid && amid.auth_ok === true && amid.anon_ok === false, JSON.stringify(amid));
      const cm = h.find((r) => r.proname === "staff_shift_can_manage");
      check("ss(1f2) ★staff_shift_can_manage＝authenticated 可・anon 不可（policy から呼ぶ＝0137・教訓66）", !!cm && cm.auth_ok === true && cm.anon_ok === false, JSON.stringify(cm));
      const internal = h.filter((r) => r.proname !== "auth_membership_id" && r.proname !== "staff_shift_can_manage");
      check("ss(1g) ★内部ヘルパー 4 本＝authenticated／anon／service_role とも不可（4 ロール明示 revoke）",
        internal.length === 4 && internal.every((r) => !r.auth_ok && !r.anon_ok && !r.svc_ok), JSON.stringify(internal.map((r) => [r.proname, r.auth_ok, r.anon_ok, r.svc_ok])));
      const { rows: gl } = await db.query(`select proname, (length(prosrc) - length(replace(prosrc, $2, ''))) / length($2) as n, prosrc like '%billing locked%' as gated from pg_proc where pronamespace='public'::regnamespace and proname = any($1) order by proname`, [RPCS, GATE_LINE]);
      check("ss(1h) ★課金ゲート逐語行＝書込 6 本に各 1・staff_wish_set は 'billing locked' なし（0137・裁定233）",
        gl.length === 7 && gl.every((r) => (GATED.includes(r.proname) ? Number(r.n) === 1 && r.gated === true : Number(r.n) === 0 && r.gated === false)), JSON.stringify(gl));
      const { rows: bt } = await db.query(`select prosrc like '%public.biz_date_of(p_store_id, now())%' as delegates from pg_proc where pronamespace='public'::regnamespace and proname='staff_shift_biz_today'`);
      check("ss(1i) staff_shift_biz_today は biz_date_of（既定 06:00）へ委譲（0137・裁定232）", bt[0]?.delegates === true, JSON.stringify(bt));
    }

    // ══ 2a flag off（行なし＝fail-closed）: 引数が揃う 4 RPC は gate で raise ══
    const bogus = "00000000-0000-0000-0000-000000000000";
    {
      const e1 = (await mgr.rpc("staff_pattern_set", { p_store_id: storeA1, p_name: "早番", p_start_hm: "18:00", p_end_hm: "23:00", p_effective_from: today, p_sort_order: 0 })).error;
      const e2 = (await mgr.rpc("staff_deadline_set", { p_store_id: storeA1, p_days_before: 3, p_deadline_hm: "21:00", p_effective_from: today })).error;
      const e3 = (await mgr.rpc("staff_shift_propose", { p_store_id: storeA1, p_staff_id: staffMid, p_biz_date: D5, p_pattern_id: bogus, p_wish_id: null })).error;
      const e4 = (await staff.rpc("staff_wish_set", { p_biz_date: D5, p_pattern_id: bogus, p_available: true, p_note: null })).error;
      check("ss(2a) ★flag off: pattern_set／deadline_set／propose／wish_set が feature_disabled:staff_shift",
        [e1, e2, e3, e4].every((e) => has(e, DISABLED)), [e1, e2, e3, e4].map((e) => e?.message ?? "通ってしまった").join(" / "));
      check("ss(2b) ★raise 文言の逐語一致（C②-10）", e1?.message === DISABLED, JSON.stringify(e1?.message));
      const { rows: n0 } = await db.query(`select count(*)::int as n from public.staff_shift_patterns where org_id = $1`, [orgA]);
      check("ss(2c) off のとき行は増えていない", n0[0].n === 0, `got ${n0[0].n}`);
    }

    // ══ ON → 器を作る（枠 2 行・確定行 1）══
    const { error: eOn } = await flag(true);
    check("ss(2d) owner が店舗行 ON（flag_set）", !eOn, eOn?.message);
    const p1 = await mgr.rpc("staff_pattern_set", { p_store_id: storeA1, p_name: "早番", p_start_hm: "18:00", p_end_hm: "23:00", p_effective_from: today, p_sort_order: 0 });
    check("ss(2e) ★on: manager の pattern_set が通る（返値 uuid）", !p1.error && typeof p1.data === "string", p1.error?.message ?? String(p1.data));
    const P1 = p1.data as string;
    const p1b = await mgr.rpc("staff_pattern_set", { p_store_id: storeA1, p_name: "早番", p_start_hm: "19:00", p_end_hm: "23:00", p_effective_from: addDays(today, 10), p_sort_order: 0 });
    check("ss(2f) 同名・未来日の枠（予約行）が通る", !p1b.error && typeof p1b.data === "string", p1b.error?.message);
    const P1b = p1b.data as string;
    const s1 = await mgr.rpc("staff_shift_propose", { p_store_id: storeA1, p_staff_id: staffMid, p_biz_date: D5, p_pattern_id: P1, p_wish_id: null });
    check("ss(2g) ★on: manager の propose が通る（希望なし・直接作成）", !s1.error && typeof s1.data === "string", s1.error?.message);
    const S1 = s1.data as string;

    // ══ 2h flag off（店舗行 OFF）: 行を要する 3 RPC も gate で raise ══
    {
      const { error: eOff } = await flag(false);
      check("ss(2h) owner が店舗行 OFF", !eOff, eOff?.message);
      const e5 = (await mgr.rpc("staff_pattern_delete", { p_pattern_id: P1b })).error;
      const e6 = (await mgr.rpc("staff_shift_override", { p_shift_id: S1, p_start_hm: "18:30", p_end_hm: "23:30", p_reason: null })).error;
      const e7 = (await mgr.rpc("staff_shift_confirm", { p_shift_id: S1 })).error;
      check("ss(2i) ★flag off: pattern_delete／override／confirm が feature_disabled:staff_shift（7 RPC すべて gate）",
        [e5, e6, e7].every((e) => has(e, DISABLED)), [e5, e6, e7].map((e) => e?.message ?? "通ってしまった").join(" / "));
      const { rows: s } = await db.query(`select start_hm, status from public.staff_shifts where id = $1`, [S1]);
      check("ss(2j) off のとき行は変わっていない（18:00・proposed）", s[0].start_hm === "18:00" && s[0].status === "proposed", JSON.stringify(s[0]));
      const { error: eOn2 } = await flag(true);
      check("ss(2k) 再 ON", !eOn2, eOn2?.message);
    }

    // ══ 3 effective_from ══
    {
      const dup = await mgr.rpc("staff_pattern_set", { p_store_id: storeA1, p_name: "早番", p_start_hm: "17:00", p_end_hm: "22:00", p_effective_from: today, p_sort_order: 0 });
      check("ss(3a) ★同名同日は unique 違反（staff_shift_patterns_uq）", has(dup.error, "staff_shift_patterns_uq") || has(dup.error, "duplicate key"), dup.error?.message ?? "通ってしまった");
      const past = await mgr.rpc("staff_pattern_set", { p_store_id: storeA1, p_name: "遅番", p_start_hm: "22:00", p_end_hm: "27:00", p_effective_from: addDays(today, -1), p_sort_order: 1 });
      check("ss(3b) ★過去日の effective_from は effective_from_past", has(past.error, "effective_from_past"), past.error?.message ?? "通ってしまった");
      const s2 = await mgr.rpc("staff_shift_propose", { p_store_id: storeA1, p_staff_id: staffMid, p_biz_date: D12, p_pattern_id: P1, p_wish_id: null });
      check("ss(3c) 未来日の propose が通る", !s2.error && typeof s2.data === "string", s2.error?.message);
      const { rows: rs } = await db.query(`select id, biz_date::text as d, start_hm, pattern_id from public.staff_shifts where org_id = $1 order by biz_date`, [orgA]);
      const r5 = rs.find((r) => r.d === D5), r12 = rs.find((r) => r.d === D12);
      check("ss(3d) ★解決＝D+5 は当日枠（18:00）・D+12 は予約行の枠（19:00・同名の最大 effective_from）",
        r5?.start_hm === "18:00" && r5?.pattern_id === P1 && r12?.start_hm === "19:00" && r12?.pattern_id === P1b, JSON.stringify(rs));
    }

    // ══ 4 凍結 ══
    let P1c = "";
    {
      const p1c = await mgr.rpc("staff_pattern_set", { p_store_id: storeA1, p_name: "早番", p_start_hm: "20:00", p_end_hm: "23:00", p_effective_from: addDays(today, 1), p_sort_order: 0 });
      check("ss(4a) 枠の新行（明日から 20:00）を追加", !p1c.error, p1c.error?.message);
      P1c = p1c.data as string;
      const { rows: s } = await db.query(`select start_hm, end_hm from public.staff_shifts where id = $1`, [S1]);
      check("ss(4b) ★枠変更後も既存行の時刻は不変（18:00〜23:00＝作成時に写した凍結値）", s[0].start_hm === "18:00" && s[0].end_hm === "23:00", JSON.stringify(s[0]));
    }

    // ══ 5 override ══
    {
      const ov = await mgr.rpc("staff_shift_override", { p_shift_id: S1, p_start_hm: "18:30", p_end_hm: "23:30", p_reason: "NOX-VERIFY-ss reason" });
      check("ss(5a) ★manager の override が通る", !ov.error, ov.error?.message);
      const { rows: s } = await db.query(`select start_hm, end_hm, override_by, override_at is not null as at_ok from public.staff_shifts where id = $1`, [S1]);
      check("ss(5b) 行の時刻と override_by（manager の membership）・override_at が記録される",
        s[0].start_hm === "18:30" && s[0].end_hm === "23:30" && s[0].override_by === mgrMid && s[0].at_ok === true, JSON.stringify(s[0]));
      const ovS = await staff.rpc("staff_shift_override", { p_shift_id: S1, p_start_hm: "19:00", p_end_hm: "23:00", p_reason: null });
      check("ss(5c) ★staff の override は forbidden", has(ovS.error, "forbidden"), ovS.error?.message ?? "通ってしまった");
      const { rows: a } = await db.query(
        `select reason, before_json->>'start_hm' as b, after_json->>'start_hm' as a from public.audit_logs where org_id = $1 and action = 'staff_shift_override' and target = $2`, [orgA, `staff_shifts:${S1}`]);
      check("ss(5d) ★audit 1 行（action=RPC 名・before 18:00→after 18:30・reason）", a.length === 1 && a[0].b === "18:00" && a[0].a === "18:30" && a[0].reason === "NOX-VERIFY-ss reason", JSON.stringify(a));
    }

    // ══ 6 締切 ══
    let W5 = "";
    {
      const w = await staff.rpc("staff_wish_set", { p_biz_date: D5, p_pattern_id: P1, p_available: true, p_note: "11時まで" });
      check("ss(6a) ★staff 本人の wish_set（D+5・既定締切 3 日前 21:00 の前）が通る", !w.error && typeof w.data === "string", w.error?.message);
      W5 = w.data as string;
      const wT = await staff.rpc("staff_wish_set", { p_biz_date: today, p_pattern_id: P1, p_available: true, p_note: null });
      check("ss(6b) ★当日の wish_set は deadline_passed（既定＝3 日前 21:00）", has(wT.error, "deadline_passed"), wT.error?.message ?? "通ってしまった");
      const dl = await mgr.rpc("staff_deadline_set", { p_store_id: storeA1, p_days_before: 0, p_deadline_hm: "23:59", p_effective_from: today });
      check("ss(6c) manager の deadline_set（当日 23:59・今日から）が通る", !dl.error && typeof dl.data === "string", dl.error?.message);
      const wT2 = await staff.rpc("staff_wish_set", { p_biz_date: today, p_pattern_id: P1, p_available: false, p_note: null });
      check("ss(6d) ★deadlines 行（当日 23:59）で当日の wish_set が通る（effective_from 型の解決）", !wT2.error, wT2.error?.message);
      const wC = await cast.rpc("staff_wish_set", { p_biz_date: D5, p_pattern_id: P1, p_available: true, p_note: null });
      check("ss(6e) cast の wish_set は forbidden", has(wC.error, "forbidden"), wC.error?.message ?? "通ってしまった");
      const sT = await mgr.rpc("staff_shift_propose", { p_store_id: storeA1, p_staff_id: staffMid, p_biz_date: today, p_pattern_id: P1, p_wish_id: null });
      check("ss(6f) ★manager の propose は締切に関係なく通る（締切は黒服の希望入力にのみ効く）", !sT.error, sT.error?.message);
      const wm = await mgr.rpc("staff_shift_propose", { p_store_id: storeA1, p_staff_id: staffMid, p_biz_date: D12, p_pattern_id: P1, p_wish_id: W5 });
      check("ss(6g) wish_id と (staff, biz_date) が食い違えば wish_mismatch", has(wm.error, "wish_mismatch"), wm.error?.message ?? "通ってしまった");
    }

    // ══ 7 RLS 3 ロール ══
    {
      const cnt = async (c: typeof owner, t: string) => (await c.from(t).select("id")).data?.length ?? -1;
      const pat = await Promise.all([owner, mgr, staff, cast, mgrB].map((c) => cnt(c, "staff_shift_patterns")));
      check("ss(7a) ★patterns: owner/manager/staff は自店 3 行・cast 0・他 org manager 0", pat[0] === 3 && pat[1] === 3 && pat[2] === 3 && pat[3] === 0 && pat[4] === 0, JSON.stringify(pat));
      const wi = await Promise.all([mgr, staff, staff2, cast].map((c) => cnt(c, "staff_shift_wishes")));
      check("ss(7b) ★wishes: manager 2 行・本人 2 行・別 staff 0・cast 0", wi[0] === 2 && wi[1] === 2 && wi[2] === 0 && wi[3] === 0, JSON.stringify(wi));
      const sh = await Promise.all([owner, staff, staff2, cast, mgrB].map((c) => cnt(c, "staff_shifts")));
      check("ss(7c) ★shifts: owner 3 行・本人 3 行・別 staff 0・cast 0・他 org 0", sh[0] === 3 && sh[1] === 3 && sh[2] === 0 && sh[3] === 0 && sh[4] === 0, JSON.stringify(sh));
      const dl = await Promise.all([staff, cast].map((c) => cnt(c, "staff_shift_deadlines")));
      check("ss(7d) deadlines: staff 1 行・cast 0", dl[0] === 1 && dl[1] === 0, JSON.stringify(dl));
      const { error: eIns } = await owner.from("staff_shift_patterns").insert({ org_id: orgA, store_id: storeA1, name: "直書き", start_hm: "18:00", end_hm: "23:00", effective_from: today });
      check("ss(7e) ★owner の直接 insert は permission denied（書込は RPC のみ）", has(eIns, "permission denied"), eIns?.message ?? "insert できてしまった");
      const pS = await staff.rpc("staff_shift_propose", { p_store_id: storeA1, p_staff_id: staffMid, p_biz_date: D12, p_pattern_id: P1, p_wish_id: null });
      check("ss(7f) staff の propose は forbidden", has(pS.error, "forbidden"), pS.error?.message ?? "通ってしまった");
      const pB = await mgrB.rpc("staff_shift_propose", { p_store_id: storeA1, p_staff_id: staffMid, p_biz_date: D12, p_pattern_id: P1, p_wish_id: null });
      check("ss(7g) ★他 org の manager は他店へ propose 不可（flag 読取が fail-closed＝feature_disabled で止まる）", has(pB.error, DISABLED) || has(pB.error, "forbidden"), pB.error?.message ?? "通ってしまった");
    }

    // ══ 8 confirm / pattern_delete / 監査 ══
    {
      const c1 = await mgr.rpc("staff_shift_confirm", { p_shift_id: S1 });
      const { rows: s } = await db.query(`select status, confirmed_by, confirmed_at is not null as at_ok from public.staff_shifts where id = $1`, [S1]);
      check("ss(8a) ★manager の confirm＝confirmed・confirmed_by・confirmed_at", !c1.error && s[0].status === "confirmed" && s[0].confirmed_by === mgrMid && s[0].at_ok === true, c1.error?.message ?? JSON.stringify(s[0]));
      const c2 = await mgr.rpc("staff_shift_confirm", { p_shift_id: S1 });
      check("ss(8b) 2 度目の confirm は already_confirmed", has(c2.error, "already_confirmed"), c2.error?.message ?? "通ってしまった");
      const c3 = await staff.rpc("staff_shift_confirm", { p_shift_id: S1 });
      check("ss(8c) staff の confirm は forbidden", has(c3.error, "forbidden"), c3.error?.message ?? "通ってしまった");
      const ov2 = await mgr.rpc("staff_shift_override", { p_shift_id: S1, p_start_hm: "19:00", p_end_hm: "23:30", p_reason: null });
      check("ss(8d) confirmed 後も manager の override は通る（C②-1・status は戻さない）", !ov2.error, ov2.error?.message);
      // ★P1c は (6a) の wish が参照する（D+5 に有効な枠＝同名の最大 effective_from）＝未参照の未来行を別名で作って消す
      const p1d = await mgr.rpc("staff_pattern_set", { p_store_id: storeA1, p_name: "遅番", p_start_hm: "22:00", p_end_hm: "27:00", p_effective_from: addDays(today, 3), p_sort_order: 1 });
      const d1 = p1d.error ? p1d : await mgr.rpc("staff_pattern_delete", { p_pattern_id: p1d.data as string });
      check("ss(8e) ★未来行・参照なしの pattern_delete が通る（30 時間制 27:00 の枠も可）", !d1.error, d1.error?.message);
      void P1c;
      const d2 = await mgr.rpc("staff_pattern_delete", { p_pattern_id: P1 });
      check("ss(8f) 当日以前の行は effective_from_not_future", has(d2.error, "effective_from_not_future"), d2.error?.message ?? "通ってしまった");
      const d3 = await mgr.rpc("staff_pattern_delete", { p_pattern_id: P1b });
      check("ss(8g) 参照のある未来行は pattern_in_use", has(d3.error, "pattern_in_use"), d3.error?.message ?? "通ってしまった");
      const { rows: acts } = await db.query(`select action, count(*)::int as n from public.audit_logs where org_id = $1 and action = any($2) group by 1 order by 1`, [orgA, AUDIT_ACTIONS]);
      const names = acts.map((r) => r.action as string);
      check("ss(8h) ★監査 action 6 種がすべて RPC 名で記録される（C②-11）", AUDIT_ACTIONS.every((a) => names.includes(a)), JSON.stringify(acts));
    }
  } finally {
    await teardown();
  }
  await db.end();

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-staff-shift ALL PASS (${pass} assertions・${Math.round((Date.now() - t0) / 1000)}s)`);
  console.log("黒服シフト(0136): ACL/RLS 4表・7 RPC・6 helper / flag off 7 RPC raise 逐語 / effective_from unique・過去日・解決 / 凍結 / override 監査 / 締切 / 3ロール RLS / confirm・delete・監査 6 action");
}

main().catch((e) => { console.error("✗ 異常終了", e); process.exit(1); });
