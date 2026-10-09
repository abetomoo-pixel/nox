/*
 * verify:nox-x13d2 — 便 X-13d-2a（2026-10-09）: 裁定340（支払記録 UI）／X-13-25（閉じる中央）／X-13-26（前借り 2 行）／X-13-27（未来日は不整合に数えない）／デモ前借り payload／0167 起草の pin。
 *   npm run verify:nox-x13d2。f0 98 段目（DB 不触・env 不要＝純関数＋逐語 grep）。
 *  pay(1)   pay-record 純関数: 既定値（残額・今日・現金）・検証（0／超過／日付／メモ 200）・一括計画（残額 > 0 だけ）・applyPaid で未払合計が減る・結果文
 *  pay(2)   payroll-board: ①状態列の「未払／一部」が button→PayDialog ②内訳の「支払を記録」③未払カード「未払の全員を一括記録」→BulkPayDialog・既存 route /api/payment/record のみ・案内文
 *  close(1) X-13-25: 「明細プレビューを閉じる」の行＝共通 .nox-actions（中央）
 *  adv(1)   X-13-26: 前借り列＝advCell 2 行（天引き／残・0 は —）
 *  anom(1)  X-13-27: anomalyFlagsOf＝未来日は counted/missingOut とも false・今日までは従来どおり／collect.ts が todayBiz（store の cutoff）で呼ぶ
 *  demo(1)  payload 6 店に advances 1 件（代表キャスト・$m:-1 d:15・open・ADVANCES の額）
 *  mig(1)   0167 起草: casts.shift_request_mode（null 可・CHECK は null 明示）＋set_cast_shift_request_mode（規則A形・4 ロール grant 形）・単一 tx
 */
import fs from "node:fs";
import { anomalyFlagsOf } from "../lib/nox/payroll/anomaly";
import { applyPaidOf, bulkPlanOf, bulkSummaryOf, payDialogDefaultsOf, payDialogErrorOf, remainingOf, unpaidTotalOf } from "../lib/nox/payroll/pay-record";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

