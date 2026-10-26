/*
 * verify:nox-shb2 — 便 SH-UI-b2（2026-10-23）: 期間の地色・ロゴでホーム・提出一覧から処理・単日表記の係留（純関数＋逐語 grep・DB 不触）。
 *   npm run verify:nox-shb2（env 不要）。
 *  (1) periodCellStageOf／periodCellClassOf＝募集中／配置中（締切後の open も）／公開済み／期間なし の 4 種で class が変わる・境目＝pb-l／pb-r・凡例 4 つの語
 *  (2) shift-board＝③④①のカレンダーが periodCellClsOf を使い旧 periodBgOf が無い・期間なしの日を押すと openNewPeriodAt（setPStart(ymd)→①）・凡例の旧文が無い
 *  (3) ロゴ＝サイドバー（homeHref・manage は "/"）・上部バー（"/"）・/mine（"/mine"）・/demo（"/demo"）・/lp（"/lp"）・aria-label「ホームへ」・/ は role で振り分け（app/page.tsx）
 *  (4) wishRowsOf＝4 状態（未処理／確定／調整中／見送り）・unprocessedWishIdsOf＝未処理の出勤希望だけ・確定した希望は 未処理 でなくなる（③の承認リスト＝pending だけ＝同じデータ）・提出一覧の行の操作が decide／setAdjWish／approveAllWishes（③と同じ）
 *  (5) 単日区間の表記「10/22」（B2-0b）
 */
