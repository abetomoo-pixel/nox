/*
 * verify:nox-gvb — 便 GV-B（2026-10-15）裁定372〜382（目視指摘 GV-23〜35）の係留（DB 不触・env 不要・逐語 pin＋純関数）。
 *   npm run verify:nox-gvb。
 *   (1) 裁定382 共通部品 responsive-kit（ResponsiveTable／FieldStack／SegmentTabs／InfoNote）と適用面・英字チップ廃止
 *   (2) 裁定372 横はみ出し 0（html overflow-x hidden・main min-width 0・<600 の表カード化）
 *   (3) 裁定373 ノルマ減額 1 方式（normPenaltyModeOf／normPenaltyOneOf・PenaltyTab のセグメント）
 *   (4) 裁定374 /casts 今期の時給・ノルマ達成状況・絞り込み・並び替え
 *   (5) 裁定375 会計 1 画面 1 ステップ（4 列・入金へ進む 56・キーパッド・③は残額 0 のときだけ）
 *   (6) 裁定376 領収書発行＝1 行 1 項目・発行 56・分割／閉じる 48
 *   (7) 裁定377 顧客選択の共通モーダル（4 タブ・検索最上部固定・3 入口＝ボトルキープ／チップ／伝票の顧客追加）
 *   (8) 裁定378 予約の来店処理＝卓タイル→種別 4 分割→キャスト→伝票を開く 56・check_set_nominations
 *   (9) 裁定380 シフト希望の 3 本道（希望どおり採用＝即確定／調整して確定／調整して送り返す）・shift_cast_confirm 廃止・キャスト別折りたたみ・一括・代行確定は proposed のみ
 *  (10) 裁定381 /staff スタッフ登録・保存 1 ボタン・tel: リンク・can_shift を効かせる（注記は撤去）
 */
import fs from "node:fs";
import { normPenaltyModeOf, normPenaltyOneOf, normPenaltyOf } from "../lib/nox/pay";
import { kanaRowOf, pickDefaultTabOf, customerPickTitleOf } from "../components/nox/customer-pick-modal";
let pass = 0; const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

const kit = src("components/ui/responsive-kit.tsx"); const css = src("app/globals.css");
const ff = src("app/(manage)/master/feature-flags-panel.tsx"); const tp = src("app/(manage)/master/time-pricing-panel.tsx"); const pb = src("app/(manage)/master/pricing/pricing-board.tsx");
const cs = src("app/(manage)/master/cast-comp/comp-sections.tsx"); const sb = src("app/(manage)/shift/shift-board.tsx"); const ph = src("components/ui/page-head.tsx");
const sn = src("app/(manage)/master/master-subnav.tsx"); const plb = src("app/(manage)/master/cast-comp/plan/plan-board.tsx");
// (1) 382
check("gvb(1-1) responsive-kit: ResponsiveTable（data-rtable・thead→td data-label）／FieldStack（.nox-fieldstack）／SegmentTabs（.nox-segtabs・role tablist）／InfoNote（.nox-infonote）",
  kit.includes('data-rtable="1"') && kit.includes("applyDataLabels") && kit.includes('className="nox-fieldstack"') && kit.includes('className="nox-segtabs"') && kit.includes('role="tablist"') && kit.includes('className="nox-infonote"'));
check("gvb(1-2) 適用＝機能の公開（ResponsiveTable＋FieldStack）・時間料金設定（FieldStack＋SegmentTabs）・料金適用ルール（ResponsiveTable）・ノルマ表／減額（ResponsiveTable＋SegmentTabs）・承認待ち（ResponsiveTable）・サブタブ／待遇プラン（.nox-segtabs）",
  ff.includes("<ResponsiveTable") && ff.includes("<FieldStack") && tp.includes("<FieldStack") && tp.includes("<SegmentTabs") && pb.includes("<ResponsiveTable") && cs.includes("<ResponsiveTable") && cs.includes("<SegmentTabs")
  && sb.includes("<ResponsiveTable>{/* ★裁定382") && sn.includes("nox-segtabs") && plb.includes("nox-segtabs"));
