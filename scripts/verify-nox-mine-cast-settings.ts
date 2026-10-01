/*
 * verify:nox-mine-cast-settings — 便 M1（2026-09-30・裁定326-1／326-8／326 追補3・327）: 0160 client 第 1 便の係留（純関数＋配線 grep・DB 不触・env 不要）。
 *   npm run verify:nox-mine-cast-settings。f0 末尾に連結。
 *
 *  (1) mineSettingsOf: 既定 8 キー（326-1）・'on'/'off' → boolean・欠損／型違い／未知値は既定・オブジェクトでない入力も既定／mineSettingsPatchOf＝差分キーだけ DB 表現（'on'/'off'・enum・contract_ack boolean）・差分なし {}
 *  (2) punchStateOf（326 追補3）: [] 未出勤／[in] 出勤中（inAt）／[in,out] 退勤済み／[in,out,in] 出勤中（最終で決める・順不同）／前営業日の未閉鎖 in は当日の配列に無い＝未出勤／ボタン活性・補助文・見出し
 *  (3) 和文 7 種: rpcErrJa 'already in'／'already out'／'no open punch'（327）・mineSettingsErrJa 'bad key'／'bad <key>'／'bad type'／'bad patch'（写像外は rpcErrJa へ）
 *  (4) 配線（逐語 grep）: /mine page＝mineSettingsOf・punchStateOf・drink_claim／punch_correction_request／ranking の出し分け・PunchActions state・見出し「出勤中」／layout＝ranking OFF でナビから外す／ranking page＝redirect("/mine")／
 *      punch-actions＝punchButtonsOf・PUNCH_STATE_NOTE・rpcErrJa・router.refresh／kiosk＝拒否 3 語は rpcErrJa／店舗設定＝MineSettingsPanel（set_store_mine_settings・mineSettingsPatchOf・contract_ack の入力なし・ranking OFF で他キャスト表示は不活性）／
 *      注意行＝attentionLineOf('open_punch')・attentionCanCarry・payroll-board は status で絞らない
 *  逆テスト 1 本（手動・1 回）: MINE_SETTINGS_DEFAULT.reservation_request を false にする→mc(1-1) 赤・戻して緑。
 */
import fs from "node:fs";
import { MINE_SETTINGS_DEFAULT, MINE_SETTING_KEYS, MINE_SETTING_LABEL, mineSettingsErrJa, mineSettingsOf, mineSettingsPatchOf } from "../lib/nox/store/mine-settings";
import { PUNCH_STATE_NOTE, punchButtonsOf, punchHeadOf, punchStateOf } from "../lib/nox/shift/punch-state";
import { rpcErrJa } from "../lib/nox/ui/rpc-err";
import { attentionCanCarry, attentionLineOf, type AttentionRow } from "../lib/nox/payroll/attention";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }

// (1) mine_settings
const D = MINE_SETTINGS_DEFAULT;
check("mc(1-1) 既定（326-1）: payslip 'off'・drink_claim／punch_correction_request／ranking／ranking_show_others false・reservation_request true・shift_request_mode 'shift'・contract_ack false・キー 8",
  JSON.stringify(mineSettingsOf({})) === JSON.stringify(D) && D.payslip_visibility === "off" && D.drink_claim === false && D.punch_correction_request === false && D.ranking === false && D.ranking_show_others === false
  && D.reservation_request === true && D.shift_request_mode === "shift" && D.contract_ack === false && MINE_SETTING_KEYS.length === 8 && Object.keys(MINE_SETTING_LABEL).length === 8, JSON.stringify(mineSettingsOf({})));
const full = mineSettingsOf({ payslip_visibility: "detail", drink_claim: "on", punch_correction_request: "on", ranking: "on", ranking_show_others: "on", reservation_request: "off", shift_request_mode: "off_only", contract_ack: true, biz_cutoff_hm: "06:00" });
check("mc(1-2) 'on'/'off' → boolean・enum・contract_ack boolean・関係ないキーは無視", full.payslip_visibility === "detail" && full.drink_claim && full.punch_correction_request && full.ranking && full.ranking_show_others && !full.reservation_request && full.shift_request_mode === "off_only" && full.contract_ack, JSON.stringify(full));
const bad = mineSettingsOf({ payslip_visibility: "all", drink_claim: true, ranking: 1, reservation_request: "yes", shift_request_mode: "shift_only", contract_ack: "true" });
check("mc(1-3) 型違い・未知値は既定に倒す（boolean が来た drink_claim → false・'yes' → 既定 true・'shift_only' → 'shift'・'true' 文字列 → false）", JSON.stringify(bad) === JSON.stringify(D), JSON.stringify(bad));
check("mc(1-4) オブジェクトでない入力（null／undefined／配列／文字列）は既定", [null, undefined, [], "x", 3].every((v) => JSON.stringify(mineSettingsOf(v)) === JSON.stringify(D)));
const patch = mineSettingsPatchOf(D, { ...D, drink_claim: true, payslip_visibility: "net_only", contract_ack: true });
check("mc(1-5) mineSettingsPatchOf: 差分キーだけ・DB 表現（'on'・enum・boolean）・差分なし {}", JSON.stringify(patch) === JSON.stringify({ payslip_visibility: "net_only", drink_claim: "on", contract_ack: true }) && Object.keys(mineSettingsPatchOf(D, { ...D })).length === 0 && mineSettingsPatchOf(full, { ...full, reservation_request: true }).reservation_request === "on", JSON.stringify(patch));

