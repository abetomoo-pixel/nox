"use client";

// ★夜間便 N6（便 S-1／S-2・裁定287-1・2026-09-18）: 黒服の配置フォーム＝枠の選択（chips・select 不使用＝裁定259）→ 時刻は枠から写す →
//   必要なら開始・終了を調整（＝propose の後に staff_shift_override を続けて呼ぶ・呼ぶかどうかは親）→「配置」（実行＝青塗り・裁定239）。
//   日付起点（staff-place-day）と人起点（staff-place-by-staff）で共用。RPC は持たない（親の onPlace に渡す）。
import { useState } from "react";
import * as t from "@/lib/nox/ui/theme";
import { hm2min, min2hm } from "@/lib/nox/shift-time";
import { fmtEnd30 } from "../master/staff-shift-panel";
import type { Pattern } from "./staff-shift-board";
import { defaultPatternFor, nextOf30h } from "@/lib/nox/shift/staff-place";

export type PlaceArgs = { patternId: string; startHm: string; endHm: string };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "6px 8px", fontSize: 12.5 };

export default function StaffPlaceForm({ staffName, patterns, wishPatternIds, placedPatternIds, disabled = false, busy = false, onPlace }: {
  /** 選択中のスタッフ名（見出し用） */
  staffName: string;
  /** その日に有効な枠（effectivePatterns 済み） */
  patterns: Pattern[];
  /** その人のその日の ◯ 希望の枠 id（既定の枠に使う・バッジ） */
  wishPatternIds: string[];
  /** その人がその日に配置済みの枠 id（同じ枠は再配置できない） */
  placedPatternIds: string[];
  disabled?: boolean;
  busy?: boolean;
  onPlace: (args: PlaceArgs) => void | Promise<void>;
}) {
  const [patternId, setPatternId] = useState<string | null>(() => defaultPatternFor(patterns.map((p) => p.id), wishPatternIds));
  const pat = patterns.find((p) => p.id === patternId) ?? null;
  const [start, setStart] = useState(pat?.start_hm ?? "18:00");
  const [endBase, setEndBase] = useState(() => { const m = pat ? hm2min(pat.end_hm) : 1380; return min2hm(m >= 1440 ? m - 1440 : m); });
  const [next, setNext] = useState(() => (pat ? hm2min(pat.end_hm) >= 1440 : false));
  const pickPattern = (p: Pattern) => {
    setPatternId(p.id); setStart(p.start_hm);
    const m = hm2min(p.end_hm); setNext(m >= 1440); setEndBase(min2hm(m >= 1440 ? m - 1440 : m));
  };
  const endMin = hm2min(endBase) + (next ? 1440 : 0);
  const endHm = min2hm(endMin);
  const invalid = endMin <= hm2min(start);
  const adjusted = !!pat && (start !== pat.start_hm || endHm !== pat.end_hm);
  const already = !!patternId && placedPatternIds.includes(patternId);

  return (
    <div>
      <b style={{ fontSize: 13 }}><span style={{ color: "var(--champ)" }}>{staffName}</span> を配置</b>
      {patterns.length === 0 && <p style={{ fontSize: 12, color: "var(--sub)", margin: "6px 0 0" }}>この日に有効な枠がありません（マスタ ▸ 黒服の勤務パターンで枠を作ってください）。</p>}
      {patterns.length > 0 && (
        <>
          <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "6px 0 4px" }}>枠を選ぶ（時刻は枠から写します）</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {patterns.map((p) => {
              const sel = p.id === patternId;
              const wished = wishPatternIds.includes(p.id);
              return (
                <button key={p.id} type="button" aria-pressed={sel} disabled={disabled || busy} onClick={() => pickPattern(p)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5,
                    background: sel ? "var(--goldface2)" : "var(--card2)", border: sel ? "1px solid var(--gold)" : "1px solid var(--line)", color: sel ? "var(--champ)" : "var(--ink)",
                  }}>
                  <b>{p.name}</b>
                  <span className="num" style={{ color: "var(--sub)" }}>{p.start_hm}〜{fmtEnd30(p.end_hm)}</span>
                  {wished && <span className="nox-stpill" style={{ color: "var(--blue)" }}>希望</span>}
                  {placedPatternIds.includes(p.id) && <span className="nox-stpill ok">配置済み</span>}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
            <span style={t.fieldLabel}>開始</span>
            <input type="time" value={start} disabled={disabled || busy} onChange={(e) => { setStart(e.target.value); setNext(nextOf30h(e.target.value, endBase)); }} style={{ ...input, maxWidth: 108 }} aria-label="開始" />
            <span style={t.fieldLabel}>終了</span>
            <input type="time" value={endBase} disabled={disabled || busy} onChange={(e) => { setEndBase(e.target.value); setNext(nextOf30h(start, e.target.value)); }} style={{ ...input, maxWidth: 108 }} aria-label="終了" />{/* ★X2-3: 翌日は自動判定 */}
            <label style={{ fontSize: 12.5, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={next} disabled={disabled || busy} onChange={(e) => setNext(e.target.checked)} />翌日
            </label>
          </div>
          <p style={{ fontSize: 11, color: adjusted ? "var(--gold2)" : "var(--v2-muted)", margin: "6px 0 0" }}>
            {invalid ? "終了は開始より後にしてください（日跨ぎは「翌日」をオン）"
              : adjusted ? `枠の時刻（${pat!.start_hm}〜${fmtEnd30(pat!.end_hm)}）と違うため、配置後に例外として上書きします（監査に残ります）`
              : "枠の時刻のまま配置します（配置後の変更は「時刻を上書き」）"}
          </p>
          {already && <p style={{ fontSize: 11, color: "var(--bad)", margin: "6px 0 0" }}>この枠にはすでに配置済みです（別の枠を選ぶか、配置済みの行を取り消してください）。</p>}
          <div className="nox-actions" style={{ marginTop: 10 }}>
            <button type="button" style={btnDark} disabled={disabled || busy || !patternId || invalid || already}
              onClick={() => { if (patternId) void onPlace({ patternId, startHm: start, endHm }); }}>
              {busy ? "配置中…" : "配置"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
