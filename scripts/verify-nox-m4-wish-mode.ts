/*
 * verify:nox-m4-wish-mode — 便 M4（2026-10-01・裁定326-7／追補1-3／追補2-1・2-2・起票95・96）の係留（純関数＋配線 grep・DB 不触・env 不要）。
 *   npm run verify:nox-m4-wish-mode。f0 末尾に連結。
 *
 *  (1) wish-mode: ナビ文言（'shift'＝シフト希望／'off_only'＝休み希望）・ページ文言・wishSubmitArgsOf（'off_only'＝時刻 null＋kind 'off'／'shift'＝時刻＋'work'）・wishRowLabelOf（off＝休み）・wishNeedsTimes
 *  (2) autoassign-mode: 'shift'＝pending の work だけ（off 除外・時刻なしは除外）／'off_only'＝候補反転（提出のない日＝候補・off の日＝除外・既定の帯時間・仮想 id）・placementsOfVirtual・datesBetween
 *  (3) pattern-disable: disableMonthOptionsOf（翌月以降の月初 n 個・年またぎ）・patternDisableStateOf（active／scheduled／disabled）・isPatternEnabledOn（RPC と同式）
 *  (4) 配線: layout＝wishNavLabelOf・wishes page＝store 設定→mode・WishForm mode・kind を読む・wishRowLabelOf／wish-form＝wishSubmitArgsOf・needsTimes で時間欄を出し分け・既存 pin（toggleDay／composeSubmissions／for of rpc）不変／
 *      staff-shift-panel＝disabled_from を読む・effectivePatterns に isPatternEnabledOn・staff_pattern_disable（p_from）／enable・disabledNow 群／pricing-board＝contract_ack（set_store_mine_settings・ackRecorded・有効化保存で記録）／rpc-err 'off wish'
 *  逆テスト 1 本（手動・1 回）: wishSubmitArgsOf の 'off' を 'ofx' にする→wm(1-2) 赤・戻して緑。
 */
import fs from "node:fs";
import { OFF_MODE_NOTE, resolveWishMode, wishNavLabelOf, wishNeedsTimes, wishPageTextOf, wishRowLabelOf, wishSubmitArgsOf } from "../lib/nox/mine/wish-mode";
import { candidateWishesOf, datesBetween, isVirtualWishId, placementsOfVirtual } from "../lib/nox/shift/autoassign-mode";
import { disableMonthOptionsOf, isPatternEnabledOn, patternDisableStateOf } from "../lib/nox/shift/pattern-disable";
import { rpcErrJa } from "../lib/nox/ui/rpc-err";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }

// (1)
check("wm(1-1) wishNavLabelOf／wishPageTextOf: 'shift'＝シフト希望／'off_only'＝休み希望（見出し・提出節・説明）・wishNeedsTimes", wishNavLabelOf("shift") === "シフト希望" && wishNavLabelOf("off_only") === "休み希望"
  && wishPageTextOf("shift").title === "シフト希望" && wishPageTextOf("off_only").title === "休み希望" && wishPageTextOf("off_only").submitHeading === "休みたい日を提出" && wishPageTextOf("off_only").note === OFF_MODE_NOTE && OFF_MODE_NOTE.includes("提出のない日は出勤できる日")
  && wishNeedsTimes("shift") && !wishNeedsTimes("off_only"));
const row = { date: "2026-10-10", start_hm: "20:00", end_hm: "26:00" };
check("wm(1-2) wishSubmitArgsOf: 'off_only'＝時刻 null＋kind 'off'／'shift'＝時刻＋kind 'work'（0160 の 4 引数）", JSON.stringify(wishSubmitArgsOf(row, "off_only")) === JSON.stringify({ p_date: "2026-10-10", p_start_hm: null, p_end_hm: null, p_kind: "off" })
  && JSON.stringify(wishSubmitArgsOf(row, "shift")) === JSON.stringify({ p_date: "2026-10-10", p_start_hm: "20:00", p_end_hm: "26:00", p_kind: "work" }));
check("wm(1-3) wishRowLabelOf: off＝休み・時刻なし＝休み・work＝fmtWin（20:00〜26:00 は翌 02:00 表記を含む）", wishRowLabelOf({ kind: "off", start_hm: null, end_hm: null }) === "休み" && wishRowLabelOf({ kind: "work", start_hm: null, end_hm: null }) === "休み" && wishRowLabelOf({ kind: "work", start_hm: "20:00", end_hm: "26:00" }).startsWith("20:00"));

