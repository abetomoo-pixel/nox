/*
 * verify:nox-billing-app — 課金 app レーンの純関数係留＝段57（課金 app 設計書 v1 §9）。
 *   npm run verify:nox-billing-app（★DB 非依存・★Stripe 実呼びなし＝donor の verify 流儀を踏襲。
 *   env も不要＝lib/billing の純関数と billingGate をスタブ client で叩くのみ）。
 *
 * 正本: docs/NOX_課金app_設計書v1.md（§2 適応差分・§3 webhook 写像表・§9 段57 計画）
 *       docs/NOX_課金設計_v1.md v1.2（§3 述語）／supabase/migrations/0087（org_billing CHECK・述語2本）
 *
 * assert:
 *  (1) normalizeStatus の NOX 5値写像（Stripe 7値＋未知/null の全入力→5出力の対応表・未知は canceled へ倒す）
 *  (2) status 定数の SQL 述語との一致（BILLING_STATUSES = org_billing CHECK 5値・
 *      WRITABLE_STATUSES = billing_writable_of の第一条件 3値）
 *  (3) billingFieldsFromSubscription（item 側 current_period_end 優先の両対応・quantity min 1・
 *      trial_ends_at=null 固定・cancel_at_period_end/collection_method/interval）
 *  (4) webhook 純関数（HANDLED 6 events の集合一致・非 HANDLED 不含・resolveSubscriptionId の3経路）
 *  (5) quantityOf = count(stores) min 1（0店 org 番兵・非整数/負値/NaN の番兵）
 *  (6) reminders 純関数 [14,7,3,2,1,0]（JST 暦日境界・閾値一致/非一致・期日超過の負値）
 *  (7) computeTrialEnd（Stripe の「48時間以上先」制約・境界ちょうどは持ち越す）
 *  (8) amount（契約金額の算出/整形/表示ラベル3分岐・degrade "—"）
 *  (9) messages（isBillingLocked の判定・文言定数）
 * (10) billingGate（スタブ client: writable true→null 素通し・false→402＋文言＋code・RPC error→500）
 * (11) banner 出現条件の純関数（設計書 §6）＝SQL 述語 billing_writable_of の否定と全組合せで同値
 *
 * ★本スイートに入っていないもの（設計書 §9 のうち未実施・理由つき）:
 *   - 「gate 集合一致の静的 assert（§5）」＝適用対象が未確定（申告①・lib/billing/gate.ts 冒頭）。
 *     適用列挙が確定してから足す。今書くと、崩れている列挙をそのまま固定してしまう。
 *   - 「billingGate: 実 org fixture で 402」＝段47（verify:nox-billing）が同じ fixture org の
 *     org_billing を倒して戻す。同じ行を二重に触ると相互汚染するため、ここでは client をスタブ化して
 *     gate 自身の分岐のみを見る（述語の真理値表は段47 の観点2が実 DB で担保済み＝役割分担）。
 */
import { normalizeStatus, normalizeInterval, billingFieldsFromSubscription } from "../lib/billing/sync";
import { BILLING_STATUSES, WRITABLE_STATUSES, isWritableStatus, isBillingStatus } from "../lib/billing/status";
import { HANDLED, resolveSubscriptionId } from "../lib/billing/webhook";
import { quantityOf } from "../lib/billing/quantity";
import { REMINDER_DAYS, daysUntilDueJst, reminderDayFor } from "../lib/billing/reminders";
import { computeTrialEnd, MIN_TRIAL_CARRYOVER_MS } from "../lib/billing/trial";
import {
  contractAmountFromItem, formatContractAmount, contractAmountLabel,
  CONTRACT_AMOUNT_NONE, CONTRACT_AMOUNT_UNKNOWN,
} from "../lib/billing/amount";
import { isBillingLocked, BILLING_LOCKED_MSG, BILLING_LOCKED_MSG_KIOSK, BILLING_LOCKED_CODE } from "../lib/billing/messages";
import { billingGate } from "../lib/billing/gate";
import { shouldShowBillingBanner, BILLING_BANNER_MSG } from "../lib/billing/banner";
import type { SupabaseClient } from "@supabase/supabase-js";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}
const eq = (label: string, got: unknown, want: unknown) =>
  check(label, got === want, `got ${JSON.stringify(got)} / want ${JSON.stringify(want)}`);

