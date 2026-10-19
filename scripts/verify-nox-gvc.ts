/*
 * verify:nox-gvc — 便 GV-C（2026-10-19）の UI 改修の係留。DB 不触（静的 pin＋純関数）。
 *   387／352 追補1／388／370 追補1・GV-43／44／48／50／52／53／54／58／59／60／61／64／65・C-14g・X-13-2。
 *   (1) C-1 入金モーダル（1 欄・お釣り）・C-2 開卓時のお客様・C-4／C-6 明細の集約と「最近使った」
 *   (2) C-3 給与の自動プレビュー（読込後のみ）・行の明細 PDF・C-10 OFF の制度の行
 *   (3) C-5 制度 OFF の出し分け（スライド・ボーナス・シミュレーター）・C-7 マスタの説明 1 行・C-9 ON/OFF 部品・C-8 最終来店
 *   (4) C-11 日報の締め（予定額・差額・4 欄 2×2・主ボタン）・C-12 自動再読込・C-13 領収書台帳（再発行・公開ページ・印刷）
 *   (5) C-14 日の状態 7 種・C-14e 今日タブの表・C-14f 体入（一括・本採用・警告・残日数）・C-14g 新規プランの全引数
 *   (6) C-14b autofocus 撤去・C-14h アカウント（オーナーだけ注記）・payload（スタッフの打刻・PIN）
 */
import fs from "node:fs";
import { groupLines, customerChipVisibleOf, recentProductIdsOf, isGroupableLine } from "../lib/nox/register/line-groups";
import { lastVisitRelOf } from "../lib/nox/register/customer-candidates";
import { slidesTabOn, salesSlideOn, pointSlideOn } from "../lib/nox/store-systems";
import { onOffStateTextOf } from "../components/ui/on-off";
import { DAY_STATE_ORDER, dayStateLabelOf, dayStateOf } from "../lib/nox/mine/day-state";
import { TRIAL_KIND, TRIAL_PLAN_NAME, isTrialCastOf, trialDaysLeftChipOf, trialGuaranteeRangeOf, trialPlanWarnOf, trialSettingsOf } from "../lib/nox/cast/trial-flow";
import { receiptReissueErrJa } from "../lib/nox/register/receipt-ledger";
import { buildSetupPlan } from "../lib/nox/setup/template-plan";
import { breakdownLinesOf } from "../lib/nox/payroll/breakdown-lines";

let pass = 0; const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");
const reg = src("app/(manage)/register/register-board.tsx"), pay = src("app/(manage)/payroll/payroll-board.tsx"), rep = src("app/(manage)/report/report-board.tsx");
const rcpt = src("app/(manage)/receipts/receipts-board.tsx"), wish = src("app/mine/wishes/wish-form.tsx"), sb = src("app/(manage)/shift/shift-board.tsx");
const cb = src("app/(manage)/casts/casts-board.tsx"), dash = src("app/(manage)/dashboard/dashboard-board.tsx"), css = src("app/globals.css");
const bl = src("lib/nox/payroll/breakdown-lines.ts"), col = src("lib/nox/payroll/collect.ts"), hc = src("components/ui/header-chips.tsx");

