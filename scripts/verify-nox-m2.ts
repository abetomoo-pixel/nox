/*
 * verify:nox-m2 — 便 M2（2026-10-27・Agoora 確定 10/27＝M-15／M-16（翌表記を除く）／M-18／M-19＋事後承認 A 15-③）。DB 不触（純関数＋逐語 grep）。
 *  M-15 390 の月カレンダー＝進行のバッジは上端の色帯・日付は左上・CSV／印刷は横並び
 *  M-16 必要人数の時間帯は 30 分刻みの選択式（00:00〜24:00・翌表記は 0189 の後）・期間作成の日付欄は全幅・「時間帯を設定する」中央・端末・印刷→キオスク端末（タブ 1 行）
 *  M-18 キャストの状態 5 つ＝待機中（緑）→着卓中（金）→出勤予定（青）→遅刻（赤）→退勤／休み（グレー）・並びも同じ・予約は日付が今日のときだけ今の着卓・打刻・遅刻
 *  M-19 確定シフトの日モーダルの「＋キャストを追加」＝その日専用（DayAddPanel）・月全体のまとめて追加は開かない
 *  A 15-③ オーナーの譲渡＝確認ダイアログ（相手の名前・「譲渡する」・主ボタン中央・DB 変更なし）
 */
import fs from "node:fs";
import { castPickerOrder, castStatusOf, castStatusLabelOf, lateIdsOf, lateContactLabelOf, CAST_STATUS_TONE } from "../lib/nox/register/cast-picker-order";
import { castBadgesOf } from "../lib/nox/register/reservation-badges";
import { HALF_HOUR_HMS, bandOptionsOf, etaOptionsOf, periodShortOf, shiftHmOptionsOf, dayAddStateOf } from "../lib/nox/shift/half-hour";
import { resolveMasterNav } from "../lib/nox/master/nav";
import { activeHrefOf } from "../lib/nox/ui/nav-tabs";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = JSON.stringify;
const css = src("app/globals.css"), sb = src("app/(manage)/shift/shift-board.tsx");

// ── M-15 ──
check("m2(15-1) 390 の月カレンダー＝バッジは上端の色帯（文字 0・高さ 5px・左右いっぱい）・日付は左上・凡例のバッジは文字のまま（.nox-callegend は対象外）",
  css.includes(".nox-cald.nox-cald2 .nox-cald-bd { left: 0; right: 0; top: 0; height: 5px; padding: 0; border-radius: 0; font-size: 0; line-height: 0; color: transparent; }")
  && css.includes(".nox-cald.nox-cald2 .nox-cald-n { left: 5px; top: 6px; font-weight: 700; }") && css.includes(".nox-cald.nox-cald2 { padding-top: 17px; overflow: hidden; }"));
check("m2(15-2) CSV／印刷は横並び（≤899＝セグメントは全幅 1 行・ボタン 2 つは次の行に並ぶ）",
  css.includes(".nox-plantools { margin-left: 0; width: 100%; flex-wrap: wrap; align-items: stretch; }") && css.includes(".nox-plantools > button { flex: 1 1 0; min-width: 0; }") && !css.includes(".nox-plantools > button { width: 100%; }"));

// ★M-15（補遺）: 下タブの現在地＝/shift 配下は「シフト」・他の画面も一括（app/(manage) の全 page が nav のどれかに当たる・/setup だけは初期設定のウィザード＝除外）
{
  const lay = src("app/(manage)/layout.tsx");
  const items = [...new Set([...lay.matchAll(/href: "(\/[a-z0-9/_-]+)"/g)].map((m) => m[1]))].map((href) => ({ href, label: href }));
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : e.name === "page.tsx" ? [d] : []));
  const routes = walk("app/(manage)").map((d) => d.replace("app/(manage)", "").replace(/\[[^\]]+\]/g, "x") || "/").filter((r) => r !== "/setup");
  const miss = routes.filter((r) => activeHrefOf(r, items) === "");
  check("m2(15-3) 下タブの現在地＝/shift と /shift?tab=… は「シフト」・app/(manage) の全画面が nav のどれかに当たる（/setup を除く）",
    activeHrefOf("/shift", items) === "/shift" && routes.length >= 30 && miss.length === 0, { miss, n: routes.length });
}