// ============================================================
// (1) normalizeStatus＝Stripe 7値＋未知/null → NOX 5値（設計書 §2-1 の写像表を逐語）
// ============================================================
{
  const table: Array<[string | null | undefined, string]> = [
    // 5値内はそのまま
    ["trialing", "trialing"], ["active", "active"], ["past_due", "past_due"],
    ["canceled", "canceled"], ["inactive", "inactive"],
    // Stripe 固有値の写像
    ["incomplete", "inactive"],          // 未開始＝書けない
    ["incomplete_expired", "canceled"],  // 安全側
    ["unpaid", "canceled"],              // 安全側
    ["paused", "past_due"],              // 支払い待ち相当＝writable 側に残す
    // 未知/欠落は安全側（read-only 失効）へ倒す
    ["", "canceled"], ["ACTIVE", "canceled"], ["未知", "canceled"],
    [null, "canceled"], [undefined, "canceled"],
  ];
  for (const [input, want] of table) eq(`(1) normalizeStatus(${JSON.stringify(input)})`, normalizeStatus(input), want);
  check("(1) 出力は必ず BILLING_STATUSES の要素", table.every(([i]) => (BILLING_STATUSES as readonly string[]).includes(normalizeStatus(i))));
  // ★安全側の意味: unpaid/incomplete_expired は writable であってはならない（読取専用へ倒す）
  check("(1) unpaid → writable でない", !isWritableStatus(normalizeStatus("unpaid")));
  check("(1) incomplete → writable でない", !isWritableStatus(normalizeStatus("incomplete")));
  check("(1) paused → writable（past_due 相当＝支払い待ちは止めない）", isWritableStatus(normalizeStatus("paused")));
}

// normalizeInterval
{
  eq("(1) normalizeInterval(month)", normalizeInterval("month"), "month");
  eq("(1) normalizeInterval(year)", normalizeInterval("year"), "year");
  eq("(1) normalizeInterval(day)", normalizeInterval("day"), null);
  eq("(1) normalizeInterval(week)", normalizeInterval("week"), null);
  eq("(1) normalizeInterval(null)", normalizeInterval(null), null);
  eq("(1) normalizeInterval(undefined)", normalizeInterval(undefined), null);
}

// ============================================================
// (2) status 定数 ⟷ SQL 述語（mig0087）の一致
// ============================================================
{
  eq("(2) BILLING_STATUSES = org_billing CHECK の5値", BILLING_STATUSES.join(","), "trialing,active,past_due,canceled,inactive");
  eq("(2) WRITABLE_STATUSES = billing_writable_of 第一条件の3値", WRITABLE_STATUSES.join(","), "trialing,active,past_due");
  check("(2) WRITABLE ⊂ BILLING", WRITABLE_STATUSES.every((s) => (BILLING_STATUSES as readonly string[]).includes(s)));
  for (const s of ["trialing", "active", "past_due"]) check(`(2) isWritableStatus(${s})`, isWritableStatus(s));
  for (const s of ["canceled", "inactive"]) check(`(2) isWritableStatus(${s}) = false`, !isWritableStatus(s));
  check("(2) isWritableStatus(null) = false（fail-closed）", !isWritableStatus(null));
  check("(2) isBillingStatus(active)", isBillingStatus("active"));
  check("(2) isBillingStatus(unpaid) = false（Stripe 値は素通ししない）", !isBillingStatus("unpaid"));
  check("(2) isBillingStatus(null) = false", !isBillingStatus(null));
}