import fs from "node:fs";
import { PERIOD_LEGEND, periodBoundaryClassOf, periodBoundaryOf, periodCellClassOf, periodCellStageOf, unprocessedWishIdsOf, wishRowStateOf, wishRowsOf } from "../lib/nox/shift/period-cell";
import { wageSpanLabelOf, wageSpansOf } from "../lib/nox/payroll/wage-spans";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: string) => { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

const P = [
  { id: "a", start_date: "2026-10-22", end_date: "2026-10-28", wish_deadline: "2026-10-17", status: "published" },
  { id: "b", start_date: "2026-10-29", end_date: "2026-11-04", wish_deadline: "2026-10-25", status: "open" },
  { id: "c", start_date: "2026-11-05", end_date: "2026-11-11", wish_deadline: "2026-11-01", status: "open" },
];
const today = "2026-10-23";
check("shb2(1-1) 期間の状態 4 種＝公開済み／募集中／配置中（締切後の open＝11/5〜 は締切 11/1 を 11/3 時点で過ぎている）／期間なし", periodCellStageOf(P, "2026-10-23", today) === "published" && periodCellStageOf(P, "2026-10-30", today) === "open" && periodCellStageOf(P, "2026-11-06", "2026-11-03") === "closed" && periodCellStageOf(P, "2026-11-12", today) === "none");
check("shb2(1-2) class＝pst-open／pst-closed／pst-published／pst-none・凡例 4 つ（募集中／配置中／公開済み／期間なし）", periodCellClassOf("open") === "pst-open" && periodCellClassOf("none") === "pst-none" && PERIOD_LEGEND.map(([, l]) => l).join("/") === "募集中/配置中/公開済み/期間なし");
check("shb2(1-3) 境目＝10/28 は右（翌日は別期間）・10/29 は左・10/25 は無し・11/11 は右（翌日は期間なし）", periodBoundaryClassOf(periodBoundaryOf(P, "2026-10-28")) === "pb-r" && periodBoundaryClassOf(periodBoundaryOf(P, "2026-10-29")) === "pb-l" && periodBoundaryClassOf(periodBoundaryOf(P, "2026-10-25")) === "" && periodBoundaryClassOf(periodBoundaryOf(P, "2026-11-11")) === "pb-r");
const sb = src("app/(manage)/shift/shift-board.tsx");
check("shb2(2-1) shift-board＝periodCellClsOf を 2 つのカレンダーで使う・旧 periodBgOf／periodToneOf は無い・data-period-stage", sb.includes("<CalCell key={ymd} ymd={ymd} stat={st} stage={stage}") /* ★便 SH-UI-c2 C2-19: セル＝CalCell（① のカレンダーは ③ へ） */ && !sb.includes("periodBgOf") && !sb.includes("periodToneOf") && (sb.match(/periodCellStageOf\(periodsAll, ymd, bizToday\)/g) ?? []).length >= 2);
check("shb2(2-2) 期間なしの日を押す＝①の新規作成へ開始日を入れて遷移（openNewPeriodAt＝resetPeriodForm→setPStart(ymd)→setTab(\"build\")）・セルに「期間なし」の字", sb.includes('const openNewPeriodAt = (ymd: string) => { resetPeriodForm(); setPStart(ymd); setPTouched(true); setPMsg(null); setDayModal(""); setTab("build"); };') && sb.includes("if (periodNoneOf(ymd) && isManagerUp) { openNewPeriodAt(ymd); return; }") && fs.readFileSync("lib/nox/shift/cal-cell.ts", "utf8").includes('none: "期間なし"') /* ★便 SH-UI-c2 C2-19: 「期間なし」は右上バッジ（STAGE_WORD） */);
check("shb2(2-3) 凡例＝PERIOD_LEGEND の 4 つ（data-period-legend）・旧文「凡例: セルの地色＝その日が属する期間」は無い", sb.includes('data-period-legend="1"') && sb.includes("PERIOD_LEGEND.map(([k, label]) =>") && !sb.includes("凡例: セルの地色＝その日が属する期間"));
const css = src("app/globals.css");
check("shb2(2-4) CSS＝pst-open（primary-soft）／pst-closed（warning-soft）／pst-published（緑）／pst-none（card2）・境目 pb-l／pb-r 1px・凡例の色箱", css.includes(".nox-cald.pst-open { background: var(--primary-soft); }") && css.includes(".nox-cald.pst-closed { background: var(--warning-soft); }") && css.includes(".nox-cald.pst-published { background: rgba(77,195,125,.14); }") && css.includes(".nox-cald.pb-l { border-left: 1px solid var(--line2); }") && css.includes(".nox-plegend-it.pst-none i { background: var(--card2); }"));
// (3) ロゴ
check("shb2(3-1) ロゴ＝サイドバー（Link homeHref・既定 \"/\"）・上部バー（\"/\"・390px の折りたたみ時も同じ Link）・aria-label「ホームへ」", src("components/ui/side-nav.tsx").includes('<Link href={homeHref} aria-label="ホームへ" className="nox-brandlink" data-brand-home={homeHref}><BrandLogo height={34} /></Link>') && src("components/ui/side-nav.tsx").includes('homeHref = "/"') && src("app/(manage)/layout.tsx").includes('<Link href="/" className="crumb nox-tb-brand" aria-label="ホームへ" data-brand-home="/">') && src("app/(manage)/layout.tsx").includes('homeHref="/"'));
check("shb2(3-2) /mine＝\"/mine\"・/demo＝\"/demo\"・/lp＝\"/lp\"・/ は role で振り分け（cast→/mine・他→/dashboard）", src("app/mine/layout.tsx").includes('<Link href="/mine" aria-label="ホームへ" className="nox-brandlink" data-brand-home="/mine">') && src("app/demo/page.tsx").includes('data-brand-home="/demo"') && src("app/lp/page.tsx").includes('data-brand-home="/lp"') && src("app/page.tsx").includes('redirect(role === "cast" ? "/mine" : "/dashboard");') && css.includes(".nox-brandlink { display: inline-block; line-height: 0; cursor: pointer; }"));
// (4) 提出一覧の行
const W = [
  { id: "w1", cast_id: "hinano", date: "2026-10-29", start_hm: "20:00", end_hm: "26:00", status: "pending", kind: "work" },
  { id: "w2", cast_id: "hinano", date: "2026-10-31", start_hm: "20:00", end_hm: "26:00", status: "accepted", kind: "work" },
  { id: "w3", cast_id: "hinano", date: "2026-11-03", start_hm: "20:00", end_hm: "26:00", status: "accepted", kind: "work" },
  { id: "w4", cast_id: "hinano", date: "2026-11-01", start_hm: "", end_hm: "", status: "pending", kind: "off" },
  { id: "w5", cast_id: "hinano", date: "2026-11-02", start_hm: "20:00", end_hm: "26:00", status: "rejected", kind: "work" },
  { id: "w6", cast_id: "sena", date: "2026-10-30", start_hm: "20:00", end_hm: "26:00", status: "pending", kind: "work" },
];
const S = [
  { id: "s2", cast_id: "hinano", date: "2026-10-31", start_hm: "20:00", end_hm: "26:00", status: "confirmed", wish_id: "w2" },
  { id: "s3", cast_id: "hinano", date: "2026-11-03", start_hm: "20:00", end_hm: "26:00", status: "proposed", wish_id: "w3" },
];
const rows = wishRowsOf(W, S, "hinano", P[1]);
check("shb2(4-1) wishRowsOf＝そのキャスト・その期間だけ（5 件・日付順・せな は入らない）・4 状態＝未処理／確定（confirmed）／調整中（proposed）／見送り", rows.length === 5 && rows.map((r) => r.state).join(",") === "未処理,確定,未処理,見送り,調整中" && rows[0].wish.id === "w1" && rows.every((r) => r.wish.cast_id === "hinano"), rows.map((r) => `${r.wish.id}:${r.state}`).join(","));
check("shb2(4-2) 一括確定の件数＝未処理の出勤希望だけ（休み希望 w4 は入らない）＝1・確定した希望（accepted）は未処理でなくなる＝③の承認リスト（pending）から消える（同じデータ）", JSON.stringify(unprocessedWishIdsOf(rows)) === JSON.stringify(["w1"]) && wishRowStateOf({ ...W[0], status: "accepted" }, { ...S[0], wish_id: "w1" }) === "確定" && wishRowStateOf(W[0], null) === "未処理");
check("shb2(4-3) shift-board＝提出一覧の行を押すと希望一覧（data-shift-submit-detail）・操作＝確定（decide(id,true)）／調整（setAdjWish）／見送り（decide(id,false)）／再調整（setAdjTarget）＝③と同じ関数・一括確定（approveAllWishes・件数）・未提出は催促（有効＝ON-3）", sb.includes("data-shift-submit-detail={c.id}") && sb.includes("onClick={() => void decide(r.wish.id, true)}>確定</button>") && sb.includes("onClick={() => { setAdjWish(r.wish); setWStart(r.wish.start_hm); setWEnd(r.wish.end_hm); }}>調整</button>") && sb.includes("onClick={() => void decide(r.wish.id, false)}>見送り</button>") && sb.includes("onClick={() => { void approveAllWishes(todo); }}>未処理を一括確定（{todo.length} 件）</button>") && sb.includes('data-submit-remind={c.id} onClick={() => void remindOne(c.id, p)}>') /* ★便 ON-3（0176 ★5 (d)）: 催促は有効＝cast_notification_create（kind other）＋LINE */);
check("shb2(4-4) 390px＝希望行は 2 列・操作は全幅で縦並び中央（CSS）", css.includes(".nox-wishrow { grid-template-columns: 1fr 1fr; }") && css.includes(".nox-wishrow-acts { grid-column: 1 / -1; flex-direction: column; justify-content: center; align-items: stretch; }"));
// (5) 単日表記
const sp = wageSpansOf([{ d: 21, hours: 5, hourly: 3200, basis: "保証", gua: true }, { d: 22, hours: 6, hourly: 2200, basis: "保証" }], { timePay: 3200 * 5 + 2200 * 6 });
check("shb2(5-1) 1 日だけの区間＝「10/22」の単日表記・複数日は「10/1〜10/21」のまま", wageSpanLabelOf(sp[1], "2026-10", false) === "時給 ¥2,200/h × 6h（10/22・基本）" && wageSpanLabelOf({ fromD: 1, toD: 21, hourly: 3200, hours: 88.9, pay: 1, kind: "保証" }, "2026-10", false) === "時給 ¥3,200/h × 88.9h（10/1〜10/21・保証）");

if (fails.length) { console.error(`verify:nox-shb2 FAIL (${fails.length})\n- ${fails.join("\n- ")}`); process.exit(1); }
console.log(`verify:nox-shb2 OK (${pass} checks)\n便 SH-UI-b2: 期間の地色（4 種＋境目＋凡例）・ロゴでホーム・提出一覧から処理（同じ RPC・4 状態）・単日表記`);