// (2)
const wishes = [
  { id: "w1", castId: "a", date: "2026-10-01", startHm: "20:00", endHm: "26:00", status: "pending", kind: "work" },
  { id: "w2", castId: "b", date: "2026-10-01", startHm: null, endHm: null, status: "pending", kind: "off" },
  { id: "w3", castId: "a", date: "2026-10-02", startHm: "20:00", endHm: "26:00", status: "rejected", kind: "work" },
  { id: "w4", castId: "b", date: "2026-10-02", startHm: null, endHm: null, status: "accepted", kind: "off" },
];
const cs = candidateWishesOf({ mode: "shift", wishes, castIds: ["a", "b"], startDate: "2026-10-01", endDate: "2026-10-02", defaultStart: "20:00", defaultEnd: "26:00" });
check("wm(2-1) 'shift': pending の work だけ（off・rejected は除外）＝w1 のみ・時刻は wish の値", cs.length === 1 && cs[0].id === "w1" && cs[0].startHm === "20:00", JSON.stringify(cs));
const co = candidateWishesOf({ mode: "off_only", wishes, castIds: ["a", "b"], startDate: "2026-10-01", endDate: "2026-10-02", defaultStart: "20:00", defaultEnd: "26:00" });
// ★裁定337（0167・便 X-13d-2b）: キャスト個別の方式（castModes）＝店既定 'shift' でも 'off_only' の人は反転・'shift' の人は work wish・null は店の既定
const cm = candidateWishesOf({ mode: "shift", wishes, castIds: ["a", "b"], startDate: "2026-10-01", endDate: "2026-10-02", defaultStart: "20:00", defaultEnd: "25:00", castModes: { a: "off_only", b: null } });
check("wm(2-5) ★裁定337 castModes: a（個別 off_only）は反転＝仮想 wish・b（null＝店既定 shift）は work wish だけ", cm.filter((w) => w.castId === "a").every((w) => isVirtualWishId(w.id)) && cm.some((w) => w.castId === "a") && cm.filter((w) => w.castId === "b").every((w) => !isVirtualWishId(w.id)), JSON.stringify(cm.map((w) => w.id)));
check("wm(2-6) ★裁定337 resolveWishMode: 'off_only'／'shift' は個別が勝つ・null／不正値は店の既定", resolveWishMode("off_only", "shift") === "off_only" && resolveWishMode("shift", "off_only") === "shift" && resolveWishMode(null, "off_only") === "off_only" && resolveWishMode("x", "shift") === "shift");
check("wm(2-2) 'off_only': 候補反転＝2 日×2 人のうち b の off（10/1 pending・10/2 accepted）を除く 2 件（a の 2 日）・仮想 id・既定の帯時間", co.length === 2 && co.every((w) => w.castId === "a" && isVirtualWishId(w.id) && w.startHm === "20:00" && w.endHm === "26:00") && co.map((w) => w.date).join(",") === "2026-10-01,2026-10-02", JSON.stringify(co));
check("wm(2-3) placementsOfVirtual（仮想 id → cast×日付・実 id は無視）・datesBetween（両端含む・月またぎ）", JSON.stringify(placementsOfVirtual([co[0].id, "w1"])) === JSON.stringify([{ castId: "a", date: "2026-10-01" }]) && JSON.stringify(datesBetween("2026-09-29", "2026-10-02")) === JSON.stringify(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]));

// (3)
const opts = disableMonthOptionsOf("2026-11-15", 3);
check("wm(3-1) disableMonthOptionsOf: 翌月以降の月初（年またぎ）・表示「M/1 から無効」", JSON.stringify(opts) === JSON.stringify([["2026-12-01", "12/1 から無効"], ["2027-01-01", "1/1 から無効"], ["2027-02-01", "2/1 から無効"]]), JSON.stringify(opts));
check("wm(3-2) patternDisableStateOf: null＝active／未来＝scheduled「11/1 から無効」／当日以前＝disabled「無効（10/1 から）」・isPatternEnabledOn は RPC と同式（null or > 営業日）",
  patternDisableStateOf(null, "2026-10-15").state === "active" && JSON.stringify(patternDisableStateOf("2026-11-01", "2026-10-15")) === JSON.stringify({ state: "scheduled", label: "11/1 から無効" })
  && JSON.stringify(patternDisableStateOf("2026-10-01", "2026-10-15")) === JSON.stringify({ state: "disabled", label: "無効（10/1 から）" }) && JSON.stringify(patternDisableStateOf("2026-10-15", "2026-10-15")) === JSON.stringify({ state: "disabled", label: "無効（10/15 から）" })
  && isPatternEnabledOn(null, "2026-10-15") && isPatternEnabledOn("2026-11-01", "2026-10-31") && !isPatternEnabledOn("2026-11-01", "2026-11-01"));

