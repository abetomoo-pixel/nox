/**
 * verify:nox-b2 — 便 2（2026-11-11 夜・夜便レーン 1＝client・DDL なし）。DB は触らない（読むのは source と純関数だけ）。
 *  (1) 教訓142 店側エリアの全ページの先頭で共通の柵（キャストの入場・規約・初期設定）＝managePageGate
 *  (2) M-172 予想人件費は owner／manager だけ（シフト権限のスタッフに「¥0・時給未設定」を出さない）
 *  (3) M-170 要承認＝処理できる承認待ちを全部（ドリンク申告・予約の申請）・行き先
 *  (4) M-171 締めの権限が無い人の日報＝見出し「日報」・内部用語を業務の言葉に・「強行も可」は店長以上だけ
 *  (5) M-173 取得が終わるまで空を出さない（スタッフのシフト希望・ホームのランキング）／M-174 ◯×はその場で保存の説明・枠の時刻・保存の印
 *  (6) M-165 自分の申請に人数・「人数は希望です」／M-166 出勤日数の定義の 1 行／M-167 希望の説明を手順の言葉に／M-168 売上の順位は売上の軸だけ・「上の今月のバック」をやめる
 *  (7) vercel.json＝regions hnd1／キオスクの QR 読み取り＝jsQR を自前の配布物から（外部 CDN を読まない）
 */
import fs from "node:fs";
import path from "node:path";
import { pendingTotalOf } from "../lib/nox/home/pending";
import { SHIFT_MODE_NOTE, wishPageTextOf } from "../lib/nox/mine/wish-mode";
import { WISH_STATE_LABEL } from "../lib/nox/shift/wish-state";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