// ============================================================
// (3) billingFieldsFromSubscription（§2-2/2-3・Stripe v22 の item 側 current_period_end）
// ============================================================
const CPE_ITEM = 1_800_000_000; // item 側
const CPE_SUB = 1_700_000_000;  // 旧形状（sub 側）
{
  const f = billingFieldsFromSubscription({
    id: "sub_1", status: "active", cancel_at_period_end: true, collection_method: "send_invoice",
    current_period_end: CPE_SUB,
    items: { data: [{ quantity: 6, current_period_end: CPE_ITEM, price: { recurring: { interval: "year" } } }] },
  }, "cus_1");
  eq("(3) stripe_customer_id は引数から", f.stripe_customer_id, "cus_1");
  eq("(3) stripe_subscription_id", f.stripe_subscription_id, "sub_1");
  eq("(3) status 正規化を経由", f.status, "active");
  eq("(3) interval は item.price.recurring から", f.interval, "year");
  eq("(3) quantity", f.quantity, 6);
  eq("(3) cancel_at_period_end", f.cancel_at_period_end, true);
  eq("(3) collection_method", f.collection_method, "send_invoice");
  eq("(3) trial_ends_at は常に null 固定", f.trial_ends_at, null);
  eq("(3) ★current_period_end は item 側を優先（v22/basil）", f.current_period_end, new Date(CPE_ITEM * 1000).toISOString());
}
{
  // item 側が無い旧形状 → sub 側へフォールバック
  const f = billingFieldsFromSubscription({
    id: "sub_2", status: "past_due", current_period_end: CPE_SUB,
    items: { data: [{ quantity: 1, price: { recurring: { interval: "month" } } }] },
  }, "cus_2");
  eq("(3) 旧形状は sub 側 current_period_end へフォールバック", f.current_period_end, new Date(CPE_SUB * 1000).toISOString());
  eq("(3) interval month", f.interval, "month");
  eq("(3) cancel_at_period_end 既定 false", f.cancel_at_period_end, false);
  eq("(3) collection_method 既定 charge_automatically", f.collection_method, "charge_automatically");
}
{
  // 番兵: items 空・quantity 欠落・cpe 両方なし・sub 自体が null
  const f = billingFieldsFromSubscription({ id: "sub_3", status: "unpaid", items: { data: [] } }, "cus_3");
  eq("(3) items 空でも quantity は min 1", f.quantity, 1);
  eq("(3) cpe 両方なし → null", f.current_period_end, null);
  eq("(3) interval 解けない → null", f.interval, null);
  eq("(3) status unpaid → canceled（安全側）", f.status, "canceled");
  const g = billingFieldsFromSubscription(null, "cus_4");
  eq("(3) sub=null でも落ちない（subscription_id null）", g.stripe_subscription_id, null);
  eq("(3) sub=null は status canceled", g.status, "canceled");
  eq("(3) sub=null でも quantity 1", g.quantity, 1);
  const h = billingFieldsFromSubscription({
    id: "sub_5", status: "active", items: { data: [{ quantity: 0, current_period_end: CPE_ITEM, price: { recurring: { interval: "month" } } }] },
  }, "cus_5");
  eq("(3) quantity 0 → min 1（0店 org 番兵と同規則）", h.quantity, 1);
  const bad = billingFieldsFromSubscription({
    id: "sub_6", status: "active", items: { data: [{ quantity: 2, current_period_end: Number.NaN, price: { recurring: { interval: "month" } } }] },
  }, "cus_6");
  eq("(3) cpe が NaN → null（Number.isFinite ガード）", bad.current_period_end, null);
}

// ============================================================
// (4) webhook 純関数（§3 写像表）
// ============================================================
{
  const want = [
    "checkout.session.completed", "customer.subscription.created", "customer.subscription.updated",
    "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed",
  ];
  eq("(4) HANDLED は 6 events", HANDLED.size, 6);
  for (const e of want) check(`(4) HANDLED に ${e}`, HANDLED.has(e));
  for (const e of ["invoice.created", "customer.created", "charge.succeeded", "invoice.finalized"]) {
    check(`(4) HANDLED に ${e} を含まない（200 素通し側）`, !HANDLED.has(e));
  }
  // 3経路
  eq("(4) subscription.* → obj.id", resolveSubscriptionId("customer.subscription.updated", { id: "sub_A", subscription: "sub_X" }), "sub_A");
  eq("(4) checkout.session → obj.subscription", resolveSubscriptionId("checkout.session.completed", { id: "cs_1", subscription: "sub_B" }), "sub_B");
  eq("(4) 旧形状 invoice → obj.subscription", resolveSubscriptionId("invoice.paid", { id: "in_1", subscription: "sub_C" }), "sub_C");
  eq("(4) ★v22 invoice → parent.subscription_details.subscription",
    resolveSubscriptionId("invoice.paid", { id: "in_2", parent: { subscription_details: { subscription: "sub_D" } } }), "sub_D");
  eq("(4) 解決不能 → null", resolveSubscriptionId("invoice.paid", { id: "in_3" }), null);
  eq("(4) parent 非文字列 → null", resolveSubscriptionId("invoice.paid", { parent: { subscription_details: { subscription: 42 } } }), null);
  eq("(4) subscription.* で id 欠落 → null", resolveSubscriptionId("customer.subscription.deleted", {}), null);
  eq("(4) 旧形状優先: subscription があれば parent は見ない",
    resolveSubscriptionId("invoice.paid", { subscription: "sub_E", parent: { subscription_details: { subscription: "sub_F" } } }), "sub_E");
}

