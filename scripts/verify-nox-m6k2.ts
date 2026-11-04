/*
 * verify:nox-m6k2 — 便 M6 のメニューテンプレート（client のみ）と K client 第 2 便（キオスクのシフト・日報＝本体の包み）の純関数と配線（2026-11-02 夜）。
 *  (1) テンプレート＝CSV 4 本から生成した menu_v6.json（キャバクラ 3 価格帯＋スナック・代用 ガールズバー→スナック／ラウンジ・バー→地方都市）・料金システムは設定の欄へ
 *  (2) applyMenuTemplate＝税は内税・バックは 0・割りもの無料・全体 ±%（100 円単位）・指名料／セット／延長／VIP・開始は確認 2 つまで不可
 *  (3) K client 第 2 便＝/kiosk-shift・/kiosk-report は KioskWorkspace（端末ログイン→操作担当→本体）・在庫は案内のまま（DDL 待ち）・タイルの ready
 *  使い方: npm run verify:nox-m6k2（env 不要・DB 不触）
 */
import fs from "node:fs";
import { adjustPrice, applyMenuTemplate, menuTemplatesFor, tplStartBlockedOf } from "../lib/nox/setup/menu-template";
import { applyType, v5DefaultState } from "../lib/nox/setup/v5";
import { KIOSK_FEATURE_READY } from "../lib/nox/rules-0175/kiosk";
import { bizDaysOfMonth, spreadOverDays, staffLaborOf } from "../lib/nox/staff/labor";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

