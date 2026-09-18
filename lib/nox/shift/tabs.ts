// ★裁定274（R15・2026-09-18）: シフト画面のタブ＝5→3（今日／作る／確定）。
//   旧 5 キー（today／queue／build／calendar／roster）は**内部識別子として据え置き**＝shift-board の state・setTab の呼び出し・
//   各パネルの分岐・深リンク（他タブからの setTab("queue") 等）は 1 文字も変えない。3 タブは旧キーの上に被せる「見え方」だけ。
//   語は 3 語固定（公開＝計画期間の公開／承認＝行の承認／確定＝承認済み行の一覧）。status 拡張・既読と同意の分離は第 2 期。
export type ShiftTab = "today" | "queue" | "build" | "calendar" | "roster";
export type ShiftView = "today" | "make" | "confirm";

/** 3 タブ（表示順） */
export const SHIFT_VIEWS: ReadonlyArray<readonly [ShiftView, string]> = [
  ["today", "今日"],
  ["make", "作る"],
  ["confirm", "確定"],
] as const;

/** 各タブの中の 2 択（.nox-seg）。today は 1 択＝seg を出さない。旧キー→ラベルは従来の 5 タブと同じ語。 */
export const VIEW_TABS: Record<ShiftView, ReadonlyArray<readonly [ShiftTab, string]>> = {
  today: [["today", "今日"]],
  make: [["build", "作成"], ["calendar", "仮シフト"]],
  confirm: [["queue", "承認待ち"], ["roster", "確定シフト"]],
};

/** 旧キー 5 本（深リンク・state の写像元＝1 本も落とさない） */
export const LEGACY_SHIFT_TABS: ReadonlyArray<ShiftTab> = ["today", "queue", "build", "calendar", "roster"];

/** 旧キー → 3 タブ */
export function viewOfTab(tab: ShiftTab): ShiftView {
  if (tab === "today") return "today";
  if (tab === "build" || tab === "calendar") return "make";
  return "confirm";
}

/** 3 タブを押したときの旧キー＝現在のキーがそのタブの中なら据え置き・外なら先頭（作る→作成／確定→承認待ち） */
export function tabOfView(view: ShiftView, current?: ShiftTab): ShiftTab {
  const tabs = VIEW_TABS[view];
  if (current && tabs.some(([k]) => k === current)) return current;
  return tabs[0][0];
}
