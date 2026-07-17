"use client";

// B-5 スライスB（mig0033）: 定休日=UI 一次ブロック＋RPC 二層目 'closed day'（段26 実測）／
//   営業時間外=黄警告のみで登録可（非対称・段26-2/26-5）／未設定 dow=判定なし（後方互換）。
//   ★シフトの営業日判定は shiftHoursStatus（date 直＝cutoff 変換なし・mig0008 決定3）。
//   予約用 businessHoursStatus（cutoff 変換）をシフトに使うと深夜帯で1日ズレるため使用禁止。
//   希望の採否は「採用のみ定休日ブロック・見送りは定休日でも可」の非対称を UI に出す（裁定B-3）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { bizDateOf } from "@/lib/nox/biz-date";
import { fmtWin } from "@/lib/nox/shift-time";
import { shiftHoursStatus, fmtHoursLabel, type BusinessHourRow } from "@/lib/nox/business-hours";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import IncentivePanel from "./incentive-panel";

type Cast = { id: string; name: string };
type Wish = { id: string; cast_id: string; date: string; start_hm: string; end_hm: string; status: string };
type Shift = { id: string; cast_id: string; date: string; start_hm: string; end_hm: string; status: string };
type Att = { cast_id: string; status: string; eta: string | null };
type Need = { dow: number; required: number };

const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const ATT_OPTIONS = [
  ["", "—"], ["shukkin", "出勤"], ["dohan", "同伴"], ["late", "遅刻"], ["off", "休み"], ["absent", "当欠"],
] as const;

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", borderRadius: 9 };
const btnDark: React.CSSProperties = { ...t.btnGold, padding: "8px 16px" };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const secTitle: React.CSSProperties = { fontSize: 13.5, fontWeight: 800, color: "var(--champ)", margin: "0 0 11px" };

// RPC エラーの日本語化（シフト系・B-5②）
function rpcErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("closed day")) return "選択された日は定休日です";
  if (msg.includes("bad time")) return "時刻は 開始 00:00〜23:59・終了 00:00〜47:59 で入力してください";
  if (msg.includes("already decided")) return "この希望は処理済みです";
  if (msg.includes("inactive cast")) return "このキャストは退店済みです";
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}

