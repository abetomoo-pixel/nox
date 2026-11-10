/**
 * verify:nox-night1110 — 夜便（2026-11-10 夜〜11-11 朝）の client／スクリプトの直し（DDL なし）
 *  (L2) 特定商取引法に基づく表示（/legal/tokushoho・確定文面・年額）・リンク 4 か所（LP フッター・課金画面・デモの入口）・事業者＝株式会社レクソル（LP・メール 5 本・規約）・問い合わせ support@noxapp.jp
 *  (L4) 裁定479／475＝NOX の目印（metadata.service=nox・org_id）・NOX 以外のイベントは 200 で無視・price は lookup_key・請求日は毎月 1 日（初回は日割り）・
 *       お試しの案内（7 日前・前日）と終了後の文言・割引後の額・create-org（お試し 1 か月・店舗を足す＋数量の同期）・毎日の数量の突き合わせ cron
 *  (L3) M-137 デモの開いている伝票のヘッダと明細のセットが一致・M-147 営業時間の 24 時超・M-146 新しい商品はバック 0%・在庫 OFF・要約・M-151 開いて閉じるだけで未保存にならない・
 *       M-153 プラン切替の上書きは開いた行から白名単・M-148 締めの未会計は件数＋リンク＋場所の近く・M-132 追補 明細の見出しと手取りと印刷
 *  (DB) M-146＝名前と値段だけで登録→バック 0%・在庫 OFF（BEGIN…ROLLBACK・client と同じ 2 段）
 */
import fs from "node:fs";
import pg from "pg";
import { TOKUSHOHO_ROWS, TOKUSHOHO_HREF, COMPANY_NAME, SUPPORT_EMAIL } from "../lib/nox/legal/tokushoho";
import { isNoxStripeObject, nextMonthFirstJstEpoch, checkoutSubscriptionDataOf, discountedTotalOf, noxMetadataOf, envPriceOf, NOX_LOOKUP_KEYS } from "../lib/billing/nox-stripe";
import { trialReminderOf, trialReminderTextOf, TRIAL_ENDED_MSG, sendTrialReminderMail } from "../lib/billing/trial-reminder";
import { planSwitchOverridesOf, planSwitchFromOf } from "../lib/nox/cast/pay-rule";
import { slipPeriodRangeOf } from "../components/payslip-slip";
import { withDiscountLabel } from "../lib/billing/amount";
import { loadEnvOrExit } from "./fixtures-f0";
import { TIME_PICKER_MINUTES, timePickerHoursOf, timePickerValueOf } from "../lib/nox/time/picker";
import { hmLabelOf } from "../lib/nox/time/hhmm";
import { auditActionJa, auditSearchTextOf } from "../lib/nox/audit/action-label";
import { demoTermsAckValidOf, demoTermsVersionOf, DEMO_TERMS_ACK_TTL_MS } from "../components/ui/demo-terms";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail).slice(0, 300)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = (x: unknown) => JSON.stringify(x);

