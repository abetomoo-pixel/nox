"use client";

// E8-1 ⑤（E8 裁定・レジ改善設計 v1 §⑤）: キャスト選択の共通部品 CastPicker。
// 検索（源氏名部分一致）＋写真グリッド（CastAvatar 大判）＋並び＝着卓中→本日出勤→その他＋バッジ。
// ★表示と選択の UI だけを持つ純部品＝金額・RPC・選択の意味づけ（単選/複選/重み）は呼び出し側の責務。
//   置換4箇所（指名料 select／按分チップ manage・kiosk／claimPick）＋タップ時モーダル（#8）で共用。
//   「本日出勤」は punches 由来の近似（呼び出し側が Set で渡す・表示順とバッジのみ＝金額に一切関与しない）。
import { useMemo, useState } from "react";
import CastAvatar from "./cast-avatar";
import * as t from "@/lib/nox/ui/theme";

export type PickerCast = { id: string; name: string };

export default function CastPicker({
  casts, photoUrls, seatedIds, todayIds, selectedIds, onPick, size = 44, dense = false,
}: {
  casts: PickerCast[];
  /** 署名 URL の Map（無い環境＝kiosk は頭文字アバターへ自動フォールバック） */
  photoUrls?: Map<string, string>;
  /** 着卓中（この伝票の指名・按分重み>0）＝最優先で先頭＋「着卓中」バッジ */
  seatedIds?: Set<string>;
  /** 本日出勤（最終打刻が 'in' の近似）＝2番手＋「出勤」バッジ */
  todayIds?: Set<string>;
  /** 選択中（単選でも Set で渡す） */
  selectedIds?: Set<string>;
  onPick: (id: string) => void;
  size?: number;
  dense?: boolean;
}) {
  const [q, setQ] = useState("");
  const sorted = useMemo(() => {
    const rank = (id: string) => (seatedIds?.has(id) ? 0 : todayIds?.has(id) ? 1 : 2);
    const needle = q.trim();
    return [...casts]
      .filter((c) => needle === "" || c.name.includes(needle))
      .sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, "ja"));
  }, [casts, q, seatedIds, todayIds]);

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="キャストを検索"
        aria-label="キャストを検索"
        style={{ ...t.input, width: "100%", maxWidth: 260, marginBottom: 8 }}
      />
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${dense ? 78 : 94}px, 1fr))`, gap: 8 }}>
        {sorted.map((c) => {
          const sel = selectedIds?.has(c.id) ?? false;
          const seated = seatedIds?.has(c.id) ?? false;
          const today = todayIds?.has(c.id) ?? false;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c.id)}
              aria-pressed={sel}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                padding: "9px 4px", borderRadius: 11, cursor: "pointer", fontFamily: "inherit",
                // 選択状態は .nox-chip.on と同言語（#1B1710 地＋gold 枠＋champ 文字）
                background: sel ? "#1B1710" : "var(--card2)",
                border: sel ? "1px solid var(--gold)" : "1px solid var(--line)",
                color: sel ? "var(--champ)" : "var(--ink)",
              }}
            >
              <CastAvatar name={c.name} url={photoUrls?.get(c.id)} size={size} />
              <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{c.name}</span>
              {(seated || today) && (
                <span style={{
                  ...t.tag, fontSize: 9.5, padding: "1px 7px",
                  color: seated ? "var(--gold2)" : "var(--ok)",
                  borderColor: seated ? "rgba(201, 162, 74, .45)" : "rgba(119, 186, 131, .45)",
                }}>
                  {seated ? "着卓中" : "出勤"}
                </span>
              )}
            </button>
          );
        })}
        {sorted.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--sub)", gridColumn: "1 / -1", margin: 0 }}>該当するキャストがいません</p>
        )}
      </div>
    </div>
  );
}
