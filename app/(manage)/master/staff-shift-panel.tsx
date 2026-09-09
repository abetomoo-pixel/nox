"use client";

// ★C層② 面 a（設計書 v1 §4・mig0136/0137）: 店舗設定「黒服シフト」節＝勤務パターン枠と希望締切。
//   flag_enabled('staff_shift', store) が false なら節ごと描かない（横断 §4＝導線・画面を出さない）。
//   読取＝staff_shift_patterns／staff_shift_deadlines（RLS select・owner∨manager 自店）＋stores.settings_json（営業日の cutoff）
//   ＋flag_enabled（RPC）。書込＝staff_pattern_set／staff_pattern_delete／staff_deadline_set（RPC のみ・課金ゲート内蔵＝0137）。
//   枠の時刻は既存 shifts と同じ 30 時間制（HH:MM・end ≤ 47:59）＝business-hours-panel と同じ「time 入力＋翌日」で受け送信時に変換。
//   一覧＝現在有効行（同名の effective_from ≤ 営業日 の最大）＋予約行（effective_from > 営業日）・過去行は折りたたみ。
//   削除は未来行のみボタン表示（RPC 側も effective_from_not_future／pattern_in_use で二重）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { hm2min, min2hm } from "@/lib/nox/shift-time";
import { addDays, bizDateOf } from "@/lib/nox/biz-date";

type Store = { id: string; name: string };
type Pattern = { id: string; name: string; start_hm: string; end_hm: string; effective_from: string; sort_order: number };
type Deadline = { id: string; days_before: number; deadline_hm: string; effective_from: string };

const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };

/** 30 時間制の終了を表示用へ（30:00 → 翌06:00） */
export const fmtEnd30 = (hm: string) => { const m = hm2min(hm); return m >= 1440 ? `翌${min2hm(m - 1440)}` : hm; };

export function staffShiftErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("feature_disabled")) return "この機能は公開されていません（システム設定の「機能の公開」で黒服シフトを ON にしてください）";
  if (msg.includes("billing locked")) return "課金が停止中のため変更できません";
  if (msg.includes("effective_from_past")) return "適用日は当日（営業日）以降にしてください";
  if (msg.includes("effective_from_not_future")) return "当日以前の行は削除できません（履歴として残ります）";
  if (msg.includes("pattern_in_use")) return "希望またはシフトから参照されている枠は削除できません";
  if (msg.includes("pattern_not_effective")) return "その日に有効な枠ではありません";
  if (msg.includes("deadline_passed")) return "希望の締切を過ぎています";
  if (msg.includes("staff_not_in_store")) return "この店に所属する黒服ではありません";
  if (msg.includes("wish_mismatch")) return "希望と日付・本人が一致しません";
  if (msg.includes("already_confirmed")) return "すでに確定済みです";
  if (msg.includes("biz_date_past")) return "過去の営業日は変更できません";
  if (msg.includes("staff_shift_patterns_uq") || msg.includes("duplicate key")) return "同じ名前・同じ適用日の枠がすでにあります";
  if (msg.includes("staff_shift_patterns_hm_order") || msg.includes("staff_shifts_hm_order")) return "終了は開始より後にしてください（日跨ぎは「翌日」をオン）";
  if (msg.includes("invalid_input")) return "入力が不正です";
  if (msg.includes("forbidden")) return "権限がありません（オーナー／店長のみ）";
  if (msg.includes("unauthenticated")) return "ログインし直してください";
  return msg;
}

/** 営業日 D に有効な枠＝同名で effective_from ≤ D の最大行（RPC の staff_pattern_effective と同式） */
export function effectivePatterns(rows: Pattern[], day: string): Pattern[] {
  const byName = new Map<string, Pattern>();
  for (const p of rows) {
    if (p.effective_from > day) continue;
    const cur = byName.get(p.name);
    if (!cur || p.effective_from > cur.effective_from) byName.set(p.name, p);
  }
  return [...byName.values()].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ja"));
}

