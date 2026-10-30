/*
 * verify:nox-m3 — 便 M3（2026-10-29 夜・DB 変更 0・client のみ）: M-20〜M-30 の判定。
 *  M-20 スタッフの追加（.nox-actions 中央・働き方）／M-21 働き方の欄（スタッフ＝staff_contract_set・キャスト＝set_withholding_kind）／M-22 月の切替／
 *  M-23 スタッフの日ごとの勤怠（純関数 staffDayRowsOf＝staffHoursOf と一致・同じ部品 KintaiRow・給与 › 勤怠（スタッフ）が正本・副ボタンで飛ぶ・390 はシート）／
 *  M-24 末尾の遷移リンク＝中央の副ボタン（casts-board 2 か所・文中のリンクは残す）／M-25 給与一覧の右パネル＝1,024 未満はシート／M-26 「仮シフト」の不在／
 *  M-28 下段タブ＝給与の上段タブと同じ型・KPI は一覧と同じ元（デモは 0 台＋1 行）／M-29 再発行（route reissue）・英語の生文→日本語・無効化の操作は 0190 の後／M-30 行削除で pending キープ取消。
 *  使い方: npm run verify:nox-m3（env 不要・DB 不触）
 */
import fs from "node:fs";
import { staffDayRowsOf, staffDayPayOf, staffPayHeadOf, staffPunchHmOf } from "../lib/nox/staff/kintai";
import { staffHoursOf, type StaffContract, type StaffPunch } from "../lib/nox/staff/pay";
import { kioskErrJa, KIOSK_DEVICE_LIMIT } from "../lib/nox/kiosk/device-errors";

let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const J = JSON.stringify;

// ── M-23 純関数 ──
const P = (bd: string, kind: "in" | "out", iso: string): StaffPunch => ({ membership_id: "m", biz_date: bd, kind, punched_at: iso });
const punches = [P("2026-10-01", "in", "2026-10-01T09:00:00Z"), P("2026-10-01", "out", "2026-10-01T14:30:00Z"), P("2026-10-02", "in", "2026-10-02T10:00:00Z"), P("2026-10-02", "out", "2026-10-02T17:05:00Z"), P("2026-10-03", "in", "2026-10-03T11:00:00Z"), P("2026-10-05", "out", "2026-10-05T12:00:00Z")];
const rows = staffDayRowsOf(punches, "2026-10-04");
const hours = staffHoursOf(punches);
check("m3(23-1) staffDayRowsOf＝営業日ごとの行（10/1 18:00〜23:30 5.5h・10/2 翌 02:05 まで 7.1h・10/3 in だけ＝過去日は退勤記録なし・10/5 out だけ＝出勤記録なし）・出勤日数と実働は staffHoursOf と一致",
  rows.length === 4 && rows[0].inHm === "18:00" && rows[0].outHm === "23:30" && rows[0].hours === 5.5 && rows[1].outHm === "26:05" && rows[1].hours === 7.1 && rows[2].inHm === "20:00" && rows[2].outHm === null && rows[2].missingOut === true && rows[2].working === false && rows[3].missingIn === true && rows[3].final === null
  && rows.filter((r) => r.inHm).length === hours.filter((h) => h.minutes > 0 || h.open).length && Math.round(rows.reduce((a, r) => a + r.hours, 0) * 10) / 10 === Math.round(hours.reduce((a, h) => a + h.minutes, 0) / 60 * 10) / 10, rows.map((r) => [r.bizDate, r.inHm, r.outHm, r.hours, r.missingOut, r.missingIn]));
check("m3(23-2) 今日の in だけ＝勤務中（退勤記録なしにしない）・翌表記＝staffPunchHmOf", staffDayRowsOf([P("2026-10-04", "in", "2026-10-04T10:00:00Z")], "2026-10-04")[0].working === true && staffDayRowsOf([P("2026-10-04", "in", "2026-10-04T10:00:00Z")], "2026-10-04")[0].missingOut === false && staffPunchHmOf("2026-10-01", "2026-10-01T17:30:00Z") === "26:30");
const hourlyC = { membership_id: "m", contract_kind: "parttime", hourly: 1500, fixed_allowance: 0, tax_class: "甲", pay_kind: "hourly" } as StaffContract;
const monthlyC = { membership_id: "m", contract_kind: "employee", hourly: 0, fixed_allowance: 300000, tax_class: "甲", pay_kind: "monthly", monthly: 300000 } as StaffContract;
check("m3(23-3) 日計＝時給制だけ（1,500×5.5h＝8,250・円未満切捨）・月給は —（null）・見出し「月給 ¥300,000（固定）」「時給 ¥1,500 × 実働」", staffDayPayOf(hourlyC, rows[0]) === 8250 && staffDayPayOf(monthlyC, rows[0]) === null && staffPayHeadOf(monthlyC) === "月給 ¥300,000（固定）" && staffPayHeadOf(hourlyC) === "時給 ¥1,500 × 実働" && staffPayHeadOf(null) === "契約未登録");

