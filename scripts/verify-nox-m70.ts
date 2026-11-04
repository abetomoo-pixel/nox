/*
 * verify:nox-m70 — 便 B（2026-11-04・M-70 延長シミュレーション）＝見積の表の 3 行（延長 1〜3 回後の合計）が、
 *   延長を実際に 1〜3 回足した伝票の合計（check_lines → groupDueFull＝会計と同じ経路）と 1 円もズレないことの runtime 実証＋反転 1 本（単価を変えると赤）。
 *   実行: npm run verify:nox-m70（env: .env.local・NOX-VERIFY-A1 を manual／person に一時設定→finally 復元・伝票と席は finally 全消し）
 *   段: (1) 準備（A1 60/5000/30/2000/manual/person・席・開栓 2 名）(2) 見積 3 行（累計回数・終了時刻・加算の和＝合計の差）
 *       (3) check_extension_add ×1〜3＝各回の合計が見積と一致（延長行の形＝fee_kind extension・line_total 単価×人数）(4) 反転＝単価＋1 の見積は一致しない
 *       (5) 純関数＝extAddedBlocksOf／extEstimateEndLabelOf（翌）・client の pin（時間料金の枠と操作バー「見積」＝同じ部品・.nox-actions）
 */
import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { FIXTURE_USERS, STORE_A1, loadEnvOrExit } from "./fixtures-f0";
import { groupDueFull, type CheckDueSettings, type DueLine } from "../lib/nox/check-calc";
import { dueSettingsOf } from "../lib/nox/rules-0175/rounding";
import { rules0175On } from "../lib/nox/rules-0175/flag";
import { EXT_ESTIMATE_MAX, extAddedBlocksOf, extEstimateEndLabelOf, extEstimatePatternsOf, extEstimateRowsOf } from "../lib/nox/register/ext-estimate";

const env = loadEnvOrExit(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SEED_PASSWORD"]);
let pass = 0; const fails: string[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); };
const src = (p: string) => fs.readFileSync(p, "utf8");
const P70 = "NOX-VERIFY-M70";

type CheckRow = { id: string; started_at: string; set_min: number; ext_min: number; ext_fee: number; time_per: string; people: number | null; status: string; service_rate: number; round_unit: number; round_mode: string; business_tax_status: string | null; price_display: string | null; tax_rounding: string | null };
type LineRow = { kind: string; fee_kind: string | null; line_total: number; tax_category: string | null; pay_group: string; qty: number; unit_price_snapshot: number };