// ============================================================
// (5) quantityOf（裁定8・min 1 番兵）
// ============================================================
{
  eq("(5) 0店 → 1（番兵）", quantityOf(0), 1);
  eq("(5) 1店 → 1", quantityOf(1), 1);
  eq("(5) 6店 → 6", quantityOf(6), 6);
  eq("(5) null → 1", quantityOf(null), 1);
  eq("(5) undefined → 1", quantityOf(undefined), 1);
  eq("(5) 負値 → 1", quantityOf(-3), 1);
  eq("(5) NaN → 1", quantityOf(Number.NaN), 1);
  eq("(5) Infinity → 1（非有限は 0 扱い）", quantityOf(Number.POSITIVE_INFINITY), 1);
  eq("(5) 小数は切り捨て", quantityOf(2.9), 2);
}

// ============================================================
// (6) reminders（BT-4・JST 暦日）
// ============================================================
// JST 深夜0時の epoch 秒（UTC で前日 15:00）
const jstMidnight = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, -9, 0, 0) / 1000;
{
  eq("(6) REMINDER_DAYS 逐語", REMINDER_DAYS.join(","), "14,7,3,2,1,0");

  const due = jstMidnight(2026, 8, 21); // 期日＝JST 2026-08-21
  const beforeJstMidnight = new Date("2026-08-20T14:59:00Z"); // JST 08-20 23:59
  const afterJstMidnight = new Date("2026-08-20T15:01:00Z");  // JST 08-21 00:01
  eq("(6) ★JST 暦日境界: 23:59 側は あと1日", daysUntilDueJst(due, beforeJstMidnight), 1);
  eq("(6) ★JST 暦日境界: 00:01 側は 当日(0)", daysUntilDueJst(due, afterJstMidnight), 0);

  const now = afterJstMidnight; // JST 2026-08-21
  eq("(6) 14日前", daysUntilDueJst(jstMidnight(2026, 9, 4), now), 14);
  eq("(6) 7日前", daysUntilDueJst(jstMidnight(2026, 8, 28), now), 7);
  eq("(6) 期日超過は負値", daysUntilDueJst(jstMidnight(2026, 8, 19), now), -2);
  // 期日の時刻は JST 暦日へ丸める（Stripe due_date は任意時刻でありうる）
  eq("(6) 期日の時刻は暦日へ丸める", daysUntilDueJst(Date.parse("2026-09-03T20:00:00Z") / 1000, now), 14); // JST 09-04 05:00

  eq("(6) reminderDayFor 一致(14)", reminderDayFor(jstMidnight(2026, 9, 4), now), 14);
  eq("(6) reminderDayFor 一致(0)", reminderDayFor(jstMidnight(2026, 8, 21), now), 0);
  eq("(6) reminderDayFor 非一致(4日前)", reminderDayFor(jstMidnight(2026, 8, 25), now), null);
  eq("(6) reminderDayFor 非一致(15日前)", reminderDayFor(jstMidnight(2026, 9, 5), now), null);
  eq("(6) reminderDayFor 期日超過は対象外", reminderDayFor(jstMidnight(2026, 8, 20), now), null);
  check("(6) 閾値の全要素が reminderDayFor で拾える",
    REMINDER_DAYS.every((d) => reminderDayFor(jstMidnight(2026, 8, 21) + d * 86400, now) === d));
}

// ============================================================
// (7) computeTrialEnd（Stripe Checkout の 48時間制約）
// ============================================================
{
  const now = new Date("2026-08-20T00:00:00Z");
  const at = (ms: number) => new Date(now.getTime() + ms).toISOString();
  eq("(7) null → null", computeTrialEnd(null, now), null);
  eq("(7) undefined → null", computeTrialEnd(undefined, now), null);
  eq("(7) 不正文字列 → null", computeTrialEnd("not-a-date", now), null);
  eq("(7) 過去 → null", computeTrialEnd(at(-86400000), now), null);
  eq("(7) 47時間先 → null（48h 未満は持ち越さない）", computeTrialEnd(at(47 * 3600 * 1000), now), null);
  eq("(7) ★ちょうど48時間 → 持ち越す（境界は含む）",
    computeTrialEnd(at(MIN_TRIAL_CARRYOVER_MS), now), Math.floor((now.getTime() + MIN_TRIAL_CARRYOVER_MS) / 1000));
  eq("(7) 30日先 → epoch 秒", computeTrialEnd(at(30 * 86400 * 1000), now), Math.floor((now.getTime() + 30 * 86400 * 1000) / 1000));
  eq("(7) MIN_TRIAL_CARRYOVER_MS = 48h", MIN_TRIAL_CARRYOVER_MS, 48 * 60 * 60 * 1000);
}

