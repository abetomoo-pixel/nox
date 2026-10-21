/*
 * verify:nox-wish-state — 裁定345（便 N1013b・2026-10-13）: シフト希望の表示状態＝shifts.status から導く 4 段（審査中／採用・確認待ち／採用・確定／見送り）の純関数と 3 画面の配線（DB 不触・env 不要）。
 *   npm run verify:nox-wish-state。f0 105 段目。
 *  ws(1) wishStateOf: 4 段×shift 3 値（pending／rejected／withdrawn は shift を見ない・accepted／なし は confirmed→確定・他→確認待ち）
 *  ws(2) wishStateDetailOf／wishStateTextOf: ON（キャスト確認待ち）／OFF（店の確定待ち）・planned＝管理者確認・確認待ち以外は null
 *  ws(3) 配線: /mine/wishes（shifts を wish_id で結線・stateCell）・/mine 直近（slice 14・すべて見る・4 段の語）・wish-calendar（採用／見送り）
 *  ws(4) 管理側: shift-board は「代行確定」（PROXY_CONFIRM_LABEL・旧「承認」ボタン 0）・SHIFT_ST_LABEL＝4 段の語・OFF の店は採用→shift_confirm_bulk 即時・タブ名「承認待ち」は不変（裁定274）
 *  ws(5) デモ: gen-demo の採用済みは planned（本番の shift_wish_decide と同じ段）
 */
import fs from "node:fs";
import { MINE_RECENT_SHIFT_LIMIT, PROXY_CONFIRM_LABEL, WISH_STATE_LABEL, wishStateDetailOf, wishStateOf, wishStateTextOf } from "../lib/nox/shift/wish-state";
import { wishMarkOf } from "../lib/nox/mine/wish-calendar";
import { VIEW_TABS } from "../lib/nox/shift/tabs";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

// ws(1)
{
  check("ws(1-1) 語＝審査中／採用・確認待ち／採用・確定／見送り／取下げ", WISH_STATE_LABEL.pending === "審査中" && WISH_STATE_LABEL.accepted_wait === "採用・確認待ち" && WISH_STATE_LABEL.accepted_fixed === "採用・確定" && WISH_STATE_LABEL.rejected === "見送り" && WISH_STATE_LABEL.withdrawn === "取下げ");
  check("ws(1-2) pending／rejected／withdrawn は shift を見ない", wishStateOf("pending", "confirmed") === "pending" && wishStateOf("rejected", "confirmed") === "rejected" && wishStateOf("withdrawn", null) === "withdrawn");
  check("ws(1-3) accepted: confirmed→確定・planned／proposed→確認待ち・shift なし→確認待ち", wishStateOf("accepted", "confirmed") === "accepted_fixed" && wishStateOf("accepted", "planned") === "accepted_wait" && wishStateOf("accepted", "proposed") === "accepted_wait" && wishStateOf("accepted", null) === "accepted_wait");
  check("ws(1-4) 希望なし（手動のシフト）: confirmed→確定・planned／proposed→確認待ち", wishStateOf(null, "confirmed") === "accepted_fixed" && wishStateOf(null, "planned") === "accepted_wait" && wishStateOf(undefined, "proposed") === "accepted_wait");
}

// ws(2)
{
  check("ws(2-1) 内訳: planned＝管理者確認・proposed＝ON キャスト確認待ち／OFF 店の確定待ち・shift なし＝店の操作待ち", wishStateDetailOf("accepted_wait", "planned", true) === "管理者確認" && wishStateDetailOf("accepted_wait", "proposed", true) === "キャスト確認待ち" && wishStateDetailOf("accepted_wait", "proposed", false) === "店の確定待ち" && wishStateDetailOf("accepted_wait", null, true) === "店の操作待ち");
  check("ws(2-2) 確認待ち以外は内訳 null", wishStateDetailOf("accepted_fixed", "confirmed", true) === null && wishStateDetailOf("pending", null, false) === null && wishStateDetailOf("rejected", null, true) === null);
  check("ws(2-3) wishStateTextOf: 「採用・確認待ち（キャスト確認待ち）」「採用・確定」「審査中」", wishStateTextOf("accepted", "proposed", true) === "採用・確認待ち（キャスト確認待ち）" && wishStateTextOf("accepted", "confirmed", true) === "採用・確定" && wishStateTextOf("pending", null, false) === "審査中");
  check("ws(2-4) 直近の上限 14・代行確定の語", MINE_RECENT_SHIFT_LIMIT === 14 && PROXY_CONFIRM_LABEL === "代行確定");
}