// ── (L2) ──
const row = (k: string) => TOKUSHOHO_ROWS.find(([a]) => a === k)?.[1] ?? "";
check("L2-1 特商法＝15 行・事業者＝株式会社レクソル・運営責任者・所在地・電話・support@noxapp.jp", TOKUSHOHO_ROWS.length === 15 && row("販売事業者") === "株式会社レクソル" && row("運営責任者") === "仲田 康介" && row("所在地").startsWith("〒160-0023") && row("電話番号") === "03-6304-2731" && row("メールアドレス") === "support@noxapp.jp");
check("L2-2 価格＝月額 29,800 円（税込）または年額 288,000 円（税込）・支払時期に年額の一括・解約に月額／年額・返金に期間の途中も日割りなし", row("販売価格").includes("月額 29,800 円（税込）") && row("販売価格").includes("年額 288,000 円（税込）") && row("支払時期").includes("毎月 1 日") && row("支払時期").includes("年額：お試し終了後に 1 年分を一括") && row("解約").includes("月額はその月の末日まで、年額は契約期間の末日まで") && row("返金").includes("期間の途中で解約された場合も日割りの返金はありません"));
check("L2-3 ページ＝/legal/tokushoho（ログイン不要＝保護パスに入らない）・表は定数から", TOKUSHOHO_HREF === "/legal/tokushoho" && src("app/legal/tokushoho/page.tsx").includes("TOKUSHOHO_ROWS.map") && !/"\/legal"/.test(src("lib/supabase/middleware.ts")));
const lp = src("app/lp/page.tsx");
check("L2-4 リンク＝LP フッター・課金画面（お申し込みの下）・デモの入口のフッター", lp.includes("<Link href={TOKUSHOHO_HREF}>{TOKUSHOHO_TITLE}</Link>") && src("app/(manage)/billing/billing-board.tsx").includes("data-billing-legal=\"1\"") && src("app/demo/page.tsx").includes("data-demo-footer=\"1\""));
check("L2-5 名義＝LP の運営・著作権・問い合わせ先がレクソル／support（Agoora の文字は画面に出さない）", lp.includes("<small>運営 {COMPANY_NAME}</small>") && lp.includes("© 2026 {COMPANY_NAME}") && lp.includes("<small>{SUPPORT_EMAIL}</small>") && !/運営 株式会社Agoora|© 2026 Agoora|info@agoora/.test(lp) && COMPANY_NAME === "株式会社レクソル" && SUPPORT_EMAIL === "support@noxapp.jp");
const mails = ["confirm_signup", "invite", "magic_link", "recovery", "email_change"].flatMap((n) => ["txt", "html"].map((e) => src(`docs/demo/mail_templates/${n}.${e}`)));
check("L2-6 メールテンプレ 5 本（.txt と .html）の署名＝NOX（株式会社レクソル）・Agoora なし", mails.every((m) => m.includes("株式会社レクソル") && !m.includes("Agoora")));
check("L2-7 利用規約の「当社」＝株式会社レクソル", src("docs/legal/terms_store_v0.9.md").includes("「当社」＝株式会社レクソル（NOX の提供者）"));

// ── (L4) ──
check("L4-1 NOX の目印＝service=nox・org_id", J(noxMetadataOf("o1")) === J({ service: "nox", org_id: "o1" }));
check("L4-2 NOX のイベント＝metadata／price の lookup_key／price の metadata／invoice の親の metadata・それ以外（BANZEN）は false",
  isNoxStripeObject({ metadata: { service: "nox" } }) && isNoxStripeObject({ items: { data: [{ price: { lookup_key: "nox_monthly" } }] } }) && isNoxStripeObject({ lines: { data: [{ price: { metadata: { service: "nox" } } }] } }) && isNoxStripeObject({ parent: { subscription_details: { metadata: { service: "nox" } } } })
  && !isNoxStripeObject({ metadata: { tenant_id: "x" }, items: { data: [{ price: { lookup_key: "banzen_monthly" } }] } }) && !isNoxStripeObject({ customer: "cus_x" }) && !isNoxStripeObject(null));