// ── 配線（grep） ──
const swp = src("app/(manage)/staff/staff-work-panel.tsx"), pp = src("app/(manage)/payroll/page.tsx"), sb = src("app/(manage)/staff/staff-board.tsx"), cb = src("app/(manage)/casts/casts-board.tsx"), pb = src("app/(manage)/payroll/payroll-board.tsx");
check("m3(23-4) 給与 › 勤怠（スタッフ）＝正本（daily・?mem=）・行を押すと日ごとの勤怠（KintaiHead／KintaiRow・withPay なし・390 は BottomSheet）・スタッフ › 勤怠・報酬は月次サマリ＋副ボタン「日ごとの勤怠を開く」（中央）・給与の「勤怠」タブは「勤怠（キャスト）」",
  pp.includes('<StaffWorkPanel scope="store" stores={storeList} daily initialMem={typeof sp.mem === "string" ? sp.mem : null} />') && pp.includes('["attendance", "勤怠（キャスト）", "/payroll?tab=attendance"]') && swp.includes("staffDayRowsOf(punches.filter((p) => p.membership_id === r.m.id), todayBiz)")
  && swp.includes("<KintaiRow key={d.bizDate} r={d} withBy={false} withPay={false} onEdit={null} onFix={null} onConfirmShift={null} />") && swp.includes('<BottomSheet onClose={() => setDailyMem(null)} title={title} testId="staff-kintai">') && swp.includes("data-staff-daily-link={r.m.id}") && swp.includes('className="nox-actions" style={{ margin: "0 0 8px" }}><Link href={`/payroll?tab=attendance&who=staff&mem='));
check("m3(21-1) 働き方の欄＝スタッフ（雇用形態・給与の形・額＝staff_contract_set の patch {contract_kind, pay_kind, 額}）・キャスト（源泉区分＝set_withholding_kind・注記・契約区分は従来）",
  swp.includes('supabase.rpc("staff_contract_set", { p_membership_id: contractForm.mem, p_patch: patchObj })') && swp.includes('data-staff-contract-edit="1"') && swp.includes('ariaLabel="給与の形"') && cb.includes('data-cast-withholding-kind="1"') && cb.includes('supabase.rpc("set_withholding_kind", { p_subject_kind: "cast", p_subject_id: castId, p_kind: v === "" ? null : v })') && cb.includes('data-cast-withholding-note="1"'));
