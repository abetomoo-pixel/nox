/*
 * verify:nox-414b — 裁定414 追補（2026-10-26）: 送りの既定を定額徴収に・定額に距離区分 3 段（0180・フラグ OKURI_TIERS_APPLIED 配下）・日報の送り行は実費立替の店だけ・デモ 4 店。DB 不触（純関数＋逐語 grep）。
 *  (1) 純関数（lib/nox/shift/okuri-mode.ts）: 表示名（実費立替＝「タクシー代の立替（レジ現金が出る）」・既定の定額徴収）・okuriFlatTiersOf（壊れた要素を捨てる・最大 3）・okuriTierAmountOf（区分→額／無ければベース額）・okuriFlatTiersErrOf（コード必須／一意／長さ・名前・整数 ≥0・3 段まで）・okuriTierLabelOf
 *  (2) フラグ: OKURI_TIERS_APPLIED＝flag.ts と鏡が同値・本便は false（0180 手貼り前）・okuriTiersOn() はテストで上書きできる
 *  (3) 配線: 店設定「控除・送り」の距離区分（okuriTiersOn() かつ定額徴収の店・set_store_profile の patch {okuri_flat_tiers}・最大 3・フラグ false は案内）／キャスト詳細「送り区分」（set_cast_okuri_tier・okuri_tier はフラグ true のときだけ select）／
 *      日報の送り行＝okuriCashOf（実費立替）の店だけ／デモ payload＝ACE 定額 3 段（500／1,000／1,500）・MUSE 実費・LILY 店負担・NOIR なし（gen-demo が profileOkuriModeOf を書く）
 *  (4) 0180 起草＝supabase/migrations/0180_okuri_flat_tiers.sql（白名単 okuri_flat_tiers・casts.okuri_tier・okuri_today_summary の既定額・set_cast_okuri_tier）
 *  逆テスト（手動・各 1 回）: okuriFlatTiersErrOf の重複検査を外す→414b(1-4) 赤／report-board の filter を外す→414b(3-3) 赤。
 */