const wh = src("app/api/stripe/webhook/route.ts");
check("L4-3 webhook＝NOX でもローカルの customer でもなければ 200 で無視（ログ 1 行・何も書かない・Stripe を呼ばない）＝顧客の取り直しより前", wh.includes("if (!nox && !orgId) {") && wh.includes("NOX 以外のイベントを無視") && wh.includes('ignored: "not_nox"') && wh.indexOf("if (!nox && !orgId)") < wh.indexOf("stripe.customers.retrieve"));
check("L4-4 作成物に目印＝customer（service+org_id）・checkout（metadata と subscription_data）・カード切替の setup session", src("app/api/billing/_owner.ts").includes('metadata: { service: "nox", org_id: orgId }') && src("app/api/billing/checkout/route.ts").includes("subscription_data: checkoutSubscriptionDataOf(") && src("app/api/billing/checkout/route.ts").includes("metadata: noxMetadataOf(ctx.orgId)") && src("app/api/billing/switch-to-card/route.ts").includes('metadata: { service: "nox", org_id: ctx.orgId }'));
check("L4-5 price＝lookup_key（nox_monthly／nox_yearly）で引く・env があれば上書き・checkout と周期変更の両方", NOX_LOOKUP_KEYS.monthly === "nox_monthly" && NOX_LOOKUP_KEYS.yearly === "nox_yearly" && envPriceOf("monthly", { STRIPE_PRICE_NOX_MONTHLY: "price_x" }) === "price_x" && envPriceOf("yearly", {}) === null && src("lib/stripe/client.ts").includes("lookup_keys: [key]") && src("app/api/billing/checkout/route.ts").includes("await resolveNoxPrice(cycle)") && src("app/api/billing/interval/route.ts").includes("await resolveNoxPrice(cycle)"));
{
  const t = Date.UTC(2026, 10, 10, 3, 0, 0) / 1000; // 2026-11-10 12:00 JST
  const a = nextMonthFirstJstEpoch(t); const exp = Date.UTC(2026, 11, 1) / 1000 - 9 * 3600; // 2026-12-01 0:00 JST
  const late = nextMonthFirstJstEpoch(Date.UTC(2026, 10, 30, 16, 0, 0) / 1000); // 2026-12-01 01:00 JST → 2027-01-01
  const sd = checkoutSubscriptionDataOf("o1", Date.UTC(2026, 11, 10) / 1000, t);
  check("L4-6 請求日＝毎月 1 日 0:00（JST）・お試しがあれば終了後の 1 日・初回は日割り（create_prorations）・metadata 付き", a === exp && late === Date.UTC(2027, 0, 1) / 1000 - 9 * 3600 && sd.trial_end === Date.UTC(2026, 11, 10) / 1000 && sd.billing_cycle_anchor === Date.UTC(2027, 0, 1) / 1000 - 9 * 3600 && sd.proration_behavior === "create_prorations" && sd.metadata.service === "nox", { a, exp, sd });
}
check("L4-7 割引後の額＝率は四捨五入・額は差し引き・0 未満にしない・文言は割引後と通常", discountedTotalOf(59600, [{ coupon: { percent_off: 10 } }]) === 53640 && discountedTotalOf(29800, [{ coupon: { amount_off: 5000 } }]) === 24800 && discountedTotalOf(1000, [{ coupon: { amount_off: 5000 } }]) === 0 && discountedTotalOf(29800, null) === 29800
  && withDiscountLabel({ total: 59600, unitAmount: 29800, quantity: 2, interval: "month" }, 53640) === "¥53,640/月（割引後・通常 ¥59,600＝¥29,800 × 2店舗）");
{
  const now = new Date("2026-11-10T03:00:00Z");
  const r7 = trialReminderOf({ status: "trialing", trial_ends_at: "2026-11-17T03:00:00Z" }, now);
  const r1 = trialReminderOf({ status: "trialing", trial_ends_at: "2026-11-11T02:00:00Z" }, now);
  const r8 = trialReminderOf({ status: "trialing", trial_ends_at: "2026-11-18T04:00:00Z" }, now);
  const rs = trialReminderOf({ status: "trialing", trial_ends_at: "2026-11-12T03:00:00Z", stripe_subscription_id: "sub_1" }, now);
  check("L4-8 お試しの案内＝7 日前から（week）・前日は last・8 日前は出さない・契約済みは出さない・文言", r7?.kind === "week" && r7.daysLeft === 7 && r1?.kind === "last" && r8 === null && rs === null && trialReminderTextOf(r1!).includes("明日") && TRIAL_ENDED_MSG.includes("データは消えません"), { r7, r1 });
}
check("L4-9 帯＝シェルでオーナーだけ（デモは出さない）・失効の帯はお試し終了なら専用の文言", src("app/(manage)/layout.tsx").includes("if (isOwnerRaw && !isDemo) {") && src("app/(manage)/layout.tsx").includes("data-trial-reminder=\"1\"") && src("components/ui/billing-banner.tsx").includes("trialEnded ? TRIAL_ENDED_MSG : BILLING_BANNER_MSG"));
(async () => { const m = await sendTrialReminderMail("a@b", { kind: "last", daysLeft: 1, endsOn: "11/11" }); check("L4-10 メールの送り手は口だけ（SMTP の後に結線）＝送らない", m.sent === false && m.reason === "smtp_not_configured"); })();
const co = src("scripts/admin/create-org.mjs");
check("L4-11 create-org＝お試し中（終了＝作成から 1 か月）で始める・--add-store で既存の会社に店舗＋数量の同期（契約ありのときだけ・お試し中は数量だけ）", co.includes('status: "trialing", trial_ends_at: trialEnds.toISOString()') && !co.includes('upsert({ org_id: made.org, status: "active" }') && co.includes('if (flag("add-store")) {') && co.includes('proration_behavior: "create_prorations"') && co.includes("if (org.is_demo) die("));
check("L4-12 毎日の数量の突き合わせ＝cron route（CRON_SECRET・Stripe 未接続は skipped・ずれたら直してログ）・vercel.json・route の分類", src("app/api/cron/billing-quantity/route.ts").includes('skipped: "stripe_not_configured"') && src("app/api/cron/billing-quantity/route.ts").includes("運営に知らせる") && src("vercel.json").includes('"/api/cron/billing-quantity", "schedule": "30 20 * * *"') && src("scripts/verify-nox-demo-guard.ts").includes('"cron/billing-quantity"'));
check("L4-13 ポータル＝NOX 用の設定（env）があれば指定・課金画面は割引後の額", src("app/api/billing/portal/route.ts").includes("configuration: process.env.STRIPE_PORTAL_CONFIG_NOX") && src("app/(manage)/billing/page.tsx").includes('expand: ["discounts"]') && src("app/(manage)/billing/page.tsx").includes("withDiscountLabel(amt, discountedTotalOf("));