// (2) punch state
const T = (type: string, hm: string) => ({ type, punched_at: `2026-09-30T${hm}:00+09:00` });
check("mc(2-1) punchStateOf: [] 未出勤・[in] 出勤中（inAt）・[in,out] 退勤済み・[out] 退勤済み（孤立 out＝閉鎖扱い）", JSON.stringify(punchStateOf([])) === JSON.stringify({ state: "none", inAt: null }) && JSON.stringify(punchStateOf([T("in", "20:00")])) === JSON.stringify({ state: "open", inAt: "2026-09-30T20:00:00+09:00" })
  && punchStateOf([T("in", "20:00"), T("out", "23:00")]).state === "closed" && punchStateOf([T("out", "23:00")]).state === "closed");
check("mc(2-2) 最終打刻で決める・順不同（[out 23:00, in 20:00] → 退勤済み／[in 20:00, out 23:00, in 23:30] → 出勤中 23:30）", punchStateOf([T("out", "23:00"), T("in", "20:00")]).state === "closed" && JSON.stringify(punchStateOf([T("in", "20:00"), T("out", "23:00"), T("in", "23:30")])) === JSON.stringify({ state: "open", inAt: "2026-09-30T23:30:00+09:00" }));
check("mc(2-3) 前営業日の未閉鎖 in は当日の配列に含めない前提＝未出勤（RPC と同じ・punchButtonsOf none＝出勤のみ活性）", punchStateOf([]).state === "none" && JSON.stringify(punchButtonsOf("none")) === JSON.stringify({ inEnabled: true, outEnabled: false, okuriEnabled: false }));
check("mc(2-4) ボタン活性: open＝退勤と送り／closed＝両方不活性・補助文（none／closed）・見出し「出勤中 20:00〜」（open のみ・JST）", JSON.stringify(punchButtonsOf("open")) === JSON.stringify({ inEnabled: false, outEnabled: true, okuriEnabled: true }) && JSON.stringify(punchButtonsOf("closed")) === JSON.stringify({ inEnabled: false, outEnabled: false, okuriEnabled: false })
  && PUNCH_STATE_NOTE.none === "出勤打刻がありません" && PUNCH_STATE_NOTE.closed === "本日は退勤済みです。修正は店にご連絡ください" && PUNCH_STATE_NOTE.open === null
  && punchHeadOf("open", "2026-09-30T20:00:00+09:00") === "出勤中 20:00〜" && punchHeadOf("none", null) === null && punchHeadOf("closed", null) === null);

// (3) 和文 7 種
check("mc(3-1) 327 の和文（rpc-err 共通）: already in／already out／no open punch", rpcErrJa("already in") === "すでに出勤打刻があります" && rpcErrJa("already out") === "本日は退勤済みです" && rpcErrJa("no open punch") === "出勤打刻がありません");
check("mc(3-2) mine_settings の和文: bad key／bad <key>（和名）／bad type／bad patch・写像外は rpcErrJa（forbidden＝権限がありません）", mineSettingsErrJa("bad key") === "設定項目が不正です" && mineSettingsErrJa("bad payslip_visibility") === "給与明細の表示の値が不正です" && mineSettingsErrJa("bad shift_request_mode") === "シフト希望の方式の値が不正です"
  && mineSettingsErrJa("bad type") === "設定値の型が不正です" && mineSettingsErrJa("bad patch") === "設定の更新内容が不正です" && mineSettingsErrJa("forbidden") === "権限がありません" && mineSettingsErrJa("bad nonsense_key").startsWith("処理できませんでした"));

// (4) 配線
const src = (p: string) => fs.readFileSync(p, "utf8");
const page = src("app/mine/page.tsx"), layout = src("app/mine/layout.tsx"), ranking = src("app/mine/ranking/page.tsx"), pa = src("app/mine/punch-actions.tsx"), kiosk = src("app/kiosk/page.tsx");
const panel = src("app/(manage)/master/mine-settings-panel.tsx"), spPage = src("app/(manage)/master/store-profile/page.tsx"), att = src("components/nox/payroll-attentions.tsx"), pb = src("app/(manage)/payroll/payroll-board.tsx");
check("mc(4-1) /mine page: mineSettingsOf(myStore?.settings_json)・punchStateOf(todayPunches)・drink_claim／punch_correction_request／ranking の出し分け・PunchActions state・見出し punchHeadOf・予約一覧は残す",
  page.includes("mineSettingsOf(myStore?.settings_json)") && page.includes("punchStateOf((todayPunches ?? [])") && page.includes("{ms.drink_claim && <DrinkClaimForm") && page.includes("{ms.punch_correction_request && meCast?.id && (") && page.includes("{ms.ranking && myRank && (")
  && page.includes("<PunchActions state={ps.state}") && page.includes("punchHeadOf(ps.state, ps.inAt)") && page.includes('<h3>指名予約（今日以降）</h3>') && (page.match(/from\("stores"\)/g) ?? []).length === 2);