// ── (1) レジ
{
  check("gvc(1-1) C-1 入金モーダル: 1 欄（現金＝お預かり／他＝入金額）・お釣りの大きな枠・送る金額は min(入力, 残額)・tendered は現金だけ",
    reg.includes('data-pay-change="1"') && reg.includes("effAmount") && reg.includes("tendered: isCash ? enteredN : null"));
  check("gvc(1-2) C-2 開卓のモーダルにお客様の行・選んだら check_open の後に check_customer_add",
    reg.includes('data-open-cust="1"') && reg.includes('rpc("check_customer_add"'));
  const L = (id: string, o: Record<string, unknown> = {}) => ({ id, product_id: "p1", unit_price_snapshot: 1000, qty: 1, line_total: 1000, ...o });
  const g = groupLines([L("a"), L("b"), L("c", { product_id: "p2" }), L("d")]);
  check("gvc(1-3) C-4 集約: 連続する同じ商品は ×N（代表＝最後の行）・間に別の行で切れる・時間行／ボトルは集約しない",
    g.length === 3 && g[0].qty === 2 && g[0].total === 2000 && g[0].rep.id === "b" && g[2].qty === 1
    && !isGroupableLine(L("t", { time_auto: true })) && !isGroupableLine(L("k", { kind: "bottle" })) && groupLines([L("x", { customer_id: "c1" }), L("y")]).length === 2);
  check("gvc(1-4) C-4 お客様チップ: ボトル行／お客様 2 人以上／分割中／付いている行だけ",
    customerChipVisibleOf({ kind: "bottle" }, { checkCustomers: 1, splitOn: false }) && !customerChipVisibleOf({}, { checkCustomers: 1, splitOn: false })
    && customerChipVisibleOf({}, { checkCustomers: 2, splitOn: false }) && customerChipVisibleOf({}, { checkCustomers: 0, splitOn: true }) && customerChipVisibleOf({ customer_id: "c" }, { checkCustomers: 0, splitOn: false }));
  check("gvc(1-5) C-6 最近使った＝この伝票の商品行（新しい順・重複除去・セット／延長／料金は除外）",
    JSON.stringify(recentProductIdsOf([{ product_id: "a", created_at: "1" }, { product_id: "b", created_at: "2" }, { product_id: "a", created_at: "3" }, { product_id: "s", time_auto: true, created_at: "4" }, { product_id: "f", fee_kind: "set", created_at: "5" }])) === JSON.stringify(["a", "b"])
    && reg.includes("recentProductIdsOf(lines)"));
}

// ── (2) 給与
{
  check("gvc(2-1) C-3 自動プレビュー: run 読込後（runLoadedKey）だけ・暫定ピル・行ごとの明細 PDF",
    pay.includes("runLoadedKey") && pay.includes('data-payroll-provisional="1"') && pay.includes("data-row-slip"));
  {
    const pay = { slideBasis: { apply: "monthly", provisional: false, months: [{ month: "2026-09", prevMonth: "2026-09", sales: 1000, pts: 0, salesWage: 0, ptsWage: 0 }] } } as unknown;
    const txt = (sys: Record<string, unknown> | null) => (breakdownLinesOf({ pay, systems: sys } as never).earn ?? []).map((l: { label: string }) => l.label).join(" | ");
    const ptOff = txt({ sys_sales_slide: true, sys_point_slide: false }), both = txt(null);
    check("gvc(2-3) live 修正（GV-53）: pt スライド OFF の店はスライド行の「／pt n→¥」を出さない・systems なしは従来どおり両方", !ptOff.includes("pt 0→") && ptOff.includes("→時給 ¥0") && both.includes("／pt 0→¥0"), ptOff + " || " + both);
  }
  check("gvc(2-2) C-10 OFF の制度: breakdownLinesOf に systems・0 円の行は出さない／値があれば「（OFF の制度）」・collect は売上率 OFF で salesBackTable 空",
    bl.includes("systemOfLineKey") && bl.includes("（OFF の制度）") && col.includes('"sys_sales_rate"') && col.includes("salesBackTable: []"));
}