// ── M-16 ──
check("m2(16-1) 時間帯の選択肢＝30 分刻み 00:00〜24:00（49 個）・開始は 23:30 まで・終了は 00:30 から",
  HALF_HOUR_HMS.length === 49 && HALF_HOUR_HMS[0] === "00:00" && HALF_HOUR_HMS[1] === "00:30" && HALF_HOUR_HMS[47] === "23:30" && HALF_HOUR_HMS[48] === "24:00"
  && sb.includes("{bandOptionsOf(bhRows, nDow).from.map((v) => <option key={v} value={v}>{v}</option>)}") && sb.includes("{bandOptionsOf(bhRows, nDow).to.map((v) => <option key={v} value={v}>{v}</option>)}")
  && sb.includes('data-band-from="1"') && sb.includes('data-band-to="1"') && sb.includes("時間は 30 分刻みで 00:00〜24:00"));
check("m2(16-2) 期間作成の日付欄は ≤899 で全幅（ラベルの下に欄）・「時間帯を設定する」は .nox-actions（中央）",
  css.includes('.nox-periodform .pf-row > label:has(> input[type="date"]) { flex: 1 1 100%; display: flex; flex-direction: column; gap: 4px; }')
  && sb.includes('<div className="nox-actions" style={{ marginTop: 8 }}><button style={btnLight} onClick={gotoNeeds}>時間帯を設定する</button></div>'));
const nav = src("lib/nox/master/nav.ts"), sub = src("app/(manage)/master/master-subnav.tsx");
const sys = resolveMasterNav("/master/system", "", "");
check("m2(16-3) 端末・印刷→「キオスク端末」・ページ自身のタブ 1 行だけ（ownTabs＝サブナビはタブ行を出さない）・パンくずと hash の解決は従来どおり",
  !nav.includes('label: "端末・印刷"') && nav.includes('{ label: "キオスク端末", href: "/master/system", desc: "打刻・レジ端末、操作担当PIN、レシート・プリンタ", ownerOnly: true, ownTabs: true,')
  && sub.includes("const tabs = cur?.page.ownTabs ? [] : cur?.page.tabs ?? [];") && sys?.page.label === "キオスク端末" && sys?.page.ownTabs === true
  && !src("app/(manage)/master/mine-settings-panel.tsx").includes("端末・印刷"), sys?.page.label);

// ── M-18 ──
const sets = { seatedIds: new Set(["s"]), servingIds: new Set(["v"]), punchedInIds: new Set(["w", "s"]), shiftIds: new Set(["p", "l", "o"]), lateIds: new Set(["l"]), outIds: new Set(["o"]) };
const st = ["w", "s", "v", "p", "l", "o", "x"].map((id) => `${id}:${castStatusOf(id, sets)}:${castStatusLabelOf(id, sets)}`);
check("m2(18-1) 状態＝待機中（打刻あり・卓なし）／着卓中（自卓・他卓）／出勤予定（シフトあり）／遅刻（開始を過ぎて打刻なし）／退勤（最終が out）／休み（何もなし）",
  J(st) === J(["w:standby:待機中", "s:seated:着卓中", "v:seated:着卓中", "p:planned:出勤予定", "l:late:遅刻", "o:off:退勤", "x:off:休み"]), st);
check("m2(18-2) 色＝待機中 緑（ok）・着卓中 金（gold2）・出勤予定 青（blue）・遅刻 赤（bad）・退勤／休み グレー（muted）",
  J(CAST_STATUS_TONE) === J({ standby: "ok", seated: "gold2", planned: "blue", late: "bad", off: "muted" }));
