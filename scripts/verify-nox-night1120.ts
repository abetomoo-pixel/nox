/*
 * verify:nox-night1120 — 夜便 2026-11-20（相談役 N1〜N3・Agoora 18:08 の決定）。DB 不触・env 不要。npm run verify:nox-night1120。
 *  n1 締めの前の「今日の送り」の窓（旗 MIG_0201V_APPLIED の後ろ）＝記録できる人は今のとおり・締めの許可だけのスタッフは金額の欄なしで「記録しないで締める」・一覧を読めない人（キャスト）は「このまま締める」・ほかのエラーは止める。
 *  n2 待遇プラン › 報酬の軸＝押した瞬間に保存しない（下書き→「保存」）・確かめの窓は報酬率に入る／出るときだけ・軸に合う段の欄を主に・違う種類は行があるときだけ注記・店の軸を出す・札「スライドの判定基準」。
 *  n3 打刻の設定＝Wi-Fi の登録・外すの後は Wi-Fi の一覧だけを読み直す（保存していない判定などを消さない）・「まだ保存していません」。
 */
import fs from "node:fs";
import { MIG_0201V_APPLIED, mig0201vOn } from "../lib/nox/rules-0175/flag";
import { okuriCanRecordOf, okuriNoRecordLineOf, okuriWindowModeOf, OKURI_NO_READ_LINE } from "../lib/nox/report/close-guard";
import { PLAN_AXIS_CONFIRM_TEXT, planAxisNeedsConfirmOf, planRewardAxisPatchOf, SLIDE_ALSO_USED_NOTE, slideFieldsOf, STORE_AXIS_SHORT } from "../lib/nox/rules-0175/settings";
import { slideBasisPillOf } from "../lib/nox/payroll/slide";
let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
const rb = fs.readFileSync("app/(manage)/report/report-board.tsx", "utf8");
const pe = fs.readFileSync("app/(manage)/master/cast-comp/plan/plan-editor.tsx", "utf8");
const pr = fs.readFileSync("app/(manage)/master/punch-rules-panel.tsx", "utf8");

// ── n1 ──
check("n1(1) 旗 MIG_0201V_APPLIED＝true（11/20 18:20:51 適用）", MIG_0201V_APPLIED === true && mig0201vOn() === true);
const m = (flagOn: boolean, errMsg: string | null, canRecord: boolean) => okuriWindowModeOf({ flagOn, errMsg, canRecord });
check("n1(2) 出し分け＝記録できる→record・できない→noRecord・forbidden→noRead・ほかのエラー→error",
  m(true, null, true) === "record" && m(true, null, false) === "noRecord" && m(true, "forbidden", false) === "noRead" && m(true, "fetch failed", true) === "error" && m(true, "bad date", false) === "error");
check("n1(3) 旗 OFF は今のまま（forbidden も止める・記録できなくても record の形）", m(false, "forbidden", false) === "error" && m(false, null, false) === "record");
check("n1(4) 記録できる人＝店長以上・シフトの許可があるスタッフ（0201u）",
  okuriCanRecordOf({ isManagerUp: true, staffCanShift: false, mig0201uOn: true }) && okuriCanRecordOf({ isManagerUp: false, staffCanShift: true, mig0201uOn: true })
  && !okuriCanRecordOf({ isManagerUp: false, staffCanShift: false, mig0201uOn: true }) && !okuriCanRecordOf({ isManagerUp: false, staffCanShift: true, mig0201uOn: false }));
check("n1(5) 文＝指示のとおり", okuriNoRecordLineOf(3) === "未記録の送りが 3 件あります。送りを記録できるのは、オーナー・店長・シフトの許可があるスタッフです。"
  && OKURI_NO_READ_LINE === "送りの一覧を見る許可がありません。未記録の送りが残っていないか、店長に確かめてください。");
check("n1(6) 配線＝シフトの許可を読む・noRead は窓・ほかのエラーは今のまま止める・記録できない人は金額の欄を出さず「記録しないで締める」・読めない人は「このまま締める」",
  rb.includes('supabase.rpc("auth_staff_can_shift")') && rb.includes('if (mode === "noRead") { setOkuriNoRead(true); return; }')
  && rb.includes("if (eO) { setMsg(`送りの確認に失敗: ${rpcErrJaCommon(eO.message)}`); return; }")
  && rb.includes("{okuriCanRecord && okuriRows.map((r) => (") && rb.includes(">記録しないで締める</button>") && rb.includes(">このまま締める</button>")
  && rb.includes("data-okuri-noread=\"1\"") && rb.includes("{okuriNoRecordLineOf(okuriRows.length)}"));
check("n1(7) 締めは closeDayNow(force)＝⑧B の強行の確かめの後の force をそのまま（締めの判定と RPC は不変）",
  (rb.match(/void closeDayNow\(force\);/g) ?? []).length === 2 && rb.includes('supabase.rpc("daily_report_close", {'));

// ── n2 ──
check("n2(1) 確かめは報酬率に入る／出るときだけ（売上⇔ポイントでは出さない）",
  planAxisNeedsConfirmOf("sales", "pay_rate") && planAxisNeedsConfirmOf("pay_rate", "pts") && !planAxisNeedsConfirmOf("sales", "pts") && !planAxisNeedsConfirmOf("pts", "sales") && !planAxisNeedsConfirmOf("pay_rate", "pay_rate")
  && PLAN_AXIS_CONFIRM_TEXT === "給与の計算が変わります。報酬の軸を保存しますか");