// ── (3) 制度・マスタ・ON/OFF・最終来店
{
  const on = { sys_sales_slide: true }, off = { sys_sales_slide: false, sys_point_slide: false };
  check("gvc(3-1) C-5 slidesTabOn＝売上スライド ∨（pt スライド ∧ pt）",
    slidesTabOn(on) && !slidesTabOn(off) && !pointSlideOn({ sys_point_slide: true, sys_points: false }) && pointSlideOn({ sys_point_slide: true, sys_points: true }) && salesSlideOn({}));
  check("gvc(3-2) C-9 ON/OFF の状態文字（2 値・3 値の既定）",
    onOffStateTextOf(true) === "ON・この店で使う" && onOffStateTextOf(false) === "OFF・この店では使わない" && onOffStateTextOf("inherit", true) === "既定に従う（いまは ON）");
  check("gvc(3-3) C-8 最終来店の相対日＝営業日（cutoff 06:00）・今日／n日前・未来は null",
    lastVisitRelOf("2026-10-19T03:00:00+09:00", "2026-10-18T23:00:00+09:00") === "今日" && lastVisitRelOf("2026-10-16T22:00:00+09:00", "2026-10-19T22:00:00+09:00") === "3日前"
    && lastVisitRelOf("2026-10-20T22:00:00+09:00", "2026-10-19T22:00:00+09:00") === null);
  check("gvc(3-4) C-7 マスタの説明は 1 行（data-hub-desc）", src("app/(manage)/master/master-board.tsx").includes('data-hub-desc="1"'));
}

// ── (4) 日報・再読込・領収書
{
  check("gvc(4-1) C-11 締め: 予定額 28px・差額 ¥± を予定額の横・4 欄 .nox-close4（2×2／≤899 は 1 列）・¥ 接頭の YenField・締め確定は btnPrimary56",
    rep.includes('data-close-expected="1"') && rep.includes('data-close-diff="1"') && rep.includes('className="nox-close4"') && rep.includes("function YenField(") && rep.includes('<span className="pre">¥</span>')
    && rep.includes('style={t.btnPrimary56} data-close-submit="1"') && rep.includes('data-close-rows="1" style={{ borderCollapse: "collapse", width: "100%", fontSize: 14') && css.includes(".nox-close4 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));") && /@media \(max-width: 899px\) \{ \.nox-close4 \{ grid-template-columns: 1fr; \} \}/.test(css));
  const lr = src("lib/nox/ui/use-live-reload.ts");
  check("gvc(4-2) C-12 useLiveReload（focus／visibility／60 秒・隠れている間は止める・重複抑止）をホーム・/shift・キャスト一覧に",
    lr.includes('window.addEventListener("focus"') && lr.includes('"visibilitychange"') && lr.includes("LIVE_RELOAD_INTERVAL_MS = 60_000") && lr.includes("inFlight")
    && dash.includes("useLiveReload(load)") && sb.includes("useLiveReload(load)") && cb.includes("useLiveReload(() => setLiveTick((n) => n + 1))") && cb.includes("}, [stores, liveTick]);"));
  check("gvc(4-3) C-13 台帳の各行: 再発行（取消済みにも）・公開ページ・印刷（共用 ReceiptPrintSheet）・再発行＝取消→同じ金額で receipt_issue",
    rcpt.includes('data-receipt-reissue="1"') && rcpt.includes('data-receipt-public="1"') && rcpt.includes('data-receipt-print-row="1"') && rcpt.includes("<ReceiptPrintSheet")
    && rcpt.includes('p_note: "再発行のため"') && rcpt.includes("p_amount: reTarget.amount") && rcpt.includes("nox-printpage") && reg.includes("<ReceiptPrintSheet items={rcptIssued}")
    && receiptReissueErrJa("bad amount").includes("取消してから") && receiptReissueErrJa("forbidden") === "権限がありません");
}

