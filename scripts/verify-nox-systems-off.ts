/*
 * verify:nox-systems-off — GV-3 総点検（便 N1013b B-8・2026-10-13）: 設定 OFF が表示と入力の口に効いているかの代表段（DB 不触・env 不要）。
 *   npm run verify:nox-systems-off。f0 107 段目。
 *  so(1) sys_norms OFF: casts-board「今月のノルマ」の入力口（normsOnOf＝isSystemOn）・/mine ノルマカード（mineNormCard）・報酬設定ノルマタブ（compNormTab）
 *  so(2) sys_penalties OFF: shift-board 今日タブ「減額」（penaltiesOn＝page が isSystemOn で渡す）・控除タブ（compDeductionTab）
 *  so(3) 裁定326 の cast 設定: /mine の drink_claim／punch_correction_request／reservation_request／payslip_visibility／ranking（castRankingModeOf）
 *  so(4) 0164 の運用設定: use_vip／use_counter（seats-board hiddenKinds・register）・payment_methods（register）・punch_methods.self（/mine）・proxy（today-row）
 *  一覧（判断が要るもの＝起票103 kiosk・kiosk-register の席種／支払方法・analytics の席稼働 VIP 列）は docs/tmp/n1013b_decisions.md §B-8。
 */
import fs from "node:fs";
import { SECTION_KEYS, isSectionOn, isSystemOn } from "../lib/nox/store-systems";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

// so(1)
{
  const cb = src("app/(manage)/casts/casts-board.tsx");
  check("so(1-1) casts-board: 今月のノルマ＝normsOnOf（isSystemOn sys_norms）で display none＋aria-hidden", cb.includes('const normsOnOf = (sid: string) => isSystemOn(stores.find((st) => st.id === sid)?.settings_json ?? null, "sys_norms");') && cb.includes('display: normsOnOf(selCast.store_id) ? undefined : "none"') && cb.includes("aria-hidden={!normsOnOf(selCast.store_id)}"));
  check("so(1-2) sys_norms OFF: mineNormCard／compNormTab／normConfigPanel が消える・欠損は ON", !isSectionOn({ sys_norms: false }, "mineNormCard") && !isSectionOn({ sys_norms: false }, "compNormTab") && !isSectionOn({ sys_norms: false }, "normConfigPanel") && isSectionOn({}, "mineNormCard"));
  const mp = src("app/mine/page.tsx");
  check("so(1-3) /mine: ノルマカードは isSectionOn mineNormCard", mp.includes('isSectionOn((myStore?.settings_json ?? null) as StoreSettings, "mineNormCard") && <NormCard />'));
}

// so(2)
{
  const sb = src("app/(manage)/shift/shift-board.tsx");
  const sp = src("app/(manage)/shift/page.tsx");
  check("so(2-1) shift-board: 減額は penaltiesOn（既定 true）で出し分け・page が isSystemOn(sys_penalties) を渡す", sb.includes("penaltiesOn = true }") && sb.includes("{!io?.outHm && penaltiesOn && (/* ★GV-3: sys_penalties OFF の店は減額の口を出さない。★裁定383: 退勤後は「時刻修正」だけ */") && sp.includes('penaltiesOn={isSystemOn((stores?.[0]?.settings_json ?? null) as Record<string, unknown> | null, "sys_penalties")}'));
  check("so(2-2) sys_penalties OFF: compDeductionTab／deductionPanel が消える（compPenaltyTab は norms が ON なら残る）", !isSectionOn({ sys_penalties: false }, "compDeductionTab") && !isSectionOn({ sys_penalties: false }, "deductionPanel") && isSectionOn({ sys_penalties: false }, "compPenaltyTab") && !isSectionOn({ sys_penalties: false, sys_norms: false }, "compPenaltyTab"));
  check("so(2-3) SECTION_KEYS 17 節・isSystemOn は false のみ OFF", Object.keys(SECTION_KEYS).length === 17 && isSystemOn({ sys_norms: false }, "sys_norms") === false && isSystemOn({ sys_norms: "off" }, "sys_norms") === true);
}

// so(3)
{
  const mp = src("app/mine/page.tsx");
  check("so(3-1) /mine: drink_claim／punch_correction_request／reservation_request／payslip_visibility の出し分け", mp.includes("{ms.drink_claim && <DrinkClaimForm month={month} />}") && mp.includes("{ms.punch_correction_request && meCast?.id && (") && mp.includes("{ms.reservation_request && myStore && <ReservationRequestCard") && mp.includes('{ms.payslip_visibility !== "off" && ('));
  check("so(3-2) /mine: ランキングは castRankingModeOf（off で消える）", mp.includes('{castRankingModeOf(ms) !== "off" && myRank && ('));
  const ml = src("app/mine/layout.tsx");
  check("so(3-3) /mine layout: ranking OFF はナビから外す（mineSettingsOf）", ml.includes("mineSettingsOf") && /ranking/.test(ml));
}

// so(4)
{
  const seats = src("app/(manage)/master/seats/seats-board.tsx");
  check("so(4-1) seats-board: use_vip／use_counter OFF の席種は hiddenKinds（lib/nox/floor-kinds）", seats.includes("hiddenKinds") && seats.includes("const kindOn = (k: string) => !hiddenKinds.includes(k);"));
  const reg = src("app/(manage)/register/register-board.tsx");
  check("so(4-2) register: payment_methods（opsProfileOf）で支払方法の出し分け", reg.includes("const pm = opsProfileOf(data as Record<string, unknown> | null).payment_methods;"));
  const mp = src("app/mine/page.tsx");
  const tr = src("lib/nox/shift/today-row.ts");
  check("so(4-3) /mine punch_methods.self・today-row punch_methods.proxy", mp.includes("opsProfileOf") && /punch_methods|self/.test(mp) && /proxyPunchOn|proxy/.test(tr));
}

if (fails.length) { console.error(`✗ verify:nox-systems-off 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`設定 OFF の総点検（GV-3）: sys_norms／sys_penalties／326 cast 設定／0164 運用設定の代表段 ✓ ${pass}`);
