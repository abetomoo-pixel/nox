/*
 * verify:nox-bend — 便 D（2026-11-05・裁定455 の 3・M-94〜M-99・M-101〜M-107）の純関数と client の pin（DB は読まない＝f0 の末尾）。
 *  (1) M-102 site 固定の URL／(2) M-95 期間なしの日＝割当モーダル／(3) M-96 店が決める店＝2 段／(4) M-98 売掛なしの店／(5) M-99 契約チップ／(6) M-104 確定済みの月の控除一覧
 *  (7) 裁定455-3 遅刻控除・当欠控除の自動登録＋初期設定 ⑦ の 2 欄／(8) M-101 LineQuotaCard／(9) M-103 出勤時の「今日の控除」（0196 まで非表示）／(10) M-94 レジのレール
 *  (11) M-97 モーダルの頭と脚・必要人数の行／(12) M-105 /mine の操作ボタン中央／(13) M-106 日ごとの行／(14) M-107 人数のステッパー
 *  使い方: npm run verify:nox-bend
 */
import fs from "node:fs";
import { siteHrefOf, siteOriginOf, liffBindUrlOf } from "../lib/nox/line/liff-endpoint";
import { makeStepsOf, VIEW_TABS } from "../lib/nox/shift/tabs";
import { AUTO_PENALTY_NAME, autoPenaltyArgsOf, autoPenaltyReasonOf, presetsWithAmountsOf, DEFAULT_SETTLEMENT_PRESETS } from "../lib/nox/payroll/settlement";
import { LINE_QUOTA_KINDS_NOTE, lineQuotaViewOf } from "../lib/nox/line/push-forecast";
import { dayDedPickLabelOf, dayDedPickRowsOf, DAY_DED_PICK_HEAD } from "../lib/nox/payroll/day-ded-pick";
import { MIG_0196_APPLIED, mig0196On, __set0196ForTest } from "../lib/nox/rules-0175/flag";
import { clampStep } from "../components/ui/num-stepper";
import { CONTRACT_CHIP_STYLE } from "../components/nox/contract-chip";
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");

// (1) M-102
{
  const prev = process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  check("bend(1-1) siteOriginOf＝env 未設定なら今の origin（末尾の / は落とす）", siteOriginOf("https://nox-kappa-eight.vercel.app/") === "https://nox-kappa-eight.vercel.app" && siteOriginOf("http://localhost:3200") === "http://localhost:3200");
  process.env.NEXT_PUBLIC_SITE_URL = "https://noxapp.jp/";
  check("bend(1-2) siteOriginOf＝env があれば site 固定（vercel.app でログイン中でも noxapp.jp）・招待リンクのホストが site 値", siteOriginOf("https://nox-kappa-eight.vercel.app") === "https://noxapp.jp" && liffBindUrlOf(siteOriginOf("https://nox-kappa-eight.vercel.app"), "S1", "tok") === "https://noxapp.jp/liff/S1?t=tok&m=bind");
  check("bend(1-3) siteHrefOf＝host だけ差し替え（path＋query＋hash は保つ）・site 値が空／不正なら元の URL", siteHrefOf("https://nox-kappa-eight.vercel.app/liff/S1?t=tok&m=bind#x", "https://noxapp.jp") === "https://noxapp.jp/liff/S1?t=tok&m=bind#x" && siteHrefOf("https://a.example/liff/S1", "") === "https://a.example/liff/S1" && siteHrefOf("https://a.example/liff/S1", "not a url") === "https://a.example/liff/S1");
  if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = prev;
  check("bend(1-4) 発行の 5 か所＝casts-board／staff-board／line-config-panel／Webhook の返事／liff.login の redirectUri が siteOriginOf を通る（window.location.origin の直渡しは無い）",
    src("app/(manage)/casts/casts-board.tsx").includes("liffBindUrlOf(siteOriginOf(window.location.origin), c.store_id, data)") && src("app/(manage)/staff/staff-board.tsx").includes("liffBindUrlOf(siteOriginOf(window.location.origin), m.store_id, data)")
    && src("app/(manage)/master/line-config-panel.tsx").includes('const origin = siteOriginOf(typeof window !== "undefined" ? window.location.origin : "");') && src("app/api/line/webhook/[storeId]/route.ts").includes("liffEntryUrlOf(siteOriginOf(new URL(req.url).origin), storeId)")
    && src("app/liff/[storeId]/liff-bridge.tsx").includes("liff.login({ redirectUri: siteHrefOf(window.location.href, siteOriginOf(window.location.origin)) })") && !src("app/liff/[storeId]/liff-bridge.tsx").includes("redirectUri: window.location.href }")
    && src("docs/tmp/domain_switch.md").includes("NEXT_PUBLIC_SITE_URL=https://noxapp.jp"));
}
// (2) M-95
const sb = src("app/(manage)/shift/shift-board.tsx");
check("bend(2-1) 月カレンダーのセル＝期間なしの日も割当モーダル（①への分岐なし）", sb.includes('onClick={() => { setSelDate(ymd); setDayModal("calendar"); }} /* ★便 D M-95') && !sb.includes("if (periodNoneOf(ymd) && isManagerUp) { openNewPeriodAt(ymd); return; }"));
// (3) M-96
check("bend(3-1) makeStepsOf＝店が決める店は ③配置→④公開 の 2 段・それ以外は 4 段（VIEW_TABS.make と同一）", makeStepsOf(true).map(([k]) => k).join("/") === "queue/publish" && makeStepsOf(false) === VIEW_TABS.make);
check("bend(3-2) shift-board＝stores.settings_json.shift_request_mode==='store' を読む・2 段の店で ①②に居たら ③へ・data-shift-steps=2／マスタ › 店舗設定の 3 択目「店が決める」",
  sb.includes('setStoreDecides(sj.shift_request_mode === "store")') && sb.includes('if (storeDecides && (tab === "build" || tab === "submit")) setTab("queue");') && sb.includes('data-shift-steps={storeDecides ? "2" : "1"}')
  && src("app/(manage)/master/mine-settings-panel.tsx").includes('(["shift", "off_only", "store"] as const).map((v) => [v, SHIFT_REQUEST_MODE_LABEL[v]] as const)'));
