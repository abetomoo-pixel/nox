/*
 * verify:nox-p173 — 便 P173（2026-10-16）0173／0174 の client（裁定385／386／389／391／392／393）＋デモ payload の係留。
 *   npm run verify:nox-p173。静的 pin（fs）＋純関数（lib/nox/register/p173）＋live の 0173／0174 形（docs/demo/verify_0173_0174.sql＝SELECT のみ・SUPABASE_DB_URL・default_transaction_read_only）。
 *   (1) 裁定385: 延長パターン＝レジの選択（既定の印）・自動延長後の切替（check_set_ext_rule）・料金マスタの「延長パターン」（p_is_default_ext・'too many extension'）
 *   (2) 裁定386: 途中合流＝店設定 join_mode・セット確定（set_frozen）の表示
 *   (3) 裁定389: キャストのレジ運用＝店設定 2 項目（キャスト画面の設定）・本人セッションの入口（castOwnSessionRegisterOf・cast-entry-server）・/report の締め・操作者の表示
 *   (4) 裁定391: 明細の並び順（orderLines）・小計 2 行（twoClassSumsOf）・日報／分析の 2 分類（twoClassOf・upperKindOf）
 *   (5) 裁定392: お客様チップ（ボトル）→ p_keep・「キープ」→ p_status 'pending'・顧客詳細の会計前
 *   (6) 裁定393: 手数料（payFeeKeyOf／payFeeOf／payFeeNoteOf）・groupDueFull／receipt のサ料の母数から除外・入金モーダルの 1 行・p_fee_key・日報のラベル
 *   (7) payload: ACE slide_apply 'next'・6 店の体験入店＝kind '体入'・terms_acceptances 6・MUSE／LUNA の staff_contracts 2＋staff_punches 28・列カタログに 4 表
 *   (8) live: verify_0173_0174.sql の 31 行が全部 ok（適用時点のデータ行 2 は 8-2 で非デモ org に絞る）
 *   (9) ★T-2（起票110・0174 ★2）: 達成ボーナスの多段＝{pct, amount} に一本化（bonus-tiers 純関数・plan-editor の段の追加／削除・試算・テンプレ・gen-demo）
 *   (10) ★GV-62: /shift 今日タブの 5 択チップ＝カード表示（.nox-table.cardrows・<1280）に付ける（≤899 の入れ子を撤去）
 *        ★GV-63: キャスト・報酬の上段タブ（待遇プラン／控除・送り／ノルマ設定（店））と下段タブの分離・?tab= 保持・準備中チップ 3 つ撤去
 */
import fs from "node:fs";
import { Client } from "pg";
import { castOwnSessionRegisterOf, castRegisterDeviceOf, joinModeOf, lineRankOf, orderLines, payFeeKeyOf, payFeeLineNameOf, payFeeNoteOf, payFeeOf, payFeeRatesOf, setFrozenNoteOf, twoClassSumsOf, upperKindOf } from "../lib/nox/register/p173";
import { groupDueFull } from "../lib/nox/check-calc";
import { sumCategories, twoClassOf } from "../lib/nox/analytics/category-map";
import { TRIAL, BONUS_TIERS } from "../scripts/demo/profiles.mjs";
import { BONUS_TIER_MAX, BONUS_TIER_MODE_DEFAULT, bonusOf, bonusParamsOf, bonusTiersErrOf, bonusTiersOf } from "../lib/nox/bonus-tiers";
import { simulate } from "../lib/nox/payroll/sim";

let pass = 0; const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");
const reg = src("app/(manage)/register/register-board.tsx"); const pb = src("app/(manage)/master/pricing/pricing-board.tsx"); const spp = src("app/(manage)/master/store-profile-panel.tsx");
const msp = src("app/(manage)/master/mine-settings-panel.tsx"); const lay = src("app/(manage)/layout.tsx"); const mlay = src("app/mine/layout.tsx"); const rb = src("app/(manage)/report/report-board.tsx");
const cpm = src("components/nox/customer-pick-modal.tsx"); const lkb = src("components/nox/line-keep-button.tsx"); const cd = src("app/(manage)/customers/[id]/customer-detail.tsx"); const an = src("app/(manage)/analytics/analytics-board.tsx");

