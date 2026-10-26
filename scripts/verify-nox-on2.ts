/*
 * verify:nox-on2 — 便 ON-2（2026-10-26）: MUSE＝CANON 型（裁定418 ①〜⑰・P-6 の payload）＝時間帯別セット・卓種別サ料（VIP 35＝0181）・同伴バックの時間帯・ドリンクバック OFF・報酬率の行。DB 不触（純関数＋逐語 grep＋payload 実体）。
 *  (1) 純関数: dohanBandBackOf（帯の率×同伴伝票のキャスト分・帯の外は 0・四捨五入）／breakdownLinesOf の「報酬率 ○%→段」行（canon があるときだけ・金額 0・提案／適用）
 *  (2) payload（MUSE）: stores.service_rate 30・service_rate_by_seat {VIP:35}（列）・VIP 卓 1・セットの料金ルール 3 本（〜22:00 ¥6,000／22:00〜 ¥8,000／深夜 ¥8,000）・主プランの reward_axis pay_rate＋段 10・settings sys_drink_count_back false
 *  (3) 配線: gen-demo（CANON の VIP 卓・時間帯別セット・列）／seed.ts demoCanonBandsFor（plan_rate_bands dohan_back 3 帯＋plan_norm_tiers 3 段・reset 後処理）／collect が plan_rate_bands と同伴伝票のキャスト分を読み CanonCtx.dohanBandBack に／
 *      pay.ts が帯があれば同伴バックを置換／register＝ドリンクバック OFF の店は「誰のドリンクか」を聞かない（タップ 2 か所＋行ボタン）／0181 起草（check_open の卓種別サ料）
 *  逆テスト（手動・各 1 回）: dohanBandBackOf の四捨五入を床にする→on2(1-1) 赤／register の drinkCountBackOn を外す→on2(3-4) 赤。
 */
