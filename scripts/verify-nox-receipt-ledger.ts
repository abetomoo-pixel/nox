/**
 * verify:nox-receipt-ledger — mig0099（R2-c 領収書本格版）の runtime 実証（段56・R2 最終）
 *   実行: npm run verify:nox-receipt-ledger（env: .env.local）
 *
 * ★prosrc 緑 ≠ runtime 緑: 0099 の肝は
 *   (a) serial 採番＝UNIQUE(store_id, serial) 衝突リトライが並行発行で実際に一列化されること（R2-10）
 *   (b) Σamount ≤ checks.total が FOR UPDATE 下で守られること
 *   (c) 公開関数が「不在/void/期限切れ＝空」「PII 最小5項目」「発行時スナップ凍結」を守ること（R2-11/12・正本B）
 *   (d) ★NOX 初の anon grant が anon 実セッションで実際に動くこと
 *
 * 段構成（指示の必須14系＋α）:
 *   (1) 全額発行（amount null）＝serial=max+1・amount=total・スナップ（店名/biz_date=closed_at の営業日）・
 *       expires=発行+90日  (2) 分割発行（3000→2000）＝serial 連番・Σ≤total
 *   (3) Σ超過 'bad amount'／open 伝票 'not closed'／宛名101字 'bad recipient'
 *   (4) ★採番並行（Promise.all 2発行）＝serial 重複なし・両方成功（リトライの実証・adversarial 対象）
 *   (5) void → voided・再 void 無音（audit 不増）・audit 1回
 *   (6) ★anon 実実行＝5項目・serial_no='R-000NNN' 形式  (7) token 不一致＝空（error なし）
 *   (8) void 済み token＝空／expires 過去日化（admin 直 update）＝空→復元
 *   (9) PII 最小＝返却キーが5項目ちょうど（customer/cast/recipient を含まない shape）
 *   (10) ★発行後に stores.name 変更→公開返却はスナップの旧名→復元（凍結の実証・adversarial 対象）
 *   (11) audit に token が含まれない（after_json の shape assert）
 *   (12) staff-register 発行可・cast 'forbidden'・他店 manager 'forbidden'
 *   (13) billing locked（org_billing 一時 canceled）＝issue/void とも 'billing locked' →復元
 *
 * fixture: P56 接頭辞・seed 不触・closed 伝票は admin 直 insert（段53 型・seat は既存流用）。
 *   stores.name / org_billing.status は snapshot→finally 復元＋自己 assert。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { FIXTURE_USERS, STORE_A1, STORE_A2, loadEnvOrExit } from "./fixtures-f0";

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

const P56 = "NOX-VERIFY-P56";
type IssueRet = { id: string; serial: number; token: string; amount: number; expires_on: string; biz_date: string; store_name: string };

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
    const { error } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
    if (error) { console.error(`✗ ${key} サインイン失敗（seed:f0 実行済みか）: ${error.message}`); process.exit(1); }
    return c;
  };

  const { data: sA1row } = await admin.from("stores").select("id, org_id, name").eq("name", STORE_A1).single();
  const sA1 = sA1row as { id: string; org_id: string; name: string };
  const origStoreName = sA1.name;
  const { data: origBilling } = await admin.from("org_billing").select("status").eq("org_id", sA1.org_id).maybeSingle();
  const { data: mgrU } = await admin.from("users").select("id").eq("email", FIXTURE_USERS.managerA1.email).single();
  const actorId = (mgrU as { id: string }).id;
  const { data: seatRow } = await admin.from("seats").select("id").eq("store_id", sA1.id).limit(1).single();
  const seatId = (seatRow as { id: string }).id;

  const checkIds: string[] = [];
  const cleanup = async () => {
    if (checkIds.length) {
      const { data: iss } = await admin.from("receipt_issues").select("id").in("check_id", checkIds);
      const issIds = ((iss ?? []) as { id: string }[]).map((x) => x.id);
      if (issIds.length) {
        await admin.from("receipt_issues").delete().in("id", issIds);
        await admin.from("audit_logs").delete().in("target", issIds.map((id) => `receipt_issues:${id}`));
      }
      await admin.from("check_lines").delete().in("check_id", checkIds);
      await admin.from("checks").delete().in("id", checkIds);
      await admin.from("audit_logs").delete().in("target", checkIds.map((id) => `checks:${id}`));
    }
    await admin.from("stores").update({ name: origStoreName }).eq("id", sA1.id);
    if (origBilling) await admin.from("org_billing").update({ status: origBilling.status }).eq("org_id", sA1.org_id);
  };

  const mgr = await signIn("managerA1");
  const staffReg = await signIn("staffRegOnA1");
  const cast = await signIn("castA1a");
  const mgrB = await signIn("managerB1");
  check("段56（準備）4セッション解決", true);

  // closed 伝票（admin 直 insert・total 5000・2031-05 窓＝他スイートと非衝突）
  const mkClosed = async (total: number, startedIso: string) => {
    const { data, error } = await admin.from("checks").insert({
      org_id: sA1.org_id, store_id: sA1.id, seat_id: seatId, status: "closed", nom_type: "free",
      started_at: startedIso, closed_at: startedIso, total, people: 1,
      service_rate: 10, round_unit: 100, round_mode: "down", created_by: actorId,
    }).select("id").single();
    if (error) { check("段56（準備）closed check insert", false, error.message); return ""; }
    checkIds.push(data!.id as string);
    return data!.id as string;
  };

  try {
    const c1 = await mkClosed(5000, "2031-05-10T21:00:00+09:00"); // 全額発行用
    const c2 = await mkClosed(5000, "2031-05-11T05:30:00+09:00"); // 分割用（cutoff 前＝biz 05-10）
    const c3 = await mkClosed(8000, "2031-05-12T21:00:00+09:00"); // 並行発行用
    check("段56（準備）closed 伝票3枚", !!c1 && !!c2 && !!c3);

    // ═══ (1) 全額発行（amount null）＝serial/スナップ/expires ═══
    const { data: preMax } = await admin.from("receipt_issues").select("serial").eq("store_id", sA1.id)
      .order("serial", { ascending: false }).limit(1);
    const base = ((preMax ?? [])[0]?.serial as number | undefined) ?? 0;
    const { data: r1raw, error: e1 } = await mgr.rpc("receipt_issue", { p_check_id: c1 });
    const r1 = r1raw as IssueRet | null;
    const todayJst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const exp90 = new Date(Date.parse(todayJst + "T00:00:00Z") + 90 * 86_400_000).toISOString().slice(0, 10);
    check("段56(1) ★全額発行＝serial=店内max+1・amount=total 5000・店名/biz_date スナップ",
      !e1 && r1?.serial === base + 1 && r1?.amount === 5000
      && r1?.store_name === origStoreName && r1?.biz_date === "2031-05-10",
      e1?.message ?? JSON.stringify(r1));
    check("段56(1) ★expires = 発行日（JST）+90日", r1?.expires_on === exp90, JSON.stringify({ got: r1?.expires_on, exp90 }));

    // ═══ (2) 分割発行＝連番・Σ≤total（cutoff 前 close＝biz_date が前営業日へ割れる実測も兼ねる）═══
    const { data: r2araw, error: e2a } = await mgr.rpc("receipt_issue", { p_check_id: c2, p_amount: 3000, p_recipient: "上様" });
    const { data: r2braw, error: e2b } = await mgr.rpc("receipt_issue", { p_check_id: c2, p_amount: 2000 });
    const r2a = r2araw as IssueRet | null, r2b = r2braw as IssueRet | null;
    check("段56(2) ★分割発行 3000→2000＝serial 連番・Σ=total ちょうどまで可・biz_date=cutoff 前 close は前営業日",
      !e2a && !e2b && r2b!.serial === r2a!.serial + 1 && r2a?.biz_date === "2031-05-10",
      (e2a ?? e2b)?.message ?? JSON.stringify({ r2a, r2b }));

    // ═══ (3) 負系: Σ超過／open 伝票／宛名101字 ═══
    {
      const { error: eOver } = await mgr.rpc("receipt_issue", { p_check_id: c2, p_amount: 1 });
      check("段56(3) Σ超過（5000 発行済み +1）= 'bad amount'", has(eOver, "bad amount"), eOver?.message ?? "通ってしまった");
      const { data: cOpenD } = await mgr.rpc("check_open", { p_seat_id: seatId, p_people: 1, p_nom_type: "free" });
      const cOpen = cOpenD as string;
      if (cOpen) checkIds.push(cOpen);
      const { error: eOpen } = await mgr.rpc("receipt_issue", { p_check_id: cOpen });
      check("段56(3) open 伝票 = 'not closed'", has(eOpen, "not closed"), eOpen?.message ?? "通ってしまった");
      const { error: eName } = await mgr.rpc("receipt_issue", { p_check_id: c3, p_recipient: "あ".repeat(101) });
      check("段56(3) 宛名101字 = 'bad recipient'", has(eName, "bad recipient"), eName?.message ?? "通ってしまった");
    }

    // ═══ (4) ★採番並行（Promise.all・adversarial 対象）＝重複なし・両方成功 ═══
    //   同店 c3（total 8000）へ 2000/3000 を並行発行＝serial の max+1 が同値を掴んでも
    //   UNIQUE 衝突リトライで両方成功し連番になる（★同一伝票は FOR UPDATE で一列化されるため
    //   Σガードは直列・serial 採番の衝突だけが並行面に残る＝それをここで実証）。
    {
      const [q1, q2] = await Promise.all([
        mgr.rpc("receipt_issue", { p_check_id: c3, p_amount: 2000 }),
        mgr.rpc("receipt_issue", { p_check_id: c3, p_amount: 3000 }),
      ]);
      const s1 = (q1.data as IssueRet | null)?.serial, s2 = (q2.data as IssueRet | null)?.serial;
      check("段56(4) ★並行2発行＝両方成功・serial 重複なし（衝突リトライの実証）",
        !q1.error && !q2.error && typeof s1 === "number" && typeof s2 === "number" && s1 !== s2,
        JSON.stringify({ e1: q1.error?.message, e2: q2.error?.message, s1, s2 }));
    }

    // ═══ (5) void＝voided・再 void 無音・audit 1回 ═══
    {
      const vid = r2b!.id;
      const { error: eV } = await mgr.rpc("receipt_issue_void", { p_issue_id: vid, p_note: "検証void" });
      const { data: row } = await admin.from("receipt_issues").select("voided, void_note").eq("id", vid).single();
      const { data: au1 } = await admin.from("audit_logs").select("id").eq("action", "receipt_issue_void").eq("target", `receipt_issues:${vid}`);
      const n1 = (au1 ?? []).length;
      const { error: eV2 } = await mgr.rpc("receipt_issue_void", { p_issue_id: vid });
      const { data: au2 } = await admin.from("audit_logs").select("id").eq("action", "receipt_issue_void").eq("target", `receipt_issues:${vid}`);
      check("段56(5) ★void=voided/メモ保存・再 void 無音（audit 1回のまま）",
        !eV && row?.voided === true && row?.void_note === "検証void" && !eV2 && n1 === 1 && (au2 ?? []).length === 1,
        (eV ?? eV2)?.message ?? JSON.stringify({ row, n1, n2: (au2 ?? []).length }));
    }

    // ═══ (6)(9) anon 実実行＝5項目・R-形式・PII 最小 shape ═══
    {
      const { data, error } = await anon.rpc("nox_receipt_public", { p_token: r1!.token });
      const rows = (data ?? []) as Record<string, unknown>[];
      const row = rows[0];
      check("段56(6) ★anon 実セッションで公開照会が通る（NOX 初の anon 実実行）",
        !error && rows.length === 1, error?.message ?? JSON.stringify(rows));
      check("段56(6) ★serial_no='R-000NNN' 形式・5値の中身",
        row?.serial_no === `R-${String(r1!.serial).padStart(6, "0")}` && row?.amount === 5000
        && row?.store_name === origStoreName && row?.biz_date === "2031-05-10"
        && row?.issued_on === todayJst, JSON.stringify(row));
      const keys = Object.keys(row ?? {}).sort();
      check("段56(9) ★PII 最小＝返却キーは5項目ちょうど（customer/cast/recipient を含まない）",
        JSON.stringify(keys) === JSON.stringify(["amount", "biz_date", "issued_on", "serial_no", "store_name"]),
        JSON.stringify(keys));
    }

    // ═══ (7) token 不一致＝空 ═══
    {
      const { data, error } = await anon.rpc("nox_receipt_public", { p_token: "00000000-0000-0000-0000-000000000000" });
      check("段56(7) token 不一致＝空（error なし・rows 0）", !error && (data ?? []).length === 0,
        error?.message ?? JSON.stringify(data));
    }

    // ═══ (8) void 済み token＝空／expires 過去日化＝空→復元 ═══
    {
      const { data: dv } = await anon.rpc("nox_receipt_public", { p_token: r2b!.token });
      check("段56(8) void 済み token＝空", (dv ?? []).length === 0, JSON.stringify(dv));
      await admin.from("receipt_issues").update({ expires_on: "2020-01-01" }).eq("id", r1!.id);
      const { data: de } = await anon.rpc("nox_receipt_public", { p_token: r1!.token });
      await admin.from("receipt_issues").update({ expires_on: r1!.expires_on }).eq("id", r1!.id);
      const { data: dr } = await anon.rpc("nox_receipt_public", { p_token: r1!.token });
      check("段56(8) ★expires 過去日化＝空→復元で再表示（90日失効の実証）",
        (de ?? []).length === 0 && (dr ?? []).length === 1, JSON.stringify({ de, dr: (dr ?? []).length }));
    }

    // ═══ (10) ★店名スナップ凍結（adversarial 対象）＝live 店名変更に公開返却が追随しない ═══
    {
      await admin.from("stores").update({ name: `${P56}-改名` }).eq("id", sA1.id);
      const { data } = await anon.rpc("nox_receipt_public", { p_token: r1!.token });
      const row = ((data ?? []) as Record<string, unknown>[])[0];
      await admin.from("stores").update({ name: origStoreName }).eq("id", sA1.id);
      check("段56(10) ★発行後に stores.name を変えても公開返却は発行時スナップの旧名（凍結）",
        row?.store_name === origStoreName, JSON.stringify(row));
    }

    // ═══ (11) audit に token が含まれない（shape assert）═══
    {
      const { data: au } = await admin.from("audit_logs").select("after_json")
        .eq("action", "receipt_issue").eq("target", `receipt_issues:${r1!.id}`).single();
      const aj = (au?.after_json ?? {}) as Record<string, unknown>;
      check("段56(11) ★audit の after_json に token キーが無い（公開鍵を監査ログへ漏らさない）",
        !("token" in aj) && !JSON.stringify(aj).includes(r1!.token), JSON.stringify(Object.keys(aj).sort()));
    }

    // ═══ (12) ロール系: staff-register 可・cast/他店 manager forbidden ═══
    {
      const c4 = await mkClosed(1000, "2031-05-13T21:00:00+09:00");
      const { data: rs, error: eS } = await staffReg.rpc("receipt_issue", { p_check_id: c4, p_amount: 500 });
      check("段56(12) ★staff（can_register=true）発行可", !eS && !!(rs as IssueRet | null)?.serial, eS?.message);
      const { error: eC } = await cast.rpc("receipt_issue", { p_check_id: c4, p_amount: 100 });
      check("段56(12) cast = 'forbidden'", has(eC, "forbidden"), eC?.message ?? "通ってしまった");
      const { error: eB } = await mgrB.rpc("receipt_issue", { p_check_id: c4, p_amount: 100 });
      check("段56(12) 他店（B1）manager = 'forbidden'", has(eB, "forbidden"), eB?.message ?? "通ってしまった");
    }

    // ═══ (13) billing locked＝issue/void とも遮断 →復元 ═══
    {
      await admin.from("org_billing").update({ status: "canceled" }).eq("org_id", sA1.org_id);
      const { error: eI } = await mgr.rpc("receipt_issue", { p_check_id: c3, p_amount: 1 });
      const { error: eV } = await mgr.rpc("receipt_issue_void", { p_issue_id: r1!.id });
      await admin.from("org_billing").update({ status: origBilling?.status ?? "active" }).eq("org_id", sA1.org_id);
      check("段56(13) ★billing locked＝issue/void とも 'billing locked'",
        has(eI, "billing locked") && has(eV, "billing locked"),
        JSON.stringify({ eI: eI?.message, eV: eV?.message }));
    }
  } finally {
    await cleanup();
    const { count: leftIss } = await admin.from("receipt_issues")
      .select("id", { count: "exact", head: true }).in("check_id", checkIds.length ? checkIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data: st } = await admin.from("stores").select("name").eq("id", sA1.id).single();
    const { data: ob } = await admin.from("org_billing").select("status").eq("org_id", sA1.org_id).maybeSingle();
    check("段56（掃除）receipt_issues/checks 残置ゼロ・stores.name/org_billing 復元",
      (leftIss ?? 0) === 0 && st?.name === origStoreName && ob?.status === (origBilling?.status ?? ob?.status),
      JSON.stringify({ leftIss, st, ob }));
  }

  if (fails.length) {
    console.error(`verify:nox-receipt-ledger FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-receipt-ledger ALL PASS (${pass} assertions)`);
  console.log("領収書台帳(0099): serial並行採番/Σ≤total/void無音/anon公開5項目/期限90日/店名スナップ凍結/PII最小/token非監査/billingゲート");
}

main().catch((e) => { console.error(e); process.exit(1); });