// ── (1) 385
check("p173(1-1) register: 自動延長の店＝「延長パターン ▾」（data-ext-pattern）→ check_set_ext_rule・手動延長の選択に「（既定）」", reg.includes('data-ext-pattern="1"') && reg.includes('supabase.rpc("check_set_ext_rule"') && reg.split('{m.is_default ? "（既定）" : ""}').length >= 3);
check("p173(1-2) register: CheckRow.ext_menu_snap に is_default・切替の完了文言＝差額引き直し", reg.includes("is_default?: boolean") && reg.includes("確定済みの延長は新しい単価で引き直し"));
check("p173(1-3) pricing-board: p_is_default_ext を常に明示送信・帯の保存は既定を維持・「延長パターン」節（n/3・既定の radio）・'too many extension' の和文", pb.includes("p_is_default_ext: p.is_default_ext ?? false") && pb.includes("is_default_ext: fk === \"extension\" ? (existing?.is_default_ext ?? false) : false") && pb.includes('data-ext-patterns="1"') && pb.includes("too many extension"));

// ── (2) 386
check("p173(2-1) joinModeOf: 欠損／不正＝join_set・extend_only だけ別値", joinModeOf({}) === "join_set" && joinModeOf({ join_mode: "x" }) === "join_set" && joinModeOf({ join_mode: "extend_only" }) === "extend_only");
check("p173(2-2) setFrozenNoteOf: true で注記・false／null は null", typeof setFrozenNoteOf(true) === "string" && setFrozenNoteOf(false) === null && setFrozenNoteOf(null) === null);
check("p173(2-3) register: セット確定の印（data-set-frozen）とセット行の注記・store-profile: 途中合流の select（data-join-mode・join_mode を patch）", reg.includes('data-set-frozen="1"') && reg.includes("l.fee_kind === \"set\" && check?.set_frozen") && spp.includes('data-join-mode="1"') && spp.includes("out.join_mode = form.join_mode"));

// ── (3) 389
check("p173(3-1) castOwnSessionRegisterOf: OFF／不許可＝false・own_phone＝true・store_device は端末 0 台のときだけ true", !castOwnSessionRegisterOf({ enabled: false, canRegister: true, device: "own_phone", registerDevices: 0 }) && !castOwnSessionRegisterOf({ enabled: true, canRegister: false, device: "own_phone", registerDevices: 0 })
  && castOwnSessionRegisterOf({ enabled: true, canRegister: true, device: "own_phone", registerDevices: 3 }) && castOwnSessionRegisterOf({ enabled: true, canRegister: true, device: "store_device", registerDevices: 0 }) && !castOwnSessionRegisterOf({ enabled: true, canRegister: true, device: "store_device", registerDevices: 1 }));
check("p173(3-2) castRegisterDeviceOf: 欠損＝store_device・own_phone だけ別値", castRegisterDeviceOf({}) === "store_device" && castRegisterDeviceOf({ cast_register_device: "own_phone" }) === "own_phone" && castRegisterDeviceOf({ cast_register_device: "zzz" }) === "store_device");
check("p173(3-3) cast-entry-server: auth_cast_can_register→店設定→kiosk_devices（purpose register・admin で件数だけ）・(manage)/layout が /register と /report を通す・ナビに「日報」", fs.existsSync("lib/nox/register/cast-entry-server.ts") && src("lib/nox/register/cast-entry-server.ts").includes('.eq("purpose", "register")') && lay.includes("castRegisterEntryOf(supabase)") && lay.includes('pathname === "/report"') && lay.includes('{ href: "/report", label: "日報" }'));
check("p173(3-4) /mine のナビ: 本人セッション可のときだけ「レジ」・report page が isCast・report-board は isCast で通常の締めだけ（canClose）", mlay.includes("regEntry.allowed ? [{ href: \"/register\", label: \"レジ\" }]") && src("app/(manage)/report/page.tsx").includes('isCast={role === "cast"}') && rb.includes("const canClose = isManagerUp || staffPerm.close || isCast;") && rb.includes("{(isManagerUp || isCast) && ("));
check("p173(3-5) キャスト画面の設定: レジ使用（set_store_cast_register・owner）と操作端末（set_store_profile cast_register_device・レジ使用 ON のときだけ）＝予約の申請の次", msp.includes('supabase.rpc("set_store_cast_register"') && msp.includes("p_patch: { cast_register_device: next }") && msp.indexOf('onOffRow("reservation_request")') < msp.indexOf('data-cast-register="1"') && msp.includes("!castReg.enabled}"));
check("p173(3-6) register: 操作者の表示（opened_by_membership→memberships.role／users.name・cast は「（キャスト）」）", reg.includes("opened_by_membership") && reg.includes('data-opened-by="1"') && reg.includes('openedBy.role === "cast" ? "（キャスト）" : ""'));