import fs from "node:fs";
import { dohanBandBackOf, type RateBand } from "../lib/nox/rules-0175/canon";
import { breakdownLinesOf } from "../lib/nox/payroll/breakdown-lines";
import { CANON_DOHAN_BANDS, CANON_NORM_TIERS } from "../lib/nox/demo/seed";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: string) => { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = (x: unknown) => JSON.stringify(x);

// (1) 純関数
const bands: RateBand[] = CANON_DOHAN_BANDS.map((b, i) => ({ target: "dohan_back", from_min: b.from_min, to_min: b.to_min, value_amount: null, value_rate: b.value_rate, priority: 100 + i }));
check("on2(1-1) dohanBandBackOf＝20:10 入店 share 10,000→30%＝3,000・20:40→20%＝2,000・21:30→15%＝1,500・22:30（最後の帯の後＝直前の帯 15% を引き継ぐ）＝1,500・19:50（最初の帯の前）＝0・1 円未満は四捨五入（share 3,333×15%＝500）", dohanBandBackOf(bands, [{ startMin: 1210, share: 10000 }]) === 3000 && dohanBandBackOf(bands, [{ startMin: 1240, share: 10000 }]) === 2000 && dohanBandBackOf(bands, [{ startMin: 1290, share: 10000 }]) === 1500 && dohanBandBackOf(bands, [{ startMin: 1350, share: 10000 }]) === 1500 && dohanBandBackOf(bands, [{ startMin: 1190, share: 10000 }]) === 0 && dohanBandBackOf(bands, [{ startMin: 1290, share: 3333 }]) === 500 && dohanBandBackOf(bands, [{ startMin: 1210, share: 10000 }, { startMin: 1240, share: 5000 }]) === 4000);
check("on2(1-2) CANON の帯＝3（20:00〜20:30 30／20:35〜21:00 20／21:05〜22:00 15）・W 別規定 3 段（1〜2 日 6 日 30h／3〜4 日 12 日 60h／5〜7 日 18 日 90h）", J(CANON_DOHAN_BANDS.map((b) => [b.from_min, b.to_min, b.value_rate])) === J([[1200, 1230, 30], [1235, 1260, 20], [1265, 1320, 15]]) && J(CANON_NORM_TIERS.map((t) => [t.week_days_min, t.week_days_max, t.days_required, t.hours_required])) === J([[1, 2, 6, 30], [3, 4, 12, 60], [5, 7, 18, 90]]));
const base = { wage: 2000, wHours: 100, timePay: 200000, honBack: 0, jonaiBack: 0, dohanBack: 0 } as unknown as Parameters<typeof breakdownLinesOf>[0]["pay"];
const withCanon = { ...base, canon: { pct: 42.3, tierIdx: 1, direction: "up" as const, applied: false, upAmount: 300, payPct: 100, streak: 1, windowN: 2 } };
const l1 = breakdownLinesOf({ pay: withCanon }).earn.find((l) => l.key === "slide-rate");
const l0 = breakdownLinesOf({ pay: base }).earn.find((l) => l.key === "slide-rate");
check("on2(1-3) 報酬率の行＝canon があるときだけ・「報酬率 42.3% → 段 2（UP +¥300/h）」・副「提案＝店が適用を選ぶ・連続 1／2 期」・金額 0（—）", !!l1 && l1.label === "報酬率 42.3% → 段 2（UP +¥300/h）" && l1.label2 === "提案＝店が適用を選ぶ・連続 1／2 期" && l1.amount === 0 && l1.amountText === "—" && !l0, J(l1));
const l2 = breakdownLinesOf({ pay: { ...base, canon: { pct: 85, tierIdx: 6, direction: "assess" as const, applied: true, upAmount: 0, payPct: 90, streak: 2, windowN: 2 } } }).earn.find((l) => l.key === "slide-rate");
check("on2(1-4) 査定＝「報酬率 85% → 段 7（査定 支給率 90%）」・適用済み", !!l2 && l2.label === "報酬率 85% → 段 7（査定 支給率 90%）" && l2.label2 === "適用済み・連続 2／2 期", J(l2));

// (2) payload MUSE
const muse = JSON.parse(src("docs/demo/payload/muse.json")).tables as { stores: Record<string, unknown>[]; seats: { name: string; kind: string }[]; pricing_rules: { fee_kind: string; name: string; amount: number; time_from_min: number | null; time_to_min: number | null }[]; comp_plans: { name: string; reward_axis?: string; pay_rate_tiers?: unknown[]; hon_back_mode?: string; hon_back_rate?: number }[] };
const st = muse.stores[0], sj = st.settings_json as Record<string, unknown>;
const setRules = muse.pricing_rules.filter((r) => r.fee_kind === "set").map((r) => [r.amount, r.time_from_min, r.time_to_min]);
check("on2(2-1) MUSE 店＝サ料 30・service_rate_by_seat {VIP:35}（列）・VIP 卓 1・settings に service_rate_by_seat なし・sys_drink_count_back false・sales_subtotal_mode pre_tax_service・現金 10% OFF", st.service_rate === 30 && J(st.service_rate_by_seat) === J({ VIP: 35 }) && muse.seats.filter((s) => s.kind === "VIP").length === 1 && !("service_rate_by_seat" in sj) && sj.sys_drink_count_back === false && sj.sales_subtotal_mode === "pre_tax_service" && J(sj.pay_discount_rates) === J({ cash: 10 }), J([st.service_rate, st.service_rate_by_seat, muse.seats.map((s) => s.kind)]));
check("on2(2-2) MUSE セットの料金ルール 3 本＝〜22:00 ¥6,000（1140〜1319）／22:00〜 ¥8,000（1320〜1439）／深夜 ¥8,000（0〜359＝cutoff 06:00 の手前・live ① で 0〜1139 は不一致と判明）・店の基本セット（帯の外＝06:00〜開店前）は ¥6,000", J(setRules) === J([[6000, 1140, 1319], [8000, 1320, 1439], [8000, 0, 359]]) && st.set_fee === 6000, J([setRules, st.set_fee]));
const main = muse.comp_plans.find((p) => p.name === "MUSE Standard");
check("on2(2-3) MUSE 主プラン＝reward_axis pay_rate・報酬率表 10 段・本指名 率 10%", main?.reward_axis === "pay_rate" && main?.pay_rate_tiers?.length === 10 && main?.hon_back_mode === "rate" && main?.hon_back_rate === 10, J(main));

// (3) 配線
const gen = src("scripts/demo/gen-demo.mjs"), seed = src("lib/nox/demo/seed.ts"), col = src("lib/nox/payroll/rules-0175-collect.ts"), pay = src("lib/nox/pay.ts"), rb = src("app/(manage)/register/register-board.tsx");
check("on2(3-1) gen-demo＝CANON の VIP 卓・時間帯別セット 3 本（priority 90）・stores の列 service_rate_by_seat・settings からは外す", gen.includes('if (CANON) push("seats", { id: uid(`seat:canon:${code}:vip`), store_id: storeId, name: "VIP", kind: "VIP"') && gen.includes("time_from_min: 1320, time_to_min: 1439, fee_kind: \"set\", amount: CANON.set.vip") && gen.includes("service_rate_by_seat: CANON ? { VIP: CANON.service_rate_vip } : {}") && !gen.includes("service_rate_by_seat: { vip: CANON.service_rate_vip }"));
check("on2(3-2) seed.ts＝demoCanonBandsFor（reward_axis pay_rate のプランに plan_rate_bands dohan_back 3 帯＋plan_norm_tiers 3 段・既存行を消してから・失敗しても reset は止めない）", seed.includes("export async function demoCanonBandsFor(") && seed.includes("out.canon = await demoCanonBandsFor(admin, orgId).catch(") && seed.includes('.eq("reward_axis", "pay_rate")') && seed.includes('for (const t of ["plan_rate_bands", "plan_norm_tiers"] as const)'));
check("on2(3-3) collect＝plan_rate_bands（dohan_back・is_active）と check_nominations（is_dohan・ratio_weight・checks の started_at／total）を読み dohanBandBack に・pay.ts は帯があれば同伴バックを置換（無ければ従来）", col.includes('admin.from("plan_rate_bands").select("plan_id, target, from_min, to_min, value_amount, value_rate, priority").in("plan_id", planIds).eq("target", "dohan_back").eq("is_active", true)') && col.includes('admin.from("check_nominations").select("check_id, cast_id, ratio_weight, is_dohan, checks!inner(started_at, status, total, store_id)")') && col.includes("dohanBandBack: (bandsByPlan.get(c.planId)?.length ?? 0) > 0 ? dohanBandBackOf(") && pay.includes("const dohanBack = input.rules0175?.dohanBandBack != null ? input.rules0175.dohanBandBack : effDohan * eplan.dohanBack;"));
check("on2(3-4) register＝ドリンクバック OFF の店は「誰のドリンクか」を聞かない（タップ 2 か所＋行のボタン）", (rb.match(/p\.back_exempt_from_split === true && drinkCountBackOn\(storeSj\)/g) ?? []).length === 2 && rb.includes('check?.status === "open" && drinkCountBackOn(storeSj) ? (') && rb.includes('import { drinkCountBackOn } from "@/lib/nox/rules-0175/settings";'));
const mig = fs.existsSync("supabase/migrations/0181_check_open_service_rate_by_seat.sql") ? src("supabase/migrations/0181_check_open_service_rate_by_seat.sql") : "";
check("on2(3-5) 0181 起草＝check_open が stores.service_rate_by_seat（seats.kind がキー・小文字も可）を凍結・0〜100 の外は店の率・単一トランザクション", mig.includes("st.service_rate_by_seat,") && mig.includes("v_rate := coalesce(nullif(trim(v_seat.service_rate_by_seat->>v_seat.kind), '')::int,") && mig.includes("if v_rate < 0 or v_rate > 100 then v_rate := v_seat.service_rate; end if;") && mig.includes("\nbegin;\nselect 'nox-project-proof'") && mig.includes("\ncommit;\n"));

if (fails.length) { console.error(`verify:nox-on2 FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`verify:nox-on2 OK ${pass} checks（MUSE CANON 型＝時間帯別セット・卓種別サ料（0181）・同伴バックの時間帯・ドリンクバック OFF・報酬率の行）`);