check("gvb(1-3) 英字チップ（eyebrow）は非表示＝page-head aria-hidden＋CSS display none", ph.includes("aria-hidden") && css.includes(".nox-pagehead .eyebrow { display: none; }"));
// (2) 372
check("gvb(2-1) 横はみ出し 0＝html／body overflow-x hidden・main min-width 0・<600 は .nox-rwrap の表をカード化（td[data-label]::before）・disabled は opacity .45",
  css.includes("html, body { overflow-x: hidden; }") && css.includes(".nox-mainarea, .nox-mainwrap, .nox-main { min-width: 0; }") && css.includes("td[data-label]::before") && css.includes("button:disabled, .nox-btn:disabled { opacity: .45; cursor: not-allowed; }"));
// (3) 373
check("gvb(3-1) normPenaltyModeOf＝per＞0 なら per・それ以外 flat／normPenaltyOneOf＝達成 0・per は不足×単価・flat は定額（golden normPenaltyOf 16,500 不変）",
  normPenaltyModeOf(3000, 0) === "flat" && normPenaltyModeOf(0, 500) === "per" && normPenaltyModeOf(3000, 500) === "per"
  && normPenaltyOneOf(3000, 0, 10, 10) === 0 && normPenaltyOneOf(3000, 0, 10, 7) === 3000 && normPenaltyOneOf(3000, 500, 10, 7) === 1500 && normPenaltyOneOf(3000, 500, 0, 0) === 0
  && normPenaltyOf({ on: true, daysFlat: 5000, daysPer: 0, dohanFlat: 0, dohanPer: 1500 }, { days: 10, dohan: 5 }, 8, 0) === 12500);
check("gvb(3-2) PenaltyTab＝軸ごとに「定額／不足 1 件ごと」のセグメント 1 つ＋金額 1 つ（data-penalty-axis／data-penalty-mode・両方入力の旧形は撤去）", cs.includes("data-penalty-axis") && cs.includes("data-penalty-mode") && cs.includes("normPenaltyModeOf") && cs.includes("<SegmentTabs"));
// (4) 374
const cb = src("app/(manage)/casts/casts-board.tsx"); const cw = src("lib/nox/cast/current-wage.ts");
check("gvb(4-1) /casts＝今期の時給（給与プレビュー＝/api/payroll/preview から読む・別計算なし）・ノルマ達成状況（cardAxesOf）・絞り込み（プラン／達成／時給の段）・並び替え", cb.includes('"/api/payroll/preview"') && cb.includes("currentWageOf(") && cb.includes("castNormStatusOf(") && cb.includes("data-w4-filters") && cb.includes("data-w4-wage") && cb.includes("data-w4-norm") && cb.includes("sortKey"));
check("gvb(4-2) current-wage.ts＝currentWageOf（wdays 最終日の hourly／basis・保証中・体験入店）・castNormStatusOf（none／done／progress／behind）・monthElapsedOf", cw.includes("export function currentWageOf(") && cw.includes("export function castNormStatusOf(") && cw.includes("export function monthElapsedOf(") && cw.includes('NORM_STATUS_LABEL: Record<NormStatus, string> = { none: "目標なし", done: "達成", progress: "進行中", behind: "未達" }'));
// (5) 375
const rb = src("app/(manage)/register/register-board.tsx");
check("gvb(5-1) 会計①＝伝票／請求（サ料込）／入金済／残額の 4 列（小計・割引の列なし）・「入金へ進む」主 56（data-pay-next）・「会計を分ける」副 48・残額 0 で非表示（!allCovered）",
  rb.includes('<th style={t.th} data-due-head="1">{check?.price_display === "tax_excluded"') /* ★便 SH-UI-c2 C2-12: 見出し＝税・サ込／サ込・内税 */ && !rb.includes("<th style={t.th}>小計</th>") && rb.includes('data-pay-next="1"') && rb.includes('data-pay-split="1"') && rb.includes('{!allCovered && (\n            <div data-pay-step="1"'));