// ── (4) 391
const L = (kind: string, fee_kind: string | null, sort_order: number, line_total = 100) => ({ id: `${kind}:${fee_kind}:${sort_order}`, kind, fee_kind, sort_order, line_total });
const sample = [L("drink", null, 1), L("charge", "pay_fee", 9), L("time", "extension", 3), L("discount", null, 8), L("set", "set", 2), L("charge", "hon_shimei", 5), L("bottle", null, 4), L("charge", "dohan", 7), L("set", "set", 6, 50) /* 合流セット */];
const ordered = orderLines(sample).map((l) => l.id);
check("p173(4-1) orderLines: セット（2・合流 6）→延長→指名群（本 5・同伴 7）→手数料→商品（注文順 1・4）→割引", JSON.stringify(ordered) === JSON.stringify(["set:set:2", "set:set:6", "time:extension:3", "charge:hon_shimei:5", "charge:dohan:7", "charge:pay_fee:9", "drink:null:1", "bottle:null:4", "discount:null:8"]), ordered.join(","));
check("p173(4-2) lineRankOf: vip_charge＝セット段・ext_shimei＝指名群・custom／food／keep_out＝商品", lineRankOf({ kind: "charge", fee_kind: "vip_charge" }) === 0 && lineRankOf({ kind: "charge", fee_kind: "ext_shimei" }) === 2 && lineRankOf({ kind: "custom" }) === 4 && lineRankOf({ kind: "food" }) === 4 && lineRankOf({ kind: "keep_out" }) === 4);
check("p173(4-3) twoClassSumsOf＝daily_report_aggregate の分類（上段 set／time／charge・商品はそれ以外・discount 除外）", JSON.stringify(twoClassSumsOf(sample)) === JSON.stringify({ upper: 550, products: 200 }) && upperKindOf("charge") && !upperKindOf("bottle"));
check("p173(4-4) twoClassOf（分析）＝time＋other／drink＋champ＋bottle", (() => { const s = sumCategories([{ kind: "time", amount: 10 }, { kind: "charge", fee_kind: "hon_shimei", amount: 5 }, { kind: "drink", amount: 7 }, { kind: "bottle", amount: 3 }, { kind: "discount", amount: 1 }]); const tc = twoClassOf(s); return tc.upper === 15 && tc.products === 10; })());
check("p173(4-5) register: orderLines で描画・小計 2 行（data-sum-upper／products）・report: upperKindOf＋列「セット・延長・指名」「商品」・analytics: data-two-class", reg.includes("{groupLines(orderLines(lines)).map((grp) => {") /* ★便 GV-C C-4: 集約の上に乗せた */ && reg.includes('data-sum-upper="1"') && reg.includes('data-sum-products="1"') && rb.includes("upperKindOf(l.kind)") && rb.includes('data-label="セット・延長・指名"') && an.includes('data-two-class="1"'));

// ── (5) 392
check("p173(5-1) customer-pick-modal: check_line_set_customer に p_keep: isBottle（ボトルのお客様＝会計前キープ）", cpm.includes("p_customer_id: customerId, p_keep: isBottle }"));
check("p173(5-2) line-keep-button: bottle_keep_register に p_status 'pending'・文言「会計前＝会計で確定」", lkb.includes('p_status: "pending"') && lkb.includes("（会計前＝会計で確定）"));
check("p173(5-3) customer-detail: pending_bottles を本数に含め「（うち会計前 n）」・状態「会計前」", cd.includes("summary?.pending_bottles ?? 0") && cd.includes("うち会計前") && cd.includes('k.status === "pending" ? "会計前"'));

