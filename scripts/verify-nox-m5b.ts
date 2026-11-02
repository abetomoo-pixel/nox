/*
 * verify:nox-m5b — 便 M5b（2026-11-02・client のみ・DDL なし）: 共通部品（単位つき入力・時刻・さらに表示・追加ボタン）と配線。
 *  (1) M-51 純関数＝hmLabelOf（24 時以上は「翌02:00」）・hmPickOf（開始より前は翌日＝+24 時・上限を超えない）
 *  (2) M-50 単位つき入力＝.nox-unit（¥ は左の箱・円／% は右の箱）・MoneyInput は ¥ の箱で「円」を付けない・UnitInput は ¥ と 円 を両方描かない
 *  (3) M-51 時刻＝type="time" の欄が app／components に残らない・HmInput を使う画面が残らない（部品は残る）・基本の働き方は TimeInput（15 分・店の営業時間）
 *  (4) M-52／M-53／M-55／M-56／M-57／M-58／M-59／M-60 の配線
 *  使い方: npm run verify:nox-m5b（env 不要・DB 不触）
 */
import fs from "node:fs";
import path from "node:path";
import { hmLabelOf, hmPickOf } from "../lib/nox/time/hhmm";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".tsx") ? [path.join(d, e.name)] : []));
const tsx = [...walk("app"), ...walk("components")];

// (1)
check("m5b(1-1) hmLabelOf: 26:00→翌02:00・24:30→翌00:30・20:00→20:00・9:05→09:05・空は空・形違いはそのまま", hmLabelOf("26:00") === "翌02:00" && hmLabelOf("24:30") === "翌00:30" && hmLabelOf("20:00") === "20:00" && hmLabelOf("9:05") === "09:05" && hmLabelOf("") === "" && hmLabelOf(null) === "" && hmLabelOf("abc") === "abc");
check("m5b(1-2) hmPickOf: 開始 20:00 で 02:00→26:00・21:00→21:00・開始なしは当日・上限 23 は +24 しない", hmPickOf(2, 0, "20:00") === "26:00" && hmPickOf(21, 0, "20:00") === "21:00" && hmPickOf(2, 0, null) === "02:00" && hmPickOf(2, 0, "20:00", 23) === "02:00" && hmPickOf(20, 0, "20:00") === "20:00");

// (2)
const css = src("app/globals.css"); const ui = src("components/ui/unit-input.tsx"); const money = src("components/ui/money-input.tsx");
check("m5b(2-1) .nox-unit（一体の枠・数値右寄せ・pre は左の箱）＋UnitBox の包み（中の入力の枠を消す）", css.includes(".nox-unit { display: inline-flex;") && css.includes(".nox-unit em.pre {") && css.includes(".nox-unitbox input { border: 0 !important;") && ui.includes("export function UnitBox("));
check("m5b(2-2) UnitInput は ¥ と 円 を両方描かない・MoneyInput は ¥ の箱だけ（円なし）", ui.includes('const right = pre === "¥" && unit === "円" ? undefined : unit;') && money.includes('<em className="pre" aria-hidden="true">¥</em>') && !money.includes(">円</span>"));
const boxUsers = ["app/(manage)/register/register-board.tsx", "app/(manage)/master/cast-comp/plan/plan-editor.tsx", "app/(manage)/master/cast-comp/comp-sections.tsx", "components/simulator-panel.tsx", "app/(manage)/master/staff-shift-panel.tsx", "app/(manage)/shift/shift-board.tsx", "app/(manage)/master/deduction-panel.tsx", "app/(manage)/register/reservation-panel.tsx", "app/(manage)/master/store-profile-panel.tsx", "app/(manage)/master/products/products-board.tsx", "app/(manage)/master/pricing/pricing-board.tsx"];
check("m5b(2-3) 欄の外に浮いた単位をやめた画面＝UnitBox／UnitInput を使う（11 ファイル）", boxUsers.every((f) => /<UnitBox |<UnitInput /.test(src(f))), boxUsers.filter((f) => !/<UnitBox |<UnitInput /.test(src(f))));
check("m5b(2-4) register の ¥／円 の浮き（裁定253 R10 の 2 か所）が残らない", !src("app/(manage)/register/register-board.tsx").includes('<span style={{ fontSize: 12, color: "var(--sub)" }}>円</span>'));

