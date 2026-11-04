/*
 * verify:nox-m63 — 新 CC の最初の便（2026-11-04・v57 §3-2 の 1〜5・client のみ・DB 不触）。
 *  (1) M-63 勤怠（スタッフ）明細の下部ボタン 2 つ（「＋ 日を追加・修正」「この月を確定」）＝.nox-actions で 2 つ並べて中央（marginLeft:auto を外す）
 *  (2) M-64 給与 › 勤怠（スタッフ）を正本に＝スタッフ › 勤怠・報酬 のタブを外す・?tab=work は正本へ redirect・一覧に案内のリンク 1 行
 *  (3) 裁定443 の改める 3 点＝1-①（新しい店＝setupDone false だけ v5 の端数を round_mode に）・9-①（監査の営業時間外＝店設定の営業時間から・定数 [6,18] 廃止）・18-⑦（window.prompt 4 か所→ReasonModal）
 *  (4) 裁定434 ④＝withholding-432-panel の other_204 に手入力の注記 1 行
 *  (5) F193-4＝sensitive-tax-panel を店長（自店）に開く（get／set_cast_sensitive_ext・末尾 4 桁＝get_cast_mynumber_masked・全桁と廃棄は管理者）
 *  使い方: npm run verify:nox-m63（env 不要・DB 不触）
 */
import fs from "node:fs";
import path from "node:path";
import { auditAlertsOf } from "../lib/nox/audit/alerts";
import { buildV5Plan, v5DefaultState, applyType, ROUND_MODE_OF, v5RoundModeOf, type V5Ctx } from "../lib/nox/setup/v5";
import { MINE_SETTINGS_DEFAULT } from "../lib/nox/store/mine-settings";
import { STAFF_TABS, STAFF_WORK_HREF, staffTabOf } from "../lib/nox/staff/tabs";
import { OTHER_204_MANUAL_NOTE } from "../lib/nox/payroll/withholding-kind";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = JSON.stringify;
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".tsx") ? [path.join(d, e.name)] : []));
const code = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s\/\/.*$/, "")).join("\n");

// ── (1) M-63
const swp = src("app/(manage)/staff/staff-work-panel.tsx");
const actBlock = swp.split('data-staff-att-actions="1"')[1]?.split("</div>")[0] ?? "";
check("m63(1-1) M-63 勤怠（スタッフ）明細の下部＝.nox-actions（中央・gap 8 の既定）に「＋ 日を追加・修正」と「この月を確定」（marginLeft:auto なし・inline の flex 指定なし）",
  swp.includes('<div className="nox-actions" data-staff-att-actions="1">') && actBlock.includes('data-staff-att-add="1"') && actBlock.includes('data-staff-att-lock="1"') && actBlock.includes('data-staff-att-unlock="1"') && !actBlock.includes('marginLeft: "auto"') && !actBlock.includes("justifyContent"), actBlock.slice(0, 200));

// ── (2) M-64
const sp = src("app/(manage)/staff/page.tsx"), sb = src("app/(manage)/staff/staff-board.tsx"), pp = src("app/(manage)/payroll/page.tsx");
check("m63(2-1) M-64 /staff＝タブは一覧だけ・?tab=work は 給与 › 勤怠（スタッフ）へ redirect・StaffWorkPanel を描かない・案内のリンク 1 行（data-staff-work-link）",
  STAFF_TABS.length === 1 && STAFF_TABS[0][0] === "list" && STAFF_WORK_HREF === "/payroll?tab=attendance&who=staff" && staffTabOf("work") === "work"
  && sp.includes('if (staffTabOf((await searchParams).tab) === "work") redirect(STAFF_WORK_HREF);') && !sp.includes("StaffWorkPanel") && !sp.includes('data-staff-tabs="1"')
  && sp.includes('<p data-staff-work-link="1"') && sp.includes("<Link href={STAFF_WORK_HREF}") && sb.includes("{tabs}"));
check("m63(2-2) M-64 正本＝給与 › 勤怠（スタッフ）は不変（?who=staff＝StaffWorkPanel scope store daily）・他に /staff?tab=work へのリンクは 0",
  pp.includes('<StaffWorkPanel scope="store" stores={storeList} daily initialMem=') && [...walk("app"), ...walk("components"), ...walk("lib")].filter((f) => code(src(f)).includes("/staff?tab=work")).length === 0);