// ── (6) 393
check("p173(6-1) payFeeKeyOf: cash／ar＝null・card→card・emoney→emoney・qr／other→other", payFeeKeyOf("cash") === null && payFeeKeyOf("ar") === null && payFeeKeyOf("card") === "card" && payFeeKeyOf("emoney") === "emoney" && payFeeKeyOf("qr") === "other" && payFeeKeyOf("other") === "other");
check("p173(6-2) payFeeOf＝round(額×率/100)（1 円未満四捨五入・率 0＝0）・行名＝check_pay と同じ", payFeeOf(12345, 10) === 1235 && payFeeOf(12344, 10) === 1234 && payFeeOf(5, 10) === 1 && payFeeOf(1000, 0) === 0 && payFeeLineNameOf("card", 10) === "カード手数料 10%" && payFeeLineNameOf("emoney", 3) === "電子マネー手数料 3%");
check("p173(6-3) payFeeRatesOf: 欠損／不正＝0・整数 0〜100 だけ・payFeeNoteOf＝率 0 は null・受取額＝入金額＋手数料", JSON.stringify(payFeeRatesOf({})) === JSON.stringify({ card: 0, emoney: 0, other: 0 }) && payFeeRatesOf({ pay_fee_rates: { card: 10, emoney: 101, other: "3" } }).card === 10 && payFeeRatesOf({ pay_fee_rates: { card: 10, emoney: 101 } }).emoney === 0
  && payFeeNoteOf("card", 10000, { card: 0, emoney: 0, other: 0 }) === null && JSON.stringify(payFeeNoteOf("card", 10000, { card: 10, emoney: 0, other: 0 })) === JSON.stringify({ key: "card", rate: 10, fee: 1000, receive: 11000 }) && payFeeNoteOf("cash", 10000, { card: 10, emoney: 0, other: 0 }) === null);
{ const s = { service_rate: 10, round_unit: 1, round_mode: "round" as const };
  const base = groupDueFull([{ kind: "drink", line_total: 10000 }], s);
  const withFee = groupDueFull([{ kind: "drink", line_total: 10000 }, { kind: "charge", fee_kind: "pay_fee", line_total: 1000 }], s);
  const sEx = { ...s, price_display: "tax_excluded", business_tax_status: "taxable", tax_rounding: "floor" };
  const baseEx = groupDueFull([{ kind: "drink", line_total: 10000, tax_category: "taxable_10" }], sEx);
  const withFeeEx = groupDueFull([{ kind: "drink", line_total: 10000, tax_category: "taxable_10" }, { kind: "charge", fee_kind: "pay_fee", line_total: 1000, tax_category: "taxable_10" }], sEx);
  check("p173(6-4) groupDueFull: 手数料行はサ料の母数から除く（内税: 11,000＋サ料 1,000＝12,000／外税: 税は乗る）・無ければ従来と同値", base === 11000 && withFee === 12000 && baseEx === 12100 && withFeeEx === 13200, `${base}/${withFee}/${baseEx}/${withFeeEx}`); }
check("p173(6-5) receipt: サ料＝round((net − payFee)×率)・register: p_fee_key・入金モーダルの 1 行（★0187 便 2 M-17 で data-pay-fee の内訳は受け取る額の枠 data-pay-receive に統合）・393 の率がある店は旧 card_surcharge 導線を出さない", src("lib/nox/receipt.ts").includes("((net - payFee) * serviceRate) / 100") && reg.includes("p_fee_key: payFeeKeyOf(payMethod)") && reg.includes('data-pay-receive="1"') && !reg.includes('data-pay-fee="1"') && reg.includes("surchargeRate !== null && payFeeRates.card === 0 &&"));
check("p173(6-6) store-profile: 手数料率 3 欄（data-pay-fee-rates・pay_fee_rates を object で patch）・report: 「カード決済手数料（店負担）」「手数料（客負担）」のラベル併存（393 追補1）", spp.includes('data-pay-fee-rates="1"') && spp.includes("out.pay_fee_rates = Object.fromEntries(") && rb.includes('"カード決済手数料（店負担）"') && rb.includes('"手数料（客負担）"') && rb.includes("pay_fee_total"));

