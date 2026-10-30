import { createClient } from "@/lib/supabase/server";
import * as t from "@/lib/nox/ui/theme";
import WishForm from "./wish-form";
import WithdrawButton from "./withdraw-button";
import { fmtWin } from "@/lib/nox/shift-time";
import { bizDateOf, bizDateRange } from "@/lib/nox/biz-date";
import { nextPeriodOf } from "@/lib/nox/payroll/attention";
import { DaysNormNote } from "../schedule-card"; // ★便 X13-G W-22 ⑤
import { daysCountOf, daysNormLineOf, scheduleOf, type ScheduleShift, type ScheduleWish } from "@/lib/nox/mine/schedule";
import { daysNormTargetsOf } from "@/lib/nox/mine/days-norm-server";
import { mineSettingsOf } from "@/lib/nox/store/mine-settings"; // ★裁定326-7（便 M4-1）: 店設定 shift_request_mode（'shift'／'off_only'）
import { resolveWishMode, wishPageTextOf, wishRowLabelOf, storeDecidesOf, STORE_DECIDES_NOTE } from "@/lib/nox/mine/wish-mode"; // ★0191 ★4: 店が決める
import { WISH_STATE_COLOR, WISH_STATE_LABEL, wishStateDetailOf, wishStateOf, type ShiftStatusLike, type WishStatusLike } from "@/lib/nox/shift/wish-state"; // ★裁定345

export const dynamic = "force-dynamic";

