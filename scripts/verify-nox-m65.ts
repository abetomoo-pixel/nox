/*
 * verify:nox-m65 — 便 A（2026-11-04・client のみ・DB 不触）＝M-65（シフトの不可・相談の 4 段）／M-66（基本の働き方のボタン中央）／M-67（TimePicker／DatePicker・勤怠の修正モーダル）／
 *  M-68（スタッフの日計に「時給分」列・実打刻は 1 行）／M-69（初期設定 v5 の小 3 点）／M-71（③ 端数の丸め＝新しい店の既定 1,000 円・切り捨て）／M-72（③ 延長の付け方＝必須）／
 *  M-74（控除一覧の単位・¥）／M-75（日タブの追加配置＝選択中の日）／M-76（期間の必要人数＝店の既定＋ステッパー）＋教訓133（操作ボタンは中央・日付／時刻は共通ピッカー）。
 *  使い方: npm run verify:nox-m65（env 不要・DB 不触）
 */
import fs from "node:fs";
import { dayCastStateOf, availNgConfirmOf, DAY_CAST_STATE_LABEL } from "../lib/nox/shift/half-hour";
import { buildV5Plan, v5DefaultState, applyType, v5Checks, v5RoundUnitOf, v5RoundModeOf, v5TimeModeOf, roundUnitErrorOf, ROUND_MODE_LABEL, TIME_MODE_LABEL, type V5Ctx } from "../lib/nox/setup/v5";
import { MINE_SETTINGS_DEFAULT } from "../lib/nox/store/mine-settings";
import { DED_PER_JA } from "../app/(manage)/master/cast-comp/comp-sections";
import { dateLabelOf } from "../components/ui/date-picker";
import { BANK_ACCOUNT_TYPE_OPTS, monthShiftOf, payAmountKeyOf, payKindOptsOf } from "../lib/nox/staff/work"; // ★M-80

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const code = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s\/\/.*$/, "")).join("\n");
const J = JSON.stringify;

// ── M-65
const W = (kind?: string) => [{ start_hm: "20:00", end_hm: "25:00", ...(kind ? { kind } : {}) }];
check("m65(1-1) 4 段の判定＝希望＞基本の働き方（休み希望→不可 wish_off・希望あり→wish・曜日 ng→不可 avail_ng・ask→相談・それ以外→なし）・確認文",
  dayCastStateOf(W("off"), "ok").state === "unavailable" && dayCastStateOf(W("off"), "ok").why === "wish_off" && dayCastStateOf(W(), "ng").state === "wish" && dayCastStateOf([], "ng").why === "avail_ng"
  && dayCastStateOf([], "ask").state === "consult" && dayCastStateOf([], "ok").state === "none" && dayCastStateOf([], null).state === "none" && DAY_CAST_STATE_LABEL.consult === "相談" && availNgConfirmOf("月") === "月曜は不可の設定です。追加しますか");
const dap = src("app/(manage)/shift/day-add-panel.tsx"), saf = src("app/(manage)/shift/shift-add-form.tsx"), sb = src("app/(manage)/shift/shift-board.tsx");
check("m65(1-2) (a) 割当ピッカー＝dayCastStateOf（availByCast のその曜日）・不可の人も選べる＝不可（休み希望・曜日が不可）は「それでも追加」＝理由必須（★M-91: 確認ダイアログは撤去）・相談＝黄・並び 希望→なし→相談→不可",
  dap.includes("dayCastStateOf(dayWishes.filter((w) => w.cast_id === id), availByCast[id]?.[dow] ?? null)") && !dap.includes("window.confirm(availNgConfirmOf")
  && dap.includes('needReason: st.why === "wish_off" || st.why === "avail_ng"') && dap.includes("consult: { color: \"var(--gold2)\"") && dap.includes("{ wish: 0, none: 1, consult: 2, unavailable: 3 }"));