const ord = castPickerOrder([{ id: "x", name: "あ" }, { id: "o", name: "い" }, { id: "l", name: "う" }, { id: "p", name: "え" }, { id: "s", name: "お" }, { id: "w", name: "か" }], sets);
check("m2(18-3) 並び＝待機中→着卓中→出勤予定→遅刻→退勤／休み（群の中は名前順）・working は待機中と着卓中",
  J(ord.map((c) => c.id)) === J(["w", "s", "p", "l", "x", "o"]) && J(ord.map((c) => c.group)) === J([1, 2, 3, 4, 5, 5]) && ord.filter((c) => c.working).length === 2, ord.map((c) => c.id));
const late = lateIdsOf([{ cast_id: "a", start_hm: "20:00" }, { cast_id: "b", start_hm: "21:00" }, { cast_id: "c", start_hm: "20:00" }, { cast_id: "d", start_hm: "25:00" }], 20 * 60 + 30, new Set(["c"]), new Set());
check("m2(18-4) 遅刻＝開始を過ぎて in／out 打刻なし（20:30 時点＝20:00 の a だけ・打刻済み c は除く・25:00 開始 d はまだ）", J([...late]) === J(["a"]), [...late]);
const bOther = castBadgesOf({ shifts: [{ cast_id: "a", start_hm: "20:00" }], attendance: [{ cast_id: "b", status: "off" }], seated: [{ castId: "a", seatName: "A3" }], today: null });
const bToday = castBadgesOf({ shifts: [{ cast_id: "a", start_hm: "20:00" }, { cast_id: "c", start_hm: "21:00" }], attendance: [], seated: [{ castId: "d", seatName: "B2" }], today: { punchedIn: new Set(["e", "d"]), out: new Set(["f"]), nowMin: 20 * 60 + 30 } });
check("m2(18-5) 予約のバッジ＝今日以外はその日のシフト（出勤予定 青）と休みだけ（今の着卓は使わない）・今日は待機中／着卓中（B2）／遅刻／出勤予定／退勤・並び（order）つき",
  bOther.get("a")?.label === "出勤予定 20:00" && bOther.get("a")?.tone === "blue" && bOther.get("b")?.label === "休み"
  && bToday.get("a")?.label === "遅刻（20:00〜）" && bToday.get("a")?.tone === "bad" && bToday.get("c")?.label === "出勤予定 21:00" && bToday.get("d")?.label === "着卓中（B2）" && bToday.get("e")?.label === "待機中" && bToday.get("e")?.tone === "ok" && bToday.get("f")?.label === "退勤"
  && bToday.get("e")?.order === 1 && bToday.get("d")?.order === 2 && bToday.get("c")?.order === 3 && bToday.get("a")?.order === 4 && bToday.get("f")?.order === 5, [...bToday.entries()]);
const cp = src("components/nox/cast-picker.tsx"), rb = src("app/(manage)/register/register-board.tsx"), rp = src("app/(manage)/register/reservation-panel.tsx");
check("m2(18-6) 配線＝CastPicker は grouped で状態の文字と色（castStatusLabelOf・CAST_STATUS_TONE）・バッジに order があれば状態の順→名前順・レジ 2 面は lateIds／outIds を渡す・予約は日付が今日のときだけ着卓と打刻を読む",
  cp.includes("castStatusLabelOf(c.id, sets)") && cp.includes("BADGE_STYLE[CAST_STATUS_TONE[status]]") && cp.includes("(badges?.get(a.id)?.order ?? 9) - (badges?.get(b.id)?.order ?? 9)")
  && (rb.match(/ grouped shiftIds=\{shiftIds\} lateIds=\{lateIds\} outIds=\{outIds\}/g) ?? []).length === 2 && rb.includes("const late = lateIdsOf(todayShifts, nowMin, todayIds, outIds);")
  && rp.includes("const isToday = badgeDate === bizToday;") && rp.includes("seated: ((isToday ? (nm ?? []) : [])"));

