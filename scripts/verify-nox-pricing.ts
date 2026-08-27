/**
 * verify:nox-pricing — mig0083（料金ルール一般化・基盤）の runtime 実証（段43）
 *   実行: npm run verify:nox-pricing（env: .env.local）
 *
 * ★prosrc 緑 ≠ runtime 緑：pricing_resolve の肝は「営業日拡張の非対称（from < cutoff /
 *   to <= cutoff）」と「priority → created_at → id の decision 順」で、これは
 *   固定タイムスタンプを実セッションで流して初めて言える（金曜25時が金曜に当たる等）。
 *   grants の A4（TRUNCATE 穴）も authenticated 実セッションの直書きが落ちることで実証する。
 *
 * 段構成（設計書 v1.2 §8 のマトリクス）:
 *   (1) 全ワイルドカード行＝常に当たる・他 fee_kind に漏れない
 *   (2) 席種軸（'カウンター' 限定行・null 席種は '卓' 扱い）
 *   (3) 曜日軸＝★営業日基準（金曜25時=金曜・dow_mask=48〔金土〕・cutoff 既定 06:00）
 *   (4) 時間帯軸＝3帯の端点（20:59 / 21:00 / 翌5:59 / 翌6:00）
 *   (5) priority（小が勝つ・同 priority は created_at 順）
 *   (6) ランク軸（rank 行は該当 rank のみ・null 行は全 rank）
 *   (7) 0行フォールバック（ルール無し店）
 *   (8) is_active=false は解決から除外
 *   (9) set_pricing_rule（insert/update・bad 系トークン全種・audit）
 *   (10) delete_pricing_rule（削除・not found・audit）
 *   (11) pricing_rule_reorder（(store, fee_kind) スコープ両方向・partial/duplicate）
 *   (12) cast_ranks 系（duplicate name lower・末尾採番・reorder・set_cast_rank_of）
 *   (13) 認可（manager 自店/他店・staff/cast・org 跨ぎ・resolve の cast 拒否）
 *   (14) RLS＝cast/staff の select 0行（★料率は経営情報・polqual 逐語は G37）
 *   (15) authenticated 直書き遮断（INSERT/UPDATE/DELETE・biz_minutes_of 直呼び）
 *        ※TRUNCATE は PostgREST から発行不可＝G37 の has_table_privilege で恒久 assert
 *   (16) anon BLOCKED 一式（RPC 8本＋テーブル2）
 *   (17) ★mig0104（裁定77）＝停止中ランクの新規参照拒否（'inactive rank'）と据え置き
 *        （set_cast_rank_of / set_pricing_rule とも「現在値と同じ rank_id の再送」は通る）
 *   (18) ★mig0106（裁定82・起票#14）＝set_store_biz_cutoff（営業日切替時刻の書込 RPC）
 *        正常系＋audit／bad cutoff 5種／owner 限定（manager・staff・他 org）／帯ガード。
 *        ★settings_json は段内で snapshot→finally 逐語復元（rls :1928/:1956 の '06:00' 固定を壊さない）
 *
 * fixture は段内動的生成→finally 全消し（pricing_rules/cast_ranks は verify 店スコープで
 * 全削除・casts.rank_id は null 復元・audit は本スイートの action 6種のみ削除）。
 * ★時刻依存を排除＝resolve は全て固定 p_at（2026-01-09 金 / 01-10 土 / 01-11 日・JST）。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { FIXTURE_USERS, STORE_A1, STORE_A2, STORE_B1, loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SEED_PASSWORD",
]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const has = (e: { message?: string } | null, s: string) => !!e?.message?.includes(s);
const isFnBlocked = (e: { message?: string } | null) =>
  !!e?.message && /permission denied for function/i.test(e.message);

const AUDIT_ACTIONS = [
  "set_pricing_rule", "delete_pricing_rule", "pricing_rule_reorder",
  "set_cast_rank", "cast_rank_reorder", "set_cast_rank_of",
  "set_store_biz_cutoff",  // ★mig0106（段(18)）
];

// 固定タイムスタンプ（JST）。2026-01-09=金・01-10=土・01-11=日（実カレンダー確認済み）。
const FRI_2000 = "2026-01-09T20:00:00+09:00";  // 金曜 20:00（営業日=金）
const FRI_2059 = "2026-01-09T20:59:00+09:00";
const FRI_2100 = "2026-01-09T21:00:00+09:00";
const FRI_2500 = "2026-01-10T01:00:00+09:00";  // ★金曜25時（時計は土曜 01:00・営業日=金）
const SAT_0559 = "2026-01-10T05:59:00+09:00";  // 金曜の営業日末尾
const SAT_0600 = "2026-01-10T06:00:00+09:00";  // cutoff ちょうど＝営業日 土曜の先頭
const SUN_2000 = "2026-01-11T20:00:00+09:00";  // 日曜 20:00（営業日=日）
const DOW_FRI_SAT = 48; // bit4(金)|bit5(土) = 16+32

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = async (key: keyof typeof FIXTURE_USERS): Promise<SupabaseClient> => {
    const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await c.auth.signInWithPassword({
      email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD,
    });
    if (error) { console.error(`✗ ${key} サインイン失敗: ${error.message}`); process.exit(1); }
    return c;
  };

  const { data: sA1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A1).single();
  const { data: sA2 } = await admin.from("stores").select("id, org_id").eq("name", STORE_A2).single();
  const { data: sB1 } = await admin.from("stores").select("id, org_id").eq("name", STORE_B1).single();
  if (!sA1 || !sA2 || !sB1) { console.error("✗ fixture 店が見つからない（seed:f0 実行済みか）"); process.exit(1); }
  const stores = [sA1.id, sA2.id, sB1.id] as string[];

  const wipe = async () => {
    await admin.from("casts").update({ rank_id: null }).in("store_id", stores).not("rank_id", "is", null);
    await admin.from("pricing_rules").delete().in("store_id", stores);
    await admin.from("cast_ranks").delete().in("store_id", stores);
    await admin.from("audit_logs").delete().in("action", AUDIT_ACTIONS);
  };
  await wipe();

  const owner = await signIn("ownerA");
  const mgr = await signIn("managerA1");
  const stf = await signIn("staffA1");
  const cst = await signIn("castA1a");
  check("段43（準備）店 A1/A2/B1・owner/manager/staff/cast セッション解決", true);

  // fixture ルールは admin 直 insert（id/created_at を握る）。CRUD 正常系は (9)(10) で RPC 経路。
  type RuleIns = {
    fee_kind: string; seat_kind?: string | null; dow_mask?: number | null;
    time_from_min?: number | null; time_to_min?: number | null; rank_id?: string | null;
    amount: number; duration_min?: number | null; priority: number; is_active?: boolean;
    created_at?: string; store?: string;
  };
  const mkRule = async (r: RuleIns): Promise<string> => {
    const { data, error } = await admin.from("pricing_rules").insert({
      org_id: sA1.org_id, store_id: r.store ?? sA1.id, fee_kind: r.fee_kind,
      seat_kind: r.seat_kind ?? null, dow_mask: r.dow_mask ?? null,
      time_from_min: r.time_from_min ?? null, time_to_min: r.time_to_min ?? null,
      rank_id: r.rank_id ?? null, amount: r.amount, duration_min: r.duration_min ?? null,
      priority: r.priority, is_active: r.is_active ?? true,
      ...(r.created_at ? { created_at: r.created_at } : {}),
    }).select("id").single();
    if (error) { console.error("fixture rule insert 失敗:", error.message); process.exit(1); }
    return data!.id as string;
  };
  const resolve = async (c: SupabaseClient, feeKind: string, at: string, opts?: {
    store?: string; seat?: string | null; rank?: string | null;
  }) => c.rpc("pricing_resolve", {
    p_store_id: opts?.store ?? sA1.id, p_at: at, p_fee_kind: feeKind,
    p_seat_kind: opts?.seat ?? null, p_rank_id: opts?.rank ?? null,
  });
  const amountOf = (data: unknown): number | null =>
    Array.isArray(data) && data.length ? (data[0] as { amount: number }).amount : null;

  try {
    // ═══ (1) 全ワイルドカード ═══
    const ruleW = await mkRule({ fee_kind: "set", amount: 5000, priority: 100 });
    {
      const { data, error } = await resolve(owner, "set", SUN_2000);
      check("段43(1) 全ワイルドカード行は常に当たる", !error && amountOf(data) === 5000,
        error?.message ?? `got ${amountOf(data)}`);
      const { data: d2 } = await resolve(owner, "dohan", SUN_2000);
      check("段43(1) 該当 fee_kind 以外には漏れない（dohan は 0行）",
        Array.isArray(d2) && d2.length === 0, `got ${JSON.stringify(d2)}`);
    }

    // ═══ (2) 席種軸 ═══
    await mkRule({ fee_kind: "set", seat_kind: "カウンター", amount: 6000, priority: 10 });
    {
      const { data: dc } = await resolve(owner, "set", SUN_2000, { seat: "カウンター" });
      check("段43(2) 'カウンター' 行は seat='カウンター' に当たる（priority 10 が勝つ）",
        amountOf(dc) === 6000, `got ${amountOf(dc)}`);
      const { data: dt } = await resolve(owner, "set", SUN_2000, { seat: "卓" });
      check("段43(2) seat='卓' には席種限定行が当たらない（ワイルドカードへ）",
        amountOf(dt) === 5000, `got ${amountOf(dt)}`);
      const { data: dn } = await resolve(owner, "set", SUN_2000, { seat: null });
      check("段43(2) ★席種 null は '卓' 扱い（coalesce）", amountOf(dn) === 5000, `got ${amountOf(dn)}`);
    }

    // ═══ (3) 曜日軸＝営業日基準 ═══
    await mkRule({ fee_kind: "set", dow_mask: DOW_FRI_SAT, amount: 7000, priority: 5 });
    {
      const { data: df } = await resolve(owner, "set", FRI_2500);
      check("段43(3) ★金曜25時（時計は土曜01:00）が営業日=金曜として dow_mask=48 に当たる",
        amountOf(df) === 7000, `got ${amountOf(df)}`);
      const { data: ds } = await resolve(owner, "set", SUN_2000);
      check("段43(3) 日曜はマスク外＝ワイルドカードへ落ちる", amountOf(ds) === 5000, `got ${amountOf(ds)}`);
      const { data: dF } = await resolve(owner, "set", FRI_2000);
      check("段43(3) 金曜 20:00（通常時刻）も当たる", amountOf(dF) === 7000, `got ${amountOf(dF)}`);
    }

    // ═══ (4) 時間帯軸＝3帯の端点 ═══
    const band1 = await mkRule({ fee_kind: "extension", time_from_min: 1080, time_to_min: 1260, amount: 1000, duration_min: 30, priority: 1 });
    const band2 = await mkRule({ fee_kind: "extension", time_from_min: 1260, time_to_min: 0, amount: 2000, duration_min: 30, priority: 2 });
    const band3 = await mkRule({ fee_kind: "extension", time_from_min: 0, time_to_min: 360, amount: 3000, duration_min: 30, priority: 3 });
    {
      const { data: d1 } = await resolve(owner, "extension", FRI_2059);
      check("段43(4) 20:59 は 18:00-21:00 帯", amountOf(d1) === 1000, `got ${amountOf(d1)}`);
      check("段43(4) duration_min が返る（set/extension のみの列）",
        Array.isArray(d1) && (d1[0] as { duration_min: number }).duration_min === 30, JSON.stringify(d1));
      const { data: d2 } = await resolve(owner, "extension", FRI_2100);
      check("段43(4) ★21:00 ちょうどは次帯（半開区間 [from, to)）", amountOf(d2) === 2000, `got ${amountOf(d2)}`);
      const { data: d3 } = await resolve(owner, "extension", SAT_0559);
      check("段43(4) ★翌5:59 は 0:00-6:00 帯（営業日拡張 +1440 が効く）", amountOf(d3) === 3000, `got ${amountOf(d3)}`);
      const { data: d4 } = await resolve(owner, "extension", SAT_0600);
      check("段43(4) ★翌6:00（cutoff ちょうど）は全帯から抜ける＝0行", Array.isArray(d4) && d4.length === 0,
        `got ${JSON.stringify(d4)}`);
    }

    // ═══ (5) priority ═══
    await mkRule({ fee_kind: "dohan", amount: 100, priority: 5 });
    await mkRule({ fee_kind: "dohan", amount: 200, priority: 10 });
    await mkRule({ fee_kind: "hon_shimei", amount: 300, priority: 1, created_at: "2026-01-01T00:00:00+09:00" });
    await mkRule({ fee_kind: "hon_shimei", amount: 400, priority: 1, created_at: "2026-01-02T00:00:00+09:00" });
    {
      const { data: dp } = await resolve(owner, "dohan", SUN_2000);
      check("段43(5) priority が小さい行が勝つ（5 < 10）", amountOf(dp) === 100, `got ${amountOf(dp)}`);
      const { data: dc } = await resolve(owner, "hon_shimei", SUN_2000);
      check("段43(5) ★同 priority は created_at 昇順（先に作られた行）", amountOf(dc) === 300, `got ${amountOf(dc)}`);
    }

    // ═══ (12) 前半: cast_ranks 正常系（(6) の材料をここで正規経路生成）═══
    let rankR1 = "", rankR2 = "", rankA2 = "";
    {
      const { data: r1, error: e1 } = await owner.rpc("set_cast_rank", {
        p_id: null, p_store_id: sA1.id, p_name: "NOX-VERIFY-R1", p_is_active: true,
      });
      const { data: r2, error: e2 } = await owner.rpc("set_cast_rank", {
        p_id: null, p_store_id: sA1.id, p_name: "NOX-VERIFY-R2", p_is_active: true,
      });
      rankR1 = r1 as string; rankR2 = r2 as string;
      check("段43(12) set_cast_rank 新規×2 成功", !e1 && !e2 && !!rankR1 && !!rankR2, e1?.message ?? e2?.message);
      const { data: rows } = await admin.from("cast_ranks").select("id, sort_order").in("id", [rankR1, rankR2]);
      const so = new Map((rows ?? []).map((r) => [r.id as string, r.sort_order as number]));
      check("段43(12) ★末尾採番（R1=1, R2=2）", so.get(rankR1) === 1 && so.get(rankR2) === 2,
        JSON.stringify([...so]));
      const { error: eDup } = await owner.rpc("set_cast_rank", {
        p_id: null, p_store_id: sA1.id, p_name: "nox-verify-r1", p_is_active: true,
      });
      check("段43(12) ★duplicate name は lower 比較で拒否", has(eDup, "duplicate name"), eDup?.message ?? "通ってしまった");
      const { data: r3, error: e3 } = await owner.rpc("set_cast_rank", {
        p_id: null, p_store_id: sA2.id, p_name: "NOX-VERIFY-R-A2", p_is_active: true,
      });
      rankA2 = r3 as string;
      check("段43(12) 他店（A2）にも owner はランクを作れる", !e3 && !!rankA2, e3?.message);
    }

    // ═══ (6) ランク軸 ═══
    await mkRule({ fee_kind: "jonai_shimei", rank_id: rankR1, amount: 8000, priority: 1 });
    await mkRule({ fee_kind: "jonai_shimei", rank_id: null, amount: 4000, priority: 50 });
    {
      const { data: d1 } = await resolve(owner, "jonai_shimei", SUN_2000, { rank: rankR1 });
      check("段43(6) rank 行は該当 rank に当たる", amountOf(d1) === 8000, `got ${amountOf(d1)}`);
      const { data: d2 } = await resolve(owner, "jonai_shimei", SUN_2000, { rank: rankR2 });
      check("段43(6) 他 rank には rank 行が当たらない（null 行へ）", amountOf(d2) === 4000, `got ${amountOf(d2)}`);
      const { data: d3 } = await resolve(owner, "jonai_shimei", SUN_2000, { rank: null });
      check("段43(6) rank=null は null 行（ワイルドカード）に当たる", amountOf(d3) === 4000, `got ${amountOf(d3)}`);
    }

    // ═══ (7) 0行フォールバック ═══
    {
      const { data, error } = await resolve(owner, "set", SUN_2000, { store: sA2.id });
      check("段43(7) ルール無し店は 0行（基本料金フォールバックは呼び出し側）",
        !error && Array.isArray(data) && data.length === 0, error?.message ?? JSON.stringify(data));
    }

    // ═══ (8) is_active=false 除外 ═══
    {
      await admin.from("pricing_rules").update({ is_active: false })
        .eq("store_id", sA1.id).eq("fee_kind", "dohan");
      const { data: dOff } = await resolve(owner, "dohan", SUN_2000);
      check("段43(8) is_active=false は解決から除外（dohan 全停止で 0行）",
        Array.isArray(dOff) && dOff.length === 0, JSON.stringify(dOff));
      await admin.from("pricing_rules").update({ is_active: true })
        .eq("store_id", sA1.id).eq("fee_kind", "dohan");
      const { data: dOn } = await resolve(owner, "dohan", SUN_2000);
      check("段43(8) 復帰で再び当たる", amountOf(dOn) === 100, `got ${amountOf(dOn)}`);
    }

    // ═══ (9) set_pricing_rule CRUD ═══
    {
      await admin.from("audit_logs").delete().in("action", ["set_pricing_rule"]);
      const args = {
        p_id: null as string | null, p_store_id: sA1.id, p_fee_kind: "set",
        p_seat_kind: "VIP", p_dow_mask: 127, p_time_from_min: 1200, p_time_to_min: 1380,
        p_rank_id: null as string | null, p_amount: 9000, p_duration_min: 90,
        p_priority: 3, p_is_active: true,
      };
      const { data: newId, error: eIns } = await owner.rpc("set_pricing_rule", args);
      check("段43(9) 正常 insert＝uuid が返る", !eIns && typeof newId === "string", eIns?.message);
      const { data: row } = await admin.from("pricing_rules").select("*").eq("id", newId as string).single();
      check("段43(9) insert 内容が DB に反映（seat/dow/帯/amount/duration/priority）",
        row?.seat_kind === "VIP" && row?.dow_mask === 127 && row?.time_from_min === 1200
        && row?.time_to_min === 1380 && row?.amount === 9000 && row?.duration_min === 90 && row?.priority === 3,
        JSON.stringify(row));
      const { error: eUpd } = await owner.rpc("set_pricing_rule", { ...args, p_id: newId as string, p_amount: 9500 });
      const { data: row2 } = await admin.from("pricing_rules").select("amount").eq("id", newId as string).single();
      check("段43(9) 正常 update＝amount 反映", !eUpd && row2?.amount === 9500, eUpd?.message ?? `got ${row2?.amount}`);
      const { data: au } = await admin.from("audit_logs")
        .select("before_json, after_json").eq("action", "set_pricing_rule").order("at");
      check("段43(9) audit 2行（insert=before null / update=before 非null）",
        (au ?? []).length === 2 && au![0].before_json === null && au![1].before_json !== null,
        `got ${(au ?? []).length}`);

      const bad = async (label: string, patch: Record<string, unknown>, token: string) => {
        const { error } = await owner.rpc("set_pricing_rule", { ...args, ...patch });
        check(`段43(9) ${label}＝'${token}'`, has(error, token), error?.message ?? "通ってしまった");
      };
      await bad("不明 fee_kind", { p_fee_kind: "nomikai" }, "bad fee kind");
      await bad("不明席種", { p_seat_kind: "個室" }, "bad seat kind");
      await bad("dow_mask=0（曜日ゼロ選択）", { p_dow_mask: 0 }, "bad dow");
      await bad("dow_mask=128（範囲外）", { p_dow_mask: 128 }, "bad dow");
      await bad("帯の逆順（21:00→18:00）", { p_time_from_min: 1260, p_time_to_min: 1080 }, "bad time");
      await bad("★cutoff 跨ぎ（23:00→07:00）", { p_time_from_min: 1380, p_time_to_min: 420 }, "bad time");
      await bad("帯の片側 null", { p_time_from_min: 1200, p_time_to_min: null }, "bad time");
      await bad("非指名系（set）に rank", { p_rank_id: rankR1 }, "bad rank");
      await bad("★他店（A2）の rank", { p_fee_kind: "hon_shimei", p_duration_min: null, p_rank_id: rankA2 }, "bad rank");
      await bad("負の amount", { p_amount: -1 }, "bad amount");
      await bad("非 set/extension（dohan）に duration", { p_fee_kind: "dohan", p_duration_min: 60 }, "bad duration");

      // ═══ (10) delete_pricing_rule ═══
      await admin.from("audit_logs").delete().in("action", ["delete_pricing_rule"]);
      const { error: eDel } = await owner.rpc("delete_pricing_rule", { p_id: newId as string });
      const { data: gone } = await admin.from("pricing_rules").select("id").eq("id", newId as string);
      check("段43(10) delete＝行が物理削除される", !eDel && (gone ?? []).length === 0, eDel?.message);
      const { error: eNf } = await owner.rpc("delete_pricing_rule", { p_id: newId as string });
      check("段43(10) 二度目は 'not found'", has(eNf, "not found"), eNf?.message ?? "通ってしまった");
      const { data: auD } = await admin.from("audit_logs")
        .select("before_json, after_json").eq("action", "delete_pricing_rule");
      check("段43(10) audit＝before 非null / after null",
        (auD ?? []).length === 1 && auD![0].before_json !== null && auD![0].after_json === null,
        `got ${(auD ?? []).length}`);
    }

    // ═══ (11) pricing_rule_reorder ═══
    {
      const { error: eOk } = await owner.rpc("pricing_rule_reorder", {
        p_store_id: sA1.id, p_fee_kind: "extension", p_ids: [band3, band1, band2],
      });
      const { data: rows } = await admin.from("pricing_rules")
        .select("id, priority").in("id", [band1, band2, band3]);
      const pr = new Map((rows ?? []).map((r) => [r.id as string, r.priority as number]));
      check("段43(11) reorder＝(store, fee_kind) スコープで priority 1..N 再採番",
        !eOk && pr.get(band3) === 1 && pr.get(band1) === 2 && pr.get(band2) === 3,
        eOk?.message ?? JSON.stringify([...pr]));
      const { data: dohanRow } = await admin.from("pricing_rules")
        .select("id").eq("store_id", sA1.id).eq("fee_kind", "dohan").limit(1).single();
      const { error: eMix } = await owner.rpc("pricing_rule_reorder", {
        p_store_id: sA1.id, p_fee_kind: "extension", p_ids: [band1, band2, dohanRow!.id as string],
      });
      check("段43(11) ★他 fee_kind の id 混入＝forbidden（①スコープ実在検証）",
        has(eMix, "forbidden"), eMix?.message ?? "通ってしまった");
      const { error: ePart } = await owner.rpc("pricing_rule_reorder", {
        p_store_id: sA1.id, p_fee_kind: "extension", p_ids: [band1, band2],
      });
      check("段43(11) 部分配列＝'partial ids'（②全件要求）", has(ePart, "partial ids"), ePart?.message ?? "通ってしまった");
      const { error: eDup } = await owner.rpc("pricing_rule_reorder", {
        p_store_id: sA1.id, p_fee_kind: "extension", p_ids: [band1, band1, band2],
      });
      check("段43(11) 重複 id＝'duplicate ids'", has(eDup, "duplicate ids"), eDup?.message ?? "通ってしまった");
    }

    // ═══ (12) 後半: cast_rank_reorder / set_cast_rank_of ═══
    {
      const { error: eRo } = await owner.rpc("cast_rank_reorder", {
        p_store_id: sA1.id, p_ids: [rankR2, rankR1],
      });
      const { data: rows } = await admin.from("cast_ranks").select("id, sort_order").in("id", [rankR1, rankR2]);
      const so = new Map((rows ?? []).map((r) => [r.id as string, r.sort_order as number]));
      check("段43(12) cast_rank_reorder＝配列順で 1..N", !eRo && so.get(rankR2) === 1 && so.get(rankR1) === 2,
        eRo?.message ?? JSON.stringify([...so]));
      const { error: ePart } = await owner.rpc("cast_rank_reorder", { p_store_id: sA1.id, p_ids: [rankR1] });
      check("段43(12) reorder 部分配列＝'partial ids'", has(ePart, "partial ids"), ePart?.message ?? "通ってしまった");

      const { data: castRow } = await admin.from("casts")
        .select("id").eq("name", FIXTURE_USERS.castA1a.name).eq("store_id", sA1.id).single();
      const castId = castRow!.id as string;
      const { error: eSet } = await owner.rpc("set_cast_rank_of", { p_cast_id: castId, p_rank_id: rankR1 });
      const { data: c1 } = await admin.from("casts").select("rank_id").eq("id", castId).single();
      check("段43(12) set_cast_rank_of＝casts.rank_id 反映", !eSet && c1?.rank_id === rankR1, eSet?.message);
      const { error: eBad } = await owner.rpc("set_cast_rank_of", { p_cast_id: castId, p_rank_id: rankA2 });
      check("段43(12) ★他店（A2）の rank は 'bad rank'（cast の店と照合）",
        has(eBad, "bad rank"), eBad?.message ?? "通ってしまった");
      const { error: eNull } = await owner.rpc("set_cast_rank_of", { p_cast_id: castId, p_rank_id: null });
      const { data: c2 } = await admin.from("casts").select("rank_id").eq("id", castId).single();
      check("段43(12) null で解除できる", !eNull && c2?.rank_id === null, eNull?.message);
      const { data: auR } = await admin.from("audit_logs")
        .select("before_json, after_json").eq("action", "set_cast_rank_of").order("at");
      check("段43(12) set_cast_rank_of の audit＝rank_id のみ（PII なし）",
        (auR ?? []).length >= 2 && Object.keys((auR![0].before_json ?? {}) as object).join(",") === "rank_id",
        JSON.stringify(auR?.[0]));
    }


    // ═══ (17) ★mig0104（裁定77）: 停止中ランクの新規参照拒否＋据え置き ═══
    //   ★据え置き＝「割当時は有効だったランクが後から停止された」現場を壊さないための設計。
    //     新規に停止中ランクを指す操作だけを 'inactive rank' で拒否する。
    {
      // R3＝最初から停止中（新規参照の拒否を見る）／R4＝有効で割当・参照してから停止（据え置きを見る）
      const { data: r3, error: e3 } = await owner.rpc("set_cast_rank", {
        p_id: null, p_store_id: sA1.id, p_name: "NOX-VERIFY-停止R3", p_is_active: false,
      });
      const { data: r4, error: e4 } = await owner.rpc("set_cast_rank", {
        p_id: null, p_store_id: sA1.id, p_name: "NOX-VERIFY-後停止R4", p_is_active: true,
      });
      check("段43(17) 停止中/有効ランクの作成", !e3 && !e4 && !!r3 && !!r4, e3?.message ?? e4?.message);
      const rankR3 = r3 as string, rankR4 = r4 as string;

      const { data: castRow2 } = await admin.from("casts")
        .select("id").eq("name", FIXTURE_USERS.castA1a.name).eq("store_id", sA1.id).single();
      const castId2 = castRow2!.id as string;

      // R4 が有効なうちに「割当」と「ルール参照」を作る
      const { error: ePre1 } = await owner.rpc("set_cast_rank_of", { p_cast_id: castId2, p_rank_id: rankR4 });
      const ruleArgs = {
        p_store_id: sA1.id, p_fee_kind: "hon_shimei", p_seat_kind: null, p_dow_mask: null,
        p_time_from_min: null, p_time_to_min: null, p_duration_min: null, p_priority: 100, p_is_active: true,
      };
      const { data: ruleD, error: ePre2 } = await owner.rpc("set_pricing_rule", {
        ...ruleArgs, p_id: null, p_rank_id: rankR4, p_amount: 3000,
      });
      check("段43(17) 前提: 有効ランクでの割当とルール作成は通る",
        !ePre1 && !ePre2 && !!ruleD, ePre1?.message ?? ePre2?.message);

      // R4 を停止させる（名前は据え置き＝duplicate name を踏まない）
      const { error: eOff } = await owner.rpc("set_cast_rank", {
        p_id: rankR4, p_store_id: sA1.id, p_name: "NOX-VERIFY-後停止R4", p_is_active: false,
      });
      check("段43(17) 前提: R4 を停止できる", !eOff, eOff?.message);

      // (a) 新規割当に停止中ランク → 'inactive rank'
      const { error: eA } = await owner.rpc("set_cast_rank_of", { p_cast_id: castId2, p_rank_id: rankR3 });
      check("段43(17)a set_cast_rank_of 停止中ランクの新規割当＝'inactive rank'",
        has(eA, "inactive rank"), eA?.message ?? "通ってしまった");
      const { data: cA } = await admin.from("casts").select("rank_id").eq("id", castId2).single();
      check("段43(17)a 拒否後も rank_id は元のまま（R4）", cA?.rank_id === rankR4, `got ${cA?.rank_id}`);

      // (b) 既にその停止中ランクを持つ cast へ同じ rank_id を再送 → 据え置きで成功
      const { error: eB } = await owner.rpc("set_cast_rank_of", { p_cast_id: castId2, p_rank_id: rankR4 });
      const { data: cB } = await admin.from("casts").select("rank_id").eq("id", castId2).single();
      check("段43(17)b ★据え置き: 同じ停止中 rank_id の再送は通る",
        !eB && cB?.rank_id === rankR4, eB?.message ?? `got ${cB?.rank_id}`);

      // (c) set_pricing_rule 新規（p_id null）に停止中ランク → 'inactive rank'
      const { error: eC } = await owner.rpc("set_pricing_rule", {
        ...ruleArgs, p_id: null, p_rank_id: rankR3, p_amount: 2500,
      });
      check("段43(17)c set_pricing_rule 新規×停止中ランク＝'inactive rank'",
        has(eC, "inactive rank"), eC?.message ?? "通ってしまった");

      // (d) 既存ルールの rank_id を変えずに amount だけ更新 → 据え置きで成功
      const { error: eD } = await owner.rpc("set_pricing_rule", {
        ...ruleArgs, p_id: ruleD as string, p_rank_id: rankR4, p_amount: 4000,
      });
      const { data: rD } = await admin.from("pricing_rules")
        .select("amount, rank_id").eq("id", ruleD as string).single();
      check("段43(17)d ★据え置き: rank_id 据え置きの amount 更新は通る（3000→4000）",
        !eD && rD?.amount === 4000 && rD?.rank_id === rankR4, eD?.message ?? JSON.stringify(rD));
    }

    // ═══ (13) 認可 ═══
    {
      const args = {
        p_id: null, p_store_id: sA1.id, p_fee_kind: "set", p_seat_kind: null,
        p_dow_mask: null, p_time_from_min: null, p_time_to_min: null, p_rank_id: null,
        p_amount: 1234, p_duration_min: null, p_priority: 99, p_is_active: true,
      };
      const { data: mgrId, error: eMgr } = await mgr.rpc("set_pricing_rule", args);
      check("段43(13) manager 自店＝set_pricing_rule 成功", !eMgr && typeof mgrId === "string", eMgr?.message);
      if (typeof mgrId === "string") await admin.from("pricing_rules").delete().eq("id", mgrId);
      const { error: eMgr2 } = await mgr.rpc("set_pricing_rule", { ...args, p_store_id: sA2.id });
      check("段43(13) manager 他店＝forbidden", has(eMgr2, "forbidden"), eMgr2?.message ?? "通ってしまった");
      const { error: eStf } = await stf.rpc("set_pricing_rule", args);
      check("段43(13) staff＝forbidden", has(eStf, "forbidden"), eStf?.message ?? "通ってしまった");
      const { error: eCst } = await cst.rpc("set_pricing_rule", args);
      check("段43(13) cast＝forbidden", has(eCst, "forbidden"), eCst?.message ?? "通ってしまった");
      const { error: eOrg } = await owner.rpc("set_pricing_rule", { ...args, p_store_id: sB1.id });
      check("段43(13) ★owner でも他 org の store＝forbidden", has(eOrg, "forbidden"), eOrg?.message ?? "通ってしまった");

      const { error: eRes1 } = await resolve(cst, "set", SUN_2000);
      check("段43(13) ★pricing_resolve は cast 拒否（料率＝経営情報）", has(eRes1, "forbidden"), eRes1?.message ?? "通ってしまった");
      const { error: eRes2 } = await resolve(stf, "set", SUN_2000);
      check("段43(13) pricing_resolve は staff も拒否", has(eRes2, "forbidden"), eRes2?.message ?? "通ってしまった");
      const { error: eRes3 } = await resolve(mgr, "set", SUN_2000, { store: sA2.id });
      check("段43(13) pricing_resolve は manager 他店 forbidden", has(eRes3, "forbidden"), eRes3?.message ?? "通ってしまった");
      const { error: eRes4 } = await resolve(mgr, "set", SUN_2000);
      check("段43(13) pricing_resolve は manager 自店 OK", !eRes4, eRes4?.message);
      const { error: eRk } = await cst.rpc("cast_rank_reorder", { p_store_id: sA1.id, p_ids: [rankR1, rankR2] });
      check("段43(13) cast_rank_reorder も cast 拒否", has(eRk, "forbidden"), eRk?.message ?? "通ってしまった");
      const { error: eDelC } = await cst.rpc("delete_pricing_rule", { p_id: band1 });
      check("段43(13) delete_pricing_rule も cast 拒否", has(eDelC, "forbidden") || has(eDelC, "not found"), eDelC?.message ?? "通ってしまった");
    }

    // ═══ (14) RLS: cast/staff の select 0行 ═══
    {
      const { data: c1, error: e1 } = await cst.from("pricing_rules").select("id");
      check("段43(14) ★cast は pricing_rules 0行（料率は経営情報）", !e1 && (c1 ?? []).length === 0,
        e1?.message ?? `got ${(c1 ?? []).length}`);
      const { data: c2, error: e2 } = await cst.from("cast_ranks").select("id");
      check("段43(14) cast は cast_ranks 0行", !e2 && (c2 ?? []).length === 0, e2?.message ?? `got ${(c2 ?? []).length}`);
      const { data: s1, error: e3 } = await stf.from("pricing_rules").select("id");
      check("段43(14) ★staff も pricing_rules 0行", !e3 && (s1 ?? []).length === 0, e3?.message ?? `got ${(s1 ?? []).length}`);
      const { data: s2, error: e4 } = await stf.from("cast_ranks").select("id");
      check("段43(14) staff も cast_ranks 0行", !e4 && (s2 ?? []).length === 0, e4?.message ?? `got ${(s2 ?? []).length}`);
      const { data: m1 } = await mgr.from("pricing_rules").select("id");
      check("段43(14) manager 自店は見える（positive 対照）", (m1 ?? []).length > 0, `got ${(m1 ?? []).length}`);
    }

    // ═══ (15) authenticated 直書き遮断（A4 の恒久 assert・runtime 面）═══
    {
      const { error: eI } = await mgr.from("pricing_rules").insert({
        org_id: sA1.org_id, store_id: sA1.id, fee_kind: "set", amount: 1, priority: 1,
      });
      check("段43(15) ★authenticated 直 INSERT が permission denied", has(eI, "permission denied"), eI?.message ?? "通ってしまった");
      const { error: eU } = await mgr.from("pricing_rules").update({ amount: 1 }).eq("store_id", sA1.id);
      check("段43(15) 直 UPDATE も落ちる", has(eU, "permission denied"), eU?.message ?? "通ってしまった");
      const { error: eD } = await mgr.from("pricing_rules").delete().eq("store_id", sA1.id);
      check("段43(15) 直 DELETE も落ちる", has(eD, "permission denied"), eD?.message ?? "通ってしまった");
      const { error: eCr } = await mgr.from("cast_ranks").insert({
        org_id: sA1.org_id, store_id: sA1.id, name: "x", sort_order: 1,
      });
      check("段43(15) cast_ranks 直 INSERT も落ちる", has(eCr, "permission denied"), eCr?.message ?? "通ってしまった");
      // TRUNCATE は PostgREST から発行不可＝G37 の has_table_privilege(false) で恒久 assert
      const { error: eBm } = await mgr.rpc("biz_minutes_of", { p_store_id: sA1.id, p_at: SUN_2000 });
      check("段43(15) ★biz_minutes_of は authenticated でも直呼び不可（内部専用）",
        isFnBlocked(eBm), eBm?.message ?? "実行できてしまった");
    }

    // ═══ (16) anon BLOCKED 一式 ═══
    {
      const blocked = async (label: string, fn: string, args: Record<string, unknown>) => {
        const { error } = await anon.rpc(fn, args);
        check(`段43(16) anon ${label} BLOCKED`, isFnBlocked(error), error?.message ?? "実行できてしまった");
      };
      const Z = "00000000-0000-0000-0000-000000000000";
      await blocked("pricing_resolve", "pricing_resolve", { p_store_id: Z, p_at: SUN_2000, p_fee_kind: "set", p_seat_kind: null, p_rank_id: null });
      await blocked("set_pricing_rule", "set_pricing_rule", { p_id: null, p_store_id: Z, p_fee_kind: "set", p_seat_kind: null, p_dow_mask: null, p_time_from_min: null, p_time_to_min: null, p_rank_id: null, p_amount: 1, p_duration_min: null, p_priority: 1, p_is_active: true });
      await blocked("delete_pricing_rule", "delete_pricing_rule", { p_id: Z });
      await blocked("pricing_rule_reorder", "pricing_rule_reorder", { p_store_id: Z, p_fee_kind: "set", p_ids: [Z] });
      await blocked("set_cast_rank", "set_cast_rank", { p_id: null, p_store_id: Z, p_name: "x", p_is_active: true });
      await blocked("cast_rank_reorder", "cast_rank_reorder", { p_store_id: Z, p_ids: [Z] });
      await blocked("set_cast_rank_of", "set_cast_rank_of", { p_cast_id: Z, p_rank_id: null });
      await blocked("biz_minutes_of", "biz_minutes_of", { p_store_id: Z, p_at: SUN_2000 });
      const { data: t1, error: eT1 } = await anon.from("pricing_rules").select("id");
      check("段43(16) anon は pricing_rules に触れない（permission denied or 0行）",
        has(eT1, "permission denied") || (!eT1 && (t1 ?? []).length === 0), eT1?.message ?? `got ${(t1 ?? []).length}`);
      const { data: t2, error: eT2 } = await anon.from("cast_ranks").select("id");
      check("段43(16) anon は cast_ranks に触れない",
        has(eT2, "permission denied") || (!eT2 && (t2 ?? []).length === 0), eT2?.message ?? `got ${(t2 ?? []).length}`);
    }

    // ═══ (18) ★mig0106（裁定82・起票#14）: set_store_biz_cutoff ═══
    //   ★settings_json は「verify 店 A1 のみ」を触り、段の finally で **snapshot を逐語復元**する。
    //     復元を怠ると rls の F1e（:1928/:1956 の biz_cutoff_hm === "06:00" 固定）を壊す。
    {
      const { data: snapRow } = await admin.from("stores").select("settings_json").eq("id", sA1.id).single();
      const snap = (snapRow?.settings_json ?? {}) as Record<string, unknown>;
      let guardBandId: string | null = null;
      let pcBandId: string | null = null;
      try {
        const cutoffNow = async (): Promise<string | null> => {
          const { data } = await admin.from("stores").select("settings_json").eq("id", sA1.id).single();
          const sj = (data?.settings_json ?? {}) as Record<string, unknown>;
          return typeof sj.biz_cutoff_hm === "string" ? sj.biz_cutoff_hm : null;
        };
        // 起点を 06:00 に揃える（before の実測値を決定的にする）
        await admin.from("stores").update({ settings_json: { ...snap, biz_cutoff_hm: "06:00" } }).eq("id", sA1.id);

        // ── a. owner 正常系 ＋ audit（before 06:00 / after 07:00）──
        const { error: eA } = await owner.rpc("set_store_biz_cutoff", { p_store_id: sA1.id, p_hm: "07:00" });
        check("段43(18)a owner set_store_biz_cutoff('07:00') 成功", !eA, eA?.message);
        check("段43(18)a settings_json.biz_cutoff_hm = '07:00'", (await cutoffNow()) === "07:00", String(await cutoffNow()));
        const { data: au } = await admin.from("audit_logs")
          .select("before_json, after_json").eq("action", "set_store_biz_cutoff").order("at", { ascending: false }).limit(1);
        const b0 = (au?.[0]?.before_json ?? {}) as Record<string, unknown>;
        const a0 = (au?.[0]?.after_json ?? {}) as Record<string, unknown>;
        check("段43(18)a audit action='set_store_biz_cutoff'・before 06:00 / after 07:00",
          (au ?? []).length === 1 && b0.biz_cutoff_hm === "06:00" && a0.biz_cutoff_hm === "07:00",
          JSON.stringify({ b: b0, a: a0 }));

        // ── b. bad cutoff 5入力（形式2＋範囲2＋null）──
        for (const [label, hm] of [
          ["'7:00'（桁不足）", "7:00"], ["'25:00'（時刻外）", "25:00"],
          ["'02:00'（範囲外・下）", "02:00"], ["'13:00'（範囲外・上）", "13:00"],
        ] as const) {
          const { error } = await owner.rpc("set_store_biz_cutoff", { p_store_id: sA1.id, p_hm: hm });
          check(`段43(18)b ${label} = 'bad cutoff'`, has(error, "bad cutoff"), error?.message ?? "通ってしまった");
        }
        const { error: eNull } = await owner.rpc("set_store_biz_cutoff", { p_store_id: sA1.id, p_hm: null });
        check("段43(18)b null = 'bad cutoff'", has(eNull, "bad cutoff"), eNull?.message ?? "通ってしまった");
        check("段43(18)b 拒否後も値は 07:00 のまま", (await cutoffNow()) === "07:00", String(await cutoffNow()));

        // ── c. owner 限定（manager 自店 / staff / 他 org）──
        const { error: eMgr } = await mgr.rpc("set_store_biz_cutoff", { p_store_id: sA1.id, p_hm: "08:00" });
        check("段43(18)c manager 自店でも forbidden（owner 限定）", has(eMgr, "forbidden"), eMgr?.message ?? "通ってしまった");
        const { error: eStf } = await stf.rpc("set_store_biz_cutoff", { p_store_id: sA1.id, p_hm: "08:00" });
        check("段43(18)c staff = forbidden", has(eStf, "forbidden"), eStf?.message ?? "通ってしまった");
        const { error: eOrg } = await owner.rpc("set_store_biz_cutoff", { p_store_id: sB1.id, p_hm: "08:00" });
        check("段43(18)c ★owner でも他 org の store = forbidden", has(eOrg, "forbidden"), eOrg?.message ?? "通ってしまった");
        check("段43(18)c 拒否3件の後も値は 07:00 のまま", (await cutoffNow()) === "07:00", String(await cutoffNow()));

        // ── d. 帯ガード ──
        //   ★発火条件は「from < cutoff かつ to > cutoff」＝帯が cutoff の瞬間をまたぐ場合のみ
        //     （from>=cutoff かつ to<=cutoff は to 側が +1440 されるため構造上 ef<et で必ず通る）。
        //     したがって「20:00→04:00 の帯 × cutoff 05:00」は**またがない**＝下の positive control で示す。
        //   ★跨ぐ帯は set_pricing_rule 自身も 'bad time' で作れないので、**cutoff を動かす前に作る**。
        const mkBand = async (from: number, to: number, amount: number) => {
          const { data, error } = await owner.rpc("set_pricing_rule", {
            p_id: null, p_store_id: sA1.id, p_fee_kind: "set", p_seat_kind: null, p_dow_mask: null,
            p_time_from_min: from, p_time_to_min: to, p_rank_id: null,
            p_amount: amount, p_duration_min: null, p_priority: 90, p_is_active: true,
          });
          return { id: (data as string) ?? null, error };
        };
        // d-1 positive control: 20:00→04:00 は cutoff 08:00 をまたがない（＝ガードは立たない）
        const pc = await mkBand(1200, 240, 5000);
        check("段43(18)d 前提: 20:00→04:00 の帯は cutoff 07:00 下で作れる", !pc.error && !!pc.id, pc.error?.message);
        pcBandId = pc.id;
        // d-2 跨ぐ帯（07:30→10:00）は cutoff 07:00 下では作れる（07:30 >= 07:00 のため）
        const gb = await mkBand(450, 600, 6000);
        check("段43(18)d 前提: 07:30→10:00 の帯も cutoff 07:00 下では作れる", !gb.error && !!gb.id, gb.error?.message);
        guardBandId = gb.id;
        // d-3 その帯は cutoff 08:00 をまたぐ → 拒否
        const { error: eGuard } = await owner.rpc("set_store_biz_cutoff", { p_store_id: sA1.id, p_hm: "08:00" });
        check("段43(18)d ★帯が跨ぐ cutoff は 'band crosses cutoff' で拒否",
          has(eGuard, "band crosses cutoff"), eGuard?.message ?? "通ってしまった");
        check("段43(18)d 拒否後も値は 07:00 のまま", (await cutoffNow()) === "07:00", String(await cutoffNow()));
        // d-4 跨ぐ帯だけ消す（20:00→04:00 は残す）→ 通る＝ガードは「またぐ帯」だけを見ている
        const { error: eDelB } = await owner.rpc("delete_pricing_rule", { p_id: guardBandId });
        check("段43(18)d 跨ぐ帯を削除できる", !eDelB, eDelB?.message);
        guardBandId = null;
        const { error: eOk } = await owner.rpc("set_store_biz_cutoff", { p_store_id: sA1.id, p_hm: "08:00" });
        check("段43(18)d ★跨ぐ帯を消せば '08:00' は通る（20:00→04:00 は残置＝またがない）", !eOk, eOk?.message);
        check("段43(18)d settings_json.biz_cutoff_hm = '08:00'", (await cutoffNow()) === "08:00", String(await cutoffNow()));
      } finally {
        for (const bid of [guardBandId, pcBandId]) {
          if (bid) await admin.from("pricing_rules").delete().eq("id", bid);
        }
        await admin.from("stores").update({ settings_json: snap }).eq("id", sA1.id);
        const { data: back } = await admin.from("stores").select("settings_json").eq("id", sA1.id).single();
        check("段43(18)（復元）settings_json を snapshot へ逐語復元（rls F1e の 06:00 固定を壊さない）",
          JSON.stringify(back?.settings_json ?? {}) === JSON.stringify(snap), JSON.stringify(back?.settings_json));
      }
    }

  } finally {
    await wipe();
    const { count: leftR } = await admin.from("pricing_rules")
      .select("id", { count: "exact", head: true }).in("store_id", stores);
    const { count: leftK } = await admin.from("cast_ranks")
      .select("id", { count: "exact", head: true }).in("store_id", stores);
    const { count: leftC } = await admin.from("casts")
      .select("id", { count: "exact", head: true }).in("store_id", stores).not("rank_id", "is", null);
    check("段43（掃除）pricing_rules/cast_ranks 0件・casts.rank_id 全 null（固定カウント非汚染）",
      (leftR ?? 0) === 0 && (leftK ?? 0) === 0 && (leftC ?? 0) === 0,
      `rules=${leftR} ranks=${leftK} casts_ranked=${leftC}`);
  }

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-pricing ALL PASS (${pass} assertions)`);
  console.log("料金基盤: 営業日基準の帯解決(金曜25時=金曜)・priority決定順・RLS=owner/manager限定・A4直書き遮断");
}

main().catch((e) => {
  console.error("✗ 異常終了", e);
  process.exit(1);
});