import fs from "node:fs";
import { OKURI_MODE_LABEL, OKURI_FLAT_TIERS_MAX, okuriFlatTiersOf, okuriTierAmountOf, okuriFlatTiersErrOf, okuriTierLabelOf, okuriModeOf, okuriCashOf } from "../lib/nox/shift/okuri-mode";
import { OKURI_TIERS_APPLIED, okuriTiersOn, __setOkuriTiersForTest } from "../lib/nox/rules-0175/flag";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: string) => { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = (x: unknown) => JSON.stringify(x);

// (1) 純関数
check("414b(1-1) 表示名＝実費立替「タクシー代の立替（レジ現金が出る）」・定額徴収・店負担・なし／既定（キー無し）は定額徴収", OKURI_MODE_LABEL.actual === "タクシー代の立替（レジ現金が出る）" && OKURI_MODE_LABEL.flat === "定額徴収" && okuriModeOf({}) === "flat" && okuriModeOf(null) === "flat");
const tiers = okuriFlatTiersOf({ okuri_flat_tiers: [{ code: "near", name: "近距離", amount: 500 }, { code: "mid", name: "中距離", amount: 1000.7 }, { bad: 1 }, { code: "far", name: "遠距離", amount: 1500 }, { code: "x", name: "超過", amount: 9 }] });
check("414b(1-2) okuriFlatTiersOf＝壊れた要素を捨て、整数化し、最大 3 段・配列でなければ []", tiers.length === 3 && tiers[1].amount === 1000 && tiers[2].code === "far" && okuriFlatTiersOf({ okuri_flat_tiers: "x" }).length === 0 && okuriFlatTiersOf(null).length === 0, J(tiers));
check("414b(1-3) okuriTierAmountOf＝区分の額／code なし・不明はベース額", okuriTierAmountOf(tiers, "mid", 800) === 1000 && okuriTierAmountOf(tiers, null, 800) === 800 && okuriTierAmountOf(tiers, "zzz", 800) === 800);
check("414b(1-4) okuriFlatTiersErrOf＝OK・4 段・コード空・重複・名前空・小数／負", okuriFlatTiersErrOf(tiers) === null && okuriFlatTiersErrOf([...tiers, { code: "d", name: "d", amount: 1 }]) !== null && okuriFlatTiersErrOf([{ code: " ", name: "a", amount: 1 }]) !== null
  && okuriFlatTiersErrOf([{ code: "a", name: "a", amount: 1 }, { code: "a", name: "b", amount: 2 }]) === "区分コードが重複しています" && okuriFlatTiersErrOf([{ code: "a", name: "", amount: 1 }]) !== null && okuriFlatTiersErrOf([{ code: "a", name: "a", amount: 1.5 }]) !== null && okuriFlatTiersErrOf([{ code: "a", name: "a", amount: -1 }]) !== null && OKURI_FLAT_TIERS_MAX === 3);
check("414b(1-5) okuriTierLabelOf＝「近距離（¥500）」・okuriCashOf は actual だけ", okuriTierLabelOf(tiers[0]) === "近距離（¥500）" && okuriCashOf("actual") && !okuriCashOf("flat") && !okuriCashOf("store") && !okuriCashOf("none"));

// (2) フラグ
const flagTs = src("lib/nox/rules-0175/flag.ts"), flagMjs = src("scripts/demo/rules-0175-flag.mjs");
const rx = (s: string) => /export const OKURI_TIERS_APPLIED = (true|false);/.exec(s)?.[1] ?? null;
check("414b(2-1) OKURI_TIERS_APPLIED＝flag.ts と鏡が同値・本便は false（0180 手貼り前）・okuriTiersOn() は上書きできる", rx(flagTs) === String(OKURI_TIERS_APPLIED) && rx(flagMjs) === String(OKURI_TIERS_APPLIED) && OKURI_TIERS_APPLIED === false && okuriTiersOn() === false && (__setOkuriTiersForTest(true), okuriTiersOn() === true) && (__setOkuriTiersForTest(null), okuriTiersOn() === false));

// (3) 配線
const dp = src("app/(manage)/master/deduction-panel.tsx"), cb = src("app/(manage)/casts/casts-board.tsx"), cp = src("app/(manage)/casts/page.tsx"), rb = src("app/(manage)/report/report-board.tsx"), prof = src("scripts/demo/profiles.mjs"), gen = src("scripts/demo/gen-demo.mjs"), ddp = src("app/(manage)/master/cast-comp/deduction/page.tsx");
check("414b(3-1) 店設定「控除・送り」＝距離区分の編集は okuriTiersOn() かつ定額徴収（data-okuri-tiers）・set_store_profile の patch {okuri_flat_tiers}・保存前に okuriFlatTiersErrOf・＋区分は 3 段まで・フラグ false は案内（data-okuri-tiers-pending）・page が okuriFlatTiersOf(sj) を渡す",
  dp.includes('{okuriTiersOn() && okuriMode === "flat" && (') && dp.includes('data-okuri-tiers="1"') && dp.includes('supabase.rpc("set_store_profile", { p_store_id: storeId, p_patch: { okuri_flat_tiers: tiers } })') && dp.includes("const err = okuriFlatTiersErrOf(tiers);") && dp.includes("disabled={tiersBusy || tiers.length >= OKURI_FLAT_TIERS_MAX}") && dp.includes('data-okuri-tiers-pending="1"') && ddp.includes("okuriTiers={okuriFlatTiersOf(sj as Record<string, unknown> | null)}"));
check("414b(3-2) キャスト詳細「送り区分」＝okuriTiersOn() かつ定額徴収かつ区分あり（data-cast-okuri-tier）・set_cast_okuri_tier・okuri_tier の select はフラグ true のときだけ（page／reload の両方）",
  cb.includes('data-cast-okuri-tier="1"') && cb.includes('supabase.rpc("set_cast_okuri_tier", { p_cast_id: c.id, p_tier: tier })') && cb.includes('okuriTiersOn() && okuriOf(selCast.store_id).mode === "flat" && okuriTiersOf(selCast.store_id).length > 0') && cp.includes("const CAST_LOGIN_COLS: string = okuriTiersOn() ?") && cb.includes("const CAST_RELOAD_COLS: string = okuriTiersOn() ?") && cp.includes("okuri_tier?: string | null;"));
check("414b(3-3) 日報の送り行＝実費立替（okuriCashOf）の店だけ（定額徴収・店負担・なしは行を出さない）", rb.includes('cashPayoutRowsOf(payoutParts).filter((r) => r.key !== "okuri" || okuriCashOf(okuriMode)).map((r) => {'));
check("414b(3-4) デモ payload＝ACE 定額 3 段（500／1,000／1,500）・MUSE 実費・LILY 店負担・NOIR なし（gen-demo が profileOkuriModeOf と okuriTiers を書く）",
  prof.includes('okuriMode: "flat", okuriTiers: [{ code: "near", name: "近距離", amount: 500 }, { code: "mid", name: "中距離", amount: 1000 }, { code: "far", name: "遠距離", amount: 1500 }]') && prof.includes('if (OKURI_4WAY_APPLIED) { if (code === "lily") return "store"; if (code === "noir") return "none"; }')
  && gen.includes("const OKURI_MODE = profileOkuriModeOf(code);") && gen.includes("...(OKURI_MODE ? { okuri_mode: OKURI_MODE } : {})") && gen.includes("...(PF.okuriTiers ? { okuri_flat_tiers: PF.okuriTiers } : {})"));
const ace = JSON.parse(src("docs/demo/payload/ace.json")).tables as { stores: Record<string, unknown>[] }, muse = JSON.parse(src("docs/demo/payload/muse.json")).tables as { stores: Record<string, unknown>[] }, lily = JSON.parse(src("docs/demo/payload/lily.json")).tables as { stores: Record<string, unknown>[] }, noir = JSON.parse(src("docs/demo/payload/noir.json")).tables as { stores: Record<string, unknown>[] };
const sjOf = (t: { stores: Record<string, unknown>[] }) => t.stores[0].settings_json as Record<string, unknown>;
check("414b(3-5) payload 実体＝ACE okuri_mode flat＋okuri_flat_tiers 3・MUSE actual・LILY store・NOIR none", sjOf(ace).okuri_mode === "flat" && okuriFlatTiersOf(sjOf(ace)).map((t) => t.amount).join(",") === "500,1000,1500" && sjOf(muse).okuri_mode === "actual" && sjOf(lily).okuri_mode === "store" && sjOf(noir).okuri_mode === "none", J([sjOf(ace).okuri_mode, sjOf(muse).okuri_mode, sjOf(lily).okuri_mode, sjOf(noir).okuri_mode]));

// (4) 0180 起草
const mig = fs.existsSync("supabase/migrations/0180_okuri_flat_tiers.sql") ? src("supabase/migrations/0180_okuri_flat_tiers.sql") : "";
check("414b(4-1) 0180 起草＝白名単 'okuri_flat_tiers'・casts.okuri_tier＋CHECK・okuri_today_summary の区分の額・set_cast_okuri_tier（authenticated・anon なし）・単一トランザクション・貼り先証明", mig.includes("'okuri_flat_tiers'];") && mig.includes("alter table public.casts add column if not exists okuri_tier text;") && mig.includes("casts_okuri_tier_check") && mig.includes("where c.okuri_tier is not null and e->>'code' = c.okuri_tier limit 1") && mig.includes("CREATE OR REPLACE FUNCTION public.set_cast_okuri_tier(p_cast_id uuid, p_tier text)") && mig.includes("grant execute on function public.set_cast_okuri_tier(uuid, text) to authenticated;") && mig.startsWith("-- 0180_okuri_flat_tiers.sql") && mig.includes("\nbegin;\nselect 'nox-project-proof', count(*) from public.orgs;") && mig.includes("\ncommit;\n"));

if (fails.length) { console.error(`verify:nox-414b FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`verify:nox-414b OK ${pass} checks（裁定414 追補＝表示名・定額徴収の距離区分（フラグ配下）・送り区分・日報の送り行・デモ 4 店・0180 起草）`);