async function main() {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const signIn = async (key: keyof typeof FIXTURE_USERS): Promise<SupabaseClient> => {
    const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email: FIXTURE_USERS[key].email, password: env.SEED_PASSWORD });
    if (error) { console.error(`✗ ${key} サインイン失敗（seed:f0 実行済みか）: ${error.message}`); process.exit(1); }
    return c;
  };
  const { data: sA1row } = await admin.from("stores").select("id, org_id, round_unit, round_mode").eq("name", STORE_A1).single();
  const sA1 = sA1row as { id: string; org_id: string; round_unit: number; round_mode: string };
  const { data: origStore } = await admin.from("stores").select("set_min, set_fee, ext_min, ext_fee, time_mode, time_per").eq("id", sA1.id).single();
  const checkIds: string[] = []; const seatIds: string[] = [];
  const cleanup = async () => {
    if (checkIds.length) {
      await admin.from("check_lines").delete().in("check_id", checkIds);
      await admin.from("checks").delete().in("id", checkIds);
      await admin.from("audit_logs").delete().in("target", checkIds.map((id) => `checks:${id}`));
    }
    if (seatIds.length) await admin.from("seats").delete().in("id", seatIds);
    if (origStore) await admin.from("stores").update(origStore).eq("id", sA1.id);
  };
  const mgr = await signIn("managerA1");
  try {
    // (1) 準備＝manual／person（延長は 1 回＝1 行・人数倍）
    const { error: eSt } = await admin.from("stores").update({ set_min: 60, set_fee: 5000, ext_min: 30, ext_fee: 2000, time_mode: "manual", time_per: "person" }).eq("id", sA1.id);
    check("m70(1-1) 準備: A1 時間設定（60/5000/30/2000/manual/person）", !eSt, eSt?.message);
    const seat = (await admin.from("seats").insert({ org_id: sA1.org_id, store_id: sA1.id, name: `${P70}-卓`, kind: "卓", sort_order: 976, is_active: true }).select("id").single()).data?.id as string;
    seatIds.push(seat);
    const { data: cid, error: eO } = await mgr.rpc("check_open", { p_seat_id: seat, p_people: 2, p_nom_type: "free" });
    check("m70(1-2) 準備: check_open（2 名）", !eO && typeof cid === "string", eO?.message);
    const c = cid as string; if (c) checkIds.push(c);
    const readCheck = async () => (await admin.from("checks").select("id, started_at, set_min, ext_min, ext_fee, time_per, people, status, service_rate, round_unit, round_mode, business_tax_status, price_display, tax_rounding").eq("id", c).single()).data as CheckRow;
    const readLines = async () => ((await admin.from("check_lines").select("kind, fee_kind, line_total, tax_category, pay_group, qty, unit_price_snapshot").eq("check_id", c).order("sort_order")).data ?? []) as LineRow[];
    const ck = await readCheck();
    const settings: CheckDueSettings = dueSettingsOf(ck, { round_unit: sA1.round_unit, round_mode: sA1.round_mode }, rules0175On());
    const dueOf = (ls: LineRow[]) => groupDueFull(ls.filter((l) => l.pay_group === "A") as DueLine[], settings, 0);
    const lines0 = await readLines();
    const units = ck.time_per === "person" ? (ck.people ?? 1) : 1;
    const startedAtMs = new Date(ck.started_at).getTime();
    const base = { lines: lines0.filter((l) => l.pay_group === "A") as DueLine[], settings, referralCustomer: 0, extAmount: ck.ext_fee, extMin: ck.ext_min, units, people: ck.people, perPerson: ck.time_per === "person", baseBlocks: extAddedBlocksOf(lines0), startedAtMs, setMin: ck.set_min };
    const rows = extEstimateRowsOf(base);
    // (2) 表の形
    const due0 = dueOf(lines0);
    check("m70(2-1) 見積＝3 行・回数は累計（追加済み 0 → 1・2・3）・終了時刻＝着席＋60＋30n 分・加算の和＝合計の差・1 人あたり＝切り上げ（2 名）",
      rows.length === EXT_ESTIMATE_MAX && rows.map((r) => r.n).join(",") === "1,2,3" && rows.every((r) => r.endAtMs === startedAtMs + (60 + 30 * r.n) * 60_000)
      && rows.reduce((a, r) => a + r.add, 0) === rows[2].total - due0 && rows.every((r) => r.perPerson === Math.ceil(r.total / 2)) && rows[0].total > due0, rows);
    // (3) 実際に 1〜3 回足して突合（会計と同じ経路＝groupDueFull）
    for (let i = 1; i <= 3; i++) {
      const { error: eA } = await mgr.rpc("check_extension_add", { p_check_id: c });
      const ls = await readLines();
      const ext = ls.filter((l) => l.fee_kind === "extension");
      check(`m70(3-${i}) check_extension_add ${i} 回目＝延長行 ${i} 本（line_total 単価×人数＝4,000・taxable_10）・伝票の合計 ${dueOf(ls)} ＝ 見積 ${rows[i - 1].total}`,
        !eA && ext.length === i && ext.every((l) => l.line_total === 2000 * units && (l.tax_category ?? "taxable_10") === "taxable_10") && dueOf(ls) === rows[i - 1].total && extAddedBlocksOf(ls) === i,
        { e: eA?.message, due: dueOf(ls), est: rows[i - 1].total, ext });
    }
    // (4) 反転＝単価を変えると合わない（計算が凍結値を見ている証拠）
    const rowsX = extEstimateRowsOf({ ...base, extAmount: ck.ext_fee + 500 }); // 店の丸め（100 円単位）に吸われない差（＋1 円は丸めで同値になる）
    const lsEnd = await readLines();
    check("m70(4-1) 反転: 単価＋500 円の見積は実際の合計（3 回後）と一致しない（計算が伝票の凍結値を見ている証拠）", rowsX[2].total !== dueOf(lsEnd) && rowsX[2].total > dueOf(lsEnd), { x: rowsX.map((r) => r.total), due: dueOf(lsEnd) });
    // (5) 純関数・client の pin
    check("m70(5-1) 純関数＝extAddedBlocksOf（extension の行数）・終了時刻の表示（日付をまたぐと「翌」）・max は 1〜3 に丸める",
      extAddedBlocksOf([{ fee_kind: "extension" }, { fee_kind: "set" }, { fee_kind: "extension" }]) === 2
      && extEstimateEndLabelOf(Date.UTC(2026, 10, 4, 17, 0) /* 02:00 JST 翌日 */, Date.UTC(2026, 10, 4, 11, 0) /* 20:00 JST */) === "翌02:00"
      && extEstimateEndLabelOf(Date.UTC(2026, 10, 4, 13, 30), Date.UTC(2026, 10, 4, 11, 0)) === "22:30"
      && extEstimateRowsOf({ ...base, max: 9 }).length === 3 && extEstimateRowsOf({ ...base, max: 0 }).length === 1);
    const rb = src("app/(manage)/register/register-board.tsx"), tb = src("components/nox/ext-estimate-table.tsx");
    check("m70(5-2) client＝会計タブ「時間料金」（自動・手動）の枠に見積の表・操作バーの「見積」ボタン（注文・指名・席タブからも同じ表をポップオーバー＝Modal）・自動店は実時計の回数・手動店は追加済みの行数から・同じ部品 ExtEstimateTable",
      rb.includes('data-ext-estimate-open="1"') && rb.includes("<ExtEstimateTable patterns={extEstimatePatterns}") && (rb.match(/<ExtEstimateTable patterns=\{extEstimatePatterns\}/g) ?? []).length === 3
      && rb.includes("baseBlocks: timeMode === \"auto\" ? timeStatusOf(") && rb.includes("extAddedBlocksOf(lines)") && rb.includes("{extEstimateOpen && check && (") && tb.includes('data-ext-estimate-row={r.n}') && tb.includes("1 人あたり"));
    // ★Agoora 指摘（20:59）: パターンごと＝snap の全行（平日通常／週末通常／VIP）にそれぞれ表・適用中の印・snap なしは既定 1 つ
    const snap = [{ rule_id: "r60", duration_min: 60, amount: 13000, label: "平日通常 延長 60 分", is_default: true }, { rule_id: "rv", duration_min: 30, amount: 9000, label: "VIP 延長" }, { rule_id: "rw", duration_min: 30, amount: 4000, label: "週末通常 延長" }];
    const pats = extEstimatePatternsOf(snap, { extMin: 60, extAmount: 13000, ruleId: null }, base);
    check("m70(5-3) パターンごとの見積＝snap の 3 行に 3 表（ラベル・分・額）・適用中＝ext_rule_id か額と分の一致（平日通常）・既定の印・各表の合計はその単価の見積と同じ・snap なしは既定 1 つ（label「延長 30分」）",
      pats.length === 3 && pats.map((p) => p.label).join("|") === "平日通常 延長 60 分|VIP 延長|週末通常 延長" && pats[0].current && pats[0].isDefault && !pats[1].current && pats[1].extAmount === 9000 && pats[1].extMin === 30
      && pats[1].rows[0].total === extEstimateRowsOf({ ...base, extAmount: 9000, extMin: 30 })[0].total && pats[2].rows[2].endAtMs === startedAtMs + (60 + 30 * 3) * 60_000
      && extEstimatePatternsOf(null, { extMin: 30, extAmount: 2000, ruleId: null }, base).map((p) => p.label + ":" + p.current).join() === "延長 30分:true" && extEstimatePatternsOf(snap, { extMin: 30, extAmount: 9000, ruleId: "rv" }, base)[1].current === true
      && tb.includes("data-ext-estimate-pattern={p.key}") && tb.includes('data-ext-estimate-pill="current"'), pats.map((p) => [p.label, p.current, p.rows[0].total]));
  } finally { await cleanup(); }
  if (fails.length) { console.error(`FAIL ${fails.length} 件 / pass ${pass}`); for (const f of fails) console.error(" - " + f); process.exit(1); }
  console.log(`verify:nox-m70 ALL PASS (${pass} assertions)`);
}
void main();