// ── (3) 裁定443 1-①
const ctx: V5Ctx = { storeId: "11111111-1111-4111-8111-111111111111", current: { round_unit: 100, round_mode: "down", time_mode: "manual", time_per: "person", receipt: { address: "", tel: "", reg_no: "", footer: "" }, mine: { ...MINE_SETTINGS_DEFAULT }, tax: { business_tax_status: "taxable", price_display: "tax_excluded", invoice_status: "unregistered", invoice_reg_no: "", tax_rounding: "floor", card_surcharge_rate: 0 } } as unknown as V5Ctx["current"], deviceIdemKey: "22222222-2222-4222-8222-222222222222", staffIdemKeys: [] };
const S = applyType(v5DefaultState("2026-11-04"), "cabaret");
const modeOf = (c: V5Ctx) => (buildV5Plan(S, c).steps.find((s) => s.key === "pricing")!.args as { p_round_mode: string; p_round_unit: number });
check("m63(3-1) 443 1-① 新しい店（setupDone false）＝v5 STEP 8 の端数（既定 四捨五入＝round）を round_mode に・既存の店（true／不明）＝今の値（down）・単位は常に今の値",
  J(ROUND_MODE_OF) === J({ round: "round", floor: "down", ceil: "up" }) && modeOf({ ...ctx, setupDone: false }).p_round_mode === "round" && modeOf({ ...ctx, setupDone: true }).p_round_mode === "down" && modeOf(ctx).p_round_mode === "down" && modeOf({ ...ctx, setupDone: false }).p_round_unit === 100
  && v5RoundModeOf({ ...S, round: "floor" }, { ...ctx, setupDone: false }) === "down" && v5RoundModeOf({ ...S, round: "ceil" }, { ...ctx, setupDone: false }) === "up"
  && src("app/(manage)/setup/setup-wizard.tsx").includes("setupDone: store.setupDone"));

// ── (3) 裁定443 9-①
const L = (o: Partial<{ id: string; action: string; at: string; store_id: string | null; after_json: Record<string, unknown> | null }>) => ({ id: "x", action: "read_cast_sensitive", target: "cast_sensitive:1", actor_user_id: "u", at: "2026-11-04T12:00:00Z", before_json: null, after_json: null, store_id: "s1", ...o });
const night = (dow: number) => ({ dow, is_closed: false, open_hm: "20:00", close_hm: "29:00" }); // 20:00〜翌05:00
const day = (dow: number) => ({ dow, is_closed: dow === 0, open_hm: "11:00", close_hm: "18:00" }); // 昼営業・日曜 定休
const hours = { s1: [0, 1, 2, 3, 4, 5, 6].map(night), s2: [0, 1, 2, 3, 4, 5, 6].map(day) } as Record<string, { dow: number; is_closed: boolean; open_hm: string; close_hm: string }[]>;
const hoursOf = (sid: string | null | undefined) => (sid ? hours[sid] ?? null : null);
const al = auditAlertsOf([
  L({ id: "a", at: "2026-11-04T01:30:00Z" }), // JST 10:30 火＝夜の店は時間外
  L({ id: "b", at: "2026-11-04T13:00:00Z" }), // JST 22:00＝夜の店は営業中
  L({ id: "c", at: "2026-11-03T18:30:00Z" }), // JST 11/04 03:30＝営業日 11/03 の深夜帯＝営業中（翌05:00 まで）
  L({ id: "d", at: "2026-11-04T04:00:00Z", store_id: "s2" }), // JST 13:00 火＝昼の店は営業中（旧定数なら誤検知）
  L({ id: "e", at: "2026-11-04T13:00:00Z", store_id: "s2" }), // JST 22:00＝昼の店は時間外
  L({ id: "f", at: "2026-11-08T04:00:00Z", store_id: "s2" }), // JST 日曜 13:00＝定休日
  L({ id: "g", at: "2026-11-04T01:30:00Z", store_id: "s9" }), // 営業時間が未設定の店＝判定しない
  L({ id: "h", action: "check_void", after_json: { total: 60000 } }),
], { hoursOf });
check("m63(3-2) 443 9-① 営業時間外＝店設定の営業時間から（夜の店 10:30 は出る・22:00 と深夜帯 03:30 は出ない／昼の店 13:00 は出ない・22:00 は出る・定休日は出る／未設定の店は出ない）・高額の取消は不変",
  J(al.map((x) => [x.id, x.kind]).sort()) === J([["a", "off_hours_sensitive"], ["e", "off_hours_sensitive"], ["f", "off_hours_sensitive"], ["h", "high_void"]].sort()) && al.find((x) => x.id === "f")!.label.startsWith("定休日") && al.find((x) => x.id === "a")!.label.startsWith("営業時間外"), al);
check("m63(3-3) 443 9-① hoursOf を渡さなければ機微の要確認は 0（定数 [6,18] は無い）・audit-board は store_business_hours を読んで hoursOf を渡す",
  auditAlertsOf([L({ id: "a", at: "2026-11-04T01:30:00Z" })]).length === 0 && !src("lib/nox/audit/alerts.ts").includes("AUDIT_OFF_HOURS")
  && src("app/(manage)/audit/audit-board.tsx").includes('supabase.from("store_business_hours").select("store_id, dow, is_closed, open_hm, close_hm")') && src("app/(manage)/audit/audit-board.tsx").includes("auditAlertsOf((data ?? []) as Log[], { hoursOf: (sid) => (sid ? hoursByStore.get(sid) ?? null : null) })"));