check("n2(2) ラジオは下書き（押した瞬間に保存しない）・「まだ保存していません」・保存とやめる・保存の中身は今と同じ（comp_plan_ext_set＋planRewardAxisPatchOf）",
  pe.includes("onChange={() => setAxisDraft(v === curKey ? null : v)}") && !/name="plan-reward-axis"[^>]*onChange=\{\(\) => void \(async/.test(pe)
  && pe.includes('data-plan-axis-unsaved="1"') && pe.includes(">まだ保存していません</span>") && pe.includes('data-plan-axis-save="1"') && pe.includes('data-plan-axis-cancel="1"')
  && pe.includes('supabase.rpc("comp_plan_ext_set", { p_plan_id: draft.id, p_patch: planRewardAxisPatchOf(axisDraft === "store" ? null : axisDraft) })')
  && pe.includes("planAxisNeedsConfirmOf(effOf(curKey), effOf(axisDraft!)) && !window.confirm(PLAN_AXIS_CONFIRM_TEXT)")
  && JSON.stringify(planRewardAxisPatchOf("pts")) === JSON.stringify({ reward_axis: "pt" }) && JSON.stringify(planRewardAxisPatchOf(null)) === JSON.stringify({ reward_axis: null }));
check("n2(3) 「店の軸に従う」の横に今の店の軸", pe.includes("（今は{STORE_AXIS_SHORT[storeAxis]}）") && STORE_AXIS_SHORT.sales === "売上" && STORE_AXIS_SHORT.pts === "ポイント");
const r1 = [{ at: 300000, wage: 3000 }], r0: { at: number; wage: number }[] = [];
const sf = (axis: "sales" | "pts" | "pay_rate", so: boolean, po: boolean, s: typeof r1, p: typeof r1) => JSON.stringify(slideFieldsOf({ axis, salesOn: so, pointOn: po, sales: s, points: p }));
check("n2(4) 軸＝売上：売上の欄が主・pt に行があれば注記つき・無ければ出さない",
  sf("sales", true, true, r1, r0) === JSON.stringify([{ kind: "sales", note: null }]) && sf("sales", true, true, r1, r1) === JSON.stringify([{ kind: "sales", note: null }, { kind: "pts", note: SLIDE_ALSO_USED_NOTE }]));
check("n2(5) 軸＝ポイント：pt の欄が先・売上に行があれば注記つき",
  sf("pts", true, true, r1, r1) === JSON.stringify([{ kind: "pts", note: null }, { kind: "sales", note: SLIDE_ALSO_USED_NOTE }]) && sf("pts", true, true, r0, r1) === JSON.stringify([{ kind: "pts", note: null }]));
check("n2(6) 報酬率・旗 OFF の形＝今のまま両方（注記なし）・軸の節を使っていない店はもう一方を今のまま",
  sf("pay_rate", true, true, r0, r0) === JSON.stringify([{ kind: "sales", note: null }, { kind: "pts", note: null }]) && sf("pts", true, false, r0, r0) === JSON.stringify([{ kind: "sales", note: null }])
  && SLIDE_ALSO_USED_NOTE === "この段も計算に使われます（売上の段とポイントの段の高いほうを採用）" && pe.includes("data-slide-also-used={f.kind}"));
check("n2(7) 札は「スライドの判定基準」", slideBasisPillOf("hon_count", []) === "スライドの判定基準: 本指名の件数" && pe.includes('|| "スライドの判定基準: 売上・対象: 全員"}') && !pe.includes('|| "判定基準: 売上・対象: 全員"}'));

// ── n3 ──
check("n3(1) Wi-Fi の登録・外すの後は Wi-Fi の一覧だけを読み直す（保存の後は全部を読み直す）",
  pr.includes("を登録しました`); await loadIps();") && pr.includes("を外しました`); await loadIps();") && pr.includes('setMsg("打刻の設定を保存しました"); await load();')
  && pr.includes('.select("punch_allow_ip").eq("id", storeSel).single()') && (pr.match(/await load\(\);/g) ?? []).length === 1);
check("n3(2) 保存していないときは「まだ保存していません」", pr.includes('{dirty && !formErr && !missing && <span data-punch-unsaved="1"') && pr.includes(">まだ保存していません</span>"));

// ── 夜便 2（2026-11-20 21:00・相談役 §8-1／§8-12）──
check("n2b(1) 日報の締めの欄＝店長以上・締めの許可があるスタッフ・締めの許可があるキャスト（差異の承認と再締めは canClose のまま）", rb.includes("{(isManagerUp || staffPerm.close || castClose) && (") && !rb.includes("{(isManagerUp || castClose) && (") && rb.includes("const canClose = isManagerUp || staffPerm.close || castClose;") && rb.includes("const canApproveDiff = isManagerUp || staffPerm.close;"));
check("n2b(2) 待遇プランの判定期間の札は折り返す（375 ではみ出さない）", /data-slide-period-pill="1" style={{ whiteSpace: "normal", maxWidth: "100%"/.test(pe));
if (fails.length) { console.error(`✗ verify:nox-night1120 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-night1120 OK (${pass} checks)`);
console.log("夜便 11/20: 締めの前の送りの窓（0201v の後ろ）・報酬の軸は下書きと保存・段の欄の出し分け・打刻の設定の Wi-Fi の後に一覧だけ読み直す");