// (1) 教訓142
{
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name === "page.tsx" ? [path.join(d, e.name)] : []));
  const pages = walk("app/(manage)");
  const missing = pages.filter((f) => !/\n\s+await managePageGate\(\);/.test(src(f)) || !src(f).includes('import { managePageGate } from "@/lib/nox/nav/page-gate";'));
  check("b2(1-1) 教訓142 店側エリアの全ページ（page.tsx）の先頭で await managePageGate()", pages.length >= 33 && missing.length === 0, { pages: pages.length, missing });
  const g = src("lib/nox/nav/page-gate.ts");
  check("b2(1-2) 共通の柵の中身＝レイアウトと同じ 3 つ（castRegisterEntryOf・termsGateRedirectOf・setupGateRedirectOf）・キオスクの本人セッションは /register だけ",
    g.includes("const e = await castRegisterEntryOf(supabase);") && g.includes("redirect(`/mine?denied=register&why=${e.reason ?? \"not_allowed\"}`)") && g.includes("termsGateRedirectOf(isDemo, termsOk === true, pathname)") && g.includes("setupGateRedirectOf({ role, isDemo, needsSetup, pathname })") && g.includes('if (!onPath(pathname, "/register")) redirect("/register");'));
}
// (2) M-172
{
  const sb = src("app/(manage)/shift/shift-board.tsx");
  check("b2(2-1) M-172 予想人件費は owner／manager だけ（canSeeLabor）＝取得・日ごとの計算・今日の KPI・月の合計",
    sb.includes('const canSeeLabor = role === "owner" || role === "manager";') && sb.includes("if (!canSeeLabor) return; // staff/cast") && sb.includes("if (!canSeeLabor) return m; // ★M-172") && sb.includes("{canSeeLabor && todayFc && (") && sb.includes("{canSeeLabor && monthFcTotal > 0 && (") && !sb.includes("{isManagerUp && todayFc && ("));
}
// (3) M-170
{
  check("b2(3-1) M-170 見出しの数にドリンク申告を足す", pendingTotalOf({ approvals: [], wishes: [], missingOut: [], reservations: [1, 2], drinkClaims: 3 }) === 5 && pendingTotalOf({ approvals: [], wishes: [], missingOut: [] }) === 0);
  const r = src("app/api/home/pending/route.ts");
  check("b2(3-2) M-170 スタッフにも処理できる承認待ち（予約の申請・ドリンク申告＝RLS が承認の権限と同じ）・店長にもドリンク申告",
    r.includes('supabase.from("drink_claims").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("status", "pending")') && r.includes("total: rows.filter((r) => r.status === \"pending\").length + sReservations.length + sDrink") && r.includes("pendingTotalOf({ approvals, wishes, missingOut, reservations, drinkClaims })"));
  const c = src("components/nox/pending-card.tsx");
  check("b2(3-3) M-170 カード＝ドリンク申告の件数と行き先（このページの申告の一覧）・スタッフは予約の申請の件数とレジへ",
    c.includes('data-pending-drink={data.drinkClaims}') && c.includes('data-pending-staff-todo="1"') && c.includes('href="#drink-claim-queue"') && src("app/(manage)/register/drink-claim-queue.tsx").includes('<section id="drink-claim-queue"'));
}
// (4) M-171
{
  const rb = src("app/(manage)/report/report-board.tsx");
  check("b2(4-1) M-171 締めの権限が無い人＝見出し「日報」・「締めは店長が行います」・内部用語なし・強行は店長以上だけ",
    rb.includes('title={canClose ? "日報・締め管理" : "日報"}') && rb.includes("締めは店長が行います。") && !/(クライアント集計|サーバ再集計|open 伝票)/.test(rb.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")) && rb.includes('{isManagerUp ? "（店長は強行も可）" : ""}') && !rb.includes("（全伝票の会計が必要・強行も可）"));
}
// (5) M-173／M-174
{
  const ss = src("app/(manage)/shift/staff-shift-board.tsx");
  check("b2(5-1) M-173 スタッフのシフト希望＝取得が終わるまで「読み込み中」（枠なし・本人分 0 行を出さない）",
    ss.includes('data-staff-wish-loading="1"') && ss.includes("setLoaded(true);") && ss.includes('{loaded ? shifts.filter((s) => s.staff_id === myMid).length : "—"}'));
  const db = src("app/(manage)/dashboard/dashboard-board.tsx");
  check("b2(5-2) M-173 ホームのランキング＝取得の前に「データがありません」を出さない", db.includes('data-rank-loading="1"') && db.includes('{rankLoaded && rankAxis === "nom" && ranking.length === 0'));
  check("b2(5-3) M-174 ◯×は押すとその場で保存の説明・枠の時刻・保存の印", ss.includes("◯×は押すとその場で保存されます（提出のボタンはありません）") && ss.includes('data-wish-pattern-time="1"') && ss.includes('data-wish-saved="1"'));
}
// (6) M-165〜M-168
{
  const rc = src("app/mine/reservation-request-card.tsx");
  check("b2(6-1) M-165 自分の申請に人数・「人数は希望です。お店が確定します」", rc.includes("party_size, customers(name)") && rc.includes('data-rsv-party-row="1"') && rc.includes("人数は希望です。お店が確定します。"));
  check("b2(6-2) M-166 出勤日数の定義の 1 行（シフトのある日／打刻のある日）", src("app/mine/page.tsx").includes('data-mine-days-def="1"'));
  check("b2(6-3) M-167 希望の説明は手順の言葉（審査中・採用・確認待ち・採用・確定）・提出済みの日は押すと詳細",
    SHIFT_MODE_NOTE.includes(WISH_STATE_LABEL.pending) && SHIFT_MODE_NOTE.includes(WISH_STATE_LABEL.accepted_wait) && SHIFT_MODE_NOTE.includes(WISH_STATE_LABEL.accepted_fixed) && !SHIFT_MODE_NOTE.includes("採用された日が確定シフトになります")
    && wishPageTextOf("shift").markNote.includes("提出済みの日は押すと詳細") && wishPageTextOf("off_only").markNote.includes("提出済みの日は押すと詳細") && !wishPageTextOf("shift").markNote.includes("提出済みの日は選べません"));
  check("b2(6-4) M-168 売上の順位は売上の軸だけ・ドリンク申告の「上の今月のバック」をやめる",
    src("app/mine/ranking/page.tsx").includes('{axis === "sales" && mySales && (') && !src("app/mine/drink-claim-form.tsx").includes("上の「今月のバック」"));
}
// (6-5) 裁定483 マイナンバーの廃棄の候補＝「法定保存期間満了」「7 年を過ぎ」の言い切りを画面から外す
{
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const hit = ["app/(manage)/casts/casts-board.tsx", "app/(manage)/master/sensitive-tax-panel.tsx"].filter((f) => /法定保存期間満了|7 年を過ぎ、マイナンバー/.test(strip(src(f))));
  check("b2(6-5) 裁定483 廃棄の候補の説明と理由の例に「法定保存期間満了」「7 年を過ぎ」の言い切りが無い・判断はオーナー", hit.length === 0 && src("app/(manage)/casts/casts-board.tsx").includes("廃棄するかはオーナーが判断します。"), hit);
}
// (6-6) M-163 マイページの並び（並び替えだけ）＝今日の予定 → ドリンク申告 → 指名予約 → ノルマ → 明細 → 勤怠
{
  const mp = src("app/mine/page.tsx");
  const at = (s: string) => mp.indexOf(s);
  const seq = [at("<ScheduleCard tabs={scheduleTabs} />"), at("<DrinkClaimForm month={month} />"), at("<ReservationRequestCard "), at("<NormCard />"), at('<section className="nox-panel nox-print">'), at('data-mine-kintai="1"')];
  check("b2(6-6) M-163 マイページの並び＝予定 → ドリンク申告 → 指名予約 → ノルマ → 明細 → 勤怠", seq.every((x) => x > 0) && seq.every((x, i) => i === 0 || x > seq[i - 1]), seq);
}
// (7) vercel.json・jsQR
{
  const v = JSON.parse(src("vercel.json")) as { regions?: string[]; crons?: unknown[] };
  check("b2(7-1) vercel.json＝regions hnd1・cron 4 本（★2026-11-13 夜 相談役■2 e: 監査ログの 7 年の消去 audit-purge を足した）", JSON.stringify(v.regions) === '["hnd1"]' && (v.crons ?? []).length === 4 && (v.crons ?? []).some((c: { path: string }) => c.path === "/api/cron/audit-purge"));
  const kq = src("app/kq/kq-client.tsx");
  check("b2(7-2) キオスクの QR 読み取り＝jsQR は npm の jsqr を動的 import（外部 CDN を読まない）",
    kq.includes('(await import("jsqr")).default') && !kq.includes("cdnjs.cloudflare.com") && (JSON.parse(src("package.json")) as { dependencies: Record<string, string> }).dependencies.jsqr === "1.4.0");
}

if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-b2 ALL PASS (${pass} assertions)`);