{
  const bh = [{ dow: 5, is_closed: false, open_hm: "20:00:00", close_hm: "01:00:00" }, { dow: 1, is_closed: false, open_hm: "19:00:00", close_hm: "23:30:00" }, { dow: 0, is_closed: true, open_hm: null, close_hm: null }];
  const fri = bandOptionsOf(bh, 5), mon = bandOptionsOf(bh, 1), sun = bandOptionsOf(bh, 0);
  check("m2(16-4) 時間帯の範囲＝その曜日の店の営業時間（翌日またぎは 24:00 まで＝翌は 0189 の後）・定休日／行なしは全範囲・曜日を変えたら範囲に寄せる",
    fri.from[0] === "20:00" && fri.from.at(-1) === "23:30" && fri.to.at(-1) === "24:00" && mon.from[0] === "19:00" && mon.to.at(-1) === "23:30" && sun.from.length === 48
    && sb.includes("if (!o.from.includes(nFrom)) setNFrom(o.from[0]);") && !sb.includes("20:0C"), { fri, mon: mon.to.at(-1) });
  const eo = etaOptionsOf("23:00");
  check("m2(16-5) 390 の必要人数フォームは 2 段（曜日／終日・開始〜終了・人数・追加）・M-3 の「その他」も 30 分刻みの選択式（24 時超えは翌）・期間一覧は「10/26〜11/1・締切 10/21」で折り返さない",
    sb.includes('<span className="nox-bandform-br" aria-hidden="true" />') && css.includes("@media (max-width: 599px) { .nox-bandform-br { display: block; flex-basis: 100%; height: 0; } }")
    && eo[0].value === "23:00" && eo[2].value === "24:00" && eo[2].label === "翌00:00" && src("app/mine/attendance-form.tsx").includes("etaOptionsOf(startHm).map") && !src("app/mine/attendance-form.tsx").includes("HmInput")
    && periodShortOf("2026-10-26", "2026-11-01", "2026-10-21") === "10/26〜11/1・締切 10/21" && periodShortOf("2026-11-02", "2026-11-15", null) === "11/2〜11/15・締切 —" && css.includes(".nox-period-short { white-space: nowrap; }"), eo.slice(0, 3));
}
{
  const cp2 = src("components/nox/cast-picker.tsx"), rp2 = src("app/(manage)/register/reservation-panel.tsx");
  check("m2(18-7) 補遺＝キャスト一覧の上に凡例 1 行（既存トークン）・遅刻連絡は「遅刻連絡 見込み HH:MM」（打刻まで遅刻＝赤）・390 の新規予約は日付・時刻・人数を 1 段",
    cp2.includes('data-cast-status-legend="1"') && lateContactLabelOf("21:30") === "遅刻連絡 見込み 21:30" && lateContactLabelOf("25:00") === "遅刻連絡 見込み 翌01:00" && lateContactLabelOf(null) === "遅刻連絡"
    && src("app/(manage)/register/register-board.tsx").includes("for (const id of lateEta.keys()) if (!todayIds.has(id) && !outIds.has(id)) late.add(id);")
    && rp2.includes('className="nox-rsv-dtp"') && css.includes(".nox-rsv-dtp { display: grid;"));
}