check("m65(1-3) (b) まとめて追加＝同じ判定（judgeOf）・日セルに赤「不可」（＋不足数）／黄「相談」・登録済みは緑のまま小さく「不可の曜日」・一括 2 つは不可の曜日を飛ばす・(c) 下段のボタンは中央",
  saf.includes("const judgeOf = (ymd: string) => { const w = wishOf(ymd); return dayCastStateOf(") && saf.includes('data-day-avail-mark="ng"') && saf.includes('data-day-avail-mark="ask"') && saf.includes('data-day-avail-mark="ng-has"')
  && saf.split("if (availNgOf(ymd)").length === 3 && saf.includes('className="nox-bulkadd-btns nox-actions"') && !saf.includes('style={{ marginLeft: "auto", display: "inline-flex", gap: 9 }}'));
check("m65(1-4) 配線＝shift-board が availability（membership か cast_id）を cast_id に写して DayAddPanel（日タブ）と ShiftAddForm に渡す",
  sb.includes('supabase.from("availability").select("membership_id, cast_id, dow, avail, from_min, to_min").eq("store_id", storeId)') /* ★M-91: +時刻 */ && sb.includes("availByCast={availByCast}") && sb.split("availByCast={availByCast}").length === 3);
// ── M-66
check("m66(2-1) 基本の働き方の キャンセル／保存＝中央（.nox-actions の既定・flex-end なし）", src("components/nox/availability-editor.tsx").includes('<div className="nox-actions" data-avail-actions="1">') && !src("components/nox/availability-editor.tsx").includes('justifyContent: "flex-end"'));
// ── M-67
const ke = src("components/nox/kintai-edit.tsx"), swp = src("app/(manage)/staff/staff-work-panel.tsx"), dp = src("components/ui/date-picker.tsx");
check("m67(3-1) 共通部品＝DatePicker（月送り・定休日は薄く・min／max・今日の印・ネイティブ date なし）・TimePicker＝TimeInput の再エクスポート・日付の表示",
  dp.includes('data-date-picker={testId ?? "1"}') && dp.includes('aria-label="前の月"') && dp.includes("closedDows") && !dp.includes('type="date"') && src("components/ui/time-picker.tsx").includes('export { default } from "./time-input";') && dateLabelOf("2026-11-08") === "2026/11/8（日）");
check("m67(3-2) キャストの勤怠の修正モーダル＝DatePicker（日付）・TimePicker（出／退＝after で翌）・区分はボタン群・26:00 の手打ち（hm47OfInput）は廃止・保存する／やめる／取消… は中央",
  ke.includes('<DatePicker value={date} min={periodStart} max={todayBiz < periodEnd ? todayBiz : periodEnd}') && ke.includes("<TimePicker value={outTxt} onChange={setOutTxt} step={15} maxHour={47} after={inTxt || null}") && ke.includes('<SegSelect value={status} onChange={setStatus} options={ATT_STATUS_OPTIONS}')
  && !code(ke).includes("hm47OfInput") && !code(ke).includes('type="date"') && !code(ke).includes("<select") && ke.includes('<div className="nox-actions" data-kintai-actions="1">') && !ke.includes('marginLeft: "auto"'));
check("m67(3-3) スタッフの日の修正＝下部埋め込みをやめてモーダル（営業日 DatePicker・出勤／退勤 TimePicker・区分ボタン群・キャンセル／保存は中央）・「＋ 日を追加・修正」も同じモーダル（営業日が空）",
  swp.includes("<Modal onClose={() => { if (!attBusy) setDayEdit(null); }} maxWidth={460} scroll>") && swp.includes('testId="staff-day-date"') && swp.includes('<label style={{ display: "grid", gap: 3 }} data-staff-day-out="1">') && swp.includes("isStaffDayStatus(v) ? v : \"\"")
  && swp.includes('<div className="nox-actions" data-staff-day-actions="1">') && !code(swp).includes('type="date"') && !code(swp).includes("<select value={dayEdit.status}"));
// ── M-68
const kr = src("components/nox/kintai-row.tsx");
check("m68(4-1) スタッフの日計に「時給分」列（KintaiHead wageOnly／KintaiRow wageCell＝時給×その日の実働・月給／日給と勤務中は —）・合計は列の合計のまま・「実打刻」は nowrap",
  kr.includes("wageOnly?: boolean") && kr.includes('data-kintai-pay-head="時給分"') && kr.includes('{wageCell === null || r.working ? "—" : yenCellOf(wageCell)}') && kr.includes('data-kintai-basis={r.basis}>{BASIS_MARK[r.basis]}') && kr.includes("marginLeft: 4, whiteSpace: \"nowrap\" }} data-kintai-basis")
  && swp.includes("<KintaiHead withPay={false} wageOnly={hourly} />") && swp.includes("wageCell={hourly ? staffDayPayOf(c, d) : undefined}") && swp.includes("日計の合計（時給分）"));