// ============================================================
// (8) amount（契約金額）
// ============================================================
{
  const a = contractAmountFromItem({ quantity: 6, price: { unit_amount: 7800, recurring: { interval: "month" } } });
  check("(8) 算出できる", a !== null);
  eq("(8) total = unit × qty", a?.total, 46800);
  eq("(8) 整形", a ? formatContractAmount(a) : "", "¥46,800/月（¥7,800 × 6店舗）");
  const y = contractAmountFromItem({ quantity: 1, price: { unit_amount: 86000, recurring: { interval: "year" } } });
  eq("(8) 年払いの整形", y ? formatContractAmount(y) : "", "¥86,000/年（¥86,000 × 1店舗）");
  eq("(8) unit_amount 欠落 → null", contractAmountFromItem({ quantity: 1, price: { recurring: { interval: "month" } } }), null);
  eq("(8) quantity 0 → null", contractAmountFromItem({ quantity: 0, price: { unit_amount: 100, recurring: { interval: "month" } } }), null);
  eq("(8) interval day → null", contractAmountFromItem({ quantity: 1, price: { unit_amount: 100, recurring: { interval: "day" } } }), null);
  eq("(8) item null → null", contractAmountFromItem(null), null);
  eq("(8) 負の unit_amount → null", contractAmountFromItem({ quantity: 1, price: { unit_amount: -1, recurring: { interval: "month" } } }), null);
  // 表示ラベル3分岐
  eq("(8) 契約前ラベル", contractAmountLabel(false, null), CONTRACT_AMOUNT_NONE);
  eq("(8) 契約前は amount があっても契約前", contractAmountLabel(false, a), CONTRACT_AMOUNT_NONE);
  eq("(8) 契約あり・算出可", contractAmountLabel(true, a), "¥46,800/月（¥7,800 × 6店舗）");
  eq("(8) 契約あり・算出不能は degrade", contractAmountLabel(true, null), CONTRACT_AMOUNT_UNKNOWN);
}

// ============================================================
// (9) messages
// ============================================================
{
  check("(9) DB の英字トークンを拾う", isBillingLocked("billing locked"));
  check("(9) 前後に文脈があっても拾う", isBillingLocked('new row violates ... "billing locked"'));
  check("(9) forbidden は拾わない", !isBillingLocked("forbidden"));
  check("(9) null/空は false", !isBillingLocked(null) && !isBillingLocked(undefined) && !isBillingLocked(""));
  eq("(9) 管理者向け文言", BILLING_LOCKED_MSG, "ご利用プランの制限で更新できません（管理者にご確認ください）");
  eq("(9) kiosk 向けは責任者", BILLING_LOCKED_MSG_KIOSK, "ご利用プランの制限で更新できません（責任者にご確認ください）");
  eq("(9) code", BILLING_LOCKED_CODE, "billing_read_only");
  check("(9) 画面文言に英字トークンを混ぜない", !BILLING_LOCKED_MSG.includes("billing") && !BILLING_LOCKED_MSG_KIOSK.includes("billing"));
}