// ── M-19 ──
check("m2(19-1) 確定シフトの日モーダル＝その日専用の DayAddPanel（定休日は押せない）・月全体のまとめて追加（setAddModal）を開かない",
  sb.includes("data-roster-add={selDate}>") && sb.includes("＋ キャストを追加（定休日）") && sb.includes('onSaved={async () => { setMsg("確定シフトに追加しました"); await load(); }}')
  && !sb.includes('setAddDate(selDate); setAddStatus("confirmed"); setAddCast(null); setAddModal(true); }}>＋ キャストを追加</button>')
  && src("app/(manage)/shift/day-add-panel.tsx").includes('p_status: "confirmed"'));
{
  const dp = src("app/(manage)/shift/day-add-panel.tsx");
  const so = shiftHmOptionsOf(true), eo2 = shiftHmOptionsOf(false);
  check("m2(19-2) 補遺＝一覧はその日の状態つき（希望あり 青／シフトなし グレー／出勤不可 赤）・その日に入っている人は出さない・時間の既定は希望→店の営業時間（30 分刻み・翌表記）・複数人を同じ時間に・定休日はブロック・出勤不可は理由必須で p_override_reason",
    dayAddStateOf([{ start_hm: "21:00", end_hm: "25:00" }]).state === "wish" && dayAddStateOf([{ start_hm: "00:00", end_hm: "00:00", kind: "off" }]).state === "unavailable" && dayAddStateOf([]).state === "none"
    && so[0].value === "00:00" && so.at(-1)!.value === "23:30" && eo2.at(-1)!.label === "翌23:30"
    && dp.includes("casts.filter((c) => !assigned.has(c.id))") && dp.includes("start: st.wish?.start_hm.slice(0, 5) ?? preset?.[0] ?? FALLBACK_START") && dp.includes('data-day-add-all="1"') && dp.includes(">時間をそろえる</button>")
    && dp.includes("if (closed) {") && dp.includes("p_override_reason: r.needReason ? r.reason.trim() : null") && dp.includes("const blocked = rows.some((r) => r.needReason && r.reason.trim() === \"\");")
    && sb.split("<DayAddPanel date={selDate} casts={casts} photoUrls={photoUrls} bhRows={bhRows} wishes={wishAll} closed={isClosedDay(selDate)}").length - 1 === 3);
}
// ── BTN 追記（10/26 夜・75db8fc に未収載だった分） ──
{
  const cs = src("app/(manage)/master/cast-comp/comp-sections.tsx");
  check("m2(BTN-1) キャスト別の目標の表＝見出しと値を同じ揃え（右）・同じ幅・390 のカードは 1 行（名前＋採用した軸だけ「日数 12・同伴 4」・見出し語と期間は出さない）・まとめて入力の数値欄は 2 つ横並び各 50%",
    css.includes(".nox-normtable th.num, .nox-normtable td.num { width: 7.5em; text-align: right; }") && css.includes(".nox-rwrap table.nox-normtable td.nox-norm-period { display: none; }") && css.includes(".nox-rwrap table.nox-normtable td.nox-norm-name::before { content: none; }")
    && css.includes(".nox-rwrap table.nox-normtable td[data-short] ~ td[data-short]::before { content: \"・\" attr(data-short) \" \"; }") && css.includes(".nox-normbulk { display: grid !important; grid-template-columns: 1fr 1fr;")
    && cs.includes("data-short={NORM_AXIS_LABEL[k]}") && cs.includes('<td className="nox-norm-name">{c.name}</td>') && cs.includes('className="nox-normbulk"'));
}

// ── A 15-③ ──
const sf = src("app/(manage)/staff/staff-board.tsx");
check("m2(A-1) オーナーの譲渡＝オーナー本人だけ・相手は有効な管理者／店長・確認ダイアログ（相手の名前・「譲渡する」・.nox-actions 中央）→owner_transfer→画面を読み直す",
  sf.includes('roleRaw === "owner" && sel.is_active && !isSelf(sel) && rules0175On() && (sel.role === "admin" || sel.role === "manager")') && sf.includes(">オーナーを譲渡</button>")
  && sf.includes("オーナーを譲渡しますか？</h3>") && sf.includes('譲渡する相手：<b>{users[transferTo.user_id]?.name ?? "—"}</b>')
  && sf.includes('<div className="nox-actions">\n              <button style={btnGhost} disabled={busy} onClick={() => setTransferTo(null)}>やめる</button>') && sf.includes('rpc("オーナーを譲渡", "owner_transfer", { p_membership_id: transferTo.id })') && sf.includes(">譲渡する</button>"));

if (fails.length) { console.log(`verify:nox-m2 FAIL ${fails.length} / pass ${pass}`); for (const f of fails) console.log(" - " + f); process.exit(1); }
console.log(`verify:nox-m2 OK ${pass} checks（便 M2＝M-15／M-16（翌表記を除く）／M-18／M-19＋A 15-③）`);