// ── (5) カレンダー・今日タブ・体入・新規プラン
{
  const st = (o: Parameters<typeof dayStateOf>[0]) => dayStateOf(o).key;
  check("gvc(5-1) C-14 日の状態 7 種（シフト優先・確定／確認待ち／審査中／休み希望／見送り／募集中／定休・期間外）",
    DAY_STATE_ORDER.length === 7
    && st({ wish: null, shift: { status: "confirmed", start_hm: "20:00", end_hm: "25:00" }, open: false }) === "fixed"
    && st({ wish: { status: "accepted" }, shift: { status: "proposed", start_hm: "20:00", end_hm: "25:00" }, open: true }) === "wait"
    && st({ wish: { status: "pending", kind: "work" }, shift: null, open: true }) === "pending"
    && st({ wish: { status: "pending", kind: "off" }, shift: null, open: true }) === "off"
    && st({ wish: { status: "rejected" }, shift: null, open: true }) === "rejected"
    && st({ wish: null, shift: null, open: true }) === "open" && st({ wish: null, shift: null, open: true, closed: true }) === "dim" && st({ wish: { status: "withdrawn" }, shift: null, open: false }) === "dim");
  check("gvc(5-2) C-14 凡例＝345 の語・休み希望のみ方式は「出られる日」・/mine は data-day-state＋凡例・/shift 月表示も同じ色（確定）",
    dayStateLabelOf("fixed") === "採用・確定" && dayStateLabelOf("wait") === "採用・確認待ち" && dayStateLabelOf("pending") === "審査中" && dayStateLabelOf("rejected") === "見送り"
    && dayStateLabelOf("open", "off_only").startsWith("出られる日") && wish.includes("data-day-state={ds.key}") && wish.includes('data-day-legend="1"') && wish.includes('supabase.from("shifts").select("date, start_hm, end_hm, status")')
    && sb.includes('data-day-state={list.length > 0 ? "fixed" : undefined}') && css.includes('[data-day-state="fixed"]'));
  check("gvc(5-3) C-14e 今日タブ（≥1280）: 5 択は潰さない（flex 0 0 auto・overflow visible）・出勤記録の列に最小幅・送り／退勤は右寄せで折り返す",
    /@media \(min-width: 1280px\) \{\s*\.nox-todaywrap td\.wide \{ min-width: 470px; \}/.test(css) && css.includes(".nox-todaywrap .nox-attrow > .nox-seg { flex: 0 0 auto; overflow: visible; }") && css.includes(".nox-todaywrap .nox-attrow { flex-wrap: wrap; row-gap: 6px; }"));
  const ts = trialSettingsOf({ trial_guarantee_days: 5, default_plan_id: "pid" });
  check("gvc(5-4) C-14f 体入: 店設定（日数 1〜90・既定 3）・体入タブ＝区分 体入 ∧ プランが体験入店／なし・保証期間・警告・残日数チップ",
    ts.days === 5 && ts.defaultPlanId === "pid" && trialSettingsOf({ trial_guarantee_days: 0 }).days === 3 && trialSettingsOf(null).defaultPlanId === null
    && isTrialCastOf({ is_active: true, kind: TRIAL_KIND }, TRIAL_PLAN_NAME) && isTrialCastOf({ is_active: true, kind: TRIAL_KIND }, null) && !isTrialCastOf({ is_active: true, kind: TRIAL_KIND }, "レギュラー") && !isTrialCastOf({ is_active: true, kind: "キャスト" }, TRIAL_PLAN_NAME)
    && JSON.stringify(trialGuaranteeRangeOf("2026-10-19", 3)) === JSON.stringify({ start: "2026-10-19", end: "2026-10-21" })
    && trialPlanWarnOf("キャスト", TRIAL_PLAN_NAME) !== null && trialPlanWarnOf(TRIAL_KIND, TRIAL_PLAN_NAME) === null && trialPlanWarnOf("キャスト", "レギュラー") === null
    && trialDaysLeftChipOf(2) === "保証 あと2日" && trialDaysLeftChipOf(0) === "保証 今日まで" && trialDaysLeftChipOf(null) === null);
  check("gvc(5-5) C-14f 画面: 体入を追加＝cast_create（区分 体入）→set_cast_plan（体験入店）→set_cast_guarantee・本採用＝set_cast_plan（既定プラン）・プラン切替の警告・直接登録の既定はレギュラー",
    cb.includes('supabase.rpc("cast_create", { ...args, p_kind: TRIAL_KIND })') && cb.includes('supabase.rpc("set_cast_plan", { p_cast_id: castId, p_plan_id: plan.id') && cb.includes('supabase.rpc("set_cast_guarantee", { p_cast_id: castId')
    && cb.includes("async function hireTrialCast(") && cb.includes('data-trial-hire="1"') && cb.includes("trialPlanWarnOf(selCast.kind,") && cb.includes('data-trial-days="1"') && cb.includes('useState<string>(fixedKind ?? "レギュラー")')
    && src("app/(manage)/casts/page.tsx").includes("joined_on, kind, employment"));
  const plan = buildSetupPlan as unknown;
  const tp = src("lib/nox/setup/template-plan.ts");
  check("gvc(5-6) C-14g 初期設定の新規プランも 30 引数（判定期間 月次・基準・ランク・目標・slide_apply・区分別 3 欄）",
    typeof plan === "function" && tp.includes("p_slide_period: SETUP_PLAN_SLIDE_PERIOD, p_slide_basis: \"sales\", p_slide_rank_ids: [],") && tp.includes("p_product_back_fixed_hon: null, p_product_back_fixed_jonai: null, p_product_back_fixed_free: null,")
    && tp.includes("p_norm_days_target: null, p_norm_dohan_target: null, p_norm_sales_target: null, p_norm_shimei_target: null, p_slide_apply: null") && tp.includes('SETUP_PLAN_SLIDE_PERIOD = "monthly"'));
}

// ── (6) autofocus・アカウント・payload
{
  // 顧客モーダルは検索欄（任意）だけを見る＝「新規登録」を押した後の名前欄（必須・押した直後に打つ欄）は autofocus のまま
  const cpm = src("components/nox/customer-pick-modal.tsx");
  check("gvc(6-0) C-14b 顧客モーダルの検索欄は autofocus なし", /aria-label="お客様を検索"(?![^>]*autoFocus)/.test(cpm) && cpm.includes("data-cust-search=\"1\""));
  const af = ["components/nox/okuri-out-dialog.tsx", "components/nox/payroll-attentions.tsx", "components/nox/punch-correction-modal.tsx"].filter((p) => /\bautoFocus\b/.test(src(p)));
  check("gvc(6-1) C-14b モーダルの autofocus 撤去（送り・給与の注意・打刻修正・日報の諸経費 focus）", af.length === 0 && !rep.includes("expenseRef.current?.focus()"), af.join(","));
  check("gvc(6-2) C-14h アカウント: 登録名の変更の注記はオーナーだけ・ポップオーバーは右寄せ・シートは body へ portal・/mine もアカウントの部品",
    hc.includes("isOwner &&") && hc.includes("{open && createPortal((") && hc.includes("), document.body)}") /* ★live: ヘッダーの backdrop-filter が fixed の基準になる＝body へ portal */ && src("app/(manage)/layout.tsx").includes('isOwner={role === "owner"}') && src("app/mine/layout.tsx").includes("UserChip"));
  const muse = JSON.parse(src("docs/demo/payload/muse.json")) as { tables: Record<string, Record<string, unknown>[]> } | Record<string, Record<string, unknown>[]>;
  const T = ((muse as { tables?: unknown }).tables ?? muse) as Record<string, Record<string, unknown>[]>;
  const outs = (T.staff_punches ?? []).filter((r) => r.kind === "out");
  check("gvc(6-3) payload MUSE: スタッフの退勤は同じ営業日の 02:00（$rel d・翌暦日は dateshift）・staff_pin 2 行（staff／manager）",
    outs.length === 14 && outs.every((r) => JSON.stringify((r.punched_at as { $rel: number }).$rel) === JSON.stringify((r.biz_date as { $rel: number }).$rel)) && (T.staff_pin ?? []).length === 2,
    `outs ${outs.length} pin ${(T.staff_pin ?? []).length}`);
}

if (fails.length) { console.log(`✗ verify:nox-gvc 失敗 ${fails.length}（成功 ${pass}）`); for (const x of fails) console.log(" - " + x); process.exit(1); }
console.log(`verify:nox-gvc OK (${pass} checks)`);
console.log("便 GV-C: 入金 1 欄・明細の集約・給与の自動プレビュー・制度 OFF・ON/OFF 部品・日報の締め・自動再読込・領収書台帳・日の状態 7 種・今日タブの表・体入の一括・新規プランの全引数");
