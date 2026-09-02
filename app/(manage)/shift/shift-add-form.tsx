"use client";

// シフト作成モーダル（SC-1・裁定42 → ★0125 裁定112 で v6 へ拡張）。
// 構造正本＝mock/pages-2026-09/nox-shift-v6.html（2ペイン: 左=キャスト選択／右=月カレンダー）。
// 挙動正本＝本体 RPC（mig0125 意味論・本体が正・モックが従）。
//
// ★裁定112 の写像:
//  - 左ペイン＝CastPicker 維持（裁定108・select 禁止）。キャスト切替で選択はリセット。
//  - セル状態: 登録済み（時間付き・クリック=編集モード＝既存 shift_set update 経路）／
//    希望（時間表示・選択で希望時間を初期値へ）／不可（cast_unavailable_list・原則クリック不可＋
//    「それでも登録」=理由入力→override_reason）／定休日（休バッジ・操作不可）／
//    競合（選択中×既存あり×非編集＝防御表示・残存中は保存不可。通常は既存クリック=編集で到達しない）
//  - 保存: 新規×planned＝shift_bulk_set_daily 1発（skipped はトースト表示）・
//    新規×planned 以外＝shift_set 個別（今日タブの confirmed 直登録＝裁定42 を維持）・
//    希望日＝shift_wish_decide(accept)→時刻変更ありのみ shift_set 更新の2段（裁定112-G'・
//    2段目失敗は「希望時刻のまま登録済み」を明示）・編集＝shift_set update。
//  - LAST（裁定112-D）: 希望 end_hm＝その曜日の閉店時刻なら「〜LAST」表示（表示写像のみ・器は hm）。
//  - 日跨ぎは「翌02:00」表示（器は 26:00 型のまま＝表示写像のみ）。
//  - 不可の登録 UI（★モック不在＝申告済みの配置判断）: 日詳細バーに「出勤不可にする／解除」
//    （cast_unavailable_set / remove・owner/manager）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Modal from "@/components/ui/modal";
import SegSelect from "@/components/ui/seg-select";
import CastPicker from "@/components/nox/cast-picker";
import { type BusinessHourRow } from "@/lib/nox/business-hours";
import { hm2min } from "@/lib/nox/shift-time";

type Cast = { id: string; name: string };
type ExistRow = { id: string; date: string; start_hm: string; end_hm: string; status: string };
type WishRow = { id: string; date: string; start_hm: string; end_hm: string };
type SelEntry = {
  start: string; end: string;
  src: "new" | "wish" | "edit";
  wishId?: string; shiftId?: string; origStatus?: string;
  wishStart?: string; wishEnd?: string;
  override?: string; // 不可日を押し切る理由（override_reason）
};

const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const secTitle: React.CSSProperties = t.cardTitle;
const DOW = ["日", "月", "火", "水", "木", "金", "土"];

// 既定の勤務時間（営業時間が引けないときのフォールバック＝従来のハードコード値）
const FALLBACK_START = "20:00";
const FALLBACK_END = "26:00";

/** その日付の曜日の営業時間を [start, end] で返す。引けなければ null。 */
function hoursOf(date: string, bhRows: BusinessHourRow[]): [string, string] | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const row = bhRows.find((r) => r.dow === dow);
  if (!row || row.is_closed || !row.open_hm || !row.close_hm) return null;
  return [row.open_hm, row.close_hm];
}

/** 日跨ぎ hm の表示写像（26:00 → 翌02:00）。器は hm のまま＝表示のみ。 */
function fmtNext(hm: string): string {
  const h = Number(hm.slice(0, 2));
  return h >= 24 ? `翌${String(h - 24).padStart(2, "0")}:${hm.slice(3)}` : hm;
}