// (4)
const src = (p: string) => fs.readFileSync(p, "utf8");
const layout = src("app/mine/layout.tsx"), wpage = src("app/mine/wishes/page.tsx"), wf = src("app/mine/wishes/wish-form.tsx"), panel = src("app/(manage)/master/staff-shift-panel.tsx"), pb = src("app/(manage)/master/pricing/pricing-board.tsx");
check("wm(4-1) ★裁定337: layout＝auth_cast_id→resolveWishMode→wishNavLabelOf(wishMode)／wishes page＝店設定→mode・<WishForm mode={mode}・kind を読む・wishRowLabelOf・文言は wishPageTextOf", layout.includes('{ href: "/mine/wishes", label: wishNavLabelOf(wishMode) }')
  && wpage.includes("mineSettingsOf(storeRow?.settings_json).shift_request_mode") && wpage.includes("<WishForm mode={mode} />") && wpage.includes('.select("id, date, start_hm, end_hm, status, kind")') && wpage.includes("wishRowLabelOf({") && wpage.includes("wishPageTextOf(mode)"));
check("wm(4-2) wish-form: wishSubmitArgsOf(r, mode) を rpc に渡す・needsTimes で時間欄（一括・日別）を出し分け・既存 pin（toggleDay(s, ymd, active)／composeSubmissions／for of rpc／MonthNav 1／useYmQuery）は不変",
  wf.includes('supabase.rpc("shift_wish_submit", wishSubmitArgsOf(r, mode))') && wf.includes("const needsTimes = wishNeedsTimes(mode);") && wf.includes("{needsTimes ? (") && wf.includes("休みたい日（時間は入力しません）")
  && /toggleDay\(s, ymd, active\)/.test(wf) && /composeSubmissions\(/.test(wf) && /for \(const r of rows\) \{[\s\S]*?rpc\("shift_wish_submit"/.test(wf) && (wf.match(/<MonthNav /g) || []).length === 1 && wf.includes("useYmQuery(month, setMonth)") && !/type="date"/.test(wf));
check("wm(4-3) staff-shift-panel: disabled_from を読む・effectivePatterns に isPatternEnabledOn・staff_pattern_disable（p_from）／staff_pattern_enable・disabledNow 群（グレー）・無効にする／無効を取消",
  panel.includes("effective_from, sort_order, disabled_from") && panel.includes("if (!isPatternEnabledOn(p.disabled_from, day)) continue;") && panel.includes('supabase.rpc("staff_pattern_disable", { p_pattern_id: p.id, p_from: from })') && panel.includes('supabase.rpc("staff_pattern_enable", { p_pattern_id: p.id })')
  && panel.includes('{disabledNow.map((p) => row(p, "disabled"))}') && panel.includes(">無効にする</button>") && panel.includes(">無効を取消</button>") && panel.includes("const [disMonth, setDisMonth] = useState<Record<string, string>>({});"));
check("wm(4-4) pricing-board: contract_ack＝mineSettingsOf(store.settings_json)・set_store_mine_settings({ contract_ack })・有効化の保存で記録・ON/OFF（SegSelect）・記録済みはチェック行を出さない／rpc-err 'off wish'",
  pb.includes("mineSettingsOf(store.settings_json).contract_ack") && pb.includes('supabase.rpc("set_store_mine_settings", { p_store_id: storeId, p_settings: { contract_ack: on } })') && pb.includes("const acked = tSurOn && taxSavedSur === null && tSurAck;")
  && pb.includes('ariaLabel="加盟店契約の確認（記録）"') && pb.includes("{taxSavedSur === null && !ackRecorded && (") && rpcErrJa("off wish") === "休み希望はシフト案にできません（却下のみできます）" && rpcErrJa("off wish: 123").startsWith("休み希望は"));

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-m4-wish-mode OK (${pass} checks)`);
console.log("M4(裁定326-7・追補2・起票95/96): 休み希望モードの文言と 4 引数 / autoassign の候補反転 / 枠マスタの無効化（月初・状態） / 配線（layout・wishes・wish-form・staff-shift-panel・pricing-board）・rpc-err 'off wish'");
