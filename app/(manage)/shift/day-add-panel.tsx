"use client";

// ★裁定121（2026-09-04・UI のみ・migration なし）: 日付起点のシフト追加＝日詳細モーダル内で完結する。
//   「＋ キャストを追加」でキャスト一覧をモーダル内に展開 → クリックで即行追加（時間帯は営業時間マスタの
//   当曜日をプリセット・編集可）→ 同じキャストの再クリックで行削除（トグル）→「保存」で一括書込。
//   書込は shift_set を行ごと順次（複数キャスト×1日の器は shift_set 個別のみ＝bulk_daily は cast 単位）。
//   1行失敗＝行単位トースト・**部分成功時はモーダルを閉じず失敗行を残す**（バッファは破棄しない＝修正して再試行可）。
//   割当（calendar）／配置（build）／確定シフト（roster）の3面で共有＝面で挙動を割らない。保存前クローズの破棄確認は親（closeDay）が担う。
// ★便 M2 M-19（Agoora 確定 10/27＋補遺）: その日専用のシート＝
//   ①一覧はその日の状態つき（希望あり＝青／シフトなし＝グレー／出勤不可＝赤＝M-18 と同じ色）・その日に入っている人は出さない
//   ②時間の既定＝希望ありなら希望時間・なければ店の営業時間（30 分刻みの選択式・24 時を超えたら翌）
//   ③複数人を選んで「時間をそろえる」で同じ時間に・④定休日はブロック（closed）
//   ⑤出勤不可（休み希望・RPC の unavailable）は「それでも追加」＋理由必須（shift_set の p_override_reason）。保存は採用・確定＋本人へ通知（M-11／M-13）。
import { notifyCast } from "@/lib/nox/people/notify"; // ★便 M-11／M-13
import { shiftAddedBody } from "@/lib/nox/people/notify-text";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import CastAvatar from "@/components/ui/cast-avatar";
import { type BusinessHourRow } from "@/lib/nox/business-hours";
import { dayAddStateOf, shiftHmOptionsOf, DAY_ADD_STATE_LABEL, type DayAddState } from "@/lib/nox/shift/half-hour";

import Toast from "@/components/ui/toast"; // ★裁定281（便 U）: メッセージ表示の共通部品
type Cast = { id: string; name: string };
type Row = { castId: string; start: string; end: string; err: string | null; needReason: boolean; reason: string };
export type DayWish = { cast_id: string; date: string; start_hm: string; end_hm: string; status: string; kind?: string };

const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const hmSelect: React.CSSProperties = { ...t.input, width: "auto", padding: "5px 6px", fontSize: 12.5 };
const STATE_STYLE: Record<DayAddState, React.CSSProperties> = {
  wish: { color: "var(--primary)", borderColor: "rgba(79, 140, 255, .45)" },
  none: { color: "var(--sub)", borderColor: "var(--line2)" },
  unavailable: { color: "var(--bad)", borderColor: "rgba(217, 138, 138, .5)" },
};

// 既定の勤務時間（営業時間が引けないときのフォールバック＝ShiftAddForm と同値）
const FALLBACK_START = "20:00";
const FALLBACK_END = "26:00";

/** その日付の曜日の営業時間を [start, end] で返す（閉店が開店以下＝翌日またぎは 24 時超えの形）。引けなければ null。 */
function hoursOf(date: string, bhRows: BusinessHourRow[]): [string, string] | null {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const row = bhRows.find((r) => r.dow === dow);
  if (!row || row.is_closed || !row.open_hm || !row.close_hm) return null;
  const o = row.open_hm.slice(0, 5), c = row.close_hm.slice(0, 5);
  const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
  const cm = toMin(c) <= toMin(o) ? toMin(c) + 1440 : toMin(c);
  return [o, `${String(Math.floor(cm / 60)).padStart(2, "0")}:${String(cm % 60).padStart(2, "0")}`];
}

function rpcErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("closed day")) return "定休日です";
  if (msg.includes("unavailable")) return "出勤不可の日です（「それでも追加」で理由を入れると登録できます）";
  if (msg.includes("bad time")) return "時刻は 開始 00:00〜23:59・終了 00:00〜47:59";
  if (msg.includes("duplicate")) return "この日はすでに登録があります";
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}

export default function DayAddPanel({
  date, casts, photoUrls, bhRows, assignedCastIds, onSaved, onDirtyChange, wishes = [], closed = false,
}: {
  date: string;
  casts: Cast[];
  photoUrls: Map<string, string>;
  bhRows: BusinessHourRow[];
  /** この日にすでにシフトがあるキャスト（★便 M2 M-19: 一覧に出さない） */
  assignedCastIds: string[];
  /** 1件以上保存できたら呼ぶ（親が load() でカレンダーを更新） */
  onSaved: () => void | Promise<void>;
  /** バッファ有無の通知（親の閉じる操作で破棄確認に使う） */
  onDirtyChange: (dirty: boolean) => void;
  /** ★便 M2 M-19: シフト希望（全期間・この日の分だけ使う）＝希望あり（時間の既定）／休み希望（出勤不可） */
  wishes?: DayWish[];
  /** ★便 M2 M-19: 定休日＝ブロック */
  closed?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [listOpen, setListOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [allStart, setAllStart] = useState("");
  const [allEnd, setAllEnd] = useState("");

  // バッファ有無を親へ（アンマウント時は必ず false＝モーダルが閉じたら破棄確認の対象から外れる）
  useEffect(() => { onDirtyChange(rows.length > 0); }, [rows.length, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  // 日付が変わったらバッファは持ち越さない（別日のプリセット・登録済み判定と混ざらない）
  useEffect(() => { setRows([]); setListOpen(false); setMsg(null); }, [date]);

  const preset = hoursOf(date, bhRows);
  const assigned = new Set(assignedCastIds);
  const inBuf = (id: string) => rows.some((r) => r.castId === id);
  const nameOf = (id: string) => casts.find((c) => c.id === id)?.name ?? "?";
  const dayWishes = wishes.filter((w) => w.date === date && w.status !== "withdrawn");
  const stateOf = (id: string) => dayAddStateOf(dayWishes.filter((w) => w.cast_id === id));
  const startOpts = shiftHmOptionsOf(true), endOpts = shiftHmOptionsOf(false);

  const toggle = (c: Cast) => {
    if (busy || assigned.has(c.id)) return;
    setMsg(null);
    const st = stateOf(c.id);
    setRows((prev) => prev.some((r) => r.castId === c.id)
      ? prev.filter((r) => r.castId !== c.id)
      : [...prev, {
          castId: c.id,
          start: st.wish?.start_hm.slice(0, 5) ?? preset?.[0] ?? FALLBACK_START,
          end: st.wish?.end_hm.slice(0, 5) ?? preset?.[1] ?? FALLBACK_END,
          err: null, needReason: st.state === "unavailable", reason: "",
        }]);
  };
  const setRow = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.castId === id ? { ...r, ...patch, err: null } : r)));
  const applyAll = () => { if (!allStart || !allEnd) return; setRows((prev) => prev.map((r) => ({ ...r, start: allStart, end: allEnd, err: null }))); };
  const blocked = rows.some((r) => r.needReason && r.reason.trim() === "");

  async function save() {
    if (busy || rows.length === 0 || blocked) return;
    setBusy(true); setMsg(null);
    const rest: Row[] = [];
    let ok = 0;
    // 行ごと順次（裁定121-4）。失敗行は err 付きで残す＝部分成功でも閉じない・再試行可。
    for (const r of rows) {
      const { error } = await supabase.rpc("shift_set", {
        p_id: null, p_cast_id: r.castId, p_date: date, p_start_hm: r.start, p_end_hm: r.end,
        p_status: "confirmed", p_override_reason: r.needReason ? r.reason.trim() : null, // ★便 M-11: 既定は採用・確定／★便 M2 M-19: 出勤不可は理由つき
      });
      if (error) rest.push({ ...r, err: rpcErrJa(error.message), needReason: r.needReason || error.message.includes("unavailable") });
      else { ok += 1; void notifyCast(supabase, { castId: r.castId, kind: "shift_added", body: shiftAddedBody(date, r.start, r.end) }); } // ★便 M-13: 本人へ通知
    }
    setRows(rest);
    setBusy(false);
    if (ok > 0) await onSaved();
    if (rest.length === 0) { setListOpen(false); setMsg(`${ok}件を採用・確定で保存しました（本人に通知）`); }
    else setMsg(`${ok}件を保存しました。${rest.length}件は保存できませんでした（下の行を直して、もう一度保存できます）`);
  }

  // ★便 M2 M-19: その日に入っている人は出さない・並び＝希望あり→シフトなし→出勤不可（各名前順）
  const ORDER: Record<DayAddState, number> = { wish: 0, none: 1, unavailable: 2 };
  const sorted = casts.filter((c) => !assigned.has(c.id)).slice().sort((a, b) => ORDER[stateOf(a.id).state] - ORDER[stateOf(b.id).state] || a.name.localeCompare(b.name, "ja"));
  // ★B4-b 裁定225（H41）: 名前の部分一致で候補を絞る
  const [q, setQ] = useState("");
  const shown = sorted.filter((c) => q.trim() === "" || c.name.includes(q.trim()));

  if (closed) {
    return (
      <div className="nox-actions" style={{ margin: "6px 0 10px" }} data-day-add-closed="1">
        <button className="nox-addc" type="button" disabled style={{ opacity: 0.45 }} title="この日は定休日です">＋ キャストを追加（定休日）</button>
      </div>
    );
  }

  return (
    <div className="nox-actions" style={{ margin: "6px 0 10px" }} data-day-add="1">{/* ★裁定244: 節直下＝中央 */}
      <button className="nox-addc" type="button" onClick={() => { setListOpen((v) => !v); setMsg(null); }}>
        ＋ キャストを追加
      </button>
      {listOpen && (
        <div className="nox-inset" style={{ padding: "8px 10px", marginTop: 8, width: "100%" }}>
          <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "0 0 6px" }}>
            押して選ぶ（複数可）・もう一度押すと取り消し。時間は希望があれば希望の時間、なければ
            {preset ? `営業時間（${preset[0]}〜${preset[1]}）` : "20:00〜26:00"}が入ります。
          </p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="キャスト名で検索" aria-label="キャスト名で検索"
            style={{ ...t.input, width: "100%", maxWidth: 240, marginBottom: 6, fontSize: 12.5 }} />
          <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {shown.map((c) => {
              const on = inBuf(c.id);
              const st = stateOf(c.id);
              return (
                <button key={c.id} type="button" className="nox-crow" disabled={busy} data-day-add-cast={c.id} data-day-add-state={st.state}
                  onClick={() => toggle(c)}
                  style={{
                    cursor: "pointer", textAlign: "left", width: "100%",
                    background: on ? "var(--primary-soft)" : "transparent",
                    border: on ? "1px solid var(--primary)" : "1px solid transparent", borderRadius: 8,
                  }}>
                  <CastAvatar name={c.name} url={photoUrls.get(c.id)} variant="flat" />
                  <span style={{ flex: 1, minWidth: 0 }}>{c.name}</span>
                  <span style={{ ...t.tag, fontSize: 10.5, padding: "1px 7px", ...STATE_STYLE[st.state] }}>
                    {st.state === "wish" && st.wish ? `${DAY_ADD_STATE_LABEL.wish} ${st.wish.start_hm.slice(0, 5)}〜` : DAY_ADD_STATE_LABEL[st.state]}
                  </span>
                  {on && <span className="nox-stpill ok">選択中</span>}
                </button>
              );
            })}
            {shown.length === 0 && <span style={{ fontSize: 12, color: "var(--sub)" }}>{sorted.length === 0 ? "追加できるキャストがいません（全員この日に入っています）。" : "該当するキャストがいません。"}</span>}
          </div>
        </div>
      )}
      {rows.length > 0 && (
        <div style={{ marginTop: 8, width: "100%" }}>
          {rows.length >= 2 && (
            <div className="nox-crow" style={{ flexWrap: "wrap", gap: 6 }} data-day-add-all="1">
              <span style={{ fontSize: 12, color: "var(--sub)" }}>選んだ {rows.length} 人を同じ時間に</span>
              <select value={allStart} onChange={(e) => setAllStart(e.target.value)} style={hmSelect} aria-label="まとめて開始">
                <option value="">開始</option>{startOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span style={{ color: "var(--sub)" }}>〜</span>
              <select value={allEnd} onChange={(e) => setAllEnd(e.target.value)} style={hmSelect} aria-label="まとめて終了">
                <option value="">終了</option>{endOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button type="button" style={btnLight} disabled={!allStart || !allEnd} onClick={applyAll}>時間をそろえる</button>
            </div>
          )}
          {rows.map((r) => (
            <div key={r.castId} className="nox-crow" style={{ flexWrap: "wrap" }} data-day-add-row={r.castId}>
              <CastAvatar name={nameOf(r.castId)} url={photoUrls.get(r.castId)} variant="flat" />
              <span style={{ flex: 1, minWidth: 0 }}>{nameOf(r.castId)}</span>
              <select value={r.start} onChange={(e) => setRow(r.castId, { start: e.target.value })} style={hmSelect} aria-label="開始">
                {(startOpts.some((o) => o.value === r.start) ? startOpts : [{ value: r.start, label: r.start }, ...startOpts]).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <span style={{ color: "var(--sub)" }}>〜</span>
              <select value={r.end} onChange={(e) => setRow(r.castId, { end: e.target.value })} style={hmSelect} aria-label="終了">
                {(endOpts.some((o) => o.value === r.end) ? endOpts : [{ value: r.end, label: r.end }, ...endOpts]).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button type="button" style={btnLight} title="この行を取り消す" onClick={() => toggle({ id: r.castId, name: nameOf(r.castId) })}>×</button>
              {r.needReason && (/* ★便 M2 M-19: 出勤不可＝「それでも追加」＋理由必須（既存ルール＝shift_set の p_override_reason） */
                <label style={{ width: "100%", fontSize: 11.5, color: "var(--bad)", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }} data-day-add-reason={r.castId}>
                  出勤不可の日です。それでも追加する理由（必須）
                  <input value={r.reason} onChange={(e) => setRow(r.castId, { reason: e.target.value })} style={{ ...t.input, flex: "1 1 160px", fontSize: 12.5 }} aria-label="それでも追加する理由" />
                </label>
              )}
              {r.err && <span style={{ width: "100%", fontSize: 11, color: "var(--danger)" }}>⚠ {r.err}</span>}
            </div>
          ))}
          <div className="nox-actions" style={{ marginTop: 8 }}>
            <button type="button" style={btnLight} disabled={busy} onClick={() => { setRows([]); setMsg(null); }}>すべて取り消す</button>
            <button type="button" style={{ ...btnDark, opacity: blocked ? 0.5 : 1 }} disabled={busy || blocked} onClick={() => void save()} data-day-add-save="1">
              {busy ? "追加中…" : rows.some((r) => r.needReason) ? `それでも追加（${rows.length}名・採用・確定）` : `選択した${rows.length}名を追加（採用・確定）`}
            </button>
          </div>
        </div>
      )}
      {msg && <Toast msg={msg} style={{ margin: "8px 0 0" }} />}
    </div>
  );
}