// (4) M-98
const rb = src("app/(manage)/report/report-board.tsx");
check("bend(4-1) 日報＝receivable_policy='disabled' の店は「売掛」タブと「売掛 本日発生」を出さない（タブに居たら日報へ）", rb.includes('setArOff((data as { receivable_policy?: string | null } | null)?.receivable_policy === "disabled")') && rb.includes('(isManagerUp && !arOff ? (["day", "month", "ar"] as const) : (["day", "month"] as const))') && rb.includes('if (arOff && tab === "ar") setTab("day");') && rb.includes("{isManagerUp && ((arNew && !arOff) || pending) && (") && rb.includes("{!arOff && (/* ★便 D M-98"));
// (5) M-99
check("bend(5-1) 契約チップ＝本文色（var(--ink)）・輪郭だけ（var(--line2)）・地は透明＝役割チップと同じトークン", CONTRACT_CHIP_STYLE.color === "var(--ink)" && CONTRACT_CHIP_STYLE.background === "transparent" && CONTRACT_CHIP_STYLE.border === "1px solid var(--line2)");
check("bend(5-2) 使う場所＝/staff 一覧（押すと働き方の編集）・給与 › 勤怠（スタッフ）の契約列・キャスト管理のプラン名（旧 .nox-stpill の薄い文字は無い）",
  src("app/(manage)/staff/staff-board.tsx").includes('<ContractChip dataKey="data-staff-contract-chip"') && src("app/(manage)/staff/staff-work-panel.tsx").includes('<ContractChip text={staffContractLineOf(r.contract)} dataKey="data-staff-work-contract" />')
  && src("app/(manage)/casts/casts-board.tsx").includes('<ContractChip text={planNameOf(c.id)!} dataKey="data-cast-plan-chip" />') && !src("app/(manage)/casts/casts-board.tsx").includes('className="nox-stpill" style={{ color: "var(--v2-muted)" }}>{planNameOf(c.id)}'));