// ── (L3) ──
{
  const p = JSON.parse(src("docs/demo/payload/ace.json")) as { tables: Record<string, Record<string, unknown>[]> };
  const open = (p.tables.checks ?? []).filter((c) => c.status === "open");
  const bad = open.filter((c) => { const sl = (p.tables.check_lines ?? []).find((l) => l.check_id === c.id && l.kind === "set"); return sl && sl.unit_price_snapshot !== c.set_fee; });
  check("L3-1 M-137 デモ ACE の開いている伝票＝ヘッダの set_fee と明細のセット単価が一致・set_rule_id あり", open.length > 0 && bad.length === 0 && open.every((c) => !!c.set_rule_id), { open: open.length, bad: bad.length });
  const bh = (p.tables.store_business_hours ?? []).filter((r) => !r.is_closed);
  check("L3-2 M-147 デモの営業時間＝日をまたぐ終了は 24 時超（20:00〜25:00）", bh.length > 0 && bh.every((r) => (r.close_hm as string) > (r.open_hm as string)), bh.slice(0, 2));
  check("L3-3 M-147 画面とシフトの判定＝終了が開始以下の古い行は翌日と読む", src("app/(manage)/master/business-hours-panel.tsx").includes("closeRaw <= hm2min(r.open_hm ?? \"00:00\") && closeRaw < 1440 ? closeRaw + 1440 : closeRaw") && src("lib/nox/business-hours.ts").includes("const close = closeRaw <= open ? closeRaw + 1440 : closeRaw;"));
}
const pb = src("app/(manage)/master/products/products-board.tsx");
check("L3-4 M-146 新しい商品＝バック既定 0%・登録の直後に在庫 OFF・保存の直前に要約（値段／在庫管理／バック）", pb.includes("backMode: \"rate\", backValue: 0") && pb.includes("useState(0); // ★M-146") && pb.includes('supabase.rpc("set_product_track_stock", { p_product_id: data, p_track: false })') && pb.includes('data-product-summary="1"'));
check("L3-5 M-151 未保存の判定＝キー順に依存しない署名", pb.includes("const formSigOf = (v: FormValues): string => JSON.stringify(Object.keys(v).sort()") && pb.includes("setBaseSig(formSigOf(v));") && pb.includes("const currentSig = () => formSigOf(currentValues());"));
check("L3-6 M-153 プラン切替＝開いた行の上書きを白名単（guarantee・保証の base は持ち込まない）・適用開始日は開いた行の開始より後",
  J(planSwitchOverridesOf([{ valid_to: "2026-11-12", overrides_json: { base: 5000, guarantee: true } }, { valid_to: null, overrides_json: { honBack: 1000, guarantee: true, pay_rule: "per_shift", per_shift_amount: 8000 } }])) === J({ honBack: 1000, pay_rule: "per_shift", per_shift_amount: 8000 })
  && J(planSwitchOverridesOf([{ valid_to: "2026-11-12", overrides_json: { base: 5000, guarantee: true } }])) === "{}"
  && planSwitchFromOf("2026-12-01", [{ valid_from: "2026-12-05", valid_to: null }]) === "2026-12-06" && planSwitchFromOf("2026-12-01", [{ valid_from: "2026-11-01", valid_to: null }]) === "2026-12-01"
  && src("app/(manage)/casts/casts-board.tsx").includes("p_overrides: planSwitchOverridesOf(planRowsOf[c.id])"));