check("gvb(5-2) 入金モーダル＝数字キーパッド（0〜9・00・⌫・C）・「入金する」主 56（data-pay-submit）・③「会計を完了」は allCovered のときだけ（主 56・← フロア 副 48）",
  rb.includes('data-pay-keypad="1"') && rb.includes('(["7", "8", "9", "4", "5", "6", "1", "2", "3", "00", "0", "⌫"] as const)') && rb.includes('style={t.btnPrimary56} data-pay-submit="1"') && rb.includes('{allCovered && (/* ★裁定375') && rb.includes('data-pay-close="1">会計を完了</button>'));
// (6) 376
check("gvb(6-1) 領収書発行＝入力 1 行 1 項目（金額／宛名／但し書き・幅 100%）・「発行」主 56・「分割して発行」「閉じる」副 48・説明は 1 文", rb.includes('data-rcpt-form="1"') && rb.includes('style={t.btnPrimary56} disabled={rcptBusy} onClick={() => void doIssue()} data-rcpt-issue="1">発行</button>') && rb.includes('style={t.btnSecondary48} disabled={rcptBusy} onClick={openSplit}>分割して発行</button>') && rb.includes("発行ごとに台帳へ記録され、発行番号と確認用 QR がつきます（残額 ") && !rb.includes("分割するときは金額を入れて複数回発行してください") && rb.includes('data-close-sheet="1"') && (rb.match(/>閉じる<\/button>/g) ?? []).length >= 1);
// (7) 377
const pm = src("components/nox/customer-pick-modal.tsx"); const cc = src("components/nox/check-customers-card.tsx"); const lk = src("components/nox/line-keep-button.tsx");
check("gvb(7-1) 共通モーダル＝4 タブ（この伝票のお客様／候補／全員／新規登録して選ぶ）・検索は最上部固定（data-cust-search）・50 音チップ・担当キャストチップ・50 件ずつ・mode line／add／select",
  pm.includes('check: "この伝票のお客様", cand: "候補", all: "全員", new: "新規登録して選ぶ"') && pm.includes("data-cust-search") && pm.includes("data-cust-tabs") && pm.includes("data-cust-kana") && pm.includes("data-cust-castchips") && pm.includes("PICK_PAGE = 50") && pm.includes('export type CustomerPickMode = "line" | "add" | "select"'));
check("gvb(7-2) 純関数＝kanaRowOf（あ段〜わ・他）・pickDefaultTabOf（伝票にいれば check→候補→全員）・customerPickTitleOf（モードと種別で見出し）",
  kanaRowOf("あおき") === "あ" && kanaRowOf("ばば") === "は" && kanaRowOf("パク") === "は" && kanaRowOf("Smith") === "他" && kanaRowOf("") === "他"
  && pickDefaultTabOf({ onCheck: 2, cand: 3 }) === "check" && pickDefaultTabOf({ onCheck: 0, cand: 3 }) === "cand" && pickDefaultTabOf({ onCheck: 0, cand: 0 }) === "all"
  && customerPickTitleOf(true, "line") === "このボトルのお客様を選ぶ" && customerPickTitleOf(false, "line") === "この注文のお客様を選ぶ" && customerPickTitleOf(false, "add") !== customerPickTitleOf(false, "line") && customerPickTitleOf(false, "select") !== customerPickTitleOf(false, "add"));
check("gvb(7-3) 3 入口＝伝票の顧客追加（カード「＋ お客様を追加」→mode add・旧インライン候補なし）・ボトルキープの持ち主（mode select・未付与なら併存で追加）・商品行チップ（register の custPick＝mode line 既定）",
  cc.includes('<CustomerPickModal storeId={storeId} checkId={checkId} mode="add"') && cc.includes('data-cust-add="1"') && !cc.includes("registerAndAdd") && lk.includes('<CustomerPickModal storeId={storeId} checkId={checkId} mode="select"') && lk.includes('data-keep-pick="1"') && lk.includes('rpc("check_customer_add", { p_check_id: checkId, p_customer_id: id })') && rb.includes("onNeedCustomer={() => setCustPick({"));
