"use client";

// ★裁定121（2026-09-04・UI のみ・migration なし）: 日付起点のシフト追加＝日詳細モーダル内で完結する。
//   「＋ キャストを追加」でキャスト一覧をモーダル内に展開 → クリックで即行追加（時間帯は営業時間マスタの
//   当曜日をプリセット・編集可）→ 同じキャストの再クリックで行削除（トグル）→「保存」で一括 draft（planned）書込。
//   書込は shift_set(planned) を行ごと順次（複数キャスト×1日の器は shift_set 個別のみ＝bulk_daily は cast 単位）。
//   1行失敗＝行単位トースト・**部分成功時はモーダルを閉じず失敗行を残す**（バッファは破棄しない＝修正して再試行可）。
//   割当（calendar）／配置（build）の2面で共有＝面で挙動を割らない。保存前クローズの破棄確認は親（closeDay）が担う
//   （onDirtyChange でバッファ有無を親へ通知）。キャスト起点ウィザード（ShiftAddForm）は不触（名称のみ変更）。
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import CastAvatar from "@/components/ui/cast-avatar";
import { type BusinessHourRow } from "@/lib/nox/business-hours";

type Cast = { id: string; name: string };
type Row = { castId: string; start: string; end: string; err: string | null };

const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const hmInput: React.CSSProperties = { ...t.input, width: 68, padding: "5px 6px", fontSize: 12.5, textAlign: "center" };

// 既定の勤務時間（営業時間が引けないときのフォールバック＝ShiftAddForm と同値）
const FALLBACK_START = "20:00";
const FALLBACK_END = "26:00";
// 開始 00:00〜23:59・終了 00:00〜47:59（RPC の 'bad time' と同じ射程＝送る前に弾く）
const HM_START = /^([01]\d|2[0-3]):[0-5]\d$/;
const HM_END = /^([0-3]\d|4[0-7]):[0-5]\d$/;

/** その日付の曜日の営業時間を [start, end] で返す。引けなければ null（ShiftAddForm.hoursOf と同式）。 */
function hoursOf(date: string, bhRows: BusinessHourRow[]): [string, string] | null {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const row = bhRows.find((r) => r.dow === dow);
  if (!row || row.is_closed || !row.open_hm || !row.close_hm) return null;
  return [row.open_hm, row.close_hm];
}

function rpcErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("closed day")) return "定休日です";
  if (msg.includes("unavailable")) return "出勤不可の日です（登録するには「キャスト別にまとめて追加」で理由を入力）";
  if (msg.includes("bad time")) return "時刻は 開始 00:00〜23:59・終了 00:00〜47:59";
  if (msg.includes("duplicate")) return "この日はすでに登録があります";
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}