// (6) M-104
const pb = src("app/(manage)/payroll/payroll-board.tsx");
check("bend(6-1) 給与の明細パネル＝確定済みの月は live の控除マスタ一覧を出さない・未確定の月だけ「控除ルール（この月だけの上書き）」", pb.includes('data-ded-rules-head="1">控除ルール（この月だけの上書き）</p>}') && pb.includes("{(adjEditable ? dedRows : []).map((d) => {") && !pb.includes("固定控除{adjEditable ? \"\" : \"（確定済み・読取のみ）\"}"));
// (7) 裁定455-3
check("bend(7-1) 名称＝「遅刻控除」「当欠控除」＋（M/D）", AUTO_PENALTY_NAME.late === "遅刻控除" && autoPenaltyReasonOf("late", "2026-11-05") === "遅刻控除（11/5）" && autoPenaltyReasonOf("absent", "2026-12-24") === "当欠控除（12/24）");
{
  const preset = { code: "late", name: "遅刻", amount: 3000, basis: "契約書の遅刻精算条項に基づく減額", target: "late" as const };
  const a = autoPenaltyArgsOf({ runId: "R1", castId: "C1", preset, target: "late", biz: "2026-11-05", shiftId: "S1" });
  check("bend(7-2) autoPenaltyArgsOf＝fixed・源泉前・明細に出す・source settlement・basis＝ひな形・target_shift_id・額＝ひな形の既定額・reason＝名称", a.ok && a.args.p_mode === "fixed" && a.args.p_amount === 3000 && a.args.p_before_withholding === true && a.args.p_show_detail === true && a.args.p_source === "settlement" && a.args.p_basis === preset.basis && a.args.p_target_shift_id === "S1" && a.args.p_reason === "遅刻控除（11/5）" && a.args.p_run_id === "R1" && a.args.p_cast_id === "C1", a);
  const b = autoPenaltyArgsOf({ runId: "R1", castId: "C1", preset: { ...preset, basis: " " }, target: "late", biz: "2026-11-05", shiftId: null });
  check("bend(7-3) 契約根拠の文が空なら登録しない（err）", !b.ok);
}
check("bend(7-4) presetsWithAmountsOf＝既定 2 件の額を ⑦ の 2 欄で差し替え（空／0／負は 0＝登録しない・小数は切り捨て）・欄が空なら既定と同値", JSON.stringify(presetsWithAmountsOf(1000, null)) === JSON.stringify(DEFAULT_SETTLEMENT_PRESETS.map((p) => ({ ...p, amount: p.target === "late" ? 1000 : 0 }))) && JSON.stringify(presetsWithAmountsOf(undefined, undefined)) === JSON.stringify(DEFAULT_SETTLEMENT_PRESETS) && presetsWithAmountsOf(-5, 2500.9).map((p) => p.amount).join("/") === "0/2500");
check("bend(7-5) kintai-edit＝attendance_set（late／absent）の後に applyAutoPenalty（追加・編集の両経路・失敗は保存を止めず注記）・auto-penalty＝額 0／雇用／二重／確定済み run は skip・payroll_run_create→payroll_adjustment_add",
  src("components/nox/kintai-edit.tsx").includes("pn = await penaltyNoteOf(status, date, null); }") && src("components/nox/kintai-edit.tsx").includes("pn = await penaltyNoteOf(plan.attendance.status, row!.bizDate, row!.shiftId ?? null); }")
  && src("lib/nox/payroll/auto-penalty.ts").includes('if (!preset || preset.amount <= 0) return { kind: "skipped", why: "no_amount" };') && src("lib/nox/payroll/auto-penalty.ts").includes('employment === "雇用") return { kind: "skipped", why: "employee" };')
  && src("lib/nox/payroll/auto-penalty.ts").includes('.eq("source", "settlement").eq("reason", reason).limit(1);') && src("lib/nox/payroll/auto-penalty.ts").includes('if (run.status !== "draft") return { kind: "skipped", why: "run_not_draft" };') && src("lib/nox/payroll/auto-penalty.ts").includes('supabase.rpc("payroll_adjustment_add", a.args)'));