// ── M-69
const sw = src("app/(manage)/setup/setup-wizard.tsx");
check("m69(5-1) ① 自動確定の欄は 3 桁の幅（希望の締切と同じ 90）② 曜日別の必要人数に単位「人」（UnitInput・定休日は 0 で無効）③ 区分ごとの場内／フリーは ¥ の接頭辞・本指名と同じ幅 104・「（円）」なし",
  sw.includes('unit="時間後" integer min={0} max={168} onChange={(n) => up((s) => { s.shift.auto = n; })} width={90} />') /* ★2026-11-13 夜（相談役■2 d）: 整数と範囲 */ && sw.includes('unit="日前" onChange={(n) => up((s) => { s.shift.due = n; })} width={90} />') && sw.includes('unit="人" width="100%" ariaLabel={`${w}の必要人数`}')
  && sw.includes('pre={it.bt !== "pct"} unit={it.bt === "pct" ? "%" : undefined} onChange={(n) => up((s) => { s.menu[ci].items[ii].bj = n; })} width={104}') && sw.includes('↳ 場内指名／フリーのとき{it.bt === "pct" ? "（%）" : ""}'));
// ── M-71／M-72
const ctx: V5Ctx = { storeId: "11111111-1111-4111-8111-111111111111", current: { round_unit: 100, round_mode: "up", time_mode: "manual", time_per: "person", receipt: { address: "", tel: "", reg_no: "", footer: "" }, mine: { ...MINE_SETTINGS_DEFAULT }, tax: { business_tax_status: "taxable", price_display: "tax_excluded", invoice_status: "unregistered", invoice_reg_no: "", tax_rounding: "floor", card_surcharge_rate: 0 } } as unknown as V5Ctx["current"], deviceIdemKey: "22222222-2222-4222-8222-222222222222", staffIdemKeys: [] };
const S = applyType(v5DefaultState("2026-11-04"), "cabaret");
const pricingOf = (s: typeof S, c: V5Ctx) => buildV5Plan(s, c).steps.find((x) => x.key === "pricing")!.args as { p_round_unit: number; p_round_mode: string };
const timeOf = (s: typeof S, c: V5Ctx) => buildV5Plan(s, c).steps.find((x) => x.key === "time_pricing")!.args as { p_time_mode: string };
check("m71(6-1) 端数の丸め＝新しい店の既定 1,000 円・切り捨て（setupDone false）・既存店は今の値・その他の単位は 1〜10,000・③ に節（data-setup-round）・⑨ 確認に「端数」",
  S.roundUnit === 1000 && S.roundMode === "down" && pricingOf(S, { ...ctx, setupDone: false }).p_round_unit === 1000 && pricingOf(S, { ...ctx, setupDone: false }).p_round_mode === "down" && pricingOf(S, { ...ctx, setupDone: true }).p_round_unit === 100 && pricingOf(S, { ...ctx, setupDone: true }).p_round_mode === "up"
  && v5RoundUnitOf({ ...S, roundUnit: 20000 }, { ...ctx, setupDone: false }) === 100 && roundUnitErrorOf(0) !== null && roundUnitErrorOf(500) === null && v5RoundModeOf({ ...S, roundMode: "round" }, { ...ctx, setupDone: false }) === "round"
  && sw.includes("data-setup-round={`${S.roundUnit}:${S.roundMode}`}") && sw.includes('["端数", `${yen(S.roundUnit)} 円単位・${ROUND_MODE_LABEL[S.roundMode]}`]') && ROUND_MODE_LABEL.down === "切り捨て");