export default function ShiftBoard({ storeId, casts, isManagerUp }: { storeId: string; casts: Cast[]; isManagerUp: boolean }) {
  const supabase = createClient();
  const bizToday = bizDateOf(new Date().toISOString(), "06:00");
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [needs, setNeeds] = useState<Need[]>([]);
  const [attDate, setAttDate] = useState(bizToday);
  const [atts, setAtts] = useState<Att[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  // B-5②: 営業時間マスタ（行なし=未設定・判定なし。cast 0行だが本画面は staff 以上のみ到達）
  const [bhRows, setBhRows] = useState<BusinessHourRow[]>([]);
  // 新規シフトフォーム（manager）
  const [fCast, setFCast] = useState("");
  const [fDate, setFDate] = useState(bizToday);
  const [fStart, setFStart] = useState("20:00");
  const [fEnd, setFEnd] = useState("26:00");
  const [fStatus, setFStatus] = useState("planned");

  const castName = (id: string) => casts.find((c) => c.id === id)?.name ?? "?";

  const load = useCallback(async () => {
    const { data: ws } = await supabase
      .from("shift_wishes").select("id, cast_id, date, start_hm, end_hm, status")
      .eq("status", "pending").order("date");
    const { data: ss } = await supabase
      .from("shifts").select("id, cast_id, date, start_hm, end_hm, status")
      .gte("date", bizToday).order("date").limit(30);
    const { data: ns } = await supabase.from("staffing_needs").select("dow, required").order("dow");
    // B-5②: 営業時間（シフトは date 直判定＝cutoff 不要なので stores.settings_json は読まない）
    const { data: bh } = await supabase.from("store_business_hours")
      .select("dow, is_closed, open_hm, close_hm").eq("store_id", storeId);
    setWishes((ws ?? []) as Wish[]);
    setShifts((ss ?? []) as Shift[]);
    setNeeds((ns ?? []) as Need[]);
    setBhRows((bh ?? []) as BusinessHourRow[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bizToday]);

  const loadAtt = useCallback(async (d: string) => {
    const { data } = await supabase.from("attendance").select("cast_id, status, eta").eq("date", d);
    setAtts((data ?? []) as Att[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadAtt(attDate); }, [attDate, loadAtt]);

  async function decide(wishId: string, accept: boolean) {
    setMsg(null);
    const { error } = await supabase.rpc("shift_wish_decide", { p_wish_id: wishId, p_accept: accept });
    // B-5②: 採用は RPC 二層目でも closed day 拒否（raise=ロールバックで wish は pending 維持・見送りは可＝非対称）
    setMsg(error
      ? (accept && error.message.includes("closed day")
          ? "この希望日は定休日に設定されています。採用できません（見送りは可能です）"
          : rpcErrJa(error.message))
      : accept ? "採用しシフト案に追加しました" : "見送りました");
    await load();
  }

  async function addShift() {
    if (!fCast) return;
    setMsg(null);
    // B-5②: 定休日は送信もしない（ボタン無効の保険・二層目は RPC 'closed day'＝段26-4 実測）
    if (shiftHoursStatus(fDate, fStart, fEnd, bhRows).status === "closed") { setMsg("選択された日は定休日です"); return; }
    const { error } = await supabase.rpc("shift_set", {
      p_id: null, p_cast_id: fCast, p_date: fDate, p_start_hm: fStart, p_end_hm: fEnd, p_status: fStatus,
    });
    setMsg(error ? `シフトの登録に失敗: ${rpcErrJa(error.message)}` : "シフトを登録しました");
    await load();
  }

  async function confirmShift(s: Shift) {
    setMsg(null);
    // B-5②: update 経路（date 不変でも RPC が p_date を再検証＝作成後に定休日化された場合はここで拒否される）
    const { error } = await supabase.rpc("shift_set", {
      p_id: s.id, p_cast_id: s.cast_id, p_date: s.date, p_start_hm: s.start_hm, p_end_hm: s.end_hm, p_status: "confirmed",
    });
    setMsg(error ? `確定に失敗: ${rpcErrJa(error.message)}` : "確定しました");
    await load();
  }

  async function setAtt(castId: string, status: string) {
    if (!status) return;
    setMsg(null);
    const { error } = await supabase.rpc("attendance_set", {
      p_cast_id: castId, p_date: attDate, p_status: status, p_eta: null, p_reason: null,
    });
    setMsg(error ? error.message : null);
    await loadAtt(attDate);
  }

  async function saveNeed(dow: number, required: number) {
    setMsg(null);
    const { error } = await supabase.rpc("set_staffing_need", { p_store_id: storeId, p_dow: dow, p_required: required });
    setMsg(error ? error.message : null);
    await load();
  }

  // B-5②: 新規シフトフォームの営業時間判定（date 直＝cutoff 変換なし・予約用とは別関数）
  const fShiftHours = shiftHoursStatus(fDate, fStart, fEnd, bhRows);
  const fClosedDay = fShiftHours.status === "closed";
  const closedOf = (date: string, startHm: string, endHm: string) =>
    shiftHoursStatus(date, startHm, endHm, bhRows).status === "closed";

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={t.pheadH1}>シフト管理</h1>
      <Toast msg={msg} />

      {isManagerUp && <IncentivePanel storeId={storeId} />}

      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>希望（審査待ち）</h2>
        {wishes.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>なし</p>}
        {wishes.map((w) => {
          // B-5②: 提出後に定休日設定された wish＝採用のみブロック・見送りは可（非対称・RPC 二層目は段26-7 実測）
          const wClosed = closedOf(w.date, w.start_hm, w.end_hm);
          return (
            <div key={w.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
              <span style={{ ...t.num, width: 90 }}>{w.date}</span>
              <span style={{ width: 110 }}>{castName(w.cast_id)}</span>
              <span style={t.num}>{fmtWin(w.start_hm, w.end_hm)}</span>
              {wClosed && (
                <span style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 700 }}>定休日（採用不可・見送り可）</span>
              )}
              {/* 採否は manager 以上のみ（RPC 側も owner/manager 強制＝二重） */}
              {isManagerUp && (
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button
                    style={{ ...btnDark, opacity: wClosed ? 0.45 : 1 }} disabled={wClosed}
                    title={wClosed ? "この希望日は定休日に設定されています（見送りは可能）" : undefined}
                    onClick={() => decide(w.id, true)}
                  >採用</button>
                  <button style={btnLight} onClick={() => decide(w.id, false)}>見送り</button>
                </span>
              )}
            </div>
          );
        })}
      </section>

      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>確定シフト（今後）</h2>
        {isManagerUp && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select value={fCast} onChange={(e) => setFCast(e.target.value)} style={input}>
                <option value="">キャスト</option>
                {casts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} style={input} />
              <input value={fStart} onChange={(e) => setFStart(e.target.value)} style={{ ...input, width: 70 }} />
              <span style={{ fontSize: 13, color: "var(--sub)" }}>〜</span>
              <input value={fEnd} onChange={(e) => setFEnd(e.target.value)} style={{ ...input, width: 70 }} />
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={input}>
                <option value="planned">予定</option>
                <option value="confirmed">確定</option>
              </select>
              <button style={{ ...btnDark, opacity: fClosedDay ? 0.45 : 1 }} disabled={fClosedDay} onClick={addShift}>登録</button>
            </div>
            {/* B-5②: 定休日=赤（一次ブロック）／時間外=黄（警告のみ・登録可）／営業時間内・未設定=表示なし */}
            {fClosedDay && (
              <p style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 700, margin: "6px 0 0" }}>
                この日は定休日です（シフトを登録できません）
              </p>
            )}
            {fShiftHours.status === "outside" && fShiftHours.row && (
              <p style={{ fontSize: 11.5, color: "var(--gold2)", fontWeight: 700, margin: "6px 0 0" }}>
                営業時間外です（営業 {fmtHoursLabel(fShiftHours.row)}）
              </p>
            )}
          </div>
        )}
        {shifts.length === 0 && <p style={{ fontSize: 13, color: "var(--sub)" }}>なし</p>}
        {shifts.map((s) => {
          // B-5②: 作成後に定休日化された日のシフト＝確定（update 経路）を事前ブロック（二層目は RPC・段26-5 実測）
          const sClosed = closedOf(s.date, s.start_hm, s.end_hm);
          return (
            <div key={s.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
              <span style={{ ...t.num, width: 90 }}>{s.date}</span>
              <span style={{ width: 110 }}>{castName(s.cast_id)}</span>
              <span style={t.num}>{fmtWin(s.start_hm, s.end_hm)}</span>
              <span style={{ color: s.status === "confirmed" ? "var(--ok)" : "var(--champ)" }}>
                {s.status === "confirmed" ? "確定" : "予定"}
              </span>
              {sClosed && <span style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 700 }}>定休日</span>}
              {isManagerUp && s.status === "planned" && (
                <button
                  style={{ ...btnLight, marginLeft: "auto", opacity: sClosed ? 0.45 : 1 }} disabled={sClosed}
                  title={sClosed ? "この日は定休日に設定されています（確定できません）" : undefined}
                  onClick={() => confirmShift(s)}
                >確定にする</button>
              )}
            </div>
          );
        })}
      </section>

      <section className="nox-cardtop" style={card}>
        <h2 style={secTitle}>
          出勤板（staff も操作可＝attendance のみ開放・台帳 #24）
        </h2>
        <input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} style={{ ...input, marginBottom: 8 }} />
        {casts.map((c) => {
          const a = atts.find((x) => x.cast_id === c.id);
          return (
            <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0", fontSize: 13 }}>
              <span style={{ width: 110 }}>{c.name}</span>
              <select value={a?.status ?? ""} onChange={(e) => setAtt(c.id, e.target.value)} style={input}>
                {ATT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {a?.eta && <span style={{ ...t.num, color: "var(--sub)" }}>見込み {a.eta}</span>}
            </div>
          );
        })}
      </section>

      {isManagerUp && (
        <section className="nox-cardtop" style={card}>
          <h2 style={secTitle}>必要人数（曜日別）</h2>
          <div style={{ display: "flex", gap: 10 }}>
            {DOW.map((label, dow) => {
              const n = needs.find((x) => x.dow === dow);
              return (
                <label key={dow} style={{ fontSize: 12, textAlign: "center", color: "var(--sub)" }}>
                  {label}
                  <input
                    type="number" min={0} defaultValue={n?.required ?? 0}
                    onBlur={(e) => saveNeed(dow, Number(e.target.value))}
                    style={{ ...input, width: 52, display: "block", marginTop: 4 }}
                  />
                </label>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: "var(--sub)" }}>変更はフォーカスアウトで保存</p>
        </section>
      )}
    </div>
  );
}
