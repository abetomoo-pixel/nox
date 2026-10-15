/*
 * verify:nox-n1014 — 裁定352（席を開くダイアログ）・353（今日の状態）・GV-4（kiosk グリッド）・354（デモ PIN 1234）・348 追補2（MUSE 指名 ON・LILY 9 月ノルマ・体験入店の 10 月出勤・業態）の係留（DB 不触・env 不要）。
 *   npm run verify:nox-n1014。f0 109 段目。
 *  nd(1) register（裁定352 改訂＝BANZEN 形）: 「<卓名> を開卓」・中央 80%（上限 560）・人数ステッパー（既定 1・下限 1・上限＝定員か 20・直接入力なし）・ルール＝横並びセグメント・主ボタン「開卓（セット開始）」1 つ・予約／やめるは下に小さく・check_open の引数は不変（p_people）
 *  nd(2) today-row: todayStateOf 6 種・isTodayWorking／casts-board＝今日の shifts／attendance／punches を各 1 クエリ・カードに「今日: …」・フィルタ「今日出勤」
 *  nd(3) kiosk: 名前タイル＝.nox-kioskgrid（globals.css＝2／3／4 列）／demo-terms＝「デモの PIN は 1234」（端末ボタン脇）
 *  nd(4) payload（★教訓113: payload の pin は == null）: MUSE＝指名（check_nominations ≥1・ランク 1）・pt 段 10／20／40・LILY＝先月 cast_norms 2（300,000／9,000,000）・体験入店 6 名＝10 月の打刻 2〜3 日（in は 3・out は過去日のみ）・cast_pin 全員・業態ラベル（seed.ts）
 */
import fs from "node:fs";
import { todayStateOf, isTodayWorking } from "../lib/nox/shift/today-row";
import { DEMO_STORE_LABEL } from "../lib/nox/demo/seed";
import { PROFILES, SLIDES, TRIAL } from "../scripts/demo/profiles.mjs";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

// nd(1)
{
  const rb = src("app/(manage)/register/register-board.tsx");
  check("nd(1-1) 見出し「<卓名> を開卓」・Modal maxWidth 560＋80vw（globals.css）・人数ステッパー（−／＋・既定 1・上限＝capacity か 20）・直接入力なし", rb.includes("{openSeatTarget.name} を開卓</h3>") && rb.includes("setOpenSeatTarget(null); }} maxWidth={560}>") && src("app/globals.css").includes(".nox-modal-card:has(> [data-open-seat-modal]) { width: 80vw; }") && rb.includes('data-people-stepper="1" data-people-max={max}') && rb.includes("const max = typeof cap === \"number\" && cap > 0 ? cap : 20;") && rb.includes('setOpenPeople("1"); // ★裁定352') && !rb.includes('type="number" min={1} value={openPeople}'));
  check("nd(1-2) 主ボタン「開卓（セット開始）」1 つ（幅 100%・高さ 56）・セット料金ルール＝横並びセグメント（自動＋ルール名・選択中は金塗り・2 件以上の店のみ）・「予約を入れる」「やめる」は下に小さく・check_open の引数（p_seat_id／p_people／p_nom_type）は不変", rb.includes('data-open-seat="1">') && rb.includes(">\n            開卓（セット開始）\n          </button>") && rb.includes('style={t.btnPrimary56} disabled={openBusy} onClick={() => void confirmOpenSeat()}') /* ★裁定369（便 GV-A）: 主ボタン＝theme btnPrimary56 */ && rb.includes('data-rule-seg="1"') && rb.includes('[{ id: "", label: "自動" }, ...setRules.map((r) => ({ id: r.id, label: setRuleLabel(r) }))]') && rb.includes("(openRuleSel === o.id ? t.btnGold : btnLight)") && rb.includes("{isManagerUp && setRules.length >= 2 && (") && rb.includes('data-open-cancel="1">やめる</button>') && rb.includes('p_seat_id: seat.id, p_people: n, p_nom_type: "free",'));
}

// nd(2)
{
  const sh = { start_hm: "20:00", end_hm: "26:00", status: "confirmed" };
  check("nd(2-1) todayStateOf: 予定なし／出勤予定 20:00〜翌02:00／未出勤 20:00 予定／出勤中／退勤／休み希望／当欠", todayStateOf({ shift: null, attStatus: null, inHm: null, outHm: null }).label === "予定なし" && todayStateOf({ shift: sh, attStatus: "shukkin", inHm: null, outHm: null }).label === "出勤予定 20:00〜翌02:00" && todayStateOf({ shift: sh, attStatus: null, inHm: null, outHm: null }).label === "未出勤 20:00 予定" && todayStateOf({ shift: sh, attStatus: "shukkin", inHm: "20:05", outHm: null }).label === "出勤中 20:05〜（予定 翌02:00）" && todayStateOf({ shift: sh, attStatus: "shukkin", inHm: "20:05", outHm: "01:50" }).label === "退勤 20:05 → 01:50" && todayStateOf({ shift: sh, attStatus: "off", inHm: null, outHm: null }).label === "休み希望" && todayStateOf({ shift: null, attStatus: "absent", inHm: null, outHm: null }).label === "当欠");
  check("nd(2-2) isTodayWorking: 確定シフトあり／出勤中／退勤＝true・予定なし／休み／当欠＝false", isTodayWorking(todayStateOf({ shift: sh, attStatus: "shukkin", inHm: null, outHm: null })) && isTodayWorking(todayStateOf({ shift: null, attStatus: "shukkin", inHm: "20:00", outHm: null })) && !isTodayWorking(todayStateOf({ shift: null, attStatus: null, inHm: null, outHm: null })) && !isTodayWorking(todayStateOf({ shift: sh, attStatus: "off", inHm: null, outHm: null })));
  const cb = src("app/(manage)/casts/casts-board.tsx");
  check("nd(2-3) casts-board: 今日の shifts／attendance／punches＝各 1 クエリ（eq date／punched_at 範囲）・todayStateOf・カード「今日: …」・フィルタ「今日出勤」", cb.includes('supabase.from("shifts").select("cast_id, start_hm, end_hm, status").eq("date", bizToday)') && cb.includes('supabase.from("attendance").select("cast_id, status").eq("date", bizToday)') && cb.includes('supabase.from("punches").select("cast_id, type, punched_at").gte("punched_at"') && cb.includes("m[cid] = todayStateOf({ shift: shBy.get(cid) ?? null, attStatus: attBy.get(cid) ?? null, inHm: io.get(cid)?.inHm ?? null, outHm: io.get(cid)?.outHm ?? null });") && cb.includes('>今日: {todayStateOfCast(c.id).label}</div>') && cb.includes('["today", "今日出勤"]') && cb.includes('filter === "today" ? c.is_active && isTodayWorking(todayStateOfCast(c.id))'));
}

