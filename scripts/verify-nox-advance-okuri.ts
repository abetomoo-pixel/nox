/*
 * verify:nox-advance-okuri — 裁定300（2026-09-25）: 前借り／送り実費の入口統一（共通部品・3 入口・既存 RPC・新 RPC 0）の係留。
 *   npm run verify:nox-advance-okuri（env: SUPABASE_DB_URL・seed:f0 済み）。f0 73 段目（追補 2026-09-25 便 D）。DB は 1 トランザクション内（fixtures-pgtx）→ ROLLBACK＝残留 0。
 *
 *  (1) 純関数: issueBodyOf（キャスト必須・正の整数・日付形・メモ trim→null・endpoint と日付キーが kind で変わる）／issueDateDefaultOf（期に丸める）／okuriEnabledOf／issueErrJa
 *  (2) 配線（逐語 grep）: 共通部品が 2 route を issueBodyOf 経由で呼ぶ・picker・.nox-issue-row／3 入口（deduction-panel・casts-board・payroll-board）が同じ部品を import・
 *      deduction-panel の旧 IssueForm なし／payroll-board は readOnly={!adjEditable}（確定後は読取のみ）・castId 固定／casts-board は castId 固定・isManagerUp の中／
 *      route は adv_issue／transport_issue（不変）／cast 導線（/mine・kiosk）に部品なし／globals.css に .nox-issue-row と ≤899 の 1 列
 *  (3) DB: manager の adv_issue は通る（rollback）・cast は 'forbidden'・transport_issue は 'okuri not actual'（flat）か通る（actual）・anon BLOCKED
 *  (4) ★裁定302／304（2026-09-25・mig0157）一括発行（マスタ「控除・送り」のみ）: 純関数 candidatesOf（出勤者が上・ja 昇順・プリフィル）／checkAttended／uncheckAll／bulkSummaryOf／
 *      bulkBodyOf（チェック 0・金額・日付・idemKey・同 cast 重複＝「同じキャストが重複しています」）／bulkErrJa（'duplicate cast' 和文）／issuedRowsOf・
 *      配線: deduction-panel は issue-bulk-form（1 人型は import しない）・casts-board／payroll-board は 1 人型のまま・route 2 本が bulk RPC・部品に当日一覧（取消は既存 route）・cast 導線なし
 *  逆テスト（手動・各 1 回）: issueBodyOf の amount 検査を外す→ao(1-2) 赤／bulkBodyOf の重複判定を外す→ao(4-3) 赤／deduction-panel の import を外す→ao(2-2) 赤・戻して緑。
 */
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import fs from "node:fs";
import { loadEnvOrExit } from "./fixtures-f0";
import { pgTx } from "./fixtures-pgtx";
import { ISSUE_ENDPOINT, issueBodyOf, issueDateDefaultOf, issueErrJa, okuriEnabledOf } from "../lib/nox/payroll/advance-okuri";
import { BULK_ENDPOINT, bulkBodyOf, bulkErrJa, bulkSummaryOf, bulkSuccessTextOf, candidatesOf, checkAttended, issuedRowsOf, uncheckAll } from "../lib/nox/payroll/issue-bulk"; // ★裁定302／304

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
  check("ao(2-1) 共通部品: issueBodyOf 経由で fetch（endpoint は純関数が決める）・Picker・.nox-issue-row・readOnly は入口なし・Message", comp.includes("issueBodyOf({ kind, storeId") && comp.includes("fetch(b.endpoint") && comp.includes("<Picker dense") && comp.includes('className="nox-issue-row"') && comp.includes("if (readOnly)") && comp.includes("<Message kind={msg.kind}") && !comp.includes('"/api/advance/issue"'));
  check("ao(2-2) 入口の部品: deduction-panel は一括型 issue-bulk-form（1 人型・旧 IssueForm なし＝302-1）・casts-board（castId 固定）・payroll-board（castId 固定・readOnly={!adjEditable}）", dp.includes('from "@/components/nox/issue-bulk-form"') && !dp.includes('from "@/components/nox/advance-okuri-form"') && !dp.includes("function IssueForm") && cb.includes('from "@/components/nox/advance-okuri-form"') && cb.includes("castId={selCast.id}") && (cb.match(/<AdvanceOkuriForm/g) || []).length === 1 && pb.includes('from "@/components/nox/advance-okuri-form"') && (pb.match(/<AdvanceOkuriForm/g) || []).length === 1 && pb.includes("castId={r.castId}") && pb.includes("readOnly={!adjEditable}"));
  check("ao(2-3) route は既存 RPC のまま（adv_issue／transport_issue）・新 RPC 0", advR.includes('supabase.rpc("adv_issue"') && trR.includes('supabase.rpc("transport_issue"'));
  const cpg = fs.readFileSync("app/(manage)/casts/page.tsx", "utf8");
  check("ao(2-4) cast 導線なし（/mine・kiosk に部品なし）・casts-board は page.tsx の owner／manager ガードの中（他ロールは redirect）", !mine.includes("advance-okuri") && !kiosk.includes("advance-okuri") && cpg.includes('if (role !== "owner" && role !== "manager") redirect(') && cb.includes("<AdvanceOkuriForm"));
  check("ao(2-5) globals.css: .nox-issue-row＝既定 1 列（≤899）・≥900 で多列（M5 の型＝mobile-first）", /\.nox-issue-row \{ display: grid; grid-template-columns: 1fr;/.test(css) && /@media \(min-width: 900px\) \{ \.nox-issue-row \{ grid-template-columns: 120px/.test(css));

  // (4) ★裁定302／304: 一括発行の純関数と配線
  const C = [{ id: "c", name: "うめ" }, { id: "a", name: "あい" }, { id: "b", name: "かな" }, { id: "d", name: "さき" }];
  const rows0 = candidatesOf(C, ["b", "d"], 1500);
  check("ao(4-1) candidatesOf: 出勤者（かな・さき）が上・他（あい・うめ）が下・各群 ja 昇順・プリフィル 1500・未チェック", rows0.map((r) => r.name).join(",") === "かな,さき,あい,うめ" && rows0.every((r) => !r.checked && r.amount === "1500") && rows0[0].attended && !rows0[2].attended && candidatesOf(C, [], 0)[0].amount === "");
  const rows1 = checkAttended(rows0);
  check("ao(4-2) checkAttended／uncheckAll／bulkSummaryOf: 出勤者 2 人だけチェック→「2 人・合計 ¥3,000」・全解除で 0", rows1.filter((r) => r.checked).length === 2 && bulkSummaryOf(rows1).label === "2 人・合計 ¥3,000" && bulkSummaryOf(uncheckAll(rows1)).n === 0);
  const K = "8f0d2b6e-1c2d-4e3f-9a8b-7c6d5e4f3a2b";
  const okB = bulkBodyOf({ kind: "advance", storeId: "s", date: "2026-09-25", note: "  ", rows: rows1, idemKey: K });
  const dupB = bulkBodyOf({ kind: "advance", storeId: "s", date: "2026-09-25", note: "", rows: [...rows1, { ...rows1[0] }], idemKey: K });
  const noneB = bulkBodyOf({ kind: "advance", storeId: "s", date: "2026-09-25", note: "", rows: rows0, idemKey: K });
  const badAmt = bulkBodyOf({ kind: "transport", storeId: "s", date: "2026-09-25", note: "", rows: rows1.map((r) => ({ ...r, amount: "0" })), idemKey: K });
  const badKey = bulkBodyOf({ kind: "advance", storeId: "s", date: "2026-09-25", note: "", rows: rows1, idemKey: "x" });
  check("ao(4-3) bulkBodyOf: チェック行だけ items（castId／amount）・endpoint は kind・メモ空→null・idemKey 同梱／重複 cast＝「同じキャストが重複しています」／0 人・金額 0・キー不正は拒否",
    okB.ok && okB.endpoint === BULK_ENDPOINT.advance && okB.body.items.length === 2 && okB.body.items.every((it) => it.amount === 1500) && okB.body.note === null && okB.body.idemKey === K
    && !dupB.ok && dupB.err === "同じキャストが重複しています" && !noneB.ok && !badAmt.ok && badAmt.err.includes("正の整数") && !badKey.ok);
  check("ao(4-4) bulkErrJa／bulkSuccessTextOf: 'duplicate cast'→和文・'bad items'／'bad idem'・単発の写像（paid period）を継承・成功文言に人数と合計", bulkErrJa(409, "duplicate cast") === "同じキャストが重複しています" && bulkErrJa(400, "bad items").includes("チェック") && bulkErrJa(400, "bad idem").includes("再送キー") && bulkErrJa(409, "paid period").includes("支払済み") && bulkSuccessTextOf("transport", 3, 4500, "2026-09-25") === "送り実費を 3 人・合計 ¥4,500 発行しました（2026-09-25）");
  check("ao(4-5) issuedRowsOf: advances→kind advance・transport→kind transport（id／cast／額／メモ／status を写す）", JSON.stringify(issuedRowsOf([{ id: "1", cast_id: "a", amount: 100, note: null, status: "open" }], [{ id: "2", cast_id: "b", amount: 200, note: "x", status: "cancelled" }]).map((r) => `${r.kind}:${r.id}:${r.castId}:${r.amount}:${r.status}`)) === JSON.stringify(["advance:1:a:100:open", "transport:2:b:200:cancelled"]));
  const bulk = fs.readFileSync("components/nox/issue-bulk-form.tsx", "utf8");
  const advB = fs.readFileSync("app/api/advance/issue-bulk/route.ts", "utf8"), trB = fs.readFileSync("app/api/transport/issue-bulk/route.ts", "utf8");
  check("ao(4-6) 配線: 一括部品は bulkBodyOf 経由で fetch・SegSelect（種別）・出勤者チェック／全解除・当日一覧（advances／transport・取消は既存 cancel route）・Message／route 2 本が bulk RPC（adv_issue_bulk／transport_issue_bulk・p_items／p_idem_key）",
    bulk.includes("bulkBodyOf({ kind, storeId, date, note, rows, idemKey })") && bulk.includes("fetch(b.endpoint") && bulk.includes("checkAttended(") && bulk.includes("uncheckAll(") && bulk.includes('from("advances")') && bulk.includes('from("transport")') && bulk.includes('from("attendance")') && bulk.includes("/api/advance/cancel") && bulk.includes("/api/transport/cancel") && bulk.includes("<Message") && !bulk.includes("<Picker")
    && advB.includes('supabase.rpc("adv_issue_bulk", { p_store_id: storeId, p_items: pItems, p_idem_key: idemKey })') && trB.includes('supabase.rpc("transport_issue_bulk", { p_store_id: storeId, p_items: pItems, p_idem_key: idemKey })'));
  check("ao(4-8) ★306-12 casts 詳細の「前借り／送り実費」節は「基本」タブ（次回シフトの下・機微情報注記の上）・「待遇・バック」タブには無い", (() => { const b = cb.indexOf('dtab === "basic"'), c = cb.indexOf('dtab === "comp"'), a = cb.indexOf("<AdvanceOkuriForm"); const ns = cb.indexOf("次回シフト</span>"), lock = cb.indexOf("★機微情報の分離を明示"); return a > b && a < c && a > ns && a < lock && (cb.match(/<AdvanceOkuriForm/g) || []).length === 1; })());
  check("ao(4-7) 1 人型は casts-board／payroll-board のまま（castId 固定）・一括部品は cast 導線（/mine・kiosk）に無い", cb.includes('from "@/components/nox/advance-okuri-form"') && pb.includes('from "@/components/nox/advance-okuri-form"') && !cb.includes("issue-bulk-form") && !pb.includes("issue-bulk-form") && !mine.includes("issue-bulk") && !kiosk.includes("issue-bulk"));

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