// (3)
const timeLeft = tsx.filter((f) => src(f).includes('type="time"'));
const hmLeft = tsx.filter((f) => src(f).includes("<HmInput "));
check("m5b(3-1) type=\"time\" の欄が app／components に残らない・<HmInput を使う画面が残らない（部品 hm-input.tsx は残る）", timeLeft.length === 0 && hmLeft.length === 0 && fs.existsSync("components/ui/hm-input.tsx"), { timeLeft, hmLeft });
const av = src("components/nox/availability-editor.tsx");
check("m5b(3-2) 基本の働き方＝TimeInput（15 分刻み・開始は店の営業開始・終了は開始より前なら翌日）・入力型のテキスト欄は無い", av.includes("<TimeInput value={hm(r.from_min)} step={15} maxHour={23} startAt={bh[r.dow]?.open ?? null}") && av.includes("<TimeInput value={hm(r.to_min)} step={15} after={hm(r.from_min) || bh[r.dow]?.open || null}") && av.includes('from("store_business_hours")') && !av.includes('placeholder="26:00"'));
check("m5b(3-3) 特別営業日の時刻の初期値＝店の営業時間（固定 20:00〜26:00 をやめた）", src("components/nox/special-days-panel.tsx").includes('from("store_business_hours")'));
const tl = tsx.filter((f) => /\{hmLabelOf\(/.test(src(f))).length;
check("m5b(3-4) 日をまたぐ時刻の表示＝hmLabelOf（「翌02:00」）を 10 画面以上で使う", tl >= 10, tl);

// (4)
const wz = src("app/(manage)/setup/setup-wizard.tsx");
check("m5b(4-1) M-52 値段とバックは同じ幅・円／% は小さな 2 択（radiogroup）・「区分ごと」「削除」は 1 行（.nox-rowacts）", wz.includes('<span className="nox-mini2" role="radiogroup" aria-label="バックの単位">') && wz.includes('<span className="nox-rowacts">') && wz.includes("<col style={{ width: 150 }} /><col style={{ width: 210 }} />"));
check("m5b(4-2) M-53 段は 1 行（.nox-tierrow）・しきい値の単位＝売上 ¥／pt／%・業態で方式が変われば段を作り直す", wz.includes('className="nox-tierrow"') && src("lib/nox/setup/v5.ts").includes("if (n.pay.slide !== t.pay.slide) n.slideTiers = slideTiersFor(t.pay.slide);"));
check("m5b(4-3) M-57 キープ欄はボトルの表だけ・見出し「ボトルキープ可」＋「お客様の名前で預かれる」", wz.includes("isBottleCat(c) && <th") && wz.includes(">ボトルキープ可<small") && wz.includes("お客様の名前で預かれる"));
const ab = src("components/ui/add-button.tsx");
check("m5b(4-4) M-55 追加ボタン＝AddButton（中央・主ボタン大）を /casts・/staff・/customers・席で使う", ab.includes('className="nox-addbar"') && ["app/(manage)/casts/casts-board.tsx", "app/(manage)/staff/staff-board.tsx", "app/(manage)/customers/customers-board.tsx", "app/(manage)/master/seats/seats-board.tsx"].every((f) => src(f).includes("<AddButton ")));
check("m5b(4-5) M-56 /casts の集計 5 枚＝.nox-repsum.five・狭い幅は 3＋2", src("app/(manage)/casts/casts-board.tsx").includes('<div className="nox-repsum five">') && css.includes(".nox-repsum.five > :nth-child(-n+3) { grid-column: span 2; }"));
const sb = src("app/(manage)/shift/shift-board.tsx");
check("m5b(4-6) M-58 当日追加配置＝今日の営業日（bizToday）で固定の DayAddPanel・見出し「M/D（曜）に追加配置」", sb.includes('data-today-add="1" onClick={() => setTodayAdd(true)') && sb.includes("<DayAddPanel date={bizToday}") && sb.includes("に追加配置</h3>"));
check("m5b(4-7) M-59 注目ポイント＝.nox-hlrow（768 以下は縦積み・名前／金額／構成比）", src("app/(manage)/analytics/analytics-board.tsx").includes('<div className="nox-listrow nox-hlrow" data-hl="top">') && css.includes("@media (max-width: 768px) {\n  .nox-hlrow { flex-direction: column;"));
const lm = src("components/ui/load-more.tsx");
check("m5b(4-8) M-60 さらに表示＝useLoadMore（顧客 50・キャスト 24・スタッフ 50）・顧客は 1,000 行ずつ読み足す（range）", lm.includes("export function useLoadMore") && src("app/(manage)/customers/customers-board.tsx").includes("useLoadMore(display, 50,") && src("app/(manage)/customers/customers-board.tsx").includes(".range(from, from + 999)") && src("app/(manage)/casts/casts-board.tsx").includes("useLoadMore(shownCasts, 24,") && src("app/(manage)/staff/staff-board.tsx").includes("useLoadMore(mems, 50,"));

if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-m5b ALL PASS (${pass} assertions)`);
console.log("便 M5b: 単位つき入力・時刻（翌の表示）・段 1 行・キープ欄・追加ボタン・集計 5 枚・当日追加配置・注目ポイント・さらに表示");