const rb = src("app/(manage)/report/report-board.tsx");
check("L3-7 M-148 締めの未会計＝「未会計の伝票が ○件あるため締められません」＋未会計の伝票を見る・ボタンの近く・タブを移ったら消す", rb.includes("未会計の伝票が ${count ?? \"いくつか\"}件あるため締められません") && rb.includes(">未会計の伝票を見る</a>") && rb.includes("useEffect(() => { setCloseErr(null); }, [tab]);") && rb.indexOf("{closeErr &&") > rb.indexOf("onClick={closeDay}>日報を締める</button>"));
const ps = src("components/payslip-slip.tsx"); const css = src("app/globals.css");
check("L3-8 M-132 追補 明細＝店舗名（大）＋名前 様・対象期間・発行日・会社名と住所（あるときだけ）・手取りは白地に線・印刷は余白 0＋内側 12mm・帯は出さない",
  ps.includes('data-slip-store-name="1"') && ps.includes("`${castName} 様`") && ps.includes('data-slip-period-range="1"') && ps.includes('data-slip-issued="1"') && ps.includes("(store.legalName || store.address) &&") && slipPeriodRangeOf("2026-10") === "2026/10/1〜10/31" && slipPeriodRangeOf("2026-02") === "2026/2/1〜2/28"
  && css.includes("@page { size: A4; margin: 0; }") && css.includes("padding: 12mm !important") && src("app/(manage)/payroll/payroll-board.tsx").includes("store={slipStore}"));