check("mc(4-2) layout: 自店 settings_json → mineSettingsOf・ranking OFF でナビからランキングを外す（他 3 項目は不変・★M2: お知らせは noticeNavLabelOf）", layout.includes('from("stores").select("settings_json")') && layout.includes('.filter((i) => i.href !== "/mine/ranking" || ms.ranking)') && layout.includes('{ href: "/mine/notices", label: noticeNavLabelOf(unread) }'));
check("mc(4-3) ranking page: settings_json を読み ranking OFF は redirect(\"/mine\")", ranking.includes('select("id, name, settings_json")') && ranking.includes('if (!mineSettingsOf(store?.settings_json).ranking) redirect("/mine");'));
check("mc(4-4) punch-actions: punchButtonsOf(state)・disabled＝busy || !btn.*・PUNCH_STATE_NOTE の補助文・拒否は rpcErrJa・router.refresh・送る RPC と引数は不変", pa.includes("punchButtonsOf(state)") && pa.includes("disabled={busy || !btn.inEnabled}") && pa.includes("disabled={busy || !btn.outEnabled}") && pa.includes("disabled={busy || !btn.okuriEnabled}")
  && pa.includes("PUNCH_STATE_NOTE[state]") && pa.includes("error ? rpcErrJa(error.message)") && pa.includes("router.refresh()") && pa.includes('rpc("punch_self", type === "out" && okuriActual') && pa.includes('rpc("transport_issue_self", { p_punch_id: punchId })') && !pa.includes('"打刻に失敗しました"'));
check("mc(4-5) kiosk: 順序検査の拒否 3 語は rpcErrJa・他は従来の端末文言", kiosk.includes("/already in|already out|no open punch/.test(error.message) ? rpcErrJa(error.message)") && kiosk.includes("この端末は現在使用できません（店に確認してください）"));
check("mc(4-6) 店舗設定: MineSettingsPanel＝set_store_mine_settings に差分 patch・mineSettingsErrJa・contract_ack の入力なし・ranking OFF で他キャスト表示は不活性・店舗情報ページに配置（owner／manager）",
  panel.includes('rpc("set_store_mine_settings", { p_store_id: storeSel, p_settings: patch })') && panel.includes("mineSettingsPatchOf(cur, form)") && panel.includes("mineSettingsErrJa(error.message)") && !panel.includes('onOffRow("contract_ack"') && !panel.includes("contract_ack:")
  && panel.includes('onOffRow("ranking_show_others", !form.ranking)') && spPage.includes("<MineSettingsPanel stores=") && spPage.includes("<StoreProfilePanel stores="));
const openRow: AttentionRow = { id: "o1", cast_id: "c1", cast_name: "玲奈", kind: "open_punch", detail: { punch_id: "p1", punched_at: "2026-09-29T11:00:00Z", biz_date: "2026-09-29" }, created_at: "2026-09-30T00:00:00Z", resolved_at: null, resolved_by: null };
const finRow: AttentionRow = { ...openRow, id: "f1", kind: "post_finalize_punch", detail: { before: "2026-09-10T11:00:00Z", after: "2026-09-10T11:30:00Z", biz_date: "2026-09-10", punch_kind: "in" } };
check("mc(4-7) 注意行: open_punch の行「未閉鎖の出勤（前営業日以前）: 玲奈・9/29・出勤 20:00（退勤なし）」・翌期の調整へは post_finalize_punch だけ・部品は attentionCanCarry で出し分け・payroll-board は status で絞らない",
  attentionLineOf(openRow) === "未閉鎖の出勤（前営業日以前）: 玲奈・9/29・出勤 20:00（退勤なし）" && attentionLineOf(finRow) === "確定後の打刻修正: 玲奈・9/10・出勤 20:00→20:30" && attentionCanCarry(finRow) && !attentionCanCarry(openRow)
  && att.includes("{attentionCanCarry(r) && <button") && att.includes(">翌期の調整へ</button>") && pb.includes("{runInfo && (\n        <PayrollAttentions runId={runInfo.id}") && !pb.includes('(runInfo.status === "finalized" || runInfo.status === "paid") && (\n        <PayrollAttentions'), attentionLineOf(openRow));

if (fails.length) {
  console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-mine-cast-settings OK (${pass} checks)`);
console.log("キャスト画面の設定(便 M1・裁定326-1／326-8／追補3・327): mineSettingsOf 既定・型違い・patch / punchStateOf 3 状態・前営業日は未出勤 / 和文 7 種 / 配線（/mine・layout・ranking・punch-actions・kiosk・店舗設定・注意行）");
