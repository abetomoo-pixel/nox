// @ts-nocheck — scratch（pg の型定義なし・docs/tmp 未追跡）
// 裁定245 表示の再現（読取のみ・pg 直結 postgres・DEMO CLUB NOX・2026-09）
//   shift-board の承認待ちタブ（castConfirm=false）と shift-add-form の日セル「不足 n」を同じ経路・同じ純関数で再現してテキストで出す。
import fs from "fs";
import { Client } from "C:/Users/abet/Dropbox/cloude/nox/node_modules/pg";
import { gapOf, chunkOf } from "C:/Users/abet/Dropbox/cloude/nox/lib/nox/shift/gap";

for (const l of fs.readFileSync("C:/Users/abet/Dropbox/cloude/nox/.env.local", "utf8").split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
const dowOf = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
const DOW = ["日", "月", "火", "水", "木", "金", "土"];

(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  console.log(JSON.stringify((await c.query(`select 'nox-project-proof' as k, count(*)::int as n from public.orgs`)).rows[0]));
  const st = (await c.query(`select id, settings_json from public.stores where name='CLUB NOX'`)).rows[0];
  const S = st.id as string;
  const castConfirm = (st.settings_json ?? {}).shift_cast_confirm === true;
  console.log(`store CLUB NOX  settings_json.shift_cast_confirm=${JSON.stringify((st.settings_json ?? {}).shift_cast_confirm)} → castConfirm=${castConfirm}`);

  // ── 承認待ちタブ（shift-board と同じ母集団＝表示月の shifts と pending wishes）──
  const shifts = (await c.query(`select id, cast_id, date::text, status, source from public.shifts where store_id=$1 and date between '2026-09-01' and '2026-09-30' order by date, id`, [S])).rows;
  const wishes = (await c.query(`select id from public.shift_wishes where store_id=$1 and status='pending' and date between '2026-09-01' and '2026-09-30'`, [S])).rows;
  const planned = shifts.filter((x) => x.status === "planned"), proposed = shifts.filter((x) => x.status === "proposed"), confirmed = shifts.filter((x) => x.status === "confirmed");
  const steps = castConfirm
    ? [["1", "申請（キャスト希望）", wishes.length], ["2", "承認（管理者確認・時間調整）", planned.length], ["3", "仮シフト（キャスト確認）", proposed.length], ["4", "確定", confirmed.length]]
    : [["1", "申請（キャスト希望）", wishes.length], ["2", "承認（管理者確認・時間調整）", planned.length + proposed.length], ["3", "確定", confirmed.length]];
  console.log(`\n[承認待ちタブ 2026-09] 段階表示 ${steps.length} 段: ` + steps.map(([n, l, cnt]) => `${n} ${l} ${cnt}`).join(" → "));
  console.log(`  一括ボタン: 「${planned.length}件まとめてキャスト確認へ」＝${castConfirm && planned.length > 0 ? "表示" : "非表示"}／「${planned.length + proposed.length}件を一括確定」＝表示（disabled=${planned.length + proposed.length === 0}）`);
  const rowsProposed = proposed.length, rowsPlanned = planned.length;
  console.log(`  行: planned ${rowsPlanned} 行（操作列＝時間調整／${castConfirm ? "キャスト確認へ／" : ""}確定／削除）・proposed ${rowsProposed} 行（段階「${castConfirm ? "キャスト確認待ち" : "承認済み（未確定）"}」・操作列＝再調整／差し戻す／確定／削除）`);
  const chunks = chunkOf([...planned, ...proposed].map((x) => x.id), 62);
  console.log(`  一括確定の分割: ${chunks.length} 回（${chunks.map((k) => k.length).join("＋")} 件）＝shift_confirm_bulk を順に ${chunks.length} 回`);

  // ── shift-add-form の日セル「不足 n」（9/12〜9/26・キャスト未選択＝selected=false）──
  const needs = (await c.query(`select dow, required from public.staffing_needs where store_id=$1`, [S])).rows;
  const assigned: Record<string, number> = {}; for (const s of shifts) assigned[s.date] = (assigned[s.date] ?? 0) + 1;
  const bh = (await c.query(`select dow, is_closed from public.store_business_hours where store_id=$1`, [S])).rows;
  const closedDow = new Set(bh.filter((r) => r.is_closed).map((r) => r.dow));
  console.log(`\n[shift-add-form 9/12〜9/26] staffing_needs=${needs.length} 行（曜日ピーク required）・定休曜日=${[...closedDow].map((d) => DOW[d]).join("") || "なし"}`);
  const shortDays: string[] = [];
  for (let d = 12; d <= 26; d++) {
    const ymd = `2026-09-${String(d).padStart(2, "0")}`;
    const req = needs.filter((n) => n.dow === dowOf(ymd)).reduce((m, n) => Math.max(m, n.required), 0);
    const asg = assigned[ymd] ?? 0;
    const g = gapOf(req, asg, false);
    const label = g === null ? "—" : g === 0 ? "充足" : `不足 ${g}`;
    if (g !== null && g > 0 && !closedDow.has(dowOf(ymd))) shortDays.push(ymd);
    console.log(`  ${ymd}(${DOW[dowOf(ymd)]}) required=${req} assigned=${asg} → ${label}${closedDow.has(dowOf(ymd)) ? "（定休日＝セルは休）" : ""}`);
  }
  console.log(`  「不足日を全部選択」が選ぶ日（定休日除外・キャスト未選択・登録済み日は個別に除外）: ${shortDays.length} 日 ${shortDays.join(", ")}`);
  await c.end();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
