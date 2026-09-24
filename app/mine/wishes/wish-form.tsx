"use client";

// ★便 AX（裁定290・2026-09-24）: 希望シフトの提出＝月グリッドのカレンダー形式（旧 input type=date の単発フォームは撤去）。
//   活性日＝募集中（open）の期間内（shift_open_periods_mine・N5）∧ 定休日でない ∧ 提出済み（pending／accepted）でない ∧ 今日以降。
//   定休日＝cast が呼べる shift_is_closed_day（boolean のみ）をタップ時に確認（月全日を先に問い合わせない＝仮決め）。
//   営業時間＝cast は store_business_hours を読めない（RLS パターン2）ため一括既定 20:00〜26:00（従来と同値）＋日別の上書き。
//   提出＝選択日を昇順に既存 shift_wish_submit を逐次（新 RPC なし・非原子）。失敗は rpcErrJa で和文・赤で残し再提出可（裁定281 の型）。
//   取り下げ＝既存 shift_wish_withdraw（WithdrawButton）のまま。締切超過は案内のみ（裁定43）。1 日 1 枠は DB の部分 unique が守る。
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { Message, type MessageKind } from "@/components/ui/toast"; // ★裁定281（便 U）: メッセージ表示の共通部品
import { rpcErrJa, isRpcMissingError } from "@/lib/nox/ui/rpc-err";
// ★夜間便 N5（裁定287-2・0151 ★2 shift_open_periods_mine）: 募集中の期間の案内と日付の可否（純関数）
import { periodNoticeOf, type OpenPeriod } from "@/lib/nox/shift/open-periods";
import { mdOf } from "@/lib/nox/shift/period";
import { mdDowOf } from "@/lib/nox/shift/staff-place";
import { fmtWin } from "@/lib/nox/shift-time";
import {
  DEFAULT_END, DEFAULT_START, activeDaysOf, composeSubmissions, initialMonthOf, isLiveWish, monthAfterOf, monthCellsOf, selectionAfterSubmit, setOverride,
  summarizeResults, timesValid, toggleDay, wishMarkOf, type Selection, type SubmitResult, type WishLike,
} from "@/lib/nox/mine/wish-calendar";
import WithdrawButton from "./withdraw-button";

const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };

export default function WishForm() {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [periods, setPeriods] = useState<OpenPeriod[] | null>(null); // ★N5: null＝RPC 未適用（0151 手貼り前）＝案内も活性化も出ない
  const [month, setMonth] = useState(today.slice(0, 7));
  const [wishes, setWishes] = useState<WishLike[]>([]);
  const [sel, setSel] = useState<Selection>({});
  const [defStart, setDefStart] = useState(DEFAULT_START);
  const [defEnd, setDefEnd] = useState(DEFAULT_END);
  const [msg, setMsg] = useState<{ kind: MessageKind; text: string } | null>(null);
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [closedDates, setClosedDates] = useState<Set<string>>(new Set());
  const [checkedDates, setCheckedDates] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null); // 提出済みの日をタップ＝取り下げ導線

  // ★N5-1: 自店の募集中（status='open'）の期間＝RPC shift_open_periods_mine（cast 本人・0 行＝募集なし）。関数が無ければ null に落とす
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void supabase.rpc("shift_open_periods_mine").then(({ data, error }) => {
      if (cancelled) return;
      if (error) { setPeriods(isRpcMissingError(error.message) ? null : []); return; }
      const ps = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        start_date: String(r.start_date), end_date: String(r.end_date), wish_deadline: r.wish_deadline ? String(r.wish_deadline) : null,
      }));
      setPeriods(ps);
      setMonth(initialMonthOf(ps, today)); // ★290-1: 最初に開く月＝募集中の期間の月
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 自分の cast 行から店を解決（cast はパターン1＝自分の行のみ返る）
  useEffect(() => {
    const supabase = createClient();
    void supabase.from("casts").select("store_id").limit(1)
      .then(({ data }) => setStoreId((data?.[0]?.store_id as string | undefined) ?? null));
  }, []);
  // 表示月の自分の希望（RLS＝自分の行のみ）＝提出済みの印と活性日の判定
  const loadWishes = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("shift_wishes").select("id, date, start_hm, end_hm, status")
      .gte("date", `${month}-01`).lt("date", `${monthAfterOf(month, 1)}-01`).order("date");
    setWishes((data ?? []) as WishLike[]);
  }, [month]);
  useEffect(() => { void loadWishes(); }, [loadWishes]);

  const notice = periods ? periodNoticeOf(periods, today) : null;
  const cells = monthCellsOf(month);
  const active = activeDaysOf({ periods, cells, wishes, closedDates, today });
  const wishOn = (ymd: string) => wishes.find((w) => w.date === ymd && isLiveWish(w.status)) ?? wishes.find((w) => w.date === ymd) ?? null;
  const [my, mm] = month.split("-");
  const selDates = Object.keys(sel).sort();

  // タップ＝選択／解除。定休日はタップ時に 1 回だけ問い合わせて非活性にする（boolean のみ・失敗時は選べる＝二層目は RPC 'closed day'）
  async function tap(ymd: string) {
    if (busy) return;
    const w = wishOn(ymd);
    if (w && isLiveWish(w.status)) { setFocus(focus === ymd ? null : ymd); return; }
    setFocus(null);
    if (!active.has(ymd)) return;
    if (storeId && !checkedDates.has(ymd)) {
      const supabase = createClient();
      const { data } = await supabase.rpc("shift_is_closed_day", { p_store_id: storeId, p_date: ymd });
      setCheckedDates((s) => new Set(s).add(ymd));
      if (data === true) { setClosedDates((s) => new Set(s).add(ymd)); setMsg({ kind: "warn", text: `${mdDowOf(ymd)} は定休日です（提出できません）` }); return; }
    }
    setMsg(null);
    setFailed((f) => { const n = { ...f }; delete n[ymd]; return n; });
    setSel((s) => toggleDay(s, ymd, active)); // ★便 AY2（裁定290-1）: 提出済み（pending／accepted）等の非活性日は純関数側でも選択しない
  }

  // ★290-3: 選択日ごとに既存 shift_wish_submit を昇順に逐次（非原子）。失敗は和文で残し再提出可
  async function submitAll() {
    if (busy || selDates.length === 0) return;
    if (!timesValid({ start: defStart, end: defEnd })) { setMsg({ kind: "error", text: "一括の時間は 開始 00:00〜23:59・終了 00:00〜47:59 で入力してください" }); return; }
    const rows = composeSubmissions(sel, { start: defStart, end: defEnd });
    const bad = rows.find((r) => !timesValid({ start: r.start_hm, end: r.end_hm }));
    if (bad) { setMsg({ kind: "error", text: `${mdDowOf(bad.date)} の時間が正しくありません（開始 00:00〜23:59・終了 00:00〜47:59）` }); return; }
    setBusy(true); setMsg(null);
    const supabase = createClient();
    const results: SubmitResult[] = [];
    for (const r of rows) {
      const { error } = await supabase.rpc("shift_wish_submit", { p_date: r.date, p_start_hm: r.start_hm, p_end_hm: r.end_hm });
      if (error) {
        const text = error.message.includes("closed day") ? "定休日です（希望を提出できません）"
          : error.message.includes("bad time") ? "時刻の形式が正しくありません（開始 00:00〜23:59・終了 00:00〜47:59）"
          : rpcErrJa(error.message);
        results.push({ date: r.date, ok: false, err: text });
      } else results.push({ date: r.date, ok: true });
    }
    const sum = summarizeResults(results);
    setSel((s) => selectionAfterSubmit(s, results));
    setFailed(Object.fromEntries(sum.failed.map((f) => [f.date, f.err])));
    setMsg({ kind: sum.kind, text: sum.text });
    setBusy(false);
    await loadWishes();
    router.refresh();
  }

  const input: React.CSSProperties = { ...t.input, width: 76, padding: "6px 8px", borderRadius: 9, fontSize: 12.5 };
  const focusWish = focus ? wishOn(focus) : null;

  return (
    <>
      {/* ★夜間便 N5-1（裁定287-2）: 募集中の期間の案内（受付中＝info・締切超過＝warn・募集なし＝info）。RPC 未適用時は出さない（従来どおり） */}
      {notice && (
        <Message kind={notice.kind === "past_deadline" ? "warn" : "info"} style={{ margin: "0 0 10px" }}>{notice.text}</Message>
      )}
      <div className="nox-calhead">
        <button type="button" style={btnLight} disabled={busy} onClick={() => { setMonth(monthAfterOf(month, -1)); setFocus(null); }} aria-label="前の月">‹</button>
        <b className="num" style={{ fontSize: 14 }}>{my}年{mm}月</b>
        <button type="button" style={btnLight} disabled={busy} onClick={() => { setMonth(monthAfterOf(month, 1)); setFocus(null); }} aria-label="次の月">›</button>
        <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--v2-muted)" }}>募集中の日をタップで選択・もう一度で解除</span>
      </div>
      {/* ★290-1／AU3: 月グリッド＝button.nox-cald・≤899 は 7 列を収める（.nox-calgrid--fit） */}
      <div className="nox-calgrid nox-calgrid--fit">
        {DOW.map((d) => <div key={d} className="nox-calh">{d}</div>)}
        {cells.map((ymd, i) => {
          if (!ymd) return <div key={`w${i}`} />;
          const w = wishOn(ymd);
          const mark = wishMarkOf(w?.status);
          const on = ymd in sel;
          const isActive = active.has(ymd);
          const err = failed[ymd];
          const disabled = !isActive && !(w && isLiveWish(w.status));
          const cls = ["nox-cald", on ? "sel" : "", ymd < today ? "past" : "", ymd === today ? "today" : "", err ? "ng" : "", w && isLiveWish(w.status) ? "ok" : ""].filter(Boolean).join(" ");
          return (
            <button key={ymd} type="button" className={cls} disabled={disabled || busy} onClick={() => void tap(ymd)}
              style={{ minHeight: 56, ...(err ? { outline: "2px solid var(--bad)", outlineOffset: -2 } : {}), ...(focus === ymd ? { outline: "2px solid var(--gold)", outlineOffset: -2 } : {}) }}
              title={err ? `${mdDowOf(ymd)}: ${err}` : mark ? `${mdDowOf(ymd)}: ${mark}` : isActive ? `${mdDowOf(ymd)}: 募集中` : `${mdDowOf(ymd)}: 募集期間外`}>
              <span className="nox-cald-n num">{Number(ymd.slice(8))}</span>
              {mark && <span style={{ fontSize: 8.5, color: w?.status === "accepted" ? "var(--ok)" : w?.status === "rejected" ? "var(--sub)" : "var(--champ)" }}>{mark}</span>}
              {on && <span className="num" style={{ fontSize: 8.5, color: "var(--champ)" }}>{sel[ymd] ? `${sel[ymd]!.start}-` : "選択"}</span>}
              {err && <span style={{ fontSize: 8.5, color: "var(--bad)" }}>失敗</span>}
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "6px 0 0" }}>印: 審査中／承認／却下。募集期間外・定休日・提出済みの日は選べません。</p>

      {/* 提出済みの日をタップ＝既存の取り下げ（pending のみ） */}
      {focusWish && (
        <div className="nox-inset" style={{ padding: "8px 12px", marginTop: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className="num" style={{ fontSize: 12.5 }}>{mdDowOf(focusWish.date)} {fmtWin(focusWish.start_hm, focusWish.end_hm)}</span>
          <span style={{ fontSize: 12, color: "var(--sub)" }}>{wishMarkOf(focusWish.status)}</span>
          {focusWish.status === "pending" && <WithdrawButton wishId={focusWish.id} />}
        </div>
      )}

      {/* ★290-2: 時間 一括（既定 20:00〜26:00）＋選択日の一覧（日別上書き） */}
      <div className="nox-inset" style={{ padding: "10px 12px", marginTop: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 12.5 }}>時間（一括）</b>
          <input value={defStart} onChange={(e) => setDefStart(e.target.value)} placeholder="20:00" aria-label="開始（一括）" style={input} disabled={busy} />
          <span style={{ fontSize: 13, color: "var(--sub)" }}>〜</span>
          <input value={defEnd} onChange={(e) => setDefEnd(e.target.value)} placeholder="26:00" aria-label="終了（一括）" style={input} disabled={busy} />
          <span style={{ fontSize: 10.5, color: "var(--v2-muted)" }}>日ごとに変えるときは下で上書き</span>
        </div>
        {selDates.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--sub)", margin: "8px 0 0" }}>カレンダーで日を選んでください。</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
            {selDates.map((ymd) => {
              const o = sel[ymd];
              return (
                <div key={ymd} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
                  <span className="num" style={{ minWidth: 72, color: failed[ymd] ? "var(--bad)" : "var(--ink)" }}>{mdDowOf(ymd)}</span>
                  <input value={o?.start ?? ""} placeholder={defStart} aria-label={`${mdDowOf(ymd)} 開始`} style={input} disabled={busy}
                    onChange={(e) => setSel((s) => setOverride(s, ymd, { start: e.target.value, end: o?.end ?? "" }))} />
                  <span style={{ color: "var(--sub)" }}>〜</span>
                  <input value={o?.end ?? ""} placeholder={defEnd} aria-label={`${mdDowOf(ymd)} 終了`} style={input} disabled={busy}
                    onChange={(e) => setSel((s) => setOverride(s, ymd, { start: o?.start ?? "", end: e.target.value }))} />
                  {o && (o.start || o.end) && <button type="button" style={{ ...btnLight, padding: "2px 8px" }} disabled={busy} onClick={() => setSel((s) => setOverride(s, ymd, null))}>一括に戻す</button>}
                  <button type="button" style={{ ...btnLight, padding: "2px 8px" }} disabled={busy} onClick={() => { setSel((s) => toggleDay(s, ymd)); setFailed((f) => { const n = { ...f }; delete n[ymd]; return n; }); }}>外す</button>
                  {failed[ymd] && <span style={{ width: "100%", fontSize: 11, color: "var(--bad)" }}>{failed[ymd]}</span>}
                </div>
              );
            })}
          </div>
        )}
        <div className="nox-actions" style={{ marginTop: 10 }}>
          <button type="button" disabled={busy || selDates.length === 0} onClick={() => void submitAll()}
            style={{ ...t.btnGold, padding: "8px 16px", opacity: busy || selDates.length === 0 ? 0.7 : 1 }}>
            {busy ? "提出中…" : `${selDates.length} 日を提出`}
          </button>
        </div>
        {msg && <Message kind={msg.kind} onDismiss={() => setMsg(null)}>{msg.text}</Message>}
      </div>
      {periods && periods.length > 0 && (
        <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "6px 0 0" }}>
          募集中: {periods.map((p) => `${mdOf(p.start_date)}〜${mdOf(p.end_date)}`).join("、")}
        </p>
      )}
    </>
  );
}