// (8) 378
const rp = src("app/(manage)/register/reservation-panel.tsx");
check("gvb(8-1) 予約の来店＝卓タイル（data-rsv-seats）→指名種別 4 分割（本指名／場内／同伴／フリー・「予約どおり」なし・初期値は予約の nom_type）→キャスト（同伴は相手・フリーは非表示）→「伝票を開く」主 56・reservation_to_check の戻り id で check_set_nominations（1 件・dohan は hon＋is_dohan）",
  rp.includes('data-rsv-visit="1"') && rp.includes('data-rsv-seats="1"') && rp.includes('options={[["hon", "本指名"], ["jonai", "場内"], ["dohan", "同伴"], ["free", "フリー"]] as const}') && !rp.includes('"予約どおり"') && !rp.includes(">予約どおり<") && rp.includes('setVNom(r.nom_type ?? "free"); setVCast(r.cast_id ?? "");')
  && rp.includes('data-rsv-open="1">伝票を開く</button>') && rp.includes('supabase.rpc("check_set_nominations", { p_check_id: checkId, p_nominations: [{ cast_id: vCast, weight: 1, nom_kind: vNom === "dohan" ? "hon" : vNom, is_dohan: vNom === "dohan"') && rp.includes('const { data: checkId, error } = await supabase.rpc("reservation_to_check"'));
// (9) 380
const spp = src("app/(manage)/master/store-profile-panel.tsx"); const mw = src("app/mine/wishes/page.tsx"); const mp = src("app/mine/page.tsx");
check("gvb(9-1) 3 本道＝希望どおり採用（decide→shift_confirm_bulk 即確定・店設定に依らない）・「調整」→希望の調整モーダル（調整して確定＝shift_set confirmed／調整して送り返す＝planned→shift_propose）",
  sb.includes("const castConfirm = true; // ★裁定380") && sb.includes('if (!error && accept && typeof sid === "string") { // ★裁定380') && sb.includes("async function adjustWish(sendBack: boolean) {") && sb.includes('p_start_hm: st, p_end_hm: en, p_status: sendBack ? "planned" : "confirmed" });') && sb.includes('data-wish-adjust-btn="1"') && sb.includes('data-wish-confirm="1" onClick={() => void adjustWish(false)}>調整して確定</button>') && sb.includes('data-wish-sendback="1" onClick={() => void adjustWish(true)}>調整して送り返す</button>'));
check("gvb(9-2) planned／proposed の調整モーダル＝「調整して確定」主／「調整して送り返す」副（confirmed は従来の保存）・planned 行は 調整／送り返す（代行確定なし）・一括＝「希望どおり一括採用」（採用→62 件ずつ confirm）・代行確定の一括は proposed のみ",
  sb.includes('async function adjustShift(next: "keep" | "confirm" | "sendback" = "keep")') && sb.includes('data-adj-confirm="1"') && sb.includes('data-adj-sendback="1"') && sb.includes('{adjTarget.status === "confirmed" ? (') && sb.includes('onClick={() => void proposeShifts([r.shift!.id])}>送り返す</button>')
  && sb.includes('data-wish-bulk="1"') && sb.includes("希望どおり一括採用（{ids.length}件）") && sb.includes("const chunk of chunkOf(sids, 62)") && sb.includes("onClick={() => void confirmBulkShifts([...planned, ...proposed].map((x) => x.id))}") /* ★便 M-12 ②: 一括の確定は確認待ち（管理者確認／キャスト確認）の両方 */);
