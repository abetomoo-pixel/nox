"use client";

// ★便 X-13a（X-13-4／X-13-5・2026-10-08）: 写真の「現在・変更・削除」の共通部品＝キャスト詳細（casts-board）とスタッフ編集（staff-board）で同じ経路。
//   直接 pick 型（label＋hidden file input→onPick）に統一＝旧キャスト詳細のプレビュー付きモーダル経路は撤去（重複経路を整理）。
//   縮小・Storage・打刻は呼び出し側（uploadCastPhoto／uploadUserPhoto＝lib）＝ここは表示だけ。
//   ★デモ org（裁定328・dg(6-4)）: 導線を隠すのではなく「表示するが無効」（disabled＋理由）＝目視で部品の所在が分かる。真の防御は storage policy。
import CastAvatar from "./cast-avatar";

export function photoEditLabelOf(hasPhoto: boolean, busy: boolean): string {
  return busy ? "処理中…" : hasPhoto ? "写真を変更" : "写真を登録";
}

export default function PhotoEdit({ name, url, hasPhoto, busy = false, disabled = false, disabledReason, size = 56, layout = "row", note, onPick, onRemove }: {
  name: string; url?: string | null; hasPhoto: boolean; busy?: boolean;
  /** true＝表示するが無効（デモ org など）。理由は disabledReason に */
  disabled?: boolean; disabledReason?: string;
  size?: number; layout?: "row" | "col"; note?: string;
  onPick: (file: File) => void; onRemove?: () => void;
}) {
  const off = disabled || busy;
  return (
    <div className="nox-photoedit-wrap" style={layout === "col" ? { display: "flex", flexDirection: "column", alignItems: "center", gap: 6 } : { display: "flex", alignItems: "center", gap: 12 }}>
      <CastAvatar name={(name ?? "").trim() || "?"} url={url ?? undefined} size={size} />
      <div style={{ display: "flex", flexDirection: layout === "col" ? "row" : "column", gap: layout === "col" ? 6 : 4, alignItems: layout === "col" ? "center" : "flex-start", flexWrap: "wrap", justifyContent: "center" }}>
        <label title={disabled ? disabledReason : undefined} aria-disabled={off}>
          <span className="nox-photoedit" style={{ cursor: off ? "not-allowed" : "pointer", opacity: off ? 0.5 : 1 }}>{photoEditLabelOf(hasPhoto, busy)}</span>
          <input type="file" accept="image/*" disabled={off} onChange={(e) => { const f = e.target.files?.[0] ?? null; e.target.value = ""; if (f) onPick(f); }} style={{ display: "none" }} />
        </label>
        {hasPhoto && onRemove && (
          <button type="button" className="nox-photoedit" disabled={off} title={disabled ? disabledReason : undefined} style={{ opacity: off ? 0.5 : 1 }} onClick={() => onRemove()}>写真を削除</button>
        )}
        {disabled && disabledReason && <span style={{ fontSize: 11, color: "var(--sub)", width: layout === "col" ? "100%" : undefined, textAlign: "center" }}>{disabledReason}</span>}
        {!disabled && note && <span style={{ fontSize: 11, color: "var(--sub)" }}>{note}</span>}
      </div>
    </div>
  );
}