// (1)
const cab = menuTemplatesFor("cabaret"), gb = menuTemplatesFor("girlsbar"), lo = menuTemplatesFor("lounge"), sn = menuTemplatesFor("snack");
check("m6(1-1) キャバクラ＝3 価格帯・スナック＝1・代用＝ガールズバー→スナック／ラウンジ→キャバクラ地方都市", cab.length === 3 && sn.length === 1 && gb[0]?.key === "snack" && gb[0].substitute && lo[0]?.key === "cabaret_regional_city" && lo[0].substitute, { cab, gb, lo });
const json = JSON.parse(src("lib/nox/setup/templates/menu_v6.json"));
const kab = json.templates.cabaret_kabukicho;
check("m6(1-2) 料金システムはメニューに入らない（セット・延長・指名・場内・同伴・VIP は pricing）・キープ 23（ウイスキー・焼酎）・バック未入力 9", kab.pricing.set?.[0]?.price === 8000 && kab.pricing.hon === 3000 && kab.menu.every((c: { cat: string }) => c.cat !== "料金システム") && kab.menu.flatMap((c: { items: { keep: boolean }[] }) => c.items).filter((i: { keep: boolean }) => i.keep).length === 23 && kab.menu.flatMap((c: { items: { backPending: boolean }[] }) => c.items).filter((i: { backPending: boolean }) => i.backPending).length === 9);
// (2)
const base = { ...applyType(v5DefaultState("2026-11-02"), "cabaret"), tax: "ex" as const };
const a = applyMenuTemplate(base, "cabaret_kabukicho", { mixFree: true, adjPct: -10 });
const items = a.menu.flatMap((c) => c.items);
check("m6(2-1) 税は内税・バックは全部 0・指名料 3,000・セット 8,000×0.9＝7,200・確認 2 つは未", a.tax === "in" && items.every((i) => i.b === 0) && a.fees.hon === 3000 && a.rules[0].set === 7200 && !a.tplConfirm.pricing && !a.tplConfirm.backs, { set: a.rules[0]?.set });
check("m6(2-2) 割りもの無料＝0 円・adjustPrice（100 円単位・0 は 0）", a.menu.filter((c) => /割りもの/.test(c.cat)).flatMap((c) => c.items).every((i) => i.p === 0) && adjustPrice(1550, 0) === 1600 && adjustPrice(0, 10) === 0 && adjustPrice(8000, -10) === 7200);
check("m6(2-3) 開始の柵＝テンプレートを入れたら確認 2 つまで不可・入れていなければ柵なし", tplStartBlockedOf(a) !== null && tplStartBlockedOf({ ...a, tplConfirm: { pricing: true, backs: true } }) === null && tplStartBlockedOf({}) === null);
const wz = src("app/(manage)/setup/setup-wizard.tsx");
check("m6(2-4) 初期設定＝テンプレートの欄（価格帯・割りもの無料・±%）と確認の 2 つ・開始ボタンは tplBlocked で止まる", wz.includes('data-setup-template="1"') && wz.includes('data-setup-template-confirm="1"') && wz.includes("disabled={run.running || !type || !isOwner || !!tplBlocked}"));
// (3)
const ws = src("components/nox/kiosk-workspace.tsx");
check("m6(3-1) K2: /kiosk-shift・/kiosk-report・/kiosk-register は KioskWorkspace・在庫は案内のまま", ["shift", "report", "register"].every((f) => src(`app/kiosk-${f}/page.tsx`).includes(`<KioskWorkspace feature="${f}" />`)) && src("app/kiosk-inventory/page.tsx").includes('<KioskFeaturePage feature="inventory" />'));
check("m6(3-2) K2: 包みの中で feature ごとの本体（レジ＝RegisterBoard・シフト＝KioskShiftView・日報＝KioskReportView）・タイル ready（シフト・日報 true／在庫＝★0194 後 true）", ws.includes('{board && feature === "register" && (') && ws.includes('{board && feature === "shift" && <KioskShiftView storeId={board.storeId} />}') && ws.includes('{board && feature === "report" && <KioskReportView storeId={board.storeId} />}') && KIOSK_FEATURE_READY.shift && KIOSK_FEATURE_READY.report && KIOSK_FEATURE_READY.inventory /* ★0194（2026-11-04）: kiosk_stock_levels */);
const kv = src("components/nox/kiosk-views.tsx");
check("m6(3-3) K2: シフト＝確定シフト×打刻×連絡（読取だけ）・日報＝直近 1 件（読取だけ・締めは本店）", kv.includes('.eq("status", "confirmed")') && kv.includes('from("punches")') && kv.includes('from("attendance")') && kv.includes('from("daily_reports").select("biz_date, uri, slips, guests, closed_at")') && (kv.match(/\.rpc\(/g) ?? []).length === 1 && kv.includes('.rpc("kiosk_stock_levels")') /* ★0194: 在庫の読取 RPC だけ（書込の rpc は無い） */);

// (4) スタッフ給与のコスト計上（client）
const bd = bizDaysOfMonth("2026-11", new Set([0]), new Set(["2026-11-03"]), new Set(["2026-11-08"]));
check("m6(4-1) 営業日＝定休曜日（日）を除き・臨時休業を除き・特別営業を足す（2026-11＝30 日－日曜 5＋特別営業 1－臨時休業 1＝25）", bd.length === 25 && bd.includes("2026-11-08") && !bd.includes("2026-11-03") && !bd.includes("2026-11-01"), bd.length);
const sp = spreadOverDays(250000, bd);
check("m6(4-2) 月給の日割り＝合計は月額と一致（端数は最後の営業日）", Object.values(sp).reduce((a, v) => a + v, 0) === 250000 && sp[bd[0]] === 10000);
const days = [{ bizDate: "2026-11-02", minutes: 300 }, { bizDate: "2026-11-04", minutes: 360 }];
check("m6(4-3) 時給＝実働×時給・当欠の日は 0・日給＝出勤日・月給は当欠でも減らさない（相談役確認待ち）", staffLaborOf({ pay_kind: "hourly", hourly: 1200, fixed_allowance: 0 }, days, new Set(["2026-11-04"]), bd).total === 6000
  && staffLaborOf({ pay_kind: "daily", hourly: 0, fixed_allowance: 0, daily: 9000 }, days, new Set(), bd).total === 18000 && staffLaborOf({ pay_kind: "monthly", hourly: 0, fixed_allowance: 0, monthly: 250000 }, days, new Set(["2026-11-04"]), bd).total === 250000);
check("m6(4-4) 月報に「スタッフ人件費（見込み／確定）」の行（確定＝staff_attendance_locks・社保の事業主負担は含まない）", fs.readFileSync("app/(manage)/report/month-report.tsx", "utf8").includes("rows.push([`スタッフ人件費（${staffLabor.confirmed ? \"確定\" : \"見込み\"}）`"));

if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-m6k2 ALL PASS (${pass} assertions)`);
console.log("便 M6 メニューテンプレート（client）・K client 第 2 便（キオスクのシフト・日報＝本体の包み）");