// ── (7) payload
const pl = (c: string) => JSON.parse(src(`docs/demo/payload/${c}.json`)) as { tables: Record<string, Record<string, unknown>[]> };
const ace = pl("ace").tables;
check("p173(7-1) ACE: comp_plans の slide_apply＝'next'（体験入店だけ null＝スライドなし・裁定395 追補1）・他 5 店は null", ace.comp_plans.every((p) => p.slide_apply === (p.name === "体験入店" ? null : "next")) && ace.comp_plans.some((p) => p.slide_apply === "next") && (["muse", "luna", "noir", "lily", "nest"] as const).every((c) => pl(c).tables.comp_plans.every((p) => p.slide_apply === null)));
check("p173(7-2) 6 店: 体験入店のキャスト（TRIAL.cast）の kind＝'体入'（GV-57）・他は '体入' でない", (Object.keys(TRIAL) as string[]).every((c) => { const T = pl(c).tables; const t = TRIAL[c as keyof typeof TRIAL].cast; return T.casts.filter((x) => x.kind === "体入").map((x) => x.name).join(",") === t; }));
check("p173(7-3) 6 店: terms_acceptances 1 行（version 0.9・accepted_by＝owner）", (Object.keys(TRIAL) as string[]).every((c) => { const T = pl(c).tables; return T.terms_acceptances?.length === 1 && T.terms_acceptances[0].terms_version === "0.9"; }));
check("p173(7-4) MUSE／LUNA: staff_contracts 2（employee＋contractor）・staff_punches 28（2 名×7 日×in/out・biz_date $rel −7〜−1）・★便 X13-H H-12 ④: 他 4 店も 2 名の契約（店長＝月給・スタッフ＝時給）と 28 行", (["muse", "luna"] as const).every((c) => { const T = pl(c).tables; return T.staff_contracts?.length === 2 && T.staff_punches?.length === 28 && new Set(T.staff_contracts.map((x) => x.contract_kind)).size === 2; }) && (["noir", "ace", "lily", "nest"] as const).every((c) => pl(c).tables.staff_contracts?.length === 2 && pl(c).tables.staff_punches?.length === 28));
check("p173(7-5) 列カタログ（docs/demo/columns_20261002.json）に 4 表＋0173／0174 の新列（jsonb_populate_recordset は default を使わない＝payload 側で埋める）", (() => { const cat = JSON.parse(src("docs/demo/columns_20261002.json")).columns as Record<string, { c: string }[]>; const has = (t: string, c: string) => (cat[t] ?? []).some((x) => x.c === c); return ["staff_contracts", "staff_punches", "staff_payroll_runs", "terms_acceptances"].every((t) => t in cat) && has("pricing_rules", "is_default_ext") && has("checks", "set_frozen") && has("comp_plans", "slide_apply") && has("penalty_config", "norm_sales_unit") && has("daily_reports", "pay_fee_total"); })());
check("p173(7-6) payload の NOT NULL 既定列が埋まる（MUSE: pricing_rules.is_default_ext・checks.set_frozen）・seed: DATED_TABLES に staff_punches", pl("muse").tables.pricing_rules.every((r) => r.is_default_ext === false) && pl("muse").tables.checks.every((r) => r.set_frozen === false) && src("lib/nox/demo/seed.ts").includes('"staff_punches", "receipt_issues"]') /* ★便 X13-G W-18 ⑤ */);