check("m72(7-1) 延長の付け方＝必須の 2 択（既定なし・未選択は ③ の「次へ」が押せない・要確認に出る）・保存先 time_mode（選んだときだけ v5 の値）・各 1 行の説明・⑨ 確認に「延長」",
  S.timeMode === null && v5Checks(S).some(([i, w]) => i === 2 && /延長の付け方/.test(w)) && !v5Checks({ ...S, timeMode: "auto" }).some(([, w]) => /延長の付け方/.test(w))
  && v5TimeModeOf(S, ctx) === "manual" && timeOf({ ...S, timeMode: "auto" }, ctx).p_time_mode === "auto" && TIME_MODE_LABEL.auto === "自動"
  && sw.includes("disabled={(S.step === 0 && !type) || (S.step === 2 && !S.timeMode)}") && sw.includes('data-setup-time-mode={S.timeMode ?? "none"}') && sw.includes("自動＝時計が延長を決めます") && sw.includes("手動＝お客様に確認してから") && sw.includes('["延長", S.timeMode ? TIME_MODE_LABEL[S.timeMode] : "未選択"]'));
// ── M-74
check("m74(8-1) 控除ルール一覧＝単位を日本語（日ごと／月ごと／売上の%）・額に ¥ と桁区切り（売上の% は %）", J(DED_PER_JA) === J({ day: "日ごと", month: "月ごと", rate: "売上の%", pay_rate: "報酬の%" }) /* ★0195（M-73）: pay_rate */ && src("app/(manage)/master/cast-comp/comp-sections.tsx").includes("<td data-ded-unit={d.per}>{mig0195On() ? dedUnitLabelOf(d.per, d.day_rule) : (DED_PER_JA[d.per] ?? d.per)}</td>") /* ★0195: 日ごとは既定も */ && src("app/(manage)/master/cast-comp/comp-sections.tsx").includes("`¥${Number(d.amount).toLocaleString(\"en-US\")}`"));
// ── M-75
check("m75(9-1) 日タブの追加配置＝対象は選択中の日（todayDate）・ラベル「＋ 当日追加配置」／「＋ 11/8 に追加配置」・題名と説明も選択日・定休日（特別営業日でない／臨時休業）はボタンを出さず 1 行・追加後は選択日の表に即反映",
  sb.includes("isClosedForAdd(todayDate)") && sb.includes('data-today-add-closed={todayDate}>定休日（特別営業日にすると配置できます）</span>') && sb.includes('todayDate === bizToday ? "＋ 当日追加配置" : `＋ ${Number(todayDate.slice(5, 7))}/${Number(todayDate.slice(8, 10))} に追加配置`')
  && sb.includes("data-today-add-head={todayDate}") && sb.includes("保存すると確定のシフトになり、その日のタブに出ます。") && sb.includes("<DayAddPanel date={todayDate}") && sb.includes('const isClosedForAdd = (ymd: string) => specialOf(ymd) === "closed" || (isClosedDay(ymd) && specialOf(ymd) !== "open");')
  && sb.includes('supabase.from("store_special_days").select("day, kind")'));
// ── M-76
check("m76(10-1) 期間の必要人数＝店の曜日別の既定を初期表示（定休日は「定休」・入力不可）・−／＋のステッパー＋「名」・既定から変えた曜日だけ保存（既定に戻せば空）・「店の既定に戻す」・説明文・追加行は曜日ボタン群と TimePicker（ネイティブ select なし）",
  sb.includes("const storeNeedOf = (dow: number): number => (closedDows.has(dow) ? 0 : needs.filter((n) => n.dow === dow).reduce((m, n) => Math.max(m, n.required), 0));") && sb.includes('data-period-need-closed="1"') && sb.includes("data-period-need-value={cur}")
  && sb.includes("(v === def ? \"\" : String(Math.max(0, Math.min(99, v))))") && sb.includes('data-period-needs-reset="1"') && sb.includes("店の既定を表示しています。この期間だけ変える曜日を直してください。")
  && sb.includes('<DowChips mode="single" name="need-band" ariaLabel="曜日" labels={DOW} selected={(d) => d === nDow}') /* ★M-144 ④: 曜日はボタン群のまま共通部品へ（定休日は選べない） */ && sb.includes("<TimeInput value={nFrom} onChange={setNFrom} step={30} maxHour={47}") && !sb.includes("<select value={nDow}") && !sb.includes('data-band-from="1"'));

