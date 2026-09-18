"use client";

// 共通メッセージ表示（D-2 共通部品化 2026-07-17）。
// ★名前は toast だが「浮かぶ通知」ではない: 現状 27 箇所すべてがカード内に差し込む inline の <p> で、
//   D-2 は視覚を 1px も変えない回なので、その最多数派（9 箇所）の見た目をそのまま既定にした。
//   浮遊トーストへ寄せるかは見た目の変更＝D-3 以降の裁定（ここでは判断しない）。
// 既定 = <p style={{ fontSize: 13, color: "var(--sub)" }}>（casts-board / comp-master / master-board /
//   notices-board / incentive-panel / shift-board / staff-board / punch-actions / report-board の 9 箇所と同値）。
// 置換しないもの（＝現状のまま各画面が持つ・無理に寄せない）:
//   - 成否で色を出し分ける箇所（msg.startsWith("エラー") ? bad : ok 等）＝13 箇所。色の判定条件が画面ごとに違い、
//     部品化すると条件を prop で持ち回るだけになって複製が消えない。
//   - fontSize が既定と違う箇所（register-board 12 / reservation-panel 12.5）＝寄せると視覚が変わる。
//   - <span> でインライン配置している箇所（attendance-form / wish-form）＝要素型が変わると行内レイアウトが動く。
//
// ★裁定281（2026-09-18・便 T／U）: 種別つきの共通部品 Message を同じファイルに足す（既存 Toast は据え置き＝置換は便 U で進める）。
//   281-1 種別 4 つ error／success／warn／info・色は既存トークンのみ（--danger 系／--success 系／--warning 系／--line2・--card2）。
//   281-2 error＝赤枠＋薄い赤地＋赤系文字＋先頭「！」・success「✓」・warn「△」＝色だけで区別しない。
//   281-5 error は role="alert"・success／info（warn も）は role="status"。長文は折り返し・横はみ出し 0（overflow-wrap）。
//   種別→記号／role／トークンの写像は純関数（messagePrefix／messageRole／messageTokens）＝suite で係留。
import { useState, type CSSProperties, type ReactNode } from "react";

/** msg state の定型（useState<string | null> の 27 箇所複製を畳む）。setMsg(null) で消える。 */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  return { msg, setMsg };
}

export default function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p style={{ fontSize: 13, color: "var(--sub)" }}>{msg}</p>;
}

export type MessageKind = "error" | "success" | "warn" | "info";

/** 281-2: 先頭の記号（info は無し） */
export function messagePrefix(kind: MessageKind): string {
  return kind === "error" ? "！" : kind === "success" ? "✓" : kind === "warn" ? "△" : "";
}
/** 281-5: error は alert・それ以外は status */
export function messageRole(kind: MessageKind): "alert" | "status" {
  return kind === "error" ? "alert" : "status";
}
/** 281-1: 種別→トークン（枠／地／文字）。新トークン 0 */
export function messageTokens(kind: MessageKind): { border: string; bg: string; ink: string } {
  switch (kind) {
    case "error": return { border: "var(--danger-bd)", bg: "var(--danger-soft)", ink: "var(--danger-ink)" };
    case "success": return { border: "var(--success)", bg: "var(--success-soft)", ink: "var(--success)" };
    case "warn": return { border: "var(--warning)", bg: "var(--warning-soft)", ink: "var(--warning)" };
    default: return { border: "var(--line2)", bg: "var(--card2)", ink: "var(--ink)" };
  }
}

export function Message({ kind, children, onDismiss, style }: {
  kind: MessageKind; children: ReactNode; onDismiss?: () => void; style?: CSSProperties;
}) {
  const tk = messageTokens(kind);
  const prefix = messagePrefix(kind);
  return (
    <div role={messageRole(kind)} data-message-kind={kind} style={{
      display: "flex", alignItems: "flex-start", gap: 8, margin: "8px 0 0", padding: "8px 12px",
      border: `1px solid ${tk.border}`, background: tk.bg, color: tk.ink, borderRadius: 8,
      fontSize: 13, lineHeight: 1.6, maxWidth: "100%", overflowWrap: "anywhere", wordBreak: "break-word", ...style,
    }}>
      {prefix && <span aria-hidden="true" style={{ flexShrink: 0, fontWeight: 800 }}>{prefix}</span>}
      <span style={{ minWidth: 0, flex: 1 }}>{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="閉じる"
          style={{ flexShrink: 0, background: "transparent", border: 0, color: "inherit", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}>×</button>
      )}
    </div>
  );
}