// シフト希望（shift_wishes＝パターン1・自分の行のみ）。取下げは pending のみ（RPC 側でも enforce）。
// ★裁定326-7（便 M4-1）: 「シフト希望」に改名。店設定 'off_only' は「休み希望」モード（kind 'off'・時刻なし）＝文言と提出引数は wish-mode の純関数。
// ★裁定345（便 N1013b）: 状態の語は shifts.status から導く 4 段（審査中／採用・確認待ち／採用・確定／見送り）＝lib/nox/shift/wish-state.ts。
//   希望行は wish_id で結線された shifts（自分の行＝RLS）を引いて段を決める。下に「今日以降のシフト」（/mine 直近の「すべて見る」の先）。
export default async function WishesPage() {
  const supabase = await createClient();
  const { data: storeRow } = await supabase.from("stores").select("settings_json").limit(1).maybeSingle(); // cast の RLS で自店 1 行（mig0106）
  const sj = (storeRow?.settings_json ?? {}) as Record<string, unknown>;
  const castConfirm = true; // ★裁定380（GV-B W-9）: 店設定 shift_cast_confirm は廃止＝送り返し（proposed）は常に「キャスト確認待ち」
  const cutoff = typeof sj.biz_cutoff_hm === "string" && sj.biz_cutoff_hm ? (sj.biz_cutoff_hm as string) : "06:00";
  const bizToday = bizDateOf(new Date().toISOString(), cutoff);
  // ★裁定337（0167・便 X-13d-2b）: キャスト個別（casts.shift_request_mode・auth_cast_id で自分の行）→店の既定 で解決。'off_only' の候補反転（M4）も同じ解決値（autoassign-mode.castModeOf）
  const { data: myCastId } = await supabase.rpc("auth_cast_id");
  const { data: meCast } = myCastId ? await supabase.from("casts").select("shift_request_mode").eq("id", myCastId as string).maybeSingle() : { data: null };
  const mode = resolveWishMode((meCast as { shift_request_mode?: string | null } | null)?.shift_request_mode, mineSettingsOf(storeRow?.settings_json).shift_request_mode);
  const text = wishPageTextOf(mode);
  const storeDecides = storeDecidesOf((meCast as { shift_request_mode?: string | null } | null)?.shift_request_mode, mineSettingsOf(storeRow?.settings_json).shift_request_mode); // ★0191 ★4
  const [{ data: wishes }, { data: shiftRows }] = await Promise.all([
    supabase.from("shift_wishes").select("id, date, start_hm, end_hm, status, kind").order("date", { ascending: false }).limit(20),
    supabase.from("shifts").select("id, date, start_hm, end_hm, status, wish_id").gte("date", bizToday).order("date"), // 自分の行（RLS）・今日以降
  ]);
  type ShiftLite = { id: string; date: string; start_hm: string; end_hm: string; status: ShiftStatusLike; wish_id: string | null };
  // ★便 X13-G W-22 ⑤: 出勤ノルマの不足（/mine の出勤予定と同じ純関数・同じ読取）＝今月と来月のうちノルマがある月だけ
  const month = bizToday.slice(0, 7), nextMonth = nextPeriodOf(month), nextNext = nextPeriodOf(nextMonth);
  const [{ data: myStoreRow }, { data: monthShifts }, { data: monthWishes }, { data: inPunches }] = await Promise.all([
    supabase.from("stores").select("id").limit(1).maybeSingle(),
    supabase.from("shifts").select("id, date, start_hm, end_hm, status, wish_id").gte("date", `${month}-01`).lt("date", `${nextNext}-01`),
    supabase.from("shift_wishes").select("id, date, start_hm, end_hm, status, kind").gte("date", `${month}-01`).lt("date", `${nextNext}-01`),
    supabase.from("punches").select("punched_at").eq("type", "in").gte("punched_at", bizDateRange(`${month}-01`, cutoff).startIso).lt("punched_at", bizDateRange(`${nextMonth}-01`, cutoff).startIso),
  ]);
  const worked = new Set(((inPunches ?? []) as { punched_at: string }[]).map((x) => bizDateOf(x.punched_at, cutoff)).filter((d) => d.slice(0, 7) === month));
  const targets = typeof myCastId === "string" && myStoreRow?.id ? await daysNormTargetsOf(myCastId, myStoreRow.id as string, [month, nextMonth], bizToday) : {} as Record<string, number | null>;
  const normLines = ([[month, "今月"], [nextMonth, "来月"]] as const).map(([m, label]) => {
    const sc = scheduleOf({ shifts: (monthShifts ?? []) as ScheduleShift[], wishes: (monthWishes ?? []) as ScheduleWish[], month: m, today: bizToday });
    const cnt = daysCountOf({ workedDates: m === month ? worked : new Set<string>(), schedule: sc });
    const line = daysNormLineOf({ target: targets[m], worked: cnt.worked, fixedDays: cnt.fixedDays, pendingDays: cnt.pendingDays });
    return line ? { label, line } : null;
  }).filter((x): x is { label: "今月" | "来月"; line: NonNullable<ReturnType<typeof daysNormLineOf>> } => !!x);
  const shifts = (shiftRows ?? []) as ShiftLite[];
  const shiftByWish = new Map<string, ShiftLite>();
  for (const s of shifts) if (s.wish_id) shiftByWish.set(s.wish_id, s);

  const title: React.CSSProperties = t.cardTitle;
  const stateCell = (wish: WishStatusLike, shift: ShiftStatusLike) => {
    const k = wishStateOf(wish, shift);
    const d = wishStateDetailOf(k, shift, castConfirm);
    return (
      <span style={{ color: WISH_STATE_COLOR[k], fontWeight: 700, fontSize: 12 }} data-state={k}>
        {WISH_STATE_LABEL[k]}{d ? <span style={{ fontWeight: 400, color: "var(--sub)" }}>（{d}）</span> : null}
      </span>
    );
  };

  return (
    <div>
      <div style={{ margin: "2px 0 14px" }}>
        <h1 style={t.pheadH1}>{text.title}</h1>
        <p style={t.pheadP}>{text.sub}</p>
      </div>

      {normLines.length > 0 && (
        <section className="nox-cardtop" style={t.card} data-wish-days-norm="1">
          {normLines.map((x) => <div key={x.label}><b style={{ fontSize: 12.5 }}>{x.label}</b><DaysNormNote norm={x.line} /></div>)}
        </section>
      )}
      {storeDecides ? (/* ★0191 ★4: 店が決める＝提出フォームを出さない */
        <section className="nox-cardtop" style={t.card} data-wish-store-decides="1">
          <h2 style={title}>シフトは店が決めます</h2>
          <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>{STORE_DECIDES_NOTE}</p>
        </section>
      ) : (
      <section className="nox-cardtop" style={t.card}>
        <h2 style={title}>{text.submitHeading}</h2>
        <p style={{ fontSize: 12, color: "var(--sub)", margin: "0 0 10px" }}>{text.note}</p>
        <WishForm mode={mode} />
      </section>
      )}

      <section className="nox-cardtop" style={t.card}>
        <h2 style={title}>提出済み</h2>
        {(wishes ?? []).length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>提出なし</p>}
        <ul style={{ listStyle: "none", padding: 0, fontSize: 13, margin: 0 }}>
          {(wishes ?? []).map((w) => (
            <li
              key={w.id as string}
              className="nox-listrow" style={{ gap: 12, padding: "8px 0" }}
            >
              <span style={t.num}>{w.date}</span>
              <span style={t.num}>{wishRowLabelOf({ kind: w.kind as string | null, start_hm: w.start_hm as string | null, end_hm: w.end_hm as string | null })}</span>
              {stateCell(w.status as WishStatusLike, shiftByWish.get(w.id as string)?.status ?? null)}
              {w.status === "pending" && <WithdrawButton wishId={w.id as string} />}
            </li>
          ))}
        </ul>
      </section>

      {/* ★裁定345: /mine 直近のシフト「すべて見る」の先＝今日以降の自分のシフト全件（語は同じ 4 段） */}
      <section id="shifts" className="nox-cardtop" style={t.card}>
        <h2 style={title}>今日以降のシフト</h2>
        {shifts.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>予定なし</p>}
        <ul style={{ listStyle: "none", padding: 0, fontSize: 13, margin: 0 }}>
          {shifts.map((s) => (
            <li key={s.id} className="nox-listrow" style={{ gap: 12, padding: "8px 0" }}>
              <span style={t.num}>{s.date}</span>
              <span style={t.num}>{fmtWin(s.start_hm, s.end_hm)}</span>
              {stateCell(s.wish_id ? "accepted" : null, s.status)}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