check("bend(7-6) 初期設定 ⑦（給与・報酬）＝遅刻控除／当欠控除の 2 欄（data-setup-penalty）→ 完了 step の settlement_presets は presetsWithAmountsOf", src("app/(manage)/setup/setup-wizard.tsx").includes('data-setup-penalty="1"') && src("app/(manage)/setup/setup-wizard.tsx").includes("s.payroll.lateAmt = n;") && src("app/(manage)/setup/setup-wizard.tsx").includes("s.payroll.absentAmt = n;") && src("lib/nox/setup/v5.ts").includes("settlement_presets: presetsWithAmountsOf(S.payroll.lateAmt, S.payroll.absentAmt)"));
// (8) M-101
{
  const v = lineQuotaViewOf({ sent: 11, limit: 200, month: "2026-11-01", dayOfMonth: 3, daysInMonth: 30 });
  check("bend(8-1) lineQuotaViewOf＝見出し「LINE の送信数（11月）」・大きく「11 ／ 200 通」・着地見込み ceil(11/3×30)=110・バー 6%／55%・凡例・90% 未満は注意なし", v.title === "LINE の送信数（11月）" && v.big === "11 ／ 200 通" && v.forecast === 110 && v.sentPct === 6 && v.forecastPct === 55 && v.legend === "送信済み 11 通・月末の着地見込み 110 通" && !v.warn, v);
  const w = lineQuotaViewOf({ sent: 180, limit: 200, month: "2026-11-01", dayOfMonth: 20, daysInMonth: 30 });
  const o = lineQuotaViewOf({ sent: 200, limit: 200, month: "2026-11-01", dayOfMonth: 20, daysInMonth: 30 });
  const e = lineQuotaViewOf({ sent: 1, limit: 200, month: "2026-11-01", dayOfMonth: 1, daysInMonth: 30 });
  check("bend(8-2) 90% 以上＝注意・上限超え＝over・バーは 100% で止まる・1 日目の見込み 30 通でも near にしない（3 日目以降）", w.warn && w.status === "near" === (w.forecast > 200) && o.warn && o.status === "over" && o.sentPct === 100 && e.forecast === 30 && !e.warn && e.status === "normal");
  check("bend(8-3) 注記＝数えられる通知（シフトの公開・変更・お知らせ）・返事は数えない", LINE_QUOTA_KINDS_NOTE.includes("シフトの公開") && LINE_QUOTA_KINDS_NOTE.includes("お知らせ") && LINE_QUOTA_KINDS_NOTE.includes("友だち追加への返事は数えません"));
  const lq = src("components/nox/line-quota-card.tsx");
  check("bend(8-4) LineQuotaCard＝stores.line_config／line_monthly_limit＋line_push_month_summary（JST 暦月）・未設定は「LINE 連携を設定する」の 1 行・ホーム（店長以上）とお知らせ（一覧の上）に置く",
    lq.includes('supabase.rpc("line_push_month_summary", { p_month: jstMonthOf(Date.now()).month })') && lq.includes('data-line-quota="unset"') && lq.includes("LINE 連携を設定する</Link>") && lq.includes('data-line-quota={v.warn ? "warn" : "ok"}')
    && src("app/(manage)/dashboard/dashboard-board.tsx").includes("{isManagerUp && <LineQuotaCard storeId={curStoreId} />}") && src("app/(manage)/notices/notices-board.tsx").includes("{isManagerUp && <LineQuotaCard storeId={storeId} compact />}") && src("app/(manage)/notices/page.tsx").includes('select("id, name, settings_json")'));
}
// (9) M-103（0196 まで非表示）
check("bend(9-1) MIG_0196_APPLIED=true（2026-11-06 手貼り）・override", (MIG_0196_APPLIED as boolean) === true && mig0196On() === true && (__set0196ForTest(false), !mig0196On()) && (__set0196ForTest(null), mig0196On()));
check("bend(9-2) dayDedPickRowsOf＝on の行だけ（既定 off は送らない・全部 off なら null）・ラベル「名称（¥額）」", JSON.stringify(dayDedPickRowsOf([{ id: "a", name: "ヘアメ代", amount: 1000 }, { id: "b", name: "衣装", amount: 500 }], { b: true })) === JSON.stringify([{ deduction_id: "b", enabled: true }]) && dayDedPickRowsOf([{ id: "a", name: "x", amount: 1 }], {}) === null && dayDedPickLabelOf({ id: "a", name: "ヘアメ代", amount: 1000 }) === "ヘアメ代（¥1,000）" && DAY_DED_PICK_HEAD === "今日の控除（使ったものにチェック）");
check("bend(9-3) /mine＝出勤ボタンの上のチェック（data-mine-day-ded・mig0196On で出す・保存は cast_day_deductions_set の cast セルフ腕）・page は 0196 後だけ deductions（per=day・pick）を読む／キオスク＝出勤の前に dayded（kiosk_punch_state の day_rules→kiosk_punch p_day_deductions）",
  src("app/mine/punch-actions.tsx").includes("{mig0196On() && dayDedRules.length > 0 && btn.inEnabled && (") && src("app/mine/punch-actions.tsx").includes('supabase.rpc("cast_day_deductions_set", { p_cast_id: cid, p_biz_date: bizToday, p_rows: rows })')
  && src("app/mine/page.tsx").includes("mineDayDedRules: { id: string; name: string; amount: number }[] = mig0196On() && myStore") && src("app/mine/page.tsx").includes('.eq("per", "day").eq("day_rule", "pick")')
  && src("app/kiosk/page.tsx").includes('if (target.staff || !mig0196On()) { void punch("in"); return; }') && src("app/kiosk/page.tsx").includes("p_okuri: false, p_day_deductions: dayRows }") && src("app/kiosk/page.tsx").includes('{phase === "dayded" && target && ('));
