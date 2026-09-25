/*
 * verify:nox-advance-okuri — 裁定300（2026-09-25）: 前借り／送り実費の入口統一（共通部品・3 入口・既存 RPC・新 RPC 0）の係留。
 *   npm run verify:nox-advance-okuri（env: SUPABASE_DB_URL・seed:f0 済み）。f0 73 段目。DB は 1 トランザクション内（fixtures-pgtx）→ ROLLBACK＝残留 0。
 *
 *  (1) 純関数: issueBodyOf（キャスト必須・正の整数・日付形・メモ trim→null・endpoint と日付キーが kind で変わる）／issueDateDefaultOf（期に丸める）／okuriEnabledOf／issueErrJa
 *  (2) 配線（逐語 grep）: 共通部品が 2 route を issueBodyOf 経由で呼ぶ・picker・.nox-issue-row／3 入口（deduction-panel・casts-board・payroll-board）が同じ部品を import・
 *      deduction-panel の旧 IssueForm なし／payroll-board は readOnly={!adjEditable}（確定後は読取のみ）・castId 固定／casts-board は castId 固定・isManagerUp の中／
 *      route は adv_issue／transport_issue（不変）／cast 導線（/mine・kiosk）に部品なし／globals.css に .nox-issue-row と ≤899 の 1 列
 *  (3) DB: manager の adv_issue は通る（rollback）・cast は 'forbidden'・transport_issue は 'okuri not actual'（flat）か通る（actual）・anon BLOCKED
 *  逆テスト（手動・各 1 回）: issueBodyOf の amount 検査を外す→ao(1-2) 赤／deduction-panel の import を外す→ao(2-2) 赤・戻して緑。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import fs from "node:fs";
import { loadEnvOrExit } from "./fixtures-f0";
import { pgTx } from "./fixtures-pgtx";
import { ISSUE_ENDPOINT, issueBodyOf, issueDateDefaultOf, issueErrJa, okuriEnabledOf } from "../lib/nox/payroll/advance-okuri";

const env = loadEnvOrExit(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_DB_URL"]);
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }

async function main() {
  // (1) 純関数
  const a = issueBodyOf({ kind: "advance", storeId: "s", castId: "c", amount: "3,000", date: "2026-09-25", note: "  " });
  const tr = issueBodyOf({ kind: "transport", storeId: "s", castId: "c", amount: 1500, date: "2026-09-25", note: " 送迎 " });
  check("ao(1-1) issueBodyOf: advance＝/api/advance/issue・advancedOn・カンマ除去・空メモ null／transport＝/api/transport/issue・bizDate・メモ trim",
    a.ok && a.endpoint === ISSUE_ENDPOINT.advance && "advancedOn" in a.body && a.body.amount === 3000 && a.body.note === null
    && tr.ok && tr.endpoint === ISSUE_ENDPOINT.transport && "bizDate" in tr.body && tr.body.note === "送迎");
  const n1 = issueBodyOf({ kind: "advance", storeId: "s", castId: null, amount: 1, date: "2026-09-25", note: "" });
  const n2 = issueBodyOf({ kind: "advance", storeId: "s", castId: "c", amount: "0", date: "2026-09-25", note: "" });
  const n3 = issueBodyOf({ kind: "advance", storeId: "s", castId: "c", amount: "1.5", date: "2026-09-25", note: "" });
  const n4 = issueBodyOf({ kind: "advance", storeId: "s", castId: "c", amount: 1, date: "9/25", note: "" });
  const n5 = issueBodyOf({ kind: "advance", storeId: "", castId: "c", amount: 1, date: "2026-09-25", note: "" });
  check("ao(1-2) issueBodyOf の拒否: キャストなし／0／小数／日付形／店なし", !n1.ok && !n2.ok && !n3.ok && !n4.ok && !n5.ok);
  check("ao(1-3) issueDateDefaultOf: 期の中は今日・前は期初・後は期末・期なしは今日", issueDateDefaultOf("2026-09-25", "2026-09-01", "2026-09-30") === "2026-09-25" && issueDateDefaultOf("2026-10-02", "2026-09-01", "2026-09-30") === "2026-09-30" && issueDateDefaultOf("2026-08-30", "2026-09-01", "2026-09-30") === "2026-09-01" && issueDateDefaultOf("2026-09-25") === "2026-09-25");
  check("ao(1-4) okuriEnabledOf: actual／未指定＝true・flat＝false", okuriEnabledOf("actual") && okuriEnabledOf(undefined) && okuriEnabledOf(null) && !okuriEnabledOf("flat"));
  check("ao(1-5) issueErrJa: paid period／okuri not actual／forbidden／bad cast／不明は「処理できませんでした（コード: …）」", issueErrJa(409, "paid period").includes("支払済み") && issueErrJa(409, "okuri not actual").includes("実費") && issueErrJa(403, "forbidden").includes("権限") && issueErrJa(400, "bad cast").includes("キャスト") && issueErrJa(500, "xyz").includes("コード: xyz"));

  // (2) 配線
  const comp = fs.readFileSync("components/nox/advance-okuri-form.tsx", "utf8");
  const dp = fs.readFileSync("app/(manage)/master/deduction-panel.tsx", "utf8");
  const cb = fs.readFileSync("app/(manage)/casts/casts-board.tsx", "utf8");
  const pb = fs.readFileSync("app/(manage)/payroll/payroll-board.tsx", "utf8");
  const css = fs.readFileSync("app/globals.css", "utf8");
  const mine = fs.readFileSync("app/mine/page.tsx", "utf8");
  const kiosk = fs.readFileSync("app/kiosk-register/page.tsx", "utf8");
  const advR = fs.readFileSync("app/api/advance/issue/route.ts", "utf8"), trR = fs.readFileSync("app/api/transport/issue/route.ts", "utf8");
  check("ao(2-1) 共通部品: issueBodyOf 経由で fetch（endpoint は純関数が決める）・Picker・.nox-issue-row・readOnly は入口なし・Message", comp.includes("issueBodyOf({ kind, storeId") && comp.includes("fetch(b.endpoint") && comp.includes("<Picker dense") && comp.includes('"nox-issue-row" + (fixed ? " nox-issue-row--fixed" : "")') && comp.includes("if (readOnly)") && comp.includes("<Message kind={msg.kind}") && !comp.includes('"/api/advance/issue"'));
  check("ao(2-2) 3 入口が同じ部品を import: deduction-panel（旧 IssueForm なし）・casts-board（castId 固定）・payroll-board（castId 固定・readOnly={!adjEditable}）", dp.includes('from "@/components/nox/advance-okuri-form"') && !dp.includes("function IssueForm") && cb.includes('from "@/components/nox/advance-okuri-form"') && cb.includes("castId={selCast.id}") && (cb.match(/<AdvanceOkuriForm/g) || []).length === 1 && pb.includes('from "@/components/nox/advance-okuri-form"') && (pb.match(/<AdvanceOkuriForm/g) || []).length === 1 && pb.includes("castId={r.castId}") && pb.includes("readOnly={!adjEditable}"));
  check("ao(2-3) route は既存 RPC のまま（adv_issue／transport_issue）・新 RPC 0", advR.includes('supabase.rpc("adv_issue"') && trR.includes('supabase.rpc("transport_issue"'));
  const cpg = fs.readFileSync("app/(manage)/casts/page.tsx", "utf8");
  check("ao(2-4) cast 導線なし（/mine・kiosk に部品なし）・casts-board は page.tsx の owner／manager ガードの中（他ロールは redirect）", !mine.includes("advance-okuri") && !kiosk.includes("advance-okuri") && cpg.includes('if (role !== "owner" && role !== "manager") redirect(') && cb.includes("<AdvanceOkuriForm"));
  check("ao(2-5) globals.css: .nox-issue-row＝既定 1 列（≤899）・≥900 で多列（M5 の型＝mobile-first）", /\.nox-issue-row \{ display: grid; grid-template-columns: 1fr;/.test(css) && /@media \(min-width: 900px\) \{ \.nox-issue-row \{ grid-template-columns: minmax/.test(css));

  // (3) DB
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const T = pgTx(db);
  const { one, errOf, as, uidOf } = T;
  try {
    const A1 = await T.storeA1();
    const mgr = await uidOf("managerA1"), castU = await uidOf("castA1a");
    const castId = await T.castOf(A1.id, castU.id);
    check("ao(0-1) fixture: A1／manager-a1／cast-a1a", !!A1 && !!mgr && !!castU && !!castId);
    if (!A1 || !mgr || !castU || !castId) throw new Error("fixture 解決失敗");
    const snapSql = `select (select count(*)::int from public.advances where store_id=$1) ad, (select count(*)::int from public.transport where store_id=$1) tr, (select count(*)::int from public.audit_logs where org_id=$2) au`;
    const before = JSON.stringify(await one(snapSql, [A1.id, A1.org_id]));
    await db.query("begin");
    try {
      const ok = await as(mgr, `select public.adv_issue($1, $2, 3000, current_date, 'verify 300') id`, [A1.id, castId]);
      check("ao(3-1) manager の adv_issue（同じ RPC＝3 入口共通）→ uuid・advances +1", ok.ok && typeof ok.rows[0].id === "string" && (await one<{ n: number }>(`select count(*)::int n from public.advances where store_id=$1`, [A1.id])).n > JSON.parse(before).ad, errOf(ok));
      const forb = await as(castU, `select public.adv_issue($1, $2, 3000, current_date, 'x')`, [A1.id, castId]);
      check("ao(3-2) cast は adv_issue 'forbidden'（導線が無くても RPC が止める）", !forb.ok && forb.err.includes("forbidden"), errOf(forb));
      const trx = await as(mgr, `select public.transport_issue($1, $2, 1500, current_date, 'verify 300')`, [A1.id, castId]);
      check("ao(3-3) manager の transport_issue＝店の送り方式が flat なら 'okuri not actual'・actual なら通る", trx.ok || trx.err.includes("okuri not actual"), errOf(trx));
    } finally {
      await T.asPg();
      await db.query("rollback");
    }
    const after = JSON.stringify(await one(snapSql, [A1.id, A1.org_id]));
    check("ao(0-2) ROLLBACK 後の残留＝実行前と同値（advances／transport／audit）", after === before, `${before} → ${after}`);
  } finally {
    await db.end().catch(() => undefined);
  }
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  for (const [fn, args] of [["adv_issue", { p_store_id: null, p_cast_id: null, p_amount: null, p_advanced_on: null, p_note: null }], ["transport_issue", { p_store_id: null, p_cast_id: null, p_amount: null, p_biz_date: null, p_note: null }]] as const) {
    const { error } = await anon.rpc(fn, args as Record<string, unknown>);
    check(`ao(3-4) anon ${fn} BLOCKED`, !!error?.message?.includes("permission denied for function"), error?.message ?? "(no error)");
  }

  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-advance-okuri ALL PASS (${pass} assertions)`);
  console.log("前借り／送り実費の入口統一(裁定300): issueBodyOf／issueDateDefaultOf／okuriEnabledOf／issueErrJa / 共通部品と 3 入口の配線・旧 IssueForm なし・readOnly・cast 導線なし・CSS / adv_issue（manager 可・cast forbidden）・transport_issue・anon");
}

main().catch((e) => { console.error(e); process.exit(1); });