// ── (9) ★T-2 達成ボーナスの多段
{
  const t3 = [{ pct: 100, amount: 10000 }, { pct: 120, amount: 20000 }];
  check("p173(9-1) bonus-tiers: 旧形 {pct}／{pct, add}／空＝amount はコンポーネントの amount・pct 昇順・★裁定404 既定 max（最上段）と sum（全段の合計）・目標 0 は不適用",
    JSON.stringify(bonusTiersOf({ thresholds: [{ pct: 100 }] }, 5000)) === JSON.stringify([{ pct: 100, amount: 5000 }])
    && JSON.stringify(bonusTiersOf({ thresholds: [{ pct: 100, add: 9 }] }, 5000)) === JSON.stringify([{ pct: 100, amount: 5000 }])
    && JSON.stringify(bonusTiersOf({}, 5000)) === JSON.stringify([{ pct: 100, amount: 5000 }])
    && JSON.stringify(bonusTiersOf({ thresholds: [t3[1], t3[0]] }, 0)) === JSON.stringify(t3)
    && bonusOf(t3, 120000, 100000).total === 20000 && bonusOf(t3, 120000, 100000, "max").total === 20000 && bonusOf(t3, 120000, 100000, "sum").total === 30000
    && bonusOf(t3, 110000, 100000).total === 10000 && bonusOf(t3, 110000, 100000, "sum").total === 10000 && bonusOf(t3, 999999, 0).total === 0 && bonusOf(t3, 999999, 0, "sum").total === 0
    && JSON.stringify(bonusOf(t3, 120000, 100000).hit) === JSON.stringify([t3[1]]) && BONUS_TIER_MODE_DEFAULT === "max");
  check("p173(9-2) bonus-tiers: 検査＝1〜10 段・達成率 1〜1000 の整数・昇順（重複なし）・加算額 0 以上の整数／保存形＝{thresholds:[{pct, amount}]}＋amount＝1 段目",
    BONUS_TIER_MAX === 10 && bonusTiersErrOf(t3) === null && !!bonusTiersErrOf([]) && !!bonusTiersErrOf([t3[1], t3[0]]) && !!bonusTiersErrOf([{ pct: 100, amount: -1 }]) && !!bonusTiersErrOf([{ pct: 0, amount: 1 }])
    && !!bonusTiersErrOf(Array.from({ length: 11 }, (_, i) => ({ pct: 100 + i, amount: 1 })))
    && JSON.stringify(bonusParamsOf(t3)) === JSON.stringify({ params: { thresholds: t3 }, amount: 10000 }));
  const pe = src("app/(manage)/master/cast-comp/plan/plan-editor.tsx"); const cs = src("app/(manage)/master/cast-comp/comp-sections.tsx");
  check("p173(9-3) plan-editor: 達成ボーナス＝BonusRows（段の追加／削除・BONUS_TIER_MAX・bonusTiersErrOf で保存前検査）→ saveBonus（bonusParamsOf・priority 90）・売上の軸 OFF の注記・旧 {pct, add} の送信なし",
    pe.includes("function BonusRows(") && pe.includes("＋ 段を追加") && pe.includes("段を削除") && pe.includes("bonusTiersErrOf(tiers)") && pe.includes("bonusParamsOf(over.tiers)") && pe.includes("salesAxisOn={normAxesOf(settings).sales}") && !pe.includes("add: over.amount"));
  check("p173(9-4) comp-sections（PlanTab）: 既存の多段行は段を保って 1 段目だけ差替え・表示は段のラベル・{pct, add} の送信なし",
    cs.includes("bonusTiersOf(cur.params, cur.amount)") && cs.includes("bonusTiersLabel(bonusTiersOf(c.params, c.amount))") && !cs.includes("add: cAmount"));
  const sd = src("lib/nox/payroll/sim-data.ts"); const sp = src("components/simulator-panel.tsx");
  check("p173(9-5) 試算: sim-data が有効な components と norm_sales_target（targets）を載せる・SimulatorPanel に売上目標と「達成ボーナス（到達段）」の行・plan-board が targets を渡す",
    sd.includes("withComponents(sb, list)") && sd.includes("norm_sales_target") && sp.includes('data-sim-bonus="1"') && sp.includes("salesTarget: salesTargetNum") && src("app/(manage)/master/cast-comp/plan/plan-board.tsx").includes("targets={sim.targets}"));
  const P = { id: "p", name: "p", base: 0, honBack: 0, jonaiBack: 0, dohanBack: 0, salesSlide: [], pointSlide: [], components: [{ kind: "achievement_bonus", mode: "amount", amount: 10000, rate: null, params: { thresholds: t3 }, priority: 90 }] };
  const M = { penalty: { fineAbsent: 0, fineLate: 0, hoursPerShift: 5 }, normConfig: { on: false, daysFlat: 0, daysPer: 0, dohanFlat: 0, dohanPer: 0 }, deductions: [], customBackDefs: [] };
  const sim = (salesTarget?: number) => simulate({ periodDays: 30, days: 10, hoursPerDay: 5, sales: 1_200_000, hon: 0, jonai: 0, dohan: 0, productBack: { drink: 0, champ: 0, bottle: 0 }, pointProducts: 0, champCnt: 0, bottleCnt: 0, lateN: 0, absentN: 0, norm: { days: 0, dohan: 0 }, salesTarget, plan: P as never, masters: M as never, taxMode: "委託" });
  check("p173(9-6) 試算（simulate＝確定と同じ payOf）: 目標 1,000,000・売上 1,200,000＝2 段到達・max で 120% の 20,000／目標なし＝0（従来と同値）", sim(1_000_000).achievementBonus === 20000 && sim().achievementBonus === 0, `${sim(1_000_000).achievementBonus}/${sim().achievementBonus}`);
  check("p173(9-7) テンプレ（初期設定）＝{pct:100, amount}・gen-demo＝BONUS_TIERS（{pct, amount}）・payload の achievement_bonus に amount の無い段が 0（6 店）",
    src("lib/nox/setup/template-plan.ts").includes("thresholds: [{ pct: 100, amount: add }]") && BONUS_TIERS.every((x: { pct: number; amount: number }) => Number.isInteger(x.pct) && Number.isInteger(x.amount))
    && src("scripts/demo/gen-demo.mjs").includes("thresholds: BONUS_TIERS.map(")
    && (Object.keys(TRIAL) as string[]).every((c) => (pl(c).tables.comp_plan_components ?? []).filter((x) => x.kind === "achievement_bonus").every((x) => ((x.params as { thresholds?: Record<string, unknown>[] })?.thresholds ?? []).every((e) => typeof e.amount === "number"))));
}
// ── (10) ★GV-62
{
  const css = src("app/globals.css");
  const i = css.indexOf(".nox-todaywrap .nox-table.cardrows .nox-attrow > .nox-attseg {"); const blk = css.lastIndexOf("@media (max-width: 1279px) {", i);
  check("p173(10-1) GV-62: 5 択チップ＝カード表示の部品（.nox-table.cardrows）に付く（371 の <1280 ブロック内・≤899 の入れ子なし）・表表示（≥1280）は対象外",
    i > 0 && blk > 0 && !css.slice(blk, i).includes("@media (max-width: 899px)") && css.includes(".nox-todaywrap .nox-table.cardrows .nox-attrow > .nox-attseg > button {") && !css.includes("    .nox-todaywrap .nox-attrow > .nox-attseg {"));
}

