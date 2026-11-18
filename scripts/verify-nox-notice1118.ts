/*
 * verify:nox-notice1118 — 実機の通しで出た見せ方の直し（2026-11-18 夜・相談役 ⑥ C-1／C-5／C-6）。DB 不触・env 不要。
 *  n(1) お知らせ：ホームの「未確認・未回答」は赤い枠と赤い文字でいちばん上・ナビは赤い丸の件数（0 は出さない）。
 *  n(2) 出欠つきは「確認しました」を出さない（参加／不参加で確認済み＝notice_rsvp が acked_at を付ける）・出欠なしは今までどおり。
 *  n(3) 並び＝件名 → 日時・場所（太字）→ 本文 → 参加／不参加（キャスト・店の一覧・掲載確認・LINE プレビューと LINE の本文）・出欠の無い LINE の本文は今までと 1 文字も同じ。
 *  n(4) 「出欠を取る」を ON にしたら定型文の空の「日時：」「場所：」を外す（「議題：」は残す）・掲載期限は「11/19（木）」の書き方。
 *  n(5) 報酬率の段：「下げる額」に「金額には効きません」の注記（計算は downAmount を使わない）。
 *  n(6) ホームの時給はカードの中・2 つの見込みの違いを 1 行ずつ・キャストの「アカウント」のタブは見出しの列を固定して左寄せ（ログインと LINE は別の行）。
 */