check("m3(20-1) スタッフの追加＝.nox-actions 中央「＋ スタッフを追加」・追加の時点で働き方（staff_contract_set＝額が空なら作らない）", sb.includes('<div className="nox-actions" style={{ marginBottom: 8 }}>') && sb.includes('data-staff-add="1">＋ スタッフを追加</button>') && sb.includes('data-staff-add-work="1"') && sb.includes('supabase.rpc("staff_contract_set", { p_membership_id: body.membership_id, p_patch: { contract_kind: aWork.contract_kind, pay_kind: aWork.pay_kind, [aWork.pay_kind]: n } })'));
check("m3(22-1) 月の切替＝‹ 2026年10月 ›（手入力の type=month をやめる）", swp.includes('data-staff-month="1"') && !swp.includes('type="month"') && swp.includes('aria-label="前の月"') && swp.includes('aria-label="次の月"'));
check("m3(24-1) 末尾の遷移リンク＝中央の副ボタン（キャスト詳細 2 か所）・nox-link の「〜へ」は残らない", cb.includes('data-cast-link-secrets="1">機密・税務情報（システム設定）</Link>') && cb.includes('data-cast-link-plan="1">待遇プラン・報酬シミュレーター</Link>') && !cb.includes("機密・税務情報へ（システム設定）") && !cb.includes("報酬シミュレーターへ</Link>"));
check("m3(25-1) 給与一覧の右パネル＝1,024 未満は BottomSheet（開いた行＝detailCast のハイライト・閉じると detailCast null）・以上は aside のまま", pb.includes('import BottomSheet, { useNarrow } from "@/components/ui/bottom-sheet";') && pb.includes("const narrow = useNarrow(1024);") && pb.includes('data-pay-detail-panel={narrow ? "sheet" : "aside"}') && pb.includes('<BottomSheet onClose={() => setDetailCast(null)} title={rows.find((x) => x.castId === detailCast)?.castName ?? "内訳"} testId="paydetail">') && pb.includes('background: detailCast === r.castId ? "var(--card2)" : undefined'));
// M-26
const walk = (dir: string, out: string[]) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = `${dir}/${e.name}`; if (e.isDirectory()) walk(p, out); else if (/\.tsx?$/.test(e.name)) out.push(p); } };
const files: string[] = []; walk("app", files); walk("components", files);
const kari = files.filter((f) => { const s = src(f).replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, ""); return s.includes("仮シフト"); });
check("m3(26-1) 「仮シフト」の描画文字列＝0（app／components・コメントを除く）", kari.length === 0, kari);
// M-28／M-29
const sysb = src("app/(manage)/master/system/system-board.tsx"), sysp = src("app/(manage)/master/system/page.tsx"), kdp = src("app/(manage)/master/kiosk-device-panel.tsx"), route = src("app/api/kiosk/provision/route.ts");
check("m3(28-1) 下段タブ＝給与の上段タブと同じ型（role=tab・btnGold／btnGhost・44px・390 は折返し＝flex 50%）・KPI＝デモ org は 0 台「デモ環境では端末を発行できません」・本番は「n 台登録・有効 m」・一覧の空も同じ 1 行",
  sysb.includes('role="tablist" aria-label="スタッフ・システム" data-system-tabs="1"') && sysb.includes("minHeight: 44, flex: \"1 1 calc(50% - 8px)\"") && sysp.includes('if (isOwner && orgDemo?.is_demo === true) { deviceTotal = 0; deviceInactive = 0; }') && sysp.includes("`${deviceTotal} 台登録・有効 ${deviceTotal - deviceInactive}`") && kdp.includes('data-kiosk-empty={isDemo ? "demo" : "none"}') && kdp.includes('data-kiosk-kpi="1"'));
check("m3(29-1) 再発行＝route action reissue（updateUserById・旧 PW 即時無効・新 PW は 1 回）・一覧の操作「認証情報を再発行」・無効化した端末の有効化／削除は 0190 の後（置かない）・成功＝緑の帯",
  route.includes('if (body.action === "reissue") {') && route.includes("admin.auth.admin.updateUserById(dev.auth_user_id as string, { password })") && kdp.includes("data-kiosk-reissue={d.id}") && kdp.includes('data-kiosk-inactive-ops="0190"') && kdp.includes('<Message kind="success">{msg}</Message>'));
check("m3(29-2) 英語の生文→日本語（already provisioned＝上限の文言・bad target・not found・forbidden・billing locked・already processed・device inactive）", /上限（1 台）に達しています/.test(kioskErrJa(409, "already provisioned", "レジ")) && KIOSK_DEVICE_LIMIT === 1 && kioskErrJa(403, "forbidden", "x") === "権限がありません（オーナーのみ）" && /端末が見つかりません/.test(kioskErrJa(404, "not found", "x")) && /契約の状態/.test(kioskErrJa(500, "billing locked", "x")) && /端末アカウントにできません/.test(kioskErrJa(500, "bad target", "x")) && kioskErrJa(500, "zzz", "x") === "エラー(500): zzz");
// M-30
const rb = src("app/(manage)/register/register-board.tsx");
check("m3(30-1) 行削除＝pending のキープを bottle_keep_update（removed）で取り消してから check_remove_line（RPC 側＝0191 ★5）", rb.includes('.eq("status", "pending"); // ★便 M3 M-30') && rb.includes('p_status: "removed"') && rb.indexOf("★便 M3 M-30") < rb.indexOf('supabase.rpc("check_remove_line", { p_line_id: lineId })'));

if (fails.length) { console.error(`verify:nox-m3 FAIL ${fails.length}（pass ${pass}）\n` + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
console.log(`verify:nox-m3 OK ${pass} checks（便 M3＝M-20〜M-30）`);