{
  const nav = src("lib/nox/master/nav.ts"), np = src("app/(manage)/master/cast-comp/norma/page.tsx"), pbd = src("app/(manage)/master/cast-comp/plan/plan-board.tsx"), pe = src("app/(manage)/master/cast-comp/plan/plan-editor.tsx"), ov = src("app/(manage)/master/cast-comp/page.tsx");
  check("p173(10-2) GV-63: 上段「ノルマ設定（店）」＝/master/cast-comp/norma の実ページ（redirect なし・NormaBoard のみ）・概要カードも norma へ",
    nav.includes('{ label: "ノルマ設定（店）", href: "/master/cast-comp/norma" }') && !np.includes("redirect(\"/master/cast-comp/plan#norma\")") && np.includes("<NormaBoard ") && !np.includes("PlanBoard") && ov.includes('href: "/master/cast-comp/norma", icon: "◎", title: "ノルマ設定（店）"') && !ov.includes("plan#norma"));
  check("p173(10-3) GV-63: 下段「ノルマ目標・ボーナス（プラン）」に NormaBoard を載せない・店設定へのリンク・?tab= を URL に保持（router.replace）",
    pbd.includes('["quota", "ノルマ目標・ボーナス（プラン）"]') && !pbd.includes("<NormaBoard") && pbd.includes('<Link href="/master/cast-comp/norma" className="nox-link">ノルマ設定（店）</Link>') && pbd.includes('q.set("tab", k)') && pbd.includes('tabOfQuery(sp?.get("tab") ?? null)'));
  check("p173(10-4) GV-63: 基本・保証の準備中チップ 3 つ（daily_wage／guarantee_hours／guarantee_period）を撤去", !pe.includes('<Prep k="daily_wage" />') && !pe.includes('<Prep k="guarantee_hours" />') && !pe.includes('<Prep k="guarantee_period" />'));
}