// RPC エラーの日本語化（shift_set / bulk_daily / unavailable 系）
function rpcErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("closed day")) return "選択された日は定休日です";
  if (msg.includes("unavailable")) return "出勤不可の日です（登録するには理由が必要です）";
  if (msg.includes("bad time")) return "時刻は 開始 00:00〜23:59・終了 00:00〜47:59 で入力してください";
  if (msg.includes("bad status")) return "状態の指定が不正です";
  if (msg.includes("dup date")) return "同じ日付が2回含まれています";
  if (msg.includes("too many dates")) return "一度に登録できるのは62日までです";
  if (msg.includes("duplicate")) return "この日にはすでにシフトがあります（1日1枠）";
  if (msg.includes("already decided")) return "この希望はすでに処理済みです";
  if (msg.includes("inactive cast")) return "このキャストは退店済みです";
  if (msg.includes("not found")) return "対象が見つかりません";
  if (msg.includes("bad range")) return "取得範囲が不正です";
  if (msg.includes("billing locked")) return "現在このお店では操作できません（責任者にご確認ください）";
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}
const SKIP_JA: Record<string, string> = { closed: "定休日", duplicate: "既に登録あり", unavailable: "出勤不可（理由未入力）" };

export default function ShiftAddForm({
  casts, photoUrls, initialCast, bhRows, initialDate, initialStatus, open, onClose, onSaved,
}: {
  /** 左ペイン CastPicker の母集団（裁定108: select 禁止＝Picker 維持） */
  casts: Cast[];
  /** ★#51: 署名 URL の Map（casts-board と同一の解決＝親が発行・CastAvatar が onError で頭文字へ） */
  photoUrls?: Map<string, string>;
  /** 開いたときに選択済みにするキャスト（今日タブの行「＋」直開き等・null=左ペインで選ぶ） */
  initialCast: Cast | null;
  bhRows: BusinessHourRow[];
  /** 開いたときの表示月の基準日（今日タブ＝営業日の今日／カレンダー＝選択日） */
  initialDate: string;
  /** 新規日の状態既定。今日タブ＝confirmed（当日その場で足すのは「もう入る人」・裁定42） */
  initialStatus: string;
  open: boolean;
  onClose: () => void;
  /** 登録が成功したときだけ呼ばれる（親が load() を回す） */
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [selCast, setSelCast] = useState<Cast | null>(initialCast);
  const [monthStr, setMonthStr] = useState(initialDate.slice(0, 7)); // 'YYYY-MM'
  const [fStatus, setFStatus] = useState(initialStatus);
  const [sel, setSel] = useState<Record<string, SelEntry>>({});
  const [focusDay, setFocusDay] = useState<string>("");
  const [ovReason, setOvReason] = useState("");
  const [bulkStart, setBulkStart] = useState(FALLBACK_START);
  const [bulkEnd, setBulkEnd] = useState(FALLBACK_END);
  const [msg, setMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string[]>([]); // skipped / 2段目結果の明細
  const [busy, setBusy] = useState(false);
  // キャスト×月のデータ（クリックのたびに読まない＝開閉・切替・保存後に一括取得）
  const [existing, setExisting] = useState<ExistRow[]>([]);
  const [wishes, setWishes] = useState<WishRow[]>([]);
  const [unavail, setUnavail] = useState<Map<string, string | null>>(new Map());

  const monthDays = (() => {
    const [y, m] = monthStr.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return Array.from({ length: last }, (_, i) => `${monthStr}-${String(i + 1).padStart(2, "0")}`);
  })();
  const firstDow = new Date(Date.UTC(Number(monthStr.slice(0, 4)), Number(monthStr.slice(5, 7)) - 1, 1)).getUTCDay();
  const dowOf = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
  const isClosed = (ymd: string) => bhRows.find((r) => r.dow === dowOf(ymd))?.is_closed === true;
  const existOf = (ymd: string) => existing.find((e) => e.date === ymd);
  const wishOf = (ymd: string) => wishes.find((w) => w.date === ymd);

  // ★裁定112-D: 希望の表示写像＝end が閉店時刻と一致なら「〜LAST」（器に LAST は無い）
  const wishLabel = (w: WishRow) => {
    const row = bhRows.find((r) => r.dow === dowOf(w.date));
    return row && !row.is_closed && row.close_hm === w.end_hm
      ? `${w.start_hm}〜LAST` : `${w.start_hm}〜${fmtNext(w.end_hm)}`;
  };

  const loadCastMonth = useCallback(async (castId: string, m: string) => {
    const from = `${m}-01`;
    const [y, mo] = m.split("-").map(Number);
    const to = `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, "0")}`;
    const [sRes, wRes, uRes] = await Promise.all([
      supabase.from("shifts").select("id, date, start_hm, end_hm, status")
        .eq("cast_id", castId).gte("date", from).lte("date", to).order("date"),
      supabase.from("shift_wishes").select("id, date, start_hm, end_hm")
        .eq("cast_id", castId).eq("status", "pending").gte("date", from).lte("date", to).order("date"),
      supabase.rpc("cast_unavailable_list", { p_cast_id: castId, p_from: from, p_to: to }),
    ]);
    setExisting((sRes.data ?? []) as ExistRow[]);
    setWishes((wRes.data ?? []) as WishRow[]);
    const um = new Map<string, string | null>();
    for (const r of ((uRes.data ?? []) as { date: string; reason: string | null }[])) um.set(r.date, r.reason);
    setUnavail(um);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 開いた瞬間＝初期化（キャスト・月・状態・選択リセット）
  useEffect(() => {
    if (!open) return;
    setSelCast(initialCast);
    setMonthStr(initialDate.slice(0, 7));
    setFStatus(initialStatus);
    setSel({}); setFocusDay(""); setOvReason(""); setMsg(null); setToast([]);
    const h = hoursOf(initialDate, bhRows);
    setBulkStart(h ? h[0] : FALLBACK_START);
    setBulkEnd(h ? h[1] : FALLBACK_END);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCast, initialDate, initialStatus]);

  // キャスト・月が決まるたびにデータ取得
  useEffect(() => {
    if (!open || !selCast) return;
    void loadCastMonth(selCast.id, monthStr);
  }, [open, selCast, monthStr, loadCastMonth]);

  const moveMonth = (d: number) => {
    const [y, m] = monthStr.split("-").map(Number);
    const nd = new Date(Date.UTC(y, m - 1 + d, 1));
    setMonthStr(`${nd.getUTCFullYear()}-${String(nd.getUTCMonth() + 1).padStart(2, "0")}`);
    setSel({}); setFocusDay(""); // 月替え＝選択リセット（別月の混在保存を作らない）
  };

  /** 1日ぶんの選択エントリを作る（既存=編集モード・希望=希望時間・他=営業時間既定） */
  const entryFor = (ymd: string, override?: string): SelEntry => {
    const ex = existOf(ymd);
    if (ex) return { start: ex.start_hm, end: ex.end_hm, src: "edit", shiftId: ex.id, origStatus: ex.status };
    const w = wishOf(ymd);
    if (w) return { start: w.start_hm, end: w.end_hm, src: "wish", wishId: w.id, wishStart: w.start_hm, wishEnd: w.end_hm };
    const h = hoursOf(ymd, bhRows);
    return { start: h ? h[0] : FALLBACK_START, end: h ? h[1] : FALLBACK_END, src: "new", override };
  };

  const clickDay = (ymd: string) => {
    setFocusDay(ymd); setOvReason("");
    if (isClosed(ymd)) return; // 定休日=操作不可（詳細バーには出す）
    if (sel[ymd]) { setSel((p) => { const n = { ...p }; delete n[ymd]; return n; }); return; }
    // ★不可日は原則クリック不可＝「それでも登録」（詳細バーの理由入力）だけが入口
    if (unavail.has(ymd) && !existOf(ymd)) return;
    setSel((p) => ({ ...p, [ymd]: entryFor(ymd) }));
  };

  /** 一括選択（毎週◯・不可以外全選択）。既存日は編集モードで拾う（モック addDay と同型）。 */
  const selectBulk = (dows: number[] | null) => {
    setSel((p) => {
      const n = { ...p };
      for (const ymd of monthDays) {
        if (n[ymd]) continue;
        if (isClosed(ymd)) continue;
        if (unavail.has(ymd) && !existOf(ymd)) continue; // 不可は一括では拾わない（個別に理由）
        if (dows && !dows.includes(dowOf(ymd))) continue;
        n[ymd] = entryFor(ymd);
      }
      return n;
    });
  };

  const setDayTime = (ymd: string, k: "start" | "end", v: string) =>
    setSel((p) => (p[ymd] ? { ...p, [ymd]: { ...p[ymd], [k]: v } } : p));
  const applyAll = () =>
    setSel((p) => Object.fromEntries(Object.entries(p).map(([d, e]) => [d, { ...e, start: bulkStart, end: bulkEnd }])));

  // 防御: 選択中×既存あり×非編集＝競合（通常到達しない・保存不可）
  const conflicts = Object.keys(sel).filter((d) => sel[d].src === "new" && !!existOf(d));
  const selCount = Object.keys(sel).length;

  async function save(next: boolean) {
    if (!selCast || busy || selCount === 0 || conflicts.length > 0) return;
    setBusy(true); setMsg(null); setToast([]);
    const notes: string[] = [];
    let okCount = 0;
    let hardErr: string | null = null;

    const entries = Object.entries(sel).sort(([a], [b]) => (a < b ? -1 : 1));
    const newDays = entries.filter(([, e]) => e.src === "new");
    const wishDays = entries.filter(([, e]) => e.src === "wish");
    const editDays = entries.filter(([, e]) => e.src === "edit");

    // ① 新規: planned は bulk_daily 1発（裁定112-C）・planned 以外は shift_set 個別（裁定42 の confirmed 直登録維持）
    if (newDays.length > 0 && fStatus === "planned") {
      const { data, error } = await supabase.rpc("shift_bulk_set_daily", {
        p_cast_id: selCast.id,
        p_items: newDays.map(([d, e]) => ({
          date: d, start_hm: e.start, end_hm: e.end,
          ...(e.override ? { override_reason: e.override } : {}),
        })),
      });
      if (error) { hardErr = `一括登録に失敗: ${rpcErrJa(error.message)}`; }
      else {
        const r = data as { inserted: number; skipped: { date: string; reason: string }[] };
        okCount += r.inserted;
        for (const s of r.skipped) notes.push(`${s.date}: ${SKIP_JA[s.reason] ?? s.reason}のため登録しませんでした`);
      }
    } else {
      for (const [d, e] of newDays) {
        const { error } = await supabase.rpc("shift_set", {
          p_id: null, p_cast_id: selCast.id, p_date: d, p_start_hm: e.start, p_end_hm: e.end,
          p_status: fStatus, p_override_reason: e.override ?? null,
        });
        if (error) notes.push(`${d}: ${rpcErrJa(error.message)}`);
        else okCount += 1;
      }
    }

    // ② 希望日: accept →（時刻変更ありのみ）shift_set 更新の2段（裁定112-G'）
    for (const [d, e] of wishDays) {
      const { data: sid, error } = await supabase.rpc("shift_wish_decide", { p_wish_id: e.wishId, p_accept: true });
      if (error) { notes.push(`${d}: 希望の承認に失敗（${rpcErrJa(error.message)}）`); continue; }
      okCount += 1;
      if (e.start !== e.wishStart || e.end !== e.wishEnd) {
        const { error: e2 } = await supabase.rpc("shift_set", {
          p_id: sid, p_cast_id: selCast.id, p_date: d, p_start_hm: e.start, p_end_hm: e.end, p_status: "planned",
        });
        if (e2) notes.push(`${d}: 時刻の変更に失敗＝希望時刻（${e.wishStart}〜${fmtNext(e.wishEnd ?? "")}）のまま登録済みです`);
      }
    }

    // ③ 編集: 時刻が変わった既存だけ update（status 据え置き）
    for (const [d, e] of editDays) {
      const ex = existOf(d);
      if (!ex || (ex.start_hm === e.start && ex.end_hm === e.end)) continue;
      const { error } = await supabase.rpc("shift_set", {
        p_id: e.shiftId, p_cast_id: selCast.id, p_date: d, p_start_hm: e.start, p_end_hm: e.end,
        p_status: e.origStatus ?? "planned",
      });
      if (error) notes.push(`${d}: 変更に失敗（${rpcErrJa(error.message)}）`);
      else okCount += 1;
    }

    setBusy(false);
    setToast(notes);
    if (hardErr) { setMsg(hardErr); return; }
    if (okCount > 0) onSaved();
    setMsg(okCount > 0 ? `${okCount}件を保存しました${notes.length ? "（一部は下記のとおり）" : ""}` : notes.length ? "保存できた日がありません（下記）" : null);
    setSel({}); setFocusDay("");
    if (selCast) await loadCastMonth(selCast.id, monthStr);
    if (!next && okCount > 0 && notes.length === 0) onClose();
    // next=true は選択リセットのみ＝左ペインで次のキャストを選ぶ（裁定112-H）
  }

  // 不可の登録/解除（★配置はモック不在＝日詳細バーに置く申告済み判断・owner/manager）
  async function setUnavailable(ymd: string) {
    if (!selCast) return;
    const reason = window.prompt(`${ymd} を「出勤不可」にします。理由（任意・200字まで）`, "");
    if (reason === null) return;
    const { error } = await supabase.rpc("cast_unavailable_set", {
      p_cast_id: selCast.id, p_date: ymd, p_reason: reason.trim() === "" ? null : reason.trim(),
    });
    setMsg(error ? `出勤不可の登録に失敗: ${rpcErrJa(error.message)}` : `${ymd} を出勤不可にしました`);
    await loadCastMonth(selCast.id, monthStr);
  }
  async function removeUnavailable(ymd: string) {
    if (!selCast) return;
    const { error } = await supabase.rpc("cast_unavailable_remove", { p_cast_id: selCast.id, p_date: ymd });
    setMsg(error ? `解除に失敗: ${rpcErrJa(error.message)}` : `${ymd} の出勤不可を解除しました`);
    await loadCastMonth(selCast.id, monthStr);
  }

  if (!open) return null;
  const [my, mm] = [monthStr.slice(0, 4), monthStr.slice(5, 7)];
  const focusEx = focusDay ? existOf(focusDay) : undefined;
  const focusWish = focusDay ? wishOf(focusDay) : undefined;
  const focusUnavail = focusDay ? unavail.has(focusDay) : false;

  return (
    <Modal onClose={onClose} maxWidth={980} scroll>
      <div className="nox-modalhead">
        <h3 style={{ ...secTitle, margin: 0 }}>シフトを追加</h3>
        <button type="button" style={{ ...btnLight, padding: "2px 10px" }} onClick={onClose}>×</button>
      </div>
      <div className="nox-modalbody">
        <div style={{ display: "grid", gridTemplateColumns: "230px minmax(0,1fr)", gap: 12 }}>
          {/* ── 左ペイン: キャスト選択（CastPicker 維持＝裁定108）── */}
          <div className="nox-inset" style={{ padding: 10, alignSelf: "start" }}>
            <b style={{ fontSize: 12 }}>1. キャスト</b>
            <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "3px 0 8px" }}>
              シフトを作るキャストを選択（切替で選択中の日はリセット）
            </p>
            <CastPicker
              casts={casts} photoUrls={photoUrls} dense
              selectedIds={new Set(selCast ? [selCast.id] : [])}
              onPick={(id) => {
                const c = casts.find((x) => x.id === id);
                if (!c) return;
                setSelCast(c); setSel({}); setFocusDay(""); setToast([]); setMsg(null);
              }}
            />
          </div>

          {/* ── 右ペイン: 月カレンダー＋日別時間 ── */}
          <div>
            {!selCast && <p style={{ fontSize: 13, color: "var(--sub)" }}>左でキャストを選択してください。</p>}
            {selCast && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <b style={{ fontSize: 13 }}>2. <span style={{ color: "var(--champ)" }}>{selCast.name}</span> の出勤日</b>
                  <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <button style={btnLight} onClick={() => moveMonth(-1)}>‹</button>
                    <b className="num" style={{ fontSize: 13 }}>{my}年{mm}月</b>
                    <button style={btnLight} onClick={() => moveMonth(1)}>›</button>
                  </span>
                </div>
                {/* 繰り返し選択ツール（v6 repeat-tools） */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
                  <button style={btnLight} onClick={() => selectBulk(null)}>出勤不可以外を全部選択</button>
                  <button style={btnLight} onClick={() => selectBulk([5])}>毎週 金を選択</button>
                  <button style={btnLight} onClick={() => selectBulk([6])}>毎週 土を選択</button>
                  <button style={btnLight} onClick={() => selectBulk([5, 6])}>毎週 金・土を選択</button>
                  <button style={btnLight} onClick={() => { setSel({}); setFocusDay(""); }}>選択をすべて解除</button>
                </div>
                <div className="nox-calgrid">
                  {DOW.map((d) => <div key={d} className="nox-calh">{d}</div>)}
                  {Array.from({ length: firstDow }, (_, i) => <div key={`pad${i}`} />)}
                  {monthDays.map((ymd) => {
                    const e = sel[ymd];
                    const ex = existOf(ymd);
                    const w = wishOf(ymd);
                    const closed = isClosed(ymd);
                    const un = unavail.has(ymd);
                    const conflict = e?.src === "new" && !!ex;
                    const style: React.CSSProperties = {
                      ...(closed ? { background: "var(--line)", opacity: 0.55, cursor: "not-allowed" } : {}),
                      ...(un && !closed ? { background: "rgba(216,108,100,.07)", borderColor: "rgba(216,108,100,.35)" } : {}),
                      ...(e ? { outline: "2px solid var(--blue)", outlineOffset: -2 } : {}),
                      ...(conflict ? { outline: "2px solid var(--bad)", outlineOffset: -2 } : {}),
                    };
                    return (
                      <button key={ymd} type="button"
                        className={["nox-cald", ymd === focusDay ? "sel" : ""].filter(Boolean).join(" ")}
                        style={style} onClick={() => clickDay(ymd)}
                        title={closed ? "定休日" : un ? `出勤不可${unavail.get(ymd) ? `（${unavail.get(ymd)}）` : ""}` : undefined}>
                        <span className="nox-cald-n num">{Number(ymd.slice(8))}</span>
                        {closed && <span style={{ fontSize: 8.5, color: "var(--sub)" }}>休</span>}
                        {!closed && ex && (
                          <span className="num" style={{ fontSize: 8.5, color: e?.src === "edit" ? "var(--gold2)" : "var(--ok)" }}>
                            {ex.start_hm}〜{fmtNext(ex.end_hm)}
                          </span>
                        )}
                        {!closed && !ex && w && (
                          <span className="num" style={{ fontSize: 8.5, color: "var(--blue)" }}>希 {wishLabel(w)}</span>
                        )}
                        {!closed && un && !ex && <span style={{ fontSize: 8.5, color: "var(--bad)" }}>不可</span>}
                      </button>
                    );
                  })}
                </div>
                <p style={{ fontSize: 10, color: "var(--v2-muted)", margin: "6px 0 0", lineHeight: 1.7 }}>
                  <span style={{ color: "var(--blue)" }}>■ 今回選択</span>・
                  <span style={{ color: "var(--ok)" }}>● 登録済み（クリックで時刻編集）</span>・
                  <span style={{ color: "var(--blue)" }}>● 出勤希望（選択で希望時間から）</span>・
                  <span style={{ color: "var(--bad)" }}>● 出勤不可（「それでも登録」で理由必須）</span>・
                  ■ 定休日（操作不可）・<span style={{ color: "var(--bad)" }}>枠=時間競合（残っていると保存できません）</span>
                </p>

                {/* 日詳細バー（v6 detailbar）＋不可 override／不可の登録・解除 */}
                {focusDay && (
                  <div className="nox-inset" style={{ padding: "9px 12px", marginTop: 8 }}>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5, alignItems: "center" }}>
                      <b className="num">{focusDay}（{DOW[dowOf(focusDay)]}）</b>
                      <span>希望: <b className="num">{focusWish ? wishLabel(focusWish) : "—"}</b></span>
                      <span>登録済み: <b className="num">{focusEx ? `${focusEx.start_hm}〜${fmtNext(focusEx.end_hm)}` : "—"}</b></span>
                      {isClosed(focusDay) && <span style={{ color: "var(--sub)", fontWeight: 700 }}>定休日（操作不可）</span>}
                      {focusUnavail && (
                        <span style={{ color: "var(--bad)", fontWeight: 700 }}>
                          出勤不可{unavail.get(focusDay) ? `（${unavail.get(focusDay)}）` : ""}
                        </span>
                      )}
                      {/* ★不可の登録/解除（モック不在＝申告済みの最小 UI・owner/manager） */}
                      {!isClosed(focusDay) && !focusUnavail && !focusEx && (
                        <button style={{ ...btnLight, marginLeft: "auto" }} onClick={() => void setUnavailable(focusDay)}>出勤不可にする</button>
                      )}
                      {focusUnavail && (
                        <button style={{ ...btnLight, marginLeft: "auto" }} onClick={() => void removeUnavailable(focusDay)}>不可を解除</button>
                      )}
                    </div>
                    {/* 不可日の「それでも登録」＝理由必須→override_reason（裁定112-F） */}
                    {focusUnavail && !sel[focusDay] && !focusEx && !isClosed(focusDay) && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8,
                        border: "1px solid rgba(216,108,100,.3)", borderRadius: 7, padding: 8 }}>
                        <span style={{ fontSize: 10.5, color: "var(--bad)" }}>
                          この日は「出勤不可」です。登録する場合は理由を残してください。
                        </span>
                        <input value={ovReason} onChange={(e) => setOvReason(e.target.value)}
                          placeholder="理由（本人了承済み 等・必須）" style={{ ...input, width: 220 }} />
                        <button style={{ ...btnLight, opacity: ovReason.trim() ? 1 : 0.45 }} disabled={!ovReason.trim()}
                          onClick={() => {
                            setSel((p) => ({ ...p, [focusDay]: entryFor(focusDay, ovReason.trim()) }));
                            setOvReason("");
                          }}>それでも登録</button>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. 時間設定（選択日一覧＝日別＋一括適用） */}
                {selCount === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--sub)", border: "1px dashed var(--line2)", borderRadius: 8,
                    padding: "16px 12px", textAlign: "center", marginTop: 10 }}>
                    出勤可能な日付を選ぶと、ここに勤務時間が表示されます。
                  </p>
                ) : (
                  <div style={{ marginTop: 10 }}>
                    <div className="nox-inset" style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", padding: 9 }}>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <b style={{ fontSize: 12 }}>3. 選択した日すべてに時間を設定</b>
                        <div style={{ fontSize: 10, color: "var(--v2-muted)" }}>必要な日だけ下で個別変更できます</div>
                      </div>
                      <label style={{ fontSize: 11 }}>開始<br />
                        <input value={bulkStart} onChange={(e) => setBulkStart(e.target.value)} style={{ ...input, width: 76 }} /></label>
                      <label style={{ fontSize: 11 }}>終了<br />
                        <input value={bulkEnd} onChange={(e) => setBulkEnd(e.target.value)} style={{ ...input, width: 76 }} /></label>
                      <button style={btnLight} onClick={applyAll}>全日に適用</button>
                    </div>
                    <div style={{ display: "grid", gap: 5, marginTop: 7 }}>
                      {Object.entries(sel).sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, e]) => (
                        <div key={d} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
                          border: "1px solid var(--line)", borderRadius: 8, padding: "6px 9px", fontSize: 12 }}>
                          <b className="num" style={{ width: 96 }}>{Number(mm)}/{Number(d.slice(8))}（{DOW[dowOf(d)]}）</b>
                          <input value={e.start} onChange={(ev) => setDayTime(d, "start", ev.target.value)} style={{ ...input, width: 72, padding: "5px 7px" }} />
                          <span style={{ color: "var(--sub)" }}>〜</span>
                          <input value={e.end} onChange={(ev) => setDayTime(d, "end", ev.target.value)} style={{ ...input, width: 72, padding: "5px 7px" }} />
                          {hm2min(e.end) >= 1440 && <span className="num" style={{ fontSize: 10.5, color: "var(--sub)" }}>= {fmtNext(e.end)} まで</span>}
                          {e.src === "wish" && <span style={{ fontSize: 10, color: "var(--blue)", fontWeight: 700 }}>希望から</span>}
                          {e.src === "edit" && <span style={{ fontSize: 10, color: "var(--gold2)", fontWeight: 700 }}>登録済みの編集</span>}
                          {e.override && <span style={{ fontSize: 10, color: "var(--bad)", fontWeight: 700 }}>不可を押切（{e.override}）</span>}
                          <button type="button" aria-label={`${d} を外す`} style={{ ...btnLight, marginLeft: "auto", padding: "1px 8px" }}
                            onClick={() => setSel((p) => { const n = { ...p }; delete n[d]; return n; })}>×</button>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: "var(--sub)" }}>新規日の状態</span>
                      <SegSelect value={fStatus} onChange={(v) => setFStatus(v)}
                        options={[["planned", "予定"], ["proposed", "確認待ち"], ["confirmed", "確定"]] as const} />
                      <span style={{ fontSize: 10, color: "var(--v2-muted)" }}>
                        希望日は承認（予定）として取り込み・登録済みの編集は元の状態を保ちます
                      </span>
                    </div>
                  </div>
                )}

                {conflicts.length > 0 && (
                  <p style={{ fontSize: 11.5, color: "var(--bad)", fontWeight: 700, margin: "8px 0 0" }}>
                    時間競合（同日に登録済み）が残っています: {conflicts.join(", ")} ＝解消するまで保存できません
                  </p>
                )}
                {msg && <p style={{ fontSize: 11.5, fontWeight: 700, margin: "8px 0 0", color: msg.includes("失敗") ? "var(--bad)" : "var(--ok)" }}>{msg}</p>}
                {toast.length > 0 && (
                  <div className="nox-inset" style={{ padding: "8px 12px", marginTop: 6 }}>
                    {toast.map((s, i) => <p key={i} style={{ fontSize: 11, color: "var(--gold2)", margin: "2px 0" }}>{s}</p>)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {/* フッター（裁定112-H: 0件時 disabled・「保存して次のキャスト」は成功後に選択のみリセット） */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 16px", borderTop: "1px solid var(--line)" }}>
        <small style={{ color: "var(--sub)" }} className="num">{selCast?.name ?? "—"} ／ {selCount}日分</small>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 9 }}>
          <button style={btnLight} onClick={onClose}>キャンセル</button>
          <button style={{ ...btnLight, opacity: selCount === 0 || conflicts.length > 0 || busy ? 0.45 : 1 }}
            disabled={selCount === 0 || conflicts.length > 0 || busy}
            onClick={() => void save(true)}>保存して次のキャスト</button>
          <button style={{ ...btnDark, opacity: selCount === 0 || conflicts.length > 0 || busy ? 0.45 : 1 }}
            disabled={selCount === 0 || conflicts.length > 0 || busy}
            onClick={() => void save(false)}>{busy ? "保存中…" : `${selCount}日分を保存して閉じる`}</button>
        </span>
      </div>
    </Modal>
  );
}