// ============================================================
// (11) banner 出現条件（設計書 §6）＝SQL 述語 billing_writable_of の否定と同値であること
// ============================================================
{
  eq("(11) バナー文言は設計書 §6 逐語", BILLING_BANNER_MSG,
    "ご利用プランが失効しています。閲覧・出力は可能ですが、更新はできません。");

  const now = new Date("2026-08-20T00:00:00Z");
  const future = new Date("2026-09-20T00:00:00Z").toISOString();
  const past = new Date("2026-08-19T00:00:00Z").toISOString();

  check("(11) 行なし → 出す（fail-closed）", shouldShowBillingBanner(null, now));
  check("(11) undefined → 出す", shouldShowBillingBanner(undefined, now));
  check("(11) status なし → 出す", shouldShowBillingBanner({ status: null }, now));
  check("(11) canceled → 出す", shouldShowBillingBanner({ status: "canceled" }, now));
  check("(11) inactive → 出す", shouldShowBillingBanner({ status: "inactive" }, now));
  check("(11) 未知 status → 出す", shouldShowBillingBanner({ status: "unpaid" }, now));
  check("(11) active → 出さない", !shouldShowBillingBanner({ status: "active" }, now));
  check("(11) past_due → 出さない（支払い待ちは止めない）", !shouldShowBillingBanner({ status: "past_due" }, now));
  check("(11) active は trial 期限切れでも出さない（述語と同じく期限を見ない）",
    !shouldShowBillingBanner({ status: "active", trial_ends_at: past }, now));
  check("(11) trialing×期限が未来 → 出さない", !shouldShowBillingBanner({ status: "trialing", trial_ends_at: future }, now));
  check("(11) trialing×期限切れ → 出す", shouldShowBillingBanner({ status: "trialing", trial_ends_at: past }, now));
  check("(11) trialing×期限 null → 出す（fail-closed）", shouldShowBillingBanner({ status: "trialing", trial_ends_at: null }, now));
  check("(11) trialing×期限が不正文字列 → 出す", shouldShowBillingBanner({ status: "trialing", trial_ends_at: "x" }, now));
  check("(11) ★境界: trialing×期限がちょうど now → 出す（SQL は trial_ends_at > now()）",
    shouldShowBillingBanner({ status: "trialing", trial_ends_at: now.toISOString() }, now));

  // ★述語の否定との同値を全組合せで（status 5値＋未知 × 期限 未来/過去/なし）
  //   期待値は SQL を逐語で写した参照実装（billing_writable_of の select 式そのもの）。
  const sqlWritable = (status: string, trialEndsAt: string | null): boolean => {
    const alive = status === "trialing" || status === "active" || status === "past_due";
    const trialOk = status !== "trialing" || (!!trialEndsAt && new Date(trialEndsAt).getTime() > now.getTime());
    return alive && trialOk;
  };
  let pairs = 0;
  for (const s of ["trialing", "active", "past_due", "canceled", "inactive", "unpaid"]) {
    for (const te of [future, past, null]) {
      const banner = shouldShowBillingBanner({ status: s, trial_ends_at: te }, now);
      check(`(11) 同値 ${s}/${te ? (te === future ? "未来" : "過去") : "なし"}`, banner === !sqlWritable(s, te),
        `banner=${banner} / !sqlWritable=${!sqlWritable(s, te)}`);
      pairs++;
    }
  }
  eq("(11) 同値検査の組合せ数", pairs, 18);
}

// ============================================================
// (10) billingGate（スタブ client＝DB 非依存で分岐のみ）
// ============================================================
const stub = (impl: () => Promise<{ data: unknown; error: { message: string } | null }>) =>
  ({ rpc: impl } as unknown as SupabaseClient);

async function gateChecks() {
  const okRes = await billingGate(stub(async () => ({ data: true, error: null })));
  eq("(10) writable=true は null（素通し）", okRes, null);

  const ngRes = await billingGate(stub(async () => ({ data: false, error: null })));
  check("(10) writable=false は 402 を返す", ngRes !== null && ngRes.status === 402, `status=${ngRes?.status}`);
  if (ngRes) {
    const body = (await ngRes.json()) as { error?: string; code?: string };
    eq("(10) 402 の文言は定数と一致", body.error, BILLING_LOCKED_MSG);
    eq("(10) 402 の code", body.code, BILLING_LOCKED_CODE);
  }

  // null（行なし等）も fail-closed で 402＝data===true のときだけ通す
  const nullRes = await billingGate(stub(async () => ({ data: null, error: null })));
  check("(10) data=null も 402（fail-closed）", nullRes !== null && nullRes.status === 402);

  const errRes = await billingGate(stub(async () => ({ data: null, error: { message: "boom" } })));
  check("(10) RPC error は 500（402 と区別＝失効ではなく障害）", errRes !== null && errRes.status === 500, `status=${errRes?.status}`);
  if (errRes) {
    const body = (await errRes.json()) as { error?: string };
    check("(10) 500 の文言は失効文言ではない", body.error !== BILLING_LOCKED_MSG);
  }
}

// tsx/esbuild の cjs 出力では top-level await 不可＝明示的に締める。
void gateChecks().then(() => {
  if (fails.length) {
    console.error(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.error(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-billing-app ALL PASS (${pass} assertions)`);
});