check("gvb(9-3) 承認待ちの既定＝キャスト別（折りたたみ data-queue-cast・aria-expanded）・3 段（審査中／採用・確認待ち（調整中・送り返し）／採用・確定）・店設定トグル shift_cast_confirm は UI から撤去（自動確定時間は非活性＝0172）・/mine は常に「キャスト確認待ち」",
  sb.includes('useState<"date" | "cast">("cast")') && sb.includes("data-queue-cast={r.castId} aria-expanded={!collapsed}") && sb.includes("const collapsed = queueGroup === \"cast\" && qClosed.has(r.castId);") && sb.includes('["2", `${WISH_STATE_LABEL.accepted_wait}（調整中 ${planned.length}・送り返し ${proposed.length}）`, waiting]') /* ★便 SH-UI-c2 C2-17: waiting＝planned+proposed */
  && !spp.includes('flagKey="shift_cast_confirm"') && spp.includes('data-shift-ops="1"') && spp.includes('data-shift-auto-confirm="1"') /* ★0172（便 P172）: 準備中→活性 */ && mw.includes("const castConfirm = true; // ★裁定380") && fs.readFileSync("app/mine/schedule-card.tsx", "utf8").includes('x.proposed ? "確認待ち（あなた）" : "確認待ち"') /* ★便 X13-G W-22: /mine は「出勤予定」（確定／確認待ち）に置換 */);
// (10) 381
const st = src("app/(manage)/staff/staff-board.tsx"); const sp = src("app/(manage)/shift/page.tsx"); const lay = src("app/(manage)/layout.tsx"); const cbd = src("app/(manage)/customers/customers-board.tsx"); const cd = src("app/(manage)/customers/[id]/customer-detail.tsx");
check("gvb(10-1) /staff＝「＋ スタッフ登録」→名前必須・メール任意（入力時だけログイン ID）・電話・LINE ID・配属店・役職・契約区分（セグメント）・「登録する」主 56・写真は登録後（注記）・器なし 3 項目は 0172 の注記",
  st.includes('data-staff-add="1">＋ スタッフ登録</button>') && st.includes("<h2 style={secTitle}>スタッフ登録</h2>") && st.includes('data-staff-tel="1"') && st.includes('data-staff-line="1"') && !st.includes('ariaLabel="契約区分"') /* ★便 X13-H H-12: 保存しない契約区分の入力は撤去（契約の保存は 0176） */ && st.includes('data-staff-after="1"') && st.includes('data-staff-register="1"') && st.includes("電話番号・LINE ID は登録時に保存されます。</p>")); // ★0172（便 P172）: 注記の張替え
check("gvb(10-2) 編集シート＝名前／メール（owner）を縦積み・「保存」1 ボタン（変わった項目だけ送る＝staff_update_profile／update-email）・旧「名前を更新」「メールを更新」なし", st.includes('data-staff-edit="1"') && st.includes('data-staff-save="1"') && st.includes("async function saveEdit() {") && !st.includes(">名前を更新</button>") && !st.includes(">メールを更新</button>"));
check("gvb(10-3) 電話番号は tel: リンク（TelLink／telHrefOf・顧客一覧の詳細・顧客詳細）", kit.includes("export function telHrefOf(") && kit.includes('data-tel-link="1"') && cbd.includes('<TelLink key="tel" tel={dCust?.tel} />') && cd.includes("<TelLink tel={cust.tel} />"));
check("gvb(10-4) can_shift を効かせる＝/shift は staff かつ auth_staff_can_shift≠true で /dashboard へ・nav のシフトは isManagerUp || staffShift・「将来リリース」注記は撤去",
  sp.includes('const { data: canShift } = await supabase.rpc("auth_staff_can_shift");') && sp.includes('if (canShift !== true) redirect("/dashboard");') && lay.includes('supabase.rpc("auth_staff_can_shift")') && lay.includes('...(isManagerUp || staffShift ? [{ href: "/shift", label: "シフト" }] : [])') && !st.includes("シフト権限のシフト管理画面への適用は将来リリース"));

if (fails.length) { console.error(`✗ verify:nox-gvb 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-gvb OK (${pass} checks)`);
