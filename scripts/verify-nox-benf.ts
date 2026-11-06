/*
 * verify:nox-benf — 便 F（2026-11-06・0197 便の後）の純関数と client の pin（DB は読まない＝f0 の末尾）。
 *  (1) M-116＝LINE の期限切れ ID トークン（verifyLineIdTokenEx の reason／detail・route の 401 本文・liff-bridge の 1 回だけ再ログイン＝sessionStorage の鍵）
 *  (2) M-112＝日報プレビューの 375（見出しの縦積み・指標の帯 4 列）／(3) M-113＝ランキングの 375（3 行・CSV 右寄せ）
 *  (4) M-114＝裁定459（LINE 通知の種類ごと ON／OFF・既定＝お知らせだけ ON・notifyCast の柵・催促・LINE 連携の表示・送信数カードの 1 行・お知らせの確認）
 *  (5) M-115＝gen-demo の pick ルール 1 本（ヘアメ代 ¥500）
 *  使い方: npm run verify:nox-benf
 */
import fs from "node:fs";
import { LINE_NOTIFY_DEFAULT, LINE_NOTIFY_KINDS, lineNotifyKindOfNotif, lineNotifyOf, lineNotifyOnOf, noticeLineConfirmOf } from "../lib/nox/line/notify-kinds";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = JSON.stringify;

// (1) M-116
const sv = src("lib/nox/line/server.ts"), bind = src("app/api/line/bind/route.ts"), ses = src("app/api/line/session/route.ts"), br = src("app/liff/[storeId]/liff-bridge.tsx");
check("benf(1-1) server＝verifyLineIdTokenEx＝reason（expired／invalid／aud／http／network）＋detail（LINE の error／error_description・id_token は出さない）・console.error・verifyLineIdToken は薄い包み",
  sv.includes("export async function verifyLineIdTokenEx(") && sv.includes('const reason: LineVerifyReason = /expired/i.test(detail) ? "expired" : res.status >= 500 ? "http" : "invalid";') && sv.includes("console.error(`line verify: ${res.status} ${reason} ${detail}`);")
  && sv.includes("const r = await verifyLineIdTokenEx(idToken, loginChannelId);") && !sv.includes("console.error(`line verify: ${idToken}") && !sv.includes("${idToken}"));
check("benf(1-2) route＝bind／session は verifyLineIdTokenEx・401 の本文に reason／detail", bind.includes('return NextResponse.json({ error: "bad id_token", reason: v.reason, detail: v.detail }, { status: 401 });') && ses.includes('return NextResponse.json({ error: "bad id_token", reason: v.reason, detail: v.detail }, { status: 401 });') && !bind.includes("verifyLineIdToken(") && !ses.includes("verifyLineIdToken("));
check("benf(1-3) liff-bridge＝401 bad id_token は sessionStorage の鍵（nox_liff_retry:<storeId>）で 1 回だけ liff.logout()→liff.login（redirectUri は M-102 の site 固定）・2 回目は期限切れの案内・成功で鍵を消す",
  br.includes('export const LIFF_RETRY_KEY_PREFIX = "nox_liff_retry:";') && br.includes('if (res.status === 401 && j.error === "bad id_token") {') && br.includes("if (!readRetry(key)) { writeRetry(key, true);") && br.includes("liff.logout(); liff.login({ redirectUri: siteHrefOf(window.location.href, siteOriginOf(window.location.origin)) }); return; }")
  && br.includes('setErr(j.reason === "expired" ? LIFF_EXPIRED_TEXT :') && br.includes("writeRetry(retryKeyOf(storeId), false);") && br.includes("LINE のログインが期限切れです。LINE アプリを閉じて開き直してください"));

// (2) M-112・(3) M-113
const rb = src("app/(manage)/report/report-board.tsx"), ab = src("app/(manage)/analytics/analytics-board.tsx"), css = src("app/globals.css");
check("benf(2-1) 日報プレビュー＝見出し（nox-rep-prevhead＝lbl nowrap・sw・bh）と指標の帯（nox-rep-kpiband）に印・480px 以下は縦積みと 4 列（td 25%）",
  rb.includes('<div className="nox-rep-prevhead"') && rb.includes('<span className="lbl" style={{ fontSize: 13, color: "var(--v2-text)", whiteSpace: "nowrap" }}>営業日</span>') && rb.includes('<span className="sw"') && rb.includes('<span className="bh"') && rb.includes('className="nox-tablewrap plain nw nox-rep-kpiband"')
  && css.includes(".nox-rep-prevhead .sw, .nox-rep-prevhead .bh { flex-basis: 100%; }") && css.includes(".nox-rep-kpiband td { display: inline-block; box-sizing: border-box; width: 25%;"));