// ── 2 つ目の組（M-145・M-150・M-152・M-138・M-140） ──
{
  const hs = timePickerHoursOf("06:00", 47);
  check("M145-1 時の列＝営業日の順（06 から 23・翌 00〜05）・分の列は 4 つ（00／15／30／45）", hs.length === 24 && hs[0].h === 6 && !hs[0].next && hs[17].h === 23 && hs[18].h === 0 && hs[18].next && hs[23].h === 5 && hs[23].next && TIME_PICKER_MINUTES.length === 4 && TIME_PICKER_MINUTES.join(",") === "0,15,30,45");
  check("M145-2 当日だけの欄（maxHour 23）は「翌」を付けない", timePickerHoursOf("06:00", 23).every((x) => !x.next));
  check("M145-3 20:45 を選んで保存→表示も 20:45・翌 01:30 を選ぶと 25:30（保存形式は今のまま）→表示は翌01:30", timePickerValueOf(20, 45, null, 47) === "20:45" && hmLabelOf(timePickerValueOf(20, 45, null, 47)) === "20:45" && timePickerValueOf(1, 30, null, 47) === "25:30" && hmLabelOf("25:30") === "翌01:30" && timePickerValueOf(1, 30, null, 23) === "01:30");
  const ti = src("components/ui/time-input.tsx");
  check("M145-4 部品＝開いたら選んでいる時・分（空は営業開始）を列の真ん中へ・営業開始／営業終了のボタン・下に入らなければ上・キーボード・列に無い分は入力欄に・正規表現の化けを直した",
    ti.includes("col.scrollTop = el.offsetTop - col.clientHeight / 2 + el.clientHeight / 2") && ti.includes('data-center={selH === null && startH === h ? "1" : undefined}') && ti.includes(">営業開始</button>") && ti.includes(">営業終了</button>") && ti.includes("setUp(below < 330 && above > below)") && ti.includes("onKeyDown={onKey}") && ti.includes("setTyped(value && !curMOnList ? value : \"\")") && ti.includes("/^(\\d{1,2}):(\\d{2})/.exec(after)") && !ti.includes("/^(d{1,2}):(d{2})/"));
  check("M145-5 全画面で同じ動き＝シェル（(manage)・mine）が店の営業時間と切替時刻を渡す（部品は渡されていない値を補う）", src("app/(manage)/layout.tsx").includes("<StoreHoursProvider value={storeHours}>") && src("app/mine/layout.tsx").includes("<StoreHoursProvider value={storeHours}>") && ti.includes("const startAt = startAtProp ?? sh.open, closeAt = closeAtProp ?? sh.close, dayStart = dayStartProp ?? sh.cutoff;"));
  check("M150-1 監査の操作名＝業務の言葉（辞書）・語の組み合わせ・その他", auditActionJa("check_close") === "会計を確定" && auditActionJa("set_store_profile") === "店舗設定を変更" && auditActionJa("customer_frobnicate") === "お客様の操作" && auditActionJa("zzz") === "その他の操作" && auditActionJa(null) === "その他の操作");
  check("M150-2 検索＝業務の言葉・内部名・対象・変更前後・操作者名で当たる（卓名・領収書番号・キャスト名）", auditSearchTextOf({ action: "receipt_issue", target: "receipt_issues:x", after_json: { serial: "R-00012", seat: "A1" } }, ["デモ 店長"]).includes("r-00012") && auditSearchTextOf({ action: "receipt_issue", after_json: { seat: "A1" } }).includes("領収書を発行") && auditSearchTextOf({ action: "x", after_json: { cast_name: "あかり" } }).includes("あかり"));
  const ab = src("app/(manage)/audit/audit-board.tsx");
  check("M150-3 一覧と詳細は業務の言葉・内部の操作名と ID は「技術詳細」に畳む", ab.includes("{auditActionJa(l.action)}") && ab.includes('data-audit-tech="1"') && ab.includes("内部の操作名") && !ab.includes('<span className="act">{l.action}</span>'));
  const ver = demoTermsVersionOf(["a", "b"]); const now = Date.now();
  check("M152-1 デモの規約同意＝同じ版で 24 時間以内なら保持・版が変われば再同意・期限切れ・壊れた値は同意なし", demoTermsAckValidOf(JSON.stringify({ v: ver, at: now - 1000 }), ver, now) && !demoTermsAckValidOf(JSON.stringify({ v: ver, at: now - DEMO_TERMS_ACK_TTL_MS - 1 }), ver, now) && !demoTermsAckValidOf(JSON.stringify({ v: demoTermsVersionOf(["a", "c"]), at: now }), ver, now) && !demoTermsAckValidOf("x", ver, now) && !demoTermsAckValidOf(null, ver, now));
  const dt = src("components/ui/demo-terms.tsx");
  check("M140-1 デモの入口＝3 段の案内・同意したら 1 回で入れる主ボタン（おすすめ＝初期選択か CLUB ACE をオーナーで）", dt.includes('data-demo-steps="3"') && dt.includes('data-demo-primary="1"') && dt.includes("を{prl.label}で試す（おすすめ）"));
  const banned = /\uFF08\u88C1\u5B9A420\uFF09\u3002|\uFF08C\u5C64[\u2461\u2462]\uFF09|\[\u88C1\u5B9A462\]|CANON \u578B|\uFF08\u88C1\u5B9A385\uFF09|\u8981\u88C1\u5B9A\uFF09|\u88C1\u5B9A464 \u4EEE\u7F6E\u304D/;
  const files138 = ["app/(manage)/master/cast-register-panel.tsx", "app/(manage)/master/feature-flags-panel.tsx", "app/(manage)/register/register-board.tsx", "components/nox/store-rules-0175-panel.tsx", "lib/nox/setup/v5.ts", "lib/nox/payroll/core.ts", "lib/nox/payroll/loan-ledger.ts"];
  check("M138-1 画面に出る内部用語（裁定・仮置き・C層・CANON）を消した 11 か所", files138.every((p) => !banned.test(src(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1"))) /* 教訓137: コメントを除いた本文で見る */ && src("lib/nox/payroll/withholding-kind.ts").includes("税理士に確認中です") && src("app/(manage)/setup/setup-wizard.tsx").includes("（税理士の確認による）"));
}

(async () => {
  const env = loadEnvOrExit(["SUPABASE_DB_URL"]);
  const c = new pg.Client({ connectionString: env.SUPABASE_DB_URL as string, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query("begin");
  try {
    const st = (await c.query(`select id from public.stores where name='NOX-VERIFY-A1'`)).rows[0] as { id: string };
    const mgr = (await c.query(`select u.auth_user_id from public.memberships m join public.users u on u.id=m.user_id where m.store_id=$1 and m.role='manager' and m.is_active and u.auth_user_id is not null limit 1`, [st.id])).rows[0] as { auth_user_id: string };
    await c.query("set local role authenticated");
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [J({ sub: mgr.auth_user_id, role: "authenticated" })]);
    // client と同じ 2 段（set_product は画面の既定＝バック 0%・その直後に在庫 OFF）
    const id = (await c.query(`select public.set_product(p_id => null, p_store_id => $1, p_type => 'drink', p_category => null, p_name => 'NOX-VERIFY-夜便の商品', p_price => 1000, p_cost => null, p_back_mode => 'rate', p_back_value => 0, p_unit4 => null, p_hon_pt => 0, p_is_active => true, p_reorder_point => null, p_category_id => null, p_back_exempt_from_split => false, p_back_rate_by_kind => null) id`, [st.id])).rows[0].id as string;
    await c.query(`select public.set_product_track_stock($1, false)`, [id]);
    await c.query("reset role");
    const r = (await c.query(`select back_mode, back_value, track_stock from public.products where id=$1`, [id])).rows[0] as { back_mode: string; back_value: number; track_stock: boolean };
    check("DB-1 M-146 名前と値段だけで登録（画面の既定）→ バック 0%・在庫 OFF（カテゴリの既定は無い）", r.back_mode === "rate" && Number(r.back_value) === 0 && r.track_stock === false, r);
  } catch (e) { check("DB-1 M-146 登録の試走", false, (e as Error).message); }
  finally { await c.query("rollback"); await c.end(); }
  if (fails.length) { console.error(`✗ verify:nox-night1110 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
  console.log(`verify:nox-night1110 OK (${pass} checks)`);
})();
