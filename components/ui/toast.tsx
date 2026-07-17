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
import { useState } from "react";

/** msg state の定型（useState<string | null> の 27 箇所複製を畳む）。setMsg(null) で消える。 */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  return { msg, setMsg };
}

export default function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p style={{ fontSize: 13, color: "var(--sub)" }}>{msg}</p>;
}