// ── (3) 裁定443 18-⑦
const PROMPT_FILES = ["components/nox/daily-pay-form.tsx", "components/nox/pending-card.tsx", "app/(manage)/payroll/payment-tax-panel.tsx", "app/(manage)/shift/shift-add-form.tsx"];
const prompts = [...walk("app"), ...walk("components")].filter((f) => code(src(f)).includes("window.prompt("));
const rm = src("components/nox/reason-modal.tsx");
check("m63(3-4) 443 18-⑦ window.prompt は app／components に 0（コメントを除く）・ReasonModal＝既存 Modal・.nox-formmodal-*・必須なら空は送れない・対象の行（data-reason-line）",
  prompts.length === 0 && rm.includes('import Modal from "@/components/ui/modal";') && rm.includes('className="nox-formmodal-foot"') && rm.includes("const disabled = busy || (required && empty);") && rm.includes("data-reason-line={k}") && rm.includes("maxLength={maxLen}"), prompts);
check("m63(3-5) 443 18-⑦ 4 か所が ReasonModal＝日払いの取消（キャスト・営業日・金額）・申請の却下（申請・内容）・納付記録の取消（対象月・区分・源泉税額・納付日）・出勤不可（キャスト・日付＝任意）",
  PROMPT_FILES.every((f) => src(f).includes('import ReasonModal from "@/components/nox/reason-modal";'))
  && src(PROMPT_FILES[0]).includes('lines={[["キャスト", castName], ["営業日", cancelTarget.biz_date], ["金額", yen(cancelTarget.gross)]]}') && src(PROMPT_FILES[0]).includes('supabase.rpc("daily_pay_cancel", { p_id: p.id, p_reason: reason.trim().slice(0, 200) })')
  && src(PROMPT_FILES[1]).includes('lines={[["申請", rejectTarget.head], ["内容", rejectTarget.sub]]}') && src(PROMPT_FILES[1]).includes("rejectReasonOkOf(reason)")
  && src(PROMPT_FILES[2]).includes('["源泉税額", `¥${cancelTarget.withholding_total.toLocaleString("en-US")}`]') && src(PROMPT_FILES[2]).includes('supabase.rpc("withholding_payment_cancel", { p_target_month: r.target_month, p_tax_category: r.tax_category, p_reason: reason.trim() })')
  && src(PROMPT_FILES[3]).includes('required={false} submitLabel="出勤不可にする"') && src(PROMPT_FILES[3]).includes('lines={[["キャスト", selCast.name], ["日付", unavailTarget]]}'));

// ── (4) 裁定434 ④
const w432 = src("components/nox/withholding-432-panel.tsx");
check("m63(4-1) 434 ④ other_204 の説明に注記 1 行＝外交員・集金人は手入力（専用計算は作らない）", /外交員・集金人は計算方法が違うので税額を手入力で/.test(OTHER_204_MANUAL_NOTE) && w432.includes('{kind === "other_204" && <p style={{ ...t.sub, margin: "2px 0 6px" }} data-withholding-204-note="1">{OTHER_204_MANUAL_NOTE}</p>}'));

// ── (5) F193-4
const stp = src("app/(manage)/master/sensitive-tax-panel.tsx"), sys = src("app/(manage)/master/system/page.tsx");
check("m63(5-1) F193-4 店長（自店）に機密の入力欄＝canSensitive（isOwner ∨ mig0193On() ∧ isManager）・読取は get_cast_sensitive_ext（jsonb）・住所・電話・振込先は set_cast_sensitive_ext の patch（変わった項目だけ・口座番号 8 桁）・system page が isManager を渡す",
  stp.includes("const canSensitive = isOwner || (mig0193On() && isManager);") && stp.includes('await supabase.rpc("get_cast_sensitive_ext", { p_cast_id: castId })') && stp.includes('supabase.rpc("set_cast_sensitive_ext", { p_cast_id: castId, p_patch: patch })')
  && stp.includes("if (ext[k].trim() !== extCur[k].trim()) patch[k] = ext[k].trim() === \"\" ? null : ext[k].trim();") && stp.includes('data-cast-sensitive-ext="1"') && stp.includes("{canSensitive && (") && sys.includes('isManager={role === "manager"}'));
check("m63(5-2) F193-4 マイナンバー＝店長は入力と末尾 4 桁（get_cast_mynumber_masked）だけ・全桁の「表示」と「廃棄」は管理者のまま・文言に「オーナー」なし",
  stp.includes('{isOwner && <button onClick={reveal} disabled={!castId} style={btnLight}>表示</button>}') && stp.includes('{mig0193On() && !isOwner && <button type="button" onClick={() => void revealMasked()}') && stp.includes('supabase.rpc("get_cast_mynumber_masked", { p_cast_id: castId })')
  && stp.includes("{isOwner && <button type=\"button\" onClick={() => { setDiscardReason(\"\"); setDiscardOpen(true); }}") && !code(stp).includes("オーナー") && stp.includes("{!canSensitive && <p"));

if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-m63 ALL PASS (${pass} assertions)`);
