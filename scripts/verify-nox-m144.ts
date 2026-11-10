/**
 * verify:nox-m144 — 定休日と曜日の選択の整理（2026-11-10 Agoora 要望・相談役）
 *  ① 定休日の曜日は赤＋曜日の下に「定休」（初期設定のお店の段・マスタの営業時間の曜日の列）
 *  ② 料金ルールの曜日は定休日を選べない（灰色＋「定休」・押しても反応しない・aria-disabled・選んだ曜日は青）
 *  ③ 定休日を後から変えたら料金ルールからその曜日を外し、外したルール名を 1 行で知らせる・曜日が空になったルールは確認画面の要確認「曜日が無いルール」
 *  ④ 必要人数（曜日別）・この期間の必要人数・必要人数の曜日の選択にも同じ「定休」
 *  ⑤ 臨時営業の料金＝裁定478（0201d）の返事待ち＝ここでは扱わない／⑥ 読取済み（定休日が入っていても料金の解決は壊れない＝RPC の検査は不要）
 */
import fs from "node:fs";
import { ALL_DOWS_MASK, maskOfDays, maskWithoutClosed, openDaysOf, stripClosedDowsPlan, stripHolidaysFromV5Rules, stripNoticeOf } from "../lib/nox/pricing/closed-dows";
import { applyType, v5Checks, v5DefaultState, type V5State } from "../lib/nox/setup/v5";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = JSON.stringify;
const clone = <T,>(x: T): T => JSON.parse(J(x)) as T;

// ── 純関数 ──
check("m144(1-1) maskWithoutClosed＝null（毎日）から日・水を外すと 0b1110110・指定ありから外す・全部外すと 0", maskWithoutClosed(null, [0, 3]) === 0b1110110 && maskWithoutClosed(0b0000011, [0]) === 0b0000010 && maskWithoutClosed(0b0000001, [0]) === 0, [maskWithoutClosed(null, [0, 3])]);
check("m144(1-2) openDaysOf＝定休日以外が true", J(openDaysOf([0])) === J([false, true, true, true, true, true, true]));
check("m144(1-3) maskOfDays＝営業日を全部選んだら null（毎日）・一部なら mask・定休日を選んでいても入れない・定休日なしで 7 日は null",
  maskOfDays(openDaysOf([0]), [0]) === null && maskOfDays([true, true, false, false, false, false, false], [0]) === 0b10 && maskOfDays(Array(7).fill(true), []) === null && maskOfDays([false, false, false, false, false, true, true], []) === 0b1100000);
const rules = [
  { id: "a", name: "毎日", dow_mask: null },
  { id: "b", name: "週末", dow_mask: 0b1100001 },   // 日・金・土
  { id: "c", name: "日曜だけ", dow_mask: 0b0000001 },
  { id: "d", name: "平日", dow_mask: 0b0111110 },
];
const plan = stripClosedDowsPlan(rules, [0]);
check("m144(1-4) 書き換え案＝曜日を指定したルールだけ（null＝毎日は触らない）・日を外す・日だけのルールは外さず empty に・日を含まないルールは対象外",
  J(plan.change) === J([{ id: "b", name: "週末", from: 0b1100001, to: 0b1100000 }]) && J(plan.empty) === J(["日曜だけ"]), plan);
check("m144(1-5) 新しく定休日になった曜日が無ければ何もしない", J(stripClosedDowsPlan(rules, [])) === J({ change: [], empty: [] }));
const v5r = [{ name: "通常", days: ["月", "火", "日"] }, { name: "日曜", days: ["日"] }, { name: "平日", days: ["月"] }];
const st = stripHolidaysFromV5Rules(v5r, ["日"]);
check("m144(1-6) 初期設定のルールから定休日を外す＝外したルール名・曜日が空になったルール名・触らないルールは同じ参照",
  J(st.rules.map((r) => r.days)) === J([["月", "火"], [], ["月"]]) && J(st.touched) === J(["通常", "日曜"]) && J(st.emptied) === J(["日曜"]) && st.rules[2] === v5r[2], st);
check("m144(1-7) 知らせの 1 行＝外したルール名・曜日が無いルール・外していないルール", (stripNoticeOf(["通常"], ["日曜"], ["日曜だけ"]) ?? "").includes("定休日の曜日を料金ルールから外しました：通常") && (stripNoticeOf(["通常"], ["日曜"]) ?? "").includes("曜日が無いルール：日曜") && (stripNoticeOf([], [], ["日曜だけ"]) ?? "").includes("外していません：日曜だけ") && stripNoticeOf([]) === null);
check("m144(1-8) ALL_DOWS_MASK＝127（DB の check＝dow_mask between 1 and 127 と同じ）", ALL_DOWS_MASK === 127);

// ── 確認画面の要確認（v5Checks） ──
const base = applyType(v5DefaultState("2026-11-10"), "cabaret");
const S: V5State = clone(base);
S.shop.holidays = ["日"];
S.rules = stripHolidaysFromV5Rules(S.rules.map((r, i) => (i === 0 ? { ...r, days: ["日"] } : r)), ["日"]).rules;
const W = v5Checks(S);
check("m144(2-1) 曜日が空になったルール＝確認画面の要確認「曜日が無いルール」・直す先は rule:0", W.some(([, w, k]) => w.startsWith(`曜日が無いルール「${S.rules[0].name}」`) && k === "rule:0"), W);
const S2: V5State = clone(base); S2.shop.holidays = ["日"]; S2.rules[0].days = ["日", "月"];
check("m144(2-2) 型紙や復元で定休日が入ったルール＝要確認「定休日（日）が入っています」", v5Checks(S2).some(([, w, k]) => /定休日（日）が入っています/.test(w) && k === "rule:0"));
check("m144(2-3) 定休日の無い既定の状態では曜日の要確認は出ない", !v5Checks(clone(base)).some(([, w]) => /曜日が無いルール|定休日（/.test(w)));