// ── (8) live
async function live() {
  try { process.loadEnvFile(".env.local"); } catch { /* env 無し＝下で missing */ }
  if (!process.env.SUPABASE_DB_URL) { check("p173(8-0) SUPABASE_DB_URL", false, "missing"); return; }
  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 60000 });
  await db.connect();
  try {
    await db.query("set default_transaction_read_only = on");
    const r = await db.query(src("docs/demo/verify_0173_0174.sql"));
    // ★便 P173 再開（10/19）: 「適用時点の既存データ」の 6 行は店が使えば変わる（デモ reset・live 確認で ACE の会計前キープ／NOIR の既定の延長が入った）＝構造の行ではない
    //   → 8-1 から外す（mig を当てた時点の確認は handpaste の verify で済み）。使っても崩れない形だけ 8-2 で見る
    const DATA_ROWS = ["貼り先証明 orgs" /* ★2026-10-30: TEST CLUB（打合せ用の本番 org）で 9→10＝org の数は構造ではない */, "既存 bottle_keeps＝active 以外", "is_default_ext true の行", "set_frozen true の伝票", "thresholds 移行＝migrated/total", "slide_apply が null でないプラン", "スライド 4 段以上のプラン"];
    // ★便 ON-1（2026-10-26）: 0175 v2／0176／0177 の本番適用で正当に変わった行（関数数・表数・gated 数・0175 が置換した関数の md5・set_comp_plan／check_pay の引数）は 8-1 から外す（現在値は verify_0175_0176.sql が見る）
    const SUPERSEDED_ROWS = ["関数数（0173 のみ＝312）", "表数", "'billing locked' 関数数", "md5 pin 一致 24 本", "md5 不一致の関数名", "md5 pin 一致 6 本", "set_comp_plan 引数", "check_pay 引数"];
    const ng = r.rows.filter((x) => !x.ok && !DATA_ROWS.includes(x.k) && !SUPERSEDED_ROWS.includes(x.k));
    check("p173(8-1) live: verify_0173_0174.sql 31 行のうち構造の行が ok（★便 ON-1: 0175 以降で変わった 8 種の行は除外・関数 314・表 87・gated 160・md5 24＋6・列・CHECK・index・policy・引数・ACL）＝適用時点のデータ 6 行は対象外", r.rows.length === 31 && r.rows.filter((x) => DATA_ROWS.includes(x.k)).length === 7 /* ★2026-10-30: +貼り先証明 orgs */ && ng.length === 0, ng.map((x) => `${x.mig} ${x.k} ${x.v}≠${x.expected}`).join(" / "));
    const d = (await db.query(`select
        (select count(*) from public.comp_plan_components c join public.orgs o on o.id = c.org_id
          where not o.is_demo and c.kind = 'achievement_bonus' and exists (select 1 from jsonb_array_elements(c.params->'thresholds') e where not (e ? 'amount')))::int thr_ng`)).rows[0];
    check("p173(8-2) live 非デモ org: achievement_bonus の thresholds は全要素 amount あり（0174 の移行＋T-2 以降の書込は {pct, amount}）", d.thr_ng === 0, JSON.stringify(d));
  } finally { await db.end(); }
}
void live().then(() => {
  if (fails.length) { console.log(`✗ verify:nox-p173 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.log(" - " + f); process.exit(1); }
  console.log(`verify:nox-p173 OK (${pass} checks)`);
  console.log("便 P173: 385 延長パターン・386 途中合流・389 キャストのレジ運用・391 並び順と 2 分類・392 会計前キープ・393 支払手数料・payload（ACE next・体入・staff・terms）・live 31 行");
});
