// ★裁定274（R15・2026-09-18）: シフト画面のタブ＝5→3（今日／作る／確定）。
//   旧 5 キー（today／queue／build／calendar／roster）は**内部識別子として据え置き**＝shift-board の state・setTab の呼び出し・
//   各パネルの分岐・深リンク（他タブからの setTab("queue") 等）は 1 文字も変えない。3 タブは旧キーの上に被せる「見え方」だけ。
// ★裁定406（2026-10-22・便 SH-UI-b）: 上段＝今日／シフト作成／確定シフト。「シフト作成」は手順 4 段＝①期間を作る（build）②提出一覧（submit）
//   ③シフト配置（queue＝承認リスト＋月カレンダー）④公開シフト（publish＝カレンダー＋不足日＋公開）。確定シフト＝roster（期間を選んでカレンダー）。
//   旧 calendar（仮シフト）は ③ の中に収まる（深リンク setTab("calendar") は ③ として描く）。新キー submit／publish を足した（計 7 キー）。
export type ShiftTab = "today" | "queue" | "build" | "calendar" | "roster" | "submit" | "publish";
export type ShiftView = "today" | "make" | "fixed";

/** 3 タブ（表示順）＝裁定406 の語 */
export const SHIFT_VIEWS: ReadonlyArray<readonly [ShiftView, string]> = [
  ["today", "今日"],
  ["make", "シフト作成"],
  ["fixed", "確定シフト"],
] as const;

/** 各タブの中の段。today・fixed は 1 択（手順を出さない）。make＝4 手順（番号つき） */
export const VIEW_TABS: Record<ShiftView, ReadonlyArray<readonly [ShiftTab, string]>> = {
  today: [["today", "今日"]],
  make: [["build", "期間を作る"], ["submit", "提出一覧"], ["queue", "シフト配置"], ["publish", "公開シフト"]],
  fixed: [["roster", "確定シフト"]],
};

/** 旧キー 5 本＋406 の 2 本（深リンク・state の写像元＝1 本も落とさない） */
export const LEGACY_SHIFT_TABS: ReadonlyArray<ShiftTab> = ["today", "queue", "build", "calendar", "roster", "submit", "publish"];

/** 旧キー → 3 タブ */
export function viewOfTab(tab: ShiftTab): ShiftView {
  if (tab === "today") return "today";
  if (tab === "roster") return "fixed";
  return "make";
}

/** 3 タブを押したときのキー＝現在のキーがそのタブの中なら据え置き・外なら先頭（シフト作成→期間を作る／確定シフト→roster） */
export function tabOfView(view: ShiftView, current?: ShiftTab): ShiftTab {
  const tabs = VIEW_TABS[view];
  const cur = current === "calendar" ? "queue" : current; // 旧 calendar は ③ の中
  if (cur && tabs.some(([k]) => k === cur)) return cur;
  return tabs[0][0];
}

/** ★裁定406: 手順の番号（1〜4）。make 以外・未知は null。旧 calendar＝③ */
export function stepOfTab(tab: ShiftTab): 1 | 2 | 3 | 4 | null {
  const t = tab === "calendar" ? "queue" : tab;
  const i = VIEW_TABS.make.findIndex(([k]) => k === t);
  return i < 0 ? null : ((i + 1) as 1 | 2 | 3 | 4);
}
export function tabOfStep(step: number | string | null | undefined): ShiftTab {
  const n = Number(step);
  return VIEW_TABS.make[Math.min(4, Math.max(1, Number.isInteger(n) ? n : 1)) - 1][0];
}
/** URL（/shift?tab=make&step=3&period=<id>）→ 内部キー。tab が無い・不明は today */
export function tabFromSearch(search: string): ShiftTab {
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const v = sp.get("tab");
  if (v === "make") return tabOfStep(sp.get("step"));
  if (v === "fixed") return "roster";
  return "today";
}
/** 内部キー → URL のクエリ（他のクエリは保持・ym 等）。period は渡されたときだけ */
export function searchOfTab(search: string, tab: ShiftTab, periodId?: string | null): string {
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const view = viewOfTab(tab);
  sp.set("tab", view);
  const step = stepOfTab(tab);
  if (view === "make" && step) sp.set("step", String(step)); else sp.delete("step");
  if (periodId) sp.set("period", periodId); else sp.delete("period");
  const s = sp.toString();
  return s ? `?${s}` : "";
}