// ── M-79（不具合）: /staff の「＋ スタッフを追加」＝管理者と店長に出す・デモはボタンを出して押すと注記（入力はさせない）
const sbd = src("app/(manage)/staff/staff-board.tsx");
check("m79(11-1) 「＋ スタッフを追加」は isDemo で隠さない（デモは押すと注記・本番は openAdd＝staff_create→招待）・原因＝N7-2 ③の隠し（8a0e997 は無関係）",
  sbd.includes("<AddButton testId=\"staff-add\" onClick={() => { if (isDemo) { setMsg(STAFF_ADD_DEMO_NOTE); return; } openAdd(); }} disabled={busy}>") && !sbd.includes("{!isDemo && <AddButton testId=\"staff-add\"") && sbd.includes("export const STAFF_ADD_DEMO_NOTE = \"デモ環境ではスタッフを追加できません"));

// ── M-80: /staff の編集モーダルに「働き方」（共通部品 StaffWorkSection＝staff_contract_set／set_withholding_kind／payroll_employee_deductions_set＝給与側と同じ保存先）・契約未登録は「働き方を登録」・登録モーダル 4 の文言・保存／異動は中央＝配属店はボタン群
const sws = src("components/nox/staff-work-section.tsx"), spg = src("app/(manage)/staff/page.tsx"), swk = src("app/(manage)/staff/staff-work-panel.tsx"), s93 = src("components/nox/staff-0193.tsx"), stp = src("app/(manage)/master/sensitive-tax-panel.tsx");
check("m80(12-1) 働き方の節＝雇用形態／給与の形（委託は 日給／月額固定・雇用は 時給／月給＝staff_contract_set の検査と同じ）／額／固定手当（時給制・fixed_allowance 1 本）／源泉区分（既定は雇用形態から・ボタン群）／控除（manual の月ごと＝Withholding432Panel）",
  J(payKindOptsOf("contractor")) === J([["daily", "日給"], ["monthly_fixed", "月額固定"]]) && J(payKindOptsOf("employee")) === J([["hourly", "時給"], ["monthly", "月給"]]) && payAmountKeyOf("monthly_fixed") === "monthly" && payAmountKeyOf("daily") === "daily" && payAmountKeyOf("hourly") === "hourly" && monthShiftOf("2026-12", 1) === "2027-01" && monthShiftOf("2026-01", -1) === "2025-12"
  && sws.includes('supabase.rpc("staff_contract_set", { p_membership_id: memId, p_patch: patch })') && sws.includes('fixed_allowance: form.pay_kind === "hourly" ? f : 0') && sws.includes('supabase.rpc("set_withholding_kind", { p_subject_kind: "staff", p_subject_id: memId, p_kind: v === "" ? null : v })')
  && sws.includes('<Withholding432Panel key={`${memId}-${period}-${ded.length}`} period={period} subjectKind="staff" subjectId={memId} kind="manual"') && sws.includes('data-staff-work-edit={contract ? "edit" : "register"}') && sws.includes('{contract ? "働き方を変更" : "働き方を登録"}') && sws.includes('<div className="nox-actions" data-staff-work-actions="1">')
  && sws.includes('<SegSelect value={contract.withholding_kind ?? ""} onChange={(v) => void setKind(v)} options={kindOpts} ariaLabel="源泉区分"') && sws.includes('data-staff-edit-ded-month="1"'));
check("m80(12-2) /staff＝一覧の契約チップ（押すと編集モーダルの「働き方」を開いた状態）・編集モーダルに StaffWorkSection（店長は自店の staff だけ編集）・staff_contracts を一覧で読む（RLS）",
  sbd.includes('<ContractChip dataKey="data-staff-contract-chip" dataSet={contracts[m.id] ? "set" : "none"}') && sbd.includes("onClick={(e) => { e.stopPropagation(); openEdit(m, true); }} text={contracts[m.id] ? staffContractLineOf(contracts[m.id]) : \"働き方を登録\"} />") /* ★便 D M-99: 共通の契約チップ */
  && sbd.includes("function openEdit(m: Mem, work = false) {") && sbd.includes("<StaffWorkSection key={`${sel.id}-${eWorkOpen ? \"w\" : \"c\"}`} memId={sel.id} contract={contracts[sel.id] ?? null} initialOpen={eWorkOpen}") && sbd.includes('canEdit={isOwner || (sel.role === "staff" && sel.store_id === myStoreId)}')
  && sbd.includes('supabase.from("staff_contracts").select(mig0183On() ? "membership_id, contract_kind, pay_kind, hourly, monthly, daily, fixed_allowance, tax_class, withholding_kind" :'));