// pay(1)
{
  const l = { castId: "c1", castName: "さおり", net: 120000, paid: 20000 };
  const d = payDialogDefaultsOf(l, "2026-10-09");
  check("pay(1-1) 既定値＝残額 100,000・今日・現金・メモ空", d.amount === 100000 && d.paidAt === "2026-10-09" && d.method === "cash" && d.note === "" && remainingOf(l) === 100000);
  check("pay(1-2) 検証: 0／負／小数は NG・残額超は NG・日付形式 NG・メモ 201 字 NG・部分支払 OK", !!payDialogErrorOf({ ...d, amount: 0 }, l) && !!payDialogErrorOf({ ...d, amount: 100001 }, l) && !!payDialogErrorOf({ ...d, amount: 1.5 }, l) && !!payDialogErrorOf({ ...d, paidAt: "2026/10/09" }, l) && !!payDialogErrorOf({ ...d, note: "x".repeat(201) }, l) && payDialogErrorOf({ ...d, amount: 30000 }, l) === null);
  const lines = [l, { castId: "c2", castName: "まり", net: 80000, paid: 80000 }, { castId: "c3", castName: "あや", net: 50000, paid: 0 }];
  const plan = bulkPlanOf(lines);
  check("pay(1-3) 一括計画＝残額 > 0 の 2 人（c1 100,000・c3 50,000）・合計 150,000・支払済の c2 は外す", plan.items.length === 2 && plan.total === 150000 && plan.items.every((x) => x.castId !== "c2"));
  const m0 = new Map(lines.map((x) => [x.castId, { net: x.net, paid: x.paid }]));
  const m1 = applyPaidOf(m0, "c1", 100000);
  check("pay(1-4) 1 件記録→その人は残額 0（支払済）・未払合計 150,000→50,000・元の map は不変", remainingOf(m1.get("c1")!) === 0 && unpaidTotalOf(m0) === 150000 && unpaidTotalOf(m1) === 50000 && m0.get("c1")!.paid === 20000);
  const sum = bulkSummaryOf([{ castId: "c1", castName: "さおり", amount: 1, ok: true }, { castId: "c3", castName: "あや", amount: 1, ok: false, error: "x" }]);
  check("pay(1-5) 結果文＝成功 1／失敗 1（名前を列挙・行の「未払」から記録し直す案内）", sum.okN === 1 && sum.ngN === 1 && sum.text.includes("あや") && sum.text.includes("未払"));
}
// pay(2) / close / adv
{
  const pb = src("app/(manage)/payroll/payroll-board.tsx");
  check("pay(2-1) ①状態列: 未払／一部は button（stopPropagation・setPayDlg）・支払済／未確定は文字のまま", pb.includes('const payable = runInfo?.status === "finalized" && !!cp && cell.tone !== "ok" && cell.tone !== "mute";') && pb.includes('onClick={(e) => { e.stopPropagation(); setPayDlg({ castId: r.castId, castName: r.castName, net: cp!.net, paid: cp!.paid }); }}'));
  check("pay(2-2) ②内訳パネル: 手取りの下に「支払を記録」（確定済み∧残額 > 0）", pb.includes(">支払を記録</button>) /* ★裁定340-② */"));
  check("pay(2-3) ③未払カード: 「未払の全員を一括記録」→BulkPayDialog（1 人ずつ recordPayment・結果を返す）・新規 RPC なし（/api/payment/record のみ）", pb.includes(">未払の全員を一括記録</button>") && pb.includes("<BulkPayDialog lines={payLinesOf()}") && pb.includes('fetch("/api/payment/record"') && !/supabase\.rpc\("payment_record/.test(pb));
  check("pay(2-4) ダイアログ＝PayDialog（支払日・方法 PAYMENT_METHODS・MoneyInput・メモ・検証 payDialogErrorOf）・成功で loadRun・「支払状況を表示」（PaymentPanel）は残す", pb.includes("function PayDialog({ line, onClose, onSubmit }") && pb.includes("PAYMENT_METHODS.map(([m, l]) => <option key={m} value={m}>{l}</option>)") && pb.includes("await loadRun(); } return r; }} />") && pb.includes("<PaymentPanel"));
  check("pay(2-5) 案内文＝「次: 行の「未払」を押して支払を記録」・未払カードの小字も同じ・旧文（下の「支払・明細」で支払）は無い", pb.includes('"次: 行の「未払」を押して支払を記録"') && pb.includes('"行の「未払」を押して支払を記録"') && !pb.includes("で支払いを記録") && !pb.includes("支払記録は下の「支払・明細」"));
  check("close(1-1) X-13-25: 「明細プレビューを閉じる」の行＝.nox-actions（中央・end なし）", pb.includes('<div className="nox-actions" style={{ marginTop: 10 }}>{/* ★X-13-25') && !pb.includes('className="nox-actions end"'));
  check("adv(1-1) X-13-26: 前借り列＝advCell（天引き／残の 2 行・0 は —）・売掛／送りは dedCell のまま", pb.includes('{advCell(r.advDeductTotal, r.advCarriedTotal, "fold")}') && pb.includes("function advCell(deduct?: number, carried?: number, cls?: string)") && pb.includes('>天引き </span>') && pb.includes('>残 </span>') && pb.includes('{dedCell(r.arDeductTotal, r.arCarriedTotal, "fold")}') && pb.includes('{dedCell(r.okuriDeductTotal, undefined, "fold")}'));
}
// anom(1)
{
  const today = "2026-10-09";
  const fut = anomalyFlagsOf({ bizDate: "2026-10-12", anomalies: [], rawOutType: "noout", finalType: "absent" }, today);
  const past = anomalyFlagsOf({ bizDate: "2026-10-05", anomalies: [], rawOutType: "noout", finalType: "ok" }, today);
  const todayNo = anomalyFlagsOf({ bizDate: "2026-10-09", anomalies: [], rawOutType: "noout", finalType: "late" }, today);
  const okDay = anomalyFlagsOf({ bizDate: "2026-10-05", anomalies: [], rawOutType: "ok", finalType: "ok" }, today);
  const inin = anomalyFlagsOf({ bizDate: "2026-10-05", anomalies: ["in_in"], rawOutType: "ok", finalType: "ok" }, today);
  const early = anomalyFlagsOf({ bizDate: "2026-10-05", anomalies: [], rawOutType: "early", finalType: "ok" }, today);
  check("anom(1-1) 未来日（10/12）の確定シフト＝counted／missingOut とも false（旧実装では noout で +1）", !fut.counted && !fut.missingOut);
  check("anom(1-2) 今日までの noout＝counted true・final ok／late なら missingOut true・absent（打刻なし）は missingOut false", past.counted && past.missingOut && todayNo.counted && todayNo.missingOut && anomalyFlagsOf({ bizDate: "2026-10-05", anomalies: [], rawOutType: "noout", finalType: "absent" }, today).missingOut === false);
  check("anom(1-3) in／out そろいは false・in_in／early は counted true（従来どおり）", !okDay.counted && inin.counted && early.counted && !early.missingOut);
  const co = src("lib/nox/payroll/collect.ts");
  check("anom(1-4) collect.ts: todayBiz＝bizDateOf(now, win.cutoffHm)・anomalyFlagsOf で数える（旧 outAnom 直書きは無い）", co.includes("const todayBiz = bizDateOf(new Date().toISOString(), win.cutoffHm);") && co.includes("const af = anomalyFlagsOf({ bizDate: d.bizDate, anomalies: d.anomalies, rawOutType: d.raw.out.type, finalType: d.final.type }, todayBiz);") && !co.includes("if (d.anomalies.length > 0 || outAnom) anomalyCount += 1;"));
}
// demo(1)
{
  const adv = JSON.parse(fs.readFileSync("scripts/demo/profiles.mjs", "utf8").match(/export const ADVANCES = (\{[^}]*\});/)![1].replace(/(\w+):/g, '"$1":')) as Record<string, number>;
  for (const code of ["muse", "luna", "noir", "ace", "lily", "nest"]) {
    const pl = JSON.parse(src(`docs/demo/payload/${code}.json`)) as { tables: Record<string, Record<string, unknown>[]> };
    const rows = pl.tables.advances ?? [];
    const casts = pl.tables.casts ?? [];
    const r = rows[0] as { amount?: number; status?: string; advanced_on?: { $m?: number; d?: number }; cast_id?: string; deduct_period?: unknown } | undefined;
    check(`demo(1-${code}) advances 1 件＝代表キャスト（casts に居る）・${adv[code]} 円・open・advanced_on {$m:-1,d:15}・deduct_period null`, rows.length === (adv[code] > 0 ? 1 : 0) && (!r || (r.amount === adv[code] && r.status === "open" && r.advanced_on?.$m === -1 && r.advanced_on?.d === 15 && r.deduct_period === null && casts.some((c) => c.id === r.cast_id))), JSON.stringify(r));
  }
}
// mig(1)
{
  const f = "supabase/migrations/0167_cast_shift_request_mode.sql";
  const m = fs.existsSync(f) ? src(f) : "";
  check("mig(1-1) 0167 起草: 単一 tx・casts.shift_request_mode text null＋CHECK（null 明示＝教訓100）・set_cast_shift_request_mode（billing locked・owner／manager 自店・audit）・grants", (m.match(/^begin;$/gm) ?? []).length === 1 && (m.match(/^commit;$/gm) ?? []).length === 1 && m.includes("add column if not exists shift_request_mode text") && m.includes("shift_request_mode is null or shift_request_mode in ('shift','off_only')") && m.includes("create or replace function public.set_cast_shift_request_mode(p_cast_id uuid, p_mode text)") && m.includes("billing locked") && m.includes("perform public.audit_log_write('set_cast_shift_request_mode'") && m.includes("revoke all on function public.set_cast_shift_request_mode(uuid, text) from public, anon;") && m.includes("grant execute on function public.set_cast_shift_request_mode(uuid, text) to authenticated;"));
}

if (fails.length) {
  console.error(`verify:nox-x13d2 FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-x13d2 OK (${pass} checks)`);
console.log("便 X-13d-2a: 裁定340 支払ダイアログ／一括・X-13-25 閉じる中央・X-13-26 前借り 2 行・X-13-27 未来日は不整合に数えない・デモ前借り・0167 起草");
