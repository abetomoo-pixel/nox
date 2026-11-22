/*
 * verify:nox-assist-contrast — 導入の代行 版 2 の画面（枝 night1121-ops-v2・0202b 版 4 用・旗 MIG_0202B_APPLIED の後ろ）の「読める」と判定（2026-11-21 夜・相談役 18:40 の 5）。
 *  本物の部品を静的に描き（DB もセッションも使わない）、375／1024・light／dark で写して全文字の明るさの比（scripts/contrast-probe.ts）と横のはみ出しを数える。写し＝docs/tmp/assist_contrast/。
 *  a(1) 判定の純関数（書けるか・理由 1 行・LINE の 4 段・公開の値の形・英語のエラーを出さない・運営の札）。
 *  a(2) 源の pin：シークレットとトークンは応答と画面に出さない・代理店（agency）を渡す route は無い・旗 false は 404・ボタンは .nox-actions。
 *  a(3) 画面：運営の代行（3 歩＋書けない理由）・店の設定のサポート許可・キャストの仮の登録・詳細の入口（書ける／書けない）。
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { chromium, type Browser } from "playwright-core";
import AssistWizard, { type AssistProps } from "../app/ops/orgs/[id]/assist/assist-wizard";
import OpsShell from "../app/ops/ops-shell";
import OrgDetail from "../app/ops/orgs/[id]/org-detail";
import SupportGrantPanel from "../components/nox/support-grant-panel";
import CastProvisionalsPanel from "../components/nox/cast-provisionals-panel";
import { assistedMarksOf, assistErrJa, assistGateOf, lineStepsOf, linePublicErrOf, promoteErrOf } from "../lib/nox/ops/assist";
import { MIG_0202B_APPLIED } from "../lib/nox/rules-0175/flag";
import type { OpsOrgRow } from "../lib/nox/ops/labels";
import { docOf, PROBE, type Probe } from "./contrast-probe";
import { verifyLineChannel } from "../lib/nox/line/verify-channel";
import * as t from "../lib/nox/ui/theme";
process.loadEnvFile(".env.local");
(globalThis as { React?: unknown }).React = React;

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = "") => { if (ok) pass++; else { fail++; console.log(`  FAIL: ${name}${detail ? ": " + detail : ""}`); } };
const src = (p: string) => fs.readFileSync(p, "utf8");
const OUT = "docs/tmp/assist_contrast"; fs.mkdirSync(OUT, { recursive: true });
const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };
const wrap = (el: React.ReactElement) => renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router as never }, el));
const NOW = "2026-11-24T03:00:00Z";

const base: AssistProps = {
  orgId: "00000000-0000-4000-8000-000000000001", orgName: "TEST CLUB", onboardingState: "onboarding", isDemo: false, supportUntil: null,
  storeId: "00000000-0000-4000-8000-0000000000a1", storeName: "TEST CLUB 本店", bizType: "host", setupDone: false,
  draft: { updatedAt: "2026-11-23T10:00:00.123456Z", assisted: { "1": { kind: "ops", who: "運営", at: "2026-11-23T10:00:00Z" } }, data: null },
  line: { login_channel_id: true, liff_id: true, bot_basic_id: true, channel_secret_ref: true, access_token_ref: false, line_verified_at: null },
  provisionals: [{ id: "p1", name: "見本 みく", created_who: "運営", created_at: "2026-11-23T11:00:00Z", promoted_at: null, discarded_at: null }, { id: "p2", name: "見本 れな", created_who: "運営", created_at: "2026-11-23T11:05:00Z", promoted_at: "2026-11-23T12:00:00Z", discarded_at: null }],
  nowIso: NOW,
};
const row: OpsOrgRow = { org_id: base.orgId, org_name: "TEST CLUB", kind: "tester", store_count: 1, billing_status: null, trial_ends_at: null, has_subscription: false, agency_code: null, onboarding_state: "onboarding", onboarding_done_at: null, owner_email: "owner@example.test", owner_invited_at: "2026-11-21T05:41:15Z", owner_accepted: true, setup_done_stores: 0, setup_step_max: 3, setup_draft_at: "2026-11-23T10:00:00Z", line_login_stores: 1, line_notify_stores: 0, line_richmenu_stores: 0, line_links: 0, cast_count: 0, staff_count: 1, last_used_at: null, created_at: "2026-11-21T05:41:16Z" };
const shell = (el: React.ReactElement) => wrap(React.createElement(OpsShell, { name: "Agoora", children: el }));
const SCREENS = [
  { key: "assist-draft", html: shell(React.createElement(AssistWizard, { ...base, initialStep: 0 })) },
  { key: "assist-line", html: shell(React.createElement(AssistWizard, { ...base, initialStep: 1 })) },
  { key: "assist-cast", html: shell(React.createElement(AssistWizard, { ...base, initialStep: 2 })) },
  { key: "assist-closed", html: shell(React.createElement(AssistWizard, { ...base, onboardingState: "done", initialStep: 1 })) },
  { key: "detail-entry", html: shell(React.createElement(OrgDetail, { row, logs: [], nowIso: NOW, assist: { ok: true, reason: null } })) },
  { key: "detail-entry-closed", html: shell(React.createElement(OrgDetail, { row: { ...row, onboarding_state: "done", onboarding_done_at: "2026-11-22T00:00:00Z" }, logs: [], nowIso: NOW, assist: assistGateOf({ onboarding_state: "done", support_until: null }, new Date(NOW)) })) },
  { key: "shop-support", html: wrap(React.createElement("div", { className: "nox-dark", style: { ...t.appBg, padding: 16 } }, React.createElement(SupportGrantPanel, { orgId: base.orgId, initial: { until: "2026-11-27T03:00:00Z", onb: "onboarding" } }))) },
  { key: "shop-provisionals", html: wrap(React.createElement("div", { className: "nox-dark", style: { ...t.appBg, padding: 16 } }, React.createElement(CastProvisionalsPanel, { initial: [{ id: "p1", name: "見本 みく", created_who: "運営", created_at: "2026-11-23T11:00:00Z" }], initialOpen: true }))) },
];

async function main() {
  let browser: Browser | null = null;
  try {
    // a(1) 純関数
    const now = new Date(NOW);
    check("a(1-1) 書けるか：導入中＝書ける・導入完了で許可なし＝理由 1 行・許可の間＝書ける・期限切れ＝書けない・デモ＝書けない",
      assistGateOf({ onboarding_state: "onboarding", support_until: null }, now).ok && !assistGateOf({ onboarding_state: "done", support_until: null }, now).ok && !!assistGateOf({ onboarding_state: "done", support_until: null }, now).reason
      && assistGateOf({ onboarding_state: "done", support_until: "2026-11-25T00:00:00Z" }, now).ok && !assistGateOf({ onboarding_state: "done", support_until: "2026-11-24T02:59:00Z" }, now).ok && !assistGateOf({ onboarding_state: "onboarding", is_demo: true, support_until: null }, now).ok);
    const ls = lineStepsOf(base.line);
    check("a(1-2) LINE の 4 段（公開の値・シークレット・トークン・確かめ）＝鍵の有無だけ・入れたものは「入力済み」", ls.length === 4 && ls.map((x) => x.note).join("/") === "入力済み/入力済み/未入力/未確認");
    check("a(1-3) 公開の値の形（チャネル ID は数字・LIFF ID・ボットは @）", linePublicErrOf({ login_channel_id: "1234567890", liff_id: "1234567890-abcdefgh", bot_basic_id: "@nox" }) === null && !!linePublicErrOf({ login_channel_id: "abc", liff_id: "x", bot_basic_id: "nox" }));
    check("a(1-4) 英語のエラーを出さない（stale は「オーナーが先に保存しました」・forbidden (demo)・no link・知らない文は共通の文）",
      assistErrJa("stale").startsWith("オーナーが先に保存しました") && assistErrJa("forbidden (demo)") === "デモの会社には書けません" && assistErrJa("no link").startsWith("LINE とつながった人") && !/[a-z]{3}/.test(assistErrJa("weird english error")));
    check("a(1-5) 運営の札（assisted → STEP・だれ・時刻）・生年月日は必須", assistedMarksOf(base.draft!.assisted).length === 1 && assistedMarksOf(base.draft!.assisted)[0].who === "運営" && assistedMarksOf({ "0": { at: "x" }, "x": {} }).length === 0 && !!promoteErrOf("") && promoteErrOf("1999-01-01") === null);
    // a(4) ★0202e：LINE に聞く確かめ（偽の応答で判定だけを見る＝通信しない）
    {
      const TOKEN = "TEST-TOKEN-SHOULD-NOT-LEAK";
      const WH = "https://noxapp.jp/api/line/webhook/S1";
      const mk = (o: { info?: unknown; infoOk?: boolean; ep?: unknown; test?: unknown; throws?: boolean }) => (async (url: string | URL | Request, init?: RequestInit) => {
        if (o.throws) throw new Error("net");
        const u = String(url); const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
        if (auth !== `Bearer ${TOKEN}`) return new Response("{}", { status: 401 });
        if (u.endsWith("/info")) return new Response(JSON.stringify(o.info ?? {}), { status: o.infoOk === false ? 401 : 200 });
        if (u.endsWith("/webhook/endpoint")) return new Response(JSON.stringify(o.ep ?? {}), { status: 200 });
        if (u.endsWith("/webhook/test")) return new Response(JSON.stringify(o.test ?? {}), { status: 200 });
        return new Response("{}", { status: 404 });
      }) as typeof fetch;
      const good = { info: { basicId: "@nox", userId: "U" + "a".repeat(32) }, ep: { endpoint: WH, active: true }, test: { success: true } };
      const v1 = await verifyLineChannel({ token: TOKEN, expectBasicId: "@nox", webhookUrl: WH, fetchImpl: mk(good) });
      const v2 = await verifyLineChannel({ token: TOKEN, expectBasicId: "@other", webhookUrl: WH, fetchImpl: mk(good) });
      const v3 = await verifyLineChannel({ token: TOKEN, webhookUrl: WH, fetchImpl: mk(good) });
      const v4 = await verifyLineChannel({ token: TOKEN, expectUserId: "U" + "a".repeat(32), webhookUrl: WH, fetchImpl: mk({ ...good, ep: { endpoint: "https://example.com/x", active: false }, test: { success: false } }) });
      const v5 = await verifyLineChannel({ token: TOKEN, expectBasicId: "@nox", webhookUrl: WH, fetchImpl: mk({ throws: true }) });
      const all = JSON.stringify([v1, v2, v3, v4, v5]);
      check("a(4-1) 4 つとも合う＝全部真・理由なし／ボットの ID 違い・保存した ID が無い＝bot_id_match 偽", Object.values(v1.result).every(Boolean) && v1.reasons.length === 0 && !v2.result.bot_id_match && v2.result.webhook_test_ok && !v3.result.bot_id_match);
      check("a(4-2) 登録先が違う・Webhook がオフ・テストが通らない＝それぞれ偽で理由が日本語で出る・通信の失敗は全部偽", v4.result.bot_id_match && !v4.result.webhook_endpoint_ok && !v4.result.webhook_active && !v4.result.webhook_test_ok && v4.reasons.length === 3 && Object.values(v5.result).every((x) => !x) && v5.reasons.length === 4);
      check("a(4-3) 戻りは真偽の 4 つと理由だけ（トークン・URL・ボットの ID を含まない）", !all.includes(TOKEN) && !all.includes("@nox") && !all.includes(WH) && Object.keys(v1.result).sort().join(",") === "bot_id_match,webhook_active,webhook_endpoint_ok,webhook_test_ok");
      const rt0 = src("app/api/ops/orgs/[id]/assist/route.ts");
      check("a(4-4) route：トークンは getLineSecret（Vault）で読み、応答は真偽と理由と時刻だけ（トークンを返さない・ログに出さない）・0202e の旗が false のときは押せない",
        rt0.includes('const token = await getLineSecret(admin, store.id, "access_token");') && rt0.includes("return NextResponse.json({ ok: !!at, result: v.result, reasons: v.reasons, verified_at: at ?? null }") && !/console\.(log|error)\([^)]*token/.test(rt0) && rt0.includes("if (!LINE_VERIFY_READY) return NextResponse.json({ error: \"今は確かめられません\" }, { status: 409 });"));
    }
    // a(2) 源
    const rt = src("app/api/ops/orgs/[id]/assist/route.ts"), wz = src("app/ops/orgs/[id]/assist/assist-wizard.tsx"), pg = src("app/ops/orgs/[id]/assist/page.tsx");
    check("a(2-1) route：旗 false は 404・運営者だけ（requireOperatorApi）・行い手は 'ops' だけ（'agency' を渡す道が無い）・シークレットは応答に出さない",
      rt.includes('if (!mig0202bOn()) return NextResponse.json({ error: "not found" }, { status: 404 });') && rt.includes("requireOperatorApi()") && rt.includes('const who = { p_kind: "ops", p_ref: g.op.authUserId };') && !/p_kind: "agency"|'agency'/.test(rt.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")) && rt.includes("return NextResponse.json({ ok: true });   // 値は返さない"));
    check("a(2-2) 画面：シークレットとトークンは password の欄・保存の後に欄を空に戻す・読むのは鍵の有無だけ（page は line_config の値を渡さない）",
      (wz.match(/type="password"/g) ?? []).length === 2 && wz.includes('() => setSecret(""))') && wz.includes('() => setToken(""))') && pg.includes("const has = (k: string) =>") && !/channel_secret_ref: lc\.|access_token_ref: lc\./.test(pg));
    check("a(2-3) page は旗の後ろ（false は 404）・★0202e（2026-11-21 23:59 適用）の後は LINE の確かめを押せる・「確かめは次の更新で使えます」の 1 行は無い", pg.includes("if (!mig0202bOn()) notFound();") && typeof MIG_0202B_APPLIED === "boolean" && wz.includes("disabled={dis || !LINE_VERIFY_READY}") && !wz.includes("確かめは次の更新で使えます") && !SCREENS.find((x) => x.key === "assist-line")!.html.includes("確かめは次の更新で使えます") && SCREENS.find((x) => x.key === "assist-line")!.html.includes('data-line-verify-btn="1"'));
    check("a(2-4) /setup：運営の代行の下書きが新しければ自動保存を止める（読み直す）・確認の STEP に運営の札と仮の登録",
      src("app/(manage)/setup/setup-wizard.tsx").includes("c.updated_by == null && (!knownAt.current || new Date(c.updated_at).getTime() > new Date(knownAt.current).getTime())) { setStaleBy(c.updated_at); return; }") && src("app/(manage)/setup/setup-wizard.tsx").includes('data-setup-assisted="1"') && src("app/(manage)/setup/setup-wizard.tsx").includes("{mig0202bOn() && <CastProvisionalsPanel />}"));
    // a(3) 画面
    const html = (k: string) => SCREENS.find((x) => x.key === k)!.html;
    check("a(3-1) 代行の 3 歩：下書き（業態はお申し込みの値）・LINE 4 段（入力済みの札）・仮の登録（一覧と取り下げ）／書けないときは理由 1 行で欄は押せない",
      html("assist-draft").includes("下書きに入れる") && html("assist-line").includes("data-line-step=\"verify\"") && (html("assist-line").match(/入力済み/g) ?? []).length >= 2 && html("assist-cast").includes('data-assist-provisionals="2"')
      && html("assist-closed").includes('data-assist-gate="1"') && /<input[^>]*disabled=""[^>]*type="password"|<input[^>]*type="password"[^>]*disabled=""/.test(html("assist-closed")));
    check("a(3-2) 詳細の入口：書ける＝「導入を代行する」のボタン／書けない＝理由 1 行", html("detail-entry").includes('data-ops-assist-entry="1"') && html("detail-entry").includes('/ops/orgs/00000000-0000-4000-8000-000000000001/assist') && html("detail-entry-closed").includes('data-ops-assist-entry="0"') && html("detail-entry-closed").includes("サポート許可がありません"));
    check("a(3-3) 店：サポート許可（1／3／7 日・取り消す・導入完了にする）・仮の登録（生年月日・本名・本登録する／登録しない）",
      ["data-support-days=\"1\"", "data-support-days=\"3\"", "data-support-days=\"7\"", "data-support-revoke=\"1\"", "data-onboarding-done=\"1\""].every((x) => html("shop-support").includes(x)) && ["生年月日（必須）", "本名（任意）", "本登録する", "登録しない"].every((x) => html("shop-provisionals").includes(x)));
    browser = await chromium.launch({ channel: "msedge", headless: true });
    for (const sc of SCREENS) {
      const per: Record<string, string> = {};
      for (const w of [375, 1024]) {
        for (const scheme of ["light", "dark"] as const) {
          const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme, locale: "ja-JP" });
          const page = await ctx.newPage();
          await page.setContent(docOf(sc.html), { waitUntil: "load" });
          const r = (await page.evaluate(PROBE)) as { probes: Probe[]; docW: number; vw: number };
          await page.screenshot({ path: path.join(OUT, `${sc.key}_${w}_${scheme}.png`), fullPage: true });
          await ctx.close();
          per[`${w}_${scheme}`] = JSON.stringify(r.probes.map((p) => [p.sel, p.text, p.fg, p.bgs]));
          const bad = r.probes.filter((p) => p.ratio < p.need);
          check(`a(3) ${sc.key} ${w} ${scheme}：文字 ${r.probes.length} 個がすべて基準以上`, r.probes.length > 0 && bad.length === 0, bad.slice(0, 4).map((p) => `${p.sel}「${p.text}」${p.fg} on ${p.bgs.join("|")} = ${p.ratio}（要 ${p.need}）`).join(" ／ "));
          check(`a(3) ${sc.key} ${w} ${scheme}：横のはみ出し無し`, r.docW <= r.vw, `文書 ${r.docW} > 画面 ${r.vw}`);
        }
        check(`a(3) ${sc.key} ${w}：light と dark で一致`, per[`${w}_light`] === per[`${w}_dark`]);
      }
    }
    console.log(`  写し：${OUT}/`);
  } catch (e) {
    fail++; console.log(`  FAIL: 例外 ${(e as Error).message}`);
  } finally {
    if (browser) await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))]);
  }
}
void main().then(() => {
  if (fail) { console.log(`verify:nox-assist-contrast FAIL ${fail} / pass ${pass}`); process.exit(1); }
  console.log(`verify:nox-assist-contrast OK (${pass} checks)`);
  process.exit(0);
});