export default function DayAddPanel({
  date, casts, photoUrls, bhRows, assignedCastIds, onSaved, onDirtyChange,
}: {
  date: string;
  casts: Cast[];
  photoUrls: Map<string, string>;
  bhRows: BusinessHourRow[];
  /** この日にすでにシフトがあるキャスト（一覧では「登録済み」として押せない） */
  assignedCastIds: string[];
  /** 1件以上保存できたら呼ぶ（親が load() でカレンダーを更新） */
  onSaved: () => void | Promise<void>;
  /** バッファ有無の通知（親の閉じる操作で破棄確認に使う） */
  onDirtyChange: (dirty: boolean) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [listOpen, setListOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // バッファ有無を親へ（アンマウント時は必ず false＝モーダルが閉じたら破棄確認の対象から外れる）
  useEffect(() => { onDirtyChange(rows.length > 0); }, [rows.length, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  // 日付が変わったらバッファは持ち越さない（別日のプリセット・登録済み判定と混ざらない）
  useEffect(() => { setRows([]); setListOpen(false); setMsg(null); }, [date]);

  const preset = hoursOf(date, bhRows);
  const assigned = new Set(assignedCastIds);
  const inBuf = (id: string) => rows.some((r) => r.castId === id);
  const nameOf = (id: string) => casts.find((c) => c.id === id)?.name ?? "?";

  const toggle = (c: Cast) => {
    if (busy || assigned.has(c.id)) return;
    setMsg(null);
    setRows((prev) => prev.some((r) => r.castId === c.id)
      ? prev.filter((r) => r.castId !== c.id)
      : [...prev, { castId: c.id, start: preset?.[0] ?? FALLBACK_START, end: preset?.[1] ?? FALLBACK_END, err: null }]);
  };
  const setHm = (id: string, key: "start" | "end", v: string) =>
    setRows((prev) => prev.map((r) => (r.castId === id ? { ...r, [key]: v, err: null } : r)));

  async function save() {
    if (busy || rows.length === 0) return;
    setBusy(true); setMsg(null);
    const rest: Row[] = [];
    let ok = 0;
    // 行ごと順次（裁定121-4）。失敗行は err 付きで残す＝部分成功でも閉じない・再試行可。
    for (const r of rows) {
      if (!HM_START.test(r.start) || !HM_END.test(r.end)) { rest.push({ ...r, err: "時刻は 開始 00:00〜23:59・終了 00:00〜47:59" }); continue; }
      const { error } = await supabase.rpc("shift_set", {
        p_id: null, p_cast_id: r.castId, p_date: date, p_start_hm: r.start, p_end_hm: r.end,
        p_status: "planned", p_override_reason: null,
      });
      if (error) rest.push({ ...r, err: rpcErrJa(error.message) });
      else ok += 1;
    }
    setRows(rest);
    setBusy(false);
    if (ok > 0) await onSaved();
    if (rest.length === 0) { setListOpen(false); setMsg(`${ok}件を仮シフトとして保存しました`); }
    else setMsg(`${ok}件を保存しました。${rest.length}件は保存できませんでした（下の行を直して、もう一度保存できます）`);
  }

  const sorted = casts.slice().sort((a, b) => a.name.localeCompare(b.name, "ja"));

  return (
    <div style={{ margin: "6px 0 10px" }}>
      <button className="nox-addc" type="button" onClick={() => { setListOpen((v) => !v); setMsg(null); }}>
        ＋ キャストを追加
      </button>
      {listOpen && (
        <div className="nox-inset" style={{ padding: "8px 10px", marginTop: 8 }}>
          <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "0 0 6px" }}>
            クリックで行を追加・もう一度クリックで取り消し。
            {preset ? `時間は営業時間（${preset[0]}〜${preset[1]}）が入ります。` : "営業時間が未設定のため 20:00〜26:00 が入ります。"}
          </p>
          <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {sorted.map((c) => {
              const done = assigned.has(c.id);
              const on = inBuf(c.id);
              return (
                <button key={c.id} type="button" className="nox-crow" disabled={done || busy}
                  onClick={() => toggle(c)}
                  style={{
                    cursor: done ? "default" : "pointer", textAlign: "left", width: "100%",
                    background: on ? "var(--primary-soft)" : "transparent",
                    border: on ? "1px solid var(--primary)" : "1px solid transparent",
                    opacity: done ? 0.5 : 1, borderRadius: 8,
                  }}>
                  <CastAvatar name={c.name} url={photoUrls.get(c.id)} variant="flat" />
                  <span style={{ flex: 1, minWidth: 0 }}>{c.name}</span>
                  {done && <span className="nox-stpill">登録済み</span>}
                  {on && <span className="nox-stpill ok">追加中</span>}
                </button>
              );
            })}
            {sorted.length === 0 && <span style={{ fontSize: 12, color: "var(--sub)" }}>キャストがいません。</span>}
          </div>
        </div>
      )}
      {rows.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {rows.map((r) => (
            <div key={r.castId} className="nox-crow" style={{ flexWrap: "wrap" }}>
              <CastAvatar name={nameOf(r.castId)} url={photoUrls.get(r.castId)} variant="flat" />
              <span style={{ flex: 1, minWidth: 0 }}>{nameOf(r.castId)}</span>
              <input value={r.start} onChange={(e) => setHm(r.castId, "start", e.target.value)} style={hmInput} placeholder="20:00" aria-label="開始" />
              <span style={{ color: "var(--sub)" }}>〜</span>
              <input value={r.end} onChange={(e) => setHm(r.castId, "end", e.target.value)} style={hmInput} placeholder="26:00" aria-label="終了" />
              <button type="button" style={btnLight} title="この行を取り消す" onClick={() => toggle({ id: r.castId, name: nameOf(r.castId) })}>×</button>
              {r.err && <span style={{ width: "100%", fontSize: 11, color: "var(--danger)" }}>⚠ {r.err}</span>}
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <button type="button" style={btnDark} disabled={busy} onClick={() => void save()}>
              {busy ? "保存中…" : `保存（${rows.length}件・仮シフト）`}
            </button>
            <button type="button" style={btnLight} disabled={busy} onClick={() => { setRows([]); setMsg(null); }}>すべて取り消す</button>
          </div>
        </div>
      )}
      {msg && <p style={{ fontSize: 12, color: "var(--v2-muted)", margin: "8px 0 0" }}>{msg}</p>}
    </div>
  );
}