import fs from "node:fs";
import { noticeHomePendingTextOf, noticeUntilLabelOf, rsvpTemplateBodyOf } from "../lib/nox/notices/response";
import { NOTICE_LINE_RSVP_TAIL, noticeLineTextOf } from "../lib/nox/line/notice-line";
import { PAY_RATE_DOWN_NOTE, payRateRowDownSetOf } from "../lib/nox/comp/pay-rate-tiers";
import { MINE_NEXT_WAGE_NOTE, MINE_WAGE_FORECAST_NOTE } from "../lib/nox/cast/current-wage";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, d?: unknown) { if (ok) pass++; else fails.push(`${label}${d !== undefined ? `: ${JSON.stringify(d)}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

const home = src("app/mine/page.tsx"), lay = src("app/mine/layout.tsx"), nav = src("components/ui/nav.tsx"), css = src("app/globals.css");
const iTop = home.indexOf('<div className="nox-printpage nox-minewrap nox-mv1 nox-mv1-m">'), iPend = home.indexOf("data-mine-notice-pending={noticePending}"), iPunch = home.indexOf("data-mine-punch-off=");
check("n(1-1) ホーム：未確認・未回答は赤い枠と赤い文字・いちばん上（打刻の上）", iTop > 0 && iPend > iTop && iPend < iPunch && home.includes('color: "var(--bad)", border: "2px solid var(--bad)" }} data-mine-notice-pending={noticePending}>{noticeHomePendingTextOf(noticePending)}') && noticeHomePendingTextOf(3) === "お知らせ：未確認・未回答 3 件");
check("n(1-2) ナビ：お知らせは赤い丸の件数（badge・0 は出さない）", lay.includes('{ href: "/mine/notices", label: "お知らせ", badge: unread }') && (nav.match(/\{it\.badge \? <span className="nox-tab-badge num"/g) ?? []).length === 2 && css.includes(".nox-tab-badge {") && !lay.includes("noticeNavLabelOf("));
const nr = src("components/nox/notice-respond.tsx");
check("n(2-1) 出欠つきは「確認しました」を出さず、答えたら「確認済み」・出欠なしは今までどおり", nr.includes("{n.rsvp ? (/* ★2026-11-18 夜（相談役 ⑥ C-1）") && nr.includes('local?.rsvp ? <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ok)" }} data-notice-acked="1">{NOTICE_ACKED}</span> : null') && nr.includes('onClick={() => void call("notice_ack")} data-notice-ack="1"'));
const mn = src("app/mine/notices/page.tsx"), nb = src("app/(manage)/notices/notices-board.tsx");
const order = (s: string, a: string, b: string, c: string) => { const x = s.indexOf(a), y = s.indexOf(b, x), z = s.indexOf(c, y); return x > 0 && y > x && z > y; };
check("n(3-1) キャストのお知らせ：日時・場所（NoticeRsvpInfo）→ 本文 → 掲載期限 → 参加／不参加（hideInfo）", order(mn, "{mig0201iOn() && <NoticeRsvpInfo n={n} />}", "{n.body as string}", "nowMs={nowMs} hideInfo />"));
check("n(3-2) 店の一覧：日時・場所 → 本文 → 掲載期限 → 参加／不参加・作る側の集計の重複の行は外す", order(nb, "{mig0201iOn() && <NoticeRsvpInfo n={n} />}", '<p className="nox-nbody">{n.body}</p>', "onDone={load} hideInfo />") && !nb.includes('{n.rsvp && <div className="num" style={{ color: "var(--ink)" }}>{rsvpLinesOf(n).join("・")}</div>}'));
check("n(3-3) 掲載確認：件名 → 日時・場所 → 本文 の見本・LINE プレビュー：件名 → 日時・場所 → 本文 → 案内", nb.includes('data-notice-confirm-preview="1"') && order(nb, "<b>{fTitle.trim() || \"お知らせの件名\"}</b>", "data-notice-preview-rsvp=\"1\"", "{NOTICE_LINE_RSVP_TAIL}"));
const lt0 = noticeLineTextOf({ storeName: "CLUB ACE", title: "ミーティング", body: "本文" });
const lt1 = noticeLineTextOf({ storeName: "CLUB ACE", title: "ミーティング", body: "本文", rsvpLines: ["日時 11/20（金）19:00", "場所 店"] });
check("n(3-4) LINE の本文：出欠なしは今までどおり・出欠つきは件名 → 日時・場所 → 本文 → 案内", lt0 === "【CLUB ACE】ミーティング\n\n本文" && lt1 === `【CLUB ACE】ミーティング\n\n日時 11/20（金）19:00\n場所 店\n\n本文\n\n${NOTICE_LINE_RSVP_TAIL}` && src("app/api/line/notice/route.ts").includes("rsvpLines: rsvpLinesOf(n as unknown as NoticeRsvpCols)"));
check("n(4-1) 定型文：空の「日時：」「場所：」を外す（値を入れた行と「議題：」は残す）・ON にしたときとテンプレートを選んだときに効く", rsvpTemplateBodyOf("全体ミーティングを行います。\n日時：\n場所：\n議題：\n遅れないように") === "全体ミーティングを行います。\n議題：\n遅れないように" && rsvpTemplateBodyOf("日時：11/20\n場所： ") === "日時：11/20" && nb.includes("if (e.target.checked) setFBody((v) => rsvpTemplateBodyOf(v));") && nb.includes("setFBody(fRsvp ? rsvpTemplateBodyOf(tpl.body) : tpl.body)"));
check("n(4-2) 掲載期限＝「11/19（木）」の書き方（キャスト・店の一覧）", noticeUntilLabelOf("2026-11-19") === "掲載期限 11/19（木）" && mn.includes("{noticeUntilLabelOf(n.until as string)}") && nb.includes("{noticeUntilLabelOf(n.until)}"));
const ed = src("app/(manage)/master/cast-comp/plan/pay-rate-tiers-editor.tsx"), cn = src("lib/nox/rules-0175/canon.ts");
check("n(5-1) 下げる額の注記（説明の段落と入れた段）・計算は downAmount を使わない", PAY_RATE_DOWN_NOTE.startsWith("下げる額は金額には効きません") && ed.includes("{PAY_RATE_DOWN_NOTE}。") && ed.includes("{payRateRowDownSetOf(r) && <span") && payRateRowDownSetOf({ at: "", up: "", down: "500", back: "", pay: "" } as never) && !payRateRowDownSetOf({ at: "", up: "", down: " ", back: "", pay: "" } as never) && (cn.match(/downAmount/g) ?? []).length === 2);
check("n(6-1) ホームの時給：カード（h3 時給）の中・2 つの見込みの違いの 1 行", home.includes('<section className="nox-panel" data-mine-wage-card="1">') && home.includes("{MINE_WAGE_FORECAST_NOTE}") && home.includes("{MINE_NEXT_WAGE_NOTE}") && MINE_WAGE_FORECAST_NOTE.includes("この期") && MINE_NEXT_WAGE_NOTE.includes("次の期"));
const cb = src("app/(manage)/casts/casts-board.tsx");
check("n(6-2) アカウントのタブ：見出しの列を固定・左寄せ・ログインと LINE は別の行・狭い画面は 1 列", cb.includes('<div className="nox-acct" data-cast-account-rows="1">') && css.includes(".nox-acct .nox-frow { display: grid; grid-template-columns: 112px minmax(0, 1fr);") && css.includes("@media (max-width: 480px) { .nox-acct .nox-frow { grid-template-columns: minmax(0, 1fr); } }") && cb.indexOf('<span className="k">LINE 連携</span>') > cb.indexOf('<span className="k">ログイン（マイページ）</span>') && cb.slice(cb.indexOf('<span className="k">ログイン（マイページ）</span>'), cb.indexOf('<span className="k">LINE 連携</span>')).includes('<div className="nox-frow">'));

if (fails.length) { console.error(`✗ verify:nox-notice1118 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-notice1118 OK (${pass} checks)`);
