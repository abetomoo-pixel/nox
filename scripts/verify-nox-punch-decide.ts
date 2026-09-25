/*
 * verify:nox-punch-decide — 裁定297-1（2026-09-25・裁定295-1）: 今日タブ「未決裁 n 件」＝cast の打刻修正申請の承認／却下（理由必須）の係留。
 *   npm run verify:nox-punch-decide（env: SUPABASE_DB_URL・seed:f0 済み）。f0 72 段目。DB は 1 トランザクション内（fixtures-pgtx）→ ROLLBACK＝残留 0。
 *
 *  (1) 純関数: pendingOf（pending だけ・申請日時の古い順）／decideArgsOf（承認・却下とも理由必須・201 字・id なし）／requestedLabelOf（JST 'M/D HH:MM'）
 *  (2) DB: cast 本人の申請 → pending 1（manager の RLS で見える）→ cast は decide 'forbidden'・理由なしの却下は 'reason required'・理由つき承認 → pending 0・decision approved・decide_reason・punches に反映
 *      ／却下（理由つき）→ rejected・decide_reason・punches 不変／anon BLOCKED
 *  (3) 配線（逐語 grep）: shift-board＝or フィルタ 1 クエリ（fetch +0）・pendingOf・isManagerUp で囲う・PunchDecideModal（承認／却下）／modal＝decideArgsOf→punch_correction_decide／
 *      /mine（cast 導線）に punch_correction_decide なし
 *  逆テスト（手動・各 1 回）: pendingOf の filter を外す→pd(1-1) 赤／decideArgsOf の空理由チェックを外す→pd(1-2) 赤・戻して緑。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import fs from "node:fs";
import { loadEnvOrExit } from "./fixtures-f0";
import { pgTx } from "./fixtures-pgtx";
import { decideArgsOf, pendingOf, requestedLabelOf } from "../lib/nox/shift/punch-correction";

const env = loadEnvOrExit(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_DB_URL"]);
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }

async function main() {
  // (1) 純関数
  const rows = [
    { id: "b", decision: "pending", requested_at: "2026-09-25T02:00:00Z" },
    { id: "a", decision: "pending", requested_at: "2026-09-25T01:00:00Z" },
    { id: "c", decision: "approved", requested_at: "2026-09-25T00:00:00Z" },
    { id: "d", decision: "rejected", requested_at: "2026-09-25T00:30:00Z" },
  ];
  check("pd(1-1) pendingOf: pending だけ・申請日時の古い順（a→b）", JSON.stringify(pendingOf(rows).map((r) => r.id)) === JSON.stringify(["a", "b"]), JSON.stringify(pendingOf(rows).map((r) => r.id)));
  const ok1 = decideArgsOf({ id: "x", approve: true, reason: "  打刻機の不調 " });
  const ng1 = decideArgsOf({ id: "x", approve: true, reason: "   " }), ng2 = decideArgsOf({ id: "x", approve: false, reason: "" }), ng3 = decideArgsOf({ id: "x", approve: false, reason: "あ".repeat(201) }), ng4 = decideArgsOf({ id: "", approve: true, reason: "a" });
  check("pd(1-2) decideArgsOf: 理由 trim・p_approve・承認でも却下でも空理由はエラー・201 字・id なし", ok1.ok && ok1.args.p_reason === "打刻機の不調" && ok1.args.p_approve === true && ok1.args.p_id === "x" && !ng1.ok && !ng2.ok && !ng3.ok && !ng4.ok);
  check("pd(1-3) requestedLabelOf: JST 'M/D HH:MM'（02:00Z→9/25 11:00）・不正はそのまま", requestedLabelOf("2026-09-25T02:00:00Z") === "9/25 11:00" && requestedLabelOf("x") === "x");

  // (3) 配線
  const sb = fs.readFileSync("app/(manage)/shift/shift-board.tsx", "utf8");
  const md = fs.readFileSync("components/nox/punch-decide-modal.tsx", "utf8");
  const mine = fs.readFileSync("app/mine/page.tsx", "utf8") + fs.readFileSync("app/mine/punch-correction-list.tsx", "utf8");
  check("pd(3-1) shift-board: or フィルタ 1 クエリ（fetch +0）・pendingOf／disputedOf の分岐・isManagerUp && pending.length・承認／却下→setDecide・PunchDecideModal を描く",
    sb.includes('.or("decision.eq.pending,and(decision.eq.approved,ack.eq.disputed)")') && sb.includes("setPending(pendingOf(crows))") && sb.includes("isManagerUp && pending.length > 0") && sb.includes("setDecideRow({ row: r, approve: true })") && sb.includes("setDecideRow({ row: r, approve: false })") && sb.includes("<PunchDecideModal") && (sb.match(/from\("punch_corrections"\)/g) || []).length === 1);
  check("pd(3-2) modal: decideArgsOf→punch_correction_decide・理由空は送れない（disabled）・Message・prompt 不使用", md.includes('supabase.rpc("punch_correction_decide", a.args)') && md.includes("decideArgsOf(") && md.includes("reason.trim().length === 0") && md.includes("<Message kind=\"error\">") && !md.includes("prompt("));
  check("pd(3-3) cast 導線なし: /mine に punch_correction_decide なし・shift-board の一覧は isManagerUp の中", !mine.includes("punch_correction_decide") && !sb.includes('rpc("punch_correction_decide"'));

  // (2) DB
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const T = pgTx(db);
  const { one, errOf, as, uidOf } = T;
  try {
    const A1 = await T.storeA1();
    const mgr = await uidOf("managerA1"), castU = await uidOf("castA1a"), castU2 = await uidOf("castA1b");
    const castId = await T.castOf(A1.id, castU.id);
    check("pd(0-1) fixture: A1／manager-a1／cast-a1a（casts 行）／cast-a1b", !!A1 && !!mgr && !!castU && !!castId && !!castU2);
    if (!A1 || !mgr || !castU || !castId || !castU2) throw new Error("fixture 解決失敗");
    const snapSql = `select (select count(*)::int from public.punch_corrections where store_id=$1) pc, (select count(*)::int from public.punches where store_id=$1) pu, (select count(*)::int from public.audit_logs where org_id=$2) au`;
    const before = JSON.stringify(await one(snapSql, [A1.id, A1.org_id]));
    await db.query("begin");
    try {
      const biz = (await one<{ d: string }>(`select public.biz_date_of($1, now())::text d`, [A1.id])).d;
      const afterAt = biz + "T20:00:00+09:00";
      const req = await as(castU, `select public.punch_correction_request($1, null, $2::date, 'in', $3::timestamptz, '打刻忘れ') id`, [castId, biz, afterAt]);
      check("pd(2-1) cast 本人の申請（新規 in・理由つき）→ pending 1 行", req.ok, errOf(req));
      const id = req.ok ? (req.rows[0].id as string) : "00000000-0000-0000-0000-000000000000";
      const seen = await as(mgr, `select decision, requested_at from public.punch_corrections where id = $1`, [id]);
      check("pd(2-2) manager の RLS で pending が見える（pendingOf の入力）", seen.ok && seen.rows.length === 1 && pendingOf(seen.rows as { decision: string; requested_at: string }[]).length === 1, errOf(seen));
      const c1 = await as(castU, `select public.punch_correction_decide($1, true, '自分で')`, [id]);
      const c2 = await as(castU2, `select public.punch_correction_decide($1, true, '他人')`, [id]);
      check("pd(2-3) cast（本人・他人）は decide 'forbidden'", !c1.ok && c1.err.includes("forbidden") && !c2.ok && c2.err.includes("forbidden"), `${errOf(c1)} / ${errOf(c2)}`);
      const nr = await as(mgr, `select public.punch_correction_decide($1, false, '')`, [id]);
      const nr2 = await as(mgr, `select public.punch_correction_decide($1, false, null)`, [id]);
      check("pd(2-4) 理由なしの却下は 'reason required'（空・null）", !nr.ok && nr.err.includes("reason required") && !nr2.ok && nr2.err.includes("reason required"), `${errOf(nr)} / ${errOf(nr2)}`);
      const puBefore = (await one<{ n: number }>(`select count(*)::int n from public.punches where cast_id = $1`, [castId])).n;
      const ap = await as(mgr, `select public.punch_correction_decide($1, true, '打刻機の不調を確認')`, [id]);
      const row = await one<{ decision: string; decide_reason: string | null; punch_id: string | null }>(`select decision, decide_reason, punch_id from public.punch_corrections where id = $1`, [id]);
      const puAfter = (await one<{ n: number }>(`select count(*)::int n from public.punches where cast_id = $1`, [castId])).n;
      const pend = (await one<{ n: number }>(`select count(*)::int n from public.punch_corrections where store_id = $1 and decision = 'pending'`, [A1.id])).n;
      check("pd(2-5) 理由つき承認 → approved・decide_reason・punches +1（punch_id が付く）・pending 0", ap.ok && row.decision === "approved" && row.decide_reason === "打刻機の不調を確認" && row.punch_id !== null && puAfter === puBefore + 1 && pend === 0, `${errOf(ap)} ${JSON.stringify(row)} pu ${puBefore}→${puAfter} pending=${pend}`);
      const req2 = await as(castU, `select public.punch_correction_request($1, null, $2::date, 'out', $3::timestamptz, '退勤の打刻忘れ') id`, [castId, biz, biz + "T23:00:00+09:00"]);
      const id2 = req2.ok ? (req2.rows[0].id as string) : "00000000-0000-0000-0000-000000000000";
      const rj = await as(mgr, `select public.punch_correction_decide($1, false, 'シフト記録と一致しないため')`, [id2]);
      const row2 = await one<{ decision: string; decide_reason: string | null }>(`select decision, decide_reason from public.punch_corrections where id = $1`, [id2]);
      const puAfter2 = (await one<{ n: number }>(`select count(*)::int n from public.punches where cast_id = $1`, [castId])).n;
      check("pd(2-6) 理由つき却下 → rejected・decide_reason・punches 不変", req2.ok && rj.ok && row2.decision === "rejected" && row2.decide_reason === "シフト記録と一致しないため" && puAfter2 === puAfter, `${errOf(req2)} ${errOf(rj)} ${JSON.stringify(row2)}`);
      const again = await as(mgr, `select public.punch_correction_decide($1, true, 'もう一度')`, [id]);
      check("pd(2-7) 決裁済みの再決裁は 'not pending'", !again.ok && again.err.includes("not pending"), errOf(again));
    } finally {
      await T.asPg();
      await db.query("rollback");
    }
    const after = JSON.stringify(await one(snapSql, [A1.id, A1.org_id]));
    check("pd(0-2) ROLLBACK 後の残留＝実行前と同値（punch_corrections／punches／audit）", after === before, `${before} → ${after}`);
  } finally {
    await db.end().catch(() => undefined);
  }
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await anon.rpc("punch_correction_decide", { p_id: null, p_approve: null, p_reason: null });
  check("pd(2-8) anon punch_correction_decide BLOCKED", !!error?.message?.includes("permission denied for function"), error?.message ?? "(no error)");

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-punch-decide ALL PASS (${pass} assertions)`);
  console.log("決裁 UI(裁定297-1): pendingOf／decideArgsOf／requestedLabelOf / cast 申請→manager 承認（punches +1）／却下（理由必須）／forbidden／not pending／anon / 配線＝or 1 クエリ・isManagerUp・モーダル・/mine に導線なし");
}

main().catch((e) => { console.error(e); process.exit(1); });
