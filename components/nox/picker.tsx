"use client";

// ★裁定254（2026-09-14・R8）: 検索欄＋一覧から 1 件選ぶ汎用ピッカー。cast-picker.tsx と同流儀（検索は部分一致・並びは名前順固定・
//   表示と選択の UI だけを持つ純部品＝RPC・選択の意味づけは呼び出し側）だが、キャスト専用型（PickerCast・出勤バッジ等）に依存しない。
//   件数が多いときは入力で絞り込み、未入力時は先頭 limit 件だけを出す（全件描画で重くしない）。
//   cast-picker.tsx は置き換えない（回帰回避・将来の統合は別レーン）。新トークン 0。
// ★裁定259-a（2026-09-17）: onClear（× で null に戻す＝select の value='' 相当）と disabled（入力不可・× 非表示・
//   見た目は .nox-input:disabled と同じ opacity .55／not-allowed）の 2 props を追加。両方とも省略可＝省略時は従来と同一挙動。
//   選択中の項目が絞り込み／先頭 limit で一覧に出ていないときは「選択中: ラベル」を一覧の上に出す（× もそこに出る）。
//   キーボード: 検索欄と各候補は素の input／button＝Tab で到達・Enter／Space で確定（新しいキー処理は持たない）。
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
  items, value, onPick, onClear, disabled = false, placeholder = "検索", empty = "該当がありません", limit = 30, dense = false,
}: {
  items: PickerItem[];
  /** 選択中の id（未選択は null） */
  value: string | null;
  onPick: (id: string) => void;
  /** ★259-a: 渡すと選択中の項目の右に × を出し、押すと呼ぶ（呼び出し側で null／'' に戻す）。渡さなければ解除の口は無い（先頭既定型） */
  onClear?: () => void;
  /** ★259-a: 入力不可（検索欄・候補とも押せない・× 非表示） */
  disabled?: boolean;
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
  const selected = value ? items.find((it) => it.id === value) ?? null : null;
  const selectedShown = !!selected && shown.some((it) => it.id === selected.id);
  const clearBtn = onClear && !disabled ? (
    <button
      type="button"
      aria-label="選択を解除"
      title="選択を解除"
      onClick={(e) => { e.stopPropagation(); onClear(); }}
      style={{ ...t.btnGhost, ...t.btnSm, padding: "2px 8px", lineHeight: 1.2, fontSize: 12 }}
    >×</button>
  ) : null;

  return (
    <div style={disabled ? { opacity: 0.55, cursor: "not-allowed" } : undefined} aria-disabled={disabled || undefined}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        disabled={disabled}
        style={{ ...t.input, width: "100%", marginBottom: 8, cursor: disabled ? "not-allowed" : undefined }}
      />
      {selected && !selectedShown && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12, color: "var(--champ)", fontWeight: 700 }}>
          <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>選択中: {selected.label}</span>
          {clearBtn}
        </div>
      )}
      <div style={{ display: "grid", gap: 6, maxHeight: dense ? 220 : 300, overflowY: "auto" }}>
        {shown.map((it) => {
          const sel = it.id === value;
          return (
            <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={() => onPick(it.id)}
                aria-pressed={sel}
                disabled={disabled}
                style={{
                  display: "flex", alignItems: "center", gap: 10, textAlign: "left", flex: 1, minWidth: 0,
                  padding: dense ? "6px 10px" : "8px 12px", borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit",
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
              {sel && clearBtn}
            </div>
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