export default function StaffShiftPanel({ stores }: { stores: Store[] }) {
  const supabase = createClient();
  const [storeSel, setStoreSel] = useState(stores[0]?.id ?? "");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [cutoff, setCutoff] = useState("06:00");
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [showPast, setShowPast] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const bizToday = bizDateOf(new Date().toISOString(), cutoff);
  // 追加フォーム（既定＝翌営業日から）
  const [fName, setFName] = useState("");
  const [fStart, setFStart] = useState("18:00");
  const [fEnd, setFEnd] = useState("01:00");
  const [fNext, setFNext] = useState(true);
  const [fFrom, setFFrom] = useState("");
  // 締切フォーム
  const [dDays, setDDays] = useState(3);
  const [dHm, setDHm] = useState("21:00");
  const [dFrom, setDFrom] = useState("");

  const load = useCallback(async () => {
    if (!storeSel) return;
    const { data: fl } = await supabase.rpc("flag_enabled", { p_key: "staff_shift", p_store_id: storeSel });
    setEnabled(fl === true);
    if (fl !== true) return;
    const { data: st } = await supabase.from("stores").select("settings_json").eq("id", storeSel).single();
    const bc = (st?.settings_json as Record<string, unknown> | null)?.biz_cutoff_hm;
    setCutoff(typeof bc === "string" && bc ? bc : "06:00");
    const { data: ps } = await supabase.from("staff_shift_patterns")
      .select("id, name, start_hm, end_hm, effective_from, sort_order").eq("store_id", storeSel)
      .order("name").order("effective_from", { ascending: false });
    setPatterns((ps ?? []) as Pattern[]);
    const { data: ds } = await supabase.from("staff_shift_deadlines")
      .select("id, days_before, deadline_hm, effective_from").eq("store_id", storeSel)
      .order("effective_from", { ascending: false });
    setDeadlines((ds ?? []) as Deadline[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeSel]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!fFrom) setFFrom(addDays(bizToday, 1)); if (!dFrom) setDFrom(addDays(bizToday, 1)); }, [bizToday, fFrom, dFrom]);

  if (enabled !== true) return null; // ★flag off＝節ごと不在（読込前も同じ）

  const current = effectivePatterns(patterns, bizToday);
  const currentIds = new Set(current.map((p) => p.id));
  const reserved = patterns.filter((p) => p.effective_from > bizToday);
  const past = patterns.filter((p) => p.effective_from <= bizToday && !currentIds.has(p.id));
  const curDeadline = deadlines.find((d) => d.effective_from <= bizToday) ?? null; // desc 順＝先頭が最大
  const reservedDeadlines = deadlines.filter((d) => d.effective_from > bizToday);

  async function addPattern() {
    if (busy) return;
    const endMin = hm2min(fEnd) + (fNext ? 1440 : 0);
    if (!fName.trim()) { setMsg({ kind: "bad", text: "枠の名前を入力してください" }); return; }
    if (endMin <= hm2min(fStart)) { setMsg({ kind: "bad", text: "終了は開始より後にしてください（日跨ぎは「翌日」をオン）" }); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("staff_pattern_set", {
      p_store_id: storeSel, p_name: fName.trim(), p_start_hm: fStart, p_end_hm: min2hm(endMin), p_effective_from: fFrom, p_sort_order: 0,
    });
    setBusy(false);
    setMsg(error ? { kind: "bad", text: staffShiftErrJa(error.message) } : { kind: "ok", text: `枠「${fName.trim()}」を ${fFrom} から適用します` });
    if (!error) { setFName(""); await load(); }
  }
  async function removePattern(p: Pattern) {
    if (busy) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("staff_pattern_delete", { p_pattern_id: p.id });
    setBusy(false);
    setMsg(error ? { kind: "bad", text: staffShiftErrJa(error.message) } : { kind: "ok", text: `予約行「${p.name}（${p.effective_from} から）」を削除しました` });
    if (!error) await load();
  }
  async function addDeadline() {
    if (busy) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("staff_deadline_set", { p_store_id: storeSel, p_days_before: dDays, p_deadline_hm: dHm, p_effective_from: dFrom });
    setBusy(false);
    setMsg(error ? { kind: "bad", text: staffShiftErrJa(error.message) } : { kind: "ok", text: `締切を「${dDays}日前 ${dHm}」に（${dFrom} から）` });
    if (!error) await load();
  }

  const row = (p: Pattern, kind: "current" | "reserved" | "past") => (
    <tr key={p.id} style={kind === "past" ? { opacity: 0.6 } : undefined}>
      <td style={{ fontWeight: 800 }}>{p.name}</td>
      <td className="num">{p.start_hm}〜{fmtEnd30(p.end_hm)}</td>
      <td className="num">{p.effective_from}</td>
      <td>
        <span className={`nox-stpill ${kind === "current" ? "ok" : ""}`}
          style={kind === "reserved" ? { color: "var(--gold2)", borderColor: "var(--gold-bd)" } : undefined}>
          {kind === "current" ? "現在有効" : kind === "reserved" ? "予約" : "過去"}
        </span>
      </td>
      <td>{kind === "reserved" && <button style={{ ...btnLight, color: "var(--bad)" }} disabled={busy} onClick={() => void removePattern(p)}>削除</button>}</td>
    </tr>
  );

  return (
    <section className="nox-panel" id="staff-shift">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>黒服シフト（勤務パターン枠・希望締切）</h3>
        {stores.length > 1 && (
          <select value={storeSel} onChange={(e) => setStoreSel(e.target.value)} style={{ ...input, marginLeft: "auto" }}>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>
      <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "4px 0 10px", lineHeight: 1.7 }}>
        枠は「◯日から」で予約します。シフト行は作成時に枠の時刻を写して固定され、枠を変えても過去の行は変わりません（例外は行ごとの時刻上書き）。営業日＝<span className="num">{bizToday}</span>。
      </p>
      {msg && <p style={{ fontSize: 12.5, fontWeight: 700, margin: "0 0 8px", color: msg.kind === "ok" ? "var(--ok)" : "var(--danger-ink)" }}>{msg.text}</p>}

      <div className="nox-tablewrap">
        <table className="nox-table">
          <thead><tr><th>枠</th><th>時間</th><th>適用日</th><th>状態</th><th>操作</th></tr></thead>
          <tbody>
            {current.map((p) => row(p, "current"))}
            {reserved.map((p) => row(p, "reserved"))}
            {showPast && past.map((p) => row(p, "past"))}
            {current.length + reserved.length === 0 && (
              <tr><td colSpan={5} style={{ color: "var(--sub)" }}>枠がまだありません。下のフォームから追加してください。</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {past.length > 0 && (
        <button style={{ ...btnLight, marginTop: 6 }} onClick={() => setShowPast((v) => !v)}>
          {showPast ? "過去の行を隠す" : `過去の行を表示（${past.length}）`}
        </button>
      )}

      <div className="nox-inset" style={{ padding: "10px 12px", marginTop: 12 }}>
        <b style={{ fontSize: 12.5 }}>枠を追加</b>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
          <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="名前（早番 など）" style={{ ...input, width: 140 }} />
          <span style={t.fieldLabel}>開始</span>
          <input type="time" value={fStart} onChange={(e) => setFStart(e.target.value)} style={{ ...input, maxWidth: 108 }} />
          <span style={t.fieldLabel}>終了</span>
          <input type="time" value={fEnd} onChange={(e) => setFEnd(e.target.value)} style={{ ...input, maxWidth: 108 }} />
          <label style={{ fontSize: 12.5, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={fNext} onChange={(e) => setFNext(e.target.checked)} />翌日
          </label>
          <span style={t.fieldLabel}>◯日から</span>
          <input type="date" value={fFrom} min={bizToday} onChange={(e) => setFFrom(e.target.value)} style={input} />
          <button style={btnDark} disabled={busy} onClick={() => void addPattern()}>追加</button>
        </div>
        <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "6px 0 0" }}>同じ名前で新しい適用日を追加すると、その日以降はその時間が有効になります（既存の行は消えず履歴として残ります）。</p>
      </div>

      <div className="nox-inset" style={{ padding: "10px 12px", marginTop: 10 }}>
        <b style={{ fontSize: 12.5 }}>希望の締切</b>
        <p style={{ fontSize: 11.5, color: "var(--sub)", margin: "4px 0 8px" }}>
          現在: {curDeadline ? <><span className="num">{curDeadline.days_before}</span>日前 <span className="num">{curDeadline.deadline_hm}</span>（{curDeadline.effective_from} から）</> : <>既定（3日前 21:00・未設定）</>}
          {reservedDeadlines.map((d) => <span key={d.id} style={{ marginLeft: 10, color: "var(--gold2)" }}>予約: {d.days_before}日前 {d.deadline_hm}（{d.effective_from} から）</span>)}
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={t.fieldLabel}>対象営業日の</span>
          <input type="number" min={0} max={60} value={dDays} onChange={(e) => setDDays(Number.parseInt(e.target.value || "0", 10))} style={{ ...input, width: 64 }} />
          <span style={t.fieldLabel}>日前</span>
          <input type="time" value={dHm} onChange={(e) => setDHm(e.target.value)} style={{ ...input, maxWidth: 108 }} />
          <span style={t.fieldLabel}>◯日から</span>
          <input type="date" value={dFrom} min={bizToday} onChange={(e) => setDFrom(e.target.value)} style={input} />
          <button style={btnDark} disabled={busy} onClick={() => void addDeadline()}>設定</button>
        </div>
        <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "6px 0 0" }}>締切は黒服の希望入力にだけ効きます（店長の配置・時刻上書きは締切後も可）。</p>
      </div>
    </section>
  );
}
