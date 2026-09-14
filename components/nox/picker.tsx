"use client";

// ★裁定254（2026-09-14・R8）: 検索欄＋一覧から 1 件選ぶ汎用ピッカー。cast-picker.tsx と同流儀（検索は部分一致・並びは名前順固定・
//   表示と選択の UI だけを持つ純部品＝RPC・選択の意味づけは呼び出し側）だが、キャスト専用型（PickerCast・出勤バッジ等）に依存しない。
//   件数が多いときは入力で絞り込み、未入力時は先頭 limit 件だけを出す（全件描画で重くしない）。
//   cast-picker.tsx は置き換えない（回帰回避・将来の統合は別レーン）。新トークン 0。
import { useMemo, useState } from "react";
import CastAvatar from "@/components/ui/cast-avatar";
import * as t from "@/lib/nox/ui/theme";

export type PickerItem = {
  id: string;
  label: string;
  /** 補助表示（ふりがな・種別・価格など）。検索対象にも含める */
  sublabel?: string;
  /** 頭文字アバターを出すか（写真 URL があれば url・無ければ label の頭文字） */
  avatar?: { url?: string } | true;
};

export default function Picker({
  items, value, onPick, placeholder = "検索", empty = "該当がありません", limit = 30, dense = false,
}: {
  items: PickerItem[];
  /** 選択中の id（未選択は null） */
  value: string | null;
  onPick: (id: string) => void;
  placeholder?: string;
  /** 候補 0 件のときの文言 */
  empty?: string;
  /** 未入力時に出す先頭件数（入力で絞り込んだときは全件） */
  limit?: number;
  dense?: boolean;
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const sorted = useMemo(() => [...items].sort((a, b) => a.label.localeCompare(b.label, "ja")), [items]);
  const shown = useMemo(() => {
    if (needle === "") return sorted.slice(0, limit);
    return sorted.filter((it) => it.label.toLowerCase().includes(needle) || (it.sublabel ?? "").toLowerCase().includes(needle));
  }, [sorted, needle, limit]);
  const hidden = needle === "" ? Math.max(0, sorted.length - shown.length) : 0;

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        style={{ ...t.input, width: "100%", marginBottom: 8 }}
      />
      <div style={{ display: "grid", gap: 6, maxHeight: dense ? 220 : 300, overflowY: "auto" }}>
        {shown.map((it) => {
          const sel = it.id === value;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onPick(it.id)}
              aria-pressed={sel}
              style={{
                display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                padding: dense ? "6px 10px" : "8px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                // 選択状態は cast-picker と同言語（--goldface2 地＋gold 枠＋champ 文字）
                background: sel ? "var(--goldface2)" : "var(--card2)",
                border: sel ? "1px solid var(--gold)" : "1px solid var(--line)",
                color: sel ? "var(--champ)" : "var(--ink)",
              }}
            >
              {it.avatar && <CastAvatar name={it.label} url={it.avatar === true ? undefined : it.avatar.url} size={dense ? 26 : 32} />}
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{it.label}</span>
                {it.sublabel && <span style={{ display: "block", fontSize: 11, color: "var(--sub)", lineHeight: 1.3 }}>{it.sublabel}</span>}
              </span>
              {sel && <span style={{ fontSize: 11, color: "var(--champ)", fontWeight: 800 }}>選択中</span>}
            </button>
          );
        })}
        {shown.length === 0 && <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>{empty}</p>}
      </div>
      {hidden > 0 && (
        <p style={{ fontSize: 11, color: "var(--sub)", margin: "6px 0 0" }}>先頭 {shown.length} 件を表示中（他 {hidden} 件は検索で絞り込めます）</p>
      )}
    </div>
  );
}