check("m80(12-3) 登録モーダル 4 の文言「契約：スタッフの編集か 給与 › 勤怠（スタッフ）で変更」・/staff の案内文「勤怠は 給与 › 勤怠（スタッフ）で見ます。働き方（雇用形態・給与）は行を押して編集します」（リンクは残す）",
  sbd.includes("<b style={{ color: \"var(--v2-text)\" }}>契約</b>：スタッフの編集か 給与 › 勤怠（スタッフ）で変更。</li>") && !sbd.includes("「勤怠・報酬」タブで区分・時給（月給）と支給見込み")
  && spg.includes("で見ます。働き方（雇用形態・給与）は行を押して編集します。</p>") && spg.includes("<Link href={STAFF_WORK_HREF}") && !spg.includes("（出勤・退勤の修正と月の確定もそこで）"));
check("m80(12-4) 編集モーダル＝保存は中央（.nox-actions）・配属店（異動先）は select ではなくボタン群（SegSelect）・異動を実行も中央・脚（在籍を解除／役職）は .nox-formmodal-foot（裁定244＝中央）",
  sbd.includes('<div className="nox-actions" data-staff-edit-actions="1"') && !sbd.includes("style={t.btnPrimary56} disabled={busy} data-staff-save=\"1\"") && sbd.includes('<SegSelect value={eStore} onChange={setEStore} options={stores.filter((s) => s.id !== sel.store_id).map((s) => [s.id, s.name] as const)} ariaLabel="異動先" wrap />')
  && !sbd.includes("<select value={eStore}") && sbd.includes('<div className="nox-actions"><button style={btnGhost} disabled={busy || !eStore}') && /\.nox-formmodal-foot \{[^}]*justify-content: center/.test(src("app/globals.css")));
check("m80(12-5) 給与 › 勤怠（スタッフ）＝契約未登録の行も押せて「働き方を登録」（源泉区分・控除は契約がある人だけ）・契約未登録の表示は不変（x13h）",
  swk.includes('scope === "store" ? () => setOpenMem((v) => (v === r.m.id ? null : r.m.id)) : undefined') && swk.includes('{openMem === r.m.id && scope === "store" && (') && swk.includes("{r.kind && r.pay && (<>") && swk.includes('data-staff-contract-edit="1">{r.contract ? "働き方を変更" : "働き方を登録"}</button>') && swk.includes("<span style={t.sub}>契約未登録</span>"));
check("m80(12-6) 追記③＝Staff0193 のボタンは全部中央（肩書の保存は入力欄の下・役割・表示する・個人情報を保存）・種別は 普通／当座／貯蓄 のボタン群・生年月日は DatePicker・キャスト側（sensitive-tax-panel）も同じ＝justifySelf start なし・type=date なし",
  J(BANK_ACCOUNT_TYPE_OPTS) === J([["ordinary", "普通"], ["checking", "当座"], ["savings", "貯蓄"]]) && s93.includes('<span className="nox-actions" data-staff-title-actions="1"><button type="button" style={{ ...t.btnGhost, ...t.btnSm }} disabled={busy} data-staff-title-save="1"') && !s93.includes('justifySelf: "start"')
  && (s93.match(/className="nox-actions"/g) ?? []).length === 4 && s93.includes('<DatePicker value={sens[k]} onChange={(v) => setSens({ ...sens, [k]: v })} ariaLabel="生年月日"') && s93.includes('<SegSelect value={sens[k]} onChange={(v) => setSens({ ...sens, [k]: v })} options={BANK_TYPE_OPTS} ariaLabel="口座の種別" />') && !s93.includes("生年月日（YYYY-MM-DD）") && !s93.includes("種別（ordinary／checking／savings）")
  && stp.includes('<DatePicker value={birthday} onChange={setBirthday} ariaLabel="生年月日" width="100%" testId="cast-birthday" />') && stp.includes('<SegSelect value={ext.bank_account_type} onChange={(v) => setExt({ ...ext, bank_account_type: v })} options={[["", "—"], ...Object.entries(BANK_TYPE_LABEL).map(([k, v]) => [k, v] as const)]} ariaLabel="口座の種別" />') && !stp.includes('type="date" value={birthday}') && !stp.includes('<select value={ext.bank_account_type}'));