check("benf(3-1) ランキング＝行は nm／cnt（本・場内・同伴）／cnt2（構成・報酬率）／amt に分け、480px 以下は grid 3 行（medal avatar name amt／cnt／cnt2）・CSV は見出しの下に右寄せ",
  ab.includes('<span className="nm">{r.name}</span>') && ab.includes('<span className="cnt num">本{r.hon}・場内{r.jonai}・同伴{r.dohan}</span>') && ab.includes('<span className="cnt2 num">') && ab.includes('<div className="nox-rank-head"') && ab.includes('<button className="csv"')
  && css.includes('grid-template-areas: "medal avatar name amt" "cnt cnt cnt cnt" "cnt2 cnt2 cnt2 cnt2";') && css.includes(".nox-rank-head .csv { flex-basis: 100%; margin-left: auto;"));

// (4) M-114＝裁定459
check("benf(4-1) 純関数＝既定はお知らせだけ ON・シフト系（公開／変更／催促）OFF・settings の line_notify で上書き・型違いは既定", J(lineNotifyOf(null)) === J(LINE_NOTIFY_DEFAULT) && LINE_NOTIFY_DEFAULT.notice === true && !LINE_NOTIFY_DEFAULT.shift_published && !LINE_NOTIFY_DEFAULT.shift_changed && !LINE_NOTIFY_DEFAULT.remind
  && lineNotifyOnOf({ line_notify: { shift_changed: true } }, "shift_changed") === true && lineNotifyOnOf({ line_notify: { notice: false } }, "notice") === false && lineNotifyOnOf({ line_notify: "x" }, "notice") === true && LINE_NOTIFY_KINDS.length === 4);
check("benf(4-2) 通知の kind → 種類＝shift_published／shift_*・availability_changed→shift_changed／催促の印→remind／それ以外→notice", lineNotifyKindOfNotif("shift_published") === "shift_published" && lineNotifyKindOfNotif("shift_added") === "shift_changed" && lineNotifyKindOfNotif("availability_changed") === "shift_changed" && lineNotifyKindOfNotif("other", { remind: true }) === "remind" && lineNotifyKindOfNotif("other") === "notice");
const cf1 = noticeLineConfirmOf({ recipients: 12, sent: 150, limit: 200 }), cf2 = noticeLineConfirmOf({ recipients: 60, sent: 150, limit: 200 });
check("benf(4-3) お知らせの確認文＝12 人に送ります（残り 50・送信後 38）／60 人は不足＝送らない", !cf1.blocked && cf1.text.includes("12 人に LINE で送ります（今月の残り 50 通・送信後 38 通）") && cf2.blocked && cf2.text.includes("残りは 50 通で、60 人には足りません"), J([cf1, cf2]));
const nf = src("lib/nox/people/notify.ts"), sb = src("app/(manage)/shift/shift-board.tsx"), lp = src("app/(manage)/master/line-config-panel.tsx"), qc = src("components/nox/line-quota-card.tsx"), nb = src("app/(manage)/notices/notices-board.tsx");
check("benf(4-4) notifyCast＝種類が OFF の店は LINE に送らない（line: \"off\"・通知の節には残る）・店の設定は castId→store で 1 回だけ読む・催促（shift-board）も同じ柵",
  nf.includes('if (p.line !== false && !(await lineNotifyAllowedOf(supabase, p.castId, p.lineKind ?? p.kind))) line = "off";') && nf.includes("const storeSettingsByCast = new Map<string, Promise<Record<string, unknown> | null>>();") && sb.includes('if (!(await lineNotifyAllowedOf(supabase, id, "other", { remind: true }))) continue;'));
check("benf(4-5) 店舗設定 › LINE 連携＝種類ごとの表示（data-line-notify-kinds・既定 ON／OFF・保存は 0198 の後の注記）と「1 回の送信＝友だち数ぶん・無料枠 200 通」の注記／送信数カードにライトプランの 1 行／お知らせ＝送る前に確認（不足なら送らない・notice OFF の店は掲載だけ）",
  lp.includes('data-line-notify-kinds="1"') && lp.includes("{LINE_NOTIFY_COUNT_NOTE}") && lp.includes("{LINE_NOTIFY_SAVE_PENDING_NOTE}") && qc.includes('data-line-quota-plan="1"') && qc.includes("{LINE_PLAN_UPGRADE_NOTE}")
  && nb.includes("const cf = noticeLineConfirmOf({ recipients: lineLinked ?? 0, sent: row?.sent ?? 0, limit: row?.monthly_limit ?? Number(st?.line_monthly_limit ?? 200) });") && nb.includes("else if (!window.confirm(cf.text)) { sendLine = false;"));

// (5) M-115
const gd = src("scripts/demo/gen-demo.mjs");
check("benf(5-1) gen-demo＝deductions に pick ルール 1 本（ヘアメ代 500・per day・agreed_cost・day_rule pick・is_active）", gd.includes('push("deductions", { id: uid(`ded:${code}:hairmake`), store_id: storeId, name: "ヘアメ代", amount: 500, per: "day", is_active: true, kind: "agreed_cost", day_rule: "pick" });'));

if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-benf ALL PASS (${pass} assertions)`);