// nd(3)
{
  const css = src("app/globals.css"); const kp = src("app/kiosk/page.tsx"); const dt = src("components/ui/demo-terms.tsx");
  check("nd(3-1) kiosk グリッド: .nox-kioskgrid＝2 列・≥600px 3 列・≥900px 4 列・page が className で使う", css.includes(".nox-kioskgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }") && css.includes("@media (min-width: 600px) { .nox-kioskgrid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }") && css.includes("@media (min-width: 900px) { .nox-kioskgrid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }") && kp.includes('<div className="nox-kioskgrid" data-kiosk-grid="1">') && !kp.includes('gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))"'));
  check("nd(3-2) demo-terms: 端末ボタン脇に「デモの PIN は 1234」（デモ入口だけ＝本番 org には出ない）", dt.includes('data-demo-pin="1234">デモの PIN は 1234</span>') && !src("app/kiosk/page.tsx").includes("1234"));
}

// nd(4)
{
  for (const code of ["muse", "luna", "noir", "ace", "lily", "nest"] as const) {
    const T = (JSON.parse(src(`docs/demo/payload/${code}.json`)) as { tables: Record<string, Array<Record<string, any>>> }).tables;
    const casts = T.casts ?? [];
    check(`nd(4-1) ${code}: cast_pin＝全キャスト（bcrypt 固定）・体験入店 ${TRIAL[code].cast} の 10 月の in 打刻 3 日・out は過去日だけ`, (T.cast_pin ?? []).length === casts.length && (T.cast_pin ?? []).every((r) => String(r.pin_hash).startsWith("$2a$06$")) && (() => { const tc = casts.find((c) => c.name === TRIAL[code].cast); const ins = (T.punches ?? []).filter((p) => p.cast_id === tc?.id && p.type === "in" && String(p.id).includes("punch:trial") === false && p.punched_at?.$rel != null); const outs = (T.punches ?? []).filter((p) => p.cast_id === tc?.id && p.type === "out" && p.punched_at?.$rel != null); /* 先月分（$m）は対象外 */ return ins.length >= 2 && outs.every((o) => (o.punched_at?.$rel ?? 1) <= 0); })(), `pins=${(T.cast_pin ?? []).length} ins=${(T.punches ?? []).filter((p) => p.type === "in" && p.punched_at?.$rel != null && p.cast_id === casts.find((c) => c.name === TRIAL[code].cast)?.id).length}`); // 保証期間が今日から始まる店は R-1／R の 2 日（R+1 は未来＝入れない）・NEST は 3 日
  }
  const muse = (JSON.parse(src("docs/demo/payload/muse.json")) as { tables: Record<string, Array<Record<string, any>>> }).tables;
  check("nd(4-2) MUSE: 指名 ON＝check_nominations ≥ 30・cast_ranks 1（注入）・pricing_rules に本指名の料金・pt 段＝10／20／40", (muse.check_nominations ?? []).length >= 30 && (muse.cast_ranks ?? []).length === 1 && (muse.pricing_rules ?? []).some((r) => r.fee_kind === "hon_shimei") && JSON.stringify((SLIDES.muse.points ?? []).map((p) => p.at)) === "[10,20,40]" && (PROFILES.muse as { nominations?: boolean }).nominations === true);
  const lily = (JSON.parse(src("docs/demo/payload/lily.json")) as { tables: Record<string, Array<Record<string, any>>> }).tables;
  const prev = (lily.cast_norms ?? []).filter((n) => n.period?.$m === -1);
  check("nd(4-3) LILY: 先月の cast_norms 2 名＝300,000（達成）／9,000,000（未達）・days は 0", prev.length === 2 && prev.some((n) => n.sales_target === 300000) && prev.some((n) => n.sales_target === 9000000) && prev.every((n) => n.days_target == null || n.days_target === 0));
  check("nd(4-4) 業態ラベル（seed.ts）＝MUSE キャバクラ・NEST スナック・profiles の template と一致（cabaret／snack）", DEMO_STORE_LABEL.muse.biz === "キャバクラ" && DEMO_STORE_LABEL.nest.biz === "スナック" && PROFILES.muse.template === "cabaret" && PROFILES.nest.template === "snack" && PROFILES.noir.template === "lounge" && PROFILES.lily.template === "girlsbar");
}

if (fails.length) { console.error(`✗ verify:nox-n1014 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`N1014（裁定352〜354・GV-4・348 追補2）: 席ダイアログ・今日の状態・kiosk グリッド・PIN 1234・デモ（MUSE 指名／LILY ノルマ／体験入店の出勤／業態） ✓ ${pass}`);