// ── 配線（画面） ──
const DC = src("components/ui/dow-chips.tsx");
check("m144(3-1) 部品＝holiday は選んだ曜日に .hol と「定休」・pick は定休日に .off と aria-disabled と「定休」・押しても onToggle を呼ばない・選んだ曜日は .on",
  DC.includes('className={on ? "hol" : ""}') && DC.includes('{on && <span className="k">定休</span>}') && DC.includes('className={off ? "off" : on ? "on" : ""}') && DC.includes("aria-disabled={off || undefined}") && DC.includes("onClick={() => { if (!off) onToggle?.(dow); }}") && DC.includes('{off && <span className="k">定休</span>}'));
const CSS = src("app/globals.css");
check("m144(3-2) 見た目＝定休日は危険色のトークン（var(--bad)）・選んだ曜日は青（var(--primary)）・選べない曜日は not-allowed", /\.nox-dows button\.hol \{[^}]*var\(--bad\)/.test(CSS) && /\.nox-dows button\.on \{[^}]*var\(--primary\)/.test(CSS) && /\.nox-dows button\.off \{[^}]*not-allowed/.test(CSS) && /\.nox-dowmark\.hol \{[^}]*var\(--bad\)/.test(CSS));
const WZ = src("app/(manage)/setup/setup-wizard.tsx");
check("m144(3-3) 初期設定＝定休日は DowChips の holiday・足したら料金ルールから外して 1 行（data-setup-dow-msg）・ルールの曜日は定休日を選べない・必要人数の曜日に「定休」",
  WZ.includes('<DowChips mode="holiday" name="holidays" ariaLabel="定休日"') && WZ.includes("s.rules = stripHolidaysFromV5Rules(s.rules, [d]).rules") && WZ.includes('data-setup-dow-msg="1"') && WZ.includes("closed={(k) => shop.holidays.includes(WD[k])}") && WZ.includes("data-setup-need-closed={hol ? \"1\" : \"0\"}") && !WZ.includes('aria-label="定休日" style={{ marginTop: 4, width: "fit-content" }}'));
const BH = src("app/(manage)/master/business-hours-panel.tsx");
check("m144(3-4) 営業時間＝曜日の列は DowMark・読み込み時の定休日（wasClosed）から新しく定休日にした曜日だけ料金ルールから外す（1 曜日の保存・週間の保存の両方）",
  BH.includes("<DowMark label={DOW_LABELS[dow]} closed={f.closed} />") && BH.includes("wasClosed: true") && BH.includes("stripClosedDowsFromPricing(supabase, storeSel, f.closed && !f.wasClosed ? [dow] : [])") && BH.includes("else if (f.closed && !f.wasClosed) newlyClosed.push(dow);") && BH.includes("stripClosedDowsFromPricing(supabase, storeSel, newlyClosed)"));
const SC = src("lib/nox/pricing/strip-closed-client.ts");
check("m144(3-5) 外す処理＝set_pricing_rule を全値明示（原則7＝tax_category・category_id・billing_unit・is_default_ext・name）で dow_mask だけ変える",
  SC.includes('supabase.rpc("set_pricing_rule"') && ["p_tax_category: r.tax_category", "p_category_id: r.category_id", "p_billing_unit: r.billing_unit", "p_is_default_ext: r.is_default_ext ?? false", "p_name: r.name", "p_dow_mask: c.to", "p_is_active: r.is_active", "p_priority: r.priority"].every((x) => SC.includes(x)));
const PB = src("app/(manage)/master/pricing/pricing-board.tsx");
check("m144(3-6) 料金の帯＝店の定休日を読む・新しい帯の既定は定休日以外・編集で定休日は選んでいない扱い・保存は maskOfDays・曜日は DowChips（closed あり）・旧 dayChip なし",
  PB.includes('from("store_business_hours").select("dow").eq("store_id", storeId).eq("is_closed", true)') && PB.includes("setMDays(openDaysOf(closedDows))") && PB.includes("!closedDows.includes(i) && (b.dow_mask === null") && PB.includes("const dow = maskOfDays(mDays, closedDows);") && PB.includes('<DowChips name="band" ariaLabel="適用日"') && PB.includes("closed={(i) => closedDows.includes(i)}") && !PB.includes("dayChip"));
const SB = src("app/(manage)/shift/shift-board.tsx");
check("m144(3-7) シフト＝必要人数の曜日の行は DowMark・この期間の必要人数の曜日も DowMark・必要人数の追加の曜日は DowChips（single・定休日は選べない）・既定の曜日が定休日なら最初の営業日",
  SB.includes("<DowMark label={label} closed={closedDow} />") && SB.includes("<DowMark label={d} closed={hol} />") && SB.includes('<DowChips mode="single" name="need-band" ariaLabel="曜日" labels={DOW} selected={(d) => d === nDow} closed={(d) => closedDows.has(d)}') && SB.includes("if (closedDows.has(nDow)) { const d = [0, 1, 2, 3, 4, 5, 6].find((x) => !closedDows.has(x)); if (d !== undefined) setNDow(d); }"));

if (fails.length) { console.error(`✗ verify:nox-m144 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-m144 OK (${pass} checks)`);
console.log("M-144 定休日は赤＋定休・料金ルールと必要人数で選べない・後から定休日にしたら料金ルールから外して知らせる・曜日が無いルール");