// ws(3)
{
  const wp = src("app/mine/wishes/page.tsx");
  check("ws(3-1) /mine/wishes: shifts（id, date, start_hm, end_hm, status, wish_id・今日以降）を引き wish_id で結線・stateCell＝wishStateOf＋wishStateDetailOf・独自の STATUS_LABEL なし",
    wp.includes('supabase.from("shifts").select("id, date, start_hm, end_hm, status, wish_id").gte("date", bizToday).order("date")') && wp.includes("shiftByWish.get(w.id as string)?.status ?? null") && wp.includes("const k = wishStateOf(wish, shift);") && !wp.includes("const STATUS_LABEL"));
  check("ws(3-2) /mine/wishes: 今日以降のシフト節（id=shifts）＝「すべて見る」の先・希望由来は accepted として段を決める", wp.includes('<section id="shifts" className="nox-cardtop"') && wp.includes('{stateCell(s.wish_id ? "accepted" : null, s.status)}'));
  const mp = src("app/mine/page.tsx");
  // ★便 X13-G W-22 ②: /mine の「直近のシフト」は廃止＝「出勤予定」（今月／来月・確定と確認待ち・募集中は出さない）
  check("ws(3-3) /mine 出勤予定: shifts は wish_id を select・scheduleOf（確定＝confirmed／確認待ち＝planned・proposed と提出済みの希望）・「直近のシフト」なし",
    mp.includes('.select("id, date, start_hm, end_hm, status, wish_id")') && mp.includes("<ScheduleCard tabs={scheduleTabs} />") && !mp.includes("直近のシフト") && !mp.includes("MINE_RECENT_SHIFT_LIMIT"));
  {
    const sc = fs.readFileSync("app/mine/schedule-card.tsx", "utf8");
    check("ws(3-4) /mine 出勤予定: proposed は「確認する」ボタンのまま・確認待ちは薄い色と印", sc.includes("{x.proposed && <ShiftConfirmButton shiftId={x.id} />}") && sc.includes('className={`nox-schedrow${x.kind === "pending" ? " pending" : ""}`}'));
  }
  check("ws(3-5) wish-calendar: accepted 採用・rejected 見送り（旧 承認／却下は無い）", wishMarkOf("accepted") === "採用" && wishMarkOf("rejected") === "見送り" && wishMarkOf("pending") === "審査中");
}

// ws(4)
{
  const sb = src("app/(manage)/shift/shift-board.tsx");
  // 「承認」の語が残るのは cast の打刻修正申請の決裁ボタン（裁定297-1・別機能）だけ＝シフトの確定ボタンには残らない
  const approveButtons = (sb.match(/confirm(Shift\(s\)|One\(r\.shift!\.id\))\}>承認<\/button>/g) ?? []).length;
  check("ws(4-1) shift-board: シフトの「承認」ボタン 0・代行確定＝PROXY_CONFIRM_LABEL（行 2 箇所＝今日タブ＋proposed 行（★裁定380: planned 行は「調整して確定」へ）＋一括＋今日タブ CTA）", approveButtons === 0 && (sb.match(/\{PROXY_CONFIRM_LABEL\}<\/button>/g) ?? []).length === 2 && sb.includes("件を一括{PROXY_CONFIRM_LABEL}") && sb.includes("{PROXY_CONFIRM_LABEL}する（{unconfirmedN} 件）"), `承認 ${approveButtons}`);
  check("ws(4-2) shift-board: SHIFT_ST_LABEL＝4 段の語・queue の段＝wishStateTextOf・キャスト希望は審査中・旧「承認済み（未確定）」なし",
    sb.includes("const SHIFT_ST_LABEL: Record<string, string> = { planned: WISH_STATE_LABEL.accepted_wait, proposed: WISH_STATE_LABEL.accepted_wait, confirmed: WISH_STATE_LABEL.accepted_fixed };")
    && sb.includes('stage: wishStateTextOf("accepted", x.status as "planned" | "proposed", castConfirm)') && sb.includes("stage: `${WISH_STATE_LABEL.pending}（キャスト希望）`") && !sb.includes('"承認済み（未確定）"'));
  check("ws(4-3) shift-board: 希望どおり採用＝即確定（shift_wish_decide の戻り id を shift_confirm_bulk 1 件へ・★裁定380: 店設定に依らない＝castConfirm は常に true）", sb.includes('const { data: sid, error } = await supabase.rpc("shift_wish_decide", { p_wish_id: wishId, p_accept: accept });') && sb.includes("if (!error && accept && typeof sid === \"string\") { // ★裁定380") && sb.includes('await supabase.rpc("shift_confirm_bulk", { p_shift_ids: [sid] });') && sb.includes("const castConfirm = true; // ★裁定380"));
  check("ws(4-4) タブ名「承認待ち」は不変（裁定274）", JSON.stringify(VIEW_TABS.confirm) === JSON.stringify([["queue", "承認待ち"], ["roster", "確定シフト"]]));
  const af = src("app/(manage)/shift/shift-add-form.tsx");
  check("ws(4-5) shift-add-form: 状態の語＝採用・確認待ち（管理者確認／キャスト確認）／採用・確定・取込の文言＝採用", af.includes('options={[["planned", "採用・確認待ち（管理者確認）"], ["proposed", "採用・確認待ち（キャスト確認）"], ["confirmed", "採用・確定"]] as const}') && af.includes("希望日は採用（管理者確認）として取り込み") && af.includes("希望の採用に失敗"));
}

// ws(5)
{
  const gd = src("scripts/demo/gen-demo.mjs");
  check("ws(5-1) gen-demo: 採用済み希望のシフトは planned（本番の採用直後と同じ段）", gd.includes('status: "planned" /* ★裁定345') && !gd.includes('status: "proposed", wish_id: wid'));
  for (const s of ["muse", "luna", "noir", "ace", "lily", "nest"]) {
    const p = JSON.parse(fs.readFileSync(`docs/demo/payload/${s}.json`, "utf8")) as { tables: Record<string, Array<Record<string, unknown>>> };
    const sh = p.tables.shifts ?? [];
    check(`ws(5-2) payload ${s}: wish_id 付き shifts は全部 planned・proposed 0`, sh.filter((r) => r.wish_id).every((r) => r.status === "planned") && sh.filter((r) => r.status === "proposed").length === 0, `proposed=${sh.filter((r) => r.status === "proposed").length}`);
  }
}

if (fails.length) { console.error(`✗ verify:nox-wish-state 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`シフト希望の状態表示（裁定345）: 4 段の純関数・3 画面の配線・代行確定・デモ planned ✓ ${pass}`);
