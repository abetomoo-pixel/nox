// ★2026-11-13（相談役【3】a・通しの確かめの C）: /mine の打刻の直後に、古い状態（「出勤打刻がありません」「レジ：出勤中だけ使えます」）が数秒見える件の直し。
//   打刻が通ったら、読み直し（router.refresh）が終わるまで、ボタンと補助文は打刻の後の状態で先に描き、サーバーで描いた行は「反映中…」に替える（C-2 と同じ直し方）。
import type { PunchState } from "./punch-state";

export const PUNCH_PENDING_EVENT = "nox-punch-pending";
export const PUNCH_PENDING_TEXT = "反映中…";

/** 打刻が通った後の状態（出勤→出勤中・退勤→退勤済み） */
export function punchStateAfterOf(type: "in" | "out"): PunchState {
  return type === "in" ? "open" : "closed";
}

/** 画面に出す状態＝先に描いた状態があり、サーバーの状態がまだ打刻の前のままならそれを使う（サーバーが追いついたら外す） */
export function punchStateShownOf(server: PunchState, optimistic: { from: PunchState; to: PunchState } | null): PunchState {
  return optimistic && server === optimistic.from ? optimistic.to : server;
}
