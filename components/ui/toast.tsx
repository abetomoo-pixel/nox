"use client";

// 共通メッセージ表示（D-2 共通部品化 2026-07-17）。
// ★名前は toast だが「浮かぶ通知」ではない: カード内に差し込む inline の表示。
// ★裁定281（2026-09-18・便 T／U）: メッセージ表示の型を統一。
//   281-1 種別 4 つ error／success／warn／info・色は既存トークンのみ（--danger 系／--success 系／--warning 系／--line2・--card2）。
//   281-2 error＝赤枠＋薄い赤地＋赤系文字＋先頭「！」・success「✓」・warn「△」＝色だけで区別しない。
//   281-3 操作の結果は操作したボタンと同じカード内に出す（各画面の責務）。
//   281-4 error は自動で消さない。次の操作の開始・タブ切替・同じ枠への success 表示で消える（useClearOn／同一 state の上書き）。
//   281-5 error は role="alert"・success／info／warn は role="status"。長文は折り返し・横はみ出し 0（overflow-wrap）。
//   281-6 共通部品 1 本＝Message（kind 明示）。Toast（msg 1 本の従来型・27 箇所＋便 U で置換した箇所）は kind を文言から判定して Message を描く
//   （messageKindOf＝純関数・「失敗／エラー／できません…」→error・「しました／完了…」→success・他は info）。
//   種別→記号／role／トークン／文言→種別の写像は純関数＝verify:nox-messages で係留。
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

/** msg state の定型（useState<string | null> の複製を畳む）。setMsg(null) で消える。 */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  return { msg, setMsg };
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

/** 文言→種別（Toast＝msg 1 本の画面用）。error の語が 1 つでもあれば error（「保存に失敗しました」は error）→ 次に success の語 → 他は info */
// 生の RPC エラー語（'bad name'／'not open'／'forbidden'／'billing locked'／'merge_conflict:…' 等＝日本語化されずに出る画面がある）も error に倒す
const ERROR_WORDS = /失敗|エラー|できません|できない|不正|権限|見つかりません|超えて|不足|無効|拒否|重複|重なって|以上で|以下で|入力してください|選択してください|指定してください|してください|必要です|forbidden|denied|error|locked|停止しました|中止|競合|長すぎ|使えない|正しくありません|既に|残額があります|処理できません|^(bad|not|invalid|dup|already|missing|unknown|no) |mismatch|conflict|violates|required|inactive|exists|timeout|feature_disabled/;
const SUCCESS_WORDS = /しました|完了|済み|コピー|送りました|送信/;
export function messageKindOf(text: string): MessageKind {
  if (ERROR_WORDS.test(text)) return "error";
  if (SUCCESS_WORDS.test(text)) return "success";
  return "info";
}

/** 281-4: 依存（タブ・選択など）が変わったら error／msg を消す＝残留の解消を 1 箇所に */
export function useClearOn(dep: unknown, ...clears: Array<(v: null) => void>) {
  useEffect(() => { for (const c of clears) c(null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dep]);
}

export function Message({ kind, children, onDismiss, style, className }: {
  kind: MessageKind; children: ReactNode; onDismiss?: () => void; style?: CSSProperties; className?: string;
}) {
  const tk = messageTokens(kind);
  const prefix = messagePrefix(kind);
  return (
    <div role={messageRole(kind)} data-message-kind={kind} className={className} style={{
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

/** msg 1 本の従来型（kind は文言から判定・明示もできる）。null／空なら描かない */
export default function Toast({ msg, kind, style, className }: { msg: string | null; kind?: MessageKind; style?: CSSProperties; className?: string }) {
  if (!msg) return null;
  return <Message kind={kind ?? messageKindOf(msg)} style={style} className={className}>{msg}</Message>;
}
