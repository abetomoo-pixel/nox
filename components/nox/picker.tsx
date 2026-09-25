"use client";

// ★裁定254（2026-09-14・R8）: 検索欄＋一覧から 1 件選ぶ汎用ピッカー。cast-picker.tsx と同流儀（検索は部分一致・並びは名前順固定・
//   表示と選択の UI だけを持つ純部品＝RPC・選択の意味づけは呼び出し側）だが、キャスト専用型（PickerCast・出勤バッジ等）に依存しない。
//   件数が多いときは入力で絞り込み、未入力時は先頭 limit 件だけを出す（全件描画で重くしない）。
//   cast-picker.tsx は置き換えない（回帰回避・将来の統合は別レーン）。新トークン 0。
// ★裁定259-a（2026-09-17）: onClear（× で null に戻す＝select の value='' 相当）と disabled（入力不可・× 非表示・
//   見た目は .nox-input:disabled と同じ opacity .55／not-allowed）の 2 props を追加。両方とも省略可＝省略時は従来と同一挙動。
//   選択中の項目が絞り込み／先頭 limit で一覧に出ていないときは「選択中: ラベル」を一覧の上に出す（× もそこに出る）。
//   キーボード: 検索欄と各候補は素の input／button＝Tab で到達・Enter／Space で確定。
// ★裁定301（2026-09-25）: 折りたたみ型。候補が PICKER_COLLAPSE_AT（9）件以上なら既定で畳む＝選択中の 1 行（チップ・×）＋検索欄のみ。
//   検索欄のフォーカス／入力でリストを下に開く（絶対配置＝親のフォーム行の高さに影響しない・最大 8 行＋「他 n 名・絞り込んでください」）。
//   Escape・外側クリック・選択で閉じる。↑↓ Enter・aria-expanded。8 件以下は従来どおり全展開＝prop 追加なし（閾値は lib/nox/ui/picker-view.ts の定数）。
import { useEffect, useId, useMemo, useRef, useState } from "react";
import CastAvatar from "@/components/ui/cast-avatar";
import * as t from "@/lib/nox/ui/theme";
import { collapsedOf, moreLabelOf, nextActiveOf, openSliceOf } from "@/lib/nox/ui/picker-view";

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
  // ★301: 折りたたみ型の開閉と ↑↓ の位置（全展開のときは使わない）
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const collapsed = collapsedOf(items.length);
  const needle = q.trim().toLowerCase();
  const sorted = useMemo(() => [...items].sort((a, b) => a.label.localeCompare(b.label, "ja")), [items]);
  const shown = useMemo(() => {
    if (needle === "") return sorted.slice(0, limit);
    return sorted.filter((it) => it.label.toLowerCase().includes(needle) || (it.sublabel ?? "").toLowerCase().includes(needle));
  }, [sorted, needle, limit]);
  const hidden = needle === "" ? Math.max(0, sorted.length - shown.length) : 0;
  const selected = value ? items.find((it) => it.id === value) ?? null : null;
  const selectedShown = !!selected && shown.some((it) => it.id === selected.id);
  const { rows, more } = openSliceOf(shown);

  // ★301-1: 外側クリックで閉じる（折りたたみ型が開いているときだけ listener を付ける）
  useEffect(() => {
    if (!collapsed || !open) return;
    const onDoc = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) { setOpen(false); setActive(-1); } };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [collapsed, open]);

  const pick = (id: string) => {
    onPick(id);
    if (collapsed) { setOpen(false); setQ(""); setActive(-1); }
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!collapsed) return;
    if (e.key === "Escape") { setOpen(false); setActive(-1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => nextActiveOf(a, 1, rows.length)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setOpen(true); setActive((a) => nextActiveOf(a, -1, rows.length)); }
    else if (e.key === "Enter") { if (open && active >= 0 && rows[active]) { e.preventDefault(); pick(rows[active].id); } }
  };

  const clearBtn = onClear && !disabled ? (
    <button
      type="button"
      aria-label="選択を解除"
      title="選択を解除"
      onClick={(e) => { e.stopPropagation(); onClear(); }}
      style={{ ...t.btnGhost, ...t.btnSm, padding: "2px 8px", lineHeight: 1.2, fontSize: 12 }}
    >×</button>
  ) : null;

  const itemButton = (it: PickerItem, isActive = false) => {
    const sel = it.id === value;
    return (
      <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          type="button"
          role={collapsed ? "option" : undefined}
          aria-selected={collapsed ? sel : undefined}
          onClick={() => pick(it.id)}
          aria-pressed={collapsed ? undefined : sel}
          disabled={disabled}
          style={{
            display: "flex", alignItems: "center", gap: 10, textAlign: "left", flex: 1, minWidth: 0,
            padding: dense ? "6px 10px" : "8px 12px", borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit",
            // 選択状態は cast-picker と同言語（--goldface2 地＋gold 枠＋champ 文字）。↑↓ の位置は line2 枠で示す
            background: sel ? "var(--goldface2)" : "var(--card2)",
            border: sel ? "1px solid var(--gold)" : isActive ? "1px solid var(--champ)" : "1px solid var(--line)",
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
        {sel && !collapsed && clearBtn}
      </div>
    );
  };

  if (collapsed) {
    // ★301-1／301-2: 選択中の 1 行（チップ・×）＋検索欄。開いたリストは絶対配置（親の高さ不変）
    return (
      <div ref={rootRef} style={{ position: "relative", ...(disabled ? { opacity: 0.55, cursor: "not-allowed" } : {}) }} aria-disabled={disabled || undefined}>
        {selected && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12, color: "var(--champ)", fontWeight: 700 }}>
            <span className="nox-stpill" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>選択中: {selected.label}</span>
            {clearBtn}
          </div>
        )}
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && !disabled}
          aria-controls={listId}
          disabled={disabled}
          style={{ ...t.input, width: "100%", marginBottom: 0, cursor: disabled ? "not-allowed" : undefined }}
        />
        {open && !disabled && (
          <div id={listId} role="listbox" style={{
            position: "absolute", left: 0, right: 0, top: "100%", marginTop: 4, zIndex: 30,
            background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "var(--shadow)",
            padding: 6, display: "grid", gap: 6, maxHeight: dense ? 220 : 300, overflowY: "auto",
          }}>
            {rows.map((it, i) => itemButton(it, i === active))}
            {rows.length === 0 && <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>{empty}</p>}
            {moreLabelOf(more) && <p style={{ fontSize: 11, color: "var(--sub)", margin: "4px 2px 0" }}>{moreLabelOf(more)}</p>}
          </div>
        )}
      </div>
    );
  }

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
        {shown.map((it) => itemButton(it))}
        {shown.length === 0 && <p style={{ fontSize: 12, color: "var(--sub)", margin: 0 }}>{empty}</p>}
      </div>
      {hidden > 0 && (
        <p style={{ fontSize: 11, color: "var(--sub)", margin: "6px 0 0" }}>先頭 {shown.length} 件を表示中（他 {hidden} 件は検索で絞り込めます）</p>
      )}
    </div>
  );
}