// (10) M-94
const sn = src("components/ui/side-nav.tsx");
check("bend(10-1) /register＝共通レイアウト（畳んだレールが既定・»で広げる＝別キー nox.sidenav.register）・レジ専用の ≡ ドロワーは /floor だけ・キオスクは side-nav を通らない", sn.includes('const mode: "full" | "rail" | "hidden" = drawerRoute ? "hidden" : registerRoute ? (regPref ?? "rail") : (pref ?? (wide ? "full" : "rail"));') && sn.includes('window.localStorage.setItem("nox.sidenav.register", next)') && sn.includes('const drawerRoute = path === "/floor" || path.startsWith("/floor/");') && !src("app/kiosk/page.tsx").includes("SideNav"));
// (11) M-97
const saf = src("app/(manage)/shift/shift-add-form.tsx");
check("bend(11-1) まとめて追加モーダル＝題名（nox-formmodal-head＝sticky top）と脚（nox-formmodal-foot＝sticky bottom）・必要人数の帯は折り返し（data-need-band）", saf.includes('className="nox-modalhead nox-formmodal-head"') && saf.includes('className="nox-bulkadd-foot nox-formmodal-foot"') && sb.includes('flexWrap: "wrap", maxWidth: "100%", boxSizing: "border-box" }} data-need-band="1"'));
// (12) M-105
check("bend(12-1) /mine の操作ボタン＝行の中央（連絡先の 保存／やめる・辞退する／やめる＝.nox-actions）・左寄せの flex 行は残っていない", src("app/mine/contact-form.tsx").includes('<div className="nox-actions" data-mine-contact-actions="1">') && src("app/mine/shift-decline-button.tsx").includes('<span className="nox-actions" data-shift-decline-actions="1">') && !src("app/mine/contact-form.tsx").includes('<div style={{ display: "flex", gap: 8 }}>') && !src("app/mine/shift-decline-button.tsx").includes('<span style={{ display: "flex", gap: 8 }}>'));
// (13) M-106
const wf = src("app/mine/wishes/wish-form.tsx");
check("bend(13-1) 日ごとに変える行＝日付 1 行目・時刻 2 つと「外す」2 行目（grid・data-wish-day-row）・終了の表示は「翌02:00」（placeholder も hmLabelOf）", wf.includes('data-wish-day-row={ymd}') && wf.includes('placeholder={hmLabelOf(defEnd)}') && wf.includes('placeholder={hmLabelOf("26:00")}') && !wf.includes('placeholder="26:00"') && wf.includes('marginLeft: "auto" }} disabled={busy} onClick={() => { setSel((s) => toggleDay(s, ymd));'));
// (14) M-107
check("bend(14-1) clampStep＝min〜max に丸める（空・NaN は min・小数は切り捨て）", clampStep(0, 1, 20) === 1 && clampStep(25, 1, 20) === 20 && clampStep(NaN, 1, 20) === 1 && clampStep(7.9, 1, 20) === 7);
check("bend(14-2) 予約申請の人数＝NumStepper（1〜20・「名」・直接入力も可＝data-rsv-party）・旧の数字欄は無い", src("app/mine/reservation-request-card.tsx").includes('<NumStepper value={Math.max(1, Number(partySize) || 1)} onChange={(n) => setPartySize(String(n))} min={1} max={20} unit="名" ariaLabel="人数" disabled={busy} dataKey="data-rsv-party" />') && !src("app/mine/reservation-request-card.tsx").includes('aria-label="人数" />\n'));

if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-bend ALL PASS (${pass} assertions)`);