// ── M-66（差し替え）: 洗い出した左右振り分けのうち操作ボタン（フォーム／モーダル／パネル）を中央に＝請求書プロフィールの保存・レシート印刷カードの閉じる・スタッフシフトの一括確定・キャスト別追加の出勤不可にする／不可を解除
check("m66(13-1) 操作ボタンの右寄せを中央に（invoice-profile-fields の保存／register-board の印刷カード 閉じる／staff-shift-manage の一括確定／shift-add-form の出勤不可にする・不可を解除）",
  !src("components/nox/invoice-profile-fields.tsx").includes('className="nox-actions" style={{ justifyContent: "flex-end"') && src("app/(manage)/register/register-board.tsx").includes('<div className="nox-actions" data-print-card-actions="1"') && !src("app/(manage)/register/register-board.tsx").includes('<button style={{ ...btnLight, marginLeft: "auto" }} onClick={() => setPrintCard(null)}>閉じる</button>')
  && src("app/(manage)/shift/staff-shift-manage.tsx").includes('<div className="nox-actions" data-staff-shift-confirm-actions="1"') && !src("app/(manage)/shift/staff-shift-manage.tsx").includes('<button style={{ ...btnDark, marginLeft: "auto" }} disabled={busy} onClick={() => void confirmDay(selDay)}>')
  && (src("app/(manage)/shift/shift-add-form.tsx").match(/<span className="nox-actions" style=\{\{ width: "100%" \}\}>/g) ?? []).length === 2 && !src("app/(manage)/shift/shift-add-form.tsx").includes('<button style={{ ...btnLight, marginLeft: "auto" }} onClick={() => setUnavailTarget(focusDay)}'));

// ── M-81（不具合）: スマホ幅でモーダルが最上部まで届く＝共通 Modal 1 か所（常に overflow auto・CSS の高さ上限 100dvh）・ヘッダ／脚は sticky・スタッフ登録モーダルは head（×）と foot（登録する／キャンセル）
const mdl = src("components/ui/modal.tsx"), gcss = src("app/globals.css");
check("m81(14-1) Modal＝常に overflow auto（scroll の有無によらず）・CSS＝.nox-modal-card の max-height 100dvh−36px（≤900 は 100dvh−safe-area-top）・.nox-formmodal-head は sticky（top −15px・背景 var(--card)）・.nox-formmodal-foot は sticky のまま",
  mdl.includes('    overflow: "auto" as const,\n  };') && !mdl.includes('scroll ? { overflow: "auto" as const } : null') && gcss.includes(".nox-modal-card { max-height: calc(100dvh - 36px); }")
  && gcss.includes("@media (max-width: 900px) { .nox-modal-card { max-height: calc(100dvh - env(safe-area-inset-top, 0px)); } }") && /\.nox-formmodal-head \{[^}]*position: sticky; top: -15px; z-index: 2;/.test(gcss) && /\.nox-formmodal-foot \{[^}]*position: sticky; bottom:/.test(gcss));
check("m81(14-2) スタッフ登録モーダル＝題名「スタッフ登録」は .nox-formmodal-head（× つき）・登録する／キャンセルは .nox-formmodal-foot（sticky）・Modal の呼び出しは不変（scroll 不要）",
  sbd.includes('<div className="nox-formmodal-head" data-staff-register-head="1">') && sbd.includes("<strong>スタッフ登録</strong>") && sbd.includes('<div className="nox-formmodal-foot" data-staff-register-foot="1"') && !sbd.includes("<h2 style={secTitle}>スタッフ登録</h2>")
  && sbd.includes("<Modal onClose={() => !busy && !aResult && !aInvite && setAddOpen(false)}>"));

if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-m65 ALL PASS (${pass} assertions)`);
