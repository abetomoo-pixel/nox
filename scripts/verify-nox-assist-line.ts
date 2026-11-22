/*
 * verify:nox-assist-line — 2026-11-22（相談役 17:50 の 2・DB 変更 0）: 運営の代行の ② LINE 連携を運営元だけで終えられるように。
 *  (a) LIFF エンドポイント URL と Webhook URL を出す＝店の側（店舗設定 ＞ LINE 連携の「詳しい設定」）と同じ部品（components/nox/line-urls.tsx）・写しのボタン・LINE の側のどこに貼るかを 1 行ずつ
 *      値は店の ID とサイトの origin から作る純関数（DB の読取の関数は要らない＝代行の画面はすでに店の行を読んでいる）
 *  (b) 4 段目の見出し「連携の確かめ」（上の札の並びも）
 *  (c) ボットの ID の欄の下に、どこで分かるか（公式アカウントの管理画面のベーシック ID）
 *  (d) 確かめが通ったとき＝「確かめ済み（日時）」と「連携を確かめました（日時）」・通らなかったとき＝理由ごとの文（運営の柵の語は日本語に）
 *  使い方: npm run verify:nox-assist-line（env 不要・DB 不触）
 */
import fs from "node:fs";
import { assistErrJa, BOT_BASIC_ID_WHERE, lineStepsOf, opsGateErrJa, verifiedAtJa } from "../lib/nox/ops/assist";
import { LINE_URL_ROWS } from "../components/nox/line-urls";
import { liffEntryUrlOf, webhookUrlOf } from "../lib/nox/line/liff-endpoint";
import { LINE_VERIFY_REASON } from "../lib/nox/line/verify-channel";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const wz = src("app/ops/orgs/[id]/assist/assist-wizard.tsx"), lp = src("app/(manage)/master/line-config-panel.tsx"), lu = src("components/nox/line-urls.tsx");

// (a)
check("(a) 共通の部品＝2 つの URL（liffEntryUrlOf／webhookUrlOf）・写しのボタン・どこに貼るか 1 行ずつ", lu.includes("liffEntryUrlOf(origin, storeId)") && lu.includes("webhookUrlOf(origin, storeId)") && lu.includes('{copied === k ? "コピーしました ✓" : "コピー"}') && LINE_URL_ROWS.length === 2 && LINE_URL_ROWS.every((r) => r.where.startsWith("LINE Developers の") && r.where.includes("に貼る")));
check("(a) 店の側と代行が同じ部品（店の側は origin をそのまま・代行は siteOriginOf を通す・店の ID は代行の画面の props）", lp.includes("<LineUrls origin={origin} storeId={storeId} />") && wz.includes('<LineUrls origin={siteOriginOf(typeof window !== "undefined" ? window.location.origin : "")} storeId={p.storeId} />') && src("app/ops/orgs/[id]/assist/page.tsx").includes("storeId: store.id as string,"));
const O = "https://noxapp.jp", S = "00000000-0000-4000-8000-0000000000a1";
check("(a) 値の形＝<site>/liff/<店>・<site>/api/line/webhook/<店>", liffEntryUrlOf(O, S) === `${O}/liff/${S}` && webhookUrlOf(O, S) === `${O}/api/line/webhook/${S}`, [liffEntryUrlOf(O, S), webhookUrlOf(O, S)]);
// (b)
const ls = lineStepsOf({ login_channel_id: true, liff_id: true, bot_basic_id: true, channel_secret_ref: true, access_token_ref: true, line_verified_at: "2026-11-22T09:05:00Z" });
check("(b) 4 段目の見出し＝「連携の確かめ」（画面と札の並び）・前の「友だち追加と連携の確かめ」は残らない", ls[3].name === "連携の確かめ" && wz.includes("4. 連携の確かめ</b>") && !wz.includes("友だち追加と連携の確かめ") && !src("lib/nox/ops/assist.ts").includes("友だち追加と連携の確かめ"));
// (c)
check("(c) ボットの ID の在りか＝ベーシック ID（@ から）を欄の下に 1 行", BOT_BASIC_ID_WHERE.includes("ベーシック ID") && BOT_BASIC_ID_WHERE.includes("LINE 公式アカウントの管理画面") && wz.includes('<span style={{ ...t.sub, fontSize: 11.5 }} data-bot-id-where="1">{BOT_BASIC_ID_WHERE}</span>'));
// (d)
check("(d) 通ったとき＝札「確かめ済み（11/22 18:05）」・文「連携を確かめました（日時）」", ls[3].note === "確かめ済み（11/22 18:05）" && verifiedAtJa("2026-11-22T09:05:00Z") === "11/22 18:05" && wz.includes("j.verified_at ? `連携を確かめました（${verifiedAtJa(j.verified_at)}）` : \"連携を確かめました\""), ls[3].note);
check("(d) 通らなかった理由＝LINE の 4 つ・route の 2 つ・関数の 3 つ・運営の柵の 3 つ（英字を出さない）",
  Object.keys(LINE_VERIFY_REASON).length === 4 && assistErrJa("not configured").startsWith("LIFF ID とアクセストークンを先に") && assistErrJa("bad result").startsWith("確かめの結果を記録できませんでした") && assistErrJa("forbidden").startsWith("今は代行で書けません")
  && opsGateErrJa("login")?.startsWith("運営のログインが切れました") === true && opsGateErrJa("mfa")?.startsWith("二段階認証") === true && opsGateErrJa("notfound")?.startsWith("見つかりません") === true && opsGateErrJa("x") === null
  && wz.includes("text: opsGateErrJa(j.error) ?? j.error ?? (j.reasons?.length ? `確かめが通りませんでした：${j.reasons.join(\"・\")}`") && src("app/api/ops/orgs/[id]/assist/route.ts").includes('{ error: "アクセストークンが入っていません" }'));

if (fails.length) { console.error(`verify:nox-assist-line FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`verify:nox-assist-line OK ${pass} checks（運営の代行の LINE 連携）`);
